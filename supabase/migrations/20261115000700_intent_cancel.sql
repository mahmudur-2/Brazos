-- 20261115000700_intent_cancel.sql — pack 1, F2 (ii): the provider's PaymentIntent of a voided row
-- is cancelled. Proof: supabase/tests/450_intent_cancel_queue.sql, tests/intentCancel.test.mjs.
--
-- WHAT WAS WRONG. A row voided before it was paid (a cancelled job, an expired funding window, a
-- changed amount, the sweeper) kept its PaymentIntent open at the provider. The app still held the
-- intent's client secret, so the customer could still pay a row that no longer existed; the charge
-- then came back as a full refund (funded_after_void). Nothing cancelled the intent.
--
-- WHAT CHANGES (additive).
-- 1. payments.intent_cancel_at: when process-settlements got a final answer to its cancel;
--    payments.intent_cancel_tried_at: when it last tried. Server only: no column grant, and
--    payment_for_party empties both.
-- 2. intents_to_cancel: the stripe rows voided with an intent, never held, nothing received, nothing
--    to refund, not yet answered; the rows never tried first, then the oldest try (R3-A6: a row that
--    keeps failing goes to the back, so it cannot hold the rows behind it out of a run's limit).
--    service_role only.
-- 3. record_intent_cancel(uuid, boolean): the drain records every answer. p_final true (any 2xx, or
--    a 4xx about the intent itself) stamps intent_cancel_at; false (a 5xx, a 429, a 409, a throw)
--    stamps only the try, and the next run tries again. Moves no money.
-- 4. payment_for_party, replaced from 20261115000100_payer_money_rpcs.sql: also empties
--    intent_cancel_at and intent_cancel_tried_at. Same attributes and ACL (restated).
-- 5. refunds_due, restated unchanged so its p.* takes in this file's column and 20261115000600's.
--
-- Additive under scripts/staging-scan.sh.

begin;

alter table public.payments add column if not exists intent_cancel_at timestamptz;
comment on column public.payments.intent_cancel_at is
  'Server only: when process-settlements got a final answer (a 2xx, or a 4xx about the intent) to its cancel of this voided row''s PaymentIntent (record_intent_cancel). Null = not asked yet, or asked without a final answer.';
alter table public.payments add column if not exists intent_cancel_tried_at timestamptz;
comment on column public.payments.intent_cancel_tried_at is
  'Server only: when process-settlements last tried to cancel this voided row''s PaymentIntent, final answer or not (record_intent_cancel). intents_to_cancel puts the rows never tried first, then the oldest try.';

create or replace view public.intents_to_cancel as
  select p.id, p.provider_ref
    from public.payments p
   where p.provider = 'stripe'
     and p.status = 'voided'
     and p.provider_ref is not null
     -- Never held, nothing received, nothing to refund: the intent never took money.
     and p.held_at is null
     and p.received_cents is null
     and coalesce(p.refund_cents, 0) = 0
     and p.intent_cancel_at is null
   -- R3-A6: never tried first, then the oldest try: a row that keeps failing goes to the back.
   order by p.intent_cancel_tried_at nulls first, p.created_at;
revoke all on table public.intents_to_cancel from public, anon, authenticated;
grant select on table public.intents_to_cancel to service_role;
comment on view public.intents_to_cancel is
  'stripe rows voided with a PaymentIntent that was never held, received nothing and has nothing to refund, whose cancel has no final answer yet; the rows never tried first, then the oldest try (intent_cancel_tried_at), then the oldest row. process-settlements cancels each intent (POST /v1/payment_intents/<id>/cancel) and records every answer through record_intent_cancel. service_role only.';

create or replace function public.record_intent_cancel(p_payment_id uuid, p_final boolean default true)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  update public.payments
     set intent_cancel_at       = case when p_final then now() else intent_cancel_at end,
         intent_cancel_tried_at = now()
   where id = p_payment_id and provider = 'stripe' and status = 'voided' and intent_cancel_at is null;
  return found;
end $fn$;
revoke all on function public.record_intent_cancel(uuid, boolean) from public, anon, authenticated;
grant execute on function public.record_intent_cancel(uuid, boolean) to service_role;
comment on function public.record_intent_cancel(uuid, boolean) is
  'service_role only: process-settlements answered its cancel of this voided row''s PaymentIntent. Every call stamps intent_cancel_tried_at (the row goes to the back of intents_to_cancel); p_final true (a final answer: any 2xx, or a 4xx about the intent) also stamps intent_cancel_at, once. True when the row was stamped, false when it is not a voided stripe row or already has its final answer. Moves no money.';

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
  v.intent_cancel_at := null;
  v.intent_cancel_tried_at := null;
  return v;
end $fn$;
revoke all on function public.payment_for_party(public.payments) from public, anon, authenticated, service_role;
comment on function public.payment_for_party(public.payments) is
  'B17, A4: the payments row with the 22 columns a party may not read set to null; the 28 the parties read (the 26 of 20261112010800''s column grant, and refund_failed_at and refund_arranged_at, 20261115000600) are untouched. Every payer RPC that returns a payments row returns it through this function. No client grant.';

-- 5. refunds_due, replaced from 20261115000200_work_start_money_rule.sql only so that p.* takes in
--    refund_failed_at, refund_arranged_at, intent_cancel_at and intent_cancel_tried_at: its column list stays payments'
--    own (supabase/tests/
--    070_settlement_retry.sql §6). Every clause, the order, the ACL and the comment as they were.
create or replace view public.refunds_due as
  select p.*
    from public.payments p
   where p.provider = 'stripe'
     and coalesce(p.refund_cents, 0) > 0
     and p.refund_ref is null
     -- DIVERGENCE (safety): a row already refunded without a recorded ref
     -- (a hand refund in the dashboard) is not refunded twice.
     -- B16: allow-list of the states a refund is sent from.
     and p.status in ('held', 'released', 'paid_out', 'voided', 'failed')
     -- B16: nothing refunded yet (a partial refund already landed needs a person).
     and coalesce(p.refunded_cents, 0) = 0
     -- B13, B17 (A6): no card dispute holds the money, and the charge collected what the row says.
     and public.payment_money_clear(p)
     -- B18: never more than is left after what went to the worker.
     and p.refund_cents <= p.charge_amount_cents
           - (select coalesce(sum(t.amount_cents - t.reversed_cents), 0)::integer
                from public.payment_transfers t where t.payment_id = p.id)
           -- A1: and after a transfer whose send began and whose result is not recorded.
           - (case when public.payment_transfer_unconfirmed(p) then coalesce(p.transfer_cents, 0) else 0 end)
     -- B16: the current attempt is neither stopped nor past its 23 hours.
     and not public.settlement_attempt_closed(p.refund_attempts, p.refund_sent_attempt, p.refund_sent_at, p.refund_stopped_at)
   order by p.updated_at;
revoke all on table public.refunds_due from public, anon, authenticated;
grant select on table public.refunds_due to service_role;
comment on view public.refunds_due is
  'stripe rows whose refund to the customer may be sent: refund_cents > 0 and no refund recorded yet; and (20261112010300) in an allow-listed state, nothing refunded yet, no card dispute, charged the row''s amount, refund_cents within what is left after live transfers (and, 20261115000200, after a transfer whose send began and whose result is not recorded), and the current attempt neither stopped nor past 23 hours. process-settlements refunds refund_cents against the charge with idempotency key rf:<id>:<refund_attempts>. Every row asked for and not here is in payment_attention.';

commit;
