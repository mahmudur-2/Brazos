/**
 * 2026-09-30 (the build run, idea 5) — RUNNING LATE, ONE TAP. The hired worker's 10 / 20 / 30 min
 * chips (report_running_late(), migration 20260930000700) tell the customer and MOVE the arrival
 * time: while the job is assigned and the worker has not arrived, every label of the booked window
 * shows it moved by the delay — "6–8 PM" becomes "6:20–8:20 PM". Once they arrive, or the job starts
 * without an arrival tap, the booked window is history again. Pure, so the tests execute it;
 * lib/jobs.ts arrivalWindowLabel and lib/liveJobStatus.ts bookedWindow read it.
 */

/** The three chips. Mirrors the jobs_late_minutes_known CHECK and the RPC's own refusal. */
export const LATE_CHOICES = [10, 20, 30] as const;

type Lateable = { late_minutes?: number | null; arrived_at?: string | null; status?: string | null };

/**
 * How far the arrival window moves: the worker's last tap, while the job is assigned and until they
 * arrive. "Already there? Start the job" skips the arrival tap, so the status ends it too — a started,
 * finished or cancelled job never carries a delay.
 */
export function lateShiftMinutes(job: Lateable): number {
  if (job.status !== 'assigned' || job.arrived_at) return 0;
  const minutes = job.late_minutes ?? 0;
  return (LATE_CHOICES as readonly number[]).includes(minutes) ? minutes : 0;
}

/**
 * Whether the chips may show: running late is said on the job's own day — or any day, for a job
 * with no day set. `today` is the device's local calendar date ("2026-09-30"); the server refuses
 * the same way against the market's (report_running_late()).
 */
export function isLateDay(scheduledDate: string | null | undefined, now: Date = new Date()): boolean {
  if (!scheduledDate) return true;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return scheduledDate === today;
}

/** A clock time from minutes after midnight: "6 PM", "6:20 PM", "12:20 AM" (wrapping past midnight). */
export function clockLabel(totalMinutes: number): string {
  const inDay = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(inDay / 60);
  const minute = inDay % 60;
  const suffix = hour < 12 ? 'AM' : 'PM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${display} ${suffix}` : `${display}:${String(minute).padStart(2, '0')} ${suffix}`;
}

/**
 * The booked window moved by `shift` minutes: "6:20–8:20 PM" — the meridiem said once when both ends
 * share it, as the booked window itself is written.
 */
export function movedWindow(startHour: number, endHour: number, shift: number, compact = true): string {
  const a = clockLabel(startHour * 60 + shift);
  const b = clockLabel(endHour * 60 + shift);
  return compact && a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}
