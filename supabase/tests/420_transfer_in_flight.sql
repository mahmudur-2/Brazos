-- 420_transfer_in_flight.sql — pack 1, A1: a transfer whose send began and whose result is not
-- recorded is money on its way to the worker. Proves 20261115000000_transfer_in_flight.sql
-- (payment_transfer_unconfirmed; open_job_dispute, resolve_job_dispute and resolve_tip refuse while it
-- holds), the reservation in refunds_due (20261115000200_work_start_money_rule.sql), (§W, Codex
-- R4-A4) resolve_job_dispute's refusal to decide for the worker over a refund recorded or begun, and
-- (§X, Codex R5-A1, R5-A3) the amount named at send-begin, the one rule for a decision that changes
-- a refund the app sent or may have sent, and the refund lines a refunded total covers. (§G, G1-1) a
-- reversed late-cancel fee decided for the worker is sent again; (F5b, R7b, R14b, G1-6) the refund line
-- counts an unconfirmed transfer.
--
-- THE ORDER. The race is two committed calls in the wrong order: settlement_send_begin commits, the
-- provider's answer is lost, then the dispute or the refund decision runs. Each call here reads what
-- the previous one wrote, which is what two committed calls see. Simultaneous calls cannot
-- interleave: settlement_send_begin, open_job_dispute and resolve_job_dispute each lock the same
-- payments row FOR UPDATE, so they serialize into one of the two orders tested here (§A and §C).
--
-- THE CAST: a customer, a worker with an enabled payout account (tests.create_user), the runner (RLS
-- bypassed; the drain's and the owner's stand-in). Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(128);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('if.customer@brazos.test', 'Ivy Customer') as customer \gset
select tests.create_user('if.worker@brazos.test',   'Ike Worker')   as worker   \gset
insert into fx values ('customer', :'customer'), ('worker', :'worker');

create or replace function tests.if_try(p_sql text) returns text language plpgsql as $$
declare v_out text;
begin
  execute p_sql into v_out;
  return 'ok: ' || coalesce(v_out, 'null');
exception when others then
  return 'error: ' || sqlerrm;
end $$;

create or replace function tests.if_event(p_id text, p_type text, p_object jsonb) returns jsonb language plpgsql as $$
begin
  insert into public.payment_events (id, type, payload)
  values (p_id, p_type, jsonb_build_object('id', p_id, 'type', p_type, 'data', jsonb_build_object('object', p_object)))
  on conflict (id) do nothing;
  return public.apply_payment_event(p_id);
end $$;

-- Hire at $50 and fund. p_stage: 'started' (in progress) or 'released' (completed and approved).
create or replace function tests.if_job(p_title text, p_stage text) returns uuid language plpgsql as $$
declare
  v_customer uuid := (select v from fx where k = 'customer');
  v_worker   uuid := (select v from fx where k = 'worker');
  v_job uuid;
  v_offer uuid;
begin
  perform tests.clear_auth();
  update public.rate_counters set hits = 0 where user_id in (v_customer, v_worker);
  perform tests.authenticate_as(v_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'In-flight probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000, p_address_line := '4 Proof Way'
  )).id into v_job;
  perform tests.authenticate_as(v_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'In-flight bid');
  perform tests.authenticate_as(v_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  perform tests.test_fund_job(v_job);
  perform tests.authenticate_as(v_worker);
  perform public.transition_job_status(v_job, 'in_progress');
  if p_stage = 'released' then
    perform public.transition_job_status(v_job, 'completed', '["https://example.com/if-done.jpg"]'::jsonb);
    perform tests.authenticate_as(v_customer);
    perform public.release_job_payment(v_job);
  end if;
  perform tests.clear_auth();
  return v_job;
end $$;

-- The helper, through if_try so a missing function is a failed assertion, not an aborted file.
create or replace function tests.if_unconfirmed(p_pid uuid) returns text language sql as $$
  select tests.if_try(format('select public.payment_transfer_unconfirmed(p)::text from public.payments p where p.id = %L', p_pid))
$$;

create or replace function tests.if_dispute(p_job uuid) returns text language plpgsql as $$
declare v_out text;
begin
  perform tests.authenticate_as((select fx.v from fx where fx.k = 'customer'));
  v_out := tests.if_try(format('select (public.open_job_dispute(%L, %L)).status::text', p_job, 'other'));
  perform tests.clear_auth();
  return v_out;
end $$;

create or replace function tests.if_record(p_pid uuid, p_kind text, p_ref text) returns text language sql as $$
  select tests.if_try(format('select public.record_settlement_sent(%L, %L, %L, %s)::text', p_pid, p_kind, p_ref,
    (select case when p_kind = 'refund' then refund_cents else transfer_cents end from public.payments where id = p_pid)))
$$;

-- ---------------------------------------------------------------------------
-- 0. The helper: one rule, service_role only (the queues read it as service_role).
-- ---------------------------------------------------------------------------
select ok(to_regprocedure('public.payment_transfer_unconfirmed(public.payments)') is not null
          and has_function_privilege('service_role', 'public.payment_transfer_unconfirmed(public.payments)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.payment_transfer_unconfirmed(public.payments)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.payment_transfer_unconfirmed(public.payments)', 'EXECUTE'),
  '0a: payment_transfer_unconfirmed(payments) exists and only service_role may execute it');

-- ---------------------------------------------------------------------------
-- A. Send begun, answer lost, then the dispute and the refund decision.
-- ---------------------------------------------------------------------------
select tests.if_job('IF approved', 'released') as ja \gset
select id as pa from public.payments where job_id = :'ja' and kind = 'job_payment' \gset
select is(tests.if_unconfirmed(:'pa'), 'ok: false', 'A1: approved, not yet sent: nothing is on its way');
select is(public.settlement_send_begin(:'pa', 'transfer', 0, (select transfer_cents from public.payments where id = :'pa')), true, 'A2: the drain begins the send (attempt 0)');
select is(public.record_settlement_result(:'pa', 'transfer', 0, 'same_key', 'no answer: timeout'), true,
  'A3: the answer is lost: same key next tick');
select is(tests.if_unconfirmed(:'pa'), 'ok: true', 'A4: the transfer is now on its way, result unknown');
select is(tests.if_dispute(:'ja'), 'error: This payment is already on its way to the worker and can no longer be held',
  'A5: the customer cannot open a dispute that would promise to hold money already sent');
select is((select count(*) from public.job_disputes where job_id = :'ja'), 0::bigint, 'A6: and no dispute row was written');
-- A dispute opened before this rule existed: the runner writes the row as it would be.
insert into public.job_disputes (job_id, payment_id, opened_by, reason, details)
select :'ja', :'pa', :'customer', 'other', 'opened before the in-flight rule'
 where not exists (select 1 from public.job_disputes where job_id = :'ja' and status = 'open');
select is(tests.if_try(format('select (public.resolve_job_dispute(%L, %L)).refund_cents::text', :'ja', 'customer')),
  'error: A transfer to the worker was sent and its result is not recorded yet: record it or reopen it first.',
  'A7: the owner cannot refund the customer while the transfer''s result is unknown');
select is((select coalesce(refund_cents, 0) from public.payments where id = :'pa'), 0, 'A8: and no refund was queued');
-- classify.mjs:159-162: the only transfer stop is an idempotency error, after a first use of the key that
-- may have created the transfer. A stopped attempt is still unknown until reopened or recorded.
select is(public.record_settlement_result(:'pa', 'transfer', 0, 'stop', '400 idempotency_error'), true, 'A9: the attempt stops');
select is(tests.if_unconfirmed(:'pa'), 'ok: true', 'A10: a stopped transfer attempt still counts as on its way');
select is(tests.if_record(:'pa', 'transfer', 'tr_if_a_0001'), 'ok: true',
  'A11: the owner finds the transfer in Stripe and records it');
select is(tests.if_unconfirmed(:'pa'), 'ok: false', 'A12: recorded: nothing is unknown any more');

-- ---------------------------------------------------------------------------
-- B. Reopened after a look in Stripe ("it does not exist"): the dispute paths work again.
-- ---------------------------------------------------------------------------
select tests.if_job('IF reopened', 'released') as jb \gset
select id as pb from public.payments where job_id = :'jb' and kind = 'job_payment' \gset
select public.settlement_send_begin(:'pb', 'transfer', 0, (select transfer_cents from public.payments where id = :'pb')) as begun_b \gset
select public.record_settlement_result(:'pb', 'transfer', 0, 'same_key', 'no answer') as lost_b \gset
update public.payments set transfer_sent_at = now() - interval '24 hours' where id = :'pb';
select is(public.settlement_send_reopen(:'pb', 'transfer'), true, 'B1: 23 hours passed; the owner reopens the transfer');
select is(tests.if_unconfirmed(:'pb'), 'ok: false', 'B2: a reopened attempt is not on its way');
select is(tests.if_dispute(:'jb'), 'ok: open', 'B3: the customer can open a dispute again');
select is(tests.if_try(format('select (public.resolve_job_dispute(%L, %L)).refund_cents::text', :'jb', 'customer')),
  'ok: ' || (select charge_amount_cents from public.payments where id = :'pb')::text,
  'B4: and the owner can refund in full');

-- ---------------------------------------------------------------------------
-- C. Control and the other order: approved, nothing sent, dispute first.
-- ---------------------------------------------------------------------------
select tests.if_job('IF control', 'released') as jc \gset
select id as pc from public.payments where job_id = :'jc' and kind = 'job_payment' \gset
select is(tests.if_dispute(:'jc'), 'ok: open', 'C1: no send begun: the dispute opens as today');
select is(public.settlement_send_begin(:'pc', 'transfer', 0, (select transfer_cents from public.payments where id = :'pc')), false, 'C2: the other order: an open dispute keeps the drain from sending');
select is(tests.if_try(format('select (public.resolve_job_dispute(%L, %L)).refund_cents::text', :'jc', 'customer')),
  'ok: ' || (select charge_amount_cents from public.payments where id = :'pc')::text,
  'C3: and it resolves for the customer as today');
select ok(exists (select 1 from public.refunds_due where id = :'pc'), 'C4: the full refund is queued');

-- ---------------------------------------------------------------------------
-- T. A held tip whose transfer send began: resolve_tip may not refund it.
-- ---------------------------------------------------------------------------
select tests.if_job('IF tip', 'released') as jt \gset
select id as ptj from public.payments where job_id = :'jt' and kind = 'job_payment' \gset
select tests.if_event('evt_if_tc_' || :'ptj', 'transfer.created', jsonb_build_object(
  'id', 'tr_if_t_0001', 'amount', (select transfer_cents from public.payments where id = :'ptj'),
  'metadata', jsonb_build_object('payment_id', :'ptj'))) as tc \gset
select tests.authenticate_as(:'customer');
select (public.begin_tip_payment(:'jt', 1000)).id as tip \gset
select tests.clear_auth();
select public.attach_provider_ref(:'tip', 'pi_if_tip_0001');
select tests.if_event('evt_if_ts_' || :'tip', 'payment_intent.succeeded', jsonb_build_object(
  'id', 'pi_if_tip_0001', 'amount_received', (select charge_amount_cents from public.payments where id = :'tip'),
  'metadata', jsonb_build_object('payment_id', :'tip'))) as ts \gset
select is(public.settlement_send_begin(:'tip', 'transfer', 0, (select transfer_cents from public.payments where id = :'tip')), true, 'T1: the tip''s transfer send begins');
select is(tests.if_try(format('select (public.resolve_tip(%L, %L)).refund_cents::text', :'tip', 'refund')),
  'error: A transfer to the worker was sent and its result is not recorded yet: record it or reopen it first.',
  'T2: the owner cannot refund a tip whose transfer may already be with the worker');

-- ---------------------------------------------------------------------------
-- F. The cancellation fee: a transfer and a partial refund queued together go in either order.
-- ---------------------------------------------------------------------------
select tests.if_job('IF fee one', 'started') as jf1 \gset
select id as pf1 from public.payments where job_id = :'jf1' and kind = 'job_payment' \gset
select tests.authenticate_as(:'customer');
select (public.cancel_job(:'jf1', 'customer_cancelled')).status as cancelled_f1 \gset
select tests.clear_auth();
select ok((select transfer_cents > 0 and refund_cents = charge_amount_cents - transfer_cents from public.payments where id = :'pf1'),
  'F1: a cancel after the work started queues the fee to the worker and the rest back to the customer');
select ok(exists (select 1 from public.transfers_ready where id = :'pf1') and exists (select 1 from public.refunds_ready where id = :'pf1'),
  'F2: both are queued');
-- Order 1: the transfer first, its answer not back yet.
select is(public.settlement_send_begin(:'pf1', 'transfer', 0, (select transfer_cents from public.payments where id = :'pf1')), true, 'F3: order 1: the fee transfer send begins');
select ok(exists (select 1 from public.refunds_ready where id = :'pf1'),
  'F4: the refund still goes: the charge less the fee on its way is exactly what is left');
update public.payments set refund_cents = refund_cents + 1 where id = :'pf1';
select ok(not exists (select 1 from public.refunds_due where id = :'pf1'),
  'F5: one cent more than is left is held back while the fee transfer is unknown');
select is((select string_agg(reason, ' | ' order by reason) from public.payment_attention where payment_id = :'pf1' and what = 'refund'),
  'refund is more than is left after the transfer: a person decides',
  'F5b (G1-6): and payment_attention names why: the unconfirmed fee transfer is counted, as refunds_due counts it');
update public.payments set refund_cents = refund_cents - 1 where id = :'pf1';
select is(public.settlement_send_begin(:'pf1', 'refund', 0, (select refund_cents from public.payments where id = :'pf1')), true, 'F6: the refund send begins');
select is(tests.if_record(:'pf1', 'refund', 're_if_f1_0001'), 'ok: true', 'F7: the refund is recorded');
select is(tests.if_record(:'pf1', 'transfer', 'tr_if_f1_0001'), 'ok: true', 'F8: then the fee transfer''s answer is recorded');
select is(tests.if_unconfirmed(:'pf1'), 'ok: false', 'F9: and nothing is unknown any more');
-- Order 2: the refund first.
select tests.if_job('IF fee two', 'started') as jf2 \gset
select id as pf2 from public.payments where job_id = :'jf2' and kind = 'job_payment' \gset
select tests.authenticate_as(:'customer');
select (public.cancel_job(:'jf2', 'customer_cancelled')).status as cancelled_f2 \gset
select tests.clear_auth();
select is(public.settlement_send_begin(:'pf2', 'refund', 0, (select refund_cents from public.payments where id = :'pf2')), true, 'F10: order 2: the refund send begins first');
select is(tests.if_record(:'pf2', 'refund', 're_if_f2_0001'), 'ok: true', 'F11: and is recorded');
-- Codex R2 (420 gap): the refund's charge.refunded lands before the fee transfer goes.
select tests.if_event('evt_if_f2_cr', 'charge.refunded', jsonb_build_object(
  'id', 'ch_if_f2', 'payment_intent', (select provider_ref from public.payments where id = :'pf2'),
  'amount_refunded', (select refund_cents from public.payments where id = :'pf2'))) as f2cr \gset
select is((select status::text || ' / ' || (refunded_cents = refund_cents)::text from public.payments where id = :'pf2'),
  'partially_refunded / true', 'F11b: charge.refunded lands: the rest is back with the customer, the row partly refunded');
select is(public.settlement_send_begin(:'pf2', 'transfer', 0, (select transfer_cents from public.payments where id = :'pf2')), true, 'F12: then the fee transfer send still begins');
select is(tests.if_record(:'pf2', 'transfer', 'tr_if_f2_0001'), 'ok: true', 'F13: and is recorded');
select is((select status::text || ' / ' || coalesce(transfer_ref, 'null') from public.payments where id = :'pf2'),
  'partially_refunded / tr_if_f2_0001', 'F13b: the fee transfer leaves the row partly refunded, never released');

-- ---------------------------------------------------------------------------
-- R. Codex R2-A1: an older reversal event of a transfer already recorded as fully reversed arrives
--    after the payment was sent again. It must not park the row a second time: that would hide the
--    new transfer, whose answer is not back yet, and let a full refund through on top of it.
--    Stripe's amount_reversed is the transfer's running total: 400 is an older event than the full one.
-- ---------------------------------------------------------------------------
-- R1-R7: a 1,000-cent tip, settled through resolve_tip.
select tests.if_job('IF tip reversed twice', 'released') as jr1 \gset
select id as pjr1 from public.payments where job_id = :'jr1' and kind = 'job_payment' \gset
select tests.if_event('evt_if_r1_tc_' || :'pjr1', 'transfer.created', jsonb_build_object(
  'id', 'tr_if_r1_job', 'amount', (select transfer_cents from public.payments where id = :'pjr1'),
  'metadata', jsonb_build_object('payment_id', :'pjr1'))) as r1tc \gset
select tests.authenticate_as(:'customer');
select (public.begin_tip_payment(:'jr1', 1000)).id as tipr \gset
select tests.clear_auth();
select public.attach_provider_ref(:'tipr', 'pi_if_tip_r1');
select tests.if_event('evt_if_r1_ts', 'payment_intent.succeeded', jsonb_build_object(
  'id', 'pi_if_tip_r1', 'amount_received', (select charge_amount_cents from public.payments where id = :'tipr'),
  'metadata', jsonb_build_object('payment_id', :'tipr'))) as r1ts \gset
select public.settlement_send_begin(:'tipr', 'transfer', 0, (select transfer_cents from public.payments where id = :'tipr')) as r1b0 \gset
select tests.if_record(:'tipr', 'transfer', 'tr_if_r1_0001') as r1rec \gset
select tests.if_event('evt_if_r1_full', 'transfer.reversed', jsonb_build_object(
  'id', 'tr_if_r1_0001', 'amount', (select transfer_cents from public.payments where id = :'tipr'),
  'amount_reversed', (select transfer_cents from public.payments where id = :'tipr'), 'reversed', true,
  'metadata', jsonb_build_object('payment_id', :'tipr'))) as r1full \gset
select ok((select transfer_reversed_at is not null and status = 'held' from public.payments where id = :'tipr'),
  'R1: the full reversal parks the tip (its first full reversal is handled as before)');
select is(tests.if_try(format('select (public.resolve_tip(%L, %L)).transfer_attempts::text', :'tipr', 'send')), 'ok: 1',
  'R1b: the owner sends the tip again: the park clears and the attempt counter moves on');
select is(public.settlement_send_begin(:'tipr', 'transfer', 1, (select transfer_cents from public.payments where id = :'tipr')), true, 'R2: the owner sends the tip again and the new attempt begins');
select is(tests.if_unconfirmed(:'tipr'), 'ok: true', 'R3: the new transfer is on its way, its answer not back');
select tests.if_event('evt_if_r1_part', 'transfer.reversed', jsonb_build_object(
  'id', 'tr_if_r1_0001', 'amount', (select transfer_cents from public.payments where id = :'tipr'),
  'amount_reversed', 400, 'reversed', false,
  'metadata', jsonb_build_object('payment_id', :'tipr'))) as r1part \gset
select is((select transfer_reversed_at from public.payments where id = :'tipr'), null::timestamptz,
  'R4: the older partial event of the old transfer does not park the tip again');
select is(tests.if_unconfirmed(:'tipr'), 'ok: true', 'R5: the new transfer is still on its way');
select is(tests.if_try(format('select (public.resolve_tip(%L, %L)).refund_cents::text', :'tipr', 'refund')),
  'error: A transfer to the worker was sent and its result is not recorded yet: record it or reopen it first.',
  'R6: the owner cannot refund the tip on top of it');
-- Codex R3: a refund really queued beside it (the row resolve_tip's refund would have written), so
-- the check below can fail: only the reservation for the transfer on its way keeps it out.
update public.payments set refund_cents = charge_amount_cents, refund_reason = 'dispute_refund' where id = :'tipr';
select ok(not exists (select 1 from public.refunds_due where id = :'tipr'), 'R7: and a refund queued beside it is not due');
select is((select string_agg(reason, ' | ' order by reason) from public.payment_attention where payment_id = :'tipr' and what = 'refund'),
  'refund is more than is left after the transfer: a person decides',
  'R7b (G1-6): and payment_attention names why: the tip transfer on its way is counted');

-- R8-R14: a job payment, settled through resolve_job_dispute.
select tests.if_job('IF job reversed twice', 'released') as jr2 \gset
select id as pjr2 from public.payments where job_id = :'jr2' and kind = 'job_payment' \gset
select public.settlement_send_begin(:'pjr2', 'transfer', 0, (select transfer_cents from public.payments where id = :'pjr2')) as r2b0 \gset
select tests.if_record(:'pjr2', 'transfer', 'tr_if_r2_0001') as r2rec \gset
select tests.if_event('evt_if_r2_full', 'transfer.reversed', jsonb_build_object(
  'id', 'tr_if_r2_0001', 'amount', (select transfer_cents from public.payments where id = :'pjr2'),
  'amount_reversed', (select transfer_cents from public.payments where id = :'pjr2'), 'reversed', true,
  'metadata', jsonb_build_object('payment_id', :'pjr2'))) as r2full \gset
select ok((select transfer_reversed_at is not null and status = 'held' from public.payments where id = :'pjr2'),
  'R8: the full reversal parks the job payment');
select is(tests.if_try(format('select (public.resolve_job_dispute(%L, %L)).transfer_attempts::text', :'jr2', 'worker')), 'ok: 1',
  'R8b: the owner resolves for the worker: the park clears and the attempt counter moves on');
select is(public.settlement_send_begin(:'pjr2', 'transfer', 1, (select transfer_cents from public.payments where id = :'pjr2')), true, 'R9: the owner resolves for the worker and the new attempt begins');
select is(tests.if_unconfirmed(:'pjr2'), 'ok: true', 'R10: the new transfer is on its way, its answer not back');
select tests.if_event('evt_if_r2_part', 'transfer.reversed', jsonb_build_object(
  'id', 'tr_if_r2_0001', 'amount', (select transfer_cents from public.payments where id = :'pjr2'),
  'amount_reversed', 400, 'reversed', false,
  'metadata', jsonb_build_object('payment_id', :'pjr2'))) as r2part \gset
select is((select transfer_reversed_at from public.payments where id = :'pjr2'), null::timestamptz,
  'R11: the older partial event of the old transfer does not park the payment again');
select is(tests.if_unconfirmed(:'pjr2'), 'ok: true', 'R12: the new transfer is still on its way');
select is(tests.if_try(format('select (public.resolve_job_dispute(%L, %L)).refund_cents::text', :'jr2', 'customer')),
  'error: A transfer to the worker was sent and its result is not recorded yet: record it or reopen it first.',
  'R13: the owner cannot refund the customer on top of it');
-- Codex R3: the same, with a refund really queued beside it.
update public.payments set refund_cents = charge_amount_cents, refund_reason = 'dispute_refund' where id = :'pjr2';
select ok(not exists (select 1 from public.refunds_due where id = :'pjr2'), 'R14: and a refund queued beside it is not due');
select is((select string_agg(reason, ' | ' order by reason) from public.payment_attention where payment_id = :'pjr2' and what = 'refund'),
  'refund is more than is left after the transfer: a person decides',
  'R14b (G1-6): and payment_attention names why: the job transfer on its way is counted');

-- ---------------------------------------------------------------------------
-- W. Codex R4-A4: a decision for the worker is refused only while a refund the app decided may be
--    out and no durable total (refunded_cents) covers it yet. A refund already landed bounds the
--    transfer in transfers_due on its own, so that decision still works (W12-W27).
-- ---------------------------------------------------------------------------
-- W1-W4: the recorded-refund order. An issue resolves for the customer, the full refund is sent and
-- recorded, its charge.refunded has not come; a second issue is decided for the worker.
select tests.if_job('IF W recorded', 'released') as jw1 \gset
select id as pw1 from public.payments where job_id = :'jw1' and kind = 'job_payment' \gset
select tests.if_dispute(:'jw1') as w1d1 \gset
select (public.resolve_job_dispute(:'jw1', 'customer')).refund_cents as w1rc \gset
select public.settlement_send_begin(:'pw1', 'refund', 0, (select refund_cents from public.payments where id = :'pw1')) as w1b \gset
select is(tests.if_record(:'pw1', 'refund', 're_if_w1_0001'), 'ok: true',
  'W1: the full refund is sent and recorded; its charge.refunded has not come');
select is(tests.if_dispute(:'jw1'), 'ok: open', 'W2: the customer opens a second issue');
select is(tests.if_try(format('select (public.resolve_job_dispute(%L, %L)).transfer_cents::text', :'jw1', 'worker')),
  'error: A refund to the customer was sent or may have been sent. A decision cannot change the refund amount until Stripe shows that amount as refunded. Look in Stripe: refund the difference by hand there, or use settlement_send_reopen if the refund does not exist. Then decide again.',
  'W3: the owner cannot decide it for the worker');
select ok((select refund_cents = charge_amount_cents and coalesce(transfer_cents, 0) = 0 from public.payments where id = :'pw1')
          and not exists (select 1 from public.transfers_due where id = :'pw1'),
  'W4: the refund stays as asked and no transfer is due');

-- W5-W8: the lost-response order: the refund's send began and its answer was lost.
select tests.if_job('IF W lost', 'released') as jw2 \gset
select id as pw2 from public.payments where job_id = :'jw2' and kind = 'job_payment' \gset
select tests.if_dispute(:'jw2') as w2d1 \gset
select (public.resolve_job_dispute(:'jw2', 'customer')).refund_cents as w2rc \gset
select is(public.settlement_send_begin(:'pw2', 'refund', 0, (select refund_cents from public.payments where id = :'pw2')), true, 'W5: lost-response order: the refund send begins');
select is(public.record_settlement_result(:'pw2', 'refund', 0, 'same_key', 'no answer: timeout'), true,
  'W6: and its answer is lost');
select tests.if_dispute(:'jw2') as w2d2 \gset
select is(tests.if_try(format('select (public.resolve_job_dispute(%L, %L)).transfer_cents::text', :'jw2', 'worker')),
  'error: A refund to the customer was sent or may have been sent. A decision cannot change the refund amount until Stripe shows that amount as refunded. Look in Stripe: refund the difference by hand there, or use settlement_send_reopen if the refund does not exist. Then decide again.',
  'W7: a second issue cannot be decided for the worker');
select ok((select refund_cents = charge_amount_cents and coalesce(transfer_cents, 0) = 0 from public.payments where id = :'pw2')
          and not exists (select 1 from public.transfers_due where id = :'pw2'),
  'W8: the refund stays as asked and no transfer is due');

-- W9-W11: control: a refund decided and never sent can still change.
select tests.if_job('IF W unsent', 'released') as jw3 \gset
select id as pw3 from public.payments where job_id = :'jw3' and kind = 'job_payment' \gset
select tests.if_dispute(:'jw3') as w3d1 \gset
select (public.resolve_job_dispute(:'jw3', 'customer')).refund_cents as w3rc \gset
select ok(exists (select 1 from public.refunds_due where id = :'pw3'), 'W9: control: the refund is queued, its send not begun');
select tests.if_dispute(:'jw3') as w3d2 \gset
select is(tests.if_try(format('select (public.resolve_job_dispute(%L, %L)).refund_cents::text', :'jw3', 'worker')), 'ok: 0',
  'W10: the owner decides the second issue for the worker: the unsent refund is withdrawn');
select ok(exists (select 1 from public.transfers_due where id = :'pw3') and not exists (select 1 from public.refunds_due where id = :'pw3'),
  'W11: the transfer is due and the refund is not');

-- W12-W16: control: a partial refund recorded (refunded_cents 60, refund_cents 0: an earlier issue
-- was decided for the worker, then 60 cents were refunded by hand), an issue opened later and decided
-- for the worker. The transfer is due only inside the charge less what was refunded.
select tests.if_job('IF W partial', 'released') as jw4 \gset
select id as pw4 from public.payments where job_id = :'jw4' and kind = 'job_payment' \gset
select tests.if_dispute(:'jw4') as w4d1 \gset
select (public.resolve_job_dispute(:'jw4', 'worker')).refund_cents as w4rc \gset
select tests.if_event('evt_if_w4_cr1', 'charge.refunded', jsonb_build_object(
  'id', 'ch_if_w4', 'payment_intent', (select provider_ref from public.payments where id = :'pw4'),
  'amount_refunded', 60)) as w4cr1 \gset
select is((select status::text || ' / ' || refunded_cents::text || ' / ' || coalesce(refund_cents, 0)::text
             from public.payments where id = :'pw4'),
  'partially_refunded / 60 / 0', 'W12: partial-refund control: 60 cents refunded and recorded, no refund asked by the app (refund_cents 0)');
select is(tests.if_dispute(:'jw4'), 'ok: open', 'W13: the customer opens an issue later');
select is(tests.if_try(format('select (public.resolve_job_dispute(%L, %L)).transfer_cents::text', :'jw4', 'worker')),
  'ok: ' || (select (amount_cents - platform_fee_cents)::text from public.payments where id = :'pw4'),
  'W14: the owner decides it for the worker');
select ok(exists (select 1 from public.transfers_due where id = :'pw4'),
  'W15: the transfer is due: it fits inside the charge less the 60 cents refunded');
select tests.if_event('evt_if_w4_cr2', 'charge.refunded', jsonb_build_object(
  'id', 'ch_if_w4', 'payment_intent', (select provider_ref from public.payments where id = :'pw4'),
  'amount_refunded', (select charge_amount_cents - transfer_cents + 1 from public.payments where id = :'pw4'))) as w4cr2 \gset
select ok(not exists (select 1 from public.transfers_due where id = :'pw4'),
  'W16: and it is not due once the refunded total leaves one cent less than the transfer');

-- W17-W24: a partial refund made by hand on a row with no refund asked (refund_cents null): its
-- charge.refunded writes refund_cents 60 (A5), with refund_ref when the payload lists the refund
-- and without it when it does not. Either shape: the decision for the worker works, inside the bound.
select tests.if_job('IF W hand with id', 'released') as jw5 \gset
select id as pw5 from public.payments where job_id = :'jw5' and kind = 'job_payment' \gset
select tests.if_event('evt_if_w5_cr1', 'charge.refunded', jsonb_build_object(
  'id', 'ch_if_w5', 'payment_intent', (select provider_ref from public.payments where id = :'pw5'),
  'amount_refunded', 60, 'refunds', jsonb_build_object('data', jsonb_build_array(jsonb_build_object('id', 're_if_w5_hand'))))) as w5cr1 \gset
select is((select status::text || ' / ' || refunded_cents::text || ' / ' || refund_cents::text || ' / ' || coalesce(refund_ref, 'null')
             from public.payments where id = :'pw5'),
  'partially_refunded / 60 / 60 / null', 'W17: a hand refund of 60 cents, the payload lists it: refund_cents 60, and refund_ref not taken from it (R5-A3)');
select tests.if_dispute(:'jw5') as w5d1 \gset
select is(tests.if_try(format('select (public.resolve_job_dispute(%L, %L)).transfer_cents::text', :'jw5', 'worker')),
  'ok: ' || (select (amount_cents - platform_fee_cents)::text from public.payments where id = :'pw5'),
  'W18: an issue opened later is decided for the worker');
select ok(exists (select 1 from public.transfers_due where id = :'pw5'),
  'W19: the transfer is due: it fits inside the charge less the 60 cents refunded');
select tests.if_event('evt_if_w5_cr2', 'charge.refunded', jsonb_build_object(
  'id', 'ch_if_w5', 'payment_intent', (select provider_ref from public.payments where id = :'pw5'),
  'amount_refunded', (select charge_amount_cents - transfer_cents + 1 from public.payments where id = :'pw5'))) as w5cr2 \gset
select ok(not exists (select 1 from public.transfers_due where id = :'pw5'),
  'W20: and it is not due once the refunded total leaves one cent less than the transfer');

select tests.if_job('IF W hand no id', 'released') as jw6 \gset
select id as pw6 from public.payments where job_id = :'jw6' and kind = 'job_payment' \gset
select tests.if_event('evt_if_w6_cr1', 'charge.refunded', jsonb_build_object(
  'id', 'ch_if_w6', 'payment_intent', (select provider_ref from public.payments where id = :'pw6'),
  'amount_refunded', 60)) as w6cr1 \gset
select is((select status::text || ' / ' || refunded_cents::text || ' / ' || refund_cents::text || ' / ' || coalesce(refund_ref, 'null')
             from public.payments where id = :'pw6'),
  'partially_refunded / 60 / 60 / null', 'W21: the same hand refund, the payload lists no refund: no refund_ref');
select tests.if_dispute(:'jw6') as w6d1 \gset
select is(tests.if_try(format('select (public.resolve_job_dispute(%L, %L)).transfer_cents::text', :'jw6', 'worker')),
  'ok: ' || (select (amount_cents - platform_fee_cents)::text from public.payments where id = :'pw6'),
  'W22: the same decision for the worker works');
select ok(exists (select 1 from public.transfers_due where id = :'pw6'),
  'W23: the transfer is due inside the bound');
select tests.if_event('evt_if_w6_cr2', 'charge.refunded', jsonb_build_object(
  'id', 'ch_if_w6', 'payment_intent', (select provider_ref from public.payments where id = :'pw6'),
  'amount_refunded', (select charge_amount_cents - transfer_cents + 1 from public.payments where id = :'pw6'))) as w6cr2 \gset
select ok(not exists (select 1 from public.transfers_due where id = :'pw6'),
  'W24: and not due past it');

-- W25-W27: the app's full refund sent, recorded, and its charge.refunded come (refunded_cents = the
-- charge): a later decision for the worker passes, and no transfer becomes due (the d9982fd behaviour).
select tests.if_job('IF W full landed', 'released') as jw7 \gset
select id as pw7 from public.payments where job_id = :'jw7' and kind = 'job_payment' \gset
select tests.if_dispute(:'jw7') as w7d1 \gset
select (public.resolve_job_dispute(:'jw7', 'customer')).refund_cents as w7rc \gset
select public.settlement_send_begin(:'pw7', 'refund', 0, (select refund_cents from public.payments where id = :'pw7')) as w7b \gset
select tests.if_record(:'pw7', 'refund', 're_if_w7_0001') as w7r \gset
select tests.if_event('evt_if_w7_cr', 'charge.refunded', jsonb_build_object(
  'id', 'ch_if_w7', 'payment_intent', (select provider_ref from public.payments where id = :'pw7'),
  'amount_refunded', (select charge_amount_cents from public.payments where id = :'pw7'))) as w7cr \gset
select is((select status::text || ' / ' || (refunded_cents = charge_amount_cents)::text || ' / ' || (refund_ref is not null)::text
             from public.payments where id = :'pw7'),
  'refunded / true / true', 'W25: the full refund is sent, recorded and its charge.refunded has come');
select tests.if_dispute(:'jw7') as w7d2 \gset
select is(left(tests.if_try(format('select (public.resolve_job_dispute(%L, %L)).transfer_cents::text', :'jw7', 'worker')), 4),
  'ok: ', 'W26: a second issue decided for the worker passes');
select ok(not exists (select 1 from public.transfers_due where id = :'pw7'),
  'W27: and no transfer is due for the payment: the refunded total holds the money');

-- ---------------------------------------------------------------------------
-- X. Codex R5-A1: a decision may not move an amount the drain is about to send or may have sent.
--    Window 1: settlement_send_begin names the amount the drain read and refuses another one.
--    Window 2: payment_refund_change_refused undoes a decision, in either direction, that changes a
--    refund the app sent or may have sent until refunded_cents covers it. Codex R5-A3: a refund the
--    refunded total covers is not listed, and charge.refunded never writes refund_ref.
-- ---------------------------------------------------------------------------
select 'error: A refund to the customer was sent or may have been sent. A decision cannot change the refund amount until Stripe shows that amount as refunded. Look in Stripe: refund the difference by hand there, or use settlement_send_reopen if the refund does not exist. Then decide again.' as refusal \gset

create or replace function tests.if_refunded(p_id text, p_pid uuid, p_total integer, p_refund text) returns jsonb language sql as $$
  select tests.if_event(p_id, 'charge.refunded', jsonb_build_object(
    'id', 'ch_' || p_id, 'payment_intent', (select provider_ref from public.payments where id = p_pid),
    'amount_refunded', p_total, 'refunds', jsonb_build_object('data', jsonb_build_array(jsonb_build_object('id', p_refund)))))
$$;
create or replace function tests.if_refund_lines(p_pid uuid) returns text language sql as $$
  select coalesce(string_agg(a.reason, ' | ' order by a.reason), 'none')
    from public.payment_attention a where a.payment_id = p_pid and a.what = 'refund'
$$;
create or replace function tests.if_refused(p_before jsonb, p_after integer) returns text language sql as $$
  select public.payment_refund_change_refused(jsonb_populate_record(null::public.payments, p_before), p_after)::text
$$;

-- X1-X3: the old send-begin is gone; the new one and the rule are service_role only.
select ok(to_regprocedure('public.settlement_send_begin(uuid,text,integer)') is null,
  'X1: the 3-argument settlement_send_begin is dropped: no send begins without its amount');
select is(has_function_privilege('anon', 'public.settlement_send_begin(uuid,text,integer,integer)', 'execute')::text
          || '/' || has_function_privilege('authenticated', 'public.settlement_send_begin(uuid,text,integer,integer)', 'execute')::text
          || '/' || has_function_privilege('service_role', 'public.settlement_send_begin(uuid,text,integer,integer)', 'execute')::text,
  'false/false/true', 'X2: settlement_send_begin(uuid, text, integer, integer) is service_role only');
select is(has_function_privilege('anon', 'public.payment_refund_change_refused(public.payments,integer)', 'execute')::text
          || '/' || has_function_privilege('authenticated', 'public.payment_refund_change_refused(public.payments,integer)', 'execute')::text
          || '/' || has_function_privilege('service_role', 'public.payment_refund_change_refused(public.payments,integer)', 'execute')::text,
  'false/false/true', 'X3: payment_refund_change_refused is service_role only');

-- X4-X6: window 1, transfer: a begin that names another amount than the row's is refused.
select tests.if_job('IF X transfer amount', 'released') as jx0 \gset
select id as px0 from public.payments where job_id = :'jx0' and kind = 'job_payment' \gset
select is(public.settlement_send_begin(:'px0', 'transfer', 0, (select transfer_cents + 1 from public.payments where id = :'px0')), false,
  'X4: a transfer begin with an amount one cent off the row''s is refused');
select is((select transfer_sent_attempt from public.payments where id = :'px0'), null::integer,
  'X5: and records no send as begun');
select is(public.settlement_send_begin(:'px0', 'transfer', 0, (select transfer_cents from public.payments where id = :'px0')), true,
  'X6: the row''s own amount begins');

-- X7-X11: window 1, refund: the drain read 75 cents, then the owner decided for the customer before
-- the send began. The begin with the amount read is refused; the next pass sends the new amount.
select tests.if_job('IF X refund window', 'released') as jx1 \gset
select id as px1 from public.payments where job_id = :'jx1' and kind = 'job_payment' \gset
select tests.if_dispute(:'jx1') as x1d \gset
-- SURGERY: a refund of 75 cents asked by an earlier decision (no RPC asks for that amount here).
update public.payments set refund_cents = 75, transfer_cents = 0, refund_reason = 'dispute_refund' where id = :'px1';
select ok(exists (select 1 from public.refunds_ready where id = :'px1' and refund_cents = 75),
  'X7: the drain reads a refund of 75 cents from refunds_ready');
select is(tests.if_try(format('select (public.resolve_job_dispute(%L, %L)).refund_cents::text', :'jx1', 'customer')),
  'ok: ' || (select charge_amount_cents::text from public.payments where id = :'px1'),
  'X8: before its send begins, the owner decides for the customer: the whole charge (nothing was sent, so it may change)');
select is(public.settlement_send_begin(:'px1', 'refund', 0, 75), false,
  'X9: the drain''s begin with the 75 cents it read is refused');
select is((select refund_sent_attempt from public.payments where id = :'px1'), null::integer,
  'X10: and records no send as begun');
select is(public.settlement_send_begin(:'px1', 'refund', 0, (select refund_cents from public.payments where id = :'px1')), true,
  'X11: the next pass reads the new amount and begins');

-- X12-X15: window 2: the refund of 75 cents began and its answer is not back. A decision in either
-- direction would change it: refused, and undone.
select tests.if_job('IF X refund begun', 'released') as jx2 \gset
select id as px2 from public.payments where job_id = :'jx2' and kind = 'job_payment' \gset
select tests.if_dispute(:'jx2') as x2d \gset
-- SURGERY: as above.
update public.payments set refund_cents = 75, transfer_cents = 0, refund_reason = 'dispute_refund' where id = :'px2';
select is(public.settlement_send_begin(:'px2', 'refund', 0, 75), true, 'X12: a refund of 75 cents begins; its answer is not back');
select is(tests.if_try(format('select (public.resolve_job_dispute(%L, %L)).refund_cents::text', :'jx2', 'customer')),
  :'refusal', 'X13: a decision for the customer (raising it to the whole charge) is refused');
select is((select refund_cents from public.payments where id = :'px2')::text
          || '/' || exists (select 1 from public.job_disputes where job_id = :'jx2' and status = 'open')::text,
  '75/true', 'X14: the decision is undone: the refund stays 75 cents and the issue stays open');
select is(tests.if_try(format('select (public.resolve_job_dispute(%L, %L)).refund_cents::text', :'jx2', 'worker')),
  :'refusal', 'X15: a decision for the worker (lowering it to 0) is refused too');

-- X16-X20: the refund of 75 cents is recorded and confirmed; the rest is refunded by hand in
-- Stripe. Only then does the decision for the customer pass, and nothing more is sent or listed.
select is(tests.if_record(:'px2', 'refund', 're_if_x2_0001'), 'ok: true', 'X16: the refund of 75 cents is recorded');
select tests.if_refunded('evt_if_x2_cr1', :'px2', 75, 're_if_x2_0001') as x2cr1 \gset
select is(tests.if_try(format('select (public.resolve_job_dispute(%L, %L)).refund_cents::text', :'jx2', 'customer')),
  :'refusal', 'X17: its charge.refunded of 75 cents came: the decision for the whole charge is still refused (75 does not cover it)');
select tests.if_refunded('evt_if_x2_cr2', :'px2', (select charge_amount_cents from public.payments where id = :'px2'), 're_if_x2_hand') as x2cr2 \gset
select is((select status::text || ' / ' || (refunded_cents = charge_amount_cents)::text || ' / ' || refund_cents::text || ' / ' || refund_ref
             from public.payments where id = :'px2'),
  'refunded / true / 75 / re_if_x2_0001', 'X18: the owner refunds the rest by hand: the refunded total is the whole charge');
select is(tests.if_try(format('select (public.resolve_job_dispute(%L, %L)).refund_cents::text', :'jx2', 'customer')),
  'ok: ' || (select charge_amount_cents::text from public.payments where id = :'px2'),
  'X19: then the decision for the customer passes: it only records what Stripe counts as refunded');
select is(exists (select 1 from public.refunds_due where id = :'px2')::text || '/' || tests.if_refund_lines(:'px2')
          || '/' || exists (select 1 from public.job_disputes where job_id = :'jx2' and status = 'open')::text,
  'false/none/false', 'X20: nothing is sent again, no refund line is listed, and the issue is closed');

-- X21-X22: the rule is null-safe: a null refund_cents (before or after) counts as 0 and cannot let a
-- change pass.
select is(tests.if_refused('{"refund_ref": "re_x", "refund_attempts": 0}', 75)
          || '/' || tests.if_refused('{"refund_ref": "re_x", "refund_attempts": 0, "refund_cents": 75}', null)
          || '/' || tests.if_refused('{"refund_attempts": 0, "refund_cents": 75}', 5375)
          || '/' || tests.if_refused('{"refund_ref": "re_x", "refund_attempts": 0}', null),
  'true/true/false/false',
  'X21: refund recorded, null to 75: refused; 75 to null: refused; nothing sent: passes; null to null: no change');
select is(tests.if_refused('{"refund_sent_attempt": 0, "refund_attempts": 0, "refund_cents": 75, "refunded_cents": 75}', 5375)
          || '/' || tests.if_refused('{"refund_sent_attempt": 0, "refund_attempts": 0, "refund_cents": 75, "refunded_cents": 5375}', 5375)
          || '/' || tests.if_refused('{"refund_sent_attempt": 0, "refund_attempts": 1, "refund_cents": 75}', 5375)
          || '/' || public.payment_refund_change_refused(null::public.payments, 75)::text,
  'true/false/false/false',
  'X22: begun, 75 refunded, raised to 5375: refused; 5375 refunded: passes; an older attempt begun: passes; no row: false');

-- X23-X24: resolve_tip reads the same rule. SURGERY: a held tip whose refund_ref the old refund.failed
-- backfill wrote (pre-R5-A3: a hand refund that failed); nothing is refunded.
select tests.if_job('IF X tip', 'released') as jxt \gset
select id as pxtj from public.payments where job_id = :'jxt' and kind = 'job_payment' \gset
select tests.if_event('evt_if_xt_tc_' || :'pxtj', 'transfer.created', jsonb_build_object(
  'id', 'tr_if_xt_0001', 'amount', (select transfer_cents from public.payments where id = :'pxtj'),
  'metadata', jsonb_build_object('payment_id', :'pxtj'))) as xttc \gset
select tests.authenticate_as(:'customer');
select (public.begin_tip_payment(:'jxt', 1000)).id as tipx \gset
select tests.clear_auth();
select public.attach_provider_ref(:'tipx', 'pi_if_tip_x001');
select tests.if_event('evt_if_xt_ts', 'payment_intent.succeeded', jsonb_build_object(
  'id', 'pi_if_tip_x001', 'amount_received', (select charge_amount_cents from public.payments where id = :'tipx'),
  'metadata', jsonb_build_object('payment_id', :'tipx'))) as xtts \gset
update public.payments set refund_ref = 're_if_xt_old' where id = :'tipx';
select is(tests.if_try(format('select (public.resolve_tip(%L, %L)).refund_cents::text', :'tipx', 'refund')),
  :'refusal', 'X23: resolve_tip refuses a refund decision over a recorded refund that no refunded total covers');
select is((select coalesce(refund_cents, 0)::text || '/' || status::text from public.payments where id = :'tipx'),
  '0/held', 'X24: and the tip is unchanged');

-- X25-X33: Codex R5-A3.
-- (a) A hand partial refund of 60 cents on rows that asked for none: finished, never listed.
select tests.if_job('IF X3a released', 'released') as jxa1 \gset
select id as pxa1 from public.payments where job_id = :'jxa1' and kind = 'job_payment' \gset
select tests.if_refunded('evt_if_xa1', :'pxa1', 60, 're_if_xa1_hand') as xa1 \gset
select is((select status::text || ' / ' || refunded_cents::text || ' / ' || refund_cents::text from public.payments where id = :'pxa1')
          || ' / ' || exists (select 1 from public.refunds_due where id = :'pxa1')::text || ' / ' || tests.if_refund_lines(:'pxa1'),
  'partially_refunded / 60 / 60 / false / none',
  'X25: (a) a hand refund of 60 cents on an approved job: not sent again and no refund line (it is finished)');
select tests.if_job('IF X3a held', 'started') as jxa2 \gset
select id as pxa2 from public.payments where job_id = :'jxa2' and kind = 'job_payment' \gset
select tests.if_refunded('evt_if_xa2', :'pxa2', 60, 're_if_xa2_hand') as xa2 \gset
select is(exists (select 1 from public.refunds_due where id = :'pxa2')::text || ' / ' || tests.if_refund_lines(:'pxa2'),
  'false / none', 'X26: (a) the same on a job still in progress');

-- (b) The app's own refund whose answer was lost, then its charge.refunded: no second send, no line.
select tests.if_job('IF X3b partial', 'released') as jxb1 \gset
select id as pxb1 from public.payments where job_id = :'jxb1' and kind = 'job_payment' \gset
-- SURGERY: an own refund of 75 cents asked.
update public.payments set refund_cents = 75, refund_reason = 'dispute_refund' where id = :'pxb1';
select public.settlement_send_begin(:'pxb1', 'refund', 0, 75) as xb1b \gset
select public.record_settlement_result(:'pxb1', 'refund', 0, 'same_key', 'no answer: timeout') as xb1l \gset
select tests.if_refunded('evt_if_xb1', :'pxb1', 75, 're_if_xb1_0001') as xb1 \gset
select is((select status::text || ' / ' || refunded_cents::text || ' / ' || coalesce(refund_ref, 'null') from public.payments where id = :'pxb1')
          || ' / ' || exists (select 1 from public.refunds_due where id = :'pxb1')::text || ' / ' || tests.if_refund_lines(:'pxb1'),
  'partially_refunded / 75 / null / false / none',
  'X27: (b) own refund of 75 cents, answer lost, then its charge.refunded: not sent again, no refund line');
update public.payments set refund_sent_at = now() - interval '24 hours' where id = :'pxb1';
select is(exists (select 1 from public.refunds_due where id = :'pxb1')::text || ' / ' || tests.if_refund_lines(:'pxb1'),
  'false / none', 'X28: (b) and still none 24 hours after the send began');
select tests.if_job('IF X3b full', 'released') as jxb2 \gset
select id as pxb2 from public.payments where job_id = :'jxb2' and kind = 'job_payment' \gset
select tests.if_dispute(:'jxb2') as xb2d \gset
select (public.resolve_job_dispute(:'jxb2', 'customer')).refund_cents as xb2rc \gset
select public.settlement_send_begin(:'pxb2', 'refund', 0, (select refund_cents from public.payments where id = :'pxb2')) as xb2b \gset
select public.record_settlement_result(:'pxb2', 'refund', 0, 'same_key', 'no answer: timeout') as xb2l \gset
select tests.if_refunded('evt_if_xb2', :'pxb2', (select charge_amount_cents from public.payments where id = :'pxb2'), 're_if_xb2_0001') as xb2 \gset
update public.payments set refund_sent_at = now() - interval '24 hours' where id = :'pxb2';
select is((select status::text from public.payments where id = :'pxb2')
          || ' / ' || exists (select 1 from public.refunds_due where id = :'pxb2')::text || ' / ' || tests.if_refund_lines(:'pxb2'),
  'refunded / false / none', 'X29: (b) the same for a full refund, 24 hours later');

-- (c) A full refund asked and never sent, then a hand refund of 60 cents: listed for a person; a
-- decision for the worker withdraws it and the transfer is due inside what is left.
select tests.if_job('IF X3c', 'released') as jxc \gset
select id as pxc from public.payments where job_id = :'jxc' and kind = 'job_payment' \gset
select tests.if_dispute(:'jxc') as xcd1 \gset
select (public.resolve_job_dispute(:'jxc', 'customer')).refund_cents as xcrc \gset
select tests.if_refunded('evt_if_xc', :'pxc', 60, 're_if_xc_hand') as xc \gset
select is(exists (select 1 from public.refunds_due where id = :'pxc')::text || ' / ' || tests.if_refund_lines(:'pxc'),
  'false / a refund already landed on this charge: finish by hand in Stripe, then record_settlement_sent',
  'X30: (c) the full refund is not sent on top of the 60 cents; it is listed for a person');
select tests.if_dispute(:'jxc') as xcd2 \gset
select is(tests.if_try(format('select (public.resolve_job_dispute(%L, %L)).transfer_cents::text', :'jxc', 'worker')),
  'ok: ' || (select (amount_cents - platform_fee_cents)::text from public.payments where id = :'pxc'),
  'X31: (c) a second issue decided for the worker passes: the app never sent a refund');
select is(exists (select 1 from public.transfers_due where id = :'pxc')::text || ' / ' || tests.if_refund_lines(:'pxc'),
  'true / none', 'X32: (c) the transfer is due inside the charge less the 60 cents, and no refund line is left');

-- ---------------------------------------------------------------------------
-- G. G1-1: a late-cancel fee sent, recorded, then reversed in full at the provider (parked). A decision
--    for the worker sends the fee again by the completed branch's rule (attempt + 1, amounts unchanged);
--    a decision for the customer is today's. S2: the rest's refund not sent. S1: the rest's refund sent
--    and its charge.refunded landed (partially_refunded). The reversal is named first in payment_attention.
-- ---------------------------------------------------------------------------
create or replace function tests.if_fee_parked(p_title text, p_rest_landed boolean) returns uuid language plpgsql as $$
declare
  v_job uuid := tests.if_job(p_title, 'started');
  v_pid uuid;
begin
  perform tests.authenticate_as((select fx.v from fx where fx.k = 'customer'));
  perform public.cancel_job(v_job, 'customer_cancelled');
  perform tests.clear_auth();
  select id into v_pid from public.payments where job_id = v_job and kind = 'job_payment';
  if p_rest_landed then
    if not public.settlement_send_begin(v_pid, 'refund', 0, (select refund_cents from public.payments where id = v_pid)) then
      raise exception 'if_fee_parked: the refund send did not begin';
    end if;
    if tests.if_record(v_pid, 'refund', 're_if_g_' || v_pid) <> 'ok: true' then
      raise exception 'if_fee_parked: the refund was not recorded';
    end if;
    perform tests.if_event('evt_if_g_cr_' || v_pid, 'charge.refunded', jsonb_build_object(
      'id', 'ch_if_g_' || v_pid, 'payment_intent', (select provider_ref from public.payments where id = v_pid),
      'amount_refunded', (select refund_cents from public.payments where id = v_pid)));
  end if;
  if not public.settlement_send_begin(v_pid, 'transfer', 0, (select transfer_cents from public.payments where id = v_pid)) then
    raise exception 'if_fee_parked: the fee transfer send did not begin';
  end if;
  if tests.if_record(v_pid, 'transfer', 'tr_if_g_' || v_pid) <> 'ok: true' then
    raise exception 'if_fee_parked: the fee transfer was not recorded';
  end if;
  perform tests.if_event('evt_if_g_rev_' || v_pid, 'transfer.reversed', jsonb_build_object(
    'id', 'tr_if_g_' || v_pid, 'amount', (select transfer_cents from public.payments where id = v_pid),
    'amount_reversed', (select transfer_cents from public.payments where id = v_pid), 'reversed', true,
    'metadata', jsonb_build_object('payment_id', v_pid)));
  return v_job;
end $$;

-- G1-G4: S2, decided for the worker.
select tests.if_fee_parked('IF G S2 worker', false) as jg2w \gset
select id as pg2w from public.payments where job_id = :'jg2w' and kind = 'job_payment' \gset
select is((select status::text || ' / ' || (transfer_reversed_at is not null)::text || ' / ' || release_reason || ' / ' || (refund_ref is null)::text
             from public.payments where id = :'pg2w'),
  'held / true / cancellation_fee / true', 'G1: S2: the fee sent and recorded, then reversed in full: parked, the rest''s refund not sent');
update public.payments set transfer_sent_at = now() - interval '24 hours' where id = :'pg2w';
select is((select string_agg(reason, ' | ' order by reason) from public.payment_attention where payment_id = :'pg2w' and what = 'transfer'),
  'reversed at the provider: resolve_job_dispute (job payment) or resolve_tip (tip) decides',
  'G2: reversed more than 23 hours after the send: the attention line names the reversal, not the closed attempt');
select transfer_attempts as g2w_att, transfer_cents as g2w_tc, refund_cents as g2w_rc from public.payments where id = :'pg2w' \gset
select is(tests.if_try(format('select (public.resolve_job_dispute(%L, %L)).transfer_attempts::text', :'jg2w', 'worker')),
  'ok: ' || (:g2w_att + 1)::text, 'G3: S2: the owner decides for the worker: the attempt counter moves on');
select is((select (p.transfer_reversed_at is null)::text || ' / ' || p.transfer_attempts::text || ' / ' || p.transfer_cents::text
                  || ' / ' || p.refund_cents::text || ' / ' || p.release_reason || ' / ' || (p.release_requested_at = now())::text
                  || ' / ' || exists (select 1 from public.transfers_due d where d.id = p.id)::text
                  || ' / ' || public.payment_payout_on_its_way(p)::text
             from public.payments p where p.id = :'pg2w'),
  'true / ' || (:g2w_att + 1)::text || ' / ' || :g2w_tc || ' / ' || :g2w_rc || ' / cancellation_fee / true / true / true',
  'G4: S2: park cleared, amounts and reason unchanged, the fee is due again and on its way');

-- G5-G7: S1, decided for the worker.
select tests.if_fee_parked('IF G S1 worker', true) as jg1w \gset
select id as pg1w from public.payments where job_id = :'jg1w' and kind = 'job_payment' \gset
select is((select status::text || ' / ' || (transfer_reversed_at is not null)::text || ' / ' || release_reason || ' / ' || (refunded_cents = refund_cents)::text
             from public.payments where id = :'pg1w'),
  'partially_refunded / true / cancellation_fee / true', 'G5: S1: the rest refunded and landed, the fee reversed in full: parked');
select transfer_attempts as g1w_att, transfer_cents as g1w_tc, refund_cents as g1w_rc from public.payments where id = :'pg1w' \gset
select is(tests.if_try(format('select (public.resolve_job_dispute(%L, %L)).transfer_attempts::text', :'jg1w', 'worker')),
  'ok: ' || (:g1w_att + 1)::text, 'G6: S1: the owner decides for the worker: the attempt counter moves on');
select is((select (p.transfer_reversed_at is null)::text || ' / ' || p.transfer_attempts::text || ' / ' || p.transfer_cents::text
                  || ' / ' || p.refund_cents::text || ' / ' || p.release_reason || ' / ' || (p.release_requested_at = now())::text
                  || ' / ' || exists (select 1 from public.transfers_due d where d.id = p.id)::text
                  || ' / ' || public.payment_payout_on_its_way(p)::text
             from public.payments p where p.id = :'pg1w'),
  'true / ' || (:g1w_att + 1)::text || ' / ' || :g1w_tc || ' / ' || :g1w_rc || ' / cancellation_fee / true / true / true',
  'G7: S1: park cleared, amounts and reason unchanged, the fee is due again and on its way');

-- G8-G9: S2, decided for the customer: today's full refund.
select tests.if_fee_parked('IF G S2 customer', false) as jg2c \gset
select id as pg2c from public.payments where job_id = :'jg2c' and kind = 'job_payment' \gset
select is(tests.if_try(format('select (public.resolve_job_dispute(%L, %L)).refund_cents::text', :'jg2c', 'customer')),
  'ok: ' || (select charge_amount_cents from public.payments where id = :'pg2c')::text,
  'G8: S2: the owner decides for the customer: the whole charge is refunded');
select is((select (refund_cents = charge_amount_cents)::text || ' / ' || transfer_cents::text from public.payments where id = :'pg2c'),
  'true / 0', 'G9: S2: refund = the charge, no transfer');

-- G10-G11: S1, decided for the customer: refused (the rest's refund landed), the row unchanged.
select tests.if_fee_parked('IF G S1 customer', true) as jg1c \gset
select id as pg1c from public.payments where job_id = :'jg1c' and kind = 'job_payment' \gset
select to_jsonb(p) as g1c_before from public.payments p where p.id = :'pg1c' \gset
select is(tests.if_try(format('select (public.resolve_job_dispute(%L, %L)).refund_cents::text', :'jg1c', 'customer')),
  :'refusal', 'G10: S1: a decision for the customer is refused: it would change a refund already sent');
select is((select to_jsonb(p) from public.payments p where p.id = :'pg1c'), :'g1c_before'::jsonb,
  'G11: S1: and the row is unchanged');

-- INV (Codex R7-A2), last: no refund still owed in this file is missing from both refunds_due and the
-- refund lines of payment_attention. The one exception: the recorded refund itself failed and its
-- arrangement covers the refund asked.
select is((select count(*)::integer from public.payments p
            where p.provider = 'stripe' and coalesce(p.refund_cents, 0) > 0 and p.status <> 'refunded'
              and coalesce(p.refunded_cents, 0) < p.refund_cents
              and not exists (select 1 from public.refunds_due r where r.id = p.id)
              and not exists (select 1 from public.payment_attention a where a.payment_id = p.id and a.what = 'refund')
              and not exists (select 1 from public.payment_refund_failures f
                               where f.refund_ref = p.refund_ref and f.arranged_at is not null
                                 and coalesce(f.amount_cents, p.charge_amount_cents) >= p.refund_cents)),
  0, 'INV (R7-A2): every refund owed is in refunds_due or has a refund line in payment_attention');

select * from finish();
rollback;
