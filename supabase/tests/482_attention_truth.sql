-- 482_attention_truth.sql — money M1b (critic A4-03, A4-05, A4-07, A4-10, the tip history): each
-- corrected line of attention_plain, from a NAMED reachable history in which the
-- old sentence was false. Each assertion names the payment's status and every line of that payment
-- as code/ref/amount/finish, the sentence where it was the wrong part, and the money columns where a
-- finish is run.
--
--   T1  a tip for a deleted worker, payouts off: tip_payee_gone, refunded in the app (resolve_tip).
--   T2  a tip for a deleted worker, payouts on: no line, the tip is sent (finding 1, the owner's call).
--   T3  a failed refund, then a refund by hand that went through: the line never asks to pay again,
--       and resolve_refund_failure records "nothing more owed" without moving money (A4-03).
--   T4  a payout reversed while a card dispute is open: transfer_reversed_disputed, for the bank;
--       the worker's side is refused; after the bank's "won", transfer_reversed and the decision works.
--   T5  a lost card dispute with a payout asked for and not sent: card_dispute_lost, not "unclear".
--   T6  a timeout and a refusal: both transfer_retrying with a sentence true for both; the refund
--       side's error never makes a transfer line.
--   T7  an undated job left in progress: job_stuck says "or 7 days after the hire".
--   T8  a cron failure and the task's own report under one name: two lines (A4-10).
--   T9  an intent cancel answered final, then the charge's success arrives: the line said "never
--       paid" before; it ends when the money is known, and the full refund is queued.
--   T10 a late-cancel fee whose refund failed and was arranged: transfer_more_than_left says the
--       amount left is not known (fee plus refund is the charge).
--   T11 a refund by hand that later failed: refund_outside_app says its amount may be wrong.
--   T12 (M1c, A5-06) a payout Stripe accepted while its answer was lost: the retrying sentence is
--       true in that world too, and the line ends when Stripe's record arrives.
--   T13 (M1c, A5-06) a failed refund, then a card dispute: open, for the bank; closed and lost, the
--       bank already returned the money (developer); closed and won, the no-dispute sentence; closed
--       with another status, unclear (developer).
--   T14 (M1c, A5-06, A4-05) a refund asked, then a refund by hand that failed and was arranged
--       before the drain sent it: refund_failed_before, never "already refunded in Stripe".
--
-- FIXTURE SURGERY, DECLARED (now() is fixed inside a transaction):
--   * profiles.is_admin = true for A; rate_counters reset before each hire (as 370 and 480).
--   * T7: job_agreements.accepted_at moved back 8 days (its immutable trigger off around the update).
--   * T8: one cron.job_run_details row, failed, dated a day ahead so it is the job's last run.
--   * T9: payments.intent_cancel_at moved back 2 hours.
-- Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(58);

select tests.create_user('at.c1@brazos.test', 'Ann Customer') as c1 \gset
select tests.create_user('at.w1@brazos.test', 'Art Worker')   as w1 \gset
select tests.create_user('at.w2@brazos.test', 'Bo Worker')    as w2 \gset
select tests.create_user('at.w3@brazos.test', 'Cy Worker')    as w3 \gset
select tests.create_user('at.admin@brazos.test', 'At Admin')  as admin \gset
-- SURGERY: the admin.
update public.profiles set is_admin = true where id = :'admin';

-- ---------------------------------------------------------------------------
-- Helpers (as 480; created inside the transaction, gone at rollback).
-- ---------------------------------------------------------------------------
create or replace function tests.at_hire(p_title text, p_customer uuid, p_worker uuid,
  p_date date default null, p_start smallint default null, p_end smallint default null)
returns uuid language plpgsql as $$
declare
  v_job uuid;
  v_offer uuid;
begin
  perform tests.clear_auth();
  -- SURGERY (B10, as 370): the limit on posts an hour is not what this file tests.
  update public.rate_counters set hits = 0 where user_id in (p_customer, p_worker);
  perform tests.authenticate_as(p_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'Attention truth probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000, p_address_line := '5 Proof Way',
    p_scheduled_date := p_date, p_arrival_start_hour := p_start, p_arrival_end_hour := p_end
  )).id into v_job;
  perform tests.authenticate_as(p_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Truth bid');
  perform tests.authenticate_as(p_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  return v_job;
end $$;

create or replace function tests.at_release(p_job uuid) returns uuid language plpgsql as $$
declare
  v_pid uuid;
begin
  perform tests.authenticate_as((select assigned_worker_id from public.jobs where id = p_job));
  perform public.transition_job_status(p_job, 'in_progress');
  perform public.transition_job_status(p_job, 'completed', '["https://example.com/at-done.jpg"]'::jsonb);
  perform tests.authenticate_as((select client_id from public.jobs where id = p_job));
  v_pid := (public.release_job_payment(p_job)).id;
  perform tests.clear_auth();
  return v_pid;
end $$;

create or replace function tests.at_event(p_id text, p_type text, p_object jsonb) returns jsonb language plpgsql as $$
begin
  insert into public.payment_events (id, type, payload)
  values (p_id, p_type, jsonb_build_object('id', p_id, 'type', p_type, 'data', jsonb_build_object('object', p_object)));
  return public.apply_payment_event(p_id);
end $$;

create or replace function tests.at_refunded(p_id text, p_pid uuid, p_total integer, p_refund text) returns jsonb language sql as $$
  select tests.at_event(p_id, 'charge.refunded', jsonb_build_object(
    'id', 'ch_at_' || left(md5(p_pid::text), 10), 'object', 'charge',
    'payment_intent', (select provider_ref from public.payments where id = p_pid),
    'amount_refunded', p_total,
    'refunds', jsonb_build_object('data', jsonb_build_array(jsonb_build_object('id', p_refund)))))
$$;

create or replace function tests.at_failed(p_id text, p_pid uuid, p_refund text, p_amount integer, p_meta boolean) returns jsonb language sql as $$
  select tests.at_event(p_id, 'refund.failed', jsonb_build_object(
    'id', p_refund, 'object', 'refund', 'amount', p_amount,
    'charge', 'ch_at_' || left(md5(p_pid::text), 10),
    'payment_intent', (select provider_ref from public.payments where id = p_pid),
    'status', 'failed', 'failure_reason', 'expired_or_canceled_card',
    'metadata', case when p_meta then jsonb_build_object('payment_id', p_pid) else '{}'::jsonb end))
$$;

create or replace function tests.at_dispute(p_id text, p_type text, p_pid uuid, p_ref text, p_status text) returns jsonb language sql as $$
  select tests.at_event(p_id, p_type, jsonb_build_object(
    'id', p_ref, 'object', 'dispute', 'status', p_status,
    'amount', (select charge_amount_cents from public.payments where id = p_pid),
    'payment_intent', (select provider_ref from public.payments where id = p_pid)))
$$;

create or replace function tests.at_refund_sent(p_pid uuid, p_ref text) returns text language plpgsql as $$
declare
  v_pay public.payments;
begin
  select * into v_pay from public.payments where id = p_pid;
  return public.settlement_send_begin(p_pid, 'refund', v_pay.refund_attempts, v_pay.refund_cents)::text
      || '/' || public.record_settlement_sent(p_pid, 'refund', p_ref, v_pay.refund_cents)::text;
end $$;

create or replace function tests.at_rows(p_pid uuid) returns text language sql as $$
  select (select status::text from public.payments where id = p_pid) || ' :: '
      || coalesce((select string_agg(a.code || '/' || coalesce(a.ref, 'null') || '/' || coalesce(a.cents::text, 'null')
                                     || '/' || a.finish, ' | ' order by a.code, a.ref)
                     from public.payment_attention a where a.payment_id = p_pid), '<none>')
$$;

create or replace function tests.at_reason(p_pid uuid, p_code text) returns text language sql as $$
  select a.reason from public.payment_attention a where a.payment_id = p_pid and a.code = p_code
$$;

create or replace function tests.at_try(p_sql text) returns text language plpgsql as $$
declare v_out text;
begin
  execute p_sql into v_out;
  return 'ok: ' || coalesce(v_out, 'null');
exception when others then
  return 'error: ' || sqlerrm;
end $$;

-- A tip for a worker who was paid and then deleted the account. p_payouts_off: the worker's payout
-- account is turned off first (as 480 H6e); otherwise it stays enabled (delete_my_account leaves it).
create or replace function tests.at_tip_for_deleted(p_title text, p_customer uuid, p_worker uuid, p_payouts_off boolean)
returns uuid language plpgsql as $$
declare
  v_job uuid;
  v_pid uuid;
  v_tip uuid;
begin
  v_job := tests.at_hire(p_title, p_customer, p_worker);
  perform tests.test_fund_job(v_job);
  v_pid := tests.at_release(v_job);
  perform tests.at_event('evt_at_tc_' || left(md5(v_pid::text), 8), 'transfer.created', jsonb_build_object(
    'id', 'tr_at_' || left(md5(v_pid::text), 8), 'object', 'transfer',
    'amount', (select transfer_cents from public.payments where id = v_pid),
    'metadata', jsonb_build_object('payment_id', v_pid)));
  if p_payouts_off then perform tests.set_payouts(p_worker, 'action_needed'); end if;
  perform tests.authenticate_as(p_worker);
  perform public.delete_my_account();
  perform tests.authenticate_as(p_customer);
  v_tip := (public.begin_tip_payment(v_job, 500)).id;
  perform tests.clear_auth();
  perform public.attach_provider_ref(v_tip, 'pi_at_tip_' || left(md5(v_tip::text), 8));
  perform tests.at_event('evt_at_tip_' || left(md5(v_tip::text), 8), 'payment_intent.succeeded', jsonb_build_object(
    'id', 'pi_at_tip_' || left(md5(v_tip::text), 8), 'object', 'payment_intent',
    'amount_received', (select charge_amount_cents from public.payments where id = v_tip)));
  return v_tip;
end $$;

-- A late-cancel fee: the worker starts, the customer cancels: the fee to the worker, the rest back.
create or replace function tests.at_fee_split(p_title text, p_customer uuid, p_worker uuid) returns uuid language plpgsql as $$
declare
  v_job uuid;
  v_pid uuid;
begin
  v_job := tests.at_hire(p_title, p_customer, p_worker);
  v_pid := tests.test_fund_job(v_job);
  perform tests.authenticate_as(p_worker);
  perform public.transition_job_status(v_job, 'in_progress');
  perform tests.authenticate_as(p_customer);
  perform public.cancel_job(v_job, 'customer_cancelled');
  perform tests.clear_auth();
  return v_pid;
end $$;

-- ---------------------------------------------------------------------------
-- T1, T2. Tips for a deleted worker.
-- ---------------------------------------------------------------------------
select tests.at_tip_for_deleted('AT-T1 tip off', :'c1', :'w2', true) as t1 \gset
select charge_amount_cents as t1c from public.payments where id = :'t1' \gset
select is(tests.at_rows(:'t1'), 'held :: tip_payee_gone/' || :'t1' || '/500/app',
  'T1a: payouts off: tip_payee_gone, decided in the app (was transfer_payee_gone for the developer)');
select is(tests.at_reason(:'t1', 'tip_payee_gone'),
  'The worker''s account was suspended or deleted, so this tip cannot be sent. You can refund the tip to the customer here.',
  'T1b: the sentence names the way that works');
select is(tests.at_try(format('select (public.resolve_tip(%L, %L)).refund_cents::text', :'t1', 'refund')), 'ok: ' || :t1c,
  'T1c: resolve_tip refunds the whole tip charge');
select is((select status::text || '/' || refund_cents || '/' || transfer_cents || '/' || refund_reason
             || '/' || exists (select 1 from public.refunds_ready r where r.id = :'t1')::text
             from public.payments where id = :'t1'),
  'held/' || :t1c || '/0/dispute_refund/true', 'T1d: the money: the charge goes back, nothing to the worker, the refund is ready');
select is(tests.at_rows(:'t1'), 'held :: <none>', 'T1e: then nothing is listed');

select tests.at_tip_for_deleted('AT-T2 tip on', :'c1', :'w3', false) as t2 \gset
select is(tests.at_rows(:'t2') || ' / ready ' || exists (select 1 from public.transfers_ready r where r.id = :'t2')::text,
  'held :: <none> / ready true',
  'T2: payouts still on: no line and the tip is ready to send (today''s rule, finding 1: the owner decides)');

-- ---------------------------------------------------------------------------
-- T3. A failed refund, then a refund by hand that went through (A4-03).
-- ---------------------------------------------------------------------------
select tests.test_fund_job(tests.at_hire('AT-T3 failed then paid', :'c1', :'w1')) as t3 \gset
select charge_amount_cents as t3c from public.payments where id = :'t3' \gset
select tests.authenticate_as(:'w1');
select public.cancel_job((select job_id from public.payments where id = :'t3'), 'worker_cancelled');
select tests.clear_auth();
select is(tests.at_refund_sent(:'t3', 're_at_t3_app'), 'true/true', 'T3a: the drain sent the refund and recorded its id');
select tests.at_refunded('evt_at_t3_ref1', :'t3', :t3c, 're_at_t3_app');
select tests.at_failed('evt_at_t3_fail', :'t3', 're_at_t3_app', :t3c, true);
-- The owner refunds again by hand in Stripe, and that refund goes through.
select tests.at_refunded('evt_at_t3_ref2', :'t3', :t3c, 're_at_t3_hand');
select is(tests.at_rows(:'t3'), 'refunded :: refund_failed/' || :'t3' || '/' || :t3c || '/app',
  'T3b: the failure is still listed (a later success does not clear it)');
select is(tests.at_reason(:'t3', 'refund_failed'),
  'Stripe could not return money to the customer''s card. The amount shown is what that refund tried to return, not always what the customer is still owed. Before you pay anything, check in Stripe for a later refund of this payment that went through, a card dispute, or a payment you already made to the customer. Pay only what is still owed, another way. Then mark it done here, also when nothing more was owed.',
  'T3c (A4-03): the line no longer says "pay the customer that amount": it says to check for the refund that went through');
select ok((select a.detail from public.payment_attention a where a.payment_id = :'t3' and a.code = 'refund_failed')
          like '%resolve_refund_failure(payment id, note); it moves no money, so use it also when the refund was already settled another way%',
  'T3d: the detail names the call that records it without paying again');
select (refund_cents || '/' || coalesce(refunded_cents, 0) || '/' || refund_ref || '/' || refund_attempts) as t3money
  from public.payments where id = :'t3' \gset
select is((public.resolve_refund_failure(:'t3', 'A later refund by hand went through; nothing more owed.')).id, :'t3'::uuid,
  'T3e: the owner records that nothing more was owed');
select is((select refund_cents || '/' || coalesce(refunded_cents, 0) || '/' || refund_ref || '/' || refund_attempts
                  || '/' || exists (select 1 from public.refunds_due r where r.id = :'t3')::text
             from public.payments where id = :'t3'),
  :'t3money' || '/false', 'T3f: no money moves: the refund asked, the refunded total, the ref and the attempt stay; nothing is queued');
select is(tests.at_rows(:'t3'), 'refunded :: <none>', 'T3g: then nothing is listed');

-- ---------------------------------------------------------------------------
-- T4. A payout reversed while a card dispute is open.
-- ---------------------------------------------------------------------------
select tests.at_hire('AT-T4 reversed disputed', :'c1', :'w1') as t4j \gset
select tests.test_fund_job(:'t4j');
select tests.at_release(:'t4j') as t4 \gset
select transfer_cents as t4t from public.payments where id = :'t4' \gset
select tests.at_event('evt_at_t4_tc', 'transfer.created', jsonb_build_object(
  'id', 'tr_at_t4', 'object', 'transfer', 'amount', :t4t, 'metadata', jsonb_build_object('payment_id', :'t4')));
select tests.at_dispute('evt_at_t4_dp', 'charge.dispute.created', :'t4', 'dp_at_t4', 'needs_response');
select tests.at_event('evt_at_t4_rev', 'transfer.reversed', jsonb_build_object(
  'id', 'tr_at_t4', 'object', 'transfer', 'amount', :t4t, 'amount_reversed', :t4t, 'reversed', true,
  'metadata', jsonb_build_object('payment_id', :'t4')));
select is(tests.at_rows(:'t4'), 'held :: transfer_reversed_disputed/' || :'t4' || '/' || :t4t || '/bank',
  'T4a: reversed under an open card dispute: for the bank (was transfer_reversed, "decide who gets this money")');
select is(tests.at_try(format('select (public.resolve_job_dispute(%L, %L)).status::text', :'t4j', 'worker')),
  'error: This payment is under review by the card issuer and cannot be released',
  'T4b: the sentence is true: paying the worker again is refused while the dispute is open');
select tests.at_dispute('evt_at_t4_won', 'charge.dispute.closed', :'t4', 'dp_at_t4', 'won');
select is(tests.at_rows(:'t4'), 'held :: transfer_reversed/' || :'t4' || '/' || :t4t || '/app',
  'T4c: the bank closed it as won: transfer_reversed, decided in the app');
select is(tests.at_try(format('select (public.resolve_job_dispute(%L, %L)).transfer_attempts::text', :'t4j', 'worker')), 'ok: 1',
  'T4d: now the worker''s side works: the payout is asked again under a new attempt');
select is((select transfer_cents || '/' || (transfer_reversed_at is null)::text || '/' || (release_requested_at is not null)::text
                  || '/' || exists (select 1 from public.transfers_ready r where r.id = :'t4')::text
             from public.payments where id = :'t4'),
  :t4t || '/true/true/true', 'T4e: the money: the same payout, the park cleared, ready to send');
select is(tests.at_rows(:'t4'), 'held :: <none>', 'T4f: then nothing is listed');

-- ---------------------------------------------------------------------------
-- T5. A lost card dispute with a payout asked for and not sent.
-- ---------------------------------------------------------------------------
select tests.at_hire('AT-T5 lost', :'c1', :'w1') as t5j \gset
select tests.test_fund_job(:'t5j');
select tests.at_release(:'t5j') as t5 \gset
select transfer_cents as t5t from public.payments where id = :'t5' \gset
select tests.at_dispute('evt_at_t5_dp', 'charge.dispute.created', :'t5', 'dp_at_t5', 'needs_response');
select tests.at_dispute('evt_at_t5_lost', 'charge.dispute.closed', :'t5', 'dp_at_t5', 'lost');
select is(tests.at_rows(:'t5'), 'refunded :: card_dispute_lost/' || :'t5' || '/' || :t5t || '/developer',
  'T5a: a known lost dispute: card_dispute_lost (was card_dispute_unclear, "cannot tell who kept the money")');
select is(exists (select 1 from public.transfers_due r where r.id = :'t5'), false,
  'T5b: the sentence is true: the payout is not sent by itself');

-- ---------------------------------------------------------------------------
-- T6. A timeout and a refusal; and the refund side's error.
-- ---------------------------------------------------------------------------
select tests.at_hire('AT-T6 timeout', :'c1', :'w1') as t6aj \gset
select tests.test_fund_job(:'t6aj');
select tests.at_release(:'t6aj') as t6a \gset
select transfer_cents as t6at from public.payments where id = :'t6a' \gset
select tests.at_hire('AT-T6 refused', :'c1', :'w1') as t6bj \gset
select tests.test_fund_job(:'t6bj');
select tests.at_release(:'t6bj') as t6b \gset
select transfer_cents as t6bt from public.payments where id = :'t6b' \gset
select is(public.settlement_send_begin(:'t6a', 'transfer', 0, :t6at)::text || '/'
          || public.record_settlement_result(:'t6a', 'transfer', 0, 'same_key', 'threw: The signal has been aborted')::text || '/'
          || public.settlement_send_begin(:'t6b', 'transfer', 0, :t6bt)::text || '/'
          || public.record_settlement_result(:'t6b', 'transfer', 0, 'new_key', '400 account_invalid: The destination account cannot receive transfers.')::text,
  'true/true/true/true', 'T6a: one try timed out (same key next run), the other was refused (a new key next run)');
select is(tests.at_rows(:'t6a') || ' || ' || tests.at_rows(:'t6b'),
  'held :: transfer_retrying/' || :'t6a' || '/' || :t6at || '/developer || held :: transfer_retrying/' || :'t6b' || '/' || :t6bt || '/developer',
  'T6b: both are listed as retrying');
select is((select count(distinct a.reason)::integer || '/' || min(a.reason) from public.payment_attention a
            where a.payment_id in (:'t6a', :'t6b')),
  '1/The app has no answer from Stripe that the worker''s payout went through. Stripe refused the last try, or the app got no answer it could read, so the money may or may not have moved. The app keeps trying by itself. Ask your developer if this stays.',
  'T6c: one sentence, true for a timeout and for a refusal (was "Stripe did not accept"; M1c: was "has not gone through yet")');
select tests.at_fee_split('AT-T6 refund side', :'c1', :'w1') as t6c \gset
select refund_cents as t6cr, transfer_cents as t6ct from public.payments where id = :'t6c' \gset
select is(public.settlement_send_begin(:'t6c', 'refund', 0, :t6cr)::text || '/'
          || public.record_settlement_result(:'t6c', 'refund', 0, 'same_key', 'threw: The signal has been aborted')::text
          || '/' || exists (select 1 from public.transfers_ready r where r.id = :'t6c')::text,
  'true/true/true', 'T6d: a fee split: the refund try timed out, and the fee''s payout is ready');
select is(tests.at_rows(:'t6c'), 'held :: refund_retrying/' || :'t6c' || '/' || :t6cr || '/developer',
  'T6e: the refund side''s error makes the refund line only, never a transfer line');

-- ---------------------------------------------------------------------------
-- T7. An undated job left in progress.
-- ---------------------------------------------------------------------------
select tests.at_hire('AT-T7 undated', :'c1', :'w1') as t7j \gset
select tests.test_fund_job(:'t7j') as t7 \gset
select charge_amount_cents as t7c from public.payments where id = :'t7' \gset
select tests.authenticate_as(:'w1');
select public.transition_job_status(:'t7j', 'in_progress');
select tests.clear_auth();
-- SURGERY: the hire was 8 days ago (the terms trigger is off around it, as 030, 340 and 370 do).
alter table public.job_agreements disable trigger job_agreements_immutable;
update public.job_agreements set accepted_at = now() - interval '8 days' where job_id = :'t7j';
alter table public.job_agreements enable trigger job_agreements_immutable;
select is(tests.at_rows(:'t7'), 'held :: job_stuck/' || :'t7' || '/' || :t7c || '/developer',
  'T7a: an undated job 8 days after the hire is listed');
select is(tests.at_reason(:'t7', 'job_stuck'),
  'This job is paid but still not finished 7 days after its date, or 7 days after the hire if it has no date. Nothing in the app can move this money yet. Ask your developer.',
  'T7b: the sentence covers the job with no date (was "after its date" only)');
select is((select a.since from public.payment_attention a where a.payment_id = :'t7' and a.code = 'job_stuck'),
  now() - interval '1 day', 'T7c: since is the hire plus 7 days');

-- ---------------------------------------------------------------------------
-- T8. A cron failure and the task's own report under one name (A4-10).
-- ---------------------------------------------------------------------------
-- SURGERY: the cron job's last run failed (dated a day ahead, so it is the last one).
-- The run id is given (this role may not use cron's sequence); it is above every real one.
insert into cron.job_run_details (runid, jobid, job_pid, database, username, command, status, return_message, start_time, end_time)
select (select coalesce(max(d.runid), 0) + 1000000 from cron.job_run_details d),
       j.jobid, 0, 'postgres', 'postgres', j.command, 'failed', 'probe failure', now() + interval '1 day', now() + interval '1 day'
  from cron.job j where j.jobname = 'expire-open-jobs';
set local role service_role;
select public.record_timer_run('expire-open-jobs', 'probe boom');
reset role;
select is((select string_agg(a.code || '/' || a.ref || '/' || a.finish, ' | ' order by a.ref)
             from public.payment_attention a where a.what = 'system' and a.ref like '%:expire-open-jobs'),
  'timer_failed/cron:expire-open-jobs/developer | timer_failed/task:expire-open-jobs/developer',
  'T8a: two sources, two lines, each ref names its source');
select is((select count(*)::integer from (select what, code, ref from public.payment_attention
                                           group by what, code, ref having count(*) > 1) d), 0,
  'T8b: what, code and ref still name one line');

-- ---------------------------------------------------------------------------
-- T9. An intent cancel answered final, and the charge in fact went through.
-- ---------------------------------------------------------------------------
select tests.at_hire('AT-T9 voided paid', :'c1', :'w1') as t9j \gset
select tests.authenticate_as(:'c1');
select (public.begin_job_payment(:'t9j')).id as t9 \gset
select tests.clear_auth();
select public.attach_provider_ref(:'t9', 'pi_at_t9');
select tests.authenticate_as(:'c1');
select public.cancel_job(:'t9j', 'customer_cancelled');
select tests.clear_auth();
select public.record_intent_cancel(:'t9', true);
select charge_amount_cents as t9c from public.payments where id = :'t9' \gset
-- SURGERY: the cancel answer came 2 hours ago.
update public.payments set intent_cancel_at = now() - interval '2 hours' where id = :'t9';
select is(tests.at_reason(:'t9', 'cancel_unconfirmed'),
  'The app closed this payment because it had no record of money for it, but Stripe has not confirmed that the payment is closed. Money may still have been taken from the card. Ask your developer to check it in Stripe.',
  'T9a: the line no longer says "never paid"');
select tests.at_event('evt_at_t9_paid', 'payment_intent.succeeded', jsonb_build_object(
  'id', 'pi_at_t9', 'object', 'payment_intent', 'amount_received', :t9c));
select is((select status::text || '/' || refund_cents || '/' || refund_reason || '/' || received_cents
                  || '/' || exists (select 1 from public.refunds_ready r where r.id = :'t9')::text
             from public.payments where id = :'t9'),
  'voided/' || :t9c || '/funded_after_void/' || :t9c || '/true',
  'T9b: the charge had gone through: the whole charge is queued back and ready');
select is(tests.at_rows(:'t9'), 'voided :: <none>',
  'T9c: the cancel line ends, and the ready refund is not listed as retrying (its error is not a refund try)');

-- ---------------------------------------------------------------------------
-- T10. A late-cancel fee whose refund failed and was arranged.
-- ---------------------------------------------------------------------------
select tests.at_fee_split('AT-T10 fee', :'c1', :'w1') as t10 \gset
select refund_cents as t10r, transfer_cents as t10t, charge_amount_cents as t10c from public.payments where id = :'t10' \gset
select is((:t10r + :t10t)::integer, :t10c::integer, 'T10a: the fee and the refund add up to the charge');
select is(tests.at_refund_sent(:'t10', 're_at_t10'), 'true/true', 'T10b: the drain sent the refund of the rest');
select tests.at_refunded('evt_at_t10_ref', :'t10', :t10r, 're_at_t10');
select tests.at_failed('evt_at_t10_fail', :'t10', 're_at_t10', :t10r, true);
select is((public.resolve_refund_failure(:'t10', 'Paid back by bank transfer.')).id, :'t10'::uuid, 'T10c: the failure is arranged');
select is(tests.at_rows(:'t10'), 'partially_refunded :: transfer_more_than_left/' || :'t10' || '/' || :t10t || '/developer',
  'T10d: the fee is held back by the refund failure on record');
select is(tests.at_reason(:'t10', 'transfer_more_than_left'),
  'The app will not send this payout by itself, because refunds on this payment, or a refund that failed, may leave less than the payout. The app cannot tell the exact amount left. Ask your developer.',
  'T10e: the sentence says the amount left is not known (was "bigger than what is left after refunds", false here)');

-- ---------------------------------------------------------------------------
-- T11. A refund by hand that later failed.
-- ---------------------------------------------------------------------------
select tests.test_fund_job(tests.at_hire('AT-T11 hand failed', :'c1', :'w1')) as t11 \gset
select charge_amount_cents as t11c from public.payments where id = :'t11' \gset
select tests.at_refunded('evt_at_t11_ref', :'t11', 1000, 're_at_t11_hand');
select tests.at_failed('evt_at_t11_fail', :'t11', 're_at_t11_hand', 1000, false);
select is(tests.at_rows(:'t11'),
  'partially_refunded :: refund_failed/' || :'t11' || '/1000/app | refund_outside_app/' || :'t11' || '/' || (:t11c - 1000) || '/developer',
  'T11a: the hand refund failed, but the refunded total still counts it, so the rest shown is 1000 short');
select is(tests.at_reason(:'t11', 'refund_outside_app'),
  'Part of this payment was refunded in Stripe, outside the app, and the app has not decided what happens to the rest. The amount shown may be wrong if a refund failed. Ask your developer.',
  'T11b: the sentence says the amount may be wrong (was "the rest is still held")');

-- ---------------------------------------------------------------------------
-- T12. A payout Stripe accepted while its answer was lost (M1c, A5-06).
-- ---------------------------------------------------------------------------
select tests.at_hire('AT-T12 accepted lost', :'c1', :'w1') as t12j \gset
select tests.test_fund_job(:'t12j');
select tests.at_release(:'t12j') as t12 \gset
select transfer_cents as t12t from public.payments where id = :'t12' \gset
select is(public.settlement_send_begin(:'t12', 'transfer', 0, :t12t)::text || '/'
          || public.record_settlement_result(:'t12', 'transfer', 0, 'same_key', 'threw: The signal has been aborted')::text || '/'
          || (select transfer_attempts::text from public.payments where id = :'t12'),
  'true/true/0', 'T12a: Stripe made the payout, the answer timed out: the same key next run (attempt 0)');
select is(tests.at_rows(:'t12'), 'held :: transfer_retrying/' || :'t12' || '/' || :t12t || '/developer',
  'T12b: listed as retrying');
select ok(tests.at_reason(:'t12', 'transfer_retrying') like '%may or may not have moved%'
          and tests.at_reason(:'t12', 'transfer_retrying') not like '%not gone through%',
  'T12c: the sentence is true in this world: it never says the payout did not go through');
-- Stripe's own record of that send arrives.
select tests.at_event('evt_at_t12_tc', 'transfer.created', jsonb_build_object(
  'id', 'tr_at_t12', 'object', 'transfer', 'amount', :t12t, 'metadata', jsonb_build_object('payment_id', :'t12')));
select is(tests.at_rows(:'t12'), 'released :: <none>', 'T12d: the payout had gone through: the line ends');

-- ---------------------------------------------------------------------------
-- T13. A failed refund, then a card dispute (M1c, A5-06).
-- ---------------------------------------------------------------------------
create or replace function tests.at_failed_refund(p_title text, p_customer uuid, p_worker uuid) returns uuid language plpgsql as $$
declare
  v_pid uuid;
  v_c integer;
  v_ref text;
begin
  v_pid := tests.test_fund_job(tests.at_hire(p_title, p_customer, p_worker));
  v_c := (select charge_amount_cents from public.payments where id = v_pid);
  v_ref := 're_at_' || left(md5(v_pid::text), 8);
  perform tests.authenticate_as(p_worker);
  perform public.cancel_job((select job_id from public.payments where id = v_pid), 'worker_cancelled');
  perform tests.clear_auth();
  perform tests.at_refund_sent(v_pid, v_ref);
  perform tests.at_refunded('evt_at_ref_' || left(md5(v_pid::text), 8), v_pid, v_c, v_ref);
  perform tests.at_failed('evt_at_fail_' || left(md5(v_pid::text), 8), v_pid, v_ref, v_c, true);
  return v_pid;
end $$;

select tests.at_failed_refund('AT-T13 lost', :'c1', :'w1') as t13 \gset
select charge_amount_cents as t13c from public.payments where id = :'t13' \gset
select tests.at_dispute('evt_at_t13_dp', 'charge.dispute.created', :'t13', 'dp_at_t13', 'needs_response');
select is(tests.at_rows(:'t13'),
  'refunded :: money_short/' || :'t13' || '/' || :t13c || '/developer | refund_failed_disputed/' || :'t13' || '/' || :t13c || '/bank',
  'T13a: the dispute is open: refund_failed_disputed, for the bank');
select tests.at_dispute('evt_at_t13_lost', 'charge.dispute.closed', :'t13', 'dp_at_t13', 'lost');
select is(tests.at_rows(:'t13'),
  'refunded :: money_short/' || :'t13' || '/' || :t13c || '/developer | refund_failed_dispute_lost/' || :'t13' || '/' || :t13c || '/developer',
  'T13b: closed and lost: refund_failed_dispute_lost, for the developer (was "wait for the bank")');
select is(tests.at_reason(:'t13', 'refund_failed_dispute_lost'),
  'Stripe could not return money to the customer''s card, and the customer won a card dispute with their bank, so the bank already gave the customer the disputed amount from your Stripe balance. The failed refund is not a debt for the money the bank returned, so do not pay that again. Ask your developer what, if anything, is still owed.',
  'T13c: the sentence says the bank already returned the money and the failed refund is not a debt for it');
select is((select count(*)::integer from public.payment_attention a where a.payment_id = :'t13' and a.finish = 'bank'), 0,
  'T13d: no line of this payment waits for the bank: it already decided');

select tests.at_failed_refund('AT-T13 won', :'c1', :'w1') as t13w \gset
select tests.at_dispute('evt_at_t13w_dp', 'charge.dispute.created', :'t13w', 'dp_at_t13w', 'needs_response');
select tests.at_dispute('evt_at_t13w_won', 'charge.dispute.closed', :'t13w', 'dp_at_t13w', 'won');
select is(tests.at_rows(:'t13w'), 'refunded :: refund_failed/' || :'t13w' || '/' || :t13c || '/app', 'T13e: closed and won: the failed-refund line of a payment with no dispute');

select tests.at_failed_refund('AT-T13 unclear', :'c1', :'w1') as t13u \gset
select tests.at_dispute('evt_at_t13u_dp', 'charge.dispute.created', :'t13u', 'dp_at_t13u', 'needs_response');
select tests.at_dispute('evt_at_t13u_cl', 'charge.dispute.closed', :'t13u', 'dp_at_t13u', 'under_review');
select is(tests.at_rows(:'t13u'),
  'refunded :: money_short/' || :'t13u' || '/' || :t13c || '/developer | refund_failed_dispute_unclear/' || :'t13u' || '/' || :t13c || '/developer',
  'T13f: closed, neither won nor lost: refund_failed_dispute_unclear, for the developer');
select is(tests.at_reason(:'t13u', 'refund_failed_dispute_unclear'),
  'Stripe could not return money to the customer''s card, and the customer''s card dispute with their bank is closed, but the app cannot tell who kept the money. Do not pay the customer another way before your developer checks it. Ask your developer.',
  'T13g: the sentence says the outcome is not known');

-- ---------------------------------------------------------------------------
-- T14. A refund asked, then a refund by hand that failed and was arranged (M1c, A5-06, A4-05).
-- ---------------------------------------------------------------------------
select tests.at_hire('AT-T14 arranged then asked', :'c1', :'w1') as t14j \gset
select tests.test_fund_job(:'t14j') as t14 \gset
select charge_amount_cents as t14c from public.payments where id = :'t14' \gset
select tests.authenticate_as(:'w1');
select public.cancel_job(:'t14j', 'worker_cancelled');
select tests.clear_auth();
-- Before the drain sends the refund, the owner refunds 1000 by hand in Stripe; it fails, and the
-- owner pays it back another way and records that.
select tests.at_refunded('evt_at_t14_ref', :'t14', 1000, 're_at_t14_hand');
select tests.at_failed('evt_at_t14_fail', :'t14', 're_at_t14_hand', 1000, false);
select is((public.resolve_refund_failure(:'t14', 'Paid 1000 back by bank transfer.')).id, :'t14'::uuid, 'T14a: the failure is arranged');
select is(tests.at_rows(:'t14'), 'partially_refunded :: refund_failed_before/' || :'t14' || '/' || :t14c || '/stripe', 'T14c: the refund asked: refund_failed_before (was refund_partly_landed, "already refunded in Stripe")');
select is(tests.at_reason(:'t14', 'refund_failed_before'),
  'A refund on this charge failed before, so the app does not send this refund by itself. The amount shown is the refund asked, not always what the customer is still owed. Check in Stripe, and in how the failed refund was arranged, what is still owed, and refund only that by hand in Stripe.',
  'T14d: the sentence says the amount is the refund asked, not what is owed');
select is(exists (select 1 from public.refunds_due r where r.id = :'t14'), false,
  'T14e: the sentence is true: the app sends nothing by itself');

-- ---------------------------------------------------------------------------
-- Z. Every line of the view, after the histories above.
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from public.payment_attention a
             join public.payment_attention_codes() s on s.code = a.code
            where a.reason is distinct from s.reason or a.finish is distinct from s.finish), 0,
  'Z1: every line reads its sentence and its finish from the map');
select is((select count(*)::integer from public.payment_attention a
            where not exists (select 1 from public.payment_attention_codes() s where s.code = a.code)), 0,
  'Z2: every line has a code in the map');

select * from finish();
rollback;
