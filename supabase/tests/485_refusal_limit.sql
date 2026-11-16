-- 485_refusal_limit.sql — money M2-3 (R-E, the 3-day limit): refusal_limit.
-- A refusal starts or continues a run (settlement_refusals); a refusal more than 3 days after the first
-- refusal of its run is recorded as the existing stop and listed (transfer_stopped, refund_stopped);
-- an unknown answer between refusals keeps the run; any other move of the attempt counter, any stop,
-- the owner's reopen, and payouts enabled again start a new run. The drain's side is unchanged: it
-- records the refusal as before (tests/settlementRetry.test.mjs, tests/intentCancel.test.mjs).
--
-- THE CAST: a customer, two workers (W1 enabled payouts; W2 whose payouts go off and on), the runner
-- (RLS bypassed; the drain's and the owner's stand-in).
-- FIXTURE SURGERY, DECLARED (now() is fixed inside a transaction): settlement_refusals.first_refused_at
-- is moved back to make a run 2 days, 2 days 23 hours, 3 days 1 minute or 4 days old; T4 adds 1 to
-- payments.transfer_attempts (the move resolve_job_dispute and resolve_tip make when they ask for a
-- reversed transfer again); rate_counters reset before each hire (as 370 does). Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(44);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('rl.customer@brazos.test', 'Rae Customer') as customer \gset
select tests.create_user('rl.w1@brazos.test', 'Rex Worker') as w1 \gset
select tests.create_user('rl.w2@brazos.test', 'Roy Worker') as w2 \gset
insert into fx values ('customer', :'customer'), ('w1', :'w1'), ('w2', :'w2');

-- A $50 hire of p_worker, funded (the webhook's payment_intent.succeeded). Returns the job.
create or replace function tests.rl_hire(p_title text, p_worker uuid) returns uuid language plpgsql as $$
declare
  v_customer uuid := (select v from fx where k = 'customer');
  v_job uuid;
  v_offer uuid;
begin
  perform tests.clear_auth();
  update public.rate_counters set hits = 0 where user_id in (v_customer, p_worker);
  perform tests.authenticate_as(v_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'Refusal limit probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000, p_address_line := '7 Proof Way'
  )).id into v_job;
  perform tests.authenticate_as(p_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Refusal limit bid');
  perform tests.authenticate_as(v_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  perform tests.test_fund_job(v_job);
  return v_job;
end $$;

-- Hired, funded, done and released: the transfer is asked for. Returns the payment.
create or replace function tests.rl_transfer(p_title text, p_worker uuid) returns uuid language plpgsql as $$
declare
  v_job uuid := tests.rl_hire(p_title, p_worker);
  v_pid uuid;
begin
  perform tests.authenticate_as(p_worker);
  perform public.transition_job_status(v_job, 'in_progress');
  perform public.transition_job_status(v_job, 'completed', '["https://example.com/rl-done.jpg"]'::jsonb);
  perform tests.authenticate_as((select v from fx where k = 'customer'));
  v_pid := (public.release_job_payment(v_job)).id;
  perform tests.clear_auth();
  return v_pid;
end $$;

-- Hired and funded, then the worker cancels: the whole charge is asked back. Returns the payment.
create or replace function tests.rl_refund(p_title text) returns uuid language plpgsql as $$
declare
  v_worker uuid := (select v from fx where k = 'w1');
  v_job uuid := tests.rl_hire(p_title, v_worker);
begin
  perform tests.authenticate_as(v_worker);
  perform public.cancel_job(v_job, 'worker_cancelled');
  perform tests.clear_auth();
  return (select id from public.payments where job_id = v_job and kind = 'job_payment');
end $$;

-- The drain's two calls for one refused try: settlement_send_begin, then record_settlement_result.
create or replace function tests.rl_refused(p_pid uuid, p_kind text, p_error text) returns text language plpgsql as $$
declare
  v_pay public.payments := (select p from public.payments p where p.id = p_pid);
  v_attempt integer := case when p_kind = 'transfer' then v_pay.transfer_attempts else v_pay.refund_attempts end;
  v_cents integer := case when p_kind = 'transfer' then v_pay.transfer_cents else v_pay.refund_cents end;
begin
  if not public.settlement_send_begin(p_pid, p_kind, v_attempt, v_cents) then
    return 'not begun';
  end if;
  return public.record_settlement_result(p_pid, p_kind, v_attempt, 'new_key', p_error)::text;
end $$;

-- The run of a payment: first_refused_at relative to now(), last_attempt, refusals, ended.
create or replace function tests.rl_run(p_pid uuid, p_kind text) returns text language sql as $$
  select coalesce((select 'since now-' || (now() - r.first_refused_at)::text || ' last ' || r.last_attempt
                          || ' n ' || r.refusals || ' ' || case when r.ended_at is null then 'open' else 'ended' end
                     from public.settlement_refusals r where r.payment_id = p_pid and r.kind = p_kind), '<none>')
$$;

-- The row's state: attempts, stopped or not, in its ready queue or not.
create or replace function tests.rl_state(p_pid uuid, p_kind text) returns text language sql as $$
  select case when p_kind = 'transfer'
              then 'attempt ' || p.transfer_attempts || case when p.transfer_stopped_at is null then ' open' else ' stopped' end
                   || case when exists (select 1 from public.transfers_ready r where r.id = p.id) then ' ready' else ' not ready' end
              else 'attempt ' || p.refund_attempts || case when p.refund_stopped_at is null then ' open' else ' stopped' end
                   || case when exists (select 1 from public.refunds_ready r where r.id = p.id) then ' ready' else ' not ready' end
         end
    from public.payments p where p.id = p_pid
$$;

-- The lines of a payment: code/finish.
create or replace function tests.rl_lines(p_pid uuid) returns text language sql as $$
  select coalesce(string_agg(a.code || '/' || a.finish, ' | ' order by a.code), '<none>')
    from public.payment_attention a where a.payment_id = p_pid
$$;

create or replace function tests.rl_age(p_pid uuid, p_kind text, p_age interval) returns void language sql as $$
  update public.settlement_refusals set first_refused_at = now() - p_age where payment_id = p_pid and kind = p_kind
$$;

-- ---------------------------------------------------------------------------
-- A. The table and the two functions: server only.
-- ---------------------------------------------------------------------------
select ok((select c.relrowsecurity from pg_class c where c.oid = 'public.settlement_refusals'::regclass)
          and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'settlement_refusals'),
  'A1: settlement_refusals has row security on and no policy');
select ok(not has_table_privilege('anon', 'public.settlement_refusals', 'SELECT,INSERT,UPDATE')
          and not has_table_privilege('authenticated', 'public.settlement_refusals', 'SELECT,INSERT,UPDATE')
          and not has_table_privilege('service_role', 'public.settlement_refusals', 'SELECT,INSERT,UPDATE'),
  'A2: no client and no service_role right on it');
select ok(not has_function_privilege('anon', 'public.record_settlement_result(uuid, text, integer, text, text)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.record_settlement_result(uuid, text, integer, text, text)', 'EXECUTE')
          and has_function_privilege('service_role', 'public.record_settlement_result(uuid, text, integer, text, text)', 'EXECUTE'),
  'A3: record_settlement_result: service_role only, as before');
select ok(not has_function_privilege('anon', 'public.set_payouts_status(uuid, text)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.set_payouts_status(uuid, text)', 'EXECUTE')
          and has_function_privilege('service_role', 'public.set_payouts_status(uuid, text)', 'EXECUTE'),
  'A4: set_payouts_status: service_role only, as before');
select is((select reason || ' / ' || finish from public.payment_attention_codes() where code = 'transfer_balance_low'),
  'Stripe last refused this worker''s payout because your Stripe balance was too low. The app keeps trying, and stops if Stripe still says no after 3 days. Add money to your Stripe balance. / stripe',
  'A5: the balance line says the app stops after 3 days (the only sentence this file changes)');

-- ---------------------------------------------------------------------------
-- T1. A payout Stripe refuses for lack of balance: the run, then the stop after 3 days.
-- ---------------------------------------------------------------------------
select tests.rl_transfer('RL-T1 balance', :'w1') as t1 \gset
select is(tests.rl_refused(:'t1', 'transfer', '400 balance_insufficient: You have insufficient available funds in your Stripe account.'),
  'true', 'T1a: the first refusal is recorded');
select is(tests.rl_run(:'t1', 'transfer'), 'since now-00:00:00 last 0 n 1 open', 'T1b: it starts a run, dated now');
select is(tests.rl_state(:'t1', 'transfer'), 'attempt 1 open ready', 'T1c: a new attempt is ready, as before');
select is(tests.rl_lines(:'t1'), 'transfer_balance_low/stripe', 'T1d: listed as the balance line');
-- SURGERY: the run began 2 days ago.
select tests.rl_age(:'t1', 'transfer', interval '2 days');
select is(tests.rl_refused(:'t1', 'transfer', '400 balance_insufficient: You have insufficient available funds in your Stripe account.'),
  'true', 'T1e: the next attempt is refused too');
select is(tests.rl_run(:'t1', 'transfer'), 'since now-2 days last 1 n 2 open', 'T1f: the run goes on; its start does not move');
select is(tests.rl_state(:'t1', 'transfer'), 'attempt 2 open ready', 'T1g: under 3 days: a new attempt again');
-- SURGERY: the run began 3 days and 1 minute ago.
select tests.rl_age(:'t1', 'transfer', interval '3 days 1 minute');
select is(tests.rl_refused(:'t1', 'transfer', '400 balance_insufficient: You have insufficient available funds in your Stripe account.'),
  'true', 'T1h: a refusal more than 3 days into the run is recorded');
select is(tests.rl_state(:'t1', 'transfer'), 'attempt 2 stopped not ready', 'T1i: as a stop: no new attempt, the queue no longer offers it');
select is(tests.rl_run(:'t1', 'transfer'), 'since now-3 days 00:01:00 last 2 n 3 ended', 'T1j: the stop ends the run');
select ok((select last_error like 'transfer: refused on every try for 3 days (since %, 3 tries), stopped. Last answer: 400 balance_insufficient: %'
             from public.payments where id = :'t1'),
  'T1k: last_error says why first, then the last answer');
select is(tests.rl_lines(:'t1'), 'transfer_stopped/developer', 'T1l: listed as the stopped payout, for the developer');
select is((select reason from public.payment_attention where payment_id = :'t1'),
  'Sending the worker''s payout stopped after Stripe said no.', 'T1m: its existing sentence');
select ok((select detail like '%refused on every try for 3 days%' from public.payment_attention where payment_id = :'t1'),
  'T1n: the detail carries the reason');
-- The owner reopens after adding balance: a new attempt, and its first refusal starts a new run.
select is(public.settlement_send_reopen(:'t1', 'transfer'), true, 'T1o: the owner reopens it');
select is(tests.rl_refused(:'t1', 'transfer', '400 balance_insufficient: You have insufficient available funds in your Stripe account.'),
  'true', 'T1p: refused again after the reopen');
select is(tests.rl_run(:'t1', 'transfer') || ' / ' || tests.rl_state(:'t1', 'transfer'),
  'since now-00:00:00 last 3 n 1 open / attempt 4 open ready', 'T1q: a new run of its own: 3 more days, not stopped at once');

-- ---------------------------------------------------------------------------
-- T2. The bound: 2 days 23 hours into the run is not yet 3 days.
-- ---------------------------------------------------------------------------
select tests.rl_transfer('RL-T2 bound', :'w1') as t2 \gset
select tests.rl_refused(:'t2', 'transfer', '400 parameter_invalid_empty: probe');
select tests.rl_age(:'t2', 'transfer', interval '2 days 23 hours');
select is(tests.rl_refused(:'t2', 'transfer', '400 parameter_invalid_empty: probe') || ' / ' || tests.rl_state(:'t2', 'transfer'),
  'true / attempt 2 open ready', 'T2: refused at 2 days 23 hours: a new attempt, no stop');

-- ---------------------------------------------------------------------------
-- T3. An unknown answer between two refusals keeps the run.
-- ---------------------------------------------------------------------------
select tests.rl_transfer('RL-T3 unknown', :'w1') as t3 \gset
select tests.rl_refused(:'t3', 'transfer', '400 parameter_invalid_empty: probe');
select tests.rl_age(:'t3', 'transfer', interval '2 days');
select is(public.settlement_send_begin(:'t3', 'transfer', 1, (select transfer_cents from public.payments where id = :'t3')),
  true, 'T3a: attempt 1 is begun');
select is(public.record_settlement_result(:'t3', 'transfer', 1, 'same_key', 'threw: The operation was aborted due to timeout'),
  true, 'T3a2: and gets no clear answer (the same key next tick)');
select is(tests.rl_run(:'t3', 'transfer'), 'since now-2 days last 0 n 1 open', 'T3b: the unknown answer leaves the run as it was');
select is(public.record_settlement_result(:'t3', 'transfer', 1, 'new_key', '400 parameter_invalid_empty: probe'), true,
  'T3c: then attempt 1 is refused');
select is(tests.rl_run(:'t3', 'transfer'), 'since now-2 days last 1 n 2 open', 'T3d: the same run goes on');

-- ---------------------------------------------------------------------------
-- T4. Any other move of the counter, a stop, and a stale answer.
-- ---------------------------------------------------------------------------
select tests.rl_transfer('RL-T4 gap', :'w1') as t4 \gset
select tests.rl_refused(:'t4', 'transfer', '400 parameter_invalid_empty: probe');
select tests.rl_age(:'t4', 'transfer', interval '4 days');
-- SURGERY: the counter moves by 1 without a refusal (a reversed transfer asked for again).
update public.payments set transfer_attempts = transfer_attempts + 1 where id = :'t4';
select is(tests.rl_refused(:'t4', 'transfer', '400 parameter_invalid_empty: probe') || ' / ' || tests.rl_run(:'t4', 'transfer'),
  'true / since now-00:00:00 last 2 n 1 open', 'T4a: a refusal that does not follow the last refused attempt starts a new run');
select is(public.record_settlement_result(:'t4', 'transfer', 2, 'new_key', '400 parameter_invalid_empty: probe'), false,
  'T4b: an answer for an attempt that moved on returns false');
select is(tests.rl_run(:'t4', 'transfer') || ' / ' || tests.rl_state(:'t4', 'transfer'),
  'since now-00:00:00 last 2 n 1 open / attempt 3 open ready', 'T4c: and changes neither the run nor the row');
select is(public.settlement_send_begin(:'t4', 'transfer', 3, (select transfer_cents from public.payments where id = :'t4')),
  true, 'T4d: attempt 3 is begun');
select is(public.record_settlement_result(:'t4', 'transfer', 3, 'stop', '400 idempotency_error: probe'),
  true, 'T4d2: and stopped by the drain''s own verdict');
select is(tests.rl_run(:'t4', 'transfer'), 'since now-00:00:00 last 2 n 1 ended', 'T4e: ends the run');

-- ---------------------------------------------------------------------------
-- T5. Payouts off and on again: a payout that waited for the worker starts a fresh run.
-- ---------------------------------------------------------------------------
select tests.rl_transfer('RL-T5 payouts', :'w2') as t5 \gset
select tests.rl_refused(:'t5', 'transfer', '400 insufficient_capabilities_for_transfer: probe');
select tests.rl_age(:'t5', 'transfer', interval '4 days');
select public.set_payouts_status(:'w2', 'enabled');
select is(tests.rl_run(:'t5', 'transfer'), 'since now-4 days last 0 n 1 open', 'T5a: enabled while already enabled: the run goes on');
select public.set_payouts_status(:'w2', 'action_needed');
select is(tests.rl_state(:'t5', 'transfer') || ' / ' || tests.rl_lines(:'t5'), 'attempt 1 open not ready / transfer_no_payout_account/worker',
  'T5b: payouts off: the payout waits for the worker');
select is(public.set_payouts_status(:'w2', 'enabled'), true, 'T5c: the worker finishes setup');
select is(tests.rl_run(:'t5', 'transfer'), 'since now-4 days last 0 n 1 ended', 'T5d: the waiting payout''s run ended');
select is(tests.rl_refused(:'t5', 'transfer', '400 insufficient_capabilities_for_transfer: probe') || ' / ' || tests.rl_state(:'t5', 'transfer'),
  'true / attempt 2 open ready', 'T5e: refused again: a fresh run, no stop');

-- ---------------------------------------------------------------------------
-- R. A refund: the same limit.
-- ---------------------------------------------------------------------------
select tests.rl_refund('RL-R refund') as r1 \gset
select is(tests.rl_refused(:'r1', 'refund', '400 parameter_invalid_empty: probe') || ' / ' || tests.rl_run(:'r1', 'refund'),
  'true / since now-00:00:00 last 0 n 1 open', 'R1: a refund refusal starts a refund run');
select tests.rl_age(:'r1', 'refund', interval '3 days 1 minute');
select is(tests.rl_refused(:'r1', 'refund', '400 parameter_invalid_empty: probe') || ' / ' || tests.rl_state(:'r1', 'refund'),
  'true / attempt 1 stopped not ready', 'R2: more than 3 days into the run: the refund stops');
select is((select a.code || '/' || a.finish || ': ' || a.reason from public.payment_attention a
            where a.payment_id = :'r1' and a.what = 'refund'),
  'refund_stopped/developer: Sending the customer''s refund stopped after Stripe said no.', 'R3: listed with its existing sentence');
select ok((select last_error like 'refund: refused on every try for 3 days (since %, 2 tries), stopped. Last answer: 400 parameter_invalid_empty: probe'
             from public.payments where id = :'r1'),
  'R4: last_error says why first');
select is(tests.rl_run(:'r1', 'transfer'), '<none>', 'R5: the refund run is the refund''s own');

select * from finish();
rollback;
