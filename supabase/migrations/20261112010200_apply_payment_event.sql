-- 20261112010200_apply_payment_event.sql — lean B13, B16, B17 (amount check), B18, B22: the
-- webhook records the provider's facts. Spec: docs/critical/money-safety.md.
--
-- apply_payment_event(text) is replaced whole, copied from its newest definition
-- (20261111000000_tip_settlement.sql §1). Same signature, security attributes and ACL
-- (restated). Every change is marked in the body with its ledger id:
--
--   B17  payment_intent.succeeded records received_cents (amount_received) on every row, and a
--        job payment charged a different amount than its row stays held with last_error; the
--        queues (20261112010300) never send money for such a row.
--   B16  transfer.created and transfer.reversed go through payment_record_transfer and
--        payment_record_reversal (20261112010100): each transfer is recorded once with its
--        amount; a late transfer.created cannot un-park a reversed row; a partial reversal
--        does not park a row that still has money with the worker.
--   B16  charge.refunded records refunded_cents (amount_refunded, never lowered).
--   B13  charge.dispute.created records chargeback_cents for a formal dispute (an inquiry,
--        status warning_*, withdraws nothing). charge.dispute.closed clears the block only for
--        the two statuses in which the platform keeps the charged money: won ("The issuer
--        returns the debited chargeback amount to Stripe." docs.stripe.com/disputes/
--        how-disputes-work) and warning_closed (an inquiry closed without becoming a
--        formal dispute; docs.stripe.com/api/disputes/object). lost refunds the row as before
--        and keeps chargeback_cents. Every other closing status (prevented, any status this
--        file does not know) keeps the block and writes last_error: a person decides, and the
--        row shows in payment_attention.
--   B22  payment_intent.payment_failed changes nothing: a declined card leaves the
--        PaymentIntent open for another card. The event is not subscribed either.
--
-- Unchanged: event resolution, idempotency per event id, every other arm, the exception
-- boundary that never raises past itself.
--
-- Additive under scripts/staging-scan.sh.

begin;

create or replace function public.apply_payment_event(p_event_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ev       public.payment_events;
  v_obj      jsonb;
  v_type     text;
  v_payment  public.payments;
  v_pid      uuid;
  v_refunded integer;
  v_tip_charged boolean := false;  -- B1: this event is the charge of an unfunded tip
  v_received    bigint;            -- B1 (e), B17: the amount the provider says it received
  v_queue_tip   boolean := false;  -- B1 (c, e): queue the tip for transfer in this update
  v_dispute     text;              -- B13: the dispute's status
begin
  select * into v_ev from public.payment_events where id = p_event_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'unknown event'); end if;
  if v_ev.processed_at is not null then
    return jsonb_build_object('ok', true, 'already', true, 'payment_id', v_ev.payment_id);
  end if;
  v_type := v_ev.type;

  begin
    v_obj := v_ev.payload -> 'data' -> 'object';

    -- Resolve the ledger row. metadata.payment_id FIRST: matching by
    -- (job, kind) breaks the moment a job has more than one money object.
    v_pid := nullif(v_obj -> 'metadata' ->> 'payment_id', '')::uuid;
    if v_pid is not null then
      select * into v_payment from public.payments where id = v_pid for update;
    elsif v_type like 'payment_intent.%' then
      select * into v_payment from public.payments
       where provider = 'stripe' and provider_ref = v_obj ->> 'id' for update;
    elsif v_type like 'charge.%' then
      select * into v_payment from public.payments
       where provider = 'stripe' and provider_ref = v_obj ->> 'payment_intent' for update;
    end if;

    if v_payment.id is not null and v_type = 'transfer.created' then
      -- B16: one writer for a transfer, shared with the drain's write-back.
      perform public.payment_record_transfer(v_payment.id, v_obj ->> 'id',
                                             nullif(v_obj ->> 'amount', '')::integer);
    elsif v_payment.id is not null and v_type = 'transfer.reversed' then
      -- B16: amount_reversed is the transfer's running total; reversed = true means all of it.
      perform public.payment_record_reversal(v_payment.id, v_obj ->> 'id',
        nullif(v_obj ->> 'amount', '')::integer,
        case when coalesce((v_obj ->> 'reversed')::boolean, false) then null
             else nullif(v_obj ->> 'amount_reversed', '')::integer end);
    elsif v_payment.id is not null then
      v_refunded := nullif(v_obj ->> 'amount_refunded', '')::integer;
      v_dispute := v_obj ->> 'status';

      -- B17: amount_received is read on every payment_intent.succeeded. A payload without it
      -- (the field is always present on a real payment_intent) is taken as matching.
      if v_type = 'payment_intent.succeeded' then
        v_received := nullif(v_obj ->> 'amount_received', '')::bigint;
      end if;

      -- B1 (e): a tip is queued only for the charge its row was minted for.
      v_tip_charged := v_type = 'payment_intent.succeeded' and v_payment.kind = 'tip'
                       and v_payment.status = 'unfunded';
      if v_tip_charged then
        v_queue_tip := v_received is null or v_received = v_payment.charge_amount_cents;
      end if;

      update public.payments set
        status = case
          -- B1 (a): an unfunded tip is held, like a job payment; it no longer
          -- goes straight to released. transfer.created releases it.
          when v_type = 'payment_intent.succeeded' then
            (case when status = 'unfunded' then 'held'
                  else status end)
          -- B22: payment_intent.payment_failed has no arm: the intent stays open for another card.
          when v_type = 'payment_intent.canceled' then
            (case when status = 'unfunded' then 'voided' else status end)
          when v_type = 'charge.refunded' then
            -- Against the CHARGED amount, not the job price. A payload with no
            -- amount_refunded leaves the status alone (fail safe).
            -- R5b (E-6): a voided or failed row keeps its status — it is no
            -- longer the job's live row, and refunded would collide with the
            -- live one on payments_one_active_per_job_kind.
            (case when v_refunded is null then status
                  when status in ('voided', 'failed') then status
                  when v_refunded >= charge_amount_cents then 'refunded'
                  else 'partially_refunded' end)
          when v_type = 'charge.dispute.closed' and v_dispute = 'lost' then
            (case when status in ('voided', 'failed') then status else 'refunded' end)
          else status end::public.payment_status,

        -- R5b (E-6): stamped only on the transition out of unfunded. A late
        -- payment on a voided or failed row was never held.
        -- B1 (b): a tip is held too, so it is stamped like a job_payment.
        held_at      = case when v_type = 'payment_intent.succeeded' and v_payment.kind in ('job_payment', 'tip')
                             and v_payment.status = 'unfunded'
                            then coalesce(held_at, now()) else held_at end,
        -- B17: what the charge collected, recorded once.
        received_cents = case when v_type = 'payment_intent.succeeded'
                              then coalesce(received_cents, v_received::integer) else received_cents end,
        -- B1 (c), (e): a charged tip is queued for transfer in this same update, only for the
        -- charge it was minted for (v_queue_tip). See 20261111000000_tip_settlement.sql.
        release_requested_at = case when v_queue_tip then now() else release_requested_at end,
        transfer_cents = case when v_queue_tip then amount_cents - platform_fee_cents else transfer_cents end,
        last_error   = case when v_type = 'payment_intent.succeeded' and v_payment.status in ('voided', 'failed')
                             and coalesce(v_payment.refund_cents, 0) = 0
                            then 'funded after the row was voided; refunding in full'
                            -- B1 (e): the charge was not for this row's amount.
                            when v_tip_charged and not v_queue_tip
                            then 'tip charged for a different amount than its row; transfer not queued'
                            -- B17: the same for a job payment; the queues send nothing for it.
                            when v_type = 'payment_intent.succeeded' and v_payment.status = 'unfunded'
                             and v_received is not null and v_received <> v_payment.charge_amount_cents
                            then 'charged a different amount than this payment; nothing is sent until a person decides'
                            -- B13: a dispute closed in a state that does not prove the money stayed.
                            when v_type = 'charge.dispute.closed'
                             and coalesce(v_dispute, '') not in ('won', 'warning_closed', 'lost')
                            then left('card dispute closed as ' || coalesce(v_dispute, 'an unknown status') || '; a person must decide', 500)
                            else last_error end,
        -- R5b (E-6): money captured on a row that is no longer live goes back
        -- in full — the whole charge, fee and tax included — through
        -- refunds_due, which process-settlements drains. Once only: a refund
        -- already queued or recorded is never re-queued.
        refund_cents = case when v_type = 'charge.refunded' then coalesce(refund_cents, v_refunded)
                            when v_type = 'payment_intent.succeeded' and v_payment.status in ('voided', 'failed')
                             and coalesce(v_payment.refund_cents, 0) = 0
                            then charge_amount_cents
                            else refund_cents end,
        refund_reason = case when v_type = 'payment_intent.succeeded' and v_payment.status in ('voided', 'failed')
                              and coalesce(v_payment.refund_cents, 0) = 0
                             then 'funded_after_void'
                             else refund_reason end,
        refund_ref   = case when v_type = 'charge.refunded'
                            then coalesce(v_obj -> 'refunds' -> 'data' -> 0 ->> 'id', refund_ref) else refund_ref end,
        -- B16: the charge's running refunded total, never lowered by an older event.
        refunded_cents = case when v_type = 'charge.refunded' and v_refunded is not null
                              then greatest(coalesce(refunded_cents, 0), v_refunded) else refunded_cents end,
        chargeback_ref = case when v_type like 'charge.dispute.%' then v_obj ->> 'id' else chargeback_ref end,
        -- B13: won and warning_closed are the only statuses that clear the block.
        chargeback_at  = case when v_type = 'charge.dispute.created' then coalesce(chargeback_at, now())
                              when v_type = 'charge.dispute.closed' and v_dispute in ('won', 'warning_closed') then null
                              else chargeback_at end,
        chargeback_cents = case when v_type = 'charge.dispute.created' and coalesce(v_dispute, '') not like 'warning\_%'
                                then coalesce(nullif(v_obj ->> 'amount', '')::integer, charge_amount_cents)
                                when v_type = 'charge.dispute.closed' and v_dispute in ('won', 'warning_closed') then null
                                when v_type = 'charge.dispute.closed' and v_dispute = 'lost'
                                then coalesce(chargeback_cents, nullif(v_obj ->> 'amount', '')::integer, charge_amount_cents)
                                else chargeback_cents end,
        updated_at = now()
      where id = v_payment.id;
    end if;

    -- DIVERGENCE (D11): no account.updated branch. R5 calls set_payouts_enabled().
    -- payout.paid is DELIBERATELY not handled (§5.2 note 9).

    update public.payment_events set processed_at = now(), payment_id = v_payment.id where id = p_event_id;
    return jsonb_build_object('ok', true, 'payment_id', v_payment.id);

  exception when others then
    -- The block's savepoint rolls the ledger write back; this UPDATE then
    -- commits with the function because we do NOT re-raise. The caller turns
    -- ok:false into a 5xx so the provider retries.
    update public.payment_events
       set error = left(sqlerrm, 500), attempts = attempts + 1
     where id = p_event_id;
    return jsonb_build_object('ok', false, 'error', 'apply failed');
  end;
end $$;
revoke all on function public.apply_payment_event(text) from public, anon, authenticated;
grant execute on function public.apply_payment_event(text) to service_role;
comment on function public.apply_payment_event(text) is
  'service_role only: applies one stored provider event to its payments row, idempotently. R5b (E-6): a payment_intent.succeeded on a voided or failed row queues a full refund (refund_reason funded_after_void). B1: a payment_intent.succeeded on an unfunded tip holds it and queues the whole tip for transfer when amount_received equals charge_amount_cents. 20261112010200: received_cents, refunded_cents and chargeback_cents record the provider''s facts; a job payment charged a different amount stays held with last_error; transfers are recorded once in payment_transfers (payment_record_transfer / payment_record_reversal); a card dispute clears its block only when won or when an inquiry closes (warning_closed), lost refunds the row, any other closing status keeps the block for a person; payment_intent.payment_failed changes nothing.';

commit;
