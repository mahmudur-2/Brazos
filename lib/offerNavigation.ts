import type { Offer, OfferStatus } from './offers';

/**
 * THE "which job does this offer open, and where" rule.
 *
 * An offer card in a conversation used to be a navigation dead end unless it
 * was the one that got ACCEPTED: ChatScreen passed `onOpenJob` only for
 * `status === 'accepted'`, so a live job offer or counter-offer — the card a
 * user most wants to inspect the work behind — pointed nowhere.
 *
 * Nothing was missing from the data. `job_offers.job_id` is NOT NULL
 * (phase43) and is pinned constant down a whole chain by the composite
 * inheritance FK, so EVERY revision of EVERY negotiation already carries the
 * canonical job identity. There is no standalone offer to special-case: a
 * direct offer creates its draft/direct job up front, which is where its
 * title, media and location live. The renderer dropped the identity; the
 * data never lost it.
 *
 * This module is the one interpretation of that identity, so Chat and My Jobs
 * cannot disagree about where an offer leads. It is pure and type-only, which
 * is what lets the node suite execute it directly.
 *
 * The destinations are the ones the app already uses — no new screen, no
 * second navigation system:
 *
 *   ClientJobDetail  the job owner's own job (MyJobsHubScreen:317)
 *   JobDetail        the worker's marketplace view, which carries the respond
 *                    card for a live negotiation (MyJobsHubScreen:370)
 *   WorkerJob        the worker's status screen for a job they were assigned
 *                    (MyJobsHubScreen:288, and ChatScreen's accepted-offer tap
 *                    — Screenshot 5's working reference)
 *
 * All three live in the shared MyJobs tab in both mode trees, so the dispatch
 * goes through navigateAcrossTabs() exactly as the accepted path already did.
 */

export const OFFER_JOB_TAB = 'MyJobs';

export type OfferJobRouteName = 'ClientJobDetail' | 'WorkerJob' | 'JobDetail';

export type OfferJobTarget = {
  screen: OfferJobRouteName;
  /** jobs.id — the canonical identity, never a title/timestamp heuristic. */
  jobId: string;
};

/**
 * Whether an offer card should lead into its job at all.
 *
 * `pending` is the fix: a live offer or counter must open the job it is about.
 * `accepted` preserves Screenshot 5's working behaviour exactly.
 *
 * Settled-and-dead revisions (declined / withdrawn / expired / superseded)
 * stay non-tappable. Their job may be a draft/direct row the losing side can
 * no longer read once the negotiation ended, and offering a tap that lands on
 * a permission error is worse than offering none. Recorded as an autonomous
 * decision in DIAG_offer_negotiation_messaging.md.
 */
export function isOfferJobOpenable(status: OfferStatus): boolean {
  return status === 'pending' || status === 'accepted';
}

/** The offer fields this decision needs — nothing else is read. */
export type OfferJobIdentity = Pick<
  Offer,
  'job_id' | 'customer_id' | 'worker_id' | 'status'
>;

/**
 * Where `viewerId` should land when they tap this offer's card, or null when
 * the card must not be tappable.
 *
 * Role comes from the offer's own stable participants — `customer_id` /
 * `worker_id`, set once at chain creation and inherited by every counter —
 * never from `author_id` (who moved last) or the app's current mode. A
 * customer looking at their own job from worker mode still gets their own
 * job screen, which is the same reasoning that keeps OfferCard
 * perspective-free.
 */
export function offerJobTarget(
  offer: OfferJobIdentity | null | undefined,
  viewerId: string | null | undefined
): OfferJobTarget | null {
  if (!offer || !viewerId || !offer.job_id) return null;
  if (!isOfferJobOpenable(offer.status)) return null;

  if (viewerId === offer.customer_id) {
    return { screen: 'ClientJobDetail', jobId: offer.job_id };
  }
  if (viewerId !== offer.worker_id) return null;

  // The worker's own screen for a job they hold; before that, the marketplace
  // view — which is where the negotiation is answerable, and is exactly where
  // My Jobs sends the same offer.
  return {
    screen: offer.status === 'accepted' ? 'WorkerJob' : 'JobDetail',
    jobId: offer.job_id,
  };
}
