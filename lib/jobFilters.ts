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
  /**
   * Only jobs the client scheduled for this calendar day. A 'YYYY-MM-DD' key;
   * null = every date.
   *
   * A KEY RATHER THAN A BOOLEAN, deliberately: `jobs.scheduled_date` is a
   * plain `date` and phase49 chose it precisely so a job's day is not about
   * any viewer's timezone. "Today" is therefore a question only the caller can
   * answer, and answering it here would mean reading a clock inside a pure
   * function — which is both untestable and the wrong place to decide whose
   * midnight counts. `localDateKey()` below is what a screen calls.
   *
   * A job with NO date does not pass. This is the mirror of the budget rule
   * above and the difference is deliberate: an absent budget is an open
   * negotiation, so it survives every floor, while an absent date is not a
   * claim about today and cannot be shown as one.
   */
  scheduledOn: string | null;
  sort: JobSort;
};

export const DEFAULT_JOB_FILTERS: JobFilterModel = {
  categories: new Set<JobCategory>(),
  minBudgetCents: null,
  scheduledOn: null,
  sort: 'newest',
};

/**
 * How far a budget-floor CONTROL may reach, and the granularity it moves in.
 *
 * The filter itself has no maximum — `minBudgetCents` is a floor and any
 * integer is a legal one. These are the bounds a slider or a preset row is
 * allowed to offer, and they live here rather than on a screen so the map's
 * slider and the results sheet's presets cannot come to mean different things.
 *
 * $250 in $25 steps is one step past the top preset the results sheet already
 * offers ($100), which is the range a worker filtering a local jobs feed
 * actually reasons about. It is three orders of magnitude below
 * `MONEY_CEILING_CENTS` (lib/validation.ts), so no control built on it can
 * produce a figure the database would refuse — the ceiling stays the
 * enforcement, this is just a control that never approaches it.
 */
export const BUDGET_FILTER_MAX_CENTS = 25_000;
export const BUDGET_FILTER_STEP_CENTS = 2_500;

/**
 * A Date as the 'YYYY-MM-DD' key `scheduled_date` is stored in, in the
 * caller's LOCAL calendar.
 *
 * Not `toISOString().slice(0, 10)`, which is UTC: for anyone west of Greenwich
 * that answers "tomorrow" for most of the evening, so a Today filter would
 * start hiding today's jobs after dinner.
 */
export function localDateKey(when: Date): string {
  const month = String(when.getMonth() + 1).padStart(2, '0');
  const day = String(when.getDate()).padStart(2, '0');
  return `${when.getFullYear()}-${month}-${day}`;
}

/** True when the model would change nothing — drives the filter badge. */
export function isDefaultJobFilters(model: JobFilterModel): boolean {
  return (
    model.categories.size === 0 &&
    model.minBudgetCents == null &&
    model.scheduledOn == null &&
    model.sort === 'newest'
  );
}

/** How many non-default controls are active — the header badge count. */
export function activeJobFilterCount(model: JobFilterModel): number {
  let count = 0;
  if (model.categories.size > 0) count++;
  if (model.minBudgetCents != null) count++;
  if (model.scheduledOn != null) count++;
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
    // An absent date is not a claim about today, so it does not pass. Compared
    // as a plain string because both sides are 'YYYY-MM-DD' calendar keys and
    // parsing either into a Date would reintroduce the timezone this column
    // exists to avoid.
    if (model.scheduledOn != null && job.scheduled_date !== model.scheduledOn) return false;
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
