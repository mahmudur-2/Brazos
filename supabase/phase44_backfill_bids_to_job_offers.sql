-- ============================================================================
-- BRAZOS V2 · Phase 44 · migrate `bids` into `job_offers`
--
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
-- REQUIRES phase43 to have been applied first; section 0 refuses to run
-- otherwise rather than failing halfway with a missing-relation error.
--
-- WHAT THIS FILE DOES
--   Copies every row of `bids` into `job_offers` as a single-row chain (a root
--   with no counters — the old bid model had no counters to preserve), reusing
--   the bid's own id as the offer id, and points jobs.accepted_offer_id at the
--   migrated winner.
--
-- WHAT THIS FILE DOES NOT DO
--   * It does not drop, rename or lock `bids`. That table stays authoritative
--     and every RPC keeps writing to it until Phase 3B moves them over. The
--     two are intentionally parallel for one phase; phase44 is re-run at
--     cutover to pick up anything written in between.
--   * It does not change create_bid(), accept_bid(), or any RLS policy.
--
-- WHY REUSE THE BID'S ID AS THE OFFER'S ID
--   Three things fall out of it for free: the backfill is idempotent on a
--   natural key rather than a synthetic one; `jobs.accepted_offer_id` can be
--   set from the existing `jobs.accepted_bid_id` with a plain assignment and
--   no join; and any bid id already held elsewhere (a deep link, a
--   notification payload, a support ticket) still resolves after cutover.
--   Collision is not a concern — both tables' ids are gen_random_uuid().
--
-- STATUS MAPPING (bid_status -> offer_status), exhaustive against the live
-- enum {pending, accepted, rejected, withdrawn} as reported by
-- enum_range(null::bid_status):
--     pending   -> pending      (unchanged)
--     accepted  -> accepted     (unchanged)
--     rejected  -> declined     (§H.2 has no `rejected`; `declined` is the
--                                same event under the canonical vocabulary)
--     withdrawn -> withdrawn    (unchanged; zero live rows carry it today, and
--                                no code path sets it — mapped anyway so the
--                                migration stays total rather than assuming
--                                the count stays zero between now and the run)
--   Section 0 asserts the mapping is total against the values actually
--   present, so an enum value added after this file was written stops the
--   migration instead of silently dropping rows.
-- ============================================================================

begin;

-- 0. Preconditions -----------------------------------------------------------
--
-- Every check here is a refusal, not a repair. A migration that quietly
-- "fixes" data it does not understand is how invented marketplace data gets
-- into a database.

do $$
declare
  v_bad integer;
  v_vals text;
begin
  if to_regclass('public.job_offers') is null then
    raise exception
      'phase43_job_offers_foundation.sql has not been applied — run it first.';
  end if;

  -- Unmapped status values.
  select string_agg(distinct b.status::text, ', ')
    into v_vals
    from public.bids b
   where b.status::text not in ('pending', 'accepted', 'rejected', 'withdrawn');
  if v_vals is not null then
    raise exception
      'bids.status holds value(s) this migration has no mapping for: %. Add them to the mapping in section 1 before running.', v_vals;
  end if;

  -- A bid whose worker is the job''s own client would violate
  -- job_offers_parties_distinct. create_bid() forbids it, but the phase22/23/24
  -- seed files insert into `bids` directly, so it is asserted rather than
  -- assumed.
  select count(*) into v_bad
    from public.bids b
    join public.jobs j on j.id = b.job_id
   where j.client_id = b.worker_id;
  if v_bad > 0 then
    raise exception
      '% bid row(s) have worker_id = the job''s client_id, which job_offers forbids (job_offers_parties_distinct). Inspect and resolve them before migrating; this migration will not rewrite them.', v_bad;
  end if;

  -- Non-positive amounts would violate job_offers_amount_positive.
  select count(*) into v_bad from public.bids b where b.amount_cents <= 0;
  if v_bad > 0 then
    raise exception
      '% bid row(s) have amount_cents <= 0, which job_offers forbids. Inspect and resolve them before migrating.', v_bad;
  end if;
end $$;

-- 1. The copy ----------------------------------------------------------------
--
-- ON CONFLICT (id) DO UPDATE rather than DO NOTHING, so re-running after more
-- bidding activity refreshes migrated rows instead of leaving them stale. The
-- WHERE guard on the update keeps the run cheap and, more importantly, keeps
-- it from touching a row Phase 3B has already moved on to owning (source_table
-- is null for natively created offers, and those are never matched here
-- because their ids are not bid ids).

insert into public.job_offers (
  id,
  job_id,
  offer_type,
  parent_offer_id,
  root_offer_id,
  customer_id,
  worker_id,
  author_id,
  awaiting_id,
  amount_cents,
  message,
  status,
  source_table,
  source_id,
  created_at,
  updated_at
)
select
  b.id,
  b.job_id,
  'marketplace_bid'::public.offer_type,
  null,
  b.id,                       -- a root's root_offer_id is its own id
  j.client_id,                -- stable participant identity, from the job
  b.worker_id,
  b.worker_id,                -- a marketplace bid is authored by the worker
  case
    -- Still live: the customer owes the next move. Settled: nobody does.
    when b.status::text = 'pending' then j.client_id
    else null
  end,
  b.amount_cents,
  b.message,
  case b.status::text
    when 'pending'   then 'pending'
    when 'accepted'  then 'accepted'
    when 'rejected'  then 'declined'
    when 'withdrawn' then 'withdrawn'
  end::public.offer_status,
  'bids',
  b.id,
  b.created_at,
  b.created_at                -- `bids` has no updated_at; creation is all we know
from public.bids b
join public.jobs j on j.id = b.job_id
on conflict (id) do update
   set status       = excluded.status,
       amount_cents = excluded.amount_cents,
       message      = excluded.message,
       awaiting_id  = excluded.awaiting_id,
       updated_at   = now()
 where job_offers.source_table = 'bids';

-- 2. Point the job at its winning offer --------------------------------------
--
-- Only meaningful because section 1 reuses bid ids. accepted_bid_id stays set
-- and stays authoritative; this is the parallel column Phase 3B switches to.

update public.jobs j
   set accepted_offer_id = j.accepted_bid_id
 where j.accepted_bid_id is not null
   and j.accepted_offer_id is distinct from j.accepted_bid_id
   and exists (
     select 1 from public.job_offers o where o.id = j.accepted_bid_id
   );

-- 3. Report ------------------------------------------------------------------
--
-- Read these NOTICE lines. "Success. No rows returned." says nothing about
-- whether the counts line up.

do $$
declare
  v_bids integer;
  v_migrated integer;
  v_accepted_linked integer;
begin
  select count(*) into v_bids from public.bids;
  select count(*) into v_migrated
    from public.job_offers where source_table = 'bids';
  select count(*) into v_accepted_linked
    from public.jobs where accepted_offer_id is not null;

  raise notice 'phase44: % bid row(s) in source table', v_bids;
  raise notice 'phase44: % offer row(s) with source_table = ''bids''', v_migrated;
  raise notice 'phase44: % job(s) now carry accepted_offer_id', v_accepted_linked;

  if v_migrated <> v_bids then
    raise exception
      'phase44: migrated % of % bids — counts must match. Transaction rolled back.',
      v_migrated, v_bids;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
