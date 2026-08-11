import { supabase } from './supabase';

/**
 * The JobDetail poster trust signal, counted server-side (phase58's
 * client_job_stats — SECURITY DEFINER). It replaced the direct counted
 * selects in lib/jobs.fetchClientJobStats: those only ever worked through
 * the legacy permissive jobs policy the hardening run dropped, so counting
 * now happens where the rows are, without reopening row access.
 */
export type ClientJobStats = {
  posted: number;
  completed: number;
  cancelled: number;
};

export async function fetchClientJobStatsCounted(clientId: string) {
  const { data, error } = await supabase
    .rpc('client_job_stats', { p_client_id: clientId })
    .single();

  if (error) return { data: null, error };
  const row = data as { posted: number; completed: number; cancelled: number };
  return {
    data: {
      posted: Number(row.posted ?? 0),
      completed: Number(row.completed ?? 0),
      cancelled: Number(row.cancelled ?? 0),
    } as ClientJobStats,
    error: null,
  };
}
