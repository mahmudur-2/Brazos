-- message_hire_quiet — production-36h S4, B2: one event, one push. When the worker says yes to the
-- customer's own offer, the customer is told once, by the hire notice.
--
-- WHAT WAS WRONG. Since hire_notice, a hire made by the worker accepting the customer's offer sends
-- the customer the hire_accepted notice (notify_on_job_status, category jobs). The thread's
-- "accepted" card that accept_offer writes (offer_post_event; live body: post_window) also fired
-- notify_on_message's generic "New message" push (category messages), so a customer with message
-- notifications on got two pushes for the one event.
--
-- WHAT CHANGES. notify_on_message(): the 20261108000000_lean_v1.sql:916-1024 body verbatim, plus ONE
-- block before the recipient is chosen: an "accepted" card on an offer the job's customer wrote,
-- sent by someone other than the customer (the worker said yes), returns without a push. That is
-- the case in which hire_notice's branch (4b) sends hire_accepted (for a repeat visit's draft,
-- series_confirm instead; that case already returned earlier in this body). Nothing else changes: the
-- message row, its thread, the read markers (message_reads) and so the unread counts; every other
-- card (created, countered, declined, withdrawn, expired; an "accepted" card on the worker's own
-- offer, which the customer accepted) and every chat message keep their push. The revoke is
-- restated as the live ACL holds it (20261112050000_access_start_state.sql took service_role's
-- grant too): a trigger function needs no caller grant.
--
-- Additive under scripts/staging-scan.sh. Proof: supabase/tests/495_message_hire_quiet.sql.

begin;

create or replace function public.notify_on_message() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs;
  v_thread public.direct_threads;
  v_recipient uuid;
  v_preview text;
begin
  -- Idea 14 (2026-09-30; narrowed by the group 4 review): a repeat visit's first refusal says three of
  -- its moments itself — the worker's "Repeat visit" push (created), the customer's "can come ·
  -- Confirm" (accepted) and "open to bids" (the worker declined) — so those do not buzz a second time
  -- as "New message". An allow-list: every other event (a counter, the customer turning a counter
  -- down, a withdrawal, a lapse) keeps its push, so nobody is left uninformed. While the series itself
  -- closes an offer (stop, drop: brazos.series_quiet) it tells the other side in words instead; and
  -- the offer being written right now (brazos.series_offer, set by series_offer_visit) is caught before
  -- its visit is tied to the series — its 'created' event alone.
  if new.job_offer_id is not null and new.request_event is not null then
    if coalesce(current_setting('brazos.series_quiet', true), '') = 'on' then
      return new;
    end if;
    if new.request_event = 'created' and coalesce(current_setting('brazos.series_offer', true), '') = 'on' then
      return new;
    end if;
    if new.request_event in ('created', 'accepted', 'declined') then
      perform 1
        from public.job_offers o
        join public.jobs j on j.id = o.job_id
       where o.id = new.job_offer_id
         and j.series_id is not null
         -- A decline is the series' to say only when the worker declined the customer's offer.
         and (new.request_event <> 'declined' or o.author_id = j.client_id);
      if found then
        return new;
      end if;
    end if;
  end if;

  -- phase61: marketplace offer chains now post thread messages, which they
  -- never did before. Their lifecycle is already notified by dedicated
  -- triggers — phase20 bid_received for the root (via the phase47 projection)
  -- and phase59 offer_countered for counters — so a generic "New message"
  -- here would double-buzz the same action. Scoped to marketplace chains:
  -- direct-offer events keep the exact behaviour phase57 shipped, and normal
  -- chat never carries job_offer_id (lib/messages.ts sendMessage()).
  if new.job_offer_id is not null and new.request_event is not null then
    perform 1
      from public.job_offers o
     where o.id = new.job_offer_id
       and o.offer_type = 'marketplace_bid';
    if found then
      return new;
    end if;
  end if;

  -- >>> message_hire_quiet (B2): the worker saying yes to the customer's own offer is told to the
  -- customer by notify_on_job_status's hire_accepted notice (hire_notice), under the always-on
  -- category; the thread's "accepted" card does not buzz a second time as "New message". The card
  -- is written as before. When the customer accepts the worker's offer, the worker keeps this push.
  if new.job_offer_id is not null and new.request_event = 'accepted' then
    perform 1
      from public.job_offers o
      join public.jobs j on j.id = o.job_id
     where o.id = new.job_offer_id
       and o.author_id = j.client_id
       and new.sender_id is distinct from j.client_id;
    if found then
      return new;
    end if;
  end if;
  -- <<< message_hire_quiet

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
revoke all on function public.notify_on_message() from public, anon, authenticated, service_role;

commit;
