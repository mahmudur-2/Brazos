-- ============================================================================
-- BRAZOS V2 · Phase 6 · automated two-account proof (A–H)
--
--   psql -X -v ON_ERROR_STOP=1 -f scripts/phase6-proof.sql "$SUPABASE_DB_URL_STAGING"
--
-- The phase5-proof mechanism, extended over the active-work lifecycle: ONE
-- transaction with RLS engaged exactly as PostgREST engages it
-- (set_config('role','authenticated') + transaction-local request.jwt.claims
-- per identity), three REAL identities (the scripts/seed-phase-6.sql
-- accounts), every assertion RAISES on failure, and a final ROLLBACK with a
-- zero-residue check. This is not a physical two-device pass and is never
-- reported as one.
--
-- Sections:
--   A fixture via the real RPCs (post → bid → accept → authorize → hold)
--   B arrival authorization + monotonicity  · C checklist RLS boundary
--   D transition stamps completed_at        · E dispute freeze end-to-end
--   F release path (authorization, idempotency)
--   G tip (release-first, caps, one per job)
--   H auto-release 72h on-read (fixture surgery on completed_at, declared)
-- ============================================================================

\pset pager off
\set ON_ERROR_STOP 1

begin;

-- ---------------------------------------------------------------------------
-- 0. Identities: the three seeded phase-6 accounts.
-- ---------------------------------------------------------------------------
create temp table probe (k text primary key, v uuid);
grant select, insert, update on probe to authenticated;

insert into probe (k, v) values
  ('c',  'b6c00000-0000-4000-8000-000000000001'),
  ('wa', 'b6c00000-0000-4000-8000-000000000002'),
  ('wb', 'b6c00000-0000-4000-8000-000000000003');

do $$
begin
  if (select count(*) from public.profiles
      where id in (select v from probe) and not coalesce(banned, false)) <> 3 then
    raise exception '0: run scripts/seed-phase-6.sql first — the three phase-6 identities are missing';
  end if;
  raise notice 'PASS 0: three seeded active identities present';
end $$;

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
-- A. FIXTURES THROUGH THE REAL RPCS — two jobs carried to assigned + held.
-- ---------------------------------------------------------------------------
select pg_temp.become('c');
insert into probe (k, v)
select 'job1', (public.create_job(
  p_title := 'PHASE6 PROOF lifecycle job',
  p_description := 'probe row, rolled back',
  p_category := 'other',
  p_location := 'Probe Area',
  p_budget_min_cents := 4000,
  p_budget_max_cents := 6000,
  p_address_line := '123 Probe Street'
)).id;
insert into probe (k, v)
select 'job2', (public.create_job(
  p_title := 'PHASE6 PROOF auto-release job',
  p_description := 'probe row, rolled back',
  p_category := 'other',
  p_location := 'Probe Area',
  p_budget_min_cents := 3000,
  p_budget_max_cents := 3000,
  p_address_line := '125 Probe Street'
)).id;

select pg_temp.become('wa');
insert into probe (k, v)
select 'offer1', public.create_offer(
  p_amount_cents := 5000,
  p_job_id := (select v from probe where k='job1'),
  p_message := 'phase6 proof bid'
);
insert into probe (k, v)
select 'offer2', public.create_offer(
  p_amount_cents := 3000,
  p_job_id := (select v from probe where k='job2'),
  p_message := 'phase6 proof bid two'
);

select pg_temp.become('c');
select public.accept_offer((select v from probe where k='offer1'));
select public.accept_offer((select v from probe where k='offer2'));
select public.sandbox_authorize_job_payment((select v from probe where k='job1'));
select public.sandbox_hold_job_payment((select v from probe where k='job1'));
select public.sandbox_authorize_job_payment((select v from probe where k='job2'));
select public.sandbox_hold_job_payment((select v from probe where k='job2'));

do $$
declare v_held int;
begin
  select count(*) into v_held from public.payments
  where job_id in (select v from probe where k in ('job1','job2'))
    and kind = 'job_payment' and status = 'held';
  if v_held <> 2 then
    raise exception 'A: expected 2 held payments, found %', v_held;
  end if;
  raise notice 'PASS A: two jobs assigned to worker A with payments held';
end $$;

-- ---------------------------------------------------------------------------
-- B. ARRIVAL — authorization + monotonicity.
-- ---------------------------------------------------------------------------
select pg_temp.become('c');
do $$
begin
  begin
    perform public.mark_worker_arrival((select v from probe where k='job1'), 'en_route');
    raise exception 'B: the CUSTOMER was allowed to mark arrival';
  exception when others then
    if sqlerrm like '%was allowed%' then raise; end if;
    raise notice 'PASS B1: customer cannot mark arrival (%)', sqlerrm;
  end;
end $$;

select pg_temp.become('wb');
do $$
begin
  begin
    perform public.mark_worker_arrival((select v from probe where k='job1'), 'en_route');
    raise exception 'B: an UNASSIGNED worker was allowed to mark arrival';
  exception when others then
    if sqlerrm like '%was allowed%' then raise; end if;
    raise notice 'PASS B2: unassigned worker cannot mark arrival (%)', sqlerrm;
  end;
end $$;

select pg_temp.become('wa');
do $$
declare v_first timestamptz; v_job public.jobs;
begin
  begin
    perform public.mark_worker_arrival((select v from probe where k='job1'), 'teleported');
    raise exception 'B: an unknown step was accepted';
  exception when others then
    if sqlerrm like '%was accepted%' then raise; end if;
    raise notice 'PASS B3: unknown arrival step refused (%)', sqlerrm;
  end;

  v_job := public.mark_worker_arrival((select v from probe where k='job1'), 'en_route');
  if v_job.en_route_at is null or v_job.arrived_at is not null then
    raise exception 'B: en_route did not set exactly en_route_at';
  end if;
  v_first := v_job.en_route_at;

  v_job := public.mark_worker_arrival((select v from probe where k='job1'), 'en_route');
  if v_job.en_route_at <> v_first then
    raise exception 'B: repeating en_route moved the timestamp';
  end if;

  v_job := public.mark_worker_arrival((select v from probe where k='job1'), 'arrived');
  if v_job.arrived_at is null or v_job.en_route_at <> v_first then
    raise exception 'B: arrived did not set arrived_at / disturbed en_route_at';
  end if;
  raise notice 'PASS B4: en_route then arrived, monotonic and idempotent';
end $$;

-- ---------------------------------------------------------------------------
-- C. CHECKLIST — the RLS boundary, both directions.
-- ---------------------------------------------------------------------------
select pg_temp.become('wa');
insert into public.job_checklist_items (job_id, position, label)
values ((select v from probe where k='job1'), 0, 'PHASE6 PROOF step one'),
       ((select v from probe where k='job1'), 1, 'PHASE6 PROOF step two');
update public.job_checklist_items
   set done = true, done_at = now()
 where job_id = (select v from probe where k='job1') and position = 0;

do $$
begin
  if (select count(*) from public.job_checklist_items
      where job_id = (select v from probe where k='job1')) <> 2 then
    raise exception 'C: worker cannot manage their own checklist';
  end if;
  raise notice 'PASS C1: assigned worker writes and toggles the checklist';
end $$;

select pg_temp.become('c');
do $$
begin
  if (select count(*) from public.job_checklist_items
      where job_id = (select v from probe where k='job1')) <> 2 then
    raise exception 'C: the customer cannot read the checklist';
  end if;
  begin
    insert into public.job_checklist_items (job_id, position, label)
    values ((select v from probe where k='job1'), 9, 'PHASE6 PROOF customer intrusion');
    raise exception 'C: the CUSTOMER was allowed to write the checklist';
  exception when others then
    if sqlerrm like '%was allowed%' then raise; end if;
    raise notice 'PASS C2: customer reads but cannot write (%)', sqlerrm;
  end;
end $$;

select pg_temp.become('wb');
do $$
begin
  if (select count(*) from public.job_checklist_items
      where job_id = (select v from probe where k='job1')) <> 0 then
    raise exception 'C: an outsider can read another pair''s checklist';
  end if;
  raise notice 'PASS C3: outsider sees zero checklist rows';
end $$;

-- ---------------------------------------------------------------------------
-- D. TRANSITIONS — release refused early; completed_at stamped; arrival
--    window closes once started.
-- ---------------------------------------------------------------------------
select pg_temp.become('c');
do $$
begin
  begin
    perform public.sandbox_release_job_payment((select v from probe where k='job1'));
    raise exception 'D: release was allowed before completion';
  exception when others then
    if sqlerrm like '%was allowed%' then raise; end if;
    raise notice 'PASS D1: release refused while the job is only assigned (%)', sqlerrm;
  end;
end $$;

select pg_temp.become('wa');
select public.transition_job_status((select v from probe where k='job1'), 'in_progress');
do $$
begin
  begin
    perform public.mark_worker_arrival((select v from probe where k='job1'), 'arrived');
    raise exception 'D: arrival was accepted after the job started';
  exception when others then
    if sqlerrm like '%was accepted%' then raise; end if;
    raise notice 'PASS D2: arrival closes once work starts (%)', sqlerrm;
  end;
end $$;

select public.transition_job_status(
  (select v from probe where k='job1'), 'completed',
  '["https://example.com/phase6-proof-done.jpg"]'::jsonb
);
do $$
declare v_job public.jobs;
begin
  select * into v_job from public.jobs where id = (select v from probe where k='job1');
  if v_job.status <> 'completed' or v_job.completed_at is null then
    raise exception 'D: completion did not stamp completed_at';
  end if;
  raise notice 'PASS D3: completed with evidence; completed_at stamped';
end $$;

do $$
begin
  begin
    insert into public.job_checklist_items (job_id, position, label)
    values ((select v from probe where k='job1'), 5, 'PHASE6 PROOF after the fact');
    raise exception 'D: checklist stayed writable after completion';
  exception when others then
    if sqlerrm like '%stayed writable%' then raise; end if;
    raise notice 'PASS D4: checklist closes at completion (%)', sqlerrm;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- E. DISPUTE — freezes release (manual AND the auto clock), opener-only
--    withdraw, one open per job.
-- ---------------------------------------------------------------------------
select pg_temp.become('wa');
do $$
begin
  begin
    perform public.open_job_dispute((select v from probe where k='job1'), 'incomplete', null);
    raise exception 'E: the WORKER was allowed to open a customer dispute';
  exception when others then
    if sqlerrm like '%was allowed%' then raise; end if;
    raise notice 'PASS E1: worker cannot open the customer''s issue report (%)', sqlerrm;
  end;
end $$;

select pg_temp.become('c');
insert into probe (k, v)
select 'dispute1', (public.open_job_dispute(
  (select v from probe where k='job1'), 'incomplete', 'PHASE6 PROOF: second shelf missing'
)).id;

do $$
declare v_again public.job_disputes;
begin
  v_again := public.open_job_dispute((select v from probe where k='job1'), 'other', null);
  if v_again.id <> (select v from probe where k='dispute1') then
    raise exception 'E: a second open dispute was created for the same job';
  end if;
  begin
    perform public.sandbox_release_job_payment((select v from probe where k='job1'));
    raise exception 'E: release went through with an open dispute';
  exception when others then
    if sqlerrm like '%went through%' then raise; end if;
    raise notice 'PASS E2: one open report per job; manual release frozen (%)', sqlerrm;
  end;
end $$;

-- The auto clock must respect the freeze too: rewind the completion stamp as
-- the table owner (fixture surgery, declared, rolled back) and read.
reset role;
update public.jobs set completed_at = now() - interval '73 hours'
 where id = (select v from probe where k='job1');

select pg_temp.become('wa');
do $$
declare v_payment public.payments;
begin
  v_payment := public.job_payment_state((select v from probe where k='job1'));
  if v_payment.status <> 'held' then
    raise exception 'E: auto-release ignored the open dispute (status %)', v_payment.status;
  end if;
  raise notice 'PASS E3: 72h auto-release stays frozen while the report is open';
end $$;

select pg_temp.become('wb');
do $$
begin
  begin
    perform public.withdraw_job_dispute((select v from probe where k='dispute1'));
    raise exception 'E: a stranger was allowed to withdraw the report';
  exception when others then
    if sqlerrm like '%was allowed%' then raise; end if;
    raise notice 'PASS E4: only the opener can withdraw (%)', sqlerrm;
  end;
end $$;

select pg_temp.become('c');
do $$
declare v_dispute public.job_disputes;
begin
  v_dispute := public.withdraw_job_dispute((select v from probe where k='dispute1'));
  if v_dispute.status <> 'withdrawn' or v_dispute.resolved_at is null then
    raise exception 'E: withdraw did not close the report';
  end if;
  v_dispute := public.withdraw_job_dispute((select v from probe where k='dispute1'));
  if v_dispute.status <> 'withdrawn' then
    raise exception 'E: repeated withdraw was not idempotent';
  end if;
  raise notice 'PASS E5: opener withdrew; repeat is a no-op';
end $$;

-- ---------------------------------------------------------------------------
-- F. RELEASE — payer-only, idempotent, honestly recorded.
-- ---------------------------------------------------------------------------
select pg_temp.become('wa');
do $$
begin
  begin
    perform public.sandbox_release_job_payment((select v from probe where k='job1'));
    raise exception 'F: the WORKER was allowed to release their own payment';
  exception when others then
    if sqlerrm like '%was allowed%' then raise; end if;
    raise notice 'PASS F1: the payee cannot release to themselves (%)', sqlerrm;
  end;
end $$;

select pg_temp.become('c');
do $$
declare v_payment public.payments; v_released_at timestamptz;
begin
  v_payment := public.sandbox_release_job_payment((select v from probe where k='job1'));
  if v_payment.status <> 'released' or v_payment.release_reason <> 'approved'
     or v_payment.released_at is null then
    raise exception 'F: release did not record approved/released_at';
  end if;
  v_released_at := v_payment.released_at;

  v_payment := public.sandbox_release_job_payment((select v from probe where k='job1'));
  if v_payment.status <> 'released' or v_payment.released_at <> v_released_at then
    raise exception 'F: repeated release was not a no-op';
  end if;
  raise notice 'PASS F2: held -> released (approved) exactly once; retry returns the same row';
end $$;

select pg_temp.become('wb');
do $$
begin
  begin
    perform public.job_payment_state((select v from probe where k='job1'));
    raise exception 'F: an outsider could read the payment state';
  exception when others then
    if sqlerrm like '%could read%' then raise; end if;
    raise notice 'PASS F3: outsider cannot read job_payment_state (%)', sqlerrm;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- G. TIP — release-first, payer-only, capped, one per job.
-- ---------------------------------------------------------------------------
select pg_temp.become('c');
do $$
begin
  -- job2 is completed nowhere yet — complete it first WITHOUT releasing, so
  -- the release-first gate is what refuses the tip.
  null;
end $$;

select pg_temp.become('wa');
select public.transition_job_status((select v from probe where k='job2'), 'in_progress');
select public.transition_job_status((select v from probe where k='job2'), 'completed');

select pg_temp.become('c');
do $$
begin
  begin
    perform public.sandbox_tip_worker((select v from probe where k='job2'), 500);
    raise exception 'G: a tip was accepted before release';
  exception when others then
    if sqlerrm like '%was accepted%' then raise; end if;
    raise notice 'PASS G1: tip refused until the job payment releases (%)', sqlerrm;
  end;
end $$;

select pg_temp.become('wa');
do $$
begin
  begin
    perform public.sandbox_tip_worker((select v from probe where k='job1'), 500);
    raise exception 'G: the WORKER was allowed to tip themselves';
  exception when others then
    if sqlerrm like '%was allowed%' then raise; end if;
    raise notice 'PASS G2: the payee cannot tip themselves (%)', sqlerrm;
  end;
end $$;

select pg_temp.become('c');
do $$
declare v_tip public.payments;
begin
  begin
    perform public.sandbox_tip_worker((select v from probe where k='job1'), 200000);
    raise exception 'G: an over-cap tip was accepted';
  exception when others then
    if sqlerrm like '%was accepted%' then raise; end if;
    raise notice 'PASS G3: $1,000 cap enforced (%)', sqlerrm;
  end;
  begin
    perform public.sandbox_tip_worker((select v from probe where k='job1'), 0);
    raise exception 'G: a zero tip was accepted';
  exception when others then
    if sqlerrm like '%was accepted%' then raise; end if;
    raise notice 'PASS G4: zero/negative tips refused (%)', sqlerrm;
  end;

  v_tip := public.sandbox_tip_worker((select v from probe where k='job1'), 500);
  if v_tip.kind <> 'tip' or v_tip.status <> 'released' or v_tip.amount_cents <> 500
     or v_tip.released_at is null then
    raise exception 'G: tip row not created as a released tip ledger entry';
  end if;
  insert into probe (k, v) values ('tip1', v_tip.id);

  v_tip := public.sandbox_tip_worker((select v from probe where k='job1'), 1000);
  if v_tip.id <> (select v from probe where k='tip1') or v_tip.amount_cents <> 500 then
    raise exception 'G: a second tip was minted for the same job';
  end if;
  raise notice 'PASS G5: one released tip per job; a retry returns the original';
end $$;

-- ---------------------------------------------------------------------------
-- H. AUTO-RELEASE — the 72h on-read clock, now with nothing holding it.
-- ---------------------------------------------------------------------------
reset role;
update public.jobs set completed_at = now() - interval '73 hours'
 where id = (select v from probe where k='job2');

select pg_temp.become('wa');
do $$
declare v_payment public.payments;
begin
  v_payment := public.job_payment_state((select v from probe where k='job2'));
  if v_payment.status <> 'released' or v_payment.release_reason <> 'auto_approved' then
    raise exception 'H: auto-release did not fire (status %, reason %)',
      v_payment.status, v_payment.release_reason;
  end if;
  v_payment := public.job_payment_state((select v from probe where k='job2'));
  if v_payment.release_reason <> 'auto_approved' then
    raise exception 'H: a second read disturbed the auto-release record';
  end if;
  raise notice 'PASS H: 72h on-read auto-release fired once, recorded auto_approved';
end $$;

-- ---------------------------------------------------------------------------
-- I. HARDENING-RUN REGRESSIONS (phase58).
--    I1: the unfundable-job race — the worker starts BEFORE checkout; the
--        customer can still authorize+hold afterwards (was: refused forever,
--        job completed with an empty ledger).
--    I2: transition retry idempotency — repeating a landed transition
--        returns the row instead of "Invalid job status transition".
-- ---------------------------------------------------------------------------
select pg_temp.become('c');
insert into probe (k, v)
select 'job3', (public.create_job(
  p_title := 'PHASE6 PROOF late-funding job',
  p_description := 'probe row, rolled back',
  p_category := 'other',
  p_location := 'Probe Area',
  p_budget_min_cents := 2500,
  p_budget_max_cents := 2500,
  p_address_line := '129 Probe Street'
)).id;

select pg_temp.become('wa');
insert into probe (k, v)
select 'offer3', public.create_offer(
  p_amount_cents := 2500,
  p_job_id := (select v from probe where k='job3'),
  p_message := 'phase6 proof late-funding bid'
);

select pg_temp.become('c');
select public.accept_offer((select v from probe where k='offer3'));

-- Worker starts FIRST — no payment exists yet.
select pg_temp.become('wa');
select public.transition_job_status((select v from probe where k='job3'), 'in_progress');

do $$
declare v_job public.jobs;
begin
  -- I2: the retry of the landed transition is a no-op success.
  v_job := public.transition_job_status((select v from probe where k='job3'), 'in_progress');
  if v_job.status <> 'in_progress' then
    raise exception 'I2: retry did not return the landed state (%)', v_job.status;
  end if;
  raise notice 'PASS I2: a repeated transition returns the row instead of raising';
end $$;

select pg_temp.become('c');
do $$
declare v_payment public.payments;
begin
  -- I1: authorize + hold still work after the start.
  v_payment := public.sandbox_authorize_job_payment((select v from probe where k='job3'));
  if v_payment.status <> 'authorized' then
    raise exception 'I1: late authorize did not land (%)', v_payment.status;
  end if;
  v_payment := public.sandbox_hold_job_payment((select v from probe where k='job3'));
  if v_payment.status <> 'held' then
    raise exception 'I1: late hold did not land (%)', v_payment.status;
  end if;
  raise notice 'PASS I1: a job started before checkout can still be funded (held)';
end $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK + zero residue.
-- ---------------------------------------------------------------------------
rollback;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.jobs where title like 'PHASE6 PROOF%';
  if v_count <> 0 then
    raise exception 'RESIDUE: % probe jobs survived the rollback', v_count;
  end if;
  -- Persistent seeds (the d1 review fixture) legitimately carry an open
  -- dispute; only THIS proof's rows must be gone.
  select count(*) into v_count from public.job_disputes
  where details like 'PHASE6 PROOF%';
  if v_count <> 0 then
    raise exception 'RESIDUE: % dispute rows survived', v_count;
  end if;
  select count(*) into v_count from public.job_checklist_items
   where label like 'PHASE6 PROOF%';
  if v_count <> 0 then
    raise exception 'RESIDUE: % checklist rows survived', v_count;
  end if;
  select count(*) into v_count from public.payments
   where status not in ('held') and job_id in (
     select id from public.jobs where id::text like 'b6c00000%');
  if v_count <> 0 then
    raise exception 'RESIDUE: a seeded payment moved past held';
  end if;
  raise notice 'PASS RESIDUE: rollback left zero probe rows; seed fixtures untouched';
end $$;
