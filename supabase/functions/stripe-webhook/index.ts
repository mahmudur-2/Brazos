// ============================================================================
// Brazos · stripe-webhook  (Supabase Edge Function, Deno)
//
// The provider's events arrive here. This function records each one and asks
// the database to apply it; it decides nothing about money.
//
//   Deploy:  npx supabase functions deploy stripe-webhook
//
// ---------------------------------------------------------------------------
// NO EDGE FUNCTION COMPUTES A MONETARY AMOUNT
// ---------------------------------------------------------------------------
// Not here and not in the other two. Every cent that moves was decided by the
// database in 20260905000000_stripe_foundation.sql and is read verbatim from a
// payments row. This function does not read one at all: it hands the event to
// apply_payment_event() and that function moves the ledger. A cent computed in
// this file would be a defect even if it produced the right answer.
//
// ---------------------------------------------------------------------------
// WHY PLAIN fetch RATHER THAN supabase-js — AND THE ONE IMPORT
// ---------------------------------------------------------------------------
// Same reason as send-push: this talks to one table and one RPC, so reaching
// PostgREST directly keeps the function dependency-free — no import map, no
// version drift between the Deno runtime and an npm client.
//
// The single exception in this directory is `./verify.mjs`, a sibling file, by
// relative path. It exists because the signature check is the one part of this
// function that CAN be proved by a test, and it is: tests/stripeWebhookSignature
// .test.mjs imports that exact file and runs inside `npm run verify`. Nothing
// else here is executable by any harness in this repository, so nothing else
// pretends to be.
//
// ---------------------------------------------------------------------------
// SECURITY — THIS IS THE ONE PUBLIC SURFACE
// ---------------------------------------------------------------------------
// Stripe holds no Supabase JWT, so this endpoint must be reachable without
// one: supabase/config.toml sets `verify_jwt = false` under
// [functions.stripe-webhook], and without that line the platform returns 401
// before this code runs at all — which Stripe counts as a failed delivery and,
// repeated, disables the destination. AFTER EVERY DEPLOY, CONFIRM THE
// DASHBOARD TOGGLE FOR THIS FUNCTION STILL SHOWS JWT VERIFICATION OFF: the
// dashboard can override the file, and a CLI redeploy can reset the dashboard.
//
// The signature is therefore this endpoint's ONLY authentication, and it is
// checked before the body is parsed, before a row is written, before anything.
// But the real defence is the database: payment_events and apply_payment_event
// are granted to service_role ALONE — authenticated and anon are revoked — so
// even a caller who reached this endpoint with a signed-in user's token could
// not write the inbox or move a ledger row.
//
// ---------------------------------------------------------------------------
// THE EVENT SET MIRRORS THE REGISTERED DESTINATION
// ---------------------------------------------------------------------------
// The destination is subscribed to exactly these seven types. This constant
// and that subscription MUST CHANGE TOGETHER: a type added there and not here
// is answered 200 and dropped on the floor; a type added here and not there
// never arrives.
// ============================================================================

import { verifyStripeSignature } from './verify.mjs';

const HANDLED_EVENTS = new Set([
  'payment_intent.succeeded',
  'payment_intent.canceled',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.closed',
  'transfer.created',
  'transfer.reversed',
]);

// How many failed applies before this function stops asking the provider to
// retry. apply_payment_event() records `error` and increments `attempts` on
// every failure and never raises past its own boundary, so a deterministically
// unapplicable event would otherwise be retried for three days and then take
// the destination down with it. At this bound the event stays recorded with
// processed_at null and shows up in the operator's signal query instead.
const MAX_APPLY_ATTEMPTS = 5;

const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

type StripeEvent = {
  id?: string;
  type?: string;
  account?: string;
};

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

/**
 * How many times apply_payment_event() has failed on this event. Read only
 * after an ok:false, to decide between "ask the provider to retry" and "stop
 * asking". Returns null when the row cannot be read, which is treated as
 * transient by the caller.
 */
async function readAttempts(eventId: string): Promise<number | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/payment_events?id=eq.${encodeURIComponent(eventId)}&select=attempts`,
    { headers: serviceHeaders() }
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ attempts?: number }>;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const attempts = rows[0]?.attempts;
  return typeof attempts === 'number' ? attempts : null;
}

Deno.serve(async (req) => {
  if (!WEBHOOK_SECRET || !SUPABASE_URL || !SERVICE_KEY) {
    console.error('stripe-webhook: STRIPE_WEBHOOK_SECRET / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    return json({ error: 'not configured' }, 500);
  }

  // THE RAW BODY, READ EXACTLY ONCE. The signature covers these bytes; a
  // re-serialisation of a parsed object is a different string and would never
  // verify.
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return json({ error: 'unreadable body' }, 400);
  }

  // VERIFY FIRST — before parsing, before writing, before anything. A failed
  // or missing signature leaves no trace and says nothing about why.
  const signature = req.headers.get('Stripe-Signature');
  let verified = false;
  try {
    verified = await verifyStripeSignature(
      rawBody,
      signature,
      WEBHOOK_SECRET,
      Math.floor(Date.now() / 1000)
    );
  } catch (err) {
    console.error('stripe-webhook: signature check threw', err);
    verified = false;
  }
  if (!verified) return json({ error: 'invalid signature' }, 400);

  try {
    const event = JSON.parse(rawBody) as StripeEvent;
    const type = event.type ?? '';

    // Outside the subscription: answered and NOT recorded. The destination
    // only sends what it is subscribed to, so this is a belt on a brace —
    // and an unrecorded event beats a permanently unprocessed row polluting
    // the operator's signal query.
    if (!HANDLED_EVENTS.has(type)) {
      return json({ ok: true, ignored: type });
    }

    const eventId = event.id ?? '';
    if (!eventId) throw new Error('event carries no id');

    // Record it. A 409 (Postgres 23505 on the primary key) means the event was
    // already STORED — not already APPLIED — so it is not an error and we fall
    // through to apply anyway. Treating it as a failure would make every
    // provider retry loop forever; treating it as success without applying
    // would leave a once-failed apply failed forever.
    const insert = await fetch(`${SUPABASE_URL}/rest/v1/payment_events`, {
      method: 'POST',
      headers: { ...serviceHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: eventId,
        type,
        // The column exists for connected-account events; undefined today
        // because the destination's scope is the account itself.
        account_id: event.account ?? null,
        payload: event,
      }),
    });
    if (!insert.ok && insert.status !== 409) {
      const detail = (await insert.text()).slice(0, 300);
      console.error(`stripe-webhook: payment_events insert failed ${insert.status}: ${detail}`);
      return json({ error: 'could not record event' }, 500);
    }

    // Apply it. This RPC is idempotent per event id, never raises past its own
    // boundary, and returns jsonb with an `ok` boolean.
    const applied = await fetch(`${SUPABASE_URL}/rest/v1/rpc/apply_payment_event`, {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify({ p_event_id: eventId }),
    });
    if (!applied.ok) {
      const detail = (await applied.text()).slice(0, 300);
      console.error(`stripe-webhook: apply_payment_event ${applied.status}: ${detail}`);
      return json({ error: 'apply unavailable' }, 500);
    }

    const result = (await applied.json()) as { ok?: boolean } | null;
    if (result?.ok === true) {
      return json({ ok: true, id: eventId });
    }

    // ok:false. THE SPLIT, AND WHY IT IS THIS ONE.
    //
    // apply_payment_event() does NOT report "unresolvable" as a failure: an
    // event that matches no payments row still sets processed_at and returns
    // ok:true with a null payment_id, so a dashboard-triggered synthetic
    // intent already answers 200 above and never reaches here. What does reach
    // here is 'unknown event' (the row vanished) and 'apply failed' (the
    // exception branch, which recorded the error and incremented attempts) —
    // and the return value cannot tell a transient failure from a
    // deterministic one. So the loop is BOUNDED instead: retry while attempts
    // is below MAX_APPLY_ATTEMPTS, stop asking at or above it. A stopped event
    // stays recorded with processed_at null, which is exactly what the
    // operator's signal query lists.
    const attempts = await readAttempts(eventId);
    if (attempts !== null && attempts >= MAX_APPLY_ATTEMPTS) {
      console.error(`stripe-webhook: ${eventId} failed to apply ${attempts} times — no longer asking for a retry`);
      return json({ ok: false, id: eventId, attempts, retrying: false });
    }
    console.error(`stripe-webhook: ${eventId} did not apply (attempts=${attempts ?? 'unknown'}) — asking for a retry`);
    return json({ error: 'apply failed', id: eventId }, 500);
  } catch (err) {
    console.error('stripe-webhook: unhandled', err);
    return json({ error: 'unhandled' }, 500);
  }
});
