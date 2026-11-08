-- 300_signup_and_push_schedule.sql — lean v1 (20261108000000_lean_v1.sql) section 12, rulings 44
-- and 45: sign-up creates the profile through the on_auth_user_created trigger, and
-- install_push_schedule() puts brazos-drain-push on pg_cron.
--
-- FIXTURE SURGERY, DECLARED: pg_cron is not installed on the local stack, so §2 builds a stand-in
-- inside the transaction (schema cron, a cron.job table, cron.schedule(text, text, text) and
-- cron.unschedule(bigint) in pg_cron's call shapes) to prove what the installer writes and that a
-- second run replaces its job instead of adding one. That the real extension accepts the same calls
-- is staging's to show. Everything rolls back; no commit.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(20);

-- ---------------------------------------------------------------------------
-- §1. Sign-up creates the profile (ruling 44).
-- ---------------------------------------------------------------------------
select ok(exists (select 1 from pg_trigger
                   where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created'
                     and tgfoid = 'public.handle_new_user()'::regprocedure and not tgisinternal),
  '44: auth.users carries on_auth_user_created, which runs handle_new_user()');

select gen_random_uuid() as signup \gset
insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '00000000-0000-0000-0000-000000000000', :'signup', 'authenticated', 'authenticated', 'lean.signup@brazos.test',
  '{"provider":"phone","providers":["phone"]}'::jsonb, '{"full_name":"Sig Nup","phone":"+15550001111"}'::jsonb,
  now(), now(), '', '', '', ''
);
select is((select count(*) from public.profiles where id = :'signup'), 1::bigint,
  '44: an auth.users insert creates exactly one profiles row');
select ok((select full_name = 'Sig Nup' and phone = '+15550001111' and role::text = 'both'
             from public.profiles where id = :'signup'),
  '44: the profile carries the sign-up''s name and phone, with role both');
select ok(public.is_profile_active(:'signup'), '44: and the new account is active');

insert into public.banned_phones (phone) values ('+15550002222');
select throws_ok($$ insert into auth.users (
    instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'lean.banned@brazos.test',
    '{"provider":"phone","providers":["phone"]}'::jsonb, '{"phone":"+15550002222"}'::jsonb,
    now(), now(), '', '', '', ''
  ) $$,
  'P0001', 'This phone number is not eligible to register.',
  '44: a banned phone is refused at sign-up: the trigger raises');
select is((select count(*) from auth.users where email = 'lean.banned@brazos.test'), 0::bigint,
  '44: … and the refused sign-up leaves no auth.users row behind');

-- S1 (20261108010000_lean_v1_grants.sql §3): the verified auth.users.phone wins over the metadata.
select gen_random_uuid() as verified \gset
insert into auth.users (
  instance_id, id, aud, role, email, phone, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '00000000-0000-0000-0000-000000000000', :'verified', 'authenticated', 'authenticated', 'lean.verified@brazos.test', '+15550000001',
  '{"provider":"phone","providers":["phone"]}'::jsonb, '{"full_name":"Veri Fied","phone":"+15550000002"}'::jsonb,
  now(), now(), '', '', '', ''
);
select is((select phone from public.profiles where id = :'verified'), '+15550000001',
  'S1: the profile takes the verified phone, not the one the client put in the metadata');

select gen_random_uuid() as bare \gset
insert into auth.users (
  instance_id, id, aud, role, email, phone, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '00000000-0000-0000-0000-000000000000', :'bare', 'authenticated', 'authenticated', 'lean.bare@brazos.test', '15550000003',
  '{"provider":"phone","providers":["phone"]}'::jsonb, '{"full_name":"Bare Phone"}'::jsonb,
  now(), now(), '', '', '', ''
);
select is((select phone from public.profiles where id = :'bare'), '+15550000003',
  'S1: a verified phone stored without its + is kept in E.164');

select throws_ok($$ insert into auth.users (
    instance_id, id, aud, role, email, phone, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'lean.banned2@brazos.test', '15550002222',
    '{"provider":"phone","providers":["phone"]}'::jsonb, '{"phone":"+15550009999"}'::jsonb,
    now(), now(), '', '', '', ''
  ) $$,
  'P0001', 'This phone number is not eligible to register.',
  'S1: the ban check reads the verified phone, so a clean metadata phone cannot slip a banned number past it');

-- ---------------------------------------------------------------------------
-- §2. The push drain's timer (ruling 45).
-- ---------------------------------------------------------------------------
select ok(has_function_privilege('service_role', 'public.install_push_schedule()', 'EXECUTE'),
  '45: service_role may run install_push_schedule()');
select ok(not has_function_privilege('authenticated', 'public.install_push_schedule()', 'EXECUTE'),
  '45: authenticated may not');
select ok(not has_function_privilege('anon', 'public.install_push_schedule()', 'EXECUTE'),
  '45: anon may not');

select ok(not public.pg_function_present('cron', 'schedule'),
  '45: precondition: this stack has no pg_cron (the stand-in below is the only cron schema)');
select is(public.install_push_schedule(), 'skipped: pg_cron absent',
  '45: without pg_cron the installer skips with a notice, so a reset never fails on it');

-- SURGERY: the pg_cron stand-in.
create schema cron;
create table cron.job (jobid bigserial primary key, jobname text, schedule text not null, command text not null);
create function cron.schedule(p_jobname text, p_schedule text, p_command text) returns bigint
language plpgsql as $$
declare v_id bigint;
begin
  insert into cron.job (jobname, schedule, command) values (p_jobname, p_schedule, p_command) returning jobid into v_id;
  return v_id;
end $$;
create function cron.unschedule(p_jobid bigint) returns boolean
language plpgsql as $$
begin
  delete from cron.job where jobid = p_jobid;
  return found;
end $$;

select is(public.install_push_schedule(), 'scheduled: brazos-drain-push',
  '45: with pg_cron present the installer schedules the drain');
select is((select count(*) from cron.job where jobname = 'brazos-drain-push'), 1::bigint,
  '45: the push cron job exists after install_push_schedule()');
select ok((select schedule = '* * * * *' and command = 'select public.drain_notification_outbox();'
             from cron.job where jobname = 'brazos-drain-push'),
  '45: it runs drain_notification_outbox() every minute');

select cron.schedule('brazos-other-timer', '*/10 * * * *', 'select 1;');
select is(public.install_push_schedule(), 'scheduled: brazos-drain-push', '45: a second run succeeds');
select is((select count(*) from cron.job where jobname = 'brazos-drain-push'), 1::bigint,
  '45: … and still leaves exactly one brazos-drain-push job (idempotent)');
select is((select count(*) from cron.job where jobname = 'brazos-other-timer'), 1::bigint,
  '45: … without touching another timer');

select * from finish();
rollback;
