-- 270_ban_void_unfunded.sql — FIX-RUN A11 review's proofs: 20261003000600_ban_void_unfunded.sql
-- proven on the local stack before the pipeline applies it anywhere.
--
-- THE CAST: an admin (profiles.is_admin set directly by the runner, as 040_authz.sql §16 does), a
-- customer, a worker who is about to be banned, and the runner — the connection's own role, RLS
-- bypassed — for the fixture rows and the ground truth. Everything rolls back; no commit.
--
-- FIXTURE SURGERY, DECLARED: three jobs and their payments are raw rows by the runner, in the shapes
-- a checkout reaches (030_payments.sql proves those writers): a stripe row still unfunded (the intent
-- minted, the sheet never completed), a sandbox row authorized and not yet held, and — the A11
-- regression control — an undirected held card row. The proof is about what the BAN does to each,
-- and that the customer can then delete their account.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(10);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated, service_role;

select tests.create_user('a11v.admin@brazos.test',    'Ada Admin')     as admin    \gset
select tests.create_user('a11v.customer@brazos.test', 'Cara Customer') as customer \gset
select tests.create_user('a11v.worker@brazos.test',   'Wren Worker')   as worker   \gset
update public.profiles set is_admin = true where id = :'admin';
insert into fx values ('admin', :'admin'), ('customer', :'customer'), ('worker', :'worker');

-- D: assigned, card path, the checkout started and never finished.
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'customer', 'A11v stripe unfunded', :'worker', 'assigned') returning id as j_d \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents, provider, provider_ref, status, funding_due_at)
values (:'j_d', :'customer', :'worker', 5000, 500, 375, 'stripe', 'pi_a11v_d', 'unfunded', now() + interval '24 hours') returning id as p_d \gset
-- E: assigned, sandbox ledger, authorized and not yet held — nothing sweeps this row.
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'customer', 'A11v sandbox authorized', :'worker', 'assigned') returning id as j_e \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, provider, status, authorized_at)
values (:'j_e', :'customer', :'worker', 3000, 300, 'sandbox', 'authorized', now()) returning id as p_e \gset
-- F: assigned, card path, held, nothing directed — A11's own case, unchanged by this file.
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'customer', 'A11v held control', :'worker', 'assigned') returning id as j_f \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents, provider, provider_ref, status)
values (:'j_f', :'customer', :'worker', 8000, 800, 600, 'stripe', 'pi_a11v_f', 'held') returning id as p_f \gset
insert into fx values ('j_d', :'j_d'), ('p_d', :'p_d'), ('j_e', :'j_e'), ('p_e', :'p_e'), ('j_f', :'j_f'), ('p_f', :'p_f');

-- ---------------------------------------------------------------------------
-- 1. Before the ban: the customer is tied to all of it — the control for §3.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select ok(
  (select count(*) from public.account_deletion_blockers()) >= 5,
  '1a: before the ban the customer cannot delete — three assigned jobs and at least the unfunded and authorized rows block'
);
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 2. The admin bans the worker: every job cancels, and each row goes where cancel_job() sends it.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'admin');
select lives_ok($$ select public.ban_user((select v from fx where k = 'worker')) $$, '2a: the admin bans the worker');
select tests.clear_auth();
select is(
  (select count(*) from public.jobs where id in (:'j_d', :'j_e', :'j_f') and status = 'cancelled'),
  3::bigint,
  '2b: all three in-flight jobs are cancelled'
);
-- D: voided, nothing refunded, nothing for the drain.
select is(
  (select row(p.status::text, p.last_error, coalesce(p.refund_cents, 0), coalesce(p.transfer_cents, 0), p.refund_reason)
     from public.payments p where p.id = :'p_d'),
  row('voided'::text, 'job cancelled before funding'::text, 0, 0, null::text),
  '2c: the unfunded card row is voided as cancel_job() voids it — nothing captured, nothing refunded'
);
select is((select count(*) from public.refunds_due where id = :'p_d'), 0::bigint, '2d: and it is not in refunds_due');
-- E: voided — the row nothing else would ever have swept.
select is(
  (select row(p.status::text, p.last_error) from public.payments p where p.id = :'p_e'),
  row('voided'::text, 'job cancelled before funding'::text),
  '2e: the authorized sandbox row is voided too'
);
-- F: A11's shape, untouched by the new statement.
select is(
  (select row(p.refund_cents, p.transfer_cents, p.refund_reason, p.status::text)
     from public.payments p where p.id = :'p_f'),
  row(8000 + 600, 0, 'account_suspended'::text, 'held'::text),
  '2f: the undirected held row is still queued for its full refund, reason account_suspended (A11 unchanged)'
);

-- ---------------------------------------------------------------------------
-- 3. After the ban: nothing ties the customer to the banned worker any more.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select is(
  (select count(*) from public.account_deletion_blockers() b where b.kind = 'job'),
  0::bigint,
  '3a: no cancelled job blocks the customer'
);
select is(
  (select count(*) from public.account_deletion_blockers() b where b.ref_id in (:'j_d', :'j_e')),
  0::bigint,
  '3b: neither voided row blocks the customer — the gate that kept the account alive for ever is gone'
);
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 4. The comment names the void.
-- ---------------------------------------------------------------------------
select ok(
  (select obj_description('public.ban_user(uuid, uuid)'::regprocedure, 'pg_proc')) like '%voided as cancel_job() voids it%',
  '4a: the comment names the void beside the refund'
);

select * from finish();
rollback;
