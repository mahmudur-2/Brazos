-- ============================================================================
-- BRAZOS V2 · Phase 7 · offer-scoped pre-hire chat
--
-- Safe to re-run (idempotent). Apply with psql; verify with
-- `node scripts/verify-schema.mjs`.
--
-- THE GAP THIS CLOSES
--   Job-thread chat (phase8/13 policies) is client + assigned worker only —
--   correct, because a job thread is one thread and pre-hire there are many
--   bidders who must never see each other's words. Direct-offer pairs already
--   get a per-pair `direct_threads` row (phase36's create_job_request calls
--   ensure_direct_thread), so THEY can talk pre-hire. Marketplace-bid pairs
--   get nothing: a customer looking at a bid cannot ask "when could you
--   start?" without accepting first.
--
--   The master plan's Phase 7 rule: a conversation exists from the moment an
--   offer first links two users — messaging is allowed once an offer/bid
--   exists between the pair, and pre-hire chat is OFFER-scoped (the per-pair
--   thread), never the job thread. Addresses are never auto-inserted
--   anywhere: job_locations RLS (owner + hired worker) is untouched, and a
--   thread contains only what the two people type into it.
--
-- MECHANISM
--   An AFTER INSERT trigger on job_offers (the phase47 pattern) calls the
--   existing ensure_direct_thread() for the offer's pair. A trigger rather
--   than editing create_offer(): every path that inserts an offer row —
--   create_offer, counter_offer, any future one — gets the guarantee, and
--   the big negotiation RPC bodies stay exactly as phase50 left them.
--
--   Deliberately NOT changed: the conversations view still lists a direct
--   thread only once it has a message. The thread existing quietly from the
--   first offer means the pair CAN talk (RLS grants it); the inbox surfaces
--   it when someone actually says something. Screens reach the silent thread
--   from the offer surfaces (BidDetail / the worker's own-bid card), so a
--   customer with ten bids does not get ten empty inbox rows.
-- ============================================================================

begin;

-- 1. The trigger ---------------------------------------------------------------

create or replace function public.ensure_thread_for_offer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- ensure_direct_thread orders the pair and upserts; parties are distinct by
  -- job_offers_parties_distinct. Any failure here must not lose the offer
  -- insert itself — the thread is a convenience the next read can rebuild.
  begin
    perform public.ensure_direct_thread(new.customer_id, new.worker_id);
  exception when others then
    raise warning 'ensure_thread_for_offer skipped for offer %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- Internal plumbing, same posture as ensure_direct_thread itself: no direct
-- EXECUTE for clients — it runs only as the trigger.
revoke all on function public.ensure_thread_for_offer() from public, anon, authenticated;

drop trigger if exists job_offers_thread_autocreate on public.job_offers;
create trigger job_offers_thread_autocreate
  after insert on public.job_offers
  for each row
  execute function public.ensure_thread_for_offer();

comment on function public.ensure_thread_for_offer() is
  'AFTER INSERT on job_offers: guarantees the pair''s direct_threads row exists from the first offer between two users (phase52 — offer-scoped pre-hire chat). Never fails the offer insert.';

-- 2. Backfill ------------------------------------------------------------------
--
-- Pairs whose offers predate this trigger get their thread now, so a live
-- negotiation that started yesterday can talk today. Bounded: one row per
-- distinct pair with a still-pending offer; ensure_direct_thread upserts.

do $$
declare
  v_pair record;
  v_count int := 0;
begin
  for v_pair in
    select distinct customer_id, worker_id
    from public.job_offers
    where status = 'pending'
  loop
    perform public.ensure_direct_thread(v_pair.customer_id, v_pair.worker_id);
    v_count := v_count + 1;
  end loop;
  raise notice 'phase52 backfill: ensured threads for % live offer pair(s)', v_count;
end $$;

-- 3. verify-schema sentinel ----------------------------------------------------

create or replace function public.offer_scoped_chat_enabled()
returns boolean
language sql
immutable
as $$
  select true;
$$;

revoke all on function public.offer_scoped_chat_enabled() from public, anon;
grant execute on function public.offer_scoped_chat_enabled() to authenticated;

notify pgrst, 'reload schema';

commit;
