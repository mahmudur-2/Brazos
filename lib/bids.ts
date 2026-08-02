import { supabase } from './supabase';
import { acceptBidWithoutRpc } from './acceptBidCompatibility';
import type { JobCategory } from './jobs';
import { PUBLIC_PROFILE_COLUMNS, type Profile } from './profiles';

// Mirrors the Postgres bid status enum.
export type BidStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export type Bid = {
  id: string;
  job_id: string;
  worker_id: string;
  amount_cents: number;
  message: string | null;
  status: BidStatus;
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
    /** Same media the browse feed shows, so a pending-bid card carries the
     *  same thumbnail as the card the worker bid from. Nullable because rows
     *  predating phase13/phase34 have no value; toOpenJob() normalizes. */
    photos: string[] | null;
    videos: string[] | null;
  } | null;
};

type PublicProfileRow = Omit<Profile, 'phone' | 'is_admin' | 'banned'>;

function oneRelated<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

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

/** Place a bid; create_bid() derives the worker from the authenticated user. */
export async function createBid(_workerId: string, input: NewBidInput) {
  const { data, error } = await supabase
    .rpc('create_bid', {
      p_job_id: input.jobId,
      p_amount_cents: input.amountCents,
      p_message: input.message,
    })
    .single();

  return { data: data as Bid | null, error };
}

/** The worker's existing bid on a specific job, if any. */
export async function fetchMyBidForJob(workerId: string, jobId: string) {
  const { data, error } = await supabase
    .from('bids')
    .select('id, job_id, worker_id, amount_cents, message, status, created_at')
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
      'id, job_id, worker_id, amount_cents, message, status, created_at, job:jobs!bids_job_id_fkey(id, client_id, title, description, category, location, budget_cents, status, created_at, photos, videos)'
    )
    .eq('worker_id', workerId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as unknown as Array<
    Bid & { job: PendingBid['job'] | NonNullable<PendingBid['job']>[] }
  >;
  return {
    data: rows.map((row) => ({ ...row, job: oneRelated(row.job) })),
    error,
  };
}

/**
 * All bids on a job, each with the bidding worker's profile (for the client's
 * accept screen). The explicit projection cannot pull phone or moderation
 * fields into the embedded worker profile.
 */
export async function fetchBidsForJob(jobId: string) {
  const { data, error } = await supabase
    .from('bids')
    .select(
      `id, job_id, worker_id, amount_cents, message, status, created_at, worker:profiles!bids_worker_id_fkey(${PUBLIC_PROFILE_COLUMNS})`
    )
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as unknown as Array<
    Bid & { worker: PublicProfileRow | PublicProfileRow[] | null }
  >;
  return {
    data: rows.map((row) => {
      const worker = oneRelated(row.worker);
      return {
        ...row,
        worker: worker
          ? { ...worker, phone: null, is_admin: null, banned: null }
          : null,
      };
    }),
    error,
  };
}

/**
 * Bid count for a job, visible to any viewer — not just the poster or a
 * bidder. A direct `select count(*) from bids` would silently undercount
 * for a random browsing worker (bids SELECT RLS only grants a worker their
 * own bid or the poster all bids on their job), so this goes through
 * job_bid_count(), a count-only SECURITY DEFINER RPC (see phase15) that
 * exposes nothing beyond the number itself.
 */
export async function fetchBidCount(jobId: string) {
  const { data, error } = await supabase.rpc('job_bid_count', { p_job_id: jobId });
  return { data: typeof data === 'number' ? data : 0, error };
}

/**
 * Accept a bid atomically; the RPC locks both rows and derives worker/amount
 * from the pending bid rather than trusting client-supplied values.
 */
export async function acceptBid(params: {
  jobId: string;
  bidId: string;
}) {
  const { error } = await supabase.rpc('accept_bid', {
    p_job_id: params.jobId,
    p_bid_id: params.bidId,
  });
  if (error?.code === 'PGRST202') {
    return acceptBidWithoutRpc(params);
  }
  return { error };
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
