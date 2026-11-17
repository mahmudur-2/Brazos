-- 474_report_push.sql — production-36h S1, M2: report_push (R2-f) proven on the local stack.
--
-- THE CAST: two active admins (one has switched every notification preference off), a banned admin,
-- a deleted admin, a reporter and the person reported; the runner (RLS bypassed) for the fixture rows
-- and the ground truth. Everything rolls back; no commit.
--
-- FIXTURE SURGERY, DECLARED: the banned and the deleted admin are made by the runner setting the
-- flags directly (delete_my_account() would also clear is_admin; the row here proves notify_admins()
-- reads the flags, not is_admin alone). The report is inserted the way the installed app inserts it.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(9);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated, service_role;

select tests.create_user('rp.ada@brazos.test',  'Ada Admin')    as a1 \gset
select tests.create_user('rp.abe@brazos.test',  'Abe Admin')    as a2 \gset
select tests.create_user('rp.ban@brazos.test',  'Bab Admin')    as a3 \gset
select tests.create_user('rp.del@brazos.test',  'Del Admin')    as a4 \gset
select tests.create_user('rp.rita@brazos.test', 'Rita Reporter') as rep \gset
select tests.create_user('rp.rex@brazos.test',  'Rex Reported')  as tgt \gset
update public.profiles set is_admin = true where id in (:'a1', :'a2', :'a3', :'a4');
update public.profiles set banned = true where id = :'a3';
update public.profiles set deleted_at = now() where id = :'a4';
update public.notification_prefs
   set messages = false, bids = false, job_updates = false, hire_requests = false, nearby_jobs = false
 where user_id = :'a2';
insert into fx values ('rep', :'rep'), ('tgt', :'tgt');

select tests.authenticate_as(:'rep');
select lives_ok(
  $$ insert into public.reports (reporter_id, reported_id, reason, description)
     values ((select v from fx where k = 'rep'), (select v from fx where k = 'tgt'), 'scam', 'RP private words of the reporter') $$,
  '1a: the reporter files a report the way the installed app does (guard)'
);
select tests.clear_auth();
select id as r from public.reports where reporter_id = :'rep' \gset

select is(
  (select string_agg(p.full_name, ', ' order by p.full_name)
     from public.notification_outbox o join public.profiles p on p.id = o.recipient_id
    where o.data ->> 'reportId' = :'r'),
  'Abe Admin, Ada Admin',
  '1b: R2-f: each ACTIVE admin is told, the one with every preference off included; not the banned or the deleted admin, not the reporter'
);
select is(
  (select string_agg(concat_ws(' | ', o.category, o.type, o.title, o.body, o.data ->> 'screen', o.status), '; ')
     from public.notification_outbox o where o.recipient_id = :'a1' and o.data ->> 'reportId' = :'r'),
  'jobs | report_new | New report | A report needs review. Open Profile, then Account & safety, then Review reports. | ProfileMain | pending',
  '1c: R2-f: the words, the destination the installed app routes (ProfileMain), and no reporter words on a lock screen'
);
select is(
  (select o.dedupe_key from public.notification_outbox o where o.recipient_id = :'a1' and o.data ->> 'reportId' = :'r'),
  'report:' || :'r' || ':' || :'a1',
  '1d: the dedupe key names the report and the admin'
);

-- The same report told twice still makes one row per admin.
select public.notify_admins('report_new', 'New report', 'again', jsonb_build_object('screen', 'ProfileMain', 'reportId', :'r'),
  'report:' || :'r');
select is((select count(*) from public.notification_outbox where data ->> 'reportId' = :'r'), 2::bigint,
  '1e: a second telling of the same report adds no row (dedupe)');

-- ---------------------------------------------------------------------------
-- 2. The shape: definer code only, one trigger.
-- ---------------------------------------------------------------------------
select ok(
  to_regprocedure('public.notify_admins(text,text,text,jsonb,text)') is not null
  and not has_function_privilege('authenticated', to_regprocedure('public.notify_admins(text,text,text,jsonb,text)'), 'EXECUTE')
  and not has_function_privilege('anon', to_regprocedure('public.notify_admins(text,text,text,jsonb,text)'), 'EXECUTE'),
  '2a: no client may call notify_admins()'
);
select ok(
  to_regprocedure('public.notify_admins_on_report()') is not null
  and not has_function_privilege('authenticated', to_regprocedure('public.notify_admins_on_report()'), 'EXECUTE'),
  '2b: no client may call the trigger function'
);
select is(
  (select string_agg(t.tgname || ':' || t.tgfoid::regproc::text, ',') from pg_trigger t
    where t.tgrelid = 'public.reports'::regclass and not t.tgisinternal and t.tgfoid::regproc::text = 'notify_admins_on_report'
      and (t.tgtype & 1) = 1 and (t.tgtype & 4) = 4 and (t.tgtype & 2) = 0),
  'reports_notify_admins:notify_admins_on_report',
  '2c: one AFTER INSERT row trigger on reports'
);
select is(
  (select count(*) from public.notification_outbox where data ->> 'reportId' = :'r' and body like '%RP private words%'),
  0::bigint,
  '2d: the reporter''s words are in no notification (guard)'
);

select * from finish();
rollback;
