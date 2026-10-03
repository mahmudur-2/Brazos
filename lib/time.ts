/**
 * F19 (fix run, 2026-10-03) — ONE DATE FORMATTER. Every day, month and clock
 * the app prints goes through this file, in en-US, through Intl.DateTimeFormat
 * instances built once per shape and time zone (toLocaleDateString builds a
 * new one on every call). Two day shapes, chosen by the room a surface has:
 *
 *   formatDay       "Wed, Sep 30"   the full day, wherever a line can hold it
 *   formatShortDay  "Sep 30"        a row that may not grow (a chip, a stamp)
 *
 * Both add ", 2025" only when the year is not the current one. A screen never
 * calls toLocaleDateString itself (tests/fixRunF.test.mjs).
 *
 * This file imports nothing, so a test can load it from its file URL.
 */
export type DateFormatOptions = {
  /** An IANA zone, for a date the market's day decides. Default: the device's. */
  timeZone?: string;
  /** The "now" the year rule compares against. Default: the clock. */
  now?: Date;
};

const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatter(shape: Intl.DateTimeFormatOptions, timeZone?: string): Intl.DateTimeFormat {
  const key = `${JSON.stringify(shape)}|${timeZone ?? ''}`;
  let made = FORMATTERS.get(key);
  if (!made) {
    made = new Intl.DateTimeFormat('en-US', timeZone ? { ...shape, timeZone } : shape);
    FORMATTERS.set(key, made);
  }
  return made;
}

function isValid(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

function yearIn(date: Date, timeZone?: string): number {
  return timeZone ? Number(formatter({ year: 'numeric' }, timeZone).format(date)) : date.getFullYear();
}

function withYear(date: Date, shape: Intl.DateTimeFormatOptions, opts?: DateFormatOptions): string {
  if (!isValid(date)) return '';
  const tz = opts?.timeZone;
  const other = yearIn(date, tz) !== yearIn(opts?.now ?? new Date(), tz);
  return formatter(other ? { ...shape, year: 'numeric' } : shape, tz).format(date);
}

/** "Wed, Sep 30" — ", 2025" added only when the year is not the current one. */
export function formatDay(date: Date, opts?: DateFormatOptions): string {
  return withYear(date, { weekday: 'short', month: 'short', day: 'numeric' }, opts);
}

/** "Sep 30" — the compact day, for a row that may not grow; the same year rule. */
export function formatShortDay(date: Date, opts?: DateFormatOptions): string {
  return withYear(date, { month: 'short', day: 'numeric' }, opts);
}

/** "Wed". */
export function formatWeekday(date: Date, opts?: DateFormatOptions): string {
  return isValid(date) ? formatter({ weekday: 'short' }, opts?.timeZone).format(date) : '';
}

/** "Sep 2026" — Member since. */
export function formatMonthYear(date: Date, opts?: DateFormatOptions): string {
  return isValid(date) ? formatter({ month: 'short', year: 'numeric' }, opts?.timeZone).format(date) : '';
}

/** "9:30 AM". */
export function formatClock(date: Date, opts?: DateFormatOptions): string {
  return isValid(date) ? formatter({ hour: 'numeric', minute: '2-digit' }, opts?.timeZone).format(date) : '';
}

/**
 * A plain 'YYYY-MM-DD' day key as a Date in the local calendar, or null for a
 * malformed key — never through the Date-from-ISO-string constructor, which
 * would shift "2026-08-12" a day for viewers west of UTC.
 */
export function dateOfDayKey(key: string | null | undefined): Date | null {
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

/** "Wed, Sep 30" from a plain 'YYYY-MM-DD' key, or null for a missing or malformed one. */
export function formatDayKey(key: string | null | undefined, opts?: DateFormatOptions): string | null {
  const date = dateOfDayKey(key);
  return date ? formatDay(date, opts) : null;
}

/** Compact relative time, e.g. "just now", "5 min ago", "2 h ago", "3 d ago". */
export function formatTimeAgo(iso: string): string {
  return relativeAge(iso, 'long');
}

/**
 * 2026-09-20 (sitting 2) — the SAME thresholds, spelled tight: "just now",
 * "5m ago", "2h ago", "3d ago", "2w ago" — the job card's one-line facts
 * ("Sat, Sep 5 · No bids · 2w ago"), where the long form cost the line.
 */
export function formatTimeAgoShort(iso: string): string {
  return relativeAge(iso, 'short');
}

/** One rule for both spellings: the unit words differ, the thresholds never. */
function relativeAge(iso: string, style: 'long' | 'short'): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  const unit = (n: number, long: string, short: string) =>
    style === 'long' ? `${n} ${long} ago` : `${n}${short} ago`;

  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return unit(mins, 'min', 'm');
  const hours = Math.floor(mins / 60);
  if (hours < 24) return unit(hours, 'h', 'h');
  const days = Math.floor(hours / 24);
  if (days < 7) return unit(days, 'd', 'd');
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return unit(weeks, 'w', 'w');
  return formatShortDay(new Date(iso));
}

/**
 * 2026-09-28 (LUX-LIST-64 #54) — THE INBOX ROW'S STAMP, in the row's 44pt
 * right column (refs/inbox-clean-list.html): "now", "12m", "4h" today; "1d"
 * for the day before; the weekday ("Mon") within the week; then the date
 * ("Sep 12"), with the year as digits once it is another year ("9/12/25").
 * A stamp, not an age — past a day it names the day.
 */
export function formatInboxStamp(iso: string, nowMs: number = Date.now()): string {
  const then = new Date(iso);
  const thenMs = then.getTime();
  if (Number.isNaN(thenMs)) return '';
  const mins = Math.floor(Math.max(0, nowMs - thenMs) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  if (hours < 48) return '1d';
  const days = Math.floor(hours / 24);
  if (days < 7) return formatWeekday(then);
  const now = new Date(nowMs);
  // The 44pt column cannot hold "Sep 12, 2025", so another year is digits.
  return then.getFullYear() === now.getFullYear()
    ? formatShortDay(then, { now })
    : formatter({ month: 'numeric', day: 'numeric', year: '2-digit' }).format(then);
}

/**
 * Time-of-day greeting, e.g. "Good morning".
 *
 * Takes the date rather than reading the clock itself so the boundaries are
 * testable and so a screen that already has a `now` does not disagree with it.
 */
export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Clock time for a chat bubble, e.g. "3:45 PM". */
export function formatClockTime(iso: string): string {
  return formatClock(new Date(iso));
}
