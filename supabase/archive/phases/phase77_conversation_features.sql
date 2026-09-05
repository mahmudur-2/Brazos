-- ============================================================================
-- phase77_conversation_features.sql
--
-- The schema half of the flagged conversation features in lib/featureFlags.ts:
-- HIDDEN_CHATS, ARCHIVE, CLEAR_CHAT, DELETE_CHAT (S-1/S-2), TIMED_BLOCK (S-3),
-- READ_TICKS (S-4), MARK_UNREAD (S-5), DOCUMENTS (S-6), LIVE_LOCATION (S-7).
-- DELIVERED_TICKS (S-8) is deliberately NOT here: nothing in this schema can
-- distinguish "the insert succeeded" from "the other device has the row", and
-- inventing a signal would make the tick a lie. What it would take is named in
-- the run report: a per-recipient delivered_at store plus a device-side ack
-- path that runs on receipt (a background notification handler or a service
-- extension writing an ack RPC), neither of which exists.
--
-- Hand-applied to STAGING only, in the Supabase SQL Editor, by the operator.
-- One transaction. Safe to run more than once. Expected runtime: a few
-- seconds (the proof matrix creates two throwaway users under a savepoint and
-- rolls them back). On a precondition failure it raises a named PHASE77
-- exception and the whole file rolls back with nothing applied. ASCII only.
--
-- EVERY FEATURE HERE WORKS ON BOTH THREAD KINDS - job threads keyed by
-- messages.job_id and direct threads keyed by messages.direct_thread_id -
-- because one on-screen conversation folds both kinds together.
--
-- Section map, ordered by dependency:
--   0. Preconditions (raise and roll back rather than half-apply)
--   1. S-3  blocks.expires_at             - must precede section 2: a
--           LANGUAGE SQL body is parsed against the catalog at CREATE time
--   2. S-3  is_blocked_between            - same signature, same language,
--           expiry-aware
--   3. S-3  set_block()                   - the only expiry write path
--   4. S-1/S-2 conversation_states + set_conversation_state()
--   5. S-4  message_reads party visibility + realtime
--   6. S-5  set_direct_thread_read_at()
--   7. S-6  message document columns, the conversations view, chat-documents
--   8. S-7  live_location_shares + RPCs + realtime
--   9. Proof matrix for the amended block predicate (savepoint, rolled back)
--  10. Self-check (any failure aborts the whole file)
--  11. Sentinel, created last
-- ============================================================================

begin;

-- Transaction-scoped default, the phase68/76 convention. Every function
-- created below also pins its own search_path independently.
set local search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 0. Preconditions. Each raises rather than letting the file half-apply
--    against a database it was not written for (the phase66/phase76 pattern).
-- ---------------------------------------------------------------------------
do $$
declare
  v_table text;
  v_col text;
  v_cols text[];
  v_overloads integer;
  v_lang text;
  v_secdef boolean;
  v_required_policies constant text[][] := array[
    ['public',  'messages',      'messages_insert_party'],
    ['public',  'messages',      'messages_select_party'],
    ['public',  'direct_threads','direct_threads_select_party'],
    ['public',  'message_reads', 'message_reads_select_own'],
    ['public',  'message_reads', 'message_reads_insert_own'],
    ['public',  'message_reads', 'message_reads_update_own'],
    ['storage', 'objects',       'chat_photos_insert_party'],
    ['storage', 'objects',       'chat_audio_insert_party']
  ];
  -- The conversations view as phase36 left it. Recreating a view DROPS any
  -- column not restated, so this file refuses to run over an unexpected
  -- shape instead of silently destroying someone else's column.
  v_view_required constant text[] := array[
    'job_id', 'direct_thread_id', 'job_title', 'client_id',
    'assigned_worker_id', 'last_message_id', 'last_message_sender_id',
    'last_message_content', 'last_message_image_url',
    'last_message_audio_url', 'last_message_unsent_at', 'last_message_at',
    'my_read_at'
  ];
  v_view_allowed constant text[] := array[
    'job_id', 'direct_thread_id', 'job_title', 'client_id',
    'assigned_worker_id', 'last_message_id', 'last_message_sender_id',
    'last_message_content', 'last_message_image_url',
    'last_message_audio_url', 'last_message_unsent_at', 'last_message_at',
    'my_read_at',
    -- Present only on a re-run of this same file:
    'last_message_document_url', 'last_message_document_name'
  ];
  i integer;
begin
  -- Tables this file reads, extends, or points policies at.
  foreach v_table in array array[
    'blocks', 'messages', 'direct_threads', 'message_reads', 'jobs', 'profiles'
  ] loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'PHASE77 PRECONDITION: table public.% not found', v_table;
    end if;
  end loop;

  -- The one-thread constraint this file's tables mirror.
  if not exists (select 1 from pg_constraint where conname = 'messages_one_thread') then
    raise exception 'PHASE77 PRECONDITION: messages_one_thread not found - apply phase36 first';
  end if;

  -- is_blocked_between: present, exactly one overload, LANGUAGE SQL, definer.
  -- Four RLS policies and five live SECURITY DEFINER bodies depend on the
  -- (uuid, uuid) signature; section 2 amends the body and nothing else.
  if to_regprocedure('public.is_blocked_between(uuid,uuid)') is null then
    raise exception 'PHASE77 PRECONDITION: is_blocked_between(uuid, uuid) not found - apply phase13 first';
  end if;
  select count(*) into v_overloads
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'is_blocked_between';
  if v_overloads <> 1 then
    raise exception 'PHASE77 PRECONDITION: is_blocked_between has % overloads, expected exactly 1', v_overloads;
  end if;
  select l.lanname, p.prosecdef into v_lang, v_secdef
  from pg_proc p join pg_language l on l.oid = p.prolang
  where p.oid = to_regprocedure('public.is_blocked_between(uuid,uuid)');
  if v_lang <> 'sql' or v_secdef is distinct from true then
    raise exception 'PHASE77 PRECONDITION: is_blocked_between is lang=% secdef=% - this file expects the phase13 LANGUAGE SQL SECURITY DEFINER shape', v_lang, v_secdef;
  end if;

  if to_regprocedure('public.is_active_user()') is null then
    raise exception 'PHASE77 PRECONDITION: is_active_user() not found - apply phase13 first';
  end if;
  if to_regprocedure('public.mark_direct_thread_read(uuid)') is null then
    raise exception 'PHASE77 PRECONDITION: mark_direct_thread_read(uuid) not found - apply phase36 first';
  end if;

  -- Policies this file leans on or mirrors. chat_audio_insert_party and
  -- chat_photos_insert_party are the LIVE chat-media posture (phase29) that
  -- section 7's chat-documents policies mirror.
  for i in 1 .. array_length(v_required_policies, 1) loop
    if not exists (
      select 1 from pg_policies
      where schemaname = v_required_policies[i][1]
        and tablename  = v_required_policies[i][2]
        and policyname = v_required_policies[i][3]
    ) then
      raise exception 'PHASE77 PRECONDITION: policy % on %.% not found',
        v_required_policies[i][3], v_required_policies[i][1], v_required_policies[i][2];
    end if;
  end loop;

  -- The chat media buckets whose posture section 7 mirrors.
  foreach v_table in array array['chat-photos', 'chat-audio'] loop
    if not exists (select 1 from storage.buckets where id = v_table) then
      raise exception 'PHASE77 PRECONDITION: storage bucket % not found', v_table;
    end if;
  end loop;

  -- Columns the recreated view and the new policies read.
  foreach v_col in array array['client_id', 'assigned_worker_id'] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'jobs' and column_name = v_col
    ) then
      raise exception 'PHASE77 PRECONDITION: jobs.% not found', v_col;
    end if;
  end loop;
  foreach v_col in array array['user_a', 'user_b', 'user_a_read_at', 'user_b_read_at'] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'direct_threads' and column_name = v_col
    ) then
      raise exception 'PHASE77 PRECONDITION: direct_threads.% not found', v_col;
    end if;
  end loop;

  -- The conversations view: must exist, carry every phase36 column, and carry
  -- nothing this file does not restate (see v_view_allowed).
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'conversations' and c.relkind = 'v'
  ) then
    raise exception 'PHASE77 PRECONDITION: view public.conversations not found - apply phase36 first';
  end if;
  select array_agg(column_name::text) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'conversations';
  foreach v_col in array v_view_required loop
    if not (v_col = any (v_cols)) then
      raise exception 'PHASE77 PRECONDITION: conversations.% is missing - the view is not the phase36 shape this file restates', v_col;
    end if;
  end loop;
  foreach v_col in array v_cols loop
    if not (v_col = any (v_view_allowed)) then
      raise exception 'PHASE77 PRECONDITION: conversations.% is not restated by this file - recreating the view would silently drop it. Refusing.', v_col;
    end if;
  end loop;

  -- The realtime publication sections 5 and 8 add tables to.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'PHASE77 PRECONDITION: publication supabase_realtime not found';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. S-3a. The expiry column. A block with NULL expires_at is permanent -
--    every existing row keeps exactly the behavior it has today. This column
--    MUST exist before section 2: is_blocked_between stays LANGUAGE SQL, and
--    a SQL-language body is parsed against the catalog at CREATE FUNCTION
--    time (the phase13 ordering note), so the column it reads has to be in
--    the catalog first.
-- ---------------------------------------------------------------------------
alter table public.blocks
  add column if not exists expires_at timestamptz;

comment on column public.blocks.expires_at is
  'When a timed block lapses. NULL means permanent (every pre-phase77 row). An expired block behaves exactly as no block: is_blocked_between() filters on it, and set_block() is the only writer that sets it (blocks has no UPDATE policy and phase76 revoked the UPDATE grant - that posture is deliberate and unchanged).';

-- ---------------------------------------------------------------------------
-- 2. S-3b. is_blocked_between, expiry-aware. THE SIGNATURE IS UNCHANGED:
--    (a uuid, b uuid) returns boolean, LANGUAGE SQL, STABLE, SECURITY
--    DEFINER, search_path pinned - because four RLS policies
--    (bids_insert_own, messages_insert_party, chat_photos_insert_party,
--    chat_audio_insert_party) and five live SECURITY DEFINER bodies
--    (create_bid, accept_bid, job_request_parties_ok, should_notify,
--    create_offer) call it in place.
--
--    The body gains one AND term: a row only blocks while it has no expiry
--    or its expiry is in the future. now() is STABLE, matching the declared
--    volatility.
--
--    A note for the reader on the phase13 "inlined into the RLS policies"
--    comment: a SQL function is only inlined when it is NOT SECURITY DEFINER
--    and has NO SET clause, and this function has always had both, so it has
--    never actually been inlined. LANGUAGE SQL still buys the create-time
--    catalog parse (the ordering guarantee above) and the cheapest execution
--    a non-inlined call can have. This replacement changes neither property:
--    still a single-SELECT SQL body, still no new disqualifier.
--
--    create or replace preserves the existing ACL (phase69: EXECUTE to
--    authenticated only), and the explicit revoke/grant below restates it so
--    the invariant is visible in this file (the CLAUDE.md phase69 rule).
-- ---------------------------------------------------------------------------
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.blocks bl
    where ((bl.blocker_id = a and bl.blocked_id = b)
        or (bl.blocker_id = b and bl.blocked_id = a))
      and (bl.expires_at is null or bl.expires_at > now())
  );
$$;

comment on function public.is_blocked_between(uuid, uuid) is
  'True when either user has an ACTIVE block on the other (symmetric in effect). phase77: a block whose expires_at has passed behaves exactly as no block; NULL expires_at is permanent.';

revoke all on function public.is_blocked_between(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. S-3c. set_block() - the deliberate write path for an expiry.
--
--    blocks has select_involved / insert_own / delete_own and NO UPDATE
--    policy, and phase76 revoked the UPDATE grant because the grants must
--    tell the truth (F-040). This file does not widen any of that: creating
--    a brand-new timed block still works through blocks_insert_own, and the
--    one thing a client could never do - move an EXISTING row's expiry
--    (permanent -> timed, timed -> longer, timed -> permanent) - goes through
--    this SECURITY DEFINER upsert instead. The blocker's existing unblock
--    path (delete through blocks_delete_own, lib/moderation.ts) is untouched.
-- ---------------------------------------------------------------------------
create or replace function public.set_block(
  p_blocked uuid,
  p_expires_at timestamptz default null
)
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
  if p_blocked is null or p_blocked = v_user then
    raise exception 'You cannot block yourself';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_blocked) then
    raise exception 'That person is no longer available';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'A timed block must end in the future';
  end if;

  -- (blocker_id, blocked_id) is a full unique constraint (phase13), so the
  -- conflict target infers it directly. Re-blocking an expired or permanent
  -- row simply moves its expiry; created_at keeps the original block date.
  insert into public.blocks (blocker_id, blocked_id, expires_at)
  values (v_user, p_blocked, p_expires_at)
  on conflict (blocker_id, blocked_id)
  do update set expires_at = excluded.expires_at;
end;
$$;

comment on function public.set_block(uuid, timestamptz) is
  'Create or re-time the caller''s block on p_blocked. NULL p_expires_at means permanent. The only path that can change an existing row''s expiry: blocks has no UPDATE policy and no UPDATE grant (phase76), deliberately. Unblocking stays the existing delete through blocks_delete_own.';

revoke all on function public.set_block(uuid, timestamptz) from public, anon;
grant execute on function public.set_block(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 4a. Internal helper: resolve a conversation key to its two parties and
--     prove the caller is one of them. One implementation, used by
--     set_conversation_state and the three live-location functions, so the
--     party rule cannot drift between them (the P3-31 discipline). Internal
--     to this file's definer functions - never granted to a client role,
--     exactly like ensure_direct_thread (phase36).
--
--     For a job thread the pair is (client_id, assigned_worker_id) and
--     party_b may be NULL while the job is unassigned - callers that need a
--     block check use coalesce(party_b, party_a), the messages_insert_party
--     shape.
-- ---------------------------------------------------------------------------
create or replace function public.conversation_parties(
  p_job_id uuid,
  p_direct_thread_id uuid,
  out party_a uuid,
  out party_b uuid
)
returns record
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;
  if (p_job_id is null) = (p_direct_thread_id is null) then
    raise exception 'Exactly one of p_job_id and p_direct_thread_id is required';
  end if;

  if p_job_id is not null then
    select j.client_id, j.assigned_worker_id into party_a, party_b
    from public.jobs j
    where j.id = p_job_id
      and (j.client_id = v_user or j.assigned_worker_id = v_user);
  else
    select t.user_a, t.user_b into party_a, party_b
    from public.direct_threads t
    where t.id = p_direct_thread_id
      and (t.user_a = v_user or t.user_b = v_user);
  end if;

  if party_a is null then
    -- Same wording whether the row is absent or the caller is not party to
    -- it, so this cannot be used to probe other people's conversations.
    raise exception 'Conversation not found';
  end if;
end;
$$;

revoke all on function public.conversation_parties(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4b. S-1 / S-2. conversation_states - one row per user per conversation,
--     carrying hidden (HIDDEN_CHATS), archived (ARCHIVE), and the shared
--     clear/delete watermark (CLEAR_CHAT / DELETE_CHAT).
--
--     THE KEY. A conversation is a job thread XOR a direct thread (the
--     messages_one_thread shape), so this table keys on nullable job_id /
--     direct_thread_id under two PARTIAL unique indexes. phase36 documented
--     why that shape must not meet a client upsert: PostgREST's onConflict
--     cannot name a partial index's predicate, so the inference fails. The
--     resolution here is that NO CLIENT EVER WRITES THIS TABLE: RLS carries
--     a SELECT-only own-rows policy, write grants are revoked, and
--     set_conversation_state() below owns every write - inside SQL, ON
--     CONFLICT can name a partial index predicate, which PostgREST cannot.
--     Rejected alternatives: a stored computed key column (still leaves a
--     client-writable table whose flags invite drift, for no gain once an
--     RPC exists), and two per-kind tables (every inbox read becomes a
--     two-table union and the state logic forks - the exact half-feature
--     shape this run forbids).
--
--     THE WATERMARK (S-2, pre-resolved). One watermark serves clear AND
--     delete. cleared_before is the instant at or before which messages are
--     out of this user's copy. Clear sets it and leaves the row in the
--     inbox; Delete sets it AND sets deleted = true, which removes the row
--     from the inbox FOR AS LONG AS nothing newer than the watermark exists.
--     The next incoming message is newer than the watermark, so the thread
--     reopens by derivation - nothing has to un-set anything. Per-user,
--     always: the counterparty has their own row (or none) and is never
--     told.
--
--     WHO FILTERS: THE CLIENT, not the view. The inbox already joins a
--     per-user side table client-side (message_reads via fetchMyReadStates,
--     lib/conversations.ts), and these states join the same way, keyed by
--     the same job:/direct: conversation key. The view cannot filter them:
--     hidden and archived rows must still be DELIVERED (to the Face-ID list
--     and the Archived tab), and baking auth.uid()-dependent state into the
--     shared view would grow its blast radius for no capability. The view
--     is recreated in section 7 for the document columns only.
-- ---------------------------------------------------------------------------
create table if not exists public.conversation_states (
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  direct_thread_id uuid references public.direct_threads(id) on delete cascade,
  hidden boolean not null default false,
  archived boolean not null default false,
  -- Messages created at or before this instant are out of this user's copy.
  cleared_before timestamptz,
  -- Out of this user's inbox while nothing newer than cleared_before exists.
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversation_states_one_thread check (
    (job_id is not null and direct_thread_id is null)
    or (job_id is null and direct_thread_id is not null)
  )
);

create unique index if not exists conversation_states_user_job_key
  on public.conversation_states (user_id, job_id)
  where job_id is not null;

create unique index if not exists conversation_states_user_direct_key
  on public.conversation_states (user_id, direct_thread_id)
  where direct_thread_id is not null;

alter table public.conversation_states enable row level security;

-- Own rows only, SELECT only. Writes are the RPC's alone.
drop policy if exists "conversation_states_select_own" on public.conversation_states;
create policy "conversation_states_select_own"
  on public.conversation_states for select
  to authenticated
  using (user_id = auth.uid());

-- The grants tell the truth (the phase76 F-040 discipline): no client role
-- holds a write it cannot use, and anon holds nothing at all.
revoke all on table public.conversation_states from public, anon;
revoke all on table public.conversation_states from authenticated;
grant select on table public.conversation_states to authenticated;

comment on table public.conversation_states is
  'Per-user, per-conversation inbox state (phase77): hidden (HIDDEN_CHATS), archived (ARCHIVE), and the shared clear/delete watermark (CLEAR_CHAT / DELETE_CHAT). Keyed on job_id XOR direct_thread_id under two partial unique indexes; written ONLY by set_conversation_state() because a client upsert cannot infer a partial index (the phase36 message_reads lesson). The counterparty is never told: rows are own-rows-only and carry no cross-user data.';

create or replace function public.set_conversation_state(
  p_job_id uuid default null,
  p_direct_thread_id uuid default null,
  p_hidden boolean default null,
  p_archived boolean default null,
  p_clear boolean default false,
  p_delete boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_mark timestamptz;
begin
  -- Membership (and the not-signed-in case) resolved server-side; the
  -- helper raises 'Conversation not found' for a thread the caller is not
  -- party to. The returned pair is not needed here.
  perform public.conversation_parties(p_job_id, p_direct_thread_id);

  if p_hidden is null and p_archived is null
     and not coalesce(p_clear, false) and not coalesce(p_delete, false) then
    raise exception 'Nothing to change';
  end if;

  -- One watermark serves clear and delete (S-2). Monotone: it never moves
  -- backward, so a repeated clear cannot resurrect older messages.
  v_mark := case when coalesce(p_clear, false) or coalesce(p_delete, false)
                 then now() end;

  if p_job_id is not null then
    insert into public.conversation_states as cs
      (user_id, job_id, hidden, archived, cleared_before, deleted, updated_at)
    values
      (v_user, p_job_id, coalesce(p_hidden, false), coalesce(p_archived, false),
       v_mark, coalesce(p_delete, false), now())
    on conflict (user_id, job_id) where job_id is not null
    do update set
      hidden = coalesce(p_hidden, cs.hidden),
      archived = coalesce(p_archived, cs.archived),
      cleared_before = case when v_mark is not null
                            then greatest(coalesce(cs.cleared_before, v_mark), v_mark)
                            else cs.cleared_before end,
      deleted = cs.deleted or coalesce(p_delete, false),
      updated_at = now();
  else
    insert into public.conversation_states as cs
      (user_id, direct_thread_id, hidden, archived, cleared_before, deleted, updated_at)
    values
      (v_user, p_direct_thread_id, coalesce(p_hidden, false), coalesce(p_archived, false),
       v_mark, coalesce(p_delete, false), now())
    on conflict (user_id, direct_thread_id) where direct_thread_id is not null
    do update set
      hidden = coalesce(p_hidden, cs.hidden),
      archived = coalesce(p_archived, cs.archived),
      cleared_before = case when v_mark is not null
                            then greatest(coalesce(cs.cleared_before, v_mark), v_mark)
                            else cs.cleared_before end,
      deleted = cs.deleted or coalesce(p_delete, false),
      updated_at = now();
  end if;
end;
$$;

comment on function public.set_conversation_state(uuid, uuid, boolean, boolean, boolean, boolean) is
  'The one writer for conversation_states. p_hidden / p_archived patch their flags when non-null; p_clear sets the watermark; p_delete sets the watermark AND deleted = true (S-2: one watermark serves both, and the delete-coupling lives server-side so the semantics cannot drift). deleted is never un-set here - the thread reopens by derivation the moment a message newer than the watermark exists. Caller must be party to the conversation; the counterparty''s copy is untouched.';

revoke all on function public.set_conversation_state(uuid, uuid, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.set_conversation_state(uuid, uuid, boolean, boolean, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. S-4. READ_TICKS - job threads expose the counterparty's read position
--    the way direct threads already do.
--
--    Direct threads already work: direct_threads_select_party hands either
--    participant the whole row, both read columns included, and the table is
--    in supabase_realtime, so the gold tick moves live. Job threads were
--    blocked by VISIBILITY: message_reads_select_own is auth.uid()-only.
--
--    The fix is one ADDITIVE permissive policy scoped to exactly one row: a
--    caller who is party to a job may read the row of that job's OTHER
--    party. Not "any row on the job" - a stray row left by someone who was
--    never (or is no longer) the assigned worker stays invisible. The
--    caller learns one timestamp on a conversation they are already in.
--
--    Chosen over a definer RPC returning the timestamp because a policy
--    keeps ONE tick pipeline for both thread kinds: the client already
--    reads message_reads (fetchMyReadStates) and already receives
--    direct-thread read updates over realtime, so the same table read and
--    the same subscription shape now serve job threads too. An RPC cannot
--    ride realtime - job ticks would poll and lag their direct siblings in
--    the SAME folded conversation. Realtime respects RLS, so the added
--    publication entry delivers a row only to the two people these policies
--    let read it.
--
--    The existing own-rows policies are untouched; the client's
--    onConflict 'user_id,job_id' upsert path is untouched.
-- ---------------------------------------------------------------------------
drop policy if exists "message_reads_select_party" on public.message_reads;
create policy "message_reads_select_party"
  on public.message_reads for select
  to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = message_reads.job_id
        and ((j.client_id = auth.uid()
                and message_reads.user_id = j.assigned_worker_id)
          or (j.assigned_worker_id = auth.uid()
                and message_reads.user_id = j.client_id))
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reads'
  ) then
    alter publication supabase_realtime add table public.message_reads;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. S-5. MARK_UNREAD - a caller may move their OWN read position backward
--    on BOTH thread kinds.
--
--    Job threads already can: message_reads_update_own constrains the ROW
--    (user_id = auth.uid()) and not the VALUE, so the existing client upsert
--    may write an earlier last_read_at. Nothing to add.
--
--    Direct threads could not, because mark_direct_thread_read() hard-codes
--    now(). This sibling accepts an explicit timestamp instead of replacing
--    that hot-path function: mark_direct_thread_read keeps its exact
--    signature, body and grants, so the every-message-open path carries
--    zero new risk. Same CASE shape: the caller's column is resolved
--    server-side from auth.uid(), and the counterparty's column is
--    structurally untouchable.
--
--    p_read_at may be NULL ("never read" - the whole thread goes unread) or
--    any instant, clamped to now() so a position cannot be planted in the
--    future to pre-read messages that do not exist yet.
-- ---------------------------------------------------------------------------
create or replace function public.set_direct_thread_read_at(
  p_thread_id uuid,
  p_read_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_read timestamptz;
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;

  v_read := case when p_read_at is null then null
                 else least(p_read_at, now()) end;

  update public.direct_threads
     set user_a_read_at = case when user_a = v_user then v_read else user_a_read_at end,
         user_b_read_at = case when user_b = v_user then v_read else user_b_read_at end
   where id = p_thread_id
     and (user_a = v_user or user_b = v_user);
end;
$$;

comment on function public.set_direct_thread_read_at(uuid, timestamptz) is
  'mark_direct_thread_read''s explicit-timestamp sibling (phase77, MARK_UNREAD): moves ONLY the caller''s own read column on a thread they belong to, to any past instant or NULL. The counterparty''s column cannot be reached: the CASE resolves the column from auth.uid() server-side.';

revoke all on function public.set_direct_thread_read_at(uuid, timestamptz) from public, anon;
grant execute on function public.set_direct_thread_read_at(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. S-6. DOCUMENTS - a document attachment on a message, plus its bucket.
--
-- 7a. The message columns, mirroring the voice-message shape (phase16):
--     a URL column the bubble and the inbox preview key off, plus the
--     metadata the bubble needs to render before downloading anything - for
--     audio that was the duration, for a document it is the filename the
--     bubble shows and the byte size it labels the download with.
-- ---------------------------------------------------------------------------
alter table public.messages
  add column if not exists document_url text,
  add column if not exists document_name text,
  add column if not exists document_size_bytes integer;

-- ---------------------------------------------------------------------------
-- 7b. The inbox view, recreated to carry the document columns through -
--     without them a document message previews as an empty "..." in
--     Messages, exactly the phase16 problem. `create or replace view`
--     cannot add columns, so the view is dropped first (nothing depends on
--     it besides the app's own select).
--
--     EVERY existing column survives byte-for-byte (the precondition block
--     refuses to run if the live view carries anything this text does not
--     restate), the union shape is phase36's, and security_invoker stays
--     true so the view can never widen what a user may read. The two new
--     columns ride in both branches.
-- ---------------------------------------------------------------------------
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
  m.document_url as last_message_document_url,
  m.document_name as last_message_document_name,
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
  m.document_url as last_message_document_url,
  m.document_name as last_message_document_name,
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

-- The explicit grant is phase36's; anon's zero-row resolvability comes from
-- the project's default privileges, and scripts/verify-schema.mjs depends on
-- it (its phase16/25/36 groups probe view columns with the publishable key,
-- security_invoker + the party policies keep the row count at zero), so no
-- anon revoke here.
grant select on public.conversations to authenticated;

-- ---------------------------------------------------------------------------
-- 7c. The chat-documents bucket, at the LIVE chat-media posture (phase29):
--     PRIVATE bucket, party-scoped read, party-scoped + own-folder insert
--     with the ban and block gates - NOT the public-bucket
--     open-authenticated-insert shape phase8/phase16 started with.
--
--     Object path contract, matching lib/storage.ts's chat uploads:
--     <thread-id>/<uploader-uid>/<filename>. One deliberate extension to
--     the mirrored posture: folder one may be a JOB id or a DIRECT THREAD
--     id, because documents ship on both thread kinds or not at all (the
--     chat-photos/chat-audio policies cover only the job branch, which is a
--     pre-existing gap this file reports but does not widen them to fix).
--     Each branch carries the same block enforcement chat-audio's insert
--     carries.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('chat-documents', 'chat-documents', false)
on conflict (id) do nothing;

drop policy if exists "chat_documents_read_party" on storage.objects;
create policy "chat_documents_read_party"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-documents'
    and (
      exists (
        select 1
        from public.jobs j
        where j.id::text = (storage.foldername(name))[1]
          and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
      )
      or exists (
        select 1
        from public.direct_threads t
        where t.id::text = (storage.foldername(name))[1]
          and (t.user_a = auth.uid() or t.user_b = auth.uid())
      )
    )
  );

drop policy if exists "chat_documents_insert_party" on storage.objects;
create policy "chat_documents_insert_party"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-documents'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_active_user()
    and (
      exists (
        select 1
        from public.jobs j
        where j.id::text = (storage.foldername(name))[1]
          and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
          and not public.is_blocked_between(
            j.client_id,
            coalesce(j.assigned_worker_id, j.client_id)
          )
      )
      or exists (
        select 1
        from public.direct_threads t
        where t.id::text = (storage.foldername(name))[1]
          and (t.user_a = auth.uid() or t.user_b = auth.uid())
          and not public.is_blocked_between(t.user_a, t.user_b)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 8. S-7. LIVE_LOCATION - a time-bounded location share between the two
--    parties of a conversation, on either thread kind.
--
--    The job_locations precedent (phase12/phase29/phase43) is followed
--    where it applies: RPC-written (no client write policy, no client write
--    grant), party-scoped reads, and the sensitive value never reachable
--    beyond the two people it belongs to. It is deliberately NOT followed
--    on realtime: job_locations is a static address vault and stays out of
--    the publication (phase12's decision, unchanged); a live share is a
--    moving feed the counterparty must see without polling, which is the
--    messages / direct_threads realtime shape - and realtime enforces these
--    same RLS policies per subscriber, so publication membership widens
--    delivery, never visibility.
--
--    Expiry is enforced server-side twice over, never by client honesty:
--    the SELECT policy hides an expired row from everyone (an ended share
--    reads as absent, exactly like an expired block), and the write RPCs
--    refuse to start a share more than 8 hours out or to move one that has
--    ended. One row per sharer per thread, revived in place on each new
--    share, so ended shares never accumulate.
--
--    One delivery caveat, stated so the wiring run knows it: stopping a
--    share early sets expires_at = now(), and realtime will NOT deliver
--    that update (the new row already fails the policy's expiry term), so
--    the counterparty's client learns of an early stop on its next poll or
--    refetch - and its honest upper bound is always the expires_at it
--    already holds.
-- ---------------------------------------------------------------------------
create table if not exists public.live_location_shares (
  id uuid primary key default gen_random_uuid(),
  sharer_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  direct_thread_id uuid references public.direct_threads(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint live_location_shares_one_thread check (
    (job_id is not null and direct_thread_id is null)
    or (job_id is null and direct_thread_id is not null)
  ),
  constraint live_location_shares_bounded check (
    expires_at <= started_at + interval '8 hours'
  )
);

create unique index if not exists live_location_shares_sharer_job_key
  on public.live_location_shares (sharer_id, job_id)
  where job_id is not null;

create unique index if not exists live_location_shares_sharer_direct_key
  on public.live_location_shares (sharer_id, direct_thread_id)
  where direct_thread_id is not null;

alter table public.live_location_shares enable row level security;

-- Party-scoped and time-bounded: an expired share is invisible to everyone,
-- the sharer included - ended means gone, with no client cooperation needed.
drop policy if exists "live_location_shares_select_party" on public.live_location_shares;
create policy "live_location_shares_select_party"
  on public.live_location_shares for select
  to authenticated
  using (
    expires_at > now()
    and (
      exists (
        select 1 from public.jobs j
        where j.id = live_location_shares.job_id
          and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
      )
      or exists (
        select 1 from public.direct_threads t
        where t.id = live_location_shares.direct_thread_id
          and (t.user_a = auth.uid() or t.user_b = auth.uid())
      )
    )
  );

revoke all on table public.live_location_shares from public, anon;
revoke all on table public.live_location_shares from authenticated;
grant select on table public.live_location_shares to authenticated;

comment on table public.live_location_shares is
  'A time-bounded live position share into one conversation (phase77, LIVE_LOCATION). One row per sharer per thread, revived in place by start_live_location(); heartbeats move lat/lng/updated_at; expiry is enforced by the SELECT policy (an expired share reads as absent) and by the RPCs, never by client honesty. RPC-written only, like job_locations - but published to supabase_realtime, unlike job_locations, because a moving pin is a live feed, not an address vault.';

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_location_shares'
  ) then
    alter publication supabase_realtime add table public.live_location_shares;
  end if;
end $$;

create or replace function public.start_live_location(
  p_lat double precision,
  p_lng double precision,
  p_expires_at timestamptz,
  p_job_id uuid default null,
  p_direct_thread_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_id uuid;
begin
  select party_a, party_b into v_a, v_b
  from public.conversation_parties(p_job_id, p_direct_thread_id);

  if not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if public.is_blocked_between(v_a, coalesce(v_b, v_a)) then
    raise exception 'Location sharing is not available';
  end if;
  if p_lat is null or p_lng is null
     or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'Invalid coordinates';
  end if;
  if p_expires_at is null or p_expires_at <= now()
     or p_expires_at > now() + interval '8 hours' then
    raise exception 'Sharing must end in the future, at most 8 hours from now';
  end if;

  if p_job_id is not null then
    insert into public.live_location_shares as s
      (sharer_id, job_id, lat, lng, started_at, updated_at, expires_at)
    values (v_user, p_job_id, p_lat, p_lng, now(), now(), p_expires_at)
    on conflict (sharer_id, job_id) where job_id is not null
    do update set lat = excluded.lat, lng = excluded.lng,
                  started_at = now(), updated_at = now(),
                  expires_at = excluded.expires_at
    returning id into v_id;
  else
    insert into public.live_location_shares as s
      (sharer_id, direct_thread_id, lat, lng, started_at, updated_at, expires_at)
    values (v_user, p_direct_thread_id, p_lat, p_lng, now(), now(), p_expires_at)
    on conflict (sharer_id, direct_thread_id) where direct_thread_id is not null
    do update set lat = excluded.lat, lng = excluded.lng,
                  started_at = now(), updated_at = now(),
                  expires_at = excluded.expires_at
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

comment on function public.start_live_location(double precision, double precision, timestamptz, uuid, uuid) is
  'Start (or restart) the caller''s live location share into one conversation they are party to. Window capped server-side at 8 hours; blocked pairs refused; one row per sharer per thread, revived in place. Deliberately separate from update_live_location() so a stray background heartbeat can never restart a share the user ended.';

revoke all on function public.start_live_location(double precision, double precision, timestamptz, uuid, uuid) from public, anon;
grant execute on function public.start_live_location(double precision, double precision, timestamptz, uuid, uuid) to authenticated;

create or replace function public.update_live_location(
  p_lat double precision,
  p_lng double precision,
  p_job_id uuid default null,
  p_direct_thread_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_a uuid;
  v_b uuid;
begin
  select party_a, party_b into v_a, v_b
  from public.conversation_parties(p_job_id, p_direct_thread_id);

  -- A block that lands mid-share ends the feed at the next heartbeat.
  if public.is_blocked_between(v_a, coalesce(v_b, v_a)) then
    raise exception 'Location sharing is not available';
  end if;
  if p_lat is null or p_lng is null
     or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'Invalid coordinates';
  end if;

  update public.live_location_shares
     set lat = p_lat, lng = p_lng, updated_at = now()
   where sharer_id = v_user
     and expires_at > now()
     and ((p_job_id is not null and job_id = p_job_id)
       or (p_direct_thread_id is not null and direct_thread_id = p_direct_thread_id));

  if not found then
    raise exception 'No active location share';
  end if;
end;
$$;

comment on function public.update_live_location(double precision, double precision, uuid, uuid) is
  'Heartbeat: moves the caller''s own ACTIVE share in one conversation. Raises once the share has expired or was stopped, so a client cannot keep publishing past the window it asked for.';

revoke all on function public.update_live_location(double precision, double precision, uuid, uuid) from public, anon;
grant execute on function public.update_live_location(double precision, double precision, uuid, uuid) to authenticated;

create or replace function public.stop_live_location(
  p_job_id uuid default null,
  p_direct_thread_id uuid default null
)
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
  if (p_job_id is null) = (p_direct_thread_id is null) then
    raise exception 'Exactly one of p_job_id and p_direct_thread_id is required';
  end if;

  -- Idempotent: stopping an already-ended share is a no-op, so a retry or a
  -- double tap can never surface an error on an action that succeeded.
  update public.live_location_shares
     set expires_at = now(), updated_at = now()
   where sharer_id = v_user
     and expires_at > now()
     and ((p_job_id is not null and job_id = p_job_id)
       or (p_direct_thread_id is not null and direct_thread_id = p_direct_thread_id));
end;
$$;

comment on function public.stop_live_location(uuid, uuid) is
  'End the caller''s own share now by moving expires_at to now(). Only the sharer can stop a share, and only their own; already-ended is a silent no-op.';

revoke all on function public.stop_live_location(uuid, uuid) from public, anon;
grant execute on function public.stop_live_location(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. S-3 PROOF MATRIX. Executed on a savepoint whose fixtures roll back;
--    any wrong answer raises, which aborts the transaction, so an amendment
--    that breaks the block predicate can never commit.
--
--    Fixtures: two throwaway users. profiles is tried first (covers a
--    schema where profiles carries no auth FK); on any failure the fallback
--    inserts into auth.users, which fires the live on_auth_user_created
--    trigger and materializes the profiles rows the way a real signup does.
--    Either way the savepoint rollback erases every trace. If neither path
--    can produce the two rows, the matrix raises rather than skipping:
--    a matrix that cannot run must not let the file commit.
--
--    Five cases, each asserted in BOTH directions because the block is
--    symmetric in effect:
--      case 1  no row                          -> unblocked
--      case 2  row with NULL expiry            -> blocked (permanent)
--      case 3  row expiring in the future      -> blocked
--      case 4  row expired in the past         -> unblocked (exactly as no
--              block)
--      case 5  expired one way, active the     -> blocked (per-row expiry,
--              other way                          symmetric OR)
-- ---------------------------------------------------------------------------
savepoint phase77_proof_matrix;

do $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
begin
  begin
    insert into public.profiles (id, full_name, phone, role)
    values (v_a, 'Phase77 Fixture A', null, 'both'),
           (v_b, 'Phase77 Fixture B', null, 'both');
  exception when others then
    begin
      insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
      values (v_a, 'authenticated', 'authenticated', v_a::text || '@phase77.invalid', '{}'::jsonb, now(), now()),
             (v_b, 'authenticated', 'authenticated', v_b::text || '@phase77.invalid', '{}'::jsonb, now(), now());
      insert into public.profiles (id, full_name, phone, role)
      values (v_a, 'Phase77 Fixture A', null, 'both'),
             (v_b, 'Phase77 Fixture B', null, 'both')
      on conflict (id) do nothing;
    exception when others then
      raise exception 'PHASE77 MATRIX FAIL (fixtures): could not create two throwaway users (%) - the matrix cannot run, so this file must not commit', sqlerrm;
    end;
  end;

  if (select count(*) from public.profiles where id in (v_a, v_b)) <> 2 then
    raise exception 'PHASE77 MATRIX FAIL (fixtures): throwaway profiles did not materialize';
  end if;

  -- case 1: no row.
  if public.is_blocked_between(v_a, v_b) then
    raise exception 'PHASE77 MATRIX FAIL (case 1 forward): no block row must read unblocked';
  end if;
  if public.is_blocked_between(v_b, v_a) then
    raise exception 'PHASE77 MATRIX FAIL (case 1 reverse): no block row must read unblocked';
  end if;

  -- case 2: NULL expiry is permanent.
  insert into public.blocks (blocker_id, blocked_id) values (v_a, v_b);
  if not public.is_blocked_between(v_a, v_b) then
    raise exception 'PHASE77 MATRIX FAIL (case 2 forward): a NULL-expiry block must read blocked';
  end if;
  if not public.is_blocked_between(v_b, v_a) then
    raise exception 'PHASE77 MATRIX FAIL (case 2 reverse): a NULL-expiry block must read blocked';
  end if;

  -- case 3: a future expiry still blocks.
  update public.blocks set expires_at = now() + interval '1 hour'
   where blocker_id = v_a and blocked_id = v_b;
  if not public.is_blocked_between(v_a, v_b) then
    raise exception 'PHASE77 MATRIX FAIL (case 3 forward): a future-expiry block must read blocked';
  end if;
  if not public.is_blocked_between(v_b, v_a) then
    raise exception 'PHASE77 MATRIX FAIL (case 3 reverse): a future-expiry block must read blocked';
  end if;

  -- case 4: a past expiry behaves exactly as no block.
  update public.blocks set expires_at = now() - interval '1 hour'
   where blocker_id = v_a and blocked_id = v_b;
  if public.is_blocked_between(v_a, v_b) then
    raise exception 'PHASE77 MATRIX FAIL (case 4 forward): an expired block must behave exactly as no block';
  end if;
  if public.is_blocked_between(v_b, v_a) then
    raise exception 'PHASE77 MATRIX FAIL (case 4 reverse): an expired block must behave exactly as no block';
  end if;

  -- case 5: expiry is per-row - the expired a->b row must not mask an
  -- active b->a row, in either direction.
  insert into public.blocks (blocker_id, blocked_id, expires_at)
  values (v_b, v_a, now() + interval '1 hour');
  if not public.is_blocked_between(v_a, v_b) then
    raise exception 'PHASE77 MATRIX FAIL (case 5 forward): an active reverse block must read blocked';
  end if;
  if not public.is_blocked_between(v_b, v_a) then
    raise exception 'PHASE77 MATRIX FAIL (case 5 reverse): an active reverse block must read blocked';
  end if;

  raise notice 'PHASE77 PROOF MATRIX PASS: 5 cases, both directions each';
end $$;

rollback to savepoint phase77_proof_matrix;

-- ---------------------------------------------------------------------------
-- 10. Self-check. Any failure raises and aborts the whole file
--     (the phase64/68/73/75/76 discipline).
--
-- (a) is_blocked_between: one overload, exact identity arguments, LANGUAGE
--     SQL, STABLE, SECURITY DEFINER, pg_temp-pinned, executable by
--     authenticated and not by anon.
-- (b) blocks: expires_at exists; still NO update policy and NO authenticated
--     UPDATE grant (the phase76 posture this file's write path depends on);
--     the three phase13 policies still present.
-- (c) conversation_states: RLS on; SELECT-only policy surface; both partial
--     unique keys; anon holds nothing; authenticated holds SELECT and no
--     write.
-- (d) the new functions: definer where claimed, pg_temp-pinned, authenticated
--     -executable - except conversation_parties, which no client role may
--     execute.
-- (e) the conversations view: security_invoker, and exactly the fifteen
--     columns (thirteen inherited, two document columns).
-- (f) messages: the three document columns exist.
-- (g) message_reads: party policy present alongside the untouched own-rows
--     policies; table now in supabase_realtime.
-- (h) live_location_shares: RLS on; the SELECT policy carries the expiry
--     term; no write policy; anon holds nothing; in supabase_realtime.
-- (i) storage: chat-documents exists and is PRIVATE; both party policies
--     present; the insert policy checks blocks on BOTH thread kinds.
-- ---------------------------------------------------------------------------
do $$
declare
  v_count integer;
  v_proc pg_proc%rowtype;
  v_cols text[];
  v_expected_cols constant text[] := array[
    'job_id', 'direct_thread_id', 'job_title', 'client_id',
    'assigned_worker_id', 'last_message_id', 'last_message_sender_id',
    'last_message_content', 'last_message_image_url',
    'last_message_audio_url', 'last_message_document_url',
    'last_message_document_name', 'last_message_unsent_at',
    'last_message_at', 'my_read_at'
  ];
  v_col text;
  v_fn text;
  v_check text;
begin
  -- (a)
  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'is_blocked_between';
  if v_count <> 1 then
    raise exception 'PHASE77 SELF-CHECK FAIL (a): is_blocked_between has % overloads', v_count;
  end if;
  select p.* into v_proc from pg_proc p
  where p.oid = to_regprocedure('public.is_blocked_between(uuid,uuid)');
  if v_proc.oid is null then
    raise exception 'PHASE77 SELF-CHECK FAIL (a): the (uuid, uuid) signature is gone';
  end if;
  if pg_get_function_identity_arguments(v_proc.oid) <> 'a uuid, b uuid' then
    raise exception 'PHASE77 SELF-CHECK FAIL (a): identity arguments changed to [%]',
      pg_get_function_identity_arguments(v_proc.oid);
  end if;
  if (select lanname from pg_language where oid = v_proc.prolang) <> 'sql' then
    raise exception 'PHASE77 SELF-CHECK FAIL (a): is_blocked_between is no longer LANGUAGE SQL';
  end if;
  if not v_proc.prosecdef or v_proc.provolatile <> 's'
     or coalesce(array_to_string(v_proc.proconfig, ','), '') not like '%pg_temp%' then
    raise exception 'PHASE77 SELF-CHECK FAIL (a): secdef=% volatile=% config=[%]',
      v_proc.prosecdef, v_proc.provolatile, coalesce(array_to_string(v_proc.proconfig, ','), 'null');
  end if;
  if not has_function_privilege('authenticated', v_proc.oid, 'execute')
     or has_function_privilege('anon', v_proc.oid, 'execute') then
    raise exception 'PHASE77 SELF-CHECK FAIL (a): ACL drifted - authenticated must execute, anon must not';
  end if;

  -- (b)
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'blocks' and column_name = 'expires_at'
  ) then
    raise exception 'PHASE77 SELF-CHECK FAIL (b): blocks.expires_at does not exist';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'blocks' and cmd = 'UPDATE'
  ) then
    raise exception 'PHASE77 SELF-CHECK FAIL (b): blocks gained an UPDATE policy - set_block() exists precisely so it never needs one';
  end if;
  if has_table_privilege('authenticated', 'public.blocks', 'UPDATE') then
    raise exception 'PHASE77 SELF-CHECK FAIL (b): authenticated regained UPDATE on blocks (phase76 revoked it)';
  end if;
  foreach v_col in array array['blocks_select_involved', 'blocks_insert_own', 'blocks_delete_own'] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'blocks' and policyname = v_col
    ) then
      raise exception 'PHASE77 SELF-CHECK FAIL (b): phase13 policy % vanished', v_col;
    end if;
  end loop;

  -- (c)
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'conversation_states'
      and c.relkind = 'r' and c.relrowsecurity
  ) then
    raise exception 'PHASE77 SELF-CHECK FAIL (c): conversation_states missing or RLS off';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'conversation_states'
      and policyname = 'conversation_states_select_own' and cmd = 'SELECT'
  ) then
    raise exception 'PHASE77 SELF-CHECK FAIL (c): conversation_states_select_own missing';
  end if;
  select count(*) into v_count from pg_policies
  where schemaname = 'public' and tablename = 'conversation_states' and cmd <> 'SELECT';
  if v_count <> 0 then
    raise exception 'PHASE77 SELF-CHECK FAIL (c): conversation_states has % non-SELECT policies - writes belong to the RPC alone', v_count;
  end if;
  foreach v_col in array array['conversation_states_user_job_key', 'conversation_states_user_direct_key'] loop
    if not exists (
      select 1 from pg_indexes
      where schemaname = 'public' and tablename = 'conversation_states' and indexname = v_col
    ) then
      raise exception 'PHASE77 SELF-CHECK FAIL (c): partial unique index % missing', v_col;
    end if;
  end loop;
  foreach v_col in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if has_table_privilege('anon', 'public.conversation_states', v_col) then
      raise exception 'PHASE77 SELF-CHECK FAIL (c): anon holds % on conversation_states', v_col;
    end if;
  end loop;
  if not has_table_privilege('authenticated', 'public.conversation_states', 'SELECT') then
    raise exception 'PHASE77 SELF-CHECK FAIL (c): authenticated lost SELECT on conversation_states';
  end if;
  foreach v_col in array array['INSERT', 'UPDATE', 'DELETE'] loop
    if has_table_privilege('authenticated', 'public.conversation_states', v_col) then
      raise exception 'PHASE77 SELF-CHECK FAIL (c): authenticated holds % on conversation_states - the grant would lie, RLS has no such policy', v_col;
    end if;
  end loop;

  -- (d)
  foreach v_fn in array array[
    'public.set_block(uuid,timestamptz)',
    'public.set_conversation_state(uuid,uuid,boolean,boolean,boolean,boolean)',
    'public.set_direct_thread_read_at(uuid,timestamptz)',
    'public.start_live_location(double precision,double precision,timestamptz,uuid,uuid)',
    'public.update_live_location(double precision,double precision,uuid,uuid)',
    'public.stop_live_location(uuid,uuid)',
    'public.conversation_parties(uuid,uuid)'
  ] loop
    select p.* into v_proc from pg_proc p where p.oid = to_regprocedure(v_fn);
    if v_proc.oid is null then
      raise exception 'PHASE77 SELF-CHECK FAIL (d): % does not exist', v_fn;
    end if;
    if not v_proc.prosecdef
       or coalesce(array_to_string(v_proc.proconfig, ','), '') not like '%pg_temp%' then
      raise exception 'PHASE77 SELF-CHECK FAIL (d): % must be SECURITY DEFINER with pg_temp pinned', v_fn;
    end if;
    if has_function_privilege('anon', v_proc.oid, 'execute') then
      raise exception 'PHASE77 SELF-CHECK FAIL (d): anon can execute %', v_fn;
    end if;
    if v_fn = 'public.conversation_parties(uuid,uuid)' then
      if has_function_privilege('authenticated', v_proc.oid, 'execute') then
        raise exception 'PHASE77 SELF-CHECK FAIL (d): conversation_parties is internal and must not be client-executable';
      end if;
    else
      if not has_function_privilege('authenticated', v_proc.oid, 'execute') then
        raise exception 'PHASE77 SELF-CHECK FAIL (d): authenticated cannot execute %', v_fn;
      end if;
    end if;
  end loop;

  -- (e)
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'conversations' and c.relkind = 'v'
      and 'security_invoker=true' = any (coalesce(c.reloptions, '{}'))
  ) then
    raise exception 'PHASE77 SELF-CHECK FAIL (e): conversations is missing or not security_invoker';
  end if;
  select array_agg(column_name::text) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'conversations';
  if coalesce(array_length(v_cols, 1), 0) <> 15 then
    raise exception 'PHASE77 SELF-CHECK FAIL (e): conversations has % columns, expected 15', coalesce(array_length(v_cols, 1), 0);
  end if;
  foreach v_col in array v_expected_cols loop
    if not (v_col = any (v_cols)) then
      raise exception 'PHASE77 SELF-CHECK FAIL (e): conversations.% is missing', v_col;
    end if;
  end loop;

  -- (f)
  foreach v_col in array array['document_url', 'document_name', 'document_size_bytes'] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'messages' and column_name = v_col
    ) then
      raise exception 'PHASE77 SELF-CHECK FAIL (f): messages.% does not exist', v_col;
    end if;
  end loop;

  -- (g)
  foreach v_col in array array[
    'message_reads_select_own', 'message_reads_insert_own',
    'message_reads_update_own', 'message_reads_select_party'
  ] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'message_reads' and policyname = v_col
    ) then
      raise exception 'PHASE77 SELF-CHECK FAIL (g): message_reads policy % missing', v_col;
    end if;
  end loop;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'message_reads'
  ) then
    raise exception 'PHASE77 SELF-CHECK FAIL (g): message_reads is not in supabase_realtime';
  end if;

  -- (h)
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'live_location_shares'
      and c.relkind = 'r' and c.relrowsecurity
  ) then
    raise exception 'PHASE77 SELF-CHECK FAIL (h): live_location_shares missing or RLS off';
  end if;
  select qual into v_check from pg_policies
  where schemaname = 'public' and tablename = 'live_location_shares'
    and policyname = 'live_location_shares_select_party' and cmd = 'SELECT';
  if v_check is null or v_check not like '%expires_at%' then
    raise exception 'PHASE77 SELF-CHECK FAIL (h): the live-location SELECT policy must enforce expiry server-side';
  end if;
  select count(*) into v_count from pg_policies
  where schemaname = 'public' and tablename = 'live_location_shares' and cmd <> 'SELECT';
  if v_count <> 0 then
    raise exception 'PHASE77 SELF-CHECK FAIL (h): live_location_shares has % non-SELECT policies', v_count;
  end if;
  foreach v_col in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if has_table_privilege('anon', 'public.live_location_shares', v_col) then
      raise exception 'PHASE77 SELF-CHECK FAIL (h): anon holds % on live_location_shares', v_col;
    end if;
  end loop;
  foreach v_col in array array['INSERT', 'UPDATE', 'DELETE'] loop
    if has_table_privilege('authenticated', 'public.live_location_shares', v_col) then
      raise exception 'PHASE77 SELF-CHECK FAIL (h): authenticated holds % on live_location_shares', v_col;
    end if;
  end loop;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'live_location_shares'
  ) then
    raise exception 'PHASE77 SELF-CHECK FAIL (h): live_location_shares is not in supabase_realtime';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'live_location_shares_bounded' and convalidated
  ) then
    raise exception 'PHASE77 SELF-CHECK FAIL (h): the 8-hour bound constraint is missing or not validated';
  end if;

  -- (i)
  if not exists (
    select 1 from storage.buckets where id = 'chat-documents' and public = false
  ) then
    raise exception 'PHASE77 SELF-CHECK FAIL (i): chat-documents bucket missing or not private';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'chat_documents_read_party' and cmd = 'SELECT'
      and roles = '{authenticated}'
  ) then
    raise exception 'PHASE77 SELF-CHECK FAIL (i): chat_documents_read_party missing or mis-scoped';
  end if;
  select with_check into v_check from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'chat_documents_insert_party' and cmd = 'INSERT'
    and roles = '{authenticated}';
  if v_check is null then
    raise exception 'PHASE77 SELF-CHECK FAIL (i): chat_documents_insert_party missing or mis-scoped';
  end if;
  if v_check not like '%is_blocked_between%'
     or v_check not like '%direct_threads%'
     or v_check not like '%jobs%'
     or v_check not like '%is_active_user%' then
    raise exception 'PHASE77 SELF-CHECK FAIL (i): the document insert policy must gate blocks and bans on BOTH thread kinds';
  end if;

  raise notice 'PHASE77 SELF-CHECK PASS: 9 assertion groups verified';
end $$;

-- ---------------------------------------------------------------------------
-- 11. Sentinel, created last, so scripts/verify-schema.mjs cannot see it
--     unless everything above - the proof matrix and self-check included -
--     committed.
-- ---------------------------------------------------------------------------
create or replace function public.phase77_conversation_features_enabled()
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$ select true $function$;

revoke all on function public.phase77_conversation_features_enabled() from public, anon;
grant execute on function public.phase77_conversation_features_enabled() to authenticated;

comment on function public.phase77_conversation_features_enabled() is
  'Marker for scripts/verify-schema.mjs: phase77_conversation_features.sql has been applied. Created last inside phase77''s transaction, so its presence proves the entire file - the is_blocked_between proof matrix and the self-check included - committed.';

commit;
