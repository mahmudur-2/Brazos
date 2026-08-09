-- ============================================================================
-- BRAZOS V2 · Phase 48 · rewrite v_bids_projection_drift
--
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
-- APPLY AFTER phase47. Section 1 refuses to run otherwise.
--
-- WHAT WAS WRONG
-- --------------
-- phase47's drift view expected ONE MIRROR ROW PER CHAIN. The projection keeps
-- one per (job_id, worker_id) — it must, because `bids` still carries phase1's
-- unconditional unique on that pair. So as soon as a worker opens a second
-- chain on a job (which the one-active-chain rule permits once the first has
-- settled), the older chain is deliberately unmirrored and the old view called
-- that drift. It was a false positive, and a consequential one: phase47's own
-- repair block asserts the view is empty and rolls back otherwise, so phase47
-- stopped being safely re-runnable the moment such a pair could exist.
--
-- Confirmed empirically 2026-08-08 with the shim/projection harness: the view
-- reported exactly one drifted chain — job2's declined first chain, reading
-- `missing` — while every behavioural assertion about the projection passed.
--
-- A FIRST ATTEMPT AT THE FIX WAS ALSO WRONG, and it is worth recording why.
-- The obvious repair is "only the NEWEST chain for a pair is expected to be
-- mirrored", ordered by root created_at. That does not work: two chains created
-- in one transaction carry an IDENTICAL now(), `job_offers` has no sequence, and
-- `id` is a random uuid — so the tie-break is a coin flip and the check failed
-- against correct data roughly half the time. **"Newest chain" is not
-- determinable from this schema at all.** It is the same hazard phase47's header
-- already documents for leaf selection, one level up.
--
-- THE DEFINITION THAT IS EXACT
-- ----------------------------
--   1. `stale`        — a `bids` row whose status/amount disagree with ITS OWN
--                       chain's leaf. No guessing which chain ought to own the
--                       row; check the chain that demonstrably does.
--   2. `missing_live`  — a chain whose leaf is `pending` but which has no `bids`
--                       row. A LIVE bid must be visible to old builds, and
--                       phase43's partial unique index allows at most one
--                       pending chain per pair, so this is unambiguous.
--   3. `orphan`        — a `bids` row that is not any marketplace chain's root.
--                       Reported, never repaired: the projection only touches
--                       chains that exist, so it cannot clean one up. Normally
--                       impossible (phase44 gave every bids row an offer with
--                       the same id, and both cascade from `jobs`).
--
-- A settled chain that lost its row to a later chain matches none of the three,
-- which is the whole point.
-- ============================================================================

begin;

-- 1. Preconditions -----------------------------------------------------------

do $$
begin
  if to_regprocedure('public.bids_projection_enabled()') is null then
    raise exception
      'phase47_bids_projection_trigger.sql has not been applied — run it first. This migration rewrites the view it created.';
  end if;
  if to_regprocedure('public.project_offer_chain_to_bids(uuid)') is null then
    raise exception 'public.project_offer_chain_to_bids(uuid) is missing — phase47 did not complete.';
  end if;
end $$;

-- 2. The view ----------------------------------------------------------------
--
-- A chain root is exactly a row with no parent, so the old
-- `select distinct root_offer_id` subquery is gone — `parent_offer_id is null`
-- says the same thing and reads better.

create or replace view public.v_bids_projection_drift as
with chain as (
  select
    r.id      as root_offer_id,
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
     end)::public.bid_status as live_status,
    leaf.status as live_offer_status
  from public.job_offers r
  join lateral (
    -- The chain's current revision: the row nothing else claims as its parent.
    -- Structural, not chronological — see the header.
    select l.*
    from public.job_offers l
    where l.root_offer_id = r.id
      and not exists (
        select 1 from public.job_offers c where c.parent_offer_id = l.id
      )
    limit 1
  ) leaf on true
  where r.offer_type = 'marketplace_bid'
    and r.parent_offer_id is null
)
-- 1. Correctness: the row that exists must match the chain it belongs to.
select
  c.root_offer_id,
  c.job_id,
  c.worker_id,
  c.live_amount_cents,
  c.live_status,
  b.amount_cents as mirrored_amount_cents,
  b.status       as mirrored_status,
  'stale'::text  as drift
from chain c
join public.bids b on b.id = c.root_offer_id
where b.amount_cents <> c.live_amount_cents
   or b.status <> c.live_status

union all

-- 2. Coverage: a live chain must be visible to an old build.
select
  c.root_offer_id,
  c.job_id,
  c.worker_id,
  c.live_amount_cents,
  c.live_status,
  null::integer,
  null::public.bid_status,
  'missing_live'::text
from chain c
where c.live_offer_status = 'pending'
  and not exists (select 1 from public.bids b where b.id = c.root_offer_id)

union all

-- 3. Orphan: a legacy row with no chain behind it. Reported, not repairable.
select
  b.id,
  b.job_id,
  b.worker_id,
  null::integer,
  null::public.bid_status,
  b.amount_cents,
  b.status,
  'orphan'::text
from public.bids b
where not exists (
  select 1 from public.job_offers r
  where r.id = b.id
    and r.offer_type = 'marketplace_bid'
    and r.parent_offer_id is null
);

comment on view public.v_bids_projection_drift is
  'DEPRECATED diagnostic (phase47, rewritten phase48). Genuine disagreements between `bids` and job_offers: stale (row disagrees with its own chain), missing_live (a pending chain has no row), orphan (a row with no chain, reported not repaired). Deliberately does NOT flag a settled chain whose row a later chain took over — `bids` can hold only one row per (job, worker). Retires with the compatibility shims.';

revoke all on public.v_bids_projection_drift from public, anon, authenticated;

-- 3. Reproject and verify ----------------------------------------------------
--
-- Same shape as phase47's repair, for the same reasons: reproject everything
-- unconditionally (idempotent), with bids_notify disabled so covering a chain
-- that has been live for days cannot fire a stale "new bid" push. Disabling is
-- transactional — any failure below rolls it back to enabled.
--
-- The assertion covers only the two REPAIRABLE kinds. An orphan cannot be
-- fixed by reprojection (the projection only visits chains that exist), so it
-- is reported rather than treated as a failure.

do $$
declare
  v_root uuid;
  v_chains integer;
  v_repairable integer;
  v_orphan integer;
begin
  alter table public.bids disable trigger bids_notify;

  for v_root in
    select id from public.job_offers
     where offer_type = 'marketplace_bid' and parent_offer_id is null
  loop
    perform public.project_offer_chain_to_bids(v_root);
  end loop;

  alter table public.bids enable trigger bids_notify;

  select count(*) into v_chains
    from public.job_offers
   where offer_type = 'marketplace_bid' and parent_offer_id is null;
  select count(*) into v_repairable
    from public.v_bids_projection_drift where drift in ('stale', 'missing_live');
  select count(*) into v_orphan
    from public.v_bids_projection_drift where drift = 'orphan';

  raise notice 'phase48: % marketplace chain(s) reprojected', v_chains;
  raise notice 'phase48: repairable drift remaining = % (must be 0)', v_repairable;
  raise notice 'phase48: orphan bids row(s) = % (reported, not repaired)', v_orphan;

  if v_repairable <> 0 then
    raise exception
      'phase48: % chain(s) still stale or uncovered after a full reprojection — that is a projection defect, not a view defect. Rolled back.', v_repairable;
  end if;
end $$;

-- 4. Sentinel ----------------------------------------------------------------

create or replace function public.bids_projection_v2_enabled()
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$ select true $$;

comment on function public.bids_projection_v2_enabled() is
  'Marker for scripts/verify-schema.mjs: phase48_bids_drift_view_rewrite.sql has been applied. Created last inside phase48''s transaction, so its presence proves the whole file committed, including the reprojection and its zero-drift assertion.';

revoke all on function public.bids_projection_v2_enabled() from public, anon;
grant execute on function public.bids_projection_v2_enabled() to authenticated;

notify pgrst, 'reload schema';

commit;

-- ---------------------------------------------------------------------------
-- Post-apply confirmation, in the RESULTS GRID.
--
-- Section 3's counts go to RAISE NOTICE, which the Supabase SQL Editor shows as
-- a fading toast that is easy to miss. This lands where it can be read.
-- repairable_drift must be 0. orphan_rows should be 0; if it is not, inspect
-- them by hand — they are legacy rows with no chain behind them and the
-- projection cannot clean them up.
--
-- phase47 is safely re-runnable again from here: its repair block asserts
-- against this view, which no longer reports settled-chain false positives.
-- ---------------------------------------------------------------------------

select
  (select count(*) from public.v_bids_projection_drift
    where drift in ('stale', 'missing_live'))                      as repairable_drift,
  (select count(*) from public.v_bids_projection_drift
    where drift = 'orphan')                                        as orphan_rows,
  (select count(*) from public.job_offers
    where offer_type = 'marketplace_bid' and parent_offer_id is null) as chains,
  (select count(*) from public.bids)                               as legacy_bid_rows;
