-- 365_no_show_close.sql — ledger B24 (the gap B8 left): a dated job that is assigned, paid (held)
-- and never marked arrived is closed by the hourly server sweep 24 hours after its arrival window
-- ended plus the worker's reported delay, when the customer never cancels. The money is the
-- customer's free no-show cancel's, from the same function cancel_job calls (queue_free_cancel_refund):
-- a full refund, no transfer, no fee. cancel_reason 'worker_no_show', closed by nobody. Each side is
-- told once, with no amount.
--
-- THE CAST: a customer, the hired worker, and the runner (RLS bypassed) playing the service role.
-- Time moves only through close_no_show_hires(p_now). Everything rolls back.
--
-- FIXTURE SURGERY, DECLARED (one, C5): late_minutes is set to 30 on one job by the runner.
-- report_running_late only works on the job's own day, and these jobs are dated yesterday.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(11);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('nc.customer@brazos.test', 'Noa Customer') as customer \gset
select tests.create_user('nc.worker@brazos.test',   'Nik Worker')   as worker   \gset

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

-- Every dated job here is yesterday 9 to 12, New York time; the window ended yesterday at 12:00.
select ((now() at time zone 'America/New_York')::date - 1) as yday \gset
select ((:'yday'::date)::timestamp + interval '12 hours') at time zone 'America/New_York' as we \gset

-- W1: held, never arrived. W2: held, arrived. W3: held, no date. W4: held, never arrived, 30 late.
select tests.lc_hire(:'customer', :'worker', 5000, 'NC1 never came', :'yday'::date, 9::smallint, 12::smallint) as j1 \gset
select tests.lc_hire(:'customer', :'worker', 5000, 'NC2 arrived', :'yday'::date, 9::smallint, 12::smallint) as j2 \gset
select tests.lc_hire(:'customer', :'worker', 5000, 'NC3 no date') as j3 \gset
select tests.lc_hire(:'customer', :'worker', 5000, 'NC4 running late', :'yday'::date, 9::smallint, 12::smallint) as j4 \gset
select tests.test_fund_job(:'j1') as p1 \gset
select tests.test_fund_job(:'j2') as p2 \gset
select tests.test_fund_job(:'j3') as p3 \gset
select tests.test_fund_job(:'j4') as p4 \gset
select tests.authenticate_as(:'worker');
select public.mark_worker_arrival(:'j2', 'arrived');
select tests.clear_auth();
update public.jobs set late_minutes = 30 where id = :'j4';

-- C1: 23 hours past the window end nothing changes.
select public.close_no_show_hires(:'we'::timestamptz + interval '23 hours');
select is((select string_agg(status::text, ',' order by title) from public.jobs where id in (:'j1', :'j4')),
  'assigned,assigned', 'C1: 23 hours past the window end both no-show jobs are still assigned');

-- C2: 24 hours and 20 minutes past: W1 is closed with the free cancel's money.
select public.close_no_show_hires(:'we'::timestamptz + interval '24 hours 20 minutes');
select is((select jsonb_build_object(
             'job_status', j.status, 'cancel_reason', j.cancel_reason, 'by', j.cancelled_by,
             'pay_status', p.status, 'full_refund', p.refund_cents = p.charge_amount_cents,
             'transfer_cents', p.transfer_cents, 'release_requested', p.release_requested_at is not null,
             'release_reason', p.release_reason, 'refund_reason', p.refund_reason)
           from public.jobs j join public.payments p on p.job_id = j.id where p.id = :'p1'),
  jsonb_build_object('job_status', 'cancelled', 'cancel_reason', 'worker_no_show', 'by', null,
    'pay_status', 'held', 'full_refund', true, 'transfer_cents', 0, 'release_requested', false,
    'release_reason', null, 'refund_reason', 'customer_cancelled_free'),
  'C2: a held, never-arrived job 24 hours past its window: closed as worker_no_show, a full refund, no fee');

-- C5: the worker's reported delay moves the line: W4 (30 late) is still assigned at +24h20m.
select is((select status::text from public.jobs where id = :'j4'), 'assigned',
  'C5: a reported 30-minute delay keeps the job 24 hours 20 minutes past the window');
select public.close_no_show_hires(:'we'::timestamptz + interval '24 hours 40 minutes');
select is((select status::text || '/' || cancel_reason from public.jobs where id = :'j4'), 'cancelled/worker_no_show',
  'C5: … and closes it once the delay has passed too');

-- C3: an arrival keeps the job; C4: a job with no date is never this sweep's.
select public.close_no_show_hires(now() + interval '60 days');
select is((select j.status::text || '/' || p.status::text || '/' || coalesce(p.refund_cents::text, 'none')
             from public.jobs j join public.payments p on p.job_id = j.id where p.id = :'p2'),
  'assigned/held/none', 'C3: a job the worker arrived at is untouched');
select is((select j.status::text || '/' || p.status::text || '/' || coalesce(p.refund_cents::text, 'none')
             from public.jobs j join public.payments p on p.job_id = j.id where p.id = :'p3'),
  'assigned/held/none', 'C4: a job with no date is untouched');

-- C6: the second and third runs changed nothing: the refund is queued once.
select is((select count(*) from public.refunds_due where id = :'p1') || '/' || (select refund_cents = charge_amount_cents from public.payments where id = :'p1'),
  '1/true', 'C6: the refund is queued once, for the full charge');
select is((select count(*) from public.notification_outbox where data ->> 'jobId' = :'j1'::text and type = 'job_cancelled'),
  2::bigint, 'C6: one notice to each side, however many runs');

-- C7: the notices, with no amount.
select is((select string_agg(n.title || ' | ' || n.body || ' | ' || (n.data ->> 'screen'), ' || '
                             order by (n.recipient_id = :'customer'::uuid) desc)
             from public.notification_outbox n where n.data ->> 'jobId' = :'j1'::text and n.type = 'job_cancelled'),
  'Your job was closed | NC1 never came: the worker did not arrive, so your payment is being refunded in full. | ClientJobDetail'
  || ' || A job was closed | NC1 never came: you did not mark that you arrived, so the customer is refunded in full. | WorkerJob',
  'C7: the customer and the worker are each told once, with no amount');

-- C8: one home for the refund, and service role only on the schedule.
select ok(coalesce((select bool_and(p.prosrc like '%queue_free_cancel_refund(%') and count(*) = 2
                      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname in ('cancel_job', 'close_no_show_hires')), false),
  'C8: cancel_job and the sweep queue the refund through the same function');
select ok(coalesce((select not has_function_privilege('authenticated', p.oid, 'EXECUTE')
                       and not has_function_privilege('anon', p.oid, 'EXECUTE')
                       and has_function_privilege('service_role', p.oid, 'EXECUTE')
                       and (select prosrc like '%close-no-show-hires%' from pg_proc i join pg_namespace s on s.oid = i.pronamespace
                             where s.nspname = 'public' and i.proname = 'install_lifecycle_schedules')
                      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'close_no_show_hires'), false),
  'C8: close_no_show_hires runs as service_role only and the lifecycle installer schedules it');

select * from finish();
rollback;
