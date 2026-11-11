-- 390_payouts_gate.sql — ledger B11 (docs/critical/job-lifecycle.md, B11): a worker who cannot be
-- paid cannot send, counter or accept an offer, and cannot be hired. The gate reads the WORKER of the
-- offer (payment_accounts.payouts_enabled), never the caller. A customer's hire request to such a
-- worker is still allowed; the worker may decline it.
--
-- THE CAST: a customer (C), a worker with payouts on (W), a worker with no payout account (N), a
-- worker whose payouts go off after his bid (L), and a customer with no payout account (K). Payout
-- states are set with tests.set_payouts (ADAPTATION 4). Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(17);

-- psql does not interpolate :'vars' inside dollar quotes, so ids also live here.
create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('pg.customer@brazos.test', 'Pia Customer') as c \gset
select tests.create_user('pg.worker@brazos.test',   'Pax Worker')   as w \gset
select tests.create_user('pg.nopay@brazos.test',    'Nell Nopay')   as n \gset
select tests.create_user('pg.lapsed@brazos.test',   'Lou Lapsed')   as l \gset
select tests.create_user('pg.kcust@brazos.test',    'Kit Customer') as k \gset
select tests.set_payouts(:'n', 'none');
select tests.set_payouts(:'k', 'none');
insert into fx values ('c', :'c'), ('w', :'w'), ('n', :'n'), ('l', :'l'), ('k', :'k');

create or replace function tests.pg_post(p_customer uuid, p_title text) returns uuid
language plpgsql as $$
declare v_job uuid;
begin
  perform tests.authenticate_as(p_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'Payout gate probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000,
    p_address_line := '4 Proof Way'
  )).id into v_job;
  perform tests.clear_auth();
  return v_job;
end $$;

select tests.pg_post(:'c', 'PG1 open job') as j1 \gset
select tests.pg_post(:'c', 'PG2 open job') as j2 \gset
select tests.pg_post(:'k', 'PG4 open job') as j4 \gset
select tests.pg_post(:'c', 'PG5 open job') as j5 \gset
insert into fx values ('j1', :'j1');

-- ---------------------------------------------------------------------------
-- P1: a worker with no payout account cannot bid.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'n');
select throws_ok(
  $$ select public.create_offer(p_amount_cents := 5000, p_job_id := (select v from fx where k = 'j1'), p_message := 'PG1 bid') $$,
  'P0001', 'Finish payout set-up before you send an offer. Open Profile, then Earnings & payouts.',
  'P1: a worker with payouts off cannot bid on an open job');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- P2: a bid sent while payouts were on cannot be accepted once they are off.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'l');
select public.create_offer(p_amount_cents := 5000, p_job_id := :'j2', p_message := 'PG2 bid') as o2 \gset
select tests.clear_auth();
insert into fx values ('o2', :'o2');
select tests.set_payouts(:'l', 'action_needed');
select tests.authenticate_as(:'c');
select throws_ok(
  $$ select public.accept_offer((select v from fx where k = 'o2')) $$,
  'P0001', 'This worker cannot be paid yet, so they cannot be hired. Choose another worker, or try again later.',
  'P2: the customer cannot hire a worker whose payouts are off');
select tests.clear_auth();
select is(
  (select jsonb_build_object('job', j.status, 'worker', j.assigned_worker_id, 'offer', o.status)
     from public.jobs j join public.job_offers o on o.job_id = j.id
    where o.id = :'o2'),
  jsonb_build_object('job', 'open', 'worker', null, 'offer', 'pending'),
  'P2: the job stays open and the bid stays pending');

-- ---------------------------------------------------------------------------
-- P3: a hire request to a worker with no payout account is sent; he cannot accept or counter it,
-- and can decline it.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'c');
select public.create_offer(p_amount_cents := 4000, p_worker_id := :'n', p_title := 'PG3 hire request',
  p_description := 'payout gate probe, rolled back', p_category := 'other', p_location := 'Probe Area') as o3 \gset
select tests.clear_auth();
insert into fx values ('o3', :'o3');
select ok(exists (select 1 from public.job_offers where id = :'o3' and status = 'pending' and awaiting_id = :'n'),
  'P3: the customer''s hire request to a worker with payouts off is sent');
select tests.authenticate_as(:'n');
select throws_ok(
  $$ select public.accept_offer((select v from fx where k = 'o3')) $$,
  'P0001', 'Finish payout set-up before you accept. Open Profile, then Earnings & payouts.',
  'P3: the worker with payouts off cannot accept the hire request');
select throws_ok(
  $$ select public.counter_offer((select v from fx where k = 'o3'), 4500) $$,
  'P0001', 'Finish payout set-up before you send an offer. Open Profile, then Earnings & payouts.',
  'P3: the worker with payouts off cannot counter the hire request');
select lives_ok(
  $$ select public.decline_offer((select v from fx where k = 'o3')) $$,
  'P3: the worker with payouts off can decline the hire request');
select tests.clear_auth();
select is((select status::text from public.job_offers where id = :'o3'), 'declined',
  'P3: the hire request is declined');

-- ---------------------------------------------------------------------------
-- P4: a customer with no payout account counters a bid: the gate reads the worker only.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'w');
select public.create_offer(p_amount_cents := 5000, p_job_id := :'j4', p_message := 'PG4 bid') as o4 \gset
select tests.clear_auth();
insert into fx values ('o4', :'o4');
select tests.authenticate_as(:'k');
select lives_ok(
  $$ select public.counter_offer((select v from fx where k = 'o4'), 4500) $$,
  'P4: a customer with no payout account can counter a bid');
select tests.clear_auth();
select is(
  (select count(*) from public.job_offers
    where root_offer_id = :'o4' and author_id = :'k' and awaiting_id = :'w' and status = 'pending' and amount_cents = 4500),
  1::bigint,
  'P4: the customer''s counter is the live revision, awaiting the worker');

-- ---------------------------------------------------------------------------
-- P5 (guard): payouts on: bid, the customer's counter, the worker's counter and the hire succeed.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'w');
select public.create_offer(p_amount_cents := 5000, p_job_id := :'j5', p_message := 'PG5 bid') as o5 \gset
select tests.authenticate_as(:'c');
select public.counter_offer(:'o5', 4600) as o5c \gset
select tests.clear_auth();
insert into fx values ('o5c', :'o5c');
select tests.authenticate_as(:'w');
select lives_ok(
  $$ select public.counter_offer((select v from fx where k = 'o5c'), 4800) $$,
  'P5: a worker with payouts on can counter');
select tests.clear_auth();
select id as o5w from public.job_offers where parent_offer_id = :'o5c' \gset
insert into fx values ('o5w', :'o5w');
select tests.authenticate_as(:'c');
select lives_ok(
  $$ select public.accept_offer((select v from fx where k = 'o5w')) $$,
  'P5: the customer can hire a worker with payouts on');
select tests.clear_auth();
select is(
  (select jsonb_build_object('job', status, 'worker', assigned_worker_id, 'offer', accepted_offer_id, 'price', final_amount_cents)
     from public.jobs where id = :'j5'),
  jsonb_build_object('job', 'assigned', 'worker', :'w'::uuid, 'offer', :'o5w'::uuid, 'price', 4800),
  'P5: the job is assigned to the worker at the agreed price');
select is((select status::text from public.job_offers where id = :'o5'), 'superseded',
  'P5: the bid the counters answered is superseded, as before');

-- ---------------------------------------------------------------------------
-- P6: access. The helper is owner-only; the three keep exactly authenticated.
-- Read by oid, so a missing helper fails these instead of stopping the file.
-- ---------------------------------------------------------------------------
select has_function('public', 'worker_payouts_ready', array['uuid'], 'P6: worker_payouts_ready(uuid) exists');
select ok(coalesce((select not has_function_privilege('authenticated', p.oid, 'EXECUTE')
                       and not has_function_privilege('anon', p.oid, 'EXECUTE')
                       and not has_function_privilege('service_role', p.oid, 'EXECUTE')
                      from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                     where s.nspname = 'public' and p.proname = 'worker_payouts_ready'), false),
  'P6: no API role may execute worker_payouts_ready');
select ok((select bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')
                           and not has_function_privilege('anon', p.oid, 'EXECUTE')
                           and not has_function_privilege('service_role', p.oid, 'EXECUTE'))
             from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and p.proname in ('create_offer', 'counter_offer', 'accept_offer')),
  'P6: create_offer, counter_offer and accept_offer: authenticated may execute, anon and service_role may not');

select * from finish();
rollback;
