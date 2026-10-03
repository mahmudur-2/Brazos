// ============================================================================
// Brazos · process-settlements  (Supabase Edge Function, Deno)
//
// Drains the two money queues the database maintains: transfers_due (money out
// to the worker) and refunds_due (money back to the customer). Woken every five
// minutes by pg_cron through public.drain_settlements(), which is its only
// caller.
//
//   Deploy:  npx supabase functions deploy process-settlements
//   Invoke:  curl -X POST "$SUPABASE_URL/functions/v1/process-settlements" \
//              -H "Authorization: Bearer $SERVICE_ROLE_KEY"
//
// ---------------------------------------------------------------------------
// NO EDGE FUNCTION COMPUTES A MONETARY AMOUNT
// ---------------------------------------------------------------------------
// Every number sent to the provider is read VERBATIM from a payments column:
// transfer_cents to transfer, refund_cents to refund. Both were decided by the
// database — release_job_payment, auto_release_due_payments, cancel_job and
// resolve_job_dispute write them. This function adds nothing, rounds nothing
// and derives nothing. A row whose amount is null or not positive is SKIPPED
// and counted as a defect; substituting a computed value would be a defect even
// if the number happened to be right.
//
// ---------------------------------------------------------------------------
// SUCCESS RECORDS NOTHING BACK ON THE LEDGER, AND THAT IS THE CONTRACT
// ---------------------------------------------------------------------------
// transfer_ref is written by apply_payment_event() on transfer.created, and
// refund_ref on charge.refunded. attach_provider_ref() is the PaymentIntent's
// entry point and nothing else. So a row STAYS in its queue until its event
// lands, and this function may well see it again on the next tick. That is
// safe, and only because of the idempotency keys below: a repeat inside the
// provider's idempotency window returns the SAME transfer or refund rather than
// creating a second one.
//
// FAILURE IS RECORDED — R6b, after the 2026-08-30 money walk. The provider
// saves the status and body of the FIRST request made under an idempotency
// key, success or failure alike, and replays it for 24 hours. Before R6b a
// failed attempt wrote nothing back, so the key never changed and every tick
// replayed the first tick's refusal — a transfer refused for an unfunded
// platform balance stayed refused for four ticks after the balance was funded,
// until a hand UPDATE of transfer_attempts rotated the key. Now every
// non-success goes through record_settlement_attempt(): last_error and
// updated_at always, and the kind's attempt counter + 1 — a NEW key — only
// when classify.mjs says the cached result is a definitive 4xx refusal. A 409
// (the original request may still be executing) and a 5xx (money may already
// have moved) keep the key: rotated, each is a second payment. classify.mjs
// states the whole rule.
//
// THE TRANSFER MUST CARRY metadata[payment_id]. apply_payment_event() resolves
// an event to a ledger row by metadata.payment_id first, then by provider_ref
// for payment_intent.* and charge.* events — there is no fallback for a
// transfer.*. A transfer sent without it produces a transfer.created that
// matches no row, is marked processed, and leaves the payment held forever.
//
// ---------------------------------------------------------------------------
// SECURITY
// ---------------------------------------------------------------------------
// Service role only, checked before anything else runs. Both queues are views
// granted to service_role alone — authenticated and anon are revoked — so the
// GRANTs are the real defence and the check below is the first line of it,
// exactly as in send-push. The one write this function makes,
// record_settlement_attempt(), is a service_role-only RPC that touches three
// non-money columns and can never move money.
// ============================================================================

import { classifySettlementFailure } from './classify.mjs';

const STRIPE_API = 'https://api.stripe.com';

// Bound the work per invocation so a backlog cannot run past the Edge Function
// execution limit — the next five-minute tick picks up the remainder. Each row
// is one sequential provider call; parallelising them would trade rate-limit
// headroom and clean per-row failure isolation for wall clock this queue does
// not need.
const QUEUE_LIMIT = 25;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

type TransferRow = {
  id: string;
  payee_id: string;
  transfer_cents: number | null;
  transfer_attempts: number | null;
};

type RefundRow = {
  id: string;
  provider_ref: string | null;
  refund_cents: number | null;
  refund_attempts: number | null;
};

type Kind = 'transfer' | 'refund';

/** What the provider call came back with, or what it threw. */
type FailureOutcome = {
  status?: number;
  body?: Record<string, unknown>;
  threw?: unknown;
};

type Tally = {
  attempted: number;
  succeeded: number;
  /**
   * Not settled yet, and nothing is wrong with it: the balance is not yet
   * available (in live mode ordinary timing), a 409, a 429, a 5xx or a throw.
   * The row stays queued and the next tick retries — with a rotated key only
   * where classify.mjs allows one.
   */
  deferred: number;
  /**
   * A terminal 4xx the provider will refuse again on every retry until a human
   * acts. The key is rotated so that retry asks afresh; the row stays queued.
   */
  failed: number;
  /**
   * Amount null or not positive (D1 forbids substituting a computed one) — or,
   * since R6b, a non-success whose record could not be written: a recorder
   * failure means the RPC or the schema is broken, which is defect-class. That
   * is the one way a row counts here AND in deferred or failed.
   */
  defects: number;
  /** Nothing to send to: no connected account, or no charge to refund. */
  blocked: number;
};

const tally = (): Tally => ({ attempted: 0, succeeded: 0, deferred: 0, failed: 0, defects: 0, blocked: 0 });

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

async function getRows<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: serviceHeaders() });
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? (rows as T[]) : [];
}

/**
 * A9 (2026-10-03): how many rows a queue holds, by PostgREST's exact count — no rows transferred.
 * The drain reports blocked = due − ready, queue-wide, so the operator sees every payee that
 * cannot be paid, not only the few that landed in one batch. A failed count never fails the pass:
 * it reports null and the money still moves.
 */
async function countRows(view: string): Promise<number | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${view}?select=id&limit=1`, {
      method: 'HEAD',
      headers: { ...serviceHeaders(), Prefer: 'count=exact' },
    });
    if (!res.ok) return null;
    const total = res.headers.get('content-range')?.split('/')[1];
    const n = total == null ? NaN : Number(total);
    return Number.isInteger(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

/** The queue-wide blocked count for a pass: everything due that is not ready. */
async function countBlocked(due: string, ready: string): Promise<number> {
  const [d, r] = await Promise.all([countRows(due), countRows(ready)]);
  return d != null && r != null ? Math.max(0, d - r) : 0;
}

/** A service_role RPC: writes no client may make. */
async function serviceRpc(fn: string, args: Record<string, unknown>): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify(args),
  });
}

async function stripe(
  path: string,
  fields: Record<string, string>,
  idempotencyKey: string
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': idempotencyKey,
    },
    body: new URLSearchParams(fields).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body };
}

/** A positive integer number of cents, or null. Never coerced, never defaulted. */
function cents(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Writes one non-success to the ledger row through record_settlement_attempt()
 * (D2): last_error and updated_at always, the kind's attempt counter + 1 when
 * rotate is true. The RPC touches nothing else and moves no money.
 *
 * WRAPPED SO IT CAN NEVER ABORT THE PASS. A recorder that fails means the RPC
 * or the schema is broken, which is defect-class: it is logged here, counted
 * by the caller, and the loop goes on to the next row.
 * @returns whether the row was recorded
 */
async function recordAttempt(kind: Kind, paymentId: string, rotate: boolean, error: string): Promise<boolean> {
  try {
    const res = await serviceRpc('record_settlement_attempt', {
      p_payment_id: paymentId,
      p_kind: kind,
      p_rotate: rotate,
      p_error: error,
    });
    if (!res.ok) {
      console.error(
        `process-settlements: record_settlement_attempt(${kind}) for payment ${paymentId} failed ${res.status}: ${(await res.text()).slice(0, 300)}`
      );
      return false;
    }
    const matched = await res.json().catch(() => null);
    if (matched !== true) {
      console.error(`process-settlements: record_settlement_attempt(${kind}) for payment ${paymentId} matched no row`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`process-settlements: record_settlement_attempt(${kind}) for payment ${paymentId} threw:`, err);
    return false;
  }
}

/**
 * One non-success, whichever pass: classified (D1, D7), tallied, recorded
 * (D2). The single implementation of the rule for both queues.
 */
async function recordFailure(counts: Tally, kind: Kind, paymentId: string, outcome: FailureOutcome): Promise<void> {
  const verdict = classifySettlementFailure(outcome);
  if (verdict.deferred) counts.deferred++;
  else counts.failed++;
  console.error(
    `process-settlements: ${kind} for payment ${paymentId} ${verdict.deferred ? 'deferred' : 'failed'} — ${verdict.message} (key ${verdict.rotate ? 'rotated' : 'kept'})`
  );
  const recorded = await recordAttempt(kind, paymentId, verdict.rotate, verdict.message);
  if (!recorded) counts.defects++;
}

// ---------------------------------------------------------------------------
// Pass one: money out to the worker.
// ---------------------------------------------------------------------------
async function runTransfers(): Promise<Tally> {
  const counts = tally();
  // A9 (2026-10-03): the drain reads transfers_READY — transfers_due minus the payees it could
  // never pay (no ENABLED payout account) (20261003000000). Before, 25 blocked rows at the head of
  // transfers_due hid every payable row behind them, tick after tick. The blocked count is now the
  // whole difference between the two queues, not one batch's share. A9 review: the view's order
  // is transfer_attempts, then release_requested_at (20261003001100) — a row never tried before
  // any row the provider has refused — so 25 rows refused for a reason of their own (key rotated,
  // retried every tick) cannot fill this read and starve the payable rows behind them. This
  // function adds no order of its own: the view's is the queue's.
  counts.blocked = await countBlocked('transfers_due', 'transfers_ready');
  const rows = await getRows<TransferRow>(
    `transfers_ready?select=id,payee_id,transfer_cents,transfer_attempts&limit=${QUEUE_LIMIT}`
  );
  if (rows.length === 0) return counts;

  // One lookup for the whole batch rather than one per row. A payee with no
  // ENABLED payout account yet (payment_accounts.payouts_enabled — derived by
  // set_payouts_status() from the state connect-status records, true only
  // once the provider reports transfers active) cannot be paid; that is
  // onboarding's job, not this function's, and the row simply waits: counted
  // blocked below, BEFORE any provider call, so nothing is fired and no
  // idempotency key is spent on it (n4b, 2026-09-05). An account that exists
  // but is not enabled is filtered out here and blocks exactly like no
  // account at all.
  const payees = [...new Set(rows.map((r) => r.payee_id).filter(Boolean))];
  const accounts = new Map<string, string>();
  if (payees.length > 0) {
    const list = await getRows<{ user_id: string; stripe_account_id: string | null }>(
      `payment_accounts?select=user_id,stripe_account_id&payouts_enabled=eq.true&user_id=in.(${payees.map(encodeURIComponent).join(',')})`
    );
    for (const row of list) {
      if (row.stripe_account_id) accounts.set(row.user_id, row.stripe_account_id);
    }
  }

  for (const row of rows) {
    // FAILURE ISOLATION: one row that throws must not abort this pass, the
    // other pass, or the summary. A throw is a non-success like any other and
    // is recorded below — deferred, key kept: the request may have reached the
    // provider, which is exactly what the idempotency key is for.
    let failure: FailureOutcome | undefined;
    try {
      const amount = cents(row.transfer_cents);
      if (amount === null) {
        counts.defects++;
        console.error(`process-settlements: payment ${row.id} is in transfers_due with transfer_cents=${String(row.transfer_cents)} — skipped, nothing computed in its place`);
        continue;
      }

      const destination = accounts.get(row.payee_id);
      if (!destination) {
        counts.blocked++;
        console.error(`process-settlements: payment ${row.id} — payee has no ENABLED payout account yet (payment_accounts.payouts_enabled), left in the queue`);
        continue;
      }

      counts.attempted++;
      // THE KEY CARRIES THE COUNTER. The provider caches the first result under
      // a key for 24 hours, success or failure, and only a new key sends a new
      // request. Two writers move the counter, both in the database:
      // resolve_job_dispute when it re-opens a reversed transfer (a real second
      // transfer, never the reversed one played back), and
      // record_settlement_attempt when classify.mjs says a cached refusal must
      // be left behind. This function never changes the counter itself.
      const result = await stripe(
        '/v1/transfers',
        {
          amount: String(amount),
          currency: 'usd',
          destination,
          'metadata[payment_id]': row.id,
        },
        `tr:${row.id}:${row.transfer_attempts ?? 0}`
      );

      if (result.ok) {
        // SUCCESS WRITES NOTHING BACK, and that is correct and unchanged (R6b):
        // transfer_ref is written by apply_payment_event() on the
        // transfer.created webhook, the one writer of that column, and the row
        // leaves transfers_due when the event lands. Do not "fix" this by
        // recording the ref from the response — a second writer for one column
        // is how a ledger drifts.
        counts.succeeded++;
        continue;
      }
      failure = { status: result.status, body: result.body };
    } catch (err) {
      failure = { threw: err ?? 'unknown' };
    }
    await recordFailure(counts, 'transfer', row.id, failure);
  }

  return counts;
}

// ---------------------------------------------------------------------------
// Pass two: money back to the customer.
// ---------------------------------------------------------------------------
async function runRefunds(): Promise<Tally> {
  const counts = tally();
  // A9: refunds_READY — refunds_due minus the rows with no provider reference to refund against
  // (20261003000000), so such a row cannot sit at the head and hide refundable rows behind it.
  counts.blocked = await countBlocked('refunds_due', 'refunds_ready');
  const rows = await getRows<RefundRow>(
    `refunds_ready?select=id,provider_ref,refund_cents,refund_attempts&limit=${QUEUE_LIMIT}`
  );

  for (const row of rows) {
    // FAILURE ISOLATION, as in pass one; a throw is recorded, deferred, key
    // kept.
    let failure: FailureOutcome | undefined;
    try {
      const amount = cents(row.refund_cents);
      if (amount === null) {
        counts.defects++;
        console.error(`process-settlements: payment ${row.id} is in refunds_due with refund_cents=${String(row.refund_cents)} — skipped, nothing computed in its place`);
        continue;
      }

      if (!row.provider_ref) {
        counts.blocked++;
        console.error(`process-settlements: payment ${row.id} has a refund due but no provider reference to refund against, left in the queue`);
        continue;
      }

      counts.attempted++;
      // THE KEY CARRIES THE COUNTER (R6b). Before, the refund key was the
      // payment id alone — one refund per ledger row, which is still the
      // intent — but a refund whose first attempt was refused was then wedged
      // for 24 hours with no way to rotate the key, even by hand. Now
      // refund_attempts (20260920000000_settlement_retry.sql) is part of the
      // key, exposed through refunds_due, and record_settlement_attempt moves
      // it only when classify.mjs says the cached result is a definitive
      // refusal. A repeat inside the window under the same key still returns
      // the same refund.
      const result = await stripe(
        '/v1/refunds',
        {
          payment_intent: row.provider_ref,
          amount: String(amount),
          'metadata[payment_id]': row.id,
        },
        `rf:${row.id}:${row.refund_attempts ?? 0}`
      );

      if (result.ok) {
        // SUCCESS WRITES NOTHING BACK, as in pass one: refund_ref is written by
        // apply_payment_event() on the charge.refunded webhook, and the row
        // leaves refunds_due when it lands.
        counts.succeeded++;
        continue;
      }
      failure = { status: result.status, body: result.body };
    } catch (err) {
      failure = { threw: err ?? 'unknown' };
    }
    await recordFailure(counts, 'refund', row.id, failure);
  }

  return counts;
}

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !SERVICE_KEY || !STRIPE_SECRET_KEY) {
    console.error('process-settlements: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / STRIPE_SECRET_KEY not set');
    return json({ error: 'not configured' }, 500);
  }

  // Before anything else. Supabase's own verify_jwt would accept any signed-in
  // user's token, so this comparison — not that gate — is what keeps ordinary
  // users out of the money queues.
  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${SERVICE_KEY}`) {
    return json({ error: 'forbidden' }, 403);
  }

  // Transfers first, then refunds. Each pass is independent: a pass that throws
  // outright still leaves the other's counts in the summary, because the
  // summary is what the operator reads when something looks wrong. Its shape
  // is { attempted, succeeded, deferred, failed, defects, blocked } per pass
  // (Tally, above); deferred is not a defect and failed is not timing.
  let transfers = tally();
  let refunds = tally();
  const errors: string[] = [];

  try {
    transfers = await runTransfers();
  } catch (err) {
    errors.push(`transfers: ${err instanceof Error ? err.message : String(err)}`);
    console.error('process-settlements: transfers pass failed', err);
  }

  try {
    refunds = await runRefunds();
  } catch (err) {
    errors.push(`refunds: ${err instanceof Error ? err.message : String(err)}`);
    console.error('process-settlements: refunds pass failed', err);
  }

  return json({
    ok: errors.length === 0,
    limit: QUEUE_LIMIT,
    transfers,
    refunds,
    ...(errors.length > 0 ? { errors } : {}),
  });
});
