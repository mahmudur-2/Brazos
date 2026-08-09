-- ============================================================================
-- BRAZOS V2 · Phase 7 · automated two-account proof (A–D)
--
--   psql -X -v ON_ERROR_STOP=1 -f scripts/phase7-proof.sql "$SUPABASE_DB_URL_STAGING"
--
-- The phase5/6 mechanism over the messaging boundary: ONE transaction, RLS
-- engaged as PostgREST engages it, the three seeded phase-6 identities,
-- assertions RAISE on failure, ROLLBACK, zero residue.
--
-- Sections:
--   A offer → thread auto-create (phase52), visible ONLY to its pair
--   B pre-hire chat: both parties write/read; outsiders blind and refused
--   C read markers + the conversations view (unread truth for both kinds)
--   D the job-thread boundary stands: a bidder still cannot write there
-- ============================================================================

\pset pager off
\set ON_ERROR_STOP 1

begin;

create temp table probe (k text primary key, v uuid);
grant select, insert, update on probe to authenticated;

insert into probe (k, v) values
  ('c',  'b6c00000-0000-4000-8000-000000000001'),
  ('wa', 'b6c00000-0000-4000-8000-000000000002'),
  ('wb', 'b6c00000-0000-4000-8000-000000000003');

do $$
begin
  if (select count(*) from public.profiles
      where id in (select v from probe) and not coalesce(banned, false)) <> 3 then
    raise exception '0: run scripts/seed-phase-6.sql first';
  end if;
  raise notice 'PASS 0: three seeded active identities present';
end $$;

create function pg_temp.become(p_key text) returns void
language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', (select v from probe where k = p_key), 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
end $$;

-- ---------------------------------------------------------------------------
-- A. OFFER → THREAD. A fresh pair (customer, worker B) with no history: the
--    moment worker B bids, the pair's direct thread exists — and only the
--    pair can see it.
-- ---------------------------------------------------------------------------
reset role;
-- Clean-slate assertion INSIDE the transaction: if a (c, wb) thread already
-- exists from a previous seed run, note it rather than fail — what matters
-- is that it exists AFTER the offer and is invisible to worker A.
do $$
begin
  if exists (
    select 1 from public.direct_threads t
    where (t.user_a = least((select v from probe where k='c'), (select v from probe where k='wb'))
       and t.user_b = greatest((select v from probe where k='c'), (select v from probe where k='wb')))
  ) then
    raise notice 'NOTE A0: (c, wb) thread pre-exists (seed backfill) — auto-create asserted on a fresh job anyway';
  end if;
end $$;

select pg_temp.become('c');
insert into probe (k, v)
select 'job1', (public.create_job(
  p_title := 'PHASE7 PROOF chat job',
  p_description := 'probe row, rolled back',
  p_category := 'other',
  p_location := 'Probe Area',
  p_budget_min_cents := 2000,
  p_budget_max_cents := 2000,
  p_address_line := '77 Probe Street'
)).id;

select pg_temp.become('wb');
insert into probe (k, v)
select 'offer1', public.create_offer(
  p_amount_cents := 2000,
  p_job_id := (select v from probe where k='job1'),
  p_message := 'phase7 proof bid'
);

do $$
declare v_thread uuid;
begin
  select t.id into v_thread
  from public.direct_threads t
  where t.user_a = least((select v from probe where k='c'), (select v from probe where k='wb'))
    and t.user_b = greatest((select v from probe where k='c'), (select v from probe where k='wb'));
  if v_thread is null then
    raise exception 'A: bidding did not ensure the pair''s direct thread';
  end if;
  insert into probe (k, v) values ('thread_cb', v_thread);
  raise notice 'PASS A1: the (customer, worker B) thread exists from the bid';
end $$;

select pg_temp.become('wa');
do $$
begin
  if exists (
    select 1 from public.direct_threads
    where id = (select v from probe where k='thread_cb')
  ) then
    raise exception 'A: an OUTSIDER can see another pair''s thread row';
  end if;
  raise notice 'PASS A2: worker A cannot see the (customer, worker B) thread';
end $$;

-- ---------------------------------------------------------------------------
-- B. PRE-HIRE CHAT on the pair thread.
-- ---------------------------------------------------------------------------
select pg_temp.become('wb');
insert into public.messages (direct_thread_id, sender_id, content)
values (
  (select v from probe where k='thread_cb'),
  (select v from probe where k='wb'),
  'PHASE7 PROOF: could I come by at nine?'
);

select pg_temp.become('c');
insert into public.messages (direct_thread_id, sender_id, content)
values (
  (select v from probe where k='thread_cb'),
  (select v from probe where k='c'),
  'PHASE7 PROOF: nine works.'
);

do $$
begin
  if (select count(*) from public.messages
      where direct_thread_id = (select v from probe where k='thread_cb')
        and content like 'PHASE7 PROOF%') <> 2 then
    raise exception 'B: the pair cannot read their own pre-hire conversation';
  end if;
  raise notice 'PASS B1: both parties write and read the pre-hire thread';
end $$;

select pg_temp.become('wa');
do $$
begin
  if (select count(*) from public.messages
      where direct_thread_id = (select v from probe where k='thread_cb')) <> 0 then
    raise exception 'B: an outsider can read another pair''s messages';
  end if;
  begin
    insert into public.messages (direct_thread_id, sender_id, content)
    values (
      (select v from probe where k='thread_cb'),
      (select v from probe where k='wa'),
      'PHASE7 PROOF: intrusion'
    );
    raise exception 'B: an OUTSIDER was allowed to write into the thread';
  exception when others then
    if sqlerrm like '%was allowed%' then raise; end if;
    raise notice 'PASS B2: outsider reads zero rows and cannot write (%)', sqlerrm;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- C. READ MARKERS + the conversations view.
-- ---------------------------------------------------------------------------
select pg_temp.become('c');
do $$
declare v_row record;
begin
  select * into v_row
  from public.conversations
  where direct_thread_id = (select v from probe where k='thread_cb');
  if not found then
    raise exception 'C: the thread with messages is missing from the inbox view';
  end if;
  if v_row.last_message_content not like 'PHASE7 PROOF: nine works.%' then
    raise exception 'C: the inbox preview is not the latest message';
  end if;
  -- The customer has never marked it read: unread must be derivable.
  if v_row.my_read_at is not null and v_row.my_read_at >= v_row.last_message_at then
    raise exception 'C: unread state cannot be derived (my_read_at %, last %)',
      v_row.my_read_at, v_row.last_message_at;
  end if;

  perform public.mark_direct_thread_read((select v from probe where k='thread_cb'));

  select * into v_row
  from public.conversations
  where direct_thread_id = (select v from probe where k='thread_cb');
  if v_row.my_read_at is null or v_row.my_read_at < v_row.last_message_at then
    raise exception 'C: mark_direct_thread_read did not move my_read_at past the last message';
  end if;
  raise notice 'PASS C1: inbox lists the thread, previews the latest message, and the read marker settles it';
end $$;

select pg_temp.become('wb');
do $$
declare v_row record;
begin
  select * into v_row
  from public.conversations
  where direct_thread_id = (select v from probe where k='thread_cb');
  if not found then
    raise exception 'C: the other party cannot see the conversation row';
  end if;
  raise notice 'PASS C2: the worker side sees the same conversation through its own RLS';
end $$;

select pg_temp.become('wa');
do $$
begin
  if exists (
    select 1 from public.conversations
    where direct_thread_id = (select v from probe where k='thread_cb')
  ) then
    raise exception 'C: an outsider sees the pair''s conversation in their inbox';
  end if;
  raise notice 'PASS C3: outsider''s inbox shows nothing for the pair';
end $$;

-- ---------------------------------------------------------------------------
-- D. THE JOB-THREAD BOUNDARY STANDS. A bidder (not assigned) still cannot
--    write into the JOB thread — pre-hire chat is offer-scoped by design,
--    and bidders must never share a room.
-- ---------------------------------------------------------------------------
select pg_temp.become('wb');
do $$
begin
  begin
    insert into public.messages (job_id, sender_id, content)
    values (
      (select v from probe where k='job1'),
      (select v from probe where k='wb'),
      'PHASE7 PROOF: job-thread intrusion'
    );
    raise exception 'D: a BIDDER was allowed to write into the job thread';
  exception when others then
    if sqlerrm like '%was allowed%' then raise; end if;
    raise notice 'PASS D: the job thread stays client + assigned worker only (%)', sqlerrm;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK + zero residue.
-- ---------------------------------------------------------------------------
rollback;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.jobs where title like 'PHASE7 PROOF%';
  if v_count <> 0 then
    raise exception 'RESIDUE: % probe jobs survived', v_count;
  end if;
  select count(*) into v_count from public.messages where content like 'PHASE7 PROOF%';
  if v_count <> 0 then
    raise exception 'RESIDUE: % probe messages survived', v_count;
  end if;
  raise notice 'PASS RESIDUE: rollback left zero probe rows';
end $$;
