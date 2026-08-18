import type { JobCategory, OpenJob } from './jobs';

/**
 * The worker-side job filter model (screen 50) — Phase 8.
 *
 * Pure data + pure functions, applied client-side over whichever feed a
 * results screen already fetched (the open-jobs list or a radius result).
 * Kept out of the screen so the logic is unit-testable in node and so the
 * list and any future map surface filter identically (list/map parity).
 */

export type JobSort = 'newest' | 'pay' | 'distance';

export type JobFilterModel = {
  /** Empty set = every category. */
  categories: Set<JobCategory>;
  /** Only jobs whose stated budget reaches this floor. Null = no floor.
   *  Jobs with NO stated budget are kept — "no budget set" is an open
   *  negotiation, not a low one. */
  minBudgetCents: number | null;
  sort: JobSort;
};

export const DEFAULT_JOB_FILTERS: JobFilterModel = {
  categories: new Set<JobCategory>(),
  minBudgetCents: null,
  sort: 'newest',
};

/** True when the model would change nothing — drives the filter badge. */
export function isDefaultJobFilters(model: JobFilterModel): boolean {
  return model.categories.size === 0 && model.minBudgetCents == null && model.sort === 'newest';
}

/** How many non-default controls are active — the header badge count. */
export function activeJobFilterCount(model: JobFilterModel): number {
  let count = 0;
  if (model.categories.size > 0) count++;
  if (model.minBudgetCents != null) count++;
  if (model.sort !== 'newest') count++;
  return count;
}

/** The budget figure a filter compares against: the stated ceiling.
 *  Exported since 4D-2 so lib/matchReasons.ts compares against the SAME
 *  figure — one budget-ceiling rule, never a second copy. */
export function budgetCeiling(job: {
  budget_cents: number | null;
  budget_min_cents?: number | null;
  budget_max_cents?: number | null;
}): number | null {
  return job.budget_max_cents ?? job.budget_cents ?? job.budget_min_cents ?? null;
}

export function applyJobFilters<T extends OpenJob>(
  jobs: readonly T[],
  model: JobFilterModel
): T[] {
  let out = jobs.filter((job) => {
    if (model.categories.size > 0 && !model.categories.has(job.category)) return false;
    if (model.minBudgetCents != null) {
      const ceiling = budgetCeiling(job);
      // No stated budget passes every floor — see the model comment.
      if (ceiling != null && ceiling < model.minBudgetCents) return false;
    }
    return true;
  });

  out = [...out];
  if (model.sort === 'pay') {
    // Highest stated ceiling first; unstated budgets sink to the end — a
    // sort by pay must never present "no budget" as the best-paying job.
    out.sort((a, b) => (budgetCeiling(b) ?? -1) - (budgetCeiling(a) ?? -1));
  } else if (model.sort === 'distance') {
    // Only meaningful when rows carry distance_miles (a radius result).
    // Rows without one keep their relative order at the end.
    const dist = (j: T) => {
      const value = (j as { distance_miles?: unknown }).distance_miles;
      return typeof value === 'number' ? value : Number.POSITIVE_INFINITY;
    };
    out.sort((a, b) => dist(a) - dist(b));
  } else {
    out.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }
  return out;
}
