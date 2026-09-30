/**
 * 2026-09-30 (the build run, idea 14) — REPEAT JOBS, the words. The three cadences, their drawn labels
 * and the one line both people read on a visit of a series. Pure — no imports — so the tests execute
 * it; lib/jobSeries.ts is the calls. The date arithmetic is the server's alone (series_visit_date(),
 * migration 20260930001000): this file shows the next visit's day the server wrote, and never
 * computes one.
 */

export type SeriesCadence = 'weekly' | 'biweekly' | 'monthly';

/** The three choices, in the order the Review step offers them. Mirrors job_series_cadence_known. */
export const SERIES_CADENCES: readonly SeriesCadence[] = ['weekly', 'biweekly', 'monthly'];

/** The drawn words: "Repeat this job · Every 2 weeks". */
export const CADENCE_LABELS: Record<SeriesCadence, string> = {
  weekly: 'Every week',
  biweekly: 'Every 2 weeks',
  monthly: 'Every month',
};

export type JobSeries = {
  id: string;
  client_id: string;
  origin_job_id: string;
  cadence: SeriesCadence;
  /** The first visit's day; null while a flexible first visit is not yet done. */
  anchor_date: string | null;
  /** The next visit's day, as the server wrote it — the one on offer while pending_job_id is set. */
  next_visit_date: string | null;
  /** Who gets each visit first; null once they drop the series, or before anyone is hired. */
  worker_id: string | null;
  price_cents: number | null;
  /** The visit on offer to the worker right now, if any. */
  pending_job_id: string | null;
  status: 'active' | 'stopped';
};

/** "Tue, Oct 21" from a plain calendar date — local parts, never the Date-from-ISO constructor. */
export function visitDayLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * The two lines both people read on a visit of a series — what repeats, then what it means for the
 * reader (the Fable review: one line wrapped at the date's comma). The customer's: "Repeats every 2
 * weeks" / "Next visit Tue, Oct 21" (or, before a flexible first visit is done, when it counts
 * from); the worker's: "Repeats every 2 weeks" / "You get each visit first". A stopped series says
 * so, with no second line.
 */
export function seriesLine(
  series: Pick<JobSeries, 'cadence' | 'next_visit_date' | 'status'>,
  perspective: 'customer' | 'worker'
): { title: string; caption: string | null } {
  if (series.status !== 'active') return { title: 'Repeat stopped', caption: null };
  const title = `Repeats ${CADENCE_LABELS[series.cadence].toLowerCase()}`;
  if (perspective === 'worker') return { title, caption: 'You get each visit first' };
  return {
    title,
    caption: series.next_visit_date
      ? `Next visit ${visitDayLabel(series.next_visit_date)}`
      : 'Counts from the day this visit is done',
  };
}
