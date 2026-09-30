-- 190_receipts.sql — idea 8's proofs: 20260930001100_receipts.sql proven on the local stack before the
-- pipeline applies it anywhere. Twenty-one assertions in six numbered groups; each says what it
-- proves. The email itself (supabase/functions/send-receipts) is fenced offline in
-- tests/receipts.test.mjs.
--
-- THE CAST: a customer (Dana) and a worker (Priya), and the runner — the connection's own role,
-- RLS bypassed — which writes the ledger rows directly (050_settlements.sql's way) and plays the
-- send-receipts function's service-role calls. Everything rolls back; no commit.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(21);

select tests.create_user('i8.customer@brazos.test', 'Dana Whitfield') as customer \gset
select tests.create_user('i8.worker@brazos.test', 'Priya Natarajan') as worker \gset

insert into public.jobs (client_id, title, category, location, assigned_worker_id, status, completed_at)
values (:'customer', 'I8 move a dresser down two flights', 'moving', 'Park Slope, Brooklyn, NY', :'worker', 'completed', now() - interval '1 hour')
returning id as job, job_number as job_number \gset
insert into public.jobs (client_id, title, assigned_worker_id)
values (:'customer', 'I8 sandbox fixture', :'worker')
returning id as job_sandbox, job_number as job_number_next \gset

insert into public.payments (
  job_id, payer_id, payee_id, amount_cents, customer_fee_cents, platform_fee_cents,
  worker_fee_bps, transfer_cents, provider, provider_ref, status, held_at, release_requested_at
)
values (
  :'job', :'customer', :'worker', 8000, 600, 600,
  750, 7400, 'stripe', 'pi_i8_fixture', 'held', now() - interval '2 days', now() - interval '10 minutes'
)
returning id as payment \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, provider, status)
values (:'job_sandbox', :'customer', :'worker', 5000, 0, 'sandbox', 'held')
returning id as payment_sandbox \gset

-- ---------------------------------------------------------------------------
-- 1. The job number: every job has one, unique, the next one follows.
-- ---------------------------------------------------------------------------
select col_not_null('public', 'jobs', 'job_number', '1a: every job has a job number');
select is(
  (select count(*) from public.jobs),
  (select count(distinct job_number) from public.jobs),
  '1b: no two jobs share one'
);
select is(:job_number_next, :job_number + 1, '1c: a new job takes the next number');
select ok(
  not has_sequence_privilege('authenticated', 'public.job_number_seq', 'USAGE')
  and not has_sequence_privilege('anon', 'public.job_number_seq', 'USAGE'),
  '1d: nobody but the database draws a number'
);

-- ---------------------------------------------------------------------------
-- 2. The outbox and the calls are the service role's alone.
-- ---------------------------------------------------------------------------
select ok(
  (select relrowsecurity from pg_class where oid = 'public.receipt_outbox'::regclass)
  and not has_table_privilege('authenticated', 'public.receipt_outbox', 'SELECT')
  and not has_table_privilege('anon', 'public.receipt_outbox', 'SELECT')
  and has_table_privilege('service_role', 'public.receipt_outbox', 'SELECT'),
  '2a: RLS on, and only the service role reads the outbox'
);
select ok(
  has_function_privilege('service_role', 'public.claim_receipt_batch(integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.resolve_receipt(uuid, text, text, text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.receipt_details(uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.drain_receipts()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.claim_receipt_batch(integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.resolve_receipt(uuid, text, text, text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.receipt_details(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.drain_receipts()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.receipt_details(uuid)', 'EXECUTE'),
  '2b: claim, resolve, details and the drain are the service role''s alone'
);
select ok(
  not has_function_privilege('authenticated', 'public.enqueue_receipts()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.install_receipt_schedule()', 'EXECUTE'),
  '2c: the trigger and the installer are nobody''s to call'
);

-- ---------------------------------------------------------------------------
-- 3. The release: one receipt to each side, once; a sandbox payment gets none.
-- ---------------------------------------------------------------------------
update public.payments set status = 'released', released_at = now(), release_reason = 'approved' where id = :'payment';
select results_eq(
  $$ select role, recipient_id, status from public.receipt_outbox
      where payment_id = (select id from public.payments where provider_ref = 'pi_i8_fixture') order by role $$,
  $$ values ('customer'::text, (select id from public.profiles where full_name = 'Dana Whitfield'), 'pending'::text),
            ('worker'::text, (select id from public.profiles where full_name = 'Priya Natarajan'), 'pending'::text) $$,
  '3a: the release enqueues one pending receipt for the customer and one for the worker'
);
update public.payments set status = 'held' where id = :'payment';
update public.payments set status = 'released' where id = :'payment';
select is(
  (select count(*)::int from public.receipt_outbox where payment_id = :'payment'),
  2,
  '3b: a reversal and a second release never send a second receipt'
);
update public.payments set status = 'released', released_at = now() where id = :'payment_sandbox';
select is(
  (select count(*)::int from public.receipt_outbox where payment_id = :'payment_sandbox'),
  0,
  '3c: a sandbox payment moved no money, so it gets no receipt'
);
select is(
  (select count(*)::int from public.receipt_outbox where job_id = :'job'),
  2,
  '3d: and the job''s receipts are exactly the two'
);

-- ---------------------------------------------------------------------------
-- 4. Claim and resolve.
-- ---------------------------------------------------------------------------
create temp table i8_claimed as select * from public.claim_receipt_batch(20);
select is((select count(*)::int from i8_claimed where payment_id = :'payment'), 2, '4a: the claim takes both waiting receipts');
select is((select min(attempts) from i8_claimed where payment_id = :'payment'), 1, '4b: and counts the attempt');
select public.resolve_receipt(
  (select id from public.receipt_outbox where payment_id = :'payment' and role = 'customer'),
  'sent', null, 'email_i8'
) as resolved_customer \gset
select ok(
  (select status = 'sent' and sent_at is not null and provider_ref = 'email_i8'
   from public.receipt_outbox where payment_id = :'payment' and role = 'customer'),
  '4c: a sent receipt records when and the email service''s id'
);
update public.receipt_outbox set attempts = 5 where payment_id = :'payment' and role = 'worker';
select public.resolve_receipt(
  (select id from public.receipt_outbox where payment_id = :'payment' and role = 'worker'),
  'pending', 'email service 503', null
) as resolved_worker \gset
select is(
  (select status from public.receipt_outbox where payment_id = :'payment' and role = 'worker'),
  'failed',
  '4d: a fifth failed attempt is final - failed, never retried for ever'
);
select throws_ok(
  $$ select public.resolve_receipt(gen_random_uuid(), 'delivered') $$,
  'P0001', 'resolve_receipt: unknown status', '4e: the status is an allow-list'
);

-- ---------------------------------------------------------------------------
-- 5. What a receipt says: the ledger's own numbers, verbatim.
-- ---------------------------------------------------------------------------
select is(
  (select public.receipt_details(:'payment') ->> 'job_number')::int,
  :job_number,
  '5a: the job number'
);
select ok(
  (select d ->> 'title' = 'I8 move a dresser down two flights' and d ->> 'category' = 'moving'
          and d ->> 'location' = 'Park Slope, Brooklyn, NY'
   from (select public.receipt_details(:'payment') as d) x),
  '5b: the title, the category and the area'
);
select ok(
  (select (d ->> 'agreed_cents')::int = 8000 and (d ->> 'protection_fee_cents')::int = 600
          and (d ->> 'charged_cents')::int = 8600 and (d ->> 'worker_fee_cents')::int = 600
          and (d ->> 'worker_fee_bps')::int = 750 and (d ->> 'paid_to_worker_cents')::int = 7400
   from (select public.receipt_details(:'payment') as d) x),
  '5c: every amount is a payments column, verbatim - agreed, protection fee, charged, the worker''s fee and what moved to them'
);
select ok(
  (select d ->> 'customer_name' = 'Dana Whitfield' and d ->> 'worker_name' = 'Priya Natarajan'
          and d ->> 'released_at' is not null and d ->> 'completed_at' is not null and d ->> 'held_at' is not null
          and d ->> 'release_reason' = 'approved'
   from (select public.receipt_details(:'payment') as d) x),
  '5d: the two people, and the instants the What-happened timeline draws from'
);

-- ---------------------------------------------------------------------------
-- 6. The wake-up: nothing waiting, nothing woken.
-- ---------------------------------------------------------------------------
select is(public.drain_receipts(), null::bigint, '6: with no receipt waiting, the drain returns without calling anything');

select * from finish();
rollback;
