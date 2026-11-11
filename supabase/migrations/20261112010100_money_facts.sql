-- 20261112010100_money_facts.sql — lean B16, B18 (part 1 of 2): the ledger records what the
-- provider says HAPPENED to the money, next to what the database ASKED for.
-- Spec: docs/critical/money-safety.md.
--
-- WHAT WAS WRONG. payments holds intent (transfer_cents, refund_cents) and one ref per kind. A
-- second transfer, a partly reversed transfer, the amount a charge really collected, a refund
-- or a lost card dispute that took money back: none of these was stored as a number, so no
-- guard could ask "is there money left to send?".
--
-- WHAT CHANGES (additive only).
-- 1. payments gains the provider's facts and each attempt's clock:
--      received_cents      payment_intent.succeeded's amount_received
--      refunded_cents      charge.refunded's amount_refunded (the charge's running total)
--      chargeback_cents    a card dispute's amount while the network holds it
--      transfer_sent_attempt, transfer_sent_at   the attempt whose key was first used, and when
--      transfer_stopped_at  that attempt ended in an answer that needs a person
--      refund_sent_attempt, refund_sent_at, refund_stopped_at   the same for refunds
--    All null on every existing row; 20261112010300 seeds the clocks of rows already queued.
-- 2. payment_transfers: one row per provider transfer (its id is the key), its amount and how
--    much of it was reversed. A transfer is LIVE while reversed_cents < amount_cents.
-- 3. payment_record_transfer / payment_record_reversal: the one writer of payment_transfers
--    and of the transfer columns on payments, shared by apply_payment_event (the webhook) and
--    record_settlement_sent (the drain's write-back and the owner's answer).
--
-- Additive under scripts/staging-scan.sh.

begin;

-- ---------------------------------------------------------------------------
-- 1. The facts and the clocks.
-- ---------------------------------------------------------------------------
alter table public.payments
  add column if not exists received_cents integer,
  add column if not exists refunded_cents integer,
  add column if not exists chargeback_cents integer,
  add column if not exists transfer_sent_attempt integer,
  add column if not exists transfer_sent_at timestamptz,
  add column if not exists transfer_stopped_at timestamptz,
  add column if not exists refund_sent_attempt integer,
  add column if not exists refund_sent_at timestamptz,
  add column if not exists refund_stopped_at timestamptz;

alter table public.payments add constraint payments_money_facts_not_negative check (
      (received_cents is null or received_cents >= 0)
  and (refunded_cents is null or refunded_cents >= 0)
  and (chargeback_cents is null or chargeback_cents >= 0)
  and (transfer_sent_attempt is null or transfer_sent_attempt >= 0)
  and (refund_sent_attempt is null or refund_sent_attempt >= 0));

comment on column public.payments.received_cents is
  'B16: what the provider says the charge collected (payment_intent.succeeded amount_received). Null when not reported (rows from before 20261112010100): the guards then take charge_amount_cents. A row whose received amount differs from charge_amount_cents is never transferred or refunded by the drain; it shows in payment_attention.';
comment on column public.payments.refunded_cents is
  'B16: what the provider says was refunded on the charge, its running total (charge.refunded amount_refunded, never lowered). Null = nothing reported.';
comment on column public.payments.chargeback_cents is
  'B13: the amount a formal card dispute took back (charge.dispute.created, not an inquiry). Cleared when the dispute is won or the inquiry closes; kept when lost.';
comment on column public.payments.transfer_sent_attempt is
  'B16: the transfer attempt (transfer_attempts value) whose key tr:<id>:<attempt> was first used at transfer_sent_at. Set by settlement_send_begin.';
comment on column public.payments.transfer_sent_at is
  'B16: when the current transfer attempt''s key was first used. 23 hours later the attempt is closed (the provider forgets a key after 24) and the row shows in payment_attention.';
comment on column public.payments.transfer_stopped_at is
  'B16: when the attempt in transfer_sent_attempt ended in an answer that needs a person (record_settlement_result stop). Applies to that attempt only.';
comment on column public.payments.refund_sent_attempt is
  'B16: the refund attempt (refund_attempts value) whose key rf:<id>:<attempt> was first used at refund_sent_at. Set by settlement_send_begin.';
comment on column public.payments.refund_sent_at is
  'B16: when the current refund attempt''s key was first used; closed 23 hours later, as transfer_sent_at.';
comment on column public.payments.refund_stopped_at is
  'B16: when the attempt in refund_sent_attempt ended in an answer that needs a person. Applies to that attempt only.';

-- ---------------------------------------------------------------------------
-- 2. One row per provider transfer.
-- ---------------------------------------------------------------------------
create table if not exists public.payment_transfers (
  transfer_ref   text primary key,
  payment_id     uuid not null references public.payments (id),
  amount_cents   integer not null check (amount_cents > 0),
  reversed_cents integer not null default 0 check (reversed_cents >= 0 and reversed_cents <= amount_cents),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists payment_transfers_payment_id_idx on public.payment_transfers (payment_id);
alter table public.payment_transfers enable row level security;
revoke all on table public.payment_transfers from public, anon, authenticated, service_role;
grant select on table public.payment_transfers to service_role;
comment on table public.payment_transfers is
  'B16: every transfer the provider made for a payment, keyed by its id (tr_...), with its amount and how much was reversed. Live while reversed_cents < amount_cents. Written only by payment_record_transfer and payment_record_reversal; read by the queues, payment_money and payment_attention. service_role reads; no client access.';

-- ---------------------------------------------------------------------------
-- 3. The writers.
-- ---------------------------------------------------------------------------
create or replace function public.payment_record_transfer(p_payment_id uuid, p_ref text, p_amount_cents integer)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_pay public.payments;
  v_t   public.payment_transfers;
  v_new boolean := false;
begin
  if p_ref is null or btrim(p_ref) = '' then raise exception 'A transfer needs its provider id'; end if;
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;

  select * into v_t from public.payment_transfers where transfer_ref = p_ref for update;
  if found and v_t.payment_id <> p_payment_id then
    raise exception 'Transfer % is recorded on another payment', p_ref;
  end if;
  if not found and coalesce(p_amount_cents, 0) > 0 then
    insert into public.payment_transfers (transfer_ref, payment_id, amount_cents)
    values (p_ref, p_payment_id, p_amount_cents)
    returning * into v_t;
    v_new := true;
  end if;

  -- Live (or no amount known, the pre-B16 event shape): what transfer.created always did.
  -- A transfer already fully reversed changes nothing, so a late transfer.created cannot
  -- un-park a row.
  if v_t.transfer_ref is null or v_t.reversed_cents < v_t.amount_cents then
    update public.payments set
      status       = (case when status = 'held' and coalesce(refund_cents, 0) = 0 then 'released' else status end)::public.payment_status,
      released_at  = coalesce(released_at, now()),
      transfer_ref = coalesce(transfer_ref, p_ref),
      updated_at   = now()
    where id = p_payment_id;
  end if;
  return v_new;
end $fn$;
revoke all on function public.payment_record_transfer(uuid, text, integer) from public, anon, authenticated, service_role;
comment on function public.payment_record_transfer(uuid, text, integer) is
  'B16: records one provider transfer for a payment, once (payment_transfers keyed by its id), and, while it is live, what transfer.created always did: held -> released when nothing is being refunded, released_at, transfer_ref. Returns true when the transfer was new. Raises when the id belongs to another payment. Called by apply_payment_event and record_settlement_sent only; no client grant.';

create or replace function public.payment_record_reversal(p_payment_id uuid, p_ref text, p_amount_cents integer, p_reversed_cents integer)
returns void
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_pay    public.payments;
  v_t      public.payment_transfers;
  v_amount integer;
  v_live   text;
begin
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;

  if p_ref is not null and btrim(p_ref) <> '' then
    select * into v_t from public.payment_transfers where transfer_ref = p_ref for update;
    if found and v_t.payment_id <> p_payment_id then
      raise exception 'Transfer % is recorded on another payment', p_ref;
    end if;
    if found then
      update public.payment_transfers
         set reversed_cents = greatest(reversed_cents, least(coalesce(p_reversed_cents, amount_cents), amount_cents)),
             updated_at = now()
       where transfer_ref = p_ref
      returning * into v_t;
    else
      v_amount := coalesce(nullif(p_amount_cents, 0), v_pay.transfer_cents);
      if coalesce(v_amount, 0) > 0 then
        insert into public.payment_transfers (transfer_ref, payment_id, amount_cents, reversed_cents)
        values (p_ref, p_payment_id, v_amount, least(coalesce(p_reversed_cents, v_amount), v_amount))
        returning * into v_t;
      end if;
    end if;
  end if;

  select t.transfer_ref into v_live
    from public.payment_transfers t
   where t.payment_id = p_payment_id and t.reversed_cents < t.amount_cents
   order by (t.transfer_ref = v_pay.transfer_ref) desc, t.created_at
   limit 1;

  if v_live is null then
    -- No transfer is left live: the D11 park, as transfer.reversed always did.
    -- release_requested_at is preserved; only resolve_job_dispute or resolve_tip clears the park.
    update public.payments set
      status       = (case when status = 'released' then 'held' else status end)::public.payment_status,
      released_at  = null,
      transfer_ref = null,
      transfer_reversed_at = now(),
      last_error   = 'transfer reversed at the provider',
      updated_at   = now()
    where id = p_payment_id;
  else
    -- A part of a transfer, or one of two transfers, was reversed: money is still with the
    -- worker. No park; a person decides (payment_attention).
    update public.payments set
      transfer_ref = v_live,
      last_error   = left('transfer ' || coalesce(p_ref, '?') || ' reversed in part or alone at the provider; a person decides', 500),
      updated_at   = now()
    where id = p_payment_id;
  end if;
end $fn$;
revoke all on function public.payment_record_reversal(uuid, text, integer, integer) from public, anon, authenticated, service_role;
comment on function public.payment_record_reversal(uuid, text, integer, integer) is
  'B16: records a provider reversal of one transfer (p_reversed_cents = the transfer''s amount_reversed; null = all of it). When no transfer of the payment is left live it parks the row exactly as transfer.reversed always did (status released -> held, released_at and transfer_ref null, transfer_reversed_at, last_error). When one is still live (a partial reversal, or one of two transfers) nothing is parked and last_error says a person decides. Called by apply_payment_event only; no client grant.';

commit;
