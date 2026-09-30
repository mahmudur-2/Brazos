-- 20260930001000_job_series.sql — idea 14, "Repeat jobs": post once; three days before each next
-- visit the same worker gets it first, at the same price, for 24 hours; if they pass or the day
-- lapses, that visit opens to bids like a normal post. Every visit is its own job.
--
-- THE DECISION: docs/DECISIONS.md 2026-09-30 entries (4) and (5) — the visit rules, as drawn for the
-- operator (.shots/refresh/boards/v1-build.html, panel 4) and OK'd ("Yes, like picture 3"): the
-- customer picks every week, every 2 weeks or every month on the Review step; the first visit is an
-- ordinary job; three days before each next visit the same worker gets first refusal at the same
-- price for 24 hours; a yes sends the customer "<worker> can come <day> <time> · Confirm $<total>"
-- (the push opens Checkout — idea 20 adds the one-tap saved card); a pass or a lapse opens that
-- visit to bids; the customer can stop the series at any time and the worker can drop future visits.
-- A repeating job is not a calendar: nothing here schedules, books or shows a calendar.
--
-- THE MONEY RULES DO NOT MOVE: a first refusal is an ordinary direct offer, written by create_offer()
-- itself; a yes is accept_offer() — the only assignment path — and leaves the visit ASSIGNED and
-- unpaid until the customer confirms in Checkout, exactly as a direct offer does today; a pass opens
-- the visit through create_job() itself. transition_job_status() stays the only status mover; money
-- stays integer cents; nothing is charged before the customer confirms.
--
-- THE VERSION: 20260930000900_tomorrow_reminders.sql is the newest before it, so this takes 001000.
-- The pgTAP file is supabase/tests/180_job_series.sql.
--
-- WHAT THIS FILE DOES, in one transaction:
--   (1) public.job_series — one row per repeating job: the customer, the first visit (origin_job_id:
--       every visit is posted as that one was), the cadence (weekly / biweekly / monthly — an
--       allow-list), the anchor day and which visit comes next (next_visit_date = the anchor plus
--       that many weeks or months, so a month never drifts off the 31st), the worker who gets first
--       refusal and their price (the last hired visit's), the visit on offer right now, the worker
--       who dropped the series, active / stopped. RLS: the customer and the series' worker read it;
--       no role writes it directly — every write is one of the functions below. jobs.series_id ties
--       each visit to its series (nullable, additive; jobs' grants are table-level SELECT and no
--       client write path reaches the column).
--   (2) Two pure helpers, nobody's to call: series_visit_date(anchor, cadence, n) and
--       money_label(cents) — the push text's "$86" / "$107.50", formatBudget()'s rule.
--   (3) start_job_series(p_job_id, p_cadence) — the customer's own open-market job becomes a series'
--       first visit (idempotent: a job already in one returns it). The anchor is its day; a flexible
--       first visit counts from the day it is done (the trigger in (6)).
--   (4) advance_job_series(p_now) — the hourly schedule's work, in the market's daytime only (9 am to
--       9 pm, America/New_York: a first refusal or a fresh post never lands at 3 am):
--         (a) a first refusal in flight is left alone while an offer on it is pending and inside its
--             24 hours; once the worker declined, withdrew or let it lapse — or the 24 hours ran out
--             on a counter — what is still pending expires the canonical way (expire_offer_if_stale())
--             and the visit opens to bids (series_open_visit());
--         (b) otherwise, from three days before the next visit: to the series' worker at their price,
--             as a direct offer through create_offer() (series_offer_visit(): the customer's own
--             checks — both people active, nobody blocked, one live offer per pair — hold for the
--             schedule as for a tap), 24 hours to answer; with no worker (none hired yet, or they
--             dropped the series), or if that offer cannot be made, straight to bids. A visit whose
--             day is already too close is skipped rather than rushed, and a series whose last post
--             still waits for a hire never stacks a second one.
--       Each series runs in its own sub-transaction: one failure is recorded on its row
--       (last_error) and the rest go on; an inactive customer's series stops.
--   (5) install_series_schedule() — the settlement schedules' idempotent installer shape:
--       brazos-job-series at minute 17 of every hour where pg_cron exists; skipped locally.
--   (6) series_on_visit_change() — AFTER UPDATE OF assigned_worker_id, status on jobs, for a visit of
--       a series: a hire makes that worker the next first refusal at that price (unless they dropped
--       the series); a first refusal taken by the worker sends the customer "<worker> can come Tue
--       10 AM · Confirm $86" (category 'jobs': the hire and its payment, always on) which opens
--       Checkout; a flexible first visit, done, sets the series' clock.
--   (7) stop_job_series(p_series_id) — the customer's; closes a first refusal still pending
--       (withdraw_offer() / decline_offer() as the customer). drop_series_worker(p_series_id) — the
--       series' worker's; closes theirs the same way, the next visits open to bids, the customer is
--       told.
--   (8) notify_on_message(): the baseline body, plus one early return — a series visit's offer
--       events (created, accepted, declined, expired, withdrawn) do not buzz as "New message",
--       because the series says each of those moments itself; a counter is a real negotiation and
--       keeps its push.
--   Every new SECURITY DEFINER function carries revoke / grant (CLAUDE.md section Supabase): the
--   three the app calls — start_job_series, stop_job_series, drop_series_worker — to authenticated
--   (lib/jobSeries.ts, through supabase.rpc as the signed-in user); advance_job_series and
--   install_series_schedule to service_role; the rest to nobody.
--
-- WHAT THIS FILE DOES NOT TOUCH: accept_offer(), create_offer(), create_job(),
-- transition_job_status(), every payments / ledger / settlement object, the outbox's drain. NOT
-- destructive under scripts/staging-scan.sh. Reversible: one corrective migration unschedules
-- brazos-job-series, restores notify_on_message(), drops the functions, the trigger, jobs.series_id
-- and job_series.

begin;

-- ---------------------------------------------------------------------------
-- 1. The series, and each visit's tie to it.
-- ---------------------------------------------------------------------------
create table if not exists public.job_series (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  origin_job_id uuid not null references public.jobs (id) on delete cascade,
  cadence text not null,
  anchor_date date,
  next_visit_no integer not null default 1,
  next_visit_date date,
  worker_id uuid references public.profiles (id) on delete set null,
  price_cents integer,
  pending_job_id uuid references public.jobs (id) on delete set null,
  dropped_worker_id uuid references public.profiles (id) on delete set null,
  status text not null default 'active',
  stopped_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_series_cadence_known check (cadence in ('weekly', 'biweekly', 'monthly')),
  constraint job_series_status_known check (status in ('active', 'stopped')),
  constraint job_series_visit_no_positive check (next_visit_no >= 1),
  constraint job_series_price_positive check (price_cents is null or price_cents > 0),
  constraint job_series_one_per_origin unique (origin_job_id)
);
alter table public.job_series enable row level security;
-- No role writes a series directly — the functions below are its only writers.
revoke all on table public.job_series from public, anon, authenticated, service_role;
grant select on table public.job_series to authenticated, service_role;
drop policy if exists "job_series_select_parties" on public.job_series;
create policy "job_series_select_parties" on public.job_series for select to authenticated
  using ((select auth.uid()) = client_id or (select auth.uid()) = worker_id);
create index if not exists job_series_active_idx on public.job_series (created_at) where status = 'active';
comment on table public.job_series is
  'Idea 14 (docs/DECISIONS.md 2026-09-30 entries (4), (5)): a repeating job. Each next visit goes first to worker_id at price_cents for 24 hours (a direct offer through create_offer()), then to bids (create_job()). Read by the customer and the series'' worker; written only by start_job_series, advance_job_series, series_on_visit_change, stop_job_series and drop_series_worker.';

alter table public.jobs add column if not exists series_id uuid references public.job_series (id) on delete set null;
create index if not exists jobs_series_idx on public.jobs (series_id) where series_id is not null;
comment on column public.jobs.series_id is 'Idea 14: the repeating job this visit belongs to (job_series). Set only by the series functions; every visit is its own job.';

-- ---------------------------------------------------------------------------
-- 2. The two helpers.
-- ---------------------------------------------------------------------------
create or replace function public.series_visit_date(p_anchor date, p_cadence text, p_visit integer)
returns date
language sql immutable
set search_path = public, pg_temp
as $$
  select case p_cadence
    when 'weekly' then p_anchor + 7 * p_visit
    when 'biweekly' then p_anchor + 14 * p_visit
    -- From the anchor every time, so the 31st lands on the 30th / 28th and comes back.
    when 'monthly' then (p_anchor + make_interval(months => p_visit))::date
  end
$$;
revoke all on function public.series_visit_date(date, text, integer) from public, anon, authenticated;

create or replace function public.money_label(p_cents integer)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  -- formatBudget()'s rule (lib/jobs.ts): a whole-dollar amount bare ("$86"), otherwise two decimals.
  select '$' || case
    when p_cents % 100 = 0 then to_char(p_cents / 100, 'FM999,999,990')
    else to_char(p_cents / 100.0, 'FM999,999,990.00')
  end
$$;
revoke all on function public.money_label(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The start: the customer's own posted job becomes a series' first visit.
-- ---------------------------------------------------------------------------
create or replace function public.start_job_series(p_job_id uuid, p_cadence text)
returns public.job_series
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_series public.job_series;
  v_anchor date;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if p_cadence is null or p_cadence not in ('weekly', 'biweekly', 'monthly') then
    raise exception 'Repeat every week, every 2 weeks or every month';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then
    raise exception 'Job not found';
  end if;
  -- Idempotent: a job already in a series answers with it.
  if v_job.series_id is not null then
    select * into v_series from public.job_series where id = v_job.series_id;
    return v_series;
  end if;
  -- An allow-list: the customer's own posted job, not yet over.
  if v_job.visibility <> 'open_market'
     or v_job.status not in ('open', 'assigned', 'in_progress', 'completed') then
    raise exception 'This job can''t repeat';
  end if;

  -- The first visit's day; a flexible one counts from the day it is done (series_on_visit_change).
  v_anchor := case
    when v_job.scheduled_date is not null then v_job.scheduled_date
    when v_job.status = 'completed' then (now() at time zone 'America/New_York')::date
  end;

  insert into public.job_series (
    client_id, origin_job_id, cadence, anchor_date, next_visit_no, next_visit_date, worker_id, price_cents
  )
  values (
    v_actor, v_job.id, p_cadence, v_anchor, 1,
    case when v_anchor is not null then public.series_visit_date(v_anchor, p_cadence, 1) end,
    v_job.assigned_worker_id,
    case when v_job.assigned_worker_id is not null then v_job.final_amount_cents end
  )
  returning * into v_series;

  update public.jobs set series_id = v_series.id where id = v_job.id;
  return v_series;
end;
$$;

revoke all on function public.start_job_series(uuid, text) from public, anon;
grant execute on function public.start_job_series(uuid, text) to authenticated;
comment on function public.start_job_series(uuid, text) is
  'Idea 14: the signed-in customer''s own open-market job (open, hired, started or done) becomes the first visit of a series repeating every week, every 2 weeks or every month. Idempotent. SECURITY DEFINER; authenticated only.';

-- ---------------------------------------------------------------------------
-- 4a. A first refusal: the next visit, to the series' worker at their price, for 24 hours.
-- ---------------------------------------------------------------------------
create or replace function public.series_offer_visit(p_series public.job_series, p_visit date)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_origin public.jobs;
  v_loc public.job_locations;
  v_thread_job uuid;
  v_offer uuid;
  v_draft uuid;
  v_msg record;
  v_claims text := current_setting('request.jwt.claims', true);
  v_start text;
  v_window text;
  v_first text;
begin
  select * into v_origin from public.jobs where id = p_series.origin_job_id;
  select * into v_loc from public.job_locations where job_id = p_series.origin_job_id;
  if v_origin.arrival_start_hour is not null and v_origin.arrival_end_hour is not null then
    v_start := to_char(time '00:00' + make_interval(hours => v_origin.arrival_start_hour), 'FMHH12 AM');
    v_window := v_start || '–' || to_char(time '00:00' + make_interval(hours => v_origin.arrival_end_hour), 'FMHH12 AM');
  end if;
  -- The thread the two already talk in: the last visit this worker was hired for.
  select j.id into v_thread_job
  from public.jobs j
  where j.series_id = p_series.id and j.assigned_worker_id = p_series.worker_id
  order by j.created_at desc
  limit 1;

  -- As the customer who set the series up, through create_offer() itself; the offer's own thread
  -- event stays quiet (notify_on_message) because the worker's push below says it better.
  perform set_config('request.jwt.claims', json_build_object('sub', p_series.client_id, 'role', 'authenticated')::text, true);
  perform set_config('brazos.series_offer', 'on', true);
  v_offer := public.create_offer(
    p_amount_cents => p_series.price_cents,
    p_message => 'Repeat visit · ' || to_char(p_visit, 'FMDy, FMMon FMDD') || coalesce(' · ' || v_window, '')
                 || '. Same job, same price.',
    p_worker_id => p_series.worker_id,
    p_title => v_origin.title,
    p_description => left(coalesce(v_origin.description, ''), 500),
    p_category => v_origin.category::text,
    p_location => v_origin.location,
    -- A direct offer carries five photos at most; the first five, in order.
    p_photos => coalesce((
      select jsonb_agg(p.value order by p.ord)
      from jsonb_array_elements(coalesce(v_origin.photos, '[]'::jsonb)) with ordinality as p(value, ord)
      where p.ord <= 5
    ), '[]'::jsonb),
    p_videos => coalesce(v_origin.videos, '[]'::jsonb),
    p_lat => v_loc.lat,
    p_lng => v_loc.lng,
    p_thread_job_id => v_thread_job
  );
  perform set_config('brazos.series_offer', 'off', true);
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);

  -- The visit's day, window and address, as the first visit had them.
  select o.job_id into v_draft from public.job_offers o where o.id = v_offer;
  update public.jobs
     set series_id = p_series.id,
         scheduled_date = p_visit,
         arrival_start_hour = v_origin.arrival_start_hour,
         arrival_end_hour = v_origin.arrival_end_hour
   where id = v_draft;
  if v_loc.job_id is not null then
    insert into public.job_locations (job_id, lat, lng, address_line, access_notes)
    values (v_draft, v_loc.lat, v_loc.lng, v_loc.address_line, v_loc.access_notes)
    on conflict (job_id) do update
      set lat = excluded.lat,
          lng = excluded.lng,
          address_line = excluded.address_line,
          access_notes = excluded.access_notes,
          updated_at = now();
  end if;
  -- Twenty-four hours to answer, not the seven days an ordinary offer keeps.
  update public.job_offers set expires_at = now() + interval '24 hours' where id = v_offer;

  -- The worker: which visit, for whom, at what price, and how long they have.
  select m.job_id, m.direct_thread_id into v_msg
  from public.messages m
  where m.job_offer_id = v_offer and m.request_event = 'created'
  limit 1;
  v_first := coalesce(nullif(split_part(btrim(public.notify_display_name(p_series.client_id)), ' ', 1), ''), 'Your customer');
  perform public.enqueue_notification(
    p_series.worker_id,
    p_series.client_id,
    'hire_requests',
    'series_first_refusal',
    'Repeat visit · ' || to_char(p_visit, 'FMDy') || coalesce(' ' || v_start, ''),
    left(v_origin.title, 60) || ' for ' || v_first || ' · ' || public.money_label(p_series.price_cents)
      || '. Yours first for 24 hours.',
    case
      when v_msg.job_id is not null then jsonb_build_object('screen', 'Chat', 'jobId', v_msg.job_id::text)
      else jsonb_build_object('screen', 'Chat', 'directThreadId', v_msg.direct_thread_id::text)
    end,
    'series_first_refusal:' || v_offer::text
  );

  return v_draft;
end;
$$;
revoke all on function public.series_offer_visit(public.job_series, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4b. To bids: the visit posted as the first one was, through create_job() itself.
-- ---------------------------------------------------------------------------
create or replace function public.series_open_visit(p_series public.job_series, p_visit date, p_passed_by uuid)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_origin public.jobs;
  v_loc public.job_locations;
  v_job public.jobs;
  v_ranged boolean;
  v_claims text := current_setting('request.jwt.claims', true);
begin
  select * into v_origin from public.jobs where id = p_series.origin_job_id;
  select * into v_loc from public.job_locations where job_id = p_series.origin_job_id;
  v_ranged := v_origin.budget_min_cents is not null or v_origin.budget_max_cents is not null;

  perform set_config('request.jwt.claims', json_build_object('sub', p_series.client_id, 'role', 'authenticated')::text, true);
  v_job := public.create_job(
    p_title => v_origin.title,
    p_description => v_origin.description,
    p_category => v_origin.category,
    p_location => v_origin.location,
    p_budget_cents => case when v_origin.pricing_mode = 'posted_price' or not v_ranged then v_origin.budget_cents end,
    p_photos => coalesce(v_origin.photos, '[]'::jsonb),
    p_lat => v_loc.lat,
    p_lng => v_loc.lng,
    p_videos => coalesce(v_origin.videos, '[]'::jsonb),
    p_budget_min_cents => case when v_origin.pricing_mode = 'open_bids' then v_origin.budget_min_cents end,
    p_budget_max_cents => case when v_origin.pricing_mode = 'open_bids' then v_origin.budget_max_cents end,
    p_scheduled_date => p_visit,
    p_arrival_start_hour => v_origin.arrival_start_hour,
    p_arrival_end_hour => v_origin.arrival_end_hour,
    p_address_line => v_loc.address_line,
    p_pricing_mode => v_origin.pricing_mode,
    p_needed_today => false
  );
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);

  update public.jobs set series_id = p_series.id where id = v_job.id;
  if v_loc.access_notes is not null then
    update public.job_locations set access_notes = v_loc.access_notes where job_id = v_job.id;
  end if;

  -- The customer: the visit is up for bids, and why.
  perform public.enqueue_notification(
    p_series.client_id,
    null,
    'job_updates',
    'series_open',
    'Your ' || to_char(p_visit, 'FMDy') || ' visit is open to bids',
    case
      when p_passed_by is not null then
        coalesce(nullif(split_part(btrim(public.notify_display_name(p_passed_by)), ' ', 1), ''), 'Your worker')
          || ' didn''t take this one · ' || left(v_origin.title, 60)
      else left(v_origin.title, 60) || ' is posted for workers nearby.'
    end,
    jsonb_build_object('screen', 'ClientJobDetail', 'jobId', v_job.id::text),
    'series_open:' || v_job.id::text
  );

  return v_job.id;
end;
$$;
revoke all on function public.series_open_visit(public.job_series, date, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4c. Closing what is still pending on a visit, as one of its two people (auth.uid()).
-- ---------------------------------------------------------------------------
create or replace function public.series_close_offers(p_job_id uuid, p_actor uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_offer public.job_offers;
begin
  for v_offer in
    select * from public.job_offers o
    where o.job_id = p_job_id and o.status = 'pending'
    order by o.created_at
    for update
  loop
    if public.expire_offer_if_stale(v_offer) then
      continue;
    end if;
    if v_offer.author_id = p_actor then
      perform public.withdraw_offer(v_offer.id);
    elsif v_offer.awaiting_id = p_actor then
      perform public.decline_offer(v_offer.id);
    end if;
  end loop;
end;
$$;
revoke all on function public.series_close_offers(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4d. The hourly work.
-- ---------------------------------------------------------------------------
create or replace function public.advance_job_series(p_now timestamptz default null)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_local timestamp := coalesce(p_now, now()) at time zone 'America/New_York';
  v_today date := v_local::date;
  v_id uuid;
  v_series public.job_series;
  v_draft public.jobs;
  v_root public.job_offers;
  v_offer public.job_offers;
  v_passed_by uuid;
  v_visit date;
  v_next integer;
  v_made uuid;
  v_done integer := 0;
begin
  -- The market's daytime only: nobody gets a first refusal, and no visit is posted, at 3 am.
  if extract(hour from v_local) < 9 or extract(hour from v_local) >= 21 then
    return 0;
  end if;

  for v_id in
    select s.id from public.job_series s where s.status = 'active' order by s.created_at
  loop
    begin
      select * into v_series from public.job_series where id = v_id;

      if not public.is_profile_active(v_series.client_id) then
        update public.job_series
           set status = 'stopped', stopped_at = now(), updated_at = now(),
               last_error = 'the customer is no longer active'
         where id = v_id;
        continue;
      end if;

      -- (a) A first refusal in flight. LOCK ORDER: the visit (jobs), then the series — the order
      --     accept_offer() takes them in, through the trigger.
      if v_series.pending_job_id is not null then
        select * into v_draft from public.jobs where id = v_series.pending_job_id for update;
        select * into v_series from public.job_series where id = v_id for update;
        if v_series.status <> 'active' or v_series.pending_job_id is distinct from v_draft.id then
          continue;
        end if;
        if v_draft.id is null or v_draft.status <> 'draft' then
          -- Gone (a taken one is moved on by the trigger): on to the visit after it.
          update public.job_series
             set pending_job_id = null,
                 next_visit_no = next_visit_no + 1,
                 next_visit_date = public.series_visit_date(anchor_date, cadence, next_visit_no + 1),
                 updated_at = now()
           where id = v_id;
          continue;
        end if;
        select * into v_root from public.job_offers o
         where o.job_id = v_draft.id and o.parent_offer_id is null
         order by o.created_at
         limit 1;
        if exists (select 1 from public.job_offers o where o.job_id = v_draft.id and o.status = 'pending')
           and now() < v_root.created_at + interval '24 hours' then
          continue;   -- still inside the worker's 24 hours
        end if;
        -- The worker passed, or the 24 hours ran out: whatever is still pending expires the canonical
        -- way, and the visit opens to bids.
        for v_offer in
          select * from public.job_offers o
          where o.job_id = v_draft.id and o.status = 'pending'
          for update
        loop
          update public.job_offers set expires_at = now() where id = v_offer.id;
          select * into v_offer from public.job_offers where id = v_offer.id;
          perform public.expire_offer_if_stale(v_offer);
        end loop;
        v_passed_by := v_root.worker_id;
        perform public.series_open_visit(v_series, v_draft.scheduled_date, v_passed_by);
        update public.job_series
           set pending_job_id = null,
               next_visit_no = next_visit_no + 1,
               next_visit_date = public.series_visit_date(anchor_date, cadence, next_visit_no + 1),
               last_error = null,
               updated_at = now()
         where id = v_id;
        v_done := v_done + 1;
        continue;
      end if;

      -- (b) The next visit.
      if v_series.anchor_date is null then
        -- A flexible first visit counts from the day it is done; one cancelled first ends the series.
        if exists (select 1 from public.jobs j where j.id = v_series.origin_job_id and j.status = 'cancelled') then
          update public.job_series
             set status = 'stopped', stopped_at = now(), updated_at = now(),
                 last_error = 'the first visit was cancelled before it was done'
           where id = v_id;
        end if;
        continue;
      end if;

      select * into v_series from public.job_series where id = v_id for update skip locked;
      if not found or v_series.status <> 'active' or v_series.pending_job_id is not null then
        continue;
      end if;

      -- A day already too close (the schedule was down, or the series began late) is skipped, never
      -- rushed: at least two days' notice.
      v_next := v_series.next_visit_no;
      v_visit := public.series_visit_date(v_series.anchor_date, v_series.cadence, v_next);
      for i in 1..1000 loop
        exit when v_visit >= v_today + 2;
        v_next := v_next + 1;
        v_visit := public.series_visit_date(v_series.anchor_date, v_series.cadence, v_next);
      end loop;
      if v_today < v_visit - 3 then
        if v_next <> v_series.next_visit_no or v_series.next_visit_date is distinct from v_visit then
          update public.job_series
             set next_visit_no = v_next, next_visit_date = v_visit, updated_at = now()
           where id = v_id;
        end if;
        continue;   -- not yet: three days before
      end if;

      -- Never stack a second post while the last one still waits for a hire: this visit is skipped.
      if exists (select 1 from public.jobs j where j.series_id = v_id and j.status = 'open') then
        update public.job_series
           set next_visit_no = v_next + 1,
               next_visit_date = public.series_visit_date(v_series.anchor_date, v_series.cadence, v_next + 1),
               updated_at = now()
         where id = v_id;
        continue;
      end if;

      v_made := null;
      if v_series.worker_id is not null and v_series.price_cents is not null
         and public.job_request_parties_ok(v_series.client_id, v_series.worker_id) then
        begin
          v_made := public.series_offer_visit(v_series, v_visit);
        exception when others then
          -- The offer could not be made (a live offer between the two already, say): to bids instead.
          v_made := null;
        end;
      end if;

      if v_made is not null then
        -- The pointer stays on the visit on offer until it is taken (the trigger) or opens to bids (a).
        update public.job_series
           set pending_job_id = v_made,
               next_visit_no = v_next,
               next_visit_date = v_visit,
               last_error = null,
               updated_at = now()
         where id = v_id;
      else
        perform public.series_open_visit(v_series, v_visit, null);
        update public.job_series
           set next_visit_no = v_next + 1,
               next_visit_date = public.series_visit_date(v_series.anchor_date, v_series.cadence, v_next + 1),
               last_error = null,
               updated_at = now()
         where id = v_id;
      end if;
      v_done := v_done + 1;
    exception when others then
      -- One series' failure never stops the others; it is recorded, and that visit is skipped rather
      -- than retried every hour.
      update public.job_series
         set last_error = left(sqlerrm, 300),
             pending_job_id = null,
             next_visit_no = next_visit_no + 1,
             next_visit_date = case when anchor_date is not null
                                    then public.series_visit_date(anchor_date, cadence, next_visit_no + 1) end,
             updated_at = now()
       where id = v_id;
    end;
  end loop;

  return v_done;
end;
$$;
revoke all on function public.advance_job_series(timestamptz) from public, anon, authenticated;
grant execute on function public.advance_job_series(timestamptz) to service_role;
comment on function public.advance_job_series(timestamptz) is
  'Idea 14: the hourly work of every active series, in the market''s daytime (9 am - 9 pm, America/New_York): a first refusal in flight waits out its 24 hours, then opens to bids; from three days before the next visit, a first refusal to the series'' worker at their price (create_offer()), or bids (create_job()). Returns how many series moved. Called by the brazos-job-series schedule.';

-- ---------------------------------------------------------------------------
-- 5. The schedule: minute 17 of every hour, where pg_cron exists.
-- ---------------------------------------------------------------------------
create or replace function public.install_series_schedule() returns text
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_stale bigint;
begin
  if not public.pg_function_present('cron', 'schedule') then
    raise notice 'job_series: pg_cron absent (local stack) — schedule skipped';
    return 'skipped: pg_cron absent';
  end if;

  -- By jobid: cron.unschedule has a (bigint) and a (name) overload.
  for v_stale in select j.jobid from cron.job j where j.jobname = 'brazos-job-series'
  loop
    perform cron.unschedule(v_stale);
  end loop;

  perform cron.schedule('brazos-job-series', '17 * * * *',
                        $cron$select public.advance_job_series();$cron$);

  return 'scheduled: brazos-job-series';
end
$fn$;
revoke all on function public.install_series_schedule() from public, anon, authenticated;
grant execute on function public.install_series_schedule() to service_role;
comment on function public.install_series_schedule() is
  'Idea 14: schedules brazos-job-series at minute 17 of every hour where pg_cron exists (the settlement schedules'' idempotent shape); skips with a notice on a stack without it.';

-- ---------------------------------------------------------------------------
-- 6. A visit hired, a first refusal taken, a flexible first visit done.
-- ---------------------------------------------------------------------------
create or replace function public.series_on_visit_change() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_series public.job_series;
  v_offer public.job_offers;
  v_total integer;
  v_first text;
  v_today date := (now() at time zone 'America/New_York')::date;
begin
  select * into v_series from public.job_series where id = new.series_id for update;
  if v_series.id is null then
    return new;
  end if;

  if old.assigned_worker_id is null and new.assigned_worker_id is not null then
    -- The same worker gets the next visit first, at this price — unless they dropped the series.
    update public.job_series
       set worker_id = case when new.assigned_worker_id is distinct from v_series.dropped_worker_id
                            then new.assigned_worker_id else v_series.worker_id end,
           price_cents = case when new.assigned_worker_id is distinct from v_series.dropped_worker_id
                              then coalesce(new.final_amount_cents, v_series.price_cents) else v_series.price_cents end,
           -- The visit on offer, taken: on to the one after it.
           pending_job_id = case when v_series.pending_job_id = new.id then null else v_series.pending_job_id end,
           next_visit_no = case when v_series.pending_job_id = new.id
                                then v_series.next_visit_no + 1 else v_series.next_visit_no end,
           next_visit_date = case when v_series.pending_job_id = new.id and v_series.anchor_date is not null
                                  then public.series_visit_date(v_series.anchor_date, v_series.cadence, v_series.next_visit_no + 1)
                                  else v_series.next_visit_date end,
           updated_at = now()
     where id = v_series.id;

    -- A first refusal taken: the worker said yes to the customer's standing offer. The customer
    -- confirms, and pays, in Checkout — nothing is charged before they do.
    if old.status = 'draft' then
      select * into v_offer from public.job_offers where id = new.accepted_offer_id;
      if v_offer.author_id = new.client_id then
        select q.total_cents into v_total
        from public.quote_job_price(coalesce(new.final_amount_cents, v_offer.amount_cents)) q;
        v_first := coalesce(nullif(split_part(btrim(public.notify_display_name(new.assigned_worker_id)), ' ', 1), ''), 'Your worker');
        perform public.enqueue_notification(
          new.client_id,
          new.assigned_worker_id,
          'jobs',
          'series_confirm',
          v_first || ' can come ' || to_char(new.scheduled_date, 'FMDy')
            || coalesce(' ' || to_char(time '00:00' + make_interval(hours => new.arrival_start_hour), 'FMHH12 AM'), ''),
          'Confirm ' || public.money_label(v_total) || ' · ' || left(new.title, 60),
          jsonb_build_object('screen', 'ClientJobDetail', 'jobId', new.id::text, 'intent', 'checkout'),
          'series_confirm:' || new.id::text
        );
      end if;
    end if;
  end if;

  -- A flexible first visit, done: the series counts from today.
  if new.status = 'completed' and old.status is distinct from 'completed' and v_series.anchor_date is null then
    update public.job_series
       set anchor_date = v_today,
           next_visit_no = 1,
           next_visit_date = public.series_visit_date(v_today, v_series.cadence, 1),
           updated_at = now()
     where id = v_series.id;
  end if;

  return new;
end;
$$;
revoke all on function public.series_on_visit_change() from public, anon, authenticated;
drop trigger if exists jobs_series_visit on public.jobs;
create trigger jobs_series_visit after update of assigned_worker_id, status on public.jobs
  for each row when (new.series_id is not null)
  execute function public.series_on_visit_change();

-- ---------------------------------------------------------------------------
-- 7. Stop (the customer) and drop (the series' worker).
-- ---------------------------------------------------------------------------
create or replace function public.stop_job_series(p_series_id uuid)
returns public.job_series
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_series public.job_series;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  select * into v_series from public.job_series where id = p_series_id;
  if not found or v_series.client_id <> v_actor then
    raise exception 'Repeat not found';
  end if;
  -- LOCK ORDER: the visit on offer (jobs), then the series — accept_offer()'s order.
  if v_series.pending_job_id is not null then
    perform 1 from public.jobs where id = v_series.pending_job_id for update;
  end if;
  select * into v_series from public.job_series where id = p_series_id for update;
  if v_series.status = 'stopped' then
    return v_series;
  end if;
  if v_series.pending_job_id is not null then
    perform public.series_close_offers(v_series.pending_job_id, v_actor);
  end if;
  update public.job_series
     set status = 'stopped', stopped_at = now(), pending_job_id = null, updated_at = now()
   where id = p_series_id
  returning * into v_series;
  return v_series;
end;
$$;
revoke all on function public.stop_job_series(uuid) from public, anon;
grant execute on function public.stop_job_series(uuid) to authenticated;
comment on function public.stop_job_series(uuid) is
  'Idea 14: the customer stops their repeating job; a first refusal still pending is withdrawn (or its counter declined). Visits already hired stay hired. Idempotent. SECURITY DEFINER; authenticated only.';

create or replace function public.drop_series_worker(p_series_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_series public.job_series;
  v_latest uuid;
  v_title text;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  select * into v_series from public.job_series where id = p_series_id;
  if not found or v_series.worker_id is distinct from v_actor then
    raise exception 'Repeat not found';
  end if;
  -- LOCK ORDER: the visit on offer (jobs), then the series.
  if v_series.pending_job_id is not null then
    perform 1 from public.jobs where id = v_series.pending_job_id for update;
  end if;
  select * into v_series from public.job_series where id = p_series_id for update;
  if v_series.worker_id is distinct from v_actor then
    return;
  end if;
  if v_series.pending_job_id is not null then
    perform public.series_close_offers(v_series.pending_job_id, v_actor);
  end if;
  update public.job_series
     set worker_id = null, price_cents = null, dropped_worker_id = v_actor, updated_at = now()
   where id = p_series_id;

  -- The customer: the next visits will open to bids.
  if v_series.status = 'active' then
    select j.id, j.title into v_latest, v_title
    from public.jobs j
    where j.series_id = p_series_id and j.status <> 'draft'
    order by j.created_at desc
    limit 1;
    perform public.enqueue_notification(
      v_series.client_id,
      v_actor,
      'job_updates',
      'series_worker_dropped',
      coalesce(nullif(split_part(btrim(public.notify_display_name(v_actor)), ' ', 1), ''), 'Your worker')
        || ' won''t take future visits',
      coalesce(left(v_title, 60) || ' · ', '') || 'The next visits open to bids.',
      jsonb_build_object('screen', 'ClientJobDetail', 'jobId', coalesce(v_latest, v_series.origin_job_id)::text),
      'series_worker_dropped:' || p_series_id::text || ':' || v_actor::text
    );
  end if;
end;
$$;
revoke all on function public.drop_series_worker(uuid) from public, anon;
grant execute on function public.drop_series_worker(uuid) to authenticated;
comment on function public.drop_series_worker(uuid) is
  'Idea 14: the series'' worker drops its future visits; a first refusal still pending is declined (or their counter withdrawn), the next visits open to bids, and the customer is told. Visits already hired stay hired. SECURITY DEFINER; authenticated only.';

-- ---------------------------------------------------------------------------
-- 8. notify_on_message: the baseline body, plus the series' own moments kept quiet here.
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_message() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs;
  v_thread public.direct_threads;
  v_recipient uuid;
  v_preview text;
begin
  -- Hire-request events also insert a message row (phase18). Those are
  -- notified from the negotiation triggers, which know the state — notifying
  -- here as well would double-buzz for a single action.
  if new.job_request_id is not null then
    return new;
  end if;

  -- Idea 14 (2026-09-30): a repeat visit's first refusal says each of its moments itself — the
  -- worker's "Repeat visit" push, the customer's "can come · Confirm" and "open to bids" — so its
  -- offer events do not buzz a second time as "New message". The offer being written right now
  -- (brazos.series_offer, set by series_offer_visit) is caught before its visit is tied to the
  -- series; every later event by the visit's series_id. A counter is a real negotiation and keeps
  -- its push.
  if new.job_offer_id is not null and new.request_event is not null and new.request_event <> 'countered' then
    if coalesce(current_setting('brazos.series_offer', true), '') = 'on' then
      return new;
    end if;
    perform 1
      from public.job_offers o
      join public.jobs j on j.id = o.job_id
     where o.id = new.job_offer_id
       and j.series_id is not null;
    if found then
      return new;
    end if;
  end if;

  -- phase61: marketplace offer chains now post thread messages, which they
  -- never did before. Their lifecycle is already notified by dedicated
  -- triggers — phase20 bid_received for the root (via the phase47 projection)
  -- and phase59 offer_countered for counters — so a generic "New message"
  -- here would double-buzz the same action. Scoped to marketplace chains:
  -- direct-offer events keep the exact behaviour phase57 shipped, and normal
  -- chat never carries job_offer_id (lib/messages.ts sendMessage()).
  if new.job_offer_id is not null and new.request_event is not null then
    perform 1
      from public.job_offers o
     where o.id = new.job_offer_id
       and o.offer_type = 'marketplace_bid';
    if found then
      return new;
    end if;
  end if;

  if new.job_id is not null then
    select * into v_job from public.jobs where id = new.job_id;
    if v_job.id is null then
      return new;
    end if;
    v_recipient := case
      when v_job.client_id = new.sender_id then v_job.assigned_worker_id
      else v_job.client_id
    end;
  elsif new.direct_thread_id is not null then
    -- phase57: the pre-hire pair thread. The recipient is simply the other
    -- participant.
    select * into v_thread from public.direct_threads where id = new.direct_thread_id;
    if v_thread.id is null then
      return new;
    end if;
    v_recipient := case
      when v_thread.user_a = new.sender_id then v_thread.user_b
      else v_thread.user_a
    end;
  else
    return new;
  end if;

  if v_recipient is null then
    return new;
  end if;

  v_preview := case
    when new.audio_url is not null then 'Voice message'
    when new.image_url is not null and coalesce(btrim(new.content), '') = '' then 'Photo'
    when new.image_url is not null then '📷 ' || new.content
    else new.content
  end;

  perform public.enqueue_notification(
    v_recipient,
    new.sender_id,
    'messages',
    'message',
    public.notify_display_name(new.sender_id),
    left(coalesce(nullif(btrim(v_preview), ''), 'New message'), 140),
    case
      when new.job_id is not null then
        jsonb_build_object('screen', 'Chat', 'jobId', new.job_id::text)
      else
        jsonb_build_object('screen', 'Chat', 'directThreadId', new.direct_thread_id::text)
    end,
    'message:' || new.id::text
  );

  return new;
end;
$$;
revoke all on function public.notify_on_message() from public, anon, authenticated;

select public.install_series_schedule();

commit;
