-- 20261112010400_payment_attention.sql — lean B13, B16, B18 (money rule 4): no silent stop.
-- Spec: docs/critical/money-safety.md.
--
-- WHAT WAS WRONG. A row the drain would not send (a card dispute, a reversal park, a refund
-- that already landed, a stalled webhook, a refused key retried every tick) was invisible: the
-- owner had no query that listed it.
--
-- WHAT CHANGES (two service_role views, additive).
-- 1. payment_money: per stripe payment, what came in, what went back, what went to the worker,
--    and what is left. short_cents > 0 means more left than came in (a card dispute lost after
--    the transfer, a second transfer).
-- 2. payment_attention: every payment the system will not move by itself, one line per reason.
--    The owner's one query:   select * from public.payment_attention order by since;
--    Every row that asks for a transfer or a refund and is not in transfers_ready /
--    refunds_ready is listed (supabase/tests/370_money_conservation.sql proves it), plus rows
--    that are retrying with an error, refunds sent but not confirmed, money short, partial
--    reversals, a charge for another amount, a card dispute still open, a held job payment on a
--    job still assigned or in_progress more than 7 days after its date (or its hire), open
--    issue reports (overdue after 2 business days, America/New_York) and webhook events that
--    could not be applied.
--
-- Additive under scripts/staging-scan.sh.

begin;

create or replace view public.payment_money as
  select p.id as payment_id,
         p.job_id,
         p.kind,
         p.status,
         p.charge_amount_cents,
         coalesce(p.received_cents,
                  case when p.held_at is not null or p.refund_reason = 'funded_after_void'
                         or p.status in ('held', 'released', 'paid_out', 'refunded', 'partially_refunded')
                       then p.charge_amount_cents else 0 end) as received_cents,
         coalesce(p.refunded_cents, 0) as refunded_cents,
         coalesce(p.chargeback_cents, 0) as chargeback_cents,
         coalesce(t.transferred, 0)::integer as transferred_cents,
         (coalesce(p.received_cents,
                   case when p.held_at is not null or p.refund_reason = 'funded_after_void'
                          or p.status in ('held', 'released', 'paid_out', 'refunded', 'partially_refunded')
                        then p.charge_amount_cents else 0 end)
          - coalesce(p.refunded_cents, 0) - coalesce(p.chargeback_cents, 0) - coalesce(t.transferred, 0))::integer as left_cents,
         greatest(0, -(coalesce(p.received_cents,
                   case when p.held_at is not null or p.refund_reason = 'funded_after_void'
                          or p.status in ('held', 'released', 'paid_out', 'refunded', 'partially_refunded')
                        then p.charge_amount_cents else 0 end)
          - coalesce(p.refunded_cents, 0) - coalesce(p.chargeback_cents, 0) - coalesce(t.transferred, 0)))::integer as short_cents,
         p.received_cents is not null as facts_known
    from public.payments p
    left join lateral (select sum(x.amount_cents - x.reversed_cents) as transferred
                         from public.payment_transfers x where x.payment_id = p.id) t on true
   where p.provider = 'stripe';
revoke all on table public.payment_money from public, anon, authenticated, service_role;
grant select on table public.payment_money to service_role;
comment on view public.payment_money is
  'B16: per stripe payment, the provider''s facts: received (received_cents; when not reported, the charge for a row that was funded), refunded, taken by a card dispute, transferred (live transfers), left = received - refunded - chargeback - transferred, short_cents = what is missing when left is negative. facts_known = received_cents was reported. service_role only.';

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
  -- A refund sent and not yet confirmed by charge.refunded.
  select p.id, p.job_id, 'refund', 'refund sent, not yet confirmed by charge.refunded',
         p.updated_at, p.updated_at < now() - interval '1 day', p.refund_cents, p.refund_ref
    from public.payments p
   where p.provider = 'stripe' and p.refund_ref is not null and coalesce(p.refunded_cents, 0) = 0
     and p.status not in ('refunded', 'partially_refunded')
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
  'Money rule 4, the owner''s one query: select * from public.payment_attention order by since; Every payment the system will not move by itself, one line per reason: transfers and refunds asked for and not ready (stopped, 23 hours without an answer, a reversal park, a card dispute, an issue report, another amount, a status, more than is left, no payout account, no payment intent), rows retrying with an error, refunds sent and not confirmed, money short, partial reversals, card disputes still open, held job payments on jobs still assigned or in_progress 7 days after their date (or hire), open issue reports (overdue after 2 business days, America/New_York) and webhook events that could not be applied. service_role only.';

commit;
