-- 20261112010900_dispute_notice.sql — lean B24, B8 follow-up: a notice never says "refunded in
-- full" while a card dispute holds the refund. Spec: docs/critical/money-safety.md.
--
-- WHAT WAS WRONG. close_no_show_hires (B24) and cancel_job's worker_cancelled branch queue the
-- whole charge for refund and tell the customer "your payment is being refunded in full". Under a
-- card dispute refunds_due holds that refund (chargeback_at is set, 20261112010300), so the
-- sentence was untrue until the bank decided.
--
-- WHAT CHANGES.
-- 1. payment_refund_held_by_dispute(payment): chargeback_at is set on the payment, the same
--    clause refunds_due and transfers_due block on. Server helper, no grant.
-- 2. close_no_show_hires(timestamptz): 20261111100400's body; only the customer's notice body
--    changes, and only while that clause holds. The worker's notice is unchanged.
-- 3. cancel_job(uuid, text): 20261111100100's body; only the worker_cancelled notice to the
--    customer changes, and only while that clause holds.
-- Every other line, the signatures, the security attributes and the ACLs are unchanged (restated).
-- No schedule changes here.
--
-- Additive under scripts/staging-scan.sh. Proof: supabase/tests/370_money_conservation.sql §N.

begin;

-- ---------------------------------------------------------------------------
-- 1. The block, for the notices.
-- ---------------------------------------------------------------------------
create or replace function public.payment_refund_held_by_dispute(p_payment_id uuid)
returns boolean
language sql stable
set search_path = public, pg_temp
as $fn$
  select coalesce((select p.chargeback_at is not null from public.payments p where p.id = p_payment_id), false)
$fn$;
revoke all on function public.payment_refund_held_by_dispute(uuid) from public, anon, authenticated;
comment on function public.payment_refund_held_by_dispute(uuid) is
  'B24/B8: true while a card dispute holds this payment''s money (chargeback_at set), the clause refunds_due and transfers_due block on (20261112010300): a queued refund is not sent until the bank decides. Read by close_no_show_hires and cancel_job to choose the customer''s notice. Server helper; no grant.';

-- ---------------------------------------------------------------------------
-- 2. The hourly no-show close.
-- ---------------------------------------------------------------------------
create or replace function public.close_no_show_hires(p_now timestamptz default null)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_now     timestamptz := coalesce(p_now, now());
  v_job     public.jobs;
  v_payment public.payments;
  v_done    integer := 0;
begin
  for v_job in
    select j.* from public.jobs j
     where j.status = 'assigned' and j.arrived_at is null and j.scheduled_date is not null
       and public.worker_missed_window(j, v_now - interval '24 hours')
     for update of j skip locked
  loop
    select * into v_payment from public.payments
     where job_id = v_job.id and kind = 'job_payment' and status = 'held'
     for update;
    continue when not found;

    perform public.queue_free_cancel_refund(v_payment.id);

    update public.jobs
       set status = 'cancelled'::public.job_status,
           cancelled_at = now(),
           cancelled_by = null,
           cancel_reason = 'worker_no_show'
     where id = v_job.id;

    perform public.enqueue_notification(
      v_job.client_id, null, 'jobs', 'job_cancelled',
      'Your job was closed',
      case when public.payment_refund_held_by_dispute(v_payment.id)
           then left(v_job.title, 60) || ': the worker did not arrive, so the job was closed. Your bank is reviewing this payment. Your money comes back when the bank decides.'
           else left(v_job.title, 60) || ': the worker did not arrive, so your payment is being refunded in full.'
      end,
      jsonb_build_object('screen', 'ClientJobDetail', 'jobId', v_job.id::text),
      'job_closed:' || v_job.id::text || ':' || v_job.client_id::text
    );
    perform public.enqueue_notification(
      v_job.assigned_worker_id, null, 'jobs', 'job_cancelled',
      'A job was closed',
      left(v_job.title, 60) || ': you did not mark that you arrived, so the customer is refunded in full.',
      jsonb_build_object('screen', 'WorkerJob', 'jobId', v_job.id::text),
      'job_closed:' || v_job.id::text || ':' || v_job.assigned_worker_id::text
    );

    v_done := v_done + 1;
  end loop;
  return v_done;
end
$fn$;
revoke all on function public.close_no_show_hires(timestamptz) from public, anon, authenticated;
grant execute on function public.close_no_show_hires(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 3. cancel_job.
-- ---------------------------------------------------------------------------
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
  v_reason      text := p_reason;
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
    v_window_end := public.job_window_end(v_job.scheduled_date, v_job.arrival_end_hour);
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
      -- when there is no scheduled_date, or within 15 minutes of acceptance
      -- (snapshot only), or (B8) when the worker missed the window, or more
      -- than 24h before the anchor.
      select * into v_terms from public.job_terms(p_job_id, v_payment.amount_cents);
      if v_job.status = 'in_progress' then
        v_free := false;
      elsif v_job.scheduled_date is null then
        v_free := true;
      elsif v_terms.accepted_at is not null and v_now - v_terms.accepted_at <= interval '15 minutes' then
        v_free := true;
      elsif public.worker_missed_window(v_job, v_now) then
        -- B8: never marked arrived, and the window plus the reported delay is over: no fee.
        v_free := true;
        v_reason := 'worker_no_show';
      else
        v_anchor := (v_job.scheduled_date::timestamp + make_interval(hours => coalesce(v_job.arrival_start_hour, 0)::int))
                    at time zone 'America/New_York';
        v_free := v_now < v_anchor - interval '24 hours';
      end if;

      if v_free then
        perform public.queue_free_cancel_refund(v_payment.id);
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
         cancel_reason = v_reason
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
          case when public.payment_refund_held_by_dispute(v_payment.id)
               then 'The worker cancelled this job. Your bank is reviewing this payment. Your money comes back when the bank decides.'
               else 'The worker cancelled this job. Your payment is being refunded in full.'
          end,
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

commit;
