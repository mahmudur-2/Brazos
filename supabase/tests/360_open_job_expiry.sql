-- 360_open_job_expiry.sql — ledger B15 (docs/critical/job-lifecycle.md, B15): an open market job
-- nobody was hired for is closed by the server: a dated one 24 hours after its arrival window ends,
-- an undated one 30 days after it was posted. cancel_reason 'expired', closed by nobody; its pending
-- offers are declined by the existing cancel trigger; the owner is told once. Hired jobs are never
-- touched. The hourly timer is installed by install_lifecycle_schedules().
--
-- THE CAST: a customer (owner), a worker (hired on one job), a bidder (a pending offer), and the
-- runner (RLS bypassed) playing the service role. Time moves only through expire_open_jobs(p_now).
-- No fixture surgery. Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(10);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('ox.customer@brazos.test', 'Oda Customer') as customer \gset
select tests.create_user('ox.worker@brazos.test',   'Oli Worker')   as worker   \gset
select tests.create_user('ox.bidder@brazos.test',   'Ora Bidder')   as bidder   \gset

create or replace function tests.lc_post(p_customer uuid, p_title text,
  p_date date default null, p_start smallint default null, p_end smallint default null)
returns uuid language plpgsql as $$
declare v_job uuid;
begin
  perform tests.authenticate_as(p_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'Lifecycle probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 4000, p_budget_max_cents := 4000,
    p_address_line := '4 Proof Way',
    p_scheduled_date := p_date, p_arrival_start_hour := p_start, p_arrival_end_hour := p_end
  )).id into v_job;
  perform tests.clear_auth();
  return v_job;
end $$;

-- The dated jobs are today 9 to 12, New York time; their window ends at 12:00.
select ((now() at time zone 'America/New_York')::date::timestamp + interval '12 hours') at time zone 'America/New_York' as we \gset

-- X1: dated, with a pending offer. X2: undated. X4: dated and hired.
select tests.lc_post(:'customer', 'OX1 dated', (now() at time zone 'America/New_York')::date, 9::smallint, 12::smallint) as j1 \gset
select tests.lc_post(:'customer', 'OX2 undated') as j2 \gset
select tests.lc_post(:'customer', 'OX4 hired', (now() at time zone 'America/New_York')::date, 9::smallint, 12::smallint) as j4 \gset
select tests.authenticate_as(:'bidder');
select public.create_offer(p_amount_cents := 4000, p_job_id := :'j1', p_message := 'Lifecycle bid') as o1 \gset
select tests.authenticate_as(:'worker');
select public.create_offer(p_amount_cents := 4000, p_job_id := :'j4', p_message := 'Lifecycle bid') as o4 \gset
select tests.authenticate_as(:'customer');
select public.accept_offer(:'o4');
select tests.clear_auth();

-- X1: 23 hours past the window end it stays open; 25 hours past, it is closed as expired.
select public.expire_open_jobs(:'we'::timestamptz + interval '23 hours');
select is((select status::text from public.jobs where id = :'j1'), 'open', 'X1: 23 hours past the window end the job is still open');
select public.expire_open_jobs(:'we'::timestamptz + interval '25 hours');
select is((select jsonb_build_object('status', status, 'reason', cancel_reason, 'by', cancelled_by, 'at', cancelled_at is not null)
             from public.jobs where id = :'j1'),
  jsonb_build_object('status', 'cancelled', 'reason', 'expired', 'by', null, 'at', true),
  'X1: 25 hours past the window end: closed as expired, by nobody');

-- X3: its pending offer is declined by the existing cancel trigger.
select is((select status::text from public.job_offers where id = :'o1'), 'declined', 'X3: the pending offer is declined');

-- X2: undated: open at 29 days, closed at 31.
select public.expire_open_jobs(now() + interval '29 days');
select is((select status::text from public.jobs where id = :'j2'), 'open', 'X2: an undated job is still open after 29 days');
select public.expire_open_jobs(now() + interval '31 days');
select is((select status::text || '/' || cancel_reason from public.jobs where id = :'j2'), 'cancelled/expired',
  'X2: an undated job is closed as expired after 30 days');

-- X4: a hired job is never touched.
select is((select status::text from public.jobs where id = :'j4'), 'assigned', 'X4: a hired job is untouched by the expiry');

-- X5: the owner is told once, with no amount, even after another run.
select public.expire_open_jobs(now() + interval '32 days');
select is((select count(*) from public.notification_outbox
            where recipient_id = :'customer' and type = 'job_cancelled' and data ->> 'jobId' = :'j1'::text
              and data ->> 'screen' = 'ClientJobDetail' and title = 'Your job was closed'
              and body = 'OX1 dated: no worker was hired in time. Post it again when you are ready.'),
  1::bigint, 'X5: the owner is told once, on ClientJobDetail');
select is((select count(*) from public.notification_outbox where data ->> 'jobId' = :'j2'::text and type = 'job_cancelled'),
  1::bigint, 'X5: a second run sends nothing more');

-- X6: service role only, and the installer.
select ok(coalesce((select bool_and(not has_function_privilege('authenticated', p.oid, 'EXECUTE')
                                and not has_function_privilege('anon', p.oid, 'EXECUTE')
                                and has_function_privilege('service_role', p.oid, 'EXECUTE'))
                       and count(*) = 2
                      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname in ('expire_open_jobs', 'install_lifecycle_schedules')), false),
  'X6: expire_open_jobs and install_lifecycle_schedules run as service_role only');
select is(public.install_lifecycle_schedules(), 'scheduled: close-unpaid-hires, expire-open-jobs, close-no-show-hires',
  'X6: the installer schedules its three timers (pg_cron is installed by a migration, B7)');

select * from finish();
rollback;
