-- 240_deletion_partial_refund.sql — FIX-RUN A14's proofs: 20261003000300_deletion_partial_refund.sql
-- proven on the local stack before the pipeline applies it anywhere; §4 proves its review,
-- 20261003001000_deletion_fee_owed.sql — the worker waits while the cancellation fee is still queued.
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
select plan(16);

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

-- ---------------------------------------------------------------------------
-- 4. A14 review (20261003001000): the fee still queued. cancel_job()'s late branch on the card path —
--    transfer_cents = the fee with release_requested_at, refund_cents = the rest — after
--    charge.refunded wrote partially_refunded and BEFORE transfer.created: the row is still in
--    transfers_due, and its payee waits with it. The customer, whose refund landed, does not.
-- ---------------------------------------------------------------------------
update public.payments
   set status = 'partially_refunded', provider = 'stripe',
       transfer_cents = 1600, refund_cents = 7000,
       release_reason = 'cancellation_fee', refund_reason = 'customer_cancelled_late',
       release_requested_at = now(), transfer_ref = null, released_at = null
 where id = :'payment';
select tests.authenticate_as(:'worker');
select is(
  (select row(b.kind, b.ref_id, b.label, b.detail) from public.account_deletion_blockers() b),
  row('payment_incoming'::text, :'job'::uuid, 'Payment owed to you'::text, 'The cancellation fee has not reached your payout account yet.'::text),
  '4a: the worker still owed the fee is blocked, with the fee sentence'
);
select tests.authenticate_as(:'customer');
select is((select count(*) from public.account_deletion_blockers()), 0::bigint, '4b: the customer, whose refund landed, is not');
select tests.clear_auth();
select is((select count(*) from public.transfers_due d where d.id = :'payment'), 1::bigint,
  '4c: the ground truth the gate mirrors — the fee is still in transfers_due');
-- transfer.created's write: the fee has left.
update public.payments set transfer_ref = 'tr_a14_fee', released_at = now() where id = :'payment';
select tests.authenticate_as(:'worker');
select is((select count(*) from public.account_deletion_blockers()), 0::bigint, '4d: once transfer.created records the transfer the worker may delete');
select tests.clear_auth();
select is((select count(*) from public.transfers_due d where d.id = :'payment'), 0::bigint, '4e: and the row has left transfers_due');
-- A sandbox row finalises in the statement that writes it: no transfer_ref ever, never a blocker.
update public.payments set provider = 'sandbox', transfer_ref = null, released_at = now() where id = :'payment';
select tests.authenticate_as(:'worker');
select is((select count(*) from public.account_deletion_blockers()), 0::bigint, '4f: a sandbox late cancellation never blocks the worker — it finalised in the same statement');
select tests.clear_auth();
-- Nothing to transfer: nothing to wait for.
update public.payments set provider = 'stripe', transfer_cents = 0, transfer_ref = null, released_at = null where id = :'payment';
select tests.authenticate_as(:'worker');
select is((select count(*) from public.account_deletion_blockers()), 0::bigint, '4g: a partly refunded card row with no fee to transfer never blocks the worker');
select tests.clear_auth();

select * from finish();
rollback;
