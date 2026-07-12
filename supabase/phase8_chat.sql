-- ============================================================================
-- Brazos · In-app chat (Pillar B — basic: text + photos)
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- Adds:
--   1. public.messages table (job_id, sender_id, content, image_url, created_at)
--   2. RLS: only the job's client and assigned worker can read/send messages
--   3. messages added to the supabase_realtime publication (live chat, no
--      manual refresh needed)
--   4. public `chat-photos` storage bucket + policies
-- ============================================================================

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists messages_job_id_created_at_idx
  on public.messages (job_id, created_at);

alter table public.messages enable row level security;

-- SELECT: only the job's client or its assigned worker can read its messages.
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
  );

-- INSERT: sender must be a party to the job (client or assigned worker), and
-- can only send as themselves.
drop policy if exists "messages_insert_party" on public.messages;
create policy "messages_insert_party"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.jobs j
      where j.id = messages.job_id
        and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
    )
  );

-- Realtime: add messages to the supabase_realtime publication so both sides
-- see new messages instantly without refreshing.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- Storage bucket for in-chat photos.
insert into storage.buckets (id, name, public)
values ('chat-photos', 'chat-photos', true)
on conflict (id) do nothing;

drop policy if exists "chat_photos_read" on storage.objects;
create policy "chat_photos_read"
  on storage.objects for select
  to public
  using (bucket_id = 'chat-photos');

drop policy if exists "chat_photos_insert" on storage.objects;
create policy "chat_photos_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'chat-photos');
