-- 476_active_account_doors.sql — production-36h S1, M2: active_account_rule (R2-a, R2-b, C1-C4,
-- S4-09) proven at each kind of door: a plpgsql call, an sql call, a table read, an INSERT, an UPDATE
-- and a DELETE, for an active, a banned, a deleted and a profile-less caller.
--
-- THE CAST: an admin; Ann (active, the positive control at every door); Ben (banned); Del (deleted
-- through delete_my_account); a signed-in token whose user has no profile at all; a token that says
-- "authenticated" but names nobody; anon; the service role; and the runner for the fixture rows.
-- Everything rolls back; no commit.
--
-- FIXTURE SURGERY, DECLARED: Ann's and Ben's finished jobs and their worker_services rows are raw
-- rows by the runner. err_of() and rows_of() are pg_temp helpers of this file only: they run one
-- statement and return its error (state | message | hint) or the number of rows it changed.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(15);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated, service_role;

create function pg_temp.err_of(p_sql text) returns text language plpgsql as $f$
declare
  v_state text;
  v_msg text;
  v_hint text;
begin
  execute p_sql;
  return 'no error';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return v_state || ' | ' || v_msg || ' | ' || coalesce(v_hint, '');
end
$f$;
create function pg_temp.rows_of(p_sql text) returns text language plpgsql as $f$
declare
  v_n bigint;
begin
  execute p_sql;
  get diagnostics v_n = row_count;
  return v_n || ' row(s)';
exception when others then
  return 'error ' || sqlstate || ': ' || sqlerrm;
end
$f$;
grant execute on function pg_temp.err_of(text), pg_temp.rows_of(text) to anon, authenticated, service_role;

select tests.create_user('ad.admin@brazos.test', 'Ada Admin') as admin \gset
select tests.create_user('ad.ann@brazos.test',   'Ann Active') as ann  \gset
select tests.create_user('ad.ben@brazos.test',   'Ben Banned') as ben  \gset
select tests.create_user('ad.del@brazos.test',   'Del Gone')   as del  \gset
update public.profiles set is_admin = true where id = :'admin';
insert into fx values ('ann', :'ann'), ('ben', :'ben'), ('del', :'del');
insert into public.jobs (client_id, title, status, completed_at)
values (:'ann', 'AD ann done', 'completed', now() - interval '2 days'), (:'ben', 'AD ben done', 'completed', now() - interval '2 days');
insert into public.worker_services (worker_id, title, category, price_cents, price_unit)
values (:'ann', 'AD ann service', 'other', 5000, 'flat'), (:'ben', 'AD ben service', 'other', 5000, 'flat');
insert into public.push_tokens (user_id, token, platform, active)
values (:'ann', 'ExponentPushToken[ad-ann]', 'ios', true), (:'ben', 'ExponentPushToken[ad-ben]', 'ios', true);

select tests.authenticate_as(:'admin');
select public.ban_user(:'ben');
select tests.authenticate_as(:'del');
select public.delete_my_account();
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 1. The guard at a plpgsql door (set_active_mode) and an sql door (get_my_profile).
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'ann');
select is(
  pg_temp.err_of($$ select public.set_active_mode('customer') $$) || ' / ' || pg_temp.err_of($$ select public.get_my_profile() $$),
  'no error / no error',
  '1a: control: an active account passes both doors (guard)'
);
select tests.authenticate_as(:'ben');
select is(
  pg_temp.err_of($$ select public.set_active_mode('customer') $$) || ' / ' || pg_temp.err_of($$ select public.get_my_profile() $$),
  'P0001 | This account has been suspended for violating the Brazos community rules. Contact support if you think this is a mistake. | account_suspended / '
  'P0001 | This account has been suspended for violating the Brazos community rules. Contact support if you think this is a mistake. | account_suspended',
  '1b: R2-a: a banned account is refused at both doors, in the installed app''s words, hint account_suspended'
);
select tests.authenticate_as(:'del');
select is(
  pg_temp.err_of($$ select public.set_active_mode('customer') $$) || ' / ' || pg_temp.err_of($$ select public.get_my_profile() $$),
  'P0001 | This account is no longer active. | account_inactive / P0001 | This account is no longer active. | account_inactive',
  '1c: R2-a: a deleted account''s token is refused at both doors, hint account_inactive'
);
select tests.authenticate_as(gen_random_uuid());
select is(
  pg_temp.err_of($$ select public.set_active_mode('customer') $$) || ' / ' || pg_temp.err_of($$ select public.get_my_profile() $$),
  'P0001 | This account is no longer active. | account_inactive / P0001 | This account is no longer active. | account_inactive',
  '1d: C4: a signed-in token whose user has no profile row is refused at both doors'
);
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select is(
  pg_temp.err_of($$ select public.set_active_mode('customer') $$) || ' / ' || pg_temp.err_of($$ select public.get_my_profile() $$),
  'P0001 | This account is no longer active. | account_inactive / P0001 | This account is no longer active. | account_inactive',
  '1e: C4: a token that says authenticated but names nobody is refused at both doors'
);
select tests.authenticate_anon();
select is(
  split_part(pg_temp.err_of($$ select public.get_my_profile() $$), ' | ', 1),
  '42501',
  '1f: anon is refused by the grant, before any guard (guard)'
);
select tests.clear_auth();
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(
  pg_temp.err_of($$ select public.current_fee() $$),
  'no error',
  '1g: the server''s own work (no user id, the service role) passes the guard to the function''s own checks (guard)'
);
reset role;
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 2. The table doors (S4-09): a read returns nothing, an INSERT is refused, an UPDATE or a DELETE
--    changes no row and raises nothing. Ann is the control at each.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'ben');
create temp table door (k text primary key, ben text, ann text);
grant select, insert, update on door to authenticated;
insert into door (k, ben) values
  ('read jobs',    (select count(*)::text from public.jobs where client_id = auth.uid())),
  ('read profile', (select count(*)::text from public.profiles where id = auth.uid())),
  ('insert report', pg_temp.err_of(format($$ insert into public.reports (reporter_id, reported_id, reason, description)
                                            values (auth.uid(), %L, 'other', 'AD probe') $$, :'admin'))),
  ('update prefs',  pg_temp.rows_of($$ update public.notification_prefs set messages = false where user_id = auth.uid() $$)),
  ('delete service', pg_temp.rows_of($$ delete from public.worker_services where worker_id = auth.uid() $$)),
  ('update token',  pg_temp.rows_of($$ update public.push_tokens set active = true where user_id = auth.uid() $$));
select tests.authenticate_as(:'ann');
update door set ann = case k
  when 'read jobs'      then (select count(*)::text from public.jobs where client_id = auth.uid())
  when 'read profile'   then (select count(*)::text from public.profiles where id = auth.uid())
  when 'insert report'  then pg_temp.err_of(format($$ insert into public.reports (reporter_id, reported_id, reason, description)
                                                   values (auth.uid(), %L, 'other', 'AD probe') $$, :'admin'))
  when 'update prefs'   then pg_temp.rows_of($$ update public.notification_prefs set messages = false where user_id = auth.uid() $$)
  when 'delete service' then pg_temp.rows_of($$ delete from public.worker_services where worker_id = auth.uid() $$)
  when 'update token'   then pg_temp.rows_of($$ update public.push_tokens set active = false where user_id = auth.uid() $$)
end;
select tests.clear_auth();
select is((select ben || ' / ' || ann from door where k = 'read jobs'), '0 / 1',
  '2a: R2-b: a banned account reads none of its own jobs (the control reads hers)');
select is((select ben || ' / ' || ann from door where k = 'read profile'), '1 / 1',
  '2b: C2: a banned account still reads its own profile row, so the installed app learns of the ban (guard)');
select is((select ben || ' / ' || ann from door where k = 'insert report'),
  '42501 | new row violates row-level security policy for table "reports" |  / no error',
  '2c: S4-09: an INSERT by a banned account is refused, 42501 (guard)');
select is((select ben || ' / ' || ann from door where k = 'update prefs'), '0 row(s) / 1 row(s)',
  '2d: S4-09: an UPDATE by a banned account changes no row and raises nothing');
select is((select ben || ' / ' || ann from door where k = 'delete service'), '0 row(s) / 1 row(s)',
  '2e: S4-09: a DELETE by a banned account changes no row and raises nothing');
select is((select ben || ' / ' || ann from door where k = 'update token'), '0 row(s) / 1 row(s)',
  '2f: S4-09: a banned account cannot switch its push token back on by hand');
select is(
  (select row(
     (select count(*) from public.worker_services where worker_id = :'ben'),
     (select bool_or(active) from public.push_tokens where user_id = :'ben'))),
  row(1::bigint, false),
  '2g: the runner''s ground truth: the banned account''s rows are as the ban left them'
);

-- ---------------------------------------------------------------------------
-- 3. The exempt doors still answer a banned caller about itself.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'ben');
select is(
  pg_temp.err_of($$ select public.current_user_is_banned() $$) || ' / ' || public.current_user_is_banned()::text
  || ' / ' || pg_temp.err_of($$ select count(*) from public.account_deletion_blockers() $$)
  || ' / ' || public.is_active_user()::text,
  'no error / true / no error / false',
  '3a: a banned caller can still ask whether it is banned and what blocks its deletion (guard)'
);
select tests.clear_auth();

select * from finish();
rollback;
