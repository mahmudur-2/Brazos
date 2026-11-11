-- 320_tip_settlement.sql — ledger B1's proofs (docs/critical/tip-settlement.md, the only spec): a
-- tip the customer is charged for reaches the hired worker once, by the job payment's own route —
-- payment_intent.succeeded holds it and queues it in transfers_due, process-settlements sends it,
-- transfer.created releases it. Before B1 a charged tip read released at once and was never sent.
--
-- ONE TEST PER ROW of the blueprint's test list (T1, T2, T2b, T3, T4a, T4b, T5, T5b, T6, T7, T8, T9,
-- T10, T11), plus the fixture checks they stand on. Every description starts with the rule it proves. Most tests are
-- one jsonb observation compared with is(), so a failure prints the whole state seen (have) next to
-- the state the rule requires (want): read the keys that differ.
--
-- THE CAST: a customer (pays, approves, tips, reports an issue), the hired worker, and the runner —
-- the connection's own role, RLS bypassed — playing the webhook and the service role: it stores each
-- provider event in payment_events and applies it with apply_payment_event, as the webhook does, and
-- calls the service-only RPCs (attach_provider_ref, set_payment_account, set_payouts_status). Every
-- fixture goes through the real RPCs. Everything rolls back; no commit.
--
-- THE JOBS: J1 (6000) carries the tip t1 (2000) through the charge, the payout account, a replayed
-- charge, the transfer and a late replay. J2 (4000) carries T5's voided tip. J3 (5000) carries T7's
-- tip, charged while an issue report on the job is open. J4 (4000) carries the rows added after the
-- review (rules 9 and 10): a failed tip paid late (T5b), a tip whose amount is changed before any
-- intent exists (T8), a raise above the ceiling (T9), the first amount's intent paid after the
-- change (T10). J5 (4000) carries T11: a charge that reports a different amount than the row.
--
-- FIXTURE SURGERY, DECLARED (one, before T4a): now() is fixed for the whole transaction, so a replay
-- that re-stamped held_at or release_requested_at would write the value already there and T4a could
-- not see it. The runner rewinds t1's two stamps by one hour first; a re-stamp then shows. T7 needs
-- none: open_job_dispute refuses once the job payment has released (test 12), so J3's report is
-- opened between its approval and its transfer.created, the window transfers_due's dispute clause
-- was written for, and the tip is charged after that transfer lands.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(22);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

-- A ledger row as it stood at a named moment. \gset cannot carry a null, so snapshots live here.
create temp table snap as select ''::text as k, p.* from public.payments p where false;

-- A provider event in the minimum shape apply_payment_event reads (020's lc_event, with the event id
-- and the object named): stored in payment_events as the webhook stores it, then applied by the
-- runner. Every event id below is used once. Created inside the transaction, gone at rollback.
create or replace function tests.ts_event(p_id text, p_type text, p_payment uuid, p_object jsonb)
returns jsonb language plpgsql as $$
begin
  insert into public.payment_events (id, type, payload)
  values (p_id, p_type, jsonb_build_object('id', p_id, 'type', p_type,
    'data', jsonb_build_object('object', p_object || jsonb_build_object('metadata', jsonb_build_object('payment_id', p_payment)))));
  return public.apply_payment_event(p_id);
end $$;

-- What became of a stored event: 'processed', 'error: <text>', 'unprocessed' or 'missing'.
create or replace function tests.ts_event_state(p_id text)
returns text language sql as $$
  select coalesce((select case when e.error is not null then 'error: ' || e.error
                               when e.processed_at is not null then 'processed'
                               else 'unprocessed' end
                     from public.payment_events e where e.id = p_id), 'missing')
$$;

-- Post (customer), bid (worker), hire (customer): create_job, create_offer, accept_offer.
-- Returns the job; the identity is the runner's again on return.
create or replace function tests.ts_hire(p_customer uuid, p_worker uuid, p_cents integer, p_job_title text)
returns uuid language plpgsql as $$
declare
  v_job uuid;
  v_offer uuid;
begin
  perform tests.authenticate_as(p_customer);
  v_job := (public.create_job(
    p_title := p_job_title, p_description := 'B1 probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := p_cents, p_budget_max_cents := p_cents, p_address_line := '320 Proof Way')).id;
  perform tests.authenticate_as(p_worker);
  v_offer := public.create_offer(p_amount_cents := p_cents, p_job_id := v_job, p_message := 'B1 proof bid');
  perform tests.authenticate_as(p_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  return v_job;
end $$;

-- Checkout on the stripe path (tests.test_fund_job's steps, with the event id named):
-- begin_job_payment as the customer, the intent id attached, payment_intent.succeeded applied.
-- Returns the job payment.
create or replace function tests.ts_fund(p_customer uuid, p_job uuid, p_event text)
returns uuid language plpgsql as $$
declare
  v_pid uuid;
begin
  perform tests.authenticate_as(p_customer);
  v_pid := (public.begin_job_payment(p_job)).id;
  perform tests.clear_auth();
  perform public.attach_provider_ref(v_pid, 'pi_' || p_event);
  perform tests.ts_event(p_event, 'payment_intent.succeeded', v_pid, jsonb_build_object('id', 'pi_' || p_event));
  return v_pid;
end $$;

-- The hired worker starts the job and completes it, with the photo completion requires.
create or replace function tests.ts_work(p_worker uuid, p_job uuid)
returns void language plpgsql as $$
begin
  perform tests.authenticate_as(p_worker);
  perform public.transition_job_status(p_job, 'in_progress');
  perform public.transition_job_status(p_job, 'completed', '["https://example.com/b1-done.jpg"]'::jsonb);
  perform tests.clear_auth();
end $$;

-- The customer approves the work: release_job_payment. Returns the job payment.
create or replace function tests.ts_approve(p_customer uuid, p_job uuid)
returns uuid language plpgsql as $$
declare
  v_pid uuid;
begin
  perform tests.authenticate_as(p_customer);
  v_pid := (public.release_job_payment(p_job)).id;
  perform tests.clear_auth();
  return v_pid;
end $$;

-- The customer begins a tip: begin_tip_payment. Returns the tip row.
create or replace function tests.ts_tip(p_customer uuid, p_job uuid, p_cents integer)
returns uuid language plpgsql as $$
declare
  v_pid uuid;
begin
  perform tests.authenticate_as(p_customer);
  v_pid := (public.begin_tip_payment(p_job, p_cents)).id;
  perform tests.clear_auth();
  return v_pid;
end $$;

select tests.create_user('b1.customer@brazos.test', 'Cara Customer') as customer \gset
select tests.create_user('b1.worker@brazos.test',   'Wren Worker')   as worker   \gset
insert into fx values ('customer', :'customer'), ('worker', :'worker');

-- ---------------------------------------------------------------------------
-- 1. J1 funded (T6): a job payment is untouched by B1.
-- ---------------------------------------------------------------------------
select tests.ts_hire(:'customer', :'worker', 6000, 'B1 tip job one') as j1 \gset
insert into fx values ('j1', :'j1');
select tests.ts_fund(:'customer', :'j1', 'evt_ts_j1_fund') as p1 \gset
select is(
  (select jsonb_build_object(
      'event', tests.ts_event_state('evt_ts_j1_fund'),
      'status', p.status::text,
      'held_at_set', p.held_at is not null,
      'release_requested_at', p.release_requested_at,
      'release_reason', p.release_reason,
      'transfer_cents', p.transfer_cents,
      'rows_in_transfers_due', (select count(*) from public.transfers_due d where d.id = p.id))
     from public.payments p where p.id = :'p1'),
  jsonb_build_object('event', 'processed', 'status', 'held', 'held_at_set', true, 'release_requested_at', null,
    'release_reason', null, 'transfer_cents', null, 'rows_in_transfers_due', 0),
  'B1 rule 6 (T6): a funded job payment stays held, with no release requested and nothing due, until the customer approves'
);

-- J1 worked, approved, and its job payment's transfer landed: the tip can now be added.
select tests.ts_work(:'worker', :'j1');
select tests.ts_approve(:'customer', :'j1');
select tests.ts_event('evt_ts_j1_transfer', 'transfer.created', :'p1', '{"id":"tr_ts_j1"}'::jsonb);

-- ---------------------------------------------------------------------------
-- 2. The tip t1 (2000) charged (T1), due once (T2), ready once the payout account is (T2b).
-- ---------------------------------------------------------------------------
select tests.ts_tip(:'customer', :'j1', 2000) as t1 \gset
insert into fx values ('t1', :'t1');
select is(
  (select jsonb_build_object(
      'kind', p.kind::text,
      'provider', p.provider::text,
      'status', p.status::text,
      'amount_cents', p.amount_cents,
      'platform_fee_cents', p.platform_fee_cents,
      'customer_fee_on_top', p.customer_fee_cents > 0,
      'payee_is_the_hired_worker', p.payee_id = j.assigned_worker_id and p.payee_id = :'worker')
     from public.payments p join public.jobs j on j.id = p.job_id where p.id = :'t1'),
  jsonb_build_object('kind', 'tip', 'provider', 'stripe', 'status', 'unfunded', 'amount_cents', 2000,
    'platform_fee_cents', 0, 'customer_fee_on_top', true, 'payee_is_the_hired_worker', true),
  'B1 rule 1 (T1 fixture): begin_tip_payment mints an unfunded stripe tip of 2000 for the hired worker, no worker-side fee, a customer fee on top'
);

select public.attach_provider_ref(:'t1', 'pi_ts_t1');
-- Rule 10's matching case: the event reports the row's own charge amount, as the provider's does.
select charge_amount_cents as t1_charge from public.payments where id = :'t1' \gset
select tests.ts_event('evt_ts_t1_succeeded', 'payment_intent.succeeded', :'t1',
  jsonb_build_object('id', 'pi_ts_t1', 'amount_received', :t1_charge));
select is(
  (select jsonb_build_object(
      'event', tests.ts_event_state('evt_ts_t1_succeeded'),
      'status', p.status::text,
      'held_at_is_now', p.held_at = now(),
      'release_requested_at_is_now', p.release_requested_at = now(),
      'transfer_cents', p.transfer_cents,
      'released_at', p.released_at,
      'transfer_ref', p.transfer_ref,
      'release_reason', p.release_reason)
     from public.payments p where p.id = :'t1'),
  jsonb_build_object('event', 'processed', 'status', 'held', 'held_at_is_now', true, 'release_requested_at_is_now', true,
    'transfer_cents', 2000, 'released_at', null, 'transfer_ref', null, 'release_reason', null),
  'B1 rules 1 and 10 (T1): a tip charged for exactly its row''s amount is held and queued for its whole amount, and is not released before its transfer'
);

select is(
  (select jsonb_build_object(
      'rows_for_the_tip', count(*) filter (where d.id = :'t1'),
      'tip_rows_on_the_job', count(*) filter (where d.kind = 'tip'),
      'payee_is_the_hired_worker', bool_and(d.payee_id = j.assigned_worker_id and d.payee_id = :'worker') filter (where d.id = :'t1'),
      'transfer_cents', max(d.transfer_cents) filter (where d.id = :'t1'),
      'transfer_is_the_tip_amount', bool_and(d.transfer_cents = d.amount_cents) filter (where d.id = :'t1'),
      'transfer_is_not_the_charge', bool_and(d.transfer_cents <> d.charge_amount_cents) filter (where d.id = :'t1'))
     from public.transfers_due d join public.jobs j on j.id = d.job_id
    where d.job_id = :'j1'),
  jsonb_build_object('rows_for_the_tip', 1, 'tip_rows_on_the_job', 1, 'payee_is_the_hired_worker', true, 'transfer_cents', 2000,
    'transfer_is_the_tip_amount', true, 'transfer_is_not_the_charge', true),
  'B1 rule 2 (T2): a charged tip is due to the hired worker exactly once, for the tip amount and never the charge amount'
);

-- The service path of connect-onboarding: the account stored, not yet enabled.
select public.set_payment_account(:'worker', 'acct_b1_worker');
select is(
  jsonb_build_object(
    'payouts_enabled', (select a.payouts_enabled from public.payment_accounts a where a.user_id = :'worker'),
    'rows_in_transfers_due', (select count(*) from public.transfers_due d where d.id = :'t1'),
    'rows_in_transfers_ready', (select count(*) from public.transfers_ready r where r.id = :'t1')),
  jsonb_build_object('payouts_enabled', false, 'rows_in_transfers_due', 1, 'rows_in_transfers_ready', 0),
  'B1 edge (T2b): while the worker''s payout account is not enabled, the charged tip waits in transfers_due and stays out of transfers_ready'
);

select public.set_payouts_status(:'worker', 'enabled');
select is(
  (select jsonb_build_object(
      'rows_in_transfers_ready', count(*),
      'transfer_cents', max(r.transfer_cents),
      'payee_is_the_hired_worker', bool_and(r.payee_id = :'worker'))
     from public.transfers_ready r where r.id = :'t1'),
  jsonb_build_object('rows_in_transfers_ready', 1, 'transfer_cents', 2000, 'payee_is_the_hired_worker', true),
  'B1 rule 2 (T2b): once the worker''s payout account is enabled, the charged tip is in transfers_ready for the tip amount'
);

-- ---------------------------------------------------------------------------
-- 3. A replayed charge before the transfer (T4a), the transfer (T3), a replayed charge after it (T4b).
-- ---------------------------------------------------------------------------
-- SURGERY: now() is fixed for the transaction, so a replay that re-stamped either stamp would write
-- the value already there. Rewind both by an hour (runner, t1 only) so a re-stamp shows in T4a.
update public.payments
   set held_at = held_at - interval '1 hour', release_requested_at = release_requested_at - interval '1 hour'
 where id = :'t1';
insert into snap select 't1_before_replay', p.* from public.payments p where p.id = :'t1';
select tests.ts_event('evt_ts_t1_succeeded_replay', 'payment_intent.succeeded', :'t1', '{"id":"pi_ts_t1"}'::jsonb);
select is(
  (select jsonb_build_object(
      'event', tests.ts_event_state('evt_ts_t1_succeeded_replay'),
      'status', p.status::text,
      'release_requested_at_set', p.release_requested_at is not null,
      'release_requested_at_unchanged', p.release_requested_at is not distinct from s.release_requested_at,
      'held_at_unchanged', p.held_at is not distinct from s.held_at,
      'transfer_cents', p.transfer_cents,
      'transfer_cents_unchanged', p.transfer_cents is not distinct from s.transfer_cents,
      'released_at', p.released_at,
      'transfer_ref', p.transfer_ref,
      'rows_for_the_tip', (select count(*) from public.transfers_due d where d.id = p.id),
      'tip_rows_on_the_job', (select count(*) from public.transfers_due d where d.job_id = p.job_id and d.kind = 'tip'))
     from public.payments p join snap s on s.k = 't1_before_replay' and s.id = p.id
    where p.id = :'t1'),
  jsonb_build_object('event', 'processed', 'status', 'held', 'release_requested_at_set', true,
    'release_requested_at_unchanged', true, 'held_at_unchanged', true, 'transfer_cents', 2000, 'transfer_cents_unchanged', true,
    'released_at', null, 'transfer_ref', null, 'rows_for_the_tip', 1, 'tip_rows_on_the_job', 1),
  'B1 rule 4 (T4a): a replayed payment_intent.succeeded before the transfer changes nothing and never queues the tip twice'
);

insert into snap select 't1_before_transfer', p.* from public.payments p where p.id = :'t1';
select count(*) as t1_due_before_transfer from public.transfers_due d where d.id = :'t1' \gset
select tests.ts_event('evt_ts_t1_transfer', 'transfer.created', :'t1', '{"id":"tr_ts_t1"}'::jsonb);
select is(
  (select jsonb_build_object(
      'before_status', s.status::text,
      'before_released_at', s.released_at,
      'before_rows_in_transfers_due', :'t1_due_before_transfer'::integer,
      'event', tests.ts_event_state('evt_ts_t1_transfer'),
      'status', p.status::text,
      'released_at_set', p.released_at is not null,
      'transfer_ref', p.transfer_ref,
      'rows_in_transfers_due', (select count(*) from public.transfers_due d where d.id = p.id),
      'rows_in_transfers_ready', (select count(*) from public.transfers_ready r where r.id = p.id))
     from public.payments p join snap s on s.k = 't1_before_transfer' and s.id = p.id
    where p.id = :'t1'),
  jsonb_build_object('before_status', 'held', 'before_released_at', null, 'before_rows_in_transfers_due', 1,
    'event', 'processed', 'status', 'released', 'released_at_set', true, 'transfer_ref', 'tr_ts_t1',
    'rows_in_transfers_due', 0, 'rows_in_transfers_ready', 0),
  'B1 rule 3 (T3): only transfer.created releases the tip; it records the transfer_ref and the tip leaves transfers_due'
);

insert into snap select 't1_after_transfer', p.* from public.payments p where p.id = :'t1';
select tests.ts_event('evt_ts_t1_succeeded_late', 'payment_intent.succeeded', :'t1', '{"id":"pi_ts_t1"}'::jsonb);
select is(
  (select jsonb_build_object(
      'event', tests.ts_event_state('evt_ts_t1_succeeded_late'),
      'status', p.status::text,
      'transfer_ref', p.transfer_ref,
      'released_at_unchanged', p.released_at is not distinct from s.released_at,
      'release_requested_at_set', p.release_requested_at is not null,
      'release_requested_at_unchanged', p.release_requested_at is not distinct from s.release_requested_at,
      'transfer_cents', p.transfer_cents,
      'rows_for_the_tip', (select count(*) from public.transfers_due d where d.id = p.id),
      'tip_rows_on_the_job', (select count(*) from public.transfers_due d where d.job_id = p.job_id and d.kind = 'tip'))
     from public.payments p join snap s on s.k = 't1_after_transfer' and s.id = p.id
    where p.id = :'t1'),
  jsonb_build_object('event', 'processed', 'status', 'released', 'transfer_ref', 'tr_ts_t1', 'released_at_unchanged', true,
    'release_requested_at_set', true, 'release_requested_at_unchanged', true, 'transfer_cents', 2000,
    'rows_for_the_tip', 0, 'tip_rows_on_the_job', 0),
  'B1 rule 4 (T4b): a replayed payment_intent.succeeded after the transfer leaves the tip released, same transfer_ref, nothing due'
);

-- ---------------------------------------------------------------------------
-- 4. J2 (T5): a tip begun at 1000, its intent attached, then changed to 1500 — begin_tip_payment
--    voids the first row — and the first intent is paid anyway.
-- ---------------------------------------------------------------------------
select tests.ts_hire(:'customer', :'worker', 4000, 'B1 tip job two') as j2 \gset
insert into fx values ('j2', :'j2');
select tests.ts_fund(:'customer', :'j2', 'evt_ts_j2_fund') as p2 \gset
select tests.ts_work(:'worker', :'j2');
select tests.ts_approve(:'customer', :'j2');
select tests.ts_event('evt_ts_j2_transfer', 'transfer.created', :'p2', '{"id":"tr_ts_j2"}'::jsonb);
select tests.ts_tip(:'customer', :'j2', 1000) as t5 \gset
insert into fx values ('t5', :'t5');
select public.attach_provider_ref(:'t5', 'pi_ts_t5');
select tests.ts_tip(:'customer', :'j2', 1500) as t5_next \gset
select is(
  (select jsonb_build_object(
      'first_status', f.status::text,
      'first_last_error', f.last_error,
      'first_refund_cents', f.refund_cents,
      'next_is_a_new_row', n.id <> f.id,
      'next_status', n.status::text,
      'next_amount_cents', n.amount_cents)
     from public.payments f, public.payments n where f.id = :'t5' and n.id = :'t5_next'),
  jsonb_build_object('first_status', 'voided', 'first_last_error', 'tip amount changed before funding', 'first_refund_cents', null,
    'next_is_a_new_row', true, 'next_status', 'unfunded', 'next_amount_cents', 1500),
  'B1 rule 5 (T5 fixture): changing the tip amount once its intent exists voids the first tip row, a real void path'
);

select tests.ts_event('evt_ts_t5_succeeded', 'payment_intent.succeeded', :'t5', '{"id":"pi_ts_t5"}'::jsonb);
select is(
  (select jsonb_build_object(
      'event', tests.ts_event_state('evt_ts_t5_succeeded'),
      'status', p.status::text,
      'refund_is_the_whole_charge', p.refund_cents = p.charge_amount_cents,
      'refund_reason', p.refund_reason,
      'rows_in_refunds_due', (select count(*) from public.refunds_due r where r.id = p.id),
      'release_requested_at', p.release_requested_at,
      'transfer_cents', p.transfer_cents,
      'rows_in_transfers_due', (select count(*) from public.transfers_due d where d.id = p.id))
     from public.payments p where p.id = :'t5'),
  jsonb_build_object('event', 'processed', 'status', 'voided', 'refund_is_the_whole_charge', true,
    'refund_reason', 'funded_after_void', 'rows_in_refunds_due', 1, 'release_requested_at', null, 'transfer_cents', null,
    'rows_in_transfers_due', 0),
  'B1 rule 5 (T5): a voided tip that is paid anyway gets a full refund queued and no transfer'
);

-- ---------------------------------------------------------------------------
-- 5. T7: an open issue report freezes a queued tip. A tip needs the job payment released first, and
--    open_job_dispute refuses once it has (proven here on J1), so J3's report is opened through the
--    RPC between the approval and the job payment's transfer.created.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.open_job_dispute((select v from fx where k = 'j1'), 'incomplete', 'B1 too late') $$,
  'P0001', 'This payment was already released and can no longer be held',
  'B1 edge (T7 fixture): open_job_dispute refuses once the job payment has released, so T7''s report is opened before the job''s transfer lands');
select tests.clear_auth();

select tests.ts_hire(:'customer', :'worker', 5000, 'B1 tip job three') as j3 \gset
insert into fx values ('j3', :'j3');
select tests.ts_fund(:'customer', :'j3', 'evt_ts_j3_fund') as p3 \gset
select tests.ts_work(:'worker', :'j3');
select tests.ts_approve(:'customer', :'j3');
select tests.authenticate_as(:'customer');
select (public.open_job_dispute(:'j3', 'incomplete', 'B1 probe report')).id as d3 \gset
select tests.clear_auth();
insert into fx values ('d3', :'d3');
select tests.ts_event('evt_ts_j3_transfer', 'transfer.created', :'p3', '{"id":"tr_ts_j3"}'::jsonb);
select tests.ts_tip(:'customer', :'j3', 1500) as t7 \gset
insert into fx values ('t7', :'t7');
select public.attach_provider_ref(:'t7', 'pi_ts_t7');
select tests.ts_event('evt_ts_t7_succeeded', 'payment_intent.succeeded', :'t7', '{"id":"pi_ts_t7"}'::jsonb);
select is(
  (select jsonb_build_object(
      'event', tests.ts_event_state('evt_ts_t7_succeeded'),
      'report_open', (select d.status::text = 'open' from public.job_disputes d where d.id = :'d3'),
      'job_payment_status', (select jp.status::text from public.payments jp where jp.id = :'p3'),
      'status', p.status::text,
      'release_requested_at_set', p.release_requested_at is not null,
      'transfer_cents', p.transfer_cents,
      'rows_in_transfers_due', (select count(*) from public.transfers_due d where d.id = p.id))
     from public.payments p where p.id = :'t7'),
  jsonb_build_object('event', 'processed', 'report_open', true, 'job_payment_status', 'released', 'status', 'held',
    'release_requested_at_set', true, 'transfer_cents', 1500, 'rows_in_transfers_due', 0),
  'B1 edge (T7): an open issue report keeps a charged, queued tip out of transfers_due'
);

select tests.authenticate_as(:'customer');
select public.withdraw_job_dispute(:'d3');
select tests.clear_auth();
select is(
  jsonb_build_object(
    'report_open', (select d.status::text = 'open' from public.job_disputes d where d.id = :'d3'),
    'rows_in_transfers_due', (select count(*) from public.transfers_due d where d.id = :'t7'),
    'transfer_cents', (select d.transfer_cents from public.transfers_due d where d.id = :'t7'),
    'payee_is_the_hired_worker', (select d.payee_id = :'worker' from public.transfers_due d where d.id = :'t7')),
  jsonb_build_object('report_open', false, 'rows_in_transfers_due', 1, 'transfer_cents', 1500, 'payee_is_the_hired_worker', true),
  'B1 edge (T7): once the report is withdrawn, the queued tip is due to the hired worker for the tip amount'
);

-- ---------------------------------------------------------------------------
-- 6. J4 (rules 9 and 10, added after the review): the amount of a tip row never changes once the
--    row exists, and a tip is queued only when the charge is for the row's own amount.
-- ---------------------------------------------------------------------------
select tests.ts_hire(:'customer', :'worker', 4000, 'B1 tip job four') as j4 \gset
insert into fx values ('j4', :'j4');
select tests.ts_fund(:'customer', :'j4', 'evt_ts_j4_fund') as p4 \gset
select tests.ts_work(:'worker', :'j4');
select tests.ts_approve(:'customer', :'j4');
select tests.ts_event('evt_ts_j4_transfer', 'transfer.created', :'p4', '{"id":"tr_ts_j4"}'::jsonb);

-- T5b: a tip whose card payment failed, then succeeds late on the same intent.
select tests.ts_tip(:'customer', :'j4', 800) as tx \gset
select public.attach_provider_ref(:'tx', 'pi_ts_tx');
select tests.ts_event('evt_ts_tx_failed', 'payment_intent.payment_failed', :'tx', '{"id":"pi_ts_tx"}'::jsonb);
select is(
  (select jsonb_build_object('event', tests.ts_event_state('evt_ts_tx_failed'), 'status', p.status::text, 'refund_cents', p.refund_cents)
     from public.payments p where p.id = :'tx'),
  jsonb_build_object('event', 'processed', 'status', 'failed', 'refund_cents', null),
  'B1 rule 5 (T5b fixture): a failed card payment leaves the tip failed, with nothing to refund yet'
);
select tests.ts_event('evt_ts_tx_succeeded', 'payment_intent.succeeded', :'tx', '{"id":"pi_ts_tx"}'::jsonb);
select is(
  (select jsonb_build_object(
      'event', tests.ts_event_state('evt_ts_tx_succeeded'),
      'status', p.status::text,
      'refund_is_the_whole_charge', p.refund_cents = p.charge_amount_cents,
      'refund_reason', p.refund_reason,
      'rows_in_refunds_due', (select count(*) from public.refunds_due r where r.id = p.id),
      'release_requested_at', p.release_requested_at,
      'transfer_cents', p.transfer_cents,
      'rows_in_transfers_due', (select count(*) from public.transfers_due d where d.id = p.id))
     from public.payments p where p.id = :'tx'),
  jsonb_build_object('event', 'processed', 'status', 'failed', 'refund_is_the_whole_charge', true,
    'refund_reason', 'funded_after_void', 'rows_in_refunds_due', 1, 'release_requested_at', null, 'transfer_cents', null,
    'rows_in_transfers_due', 0),
  'B1 rule 5 (T5b): a failed tip that is paid anyway gets a full refund queued and no transfer'
);

-- T8: a tip begun at 1000 with NO intent attached, then asked again at 1200.
select tests.ts_tip(:'customer', :'j4', 1000) as ta \gset
select tests.ts_tip(:'customer', :'j4', 1200) as tb \gset
insert into fx values ('ta', :'ta');
select is(
  (select jsonb_build_object(
      'second_is_a_new_row', n.id <> f.id,
      'first_status', f.status::text,
      'first_amount_cents', f.amount_cents,
      'first_last_error', f.last_error,
      'second_status', n.status::text,
      'second_amount_cents', n.amount_cents,
      'second_platform_fee_cents', n.platform_fee_cents,
      'live_tips_on_the_job', (select count(*) from public.payments x
                                where x.job_id = :'j4' and x.kind = 'tip' and x.status not in ('failed', 'voided')))
     from public.payments f, public.payments n where f.id = :'ta' and n.id = :'tb'),
  jsonb_build_object('second_is_a_new_row', true, 'first_status', 'voided', 'first_amount_cents', 1000,
    'first_last_error', 'tip amount changed before funding', 'second_status', 'unfunded', 'second_amount_cents', 1200,
    'second_platform_fee_cents', 0, 'live_tips_on_the_job', 1),
  'B1 rule 9 (T8): changing a tip''s amount before any intent exists voids that row and mints a new one; a row''s amount is never rewritten'
);

-- T9: the ceiling on J4 is 2000 (half the 4000 job). A raise to 2100 goes through the same door.
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.begin_tip_payment((select v from fx where k = 'j4'), 2100) $$,
  'P0001', 'A tip on this job can be at most $20.00',
  'B1 rule 9 (T9): raising an unfunded tip above the ceiling is refused');
select tests.clear_auth();
select is(
  (select jsonb_build_object(
      'status', p.status::text,
      'amount_cents', p.amount_cents,
      'last_error', p.last_error,
      'tip_rows_on_the_job', (select count(*) from public.payments x where x.job_id = :'j4' and x.kind = 'tip'),
      'largest_tip_on_the_job', (select max(x.amount_cents) from public.payments x where x.job_id = :'j4' and x.kind = 'tip'))
     from public.payments p where p.id = :'tb'),
  jsonb_build_object('status', 'unfunded', 'amount_cents', 1200, 'last_error', null, 'tip_rows_on_the_job', 3,
    'largest_tip_on_the_job', 1200),
  'B1 rule 9 (T9): the refused raise leaves the tip row as it was, and no row above the ceiling exists'
);

-- T10: the checkout's own race. An intent made for the FIRST amount (1000) is attached after the
-- amount was changed, and the customer pays it: it lands on the voided row, never on the new one.
-- The charge of a 1000 tip is read from the fee table's own arithmetic (quote: 1000 + the customer
-- fee + tax), not from the row, so the number stands even where the first row was rewritten.
select public.attach_provider_ref(:'ta', 'pi_ts_ta');
select (1000 + round(1000 * f.tip_customer_bps / 10000.0)::integer
        + round((1000 + round(1000 * f.tip_customer_bps / 10000.0)::integer) * f.tax_bps / 10000.0)::integer) as ta_charge
  from public.current_fee() f \gset
select tests.ts_event('evt_ts_ta_succeeded', 'payment_intent.succeeded', :'ta',
  jsonb_build_object('id', 'pi_ts_ta', 'amount_received', :ta_charge));
select is(
  (select jsonb_build_object(
      'event', tests.ts_event_state('evt_ts_ta_succeeded'),
      'first_status', f.status::text,
      'first_refund_is_its_whole_charge', f.refund_cents = f.charge_amount_cents and f.refund_cents = :ta_charge,
      'first_refund_reason', f.refund_reason,
      'first_transfer_cents', f.transfer_cents,
      'first_release_requested_at', f.release_requested_at,
      'second_status', n.status::text,
      'second_provider_ref', n.provider_ref,
      'second_transfer_cents', n.transfer_cents,
      'tip_rows_due_on_the_job', (select count(*) from public.transfers_due d where d.job_id = :'j4' and d.kind = 'tip'))
     from public.payments f, public.payments n where f.id = :'ta' and n.id = :'tb'),
  jsonb_build_object('event', 'processed', 'first_status', 'voided', 'first_refund_is_its_whole_charge', true,
    'first_refund_reason', 'funded_after_void', 'first_transfer_cents', null, 'first_release_requested_at', null,
    'second_status', 'unfunded', 'second_provider_ref', null, 'second_transfer_cents', null, 'tip_rows_due_on_the_job', 0),
  'B1 rule 9 (T10): paying the first amount''s intent after the amount changed refunds it in full and queues no transfer; the new row stays unfunded'
);

-- T11: the second lock. A fresh job, so this test stands on its own: J5's tip (1200) is charged, but
-- the event reports the smaller charge of a 1000 tip. The money received is not the row's, so
-- nothing is queued for the worker.
select tests.ts_hire(:'customer', :'worker', 4000, 'B1 tip job five') as j5 \gset
insert into fx values ('j5', :'j5');
select tests.ts_fund(:'customer', :'j5', 'evt_ts_j5_fund') as p5 \gset
select tests.ts_work(:'worker', :'j5');
select tests.ts_approve(:'customer', :'j5');
select tests.ts_event('evt_ts_j5_transfer', 'transfer.created', :'p5', '{"id":"tr_ts_j5"}'::jsonb);
select tests.ts_tip(:'customer', :'j5', 1200) as tm \gset
select public.attach_provider_ref(:'tm', 'pi_ts_tm');
select tests.ts_event('evt_ts_tm_succeeded', 'payment_intent.succeeded', :'tm',
  jsonb_build_object('id', 'pi_ts_tm', 'amount_received', :ta_charge));
select is(
  (select jsonb_build_object(
      'event', tests.ts_event_state('evt_ts_tm_succeeded'),
      'charge_differs_from_what_was_received', p.charge_amount_cents <> :ta_charge,
      'status', p.status::text,
      'release_requested_at', p.release_requested_at,
      'transfer_cents', p.transfer_cents,
      'released_at', p.released_at,
      'last_error', p.last_error,
      'rows_in_transfers_due', (select count(*) from public.transfers_due d where d.id = p.id))
     from public.payments p where p.id = :'tm'),
  jsonb_build_object('event', 'processed', 'charge_differs_from_what_was_received', true, 'status', 'held',
    'release_requested_at', null, 'transfer_cents', null, 'released_at', null,
    'last_error', 'tip charged for a different amount than its row; transfer not queued',
    'rows_in_transfers_due', 0),
  'B1 rule 10 (T11): a tip charged for a different amount than its row is held and NOT queued for transfer, with the reason recorded'
);

-- ---------------------------------------------------------------------------
-- 7. T3's invariant over every tip this file charged. Scoped to this customer: tips charged before
--    B1 stay released with no transfer_ref by design (the blueprint's edge cases).
-- ---------------------------------------------------------------------------
select is(
  (select coalesce(array_agg(j.title::text order by j.title::text), '{}'::text[])
     from public.payments p join public.jobs j on j.id = p.job_id
    where p.payer_id = :'customer' and p.kind = 'tip' and p.provider = 'stripe'
      and p.status = 'released' and p.transfer_ref is null),
  '{}'::text[],
  'B1 rule 3 (T3): no stripe tip is released without a transfer_ref (every tip of this file''s customer; the list names their jobs)'
);

select * from finish();
rollback;
