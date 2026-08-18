import {
  knownRating,
  onTimePercent,
  totalCompletedJobs,
  trustRowFor,
} from './compareBids';

/**
 * The worker hero card's trust content (4E) — a thin, pure COMPOSITION of
 * lib/compareBids.ts's derivations, never a second copy of them: knownRating
 * decides whether a rating is a fact, worker_job_stats rows are summed by
 * totalCompletedJobs, and the "New worker" verdict is trustRowFor's, verbatim.
 *
 * The C3 contract, enforced here so every rendering surface inherits it:
 * trust content is positive-only and drawn from real profile columns,
 * rendered only when non-null. Null is unknown and renders NOTHING — never
 * zero, never a placeholder. Concretely:
 *
 * - rating: only with at least one counted review (a rating_avg with zero
 *   reviews is not a fact). No known rating → no rating row — and no "New"
 *   stand-in where a number would go.
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
  rating: { average: number; count: number } | null;
  /** True only on trustRowFor's KNOWN-new verdict; suppresses the fact rows. */
  newWorker: boolean;
  /** A positive completed-jobs total, or null (unknown or zero). */
  completedJobs: number | null;
  /** The responds-in string to render after "Responds in ", or null. */
  respondsIn: string | null;
};

export type WorkerHeroProfileFacts = {
  rating_avg?: number | null;
  rating_count?: number | null;
  on_time_pct?: number | null;
  response_time?: string | null;
} | null;

export function deriveWorkerHeroTrust(input: {
  profile: WorkerHeroProfileFacts;
  /** worker_job_stats(p_worker) rows, or null while unanswered/failed. */
  stats: ReadonlyArray<{ count: number }> | null;
}): WorkerHeroTrust {
  const profile = input.profile;

  const average = knownRating(profile);
  const count = profile?.rating_count ?? 0;
  const rating = average != null && count > 0 ? { average, count } : null;

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
