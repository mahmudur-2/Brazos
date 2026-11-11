-- 340_worker_no_show.sql — ledger B8 (docs/critical/job-lifecycle.md, B8): a customer who cancels
-- after the arrival window ended, plus the worker's own reported delay, while the worker never
-- tapped "arrived", pays no fee. The money is the free cancel's (customer_cancelled_free, a full
-- refund, no transfer) and the job records cancel_reason 'worker_no_show'. Guards: an arrival keeps
-- the fee; a window still open keeps the fee; a client can never send the new reason.
--
-- THE CAST: a customer and the hired worker, and the runner (RLS bypassed) for fixtures and ground
-- truth. Every job is hired through create_job, create_offer and accept_offer and funded with
-- tests.test_fund_job. Everything rolls back.
--
-- FIXTURE SURGERY, DECLARED: job_agreements.accepted_at is rewound one hour (the 15-minute grace
-- cannot be waited out), through the immutability trigger, as 030's r4_age_agreement does. The late
-- term (late_minutes) is proven in 365 with p_now and in tests/cancelJob.test.mjs: cancel_job reads
-- now(), so no fixture here can sit between the window end and the delay.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(10);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('ns.customer@brazos.test', 'Nia Customer') as customer \gset
select tests.create_user('ns.worker@brazos.test',   'Ned Worker')   as worker   \gset
insert into fx values ('customer', :'customer'), ('worker', :'worker');

-- Post (customer), bid (worker), hire (customer). Returns the job; the runner's identity on return.
create or replace function tests.lc_hire(p_customer uuid, p_worker uuid, p_cents integer, p_title text,
  p_date date default null, p_start smallint default null, p_end smallint default null)
returns uuid language plpgsql as $$
declare
  v_job uuid;
  v_offer uuid;
begin
  perform tests.authenticate_as(p_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'Lifecycle probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := p_cents, p_budget_max_cents := p_cents,
    p_address_line := '4 Proof Way',
    p_scheduled_date := p_date, p_arrival_start_hour := p_start, p_arrival_end_hour := p_end
  )).id into v_job;
  perform tests.authenticate_as(p_worker);
  v_offer := public.create_offer(p_amount_cents := p_cents, p_job_id := v_job, p_message := 'Lifecycle bid');
  perform tests.authenticate_as(p_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  return v_job;
end $$;

-- SURGERY: rewind the snapshot's accepted_at through the immutability trigger.
create or replace function tests.lc_age_agreement(p_job uuid, p_by interval) returns void language plpgsql as $$
begin
  alter table public.job_agreements disable trigger job_agreements_immutable;
  update public.job_agreements set accepted_at = accepted_at - p_by where job_id = p_job;
  alter table public.job_agreements enable trigger job_agreements_immutable;
end $$;

create or replace function tests.lc_ny_today() returns date language sql stable as $$
  select (now() at time zone 'America/New_York')::date
$$;

-- The money and the job after a cancel, in one observation.
create or replace function tests.lc_after_cancel(p_job uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'job_status', j.status, 'cancel_reason', j.cancel_reason,
    'pay_status', p.status, 'full_refund', p.refund_cents = p.charge_amount_cents,
    'transfer_cents', p.transfer_cents, 'release_requested', p.release_requested_at is not null,
    'release_reason', p.release_reason, 'refund_reason', p.refund_reason)
  from public.jobs j join public.payments p on p.job_id = j.id and p.kind = 'job_payment'
  where j.id = p_job
$$;

-- N1 and N2: yesterday 9 to 12, held, no arrival, past the grace: the customer's cancel is free.
select tests.lc_hire(:'customer', :'worker', 5000, 'NS1 never came', tests.lc_ny_today() - 1, 9::smallint, 12::smallint) as j1 \gset
select tests.test_fund_job(:'j1') as p1 \gset
select tests.lc_age_agreement(:'j1', interval '1 hour');
select tests.authenticate_as(:'customer');
select public.cancel_job(:'j1', 'customer_cancelled');
select tests.clear_auth();
select is(tests.lc_after_cancel(:'j1'),
  jsonb_build_object('job_status', 'cancelled', 'cancel_reason', 'worker_no_show',
    'pay_status', 'held', 'full_refund', true, 'transfer_cents', 0, 'release_requested', false,
    'release_reason', null, 'refund_reason', 'customer_cancelled_free'),
  'N1+N2: window over, no arrival: a full refund, no transfer, and the job records worker_no_show');
select ok((select cancelled_by = :'customer'::uuid from public.jobs where id = :'j1'),
  'N2: the customer is recorded as the one who cancelled');
select is((select count(*) from public.refunds_due where id = :'p1') || '/' || (select count(*) from public.transfers_due where id = :'p1'),
  '1/0', 'N1: the refund is due and nothing is due to the worker');
select is((select count(*) from public.notification_outbox where recipient_id = :'worker' and type = 'job_cancelled'
             and data ->> 'jobId' = :'j1'::text
             and body = 'The customer cancelled this job. Open it to see what happens with the payment.'), 1::bigint,
  'N1: the worker gets the existing cancel notice once, with no fee promised');

-- N3: the same day and window, but the worker tapped "arrived": the fee, as before.
select tests.lc_hire(:'customer', :'worker', 5000, 'NS3 arrived', tests.lc_ny_today() - 1, 9::smallint, 12::smallint) as j3 \gset
insert into fx values ('j3', :'j3');
select tests.test_fund_job(:'j3') as p3 \gset
select tests.lc_age_agreement(:'j3', interval '1 hour');
select tests.authenticate_as(:'worker');
select public.mark_worker_arrival(:'j3', 'arrived');
select tests.authenticate_as(:'customer');
select public.cancel_job(:'j3', 'customer_cancelled');
select tests.clear_auth();
select is(tests.lc_after_cancel(:'j3') - 'full_refund',
  jsonb_build_object('job_status', 'cancelled', 'cancel_reason', 'customer_cancelled',
    'pay_status', 'held', 'transfer_cents', 1500, 'release_requested', true,
    'release_reason', 'cancellation_fee', 'refund_reason', 'customer_cancelled_late'),
  'N3: an arrival keeps the cancellation fee (guard)');

-- N4: today, window to midnight, no arrival: the window is not over, so the fee, as before.
select tests.lc_hire(:'customer', :'worker', 5000, 'NS4 window open', tests.lc_ny_today(), 9::smallint, 24::smallint) as j4 \gset
select tests.test_fund_job(:'j4') as p4 \gset
select tests.lc_age_agreement(:'j4', interval '1 hour');
select tests.authenticate_as(:'customer');
select public.cancel_job(:'j4', 'customer_cancelled');
select tests.clear_auth();
select is(tests.lc_after_cancel(:'j4') - 'full_refund',
  jsonb_build_object('job_status', 'cancelled', 'cancel_reason', 'customer_cancelled',
    'pay_status', 'held', 'transfer_cents', 1500, 'release_requested', true,
    'release_reason', 'cancellation_fee', 'refund_reason', 'customer_cancelled_late'),
  'N4: inside the window with no arrival yet, the fee is unchanged (guard)');

-- N5: a client can never send the new reason; the server decides it.
select tests.lc_hire(:'customer', :'worker', 5000, 'NS5 reason', tests.lc_ny_today() - 1, 9::smallint, 12::smallint) as j5 \gset
insert into fx values ('j5', :'j5');
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.cancel_job((select v from fx where k = 'j5'), 'worker_no_show') $$,
  'P0001', 'Unknown cancellation reason', 'N5: worker_no_show is refused from a client');
select tests.clear_auth();

-- N6: the shared window end is a server helper: no client may run it.
select ok(coalesce((select not has_function_privilege('authenticated', p.oid, 'EXECUTE')
                       and not has_function_privilege('anon', p.oid, 'EXECUTE')
                      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'job_window_end'), false),
  'N6: job_window_end exists and neither authenticated nor anon may execute it');

-- N7: the window end, New York time (calls the helper, so it stays last).
select is(public.job_window_end(date '2026-11-11', 12::smallint), timestamptz '2026-11-11 12:00:00-05',
  'N7: the window ends at its end hour, New York time');
select is(public.job_window_end(date '2026-07-01', null::smallint), timestamptz '2026-07-02 00:00:00-04',
  'N7: with no end hour the window ends at midnight after the day');

select * from finish();
rollback;
