/**
 * 2026-09-30 (the build run, idea 12) — "NEED IT TODAY": honest urgency, never fake scarcity. The
 * customer's own flag, set once when they post (jobs.needed_today); nearby workers' alert says so,
 * and a job card shows the Today pill only on the calendar day the job was posted — after midnight
 * the pill is gone on its own, because "today" has passed. Pure, so the tests execute it.
 */
export function showsTodayPill(
  job: { needed_today?: boolean | null; created_at: string },
  now: Date = new Date()
): boolean {
  if (job.needed_today !== true) return false;
  const posted = new Date(job.created_at);
  if (Number.isNaN(posted.getTime())) return false;
  return (
    posted.getFullYear() === now.getFullYear() &&
    posted.getMonth() === now.getMonth() &&
    posted.getDate() === now.getDate()
  );
}
