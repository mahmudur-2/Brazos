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
// WHO IS ALLOWED — THE AUTH SERVER DECIDES WHO IS CALLING, AS IN create-payment
// ---------------------------------------------------------------------------
// verifiedUser() (lean K1) asks the auth server who the token belongs to; the
// user id comes from that answer only, never from the token itself. The
// platform's JWT check (config.toml verify_jwt = true) is no proof: it admits
// the public key. get_payment_account / set_payouts_status are service_role;
// the RPC grants are the real defence, as always.
//
// WHY plain fetch: same reason as create-payment. No SDK, no import map, no
// version drift. The /v2/ call sends a pinned Stripe-Version.
// ============================================================================

import { notConfigured, PUBLISHABLE_KEY, SECRET_KEY, serviceHeaders, verifiedUser } from '../_shared/serviceAuth.ts';
import { overHourlyLimit, RATE_LIMITED } from '../_shared/rateLimit.ts';
import { classifyAccount } from './classify.mjs';

const STRIPE_API = 'https://api.stripe.com';

// Accounts v2 pins an exact API version per request. The account's configured
// version, the same string create-payment pins on /v1/ephemeral_keys.
const STRIPE_V2_VERSION = '2026-08-26.dahlia';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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

Deno.serve(async (req) => {
  const unset = notConfigured('connect-status', { SUPABASE_URL, PUBLISHABLE_KEY, SECRET_KEY, STRIPE_SECRET_KEY });
  if (unset) return unset;
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  // --- 1. The auth server decides who is calling ----------------------------
  const caller = await verifiedUser(req, 'Sign in to check your payouts.', 'Could not check your payouts. Try again.');
  if (caller instanceof Response) return caller;
  const userId = caller.id;
  // B10: one hit on the caller's hourly counter before anything reaches the provider.
  if (await overHourlyLimit(serviceRpc, 'connect-status', userId)) return json({ error: RATE_LIMITED }, 429);

  try {
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
