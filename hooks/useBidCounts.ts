/**
 * DEPRECATED — kept solely as a facade so the LOCKED screens stay byte-identical.
 *
 * Phase 3B unified bids and job requests into `job_offers`, and the real hook
 * is now `useOfferCounts`. This file is not a second implementation: it is a
 * re-export under the old name.
 *
 * WHY IT SURVIVES THE RENAME
 * `screens/HomeScreen.tsx` (screen 07) and `screens/BrowseJobsScreen.tsx`
 * (screen 48) import `useBidCounts`, and both are LOCKED — untouchable in this
 * phase, including their import lines. Renaming the file would have forced an
 * edit to both. Keeping the old name costs one line and keeps `git diff` on
 * those two screens empty, which is the point of the lock.
 *
 * The counts are marketplace bids only, which is exactly what those two feeds
 * show: job_offer_count() counts root offers where offer_type =
 * 'marketplace_bid', so a direct offer never inflates a public job's badge.
 *
 * Remove when the locked screens are next deliberately revised, and switch
 * their imports to `useOfferCounts` then.
 */
export { useOfferCounts as useBidCounts } from './useOfferCounts';
