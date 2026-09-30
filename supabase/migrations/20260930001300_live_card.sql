-- 20260930001300_live_card.sql — idea 9, "the lock-screen live card": the worker's stage taps (On my
-- way, Arrived, Started, Finished) and the arrival time on the customer's lock screen.
--
-- THE DECISION: docs/DECISIONS.md 2026-09-30 entry (4) (9), and the build run's brief
-- (docs/dispatch/BUILD-RUN.md §1, "9."): a Live Activities add-on (approved) behind a presence check,
-- so an over-the-air update can never crash a binary without it; live updates by push need Apple's
-- push key on staging, which only the operator can place — until then that path is off. The Dynamic
-- Island scene stays dropped.
--
-- THE VERSION: 20260930001200_hire_from_push.sql is the newest before it, so this takes 001300. The
-- pgTAP file is supabase/tests/210_live_card.sql.
--
-- WHAT THIS FILE DOES, in one transaction:
--   (1) live_card_state(p_job_id) returns jsonb — THE ONE PLACE the card's words are decided, for the
--       app (which draws the card while it is open) and for the push path alike: the stage from the
--       worker's own declarations (en_route_at, arrived_at) and the status transition_job_status()
--       moved (in_progress, completed); the title ("Sam is on the way", "Sam has arrived", "Sam
--       started the job", "Sam finished"), the line under it (the arrival window — moved by a
--       running-late tap, as the running-late push writes it — or the job), the rail's fill, and
--       whether the card ends. Null for a job that is not live. Callable by the job's customer and by
--       the service role; revoked from anon.
--   (2) live_activity_tokens + register_live_activity(p_job_id, p_activity_id, p_push_token) — the
--       customer's phone hands over the card's push token (Apple's, per card), for the job's customer
--       only. RLS on, no grant: only the service role reads the tokens.
--   (3) live_card_outbox + the jobs trigger live_card_enqueue — a row whenever a job with a card
--       changes stage (en_route_at, arrived_at, status) or its arrival moves (late_minutes);
--       claim_live_card_batch / resolve_live_card / live_card_targets for the sender, service_role
--       only; drain_live_cards() (every minute, only when a row waits) and its installer. The sender,
--       supabase/functions/send-live-cards, pushes live_card_state() to each token through Apple's
--       push service — and without Apple's key on the project it resolves every row skipped: the path
--       is built, and off.
--
-- WHAT THIS FILE DOES NOT TOUCH: mark_worker_arrival(), transition_job_status(), job status or
-- assignment, every payments object. NOT destructive under scripts/staging-scan.sh. Reversible: one
-- corrective migration unschedules brazos-live-cards and drops the functions, the trigger and the two
-- tables.

begin;

-- ---------------------------------------------------------------------------
-- 1. The card's words.
-- ---------------------------------------------------------------------------
-- A clock time as the job pages write one: "6 PM" on the hour, "6:20 PM" otherwise (lib/runningLate.ts
-- clockLabel's rule), wrapping past midnight.
create or replace function public.clock_label(p_minutes integer) returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select case
    when mod(((p_minutes % 1440) + 1440) % 1440, 60) = 0
      then to_char(time '00:00' + make_interval(mins => ((p_minutes % 1440) + 1440) % 1440), 'FMHH12 AM')
    else to_char(time '00:00' + make_interval(mins => ((p_minutes % 1440) + 1440) % 1440), 'FMHH12:MI AM')
  end
$$;
revoke all on function public.clock_label(integer) from public, anon, authenticated;

create or replace function public.live_card_state(p_job_id uuid) returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs;
  v_stage text;
  v_first text;
  v_window text;
  v_late integer;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if v_job.id is null then
    return null;
  end if;
  -- The customer's own card; the service role (the push path) reads any.
  if auth.uid() is not null and auth.uid() is distinct from v_job.client_id then
    return null;
  end if;

  -- A cancelled job's card ends, saying so — the sender ends it by push at once (the group 5 review).
  if v_job.status = 'cancelled' then
    return jsonb_build_object(
      'stage', 'cancelled',
      'title', 'Job cancelled',
      'subtitle', left(v_job.title, 60),
      'progress', 0,
      'ended', true
    );
  end if;

  -- An allow-list of the four live stages; anything else has no card.
  v_stage := case
    when v_job.status = 'completed' then 'finished'
    when v_job.status = 'in_progress' then 'started'
    when v_job.status = 'assigned' and v_job.arrived_at is not null then 'arrived'
    when v_job.status = 'assigned' and v_job.en_route_at is not null then 'on_the_way'
  end;
  if v_stage is null or v_job.assigned_worker_id is null then
    return null;
  end if;

  v_first := coalesce(nullif(split_part(btrim(public.notify_display_name(v_job.assigned_worker_id)), ' ', 1), ''), 'Your worker');
  -- The arrival window, moved by a running-late tap until the worker arrives — as the running-late
  -- push writes it (report_running_late(), 20260930000700).
  v_late := case when v_job.late_minutes in (10, 20, 30) then v_job.late_minutes else 0 end;
  if v_job.arrival_start_hour is not null and v_job.arrival_end_hour is not null then
    v_window := public.clock_label(v_job.arrival_start_hour * 60 + v_late) || '–' || public.clock_label(v_job.arrival_end_hour * 60 + v_late);
  end if;

  return jsonb_build_object(
    'stage', v_stage,
    'title', case v_stage
      when 'on_the_way' then v_first || ' is on the way'
      when 'arrived' then v_first || ' has arrived'
      when 'started' then v_first || ' started the job'
      else v_first || ' finished the job'
    end,
    'subtitle', case v_stage
      when 'on_the_way' then coalesce('Arrives ' || v_window, left(v_job.title, 60))
      when 'finished' then 'Approve the work in Brazos'
      else left(v_job.title, 60)
    end,
    'progress', case v_stage when 'on_the_way' then 0.25 when 'arrived' then 0.5 when 'started' then 0.75 else 1 end,
    'ended', v_stage = 'finished'
  );
end;
$$;
revoke all on function public.live_card_state(uuid) from public, anon;
grant execute on function public.live_card_state(uuid) to authenticated, service_role;
comment on function public.live_card_state(uuid) is
  'Idea 9: the lock-screen card''s words for one job — stage, title, the line under it, the rail''s fill, whether it ends — or null when the job is not live. The job''s customer, or the service role; never anon.';

-- ---------------------------------------------------------------------------
-- 2. The card's push token, from the customer's phone.
-- ---------------------------------------------------------------------------
create table if not exists public.live_activity_tokens (
  job_id uuid not null references public.jobs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  activity_id text not null,
  push_token text not null,
  updated_at timestamptz not null default now(),
  primary key (job_id, user_id),
  constraint live_activity_tokens_activity_shape check (length(activity_id) between 1 and 128),
  -- Postgres caps a regex repetition at 255, so the length is its own check.
  constraint live_activity_tokens_token_shape check (push_token ~ '^[0-9A-Fa-f]+$' and length(push_token) between 16 and 512)
);
alter table public.live_activity_tokens enable row level security;
revoke all on table public.live_activity_tokens from public, anon, authenticated, service_role;
grant select on table public.live_activity_tokens to service_role;

create or replace function public.register_live_activity(p_job_id uuid, p_activity_id text, p_push_token text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if not exists (select 1 from public.jobs j where j.id = p_job_id and j.client_id = v_actor) then
    raise exception 'Job not found';
  end if;
  if p_activity_id is null or length(p_activity_id) not between 1 and 128
     or p_push_token is null or p_push_token !~ '^[0-9A-Fa-f]+$' or length(p_push_token) not between 16 and 512 then
    raise exception 'Live card token is invalid';
  end if;
  insert into public.live_activity_tokens (job_id, user_id, activity_id, push_token, updated_at)
  values (p_job_id, v_actor, p_activity_id, p_push_token, now())
  on conflict (job_id, user_id) do update
    set activity_id = excluded.activity_id, push_token = excluded.push_token, updated_at = now();
end;
$$;
revoke all on function public.register_live_activity(uuid, text, text) from public, anon;
grant execute on function public.register_live_activity(uuid, text, text) to authenticated;
comment on function public.register_live_activity(uuid, text, text) is
  'Idea 9: the job''s customer hands over their lock-screen card''s push token (Apple''s, per card). SECURITY DEFINER; authenticated only.';

-- ---------------------------------------------------------------------------
-- 3. A stage changed: the card is due an update.
-- ---------------------------------------------------------------------------
create table if not exists public.live_card_outbox (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint live_card_outbox_status_known check (status in ('pending', 'sent', 'skipped', 'failed'))
);
alter table public.live_card_outbox enable row level security;
revoke all on table public.live_card_outbox from public, anon, authenticated, service_role;
grant select on table public.live_card_outbox to service_role;
create index if not exists live_card_outbox_pending_idx on public.live_card_outbox (created_at) where status = 'pending';

create or replace function public.live_card_enqueue() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  -- Only a job whose customer holds a card; one waiting row per job is enough — the sender reads the
  -- job's state as it is when it sends.
  if exists (select 1 from public.live_activity_tokens t where t.job_id = new.id)
     -- An unclaimed row is enough; a row already in the sender's hands gets a successor, so a change
     -- during a send is never lost (the group 5 review).
     and not exists (select 1 from public.live_card_outbox o where o.job_id = new.id and o.status = 'pending' and o.attempts = 0) then
    insert into public.live_card_outbox (job_id) values (new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.live_card_enqueue() from public, anon, authenticated;
drop trigger if exists jobs_live_card on public.jobs;
create trigger jobs_live_card after update of en_route_at, arrived_at, status, late_minutes on public.jobs
  for each row
  when (old.en_route_at is distinct from new.en_route_at
        or old.arrived_at is distinct from new.arrived_at
        or old.status is distinct from new.status
        or old.late_minutes is distinct from new.late_minutes)
  execute function public.live_card_enqueue();

create or replace function public.claim_live_card_batch(p_limit integer default 50)
returns table (outbox_id uuid, job_id uuid, state jsonb, tokens text[])
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  -- A row claimed five times and never resolved (a sender stopped mid-send) gives up.
  update public.live_card_outbox
     set status = 'failed', last_error = coalesce(last_error, 'no answer after five tries')
   where status = 'pending' and attempts >= 5;
  return query
  with claimed as (
    select o.id
    from public.live_card_outbox o
    where o.status = 'pending' and o.attempts < 5
    order by o.created_at
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    for update skip locked
  ),
  marked as (
    update public.live_card_outbox o
       set attempts = o.attempts + 1
      from claimed c
     where o.id = c.id
    returning o.id, o.job_id
  )
  select
    m.id,
    m.job_id,
    public.live_card_state(m.job_id),
    coalesce(array(select t.push_token from public.live_activity_tokens t where t.job_id = m.job_id), array[]::text[])
  from marked m;
end;
$$;
revoke all on function public.claim_live_card_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_live_card_batch(integer) to service_role;

create or replace function public.resolve_live_card(p_outbox_id uuid, p_status text, p_error text default null)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if p_status is null or p_status not in ('pending', 'sent', 'skipped', 'failed') then
    raise exception 'resolve_live_card: unknown status';
  end if;
  update public.live_card_outbox
     set status = case when p_status = 'pending' and attempts >= 5 then 'failed' else p_status end,
         last_error = left(p_error, 500),
         sent_at = case when p_status = 'sent' then now() else sent_at end
   where id = p_outbox_id;
end;
$$;
revoke all on function public.resolve_live_card(uuid, text, text) from public, anon, authenticated;
grant execute on function public.resolve_live_card(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. The wake-up, and its schedule.
-- ---------------------------------------------------------------------------
create or replace function public.drain_live_cards() returns bigint
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_url        text;
  v_key        text;
  v_request_id bigint;
begin
  if not exists (select 1 from public.live_card_outbox where status = 'pending' and attempts < 5) then
    return null;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'send_live_cards_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'send_live_cards_service_key';
  if v_url is null or v_key is null then
    select replace(decrypted_secret, '/process-settlements', '/send-live-cards') into v_url
      from vault.decrypted_secrets where name = 'process_settlements_url';
    select decrypted_secret into v_key
      from vault.decrypted_secrets where name = 'process_settlements_service_key';
  end if;
  if v_url is null or v_key is null or v_url not like '%/send-live-cards%' then
    raise exception 'drain_live_cards: vault secrets missing';
  end if;
  select net.http_post(
    url                  := v_url,
    body                 := '{}'::jsonb,
    params               := '{}'::jsonb,
    headers              := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    timeout_milliseconds := 30000
  ) into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function public.drain_live_cards() from public, anon, authenticated;
grant execute on function public.drain_live_cards() to service_role;

create or replace function public.install_live_card_schedule() returns text
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_stale bigint;
begin
  if not public.pg_function_present('cron', 'schedule') then
    raise notice 'live_card: pg_cron absent (local stack) — schedule skipped';
    return 'skipped: pg_cron absent';
  end if;
  for v_stale in select j.jobid from cron.job j where j.jobname = 'brazos-live-cards'
  loop
    perform cron.unschedule(v_stale);
  end loop;
  perform cron.schedule('brazos-live-cards', '* * * * *', $cron$select public.drain_live_cards();$cron$);
  return 'scheduled: brazos-live-cards';
end
$fn$;
revoke all on function public.install_live_card_schedule() from public, anon, authenticated;
grant execute on function public.install_live_card_schedule() to service_role;

select public.install_live_card_schedule();

commit;
