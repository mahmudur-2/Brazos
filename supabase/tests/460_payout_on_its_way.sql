-- 460_payout_on_its_way.sql — Codex R8-A1: THE payout fact. Proves item 4 of
-- 20261115000200_work_start_money_rule.sql: payment_payout_on_its_way(payments) (the row is in
-- transfers_due, or a transfer whose send began has no recorded result while the row is held or
-- partially_refunded) and my_payouts_on_their_way() (the caller's own ids, nothing else). The app's
-- columns cannot tell an open issue after the timer's approval (Failure A), a reversed transfer
-- (Failure B) or a card dispute from a normal approval: rows 01, 05, 06, 07 and 08 read the same to
-- the app, and only this fact tells them apart. The fee rows (F1 to F6) are the late-cancellation fee
-- the worker is told about; a fee whose transfer was sent (F3) is said by released_at, not by the fact.
-- tests/payoutPromise.test.mjs mirrors every row: the same app columns and this answer.
--
-- THE CAST: a customer, a worker with an enabled payout account, a worker whose payout setup needs
-- action (hired first: an offer needs an account), an outsider, the runner (RLS bypassed; the
-- webhook's and the drain's stand-in). Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(43);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;
create temp table rowsx (name text primary key, pid uuid, expect boolean);
grant select on rowsx to anon, authenticated;

select tests.create_user('pw.customer@brazos.test', 'Pia Customer') as customer \gset
select tests.create_user('pw.worker@brazos.test',   'Pat Worker')   as worker   \gset
select tests.create_user('pw.nosetup@brazos.test',  'Nell Nosetup') as nosetup  \gset
select tests.create_user('pw.outsider@brazos.test', 'Otto Outsider') as outsider \gset
insert into fx values ('customer', :'customer'), ('worker', :'worker'), ('nosetup', :'nosetup'), ('outsider', :'outsider');

create or replace function tests.pw_event(p_id text, p_type text, p_object jsonb) returns jsonb language plpgsql as $$
begin
  insert into public.payment_events (id, type, payload)
  values (p_id, p_type, jsonb_build_object('id', p_id, 'type', p_type, 'data', jsonb_build_object('object', p_object)))
  on conflict (id) do nothing;
  return public.apply_payment_event(p_id);
end $$;

-- Hire at $50 and fund. p_stage: 'started', 'completed' (not approved) or 'approved' (the customer approves).
create or replace function tests.pw_job(p_title text, p_stage text, p_worker uuid default null) returns uuid language plpgsql as $$
declare
  v_customer uuid := (select v from fx where k = 'customer');
  v_worker   uuid := coalesce(p_worker, (select v from fx where k = 'worker'));
  v_job uuid;
  v_offer uuid;
begin
  perform tests.clear_auth();
  update public.rate_counters set hits = 0 where user_id in (v_customer, v_worker);
  perform tests.authenticate_as(v_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'Payout fact row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000, p_address_line := '5 Proof Way'
  )).id into v_job;
  perform tests.authenticate_as(v_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Payout fact bid');
  perform tests.authenticate_as(v_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  perform tests.test_fund_job(v_job);
  perform tests.authenticate_as(v_worker);
  perform public.transition_job_status(v_job, 'in_progress');
  if p_stage in ('completed', 'approved') then
    perform public.transition_job_status(v_job, 'completed', '["https://example.com/pw-done.jpg"]'::jsonb);
  end if;
  if p_stage = 'approved' then
    perform tests.authenticate_as(v_customer);
    perform public.release_job_payment(v_job);
  end if;
  perform tests.clear_auth();
  return v_job;
end $$;

create or replace function tests.pw_pid(p_job uuid) returns uuid language sql as $$
  select id from public.payments where job_id = p_job and kind = 'job_payment' and status not in ('failed', 'voided')
$$;

-- The customer cancels after the work started: the late-cancellation fee (refund the rest, transfer the fee).
create or replace function tests.pw_cancel_late(p_job uuid) returns void language plpgsql as $$
begin
  perform tests.authenticate_as((select v from fx where k = 'customer'));
  perform public.cancel_job(p_job, 'customer_cancelled');
  perform tests.clear_auth();
end $$;

-- The drain sends the transfer and records it (no transfer.created yet).
create or replace function tests.pw_transfer_sent(p_pid uuid, p_ref text) returns void language plpgsql as $$
begin
  perform public.settlement_send_begin(p_pid, 'transfer', 0, (select transfer_cents from public.payments where id = p_pid));
  perform public.record_settlement_sent(p_pid, 'transfer', p_ref, (select transfer_cents from public.payments where id = p_pid));
end $$;

-- transfer.reversed in full, by hand in Stripe.
create or replace function tests.pw_reversed(p_id text, p_pid uuid, p_ref text) returns jsonb language sql as $$
  select tests.pw_event(p_id, 'transfer.reversed', jsonb_build_object(
    'id', p_ref, 'amount', (select transfer_cents from public.payments where id = p_pid),
    'amount_reversed', (select transfer_cents from public.payments where id = p_pid), 'reversed', true,
    'metadata', jsonb_build_object('payment_id', p_pid)))
$$;

-- charge.dispute.created on the charge.
create or replace function tests.pw_card_dispute(p_id text, p_pid uuid) returns jsonb language sql as $$
  select tests.pw_event(p_id, 'charge.dispute.created', jsonb_build_object(
    'id', 'dp_' || p_id, 'status', 'needs_response',
    'payment_intent', (select provider_ref from public.payments where id = p_pid),
    'amount', (select charge_amount_cents from public.payments where id = p_pid)))
$$;

-- refund.failed: a hand refund in Stripe (no metadata) of p_amount, or of the whole charge when null.
create or replace function tests.pw_hand_refund_failed(p_id text, p_pid uuid, p_amount integer) returns jsonb language sql as $$
  select tests.pw_event(p_id, 'refund.failed', jsonb_build_object(
    'id', 're_' || p_id, 'status', 'failed', 'failure_reason', 'expired_or_canceled_card',
    'amount', coalesce(p_amount, (select charge_amount_cents from public.payments where id = p_pid)),
    'payment_intent', (select provider_ref from public.payments where id = p_pid)))
$$;

-- What the database knows, and what the app may read, for one row (the diag lines).
create or replace function tests.pw_show(p_pid uuid) returns text language sql as $$
  select format('due=%s unconfirmed=%s fact=%s | app sees: status=%s approved=%s released_at=%s refund_cents=%s transfer_cents=%s refund_failed=%s arranged=%s',
    exists (select 1 from public.transfers_due d where d.id = p.id),
    public.payment_transfer_unconfirmed(p),
    public.payment_payout_on_its_way(p),
    p.status, p.release_requested_at is not null, p.released_at is not null,
    coalesce(p.refund_cents, 0), coalesce(p.transfer_cents, 0), p.refund_failed_at is not null, p.refund_arranged_at is not null)
  from public.payments p where p.id = p_pid
$$;

-- The app's columns of one row (lib/payments.ts PAYMENT_COLUMNS, the ones the money sentences read).
create or replace function tests.pw_app(p_pid uuid) returns text language sql as $$
  select format('%s/%s/%s/%s/%s/%s/%s/%s', p.status, p.release_requested_at is not null, p.released_at is not null,
                coalesce(p.refund_cents, 0), coalesce(p.transfer_cents, 0), p.refund_failed_at is not null,
                p.refund_arranged_at is not null, coalesce(p.release_reason, 'null'))
    from public.payments p where p.id = p_pid
$$;

-- ---------------------------------------------------------------------------
-- The rows.
-- ---------------------------------------------------------------------------
-- 01. Normal approval.
select tests.pw_job('PW normal', 'approved') as j1 \gset
insert into rowsx values ('01 normal approval', tests.pw_pid(:'j1'), true);

-- 02, F2, F2b. Waiting only on the payout setup: hired while the account was enabled, then Stripe asked for more.
select tests.pw_job('PW setup', 'approved', :'nosetup') as j2 \gset
select tests.pw_job('PW fee setup', 'started', :'nosetup') as jf2 \gset
select tests.pw_job('PW fee setup refunded', 'started', :'nosetup') as jf2b \gset
select tests.set_payouts(:'nosetup', 'action_needed');
insert into rowsx values ('02 waiting only on payout setup', tests.pw_pid(:'j2'), true);
select tests.pw_cancel_late(:'jf2');
insert into rowsx values ('F2 fee waiting on payout setup', tests.pw_pid(:'jf2'), true);
-- F2b: the rest of the charge refunded (charge.refunded): partially_refunded, the fee still waits.
select tests.pw_cancel_late(:'jf2b');
select public.record_settlement_sent(tests.pw_pid(:'jf2b'), 'refund', 're_pw_f2b',
  (select refund_cents from public.payments where id = tests.pw_pid(:'jf2b'))) as sf2b \gset
select tests.pw_event('evt_pw_f2b_ref', 'charge.refunded', jsonb_build_object(
  'id', 'ch_pw_f2b', 'object', 'charge', 'payment_intent', (select provider_ref from public.payments where id = tests.pw_pid(:'jf2b')),
  'amount_refunded', (select refund_cents from public.payments where id = tests.pw_pid(:'jf2b')),
  'refunds', jsonb_build_object('data', jsonb_build_array(jsonb_build_object('id', 're_pw_f2b'))))) as rf2b \gset
insert into rowsx values ('F2b fee waiting on payout setup, the rest refunded', tests.pw_pid(:'jf2b'), true);

-- 03 (F1). The late-cancel fee, queued.
select tests.pw_job('PW fee', 'started') as j3 \gset
select tests.pw_cancel_late(:'j3');
insert into rowsx values ('03 late-cancel fee queued (F1)', tests.pw_pid(:'j3'), true);

-- 04. A queued tip (its job payment released first, transfer.created). 10 is that job payment.
select tests.pw_job('PW tip', 'approved') as j4 \gset
select tests.pw_event('evt_pw_tc4', 'transfer.created', jsonb_build_object(
  'id', 'tr_pw_4', 'amount', (select transfer_cents from public.payments where id = tests.pw_pid(:'j4')),
  'metadata', jsonb_build_object('payment_id', tests.pw_pid(:'j4')))) as tc4 \gset
select tests.authenticate_as(:'customer');
select (public.begin_tip_payment(:'j4', 1000)).id as tip4 \gset
select tests.clear_auth();
select public.attach_provider_ref(:'tip4', 'pi_pw_tip4');
select tests.pw_event('evt_pw_ts4', 'payment_intent.succeeded', jsonb_build_object(
  'id', 'pi_pw_tip4', 'amount_received', (select charge_amount_cents from public.payments where id = :'tip4'),
  'metadata', jsonb_build_object('payment_id', :'tip4'))) as ts4 \gset
insert into rowsx values ('04 queued tip', :'tip4', true);
insert into rowsx values ('10 released (the tip''s job payment, transfer.created)', tests.pw_pid(:'j4'), false);

-- 04b. A tip sent, recorded, then fully reversed by hand in Stripe (Failure B on a tip).
select tests.pw_job('PW tip reversed', 'approved') as j4b \gset
select tests.pw_event('evt_pw_tc4b', 'transfer.created', jsonb_build_object(
  'id', 'tr_pw_4b', 'amount', (select transfer_cents from public.payments where id = tests.pw_pid(:'j4b')),
  'metadata', jsonb_build_object('payment_id', tests.pw_pid(:'j4b')))) as tc4b \gset
select tests.authenticate_as(:'customer');
select (public.begin_tip_payment(:'j4b', 1000)).id as tip4b \gset
select tests.clear_auth();
select public.attach_provider_ref(:'tip4b', 'pi_pw_tip4b');
select tests.pw_event('evt_pw_ts4b', 'payment_intent.succeeded', jsonb_build_object(
  'id', 'pi_pw_tip4b', 'amount_received', (select charge_amount_cents from public.payments where id = :'tip4b'),
  'metadata', jsonb_build_object('payment_id', :'tip4b'))) as ts4b \gset
select tests.pw_transfer_sent(:'tip4b', 'tr_pw_tip4b');
select tests.pw_reversed('evt_pw_rv4b', :'tip4b', 'tr_pw_tip4b') as rv4b \gset
insert into rowsx values ('04b tip transfer reversed', :'tip4b', false);

-- 05. Failure A: approved by the timer (the 7-day fallback), then a first issue before any transfer.
select tests.pw_job('PW issue after approval', 'completed') as j5 \gset
update public.jobs set completed_at = now() - interval '8 days' where id = :'j5';
select public.auto_release_due_payments() as ar5 \gset
select tests.authenticate_as(:'customer');
select (public.open_job_dispute(:'j5', 'other')).status as d5 \gset
select tests.clear_auth();
insert into rowsx values ('05 open issue after approval (Failure A)', tests.pw_pid(:'j5'), false);

-- 06. Failure B: sent, recorded, then fully reversed by hand in Stripe.
select tests.pw_job('PW reversed', 'approved') as j6 \gset
select tests.pw_transfer_sent(tests.pw_pid(:'j6'), 'tr_pw_6');
select tests.pw_reversed('evt_pw_rv6', tests.pw_pid(:'j6'), 'tr_pw_6') as rv6 \gset
insert into rowsx values ('06 transfer reversed (Failure B)', tests.pw_pid(:'j6'), false);

-- 07. A card dispute opened on the approved charge.
select tests.pw_job('PW card dispute', 'approved') as j7 \gset
select tests.pw_card_dispute('evt_pw_cb7', tests.pw_pid(:'j7')) as cb7 \gset
insert into rowsx values ('07 card dispute open', tests.pw_pid(:'j7'), false);

-- 08. The attempt stopped (400 idempotency_error after the key's first use).
select tests.pw_job('PW stopped', 'approved') as j8 \gset
select public.settlement_send_begin(tests.pw_pid(:'j8'), 'transfer', 0,
  (select transfer_cents from public.payments where id = tests.pw_pid(:'j8'))) as b8 \gset
select public.record_settlement_result(tests.pw_pid(:'j8'), 'transfer', 0, 'stop', '400 idempotency_error') as s8 \gset
insert into rowsx values ('08 attempt stopped', tests.pw_pid(:'j8'), true);

-- 08b. The attempt past its 23 hours with no answer.
select tests.pw_job('PW expired', 'approved') as j8b \gset
select public.settlement_send_begin(tests.pw_pid(:'j8b'), 'transfer', 0,
  (select transfer_cents from public.payments where id = tests.pw_pid(:'j8b'))) as b8b \gset
update public.payments set transfer_sent_at = now() - interval '24 hours' where id = tests.pw_pid(:'j8b');
insert into rowsx values ('08b attempt past 23 hours, no answer', tests.pw_pid(:'j8b'), true);

-- 09a. Sent, the answer lost (same key next tick), transfer.created not applied.
select tests.pw_job('PW sent unknown', 'approved') as j9 \gset
select public.settlement_send_begin(tests.pw_pid(:'j9'), 'transfer', 0,
  (select transfer_cents from public.payments where id = tests.pw_pid(:'j9'))) as b9 \gset
select public.record_settlement_result(tests.pw_pid(:'j9'), 'transfer', 0, 'same_key', 'timeout') as s9 \gset
insert into rowsx values ('09a sent, answer lost, transfer.created not applied', tests.pw_pid(:'j9'), true);

-- 09b. Sent and the drain's 2xx recorded, transfer.created not applied yet.
select tests.pw_job('PW sent recorded', 'approved') as j9b \gset
select tests.pw_transfer_sent(tests.pw_pid(:'j9b'), 'tr_pw_9b');
insert into rowsx values ('09b sent, drain recorded it, transfer.created not applied', tests.pw_pid(:'j9b'), false);

-- 09c (F3). The fee's transfer sent and recorded while its refund is still queued.
select tests.pw_job('PW fee sent', 'started') as j9c \gset
select tests.pw_cancel_late(:'j9c');
select tests.pw_transfer_sent(tests.pw_pid(:'j9c'), 'tr_pw_9c');
insert into rowsx values ('09c fee sent and recorded, refund still queued (F3)', tests.pw_pid(:'j9c'), false);

-- F4. The fee, a card dispute before the send.
select tests.pw_job('PW fee card dispute', 'started') as jf4 \gset
select tests.pw_cancel_late(:'jf4');
select tests.pw_card_dispute('evt_pw_cbf4', tests.pw_pid(:'jf4')) as cbf4 \gset
insert into rowsx values ('F4 fee, card dispute before the send', tests.pw_pid(:'jf4'), false);

-- F5. The fee, sent and recorded, then fully reversed by hand in Stripe.
select tests.pw_job('PW fee reversed', 'started') as jf5 \gset
select tests.pw_cancel_late(:'jf5');
select tests.pw_transfer_sent(tests.pw_pid(:'jf5'), 'tr_pw_f5');
select tests.pw_reversed('evt_pw_rvf5', tests.pw_pid(:'jf5'), 'tr_pw_f5') as rvf5 \gset
insert into rowsx values ('F5 fee reversed after the send', tests.pw_pid(:'jf5'), false);

-- F6. The fee, the refund of the rest sent by the app and failed at the provider: the fee waits (R10).
select tests.pw_job('PW fee refund failed', 'started') as jf6 \gset
select tests.pw_cancel_late(:'jf6');
select public.record_settlement_sent(tests.pw_pid(:'jf6'), 'refund', 're_pw_f6',
  (select refund_cents from public.payments where id = tests.pw_pid(:'jf6'))) as sf6 \gset
select tests.pw_event('evt_pw_f6_fail', 'refund.failed', jsonb_build_object(
  'id', 're_pw_f6', 'object', 'refund', 'status', 'failed', 'failure_reason', 'expired_or_canceled_card',
  'amount', (select refund_cents from public.payments where id = tests.pw_pid(:'jf6')),
  'payment_intent', (select provider_ref from public.payments where id = tests.pw_pid(:'jf6')),
  'metadata', jsonb_build_object('payment_id', tests.pw_pid(:'jf6')))) as ff6 \gset
insert into rowsx values ('F6 fee, the refund of the rest failed', tests.pw_pid(:'jf6'), false);

-- 11. A refund queued with no fee: approved, an issue, decided for the customer (Codex R7's row).
select tests.pw_job('PW refund queued', 'approved') as j11 \gset
select tests.authenticate_as(:'customer');
select (public.open_job_dispute(:'j11', 'other')).status as d11 \gset
select tests.clear_auth();
select (public.resolve_job_dispute(:'j11', 'customer')).refund_cents as rf11 \gset
insert into rowsx values ('11 refund queued, no fee', tests.pw_pid(:'j11'), false);

-- 12. Never approved: completed, held, the clock still running.
select tests.pw_job('PW never approved', 'completed') as j12 \gset
insert into rowsx values ('12 never approved', tests.pw_pid(:'j12'), false);

-- 13. A hand refund in Stripe of part of the charge failed on an approved row; 13c: then the owner
--     records it arranged (resolve_refund_failure). R10: either way the transfer waits for a person.
select tests.pw_job('PW hand refund part', 'approved') as j13 \gset
select tests.pw_hand_refund_failed('evt_pw_rf13', tests.pw_pid(:'j13'), 300) as rf13 \gset
insert into rowsx values ('13a hand refund failed, part of the charge', tests.pw_pid(:'j13'), false);
select tests.pw_job('PW hand refund part arranged', 'approved') as j13c \gset
select tests.pw_hand_refund_failed('evt_pw_rf13c', tests.pw_pid(:'j13c'), 300) as rf13c \gset
select (public.resolve_refund_failure(tests.pw_pid(:'j13c'), 'refunded by hand in the dashboard')).id as ar13c \gset
insert into rowsx values ('13c hand refund failed, part, then arranged', tests.pw_pid(:'j13c'), false);

-- 14. Codex R11-A2: never approved (completed, held), a hand refund in Stripe of the whole charge failed
--     and its charge.refunded never came (refund_cents 0); 14c: then the owner records it arranged. Their
--     approval, after S10, is accepted and queues a transfer that waits for a person.
select tests.pw_job('PW never approved, hand refund failed', 'completed') as j14 \gset
select tests.pw_hand_refund_failed('evt_pw_rf14', tests.pw_pid(:'j14'), null) as rf14 \gset
insert into rowsx values ('14a never approved, hand refund failed', tests.pw_pid(:'j14'), false);
select tests.pw_job('PW never approved, hand refund arranged', 'completed') as j14c \gset
select tests.pw_hand_refund_failed('evt_pw_rf14c', tests.pw_pid(:'j14c'), null) as rf14c \gset
select (public.resolve_refund_failure(tests.pw_pid(:'j14c'), 'refunded by bank transfer')).id as ar14c \gset
insert into rowsx values ('14c never approved, hand refund arranged', tests.pw_pid(:'j14c'), false);

-- ---------------------------------------------------------------------------
-- The fact, row by row (25 rows).
-- ---------------------------------------------------------------------------
select diag(name || ': ' || tests.pw_show(pid)) from rowsx order by name;

select is(public.payment_payout_on_its_way(p), x.expect, 'row ' || x.name)
  from rowsx x join public.payments p on p.id = x.pid order by x.name;

-- What the app reads: the same columns, different facts.
select is((select count(distinct tests.pw_app(x.pid)) from rowsx x where x.name ~ '^(01|06|07|08) '), 1::bigint,
  'app columns: rows 01, 06, 07 and 08 look the same to the app; only the database tells them apart');
select is((select count(distinct tests.pw_app(x.pid)) from rowsx x where x.name ~ '^(03|F4|F5) '), 1::bigint,
  'app columns: the fee queued (F1), the fee under a card dispute (F4) and the fee reversed (F5) look the same to the app');
select is(tests.pw_app((select pid from rowsx where name like '04b %')), tests.pw_app((select pid from rowsx where name like '04 %')),
  'app columns: the reversed tip (04b) looks the same as the queued tip (04)');
select is(tests.pw_app((select pid from rowsx where name like '05 %')),
          replace(tests.pw_app((select pid from rowsx where name like '01 %')), '/approved', '/auto_approved'),
  'app columns: Failure A (05) looks the same as a normal approval by the timer');

-- ---------------------------------------------------------------------------
-- Security.
-- ---------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.my_payouts_on_their_way()', 'EXECUTE')
          and not has_function_privilege('anon', 'public.my_payouts_on_their_way()', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.my_payouts_on_their_way()', 'EXECUTE'),
  'S1: only authenticated may call my_payouts_on_their_way()');
select ok(not has_function_privilege('authenticated', 'public.payment_payout_on_its_way(public.payments)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.payment_payout_on_its_way(public.payments)', 'EXECUTE'),
  'S2: the row function is not the client''s');
select ok((select prosecdef and provolatile = 's' and proconfig @> array['search_path=public, pg_temp'] from pg_proc
            where oid = 'public.my_payouts_on_their_way()'::regprocedure),
  'S3: security definer, stable (it can write nothing: 010_offers G lists it as moving no money), search_path = public, pg_temp');
select ok((select provolatile = 's' and not prosecdef and proconfig @> array['search_path=public, pg_temp'] from pg_proc
            where oid = 'public.payment_payout_on_its_way(public.payments)'::regprocedure),
  'S4: the row function is stable, runs as its caller, search_path = public, pg_temp');

select tests.authenticate_anon();
select throws_like($$ select count(*) from public.my_payouts_on_their_way() $$, '%permission denied%',
  'S5: anon cannot call it');
select tests.clear_auth();

select tests.authenticate_as(:'outsider');
select is((select count(*) from public.my_payouts_on_their_way()), 0::bigint, 'S6: another user gets nothing');
select tests.clear_auth();

select tests.authenticate_as(:'customer');
select set_eq($$ select * from public.my_payouts_on_their_way() $$,
  $$ select pid from rowsx where expect $$,
  'S7: the customer gets the ids of their payments whose payout is on its way, and no other');
select tests.clear_auth();

select tests.authenticate_as(:'worker');
select set_eq($$ select * from public.my_payouts_on_their_way() $$,
  format($q$ select x.pid from rowsx x join public.payments p on p.id = x.pid where x.expect and p.payee_id = %L $q$, :'worker'),
  'S8: the worker gets their own, not the other worker''s');
select tests.clear_auth();

select tests.authenticate_as(:'nosetup');
select set_eq($$ select * from public.my_payouts_on_their_way() $$,
  $$ select pid from rowsx where name ~ '^(02|F2|F2b) ' $$,
  'S9: the worker whose setup needs action gets their rows (02, F2, F2b), waiting on the setup');
select tests.clear_auth();

-- The customer of row 02 learns nothing about the worker's setup: rows 01 and 02 give the same answer.
select is((select public.payment_payout_on_its_way(p) from public.payments p where p.id = (select pid from rowsx where name like '02 %')),
          (select public.payment_payout_on_its_way(p) from public.payments p where p.id = (select pid from rowsx where name like '01 %')),
  'S10: waiting on the setup and transferring read the same to the customer');

-- R11-A2: approval stays available on 14a and 14c (the customer approves the work; the owner decides the
-- money): accepted, the transfer queued, nothing due, no payout on its way, and payment_attention says a
-- person decides. Row 12, the control: the same approval is due and on its way.
select tests.authenticate_as(:'customer');
select (public.release_job_payment(:'j12')).release_reason as ap12,
       (public.release_job_payment(:'j14')).release_reason as ap14,
       (public.release_job_payment(:'j14c')).release_reason as ap14c \gset
select tests.clear_auth();
select is((select string_agg(format('%s %s/%s/%s/%s/%s', split_part(x.name, ' ', 1), p.release_reason, p.transfer_cents,
                                    exists (select 1 from public.transfers_due d where d.id = p.id),
                                    public.payment_payout_on_its_way(p),
                                    (select count(*) from public.payment_attention a where a.payment_id = p.id
                                       and a.code = 'transfer_more_than_left')),
                             ', ' order by x.name)
             from rowsx x join public.payments p on p.id = x.pid where x.name ~ '^(12|14a|14c) '),
  '12 approved/4625/t/t/0, 14a approved/4625/f/f/1, 14c approved/4625/f/f/1',
  'R11-A2: approving a never-approved row whose hand refund failed (14a) or was arranged (14c) is accepted and queues the transfer, but nothing is due, no payout is on its way and payment_attention says a person decides; the same approval of row 12 is due and on its way');

-- R12-A1: a row like 14a whose customer opens an issue, withdraws it, then approves. Withdrawing changes
-- the issue, not the failure record, which still holds the whole charge: not due, no payout on its way,
-- and payment_attention says a person decides.
select tests.pw_job('PW never approved, hand refund failed, issue withdrawn', 'completed') as j14w \gset
select tests.pw_hand_refund_failed('evt_pw_rf14w', tests.pw_pid(:'j14w'), null) as rf14w \gset
select tests.authenticate_as(:'customer');
select (public.open_job_dispute(:'j14w', 'other')).id as d14w \gset
select (public.withdraw_job_dispute(:'d14w')).status as w14w \gset
select (public.release_job_payment(:'j14w')).release_reason as ap14w \gset
select tests.clear_auth();
select is((select format('%s/%s/%s/%s/%s/%s/%s', d.status, p.refund_failed_at is not null, p.release_reason, p.transfer_cents,
                         exists (select 1 from public.transfers_due t where t.id = p.id),
                         public.payment_payout_on_its_way(p),
                         (select count(*) from public.payment_attention a where a.payment_id = p.id
                            and a.code = 'transfer_more_than_left'))
             from public.payments p join public.job_disputes d on d.payment_id = p.id
            where p.id = tests.pw_pid(:'j14w')),
  'withdrawn/t/approved/4625/f/f/1',
  'R12-A1: a never-approved row whose hand refund failed, its issue opened and withdrawn, then approved: the failure stands, the transfer is queued, but nothing is due, no payout is on its way and payment_attention says a person decides');

-- ---------------------------------------------------------------------------
-- The invariant: the fact is transfers_due, except a begun transfer whose attempt closed.
-- ---------------------------------------------------------------------------
select is((select count(*) from public.payments p
            where public.payment_payout_on_its_way(p) <> exists (select 1 from public.transfers_due d where d.id = p.id)
              and not public.payment_transfer_unconfirmed(p)), 0::bigint,
  'INV: every row outside a begun transfer: the fact is membership of transfers_due');
select set_eq($$ select p.id from public.payments p
                  where public.payment_payout_on_its_way(p) and not exists (select 1 from public.transfers_due d where d.id = p.id) $$,
  $$ select pid from rowsx where name ~ '^08' $$,
  'INV2: the only rows the fact adds to the queue are the begun transfers whose attempt closed (08, 08b)');

select * from finish();
rollback;
