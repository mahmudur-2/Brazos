-- 380_money_guards.sql — lean B17 (money parts) and B20: what a party can read of a payment, a
-- money record outlives its job, a reversed tip can be decided, and the new money objects are
-- service_role only. Proves 20261112010500 (resolve_tip), 20261112010600 (payments_job_id_fkey),
-- 20261112010800 (column grants, job_payment_state) and the ACLs of 20261112010100..010400.
--
-- THE CAST: a customer (the payer), the hired worker (the payee), the runner (RLS bypassed;
-- fixtures, the webhook's stand-in and the owner), anon and authenticated for privilege checks.
-- No surgery. Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(30);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('mg.customer@brazos.test', 'Gus Customer') as customer \gset
select tests.create_user('mg.worker@brazos.test',   'Gia Worker')   as worker   \gset
insert into fx values ('customer', :'customer'), ('worker', :'worker');

create or replace function tests.mg_event(p_id text, p_type text, p_object jsonb) returns jsonb language plpgsql as $$
begin
  insert into public.payment_events (id, type, payload)
  values (p_id, p_type, jsonb_build_object('id', p_id, 'type', p_type, 'data', jsonb_build_object('object', p_object)))
  on conflict (id) do nothing;
  return public.apply_payment_event(p_id);
end $$;

-- Hire at $50, fund, work, release, and the transfer lands: the job payment is released.
create or replace function tests.mg_job(p_title text) returns uuid language plpgsql as $$
declare
  v_customer uuid := (select v from fx where k = 'customer');
  v_worker   uuid := (select v from fx where k = 'worker');
  v_job uuid;
  v_offer uuid;
  v_pid uuid;
begin
  perform tests.authenticate_as(v_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'Guard probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000, p_address_line := '4 Proof Way'
  )).id into v_job;
  perform tests.authenticate_as(v_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Guard bid');
  perform tests.authenticate_as(v_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  v_pid := tests.test_fund_job(v_job);
  perform tests.authenticate_as(v_worker);
  perform public.transition_job_status(v_job, 'in_progress');
  perform public.transition_job_status(v_job, 'completed', '["https://example.com/mg-done.jpg"]'::jsonb);
  perform tests.authenticate_as(v_customer);
  perform public.release_job_payment(v_job);
  perform tests.clear_auth();
  perform tests.mg_event('evt_mg_tc_' || v_pid, 'transfer.created', jsonb_build_object(
    'id', 'tr_mg_' || left(md5(v_pid::text), 12), 'amount', (select transfer_cents from public.payments where id = v_pid),
    'metadata', jsonb_build_object('payment_id', v_pid)));
  return v_job;
end $$;

-- A $10 tip on p_job, charged for p_received (null = its own charge). Returns the tip's id.
create or replace function tests.mg_tip(p_job uuid, p_received integer default null) returns uuid language plpgsql as $$
declare v_tip uuid;
begin
  perform tests.authenticate_as((select v from fx where k = 'customer'));
  v_tip := (public.begin_tip_payment(p_job, 1000)).id;
  perform tests.clear_auth();
  perform public.attach_provider_ref(v_tip, 'pi_mg_' || left(md5(v_tip::text), 12));
  perform tests.mg_event('evt_mg_ts_' || v_tip, 'payment_intent.succeeded', jsonb_build_object(
    'id', 'pi_mg_' || left(md5(v_tip::text), 12),
    'amount_received', coalesce(p_received, (select charge_amount_cents from public.payments where id = v_tip)),
    'metadata', jsonb_build_object('payment_id', v_tip)));
  return v_tip;
end $$;

-- The tip's transfer lands, then is reversed in full: the tip is parked.
create or replace function tests.mg_reverse(p_tip uuid) returns void language plpgsql as $$
declare v_ref text := 'tr_mgt_' || left(md5(p_tip::text), 12);
begin
  perform tests.mg_event('evt_mg_ttc_' || p_tip, 'transfer.created', jsonb_build_object(
    'id', v_ref, 'amount', (select transfer_cents from public.payments where id = p_tip), 'metadata', jsonb_build_object('payment_id', p_tip)));
  perform tests.mg_event('evt_mg_ttr_' || p_tip, 'transfer.reversed', jsonb_build_object(
    'id', v_ref, 'amount', (select transfer_cents from public.payments where id = p_tip), 'amount_reversed',
    (select transfer_cents from public.payments where id = p_tip), 'reversed', true, 'metadata', jsonb_build_object('payment_id', p_tip)));
end $$;

-- How many of the payments columns outside the client list p_user is refused (42501).
create or replace function tests.mg_hidden_refused(p_user uuid) returns integer language plpgsql as $$
declare
  v_col text;
  v_refused integer := 0;
begin
  perform tests.authenticate_as(p_user);
  for v_col in
    select a.attname from pg_attribute a
     where a.attrelid = 'public.payments'::regclass and a.attnum > 0 and not a.attisdropped
       and a.attname <> all (array['id', 'job_id', 'offer_id', 'payer_id', 'payee_id', 'kind', 'amount_cents',
         'platform_fee_cents', 'provider', 'provider_ref', 'status', 'authorized_at', 'held_at', 'released_at',
         'release_reason', 'paid_out_at', 'created_at', 'updated_at', 'charge_amount_cents', 'customer_fee_cents',
         'tax_cents', 'funding_due_at', 'release_requested_at', 'transfer_cents', 'refund_cents', 'refund_reason'])
  loop
    begin
      execute format('select %I from public.payments limit 1', v_col);
    exception when insufficient_privilege then
      v_refused := v_refused + 1;
    end;
  end loop;
  perform tests.clear_auth();
  return v_refused;
end $$;

create or replace function tests.mg_try(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return 'ok: ' || coalesce(v, 'null');
exception when others then
  return 'error: ' || sqlerrm;
end $$;

select tests.mg_job('MG one') as j1 \gset
select id as p1 from public.payments where job_id = :'j1' and kind = 'job_payment' \gset
insert into fx values ('j1', :'j1'), ('p1', :'p1');

-- ---------------------------------------------------------------------------
-- 1. B17: a party reads the 26 columns the app reads, and none of the others.
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from pg_attribute a where a.attrelid = 'public.payments'::regclass and a.attnum > 0 and not a.attisdropped),
  46, '1a: payments has 46 columns: 26 for the parties, 20 for the server');
select tests.authenticate_as(:'customer');
select lives_ok($$ select id, job_id, offer_id, payer_id, payee_id, kind, amount_cents, platform_fee_cents, provider,
  provider_ref, status, authorized_at, held_at, released_at, release_reason, paid_out_at, created_at, updated_at,
  charge_amount_cents, customer_fee_cents, tax_cents, funding_due_at, release_requested_at, transfer_cents, refund_cents,
  refund_reason from public.payments where job_id = (select v from fx where k = 'j1') $$,
  '1b: the payer reads every column the app selects (lib/payments.ts PAYMENT_COLUMNS)');
select is((select count(*) from public.payments where job_id = :'j1'), 1::bigint, '1c: count(*) still works, and RLS still shows the payer its row');
select throws_ok($$ select transfer_ref from public.payments $$, '42501', null::text, '1d: the payer cannot read the provider''s transfer id');
select throws_ok($$ select last_error from public.payments $$, '42501', null::text, '1e: … nor last_error');
select tests.clear_auth();
select is(tests.mg_hidden_refused(:'customer'), 20, '1f: the payer is refused all 20 server columns');
select is(tests.mg_hidden_refused(:'worker'), 20, '1g: the payee too');
select tests.authenticate_as(:'worker');
select lives_ok($$ select id, job_id, offer_id, payer_id, payee_id, kind, amount_cents, platform_fee_cents, provider,
  provider_ref, status, authorized_at, held_at, released_at, release_reason, paid_out_at, created_at, updated_at,
  release_requested_at, refund_cents, transfer_cents from public.payments where payee_id = (select v from fx where k = 'worker') $$,
  '1h: the payee reads what Earnings selects (lib/earnings.ts)');
select is((select to_jsonb(s) - array['id', 'job_id', 'offer_id', 'payer_id', 'payee_id', 'kind', 'amount_cents',
             'platform_fee_cents', 'provider', 'provider_ref', 'status', 'authorized_at', 'held_at', 'released_at',
             'release_reason', 'paid_out_at', 'created_at', 'updated_at', 'charge_amount_cents', 'customer_fee_cents',
             'tax_cents', 'funding_due_at', 'release_requested_at', 'transfer_cents', 'refund_cents', 'refund_reason']
           from public.job_payment_state(:'j1') s),
  (select jsonb_object_agg(a.attname, null) from pg_attribute a
    where a.attrelid = 'public.payments'::regclass and a.attnum > 0 and not a.attisdropped
      and a.attname <> all (array['id', 'job_id', 'offer_id', 'payer_id', 'payee_id', 'kind', 'amount_cents',
        'platform_fee_cents', 'provider', 'provider_ref', 'status', 'authorized_at', 'held_at', 'released_at',
        'release_reason', 'paid_out_at', 'created_at', 'updated_at', 'charge_amount_cents', 'customer_fee_cents',
        'tax_cents', 'funding_due_at', 'release_requested_at', 'transfer_cents', 'refund_cents', 'refund_reason'])),
  '1i: job_payment_state() returns every server column empty');
select is((select status::text from public.job_payment_state(:'j1')), 'released', '1j: … and the columns the app reads as they are');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 2. B17: deleting a job never deletes its money record.
-- ---------------------------------------------------------------------------
select is((select confdeltype::text from pg_constraint where conname = 'payments_job_id_fkey' and conrelid = 'public.payments'::regclass),
  'a', '2a: payments_job_id_fkey is NO ACTION, not CASCADE');
select tests.authenticate_as(:'customer');
select is(tests.mg_try(format('with d as (delete from public.jobs where id = %L returning 1) select count(*) from d', :'j1')), 'ok: 0',
  '2b: the customer''s delete (jobs_delete_own) removes nothing on a hired job');
select tests.clear_auth();
select throws_ok(format('delete from public.jobs where id = %L', :'j1'), '23503', null::text,
  '2c: even with RLS bypassed, a job with a payment cannot be deleted');
select is((select count(*) from public.payments where job_id = :'j1'), 1::bigint, '2d: the payment row is still there');

-- ---------------------------------------------------------------------------
-- 3. B20: resolve_tip decides a reversed tip.
-- ---------------------------------------------------------------------------
select tests.mg_tip(:'j1') as t1 \gset
select tests.mg_reverse(:'t1');
select is((select status::text || '/' || (transfer_reversed_at is not null)::text from public.payments where id = :'t1'),
  'held/true', '3a: a tip reversed in full is parked');
select is(tests.mg_try(format('select (public.resolve_tip(%L, %L)).id', :'t1', 'maybe')), 'error: Unknown outcome: send or refund', '3b: an unknown outcome is refused');
select is(tests.mg_try(format('select (public.resolve_tip(%L, %L)).id', :'p1', 'send')), 'error: Tip not found', '3c: a job payment is not a tip');
select is(tests.mg_try(format('select (public.resolve_tip(%L, %L)).transfer_attempts', :'t1', 'send')), 'ok: 1',
  '3d: send: a new attempt (a new key)');
select is((select (transfer_reversed_at is null)::text || '/' || transfer_cents || '/' || (select count(*) from public.transfers_due d where d.id = :'t1')
             from public.payments where id = :'t1'), 'true/1000/1', '3e: the park is cleared and the whole tip is queued again');
select is(tests.mg_try(format('select (public.resolve_tip(%L, %L)).id', :'t1', 'send')), 'error: Only a reversed tip can be sent again',
  '3f: send twice is refused');

select tests.mg_job('MG two') as j2 \gset
select tests.mg_tip(:'j2') as t2 \gset
select tests.mg_reverse(:'t2');
select is(tests.mg_try(format('select (public.resolve_tip(%L, %L)).refund_reason', :'t2', 'refund')), 'ok: dispute_refund',
  '3g: refund: the whole charge goes back to the customer');
select is((select (refund_cents = charge_amount_cents)::text || '/' || transfer_cents || '/' || (select count(*) from public.refunds_due d where d.id = :'t2')
             from public.payments where id = :'t2'), 'true/0/1', '3h: … queued in refunds_due');
select is(tests.mg_try(format('select (public.resolve_tip(%L, %L)).id', :'t2', 'refund')), 'error: A refund is already queued for this tip',
  '3i: refund twice is refused');

select tests.mg_job('MG three') as j3 \gset
select tests.mg_tip(:'j3', 999) as t3 \gset
select is(tests.mg_try(format('select (public.resolve_tip(%L, %L)).id', :'t3', 'refund')),
  'error: This tip was charged a different amount; settle it by hand in Stripe', '3j: a tip charged another amount is settled by hand');

-- ---------------------------------------------------------------------------
-- 4. The new money objects are the server's only.
-- ---------------------------------------------------------------------------
select is((select string_agg(c.relname || ':' || has_table_privilege('anon', c.oid, 'SELECT')::text
                             || '/' || has_table_privilege('authenticated', c.oid, 'SELECT')::text
                             || '/' || has_table_privilege('service_role', c.oid, 'SELECT')::text, ' ' order by c.relname)
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname in ('payment_transfers', 'payment_money', 'payment_attention')),
  'payment_attention:false/false/true payment_money:false/false/true payment_transfers:false/false/true',
  '4a: payment_transfers, payment_money and payment_attention: service_role reads, nobody else');
select is((select string_agg(p.proname || ':' || has_function_privilege('anon', p.oid, 'EXECUTE')::text
                             || '/' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                             || '/' || has_function_privilege('service_role', p.oid, 'EXECUTE')::text
                             || '/' || (obj_description(p.oid, 'pg_proc') is not null)::text, ' ' order by p.proname)
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('settlement_send_begin', 'record_settlement_sent', 'record_settlement_result',
              'settlement_send_reopen', 'resolve_tip', 'settlement_attempt_closed', 'payment_record_transfer', 'payment_record_reversal')),
  'payment_record_reversal:false/false/false/true payment_record_transfer:false/false/false/true'
  || ' record_settlement_result:false/false/true/true record_settlement_sent:false/false/true/true'
  || ' resolve_tip:false/false/true/true settlement_attempt_closed:false/false/true/true'
  || ' settlement_send_begin:false/false/true/true settlement_send_reopen:false/false/true/true',
  '4b: the drain''s and the owner''s RPCs run as service_role only; the two writers run inside other functions only; each is described');
select is((select relrowsecurity from pg_class where oid = to_regclass('public.payment_transfers')), true, '4c: payment_transfers has RLS on');
select is((select count(*) from pg_description d where d.objoid = 'public.payments'::regclass and d.description like '%sandbox_release_job_payment%'),
  0::bigint, '4d (B22): no payments comment names sandbox_release_job_payment, a function that no longer exists');

-- ---------------------------------------------------------------------------
-- 5. B17: deleting an account keeps its money records (delete_my_account ends with the auth row;
--    no foreign key reaches jobs or payments from there).
-- ---------------------------------------------------------------------------
select tests.create_user('mg.customer2@brazos.test', 'Cy Customer') as customer2 \gset
select tests.create_user('mg.worker2@brazos.test',   'Wu Worker')   as worker2   \gset
update fx set v = :'customer2' where k = 'customer';
update fx set v = :'worker2' where k = 'worker';
select tests.mg_job('MG deletion') as j4 \gset
select tests.authenticate_as(:'worker2');
select lives_ok($$ select public.delete_my_account() $$, '5a: a worker with a released payment deletes the account');
select tests.clear_auth();
select is((select count(*) from public.payments where job_id = :'j4' and payee_id = :'worker2' and status = 'released'), 1::bigint,
  '5b: the payment row is still there, pointing at the tombstone');

select * from finish();
rollback;
