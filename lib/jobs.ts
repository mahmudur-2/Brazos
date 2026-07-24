import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import { supabase } from './supabase';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

// Mirrors the Postgres `job_category` enum.
export const JOB_CATEGORIES = [
  'dog_walking',
  'cleaning',
  'moving',
  'yard_work',
  'handyman',
  'errands',
  'other',
] as const;

export type JobCategory = (typeof JOB_CATEGORIES)[number];

export const JOB_CATEGORY_LABELS: Record<JobCategory, string> = {
  dog_walking: 'Dog walking',
  cleaning: 'Cleaning',
  moving: 'Moving',
  yard_work: 'Yard work',
  handyman: 'Handyman',
  errands: 'Errands',
  other: 'Other',
};

export const JOB_CATEGORY_ICONS: Record<JobCategory, IoniconName> = {
  dog_walking: 'paw',
  cleaning: 'sparkles',
  moving: 'cube',
  yard_work: 'leaf',
  handyman: 'hammer',
  errands: 'bag-handle',
  other: 'ellipsis-horizontal',
};

// Status is left as a string so unknown values from the DB still render.
export type Job = {
  id: string;
  client_id: string;
  title: string;
  description: string;
  category: JobCategory;
  location: string | null;
  budget_cents: number | null;
  status: string;
  created_at: string;
  bid_count: number;
  assigned_worker_id: string | null;
  final_amount_cents: number | null;
  completion_photo_url: string | null;
};

/** Map a raw jobs row (+ optional bids(count) embed) to a Job. */
export function mapJobRow(row: any): Job {
  return {
    id: row.id,
    client_id: row.client_id,
    title: row.title,
    description: row.description,
    category: row.category,
    location: row.location ?? null,
    budget_cents: row.budget_cents ?? null,
    status: row.status,
    created_at: row.created_at,
    bid_count: row.bids?.[0]?.count ?? 0,
    assigned_worker_id: row.assigned_worker_id ?? null,
    final_amount_cents: row.final_amount_cents ?? null,
    completion_photo_url: row.completion_photo_url ?? null,
  };
}

export type NewJobInput = {
  title: string;
  description: string;
  category: JobCategory;
  location: string;
  budgetCents: number | null;
};

// Lightweight shape for the worker browse list (no bid count).
export type OpenJob = {
  id: string;
  client_id: string;
  title: string;
  description: string;
  category: JobCategory;
  location: string | null;
  budget_cents: number | null;
  status: string;
  created_at: string;
};

export function toOpenJob(row: any): OpenJob {
  return {
    id: row.id,
    client_id: row.client_id,
    title: row.title,
    description: row.description,
    category: row.category,
    location: row.location ?? null,
    budget_cents: row.budget_cents ?? null,
    status: row.status,
    created_at: row.created_at,
  };
}

// Explicit allowlist for the browsing feed (Find Work) — deliberately not
// `select('*')`. jobs.lat/lng were removed from this table entirely (see
// phase12 SQL) so there's nothing sensitive left to select here anyway, but
// this keeps the query self-documenting and stops a future `select('*')`
// from silently reopening this class of leak if a new sensitive column is
// ever added to `jobs`.
const OPEN_JOB_COLUMNS =
  'id, client_id, title, description, category, location, budget_cents, status, created_at';

/** Fetch all jobs with status 'open', newest first (worker browse feed). */
export async function fetchOpenJobs() {
  const { data, error } = await supabase
    .from('jobs')
    .select(OPEN_JOB_COLUMNS)
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  return { data: (data ?? []).map(toOpenJob), error };
}

/** Insert a new job owned by `clientId`, defaulting status to 'open'. */
export async function createJob(clientId: string, input: NewJobInput) {
  const { data, error } = await supabase
    .from('jobs')
    .insert({
      client_id: clientId,
      title: input.title,
      description: input.description,
      category: input.category,
      location: input.location,
      budget_cents: input.budgetCents,
      status: 'open',
    })
    .select()
    .single();

  return { data: data as Job | null, error };
}

/**
 * Fetch all jobs posted by `clientId`, newest first, with a bid count.
 * jobs<->bids has two FKs (bids.job_id and jobs.accepted_bid_id), so the
 * embed must be disambiguated to the bids.job_id relationship.
 */
export async function fetchJobsByClient(clientId: string) {
  const { data, error } = await supabase
    .from('jobs')
    .select('*, bids!bids_job_id_fkey(count)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  return { data: (data ?? []).map(mapJobRow), error };
}

/** Fetch jobs the given worker is assigned to (You're working), newest first. */
export async function fetchJobsAssignedToWorker(workerId: string) {
  const { data, error } = await supabase
    .from('jobs')
    .select('*, bids!bids_job_id_fkey(count)')
    .eq('assigned_worker_id', workerId)
    .order('created_at', { ascending: false });

  return { data: (data ?? []).map(mapJobRow), error };
}

/** Fetch a single job by id, with its bid count. */
export async function fetchJobById(jobId: string) {
  const { data, error } = await supabase
    .from('jobs')
    .select('*, bids!bids_job_id_fkey(count)')
    .eq('id', jobId)
    .maybeSingle();

  return { data: data ? mapJobRow(data) : null, error };
}

/**
 * Update a job's status through the completion flow (assigned -> in_progress ->
 * completed). Pass a photo URL to store the worker's "done" photo on completion.
 */
export async function updateJobStatus(
  jobId: string,
  status: 'in_progress' | 'completed',
  photoUrl?: string | null
) {
  const patch: Record<string, unknown> = { status };
  // Only touch completion_photo_url when we actually have one, so the update
  // doesn't fail if that (migration-added) column isn't present yet.
  if (photoUrl) patch.completion_photo_url = photoUrl;

  const { error } = await supabase.from('jobs').update(patch).eq('id', jobId);
  return { error };
}

/** Parse a dollar string from a form into integer cents, or null if empty. */
export function dollarsToCents(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const dollars = Number(trimmed);
  if (Number.isNaN(dollars) || dollars < 0) return Number.NaN;
  return Math.round(dollars * 100);
}

/** Format integer cents for display, e.g. 5000 -> "$50". */
export function formatBudget(cents: number | null): string {
  if (cents == null) return 'No budget set';
  const dollars = cents / 100;
  return `$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Human-friendly bid count, e.g. "3 bids" / "1 bid" / "No bids yet". */
export function formatBidCount(count: number): string {
  if (count === 0) return 'No bids yet';
  return `${count} ${count === 1 ? 'bid' : 'bids'}`;
}
