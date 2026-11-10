/**
 * 2026-09-26 (the refresh, audit M-21) — the pure half of Forgot password: the
 * redirect the reset email sends people to, reading the tokens off that link,
 * and the one flag that says a recovery is waiting for its new password. No
 * imports, so tests/passwordReset.test.mjs executes it directly. The calls to
 * Supabase live beside it in lib/passwordReset.ts.
 *
 * THE REDIRECT IS AN ALLOW-LISTED URL. Supabase refuses to send a user to a
 * redirect that is not on the project's Auth → URL Configuration list, so
 * `brazos://reset-password` must be added there (staging and production, by
 * the operator) — the local stack lists it in supabase/config.toml.
 */
export const PASSWORD_RESET_REDIRECT = 'brazos://reset-password';

export type RecoveryTokens = { accessToken: string; refreshToken: string };

/**
 * The tokens a reset link carries, or null when the URL is not a reset link.
 * Supabase's implicit flow puts them in the fragment —
 * `brazos://reset-password#access_token=…&refresh_token=…&type=recovery` — and
 * a link without `type=recovery` is not a recovery, whatever else it carries.
 */
export function parseRecoveryLink(url: string): RecoveryTokens | null {
  if (!url.toLowerCase().startsWith(PASSWORD_RESET_REDIRECT)) return null;
  const hash = url.indexOf('#');
  const query = url.indexOf('?');
  const raw = hash >= 0 ? url.slice(hash + 1) : query >= 0 ? url.slice(query + 1) : '';
  const params = new URLSearchParams(raw);
  if (params.get('type') !== 'recovery') return null;
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
}

/** The shortest password the form accepts — Supabase's own default minimum. */
export const MIN_PASSWORD_LENGTH = 6;

// ---- the one piece of state: a recovery is waiting for its new password ----
type Listener = (pending: boolean) => void;
let pending = false;
const listeners = new Set<Listener>();

export function isRecoveryPending(): boolean {
  return pending;
}

export function setRecoveryPending(next: boolean): void {
  if (pending === next) return;
  pending = next;
  listeners.forEach((listener) => listener(next));
}

export function subscribeRecovery(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** base64url -> UTF-8 text, or null when it is not valid base64url. No runtime APIs beyond the language. */
function decodeBase64Url(input: string): string | null {
  const clean = input.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!clean || /[^A-Za-z0-9+/]/.test(clean) || clean.length % 4 === 1) return null;
  let bits = 0;
  let acc = 0;
  let escaped = '';
  for (const ch of clean) {
    acc = (acc << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      escaped += '%' + ((acc >> bits) & 0xff).toString(16).padStart(2, '0');
    }
  }
  try {
    return decodeURIComponent(escaped);
  } catch {
    return null;
  }
}

/**
 * Whose reset a link is for: the `sub` (user id) and `email` claims in the access token's payload.
 * NOT a verification — supabase.auth.setSession verifies the token. This only lets the app see,
 * BEFORE calling setSession, that the link belongs to a different account than the one signed in,
 * so a crafted link cannot swap the signed-in account without the person agreeing to it.
 */
export function recoveryTokenSubject(accessToken: string): { sub: string; email: string | null } | null {
  const payload = accessToken.split('.')[1];
  if (!payload) return null;
  const text = decodeBase64Url(payload);
  if (!text) return null;
  try {
    const claims = JSON.parse(text) as { sub?: unknown; email?: unknown };
    if (typeof claims.sub !== 'string' || !claims.sub) return null;
    return { sub: claims.sub, email: typeof claims.email === 'string' && claims.email ? claims.email : null };
  } catch {
    return null;
  }
}

/**
 * Whether opening this link needs the person's say-so: someone is signed in, and the link is for
 * another account (or for one we cannot read - which is treated as another).
 */
export function recoveryNeedsConsent(
  signedInUserId: string | null | undefined,
  subject: { sub: string } | null
): boolean {
  if (!signedInUserId) return false;
  return !subject || subject.sub !== signedInUserId;
}

/** What to tell the person when a reset link could not be opened (expired, already used, malformed). */
export const RECOVERY_LINK_FAILED =
  'That reset link has expired or was already used. Request a new one from the sign-in screen and try again.';
