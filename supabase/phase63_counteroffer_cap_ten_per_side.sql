-- ============================================================================
-- BRAZOS · phase63 · counter-offers capped at 10 per side, per chain
--
-- STAGING deliverable — hand-apply with psql against STAGING only:
--   psql -v ON_ERROR_STOP=1 -f supabase/phase63_counteroffer_cap_ten_per_side.sql -d "$SUPABASE_DB_URL_STAGING"
-- Runs as ONE transaction. Safe to re-run (idempotent).
--
-- THE RULE
--   A maximum of 10 counter-offers per side, per negotiation chain. A chain is
--   one customer and one worker on one job. The two sides' counts are
--   independent and do NOT bleed across chains: a customer negotiating with
--   three workers on the same job has three separate chains, each with its own
--   10-and-10. The bid or direct offer that OPENS a chain is not counted —
--   only counters are.
--
-- WHAT CHANGES: the numeral, and the sentence that reports it.
--   phase50:589-590 raised at `v_used >= 3`. This raises at 10.
--   The predicate itself was already exactly the stated rule and is unchanged:
--     count(*) where root_offer_id = <chain> and author_id = <actor>
--                and parent_offer_id is not null
--   root_offer_id IS the chain identifier — `uuid not null` (phase43:103),
--   equal to id on a root, inherited unchanged by every counter, and pinned
--   across the chain by the composite FK job_offers_parent_inherits_fkey
--   (phase43:210-215) so a counter can never migrate to another job, pair or
--   chain. author_id gives the per-side split. Independence between chains and
--   between sides therefore falls out of the predicate — there is no separate
--   counter column to drift (phase46:506-508 states that choice).
--
-- CONCURRENCY — a lock, not a read-then-write
--   The count is already taken UNDER two row locks, both acquired earlier in
--   this same function and in the repo's documented order (jobs -> job_offers,
--   phase46:679-692):
--     phase50:564  perform 1 from public.jobs  where id = v_job_id for update;
--     phase50:566  select * into v_parent from public.job_offers
--                    where id = p_offer_id for update;
--   Every row that can contribute to the count shares the chain's job_id (the
--   composite FK guarantees it), so two simultaneous submissions serialize on
--   the same job row. The loser then re-reads the parent under its own lock
--   and finds it 'superseded', failing the phase50:574-576 check with "This
--   offer is no longer open" — it never reaches the cap test with a stale
--   count. A chain also has at most one pending row at a time (the partial
--   unique indexes at phase43:240-255), so there is no second live parent to
--   counter in parallel.
--
--   That ordering is load-bearing rather than incidental, so it is restated in
--   the body below: any future edit that counts before taking the job lock
--   re-introduces the race this cap depends on not having.
--
-- Nothing else in counter_offer() changes. The body is phase50:536-624
-- reproduced verbatim apart from the marked block.
-- ============================================================================

begin;

-- 1. Preconditions ------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.counter_offer(uuid, integer)') is null then
    raise exception 'phase46/phase50 have not been applied — counter_offer is missing.';
  end if;
  if to_regclass('public.job_offers') is null then
    raise exception 'phase43_job_offers_foundation.sql has not been applied.';
  end if;
end $$;

-- 2. The function -------------------------------------------------------------

create or replace function public.counter_offer(
  p_offer_id uuid,
  p_amount_cents integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_parent public.job_offers;
  v_job_id uuid;
  v_used integer;
  v_next uuid;
  v_new_id uuid;
  -- phase63: the cap, named once. Mirrored by MAX_COUNTERS_PER_SIDE in
  -- lib/offers.ts, which only drives what the UI offers — this is the
  -- enforcement.
  v_max_per_side constant integer := 10;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Enter an amount greater than zero';
  end if;

  select job_id into v_job_id from public.job_offers where id = p_offer_id;
  if v_job_id is null then
    raise exception 'Offer not found';
  end if;
  -- LOCK ORDER: jobs, THEN job_offers (phase46:679-692). This lock is what
  -- makes the cap count below atomic — every row that can contribute to it
  -- belongs to this job. Do not move the count above it.
  perform 1 from public.jobs where id = v_job_id for update;

  select * into v_parent from public.job_offers where id = p_offer_id for update;
  if not found or v_actor not in (v_parent.customer_id, v_parent.worker_id) then
    raise exception 'Offer not found';
  end if;
  -- Phase 50: countering a lapsed offer records the lapse and refuses.
  if public.expire_offer_if_stale(v_parent) then
    raise exception 'This offer has expired and can no longer be countered';
  end if;
  if v_parent.status <> 'pending' then
    raise exception 'This offer is no longer open';
  end if;
  if v_parent.awaiting_id is distinct from v_actor then
    raise exception 'It is not your turn to respond to this offer';
  end if;
  if not public.job_request_parties_ok(v_parent.customer_id, v_parent.worker_id) then
    raise exception 'This offer cannot be updated';
  end if;

  -- >>> phase63: 10 per side, per chain. Scoped to ONE chain by
  -- root_offer_id and to ONE side by author_id; the chain-opening root is
  -- excluded by parent_offer_id is not null. Read under the locks above.
  select count(*) into v_used
  from public.job_offers o
  where o.root_offer_id = v_parent.root_offer_id
    and o.author_id = v_actor
    and o.parent_offer_id is not null;
  if v_used >= v_max_per_side then
    raise exception
      'You have used all % counter-offers on this negotiation. Accept or decline to continue.',
      v_max_per_side;
  end if;
  -- <<< phase63

  update public.job_offers
     set status = 'superseded', awaiting_id = null, updated_at = now()
   where id = p_offer_id;

  v_next := case when v_actor = v_parent.customer_id
                 then v_parent.worker_id else v_parent.customer_id end;
  v_new_id := gen_random_uuid();

  -- expires_at deliberately not set here: the column default gives the
  -- counter its own fresh 7-day window.
  insert into public.job_offers (
    id, job_id, offer_type, parent_offer_id, root_offer_id,
    customer_id, worker_id, author_id, awaiting_id,
    amount_cents, status
  )
  values (
    v_new_id, v_parent.job_id, v_parent.offer_type, p_offer_id, v_parent.root_offer_id,
    v_parent.customer_id, v_parent.worker_id, v_actor, v_next,
    p_amount_cents, 'pending'
  );

  if v_parent.offer_type = 'direct_offer' then
    update public.jobs set budget_cents = p_amount_cents where id = v_parent.job_id;
  end if;

  perform public.offer_post_event(
    v_new_id, v_parent.root_offer_id, v_actor, 'countered', p_amount_cents
  );

  return v_new_id;
end;
$$;

-- 3. Regrants ------------------------------------------------------------------
--
-- Not strictly required (CREATE OR REPLACE keeps the ACL) but restated, since
-- phase32 revoked the defaults and this file should record who may call it.

revoke all on function public.counter_offer(uuid, integer) from public, anon;
grant execute on function public.counter_offer(uuid, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
