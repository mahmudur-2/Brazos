import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import { supabase } from './supabase';
import { transitionJobStatusWithoutRpc } from './jobStatusCompatibility';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

// Mirrors the Postgres `job_category` enum. Originally 7 values; phase23
// (supabase/phase23_realistic_job_seed.sql) extended the live enum with the
// 4 marked below to match SKILL_CATEGORIES (lib/skillCategories.ts) — the
// comment there previously said this list "can't be freely extended" because
// nothing had done so yet, not because it structurally couldn't be.
export const JOB_CATEGORIES = [
  'dog_walking',
  'cleaning',
  'moving',
  'yard_work',
  'handyman',
  'errands',
  'furniture_assembly', // added phase23
  'tv_mounting',        // added phase23
  'painting',           // added phase23
  'packing',            // added phase23
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
  // Labels for the 4 added categories match SKILL_CATEGORIES' wording exactly
  // (lib/skillCategories.ts), so the same category reads identically whether
  // it's shown as a job's category or a worker's advertised skill.
  furniture_assembly: 'Furniture Assembly',
  tv_mounting: 'TV/Furniture Mounting',
  painting: 'Painting',
  packing: 'Packing/Unpacking',
  other: 'Other',
};

export const JOB_CATEGORY_ICONS: Record<JobCategory, IoniconName> = {
  dog_walking: 'paw',
  cleaning: 'sparkles',
  moving: 'cube',
  yard_work: 'leaf',
  handyman: 'hammer',
  errands: 'bag-handle',
  furniture_assembly: 'construct',
  tv_mounting: 'tv',
  painting: 'color-palette',
  packing: 'archive',
  other: 'ellipsis-horizontal',
};

/**
 * Per-category accent for icon chips (job cards, job details, portfolio
 * items). Every category previously shared the same muted green square, so
 * a list of jobs was only distinguishable by reading each title — color
 * now does that scanning work instead. `icon` is whichever of white/dark
 * reads with better contrast against that category's `bg`.
 */
export const JOB_CATEGORY_COLORS: Record<JobCategory, { bg: string; icon: string }> = {
  handyman: { bg: '#3B6FA6', icon: '#FFFFFF' }, // blue
  cleaning: { bg: '#2E8B84', icon: '#FFFFFF' }, // teal
  moving: { bg: '#C56A2E', icon: '#FFFFFF' }, // orange
  dog_walking: { bg: '#7B5CA6', icon: '#FFFFFF' }, // purple
  yard_work: { bg: '#5A8F3C', icon: '#FFFFFF' }, // green (distinct from the brand's deeper forest green)
  errands: { bg: '#E0A93A', icon: '#3D2B0F' }, // amber — light enough to need a dark glyph
  furniture_assembly: { bg: '#8B6544', icon: '#FFFFFF' }, // brown/tan
  tv_mounting: { bg: '#5B6B75', icon: '#FFFFFF' }, // slate gray
  painting: { bg: '#B85C7A', icon: '#FFFFFF' }, // rose/pink
  packing: { bg: '#4A5A9E', icon: '#FFFFFF' }, // indigo
  other: { bg: '#6B7280', icon: '#FFFFFF' }, // neutral gray fallback
};

/** JOB_CATEGORY_COLORS[category], guarded the same way JOB_CATEGORY_ICONS
 *  lookups are elsewhere — job.category can in principle carry a raw DB
 *  value outside the current JobCategory union. */
export function categoryAccent(category: JobCategory): { bg: string; icon: string } {
  return JOB_CATEGORY_COLORS[category] ?? JOB_CATEGORY_COLORS.other;
}

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
  /** Photos the client attached when posting (phase13). Max 5, may be empty. */
  photos: string[];
  /** Short videos the client attached when posting (phase34). Max 2, may be
   *  empty. Kept separate from `photos` so every existing image call site
   *  keeps meaning images. */
  videos: string[];
  /**
   * Photos the worker attached when marking the job complete (phase17).
   * Use completionPhotosOf() rather than reading this directly — it folds in
   * the legacy single completion_photo_url for jobs finished before phase17.
   */
  completion_photos: string[];
};

/** `photos` is jsonb; tolerate null/legacy rows and non-array values. */
function toPhotoArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

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
    photos: toPhotoArray(row.photos),
    videos: toPhotoArray(row.videos),
    completion_photos: toPhotoArray(row.completion_photos),
  };
}

/**
 * Every completion photo for a job, newest schema first. Jobs completed
 * before phase17 only have the single completion_photo_url, so that is folded
 * in when the array is empty — otherwise older finished jobs would appear to
 * have lost their photo.
 */
export function completionPhotosOf(job: {
  completion_photos?: string[] | null;
  completion_photo_url?: string | null;
}): string[] {
  const list = job.completion_photos ?? [];
  if (list.length > 0) return list;
  return job.completion_photo_url ? [job.completion_photo_url] : [];
}

export type NewJobInput = {
  title: string;
  description: string;
  category: JobCategory;
  location: string;
  budgetCents: number | null;
  /** Public URLs of photos attached to the posting (max 5, enforced in UI). */
  photos?: string[];
  /** Public URLs of short videos attached to the posting (max 2). */
  videos?: string[];
  /**
   * Resolved GPS for the location, when the client used the "use my location"
   * button. Stored in `job_locations` (jobs.lat/lng were removed in phase12),
   * which is what feeds the hotspot map.
   */
  coords?: { lat: number; lng: number } | null;
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
  photos: string[];
  videos: string[];
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
    // jobs_in_cell() (the map drill-down RPC) doesn't select photos, so this
    // is absent there and correctly falls back to an empty list. Same for
    // videos, which that RPC likewise does not return.
    photos: toPhotoArray(row.photos),
    videos: toPhotoArray(row.videos),
  };
}

// Explicit allowlist for the browsing feed (Find Work) — deliberately not
// `select('*')`. jobs.lat/lng were removed from this table entirely (see
// phase12 SQL) so there's nothing sensitive left to select here anyway, but
// this keeps the query self-documenting and stops a future `select('*')`
// from silently reopening this class of leak if a new sensitive column is
// ever added to `jobs`.
const OPEN_JOB_COLUMNS =
  'id, client_id, title, description, category, location, budget_cents, status, created_at, photos, videos';
const JOB_COLUMNS =
  `${OPEN_JOB_COLUMNS}, assigned_worker_id, final_amount_cents, completion_photo_url, completion_photos`;

/** Fetch all jobs with status 'open', newest first (worker browse feed). */
export async function fetchOpenJobs() {
  const { data, error } = await supabase
    .from('jobs')
    .select(OPEN_JOB_COLUMNS)
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  return { data: (data ?? []).map(toOpenJob), error };
}

/** Create an open job and its optional exact location in one transaction. */
export async function createJob(_clientId: string, input: NewJobInput) {
  const { data, error } = await supabase
    .rpc('create_job', {
      p_title: input.title,
      p_description: input.description,
      p_category: input.category,
      p_location: input.location,
      p_budget_cents: input.budgetCents,
      p_photos: input.photos ?? [],
      p_lat: input.coords?.lat ?? null,
      p_lng: input.coords?.lng ?? null,
      p_videos: input.videos ?? [],
    })
    .single();

  return {
    data: data ? mapJobRow(data) : null,
    error,
    locationError: null as { message: string } | null,
  };
}

/**
 * Update a job's postable details (title/description/category/location/
 * budget/photos/videos). update_job_details() enforces ownership, open status,
 * and zero bids, then updates/removes the exact location in the same
 * transaction.
 */
export async function updateJob(jobId: string, input: NewJobInput) {
  const { data, error } = await supabase
    .rpc('update_job_details', {
      p_job_id: jobId,
      p_title: input.title,
      p_description: input.description,
      p_category: input.category,
      p_location: input.location,
      p_budget_cents: input.budgetCents,
      p_photos: input.photos ?? [],
      p_lat: input.coords?.lat ?? null,
      p_lng: input.coords?.lng ?? null,
      p_videos: input.videos ?? [],
    })
    .single();

  return {
    data: data ? mapJobRow(data) : null,
    error,
    locationError: null as { message: string } | null,
  };
}

/**
 * Delete a job entirely. job_locations is cleaned up automatically via its
 * ON DELETE CASCADE foreign key back to jobs (see phase12) — no separate
 * delete call needed here. RLS (phase14) only allows this while the job has
 * zero bids; the UI additionally only ever shows the option in that state.
 */
export async function deleteJob(jobId: string) {
  const { error } = await supabase.from('jobs').delete().eq('id', jobId);
  return { error };
}

/** The exact coordinates saved for one job, if any (client/assigned worker only, per RLS). */
export async function fetchJobLocation(jobId: string) {
  const { data, error } = await supabase
    .from('job_locations')
    .select('lat, lng')
    .eq('job_id', jobId)
    .maybeSingle();

  return { data: data as { lat: number; lng: number } | null, error };
}

/**
 * Workers this client has previously hired who completed a job for them —
 * the eligibility set for the "Hire Again" button. Client-scoped by
 * definition: it only ever looks at jobs this user posted.
 */
export async function fetchRehirableWorkerIds(clientId: string) {
  const { data, error } = await supabase
    .from('jobs')
    .select('assigned_worker_id')
    .eq('client_id', clientId)
    .eq('status', 'completed')
    .not('assigned_worker_id', 'is', null);

  const ids = new Set(
    (data ?? [])
      .map((r: { assigned_worker_id: string | null }) => r.assigned_worker_id)
      .filter((id): id is string => !!id)
  );
  return { data: ids, error };
}

/** Whether this client may "Hire Again" one specific worker. */
export async function canRehireWorker(clientId: string, workerId: string) {
  const { data, error } = await supabase
    .from('jobs')
    .select('id')
    .eq('client_id', clientId)
    .eq('assigned_worker_id', workerId)
    .eq('status', 'completed')
    .limit(1);

  return { data: (data ?? []).length > 0, error };
}

/**
 * Fetch all jobs posted by `clientId`, newest first, with a bid count.
 * jobs<->bids has two FKs (bids.job_id and jobs.accepted_bid_id), so the
 * embed must be disambiguated to the bids.job_id relationship.
 */
export async function fetchJobsByClient(clientId: string) {
  const { data, error } = await supabase
    .from('jobs')
    .select(`${JOB_COLUMNS}, bids!bids_job_id_fkey(count)`)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  return { data: (data ?? []).map(mapJobRow), error };
}

/** Fetch jobs the given worker is assigned to (You're working), newest first. */
export async function fetchJobsAssignedToWorker(workerId: string) {
  const { data, error } = await supabase
    .from('jobs')
    .select(`${JOB_COLUMNS}, bids!bids_job_id_fkey(count)`)
    .eq('assigned_worker_id', workerId)
    .order('created_at', { ascending: false });

  return { data: (data ?? []).map(mapJobRow), error };
}

/** Fetch a single job by id, with its bid count. */
export async function fetchJobById(jobId: string) {
  const { data, error } = await supabase
    .from('jobs')
    .select(`${JOB_COLUMNS}, bids!bids_job_id_fkey(count)`)
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
  photoUrls?: string[] | null
) {
  const { error } = await supabase.rpc('transition_job_status', {
    p_job_id: jobId,
    p_status: status,
    p_completion_photos: photoUrls ?? null,
  });
  if (error?.code === 'PGRST202') {
    return transitionJobStatusWithoutRpc({ jobId, status, photoUrls });
  }
  return { error };
}

/** Parse a dollar string from a form into integer cents, or null if empty.
 *  Zero is rejected the same as negative — "no budget" is what an empty
 *  field already means, so an explicit 0 can only be a mistake or a
 *  meaningless amount, never a deliberate value. */
export function dollarsToCents(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const dollars = Number(trimmed);
  if (Number.isNaN(dollars) || dollars <= 0) return Number.NaN;
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
