import {
  onTimePercent,
  totalCompletedJobs,
  trustRowFor,
} from './compareBids';

/**
 * The worker hero card's trust content (4E) — a thin, pure COMPOSITION of
 * lib/compareBids.ts's derivations, never a second copy of them:
 * worker_job_stats rows are summed by totalCompletedJobs, and the "New
 * worker" verdict is trustRowFor's, verbatim. The rating moved off the
 * profile's rating columns in R8b-c: it is the worker-role
 * profile_review_summary — REVEALED reviews of one role only — because
 * rating_avg/rating_count mix both roles and count reviews the blind window
 * still holds back.
 *
 * The C3 contract, enforced here so every rendering surface inherits it:
 * trust content is positive-only and drawn from real reads, rendered only
 * when non-null. Null is unknown and renders NOTHING — never zero, never a
 * placeholder. Concretely:
 *
 * - rating: only with at least one REVEALED worker-role review — zero
 *   revealed reviews is not a fact, and an unanswered or failed summary
 *   read is UNKNOWN. No known rating → no rating row. The number is D1's
 *   shown_average; isNew tells the surface to print the word "New" instead
 *   of it while the reputation is too young for a number.
 * - completedJobs: null until the stats read answers (a pending or failed
 *   read is UNKNOWN, not zero), and a KNOWN zero also renders nothing —
 *   positive-only means no "0 jobs completed" line.
 * - respondsIn: profiles.response_time verbatim (a nullable free-text column
 *   the app never fabricates), trimmed; blank is null.
 * - newWorker: trustRowFor's verdict — requires KNOWING the worker has fewer
 *   than 3 completed jobs alongside a null on_time_pct. It replaces the fact
 *   rows entirely (the 4D-3 §5.3 reading), so a card never says both
 *   "New worker" and "2 jobs completed".
 */

export type WorkerHeroTrust = {
  rating: { shownAverage: number; isNew: boolean; count: number } | null;
  /** True only on trustRowFor's KNOWN-new verdict; suppresses the fact rows. */
  newWorker: boolean;
  /** A positive completed-jobs total, or null (unknown or zero). */
  completedJobs: number | null;
  /** The responds-in string to render after "Responds in ", or null. */
  respondsIn: string | null;
};

export type WorkerHeroProfileFacts = {
  on_time_pct?: number | null;
  response_time?: string | null;
} | null;

export type WorkerHeroRatingSummary = {
  shownAverage: number | null;
  isNew: boolean;
  total: number;
} | null;

export function deriveWorkerHeroTrust(input: {
  profile: WorkerHeroProfileFacts;
  /** profile_review_summary(p_user, 'worker'), or null while unanswered/failed. */
  ratingSummary: WorkerHeroRatingSummary;
  /** worker_job_stats(p_worker) rows, or null while unanswered/failed. */
  stats: ReadonlyArray<{ count: number }> | null;
}): WorkerHeroTrust {
  const profile = input.profile;
  const summary = input.ratingSummary;

  const rating =
    summary && summary.total > 0 && summary.shownAverage != null
      ? { shownAverage: summary.shownAverage, isNew: summary.isNew, count: summary.total }
      : null;

  const completed = input.stats !== null ? totalCompletedJobs(input.stats) : null;
  const verdict = trustRowFor(onTimePercent(profile?.on_time_pct), completed);
  if (verdict.kind === 'new') {
    return { rating, newWorker: true, completedJobs: null, respondsIn: null };
  }

  const respondsIn = profile?.response_time?.trim() || null;
  return {
    rating,
    newWorker: false,
    completedJobs: completed != null && completed > 0 ? completed : null,
    respondsIn,
  };
}
