-- ============================================================================
-- BRAZOS V2 · Phase 12 · the in-app notification feed (screen 42)
--
-- Safe to re-run (idempotent). Apply with psql; verify with verify-schema.
--
-- phase20 already built the pipeline: notification_outbox (dedupe_key,
-- prefs-gated via should_notify) fed by triggers on messages, job status,
-- negotiation events, reviews and nearby jobs — a delivery QUEUE with no
-- client access and no sender (the honest no-op delivery adapter). Phase 12
-- turns the same rows into the recipient's in-app feed and completes the
-- event map with the two Phase-6 moments it predates:
--   1. read_at + recipient-only SELECT + column-granted UPDATE(read_at)
--   2. payments released -> notify the payee (approval / auto-approval)
--   3. job_disputes opened -> notify the worker
-- ============================================================================

begin;

-- 1. Feed access ---------------------------------------------------------------

alter table public.notification_outbox
  add column if not exists read_at timestamptz;

alter table public.notification_outbox enable row level security;

drop policy if exists "outbox_select_recipient" on public.notification_outbox;
create policy "outbox_select_recipient"
  on public.notification_outbox for select
  to authenticated
  using (recipient_id = auth.uid());

drop policy if exists "outbox_update_recipient" on public.notification_outbox;
create policy "outbox_update_recipient"
  on public.notification_outbox for update
  to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- The recipient may write exactly ONE column: their read marker. Delivery
-- bookkeeping (status/attempts/sent_at) stays server-side.
revoke all on public.notification_outbox from public, anon;
revoke insert, update, delete, truncate, references, trigger
  on public.notification_outbox from authenticated;
grant select on public.notification_outbox to authenticated;
grant update (read_at) on public.notification_outbox to authenticated;

comment on column public.notification_outbox.read_at is
  'When the recipient opened this in their feed (phase56). The recipient''s only writable column.';

-- 2. should_notify: drop the push-token gate -----------------------------------
--
-- phase20's should_notify refused to enqueue when the recipient had no
-- active push token — correct for a pure delivery queue ("don't grow rows
-- that can never be sent"), wrong now that the same rows ARE the in-app
-- feed: an event belongs in the feed whether or not a device is registered.
-- Recreated identically minus that final gate; every preference, mute,
-- block and ban check stays exactly as phase20 wrote it.

create or replace function public.should_notify(
  p_recipient uuid,
  p_actor uuid,
  p_category text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_prefs public.notification_prefs;
  v_allowed boolean;
begin
  if p_recipient is null then
    return false;
  end if;
  if p_actor is not null and p_actor = p_recipient then
    return false;
  end if;
  if exists (select 1 from public.profiles p where p.id = p_recipient and p.banned) then
    return false;
  end if;
  if p_actor is not null then
    if public.is_blocked_between(p_recipient, p_actor) then
      return false;
    end if;
    if exists (
      select 1 from public.mutes m
      where m.muter_id = p_recipient and m.muted_id = p_actor
    ) then
      return false;
    end if;
    if exists (select 1 from public.profiles p where p.id = p_actor and p.banned) then
      return false;
    end if;
  end if;

  select * into v_prefs from public.notification_prefs where user_id = p_recipient;
  if v_prefs.user_id is null then
    v_allowed := (p_category <> 'nearby_jobs');
  else
    v_allowed := case p_category
      when 'messages'      then v_prefs.messages
      when 'bids'          then v_prefs.bids
      when 'job_updates'   then v_prefs.job_updates
      when 'hire_requests' then v_prefs.hire_requests
      when 'nearby_jobs'   then v_prefs.nearby_jobs
      else true
    end;
  end if;

  return v_allowed;
end;
$$;

revoke all on function public.should_notify(uuid, uuid, text) from public, anon, authenticated;

-- 3. Payment released -> the payee hears about it ------------------------------

create or replace function public.notify_on_payment_release()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text;
begin
  if new.status = 'released' and old.status is distinct from 'released'
     and new.kind = 'job_payment' then
    v_title := case when new.release_reason = 'auto_approved'
      then 'Payment released automatically'
      else 'Your work was approved' end;
    perform public.enqueue_notification(
      new.payee_id,
      new.payer_id,
      'jobs',
      'payment_released',
      v_title,
      'The payment is released to you in the sandbox ledger.',
      jsonb_build_object('screen', 'WorkerJob', 'jobId', new.job_id::text),
      'payment_released:' || new.id::text
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_on_payment_release() from public, anon, authenticated;

drop trigger if exists payments_notify_release on public.payments;
create trigger payments_notify_release
  after update on public.payments
  for each row
  execute function public.notify_on_payment_release();

-- 3. Dispute opened -> the worker hears about it -------------------------------

create or replace function public.notify_on_dispute()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker uuid;
begin
  select assigned_worker_id into v_worker from public.jobs where id = new.job_id;
  if v_worker is not null then
    perform public.enqueue_notification(
      v_worker,
      new.opened_by,
      'jobs',
      'dispute_opened',
      'An issue was reported',
      'The customer reported an issue with the finished work — the payment holds while it''s open.',
      jsonb_build_object('screen', 'WorkerJob', 'jobId', new.job_id::text),
      'dispute_opened:' || new.id::text
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_on_dispute() from public, anon, authenticated;

drop trigger if exists job_disputes_notify on public.job_disputes;
create trigger job_disputes_notify
  after insert on public.job_disputes
  for each row
  execute function public.notify_on_dispute();

-- 4. verify-schema sentinel ----------------------------------------------------

create or replace function public.notification_feed_enabled()
returns boolean
language sql
immutable
as $$
  select true;
$$;

revoke all on function public.notification_feed_enabled() from public, anon;
grant execute on function public.notification_feed_enabled() to authenticated;

notify pgrst, 'reload schema';

commit;
