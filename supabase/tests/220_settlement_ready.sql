-- 220_settlement_ready.sql — FIX-RUN A9's proofs: 20261003000000_settlement_queue_ready.sql proven
-- on the local stack before the pipeline applies it anywhere.
--
-- THE JAM IT PROVES CLOSED: process-settlements reads the queue with limit 25. Thirty rows whose
-- payees have no enabled payout account sit AHEAD of one payable row; the old read (transfers_due,
-- limit 25) never reaches it. transfers_ready returns exactly that one row.
--
-- THE CAST: a customer (the payer), one payable worker (an ENABLED payment_accounts row), thirty
-- blocked workers (no payment_accounts row at all — the shape of a worker who never set payouts
-- up), and the runner — the connection's own role, RLS bypassed — for the fixture rows and the
-- ground truth, as 050_settlements.sql seeds its due rows. Everything rolls back; no commit.
--
-- FIXTURE SURGERY, DECLARED: the due rows are raw inserts and updates by the runner — a held stripe
-- row with release_requested_at set and transfer_cents > 0 — because the proof is about the VIEWS,
-- not their writers (030_payments.sql §6 proves the writers). The seed may hold due rows of its own,
-- so every count is over THIS fixture's ids.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(14);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated, service_role;

select tests.create_user('a9.customer@brazos.test', 'Cara Customer') as customer \gset
select tests.create_user('a9.payable@brazos.test',  'Pat Payable')   as payable  \gset
insert into fx values ('customer', :'customer'), ('payable', :'payable');

-- Thirty blocked payees, each with a job and a due row released BEFORE the payable one.
do $$
declare
  v_i integer;
  v_worker uuid;
  v_job uuid;
  v_payment uuid;
  v_customer uuid := (select v from fx where k = 'customer');
begin
  for v_i in 1..30 loop
    v_worker := tests.create_user('a9.blocked' || v_i || '@brazos.test', 'Blocked ' || v_i);
    insert into public.jobs (client_id, title, assigned_worker_id)
    values (v_customer, 'A9 blocked fixture ' || v_i, v_worker) returning id into v_job;
    insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, provider, status)
    values (v_job, v_customer, v_worker, 5000, 500, 'stripe', 'held') returning id into v_payment;
    update public.payments
       set release_requested_at = now() - make_interval(hours => 48 - v_i), transfer_cents = 4500
     where id = v_payment;
    insert into fx values ('blocked_payment_' || v_i, v_payment);
  end loop;
end $$;

-- The one payable row, released LAST, behind all thirty.
insert into public.jobs (client_id, title, assigned_worker_id)
values (:'customer', 'A9 payable fixture', :'payable') returning id as j_payable \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, provider, status)
values (:'j_payable', :'customer', :'payable', 8600, 860, 'stripe', 'held') returning id as p_payable \gset
update public.payments set release_requested_at = now(), transfer_cents = 7740 where id = :'p_payable';
insert into fx values ('p_payable', :'p_payable');
insert into public.payment_accounts (user_id, stripe_account_id, payouts_enabled, payouts_status)
values (:'payable', 'acct_a9_payable', true, 'enabled');

-- ---------------------------------------------------------------------------
-- 1. The complete queue holds all thirty-one; the old read never reaches the payable row.
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.transfers_due d where d.id in (select v from fx where k like 'blocked_payment_%' or k = 'p_payable')),
  31::bigint,
  '1a: all thirty-one fixture rows are in transfers_due — the complete queue is untouched'
);
select is(
  (select count(*) from (select d.id from public.transfers_due d where d.id in (select v from fx where k like 'blocked_payment_%' or k = 'p_payable') order by d.release_requested_at limit 25) head where head.id = :'p_payable'),
  0::bigint,
  '1b: the first 25 of transfers_due (the drain''s old read) do not reach the payable row — the jam'
);

-- ---------------------------------------------------------------------------
-- 2. transfers_ready: exactly the payable row, none of the blocked ones.
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.transfers_ready r where r.id in (select v from fx where k like 'blocked_payment_%' or k = 'p_payable')),
  1::bigint,
  '2a: transfers_ready holds ONE of the thirty-one fixture rows'
);
select is(
  (select r.id from public.transfers_ready r where r.id in (select v from fx where k like 'blocked_payment_%' or k = 'p_payable')),
  :'p_payable'::uuid,
  '2b: and it is the payable row — thirty blocked rows ahead of it hide nothing'
);
select is(
  (select r.transfer_attempts from public.transfers_ready r where r.id = :'p_payable'),
  0,
  '2c: the view carries transfer_attempts, which the drain''s idempotency key is built from'
);
-- An account that exists but is NOT enabled blocks exactly like no account at all.
insert into public.payment_accounts (user_id, stripe_account_id, payouts_enabled, payouts_status)
select p.payee_id, 'acct_a9_under_review', false, 'under_review'
  from public.payments p where p.id = (select v from fx where k = 'blocked_payment_2');
select is(
  (select count(*) from public.transfers_ready r where r.id = (select v from fx where k = 'blocked_payment_2')),
  0::bigint,
  '2d: a payee whose account exists but is not enabled (under_review) is still not ready'
);
update public.payment_accounts set payouts_enabled = true, payouts_status = 'enabled'
 where user_id = (select p.payee_id from public.payments p where p.id = (select v from fx where k = 'blocked_payment_2'));
select is(
  (select count(*) from public.transfers_ready r where r.id = (select v from fx where k = 'blocked_payment_2')),
  1::bigint,
  '2e: the moment that account is enabled its row is ready — the view reads the account, not a snapshot'
);
select is(
  (select array_agg(r.id order by r.release_requested_at) from public.transfers_ready r where r.id in (select v from fx where k in ('blocked_payment_2', 'p_payable'))),
  array[(select v from fx where k = 'blocked_payment_2'), :'p_payable'::uuid],
  '2f: ready rows keep transfers_due''s order — oldest release request first'
);

-- ---------------------------------------------------------------------------
-- 3. refunds_ready: a refund with no provider reference waits in refunds_due, never in refunds_ready.
-- ---------------------------------------------------------------------------
update public.payments set refund_cents = 1000 where id = (select v from fx where k = 'blocked_payment_3');
update public.payments set refund_cents = 1000, provider_ref = 'pi_a9_refundable' where id = (select v from fx where k = 'blocked_payment_4');
select is(
  (select count(*) from public.refunds_due d where d.id in (select v from fx where k in ('blocked_payment_3', 'blocked_payment_4'))),
  2::bigint,
  '3a: both refund rows are in refunds_due — the complete queue'
);
select is(
  (select array_agg(r.id) from public.refunds_ready r where r.id in (select v from fx where k in ('blocked_payment_3', 'blocked_payment_4'))),
  array[(select v from fx where k = 'blocked_payment_4')],
  '3b: refunds_ready holds only the row with a provider reference to refund against'
);

-- ---------------------------------------------------------------------------
-- 4. Privileges: service_role reads both; no client role can.
-- ---------------------------------------------------------------------------
select ok(has_table_privilege('service_role', 'public.transfers_ready', 'SELECT'), '4a: service_role may read transfers_ready');
select ok(has_table_privilege('service_role', 'public.refunds_ready', 'SELECT'), '4b: service_role may read refunds_ready');
select ok(not has_table_privilege('authenticated', 'public.transfers_ready', 'SELECT') and not has_table_privilege('anon', 'public.transfers_ready', 'SELECT'),
  '4c: neither authenticated nor anon may read transfers_ready');
select ok(not has_table_privilege('authenticated', 'public.refunds_ready', 'SELECT') and not has_table_privilege('anon', 'public.refunds_ready', 'SELECT'),
  '4d: neither authenticated nor anon may read refunds_ready');

select * from finish();
rollback;
