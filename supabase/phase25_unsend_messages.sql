-- ============================================================================
-- Brazos · Unsend messages
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- Adds a 15-minute "Unsend" to the message long-press menu. Unsending
-- doesn't delete the row — it wipes the content/attachment fields and stamps
-- unsent_at, so the thread's order and the other party's view of "someone
-- sent something here" stay intact, same as every mainstream messaging app.
--
-- The 15-minute window is enforced server-side in unsend_message() (not just
-- hidden client-side once the menu item disappears), so it can't be bypassed
-- by calling the RPC directly after the window closes.
-- ============================================================================

alter table public.messages
  add column if not exists unsent_at timestamptz;

create or replace function public.unsend_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid;
  v_created_at timestamptz;
begin
  select sender_id, created_at into v_sender_id, v_created_at
  from public.messages
  where id = p_message_id;

  if v_sender_id is null then
    raise exception 'Message not found';
  end if;

  if v_sender_id <> auth.uid() then
    raise exception 'You can only unsend your own messages';
  end if;

  if now() - v_created_at > interval '15 minutes' then
    raise exception 'Unsend is only available for 15 minutes after sending';
  end if;

  update public.messages
  set content = '',
      image_url = null,
      audio_url = null,
      audio_duration_ms = null,
      unsent_at = now()
  where id = p_message_id;
end;
$$;

grant execute on function public.unsend_message(uuid) to authenticated;

-- Recreate the inbox view with unsent_at carried through, same reason as
-- phase16's note: `create or replace view` can't add a column, so the view
-- is dropped first. Nothing else depends on it besides the app's own select.
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
  m.unsent_at as last_message_unsent_at,
  m.created_at as last_message_at
from public.messages m
join public.jobs j on j.id = m.job_id
order by m.job_id, m.created_at desc;

grant select on public.conversations to authenticated;
