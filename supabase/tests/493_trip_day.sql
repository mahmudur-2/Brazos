-- 493_trip_day.sql — the trip_day migration (production-36h S4, step C1, verdict C08): "On my way",
-- "I'm here" and the start wait for the job's own New York day; the trip steps also need the
-- start's money rule, one function for all three (a held payment whose money is clear; the money is
-- named first, then the day). Undated jobs need only the money. A step already marked, and work
-- already started, are never taken back.
--
-- THE CAST: customer (Cleo), worker (Wade), and the runner (RLS bypassed: fixtures, ground truth).
-- "Today" is the New York date of the transaction's own clock, computed here.
--
-- FIXTURE SURGERY, DECLARED: a job "in the past" is posted for today, hired and paid, then the
-- runner moves its day back one; one job gets an "On my way" time written by the runner before the
-- rule existed; one started job has its day moved forward by the runner; two held payments get a
-- card dispute time (K, and M after the runner writes its "On my way" time). Rate counters are
-- reset between posts (445's way). Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(50);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('td.customer@brazos.test', 'Cleo Customer') as customer \gset
select tests.create_user('td.worker@brazos.test',   'Wade Worker')   as worker   \gset
insert into fx values ('customer', :'customer'), ('worker', :'worker');

select ((now() at time zone 'America/New_York')::date) as today \gset
select ((now() at time zone 'America/New_York')::date + 1) as tomorrow \gset

-- The day sentence, built here another way (btrim, not FM), so the function's format is checked.
create or replace function tests.td_day_msg(p_day date) returns text language sql immutable as $$
  select 'This job is booked for ' || btrim(to_char(p_day, 'Day')) || ', ' || btrim(to_char(p_day, 'Month'))
         || ' ' || extract(day from p_day)::int::text || '; the trip and the start open on that day.'
$$;

-- Posted (on p_day, or undated), bid by Wade, hired by Cleo: through the real RPCs.
create or replace function tests.td_hire(p_key text, p_day date) returns uuid language plpgsql as $$
declare
  v_customer uuid := (select fx.v from fx where fx.k = 'customer');
  v_worker   uuid := (select fx.v from fx where fx.k = 'worker');
  v_job uuid;
  v_offer uuid;
begin
  perform tests.clear_auth();
  update public.rate_counters set hits = 0 where user_id in (v_customer, v_worker);   -- SURGERY: rate counters
  perform tests.authenticate_as(v_customer);
  select (public.create_job(
    p_title := 'TD ' || p_key, p_description := 'Trip day probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000,
    p_scheduled_date := p_day, p_address_line := '4 Proof Way'
  )).id into v_job;
  perform tests.authenticate_as(v_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Trip day bid');
  perform tests.authenticate_as(v_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  insert into fx values (p_key, v_job);
  return v_job;
end $$;

select tests.td_hire('A', null)          as ja \gset
select tests.td_hire('B', null)          as jb \gset
select tests.td_hire('C', :'tomorrow')   as jc \gset
select tests.td_hire('E', :'tomorrow')   as je \gset
select tests.td_hire('F', :'today')      as jf \gset
select tests.td_hire('G', :'today')      as jg \gset
select tests.td_hire('H', :'today')      as jh \gset
select tests.td_hire('I', :'tomorrow')   as ji \gset
select tests.td_hire('K', :'today')      as jk \gset
select tests.td_hire('M', :'today')      as jm \gset
select tests.test_fund_job(:'jb');
select tests.test_fund_job(:'jc');
select tests.test_fund_job(:'jg');
select tests.test_fund_job(:'jh');
select tests.test_fund_job(:'ji');
select tests.test_fund_job(:'jk');
select tests.test_fund_job(:'jm');
update public.jobs set scheduled_date = :'today'::date - 1 where id = :'jh';                 -- SURGERY: H's day was yesterday
update public.jobs set en_route_at = now() - interval '1 hour' where id = :'ji';             -- SURGERY: I was marked "On my way" before trip_day
update public.payments set chargeback_at = now() where job_id = :'jk' and kind = 'job_payment';   -- SURGERY: K's held money is under a card dispute
update public.jobs set en_route_at = now() - interval '1 hour' where id = :'jm';             -- SURGERY: M was on its way, then its money went on hold
update public.payments set chargeback_at = now() where job_id = :'jm' and kind = 'job_payment';   -- SURGERY

-- ---------------------------------------------------------------------------
-- §0. ACCESS: grants and settings unchanged; the helper has no caller.
-- ---------------------------------------------------------------------------
select ok((select prosecdef from pg_proc where oid = 'public.mark_worker_arrival(uuid,text)'::regprocedure)
          and has_function_privilege('authenticated', 'public.mark_worker_arrival(uuid,text)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.mark_worker_arrival(uuid,text)', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.mark_worker_arrival(uuid,text)', 'EXECUTE'),
  '0: mark_worker_arrival stays SECURITY DEFINER, authenticated only');
select ok((select prosecdef from pg_proc where oid = 'public.transition_job_status(uuid,text,jsonb,jsonb)'::regprocedure)
          and has_function_privilege('authenticated', 'public.transition_job_status(uuid,text,jsonb,jsonb)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.transition_job_status(uuid,text,jsonb,jsonb)', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.transition_job_status(uuid,text,jsonb,jsonb)', 'EXECUTE'),
  '0: transition_job_status stays SECURITY DEFINER, authenticated only');
select ok(not (select prosecdef from pg_proc where oid = 'public.job_day_reached(date,timestamptz)'::regprocedure)
          and not has_function_privilege('anon', 'public.job_day_reached(date,timestamptz)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.job_day_reached(date,timestamptz)', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.job_day_reached(date,timestamptz)', 'EXECUTE'),
  '0: job_day_reached is an invoker helper no caller role can execute');
select ok(obj_description('public.mark_worker_arrival(uuid,text)'::regprocedure, 'pg_proc')
            like 'The assigned worker declares en_route or arrived on an assigned job. Monotonic + idempotent: timestamps are set once, never cleared; arrived backfills en_route. No live location exists anywhere. trip_day:%',
  '0: the mark_worker_arrival comment is the live one, with the trip_day sentence added');

-- ---------------------------------------------------------------------------
-- §1. THE DAY, at the 2026 clock changes in New York (instants written here, in UTC).
-- ---------------------------------------------------------------------------
select ok(public.job_day_reached(null, now()), '1: an undated job: the day has always come');
select is(tests.td_day_msg('2026-12-01'),
  'This job is booked for Tuesday, December 1; the trip and the start open on that day.',
  '1: control: the sentence this file expects is the accepted sentence, word for word');
select ok(not public.job_day_reached('2026-03-08', '2026-03-08 04:59:59+00'), '1: Mar 8: 23:59:59 EST on Mar 7 is not the day');
select ok(public.job_day_reached('2026-03-08', '2026-03-08 05:00:00+00'), '1: Mar 8: midnight EST is the day');
select ok(public.job_day_reached('2026-03-08', '2026-03-08 07:00:00+00'), '1: Mar 8: 03:00 EDT, right after the missing 02:00 hour, is still the day');
select ok(not public.job_day_reached('2026-03-09', '2026-03-09 03:59:59+00'), '1: Mar 9: 23:59:59 EDT on Mar 8 is not the day');
select ok(public.job_day_reached('2026-03-09', '2026-03-09 04:00:00+00'), '1: Mar 9: midnight EDT (four hours behind UTC now) is the day');
select ok((('2026-03-09 04:00:00+00'::timestamptz at time zone 'UTC') - interval '5 hours')::date < '2026-03-09'::date,
  '1: control: a fixed five-hour offset would still say Mar 8 at that instant');
select ok(not public.job_day_reached('2026-11-01', '2026-11-01 03:59:59+00'), '1: Nov 1: 23:59:59 EDT on Oct 31 is not the day');
select ok(public.job_day_reached('2026-11-01', '2026-11-01 04:00:00+00'), '1: Nov 1: midnight EDT is the day');
select ok(public.job_day_reached('2026-11-01', '2026-11-01 05:30:00+00') and public.job_day_reached('2026-11-01', '2026-11-01 06:30:00+00')
          and not public.job_day_reached('2026-11-02', '2026-11-01 05:30:00+00') and not public.job_day_reached('2026-11-02', '2026-11-01 06:30:00+00'),
  '1: Nov 1: both 01:30s (EDT, then EST) are Nov 1, not Nov 2');
select ok(not public.job_day_reached('2026-11-02', '2026-11-02 04:59:59+00'), '1: Nov 2: 23:59:59 EST on Nov 1 is not the day');
select ok(public.job_day_reached('2026-11-02', '2026-11-02 05:00:00+00'), '1: Nov 2: midnight EST (five hours behind UTC again) is the day');

-- ---------------------------------------------------------------------------
-- §2. THE TRIP STEPS (mark_worker_arrival), as Wade.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'worker');
select throws_ok($$ select public.mark_worker_arrival((select v from fx where k = 'A'), 'en_route') $$, 'P0001',
  'The customer hasn''t protected the payment yet. You''ll get a notification the moment it''s held.',
  '2: undated, not paid: "On my way" waits for the payment, in the start''s own words');
select throws_ok($$ select public.mark_worker_arrival((select v from fx where k = 'C'), 'en_route') $$, 'P0001',
  tests.td_day_msg(:'tomorrow'::date), '2: paid, booked for tomorrow: "On my way" waits for the day');
select throws_ok($$ select public.mark_worker_arrival((select v from fx where k = 'C'), 'arrived') $$, 'P0001',
  tests.td_day_msg(:'tomorrow'::date), '2: paid, booked for tomorrow: "I''m here" waits for the day');
select throws_ok($$ select public.mark_worker_arrival((select v from fx where k = 'E'), 'en_route') $$, 'P0001',
  'The customer hasn''t protected the payment yet. You''ll get a notification the moment it''s held.',
  '2: not paid, booked for tomorrow: the payment is named first, as at the start');
select throws_ok($$ select public.mark_worker_arrival((select v from fx where k = 'F'), 'arrived') $$, 'P0001',
  'The customer hasn''t protected the payment yet. You''ll get a notification the moment it''s held.',
  '2: not paid, booked for today: the payment sentence');
select throws_ok($$ select public.mark_worker_arrival((select v from fx where k = 'E'), null) $$, 'P0001',
  'Unknown arrival step', '2: a null step is refused before anything (A7-02: null passed "not in" and skipped both checks)');
select lives_ok($$ select public.mark_worker_arrival((select v from fx where k = 'B'), 'en_route') $$, '2: undated and paid: "On my way" works');
select lives_ok($$ select public.mark_worker_arrival((select v from fx where k = 'G'), 'arrived') $$, '2: paid, booked for today: "I''m here" works');
select lives_ok($$ select public.mark_worker_arrival((select v from fx where k = 'H'), 'arrived') $$, '2: paid, booked for yesterday: "I''m here" works');
select is((public.mark_worker_arrival(:'ji', 'en_route')).en_route_at, (select en_route_at from public.jobs where id = :'ji'),
  '2: a step already marked (before trip_day) is answered with the row, as before');
select throws_ok($$ select public.mark_worker_arrival((select v from fx where k = 'I'), 'arrived') $$, 'P0001',
  tests.td_day_msg(:'tomorrow'::date), '2: … but a NEW step on that job still waits for the day');
select throws_ok($$ select public.mark_worker_arrival((select v from fx where k = 'K'), 'en_route') $$, 'P0001',
  'This job''s payment is on hold, so the work can''t start yet.',
  '2: held but under a card dispute, booked for today: "On my way" is refused in the start''s own words');
select throws_ok($$ select public.mark_worker_arrival((select v from fx where k = 'K'), 'arrived') $$, 'P0001',
  'This job''s payment is on hold, so the work can''t start yet.',
  '2: … and so is "I''m here"');
select is((public.mark_worker_arrival(:'jm', 'en_route')).en_route_at, (select en_route_at from public.jobs where id = :'jm'),
  '2: a retry of "On my way" already marked writes no new time and succeeds, though the money went on hold since');
select throws_ok($$ select public.mark_worker_arrival((select v from fx where k = 'M'), 'arrived') $$, 'P0001',
  'This job''s payment is on hold, so the work can''t start yet.',
  '2: … but a NEW step on it ("I''m here") is refused');
select tests.clear_auth();
select ok((select en_route_at is null and arrived_at is null from public.jobs where id = :'ja')
          and (select en_route_at is null and arrived_at is null from public.jobs where id = :'jc')
          and (select en_route_at is null and arrived_at is null from public.jobs where id = :'je')
          and (select en_route_at is null and arrived_at is null from public.jobs where id = :'jf'),
  '2: runner: every refused step wrote nothing');
select ok((select en_route_at is not null and arrived_at is null from public.jobs where id = :'jb'),
  '2: runner: B is on its way, not yet there');
select ok((select en_route_at is not null and arrived_at is not null from public.jobs where id = :'jg')
          and (select en_route_at is not null and arrived_at is not null from public.jobs where id = :'jh'),
  '2: runner: G and H are there ("I''m here" also wrote "On my way", as before)');
select ok((select en_route_at = now() - interval '1 hour' and arrived_at is null from public.jobs where id = :'ji'),
  '2: runner: I keeps the time it already had, and no arrival');
select ok((select en_route_at is null and arrived_at is null from public.jobs where id = :'jk')
          and (select en_route_at = now() - interval '1 hour' and arrived_at is null from public.jobs where id = :'jm'),
  '2: runner: K wrote nothing; M keeps its time and has no arrival');

-- ---------------------------------------------------------------------------
-- §3. THE START (transition_job_status), as Wade.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'worker');
select throws_ok($$ select public.transition_job_status((select v from fx where k = 'C'), 'in_progress') $$, 'P0001',
  tests.td_day_msg(:'tomorrow'::date), '3: paid, booked for tomorrow: the start waits for the day');
select throws_ok($$ select public.transition_job_status((select v from fx where k = 'E'), 'in_progress') $$, 'P0001',
  'The customer hasn''t protected the payment yet. You''ll get a notification the moment it''s held.',
  '3: not paid, booked for tomorrow: the held gate speaks first, unchanged');
select throws_ok($$ select public.transition_job_status((select v from fx where k = 'F'), 'in_progress') $$, 'P0001',
  'The customer hasn''t protected the payment yet. You''ll get a notification the moment it''s held.',
  '3: not paid, booked for today: the held gate, unchanged');
select throws_ok($$ select public.transition_job_status((select v from fx where k = 'K'), 'in_progress') $$, 'P0001',
  'This job''s payment is on hold, so the work can''t start yet.',
  '3: held but under a card dispute: the start''s clear-money check, unchanged');
select is((public.transition_job_status(:'jg', 'in_progress')).status::text, 'in_progress', '3: paid, booked for today: the work starts');
select is((public.transition_job_status(:'jb', 'in_progress')).status::text, 'in_progress', '3: undated and paid: the work starts');
select is((public.transition_job_status(:'jh', 'in_progress')).status::text, 'in_progress', '3: paid, booked for yesterday: the work starts');
select tests.clear_auth();
select is((select status::text from public.jobs where id = :'jc'), 'assigned', '3: runner: C is still assigned, nothing started');
update public.jobs set scheduled_date = :'tomorrow'::date where id = :'jg';                  -- SURGERY: G, already started, now reads tomorrow
select tests.authenticate_as(:'worker');
select is((public.transition_job_status(:'jg', 'in_progress')).status::text, 'in_progress',
  '3: work already started is never taken back: the retry answers with the row');
select is((public.transition_job_status(:'jg', 'completed', '["completion/td-g.jpg"]'::jsonb)).status::text, 'completed',
  '3: … and it can be completed: only assigned -> in_progress waits for the day');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- §4. ONE DEFINITION: both RPCs read the day from job_day_reached.
-- ---------------------------------------------------------------------------
select ok((select prosrc like '%public.job_day_reached(v_job.scheduled_date, now())%' from pg_proc where oid = 'public.mark_worker_arrival(uuid,text)'::regprocedure)
          and (select prosrc like '%public.job_day_reached(v_job.scheduled_date, now())%' from pg_proc where oid = 'public.transition_job_status(uuid,text,jsonb,jsonb)'::regprocedure),
  '4: mark_worker_arrival and transition_job_status both read the day from job_day_reached');
select ok((select prosrc like '%perform public.require_work_money(p_job_id);%' and prosrc !~* 'payment_money_clear|protected the payment|on hold|payments'
             from pg_proc where oid = 'public.mark_worker_arrival(uuid,text)'::regprocedure)
          and (select prosrc like '%perform public.require_work_money(p_job_id);%' and prosrc !~* 'payment_money_clear|protected the payment|on hold'
             from pg_proc where oid = 'public.transition_job_status(uuid,text,jsonb,jsonb)'::regprocedure),
  '4: ONE money rule: both RPCs call require_work_money, and neither restates its checks or its sentences');
select ok(not (select prosecdef from pg_proc where oid = 'public.require_work_money(uuid)'::regprocedure)
          and not has_function_privilege('anon', 'public.require_work_money(uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.require_work_money(uuid)', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.require_work_money(uuid)', 'EXECUTE'),
  '4: require_work_money is an invoker helper no caller role can execute');

select * from finish();
rollback;
