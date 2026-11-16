-- 488_money_not_moving.sql — money M2, A5 point 12 (2e): the one state the coverage table left with no
-- line, and the rows next to it that keep their own line.
--
--   N1  a completed job, the payment held, nothing asked, nothing blocking: no line at 168 hours 59
--       minutes (a normal wait); money_not_moving at 170 hours, since = completed_at + 169 hours, and
--       it is the payment's only line; the automatic approval then asks for the release and the line
--       goes.
--   N2  each refusal of the automatic approval keeps its own line and gets no money_not_moving: an
--       open issue report (issue_open), a card dispute (card_dispute_open), and the other critic's
--       history: a 500-cent refund by hand in Stripe before the customer approved (refund_outside_app;
--       the approval, automatic or the customer's, does not pay it).
--   N3  the coordinator's row: a release asked, then the customer reports an issue. The queue drops the
--       row, the send cannot begin, two lines show it (transfer_issue_open since the release was asked,
--       issue_open since the report), and a withdrawal puts it back in the queue unchanged. A send that
--       began first refuses the report.
--   N4  payment_attention_more stays service_role only.
--   N5  A9 PART 2 b (2): the approval refuses a row with a recorded refund failure (the reservation,
--       auto_approval_deadline null): a hand refund failed on a completed, held payment, then was
--       arranged. After 169 hours, refund_failed and payout_not_automatic; after the arrangement,
--       payout_not_automatic alone; at 168 hours, no line. (N1d: a row money_not_moving lists gets no
--       payout_not_automatic.)
-- Since A9 PART 2 b, money_not_moving's eligibility is the lifecycle's auto_approval_deadline.
-- Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(22);

select tests.create_user('mn.c1@brazos.test', 'Nell Customer') as c1 \gset
select tests.create_user('mn.w1@brazos.test', 'Ned Worker')   as w1 \gset

-- ---------------------------------------------------------------------------
-- Helpers (as 487; created inside the transaction, gone at rollback).
-- ---------------------------------------------------------------------------
create or replace function tests.mn_hire(p_title text, p_customer uuid, p_worker uuid) returns uuid language plpgsql as $$
declare
  v_job uuid;
  v_offer uuid;
begin
  perform tests.clear_auth();
  -- SURGERY (B10, as 370): the limit on posts an hour is not what this file tests.
  update public.rate_counters set hits = 0 where user_id in (p_customer, p_worker);
  perform tests.authenticate_as(p_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'Money not moving probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000, p_address_line := '9 Waiting Way'
  )).id into v_job;
  perform tests.authenticate_as(p_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Waiting bid');
  perform tests.authenticate_as(p_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  return v_job;
end $$;

-- Funds the job, and the worker starts and completes it. Returns the payment id.
create or replace function tests.mn_completed(p_job uuid) returns uuid language plpgsql as $$
declare
  v_pid uuid;
begin
  v_pid := tests.test_fund_job(p_job);
  perform tests.authenticate_as((select assigned_worker_id from public.jobs where id = p_job));
  perform public.transition_job_status(p_job, 'in_progress');
  perform public.transition_job_status(p_job, 'completed', '["https://example.com/mn-done.jpg"]'::jsonb);
  perform tests.clear_auth();
  return v_pid;
end $$;

create or replace function tests.mn_event(p_id text, p_type text, p_object jsonb) returns void language plpgsql as $$
begin
  insert into public.payment_events (id, type, payload)
  values (p_id, p_type, jsonb_build_object('id', p_id, 'type', p_type, 'data', jsonb_build_object('object', p_object)));
  perform public.apply_payment_event(p_id);
end $$;

-- The payment's lines on the owner's list, by code.
create or replace function tests.mn_codes(p_pid uuid) returns text language sql as $$
  select coalesce(string_agg(a.code, ',' order by a.code), '') from public.payment_attention a where a.payment_id = p_pid
$$;

-- ---------------------------------------------------------------------------
-- N1. The hole: completed, held, nothing asked, nothing blocking.
-- ---------------------------------------------------------------------------
select tests.mn_hire('MN-N1 completed', :'c1', :'w1') as j1 \gset
select tests.mn_completed(:'j1') as p1 \gset
-- SURGERY: completion moved back in time (the automatic approval has not run in this transaction).
update public.jobs set completed_at = now() - interval '168 hours 59 minutes' where id = :'j1';
select is(tests.mn_codes(:'p1'), '',
  'N1a: 168 hours 59 minutes after completion the approval may still pay: a normal wait, no line');
update public.jobs set completed_at = now() - interval '170 hours' where id = :'j1';
select is((select concat_ws(' | ', a.since = now() - interval '1 hour', a.overdue, a.finish, a.cents = p.charge_amount_cents, a.what, a.ref = p.id::text)
             from public.payment_attention a join public.payments p on p.id = a.payment_id
            where a.payment_id = :'p1' and a.code = 'money_not_moving'),
  't | t | developer | t | payment | t',
  'N1b: 170 hours after completion: money_not_moving, since completed_at + 169 hours, overdue, the charge, the developer''s finish');
select is((select a.reason from public.payment_attention a where a.payment_id = :'p1' and a.code = 'money_not_moving'),
  'This job was completed more than 7 days ago and its payment is still held. The automatic approval should have asked for the worker''s payout by then. Ask your developer.',
  'N1c: its sentence, word for word (A9 PART 2 b)');
select is(tests.mn_codes(:'p1'), 'money_not_moving', 'N1d: it is the payment''s only line (no other line showed this state, and no payout_not_automatic)');

-- ---------------------------------------------------------------------------
-- N2. Each refusal of the automatic approval keeps its own line.
-- ---------------------------------------------------------------------------
select tests.mn_hire('MN-N2 issue', :'c1', :'w1') as j2 \gset
select tests.mn_completed(:'j2') as p2 \gset
select tests.authenticate_as(:'c1');
select public.open_job_dispute(:'j2', 'incomplete', 'MN probe report');
select tests.clear_auth();

select tests.mn_hire('MN-N2 card dispute', :'c1', :'w1') as j3 \gset
select tests.mn_completed(:'j3') as p3 \gset
select tests.mn_event('evt_mn3_dc', 'charge.dispute.created', jsonb_build_object(
  'id', 'dp_mn3', 'object', 'dispute', 'status', 'needs_response',
  'amount', (select charge_amount_cents from public.payments where id = :'p3'),
  'payment_intent', (select provider_ref from public.payments where id = :'p3')));

-- The other critic's history: completed, held, then 500 cents refunded by hand in Stripe.
select tests.mn_hire('MN-N2 hand refund', :'c1', :'w1') as j4 \gset
select tests.mn_completed(:'j4') as p4 \gset
select tests.mn_event('evt_mn4_cr', 'charge.refunded', jsonb_build_object(
  'id', 'ch_mn4', 'object', 'charge',
  'payment_intent', (select provider_ref from public.payments where id = :'p4'), 'amount_refunded', 500));

update public.jobs set completed_at = now() - interval '170 hours' where id in (:'j2', :'j3', :'j4');
select is(tests.mn_codes(:'p2') || ' / ' || tests.mn_codes(:'p3') || ' / ' || tests.mn_codes(:'p4'),
  'issue_open / card_dispute_open / refund_outside_app',
  'N2a: an open issue report, a card dispute and a hand refund each keep their own line, and none gets money_not_moving');
select is((select a.reason || ' | ' || a.finish from public.payment_attention a where a.payment_id = :'p4'),
  'Part of this payment was refunded in Stripe, outside the app, and the app has not decided what happens to the rest. The amount shown may be wrong if a refund failed. Ask your developer. | developer',
  'N2b: the hand refund''s sentence: the app decides nothing about the rest, and the next step is the developer');
select is((select status::text || '/' || refund_cents || '/' || refunded_cents from public.payments where id = :'p4'),
  'partially_refunded/500/500', 'N2c: the hand refund leaves the rest held as partially_refunded, refund_cents shown only');

-- The automatic approval runs: it asks for N1's release, and none of N2's.
select ok(public.auto_release_due_payments() >= 1, 'N1e/N2d: the automatic approval runs');
select is((select release_requested_at is not null from public.payments where id = :'p1')::text || ' / ' || tests.mn_codes(:'p1'),
  'true / ', 'N1e: the release is asked and money_not_moving goes (the payout is ready; no line for a normal wait)');
select is((select string_agg((release_requested_at is null)::text, ',' order by created_at) from public.payments where id in (:'p2', :'p3', :'p4')),
  'true,true,true', 'N2d: the approval does not pay an open report, a card dispute or a hand-refunded charge');
select tests.authenticate_as(:'c1');
select throws_ok(format('select public.release_job_payment(%L)', :'j4'), 'P0001', 'This payment is being refunded and cannot be released',
  'N2e: nor does the customer''s own approval after a hand refund');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- N3. A release asked, then the customer reports an issue (open_job_dispute, transfer_in_flight).
-- ---------------------------------------------------------------------------
select tests.mn_hire('MN-N3 release then issue', :'c1', :'w1') as j5 \gset
select tests.mn_completed(:'j5') as p5 \gset
select tests.authenticate_as(:'c1');
select public.release_job_payment(:'j5');
select (public.open_job_dispute(:'j5', 'damage', 'MN probe after release')).id as d5 \gset
select tests.clear_auth();
select is((select count(*)::integer from public.transfers_due where id = :'p5') || '/' || (select count(*)::integer from public.transfers_ready where id = :'p5'),
  '0/0', 'N3a: the report is accepted after the release was asked, and the queue drops the row (transfers_due: no open report)');
select is(public.settlement_send_begin(:'p5', 'transfer', (select transfer_attempts from public.payments where id = :'p5'),
                                       (select transfer_cents from public.payments where id = :'p5')),
  false, 'N3b: a send read from the queue before the report cannot begin (settlement_send_begin reads transfers_ready under the payment lock)');
select is((select string_agg(a.code || ':' || (a.since = case a.code when 'transfer_issue_open' then p.release_requested_at else d.created_at end)::text, ',' order by a.code)
             from public.payment_attention a join public.payments p on p.id = a.payment_id
             join public.job_disputes d on d.id = :'d5'
            where a.payment_id = :'p5'),
  'issue_open:true,transfer_issue_open:true',
  'N3c: two lines show it: issue_open since the report, transfer_issue_open since the release was asked');
select tests.authenticate_as(:'c1');
select public.withdraw_job_dispute(:'d5');
select tests.clear_auth();
select is((select count(*)::integer from public.transfers_due t join public.payments p on p.id = t.id
            where t.id = :'p5' and t.release_requested_at = p.release_requested_at and t.transfer_cents = p.transfer_cents),
  1, 'N3d: a withdrawn report puts the row back in the queue with its release unchanged');

select tests.mn_hire('MN-N3 send first', :'c1', :'w1') as j6 \gset
select tests.mn_completed(:'j6') as p6 \gset
select tests.authenticate_as(:'c1');
select public.release_job_payment(:'j6');
select tests.clear_auth();
select is(public.settlement_send_begin(:'p6', 'transfer', (select transfer_attempts from public.payments where id = :'p6'),
                                       (select transfer_cents from public.payments where id = :'p6')),
  true, 'N3e: the send begins');
select tests.authenticate_as(:'c1');
select throws_ok(format('select public.open_job_dispute(%L, %L, null)', :'j6', 'damage'), 'P0001',
  'This payment is already on its way to the worker and can no longer be held',
  'N3f: a report after the send began is refused');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- N5. A9 PART 2 b (2): a hand refund failed on a completed, held payment, then was arranged.
-- ---------------------------------------------------------------------------
select tests.mn_hire('MN-N5 refund failed', :'c1', :'w1') as j7 \gset
select tests.mn_completed(:'j7') as p7 \gset
select tests.mn_event('evt_mn7_rf', 'refund.failed', jsonb_build_object(
  'id', 're_mn7_hand', 'object', 'refund', 'amount', 1000,
  'payment_intent', (select provider_ref from public.payments where id = :'p7'),
  'status', 'failed', 'failure_reason', 'expired_or_canceled_card', 'metadata', '{}'::jsonb));
-- SURGERY: completion moved back in time.
update public.jobs set completed_at = now() - interval '170 hours' where id = :'j7';
select is(coalesce(public.auto_approval_deadline(:'j7')::text, 'null') || ' / ' || tests.mn_codes(:'p7'),
  'null / payout_not_automatic,refund_failed',
  'N5a: 170 hours after completion the approval refuses it (the failure reserves the whole charge): the failed refund''s line and payout_not_automatic');
select is((select concat_ws(' | ', a.since = j.completed_at, a.overdue, a.finish, a.cents = p.charge_amount_cents, a.reason,
                           a.detail like '%: payment still held and no release asked 169 hours later; the automatic approval does not ask for it (a refund of this charge failed before: %')
             from public.payment_attention a join public.payments p on p.id = a.payment_id join public.jobs j on j.id = p.job_id
            where a.payment_id = :'p7' and a.code = 'payout_not_automatic'),
  't | t | developer | t | This job was completed more than 7 days ago and its payment is still held. A refund on this payment failed before, so the app does not pay the worker by itself. Ask your developer. | t',
  'N5b: since the completion time, overdue, the developer''s finish, the charge, its sentence, and the cause in the detail');
select ((public.resolve_refund_failure(:'p7', 'Nothing more was owed: the card refund was not needed.')).id is not null)::text as n5_arranged \gset
select is(:'n5_arranged' || ' / ' || tests.mn_codes(:'p7'), 'true / payout_not_automatic',
  'N5c: after the arrangement payout_not_automatic alone: the money still sits held and the owner is told');
update public.jobs set completed_at = now() - interval '168 hours' where id = :'j7';
select is(tests.mn_codes(:'p7'), '', 'N5d: 168 hours after completion, no line');

-- ---------------------------------------------------------------------------
-- N4. The function stays service_role only.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'c1');
select throws_ok($$ select count(*) from public.payment_attention_more() $$, '42501', 'permission denied for function payment_attention_more',
  'N4: a signed-in user cannot call payment_attention_more');
select tests.clear_auth();

select * from finish();
rollback;
