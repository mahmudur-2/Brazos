-- 20261112010800_payments_column_grants.sql — lean B17: a party reads the payment columns the
-- app shows, and no more. Spec: docs/critical/money-safety.md.
--
-- WHAT WAS WRONG. authenticated held SELECT on the whole payments table; RLS limits the ROWS to
-- the payer and the payee, but every column of those rows was readable: the provider's
-- transfer and refund ids, the card-dispute id, last_error (provider text), the attempt
-- counters and, from 20261112010100, the money facts and the settlement clocks.
-- job_payment_state() returned the whole row the same way.
--
-- WHAT CHANGES.
-- 1. SELECT on payments for authenticated becomes a column list: exactly the 26 columns the app
--    reads today and build 10 reads (lib/payments.ts PAYMENT_COLUMNS, the job-list select, and
--    lib/earnings.ts, a subset). tests/moneySafety.test.mjs fails if an app select names a
--    column outside this list. RLS ("parties view own payments") is unchanged.
-- 2. job_payment_state() copied whole from 20261108000000_lean_v1.sql, with the 20 columns
--    outside the list blanked (null) before the row is returned. Same signature, security
--    attributes and ACL (restated).
-- The last file of the run, so every column added before it is covered.
--
-- Not a destructive shape under scripts/staging-scan.sh (a privilege, not an object).

begin;

revoke select on table public.payments from authenticated;
grant select (id, job_id, offer_id, payer_id, payee_id, kind, amount_cents, platform_fee_cents,
              provider, provider_ref, status, authorized_at, held_at, released_at, release_reason,
              paid_out_at, created_at, updated_at, charge_amount_cents, customer_fee_cents, tax_cents,
              funding_due_at, release_requested_at, transfer_cents, refund_cents, refund_reason)
  on table public.payments to authenticated;

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

  -- B17: only the 26 columns a party may read leave this function.
  v_payment.stripe_payment_intent_id := null;
  v_payment.customer_fee_bps := null;
  v_payment.worker_fee_bps := null;
  v_payment.transfer_ref := null;
  v_payment.refund_ref := null;
  v_payment.chargeback_ref := null;
  v_payment.chargeback_at := null;
  v_payment.last_error := null;
  v_payment.transfer_reversed_at := null;
  v_payment.transfer_attempts := null;
  v_payment.refund_attempts := null;
  v_payment.received_cents := null;
  v_payment.refunded_cents := null;
  v_payment.chargeback_cents := null;
  v_payment.transfer_sent_attempt := null;
  v_payment.transfer_sent_at := null;
  v_payment.transfer_stopped_at := null;
  v_payment.refund_sent_attempt := null;
  v_payment.refund_sent_at := null;
  v_payment.refund_stopped_at := null;
  return v_payment;
end;
$$;
revoke all on function public.job_payment_state(uuid) from public, anon;
grant all on function public.job_payment_state(uuid) to authenticated;
comment on function public.job_payment_state(uuid) is
  'The job''s active job_payment row for its two parties, read-only; its 72h clock is auto_release_due_payments(). NULL when checkout never ran. B17 (20261112010800): the columns authenticated may not select are returned null.';

commit;
