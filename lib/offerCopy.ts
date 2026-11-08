/**
 * THE wording for an actionable offer / counteroffer.
 *
 * Chat and Job Detail render the same negotiation moment. Before this module
 * they wrote it twice and drifted: one surface said "Accept for $110" beside
 * "Decline counter-offer", the other said "Accept" beside "Decline". Same
 * offer, same RPC, two vocabularies — which is exactly the "one negotiation
 * state, two interpretations" problem the offer unification exists to end.
 *
 * Every string an actionable card shows now comes from here, so the two
 * surfaces cannot disagree without this file changing.
 *
 * 2026-09-28 (LUX-LIST-64 #64, audit M-17) — ONE NOUN PER AUDIENCE, in
 * sentence case, on EVERY surface (the chat card, Job detail, Bid detail, the
 * client's job page): the customer always reads "bid" for what a worker sent,
 * and the worker always reads "offer" for what a customer sent. Each label
 * takes `viewerIsWorker` — the viewer's side of THIS chain, decided by the
 * caller from the offer row, the way offerResponseNote() already was — and
 * every confirmation repeats its button's verb and noun exactly ("Accept bid"
 * under "Accept bid ($110)").
 *
 * Pure by design — its one import is lib/time.ts, itself import-free, so the
 * node test suite executes it with that one specifier pointed at the file
 * (the jobLifecycle / errorMessage precedent). Amounts arrive already
 * formatted by formatBudget(); this module never re-implements money
 * formatting, which stays the single rule in lib/jobs.ts, and never
 * re-implements a date, which stays the single rule in lib/time.ts (F19).
 */

import { formatShortDay } from './time';

/** The amber "whose move" pill beside the heading. */
export const YOUR_MOVE_BADGE_LABEL = 'Your move';

/** What the OTHER side sent, in this viewer's word: a worker reads "offer"
 *  (from a customer), a customer reads "bid" (from a worker). */
export function offerNoun(viewerIsWorker: boolean): 'offer' | 'bid' {
  return viewerIsWorker ? 'offer' : 'bid';
}

/** Secondary action — the outlined counter control, and its confirmation. The
 *  viewer's own counter is a counter-offer on either side. */
export const COUNTER_OFFER_ACTION_LABEL = 'Send counter-offer';

/** Destructive action, and its confirmation's word. */
export function declineOfferActionLabel(viewerIsWorker: boolean): string {
  return `Decline ${offerNoun(viewerIsWorker)}`;
}

/** Shown in place of the counter control once this side's cap is spent.
 *  Mirrors components/OfferCard.tsx's long-standing sentence. */
export const COUNTERS_SPENT_NOTE =
  'No counter-offers left — accept or decline to continue.';

/**
 * The counterparty's first name, the way every other counterparty surface in
 * the app addresses one (WorkerProfileScreen, HomeScreen, MyJobsHubScreen).
 * A blank or whitespace-only name falls back to the caller's role word.
 */
export function firstNameOf(
  fullName: string | null | undefined,
  fallback: string
): string {
  return fullName?.trim().split(/\s+/)[0] || fallback;
}

/** Primary action. `amountLabel` is formatBudget()'s output, e.g. "$110". */
export function acceptOfferActionLabel(amountLabel: string, viewerIsWorker: boolean): string {
  return `Accept ${offerNoun(viewerIsWorker)} (${amountLabel})`;
}

/**
 * The accept confirmation's button: the action's verb and noun, exactly — or, 2026-09-30 (the
 * build run, decision C), when the customer's dialog has the server's quote, what the tap does:
 * "Accept & pay $129", the total being formatBudget() of the quote's total_cents, never a sum the
 * client made. Only the customer pays, so a worker's confirmation never carries a total.
 */
export function acceptOfferConfirmText(viewerIsWorker: boolean, totalLabel?: string): string {
  if (totalLabel && !viewerIsWorker) return `Accept & pay ${totalLabel}`;
  return `Accept ${offerNoun(viewerIsWorker)}`;
}

/**
 * A5 (2026-10-03): the customer's accept confirmation BODY — one text for both accept paths, the
 * client's job page and Bid detail, so they cannot drift (Bid detail's confirm had no fee and no
 * total). The three money lines are the server's quote_job_price(), each label already
 * formatBudget()'d by the caller — never a sum made here; without a quote they are left out, never
 * guessed. `savedCardLabel` names the card this confirm charges at once (the card path with a
 * saved card and a quote); otherwise checkout is the next step.
 */
export function acceptOfferConfirmMessage(input: {
  quote: { priceLabel: string; feeLabel: string; totalLabel: string } | null;
  savedCardLabel?: string | null;
}): string {
  const { quote } = input;
  const lines = quote
    ? `Agreed price ${quote.priceLabel} · Protection fee ${quote.feeLabel} · Total charged ${quote.totalLabel}.\n\n`
    : '';
  const selects = 'This selects their bid for the job — the other active bids will no longer be eligible.';
  const next =
    input.savedCardLabel && quote
      ? ` ${input.savedCardLabel} is charged the total now, and the funds are held in protection until you approve the work.`
      : ' Next you’ll protect the payment in checkout.';
  return lines + selects + next;
}

/**
 * The card's heading. A counter is identified by HAVING a parent offer —
 * structurally, never by a type value (see the job_offers architecture
 * decision §2) — so callers pass `parent_offer_id !== null`.
 */
export function offerResponseHeading(
  senderFirstName: string,
  isCounter: boolean,
  viewerIsWorker: boolean
): string {
  // A worker reads the customer's counter as a counter-offer (the word the
  // counter's own notification uses); a customer reads a worker's counter as a
  // new bid — "bid" is the one noun a customer sees for what a worker sent.
  if (viewerIsWorker) {
    return isCounter ? `${senderFirstName} sent you a counter-offer` : `${senderFirstName} sent you an offer`;
  }
  return isCounter ? `${senderFirstName} sent you a new bid` : `${senderFirstName} sent you a bid`;
}

/**
 * The explanatory sentence under the amount.
 *
 * Perspective-aware because the consequence genuinely differs: accepting a
 * worker's price HIRES them, accepting a customer's price TAKES the work.
 * Everything else about the card is identical for both sides — whose turn it
 * is is the only correct asymmetry (Fix C).
 */
export function offerResponseNote(input: {
  /** True when the viewer is the chain's worker. */
  viewerIsWorker: boolean;
  /** Already-formatted deadline, e.g. "Aug 19". Null when the offer never
   *  lapses — every pre-phase50 row, deliberately. */
  expiresLabel?: string | null;
}): string {
  const consequence = input.viewerIsWorker
    ? 'accepting assigns you the work at this amount'
    : 'accepting hires them at this amount';
  const deadline = input.expiresLabel
    ? ` Respond by ${input.expiresLabel} — after that it expires on its own.`
    : '';
  return `Their price for this job — ${consequence}.${deadline}`;
}

/**
 * "Aug 19" for an offer deadline, or null when the offer never lapses.
 *
 * Both actionable surfaces printed this inline with slightly different
 * date calls; one rule here (through lib/time.ts) keeps the same offer from showing
 * two different deadlines. An unparseable value yields null rather than
 * "Invalid Date" reaching a card.
 */
export function offerExpiryLabel(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const at = new Date(expiresAt);
  if (Number.isNaN(at.getTime())) return null;
  return formatShortDay(at);
}

/** Fix F — accept confirms with the exact amount, never a bare tap. */
export function acceptOfferConfirmTitle(amountLabel: string, viewerIsWorker: boolean): string {
  return `Accept this ${offerNoun(viewerIsWorker)} for ${amountLabel}?`;
}

/** Fix F — decline confirms with the exact amount too. */
export function declineOfferConfirmTitle(amountLabel: string, viewerIsWorker: boolean): string {
  return `Decline this ${amountLabel} ${offerNoun(viewerIsWorker)}?`;
}
