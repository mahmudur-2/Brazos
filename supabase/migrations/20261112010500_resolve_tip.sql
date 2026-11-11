-- 20261112010500_resolve_tip.sql — lean B20: a reversed tip can be decided.
-- Spec: docs/critical/money-safety.md.
--
-- WHAT WAS WRONG. A tip whose transfer was reversed is parked (transfer_reversed_at) like a job
-- payment, but only resolve_job_dispute clears a park, and it reads the job payment, never the
-- tip. Nothing could send the tip again or give it back.
--
-- WHAT CHANGES. resolve_tip(payment, outcome), service_role only (the owner, from the SQL
-- editor, after payment_attention lists the tip):
--   'send'    clears the park and starts a new transfer attempt (transfer_attempts + 1, so a new
--             key), exactly as resolve_job_dispute re-opens a reversed job payment.
--   'refund'  queues the whole charge back to the customer (refund_reason dispute_refund,
--             transfer_cents 0); refunds_due sends it.
-- Refused unless the tip is a stripe tip, held, with no card dispute, no live transfer, no
-- refund already asked for, and charged its own amount. A tip charged another amount is settled
-- by hand in Stripe (payment_attention says so).
--
-- Additive under scripts/staging-scan.sh. Proof: supabase/tests/380_money_guards.sql.

begin;

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
comment on function public.resolve_tip(uuid, text) is
  'B20, service_role only (the owner): decides a held stripe tip. send = a reversed tip goes to the worker again (park cleared, transfer_attempts + 1, a new key); refund = the whole charge goes back to the customer (refund_reason dispute_refund). Refused for a tip that is not held, is under a card dispute, has a live transfer, already asks for a refund, or was charged another amount.';

commit;
