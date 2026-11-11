-- 20261112000100_schedules_loud.sql — ledger B7, first half (docs/critical/production-path.md, B1).
--
-- Seven installers put eleven timers on pg_cron, and each returned 'skipped: pg_cron absent' when
-- the extension was missing. No migration created pg_cron or pg_net, so a database built from the
-- files had no timer at all and nothing said so. This file:
--
--   1. creates pg_cron and pg_net. No guard: if they cannot be created the file fails, which is the
--      point. (pg_net in schema extensions, as Supabase advises; pg_cron's schema is the platform's.)
--   2. expected_schedules(): the one list of every timer — installer, name, schedule, command.
--   3. install_schedules(): runs every listed installer, raises when one skips, and raises when a
--      listed timer is still missing afterwards. Called once at the end of this file.
--   4. schedule_health(): per timer its name, schedule, active flag and last run; which expected
--      timers are missing; which timers nobody expects; which Vault names the drains read are
--      absent. Names only, never a secret value.
--   5. set_drain_secrets(base url, service key): writes the four Vault secrets the drains read.
--
-- A LATER TIMER: a migration that adds an installer replaces expected_schedules() with the newest
-- list plus its rows, and ends with `select public.install_schedules();`.
-- supabase/tests/331_schedules_loud.sql fails if an install_* function is not listed, or if
-- cron.job and the list differ.
--
-- Safe where pg_cron, pg_net and the timers already exist (each installer unschedules its own names
-- by jobid first). Timers created by hand under other names are left alone and reported as
-- unexpected by schedule_health().

begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- 2. The list.
-- ---------------------------------------------------------------------------
create or replace function public.expected_schedules()
returns table (installer text, jobname text, schedule text, command text)
language sql immutable
set search_path = public, pg_temp
as $fn$
  values
    ('install_settlement_schedules', 'auto-release-due-payments',   '*/10 * * * *', 'select public.auto_release_due_payments();'),
    ('install_settlement_schedules', 'expire-unfunded-payments',    '*/15 * * * *', 'select public.expire_unfunded_payments();'),
    ('install_settlement_schedules', 'brazos-process-settlements',  '*/5 * * * *',  'select public.drain_settlements();'),
    ('install_reminder_schedule',    'brazos-tomorrow-reminders',   '0 22 * * *',   'select public.enqueue_tomorrow_reminders();'),
    ('install_series_schedule',      'brazos-job-series',           '17 * * * *',   'select public.advance_job_series();'),
    ('install_receipt_schedule',     'brazos-send-receipts',        '*/5 * * * *',  'select public.drain_receipts();'),
    ('install_payment_events_prune', 'brazos-prune-payment-events', '30 3 * * *',   'select public.prune_payment_event_payloads();'),
    ('install_push_schedule',        'brazos-drain-push',           '* * * * *',    'select public.drain_notification_outbox();'),
    ('install_lifecycle_schedules',  'close-unpaid-hires',          '*/15 * * * *', 'select public.close_unpaid_hires();'),
    ('install_lifecycle_schedules',  'expire-open-jobs',            '7 * * * *',    'select public.expire_open_jobs();'),
    ('install_lifecycle_schedules',  'close-no-show-hires',         '7 * * * *',    'select public.close_no_show_hires();')
$fn$;
revoke all on function public.expected_schedules() from public, anon, authenticated;
grant execute on function public.expected_schedules() to service_role;
comment on function public.expected_schedules() is
  'B7: every pg_cron timer the migrations install — installer, name, schedule, command. A migration that adds a timer replaces this list (newest rows plus its own) and ends with select public.install_schedules(). 331_schedules_loud.sql fails when an install_* function is not listed or cron.job differs. service_role only.';

-- ---------------------------------------------------------------------------
-- 4. Health. Defined before install_schedules(), which reads it.
-- ---------------------------------------------------------------------------
create or replace function public.schedule_health()
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'timers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'jobname', j.jobname,
               'schedule', j.schedule,
               'active', j.active,
               'last_status', r.status,
               'last_start', r.start_time)
             order by j.jobname)
        from cron.job j
        left join lateral (
          select d.status, d.start_time
            from cron.job_run_details d
           where d.jobid = j.jobid
           order by d.start_time desc nulls last
           limit 1
        ) r on true), '[]'::jsonb),
    'missing', coalesce((
      select jsonb_agg(e.jobname order by e.jobname)
        from public.expected_schedules() e
       where not exists (select 1 from cron.job j
                          where j.jobname = e.jobname and j.schedule = e.schedule
                            and j.command = e.command and j.active)), '[]'::jsonb),
    'unexpected', coalesce((
      select jsonb_agg(j.jobname order by j.jobname)
        from cron.job j
       where not exists (select 1 from public.expected_schedules() e where e.jobname = j.jobname)), '[]'::jsonb),
    'vault_missing', coalesce((
      select jsonb_agg(n.name order by n.name)
        from unnest(array['send_push_url', 'send_push_service_key',
                          'process_settlements_url', 'process_settlements_service_key']) as n(name)
       where not exists (select 1 from vault.secrets s where s.name = n.name)), '[]'::jsonb)
  )
$fn$;
revoke all on function public.schedule_health() from public, anon, authenticated;
grant execute on function public.schedule_health() to service_role;
comment on function public.schedule_health() is
  'B7: timers (name, schedule, active, last run status and start), missing (expected timers with no active cron.job row of the same name, schedule and command), unexpected (cron.job names nobody lists), vault_missing (which of the four Vault names the drains read are absent). Names only, never a secret value. service_role only.';

-- ---------------------------------------------------------------------------
-- 3. Install, loudly.
-- ---------------------------------------------------------------------------
create or replace function public.install_schedules()
returns text
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_installer text;
  v_result    text;
  v_missing   jsonb;
begin
  for v_installer in select distinct e.installer from public.expected_schedules() e order by 1
  loop
    execute format('select public.%I()', v_installer) into v_result;
    if v_result is null or v_result like 'skipped%' then
      raise exception 'install_schedules: %() returned "%"', v_installer, coalesce(v_result, 'null');
    end if;
  end loop;

  v_missing := public.schedule_health() -> 'missing';
  if jsonb_array_length(v_missing) > 0 then
    raise exception 'install_schedules: timers missing after install: %', v_missing::text;
  end if;

  return 'scheduled: ' || (select count(*) from public.expected_schedules())::text;
end
$fn$;
revoke all on function public.install_schedules() from public, anon, authenticated;
grant execute on function public.install_schedules() to service_role;
comment on function public.install_schedules() is
  'B7: runs every installer listed in expected_schedules(); raises when one skips or returns nothing, and when a listed timer is still missing afterwards. Returns scheduled: <count>. service_role only.';

-- ---------------------------------------------------------------------------
-- 5. The drains' Vault secrets.
-- ---------------------------------------------------------------------------
create or replace function public.set_drain_secrets(p_functions_base_url text, p_service_key text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_base  text := rtrim(coalesce(p_functions_base_url, ''), '/');
  v_names text[] := array['send_push_url', 'send_push_service_key',
                          'process_settlements_url', 'process_settlements_service_key'];
  v_values text[];
  v_id    uuid;
begin
  if v_base !~* '^https?://' then
    raise exception 'set_drain_secrets: the functions base URL must start with http:// or https://';
  end if;
  -- Not empty is the only check: a legacy JWT and a new sb_secret_ key are both accepted.
  if coalesce(p_service_key, '') = '' then
    raise exception 'set_drain_secrets: the service key is empty';
  end if;

  v_values := array[v_base || '/send-push', p_service_key,
                    v_base || '/process-settlements', p_service_key];

  for i in 1 .. array_length(v_names, 1)
  loop
    select s.id into v_id from vault.secrets s where s.name = v_names[i];
    if v_id is null then
      perform vault.create_secret(v_values[i], v_names[i]);
    else
      perform vault.update_secret(v_id, v_values[i]);
    end if;
  end loop;
end
$fn$;
revoke all on function public.set_drain_secrets(text, text) from public, anon, authenticated;
grant execute on function public.set_drain_secrets(text, text) to service_role;
comment on function public.set_drain_secrets(text, text) is
  'B7: writes the four Vault secrets the drains read — send_push_url and process_settlements_url built from the functions base URL, and the service key under send_push_service_key and process_settlements_service_key. Creates or updates; returns nothing and never logs a value. service_role only.';

select public.install_schedules();

commit;
