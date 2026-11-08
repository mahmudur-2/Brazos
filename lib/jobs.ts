import { LATE_CHOICES, lateShiftMinutes, movedWindow } from './runningLate';
import { formatDayKey } from './time';
import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import { categoryAccents } from '../ui/tokens';
import { supabase } from './supabase';
import { coordinateLocationError, publicLocationLabel } from './locationPrivacy';
import { DEFAULT_PRICING_MODE, pricingModeFrom, type PricingMode } from './pricingMode';
import { moneyCeilingError } from './validation';

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

/**
 * The names the job FILTER's category chips wear (operator, 2026-09-19) —
 * the eleven real categories, short. The "All services" entries in
 * lib/skillCategories.ts are search shortcuts onto these (Electrical,
 * Plumbing, Appliances, Pest Control and Drywall are all `handyman`; Junk
 * Removal is `moving`; Gutters, Landscaping and Snow are `yard_work` …), so
 * a chip per shortcut would promise a precision jobs are not posted with.
 * Each chip here filters exactly the category it names.
 */
export const JOB_CATEGORY_CHIP_LABELS: Record<JobCategory, string> = {
  furniture_assembly: 'Assembly',
  moving: 'Moving',
  cleaning: 'Cleaning',
  tv_mounting: 'TV mounting',
  handyman: 'Handyman / Repairs',
  yard_work: 'Yard work',
  painting: 'Painting',
  packing: 'Packing',
  dog_walking: 'Pet care',
  errands: 'Errands',
  other: 'Other',
};

/** The chips' order: the six quick services first, as on Home, then the rest. */
export const JOB_CATEGORY_CHIP_ORDER: readonly JobCategory[] = [
  'furniture_assembly', 'moving', 'cleaning', 'tv_mounting', 'handyman', 'yard_work',
  'painting', 'packing', 'dog_walking', 'errands', 'other',
];

/**
 * Tier A (C7) — THE LAUNCH POSTING ALLOWLIST, additive only. A key listed
 * here STAYS in JOB_CATEGORIES and JOB_CATEGORY_LABELS (worker services,
 * browse, search chips, Home tiles and existing rows all read the shared map)
 * and is filtered out at the POSTING category picker alone — one filter in
 * screens/PostJobScreen.tsx — so a customer cannot post work whose plain
 * reading is licensed NYC work.
 *
 * AT LAUNCH THE LIST IS EMPTY: none of the eleven keys reads plainly as
 * plumbing, electrical, or home improvement / contracting. Keys that MERGE
 * licensed and unlicensed work are left out by rule and named here for the
 * operator to decide: `handyman` (a general repairs key), `painting`
 * (residential painting over $200 is HIC-licensed work; a touch-up is not),
 * `moving` (a moving company is DOT-licensed; a pair of hands is not).
 * Adding a key is a one-line change; tests/launchCategories.test.mjs proves
 * any key added here still exists in the map and is absent from the picker.
 */
export const LAUNCH_EXCLUDED_CATEGORIES: readonly JobCategory[] = [];

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
 * now does that scanning work instead.
 *
 * THE VALUES LIVE IN ui/tokens.ts (L-002), not here: twenty-two colour
 * literals in a data-access module sat outside all three sanctioned token
 * surfaces and outside the hex fence's scanned directories. This module owns
 * the category VOCABULARY (the enum, its labels, its glyphs) and now takes
 * the accents from the token layer the same way every other surface does.
 * The `Record<JobCategory, …>` annotation below is what keeps the two in
 * step: a category added here with no accent in ui/tokens.ts is a type
 * error, not a runtime grey square.
 */
export const JOB_CATEGORY_COLORS: Record<JobCategory, { bg: string; icon: string }> =
  categoryAccents;

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
  /** Editable MIN/MAX budget range (phase49). Older jobs have neither and
   *  carry only the single budget_cents; new posts mirror the ceiling into
   *  budget_cents so legacy readers keep working. */
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  /** a4 (2026-09-05): the poster's own choice between open bids and a posted
   *  price (migration 20260930000400). Never nullable here — the column is
   *  defaulted and `pricingModeFrom` resolves anything unknown to open bids. */
  pricing_mode: PricingMode;
  /** Idea 12 (2026-09-30, migration 20260930000600): the customer asked for it today when posting.
   *  Never nullable here — the column is defaulted false; lib/neededToday.ts decides the pill. */
  needed_today: boolean;
  /** Scheduling (phase49): the chosen day plus a local wall-clock arrival
   *  window. All nullable — "flexible" is a real, common answer. */
  scheduled_date: string | null;
  arrival_start_hour: number | null;
  arrival_end_hour: number | null;
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
  /**
   * The single video the worker could attach when marking the job complete
   * (phase35). Empty for every job completed before that migration, which is
   * why nothing here ever assumes one exists.
   */
  completion_videos: string[];
  /**
   * Static arrival declarations (phase51) — set once by mark_worker_arrival(),
   * never cleared. There is no live location anywhere. Null on jobs worked
   * before phase51 or where the worker skipped the taps.
   */
  en_route_at: string | null;
  arrived_at: string | null;
  /** Idea 5 (2026-09-30, migration 20260930000700): the hired worker's last "running late" tap — 10,
   *  20 or 30 minutes — and when they said it. The arrival window moves by it until arrived_at. */
  late_minutes: number | null;
  late_reported_at: string | null;
  /** Idea 14 (2026-09-30, migration 20260930001000): the repeating job this visit belongs to, if any
   *  (lib/jobSeries.ts). Set only by the series' own functions. */
  series_id: string | null;
  /** When the job reached `completed` (phase51). Starts the 72h auto-release
   *  clock. Null for jobs completed before phase51 — their clock never runs. */
  completed_at: string | null;
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
    budget_min_cents: row.budget_min_cents ?? null,
    budget_max_cents: row.budget_max_cents ?? null,
    pricing_mode: pricingModeFrom(row.pricing_mode),
    needed_today: row.needed_today === true,
    scheduled_date: row.scheduled_date ?? null,
    arrival_start_hour: row.arrival_start_hour ?? null,
    arrival_end_hour: row.arrival_end_hour ?? null,
    // job_offers since phase46; `bids` is read for rows fetched by any query
    // still using the frozen embed, so neither shape renders a blank count.
    bid_count: row.job_offers?.[0]?.count ?? row.bids?.[0]?.count ?? 0,
    assigned_worker_id: row.assigned_worker_id ?? null,
    final_amount_cents: row.final_amount_cents ?? null,
    completion_photo_url: row.completion_photo_url ?? null,
    photos: toPhotoArray(row.photos),
    videos: toPhotoArray(row.videos),
    completion_photos: toPhotoArray(row.completion_photos),
    completion_videos: toPhotoArray(row.completion_videos),
    en_route_at: row.en_route_at ?? null,
    arrived_at: row.arrived_at ?? null,
    late_minutes: row.late_minutes ?? null,
    late_reported_at: row.late_reported_at ?? null,
    series_id: row.series_id ?? null,
    completed_at: row.completed_at ?? null,
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

/**
 * Every completion video for a job. There is no legacy single-column form to
 * fold in the way completionPhotosOf() has — the column arrived with phase35
 * and every job completed before it simply has none.
 */
export function completionVideosOf(job: { completion_videos?: string[] | null }): string[] {
  return job.completion_videos ?? [];
}

export type NewJobInput = {
  title: string;
  description: string;
  category: JobCategory;
  location: string;
  budgetCents: number | null;
  /** MIN/MAX budget range (screen 15). The server mirrors the ceiling into
   *  the legacy single budget_cents; callers pass whichever the poster set. */
  budgetMinCents?: number | null;
  budgetMaxCents?: number | null;
  /** a4 (2026-09-05): the posting choice. Absent means the default the server
   *  itself defaults to, so an older caller writes exactly today's row. */
  pricingMode?: PricingMode;
  /** Idea 12: "Need it today". Sent only when on, so an ordinary post is the exact call installed
   *  builds make; create_job() defaults it false. */
  neededToday?: boolean;
  /** YYYY-MM-DD, or null for "flexible" (screen 14). */
  scheduledDate?: string | null;
  /** Local wall-clock arrival window, both-or-neither (screen 14). */
  arrivalStartHour?: number | null;
  arrivalEndHour?: number | null;
  /**
   * Exact service address. Private by construction: it is stored only in
   * job_locations (the job_private_details surface — phase12 RLS: owner +
   * hired worker), never on the public jobs row.
   */
  addressLine?: string | null;
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
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  /** a4 (2026-09-05): carried on the browse shape too, so a card built from it
   *  can name the amount correctly without a second read. */
  pricing_mode: PricingMode;
  /** Idea 12: the customer asked for it today — the card's Today pill (lib/neededToday.ts). */
  needed_today: boolean;
  scheduled_date: string | null;
  arrival_start_hour: number | null;
  arrival_end_hour: number | null;
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
    // Open-market mask: a coordinate-shaped stored label renders as absent
    // (lib/locationPrivacy.ts) — rows stored before the write guard existed
    // must not put a GPS fix on the public feed. Owner surfaces map through
    // mapJobRow, which is deliberately unmasked.
    location: publicLocationLabel(row.location ?? null),
    budget_cents: row.budget_cents ?? null,
    // Absent from queries that predate phase49 (e.g. the map drill-down RPC's
    // projection) and correctly null there — same fallback rule as photos.
    budget_min_cents: row.budget_min_cents ?? null,
    budget_max_cents: row.budget_max_cents ?? null,
    // Absent from a projection that predates a4 (the map drill-down RPC) and
    // correctly open bids there — the allow-list resolves anything unknown.
    pricing_mode: pricingModeFrom(row.pricing_mode),
    needed_today: row.needed_today === true,
    scheduled_date: row.scheduled_date ?? null,
    arrival_start_hour: row.arrival_start_hour ?? null,
    arrival_end_hour: row.arrival_end_hour ?? null,
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
  'id, client_id, title, description, category, location, budget_cents, budget_min_cents, budget_max_cents, pricing_mode, needed_today, scheduled_date, arrival_start_hour, arrival_end_hour, status, created_at, photos, videos';
const JOB_COLUMNS =
  `${OPEN_JOB_COLUMNS}, assigned_worker_id, final_amount_cents, completion_photo_url, completion_photos, completion_videos, en_route_at, arrived_at, late_minutes, late_reported_at, series_id, completed_at`;

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
 * One job in the same shape the browse feed uses. This is the canonical
 * read for any screen that was handed an OpenJob through navigation params:
 * a route param is a snapshot from whenever the list that produced it was
 * loaded, so it can be both stale (the poster edited the job since) and
 * incomplete (jobs_in_cell(), the map drill-down RPC, doesn't select photos
 * or videos at all — see fetchJobsInCell).
 *
 * Deliberately the same OPEN_JOB_COLUMNS allowlist as fetchOpenJobs(), so
 * this exposes nothing a worker browsing the public feed cannot already
 * read.
 */
export async function fetchOpenJobById(jobId: string) {
  const { data, error } = await supabase
    .from('jobs')
    .select(OPEN_JOB_COLUMNS)
    .eq('id', jobId)
    .maybeSingle();

  return { data: data ? toOpenJob(data) : null, error };
}

/**
 * Batched variant of fetchOpenJobById for hydrating a list of ids that came
 * from somewhere with an incomplete projection. One query for the whole
 * list, never one per row. Returns rows in the order the ids were given so
 * a caller's existing ordering (e.g. the map RPC's) is preserved.
 */
export async function fetchOpenJobsByIds(ids: string[]) {
  if (ids.length === 0) return { data: [] as OpenJob[], error: null };

  const { data, error } = await supabase
    .from('jobs')
    .select(OPEN_JOB_COLUMNS)
    .in('id', ids);

  const byId = new Map((data ?? []).map((row) => [(row as { id: string }).id, toOpenJob(row)]));
  return {
    data: ids.map((id) => byId.get(id)).filter((j): j is OpenJob => !!j),
    error,
  };
}

/**
 * The image a job should be represented by, in one place, so a job looks the
 * same in the home preview, the browse list, the map drill-down and the
 * poster's own hub.
 *
 * Priority is the poster's first photo. Returning null means the caller should
 * fall back to that category's tinted icon block — there is deliberately no
 * stock imagery standing in for a real upload.
 */
export function jobThumbnailUrl(job: { photos?: string[] | null }): string | null {
  return job.photos?.[0] ?? null;
}

/**
 * Whether a job is in a category the worker advertises. One predicate for
 * Worker Home's "X match your skills" count and the results screen it opens
 * to, so the two can never disagree — see WorkerHomeScreen/WorkerResultsScreen.
 */
export function jobMatchesSkills(job: { category: JobCategory }, categories: ReadonlySet<string>): boolean {
  return categories.has(job.category);
}

/** phase75 ceiling mirror over every budget figure a job carries. Refused
 *  here, before the RPC, so the poster reads a sentence instead of the
 *  database CHECK's raw refusal. */
function jobBudgetCeilingError(input: NewJobInput): string | null {
  return (
    moneyCeilingError(input.budgetCents) ??
    moneyCeilingError(input.budgetMinCents) ??
    moneyCeilingError(input.budgetMaxCents)
  );
}

/**
 * a4's client mirror of the two posted-price rules `create_job()` and
 * `update_job_details()` enforce (migration 20260930000400) — the
 * MAX_COUNTERS_PER_SIDE arrangement: the database is the real enforcement and
 * this only decides what the app offers, refusing in the server's OWN
 * sentences before the RPC rather than after it. A posted price is one amount,
 * so it needs one and it takes no range.
 */
function jobPricingModeError(input: NewJobInput): string | null {
  if (input.pricingMode !== 'posted_price') return null;
  if (input.budgetCents == null || Number.isNaN(input.budgetCents) || input.budgetCents <= 0) {
    return 'A posted price needs an amount';
  }
  if (input.budgetMinCents != null || input.budgetMaxCents != null) {
    return 'A posted price is one amount, not a range';
  }
  return null;
}

/** Create an open job and its optional exact location in one transaction. */
export async function createJob(_clientId: string, input: NewJobInput) {
  const modeError = jobPricingModeError(input);
  if (modeError) {
    return {
      data: null,
      error: { message: modeError },
      locationError: null as { message: string } | null,
    };
  }

  const ceilingError = jobBudgetCeilingError(input);
  if (ceilingError) {
    return {
      data: null,
      error: { message: ceilingError },
      locationError: null as { message: string } | null,
    };
  }

  // The public location label must never be a raw GPS pair — refused here,
  // before the RPC, with a sentence instead of a stored doorstep (see
  // lib/locationPrivacy.ts for why this is a privacy boundary).
  const locationShapeError = coordinateLocationError(input.location);
  if (locationShapeError) {
    return {
      data: null,
      error: { message: locationShapeError },
      locationError: null as { message: string } | null,
    };
  }

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
      p_budget_min_cents: input.budgetMinCents ?? null,
      p_budget_max_cents: input.budgetMaxCents ?? null,
      p_scheduled_date: input.scheduledDate ?? null,
      p_arrival_start_hour: input.arrivalStartHour ?? null,
      p_arrival_end_hour: input.arrivalEndHour ?? null,
      p_address_line: input.addressLine ?? null,
      p_pricing_mode: input.pricingMode ?? DEFAULT_PRICING_MODE,
      ...(input.neededToday ? { p_needed_today: true } : {}),
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
  // Same posted-price mirror as createJob — an edit must not be the path that
  // reaches the server's refusal either.
  const modeError = jobPricingModeError(input);
  if (modeError) {
    return {
      data: null,
      error: { message: modeError },
      locationError: null as { message: string } | null,
    };
  }

  const ceilingError = jobBudgetCeilingError(input);
  if (ceilingError) {
    return {
      data: null,
      error: { message: ceilingError },
      locationError: null as { message: string } | null,
    };
  }

  // Same coordinate-shape refusal as createJob — an edit must not be the
  // path that publishes a GPS pair either.
  const locationShapeError = coordinateLocationError(input.location);
  if (locationShapeError) {
    return {
      data: null,
      error: { message: locationShapeError },
      locationError: null as { message: string } | null,
    };
  }

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
      p_budget_min_cents: input.budgetMinCents ?? null,
      p_budget_max_cents: input.budgetMaxCents ?? null,
      p_scheduled_date: input.scheduledDate ?? null,
      p_arrival_start_hour: input.arrivalStartHour ?? null,
      p_arrival_end_hour: input.arrivalEndHour ?? null,
      p_address_line: input.addressLine ?? null,
      p_pricing_mode: input.pricingMode ?? DEFAULT_PRICING_MODE,
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

export type JobPrivateLocation = {
  /** Nullable since phase49: a typed address has no GPS fix. Paired — lat and
   *  lng are always both set or both null. */
  lat: number | null;
  lng: number | null;
  /** The exact service address (job_private_details). Owner + hired worker
   *  only, enforced by phase12's RLS — this read simply comes back empty for
   *  anyone else. */
  address_line: string | null;
};

/** The exact location saved for one job, if any (client/assigned worker only, per RLS). */
export async function fetchJobLocation(jobId: string) {
  const { data, error } = await supabase
    .from('job_locations')
    .select('lat, lng, address_line')
    .eq('job_id', jobId)
    .maybeSingle();

  return { data: data as JobPrivateLocation | null, error };
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
 * Fetch all jobs posted by `clientId`, newest first, with an offer count.
 * jobs<->job_offers has two FKs (job_offers.job_id and jobs.accepted_offer_id),
 * so the embed must be disambiguated to the job_offers.job_id relationship —
 * the same disambiguation the bids embed needed before the unification.
 *
 * DRAFT/DIRECT JOBS ARE EXCLUDED UNTIL THEY ARE ACCEPTED. A direct offer
 * creates a real `jobs` row up front (that is where its title, media and
 * location live), but until someone accepts it, it is a negotiation the
 * customer has sent — not a job they have posted. Without this filter, every
 * outgoing offer would appear in My Jobs as a phantom entry that no screen
 * explains. This is Gate 2 from the architecture decision doc, and it has to
 * ship before phase45 lands any draft row.
 *
 * Once accepted, the job becomes `assigned` and shows up normally, which is
 * why the filter keys on status rather than on visibility alone.
 */
export async function fetchJobsByClient(clientId: string) {
  const { data, error } = await supabase
    .from('jobs')
    .select(`${JOB_COLUMNS}, job_offers!job_offers_job_id_fkey(count)`)
    .eq('client_id', clientId)
    .not('status', 'eq', 'draft')
    .order('created_at', { ascending: false });

  return { data: (data ?? []).map(mapJobRow), error };
}

/** Fetch jobs the given worker is assigned to (You're working), newest first. */
export async function fetchJobsAssignedToWorker(workerId: string) {
  const { data, error } = await supabase
    .from('jobs')
    .select(`${JOB_COLUMNS}, job_offers!job_offers_job_id_fkey(count)`)
    .eq('assigned_worker_id', workerId)
    .order('created_at', { ascending: false });

  return { data: (data ?? []).map(mapJobRow), error };
}

/** 2026-09-28 (LUX-LIST-64 #54) — what a job's stage derives from, and no more. */
export type JobStageFacts = {
  id: string;
  status: string;
  en_route_at: string | null;
  arrived_at: string | null;
  completed_at: string | null;
};

/**
 * The stage facts of the jobs the Inbox's rows name — the input
 * deriveJobLifecycle() takes from a job (with the payment and the dispute read
 * beside it), for the job chip's stage word. RLS limits `jobs` to rows the
 * caller may see; every job an inbox row names is one the caller shares.
 */
export async function fetchJobStageFacts(ids: string[]) {
  if (ids.length === 0) return { data: [] as JobStageFacts[], error: null };
  const { data, error } = await supabase
    .from('jobs')
    .select('id, status, en_route_at, arrived_at, completed_at')
    .in('id', ids);
  return { data: (data ?? []) as JobStageFacts[], error };
}

/** Fetch a single job by id, with its bid count. */
export async function fetchJobById(jobId: string) {
  const { data, error } = await supabase
    .from('jobs')
    .select(`${JOB_COLUMNS}, job_offers!job_offers_job_id_fkey(count)`)
    .eq('id', jobId)
    .maybeSingle();

  return { data: data ? mapJobRow(data) : null, error };
}

/**
 * Update a job's status through the completion flow (assigned -> in_progress ->
 * completed). Pass the worker's "done" photos and video to store them as the
 * completion evidence in the same transaction as the status change, so the job
 * can never end up marked complete with its evidence half-written.
 */
export async function updateJobStatus(
  jobId: string,
  status: 'in_progress' | 'completed',
  photoUrls?: string[] | null,
  videoUrls?: string[] | null
) {
  const { error } = await supabase.rpc('transition_job_status', {
    p_job_id: jobId,
    p_status: status,
    p_completion_photos: photoUrls ?? null,
    p_completion_videos: videoUrls ?? null,
  });

  return { error };
}

/**
 * The assigned worker declares a static arrival moment on an assigned job
 * (phase51's mark_worker_arrival — screens 33/56). Monotonic and idempotent
 * server-side; 'arrived' backfills en_route so the pair can never read
 * arrived-but-never-en-route. There is no live location anywhere.
 */
export async function markWorkerArrival(jobId: string, step: 'en_route' | 'arrived') {
  const { data, error } = await supabase
    .rpc('mark_worker_arrival', { p_job_id: jobId, p_step: step })
    .single();

  return { data: data ? mapJobRow(data) : null, error };
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
  // Tier A (C1): a whole-dollar amount keeps its bare form ("$125", "$1,000");
  // anything with cents renders exactly two decimals ("$107.50", never
  // "$107.5") — money reads the way the card statement prints it.
  const minimumFractionDigits = cents % 100 === 0 ? 0 : 2;
  return `$${dollars.toLocaleString('en-US', {
    minimumFractionDigits,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * One budget line for any job shape, range-aware. "$50–$80" when a real range
 * exists, a single figure when the range collapses (or the job predates
 * phase49 and has only budget_cents), and formatBudget's own "No budget set"
 * when the poster left it open. Screens that want different open-budget copy
 * branch before calling, exactly as they already do for budget_cents.
 */
export function budgetRangeLabel(job: {
  budget_cents: number | null;
  budget_min_cents?: number | null;
  budget_max_cents?: number | null;
}): string {
  const min = job.budget_min_cents ?? null;
  const max = job.budget_max_cents ?? null;
  if (min != null && max != null && min !== max) {
    return `${formatBudget(min)}–${formatBudget(max)}`;
  }
  return formatBudget(max ?? min ?? job.budget_cents);
}

/** True when the job carries any stated budget figure at all. */
export function hasBudget(job: {
  budget_cents: number | null;
  budget_min_cents?: number | null;
  budget_max_cents?: number | null;
}): boolean {
  return (
    job.budget_cents != null || job.budget_min_cents != null || job.budget_max_cents != null
  );
}

/** "8 AM" / "12 PM" / "12 AM" — hour 24 wraps to midnight ("until 12 AM"). */
function formatHour(hour: number): string {
  const h = hour % 24;
  const suffix = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${suffix}`;
}

/**
 * "Tue, Aug 12 · 8 AM–11 AM", either half alone when only one was chosen, or
 * null when the poster left timing fully flexible. The date is parsed as
 * plain local calendar parts — never through the Date-from-ISO-string
 * constructor, which would shift "2026-08-12" a day for viewers west of UTC.
 */
export function arrivalWindowLabel(job: {
  scheduled_date?: string | null;
  arrival_start_hour?: number | null;
  arrival_end_hour?: number | null;
  /** Idea 5: a hired worker running late moves the window until they arrive (lib/runningLate.ts). */
  late_minutes?: number | null;
  arrived_at?: string | null;
  status?: string | null;
}): string | null {
  const dateLabel = formatDayKey(job.scheduled_date);
  const shift = lateShiftMinutes(job);
  const windowLabel =
    job.arrival_start_hour != null && job.arrival_end_hour != null
      ? shift
        ? movedWindow(job.arrival_start_hour, job.arrival_end_hour, shift, false)
        : `${formatHour(job.arrival_start_hour)}–${formatHour(job.arrival_end_hour)}`
      : // A flexible day has no window to move, so the delay is said instead.
        shift
        ? `${shift} min late`
        : null;

  if (dateLabel && windowLabel) return `${dateLabel} · ${windowLabel}`;
  return dateLabel ?? windowLabel;
}

/**
 * 2026-09-30 (idea 5) — the hired worker says they are running 10, 20 or 30 minutes late
 * (report_running_late(), migration 20260930000700): the delay is recorded, the customer is told,
 * and the job comes back with it.
 */
export async function reportRunningLate(jobId: string, minutes: (typeof LATE_CHOICES)[number]) {
  const { data, error } = await supabase
    .rpc('report_running_late', { p_job_id: jobId, p_minutes: minutes })
    .single();
  return { data: data ? mapJobRow(data) : null, error };
}

/**
 * Real posting history for a job's poster — the customer-side trust signal a
 * browsing worker sees on the job detail screen. Counts actual rows, never a
 * cached aggregate: `posted` excludes draft rows (a draft is an unsent
 * direct-offer negotiation, not a posting), `completed` is finished work.
 */
export async function fetchClientJobStats(clientId: string) {
  const [postedRes, completedRes, cancelledRes] = await Promise.all([
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .not('status', 'eq', 'draft'),
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('status', 'completed'),
    // Phase 10's simple reliability signal: how often this poster's jobs end
    // cancelled. Counted, never estimated; rendered only when non-zero.
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('status', 'cancelled'),
  ]);

  return {
    data: {
      posted: postedRes.count ?? 0,
      completed: completedRes.count ?? 0,
      cancelled: cancelledRes.count ?? 0,
    },
    error: postedRes.error ?? completedRes.error ?? cancelledRes.error,
  };
}

/** Human-friendly bid count, e.g. "3 bids" / "1 bid" / "No bids yet". */
export function formatBidCount(count: number): string {
  if (count === 0) return 'No bids yet';
  return `${count} ${count === 1 ? 'bid' : 'bids'}`;
}

/**
 * 2026-09-20 (sitting 2) — the same count, spelled for the job card's
 * one-line facts: "No bids" / "1 bid" / "3 bids". The non-zero wording IS
 * formatBidCount's; only the empty case drops its "yet".
 */
export function formatBidCountShort(count: number): string {
  return count === 0 ? 'No bids' : formatBidCount(count);
}

/**
 * Same wording as formatBidCount, for the poster's own "Job & Bids" view —
 * "pending" makes clear these are still-open, actionable bids on a job the
 * viewer owns, distinct from the neutral wording a browsing worker sees.
 */
export function formatPendingBidCount(count: number): string {
  if (count === 0) return 'No bids yet';
  return `${count} ${count === 1 ? 'bid' : 'bids'} pending`;
}
