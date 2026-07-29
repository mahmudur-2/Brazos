import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import { supabase } from './supabase';

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
  /**
   * Resolved GPS for the location, when the client used the "use my location"
   * button. Stored in `job_locations` (jobs.lat/lng were removed in phase12),
   * which is what feeds the hotspot map.
   */
  coords?: { lat: number; lng: number } | null;
  /**
   * Direct hire ("Hire Again"): skip open bidding and assign the job straight
   * to this worker at the agreed price. When set, budgetCents is the agreed
   * amount and the job is created already-assigned.
   */
  hireWorkerId?: string | null;
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
    // is absent there and correctly falls back to an empty list.
    photos: toPhotoArray(row.photos),
  };
}

// Explicit allowlist for the browsing feed (Find Work) — deliberately not
// `select('*')`. jobs.lat/lng were removed from this table entirely (see
// phase12 SQL) so there's nothing sensitive left to select here anyway, but
// this keeps the query self-documenting and stops a future `select('*')`
// from silently reopening this class of leak if a new sensitive column is
// ever added to `jobs`.
const OPEN_JOB_COLUMNS =
  'id, client_id, title, description, category, location, budget_cents, status, created_at, photos';

/** Fetch all jobs with status 'open', newest first (worker browse feed). */
export async function fetchOpenJobs() {
  const { data, error } = await supabase
    .from('jobs')
    .select(OPEN_JOB_COLUMNS)
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  return { data: (data ?? []).map(toOpenJob), error };
}

/**
 * Insert a new job owned by `clientId`. Normally opens for bidding; when
 * `hireWorkerId` is set it's created already assigned to that worker
 * (direct hire), skipping the bidding round entirely.
 */
export async function createJob(clientId: string, input: NewJobInput) {
  const isDirectHire = !!input.hireWorkerId;

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      client_id: clientId,
      title: input.title,
      description: input.description,
      category: input.category,
      location: input.location,
      budget_cents: input.budgetCents,
      photos: input.photos ?? [],
      status: isDirectHire ? 'assigned' : 'open',
      ...(isDirectHire
        ? {
            assigned_worker_id: input.hireWorkerId,
            final_amount_cents: input.budgetCents,
          }
        : {}),
    })
    .select()
    .single();

  if (error || !data) return { data: null, error };

  // Exact coordinates live in job_locations (never on `jobs` — see phase12),
  // so this is a second write. A failure here only costs the map pin, so it's
  // logged into the return value but doesn't fail the whole post.
  let locationError: { message: string } | null = null;
  if (input.coords) {
    const { error: locErr } = await supabase.from('job_locations').insert({
      job_id: (data as Job).id,
      lat: input.coords.lat,
      lng: input.coords.lng,
    });
    if (locErr) {
      // Surface the real cause (RLS denial, network error, etc.) instead of
      // silently dropping it — the caller only sees a generic "no map pin"
      // notice, so this is the only place the actual reason is visible.
      console.error('[jobs] job_locations insert failed', locErr);
      locationError = locErr;
    }
  }

  return { data: data as Job, error: null, locationError };
}

/**
 * Update a job's postable details (title/description/category/location/
 * budget/photos). Only reachable from the UI while the job has zero bids
 * (see ClientJobDetailScreen) — enforced there rather than in RLS because
 * the existing jobs_update_own policy also has to keep working for
 * acceptBid()/cancellation after bids exist, so it can't be narrowed to
 * zero-bid-only without breaking those.
 */
export async function updateJob(jobId: string, input: NewJobInput) {
  const { data, error } = await supabase
    .from('jobs')
    .update({
      title: input.title,
      description: input.description,
      category: input.category,
      location: input.location,
      budget_cents: input.budgetCents,
      photos: input.photos ?? [],
    })
    .eq('id', jobId)
    .select()
    .single();

  if (error || !data) return { data: null, error };

  let locationError: { message: string } | null = null;
  if (input.coords) {
    const { error: locErr } = await supabase
      .from('job_locations')
      .upsert({ job_id: jobId, lat: input.coords.lat, lng: input.coords.lng });
    if (locErr) {
      console.error('[jobs] job_locations upsert failed', locErr);
      locationError = locErr;
    }
  } else {
    // Location text changed without re-pinning, so any previously saved
    // coordinates no longer match it — drop them rather than leave a stale
    // pin on the map.
    const { error: delErr } = await supabase
      .from('job_locations')
      .delete()
      .eq('job_id', jobId);
    if (delErr) {
      console.error('[jobs] job_locations delete (stale pin) failed', delErr);
      locationError = delErr;
    }
  }

  return { data: data as Job, error: null, locationError };
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
  photoUrls?: string[] | null
) {
  const patch: Record<string, unknown> = { status };

  // Only touch the photo columns when there's something to write, so the
  // update doesn't fail if those (migration-added) columns aren't present yet.
  if (photoUrls && photoUrls.length > 0) {
    patch.completion_photos = photoUrls;
    // Keep the legacy scalar in sync with the first photo so anything still
    // reading completion_photo_url (older rows, external queries) sees a
    // sensible value rather than null.
    patch.completion_photo_url = photoUrls[0];
  }

  const { error } = await supabase.from('jobs').update(patch).eq('id', jobId);
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
