-- 331_schedules_loud.sql — ledger B7, first half (20261112000100_schedules_loud.sql): pg_cron and
-- pg_net are installed by a migration, every installer's timers are on cron.job, a skipped installer
-- is an error instead of a notice, schedule_health() names what is missing, and set_drain_secrets()
-- fills the four Vault names the drains read.
--
-- NO TIMER DEPENDENCE: nothing here reads cron.job_run_details or waits for a timer. The timers run
-- for real on this stack (pg_cron is on); every row this file adds or changes is in this
-- transaction, which the cron sessions cannot see, and everything rolls back.
--
-- FIXTURE SURGERY, DECLARED: §6 replaces public.pg_function_present inside a plpgsql block whose
-- exception handler undoes it, to show what install_schedules() does when an installer skips; the
-- next assertion proves the real probe is back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(35);

-- ---------------------------------------------------------------------------
-- §1. The extensions come from a migration.
-- ---------------------------------------------------------------------------
select ok(exists (select 1 from pg_extension where extname = 'pg_cron'),
  'B7: pg_cron is installed');
select ok(exists (select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
                   where e.extname = 'pg_net' and n.nspname = 'extensions'),
  'B7: pg_net is installed, in schema extensions');

-- ---------------------------------------------------------------------------
-- §2. The four new functions: service_role only.
-- ---------------------------------------------------------------------------
select ok(has_function_privilege('service_role', 'public.expected_schedules()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.expected_schedules()', 'EXECUTE')
          and not has_function_privilege('anon', 'public.expected_schedules()', 'EXECUTE'),
  'B7: expected_schedules() is service_role only');
select ok(has_function_privilege('service_role', 'public.schedule_health()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.schedule_health()', 'EXECUTE')
          and not has_function_privilege('anon', 'public.schedule_health()', 'EXECUTE'),
  'B7: schedule_health() is service_role only');
select ok(has_function_privilege('service_role', 'public.install_schedules()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.install_schedules()', 'EXECUTE')
          and not has_function_privilege('anon', 'public.install_schedules()', 'EXECUTE'),
  'B7: install_schedules() is service_role only');
select ok(has_function_privilege('service_role', 'public.set_drain_secrets(text, text)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.set_drain_secrets(text, text)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.set_drain_secrets(text, text)', 'EXECUTE'),
  'B7: set_drain_secrets(text, text) is service_role only');

-- ---------------------------------------------------------------------------
-- §3. The expected list: complete, and every timer calls something real.
-- ---------------------------------------------------------------------------
select is(
  (select string_agg(jobname, ', ' order by jobname) from public.expected_schedules()
    where jobname in ('auto-release-due-payments', 'expire-unfunded-payments', 'brazos-process-settlements',
                      'brazos-tomorrow-reminders', 'brazos-job-series', 'brazos-send-receipts',
                      'brazos-prune-payment-events', 'brazos-drain-push', 'close-unpaid-hires',
                      'expire-open-jobs', 'close-no-show-hires')),
  'auto-release-due-payments, brazos-drain-push, brazos-job-series, brazos-process-settlements, brazos-prune-payment-events, brazos-send-receipts, brazos-tomorrow-reminders, close-no-show-hires, close-unpaid-hires, expire-open-jobs, expire-unfunded-payments',
  'B7: the eleven timers of today are all expected');
select is(
  (select string_agg(p.proname::text, ', ' order by p.proname)
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname like 'install\_%' and p.proname <> 'install_schedules'),
  (select string_agg(distinct installer, ', ' order by installer) from public.expected_schedules()),
  'B7: every installer in public is listed in expected_schedules(), and every listed installer exists — a new installer that is not listed fails here');
select is(
  (select count(*) from public.expected_schedules()),
  (select count(distinct jobname) from public.expected_schedules()),
  'B7: no timer name is listed twice');
select is(
  (select count(*) from public.expected_schedules() e
    where not exists (select 1 from pg_proc p
                       where p.pronamespace = 'public'::regnamespace
                         and e.command = 'select public.' || p.proname || '();'
                         and p.pronargs = p.pronargdefaults)),
  0::bigint,
  'B7: every expected command is a bare call to a public function that exists and needs no argument');

-- ---------------------------------------------------------------------------
-- §4. cron.job is exactly the list, and install_schedules() is idempotent.
-- ---------------------------------------------------------------------------
select is(
  (select string_agg(j.jobname || ' | ' || j.schedule || ' | ' || j.command || ' | ' || j.active::text, E'\n' order by j.jobname)
     from cron.job j),
  (select string_agg(e.jobname || ' | ' || e.schedule || ' | ' || e.command || ' | true', E'\n' order by e.jobname)
     from public.expected_schedules() e),
  'B7: after a reset, cron.job holds exactly the expected timers (name, schedule, command), each active');
select is(public.install_schedules(), 'scheduled: ' || (select count(*) from public.expected_schedules())::text,
  'B7: install_schedules() runs every installer and reports the count');
select is(
  (select string_agg(j.jobname || ' | ' || j.schedule || ' | ' || j.command || ' | ' || j.active::text, E'\n' order by j.jobname)
     from cron.job j),
  (select string_agg(e.jobname || ' | ' || e.schedule || ' | ' || e.command || ' | true', E'\n' order by e.jobname)
     from public.expected_schedules() e),
  'B7: … and a second install replaces, never adds: cron.job is still exactly the list');

-- ---------------------------------------------------------------------------
-- §5. schedule_health(): names only, and quiet when all is well.
-- ---------------------------------------------------------------------------
select is(
  (select string_agg(k, ',' order by k) from jsonb_object_keys(public.schedule_health()) k),
  'missing,timers,unexpected,vault_missing',
  'B7: schedule_health() answers timers, missing, unexpected and vault_missing');
select is(public.schedule_health() -> 'missing', '[]'::jsonb, 'B7: no expected timer is missing');
select is(public.schedule_health() -> 'unexpected', '[]'::jsonb, 'B7: no timer runs that nobody expects');
select is(jsonb_array_length(public.schedule_health() -> 'timers'), (select count(*)::int from public.expected_schedules()),
  'B7: one timers entry per timer');

-- ---------------------------------------------------------------------------
-- §6. The alarms: a lost, changed or paused timer is named; a stranger is named; a skip raises.
-- ---------------------------------------------------------------------------
select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'brazos-drain-push';
select cron.alter_job(j.jobid, schedule := '*/2 * * * *') from cron.job j where j.jobname = 'expire-open-jobs';
select cron.alter_job(j.jobid, active := false) from cron.job j where j.jobname = 'brazos-send-receipts';
select is(public.schedule_health() -> 'missing', '["brazos-drain-push", "brazos-send-receipts", "expire-open-jobs"]'::jsonb,
  'B7 alarm: a removed, a rescheduled and a paused timer are each named as missing');
select cron.schedule('brazos-probe-timer', '*/30 * * * *', 'select 1;');
select is(public.schedule_health() -> 'unexpected', '["brazos-probe-timer"]'::jsonb,
  'B7 alarm: a timer nobody expects is named');
select is(public.install_schedules(), 'scheduled: ' || (select count(*) from public.expected_schedules())::text,
  'B7: install_schedules() repairs them');
select is(public.schedule_health() -> 'missing', '[]'::jsonb, 'B7: … and nothing is missing afterwards');

create function tests.b7_skip_outcome() returns text language plpgsql as $f$
begin
  begin
    create or replace function public.pg_function_present(p_namespace text, p_name text)
      returns boolean language sql stable set search_path = pg_catalog, pg_temp as $g$ select false $g$;
    perform public.install_schedules();
    return 'no error';
  exception when others then
    return sqlstate || ': ' || sqlerrm;
  end;
end $f$;
select is(tests.b7_skip_outcome(),
  'P0001: install_schedules: install_lifecycle_schedules() returned "skipped: pg_cron absent"',
  'B7 alarm: an installer that skips makes install_schedules() raise, naming it — never a quiet notice');
select ok(public.pg_function_present('cron', 'schedule'), 'B7: the real probe is back after the fake was rolled back');

-- ---------------------------------------------------------------------------
-- §7. The Vault names the drains read.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('role', 'service_role', true);
select is(public.schedule_health() -> 'vault_missing',
  '["process_settlements_service_key", "process_settlements_url", "send_push_service_key", "send_push_url"]'::jsonb,
  'B7: service — on a fresh reset all four Vault names are missing, and they are named');
select lives_ok($$ select public.set_drain_secrets('https://example.test/functions/v1/', 'test-service-key-not-real') $$,
  'B7: service — set_drain_secrets() runs as the service role');
select is(public.schedule_health() -> 'vault_missing', '[]'::jsonb, 'B7: service — and then none is missing');
select set_config('role', 'none', true);

select is(
  (select string_agg(name || '=' || decrypted_secret, ' ' order by name) from vault.decrypted_secrets
    where name in ('send_push_url', 'process_settlements_url')),
  'process_settlements_url=https://example.test/functions/v1/process-settlements send_push_url=https://example.test/functions/v1/send-push',
  'B7: runner — the two URLs are built from the base, without its trailing slash');
select ok(
  (select count(*) = 2 and bool_and(decrypted_secret = 'test-service-key-not-real') from vault.decrypted_secrets
    where name in ('send_push_service_key', 'process_settlements_service_key')),
  'B7: runner — the key is stored under both key names');

select set_config('role', 'service_role', true);
select public.set_drain_secrets('http://127.0.0.1:54321/functions/v1', 'second-test-key-not-real');
select set_config('role', 'none', true);
select is(
  (select count(*) from vault.secrets
    where name in ('send_push_url', 'send_push_service_key', 'process_settlements_url', 'process_settlements_service_key')),
  4::bigint,
  'B7: runner — a second call updates the four secrets, it does not add more');
select ok(
  (select bool_and(case when name like '%_url' then decrypted_secret like 'http://127.0.0.1:54321/functions/v1/%'
                        else decrypted_secret = 'second-test-key-not-real' end)
     from vault.decrypted_secrets
    where name in ('send_push_url', 'send_push_service_key', 'process_settlements_url', 'process_settlements_service_key')),
  'B7: runner — … with the new values');

select set_config('role', 'service_role', true);
select throws_ok($$ select public.set_drain_secrets('ftp://example.test/functions/v1', 'test-service-key-not-real') $$,
  'P0001', 'set_drain_secrets: the functions base URL must start with http:// or https://',
  'B7: service — a base URL that is not http(s) is refused');
select throws_ok($$ select public.set_drain_secrets('https://example.test/functions/v1', '') $$,
  'P0001', 'set_drain_secrets: the service key is empty',
  'B7: service — an empty key is refused');
select throws_ok($$ select public.set_drain_secrets('https://example.test/functions/v1', null) $$,
  'P0001', 'set_drain_secrets: the service key is empty',
  'B7: service — a null key is refused');
select set_config('role', 'none', true);

select ok(
  (select p.prorettype = 'void'::regtype
          and p.prosrc !~* 'raise\s+(notice|log|info|warning|debug)'
          and p.prosrc !~* 'p_service_key\s*\|\|'
     from pg_proc p where p.oid = 'public.set_drain_secrets(text, text)'::regprocedure),
  'B7: set_drain_secrets() returns nothing, logs nothing, and never puts the key into a message');
select ok(
  (select p.prosrc !~* 'decrypted_secret' from pg_proc p where p.oid = 'public.schedule_health()'::regprocedure),
  'B7: schedule_health() never reads a secret value, only the names');

select * from finish();
rollback;
