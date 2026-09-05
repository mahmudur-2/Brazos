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
 *   transferred  — paid_out rows: swept by the simulated cash-out
 *
 * Fee math: platform_fee_cents is summed from the same rows the amounts come
 * from — today always 0, exactly what checkout shows ("None in sandbox").
 * The screen's every figure must be reproducible by re-summing `rows`.
 */

const EARNING_STATUSES = ['held', 'released', 'paid_out'] as const;

/**
 * Every money row where the user is the payee (job payments AND tips), with
 * job titles resolved in one batched read. RLS scopes both queries to what
 * the payee may see. release_requested_at rides along (n4b, 2026-09-05) so
 * Payouts can tell an approved stripe row still waiting on its transfer —
 * lib/payments.ts payoutSetupNotice() — from one that is merely held.
 */
export async function fetchMyEarnings(userId: string) {
  const { data, error } = await supabase
    .from('payments')
    .select(
      'id, job_id, offer_id, payer_id, payee_id, kind, amount_cents, platform_fee_cents, provider, provider_ref, status, authorized_at, held_at, released_at, release_reason, paid_out_at, created_at, updated_at, release_requested_at'
    )
    .eq('payee_id', userId)
    .in('status', [...EARNING_STATUSES])
    .order('created_at', { ascending: false });

  if (error) return { data: null, error };

  const payments = (data ?? []) as Payment[];
  const jobIds = [...new Set(payments.map((p) => p.job_id))];
  const titles = new Map<string, string>();
  if (jobIds.length > 0) {
    const { data: jobs } = await supabase.from('jobs').select('id, title').in('id', jobIds);
    for (const j of (jobs ?? []) as { id: string; title: string }[]) titles.set(j.id, j.title);
  }

  const rows: EarningsRow[] = payments.map((p) => ({
    ...p,
    job_title: titles.get(p.job_id) ?? null,
  }));
  return { data: deriveEarnings(rows), error: null };
}
