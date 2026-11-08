-- 230_ban_refund.sql — FIX-RUN A11's proofs: 20261003000100_ban_refund.sql proven on the local
-- stack before the pipeline applies it anywhere.
--
-- THE CAST: an admin (profiles.is_admin set directly by the runner, as 040_authz.sql §16 does), a
-- customer, a worker who is about to be banned, and the runner — the connection's own role, RLS
-- bypassed — for the fixture rows and the ground truth. Everything rolls back; no commit.
--
-- FIXTURE SURGERY, DECLARED: the three jobs and their payments are raw rows by the runner, in the
-- shapes the product reaches through accept_offer + checkout (030_payments.sql proves those
-- writers): an undirected held card row, an approved card row (release requested), and an
-- undirected held legacy sandbox row (lean v1 removed its at-once settlement; it stays only for
-- the cancel and the thread notice). The proof is about what the BAN does to each.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(16);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated, service_role;

select tests.create_user('a11.admin@brazos.test',    'Ada Admin')     as admin    \gset
select tests.create_user('a11.customer@brazos.test', 'Cara Customer') as customer \gset
select tests.create_user('a11.worker@brazos.test',   'Wren Worker')   as worker   \gset
update public.profiles set is_admin = true where id = :'admin';
insert into fx values ('admin', :'admin'), ('customer', :'customer'), ('worker', :'worker');

-- A: assigned, card path, held, nothing directed — the stranded case.
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'customer', 'A11 undirected held', :'worker', 'assigned') returning id as j_a \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents, provider, provider_ref, status)
values (:'j_a', :'customer', :'worker', 5000, 500, 375, 'stripe', 'pi_a11_a', 'held') returning id as p_a \gset
-- B: in progress, card path, held, release already requested — approved money, never clawed back.
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'customer', 'A11 approved', :'worker', 'in_progress') returning id as j_b \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents, provider, provider_ref, status)
values (:'j_b', :'customer', :'worker', 8000, 800, 600, 'stripe', 'pi_a11_b', 'held') returning id as p_b \gset
update public.payments set release_requested_at = now(), transfer_cents = 7200 where id = :'p_b';
-- C: assigned, sandbox ledger, held, nothing directed.
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'customer', 'A11 sandbox held', :'worker', 'assigned') returning id as j_c \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, provider, status)
values (:'j_c', :'customer', :'worker', 3000, 300, 'sandbox', 'held') returning id as p_c \gset
insert into fx values ('j_a', :'j_a'), ('p_a', :'p_a'), ('j_b', :'j_b'), ('p_b', :'p_b'), ('j_c', :'j_c'), ('p_c', :'p_c');

-- ---------------------------------------------------------------------------
-- 1. The reason exists, and only it was added.
-- ---------------------------------------------------------------------------
select ok(
  (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = 'public.payments'::regclass and c.conname = 'payments_refund_reason_known')
    like '%''account_suspended''%'
  and (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = 'public.payments'::regclass and c.conname = 'payments_refund_reason_known')
    like '%''dispute_refund''%',
  '1a: payments_refund_reason_known lists account_suspended beside the existing reasons'
);
select throws_ok(
  $$ update public.payments set refund_reason = 'bogus' where id = (select v from fx where k = 'p_c') $$,
  '23514', null,
  '1b: an unknown reason is still refused'
);

-- ---------------------------------------------------------------------------
-- 2. Not an admin: refused, nothing moves (the positive control is §3).
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'worker');
select throws_ok(
  $$ select public.ban_user((select v from fx where k = 'customer')) $$,
  'P0001', 'Only admins may ban users',
  '2a: the worker cannot ban'
);
select tests.clear_auth();
select is((select refund_cents from public.payments where id = :'p_a'), null::integer, '2b: and the held row is untouched');

-- ---------------------------------------------------------------------------
-- 3. The admin bans the worker: all three jobs cancel, and the money goes where it should.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'admin');
select lives_ok($$ select public.ban_user((select v from fx where k = 'worker')) $$, '3a: the admin bans the worker');
select tests.clear_auth();
select ok((select banned from public.profiles where id = :'worker'), '3b: the worker is banned');
select is(
  (select count(*) from public.jobs where id in (:'j_a', :'j_b', :'j_c') and status = 'cancelled'),
  3::bigint,
  '3c: all three in-flight jobs are cancelled, as before'
);
-- A: the undirected card row — a full refund of the charge is queued, status held until the webhook.
select is(
  (select row(p.refund_cents, p.transfer_cents, p.refund_reason, p.status::text)
     from public.payments p where p.id = :'p_a'),
  row(5375, 0, 'account_suspended'::text, 'held'::text),
  '3d: the undirected card row is queued for a full refund of the charge (price + fee), reason account_suspended, still held until charge.refunded'
);
select is((select count(*) from public.refunds_due where id = :'p_a'), 1::bigint, '3e: it is in refunds_due');
select is((select count(*) from public.refunds_ready where id = :'p_a'), 1::bigint, '3f: and, with its provider reference, in refunds_ready — the drain refunds it on the next tick');
-- B: the approved row — exactly as it was.
select is(
  (select row(coalesce(p.refund_cents, 0), p.transfer_cents, p.refund_reason, p.status::text, p.release_requested_at is not null)
     from public.payments p where p.id = :'p_b'),
  row(0, 7200, null::text, 'held'::text, true),
  '3g: a row whose release the customer already requested is left exactly as it was — a ban never claws money back'
);
select is((select count(*) from public.refunds_due where id = :'p_b'), 0::bigint, '3h: and it is not in refunds_due');
-- The counterparty is told in each thread, as before.
select is(
  (select count(*) from public.messages m where m.job_id in (:'j_a', :'j_b', :'j_c') and m.sender_id = :'worker'
     and m.content = 'This job was cancelled automatically because this account was suspended by Brazos.'),
  3::bigint,
  '3j: the customer is told in each thread, attributed to the banned account as before'
);

-- ---------------------------------------------------------------------------
-- 4. ACL: as the baseline granted it — authenticated may call (the admin check is inside), anon may not.
-- ---------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.ban_user(uuid, uuid)', 'EXECUTE'), '4a: authenticated may call ban_user (the admin check is inside)');
select ok(not has_function_privilege('anon', 'public.ban_user(uuid, uuid)', 'EXECUTE'), '4b: anon may not');
select ok(
  (select obj_description('public.ban_user(uuid, uuid)'::regprocedure, 'pg_proc')) like '%account_suspended%',
  '4c: the comment names the refund the ban queues'
);

select * from finish();
rollback;
