import { supabase } from './supabase';
import type { JobCategory } from './jobs';
import type { Profile } from './profiles';

// Mirrors the Postgres bid status enum.
export type BidStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export type Bid = {
  id: string;
  job_id: string;
  worker_id: string;
  amount_cents: number;
  message: string | null;
  status: string;
  created_at: string;
};

export type BidWithWorker = Bid & { worker: Profile | null };

// A pending bid the worker placed, with enough of its job to build an OpenJob
// and resolve the client's name for the My Jobs hub.
export type PendingBid = Bid & {
  job: {
    id: string;
    client_id: string;
    title: string;
    description: string;
    category: JobCategory;
    location: string | null;
    budget_cents: number | null;
    status: string;
    created_at: string;
  } | null;
};

export type NewBidInput = {
  jobId: string;
  amountCents: number;
  message: string;
};

export type BidSort = 'value' | 'price' | 'rating';

export const BID_SORT_OPTIONS: { label: string; value: BidSort }[] = [
  { label: 'Best value', value: 'value' },
  { label: 'Lowest price', value: 'price' },
  { label: 'Highest rated', value: 'rating' },
];

/** Place a bid as `workerId` on a job. One bid per worker per job (DB-enforced). */
export async function createBid(workerId: string, input: NewBidInput) {
  const { data, error } = await supabase
    .from('bids')
    .insert({
      worker_id: workerId,
      job_id: input.jobId,
      amount_cents: input.amountCents,
      message: input.message,
      status: 'pending',
    })
    .select()
    .single();

  return { data: data as Bid | null, error };
}

/** The worker's existing bid on a specific job, if any. */
export async function fetchMyBidForJob(workerId: string, jobId: string) {
  const { data, error } = await supabase
    .from('bids')
    .select('*')
    .eq('worker_id', workerId)
    .eq('job_id', jobId)
    .maybeSingle();

  return { data: data as Bid | null, error };
}

/** The worker's still-pending bids (not accepted/rejected), newest first. */
export async function fetchPendingBidsByWorker(workerId: string) {
  const { data, error } = await supabase
    .from('bids')
    .select(
      '*, job:jobs!bids_job_id_fkey(id, client_id, title, description, category, location, budget_cents, status, created_at)'
    )
    .eq('worker_id', workerId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  return { data: (data ?? []) as PendingBid[], error };
}

/**
 * All bids on a job, each with the bidding worker's profile (for the client's
 * accept screen). Selects the worker profile with `(*)` so a missing later-phase
 * reputation column (e.g. completion_rate) doesn't break the query.
 */
export async function fetchBidsForJob(jobId: string) {
  const { data, error } = await supabase
    .from('bids')
    .select('*, worker:profiles!bids_worker_id_fkey(*)')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  return { data: (data ?? []) as BidWithWorker[], error };
}

/**
 * Accept a bid: assign the job to the worker and mark the bid accepted.
 * Two updates (no server-side transaction in Phase 1) — job first so the
 * assignment is the durable state if the second write fails.
 */
export async function acceptBid(params: {
  jobId: string;
  bidId: string;
  workerId: string;
  amountCents: number;
}) {
  const { error: jobError } = await supabase
    .from('jobs')
    .update({
      status: 'assigned',
      assigned_worker_id: params.workerId,
      accepted_bid_id: params.bidId,
      final_amount_cents: params.amountCents,
    })
    .eq('id', params.jobId);

  if (jobError) return { error: jobError };

  const { error: bidError } = await supabase
    .from('bids')
    .update({ status: 'accepted' })
    .eq('id', params.bidId);

  return { error: bidError };
}

// ---------------------------------------------------------------------------
// Value score — ranks bids by a blend of price, rating, and completion rate,
// so a pricier proven worker can outrank a cheaper unknown (price is weighted
// but not dominant). Returns 0..1, higher is better.
// ---------------------------------------------------------------------------

function ratingScore(worker: Profile | null): number {
  if (!worker || !worker.rating_count || worker.rating_count === 0) return 0.6; // neutral for new workers
  const avg = worker.rating_avg ?? 0;
  return Math.max(0, Math.min(avg / 5, 1));
}

function completionScore(worker: Profile | null): number {
  const rate = worker?.completion_rate;
  if (rate == null) return 0.7; // baseline when reputation data is absent
  const frac = rate <= 1 ? rate : rate / 100;
  return Math.max(0, Math.min(frac, 1));
}

export function bidValueScore(bid: BidWithWorker, minPriceCents: number): number {
  const priceScore = bid.amount_cents > 0 ? minPriceCents / bid.amount_cents : 1; // cheapest = 1
  return (
    0.4 * ratingScore(bid.worker) +
    0.34 * Math.max(0, Math.min(priceScore, 1)) +
    0.26 * completionScore(bid.worker)
  );
}

/** Return a new sorted array of bids for the given sort mode. */
export function sortBids(bids: BidWithWorker[], mode: BidSort): BidWithWorker[] {
  const minPrice = bids.reduce(
    (min, b) => (b.amount_cents > 0 && b.amount_cents < min ? b.amount_cents : min),
    Number.POSITIVE_INFINITY
  );
  const safeMin = Number.isFinite(minPrice) ? minPrice : 1;
  const arr = [...bids];

  if (mode === 'price') {
    return arr.sort((a, b) => a.amount_cents - b.amount_cents);
  }
  if (mode === 'rating') {
    return arr.sort(
      (a, b) =>
        (b.worker?.rating_avg ?? 0) - (a.worker?.rating_avg ?? 0) ||
        (b.worker?.rating_count ?? 0) - (a.worker?.rating_count ?? 0)
    );
  }
  return arr.sort((a, b) => bidValueScore(b, safeMin) - bidValueScore(a, safeMin));
}

/** Id of the highest value-score bid, for a "Best value" highlight. */
export function bestValueBidId(bids: BidWithWorker[]): string | null {
  if (bids.length === 0) return null;
  return sortBids(bids, 'value')[0].id;
}
