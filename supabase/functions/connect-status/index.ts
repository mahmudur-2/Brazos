// ============================================================================
// Brazos · connect-status  (Supabase Edge Function, Deno)
//
// The on-demand truth about a worker's payout account. The client calls it on
// the payouts screen and when the worker returns from hosted onboarding; it
// reads the provider's Account object, classifies it into the ONE app-facing
// state (classify.mjs), records that state through set_payouts_status(), and
// returns it. There is no connected-account webhook (R5b D3): this call is
// the only way payouts_status moves after onboarding.
//
//   Deploy:  the staging pipeline deploys every function directory on push.
//
// ---------------------------------------------------------------------------
// NO EDGE FUNCTION COMPUTES A MONETARY AMOUNT
// ---------------------------------------------------------------------------
// Nothing here is money. payouts_enabled — which process-settlements reads
// before it transfers — is DERIVED by the database from the state recorded
// here (= 'enabled'), and 'enabled' is claimed only when the provider reports
// the stripe_transfers capability active. Every other shape lands somewhere
// harmless (classify.mjs).
//
// ---------------------------------------------------------------------------
// WHO IS ALLOWED — THE DATABASE DECIDES WHO IS CALLING, AS IN create-payment
// ---------------------------------------------------------------------------
// The caller's own Authorization header is forwarded to PostgREST with the
// ANON key as apikey and my_payouts_status() runs AS THE CALLER: PostgREST
// verifies the token's signature with the project's secret, so a forged or
// expired token is refused here even if the platform's JWT check were ever
// switched off on the dashboard. Only then are the token's claims read,
// locally. get_payment_account / set_payouts_status are service_role; the
// RPC grants are the real defence, as always.
//
// WHY plain fetch: same reason as create-payment. No SDK, no import map, no
// version drift. The /v2/ call sends a pinned Stripe-Version.
// ============================================================================

import { classifyAccount } from './classify.mjs';

const STRIPE_API = 'https://api.stripe.com';

// Accounts v2 pins an exact API version per request. The account's configured
// version, the same string create-payment pins on /v1/ephemeral_keys.
const STRIPE_V2_VERSION = '2026-08-26.dahlia';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

type Caller = { userId: string; status: string };

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function serviceHeaders(): Record<string, string> {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
}

/** A service_role RPC: writes no client may make. */
async function serviceRpc(fn: string, args: Record<string, unknown>): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify(args),
  });
}

/** A /v2/ provider call. JSON body, pinned Stripe-Version, an idempotency key
 * when one is given. The sibling of create-payment's form-encoded v1 helper. */
async function stripeV2(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>,
  idempotencyKey?: string
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    'Stripe-Version': STRIPE_V2_VERSION,
  };
  if (body) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body: parsed };
}

/** The provider's error, reduced to its type, code and message. Never the
 * whole response. */
function providerError(body: Record<string, unknown>): string {
  const err = (body.error ?? {}) as { type?: unknown; code?: unknown; message?: unknown };
  return [err.type, err.code, err.message]
    .filter((part) => typeof part === 'string' && part.length > 0)
    .join(' · ') || 'no error body';
}

/** The payload of a JWT, decoded and nothing more. Its authenticity is
 * established by PostgREST accepting the same token in resolveCaller(). */
function jwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Who is calling, as the DATABASE sees them. A Response is a refusal. */
async function resolveCaller(auth: string): Promise<Caller | Response> {
  const asCaller = await fetch(`${SUPABASE_URL}/rest/v1/rpc/my_payouts_status`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: auth, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!asCaller.ok) {
    if (asCaller.status === 401 || asCaller.status === 403) {
      return json({ error: 'Sign in to check your payouts.' }, 401);
    }
    console.error(`connect-status: my_payouts_status ${asCaller.status}`);
    return json({ error: 'Could not check your payouts.' }, 500);
  }
  const status = (await asCaller.json()) as unknown;
  if (typeof status !== 'string') {
    throw new Error('my_payouts_status returned no status');
  }

  const sub = jwtClaims(auth.slice('Bearer '.length))?.sub;
  if (typeof sub !== 'string' || sub.length === 0) {
    return json({ error: 'Sign in to check your payouts.' }, 401);
  }
  return { userId: sub, status };
}

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || !STRIPE_SECRET_KEY) {
    console.error('connect-status: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / STRIPE_SECRET_KEY not set');
    return json({ error: 'not configured' }, 500);
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) {
    return json({ error: 'Sign in to check your payouts.' }, 401);
  }

  try {
    // --- 1. The database decides who is calling ------------------------------
    const caller = await resolveCaller(auth);
    if (caller instanceof Response) return caller;
    const userId = caller.userId;

    // --- 2. No account yet: nothing to ask the provider ----------------------
    const stored = await serviceRpc('get_payment_account', { p_user_id: userId });
    if (!stored.ok) {
      throw new Error(`get_payment_account failed: ${stored.status} ${(await stored.text()).slice(0, 200)}`);
    }
    const accountId = (await stored.json()) as string | null;
    if (!accountId) {
      return json({ status: 'none' });
    }

    // --- 3. The provider's account, with the two objects the rule reads ------
    const account = await stripeV2(
      'GET',
      `/v2/core/accounts/${encodeURIComponent(accountId)}?include[0]=configuration.recipient&include[1]=requirements`
    );
    if (!account.ok) {
      console.error(`connect-status: account retrieve ${account.status}: ${providerError(account.body)}`);
      return json({ error: 'The payment provider is unavailable right now.' }, 502);
    }

    // --- 4. Classify, record, return -----------------------------------------
    const result = classifyAccount(account.body);
    const marked = await serviceRpc('set_payouts_status', { p_user_id: userId, p_status: result });
    if (!marked.ok) {
      throw new Error(`set_payouts_status failed: ${marked.status} ${(await marked.text()).slice(0, 200)}`);
    }
    if ((await marked.json()) !== true) {
      // The account id was read from this user's row a moment ago, so a
      // missing row now is a defect, not a state to report as truth.
      throw new Error('set_payouts_status matched no payment_accounts row');
    }

    // The state only. Never the account id, never the provider's object.
    return json({ status: result });
  } catch (err) {
    console.error('connect-status: unhandled', err);
    return json({ error: 'Could not check your payouts.' }, 500);
  }
});
