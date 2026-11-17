import type { Payment } from './payments';

/**
 * The pure money predicates (R6a, D24). isHeld, isReleased and
 * canOfferJobFunding moved here VERBATIM from lib/payments.ts — a module with
 * NO runtime imports, the lib/earningsMath.ts arrangement — so
 * tests/fundingPath.test.mjs executes them directly under node instead of
 * stubbing the supabase client around them. lib/payments.ts re-exports every
 * name, so no importer changed. isReleaseRequested (D23) is new.
 */

/** True once funds are protected. §H.3: "held" is the ONLY state the app may
 *  describe as protected. Since phase51, approval (or the 72h clock) can move
 *  a held payment to released — see isReleased. */
export function isHeld(payment: Pick<Payment, 'status'>): boolean {
  return payment.status === 'held';
}

/** True once funds have left protection toward the worker — released or
 *  already paid out. The ONLY states the app may describe as released. */
export function isReleased(payment: Pick<Payment, 'status'>): boolean {
  return payment.status === 'released' || payment.status === 'paid_out';
}

/**
 * D23 — APPROVED, PAYOUT PENDING. `release_job_payment` (and the 72h
 * `auto_release_due_payments`) set `release_requested_at` and `transfer_cents`
 * on a stripe row and LEAVE ITS STATUS `held` until the provider's
 * `transfer.created` lands. So a row
 * with status held AND release_requested_at set is approved — the customer's
 * decision is made and the payout is on its way. isReleased is deliberately
 * NOT widened: nothing may say released before the transfer exists.
 */
export function isReleaseRequested(
  payment: Pick<Payment, 'status'> & { release_requested_at?: string | null }
): boolean {
  return payment.status === 'held' && !!payment.release_requested_at;
}

/**
 * Final sweep (2026-10-03) — THE CANCELLATION SHAPE. cancel_job() and ban_user()
 * direct a held card payment home by setting `refund_cents` on the row while its
 * status stays `held` until the provider's charge.refunded lands. Nothing about such a row
 * is "held in protection" or "approved" any more: the money is on its way back.
 * One predicate, so the customer's page, the worker's page and Earnings agree.
 */
export function isRefundQueued(
  payment: Pick<Payment, 'status'> & { refund_cents?: number | null }
): boolean {
  return payment.status === 'held' && (payment.refund_cents ?? 0) > 0;
}

/**
 * The late-cancellation shape: a refund queued beside a cancellation fee going
 * to the worker (cancel_job()'s customer_cancelled_late branch sets both
 * `refund_cents` and `transfer_cents`, with release_requested_at for the fee's
 * transfer). isReleaseRequested is true on that row too, so a caller asks this
 * FIRST — the fee is not an approval of finished work.
 * G1-2: once the rest's refund lands the row is `partially_refunded` and no refund is queued; the
 * fee is still the worker's, so that row asks the durable fact (as lib/earningsCopy.ts does).
 */
export function isCancellationFeeKept(
  payment: Pick<Payment, 'status'> & { refund_cents?: number | null; transfer_cents?: number | null; release_reason?: string | null }
): boolean {
  if (payment.status === 'partially_refunded') {
    return payment.release_reason === 'cancellation_fee' && (payment.transfer_cents ?? 0) > 0;
  }
  return isRefundQueued(payment) && (payment.transfer_cents ?? 0) > 0;
}

/**
 * Pack 1, F2: a refund of this payment reached the provider and failed (refund.failed): the money
 * is back with Brazos, not on its way to the card. The status does not say it (a failed refund
 * changes no status, Codex R3-A1), so this asks only whether the failure is still waiting (R4-A5:
 * any failed refund, whatever refund_cents says); refund_failed_at clears when the owner records
 * how it was arranged (resolve_refund_failure).
 */
export function isRefundFailed(payment: { refund_failed_at?: string | null }): boolean {
  return payment.refund_failed_at != null;
}

/**
 * Pack 1, P3: the owner recorded that the failed refund was made another way (resolve_refund_failure
 * stamps refund_arranged_at), and no failure has come since. A new failure wins (isRefundFailed).
 */
export function isRefundArranged(payment: {
  refund_failed_at?: string | null;
  refund_arranged_at?: string | null;
}): boolean {
  return payment.refund_failed_at == null && payment.refund_arranged_at != null;
}

/**
 * Codex R7-A3, R8-A1: THE payout promise. A sentence that says the worker's payout is on its way (or
 * waits only on their payout setup) asks this and nothing else. It is the database's fact
 * (my_payouts_on_their_way: the row is in transfers_due, or a transfer whose send began has no
 * recorded result), put on the row by the read that fetched it (lib/payments.ts withPayoutFact). The
 * columns the app reads cannot tell an open issue, a reversed transfer or a card dispute from a
 * normal approval, so nothing here derives it from them.
 */
export function isPayoutOnItsWay(payment: Pick<Payment, 'payoutOnItsWay'>): boolean {
  return payment.payoutOnItsWay === true;
}

/**
 * Whether the funding CTA (Checkout) may be offered for this job — THE one
 * derivation for every surface that can show it (AUD-P1-02; the lifecycle
 * derivation drifted into a duplicate once already, so this predicate exists
 * exactly once). It is never WIDER than the server contract of
 * begin_job_payment (20261115000100_payer_money_rpcs.sql): the job's owner,
 * an assigned worker, status 'assigned' and nothing else — the server refuses
 * a job already in progress or completed with 'Accept an offer before
 * protecting a payment', so offering it there was a button that could only
 * fail (C23).
 *
 * The payment side is a strict WHITELIST: offer only on
 *   - no active row (checkout never ran; failed/voided rows read as null), or
 *   - an 'unfunded' row whose funding window has not closed.
 * Every other row — 'authorized' included, which the server answers with
 * 'This job already has a protected payment' — held, released, paid_out,
 * refunded, partially_refunded, the legacy 'pending', and anything
 * unrecognized mean money already moved — or a state this client cannot
 * positively classify — and the answer is NO for all of them: a wrongly-shown
 * checkout here is a double-charge surface. An open dispute also suppresses
 * the offer; it exists to freeze money movement.
 *
 * D9 — WHY 'unfunded' IS ON THE WHITELIST, AND WHY THE WINDOW IS CHECKED.
 * (1) create-payment mints a stripe row as `unfunded` before the card sheet
 * opens; a customer who closes the sheet leaves that row behind, and without
 * this arm they had no path back to checkout for 24 hours. (2) Past its
 * funding_due_at the server never resumes that row: begin_job_payment voids
 * it ('funding window expired') and starts a fresh one (A2), and the sweeper
 * (expire_unfunded_payments, every 15 minutes) voids it on its own. The app
 * still refuses a lapsed row — narrower than the server, so never a button
 * that fails — and the checkout comes back once the row is voided (decided
 * 2026-11-16, choice 1). A window this client cannot parse is refused for the
 * same reason; a null window (no due date recorded) is not a lapsed one.
 */
export function canOfferJobFunding({
  viewerId,
  job,
  payment,
  hasOpenDispute = false,
  nowMs = Date.now(),
}: {
  viewerId: string | null | undefined;
  job: { client_id: string; status: string; assigned_worker_id: string | null };
  payment: (Pick<Payment, 'status'> & { funding_due_at?: string | null }) | null;
  hasOpenDispute?: boolean;
  nowMs?: number;
}): boolean {
  if (!viewerId || viewerId !== job.client_id) return false;
  if (!job.assigned_worker_id) return false;
  if (job.status !== 'assigned') return false;
  if (hasOpenDispute) return false;
  if (payment == null) return true;
  if (payment.status === 'unfunded') {
    if (payment.funding_due_at == null) return true;
    const due = Date.parse(payment.funding_due_at);
    if (!Number.isFinite(due)) return false;
    return nowMs < due;
  }
  return false;
}

/**
 * Tier A (C2, v3 D-4): THE customer's held figure — the row's own
 * charge_amount_cents (agreed price + protection fee + tax, generated in the
 * database), never amount_cents. Read off the column; the `??` is null-safety
 * for a row the type allows to lack it, not arithmetic. Every customer-facing "held in protection" amount —
 * JobConfirmed, ClientJobDetail, ApproveOrDispute and its CTA — reads this.
 */
export function customerChargeCents(
  payment: Pick<Payment, 'amount_cents' | 'charge_amount_cents'>
): number {
  return payment.charge_amount_cents ?? payment.amount_cents;
}

/* ------------------------------------------------------------------------- *
 * CANCELLING A HIRED JOB — the client-side preview of cancel_job().
 *
 * `public.cancel_job(p_job_id, p_reason)` is the authority and decides again
 * at the moment of the call (supabase/migrations/20261108000000_lean_v1.sql).
 * These functions only say, before the tap, what the SQL will most likely do,
 * mirroring it case for case (tests/cancelJob.test.mjs holds the pairing):
 *   customer_cancelled — in_progress always carries the fee; otherwise free
 *     when the job has no scheduled_date, or within 15 minutes of acceptance
 *     (the agreement snapshot's accepted_at), or (B8, worker_missed_window)
 *     when the job is assigned, the worker never marked arrived and now is past
 *     scheduled_date + arrival_end_hour (default 24) plus late_minutes, or more
 *     than 24h before the arrival anchor (scheduled_date + arrival_start_hour,
 *     America/New_York); else the cancellation fee, taken from the agreed price
 *     alone (supabase/migrations/20261111100100_worker_no_show.sql).
 *   customer_no_show — assigned, arrived_at set, a scheduled job, and now
 *     past scheduled_date + arrival_end_hour (default 24) in America/New_York.
 * When the client cannot know (no agreement snapshot, or its price differs
 * from the payment's, so the SQL would read the CURRENT fee schedule), the
 * preview is null and the screen says what depends on timing without a figure.
 * ------------------------------------------------------------------------- */

const CANCEL_GRACE_MS = 15 * 60_000;
const CANCEL_FREE_BEFORE_MS = 24 * 3_600_000;
/** How close to a free/fee switch the preview is flagged as possibly different by the time it runs. */
const CANCEL_NEAR_BOUNDARY_MS = 2 * 60_000;
/**
 * Mirrors MARKET_TIME_ZONE in lib/time.ts (the one home of the market's day). It is a copy, not an import,
 * because this file imports types only (D24), so nine tests can load it directly.
 * tests/marketDay.test.mjs fails if the two ever differ.
 */
const CANCEL_MARKET_TIME_ZONE = 'America/New_York';

/** The fee terms of a hire: the `job_agreements` snapshot, as cancel_job() reads it through job_terms(). */
export type CancelTerms = {
  accepted_at: string | null;
  agreed_price_cents: number;
  cancel_fee_bps: number;
  cancel_fee_min_cents: number;
  cancel_fee_max_cents: number;
};

/** cancellation_fee_cents(): least(max, greatest(min, round(price * bps / 10000))), never above the price. */
export function cancellationFeeCents(terms: CancelTerms, amountCents: number): number {
  // round() of a non-negative numeric is half-up; the integer form is exact.
  const rounded = Math.floor((amountCents * terms.cancel_fee_bps + 5000) / 10000);
  const fee = Math.min(terms.cancel_fee_max_cents, Math.max(terms.cancel_fee_min_cents, rounded));
  return Math.min(fee, amountCents);
}

/** `date::timestamp + hours` read as America/New_York wall time, as epoch ms (null for an unreadable date). */
export function marketWallClockMs(dateKey: string, hours: number): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateKey);
  if (!m) return null;
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + hours * 3_600_000;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: CANCEL_MARKET_TIME_ZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    // The zone's offset at an instant: what its wall clock reads, minus the instant, as if both were UTC.
    const offsetAt = (instant: number): number => {
      const get = (type: string) => Number(fmt.formatToParts(instant).find((p) => p.type === type)?.value);
      const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
      return asUtc - Math.floor(instant / 1000) * 1000;
    };
    // Two passes settle the offset across a DST change.
    let guess = wall - offsetAt(wall);
    guess = wall - offsetAt(guess);
    return Number.isFinite(guess) ? guess : null;
  } catch {
    return null;
  }
}

/**
 * job_window_end() (20261111100000_lifecycle_shared.sql): a dated job's arrival window ends at its day
 * plus the end hour (24 when open-ended), New York wall time, as epoch ms. Null for an undated job or an
 * unreadable day. THE one home of this formula: the window checks below all read it.
 */
export function jobWindowEndMs(job: { scheduled_date: string | null; arrival_end_hour: number | null }): number | null {
  if (!job.scheduled_date) return null;
  return marketWallClockMs(job.scheduled_date, job.arrival_end_hour ?? 24);
}

export type CustomerCancelPreview =
  /** Nothing was charged (no payment, or one never funded): no money moves. */
  | { kind: 'no_charge' }
  /** The whole charge goes back to the customer. */
  | { kind: 'free'; refundCents: number; nearBoundary: boolean }
  /** The worker missed the arrival window and never marked arrived: the whole charge goes back. */
  | { kind: 'worker_no_show'; refundCents: number }
  /** The cancellation fee goes to the worker; the rest of the charge goes back. */
  | { kind: 'fee'; feeCents: number; refundCents: number; nearBoundary: boolean };

type CancelJobFacts = {
  status: string;
  scheduled_date: string | null;
  arrival_start_hour: number | null;
  arrival_end_hour: number | null;
  arrived_at: string | null;
  late_minutes: number | null;
};

/** worker_missed_window(): assigned, never arrived, dated, now past the window end plus the reported delay. */
function workerMissedWindow(job: CancelJobFacts, nowMs: number): boolean {
  if (job.status !== 'assigned' || job.arrived_at || !job.scheduled_date) return false;
  const windowEnd = jobWindowEndMs(job);
  return windowEnd != null && nowMs > windowEnd + (job.late_minutes ?? 0) * 60_000;
}

/**
 * What cancel_job('customer_cancelled') will do with the money, or null when
 * this client cannot say (the screen then shows copy without a figure).
 */
export function customerCancelPreview({
  job,
  payment,
  terms,
  nowMs = Date.now(),
}: {
  job: CancelJobFacts;
  payment: { status: string; amount_cents: number; charge_amount_cents?: number | null } | null;
  terms: CancelTerms | null;
  nowMs?: number;
}): CustomerCancelPreview | null {
  if (!payment || payment.status === 'unfunded' || payment.status === 'authorized') return { kind: 'no_charge' };
  if (payment.status !== 'held') return null;
  const charge = payment.charge_amount_cents;
  if (charge == null || !terms || terms.agreed_price_cents !== payment.amount_cents) return null;

  let free: boolean;
  let boundaryMs: number | null = null;
  if (job.status === 'in_progress') {
    free = false;
  } else if (job.scheduled_date == null) {
    free = true;
  } else {
    const acceptedMs = terms.accepted_at ? Date.parse(terms.accepted_at) : NaN;
    const graceEnd = Number.isFinite(acceptedMs) ? acceptedMs + CANCEL_GRACE_MS : null;
    if (graceEnd != null && nowMs <= graceEnd) {
      free = true;
      boundaryMs = graceEnd;
    } else if (workerMissedWindow(job, nowMs)) {
      return { kind: 'worker_no_show', refundCents: charge };
    } else {
      const anchor = marketWallClockMs(job.scheduled_date, job.arrival_start_hour ?? 0);
      if (anchor == null) return null;
      const freeUntil = anchor - CANCEL_FREE_BEFORE_MS;
      free = nowMs < freeUntil;
      boundaryMs = free ? freeUntil : null;
    }
  }
  const nearBoundary = boundaryMs != null && Math.abs(boundaryMs - nowMs) <= CANCEL_NEAR_BOUNDARY_MS;
  if (free) return { kind: 'free', refundCents: charge, nearBoundary };
  const feeCents = cancellationFeeCents(terms, payment.amount_cents);
  return { kind: 'fee', feeCents, refundCents: charge - feeCents, nearBoundary };
}

/**
 * Whether cancel_job('customer_no_show') will be accepted: the job is still
 * assigned, the worker marked arrival, it is a scheduled job, and the arrival
 * window (scheduled_date + arrival_end_hour, 24 when open-ended) has passed.
 */
export function noShowReportable({
  job,
  nowMs = Date.now(),
}: {
  job: {
    status: string;
    arrived_at: string | null;
    scheduled_date: string | null;
    arrival_end_hour: number | null;
  };
  nowMs?: number;
}): boolean {
  if (job.status !== 'assigned' || !job.arrived_at || !job.scheduled_date) return false;
  const windowEnd = jobWindowEndMs(job);
  return windowEnd != null && nowMs > windowEnd;
}

/**
 * A4 wiring (A4) — job_window_over() (20261116200400_post_window.sql): a dated
 * job's arrival window (its day plus the end hour, 24 when open-ended, New York)
 * has ended, from its end instant on. From then accept_offer refuses a new
 * acceptance, and a new bid or counter on an open market job is refused
 * (refuse_offer_after_window). An undated job has no cutoff. An unreadable day
 * is not "over": the server answers that one with its own sentence.
 */
export function jobWindowOver({
  job,
  nowMs = Date.now(),
}: {
  job: { scheduled_date: string | null; arrival_end_hour: number | null };
  nowMs?: number;
}): boolean {
  const windowEnd = jobWindowEndMs(job);
  return windowEnd != null && windowEnd <= nowMs;
}

/** The server's refusals once the window is over, word for word (post_window.sql: accept_offer, refuse_offer_after_window). */
export const BOOKED_TIME_PASSED = {
  /** accept_offer, the customer. */
  customerAccept: "This job's booked time has passed, so it can no longer be accepted. Post it again with a new time.",
  /** accept_offer, the worker. */
  workerAccept:
    "This job's booked time has passed, so it can no longer be accepted. Ask the customer to post it again with a new time.",
  /** A new bid, or the worker's counter. */
  newBid: "This job's booked time has passed, so it is closed to new bids.",
  /** The customer's counter. */
  customerCounter: "This job's booked time has passed. Post it again with a new time.",
} as const;
