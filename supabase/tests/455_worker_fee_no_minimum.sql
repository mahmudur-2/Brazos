-- 455_worker_fee_no_minimum.sql — the worker-side $1 minimum fee goes (the owner, 2026-11-15).
-- Proves 20261115000800_worker_fee_no_minimum.sql: one new fee_schedule row in force, with
-- worker_min_fee_cents = 0 and every other number copied from the row before it; quotes take 7.5%
-- and nothing more; a job hired before the row keeps the fee its agreement froze.
--
-- THE CAST: a customer, a worker with an enabled payout account (tests.create_user), the runner (RLS
-- bypassed). Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(13);

select tests.create_user('wf.customer@brazos.test', 'Wren Customer') as customer \gset
select tests.create_user('wf.worker@brazos.test',   'Wade Worker')   as worker   \gset

-- Hire at p_cents; nothing paid. Returns the job.
create or replace function tests.wf_hire(p_customer uuid, p_worker uuid, p_title text, p_cents integer) returns uuid
language plpgsql as $$
declare
  v_job uuid;
  v_offer uuid;
begin
  perform tests.clear_auth();
  update public.rate_counters set hits = 0 where user_id in (p_customer, p_worker);
  perform tests.authenticate_as(p_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'Worker fee probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := p_cents, p_budget_max_cents := p_cents, p_address_line := '5 Proof Way'
  )).id into v_job;
  perform tests.authenticate_as(p_worker);
  v_offer := public.create_offer(p_amount_cents := p_cents, p_job_id := v_job, p_message := 'Worker fee bid');
  perform tests.authenticate_as(p_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  return v_job;
end $$;

-- ---------------------------------------------------------------------------
-- 1. The row: in force, no minimum, every other number the row before it had.
-- ---------------------------------------------------------------------------
select is((select worker_min_fee_cents from public.current_fee()), 0, '1a: the row in force has no worker-side minimum');
select is((select count(*) from public.fee_schedule), 2::bigint, '1b: one row was added to the schedule (the baseline and this one)');
select is(
  (select row(f.customer_bps, f.worker_bps, f.tip_customer_bps, f.tax_bps, f.cancel_fee_bps, f.cancel_fee_min_cents,
              f.cancel_fee_max_cents, f.tip_max_bps, f.tip_max_cents)::text from public.current_fee() f),
  (select row(s.customer_bps, s.worker_bps, s.tip_customer_bps, s.tax_bps, s.cancel_fee_bps, s.cancel_fee_min_cents,
              s.cancel_fee_max_cents, s.tip_max_bps, s.tip_max_cents)::text
     from public.fee_schedule s where s.id <> (select id from public.current_fee()) order by s.effective_from desc limit 1),
  '1c: every other number is the previous row''s, unchanged');
select ok((select s.worker_min_fee_cents = 100 from public.fee_schedule s where s.id <> (select id from public.current_fee())
            order by s.effective_from desc limit 1),
  '1d: the old row is untouched: it still holds its $1 minimum');

-- ---------------------------------------------------------------------------
-- 2. Quotes: 7.5% and nothing more.
-- ---------------------------------------------------------------------------
select is((select worker_fee_cents || ' / ' || worker_receives_cents from public.quote_job_price(1000)), '75 / 925',
  '2a: a $10 job: the worker pays 75 cents and gets $9.25');
select is((select worker_fee_cents || ' / ' || worker_receives_cents from public.quote_job_price(100)), '8 / 92',
  '2b: a $1 job: 8 cents and 92 cents');
select is((select worker_fee_cents || ' / ' || worker_receives_cents from public.quote_job_price(1)), '0 / 1',
  '2c: one cent: no fee, the cent is the worker''s');
select is((select customer_fee_cents || ' / ' || total_cents from public.quote_job_price(1000)), '75 / 1075',
  '2d (control): the customer side is as before');

-- ---------------------------------------------------------------------------
-- 3. A7 (dropped): no amount from one cent up leaves the worker nothing.
-- ---------------------------------------------------------------------------
select is((select count(*) from generate_series(1, 100000) a cross join lateral public.quote_job_price(a) q
            where q.worker_receives_cents < 1), 0::bigint,
  '3a: every amount from 1 cent to $1,000.00 leaves the worker at least one cent');
select ok((select worker_min_fee_cents = 0 and worker_bps < 5000 from public.current_fee())
          and (select worker_receives_cents > 0 from public.quote_job_price(10000000)),
  '3b: and every larger one: with no minimum and a rate under 50%, round(a * rate) < a for every a >= 1 (checked at the $100,000 ceiling too)');

-- ---------------------------------------------------------------------------
-- 4. Hires keep their terms.
--    SURGERY: the "before" hire is made while the new row is not in force yet (its effective_from
--    pushed a day out, then put back), which is what a hire made before the migration saw.
-- ---------------------------------------------------------------------------
-- (Without the row, '0' and now(): nothing is pushed, and 4a-4c say what is missing.)
select coalesce((select id::text from public.fee_schedule where worker_min_fee_cents = 0 order by effective_from desc limit 1), '0') as new_row,
       coalesce((select effective_from::text from public.fee_schedule where worker_min_fee_cents = 0 order by effective_from desc limit 1), now()::text) as new_from \gset
update public.fee_schedule set effective_from = now() + interval '1 day' where id = :'new_row';
select tests.wf_hire(:'customer', :'worker', 'WF hired before', 1000) as jb \gset
update public.fee_schedule set effective_from = :'new_from' where id = :'new_row';
select tests.wf_hire(:'customer', :'worker', 'WF hired after', 1000) as ja \gset
select is((select worker_fee_cents || ' / ' || (fee_schedule_id <> :'new_row')::text from public.job_agreements where job_id = :'jb'),
  '100 / true', '4a: a $10 job hired before the new row keeps its $1 worker fee in its snapshot');
select tests.authenticate_as(:'customer');
select (public.begin_job_payment(:'jb')).id as pb \gset
select tests.clear_auth();
select is((select platform_fee_cents from public.payments where id = :'pb'), 100,
  '4b: and its checkout, begun after the change, is charged those terms');
select is((select worker_fee_cents from public.job_agreements where job_id = :'ja'), 75,
  '4c: a $10 job hired after it: 75 cents');

select * from finish();
rollback;
