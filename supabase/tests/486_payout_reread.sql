-- 486_payout_reread.sql — money M2-3b (R-E, the hourly payout re-read): payout_reread. Which payout
-- accounts the drain reads again and in which order (payout_accounts_due), the 1-hour gate, and what
-- one read records (record_payout_check): a state only while nobody else recorded one during the read,
-- a stamp on every read, nothing for a read that proved nothing. The drain's side (the request, the
-- reading, the 10 a run) is tests/settlementRun.test.mjs.
--
-- THE CAST: a customer; workers W1 (payouts off, a payout waiting), W2 (payouts off, nothing
-- waiting), W3 (payouts on, a payout waiting that Stripe refused), W4 (payouts on, a payout waiting,
-- no refusal), W5 (payouts off, a payout waiting, then banned), W6 (payouts off, a payout waiting,
-- never read); an admin; the runner (RLS bypassed; the drain's and connect-status's stand-in).
-- FIXTURE SURGERY, DECLARED (now() is fixed inside a transaction): payment_accounts.payouts_checked_at
-- is moved back or set to null (never read), payout_account_checks.tried_at is moved back 59 or 61
-- minutes; profiles.is_admin for the admin (as 480 does); rate_counters reset before each hire (as
-- 370 does). Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(30);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('pr.customer@brazos.test', 'Pia Customer') as customer \gset
select tests.create_user('pr.w1@brazos.test', 'Pat One') as w1 \gset
select tests.create_user('pr.w2@brazos.test', 'Pat Two') as w2 \gset
select tests.create_user('pr.w3@brazos.test', 'Pat Three') as w3 \gset
select tests.create_user('pr.w4@brazos.test', 'Pat Four') as w4 \gset
select tests.create_user('pr.w5@brazos.test', 'Pat Five') as w5 \gset
select tests.create_user('pr.w6@brazos.test', 'Pat Six') as w6 \gset
select tests.create_user('pr.admin@brazos.test', 'Pat Admin') as admin \gset
insert into fx values ('customer', :'customer'), ('w1', :'w1'), ('w2', :'w2'), ('w3', :'w3'), ('w4', :'w4'),
                      ('w5', :'w5'), ('w6', :'w6');
-- SURGERY: the admin.
update public.profiles set is_admin = true where id = :'admin';

-- A $50 hire of p_worker, funded, done and released: the payout is asked for. Returns the payment.
create or replace function tests.pr_transfer(p_title text, p_worker uuid) returns uuid language plpgsql as $$
declare
  v_customer uuid := (select v from fx where k = 'customer');
  v_job uuid;
  v_offer uuid;
  v_pid uuid;
begin
  perform tests.clear_auth();
  update public.rate_counters set hits = 0 where user_id in (v_customer, p_worker);
  perform tests.authenticate_as(v_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'Payout re-read probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000, p_address_line := '5 Proof Way'
  )).id into v_job;
  perform tests.authenticate_as(p_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Payout re-read bid');
  perform tests.authenticate_as(v_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  perform tests.test_fund_job(v_job);
  perform tests.authenticate_as(p_worker);
  perform public.transition_job_status(v_job, 'in_progress');
  perform public.transition_job_status(v_job, 'completed', '["https://example.com/pr-done.jpg"]'::jsonb);
  perform tests.authenticate_as(v_customer);
  v_pid := (public.release_job_payment(v_job)).id;
  perform tests.clear_auth();
  return v_pid;
end $$;

-- The accounts the drain would read, in its order, by cast name.
create or replace function tests.pr_due() returns text language sql as $$
  select coalesce(string_agg(f.k, ',' order by d.ord), '<none>')
    from unnest(array(select v.user_id from public.payout_accounts_due v)) with ordinality as d (user_id, ord)
    join fx f on f.v = d.user_id
$$;

create or replace function tests.pr_seen(p_user uuid) returns timestamptz language sql as $$
  select payouts_checked_at from public.payment_accounts where user_id = p_user
$$;

create or replace function tests.pr_try(p_sql text) returns text language plpgsql as $$
declare v_out text;
begin
  execute p_sql into v_out;
  return 'ok: ' || coalesce(v_out, 'null');
exception when others then
  return 'error: ' || sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- The histories.
-- ---------------------------------------------------------------------------
select tests.pr_transfer('PR-1 off', :'w1') as p1 \gset
select tests.pr_transfer('PR-3 refused', :'w3') as p3 \gset
select tests.pr_transfer('PR-4 on', :'w4') as p4 \gset
select tests.pr_transfer('PR-5 banned', :'w5') as p5 \gset
select tests.pr_transfer('PR-6 never read', :'w6') as p6 \gset
select tests.set_payouts(:'w1', 'action_needed');
select tests.set_payouts(:'w2', 'action_needed');
select tests.set_payouts(:'w5', 'action_needed');
select tests.set_payouts(:'w6', 'under_review');
-- W3's payout: begun, and Stripe refused it (a refusal run goes on).
select public.settlement_send_begin(:'p3', 'transfer', 0, (select transfer_cents from public.payments where id = :'p3'));
select public.record_settlement_result(:'p3', 'transfer', 0, 'new_key', '400 insufficient_capabilities_for_transfer: probe');
select tests.authenticate_as(:'admin');
select public.ban_user(:'w5');
select tests.clear_auth();
-- SURGERY: the last reads: W1 2 hours ago, W3 3 hours, W5 4 hours, W6 never; W2 and W4 5 hours.
update public.payment_accounts set payouts_checked_at = now() - interval '2 hours' where user_id = :'w1';
update public.payment_accounts set payouts_checked_at = now() - interval '3 hours' where user_id = :'w3';
update public.payment_accounts set payouts_checked_at = now() - interval '4 hours' where user_id = :'w5';
update public.payment_accounts set payouts_checked_at = null where user_id = :'w6';
update public.payment_accounts set payouts_checked_at = now() - interval '5 hours' where user_id in (:'w2', :'w4');

-- ---------------------------------------------------------------------------
-- A. Server only.
-- ---------------------------------------------------------------------------
select ok((select c.relrowsecurity from pg_class c where c.oid = 'public.payout_account_checks'::regclass)
          and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payout_account_checks'),
  'A1: payout_account_checks has row security on and no policy');
select ok(not has_table_privilege('anon', 'public.payout_account_checks', 'SELECT,INSERT,UPDATE')
          and not has_table_privilege('authenticated', 'public.payout_account_checks', 'SELECT,INSERT,UPDATE')
          and not has_table_privilege('service_role', 'public.payout_account_checks', 'SELECT,INSERT,UPDATE'),
  'A2: no client and no service_role right on it');
select ok(not has_table_privilege('anon', 'public.payout_accounts_due', 'SELECT')
          and not has_table_privilege('authenticated', 'public.payout_accounts_due', 'SELECT')
          and has_table_privilege('service_role', 'public.payout_accounts_due', 'SELECT')
          and not has_table_privilege('service_role', 'public.payout_accounts_due', 'INSERT,UPDATE'),
  'A3: payout_accounts_due: service_role reads it, nobody else');
select ok(not has_function_privilege('anon', 'public.record_payout_check(uuid, timestamptz, text, text)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.record_payout_check(uuid, timestamptz, text, text)', 'EXECUTE')
          and has_function_privilege('service_role', 'public.record_payout_check(uuid, timestamptz, text, text)', 'EXECUTE'),
  'A4: record_payout_check: service_role only');
select tests.authenticate_as(:'w1');
select throws_ok($$ select count(*) from public.payout_accounts_due $$, '42501', 'permission denied for view payout_accounts_due',
  'A5: a signed-in worker cannot list the accounts');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- V. Who is read again, in which order.
-- ---------------------------------------------------------------------------
select is(tests.pr_due(), 'w6,w3,w1',
  'V1: never read first, then the oldest read: W6, W3 (payouts on, payout refused), W1 (payouts off); not W2 (nothing waiting), W4 (on, not refused) or W5 (banned)');
select is((select stripe_account_id from public.payout_accounts_due where user_id = :'w1'),
  (select stripe_account_id from public.payment_accounts where user_id = :'w1'), 'V2: with the stored Stripe account');

-- ---------------------------------------------------------------------------
-- R. One read, recorded.
-- ---------------------------------------------------------------------------
-- W1's account read back with transfers active: enabled.
select is(public.record_payout_check(:'w1', tests.pr_seen(:'w1'), 'enabled', 'read 200 enabled'), true,
  'R1: a state read back is recorded');
select is((select payouts_status || '/' || payouts_enabled from public.payment_accounts where user_id = :'w1'), 'enabled/true',
  'R2: through set_payouts_status: enabled, payouts_enabled derived');
select ok(exists (select 1 from public.transfers_ready r where r.id = :'p1'), 'R3: the waiting payout is ready for pass one');
select is((select answer from public.payout_account_checks where user_id = :'w1'), 'read 200 enabled', 'R4: the read is kept');
select is(tests.pr_due(), 'w6,w3', 'R5: W1 leaves the list');

-- W6: Stripe answered nothing that proves a state.
select is(public.record_payout_check(:'w6', null, null, 'read 404 resource_missing'), true, 'R6: a read that proved nothing is recorded');
select is((select payouts_status || '/' || coalesce(payouts_checked_at::text, 'never') from public.payment_accounts where user_id = :'w6'),
  'under_review/never', 'R7: and changes nothing');
select is((select tried_at = now() and answer = 'read 404 resource_missing' from public.payout_account_checks where user_id = :'w6'), true,
  'R8: only the read is stamped');
select is(tests.pr_due(), 'w3', 'R9: W6 moves out for an hour');
-- SURGERY: W6's read 59 minutes ago, then 61.
update public.payout_account_checks set tried_at = now() - interval '59 minutes' where user_id = :'w6';
select is(tests.pr_due(), 'w3', 'R10: read 59 minutes ago: not yet');
update public.payout_account_checks set tried_at = now() - interval '61 minutes' where user_id = :'w6';
select is(tests.pr_due(), 'w3,w6', 'R11: read 61 minutes ago: back, after the older W3');

-- W3: another writer records a state during the read (connect-status, the worker opened the app).
select tests.pr_seen(:'w3') as w3_seen \gset
select public.set_payouts_status(:'w3', 'enabled');
select is(public.record_payout_check(:'w3', :'w3_seen', 'action_needed', 'read 200 action_needed'), false,
  'R12: a state recorded meanwhile stands: false');
select is((select payouts_status from public.payment_accounts where user_id = :'w3'), 'enabled', 'R13: the state is not overwritten');
select is((select answer from public.payout_account_checks where user_id = :'w3'),
  'read 200 action_needed; not recorded: the state changed during the read', 'R14: the read is stamped and says why');
-- The next read, against the state as it is: Stripe will not pay this account.
select is(public.record_payout_check(:'w3', tests.pr_seen(:'w3'), 'action_needed', 'read 200 action_needed'), true,
  'R15: recorded');
select is((select a.code || '/' || a.finish from public.payment_attention a where a.payment_id = :'p3'),
  'transfer_no_payout_account/worker', 'R16: the refused payout now waits for the worker, not for the developer');
select ok(not exists (select 1 from public.transfers_ready r where r.id = :'p3'), 'R17: and is not sent');
select is((select ended_at is null from public.settlement_refusals where payment_id = :'p3' and kind = 'transfer'), true,
  'R18: its refusal run still stands while payouts are off');
select is(public.record_payout_check(:'w3', tests.pr_seen(:'w3'), 'enabled', 'read 200 enabled'), true,
  'R19: the worker fixes the account and the next read says enabled');
select is((select ended_at is not null from public.settlement_refusals where payment_id = :'p3' and kind = 'transfer'), true,
  'R20: enabled again ends the run (refusal_limit): a fresh 3 days');

-- Refusals.
select is(tests.pr_try(format('select public.record_payout_check(%L, null, %L, %L)::text', :'w4', 'bogus', 'read 200')),
  'error: record_payout_check: unknown status bogus; enabled, action_needed or under_review only', 'R21: an unknown state is refused');
select tests.set_payouts(:'w2', 'none');
select is(public.record_payout_check(:'w2', null, 'enabled', 'read 200 enabled'), false, 'R22: no stored account: false');
select is((select count(*)::integer from public.payout_account_checks where user_id = :'w2'), 0, 'R23: and nothing is stamped');

select * from finish();
rollback;
