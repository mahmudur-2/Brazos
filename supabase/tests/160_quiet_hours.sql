-- 160_quiet_hours.sql — idea 7's proofs: 20260930000800_quiet_hours.sql proven on the local stack
-- before the pipeline applies it anywhere. Eighteen assertions in eight numbered groups; each says
-- what it proves.
--
-- THE CAST: a worker (nearby alerts on, a home point), a customer (posts), and the runner — the
-- connection's own role, RLS bypassed — for the preference writes, the catalogue reads, and the
-- drain's claim (claim_notification_batch runs as the send-push function's service role).
--
-- THE CLOCK: the proofs must hold whatever hour the suite runs at, so the zones are built from the
-- current UTC hour: NIGHT is the fixed-offset zone (Etc/GMT±n) whose local time is now 2 am —
-- inside midnight to 6 am — and DAY the one whose local time is now 2 pm. (Etc names invert the
-- sign: Etc/GMT-5 is UTC+5.) Everything rolls back; no commit.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(18);

select tests.create_user('i7.worker@brazos.test', 'Quinn Quiet') as worker \gset
select tests.create_user('i7.customer@brazos.test', 'Cora Customer') as customer \gset
select tests.create_user('i7.blocked@brazos.test', 'Bram Blocked') as blocked_customer \gset
update public.notification_prefs set home_lat = 40.6860, home_lng = -73.9780 where user_id = :'worker';

select 'Etc/GMT' || case when k > 0 then '-' || k::text when k < 0 then '+' || (-k)::text else '' end as night_tz
from (
  select case when 2 - h >= -12 then 2 - h else 26 - h end as k
  from (select extract(hour from now() at time zone 'UTC')::int as h) utc
) z \gset
select 'Etc/GMT' || case when k > 0 then '-' || k::text when k < 0 then '+' || (-k)::text else '' end as day_tz
from (
  select 14 - h as k
  from (select extract(hour from now() at time zone 'UTC')::int as h) utc
) z \gset

-- ---------------------------------------------------------------------------
-- 1, 2. The switch is OFF until turned on; a queued row waits for nothing by default.
-- ---------------------------------------------------------------------------
select col_default_is('public', 'notification_prefs', 'quiet_hours', false, '1a: quiet_hours defaults to false - off until turned on (DECISIONS 2026-09-30 entry 3)');
select is((select quiet_hours from public.notification_prefs where user_id = :'worker'), false, '1b: a fresh account''s prefs row is created with quiet hours off');
select col_is_null('public', 'notification_outbox', 'send_after', '2: send_after is nullable - null means now, as every earlier row reads');

-- ---------------------------------------------------------------------------
-- 3. quiet_hours_until: the next local 6 am inside the window; null outside it, when off, and for
--    a zone the server does not know.
-- ---------------------------------------------------------------------------
update public.notification_prefs set quiet_hours = true, quiet_tz = :'night_tz' where user_id = :'worker';
select ok(
  public.quiet_hours_until(:'worker') > now() and public.quiet_hours_until(:'worker') <= now() + interval '4 hours',
  '3a: at 2 am local the alert waits until 6 am local - between now and four hours ahead'
);
select is(
  extract(hour from public.quiet_hours_until(:'worker') at time zone :'night_tz')::int,
  6,
  '3b: and that instant is 6 am on the recipient''s own clock'
);
update public.notification_prefs set quiet_tz = :'day_tz' where user_id = :'worker';
select is(public.quiet_hours_until(:'worker'), null::timestamptz, '3c: at 2 pm local nothing waits');
update public.notification_prefs set quiet_hours = false, quiet_tz = :'night_tz' where user_id = :'worker';
select is(public.quiet_hours_until(:'worker'), null::timestamptz, '3d: switched off, nothing waits even at night');
update public.notification_prefs set quiet_hours = true, quiet_tz = 'Nowhere/Nothing' where user_id = :'worker';
select is(public.quiet_hours_until(:'worker'), null::timestamptz, '3e: a zone the server does not know never holds an alert back');
select throws_ok(
  $$ update public.notification_prefs set quiet_tz = 'not a zone; drop table' where user_id = (select id from public.profiles where full_name = 'Quinn Quiet') $$,
  '23514', null, '3f: the shape CHECK refuses a value that is not zone-shaped');

-- ---------------------------------------------------------------------------
-- 4. The enqueue: a nearby alert inside quiet hours waits; the worker's other categories never do.
-- ---------------------------------------------------------------------------
update public.notification_prefs set quiet_hours = true, quiet_tz = :'night_tz' where user_id = :'worker';
select tests.authenticate_as(:'customer');
select (public.create_job(
  p_title := 'I7 quiet job', p_description := 'probe row, rolled back',
  p_category := 'other', p_location := 'Park Slope',
  p_budget_cents := 5000, p_lat := 40.6720, p_lng := -73.9780
)).id as quiet_job \gset
select tests.clear_auth();
select ok(
  (select send_after > now() from public.notification_outbox where dedupe_key = 'job_nearby:' || :'quiet_job' || ':' || :'worker'),
  '4a: the nearby alert enqueued at 2 am local waits for the morning'
);
select public.enqueue_notification(:'worker', :'customer', 'messages', 'message', 'I7 message', 'probe', '{}'::jsonb, 'i7:message:' || :'worker') as q_message \gset
select is(
  (select send_after from public.notification_outbox where dedupe_key = 'i7:message:' || :'worker'),
  null::timestamptz,
  '4b: a message to the same person at the same hour is never delayed'
);
select public.enqueue_notification(:'worker', null, 'jobs', 'job_completed', 'I7 money', 'probe', '{}'::jsonb, 'i7:jobs:' || :'worker') as q_jobs \gset
select is(
  (select send_after from public.notification_outbox where dedupe_key = 'i7:jobs:' || :'worker'),
  null::timestamptz,
  '4c: an always-on jobs / money row is never delayed'
);

-- ---------------------------------------------------------------------------
-- 5. The drain does not claim a row before its morning; it claims the rest.
-- ---------------------------------------------------------------------------
select ok(
  not exists (select 1 from public.claim_notification_batch(100) c where c.outbox_id = (select id from public.notification_outbox where dedupe_key = 'job_nearby:' || :'quiet_job' || ':' || :'worker')),
  '5: claim_notification_batch skips the row still waiting for 6 am'
);

-- ---------------------------------------------------------------------------
-- 8. The morning (the group 3 review): a held alert is checked again before it leaves. Three held
--    rows reach 6 am: one for a job still open from a customer the worker still hears from (sent),
--    one for a job hired or withdrawn overnight, one from a customer the worker blocked overnight
--    (both resolved skipped, never sent late).
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select (public.create_job(
  p_title := 'I7 gone by morning', p_description := 'probe row, rolled back',
  p_category := 'other', p_location := 'Park Slope',
  p_budget_cents := 5000, p_lat := 40.6720, p_lng := -73.9780
)).id as gone_job \gset
select tests.authenticate_as(:'blocked_customer');
select (public.create_job(
  p_title := 'I7 blocked by morning', p_description := 'probe row, rolled back',
  p_category := 'other', p_location := 'Park Slope',
  p_budget_cents := 5000, p_lat := 40.6720, p_lng := -73.9780
)).id as blocked_job \gset
select tests.clear_auth();
update public.jobs set status = 'cancelled' where id = :'gone_job';
insert into public.blocks (blocker_id, blocked_id) values (:'worker', :'blocked_customer');
update public.notification_outbox set send_after = now() - interval '1 minute'
 where dedupe_key in (
   'job_nearby:' || :'quiet_job' || ':' || :'worker',
   'job_nearby:' || :'gone_job' || ':' || :'worker',
   'job_nearby:' || :'blocked_job' || ':' || :'worker'
 );
create temp table i7_claimed as select c.outbox_id from public.claim_notification_batch(100) c;
select ok(
  exists (select 1 from i7_claimed c where c.outbox_id = (select id from public.notification_outbox where dedupe_key = 'job_nearby:' || :'quiet_job' || ':' || :'worker')),
  '8a: at 6 am the alert for a job still open, from a customer still heard from, is claimed and sent'
);
select is(
  (select status from public.notification_outbox where dedupe_key = 'job_nearby:' || :'gone_job' || ':' || :'worker'),
  'skipped',
  '8b: an alert for a job no longer open by morning is resolved skipped, never sent late'
);
select is(
  (select status from public.notification_outbox where dedupe_key = 'job_nearby:' || :'blocked_job' || ':' || :'worker'),
  'skipped',
  '8c: an alert from a customer blocked overnight is resolved skipped - no block bypass at 6 am'
);

-- ---------------------------------------------------------------------------
-- 6, 7. The ACLs: the helper and the enqueue are nobody's to call; the claim is the drain's alone.
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.quiet_hours_until(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.quiet_hours_until(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.enqueue_notification(uuid, uuid, text, text, text, text, jsonb, text)', 'EXECUTE'),
  '6: quiet_hours_until and enqueue_notification are reachable only from SECURITY DEFINER functions'
);
select ok(
  has_function_privilege('service_role', 'public.claim_notification_batch(integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.claim_notification_batch(integer)', 'EXECUTE'),
  '7: claim_notification_batch stays the service role''s (the send-push drain) alone'
);

select * from finish();
rollback;
