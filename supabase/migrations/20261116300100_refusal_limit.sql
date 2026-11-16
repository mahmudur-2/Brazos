-- refusal_limit — money M2-3 (R-E, the 3-day limit): a transfer or refund that
-- Stripe refuses on every try stops after 3 days and is listed, and payouts enabled again give a
-- waiting payout a fresh 3 days.
-- Proof: supabase/tests/485_refusal_limit.sql.
--
-- WHAT WAS WRONG. A refusal (a 4xx that proves its key made nothing, classify.mjs) ends its attempt,
-- and the next tick sends a new attempt under a new key (record_settlement_result 'new_key'). The
-- attempt counter is not a failure counter and nothing counted the refusals, so a refusal that keeps
-- coming back (balance_insufficient, an account Stripe will not pay, a parameter Stripe rejects) was
-- sent again every five minutes with no end, and its line (transfer_balance_low, transfer_retrying,
-- refund_retrying) never changed.
--
-- WHAT CHANGES (additive; nothing that 9d1c56d calls changes its signature or result shape).
-- 1. settlement_refusals (new table, RLS on, no policy, no grant): one row per payment and kind for
--    its current run of refusals: the first refusal's time (it never moves while the run lasts), the
--    attempt and time of the last refusal, how many, and when the run ended. A run goes on only while
--    each refusal is for the attempt right after the last refused one, so every attempt in it ended
--    refused (an unknown answer keeps its attempt and does not break the run; any other move of the
--    counter does). It ends at any stop, and for a transfer when the payee's payouts are enabled
--    again. A side table, not payments columns: payment_for_party (client-executable, restated only
--    after the access lane's M2) would have to null new payments columns.
-- 2. record_settlement_result: restated from settlement_guards word for word (p_next and p_error read
--    through v_next and v_error), plus the run: a refusal more than 3 days after the first refusal of
--    its run becomes the existing stop (the attempt closes, the queue no longer offers the row, and it
--    is listed as transfer_stopped or refund_stopped), and last_error says so first. 3 days is the
--    existing number of payment_attention's overdue flag. A refusal proved that its key made nothing,
--    so the stop leaves nothing unknown; settlement_send_reopen (the owner) starts a new attempt, and
--    its first refusal starts a new run.
-- 3. set_payouts_status: restated from connect_onboarding (the same update, the same answer, the same
--    refusal of an unknown status), plus one step: when it enables payouts that were not enabled, the
--    payee's transfer runs end, so a payout that waited for the worker starts a fresh 3 days. No key
--    changes: a key changes only after a refusal or by the owner.
-- 4. payment_attention_codes: restated from attention_plain word for word except the sentence of
--    transfer_balance_low, which said the app keeps trying until the balance covers it.
--    M2-1c: the codes are attention_plain's as of M1c (critic A5-06), word for word, with that one change.
--
-- Additive under scripts/staging-scan.sh.

begin;

-- 1. The run of refusals.
create table if not exists public.settlement_refusals (
  payment_id       uuid not null references public.payments (id) on delete cascade,
  kind             text not null check (kind in ('transfer', 'refund')),
  first_refused_at timestamptz not null,
  last_attempt     integer not null,
  last_refused_at  timestamptz not null,
  refusals         integer not null check (refusals > 0),
  ended_at         timestamptz,
  primary key (payment_id, kind)
);
alter table public.settlement_refusals enable row level security;
revoke all on table public.settlement_refusals from public, anon, authenticated, service_role;
comment on table public.settlement_refusals is
  'M2-3 (R-E): one row per payment and kind (transfer, refund) for its current run of refusals (record_settlement_result new_key): first_refused_at, the first refusal of the run (never moves while it lasts); last_attempt and last_refused_at, the last one; refusals, how many; ended_at, when the run ended (a stop, or for a transfer the payee''s payouts enabled again). The run goes on only while each refusal is for the attempt right after the last refused one. A refusal more than 3 days after first_refused_at stops the row. No client and no service_role grant: written by record_settlement_result and set_payouts_status.';

-- 2. The drain's answer, with the run.
create or replace function public.record_settlement_result(
  p_payment_id uuid, p_kind text, p_attempt integer, p_next text, p_error text)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_pay   public.payments;
  v_run   public.settlement_refusals;
  v_have  boolean;
  v_next  text := p_next;
  v_error text := p_error;
  v_since timestamptz;
  v_count integer;
begin
  if p_kind is distinct from 'transfer' and p_kind is distinct from 'refund' then
    raise exception 'record_settlement_result: unknown kind %; transfer or refund only', coalesce(p_kind, '<null>');
  end if;
  if p_next is null or p_next not in ('new_key', 'same_key', 'stop') then
    raise exception 'record_settlement_result: unknown next step %; new_key, same_key or stop only', coalesce(p_next, '<null>');
  end if;
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then return false; end if;

  -- M2-3 (R-E): the run of refusals, for the current attempt only (a stale answer changes nothing).
  if p_attempt is not distinct from (case when p_kind = 'transfer' then v_pay.transfer_attempts
                                          else v_pay.refund_attempts end) then
    select * into v_run from public.settlement_refusals r
     where r.payment_id = p_payment_id and r.kind = p_kind for update;
    v_have := found;
    if p_next = 'new_key' then
      if v_have and v_run.ended_at is null and v_run.last_attempt = p_attempt - 1 then
        v_since := v_run.first_refused_at;
        v_count := v_run.refusals + 1;
      else
        v_since := now();
        v_count := 1;
      end if;
      if v_since < now() - interval '3 days' then
        v_next  := 'stop';
        v_error := 'refused on every try for 3 days (since ' || v_since::text || ', ' || v_count::text
                   || ' tries), stopped. Last answer: ' || coalesce(p_error, '');
      end if;
      insert into public.settlement_refusals as r
             (payment_id, kind, first_refused_at, last_attempt, last_refused_at, refusals, ended_at)
      values (p_payment_id, p_kind, v_since, p_attempt, now(), v_count, case when v_next = 'stop' then now() end)
      on conflict (payment_id, kind) do update
         set first_refused_at = excluded.first_refused_at,
             last_attempt     = excluded.last_attempt,
             last_refused_at  = excluded.last_refused_at,
             refusals         = excluded.refusals,
             ended_at         = excluded.ended_at;
    elsif p_next = 'stop' and v_have and v_run.ended_at is null then
      update public.settlement_refusals set ended_at = now()
       where payment_id = p_payment_id and kind = p_kind;
    end if;
  end if;

  if p_kind = 'transfer' then
    -- A stale answer (the attempt moved on meanwhile) changes nothing.
    if p_attempt is distinct from v_pay.transfer_attempts then return false; end if;
    update public.payments set
      transfer_attempts     = transfer_attempts + (case when v_next = 'new_key' then 1 else 0 end),
      transfer_sent_at      = case when v_next = 'stop' and transfer_sent_attempt is distinct from transfer_attempts
                                   then now() else transfer_sent_at end,
      transfer_sent_attempt = case when v_next = 'stop' then transfer_attempts else transfer_sent_attempt end,
      transfer_stopped_at   = case when v_next = 'stop' then now() else transfer_stopped_at end,
      last_error            = left('transfer: ' || coalesce(v_error, ''), 500),
      updated_at            = now()
    where id = p_payment_id;
  else
    if p_attempt is distinct from v_pay.refund_attempts then return false; end if;
    update public.payments set
      refund_attempts     = refund_attempts + (case when v_next = 'new_key' then 1 else 0 end),
      refund_sent_at      = case when v_next = 'stop' and refund_sent_attempt is distinct from refund_attempts
                                 then now() else refund_sent_at end,
      refund_sent_attempt = case when v_next = 'stop' then refund_attempts else refund_sent_attempt end,
      refund_stopped_at   = case when v_next = 'stop' then now() else refund_stopped_at end,
      last_error          = left('refund: ' || coalesce(v_error, ''), 500),
      updated_at          = now()
    where id = p_payment_id;
  end if;
  return true;
end $fn$;
revoke all on function public.record_settlement_result(uuid, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.record_settlement_result(uuid, text, integer, text, text) to service_role;
comment on function public.record_settlement_result(uuid, text, integer, text, text) is
  'service_role only, step 3 of process-settlements for every answer that is not a 2xx: new_key (a refusal: the attempt counter + 1, the next tick sends a new key), same_key (unknown: the same key next tick, until 23 hours after its first use), stop (the row stops and shows in payment_attention). Always last_error and updated_at. An answer for an attempt that is no longer current returns false and changes nothing. M2-3 (R-E): refusals are counted in runs (settlement_refusals); a refusal more than 3 days after the first refusal of its run is recorded as a stop, and last_error begins "refused on every try for 3 days"; any stop ends the run. Moves no money.';

-- 3. The payout state; payouts enabled again give the payee's waiting payouts a fresh run.
create or replace function public.set_payouts_status(p_user_id uuid, p_status text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_was boolean;
begin
  select a.payouts_enabled into v_was from public.payment_accounts a where a.user_id = p_user_id for update;
  if not found then return false; end if;
  update public.payment_accounts
     set payouts_status = p_status,
         payouts_enabled = (p_status = 'enabled'),
         payouts_checked_at = now(),
         updated_at = now()
   where user_id = p_user_id;
  -- M2-3 (R-E): enabled now and not before: a transfer refused while it waited starts a fresh run.
  if p_status = 'enabled' and not coalesce(v_was, false) then
    update public.settlement_refusals r
       set ended_at = now()
     where r.kind = 'transfer' and r.ended_at is null
       and r.payment_id in (select p.id from public.payments p where p.payee_id = p_user_id);
  end if;
  return true;
end $fn$;
revoke all on function public.set_payouts_status(uuid, text) from public, anon, authenticated;
grant execute on function public.set_payouts_status(uuid, text) to service_role;
comment on function public.set_payouts_status(uuid, text) is
  'service_role only (R5b connect-onboarding / connect-status): records the app-facing payout state and derives payouts_enabled from it (= enabled). Returns true when a payment_accounts row matched; an unknown status fails on payment_accounts_payouts_status_known. M2-3 (R-E): when it enables payouts that were not enabled, the payee''s transfer refusal runs end (settlement_refusals), so a payout that waited starts a fresh 3 days.';

-- 4. The code map: one sentence changed (transfer_balance_low).
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
  'M1: every payment_attention code with its plain sentence (reason, what the owner reads) and its finish: app (a decision the app makes), stripe (done in the Stripe dashboard), bank (the card network decides; answer the dispute in Stripe), worker (the worker must act), wait (the app ends it by itself), developer (nobody else can end it safely). service_role only. M2-3 (refusal_limit): the transfer_balance_low sentence says the app stops after 3 days of refusals.';

commit;
