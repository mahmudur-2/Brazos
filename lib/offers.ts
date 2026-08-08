import { supabase } from './supabase';
import type { JobCategory } from './jobs';
import type { Message } from './messages';
import { PUBLIC_PROFILE_COLUMNS, type Profile } from './profiles';

/**
 * The one negotiation module. Replaces lib/bids.ts and lib/jobRequests.ts,
 * which were two client APIs over two tables for what phase43 made one thing.
 *
 * A negotiation is a CHAIN of offer rows. The first is the root; every counter
 * is a child pointing at the offer it answers. `offer_type` is fixed for the
 * whole chain and says how it started — a worker bidding on a public job, or a
 * customer approaching one named worker. A counter is identified by HAVING a
 * parent, never by a type value.
 *
 * Every write goes through a SECURITY DEFINER RPC (phase46). There is no
 * client-side fallback path and no direct insert/update anywhere in this file:
 * job_offers grants authenticated SELECT only, so a raw write would be
 * rejected by the database rather than silently succeeding.
 */

// Mirrors the Postgres offer_type enum (phase43).
export type OfferType = 'marketplace_bid' | 'direct_offer';

// Mirrors the Postgres offer_status enum (phase43) = BRAZOS_MASTER_PLAN §H.2.
export type OfferStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'withdrawn'
  | 'expired'
  | 'superseded';

export type Offer = {
  id: string;
  job_id: string;
  offer_type: OfferType;
  /** Null on a root offer. Set to the offer this one answers on a counter. */
  parent_offer_id: string | null;
  /** The chain's first offer. Equals `id` on a root. */
  root_offer_id: string;
  /** Stable chain participants — never "who moved last". */
  customer_id: string;
  worker_id: string;
  /** Who wrote THIS revision. Alternates down the chain. */
  author_id: string;
  /** Whose move is next; null once settled. Compare to the current user
   *  before showing any action — the RPC re-checks it server-side anyway. */
  awaiting_id: string | null;
  amount_cents: number;
  message: string | null;
  status: OfferStatus;
  created_at: string;
  updated_at: string;
};

export type OfferWithWorker = Offer & { worker: Profile | null };

/** An offer with the job it is about — what a thread card needs to render the
 *  work itself, which lives on the job rather than being copied per offer. */
export type OfferWithJob = Offer & { job: PendingOffer['job'] };

/** A live offer the worker placed, with enough of its job to build a card. */
export type PendingOffer = Offer & {
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
    photos: string[] | null;
    videos: string[] | null;
  } | null;
};

const OFFER_COLUMNS =
  'id, job_id, offer_type, parent_offer_id, root_offer_id, customer_id, worker_id, author_id, awaiting_id, amount_cents, message, status, created_at, updated_at';

type PublicProfileRow = Omit<Profile, 'phone' | 'is_admin' | 'banned'>;

function oneRelated<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

/** Counters allowed per side before only accept/decline remain. Mirrored by
 *  counter_offer() in phase46 — the database is the real enforcement. */
export const MAX_COUNTERS_PER_SIDE = 3;

/** Open = still negotiable. Every other status is settled. */
export function isOpenOffer(status: OfferStatus): boolean {
  return status === 'pending';
}

/**
 * Which offer a thread message is about.
 *
 * phase46 added messages.job_offer_id; rows written before it carry only
 * job_request_id. Both are read so a conversation that predates the migration
 * still renders its negotiation cards.
 */
export function offerIdOf(message: Message): string | null {
  return message.job_offer_id ?? message.job_request_id;
}

// ---------------------------------------------------------------------------
// Writes — all RPC, all validated server-side
// ---------------------------------------------------------------------------

export type NewMarketplaceOffer = {
  jobId: string;
  amountCents: number;
  message: string;
};

/** A worker bids on a public open job. create_offer() derives the worker and
 *  the customer from the authenticated user and the job. */
export async function createMarketplaceOffer(input: NewMarketplaceOffer) {
  const { data, error } = await supabase.rpc('create_offer', {
    p_amount_cents: input.amountCents,
    p_job_id: input.jobId,
    p_message: input.message,
  });

  return { data: data as string | null, error };
}

export type NewDirectOffer = {
  workerId: string;
  title: string;
  description: string;
  category: JobCategory;
  location: string;
  amountCents: number;
  photos?: string[];
  videos?: string[];
  coords?: { lat: number; lng: number } | null;
  /** The conversation to post into. Omitted, the server falls back to the
   *  pair's most recent shared completed job, and failing that to their direct
   *  thread — which it creates if they have never spoken. */
  threadJobId?: string | null;
};

/**
 * A customer offers work to one named worker.
 *
 * The job this offer is about is created by the RPC as `draft` + `direct`, so
 * it is excluded from the open feed, the map and the radius search by two
 * independent gates (phase43). A private negotiation still cannot surface
 * publicly — that guarantee is phase18's and it is unchanged.
 */
export async function createDirectOffer(input: NewDirectOffer) {
  const { data, error } = await supabase.rpc('create_offer', {
    p_amount_cents: input.amountCents,
    p_worker_id: input.workerId,
    p_title: input.title,
    p_description: input.description,
    p_category: input.category,
    p_location: input.location,
    p_photos: input.photos ?? [],
    p_videos: input.videos ?? [],
    p_lat: input.coords?.lat ?? null,
    p_lng: input.coords?.lng ?? null,
    p_thread_job_id: input.threadJobId ?? null,
  });

  return { data: data as string | null, error };
}

/** Counter an offer. Supersedes the parent and creates the child atomically. */
export async function counterOffer(offerId: string, amountCents: number) {
  const { data, error } = await supabase.rpc('counter_offer', {
    p_offer_id: offerId,
    p_amount_cents: amountCents,
  });
  return { data: data as string | null, error };
}

export async function declineOffer(offerId: string) {
  const { error } = await supabase.rpc('decline_offer', { p_offer_id: offerId });
  return { error };
}

/**
 * Accept an offer. The RPC locks both the offer and the job, marks every
 * sibling pending offer superseded, and stamps the job — all in one
 * transaction, so two customers accepting at the same instant cannot both win.
 * Returns the assigned job's id.
 */
export async function acceptOffer(offerId: string) {
  const { data, error } = await supabase.rpc('accept_offer', {
    p_offer_id: offerId,
  });
  return { data: data as string | null, error };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Every offer on a job, each with the offering worker's public profile — the
 * customer's compare-and-accept surface.
 *
 * RLS returns all of them to the job's owner (customer_id is the job's client)
 * and only their own to a competing worker, from one policy. The explicit
 * projection cannot pull phone or moderation fields into the embedded profile.
 */
export async function fetchOffersForJob(jobId: string) {
  const { data, error } = await supabase
    .from('job_offers')
    .select(
      `${OFFER_COLUMNS}, worker:profiles!job_offers_worker_id_fkey(${PUBLIC_PROFILE_COLUMNS})`
    )
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as unknown as Array<
    Offer & { worker: PublicProfileRow | PublicProfileRow[] | null }
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

/** The live offer this worker has on a job, if any. */
export async function fetchMyOfferForJob(workerId: string, jobId: string) {
  const { data, error } = await supabase
    .from('job_offers')
    .select(OFFER_COLUMNS)
    .eq('worker_id', workerId)
    .eq('job_id', jobId)
    .eq('status', 'pending')
    .maybeSingle();

  return { data: data as Offer | null, error };
}

/** The worker's still-live offers, newest first. */
export async function fetchPendingOffersByWorker(workerId: string) {
  const { data, error } = await supabase
    .from('job_offers')
    .select(
      `${OFFER_COLUMNS}, job:jobs!job_offers_job_id_fkey(id, client_id, title, description, category, location, budget_cents, status, created_at, photos, videos)`
    )
    .eq('worker_id', workerId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as unknown as Array<
    Offer & { job: PendingOffer['job'] | NonNullable<PendingOffer['job']>[] }
  >;
  return {
    data: rows.map((row) => ({ ...row, job: oneRelated(row.job) })),
    error,
  };
}

/**
 * The offers referenced by a conversation's messages.
 *
 * Threads link to offers through `messages`, not the other way round, so the
 * caller passes the ids it found there. Fetching the whole set also hands back
 * the complete chain — every counter posts a message — which is what
 * countersRemaining() counts.
 */
export async function fetchOffersByIds(ids: string[]) {
  if (ids.length === 0) return { data: [] as OfferWithJob[], error: null };

  // The job is embedded rather than fetched separately because the thread card
  // renders the work itself — title, category, description, media — and those
  // moved from job_requests onto the job row. A worker can read a direct
  // offer's draft job through phase46's jobs_select_offer_party policy, which
  // exists for exactly this.
  const { data, error } = await supabase
    .from('job_offers')
    .select(
      `${OFFER_COLUMNS}, job:jobs!job_offers_job_id_fkey(id, client_id, title, description, category, location, budget_cents, status, created_at, photos, videos)`
    )
    .in('id', ids)
    .order('created_at', { ascending: true });

  const rows = (data ?? []) as unknown as Array<
    Offer & { job: PendingOffer['job'] | NonNullable<PendingOffer['job']>[] }
  >;
  return {
    data: rows.map((row) => ({ ...row, job: oneRelated(row.job) })) as OfferWithJob[],
    error,
  };
}

/**
 * Offer count for a job, visible to any viewer — not just the poster or an
 * offerer. A direct count would silently under-report for a browsing worker
 * (job_offers SELECT RLS grants only their own row), so this goes through
 * job_offer_count(), a count-only SECURITY DEFINER RPC that exposes nothing
 * beyond the number. Root offers only, so a countered negotiation counts once.
 */
export async function fetchOfferCount(jobId: string) {
  const { data, error } = await supabase.rpc('job_offer_count', { p_job_id: jobId });
  return { data: typeof data === 'number' ? data : 0, error };
}

/** Server caps the array too (phase46); mirrored so a long list is chunked
 *  here rather than coming back empty. */
const OFFER_COUNT_BATCH = 200;

/**
 * Offer counts for a page of jobs, in one round trip per 200 ids. Jobs with no
 * offers are absent from the RPC's result and are filled in as 0 here: a
 * missing id means zero, never "unknown".
 */
export async function fetchOfferCounts(jobIds: string[]) {
  if (jobIds.length === 0) return { data: {} as Record<string, number>, error: null };

  const counts: Record<string, number> = {};
  for (const id of jobIds) counts[id] = 0;

  for (let i = 0; i < jobIds.length; i += OFFER_COUNT_BATCH) {
    const { data, error } = await supabase.rpc('job_offer_counts', {
      p_job_ids: jobIds.slice(i, i + OFFER_COUNT_BATCH),
    });
    if (error) return { data: counts, error };
    for (const row of (data ?? []) as { job_id: string; offer_count: number }[]) {
      counts[row.job_id] = row.offer_count;
    }
  }

  return { data: counts, error: null };
}

export type PendingOfferSummary = {
  id: string;
  job_id: string;
  offer_type: OfferType;
  thread_job_id: string | null;
  direct_thread_id: string | null;
  customer_id: string;
  worker_id: string;
  amount_cents: number;
  status: OfferStatus;
  updated_at: string;
};

/**
 * Offers waiting on the current user. Drives the inbox badge — the
 * conversation list is where a new offer or counter surfaces.
 */
export async function fetchMyPendingOffers() {
  const { data, error } = await supabase.rpc('my_pending_offers');
  return { data: (data ?? []) as PendingOfferSummary[], error };
}

// ---------------------------------------------------------------------------
// Chain helpers
// ---------------------------------------------------------------------------

/**
 * Counters left for this user on this chain.
 *
 * phase18 kept two integer columns for this and phase46 does not: a counter IS
 * a chain row with a parent, so the count is derived from the rows themselves
 * and cannot drift away from the history the way a cached counter could.
 * `chain` should be every offer sharing a root — what fetchOffersByIds()
 * returns for a thread.
 */
export function countersRemaining(chain: Offer[], userId: string): number {
  const used = chain.filter(
    (offer) => offer.author_id === userId && offer.parent_offer_id !== null
  ).length;
  return Math.max(0, MAX_COUNTERS_PER_SIDE - used);
}

// ---------------------------------------------------------------------------
// Value score — ranks offers by a blend of price, rating, and completion rate,
// so a pricier proven worker can outrank a cheaper unknown (price is weighted
// but not dominant). Returns 0..1, higher is better.
// ---------------------------------------------------------------------------

export type OfferSort = 'value' | 'price' | 'rating';

export const OFFER_SORT_OPTIONS: { label: string; value: OfferSort }[] = [
  { label: 'Best value', value: 'value' },
  { label: 'Lowest price', value: 'price' },
  { label: 'Highest rated', value: 'rating' },
];

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

export function offerValueScore(offer: OfferWithWorker, minPriceCents: number): number {
  const priceScore = offer.amount_cents > 0 ? minPriceCents / offer.amount_cents : 1; // cheapest = 1
  return (
    0.4 * ratingScore(offer.worker) +
    0.34 * Math.max(0, Math.min(priceScore, 1)) +
    0.26 * completionScore(offer.worker)
  );
}

/** Return a new sorted array of offers for the given sort mode. */
export function sortOffers(offers: OfferWithWorker[], mode: OfferSort): OfferWithWorker[] {
  const minPrice = offers.reduce(
    (min, o) => (o.amount_cents > 0 && o.amount_cents < min ? o.amount_cents : min),
    Number.POSITIVE_INFINITY
  );
  const safeMin = Number.isFinite(minPrice) ? minPrice : 1;
  const arr = [...offers];

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
  return arr.sort((a, b) => offerValueScore(b, safeMin) - offerValueScore(a, safeMin));
}

/** Id of the highest value-score offer, for a "Best value" highlight. */
export function bestValueOfferId(offers: OfferWithWorker[]): string | null {
  if (offers.length === 0) return null;
  return sortOffers(offers, 'value')[0].id;
}
