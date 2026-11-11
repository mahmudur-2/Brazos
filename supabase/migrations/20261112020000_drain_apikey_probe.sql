-- 20261112020000_drain_apikey_probe.sql — lean K1: the timers' calls carry the server key the way a
-- project on the new keys reads it, and one probe proves the timer path end to end.
--
--   1. The three drains send the stored server key on apikey as well as Authorization: Bearer. A
--      new secret key (sb_secret_) is not a JWT; the gateway reads apikey, and the functions' own
--      check (requireServiceRole, supabase/functions/_shared/serviceAuth.ts) accepts the key on
--      either header. Each body is otherwise verbatim from its newest definition (the baseline;
--      20260910000000_settlement_schedules.sql; 20260930001100_receipts.sql), messages unchanged.
--   2. drain_receipts() is split so the probe can make a real call when no receipt waits:
--      drain_receipts_post() is the call (today's body after the nothing-waiting check), and
--      drain_receipts() keeps the check and calls it. Same name, same answers.
--   3. drain_probe(): one real call to each of the three functions, made by the database with the
--      stored URL and key, exactly as the timers make them (so it does one tick's real work); it
--      returns the three pg_net request ids. pg_net sends after the probe's transaction commits.
--      drain_probe_status(probe): for each, the HTTP status from net._http_response — the code,
--      0 when no HTTP answer came (an error or a timeout), null while it is still waiting. Status
--      only: never a body, a header or a key. Both service_role only.
--
-- ACLs restated for every function this file replaces or adds, never left to default privileges (a
-- new cloud project gives the API roles EXECUTE on a new function). drain_notification_outbox() is
-- owner-only, as staging's baseline left it (no grant there): cron runs it as its owner and
-- drain_probe() calls it as definer, so no role needs it and none keeps it. drain_receipts_post()
-- is owner-only for the same reason.

begin;

-- ---------------------------------------------------------------------------
-- 1. The drains, with apikey.
-- ---------------------------------------------------------------------------
create or replace function public.drain_notification_outbox() returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
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
                              'apikey',        v_key,
                              'Authorization', 'Bearer ' || v_key
                            ),
    timeout_milliseconds := 30000
  ) into v_request_id;

  return v_request_id;
end;
$$;
revoke all on function public.drain_notification_outbox() from public, anon, authenticated, service_role;
comment on function public.drain_notification_outbox() is
  'Owner only (cron runs it; drain_probe() calls it as definer): POSTs the send-push edge function, its URL and server key from the Vault (send_push_url / send_push_service_key), the key on apikey and as a Bearer token (lean K1). Raises drain_notification_outbox: vault secrets missing rather than POSTing to a null URL.';

create or replace function public.drain_settlements() returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_url        text;
  v_key        text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'process_settlements_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'process_settlements_service_key';

  if v_url is null or v_key is null then
    raise exception 'drain_settlements: vault secrets missing';
  end if;

  select net.http_post(
    url                  := v_url,
    body                 := '{}'::jsonb,
    params               := '{}'::jsonb,
    headers              := jsonb_build_object(
                              'Content-Type',  'application/json',
                              'apikey',        v_key,
                              'Authorization', 'Bearer ' || v_key
                            ),
    timeout_milliseconds := 30000
  ) into v_request_id;

  return v_request_id;
end;
$$;
revoke all on function public.drain_settlements() from public, anon, authenticated;
grant execute on function public.drain_settlements() to service_role;
comment on function public.drain_settlements() is
  'service_role only: POSTs the process-settlements edge function, reading its URL and server key from the Vault (process_settlements_url / process_settlements_service_key), the key on apikey and as a Bearer token (lean K1). The secret stays out of cron.job.command, which any reader of that table can see — that is the whole reason for the indirection. Raises drain_settlements: vault secrets missing rather than POSTing to a null URL.';

create or replace function public.drain_receipts_post() returns bigint
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_url        text;
  v_key        text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'send_receipts_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'send_receipts_service_key';
  -- Each falls back on its own: the same project's settlement function — its address with this
  -- function's name, and the service key every function checks against. No new secret needed.
  if v_url is null then
    select replace(decrypted_secret, '/process-settlements', '/send-receipts') into v_url
      from vault.decrypted_secrets where name = 'process_settlements_url';
  end if;
  if v_key is null then
    select decrypted_secret into v_key
      from vault.decrypted_secrets where name = 'process_settlements_service_key';
  end if;
  if v_url is null or v_key is null or v_url not like '%/send-receipts%' then
    raise exception 'drain_receipts: vault secrets missing';
  end if;

  select net.http_post(
    url                  := v_url,
    body                 := '{}'::jsonb,
    params               := '{}'::jsonb,
    headers              := jsonb_build_object(
                              'Content-Type',  'application/json',
                              'apikey',        v_key,
                              'Authorization', 'Bearer ' || v_key
                            ),
    timeout_milliseconds := 30000
  ) into v_request_id;

  return v_request_id;
end;
$$;
revoke all on function public.drain_receipts_post() from public, anon, authenticated, service_role;
comment on function public.drain_receipts_post() is
  'Owner only, called by drain_receipts() and drain_probe(): POSTs the send-receipts edge function — its URL and key from the Vault (send_receipts_url / send_receipts_service_key, else the settlement function''s entries with this function''s name), the key on apikey and as a Bearer token (lean K1). Raises drain_receipts: vault secrets missing rather than POSTing to a null URL.';

create or replace function public.drain_receipts() returns bigint
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  -- Nothing waiting: the function is not woken at all.
  if not exists (
    select 1 from public.receipt_outbox
    where status = 'pending' and attempts < 5 and (next_attempt_at is null or next_attempt_at <= now())
  ) then
    return null;
  end if;

  return public.drain_receipts_post();
end;
$$;
revoke all on function public.drain_receipts() from public, anon, authenticated;
grant execute on function public.drain_receipts() to service_role;
comment on function public.drain_receipts() is
  'Idea 8, service_role only: when a receipt waits, wakes the send-receipts edge function through drain_receipts_post(); null when none waits.';

-- ---------------------------------------------------------------------------
-- 2. The probe.
-- ---------------------------------------------------------------------------
create or replace function public.drain_probe() returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  return jsonb_build_object(
    'send_push',           public.drain_notification_outbox(),
    'process_settlements', public.drain_settlements(),
    'send_receipts',       public.drain_receipts_post()
  );
end;
$$;
revoke all on function public.drain_probe() from public, anon, authenticated;
grant execute on function public.drain_probe() to service_role;
comment on function public.drain_probe() is
  'lean K1, service_role only: one real call to send-push, process-settlements and send-receipts, made by the database with the URL and key the timers read from the Vault (so it does one tick''s real work). Returns {send_push, process_settlements, send_receipts} as pg_net request ids; pg_net sends after this transaction commits. Raises the drain''s own "vault secrets missing" when a secret is absent. Read the answers with drain_probe_status().';

create or replace function public.drain_probe_status(p_probe jsonb) returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_object_agg(n.name,
           case when r.id is null then null
                when r.status_code is null or r.timed_out then to_jsonb(0)
                else to_jsonb(r.status_code) end)
    from unnest(array['send_push', 'process_settlements', 'send_receipts']) as n(name)
    left join net._http_response r
      on r.id = case when (p_probe ->> n.name) ~ '^[0-9]{1,18}$' then (p_probe ->> n.name)::bigint end
$$;
revoke all on function public.drain_probe_status(jsonb) from public, anon, authenticated;
grant execute on function public.drain_probe_status(jsonb) to service_role;
comment on function public.drain_probe_status(jsonb) is
  'lean K1, service_role only: for the request ids drain_probe() returned, {send_push, process_settlements, send_receipts} as the HTTP status each call got — the code, 0 when no HTTP answer came (an error or a timeout), null while still waiting. Reads net._http_response for status_code and timed_out only: never a body, a header or a key.';

commit;
