-- 20261108000000_lean_v1.sql: lean v1, slice D6. Drops the database objects of every feature slices
-- D3-D5 removed from the app, re-creates the kept functions that touched them (same ACLs, minus the
-- cut branches), and adds what a fresh stack lacked: the auth.users profile trigger and the push timer.
-- The exact list and the why: docs/lean/CUT-LIST.md rulings 44-53 and slice D6. DESTRUCTIVE under
-- scripts/staging-scan.sh by design: staging applies it by hand or with allow_destructive.
-- Undo: tag pre-lean-2026-11 plus a corrective migration; rows in the dropped tables do not come back.

-- ---------------------------------------------------------------------------
-- 1. Live location. The table's policy goes with the table.
-- ---------------------------------------------------------------------------
drop function if exists public.start_live_location(double precision, double precision, timestamptz, uuid, uuid);
drop function if exists public.update_live_location(double precision, double precision, uuid, uuid);
drop function if exists public.stop_live_location(uuid, uuid);
drop function if exists public.conversation_parties(uuid, uuid);
drop table if exists public.live_location_shares;

-- ---------------------------------------------------------------------------
-- 2. Conversation states, timed blocks, mutes, mark-unread, read ticks. message_reads and
--    mark_direct_thread_read stay (the inbox unread badge); the other party no longer reads yours.
-- ---------------------------------------------------------------------------
drop function if exists public.set_conversation_state(uuid, uuid, boolean, boolean, boolean, boolean);
drop function if exists public.set_block(uuid, timestamptz);
drop function if exists public.set_direct_thread_read_at(uuid, timestamptz);
drop table if exists public.conversation_states;
drop table if exists public.mutes;
drop policy if exists message_reads_select_party on public.message_reads;

-- ---------------------------------------------------------------------------
-- 3. Reactions. Its four policies go with the table.
-- ---------------------------------------------------------------------------
drop table if exists public.message_reactions;

-- ---------------------------------------------------------------------------
-- 4. Saved workers, portfolio, checklist. portfolio_items takes its three triggers (cap, blocked
--    terms, semantic stale) and its policies with it; reject_blocked_terms() stays for its other tables.
-- ---------------------------------------------------------------------------
drop table if exists public.saved_workers;
drop table if exists public.portfolio_items;
drop function if exists public.enforce_portfolio_cap();
drop table if exists public.job_checklist_items;

-- ---------------------------------------------------------------------------
-- 5. Semantic worker search. worker_semantic_docs.embedding was the vector extension's only user.
-- ---------------------------------------------------------------------------
drop trigger if exists jobs_worker_semantic_stale on public.jobs;
drop trigger if exists profiles_worker_semantic_stale on public.profiles;
drop function if exists public.mark_worker_semantic_stale();
drop function if exists public.apply_worker_embeddings(jsonb, text);
drop function if exists public.build_worker_semantic_source(uuid);
drop function if exists public.match_workers_semantic(double precision[], text[], integer, double precision);
drop function if exists public.refresh_worker_semantic_doc(uuid);
drop function if exists public.worker_semantic_coverage();
drop function if exists public.worker_semantic_refresh_queue(integer);
drop table if exists public.worker_semantic_docs;
drop extension if exists vector;

-- ---------------------------------------------------------------------------
-- 6. Lock-screen live card. The timer goes first, where pg_cron exists (the installers' guard).
-- ---------------------------------------------------------------------------
do $$
declare
  v_stale bigint;
begin
  if public.pg_function_present('cron', 'schedule') then
    for v_stale in select j.jobid from cron.job j where j.jobname = 'brazos-live-cards'
    loop
      perform cron.unschedule(v_stale);
    end loop;
  end if;
end $$;
drop trigger if exists jobs_live_card on public.jobs;
drop function if exists public.drain_live_cards();
drop function if exists public.install_live_card_schedule();
drop function if exists public.claim_live_card_batch(integer);
drop function if exists public.resolve_live_card(uuid, text, text);
drop function if exists public.live_card_enqueue();
drop function if exists public.register_live_activity(uuid, text, text);
drop function if exists public.live_card_state(uuid);
drop function if exists public.clock_label(integer);
drop table if exists public.live_card_outbox;
drop table if exists public.live_activity_tokens;

-- ---------------------------------------------------------------------------
-- 7. Dead legacy. The bids table, its mirror trigger and notify_on_bid() stay: they carry the
--    new-bid push (ruling 46). Only the uncalled RPCs and the probe view go.
-- ---------------------------------------------------------------------------
drop function if exists public.accept_bid(uuid, uuid);
drop function if exists public.create_bid(uuid, integer, text);
drop function if exists public.create_job_request(uuid, text, text, text, text, integer, jsonb, double precision, double precision, uuid, jsonb);
drop function if exists public.job_bid_count(uuid);
drop function if exists public.job_bid_counts(uuid[]);
drop function if exists public.my_pending_job_requests();
drop function if exists public.respond_job_request(uuid, text, integer);
drop view if exists public.v_bids_projection_drift;

-- job_requests: the blocks trigger, then messages.job_request_id (its FK), then the table (its
-- notify trigger goes with it). The conversations view and messages_insert_party read that column
-- (and audio_url, dropped in section 11): the view is re-created in section 11; the policy loses both
-- here. Structured negotiation events are still exempt from the lock and still payload-free.
drop trigger if exists blocks_close_job_requests on public.blocks;
drop function if exists public.close_requests_on_block();
drop view if exists public.conversations;
alter policy messages_insert_party on public.messages with check (
  sender_id = auth.uid()
  and public.is_active_user()
  and (
    exists (
      select 1 from public.jobs j
      where j.id = messages.job_id
        and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
        and not public.is_blocked_between(j.client_id, coalesce(j.assigned_worker_id, j.client_id))
    )
    or exists (
      select 1 from public.direct_threads t
      where t.id = messages.direct_thread_id
        and (t.user_a = auth.uid() or t.user_b = auth.uid())
        and not public.is_blocked_between(t.user_a, t.user_b)
    )
  )
  and (
    public.messaging_unlocked(job_id, direct_thread_id)
    or (job_offer_id is not null and coalesce(btrim(content), '') = '' and image_url is null)
  )
);
alter table public.messages drop column if exists job_request_id;
drop table if exists public.job_requests;
drop function if exists public.notify_on_job_request();

-- Saved properties and the areas lookup.
drop function if exists public.set_job_property(uuid, uuid);
drop function if exists public.area_for_point(double precision, double precision);
alter table public.jobs drop column if exists property_id, drop column if exists area_code;
drop table if exists public.properties;
drop table if exists public.areas;

-- Superseded by my_payouts_status().
drop function if exists public.my_payouts_enabled();

-- The seven inert policies: no grant lets their role run the command they govern.
drop policy if exists "clients insert own jobs" on public.jobs;
drop policy if exists "clients update own jobs" on public.jobs;
drop policy if exists reviews_insert_completed_party on public.reviews;
drop policy if exists "users insert own profile" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "workers insert own bids" on public.bids;
drop policy if exists "workers update own bids" on public.bids;

-- ---------------------------------------------------------------------------
-- 8. Sandbox money. The five RPCs and two markers go; seven kept functions lose their
--    provider = 'sandbox' branches (bodies otherwise verbatim, ACLs restated as they were).
-- ---------------------------------------------------------------------------
drop function if exists public.sandbox_authorize_job_payment(uuid);
drop function if exists public.sandbox_hold_job_payment(uuid);
drop function if exists public.sandbox_release_job_payment(uuid);
drop function if exists public.sandbox_tip_worker(uuid, integer);
drop function if exists public.sandbox_cash_out();
drop function if exists public.sandbox_cash_out_enabled();
drop function if exists public.sandbox_payments_enabled();

alter table public.payments alter column provider set default 'stripe';
-- payments_provider_known still admits 'sandbox'.
-- shortcut: legacy sandbox rows on staging, tighten after a staging reset
comment on column public.payments.provider is
  'stripe for every new row. payments_provider_known still admits sandbox, for legacy staging rows only.';

create or replace function public.ban_user(p_target uuid, p_report_id uuid default null) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text;
  v_job record;
  v_other uuid;
  v_rows integer;
  v_now timestamptz := now();
begin
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  ) then
    raise exception 'Only admins may ban users';
  end if;

  update public.profiles set banned = true where id = p_target;

  select phone into v_phone from public.profiles where id = p_target;
  if v_phone is not null and length(btrim(v_phone)) > 0 then
    insert into public.banned_phones (phone, banned_profile_id)
    values (btrim(v_phone), p_target)
    on conflict (phone) do nothing;
  end if;

  -- Cancel anything still in flight, notifying the counterparty. A11 review 2: each job is LOCKED
  -- before anything is written, the cancellation re-checks the status it is leaving, and a job the
  -- lock found already moved on is left alone — no money, no message, since this ban cancelled
  -- nothing there.
  for v_job in
    select id, client_id, assigned_worker_id, status
    from public.jobs
    where status in ('open', 'assigned', 'in_progress')
      and (client_id = p_target or assigned_worker_id = p_target)
    for update
  loop
    update public.jobs
       set status = 'cancelled'
     where id = v_job.id
       and status in ('open', 'assigned', 'in_progress');
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      continue;
    end if;

    -- A11: the money the cancellation strands goes home. Undirected held rows only — see the
    -- header of 20261003000100; the shape is cancel_job()'s worker_cancelled branch with its own
    -- reason. A11 review 2: NOT when the banned account is the CUSTOMER of a job already in
    -- progress — the worker has been working, and a refund would hand their pay back to the
    -- account that was banned. That row stays held and undirected for the operator
    -- (resolve_job_dispute(): a cancelled job with no open claim and an undirected held row).
    if not (v_job.client_id = p_target and v_job.status = 'in_progress') then
      update public.payments
         set refund_cents = charge_amount_cents,
             transfer_cents = 0,
             refund_reason = 'account_suspended',
             updated_at = v_now
       where job_id = v_job.id
         and kind = 'job_payment'
         and status = 'held'
         and coalesce(refund_cents, 0) = 0
         and coalesce(transfer_cents, 0) = 0
         and release_requested_at is null;
    end if;

    -- A11 review: a checkout started and never finished is voided, exactly as cancel_job() voids
    -- it — nothing was captured, so nothing is refunded, and the row leaves the deletion gate.
    update public.payments
       set status = 'voided', last_error = 'job cancelled before funding', updated_at = v_now
     where job_id = v_job.id
       and kind = 'job_payment'
       and status in ('unfunded', 'authorized');

    v_other := case
      when v_job.client_id = p_target then v_job.assigned_worker_id
      else v_job.client_id
    end;

    -- Notify the counterparty in the job's thread. There's no system-sender
    -- concept in `messages`, so this is attributed to the banned user — that
    -- way it lands as an INBOUND message for the person being notified,
    -- rather than appearing as something they sent themselves.
    if v_other is not null then
      insert into public.messages (job_id, sender_id, content)
      values (
        v_job.id,
        p_target,
        'This job was cancelled automatically because this account was suspended by Brazos.'
      );
    end if;
  end loop;

  if p_report_id is not null then
    update public.reports set status = 'actioned' where id = p_report_id;
  end if;
end;
$$;

revoke all on function public.ban_user(uuid, uuid) from public, anon;
grant execute on function public.ban_user(uuid, uuid) to authenticated;
comment on function public.ban_user(uuid, uuid) is
  'Admin only (profiles.is_admin, checked inside). Bans the account, blocks its phone, cancels its in-flight jobs and tells each counterparty in the thread. A11 (2026-10-03): on every job it cancels, an UNDIRECTED held job_payment (nothing yet refunded, transferred or released) is queued for a full refund of the card charge, reason account_suspended — it waits for charge.refunded through refunds_ready; a job_payment still unfunded or authorized (a checkout never finished) is voided as cancel_job() voids it, so it cannot block the counterparty''s account deletion. Rows already directed are left as they are; resolve_job_dispute() is the operator''s path for those. A11 review 2: the jobs are locked (for update) and re-checked before they are cancelled, a job that moved on meanwhile is skipped whole, and when the banned account is the job''s client and the job is in_progress the held row is left undirected for the operator instead of refunded.';

create or replace function public.job_payment_state(p_job_id uuid) returns public.payments
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_payment public.payments;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  select * into v_job from public.jobs where id = p_job_id;
  if not found or (v_job.client_id <> v_actor
                   and v_job.assigned_worker_id is distinct from v_actor) then
    raise exception 'Job not found';
  end if;

  select * into v_payment
  from public.payments
  where job_id = p_job_id and kind = 'job_payment'
    and status not in ('failed', 'voided')
  for update;
  if not found then
    return null;
  end if;

  return v_payment;
end;
$$;
revoke all on function public.job_payment_state(uuid) from public;
grant all on function public.job_payment_state(uuid) to authenticated;
comment on function public.job_payment_state(uuid) is
  'The job''s active job_payment row for its two parties, read-only; its 72h clock is auto_release_due_payments(). NULL when checkout never ran.';

create or replace function public.notify_on_payment_release() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_title text;
  v_body  text;
begin
  if new.status = 'released' and old.status is distinct from 'released'
     and new.kind = 'job_payment' then
    v_title := case when new.release_reason = 'auto_approved'
      then 'Payment released automatically'
      else 'Your work was approved' end;
    v_body := 'Your payment has been released and is on its way to your bank.';
    perform public.enqueue_notification(
      new.payee_id,
      new.payer_id,
      'jobs',
      'payment_released',
      v_title,
      v_body,
      jsonb_build_object('screen', 'WorkerJob', 'jobId', new.job_id::text),
      'payment_released:' || new.id::text
    );
  end if;
  return new;
end;
$$;
revoke all on function public.notify_on_payment_release() from public, anon, authenticated;
comment on function public.notify_on_payment_release() is
  'AFTER UPDATE on payments (trigger payments_notify_release): tells the payee their job_payment reached released, once, keyed payment_released:<payment id>, saying the payment is on its way to their bank. No dollar amount, no timing promise.';

create or replace function public.release_job_payment(p_job_id uuid) returns public.payments
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_payment public.payments;
begin
  if v_actor is null or not public.is_active_user() then raise exception 'Active authentication required'; end if;
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then raise exception 'Job not found'; end if;
  select * into v_payment from public.payments
   where job_id = p_job_id and kind = 'job_payment' and status not in ('failed', 'voided') for update;
  if not found then raise exception 'This job has no payment to release'; end if;
  -- Idempotent return, not a refusal: a release already requested (or already
  -- landed) returns the row with release_requested_at UNCHANGED. This is also
  -- what keeps a reversal-parked row exactly where it is.
  if v_payment.status in ('released', 'paid_out') or v_payment.release_requested_at is not null then return v_payment; end if;
  if v_job.status <> 'completed' then raise exception 'Funds release only after the job is completed'; end if;
  if exists (select 1 from public.job_disputes d where d.job_id = p_job_id and d.status = 'open') then
    raise exception 'An open issue report is holding this payment';
  end if;
  if v_payment.chargeback_at is not null then
    raise exception 'This payment is under review by the card issuer and cannot be released';
  end if;
  -- D6: a row already directed to a refund, or parked after a reversal, is skipped.
  if coalesce(v_payment.refund_cents, 0) > 0 or v_payment.transfer_reversed_at is not null then
    raise exception 'This payment is being refunded and cannot be released';
  end if;
  if v_payment.status <> 'held' then raise exception 'This payment is not held (%)', v_payment.status; end if;

  update public.payments
     set release_requested_at = now(),
         release_reason = 'approved',
         transfer_cents = amount_cents - platform_fee_cents,
         updated_at = now()
   where id = v_payment.id returning * into v_payment;
  return v_payment;
end $$;
revoke all on function public.release_job_payment(uuid) from public, anon;
grant execute on function public.release_job_payment(uuid) to authenticated;
comment on function public.release_job_payment(uuid) is
  'The customer approves the finished work. Guards: completed, no open issue report, no card dispute, not being refunded, held. Sets release_requested_at + transfer_cents (R5 transfers exactly that). A repeated call returns the row unchanged.';

create or replace function public.cancel_job(p_job_id uuid, p_reason text) returns public.jobs
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor       uuid := auth.uid();
  v_now         timestamptz := now();
  v_job         public.jobs;
  v_payment     public.payments;
  v_is_customer boolean;
  v_is_worker   boolean;
  v_terms       record;
  v_free        boolean;
  v_fee         integer := 0;
  v_charge      integer;
  v_anchor      timestamptz;
  v_window_end  timestamptz;
  v_other       uuid;
begin
  if v_actor is null or not public.is_active_user() then raise exception 'Active authentication required'; end if;
  if p_reason is null or p_reason not in ('customer_cancelled', 'worker_cancelled', 'customer_no_show') then
    raise exception 'Unknown cancellation reason';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then raise exception 'Job not found'; end if;
  v_is_customer := (v_job.client_id = v_actor);
  v_is_worker   := (v_job.assigned_worker_id is not null and v_job.assigned_worker_id = v_actor);
  if not v_is_customer and not v_is_worker then raise exception 'Job not found'; end if;

  -- The caller's role must match the reason.
  if p_reason = 'customer_cancelled' and not v_is_customer then
    raise exception 'Only the customer can cancel as the customer';
  end if;
  if p_reason in ('worker_cancelled', 'customer_no_show') and not v_is_worker then
    raise exception 'Only the assigned worker can cancel as the worker';
  end if;

  -- Job status admitted: open and draft (customer only), assigned and
  -- in_progress (either party). Allow-list, never a block-list.
  if v_job.status = 'cancelled' then raise exception 'This job is already cancelled'; end if;
  if v_job.status = 'completed' then raise exception 'This job is finished and can no longer be cancelled'; end if;
  if v_job.status not in ('open', 'draft', 'assigned', 'in_progress') then
    raise exception 'This job cannot be cancelled from its current state (%)', v_job.status;
  end if;
  if v_job.status in ('open', 'draft') and not v_is_customer then
    raise exception 'Only the customer can cancel a job that has no worker';
  end if;

  -- Lock order: the job row first, then the payment.
  select * into v_payment from public.payments
   where job_id = p_job_id and kind = 'job_payment' and status not in ('failed', 'voided') for update;
  if found and v_payment.status in ('released', 'paid_out', 'refunded', 'partially_refunded') then
    raise exception 'This job''s payment has already settled.';
  end if;
  if found and v_payment.status not in ('unfunded', 'authorized', 'held') then
    raise exception 'This job''s payment is in a state that cannot be cancelled automatically (%)', v_payment.status;
  end if;

  -- D6: the four no-show gates. A no-show is a CLAIM: it moves no money by
  -- itself (arrived_at and the claim are both worker-controlled). Only
  -- resolve_job_dispute() moves that money. The worker may still cancel as
  -- worker_cancelled instead.
  if p_reason = 'customer_no_show' then
    if v_job.status <> 'assigned' then raise exception 'A no-show can only be reported before the work starts'; end if;
    if v_job.arrived_at is null then raise exception 'Mark that you arrived before reporting a no-show'; end if;
    if v_job.scheduled_date is null then raise exception 'A no-show can only be reported on a scheduled job'; end if;
    v_window_end := (v_job.scheduled_date::timestamp + make_interval(hours => coalesce(v_job.arrival_end_hour, 24)::int))
                    at time zone 'America/New_York';
    if v_now <= v_window_end then raise exception 'A no-show can be reported once the arrival window has passed'; end if;
  end if;

  if v_payment.id is null then
    null;   -- no money: nothing to void, nothing to refund, nothing for R5
  elsif v_payment.status in ('unfunded', 'authorized') then
    -- Nothing was ever captured ('authorized' occurs only on legacy sandbox rows).
    update public.payments
       set status = 'voided', last_error = 'job cancelled before funding', updated_at = v_now
     where id = v_payment.id;
  else
    -- held in protection: the money branches. The charge = price + protection
    -- fee + tax; the fee, when it applies, is taken from the price alone, so
    -- the protection fee and tax are refunded in full in every case.
    v_charge := v_payment.charge_amount_cents;

    if p_reason = 'customer_cancelled' then
      -- D5, in this order: in_progress always carries the fee; otherwise free
      -- when more than 24h before the anchor, or within 15 minutes of
      -- acceptance (snapshot only), or when there is no scheduled_date.
      select * into v_terms from public.job_terms(p_job_id, v_payment.amount_cents);
      if v_job.status = 'in_progress' then
        v_free := false;
      elsif v_job.scheduled_date is null then
        v_free := true;
      elsif v_terms.accepted_at is not null and v_now - v_terms.accepted_at <= interval '15 minutes' then
        v_free := true;
      else
        v_anchor := (v_job.scheduled_date::timestamp + make_interval(hours => coalesce(v_job.arrival_start_hour, 0)::int))
                    at time zone 'America/New_York';
        v_free := v_now < v_anchor - interval '24 hours';
      end if;

      if v_free then
        update public.payments
           set refund_cents = v_charge, transfer_cents = 0, refund_reason = 'customer_cancelled_free',
               updated_at = v_now
         where id = v_payment.id;
      else
        v_fee := public.cancellation_fee_cents(p_job_id, v_payment.amount_cents);
        update public.payments
           set transfer_cents = v_fee, refund_cents = v_charge - v_fee,
               release_reason = 'cancellation_fee', release_requested_at = v_now,
               refund_reason = 'customer_cancelled_late',
               updated_at = v_now
         where id = v_payment.id;
      end if;

    elsif p_reason = 'worker_cancelled' then
      update public.payments
         set refund_cents = v_charge, transfer_cents = 0, refund_reason = 'worker_cancelled',
             updated_at = v_now
       where id = v_payment.id;

    else
      -- customer_no_show: the payment stays held, untouched. The claim is a
      -- job_disputes row the customer is notified of (notify_on_dispute);
      -- resolve_job_dispute() applies the fee or refunds in full, and a
      -- withdrawal refunds in full by trigger.
      insert into public.job_disputes (job_id, payment_id, opened_by, reason, status, details)
      values (p_job_id, v_payment.id, v_actor, 'no_show', 'open',
              'The worker reported a customer no-show: arrived at ' || v_job.arrived_at::text
              || ', arrival window ended ' || v_window_end::text || '.');
    end if;
  end if;

  update public.jobs
     set status = 'cancelled'::public.job_status,
         cancelled_at = v_now,
         cancelled_by = v_actor,
         cancel_reason = p_reason
   where id = p_job_id
  returning * into v_job;
  -- jobs_settle_offers_on_cancel (AFTER UPDATE OF status) declines the job's
  -- pending offers; the accepted offer keeps its history.

  -- Exactly one notification to the OTHER party. A no-show sends none from
  -- here: the customer's notice is the dispute row's own (notify_on_dispute),
  -- and "refunded in full" would be untrue while the claim is open.
  if p_reason <> 'customer_no_show' then
    v_other := case when v_is_customer then v_job.assigned_worker_id else v_job.client_id end;
    if v_other is not null then
      if v_is_customer then
        perform public.enqueue_notification(
          v_other, v_actor, 'jobs', 'job_cancelled',
          'Job cancelled',
          'The customer cancelled this job. Open it to see what happens with the payment.',
          jsonb_build_object('screen', 'WorkerJob', 'jobId', p_job_id::text),
          'job_cancelled:' || p_job_id::text
        );
      else
        perform public.enqueue_notification(
          v_other, v_actor, 'jobs', 'job_cancelled',
          'Job cancelled',
          'The worker cancelled this job. Your payment is being refunded in full.',
          jsonb_build_object('screen', 'ClientJobDetail', 'jobId', p_job_id::text),
          'job_cancelled:' || p_job_id::text
        );
      end if;
    end if;
  end if;

  return v_job;
end $$;
revoke all on function public.cancel_job(uuid, text) from public, anon;
grant execute on function public.cancel_job(uuid, text) to authenticated;

-- A withdrawn no-show claim refunds the customer in full — no human needed.
create or replace function public.refund_on_no_show_withdrawn() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_job public.jobs;
  v_payment public.payments;
begin
  select * into v_job from public.jobs where id = new.job_id for update;
  if not found or v_job.status <> 'cancelled' or v_job.cancel_reason is distinct from 'customer_no_show' then
    return new;
  end if;
  select * into v_payment from public.payments
   where job_id = new.job_id and kind = 'job_payment' and status not in ('failed', 'voided') for update;
  if not found or v_payment.status <> 'held'
     or coalesce(v_payment.refund_cents, 0) > 0 or coalesce(v_payment.transfer_cents, 0) > 0 then
    return new;
  end if;
  update public.payments
     set refund_cents = v_payment.charge_amount_cents, transfer_cents = 0, refund_reason = 'no_show_withdrawn',
         updated_at = now()
   where id = v_payment.id;
  return new;
end $$;
revoke all on function public.refund_on_no_show_withdrawn() from public, anon, authenticated;

create or replace function public.resolve_job_dispute(p_job_id uuid, p_in_favour_of text, p_note text default null) returns public.payments
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_now        timestamptz := now();
  v_job        public.jobs;
  v_payment    public.payments;
  v_dispute    public.job_disputes;
  v_worker_won boolean;
  v_park       boolean;
  v_undirected boolean;
  v_fee        integer;
  v_charge     integer;
begin
  if p_in_favour_of is null or p_in_favour_of not in ('worker', 'customer') then
    raise exception 'Resolve in favour of the worker or the customer';
  end if;
  v_worker_won := (p_in_favour_of = 'worker');

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then raise exception 'Job not found'; end if;
  select * into v_payment from public.payments
   where job_id = p_job_id and kind = 'job_payment' and status not in ('failed', 'voided') for update;
  select * into v_dispute from public.job_disputes
   where job_id = p_job_id and status = 'open' for update;

  v_park := v_payment.id is not null and v_payment.transfer_reversed_at is not null;
  v_undirected := v_payment.id is not null and v_payment.status = 'held'
                  and coalesce(v_payment.refund_cents, 0) = 0 and coalesce(v_payment.transfer_cents, 0) = 0
                  and v_payment.release_requested_at is null;

  if v_dispute.id is null and not v_park and not (v_job.status = 'cancelled' and v_undirected) then
    raise exception 'This job has nothing to resolve';
  end if;

  if v_dispute.id is not null then
    update public.job_disputes
       set status = 'resolved', resolved_at = v_now, resolution_note = p_note
     where id = v_dispute.id;
  end if;

  if v_payment.id is null then
    return null;   -- a claim with no money row: closed, nothing moves
  end if;
  v_charge := v_payment.charge_amount_cents;

  if v_job.status = 'completed' then
    if v_worker_won then
      if v_payment.chargeback_at is not null then
        raise exception 'This payment is under review by the card issuer and cannot be released';
      end if;
      -- The normal release; a reversal park is cleared here and ONLY here,
      -- incrementing transfer_attempts so R5's idempotency key changes.
      update public.payments
         set release_reason = 'dispute_resolved', release_requested_at = v_now,
             transfer_cents = amount_cents - platform_fee_cents, refund_cents = 0,
             transfer_attempts = transfer_attempts + (case when v_park then 1 else 0 end),
             transfer_reversed_at = null,
             updated_at = v_now
       where id = v_payment.id returning * into v_payment;
    else
      update public.payments
         set refund_cents = v_charge, transfer_cents = 0, refund_reason = 'dispute_refund',
             updated_at = v_now
       where id = v_payment.id returning * into v_payment;
    end if;

  elsif v_job.status = 'cancelled' then
    if v_dispute.id is not null and v_job.cancel_reason = 'customer_no_show' then
      if v_worker_won then
        v_fee := public.cancellation_fee_cents(p_job_id, v_payment.amount_cents);
        update public.payments
           set transfer_cents = v_fee, refund_cents = v_charge - v_fee,
               release_reason = 'cancellation_fee', refund_reason = 'customer_no_show', release_requested_at = v_now,
               updated_at = v_now
         where id = v_payment.id returning * into v_payment;
      else
        update public.payments
           set refund_cents = v_charge, transfer_cents = 0, refund_reason = 'dispute_refund',
               updated_at = v_now
         where id = v_payment.id returning * into v_payment;
      end if;
    else
      -- Cancelled, payment still held, no open claim (withdrawn or never
      -- opened): the customer's favour only.
      if v_worker_won then
        raise exception 'A cancelled job with no open claim can only be resolved in the customer''s favour';
      end if;
      update public.payments
         set refund_cents = v_charge, transfer_cents = 0, refund_reason = 'dispute_refund',
             updated_at = v_now
       where id = v_payment.id returning * into v_payment;
    end if;

  else
    raise exception 'This job has nothing to resolve';
  end if;

  return v_payment;
end $$;
revoke all on function public.resolve_job_dispute(uuid, text, text) from public, anon, authenticated;
grant execute on function public.resolve_job_dispute(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 9. Kept functions that touched cut objects (ruling 48), bodies otherwise verbatim, ACLs restated.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account() returns void
language plpgsql security definer
set search_path = public, pg_temp
as $_$
declare
  v_user uuid := auth.uid();
  v_offer record;
  v_cancelled integer := 0;
  v_withdrawn integer := 0;
  v_offer_failures integer := 0;
  v_auth_deleted integer;
begin
  -- (a)
  if v_user is null then
    raise exception 'Not signed in';
  end if;

  -- (a2) phase75: lock every job this account is party to, before the gate
  --      reads them. jobs first, always - see the header.
  perform 1
  from public.jobs
  where client_id = v_user or assigned_worker_id = v_user
  order by id
  for update;

  -- (b) The gate. Never a silent no-op: the client matches this exact string
  --     and re-renders the blocker list instead of showing a raw error.
  --     Read AFTER the lock above, so what it sees cannot move under it.
  if exists (select 1 from public.account_deletion_blockers()) then
    raise exception using
      errcode = 'P0001',
      message = 'ACCOUNT_DELETION_BLOCKED';
  end if;

  -- (c) Cancel, do not orphan. Raw UPDATE because transition_job_status()
  --     permits only assigned -> in_progress and in_progress -> completed and
  --     authorises only the assigned worker; an open job has no assigned
  --     worker at all. Drafts stay at draft on purpose. IN not NOT IN, so an
  --     unrecognised status is never auto-cancelled. No exception handler
  --     here, deliberately the opposite call from (d): a refusal to cancel the
  --     user's own live posting must abort, or the tombstone commits with a
  --     posting nobody can cancel.
  --
  --     phase75: offers other people authored on these jobs are now settled by
  --     the jobs_settle_offers_on_cancel trigger, which fires on this UPDATE.
  update public.jobs
     set status = 'cancelled'
   where client_id = v_user
     and status = 'open';

  get diagnostics v_cancelled = row_count;

  -- (d) Withdraw outbound commitments through withdraw_offer(), which posts
  --     the chain event that keeps the bids projection and the feed
  --     consistent. Each withdrawal is its own subtransaction: a pending offer
  --     sits on somebody else's job, and one refusal must not veto a deletion
  --     the user is entitled to. Failures are counted and named.
  if to_regclass('public.job_offers') is not null
     and to_regprocedure('public.withdraw_offer(uuid)') is not null then
    for v_offer in
      select o.id
      from public.job_offers o
      where o.author_id = v_user
        and o.status = 'pending'
        and (o.expires_at is null or o.expires_at > now())
      order by o.created_at
    loop
      begin
        perform public.withdraw_offer(v_offer.id);
        v_withdrawn := v_withdrawn + 1;
      exception when others then
        v_offer_failures := v_offer_failures + 1;
        raise notice
          'phase67: offer % could not be withdrawn (%) - left as-is, continuing.',
          v_offer.id, sqlerrm;
        continue;
      end;
    end loop;
  end if;

  -- (e) Hard delete private-only rows carrying no counterparty value.
  --     blocks is NOT here: a block has to survive.
  if to_regclass('public.push_tokens') is not null then
    delete from public.push_tokens where user_id = v_user;
  end if;
  if to_regclass('public.notification_prefs') is not null then
    delete from public.notification_prefs where user_id = v_user;
  end if;
  if to_regclass('public.notification_outbox') is not null then
    delete from public.notification_outbox where recipient_id = v_user;
  end if;
  if to_regclass('public.message_reads') is not null then
    delete from public.message_reads where user_id = v_user;
  end if;
  if to_regclass('public.worker_services') is not null then
    delete from public.worker_services where worker_id = v_user;
  end if;

  -- (f) Scrub the profile to a tombstone. NOT touched on purpose: id,
  --     created_at, rating_avg, rating_count, and banned - deletion must never
  --     launder a ban.
  update public.profiles
     set full_name         = 'Deleted user',
         phone             = null,
         avatar_url        = null,
         bio               = null,
         availability_note = null,
         categories        = null,
         completion_rate   = null,
         on_time_pct       = null,
         response_time     = null,
         is_admin          = false,
         accepting_work    = false,
         deleted_at        = now()
   where id = v_user;

  -- verification_status is a named enum this repo never defines, so the reset
  -- runs only if 'unverified' is actually a label. The app treats anything but
  -- 'verified' as unverified, so skipping is safe; guessing would break it.
  if exists (
    select 1
    from information_schema.columns c
    join pg_namespace ns on ns.nspname = c.udt_schema
    join pg_type t on t.typname = c.udt_name and t.typnamespace = ns.oid
    join pg_enum e on e.enumtypid = t.oid
    where c.table_schema = 'public'
      and c.table_name = 'profiles'
      and c.column_name = 'verification_status'
      and e.enumlabel = 'unverified'
  ) then
    execute 'update public.profiles set verification_status = ''unverified'' where id = $1'
      using v_user;
  else
    raise notice
      'phase67: profiles.verification_status left as-is (no ''unverified'' label found).';
  end if;

  -- stripe_account_id appears in no migration in this repo; cleared only if
  -- the live table actually has it.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'stripe_account_id'
  ) then
    execute 'update public.profiles set stripe_account_id = null where id = $1'
      using v_user;
  end if;

  -- (g) Denormalised identity on retained tables: audited, nothing to scrub.
  --     One exception, unscrubbable: notification_outbox.title/.body embed the
  --     actor's display name with no actor column. Recorded as a follow-up.

  -- (h) Storage cleanup deliberately not attempted.

  -- (i) The auth row. Only reachable because phase67 section 1 dropped every
  --     public foreign key pointing at auth.users. The row-count assertion is
  --     not padding: RLS is enabled on auth.users and this DELETE lands only
  --     while the function owner carries BYPASSRLS. Without the check, a
  --     zero-row DELETE would commit the tombstone and the scrub while the
  --     account could still sign in.
  delete from auth.users where id = v_user;

  get diagnostics v_auth_deleted = row_count;
  if v_auth_deleted <> 1 then
    raise exception
      'phase67: auth.users delete affected % row(s), expected 1. '
      'Rolling back - the profile scrub must not commit without it.',
      v_auth_deleted;
  end if;

  raise notice
    'phase67: account % deleted (% open posting(s) cancelled, % outbound offer(s) withdrawn, % withdrawal(s) failed).',
    v_user, v_cancelled, v_withdrawn, v_offer_failures;

  -- RETAINED DELIBERATELY, all pointing at the tombstone: reviews, reports,
  -- blocks, banned_phones, legal_acceptances, payments, job_disputes, jobs,
  -- job_offers, bids, messages, conversations, direct_threads, job_locations.
end;
$_$;
revoke all on function public.delete_my_account() from public;
grant all on function public.delete_my_account() to authenticated;

create or replace function public.should_notify(p_recipient uuid, p_actor uuid, p_category text) returns boolean
language plpgsql stable security definer
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
  if not public.is_profile_active(p_recipient) then
    return false;
  end if;
  -- night1 (n3): the always-on category is transactional between two parties already in a contract; a preference or a block never suppresses it. Recipient null / self / inactive still refuse above.
  if p_category = 'jobs' then return true; end if;
  if p_actor is not null then
    if public.is_blocked_between(p_recipient, p_actor) then
      return false;
    end if;
    if not public.is_profile_active(p_actor) then
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
      -- phase75: transactional, deliberately always on.
      when 'jobs'          then true
      else true
    end;
  end if;

  return v_allowed;
end;
$$;
revoke all on function public.should_notify(uuid, uuid, text) from public;
grant all on function public.should_notify(uuid, uuid, text) to authenticated;
comment on function public.should_notify(uuid, uuid, text) is
  'Single server-side gate: ban, block, per-category preference, and having a live device.';

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
revoke all on function public.notify_on_message() from public, anon, authenticated;

create or replace function public.unsend_message(p_message_id uuid) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_sender_id uuid;
  v_created_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- phase73: banned or tombstoned accounts may not blank their messages.
  if not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

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
      unsent_at = now()
  where id = p_message_id;
end;
$$;
revoke all on function public.unsend_message(uuid) from public;
grant all on function public.unsend_message(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. The 41 marker and probe functions only scripts/verify-schema.mjs and tests read (ruling 53).
-- ---------------------------------------------------------------------------
drop function if exists public.account_deletion_enabled();
drop function if exists public.active_work_lifecycle_enabled();
drop function if exists public.bids_projection_enabled();
drop function if exists public.bids_projection_v2_enabled();
drop function if exists public.counter_notification_copy_enabled();
drop function if exists public.counter_notification_enabled();
drop function if exists public.counteroffer_cap_enabled();
drop function if exists public.direct_thread_notifications_enabled();
drop function if exists public.hardening_fixes_enabled();
drop function if exists public.job_categories_expanded();
drop function if exists public.job_offer_rpcs_enabled();
drop function if exists public.job_offers_enabled();
drop function if exists public.legal_acceptance_enabled();
drop function if exists public.marketplace_thread_identity_enabled();
drop function if exists public.messaging_lock_enabled();
drop function if exists public.notification_feed_enabled();
drop function if exists public.offer_scoped_chat_enabled();
drop function if exists public.phase68_deleted_at_authorization_enabled();
drop function if exists public.phase69_execute_lockdown_enabled();
drop function if exists public.phase70_unsend_message_authz_enabled();
drop function if exists public.phase71_reviews_read_lockdown_enabled();
drop function if exists public.phase72_storage_read_lockdown_enabled();
drop function if exists public.phase73_null_safe_guards_enabled();
drop function if exists public.phase75_security_hardening_enabled();
drop function if exists public.phase76_corrections_enabled();
drop function if exists public.phase76_rls_posture();
drop function if exists public.phase77_conversation_features_enabled();
drop function if exists public.phase78_properties_enabled();
drop function if exists public.portfolio_category_freeform_enabled();
drop function if exists public.post_wizard_fields_enabled();
drop function if exists public.push_notifications_enabled();
drop function if exists public.push_scheduler_enabled();
drop function if exists public.review_integrity_enabled();
drop function if exists public.security_definer_search_path_enabled();
drop function if exists public.view_security_invoker_enabled();
drop function if exists public.worker_self_service_enabled();
drop function if exists public.stripe_foundation_enabled();
drop function if exists public.settlement_schedules_enabled();
drop function if exists public.connect_onboarding_enabled();
drop function if exists public.settlement_retry_enabled();
drop function if exists public.job_completions_enabled();

-- ---------------------------------------------------------------------------
-- 11. Voice and document messages: the columns, their two storage buckets' policies, and the
--     conversations view (dropped in section 7) re-created without them, ACL as it was.
-- ---------------------------------------------------------------------------
alter table public.messages
  drop column if exists audio_url,
  drop column if exists audio_duration_ms,
  drop column if exists document_url,
  drop column if exists document_name,
  drop column if exists document_size_bytes;

create view public.conversations with (security_invoker = true) as
 SELECT "m"."job_id",
    NULL::"uuid" AS "direct_thread_id",
    "j"."title" AS "job_title",
    "j"."client_id",
    "j"."assigned_worker_id",
    "m"."id" AS "last_message_id",
    "m"."sender_id" AS "last_message_sender_id",
    "m"."content" AS "last_message_content",
    "m"."image_url" AS "last_message_image_url",
    "m"."unsent_at" AS "last_message_unsent_at",
    "m"."created_at" AS "last_message_at",
    NULL::timestamp with time zone AS "my_read_at"
   FROM (( SELECT DISTINCT ON ("messages"."job_id") "messages"."id",
            "messages"."job_id",
            "messages"."sender_id",
            "messages"."content",
            "messages"."image_url",
            "messages"."created_at",
            "messages"."reply_to_id",
            "messages"."request_event",
            "messages"."request_amount_cents",
            "messages"."unsent_at",
            "messages"."direct_thread_id",
            "messages"."job_offer_id"
           FROM "public"."messages"
          WHERE ("messages"."job_id" IS NOT NULL)
          ORDER BY "messages"."job_id", "messages"."created_at" DESC) "m"
     JOIN "public"."jobs" "j" ON (("j"."id" = "m"."job_id")))
UNION ALL
 SELECT NULL::"uuid" AS "job_id",
    "t"."id" AS "direct_thread_id",
    NULL::"text" AS "job_title",
    "t"."user_a" AS "client_id",
    "t"."user_b" AS "assigned_worker_id",
    "m"."id" AS "last_message_id",
    "m"."sender_id" AS "last_message_sender_id",
    "m"."content" AS "last_message_content",
    "m"."image_url" AS "last_message_image_url",
    "m"."unsent_at" AS "last_message_unsent_at",
    "m"."created_at" AS "last_message_at",
        CASE
            WHEN ("t"."user_a" = "auth"."uid"()) THEN "t"."user_a_read_at"
            ELSE "t"."user_b_read_at"
        END AS "my_read_at"
   FROM (( SELECT DISTINCT ON ("messages"."direct_thread_id") "messages"."id",
            "messages"."job_id",
            "messages"."sender_id",
            "messages"."content",
            "messages"."image_url",
            "messages"."created_at",
            "messages"."reply_to_id",
            "messages"."request_event",
            "messages"."request_amount_cents",
            "messages"."unsent_at",
            "messages"."direct_thread_id",
            "messages"."job_offer_id"
           FROM "public"."messages"
          WHERE ("messages"."direct_thread_id" IS NOT NULL)
          ORDER BY "messages"."direct_thread_id", "messages"."created_at" DESC) "m"
     JOIN "public"."direct_threads" "t" ON (("t"."id" = "m"."direct_thread_id")));
grant all on table public.conversations to anon, authenticated, service_role;

drop policy if exists chat_audio_insert_party on storage.objects;
drop policy if exists chat_audio_read_party on storage.objects;
drop policy if exists chat_documents_insert_party on storage.objects;
drop policy if exists chat_documents_read_party on storage.objects;

-- ---------------------------------------------------------------------------
-- 12. What a fresh stack lacked. (a) Sign-up creates the profile (ruling 44): staging has this
--     trigger by hand (archive phase7/phase13, same name), every other stack had none.
-- ---------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- (b) The push drain's timer (ruling 45), until now only in archive phase74: the other installers'
--     idempotent shape, so a reset without pg_cron skips it with a notice.
create or replace function public.install_push_schedule() returns text
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_stale bigint;
begin
  if not public.pg_function_present('cron', 'schedule') then
    raise notice 'push: pg_cron absent (local stack) — schedule skipped';
    return 'skipped: pg_cron absent';
  end if;

  -- By jobid: cron.unschedule has a (bigint) and a (name) overload.
  for v_stale in select j.jobid from cron.job j where j.jobname = 'brazos-drain-push'
  loop
    perform cron.unschedule(v_stale);
  end loop;

  perform cron.schedule('brazos-drain-push', '* * * * *',
                        $cron$select public.drain_notification_outbox();$cron$);

  return 'scheduled: brazos-drain-push';
end
$fn$;
revoke all on function public.install_push_schedule() from public, anon, authenticated;
grant execute on function public.install_push_schedule() to service_role;
comment on function public.install_push_schedule() is
  'Schedules brazos-drain-push every minute (drain_notification_outbox() wakes send-push) where pg_cron exists, in the other installers'' idempotent shape; skips with a notice on a stack without it.';

select public.install_push_schedule();
