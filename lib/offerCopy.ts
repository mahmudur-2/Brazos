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
 * Pure by design — no imports at all, so the node test suite executes it
 * directly (the jobLifecycle / errorMessage precedent). Amounts arrive
 * already formatted by formatBudget(); this module never re-implements money
 * formatting, which stays the single rule in lib/jobs.ts.
 */

/** The amber "whose move" pill beside the heading. */
export const YOUR_MOVE_BADGE_LABEL = 'Your move';

/** Secondary action — the outlined counter control. */
export const COUNTER_OFFER_ACTION_LABEL = 'Send Counter Offer';

/** Destructive action. */
export const DECLINE_OFFER_ACTION_LABEL = 'Decline Offer';

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
export function acceptOfferActionLabel(amountLabel: string): string {
  return `Accept Offer (${amountLabel})`;
}

/**
 * The card's heading. A counter is identified by HAVING a parent offer —
 * structurally, never by a type value (see the job_offers architecture
 * decision §2) — so callers pass `parent_offer_id !== null`.
 */
export function offerResponseHeading(
  senderFirstName: string,
  isCounter: boolean
): string {
  return isCounter
    ? `${senderFirstName} sent you a Counteroffer`
    : `${senderFirstName} sent you an Offer`;
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
 * `toLocaleDateString` calls; one rule here keeps the same offer from showing
 * two different deadlines. An unparseable value yields null rather than
 * "Invalid Date" reaching a card.
 */
export function offerExpiryLabel(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const at = new Date(expiresAt);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Fix F — accept confirms with the exact amount, never a bare tap. */
export function acceptOfferConfirmTitle(amountLabel: string): string {
  return `Accept this offer for ${amountLabel}?`;
}

/** Fix F — decline confirms with the exact amount too. */
export function declineOfferConfirmTitle(amountLabel: string): string {
  return `Decline this ${amountLabel} offer?`;
}
