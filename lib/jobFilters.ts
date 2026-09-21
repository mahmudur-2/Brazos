import type { JobCategory, OpenJob } from './jobs';

/**
 * The worker-side job filter model (screen 50) — Phase 8, grown 2026-09-19.
 *
 * Pure data + pure functions, applied client-side over whichever feed a
 * results screen already fetched (the open-jobs list or a radius result).
 * Kept out of the screen so the logic is unit-testable in node and so the
 * list and the map filter identically (list/map parity).
 *
 * 2026-09-19 (operator rulings, docs/DECISIONS.md): five sorts, a date
 * WINDOW rather than a single day, and the value lists the Custom pills
 * offer. Every rule below is executed by tests/jobFilterRules.test.mjs.
 */

/**
 * The sorts, in the order the sheet lists them. Each rule, as ruled:
 *  - smart:    the worker's strongest categories first (the most completed
 *              jobs), then their other advertised skills, then the rest;
 *              inside a band, closest first when distances are known, else
 *              the `newest` rule. With no worker context it IS `newest`.
 *  - newest:   jobs WITH a scheduled date first, soonest first; once dates
 *              run out, the undated ones newest-posted first.
 *  - pay:      highest stated ceiling first; unstated budgets last.
 *  - distance: closest first; rows without a distance last.
 *  - bids:     fewest live offers first; ties broken by distance, then the
 *              `newest` rule.
 *  - reset:    the latest job ADDED first and nothing else — the feed's own
 *              order, no date, no skill, no distance (the operator's
 *              "Reset" row, 2026-09-20 sitting 3: "sorts by latest job added
 *              nothing else"). Last in the list, drawn grey; the pill wears
 *              "Latest added" once it is picked. Smart Match stays the default.
 */
export type JobSort = 'smart' | 'newest' | 'pay' | 'distance' | 'bids' | 'reset';

export const JOB_SORTS: readonly JobSort[] = ['smart', 'newest', 'pay', 'distance', 'bids', 'reset'];

export type JobFilterModel = {
  /** Empty set = every category. */
  categories: Set<JobCategory>;
  /** Only jobs whose stated budget reaches this floor. Null = no floor.
   *  Jobs with NO stated budget are kept — "no budget set" is an open
   *  negotiation, not a low one. */
  minBudgetCents: number | null;
  /**
   * Only jobs the client scheduled on or after this calendar day. A
   * 'YYYY-MM-DD' key; null = every date.
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
  /**
   * The LAST day of the window, inclusive, as a 'YYYY-MM-DD' key. Null means
   * the window is the single day `scheduledOn` names — which is how every
   * model written before 2026-09-19 still reads. "This week" is
   * `scheduledOn` = today and `scheduledUntil` = six days on; "Tomorrow" and a
   * custom date are one-day windows. Meaningless without `scheduledOn`.
   */
  scheduledUntil: string | null;
  sort: JobSort;
};

export const DEFAULT_JOB_FILTERS: JobFilterModel = {
  categories: new Set<JobCategory>(),
  minBudgetCents: null,
  scheduledOn: null,
  scheduledUntil: null,
  sort: 'smart',
};

/**
 * What a sort may know about the worker looking. Every field is optional:
 * a screen that has not loaded it sorts without it, and the rules above say
 * what each sort does then. Never read from a clock or a store here.
 */
export type JobSortContext = {
  /** The worker's advertised categories — `profiles.categories`. */
  skills?: ReadonlySet<JobCategory>;
  /** Completed jobs per category — the worker's track record, from the
   *  jobs assigned to them that reached `completed`. */
  completedByCategory?: Readonly<Partial<Record<JobCategory, number>>>;
  /** Live offer counts by job id — job_offer_counts(), one batched read. */
  offerCounts?: Readonly<Record<string, number>>;
};

/**
 * How far a budget-floor CONTROL may reach: the ceiling of the Custom list
 * ($10,000). The filter itself has no maximum — `minBudgetCents` is a floor
 * and any integer is a legal one. It stays two orders of magnitude below
 * `MONEY_CEILING_CENTS` (lib/validation.ts), so no control built on it can
 * produce a figure the database would refuse.
 */
export const BUDGET_FILTER_MAX_CENTS = 1_000_000;
/** The presets a filter row offers before Custom: Any · $25 · $50 · $100 · $250. */
export const BUDGET_FILTER_PRESETS_CENTS: readonly number[] = [2_500, 5_000, 10_000, 25_000];
/**
 * The Custom budget list (operator, 2026-09-19): $5 to $50 by 5, to $100 by
 * 10, to $500 by 25, then by 100 to $10,000. Generated, never typed.
 */
export const BUDGET_CUSTOM_VALUES_CENTS: readonly number[] = (() => {
  const out: number[] = [];
  for (let d = 5; d <= 50; d += 5) out.push(d * 100);
  for (let d = 60; d <= 100; d += 10) out.push(d * 100);
  for (let d = 125; d <= 500; d += 25) out.push(d * 100);
  for (let d = 600; d <= 10_000; d += 100) out.push(d * 100);
  return out;
})();

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

/** The key `days` calendar days after `from`, in the caller's local calendar. */
export function localDateKeyAfter(from: Date, days: number): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return localDateKey(d);
}

/**
 * The Custom date list (operator, 2026-09-19): the thirty days after `from`,
 * tomorrow first, as keys. Today and Tomorrow are their own pills, so the
 * list starts at tomorrow.
 */
export function customDateKeys(from: Date, count = 30): string[] {
  const out: string[] = [];
  for (let i = 1; i <= count; i++) out.push(localDateKeyAfter(from, i));
  return out;
}

/**
 * The one-word day a card shows beside its category (the approved Map
 * design's "Assembly · Today"): Today, Tmrw, or "Sep 2" — month and day, no
 * weekday — for anything later, and null for a job with no date, which then
 * shows nothing rather than a guess. Short on the operator's ruling
 * (2026-09-20): "Tomorrow" and "Wed, Sep 2" ran into the pay column on the
 * phone, and the row may not grow a line. Keys compared in the caller's
 * local calendar, like every other date here.
 */
export function scheduledDayLabel(scheduledDate: string | null, now: Date): string | null {
  if (!scheduledDate) return null;
  if (scheduledDate === localDateKey(now)) return 'Today';
  if (scheduledDate === localDateKeyAfter(now, 1)) return 'Tmrw';
  const [y, m, d] = scheduledDate.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** The three preset windows a When row offers, as [on, until]. */
export function dateWindowPreset(kind: 'today' | 'tomorrow' | 'week', from: Date): { scheduledOn: string; scheduledUntil: string | null } {
  if (kind === 'today') return { scheduledOn: localDateKey(from), scheduledUntil: null };
  if (kind === 'tomorrow') return { scheduledOn: localDateKeyAfter(from, 1), scheduledUntil: null };
  return { scheduledOn: localDateKey(from), scheduledUntil: localDateKeyAfter(from, 6) };
}

/** True when the model would change nothing — drives the filter badge. */
export function isDefaultJobFilters(model: JobFilterModel): boolean {
  return (
    model.categories.size === 0 &&
    model.minBudgetCents == null &&
    model.scheduledOn == null &&
    model.sort === DEFAULT_JOB_FILTERS.sort
  );
}

/** How many non-default controls are active — the header badge count. */
export function activeJobFilterCount(model: JobFilterModel): number {
  let count = 0;
  if (model.categories.size > 0) count++;
  if (model.minBudgetCents != null) count++;
  if (model.scheduledOn != null) count++;
  if (model.sort !== DEFAULT_JOB_FILTERS.sort) count++;
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

/**
 * Completed jobs per category — the input Smart Match ranks by. Pure: the
 * caller hands in the worker's assigned jobs (hooks/useMyJobsHub.ts
 * `working`); only rows that reached `completed` count.
 */
export function completedByCategory(
  jobs: readonly { category: JobCategory; status: string }[]
): Partial<Record<JobCategory, number>> {
  const out: Partial<Record<JobCategory, number>> = {};
  for (const job of jobs) {
    if (job.status !== 'completed') continue;
    out[job.category] = (out[job.category] ?? 0) + 1;
  }
  return out;
}

const createdMs = (job: { created_at: string }) => new Date(job.created_at).getTime();

/** The `newest` rule: dated jobs first, soonest first; then the undated,
 *  newest-posted first. Same-day ties fall back to newest-posted too. */
function compareNewest(a: OpenJob, b: OpenJob): number {
  const ad = a.scheduled_date, bd = b.scheduled_date;
  if (ad != null && bd != null) {
    // Both 'YYYY-MM-DD' keys — a string compare IS a date compare here, and
    // parsing would reintroduce the timezone the column exists to avoid.
    if (ad !== bd) return ad < bd ? -1 : 1;
    return createdMs(b) - createdMs(a);
  }
  if (ad != null) return -1;
  if (bd != null) return 1;
  return createdMs(b) - createdMs(a);
}

const distanceOf = (job: OpenJob): number => {
  const value = (job as { distance_miles?: unknown }).distance_miles;
  return typeof value === 'number' ? value : Number.POSITIVE_INFINITY;
};

/** Closest first; rows without a distance sink. Zero when neither has one. */
function compareDistance(a: OpenJob, b: OpenJob): number {
  const da = distanceOf(a), db = distanceOf(b);
  if (da === db) return 0;
  return da - db;
}

export function applyJobFilters<T extends OpenJob>(
  jobs: readonly T[],
  model: JobFilterModel,
  context: JobSortContext = {}
): T[] {
  const until = model.scheduledUntil ?? model.scheduledOn;
  let out = jobs.filter((job) => {
    if (model.categories.size > 0 && !model.categories.has(job.category)) return false;
    if (model.minBudgetCents != null) {
      const ceiling = budgetCeiling(job);
      // No stated budget passes every floor — see the model comment.
      if (ceiling != null && ceiling < model.minBudgetCents) return false;
    }
    // An absent date is not a claim about any day, so it does not pass a
    // window. Compared as plain strings because every side is a 'YYYY-MM-DD'
    // calendar key.
    if (model.scheduledOn != null) {
      const day = job.scheduled_date;
      if (day == null || day < model.scheduledOn || day > (until as string)) return false;
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
    out.sort(compareDistance);
  } else if (model.sort === 'bids') {
    const counts = context.offerCounts ?? {};
    const countOf = (job: T) => counts[job.id] ?? 0;
    out.sort((a, b) => countOf(a) - countOf(b) || compareDistance(a, b) || compareNewest(a, b));
  } else if (model.sort === 'reset') {
    // The feed's own order: newest-posted first, and nothing else.
    out.sort((a, b) => createdMs(b) - createdMs(a));
  } else if (model.sort === 'smart') {
    const skills = context.skills ?? new Set<JobCategory>();
    const done = context.completedByCategory ?? {};
    // Band 0: categories the worker has completed jobs in (most first);
    // band 1: the rest of their advertised skills; band 2: everything else.
    const band = (job: T) => ((done[job.category] ?? 0) > 0 ? 0 : skills.has(job.category) ? 1 : 2);
    out.sort(
      (a, b) =>
        band(a) - band(b) ||
        (done[b.category] ?? 0) - (done[a.category] ?? 0) ||
        compareDistance(a, b) ||
        compareNewest(a, b)
    );
  } else {
    out.sort(compareNewest);
  }
  return out;
}
