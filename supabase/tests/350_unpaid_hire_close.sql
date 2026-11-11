-- 350_unpaid_hire_close.sql — ledger B4 (docs/critical/job-lifecycle.md, B4, "always close" as the
-- orchestrator directed): a hire that is not paid 24 hours after the hire is closed by the server
-- with cancel_reason 'unpaid'. A started checkout keeps its own window; money on the job keeps the
-- hire. Each side is told once, with no amount. Nothing is re-opened.
--
-- THE CAST: a customer, the hired worker, and the runner (RLS bypassed) playing the service role
-- that the 15-minute timer runs as. Time moves only through close_unpaid_hires(p_now); no hire stamp
-- is edited. Everything rolls back.
--
-- FIXTURE SURGERY, DECLARED (one, U3): a started checkout's funding_due_at is moved to now() + 30
-- hours, a window still ahead when the sweep runs at now() + 25 hours.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(11);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('uh.customer@brazos.test', 'Uma Customer') as customer \gset
select tests.create_user('uh.worker@brazos.test',   'Uri Worker')   as worker   \gset
insert into fx values ('customer', :'customer'), ('worker', :'worker');

create or replace function tests.lc_hire(p_customer uuid, p_worker uuid, p_cents integer, p_title text)
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
    p_address_line := '4 Proof Way'
  )).id into v_job;
  perform tests.authenticate_as(p_worker);
  v_offer := public.create_offer(p_amount_cents := p_cents, p_job_id := v_job, p_message := 'Lifecycle bid');
  perform tests.authenticate_as(p_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  return v_job;
end $$;

-- A: hired, no checkout. B: checkout started, its window lapses. C: checkout started, window moved
-- ahead. D: paid (held).
select tests.lc_hire(:'customer', :'worker', 4000, 'UH A no checkout') as ja \gset
select tests.lc_hire(:'customer', :'worker', 4000, 'UH B lapsed checkout') as jb \gset
select tests.lc_hire(:'customer', :'worker', 4000, 'UH C window ahead') as jc \gset
select tests.lc_hire(:'customer', :'worker', 4000, 'UH D paid') as jd \gset
insert into fx values ('ja', :'ja');
select tests.authenticate_as(:'customer');
select (public.begin_job_payment(:'jb')).id as pb \gset
select (public.begin_job_payment(:'jc')).id as pc \gset
select tests.clear_auth();
update public.payments set funding_due_at = now() + interval '30 hours' where id = :'pc';
select tests.test_fund_job(:'jd') as pd \gset

-- U1: 23 hours after the hire nothing changes; 25 hours after, A is closed.
select public.close_unpaid_hires(now() + interval '23 hours');
select is((select status::text from public.jobs where id = :'ja'), 'assigned', 'U1: 23 hours after the hire the job is still assigned');
select public.close_unpaid_hires(now() + interval '25 hours');
select is((select jsonb_build_object('status', status, 'reason', cancel_reason, 'by', cancelled_by, 'at', cancelled_at is not null, 'worker', assigned_worker_id = :'worker'::uuid)
             from public.jobs where id = :'ja'),
  jsonb_build_object('status', 'cancelled', 'reason', 'unpaid', 'by', null, 'at', true, 'worker', true),
  'U1: 25 hours after the hire, unpaid: closed with reason unpaid, by nobody, the worker kept on the record');

-- U2: the lapsed checkout is voided and the job closed.
select is((select p.status::text || '/' || p.last_error || '/' || j.cancel_reason
             from public.payments p join public.jobs j on j.id = p.job_id where p.id = :'pb'),
  'voided/job closed: not paid in time/unpaid',
  'U2: a lapsed checkout is voided and the job is closed as unpaid');

-- U3: a checkout window still ahead is never cut short.
select is((select j.status::text || '/' || p.status::text from public.jobs j join public.payments p on p.job_id = j.id where p.id = :'pc'),
  'assigned/unfunded', 'U3: a started checkout keeps its own window');

-- U4: money on the job keeps the hire, however late.
select public.close_unpaid_hires(now() + interval '72 hours');
select is((select j.status::text || '/' || p.status::text from public.jobs j join public.payments p on p.job_id = j.id where p.id = :'pd'),
  'assigned/held', 'U4: a paid hire is never closed by this sweep');

-- U5: each side is told once, on its own screen, with no amount.
select is((select count(*) from public.notification_outbox
            where recipient_id = :'customer' and type = 'job_cancelled' and data ->> 'jobId' = :'ja'::text
              and data ->> 'screen' = 'ClientJobDetail' and title = 'Your job was closed'
              and body = 'UH A no checkout: it was not paid within 24 hours of the hire. Post it again when you are ready.'),
  1::bigint, 'U5: the customer is told once, on ClientJobDetail');
select is((select count(*) from public.notification_outbox
            where recipient_id = :'worker' and type = 'job_cancelled' and data ->> 'jobId' = :'ja'::text
              and data ->> 'screen' = 'WorkerJob' and title = 'A job was closed'
              and body = 'UH A no checkout: the customer did not pay within 24 hours of the hire.'),
  1::bigint, 'U5: the worker is told once, on WorkerJob');
select is((select count(*) from public.notification_outbox
            where data ->> 'jobId' in (:'ja'::text, :'jb'::text) and type = 'job_cancelled' and body like '%$%'),
  0::bigint, 'U5: no notice names an amount');

-- U6: a second run changes nothing.
select public.close_unpaid_hires(now() + interval '26 hours');
select is((select count(*) from public.notification_outbox where data ->> 'jobId' = :'ja'::text and type = 'job_cancelled'),
  2::bigint, 'U6: a second run sends nothing more');

-- U7: the closed hire no longer blocks the customer's account deletion.
select tests.authenticate_as(:'customer');
select is((select count(*) from public.account_deletion_blockers() b where b.ref_id = (select v from fx where k = 'ja')),
  0::bigint, 'U7: the closed job is not a deletion blocker');
select tests.clear_auth();

-- U8: service role only.
select ok(coalesce((select not has_function_privilege('authenticated', p.oid, 'EXECUTE')
                       and not has_function_privilege('anon', p.oid, 'EXECUTE')
                       and has_function_privilege('service_role', p.oid, 'EXECUTE')
                      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'close_unpaid_hires'), false),
  'U8: close_unpaid_hires runs as service_role only');

select * from finish();
rollback;
