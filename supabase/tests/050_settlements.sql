-- 050_settlements.sql — the R5 migration proofs:
-- 20260910000000_settlement_schedules.sql proven before the operator applies
-- it anywhere. Each section is one line of the run's PROOF LEDGER (C-2
-- bullets 1–6); its assertions say which.
--
-- THE CAST (named once; every assertion says which of these it ran as):
--   payer      the customer on both fixture jobs
--   payee      the hired worker on both, and the release notification's
--              recipient
--   stranger   an unrelated, active, authenticated account
--   anon       no session at all
--   service    the service role (set_config role/claims, as R5's cron runs)
--   runner     the connection's own role, RLS bypassed — fixtures, ground
--              truth, and the stand-in for anything the edge functions do
--
-- THE FIXTURE: one job and one provider = 'stripe' payments row written
-- directly by the runner (lean v1 removed the sandbox row's sentence, and
-- with it the sandbox twin). Everything rolls back.
--
-- FIXTURE SURGERY, DECLARED:
--   * the jobs and payments rows are INSERTed by the runner rather than hired
--     through the real RPCs. Nothing in this file proves a lifecycle path —
--     030_payments.sql owns those — and the only trigger these rows are here
--     to fire is payments_notify_release.
--   * schema tests_cron_sim holds a hand-built TWO-OVERLOAD function. It is
--     the local stand-in for pg_cron's cron.schedule, and it exists because
--     the bug this migration corrects is invisible on a one-overload name.
--   * Vault rows are created and removed inside the transaction so the
--     "either secret missing" branch can be walked in all four states. The
--     URL used points at 127.0.0.1:1 and the transaction rolls back before
--     any request could commit to pg_net's queue, so nothing is ever sent.
--
-- pg_cron and pg_net are installed by 20261112000100_schedules_loud.sql
-- (ledger B7). §1 proves the CORRECTED PROBE against a real two-overload
-- function and that the installer schedules on the real extension; §5 proves
-- the three job names and the untouched brazos-drain-push out of the shipped
-- function's own definition. That cron.job holds exactly the expected timers
-- is 331_schedules_loud.sql's to prove.
--
-- PAIRING (C-3): every refusal sits beside the positive control on the same
-- fixture. throws_ok pins code AND message; a null code would pass on a typo
-- in this file's own SQL.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(70);

-- psql does not interpolate :'vars' inside dollar quotes, so ids also live in
-- this temp table for the statements throws_ok/lives_ok execute.
create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated, service_role;

select tests.create_user('r5.payer@brazos.test',    'Pat Payer')     as payer    \gset
select tests.create_user('r5.payee@brazos.test',    'Piper Payee')   as payee    \gset
select tests.create_user('r5.stranger@brazos.test', 'Sam Stranger')  as stranger \gset
insert into fx values ('payer', :'payer'), ('payee', :'payee'), ('stranger', :'stranger');

insert into public.jobs (client_id, title, assigned_worker_id)
values (:'payer', 'R5 stripe release fixture', :'payee') returning id as j_stripe \gset

insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, provider, status)
values (:'j_stripe', :'payer', :'payee', 12000, 0, 'stripe', 'held') returning id as p_stripe \gset
insert into fx values ('p_stripe', :'p_stripe');

-- ---------------------------------------------------------------------------
-- §1. THE CORRECTED GUARD (C-2 bullet 1)
--
-- R4's guard asked the RESOLVER. pg_cron ships cron.schedule with two
-- overloads, to_regproc() answers NULL for an ambiguous name as well as an
-- absent one, and the guard read that NULL as "pg_cron is not installed" on a
-- database that has it. tests_cron_sim reproduces exactly that shape.
-- ---------------------------------------------------------------------------
create schema tests_cron_sim;
create function tests_cron_sim.schedule(p_schedule text, p_command text)
  returns bigint language sql immutable as $sim$ select 1::bigint $sim$;
create function tests_cron_sim.schedule(p_job_name text, p_schedule text, p_command text)
  returns bigint language sql immutable as $sim$ select 2::bigint $sim$;
create function tests_cron_sim.solo(p_only text)
  returns bigint language sql immutable as $sim$ select 3::bigint $sim$;

select is(
  to_regproc('tests_cron_sim.schedule')::text, null,
  '1: runner — THE BUG: to_regproc() answers NULL for a two-overload name, which is what made R4 believe pg_cron was absent'
);
select ok(
  public.pg_function_present('tests_cron_sim', 'schedule'),
  '1: runner — THE FIX: the shipped catalog probe sees the same two-overload function (positive control on the identical fixture)'
);
select isnt(
  to_regproc('tests_cron_sim.solo')::text, null,
  '1: runner — the resolver and the probe agree on a ONE-overload name, so the divergence above is ambiguity and nothing else'
);
select ok(
  public.pg_function_present('tests_cron_sim', 'solo'),
  '1: runner — the probe sees the one-overload name too'
);
select ok(
  not public.pg_function_present('tests_cron_sim', 'never_created'),
  '1: runner — the probe is not merely always-true: an absent name is false'
);
select ok(
  public.pg_function_present('cron', 'schedule'),
  '1: runner — the probe sees the real pg_cron (two cron.schedule overloads), installed by a migration (B7)'
);
select lives_ok(
  $$ select public.install_settlement_schedules() $$,
  '1: runner — the installer runs on the real extension without raising'
);
select is(
  public.install_settlement_schedules(), 'scheduled: 3',
  '1: runner — and it reports its three timers scheduled, never a skip'
);
select is(
  public.install_settlement_schedules(), public.install_settlement_schedules(),
  '1: runner — the installer is idempotent: a second call returns the same outcome'
);

-- ---------------------------------------------------------------------------
-- §2. drain_settlements IS SERVICE-ROLE ONLY (C-2 bullet 2)
-- ---------------------------------------------------------------------------
select ok(
  has_function_privilege('service_role', 'public.drain_settlements()', 'EXECUTE'),
  '2: service_role may execute drain_settlements (positive control)'
);
select ok(
  not has_function_privilege('authenticated', 'public.drain_settlements()', 'EXECUTE'),
  '2: authenticated holds no EXECUTE on drain_settlements'
);
select ok(
  not has_function_privilege('anon', 'public.drain_settlements()', 'EXECUTE'),
  '2: anon holds no EXECUTE on drain_settlements'
);

select tests.authenticate_as(:'stranger');
select throws_ok(
  $$ select public.drain_settlements() $$,
  '42501', 'permission denied for function drain_settlements',
  '2: stranger — an authenticated user cannot wake the settlement drain'
);
select tests.clear_auth();

select tests.authenticate_anon();
select throws_ok(
  $$ select public.drain_settlements() $$,
  '42501', 'permission denied for function drain_settlements',
  '2: anon — nor can a session-less caller'
);
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- §3. drain_settlements REFUSES A HALF-CONFIGURED VAULT (C-2 bullet 3)
--
-- The pairing that matters: it must raise its OWN named exception (P0001, the
-- message it wrote) rather than POSTing to a null URL, and it must stop
-- raising once both secrets are there — otherwise "it always throws" would
-- pass this section without the function ever reading the Vault.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('role', 'service_role', true);
select is(current_user::text, 'service_role', '3: the session is now the service role');
select throws_ok(
  $$ select public.drain_settlements() $$,
  'P0001', 'drain_settlements: vault secrets missing',
  '3: service — neither secret present: the NAMED exception, not a POST to a null URL'
);
select set_config('role', 'none', true);

select throws_ok(
  $$ select public.drain_notification_outbox() $$,
  'P0001', 'drain_notification_outbox: vault secrets missing',
  '3: runner — the baseline function this one was copied from fails the same named way (the reference control)'
);

select vault.create_secret('http://127.0.0.1:1/settlements-proof-never-sent', 'process_settlements_url', 'R5 proof fixture');
select throws_ok(
  $$ select public.drain_settlements() $$,
  'P0001', 'drain_settlements: vault secrets missing',
  '3: runner — the URL alone is not enough: the guard is an OR over BOTH names'
);

-- pg_net is installed (B7), so the satisfied path runs to completion: the
-- Vault lookup finds both secrets, the guard lets the call through, and
-- net.http_post queues a request to 127.0.0.1:1 inside this transaction. The
-- rollback removes it from pg_net's queue before it is ever sent.
create or replace function tests.r5_drain_outcome() returns text language plpgsql as $$
begin
  perform public.drain_settlements();
  return 'ok';
exception when others then
  return sqlstate;
end $$;

select vault.create_secret('proof-service-key-never-used', 'process_settlements_service_key', 'R5 proof fixture');
select isnt(
  tests.r5_drain_outcome(), 'P0001',
  '3: runner — with BOTH secrets present the named guard STOPS refusing, which is what proves the body actually reads the Vault (positive control)'
);
select is(
  tests.r5_drain_outcome(), 'ok',
  '3: runner — and the call reaches net.http_post and returns: pg_net is installed, so the drain completes'
);

delete from vault.secrets where name = 'process_settlements_url';
select throws_ok(
  $$ select public.drain_settlements() $$,
  'P0001', 'drain_settlements: vault secrets missing',
  '3: runner — the key alone is not enough either: the other half of the OR'
);
delete from vault.secrets where name = 'process_settlements_service_key';

-- ---------------------------------------------------------------------------
-- §4. THE RELEASE NOTIFICATION (C-2 bullet 4)
--
-- The one sentence is the one a real worker reads about real money: no
-- amount, no timing (lean v1 removed the sandbox sentence).
-- Everything else about this trigger — when it fires, who it reaches, how it
-- de-duplicates — is asserted UNCHANGED.
-- ---------------------------------------------------------------------------
-- An update that does not reach 'released' must enqueue nothing.
update public.payments set last_error = 'not a release' where id = :'p_stripe';
select is(
  (select count(*) from public.notification_outbox where dedupe_key = 'payment_released:' || :'p_stripe'::text),
  0::bigint,
  '4: runner — an UPDATE that does not move the row to released enqueues nothing (the trigger condition is unchanged)'
);

update public.payments set status = 'released', release_reason = 'approved', released_at = now()
 where id = :'p_stripe';

select is(
  (select body from public.notification_outbox where dedupe_key = 'payment_released:' || :'p_stripe'::text),
  'Your payment has been released and is on its way to your bank.',
  '4: runner — a stripe row tells the worker the money is on its way to their bank'
);
select ok(
  (select body !~ '[0-9]' and body !~ '\$' from public.notification_outbox
    where dedupe_key = 'payment_released:' || :'p_stripe'::text),
  '4: runner — the live sentence carries no digit and no dollar sign: no amount, no timing promise'
);
select is(
  (select recipient_id from public.notification_outbox where dedupe_key = 'payment_released:' || :'p_stripe'::text),
  :'payee'::uuid,
  '4: runner — the recipient is still the PAYEE, not the payer'
);
select is(
  (select count(*) from public.notification_outbox where recipient_id = :'payer' and type = 'payment_released'),
  0::bigint,
  '4: runner — and the payer is not notified (the pair for the assertion above)'
);
select is(
  (select type || '/' || category from public.notification_outbox where dedupe_key = 'payment_released:' || :'p_stripe'::text),
  'payment_released/jobs',
  '4: runner — type and category are the baseline''s'
);
select is(
  (select data ->> 'screen' || ':' || (data ->> 'jobId') from public.notification_outbox
    where dedupe_key = 'payment_released:' || :'p_stripe'::text),
  'WorkerJob:' || :'j_stripe'::text,
  '4: runner — the tap target is unchanged'
);
select is(
  (select title from public.notification_outbox where dedupe_key = 'payment_released:' || :'p_stripe'::text),
  'Your work was approved',
  '4: runner — release_reason = approved keeps its title'
);
select is(
  (select count(*) from public.notification_outbox where dedupe_key = 'payment_released:' || :'p_stripe'::text),
  1::bigint,
  '4: runner — exactly one row: the dedupe key is still payment_released:<payment id>'
);
-- Re-firing the trigger on the same row must not add a second notification.
update public.payments set status = 'held' where id = :'p_stripe';
update public.payments set status = 'released' where id = :'p_stripe';
select is(
  (select count(*) from public.notification_outbox where dedupe_key = 'payment_released:' || :'p_stripe'::text),
  1::bigint,
  '4: runner — a second release of the same row still de-duplicates to one (the key is unchanged and still enforced)'
);
select is(
  (select pg_get_triggerdef(t.oid) from pg_trigger t
    where t.tgrelid = 'public.payments'::regclass and t.tgname = 'payments_notify_release'),
  'CREATE TRIGGER payments_notify_release AFTER UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION notify_on_payment_release()',
  '4: runner — the trigger itself is byte-for-byte the baseline''s: AFTER UPDATE, FOR EACH ROW, same function'
);
select ok(
  pg_get_functiondef('public.notify_on_payment_release()'::regprocedure) like '%new.kind = ''job_payment''%',
  '4: runner — the kind guard is still in the body, so tips do not notify'
);
select ok(
  pg_get_functiondef('public.notify_on_payment_release()'::regprocedure) like '%''payment_released:'' || new.id::text%',
  '4: runner — the dedupe key expression is unchanged in the shipped body'
);

-- ---------------------------------------------------------------------------
-- §5. EXACTLY THREE SCHEDULES, AND brazos-drain-push IS NOT ONE (C-2 bullet 5)
--
-- The shipped installer's own definition says which names it creates; that
-- cron.job holds exactly those (and the other installers' timers) is
-- 331_schedules_loud.sql's to prove.
-- ---------------------------------------------------------------------------
select ok(
  pg_get_functiondef('public.install_settlement_schedules()'::regprocedure) like '%install_settlement_schedules%',
  '5: runner — pg_get_functiondef returns the real shipped body (positive control for the five assertions below)'
);
select is(
  (select count(*) from regexp_matches(
     pg_get_functiondef('public.install_settlement_schedules()'::regprocedure), 'cron\.schedule\(', 'g')),
  3::bigint,
  '5: runner — the installer calls cron.schedule exactly three times'
);
select ok(
  pg_get_functiondef('public.install_settlement_schedules()'::regprocedure) like '%''auto-release-due-payments'', ''*/10 * * * *''%',
  '5: runner — auto-release-due-payments, every 10 minutes'
);
select ok(
  pg_get_functiondef('public.install_settlement_schedules()'::regprocedure) like '%''expire-unfunded-payments'', ''*/15 * * * *''%',
  '5: runner — expire-unfunded-payments, every 15 minutes'
);
select ok(
  pg_get_functiondef('public.install_settlement_schedules()'::regprocedure) like '%''brazos-process-settlements'', ''*/5 * * * *''%',
  '5: runner — brazos-process-settlements, every 5 minutes'
);
select ok(
  pg_get_functiondef('public.install_settlement_schedules()'::regprocedure) not like '%brazos-drain-push%',
  '5: runner — brazos-drain-push is not named anywhere in the installer, so nothing here can unschedule or replace it'
);
select ok(
  pg_get_functiondef('public.install_settlement_schedules()'::regprocedure) like '%cron.unschedule(v_stale)%',
  '5: runner — each of its own names is unscheduled by jobid first, so re-applying cannot fail on a duplicate'
);
-- The three functions the schedules call must exist and be reachable by the
-- role cron runs as, or the timers would fire into nothing.
select ok(has_function_privilege('service_role', 'public.auto_release_due_payments()', 'EXECUTE'),
  '5: service_role may execute auto_release_due_payments (the 10-minute timer has something to call)');
select ok(has_function_privilege('service_role', 'public.expire_unfunded_payments()', 'EXECUTE'),
  '5: service_role may execute expire_unfunded_payments (the 15-minute timer)');
select ok(has_function_privilege('service_role', 'public.drain_settlements()', 'EXECUTE'),
  '5: service_role may execute drain_settlements (the 5-minute timer)');

-- ---------------------------------------------------------------------------
-- §6. THE CUSTOMER REFERENCE IS NOT CLIENT-WRITABLE (C-2 bullet 6)
--
-- It lives on public.payment_accounts.stripe_customer_id. 030_payments.sql §14
-- already proves that table is unreachable by anon and authenticated; this
-- section proves the two NEW functions did not open a door beside it, and that
-- the service-role path actually reads and writes.
-- ---------------------------------------------------------------------------
select ok(has_function_privilege('service_role', 'public.get_payment_customer(uuid)', 'EXECUTE'),
  '6: service_role may execute get_payment_customer (positive control)');
select ok(has_function_privilege('service_role', 'public.set_payment_customer(uuid, text)', 'EXECUTE'),
  '6: service_role may execute set_payment_customer (positive control)');
select ok(not has_function_privilege('authenticated', 'public.get_payment_customer(uuid)', 'EXECUTE'),
  '6: authenticated holds no EXECUTE on get_payment_customer');
select ok(not has_function_privilege('authenticated', 'public.set_payment_customer(uuid, text)', 'EXECUTE'),
  '6: authenticated holds no EXECUTE on set_payment_customer');
select ok(not has_function_privilege('anon', 'public.get_payment_customer(uuid)', 'EXECUTE'),
  '6: anon holds no EXECUTE on get_payment_customer');
select ok(not has_function_privilege('anon', 'public.set_payment_customer(uuid, text)', 'EXECUTE'),
  '6: anon holds no EXECUTE on set_payment_customer');
select ok(not has_table_privilege('authenticated', 'public.payment_accounts', 'INSERT'),
  '6: authenticated has no INSERT on payment_accounts (unchanged from 030 §14)');
select ok(not has_table_privilege('authenticated', 'public.payment_accounts', 'UPDATE'),
  '6: authenticated has no UPDATE on payment_accounts (unchanged from 030 §14)');
select ok(not has_table_privilege('authenticated', 'public.payment_accounts', 'SELECT'),
  '6: authenticated has no SELECT on payment_accounts (unchanged from 030 §14)');
select ok(not has_table_privilege('anon', 'public.payment_accounts', 'SELECT'),
  '6: anon has no SELECT on payment_accounts (unchanged from 030 §14)');
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'payment_accounts'),
  '6: RLS is still enabled on payment_accounts'
);
select is(
  (select count(*) from pg_policy p where p.polrelid = 'public.payment_accounts'::regclass),
  0::bigint,
  '6: and it still carries NO policies, so no client role can reach it even if a grant were ever added by accident'
);

select tests.authenticate_as(:'stranger');
select throws_ok(
  $$ select public.get_payment_customer((select v from fx where k = 'payer')) $$,
  '42501', 'permission denied for function get_payment_customer',
  '6: stranger — an authenticated user cannot read another user''s provider customer id'
);
select throws_ok(
  $$ select public.set_payment_customer((select v from fx where k = 'stranger'), 'cus_forged') $$,
  '42501', 'permission denied for function set_payment_customer',
  '6: stranger — nor write their OWN, which is the write this run had to keep out of client hands'
);
select throws_ok(
  $$ insert into public.payment_accounts (user_id, stripe_customer_id)
     values ((select v from fx where k = 'stranger'), 'cus_forged') $$,
  '42501', 'permission denied for table payment_accounts',
  '6: stranger — and cannot reach the column directly either'
);
select throws_ok(
  $$ update public.payment_accounts set stripe_customer_id = 'cus_forged' $$,
  '42501', 'permission denied for table payment_accounts',
  '6: stranger — nor UPDATE it'
);
select tests.clear_auth();

select tests.authenticate_anon();
select throws_ok(
  $$ select public.set_payment_customer((select v from fx where k = 'payer'), 'cus_forged') $$,
  '42501', 'permission denied for function set_payment_customer',
  '6: anon — a session-less caller is refused the same way'
);
select throws_ok(
  $$ select stripe_customer_id from public.payment_accounts $$,
  '42501', 'permission denied for table payment_accounts',
  '6: anon — and cannot read the table'
);
select tests.clear_auth();

-- The positive control: the service-role path this run's edge function uses.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('role', 'service_role', true);
select is(
  public.get_payment_customer((select v from fx where k = 'payer')), null,
  '6: service — a user with no stored reference reads back null (so create-payment knows to create one)'
);
select is(
  public.set_payment_customer((select v from fx where k = 'payer'), 'cus_r5_first'), 'cus_r5_first',
  '6: service — the first write stores the reference and returns it'
);
select is(
  public.get_payment_customer((select v from fx where k = 'payer')), 'cus_r5_first',
  '6: service — and it reads back durably (the whole reason a stored reference exists)'
);
select is(
  public.set_payment_customer((select v from fx where k = 'payer'), 'cus_r5_second'), 'cus_r5_first',
  '6: service — FIRST WRITER WINS: a racing second write returns the stored id, never overwrites it'
);
select is(
  public.get_payment_customer((select v from fx where k = 'payer')), 'cus_r5_first',
  '6: service — and the stored id is still the first one'
);
select throws_ok(
  $$ select public.set_payment_customer((select v from fx where k = 'payee'), '') $$,
  'P0001', 'set_payment_customer: user id and customer id are required',
  '6: service — an empty customer id is refused by name rather than stored'
);
select is(
  public.get_payment_customer((select v from fx where k = 'payee')), null,
  '6: service — and that refusal wrote nothing (the pair for the assertion above)'
);
select set_config('role', 'none', true);

select is(
  (select count(*) from public.payment_accounts where user_id = (select v from fx where k = 'payer')),
  1::bigint,
  '6: runner — exactly one payment_accounts row for the user, whatever the write path did'
);

select * from finish();
rollback;
