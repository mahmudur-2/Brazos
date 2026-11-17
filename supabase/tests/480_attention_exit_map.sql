-- 480_attention_exit_map.sql — money M1 (A2-09, A2-04, A2-10, A2-11): every way a payment leaves
-- payment_attention, from NAMED reachable histories. Proves attention_plain: the
-- columns code, ref and finish, the plain reason, the new lines (job_closed_money_held, R6;
-- refund_outside_app; cancel_unconfirmed; a stored event never applied, F7), the payee line split by
-- cause, and one failed-refund line per payment with the sum.
--
-- EACH HISTORY is built by the real functions (create_job, create_offer, accept_offer,
-- begin_job_payment, attach_provider_ref, cancel_job, transition_job_status, release_job_payment,
-- begin_tip_payment, ban_user, delete_my_account, mark_worker_arrival, open_job_dispute,
-- settlement_send_begin, record_settlement_sent, record_settlement_result, record_intent_cancel,
-- set_payouts_status, resolve_job_dispute, resolve_refund_failure) or by the exact rows the webhook
-- writes (a payment_events row, then apply_payment_event). A fixture that fails to build aborts the
-- file, so the plan fails. Each assertion names the payment's status and every line of that payment
-- as code/ref/amount/finish, and the line's since where the history gives it a start.
--
-- WHAT ENDS EACH LINE (no line has finish wait: nothing here ends by itself on a clock).
--   cancel_unconfirmed       payment_intent.canceled applied (H1). No bound today: M2 R-F.
--   (M1b: the corrected sentences and their histories are in 482_attention_truth.sql.)
--   refund_outside_app       a person; no function directs the rest of the payment today (H2).
--   refund_unconfirmed       charge.refunded covering the refund (H3), or refund.failed (H4).
--   refund_failed(_several)  resolve_refund_failure, by the developer: service_role only (H4).
--   transfer_stopped         a person in Stripe, then record_settlement_sent or settlement_send_reopen (H5).
--   transfer_no_payout_account  the worker finishes setup (payouts enabled), H6a. No time bound.
--   transfer_payee_gone      a person (developer): the payee cannot come back (H6d).
--   tip_payee_gone           resolve_tip(id, 'refund'), by the developer: service_role only (H6e; the refund itself: 482 T1).
--   job_closed_money_held    resolve_job_dispute in the customer's favour (H7).
--   job_stuck                a person (developer); no function moves it today (H8).
--   issue_no_show/issue_open resolve_job_dispute (H9, H10).
--   event_failed             apply_payment_event succeeding (E).
--
-- THE CAST: customers C1 and C2 (C2 only for H7: a ban cancels every open job of the customer);
-- workers W1 (enabled payouts) and W2 to W5 (one for each payee cause of H6); the admin A; the
-- runner (RLS bypassed: the webhook's, the drain's and the owner's stand-in).
--
-- FIXTURE SURGERY, DECLARED. now() is fixed inside a transaction, so time moves only by surgery:
--   * profiles.is_admin = true for A (as 230 and 290 do).
--   * rate_counters reset before each hire (as 370 does, B10).
--   * H1: payments.intent_cancel_at moved back 2 hours (the 1-hour wait for payment_intent.canceled).
--   * E: payment_events.received_at moved back 2 hours (the 1-hour wait for a stored event).
--   * H7: jobs.cancelled_at set back to null after the ban: the shape a ban before ban_switch left.
-- Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(43);

select tests.create_user('ax.c1@brazos.test', 'Ada Customer') as c1 \gset
select tests.create_user('ax.c2@brazos.test', 'Abe Customer') as c2 \gset
select tests.create_user('ax.w1@brazos.test', 'Ari Worker')   as w1 \gset
select tests.create_user('ax.w2@brazos.test', 'Bea Worker')   as w2 \gset
select tests.create_user('ax.w3@brazos.test', 'Cal Worker')   as w3 \gset
select tests.create_user('ax.w4@brazos.test', 'Dee Worker')   as w4 \gset
select tests.create_user('ax.w5@brazos.test', 'Eve Worker')   as w5 \gset
select tests.create_user('ax.admin@brazos.test', 'Ax Admin')  as admin \gset
-- SURGERY: the admin.
update public.profiles set is_admin = true where id = :'admin';

-- ---------------------------------------------------------------------------
-- Helpers (created inside the transaction, gone at rollback).
-- ---------------------------------------------------------------------------
create or replace function tests.ax_hire(p_title text, p_customer uuid, p_worker uuid,
  p_date date default null, p_start smallint default null, p_end smallint default null)
returns uuid language plpgsql as $$
declare
  v_job uuid;
  v_offer uuid;
  v_over boolean;
begin
  perform tests.clear_auth();
  -- SURGERY (B10, as 370): the limit on posts an hour is not what this file tests.
  update public.rate_counters set hits = 0 where user_id in (p_customer, p_worker);
  -- post_window (as 370): no post for a window already over. Such a booking is posted for tomorrow,
  -- hired, then moved back to its own day (SURGERY): the job a customer booked and had taken before it.
  v_over := public.job_window_over(p_date, p_end, now());
  perform tests.authenticate_as(p_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'Exit map probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000, p_address_line := '4 Proof Way',
    p_scheduled_date := case when v_over then (now() at time zone 'America/New_York')::date + 1 else p_date end,
    p_arrival_start_hour := p_start, p_arrival_end_hour := p_end
  )).id into v_job;
  perform tests.authenticate_as(p_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Exit map bid');
  perform tests.authenticate_as(p_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  if v_over then
    update public.jobs set scheduled_date = p_date where id = v_job;   -- SURGERY (post_window)
  end if;
  return v_job;
end $$;

-- The worker finishes the job and the customer releases it: the transfer is asked for, nothing is
-- sent yet. Returns the payment id.
create or replace function tests.ax_release(p_job uuid) returns uuid language plpgsql as $$
declare
  v_pid uuid;
begin
  perform tests.authenticate_as((select assigned_worker_id from public.jobs where id = p_job));
  perform public.transition_job_status(p_job, 'in_progress');
  perform public.transition_job_status(p_job, 'completed', '["https://example.com/ax-done.jpg"]'::jsonb);
  perform tests.authenticate_as((select client_id from public.jobs where id = p_job));
  v_pid := (public.release_job_payment(p_job)).id;
  perform tests.clear_auth();
  return v_pid;
end $$;

-- A provider event, stored and applied (the webhook's two steps).
create or replace function tests.ax_event(p_id text, p_type text, p_object jsonb) returns jsonb language plpgsql as $$
begin
  insert into public.payment_events (id, type, payload)
  values (p_id, p_type, jsonb_build_object('id', p_id, 'type', p_type, 'data', jsonb_build_object('object', p_object)));
  return public.apply_payment_event(p_id);
end $$;

-- charge.refunded: the charge's running refunded total p_total, newest refund p_refund.
create or replace function tests.ax_refunded(p_id text, p_pid uuid, p_total integer, p_refund text) returns jsonb language sql as $$
  select tests.ax_event(p_id, 'charge.refunded', jsonb_build_object(
    'id', 'ch_ax_' || left(md5(p_pid::text), 10), 'object', 'charge',
    'payment_intent', (select provider_ref from public.payments where id = p_pid),
    'amount_refunded', p_total,
    'refunds', jsonb_build_object('data', jsonb_build_array(jsonb_build_object('id', p_refund)))))
$$;

-- refund.failed: the documented Refund object. p_meta: the drain's metadata[payment_id] (a refund
-- made by hand in the dashboard carries none).
create or replace function tests.ax_failed(p_id text, p_pid uuid, p_refund text, p_amount integer, p_meta boolean) returns jsonb language sql as $$
  select tests.ax_event(p_id, 'refund.failed', jsonb_build_object(
    'id', p_refund, 'object', 'refund', 'amount', p_amount,
    'charge', 'ch_ax_' || left(md5(p_pid::text), 10),
    'payment_intent', (select provider_ref from public.payments where id = p_pid),
    'status', 'failed', 'failure_reason', 'expired_or_canceled_card',
    'metadata', case when p_meta then jsonb_build_object('payment_id', p_pid) else '{}'::jsonb end))
$$;

-- The worker cancels: the whole charge is queued back to the card.
create or replace function tests.ax_worker_cancel(p_pid uuid) returns void language plpgsql as $$
begin
  perform tests.authenticate_as((select payee_id from public.payments where id = p_pid));
  perform public.cancel_job((select job_id from public.payments where id = p_pid), 'worker_cancelled');
  perform tests.clear_auth();
end $$;

-- The drain's two writes for a refund it sent: settlement_send_begin, then record_settlement_sent.
create or replace function tests.ax_refund_sent(p_pid uuid, p_ref text) returns text language plpgsql as $$
declare
  v_pay public.payments;
  v_begun boolean;
begin
  select * into v_pay from public.payments where id = p_pid;
  v_begun := public.settlement_send_begin(p_pid, 'refund', v_pay.refund_attempts, v_pay.refund_cents);
  return v_begun::text || '/' || public.record_settlement_sent(p_pid, 'refund', p_ref, v_pay.refund_cents)::text;
end $$;

-- The payment's status, then every line of it: code/ref/amount/finish.
create or replace function tests.ax_rows(p_pid uuid) returns text language sql as $$
  select (select status::text from public.payments where id = p_pid) || ' :: '
      || coalesce((select string_agg(a.code || '/' || coalesce(a.ref, 'null') || '/' || coalesce(a.cents::text, 'null')
                                     || '/' || a.finish, ' | ' order by a.code, a.ref)
                     from public.payment_attention a where a.payment_id = p_pid), '<none>')
$$;

create or replace function tests.ax_since(p_pid uuid, p_code text) returns timestamptz language sql as $$
  select a.since from public.payment_attention a where a.payment_id = p_pid and a.code = p_code
$$;

create or replace function tests.ax_try(p_sql text) returns text language plpgsql as $$
declare v_out text;
begin
  execute p_sql into v_out;
  return 'ok: ' || coalesce(v_out, 'null');
exception when others then
  return 'error: ' || sqlerrm;
end $$;

create or replace function tests.ax_ny_today() returns date language sql stable as $$
  select (now() at time zone 'America/New_York')::date
$$;

-- ---------------------------------------------------------------------------
-- H1. A refused intent cancel on a voided payment. The customer starts checkout (an intent exists)
-- and cancels before paying: cancel_job voids the row. The drain asks Stripe to cancel the intent.
-- A refusal and a success both stamp the attempt final (record_intent_cancel(p, true); the answer
-- is not stored), so the only proof the intent closed is payment_intent.canceled.
-- ---------------------------------------------------------------------------
select tests.ax_hire('AX-H1 voided', :'c1', :'w1') as h1j \gset
select tests.authenticate_as(:'c1');
select (public.begin_job_payment(:'h1j')).id as h1p \gset
select tests.clear_auth();
select public.attach_provider_ref(:'h1p', 'pi_ax_h1');
select tests.authenticate_as(:'c1');
select public.cancel_job(:'h1j', 'customer_cancelled');
select tests.clear_auth();
select public.record_intent_cancel(:'h1p', true);
select charge_amount_cents as h1c from public.payments where id = :'h1p' \gset

select is(tests.ax_rows(:'h1p'), 'voided :: <none>',
  'H1a: within the hour after the cancel answer, nothing is listed (payment_intent.canceled may still come)');
-- SURGERY: the cancel answer came 2 hours ago.
update public.payments set intent_cancel_at = now() - interval '2 hours' where id = :'h1p';
select is(tests.ax_rows(:'h1p'), 'voided :: cancel_unconfirmed/pi_ax_h1/' || :h1c || '/developer',
  'H1b: 2 hours later and no payment_intent.canceled: one line, ref the intent, the charge, for the developer');
select is(tests.ax_since(:'h1p', 'cancel_unconfirmed'), now() - interval '2 hours',
  'H1c (A2-11): since is the cancel answer (intent_cancel_at)');
select tests.ax_event('evt_ax_h1_canceled', 'payment_intent.canceled',
  jsonb_build_object('id', 'pi_ax_h1', 'object', 'payment_intent', 'status', 'canceled'));
select is(tests.ax_rows(:'h1p'), 'voided :: <none>', 'H1d: payment_intent.canceled applied ends it');

-- ---------------------------------------------------------------------------
-- H2. partially_refunded by a refund the app did not make: the owner refunds 10.00 by hand in Stripe
-- on a held payment. No release or refund takes a partially_refunded row by itself.
-- ---------------------------------------------------------------------------
select tests.test_fund_job(tests.ax_hire('AX-H2 hand refund', :'c1', :'w1')) as h2p \gset
select charge_amount_cents as h2c from public.payments where id = :'h2p' \gset
select tests.ax_refunded('evt_ax_h2_ref', :'h2p', 1000, 're_ax_h2_hand');
select is(tests.ax_rows(:'h2p'), 'partially_refunded :: refund_outside_app/' || :'h2p' || '/' || (:h2c - 1000) || '/developer',
  'H2a: one line, ref the payment, the amount still held, for the developer');
select is(tests.ax_since(:'h2p', 'refund_outside_app'), (select received_at from public.payment_events where id = 'evt_ax_h2_ref'),
  'H2b (A2-11): since is the first charge.refunded');

-- ---------------------------------------------------------------------------
-- H3. An unconfirmed refund: the worker cancels, the drain sends the refund and records its id, and
-- Stripe has not sent charge.refunded yet.
-- ---------------------------------------------------------------------------
select tests.test_fund_job(tests.ax_hire('AX-H3 unconfirmed', :'c1', :'w1')) as h3p \gset
select charge_amount_cents as h3c from public.payments where id = :'h3p' \gset
select tests.ax_worker_cancel(:'h3p');
select is(tests.ax_refund_sent(:'h3p', 're_ax_h3'), 'true/true', 'H3a: the drain began the refund and recorded its id');
select is(tests.ax_rows(:'h3p'), 'held :: refund_unconfirmed/re_ax_h3/' || :h3c || '/developer',
  'H3b: one line, ref the refund, the charge, for the developer');
select is(tests.ax_since(:'h3p', 'refund_unconfirmed'), (select refund_sent_at from public.payments where id = :'h3p'),
  'H3c (A2-11): since is the first send of the attempt');
select tests.ax_refunded('evt_ax_h3_ref', :'h3p', :h3c, 're_ax_h3');
select is(tests.ax_rows(:'h3p'), 'refunded :: <none>', 'H3d: charge.refunded for the whole refund ends it');

-- ---------------------------------------------------------------------------
-- H4. A failed refund, then a payment with two failed refunds (A2-04). The app's refund fails; the
-- owner tries again by hand in Stripe and that one fails too: two failures, one decision.
-- ---------------------------------------------------------------------------
select tests.test_fund_job(tests.ax_hire('AX-H4 failed', :'c1', :'w1')) as h4p \gset
select charge_amount_cents as h4c from public.payments where id = :'h4p' \gset
select tests.ax_worker_cancel(:'h4p');
select is(tests.ax_refund_sent(:'h4p', 're_ax_h4_app'), 'true/true', 'H4a: the drain began the refund and recorded its id');
select tests.ax_refunded('evt_ax_h4_ref1', :'h4p', :h4c, 're_ax_h4_app');
select tests.ax_failed('evt_ax_h4_fail1', :'h4p', 're_ax_h4_app', :h4c, true);
select is(tests.ax_rows(:'h4p'), 'refunded :: refund_failed/' || :'h4p' || '/' || :h4c || '/developer',
  'H4b: one failed refund: refund_failed, ref the payment, its amount, marked done by the developer');
select tests.ax_refunded('evt_ax_h4_ref2', :'h4p', :h4c, 're_ax_h4_hand');
select tests.ax_failed('evt_ax_h4_fail2', :'h4p', 're_ax_h4_hand', :h4c, false);
select is(tests.ax_rows(:'h4p'), 'refunded :: refund_failed_several/' || :'h4p' || '/' || :h4c || '/developer',
  'H4c (A2-04): two failures are ONE line with the other sentence; the sum (twice the charge) is capped at the charge');
select ok((select a.detail from public.payment_attention a where a.payment_id = :'h4p')
          like 'refund re_ax_h4_app failed at the provider (expired_or_canceled_card), ' || :h4c || ' cents; '
            || 'refund re_ax_h4_hand failed at the provider (expired_or_canceled_card), ' || :h4c || ' cents. '
            || 'Record how it was arranged with resolve_refund_failure%',
  'H4d: the line names each failed refund with its amount');
select is(tests.ax_since(:'h4p', 'refund_failed_several'),
          (select min(failed_at) from public.payment_refund_failures where payment_id = :'h4p'),
  'H4e (A2-11): since is the first failure');
select is((public.resolve_refund_failure(:'h4p', 'Paid back by bank transfer.')).id, :'h4p'::uuid,
  'H4f: one decision arranges both');
select is(tests.ax_rows(:'h4p'), 'refunded :: <none>', 'H4g: then nothing is listed');

-- H4D. A failed refund under a card dispute (A2-10): the refund went out, the customer disputed the
-- charge, then the refund failed. Paying the customer another way could pay twice.
select tests.test_fund_job(tests.ax_hire('AX-H4D failed disputed', :'c1', :'w1')) as h4dp \gset
select charge_amount_cents as h4dc from public.payments where id = :'h4dp' \gset
select tests.ax_worker_cancel(:'h4dp');
select is(tests.ax_refund_sent(:'h4dp', 're_ax_h4d'), 'true/true', 'H4D-a: the drain began the refund and recorded its id');
select tests.ax_refunded('evt_ax_h4d_ref', :'h4dp', :h4dc, 're_ax_h4d');
select tests.ax_event('evt_ax_h4d_dp', 'charge.dispute.created', jsonb_build_object(
  'id', 'dp_ax_h4d', 'object', 'dispute', 'status', 'needs_response', 'amount', :h4dc,
  'payment_intent', (select provider_ref from public.payments where id = :'h4dp')));
select tests.ax_failed('evt_ax_h4d_fail', :'h4dp', 're_ax_h4d', :h4dc, true);
-- KNOWN (reported for M3, not changed in M1): money_short is also listed, because payment_money
-- counts a failed refund as refunded (refunded_cents never goes down). The money came back, so the
-- payment is not short. This assertion pins today's lines so the fix has to change it.
select is(tests.ax_rows(:'h4dp'),
  'refunded :: money_short/' || :'h4dp' || '/' || :h4dc || '/developer | refund_failed_disputed/' || :'h4dp' || '/' || :h4dc || '/bank',
  'H4D-b: the failed refund under a card dispute has its own sentence and waits for the bank (M1b); the known money_short is for the developer (M1b, A4-05)');

-- ---------------------------------------------------------------------------
-- H5. A stopped transfer: the drain began the transfer and Stripe's answer needs a person.
-- ---------------------------------------------------------------------------
select tests.ax_hire('AX-H5 stopped', :'c1', :'w1') as h5j \gset
select tests.test_fund_job(:'h5j');
select tests.ax_release(:'h5j') as h5p \gset
select transfer_cents as h5t from public.payments where id = :'h5p' \gset
select is(public.settlement_send_begin(:'h5p', 'transfer', 0, :h5t), true, 'H5a: the drain began the transfer');
select is(public.record_settlement_result(:'h5p', 'transfer', 0, 'stop',
  '400 idempotency_error: Keys for idempotent requests can only be used with the same parameters they were first used with.'),
  true, 'H5b: Stripe refused it and the drain stopped');
select is(tests.ax_rows(:'h5p'), 'held :: transfer_stopped/' || :'h5p' || '/' || :h5t || '/developer',
  'H5c: one line, ref the payment, the transfer amount, for the developer');
select is(tests.ax_since(:'h5p', 'transfer_stopped'), (select transfer_sent_at from public.payments where id = :'h5p'),
  'H5d (A2-11): since is the first send of the attempt');

-- ---------------------------------------------------------------------------
-- H6. Payouts off (A2-10: the payee line by cause).
-- ---------------------------------------------------------------------------
-- H6a. Setup not finished: the worker can come back and finish it.
select tests.ax_hire('AX-H6a setup', :'c1', :'w2') as h6aj \gset
select tests.test_fund_job(:'h6aj');
select tests.ax_release(:'h6aj') as h6ap \gset
select transfer_cents as h6at from public.payments where id = :'h6ap' \gset
select tests.set_payouts(:'w2', 'action_needed');
select is(tests.ax_rows(:'h6ap'), 'held :: transfer_no_payout_account/' || :'h6ap' || '/' || :h6at || '/worker',
  'H6a: setup not finished: the worker finishes it');
select tests.set_payouts(:'w2', 'enabled');
select is(tests.ax_rows(:'h6ap'), 'held :: <none>', 'H6b: setup finished: the payout is ready and nothing is listed');

-- H6c. Stripe reviewing the account (connect-status also writes under_review for a rejected one).
select tests.ax_hire('AX-H6c review', :'c1', :'w3') as h6cj \gset
select tests.test_fund_job(:'h6cj');
select tests.ax_release(:'h6cj') as h6cp \gset
select transfer_cents as h6ct from public.payments where id = :'h6cp' \gset
select tests.set_payouts(:'w3', 'under_review');
select is(tests.ax_rows(:'h6cp'), 'held :: transfer_payout_review/' || :'h6cp' || '/' || :h6ct || '/developer',
  'H6c: Stripe reviewing the account: not the worker''s to finish, so the developer');

-- H6d. The account gone: banned.
select tests.ax_hire('AX-H6d banned', :'c1', :'w4') as h6dj \gset
select tests.test_fund_job(:'h6dj');
select tests.ax_release(:'h6dj') as h6dp \gset
select transfer_cents as h6dt from public.payments where id = :'h6dp' \gset
select tests.set_payouts(:'w4', 'action_needed');
select tests.authenticate_as(:'admin');
select public.ban_user(:'w4');
select tests.clear_auth();
select is(tests.ax_rows(:'h6dp'), 'held :: transfer_payee_gone/' || :'h6dp' || '/' || :h6dt || '/developer',
  'H6d: a banned worker cannot come back to finish setup: never "waits for them"');

-- H6e. The account gone: deleted. The worker was paid and deleted the account; the customer then
-- tips (begin_tip_payment does not look at the worker).
select tests.ax_hire('AX-H6e deleted', :'c1', :'w5') as h6ej \gset
select tests.test_fund_job(:'h6ej');
select tests.ax_release(:'h6ej') as h6ep \gset
select tests.ax_event('evt_ax_h6e_tc', 'transfer.created', jsonb_build_object(
  'id', 'tr_ax_h6e', 'object', 'transfer',
  'amount', (select transfer_cents from public.payments where id = :'h6ep'),
  'metadata', jsonb_build_object('payment_id', :'h6ep')));
select tests.set_payouts(:'w5', 'action_needed');
select tests.authenticate_as(:'w5');
select public.delete_my_account();
select tests.clear_auth();
select tests.authenticate_as(:'c1');
select (public.begin_tip_payment(:'h6ej', 500)).id as h6et \gset
select tests.clear_auth();
select public.attach_provider_ref(:'h6et', 'pi_ax_h6e_tip');
select tests.ax_event('evt_ax_h6e_tip', 'payment_intent.succeeded', jsonb_build_object(
  'id', 'pi_ax_h6e_tip', 'object', 'payment_intent',
  'amount_received', (select charge_amount_cents from public.payments where id = :'h6et')));
select is(tests.ax_rows(:'h6et'), 'held :: tip_payee_gone/' || :'h6et' || '/500/developer',
  'H6e (M1b): a held tip never sent, for a deleted worker: tip_payee_gone, refunded by the developer (resolve_tip, service_role only, 482 T1)');

-- ---------------------------------------------------------------------------
-- H7. A held payment on a cancelled job (R6): an admin bans the customer of a job in progress. The
-- ban cancels the job and leaves the payment held and directed nowhere (A11 review 2).
-- ---------------------------------------------------------------------------
select tests.ax_hire('AX-H7 banned customer', :'c2', :'w1') as h7j \gset
select tests.test_fund_job(:'h7j') as h7p \gset
select charge_amount_cents as h7c from public.payments where id = :'h7p' \gset
select tests.authenticate_as(:'w1');
select public.transition_job_status(:'h7j', 'in_progress');
select tests.authenticate_as(:'admin');
select public.ban_user(:'c2');
select tests.clear_auth();
update public.jobs set cancelled_at = null where id = :'h7j';
select is((select status::text || '/' || coalesce(cancelled_at::text, 'no cancelled_at') from public.jobs where id = :'h7j'),
  'cancelled/no cancelled_at', 'H7a: the ban cancelled the job in progress (and stamps no cancelled_at)');
select is(tests.ax_rows(:'h7p'), 'held :: job_closed_money_held/' || :'h7p' || '/' || :h7c || '/app',
  'H7b (R6): one line, ref the payment, the charge, decided in the app');
select is(tests.ax_since(:'h7p', 'job_closed_money_held'), (select held_at from public.payments where id = :'h7p'),
  'H7c (A2-11): with no cancelled_at, since is the funding');
select is(tests.ax_try(format('select (public.resolve_job_dispute(%L, %L)).status::text', :'h7j', 'worker')),
  'error: A cancelled job with no open claim can only be resolved in the customer''s favour',
  'H7d: the sentence is true: paying the worker has no function');
select is(tests.ax_try(format('select (public.resolve_job_dispute(%L, %L)).refund_cents::text', :'h7j', 'customer')),
  'ok: ' || :h7c, 'H7e: the customer''s favour queues the whole charge back');
select is(tests.ax_rows(:'h7p'), 'held :: <none>', 'H7f: then the refund is ready and nothing is listed');

-- ---------------------------------------------------------------------------
-- H8. A paid job not finished 7 days after its date (N13 stays 7).
-- ---------------------------------------------------------------------------
select tests.test_fund_job(tests.ax_hire('AX-H8 stuck', :'c1', :'w1', tests.ax_ny_today() - 9, 9::smallint, 12::smallint)) as h8p \gset
select charge_amount_cents as h8c from public.payments where id = :'h8p' \gset
select is(tests.ax_rows(:'h8p'), 'held :: job_stuck/' || :'h8p' || '/' || :h8c || '/developer',
  'H8a: one line, ref the payment, the charge, for the developer (no function moves it)');
select is(tests.ax_since(:'h8p', 'job_stuck'),
          ((tests.ax_ny_today() - 9)::timestamp + interval '12 hours') at time zone 'America/New_York' + interval '7 days',
  'H8b (A2-11): since is 7 days after the arrival window ended');

-- ---------------------------------------------------------------------------
-- H9, H10. Issue reports: the worker's no-show claim and the customer's own report.
-- ---------------------------------------------------------------------------
select tests.test_fund_job(tests.ax_hire('AX-H9 no-show', :'c1', :'w1', tests.ax_ny_today() - 1, 9::smallint, 12::smallint)) as h9p \gset
select job_id as h9j from public.payments where id = :'h9p' \gset
select tests.authenticate_as(:'w1');
select public.mark_worker_arrival(:'h9j', 'arrived');
select public.cancel_job(:'h9j', 'customer_no_show');
select tests.clear_auth();
select id as h9d from public.job_disputes where job_id = :'h9j' and status = 'open' \gset
select is(tests.ax_rows(:'h9p'), 'held :: issue_no_show/' || :'h9d' || '/null/app',
  'H9: the worker''s no-show claim: issue_no_show, ref the claim, and no job_closed_money_held while it is open');

select tests.ax_hire('AX-H10 issue', :'c1', :'w1') as h10j \gset
select tests.test_fund_job(:'h10j') as h10p \gset
select tests.authenticate_as(:'w1');
select public.transition_job_status(:'h10j', 'in_progress');
select public.transition_job_status(:'h10j', 'completed', '["https://example.com/ax-done.jpg"]'::jsonb);
select tests.authenticate_as(:'c1');
select (public.open_job_dispute(:'h10j', 'no_show')).id as h10d \gset
select tests.clear_auth();
select is(tests.ax_rows(:'h10p'), 'held :: issue_open/' || :'h10d' || '/null/app',
  'H10: the customer''s own report (reason no_show too) is issue_open, ref the report');

-- ---------------------------------------------------------------------------
-- E. A stored event never applied (F7: attempts 0). The webhook stored it and its apply never ran.
-- ---------------------------------------------------------------------------
insert into public.payment_events (id, type, payload) values
  ('evt_ax_never', 'charge.refunded', jsonb_build_object('id', 'evt_ax_never', 'type', 'charge.refunded',
     'data', jsonb_build_object('object', jsonb_build_object('id', 'ch_ax_never', 'object', 'charge')))),
  ('evt_ax_fresh', 'charge.refunded', jsonb_build_object('id', 'evt_ax_fresh', 'type', 'charge.refunded',
     'data', jsonb_build_object('object', jsonb_build_object('id', 'ch_ax_fresh', 'object', 'charge'))));
-- SURGERY: evt_ax_never was received 2 hours ago.
update public.payment_events set received_at = now() - interval '2 hours' where id = 'evt_ax_never';
select is((select string_agg(a.code || '/' || a.ref || '/' || coalesce(a.payment_id::text, 'null') || '/' || a.finish
                             || '/' || a.overdue::text || '/' || (a.since = now() - interval '2 hours')::text, ' | ' order by a.ref)
             from public.payment_attention a where a.what = 'event' and a.ref in ('evt_ax_never', 'evt_ax_fresh')),
  'event_failed/evt_ax_never/null/developer/false/true',
  'E: stored 2 hours ago and never applied (attempts 0): listed from when it came; one stored now is not');

-- ---------------------------------------------------------------------------
-- Z. Every line of the view, after all the histories above.
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from public.payment_attention a
            where not exists (select 1 from public.payment_attention_codes() s where s.code = a.code)), 0,
  'Z1: every line has a code in the map');
select is((select count(*)::integer from public.payment_attention a
             join public.payment_attention_codes() s on s.code = a.code
            where a.reason is distinct from s.reason or a.finish is distinct from s.finish), 0,
  'Z2: every line reads its sentence and its finish from the map');
select is((select count(*)::integer from (select what, code, ref from public.payment_attention
                                           group by what, code, ref having count(*) > 1) d), 0,
  'Z3: what, code and ref name one line');
select is((select count(*)::integer from public.payment_attention where code is null or ref is null or finish = 'wait'), 0,
  'Z4: every line has a code and a ref, and none says wait');

select * from finish();
rollback;
