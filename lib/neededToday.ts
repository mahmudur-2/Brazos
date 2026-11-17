import { marketDayKey } from './time';

/**
 * 2026-09-30 (the build run, idea 12) — "NEED IT TODAY": honest urgency, never fake scarcity. The
 * customer's own flag, set once when they post (jobs.needed_today); nearby workers' alert says so,
 * and a job card shows the Today pill only on the calendar day the job was posted — after midnight
 * the pill is gone on its own, because "today" has passed. Pure, so the tests execute it.
 * C9 (A4-M4): the day and its midnight are the market's (lib/time.ts), not the phone's.
 */
export function showsTodayPill(
  job: { needed_today?: boolean | null; created_at: string },
  now: Date = new Date()
): boolean {
  if (job.needed_today !== true) return false;
  const posted = new Date(job.created_at);
  if (Number.isNaN(posted.getTime())) return false;
  return marketDayKey(posted) === marketDayKey(now);
}
