-- 290_ban_customer_in_progress.sql — FIX-RUN A11 review 2's proofs:
-- 20261003001200_ban_lock_customer_in_progress.sql proven on the local stack before the pipeline
-- applies it anywhere.
--
-- THE CAST: an admin (profiles.is_admin set directly by the runner, as 040_authz.sql §16 does), a
-- customer who is about to be banned, a worker who is honestly working for them, and the runner —
-- the connection's own role, RLS bypassed — for the fixture rows, the ground truth and the
-- operator's own calls (resolve_job_dispute is service_role only). Everything rolls back; no commit.
--
-- FIXTURE SURGERY, DECLARED: the jobs and their payments are raw rows by the runner, in the shapes
-- the product reaches through accept_offer + checkout + transition_job_status (030_payments.sql and
-- 020_lifecycle.sql prove those writers): the banned customer's job IN PROGRESS with an undirected
-- held card row (the shape this file is about), the same on the sandbox ledger, their job merely
-- ASSIGNED with an undirected held row (A11's refund still applies), and a COMPLETED job with its
-- release requested (outside the loop's allow-list). The proof is about what the BAN does to each,
-- and what the operator can still do afterwards.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(19);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated, service_role;

select tests.create_user('a11r2.admin@brazos.test',    'Ada Admin')     as admin    \gset
select tests.create_user('a11r2.customer@brazos.test', 'Cara Customer') as customer \gset
select tests.create_user('a11r2.worker@brazos.test',   'Wren Worker')   as worker   \gset
update public.profiles set is_admin = true where id = :'admin';
insert into fx values ('admin', :'admin'), ('customer', :'customer'), ('worker', :'worker');

-- G: IN PROGRESS, card path, held, nothing directed — the worker is on the job when the customer is banned.
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'customer', 'A11r2 in progress, card', :'worker', 'in_progress') returning id as j_g \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents, provider, provider_ref, status)
values (:'j_g', :'customer', :'worker', 8000, 800, 600, 'stripe', 'pi_a11r2_g', 'held') returning id as p_g \gset
-- I: the same on the sandbox ledger.
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'customer', 'A11r2 in progress, sandbox', :'worker', 'in_progress') returning id as j_i \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, provider, status)
values (:'j_i', :'customer', :'worker', 3000, 300, 'sandbox', 'held') returning id as p_i \gset
-- H: merely ASSIGNED — not started — card path, held, nothing directed: A11's refund still applies.
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'customer', 'A11r2 assigned', :'worker', 'assigned') returning id as j_h \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents, provider, provider_ref, status)
values (:'j_h', :'customer', :'worker', 5000, 500, 375, 'stripe', 'pi_a11r2_h', 'held') returning id as p_h \gset
-- J: COMPLETED, release requested — outside the loop's allow-list, the ban must not touch it.
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'customer', 'A11r2 completed', :'worker', 'completed') returning id as j_j \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents, provider, provider_ref, status)
values (:'j_j', :'customer', :'worker', 4000, 400, 300, 'stripe', 'pi_a11r2_j', 'held') returning id as p_j \gset
update public.payments set release_requested_at = now(), transfer_cents = 3600 where id = :'p_j';
insert into fx values ('j_g', :'j_g'), ('p_g', :'p_g'), ('j_i', :'j_i'), ('p_i', :'p_i'), ('j_h', :'j_h'), ('p_h', :'p_h'), ('j_j', :'j_j'), ('p_j', :'p_j');

-- ---------------------------------------------------------------------------
-- 1. The admin bans the CUSTOMER: the in-flight jobs cancel, the completed one is untouched.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'admin');
select lives_ok($$ select public.ban_user((select v from fx where k = 'customer')) $$, '1a: the admin bans the customer');
select tests.clear_auth();
select is(
  (select count(*) from public.jobs where id in (:'j_g', :'j_i', :'j_h') and status = 'cancelled'),
  3::bigint,
  '1b: the three in-flight jobs are cancelled'
);
select is(
  (select row(j.status::text, p.status::text, p.transfer_cents, p.release_requested_at is not null, coalesce(p.refund_cents, 0))
     from public.jobs j join public.payments p on p.id = :'p_j' where j.id = :'j_j'),
  row('completed'::text, 'held'::text, 3600, true, 0),
  '1c: the completed job and its approved payment are exactly as they were — outside the allow-list, outside the loop'
);

-- ---------------------------------------------------------------------------
-- 2. G and I: the worker was working — the held row stays held and UNDIRECTED, on both ledgers.
-- ---------------------------------------------------------------------------
select is(
  (select row(p.status::text, coalesce(p.refund_cents, 0), coalesce(p.transfer_cents, 0), p.refund_reason, p.release_requested_at)
     from public.payments p where p.id = :'p_g'),
  row('held'::text, 0, 0, null::text, null::timestamptz),
  '2a: the in-progress card row is left held and undirected — nothing refunded to the banned customer'
);
select is((select count(*) from public.refunds_due where id = :'p_g'), 0::bigint, '2b: and it is not in refunds_due');
select is(
  (select row(p.status::text, coalesce(p.refund_cents, 0), coalesce(p.transfer_cents, 0), p.refund_reason)
     from public.payments p where p.id = :'p_i'),
  row('held'::text, 0, 0, null::text),
  '2c: the in-progress sandbox row is left held and undirected too — the rule reads the job, not the ledger'
);
-- The worker is told in each thread, as before.
select is(
  (select count(*) from public.messages m where m.job_id in (:'j_g', :'j_i', :'j_h') and m.sender_id = :'customer'
     and m.content = 'This job was cancelled automatically because this account was suspended by Brazos.'),
  3::bigint,
  '2d: the worker is told in each cancelled thread, attributed to the banned account as before'
);
-- Pending money is pending: the deletion gate still names it to the worker.
select tests.authenticate_as(:'worker');
select is(
  (select count(*) from public.account_deletion_blockers() b where b.ref_id in (:'j_g', :'j_i') and b.kind = 'payment_incoming'),
  2::bigint,
  '2e: the worker''s pay on both jobs is still pending, so the deletion gate still names it — nothing was silently written off'
);
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 3. H: not yet started — A11's refund still applies to the banned customer's assigned job.
-- ---------------------------------------------------------------------------
select is(
  (select row(p.refund_cents, p.transfer_cents, p.refund_reason, p.status::text)
     from public.payments p where p.id = :'p_h'),
  row(5000 + 375, 0, 'account_suspended'::text, 'held'::text),
  '3a: the assigned job''s undirected row is queued for its full refund, reason account_suspended (A11 unchanged)'
);
select is((select count(*) from public.refunds_ready where id = :'p_h'), 1::bigint, '3b: and, with its provider reference, it is in refunds_ready');

-- ---------------------------------------------------------------------------
-- 4. The operator's path on the shape the ban now leaves: resolve_job_dispute() admits a cancelled
--    job with an undirected held row (the runner stands in for service_role).
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select public.resolve_job_dispute((select v from fx where k = 'j_g'), 'customer', 'a11r2: the operator decided') $$,
  '4a: the operator may resolve the card row in the customer''s favour'
);
select is(
  (select row(p.refund_cents, p.transfer_cents, p.refund_reason, p.status::text) from public.payments p where p.id = :'p_g'),
  row(8600, 0, 'dispute_refund'::text, 'held'::text),
  '4b: which queues the full refund of the charge, reason dispute_refund, held until charge.refunded'
);
-- LIMIT recorded rather than hidden (docs/runbooks/dispute-resolution.md, the "cancelled, no open
-- claim" row): paying the worker on this shape is a hand decision outside resolve_job_dispute() today.
select throws_ok(
  $$ select public.resolve_job_dispute((select v from fx where k = 'j_i'), 'worker') $$,
  'P0001', 'A cancelled job with no open claim can only be resolved in the customer''s favour',
  '4c: resolve_job_dispute() still refuses the worker''s favour on a cancelled job with no open claim — the operator''s hand decision'
);

-- ---------------------------------------------------------------------------
-- 5. The loop's shape, read from the live body: the lock, the allow-listed re-check and the skip.
-- ---------------------------------------------------------------------------
select ok(
  (select pg_get_functiondef('public.ban_user(uuid, uuid)'::regprocedure)) ~ $re$and \(client_id = p_target or assigned_worker_id = p_target\)\s+for update$re$,
  '5a: the in-flight jobs are read FOR UPDATE'
);
select ok(
  (select pg_get_functiondef('public.ban_user(uuid, uuid)'::regprocedure)) ~ $re$set status = 'cancelled'\s+where id = v_job\.id\s+and status in \('open', 'assigned', 'in_progress'\);$re$,
  '5b: the cancellation re-checks the allow-listed status it is leaving'
);
select ok(
  (select pg_get_functiondef('public.ban_user(uuid, uuid)'::regprocedure)) ~ $re$get diagnostics v_rows = row_count;\s+if v_rows = 0 then\s+continue;\s+end if;$re$,
  '5c: a job the update did not cancel is skipped whole — no money, no message'
);

-- ---------------------------------------------------------------------------
-- 6. ACL as the baseline granted it, and the comment names the ruling.
-- ---------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.ban_user(uuid, uuid)', 'EXECUTE'), '6a: authenticated may call ban_user (the admin check is inside)');
select ok(not has_function_privilege('anon', 'public.ban_user(uuid, uuid)', 'EXECUTE'), '6b: anon may not');
select ok(
  (select obj_description('public.ban_user(uuid, uuid)'::regprocedure, 'pg_proc')) like '%left undirected for the operator%',
  '6c: the comment names the shape the ban now leaves for the operator'
);

select * from finish();
rollback;
