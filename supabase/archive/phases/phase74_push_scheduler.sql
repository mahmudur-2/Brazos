-- ============================================================================
-- phase74_push_scheduler.sql
--
-- Drains public.notification_outbox on a timer. Until now the outbox filled
-- automatically but emptied only on a manual send-push call.
--
-- pg_cron fires public.drain_notification_outbox() every minute; that function
-- reads the endpoint and the service_role key from Vault and hands them to
-- pg_net, which POSTs to the send-push Edge Function. send-push compares the
-- Authorization header against its own service_role key and 403s anything else,
-- so the key is not optional and cannot be replaced by a user token.
--
-- The secret never appears in this file, in cron.job.command, or in any log.
--
-- OPERATOR PREREQUISITES, done once in the dashboard before this file runs:
--   * Database > Extensions: enable pg_cron and pg_net.
--   * Two Vault secrets, created in the SQL Editor:
--       send_push_url          the project's /functions/v1/send-push endpoint
--       send_push_service_key  the project's service_role key
--     Neither value belongs in this file or in git.
--
-- APPLIED TO STAGING 2026-08-16, verified by net._http_response returning
-- status_code 200 with {"ok":true,...} and by four categories of push arriving
-- on a physical device.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Preconditions. Each raises and rolls the whole file back rather than
--    scheduling a job that can never succeed.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'phase74: pg_cron is not installed';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'phase74: pg_net is not installed';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'send_push_url') then
    raise exception 'phase74: vault secret send_push_url is missing';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'send_push_service_key') then
    raise exception 'phase74: vault secret send_push_service_key is missing';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The drain call. SECURITY DEFINER because only the owner may read Vault;
--    revoked from every client role because it holds the service_role key in a
--    local variable and triggers an outbound request.
-- ---------------------------------------------------------------------------
create or replace function public.drain_notification_outbox()
returns bigint
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_url        text;
  v_key        text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'send_push_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'send_push_service_key';

  if v_url is null or v_key is null then
    raise exception 'drain_notification_outbox: vault secrets missing';
  end if;

  select net.http_post(
    url                  := v_url,
    body                 := '{}'::jsonb,
    params               := '{}'::jsonb,
    headers              := jsonb_build_object(
                              'Content-Type',  'application/json',
                              'Authorization', 'Bearer ' || v_key
                            ),
    timeout_milliseconds := 30000
  ) into v_request_id;

  return v_request_id;
end;
$function$;

revoke all on function public.drain_notification_outbox() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The schedule. cron.schedule() upserts on job name, so re-running this
--    file replaces the job rather than creating a duplicate.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'brazos-drain-push',
  '* * * * *',
  $cron$select public.drain_notification_outbox();$cron$
);

-- ---------------------------------------------------------------------------
-- 4. Sentinel, created last, so verify-schema.mjs can prove this file
--    committed in full.
-- ---------------------------------------------------------------------------
create or replace function public.push_scheduler_enabled()
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$ select true $function$;

revoke all on function public.push_scheduler_enabled() from public, anon;
grant execute on function public.push_scheduler_enabled() to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- 5. Visible acceptance. The SQL Editor does not print RAISE NOTICE, so this
--    returns rows instead. Read them.
-- ---------------------------------------------------------------------------
select
  (select count(*)  from cron.job where jobname = 'brazos-drain-push')        as cron_job_count,
  (select schedule  from cron.job where jobname = 'brazos-drain-push')        as schedule,
  (select active    from cron.job where jobname = 'brazos-drain-push')        as job_active,
  (select count(*)  from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'drain_notification_outbox')   as drain_fn_exists,
  has_function_privilege('anon', 'public.drain_notification_outbox()', 'execute')
                                                                              as anon_can_execute;
