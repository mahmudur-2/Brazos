-- money_not_moving — money M2, A5 point 12 (2e, the catch-all in a new form): a held job payment that
-- the automatic approval must pay, and did not, is listed on the owner's list.
-- Proof: supabase/tests/488_money_not_moving.sql.
--
-- WHAT WAS WRONG. The coverage table (A5 point 12) found one state a received payment can rest in
-- with no line once its time has passed: a completed job, the payment held, nothing asked and nothing
-- blocking. auto_release_due_payments (auto_release_told_gate) asks for the release at the latest 7
-- days after completion (the lifecycle lane's new clock: 168 hours), every 10 minutes; each of its
-- refusals (an open issue report, a card dispute, a refund asked, a reversal park, a status other than
-- held) has a line of its own, except one (A9): a recorded refund failure that reserves the whole
-- charge. When the clock itself does not pay (a timer that runs and matches nothing, a changed
-- function), only the timer lines could show it, and they name a timer missing or failing, never the
-- payment.
--
-- WHAT CHANGES (additive).
-- 1. payment_attention_more(): restated from intent_reread word for word, plus two arms,
--    money_not_moving: a held job payment that the automatic approval must pay (A9 PART 2 b: the
--    lifecycle's own eligibility, auto_approval_deadline(job) is not null, 20261116200000_release_clock),
--    more than 169 hours after the job's completion (completed_at; the bound "completed + 168 hours + 1
--    hour"). since = that deadline. Never a line for a normal wait: before 169 hours the approval may
--    still pay.
--    And (A9 PART 2 b (2)) payout_not_automatic: the same held rows that the approval refuses
--    (auto_approval_deadline is null) while no other line explains the hold, since the completion
--    time. With the arm's exclusions the one clause of auto_approval_deadline left is the reservation
--    (20261116200000_release_clock.sql:149): a recorded refund failure, arranged or not, reserves the
--    whole charge, so the payout never fits. A held payment with no route out is never without a line.
-- 2. payment_attention_codes(): restated from refusal_limit word for word, plus the two sentences.
-- The view (money_timers) is not restated: it reads both functions.
--
-- Additive under scripts/staging-scan.sh.

begin;

-- 1. The lines added after attention_plain, plus money_not_moving and payout_not_automatic.
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
  union all
  -- M2-2 (R-F): a cancel the queue still offers, unproven for more than 1 day since its first
  -- unproven answer.
  select p.id, p.job_id, 'payment'::text, 'cancel_unconfirmed'::text,
         'intent ' || p.provider_ref || ': cancel not proven 1 day after the first answer (' || c.first_tried_at::text
           || '); last answer ' || c.checked_at::text || ': ' || c.answer || ' (payment_intent_checks)',
         c.first_tried_at + interval '1 day', true, p.charge_amount_cents, p.last_error, p.provider_ref
    from public.intents_to_cancel q
    join public.payments p on p.id = q.id
    join public.payment_intent_checks c on c.payment_id = q.id
   where c.first_tried_at < now() - interval '1 day'
  union all
  -- A5 point 12 (money_not_moving), A9 PART 2 b: a held job payment that the automatic approval must
  -- pay (the lifecycle's own eligibility: auto_approval_deadline is not null) and did not, more than
  -- 169 hours after the job's completion (it pays at the latest 168 hours after completion; 1 hour
  -- more for its 10-minute timer). Its own deadline: completed_at + 169 hours.
  select p.id, p.job_id, 'payment'::text, 'money_not_moving'::text,
         'job completed ' || j.completed_at::text
           || ': payment still held and no release asked 169 hours later (the automatic approval pays by 168 hours)',
         j.completed_at + interval '169 hours', true, p.charge_amount_cents, p.last_error, p.id::text
    from public.payments p
    join public.jobs j on j.id = p.job_id
   where p.kind = 'job_payment' and p.status = 'held'
     and j.completed_at < now() - interval '169 hours'
     and public.auto_approval_deadline(j.id) is not null
  union all
  -- A9 PART 2 b (2), payout_not_automatic: the rows money_not_moving leaves out because the automatic
  -- approval refuses them (auto_approval_deadline is null) while no other line explains the hold: a
  -- held stripe job payment, completed more than 169 hours ago, nothing asked, no card dispute, no
  -- reversal park, no open issue report. With these exclusions the one clause of
  -- auto_approval_deadline left (20261116200000_release_clock.sql:149) is the reservation: a recorded
  -- refund failure, arranged or not, reserves the whole charge (payment_refund_reserved_cents), so the
  -- payout never fits. Since: the completion time.
  select p.id, p.job_id, 'payment'::text, 'payout_not_automatic'::text,
         'job completed ' || j.completed_at::text
           || ': payment still held and no release asked 169 hours later; the automatic approval does not ask for it ('
           || case when exists (select 1 from public.payment_refund_failures f where f.payment_id = p.id)
                   then 'a refund of this charge failed before: payment_refund_reserved_cents reserves the whole charge'
                   else 'auto_approval_deadline is null' end || ')',
         j.completed_at, true, p.charge_amount_cents, p.last_error, p.id::text
    from public.payments p
    join public.jobs j on j.id = p.job_id
   where p.provider = 'stripe' and p.kind = 'job_payment' and p.status = 'held'
     and j.status = 'completed'
     and j.completed_at < now() - interval '169 hours'
     and p.release_requested_at is null and coalesce(p.refund_cents, 0) = 0
     and p.chargeback_at is null and p.transfer_reversed_at is null
     and not exists (select 1 from public.job_disputes d where d.job_id = j.id and d.status = 'open')
     and public.auto_approval_deadline(j.id) is null
$fn$;
revoke all on function public.payment_attention_more() from public, anon, authenticated;
grant execute on function public.payment_attention_more() to service_role;
comment on function public.payment_attention_more() is
  'M2: the payment_attention arms added after attention_plain, in its arm columns (payment_id, job_id, what, code, old, since, overdue, cents, more, ref). M2-1: a task with an expected row that never reported, late after expected_from + stale_after. M2-2: cancel_unconfirmed for a row of intents_to_cancel whose cancel is unproven 1 day after its first unproven answer (payment_intent_checks). A5 point 12 (money_not_moving), A9 PART 2 b: a held job payment that the automatic approval must pay (auto_approval_deadline is not null) on a job completed more than 169 hours ago, since completed_at + 169 hours. A9 PART 2 b (2): payout_not_automatic, a held stripe job payment completed more than 169 hours ago with nothing asked, no card dispute, no reversal park and no open issue report that the approval refuses (auto_approval_deadline is null: today only a recorded refund failure), since completed_at. service_role only; read by payment_attention.';

-- 2. The code map, plus money_not_moving and payout_not_automatic.
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
    -- M2-3 (R-E): a refusal that repeats for 3 days now stops the payout (then transfer_stopped).
    ('transfer_balance_low',       'Your Stripe balance is too low to pay this worker yet. The app keeps trying, and stops if Stripe still says no after 3 days. Add money to your Stripe balance.', 'stripe'),
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
    -- A5 point 12: the automatic approval pays at the latest 168 hours after completion; nothing in
    -- the app pays a completed job without an issue report but the customer's approval and that clock.
    ('money_not_moving',           'This job was completed more than 7 days ago and its payment is still held. The automatic approval should have asked for the worker''s payout by then. Ask your developer.', 'developer'),
    -- A9 PART 2 b (2): the one cause today is a recorded refund failure (release_clock.sql:149).
    ('payout_not_automatic',       'This job was completed more than 7 days ago and its payment is still held. A refund on this payment failed before, so the app does not pay the worker by itself. Ask your developer.', 'developer'),
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
  'M1: every payment_attention code with its plain sentence (reason, what the owner reads) and its finish: app (a decision the app makes), stripe (done in the Stripe dashboard), bank (the card network decides; answer the dispute in Stripe), worker (the worker must act), wait (the app ends it by itself), developer (nobody else can end it safely). service_role only. M2-3 (refusal_limit): the transfer_balance_low sentence says the app stops after 3 days of refusals. A5 point 12 (money_not_moving): one code added.';

commit;
