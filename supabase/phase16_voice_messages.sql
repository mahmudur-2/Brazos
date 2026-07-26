-- ============================================================================
-- Brazos · Voice messages in chat
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- Adds an audio attachment alongside the existing text/image message shape:
--   * messages.audio_url        — public URL of the recorded clip
--   * messages.audio_duration_ms — clip length, so the bubble can show "0:07"
--     and size its progress bar without downloading the file first
--   * a public `chat-audio` storage bucket, mirroring `chat-photos` (phase8)
--
-- Note on `content`: it stays NOT NULL (unchanged), so a voice message is
-- stored with content = '' and a non-null audio_url. The inbox preview keys
-- off audio_url being present, the same way it already keys off image_url.
-- ============================================================================

alter table public.messages
  add column if not exists audio_url text,
  add column if not exists audio_duration_ms integer;

-- Storage bucket for voice notes. Same shape/policies as chat-photos: public
-- read (URLs are unguessable and the app only ever surfaces them inside a
-- conversation the viewer is already party to), authenticated insert.
insert into storage.buckets (id, name, public)
values ('chat-audio', 'chat-audio', true)
on conflict (id) do nothing;

drop policy if exists "chat_audio_read" on storage.objects;
create policy "chat_audio_read"
  on storage.objects for select
  to public
  using (bucket_id = 'chat-audio');

drop policy if exists "chat_audio_insert" on storage.objects;
create policy "chat_audio_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'chat-audio');

-- Recreate the inbox view with the audio column carried through. Without it a
-- voice message shows as an empty "…" preview in Messages, since its `content`
-- is '' by design. Same definition as phase9 otherwise.
--
-- `create or replace view` cannot add a column to an existing view in
-- Postgres (it errors with "cannot change name of view column"), so the view
-- is dropped first. Nothing depends on it besides the app's own select.
drop view if exists public.conversations;

create view public.conversations
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
  m.audio_url as last_message_audio_url,
  m.created_at as last_message_at
from public.messages m
join public.jobs j on j.id = m.job_id
order by m.job_id, m.created_at desc;

grant select on public.conversations to authenticated;
