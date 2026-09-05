-- ============================================================================
-- BRAZOS V2 · hardening run · direct-thread messages reach the feed
--
-- Safe to re-run (idempotent). Apply with psql; verify with verify-schema.
--
-- DEFECT (proven by code path, caught by the A2 lifecycle proof):
-- notify_on_message() resolves the recipient from public.jobs by
-- new.job_id and returns early when the job row is absent — which is every
-- DIRECT-THREAD message, because those rows carry direct_thread_id and a
-- NULL job_id (phase36). Phase 7 made the pair's direct thread the pre-hire
-- conversation, so a bidder's "could I come by at nine?" produced no feed
-- row and no push enqueue at all. The job-thread path, previews, dedupe and
-- the hire-request double-buzz guard are unchanged; the direct branch
-- resolves the recipient from the thread's two participants instead.
-- ============================================================================

begin;

create or replace function public.notify_on_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs;
  v_thread public.direct_threads;
  v_recipient uuid;
  v_preview text;
begin
  -- Hire-request events also insert a message row (phase18). Those are
  -- notified from the negotiation triggers, which know the state — notifying
  -- here as well would double-buzz for a single action.
  if new.job_request_id is not null then
    return new;
  end if;

  if new.job_id is not null then
    select * into v_job from public.jobs where id = new.job_id;
    if v_job.id is null then
      return new;
    end if;
    v_recipient := case
      when v_job.client_id = new.sender_id then v_job.assigned_worker_id
      else v_job.client_id
    end;
  elsif new.direct_thread_id is not null then
    -- phase57: the pre-hire pair thread. The recipient is simply the other
    -- participant.
    select * into v_thread from public.direct_threads where id = new.direct_thread_id;
    if v_thread.id is null then
      return new;
    end if;
    v_recipient := case
      when v_thread.user_a = new.sender_id then v_thread.user_b
      else v_thread.user_a
    end;
  else
    return new;
  end if;

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
    case
      when new.job_id is not null then
        jsonb_build_object('screen', 'Chat', 'jobId', new.job_id::text)
      else
        jsonb_build_object('screen', 'Chat', 'directThreadId', new.direct_thread_id::text)
    end,
    'message:' || new.id::text
  );

  return new;
end;
$$;

revoke all on function public.notify_on_message() from public, anon, authenticated;

create or replace function public.direct_thread_notifications_enabled()
returns boolean
language sql
immutable
as $$
  select true;
$$;

revoke all on function public.direct_thread_notifications_enabled() from public, anon;
grant execute on function public.direct_thread_notifications_enabled() to authenticated;

notify pgrst, 'reload schema';

commit;
