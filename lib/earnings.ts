import { supabase } from './supabase';
import { fetchPayoutsOnTheirWay, withPayoutFact, workerTakeCents, type PaymentColumns } from './payments';
import { deriveEarnings, type EarningsRow } from './earningsMath';
import { API_MAX_ROWS } from './supabaseTypes';

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

// B23: partially_refunded is read too — a late cancellation's fee, once the refund lands.
const EARNING_STATUSES = ['held', 'released', 'paid_out', 'partially_refunded'] as const;

/**
 * C5: job ids per `in.(…)` read. 200 uuids are about 7.4 KB of URL, under the
 * 8 KB a URL may safely carry.
 */
export const JOB_ID_BATCH = 200;

/**
 * C5 / A9 — EVERY payee row, page by page. One read stops at API_MAX_ROWS, so
 * a long ledger was summed short in silence. Keyset paging, newest first, on
 * (created_at, id): two rows with one timestamp are told apart by id, so a
 * page boundary inside a tie neither repeats nor skips a row. The values are
 * double-quoted in the filter so a `+00:00` offset is read as written.
 */
async function readEveryEarningRow(
  userId: string
): Promise<{ data: PaymentColumns[]; error: null } | { data: null; error: { message?: string | null } }> {
  const rows: PaymentColumns[] = [];
  let after: { created_at: string; id: string } | null = null;
  for (;;) {
    let query = supabase
      .from('payments')
      .select(
        'id, job_id, offer_id, payer_id, payee_id, kind, amount_cents, platform_fee_cents, provider, provider_ref, status, authorized_at, held_at, released_at, release_reason, paid_out_at, created_at, updated_at, release_requested_at, refund_cents, transfer_cents, refund_failed_at, refund_arranged_at'
      )
      .eq('payee_id', userId)
      .in('status', [...EARNING_STATUSES]);
    if (after) {
      query = query.or(
        `created_at.lt."${after.created_at}",and(created_at.eq."${after.created_at}",id.lt."${after.id}")`
      );
    }
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(API_MAX_ROWS);
    if (error) return { data: null, error };
    const page = (data ?? []) as PaymentColumns[];
    rows.push(...page);
    if (page.length < API_MAX_ROWS) return { data: rows, error: null };
    const last = page[page.length - 1];
    after = { created_at: last.created_at, id: last.id };
  }
}

/**
 * Every money row where the user is the payee (job payments AND tips), with
 * job titles resolved in one batched read. RLS scopes both queries to what
 * the payee may see. release_requested_at rides along (n4b, 2026-09-05) so
 * Payouts can tell an approved stripe row still waiting on its transfer —
 * lib/payments.ts payoutSetupNotice() — from one that is merely held.
 *
 * The job read carries release_due_at beside the title (A4 wiring P1; a6,
 * 2026-09-05, read completed_at): the server's automatic approval time, the
 * only input to the release clock (lib/jobLifecycle.ts releaseDeadlineMs), so
 * the Earnings ledger states the same time the hub's card shows both parties
 * instead of inventing a second rule. It is a computed field, so this read stays
 * a select on `jobs`. Same read, same RLS scope.
 */
export async function fetchMyEarnings(userId: string) {
  // Codex R8-A1: the payout fact beside the rows, in parallel (lib/payments.ts withPayoutFact).
  const [{ data, error }, onTheirWay] = await Promise.all([readEveryEarningRow(userId), fetchPayoutsOnTheirWay()]);

  if (error) return { data: null, error };

  const payments = data.map((p) => withPayoutFact(p, onTheirWay));
  const jobIds = [...new Set(payments.map((p) => p.job_id))];
  const jobs = new Map<string, { title: string; release_due_at: string | null; status: string | null }>();
  // C5: a job's status changes the sums (a cancelled job's fee), so a failed read fails the whole
  // read instead of summing without it.
  for (let start = 0; start < jobIds.length; start += JOB_ID_BATCH) {
    const { data: jobRows, error: jobsError } = await supabase
      .from('jobs')
      .select('id, title, status, release_due_at')
      .in('id', jobIds.slice(start, start + JOB_ID_BATCH));
    if (jobsError) return { data: null, error: jobsError };
    // The generated select types do not know a computed field, so the row is typed here, at its one
    // mapping place, and release_due_at is checked rather than trusted.
    for (const j of (jobRows ?? []) as unknown as {
      id: string;
      title: string;
      status: string | null;
      release_due_at: unknown;
    }[]) {
      jobs.set(j.id, { title: j.title, release_due_at: typeof j.release_due_at === 'string' ? j.release_due_at : null, status: j.status });
    }
  }

  const rows: EarningsRow[] = payments.map((p) => {
    const job = jobs.get(p.job_id);
    return {
      ...p,
      job_title: job?.title ?? null,
      job_release_due_at: job?.release_due_at ?? null,
      job_status: job?.status ?? null,
    };
  });
  return { data: deriveEarnings(rows, workerTakeCents), error: null };
}
