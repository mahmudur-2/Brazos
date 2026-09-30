-- 140_needed_today.sql — idea 12's proofs: 20260930000600_needed_today.sql proven on the local
-- stack before the pipeline applies it anywhere. Thirteen assertions in seven numbered groups; each
-- says what it proves.
--
-- THE CAST: a customer (posts), two workers with nearby alerts on (one a mile away, one across the
-- river beyond their radius), and the runner — the connection's own role, RLS bypassed — for the
-- catalogue reads and the outbox reads. 040_authz.sql owns jobs' authorization proofs; nothing here
-- re-proves who may read or write a row.
--
-- THE FIXTURE: three accounts by tests.create_user (the _helpers.sql ledger); each worker's
-- notification_prefs row is the one the profile-insert trigger writes (nearby_jobs defaults true,
-- 100_nearby_alerts_default.sql), given a home point and the default 5-mile radius. The customer
-- posts two jobs with coordinates, so each insert into job_locations fires the nearby alert inside
-- create_job's own transaction. Everything rolls back; no commit.
--
-- WHAT THIS FILE CANNOT PROVE, said plainly: that PostgREST resolves the sixteen-name call installed
-- builds send to the one seventeen-parameter overload — 5 proves there is exactly ONE create_job in
-- pg_proc, the condition under which a PGRST203 ambiguity cannot arise, but PostgREST itself is not
-- exercised here; and the push itself — the outbox row is the proof, its drain to send-push is
-- phase74's and unchanged.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(13);

select tests.create_user('i12.customer@brazos.test', 'Carla Customer') as customer \gset
select tests.create_user('i12.near@brazos.test', 'Nate Nearby') as near \gset
select tests.create_user('i12.far@brazos.test', 'Fay Faraway') as far \gset

-- The workers' home points: a mile north of the jobs, and fifteen miles away (beyond 5 miles).
update public.notification_prefs set home_lat = 40.6860, home_lng = -73.9780 where user_id = :'near';
update public.notification_prefs set home_lat = 40.8800, home_lng = -73.9000 where user_id = :'far';

-- ---------------------------------------------------------------------------
-- 1, 2. The column: defaulted to false and NOT NULL.
-- ---------------------------------------------------------------------------
select col_default_is('public', 'jobs', 'needed_today', false, '1: jobs.needed_today defaults to false (DECISIONS 2026-09-30 entry 1)');
select col_not_null('public', 'jobs', 'needed_today', '2: jobs.needed_today is NOT NULL');

-- ---------------------------------------------------------------------------
-- 3. The sixteen-name call installed builds send, WITHOUT p_needed_today: the row it inserts today
--    plus needed_today false — and the nearby alert keeps its usual title.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select (public.create_job(
  p_title := 'I12 some day', p_description := 'probe row, rolled back',
  p_category := 'other', p_location := 'Park Slope',
  p_budget_cents := 5000, p_lat := 40.6720, p_lng := -73.9780,
  p_pricing_mode := 'open_bids'
)).id as usual \gset
select tests.clear_auth();
select is((select needed_today from public.jobs where id = :'usual'), false, '3a: create_job without p_needed_today writes false - the sixteen-name call is unchanged');
select is(
  (select title from public.notification_outbox where recipient_id = :'near' and dedupe_key = 'job_nearby:' || :'usual' || ':' || :'near'),
  'New job near you',
  '3b: an ordinary job''s nearby alert keeps its title'
);

-- ---------------------------------------------------------------------------
-- 4. "Need it today": the flag is written, and the alert the nearby worker gets at once says so.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select (public.create_job(
  p_title := 'I12 today', p_description := 'probe row, rolled back',
  p_category := 'other', p_location := 'Park Slope',
  p_budget_cents := 5000, p_lat := 40.6720, p_lng := -73.9780,
  p_needed_today := true
)).id as today \gset
select tests.clear_auth();
select is((select needed_today from public.jobs where id = :'today'), true, '4a: create_job with p_needed_today true writes true');
select is(
  (select title from public.notification_outbox where recipient_id = :'near' and dedupe_key = 'job_nearby:' || :'today' || ':' || :'near'),
  'Needed today near you',
  '4b: the nearby worker''s alert says the job is needed today'
);
select is(
  (select body from public.notification_outbox where recipient_id = :'near' and dedupe_key = 'job_nearby:' || :'today' || ':' || :'near'),
  'I12 today · Park Slope',
  '4c: its body is the usual title and area'
);

-- ---------------------------------------------------------------------------
-- 5. The selection is unchanged: a worker beyond their radius gets nothing, today or not.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.notification_outbox where recipient_id = :'far' and dedupe_key like 'job_nearby:%'),
  0,
  '5: a worker beyond their own radius is not alerted - urgency widens nothing'
);

-- ---------------------------------------------------------------------------
-- 6. One overload, the new parameter LAST.
-- ---------------------------------------------------------------------------
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_job'), 1, '6a: one create_job - the sixteen-parameter signature is gone');
select ok((select pg_get_function_identity_arguments(p.oid) like '%, p_needed_today boolean' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_job'), '6b: create_job takes p_needed_today last');

-- ---------------------------------------------------------------------------
-- 7. The ACLs (CLAUDE.md section Supabase): create_job to authenticated and not anon; the alert's
--    function to neither — only the job_locations trigger reaches it.
-- ---------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.create_job(text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text, text, boolean)', 'EXECUTE'), '7a: authenticated may execute create_job under its seventeen-parameter signature');
select ok(not has_function_privilege('anon', 'public.create_job(text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text, text, boolean)', 'EXECUTE'), '7b: anon holds no EXECUTE on create_job');
select ok(not has_function_privilege('authenticated', 'public.notify_nearby_for_job(uuid)', 'EXECUTE') and not has_function_privilege('anon', 'public.notify_nearby_for_job(uuid)', 'EXECUTE'), '7c: nobody outside the trigger may call notify_nearby_for_job');

select * from finish();
rollback;
