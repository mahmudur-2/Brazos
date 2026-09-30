/**
 * 2026-09-30 (the build run, idea 2) — REUSE A PAST JOB: which of the customer's jobs the + sheet
 * offers to post again, in what order, and what each compact card shows. Pure, so the tests
 * execute it; the sheet formats the money through formatBudget (lib/jobs.ts).
 *
 * Offered: the jobs already past or taken — hired, underway, done, or cancelled. Never a draft
 * (not a job anyone saw) and never one still open for bids (it is live: edit it instead). An
 * allow-list, so a status this code has not heard of is left out rather than offered.
 */
import type { Job } from './jobs';

export const REUSABLE_STATUSES: readonly string[] = ['assigned', 'in_progress', 'completed', 'cancelled'];

type Dated = Pick<Job, 'status' | 'created_at' | 'completed_at'>;

/** The card's date: when the work was finished, or else when it was posted. */
export function reuseCardInstant(job: Dated): string {
  return job.status === 'completed' && job.completed_at ? job.completed_at : job.created_at;
}

/** The customer's reusable jobs, the most recent first. */
export function reusableJobs<T extends Dated>(posted: readonly T[]): T[] {
  return posted
    .filter((job) => REUSABLE_STATUSES.includes(job.status))
    .slice()
    .sort((a, b) => Date.parse(reuseCardInstant(b)) - Date.parse(reuseCardInstant(a)));
}

/**
 * Whether the card shows a price: the budget the job was posted with — exactly what the new post is
 * filled with (group 2's review: a card reading the hired price opened a post carrying a different
 * one) — else none: an open-bids job with no maximum has no figure, and none is made up.
 */
export function reuseCardFigure(
  job: Pick<Job, 'budget_cents' | 'budget_min_cents' | 'budget_max_cents'>
): 'budget' | null {
  if (job.budget_cents != null || job.budget_min_cents != null || job.budget_max_cents != null) return 'budget';
  return null;
}

/** The compact card's width bounds: the operator's 128 to 160 — about two and a half across. */
export const REUSE_CARD_MIN = 128;
export const REUSE_CARD_MAX = 160;
/** An average glyph of the card's title (12pt, bold), for the width it needs across three lines. */
const TITLE_GLYPH = 6.6;

/**
 * "Just wide enough for its own text": the narrowest width in 128–160 that holds the title in three
 * lines, plus the card's own side padding. Most titles land near 128, so about two and a half cards
 * show across the sheet; only a long title takes the full 160 (and is then clipped at three lines).
 */
export function reuseCardWidth(title: string, paddingX: number): number {
  const perLine = Math.ceil((title.trim().length * TITLE_GLYPH) / 3);
  return Math.min(REUSE_CARD_MAX, Math.max(REUSE_CARD_MIN, perLine + paddingX));
}
