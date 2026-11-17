-- 479_active_account_queue.sql — production-36h S1, M2: active_account_rule at the queue and at the
-- edge (C9, R2-c, A6-04), and the shape of its cost (must i, D9), proven on the local stack.
--
-- THE CAST: Ann (active), Ben (banned after his notices were queued), Dov (a deleted profile with a
-- notice still pending), an admin, and the service role (the sender and the edge functions).
-- Everything rolls back; no commit.
--
-- FIXTURE SURGERY, DECLARED: the pending notices are raw outbox rows by the runner, queued while
-- their recipients were still active; Dov's deletion is the runner setting deleted_at (a real
-- deletion removes the account's own outbox rows, so only surgery leaves one pending). plan_of() is
-- this file's pg_temp helper: it returns EXPLAIN (VERBOSE, COSTS OFF) of one query as text.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(14);

create function pg_temp.plan_of(p_sql text) returns text language plpgsql as $f$
declare
  v_line text;
  v_plan text := '';
begin
  for v_line in execute 'explain (verbose, costs off) ' || p_sql loop
    v_plan := v_plan || v_line || E'\n';
  end loop;
  return v_plan;
end
$f$;
grant execute on function pg_temp.plan_of(text) to authenticated;

select tests.create_user('aq.admin@brazos.test', 'Ada Admin') as admin \gset
select tests.create_user('aq.ann@brazos.test',   'Ann Active') as ann  \gset
select tests.create_user('aq.ben@brazos.test',   'Ben Banned') as ben  \gset
select tests.create_user('aq.dov@brazos.test',   'Dov Deleted') as dov \gset
update public.profiles set is_admin = true where id = :'admin';
insert into public.push_tokens (user_id, token, platform, active)
values (:'ann', 'ExponentPushToken[aq-ann]', 'ios', true), (:'ben', 'ExponentPushToken[aq-ben]', 'ios', true);

insert into public.notification_outbox (recipient_id, category, type, title, body, data, dedupe_key, created_at)
values (:'ann', 'jobs', 'job_cancelled', 'AQ', 'to the active account', '{}'::jsonb, 'aq:ann', now() - interval '3 minutes'),
       (:'ben', 'jobs', 'job_cancelled', 'AQ', 'to the account banned after it was queued', '{}'::jsonb, 'aq:ben', now() - interval '2 minutes'),
       (:'dov', 'jobs', 'job_cancelled', 'AQ', 'to the account deleted after it was queued', '{}'::jsonb, 'aq:dov', now() - interval '1 minute');
insert into public.notification_outbox (recipient_id, category, type, title, body, data, dedupe_key, created_at, attempts, send_after)
values (:'ben', 'jobs', 'job_cancelled', 'AQ', 'out under the lease', '{}'::jsonb, 'aq:ben:leased', now() - interval '4 minutes', 1, now() + interval '5 minutes');

select tests.authenticate_as(:'admin');
select public.ban_user(:'ben');
select tests.clear_auth();
update public.profiles set deleted_at = now() where id = :'dov';
-- The ban switched Ben's token off; switched back on here, so the proof below is about the account,
-- not the token (A6-04: the sender's claim checked only the tokens).
update public.push_tokens set active = true where user_id = :'ben';

-- ---------------------------------------------------------------------------
-- 1. C9 / A6-04: a notice whose recipient is no longer active is skipped before it is claimed.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
create temp table claimed as select * from public.claim_notification_batch(100);
reset role;
select tests.clear_auth();
select is(
  (select string_agg(c.body, ', ' order by c.body) from claimed c where c.body in (
     'to the active account', 'to the account banned after it was queued', 'to the account deleted after it was queued', 'out under the lease')),
  'to the active account',
  '1a: A6-04: the sender claims the active account''s notice only'
);
select is(
  (select string_agg(o.dedupe_key || '=' || o.status || ' (' || coalesce(o.last_error, '') || ')', ', ' order by o.dedupe_key)
     from public.notification_outbox o where o.dedupe_key in ('aq:ben', 'aq:dov')),
  'aq:ben=skipped (the recipient is not active), aq:dov=skipped (the recipient is not active)',
  '1b: A6-04: the banned and the deleted recipient''s notices end skipped, with a plain reason, not deleted'
);
select is(
  (select row(o.status, o.attempts) from public.notification_outbox o where o.dedupe_key = 'aq:ben:leased'),
  row('pending'::text, 1),
  '1c: a notice still out under its lease is left to the lease (A14) (guard)'
);

-- ---------------------------------------------------------------------------
-- 2. R2-c: the edge functions' one question.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
create temp table admitted (k text primary key, a text);
insert into admitted values
  ('ann',              public.admit_user_call(:'ann', 'aq_probe', 2, interval '1 hour')),
  ('ben',              public.admit_user_call(:'ben', 'aq_probe', 2, interval '1 hour')),
  ('ben_own_cards',    public.admit_user_call(:'ben', 'aq_cards', 2, interval '1 hour', true)),
  ('dov',              public.admit_user_call(:'dov', 'aq_probe', 2, interval '1 hour')),
  ('nobody',           public.admit_user_call(gen_random_uuid(), 'aq_probe', 2, interval '1 hour'));
insert into admitted values ('ann_2', public.admit_user_call(:'ann', 'aq_probe', 2, interval '1 hour'));
insert into admitted values ('ann_3', public.admit_user_call(:'ann', 'aq_probe', 2, interval '1 hour'));
reset role;
select tests.clear_auth();
select is(
  (select string_agg(k || '=' || a, ', ' order by k) from admitted),
  'ann=ok, ann_2=ok, ann_3=limited, ben=suspended, ben_own_cards=ok, dov=inactive, nobody=inactive',
  '2a: R2-c: active ok then limited; banned suspended (its own cards allowed); deleted and no profile inactive'
);
select is(
  (select string_agg(r.action || ':' || r.hits, ', ' order by r.action) from public.rate_counters r where r.user_id in (:'ben', :'dov')),
  'aq_cards:1',
  '2b: R2-c: a refused account takes no rate-limit hit (only the allowed card listing counted)'
);
select ok(
  not has_function_privilege('authenticated', 'public.admit_user_call(uuid,text,integer,interval,boolean)', 'execute')
  and not has_function_privilege('anon', 'public.admit_user_call(uuid,text,integer,interval,boolean)', 'execute')
  and has_function_privilege('service_role', 'public.admit_user_call(uuid,text,integer,interval,boolean)', 'execute')
  and has_function_privilege('service_role', 'public.rate_limit_take(uuid,text,integer,interval)', 'execute'),
  '2c: service role only; rate_limit_take stays for the functions deployed today'
);

-- ---------------------------------------------------------------------------
-- 3. Must i / D9: the active check is a one-time InitPlan on the three busy reads.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'ann');
create temp table plans (k text primary key, p text);
grant select, insert on plans to authenticated;
insert into plans values
  ('open jobs', pg_temp.plan_of($$ select id, title from public.jobs where status = 'open' order by created_at desc limit 20 $$)),
  ('chat', pg_temp.plan_of(format($$ select id, content from public.messages where job_id = %L order by created_at $$, gen_random_uuid()))),
  ('notifications', pg_temp.plan_of($$ select id, title from public.notification_outbox where recipient_id = auth.uid() order by created_at desc limit 50 $$));
select tests.clear_auth();
-- The scan's type is the planner's choice and follows the table's statistics (a messages table
-- never analyzed is planned as a Bitmap Heap Scan with a Recheck Cond line, an analyzed empty one
-- as a Seq Scan). So 3b, 3c, 3d and 3g name the scanned table, accept any scan node and its own
-- detail lines ("Output:", "Index Cond:", "Recheck Cond:"; never a child node, which starts with
-- "->"), and then require that node's own Filter to read the InitPlan's answer first.
select ok((select p from plans where k = 'open jobs') ~ E'InitPlan 1\\n\\s*->  Result\\n\\s*Output: (public\\.)?is_active_user\\(\\)',
  '3a: open jobs: the active check is InitPlan 1, one Result');
select ok((select p from plans where k = 'open jobs') ~ E'Scan[^\\n]* on public\\.jobs[^\\n]*\\n(\\s*[A-Z][A-Za-z ]*:[^\\n]*\\n)*\\s*Filter: \\(\\(InitPlan 1\\)\\.col1 AND',
  '3b: open jobs: the scan reads its answer, (InitPlan 1).col1, it does not call it per row');
select ok((select p from plans where k = 'chat') ~ E'InitPlan 1\\n\\s*->  Result\\n\\s*Output: (public\\.)?is_active_user\\(\\)'
          and (select p from plans where k = 'chat') ~ E'Scan[^\\n]* on public\\.messages[^\\n]*\\n(\\s*[A-Z][A-Za-z ]*:[^\\n]*\\n)*\\s*Filter: \\(\\(InitPlan 1\\)\\.col1 AND',
  '3c: a chat''s messages: the same');
select ok((select p from plans where k = 'notifications') ~ E'InitPlan 1\\n\\s*->  Result\\n\\s*Output: (public\\.)?is_active_user\\(\\)'
          and (select p from plans where k = 'notifications') ~ E'Scan[^\\n]* on public\\.notification_outbox[^\\n]*\\n(\\s*[A-Z][A-Za-z ]*:[^\\n]*\\n)*\\s*Filter: \\(\\(InitPlan 1\\)\\.col1 AND',
  '3d: the notification list: the same');
select is(
  (select count(*) from plans where p ~ E'Filter: [^\\n]*(public\\.)?is_active_user\\(\\)'),
  0::bigint,
  '3e: D9: in none of the three plans is is_active_user() called inside a row filter'
);
select is(
  (select count(*) from plans where p !~ 'InitPlan'),
  0::bigint,
  '3f: and each of the three plans has its InitPlan (guard against an empty pass of 3e)'
);
select ok(
  (select p from plans where k = 'chat') ~ E'Scan[^\\n]* on public\\.jobs j[^\\n]*\\n(\\s*[A-Z][A-Za-z ]*:[^\\n]*\\n)*\\s*Filter: \\(\\(InitPlan [0-9]+\\)\\.col1 AND',
  '3g: D9 as worded: a policy that runs again inside a sub-plan (jobs under messages) gets its own InitPlan, once per policy occurrence'
);
select ok(
  (select p from plans where k = 'open jobs') ~ 'is_profile_active\(',
  '3h: the shape, stated: the per-row helper calls in these plans are the existing open-market rule and the new pending-offer rule, is_profile_active(), not the active check (guard)'
);

select * from finish();
rollback;
