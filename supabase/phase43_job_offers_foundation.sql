-- ============================================================================
-- BRAZOS V2 · Phase 43 · the unified offer data model (structure only)
--
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
-- Runs as ONE transaction: either every object below exists afterwards, or
-- none of them do. job_offers_enabled() is created LAST, which is what makes
-- it a trustworthy sentinel for scripts/verify-schema.mjs — its presence
-- proves the whole file committed, not just the part before an error.
--
-- WHAT THIS FILE DOES NOT DO
--   * It moves no data. `bids` is backfilled by phase44; `job_requests` by
--     phase45. Both are separate files precisely so this one can be applied
--     and verified on its own.
--   * It creates no RLS policy on job_offers, and changes no policy anywhere
--     except narrowing jobs_select_open (see section 8). RLS for job_offers
--     is Phase 3B. Until then the table has RLS enabled and zero policies —
--     which denies every authenticated read and write by default — plus the
--     same explicit DML revokes phase29 applied to jobs/bids.
--   * It rewrites no negotiation or lifecycle RPC. create_bid, accept_bid,
--     create_job_request, respond_job_request and transition_job_status are
--     untouched and keep operating on `bids` / `job_requests` exactly as they
--     do today. Nothing in the running app changes behaviour when this file
--     is applied.
--
-- WHY ONE TABLE
--   `bids` (public competition on an open job) and `job_requests` (private
--   two-party negotiation) grew apart for good reasons that no longer hold —
--   see docs/emerald-v2/ARCHITECTURE_DECISION_job_offers.md for the full
--   argument, the uniqueness design, and the one-bid-ever vs one-active-chain
--   decision this file encodes.
--
-- SHAPE, IN ONE PARAGRAPH
--   Every negotiation is a CHAIN of rows. The first row is the root
--   (parent_offer_id is null, root_offer_id = its own id). Every counter is a
--   child row pointing at the offer it answers. There is no kind='counter':
--   a counter is identified structurally, by having a parent. offer_type is
--   set once on the root and is physically incapable of changing down the
--   chain, because a composite foreign key forces every child to carry the
--   same job_id, offer_type, customer_id, worker_id and root_offer_id as its
--   parent. author_id says who wrote this particular revision; awaiting_id
--   says whose turn is next; neither is participant identity.
-- ============================================================================

begin;

-- 1. Enums -------------------------------------------------------------------
--
-- `create type` has no IF NOT EXISTS, hence the guards. Both are additive;
-- neither replaces bid_status or the job_requests status CHECK, which stay
-- exactly as they are until phase44/phase45 retire their tables.

do $$
begin
  if not exists (
    select 1 from pg_type
    where typname = 'offer_type' and typnamespace = 'public'::regnamespace
  ) then
    create type public.offer_type as enum ('marketplace_bid', 'direct_offer');
  end if;
end $$;

comment on type public.offer_type is
  'How a negotiation started. Set once on the root offer and inherited unchanged by every counter in the chain (enforced by job_offers_parent_inherits_fkey). marketplace_bid = a worker answering a public open job. direct_offer = a customer offering work to one named worker.';

do $$
begin
  if not exists (
    select 1 from pg_type
    where typname = 'offer_status' and typnamespace = 'public'::regnamespace
  ) then
    create type public.offer_status as enum (
      'pending',
      'accepted',
      'declined',
      'withdrawn',
      'expired',
      'superseded'
    );
  end if;
end $$;

comment on type public.offer_status is
  'BRAZOS_MASTER_PLAN.md §H.2, verbatim. pending -> accepted | declined | withdrawn | expired | superseded. A counter marks its parent superseded; accept_offer() (Phase 3B) marks sibling chains superseded.';

-- 2. The table ---------------------------------------------------------------

create table if not exists public.job_offers (
  id uuid primary key default gen_random_uuid(),

  -- The job under negotiation. For a marketplace_bid this is the public open
  -- job. For a direct_offer it is the draft/direct job the offer was written
  -- against (phase45 materializes one per live job_request) — which is why no
  -- title/description/category/location/photos/videos are duplicated here.
  job_id uuid not null references public.jobs(id) on delete cascade,

  offer_type public.offer_type not null,

  -- Chain structure. Root: parent null, root_offer_id = id. Counter: parent
  -- set, root_offer_id = the chain's first offer. Enforced by
  -- job_offers_root_shape below, so "is this a counter?" is answerable from
  -- the row alone and can never disagree with the chain.
  parent_offer_id uuid,
  root_offer_id uuid not null references public.job_offers(id) on delete cascade,

  -- Participant identity: stable for the whole chain, set once at creation.
  -- These are NOT "who moved last" — that is author_id — and NOT "whose turn"
  -- — that is awaiting_id. Keeping them separate is what lets a counter be a
  -- new row without the two parties ever appearing to swap places.
  customer_id uuid not null references public.profiles(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,

  -- Who wrote THIS revision. Always one of the two above.
  author_id uuid not null references public.profiles(id) on delete cascade,
  -- Whose move is next. Null once the chain is settled (nobody owes a reply).
  awaiting_id uuid references public.profiles(id) on delete cascade,

  amount_cents integer not null,
  message text,

  status public.offer_status not null default 'pending',

  -- Provenance, so phase44/phase45 are re-runnable and so a migrated row can
  -- always be traced back to the bid or job_request it came from. Null for
  -- rows created natively by Phase 3B's RPCs.
  source_table text,
  source_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint job_offers_amount_positive
    check (amount_cents > 0),

  constraint job_offers_parties_distinct
    check (customer_id <> worker_id),

  -- author and awaiting can only ever be one of the two participants.
  constraint job_offers_author_is_party
    check (author_id in (customer_id, worker_id)),
  constraint job_offers_awaiting_is_party
    check (awaiting_id is null or awaiting_id in (customer_id, worker_id)),

  -- Root iff no parent. This is the single definition of "counter" — there is
  -- deliberately no kind column to contradict.
  constraint job_offers_root_shape
    check ((parent_offer_id is null) = (root_offer_id = id)),

  -- Who may OPEN a negotiation, by type. A marketplace bid is a worker
  -- answering a public job; a direct offer is a customer approaching one
  -- worker. Counters are unconstrained here — either side may counter — which
  -- is exactly the asymmetry that made bids and job_requests look like
  -- different systems when only their opening move differs.
  constraint job_offers_root_author_matches_type
    check (
      parent_offer_id is not null
      or (offer_type = 'marketplace_bid' and author_id = worker_id)
      or (offer_type = 'direct_offer'    and author_id = customer_id)
    ),

  constraint job_offers_source_shape
    check ((source_table is null) = (source_id is null)),
  constraint job_offers_source_table_known
    check (source_table is null or source_table in ('bids', 'job_requests'))
);

comment on table public.job_offers is
  'The single negotiation table (BRAZOS_MASTER_PLAN.md §G). One row per offer REVISION; a negotiation is a chain linked by parent_offer_id and sharing a root_offer_id. Replaces bids + job_requests; both are retired in Phase 3B.';
comment on column public.job_offers.offer_type is
  'Set once on the root, inherited by every counter. Never changes within a chain.';
comment on column public.job_offers.parent_offer_id is
  'Null on a root offer; the offer this one answers otherwise. A counter is identified by HAVING a parent, not by a kind/type value.';
comment on column public.job_offers.root_offer_id is
  'The chain''s first offer. Equals id on a root. Inherited unchanged by every descendant.';
comment on column public.job_offers.customer_id is
  'Stable chain participant. Not "who moved last" (author_id) and not "whose turn" (awaiting_id).';
comment on column public.job_offers.worker_id is
  'Stable chain participant. Not "who moved last" (author_id) and not "whose turn" (awaiting_id).';
comment on column public.job_offers.awaiting_id is
  'Whose move is next; null once the chain is settled. Compare against auth.uid() before allowing any action.';
comment on column public.job_offers.source_table is
  'Provenance for the phase44/phase45 backfills: ''bids'' or ''job_requests''. Null for natively created offers.';

-- 3. Chain inheritance, enforced by the database -----------------------------
--
-- The composite unique constraint below exists ONLY as the target of the
-- composite foreign key that follows it. Together they make it impossible for
-- a counter to change its chain's job, type or participants: the child's
-- (job_id, offer_type, customer_id, worker_id, root_offer_id) must match a row
-- whose id is its parent_offer_id, and since id is unique that row is exactly
-- its parent. Inheritance therefore holds transitively for a chain of any
-- depth, with no trigger and no application code involved.
--
-- MATCH SIMPLE (the default) means the whole constraint is skipped when any
-- referencing column is null. parent_offer_id is the only nullable one, so a
-- root — and only a root — is exempt, which is precisely the intent.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'job_offers_chain_identity_key'
  ) then
    alter table public.job_offers
      add constraint job_offers_chain_identity_key
      unique (id, job_id, offer_type, customer_id, worker_id, root_offer_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'job_offers_parent_inherits_fkey'
  ) then
    alter table public.job_offers
      add constraint job_offers_parent_inherits_fkey
      foreign key (parent_offer_id, job_id, offer_type, customer_id, worker_id, root_offer_id)
      references public.job_offers (id, job_id, offer_type, customer_id, worker_id, root_offer_id)
      on delete cascade;
  end if;
end $$;

comment on constraint job_offers_parent_inherits_fkey on public.job_offers is
  'Forces every counter to carry its parent''s job, offer_type, participants and root. This is what makes "offer_type is set once and never changes" a schema guarantee rather than a convention.';

-- 4. Uniqueness — the chain-collision rule -----------------------------------
--
-- A chain has at most ONE pending row at a time (a counter supersedes its
-- parent), so "one pending row per participant pair per job" is the same
-- statement as "one live chain per participant pair per job".
--
-- PRODUCT DECISION, made explicitly — see the architecture decision doc.
-- `bids` today carries an UNCONDITIONAL unique (job_id, worker_id): one bid
-- EVER per worker per job, even after rejection. That cannot survive as-is,
-- because a counter chain needs several rows per (job, worker) by
-- construction. The question was therefore only how far to loosen it, and the
-- answer here is ONE ACTIVE CHAIN AT A TIME, not one chain ever: a worker
-- whose offer was withdrawn, expired or declined may open a new one.
-- Rationale: §H.2 introduces `withdrawn` and `expired`, and under a
-- one-chain-ever rule both would be traps that permanently bar a worker from
-- a job they are still eligible for. To restore the stricter behaviour, add
-- `and parent_offer_id is null` to the marketplace index below — that is the
-- entire change.

create unique index if not exists job_offers_one_live_bid_per_worker
  on public.job_offers (job_id, worker_id)
  where offer_type = 'marketplace_bid' and status = 'pending';

create unique index if not exists job_offers_one_live_direct_per_job
  on public.job_offers (job_id, customer_id, worker_id)
  where offer_type = 'direct_offer' and status = 'pending';

-- Carried forward from phase18's job_requests_one_open_per_pair, which caps a
-- customer at one open direct negotiation with a given worker ACROSS all jobs.
-- The per-job index above is weaker than that, so without this index applying
-- phase45 would silently repeal an existing anti-spam rule. Preserved rather
-- than re-litigated; Phase 3B may revisit it deliberately.
create unique index if not exists job_offers_one_live_direct_per_pair
  on public.job_offers (customer_id, worker_id)
  where offer_type = 'direct_offer' and status = 'pending';

-- Backfill idempotency: re-running phase44/phase45 must update, not duplicate.
create unique index if not exists job_offers_source_row_key
  on public.job_offers (source_table, source_id)
  where source_table is not null;

-- 5. Access-path indexes -----------------------------------------------------

create index if not exists job_offers_job_created_idx
  on public.job_offers (job_id, created_at desc);
create index if not exists job_offers_worker_status_idx
  on public.job_offers (worker_id, status, created_at desc);
create index if not exists job_offers_customer_status_idx
  on public.job_offers (customer_id, status, created_at desc);
-- Drives the "waiting on you" inbox badge that my_pending_job_requests()
-- serves today.
create index if not exists job_offers_awaiting_idx
  on public.job_offers (awaiting_id, status)
  where awaiting_id is not null;
create index if not exists job_offers_root_idx
  on public.job_offers (root_offer_id, created_at);
create index if not exists job_offers_parent_idx
  on public.job_offers (parent_offer_id)
  where parent_offer_id is not null;

-- 6. Lockdown ----------------------------------------------------------------
--
-- RLS on with zero policies = nothing is readable or writable by any client
-- role, which is the correct state for a table no shipped code reads yet. The
-- explicit revokes mirror what phase29 did to jobs/bids so that Phase 3B has
-- to grant deliberately rather than inherit a default.
--
-- job_offers is deliberately NOT added to the supabase_realtime publication.
-- Realtime replays raw tuples and applies row-level checks only (see phase12's
-- header for the full explanation), so a table holding both sides' private
-- negotiation amounts must not be published until Phase 3B has decided what a
-- subscriber may see.

alter table public.job_offers enable row level security;

revoke all on public.job_offers from public, anon, authenticated;

-- 7. Job columns the offer model needs ---------------------------------------
--
-- Both additive. jobs.accepted_bid_id is deliberately LEFT IN PLACE and left
-- authoritative: accept_bid() and lib/acceptBidCompatibility.ts both write it,
-- and rewriting either is Phase 3B work explicitly out of scope here. Renaming
-- it now would break the accept path between phases. See the architecture doc,
-- "Deferred to Phase 3B", for the conflict this resolves.

do $$
begin
  if not exists (
    select 1 from pg_type
    where typname = 'job_visibility' and typnamespace = 'public'::regnamespace
  ) then
    create type public.job_visibility as enum ('open_market', 'direct');
  end if;
end $$;

alter table public.jobs
  add column if not exists visibility public.job_visibility not null default 'open_market',
  add column if not exists accepted_offer_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'jobs_accepted_offer_fkey'
  ) then
    alter table public.jobs
      add constraint jobs_accepted_offer_fkey
      foreign key (accepted_offer_id) references public.job_offers(id) on delete set null;
  end if;
end $$;

comment on column public.jobs.visibility is
  'open_market = posted for anyone to bid on. direct = created for one named worker (a direct offer), never listed publicly. Discovery functions filter on this in addition to status.';
comment on column public.jobs.accepted_offer_id is
  'The job_offers row that won. Additive alongside accepted_bid_id, which stays authoritative until Phase 3B moves accept_bid() over and drops it.';

-- Existing rows: every job created by respond_job_request() on accept was a
-- private two-party arrangement, so it is `direct` by definition. Everything
-- else was posted openly. Deterministic, and derived from an existing FK
-- rather than guessed.
update public.jobs j
   set visibility = 'direct'
 where j.visibility <> 'direct'
   and exists (
     select 1 from public.job_requests r where r.created_job_id = j.id
   );

-- 8. Discovery boundary ------------------------------------------------------
--
-- All four surfaces below already exclude anything that is not status='open',
-- and phase45's draft/direct jobs will not be 'open'. The visibility predicate
-- is therefore a SECOND, independent gate on the same boundary — deliberately
-- redundant, because a private negotiation leaking into the public feed is the
-- failure phase18 was built to prevent and one filter is a single point of
-- failure.
--
-- PROOF OF NO BEHAVIOUR CHANGE ON EXISTING DATA: the only rows section 7 marks
-- `direct` are jobs created by respond_job_request(), which inserts them as
-- 'assigned' and never as 'open'. No path returns an assigned job to 'open'
-- except acceptBidWithoutRpc()'s rollback, which only ever touches a job that
-- was 'open' (i.e. open_market) to begin with. So no row that these four
-- surfaces return today is excluded by the added predicate.
--
-- The bodies below are phase12's and phase41's verbatim, with one added
-- conjunct each. Re-granted explicitly because phase32 revoked the default
-- EXECUTE on functions in this schema.

create or replace function public.job_hotspots()
returns table (
  ilat bigint,
  ilng bigint,
  cell_lat double precision,
  cell_lng double precision,
  job_count integer,
  categories jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      0.27 / 69.0 as dlat,
      0.27 / (69.0 * cos(radians(40.7128))) as dlng
  ),
  cell_cats as (
    select
      floor(loc.lat / p.dlat)::bigint as ilat,
      floor(loc.lng / p.dlng)::bigint as ilng,
      j.category::text as category,
      count(*)::int as n
    from public.jobs j
    join public.job_locations loc on loc.job_id = j.id
    cross join params p
    where j.status = 'open'
      and j.visibility = 'open_market'
    group by 1, 2, 3
  )
  select
    cc.ilat,
    cc.ilng,
    (cc.ilat + 0.5) * p.dlat as cell_lat,
    (cc.ilng + 0.5) * p.dlng as cell_lng,
    sum(cc.n)::int as job_count,
    jsonb_object_agg(cc.category, cc.n) as categories
  from cell_cats cc
  cross join params p
  group by cc.ilat, cc.ilng, p.dlat, p.dlng;
$$;

comment on function public.job_hotspots() is
  'Aggregated open-market job counts per ~0.27mi grid cell. Returns NO individual job coordinates, and never covers direct/draft jobs.';

create or replace function public.jobs_in_cell(p_ilat bigint, p_ilng bigint)
returns table (
  id uuid,
  client_id uuid,
  title text,
  description text,
  category text,
  location text,
  budget_cents integer,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      0.27 / 69.0 as dlat,
      0.27 / (69.0 * cos(radians(40.7128))) as dlng
  )
  select
    j.id, j.client_id, j.title, j.description,
    j.category::text, j.location, j.budget_cents, j.status, j.created_at
  from public.jobs j
  join public.job_locations loc on loc.job_id = j.id
  cross join params p
  where j.status = 'open'
    and j.visibility = 'open_market'
    and floor(loc.lat / p.dlat)::bigint = p_ilat
    and floor(loc.lng / p.dlng)::bigint = p_ilng
  order by j.created_at desc;
$$;

comment on function public.jobs_in_cell(bigint, bigint) is
  'Open-market jobs within one hotspot grid cell, WITHOUT lat/lng. Never covers direct/draft jobs.';

create or replace function public.jobs_within_radius(
  p_lat double precision,
  p_lng double precision,
  p_radius_miles double precision
)
returns table (
  id uuid,
  client_id uuid,
  title text,
  description text,
  category text,
  location text,
  budget_cents integer,
  status text,
  created_at timestamptz,
  photos jsonb,
  videos jsonb,
  distance_miles double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    j.id, j.client_id, j.title, j.description,
    j.category::text, j.location, j.budget_cents, j.status, j.created_at,
    j.photos, j.videos,
    d.distance_miles
  from public.jobs j
  join public.job_locations loc on loc.job_id = j.id
  cross join lateral (
    select 2 * 3958.8 * asin(sqrt(
      sin(radians((loc.lat - p_lat) / 2)) ^ 2
      + cos(radians(p_lat)) * cos(radians(loc.lat))
        * sin(radians((loc.lng - p_lng) / 2)) ^ 2
    )) as distance_miles
  ) d
  where j.status = 'open'
    and j.visibility = 'open_market'
    and d.distance_miles <= p_radius_miles
  order by d.distance_miles asc;
$$;

comment on function public.jobs_within_radius(double precision, double precision, double precision) is
  'Open-market jobs within p_radius_miles of (p_lat, p_lng), nearest first. Never returns raw stored coordinates, and never covers direct/draft jobs.';

revoke all on function public.job_hotspots() from public, anon;
grant execute on function public.job_hotspots() to authenticated;
revoke all on function public.jobs_in_cell(bigint, bigint) from public, anon;
grant execute on function public.jobs_in_cell(bigint, bigint) to authenticated;
revoke all on function public.jobs_within_radius(double precision, double precision, double precision)
  from public, anon;
grant execute on function public.jobs_within_radius(double precision, double precision, double precision)
  to authenticated;

-- The one RLS change in this file, and it strictly NARROWS: phase29's policy
-- with the same second gate. Owners keep reading their own drafts through
-- phase1's jobs_select_own, which is untouched.
--
-- NOTE FOR PHASE 3B: there is deliberately no policy here letting the TARGETED
-- worker of a direct job read it before acceptance — jobs_select_assigned_worker
-- needs assigned_worker_id, which a live direct offer has not set yet. Phase 3B
-- must add that policy when it wires the offer surfaces, or a worker will not
-- be able to see the job an offer refers to.
drop policy if exists "jobs_select_open" on public.jobs;
create policy "jobs_select_open"
  on public.jobs for select
  to authenticated
  using (
    status = 'open'
    and visibility = 'open_market'
    and public.is_profile_active(client_id)
  );

-- 9. job_private_details — satisfied by extending job_locations --------------
--
-- §G asks for a 1:1 `job_private_details` holding exact address, geo point and
-- access/entry notes, readable by the job owner always and the hired worker
-- after acceptance. job_locations (phase12) IS that table for the geo point,
-- with exactly that RLS, and BRAZOS_BUILD_STATE.md's Phase 3 entry says to
-- extend it rather than rebuild it. Creating a second private-details table
-- would leave two 1:1 privacy tables on the same job, and renaming this one
-- would break phase12/18/29/36/41 and three live RPCs that name it.
--
-- So the split is completed by adding the two missing columns here. No policy
-- change is needed: job_locations_select_party already reads
-- "client_id = auth.uid() or assigned_worker_id = auth.uid()", and phase29
-- already revoked all client INSERT/UPDATE/DELETE, so writes stay inside the
-- security-definer RPCs.

alter table public.job_locations
  add column if not exists address_line text,
  add column if not exists access_notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'job_locations_address_line_len'
  ) then
    alter table public.job_locations
      add constraint job_locations_address_line_len
      check (address_line is null or length(address_line) <= 300);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'job_locations_access_notes_len'
  ) then
    alter table public.job_locations
      add constraint job_locations_access_notes_len
      check (access_notes is null or length(access_notes) <= 1000);
  end if;
end $$;

comment on table public.job_locations is
  'The §G job_private_details table under its original phase12 name: exact geo point, exact address and access/entry notes for one job. RLS: job owner and assigned worker only. Never added to supabase_realtime.';
comment on column public.job_locations.address_line is
  'Exact street address. NEVER exposed by a discovery function — jobs.location holds the coarse, public area label.';
comment on column public.job_locations.access_notes is
  'Entry/access instructions (gate codes, "side door", parking). Same privacy class as the address.';

-- 10. messages.request_event — widened additively ----------------------------
--
-- The in-thread negotiation log gains the three §H.2 outcomes it has no word
-- for. Additive only: all five phase18 values are kept, so no historical row
-- is invalidated or rewritten. A CHECK cannot be altered in place, hence the
-- drop-and-recreate; the new list is a strict superset, so revalidation
-- against existing rows cannot fail.

alter table public.messages
  drop constraint if exists messages_request_event_valid;

alter table public.messages
  add constraint messages_request_event_valid check (
    request_event is null
    or request_event in (
      'created', 'countered', 'accepted', 'declined', 'closed',
      'withdrawn', 'expired', 'superseded'
    )
  );

comment on constraint messages_request_event_valid on public.messages is
  'Historical log of negotiation events, append-only in practice. phase18''s five values plus §H.2''s withdrawn/expired/superseded. Widen additively; never rewrite past rows.';

-- 11. Sentinel ---------------------------------------------------------------
--
-- Created last, on purpose. Most of this file (a table, enums, constraints,
-- two columns on jobs) is invisible to a PostgREST existence probe run with
-- the publishable key, and job_offers is RLS-locked so it cannot be probed
-- either. This marker is what scripts/verify-schema.mjs reads to decide
-- whether phase43 has been applied — the same technique phase19 and phase23
-- use for changes with no probeable shape. Because the whole file is one
-- transaction and this is its last object, the marker existing proves all of
-- it landed.

create or replace function public.job_offers_enabled()
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$ select true $$;

comment on function public.job_offers_enabled() is
  'Marker for scripts/verify-schema.mjs: phase43_job_offers_foundation.sql has been applied. Created last inside phase43''s transaction, so its presence proves the entire file committed.';

revoke all on function public.job_offers_enabled() from public, anon;
grant execute on function public.job_offers_enabled() to authenticated;

notify pgrst, 'reload schema';

commit;
