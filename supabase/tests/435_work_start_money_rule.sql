-- 435_work_start_money_rule.sql — pack 1, A6: work starts only on money that can be paid out. A held
-- payment under a card dispute, or charged for another amount, cannot start the work. Proves
-- 20261115000200_work_start_money_rule.sql (payment_money_clear; transition_job_status; transfers_due
-- and refunds_due read the same helper).
--
-- THE CAST: a customer, a worker with an enabled payout account, the runner (RLS bypassed;
-- fixtures and the webhook's stand-in). Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(10);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('ws.customer@brazos.test', 'Wes Customer') as customer \gset
select tests.create_user('ws.worker@brazos.test',   'Wyn Worker')   as worker   \gset
insert into fx values ('customer', :'customer'), ('worker', :'worker');

create or replace function tests.ws_event(p_id text, p_type text, p_object jsonb) returns jsonb language plpgsql as $$
begin
  insert into public.payment_events (id, type, payload)
  values (p_id, p_type, jsonb_build_object('id', p_id, 'type', p_type, 'data', jsonb_build_object('object', p_object)))
  on conflict (id) do nothing;
  return public.apply_payment_event(p_id);
end $$;

-- A card dispute on the payment's charge, as the provider sends it (resolved by the PaymentIntent).
create or replace function tests.ws_dispute(p_id text, p_pid uuid, p_type text, p_status text) returns jsonb language sql as $$
  select tests.ws_event(p_id, 'charge.dispute.' || p_type, jsonb_build_object(
    'id', 'dp_' || left(md5(p_pid::text), 12), 'status', p_status,
    'amount', (select charge_amount_cents from public.payments where id = p_pid),
    'payment_intent', (select provider_ref from public.payments where id = p_pid)))
$$;

-- Hire at $50; nothing paid yet.
create or replace function tests.ws_hire(p_title text) returns uuid language plpgsql as $$
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
    p_title := p_title, p_description := 'Work start probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000, p_address_line := '4 Proof Way'
  )).id into v_job;
  perform tests.authenticate_as(v_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Work start bid');
  perform tests.authenticate_as(v_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  return v_job;
end $$;

-- The worker starts the work: 'ok: in_progress' or 'error: <the sentence>'.
create or replace function tests.ws_start(p_job uuid) returns text language plpgsql as $$
declare v_out text;
begin
  perform tests.authenticate_as((select fx.v from fx where fx.k = 'worker'));
  begin
    v_out := 'ok: ' || (public.transition_job_status(p_job, 'in_progress')).status::text;
  exception when others then
    v_out := 'error: ' || sqlerrm;
  end;
  perform tests.clear_auth();
  return v_out;
end $$;

-- ---------------------------------------------------------------------------
-- 0. One rule, read by the start gate and both queues.
-- ---------------------------------------------------------------------------
select ok(to_regprocedure('public.payment_money_clear(public.payments)') is not null
          and has_function_privilege('service_role', 'public.payment_money_clear(public.payments)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.payment_money_clear(public.payments)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.payment_money_clear(public.payments)', 'EXECUTE'),
  '0a: payment_money_clear(payments) exists and only service_role may execute it');
select ok(pg_get_viewdef('public.transfers_due'::regclass) like '%payment_money_clear(%'
          and pg_get_viewdef('public.refunds_due'::regclass) like '%payment_money_clear(%',
  '0b: transfers_due and refunds_due read the same rule');

-- ---------------------------------------------------------------------------
-- 1. Control: a plain held payment starts the work as today.
-- ---------------------------------------------------------------------------
select tests.ws_hire('WS control') as j0 \gset
select tests.test_fund_job(:'j0') as p0 \gset
select is(tests.ws_start(:'j0'), 'ok: in_progress', '1a: held and clear: the work starts');

-- ---------------------------------------------------------------------------
-- 2. A card dispute opened on a held payment before the work started.
-- ---------------------------------------------------------------------------
select tests.ws_hire('WS card dispute') as j1 \gset
select tests.test_fund_job(:'j1') as p1 \gset
select tests.ws_dispute('evt_ws_d1_c', :'p1', 'created', 'needs_response') as d1 \gset
select is((select status::text || '/' || (chargeback_at is not null)::text from public.payments where id = :'p1'), 'held/true',
  '2a: the payment is still held, under a card dispute');
select is(tests.ws_start(:'j1'), 'error: This job''s payment is on hold, so the work can''t start yet.',
  '2b: the work cannot start on money the bank may take back');
select is((select status::text from public.jobs where id = :'j1'), 'assigned', '2c: the job stays assigned');
select tests.ws_dispute('evt_ws_d1_w', :'p1', 'closed', 'won') as d1w \gset
select is(tests.ws_start(:'j1'), 'ok: in_progress', '2d: the dispute is won: the work starts');

-- ---------------------------------------------------------------------------
-- 3. A charge for another amount than the row says.
-- ---------------------------------------------------------------------------
select tests.ws_hire('WS amount') as j2 \gset
select tests.authenticate_as(:'customer');
select (public.begin_job_payment(:'j2')).id as p2 \gset
select tests.clear_auth();
select public.attach_provider_ref(:'p2', 'pi_ws_amount');
select tests.ws_event('evt_ws_a_s', 'payment_intent.succeeded', jsonb_build_object('id', 'pi_ws_amount',
  'amount_received', (select charge_amount_cents - 1 from public.payments where id = :'p2'),
  'metadata', jsonb_build_object('payment_id', :'p2'))) as s2 \gset
select is((select status::text || '/' || (received_cents = charge_amount_cents - 1)::text from public.payments where id = :'p2'), 'held/true',
  '3a: held, but charged one cent less than the row says');
select is(tests.ws_start(:'j2'), 'error: This job''s payment is on hold, so the work can''t start yet.',
  '3b: the work cannot start on a charge a person must settle first');
select is((select status::text from public.jobs where id = :'j2'), 'assigned', '3c: the job stays assigned');

select * from finish();
rollback;
