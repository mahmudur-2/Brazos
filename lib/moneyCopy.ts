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
