-- 030_payments.sql — the R4 money proofs: 20260905000000_stripe_foundation.sql
-- proven before the operator applies it anywhere. Each section is one line of
-- the run's PROOF LEDGER (C-2 bullets 1–14); its assertions say which.
--
-- THE CAST (named once; every assertion says which of these it ran as):
--   customer   posts every job here, funds, releases, tips, reports
--   worker     bids on every job and is hired on all of them
--   bidder     bids on some and loses (the losing bidder)
--   stranger   an unrelated, active, authenticated account
--   anon       no session at all
--   service    the service role (set_config role/claims, as R5's crons run)
--   runner     the connection's own role, RLS bypassed — fixtures, ground
--              truth, and the stand-in for R5's webhook (payment_events rows)
--
-- THE FIXTURE: every job is hired through the real RPCs (create_job,
-- create_offer, accept_offer) by tests.r4_hire, funded through
-- begin_job_payment + a synthesized payment_intent.succeeded event
-- (tests.r4_fund, or the shared tests.test_fund_job), and rolled back at the
-- end. Provider events are payment_events rows carrying
-- the minimum payload shape apply_payment_event reads, applied by the runner.
--
-- FIXTURE SURGERY, DECLARED (each one is a state the product cannot reach in
-- a single transaction, or cannot reach at all):
--   * job_agreements.accepted_at is rewound (the 15-minute grace cannot be
--     waited out). The table is immutable by trigger for every role, so
--     tests.r4_age_agreement disables that trigger for one UPDATE and
--     re-enables it; §12 then proves the trigger is back on.
--   * jobs.completed_at is rewound 73 hours for the two auto-release clocks.
--   * release_requested_at is rewound one hour so "unchanged" is provable
--     (now() is constant inside the transaction).
--   * one payments row is set to 'authorized' on a completed job — a state
--     unreachable since the held gate — to prove release's "not held" refusal.
--   * one job is cancelled by a raw UPDATE, the shape ban_user() and
--     delete_my_account() write (cancel_reason null), for D7's fifth outcome.
--   * one notification_outbox row is flipped pending -> sent, as the drain
--     would, for the auto-release gate.
--
-- PAIRING: every refusal sits beside the positive control on the same
-- fixture. throws_ok pins code AND message; a null code would pass on a typo.
-- Anon's "zero rows" on the owner-only tables is asserted as the stronger
-- 42501 (no grant at all); app_config, which anon reads by design, is the
-- positive control.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(286);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('r4.customer@brazos.test', 'Cara Customer') as customer \gset
select tests.create_user('r4.worker@brazos.test',   'Wren Worker')   as worker   \gset
select tests.create_user('r4.bidder@brazos.test',   'Bo Bidder')     as bidder   \gset
select tests.create_user('r4.stranger@brazos.test', 'Sal Stranger')  as stranger \gset
insert into fx values ('customer', :'customer'), ('worker', :'worker'), ('bidder', :'bidder'), ('stranger', :'stranger');

-- ---------------------------------------------------------------------------
-- Helpers for this file. Created inside the transaction, gone at rollback.
-- ---------------------------------------------------------------------------
create or replace function tests.r4_today() returns date language sql stable as $$
  select (now() at time zone 'America/New_York')::date
$$;

-- Hire the worker on a fresh job through the real RPCs; an optional losing bidder.
create or replace function tests.r4_hire(p_customer uuid, p_worker uuid, p_amount integer, p_title text,
  p_scheduled_date date default null, p_start smallint default null, p_end smallint default null,
  p_bidder uuid default null)
returns uuid language plpgsql as $$
declare
  v_job uuid;
  v_offer uuid;
begin
  perform tests.authenticate_as(p_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'R4 probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := p_amount, p_budget_max_cents := p_amount,
    p_address_line := '4 Proof Way',
    p_scheduled_date := p_scheduled_date,
    p_arrival_start_hour := p_start, p_arrival_end_hour := p_end
  )).id into v_job;
  perform tests.authenticate_as(p_worker);
  v_offer := public.create_offer(p_amount_cents := p_amount, p_job_id := v_job, p_message := 'R4 bid');
  if p_bidder is not null then
    perform tests.authenticate_as(p_bidder);
    perform public.create_offer(p_amount_cents := p_amount + 100, p_job_id := v_job, p_message := 'R4 losing bid');
  end if;
  perform tests.authenticate_as(p_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  return v_job;
end $$;

-- A provider event, in the minimum shape apply_payment_event reads, applied.
create or replace function tests.r4_event(p_id text, p_type text, p_payment text,
  p_object jsonb default '{}'::jsonb, p_with_metadata boolean default true)
returns jsonb language plpgsql as $$
declare
  v_obj jsonb := coalesce(p_object, '{}'::jsonb);
begin
  if p_with_metadata then
    v_obj := v_obj || jsonb_build_object('metadata', jsonb_build_object('payment_id', p_payment));
  end if;
  insert into public.payment_events (id, type, payload)
  values (p_id, p_type, jsonb_build_object('id', p_id, 'type', p_type, 'data', jsonb_build_object('object', v_obj)))
  on conflict (id) do nothing;
  return public.apply_payment_event(p_id);
end $$;

-- The stripe checkout: begin_job_payment as the customer, the intent id
-- attached, payment_intent.succeeded applied. Returns the payment id.
create or replace function tests.r4_fund(p_customer uuid, p_job uuid, p_evt text) returns uuid language plpgsql as $$
declare v_pid uuid;
begin
  perform tests.authenticate_as(p_customer);
  v_pid := (public.begin_job_payment(p_job)).id;
  perform tests.clear_auth();
  perform public.attach_provider_ref(v_pid, 'pi_' || p_evt);
  perform tests.r4_event(p_evt, 'payment_intent.succeeded', v_pid::text, jsonb_build_object('id', 'pi_' || p_evt));
  return v_pid;
end $$;

create or replace function tests.r4_work(p_worker uuid, p_job uuid, p_complete boolean default true) returns void language plpgsql as $$
begin
  perform tests.authenticate_as(p_worker);
  perform public.transition_job_status(p_job, 'in_progress');
  if p_complete then
    perform public.transition_job_status(p_job, 'completed', '["https://example.com/r4-done.jpg"]'::jsonb);
  end if;
  perform tests.clear_auth();
end $$;

-- The stripe release: release_job_payment as the customer, transfer.created applied.
create or replace function tests.r4_release(p_customer uuid, p_job uuid, p_evt text) returns uuid language plpgsql as $$
declare v_pid uuid;
begin
  perform tests.authenticate_as(p_customer);
  v_pid := (public.release_job_payment(p_job)).id;
  perform tests.clear_auth();
  perform tests.r4_event(p_evt, 'transfer.created', v_pid::text, jsonb_build_object('id', 'tr_' || p_evt));
  return v_pid;
end $$;

-- SURGERY: rewind the snapshot's accepted_at through the immutability trigger.
create or replace function tests.r4_age_agreement(p_job uuid, p_by interval) returns void language plpgsql as $$
begin
  alter table public.job_agreements disable trigger job_agreements_immutable;
  update public.job_agreements set accepted_at = accepted_at - p_by where job_id = p_job;
  alter table public.job_agreements enable trigger job_agreements_immutable;
end $$;

-- D5's measurement, taken before this file hires anything: a job hired
-- before the migration has no snapshot and no 15-minute grace. Locally the
-- seed's two hires set accepted_offer_id after the migration, so the trigger
-- wrote theirs; on staging the operator reads this number by hand.
select is((select count(*) from public.jobs j where j.accepted_offer_id is not null
             and not exists (select 1 from public.job_agreements a where a.job_id = j.id)), 0::bigint,
  'D5: zero jobs hired without an agreement snapshot on this stack');

-- ===========================================================================
-- §12. job_agreements — written once at acceptance, immutable, party-readable
-- ===========================================================================
select tests.r4_hire(:'customer', :'worker', 5000, 'R4 J1 main walk', (tests.r4_today() + 3), 9::smallint, 12::smallint, :'bidder') as j1 \gset
insert into fx values ('j1', :'j1');
select accepted_offer_id as o1 from public.jobs where id = :'j1' \gset
select is((select count(*) from public.job_agreements where job_id = :'j1'), 1::bigint,
  '12: accepting a marketplace bid wrote exactly one agreement snapshot');
select ok((select a.offer_id = :'o1' and a.customer_id = :'customer' and a.worker_id = :'worker'
             and a.category = 'other' and a.title = 'R4 J1 main walk' and a.description = 'R4 probe row, rolled back'
             and a.agreed_price_cents = 5000 and a.customer_fee_cents = 375 and a.worker_fee_cents = 375
             and a.tax_cents = 0 and a.total_cents = 5375
             and a.cancel_fee_bps = 2000 and a.cancel_fee_min_cents = 1500 and a.cancel_fee_max_cents = 3500
             and a.fee_schedule_id = (select f.id from public.current_fee() f)
             and a.scheduled_date = j.scheduled_date and a.arrival_start_hour = 9 and a.arrival_end_hour = 12
             and a.accepted_at is not null
           from public.job_agreements a join public.jobs j on j.id = a.job_id where a.job_id = :'j1'),
  '12: the marketplace snapshot carries the scope text, the agreed price, both fee sides, tax, the all-in total, the cancellation terms, the policy version and the schedule');
select accepted_at as j1_accepted from public.job_agreements where job_id = :'j1' \gset
select tests.authenticate_as(:'customer');
select is(public.accept_offer(:'o1'), :'j1'::uuid, '12: a repeated accept is idempotent (same job id back)');
select tests.clear_auth();
select is((select count(*) from public.job_agreements where job_id = :'j1'), 1::bigint, '12: a repeated accept writes nothing new');
select is((select accepted_at from public.job_agreements where job_id = :'j1'), :'j1_accepted'::timestamptz, '12: … and leaves accepted_at exactly as written');

-- a direct offer: the customer offers, the worker accepts, the draft job is hired
select tests.authenticate_as(:'customer');
select public.create_offer(p_amount_cents := 4000, p_worker_id := :'worker', p_title := 'R4 J2 direct offer',
  p_description := 'direct probe, rolled back', p_category := 'other', p_location := 'Probe Area') as o2 \gset
select job_id as j2 from public.job_offers where id = :'o2' \gset
insert into fx values ('j2', :'j2');
select tests.authenticate_as(:'worker');
select is(public.accept_offer(:'o2'), :'j2'::uuid, '12: the worker accepts the direct offer');
select tests.clear_auth();
select ok((select a.offer_id = :'o2' and a.customer_id = :'customer' and a.worker_id = :'worker'
             and a.title = 'R4 J2 direct offer' and a.agreed_price_cents = 4000
             and a.customer_fee_cents = 300 and a.worker_fee_cents = 300 and a.tax_cents = 0 and a.total_cents = 4300
             and a.cancel_fee_bps = 2000 and a.cancel_fee_min_cents = 1500 and a.cancel_fee_max_cents = 3500
             and a.scheduled_date is null and a.arrival_start_hour is null
           from public.job_agreements a where a.job_id = :'j2'),
  '12: the direct-offer snapshot carries the offer''s price, fees, tax and cancellation terms');
select throws_ok($$ update public.job_agreements set title = 'rewritten' where job_id = (select v from fx where k = 'j1') $$,
  'P0001', 'job_agreements is immutable: the written terms of a hire cannot be changed', '12: UPDATE raises for the runner role (the immutability trigger is on after the fixture surgery)');
select ok(not has_table_privilege('service_role', 'public.job_agreements', 'UPDATE'), '12: service_role holds no UPDATE on job_agreements');
select ok(not has_table_privilege('service_role', 'public.job_agreements', 'DELETE'), '12: service_role holds no DELETE on job_agreements');
select ok(not has_table_privilege('authenticated', 'public.job_agreements', 'DELETE'), '12: authenticated holds no DELETE on job_agreements');
select tests.authenticate_as(:'customer');
select is((select count(*) from public.job_agreements where job_id in (:'j1', :'j2')), 2::bigint, '12: the customer reads both agreements');
select throws_ok($$ delete from public.job_agreements where job_id = (select v from fx where k = 'j1') $$,
  '42501', 'permission denied for table job_agreements', '12: a direct DELETE by a client role is refused');
select throws_ok($$ update public.job_agreements set title = 'x' where job_id = (select v from fx where k = 'j1') $$,
  '42501', 'permission denied for table job_agreements', '12: a direct UPDATE by a client role is refused at the grant, before the trigger');
select tests.authenticate_as(:'worker');
select is((select count(*) from public.job_agreements where job_id in (:'j1', :'j2')), 2::bigint, '12: the worker reads both agreements');
select tests.authenticate_as(:'bidder');
select is((select count(*) from public.job_agreements where job_id in (:'j1', :'j2')), 0::bigint, '12: the losing bidder reads zero rows');
select tests.authenticate_as(:'stranger');
select is((select count(*) from public.job_agreements where job_id in (:'j1', :'j2')), 0::bigint, '12: a stranger reads zero rows');
select tests.authenticate_anon();
select throws_ok($$ select count(*) from public.job_agreements $$, '42501', 'permission denied for table job_agreements', '12: anon cannot read job_agreements at all');
select tests.clear_auth();

-- ===========================================================================
-- §7 (first half) + §3 (stripe) + §1 + §2 + §6 — the J1 main walk
-- ===========================================================================
select tests.authenticate_as(:'customer');
select (public.begin_job_payment(:'j1')).id as p1 \gset
insert into fx values ('p1', :'p1');
select ok((select status = 'unfunded' and provider = 'stripe' and kind = 'job_payment'
             and amount_cents = 5000 and customer_fee_cents = 375 and platform_fee_cents = 375 and tax_cents = 0
             and charge_amount_cents = 5375 and customer_fee_bps = 750 and worker_fee_bps = 750
             and funding_due_at is not null and payer_id = :'customer' and payee_id = :'worker'
           from public.payments where id = :'p1'),
  '7: begin_job_payment freezes both fee sides and tax; charge_amount_cents = amount + customer fee + tax');
select is((public.begin_job_payment(:'j1')).id, :'p1'::uuid, '7: begin_job_payment is idempotent on the unfunded row');
select tests.authenticate_as(:'worker');
select throws_ok($$ select public.transition_job_status((select v from fx where k = 'j1'), 'in_progress') $$,
  'P0001', 'The customer hasn''t protected the payment yet. You''ll get a notification the moment it''s held.',
  '3: stripe path: assigned -> in_progress is refused while the payment is unfunded');
select tests.clear_auth();
select public.attach_provider_ref(:'p1', 'pi_j1');
select is((select provider_ref from public.payments where id = :'p1'), 'pi_j1', 'attach_provider_ref records the intent id once');
select public.attach_provider_ref(:'p1', 'pi_other');
select is((select provider_ref from public.payments where id = :'p1'), 'pi_j1', 'attach_provider_ref never overwrites a recorded intent id');

-- §1 idempotency and the bad payload
select is(tests.r4_event('evt_j1_succeeded', 'payment_intent.succeeded', :'p1'::text, '{"id":"pi_j1"}'::jsonb) ->> 'ok', 'true',
  '1: payment_intent.succeeded applies (ok:true)');
select ok((select status = 'held' and held_at is not null from public.payments where id = :'p1'), '1: the row is held in protection');
select held_at as p1_held from public.payments where id = :'p1' \gset
select is(public.apply_payment_event('evt_j1_succeeded') ->> 'already', 'true', '1: replaying the same event id (2nd) reports already');
select is(public.apply_payment_event('evt_j1_succeeded') ->> 'already', 'true', '1: replaying the same event id (3rd) reports already');
select is((select held_at from public.payments where id = :'p1'), :'p1_held'::timestamptz, '1: three applications of one event id moved the row exactly once');
select ok((select processed_at is not null and attempts = 0 and error is null and payment_id = :'p1' from public.payment_events where id = 'evt_j1_succeeded'),
  '1: the processed event records its payment and no error');
select is(tests.r4_event('evt_bad', 'payment_intent.succeeded', 'not-a-uuid', '{"id":"pi_bad"}'::jsonb) ->> 'ok', 'false',
  '1: a bad payload returns ok:false rather than raising');
select ok((select processed_at is null and attempts = 1 and error like '%invalid input syntax for type uuid%' from public.payment_events where id = 'evt_bad'),
  '1: the bad payload is recorded on the event — unprocessed, attempts 1, the error text');
select is(public.apply_payment_event('evt_bad') ->> 'ok', 'false', '1: a retry of the bad event fails the same way');
select is((select attempts from public.payment_events where id = 'evt_bad'), 2, '1: … and counts the attempt');
select is(public.apply_payment_event('evt_missing') ->> 'error', 'unknown event', '1: an unknown event id is reported, not raised');
select is((select status::text from public.payments where id = :'p1'), 'held', '1: the bad events touched no ledger row');

-- §3 the start lands once held; §2 refusals before completion
select tests.authenticate_as(:'worker');
select is((public.transition_job_status(:'j1', 'in_progress')).status::text, 'in_progress', '3: stripe path: the start succeeds once the payment is held');
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.release_job_payment((select v from fx where k = 'j1')) $$,
  'P0001', 'Funds release only after the job is completed', '2: release refused while the job is not completed');
select tests.authenticate_as(:'worker');
select throws_ok($$ select public.release_job_payment((select v from fx where k = 'j1')) $$,
  'P0001', 'Job not found', '2: release refused for a caller who is not the customer (the worker)');
select tests.authenticate_as(:'stranger');
select throws_ok($$ select public.release_job_payment((select v from fx where k = 'j1')) $$,
  'P0001', 'Job not found', '2: release refused for a stranger');
select tests.authenticate_as(:'worker');
select lives_ok($$ select public.transition_job_status((select v from fx where k = 'j1'), 'completed', '["https://example.com/r4-j1.jpg"]'::jsonb) $$,
  'J1: the worker completes with evidence');
select tests.authenticate_as(:'customer');
select (public.open_job_dispute(:'j1', 'incomplete', 'R4 probe report')).id as d1 \gset
insert into fx values ('d1', :'d1');
select throws_ok($$ select public.release_job_payment((select v from fx where k = 'j1')) $$,
  'P0001', 'An open issue report is holding this payment', '2: release refused while an issue report is open');
select is((public.withdraw_job_dispute(:'d1')).status::text, 'withdrawn', 'J1: the customer withdraws the report');
select tests.clear_auth();
select is(tests.r4_event('evt_j1_cb_open', 'charge.dispute.created', :'p1'::text, '{"id":"dp_j1","status":"needs_response"}'::jsonb) ->> 'ok', 'true',
  '2: charge.dispute.created applies');
select ok((select chargeback_at is not null and chargeback_ref = 'dp_j1' and status = 'held' from public.payments where id = :'p1'),
  '2: a card dispute sets chargeback_at and chargeback_ref and leaves the status alone');
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.release_job_payment((select v from fx where k = 'j1')) $$,
  'P0001', 'This payment is under review by the card issuer and cannot be released', '2: release refused while chargeback_at is set');
select tests.clear_auth();
select is(tests.r4_event('evt_j1_cb_won', 'charge.dispute.closed', :'p1'::text, '{"id":"dp_j1","status":"won"}'::jsonb) ->> 'ok', 'true',
  '2: charge.dispute.closed (won) applies');
select ok((select chargeback_at is null and chargeback_ref = 'dp_j1' from public.payments where id = :'p1'), '2: a won card dispute clears chargeback_at');
select tests.authenticate_as(:'customer');
select ok((select p.status = 'held' and p.release_requested_at is not null and p.release_reason = 'approved' and p.transfer_cents = 4625 and p.released_at is null
           from public.release_job_payment(:'j1') p),
  '2: the positive control: release requested — transfer_cents = price − worker fee, the stripe row stays held until transfer.created');
select tests.clear_auth();
-- SURGERY: rewind so "unchanged" cannot pass by now() being constant
update public.payments set release_requested_at = release_requested_at - interval '1 hour' where id = :'p1';
select release_requested_at as p1_rr from public.payments where id = :'p1' \gset
select tests.authenticate_as(:'customer');
select ok((select p.release_requested_at = :'p1_rr'::timestamptz and p.status = 'held' and p.release_reason = 'approved'
           from public.release_job_payment(:'j1') p),
  '2: a second call after release_requested_at is set returns the row with the timestamp UNCHANGED (an idempotent return, not a refusal)');
select tests.clear_auth();

-- §6 transfer.created, transfer.reversed, the park, D7 clears it
select is((select count(*) from public.transfers_due where id = :'p1'), 1::bigint, '6: the requested release is in transfers_due');
select ok((select transfer_attempts = 0 from public.payments where id = :'p1'), '6: transfer_attempts starts at 0 (R5 key tr:<id>:0)');
select is(tests.r4_event('evt_j1_tr', 'transfer.created', :'p1'::text, '{"id":"tr_j1"}'::jsonb) ->> 'ok', 'true', '6: transfer.created applies');
select ok((select status = 'released' and transfer_ref = 'tr_j1' and released_at is not null from public.payments where id = :'p1'),
  '6: held -> released with transfer_ref and released_at');
select is((select count(*) from public.transfers_due where id = :'p1'), 0::bigint, '6: a transferred row leaves transfers_due');
select is((select count(*) from public.notification_outbox where recipient_id = :'worker' and type = 'payment_released' and data ->> 'jobId' = :'j1'::text), 1::bigint,
  '6: the worker was notified of the release exactly once (notify_on_payment_release — its sandbox-ledger copy is parked for R5)');
select is(tests.r4_event('evt_j1_rev', 'transfer.reversed', :'p1'::text, '{"id":"tr_j1","reversed":true}'::jsonb) ->> 'ok', 'true', '6: transfer.reversed applies');
select ok((select status = 'held' and released_at is null and transfer_ref is null
             and release_requested_at = :'p1_rr'::timestamptz and transfer_reversed_at is not null and transfer_attempts = 0
           from public.payments where id = :'p1'),
  '6: the reversal: status held, released_at null, transfer_ref null, release_requested_at PRESERVED, transfer_reversed_at set');
select is((select count(*) from public.transfers_due where id = :'p1'), 0::bigint, '6: the parked row is ABSENT from transfers_due');
select tests.authenticate_as(:'customer');
select ok((select p.release_requested_at = :'p1_rr'::timestamptz and p.transfer_reversed_at is not null and p.status = 'held'
           from public.release_job_payment(:'j1') p),
  '6: the customer''s second release call changes nothing on a parked row');
select tests.clear_auth();
select ok((select p.transfer_reversed_at is null and p.transfer_attempts = 1 and p.release_requested_at is not null
             and p.release_reason = 'dispute_resolved' and p.transfer_cents = 4625 and p.refund_cents = 0 and p.status = 'held'
           from public.resolve_job_dispute(:'j1', 'worker', 'reversal reviewed: pay the worker') p),
  '6: resolve in the worker''s favour clears the park and increments transfer_attempts (R5 key now tr:<id>:1)');
select is((select count(*) from public.transfers_due where id = :'p1'), 1::bigint, '6: the row reappears in transfers_due');
select throws_ok($$ select public.resolve_job_dispute((select v from fx where k = 'j1'), 'worker', 'again') $$,
  'P0001', 'This job has nothing to resolve', '11: a second resolve is refused');
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.cancel_job((select v from fx where k = 'j1'), 'customer_cancelled') $$,
  'P0001', 'This job is finished and can no longer be cancelled', '8: completed -> cancel is refused');
select tests.clear_auth();

-- ===========================================================================
-- §4. The index predicate: voided frees the slot, refunded does not
-- ===========================================================================
select tests.r4_hire(:'customer', :'worker', 5000, 'R4 J3 tips job') as j3 \gset
insert into fx values ('j3', :'j3');
select tests.authenticate_as(:'customer');
select (public.begin_job_payment(:'j3')).id as p3a \gset
select tests.clear_auth();
select is(tests.r4_event('evt_j3_cancel', 'payment_intent.canceled', :'p3a'::text, '{"id":"pi_j3a"}'::jsonb) ->> 'ok', 'true',
  '4: payment_intent.canceled applies to the unfunded row');
select is((select status::text from public.payments where id = :'p3a'), 'voided', '4: the unfunded row is voided');
select tests.authenticate_as(:'customer');
select (public.begin_job_payment(:'j3')).id as p3 \gset
insert into fx values ('p3', :'p3');
select tests.clear_auth();
select ok(:'p3'::uuid <> :'p3a'::uuid and (select status::text from public.payments where id = :'p3') = 'unfunded',
  '4: voiding an unfunded payment frees payments_one_active_per_job_kind — a fresh unfunded checkout row exists (GENUINE STOP if this fails)');
select is((select count(*) from public.payments where job_id = :'j3' and kind = 'job_payment'), 2::bigint, '4: the voided row stays as history beside the fresh one');
-- (the refunded half is proven on J9 below, once a refund has settled)

-- ===========================================================================
-- §5. Tips — stripe path (J3, Jbig), the ratio and the $1,000 ceilings
-- ===========================================================================
select public.attach_provider_ref(:'p3', 'pi_j3');
select is(tests.r4_event('evt_j3_succeeded', 'payment_intent.succeeded', :'p3'::text, '{"id":"pi_j3"}'::jsonb) ->> 'ok', 'true', 'J3: funded');
select tests.r4_work(:'worker', :'j3');
select tests.r4_release(:'customer', :'j3', 'evt_j3_tr') as p3_released \gset
select is((select status::text from public.payments where id = :'p3'), 'released', 'J3: the job payment released');
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.begin_tip_payment((select v from fx where k = 'j3'), 2600) $$,
  'P0001', 'A tip on this job can be at most $25.00', '5: stripe path: the trigger refuses a tip above 50% of the job price, naming the dollar limit');
select throws_ok($$ select public.begin_tip_payment((select v from fx where k = 'j3'), 0) $$,
  'P0001', 'Enter a tip amount greater than zero', '5: a zero tip is refused');
select (public.begin_tip_payment(:'j3', 2500)).id as t3 \gset
insert into fx values ('t3', :'t3');
select ok((select status = 'unfunded' and provider = 'stripe' and kind = 'tip' and amount_cents = 2500
             and platform_fee_cents = 0 and customer_fee_cents = 188 and customer_fee_bps = 750 and tax_cents = 0
             and charge_amount_cents = 2688 and payee_id = :'worker' and funding_due_at is not null
           from public.payments where id = :'t3'),
  '5: the stripe tip row is born unfunded at the ratio ceiling, customer fee only (platform_fee_cents = 0)');
select is((public.begin_tip_payment(:'j3', 2500)).id, :'t3'::uuid, '5: begin_tip_payment is idempotent on the unfunded tip');
select tests.authenticate_as(:'worker');
select throws_ok($$ select public.begin_tip_payment((select v from fx where k = 'j3'), 500) $$,
  'P0001', 'Job not found', '5: the worker cannot tip themselves');
select tests.clear_auth();
select is((select status::text from public.payments where id = :'t3'), 'unfunded', '5: the tip is still unfunded before the provider event');
select is(tests.r4_event('evt_t3', 'payment_intent.succeeded', :'t3'::text, '{"id":"pi_t3"}'::jsonb) ->> 'ok', 'true', '5: payment_intent.succeeded applies to the tip');
select ok((select status = 'released' and released_at is not null and held_at is null from public.payments where id = :'t3'),
  '5: the tip reaches released only on payment_intent.succeeded (no held stop for a tip)');
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.begin_tip_payment((select v from fx where k = 'j3'), 500) $$,
  'P0001', 'A tip was already added to this job', '5: one tip per job');
select tests.clear_auth();
-- the $1,000 ceiling binds before the ratio on a large job
select tests.r4_hire(:'customer', :'worker', 300000, 'R4 Jbig') as jbig \gset
insert into fx values ('jbig', :'jbig');
select tests.r4_fund(:'customer', :'jbig', 'evt_jbig') as pbig \gset
select tests.r4_work(:'worker', :'jbig');
select tests.r4_release(:'customer', :'jbig', 'evt_jbig_tr') as pbig_released \gset
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.begin_tip_payment((select v from fx where k = 'jbig'), 100001) $$,
  'P0001', 'A tip on this job can be at most $1,000.00', '5: stripe path: the trigger refuses a tip above $1,000');
select is((public.begin_tip_payment(:'jbig', 100000)).amount_cents, 100000, '5: stripe path: the positive control at exactly $1,000');
select tests.clear_auth();

-- ===========================================================================
-- §8. Cancellation, every D6 branch. §9 gates are interleaved where the
--     fixture is right for them.
-- ===========================================================================
-- an open job with two pending bids: no money, offers declined by the trigger
select tests.authenticate_as(:'customer');
select (public.create_job(p_title := 'R4 Jopen', p_description := 'open probe, rolled back', p_category := 'other',
  p_location := 'Probe Area', p_budget_min_cents := 5000, p_budget_max_cents := 5000, p_address_line := '4 Proof Way')).id as jopen \gset
insert into fx values ('jopen', :'jopen');
select tests.authenticate_as(:'worker');
select public.create_offer(p_amount_cents := 5000, p_job_id := :'jopen', p_message := 'open bid') as oo_w \gset
select throws_ok($$ select public.cancel_job((select v from fx where k = 'jopen'), 'worker_cancelled') $$,
  'P0001', 'Job not found', '8: a bidder on an open job is not a party and cannot cancel it');
select tests.authenticate_as(:'bidder');
select public.create_offer(p_amount_cents := 5100, p_job_id := :'jopen', p_message := 'open bid two') as oo_b \gset
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.cancel_job((select v from fx where k = 'jopen'), 'nonsense') $$,
  'P0001', 'Unknown cancellation reason', '8: an unknown reason is refused');
select ok((select j.status = 'cancelled' and j.cancel_reason = 'customer_cancelled' and j.cancelled_by = :'customer' and j.cancelled_at is not null
           from public.cancel_job(:'jopen', 'customer_cancelled') j),
  '8: the customer cancels an open job — cancelled, with the record');
select tests.clear_auth();
select is((select count(*) from public.job_offers where job_id = :'jopen' and status = 'declined'), 2::bigint,
  '8: the job''s pending offers are declined by the existing jobs_settle_offers_on_cancel trigger');
select is((select count(*) from public.payments where job_id = :'jopen'), 0::bigint, '8: an open job has no money row to void');

-- J4: free outside the window (stripe), plus the party refusals and the
-- no-show "window not passed" gate
select tests.r4_hire(:'customer', :'worker', 5000, 'R4 J4 free outside the window', (tests.r4_today() + 2), 9::smallint, 12::smallint, :'bidder') as j4 \gset
insert into fx values ('j4', :'j4');
select tests.r4_fund(:'customer', :'j4', 'evt_j4') as p4 \gset
insert into fx values ('p4', :'p4');
select tests.r4_age_agreement(:'j4', interval '1 hour');
select tests.authenticate_as(:'bidder');
select throws_ok($$ select public.cancel_job((select v from fx where k = 'j4'), 'customer_cancelled') $$, 'P0001', 'Job not found', '8: the losing bidder is refused');
select tests.authenticate_as(:'stranger');
select throws_ok($$ select public.cancel_job((select v from fx where k = 'j4'), 'customer_cancelled') $$, 'P0001', 'Job not found', '8: a stranger is refused');
select tests.authenticate_as(:'worker');
select throws_ok($$ select public.cancel_job((select v from fx where k = 'j4'), 'customer_cancelled') $$,
  'P0001', 'Only the customer can cancel as the customer', '8: the worker cannot give the customer''s reason');
select lives_ok($$ select public.mark_worker_arrival((select v from fx where k = 'j4'), 'arrived') $$, 'J4: the worker declares arrival (positive control for the gate below)');
select throws_ok($$ select public.cancel_job((select v from fx where k = 'j4'), 'customer_no_show') $$,
  'P0001', 'A no-show can be reported once the arrival window has passed', '9: gate — the arrival window has not passed');
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.cancel_job((select v from fx where k = 'j4'), 'worker_cancelled') $$,
  'P0001', 'Only the assigned worker can cancel as the worker', '8: the customer cannot give the worker''s reason');
select throws_ok($$ select public.cancel_job((select v from fx where k = 'j4'), 'customer_no_show') $$,
  'P0001', 'Only the assigned worker can cancel as the worker', '9: the customer cannot report their own no-show');
select ok((select j.status = 'cancelled' and j.cancel_reason = 'customer_cancelled' from public.cancel_job(:'j4', 'customer_cancelled') j),
  '8: free outside the window — the job is cancelled');
select throws_ok($$ select public.cancel_job((select v from fx where k = 'j4'), 'customer_cancelled') $$,
  'P0001', 'This job is already cancelled', '8: a second cancel is refused');
select tests.clear_auth();
select ok((select status = 'held' and refund_cents = 5375 and transfer_cents = 0 and refund_reason = 'customer_cancelled_free'
             and release_requested_at is null and refund_cents = charge_amount_cents
           from public.payments where id = :'p4'),
  '8: free outside the window: refund_cents = the whole charge (price + protection fee + tax), nothing to the worker; the stripe row stays held for R5');
select is((select count(*) from public.refunds_due where id = :'p4'), 1::bigint, '8: a stripe row with refund_cents > 0 appears in refunds_due');
select is((select count(*) from public.transfers_due where id = :'p4'), 0::bigint, '8: … and not in transfers_due');
select is((select count(*) from public.notification_outbox where recipient_id = :'worker' and type = 'job_cancelled'
             and data ->> 'jobId' = :'j4'::text and data ->> 'screen' = 'WorkerJob'
             and body = 'The customer cancelled this job. Open it to see what happens with the payment.'), 1::bigint,
  '8: the worker was notified exactly once, on the WorkerJob screen, with no money amount in the copy');
select is((select count(*) from public.notification_outbox where recipient_id = :'customer' and type = 'job_cancelled' and data ->> 'jobId' = :'j4'::text), 0::bigint,
  '8: the cancelling customer was not notified');
select is((select status::text from public.job_offers where job_id = :'j4' and worker_id = :'bidder'), 'superseded',
  '8: the losing bid on a hired job was already superseded at accept and is left alone by the cancel');
-- §10 full refund, resolved through the charge path (no metadata: by intent id)
select is(tests.r4_event('evt_j4_refund', 'charge.refunded', null,
  '{"id":"ch_j4","payment_intent":"pi_evt_j4","amount_refunded":5375,"refunds":{"data":[{"id":"re_j4"}]}}'::jsonb, false) ->> 'ok', 'true',
  '10: charge.refunded resolves the row by its intent id when the payload carries no metadata');
select ok((select status = 'refunded' and refund_ref = 're_j4' and refund_cents = 5375 from public.payments where id = :'p4'),
  '10: a full refund is terminal refunded, with refund_ref');
select is((select count(*) from public.refunds_due where id = :'p4'), 0::bigint, '10: a refunded row leaves refunds_due');

-- J5: free within 15 minutes of acceptance, inside the window
select tests.r4_hire(:'customer', :'worker', 5000, 'R4 J5 grace', tests.r4_today(), 9::smallint, 12::smallint) as j5 \gset
select tests.r4_fund(:'customer', :'j5', 'evt_j5') as p5 \gset
select tests.authenticate_as(:'customer');
select ok((select j.status = 'cancelled' from public.cancel_job(:'j5', 'customer_cancelled') j), '8: cancel within 15 minutes of acceptance, inside the window');
select tests.clear_auth();
select ok((select refund_cents = 5375 and transfer_cents = 0 and refund_reason = 'customer_cancelled_free' and status = 'held' from public.payments where id = :'p5'),
  '8: free within 15 minutes of acceptance — the grace overrides the window');

-- J6: the fee inside the window; floors at $15; §10 transfer.created first
select tests.r4_hire(:'customer', :'worker', 5000, 'R4 J6 fee inside the window', tests.r4_today(), 9::smallint, 12::smallint) as j6 \gset
insert into fx values ('j6', :'j6');
select tests.r4_fund(:'customer', :'j6', 'evt_j6') as p6 \gset
insert into fx values ('p6', :'p6');
select tests.r4_age_agreement(:'j6', interval '1 hour');
select tests.authenticate_as(:'customer');
select ok((select j.status = 'cancelled' from public.cancel_job(:'j6', 'customer_cancelled') j), '8: cancel inside the window, past the grace');
select tests.clear_auth();
select ok((select status = 'held' and transfer_cents = 1500 and refund_cents = 3875 and release_reason = 'cancellation_fee'
             and release_requested_at is not null and refund_reason = 'customer_cancelled_late' and released_at is null
             and transfer_cents + refund_cents = charge_amount_cents and refund_cents >= customer_fee_cents + tax_cents
           from public.payments where id = :'p6'),
  '8: the fee inside the window: 20% of $50 floors at $15 to the worker; the rest, including the protection fee and tax, refunds');
select is((select count(*) from public.transfers_due where id = :'p6'), 1::bigint, '8: the fee transfer is due');
select is((select count(*) from public.refunds_due where id = :'p6'), 1::bigint, '8: the refund is due');
select is(tests.r4_event('evt_j6_tr', 'transfer.created', :'p6'::text, '{"id":"tr_j6"}'::jsonb) ->> 'ok', 'true', '10: transfer.created lands FIRST on the fee cancellation');
select ok((select status = 'held' and transfer_ref = 'tr_j6' and released_at is not null from public.payments where id = :'p6'),
  '10: … it records transfer_ref and released_at but does NOT move a refunding row to released');
select is((select count(*) from public.transfers_due where id = :'p6'), 0::bigint, '10: the transferred fee leaves transfers_due');
select is(tests.r4_event('evt_j6_refund', 'charge.refunded', :'p6'::text, '{"id":"ch_j6","amount_refunded":3875,"refunds":{"data":[{"id":"re_j6"}]}}'::jsonb) ->> 'ok', 'true',
  '10: charge.refunded lands second');
select ok((select status = 'partially_refunded' and refund_ref = 're_j6' from public.payments where id = :'p6'),
  '10: terminal status is partially_refunded for a fee cancellation when transfer.created came first');
select is((select count(*) from public.refunds_due where id = :'p6'), 0::bigint, '10: the settled refund leaves refunds_due');

-- J8: the fee never exceeds the agreed price; the protection fee still refunds
select tests.r4_hire(:'customer', :'worker', 1000, 'R4 J8 ten dollar job', tests.r4_today(), 9::smallint, 12::smallint) as j8 \gset
select tests.r4_fund(:'customer', :'j8', 'evt_j8') as p8 \gset
select tests.r4_age_agreement(:'j8', interval '1 hour');
select tests.authenticate_as(:'customer');
select ok((select j.status = 'cancelled' from public.cancel_job(:'j8', 'customer_cancelled') j), '8: cancel a $10 job inside the window');
select tests.clear_auth();
select ok((select transfer_cents = 1000 and refund_cents = 75 and customer_fee_cents = 75 and charge_amount_cents = 1075
             and release_reason = 'cancellation_fee' and refund_reason = 'customer_cancelled_late'
           from public.payments where id = :'p8'),
  '8: the fee never exceeds the agreed price ($10, not the $15 floor) and the protection fee is still refunded in full');
-- §10 charge.refunded first, then transfer.created: the same terminal status
select is(tests.r4_event('evt_j8_refund', 'charge.refunded', :'p8'::text, '{"id":"ch_j8","amount_refunded":75,"refunds":{"data":[{"id":"re_j8"}]}}'::jsonb) ->> 'ok', 'true',
  '10: charge.refunded lands FIRST on this fee cancellation');
select is((select status::text from public.payments where id = :'p8'), 'partially_refunded', '10: partially_refunded on the refund event');
select is(tests.r4_event('evt_j8_tr', 'transfer.created', :'p8'::text, '{"id":"tr_j8"}'::jsonb) ->> 'ok', 'true', '10: transfer.created lands second');
select ok((select status = 'partially_refunded' and transfer_ref = 'tr_j8' and released_at is not null from public.payments where id = :'p8'),
  '10: the terminal status is partially_refunded regardless of the order; transfer_ref is recorded');

-- J7: the "before the work starts" gate (§9), the fee once in_progress with
-- no scheduled_date, capped at $35 (§8)
select tests.r4_hire(:'customer', :'worker', 20000, 'R4 J7 in progress') as j7 \gset
insert into fx values ('j7', :'j7');
select tests.test_fund_job(:'j7') as p7 \gset
insert into fx values ('p7', :'p7');
select tests.authenticate_as(:'worker');
select is((public.transition_job_status(:'j7', 'in_progress')).status::text, 'in_progress', '3: the start succeeds once held');
select throws_ok($$ select public.cancel_job((select v from fx where k = 'j7'), 'customer_no_show') $$,
  'P0001', 'A no-show can only be reported before the work starts', '9: gate — the job is no longer assigned (in_progress)');
select tests.authenticate_as(:'customer');
select ok((select j.status = 'cancelled' and j.cancel_reason = 'customer_cancelled' from public.cancel_job(:'j7', 'customer_cancelled') j),
  '8: the customer cancels a job that is in_progress');
select tests.clear_auth();
select ok((select status = 'held' and transfer_cents = 3500 and transfer_cents + refund_cents = charge_amount_cents
             and release_reason = 'cancellation_fee' and release_requested_at is not null
             and refund_reason = 'customer_cancelled_late'
           from public.payments where id = :'p7'),
  '8: in_progress always carries the fee (no scheduled_date notwithstanding); 20% of $200 caps at $35; the rest refunds');

-- J9: the worker cancels — full refund, the customer notified; §4's second half
select tests.r4_hire(:'customer', :'worker', 5000, 'R4 J9 worker cancels') as j9 \gset
insert into fx values ('j9', :'j9');
select tests.r4_fund(:'customer', :'j9', 'evt_j9') as p9 \gset
select tests.authenticate_as(:'worker');
select ok((select j.status = 'cancelled' and j.cancel_reason = 'worker_cancelled' and j.cancelled_by = :'worker' from public.cancel_job(:'j9', 'worker_cancelled') j),
  '8: the worker cancels');
select tests.clear_auth();
select ok((select status = 'held' and refund_cents = 5375 and transfer_cents = 0 and refund_reason = 'worker_cancelled' and release_requested_at is null
           from public.payments where id = :'p9'),
  '8: a worker cancellation refunds the customer in full');
select is((select count(*) from public.notification_outbox where recipient_id = :'customer' and type = 'job_cancelled'
             and data ->> 'jobId' = :'j9'::text and data ->> 'screen' = 'ClientJobDetail'
             and body = 'The worker cancelled this job. Your payment is being refunded in full.'), 1::bigint,
  '8: the customer was notified exactly once, on the ClientJobDetail screen');
select is((select count(*) from public.notification_outbox where recipient_id = :'worker' and type = 'job_cancelled' and data ->> 'jobId' = :'j9'::text), 0::bigint,
  '8: the cancelling worker was not notified');
select is(tests.r4_event('evt_j9_refund', 'charge.refunded', :'p9'::text, '{"id":"ch_j9","amount_refunded":5375,"refunds":{"data":[{"id":"re_j9"}]}}'::jsonb) ->> 'ok', 'true',
  '10: charge.refunded on the worker cancellation');
select is((select status::text from public.payments where id = :'p9'), 'refunded', '10: a full refund is terminal refunded');
select throws_ok($$ insert into public.payments (job_id, payer_id, payee_id, kind, amount_cents, platform_fee_cents, provider, provider_ref, status)
  values ((select v from fx where k = 'j9'), (select v from fx where k = 'customer'), (select v from fx where k = 'worker'),
          'job_payment', 5000, 0, 'sandbox', 'sandbox_r4_second_charge', 'authorized') $$,
  '23505', 'duplicate key value violates unique constraint "payments_one_active_per_job_kind"',
  '4: a refunded row does NOT free the slot — a second job_payment on the cancelled job is refused by the index (runner, RLS bypassed)');

-- J10: no scheduled_date -> free (until in_progress); the "scheduled job" gate
select tests.r4_hire(:'customer', :'worker', 5000, 'R4 J10 no date') as j10 \gset
insert into fx values ('j10', :'j10');
select tests.r4_fund(:'customer', :'j10', 'evt_j10') as p10 \gset
select tests.r4_age_agreement(:'j10', interval '1 hour');
select tests.authenticate_as(:'worker');
select lives_ok($$ select public.mark_worker_arrival((select v from fx where k = 'j10'), 'arrived') $$, 'J10: the worker declares arrival');
select throws_ok($$ select public.cancel_job((select v from fx where k = 'j10'), 'customer_no_show') $$,
  'P0001', 'A no-show can only be reported on a scheduled job', '9: gate — no scheduled_date');
select tests.authenticate_as(:'customer');
select ok((select j.status = 'cancelled' from public.cancel_job(:'j10', 'customer_cancelled') j), '8: the customer cancels a job with no scheduled_date');
select tests.clear_auth();
select ok((select refund_cents = 5375 and transfer_cents = 0 and refund_reason = 'customer_cancelled_free' from public.payments where id = :'p10'),
  '8: no scheduled_date -> free (past the grace, before any work)');

-- ===========================================================================
-- §9. The no-show claim: the fourth gate, the positive control, the money
--     that does not move, the customer''s notice, then D7 both ways and the
--     withdrawal
-- ===========================================================================
select tests.r4_hire(:'customer', :'worker', 5000, 'R4 J12 no-show fee', (tests.r4_today() - 1), 9::smallint, 12::smallint) as j12 \gset
insert into fx values ('j12', :'j12');
select tests.r4_fund(:'customer', :'j12', 'evt_j12') as p12 \gset
insert into fx values ('p12', :'p12');
select tests.authenticate_as(:'worker');
select throws_ok($$ select public.cancel_job((select v from fx where k = 'j12'), 'customer_no_show') $$,
  'P0001', 'Mark that you arrived before reporting a no-show', '9: gate — arrived_at is not set');
select lives_ok($$ select public.mark_worker_arrival((select v from fx where k = 'j12'), 'arrived') $$, 'J12: the worker declares arrival');
select ok((select j.status = 'cancelled' and j.cancel_reason = 'customer_no_show' and j.cancelled_by = :'worker' from public.cancel_job(:'j12', 'customer_no_show') j),
  '9: the positive control — assigned, arrived, scheduled, window passed: the claim is admitted and the job is cancelled');
select tests.clear_auth();
select ok((select status = 'held' and refund_cents is null and transfer_cents is null and release_requested_at is null and refund_reason is null
           from public.payments where id = :'p12'),
  '9: the claim moves no money by itself — the payment stays held, untouched');
select ok((select d.reason = 'no_show' and d.status = 'open' and d.opened_by = :'worker' and d.payment_id = :'p12' and d.details like 'The worker reported a customer no-show%'
           from public.job_disputes d where d.job_id = :'j12'),
  '9: the claim is a job_disputes row: reason no_show, open, opened by the worker, on the held payment');
select id as d12 from public.job_disputes where job_id = :'j12' \gset
insert into fx values ('d12', :'d12');
select is((select count(*) from public.notification_outbox where recipient_id = :'customer' and type = 'dispute_opened'
             and data ->> 'jobId' = :'j12'::text and data ->> 'screen' = 'ClientJobDetail' and title = 'A no-show was reported'
             and body = 'The worker reported that no one was available for this job. Brazos will review it before any fee is charged.'), 1::bigint,
  '9: the CUSTOMER is notified of the claim exactly once, on ClientJobDetail, with the no-show copy');
select is((select count(*) from public.notification_outbox where recipient_id = :'worker' and type = 'dispute_opened' and data ->> 'jobId' = :'j12'::text), 0::bigint,
  '9: the worker is NOT notified of their own claim');
select is((select count(*) from public.notification_outbox where type = 'job_cancelled' and data ->> 'jobId' = :'j12'::text), 0::bigint,
  '9: no job_cancelled notification is sent for a no-show — the claim notice is the customer''s notice');
select is((select count(*) from public.transfers_due where id = :'p12') + (select count(*) from public.refunds_due where id = :'p12'), 0::bigint,
  '9: nothing is queued for R5 while the claim is open');
-- D7, worker: the fee
select ok((select p.transfer_cents = 1500 and p.refund_cents = 3875 and p.release_reason = 'cancellation_fee' and p.refund_reason = 'customer_no_show'
             and p.release_requested_at is not null and p.status = 'held'
           from public.resolve_job_dispute(:'j12', 'worker', 'no-show confirmed by the arrival record') p),
  '9/11: resolved in the worker''s favour — the D5 fee to the worker, the rest refunded, the stripe row stays held for R5');
select ok((select d.status = 'resolved' and d.resolved_at is not null and d.resolution_note = 'no-show confirmed by the arrival record'
           from public.job_disputes d where d.id = :'d12'),
  '9/11: the claim is resolved with resolved_at and the note');
select is((select count(*) from public.transfers_due where id = :'p12'), 1::bigint, '9: the fee transfer is due');
select is((select count(*) from public.refunds_due where id = :'p12'), 1::bigint, '9: the refund is due');
select throws_ok($$ select public.resolve_job_dispute((select v from fx where k = 'j12'), 'customer', 'again') $$,
  'P0001', 'This job has nothing to resolve', '11: a second resolve of the no-show is refused');

-- J14: D7, customer: full refund
select tests.r4_hire(:'customer', :'worker', 5000, 'R4 J14 no-show refund', (tests.r4_today() - 1), 9::smallint, 12::smallint) as j14 \gset
select tests.r4_fund(:'customer', :'j14', 'evt_j14') as p14 \gset
insert into fx values ('j14', :'j14');
select tests.authenticate_as(:'worker');
select lives_ok($$ select public.mark_worker_arrival((select v from fx where k = 'j14'), 'arrived') $$, 'J14: arrival');
select ok((select j.status = 'cancelled' from public.cancel_job(:'j14', 'customer_no_show') j), 'J14: the no-show claim is admitted');
select tests.clear_auth();
select ok((select p.refund_cents = 5375 and p.transfer_cents = 0 and p.refund_reason = 'dispute_refund' and p.release_requested_at is null and p.status = 'held'
           from public.resolve_job_dispute(:'j14', 'customer', 'the customer was home') p),
  '9/11: resolved in the customer''s favour — refunded in full');
select is((select status::text from public.job_disputes where job_id = :'j14'), 'resolved', 'J14: the claim is resolved');
select is((select count(*) from public.refunds_due where id = :'p14'), 1::bigint, '9: the full refund is due');

-- J15: the worker withdraws the claim — refunded in full with no resolver call
select tests.r4_hire(:'customer', :'worker', 5000, 'R4 J15 no-show withdrawn', (tests.r4_today() - 1), 9::smallint, 12::smallint) as j15 \gset
select tests.r4_fund(:'customer', :'j15', 'evt_j15') as p15 \gset
insert into fx values ('j15', :'j15');
select tests.authenticate_as(:'worker');
select lives_ok($$ select public.mark_worker_arrival((select v from fx where k = 'j15'), 'arrived') $$, 'J15: arrival');
select ok((select j.status = 'cancelled' from public.cancel_job(:'j15', 'customer_no_show') j), 'J15: the no-show claim is admitted');
select tests.clear_auth();
select id as d15 from public.job_disputes where job_id = :'j15' \gset
insert into fx values ('d15', :'d15');
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.withdraw_job_dispute((select v from fx where k = 'd15')) $$,
  'P0001', 'Issue report not found', '9: only the worker who made the claim can withdraw it');
select tests.authenticate_as(:'worker');
select is((public.withdraw_job_dispute(:'d15')).status::text, 'withdrawn', '9: the worker withdraws the claim');
select tests.clear_auth();
select ok((select refund_cents = 5375 and transfer_cents = 0 and refund_reason = 'no_show_withdrawn' and status = 'held' from public.payments where id = :'p15'),
  '9: a withdrawn claim refunds the customer in full by trigger — no resolver call');
select is((select count(*) from public.refunds_due where id = :'p15'), 1::bigint, '9: the refund is due');
select throws_ok($$ select public.resolve_job_dispute((select v from fx where k = 'j15'), 'worker', 'late') $$,
  'P0001', 'This job has nothing to resolve', '11: after the withdrawal there is nothing left to resolve');

-- ===========================================================================
-- §11. resolve_job_dispute — privilege, the completed outcomes, the fifth
--      outcome, nothing-to-resolve
-- ===========================================================================
select ok(has_function_privilege('service_role', 'public.resolve_job_dispute(uuid, text, text)', 'EXECUTE'), '11: service_role may execute resolve_job_dispute (positive control)');
select ok(not has_function_privilege('authenticated', 'public.resolve_job_dispute(uuid, text, text)', 'EXECUTE'), '11: authenticated holds no EXECUTE on resolve_job_dispute');
select ok(not has_function_privilege('anon', 'public.resolve_job_dispute(uuid, text, text)', 'EXECUTE'), '11: anon holds no EXECUTE on resolve_job_dispute');
-- J17: completed + a customer report, resolved for the worker AS service_role
select tests.r4_hire(:'customer', :'worker', 5000, 'R4 J17 completed dispute worker') as j17 \gset
insert into fx values ('j17', :'j17');
select tests.r4_fund(:'customer', :'j17', 'evt_j17') as p17 \gset
select tests.r4_work(:'worker', :'j17');
select tests.authenticate_as(:'customer');
select (public.open_job_dispute(:'j17', 'incomplete', 'R4 shelf missing')).id as d17 \gset
select throws_ok($$ select public.resolve_job_dispute((select v from fx where k = 'j17'), 'worker', 'forged') $$,
  '42501', 'permission denied for function resolve_job_dispute', '11: authenticated cannot execute resolve_job_dispute');
select tests.clear_auth();
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('role', 'service_role', true);
select is(current_user::text, 'service_role', '11: the session is now the service role');
select ok((select p.release_reason = 'dispute_resolved' and p.release_requested_at is not null and p.transfer_cents = 4625 and p.refund_cents = 0 and p.status = 'held'
           from public.resolve_job_dispute(:'j17', 'worker', 'the photos show the shelf') p),
  '11: service_role executes it — completed + worker: the normal release as dispute_resolved');
select set_config('role', 'none', true);
select set_config('request.jwt.claims', '', true);
select ok((select d.status = 'resolved' and d.resolution_note = 'the photos show the shelf' from public.job_disputes d where d.id = :'d17'), '11: the report is resolved with the note');
select is((select count(*) from public.transfers_due where id = :'p17'), 1::bigint, '11: the release is due');
select throws_ok($$ select public.resolve_job_dispute((select v from fx where k = 'j17'), 'customer', 'flip') $$,
  'P0001', 'This job has nothing to resolve', '11: a second resolve is refused');
select throws_ok($$ select public.resolve_job_dispute((select v from fx where k = 'j17'), 'nobody', 'x') $$,
  'P0001', 'Resolve in favour of the worker or the customer', '11: the outcome is binary');
-- J18: completed + a customer report, resolved for the customer
select tests.r4_hire(:'customer', :'worker', 5000, 'R4 J18 completed dispute customer') as j18 \gset
insert into fx values ('j18', :'j18');
select tests.test_fund_job(:'j18') as p18 \gset
select tests.r4_work(:'worker', :'j18');
select tests.authenticate_as(:'customer');
select (public.open_job_dispute(:'j18', 'damage', 'R4 scratched floor')).id as d18 \gset
select tests.clear_auth();
select ok((select p.status = 'held' and p.refund_cents = p.charge_amount_cents and p.transfer_cents = 0 and p.refund_reason = 'dispute_refund'
           from public.resolve_job_dispute(:'j18', 'customer', 'damage confirmed') p),
  '11: completed + customer: refunded in full');
select is((select status::text from public.job_disputes where id = :'d18'), 'resolved', '11: the report is resolved');
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.release_job_payment((select v from fx where k = 'j18')) $$,
  'P0001', 'This payment is being refunded and cannot be released', '2: release refused once the payment is directed to a refund');
select tests.clear_auth();
-- J16: cancelled by a raw UPDATE (the ban_user / delete_my_account shape),
-- payment still held, no claim: the fifth outcome
select tests.r4_hire(:'customer', :'worker', 5000, 'R4 J16 direct cancel') as j16 \gset
insert into fx values ('j16', :'j16');
select tests.r4_fund(:'customer', :'j16', 'evt_j16') as p16 \gset
update public.jobs set status = 'cancelled' where id = :'j16';   -- SURGERY: the direct writers' shape
select ok((select status = 'cancelled' and cancel_reason is null from public.jobs where id = :'j16'), 'J16: cancelled directly, no cancel_reason (as ban_user leaves it)');
select throws_ok($$ select public.resolve_job_dispute((select v from fx where k = 'j16'), 'worker', 'pay') $$,
  'P0001', 'A cancelled job with no open claim can only be resolved in the customer''s favour', '11: cancelled + held + no claim: the worker outcome is refused');
select ok((select p.refund_cents = 5375 and p.transfer_cents = 0 and p.refund_reason = 'dispute_refund' and p.status = 'held'
           from public.resolve_job_dispute(:'j16', 'customer', 'account banned, refund') p),
  '11: cancelled + held + no claim: the customer outcome refunds in full');
select throws_ok($$ select public.resolve_job_dispute((select v from fx where k = 'j16'), 'customer', 'again') $$,
  'P0001', 'This job has nothing to resolve', '11: a second resolve is refused');

-- ===========================================================================
-- §13. The auto-release clock
-- ===========================================================================
-- J20: stripe — job_payment_state never moves it; auto_release_due_payments is gated on the outbox
select tests.r4_hire(:'customer', :'worker', 5000, 'R4 J20 stripe clock') as j20 \gset
insert into fx values ('j20', :'j20');
select tests.r4_fund(:'customer', :'j20', 'evt_j20') as p20 \gset
select tests.r4_work(:'worker', :'j20');
select throws_ok($$ select public.resolve_job_dispute((select v from fx where k = 'j20'), 'customer', 'nothing open') $$,
  'P0001', 'This job has nothing to resolve', '11: a completed job with no report and no park has nothing to resolve');
select is((select count(*) from public.notification_outbox where recipient_id = :'customer' and type = 'job_completed' and data ->> 'jobId' = :'j20'::text and status = 'pending'), 1::bigint,
  '13: the completion notification is queued (pending) for the customer');
update public.jobs set completed_at = now() - interval '73 hours' where id = :'j20';   -- SURGERY
select tests.authenticate_as(:'worker');
select ok((select p.status = 'held' and p.release_requested_at is null and p.release_reason is null from public.job_payment_state(:'j20') p),
  '13: job_payment_state never auto-releases a stripe row');
select tests.clear_auth();
select is(public.auto_release_due_payments(), 0, '13: auto_release_due_payments releases nothing while the completion notification is pending');
select ok((select status = 'held' and release_requested_at is null from public.payments where id = :'p20'), '13: … the stripe row is untouched');
update public.notification_outbox set status = 'sent', sent_at = now() where recipient_id = :'customer' and type = 'job_completed' and data ->> 'jobId' = :'j20'::text;   -- SURGERY: as the drain would
select is(public.auto_release_due_payments(), 1, '13: … and releases exactly this row once the notification is sent');
select ok((select status = 'held' and release_requested_at is not null and release_reason = 'auto_approved' and transfer_cents = 4625 from public.payments where id = :'p20'),
  '13: the auto-release requests the transfer (auto_approved, transfer_cents = price − worker fee) and leaves the row held for R5');
select is((select count(*) from public.transfers_due where id = :'p20'), 1::bigint, '13: the auto-released row is in transfers_due');
select is(public.auto_release_due_payments(), 0, '13: a second run releases nothing more');

-- ===========================================================================
-- §2 (rest) + §5 (direct inserts). J22: "not held"; the tip trigger on a
-- runner's direct insert
-- ===========================================================================
select tests.r4_hire(:'customer', :'worker', 5000, 'R4 J22 not held') as j22 \gset
insert into fx values ('j22', :'j22');
select tests.test_fund_job(:'j22') as p22 \gset
insert into fx values ('p22', :'p22');
select tests.r4_work(:'worker', :'j22');
update public.payments set status = 'authorized' where id = :'p22';   -- SURGERY: unreachable since the held gate
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.release_job_payment((select v from fx where k = 'j22')) $$,
  'P0001', 'This payment is not held (authorized)', '2: release refused when the payment is not held');
select tests.clear_auth();
update public.payments set status = 'held' where id = :'p22';
select tests.r4_hire(:'customer', :'worker', 300000, 'R4 Jbig direct insert') as jbigsb \gset
insert into fx values ('jbigsb', :'jbigsb');
select tests.test_fund_job(:'jbigsb') as pbigsb \gset
select tests.r4_work(:'worker', :'jbigsb');
select throws_ok($$ insert into public.payments (job_id, payer_id, payee_id, kind, amount_cents, platform_fee_cents, provider, provider_ref, status, released_at)
  values ((select v from fx where k = 'jbigsb'), (select v from fx where k = 'customer'), (select v from fx where k = 'worker'),
          'tip', 100001, 0, 'sandbox', 'sandbox_r4_big_tip', 'released', now()) $$,
  'P0001', 'A tip on this job can be at most $1,000.00', '5: the trigger refuses a tip above $1,000 even on a direct insert by the runner');
select throws_ok($$ insert into public.payments (job_id, payer_id, payee_id, kind, amount_cents, platform_fee_cents, provider, provider_ref, status, released_at)
  values ((select v from fx where k = 'jbigsb'), (select v from fx where k = 'customer'), (select v from fx where k = 'worker'),
          'tip', 500, 1, 'sandbox', 'sandbox_r4_fee_tip', 'released', now()) $$,
  'P0001', 'Tips carry no worker-side fee', '5: a tip with a worker-side fee is refused');

-- ===========================================================================
-- §7. quote_job_price at the rate boundaries; the future-dated row
-- ===========================================================================
select ok((select job_price_cents = 10000 and customer_fee_cents = 750 and tax_cents = 0 and total_cents = 10750 and worker_fee_cents = 750 and worker_receives_cents = 9250
           from public.quote_job_price(10000)),
  '7: $100 quotes as $107.50 all-in, $92.50 to the worker');
select ok((select customer_fee_cents = 375 and total_cents = 5375 and worker_fee_cents = 375 and worker_receives_cents = 4625 from public.quote_job_price(5000)),
  '7: $50 quotes as $53.75 all-in, $46.25 to the worker (the J1 charge)');
select ok((select customer_fee_cents = 8 and total_cents = 108 and worker_fee_cents = 100 and worker_receives_cents = 0 from public.quote_job_price(100)),
  '7: $1 rounds the customer fee to $0.08 and the worker-side minimum of $1.00 takes the whole price');
select ok((select customer_fee_cents = 0 and total_cents = 1 and worker_fee_cents = 1 and worker_receives_cents = 0 from public.quote_job_price(1)),
  '7: one cent: no customer fee, the worker fee never exceeds the price');
select ok((select customer_fee_cents = 75 and total_cents = 1075 from public.quote_job_price(1000)), '7: $10 quotes as $10.75 (the J8 charge)');
select ok((select bool_and(p.charge_amount_cents = p.amount_cents + p.customer_fee_cents + p.tax_cents) from public.payments p where p.provider = 'stripe' and p.payer_id = :'customer'),
  '7: charge_amount_cents equals amount + customer fee + tax on every stripe row this file funded');
select is((select customer_bps from public.current_fee()), 750, '7: the schedule in force is 750 bps');
insert into public.fee_schedule (effective_from, customer_bps, worker_bps, worker_min_fee_cents, tip_customer_bps, tax_bps, cancel_fee_bps, cancel_fee_min_cents, cancel_fee_max_cents, tip_max_bps, tip_max_cents)
values (now() + interval '1 day', 1000, 1000, 100, 1000, 500, 2500, 2000, 4000, 5000, 100000);
select is((select customer_bps from public.current_fee()), 750, '7: a future-dated schedule row does NOT apply today');
select ok((select customer_fee_cents = 750 and tax_cents = 0 and total_cents = 10750 from public.quote_job_price(10000)), '7: today''s quote is unchanged by the future row');
select ok((select customer_fee_cents = 1000 and tax_cents = 550 and total_cents = 11550 and worker_fee_cents = 1000 and worker_receives_cents = 9000
           from public.quote_job_price(10000, now() + interval '2 days')),
  '7: the same quote at a date past effective_from uses the new rate and its tax line, and the total includes the tax');
select ok((select cancel_fee_min_cents = 2000 and cancel_fee_max_cents = 4000 and tip_max_cents = 100000 from public.current_fee(now() + interval '2 days')),
  '7: current_fee returns every rate together at that date');

-- ===========================================================================
-- §14. Authorization for every new table and both views; the service-role
--      functions; the kill switch
-- ===========================================================================
select ok(not has_table_privilege('authenticated', 'public.fee_schedule', 'INSERT'), '14: authenticated has no INSERT on fee_schedule');
select ok(not has_table_privilege('authenticated', 'public.fee_schedule', 'UPDATE'), '14: authenticated has no UPDATE on fee_schedule');
select ok(not has_table_privilege('authenticated', 'public.fee_schedule', 'DELETE'), '14: authenticated has no DELETE on fee_schedule');
select ok(not has_table_privilege('authenticated', 'public.fee_schedule', 'SELECT'), '14: authenticated has no SELECT on fee_schedule (current_fee is the path)');
select ok(not has_table_privilege('authenticated', 'public.payment_events', 'INSERT'), '14: authenticated has no INSERT on payment_events');
select ok(not has_table_privilege('authenticated', 'public.payment_events', 'UPDATE'), '14: authenticated has no UPDATE on payment_events');
select ok(not has_table_privilege('authenticated', 'public.payment_events', 'DELETE'), '14: authenticated has no DELETE on payment_events');
select ok(not has_table_privilege('authenticated', 'public.payment_events', 'SELECT'), '14: authenticated has no SELECT on payment_events (cardholder details)');
select ok(not has_table_privilege('authenticated', 'public.payment_accounts', 'INSERT'), '14: authenticated has no INSERT on payment_accounts');
select ok(not has_table_privilege('authenticated', 'public.payment_accounts', 'UPDATE'), '14: authenticated has no UPDATE on payment_accounts');
select ok(not has_table_privilege('authenticated', 'public.payment_accounts', 'DELETE'), '14: authenticated has no DELETE on payment_accounts');
select ok(not has_table_privilege('authenticated', 'public.payment_accounts', 'SELECT'), '14: authenticated has no SELECT on payment_accounts (my_payouts_status is the path)');
select ok(not has_table_privilege('authenticated', 'public.app_config', 'INSERT'), '14: authenticated has no INSERT on app_config');
select ok(not has_table_privilege('authenticated', 'public.app_config', 'UPDATE'), '14: authenticated has no UPDATE on app_config');
select ok(not has_table_privilege('authenticated', 'public.app_config', 'DELETE'), '14: authenticated has no DELETE on app_config');
select ok(not has_table_privilege('authenticated', 'public.job_agreements', 'INSERT'), '14: authenticated has no INSERT on job_agreements');
select ok(not has_table_privilege('authenticated', 'public.job_agreements', 'UPDATE'), '14: authenticated has no UPDATE on job_agreements');
select ok(not has_table_privilege('authenticated', 'public.job_agreements', 'DELETE'), '14: authenticated has no DELETE on job_agreements');
select ok(not has_table_privilege('authenticated', 'public.transfers_due', 'SELECT'), '14: authenticated has no SELECT on transfers_due');
select ok(not has_table_privilege('authenticated', 'public.transfers_due', 'INSERT'), '14: authenticated has no INSERT on transfers_due');
select ok(not has_table_privilege('authenticated', 'public.transfers_due', 'UPDATE'), '14: authenticated has no UPDATE on transfers_due');
select ok(not has_table_privilege('authenticated', 'public.transfers_due', 'DELETE'), '14: authenticated has no DELETE on transfers_due');
select ok(not has_table_privilege('authenticated', 'public.refunds_due', 'SELECT'), '14: authenticated has no SELECT on refunds_due');
select ok(not has_table_privilege('authenticated', 'public.refunds_due', 'INSERT'), '14: authenticated has no INSERT on refunds_due');
select ok(not has_table_privilege('authenticated', 'public.refunds_due', 'UPDATE'), '14: authenticated has no UPDATE on refunds_due');
select ok(not has_table_privilege('authenticated', 'public.refunds_due', 'DELETE'), '14: authenticated has no DELETE on refunds_due');
select ok(not has_table_privilege('anon', 'public.fee_schedule', 'SELECT'), '14: anon has no SELECT on fee_schedule');
select ok(not has_table_privilege('anon', 'public.payment_events', 'SELECT'), '14: anon has no SELECT on payment_events');
select ok(not has_table_privilege('anon', 'public.payment_accounts', 'SELECT'), '14: anon has no SELECT on payment_accounts');
select ok(not has_table_privilege('anon', 'public.job_agreements', 'SELECT'), '14: anon has no SELECT on job_agreements');
select ok(not has_table_privilege('anon', 'public.transfers_due', 'SELECT'), '14: anon has no SELECT on transfers_due');
select ok(not has_table_privilege('anon', 'public.refunds_due', 'SELECT'), '14: anon has no SELECT on refunds_due');
select ok(has_table_privilege('anon', 'public.app_config', 'SELECT'), '14: anon may SELECT app_config (the one exception, by design)');
select ok(not has_table_privilege('anon', 'public.app_config', 'INSERT'), '14: anon has no INSERT on app_config');
select ok(not has_table_privilege('anon', 'public.app_config', 'UPDATE'), '14: anon has no UPDATE on app_config');
select ok(has_table_privilege('service_role', 'public.transfers_due', 'SELECT'), '14: service_role reads transfers_due (R5''s queue, positive control)');
select ok(has_table_privilege('service_role', 'public.refunds_due', 'SELECT'), '14: service_role reads refunds_due (positive control)');
select ok(has_table_privilege('service_role', 'public.payment_events', 'INSERT'), '14: service_role writes payment_events (the webhook, positive control)');
select ok(not has_sequence_privilege('authenticated', 'public.fee_schedule_id_seq', 'USAGE'), '14: authenticated has no USAGE on fee_schedule_id_seq');
select ok(not has_sequence_privilege('anon', 'public.fee_schedule_id_seq', 'USAGE'), '14: anon has no USAGE on fee_schedule_id_seq');
select ok(exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname in ('fee_schedule', 'payment_events', 'payment_accounts', 'app_config', 'job_agreements')
                  group by n.nspname having bool_and(c.relrowsecurity) and count(*) = 5),
  '14: RLS is enabled on all five new tables');
-- the refused statements, as the customer (the most entitled real identity)
select tests.authenticate_as(:'customer');
select is((select count(*) from public.app_config), 5::bigint, '14: authenticated reads the five seeded app_config rows (positive control for the write refusals)');
select is((select value from public.app_config where key = 'paymentsEnabled'), 'true'::jsonb, '14: paymentsEnabled is seeded true');
select throws_ok($$ insert into public.fee_schedule (effective_from, customer_bps, worker_bps) values (now(), 0, 0) $$,
  '42501', 'permission denied for table fee_schedule', '14: direct INSERT into fee_schedule (rewriting the rates) is refused');
select throws_ok($$ select count(*) from public.fee_schedule $$, '42501', 'permission denied for table fee_schedule', '14: direct SELECT on fee_schedule is refused');
select throws_ok($$ update public.app_config set value = 'false'::jsonb where key = 'paymentsEnabled' $$,
  '42501', 'permission denied for table app_config', '14: direct UPDATE of app_config (flipping the kill switch) is refused');
select throws_ok($$ insert into public.payment_events (id, type, payload) values ('forged', 'payment_intent.succeeded', '{}'::jsonb) $$,
  '42501', 'permission denied for table payment_events', '14: direct INSERT into payment_events (forging a provider event) is refused');
select throws_ok($$ select count(*) from public.payment_events $$, '42501', 'permission denied for table payment_events', '14: direct SELECT on payment_events is refused');
select throws_ok($$ insert into public.payment_accounts (user_id) values ((select v from fx where k = 'customer')) $$,
  '42501', 'permission denied for table payment_accounts', '14: direct INSERT into payment_accounts is refused');
select throws_ok($$ select count(*) from public.payment_accounts $$, '42501', 'permission denied for table payment_accounts', '14: direct SELECT on payment_accounts is refused');
select throws_ok($$ insert into public.job_agreements (job_id, offer_id, customer_id, worker_id, category, title, agreed_price_cents, customer_fee_cents, worker_fee_cents, tax_cents, total_cents, cancel_fee_bps, cancel_fee_min_cents, cancel_fee_max_cents, fee_schedule_id)
  values ((select v from fx where k = 'j20'), gen_random_uuid(), (select v from fx where k = 'customer'), (select v from fx where k = 'worker'), 'other', 'forged', 1, 0, 0, 0, 1, 0, 0, 0, 1) $$,
  '42501', 'permission denied for table job_agreements', '14: direct INSERT into job_agreements (forging written terms) is refused');
select throws_ok($$ select count(*) from public.transfers_due $$, '42501', 'permission denied for view transfers_due', '14: the transfer queue is not readable by a client');
select throws_ok($$ select count(*) from public.refunds_due $$, '42501', 'permission denied for view refunds_due', '14: the refund queue is not readable by a client');
select throws_ok($$ select public.apply_payment_event('evt_j1_succeeded') $$, '42501', 'permission denied for function apply_payment_event', '14: authenticated cannot execute apply_payment_event');
select throws_ok($$ select public.attach_provider_ref((select v from fx where k = 'p1'), 'pi_forged') $$, '42501', 'permission denied for function attach_provider_ref', '14: authenticated cannot execute attach_provider_ref');
select throws_ok($$ select public.set_payouts_enabled('acct_forged', true) $$, '42501', 'permission denied for function set_payouts_enabled', '14: authenticated cannot execute set_payouts_enabled');
select throws_ok($$ select public.resolve_job_dispute((select v from fx where k = 'j20'), 'worker', 'forged') $$, '42501', 'permission denied for function resolve_job_dispute', '14: authenticated cannot execute resolve_job_dispute');
select throws_ok($$ select public.expire_unfunded_payments() $$, '42501', 'permission denied for function expire_unfunded_payments', '14: authenticated cannot execute expire_unfunded_payments');
select throws_ok($$ select public.auto_release_due_payments() $$, '42501', 'permission denied for function auto_release_due_payments', '14: authenticated cannot execute auto_release_due_payments');
select throws_ok($$ select public.job_terms((select v from fx where k = 'j20'), 5000) $$, '42501', 'permission denied for function job_terms', '14: authenticated cannot execute the internal job_terms helper');
select throws_ok($$ select public.cancellation_fee_cents((select v from fx where k = 'j20'), 5000) $$, '42501', 'permission denied for function cancellation_fee_cents', '14: authenticated cannot execute the internal cancellation_fee_cents helper');
select lives_ok($$ select * from public.current_fee() $$, '14: authenticated may read the schedule in force through current_fee');
select lives_ok($$ select * from public.quote_job_price(5000) $$, '14: authenticated may quote through quote_job_price');
select tests.authenticate_anon();
select is((select count(*) from public.app_config), 5::bigint, '14: anon reads app_config (lib/remoteConfig.ts reads it before any session)');
select throws_ok($$ select count(*) from public.fee_schedule $$, '42501', 'permission denied for table fee_schedule', '14: anon cannot read fee_schedule');
select throws_ok($$ select count(*) from public.payment_events $$, '42501', 'permission denied for table payment_events', '14: anon cannot read payment_events');
select throws_ok($$ select count(*) from public.payment_accounts $$, '42501', 'permission denied for table payment_accounts', '14: anon cannot read payment_accounts');
select throws_ok($$ select count(*) from public.transfers_due $$, '42501', 'permission denied for view transfers_due', '14: anon cannot read transfers_due');
select throws_ok($$ select count(*) from public.refunds_due $$, '42501', 'permission denied for view refunds_due', '14: anon cannot read refunds_due');
select throws_ok($$ select * from public.current_fee() $$, '42501', 'permission denied for function current_fee', '14: anon cannot execute current_fee');
select throws_ok($$ select public.begin_job_payment((select v from fx where k = 'j20')) $$, '42501', 'permission denied for function begin_job_payment', '14: anon cannot execute begin_job_payment');
select throws_ok($$ select public.cancel_job((select v from fx where k = 'j20'), 'customer_cancelled') $$, '42501', 'permission denied for function cancel_job', '14: anon cannot execute cancel_job');
select throws_ok($$ select public.release_job_payment((select v from fx where k = 'j20')) $$, '42501', 'permission denied for function release_job_payment', '14: anon cannot execute release_job_payment');
select throws_ok($$ select public.begin_tip_payment((select v from fx where k = 'j20'), 100) $$, '42501', 'permission denied for function begin_tip_payment', '14: anon cannot execute begin_tip_payment');
select tests.clear_auth();
-- the kill switch (D12): only the jsonb boolean true enables; a fresh hire is
-- the fixture (J21 is also §7''s "keeps its quoted terms" job below)
select tests.r4_hire(:'customer', :'worker', 5000, 'R4 J21 quoted terms kept') as j21 \gset
insert into fx values ('j21', :'j21');
update public.app_config set value = 'false'::jsonb where key = 'paymentsEnabled';
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.begin_job_payment((select v from fx where k = 'j21')) $$,
  'P0001', 'Payments are paused right now. Please try again shortly.', '14: paymentsEnabled = false pauses begin_job_payment');
select throws_ok($$ select public.begin_tip_payment((select v from fx where k = 'j3'), 100) $$,
  'P0001', 'Payments are paused right now. Please try again shortly.', '14: … and begin_tip_payment');
select tests.clear_auth();
update public.app_config set value = '"true"'::jsonb where key = 'paymentsEnabled';
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.begin_job_payment((select v from fx where k = 'j21')) $$,
  'P0001', 'Payments are paused right now. Please try again shortly.', '14: a string "true" is not the boolean — the switch fails closed');
select tests.clear_auth();
delete from public.app_config where key = 'paymentsEnabled';
select tests.authenticate_as(:'customer');
select lives_ok($$ select public.begin_job_payment((select v from fx where k = 'j21')) $$, '14: an absent paymentsEnabled key means enabled');
select tests.clear_auth();
insert into public.app_config (key, value) values ('paymentsEnabled', 'true'::jsonb);

-- ===========================================================================
-- §7 (second half). A funded row keeps its quoted terms after a new schedule
--    row takes effect; a job hired before the change is charged its snapshot.
-- ===========================================================================
insert into public.fee_schedule (effective_from, customer_bps, worker_bps, worker_min_fee_cents, tip_customer_bps, tax_bps, cancel_fee_bps, cancel_fee_min_cents, cancel_fee_max_cents, tip_max_bps, tip_max_cents)
values (now(), 1000, 1000, 100, 1000, 0, 2500, 2000, 4000, 5000, 100000);
select is((select customer_bps from public.current_fee()), 1000, '7: a schedule row effective now is in force');
select ok((select customer_fee_cents = 500 and total_cents = 5500 from public.quote_job_price(5000)), '7: a fresh quote uses the new rate');
select ok((select customer_fee_cents = 375 and platform_fee_cents = 375 and charge_amount_cents = 5375 and customer_fee_bps = 750 from public.payments where id = :'p1'),
  '7: the J1 row funded under the old schedule keeps its quoted terms');
select ok((select customer_fee_cents = 375 and cancel_fee_min_cents = 1500 from public.job_agreements where job_id = :'j21'), '7: J21''s snapshot, written under the old schedule, is unchanged');
select ok((select p.status = 'unfunded' and p.customer_fee_cents = 375 and p.platform_fee_cents = 375 and p.charge_amount_cents = 5375 and p.customer_fee_bps = 750
           from public.payments p where p.job_id = :'j21' and p.kind = 'job_payment' and p.status not in ('failed', 'voided')),
  '7: the J21 checkout, begun after the change, is charged the terms it was quoted at acceptance — not the new rate');

select tests.clear_auth();
select * from finish();
rollback;
