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
 * `transfer.created` lands; sandbox rows go `released` immediately. So a row
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
 * status stays `held` until the provider's charge.refunded lands (a sandbox row
 * goes `refunded` at once and never reads true here). Nothing about such a row
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
 * sandbox_authorize_job_payment (phase58) and begin_job_payment: the job's
 * owner, an accepted assignment, status assigned/in_progress/completed — the
 * worker starting or even finishing must never destroy the customer's path
 * to fund.
 *
 * The payment side is a strict WHITELIST: offer only on
 *   - no active row (checkout never ran; failed/voided rows read as null),
 *   - an 'authorized' row (sandbox checkout stopped before the hold), or
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
 * for a row the type allows to lack it, not arithmetic. Sandbox rows write a
 * zero fee and zero tax, so their charge equals the amount and no sandbox
 * figure changes. Every customer-facing "held in protection" amount —
 * JobConfirmed, ClientJobDetail, ApproveOrDispute and its CTA — reads this.
 */
export function customerChargeCents(
  payment: Pick<Payment, 'amount_cents' | 'charge_amount_cents'>
): number {
  return payment.charge_amount_cents ?? payment.amount_cents;
}
