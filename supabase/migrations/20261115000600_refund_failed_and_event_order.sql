-- 20261115000600_refund_failed_and_event_order.sql — pack 1, F2 (A5 and refund.failed).
-- Proof: supabase/tests/425_payment_event_order.sql, supabase/tests/426_refund_failed.sql.
--
-- Every rule below reads only the event it applies and durable rows of its own: never another
-- event's payload (the 90-day prune empties those) and never an event's created time.
--
-- A5. An older webhook event could undo a newer state: a partial charge.refunded arriving after the
-- full one set the status back to partially_refunded, a charge.dispute.created arriving after its own
-- charge.dispute.closed (won) blocked the money again, and a closing event of one dispute cleared the
-- block of another. Now the refund status follows the greatest refunded total recorded, and
-- payment_disputes keeps one row per dispute id: a created event adds a dispute once and never
-- reopens it, a closed event records its status (the last one delivered wins), and the money stays
-- blocked while any dispute of the payment is neither won nor closed as an inquiry (warning_closed).
-- R4-A2: two facts never move back. A dispute recorded as lost stays lost (a later close of the
-- same id changes nothing; a person decides), and a refunded row stays refunded on charge.refunded,
-- as voided and failed do (a lost dispute writes refunded with no refunded total).
-- R4-A1: payment_disputes starts with the disputes the payments rows already record. The code before
-- (20261112010200) kept one dispute per row: chargeback_at while it blocked, chargeback_ref, and
-- chargeback_cents for a formal dispute (none for an inquiry; lost always kept one). Each such row
-- becomes one dispute row, so the next dispute event recomputes the same block, ref and amount.
--
-- refund.failed. The provider can fail a refund after it reported it: the Refund's status becomes
-- failed with a failure_reason, refund.failed is sent, the money goes back to the platform's balance,
-- and the platform must arrange another way to refund (docs.stripe.com/refunds, "Handle failed
-- refunds"). Nothing retries by itself, and nothing here repairs a state: a failed refund is one
-- durable fact and a person.
--   - payment_refund_failures: one row per failed refund id (amount, reason, when), and how the
--     owner arranged it. service_role reads it; only the two functions below write it.
--   - payments.refund_failed_at: set when a failed refund not seen before arrives, cleared when the
--     owner records the arrangement (resolve_refund_failure). The parties may read it (the
--     customer's card says the refund did not go through); a column grant like the other 26.
--   - apply_payment_event: refund.failed changes no status and no refunded total; a failed refund
--     with no recorded ref stays recorded, so refunds_due never sends it again.
--   - resolve_refund_failure(uuid, text): the owner's record of how the refund was arranged.
--   - payments.refund_arranged_at (P3): set by resolve_refund_failure in the same update that clears
--     refund_failed_at, so the customer's card says the refund was made another way. Nothing else
--     writes it; it moves no money and no queue reads it. The parties may read it.
--   - payment_refund_reserved_cents (R4-A3, from 20261115000200): the failed refunds join what
--     refunds hold back from the worker, arranged or not, so a failed refund whose charge.refunded
--     never came still keeps its amount from the transfer.
--   - payment_attention: one line per failed refund until it is arranged, and the "refund sent,
--     not yet confirmed" line leaves out a failed refund.
--
-- Additive under scripts/staging-scan.sh.

begin;

-- ---------------------------------------------------------------------------
-- 1. The column and the two tables.
-- ---------------------------------------------------------------------------
alter table public.payments add column if not exists refund_failed_at timestamptz;
grant select (refund_failed_at) on public.payments to authenticated;
comment on column public.payments.refund_failed_at is
  'When a refund of this payment failed at the provider and is not yet arranged another way. Set by apply_payment_event (a refund.failed for a refund id not seen before), cleared by resolve_refund_failure. The parties may read it.';

alter table public.payments add column if not exists refund_arranged_at timestamptz;
grant select (refund_arranged_at) on public.payments to authenticated;
comment on column public.payments.refund_arranged_at is
  'P3: when the owner last recorded that the failed refunds of this payment were arranged another way. Set only by resolve_refund_failure, in the update that clears refund_failed_at. It moves no money and no queue reads it. The parties may read it.';

create table if not exists public.payment_refund_failures (
  refund_ref     text primary key,
  payment_id     uuid not null references public.payments (id),
  amount_cents   integer,
  failure_reason text,
  failed_at      timestamptz not null default now(),
  arranged_at    timestamptz,
  arranged_note  text
);
create index if not exists payment_refund_failures_payment_id_idx on public.payment_refund_failures (payment_id);
alter table public.payment_refund_failures enable row level security;
revoke all on table public.payment_refund_failures from public, anon, authenticated, service_role;
grant select on table public.payment_refund_failures to service_role;
comment on table public.payment_refund_failures is
  'One row per refund the provider failed (refund.failed), keyed by the Refund id: its amount, failure_reason and when it was first seen; arranged_at and arranged_note when the owner recorded how it was refunded another way (resolve_refund_failure). Written only by apply_payment_event and resolve_refund_failure; service_role reads it.';

create table if not exists public.payment_disputes (
  dispute_ref  text primary key,
  payment_id   uuid not null references public.payments (id),
  amount_cents integer,
  status       text not null,
  opened_at    timestamptz not null default now(),
  closed_at    timestamptz
);
create index if not exists payment_disputes_payment_id_idx on public.payment_disputes (payment_id);
alter table public.payment_disputes enable row level security;
revoke all on table public.payment_disputes from public, anon, authenticated, service_role;
grant select on table public.payment_disputes to service_role;
comment on table public.payment_disputes is
  'One row per card dispute (or inquiry) of a payment, keyed by the Dispute id. charge.dispute.created adds it once and never reopens it; charge.dispute.closed records its status (the last one delivered wins, but lost stays lost). The money stays blocked while any dispute of the payment is neither won nor warning_closed. Written only by apply_payment_event; service_role reads it.';

-- R4-A1: the disputes the rows already record. A row still blocked keeps its block: an inquiry (no
-- amount) as warning_needs_response, a dispute on a row whose money went back (lost wrote refunded,
-- or left voided or failed) as lost, any other as needs_response. A row whose block was cleared (won
-- or warning_closed) keeps only its ref, as a closed won dispute. A block with no ref gets one built
-- from the payment id.
insert into public.payment_disputes (dispute_ref, payment_id, amount_cents, status, opened_at, closed_at)
select coalesce(p.chargeback_ref, 'imported:' || p.id::text), p.id, p.chargeback_cents,
       case when p.chargeback_at is null then 'won'
            when p.chargeback_cents is null then 'warning_needs_response'
            when p.status in ('refunded', 'partially_refunded', 'voided', 'failed') then 'lost'
            else 'needs_response' end,
       coalesce(p.chargeback_at, p.updated_at),
       case when p.chargeback_at is null then p.updated_at end
  from public.payments p
 where p.chargeback_at is not null or p.chargeback_ref is not null
on conflict (dispute_ref) do nothing;

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
  v_fail_new    boolean := false;  -- F2: a refund.failed for a refund id not recorded before
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

      -- F2: one row per failed refund id, whatever the number of events naming it (the 90-day
      -- prune empties payloads, never this row). Only a refund id not recorded before raises
      -- refund_failed_at.
      if v_type = 'refund.failed' then
        insert into public.payment_refund_failures (refund_ref, payment_id, amount_cents, failure_reason)
        values (v_obj ->> 'id', v_payment.id, nullif(v_obj ->> 'amount', '')::integer,
                nullif(v_obj ->> 'failure_reason', ''))
        on conflict (refund_ref) do nothing;
        v_fail_new := found;
      end if;

      -- A5: one row per dispute id. A created event adds it once and never reopens it; a closed
      -- event records its status, the last one delivered wins, except that a dispute recorded as
      -- lost stays lost (R4-A2: a later close of the same id changes nothing; a person decides).
      if v_type = 'charge.dispute.created' then
        insert into public.payment_disputes (dispute_ref, payment_id, amount_cents, status)
        values (v_obj ->> 'id', v_payment.id, nullif(v_obj ->> 'amount', '')::integer, coalesce(v_dispute, 'unknown'))
        on conflict (dispute_ref) do nothing;
      elsif v_type = 'charge.dispute.closed' then
        insert into public.payment_disputes as d (dispute_ref, payment_id, amount_cents, status, closed_at)
        values (v_obj ->> 'id', v_payment.id, nullif(v_obj ->> 'amount', '')::integer, coalesce(v_dispute, 'unknown'), now())
        on conflict (dispute_ref) do update
          set status       = case when d.status = 'lost' then d.status else excluded.status end,
              closed_at    = coalesce(d.closed_at, excluded.closed_at),
              amount_cents = coalesce(excluded.amount_cents, d.amount_cents);
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
            -- R4-A2: refunded stays refunded (a lost dispute writes it with no refunded total).
            (case when v_refunded is null then status
                  when status in ('voided', 'failed', 'refunded') then status
                  when greatest(coalesce(refunded_cents, 0), v_refunded) >= charge_amount_cents then 'refunded'
                  else 'partially_refunded' end)
          -- F2: refund.failed has no arm: a person arranges the refund (payment_refund_failures).
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
                            then coalesce(v_obj -> 'refunds' -> 'data' -> 0 ->> 'id', refund_ref)
                            -- F2: a failed refund with no recorded ref must not pass the reopen checks.
                            when v_type = 'refund.failed' then coalesce(refund_ref, v_obj ->> 'id')
                            else refund_ref end,
        -- B16: the charge's running refunded total, never lowered by an older event.
        refunded_cents = case when v_type = 'charge.refunded' and v_refunded is not null
                              then greatest(coalesce(refunded_cents, 0), v_refunded) else refunded_cents end,
        -- F2: raised by a failed refund id not recorded before; cleared only by resolve_refund_failure.
        refund_failed_at = case when v_fail_new then coalesce(refund_failed_at, now()) else refund_failed_at end,
        -- A5, B13: drawn from payment_disputes. The money stays blocked while any dispute of the payment
        -- is neither won nor warning_closed; chargeback_ref names the newest such dispute, else this
        -- event's; chargeback_cents adds up the disputes that are neither inquiries nor won.
        chargeback_ref = case when v_type in ('charge.dispute.created', 'charge.dispute.closed')
                              then coalesce((select d.dispute_ref from public.payment_disputes d
                                              where d.payment_id = v_payment.id and d.status not in ('won', 'warning_closed')
                                              order by d.opened_at desc, d.dispute_ref desc limit 1),
                                            v_obj ->> 'id')
                              else chargeback_ref end,
        chargeback_at  = case when v_type in ('charge.dispute.created', 'charge.dispute.closed')
                              then (case when exists (select 1 from public.payment_disputes d
                                                       where d.payment_id = v_payment.id and d.status not in ('won', 'warning_closed'))
                                         then coalesce(chargeback_at, now()) end)
                              else chargeback_at end,
        chargeback_cents = case when v_type in ('charge.dispute.created', 'charge.dispute.closed')
                                then (select sum(coalesce(d.amount_cents, v_payment.charge_amount_cents))::integer
                                        from public.payment_disputes d
                                       where d.payment_id = v_payment.id and d.status not like 'warning\_%' and d.status <> 'won')
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
  'service_role only: applies one stored provider event to its payments row, idempotently. R5b (E-6): a payment_intent.succeeded on a voided or failed row queues a full refund (refund_reason funded_after_void). B1: a payment_intent.succeeded on an unfunded tip holds it and queues the whole tip for transfer when amount_received equals charge_amount_cents. 20261112010200: received_cents, refunded_cents and chargeback_cents record the provider''s facts; a job payment charged a different amount stays held with last_error; transfers are recorded once in payment_transfers (payment_record_transfer / payment_record_reversal); a card dispute clears its block only when won or when an inquiry closes (warning_closed), lost refunds the row, any other closing status keeps the block for a person; payment_intent.payment_failed changes nothing. 20261115000600: every rule reads only this event and durable rows, never another event''s payload; the refund status follows the greatest refunded total and refunded stays refunded; payment_disputes keeps one row per dispute id (created adds it once, closed records its status, the last delivered wins, but lost stays lost) and the money stays blocked while any dispute of the payment is neither won nor warning_closed; refund.failed records the failed refund once per refund id in payment_refund_failures, raises refund_failed_at for a new one, keeps the failed refund in refund_ref when none was recorded, and changes no status and no refunded total.';

-- ---------------------------------------------------------------------------
-- 3. resolve_refund_failure(uuid, text): the owner's record that the failed refunds of a payment
--    were arranged another way (a refund by hand in Stripe, a bank transfer). Moves no money.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_refund_failure(p_payment_id uuid, p_note text)
returns public.payments
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_pay public.payments;
begin
  if nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'Say how the refund was arranged (p_note)';
  end if;
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  update public.payment_refund_failures
     set arranged_at = now(), arranged_note = btrim(p_note)
   where payment_id = p_payment_id and arranged_at is null;
  if not found then raise exception 'This payment has no failed refund waiting'; end if;
  update public.payments set refund_failed_at = null, refund_arranged_at = now(), updated_at = now()
   where id = p_payment_id
  returning * into v_pay;
  return v_pay;
end $fn$;
revoke all on function public.resolve_refund_failure(uuid, text) from public, anon, authenticated;
grant execute on function public.resolve_refund_failure(uuid, text) to service_role;
comment on function public.resolve_refund_failure(uuid, text) is
  'service_role only: the owner records how the failed refunds of a payment were arranged another way (p_note, required). Every failure of the payment still waiting gets arranged_at and the note; refund_failed_at clears and refund_arranged_at is stamped (P3), in one update. Refused when the note is empty, the payment is unknown, or nothing is waiting. Moves no money and changes no status; a later refund.failed for a refund id not recorded before raises it again.';

-- ---------------------------------------------------------------------------
-- 3a. payment_refund_reserved_cents(payments), replaced from 20261115000200 (R4-A3): the failed
--     refunds join the reservation. Same signature, search_path and ACL (restated).
-- ---------------------------------------------------------------------------
-- Bound: a failure of the row's own refund is already inside refund_cents; a failed refund on top of an own refund is under-counted only if its charge.refunded never arrives.
create or replace function public.payment_refund_reserved_cents(p public.payments)
returns integer
language sql stable
set search_path = public, pg_temp
as $fn$
  select greatest(coalesce(p.refunded_cents, 0), coalesce(p.refund_cents, 0),
                  coalesce((select sum(coalesce(f.amount_cents, p.charge_amount_cents))::integer
                              from public.payment_refund_failures f where f.payment_id = p.id), 0))
$fn$;
revoke all on function public.payment_refund_reserved_cents(public.payments) from public, anon, authenticated;
grant execute on function public.payment_refund_reserved_cents(public.payments) to service_role;
comment on function public.payment_refund_reserved_cents(public.payments) is
  'R4-A3: how much of the charge refunds hold back from the worker: the greatest of the refunded total, the refund asked for and the sum of the payment''s failed refunds (arranged or not; one with no amount counts as the whole charge). No transfer is due above charge minus this. Read by transfers_due and payment_attention.';

-- ---------------------------------------------------------------------------
-- 4. payment_attention, replaced whole from 20261112010400_payment_attention.sql. F2: one line
--    per failed refund until it is arranged (resolve_refund_failure), and the "refund sent, not yet
--    confirmed" line leaves out a failed refund. R4-A3: "more than is left after refunds" reads
--    payment_refund_reserved_cents, as transfers_due does. Same columns and ACL (restated).
-- ---------------------------------------------------------------------------
create or replace view public.payment_attention as
  with tw as (
    -- Transfers asked for and not recorded.
    select p.*,
           exists (select 1 from public.transfers_ready r where r.id = p.id) as ready,
           public.settlement_attempt_closed(p.transfer_attempts, p.transfer_sent_attempt, p.transfer_sent_at, p.transfer_stopped_at) as closed,
           public.payment_refund_reserved_cents(p) as reserved
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
           when tw.transfer_cents > tw.charge_amount_cents - tw.reserved
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
     and p.status not in ('refunded', 'partially_refunded')
     and not exists (select 1 from public.payment_refund_failures f where f.refund_ref = p.refund_ref)
  union all
  -- F2: each refund the provider failed, until the owner records how it was arranged. Nothing
  -- retries by itself and nothing here moves money.
  select f.payment_id, p.job_id, 'refund',
         'refund ' || f.refund_ref || ' failed at the provider (' || coalesce(f.failure_reason, 'no reason given')
           || '): the money is back in the Stripe balance. Arrange the refund another way, then record it with resolve_refund_failure',
         f.failed_at, true, f.amount_cents, p.last_error
    from public.payment_refund_failures f join public.payments p on p.id = f.payment_id
   where f.arranged_at is null
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
  'Money rule 4, the owner''s one query: select * from public.payment_attention order by since; Every payment the system will not move by itself, one line per reason: transfers and refunds asked for and not ready (stopped, 23 hours without an answer, a reversal park, a card dispute, an issue report, another amount, a status, more than is left, no payout account, no payment intent), rows retrying with an error, refunds sent and not confirmed, each refund the provider failed until resolve_refund_failure records how it was arranged (20261115000600), money short, partial reversals, card disputes still open, held job payments on jobs still assigned or in_progress 7 days after their date (or hire), open issue reports (overdue after 2 business days, America/New_York) and webhook events that could not be applied. service_role only.';

commit;
