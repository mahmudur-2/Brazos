import { supabase } from './supabase';

/**
 * Screen 36's "report an issue" (phase51's job_disputes). An open report
 * freezes release — both the manual approval RPC and the 72h auto-release
 * refuse while one exists — so writes are RPC-only. Reads are plain RLS
 * table reads scoped to the job's two parties. Resolution (status
 * 'resolved') is a human step in a later phase; nothing here writes it.
 */

export type DisputeReason =
  | 'not_as_described'
  | 'incomplete'
  | 'damage'
  | 'no_show'
  | 'other';

export type DisputeStatus = 'open' | 'withdrawn' | 'resolved';

export type JobDispute = {
  id: string;
  job_id: string;
  payment_id: string | null;
  opened_by: string;
  reason: DisputeReason;
  details: string | null;
  status: DisputeStatus;
  created_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
};

export const DISPUTE_REASONS: DisputeReason[] = [
  'not_as_described',
  'incomplete',
  'damage',
  'no_show',
  'other',
];

export const DISPUTE_REASON_LABELS: Record<DisputeReason, string> = {
  not_as_described: 'Not as described',
  incomplete: 'Work is incomplete',
  damage: 'Something was damaged',
  no_show: 'The worker didn’t show up',
  other: 'Something else',
};

const DISPUTE_COLUMNS =
  'id, job_id, payment_id, opened_by, reason, details, status, created_at, resolved_at, resolution_note';

/** The job's open issue report, or null. Either party can read it (RLS). */
export async function fetchOpenJobDispute(jobId: string) {
  const { data, error } = await supabase
    .from('job_disputes')
    .select(DISPUTE_COLUMNS)
    .eq('job_id', jobId)
    .eq('status', 'open')
    .maybeSingle();

  return { data: data as JobDispute | null, error };
}

/**
 * Which of these jobs carry an OPEN issue report, in one query — the My Jobs
 * hub's frozen-release marker (an open report parks a finished job in Review
 * and blocks the 72h auto-release). Same RLS as fetchOpenJobDispute: rows
 * come back only for jobs the viewer is party to.
 */
export async function fetchOpenDisputeJobIds(jobIds: string[]) {
  if (jobIds.length === 0) return { data: new Set<string>(), error: null };

  const { data, error } = await supabase
    .from('job_disputes')
    .select('job_id')
    .in('job_id', jobIds)
    .eq('status', 'open');

  return {
    data: new Set(((data ?? []) as { job_id: string }[]).map((row) => row.job_id)),
    error,
  };
}

/**
 * Open an issue report on a completed job. Server-enforced: customer only,
 * one open report per job (a second call returns the existing one), refused
 * once the payment has released.
 */
export async function openJobDispute(jobId: string, reason: DisputeReason, details: string | null) {
  const { data, error } = await supabase
    .rpc('open_job_dispute', {
      p_job_id: jobId,
      p_reason: reason,
      p_details: details,
    })
    .single();

  return { data: (data ?? null) as JobDispute | null, error };
}

/** Withdraw your own open report (idempotent on withdrawn), unfreezing release. */
export async function withdrawJobDispute(disputeId: string) {
  const { data, error } = await supabase
    .rpc('withdraw_job_dispute', { p_dispute_id: disputeId })
    .single();

  return { data: (data ?? null) as JobDispute | null, error };
}
