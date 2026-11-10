import type { PaymentStatus } from './payments';

/**
 * C4 (FIX-RUN 2026-10-03) — THE MONEY GLOSSARY. One word for each money idea,
 * and one copy table for what a payment's state says under its amount, by who
 * is looking. Pure: no imports beyond types, so it is executed in tests as is.
 *
 *   the fee        Protection fee
 *   the state      Held in protection
 *   the action     Pay & protect (a button) / protect the payment (a sentence)
 *   the eyebrow    PAYMENT, in every state — the caption carries the state
 *
 * §H.3 holds here by construction: nothing before `released` says paid or
 * received. The amount above a caption is always the viewer's own figure —
 * the customer's charge (customerChargeCents) or the worker's take
 * (workerTakeCents) — so "Paid" under a customer's amount is what they paid,
 * and "You received" under a worker's is what they got.
 */

export const FEE_NAME = 'Protection fee';
export const HELD_IN_PROTECTION = 'Held in protection';
export const PAY_AND_PROTECT = 'Pay & protect';

export type MoneyViewer = 'customer' | 'worker';

/** The eyebrow over every payment amount. The state is the caption's job. */
export const paymentEyebrow = (): string => 'PAYMENT';

/**
 * A payment state in a word or two, for nobody in particular — the status
 * pill, which has no viewer. Every PaymentStatus is listed (a new one is a
 * compile error until it has words).
 */
export const PAYMENT_STATE_WORDS: Record<PaymentStatus, string> = {
  unfunded: 'Not paid yet',
  authorized: 'Card authorized — not charged yet',
  held: HELD_IN_PROTECTION,
  released: 'Released',
  paid_out: 'Paid out',
  failed: 'Payment didn’t go through',
  voided: 'Payment cancelled',
  refunded: 'Refunded',
  partially_refunded: 'Partly refunded',
};

/** The facts a caption may depend on — facts, never words. */
export type PaymentCaptionFacts = {
  status: string;
  /** D23: a held row the customer approved (or the 72h clock did) — release_requested_at set. */
  releaseRequested?: boolean;
  /** An open issue report is holding the payment. */
  issueOpen?: boolean;
  /** #63: approved, but the worker's payout account is not set up yet. */
  waitingOnPayoutSetup?: boolean;
  /**
   * The cancellation shape (lib/paymentRules.ts isRefundQueued): a held row the
   * ledger has directed home — the job was cancelled and the money is on its
   * way back. Outranks every other held sentence.
   */
  refundQueued?: boolean;
  /** With refundQueued: a late cancellation kept a fee for the worker (isCancellationFeeKept). */
  feeKept?: boolean;
  /** The row is a tip, not the job's payment. */
  tip?: boolean;
  /** The other person's first name, when the screen has it. */
  counterpartFirstName?: string | null;
};

/**
 * THE copy table: the caption under a payment amount, by state and viewer.
 * Allow-listed — a status this client does not know gets no caption (null),
 * never a guess.
 */
export function paymentCaption(facts: PaymentCaptionFacts, viewer: MoneyViewer): string | null {
  const name = facts.counterpartFirstName?.trim() || null;
  const customer = viewer === 'customer';
  if (facts.tip) {
    if (facts.status === 'held') return customer ? 'Tip held in protection' : `Tip from ${name ?? 'the customer'} — on its way`;
    if (facts.status === 'released' || facts.status === 'paid_out') {
      return customer ? `Tip sent to ${name ?? 'your worker'}` : 'Tip received';
    }
  }
  switch (facts.status) {
    case 'unfunded':
      return customer ? 'Not paid yet' : 'Waiting on the customer’s payment';
    case 'authorized':
      return customer ? 'Card authorized — not charged yet' : 'Waiting on the customer’s payment';
    case 'held':
      // The cancellation shape first: a refund queued on a held row is money
      // going home, never protection and never an approval — the late-cancel
      // fee sets release_requested_at too, which is why this is checked first.
      if (facts.refundQueued) {
        if (facts.feeKept) {
          return customer
            ? `Partly refunded — the cancellation fee goes to ${name ?? 'your worker'}`
            : 'Cancellation fee — on its way to you';
        }
        return customer ? 'Refund on its way — back on your card in a few days' : 'Refund on its way to the customer';
      }
      // D23 next: approval is a decision already made, so the protection
      // sentence never describes that row.
      if (facts.releaseRequested) {
        if (customer) return `Approved — on its way to ${name ?? 'your worker'}`;
        return facts.waitingOnPayoutSetup ? 'Approved — waiting on your payout setup' : 'Approved — on its way to you';
      }
      if (facts.issueOpen) return customer ? 'Held — you reported an issue' : 'Held — the customer reported an issue';
      return customer
        ? `${HELD_IN_PROTECTION} — released when you approve`
        : `${HELD_IN_PROTECTION} — yours when the customer approves`;
    case 'released':
      return customer ? 'Paid' : 'You received';
    case 'paid_out':
      return customer ? 'Paid' : 'Paid out';
    case 'failed':
      return customer ? 'Payment didn’t go through — nothing was charged' : 'The customer’s payment didn’t go through';
    case 'voided':
      return customer ? 'Payment cancelled — nothing was charged' : 'Payment cancelled';
    case 'refunded':
      return customer ? 'Refunded' : 'Refunded to the customer';
    case 'partially_refunded':
      return customer ? 'Partly refunded' : 'Partly refunded to the customer';
    default:
      return null;
  }
}

/**
 * A2 — WHAT A CUSTOMER IS TOLD ABOUT CANCELLING BEFORE THEY PAY. One sentence,
 * from one constant, on the accept confirm and on Checkout. It carries
 * Terms §4's real numbers (lib/legal/termsOfService.ts, "Cancelling.") and the
 * rule cancel_job() applies (lib/paymentRules.ts customerCancelPreview).
 */
export const CANCELLATION_DISCLOSURE =
  'Free to cancel within 15 minutes of hiring or more than 24 hours before the visit; after that a cancellation fee may go to the worker.';

/** A2 — the honest line beside the checkout total: held, not insured. */
export const PAYMENT_HELD_NOT_INSURANCE =
  'Your payment is held until you approve the work. It is not insurance.';

/* ------------------------------------------------------------------------- *
 * A1 — THE CANCEL CONFIRMS. What each party is told, in money, before they
 * cancel a job. The amounts come from lib/paymentRules.ts (a mirror of
 * cancel_job(), which decides again when the call lands); `format` is
 * formatBudget, passed in so this module keeps no runtime imports.
 * ------------------------------------------------------------------------- */

export type CancelConfirmCopy = { title: string; message: string; confirmText: string; cancelText: string };

type CustomerCancelPreviewShape =
  | { kind: 'no_charge' }
  | { kind: 'free'; refundCents: number; nearBoundary: boolean }
  | { kind: 'fee'; feeCents: number; refundCents: number; nearBoundary: boolean }
  | null;

const CANNOT_UNDO = 'This can’t be undone.';
const NEAR_CUTOFF = ' The free-cancellation cutoff is only minutes away, so the amount is set when you confirm.';
const REFUND_TIMING = 'Refunds go back to your card, usually within 5–10 business days.';

/** The customer's confirm for cancel_job('customer_cancelled'). A null preview states no figure. */
export function customerCancelConfirm(
  preview: CustomerCancelPreviewShape,
  opts: { workerFirstName: string; format: (cents: number) => string }
): CancelConfirmCopy {
  const base = { title: 'Cancel this job?', confirmText: 'Cancel job', cancelText: 'Keep job' };
  const { workerFirstName: worker, format } = opts;
  if (!preview) {
    return {
      ...base,
      message: `Depending on timing, a cancellation fee may go to ${worker}; the rest comes back to you. The job page shows where the money went. ${CANNOT_UNDO}`,
    };
  }
  switch (preview.kind) {
    case 'no_charge':
      return { ...base, message: `You haven’t paid for this job, so no money moves. ${CANNOT_UNDO}` };
    case 'free':
      return {
        ...base,
        message: `Free — you get ${format(preview.refundCents)} back in full. ${REFUND_TIMING} ${CANNOT_UNDO}${preview.nearBoundary ? NEAR_CUTOFF : ''}`,
      };
    case 'fee':
      return {
        ...base,
        message: `A ${format(preview.feeCents)} cancellation fee goes to ${worker}; ${format(preview.refundCents)} comes back to you. ${REFUND_TIMING} ${CANNOT_UNDO}${preview.nearBoundary ? NEAR_CUTOFF : ''}`,
      };
  }
}

/**
 * The worker's confirm for cancel_job('worker_cancelled'). `paid` is the
 * ledger state: held (the customer is refunded in full), unpaid (nothing was
 * taken), or unknown (the read failed / another state — say nothing about money).
 * Nothing here claims a reliability or reputation effect: no code applies one.
 */
export function workerCancelConfirm(opts: { customerFirstName: string; paid: 'held' | 'unpaid' | 'unknown' }): CancelConfirmCopy {
  const { customerFirstName: customer, paid } = opts;
  const money =
    paid === 'held'
      ? `${customer} is refunded in full.`
      : paid === 'unpaid'
        ? `${customer} hasn’t paid yet, so no money moves.`
        : `${customer} is refunded in full if they have paid.`;
  return {
    title: 'Cancel this job?',
    message: `${money} ${customer} is told you cancelled. ${CANNOT_UNDO}`,
    confirmText: 'Cancel this job',
    cancelText: 'Keep job',
  };
}

/** The worker's confirm for cancel_job('customer_no_show'): a claim, never a payout. */
export function noShowConfirm(opts: { customerFirstName: string; paid: 'held' | 'unpaid' | 'unknown' }): CancelConfirmCopy {
  const { customerFirstName: customer, paid } = opts;
  const money =
    paid === 'unpaid'
      ? `${customer} hasn’t paid, so no money moves.`
      : `It opens a claim and moves no money until Brazos reviews it; ${customer} is told.`;
  return {
    title: `${customer} wasn’t there?`,
    message: `This closes the job. ${money} ${CANNOT_UNDO}`,
    confirmText: 'Report no-show',
    cancelText: 'Go back',
  };
}
