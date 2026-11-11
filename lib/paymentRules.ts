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
 */
export function isCancellationFeeKept(
  payment: Pick<Payment, 'status'> & { refund_cents?: number | null; transfer_cents?: number | null }
): boolean {
  return isRefundQueued(payment) && (payment.transfer_cents ?? 0) > 0;
}

/**
 * Whether the funding CTA (Checkout) may be offered for this job — THE one
 * derivation for every surface that can show it (AUD-P1-02; the lifecycle
 * derivation drifted into a duplicate once already, so this predicate exists
 * exactly once). It mirrors the server contract of
 * begin_job_payment: the job's
 * owner, an accepted assignment, status assigned/in_progress/completed — the
 * worker starting or even finishing must never destroy the customer's path
 * to fund.
 *
 * The payment side is a strict WHITELIST: offer only on
 *   - no active row (checkout never ran; failed/voided rows read as null),
 *   - an 'authorized' row (checkout stopped before the hold), or
 *   - an 'unfunded' row whose funding window has not closed.
 * held, released, paid_out, refunded, partially_refunded, the legacy
 * 'pending', and anything unrecognized mean money already moved — or a state
 * this client cannot positively classify — and the answer is NO for all of
 * them: a wrongly-shown checkout here is a double-charge surface. An open
 * dispute also suppresses the offer; it exists to freeze money movement.
 *
 * D9 — WHY 'unfunded' JOINED THE WHITELIST, AND WHY THE WINDOW IS CHECKED.
 * Both halves are defect fixes. (1) create-payment mints a stripe row as
 * `unfunded` before the card sheet opens; a customer who closes the sheet
 * leaves that row behind, and without this arm they had no path back to
 * checkout for 24 hours. (2) `begin_job_payment` reuses an existing unfunded
 * row and sets `funding_due_at` only when it is null, so a lapsed window is
 * NEVER extended: inviting a charge into a lapsed row means the customer pays,
 * `expire_unfunded_payments` voids the row, and the money comes back only
 * through the `funded_after_void` refund. So an unfunded row PAST its
 * funding_due_at is refused — the screen says the window closed and a fresh
 * checkout follows once the row is voided. A window this client cannot parse
 * is refused for the same reason; a null window (no due date recorded) is not
 * a lapsed one.
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
  if (
    job.status !== 'assigned' &&
    job.status !== 'in_progress' &&
    job.status !== 'completed'
  ) {
    return false;
  }
  if (hasOpenDispute) return false;
  if (payment == null) return true;
  if (payment.status === 'authorized') return true;
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
  const windowEnd = marketWallClockMs(job.scheduled_date, job.arrival_end_hour ?? 24);
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
  const windowEnd = marketWallClockMs(job.scheduled_date, job.arrival_end_hour ?? 24);
  return windowEnd != null && nowMs > windowEnd;
}
