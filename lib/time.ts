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
  return new Date(iso).toLocaleDateString();
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
  if (days < 7) return then.toLocaleDateString('en-US', { weekday: 'short' });
  const now = new Date(nowMs);
  return then.getFullYear() === now.getFullYear()
    ? then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : then.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
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
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
