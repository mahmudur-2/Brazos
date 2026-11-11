-- 20261112010300_settlement_guards.sql — lean B16, B18 (part 2 of 2): one attempt = one key,
-- and the queues never offer money that is not there. Spec: docs/critical/money-safety.md.
--
-- WHAT WAS WRONG.
--   B16: process-settlements sent a transfer or refund and wrote nothing back; the row stayed
--        queued until its webhook landed, and the same key went out every five minutes. The
--        provider forgets a key after 24 hours, so a stalled webhook meant a second transfer.
--   B18: transfers_due never looked at status: a charge refunded, or lost to a card dispute,
--        after the release was requested was still transferred. refunds_due did not look at
--        what had already gone to the worker.
--
-- WHAT CHANGES.
-- 1. Rows already queued get a clock (G): transfer_sent_attempt = transfer_attempts and
--    transfer_sent_at = release_requested_at; refund_sent_attempt = refund_attempts and
--    refund_sent_at = created_at. Both are the earliest moment the current key can have been
--    used, so a row queued more than 23 hours ago stops at once and shows in payment_attention
--    (20261112010400). Production starts empty; staging test rows are the only ones affected.
-- 2. settlement_attempt_closed(): the current attempt was stopped, or its key was first used
--    more than 23 hours ago. One definition for both queues and payment_attention.
-- 3. transfers_due and refunds_due keep every clause they had and add the money guards. A view
--    keeps its column list, so `select p.*` APPENDS the new payments columns. transfers_ready and
--    refunds_ready (select t.* / r.* over them) are restated unchanged, so they append the same
--    columns and still carry their queue's columns in its order (220_settlement_ready.sql 5f).
-- 4. The drain's three RPCs, service_role only: settlement_send_begin (step 1),
--    record_settlement_sent (step 3, a 2xx; also the owner's "the transfer exists"),
--    record_settlement_result (step 3, everything else). And the owner's
--    settlement_send_reopen ("it does not exist"). None can move money.
-- 5. record_settlement_attempt (the R6b recorder the drain used before this file): copied from
--    20260920000000_settlement_retry.sql §3 with one change: it never rotates the key after a
--    401, a 403 or an idempotency error, so a drain deployed before this file cannot pay twice
--    while the new one is on its way.
--
-- Additive under scripts/staging-scan.sh. Proof: supabase/tests/370_money_conservation.sql.

begin;

-- ---------------------------------------------------------------------------
-- 1. The clocks of rows already queued (read through the queues as they were).
-- ---------------------------------------------------------------------------
update public.payments p
   set transfer_sent_attempt = p.transfer_attempts,
       transfer_sent_at      = p.release_requested_at
 where p.id in (select d.id from public.transfers_due d)
   and p.transfer_sent_attempt is null;

update public.payments p
   set refund_sent_attempt = p.refund_attempts,
       refund_sent_at      = p.created_at
 where p.id in (select d.id from public.refunds_due d)
   and p.refund_sent_attempt is null;

-- ---------------------------------------------------------------------------
-- 2. The clock.
-- ---------------------------------------------------------------------------
create or replace function public.settlement_attempt_closed(
  p_attempt integer, p_sent_attempt integer, p_sent_at timestamptz, p_stopped_at timestamptz)
returns boolean
language sql stable
set search_path = public, pg_temp
as $fn$
  select coalesce(p_sent_attempt = p_attempt
                  and (p_stopped_at is not null or p_sent_at < now() - interval '23 hours'), false)
$fn$;
revoke all on function public.settlement_attempt_closed(integer, integer, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.settlement_attempt_closed(integer, integer, timestamptz, timestamptz) to service_role;
comment on function public.settlement_attempt_closed(integer, integer, timestamptz, timestamptz) is
  'B16: true when the current attempt (p_attempt) is the one whose key was first used at p_sent_at and it was stopped, or that use is more than 23 hours old (the provider forgets a key after 24). A closed attempt is never sent again; only settlement_send_reopen, or a new attempt number, opens the row. Read by transfers_due, refunds_due and payment_attention.';

-- ---------------------------------------------------------------------------
-- 3. The queues.
-- ---------------------------------------------------------------------------
create or replace view public.transfers_due as
  select p.*
    from public.payments p
   where p.provider = 'stripe'
     and p.release_requested_at is not null
     and p.transfer_ref is null
     and p.transfer_reversed_at is null
     and coalesce(p.transfer_cents, 0) > 0
     -- DIVERGENCE (safety, beyond D11's predicate): an open in-app dispute
     -- freezes the transfer as it freezes the release.
     and not exists (select 1 from public.job_disputes d where d.job_id = p.job_id and d.status = 'open')
     -- B18: the charge is still there: held, or partly refunded by a late cancellation.
     and p.status in ('held', 'partially_refunded')
     -- B13: no card dispute holds the money.
     and p.chargeback_at is null
     -- B17: the charge collected what the row says.
     and coalesce(p.received_cents, p.charge_amount_cents) = p.charge_amount_cents
     -- B18: never more than is left after refunds, asked for or landed.
     and p.transfer_cents <= p.charge_amount_cents - greatest(coalesce(p.refunded_cents, 0), coalesce(p.refund_cents, 0))
     -- B16: no live transfer is recorded for this payment.
     and not exists (select 1 from public.payment_transfers t
                      where t.payment_id = p.id and t.reversed_cents < t.amount_cents)
     -- B16: the current attempt is neither stopped nor past its 23 hours.
     and not public.settlement_attempt_closed(p.transfer_attempts, p.transfer_sent_attempt, p.transfer_sent_at, p.transfer_stopped_at)
   order by p.release_requested_at;
revoke all on table public.transfers_due from public, anon, authenticated;
grant select on table public.transfers_due to service_role;
comment on view public.transfers_due is
  'stripe rows whose transfer to the worker may be sent: release requested, not yet transferred, not parked by a reversal, transfer_cents > 0, no open issue report; and (20261112010300) held or partially_refunded, no card dispute, charged the row''s amount, transfer_cents within what is left after refunds, no live transfer recorded, and the current attempt neither stopped nor past 23 hours. process-settlements transfers transfer_cents with idempotency key tr:<id>:<transfer_attempts>. Every row asked for and not here is in payment_attention.';

create or replace view public.refunds_due as
  select p.*
    from public.payments p
   where p.provider = 'stripe'
     and coalesce(p.refund_cents, 0) > 0
     and p.refund_ref is null
     -- DIVERGENCE (safety): a row already refunded without a recorded ref
     -- (a hand refund in the dashboard) is not refunded twice.
     and p.status <> 'refunded'
     -- B16: allow-list of the states a refund is sent from.
     and p.status in ('held', 'released', 'paid_out', 'voided', 'failed')
     -- B16: nothing refunded yet (a partial refund already landed needs a person).
     and coalesce(p.refunded_cents, 0) = 0
     -- B13: no card dispute holds the money.
     and p.chargeback_at is null
     -- B17: the charge collected what the row says.
     and coalesce(p.received_cents, p.charge_amount_cents) = p.charge_amount_cents
     -- B18: never more than is left after what went to the worker.
     and p.refund_cents <= p.charge_amount_cents
           - (select coalesce(sum(t.amount_cents - t.reversed_cents), 0)::integer
                from public.payment_transfers t where t.payment_id = p.id)
     -- B16: the current attempt is neither stopped nor past its 23 hours.
     and not public.settlement_attempt_closed(p.refund_attempts, p.refund_sent_attempt, p.refund_sent_at, p.refund_stopped_at)
   order by p.updated_at;
revoke all on table public.refunds_due from public, anon, authenticated;
grant select on table public.refunds_due to service_role;
comment on view public.refunds_due is
  'stripe rows whose refund to the customer may be sent: refund_cents > 0 and no refund recorded yet; and (20261112010300) in an allow-listed state, nothing refunded yet, no card dispute, charged the row''s amount, refund_cents within what is left after live transfers, and the current attempt neither stopped nor past 23 hours. process-settlements refunds refund_cents against the charge with idempotency key rf:<id>:<refund_attempts>. Every row asked for and not here is in payment_attention.';

-- The ready views, restated word for word (20261003001100 and 20261003000000); their comments stay.
create or replace view public.transfers_ready as
  select t.*
    from public.transfers_due t
   where exists (
           select 1
             from public.payment_accounts a
            where a.user_id = t.payee_id
              and a.payouts_enabled
              and a.stripe_account_id is not null
         )
   order by t.transfer_attempts, t.release_requested_at;
revoke all on table public.transfers_ready from public, anon, authenticated;
grant select on table public.transfers_ready to service_role;

create or replace view public.refunds_ready as
  select r.*
    from public.refunds_due r
   where r.provider_ref is not null
   order by r.updated_at;
revoke all on table public.refunds_ready from public, anon, authenticated;
grant select on table public.refunds_ready to service_role;

-- ---------------------------------------------------------------------------
-- 4. The drain's RPCs and the owner's two answers.
-- ---------------------------------------------------------------------------
create or replace function public.settlement_send_begin(p_payment_id uuid, p_kind text, p_attempt integer)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_pay public.payments;
begin
  if p_kind is distinct from 'transfer' and p_kind is distinct from 'refund' then
    raise exception 'settlement_send_begin: unknown kind %; transfer or refund only', coalesce(p_kind, '<null>');
  end if;
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then return false; end if;

  if p_kind = 'transfer' then
    if p_attempt is distinct from v_pay.transfer_attempts then return false; end if;
    if not exists (select 1 from public.transfers_ready r where r.id = p_payment_id) then return false; end if;
    if v_pay.transfer_sent_attempt is distinct from v_pay.transfer_attempts then
      update public.payments
         set transfer_sent_attempt = transfer_attempts, transfer_sent_at = now()
       where id = p_payment_id;
    end if;
  else
    if p_attempt is distinct from v_pay.refund_attempts then return false; end if;
    if not exists (select 1 from public.refunds_ready r where r.id = p_payment_id) then return false; end if;
    if v_pay.refund_sent_attempt is distinct from v_pay.refund_attempts then
      update public.payments
         set refund_sent_attempt = refund_attempts, refund_sent_at = now()
       where id = p_payment_id;
    end if;
  end if;
  return true;
end $fn$;
revoke all on function public.settlement_send_begin(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.settlement_send_begin(uuid, text, integer) to service_role;
comment on function public.settlement_send_begin(uuid, text, integer) is
  'service_role only, step 1 of process-settlements per row: true when the row is still in transfers_ready / refunds_ready for exactly this attempt; on the attempt''s first use it records transfer_sent_attempt/at (refund_sent_attempt/at), which starts its 23-hour clock. false = do not send. Moves no money.';

create or replace function public.record_settlement_sent(p_payment_id uuid, p_kind text, p_ref text, p_amount_cents integer)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_pay public.payments;
begin
  if p_kind is distinct from 'transfer' and p_kind is distinct from 'refund' then
    raise exception 'record_settlement_sent: unknown kind %; transfer or refund only', coalesce(p_kind, '<null>');
  end if;
  if p_ref is null or btrim(p_ref) = '' then raise exception 'record_settlement_sent: the provider id is required'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'record_settlement_sent: the amount must be a positive number of cents';
  end if;
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found or v_pay.provider <> 'stripe' then raise exception 'Payment not found'; end if;

  if p_kind = 'transfer' then
    if p_ref not like 'tr\_%' then raise exception 'A transfer id starts with tr_'; end if;
    if v_pay.release_requested_at is null or coalesce(v_pay.transfer_cents, 0) <= 0 then
      raise exception 'This payment never asked for a transfer';
    end if;
    return public.payment_record_transfer(p_payment_id, p_ref, p_amount_cents);
  end if;

  if p_ref not like 're\_%' and p_ref not like 'pyr\_%' then raise exception 'A refund id starts with re_'; end if;
  if coalesce(v_pay.refund_cents, 0) <= 0 then raise exception 'This payment never asked for a refund'; end if;
  if p_amount_cents > v_pay.charge_amount_cents then raise exception 'A refund cannot be larger than the charge'; end if;
  if v_pay.refund_ref = p_ref then return false; end if;
  if v_pay.refund_ref is not null then raise exception 'A different refund is already recorded for this payment'; end if;
  update public.payments set refund_ref = p_ref, updated_at = now() where id = p_payment_id;
  return true;
end $fn$;
revoke all on function public.record_settlement_sent(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.record_settlement_sent(uuid, text, text, integer) to service_role;
comment on function public.record_settlement_sent(uuid, text, text, integer) is
  'service_role only. Records that the provider made this transfer (tr_...) or refund (re_...) for the payment: the drain''s write-back of a 2xx, and the owner''s answer "the transfer exists" after a look in Stripe. A transfer goes through payment_record_transfer (recorded once; held -> released when nothing is being refunded); a refund sets refund_ref (charge.refunded still settles the status). Returns true when newly recorded, false when already recorded. Refuses a payment that never asked for that kind, an id of the wrong shape, an id recorded on another payment, and a refund when a different one is recorded. Moves no money.';

create or replace function public.record_settlement_result(
  p_payment_id uuid, p_kind text, p_attempt integer, p_next text, p_error text)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_pay public.payments;
begin
  if p_kind is distinct from 'transfer' and p_kind is distinct from 'refund' then
    raise exception 'record_settlement_result: unknown kind %; transfer or refund only', coalesce(p_kind, '<null>');
  end if;
  if p_next is null or p_next not in ('new_key', 'same_key', 'stop') then
    raise exception 'record_settlement_result: unknown next step %; new_key, same_key or stop only', coalesce(p_next, '<null>');
  end if;
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then return false; end if;

  if p_kind = 'transfer' then
    -- A stale answer (the attempt moved on meanwhile) changes nothing.
    if p_attempt is distinct from v_pay.transfer_attempts then return false; end if;
    update public.payments set
      transfer_attempts     = transfer_attempts + (case when p_next = 'new_key' then 1 else 0 end),
      transfer_sent_at      = case when p_next = 'stop' and transfer_sent_attempt is distinct from transfer_attempts
                                   then now() else transfer_sent_at end,
      transfer_sent_attempt = case when p_next = 'stop' then transfer_attempts else transfer_sent_attempt end,
      transfer_stopped_at   = case when p_next = 'stop' then now() else transfer_stopped_at end,
      last_error            = left('transfer: ' || coalesce(p_error, ''), 500),
      updated_at            = now()
    where id = p_payment_id;
  else
    if p_attempt is distinct from v_pay.refund_attempts then return false; end if;
    update public.payments set
      refund_attempts     = refund_attempts + (case when p_next = 'new_key' then 1 else 0 end),
      refund_sent_at      = case when p_next = 'stop' and refund_sent_attempt is distinct from refund_attempts
                                 then now() else refund_sent_at end,
      refund_sent_attempt = case when p_next = 'stop' then refund_attempts else refund_sent_attempt end,
      refund_stopped_at   = case when p_next = 'stop' then now() else refund_stopped_at end,
      last_error          = left('refund: ' || coalesce(p_error, ''), 500),
      updated_at          = now()
    where id = p_payment_id;
  end if;
  return true;
end $fn$;
revoke all on function public.record_settlement_result(uuid, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.record_settlement_result(uuid, text, integer, text, text) to service_role;
comment on function public.record_settlement_result(uuid, text, integer, text, text) is
  'service_role only, step 3 of process-settlements for every answer that is not a 2xx: new_key (a refusal: the attempt counter + 1, the next tick sends a new key), same_key (unknown: the same key next tick, until 23 hours after its first use), stop (the row stops and shows in payment_attention). Always last_error and updated_at. An answer for an attempt that is no longer current returns false and changes nothing. Moves no money.';

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
    if v_pay.refund_ref is not null or coalesce(v_pay.refunded_cents, 0) > 0
       or v_pay.status in ('refunded', 'partially_refunded') then
      raise exception 'A refund is recorded for this payment; nothing to reopen';
    end if;
    if not public.settlement_attempt_closed(v_pay.refund_attempts, v_pay.refund_sent_attempt,
                                            v_pay.refund_sent_at, v_pay.refund_stopped_at) then
      raise exception 'Nothing to reopen: the current refund attempt is neither stopped nor past its 23 hours';
    end if;
    update public.payments set
      refund_attempts   = refund_attempts + 1,
      refund_stopped_at = null,
      last_error        = 'refund: reopened by the owner after a look in Stripe',
      updated_at        = now()
    where id = p_payment_id;
  end if;
  return true;
end $fn$;
revoke all on function public.settlement_send_reopen(uuid, text) from public, anon, authenticated;
grant execute on function public.settlement_send_reopen(uuid, text) to service_role;
comment on function public.settlement_send_reopen(uuid, text) is
  'service_role only: the owner''s answer "it does not exist" after a look in Stripe for a stopped or 23-hour-old attempt. Starts a NEW attempt (counter + 1, so a new key) and clears the stop. Refused when a live transfer or a refund is recorded for the payment, when the payment never asked for that kind, or when the current attempt is still open. Moves no money itself; the drain sends on its next tick.';

-- ---------------------------------------------------------------------------
-- 5. The R6b recorder, for a drain deployed before this file.
-- ---------------------------------------------------------------------------
create or replace function public.record_settlement_attempt(
  p_payment_id uuid,
  p_kind text,
  p_rotate boolean,
  p_error text
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rows integer := 0;
  -- B16: a 401 or 403 is answered before the key is looked at, and an idempotency error
  -- means the key was used with other parameters: neither proves the key created nothing,
  -- so neither rotates it.
  v_rotate boolean := coalesce(p_rotate, false)
                      and coalesce(p_error, '') !~ '^(401|403)\M'
                      and coalesce(p_error, '') !~* 'idempot';
begin
  -- Allow-list, never block-list: the two kinds this function knows and
  -- nothing else. A null kind lands here too.
  if p_kind is distinct from 'transfer' and p_kind is distinct from 'refund' then
    raise exception 'record_settlement_attempt: unknown kind %; transfer or refund only', coalesce(p_kind, '<null>');
  end if;

  -- Two statements rather than one with a CASE per counter, so that a
  -- transfer record never NAMES refund_attempts and a refund record never
  -- names transfer_attempts. Nothing else on the row is in either SET list.
  if p_kind = 'transfer' then
    update public.payments
       set transfer_attempts = transfer_attempts + (case when v_rotate then 1 else 0 end),
           last_error        = left(p_kind || ': ' || coalesce(p_error, ''), 500),
           updated_at        = now()
     where id = p_payment_id;
  else
    update public.payments
       set refund_attempts = refund_attempts + (case when v_rotate then 1 else 0 end),
           last_error      = left(p_kind || ': ' || coalesce(p_error, ''), 500),
           updated_at      = now()
     where id = p_payment_id;
  end if;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;
revoke all on function public.record_settlement_attempt(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.record_settlement_attempt(uuid, text, boolean, text) to service_role;
comment on function public.record_settlement_attempt(uuid, text, boolean, text) is
  'service_role only (R6b process-settlements, before 20261112010300): records one failed settlement attempt on a payments row. ALWAYS sets last_error = left(kind || '': '' || error, 500) and updated_at = now(); when p_rotate is true also increments the kind''s attempt counter by exactly 1, except (B16) after a 401, a 403 or an idempotency error, which never prove the key created nothing. Touches nothing else and can never move money. Returns true when a payments row matched, false otherwise; any kind other than transfer or refund raises. The current drain records through record_settlement_result instead.';

commit;
