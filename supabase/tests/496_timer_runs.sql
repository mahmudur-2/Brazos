-- 496_timer_runs.sql — the lifecycle timers report their own runs (production-36h S4, TIMERS):
-- auto_release_due_payments (release_clock), close_unpaid_hires (unpaid_pause) and
-- advance_job_series (post_window), each run by its pg_cron job directly, end every run with
-- report_timer_run(<the cron job's name>, <four times the job's interval>) (release_clock 5b, A7-06),
-- which calls record_timer_run(<name>, no error, <interval>) (attention_plain) in its own block, so
-- a timer that stopped becomes a timer_late line on payment_attention and an ordinary error of the
-- report never undoes the run (490, 491 and 494 each prove that on their own working run: A7-06
-- CONTROL); a statement timeout or a cancel during the report still does (A12-05, not tested here).
-- The runs that do real work (a release, a close, a series moved) report too: 490, 491 and 494
-- each prove it on their own working run.
--
-- THE CAST: the runner (postgres, the role the cron jobs run as, and the owner of every function
-- here) and service_role (the sweeps' only caller grant). Everything rolls back.
--
-- FIXTURE SURGERY, DECLARED (each line carries -- SURGERY):
--   * timer_runs.ok_at is moved back a day before each run (tests.tr_age), so only the run under
--     test can set it to this transaction's now();
--   * app_config.updated_at of paymentsEnabled is set 30 days back (§2: on, changed long ago).
-- LOCK ORDER: each switch row (paymentsEnabled, postingEnabled) is written BEFORE this file first
-- touches the timer row of the sweep that share-locks it, so a run of the real local timer can
-- never hold that switch while waiting for this transaction's timer row.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(14);

-- One timer's row: written by this transaction / late after / not failing.
create or replace function tests.tr_row(p_name text) returns text language sql as $$
  select coalesce((select (r.ok_at = now())::text || '/' || r.stale_after::text || '/' || (r.failing_since is null)::text
                     from public.timer_runs r where r.name = p_name), '<none>')
$$;
create or replace function tests.tr_age(p_name text) returns void language sql as $$
  update public.timer_runs set ok_at = now() - interval '1 day' where name = p_name   -- SURGERY
$$;
-- Every "return" of a sweep comes right after its report.
create or replace function tests.tr_each_return_reports(p_fn regprocedure, p_call text) returns boolean language sql as $$
  select (select count(*) from regexp_matches(p.prosrc, '\mreturn\M', 'g')) > 0
         and (select count(*) from regexp_matches(p.prosrc, '\mreturn\M', 'g'))
           = (select count(*) from regexp_matches(p.prosrc, 'perform public\.report_timer_run\(' || p_call || '\);[^\n]*\n\s*return\M', 'g'))
    from pg_proc p where p.oid = p_fn
$$;

select (((now() at time zone 'America/New_York')::date + time '12:00') at time zone 'America/New_York') as noon \gset
select (((now() at time zone 'America/New_York')::date + time '03:00') at time zone 'America/New_York') as night \gset

-- ---------------------------------------------------------------------------
-- §0. THE CATALOG: the cron job's own name, four times its interval, at every way out.
-- ---------------------------------------------------------------------------
select is((select string_agg(e.jobname || ' ' || e.schedule || ' ' || e.command, ' | ' order by e.jobname)
             from public.expected_schedules() e
            where e.jobname in ('auto-release-due-payments', 'close-unpaid-hires', 'brazos-job-series')),
  'auto-release-due-payments */10 * * * * select public.auto_release_due_payments(); | '
  || 'brazos-job-series 17 * * * * select public.advance_job_series(); | '
  || 'close-unpaid-hires */15 * * * * select public.close_unpaid_hires();',
  '0: the three names are the cron jobs'' own, every 10 minutes, hourly and every 15 minutes (so 40 minutes, 4 hours, 60 minutes)');
select ok(tests.tr_each_return_reports('public.auto_release_due_payments()'::regprocedure,
                                       '''auto-release-due-payments'', interval ''40 minutes''')
          and position('record_timer_run' in (select prosrc from pg_proc where oid = 'public.auto_release_due_payments()'::regprocedure)) = 0,
  '0: auto_release_due_payments reports its run as the statement before its return, through report_timer_run only');
select ok(tests.tr_each_return_reports('public.close_unpaid_hires(timestamptz)'::regprocedure,
                                       '''close-unpaid-hires'', interval ''60 minutes''')
          and (select (select count(*) from regexp_matches(p.prosrc, 'report_timer_run', 'g')) = 3
                      and position('record_timer_run' in p.prosrc) = 0
                 from pg_proc p where p.oid = 'public.close_unpaid_hires(timestamptz)'::regprocedure),
  '0: close_unpaid_hires reports before each of its three returns (paused, the 24 hours, a run), through report_timer_run only');
select ok(tests.tr_each_return_reports('public.advance_job_series(timestamptz)'::regprocedure,
                                       '''brazos-job-series'', interval ''4 hours''')
          and (select (select count(*) from regexp_matches(p.prosrc, 'report_timer_run', 'g')) = 3
                      and position('record_timer_run' in p.prosrc) = 0
                 from pg_proc p where p.oid = 'public.advance_job_series(timestamptz)'::regprocedure),
  '0: advance_job_series reports before each of its three returns (night, posting paused, a run), through report_timer_run only');
select ok((select bool_and(p.prosecdef and p.proowner = r.proowner)
             from pg_proc p, pg_proc r
            where r.oid = 'public.record_timer_run(text,text,interval)'::regprocedure
              and p.oid in ('public.auto_release_due_payments()'::regprocedure,
                            'public.close_unpaid_hires(timestamptz)'::regprocedure,
                            'public.advance_job_series(timestamptz)'::regprocedure))
          and not has_function_privilege('authenticated', 'public.record_timer_run(text,text,interval)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.record_timer_run(text,text,interval)', 'EXECUTE'),
  '0: each sweep is SECURITY DEFINER with record_timer_run''s owner, so it reports with no new grant (none added)');
select ok((select not p.prosecdef and p.proowner = r.proowner
             from pg_proc p, pg_proc r
            where p.oid = 'public.report_timer_run(text,interval)'::regprocedure
              and r.oid = 'public.record_timer_run(text,text,interval)'::regprocedure)
          and not has_function_privilege('authenticated', 'public.report_timer_run(text,interval)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.report_timer_run(text,interval)', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.report_timer_run(text,interval)', 'EXECUTE'),
  '0: A7-06: report_timer_run runs as its caller, has record_timer_run''s owner and no client grant (owner only)');

-- ---------------------------------------------------------------------------
-- §1. auto_release_due_payments: a run with nothing due reports; so does one called as service_role.
-- ---------------------------------------------------------------------------
select tests.tr_age('auto-release-due-payments');
select public.auto_release_due_payments();
select is(tests.tr_row('auto-release-due-payments'), 'true/00:40:00/true',
  '1: a run reports itself, late after 40 minutes');
select tests.tr_age('auto-release-due-payments');
set local role service_role;
select public.auto_release_due_payments();
reset role;
select is(tests.tr_row('auto-release-due-payments'), 'true/00:40:00/true',
  '1: … also when service_role calls it (the sweep runs as its owner)');

-- ---------------------------------------------------------------------------
-- §2. close_unpaid_hires: a run, a paused run and a run in the 24 hours each report.
-- ---------------------------------------------------------------------------
update public.app_config set updated_at = now() - interval '30 days' where key = 'paymentsEnabled';   -- SURGERY
select tests.tr_age('close-unpaid-hires');
select public.close_unpaid_hires();
select is(tests.tr_row('close-unpaid-hires'), 'true/01:00:00/true',
  '2: a run reports itself, late after 60 minutes');
update public.app_config set value = 'false'::jsonb where key = 'paymentsEnabled';
select tests.tr_age('close-unpaid-hires');
select public.close_unpaid_hires();
select is(tests.tr_row('close-unpaid-hires'), 'true/01:00:00/true',
  '2: a run while payments are paused reports too (the timer works; it waits)');
update public.app_config set value = 'true'::jsonb where key = 'paymentsEnabled';
select tests.tr_age('close-unpaid-hires');
select public.close_unpaid_hires();
select is(tests.tr_row('close-unpaid-hires'), 'true/01:00:00/true',
  '2: a run in the 24 hours after payments come back reports too');

-- ---------------------------------------------------------------------------
-- §3. advance_job_series: a night run, a paused run and a daytime run each report.
-- ---------------------------------------------------------------------------
update public.app_config set value = 'true'::jsonb where key = 'postingEnabled';
select tests.tr_age('brazos-job-series');
select public.advance_job_series(:'night'::timestamptz);
select is(tests.tr_row('brazos-job-series'), 'true/04:00:00/true',
  '3: a night run (3 am, nothing to do) reports itself, late after 4 hours');
update public.app_config set value = 'false'::jsonb where key = 'postingEnabled';
select tests.tr_age('brazos-job-series');
select public.advance_job_series(:'noon'::timestamptz);
select is(tests.tr_row('brazos-job-series'), 'true/04:00:00/true',
  '3: a run while posting is paused reports too');
update public.app_config set value = 'true'::jsonb where key = 'postingEnabled';
select tests.tr_age('brazos-job-series');
select public.advance_job_series(:'noon'::timestamptz);
select is(tests.tr_row('brazos-job-series'), 'true/04:00:00/true',
  '3: a daytime run reports itself');

select * from finish();
rollback;
