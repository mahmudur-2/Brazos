import type { Payment } from './payments';

/**
 * The pure half of the wallet (Phase 11): bucket sums over payments rows and
 * nothing else — §G's no-hand-kept-balance rule, in a module with no runtime
 * imports so the node test suite executes it directly. lib/earnings.ts owns
 * the fetching; this owns the math.
 */

export type EarningsRow = Payment & { job_title: string | null };

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
