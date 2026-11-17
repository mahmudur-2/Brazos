-- 477_active_account_mark.sql — production-36h S1, M2: active_account_rule's one trusted exception
-- (the brazos.inactive_ok mark, C5), the way out for a banned account (S4-09), a new account (must c)
-- and an unban (must f), proven on the local stack.
--
-- THE CAST: an admin; Kim, who deletes her account; Bob, banned, who then deletes his; Liv, banned,
-- whose deletion is blocked; Jo, active, whose deletion is blocked by a job going on; Ula, banned and
-- then unbanned; Nia, a brand-new sign-up; Max, banned, whose started job leaves only a held payment
-- (decision 14); and the runner for the fixture rows. Bob signs in with a phone, so 5b2 can try it
-- again after his deletion. Everything rolls back; no commit.
--
-- FIXTURE SURGERY, DECLARED: Liv's and Jo's jobs, payments and dispute are raw rows by the runner, so
-- their deletions meet each blocker. The mark is set by the test itself in (2) and (3), as a client
-- cannot; (4) proves no client-callable function can set it. err_of() is this file's pg_temp helper:
-- it runs one statement and returns its error as state | message | detail | hint.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(18);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated, service_role;

create function pg_temp.err_of(p_sql text) returns text language plpgsql as $f$
declare
  v_state text;
  v_msg text;
  v_detail text;
  v_hint text;
begin
  execute p_sql;
  return 'no error';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail,
                          v_hint = pg_exception_hint;
  return concat_ws(' | ', v_state, v_msg, nullif(v_detail, ''), nullif(v_hint, ''));
end
$f$;
grant execute on function pg_temp.err_of(text) to anon, authenticated, service_role;

select tests.create_user('am.admin@brazos.test', 'Ada Admin') as admin \gset
select tests.create_user('am.kim@brazos.test',   'Kim Leaves') as kim  \gset
select tests.create_user('am.bob@brazos.test',   'Bob Banned') as bob  \gset
select tests.create_user('am.liv@brazos.test',   'Liv Blocked') as liv \gset
select tests.create_user('am.ula@brazos.test',   'Ula Unbanned') as ula \gset
select tests.create_user('am.wen@brazos.test',   'Wen Worker') as wen  \gset
select tests.create_user('am.jo@brazos.test',    'Jo Busy')    as jo   \gset
select tests.create_user('am.max@brazos.test',   'Max Held')   as max  \gset
update public.profiles set is_admin = true where id = :'admin';
-- Decision 14: Bob signs in with a phone (a fictional 555-01xx number), which his ban records.
update auth.users set phone = '15550107474' where id = :'bob';
insert into fx values ('admin', :'admin'), ('kim', :'kim'), ('bob', :'bob'), ('liv', :'liv'), ('ula', :'ula');

-- Liv: a started job (A8-01: the ban cancels it and leaves its held payment for the operator, so the
-- payment blocks, not the job), a finished job whose payment is still held, and a finished job with
-- an open dispute.
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'liv', 'AM liv started', :'wen', 'in_progress') returning id as l_start \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, provider, provider_ref, status)
values (:'l_start', :'liv', :'wen', 5000, 500, 'stripe', 'pi_am_l1', 'held');
insert into public.jobs (client_id, title, assigned_worker_id, status, completed_at)
values (:'liv', 'AM liv done held', :'wen', 'completed', now() - interval '1 day') returning id as l_done \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, provider, provider_ref, status)
values (:'l_done', :'liv', :'wen', 6000, 600, 'stripe', 'pi_am_l2', 'held') returning id as l_done_pay \gset
insert into public.jobs (client_id, title, assigned_worker_id, status, completed_at)
values (:'liv', 'AM liv disputed', :'wen', 'completed', now() - interval '1 day') returning id as l_disp \gset
insert into public.job_disputes (job_id, opened_by, reason, status, details)
values (:'l_disp', :'liv', 'incomplete', 'open', 'AM probe dispute');
insert into fx values ('l_start', :'l_start'), ('l_done', :'l_done'), ('l_disp', :'l_disp');
-- Jo (never banned): a started job with its held payment.
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'jo', 'AM jo started', :'wen', 'in_progress') returning id as j_start \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, provider, provider_ref, status)
values (:'j_start', :'jo', :'wen', 5500, 550, 'stripe', 'pi_am_j1', 'held');
-- Max (decision 14): only a started job with its held payment.
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'max', 'AM max started', :'wen', 'in_progress') returning id as m_start \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, provider, provider_ref, status)
values (:'m_start', :'max', :'wen', 5200, 520, 'stripe', 'pi_am_m1', 'held');

select tests.authenticate_as(:'admin');
select public.ban_user(:'bob');
select public.ban_user(:'liv');
select public.ban_user(:'ula');
select public.ban_user(:'max');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 1. (i) The mark ends when delete_my_account returns, in the same transaction.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'kim');
select lives_ok($$ select public.delete_my_account() $$, '1a: Kim deletes her account (guard)');
select is(coalesce(current_setting('brazos.inactive_ok', true), ''), '',
  '1b: must a (i): after delete_my_account returns, the mark is empty (guard)');
select is(
  pg_temp.err_of($$ select public.get_my_profile() $$),
  'P0001 | This account is no longer active. | account_inactive',
  '1c: must a (i): and a guarded call by the same uid, in the same transaction, is refused'
);
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 2. (ii) A mark holding another uid passes nobody.
-- ---------------------------------------------------------------------------
select set_config('brazos.inactive_ok', gen_random_uuid()::text, true);
select tests.authenticate_as(:'bob');
select is(
  pg_temp.err_of($$ select public.get_my_profile() $$),
  'P0001 | This account has been suspended for violating the Brazos community rules. Contact support if you think this is a mistake. | account_suspended',
  '2a: must a (ii): a mark that holds another uid does not pass the banned caller'
);
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 3. (iii) A mark a session sets for one uid does not pass a guarded call for a different uid.
-- ---------------------------------------------------------------------------
select set_config('brazos.inactive_ok', :'ula', true);
select tests.authenticate_as(:'bob');
select is(
  pg_temp.err_of($$ select public.get_my_profile() $$),
  'P0001 | This account has been suspended for violating the Brazos community rules. Contact support if you think this is a mistake. | account_suspended',
  '3a: must a (iii): the mark set for Ula does not pass Bob'
);
select tests.authenticate_as(:'kim');
select is(
  pg_temp.err_of($$ select public.get_my_profile() $$),
  'P0001 | This account is no longer active. | account_inactive',
  '3b: must a (iii): nor the deleted Kim'
);
select tests.clear_auth();
select set_config('brazos.inactive_ok', '', true);

-- ---------------------------------------------------------------------------
-- 4. C5: who may set a setting at all. One query over every function in public, with two red
--    controls made here: a client-callable function that names the setting from its argument, and
--    one that sets the mark.
-- ---------------------------------------------------------------------------
create function public.m2_red_setter(p_name text) returns void language plpgsql security definer as $f$
begin
  perform set_config(p_name, 'on', true);
end
$f$;
create function public.m2_red_marker() returns void language plpgsql security definer as $f$
begin
  perform set_config('brazos.inactive_ok', auth.uid()::text, true);
end
$f$;
revoke all on function public.m2_red_setter(text), public.m2_red_marker() from public, anon;
grant execute on function public.m2_red_setter(text), public.m2_red_marker() to authenticated;
select is(
  (select string_agg(x.fn || ': ' || x.names, '; ' order by x.fn)
     from (
       select p.oid::regprocedure::text as fn,
              (select string_agg(distinct m[1], ',') from regexp_matches(p.prosrc, 'set_config\(\s*([^,]+),', 'g') m) as names
       from pg_catalog.pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and has_function_privilege('authenticated', p.oid, 'execute')
         and p.prosrc ~ 'set_config\('
     ) x),
  'delete_my_account(): ''brazos.inactive_ok''; drop_series_worker(uuid): ''brazos.series_quiet''; '
  'm2_red_marker(): ''brazos.inactive_ok''; m2_red_setter(text): p_name; stop_job_series(uuid): ''brazos.series_quiet''',
  '4a: C5: a client-callable function sets only brazos.series_quiet, or brazos.inactive_ok in delete_my_account alone, and always by a literal name; the two red controls are the only others listed'
);
select is(
  (select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
     from pg_catalog.pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosrc ~ 'set_config\(\s*''brazos\.inactive_ok'''
      and p.proname not like 'm2\_red\_%'),
  'delete_my_account()',
  '4b: C5: no other function anywhere in public sets the mark'
);
drop function public.m2_red_setter(text);
drop function public.m2_red_marker();

-- ---------------------------------------------------------------------------
-- 5. S4-09: a banned account can leave straight away, with no read before it.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'bob');
select lives_ok($$ select public.delete_my_account() $$, '5a: S4-09: banned Bob deletes his account as his first call (guard)');
select tests.clear_auth();
select is(
  (select row(p.deleted_at is not null, p.banned, (select count(*) from auth.users u where u.id = p.id)) from public.profiles p where p.id = :'bob'),
  row(true, true, 0::bigint),
  '5b: the tombstone keeps the ban, and the sign-in is gone (guard)'
);
select throws_ok($$ insert into auth.users (
    instance_id, id, aud, role, email, phone, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'am.bob2@brazos.test', '15550107474',
    '{"provider":"phone","providers":["phone"]}'::jsonb, '{"full_name":"Bob Again"}'::jsonb,
    now(), now(), '', '', '', ''
  ) $$,
  'P0001', 'This phone number is not eligible to register.',
  '5b2: decision 14: after banned Bob deleted his account, a sign-up with the phone he signed in with is still refused');
select tests.authenticate_as(:'liv');
select is(
  pg_temp.err_of($$ select public.delete_my_account() $$),
  'P0001 | ACCOUNT_DELETION_BLOCKED | This account cannot be deleted yet. A payment of yours has not settled. A dispute on one of your jobs is still open. Contact support if you need help.',
  '5c: S4-09: a blocked deletion keeps the message the app matches, and its detail says what blocks and that support can help (A8-01: the ban cancelled her started job, so no job blocks)'
);
select tests.authenticate_as(:'jo');
select is(
  pg_temp.err_of($$ select public.delete_my_account() $$),
  'P0001 | ACCOUNT_DELETION_BLOCKED | This account cannot be deleted yet. A job of yours has not finished. A payment of yours has not settled. Contact support if you need help.',
  '5c2: S4-09: a job going on is named first, before the payment (guard: keeps the job sentence pinned)'
);
select tests.clear_auth();
update public.job_disputes set status = 'withdrawn' where job_id = :'l_disp';
select tests.authenticate_as(:'liv');
select is(
  pg_temp.err_of($$ select public.delete_my_account() $$),
  'P0001 | ACCOUNT_DELETION_BLOCKED | This account cannot be deleted yet. A payment of yours has not settled. Contact support if you need help.',
  '5d: S4-09: with only money left, the detail names only the payment'
);
-- Decision 14 (2): the suspended customer whose started job the ban cancelled, its payment held.
select tests.authenticate_as(:'max');
select pg_temp.err_of($$ select public.delete_my_account() $$) as max_err \gset
select coalesce(string_agg(concat_ws(' | ', b.kind, (b.ref_id = :'m_start')::text, b.label, b.detail), '; '), 'none') as max_blk
from public.account_deletion_blockers() b \gset
select tests.clear_auth();
select is(
  :'max_err' || ' / ' || :'max_blk' || ' / ' || (select j.status::text from public.jobs j where j.id = :'m_start'),
  'P0001 | ACCOUNT_DELETION_BLOCKED | This account cannot be deleted yet. A payment of yours has not settled. Contact support if you need help.'
  || ' / payment_outgoing | true | Payment you sent | This payment is being held for a job and has not been released. / cancelled',
  '5e: decision 14: banned Max, whose started job the ban cancelled with its payment held, is refused, and the one blocker is that payment with the held sentence'
);
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 6. Must c: a new account passes, in the transaction that made it.
-- ---------------------------------------------------------------------------
select gen_random_uuid() as nia \gset
insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '00000000-0000-0000-0000-000000000000', :'nia', 'authenticated', 'authenticated', 'am.nia@brazos.test',
  '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Nia New"}'::jsonb,
  now(), now(), '', '', '', ''
);
select tests.authenticate_as(:'nia');
select is(
  pg_temp.err_of($$ select public.set_active_mode('worker') $$)
  || ' / ' || (select count(*)::text from public.profiles where id = auth.uid())
  || ' / ' || pg_temp.err_of($$ insert into public.worker_services (worker_id, title, category, price_cents, price_unit)
                               values (auth.uid(), 'AM first service', 'other', 4000, 'flat') $$),
  'no error / 1 / no error',
  '6a: must c: a brand-new sign-up passes the guard, reads its own profile row and makes an allowed insert (guard)'
);
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 7. Must f: an unban really restores.
-- ---------------------------------------------------------------------------
insert into public.push_tokens (user_id, token, platform, active) values (:'ula', 'ExponentPushToken[am-ula]', 'ios', false);
select tests.authenticate_as(:'admin');
select public.unban_user(:'ula');
select tests.authenticate_as(:'ula');
select is(
  pg_temp.err_of($$ select public.get_my_profile() $$)
  || ' / ' || pg_temp.err_of($$ select public.register_push_token('ExponentPushToken[am-ula]', 'ios') $$)
  || ' / ' || (select count(*)::text from public.notification_prefs where user_id = auth.uid()),
  'no error / no error / 1',
  '7a: must f: after the unban Ula passes the guard, the app''s own token registration works, and the policies let her read her rows again (guard)'
);
select tests.clear_auth();
select is(
  (select row((select banned_until from auth.users where id = :'ula') is null,
              (select bool_and(active) from public.push_tokens where user_id = :'ula'))),
  row(true, true),
  '7b: must f: banned_until is null, and the registration at the next launch switched her token back on (guard)'
);

select * from finish();
rollback;
