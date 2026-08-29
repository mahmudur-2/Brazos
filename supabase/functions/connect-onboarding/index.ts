// ============================================================================
// Brazos · connect-onboarding  (Supabase Edge Function, Deno)
//
// The worker taps "Set up payouts". This function makes sure the worker has a
// provider payout account — a Stripe Account v2 with the Express dashboard
// and the recipient configuration only — and hands the client a single-use
// hosted-onboarding URL to open in a system browser session (never a
// WebView). The provider collects everything else: name, entity type, bank
// account.
//
//   Deploy:  the staging pipeline deploys every function directory on push.
//
// ---------------------------------------------------------------------------
// NO EDGE FUNCTION COMPUTES A MONETARY AMOUNT
// ---------------------------------------------------------------------------
// Nothing here is money. The account created is the payout DESTINATION that
// process-settlements transfers to; the amounts it transfers are decided by
// the database, never here.
//
// ---------------------------------------------------------------------------
// WHO IS ALLOWED — THE DATABASE DECIDES WHO IS CALLING, AS IN create-payment
// ---------------------------------------------------------------------------
// The caller's own Authorization header is forwarded to PostgREST with the
// ANON key as apikey — create-payment's exact shape — and my_payouts_status()
// runs AS THE CALLER. PostgREST verifies the token's signature with the
// project's secret before it runs anything, so a forged or expired token is
// refused HERE even if the platform's own JWT check (config.toml
// verify_jwt = true, which the dashboard can override) were ever switched
// off. Only a token the database has accepted has its sub and email claims
// read, and those are read locally: no admin or auth surface is called.
//
// get_payment_account / set_payment_account / set_payouts_status are
// service_role, because they are writes and reads no client may make; the
// RPC grants are the real defence, as always.
//
// ---------------------------------------------------------------------------
// WHY A STORED ACCOUNT REFERENCE AND NOT AN IDEMPOTENCY KEY
// ---------------------------------------------------------------------------
// Same reasoning as the customer reference in create-payment: a provider
// idempotency key expires after roughly a day, and keyed on the user id it
// would mint a second payout account for the same worker later. Durable
// reuse comes from payment_accounts.stripe_account_id, reached through
// get_payment_account / set_payment_account (first writer wins, the effective
// id comes back and is the one the link is minted for). The key
// brazos-account-<user id> is still sent on the create call, as a
// short-window guard against a double tap.
//
// No role gate: any active user may set up payouts (R5b D9) — one account,
// both capabilities.
//
// WHY plain fetch: same reason as create-payment. No SDK, no import map, no
// version drift. Every /v2/ call sends a JSON body under a pinned
// Stripe-Version; the v1 calls elsewhere are form-encoded.
// ============================================================================

const STRIPE_API = 'https://api.stripe.com';

// Accounts v2 pins an exact API version per request. The account's configured
// version, the same string create-payment pins on /v1/ephemeral_keys.
const STRIPE_V2_VERSION = '2026-08-26.dahlia';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

type Caller = { userId: string; email?: string; status: string };

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

/** Who is calling, as the DATABASE sees them — plus their stored payout
 * status, which the same round trip returns. A Response is a refusal. */
async function resolveCaller(auth: string): Promise<Caller | Response> {
  const asCaller = await fetch(`${SUPABASE_URL}/rest/v1/rpc/my_payouts_status`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: auth, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!asCaller.ok) {
    if (asCaller.status === 401 || asCaller.status === 403) {
      return json({ error: 'Sign in to set up payouts.' }, 401);
    }
    console.error(`connect-onboarding: my_payouts_status ${asCaller.status}`);
    return json({ error: 'Could not start payout setup.' }, 500);
  }
  const status = (await asCaller.json()) as unknown;
  if (typeof status !== 'string') {
    throw new Error('my_payouts_status returned no status');
  }

  const claims = jwtClaims(auth.slice('Bearer '.length));
  const sub = claims?.sub;
  if (typeof sub !== 'string' || sub.length === 0) {
    return json({ error: 'Sign in to set up payouts.' }, 401);
  }
  const email = claims?.email;
  return {
    userId: sub,
    email: typeof email === 'string' && email.includes('@') ? email : undefined,
    status,
  };
}

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || !STRIPE_SECRET_KEY) {
    console.error('connect-onboarding: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / STRIPE_SECRET_KEY not set');
    return json({ error: 'not configured' }, 500);
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) {
    return json({ error: 'Sign in to set up payouts.' }, 401);
  }

  try {
    // --- 1. The database decides who is calling ------------------------------
    const caller = await resolveCaller(auth);
    if (caller instanceof Response) return caller;
    const userId = caller.userId;

    // --- 2. The payout account, created once and reused forever --------------
    const stored = await serviceRpc('get_payment_account', { p_user_id: userId });
    if (!stored.ok) {
      throw new Error(`get_payment_account failed: ${stored.status} ${(await stored.text()).slice(0, 200)}`);
    }
    let accountId = (await stored.json()) as string | null;
    let status = caller.status;

    if (!accountId) {
      // Express dashboard, recipient configuration, stripe_transfers only:
      // the platform charges and transfers, the worker only receives (D1).
      // us, and the verified token's email when it has one; display name and
      // entity type are the hosted flow's to collect (D2). Nothing monetary.
      const account: Record<string, unknown> = {
        dashboard: 'express',
        defaults: {
          responsibilities: { fees_collector: 'application', losses_collector: 'application' },
        },
        identity: { country: 'us' },
        configuration: {
          recipient: {
            capabilities: { stripe_balance: { stripe_transfers: { requested: true } } },
          },
        },
      };
      if (caller.email) account.contact_email = caller.email;

      const created = await stripeV2('POST', '/v2/core/accounts', account, `brazos-account-${userId}`);
      if (!created.ok || typeof created.body.id !== 'string') {
        console.error(`connect-onboarding: account create ${created.status}: ${providerError(created.body)}`);
        return json({ error: 'The payment provider is unavailable right now.' }, 502);
      }

      // set_payment_account returns the EFFECTIVE id: if another request
      // stored one first, that one comes back and the link below is minted
      // for it; the account this request created is abandoned rather than
      // overwriting anything.
      const persisted = await serviceRpc('set_payment_account', {
        p_user_id: userId,
        p_account_id: created.body.id,
      });
      if (!persisted.ok) {
        throw new Error(`set_payment_account failed: ${persisted.status} ${(await persisted.text()).slice(0, 200)}`);
      }
      accountId = (await persisted.json()) as string;

      // A brand-new account has everything still to collect.
      const marked = await serviceRpc('set_payouts_status', { p_user_id: userId, p_status: 'action_needed' });
      if (!marked.ok) {
        throw new Error(`set_payouts_status failed: ${marked.status} ${(await marked.text()).slice(0, 200)}`);
      }
      status = 'action_needed';
    }

    // --- 3. The single-use onboarding link -----------------------------------
    // No idempotency key here on purpose: the link is single-use and a replay
    // must mint a fresh one, not return a spent one (the ephemeral-key
    // reasoning). Both URLs are HTTPS — the functions URL is — and the bounce
    // they name is stateless (connect-return).
    const link = await stripeV2('POST', '/v2/core/account_links', {
      account: accountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['recipient'],
          refresh_url: `${SUPABASE_URL}/functions/v1/connect-return?refresh=1`,
          return_url: `${SUPABASE_URL}/functions/v1/connect-return`,
        },
      },
    });
    if (!link.ok || typeof link.body.url !== 'string') {
      console.error(`connect-onboarding: account link ${link.status}: ${providerError(link.body)}`);
      return json({ error: 'The payment provider is unavailable right now.' }, 502);
    }

    // Only what the client needs: the stored state and the URL to open. Never
    // the account id, never the provider's account object.
    return json({ status, url: link.body.url });
  } catch (err) {
    console.error('connect-onboarding: unhandled', err);
    return json({ error: 'Could not start payout setup.' }, 500);
  }
});
