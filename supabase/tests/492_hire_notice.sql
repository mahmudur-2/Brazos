-- 492_hire_notice.sql — the hire_notice migration (production-36h S4, step B): when the worker says
-- yes to the customer's offer, the customer gets one 'hire_accepted' notice under the always-on
-- category, even with message and job-update notifications off; never when the customer did the
-- accepting; never beside a repeat visit's series_confirm; never twice.
--
-- THE CAST: customer (Cora, message and job-update notifications OFF), worker (Wes Hall), bidder
-- (Bea, a second worker), series customer (Sue, a weekly series with Wes), and the runner (RLS
-- bypassed: fixtures, ground truth, the series clock).
--
-- FIXTURE SURGERY, DECLARED: Cora's notification_prefs row is upserted to messages = false and
-- job_updates = false (the prefs upsert shape, 110 §8). The series' first visit is posted four days
-- in the past and the series clock runs at today's noon in the market, as 180_job_series.sql does.
-- Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(17);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('hn.customer@brazos.test', 'Cora Customer') as customer \gset
select tests.create_user('hn.worker@brazos.test',   'Wes Hall')      as worker   \gset
select tests.create_user('hn.bidder@brazos.test',   'Bea Bidder')    as bidder   \gset
select tests.create_user('hn.series@brazos.test',   'Sue Series')    as scust    \gset

insert into public.notification_prefs (user_id, messages, job_updates) values (:'customer', false, false)
  on conflict (user_id) do update set messages = excluded.messages, job_updates = excluded.job_updates;   -- SURGERY: Cora switched both off

create or replace function tests.hn_count(p_recipient uuid, p_type text, p_job uuid) returns bigint language sql as $$
  select count(*) from public.notification_outbox o
   where o.recipient_id = p_recipient and o.type = p_type and o.data ->> 'jobId' = p_job::text
$$;

-- A posted job (open market), with one bid from p_worker. Returns the bid's id; the job is its job_id.
create or replace function tests.hn_post_and_bid(p_customer uuid, p_worker uuid, p_title text) returns uuid language plpgsql as $$
declare
  v_job uuid;
  v_offer uuid;
begin
  perform tests.authenticate_as(p_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'Hire notice probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000,
    p_address_line := '4 Proof Way'
  )).id into v_job;
  perform tests.authenticate_as(p_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Hire notice bid');
  perform tests.clear_auth();
  return v_offer;
end $$;

-- ---------------------------------------------------------------------------
-- §0. ACCESS: the trigger function keeps no caller grant (restated).
-- ---------------------------------------------------------------------------
select ok((select prosecdef from pg_proc where oid = 'public.notify_on_job_status()'::regprocedure)
          and not has_function_privilege('anon', 'public.notify_on_job_status()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.notify_on_job_status()', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.notify_on_job_status()', 'EXECUTE'),
  '0: notify_on_job_status is SECURITY DEFINER with no EXECUTE for anon, authenticated or service_role');

-- ---------------------------------------------------------------------------
-- §1. A DIRECT OFFER, accepted by the worker, with Cora's message notifications off.
-- ---------------------------------------------------------------------------
select is(public.should_notify(:'customer', :'worker', 'messages'), false,
  '1: control: with messages off, the thread''s "New message" path cannot reach Cora');
select tests.authenticate_as(:'customer');
select public.create_offer(p_amount_cents := 5000, p_worker_id := :'worker', p_title := 'HN direct fix the gate', p_category := 'other') as o1 \gset
select tests.clear_auth();
select job_id as j1 from public.job_offers where id = :'o1' \gset
select is((select status::text from public.jobs where id = :'j1'), 'draft', '1: runner: the direct offer made a draft job (the fixture is real)');
select tests.authenticate_as(:'worker');
select is(public.accept_offer(:'o1'), :'j1'::uuid, '1: worker: accepts the direct offer');
select tests.clear_auth();
select is((select o.title || ' | ' || o.body || ' | ' || o.category || ' | ' || o.data::text || ' | ' || o.dedupe_key || ' | ' || o.status
             from public.notification_outbox o
            where o.recipient_id = :'customer' and o.type = 'hire_accepted' and o.data ->> 'jobId' = :'j1'::text),
  'Wes accepted your offer | HN direct fix the gate: open the job to protect the payment and see the deadline. | jobs | '
    || jsonb_build_object('jobId', :'j1'::text, 'screen', 'ClientJobDetail')::text
    || ' | hire_accepted:' || :'j1' || ':' || :'worker' || ' | pending',
  '1: Cora is told: the words, the always-on category, the job screen, the key');
select is(tests.hn_count(:'customer', 'hire_accepted', :'j1'), 1::bigint, '1: … exactly once');
select is((select count(*) from public.notification_outbox where recipient_id = :'customer' and type = 'message'), 0::bigint,
  '1: … and the "New message" push stays silent, as she chose');
select is(tests.hn_count(:'worker', 'job_assigned', :'j1'), 1::bigint, '1: the worker''s own "You got the job" notice is unchanged');

-- ---------------------------------------------------------------------------
-- §2. A BID, accepted by the customer: the customer did it, so no notice to her.
-- ---------------------------------------------------------------------------
select tests.hn_post_and_bid(:'customer', :'bidder', 'HN bid accepted by the customer') as o2 \gset
select job_id as j2 from public.job_offers where id = :'o2' \gset
select tests.authenticate_as(:'customer');
select is(public.accept_offer(:'o2'), :'j2'::uuid, '2: customer: accepts the bid');
select tests.clear_auth();
select is(tests.hn_count(:'customer', 'hire_accepted', :'j2'), 0::bigint, '2: no hire_accepted notice when the customer accepted');
select is(tests.hn_count(:'bidder', 'job_assigned', :'j2'), 1::bigint, '2: the worker is told as before');

-- ---------------------------------------------------------------------------
-- §3. THE CUSTOMER'S COUNTER on a bid, accepted by the worker.
-- ---------------------------------------------------------------------------
select tests.hn_post_and_bid(:'customer', :'worker', 'HN counter accepted by the worker') as o3 \gset
select job_id as j3 from public.job_offers where id = :'o3' \gset
select tests.authenticate_as(:'customer');
select public.counter_offer(:'o3', 4500) as o3c \gset
select tests.authenticate_as(:'worker');
select is(public.accept_offer(:'o3c'), :'j3'::uuid, '3: worker: accepts the customer''s counter');
select tests.clear_auth();
select is((select o.title || ' | ' || o.body || ' | ' || o.category
             from public.notification_outbox o
            where o.recipient_id = :'customer' and o.type = 'hire_accepted' and o.data ->> 'jobId' = :'j3'::text),
  'Wes accepted your offer | HN counter accepted by the worker: open the job to protect the payment and see the deadline. | jobs',
  '3: Cora is told once more, for this job, in the same words');

-- ---------------------------------------------------------------------------
-- §4. NEVER TWICE: the job moving on sends no second hire notice.
-- ---------------------------------------------------------------------------
select tests.test_fund_job(:'j1');
select tests.authenticate_as(:'worker');
select public.transition_job_status(:'j1', 'in_progress');
select tests.clear_auth();
select is(tests.hn_count(:'customer', 'hire_accepted', :'j1'), 1::bigint, '4: paid and started, the job still has its one hire notice');

-- ---------------------------------------------------------------------------
-- §5. A REPEAT VISIT's first refusal, taken: series_confirm, and no second notice beside it.
-- ---------------------------------------------------------------------------
select (((now() at time zone 'America/New_York')::date + time '12:00') at time zone 'America/New_York') as noon \gset
select ((now() at time zone 'America/New_York')::date - 4) as anchor \gset
select tests.authenticate_as(:'scust');
select (public.create_job(
  p_title := 'HN series clean the flat', p_description := 'Hire notice probe row, rolled back', p_category := 'cleaning',
  p_location := 'Park Slope', p_budget_cents := 8000, p_lat := 40.6720, p_lng := -73.9780,
  p_scheduled_date := (:'anchor'::date + 5), p_arrival_start_hour := 10::smallint, p_arrival_end_hour := 12::smallint,
  p_address_line := '12 Garfield Pl, Brooklyn'
)).id as js \gset
select (public.start_job_series(:'js', 'weekly')).id as series \gset
select tests.authenticate_as(:'worker');
select public.create_offer(p_amount_cents := 8000, p_job_id := :'js', p_message := 'HN series bid') as os \gset
select tests.authenticate_as(:'scust');
select public.accept_offer(:'os');
select tests.clear_auth();
-- post_window: no post for a day gone by, so the first visit was posted for tomorrow; it moves back
-- to the anchor day here (SURGERY), and the series with it (series_on_visit_change).
update public.jobs set scheduled_date = :'anchor'::date where id = :'js';
select public.advance_job_series(:'noon'::timestamptz);
select pending_job_id as jv from public.job_series where id = :'series' \gset
select id as ov from public.job_offers where job_id = :'jv' \gset
select ok((select j.status = 'draft' and j.series_id = :'series'::uuid and o.author_id = :'scust'::uuid
             from public.jobs j join public.job_offers o on o.job_id = j.id where j.id = :'jv' and o.id = :'ov'),
  '5: runner: the next visit is the series'' draft, offered by Sue to Wes (the fixture is real)');
select tests.authenticate_as(:'worker');
select public.accept_offer(:'ov');
select tests.clear_auth();
select is(tests.hn_count(:'scust', 'series_confirm', :'jv'), 1::bigint, '5: Sue gets the series'' Confirm notice, as before');
select is(tests.hn_count(:'scust', 'hire_accepted', :'jv'), 0::bigint, '5: … and no hire notice beside it');

select * from finish();
rollback;
