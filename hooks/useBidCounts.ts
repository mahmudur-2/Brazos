/**
 * DEPRECATED — kept solely as a facade so the LOCKED screens stay byte-identical.
 *
 * Phase 3B unified bids and job requests into `job_offers`, and the real hook
 * is now `useOfferCounts`. This file is not a second implementation: it is a
 * re-export under the old name.
 *
 * WHY IT SURVIVES THE RENAME
 * `screens/HomeScreen.tsx` (screen 07) imports `useBidCounts`, and at the
 * Phase 3B rename it was LOCKED — untouchable, including its import line —
 * so the old name stayed. (The other locked importer, the atlas-48 browse
 * screen, was deleted in Batch F.) Keeping the old name costs one line.
 *
 * The counts are marketplace bids only, which is exactly what that feed
 * shows: job_offer_count() counts root offers where offer_type =
 * 'marketplace_bid', so a direct offer never inflates a public job's badge.
 *
 * Remove when HomeScreen is next deliberately revised, and switch its import
 * to `useOfferCounts` then.
 */
export { useOfferCounts as useBidCounts } from './useOfferCounts';
