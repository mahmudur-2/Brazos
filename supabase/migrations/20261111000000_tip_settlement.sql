-- 20261111000000_tip_settlement.sql — ledger B1: a charged tip reaches the hired worker.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS WRONG (docs/lean/AUDIT-LEDGER.md B1)
-- ---------------------------------------------------------------------------
-- Worker payouts are separate charges and transfers: the platform charges the
-- customer, and process-settlements later transfers each row in transfers_due
-- to the worker's payout account. A job payment joins that queue when the
-- customer approves (release_job_payment) or the 72-hour clock runs
-- (auto_release_due_payments): both set release_requested_at and
-- transfer_cents. A tip never joined it. apply_payment_event() took
-- payment_intent.succeeded on an unfunded tip straight to status 'released'
-- with released_at = now(), and never set release_requested_at or
-- transfer_cents. The tip therefore never matched transfers_due,
-- process-settlements never sent it, and the customer was charged for a tip
-- the worker never received while the app showed it as sent.
--
-- ---------------------------------------------------------------------------
-- WHAT CHANGES
-- ---------------------------------------------------------------------------
-- apply_payment_event() is replaced whole (create or replace: same signature,
-- same security attributes, ACL restated). On payment_intent.succeeded for an
-- UNFUNDED TIP (the row as read into v_payment), the one update now sets:
--   status               'held' (the same unfunded -> held arm a job payment
--                        takes; the tip arm that went straight to 'released'
--                        is gone)
--   held_at              coalesce(held_at, now()) (the stamp was job_payment
--                        only; it now covers the tip)
--   release_requested_at now()
--   transfer_cents       amount_cents - platform_fee_cents (the expression
--                        release_job_payment uses; the tip trigger forces
--                        platform_fee_cents = 0, so it is the whole tip and
--                        never the customer's fee or tax)
-- The tip then satisfies transfers_due's existing predicate,
-- process-settlements transfers it like any approved payment, and
-- transfer.created moves it to 'released' with released_at and transfer_ref.
-- payment_intent.succeeded no longer stamps released_at on a tip.
-- release_reason stays null: payments_release_reason_known lists no tip reason
-- and is not touched.
-- A replayed payment_intent.succeeded (a new event id) on a tip that is
-- already held or released finds no unfunded row and changes nothing, so a
-- tip is never queued twice. A succeeded intent on a VOIDED or FAILED tip
-- keeps R5b's E-6 rule: a full refund is queued (refund_reason
-- funded_after_void) and nothing is queued for transfer.
--
-- TWO LOCKS ON THE AMOUNT (added after review, before this file was applied
-- anywhere shared). Until now a wrong tip amount on a row cost nobody
-- anything, because no tip was ever transferred. Now the row's amount is what
-- the worker is sent, so the row a payment intent was made for must be the
-- row that is paid out:
--   1. begin_tip_payment() no longer rewrites an unfunded tip's amount in
--      place. It did so while provider_ref was null, and create-payment reads
--      the charge amount, talks to the provider, and only then attaches the
--      intent: a direct call in that gap could raise the row's amount under a
--      smaller charge, and the in-place rewrite also skipped the tip ceiling
--      (payments_tip_ceiling is a BEFORE INSERT trigger). Any change of
--      amount now voids the unfunded row and inserts a new one, so the
--      ceiling trigger runs on every amount, and an intent made for the old
--      amount lands on the voided row and is refunded in full (E-6).
--   2. apply_payment_event() queues a tip only when the event's
--      amount_received equals the row's charge_amount_cents (an event with no
--      such field is taken as matching). On a mismatch the tip is held, NOT
--      queued (release_requested_at and transfer_cents stay null), and
--      last_error says why; nothing is sent until an operator decides.
--
-- ---------------------------------------------------------------------------
-- WHAT DOES NOT CHANGE
-- ---------------------------------------------------------------------------
-- Every other branch is 20260915000000_connect_onboarding.sql §1 as it stands:
-- event resolution, job payments (payment_intent.succeeded still leaves a job
-- payment held with no release requested), payment_failed, canceled,
-- transfer.created, transfer.reversed (a reversed tip is parked like any row,
-- and nothing un-parks a tip automatically), charge.refunded, the card
-- dispute events, the E-6 refund, idempotency per event id and the exception
-- block. No table, column, constraint, view, grant or trigger changes; both
-- signatures are unchanged, so types/database.ts is unchanged.
-- begin_tip_payment() keeps every refusal, the fee arithmetic, the insert and
-- the same-amount return; only the in-place amount rewrite is gone.
-- transfers_due, transfers_ready, enforce_tip_ceiling(), create-payment and
-- process-settlements are unchanged. No row is rewritten: tips charged before
-- this file stay 'released' with no transfer_ref, and moving money for them
-- is the owner's decision. Additive SQL only: two create or replace
-- functions, their revokes and grants restated, and two comments.
--
-- ---------------------------------------------------------------------------
-- UNDO
-- ---------------------------------------------------------------------------
-- Never edit this file once it has been applied anywhere. A later migration
-- re-creates apply_payment_event() from 20260915000000_connect_onboarding.sql
-- §1 (with that section's revoke, grant and comment) and begin_tip_payment()
-- from 20260905000000_stripe_foundation.sql §16 (body, revoke, grant, comment).
-- Tips charged while this file was live stay correct either way: each was
-- queued once, and transfer.created settles it.
--
-- Blueprint: docs/critical/tip-settlement.md. Proof (local stack):
-- supabase/tests/320_tip_settlement.sql.

-- ---------------------------------------------------------------------------
-- 1. apply_payment_event(): THE state mover for stripe rows — replaced whole.
--    Idempotent per event id; monotonic per ledger row; NEVER raises past its
--    own boundary — it records the error on the event and returns ok:false.
--
--    B1 changes the tip half of payment_intent.succeeded and nothing else;
--    every other branch is behaviourally identical to
--    20260915000000_connect_onboarding.sql §1. Five places, each marked B1:
--      a. status: the tip arm (unfunded -> released) is removed; an unfunded
--         tip takes the existing unfunded -> held arm.
--      b. held_at: stamped on the transition out of unfunded for a tip as for
--         a job_payment.
--      c. release_requested_at and transfer_cents: newly assigned, for an
--         unfunded tip on payment_intent.succeeded only; every other case
--         keeps the stored value.
--      d. released_at: no longer stamped by payment_intent.succeeded on a
--         tip; transfer.created stamps it, as for every row.
--      e. the amount lock: (c) applies only when the event's amount_received
--         is the row's charge_amount_cents; otherwise the tip is held, not
--         queued, and last_error records it. Read for an unfunded tip only,
--         so no other row or event type parses the new field.
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
  v_received    bigint;            -- B1 (e): the amount the provider says it received
  v_queue_tip   boolean := false;  -- B1 (c, e): queue the tip for transfer in this update
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

    if v_payment.id is not null then
      v_refunded := nullif(v_obj ->> 'amount_refunded', '')::integer;

      -- B1 (e): a tip is queued only for the charge its row was minted for.
      -- amount_received is the provider's own count of what the intent
      -- collected; a payload without it (the field is always present on a
      -- real payment_intent) is taken as matching. Read here and nowhere
      -- else, so a job payment and every other event type behave as before.
      v_tip_charged := v_type = 'payment_intent.succeeded' and v_payment.kind = 'tip'
                       and v_payment.status = 'unfunded';
      if v_tip_charged then
        v_received := nullif(v_obj ->> 'amount_received', '')::bigint;
        v_queue_tip := v_received is null or v_received = v_payment.charge_amount_cents;
      end if;

      update public.payments set
        status = case
          -- B1 (a): an unfunded tip is held, like a job payment; it no longer
          -- goes straight to released. transfer.created releases it.
          when v_type = 'payment_intent.succeeded' then
            (case when status = 'unfunded' then 'held'
                  else status end)
          when v_type = 'payment_intent.payment_failed' then
            (case when status = 'unfunded' then 'failed' else status end)
          when v_type = 'payment_intent.canceled' then
            (case when status = 'unfunded' then 'voided' else status end)
          -- D6: a transfer moves held -> released only when nothing is being
          -- refunded; a fee cancellation records transfer_ref and waits for
          -- charge.refunded to reach partially_refunded, in either order.
          when v_type = 'transfer.created' then
            (case when status = 'held' and coalesce(refund_cents, 0) = 0 then 'released' else status end)
          when v_type = 'transfer.reversed' then
            (case when status = 'released' then 'held' else status end)
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
          when v_type = 'charge.dispute.closed' and v_obj ->> 'status' = 'lost' then
            (case when status in ('voided', 'failed') then status else 'refunded' end)
          else status end::public.payment_status,

        -- R5b (E-6): stamped only on the transition out of unfunded. A late
        -- payment on a voided or failed row was never held.
        -- B1 (b): a tip is held too, so it is stamped like a job_payment.
        held_at      = case when v_type = 'payment_intent.succeeded' and v_payment.kind in ('job_payment', 'tip')
                             and v_payment.status = 'unfunded'
                            then coalesce(held_at, now()) else held_at end,
        -- B1 (c): a charged tip is queued for transfer in this same update — a
        -- tip has no approval step. Only on the transition out of unfunded
        -- (the row as read into v_payment): a replayed succeeded on a held or
        -- released tip changes nothing, and a late payment on a voided or
        -- failed tip is refunded below, never queued. transfer_cents is
        -- release_job_payment's expression; the tip trigger forces
        -- platform_fee_cents = 0, so it is the whole tip and never the
        -- customer's fee or tax. release_reason is not written: no tip reason
        -- exists in payments_release_reason_known.
        -- B1 (e): and only when the charge is for this row's own amount
        -- (v_queue_tip); a mismatched charge leaves the tip held and unqueued.
        release_requested_at = case when v_queue_tip then now() else release_requested_at end,
        transfer_cents = case when v_queue_tip then amount_cents - platform_fee_cents else transfer_cents end,
        -- B1 (d): payment_intent.succeeded no longer releases a tip;
        -- transfer.created stamps released_at for a tip as for every row.
        released_at  = case when v_type = 'transfer.created'
                            then coalesce(released_at, now())
                            when v_type = 'transfer.reversed' then null
                            else released_at end,
        transfer_ref = case when v_type = 'transfer.created' then v_obj ->> 'id'
                            when v_type = 'transfer.reversed' then null
                            else transfer_ref end,
        -- D11: a reversal PARKS the row. release_requested_at is PRESERVED
        -- (the customer's release button must not re-open — a second real
        -- transfer) and transfer_reversed_at keeps it out of transfers_due
        -- (re-queueing would be the same second transfer). Only
        -- resolve_job_dispute clears the park.
        transfer_reversed_at = case when v_type = 'transfer.reversed' then now() else transfer_reversed_at end,
        last_error   = case when v_type = 'transfer.reversed' then 'transfer reversed at the provider'
                            when v_type = 'payment_intent.succeeded' and v_payment.status in ('voided', 'failed')
                             and coalesce(v_payment.refund_cents, 0) = 0
                            then 'funded after the row was voided; refunding in full'
                            -- B1 (e): the charge was not for this row's amount.
                            when v_tip_charged and not v_queue_tip
                            then 'tip charged for a different amount than its row; transfer not queued'
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
        chargeback_ref = case when v_type like 'charge.dispute.%' then v_obj ->> 'id' else chargeback_ref end,
        chargeback_at  = case when v_type = 'charge.dispute.created' then coalesce(chargeback_at, now())
                              when v_type = 'charge.dispute.closed' and v_obj ->> 'status' = 'won' then null
                              else chargeback_at end,
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
  'service_role only: applies one stored provider event to its payments row, idempotently. R5b (E-6): a payment_intent.succeeded on a voided or failed row queues a full refund (refund_reason funded_after_void) instead of being consumed silently. B1 (20261111000000_tip_settlement.sql): a payment_intent.succeeded on an unfunded tip holds it and, in the same update, queues the whole tip for transfer to the worker (held_at, release_requested_at, transfer_cents = amount_cents - platform_fee_cents; release_reason stays null), so it enters transfers_due like an approved job payment and transfer.created releases it. A replayed succeeded on a tip already held or released changes nothing. The tip is queued only when the event''s amount_received equals the row''s charge_amount_cents (a missing field is taken as matching); otherwise it is held, not queued, and last_error records it.';

-- ---------------------------------------------------------------------------
-- 2. begin_tip_payment(): replaced whole (same signature, same security
--    attributes, ACL restated). One behaviour changes, marked B1: an unfunded
--    tip's amount is never rewritten in place. 20260905000000_stripe_foundation
--    §16 updated amount_cents, customer_fee_cents and tax_cents on the row
--    while provider_ref was null; a change of amount now always takes the
--    path that section already had for a row with an intent attached — void
--    the unfunded row, insert a new one. The insert fires payments_tip_ceiling
--    (BEFORE INSERT), so both ceilings hold for every amount; a refused
--    amount raises inside this call, which rolls the void back with it, so
--    the old row stays as it was. Everything else is that section verbatim.
-- ---------------------------------------------------------------------------
create or replace function public.begin_tip_payment(p_job_id uuid, p_amount_cents integer) returns public.payments
language plpgsql security definer set search_path = public, pg_temp as $$
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
  v_cfee := round(p_amount_cents * v_fee.tip_customer_bps / 10000.0)::integer;
  v_tax := round((p_amount_cents + v_cfee) * v_fee.tax_bps / 10000.0)::integer;

  select * into v_tip from public.payments
   where job_id = p_job_id and kind = 'tip' and status not in ('failed', 'voided') for update;
  if found then
    if v_tip.status <> 'unfunded' then raise exception 'A tip was already added to this job'; end if;
    if v_tip.amount_cents = p_amount_cents then return v_tip; end if;
    -- B1: no in-place rewrite of the amount, with or without an intent
    -- attached. The row keeps the amount it was minted with; a different
    -- amount gets a new row through the insert below (and its ceiling).
    update public.payments
       set status = 'voided', last_error = 'tip amount changed before funding', updated_at = now()
     where id = v_tip.id;
  end if;

  insert into public.payments (job_id, offer_id, payer_id, payee_id, kind, amount_cents,
                               platform_fee_cents, customer_fee_cents, customer_fee_bps, tax_cents,
                               provider, status, funding_due_at)
  values (v_job.id, v_job.accepted_offer_id, v_actor, v_job.assigned_worker_id, 'tip', p_amount_cents,
          0, v_cfee, v_fee.tip_customer_bps, v_tax,
          'stripe', 'unfunded', now() + interval '24 hours')
  returning * into v_tip;
  return v_tip;
end $$;
revoke all on function public.begin_tip_payment(uuid, integer) from public, anon;
grant execute on function public.begin_tip_payment(uuid, integer) to authenticated;
comment on function public.begin_tip_payment(uuid, integer) is
  'The customer starts a stripe tip on a completed job whose payment released: row born unfunded, customer fee only (platform_fee_cents = 0), capped by the tip trigger. A tip row''s amount is never rewritten: asking for a different amount voids the unfunded row and inserts a new one, through the same trigger. payment_intent.succeeded holds the tip and queues the whole tip for transfer to the worker (release_requested_at, transfer_cents); transfer.created releases it (20261111000000_tip_settlement.sql).';
