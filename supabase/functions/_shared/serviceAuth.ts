// The keys and the two caller checks every Supabase-touching function uses (lean K1).
//
// Supabase is replacing the legacy anon / service_role keys with publishable / secret keys, and a
// new project may have only the new ones. The runtime injects SUPABASE_PUBLISHABLE_KEYS and
// SUPABASE_SECRET_KEYS as JSON keyed by name, next to the legacy SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY. The key named `default` wins; the legacy one is the fallback. A
// variable that is missing, empty or not JSON is absent, and an absent key matches nothing.
//
// The timers (send-push, send-receipts, process-settlements) pass requireServiceRole(); the four
// user functions pass verifiedUser(). No token is ever decoded here: the auth server says who it is.
import { timingSafeEqual } from 'https://deno.land/std@0.224.0/crypto/timing_safe_equal.ts';

const encoder = new TextEncoder();

/** The key named `default` in a JSON key variable; '' when the variable is missing, empty or bad. */
function defaultKey(name: string): string {
  try {
    const value = JSON.parse(Deno.env.get(name) ?? '').default;
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const NEW_SECRET = defaultKey('SUPABASE_SECRET_KEYS');
const LEGACY_SECRET = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/** The server key for service_role calls: the new secret key first, else the legacy service key. */
export const SECRET_KEY = NEW_SECRET || LEGACY_SECRET;
/** The public key for calls made as the caller: the new publishable key first, else the legacy anon key. */
export const PUBLISHABLE_KEY = defaultKey('SUPABASE_PUBLISHABLE_KEYS') || (Deno.env.get('SUPABASE_ANON_KEY') ?? '');

/** What the log says when one of the two keys is missing: the variables it is read from. */
const SOURCES: Record<string, string> = {
  SECRET_KEY: 'SUPABASE_SECRET_KEYS.default or SUPABASE_SERVICE_ROLE_KEY',
  PUBLISHABLE_KEY: 'SUPABASE_PUBLISHABLE_KEYS.default or SUPABASE_ANON_KEY',
};

function refuse(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** null when every value is set; otherwise one log line naming what is missing (never a value) and the 500. */
export function notConfigured(fn: string, values: Record<string, string>): Response | null {
  const missing = Object.keys(values).filter((name) => !values[name]);
  if (missing.length === 0) return null;
  console.error(`${fn}: not configured: ${missing.map((name) => SOURCES[name] ?? name).join(', ')}`);
  return refuse('not configured', 500);
}

/** Headers for a service_role call. A new key goes on apikey alone (it is no JWT); the legacy JWT also as Bearer, which the gateway needs. */
export function serviceHeaders(): Record<string, string> {
  if (NEW_SECRET) return { apikey: SECRET_KEY, 'Content-Type': 'application/json' };
  return { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}`, 'Content-Type': 'application/json' };
}

/** Constant time. An empty key never matches, not even an empty header. */
function sameKey(given: string, key: string): boolean {
  const a = encoder.encode(given);
  const b = encoder.encode(key);
  const sameLength = a.byteLength === b.byteLength;
  // A wrong length still runs one full-length compare (against zeros), so timing never tells.
  const equal = timingSafeEqual(sameLength ? a : new Uint8Array(b.byteLength), b);
  return key.length > 0 && sameLength && equal;
}

/**
 * null when the request is a POST carrying a service key — the new default secret key or the legacy
 * service key, on `apikey` or as `Authorization: Bearer` — otherwise the 405 or 403 to send. Both
 * keys are accepted so staging's Vault (legacy) and a new project's (new) wake the same code.
 */
export function requireServiceRole(req: Request): Response | null {
  if (req.method !== 'POST') return refuse('method not allowed', 405);

  const auth = req.headers.get('Authorization') ?? '';
  const offered = [req.headers.get('apikey') ?? '', auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : ''];
  let matched = false;
  for (const given of offered) {
    for (const key of [NEW_SECRET, LEGACY_SECRET]) {
      matched = sameKey(given, key) || matched;
    }
  }
  return matched ? null : refuse('forbidden', 403);
}

export type Caller = { id: string; email: string | null };

/**
 * The signed-in caller, as the auth server reads the token (signature, expiry, session; the legacy
 * HS256 secret and the new signing keys alike). Only a 2xx holding a user id proves a caller, and id
 * and email come from that answer alone. A 401 or 403 is the function's sign-in sentence (401).
 * Anything else — another status, a 2xx without an id, no answer — is its try-again sentence (503)
 * and a log line with the status only: "cannot check" is never signed in and never signed out.
 */
export async function verifiedUser(req: Request, signIn: string, tryAgain: string): Promise<Caller | Response> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return refuse(signIn, 401);

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: PUBLISHABLE_KEY, Authorization: auth } });
  } catch {
    console.error('auth check: no answer');
    return refuse(tryAgain, 503);
  }
  if (res.status === 401 || res.status === 403) return refuse(signIn, 401);

  const user = res.ok ? ((await res.json().catch(() => null)) as { id?: unknown; email?: unknown } | null) : null;
  if (!user || typeof user.id !== 'string' || user.id === '') {
    console.error(`auth check: ${res.status}`);
    return refuse(tryAgain, 503);
  }
  return { id: user.id, email: typeof user.email === 'string' && user.email.includes('@') ? user.email : null };
}
