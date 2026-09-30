-- 210_live_card.sql — idea 9's proofs: 20260930001300_live_card.sql proven on the local stack before
-- the pipeline applies it anywhere. Fourteen assertions in six numbered groups; each says what it
-- proves. The card itself is drawn by the phone (lib/liveCard.ts, fenced offline); Apple's push path
-- is off until the operator places the key.
--
-- THE CAST: a customer (Dana), the hired worker (Sam), a stranger (Olly), and the runner — the
-- connection's own role, RLS bypassed — for the ground truth and the sender's service-role calls.
-- Everything rolls back; no commit.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(17);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('i9.customer@brazos.test', 'Dana Whitfield') as customer \gset
select tests.create_user('i9.sam@brazos.test', 'Sam Okafor') as sam \gset
select tests.create_user('i9.olly@brazos.test', 'Olly Other') as olly \gset

-- A flexible day with a 6–8 PM window (running late is allowed on a job with no day set).
select tests.authenticate_as(:'customer');
select (public.create_job(
  p_title := 'I9 hang a mirror', p_description := 'probe row, rolled back',
  p_category := 'handyman', p_location := 'Park Slope', p_budget_cents := 7000,
  p_arrival_start_hour := 18::smallint, p_arrival_end_hour := 20::smallint
)).id as job \gset
insert into fx values ('job', :'job');
select tests.authenticate_as(:'sam');
select public.create_offer(p_amount_cents := 7000, p_job_id := :'job', p_message := 'i9 bid') as offer \gset
select tests.authenticate_as(:'customer');
select public.accept_offer(:'offer') as accepted \gset

-- ---------------------------------------------------------------------------
-- 1. The clock, as the job pages write it.
-- ---------------------------------------------------------------------------
select tests.clear_auth();
select ok(
  public.clock_label(18 * 60) = '6 PM' and public.clock_label(18 * 60 + 20) = '6:20 PM'
  and public.clock_label(24 * 60 + 20) = '12:20 AM' and public.clock_label(12 * 60) = '12 PM',
  '1: "6 PM" on the hour, "6:20 PM" otherwise, wrapping past midnight'
);

-- ---------------------------------------------------------------------------
-- 2. The card's words follow the worker's taps.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select is(public.live_card_state(:'job'), null::jsonb, '2a: hired, not yet on the way: no card');
select tests.authenticate_as(:'sam');
select (public.mark_worker_arrival(:'job', 'en_route')).id as en_route \gset
select tests.authenticate_as(:'customer');
select is(
  public.live_card_state(:'job'),
  jsonb_build_object('stage', 'on_the_way', 'title', 'Sam is on the way', 'subtitle', 'Arrives 6 PM–8 PM', 'progress', 0.25, 'ended', false),
  '2b: on the way — the window, the rail a quarter full'
);
select tests.authenticate_as(:'sam');
select (public.report_running_late(:'job', 20)).id as late \gset
select tests.authenticate_as(:'customer');
select is(public.live_card_state(:'job') ->> 'subtitle', 'Arrives 6:20 PM–8:20 PM', '2c: running late moves the card''s time too');
select tests.authenticate_as(:'sam');
select (public.mark_worker_arrival(:'job', 'arrived')).id as arrived \gset
select tests.authenticate_as(:'customer');
select ok(
  (select s ->> 'title' = 'Sam has arrived' and (s ->> 'progress')::numeric = 0.5 from (select public.live_card_state(:'job') as s) x),
  '2d: arrived — halfway along the rail'
);

-- ---------------------------------------------------------------------------
-- 3. Only the job's customer reads the card.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'olly');
select is(public.live_card_state(:'job'), null::jsonb, '3a: a stranger reads nothing');
select tests.clear_auth();
select ok(
  not has_function_privilege('anon', 'public.live_card_state(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.live_card_state(uuid)', 'EXECUTE'),
  '3b: never anon'
);

-- ---------------------------------------------------------------------------
-- 4. The card's push token: the job's customer hands it over, nobody else.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select public.register_live_activity(:'job', 'activity-1', 'abcdef0123456789abcdef0123456789') as registered \gset
select tests.clear_auth();
select is(
  (select push_token from public.live_activity_tokens where job_id = :'job' and user_id = :'customer'),
  'abcdef0123456789abcdef0123456789',
  '4a: the customer''s card token is kept'
);
select tests.authenticate_as(:'olly');
select throws_ok(
  $$ select public.register_live_activity((select v from fx where k = 'job'), 'activity-x', 'abcdef0123456789abcdef0123456789') $$,
  'P0001', 'Job not found', '4b: a stranger cannot hand over a token for someone else''s job');
select tests.authenticate_as(:'customer');
select throws_ok(
  $$ select public.register_live_activity((select v from fx where k = 'job'), 'activity-1', 'not a token') $$,
  'P0001', 'Live card token is invalid', '4c: only a token''s shape is kept');

-- ---------------------------------------------------------------------------
-- 5. A stage change with a card waiting: one row for the sender, the job's words and its tokens.
-- ---------------------------------------------------------------------------
select tests.clear_auth();
update public.jobs set status = 'in_progress' where id = :'job';
update public.jobs set late_minutes = null where id = :'job';
select is(
  (select count(*)::int from public.live_card_outbox where job_id = :'job' and status = 'pending'),
  1,
  '5a: the change waits once for the sender, however many follow before it runs'
);
create temp table i9_claimed as select * from public.claim_live_card_batch(50);
select ok(
  (select c.state ->> 'title' = 'Sam started the job' and c.tokens = array['abcdef0123456789abcdef0123456789']
   from i9_claimed c where c.job_id = :'job'),
  '5b: the sender gets the card as it is now, and where to send it'
);

-- ---------------------------------------------------------------------------
-- 6. The sender's calls and the tables are the service role's alone.
-- ---------------------------------------------------------------------------
select ok(
  has_function_privilege('service_role', 'public.claim_live_card_batch(integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.resolve_live_card(uuid, text, text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.drain_live_cards()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.claim_live_card_batch(integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.drain_live_cards()', 'EXECUTE')
  and not has_table_privilege('authenticated', 'public.live_activity_tokens', 'SELECT')
  and not has_table_privilege('authenticated', 'public.live_card_outbox', 'SELECT'),
  '6a: tokens, the outbox and the sender''s calls: service role only'
);
select public.resolve_live_card((select outbox_id from i9_claimed where job_id = :'job'), 'sent', null) as resolved \gset
select is(public.drain_live_cards(), null::bigint, '6b: with nothing waiting, the wake-up calls nothing');

-- ---------------------------------------------------------------------------
-- 7. The group 5 review: a change during a send, a send that never answers, a cancelled job.
-- ---------------------------------------------------------------------------
update public.jobs set late_minutes = 10 where id = :'job';
create temp table i9_first as select * from public.claim_live_card_batch(50);
update public.jobs set late_minutes = 20 where id = :'job';
select is(
  (select count(*)::int from public.live_card_outbox where job_id = :'job' and status = 'pending'),
  2,
  '7a: a change while a send is in flight waits in its own row, so the card never keeps older words'
);
update public.live_card_outbox set attempts = 5 where id = (select outbox_id from i9_first where job_id = :'job');
create temp table i9_second as select * from public.claim_live_card_batch(50);
select ok(
  (select status = 'failed' from public.live_card_outbox where id = (select outbox_id from i9_first where job_id = :'job'))
  and exists (select 1 from i9_second where job_id = :'job'),
  '7b: a send that never answered gives up at five tries, and the job''s next change still goes'
);
update public.jobs set status = 'cancelled' where id = :'job';
select ok(
  (select s ->> 'stage' = 'cancelled' and s ->> 'title' = 'Job cancelled' and (s ->> 'ended')::boolean
     from (select public.live_card_state(:'job') as s) x),
  '7c: a cancelled job''s card ends, saying so'
);

select * from finish();
rollback;
