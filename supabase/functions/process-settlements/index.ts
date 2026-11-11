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
// resolve_job_dispute write them, and apply_payment_event writes a charged
// tip's transfer_cents (B1, 20261111000000_tip_settlement.sql). This function
// adds nothing, rounds nothing and derives nothing. A row whose amount is null
// or not positive is SKIPPED and counted as a defect; substituting a computed
// value would be a defect even if the number happened to be right.
//
// ---------------------------------------------------------------------------
// ONE ATTEMPT = ONE KEY, AND EVERY ANSWER IS WRITTEN BACK AT ONCE (lean B16)
// ---------------------------------------------------------------------------
// The provider saves the first answer under an idempotency key and forgets the
// key after 24 hours; a key sent again after that is a NEW request. So a row
// that waited for its webhook could be paid twice. Each row now runs, in this
// order and no other:
//
//   1. settlement_send_begin(id, kind, attempt): the database says whether this
//      attempt may be sent now, and starts its 23-hour clock on first use.
//   2. the POST, under settlementKey(kind, id, attempt) (classify.mjs).
//   3. the write-back of settlementVerdict(kind, answer) (classify.mjs):
//        sent     record_settlement_sent: the transfer or refund id and amount,
//                 so the row leaves its queue without waiting for the webhook
//                 (apply_payment_event records the same object idempotently);
//        refused  record_settlement_result 'new_key': the next tick sends a new
//                 attempt (or 'stop' for a refund that cannot fix itself);
//        unknown  record_settlement_result 'same_key': the next tick sends the
//                 same key; after 23 hours the queue no longer offers the row
//                 and it shows in payment_attention for the owner.
//
// A write-back that fails is an unknown: the next tick sends the same key and
// the provider replays its first answer.
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
// exactly as in send-push. Its three writes — settlement_send_begin,
// record_settlement_sent, record_settlement_result — are service_role-only
// RPCs that record what happened and can never move money.
// ============================================================================

import { requireServiceRole } from '../_shared/serviceAuth.ts';
import { settlementKey, settlementVerdict } from './classify.mjs';

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
type Outcome = {
  status?: number;
  body?: Record<string, unknown>;
  threw?: unknown;
};

type Tally = {
  attempted: number;
  succeeded: number;
  /**
   * Not settled yet, and nothing is wrong with it: the balance is not yet
   * available (a new key next tick), or an unknown answer (the same key next
   * tick, for at most 23 hours).
   */
  deferred: number;
  /**
   * A refusal that will repeat until a person acts (a new key every tick), or
   * a stop: the row shows in payment_attention.
   */
  failed: number;
  /**
   * Amount null or not positive (D1 forbids substituting a computed one), a
   * begin that errored, or an answer whose write-back failed: the RPC or the
   * schema is broken, which is defect-class. A failed write-back of a 2xx
   * counts here AND in deferred: the same key goes again next tick.
   */
  defects: number;
  /** Nothing to send to, or the database said not now (settlement_send_begin false). */
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
 * A service_role RPC that returns a boolean. Never throws: an error, a non-2xx
 * or a non-boolean answer is null, which the caller counts as a defect.
 */
async function rpcBoolean(fn: string, args: Record<string, unknown>, label: string): Promise<boolean | null> {
  try {
    const res = await serviceRpc(fn, args);
    if (!res.ok) {
      console.error(`process-settlements: ${fn} for ${label} failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const answer = await res.json().catch(() => null);
    return typeof answer === 'boolean' ? answer : null;
  } catch (err) {
    console.error(`process-settlements: ${fn} for ${label} threw:`, err);
    return null;
  }
}

/**
 * Step 1 of a row: may this attempt be sent now? true = send; false = not now
 * (the row left the queue, the attempt moved on, or its 23 hours are over);
 * null = the begin itself failed, and nothing is sent.
 */
function beginSend(kind: Kind, paymentId: string, attempt: number): Promise<boolean | null> {
  return rpcBoolean(
    'settlement_send_begin',
    { p_payment_id: paymentId, p_kind: kind, p_attempt: attempt },
    `${kind} ${paymentId}`
  );
}

/**
 * Step 3 of a row: the verdict on the answer, tallied and written back at
 * once. The single implementation of the rule for both queues.
 */
async function settle(counts: Tally, kind: Kind, paymentId: string, attempt: number, outcome: Outcome): Promise<void> {
  const verdict = settlementVerdict(kind, outcome);
  const label = `${kind} ${paymentId} attempt ${attempt}`;
  if (verdict.next === 'write_back') {
    const recorded = await rpcBoolean(
      'record_settlement_sent',
      { p_payment_id: paymentId, p_kind: kind, p_ref: verdict.ref, p_amount_cents: verdict.amount },
      label
    );
    if (recorded === null) {
      // Unknown: the next tick sends the same key and the provider replays this answer.
      counts.deferred++;
      counts.defects++;
      return;
    }
    counts.succeeded++;
    return;
  }
  if (verdict.deferred) counts.deferred++;
  else counts.failed++;
  console.error(`process-settlements: ${label} ${verdict.result}, next ${verdict.next} — ${verdict.message}`);
  const recorded = await rpcBoolean(
    'record_settlement_result',
    { p_payment_id: paymentId, p_kind: kind, p_attempt: attempt, p_next: verdict.next, p_error: verdict.message },
    label
  );
  if (recorded === null) counts.defects++;
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
    // other pass, or the summary. A throw after the begin is an unknown answer
    // and is written back below — same key next tick: the request may have
    // reached the provider, which is exactly what the idempotency key is for.
    const attempt = row.transfer_attempts ?? 0;
    let outcome: Outcome;
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

      // 1. BEGIN. The database checks the row is still ready for THIS attempt
      // and starts the attempt's 23-hour clock on its first use.
      const begun = await beginSend('transfer', row.id, attempt);
      if (begun === null) {
        counts.defects++;
        continue;
      }
      if (!begun) {
        counts.blocked++;
        continue;
      }

      counts.attempted++;
      // 2. POST. The key is the payment and the attempt number, nothing else.
      // Only the database moves the counter: record_settlement_result on a
      // refusal, resolve_job_dispute and resolve_tip when they re-open a
      // reversed transfer, settlement_send_reopen when the owner says so.
      const result = await stripe(
        '/v1/transfers',
        {
          amount: String(amount),
          currency: 'usd',
          destination,
          'metadata[payment_id]': row.id,
        },
        settlementKey('transfer', row.id, attempt)
      );
      outcome = { status: result.status, body: result.body };
    } catch (err) {
      outcome = { threw: err ?? 'unknown' };
    }
    // 3. WRITE-BACK, at once, whatever the answer.
    await settle(counts, 'transfer', row.id, attempt, outcome);
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
    // FAILURE ISOLATION, as in pass one; a throw after the begin is an unknown
    // answer, same key next tick.
    const attempt = row.refund_attempts ?? 0;
    let outcome: Outcome;
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

      // 1. BEGIN, as in pass one.
      const begun = await beginSend('refund', row.id, attempt);
      if (begun === null) {
        counts.defects++;
        continue;
      }
      if (!begun) {
        counts.blocked++;
        continue;
      }

      counts.attempted++;
      // 2. POST, under rf:<id>:<refund_attempts>; only the database moves the counter.
      const result = await stripe(
        '/v1/refunds',
        {
          payment_intent: row.provider_ref,
          amount: String(amount),
          'metadata[payment_id]': row.id,
        },
        settlementKey('refund', row.id, attempt)
      );
      outcome = { status: result.status, body: result.body };
    } catch (err) {
      outcome = { threw: err ?? 'unknown' };
    }
    // 3. WRITE-BACK, at once, whatever the answer.
    await settle(counts, 'refund', row.id, attempt, outcome);
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
  const refused = requireServiceRole(req, SERVICE_KEY);
  if (refused) return refused;

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
