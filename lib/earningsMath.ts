import type { Payment } from './payments';

/**
 * The pure half of the wallet (Phase 11): bucket sums over payments rows and
 * nothing else — §G's no-hand-kept-balance rule, in a module with no runtime
 * imports so the node test suite executes it directly. lib/earnings.ts owns
 * the fetching; this owns the math.
 */

/**
 * `job_completed_at` is OPTIONAL (a6, 2026-09-05): it feeds the ledger line's
 * release clock through lib/jobLifecycle.ts's releaseDeadlineMs, and a row
 * built without it — a legacy job with no completed_at, or a fixture — simply
 * has no clock and keeps the plain sentence.
 */
export type EarningsRow = Payment & {
  job_title: string | null;
  job_completed_at?: string | null;
};

export type EarningsSummary = {
  pendingCents: number;
  availableCents: number;
  transferredCents: number;
  feeCents: number;
  rows: EarningsRow[];
};

export function deriveEarnings(rows: EarningsRow[]): EarningsSummary {
  let pendingCents = 0;
  let availableCents = 0;
  let transferredCents = 0;
  let feeCents = 0;
  for (const row of rows) {
    if (row.status === 'held') pendingCents += row.amount_cents;
    else if (row.status === 'released') availableCents += row.amount_cents;
    else if (row.status === 'paid_out') transferredCents += row.amount_cents;
    feeCents += row.platform_fee_cents;
  }
  return { pendingCents, availableCents, transferredCents, feeCents, rows };
}

export type OpenJobsPotential = { cents: number; count: number };

/**
 * Worker Home's POTENTIAL EARNINGS pair over the open-jobs feed: the summed
 * budgets of every open job the viewer could actually earn from, and how many
 * rows that sum spans. The viewer's own posted jobs are excluded — you cannot
 * earn from your own job — and a budget-less job still counts as a row while
 * adding $0. This is the ONE implementation of the rule
 * (tests/potentialEarnings.test.mjs executes it directly); the atlas-48
 * browse screen's authorized inline duplicate was deleted with that screen in
 * Batch F. Every surface derives the figure from here.
 */
export function openJobsPotential(
  jobs: ReadonlyArray<{ client_id: string; budget_cents: number | null }>,
  viewerId: string | null | undefined
): OpenJobsPotential {
  let cents = 0;
  let count = 0;
  for (const job of jobs) {
    if (viewerId && job.client_id === viewerId) continue;
    cents += job.budget_cents ?? 0;
    count += 1;
  }
  return { cents, count };
}
