/**
 * Bid-ordering derivations — pure and import-free so tests execute them.
 * The screens render what these functions decide; they re-derive nothing.
 *
 * The ordering is DETERMINISTIC AND STATED (D5): rating desc, then price asc,
 * then earliest bid, with the offer id as a final total tiebreak so equal
 * rows cannot swap between renders. No blended score, no match language —
 * anywhere. This module is the SINGLE ordering source (operator decision
 * 2026-08-18): the blended offerValueScore / "Best value" chip that lived in
 * lib/offers.ts is deleted, and ClientJobDetailScreen consumes these rules
 * exactly as CompareBidsScreen already did.
 */

export type CompareWorker = {
  rating_avg?: number | null;
  rating_count?: number | null;
  on_time_pct?: number | null;
} | null;

export type CompareBid = {
  id: string;
  amount_cents: number;
  created_at: string;
  worker: CompareWorker;
};

/**
 * A worker's rating as a KNOWN fact, or null. A rating_avg without a single
 * counted review is not a fact (D4: null is unknown, never zero — and zero
 * reviews means there is nothing to average).
 */
export function knownRating(worker: CompareWorker): number | null {
  if (!worker) return null;
  const count = worker.rating_count ?? 0;
  const avg = worker.rating_avg;
  return count > 0 && avg != null ? avg : null;
}

/** Rating desc; unknown ratings sort LAST as a block (never interleaved by
 *  a substituted zero). 0 when the ratings alone cannot separate the pair. */
function byRatingDesc(a: CompareBid, b: CompareBid): number {
  const ra = knownRating(a.worker);
  const rb = knownRating(b.worker);
  if (ra == null && rb == null) return 0;
  if (ra == null) return 1;
  if (rb == null) return -1;
  return rb - ra;
}

/** The full §5.4 comparator: rating desc → amount asc → created asc → id. */
function compareBidsDefault(a: CompareBid, b: CompareBid): number {
  return (
    byRatingDesc(a, b) ||
    a.amount_cents - b.amount_cents ||
    a.created_at.localeCompare(b.created_at) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * §5.4 — rating_avg DESC, then amount ASC, then created_at ASC, then id.
 * Bids with no known rating sort LAST as a block and tiebreak among
 * themselves the same way. This is also the DEFAULT order everywhere bids
 * are listed (no chip selected).
 */
export function sortBidsDeterministic<T extends CompareBid>(bids: readonly T[]): T[] {
  return [...bids].sort(compareBidsDefault);
}

/** The §5.4 rule, stated on screen exactly as implemented above. */
export const BID_ORDER_RULE = 'Sorted by rating, then lowest price, then earliest bid.';

// ---------------------------------------------------------------------------
// Sort chips (operator decision 2026-08-18: one ordering rule, factual only)
// ---------------------------------------------------------------------------

export type BidSortChip = 'price' | 'rating';

/** Exactly these two chips — the blended "Best value" chip is gone. */
export const BID_SORT_CHIPS: { label: string; value: BidSortChip }[] = [
  { label: 'Lowest price', value: 'price' },
  { label: 'Highest rated', value: 'rating' },
];

/**
 * The chip-aware order. No chip (null) = the default deterministic rule.
 * "Highest rated" restates the default's leading key, so it is the same
 * order made explicit. "Lowest price" leads with amount and keeps the full
 * deterministic chain as its tiebreak, so equal rows can never swap between
 * renders under any chip.
 */
export function sortBidsForChip<T extends CompareBid>(
  bids: readonly T[],
  chip: BidSortChip | null
): T[] {
  if (chip !== 'price') return sortBidsDeterministic(bids);
  return [...bids].sort((a, b) => a.amount_cents - b.amount_cents || compareBidsDefault(a, b));
}

/**
 * §5.1 DEVIATION 2 — the only badge this surface may render. "HIGHEST RATED"
 * is a factual claim, so it fails closed: it needs at least two bids, a top
 * rating built on 3+ reviews, and every other bid's rating KNOWN and strictly
 * lower. An unrated competitor makes the comparison unknowable and kills the
 * badge; so does any tie. Never "best fit" — fit scoring is permanently
 * rejected on this product.
 */
export function highestRatedBadgeId(bids: readonly CompareBid[]): string | null {
  if (bids.length < 2) return null;
  const sorted = sortBidsDeterministic(bids);
  const top = sorted[0];
  const topRating = knownRating(top.worker);
  if (topRating == null || (top.worker?.rating_count ?? 0) < 3) return null;
  for (const other of sorted.slice(1)) {
    const r = knownRating(other.worker);
    if (r == null || r >= topRating) return null;
  }
  return top.id;
}

/**
 * D3 — worker_job_stats(p_worker) returns (category, job_count) rows; the
 * total completed figure is their SUM. There is no total column to read.
 */
export function totalCompletedJobs(stats: ReadonlyArray<{ count: number }>): number {
  return stats.reduce((sum, row) => sum + row.count, 0);
}

/**
 * on_time_pct normalized to a whole 0–100 percent, or null. Accepts 0–1 or
 * 0–100 the same way completionPercent() does for completion_rate — the
 * column is null for almost every account, so the scale has no live
 * precedent to pin against and both are handled.
 */
export function onTimePercent(value: number | null | undefined): number | null {
  if (value == null) return null;
  const pct = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export type TrustRow =
  | { kind: 'new' }
  | { kind: 'facts'; onTimePct: number | null; completedJobs: number | null };

/**
 * D4 — the trust verdict for one bid row. `completedJobs` is null while the
 * stats read has not answered (or failed): UNKNOWN, which renders nothing and
 * can never produce the "New worker" verdict — that verdict requires KNOWING
 * the worker has fewer than 3 completed jobs alongside a null on_time_pct.
 * A null on_time_pct never renders as 0%.
 */
export function trustRowFor(
  onTimePct: number | null,
  completedJobs: number | null
): TrustRow {
  if (onTimePct == null && completedJobs != null && completedJobs < 3) {
    return { kind: 'new' };
  }
  return { kind: 'facts', onTimePct, completedJobs };
}
