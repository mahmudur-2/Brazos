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
