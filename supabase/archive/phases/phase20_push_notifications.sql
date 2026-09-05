-- ============================================================================
-- Brazos · Push notifications (tokens, preferences, outbox, triggers)
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- Contents
--   1. push_tokens          — one row per device, owner-only RLS
--   2. notification_prefs   — per-user toggles + nearby radius + home point
--   3. notification_outbox  — queued sends, NO client access at all
--   4. should_notify()      — one gate: ban / block / mute / prefs
--   5. enqueue_notification()
--   6. Triggers for all 8 notification types
--   7. claim_notification_batch() — drained by the Edge Function
--   8. OPTIONAL: pg_net + pg_cron wiring for low-latency delivery
--
-- ---------------------------------------------------------------------------
-- WHY A SEPARATE push_tokens TABLE RATHER THAN A COLUMN ON profiles
-- ---------------------------------------------------------------------------
-- This is a security decision, not a modelling preference. `profiles` SELECT
-- policy is `using (true)` (phase5/phase7) — every authenticated user can read
-- every column of every profile row — and lib/profiles.ts fetchProfileById()
-- does `select('*')` when showing another user's public profile. A push token
-- on `profiles` would therefore be handed to any user who opened a worker's
-- profile screen. That matters more than it sounds: Expo's push endpoint
-- (https://exp.host/--/api/v2/push/send) requires NO authentication, so anyone
-- holding another user's token could push arbitrary notifications to their
-- phone. Same class of mistake as phase12's lat/lng leak, so it gets the same
-- structural fix: the sensitive value lives on its own table whose RLS grants
-- the owner and nobody else.
--
-- A separate table is also the only shape that models reality: one account can
-- be signed in on several devices, and each token needs its own platform,
-- last-seen timestamp and revoked flag (Expo returns DeviceNotRegistered per
-- token, not per user).
--
-- ---------------------------------------------------------------------------
-- WHY AN OUTBOX RATHER THAN TRIGGERS CALLING EXPO DIRECTLY
-- ---------------------------------------------------------------------------
-- A trigger that made an HTTP call inline would put an external service on the
-- critical path of an ordinary write: if Expo were slow or down, sending a
-- chat message would slow down or fail with it. Unacceptable — delivery is
-- best-effort, messaging is not.
--
-- So triggers only decide WHO should be told and WHAT to say (pure SQL, fast,
-- transactional, with full access to the ban/block/mute/pref state), and write
-- that into notification_outbox. A Supabase Edge Function drains the outbox
-- and does the actual delivery. That also buys retries, per-row error capture,
-- and batching (Expo accepts up to 100 messages per request).
--
-- The core of this migration needs NO Postgres extensions and will work on any
-- Supabase project. Section 8 adds optional pg_net/pg_cron wiring to cut
-- delivery latency; if you skip it, the outbox still fills correctly and is
-- drained whenever the Edge Function is invoked.
-- ============================================================================

-- 1. Device tokens ----------------------------------------------------------
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- The ExponentPushToken[...] string. Unique globally: if a physical device
  -- is handed to another account, the token must follow the new owner rather
  -- than deliver that person's notifications to the previous one.
  token text not null unique,
  platform text not null default 'unknown',
  -- Set false when Expo reports DeviceNotRegistered. Kept (not deleted) so a
  -- reinstall that returns the same token can simply flip it back.
  active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint push_tokens_platform_valid check (platform in ('ios', 'android', 'web', 'unknown'))
);

create index if not exists push_tokens_user_active_idx
  on public.push_tokens (user_id) where active;

alter table public.push_tokens enable row level security;

-- Owner-only, in every direction. Nobody may read anyone else's device token.
drop policy if exists "push_tokens_select_own" on public.push_tokens;
create policy "push_tokens_select_own"
  on public.push_tokens for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "push_tokens_insert_own" on public.push_tokens;
create policy "push_tokens_insert_own"
  on public.push_tokens for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "push_tokens_update_own" on public.push_tokens;
create policy "push_tokens_update_own"
  on public.push_tokens for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "push_tokens_delete_own" on public.push_tokens;
create policy "push_tokens_delete_own"
  on public.push_tokens for delete
  to authenticated
  using (user_id = auth.uid());

-- Registering the same device again (token refresh, reinstall, account switch)
-- must not error and must re-activate a previously revoked row.
create or replace function public.register_push_token(
  p_token text,
  p_platform text default 'unknown'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;
  if p_token is null or btrim(p_token) = '' then
    raise exception 'Empty push token';
  end if;

  insert into public.push_tokens (user_id, token, platform, active, last_seen_at)
  values (v_user, btrim(p_token), coalesce(p_platform, 'unknown'), true, now())
  on conflict (token) do update
    set user_id      = excluded.user_id,
        platform     = excluded.platform,
        active       = true,
        last_seen_at = now();
end;
$$;

revoke all on function public.register_push_token(text, text) from public;
grant execute on function public.register_push_token(text, text) to authenticated;

-- 2. Preferences ------------------------------------------------------------
-- One row per user. Defaults are all-on: a user who never opens the settings
-- screen should still get notified, and every toggle is reachable in Profile.
create table if not exists public.notification_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  messages boolean not null default true,
  bids boolean not null default true,
  job_updates boolean not null default true,
  hire_requests boolean not null default true,
  nearby_jobs boolean not null default false,
  nearby_radius_miles integer not null default 5,
  -- Reference point for "new job near me". The app has no concept of a home
  -- address, and job_locations only covers jobs — so without a stored point
  -- there is nothing to measure a radius FROM. Written by the client when the
  -- user switches "New jobs nearby" on and grants location. Owner-only RLS,
  -- never exposed to another user, never added to a realtime publication.
  home_lat double precision,
  home_lng double precision,
  updated_at timestamptz not null default now(),
  constraint notification_prefs_radius_valid
    check (nearby_radius_miles in (1, 3, 5, 10))
);

alter table public.notification_prefs enable row level security;

drop policy if exists "notification_prefs_select_own" on public.notification_prefs;
create policy "notification_prefs_select_own"
  on public.notification_prefs for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "notification_prefs_insert_own" on public.notification_prefs;
create policy "notification_prefs_insert_own"
  on public.notification_prefs for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "notification_prefs_update_own" on public.notification_prefs;
create policy "notification_prefs_update_own"
  on public.notification_prefs for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Backfill for everyone who already has an account.
insert into public.notification_prefs (user_id)
select p.id from public.profiles p
on conflict (user_id) do nothing;

-- ...and for everyone created from here on. Kept separate from
-- handle_new_user() so re-running phase7/phase13 can't clobber it.
create or replace function public.create_default_notification_prefs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_prefs (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists profiles_default_notification_prefs on public.profiles;
create trigger profiles_default_notification_prefs
  after insert on public.profiles
  for each row execute function public.create_default_notification_prefs();

-- 3. The outbox -------------------------------------------------------------
create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  -- Which preference toggle governed this row. Stored for auditing: it makes
  -- "why did I get this?" answerable after the fact.
  category text not null,
  -- The specific event. This is what the app maps to a destination screen, so
  -- these strings are a contract with lib/notificationRoutes.ts — keep in sync.
  type text not null,
  title text not null,
  body text not null,
  -- Deep-link payload, e.g. {"screen":"Chat","jobId":"..."}.
  data jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  -- Makes every trigger idempotent: re-running the same event (or a retry of
  -- the same transaction) can't enqueue the same notification twice.
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint notification_outbox_status_valid
    check (status in ('pending', 'sent', 'failed', 'skipped'))
);

create index if not exists notification_outbox_pending_idx
  on public.notification_outbox (created_at) where status = 'pending';

-- RLS on with NO policies for `authenticated`: this table is server-side
-- plumbing. Clients must never read it — it contains other people's
-- notification content. The Edge Function reaches it with the service role,
-- which bypasses RLS. Triggers reach it as SECURITY DEFINER.
alter table public.notification_outbox enable row level security;

-- 4. The one gate every notification passes through -------------------------
-- Enforced HERE, server-side, rather than by hiding things in the app: a
-- client that never opens the settings screen, or a modified client, still
-- cannot cause a push that the recipient switched off.
create or replace function public.should_notify(
  p_recipient uuid,
  p_actor uuid,
  p_category text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_prefs public.notification_prefs;
  v_allowed boolean;
begin
  if p_recipient is null then
    return false;
  end if;
  -- Never notify someone about their own action.
  if p_actor is not null and p_actor = p_recipient then
    return false;
  end if;

  -- A suspended account gets nothing.
  if exists (select 1 from public.profiles p where p.id = p_recipient and p.banned) then
    return false;
  end if;

  if p_actor is not null then
    -- Blocking is symmetric (phase13) and cuts both directions.
    if public.is_blocked_between(p_recipient, p_actor) then
      return false;
    end if;
    -- A muted counterparty must not be able to buzz this user's phone. Mute
    -- is user-level in this app, so muting someone mutes every conversation
    -- and every job event involving them.
    if exists (
      select 1 from public.mutes m
      where m.muter_id = p_recipient and m.muted_id = p_actor
    ) then
      return false;
    end if;
    -- A banned actor's actions never generate notifications for anyone.
    if exists (select 1 from public.profiles p where p.id = p_actor and p.banned) then
      return false;
    end if;
  end if;

  select * into v_prefs from public.notification_prefs where user_id = p_recipient;
  -- No row yet (account created before this migration and backfill missed it):
  -- fall back to the same defaults the table declares rather than dropping it.
  if v_prefs.user_id is null then
    v_allowed := (p_category <> 'nearby_jobs');
  else
    v_allowed := case p_category
      when 'messages'      then v_prefs.messages
      when 'bids'          then v_prefs.bids
      when 'job_updates'   then v_prefs.job_updates
      when 'hire_requests' then v_prefs.hire_requests
      when 'nearby_jobs'   then v_prefs.nearby_jobs
      else true
    end;
  end if;

  if not v_allowed then
    return false;
  end if;

  -- Nothing to deliver to: don't grow the outbox with rows that can never be
  -- sent. A device registering later will pick up future events, not this one.
  return exists (
    select 1 from public.push_tokens t
    where t.user_id = p_recipient and t.active
  );
end;
$$;

comment on function public.should_notify(uuid, uuid, text) is
  'Single server-side gate: ban, block, mute, per-category preference, and having a live device.';

-- 5. Enqueue ----------------------------------------------------------------
create or replace function public.enqueue_notification(
  p_recipient uuid,
  p_actor uuid,
  p_category text,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb,
  p_dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.should_notify(p_recipient, p_actor, p_category) then
    return;
  end if;

  insert into public.notification_outbox (
    recipient_id, category, type, title, body, data, dedupe_key
  )
  values (
    p_recipient, p_category, p_type, p_title, p_body,
    coalesce(p_data, '{}'::jsonb), p_dedupe_key
  )
  on conflict (dedupe_key) do nothing;
end;
$$;

-- Small helper so notification copy doesn't say "null".
create or replace function public.notify_display_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(p.full_name), ''), 'Someone')
  from public.profiles p where p.id = p_user;
$$;

-- 6. Triggers ---------------------------------------------------------------

-- 6.1 New message in a conversation.
create or replace function public.notify_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.jobs;
  v_recipient uuid;
  v_preview text;
begin
  -- Hire-request events also insert a message row (phase18). Those are
  -- notified from the job_requests trigger, which knows the negotiation state
  -- — notifying here as well would double-buzz for a single action.
  if new.job_request_id is not null then
    return new;
  end if;

  select * into v_job from public.jobs where id = new.job_id;
  if v_job.id is null then
    return new;
  end if;

  v_recipient := case
    when v_job.client_id = new.sender_id then v_job.assigned_worker_id
    else v_job.client_id
  end;

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
    jsonb_build_object('screen', 'Chat', 'jobId', new.job_id::text),
    'message:' || new.id::text
  );

  return new;
end;
$$;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify
  after insert on public.messages
  for each row execute function public.notify_on_message();

-- 6.2 + 6.3 A bid arrives: tell the job's owner, and tell the other bidders.
create or replace function public.notify_on_bid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.jobs;
  v_worker_name text;
  v_rival record;
begin
  select * into v_job from public.jobs where id = new.job_id;
  if v_job.id is null then
    return new;
  end if;

  v_worker_name := public.notify_display_name(new.worker_id);

  -- (2) The client who posted the job.
  perform public.enqueue_notification(
    v_job.client_id,
    new.worker_id,
    'bids',
    'bid_received',
    'New bid on ' || left(v_job.title, 60),
    v_worker_name || ' bid $' || to_char(round(new.amount_cents / 100.0, 2), 'FM999999990.00'),
    jsonb_build_object('screen', 'ClientJobDetail', 'jobId', new.job_id::text),
    'bid_received:' || new.id::text
  );

  -- (3) Competitive pressure: everyone else who already bid on this job.
  -- Governed by the same 'bids' toggle — of the five switches the user has,
  -- this is bid activity, so it belongs with bids rather than job updates.
  for v_rival in
    select distinct b.worker_id
    from public.bids b
    where b.job_id = new.job_id
      and b.worker_id <> new.worker_id
      and b.status = 'pending'
  loop
    perform public.enqueue_notification(
      v_rival.worker_id,
      new.worker_id,
      'bids',
      'bid_competition',
      'Another bid came in',
      'Someone else bid on ' || left(v_job.title, 60) || '. Your bid is still pending.',
      jsonb_build_object('screen', 'JobDetail', 'jobId', new.job_id::text),
      'bid_competition:' || new.id::text || ':' || v_rival.worker_id::text
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists bids_notify on public.bids;
create trigger bids_notify
  after insert on public.bids
  for each row execute function public.notify_on_bid();

-- 6.4 + 6.5 Job lifecycle: assignment and completion.
create or replace function public.notify_on_job_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- (4) Assigned to a worker — covers both accepting a bid and a direct hire.
  if new.assigned_worker_id is not null
     and (old.assigned_worker_id is null or old.assigned_worker_id <> new.assigned_worker_id)
  then
    perform public.enqueue_notification(
      new.assigned_worker_id,
      new.client_id,
      'job_updates',
      'job_assigned',
      'You got the job',
      left(new.title, 80) || ' is yours. Tap for the details.',
      jsonb_build_object('screen', 'WorkerJob', 'jobId', new.id::text),
      'job_assigned:' || new.id::text || ':' || new.assigned_worker_id::text
    );
  end if;

  -- (5) Worker marked it complete — tell the client, and land them on the
  -- screen showing the completion photos.
  if new.status = 'completed' and old.status is distinct from 'completed' then
    perform public.enqueue_notification(
      new.client_id,
      new.assigned_worker_id,
      'job_updates',
      'job_completed',
      'Job marked complete',
      coalesce(public.notify_display_name(new.assigned_worker_id), 'The worker')
        || ' finished ' || left(new.title, 60) || '.',
      jsonb_build_object('screen', 'ClientJobDetail', 'jobId', new.id::text),
      'job_completed:' || new.id::text
    );
  end if;

  return new;
end;
$$;

drop trigger if exists jobs_notify_status on public.jobs;
create trigger jobs_notify_status
  after update on public.jobs
  for each row execute function public.notify_on_job_status();

-- DELIBERATELY NO INSERT TRIGGER FOR ASSIGNMENT.
--
-- An already-assigned job can only be INSERTed by respond_job_request() on
-- accept (since phase18, PostJobScreen's Hire Again calls create_job_request()
-- and never createJob(hireWorkerId), so that argument is unreachable from the
-- UI). That path already notifies through 'hire_accepted' above.
--
-- Adding an INSERT trigger here would misfire on exactly that path, because
-- respond_job_request() inserts the job BEFORE it sets job_requests.
-- created_job_id — so a "was this job created by a request?" guard reads false
-- at insert time. The result would be a second push for one action, and when
-- the worker is the one who tapped Accept, a push telling them about something
-- they just did.
--
-- Accepting a *bid* is an UPDATE (lib/bids.ts acceptBid sets status and
-- assigned_worker_id on the existing row), so it is covered by
-- jobs_notify_status above. Between the two, every assignment path notifies
-- exactly once.
drop trigger if exists jobs_notify_insert on public.jobs;
drop function if exists public.notify_on_job_insert();

-- 6.6 Hire Again negotiation events.
create or replace function public.notify_on_job_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
  v_actor uuid;
  v_amount text;
  v_title text;
  v_body text;
  v_type text;
begin
  v_amount := '$' || to_char(round(new.amount_cents / 100.0, 2), 'FM999999990.00');

  if tg_op = 'INSERT' then
    -- A new request always awaits the worker.
    v_recipient := new.awaiting_id;
    v_actor := new.client_id;
    v_type := 'hire_request';
    v_title := 'New job request';
    v_body := public.notify_display_name(v_actor) || ' wants to hire you for '
              || left(new.title, 50) || ' at ' || v_amount || '.';

  elsif new.status = 'countered'
        and (
          old.status is distinct from new.status
          or old.amount_cents is distinct from new.amount_cents
        ) then
    -- The turn passed to awaiting_id, so they are the one to tell.
    v_recipient := new.awaiting_id;
    v_actor := case when new.awaiting_id = new.client_id then new.worker_id else new.client_id end;
    v_type := 'hire_countered';
    v_title := 'Counter-offer';
    v_body := public.notify_display_name(v_actor) || ' countered at ' || v_amount || '.';

  elsif new.status in ('accepted', 'declined') and old.status is distinct from new.status then
    -- respond_job_request() parks awaiting_id on whoever acted, so the person
    -- to notify is the other party.
    v_actor := new.awaiting_id;
    v_recipient := case when new.awaiting_id = new.client_id then new.worker_id else new.client_id end;
    if new.status = 'accepted' then
      v_type := 'hire_accepted';
      v_title := 'Request accepted';
      v_body := public.notify_display_name(v_actor) || ' accepted at ' || v_amount || '.';
    else
      v_type := 'hire_declined';
      v_title := 'Request declined';
      v_body := public.notify_display_name(v_actor) || ' declined the request.';
    end if;

  else
    -- 'closed' is what the block trigger sets. Nobody wants a push telling
    -- them a negotiation ended because they were blocked.
    return new;
  end if;

  perform public.enqueue_notification(
    v_recipient,
    v_actor,
    'hire_requests',
    v_type,
    v_title,
    v_body,
    jsonb_build_object('screen', 'Chat', 'jobId', new.thread_job_id::text),
    v_type || ':' || new.id::text || ':' || new.updated_at::text
  );

  return new;
end;
$$;

drop trigger if exists job_requests_notify on public.job_requests;
create trigger job_requests_notify
  after insert or update on public.job_requests
  for each row execute function public.notify_on_job_request();

-- 6.7 A new open job near a worker, in a category they work in.
create or replace function public.notify_nearby_for_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.jobs;
  v_loc public.job_locations;
  v_candidate record;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if v_job.id is null or v_job.status <> 'open' then
    return;
  end if;

  select * into v_loc from public.job_locations where job_id = p_job_id;
  if v_loc.job_id is null then
    return;
  end if;

  for v_candidate in
    select np.user_id
    from public.notification_prefs np
    join public.profiles p on p.id = np.user_id
    where np.nearby_jobs
      and np.home_lat is not null
      and np.home_lng is not null
      and np.user_id <> v_job.client_id
      and not coalesce(p.banned, false)
      and (
        p.categories is null
        or array_length(p.categories, 1) is null
        or v_job.category::text = any(p.categories)
      )
      and v_loc.lat between np.home_lat - (np.nearby_radius_miles / 69.0)
                        and np.home_lat + (np.nearby_radius_miles / 69.0)
      and 3958.8 * 2 * asin(sqrt(
            power(sin(radians(v_loc.lat - np.home_lat) / 2), 2)
            + cos(radians(np.home_lat)) * cos(radians(v_loc.lat))
              * power(sin(radians(v_loc.lng - np.home_lng) / 2), 2)
          )) <= np.nearby_radius_miles
  loop
    perform public.enqueue_notification(
      v_candidate.user_id,
      v_job.client_id,
      'nearby_jobs',
      'job_nearby',
      'New job near you',
      left(v_job.title, 80) || coalesce(' · ' || v_job.location, ''),
      jsonb_build_object('screen', 'JobDetail', 'jobId', v_job.id::text),
      'job_nearby:' || v_job.id::text || ':' || v_candidate.user_id::text
    );
  end loop;
end;
$$;

-- Hung off job_locations rather than jobs: createJob() writes the job row
-- first and its coordinates second (lib/jobs.ts), so an AFTER INSERT on jobs
-- would run before any coordinates exist and every job would fail the radius
-- test. This fires at the moment both halves are present.
--
-- INSERT only, deliberately. `updateJob()` upserts this row when a job is
-- edited; in Postgres the ON CONFLICT DO UPDATE path fires UPDATE triggers,
-- not INSERT ones, so editing a job cannot re-notify everyone nearby.
create or replace function public.notify_on_job_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_nearby_for_job(new.job_id);
  return new;
end;
$$;

drop trigger if exists job_locations_notify_nearby on public.job_locations;
create trigger job_locations_notify_nearby
  after insert on public.job_locations
  for each row execute function public.notify_on_job_location();

-- 6.8 Review received.
create or replace function public.notify_on_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_notification(
    new.reviewee_id,
    new.reviewer_id,
    'job_updates',
    'review_received',
    'You got a review',
    public.notify_display_name(new.reviewer_id) || ' left you '
      || new.rating::text || '★.',
    jsonb_build_object('screen', 'ProfileMain'),
    'review:' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists reviews_notify on public.reviews;
create trigger reviews_notify
  after insert on public.reviews
  for each row execute function public.notify_on_review();

-- 7. Drain API for the Edge Function ----------------------------------------
-- Claims a batch and hands back everything needed to build Expo messages.
-- FOR UPDATE SKIP LOCKED so two concurrent invocations can't send the same
-- notification twice. Not granted to `authenticated` — service role only.
create or replace function public.claim_notification_batch(p_limit integer default 100)
returns table (
  outbox_id uuid,
  recipient_id uuid,
  type text,
  title text,
  body text,
  data jsonb,
  tokens text[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    select o.id
    from public.notification_outbox o
    where o.status = 'pending'
      and o.attempts < 5
    order by o.created_at
    limit greatest(1, least(coalesce(p_limit, 100), 100))
    for update skip locked
  ),
  marked as (
    update public.notification_outbox o
       set attempts = o.attempts + 1
      from claimed c
     where o.id = c.id
    returning o.*
  )
  select
    m.id,
    m.recipient_id,
    m.type,
    m.title,
    m.body,
    m.data,
    coalesce(
      array(
        select t.token from public.push_tokens t
        where t.user_id = m.recipient_id and t.active
      ),
      array[]::text[]
    )
  from marked m;
end;
$$;

revoke all on function public.claim_notification_batch(integer) from public;
revoke all on function public.claim_notification_batch(integer) from authenticated;
grant execute on function public.claim_notification_batch(integer) to service_role;

-- Result reporting, also service-role only.
create or replace function public.resolve_notification(
  p_outbox_id uuid,
  p_status text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notification_outbox
     set status = p_status,
         last_error = p_error,
         sent_at = case when p_status = 'sent' then now() else sent_at end
   where id = p_outbox_id;
end;
$$;

revoke all on function public.resolve_notification(uuid, text, text) from public;
revoke all on function public.resolve_notification(uuid, text, text) from authenticated;
grant execute on function public.resolve_notification(uuid, text, text) to service_role;

-- Expo says a token is dead -> stop sending to it.
create or replace function public.deactivate_push_token(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.push_tokens set active = false where token = p_token;
$$;

revoke all on function public.deactivate_push_token(text) from public;
revoke all on function public.deactivate_push_token(text) from authenticated;
grant execute on function public.deactivate_push_token(text) to service_role;

-- 8. OPTIONAL — low-latency delivery ----------------------------------------
-- Everything above works without this. Without it, the outbox is only drained
-- when something invokes the Edge Function.
--
-- This section needs pg_net and pg_cron (both available on Supabase, both must
-- be enabled under Database → Extensions), plus two settings holding the
-- function URL and your service role key. Run the two `alter database` lines
-- with YOUR values substituted, then the cron schedule.
--
--   alter database postgres set app.push_function_url =
--     'https://<YOUR-PROJECT-REF>.supabase.co/functions/v1/send-push';
--   alter database postgres set app.push_service_key = '<YOUR-SERVICE-ROLE-KEY>';
--
-- NOTE: the service role key stored this way is readable by any superuser of
-- this database. That is acceptable for a single-operator project; a hardened
-- setup should use Supabase Vault instead.
--
-- create extension if not exists pg_net;
-- create extension if not exists pg_cron;
--
-- -- Safety net + retries: drains anything still pending once a minute.
-- select cron.schedule(
--   'brazos-drain-push-outbox',
--   '* * * * *',
--   $cron$
--     select net.http_post(
--       url     := current_setting('app.push_function_url', true),
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer ' || current_setting('app.push_service_key', true)
--       ),
--       body    := '{}'::jsonb
--     )
--     where exists (select 1 from public.notification_outbox where status = 'pending');
--   $cron$
-- );

-- Marker so scripts/verify-schema.mjs can confirm this migration ran.
create or replace function public.push_notifications_enabled()
returns boolean
language sql
immutable
as $$
  select true;
$$;

revoke all on function public.push_notifications_enabled() from public;
grant execute on function public.push_notifications_enabled() to authenticated;
