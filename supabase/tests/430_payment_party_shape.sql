-- 430_payment_party_shape.sql — pack 1, A4 and A2 (deadline): the payer's money RPCs return only the
-- 27 columns a party may read, and a checkout past its funding window is never resumed. Proves
-- 20261115000100_payer_money_rpcs.sql (payment_for_party; job_payment_state, begin_job_payment,
-- begin_tip_payment, release_job_payment). Codex R3-A9: refund_failed_at (20261115000600) is one of
-- the 27, read by both parties.
--
-- THE CAST: a customer, a worker with an enabled payout account, the runner (RLS bypassed;
-- fixtures and the webhook's stand-in). Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(17);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('ps.customer@brazos.test', 'Pia Customer') as customer \gset
select tests.create_user('ps.worker@brazos.test',   'Pol Worker')   as worker   \gset
insert into fx values ('customer', :'customer'), ('worker', :'worker');

-- The server columns of a returned row that are not empty, sorted; '' when none. Codex R2: 'no row'
-- when the call returned nothing (null, or a row with no id), so a missing result fails a shape check.
create or replace function tests.ps_server(p_row jsonb) returns text language sql as $$
  select case when p_row ->> 'id' is null then 'no row' else (
  select coalesce(string_agg(e.key, ',' order by e.key), '')
    from jsonb_each(p_row - array['id', 'job_id', 'offer_id', 'payer_id', 'payee_id', 'kind', 'amount_cents',
           'platform_fee_cents', 'provider', 'provider_ref', 'status', 'authorized_at', 'held_at', 'released_at',
           'release_reason', 'paid_out_at', 'created_at', 'updated_at', 'charge_amount_cents', 'customer_fee_cents',
           'tax_cents', 'funding_due_at', 'release_requested_at', 'transfer_cents', 'refund_cents', 'refund_reason',
           'refund_failed_at']) e
   where e.value <> 'null'::jsonb) end
$$;

-- A party's call p_sql (returning one payments row), as jsonb. p_as: 'customer' or 'worker'.
create or replace function tests.ps_call(p_sql text, p_as text default 'customer') returns jsonb language plpgsql as $$
declare v_out jsonb;
begin
  perform tests.authenticate_as((select fx.v from fx where fx.k = p_as));
  execute format('select to_jsonb(r) from (%s) r', p_sql) into v_out;
  perform tests.clear_auth();
  return v_out;
end $$;

create or replace function tests.ps_event(p_id text, p_type text, p_object jsonb) returns jsonb language plpgsql as $$
begin
  insert into public.payment_events (id, type, payload)
  values (p_id, p_type, jsonb_build_object('id', p_id, 'type', p_type, 'data', jsonb_build_object('object', p_object)))
  on conflict (id) do nothing;
  return public.apply_payment_event(p_id);
end $$;

-- Hire at $50; nothing paid yet.
create or replace function tests.ps_hire(p_title text) returns uuid language plpgsql as $$
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
    p_title := p_title, p_description := 'Party shape probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000, p_address_line := '4 Proof Way'
  )).id into v_job;
  perform tests.authenticate_as(v_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Party shape bid');
  perform tests.authenticate_as(v_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  return v_job;
end $$;

-- ---------------------------------------------------------------------------
-- 0. The helper strips; nobody calls it directly.
-- ---------------------------------------------------------------------------
select ok(to_regprocedure('public.payment_for_party(public.payments)') is not null
          and not has_function_privilege('authenticated', 'public.payment_for_party(public.payments)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.payment_for_party(public.payments)', 'EXECUTE'),
  '0a: payment_for_party(payments) exists and no client role may execute it');
select is(tests.ps_server(null) || ' / ' || tests.ps_server(jsonb_build_object('id', null, 'status', null)), 'no row / no row',
  '0b: a missing result (null, or a row of nulls) fails every shape check below');

-- ---------------------------------------------------------------------------
-- 1. begin_job_payment: a new row, then the same row resumed.
-- ---------------------------------------------------------------------------
select tests.ps_hire('PS job') as j1 \gset
select tests.ps_call(format('select * from public.begin_job_payment(%L)', :'j1')) as r1 \gset
select is(tests.ps_server(:'r1'), '', '1a: begin_job_payment (a new row) returns no server column');
select tests.ps_call(format('select * from public.begin_job_payment(%L)', :'j1')) as r1b \gset
select is((:'r1b'::jsonb) ->> 'id', (:'r1'::jsonb) ->> 'id', '1b: inside the window the same row is resumed (control)');
select is(tests.ps_server(:'r1b'), '', '1c: begin_job_payment (resumed) returns no server column');

-- ---------------------------------------------------------------------------
-- 2. A2: the window ran out, the sweeper has not run yet.
-- ---------------------------------------------------------------------------
update public.payments set funding_due_at = now() - interval '1 minute' where id = ((:'r1'::jsonb) ->> 'id')::uuid;
select tests.ps_call(format('select * from public.begin_job_payment(%L)', :'j1')) as r1c \gset
select isnt((:'r1c'::jsonb) ->> 'id', (:'r1'::jsonb) ->> 'id', '2a: past funding_due_at a fresh row is given');
select is((select status::text || '/' || coalesce(last_error, 'null') from public.payments where id = ((:'r1'::jsonb) ->> 'id')::uuid),
  'voided/funding window expired', '2b: and the overdue row is voided with its reason');
select ok((select funding_due_at > now() from public.payments where id = ((:'r1c'::jsonb) ->> 'id')::uuid),
  '2c: the fresh row has a window ahead of it');

-- ---------------------------------------------------------------------------
-- 3. release_job_payment: the request, then the idempotent repeat.
-- ---------------------------------------------------------------------------
select tests.test_fund_job(:'j1') as p1 \gset
select tests.authenticate_as(:'worker');
select public.transition_job_status(:'j1', 'in_progress');
select public.transition_job_status(:'j1', 'completed', '["https://example.com/ps-done.jpg"]'::jsonb);
select tests.clear_auth();
select tests.ps_call(format('select * from public.release_job_payment(%L)', :'j1')) as r3 \gset
select is(tests.ps_server(:'r3'), '', '3a: release_job_payment (the request) returns no server column');
select tests.ps_call(format('select * from public.release_job_payment(%L)', :'j1')) as r3b \gset
select is(tests.ps_server(:'r3b'), '', '3b: release_job_payment (already requested) returns no server column');

-- ---------------------------------------------------------------------------
-- 4. begin_tip_payment: a new row, the same row resumed, and A2 for the tip.
-- ---------------------------------------------------------------------------
select tests.ps_event('evt_ps_tc_' || :'p1', 'transfer.created', jsonb_build_object(
  'id', 'tr_ps_0001', 'amount', (select transfer_cents from public.payments where id = :'p1'),
  'metadata', jsonb_build_object('payment_id', :'p1'))) as tc \gset
select tests.ps_call(format('select * from public.begin_tip_payment(%L, 1000)', :'j1')) as t1 \gset
select is(tests.ps_server(:'t1'), '', '4a: begin_tip_payment (a new row) returns no server column');
select tests.ps_call(format('select * from public.begin_tip_payment(%L, 1000)', :'j1')) as t1b \gset
select is((:'t1b'::jsonb) ->> 'id', (:'t1'::jsonb) ->> 'id', '4b: inside the window the same tip row is resumed (control)');
select is(tests.ps_server(:'t1b'), '', '4c: begin_tip_payment (resumed) returns no server column');
update public.payments set funding_due_at = now() - interval '1 minute' where id = ((:'t1'::jsonb) ->> 'id')::uuid;
select tests.ps_call(format('select * from public.begin_tip_payment(%L, 1000)', :'j1')) as t1c \gset
select isnt((:'t1c'::jsonb) ->> 'id', (:'t1'::jsonb) ->> 'id', '4d: past funding_due_at a fresh tip row is given');
select is((select status::text || '/' || coalesce(last_error, 'null') from public.payments where id = ((:'t1'::jsonb) ->> 'id')::uuid),
  'voided/funding window expired', '4e: and the overdue tip row is voided with its reason');

-- ---------------------------------------------------------------------------
-- 5. R3-A9: a refund that failed at the provider: both parties read its time, and no server column.
-- ---------------------------------------------------------------------------
select tests.ps_hire('PS refund failed') as j5 \gset
select tests.test_fund_job(:'j5') as p5 \gset
select tests.authenticate_as(:'worker');
select public.transition_job_status(:'j5', 'in_progress');
select public.transition_job_status(:'j5', 'completed', '["https://example.com/ps-done.jpg"]'::jsonb);
select tests.authenticate_as(:'customer');
select (public.open_job_dispute(:'j5', 'other')).status as d5 \gset
select tests.clear_auth();
select (public.resolve_job_dispute(:'j5', 'customer', 'Probe: resolved for the customer.')).refund_cents as rc5 \gset
select public.record_settlement_sent(:'p5', 'refund', 're_ps_5', :rc5);
select tests.ps_event('evt_ps_rf_' || :'p5', 'refund.failed', jsonb_build_object(
  'id', 're_ps_5', 'object', 'refund', 'amount', :rc5, 'status', 'failed', 'failure_reason', 'expired_or_canceled_card',
  'payment_intent', (select provider_ref from public.payments where id = :'p5'),
  'metadata', jsonb_build_object('payment_id', :'p5'))) as rf5 \gset
select tests.ps_call(format('select * from public.job_payment_state(%L)', :'j5')) as s5c \gset
select tests.ps_call(format('select * from public.job_payment_state(%L)', :'j5'), 'worker') as s5w \gset
select is(tests.ps_server(:'s5c') || '/' || ((:'s5c'::jsonb) ->> 'refund_failed_at' is not null)::text, '/true',
  '5a: the customer reads the failure''s time, and no server column');
select is(tests.ps_server(:'s5w') || '/' || ((:'s5w'::jsonb) ->> 'refund_failed_at' is not null)::text, '/true',
  '5b: the worker too');

select * from finish();
rollback;
