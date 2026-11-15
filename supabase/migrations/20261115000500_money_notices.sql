-- 20261115000500_money_notices.sql — pack 1, A12: the customer's notice when the worker cancels.
--
-- WHAT WAS WRONG. cancel_job's worker_cancelled notice told the customer "Your payment is being
-- refunded in full." also when nothing was paid: no payment row, or a checkout started and not
-- finished (the row is voided, nothing is refunded). A charge that still lands on that voided row is
-- refunded in full by apply_payment_event's funded_after_void path (20261112010200).
--
-- WHAT CHANGES. cancel_job(uuid, text): 20261112010900_dispute_notice.sql's body; only the
-- worker_cancelled notice to the customer gains one arm, for a job with no payment row or an
-- unfunded (or legacy authorized) one. The card-dispute arm still comes first. Every other line, the
-- signature, the security attributes and the ACL are unchanged (restated).
--
-- Additive under scripts/staging-scan.sh. Proof: supabase/tests/445_money_notices.sql.

begin;

create or replace function public.cancel_job(p_job_id uuid, p_reason text) returns public.jobs
language plpgsql security definer set search_path = public, pg_temp as $fn$
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
               when v_payment.id is null or v_payment.status in ('unfunded', 'authorized')
               then 'The worker cancelled this job. It was not paid for yet. If a charge still comes through, it is refunded in full.'
               else 'The worker cancelled this job. Your payment is being refunded in full.'
          end,
          jsonb_build_object('screen', 'ClientJobDetail', 'jobId', p_job_id::text),
          'job_cancelled:' || p_job_id::text
        );
      end if;
    end if;
  end if;

  return v_job;
end $fn$;
revoke all on function public.cancel_job(uuid, text) from public, anon, service_role;
grant execute on function public.cancel_job(uuid, text) to authenticated;

commit;
