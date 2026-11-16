-- money_timers — money M2-1 (critic A4-09): every automatic money task I own
-- reports each run, and a task that never reported can be late.
-- Proof: supabase/tests/483_money_timers.sql; tests/intentCancel.test.mjs (process-settlements).
--
-- WHAT WAS WRONG. record_timer_run (attention_plain) had no caller, and a task with no timer_runs row
-- could never be late: a task that failed before its first report stayed invisible.
--
-- WHAT CHANGES (additive; nothing that 9d1c56d calls changes its signature or result shape).
-- 1. timer_runs.expected_from (new, nullable, last): when a task was first expected to report. Only
--    this migration sets it, for the three tasks whose first caller lands in this same commit:
--      brazos-process-settlements   20 minutes  (its cron runs every 5 minutes,
--                                                 20260910000000_settlement_schedules.sql:167: four runs)
--      expire-unfunded-payments     1 hour      (every 15 minutes, settlement_schedules.sql:165: four runs)
--      brazos-prune-payment-events  25 hours    (daily at 03:30, 20261003000500_payment_events_prune.sql:62:
--                                                 one day and one hour)
--    and (A9 PART 2 c) for the lifecycle's three sweeps, with the intervals of their own reports:
--      auto-release-due-payments    40 minutes  (20261116200000_release_clock.sql:229)
--      close-unpaid-hires           60 minutes  (20261116200100_unpaid_pause.sql:158)
--      brazos-job-series            4 hours     (20261116200400_post_window.sql:1008)
--    The names are the cron jobs' names, so cron:<name> and task:<name> are the same task. A sweep
--    that reported before this ran (the lifecycle can reach a database first) is expected from its
--    kept report, never later.
-- 2. expire_unfunded_payments() and prune_payment_event_payloads(interval): restated with one line
--    that reports the run. A9-07: through report_timer_run (20261116200000_release_clock.sql:183),
--    which catches an ordinary error of the report, so such an error never undoes the run; a
--    cancelled statement (a statement timeout or a cancel request during the report) is not caught
--    and still undoes the run (release_clock.sql:183-195, its limit); a run that fails still rolls
--    back with its report. A SQL task's failure shows as the cron line (cron.job_run_details)
--    and, when no good run follows, as timer_late. Signatures, security, search_path and ACL as they
--    were.
-- 3. process-settlements (the edge function) reports at the end of every run: the error names each
--    pass that threw or had a defect (a failed begin, write-back or record); null when none.
-- 4. payment_attention_more() (new, security definer, service_role): the lines added after M1. Now
--    one kind: a task with an expected row that never reported and is past expected_from +
--    stale_after (timer_late, ref task:<name>). Later steps replace this function, not the view.
-- 5. payment_attention: restated with create or replace view, every arm of attention_plain word for
--    word, plus one arm: the rows of payment_attention_more(). Columns, order and ACL unchanged.
--    M2-1c: the arms are attention_plain's as of M1c (critic A5-06), word for word.
--
-- Other lanes' timed tasks are not edited here; each needs one line at its end (in the report).
--
-- Additive under scripts/staging-scan.sh.

begin;

-- 1. When a task was first expected.
alter table public.timer_runs add column if not exists expected_from timestamptz;
comment on column public.timer_runs.expected_from is
  'M2-1: when this task was first expected to report (set once, by money_timers: for its own three tasks and the lifecycle''s three sweeps). Before its first report (ok_at and failing_since null) the task is late after expected_from + stale_after.';

insert into public.timer_runs as t (name, expected_from, stale_after)
values ('brazos-process-settlements', now(), interval '20 minutes'),
       ('expire-unfunded-payments',   now(), interval '1 hour'),
       ('brazos-prune-payment-events', now(), interval '25 hours'),
       -- A9 PART 2 c: the lifecycle's sweeps, late after the intervals of their own reports.
       ('auto-release-due-payments',  now(), interval '40 minutes'),
       ('close-unpaid-hires',         now(), interval '60 minutes'),
       ('brazos-job-series',          now(), interval '4 hours')
on conflict (name) do update
   -- Never later than a report the task already made (least ignores the nulls).
   set expected_from = coalesce(t.expected_from, least(t.ok_at, t.failing_since, excluded.expected_from)),
       stale_after   = excluded.stale_after;

-- 2. The two SQL tasks report their run.
create or replace function public.expire_unfunded_payments() returns setof public.payments
language sql security definer set search_path = public, pg_temp as $$
  -- M2-1, A9-07: this run is reported (report_timer_run: an ordinary error of the report never undoes
  -- the run; a statement timeout or a cancel during the report still does); a run that fails rolls
  -- back with the report.
  select public.report_timer_run('expire-unfunded-payments', interval '1 hour');
  update public.payments
     set status = 'voided', last_error = 'funding window expired', updated_at = now()
   where provider = 'stripe' and status = 'unfunded' and funding_due_at is not null and funding_due_at < now()
  returning *;
$$;
revoke all on function public.expire_unfunded_payments() from public, anon, authenticated;
grant execute on function public.expire_unfunded_payments() to service_role;

create or replace function public.prune_payment_event_payloads(p_older_than interval default interval '90 days') returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.payment_events e
     set payload = jsonb_build_object('id', e.id, 'type', e.type, 'pruned_at', now())
   where e.processed_at is not null
     and e.received_at < now() - p_older_than
     and e.payload ? 'data';
  get diagnostics v_count = row_count;
  -- M2-1, A9-07: this run is reported (report_timer_run: an ordinary error of the report never undoes
  -- the run; a statement timeout or a cancel during the report still does); a run that fails rolls
  -- back with the report.
  perform public.report_timer_run('brazos-prune-payment-events', interval '25 hours');
  return v_count;
end;
$$;
revoke all on function public.prune_payment_event_payloads(interval) from public, anon, authenticated;
grant execute on function public.prune_payment_event_payloads(interval) to service_role;

-- 3. The lines added after M1.
create or replace function public.payment_attention_more()
returns table (payment_id uuid, job_id uuid, what text, code text, old text, since timestamptz,
               overdue boolean, cents integer, more text, ref text)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  -- A4-09 (i): a task expected since expected_from that never reported (no good run, no failure).
  select null::uuid, null::uuid, 'system'::text, 'timer_late'::text,
         'task ' || r.name || ': never reported since ' || r.expected_from::text || ' (timer_runs)',
         r.expected_from + r.stale_after, true, null::integer, null::text, 'task:' || r.name
    from public.timer_runs r
   where r.ok_at is null and r.failing_since is null
     and r.expected_from is not null and r.expected_from < now() - r.stale_after
$fn$;
revoke all on function public.payment_attention_more() from public, anon, authenticated;
grant execute on function public.payment_attention_more() to service_role;
comment on function public.payment_attention_more() is
  'M2: the payment_attention arms added after attention_plain, in its arm columns (payment_id, job_id, what, code, old, since, overdue, cents, more, ref). M2-1: a task with an expected row that never reported, late after expected_from + stale_after. service_role only; read by payment_attention.';

-- 4. payment_attention, restated from attention_plain with one arm more (the last one).
create or replace view public.payment_attention as
  with tw as (
    -- Transfers asked for and not recorded.
    select p.*,
           exists (select 1 from public.transfers_ready r where r.id = p.id) as ready,
           public.settlement_attempt_closed(p.transfer_attempts, p.transfer_sent_attempt, p.transfer_sent_at, p.transfer_stopped_at) as closed,
           public.payment_refund_reserved_cents(p) as reserved,
           -- A2-10: the payee line by cause.
           not exists (select 1 from public.profiles pr
                        where pr.id = p.payee_id and not coalesce(pr.banned, false) and pr.deleted_at is null) as payee_gone,
           (select a.payouts_status from public.payment_accounts a where a.user_id = p.payee_id) as payouts_status,
           exists (select 1 from public.payment_disputes d where d.payment_id = p.id and d.closed_at is null) as dispute_open,
           -- M1b (A4-07): a dispute recorded as lost is a known outcome (apply_payment_event keeps lost).
           exists (select 1 from public.payment_disputes d where d.payment_id = p.id and d.status = 'lost') as dispute_lost
      from public.payments p
     where p.provider = 'stripe' and p.release_requested_at is not null
       and coalesce(p.transfer_cents, 0) > 0 and p.transfer_ref is null
  ),
  rw as (
    -- Refunds asked for and not recorded.
    select p.*,
           exists (select 1 from public.refunds_ready r where r.id = p.id) as ready,
           public.settlement_attempt_closed(p.refund_attempts, p.refund_sent_attempt, p.refund_sent_at, p.refund_stopped_at) as closed,
           public.payment_transfer_unconfirmed(p) as unconfirmed,
           exists (select 1 from public.payment_disputes d where d.payment_id = p.id and d.closed_at is null) as dispute_open
      from public.payments p
     where p.provider = 'stripe' and coalesce(p.refund_cents, 0) > 0
       and p.refund_ref is null and p.status <> 'refunded'
       and coalesce(p.refunded_cents, 0) < p.refund_cents
  ),
  h as (
    select public.schedule_health() as v
  ),
  arms as (
    select tw.id as payment_id, tw.job_id, 'transfer'::text as what,
           c.v[1] as code, c.v[2] as old,
           coalesce(case when tw.closed then tw.transfer_sent_at end, tw.release_requested_at) as since,
           (tw.closed or tw.release_requested_at < now() - interval '3 days') as overdue,
           tw.transfer_cents as cents,
           case when c.v[1] in ('transfer_balance_low', 'transfer_retrying') then null else tw.last_error end as more,
           tw.id::text as ref
      from tw
      cross join lateral (select case
           -- M1b (A4-07): under a card dispute a reversal cannot be finished in the app (the worker's
           -- side is refused, a refund is not sent). The bank's block first; a lost dispute is known.
           when tw.transfer_reversed_at is not null and tw.chargeback_at is null
             then array['transfer_reversed', 'reversed at the provider: resolve_job_dispute (job payment) or resolve_tip (tip) decides']
           when tw.transfer_reversed_at is not null and tw.dispute_open
             then array['transfer_reversed_disputed', 'reversed at the provider while a card dispute is open: resolve_job_dispute (worker) and resolve_tip (send) refuse, and refunds_due sends nothing, until the bank closes it']
           when tw.transfer_reversed_at is not null and tw.dispute_lost
             then array['card_dispute_lost', 'reversed at the provider, and the card dispute was lost: the bank returned the charge to the customer']
           when tw.transfer_reversed_at is not null
             then array['card_dispute_unclear', 'card dispute open: no transfer while the card network holds the money']
           when tw.closed and tw.transfer_stopped_at is not null and tw.transfer_sent_attempt = tw.transfer_attempts
             then array['transfer_stopped', 'stopped: the last answer needs a person. Look in Stripe for metadata payment_id, then record_settlement_sent or settlement_send_reopen']
           when tw.closed
             then array['transfer_no_answer', 'no answer for 23 hours under the same key. Look in Stripe for metadata payment_id, then record_settlement_sent or settlement_send_reopen']
           -- A dispute that is closed but still blocks (neither won nor warning_closed) is not waiting for the bank.
           when tw.chargeback_at is not null
             then array[case when tw.dispute_open then 'transfer_card_dispute'
                             when tw.dispute_lost then 'card_dispute_lost'
                             else 'card_dispute_unclear' end,
                        'card dispute open: no transfer while the card network holds the money']
           when exists (select 1 from public.job_disputes d where d.job_id = tw.job_id and d.status = 'open')
             then array['transfer_issue_open', 'open issue report: resolve_job_dispute decides']
           when coalesce(tw.received_cents, tw.charge_amount_cents) <> tw.charge_amount_cents
             then array['amount_differs', 'charged a different amount than this payment: settle it by hand in Stripe']
           when tw.status not in ('held', 'partially_refunded')
             then array['status_unusual', 'payment is ' || tw.status::text || ': a person decides']
           when exists (select 1 from public.payment_transfers x where x.payment_id = tw.id and x.reversed_cents < x.amount_cents)
             then array['transfer_already_recorded', 'a transfer is already recorded for this payment']
           when tw.transfer_cents > tw.charge_amount_cents - tw.reserved
             then array['transfer_more_than_left', 'transfer is more than is left after refunds: a person decides']
           -- A2-10: who or what the payout waits for.
           -- M1b: a held tip never sent, for a worker who is gone: resolve_tip refunds it (its checks:
           -- held, no card dispute, no transfer sent or recorded, the amount charged, no refund asked).
           when not tw.ready and tw.payee_gone and tw.kind = 'tip' and tw.status = 'held'
                and coalesce(tw.refund_cents, 0) = 0
                and not coalesce(tw.transfer_sent_attempt = tw.transfer_attempts, false)
             then array['tip_payee_gone', 'the worker has no enabled payout account yet: resolve_tip(id, ''refund'') refunds the tip']
           when not tw.ready and tw.payee_gone
             then array['transfer_payee_gone', 'the worker has no enabled payout account yet']
           when not tw.ready and tw.payouts_status = 'under_review'
             then array['transfer_payout_review', 'the worker has no enabled payout account yet']
           when not tw.ready
             then array['transfer_no_payout_account', 'the worker has no enabled payout account yet']
           -- The refusal the drain sends again with a new key every run (classify.mjs DEFERRED_CODES).
           when tw.last_error like '%balance_insufficient%'
             then array['transfer_balance_low', 'retrying: ' || coalesce(tw.last_error, '')]
           else array['transfer_retrying', 'retrying: ' || coalesce(tw.last_error, '')]
         end as v) c
     -- M1b (A4-07): a ready row is listed only for a transfer try that was refused or unanswered
     -- (record_settlement_result writes 'transfer: '), never for the refund side's error or for the
     -- owner's reopen before its first try.
     where not tw.ready
        or (tw.last_error like 'transfer: %' and tw.last_error not like 'transfer: reopened %')
    union all
    select rw.id, rw.job_id, 'refund', c.v[1], c.v[2],
           s.since,
           (rw.closed or s.since < now() - interval '3 days'),
           rw.refund_cents,
           case when c.v[1] = 'refund_retrying' then null else rw.last_error end,
           rw.id::text
      from rw
      cross join lateral (select case
           when rw.closed and rw.refund_stopped_at is not null and rw.refund_sent_attempt = rw.refund_attempts
             then array['refund_stopped', 'stopped: the last answer needs a person. Look in Stripe for metadata payment_id, then record_settlement_sent or settlement_send_reopen']
           when rw.closed
             then array['refund_no_answer', 'no answer for 23 hours under the same key. Look in Stripe for metadata payment_id, then record_settlement_sent or settlement_send_reopen']
           when rw.chargeback_at is not null
             then array[case when rw.dispute_open then 'refund_card_dispute' else 'card_dispute_unclear' end,
                        'card dispute open: no refund while the card network holds the money']
           -- M1c (A5-06, A4-05): before refund_partly_landed: the refunded total still counts a failed
           -- refund, so "already refunded in Stripe" can be false and the rest is not the refund asked.
           -- R5-A3: refunds_due (20261115000700) sends nothing on a row with a refund failure.
           when exists (select 1 from public.payment_refund_failures f where f.payment_id = rw.id)
             then array['refund_failed_before', 'a refund on this charge failed before: look at the refunds on this charge in Stripe first (one that the app sent can be there), check how the failed one was arranged, refund only what is still owed by hand, then record_settlement_sent']
           when coalesce(rw.refunded_cents, 0) > 0 or rw.status = 'partially_refunded'
             then array['refund_partly_landed', 'a refund already landed on this charge: finish by hand in Stripe, then record_settlement_sent']
           when coalesce(rw.received_cents, rw.charge_amount_cents) <> rw.charge_amount_cents
             then array['amount_differs', 'charged a different amount than this payment: settle it by hand in Stripe']
           when rw.status not in ('held', 'released', 'paid_out', 'voided', 'failed')
             then array['status_unusual', 'payment is ' || rw.status::text || ': a person decides']
           when rw.refund_cents > rw.charge_amount_cents
                  - (select coalesce(sum(x.amount_cents - x.reversed_cents), 0) from public.payment_transfers x where x.payment_id = rw.id)
                  - (case when rw.unconfirmed then coalesce(rw.transfer_cents, 0) else 0 end)
             then array['refund_more_than_left', 'refund is more than is left after the transfer: a person decides']
           when not rw.ready then array['refund_no_intent', 'no payment intent to refund against']
           else array['refund_retrying', 'retrying: ' || coalesce(rw.last_error, '')]
         end as v) c
      -- A2-11: a start that only the moves named in SINCE above change; updated_at (moved by every started try, settlement_send_begin, and every write-back) only where the row has none.
      cross join lateral (select case c.v[1]
           when 'refund_stopped' then coalesce(rw.refund_sent_at, rw.updated_at)
           when 'refund_no_answer' then coalesce(rw.refund_sent_at, rw.updated_at)
           when 'refund_card_dispute' then rw.chargeback_at
           when 'card_dispute_unclear' then rw.chargeback_at
           when 'refund_partly_landed'
             then coalesce((select min(e.received_at) from public.payment_events e
                             where e.payment_id = rw.id and e.type = 'charge.refunded'), rw.updated_at)
           when 'amount_differs' then coalesce(rw.held_at, rw.updated_at)
           when 'refund_failed_before'
             then coalesce((select min(f.failed_at) from public.payment_refund_failures f where f.payment_id = rw.id), rw.updated_at)
           else rw.updated_at
         end as since) s
     -- M1b (A4-07): as for transfers, only the refund side's own error ('refund: ').
     where not rw.ready
        or (rw.last_error like 'refund: %' and rw.last_error not like 'refund: reopened %')
    union all
    -- A refund sent and not yet confirmed by charge.refunded (F2: and not failed). R7-A2: until the
    -- refunded total covers the refund asked. A2-11: dated from the attempt's first send.
    select p.id, p.job_id, 'refund', 'refund_unconfirmed', 'refund sent, not yet confirmed by charge.refunded',
           coalesce(p.refund_sent_at, p.updated_at), coalesce(p.refund_sent_at, p.updated_at) < now() - interval '1 day',
           p.refund_cents, p.refund_ref, p.refund_ref
      from public.payments p
     where p.provider = 'stripe' and p.refund_ref is not null and p.status <> 'refunded'
       and coalesce(p.refunded_cents, 0) < p.refund_cents
       and not exists (select 1 from public.payment_refund_failures f where f.refund_ref = p.refund_ref)
    union all
    -- F2, A2-04: ONE line per payment for the refunds the provider failed and nobody arranged yet
    -- (resolve_refund_failure arranges them all at once). cents: their sum, never more than the
    -- charge, null when one amount is unknown. A card dispute on the charge gets its own sentence,
    -- and so do two or more failures (the sum can count one refund tried twice).
    select f.payment_id, p.job_id, 'refund',
           -- M1c (A5-06): the bank's finish only while a dispute is open; a lost one is known.
           case when p.chargeback_at is not null
                 and exists (select 1 from public.payment_disputes d where d.payment_id = p.id and d.closed_at is null)
                  then 'refund_failed_disputed'
                when p.chargeback_at is not null
                 and exists (select 1 from public.payment_disputes d where d.payment_id = p.id and d.status = 'lost')
                  then 'refund_failed_dispute_lost'
                when p.chargeback_at is not null then 'refund_failed_dispute_unclear'
                when f.n > 1 then 'refund_failed_several'
                else 'refund_failed' end,
           f.list || '. Record how it was arranged with resolve_refund_failure(payment id, note); it moves no money, so use it also when the refund was already settled another way',
           f.first_failed, true,
           case when f.unknown = 0 then least(f.total, p.charge_amount_cents)::integer end,
           p.last_error, p.id::text
      from (select g.payment_id,
                   string_agg('refund ' || g.refund_ref || ' failed at the provider ('
                                || coalesce(g.failure_reason, 'no reason given') || '), '
                                || coalesce(g.amount_cents::text || ' cents', 'amount unknown'),
                              '; ' order by g.failed_at, g.refund_ref) as list,
                   min(g.failed_at) as first_failed,
                   sum(g.amount_cents) as total,
                   count(*) - count(g.amount_cents) as unknown,
                   count(*) as n
              from public.payment_refund_failures g
             where g.arranged_at is null
             group by g.payment_id) f
      join public.payments p on p.id = f.payment_id
    union all
    -- More left the platform than came in (or a failed refund is still counted: M1b). No start of its own: updated_at.
    select m.payment_id, m.job_id, 'payment', 'money_short',
           'money short: more went out than is left on the charge (for example a card dispute lost after the transfer). Recover it by hand in Stripe',
           p.updated_at, true, m.short_cents,
           'received ' || m.received_cents || ', refunded ' || m.refunded_cents || ', card dispute ' || m.chargeback_cents || ', transferred ' || m.transferred_cents,
           p.id::text
      from public.payment_money m join public.payments p on p.id = m.payment_id
     where m.short_cents > 0
    union all
    -- A transfer reversed in part: money is still with the worker.
    select x.payment_id, p.job_id, 'transfer', 'transfer_partly_reversed',
           'transfer ' || x.transfer_ref || ' was reversed in part: a person decides',
           x.updated_at, false, x.reversed_cents, p.last_error, x.transfer_ref
      from public.payment_transfers x join public.payments p on p.id = x.payment_id
     where x.reversed_cents > 0 and x.reversed_cents < x.amount_cents
    union all
    -- A charge for another amount, on a row that asks for nothing yet. A2-11: dated from the charge.
    select p.id, p.job_id, 'payment', 'amount_differs', 'charged a different amount than this payment: settle it by hand in Stripe',
           coalesce(p.held_at, p.updated_at), false, p.received_cents, p.last_error, p.id::text
      from public.payments p
     where p.provider = 'stripe' and p.received_cents is not null and p.received_cents <> p.charge_amount_cents
       and not (p.release_requested_at is not null and coalesce(p.transfer_cents, 0) > 0 and p.transfer_ref is null)
       and not (coalesce(p.refund_cents, 0) > 0 and p.refund_ref is null and p.status <> 'refunded'
                and coalesce(p.refunded_cents, 0) < p.refund_cents)
    union all
    -- A card dispute still holding the money, on a row that asks for nothing yet.
    select p.id, p.job_id, 'payment',
           case when exists (select 1 from public.payment_disputes d where d.payment_id = p.id and d.closed_at is null)
                then 'card_dispute_open' else 'card_dispute_unclear' end,
           'card dispute still open or closed without proof the money stayed: a person decides',
           p.chargeback_at, p.chargeback_at < now() - interval '30 days', p.chargeback_cents, p.last_error,
           coalesce(p.chargeback_ref, p.id::text)
      from public.payments p
     where p.provider = 'stripe' and p.chargeback_at is not null and p.status <> 'refunded'
       and not (p.release_requested_at is not null and coalesce(p.transfer_cents, 0) > 0 and p.transfer_ref is null)
       and not (coalesce(p.refund_cents, 0) > 0 and p.refund_ref is null
                and coalesce(p.refunded_cents, 0) < p.refund_cents)
    union all
    -- A held job payment on a job that never ends: still assigned or in_progress more than 7 days
    -- after its arrival window (after the hire when it has no date). The 7 days are the fallback
    -- release clock's. Nothing moves this money by itself; nothing here moves it either.
    select p.id, p.job_id, 'payment', 'job_stuck',
           'job still ' || j.status::text || ' more than 7 days after its date (or its hire): the money stays held until a person decides',
           s.since + interval '7 days', true, p.charge_amount_cents, p.last_error, p.id::text
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
    -- R6 (new): a held job payment on a cancelled job, directed nowhere, with no open issue report
    -- (an open one has its own line). resolve_job_dispute refunds it (customer only, 20261115000000).
    -- Dated from the cancellation; ban_user does not stamp cancelled_at, so then from the funding.
    select p.id, p.job_id, 'payment', 'job_closed_money_held',
           'job cancelled with its payment still held and directed nowhere: resolve_job_dispute (customer) refunds it; paying the worker has no function',
           coalesce(j.cancelled_at, p.held_at, p.updated_at), true, p.charge_amount_cents, p.last_error, p.id::text
      from public.payments p
      join public.jobs j on j.id = p.job_id
     where p.provider = 'stripe' and p.kind = 'job_payment' and p.status = 'held'
       and j.status = 'cancelled'
       and coalesce(p.refund_cents, 0) = 0 and coalesce(p.transfer_cents, 0) = 0
       and p.release_requested_at is null
       and not exists (select 1 from public.job_disputes d where d.job_id = j.id and d.status = 'open')
    union all
    -- New (A2-09): a charge refunded in part outside the app while nothing else is asked. The rest
    -- is held, and no release or refund takes a partially_refunded row by itself.
    select p.id, p.job_id, 'payment', 'refund_outside_app',
           'refunded in part outside the app (charge.refunded) while nothing was asked: the rest stays held until a person decides',
           coalesce((select min(e.received_at) from public.payment_events e
                      where e.payment_id = p.id and e.type = 'charge.refunded'), p.updated_at),
           true, p.charge_amount_cents - coalesce(p.refunded_cents, 0), p.last_error, p.id::text
      from public.payments p
     where p.provider = 'stripe' and p.status = 'partially_refunded'
       and p.release_requested_at is null and coalesce(p.transfer_cents, 0) = 0
       and coalesce(p.refunded_cents, 0) >= coalesce(p.refund_cents, 0)
       and not exists (select 1 from public.job_disputes d where d.job_id = p.job_id and d.status = 'open')
    union all
    -- New (A2-09, reading e): an intent cancel stamped final (record_intent_cancel stores no answer:
    -- a refusal looks like a success), and no payment_intent.canceled applied 1 hour later.
    select p.id, p.job_id, 'payment', 'cancel_unconfirmed',
           'intent ' || p.provider_ref || ' cancel answered final, but no payment_intent.canceled was applied: look it up in Stripe',
           p.intent_cancel_at, true, p.charge_amount_cents, p.last_error, p.provider_ref
      from public.payments p
     where p.provider = 'stripe' and p.status = 'voided' and p.provider_ref is not null
       and p.held_at is null and p.received_cents is null
       and coalesce(p.refund_cents, 0) = 0 and coalesce(p.refunded_cents, 0) = 0
       and p.intent_cancel_at < now() - interval '1 hour'
       and not exists (select 1 from public.payment_events e
                        where e.payment_id = p.id and e.type = 'payment_intent.canceled' and e.processed_at is not null)
    union all
    -- Open issue reports (in-app job disputes): overdue after 2 business days. A no-show claim is
    -- the worker's (cancel_job customer_no_show); the customer's own reasons, no_show included, are issue_open.
    select d.payment_id, d.job_id, 'issue report',
           case when d.reason = 'no_show' and coalesce(d.opened_by <> j.client_id, false) then 'issue_no_show' else 'issue_open' end,
           'open issue report: resolve_job_dispute decides',
           d.created_at,
           (select count(*) from generate_series((d.created_at at time zone 'America/New_York')::date + 1,
                                                 (now() at time zone 'America/New_York')::date, interval '1 day') g
             where extract(isodow from g) < 6) > 2,
           null::integer, d.reason::text, d.id::text
      from public.job_disputes d
      left join public.jobs j on j.id = d.job_id
     where d.status = 'open'
    union all
    -- Webhook events that could not be applied; F7: also one stored and never applied, after 1 hour.
    select e.payment_id, null::uuid, 'event', 'event_failed',
           'webhook event ' || e.type || ' could not be applied: fix and re-run apply_payment_event(''' || e.id || ''')',
           e.received_at, e.attempts >= 5, null::integer, e.error, e.id
      from public.payment_events e
     where e.processed_at is null and (e.attempts > 0 or e.received_at < now() - interval '1 hour')
    union all
    -- System lines (new). No payment. A timer missing or a setting absent has no start (since null).
    -- M1b (A4-10): ref names the source: cron:<job> for pg_cron, task:<name> for a task's own
    -- report (timer_runs), vault:<secret> for a setting; one name from two sources is two lines.
    select null::uuid, null::uuid, 'system', 'timer_missing',
           'timer ' || m.name || ' is missing, inactive or changed: install_schedules()',
           null::timestamptz, true, null::integer, null::text, 'cron:' || m.name
      from h cross join lateral jsonb_array_elements_text(h.v -> 'missing') m(name)
    union all
    -- A pg_cron timer whose last run failed. cron keeps no failure start, so since is null (the last
    -- start, which every run moves, is in detail).
    select null::uuid, null::uuid, 'system', 'timer_failed',
           'timer ' || (t.e ->> 'jobname') || ': its last run failed (cron.job_run_details)',
           null::timestamptz, true, null::integer, 'last start ' || coalesce(t.e ->> 'last_start', 'unknown'), 'cron:' || (t.e ->> 'jobname')
      from h cross join lateral jsonb_array_elements(h.v -> 'timers') t(e)
     where t.e ->> 'last_status' = 'failed'
    union all
    -- A task that reports itself (timer_runs) and fails: since its first failure.
    select null::uuid, null::uuid, 'system', 'timer_failed',
           'task ' || r.name || ' failed (timer_runs)',
           r.failing_since, true, null::integer, r.error, 'task:' || r.name
      from public.timer_runs r
     where r.failing_since is not null
    union all
    -- A task that reports itself and has not finished a good run within stale_after.
    select null::uuid, null::uuid, 'system', 'timer_late',
           'task ' || r.name || ': no good run for ' || r.stale_after::text || ' (timer_runs)',
           r.ok_at + r.stale_after, true, null::integer, r.error, 'task:' || r.name
      from public.timer_runs r
     where r.failing_since is null and r.ok_at < now() - r.stale_after
    union all
    select null::uuid, null::uuid, 'system', 'vault_missing',
           'Vault secret ' || vn.name || ' is missing',
           null::timestamptz, true, null::integer, null::text, 'vault:' || vn.name
      from h cross join lateral jsonb_array_elements_text(h.v -> 'vault_missing') vn(name)
    union all
    -- Pushes due for more than 15 minutes and not sent (the drain runs every minute).
    select null::uuid, null::uuid, 'system', 'push_stuck',
           'notification_outbox: pending rows due for more than 15 minutes',
           n.since, true, null::integer, n.waiting || ' waiting', 'notification_outbox'
      from (select count(*) as waiting, min(coalesce(o.send_after, o.created_at)) as since
              from public.notification_outbox o
             where o.status = 'pending' and coalesce(o.send_after, o.created_at) < now() - interval '15 minutes') n
     where n.waiting > 0
    union all
    -- M2-1: the arms added after attention_plain (payment_attention_more).
    select m.payment_id, m.job_id, m.what, m.code, m.old, m.since, m.overdue, m.cents, m.more, m.ref
      from public.payment_attention_more() m
  )
  select a.payment_id, a.job_id, a.what,
         coalesce(s.reason, 'This needs a person. Ask your developer.') as reason,
         a.since, a.overdue, a.cents,
         concat_ws(' | ', a.old, a.more) as detail,
         a.code, a.ref,
         coalesce(s.finish, 'developer') as finish
    from arms a
    left join public.payment_attention_codes() s on s.code = a.code;
revoke all on table public.payment_attention from public, anon, authenticated, service_role;
grant select on table public.payment_attention to service_role;
comment on view public.payment_attention is
  'Money rule 4, the owner''s one query: select * from public.payment_attention order by since; Every payment the system will not move by itself, and every automatic task that needs a person, one line per reason. reason: the plain sentence of code (payment_attention_codes); detail: the technical text for a developer; code: a key that does not change for one kind of line; ref: the id of the thing the line is about (the payment, a refund, a transfer, a dispute, an event, cron:<job>, task:<name> or vault:<secret>); finish: app, stripe, bank, worker, wait or developer. Lines: transfers and refunds asked for and not ready (stopped, 23 hours without an answer, a reversal park, a card dispute, an issue report, another amount, a status, more than is left, the payee gone, Stripe reviewing the payee, no payout account, a low balance, no payment intent), rows retrying with an error, refunds sent and not confirmed, one line per payment for the refunds the provider failed until resolve_refund_failure records how they were arranged, money short, partial reversals, card disputes still open, lost or closed unclear, a reversal under an open card dispute, a tip for a worker who is gone, held job payments on jobs still assigned or in_progress 7 days after their date (or hire), held job payments on cancelled jobs directed nowhere (attention_plain), a charge refunded in part outside the app with the rest held, an intent cancel never confirmed after 1 hour, open issue reports (overdue after 2 business days, America/New_York), webhook events that could not be applied or were never applied after 1 hour, and the system lines (a timer missing or failing, a task late, a Vault secret missing, pushes stuck for 15 minutes), and (money_timers, payment_attention_more) a task expected and never reported. service_role only.';

commit;
