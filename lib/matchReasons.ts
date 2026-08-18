import { budgetCeiling } from './jobFilters';
import { NEARBY_RADIUS_MILES } from './discoveryFilter';

/**
 * Deterministic match-reason checkmarks for the market job detail (4D-2 B5).
 *
 * Three boolean reasons — category, distance, budget — each rendered ONLY
 * when its facts are known AND it holds. There are no percentages, no
 * scores and no ranking language anywhere in this module, and none may be
 * added: match scoring is permanently rejected on this product. A reason
 * whose inputs are unknown yields NOTHING (the null-is-unknown rule
 * lib/compareBids.ts enforces for trust facts) — never a guess, never a
 * negative badge.
 *
 * Pure by design: no imports beyond two other pure lib modules, so
 * `node --test` executes it directly. The screen renders this output and
 * derives nothing itself.
 */

export type MatchReasonKey = 'category' | 'distance' | 'budget';

export type MatchReason = {
  key: MatchReasonKey;
  label: string;
};

export type MatchReasonInput = {
  job: {
    category: string;
    budget_cents: number | null;
    budget_min_cents?: number | null;
    budget_max_cents?: number | null;
  };
  /** The viewer's own profile categories. Null = not loaded yet (unknown);
   *  an empty array is a KNOWN "none". */
  workerCategories: readonly string[] | null;
  /** Server-computed distance to this job (jobs_within_radius), when the
   *  surface that opened the detail carried one. Null = unknown. */
  distanceMiles: number | null;
  /** The viewer's persisted distance filter; null = Any, which falls back to
   *  the app's standing 5-mile nearby promise as the threshold. */
  radiusMiles: number | null;
  /** The viewer's cheapest PUBLISHED flat listed price for the job's
   *  category, integer cents. Null = none listed (or hourly/quote-only,
   *  which cannot be compared to a job budget without inventing hours). */
  listedFlatPriceCents: number | null;
};

/**
 * Reasons in fixed order (category, distance, budget). Each is present iff
 * it is TRUE on known facts:
 *
 * - category: the job's category is among the viewer's profile categories.
 * - distance: the job's known distance is within the viewer's radius filter
 *   (or the 5-mile nearby promise when the filter is Any).
 * - budget: the job's stated budget ceiling — the same budgetCeiling rule
 *   the feed filter compares against — covers the viewer's listed flat
 *   price for this category.
 */
export function deriveMatchReasons(input: MatchReasonInput): MatchReason[] {
  const reasons: MatchReason[] = [];

  if (input.workerCategories !== null && input.workerCategories.includes(input.job.category)) {
    reasons.push({ key: 'category', label: 'Matches your skills' });
  }

  const threshold = input.radiusMiles ?? NEARBY_RADIUS_MILES;
  if (input.distanceMiles !== null && input.distanceMiles <= threshold) {
    reasons.push({ key: 'distance', label: `Within ${threshold} miles` });
  }

  if (input.listedFlatPriceCents !== null) {
    const ceiling = budgetCeiling(input.job);
    if (ceiling !== null && ceiling >= input.listedFlatPriceCents) {
      reasons.push({ key: 'budget', label: 'Budget covers your listed price' });
    }
  }

  return reasons;
}
