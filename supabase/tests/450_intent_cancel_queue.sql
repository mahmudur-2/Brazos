-- 450_intent_cancel_queue.sql — pack 1, F2 (ii): the provider's PaymentIntent of a voided row that was
-- never held and received nothing is cancelled by process-settlements, once. Proves
-- 20261115000700_intent_cancel.sql (payments.intent_cancel_at, intents_to_cancel,
-- record_intent_cancel, payment_for_party).
--
-- THE CAST: a customer, a worker with an enabled payout account, the runner (RLS bypassed; the
-- drain's and the webhook's stand-in). Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(19);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('ic.customer@brazos.test', 'Ida Customer') as customer \gset
select tests.create_user('ic.worker@brazos.test',   'Ivo Worker')   as worker   \gset
insert into fx values ('customer', :'customer'), ('worker', :'worker');

create or replace function tests.ic_try(p_sql text) returns text language plpgsql as $$
declare v_out text;
begin
  execute p_sql into v_out;
  return 'ok: ' || coalesce(v_out, 'null');
exception when others then
  return 'error: ' || sqlerrm;
end $$;

create or replace function tests.ic_event(p_id text, p_type text, p_object jsonb) returns jsonb language plpgsql as $$
begin
  insert into public.payment_events (id, type, payload)
  values (p_id, p_type, jsonb_build_object('id', p_id, 'type', p_type, 'data', jsonb_build_object('object', p_object)))
  on conflict (id) do nothing;
  return public.apply_payment_event(p_id);
end $$;

-- Hire at $50; nothing paid yet. Returns the job id.
create or replace function tests.ic_hire(p_title text) returns uuid language plpgsql as $$
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
    p_title := p_title, p_description := 'Intent cancel probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000, p_address_line := '4 Proof Way'
  )).id into v_job;
  perform tests.authenticate_as(v_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Intent cancel bid');
  perform tests.authenticate_as(v_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  return v_job;
end $$;

-- The customer begins checkout on p_job; the intent id is attached as create-payment does.
create or replace function tests.ic_checkout(p_job uuid) returns uuid language plpgsql as $$
declare v_pid uuid;
begin
  perform tests.authenticate_as((select v from fx where k = 'customer'));
  v_pid := (public.begin_job_payment(p_job)).id;
  perform tests.clear_auth();
  perform public.attach_provider_ref(v_pid, 'pi_ic_' || left(md5(v_pid::text), 12));
  return v_pid;
end $$;

create or replace function tests.ic_queued(p_pid uuid) returns boolean language sql as $$
  select exists (select 1 from public.intents_to_cancel q where q.id = p_pid)
$$;

-- ---------------------------------------------------------------------------
-- 1. Every void of a row with an intent queues it.
-- ---------------------------------------------------------------------------
-- a. The worker cancels before the customer paid (cancel_job).
select tests.ic_hire('IC cancelled') as j1 \gset
select tests.ic_checkout(:'j1') as p1 \gset
select tests.authenticate_as(:'worker');
select public.cancel_job(:'j1', 'worker_cancelled');
select tests.clear_auth();
select is((select status::text from public.payments where id = :'p1'), 'voided', '1a (control): cancel_job voided the unfunded row');
select ok(tests.ic_queued(:'p1'), '1b: its intent is queued for cancel');

-- b. The funding window ran out and the customer opens checkout again (begin_job_payment).
select tests.ic_hire('IC window') as j2 \gset
select tests.ic_checkout(:'j2') as p2 \gset
update public.payments set funding_due_at = now() - interval '1 minute' where id = :'p2';
select tests.ic_checkout(:'j2') as p2b \gset
select ok(tests.ic_queued(:'p2') and not tests.ic_queued(:'p2b'), '1c: the expired row is queued, its fresh row is not');

-- c. The sweeper (expire_unfunded_payments).
select tests.ic_hire('IC sweeper') as j3 \gset
select tests.ic_checkout(:'j3') as p3 \gset
update public.payments set funding_due_at = now() - interval '1 minute' where id = :'p3';
select count(*) from public.expire_unfunded_payments();
select ok(tests.ic_queued(:'p3'), '1d: a row the sweeper voided is queued');

-- d. The provider said the intent was canceled (payment_intent.canceled): the cancel is answered
-- as already canceled (a 4xx) and stamped; queued like any other void.
select tests.ic_hire('IC canceled event') as j4 \gset
select tests.ic_checkout(:'j4') as p4 \gset
select tests.ic_event('evt_ic_pc_' || :'p4', 'payment_intent.canceled', jsonb_build_object(
  'id', (select provider_ref from public.payments where id = :'p4'), 'metadata', jsonb_build_object('payment_id', :'p4')));
select ok(tests.ic_queued(:'p4'), '1e: a row voided by payment_intent.canceled is queued');

-- ---------------------------------------------------------------------------
-- 2. Never a row that was held, received money, has no intent, or is not voided.
-- ---------------------------------------------------------------------------
select tests.ic_hire('IC held') as j5 \gset
select tests.test_fund_job(:'j5') as p5 \gset
select ok(not tests.ic_queued(:'p5'), '2a: a held row is not queued');

select tests.ic_hire('IC unfunded') as j6 \gset
select tests.ic_checkout(:'j6') as p6 \gset
select ok(not tests.ic_queued(:'p6'), '2b: an unfunded row (checkout still open) is not queued');

select tests.ic_hire('IC no intent') as j7 \gset
select tests.authenticate_as(:'customer');
select (public.begin_job_payment(:'j7')).id as p7 \gset
select tests.authenticate_as(:'worker');
select public.cancel_job(:'j7', 'worker_cancelled');
select tests.clear_auth();
select ok((select status = 'voided' and provider_ref is null from public.payments where id = :'p7') and not tests.ic_queued(:'p7'),
  '2c: a voided row with no intent is not queued');

-- Charged after the void: the money came in, so a refund goes back; the intent is never cancelled.
select tests.ic_event('evt_ic_late_' || :'p1', 'payment_intent.succeeded', jsonb_build_object(
  'id', (select provider_ref from public.payments where id = :'p1'),
  'amount_received', (select charge_amount_cents from public.payments where id = :'p1'),
  'metadata', jsonb_build_object('payment_id', :'p1')));
select is((select status::text || '/' || refund_reason from public.payments where id = :'p1'), 'voided/funded_after_void',
  '2d (control): the late charge queued its full refund');
select ok(not tests.ic_queued(:'p1'), '2e: a voided row that received money leaves the queue');

-- ---------------------------------------------------------------------------
-- 3. The queue's order, and record_intent_cancel.
-- ---------------------------------------------------------------------------
update public.payments set created_at = timestamptz '2000-01-01 00:00:00+00' where id = :'p3';
select is((select q.id from public.intents_to_cancel q limit 1), :'p3'::uuid, '3a: the oldest row first');
select is(tests.ic_try(format('select public.record_intent_cancel(%L)::text', :'p3')), 'ok: true', '3b: a final answer is stamped');
select ok((select intent_cancel_at is not null from public.payments where id = :'p3') and not tests.ic_queued(:'p3'),
  '3c: … and the row leaves the queue');
select is(tests.ic_try(format('select public.record_intent_cancel(%L)::text', :'p3')), 'ok: false', '3d: a second stamp changes nothing');
select is(tests.ic_try(format('select public.record_intent_cancel(%L)::text', :'p5')), 'ok: false', '3e: a row that is not voided is never stamped');

-- ---------------------------------------------------------------------------
-- 4. Who may see and call it; the parties never read the stamp.
-- ---------------------------------------------------------------------------
select ok(not has_table_privilege('anon', 'public.intents_to_cancel', 'SELECT')
          and not has_table_privilege('authenticated', 'public.intents_to_cancel', 'SELECT')
          and has_table_privilege('service_role', 'public.intents_to_cancel', 'SELECT'),
  '4a: intents_to_cancel: service_role only');
select ok(not has_function_privilege('anon', 'public.record_intent_cancel(uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.record_intent_cancel(uuid)', 'EXECUTE')
          and has_function_privilege('service_role', 'public.record_intent_cancel(uuid)', 'EXECUTE'),
  '4b: record_intent_cancel: service_role only');
select is((select p.prosecdef::text || ' ' || array_to_string(p.proconfig, ',') from pg_proc p
            where p.oid = 'public.record_intent_cancel(uuid)'::regprocedure),
  'true search_path=public, pg_temp', '4c: security definer with the fixed search_path');
select ok(not has_column_privilege('authenticated', 'public.payments', 'intent_cancel_at', 'SELECT')
          and (select (public.payment_for_party(p)).intent_cancel_at is null from public.payments p where p.id = :'p3'),
  '4d: the parties never read intent_cancel_at: no column grant, and payment_for_party empties it');

select * from finish();
rollback;
