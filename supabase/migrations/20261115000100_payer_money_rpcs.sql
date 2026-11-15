-- 20261115000100_payer_money_rpcs.sql — pack 1, A4 and A2 (the deadline).
--
-- WHAT WAS WRONG.
--   A4: B17 (20261112010800) made job_payment_state return the 20 server columns empty, but
--       begin_job_payment, begin_tip_payment and release_job_payment still returned the whole row
--       to the caller: fee rates, the intent id, attempt counters, last_error.
--   A2: begin_job_payment and begin_tip_payment resumed an unfunded row whose funding_due_at had
--       passed (the sweeper had not run yet), so a checkout could be started on a closed window.
--       begin_job_payment's comment said "the sweeper cancels it at the provider"; nothing does.
--
-- WHAT CHANGES.
-- 1. payment_for_party(payments): the row with the 20 server columns set to null. One list, in
--    one place; no client grant (the four definer functions below call it as their owner).
-- 2. job_payment_state: its 20 assignments become a call to payment_for_party.
-- 3. begin_job_payment, begin_tip_payment, release_job_payment: every return goes through it.
-- 4. A2: an unfunded row past funding_due_at is voided ('funding window expired') and a new row is
--    born, as after expire_unfunded_payments. The false comment line is corrected.
-- Bodies verbatim from 20261112010800_payments_column_grants.sql, 20260905000000_stripe_foundation.sql,
-- 20261112010000_fee_math_numeric.sql and 20261108000000_lean_v1.sql otherwise; signatures,
-- security, search_path and ACLs as they were.
--
-- Additive under scripts/staging-scan.sh. Proof: supabase/tests/430_payment_party_shape.sql.

begin;

create or replace function public.payment_for_party(p public.payments)
returns public.payments
language plpgsql immutable
set search_path = public, pg_temp
as $fn$
declare
  v public.payments := p;
begin
  v.stripe_payment_intent_id := null;
  v.customer_fee_bps := null;
  v.worker_fee_bps := null;
  v.transfer_ref := null;
  v.refund_ref := null;
  v.chargeback_ref := null;
  v.chargeback_at := null;
  v.last_error := null;
  v.transfer_reversed_at := null;
  v.transfer_attempts := null;
  v.refund_attempts := null;
  v.received_cents := null;
  v.refunded_cents := null;
  v.chargeback_cents := null;
  v.transfer_sent_attempt := null;
  v.transfer_sent_at := null;
  v.transfer_stopped_at := null;
  v.refund_sent_attempt := null;
  v.refund_sent_at := null;
  v.refund_stopped_at := null;
  return v;
end $fn$;
revoke all on function public.payment_for_party(public.payments) from public, anon, authenticated, service_role;
comment on function public.payment_for_party(public.payments) is
  'B17, A4: the payments row with the 20 columns a party may not read set to null; the 26 the app reads are untouched. Every payer RPC that returns a payments row returns it through this function. No client grant.';

create or replace function public.job_payment_state(p_job_id uuid) returns public.payments
language plpgsql security definer set search_path = public, pg_temp as $fn$
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

  -- B17: only the 26 columns a party may read leave this function.
  return public.payment_for_party(v_payment);
end;
$fn$;
revoke all on function public.job_payment_state(uuid) from public, anon, service_role;
grant execute on function public.job_payment_state(uuid) to authenticated;

create or replace function public.begin_job_payment(p_job_id uuid) returns public.payments
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_actor    uuid := auth.uid();
  v_job      public.jobs;
  v_payment  public.payments;
  v_amount   integer;
  v_t        record;
  v_reuse    boolean := false;
begin
  if v_actor is null or not public.is_active_user() then raise exception 'Active authentication required'; end if;

  -- DIVERGENCE (D12): the kill switch is the paymentsEnabled key. Absent =
  -- enabled; only the jsonb boolean true enables — anything else pauses.
  if not coalesce((select c.value = 'true'::jsonb from public.app_config c where c.key = 'paymentsEnabled'), true) then
    raise exception 'Payments are paused right now. Please try again shortly.';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then raise exception 'Job not found'; end if;

  -- Only 'assigned'. Accepting in_progress or completed here would say the
  -- protection is optional; D8 makes 'held' the gate to in_progress.
  if v_job.assigned_worker_id is null or v_job.status <> 'assigned' then
    raise exception 'Accept an offer before protecting a payment';
  end if;

  v_amount := coalesce(v_job.final_amount_cents, v_job.budget_cents);
  if v_amount is null or v_amount <= 0 then raise exception 'This job has no agreed amount'; end if;
  -- The terms the customer was quoted at acceptance, when a snapshot exists.
  select * into v_t from public.job_terms(p_job_id, v_amount);

  select * into v_payment from public.payments
   where job_id = p_job_id and kind = 'job_payment' and status not in ('failed', 'voided')
   for update;

  if found then
    if v_payment.status <> 'unfunded' then raise exception 'This job already has a protected payment'; end if;

    if v_payment.funding_due_at is not null and v_payment.funding_due_at < now() then
      -- A2: the window closed before the sweeper ran. Never resumed: void it, then fall through.
      update public.payments
        set status = 'voided', last_error = 'funding window expired', updated_at = now()
      where id = v_payment.id;
    elsif v_payment.amount_cents = v_amount then
      v_reuse := true;                       -- plain resume: same money, same intent
    elsif v_payment.provider_ref is null then
      update public.payments set                                  -- nothing exists at the provider yet
        amount_cents = v_amount,
        customer_fee_cents = v_t.customer_fee_cents,
        platform_fee_cents = v_t.worker_fee_cents,
        tax_cents = v_t.tax_cents,
        customer_fee_bps = v_t.customer_fee_bps, worker_fee_bps = v_t.worker_fee_bps,
        funding_due_at = now() + interval '24 hours', updated_at = now()
      where id = v_payment.id returning * into v_payment;
      v_reuse := true;
    else
      -- A PaymentIntent exists at a stale amount and nothing has been charged.
      -- Abandon it. Then fall through.
      update public.payments
        set status = 'voided', last_error = 'agreed amount changed before funding', updated_at = now()
      where id = v_payment.id;
    end if;

    if v_reuse then
      if v_payment.funding_due_at is null then
        update public.payments set funding_due_at = now() + interval '24 hours', updated_at = now()
        where id = v_payment.id returning * into v_payment;
      end if;
      return public.payment_for_party(v_payment);
    end if;
  end if;

  insert into public.payments (job_id, offer_id, payer_id, payee_id, kind, amount_cents,
                               customer_fee_cents, platform_fee_cents, tax_cents,
                               customer_fee_bps, worker_fee_bps, provider, status, funding_due_at)
  values (p_job_id, v_job.accepted_offer_id, v_actor, v_job.assigned_worker_id, 'job_payment', v_amount,
          v_t.customer_fee_cents, v_t.worker_fee_cents, v_t.tax_cents,
          v_t.customer_fee_bps, v_t.worker_fee_bps, 'stripe', 'unfunded', now() + interval '24 hours')
  returning * into v_payment;
  return public.payment_for_party(v_payment);
end $fn$;
revoke all on function public.begin_job_payment(uuid) from public, anon, service_role;
grant execute on function public.begin_job_payment(uuid) to authenticated;
comment on function public.begin_job_payment(uuid) is
  'The customer starts protecting an assigned job''s payment: the stripe ledger row is born unfunded with BOTH fee sides and tax frozen from the agreement snapshot (or current_fee()). Idempotent on an existing unfunded row inside its funding window; past funding_due_at that row is voided (funding window expired) and a new one is born (A2). Returns the row through payment_for_party (A4).';

create or replace function public.begin_tip_payment(p_job_id uuid, p_amount_cents integer) returns public.payments
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_main public.payments;
  v_tip public.payments;
  v_fee record;
  v_cfee integer;
  v_tax integer;
begin
  if v_actor is null or not public.is_active_user() then raise exception 'Active authentication required'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Enter a tip amount greater than zero'; end if;
  if not coalesce((select c.value = 'true'::jsonb from public.app_config c where c.key = 'paymentsEnabled'), true) then
    raise exception 'Payments are paused right now. Please try again shortly.';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then raise exception 'Job not found'; end if;
  if v_job.status <> 'completed' or v_job.assigned_worker_id is null then raise exception 'Tips are for completed jobs'; end if;

  select * into v_main from public.payments
   where job_id = p_job_id and kind = 'job_payment' and status not in ('failed', 'voided') for update;
  if not found or v_main.status not in ('released', 'paid_out') then
    raise exception 'The job payment releases first — then a tip can be added';
  end if;

  select * into v_fee from public.current_fee();
  -- B5: numeric products, so an amount far over the ceiling reaches the ceiling's sentence.
  v_cfee := round(p_amount_cents::numeric * v_fee.tip_customer_bps / 10000)::integer;
  v_tax := round((p_amount_cents::numeric + v_cfee) * v_fee.tax_bps / 10000)::integer;

  select * into v_tip from public.payments
   where job_id = p_job_id and kind = 'tip' and status not in ('failed', 'voided') for update;
  if found then
    if v_tip.status <> 'unfunded' then raise exception 'A tip was already added to this job'; end if;
    if v_tip.amount_cents = p_amount_cents and not coalesce(v_tip.funding_due_at < now(), false) then return public.payment_for_party(v_tip); end if;
    -- B1: no in-place rewrite of the amount, with or without an intent
    -- attached. The row keeps the amount it was minted with; a different
    -- amount gets a new row through the insert below (and its ceiling).
    update public.payments
       set status = 'voided', last_error = case when v_tip.funding_due_at < now() then 'funding window expired' else 'tip amount changed before funding' end, updated_at = now()
     where id = v_tip.id;
  end if;

  insert into public.payments (job_id, offer_id, payer_id, payee_id, kind, amount_cents,
                               platform_fee_cents, customer_fee_cents, customer_fee_bps, tax_cents,
                               provider, status, funding_due_at)
  values (v_job.id, v_job.accepted_offer_id, v_actor, v_job.assigned_worker_id, 'tip', p_amount_cents,
          0, v_cfee, v_fee.tip_customer_bps, v_tax,
          'stripe', 'unfunded', now() + interval '24 hours')
  returning * into v_tip;
  return public.payment_for_party(v_tip);
end $fn$;
revoke all on function public.begin_tip_payment(uuid, integer) from public, anon, service_role;
grant execute on function public.begin_tip_payment(uuid, integer) to authenticated;

create or replace function public.release_job_payment(p_job_id uuid) returns public.payments
language plpgsql security definer set search_path = public, pg_temp as $fn$
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
  if v_payment.status in ('released', 'paid_out') or v_payment.release_requested_at is not null then return public.payment_for_party(v_payment); end if;
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
  return public.payment_for_party(v_payment);
end $fn$;
revoke all on function public.release_job_payment(uuid) from public, anon, service_role;
grant execute on function public.release_job_payment(uuid) to authenticated;

commit;
