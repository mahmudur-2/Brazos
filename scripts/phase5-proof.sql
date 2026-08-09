-- ============================================================================
-- BRAZOS V2 · Phase 5 · automated two-account proof (A–G)
--
--   psql -X -v ON_ERROR_STOP=1 -f scripts/phase5-proof.sql "$SUPABASE_DB_URL"
--
-- Runs ONE transaction against the live database with RLS engaged exactly as
-- PostgREST engages it — `set_config('role','authenticated')` plus a
-- transaction-local request.jwt.claims per identity — using three REAL,
-- active, distinct profiles. Ends in ROLLBACK, then proves zero residue.
-- This is the same mechanism as the Phase-4 proof (real identities through
-- RLS, not a service-role read); it is not a physical two-device pass and is
-- never reported as one.
--
-- Every assertion RAISES on failure (aborting the transaction, which commits
-- nothing), and prints "PASS <section>: ..." on success. Sections mirror the
-- Phase-5 brief:
--   A worker bid path · B counter path · C acceptance atomicity ·
--   D sandbox checkout · E negative states (decline/withdraw/expiry/
--   unauthorized) · F address privacy · G money honesty.
--
-- FIXTURE SURGERY, DECLARED: expiry cannot be waited out inside one
-- transaction, so exactly one probe-created offer row has its expires_at
-- rewound by the table owner (role reset, probe row only, rolled back).
-- Nothing else is touched outside the client RPCs.
-- ============================================================================

\pset pager off
\set ON_ERROR_STOP 1

begin;

-- ---------------------------------------------------------------------------
-- 0. Identities + scratch. Three real active profiles, pairwise able to
--    negotiate. The temp table is transaction-scoped and rolls back too.
-- ---------------------------------------------------------------------------
create temp table probe (k text primary key, v uuid);
grant select, insert, update on probe to authenticated;

insert into probe (k, v)
select 'c', p.id from public.profiles p
where public.is_profile_active(p.id)
order by p.created_at limit 1;

insert into probe (k, v)
select 'wa', p.id from public.profiles p
where public.is_profile_active(p.id)
  and p.id <> (select v from probe where k = 'c')
  and public.job_request_parties_ok((select v from probe where k = 'c'), p.id)
order by p.created_at limit 1;

insert into probe (k, v)
select 'wb', p.id from public.profiles p
where public.is_profile_active(p.id)
  and p.id not in (select v from probe)
  and public.job_request_parties_ok((select v from probe where k = 'c'), p.id)
order by p.created_at limit 1;

do $$
begin
  if (select count(*) from probe) <> 3 then
    raise exception 'Could not select three usable identities';
  end if;
  raise notice 'PASS 0: three real active identities selected';
end $$;

-- Identity helper. Deliberately NOT security definer: Postgres refuses
-- set_config('role', …) inside one, and none is needed — SET ROLE privilege
-- is checked against the SESSION user (the connection owner), which stays
-- allowed to assume `authenticated` no matter which role is current.
create function pg_temp.become(p_key text) returns void
language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', (select v from probe where k = p_key), 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
end $$;

-- ---------------------------------------------------------------------------
-- A. WORKER BID PATH
-- ---------------------------------------------------------------------------
select pg_temp.become('c');

insert into probe (k, v)
select 'job1', (public.create_job(
  p_title := 'PHASE5 PROOF job one',
  p_description := 'probe row, rolled back',
  p_category := 'other',
  p_location := 'Probe Area',
  p_budget_min_cents := 4000,
  p_budget_max_cents := 6000,
  p_address_line := '123 Probe Street'
)).id;

do $$
declare v_job public.jobs;
begin
  select * into v_job from public.jobs where id = (select v from probe where k='job1');
  if v_job.status <> 'open' or v_job.visibility <> 'open_market'
     or v_job.budget_cents <> 6000 then
    raise exception 'A: job not published as expected (status %, budget %)', v_job.status, v_job.budget_cents;
  end if;
  raise notice 'PASS A1: customer published an open job (range mirrored to 6000)';
end $$;

-- Worker A can open the job and bid on it.
select pg_temp.become('wa');
do $$
begin
  if not exists (select 1 from public.jobs where id = (select v from probe where k='job1')) then
    raise exception 'A: worker A cannot read the open job';
  end if;
  raise notice 'PASS A2: worker A can open the job through jobs_select_open';
end $$;

insert into probe (k, v)
select 'offerA', public.create_offer(
  p_amount_cents := 4500,
  p_job_id := (select v from probe where k='job1'),
  p_message := 'phase5 proof bid A'
);

do $$
declare v_offer public.job_offers;
begin
  select * into v_offer from public.job_offers where id = (select v from probe where k='offerA');
  if not found then
    raise exception 'A: worker A cannot see their own offer';
  end if;
  if v_offer.status <> 'pending' or v_offer.awaiting_id <> (select v from probe where k='c')
     or v_offer.expires_at is null then
    raise exception 'A: offer A not pending/awaiting customer/expiring (%, %, %)',
      v_offer.status, v_offer.awaiting_id, v_offer.expires_at;
  end if;
  raise notice 'PASS A3: bid persisted, pending, awaiting the customer, with a 7-day deadline';
end $$;

-- Worker B bids too (the sibling that must supersede atomically later).
select pg_temp.become('wb');
insert into probe (k, v)
select 'offerB', public.create_offer(
  p_amount_cents := 5200,
  p_job_id := (select v from probe where k='job1'),
  p_message := 'phase5 proof bid B'
);

-- Customer sees BOTH; counts drive the compare surface.
select pg_temp.become('c');
do $$
declare n int;
begin
  select count(*) into n from public.job_offers
  where job_id = (select v from probe where k='job1');
  if n <> 2 then
    raise exception 'A: customer sees % offers, expected 2', n;
  end if;
  if (select count(*) from public.my_pending_offers()
      where job_id = (select v from probe where k='job1')) <> 2 then
    raise exception 'A: my_pending_offers should show both bids awaiting the customer';
  end if;
  raise notice 'PASS A4: customer sees and can compare both bids';
end $$;

-- ---------------------------------------------------------------------------
-- F (first half). ADDRESS PRIVACY PRE-HIRE
-- ---------------------------------------------------------------------------
select pg_temp.become('wa');
do $$
begin
  if exists (select 1 from public.job_locations where job_id = (select v from probe where k='job1')) then
    raise exception 'F: worker A can read the address BEFORE hire';
  end if;
  raise notice 'PASS F1: exact address unreadable to bidding worker A pre-hire';
end $$;
select pg_temp.become('wb');
do $$
begin
  if exists (select 1 from public.job_locations where job_id = (select v from probe where k='job1')) then
    raise exception 'F: worker B can read the address BEFORE hire';
  end if;
  raise notice 'PASS F2: exact address unreadable to bidding worker B pre-hire';
end $$;

-- Cross-worker offer isolation (the RLS probe's cases, re-proven live).
do $$
declare leak int;
begin
  select count(*) into leak from public.job_offers
  where job_id = (select v from probe where k='job1')
    and worker_id = (select v from probe where k='wa');
  if leak <> 0 then
    raise exception 'F: worker B can read worker A''s offer';
  end if;
  raise notice 'PASS F3: worker B cannot read worker A''s competing offer';
end $$;

-- ---------------------------------------------------------------------------
-- B. COUNTER PATH — customer counters A's bid
-- ---------------------------------------------------------------------------
select pg_temp.become('c');
insert into probe (k, v)
select 'offerA2', public.counter_offer((select v from probe where k='offerA'), 4800);

do $$
declare v_parent public.job_offers; v_child public.job_offers;
begin
  select * into v_parent from public.job_offers where id = (select v from probe where k='offerA');
  select * into v_child from public.job_offers where id = (select v from probe where k='offerA2');
  if v_parent.status <> 'superseded' then
    raise exception 'B: countered parent should be superseded, is %', v_parent.status;
  end if;
  if v_child.parent_offer_id <> v_parent.id or v_child.root_offer_id <> v_parent.id then
    raise exception 'B: counter parent/root linkage broken';
  end if;
  if v_child.awaiting_id <> (select v from probe where k='wa') or v_child.amount_cents <> 4800 then
    raise exception 'B: counter should await worker A at 4800';
  end if;
  raise notice 'PASS B1: counter is a child row; parent superseded; auditable linkage intact';
end $$;

-- The superseded parent can never win afterwards.
do $$
begin
  begin
    perform public.accept_offer((select v from probe where k='offerA'));
    raise exception 'B: accepting the superseded parent should have failed';
  exception when others then
    if sqlerrm not like '%no longer open%' then raise; end if;
  end;
  raise notice 'PASS B2: stale superseded offer cannot be accepted';
end $$;

-- Worker A sees the counter awaiting them.
select pg_temp.become('wa');
do $$
begin
  if (select count(*) from public.my_pending_offers()
      where id = (select v from probe where k='offerA2')) <> 1 then
    raise exception 'B: worker A does not see the counter awaiting them';
  end if;
  raise notice 'PASS B3: worker A sees the counter and the turn is theirs';
end $$;

-- ---------------------------------------------------------------------------
-- C. ACCEPTANCE — atomic, idempotent, sibling-superseding
-- ---------------------------------------------------------------------------
do $$
declare v_job_id uuid;
begin
  v_job_id := public.accept_offer((select v from probe where k='offerA2'));
  if v_job_id <> (select v from probe where k='job1') then
    raise exception 'C: accept returned the wrong job';
  end if;
end $$;

-- Repeated accept: idempotent, no second hire.
do $$
declare v_job_id uuid;
begin
  v_job_id := public.accept_offer((select v from probe where k='offerA2'));
  if v_job_id <> (select v from probe where k='job1') then
    raise exception 'C: repeated accept misbehaved';
  end if;
  raise notice 'PASS C1: repeated accept is idempotent — no second hire';
end $$;

select pg_temp.become('c');
do $$
declare v_job public.jobs; n_accepted int; v_b public.job_offers;
begin
  select * into v_job from public.jobs where id = (select v from probe where k='job1');
  if v_job.status <> 'assigned'
     or v_job.assigned_worker_id <> (select v from probe where k='wa')
     or v_job.accepted_offer_id <> (select v from probe where k='offerA2')
     or v_job.final_amount_cents <> 4800 then
    raise exception 'C: job not stamped correctly after accept';
  end if;
  select count(*) into n_accepted from public.job_offers
  where job_id = v_job.id and status = 'accepted';
  if n_accepted <> 1 then
    raise exception 'C: % accepted offers on one job', n_accepted;
  end if;
  select * into v_b from public.job_offers where id = (select v from probe where k='offerB');
  if v_b.status <> 'superseded' then
    raise exception 'C: sibling bid B should be superseded, is %', v_b.status;
  end if;
  raise notice 'PASS C2: accept stamped the job at 4800 and superseded the sibling atomically';

  -- Accepting the already-superseded sibling cannot create a second hire.
  begin
    perform public.accept_offer((select v from probe where k='offerB'));
    raise exception 'C: accepting superseded sibling should have failed';
  exception when others then
    if sqlerrm not like '%no longer open%' then raise; end if;
  end;
  raise notice 'PASS C3: the losing sibling cannot be accepted afterwards';
end $$;

-- ---------------------------------------------------------------------------
-- F (second half). ADDRESS AFTER HIRE — hired worker yes, rival still no
-- ---------------------------------------------------------------------------
select pg_temp.become('wa');
do $$
declare v_addr text;
begin
  select address_line into v_addr from public.job_locations
  where job_id = (select v from probe where k='job1');
  if v_addr is distinct from '123 Probe Street' then
    raise exception 'F: hired worker cannot read the address after acceptance';
  end if;
  raise notice 'PASS F4: hired worker reads the exact address after acceptance';
end $$;
select pg_temp.become('wb');
do $$
begin
  if exists (select 1 from public.job_locations where job_id = (select v from probe where k='job1')) then
    raise exception 'F: unrelated worker can read the address after someone else was hired';
  end if;
  raise notice 'PASS F5: the losing worker still cannot read the address';
end $$;

-- ---------------------------------------------------------------------------
-- D. SANDBOX CHECKOUT — authorize -> held, idempotent, single row
-- ---------------------------------------------------------------------------
-- A non-owner cannot fund someone else's job.
do $$
begin
  begin
    perform public.sandbox_authorize_job_payment((select v from probe where k='job1'));
    raise exception 'D: a non-owner authorized the payment';
  exception when others then
    if sqlerrm not like '%Job not found%' then raise; end if;
  end;
  raise notice 'PASS D1: only the job owner can start checkout';
end $$;

select pg_temp.become('c');
do $$
declare p1 public.payments; p2 public.payments; h1 public.payments; h2 public.payments; n int;
begin
  p1 := public.sandbox_authorize_job_payment((select v from probe where k='job1'));
  if p1.status <> 'authorized' or p1.amount_cents <> 4800
     or p1.provider <> 'sandbox' or p1.provider_ref not like 'sandbox_%'
     or p1.authorized_at is null
     or p1.payee_id <> (select v from probe where k='wa')
     or p1.offer_id <> (select v from probe where k='offerA2') then
    raise exception 'D: authorize produced a wrong row (%, %, %)', p1.status, p1.amount_cents, p1.provider;
  end if;

  -- Retry: same row, no duplicate.
  p2 := public.sandbox_authorize_job_payment((select v from probe where k='job1'));
  if p2.id <> p1.id then
    raise exception 'D: authorize retry minted a second payment row';
  end if;

  h1 := public.sandbox_hold_job_payment((select v from probe where k='job1'));
  if h1.status <> 'held' or h1.held_at is null or h1.id <> p1.id then
    raise exception 'D: hold did not move the same row to held';
  end if;

  -- Retry: still one row, still held.
  h2 := public.sandbox_hold_job_payment((select v from probe where k='job1'));
  if h2.id <> p1.id or h2.status <> 'held' then
    raise exception 'D: hold retry misbehaved';
  end if;

  select count(*) into n from public.payments where job_id = (select v from probe where k='job1');
  if n <> 1 then
    raise exception 'D: % payment rows for one job', n;
  end if;
  raise notice 'PASS D2: authorize -> held persisted, idempotent, exactly one ledger row at 4800';
end $$;

-- The payee can read the held state; an unrelated worker cannot read it at all.
select pg_temp.become('wa');
do $$
declare v_status public.payment_status;
begin
  select status into v_status from public.payments where job_id = (select v from probe where k='job1');
  if v_status is distinct from 'held' then
    raise exception 'D: hired worker cannot see the held payment';
  end if;
  raise notice 'PASS D3: the hired worker (payee) sees funds held in protection';
end $$;
select pg_temp.become('wb');
do $$
begin
  if exists (select 1 from public.payments where job_id = (select v from probe where k='job1')) then
    raise exception 'F: unrelated worker can read the payment row';
  end if;
  raise notice 'PASS F6: unrelated worker cannot read the payment row';
end $$;

-- ---------------------------------------------------------------------------
-- G. MONEY HONESTY — nothing is released/paid, nothing real was called
-- ---------------------------------------------------------------------------
select pg_temp.become('c');
do $$
begin
  if exists (
    select 1 from public.payments
    where job_id = (select v from probe where k='job1')
      and status in ('released', 'paid_out', 'pending')
  ) then
    raise exception 'G: a payment claims a state Phase 5 cannot produce';
  end if;
  -- Phase-5 form of this assertion: "no release/payout function exists".
  -- Phases 6 and 11 deliberately shipped exactly two (§9-preauthorized
  -- sandbox_release_job_payment, phase55's sandbox_cash_out), so the durable
  -- invariant is now: the ONLY functions that can move money past held are
  -- that sanctioned pair — anything else matching the pattern is contraband.
  -- (Deliberate test change, itemised in DECISIONS.md, hardening run.)
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname ilike '%release%payment%' or p.proname ilike '%payout%' or p.proname ilike '%cash_out%')
      and p.proname not in ('sandbox_release_job_payment', 'sandbox_cash_out', 'sandbox_cash_out_enabled')
  ) then
    raise exception 'G: an UNSANCTIONED release/payout function exists';
  end if;
  raise notice 'PASS G: payment is held in Phase-5 flow; only the sanctioned phase51/55 release pair exists';
end $$;

-- ---------------------------------------------------------------------------
-- E. NEGATIVE STATES — on a second job so job1's hire stays untouched
-- ---------------------------------------------------------------------------
select pg_temp.become('c');
insert into probe (k, v)
select 'job2', (public.create_job(
  p_title := 'PHASE5 PROOF job two',
  p_description := 'probe row, rolled back',
  p_category := 'other',
  p_location := 'Probe Area',
  p_budget_cents := 5000
)).id;

-- decline works, and frees the worker to bid again.
select pg_temp.become('wa');
insert into probe (k, v)
select 'e_bid1', public.create_offer(p_amount_cents := 4000, p_job_id := (select v from probe where k='job2'), p_message := 'e1');
select pg_temp.become('c');
select public.decline_offer((select v from probe where k='e_bid1'));
do $$
begin
  if (select status from public.job_offers where id = (select v from probe where k='e_bid1')) <> 'declined' then
    raise exception 'E: decline did not settle the offer';
  end if;
  raise notice 'PASS E1: decline settles the offer';
end $$;

-- withdraw works (author retracts while the other side owes the reply).
select pg_temp.become('wa');
insert into probe (k, v)
select 'e_bid2', public.create_offer(p_amount_cents := 4100, p_job_id := (select v from probe where k='job2'), p_message := 'e2');
select public.withdraw_offer((select v from probe where k='e_bid2'));
do $$
begin
  if (select status from public.job_offers where id = (select v from probe where k='e_bid2')) <> 'withdrawn' then
    raise exception 'E: withdraw did not settle the offer';
  end if;
  raise notice 'PASS E2: the author can withdraw their pending offer';
end $$;

-- Only the author may withdraw; only a party may act at all.
insert into probe (k, v)
select 'e_bid3', public.create_offer(p_amount_cents := 4200, p_job_id := (select v from probe where k='job2'), p_message := 'e3');
select pg_temp.become('wb');
do $$
begin
  begin
    perform public.withdraw_offer((select v from probe where k='e_bid3'));
    raise exception 'E: an unrelated account withdrew someone else''s offer';
  exception when others then
    if sqlerrm not like '%Offer not found%' then raise; end if;
  end;
  begin
    perform public.decline_offer((select v from probe where k='e_bid3'));
    raise exception 'E: an unrelated account declined someone else''s offer';
  exception when others then
    if sqlerrm not like '%Offer not found%' then raise; end if;
  end;
  raise notice 'PASS E3: an unrelated account cannot mutate another user''s offer';
end $$;
-- The recipient cannot "withdraw" the sender's offer either — their exit is decline.
select pg_temp.become('c');
do $$
begin
  begin
    perform public.withdraw_offer((select v from probe where k='e_bid3'));
    raise exception 'E: the recipient withdrew the sender''s offer';
  exception when others then
    if sqlerrm not like '%Only the person who sent this offer%' then raise; end if;
  end;
  raise notice 'PASS E4: withdraw is author-only; the recipient''s exit is decline';
end $$;

-- expiry: rewind the deadline (fixture surgery, probe row only), then prove
-- the lapsed offer cannot be accepted and the worker can bid again.
select set_config('role', 'none', true);
update public.job_offers
   set expires_at = now() - interval '1 hour'
 where id = (select v from probe where k='e_bid3');

select pg_temp.become('c');
do $$
begin
  begin
    perform public.accept_offer((select v from probe where k='e_bid3'));
    raise exception 'E: an expired offer was accepted';
  exception when others then
    if sqlerrm not like '%expired%' then raise; end if;
  end;
  raise notice 'PASS E5: an expired offer cannot be accepted';
  -- A refusal cannot persist its own bookkeeping (the RAISE rolls it back —
  -- transaction semantics), so the durable expired flip comes from the
  -- non-raising touches. Decline is one: the recipient clears the stale
  -- card, and the row records expired — the truthful outcome — not declined.
  perform public.decline_offer((select v from probe where k='e_bid3'));
  if (select status from public.job_offers where id = (select v from probe where k='e_bid3')) <> 'expired' then
    raise exception 'E: a stale offer touched by decline should persist expired';
  end if;
  raise notice 'PASS E5b: a non-raising touch persists the expired state (decline records expired, not declined)';
end $$;

select pg_temp.become('wa');
insert into probe (k, v)
select 'e_bid4', public.create_offer(p_amount_cents := 4300, p_job_id := (select v from probe where k='job2'), p_message := 'e4');
do $$
begin
  if (select status from public.job_offers where id = (select v from probe where k='e_bid4')) <> 'pending' then
    raise exception 'E: re-bid after expiry did not open a fresh chain';
  end if;
  raise notice 'PASS E6: after decline/withdraw/expiry the worker can open a fresh chain';
end $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK + residue proof
-- ---------------------------------------------------------------------------
select set_config('role', 'none', true);
-- Capture the two probe job ids into psql variables before the rollback
-- erases the temp table they live in.
select (select v from probe where k='job1') as job1, (select v from probe where k='job2') as job2 \gset

rollback;

select
  (select count(*) from public.jobs where id in (:'job1', :'job2'))          as probe_jobs_left,
  (select count(*) from public.job_offers where job_id in (:'job1', :'job2')) as probe_offers_left,
  (select count(*) from public.payments where job_id in (:'job1', :'job2'))   as probe_payments_left,
  (select count(*) from public.bids where job_id in (:'job1', :'job2'))       as probe_bid_mirrors_left;

\echo PHASE5 PROOF COMPLETE — the transaction above ended in ROLLBACK; all four residue counts must read 0.
