import { supabase } from './supabase';
import type { JobCategory } from './jobs';
import { coordinateLocationError } from './locationPrivacy';
import type { Message } from './messages';
import { PUBLIC_PROFILE_COLUMNS, type Profile } from './profiles';
import { moneyCeilingError } from './validation';

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
  /** When a pending offer lapses (phase50). Null = never — every pre-phase50
   *  row, deliberately, so no live negotiation was retroactively expired. */
  expires_at: string | null;
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
    budget_min_cents: number | null;
    budget_max_cents: number | null;
    scheduled_date: string | null;
    arrival_start_hour: number | null;
    arrival_end_hour: number | null;
    status: string;
    created_at: string;
    photos: string[] | null;
    videos: string[] | null;
  } | null;
};

/**
 * The job an offer is about, embedded.
 *
 * This is the OpenJob projection (lib/jobs.ts OPEN_JOB_COLUMNS) rather than a
 * shorter one, because the embedded row is what BOTH offer surfaces build
 * their card from AND what they hand to the job screen they navigate to — so
 * a narrower list here silently dropped the budget range and the arrival
 * window from a card that had the data available. Deliberately not
 * `select('*')`: jobs carries no coordinates (phase12 removed them), and an
 * explicit list keeps a future sensitive column from being pulled in by
 * accident.
 */
const OFFER_JOB_EMBED =
  'job:jobs!job_offers_job_id_fkey(id, client_id, title, description, category, location, budget_cents, budget_min_cents, budget_max_cents, scheduled_date, arrival_start_hour, arrival_end_hour, status, created_at, photos, videos)';

const OFFER_COLUMNS =
  'id, job_id, offer_type, parent_offer_id, root_offer_id, customer_id, worker_id, author_id, awaiting_id, amount_cents, message, status, expires_at, created_at, updated_at';

type PublicProfileRow = Omit<Profile, 'phone' | 'is_admin' | 'banned'>;

function oneRelated<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

/** Counters allowed per side, per negotiation chain, before only accept/decline
 *  remain. A chain is one customer and one worker on one job — the two sides
 *  count independently and nothing bleeds across chains. Mirrored by
 *  counter_offer() in phase63; the database is the real enforcement and this
 *  only decides what the UI offers. */
export const MAX_COUNTERS_PER_SIDE = 10;

/** What to say when the server refuses a counter for being over the cap.
 *  Reached when the client's own count was stale — a counter sent from another
 *  device, or a chain loaded before the last revision landed. */
export const COUNTER_LIMIT_MESSAGE =
  `You’ve used all ${MAX_COUNTERS_PER_SIDE} counter-offers on this negotiation. ` +
  'Accept or decline to continue.';

/**
 * Is this the server's cap refusal rather than some other failure?
 *
 * counter_offer() raises a plain sentence (phase63), so this matches on its
 * shape rather than a code — Postgres reports every RAISE in a PL/pgSQL
 * function as P0001, which the other refusals in that same function share.
 */
export function isCounterLimitError(error: { message?: string | null } | null): boolean {
  const message = error?.message?.toLowerCase() ?? '';
  return message.includes('counter-offers on this negotiation');
}

/** Open = still negotiable. Every other status is settled. */
export function isOpenOffer(status: OfferStatus): boolean {
  return status === 'pending';
}

/**
 * A pending row past its deadline. The row still says 'pending' until an RPC
 * touches it — there is no cron (repo rule: on-read-check only) — but every
 * decision RPC refuses it and flips it to 'expired' server-side, so treating
 * it as expired here is rendering the truth early, not inventing state.
 */
export function isOfferLapsed(
  offer: Pick<Offer, 'status' | 'expires_at'>,
  nowMs: number = Date.now()
): boolean {
  return (
    offer.status === 'pending' &&
    offer.expires_at != null &&
    Date.parse(offer.expires_at) <= nowMs
  );
}

/** The status a screen should render and act on: lapsed pending = expired. */
export function effectiveOfferStatus(
  offer: Pick<Offer, 'status' | 'expires_at'>,
  nowMs: number = Date.now()
): OfferStatus {
  return isOfferLapsed(offer, nowMs) ? 'expired' : offer.status;
}

/**
 * THE "may this viewer accept / counter / decline right now" rule.
 *
 * One question, one answer, both surfaces. Chat's thread card and the worker
 * job detail's respond card were each deciding it from their own reading of
 * the row; this is that decision written once so they cannot diverge — and
 * so a settled, superseded or lapsed revision can never be offered as live on
 * one screen while the other correctly refuses it.
 *
 * Three independent terms, all of which the RPCs re-check server-side:
 *
 *   still open   effectiveOfferStatus, so a pending row past its deadline is
 *                already treated as expired rather than inviting an action
 *                every decision RPC would refuse.
 *   their move   awaiting_id is the turn. NEVER worker_id — after a customer
 *                counter the pending row still carries the worker's id while
 *                the customer authored it (AUD-P1-01).
 *   not theirs   the author of the live revision is waiting, not deciding. In
 *                a two-party chain the turn alone implies this, but stating it
 *                makes "the sender cannot accept their own offer" true by
 *                construction rather than by inference.
 */
export function isOfferActionableBy(
  offer: Pick<Offer, 'status' | 'expires_at' | 'awaiting_id' | 'author_id'> | null | undefined,
  viewerId: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!offer || !viewerId) return false;
  return (
    isOpenOffer(effectiveOfferStatus(offer, nowMs)) &&
    offer.awaiting_id === viewerId &&
    offer.author_id !== viewerId
  );
}

/**
 * Which offer a thread message is about.
 *
 * phase46 added messages.job_offer_id; lean v1 dropped the older
 * job_request_id column, so job_offer_id is the only link.
 */
export function offerIdOf(message: Message): string | null {
  return message.job_offer_id;
}

// ---------------------------------------------------------------------------
// Writes — all RPC, all validated server-side
// ---------------------------------------------------------------------------

/** phase75 ceiling mirror (MAX_COUNTERS_PER_SIDE precedent: refuse with an
 *  explanation before the server does). Shaped with an optional `code` so it
 *  unifies with the PostgrestError branch callers already narrow on. */
function ceilingRefusal(message: string): { message: string; code?: string } {
  return { message };
}

export type NewMarketplaceOffer = {
  jobId: string;
  amountCents: number;
  message: string;
};

/** A worker bids on a public open job. create_offer() derives the worker and
 *  the customer from the authenticated user and the job. */
export async function createMarketplaceOffer(input: NewMarketplaceOffer) {
  const ceilingError = moneyCeilingError(input.amountCents);
  if (ceilingError) {
    return { data: null as string | null, error: ceilingRefusal(ceilingError) };
  }

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
  const ceilingError = moneyCeilingError(input.amountCents);
  if (ceilingError) {
    return { data: null as string | null, error: ceilingRefusal(ceilingError) };
  }

  // Same write-boundary rule as createJob/updateJob: this RPC also creates a
  // jobs row, and its location label must never be a raw GPS pair (see
  // lib/locationPrivacy.ts).
  const locationShapeError = coordinateLocationError(input.location);
  if (locationShapeError) {
    return {
      data: null as string | null,
      error: { message: locationShapeError } as { message: string; code?: string },
    };
  }

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
  const ceilingError = moneyCeilingError(amountCents);
  if (ceilingError) {
    return { data: null as string | null, error: ceilingRefusal(ceilingError) };
  }

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
 * Withdraw an offer the current user AUTHORED while the other side owes the
 * reply (§H.2 withdrawn — phase50). The recipient's counterpart is decline.
 * Frees the one-live-chain slot, so a withdrawn worker may bid again later.
 */
export async function withdrawOffer(offerId: string) {
  const { error } = await supabase.rpc('withdraw_offer', { p_offer_id: offerId });
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

/**
 * The live offer this worker has on a job, if any.
 *
 * The returned row is the chain's CURRENT pending revision, which is not
 * necessarily the viewer's: after a customer counter, worker_id is still the
 * worker but author_id is the customer and awaiting_id is the worker. Callers
 * must derive "whose terms, whose move" from author_id/awaiting_id — never
 * from worker_id alone (AUD-P1-01's root cause).
 */
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

/**
 * Every revision of one negotiation chain, oldest first — what
 * countersRemaining() counts. RLS scopes the read to chains the viewer is
 * party to; a worker receives the whole chain (customer-authored counters
 * included) because worker_id is theirs on every row of it.
 */
export async function fetchOfferChain(rootOfferId: string) {
  const { data, error } = await supabase
    .from('job_offers')
    .select(OFFER_COLUMNS)
    .eq('root_offer_id', rootOfferId)
    .order('created_at', { ascending: true });

  return { data: (data ?? []) as Offer[], error };
}

/** The worker's still-live offers, newest first. */
export async function fetchPendingOffersByWorker(workerId: string) {
  const { data, error } = await supabase
    .from('job_offers')
    .select(`${OFFER_COLUMNS}, ${OFFER_JOB_EMBED}`)
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
 * The worker's settled bids — declined or expired, newest first — for the My
 * Jobs hub's Closed tab. Deliberately ONLY those two statuses: superseded
 * rows are internal chain revisions (every counter creates one — showing them
 * would render each negotiation several times), withdrawn is the worker's own
 * deliberate exit, and an accepted bid already surfaces as the assigned job
 * itself. Same shape as fetchPendingOffersByWorker so both feed one card.
 */
export async function fetchSettledOffersByWorker(workerId: string) {
  const { data, error } = await supabase
    .from('job_offers')
    .select(`${OFFER_COLUMNS}, ${OFFER_JOB_EMBED}`)
    .eq('worker_id', workerId)
    .in('status', ['declined', 'expired'])
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
    .select(`${OFFER_COLUMNS}, ${OFFER_JOB_EMBED}`)
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

/**
 * Fold a thread-offers response into what is already on screen.
 *
 * WHY A MERGE AND NOT AN ASSIGNMENT — this is the root cause of the
 * "$X proposed" stub. A conversation runs TWO independent realtime channels:
 * `messages` (which is what adds a new counter's id to the fetch set) and
 * `job_offers` (which fires on the counter's own INSERT). Both trigger a
 * refresh, so two reads are in flight at once with DIFFERENT id sets, and
 * whichever answers last used to win outright. When the older, smaller answer
 * landed last it erased the just-arrived offer — and nothing re-triggered
 * afterwards, so the newest card stayed stuck with no job and no actions
 * while every older card rendered fully.
 *
 * Merging by id makes the outcome order-independent: the union always
 * contains the new revision. `updated_at` breaks ties so a genuinely stale
 * copy of a row can never overwrite a fresher one, and `allowedIds` prunes
 * offers the thread no longer references, so this cannot grow unbounded.
 */
export function mergeThreadOffers(
  previous: OfferWithJob[],
  incoming: OfferWithJob[],
  allowedIds: string[]
): OfferWithJob[] {
  const allowed = new Set(allowedIds);
  const byId = new Map<string, OfferWithJob>();

  for (const offer of previous) {
    if (allowed.has(offer.id)) byId.set(offer.id, offer);
  }
  for (const offer of incoming) {
    if (!allowed.has(offer.id)) continue;
    const existing = byId.get(offer.id);
    // Ties go to the incoming row: same instant, same truth, and preferring
    // the fresh read keeps an embedded job that a previous read missed.
    if (existing && existing.updated_at > offer.updated_at) continue;
    byId.set(offer.id, offer);
  }

  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
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

// The blended "value score" ordering (offerValueScore / sortOffers /
// bestValueOfferId / the "Best value" chip) was DELETED 2026-08-18, final
// operator decision: lib/compareBids.ts is the single bid-ordering source —
// factual, deterministic and stated. Do not reintroduce a blended score.
