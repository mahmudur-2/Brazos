-- 375_fee_math.sql — lean B5 (money rule 5): fee math is exact in whole cents up to the $100,000
-- ceiling. Proves 20261112010000_fee_math_numeric.sql.
--
-- The fee schedule in force locally is the seeded one (7.5% each side, worker minimum $1.00, tip
-- customer fee 7.5%, tax 0, cancellation 20% floored at $15 and capped at $35, tips capped at 50%
-- of the job and at $1,000). Before the fix each product was int4 * int4 and overflowed:
--   quote_job_price        from 2,863,312 cents ($28,633.12; * 750)
--   cancellation_fee_cents from 1,073,742 cents ($10,737.42; * 2000)
--   the tip ceiling        from a 429,497-cent job ($4,294.97; * 5000)
-- Every call goes through tests.fm_try, so before the fix each assertion fails with the error it
-- names ("integer out of range") instead of aborting the file. Amounts below the old overflow are
-- pinned too: the fix changes none of them.
--
-- THE CAST: a customer, a worker, the runner. Jobs are hired through the real RPCs and funded with
-- tests.test_fund_job. No surgery. Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(20);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('fm.customer@brazos.test', 'Fay Customer') as customer \gset
select tests.create_user('fm.worker@brazos.test',   'Fin Worker')   as worker   \gset
insert into fx values ('customer', :'customer'), ('worker', :'worker');

-- A statement's single result as text, or its error.
create or replace function tests.fm_try(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception when others then
  return 'error: ' || sqlerrm;
end $$;

-- Post, bid, hire at p_cents; fund; work; release. Returns the job payment's id.
create or replace function tests.fm_paid(p_cents integer, p_title text) returns uuid language plpgsql as $$
declare
  v_customer uuid := (select v from fx where k = 'customer');
  v_worker   uuid := (select v from fx where k = 'worker');
  v_job uuid;
  v_offer uuid;
  v_pid uuid;
begin
  perform tests.authenticate_as(v_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'Fee probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := p_cents, p_budget_max_cents := p_cents,
    p_address_line := '4 Proof Way'
  )).id into v_job;
  perform tests.authenticate_as(v_worker);
  v_offer := public.create_offer(p_amount_cents := p_cents, p_job_id := v_job, p_message := 'Fee bid');
  perform tests.authenticate_as(v_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  v_pid := tests.test_fund_job(v_job);
  perform tests.authenticate_as(v_worker);
  perform public.transition_job_status(v_job, 'in_progress');
  perform public.transition_job_status(v_job, 'completed', '["https://example.com/fm-done.jpg"]'::jsonb);
  perform tests.authenticate_as(v_customer);
  perform public.release_job_payment(v_job);
  perform tests.clear_auth();
  return v_pid;
end $$;

-- The customer asks for a tip of p_cents on p_job. Returns the tip's amount.
create or replace function tests.fm_tip(p_job uuid, p_cents integer) returns integer language plpgsql as $$
declare v_amount integer;
begin
  perform tests.authenticate_as((select fx.v from fx where fx.k = 'customer'));
  v_amount := (public.begin_tip_payment(p_job, p_cents)).amount_cents;
  perform tests.clear_auth();
  return v_amount;
end $$;

-- ---------------------------------------------------------------------------
-- Q. quote_job_price: (price, customer fee, tax, total, worker fee, worker receives).
-- ---------------------------------------------------------------------------
select is(tests.fm_try('select row(q.*)::text from public.quote_job_price(1) q'), '(1,0,0,1,1,0)',
  'Q1: 1 cent: no customer fee, the worker fee capped at the price');
select is(tests.fm_try('select row(q.*)::text from public.quote_job_price(20) q'), '(20,2,0,22,20,0)',
  'Q2: 20 cents: 1.5 rounds half away from zero to 2, as before');
select is(tests.fm_try('select row(q.*)::text from public.quote_job_price(1000) q'), '(1000,75,0,1075,100,900)',
  'Q3: $10: the $1 worker minimum');
select is(tests.fm_try('select row(q.*)::text from public.quote_job_price(5000) q'), '(5000,375,0,5375,375,4625)',
  'Q4: $50');
select is(tests.fm_try('select row(q.*)::text from public.quote_job_price(12345) q'), '(12345,926,0,13271,926,11419)',
  'Q5: $123.45: 925.875 rounds to 926');
select is(tests.fm_try('select row(q.*)::text from public.quote_job_price(2863311) q'), '(2863311,214748,0,3078059,214748,2648563)',
  'Q6: $28,633.11, the last amount that worked before: unchanged');
select is(tests.fm_try('select row(q.*)::text from public.quote_job_price(2863312) q'), '(2863312,214748,0,3078060,214748,2648564)',
  'Q7 (B5): $28,633.12, the first amount that overflowed');
select is(tests.fm_try('select row(q.*)::text from public.quote_job_price(10000000) q'), '(10000000,750000,0,10750000,750000,9250000)',
  'Q8 (B5): $100,000, the ceiling');

-- ---------------------------------------------------------------------------
-- C. cancellation_fee_cents (no agreement: the schedule in force).
-- ---------------------------------------------------------------------------
select is(tests.fm_try(format('select public.cancellation_fee_cents(%L, 1000)', gen_random_uuid())), '1000',
  'C1: $10: the $15 floor, capped at the price');
select is(tests.fm_try(format('select public.cancellation_fee_cents(%L, 5000)', gen_random_uuid())), '1500', 'C2: $50: the floor');
select is(tests.fm_try(format('select public.cancellation_fee_cents(%L, 20000)', gen_random_uuid())), '3500', 'C3: $200: the cap');
select is(tests.fm_try(format('select public.cancellation_fee_cents(%L, 1073741)', gen_random_uuid())), '3500',
  'C4: $10,737.41, the last amount that worked before: unchanged');
select is(tests.fm_try(format('select public.cancellation_fee_cents(%L, 1073742)', gen_random_uuid())), '3500',
  'C5 (B5): $10,737.42, the first amount that overflowed');
select is(tests.fm_try(format('select public.cancellation_fee_cents(%L, 10000000)', gen_random_uuid())), '3500', 'C6 (B5): $100,000');

-- ---------------------------------------------------------------------------
-- T. The tip ceiling on a $4,294.97 job, and an absurd tip.
-- ---------------------------------------------------------------------------
select tests.fm_paid(429497, 'FM tip base') as ptip \gset
insert into public.payment_events (id, type, payload)
values ('evt_fm_tip_tc', 'transfer.created', jsonb_build_object('id', 'evt_fm_tip_tc', 'type', 'transfer.created',
  'data', jsonb_build_object('object', jsonb_build_object('id', 'tr_fm_tip_base',
    'amount', (select transfer_cents from public.payments where id = :'ptip'),
    'metadata', jsonb_build_object('payment_id', :'ptip')))));
select public.apply_payment_event('evt_fm_tip_tc');
select job_id as jtip from public.payments where id = :'ptip' \gset
select is(tests.fm_try(format('select tests.fm_tip(%L, 100001)', :'jtip')), 'error: A tip on this job can be at most $1,000.00',
  'T1 (B5): a $4,294.97 job: the ceiling is computed ($1,000.00), not an overflow');
select is(tests.fm_try(format('select tests.fm_tip(%L, 100000)', :'jtip')), '100000', 'T2: a tip at the ceiling is accepted');
select is(tests.fm_try(format('select tests.fm_tip(%L, 2863312)', :'jtip')), 'error: A tip on this job can be at most $1,000.00',
  'T3 (B5): an absurd tip gets the ceiling''s sentence, not "integer out of range"');

-- ---------------------------------------------------------------------------
-- E. End to end: hired, funded and released at the edge and at the ceiling.
-- ---------------------------------------------------------------------------
select tests.fm_try($$select tests.fm_paid(2863312, 'FM edge')::text$$) as pedge \gset
select is((select charge_amount_cents || '/' || platform_fee_cents || '/' || transfer_cents from public.payments where id::text = :'pedge'),
  '3078060/214748/2648564', 'E1 (B5): a $28,633.12 hire is charged $30,780.60 and sends the worker $26,485.64');
select tests.fm_try($$select tests.fm_paid(10000000, 'FM ceiling')::text$$) as pceil \gset
select is((select charge_amount_cents || '/' || platform_fee_cents || '/' || transfer_cents from public.payments where id::text = :'pceil'),
  '10750000/750000/9250000', 'E2 (B5): a $100,000 hire is charged $107,500 and sends the worker $92,500');
select is(tests.fm_try(format('select public.cancellation_fee_cents(%L, 2863312)',
            (select job_id from public.payments where id::text = :'pedge'))), '3500',
  'E3 (B5): the hire''s own cancellation terms at $28,633.12');

select * from finish();
rollback;
