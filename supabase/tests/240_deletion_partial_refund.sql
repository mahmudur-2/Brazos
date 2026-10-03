-- 240_deletion_partial_refund.sql — FIX-RUN A14's proofs: 20261003000300_deletion_partial_refund.sql
-- proven on the local stack before the pipeline applies it anywhere.
--
-- THE CAST: a customer (the payer), a worker (the payee), and the runner — the connection's own
-- role, RLS bypassed — for the fixture rows. Everything rolls back; no commit.
--
-- FIXTURE SURGERY, DECLARED: a completed job and its payments row are raw rows by the runner, and the
-- row's status is walked by raw UPDATE through the states the gate must classify, because the proof
-- is about the GATE, not the ledger's writers (030_payments.sql proves those).
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(9);

select tests.create_user('a14.customer@brazos.test', 'Cara Customer') as customer \gset
select tests.create_user('a14.worker@brazos.test',   'Wren Worker')   as worker   \gset

insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'customer', 'A14 late cancellation', :'worker', 'cancelled') returning id as job \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents, provider, status)
values (:'job', :'customer', :'worker', 8000, 800, 600, 'stripe', 'partially_refunded') returning id as payment \gset

-- ---------------------------------------------------------------------------
-- 1. partially_refunded is final: neither side is blocked by it.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select is((select count(*) from public.account_deletion_blockers()), 0::bigint,
  '1a: the customer with a partly refunded late cancellation may delete their account');
select tests.authenticate_as(:'worker');
select is((select count(*) from public.account_deletion_blockers()), 0::bigint,
  '1b: and so may the worker who received the fee');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 2. The gate still blocks on money that is moving (the positive control), by name.
-- ---------------------------------------------------------------------------
update public.payments set status = 'held' where id = :'payment';
select tests.authenticate_as(:'customer');
select is(
  (select row(b.kind, b.ref_id, b.label, b.detail) from public.account_deletion_blockers() b),
  row('payment_outgoing'::text, :'job'::uuid, 'Payment you sent'::text, 'This payment is being held for a job and has not been released.'::text),
  '2a: a held payment blocks the payer, with the held sentence'
);
select tests.authenticate_as(:'worker');
select is(
  (select row(b.kind, b.label) from public.account_deletion_blockers() b),
  row('payment_incoming'::text, 'Payment owed to you'::text),
  '2b: and the payee'
);
select tests.clear_auth();
-- Every other terminal state still passes; every non-terminal one still blocks (allow-list, not block-list).
update public.payments set status = 'refunded' where id = :'payment';
select tests.authenticate_as(:'customer');
select is((select count(*) from public.account_deletion_blockers()), 0::bigint, '2c: refunded is final');
select tests.clear_auth();
update public.payments set status = 'authorized' where id = :'payment';
select tests.authenticate_as(:'customer');
select is(
  (select b.detail from public.account_deletion_blockers() b),
  'This payment is authorized but has not been held or released.',
  '2d: authorized still blocks, with its own sentence'
);
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 3. ACL and the comment, as the baseline granted them.
-- ---------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.account_deletion_blockers()', 'EXECUTE'), '3a: authenticated may read their own blockers');
select ok(not has_function_privilege('anon', 'public.account_deletion_blockers()', 'EXECUTE'), '3b: anon may not');
select ok(
  (select obj_description('public.account_deletion_blockers()'::regprocedure, 'pg_proc')) like '%partially_refunded counts as finished%',
  '3c: the comment records the ruling'
);

select * from finish();
rollback;
