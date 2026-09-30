/**
 * 2026-09-30 (the build run, idea 14) — REPEAT JOBS. The customer posts once and picks every week,
 * every 2 weeks or every month on the Review step; three days before each next visit the worker they
 * hired gets it first, at the same price, for 24 hours; a pass or a lapse opens that visit to bids.
 * Every visit is its own job — hired through accept_offer(), paid in Checkout when the customer
 * confirms. The schedule's work is the server's (migration 20260930001000, advance_job_series());
 * this file is the app's side: the one read and the three calls a person makes. The words — the
 * cadences and the line both people read — are lib/repeatJobs.ts, pure.
 */
import { supabase } from './supabase';
import { SERIES_CADENCES, type JobSeries, type SeriesCadence } from './repeatJobs';

export { CADENCE_LABELS, SERIES_CADENCES, seriesLine, visitDayLabel } from './repeatJobs';
export type { JobSeries, SeriesCadence } from './repeatJobs';

const SERIES_COLUMNS =
  'id, client_id, origin_job_id, cadence, anchor_date, next_visit_date, worker_id, price_cents, pending_job_id, status';

function seriesFrom(row: any): JobSeries | null {
  if (!row || typeof row.id !== 'string') return null;
  const cadence: SeriesCadence = (SERIES_CADENCES as readonly string[]).includes(row.cadence) ? row.cadence : 'weekly';
  return {
    id: row.id,
    client_id: row.client_id,
    origin_job_id: row.origin_job_id,
    cadence,
    anchor_date: row.anchor_date ?? null,
    next_visit_date: row.next_visit_date ?? null,
    worker_id: row.worker_id ?? null,
    price_cents: row.price_cents ?? null,
    pending_job_id: row.pending_job_id ?? null,
    // An allow-list: anything but 'active' reads as stopped.
    status: row.status === 'active' ? 'active' : 'stopped',
  };
}

/** The series a visit belongs to, when the reader is its customer or its worker (RLS); else null. */
export async function fetchJobSeries(seriesId: string) {
  const { data, error } = await supabase.from('job_series').select(SERIES_COLUMNS).eq('id', seriesId).maybeSingle();
  return { data: seriesFrom(data), error };
}

/** The posted job becomes the series' first visit (idempotent on the server). */
export async function startJobSeries(jobId: string, cadence: SeriesCadence) {
  const { data, error } = await supabase.rpc('start_job_series', { p_job_id: jobId, p_cadence: cadence });
  return { data: seriesFrom(data), error };
}

/** The customer stops the series; visits already hired stay hired. */
export async function stopJobSeries(seriesId: string) {
  const { data, error } = await supabase.rpc('stop_job_series', { p_series_id: seriesId });
  return { data: seriesFrom(data), error };
}

/** The series' worker drops its future visits; this one stays theirs. */
export async function dropSeriesWorker(seriesId: string) {
  const { error } = await supabase.rpc('drop_series_worker', { p_series_id: seriesId });
  return { error };
}
