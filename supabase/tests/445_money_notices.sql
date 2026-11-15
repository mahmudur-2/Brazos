-- 445_money_notices.sql — pack 1, A12: the customer's notice when the worker cancels says what
-- happens to the money, and never says a refund is on its way for money that was never taken.
-- Proves 20261115000500_money_notices.sql (cancel_job).
--
-- THE CAST: a customer, a worker with an enabled payout account, the runner (RLS bypassed;
-- fixtures, and reads the outbox). Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(4);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('mn.customer@brazos.test', 'Mia Customer') as customer \gset
select tests.create_user('mn.worker@brazos.test',   'Max Worker')   as worker   \gset
insert into fx values ('customer', :'customer'), ('worker', :'worker');

-- Hire at $50; nothing paid yet.
create or replace function tests.mn_hire(p_title text) returns uuid language plpgsql as $$
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
    p_title := p_title, p_description := 'Notice probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000, p_address_line := '4 Proof Way'
  )).id into v_job;
  perform tests.authenticate_as(v_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Notice bid');
  perform tests.authenticate_as(v_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  return v_job;
end $$;

-- The worker cancels; returns the customer's notice.
create or replace function tests.mn_worker_cancels(p_job uuid) returns text language plpgsql as $$
begin
  perform tests.authenticate_as((select fx.v from fx where fx.k = 'worker'));
  perform public.cancel_job(p_job, 'worker_cancelled');
  perform tests.clear_auth();
  return (select o.body from public.notification_outbox o where o.dedupe_key = 'job_cancelled:' || p_job::text);
end $$;

select tests.mn_hire('MN no payment') as j1 \gset
select is(tests.mn_worker_cancels(:'j1'),
  'The worker cancelled this job. It was not paid for yet. If a charge still comes through, it is refunded in full.',
  '1a: no payment row: the notice does not promise a refund of money never taken');

select tests.mn_hire('MN unfunded') as j2 \gset
select tests.authenticate_as(:'customer');
select (public.begin_job_payment(:'j2')).id as p2 \gset
select tests.clear_auth();
select is(tests.mn_worker_cancels(:'j2'),
  'The worker cancelled this job. It was not paid for yet. If a charge still comes through, it is refunded in full.',
  '1b: a checkout started and not paid: the same notice');
select is((select status::text || '/' || last_error from public.payments where id = :'p2'), 'voided/job cancelled before funding',
  '1c (control): the unfunded row is voided as before');

select tests.mn_hire('MN held') as j3 \gset
select tests.test_fund_job(:'j3') as p3 \gset
select is(tests.mn_worker_cancels(:'j3'), 'The worker cancelled this job. Your payment is being refunded in full.',
  '2a (control): a held payment: the refund notice as before');

select * from finish();
rollback;
