-- 20261111100100_worker_no_show.sql — ledger B8: a worker who never came earns no cancellation fee.
-- Spec: docs/critical/job-lifecycle.md, B8.
--
-- WHAT WAS WRONG. cancel_job()'s customer_cancelled branch on a held payment asked only when the
-- customer cancelled (in progress, no date, the 15-minute grace, 24 hours before the window). It
-- never asked whether the worker came, so a customer whose worker never arrived paid the fee.
--
-- WHAT CHANGES.
-- 1. worker_missed_window(job, at): assigned, never marked arrived, dated, and `at` is past the
--    window end (job_window_end) plus the worker's own reported delay (late_minutes, 10, 20 or 30).
--    The line "Customer wasn't there" uses, mirrored; one home for cancel_job and the B24 sweep.
-- 2. queue_free_cancel_refund(payment): the free cancel's money: refund_cents = the whole charge,
--    transfer_cents = 0, refund_reason customer_cancelled_free. One home for cancel_job and the
--    B24 sweep (20261111100400), so both refund the same way.
-- 3. cancel_job() replaced whole (lean_v1's body, the newest), three changes only:
--    a. customer_cancelled on a held payment gains one free case, after the grace and before the
--       window rule: worker_missed_window(job, now). The job then records cancel_reason
--       'worker_no_show'; the client still sends customer_cancelled and the server decides.
--    b. the free branch calls queue_free_cancel_refund() (the same update it made inline).
--    c. the no-show gate reads job_window_end() instead of the inline formula (same value).
--    Unchanged: the reason allow-list, every refusal, the fee rule, the notices, the ACL.
--
-- Additive under scripts/staging-scan.sh. Reversible by one corrective migration restoring
-- lean_v1's body.

begin;

create or replace function public.worker_missed_window(p_job public.jobs, p_at timestamptz)
returns boolean
language sql stable
set search_path = public, pg_temp
as $fn$
  select p_job.status = 'assigned'
     and p_job.arrived_at is null
     and p_job.scheduled_date is not null
     and p_at > public.job_window_end(p_job.scheduled_date, p_job.arrival_end_hour)
                + make_interval(mins => coalesce(p_job.late_minutes, 0)::int)
$fn$;
revoke all on function public.worker_missed_window(public.jobs, timestamptz) from public, anon, authenticated;
comment on function public.worker_missed_window(public.jobs, timestamptz) is
  'B8: true when the job is assigned, the worker never marked arrived, it has a date, and p_at is past the arrival window end plus the worker''s reported delay. cancel_job reads it at now(); the hourly sweep reads it 24 hours back. Server helper; no client grant.';

create or replace function public.queue_free_cancel_refund(p_payment_id uuid)
returns void
language sql
set search_path = public, pg_temp
as $fn$
  update public.payments
     set refund_cents = charge_amount_cents, transfer_cents = 0, refund_reason = 'customer_cancelled_free',
         updated_at = now()
   where id = p_payment_id
$fn$;
revoke all on function public.queue_free_cancel_refund(uuid) from public, anon, authenticated;
comment on function public.queue_free_cancel_refund(uuid) is
  'The free cancel''s money on a held job payment: the whole charge refunded, nothing transferred, refund_reason customer_cancelled_free. The row stays held until charge.refunded. Called by cancel_job and close_no_show_hires only; no client grant.';

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
comment on function public.cancel_job(uuid, text) is
  'The lifecycle exit. p_reason: customer_cancelled (the customer; free outside the window, within the 15-minute grace, or when the worker missed the window and never marked arrived, recorded as worker_no_show; otherwise the cancellation fee to the worker), worker_cancelled (the worker; full refund), customer_no_show (the worker, after arriving, once the window passed; a claim resolve_job_dispute decides). Terminal.';

commit;
