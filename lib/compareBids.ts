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

/**
 * What the ranking knows about one bidder: the worker-role REVEALED summary
 * (n7 — profile_review_summaries, one batch call per list), never the
 * profile's legacy mixed aggregate. `shown_average` is the one displayable
 * number (R8b-c D1), `is_new` is the under-three verdict, `revealed_total`
 * the count of revealed reviews behind them. Null is UNKNOWN — the batch has
 * not answered, or failed — and the row then ranks as unrated.
 */
export type CompareWorker = {
  shown_average?: number | null;
  is_new?: boolean | null;
  revealed_total?: number | null;
  on_time_pct?: number | null;
} | null;

export type CompareBid = {
  id: string;
  amount_cents: number;
  created_at: string;
  worker: CompareWorker;
};

/**
 * The batch row as the ranking reads it — the ONE mapping from the summary's
 * camelCase row to CompareWorker, so every list ranks on identical fields.
 * Structural on purpose: this module stays import-free so tests execute it.
 * Absent or null in = null out (UNKNOWN).
 */
export function compareWorkerFromSummary(
  summary:
    | {
        total: number;
        shownAverage: number | null;
        isNew: boolean;
        onTimePct: number | null;
      }
    | null
    | undefined
): CompareWorker {
  if (!summary) return null;
  return {
    shown_average: summary.shownAverage,
    is_new: summary.isNew,
    revealed_total: summary.total,
    on_time_pct: summary.onTimePct,
  };
}

/**
 * A worker's rating as a KNOWN fact, or null. shown_average without a single
 * REVEALED review is the platform prior, not a fact about this person (D4:
 * null is unknown, never zero — and zero revealed reviews means there is
 * nothing to show), so a zero-review worker has no KNOWN rating.
 */
export function knownRating(worker: CompareWorker): number | null {
  if (!worker) return null;
  const total = worker.revealed_total ?? 0;
  const shown = worker.shown_average;
  return total > 0 && shown != null ? shown : null;
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
 * §5.4 — shown_average DESC, then amount ASC, then created_at ASC, then id.
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
 * rating that is KNOWN and past the "New" threshold (`is_new` false — three
 * or more REVEALED reviews, the same bar the summary itself applies), and
 * every other bid's rating KNOWN and strictly lower. An unrated competitor
 * makes the comparison unknowable and kills the badge; so does any tie.
 * Never "best fit" — fit scoring is permanently rejected on this product.
 */
export function highestRatedBadgeId(bids: readonly CompareBid[]): string | null {
  if (bids.length < 2) return null;
  const sorted = sortBidsDeterministic(bids);
  const top = sorted[0];
  const topRating = knownRating(top.worker);
  if (topRating == null || top.worker?.is_new !== false) return null;
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
