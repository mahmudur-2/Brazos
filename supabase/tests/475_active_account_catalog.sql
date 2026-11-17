-- 475_active_account_catalog.sql — production-36h S1, M2: active_account_rule's written rules
-- (S4-07, A4) proven against the live catalog, each with its red controls in the same query.
--
-- No people: this file reads the catalog. The red controls are functions and tables made inside
-- this transaction (schema m2_red, tables public.m2_red_t*), so the checker is seen refusing each
-- shape it must refuse, in the same query that passes the real catalog. Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(14);

-- ---------------------------------------------------------------------------
-- The red controls: one function per shape the guard rule must refuse, and two that must pass.
-- ---------------------------------------------------------------------------
create schema m2_red;

create function m2_red.red_plpgsql_guard_second() returns void language plpgsql as $f$
begin
  perform 1;
  perform public.require_active_caller();
end
$f$;

create function m2_red.red_plpgsql_guard_nested() returns void language plpgsql as $f$
begin
  begin
    perform public.require_active_caller();
  end;
end
$f$;

create function m2_red.red_plpgsql_no_guard() returns void language plpgsql as $f$
begin
  perform 1;
end
$f$;

create function m2_red.red_plpgsql_begin_in_string() returns void language plpgsql as $f$
declare
  v text := '
begin
  perform public.require_active_caller();
';
begin
  perform 1;
end
$f$;

create function m2_red.red_plpgsql_declare_query() returns void language plpgsql as $f$
declare
  v bigint := (select count(*) from public.jobs);
begin
  perform public.require_active_caller();
end
$f$;

create function m2_red.red_plpgsql_declare_call() returns void language plpgsql as $f$
declare
  v boolean := public.is_active_user();
begin
  perform public.require_active_caller();
end
$f$;

create function m2_red.red_default_names_public(p boolean default public.is_active_user()) returns void language plpgsql as $f$
begin
  perform public.require_active_caller();
end
$f$;

create function m2_red.red_sql_guard_second() returns void language sql as $f$
select 1;
select public.require_active_caller();
$f$;

create function m2_red.red_sql_standard_body() returns void language sql
begin atomic
  select public.require_active_caller();
end;

-- A8-06: comments do not count. The guard and a "begin" inside a block comment, the real BEGIN with a
-- statement on its line.
create function m2_red.red_plpgsql_guard_in_comment() returns void language plpgsql as $f$
/*
begin
  perform public.require_active_caller();
*/
BEGIN perform 1;
  perform public.require_active_caller();
end
$f$;

-- A8-06: a comment mark inside a quoted text is text. Read without the quotes, the '/*' ... '*/' pair
-- would hide the real BEGIN line and its statement.
create function m2_red.red_plpgsql_comment_mark_in_string() returns void language plpgsql as $f$
declare
  v text := '/*';
begin perform 1; v := '*/
begin
  perform public.require_active_caller();
end;';
end
$f$;

create function m2_red.ok_plpgsql() returns void language plpgsql as $f$
declare
  v_uid uuid := auth.uid();
  v_at timestamptz := now();
begin
  perform public.require_active_caller();
  perform 1;
end
$f$;

-- A8-06: comments on the begin line, after the guard and in the declare part do not count.
create function m2_red.ok_commented_plpgsql() returns void language plpgsql as $f$
declare
  -- select, perform and begin in a comment are not code
  v_uid uuid := auth.uid(); /* public.is_active_user() */
begin -- the guard comes first
  perform public.require_active_caller(); -- nothing before it
  perform 1;
end
$f$;

create function m2_red.ok_sql() returns void language sql as $f$
select public.require_active_caller();
select 1;
$f$;

-- ---------------------------------------------------------------------------
-- 1. The guard is the first statement: the real catalog and the red controls, one query.
-- ---------------------------------------------------------------------------
select is(
  (select string_agg(x.fn || ' = ' || coalesce(x.problem, 'ok'), '; ' order by x.fn)
     from (
       -- every client-executable definer function that is not exempt, listed only when it fails
       select p.oid::regprocedure::text as fn, public.active_guard_problem(p.oid) as problem
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'graphql_public')
         and p.prosecdef
         and has_function_privilege('authenticated', p.oid, 'execute')
         and p.oid <> all (array[
               'public.current_user_is_banned()', 'public.account_deletion_blockers()', 'public.delete_my_account()',
               'public.is_profile_active(uuid)', 'public.is_active_user()', 'public.can_delete_own_job(uuid)',
               'public.messaging_unlocked(uuid,uuid)', 'public.review_is_revealed(uuid,uuid,uuid,timestamp with time zone)',
               'public.current_user_is_admin()', 'public.profile_visible(uuid)', 'public.release_due_at(public.jobs)'
             ]::regprocedure[]::oid[])
         and public.active_guard_problem(p.oid) is not null
       union all
       -- the red and the positive controls, every one listed
       select p.oid::regprocedure::text, public.active_guard_problem(p.oid)
       from pg_catalog.pg_proc p
       where p.pronamespace = 'm2_red'::regnamespace
     ) x),
  'm2_red.ok_commented_plpgsql() = ok; '
  'm2_red.ok_plpgsql() = ok; '
  'm2_red.ok_sql() = ok; '
  'm2_red.red_default_names_public(boolean) = an argument default holds a query or names public; '
  'm2_red.red_plpgsql_begin_in_string() = no single outer begin line; '
  'm2_red.red_plpgsql_comment_mark_in_string() = the declare part holds a query, a perform or another begin; '
  'm2_red.red_plpgsql_declare_call() = the declare part calls public.is_active_user; '
  'm2_red.red_plpgsql_declare_query() = the declare part holds a query, a perform or another begin; '
  'm2_red.red_plpgsql_guard_in_comment() = no single outer begin line; '
  'm2_red.red_plpgsql_guard_nested() = the guard is not the first statement; '
  'm2_red.red_plpgsql_guard_second() = the guard is not the first statement; '
  'm2_red.red_plpgsql_no_guard() = the guard is not the first statement; '
  'm2_red.red_sql_guard_second() = the guard is not the first statement; '
  'm2_red.red_sql_standard_body() = the guard is not the first statement',
  '1a: S4-07, A8-06: every client-executable definer function has the guard first, comments not counted; each red control is refused for its own reason, the three positive controls pass'
);

-- ---------------------------------------------------------------------------
-- 2. The exempt list, pinned by full signature: exactly these, and each still a client door.
-- ---------------------------------------------------------------------------
select is(
  (select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'graphql_public')
      and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'execute')
      and public.active_guard_problem(p.oid) is not null),
  'account_deletion_blockers(), can_delete_own_job(uuid), current_user_is_admin(), current_user_is_banned(), '
  'delete_my_account(), is_active_user(), is_profile_active(uuid), messaging_unlocked(uuid,uuid), '
  'profile_visible(uuid), release_due_at(jobs), review_is_revealed(uuid,uuid,uuid,timestamp with time zone)',
  '2a: S4-07: the client-executable definer functions without the guard first are exactly the eleven exempt ones (release_clock''s computed field release_due_at, which raises nothing, is the eleventh)'
);
-- A14-F F1: the guard's own catalog comment names the count 2a proves. Red control: the comment
-- before A14-F ("except the exempt ten") gives null.
select is(
  substring(obj_description('public.require_active_caller()'::regprocedure, 'pg_proc') from 'except the ([a-z]+) exempt ones'),
  'eleven',
  '2b: the guard''s comment says what 2a proves: eleven exempt functions'
);

-- ---------------------------------------------------------------------------
-- 3. Every table right has its restrictive active-account policy: the real catalog and red tables.
-- ---------------------------------------------------------------------------
create table public.m2_red_t1 (id integer);
revoke all on public.m2_red_t1 from public, anon, authenticated, service_role;
alter table public.m2_red_t1 enable row level security;
create policy m2_red_t1_open on public.m2_red_t1 for select to authenticated using (true);
grant select on public.m2_red_t1 to authenticated;

create table public.m2_red_t2 (id integer);
revoke all on public.m2_red_t2 from public, anon, authenticated, service_role;
grant insert (id) on public.m2_red_t2 to authenticated;

create table public.m2_red_t3 (id integer);
revoke all on public.m2_red_t3 from public, anon, authenticated, service_role;
alter table public.m2_red_t3 enable row level security;
create policy m2_red_t3_open on public.m2_red_t3 for select to authenticated using (true);
create policy m2_red_t3_active on public.m2_red_t3 as restrictive for select to authenticated
  using ((select public.is_active_user()));
grant select on public.m2_red_t3 to authenticated;

select is(
  (select string_agg(t.rel || ' ' || t.cmd, ', ' order by t.rel, t.cmd)
     from (
       select c.oid, c.oid::regclass::text as rel, c.relrowsecurity, cmd.cmd
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as cmd(cmd)
       where c.relkind in ('r', 'p')
         and (n.nspname = 'public' or c.oid = 'storage.objects'::regclass)
         and c.oid <> 'public.app_config'::regclass
         and (has_table_privilege('authenticated', c.oid, cmd.cmd)
              or (cmd.cmd <> 'DELETE' and has_any_column_privilege('authenticated', c.oid, cmd.cmd)))
     ) t
    where not t.relrowsecurity
       or not exists (
         select 1
         from pg_catalog.pg_policy pol
         where pol.polrelid = t.oid
           and not pol.polpermissive
           and pol.polcmd in ('*', case t.cmd when 'SELECT' then 'r' when 'INSERT' then 'a' when 'UPDATE' then 'w' else 'd' end)
           and (pol.polroles = array[0::oid] or 'authenticated'::regrole::oid = any (pol.polroles))
           and coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
               ~ 'is_active_user\(\)'
       )),
  'm2_red_t1 SELECT, m2_red_t2 INSERT',
  '3a: S4-07: every (table, command) a signed-in client holds has a restrictive policy calling is_active_user(); the two red tables (a permissive policy only; no row security) are the only ones listed'
);

select is(
  (select count(*) from pg_catalog.pg_policy pol
    where pol.polname like '%\_active\_%' and not pol.polpermissive
      and coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
          ~ 'is_active_user\(\)'
      and (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
          !~ '^\(*\( SELECT is_active_user\(\) AS is_active_user\)'),
  0::bigint,
  '3b: D9: every active-account policy asks is_active_user() as an InitPlan, (select ...), once per policy occurrence'
);
select cmp_ok(
  (select count(*) from pg_catalog.pg_policy pol where pol.polname like '%\_active\_%' and not pol.polpermissive
     and coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
         ~ 'is_active_user\(\)'),
  '>=', 40::bigint,
  '3c: and there are at least the 40 the rule wrote (guard against an empty pass of 3b)'
);

-- ---------------------------------------------------------------------------
-- 4. function_shape(): every column but the body. A red control for each kind of change.
-- ---------------------------------------------------------------------------
create function m2_red.shape_probe() returns integer language sql volatile as $f$ select 1 $f$;
create temp table shapes (k text primary key, s jsonb);
insert into shapes values ('a', public.function_shape('m2_red.shape_probe()'::regprocedure));
insert into shapes values ('a_again', public.function_shape('m2_red.shape_probe()'::regprocedure));
create or replace function m2_red.shape_probe() returns integer language sql volatile as $f$ select 2 $f$;
insert into shapes values ('body', public.function_shape('m2_red.shape_probe()'::regprocedure));
alter function m2_red.shape_probe() stable;
insert into shapes values ('volatility', public.function_shape('m2_red.shape_probe()'::regprocedure));
grant execute on function m2_red.shape_probe() to authenticated;
insert into shapes values ('grant', public.function_shape('m2_red.shape_probe()'::regprocedure));
comment on function m2_red.shape_probe() is 'm2 red control';
insert into shapes values ('comment', public.function_shape('m2_red.shape_probe()'::regprocedure));
alter function m2_red.shape_probe() security definer;
insert into shapes values ('definer', public.function_shape('m2_red.shape_probe()'::regprocedure));
alter function m2_red.shape_probe() set search_path = public, pg_temp;
insert into shapes values ('settings', public.function_shape('m2_red.shape_probe()'::regprocedure));
select is(
  (select row(
     (select s from shapes where k = 'a') = (select s from shapes where k = 'a_again'),
     (select s from shapes where k = 'a') = (select s from shapes where k = 'body'),
     (select s from shapes where k = 'body') <> (select s from shapes where k = 'volatility'),
     (select s from shapes where k = 'volatility') <> (select s from shapes where k = 'grant'),
     (select s from shapes where k = 'grant') <> (select s from shapes where k = 'comment'),
     (select s from shapes where k = 'comment') <> (select s from shapes where k = 'definer'),
     (select s from shapes where k = 'definer') <> (select s from shapes where k = 'settings'))),
  row(true, true, true, true, true, true, true),
  '4a: S4-07: function_shape() is blind to the body only: volatility, grants, comment, security and settings each change it'
);

-- ---------------------------------------------------------------------------
-- 5. The rule's own helpers are no client's door.
-- ---------------------------------------------------------------------------
select is(
  (select string_agg(f || ':' || r, ', ' order by f, r)
     from unnest(array['public.require_active_caller()', 'public.function_shape(oid)', 'public.active_guard_problem(oid)',
                       'public.function_fingerprint(regprocedure)',
                       'public.caller_is_trusted_active()', 'public.cancel_job_core(uuid,text,uuid)',
                       'public.settle_offers_of_suspended(uuid)', 'public.notify_admins(text,text,text,jsonb,text)']) f
     cross join unnest(array['anon', 'authenticated']) r
    where to_regprocedure(f) is null or has_function_privilege(r, to_regprocedure(f), 'execute')),
  null,
  '5a: no client may call the guard, the catalog helpers, the trust helper, the cancel core, the offer settler or notify_admins'
);

-- The functions the money list and the lifecycle lane made new (attention_plain, release_clock,
-- unpaid_pause, trip_day, post_window), each classified: release_due_at(jobs) is the one a signed-in
-- client may call, and it is exempt (2a); every other one is no client's door, so the guard rule
-- does not reach it. The money lane's M2 files (money_timers ... refund_owed, 20261116290000 ...
-- 20261116300500) make or restate payment_attention_codes() and the thirteen listed after
-- refuse_offer_after_window(), each the server's own (service role) or a definer function's helper:
-- no client's door either.
-- The red control, m2_red.ok_sql() (default rights: every role), is listed.
select is(
  (select string_agg(f || ':' || r, ', ' order by f, r)
     from unnest(array['public.payment_attention_codes()', 'public.record_timer_run(text,text,interval)',
                       'public.auto_approval_deadline(uuid)', 'public.fill_completion_told_at()',
                       'public.report_timer_run(text,interval)', 'public.stamp_completion_told()',
                       'public.app_config_touch()', 'public.job_day_reached(date,timestamp with time zone)',
                       'public.require_work_money(uuid)', 'public.job_window_over(date,smallint,timestamp with time zone)',
                       'public.posting_paused()', 'public.refuse_offer_after_window()',
                       'public.expire_unfunded_payments()', 'public.prune_payment_event_payloads(interval)',
                       'public.payment_attention_more()', 'public.record_intent_check(uuid,text)',
                       'public.record_settlement_result(uuid,text,integer,text,text)', 'public.set_payouts_status(uuid,text)',
                       'public.record_payout_check(uuid,timestamp with time zone,text,text)', 'public.note_ready_rows()',
                       'public.record_event_scan(bigint,bigint)', 'public.clear_event_scan_gap(bigint,text)',
                       'public.settlement_send_begin(uuid,text,integer,integer)',
                       'public.record_settlement_sent(uuid,text,text,integer)', 'public.payment_refund_owed(public.payments)',
                       'm2_red.ok_sql()']) f
     cross join unnest(array['anon', 'authenticated']) r
    where to_regprocedure(f) is null or has_function_privilege(r, to_regprocedure(f), 'execute')),
  'm2_red.ok_sql():anon, m2_red.ok_sql():authenticated',
  '5b: the money list''s, the lifecycle lane''s and the money lane''s M2 new functions are no client''s door, release_due_at(jobs) aside (exempt, 2a); the red control is listed'
);

-- ---------------------------------------------------------------------------
-- 6. A8-06: every function the access lane writes on purpose (ban_switch, ban_hides_content,
--    report_push, active_account_rule, account_deletion_process), pinned by function_fingerprint()
--    (ban_switch 0b): body, settings and shape (arguments with their defaults, result, language,
--    kind, security, leakproof, strict, set-returning, volatility, parallel), read from the catalog,
--    so the same on every session and server (6c, 6d, 6e). The 45 guard-only functions are proven by
--    active_account_rule's own proof (8a). A change to one of these fails here until its pin is
--    changed on purpose; the list names each with the fingerprint found.
-- ---------------------------------------------------------------------------
create temp table access_pins (sig text primary key, md5 text not null);
insert into access_pins values
  ('public.function_fingerprint(regprocedure)',                             'fd64cb2021be3de314c8008d7b5cb8b8'),
  ('public.current_user_is_admin()',                                        '6c71766b79b7fdd5d0dc522537805df0'),
  ('public.cancel_job_core(uuid,text,uuid)',                                '879144cfc4023e606a4addb23d68c65b'),
  ('public.cancel_job(uuid,text)',                                          '62ec149684acf7fa8534c18c250de4b9'),
  ('public.lock_account(uuid,boolean)',                                     'a1c2ed239cd56f2d35bf397241fc1c6f'),
  ('public.settle_offers_of_suspended(uuid)',                               'e15a8efe490ecc4729398b92654f151d'),
  ('public.ban_user(uuid,uuid)',                                            '770725f8d7acb99d6155cb156b5268ec'),
  ('public.unban_user(uuid)',                                               '385ed3ae350a20cb7d97d321f6d1719b'),
  ('public.my_pending_offers()',                                            'cbef43ad1a9726805d90dc246a53df78'),
  ('public.admin_open_reports_v2()',                                        '6b847d0af3af8406771f3bfafaf2d22b'),
  ('public.dismiss_report(uuid)',                                           '275f8d8bd29630b6bd07ef9dacaee1de'),
  ('public.repair_suspended_jobs()',                                        'ea32121f5b7b452f92813786946d7f30'),
  ('public.caller_is_trusted_active()',                                     '054814392f5f982dc2454900380293ad'),
  ('public.is_profile_active(uuid)',                                        '021ad44878d564ce695e82cbd5ae66da'),
  ('public.messaging_unlocked(uuid,uuid)',                                  '099488b517f95bacee63d6240f4deafe'),
  ('public.profile_visible(uuid)',                                          '7074dcb8ca593cc2f60f8819e4839a4e'),
  ('public.review_is_revealed(uuid,uuid,uuid,timestamp with time zone)',    'f8ca671dbb4525bbd2f64973fb0d692f'),
  ('public.notify_admins(text,text,text,jsonb,text)',                       '7cb457548415cf00dc72f7f108b9cac6'),
  ('public.notify_admins_on_report()',                                      'b6861ce3eca9dc326e47b07e9e267751'),
  ('public.require_active_caller()',                                        '30e636892f99acbda1a21cf6c235a037'),
  ('public.admit_user_call(uuid,text,integer,interval,boolean)',            '4b97cc045948e7966d7e085e944e37fe'),
  ('public.claim_notification_batch(integer)',                              '87a67fcce489158c672582ae5fa97475'),
  ('public.function_shape(oid)',                                            'a2ee5820ad07e1e9be9a979e0865c4d4'),
  ('public.active_guard_problem(oid)',                                      '6175984aa9ba32e8b34fdad4d948d3f1'),
  ('public.accept_offer(uuid)',                                             '7801670a56324bdc11f2cc3727b6bd48'),
  ('public.counter_offer(uuid,integer)',                                    'bc49e2216f04e02a7faf2dae2a48cb9f'),
  ('public.begin_job_payment(uuid)',                                        'bae39f75a789b2a545dae111cebbe961'),
  ('public.begin_tip_payment(uuid,integer)',                                '7f91c1297c67364dcafd183a61f2496b'),
  ('public.account_cleanup_guard()',                                        '82e6c268b146873ea3bec3520af00570'),
  ('public.payment_unsettled_for(public.payments,uuid)',                    '703bbb657a2d18f9c9065c444c26b649'),
  ('public.account_deletion_blockers()',                                    'b2d99a0b5d82caa08c1718505583954c'),
  ('public.delete_my_account()',                                            '6b2f3f2edf774b58a360230e77721262'),
  ('public.claim_account_cleanups(integer)',                                '38c19cbd9e08d261f9634b28101e0ab8'),
  ('public.record_account_cleanup(uuid,boolean,text)',                      'd50d86621a0ecfb4f36cd339b921aa68'),
  ('public.set_payment_customer(uuid,text)',                                '016debb8b327dbd955633cb2695c635a');

create function pg_temp.access_pins_broken() returns text language sql as $f$
  select string_agg(a.sig || ' found=' || coalesce(public.function_fingerprint(to_regprocedure(a.sig)), 'none'),
                    ', ' order by a.sig)
  from access_pins a
  where to_regprocedure(a.sig) is null
     or public.function_fingerprint(to_regprocedure(a.sig)) is distinct from a.md5
$f$;

select is(
  (select count(*) || ' pinned; broken: ' || coalesce(pg_temp.access_pins_broken(), 'none') from access_pins),
  '35 pinned; broken: none',
  '6a: A8-06: each of the 35 functions the access lane writes on purpose (the fingerprint helper included) has the definition (body, settings, shape) it was reviewed with'
);

-- The red control: one setting added to begin_tip_payment, its body untouched, is named.
alter function public.begin_tip_payment(uuid, integer) set statement_timeout = '1s';
select is(
  pg_temp.access_pins_broken(),
  'public.begin_tip_payment(uuid,integer) found='
    || public.function_fingerprint('public.begin_tip_payment(uuid,integer)'::regprocedure),
  '6b: A8-06: red control: a setting added to begin_tip_payment (its body unchanged) breaks its pin, named with the fingerprint found'
);

-- 6c. The session's search_path does not change the fingerprint. cancel_job returns public.jobs and
--     payment_unsettled_for takes a public.payments: pg_get_functiondef prints each type with its schema
--     only when the session's search_path does not reach it, so its md5 differs between the two
--     sessions (the red control, in the same row).
create temp table fp_paths (k text primary key, fp_cancel text, fp_unsettled text, def_cancel text, def_unsettled text);
set local search_path = '';
insert into pg_temp.fp_paths
  select 'empty',
         public.function_fingerprint('public.cancel_job(uuid,text)'::pg_catalog.regprocedure),
         public.function_fingerprint('public.payment_unsettled_for(public.payments,uuid)'::pg_catalog.regprocedure),
         pg_catalog.md5(pg_catalog.pg_get_functiondef('public.cancel_job(uuid,text)'::pg_catalog.regprocedure)),
         pg_catalog.md5(pg_catalog.pg_get_functiondef('public.payment_unsettled_for(public.payments,uuid)'::pg_catalog.regprocedure));
set local search_path = public;
insert into pg_temp.fp_paths
  select 'public',
         public.function_fingerprint('public.cancel_job(uuid,text)'::regprocedure),
         public.function_fingerprint('public.payment_unsettled_for(public.payments,uuid)'::regprocedure),
         md5(pg_get_functiondef('public.cancel_job(uuid,text)'::regprocedure)),
         md5(pg_get_functiondef('public.payment_unsettled_for(public.payments,uuid)'::regprocedure));
set local search_path = public, extensions, pg_temp;
select is(
  (select row(e.fp_cancel = p.fp_cancel, e.fp_unsettled = p.fp_unsettled,
              e.def_cancel <> p.def_cancel, e.def_unsettled <> p.def_unsettled)
     from fp_paths e, fp_paths p where e.k = 'empty' and p.k = 'public'),
  row(true, true, true, true),
  '6c: the fingerprint of a function with a public type in its result or its arguments is the same under search_path '''' and public; md5 of pg_get_functiondef differs (red control)'
);

-- 6d. Line ends do not change the fingerprint: the same body with LF and with CRLF. md5 of
--     pg_get_functiondef differs (the red control, in the same row).
create temp table fp_eol (k text primary key, fp text, def text);
create function m2_red.fp_eol() returns integer language sql as E'\nselect 1;\n';
insert into fp_eol values ('lf', public.function_fingerprint('m2_red.fp_eol()'::regprocedure),
                                md5(pg_get_functiondef('m2_red.fp_eol()'::regprocedure)));
create or replace function m2_red.fp_eol() returns integer language sql as E'\r\nselect 1;\r\n';
insert into fp_eol values ('crlf', public.function_fingerprint('m2_red.fp_eol()'::regprocedure),
                                  md5(pg_get_functiondef('m2_red.fp_eol()'::regprocedure)));
select is(
  (select row(l.fp = c.fp, l.def <> c.def) from fp_eol l, fp_eol c where l.k = 'lf' and c.k = 'crlf'),
  row(true, true),
  '6d: the same body with LF and with CRLF has one fingerprint; md5 of pg_get_functiondef differs (red control)'
);

-- 6e. Each of these changes the fingerprint: the body, one added setting, security definer,
--     volatility, strict, an argument default, the result type. Each probe differs from fp_base in
--     that one thing only; fp_same differs only by its name, which is not part of the fingerprint.
create function m2_red.fp_base(p integer) returns integer language sql volatile as $f$ select p $f$;
create function m2_red.fp_same(p integer) returns integer language sql volatile as $f$ select p $f$;
create function m2_red.fp_body(p integer) returns integer language sql volatile as $f$ select p + 1 $f$;
create function m2_red.fp_setting(p integer) returns integer language sql volatile set statement_timeout = '1s' as $f$ select p $f$;
create function m2_red.fp_definer(p integer) returns integer language sql volatile security definer as $f$ select p $f$;
create function m2_red.fp_volatility(p integer) returns integer language sql stable as $f$ select p $f$;
create function m2_red.fp_strict(p integer) returns integer language sql volatile strict as $f$ select p $f$;
create function m2_red.fp_default(p integer default 1) returns integer language sql volatile as $f$ select p $f$;
create function m2_red.fp_result(p integer) returns bigint language sql volatile as $f$ select p $f$;
select is(
  (select row(b = public.function_fingerprint('m2_red.fp_same(integer)'::regprocedure),
              b <> public.function_fingerprint('m2_red.fp_body(integer)'::regprocedure),
              b <> public.function_fingerprint('m2_red.fp_setting(integer)'::regprocedure),
              b <> public.function_fingerprint('m2_red.fp_definer(integer)'::regprocedure),
              b <> public.function_fingerprint('m2_red.fp_volatility(integer)'::regprocedure),
              b <> public.function_fingerprint('m2_red.fp_strict(integer)'::regprocedure),
              b <> public.function_fingerprint('m2_red.fp_default(integer)'::regprocedure),
              b <> public.function_fingerprint('m2_red.fp_result(integer)'::regprocedure))
     from (select public.function_fingerprint('m2_red.fp_base(integer)'::regprocedure) as b) x),
  row(true, true, true, true, true, true, true, true),
  '6e: the body, a setting, security definer, volatility, strict, an argument default and the result type each change the fingerprint; the name alone does not'
);

select * from finish();
rollback;
