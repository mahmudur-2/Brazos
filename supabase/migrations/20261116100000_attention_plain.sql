-- attention_plain — money M1 and M1b: the owner's list in plain words.
-- Proof: supabase/tests/480_attention_exit_map.sql, supabase/tests/481_attention_codes.sql,
-- supabase/tests/482_attention_truth.sql (M1b, M1c).
--
-- M1c (critic A5-06, before M1 is applied anywhere). A try the app has no answer for is never "not
-- gone through": transfer_retrying and refund_retrying say the app has no answer from Stripe that
-- the money went through, so it may or may not have moved (a timeout can follow a send Stripe
-- accepted). A failed refund under a card dispute waits for the bank only while a dispute is OPEN
-- (payment_disputes.closed_at null): refund_failed_disputed. Closed and lost (status lost): the
-- bank already returned the disputed amount, so refund_failed_dispute_lost says the failed refund
-- is not a debt for that money (developer). Closed and still blocking for another status:
-- refund_failed_dispute_unclear (developer). Closed and won clears chargeback_at
-- (refund_failed_and_event_order), so the payment gets refund_failed or refund_failed_several, the
-- lines of a payment with no dispute. A refund asked on a charge with a failed refund is
-- refund_failed_before even when part of the charge counts as refunded (it was refund_partly_landed,
-- "already refunded in Stripe", false after a failure), and its sentence says the amount shown is
-- not always what is still owed.
--
-- M1b (critic A4, before M1 is applied anywhere). A sentence says only what its predicate proves,
-- and a finish names only a way that works in that state: a failed refund amount is never shown as
-- a debt (A4-03); cancel_unconfirmed, transfer_more_than_left, refund_outside_app, money_short,
-- transfer_retrying and refund_retrying, and job_stuck say what is known (A4-07, A4-05); a payout
-- reversed under an open card dispute waits for the bank (transfer_reversed_disputed); a lost card
-- dispute is a known outcome (card_dispute_lost); a tip for a worker who is gone can be refunded
-- in the app (tip_payee_gone); the retrying lines read only their own side's error; the system
-- lines name their source in ref (cron:, task:, vault:), so a cron failure and a task's own report
-- under one name are two lines (A4-10).
--
-- WHAT WAS WRONG. payment_attention's reason was written for a developer (function names, column
-- names), and some states that need a person had no line at all: a held payment on a cancelled job
-- (R6), the rest of a payment held after a refund made outside the app, an intent cancel that Stripe
-- never confirmed, a stored Stripe event never applied (attempts 0), and the automatic tasks
-- themselves. Two failed refunds on one payment made two lines that one decision clears together
-- (A2-04). Some lines dated themselves from updated_at, which every retry moves (A2-11).
--
-- WHAT CHANGES (additive; nothing that 9d1c56d calls changes its signature or result shape).
-- 1. timer_runs (new table): one row per automatic task that reports itself: the last good run,
--    since when it fails, the last failure. RLS on, no policy, service_role reads only.
-- 2. record_timer_run(name, error, stale_after) (new): the one writer of timer_runs. service_role.
--    Nothing calls it yet (M2 wires process-settlements).
-- 3. payment_attention_codes() (new): every code with its plain sentence (reason) and who finishes
--    it (finish: app, stripe, bank, worker, wait, developer). service_role.
-- 4. payment_attention, replaced with create or replace view: the eight columns keep their names,
--    types and order; reason is now the plain sentence; detail starts with the old technical text,
--    then the old detail. The old text is kept word for word EXCEPT: (a) the failed-refund line,
--    now one line per payment: its text lists each failed refund in the old words without the old
--    sentence after them, then says how to record the arrangement; (b) a reversed payout under a card
--    dispute (transfer_reversed_disputed, card_dispute_lost, card_dispute_unclear): new text, because
--    the old "resolve_job_dispute ... decides" is refused there; (c) tip_payee_gone: the old text,
--    then ": resolve_tip(id, 'refund') refunds the tip"; (d) the lines that are new (they have no
--    old text). Three columns come last: code, ref (the id of the thing the
--    line is about) and finish. New lines: job_closed_money_held (R6), refund_outside_app,
--    cancel_unconfirmed, stored events never applied after 1 hour, the payee line split by cause,
--    one failed-refund line per payment with the sum (refund_failed for one failure,
--    refund_failed_several for more, refund_failed_disputed under a card dispute), and the system
--    lines. Same ACL (restated).
--
-- Additive under scripts/staging-scan.sh.

begin;

-- ---------------------------------------------------------------------------
-- 1. timer_runs
-- ---------------------------------------------------------------------------
create table if not exists public.timer_runs (
  name          text primary key,
  ok_at         timestamptz,
  failing_since timestamptz,
  failed_at     timestamptz,
  error         text,
  stale_after   interval not null default interval '20 minutes'
);
alter table public.timer_runs enable row level security;
revoke all on table public.timer_runs from public, anon, authenticated, service_role;
grant select on table public.timer_runs to service_role;
comment on table public.timer_runs is
  'M1: one row per automatic task that reports its runs (record_timer_run): ok_at the last good run, failing_since the first failure since then (null while it works), failed_at and error the last failure, stale_after how long after ok_at it counts as late (20 minutes unless the task says). payment_attention lists a failing or late task. RLS on, no policy; service_role reads, only record_timer_run writes.';

-- ---------------------------------------------------------------------------
-- 2. record_timer_run
-- ---------------------------------------------------------------------------
create or replace function public.record_timer_run(p_name text, p_error text default null, p_stale_after interval default null)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_name  text := nullif(btrim(p_name), '');
  v_error text := left(nullif(btrim(p_error), ''), 500);
begin
  if v_name is null then
    raise exception 'A timer run needs its name';
  end if;
  insert into public.timer_runs as t (name, ok_at, failing_since, failed_at, error, stale_after)
  values (v_name,
          case when v_error is null then now() end,
          case when v_error is null then null else now() end,
          case when v_error is null then null else now() end,
          v_error,
          coalesce(p_stale_after, interval '20 minutes'))
  on conflict (name) do update
     set ok_at         = case when v_error is null then now() else t.ok_at end,
         failing_since = case when v_error is null then null else coalesce(t.failing_since, now()) end,
         failed_at     = case when v_error is null then t.failed_at else now() end,
         error         = case when v_error is null then t.error else v_error end,
         stale_after   = coalesce(p_stale_after, t.stale_after);
end $fn$;
revoke all on function public.record_timer_run(text, text, interval) from public, anon, authenticated;
grant execute on function public.record_timer_run(text, text, interval) to service_role;
comment on function public.record_timer_run(text, text, interval) is
  'M1: an automatic task reports one run. No error (null or blank): ok_at = now and failing_since clears. An error: failed_at = now, error = its first 500 characters, failing_since keeps the first failure of the current run of failures (it moves only when a good run clears it and a later run fails). p_stale_after, when given, is kept for later runs. service_role only.';

-- ---------------------------------------------------------------------------
-- 3. payment_attention_codes: the plain sentence and the finish of every code.
--    finish: app (a decision the app makes), stripe (done in the Stripe dashboard), bank (the card
--    network decides; answer the dispute in Stripe), worker (the worker must act), wait (the app
--    ends it by itself), developer (nobody else can end it safely).
-- ---------------------------------------------------------------------------
create or replace function public.payment_attention_codes()
returns table (code text, reason text, finish text)
language sql immutable
set search_path = public, pg_temp
as $fn$
  values
    ('transfer_reversed',          'The worker''s payout was taken back in Stripe. Decide who gets this money.', 'app'),
    -- M1b (A4-07): under an open card dispute the worker's side is refused (resolve_job_dispute,
    -- resolve_tip) and no refund is sent (refunds_due needs no card dispute), so the bank decides first.
    ('transfer_reversed_disputed', 'The worker''s payout was taken back in Stripe, and the customer also disputed the card charge with their bank. Paying the worker again is refused while the dispute is open, and no refund is sent either. Answer the dispute in Stripe and wait for the bank to decide.', 'bank'),
    ('transfer_stopped',          'Sending the worker''s payout stopped after Stripe said no.', 'developer'),
    ('transfer_no_answer',         'Stripe has not confirmed the worker''s payout for a day.', 'developer'),
    ('transfer_card_dispute',      'The customer disputed the card charge. The payout waits for the bank.', 'bank'),
    ('transfer_issue_open',        'An issue report is open. The payout waits for your decision.', 'app'),
    ('transfer_already_recorded',  'A payout is already recorded for this payment. Ask your developer.', 'developer'),
    -- M1b (A4-07): the predicate proves only that the app will not send it; any refund failure ever
    -- recorded reserves the whole charge, so "what is left" is not known.
    ('transfer_more_than_left',    'The app will not send this payout by itself, because refunds on this payment, or a refund that failed, may leave less than the payout. The app cannot tell the exact amount left. Ask your developer.', 'developer'),
    ('transfer_payee_gone',        'The worker''s account was suspended or deleted, so this payout cannot be sent. Ask your developer.', 'developer'),
    -- M1b (A4 tip history): resolve_tip(id, 'refund') works for a held tip that was never sent.
    ('tip_payee_gone',             'The worker''s account was suspended or deleted, so this tip cannot be sent. You can refund the tip to the customer here.', 'app'),
    ('transfer_payout_review',     'Stripe has not cleared the worker''s payout account yet, so the payout waits. Stripe can also refuse an account; your developer can check which.', 'developer'),
    ('transfer_no_payout_account', 'The worker has not finished setting up payouts. The money waits for them.', 'worker'),
    ('transfer_balance_low',       'Your Stripe balance is too low to pay this worker yet. The app keeps trying until your balance in Stripe covers it.', 'stripe'),
    -- M1b (A4-07): a timeout is not a refusal; the line covers both and reads only a transfer error.
    -- M1c (A5-06): a timeout can follow a send Stripe accepted, so the line never says it did not go through.
    ('transfer_retrying',          'The app has no answer from Stripe that the worker''s payout went through. Stripe refused the last try, or the app got no answer it could read, so the money may or may not have moved. The app keeps trying by itself. Ask your developer if this stays.', 'developer'),
    ('transfer_partly_reversed',   'Part of the worker''s payout was taken back. Ask your developer.', 'developer'),
    ('refund_stopped',             'Sending the customer''s refund stopped after Stripe said no.', 'developer'),
    ('refund_no_answer',           'Stripe has not confirmed the customer''s refund for a day.', 'developer'),
    ('refund_card_dispute',        'The customer disputed the card charge. The refund waits for the bank.', 'bank'),
    ('refund_partly_landed',       'Part of this charge was already refunded in Stripe. Finish the refund in Stripe.', 'stripe'),
    ('refund_more_than_left',      'The refund is bigger than what is left after the payout. Ask your developer.', 'developer'),
    -- M1c (A5-06, A4-05): the amount shown is the refund asked, not what is still owed after a
    -- failed refund that was arranged another way.
    ('refund_failed_before',       'A refund on this charge failed before, so the app does not send this refund by itself. The amount shown is the refund asked, not always what the customer is still owed. Check in Stripe, and in how the failed refund was arranged, what is still owed, and refund only that by hand in Stripe.', 'stripe'),
    ('refund_no_intent',           'There is no Stripe payment to refund. Ask your developer.', 'developer'),
    ('refund_retrying',            'The app has no answer from Stripe that the customer''s refund went through. Stripe refused the last try, or the app got no answer it could read, so the money may or may not have moved. The app keeps trying by itself. Ask your developer if this stays.', 'developer'),
    ('refund_unconfirmed',         'A refund was sent. Stripe has not confirmed it yet. If this stays for a day, ask your developer.', 'developer'),
    -- M1b (A4-03): a failed amount is never shown as a debt. Marking it done is
    -- resolve_refund_failure(payment, note): it records how it was settled and moves no money, so it
    -- also records a refund that was already settled another way.
    ('refund_failed',              'Stripe could not return money to the customer''s card. The amount shown is what that refund tried to return, not always what the customer is still owed. Before you pay anything, check in Stripe for a later refund of this payment that went through, a card dispute, or a payment you already made to the customer. Pay only what is still owed, another way. Then mark it done here, also when nothing more was owed.', 'app'),
    -- A2-04: two or more failures on one payment. A later refund can be a new try for the same
    -- money (the app's refund failed, then one by hand), so the sum is not always what is owed.
    -- M1b (A4-03): the amount shown is the sum capped at the charge, and the sentence says so.
    ('refund_failed_several',      'Stripe could not return money to the customer''s card, more than once. The amount shown adds up the failed refunds, but never more than the charge, and a later failure can be a new try for the same money, so it is not what the customer is still owed. Before you pay anything, check in Stripe for a refund of this payment that went through, a card dispute, or a payment you already made to the customer. Pay only what is still owed, another way. Then mark it done here, also when nothing more was owed.', 'app'),
    -- M1b: the bank may return the money to the customer, so nothing is paid before it decides.
    -- M1c (A5-06): only while a card dispute is open.
    ('refund_failed_disputed',    'Stripe could not return money to the customer''s card, and the customer also disputed the charge with their bank. Do not pay the customer another way while the dispute is open: the bank may return the money to them. Answer the dispute in Stripe first.', 'bank'),
    -- M1c (A5-06): the card dispute is closed and lost: the bank already returned the disputed amount.
    ('refund_failed_dispute_lost', 'Stripe could not return money to the customer''s card, and the customer won a card dispute with their bank, so the bank already gave the customer the disputed amount from your Stripe balance. The failed refund is not a debt for the money the bank returned, so do not pay that again. Ask your developer what, if anything, is still owed.', 'developer'),
    -- M1c (A5-06): the card dispute is closed, neither won nor lost: the app cannot tell the outcome.
    ('refund_failed_dispute_unclear', 'Stripe could not return money to the customer''s card, and the customer''s card dispute with their bank is closed, but the app cannot tell who kept the money. Do not pay the customer another way before your developer checks it. Ask your developer.', 'developer'),
    ('amount_differs',             'Stripe charged a different amount than the app expected. Ask your developer.', 'developer'),
    ('status_unusual',             'This payment is in an unusual state. Ask your developer.', 'developer'),
    -- M1b (A4-05): after a failed refund the refunded total never goes down, so this can be a
    -- counting error and not a loss (finding 2, M3).
    ('money_short',                'The app counts more money out of Stripe than this job brought in. It can be a real loss, for example a card dispute lost after the worker was paid, or a counting error after a refund failed. Ask your developer before you try to get money back.', 'developer'),
    ('card_dispute_open',          'The customer disputed the card charge with their bank. Answer it in Stripe.', 'bank'),
    ('card_dispute_unclear',       'The bank closed the customer''s card dispute, but the app cannot tell who kept the money. Ask your developer.', 'developer'),
    -- M1b (A4-07): a lost dispute is a known outcome; the payout asked for is not sent (the payment
    -- is refunded) and no decision in the app pays the worker under a card dispute.
    ('card_dispute_lost',          'The customer won a card dispute with their bank, so the bank took the charge back from your Stripe balance. The worker''s payout is not sent by itself. Whether the worker is still paid is your decision. Ask your developer.', 'developer'),
    ('job_stuck',                  'This job is paid but still not finished 7 days after its date, or 7 days after the hire if it has no date. Nothing in the app can move this money yet. Ask your developer.', 'developer'),
    ('job_closed_money_held',      'This job was cancelled while its payment was still held. You can refund the customer here. Paying the worker needs your developer.', 'app'),
    -- M1b (A4-07): a failed part refund leaves the refunded total as it was, so the rest shown can be wrong.
    ('refund_outside_app',         'Part of this payment was refunded in Stripe, outside the app, and the app has not decided what happens to the rest. The amount shown may be wrong if a refund failed. Ask your developer.', 'developer'),
    -- M1b (A4-07): no money recorded is not proof that none was taken.
    ('cancel_unconfirmed',         'The app closed this payment because it had no record of money for it, but Stripe has not confirmed that the payment is closed. Money may still have been taken from the card. Ask your developer to check it in Stripe.', 'developer'),
    ('issue_open',                 'A customer reported an issue. Decide who gets the money.', 'app'),
    ('issue_no_show',              'A worker reported that the customer was not there. Decide who gets the money.', 'app'),
    ('event_failed',               'A message from Stripe was received, but the app could not use it. Ask your developer.', 'developer'),
    ('timer_missing',              'An automatic task is not set up. Ask your developer.', 'developer'),
    ('timer_failed',               'An automatic task failed on its last run. Ask your developer.', 'developer'),
    ('timer_late',                 'An automatic task has not finished on time. Ask your developer.', 'developer'),
    ('vault_missing',              'A setting the automatic tasks need is missing. Ask your developer.', 'developer'),
    ('push_stuck',                 'Notifications are not going out. Ask your developer.', 'developer')
$fn$;
revoke all on function public.payment_attention_codes() from public, anon, authenticated;
grant execute on function public.payment_attention_codes() to service_role;
comment on function public.payment_attention_codes() is
  'M1: every payment_attention code with its plain sentence (reason, what the owner reads) and its finish: app (a decision the app makes), stripe (done in the Stripe dashboard), bank (the card network decides; answer the dispute in Stripe), worker (the worker must act), wait (the app ends it by itself), developer (nobody else can end it safely). service_role only.';

-- ---------------------------------------------------------------------------
-- 4. payment_attention, replaced from 20261115000600_refund_failed_and_event_order.sql. Every arm,
--    its order and its conditions as they were, unless a comment says otherwise. Each arm gives
--    code, old (the former reason, kept word for word at the start of detail except (a) to (d) of
--    the header), more (the former detail; none where the old text is 'retrying: ' and the error,
--    which already holds it) and ref.
--
--    SINCE (M1b, A4-10): a display time, not the identity of an episode. Exactly when it can move:
--    - transfer lines: release_requested_at while the attempt is open; the attempt's first send
--      (transfer_sent_at) once it is closed. Moves when the attempt closes, at each new attempt's
--      first send, and when a decision asks for the release again.
--    - refund_stopped, refund_no_answer, refund_unconfirmed: the attempt's first send (refund_sent_at);
--      moves at each new attempt. Without it, updated_at.
--    - card dispute lines: chargeback_at; moves only when every blocking dispute has cleared and a
--      new one opens.
--    - refund_partly_landed, refund_outside_app: the first charge.refunded received; moves never
--      (updated_at only when no such event exists).
--    - amount_differs: held_at (updated_at without it). refund_failed_before and the failed-refund
--      line: the first failure not yet arranged; moves when that one is arranged and others remain.
--    - updated_at, which every write to the payment moves: refund_retrying, refund_no_intent,
--      refund_more_than_left, the refund-side status_unusual, money_short. transfer_partly_reversed:
--      the transfer row's updated_at, moved by each reversal delivery.
--    - job_stuck: 7 days after the window end (or the hire); moves when the job's date changes.
--      job_closed_money_held: cancelled_at, else held_at. cancel_unconfirmed: intent_cancel_at
--      (never moves once set). Issue lines: the report's created_at; event_failed: received_at
--      (neither moves).
--    - task timer_failed: failing_since (moves only after a good run clears it); timer_late:
--      ok_at + stale_after (moves at every good run); push_stuck: the earliest due push (moves
--      when it is sent). timer_missing, the cron timer_failed and vault_missing have none.
-- ---------------------------------------------------------------------------
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
      -- A2-11: a start that only the moves named in SINCE above change; updated_at (moved by every retry) only where the row has none.
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
  'Money rule 4, the owner''s one query: select * from public.payment_attention order by since; Every payment the system will not move by itself, and every automatic task that needs a person, one line per reason. reason: the plain sentence of code (payment_attention_codes); detail: the technical text for a developer; code: a key that does not change for one kind of line; ref: the id of the thing the line is about (the payment, a refund, a transfer, a dispute, an event, cron:<job>, task:<name> or vault:<secret>); finish: app, stripe, bank, worker, wait or developer. Lines: transfers and refunds asked for and not ready (stopped, 23 hours without an answer, a reversal park, a card dispute, an issue report, another amount, a status, more than is left, the payee gone, Stripe reviewing the payee, no payout account, a low balance, no payment intent), rows retrying with an error, refunds sent and not confirmed, one line per payment for the refunds the provider failed until resolve_refund_failure records how they were arranged, money short, partial reversals, card disputes still open, lost or closed unclear, a reversal under an open card dispute, a tip for a worker who is gone, held job payments on jobs still assigned or in_progress 7 days after their date (or hire), held job payments on cancelled jobs directed nowhere (attention_plain), a charge refunded in part outside the app with the rest held, an intent cancel never confirmed after 1 hour, open issue reports (overdue after 2 business days, America/New_York), webhook events that could not be applied or were never applied after 1 hour, and the system lines (a timer missing or failing, a task late, a Vault secret missing, pushes stuck for 15 minutes). service_role only.';

commit;
