-- ============================================================================
-- Brazos · Message reactions (emoji tapback, like iMessage)
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- Adds:
--   1. public.message_reactions — one row per (message, user); a unique
--      constraint on (message_id, user_id) means upserting a new emoji
--      replaces the old one (one reaction per person per message).
--   2. RLS: only the job's client or assigned worker can read/write
--      reactions on that job's messages; a user can only write/delete their
--      own reaction.
--   3. message_reactions added to the supabase_realtime publication, so a
--      reaction shows up live for both people.
--
-- Design note: reactions live in their own table rather than a column on
-- `messages` because a message can carry reactions from BOTH parties at once
-- (client hearts it, worker thumbs-ups it) — a single column can't hold two
-- people's reactions. `job_id` is denormalized onto this table (in addition
-- to message_id) purely so the client can subscribe to realtime with the
-- same `job_id=eq.<id>` filter already used for `messages`, and so RLS here
-- mirrors the existing messages policies exactly without an extra join.
-- ============================================================================

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id)
);

create index if not exists message_reactions_job_id_idx
  on public.message_reactions (job_id);

alter table public.message_reactions enable row level security;

-- SELECT: only a party to the job can read its reactions.
drop policy if exists "message_reactions_select_party" on public.message_reactions;
create policy "message_reactions_select_party"
  on public.message_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = message_reactions.job_id
        and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
    )
  );

-- INSERT: must react as yourself, be a party to the job, and the message you're
-- reacting to must actually belong to that job (guards against a mismatched
-- message_id/job_id pair).
drop policy if exists "message_reactions_insert_own" on public.message_reactions;
create policy "message_reactions_insert_own"
  on public.message_reactions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.jobs j
      where j.id = message_reactions.job_id
        and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
    )
    and exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
        and m.job_id = message_reactions.job_id
    )
  );

-- UPDATE: needed for upsert's on-conflict path (tapping a different emoji
-- replaces your existing reaction on that message).
drop policy if exists "message_reactions_update_own" on public.message_reactions;
create policy "message_reactions_update_own"
  on public.message_reactions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- DELETE: un-reacting (tap your existing reaction again to remove it).
drop policy if exists "message_reactions_delete_own" on public.message_reactions;
create policy "message_reactions_delete_own"
  on public.message_reactions for delete
  to authenticated
  using (user_id = auth.uid());

-- Realtime: add message_reactions to the supabase_realtime publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end $$;
