/**
 * 2026-09-30 (the build run, idea 7) — QUIET HOURS: midnight to 6 am on the person's own clock, OFF
 * until they switch it on (docs/DECISIONS.md 2026-09-30 entry (3)). Nearby-job alerts wait until
 * 6 am; their own jobs and money still come through (migration 20260930000800: the server holds a
 * nearby alert queued inside the window until the next local 6 am).
 *
 * The server needs to know whose midnight: the phone's own IANA zone, sent with the switch. Pure, so
 * the tests execute it.
 */

/** The row's words, one place. */
export const QUIET_HOURS_LABEL = 'Quiet hours';
export const QUIET_HOURS_HINT = 'Midnight to 6 am · nearby alerts wait';

/**
 * The phone's time zone for the server: its IANA name when the runtime reports one; otherwise the
 * fixed-offset zone for a whole-hour offset ("Etc/GMT+5" is UTC−5 — the Etc names invert the sign);
 * otherwise null, which the server reads as no quiet hours rather than a wrong midnight.
 */
export function deviceTimeZone(
  resolve: () => string | undefined = () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  offsetMinutes: number = new Date().getTimezoneOffset()
): string | null {
  try {
    const zone = resolve();
    if (zone && /^[A-Za-z0-9_+-]+(\/[A-Za-z0-9_+-]+)*$/.test(zone) && zone.length <= 64) return zone;
  } catch {
    // An engine without Intl time zones falls through to the offset.
  }
  if (!Number.isFinite(offsetMinutes) || offsetMinutes % 60 !== 0) return null;
  const hours = offsetMinutes / 60; // getTimezoneOffset is minutes BEHIND UTC: +300 is UTC−5.
  if (hours === 0) return 'Etc/GMT';
  return hours > 0 ? `Etc/GMT+${hours}` : `Etc/GMT${hours}`;
}
