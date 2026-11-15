-- 20261115000000_transfer_in_flight.sql — pack 1, A1: money on its way to the worker is never held
-- back or refunded on top.
--
-- WHAT WAS WRONG. settlement_send_begin records that the drain is about to send a transfer
-- (transfer_sent_attempt = transfer_attempts) before the provider answers. When the answer is lost,
-- the row keeps transfer_ref null and still reads as "approved, not yet transferred". Then:
--   * open_job_dispute opened a dispute that promised to hold money that may already be with the
--     worker (it refused only status released / paid_out);
--   * resolve_job_dispute (customer) and resolve_tip (refund) queued a full refund on top of it, and
--     refunds_due would send it: the charge refunded and the transfer paid.
--
-- WHAT CHANGES.
-- 1. payment_transfer_unconfirmed(payments): the current transfer attempt began and nothing about
--    it is recorded: no transfer_ref, no reversal. A STOPPED attempt still counts: the only transfer
--    stop is a 400 idempotency_error (process-settlements/classify.mjs:159-162), which follows a first
--    use of the key that may have created the transfer. It ends only by record_settlement_sent (the
--    transfer exists) or settlement_send_reopen (it does not: a new attempt number).
-- 2. open_job_dispute, resolve_job_dispute and resolve_tip refuse while it holds. Bodies verbatim
--    from 20260901000000_baseline.sql, 20261108000000_lean_v1.sql and 20261112010500_resolve_tip.sql;
--    each gains one check. Signatures, security, search_path and ACLs as they were.
-- 3. refunds_due reserves the same amount: 20261115000200_work_start_money_rule.sql.
--
-- Additive under scripts/staging-scan.sh. Proof: supabase/tests/420_transfer_in_flight.sql.

begin;

create or replace function public.payment_transfer_unconfirmed(p public.payments)
returns boolean
language sql immutable
set search_path = public, pg_temp
as $fn$
  select coalesce(p.transfer_sent_attempt = p.transfer_attempts
                  and p.transfer_ref is null and p.transfer_reversed_at is null, false)
$fn$;
revoke all on function public.payment_transfer_unconfirmed(public.payments) from public, anon, authenticated;
grant execute on function public.payment_transfer_unconfirmed(public.payments) to service_role;
comment on function public.payment_transfer_unconfirmed(public.payments) is
  'A1: true when the current transfer attempt was begun (settlement_send_begin) and neither a transfer nor a reversal is recorded: the money may already be with the worker. Stopped attempts count. Ends with record_settlement_sent or settlement_send_reopen. Read by open_job_dispute, resolve_job_dispute, resolve_tip and refunds_due.';

create or replace function public.open_job_dispute(p_job_id uuid, p_reason text, p_details text default null)
returns public.job_disputes
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_payment public.payments;
  v_dispute public.job_disputes;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if p_reason is null or p_reason not in
     ('not_as_described', 'incomplete', 'damage', 'no_show', 'other') then
    raise exception 'Unknown issue reason';
  end if;
  if p_details is not null and length(p_details) > 2000 then
    raise exception 'Issue details are limited to 2000 characters';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then
    raise exception 'Job not found';
  end if;
  if v_job.status <> 'completed' then
    raise exception 'An issue can be reported once the work is submitted as complete';
  end if;

  -- Idempotent-ish: an already-open report is returned rather than doubled.
  select * into v_dispute
  from public.job_disputes
  where job_id = p_job_id and status = 'open';
  if found then
    return v_dispute;
  end if;

  -- The freeze only means something while the money is still holdable.
  select * into v_payment
  from public.payments
  where job_id = p_job_id and kind = 'job_payment'
    and status not in ('failed', 'voided')
  for update;
  if found and v_payment.status in ('released', 'paid_out') then
    raise exception 'This payment was already released and can no longer be held';
  end if;
  if found and public.payment_transfer_unconfirmed(v_payment) then
    raise exception 'This payment is already on its way to the worker and can no longer be held';
  end if;

  insert into public.job_disputes (job_id, payment_id, opened_by, reason, details)
  values (p_job_id, v_payment.id, v_actor, p_reason::public.dispute_reason, p_details)
  returning * into v_dispute;

  return v_dispute;
exception
  when unique_violation then
    select * into v_dispute
    from public.job_disputes
    where job_id = p_job_id and status = 'open';
    return v_dispute;
end;
$fn$;
revoke all on function public.open_job_dispute(uuid, text, text) from public, anon, service_role;
grant execute on function public.open_job_dispute(uuid, text, text) to authenticated;

create or replace function public.resolve_job_dispute(p_job_id uuid, p_in_favour_of text, p_note text default null) returns public.payments
language plpgsql security definer set search_path = public, pg_temp as $fn$
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
  if public.payment_transfer_unconfirmed(v_payment) then
    raise exception 'A transfer to the worker was sent and its result is not recorded yet: record it or reopen it first.';
  end if;

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
end $fn$;
revoke all on function public.resolve_job_dispute(uuid, text, text) from public, anon, authenticated;
grant execute on function public.resolve_job_dispute(uuid, text, text) to service_role;

create or replace function public.resolve_tip(p_payment_id uuid, p_outcome text)
returns public.payments
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_tip public.payments;
begin
  if p_outcome is null or p_outcome not in ('send', 'refund') then
    raise exception 'Unknown outcome: send or refund';
  end if;
  select * into v_tip from public.payments where id = p_payment_id for update;
  if not found or v_tip.kind <> 'tip' or v_tip.provider <> 'stripe' then raise exception 'Tip not found'; end if;
  if v_tip.status <> 'held' then raise exception 'This tip is not held (%)', v_tip.status; end if;
  if v_tip.chargeback_at is not null then raise exception 'This tip is under a card dispute'; end if;
  if v_tip.transfer_ref is not null
     or exists (select 1 from public.payment_transfers t
                 where t.payment_id = p_payment_id and t.reversed_cents < t.amount_cents) then
    raise exception 'This tip has a transfer that was not reversed';
  end if;
  if public.payment_transfer_unconfirmed(v_tip) then
    raise exception 'A transfer to the worker was sent and its result is not recorded yet: record it or reopen it first.';
  end if;
  if coalesce(v_tip.received_cents, v_tip.charge_amount_cents) <> v_tip.charge_amount_cents then
    raise exception 'This tip was charged a different amount; settle it by hand in Stripe';
  end if;
  if coalesce(v_tip.refund_cents, 0) > 0 then raise exception 'A refund is already queued for this tip'; end if;

  if p_outcome = 'send' then
    if v_tip.transfer_reversed_at is null then raise exception 'Only a reversed tip can be sent again'; end if;
    update public.payments set
      transfer_reversed_at = null,
      transfer_attempts    = transfer_attempts + 1,
      release_requested_at = coalesce(release_requested_at, now()),
      transfer_cents       = amount_cents - platform_fee_cents,
      updated_at           = now()
    where id = p_payment_id
    returning * into v_tip;
  else
    update public.payments set
      refund_cents   = charge_amount_cents,
      refund_reason  = 'dispute_refund',
      transfer_cents = 0,
      updated_at     = now()
    where id = p_payment_id
    returning * into v_tip;
  end if;
  return v_tip;
end $fn$;
revoke all on function public.resolve_tip(uuid, text) from public, anon, authenticated;
grant execute on function public.resolve_tip(uuid, text) to service_role;

commit;
