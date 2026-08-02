import { supabase } from './supabase';
import type { JobCategory } from './jobs';
import type { ChatTarget } from './messages';

/** Counters allowed per side before only accept/decline remain. Mirrored by
 *  respond_job_request() in phase18 — the DB is the real enforcement. */
export const MAX_COUNTERS_PER_SIDE = 3;

export type JobRequestStatus =
  | 'pending'
  | 'countered'
  | 'accepted'
  | 'declined'
  | 'closed';

export type JobRequest = {
  id: string;
  client_id: string;
  worker_id: string;
  /** The job conversation this negotiation lives in, or null when it lives in
   *  a direct thread instead (phase36 — a first-time offer to someone you have
   *  never worked with has no shared job to hang off). */
  thread_job_id: string | null;
  direct_thread_id: string | null;
  title: string;
  description: string;
  category: JobCategory;
  location: string | null;
  photos: string[];
  videos: string[];
  amount_cents: number;
  status: JobRequestStatus;
  /** Whose turn it is. Never act without comparing this to the current user. */
  awaiting_id: string;
  client_counters: number;
  worker_counters: number;
  created_job_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Open = still negotiable. Everything else is settled. */
export function isOpenRequest(status: JobRequestStatus): boolean {
  return status === 'pending' || status === 'countered';
}

function toUrlArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function mapRow(row: any): JobRequest {
  return {
    ...row,
    photos: toUrlArray(row.photos),
    videos: toUrlArray(row.videos),
  } as JobRequest;
}

/** Every request attached to one conversation thread, for rendering its cards. */
export async function fetchThreadRequests(target: ChatTarget) {
  const { data, error } = await supabase
    .from('job_requests')
    .select('*')
    .eq(
      target.jobId ? 'thread_job_id' : 'direct_thread_id',
      target.jobId ?? target.directThreadId
    )
    .order('created_at', { ascending: true });

  return { data: (data ?? []).map(mapRow), error };
}

export type NewJobRequest = {
  workerId: string;
  title: string;
  description: string;
  category: JobCategory;
  location: string;
  amountCents: number;
  photos?: string[];
  videos?: string[];
  coords?: { lat: number; lng: number } | null;
  /** The conversation to post into. Omitted, the server falls back to the most
   *  recent completed job shared by the two, and failing that to the pair's
   *  direct thread — which it creates if they have never spoken. */
  threadJobId?: string | null;
};

/**
 * Sends a private job offer. Deliberately creates NO job — the job only exists
 * if the worker accepts (see respond_job_request), and then already assigned,
 * so an offer can never surface in the open-job feed or on the map.
 */
export async function createJobRequest(input: NewJobRequest) {
  const { data, error } = await supabase.rpc('create_job_request', {
    p_worker_id: input.workerId,
    p_title: input.title,
    p_description: input.description,
    p_category: input.category,
    p_location: input.location,
    p_amount_cents: input.amountCents,
    p_photos: input.photos ?? [],
    p_lat: input.coords?.lat ?? null,
    p_lng: input.coords?.lng ?? null,
    p_thread_job_id: input.threadJobId ?? null,
    p_videos: input.videos ?? [],
  });

  return { data: data as string | null, error };
}

export type RequestAction = 'accept' | 'decline' | 'counter';

/**
 * Accept / decline / counter. Turn order, the counter cap, blocking and job
 * creation are all enforced inside the RPC, so a stale UI can't produce an
 * invalid transition — it just gets an error back.
 */
export async function respondToJobRequest(
  requestId: string,
  action: RequestAction,
  amountCents?: number
) {
  const { data, error } = await supabase.rpc('respond_job_request', {
    p_request_id: requestId,
    p_action: action,
    p_amount_cents: amountCents ?? null,
  });

  // On accept this is the new job's id; otherwise null.
  return { data: data as string | null, error };
}

export type PendingRequest = {
  id: string;
  thread_job_id: string | null;
  direct_thread_id: string | null;
  client_id: string;
  worker_id: string;
  amount_cents: number;
  status: JobRequestStatus;
  updated_at: string;
};

/**
 * Requests waiting on the current user. Drives the inbox badge — with no push
 * notifications, the conversation list is the only place a new request or
 * counter-offer can surface.
 */
export async function fetchMyPendingRequests() {
  const { data, error } = await supabase.rpc('my_pending_job_requests');
  return { data: (data ?? []) as PendingRequest[], error };
}

/** Counters left for this user on this request. */
export function countersRemaining(request: JobRequest, userId: string): number {
  const used =
    userId === request.client_id ? request.client_counters : request.worker_counters;
  return Math.max(0, MAX_COUNTERS_PER_SIDE - used);
}
