-- ============================================================================
-- Brazos · Hire Again as a request/negotiation + message replies
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- Contents
--   1. messages.reply_to_id            — WhatsApp-style quoted replies
--   2. messages.job_request_id + event — negotiation events rendered in-thread
--   3. job_requests table + RLS        — the negotiation state machine
--   4. create_job_request()            — client proposes (does NOT assign)
--   5. respond_job_request()           — accept / decline / counter
--   6. my_pending_job_requests()       — inbox badge (no push notifications yet)
--   7. blocks trigger                  — auto-close a negotiation on block
--
-- ---------------------------------------------------------------------------
-- WHY A SEPARATE TABLE RATHER THAN REUSING `bids`
-- ---------------------------------------------------------------------------
-- Bids answer a PUBLIC open job that many workers compete for; a hire request
-- is a PRIVATE two-party negotiation with an alternating turn and a counter
-- budget on each side. Overloading `bids` would mean adding turn-tracking and
-- direction to a table whose RLS, uniqueness (one bid per worker per job) and
-- accept path are all built around the competitive model — and would risk
-- these private requests leaking into the open-job flows that already work.
-- They stay completely separate.
--
-- ---------------------------------------------------------------------------
-- WHY NO JOB ROW EXISTS UNTIL ACCEPT
-- ---------------------------------------------------------------------------
-- The request is not a job. `jobs` is what the Map/Discover feed and the
-- hotspot RPCs read, so creating a row up-front would risk exposing a private
-- negotiation publicly. A job row is created only by respond_job_request()
-- on accept, and then directly as 'assigned' — never 'open' — so it cannot
-- appear in job_hotspots()/jobs_in_cell() (both filter status = 'open') or in
-- the browse feed (jobs_select_open, same filter).
-- ============================================================================

-- 1 + 2. Message columns ----------------------------------------------------
alter table public.messages
  -- Quoted reply. ON DELETE SET NULL so deleting a quoted message leaves the
  -- reply intact rather than cascading it away.
  add column if not exists reply_to_id uuid references public.messages(id) on delete set null,
  add column if not exists job_request_id uuid,
  -- The event this message RECORDS, snapshotted at the time it happened.
  -- Deliberately not derived from the request's live status: the thread is a
  -- chronological log, so an old "countered $80" entry must keep saying that
  -- even after the request is later accepted at a different price.
  add column if not exists request_event text,
  add column if not exists request_amount_cents integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'messages_request_event_valid'
  ) then
    alter table public.messages
      add constraint messages_request_event_valid check (
        request_event is null
        or request_event in ('created', 'countered', 'accepted', 'declined', 'closed')
      );
  end if;
end $$;

create index if not exists messages_job_request_idx
  on public.messages (job_request_id, created_at);

-- 3. The negotiation --------------------------------------------------------
create table if not exists public.job_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  -- The EXISTING conversation this negotiation lives in. Requests never create
  -- a new thread — they attach to the past job the two already share.
  thread_job_id uuid not null references public.jobs(id) on delete cascade,

  -- Proposed terms, held here until (and unless) a job is actually created.
  title text not null,
  description text not null default '',
  category text not null,
  location text,
  photos jsonb not null default '[]'::jsonb,
  lat double precision,
  lng double precision,

  -- Current proposed price. Updated by each counter; whatever it holds when
  -- the request is accepted becomes the job's budget.
  amount_cents integer not null,

  status text not null default 'pending',
  -- Whose turn it is to respond. Always the party who did NOT make the last
  -- move, so "can I act?" is a single comparison rather than inferred state.
  awaiting_id uuid not null references public.profiles(id) on delete cascade,

  client_counters integer not null default 0,
  worker_counters integer not null default 0,

  created_job_id uuid references public.jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint job_requests_no_self check (client_id <> worker_id),
  constraint job_requests_amount_positive check (amount_cents > 0),
  constraint job_requests_status_valid check (
    status in ('pending', 'countered', 'accepted', 'declined', 'closed')
  ),
  constraint job_requests_category_valid check (
    category in (
      'dog_walking', 'cleaning', 'moving', 'yard_work',
      'handyman', 'errands', 'other'
    )
  )
);

create index if not exists job_requests_awaiting_idx
  on public.job_requests (awaiting_id, status);
create index if not exists job_requests_thread_idx
  on public.job_requests (thread_job_id, created_at);

-- At most ONE live negotiation per client/worker pair. Prevents a client from
-- spamming a worker with parallel requests, and removes the ambiguity of
-- "which request does this counter apply to". Partial unique index, so
-- settled requests (accepted/declined/closed) don't block a future one.
create unique index if not exists job_requests_one_open_per_pair
  on public.job_requests (client_id, worker_id)
  where status in ('pending', 'countered');

alter table public.job_requests enable row level security;

-- SELECT: only the two parties. There is deliberately no INSERT/UPDATE policy
-- — every write goes through the SECURITY DEFINER functions below, so the
-- turn order, counter caps and job creation can't be bypassed by writing to
-- the table directly.
drop policy if exists "job_requests_select_party" on public.job_requests;
create policy "job_requests_select_party"
  on public.job_requests for select
  to authenticated
  using (client_id = auth.uid() or worker_id = auth.uid());

-- Now that job_requests exists, point the message column at it.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'messages_job_request_fk'
  ) then
    alter table public.messages
      add constraint messages_job_request_fk
      foreign key (job_request_id) references public.job_requests(id) on delete cascade;
  end if;
end $$;

-- Shared guard. These functions are SECURITY DEFINER, which means they run
-- past the RLS that normally enforces phase13's moderation rules — so the
-- block and ban checks that jobs_insert_own / messages_insert_party would
-- have applied have to be made explicitly here instead.
create or replace function public.job_request_parties_ok(p_a uuid, p_b uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.is_blocked_between(p_a, p_b) then
    return false;
  end if;
  if exists (
    select 1 from public.profiles p
    where p.id in (p_a, p_b) and p.banned
  ) then
    return false;
  end if;
  return true;
end;
$$;

-- 4. Client proposes --------------------------------------------------------
-- Creates the request and posts it into the shared thread. Does NOT create a
-- job — that only happens on accept.
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
  p_thread_job_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid := auth.uid();
  v_thread uuid;
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
  if not public.job_request_parties_ok(v_client, p_worker_id) then
    raise exception 'This request cannot be sent';
  end if;

  -- Eligibility is the same rule as the Hire Again button: this worker must
  -- have completed a job for this client before.
  if not exists (
    select 1 from public.jobs j
    where j.client_id = v_client
      and j.assigned_worker_id = p_worker_id
      and j.status = 'completed'
  ) then
    raise exception 'You can only send a request to a worker who has completed a job for you';
  end if;

  -- Resolve the thread to post into. Callers that already know it (the chat
  -- screen) pass it; callers that don't (a bid card) let the most recent
  -- shared completed job stand in, which is the conversation they have.
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

  if v_thread is null then
    raise exception 'No existing conversation with this worker to send the request in';
  end if;

  insert into public.job_requests (
    client_id, worker_id, thread_job_id,
    title, description, category, location, photos, lat, lng,
    amount_cents, status, awaiting_id
  )
  values (
    v_client, p_worker_id, v_thread,
    p_title, coalesce(p_description, ''), p_category, p_location,
    coalesce(p_photos, '[]'::jsonb), p_lat, p_lng,
    p_amount_cents, 'pending', p_worker_id
  )
  returning id into v_request_id;

  insert into public.messages (
    job_id, sender_id, content, job_request_id, request_event, request_amount_cents
  )
  values (v_thread, v_client, '', v_request_id, 'created', p_amount_cents);

  return v_request_id;
exception
  when unique_violation then
    raise exception 'You already have an open request with this worker';
end;
$$;

revoke all on function public.create_job_request(uuid, text, text, text, text, integer, jsonb, double precision, double precision, uuid) from public;
grant execute on function public.create_job_request(uuid, text, text, text, text, integer, jsonb, double precision, double precision, uuid) to authenticated;

-- 5. Respond ----------------------------------------------------------------
-- accept  -> creates the job, assigned at the current amount
-- decline -> closes the request, no job
-- counter -> proposes a different amount and passes the turn back
create or replace function public.respond_job_request(
  p_request_id uuid,
  p_action text,
  p_amount_cents integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
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
      budget_cents, status, assigned_worker_id, final_amount_cents, photos
    )
    values (
      v_req.client_id, v_req.title, v_req.description, v_req.category::job_category,
      v_req.location, v_req.amount_cents, 'assigned', v_req.worker_id,
      v_req.amount_cents, v_req.photos
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
      job_id, sender_id, content, job_request_id, request_event, request_amount_cents
    )
    values (v_req.thread_job_id, v_actor, '', p_request_id, 'accepted', v_req.amount_cents);

    return v_job_id;

  elsif p_action = 'decline' then
    update public.job_requests
       set status = 'declined',
           awaiting_id = v_actor,
           updated_at = now()
     where id = p_request_id;

    insert into public.messages (
      job_id, sender_id, content, job_request_id, request_event, request_amount_cents
    )
    values (v_req.thread_job_id, v_actor, '', p_request_id, 'declined', v_req.amount_cents);

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
      job_id, sender_id, content, job_request_id, request_event, request_amount_cents
    )
    values (v_req.thread_job_id, v_actor, '', p_request_id, 'countered', p_amount_cents);

    return null;
  end if;

  raise exception 'Unknown action: %', p_action;
end;
$$;

revoke all on function public.respond_job_request(uuid, text, integer) from public;
grant execute on function public.respond_job_request(uuid, text, integer) to authenticated;

-- 6. Inbox badge ------------------------------------------------------------
-- There are no push notifications yet, so the conversation list has to be the
-- thing that surfaces a waiting request. Returns the open requests where it's
-- the caller's turn, keyed by the thread they live in.
create or replace function public.my_pending_job_requests()
returns table (
  id uuid,
  thread_job_id uuid,
  client_id uuid,
  worker_id uuid,
  amount_cents integer,
  status text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.thread_job_id, r.client_id, r.worker_id,
         r.amount_cents, r.status, r.updated_at
  from public.job_requests r
  where r.awaiting_id = auth.uid()
    and r.status in ('pending', 'countered')
  order by r.updated_at desc;
$$;

revoke all on function public.my_pending_job_requests() from public;
grant execute on function public.my_pending_job_requests() to authenticated;

-- 7. Blocking auto-closes a live negotiation --------------------------------
-- Without this, blocking someone mid-negotiation leaves the request sitting
-- in the other person's queue forever: they can't be messaged, the RPCs
-- refuse to act on it, and nothing ever resolves it.
create or replace function public.close_requests_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.job_requests
     set status = 'closed',
         updated_at = now()
   where status in ('pending', 'countered')
     and (
       (client_id = new.blocker_id and worker_id = new.blocked_id)
       or (client_id = new.blocked_id and worker_id = new.blocker_id)
     );
  return new;
end;
$$;

drop trigger if exists blocks_close_job_requests on public.blocks;
create trigger blocks_close_job_requests
  after insert on public.blocks
  for each row execute function public.close_requests_on_block();

-- 8. Realtime ---------------------------------------------------------------
-- The negotiation card's buttons are driven by job_requests (whose turn, how
-- many counters remain, whether it's settled) — not by the message rows. So
-- without this, a counter-offer or an accept from the other side would leave
-- the card showing a stale turn until the screen was reopened. Guarded the
-- same way as the phase1/phase8 publication additions.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'job_requests'
  ) then
    alter publication supabase_realtime add table public.job_requests;
  end if;
end $$;
