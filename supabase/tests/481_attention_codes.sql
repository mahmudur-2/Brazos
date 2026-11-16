-- 481_attention_codes.sql — money M1: the code map, the shape of payment_attention, who may touch the
-- new objects (A2-03), record_timer_run, and the system lines. Proves
-- attention_plain (payment_attention_codes, timer_runs, record_timer_run, the
-- system arms of payment_attention). 480_attention_exit_map.sql proves the payment lines.
--
-- THE CAST: one user (signed in), anon, service_role (the drain's and the owner's role), the runner
-- (RLS bypassed: fixtures and ground truth).
--
-- FIXTURE SURGERY, DECLARED. now() is fixed inside a transaction, so time moves only by surgery:
--   * timer_runs.ok_at, failing_since and failed_at moved back (a task's last good run or first
--     failure was earlier).
--   * cron.unschedule('brazos-job-series') (as 332 does for another timer): a timer gone.
--   * every pending notification_outbox row marked skipped, then three rows of this file inserted as
--     enqueue_notification writes them, with created_at moved back: the push lines start empty.
-- Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(52);

select tests.create_user('ac.user@brazos.test', 'Ace User') as usr \gset

-- ---------------------------------------------------------------------------
-- The map.
-- ---------------------------------------------------------------------------
select is((select string_agg(code, ',' order by code collate "C") from public.payment_attention_codes()),
  'amount_differs,cancel_unconfirmed,card_dispute_lost,card_dispute_open,card_dispute_unclear,event_failed,event_scan_gap,issue_no_show,issue_open,'
  || 'job_closed_money_held,job_stuck,money_not_moving,money_short,payout_not_automatic,push_stuck,refund_after_dispute_lost,refund_after_dispute_pending,refund_card_dispute,refund_failed,refund_failed_before,'
  || 'refund_failed_dispute_lost,refund_failed_dispute_unclear,refund_failed_disputed,refund_failed_several,refund_more_than_left,refund_no_answer,refund_no_answer_yet,refund_no_intent,'
  || 'refund_not_started,refund_outside_app,refund_partly_landed,refund_retrying,refund_stopped,refund_unconfirmed,status_unusual,'
  || 'timer_failed,timer_late,timer_missing,tip_payee_gone,transfer_already_recorded,transfer_balance_low,transfer_card_dispute,'
  || 'transfer_issue_open,transfer_more_than_left,transfer_no_answer,transfer_no_answer_yet,transfer_no_payout_account,transfer_not_started,'
  || 'transfer_partly_reversed,transfer_payee_gone,transfer_payout_review,transfer_retrying,transfer_reversed,transfer_reversed_disputed,'
  || 'transfer_stopped,vault_missing',
  'M1, M1b, M1c, M2 (money_not_moving, ready_wait, A9-02 event_scan_gap, A9 PART 2 b payout_not_automatic, A12-01 refund_after_dispute_lost, A12-03 the two no_answer_yet, A13-01 refund_after_dispute_pending): the map holds exactly these 56 codes');
select is((select count(*) - count(distinct code) from public.payment_attention_codes()), 0::bigint,
  'M2: each code once');

select is((select count(*)::integer from public.payment_attention_codes() where reason is null or btrim(reason) = ''), 0,
  'R1: every code has a sentence');
select is((select count(*)::integer from public.payment_attention_codes() where reason !~ '\.$'), 0,
  'R2: every sentence ends with a full stop');
select is((select string_agg(code, ',') from public.payment_attention_codes() where reason ~ '[_()]'), null,
  'R3: no sentence holds a column or function name (no underscore, no brackets)');
select is((select string_agg(code, ',') from public.payment_attention_codes() where reason ~* '72|hours after'), null,
  'R4 (A2-05): no sentence promises a time after the owner was told');
select is((select string_agg(code, ',' order by code) from public.payment_attention_codes()
            where finish = 'worker' or reason ~* 'waits for them'), 'transfer_no_payout_account',
  'R5 (A2-10): only the worker who can still finish setup is waited for');

select is((select string_agg(code, ',') from public.payment_attention_codes()
            where finish is null or finish not in ('app', 'stripe', 'bank', 'worker', 'wait', 'developer')), null,
  'F1: every finish is app, stripe, bank, worker, wait or developer');
select is((select string_agg(code, ',') from public.payment_attention_codes() where finish = 'wait'), null,
  'F2 (A2-09): no code says wait: nothing on the list ends by itself today');

select is((select string_agg(column_name || ':' || data_type, ',' order by ordinal_position)
             from information_schema.columns where table_schema = 'public' and table_name = 'payment_attention'),
  'payment_id:uuid,job_id:uuid,what:text,reason:text,since:timestamp with time zone,overdue:boolean,cents:integer,'
  || 'detail:text,code:text,ref:text,finish:text',
  'V1: the eight columns keep their names, types and order; code, ref and finish come last');

-- ---------------------------------------------------------------------------
-- A2-03: a signed-in user and anon can neither read nor write the new objects.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'usr');
select throws_ok($$ select count(*) from public.timer_runs $$, '42501', 'permission denied for table timer_runs',
  'A1: a signed-in user cannot read timer_runs');
select throws_ok($$ insert into public.timer_runs (name) values ('ac-forged') $$, '42501', 'permission denied for table timer_runs',
  'A2: a signed-in user cannot insert into timer_runs');
select throws_ok($$ update public.timer_runs set error = 'forged' $$, '42501', 'permission denied for table timer_runs',
  'A3: a signed-in user cannot update timer_runs');
select throws_ok($$ delete from public.timer_runs $$, '42501', 'permission denied for table timer_runs',
  'A4: a signed-in user cannot remove timer_runs rows');
select throws_ok($$ select public.record_timer_run('ac-forged') $$, '42501', 'permission denied for function record_timer_run',
  'A5: a signed-in user cannot call record_timer_run');
select throws_ok($$ select count(*) from public.payment_attention_codes() $$, '42501', 'permission denied for function payment_attention_codes',
  'A6: a signed-in user cannot call payment_attention_codes');
select throws_ok($$ select count(*) from public.payment_attention $$, '42501', 'permission denied for view payment_attention',
  'A7: a signed-in user cannot read payment_attention');
select tests.authenticate_anon();
select throws_ok($$ select count(*) from public.timer_runs $$, '42501', 'permission denied for table timer_runs',
  'A8: anon cannot read timer_runs');
select throws_ok($$ insert into public.timer_runs (name) values ('ac-forged') $$, '42501', 'permission denied for table timer_runs',
  'A9: anon cannot insert into timer_runs');
select throws_ok($$ update public.timer_runs set error = 'forged' $$, '42501', 'permission denied for table timer_runs',
  'A10: anon cannot update timer_runs');
select throws_ok($$ delete from public.timer_runs $$, '42501', 'permission denied for table timer_runs',
  'A11: anon cannot remove timer_runs rows');
select throws_ok($$ select public.record_timer_run('ac-forged') $$, '42501', 'permission denied for function record_timer_run',
  'A12: anon cannot call record_timer_run');
select throws_ok($$ select count(*) from public.payment_attention_codes() $$, '42501', 'permission denied for function payment_attention_codes',
  'A13: anon cannot call payment_attention_codes');
select throws_ok($$ select count(*) from public.payment_attention $$, '42501', 'permission denied for view payment_attention',
  'A14: anon cannot read payment_attention');
select tests.clear_auth();

select is((select string_agg(r || ':' || p || ':' || has_table_privilege(r, 'public.timer_runs', p)::text, ' ' order by r, p)
             from unnest(array['anon', 'authenticated']) r, unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER']) p),
  'anon:REFERENCES:false anon:TRIGGER:false anon:TRUNCATE:false authenticated:REFERENCES:false authenticated:TRIGGER:false authenticated:TRUNCATE:false',
  'A15: no other table right for anon or a signed-in user (the default grants are revoked)');
select is(has_table_privilege('service_role', 'public.timer_runs', 'SELECT')::text
          || '/' || has_table_privilege('service_role', 'public.timer_runs', 'INSERT')::text
          || '/' || has_table_privilege('service_role', 'public.timer_runs', 'UPDATE')::text
          || '/' || has_table_privilege('service_role', 'public.timer_runs', 'DELETE')::text
          || '/' || has_function_privilege('service_role', 'public.record_timer_run(text, text, interval)', 'EXECUTE')::text
          || '/' || has_function_privilege('service_role', 'public.payment_attention_codes()', 'EXECUTE')::text,
  'true/false/false/false/true/true',
  'A16: service_role reads timer_runs and writes it only through record_timer_run');
select is((select c.relrowsecurity::text || '/' || (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'timer_runs')::text
             from pg_class c where c.oid = 'public.timer_runs'::regclass), 'true/0',
  'A17: timer_runs has row security on and no policy');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('record_timer_run', 'payment_attention_codes')
              and (p.proacl is null or p.proacl::text ~ '(^\{|,)=X')), 0,
  'A18: neither new function is executable by PUBLIC');
select is((select string_agg(p.proname || ':' || p.prosecdef::text || ':' || coalesce(array_to_string(p.proconfig, ';'), 'none'), ' ' order by p.proname)
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('record_timer_run', 'payment_attention_codes')),
  'payment_attention_codes:false:search_path=public, pg_temp record_timer_run:true:search_path=public, pg_temp',
  'A19: both set search_path; only the writer is security definer');

-- ---------------------------------------------------------------------------
-- record_timer_run, called as service_role (the drain's role).
-- ---------------------------------------------------------------------------
create or replace function tests.ac_line(p_ref text) returns text language sql as $$
  select coalesce((select string_agg(a.code || '/' || a.finish || '/' || coalesce(a.since::text, 'no since') || '/' || coalesce(a.detail, ''), ' | ' order by a.code)
                     from public.payment_attention a where a.what = 'system' and a.ref = p_ref), '<none>')
$$;
create or replace function tests.ac_run(p_name text) returns text language sql as $$
  select coalesce((select coalesce(r.ok_at::text, 'no ok') || '/' || coalesce(r.failing_since::text, 'not failing')
                          || '/' || coalesce(r.failed_at::text, 'never failed') || '/' || coalesce(r.error, 'no error')
                          || '/' || r.stale_after::text
                     from public.timer_runs r where r.name = p_name), '<none>')
$$;

set local role service_role;
select public.record_timer_run('ac-task', 'boom');
reset role;
select is(tests.ac_run('ac-task'), 'no ok/' || now() || '/' || now() || '/boom/00:20:00',
  'B1: a first failed run: failing_since and failed_at now, the error kept, late after 20 minutes by default');
select is(tests.ac_line('task:ac-task'), 'timer_failed/developer/' || now() || '/task ac-task failed (timer_runs) | boom',
  'B2: listed as timer_failed, since the first failure');
-- SURGERY: the first failure was 2 hours ago.
update public.timer_runs set failing_since = now() - interval '2 hours', failed_at = now() - interval '2 hours' where name = 'ac-task';
set local role service_role;
select public.record_timer_run('ac-task', 'boom again');
reset role;
select is(tests.ac_run('ac-task'), 'no ok/' || (now() - interval '2 hours') || '/' || now() || '/boom again/00:20:00',
  'B3 (A2-11): a second failure keeps the first failure as the start; failed_at and the error move');
select is(tests.ac_line('task:ac-task'), 'timer_failed/developer/' || (now() - interval '2 hours') || '/task ac-task failed (timer_runs) | boom again',
  'B4: the line keeps its since');
set local role service_role;
select public.record_timer_run('ac-task');
reset role;
select is(tests.ac_run('ac-task'), now() || '/not failing/' || now() || '/boom again/00:20:00',
  'B5: a good run: ok_at now and failing_since cleared (the last failure stays for the record)');
select is(tests.ac_line('task:ac-task'), '<none>', 'B6: a working task is not listed');
-- SURGERY: the last good run was 19, then 21 minutes ago.
update public.timer_runs set ok_at = now() - interval '19 minutes' where name = 'ac-task';
select is(tests.ac_line('task:ac-task'), '<none>', 'B7: 19 minutes after a good run, not late');
update public.timer_runs set ok_at = now() - interval '21 minutes' where name = 'ac-task';
select is(tests.ac_line('task:ac-task'), 'timer_late/developer/' || (now() - interval '1 minute') || '/task ac-task: no good run for 00:20:00 (timer_runs) | boom again',
  'B8: 21 minutes after: timer_late, since the moment it became late');

set local role service_role;
select public.record_timer_run('ac-slow', null, interval '1 hour');
select public.record_timer_run('ac-slow');
reset role;
select is((select stale_after from public.timer_runs where name = 'ac-slow'), interval '1 hour',
  'B9: a task''s own stale_after is kept by later runs that do not give one');
-- SURGERY: the last good run was 30, then 61 minutes ago.
update public.timer_runs set ok_at = now() - interval '30 minutes' where name = 'ac-slow';
select is(tests.ac_line('task:ac-slow'), '<none>', 'B10: within its own hour, not late');
update public.timer_runs set ok_at = now() - interval '61 minutes' where name = 'ac-slow';
select is(tests.ac_line('task:ac-slow'), 'timer_late/developer/' || (now() - interval '1 minute') || '/task ac-slow: no good run for 01:00:00 (timer_runs)',
  'B11: past its own hour: late');

set local role service_role;
select throws_ok($$ select public.record_timer_run('   ') $$, 'P0001', 'A timer run needs its name', 'B12: a blank name is refused');
select throws_ok($$ select public.record_timer_run(null) $$, 'P0001', 'A timer run needs its name', 'B13: no name is refused');
select public.record_timer_run('ac-long', repeat('x', 600));
select public.record_timer_run('ac-blank', '   ');
reset role;
select is((select length(error) from public.timer_runs where name = 'ac-long'), 500, 'B14: the error keeps its first 500 characters');
select is(tests.ac_run('ac-blank'), now() || '/not failing/never failed/no error/00:20:00', 'B15: a blank error is a good run');

-- ---------------------------------------------------------------------------
-- The system lines from schedule_health() and the outbox. Each comparison is one statement (one
-- snapshot), so the timers cannot move between its two sides.
-- ---------------------------------------------------------------------------
select is((select coalesce(string_agg(a.ref || ':' || coalesce(a.since::text, 'no since') || ':' || coalesce(a.payment_id::text, 'no payment'), ',' order by a.ref), '<none>')
             from public.payment_attention a where a.code = 'vault_missing'),
          (select coalesce(string_agg('vault:' || v || ':no since:no payment', ',' order by v), '<none>')
             from jsonb_array_elements_text(public.schedule_health() -> 'vault_missing') v),
  'S1: one vault_missing line per missing setting, ref vault:<secret>, no since, no payment');
select is((select count(*)::integer from public.payment_attention where code = 'timer_missing' and ref = 'cron:brazos-job-series'), 0,
  'S2: a timer that is there is not listed');
-- SURGERY: a timer gone (as 332).
select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'brazos-job-series';
select is((select string_agg(a.code || '/' || a.finish || '/' || coalesce(a.since::text, 'no since'), ',')
             from public.payment_attention a where a.what = 'system' and a.ref = 'cron:brazos-job-series'),
  'timer_missing/developer/no since', 'S3: a timer gone is listed, with no since');
select is((select coalesce(string_agg(a.ref || ':' || coalesce(a.since::text, 'no since'), ',' order by a.ref), '<none>')
             from public.payment_attention a where a.code = 'timer_failed' and a.detail like '%(cron.job_run_details)%'),
          (select coalesce(string_agg('cron:' || (t ->> 'jobname') || ':no since', ',' order by t ->> 'jobname'), '<none>')
             from jsonb_array_elements(public.schedule_health() -> 'timers') t where t ->> 'last_status' = 'failed'),
  'S4: one timer_failed line per timer whose last run failed, ref cron:<job> (no since: cron keeps no failure start)');

-- SURGERY: the push lines start empty.
update public.notification_outbox set status = 'skipped' where status = 'pending';
select is(tests.ac_line('notification_outbox'), '<none>', 'S5: no push waiting, no line');
insert into public.notification_outbox (recipient_id, category, type, title, body, data, dedupe_key, created_at) values
  (:'usr', 'jobs', 'ac_probe', 'Probe', 'Probe ten minutes', '{}'::jsonb, 'ac_probe_10', now() - interval '10 minutes');
select is(tests.ac_line('notification_outbox'), '<none>', 'S6: a push due 10 minutes ago is not stuck yet');
insert into public.notification_outbox (recipient_id, category, type, title, body, data, dedupe_key, created_at) values
  (:'usr', 'jobs', 'ac_probe', 'Probe', 'Probe twenty minutes', '{}'::jsonb, 'ac_probe_20', now() - interval '20 minutes');
select is(tests.ac_line('notification_outbox'), 'push_stuck/developer/' || (now() - interval '20 minutes') || '/notification_outbox: pending rows due for more than 15 minutes | 1 waiting',
  'S7: a push due 20 minutes ago and not sent: one line, since it was due');
insert into public.notification_outbox (recipient_id, category, type, title, body, data, dedupe_key, created_at, send_after) values
  (:'usr', 'nearby_jobs', 'ac_probe', 'Probe', 'Probe quiet hours', '{}'::jsonb, 'ac_probe_quiet', now() - interval '40 minutes', now() + interval '1 hour');
select is(tests.ac_line('notification_outbox'), 'push_stuck/developer/' || (now() - interval '20 minutes') || '/notification_outbox: pending rows due for more than 15 minutes | 1 waiting',
  'S8: a push held for the morning (send_after later) is not stuck');

select * from finish();
rollback;
