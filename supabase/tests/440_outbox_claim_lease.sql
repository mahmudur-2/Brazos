-- 440_outbox_claim_lease.sql — pack 1, A14 (a claimed row is leased) and A13 (a receipt goes out only
-- for money that stayed with the worker). Proves 20261115000400_receipt_and_push_claims.sql.
--
-- THE LEASE. Neither sender has a time budget or a fetch timeout (send-push/index.ts:36-39 and
-- :219-226, send-receipts/index.ts:55-56 and :216-228), so the longest run is the platform's
-- wall-clock limit, 400 seconds. A claim leases its rows for 10 minutes: an overlapping run cannot
-- claim them again, and a row whose last attempt is still out is not swept to failed under it.
--
-- THE CAST: a customer and a worker; the runner writes the ledger rows directly (190_receipts.sql's
-- way), calls the two owner-only transfer writers, and plays both senders' service-role calls. The
-- local Vault holds no drain secrets, so a drain that decides to wake raises
-- 'drain_receipts: vault secrets missing' (337_drain_apikey_probe.sql). Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(26);

select tests.create_user('ol.customer@brazos.test', 'Ola Customer') as customer \gset
select tests.create_user('ol.worker@brazos.test',   'Oli Worker')   as worker   \gset

-- SURGERY: only this file's receipts are pending, so the drain's answer is about them.
update public.receipt_outbox set status = 'sent' where status = 'pending';

create or replace function tests.ol_try(p_sql text) returns text language plpgsql as $$
declare v_out text;
begin
  execute p_sql into v_out;
  return 'ok: ' || coalesce(v_out, 'null');
exception when others then
  return 'error: ' || sqlerrm;
end $$;

-- A completed $50 job whose payment asked for its transfer (4625 to the worker). Returns the payment.
create or replace function tests.ol_payment(p_title text, p_customer uuid, p_worker uuid) returns uuid language plpgsql as $$
declare
  v_job uuid;
  v_pid uuid;
begin
  insert into public.jobs (client_id, title, category, location, assigned_worker_id, status, completed_at)
  values (p_customer, p_title, 'other', 'Probe Area', p_worker, 'completed', now() - interval '1 hour')
  returning id into v_job;
  insert into public.payments (job_id, payer_id, payee_id, amount_cents, customer_fee_cents, platform_fee_cents,
                               transfer_cents, provider, provider_ref, status, held_at, release_requested_at, release_reason)
  values (v_job, p_customer, p_worker, 5000, 375, 375,
          4625, 'stripe', 'pi_ol_' || left(md5(p_title), 12), 'held', now() - interval '2 days', now() - interval '1 hour', 'approved')
  returning id into v_pid;
  return v_pid;
end $$;

create temp table ol_claim (round int, id uuid, payment_id uuid, next_attempt_at timestamptz);

-- ---------------------------------------------------------------------------
-- 0. Control: nothing waiting, nothing woken.
-- ---------------------------------------------------------------------------
select is(tests.ol_try('select public.drain_receipts()::text'), 'ok: null', '0a: with no receipt waiting, nothing is woken');

-- ---------------------------------------------------------------------------
-- 1. Receipts: a claim leases its rows.
-- ---------------------------------------------------------------------------
select tests.ol_payment('OL released', :'customer', :'worker') as p1 \gset
select public.payment_record_transfer(:'p1', 'tr_ol_p1', 4625) as t1 \gset
insert into ol_claim select 1, c.id, c.payment_id, c.next_attempt_at from public.claim_receipt_batch(20) c;
select is((select count(*) from ol_claim where round = 1 and payment_id = :'p1'), 2::bigint,
  '1a: the release''s two receipts are claimed');
select ok((select coalesce(bool_and(next_attempt_at = now() + interval '10 minutes'), false) from ol_claim where round = 1 and payment_id = :'p1'),
  '1b: each is leased for 10 minutes');
insert into ol_claim select 2, c.id, c.payment_id, c.next_attempt_at from public.claim_receipt_batch(20) c;
select is((select count(*) from ol_claim where round = 2 and payment_id = :'p1'), 0::bigint,
  '1c: an overlapping run claims neither again');

-- ---------------------------------------------------------------------------
-- 2. Receipts: a fifth attempt still out, and one that never answered.
-- ---------------------------------------------------------------------------
update public.receipt_outbox set attempts = 5, next_attempt_at = now() + interval '5 minutes'
 where payment_id = :'p1' and role = 'customer';
update public.receipt_outbox set attempts = 5, next_attempt_at = now() - interval '1 minute'
 where payment_id = :'p1' and role = 'worker';
select is(tests.ol_try('select public.drain_receipts()::text'), 'error: drain_receipts: vault secrets missing',
  '2a: a row that used five attempts and whose lease ran out wakes the sender, so it can be swept');
select tests.ol_try('select count(*)::text from public.claim_receipt_batch(20)') as sweep \gset
select is((select status || ' / ' || coalesce(last_error, 'null') from public.receipt_outbox where payment_id = :'p1' and role = 'worker'),
  'failed / retries exhausted', '2b: the claim ends it failed, with the reason written');
select is((select status || ' / ' || attempts from public.receipt_outbox where payment_id = :'p1' and role = 'customer'),
  'pending / 5', '2c: a fifth attempt still under its lease waits for the sender''s answer');

-- ---------------------------------------------------------------------------
-- 3. A13: released, then reversed in full: the worker has nothing, so no receipt goes.
-- ---------------------------------------------------------------------------
select tests.ol_payment('OL reversed', :'customer', :'worker') as p2 \gset
select public.payment_record_transfer(:'p2', 'tr_ol_p2', 4625) as t2 \gset
select public.payment_record_reversal(:'p2', 'tr_ol_p2', 4625, 4625);
insert into ol_claim select 3, c.id, c.payment_id, c.next_attempt_at from public.claim_receipt_batch(20) c;
select is((select count(*) from ol_claim where round = 3 and payment_id = :'p2'), 0::bigint,
  '3a: the receipts of a reversed payment are not claimed');
select is(public.receipt_details(:'p2') ->> 'released_at', null, '3b: and its details carry no release time');
select is(tests.ol_try('select public.drain_receipts()::text'), 'ok: null',
  '3c: receipts waiting on a parked payment wake nothing');

-- ---------------------------------------------------------------------------
-- 4. A13: what the worker was paid is what the provider left with them.
-- ---------------------------------------------------------------------------
select tests.ol_payment('OL part reversed', :'customer', :'worker') as p3 \gset
select public.payment_record_transfer(:'p3', 'tr_ol_p3', 4625) as t3 \gset
select public.payment_record_reversal(:'p3', 'tr_ol_p3', 4625, 1000);
select is((public.receipt_details(:'p3') ->> 'paid_to_worker_cents')::int, 3625,
  '4a: a transfer reversed in part: the receipt says 3625, not 4625');
select is((public.receipt_details(:'p1') ->> 'paid_to_worker_cents')::int, 4625,
  '4b (control): a live transfer: the receipt says 4625');

-- ---------------------------------------------------------------------------
-- 5. A13: a payment that can never be released again: its receipts are skipped.
-- ---------------------------------------------------------------------------
select tests.ol_payment('OL refunded', :'customer', :'worker') as p4 \gset
select public.payment_record_transfer(:'p4', 'tr_ol_p4', 4625) as t4 \gset
select public.payment_record_reversal(:'p4', 'tr_ol_p4', 4625, 4625);
update public.payments set status = 'refunded', refunded_cents = charge_amount_cents where id = :'p4';
select tests.ol_payment('OL part refunded', :'customer', :'worker') as p5 \gset
select public.payment_record_transfer(:'p5', 'tr_ol_p5', 4625) as t5 \gset
select public.payment_record_reversal(:'p5', 'tr_ol_p5', 4625, 4625);
update public.payments set status = 'partially_refunded', refunded_cents = 1000 where id = :'p5';
select tests.ol_try('select count(*)::text from public.claim_receipt_batch(20)') as skip_sweep \gset
select is((select string_agg(distinct status, ',') from public.receipt_outbox where payment_id in (:'p4', :'p5')), 'skipped',
  '5a: refunded and partially refunded: every receipt is skipped, none sent');

-- ---------------------------------------------------------------------------
-- 6. Pushes: a claim leases its rows.
-- ---------------------------------------------------------------------------
insert into public.notification_outbox (recipient_id, category, type, title, body, dedupe_key)
values (:'worker', 'messages', 'ol_lease', 'OL', 'lease', 'ol:lease')
returning id as n1 \gset
select is((select count(*) from public.claim_notification_batch(100) c where c.outbox_id = :'n1'), 1::bigint,
  '6a: the push is claimed');
select is((select send_after from public.notification_outbox where id = :'n1'), now() + interval '10 minutes',
  '6b: and leased for 10 minutes');
select is((select count(*) from public.claim_notification_batch(100) c where c.outbox_id = :'n1'), 0::bigint,
  '6c: an overlapping run does not claim it again');

-- ---------------------------------------------------------------------------
-- 7. Codex R2-A2: reversed in full after the claim. The sender then reads no release time and leaves
--    the receipt pending under its lease, unresolved (send-receipts/index.ts; tests/receipts.test.mjs).
--    The claim takes it again once the payment is released again.
-- ---------------------------------------------------------------------------
select tests.ol_payment('OL reversed after claim', :'customer', :'worker') as p6 \gset
select job_id as j6 from public.payments where id = :'p6' \gset
select public.payment_record_transfer(:'p6', 'tr_ol_p6a', 4625) as t6a \gset
insert into ol_claim select 7, c.id, c.payment_id, c.next_attempt_at from public.claim_receipt_batch(20) c;
select is((select count(*) from ol_claim where round = 7 and payment_id = :'p6'), 2::bigint,
  '7a: the release''s two receipts are claimed');
select public.payment_record_reversal(:'p6', 'tr_ol_p6a', 4625, 4625);
select is(public.receipt_details(:'p6') ->> 'released_at', null,
  '7b: reversed before the sender reads it: the details carry no release time');
update public.receipt_outbox set next_attempt_at = now() - interval '1 minute' where payment_id = :'p6';
insert into ol_claim select 8, c.id, c.payment_id, c.next_attempt_at from public.claim_receipt_batch(20) c;
select is((select count(*) from ol_claim where round = 8 and payment_id = :'p6'), 0::bigint,
  '7c: the lease is over: not claimed while the payment is held');
select is((select string_agg(distinct status || '/' || attempts, ',') from public.receipt_outbox where payment_id = :'p6'),
  'pending/1', '7d: still pending with one attempt used, neither failed nor skipped');
select tests.ol_try(format('select (public.resolve_job_dispute(%L, %L)).transfer_attempts::text', :'j6', 'worker')) as r6 \gset
select public.payment_record_transfer(:'p6', 'tr_ol_p6b', 4625) as t6b \gset
select is((select status::text from public.payments where id = :'p6'), 'released',
  '7e: resolved for the worker and the replacement transfer recorded: released again');
insert into ol_claim select 9, c.id, c.payment_id, c.next_attempt_at from public.claim_receipt_batch(20) c;
select is((select count(*) from ol_claim where round = 9 and payment_id = :'p6'), 2::bigint,
  '7f: both receipts are claimed again');
select is((select string_agg(distinct attempts::text, ',') from public.receipt_outbox where payment_id = :'p6'), '2',
  '7g: on their second attempt');
select isnt(public.receipt_details(:'p6') ->> 'released_at', null, '7h: and the details carry the release time');

-- ---------------------------------------------------------------------------
-- 8. A crashed run: claimed and never resolved. After the lease the next claim takes it again.
-- ---------------------------------------------------------------------------
select tests.ol_payment('OL crashed run', :'customer', :'worker') as p7 \gset
select public.payment_record_transfer(:'p7', 'tr_ol_p7', 4625) as t7 \gset
insert into ol_claim select 10, c.id, c.payment_id, c.next_attempt_at from public.claim_receipt_batch(20) c;
select is((select count(*) from ol_claim where round = 10 and payment_id = :'p7'), 2::bigint, '8a: both receipts are claimed');
update public.receipt_outbox set next_attempt_at = now() - interval '1 minute' where payment_id = :'p7';
insert into ol_claim select 11, c.id, c.payment_id, c.next_attempt_at from public.claim_receipt_batch(20) c;
select is((select count(*)::text || ' / ' || string_agg(distinct r.attempts::text, ',')
             from ol_claim c join public.receipt_outbox r on r.id = c.id where c.round = 11 and c.payment_id = :'p7'),
  '2 / 2', '8b: the lease over, both are claimed again, attempts = 2');

select * from finish();
rollback;
