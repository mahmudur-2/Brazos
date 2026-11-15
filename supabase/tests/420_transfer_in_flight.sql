-- 420_transfer_in_flight.sql — pack 1, A1: a transfer whose send began and whose result is not
-- recorded is money on its way to the worker. Proves 20261115000000_transfer_in_flight.sql
-- (payment_transfer_unconfirmed; open_job_dispute, resolve_job_dispute and resolve_tip refuse while it
-- holds) and the reservation in refunds_due (20261115000200_work_start_money_rule.sql).
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
select plan(36);

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
select is(public.settlement_send_begin(:'pa', 'transfer', 0), true, 'A2: the drain begins the send (attempt 0)');
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
select public.settlement_send_begin(:'pb', 'transfer', 0) as begun_b \gset
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
select is(public.settlement_send_begin(:'pc', 'transfer', 0), false, 'C2: the other order: an open dispute keeps the drain from sending');
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
select is(public.settlement_send_begin(:'tip', 'transfer', 0), true, 'T1: the tip''s transfer send begins');
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
select is(public.settlement_send_begin(:'pf1', 'transfer', 0), true, 'F3: order 1: the fee transfer send begins');
select ok(exists (select 1 from public.refunds_ready where id = :'pf1'),
  'F4: the refund still goes: the charge less the fee on its way is exactly what is left');
update public.payments set refund_cents = refund_cents + 1 where id = :'pf1';
select ok(not exists (select 1 from public.refunds_due where id = :'pf1'),
  'F5: one cent more than is left is held back while the fee transfer is unknown');
update public.payments set refund_cents = refund_cents - 1 where id = :'pf1';
select is(public.settlement_send_begin(:'pf1', 'refund', 0), true, 'F6: the refund send begins');
select is(tests.if_record(:'pf1', 'refund', 're_if_f1_0001'), 'ok: true', 'F7: the refund is recorded');
select is(tests.if_record(:'pf1', 'transfer', 'tr_if_f1_0001'), 'ok: true', 'F8: then the fee transfer''s answer is recorded');
select is(tests.if_unconfirmed(:'pf1'), 'ok: false', 'F9: and nothing is unknown any more');
-- Order 2: the refund first.
select tests.if_job('IF fee two', 'started') as jf2 \gset
select id as pf2 from public.payments where job_id = :'jf2' and kind = 'job_payment' \gset
select tests.authenticate_as(:'customer');
select (public.cancel_job(:'jf2', 'customer_cancelled')).status as cancelled_f2 \gset
select tests.clear_auth();
select is(public.settlement_send_begin(:'pf2', 'refund', 0), true, 'F10: order 2: the refund send begins first');
select is(tests.if_record(:'pf2', 'refund', 're_if_f2_0001'), 'ok: true', 'F11: and is recorded');
select is(public.settlement_send_begin(:'pf2', 'transfer', 0), true, 'F12: then the fee transfer send still begins');
select is(tests.if_record(:'pf2', 'transfer', 'tr_if_f2_0001'), 'ok: true', 'F13: and is recorded');

select * from finish();
rollback;
