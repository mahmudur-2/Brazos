/**
 * Bid-composer availability chips (4D-3 §6.1) — pure, executed by tests; its
 * one import is the import-free lib/time.ts (F19, the one date formatter).
 *
 * Two optional chip groups append ONE trailing line to the offer's message
 * ("Can start today · about 1-2h"). Zero selections leave the message
 * byte-identical to what the composer always sent. The server caps p_message
 * at 500 characters (create_offer, latest revision in
 * supabase/phase61_marketplace_thread_identity.sql — a test pins the
 * literal); the mirror here disables the chips with a written reason before
 * that cap can be hit. Never a truncated send, never a raw database error.
 */

import { formatDay } from './time';

export const OFFER_MESSAGE_MAX = 500;

export type StartChoice =
  | { kind: 'today' }
  | { kind: 'tomorrow' }
  | { kind: 'day'; label: string };

export type DurationChoice = 'under1h' | '1to2h' | '2to4h' | '4hplus';

/** Chip labels, in row order. */
export const DURATION_OPTIONS: ReadonlyArray<{ value: DurationChoice; label: string }> = [
  { value: 'under1h', label: 'Under 1h' },
  { value: '1to2h', label: '1-2h' },
  { value: '2to4h', label: '2-4h' },
  { value: '4hplus', label: '4h+' },
];

const DURATION_FRAGMENTS: Record<DurationChoice, string> = {
  under1h: 'under 1h',
  '1to2h': 'about 1-2h',
  '2to4h': 'about 2-4h',
  '4hplus': 'about 4h+',
};

/**
 * The ONE trailing line the selections produce, or null when nothing is
 * selected. A "Pick a day" selection with no day actually picked contributes
 * nothing — only a concrete day is a statement worth appending.
 */
export function availabilityLine(
  start: StartChoice | null,
  duration: DurationChoice | null
): string | null {
  const startText =
    start == null
      ? null
      : start.kind === 'today'
        ? 'Can start today'
        : start.kind === 'tomorrow'
          ? 'Can start tomorrow'
          : `Can start ${start.label}`;
  const durationText = duration == null ? null : DURATION_FRAGMENTS[duration];
  if (startText && durationText) return `${startText} · ${durationText}`;
  if (startText) return startText;
  if (durationText) return durationText.charAt(0).toUpperCase() + durationText.slice(1);
  return null;
}

/**
 * Final p_message: the pitch as the composer has always trimmed it, plus at
 * most one trailing line. With no line the result is byte-identical to
 * today's `message.trim()`.
 */
export function composeOfferMessage(pitch: string, line: string | null): string {
  const base = pitch.trim();
  if (!line) return base;
  return base ? `${base}\n${line}` : line;
}

/**
 * The longest line the chip groups could possibly produce given the day
 * labels currently on offer — the worst case the availability gate must
 * leave room for.
 */
export function longestAvailabilityLineLength(dayLabels: readonly string[]): number {
  const starts = [
    'Can start today',
    'Can start tomorrow',
    ...dayLabels.map((label) => `Can start ${label}`),
  ];
  const longestStart = Math.max(...starts.map((s) => s.length));
  const longestDuration = Math.max(
    ...Object.values(DURATION_FRAGMENTS).map((f) => f.length)
  );
  return longestStart + ' · '.length + longestDuration;
}

/**
 * Whether the chips may be offered at all for this pitch: appending even the
 * worst-case line (plus its newline) must stay inside the server cap. When
 * false the composer disables and clears the chips and says why — the send
 * is then exactly the pitch, never a truncation.
 */
export function chipsAvailable(pitch: string, longestLineLength: number): boolean {
  return pitch.trim().length + 1 + longestLineLength <= OFFER_MESSAGE_MAX;
}

/**
 * The composer's day list behind "Pick a day": the next `count` days AFTER
 * tomorrow (today and tomorrow are their own chips). `from` exists for tests.
 */
export function upcomingStartDays(
  count: number,
  from: Date = new Date()
): { iso: string; label: string }[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 2 + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
    return {
      iso,
      label: formatDay(d, { now: from }),
    };
  });
}
