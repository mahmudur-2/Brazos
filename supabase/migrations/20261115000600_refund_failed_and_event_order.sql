-- 20261115000600_refund_failed_and_event_order.sql — pack 1, F2 (A5 and refund.failed).
-- Proof: supabase/tests/425_payment_event_order.sql, supabase/tests/426_refund_failed.sql.
--
-- A5. An older webhook event could undo a newer state: a partial charge.refunded arriving after the
-- full one set the status back to partially_refunded, a charge.dispute.created arriving after its own
-- charge.dispute.closed (won) blocked the money again, and a closing event of one dispute cleared the
-- block of another. Now the refund status follows the greatest refunded total recorded, a dispute
-- closed as won or warning_closed stays closed for its id (payment_events holds the closing event),
-- and a closing event clears only the dispute it names.
--
-- refund.failed. The provider can fail a refund after it reported it: the Refund's status becomes
-- failed with a failure_reason, refund.failed is sent, the money goes back to the platform's balance,
-- and the platform must arrange another way to refund (docs.stripe.com/refunds, "Handle failed
-- refunds"). Nothing retries by itself.
--   - payments.refund_failed_at: the failure event's own created time. The parties may read it (the
--     customer's card says the refund did not go through); a column grant like the other 26.
--   - apply_payment_event: the failed refund's amount comes off refunded_cents, once per refund id;
--     a refunded or partially_refunded status goes back to what is true without that refund; the
--     failed refund stays in refund_ref, so refunds_due never sends it again; last_error names it.
--     A charge.refunded created at or before a recorded refund failure of the payment counts nothing
--     (it was sent before the failure); a later one (a refund by hand in the dashboard) counts.
--   - settlement_send_reopen: the owner's existing reopen also accepts a failed refund: it clears
--     the failure and refund_ref and starts a new attempt (a new key).
--   - payment_attention: one new reason, and the "refund sent, not yet confirmed" line leaves out
--     a failed refund.
--
-- Additive under scripts/staging-scan.sh.

begin;

-- ---------------------------------------------------------------------------
-- 1. The column.
-- ---------------------------------------------------------------------------
alter table public.payments add column if not exists refund_failed_at timestamptz;
grant select (refund_failed_at) on public.payments to authenticated;
comment on column public.payments.refund_failed_at is
  'When the provider failed a refund of this payment (the refund.failed event''s own created time). Set by apply_payment_event, cleared by settlement_send_reopen. The parties may read it.';

-- ---------------------------------------------------------------------------
-- 2. apply_payment_event(text), replaced whole from 20261112010200_apply_payment_event.sql. Same
--    signature, security attributes and ACL (restated). Changes are marked A5 or F2.
-- ---------------------------------------------------------------------------
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
  v_created     timestamptz;       -- F2: the event's own time (the provider's created), else when received
  v_stale       boolean := false;  -- F2: a charge.refunded created at or before a recorded refund failure
  v_fail_new    boolean := false;  -- F2: a refund.failed for a refund not taken off before
  v_fail_cents  integer := 0;      -- F2: that refund's amount
  v_closed      boolean := false;  -- A5: this dispute was already closed as won or warning_closed
begin
  select * into v_ev from public.payment_events where id = p_event_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'unknown event'); end if;
  if v_ev.processed_at is not null then
    return jsonb_build_object('ok', true, 'already', true, 'payment_id', v_ev.payment_id);
  end if;
  v_type := v_ev.type;

  begin
    v_obj := v_ev.payload -> 'data' -> 'object';
    v_created := coalesce(to_timestamp(nullif(v_ev.payload ->> 'created', '')::double precision), v_ev.received_at);

    -- Resolve the ledger row. metadata.payment_id FIRST: matching by
    -- (job, kind) breaks the moment a job has more than one money object.
    v_pid := nullif(v_obj -> 'metadata' ->> 'payment_id', '')::uuid;
    if v_pid is not null then
      select * into v_payment from public.payments where id = v_pid for update;
    elsif v_type like 'payment_intent.%' then
      select * into v_payment from public.payments
       where provider = 'stripe' and provider_ref = v_obj ->> 'id' for update;
    elsif v_type like 'charge.%' or v_type like 'refund.%' then
      -- F2: a Refund names its payment_intent like a Charge does (a refund made by hand in the
      -- dashboard carries no metadata).
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

      -- F2: a charge.refunded sent before a refund failure of this payment is old news.
      if v_type = 'charge.refunded' then
        v_stale := exists (
          select 1 from public.payment_events e
           where e.payment_id = v_payment.id and e.type = 'refund.failed' and e.processed_at is not null
             and coalesce(to_timestamp(nullif(e.payload ->> 'created', '')::double precision), e.received_at) >= v_created);
        if v_stale then v_refunded := null; end if;
      end if;

      -- F2: each failed refund comes off once, whatever the number of events naming it.
      if v_type = 'refund.failed' then
        v_fail_new := not exists (
          select 1 from public.payment_events e
           where e.payment_id = v_payment.id and e.type = 'refund.failed' and e.processed_at is not null
             and e.payload -> 'data' -> 'object' ->> 'id' = v_obj ->> 'id');
        if v_fail_new then v_fail_cents := coalesce(nullif(v_obj ->> 'amount', '')::integer, 0); end if;
      end if;

      -- A5: a dispute already closed as won or warning_closed stays closed for its id.
      if v_type = 'charge.dispute.created' then
        v_closed := exists (
          select 1 from public.payment_events e
           where e.payment_id = v_payment.id and e.type = 'charge.dispute.closed' and e.processed_at is not null
             and e.payload -> 'data' -> 'object' ->> 'id' = v_obj ->> 'id'
             and e.payload -> 'data' -> 'object' ->> 'status' in ('won', 'warning_closed'));
      end if;

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
            -- A5: the greatest refunded total recorded, never this event's alone.
            (case when v_refunded is null then status
                  when status in ('voided', 'failed') then status
                  when greatest(coalesce(refunded_cents, 0), v_refunded) >= charge_amount_cents then 'refunded'
                  else 'partially_refunded' end)
          -- F2: the refund did not arrive. A refunded or partially_refunded row says what is true
          -- without it: the rest still refunded, else paid_out or released as the facts say
          -- (released only when no refund was ever asked of the system: a system refund is always
          -- asked of a held row), else held. Every other status stays, and so does any status while
          -- a card dispute holds the money (a person decides; payment_attention lists the row).
          when v_type = 'refund.failed' and v_fail_new then
            (case when status not in ('refunded', 'partially_refunded') or chargeback_at is not null then status
                  when greatest(coalesce(refunded_cents, 0) - v_fail_cents, 0) >= charge_amount_cents then 'refunded'
                  when greatest(coalesce(refunded_cents, 0) - v_fail_cents, 0) > 0 then 'partially_refunded'
                  when paid_out_at is not null then 'paid_out'
                  when released_at is not null and refund_reason is null then 'released'
                  else 'held' end)
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
                            -- F2: what failed, and what is left to do.
                            when v_type = 'refund.failed' and v_fail_new
                            then left('refund ' || coalesce(v_obj ->> 'id', '?') || ' failed at the provider ('
                                      || coalesce(nullif(v_obj ->> 'failure_reason', ''), 'no reason given')
                                      || '); the money is back in the Stripe balance and a person must refund another way', 500)
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
        -- F2: an old charge.refunded names no refund; a failed refund stays recorded, so refunds_due
        -- never sends it again (settlement_send_reopen clears it).
        refund_ref   = case when v_type = 'charge.refunded' and not v_stale
                            then coalesce(v_obj -> 'refunds' -> 'data' -> 0 ->> 'id', refund_ref)
                            when v_type = 'refund.failed' then coalesce(refund_ref, v_obj ->> 'id')
                            else refund_ref end,
        -- B16: the charge's running refunded total, never lowered by an older event.
        -- F2: a failed refund comes off, once.
        refunded_cents = case when v_type = 'charge.refunded' and v_refunded is not null
                              then greatest(coalesce(refunded_cents, 0), v_refunded)
                              when v_type = 'refund.failed' and v_fail_new and refunded_cents is not null
                              then greatest(refunded_cents - v_fail_cents, 0)
                              else refunded_cents end,
        refund_failed_at = case when v_type = 'refund.failed' and v_fail_new
                                then greatest(refund_failed_at, v_created) else refund_failed_at end,
        -- A5: a dispute already closed keeps its record; a closing event names only its own dispute.
        chargeback_ref = case when v_type = 'charge.dispute.created' and not v_closed then v_obj ->> 'id'
                              when v_type = 'charge.dispute.closed'
                               and (chargeback_ref is null or chargeback_ref = v_obj ->> 'id') then v_obj ->> 'id'
                              else chargeback_ref end,
        -- B13: won and warning_closed are the only statuses that clear the block.
        chargeback_at  = case when v_type = 'charge.dispute.created' and not v_closed then coalesce(chargeback_at, now())
                              when v_type = 'charge.dispute.closed' and v_dispute in ('won', 'warning_closed')
                               and (chargeback_ref is null or chargeback_ref = v_obj ->> 'id') then null
                              else chargeback_at end,
        chargeback_cents = case when v_type = 'charge.dispute.created' and not v_closed
                                 and coalesce(v_dispute, '') not like 'warning\_%'
                                then coalesce(nullif(v_obj ->> 'amount', '')::integer, charge_amount_cents)
                                when v_type = 'charge.dispute.closed' and v_dispute in ('won', 'warning_closed')
                                 and (chargeback_ref is null or chargeback_ref = v_obj ->> 'id') then null
                                when v_type = 'charge.dispute.closed' and v_dispute = 'lost'
                                then coalesce(chargeback_cents, nullif(v_obj ->> 'amount', '')::integer, charge_amount_cents)
                                else chargeback_cents end,
        updated_at = now()
      where id = v_payment.id;
    end if;

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
  'service_role only: applies one stored provider event to its payments row, idempotently. R5b (E-6): a payment_intent.succeeded on a voided or failed row queues a full refund (refund_reason funded_after_void). B1: a payment_intent.succeeded on an unfunded tip holds it and queues the whole tip for transfer when amount_received equals charge_amount_cents. 20261112010200: received_cents, refunded_cents and chargeback_cents record the provider''s facts; a job payment charged a different amount stays held with last_error; transfers are recorded once in payment_transfers (payment_record_transfer / payment_record_reversal); a card dispute clears its block only when won or when an inquiry closes (warning_closed), lost refunds the row, any other closing status keeps the block for a person; payment_intent.payment_failed changes nothing. 20261115000600: the refund status follows the greatest refunded total; a dispute closed as won or warning_closed stays closed for its id and a closing event clears only its own dispute; refund.failed takes the failed refund off refunded_cents once per refund id, sets refund_failed_at (the event''s created time) and puts a refunded status back to what is true; a charge.refunded created at or before a recorded refund failure counts nothing.';

-- ---------------------------------------------------------------------------
-- 3. settlement_send_reopen(uuid, text), replaced whole from 20261112010300_settlement_guards.sql.
--    F2 (refund branch only): a failed refund may be reopened. Same ACL (restated).
-- ---------------------------------------------------------------------------
create or replace function public.settlement_send_reopen(p_payment_id uuid, p_kind text)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_pay public.payments;
begin
  if p_kind is distinct from 'transfer' and p_kind is distinct from 'refund' then
    raise exception 'settlement_send_reopen: unknown kind %; transfer or refund only', coalesce(p_kind, '<null>');
  end if;
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found or v_pay.provider <> 'stripe' then raise exception 'Payment not found'; end if;

  if p_kind = 'transfer' then
    if v_pay.release_requested_at is null or coalesce(v_pay.transfer_cents, 0) <= 0 then
      raise exception 'This payment never asked for a transfer';
    end if;
    if v_pay.transfer_ref is not null
       or exists (select 1 from public.payment_transfers t
                   where t.payment_id = p_payment_id and t.reversed_cents < t.amount_cents) then
      raise exception 'A transfer is recorded for this payment; nothing to reopen';
    end if;
    if not public.settlement_attempt_closed(v_pay.transfer_attempts, v_pay.transfer_sent_attempt,
                                            v_pay.transfer_sent_at, v_pay.transfer_stopped_at) then
      raise exception 'Nothing to reopen: the current transfer attempt is neither stopped nor past its 23 hours';
    end if;
    update public.payments set
      transfer_attempts   = transfer_attempts + 1,
      transfer_stopped_at = null,
      last_error          = 'transfer: reopened by the owner after a look in Stripe',
      updated_at          = now()
    where id = p_payment_id;
  else
    if coalesce(v_pay.refund_cents, 0) <= 0 then raise exception 'This payment never asked for a refund'; end if;
    if (v_pay.refund_ref is not null and v_pay.refund_failed_at is null) or coalesce(v_pay.refunded_cents, 0) > 0
       or v_pay.status in ('refunded', 'partially_refunded') then
      raise exception 'A refund is recorded for this payment; nothing to reopen';
    end if;
    if v_pay.refund_failed_at is null and not public.settlement_attempt_closed(v_pay.refund_attempts, v_pay.refund_sent_attempt,
                                            v_pay.refund_sent_at, v_pay.refund_stopped_at) then
      raise exception 'Nothing to reopen: the current refund attempt is neither stopped nor past its 23 hours';
    end if;
    update public.payments set
      refund_attempts   = refund_attempts + 1,
      refund_stopped_at = null,
      refund_ref        = null,
      refund_failed_at  = null,
      last_error        = 'refund: reopened by the owner after a look in Stripe',
      updated_at        = now()
    where id = p_payment_id;
  end if;
  return true;
end $fn$;
revoke all on function public.settlement_send_reopen(uuid, text) from public, anon, authenticated;
grant execute on function public.settlement_send_reopen(uuid, text) to service_role;
comment on function public.settlement_send_reopen(uuid, text) is
  'service_role only: the owner''s answer "it does not exist" after a look in Stripe for a stopped or 23-hour-old attempt, or (20261115000600) for a refund the provider failed. Starts a NEW attempt (counter + 1, so a new key) and clears the stop; for a failed refund it also clears refund_ref and refund_failed_at. Refused when a live transfer or a refund that did not fail is recorded for the payment, when anything is counted as refunded, when the payment never asked for that kind, or when the current attempt is still open. Moves no money itself; the drain sends on its next tick.';

-- ---------------------------------------------------------------------------
-- 4. payment_attention, replaced whole from 20261112010400_payment_attention.sql. F2: one new
--    reason (a refund the provider failed) and the "refund sent, not yet confirmed" line leaves
--    out a failed refund. Same columns and ACL (restated).
-- ---------------------------------------------------------------------------
create or replace view public.payment_attention as
  with tw as (
    -- Transfers asked for and not recorded.
    select p.*,
           exists (select 1 from public.transfers_ready r where r.id = p.id) as ready,
           public.settlement_attempt_closed(p.transfer_attempts, p.transfer_sent_attempt, p.transfer_sent_at, p.transfer_stopped_at) as closed
      from public.payments p
     where p.provider = 'stripe' and p.release_requested_at is not null
       and coalesce(p.transfer_cents, 0) > 0 and p.transfer_ref is null
  ),
  rw as (
    -- Refunds asked for and not recorded.
    select p.*,
           exists (select 1 from public.refunds_ready r where r.id = p.id) as ready,
           public.settlement_attempt_closed(p.refund_attempts, p.refund_sent_attempt, p.refund_sent_at, p.refund_stopped_at) as closed
      from public.payments p
     where p.provider = 'stripe' and coalesce(p.refund_cents, 0) > 0
       and p.refund_ref is null and p.status <> 'refunded'
  )
  select tw.id as payment_id, tw.job_id, 'transfer'::text as what,
         case
           when tw.closed and tw.transfer_stopped_at is not null and tw.transfer_sent_attempt = tw.transfer_attempts
             then 'stopped: the last answer needs a person. Look in Stripe for metadata payment_id, then record_settlement_sent or settlement_send_reopen'
           when tw.closed
             then 'no answer for 23 hours under the same key. Look in Stripe for metadata payment_id, then record_settlement_sent or settlement_send_reopen'
           when tw.transfer_reversed_at is not null then 'reversed at the provider: resolve_job_dispute (job payment) or resolve_tip (tip) decides'
           when tw.chargeback_at is not null then 'card dispute open: no transfer while the card network holds the money'
           when exists (select 1 from public.job_disputes d where d.job_id = tw.job_id and d.status = 'open')
             then 'open issue report: resolve_job_dispute decides'
           when coalesce(tw.received_cents, tw.charge_amount_cents) <> tw.charge_amount_cents
             then 'charged a different amount than this payment: settle it by hand in Stripe'
           when tw.status not in ('held', 'partially_refunded') then 'payment is ' || tw.status::text || ': a person decides'
           when exists (select 1 from public.payment_transfers x where x.payment_id = tw.id and x.reversed_cents < x.amount_cents)
             then 'a transfer is already recorded for this payment'
           when tw.transfer_cents > tw.charge_amount_cents - greatest(coalesce(tw.refunded_cents, 0), coalesce(tw.refund_cents, 0))
             then 'transfer is more than is left after refunds: a person decides'
           when not tw.ready then 'the worker has no enabled payout account yet'
           else 'retrying: ' || coalesce(tw.last_error, '')
         end as reason,
         coalesce(case when tw.closed then tw.transfer_sent_at end, tw.release_requested_at) as since,
         (tw.closed or tw.release_requested_at < now() - interval '3 days') as overdue,
         tw.transfer_cents as cents,
         tw.last_error as detail
    from tw
   where not tw.ready or tw.last_error is not null
  union all
  select rw.id, rw.job_id, 'refund',
         case
           when rw.closed and rw.refund_stopped_at is not null and rw.refund_sent_attempt = rw.refund_attempts
             then 'stopped: the last answer needs a person. Look in Stripe for metadata payment_id, then record_settlement_sent or settlement_send_reopen'
           when rw.closed
             then 'no answer for 23 hours under the same key. Look in Stripe for metadata payment_id, then record_settlement_sent or settlement_send_reopen'
           when rw.chargeback_at is not null then 'card dispute open: no refund while the card network holds the money'
           when coalesce(rw.refunded_cents, 0) > 0 or rw.status = 'partially_refunded'
             then 'a refund already landed on this charge: finish by hand in Stripe, then record_settlement_sent'
           when coalesce(rw.received_cents, rw.charge_amount_cents) <> rw.charge_amount_cents
             then 'charged a different amount than this payment: settle it by hand in Stripe'
           when rw.status not in ('held', 'released', 'paid_out', 'voided', 'failed') then 'payment is ' || rw.status::text || ': a person decides'
           when rw.refund_cents > rw.charge_amount_cents
                  - (select coalesce(sum(x.amount_cents - x.reversed_cents), 0) from public.payment_transfers x where x.payment_id = rw.id)
             then 'refund is more than is left after the transfer: a person decides'
           when not rw.ready then 'no payment intent to refund against'
           else 'retrying: ' || coalesce(rw.last_error, '')
         end,
         coalesce(case when rw.closed then rw.refund_sent_at end, rw.updated_at),
         (rw.closed or rw.updated_at < now() - interval '3 days'),
         rw.refund_cents,
         rw.last_error
    from rw
   where not rw.ready or rw.last_error is not null
  union all
  -- A refund sent and not yet confirmed by charge.refunded (F2: and not failed).
  select p.id, p.job_id, 'refund', 'refund sent, not yet confirmed by charge.refunded',
         p.updated_at, p.updated_at < now() - interval '1 day', p.refund_cents, p.refund_ref
    from public.payments p
   where p.provider = 'stripe' and p.refund_ref is not null and coalesce(p.refunded_cents, 0) = 0
     and p.status not in ('refunded', 'partially_refunded') and p.refund_failed_at is null
  union all
  -- F2: a refund the provider failed, while less than was asked is counted as refunded. Nothing
  -- retries by itself: the owner refunds by hand in Stripe (the later charge.refunded counts), or
  -- reopens it for a new refund.
  select p.id, p.job_id, 'refund',
         'refund failed at the provider: the money is back in the Stripe balance. Refund by hand in Stripe, or settlement_send_reopen to send a new refund',
         p.refund_failed_at, true, p.refund_cents, p.last_error
    from public.payments p
   where p.provider = 'stripe' and p.refund_failed_at is not null
     and coalesce(p.refunded_cents, 0) < coalesce(p.refund_cents, 0)
  union all
  -- More left the platform than came in.
  select m.payment_id, m.job_id, 'payment', 'money short: more went out than is left on the charge (for example a card dispute lost after the transfer). Recover it by hand in Stripe',
         p.updated_at, true, m.short_cents,
         'received ' || m.received_cents || ', refunded ' || m.refunded_cents || ', card dispute ' || m.chargeback_cents || ', transferred ' || m.transferred_cents
    from public.payment_money m join public.payments p on p.id = m.payment_id
   where m.short_cents > 0
  union all
  -- A transfer reversed in part: money is still with the worker.
  select x.payment_id, p.job_id, 'transfer', 'transfer ' || x.transfer_ref || ' was reversed in part: a person decides',
         x.updated_at, false, x.reversed_cents, p.last_error
    from public.payment_transfers x join public.payments p on p.id = x.payment_id
   where x.reversed_cents > 0 and x.reversed_cents < x.amount_cents
  union all
  -- A charge for another amount, on a row that asks for nothing yet.
  select p.id, p.job_id, 'payment', 'charged a different amount than this payment: settle it by hand in Stripe',
         p.updated_at, false, p.received_cents, p.last_error
    from public.payments p
   where p.provider = 'stripe' and p.received_cents is not null and p.received_cents <> p.charge_amount_cents
     and not (p.release_requested_at is not null and coalesce(p.transfer_cents, 0) > 0 and p.transfer_ref is null)
     and not (coalesce(p.refund_cents, 0) > 0 and p.refund_ref is null and p.status <> 'refunded')
  union all
  -- A card dispute still holding the money, on a row that asks for nothing yet.
  select p.id, p.job_id, 'payment', 'card dispute still open or closed without proof the money stayed: a person decides',
         p.chargeback_at, p.chargeback_at < now() - interval '30 days', p.chargeback_cents, p.last_error
    from public.payments p
   where p.provider = 'stripe' and p.chargeback_at is not null and p.status <> 'refunded'
     and not (p.release_requested_at is not null and coalesce(p.transfer_cents, 0) > 0 and p.transfer_ref is null)
     and not (coalesce(p.refund_cents, 0) > 0 and p.refund_ref is null)
  union all
  -- A held job payment on a job that never ends: still assigned or in_progress more than 7 days
  -- after its arrival window (after the hire when it has no date). The 7 days are the fallback
  -- release clock's. Nothing moves this money by itself; nothing here moves it either.
  select p.id, p.job_id, 'payment',
         'job still ' || j.status::text || ' more than 7 days after its date (or its hire): the money stays held until a person decides',
         s.since + interval '7 days', true, p.charge_amount_cents, p.last_error
    from public.payments p
    join public.jobs j on j.id = p.job_id
    cross join lateral (
      select coalesce(
               (j.scheduled_date::timestamp + make_interval(hours => coalesce(j.arrival_end_hour, 24)::int))
                 at time zone 'America/New_York',
               (select a.accepted_at from public.job_agreements a where a.job_id = j.id),
               p.held_at,
               p.created_at) as since
    ) s
   where p.provider = 'stripe' and p.kind = 'job_payment' and p.status = 'held'
     and j.status in ('assigned', 'in_progress')
     and s.since < now() - interval '7 days'
  union all
  -- Open issue reports (in-app job disputes): overdue after 2 business days.
  select d.payment_id, d.job_id, 'issue report', 'open issue report: resolve_job_dispute decides',
         d.created_at,
         (select count(*) from generate_series((d.created_at at time zone 'America/New_York')::date + 1,
                                               (now() at time zone 'America/New_York')::date, interval '1 day') g
           where extract(isodow from g) < 6) > 2,
         null::integer, d.reason::text
    from public.job_disputes d
   where d.status = 'open'
  union all
  -- Webhook events that could not be applied.
  select e.payment_id, null::uuid, 'event', 'webhook event ' || e.type || ' could not be applied: fix and re-run apply_payment_event(''' || e.id || ''')',
         e.received_at, e.attempts >= 5, null::integer, e.error
    from public.payment_events e
   where e.processed_at is null and e.attempts > 0;
revoke all on table public.payment_attention from public, anon, authenticated, service_role;
grant select on table public.payment_attention to service_role;
comment on view public.payment_attention is
  'Money rule 4, the owner''s one query: select * from public.payment_attention order by since; Every payment the system will not move by itself, one line per reason: transfers and refunds asked for and not ready (stopped, 23 hours without an answer, a reversal park, a card dispute, an issue report, another amount, a status, more than is left, no payout account, no payment intent), rows retrying with an error, refunds sent and not confirmed, refunds the provider failed (20261115000600), money short, partial reversals, card disputes still open, held job payments on jobs still assigned or in_progress 7 days after their date (or hire), open issue reports (overdue after 2 business days, America/New_York) and webhook events that could not be applied. service_role only.';

commit;
