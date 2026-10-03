-- 170_tomorrow_reminders.sql — idea 6's proofs: 20260930000900_tomorrow_reminders.sql proven on the
-- local stack before the pipeline applies it anywhere. Twelve assertions in six numbered groups;
-- each says what it proves.
--
-- THE CAST: a customer (posts and accepts), a worker (hired), and the runner — the connection's own
-- role, RLS bypassed — who runs the reminders as the schedule would and reads the outbox.
--
-- THE FIXTURE, through the real RPCs: three jobs, all at a 9–11 AM window in Park Slope. JOB A is
-- hired for the market's tomorrow; JOB B is hired for the day after; JOB C is for tomorrow but still
-- open (no one hired). "Tomorrow" is the market's own (America/New_York), computed here the way the
-- function computes it. Everything rolls back; no commit.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(19);

select tests.create_user('i6.customer@brazos.test', 'Dana Customer') as customer \gset
select tests.create_user('i6.worker@brazos.test', 'Sam Worker') as worker \gset
select ((now() at time zone 'America/New_York')::date) as market_today \gset
select ((now() at time zone 'America/New_York')::date + 1) as tomorrow \gset
select ((now() at time zone 'America/New_York')::date + 2) as after_tomorrow \gset

select tests.authenticate_as(:'customer');
select (public.create_job(
  p_title := 'I6 hang a mirror', p_description := 'probe row, rolled back',
  p_category := 'other', p_location := 'Park Slope', p_budget_cents := 7000,
  p_scheduled_date := :'tomorrow'::date, p_arrival_start_hour := 9::smallint, p_arrival_end_hour := 11::smallint
)).id as job_a \gset
select (public.create_job(
  p_title := 'I6 later job', p_description := 'probe row, rolled back',
  p_category := 'other', p_location := 'Park Slope', p_budget_cents := 6000,
  p_scheduled_date := :'after_tomorrow'::date, p_arrival_start_hour := 9::smallint, p_arrival_end_hour := 11::smallint
)).id as job_b \gset
select (public.create_job(
  p_title := 'I6 open job', p_description := 'probe row, rolled back',
  p_category := 'other', p_location := 'Park Slope', p_budget_cents := 5000,
  p_scheduled_date := :'tomorrow'::date, p_arrival_start_hour := 9::smallint, p_arrival_end_hour := 11::smallint
)).id as job_c \gset
-- A13 (2026-10-03): a fourth job, hired for tomorrow and NOT paid — the reminder's other shape.
select (public.create_job(
  p_title := 'I6 unpaid job', p_description := 'probe row, rolled back',
  p_category := 'other', p_location := 'Park Slope', p_budget_cents := 4000,
  p_scheduled_date := :'tomorrow'::date, p_arrival_start_hour := 9::smallint, p_arrival_end_hour := 11::smallint
)).id as job_d \gset
select tests.authenticate_as(:'worker');
select public.create_offer(p_amount_cents := 7000, p_job_id := :'job_a', p_message := 'i6 bid') as offer_a \gset
select public.create_offer(p_amount_cents := 6000, p_job_id := :'job_b', p_message := 'i6 bid b') as offer_b \gset
select public.create_offer(p_amount_cents := 4000, p_job_id := :'job_d', p_message := 'i6 bid d') as offer_d \gset
select tests.authenticate_as(:'customer');
select public.accept_offer(:'offer_a') as accepted_a \gset
select public.accept_offer(:'offer_b') as accepted_b \gset
select public.accept_offer(:'offer_d') as accepted_d \gset
select tests.clear_auth();
-- A13: job_a and job_b are PAID — a held job_payment row each, by the runner (030_payments.sql
-- proves the writers; the proof here is about the gate). job_d stays unpaid.
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, provider, status)
values (:'job_a', :'customer', :'worker', 7000, 700, 'stripe', 'held'),
       (:'job_b', :'customer', :'worker', 6000, 600, 'stripe', 'held');

-- ---------------------------------------------------------------------------
-- 1. The evening before: one hired job reminded, as the schedule would run it.
-- ---------------------------------------------------------------------------
-- The seed may hold hired jobs of its own for tomorrow, so the proofs count THIS fixture's rows.
select public.enqueue_tomorrow_reminders() as reminded \gset
select is(
  (select count(*)::int from public.notification_outbox where type = 'job_reminder' and data->>'jobId' = :'job_a'),
  2,
  '1: the job hired for the market''s tomorrow is reminded - one row for each of its two people'
);

-- ---------------------------------------------------------------------------
-- 2. The customer's reminder: who is coming, where, and the Message action.
-- ---------------------------------------------------------------------------
select is(
  (select title from public.notification_outbox where recipient_id = :'customer' and type = 'job_reminder' and data->>'jobId' = :'job_a'),
  'Tomorrow 9 AM–11 AM · I6 hang a mirror',
  '2a: the customer''s title says tomorrow, the window and the job'
);
select is(
  (select body from public.notification_outbox where recipient_id = :'customer' and type = 'job_reminder' and data->>'jobId' = :'job_a'),
  'Sam Worker · Park Slope',
  '2b: its body names the worker and the area'
);
select is(
  (select data->>'categoryId' from public.notification_outbox where recipient_id = :'customer' and type = 'job_reminder' and data->>'jobId' = :'job_a'),
  'job_reminder_customer',
  '2c: its actions are the customer''s (Message)'
);

-- ---------------------------------------------------------------------------
-- 3. The worker's reminder: for whom, where, and Message and Route.
-- ---------------------------------------------------------------------------
select is(
  (select body from public.notification_outbox where recipient_id = :'worker' and type = 'job_reminder' and data->>'jobId' = :'job_a'),
  'Dana Customer · Park Slope',
  '3a: the worker''s body names the customer and the area'
);
select is(
  (select data->>'categoryId' from public.notification_outbox where recipient_id = :'worker' and type = 'job_reminder' and data->>'jobId' = :'job_a'),
  'job_reminder_worker',
  '3b: its actions are the worker''s (Message, Route)'
);
select is(
  (select data->>'screen' from public.notification_outbox where recipient_id = :'worker' and type = 'job_reminder' and data->>'jobId' = :'job_a'),
  'WorkerJob',
  '3c: a tap opens the worker''s job'
);

-- ---------------------------------------------------------------------------
-- 4. Nothing for a later day, nothing for a job no one was hired for, nothing twice.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.notification_outbox where type = 'job_reminder' and (data->>'jobId') in (:'job_b', :'job_c')),
  0,
  '4a: the day-after job and the unhired job get no reminder tonight'
);
select ok(public.enqueue_tomorrow_reminders() >= 1, '4b: a second run the same evening finds the same job again');
select is(
  (select count(*)::int from public.notification_outbox where type = 'job_reminder' and data->>'jobId' = :'job_a'),
  2,
  '4c: and sends nothing new - one per person per day'
);

-- ---------------------------------------------------------------------------
-- 5. Tomorrow evening's run reminds the later job.
-- ---------------------------------------------------------------------------
select public.enqueue_tomorrow_reminders(:'tomorrow'::date) as next_evening \gset
select is(
  (select count(*)::int from public.notification_outbox where type = 'job_reminder' and data->>'jobId' = :'job_b'),
  2,
  '5: the next evening''s run reminds the day-after job'
);

-- ---------------------------------------------------------------------------
-- 7. A13: unpaid, the customer is reminded to protect the payment and the worker is not reminded
--    of a job they cannot start; the same dedupe key keeps it to one per day.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.notification_outbox where type = 'job_reminder' and data->>'jobId' = :'job_d'),
  1,
  '7a: the unpaid job gets ONE reminder, not two'
);
select is(
  (select recipient_id from public.notification_outbox where type = 'job_reminder' and data->>'jobId' = :'job_d'),
  :'customer'::uuid,
  '7b: and it goes to the customer — the worker is not reminded of a job they cannot start'
);
select is(
  (select title from public.notification_outbox where recipient_id = :'customer' and type = 'job_reminder' and data->>'jobId' = :'job_d'),
  'Tomorrow 9 AM–11 AM · Protect the payment',
  '7c: its title says tomorrow, the window and the one thing it waits on'
);
select is(
  (select body from public.notification_outbox where recipient_id = :'customer' and type = 'job_reminder' and data->>'jobId' = :'job_d'),
  'Sam Worker can start I6 unpaid job once the payment is protected.',
  '7d: its body names the worker, the job and the condition'
);
select is(
  (select data - 'jobId' from public.notification_outbox where recipient_id = :'customer' and type = 'job_reminder' and data->>'jobId' = :'job_d'),
  '{"screen": "ClientJobDetail", "intent": "checkout", "categoryId": "job_reminder_customer"}'::jsonb,
  '7e: a tap opens the job into Checkout, with the customer''s actions'
);
select ok(public.enqueue_tomorrow_reminders() >= 1, '7f: a second run the same evening');
select is(
  (select count(*)::int from public.notification_outbox where type = 'job_reminder' and data->>'jobId' = :'job_d'),
  1,
  '7g: sends nothing new for the unpaid job either - one per person per day'
);

-- ---------------------------------------------------------------------------
-- 6. The ACLs, and the schedule's installer on a stack without pg_cron.
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.enqueue_tomorrow_reminders(date)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.enqueue_tomorrow_reminders(date)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.install_reminder_schedule()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.install_reminder_schedule()', 'EXECUTE')
  and public.install_reminder_schedule() in ('skipped: pg_cron absent', 'scheduled: brazos-tomorrow-reminders'),
  '6: the reminders are the schedule''s alone, the installer the service role''s, and it installs or skips cleanly'
);

select * from finish();
rollback;
