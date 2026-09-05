-- ============================================================================
-- Brazos · Messages inbox (conversation list + unread tracking)
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- Adds:
--   1. public.message_reads — tracks, per user per job, when they last opened
--      that chat. Drives the unread dot on the Messages tab.
--   2. RLS on message_reads: a user can only read/write their own rows.
--   3. public.conversations view — one row per job with its latest message
--      (job_id, job_title, both parties, last message + sender + timestamp).
--      Built with security_invoker so it enforces the QUERYING USER's existing
--      RLS on messages/jobs rather than the view owner's — a user only ever
--      sees a conversation for a job they're the client or assigned worker
--      on, because that's already what messages_select_party / jobs_select_*
--      enforce on the underlying tables. Requires Postgres 15+ (Supabase
--      projects created in the last few years all qualify).
-- ============================================================================

create table if not exists public.message_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

alter table public.message_reads enable row level security;

drop policy if exists "message_reads_select_own" on public.message_reads;
create policy "message_reads_select_own"
  on public.message_reads for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "message_reads_insert_own" on public.message_reads;
create policy "message_reads_insert_own"
  on public.message_reads for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "message_reads_update_own" on public.message_reads;
create policy "message_reads_update_own"
  on public.message_reads for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace view public.conversations
with (security_invoker = true) as
select distinct on (m.job_id)
  m.job_id,
  j.title as job_title,
  j.client_id,
  j.assigned_worker_id,
  m.id as last_message_id,
  m.sender_id as last_message_sender_id,
  m.content as last_message_content,
  m.image_url as last_message_image_url,
  m.created_at as last_message_at
from public.messages m
join public.jobs j on j.id = m.job_id
order by m.job_id, m.created_at desc;

-- Belt-and-suspenders: explicit grant in case this project's default
-- privileges don't cover newly created views the way they cover tables.
grant select on public.conversations to authenticated;
