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
//   1. settlement_send_begin(id, kind, attempt, amount): the database says whether
//      this attempt may be sent now, for exactly this amount (R5-A1: a decision that
//      changed the amount after the queue was read is caught under the row's lock),
//      and starts its 23-hour clock on first use.
//   2. the POST, under settlementKey(kind, id, attempt) (classify.mjs).
//   3. the write-back of settlementVerdict(kind, answer) (classify.mjs):
//        sent     record_settlement_sent: the transfer or refund id and amount,
//                 so the row leaves its queue without waiting for the webhook
//                 (apply_payment_event records the same object idempotently);
//        refused  record_settlement_result 'new_key': the next tick sends a new
//                 attempt (or 'stop' for a refund that cannot fix itself; a
//                 refund answered failed or canceled is first stored and
//                 applied as the refund.failed it is, refundFailedEvent, so
//                 the webhook's rule records the failure at once: R11-A1);
//                 M2-3 (R-E): a refusal more than 3 days into a run of
//                 refusals is recorded by the database as a stop;
//        unknown  record_settlement_result 'same_key': the next tick sends the
//                 same key; after 23 hours the queue no longer offers the row
//                 and it shows in payment_attention for the owner.
//
// A write-back that fails is an unknown: the next tick sends the same key and
// the provider replays its first answer.
//
// PASS THREE (pack 1, F2 ii; M2-2, R-F) moves no money: it cancels the
// PaymentIntent of each row in intents_to_cancel (voided, never held, nothing
// received). Only the intent itself proves anything (intentReading,
// classify.mjs): unless the cancel's answer is this intent read back as
// canceled or succeeded, the drain reads the intent (GET). canceled: a
// payment_intent.canceled fact, stored and applied as the webhook's own two
// steps, then the final stamp (record_intent_cancel). succeeded: a
// payment_intent.succeeded fact with the amount read back, applied by the
// existing funded-after-void rule (the refunds pass sends the refund). Anything
// else, a 404 and any 400 included, proves nothing: record_intent_check moves
// the row to the back of the queue (Codex R3-A6) and keeps the first such
// answer's time; after 1 day it is listed (cancel_unconfirmed), and every tick
// cancels and reads again. A cancel carries no idempotency key: a second cancel
// of a canceled intent is refused, and the read decides.
//
// THE ORDER (A5-04 ii): the five passes take turns between runs (TIME, below);
// in turn 0 the order is pass zero, one, two, three, then the event scan.
//
// THE EVENT SCAN (A5 point 10) moves no money and is the webhook's backstop: it
// reads Stripe's own event list (GET /v1/events, the webhook's eight types,
// SCANNED_EVENT_TYPES), newest first, and each run reads again the whole last
// hour of events before the newest one listed (EVENT_WINDOW_S), so each run's
// window overlaps the last run's; there is no cursor kept between runs. An event
// in the webhook's Stripe API version that the database has not applied is stored
// and applied through the webhook's own two doors (the payment_events insert, a
// 409 meaning already stored, then apply_payment_event), under its own Stripe id:
// apply_payment_event applies an id once (processed_at, under the row's lock),
// whichever door brought it. An event the webhook already tried MAX_APPLY_ATTEMPTS
// times is left to the operator's list, as the webhook leaves it. A run that did
// not read its window to its end, could not read the list, or met an event in
// another API version or one it could not read says so in its report.
//
// PASS ZERO (M2-3b, R-E) moves no money: it reads again, from
// Stripe, the payout account of each worker in payout_accounts_due (a payout
// waits, and payouts are off, or on while Stripe refuses that payout; read at
// most once an hour), at most PAYOUT_READ_LIMIT a run, with the request
// connect-status makes (GET /v2/core/accounts/<id>, the same includes and
// Stripe-Version). Only this account read back proves a state (accountReading,
// classify.mjs), and the state is connect-status's own rule (classifyAccount).
// record_payout_check writes it through set_payouts_status unless another writer
// recorded a state during the read, and stamps every read, so an account that
// Stripe does not answer for moves to the back. A worker who finished setup is
// paid by pass one of the same run when pass one comes after it in that run's
// turn, else by the next run.
//
// THE TRANSFER MUST CARRY metadata[payment_id]. apply_payment_event() finds an
// intent, charge or refund event by the intent id (provider_ref), and a
// transfer.* event by metadata.payment_id alone (R7-A1); a refund's label marks
// the app's own refund. A transfer sent without it produces a transfer.created that
// matches no row, is marked processed, and leaves the payment held forever.
//
// ---------------------------------------------------------------------------
// SECURITY
// ---------------------------------------------------------------------------
// Service role only, checked before anything else runs. Both queues are views
// granted to service_role alone — authenticated and anon are revoked — so the
// GRANTs are the real defence and the check below is the first line of it,
// exactly as in send-push. Its writes — settlement_send_begin,
// record_settlement_sent, record_settlement_result, record_intent_cancel,
// record_intent_check, record_payout_check, and a failed refund's or a read
// intent's fact through the webhook's own payment_events insert and
// apply_payment_event — are service_role-only and record what happened; none
// can move money.
// ============================================================================

import { notConfigured, requireServiceRole, SECRET_KEY, serviceHeaders } from '../_shared/serviceAuth.ts';
import { classifyAccount } from '../connect-status/classify.mjs';
import { accountReading, eventListReading, intentReading, refundFailedEvent, rowOrder, SCANNED_EVENT_TYPES, settlementKey, settlementVerdict, turnOrder } from './classify.mjs';

const STRIPE_API = 'https://api.stripe.com';

// M2-3b (R-E): pass zero reads at most 10 payout accounts a run (payout_accounts_due reads each at
// most once an hour), so at most 120 an hour on the five-minute schedule.
const PAYOUT_READ_LIMIT = 10;

// Accounts v2 pins an exact API version per request: the string connect-status pins
// (tests/settlementRun.test.mjs holds the two equal).
const STRIPE_V2_VERSION = '2026-08-26.dahlia';

// Bound the work per invocation so a backlog cannot run past the Edge Function
// execution limit — the next five-minute tick picks up the remainder. Each row
// is one sequential provider call; parallelising them would trade rate-limit
// headroom and clean per-row failure isolation for wall clock this queue does
// not need.
const QUEUE_LIMIT = 25;

// TIME (M2-1, critic A4-09 iii; A5-04, A5-05). A run lasts at most 60 seconds, every database call
// and every reading of an answer included. Every request carries a timeout of at most 10 seconds, and
// no request runs past the 50th second: the last 10 seconds belong to the run's report
// (record_timer_run) alone, under its own absolute deadline, the 60th second.
// A5-04 (i), A9-05: a row starts only when its ACCEPTED chain (CHAIN_CALLS: every call up to the
// write-back of an accepted answer, each at its full 10 seconds) ends before the 50th second; its last
// start is the 50th second less CHAIN_CALLS x 10 seconds. A call past the accepted chain (the stored
// failure of a refund, the re-read of an intent) runs only when it and the calls after it fit the same
// way (fits); when it does not, nothing is written as done and the row takes the unknown path: the
// same key next run, the provider replays its answer, and a stored event is applied once. No pass has
// a share of its own: the time a pass spends reading its queue is the run's, not that pass's alone.
// A5-04 (ii), fair turns between runs, with no new column: a run's turn is its five-minute slot since
// the epoch (TURN_MS). The five passes run in an order that turns by one each run (turnOrder,
// classify.mjs), and a pass tries the rows it read from an offset that moves by one each time that
// pass goes first (rowOrder); the event scan applies its events oldest first. The queue-wide blocked
// count is read after the rows. A9-03: the turns only turn the QUEUE_LIMIT rows a pass reads; which
// rows those are is the queue's order: each run reads the rows that waited longest (transfers_ready
// and refunds_ready, oldest change first in the queue's order, so a row just tried goes to the back;
// inside one fetched batch the turn rotates, so the tries are not strictly oldest first);
// a row that is ready for more than 1 hour with no try is on the owner's list (A5-04 iv). A run that
// is not slowed down starts every row it reads. The event scan goes first once every 5 runs (25
// minutes), inside its one-hour window.
// A5-04 (iii): a pass that had a ready row and started none is this run's error, in plain words, sent
// with the report (record_timer_run), so the timer line of M1 shows it.
// A5-04 (iv), A9-03 (a): first in every run, in its own request bound, the run notes its ready rows
// (note_ready_rows); one first seen ready more than 1 hour ago whose next try has not started is a
// line on the owner's list, and so (A12-03 part 1) is one whose try began with no answer recorded.
// A5-05: every per-run value (the deadlines, the turn, the rows not started, the passes skipped, the
// stalls) lives in one Run, made by the handler and handed down; nothing per run is kept at module
// level, so two runs that overlap in one instance keep their own deadline and their own report.
// Rows not started wait for the next tick. performance.now() only measures this run; Date.now() only
// picks the turn; every money clock stays in the database.
const REQUEST_TIMEOUT_MS = 10_000;
const RUN_BUDGET_MS = 60_000;
const REPORT_RESERVE_MS = REQUEST_TIMEOUT_MS;
const TURN_MS = 300_000;

/**
 * A9-05, the one table: per pass, the calls of its accepted chain, each at its full REQUEST_TIMEOUT_MS.
 * payouts: the account read, record_payout_check. transfers and refunds: settlement_send_begin, the
 * send, record_settlement_sent. intents: the cancel, the fact stored, applied, record_intent_cancel.
 * events: the event stored, applied.
 */
const CHAIN_CALLS: Record<PassName, number> = { payouts: 2, transfers: 3, refunds: 3, intents: 4, events: 2 };

// A5 point 10: the event scan's window (one hour of Stripe's event times before the newest listed
// event), its page size, and its pages a run (300 events at most). The webhook's own bound on applies:
// MAX_APPLY_ATTEMPTS is the ceiling per event (an event the database already tried to apply 5 times is
// not tried again; event_failed lists it), not a number of events a run.
const EVENT_WINDOW_S = 3_600;
const EVENT_PAGE_LIMIT = 100;
const EVENT_PAGES = 3;
const MAX_APPLY_ATTEMPTS = 5;

type PassName = 'payouts' | 'transfers' | 'refunds' | 'intents' | 'events';

/** The passes in the order of turn 0; turnOrder turns it by one each run. */
const PASS_NAMES: readonly PassName[] = ['payouts', 'transfers', 'refunds', 'intents', 'events'];

/** A5-05: one run's own values. Made by the handler, handed to every call; never shared. */
type Run = {
  /** No request but the report runs past this (the 50th second). */
  requestsEndBy: number;
  /** The report's own absolute deadline (the 60th second). */
  reportEndsBy: number;
  /** This run's five-minute slot: the order of the passes and of the rows. */
  turn: number;
  /** Per pass, the rows this run read and did not start (no time left). */
  notStarted: Record<PassName, number>;
  /** The passes that began with no room for a try and read nothing. */
  skipped: PassName[];
  /**
   * A5-04 (iii): the passes that had a ready row and started none, in plain words; and (A5 point 10)
   * an event scan that did not read its window to its end or met events it did not apply.
   */
  stalled: string[];
};

function newRun(): Run {
  const start = performance.now();
  const requestsEndBy = start + RUN_BUDGET_MS - REPORT_RESERVE_MS;
  return {
    requestsEndBy,
    reportEndsBy: start + RUN_BUDGET_MS,
    turn: Math.floor(Date.now() / TURN_MS),
    notStarted: { payouts: 0, transfers: 0, refunds: 0, intents: 0, events: 0 },
    skipped: [],
    stalled: [],
  };
}

/** A9-05: do `calls` more requests, each at its full REQUEST_TIMEOUT_MS, end before the 50th second? */
function fits(run: Run, calls: number): boolean {
  return performance.now() + calls * REQUEST_TIMEOUT_MS < run.requestsEndBy;
}

/** A5-04 (i), A9-05: may a row of this pass start now: does its whole accepted chain fit? */
function mayStart(run: Run, name: PassName): boolean {
  return fits(run, CHAIN_CALLS[name]);
}

/**
 * A pass begins. With room for a try it goes on and reads its queue. Without (A5-04 iii) it reads
 * nothing and is listed skipped; while requests may still run it counts its ready rows, and a ready
 * row that this run could not start is the run's error ("not read" when even the count could not run;
 * A9-06: a count that ran and failed says so).
 */
async function beginPass(run: Run, name: PassName, readyView: string | null, key = 'id'): Promise<boolean> {
  if (mayStart(run, name)) return true;
  run.skipped.push(name);
  // The event scan has no queue to count: skipped, it reads its hour again in a later run.
  if (readyView === null) return false;
  if (performance.now() >= run.requestsEndBy) {
    run.stalled.push(`${name}: not read, the run had no time left`);
    return false;
  }
  const waiting = await countRows(run, readyView, key);
  if (waiting === null) run.stalled.push(`${name}: the run had no time left, and its ready rows could not be counted`);
  else if (waiting > 0) run.stalled.push(`${name}: ${waiting} ready, none started, the run had no time left`);
  return false;
}

/** A5-04 (iii): a pass that read ready rows and started none. */
function noteStall(run: Run, name: PassName, read: number): void {
  if (read > 0 && run.notStarted[name] === read) {
    run.stalled.push(`${name}: ${read} ready, none started, the run had no time left`);
  }
}

/** A fetch init with this run's per-request timeout: 10 seconds, never past `endBy` (the 50th second). */
function timed(run: Run, init: RequestInit = {}, endBy = run.requestsEndBy): RequestInit {
  const ms = Math.min(REQUEST_TIMEOUT_MS, endBy - performance.now());
  return { ...init, signal: AbortSignal.timeout(Math.max(1, Math.floor(ms))) };
}

/** The name this task reports under: the name of its cron job (cron:<name>, task:<name>). */
const TIMER_NAME = 'brazos-process-settlements';

/**
 * M2-1 (A4-09 ii): the run's outcome for its timer, from every pass, not from `ok` alone. null when
 * no pass threw and no pass had a defect; else one clause per such pass. A row left for the next
 * tick by the budget is not a failure.
 */
function runError(errors: string[], passes: Record<string, Tally>, stalled: string[] = []): string | null {
  const clauses = [...errors];
  for (const [name, counts] of Object.entries(passes)) {
    if (counts.defects > 0) clauses.push(`${name}: ${counts.defects} defect${counts.defects === 1 ? '' : 's'}`);
  }
  // A5-04 (iii): no progress is a defect the owner sees.
  clauses.push(...stalled);
  return clauses.length > 0 ? clauses.join('; ') : null;
}

/**
 * A5-04 (iv), A9-03 (a): first in every run, in its own request bound (10 seconds), the run notes which
 * rows are ready (note_ready_rows), so the owner's list shows a row first seen ready more than 1 hour
 * ago whose next try has not started (transfer_not_started, refund_not_started), or (A12-03 part 1)
 * whose try began and has no answer recorded (transfer_no_answer_yet, refund_no_answer_yet). It never
 * depends on time the passes leave. It only sees: no pass reads what it writes, and it moves no money.
 * A failure is a clause of this run's report; never throws.
 */
async function noteReadyRows(run: Run): Promise<string | null> {
  try {
    const res = await serviceRpc(run, 'note_ready_rows', {});
    const body = await res.text().catch(() => '');
    return res.ok ? null : `ready: note_ready_rows failed ${res.status}: ${body.slice(0, 200)}`;
  } catch (err) {
    return `ready: note_ready_rows threw: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** The run's report (record_timer_run). true when written; never throws. */
async function reportRun(run: Run, error: string | null): Promise<boolean> {
  try {
    // A5-05: the report's own absolute deadline, the 60th second of this run.
    const res = await serviceRpc(run, 'record_timer_run', { p_name: TIMER_NAME, p_error: error, p_stale_after: null }, run.reportEndsBy);
    if (res.ok) return true;
    console.error(`process-settlements: record_timer_run failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return false;
  } catch (err) {
    console.error('process-settlements: record_timer_run threw:', err);
    return false;
  }
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
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

type CancelRow = {
  id: string;
  provider_ref: string | null;
};

type PayoutRow = {
  user_id: string;
  stripe_account_id: string | null;
  payouts_checked_at: string | null;
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

async function getRows<T>(run: Run, path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, timed(run, { headers: serviceHeaders() }));
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
async function countRows(run: Run, view: string, key = 'id'): Promise<number | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${view}?select=${key}&limit=1`, timed(run, {
      method: 'HEAD',
      headers: { ...serviceHeaders(), Prefer: 'count=exact' },
    }));
    if (!res.ok) return null;
    const total = res.headers.get('content-range')?.split('/')[1];
    const n = total == null ? NaN : Number(total);
    return Number.isInteger(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

/** The queue-wide blocked count for a pass: everything due that is not ready. */
async function countBlocked(run: Run, due: string, ready: string): Promise<number> {
  const [d, r] = await Promise.all([countRows(run, due), countRows(run, ready)]);
  return d != null && r != null ? Math.max(0, d - r) : 0;
}

/** A service_role RPC: writes no client may make. */
async function serviceRpc(run: Run, fn: string, args: Record<string, unknown>, endBy = run.requestsEndBy): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, timed(run, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify(args),
  }, endBy));
}

/**
 * A5-01: a provider answer is its whole body, parsed into an object, or no answer at all. A body that
 * cannot be read to its end (the timeout can cut it after the headers came), is empty, is not JSON or
 * is not an object is handed on as threw, which every classifier reads as unknown: never {}, never a
 * refusal, never "absent", "canceled" or "not found".
 */
async function answerOf(res: Response): Promise<Outcome> {
  let text: string;
  try {
    text = await res.text();
  } catch (err) {
    return { threw: new Error(`${res.status} answer cut short: ${err instanceof Error ? err.message : String(err)}`) };
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { threw: new Error(`${res.status} answer could not be read${text === '' ? ': empty' : ': not JSON'}`) };
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { threw: new Error(`${res.status} answer could not be read: not an object`) };
  }
  return { status: res.status, body: body as Record<string, unknown> };
}

/** A provider POST. A throw (no answer, a timeout before the headers) reaches the caller. */
async function stripe(
  run: Run,
  path: string,
  fields: Record<string, string>,
  idempotencyKey: string | null
): Promise<Outcome> {
  const res = await fetch(`${STRIPE_API}${path}`, timed(run, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(idempotencyKey === null ? {} : { 'Idempotency-Key': idempotencyKey }),
    },
    body: new URLSearchParams(fields).toString(),
  }));
  return await answerOf(res);
}

/**
 * M2-2: a provider read (GET, platform scope: no Stripe-Account header). A throw is the outcome's threw.
 * M2-3b: `headers` adds to the authorization (the payout read's Stripe-Version).
 */
async function stripeRead(run: Run, path: string, headers: Record<string, string> = {}): Promise<Outcome> {
  try {
    const res = await fetch(`${STRIPE_API}${path}`, timed(run, { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, ...headers } }));
    return await answerOf(res);
  } catch (err) {
    return { threw: err ?? 'unknown' };
  }
}

/** A positive integer number of cents, or null. Never coerced, never defaulted. */
function cents(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * A service_role RPC that returns a boolean. Never throws: an error, a non-2xx
 * or a non-boolean answer is null, which the caller counts as a defect.
 */
async function rpcBoolean(run: Run, fn: string, args: Record<string, unknown>, label: string): Promise<boolean | null> {
  try {
    const res = await serviceRpc(run, fn, args);
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
 * Step 1 of a row: may this attempt be sent now, for this amount? true = send;
 * false = not now (the row left the queue, the attempt moved on, its 23 hours are
 * over, or the amount is no longer the row's); null = the begin itself failed, and
 * nothing is sent.
 */
function beginSend(run: Run, kind: Kind, paymentId: string, attempt: number, amount: number): Promise<boolean | null> {
  return rpcBoolean(
    run,
    'settlement_send_begin',
    { p_payment_id: paymentId, p_kind: kind, p_attempt: attempt, p_amount_cents: amount },
    `${kind} ${paymentId}`
  );
}

/**
 * A fact the drain saw, stored and applied through the webhook's own two steps (a 409 means already
 * stored: apply anyway): Codex R11-A1, a refund the provider answered failed, as the refund.failed it
 * is; M2-2, a voided row's intent read back as canceled or succeeded. true only when the database
 * applied it to this payment. Never throws.
 */
async function recordFact(run: Run, event: { id: string; type: string; payload: Record<string, unknown> }, paymentId: string, label: string): Promise<boolean> {
  // A9-05: one write-back follows the fact (record_settlement_result, record_intent_cancel).
  const answer = await storeAndApply(run, event.id, event.type, null, event.payload, label, 1);
  return answer !== null && answer.ok === true && answer.payment_id === paymentId;
}

/**
 * The webhook's own two doors, in its order: the payment_events insert (a 409 means already stored:
 * apply anyway), then apply_payment_event. The apply's answer, or null when a door failed or threw.
 * Never throws.
 */
async function storeAndApply(
  run: Run,
  id: string,
  type: string,
  account: string | null,
  payload: Record<string, unknown>,
  label: string,
  after = 0
): Promise<{ ok?: boolean; payment_id?: string | null } | null> {
  try {
    // A9-05: the insert and the apply each run only when they and the `after` calls that follow fit.
    if (!fits(run, 2 + after)) return null;
    const stored = await fetch(`${SUPABASE_URL}/rest/v1/payment_events`, timed(run, {
      method: 'POST',
      headers: { ...serviceHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ id, type, account_id: account, payload }),
    }));
    if (!stored.ok && stored.status !== 409) {
      console.error(`process-settlements: payment_events insert for ${label} failed ${stored.status}: ${(await stored.text()).slice(0, 300)}`);
      return null;
    }
    if (!fits(run, 1 + after)) return null;
    const applied = await serviceRpc(run, 'apply_payment_event', { p_event_id: id });
    const answer = applied.ok ? ((await applied.json().catch(() => null)) as { ok?: boolean; payment_id?: string | null } | null) : null;
    if (answer?.ok !== true) console.error(`process-settlements: apply_payment_event for ${label} did not record ${type} (${applied.status})`);
    return answer !== null && typeof answer === 'object' ? answer : null;
  } catch (err) {
    console.error(`process-settlements: ${type} of ${label} could not be recorded:`, err);
    return null;
  }
}

/**
 * Step 3 of a row: the verdict on the answer, tallied and written back at
 * once. The single implementation of the rule for both queues.
 */
async function settle(run: Run, counts: Tally, kind: Kind, paymentId: string, attempt: number, outcome: Outcome): Promise<void> {
  const verdict = settlementVerdict(kind, outcome);
  const label = `${kind} ${paymentId} attempt ${attempt}`;
  if (verdict.next === 'write_back') {
    const recorded = await rpcBoolean(
      run,
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
  // R11-A1: a refund answered failed is recorded as the failure it is before the attempt stops. Not
  // recorded: an unknown, as a failed write-back above (the same key next tick; the provider replays
  // this answer, and a stored event is applied once).
  const failed = refundFailedEvent(kind, outcome);
  if (failed !== null && !(await recordFact(run, failed, paymentId, label))) {
    counts.deferred++;
    counts.defects++;
    return;
  }
  if (verdict.deferred) counts.deferred++;
  else counts.failed++;
  console.error(`process-settlements: ${label} ${verdict.result}, next ${verdict.next} — ${verdict.message}`);
  const recorded = await rpcBoolean(
    run,
    'record_settlement_result',
    { p_payment_id: paymentId, p_kind: kind, p_attempt: attempt, p_next: verdict.next, p_error: verdict.message },
    label
  );
  if (recorded === null) counts.defects++;
}

// ---------------------------------------------------------------------------
// Pass zero: the payout accounts read again. No money moves.
// ---------------------------------------------------------------------------
async function runPayoutReads(run: Run): Promise<Tally> {
  const counts = tally();
  if (!(await beginPass(run, 'payouts', 'payout_accounts_due', 'user_id'))) return counts;
  const rows = rowOrder(run.turn, PASS_NAMES.length, await getRows<PayoutRow>(
    run,
    `payout_accounts_due?select=user_id,stripe_account_id,payouts_checked_at&limit=${PAYOUT_READ_LIMIT}`
  ));

  for (const [index, row] of rows.entries()) {
    if (!mayStart(run, 'payouts')) {
      run.notStarted.payouts = rows.length - index;
      break;
    }
    if (!row.stripe_account_id) {
      counts.defects++;
      continue;
    }
    counts.attempted++;
    const accountId = row.stripe_account_id;
    const label = `payout account of ${row.user_id}`;
    // The request connect-status makes, with the two objects its rule reads.
    const read = await stripeRead(
      run,
      `/v2/core/accounts/${encodeURIComponent(accountId)}?include[0]=configuration.recipient&include[1]=requirements`,
      { 'Stripe-Version': STRIPE_V2_VERSION }
    );
    const reading = accountReading(accountId, read);
    const status = reading.account === null ? null : classifyAccount(reading.account);
    const answer = status === null ? reading.answer : `${reading.answer} ${status}`;
    if (status === null) console.error(`process-settlements: ${label}: ${answer}; read again in an hour`);
    const recorded = await rpcBoolean(
      run,
      'record_payout_check',
      { p_user_id: row.user_id, p_seen: row.payouts_checked_at, p_status: status, p_answer: answer },
      label
    );
    if (recorded === null) counts.defects++;
    else if (!recorded) counts.blocked++;
    else if (status === null) counts.deferred++;
    else counts.succeeded++;
  }

  noteStall(run, 'payouts', rows.length);
  return counts;
}

// ---------------------------------------------------------------------------
// Pass one: money out to the worker.
// ---------------------------------------------------------------------------
async function runTransfers(run: Run): Promise<Tally> {
  const counts = tally();
  if (!(await beginPass(run, 'transfers', 'transfers_ready'))) return counts;
  // A9 (2026-10-03): the drain reads transfers_READY — transfers_due minus the payees it could
  // never pay (no ENABLED payout account) (20261003000000). Before, 25 blocked rows at the head of
  // transfers_due hid every payable row behind them, tick after tick. The blocked count is now the
  // whole difference between the two queues, not one batch's share. A9 review: the view's order
  // is transfer_attempts, then release_requested_at (20261003001100) — a row never tried before
  // any row the provider has refused — so 25 rows refused for a reason of their own (key rotated,
  // retried every tick) cannot fill this read and starve the payable rows behind them. A9-03 (c,
  // ready_wait): the queue's order is now the oldest last change first (updated_at; inside the
  // fetched batch the turn rotates, below): every begun try
  // (settlement_send_begin) sends its row to the back, also one that never writes back, and a row of
  // a higher attempt is not behind every new row. This
  // function adds no order of its own to which rows it reads: the view's is the queue's. A5-04 (ii):
  // it tries the rows it read from this run's offset (rowOrder). The queue-wide blocked count is read
  // after the rows (A5-04 i), so it never takes the time of the first row.
  const rows = rowOrder(run.turn, PASS_NAMES.length, await getRows<TransferRow>(
    run,
    `transfers_ready?select=id,payee_id,transfer_cents,transfer_attempts&limit=${QUEUE_LIMIT}`
  ));
  if (rows.length === 0) {
    counts.blocked += await countBlocked(run, 'transfers_due', 'transfers_ready');
    return counts;
  }

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
      run,
      `payment_accounts?select=user_id,stripe_account_id&payouts_enabled=eq.true&user_id=in.(${payees.map(encodeURIComponent).join(',')})`
    );
    for (const row of list) {
      if (row.stripe_account_id) accounts.set(row.user_id, row.stripe_account_id);
    }
  }

  for (const [index, row] of rows.entries()) {
    // M2-1, A5-04 (i), A9-05: only while the transfer's chain fits; the rest waits for the next tick.
    if (!mayStart(run, 'transfers')) {
      run.notStarted.transfers = rows.length - index;
      break;
    }
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
      const begun = await beginSend(run, 'transfer', row.id, attempt, amount);
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
      outcome = await stripe(
        run,
        '/v1/transfers',
        {
          amount: String(amount),
          currency: 'usd',
          destination,
          'metadata[payment_id]': row.id,
        },
        settlementKey('transfer', row.id, attempt)
      );
    } catch (err) {
      outcome = { threw: err ?? 'unknown' };
    }
    // 3. WRITE-BACK, at once, whatever the answer.
    await settle(run, counts, 'transfer', row.id, attempt, outcome);
  }

  noteStall(run, 'transfers', rows.length);
  counts.blocked += await countBlocked(run, 'transfers_due', 'transfers_ready');
  return counts;
}

// ---------------------------------------------------------------------------
// Pass two: money back to the customer.
// ---------------------------------------------------------------------------
async function runRefunds(run: Run): Promise<Tally> {
  const counts = tally();
  if (!(await beginPass(run, 'refunds', 'refunds_ready'))) return counts;
  // A9: refunds_READY — refunds_due minus the rows with no provider reference to refund against
  // (20261003000000), so such a row cannot sit at the head and hide refundable rows behind it.
  // A5-04: the rows from this run's offset; the blocked count after them.
  const rows = rowOrder(run.turn, PASS_NAMES.length, await getRows<RefundRow>(
    run,
    `refunds_ready?select=id,provider_ref,refund_cents,refund_attempts&limit=${QUEUE_LIMIT}`
  ));

  for (const [index, row] of rows.entries()) {
    if (!mayStart(run, 'refunds')) {
      run.notStarted.refunds = rows.length - index;
      break;
    }
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
      const begun = await beginSend(run, 'refund', row.id, attempt, amount);
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
      outcome = await stripe(
        run,
        '/v1/refunds',
        {
          payment_intent: row.provider_ref,
          amount: String(amount),
          'metadata[payment_id]': row.id,
        },
        settlementKey('refund', row.id, attempt)
      );
    } catch (err) {
      outcome = { threw: err ?? 'unknown' };
    }
    // 3. WRITE-BACK, at once, whatever the answer.
    await settle(run, counts, 'refund', row.id, attempt, outcome);
  }

  noteStall(run, 'refunds', rows.length);
  counts.blocked += await countBlocked(run, 'refunds_due', 'refunds_ready');
  return counts;
}

// ---------------------------------------------------------------------------
// Pass three: the payment intent of a voided row, cancelled. No money moves.
// ---------------------------------------------------------------------------
async function runIntentCancels(run: Run): Promise<Tally> {
  const counts = tally();
  if (!(await beginPass(run, 'intents', 'intents_to_cancel'))) return counts;
  const rows = rowOrder(run.turn, PASS_NAMES.length,
    await getRows<CancelRow>(run, `intents_to_cancel?select=id,provider_ref&limit=${QUEUE_LIMIT}`));

  for (const [index, row] of rows.entries()) {
    if (!mayStart(run, 'intents')) {
      run.notStarted.intents = rows.length - index;
      break;
    }
    if (!row.provider_ref) {
      counts.defects++;
      continue;
    }
    counts.attempted++;
    const ref = row.provider_ref;
    const label = `intent ${ref} of payment ${row.id}`;
    let cancel: Outcome;
    try {
      cancel = await stripe(run, `/v1/payment_intents/${encodeURIComponent(ref)}/cancel`, { cancellation_reason: 'abandoned' }, null);
    } catch (err) {
      cancel = { threw: err ?? 'unknown' };
    }
    // M2-2 (R-F): only this intent, read back as canceled or succeeded, proves anything. The cancel's
    // own answer may; when it does not, the intent is read.
    let reading = intentReading(ref, cancel, 'cancel');
    // A9-05: the re-read runs only when it and the rest of the chain (stored, applied, stamped) fit;
    // else the cancel stays unproven (record_intent_check) and is asked again next run.
    if (reading.event === null && fits(run, CHAIN_CALLS.intents)) {
      const read = intentReading(ref, await stripeRead(run, `/v1/payment_intents/${encodeURIComponent(ref)}`), 'read');
      reading = { ...read, answer: `${reading.answer}; ${read.answer}` };
    }
    if (reading.event !== null && (await recordFact(run, reading.event, row.id, label))) {
      if (reading.state === 'succeeded') {
        // Funded after the void: the fact queued the refund (refunds_due); the row left this queue.
        counts.succeeded++;
        continue;
      }
      const recorded = await rpcBoolean(run, 'record_intent_cancel', { p_payment_id: row.id, p_final: true }, label);
      if (recorded === null) counts.defects++;
      else counts.succeeded++;
      continue;
    }
    // Unproven, or a fact that could not be recorded (a defect): the row goes to the back of the queue
    // (R3-A6), so rows that keep failing never hold the others out of QUEUE_LIMIT, and the next tick
    // cancels and reads again. R4-A6: a recorder that did not answer is a defect here too.
    counts.deferred++;
    if (reading.event !== null) counts.defects++;
    const answer = reading.event === null ? reading.answer : `${reading.answer}; the fact was not recorded`;
    console.error(`process-settlements: ${label}: ${answer}; asked again next tick`);
    const moved = await rpcBoolean(run, 'record_intent_check', { p_payment_id: row.id, p_answer: answer }, `${label} unproven`);
    if (moved === null) counts.defects++;
  }

  noteStall(run, 'intents', rows.length);
  return counts;
}

// ---------------------------------------------------------------------------
// The event scan (A5 point 10): Stripe's own event list, the webhook's backstop. No money moves here
// but through apply_payment_event, as from the webhook.
// ---------------------------------------------------------------------------
type ListedEvent = Record<string, unknown> & { id: string; type: string; created: number; account?: unknown };

const LIST_UNREAD = "events: Stripe's event list could not be read";

async function runEventScan(run: Run): Promise<Tally> {
  const counts = tally();
  if (!(await beginPass(run, 'events', null))) return counts;
  const types = SCANNED_EVENT_TYPES.map((t: string) => `types[]=${encodeURIComponent(t)}`).join('&');
  const inWindow: ListedEvent[] = [];
  let windowStart: number | null = null;
  let after: string | null = null;
  let reachedEnd = false;
  // A9-02: how far back this scan read: it met the window's start, or (else) the oldest event it read.
  let atWindowStart = false;
  let oldest: number | null = null;
  let listUnread = false;
  let read = 0;
  let foreign = 0;
  let unreadable = 0;
  let unstored = 0;
  for (let page = 0; page < EVENT_PAGES && !reachedEnd && mayStart(run, 'events'); page++) {
    const reading = eventListReading(await stripeRead(
      run,
      `/v1/events?limit=${EVENT_PAGE_LIMIT}&${types}${after === null ? '' : `&starting_after=${encodeURIComponent(after)}`}`,
      { 'Stripe-Version': STRIPE_V2_VERSION }
    ), STRIPE_V2_VERSION);
    if (reading.page === null) {
      run.stalled.push(`${LIST_UNREAD} (${reading.answer})`);
      listUnread = true;
      break;
    }
    unreadable += reading.page.unreadable;
    for (const { event, ours } of reading.page.events) {
      const created = event.created as number;
      if (windowStart === null) windowStart = created - EVENT_WINDOW_S;
      if (created < windowStart) {
        reachedEnd = true;
        atWindowStart = true;
        break;
      }
      read++;
      oldest = created;
      if (ours) inWindow.push(event as ListedEvent);
      else foreign++;
    }
    after = reading.page.lastId;
    if (!reading.page.hasMore || after === null) reachedEnd = true;
  }
  if (!reachedEnd && !listUnread) {
    run.stalled.push(`events: the last hour of Stripe's events was not read to its end (${read} read)`);
  }
  if (foreign > 0) {
    counts.blocked += foreign;
    run.stalled.push(`events: ${foreign} event${foreign === 1 ? ' is' : 's are'} in another Stripe API version than the webhook's, not applied`);
  }
  if (unreadable > 0) run.stalled.push(`events: ${unreadable} listed event${unreadable === 1 ? '' : 's'} could not be read, not applied`);

  // Which of them the database already applied, or the webhook gave up on (its bound).
  const known = new Map<string, { processed_at: string | null; attempts: number | null }>();
  for (let i = 0; i < inWindow.length; i += EVENT_PAGE_LIMIT) {
    const ids = inWindow.slice(i, i + EVENT_PAGE_LIMIT).map((e) => encodeURIComponent(e.id)).join(',');
    const rows = await getRows<{ id: string; processed_at: string | null; attempts: number | null }>(
      run,
      `payment_events?select=id,processed_at,attempts&id=in.(${ids})`
    );
    for (const row of rows) known.set(row.id, row);
  }
  // Oldest first, as they happened.
  const toApply = inWindow.filter((e) => {
    const row = known.get(e.id);
    return row === undefined || (row.processed_at === null && (row.attempts ?? 0) < MAX_APPLY_ATTEMPTS);
  }).reverse();

  for (const [index, event] of toApply.entries()) {
    if (!mayStart(run, 'events')) {
      run.notStarted.events = toApply.length - index;
      break;
    }
    counts.attempted++;
    const account = typeof event.account === 'string' && event.account !== '' ? event.account : null;
    const answer = await storeAndApply(run, event.id, event.type, account, event, `event ${event.id}`);
    if (answer === null) {
      counts.deferred++;
      counts.defects++;
      unstored++;
    } else if (answer.ok === true) {
      counts.succeeded++;
    } else {
      // Recorded by apply_payment_event as a failed try (attempts + 1); read again while in the window.
      counts.deferred++;
    }
  }

  noteStall(run, 'events', toApply.length);

  // A9-02: the scan reports how far back it read (record_event_scan) only when every listed event of
  // its version is stored (applied, or failed and listed as event_failed); else it reports nothing and
  // its time stays uncovered: a later scan covers it, or the database lists the gap. p_read_from: the
  // window's start when it met it, null when the list ended first (every listed event read), else the
  // oldest event read (the page limit or the run stopped it).
  if (!listUnread && foreign === 0 && unreadable === 0 && unstored === 0 && run.notStarted.events === 0
      && (reachedEnd || oldest !== null)) {
    const readFrom = reachedEnd ? (atWindowStart ? windowStart : null) : oldest;
    const recorded = await rpcBoolean(run, 'record_event_scan', { p_window_from: windowStart, p_read_from: readFrom }, 'the event scan');
    if (recorded === null) run.stalled.push('events: how far back the scan read could not be recorded');
  }
  return counts;
}

Deno.serve(async (req) => {
  const unset = notConfigured('process-settlements', { SUPABASE_URL, SECRET_KEY, STRIPE_SECRET_KEY });
  if (unset) return unset;

  // Before anything else. Supabase's own verify_jwt would accept any signed-in
  // user's token, so this comparison — not that gate — is what keeps ordinary
  // users out of the money queues.
  const refused = requireServiceRole(req);
  if (refused) return refused;

  // The five passes (payout accounts M2-3b, transfers, refunds, intent cancels, the event scan), in this run's turn
  // (A5-04 ii). Each pass is independent: a pass that throws outright still leaves the others' counts
  // in the summary, because the summary is what the operator reads when something looks wrong. Its
  // shape is { attempted, succeeded, deferred, failed, defects, blocked } per pass (Tally, above);
  // deferred is not a defect and failed is not timing.
  // A5-05: this run's own values, made here and handed down; no other run can change them.
  const run = newRun();
  // A9-03 (a): the note of the ready rows comes first, before any pass can use the run's time. Its
  // failure is a clause of the report (the timer line shows it), not a pass that threw: `ok` keeps its
  // meaning.
  const noted = await noteReadyRows(run);
  const passes: Record<PassName, (run: Run) => Promise<Tally>> = {
    payouts: runPayoutReads,
    transfers: runTransfers,
    refunds: runRefunds,
    intents: runIntentCancels,
    events: runEventScan,
  };
  const counts: Record<PassName, Tally> = { payouts: tally(), transfers: tally(), refunds: tally(), intents: tally(), events: tally() };
  const errors: string[] = [];

  for (const name of turnOrder(run.turn, PASS_NAMES) as PassName[]) {
    try {
      counts[name] = await passes[name](run);
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
      console.error(`process-settlements: ${name} pass failed`, err);
    }
  }

  // M2-1: the run reports itself, last, with every pass's outcome. A report that cannot be written
  // is an error of this run; the timer then shows the task late after its 20 minutes.
  // A5-05: the report has the last 10 seconds to itself, up to this run's own 60th second.
  const reported = await reportRun(run, runError(noted ? [...errors, noted] : errors, counts, run.stalled));
  if (!reported) errors.push('timer: record_timer_run was not written');

  return json({
    ok: errors.length === 0,
    limit: QUEUE_LIMIT,
    payouts: counts.payouts,
    transfers: counts.transfers,
    refunds: counts.refunds,
    intents: counts.intents,
    events: counts.events,
    budget: { not_started: run.notStarted, skipped: run.skipped },
    stalled: run.stalled,
    ...(errors.length > 0 ? { errors } : {}),
  });
});
