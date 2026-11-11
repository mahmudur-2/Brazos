import { supabase } from './supabase';
import type { Payment } from './payments';
import { deriveEarnings, type EarningsRow } from './earningsMath';

export { deriveEarnings } from './earningsMath';
export type { EarningsRow, EarningsSummary } from './earningsMath';

/**
 * Screens 59/60 — the worker's wallet, DERIVED entirely from payments rows
 * (§G: never a hand-kept balance). Buckets:
 *
 *   pending      — held rows: protected, not yet approved
 *   available    — released rows: approved (or auto-approved), cash-out-able
 *   transferred  — paid_out rows (reserved: the ledger stops at released today)
 *
 * Fee math: platform_fee_cents is summed from the same rows the amounts come
 * from — the ledger's own figure, never a client rate.
 * The screen's every figure must be reproducible by re-summing `rows`.
 */

const EARNING_STATUSES = ['held', 'released', 'paid_out'] as const;

/**
 * Every money row where the user is the payee (job payments AND tips), with
 * job titles resolved in one batched read. RLS scopes both queries to what
 * the payee may see. release_requested_at rides along (n4b, 2026-09-05) so
 * Payouts can tell an approved stripe row still waiting on its transfer —
 * lib/payments.ts payoutSetupNotice() — from one that is merely held.
 *
 * The job read carries completed_at beside the title (a6, 2026-09-05): it is
 * the only input to the release clock (lib/jobLifecycle.ts releaseDeadlineMs),
 * so the Earnings ledger can state the same countdown the hub's card shows
 * both parties instead of inventing a second rule. Same read, same RLS scope,
 * one more column.
 */
export async function fetchMyEarnings(userId: string) {
  const { data, error } = await supabase
    .from('payments')
    .select(
      'id, job_id, offer_id, payer_id, payee_id, kind, amount_cents, platform_fee_cents, provider, provider_ref, status, authorized_at, held_at, released_at, release_reason, paid_out_at, created_at, updated_at, release_requested_at, refund_cents, transfer_cents'
    )
    .eq('payee_id', userId)
    .in('status', [...EARNING_STATUSES])
    .order('created_at', { ascending: false });

  if (error) return { data: null, error };

  const payments = (data ?? []) as Payment[];
  const jobIds = [...new Set(payments.map((p) => p.job_id))];
  const jobs = new Map<string, { title: string; completed_at: string | null }>();
  if (jobIds.length > 0) {
    const { data: jobRows } = await supabase
      .from('jobs')
      .select('id, title, completed_at')
      .in('id', jobIds);
    for (const j of (jobRows ?? []) as {
      id: string;
      title: string;
      completed_at: string | null;
    }[]) {
      jobs.set(j.id, { title: j.title, completed_at: j.completed_at });
    }
  }

  const rows: EarningsRow[] = payments.map((p) => {
    const job = jobs.get(p.job_id);
    return {
      ...p,
      job_title: job?.title ?? null,
      job_completed_at: job?.completed_at ?? null,
    };
  });
  return { data: deriveEarnings(rows), error: null };
}
