// ============================================================================
// Brazos · payment-methods  (Supabase Edge Function, Deno)
//
// Idea 20 (docs/DECISIONS.md 2026-09-30 entry (4)): the customer's saved card for one-tap hiring —
// seen, added and removed in Payment methods. The card itself never touches Brazos: it lives on the
// provider's customer (payment_accounts.stripe_customer_id, the same one create-payment uses), and
// this function only lists what is there, starts the provider's own sheet to add one, and detaches
// one the caller owns.
//
//   Deploy:  the staging pipeline deploys every function (.github/workflows/staging.yml)
//
//   POST { "action": "list" }                               → { cards: [{ id, brand, last4, expMonth, expYear }] }
//   POST { "action": "setup" }                              → { customerId, setupIntentClientSecret, ephemeralKeySecret }
//   POST { "action": "remove", "paymentMethodId": "pm_…" }  → { removed: true }
//
// WHO: the caller, from their own token — read back from the auth server by verifiedUser() (lean K1),
// never decoded here and never trusted from the body.
// The customer reference is service_role (get_payment_customer / set_payment_customer), as in
// create-payment. A card is removed only when it is on the caller's own customer.
//
// NO MONEY MOVES HERE. A SetupIntent saves a card for later; nothing is charged. The one-tap charge
// itself is create-payment's (`useSavedCard`), after accept_offer().
//
// WHY plain fetch: the same reason as create-payment — no SDK, no import map, no version drift.
// ============================================================================

import { notConfigured, PUBLISHABLE_KEY, SECRET_KEY, serviceHeaders, verifiedUser } from '../_shared/serviceAuth.ts';

const STRIPE_API = 'https://api.stripe.com';
// The version the mobile SDK speaks, pinned on the ephemeral key only (create-payment's own).
const STRIPE_VERSION = '2026-08-26.dahlia';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

type Card = { id: string; brand: string; last4: string; expMonth: number | null; expYear: number | null };

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function serviceRpc(fn: string, args: Record<string, unknown>): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify(args),
  });
}

async function stripe(
  method: 'GET' | 'POST',
  path: string,
  fields?: Record<string, string>,
  options: { idempotencyKey?: string; version?: string } = {}
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = { Authorization: `Bearer ${STRIPE_SECRET_KEY}` };
  if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  if (options.version) headers['Stripe-Version'] = options.version;
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers,
    body: method === 'POST' ? new URLSearchParams(fields ?? {}).toString() : undefined,
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body };
}

async function storedCustomer(userId: string): Promise<string | null> {
  const stored = await serviceRpc('get_payment_customer', { p_user_id: userId });
  if (!stored.ok) throw new Error(`get_payment_customer failed: ${stored.status}`);
  return (await stored.json()) as string | null;
}

/** create-payment's step 2, the same way: created once, stored, the effective one returned. */
async function ensureCustomer(userId: string): Promise<string | null> {
  const existing = await storedCustomer(userId);
  if (existing) return existing;
  const created = await stripe('POST', '/v1/customers', { 'metadata[user_id]': userId }, { idempotencyKey: `brazos-customer-${userId}` });
  if (!created.ok || typeof created.body.id !== 'string') return null;
  const persisted = await serviceRpc('set_payment_customer', { p_user_id: userId, p_customer_id: created.body.id });
  if (!persisted.ok) throw new Error(`set_payment_customer failed: ${persisted.status}`);
  return (await persisted.json()) as string;
}

async function listCards(customerId: string): Promise<Card[]> {
  const listed = await stripe('GET', `/v1/customers/${encodeURIComponent(customerId)}/payment_methods?type=card&limit=5`);
  if (!listed.ok || !Array.isArray(listed.body.data)) throw new Error(`payment_methods ${listed.status}`);
  return (listed.body.data as Array<Record<string, any>>)
    .filter((pm) => typeof pm.id === 'string' && pm.card)
    .map((pm) => ({
      id: pm.id,
      brand: String(pm.card.brand ?? ''),
      last4: String(pm.card.last4 ?? ''),
      expMonth: Number.isInteger(pm.card.exp_month) ? pm.card.exp_month : null,
      expYear: Number.isInteger(pm.card.exp_year) ? pm.card.exp_year : null,
    }));
}

Deno.serve(async (req) => {
  const unset = notConfigured('payment-methods', { SUPABASE_URL, PUBLISHABLE_KEY, SECRET_KEY, STRIPE_SECRET_KEY });
  if (unset) return unset;
  const caller = await verifiedUser(req, 'Sign in to manage your cards.', 'Could not reach your cards right now. Try again.');
  if (caller instanceof Response) return caller;
  const userId = caller.id;

  let action = '';
  let paymentMethodId = '';
  try {
    const body = (await req.json()) as { action?: unknown; paymentMethodId?: unknown };
    action = typeof body.action === 'string' ? body.action : '';
    paymentMethodId = typeof body.paymentMethodId === 'string' ? body.paymentMethodId : '';
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }
  // An allow-list of three.
  if (action !== 'list' && action !== 'setup' && action !== 'remove') return json({ error: 'Unknown action.' }, 400);

  try {
    if (action === 'list') {
      const customerId = await storedCustomer(userId);
      return json({ cards: customerId ? await listCards(customerId) : [] });
    }

    if (action === 'remove') {
      if (!/^pm_[A-Za-z0-9_]+$/.test(paymentMethodId)) return json({ error: 'Choose a card to remove.' }, 400);
      const customerId = await storedCustomer(userId);
      const owned = customerId ? (await listCards(customerId)).some((card) => card.id === paymentMethodId) : false;
      if (!owned) return json({ error: 'That card is not on your account.' }, 404);
      const detached = await stripe('POST', `/v1/payment_methods/${encodeURIComponent(paymentMethodId)}/detach`, {});
      if (!detached.ok) {
        console.error(`payment-methods: detach ${detached.status}`);
        return json({ error: 'The payment provider is unavailable right now.' }, 502);
      }
      return json({ removed: true });
    }

    // setup: a card saved for later, in the provider's own sheet. Nothing is charged.
    const customerId = await ensureCustomer(userId);
    if (!customerId) return json({ error: 'The payment provider is unavailable right now.' }, 502);
    const ephemeral = await stripe('POST', '/v1/ephemeral_keys', { customer: customerId }, { version: STRIPE_VERSION });
    const setup = await stripe('POST', '/v1/setup_intents', {
      customer: customerId,
      usage: 'off_session',
      'payment_method_types[0]': 'card',
      'metadata[user_id]': userId,
    });
    if (!ephemeral.ok || typeof ephemeral.body.secret !== 'string' || !setup.ok || typeof setup.body.client_secret !== 'string') {
      console.error(`payment-methods: setup ${setup.status} / ephemeral ${ephemeral.status}`);
      return json({ error: 'The payment provider is unavailable right now.' }, 502);
    }
    return json({
      customerId,
      setupIntentClientSecret: setup.body.client_secret,
      ephemeralKeySecret: ephemeral.body.secret,
    });
  } catch (err) {
    console.error('payment-methods: unhandled', err);
    return json({ error: 'Could not reach your cards right now.' }, 500);
  }
});
