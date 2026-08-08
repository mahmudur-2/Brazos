-- ============================================================================
-- BRAZOS V2 · Phase 47 · replace the bids mirror with a real projection
--
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
-- APPLY AFTER phase46. Section 1 refuses to run otherwise.
--
-- WHAT WAS WRONG
-- --------------
-- phase46 kept the frozen `bids` table current for old app builds by writing
-- to it from inside two functions: create_bid() and accept_bid(). Those are
-- only TWO of the SIX paths that mutate job_offers. A current app build calls
-- create_offer(), counter_offer(), decline_offer() and accept_offer() directly,
-- and none of them went anywhere near the shims — so in the only fleet that
-- matters, a mixed one, the mirror was stale the moment anybody updated.
--
-- The observable consequences, all of them read as authoritative by an old
-- build, which is what makes this worse than having no mirror at all:
--   * a bid placed on a NEW build produced no `bids` row, so an old-build
--     customer could not see it — they could accept the wrong bid, or conclude
--     that nobody had bid;
--   * a countered chain still showed `pending` at the ORIGINAL price;
--   * a declined offer still showed `pending`;
--   * an accepted job still showed an open bid list;
--   * accept_bid() marked `where id = p_bid_id`, but after a counter the
--     accepted offer is the COUNTER's id while the mirror row is keyed on the
--     ROOT's, so the winner was never marked accepted;
--   * and because `bids` still carries phase1's UNCONDITIONAL
--     unique (job_id, worker_id), the `on conflict do nothing` silently
--     dropped the mirror for any second chain a worker opened after their
--     first one settled — which the one-active-chain rule permits.
--
-- It also cost a notification. notify_on_bid() is an AFTER INSERT trigger on
-- `bids`, so a bid placed on a new build produced no row and therefore no
-- "new bid" push to the customer. The projection below restores that.
--
-- THE FIX
-- -------
-- A projection driven by the source of truth cannot drift, because there is no
-- way to change job_offers without it running. The two hand-written mirror
-- blocks are removed from the shims entirely (sections 4 and 5 supersede those
-- function bodies) and replaced by ONE trigger on job_offers.
--
-- phase46_offer_rpcs_and_rls.sql is NOT edited. It is applied and is now
-- historical record, the same rule phase43/44 follow. Superseding a function
-- body in a later migration is the supported way to change it.
-- ============================================================================

begin;

-- 1. Preconditions -----------------------------------------------------------

do $$
begin
  if to_regclass('public.job_offers') is null then
    raise exception 'phase43 has not been applied — run the earlier migrations first.';
  end if;
  if to_regprocedure('public.job_offer_rpcs_enabled()') is null then
    raise exception
      'phase46_offer_rpcs_and_rls.sql has not been applied — run it first. This migration supersedes two of its function bodies.';
  end if;
end $$;

-- 2. The projection ----------------------------------------------------------
--
-- Split into a plain function plus a thin trigger wrapper, so section 6's
-- repair can reproject a chain directly instead of faking an UPDATE on
-- job_offers to provoke the trigger.
--
-- SHAPE, and why each part is the way it is:
--
--   * Keyed on root_offer_id, so the legacy row's id is stable for the whole
--     negotiation. An old client that captured a bid id keeps resolving it,
--     and phase44 already made bid ids and offer ids the same values, so the
--     25 migrated rows keep their identity too.
--
--   * marketplace_bid ONLY. Direct offers never wrote to `bids` and must not
--     start: phase18's entire point was that a private two-party negotiation
--     is not public competition, and `bids` is read by surfaces that assume
--     everything in it is.
--
--   * Amount and status come from the chain's CURRENT revision, never from the
--     row that happened to fire the trigger.
--
--   * "Current" is the chain's LEAF — the row that nothing else claims as its
--     parent — and deliberately NOT the newest by created_at. counter_offer()
--     supersedes the parent and inserts the child inside one transaction, so
--     both rows carry an identical now() and a timestamp sort has no
--     deterministic answer. The link structure does. A chain is a linked list,
--     so it has exactly one leaf.
--
--   * DELETE-then-upsert, so a settled chain's row can never collide with a new
--     chain's insert on that unconditional unique index. That collision is the
--     precise root cause of the dropped rows described in the header.
--
-- RECURSION: none, and by enumeration rather than assertion. This writes
-- `bids`. The only trigger on `bids` is phase20's bids_notify, which writes
-- `notification_outbox`. Nothing is triggered on `notification_outbox`. The
-- chain job_offers -> bids -> notification_outbox terminates, and no trigger
-- anywhere writes back to job_offers.

create or replace function public.project_offer_chain_to_bids(p_root_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_root public.job_offers;
  v_leaf public.job_offers;
  v_status public.bid_status;
begin
  select * into v_root from public.job_offers where id = p_root_offer_id;
  if not found or v_root.offer_type <> 'marketplace_bid' then
    return;
  end if;

  -- The chain's current revision: the row no other row points at as a parent.
  select * into v_leaf
  from public.job_offers o
  where o.root_offer_id = p_root_offer_id
    and not exists (
      select 1 from public.job_offers c where c.parent_offer_id = o.id
    );
  if not found then
    return;
  end if;

  -- offer_status -> bid_status, exhaustive over all six values so a value
  -- added later is a plainly missing branch rather than a silent null.
  --   declined / expired -> rejected  (settled without a hire)
  --   superseded         -> rejected  (only reaches the LEAF when a DIFFERENT
  --                                    chain won the job, which in the legacy
  --                                    vocabulary is exactly "rejected". Within
  --                                    a chain, a superseded row always has a
  --                                    child and so is never the leaf.)
  v_status := (case v_leaf.status
    when 'pending'    then 'pending'
    when 'accepted'   then 'accepted'
    when 'declined'   then 'rejected'
    when 'expired'    then 'rejected'
    when 'superseded' then 'rejected'
    when 'withdrawn'  then 'withdrawn'
  end)::public.bid_status;

  -- Clear any other legacy row for this pair first — a previous settled
  -- chain's row, or a pre-unification row with a different id — so the upsert
  -- below cannot lose to phase1's unconditional unique (job_id, worker_id).
  delete from public.bids
   where job_id = v_root.job_id
     and worker_id = v_root.worker_id
     and id <> v_root.id;

  -- Identity (id, message, created_at) from the root; live terms from the leaf.
  insert into public.bids (id, job_id, worker_id, amount_cents, message, status, created_at)
  values (
    v_root.id, v_root.job_id, v_root.worker_id,
    v_leaf.amount_cents, v_root.message, v_status, v_root.created_at
  )
  on conflict (id) do update
    set amount_cents = excluded.amount_cents,
        message      = excluded.message,
        status       = excluded.status;
end;
$$;

comment on function public.project_offer_chain_to_bids(uuid) is
  'DEPRECATED compatibility projection (phase47). Rebuilds the frozen `bids` row for one marketplace_bid chain from job_offers. One-way: job_offers is the source of truth and nothing reads `bids` back. Removed with the shims once a minimum app version can be enforced.';

revoke all on function public.project_offer_chain_to_bids(uuid) from public, anon, authenticated;

create or replace function public.mirror_offer_chain_to_bids()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.offer_type = 'marketplace_bid' then
    perform public.project_offer_chain_to_bids(new.root_offer_id);
  end if;
  return null;
end;
$$;

revoke all on function public.mirror_offer_chain_to_bids() from public, anon, authenticated;

-- 3. The trigger -------------------------------------------------------------
--
-- AFTER INSERT OR UPDATE, per row. Every mutation of job_offers reprojects the
-- affected chain: a root insert, a counter's supersede-then-insert pair, a
-- decline, an accept, and accept_offer()'s sweep that supersedes every losing
-- chain on the job. There is no path left that can change an offer without the
-- legacy row following.

drop trigger if exists job_offers_mirror_bids on public.job_offers;
create trigger job_offers_mirror_bids
  after insert or update on public.job_offers
  for each row execute function public.mirror_offer_chain_to_bids();

-- 4. create_bid() — mirror block removed -------------------------------------
--
-- Identical to phase46's signature and return type. The only change is that
-- the hand-written insert into `bids` is gone: the trigger has already written
-- that row by the time create_offer() returns, so doing it here would be a
-- second writer racing the first.

create or replace function public.create_bid(
  p_job_id uuid,
  p_amount_cents integer,
  p_message text default ''
)
returns public.bids
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offer_id uuid;
  v_offer public.job_offers;
  v_bid public.bids;
begin
  v_offer_id := public.create_offer(
    p_amount_cents := p_amount_cents,
    p_job_id := p_job_id,
    p_message := p_message
  );

  select * into v_offer from public.job_offers where id = v_offer_id;

  -- Read back the row the projection wrote, rather than assembling a
  -- plausible-looking one here. If the two ever disagreed, the caller would
  -- get the lie instead of the truth.
  select * into v_bid from public.bids where id = v_offer.root_offer_id;
  if not found then
    -- Cannot happen while the trigger is installed; surfaced rather than
    -- papered over with a synthesized row.
    raise exception 'Bid projection missing for offer %', v_offer_id;
  end if;

  return v_bid;
end;
$$;

revoke all on function public.create_bid(uuid, integer, text) from public, anon;
grant execute on function public.create_bid(uuid, integer, text) to authenticated;

comment on function public.create_bid(uuid, integer, text) is
  'DEPRECATED compatibility shim (phase46, body superseded by phase47). Delegates to create_offer(); the `bids` row is written by the job_offers projection trigger, not here. Remove once a minimum app version can be enforced.';

-- 5. accept_bid() — mirror block removed -------------------------------------
--
-- phase46's version updated `bids` directly, and got it wrong after a counter:
-- it marked `where id = p_bid_id`, but the accepted offer is then the COUNTER's
-- id while the mirror row is keyed on the ROOT's. accept_offer() supersedes
-- every losing chain, so the trigger now reprojects the winner and all losers
-- correctly with no id arithmetic here at all.

create or replace function public.accept_bid(p_job_id uuid, p_bid_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.job_offers o where o.id = p_bid_id and o.job_id = p_job_id
  ) then
    raise exception 'Bid not found for this job';
  end if;

  perform public.accept_offer(p_bid_id);
end;
$$;

revoke all on function public.accept_bid(uuid, uuid) from public, anon;
grant execute on function public.accept_bid(uuid, uuid) to authenticated;

comment on function public.accept_bid(uuid, uuid) is
  'DEPRECATED compatibility shim (phase46, body superseded by phase47). Delegates to accept_offer(); `bids` statuses follow via the projection trigger. Remove once a minimum app version can be enforced.';

-- 5a. The drift audit, as a view ---------------------------------------------
--
-- One row per marketplace chain whose legacy `bids` row is missing or
-- disagrees with the chain's current state. This is both the before/after
-- measurement section 6 uses and the query to run by hand at any time:
--
--     select count(*) from public.v_bids_projection_drift;   -- must be 0
--     select * from public.v_bids_projection_drift;          -- what and why
--
-- NOT granted to any client role. It joins across every user's offers, so it
-- is a service-role/SQL-Editor diagnostic only. Supabase's default privileges
-- would otherwise hand views in `public` to anon and authenticated, hence the
-- explicit revoke.

create or replace view public.v_bids_projection_drift as
with chain as (
  select
    o.root_offer_id,
    r.job_id,
    r.worker_id,
    leaf.amount_cents as live_amount_cents,
    (case leaf.status
      when 'pending'    then 'pending'
      when 'accepted'   then 'accepted'
      when 'declined'   then 'rejected'
      when 'expired'    then 'rejected'
      when 'superseded' then 'rejected'
      when 'withdrawn'  then 'withdrawn'
    end)::public.bid_status as live_status
  from (select distinct root_offer_id from public.job_offers where offer_type = 'marketplace_bid') o
  join public.job_offers r on r.id = o.root_offer_id
  join lateral (
    select l.*
    from public.job_offers l
    where l.root_offer_id = o.root_offer_id
      and not exists (select 1 from public.job_offers c where c.parent_offer_id = l.id)
    limit 1
  ) leaf on true
)
select
  chain.root_offer_id,
  chain.job_id,
  chain.worker_id,
  chain.live_amount_cents,
  chain.live_status,
  b.amount_cents as mirrored_amount_cents,
  b.status       as mirrored_status,
  case
    when b.id is null then 'missing'
    when b.status <> chain.live_status and b.amount_cents <> chain.live_amount_cents
      then 'stale status and amount'
    when b.status <> chain.live_status then 'stale status'
    else 'stale amount'
  end as drift
from chain
left join public.bids b on b.id = chain.root_offer_id
where b.id is null
   or b.status <> chain.live_status
   or b.amount_cents <> chain.live_amount_cents;

comment on view public.v_bids_projection_drift is
  'DEPRECATED diagnostic (phase47). Marketplace chains whose frozen `bids` row disagrees with job_offers. Must always be empty once the projection trigger is installed. Retires with the compatibility shims.';

revoke all on public.v_bids_projection_drift from public, anon, authenticated;

-- 6. Repair ------------------------------------------------------------------
--
-- Reprojects EVERY marketplace chain, unconditionally. This is deliberate: it
-- repairs whatever drift phase46's two-call-site mirror left behind without
-- needing to know in advance how much there was, and it is idempotent, so
-- running it on an undrifted database is a no-op that costs one pass.
--
-- bids_notify is disabled for the duration. It is an AFTER INSERT trigger, so
-- reprojecting a chain that never got a legacy row — exactly the drift case —
-- would otherwise enqueue a "new bid" push for a bid that was placed hours or
-- days ago. Disabling is transactional: a failure anywhere in this file rolls
-- the trigger back to enabled along with everything else.
--
-- Read the NOTICE lines. The before/after counts are the drift audit.

do $$
declare
  v_before integer;
  v_after integer;
  v_chains integer;
  v_root uuid;
begin
  select count(*) into v_before from public.v_bids_projection_drift;
  select count(distinct root_offer_id) into v_chains
    from public.job_offers where offer_type = 'marketplace_bid';

  alter table public.bids disable trigger bids_notify;

  for v_root in
    select distinct root_offer_id
    from public.job_offers
    where offer_type = 'marketplace_bid'
  loop
    perform public.project_offer_chain_to_bids(v_root);
  end loop;

  alter table public.bids enable trigger bids_notify;

  select count(*) into v_after from public.v_bids_projection_drift;

  raise notice 'phase47: % marketplace chain(s) reprojected', v_chains;
  raise notice 'phase47: drifted rows BEFORE = %, AFTER = %', v_before, v_after;

  if v_after <> 0 then
    raise exception
      'phase47: % chain(s) still drifted after reprojection — the projection is wrong, not the data. Rolled back.', v_after;
  end if;
end $$;

-- 7. Sentinel ----------------------------------------------------------------

create or replace function public.bids_projection_enabled()
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$ select true $$;

comment on function public.bids_projection_enabled() is
  'Marker for scripts/verify-schema.mjs: phase47_bids_projection_trigger.sql has been applied. Created last inside phase47''s transaction, so its presence proves the entire file committed.';

revoke all on function public.bids_projection_enabled() from public, anon;
grant execute on function public.bids_projection_enabled() to authenticated;

notify pgrst, 'reload schema';

commit;
