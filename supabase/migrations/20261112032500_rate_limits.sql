-- B10, the rates (docs/lean/AUDIT-LEDGER.md; design docs/critical/privacy-and-limits.md): one
-- account cannot flood chats, the market or the report queue.
--
--   messages     30 a minute   (sender_id)    You're sending messages too fast. Wait a minute and try again.
--   jobs         10 an hour    (client_id)    You've posted a lot of jobs in the last hour. Try again later.
--   job_offers   30 an hour    (author_id)    You've sent a lot of offers in the last hour. Try again later.
--   reports      10 a day      (reporter_id)  You've sent a lot of reports. Try again later.
--
-- WHAT COUNTS: one row a person's own action writes, as that person (auth.uid() is the row's owner
-- column). Not counted: rows the server writes for nobody's tap (the runner, a cron, the test
-- fixtures: auth.uid() is null); the ban's notices (written by an admin, attributed to the banned
-- account); offer cards in a chat (job_offer_id set, written by the offer functions; the offer
-- itself is what counts); the draft job a direct offer makes (visibility 'direct': the offer
-- counts); and a repeat visit the series schedule opens or offers (series_open_visit and
-- series_offer_visit act as the customer, so the call stack, not the identity, tells them apart).
--
-- THE COUNTER: public.rate_counters keeps ONE row per account and action: the current fixed window
-- and its hits. A new window overwrites the old one in the same upsert, so there is nothing to
-- clean up, the table never holds more than four rows per account (plus one per payment function),
-- and an insert never waits on another account (each account locks only its own row). A refused
-- write raises, and the raise undoes its own +1. Fixed windows: up to twice a limit can pass across
-- a window edge, which is accepted.
--
-- rate_limit_take() is the one counter step, also called by the four payment functions as the
-- service role (supabase/functions/_shared/rateLimit.ts), which is the only role granted it.

begin;

create table if not exists public.rate_counters (
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key (user_id, action)
);
alter table public.rate_counters enable row level security;
-- No policy: no role the app signs in as reads or writes it; the functions below run as its owner.
revoke all on table public.rate_counters from public, anon, authenticated, service_role;
comment on table public.rate_counters is
  'B10: per account and action, the current fixed window and its hits. Written only by rate_limit_take().';

create or replace function public.rate_limit_take(
  p_user uuid,
  p_action text,
  p_max integer,
  p_window interval
) returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_window timestamptz := date_bin(p_window, now(), timestamptz '2000-01-01 00:00:00+00');
  v_hits integer;
begin
  if p_user is null or coalesce(btrim(p_action), '') = '' or p_max is null or p_max < 1
     or p_window is null or p_window <= interval '0' then
    raise exception 'rate_limit_take: a user, an action, a maximum and a window are required';
  end if;

  insert into public.rate_counters as c (user_id, action, window_start, hits)
  values (p_user, p_action, v_window, 1)
  on conflict (user_id, action) do update
    set hits = case when c.window_start = excluded.window_start then c.hits + 1 else 1 end,
        window_start = excluded.window_start
  returning c.hits into v_hits;

  return v_hits <= p_max;
end;
$$;

revoke all on function public.rate_limit_take(uuid, text, integer, interval) from public, anon, authenticated, service_role;
grant execute on function public.rate_limit_take(uuid, text, integer, interval) to service_role;
comment on function public.rate_limit_take(uuid, text, integer, interval) is
  'B10: adds one hit to p_user''s p_action counter in the current fixed window of p_window and answers whether the account is still within p_max. Service role only (the payment functions); the database''s own limits call it through enforce_rate_limit().';

create or replace function public.enforce_rate_limit() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_stack text;
begin
  -- Arguments: action, maximum, window, owner column, sentence.
  if v_user is null or (to_jsonb(new) ->> tg_argv[3]) is distinct from v_user::text then
    return new;
  end if;
  -- A repeat visit is the schedule's doing, not a tap (job_series.sql: series_open_visit and
  -- series_offer_visit act as the customer).
  get diagnostics v_stack = pg_context;
  if v_stack ~ 'series_(open|offer)_visit\(' then
    return new;
  end if;
  if not public.rate_limit_take(v_user, tg_argv[0], tg_argv[1]::integer, tg_argv[2]::interval) then
    raise exception using errcode = 'P0001', message = tg_argv[4];
  end if;
  return new;
end;
$$;

-- A trigger function is never called by a role: revoke the CREATE-time PUBLIC grant.
revoke all on function public.enforce_rate_limit() from public, anon, authenticated, service_role;
comment on function public.enforce_rate_limit() is
  'B10: before insert, counts the row against its owner''s limit when the owner is the signed-in caller (arguments: action, maximum, window, owner column, sentence) and refuses it with the sentence above the limit. Rows the server writes, and a series'' repeat visits, are not counted.';

create or replace trigger messages_rate_limit
  before insert on public.messages
  for each row
  when (new.job_offer_id is null)
  execute function public.enforce_rate_limit(
    'message', '30', '1 minute', 'sender_id',
    'You''re sending messages too fast. Wait a minute and try again.');

create or replace trigger jobs_rate_limit
  before insert on public.jobs
  for each row
  when (new.visibility = 'open_market')
  execute function public.enforce_rate_limit(
    'job_post', '10', '1 hour', 'client_id',
    'You''ve posted a lot of jobs in the last hour. Try again later.');

create or replace trigger job_offers_rate_limit
  before insert on public.job_offers
  for each row
  execute function public.enforce_rate_limit(
    'offer', '30', '1 hour', 'author_id',
    'You''ve sent a lot of offers in the last hour. Try again later.');

create or replace trigger reports_rate_limit
  before insert on public.reports
  for each row
  execute function public.enforce_rate_limit(
    'report', '10', '1 day', 'reporter_id',
    'You''ve sent a lot of reports. Try again later.');

commit;
