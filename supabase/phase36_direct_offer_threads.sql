-- BRAZOS · Phase 36 · direct job offers to any worker
--
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- RUN THIS BEFORE SHIPPING THE APP BUILD THAT GOES WITH IT. The client reads
-- conversations.direct_thread_id and calls create_job_request with p_videos;
-- against a database without this migration the inbox query fails and sending
-- an offer resolves to no function.
--
-- WHAT WAS WRONG
-- --------------
-- phase18 made a hire request a private two-party negotiation living inside an
-- EXISTING conversation, and a conversation only exists around a job. So
-- create_job_request() required the pair to have already completed a job
-- together, and job_requests.thread_job_id was NOT NULL. The consequence on
-- screen: a worker you had hired before offered "Work with X again / Send an
-- offer", and a worker you had not offered "Direct offers open up once you've
-- completed a job together" plus a Post a job button. Same capability, two
-- different answers, decided by whether a row happened to exist.
--
-- WHAT THIS CHANGES
-- -----------------
-- A conversation no longer has to be about a job. `direct_threads` is one row
-- per unordered pair of people, and a message or a job request may belong to
-- one INSTEAD OF a job. Everything else about the negotiation is phase18's,
-- unchanged: the same table, the same alternating turn, the same three
-- counters a side, the same rule that a job row is created only on accept and
-- only as 'assigned', so a private offer can never reach the open-job feed,
-- job_hotspots() or jobs_in_cell() (all three filter status = 'open').
--
-- Thread resolution deliberately keeps the existing behavior first: an
-- explicit thread the caller names, then the pair's most recent shared
-- completed job — exactly what phase18 did — and only falls back to a direct
-- thread where phase18 used to raise 'No existing conversation with this
-- worker'. Nobody's existing Hire Again conversation moves.
--
-- One direct thread per pair, forever, so repeated offers between the same two
-- people never multiply into separate inbox entries.
--
-- WHY NOT REUSE message_reads FOR DIRECT-THREAD READ STATE
-- --------------------------------------------------------
-- message_reads is keyed (user_id, job_id) and the client upserts against that
-- exact conflict target. Making job_id nullable there would mean replacing the
-- primary key with partial unique indexes, which an ON CONFLICT (user_id,
-- job_id) upsert can no longer infer — it would break read receipts on every
-- existing job conversation to add them to a new one. The two read timestamps
-- live on direct_threads itself instead: additive, and nothing existing moves.

begin;

-- 1. The pair thread --------------------------------------------------------
--
-- user_a < user_b normalizes the pair, so "me and you" and "you and me" are
-- the same row no matter who opens the conversation first.

create table if not exists public.direct_threads (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  -- Read receipts for the two participants, in place of a message_reads row.
  user_a_read_at timestamptz,
  user_b_read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint direct_threads_ordered check (user_a < user_b),
  constraint direct_threads_pair_unique unique (user_a, user_b)
);

alter table public.direct_threads enable row level security;

-- SELECT only. There is deliberately no INSERT/UPDATE policy: threads are
-- created by the SECURITY DEFINER functions below, and read state is moved by
-- mark_direct_thread_read(), so nothing here can be written directly.
drop policy if exists "direct_threads_select_party" on public.direct_threads;
create policy "direct_threads_select_party"
  on public.direct_threads for select
  to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

-- 2. Messages may belong to a thread instead of a job -----------------------

alter table public.messages
  add column if not exists direct_thread_id uuid
    references public.direct_threads(id) on delete cascade;

alter table public.messages alter column job_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'messages_one_thread'
  ) then
    alter table public.messages
      add constraint messages_one_thread check (
        (job_id is not null and direct_thread_id is null)
        or (job_id is null and direct_thread_id is not null)
      );
  end if;
end $$;

create index if not exists messages_direct_thread_created_at_idx
  on public.messages (direct_thread_id, created_at);

-- 3. Message RLS, widened to cover direct threads ---------------------------
--
-- Both policies keep phase8's job branch and phase13's block/ban enforcement
-- exactly as they were, and add a second branch with the same shape for a
-- direct thread: you must be one of its two participants, and the pair must
-- not be blocked in either direction.

drop policy if exists "messages_select_party" on public.messages;
create policy "messages_select_party"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = messages.job_id
        and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
    )
    or exists (
      select 1 from public.direct_threads t
      where t.id = messages.direct_thread_id
        and (t.user_a = auth.uid() or t.user_b = auth.uid())
    )
  );

drop policy if exists "messages_insert_party" on public.messages;
create policy "messages_insert_party"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_active_user()
    and (
      exists (
        select 1 from public.jobs j
        where j.id = messages.job_id
          and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
          -- Neither direction of the pair may be blocked.
          and not public.is_blocked_between(
            j.client_id,
            coalesce(j.assigned_worker_id, j.client_id)
          )
      )
      or exists (
        select 1 from public.direct_threads t
        where t.id = messages.direct_thread_id
          and (t.user_a = auth.uid() or t.user_b = auth.uid())
          and not public.is_blocked_between(t.user_a, t.user_b)
      )
    )
  );

-- 4. Job requests may hang off a thread instead of a job --------------------

alter table public.job_requests
  add column if not exists direct_thread_id uuid
    references public.direct_threads(id) on delete cascade,
  -- Offers carry the same media a posting can, so the worker sees what the
  -- work actually is. Mirrors jobs.videos (phase34).
  add column if not exists videos jsonb not null default '[]'::jsonb;

alter table public.job_requests alter column thread_job_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'job_requests_one_thread'
  ) then
    alter table public.job_requests
      add constraint job_requests_one_thread check (
        (thread_job_id is not null and direct_thread_id is null)
        or (thread_job_id is null and direct_thread_id is not null)
      );
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'job_requests_videos_is_array'
  ) then
    alter table public.job_requests
      add constraint job_requests_videos_is_array
      check (jsonb_typeof(videos) = 'array');
  end if;
end $$;

create index if not exists job_requests_direct_thread_idx
  on public.job_requests (direct_thread_id, created_at);

-- 5. Get-or-create the pair's thread ----------------------------------------
--
-- Internal to the functions below — never granted to a client role, so a
-- thread can only ever come into existence as part of sending an offer.

create or replace function public.ensure_direct_thread(p_a uuid, p_b uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_low uuid := least(p_a, p_b);
  v_high uuid := greatest(p_a, p_b);
  v_id uuid;
begin
  if p_a is null or p_b is null or p_a = p_b then
    raise exception 'A direct thread needs two different people';
  end if;

  insert into public.direct_threads (user_a, user_b)
  values (v_low, v_high)
  on conflict (user_a, user_b) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.direct_threads
    where user_a = v_low and user_b = v_high;
  end if;

  return v_id;
end;
$$;

revoke all on function public.ensure_direct_thread(uuid, uuid) from public, anon, authenticated;

-- 6. Read state for a direct thread -----------------------------------------

create or replace function public.mark_direct_thread_read(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;

  update public.direct_threads
     set user_a_read_at = case when user_a = v_user then now() else user_a_read_at end,
         user_b_read_at = case when user_b = v_user then now() else user_b_read_at end
   where id = p_thread_id
     and (user_a = v_user or user_b = v_user);
end;
$$;

revoke all on function public.mark_direct_thread_read(uuid) from public, anon;
grant execute on function public.mark_direct_thread_read(uuid) to authenticated;

-- 7. Client proposes --------------------------------------------------------
--
-- The parameter list changes (p_videos), so the old signature is dropped
-- rather than left behind: two overloads differing only by a defaulted
-- trailing argument would make PostgREST's overload resolution ambiguous.
--
-- The body is phase18's with two changes: the "must have completed a job for
-- you" gate is gone (that gate was the defect), and thread resolution falls
-- back to the pair's direct thread instead of raising.

drop function if exists public.create_job_request(
  uuid, text, text, text, text, integer, jsonb, double precision, double precision, uuid
);

create or replace function public.create_job_request(
  p_worker_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_location text,
  p_amount_cents integer,
  p_photos jsonb default '[]'::jsonb,
  p_lat double precision default null,
  p_lng double precision default null,
  p_thread_job_id uuid default null,
  p_videos jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client uuid := auth.uid();
  v_thread uuid;
  v_direct uuid;
  v_request_id uuid;
begin
  if v_client is null then
    raise exception 'Not signed in';
  end if;
  if v_client = p_worker_id then
    raise exception 'You cannot send a request to yourself';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Enter an amount greater than zero';
  end if;
  -- Both parties must exist, and the recipient must be a real, active profile.
  -- job_request_parties_ok() covers blocks in either direction and bans.
  if not exists (select 1 from public.profiles p where p.id = p_worker_id) then
    raise exception 'That person is no longer available';
  end if;
  if not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if not public.job_request_parties_ok(v_client, p_worker_id) then
    raise exception 'This request cannot be sent';
  end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 80 then
    raise exception 'Title must be between 1 and 80 characters';
  end if;
  if length(btrim(coalesce(p_description, ''))) > 500 then
    raise exception 'Description must be 500 characters or fewer';
  end if;
  if jsonb_typeof(coalesce(p_photos, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_photos, '[]'::jsonb)) > 5 then
    raise exception 'Photos must be an array with at most 5 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) as photo(value)
    where jsonb_typeof(photo.value) <> 'string'
       or length(photo.value #>> '{}') > 2048
  ) then
    raise exception 'Each photo must be a valid URL or storage reference';
  end if;
  if jsonb_typeof(coalesce(p_videos, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_videos, '[]'::jsonb)) > 2 then
    raise exception 'Videos must be an array with at most 2 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_videos, '[]'::jsonb)) as video(value)
    where jsonb_typeof(video.value) <> 'string'
       or length(video.value #>> '{}') > 2048
  ) then
    raise exception 'Each video must be a valid URL or storage reference';
  end if;

  -- Thread resolution, in the order phase18 used. A caller that already knows
  -- the conversation (the chat screen) names it; otherwise the pair's most
  -- recent shared completed job stands in, which is the conversation they
  -- already have.
  if p_thread_job_id is not null then
    select j.id into v_thread
    from public.jobs j
    where j.id = p_thread_job_id
      and j.client_id = v_client
      and j.assigned_worker_id = p_worker_id;
  end if;

  if v_thread is null then
    select j.id into v_thread
    from public.jobs j
    where j.client_id = v_client
      and j.assigned_worker_id = p_worker_id
      and j.status = 'completed'
    order by j.created_at desc
    limit 1;
  end if;

  -- New in phase36: no shared job is no longer a dead end. The pair gets (or
  -- reuses) one direct thread, so a first offer and a tenth offer between the
  -- same two people land in the same conversation.
  if v_thread is null then
    v_direct := public.ensure_direct_thread(v_client, p_worker_id);
  end if;

  insert into public.job_requests (
    client_id, worker_id, thread_job_id, direct_thread_id,
    title, description, category, location, photos, videos, lat, lng,
    amount_cents, status, awaiting_id
  )
  values (
    v_client, p_worker_id, v_thread, v_direct,
    btrim(p_title), coalesce(btrim(p_description), ''), p_category, p_location,
    coalesce(p_photos, '[]'::jsonb), coalesce(p_videos, '[]'::jsonb), p_lat, p_lng,
    p_amount_cents, 'pending', p_worker_id
  )
  returning id into v_request_id;

  insert into public.messages (
    job_id, direct_thread_id, sender_id, content,
    job_request_id, request_event, request_amount_cents
  )
  values (
    v_thread, v_direct, v_client, '', v_request_id, 'created', p_amount_cents
  );

  return v_request_id;
exception
  when unique_violation then
    raise exception 'You already have an open request with this worker';
end;
$$;

revoke all on function public.create_job_request(
  uuid, text, text, text, text, integer, jsonb, double precision, double precision, uuid, jsonb
) from public, anon;
grant execute on function public.create_job_request(
  uuid, text, text, text, text, integer, jsonb, double precision, double precision, uuid, jsonb
) to authenticated;

-- 8. Respond ----------------------------------------------------------------
--
-- phase18's body, with three changes: events post into whichever thread the
-- request actually has, the created job carries the offer's videos as well as
-- its photos, and a repeated accept returns the job it already created instead
-- of raising — so a network retry cannot produce a second job or a spurious
-- error on an action that in fact succeeded.

create or replace function public.respond_job_request(
  p_request_id uuid,
  p_action text,
  p_amount_cents integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_req public.job_requests;
  v_job_id uuid;
  v_is_client boolean;
begin
  if v_actor is null then
    raise exception 'Not signed in';
  end if;

  -- Lock the row so two simultaneous responses can't both act on the same
  -- turn (e.g. accept and counter racing).
  select * into v_req from public.job_requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'Request not found';
  end if;
  if v_actor <> v_req.client_id and v_actor <> v_req.worker_id then
    raise exception 'Request not found';
  end if;

  -- Idempotent accept: the caller already accepted this and is retrying (a
  -- dropped response, a double tap that got past the disabled button). Hand
  -- back the job that was created then rather than creating another.
  if p_action = 'accept'
     and v_req.status = 'accepted'
     and v_req.created_job_id is not null then
    return v_req.created_job_id;
  end if;

  if v_req.status not in ('pending', 'countered') then
    raise exception 'This request is no longer open';
  end if;
  if v_req.awaiting_id <> v_actor then
    raise exception 'It is not your turn to respond to this request';
  end if;
  if not public.job_request_parties_ok(v_req.client_id, v_req.worker_id) then
    raise exception 'This request cannot be updated';
  end if;

  v_is_client := (v_actor = v_req.client_id);

  if p_action = 'accept' then
    -- Create the real job here, and ONLY here. Status goes straight to
    -- 'assigned' so it never enters the public open-job feed or the map.
    insert into public.jobs (
      client_id, title, description, category, location,
      budget_cents, status, assigned_worker_id, final_amount_cents,
      photos, videos
    )
    values (
      v_req.client_id, v_req.title, v_req.description, v_req.category::job_category,
      v_req.location, v_req.amount_cents, 'assigned', v_req.worker_id,
      v_req.amount_cents, v_req.photos, coalesce(v_req.videos, '[]'::jsonb)
    )
    returning id into v_job_id;

    if v_req.lat is not null and v_req.lng is not null then
      insert into public.job_locations (job_id, lat, lng)
      values (v_job_id, v_req.lat, v_req.lng)
      on conflict (job_id) do update set lat = excluded.lat, lng = excluded.lng;
    end if;

    update public.job_requests
       set status = 'accepted',
           created_job_id = v_job_id,
           awaiting_id = v_actor,
           updated_at = now()
     where id = p_request_id;

    insert into public.messages (
      job_id, direct_thread_id, sender_id, content,
      job_request_id, request_event, request_amount_cents
    )
    values (
      v_req.thread_job_id, v_req.direct_thread_id, v_actor, '',
      p_request_id, 'accepted', v_req.amount_cents
    );

    return v_job_id;

  elsif p_action = 'decline' then
    update public.job_requests
       set status = 'declined',
           awaiting_id = v_actor,
           updated_at = now()
     where id = p_request_id;

    insert into public.messages (
      job_id, direct_thread_id, sender_id, content,
      job_request_id, request_event, request_amount_cents
    )
    values (
      v_req.thread_job_id, v_req.direct_thread_id, v_actor, '',
      p_request_id, 'declined', v_req.amount_cents
    );

    return null;

  elsif p_action = 'counter' then
    if p_amount_cents is null or p_amount_cents <= 0 then
      raise exception 'Enter an amount greater than zero';
    end if;

    -- Three counters each. Past that, the only moves left are accept or
    -- decline, so a negotiation can't run forever.
    if v_is_client and v_req.client_counters >= 3 then
      raise exception 'You have used all 3 counter-offers. Accept or decline to continue.';
    end if;
    if (not v_is_client) and v_req.worker_counters >= 3 then
      raise exception 'You have used all 3 counter-offers. Accept or decline to continue.';
    end if;

    update public.job_requests
       set amount_cents = p_amount_cents,
           status = 'countered',
           awaiting_id = case when v_is_client then v_req.worker_id else v_req.client_id end,
           client_counters = v_req.client_counters + (case when v_is_client then 1 else 0 end),
           worker_counters = v_req.worker_counters + (case when v_is_client then 0 else 1 end),
           updated_at = now()
     where id = p_request_id;

    insert into public.messages (
      job_id, direct_thread_id, sender_id, content,
      job_request_id, request_event, request_amount_cents
    )
    values (
      v_req.thread_job_id, v_req.direct_thread_id, v_actor, '',
      p_request_id, 'countered', p_amount_cents
    );

    return null;
  end if;

  raise exception 'Unknown action: %', p_action;
end;
$$;

revoke all on function public.respond_job_request(uuid, text, integer) from public, anon;
grant execute on function public.respond_job_request(uuid, text, integer) to authenticated;

-- 9. Inbox badge ------------------------------------------------------------
-- Return shape gains direct_thread_id, so the signature is replaced.

drop function if exists public.my_pending_job_requests();

create or replace function public.my_pending_job_requests()
returns table (
  id uuid,
  thread_job_id uuid,
  direct_thread_id uuid,
  client_id uuid,
  worker_id uuid,
  amount_cents integer,
  status text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.thread_job_id, r.direct_thread_id, r.client_id, r.worker_id,
         r.amount_cents, r.status, r.updated_at
  from public.job_requests r
  where r.awaiting_id = auth.uid()
    and r.status in ('pending', 'countered')
  order by r.updated_at desc;
$$;

revoke all on function public.my_pending_job_requests() from public, anon;
grant execute on function public.my_pending_job_requests() to authenticated;

-- 10. The inbox view --------------------------------------------------------
--
-- Now a union: one row per job conversation (exactly as before) plus one row
-- per direct thread that has at least one message.
--
-- client_id / assigned_worker_id are reused for a direct thread's two
-- participants rather than renamed. That is deliberate: the app resolves "the
-- other person" from those two columns and filters the inbox on them, so
-- keeping the names means a direct conversation needs no separate code path to
-- work out who it is with. For a direct thread they simply mean participant A
-- and participant B, with no client/worker relationship implied.
--
-- security_invoker = true keeps RLS applying as the caller, so this view can
-- never widen what a user can read.

drop view if exists public.conversations;

create view public.conversations
with (security_invoker = true) as
select
  m.job_id,
  null::uuid as direct_thread_id,
  j.title as job_title,
  j.client_id,
  j.assigned_worker_id,
  m.id as last_message_id,
  m.sender_id as last_message_sender_id,
  m.content as last_message_content,
  m.image_url as last_message_image_url,
  m.audio_url as last_message_audio_url,
  m.unsent_at as last_message_unsent_at,
  m.created_at as last_message_at,
  null::timestamptz as my_read_at
from (
  select distinct on (job_id) *
  from public.messages
  where job_id is not null
  order by job_id, created_at desc
) m
join public.jobs j on j.id = m.job_id

union all

select
  null::uuid as job_id,
  t.id as direct_thread_id,
  null::text as job_title,
  t.user_a as client_id,
  t.user_b as assigned_worker_id,
  m.id as last_message_id,
  m.sender_id as last_message_sender_id,
  m.content as last_message_content,
  m.image_url as last_message_image_url,
  m.audio_url as last_message_audio_url,
  m.unsent_at as last_message_unsent_at,
  m.created_at as last_message_at,
  case when t.user_a = auth.uid() then t.user_a_read_at else t.user_b_read_at end
    as my_read_at
from (
  select distinct on (direct_thread_id) *
  from public.messages
  where direct_thread_id is not null
  order by direct_thread_id, created_at desc
) m
join public.direct_threads t on t.id = m.direct_thread_id;

grant select on public.conversations to authenticated;

-- 11. Realtime --------------------------------------------------------------
-- The inbox needs to notice a brand-new direct thread, not only new messages
-- in one it already knows about. Guarded the same way as the phase1/phase8/
-- phase18 publication additions.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'direct_threads'
  ) then
    alter publication supabase_realtime add table public.direct_threads;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
