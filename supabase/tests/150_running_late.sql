-- 150_running_late.sql — idea 5's proofs: 20260930000700_running_late.sql proven on the local stack
-- before the pipeline applies it anywhere. Seventeen assertions in nine numbered groups; each says
-- what it proves.
--
-- THE CAST: a customer (posts and accepts), the hired worker, a second worker who is not hired, and
-- the runner — the connection's own role, RLS bypassed — for the catalogue and outbox reads.
--
-- THE FIXTURE, through the real RPCs (020_lifecycle.sql's way): the customer posts two jobs, both
-- with a 6–8 PM arrival window; the worker bids on both; the customer accepts both, so both are
-- assigned to the worker. Job 2 is then marked arrived through mark_worker_arrival(). Everything
-- rolls back; no commit.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(17);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('i5.customer@brazos.test', 'Dana Customer') as customer \gset
select tests.create_user('i5.worker@brazos.test', 'Sam Worker') as worker \gset
select tests.create_user('i5.other@brazos.test', 'Olly Other') as other \gset
select ((now() at time zone 'America/New_York')::date + 1) as tomorrow \gset
insert into fx values ('customer', :'customer'), ('worker', :'worker'), ('other', :'other');

select tests.authenticate_as(:'customer');
select (public.create_job(
  p_title := 'I5 hang a mirror', p_description := 'probe row, rolled back',
  p_category := 'other', p_location := 'Park Slope', p_budget_cents := 7000,
  p_arrival_start_hour := 18::smallint, p_arrival_end_hour := 20::smallint
)).id as job1 \gset
select (public.create_job(
  p_title := 'I5 fix a door', p_description := 'probe row, rolled back',
  p_category := 'other', p_location := 'Park Slope', p_budget_cents := 6000,
  p_arrival_start_hour := 18::smallint, p_arrival_end_hour := 20::smallint
)).id as job2 \gset
select (public.create_job(
  p_title := 'I5 tomorrow''s shelf', p_description := 'probe row, rolled back',
  p_category := 'other', p_location := 'Park Slope', p_budget_cents := 5000,
  p_scheduled_date := :'tomorrow'::date,
  p_arrival_start_hour := 18::smallint, p_arrival_end_hour := 20::smallint
)).id as job3 \gset
insert into fx values ('job1', :'job1'), ('job2', :'job2'), ('job3', :'job3');

select tests.authenticate_as(:'worker');
select public.create_offer(p_amount_cents := 7000, p_job_id := :'job1', p_message := 'i5 bid') as offer1 \gset
select public.create_offer(p_amount_cents := 6000, p_job_id := :'job2', p_message := 'i5 bid two') as offer2 \gset
select public.create_offer(p_amount_cents := 5000, p_job_id := :'job3', p_message := 'i5 bid three') as offer3 \gset
select tests.authenticate_as(:'customer');
select public.accept_offer(:'offer1') as accepted1 \gset
select public.accept_offer(:'offer2') as accepted2 \gset
select public.accept_offer(:'offer3') as accepted3 \gset
select tests.authenticate_as(:'worker');
select (public.mark_worker_arrival(:'job2', 'arrived')).id as arrived2 \gset

-- ---------------------------------------------------------------------------
-- 1. The columns: nullable, and an allow-list on the minutes.
-- ---------------------------------------------------------------------------
select tests.clear_auth();
select col_is_null('public', 'jobs', 'late_minutes', '1a: jobs.late_minutes is nullable - no delay is the default');
select throws_ok(
  $$ update public.jobs set late_minutes = 15 where id = (select v from fx where k = 'job1') $$,
  '23514', null, '1b: the CHECK refuses a delay outside 10 / 20 / 30');

-- ---------------------------------------------------------------------------
-- 2. The hired worker, before arriving: the delay is written and returned.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'worker');
select is((public.report_running_late(:'job1', 20)).late_minutes, 20::smallint, '2a: report_running_late returns the job with late_minutes 20');
select tests.clear_auth();
select ok((select late_reported_at is not null from public.jobs where id = :'job1'), '2b: late_reported_at is stamped');

-- ---------------------------------------------------------------------------
-- 3. The customer is told, once, with the moved window.
-- ---------------------------------------------------------------------------
select is(
  (select title from public.notification_outbox where recipient_id = :'customer' and dedupe_key like 'job_running_late:' || :'job1' || ':20:%'),
  'Sam Worker is running 20 min late',
  '3a: the customer''s notification names the worker and the delay'
);
select is(
  (select body from public.notification_outbox where recipient_id = :'customer' and dedupe_key like 'job_running_late:' || :'job1' || ':20:%'),
  'I5 hang a mirror · now 6:20 PM–8:20 PM',
  '3b: its body moves the 6–8 PM window by twenty minutes'
);
select is(
  (select category from public.notification_outbox where recipient_id = :'customer' and dedupe_key like 'job_running_late:' || :'job1' || ':20:%'),
  'job_updates',
  '3c: under the customer''s own Job updates switch'
);

-- ---------------------------------------------------------------------------
-- 4. The latest tap wins; the same chip twice sends nothing new; a return to an earlier delay is
--    news again.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'worker');
select (public.report_running_late(:'job1', 20)).id as again20 \gset
select tests.clear_auth();
select is(
  (select count(*)::int from public.notification_outbox where recipient_id = :'customer' and dedupe_key like 'job_running_late:' || :'job1' || ':%'),
  1,
  '4a: the same delay again tells nobody twice'
);
select tests.authenticate_as(:'worker');
select (public.report_running_late(:'job1', 30)).id as then30 \gset
select (public.report_running_late(:'job1', 20)).id as back20 \gset
select tests.clear_auth();
select is((select late_minutes from public.jobs where id = :'job1'), 20::smallint, '4b: a later tap replaces the delay (not cumulative)');
select is(
  (select count(*)::int from public.notification_outbox where recipient_id = :'customer' and dedupe_key like 'job_running_late:' || :'job1' || ':%'),
  3,
  '4c: 20, then 30, then back to 20 - three reports, three pushes; the last one is never swallowed'
);

-- ---------------------------------------------------------------------------
-- 5, 6, 7. The refusals, each on the exact text raised.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'other');
select throws_ok(
  $$ select public.report_running_late((select v from fx where k = 'job1'), 10) $$,
  'P0001', 'Job not found or not assigned to caller', '5: a worker who was not hired is refused');
select tests.authenticate_as(:'worker');
select throws_ok(
  $$ select public.report_running_late((select v from fx where k = 'job2'), 10) $$,
  'P0001', 'Running late can only be said before you arrive', '6: after arriving it is refused');
select throws_ok(
  $$ select public.report_running_late((select v from fx where k = 'job1'), 15) $$,
  'P0001', 'Running late is 10, 20 or 30 minutes', '7: a delay outside the three chips is refused');

-- ---------------------------------------------------------------------------
-- 9. Tomorrow's job: the chips are for the day itself.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.report_running_late((select v from fx where k = 'job3'), 10) $$,
  'P0001', 'Running late is for the day of the job', '9a: a job scheduled for tomorrow is refused today');
select tests.clear_auth();
select is((select late_minutes from public.jobs where id = :'job3'), null::smallint, '9b: and nothing was written');

-- ---------------------------------------------------------------------------
-- 8. The ACL (CLAUDE.md section Supabase): authenticated may execute, anon may not.
-- ---------------------------------------------------------------------------
select tests.clear_auth();
select ok(has_function_privilege('authenticated', 'public.report_running_late(uuid, integer)', 'EXECUTE'), '8a: authenticated may execute report_running_late');
select ok(not has_function_privilege('anon', 'public.report_running_late(uuid, integer)', 'EXECUTE'), '8b: anon holds no EXECUTE on report_running_late');

select * from finish();
rollback;
