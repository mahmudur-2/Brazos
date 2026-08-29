-- 060_connect.sql — the R5b proofs: 20260915000000_connect_onboarding.sql
-- proven before the pipeline applies it anywhere. Each section is one line of
-- the run's PROOF LEDGER (P1–P7); its assertions say which.
--
-- THE CAST (named once; every assertion says which of these it ran as):
--   customer   posts and pays for every job here
--   worker     is hired on every job, and is the OWNER of the payout account
--              that §5 and §6 exercise
--   stranger   an unrelated, active, authenticated account
--   anon       no session at all
--   service    the service role (set_config role/claims, as the edge
--              functions' service RPCs and the settlement cron run)
--   runner     the connection's own role, RLS bypassed — fixtures, ground
--              truth, and the stand-in for the webhook (payment_events rows)
--
-- THE FIXTURE: every job is hired through the real RPCs (create_job,
-- create_offer, accept_offer) by tests.r4_hire and funded through
-- begin_job_payment + a synthesized payment_intent.succeeded event
-- (tests.r4_fund). The three helpers are copied from 030_payments.sql
-- verbatim — same names, same call shapes — because each file's transaction
-- owns its own copy and rolls it back. Provider events are payment_events
-- rows carrying the minimum payload shape apply_payment_event reads, applied
-- by the runner. Everything rolls back.
--
-- FIXTURE SURGERY, DECLARED (each one is a state the product cannot reach in
-- a single transaction, or cannot reach at all):
--   * payments.funding_due_at is rewound 25 hours (the 24-hour funding window
--     cannot be waited out) so expire_unfunded_payments() has a row to void.
--   * jobs.final_amount_cents is changed by a raw runner UPDATE. No
--     client-callable RPC writes it after accept_offer — the change-request
--     flow is R10's — and begin_job_payment reads exactly this column.
--   * held_at is rewound one hour on the §3 control so "unchanged" is
--     provable (now() is constant inside the transaction).
--   * refund_reason is written by a raw runner UPDATE in §4, purely to walk
--     the check constraint; the value is put back to null.
--
-- PAIRING: every refusal sits beside the positive control on the same
-- fixture. throws_ok pins code AND message; a null code would pass on a typo
-- in this file's own SQL.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(136);

-- psql does not interpolate :'vars' inside dollar quotes, so ids also live in
-- this temp table for the statements throws_ok/lives_ok execute.
create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated, service_role;

select tests.create_user('r5b.customer@brazos.test', 'Cara Customer') as customer \gset
select tests.create_user('r5b.worker@brazos.test',   'Wren Worker')   as worker   \gset
select tests.create_user('r5b.stranger@brazos.test', 'Sal Stranger')  as stranger \gset
insert into fx values ('customer', :'customer'), ('worker', :'worker'), ('stranger', :'stranger');

-- ---------------------------------------------------------------------------
-- Helpers for this file, copied from 030_payments.sql. Created inside the
-- transaction, gone at rollback.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- §1. P1 — THE EXPIRY PATH (E-6). A succeeded intent on a row the sweeper
--     voided is refunded in full, the job's next checkout is a fresh row, and
--     the refund settles without moving the old row's status.
-- ---------------------------------------------------------------------------
select tests.r4_hire(:'customer', :'worker', 5000, 'R5b P1 expiry') as j1 \gset
select tests.authenticate_as(:'customer');
select (public.begin_job_payment(:'j1')).id as p1 \gset
select tests.clear_auth();
select public.attach_provider_ref(:'p1', 'pi_r5b_p1');
insert into fx values ('j1', :'j1'), ('p1', :'p1');

select is((select status::text from public.payments where id = :'p1'), 'unfunded',
  '1: customer — begin_job_payment opened an unfunded stripe row (positive control)');
select is((select provider_ref from public.payments where id = :'p1'), 'pi_r5b_p1',
  '1: runner — the PaymentIntent id is attached, as create-payment would');

-- SURGERY: the 24-hour funding window is rewound 25 hours.
update public.payments set funding_due_at = funding_due_at - interval '25 hours' where id = :'p1';

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('role', 'service_role', true);
select is(
  (select count(*) from public.expire_unfunded_payments() e where e.id = (select v from fx where k = 'p1')),
  1::bigint,
  '1: service — expire_unfunded_payments() returns the lapsed row'
);
select set_config('role', 'none', true);

select is((select status::text from public.payments where id = :'p1'), 'voided',
  '1: runner — the row is voided');
select is((select last_error from public.payments where id = :'p1'), 'funding window expired',
  '1: runner — with the sweeper''s reason');
select is((select held_at from public.payments where id = :'p1'), null::timestamptz,
  '1: runner — held_at is null before the late payment lands');
select is((select refund_cents from public.payments where id = :'p1'), null::integer,
  '1: runner — and no refund is queued yet (the pair for the assertions below)');

-- The customer's sheet was still open: the intent succeeds at the provider.
select is(
  tests.r4_event('evt_r5b_p1_succeeded', 'payment_intent.succeeded', :'p1'::text, '{"id":"pi_r5b_p1"}'::jsonb) ->> 'ok',
  'true',
  '1: runner — payment_intent.succeeded on the voided row is PROCESSED (ok:true), not failed'
);
select is((select status::text from public.payments where id = :'p1'), 'voided',
  '1: status stays voided — the money was never held');
select is((select held_at from public.payments where id = :'p1'), null::timestamptz,
  '1: held_at stays null — R4''s code stamped it here');
select is(
  (select refund_cents from public.payments where id = :'p1'),
  (select charge_amount_cents from public.payments where id = :'p1'),
  '1: refund_cents = charge_amount_cents — the whole charge, fee and tax included'
);
select ok((select refund_cents from public.payments where id = :'p1') > 5000,
  '1: and that is more than the job price, so the fee goes back too');
select is((select refund_reason from public.payments where id = :'p1'), 'funded_after_void',
  '1: refund_reason = funded_after_void');
select is((select last_error from public.payments where id = :'p1'), 'funded after the row was voided; refunding in full',
  '1: last_error says why');
select ok(exists (select 1 from public.refunds_due where id = :'p1'),
  '1: the row is in refunds_due — process-settlements refunds it on its next tick (§3 of the migration: the view needed no change)');
select is((select payment_id from public.payment_events where id = 'evt_r5b_p1_succeeded'), :'p1'::uuid,
  '1: the event carries payment_id');
select is((select error from public.payment_events where id = 'evt_r5b_p1_succeeded'), null::text,
  '1: and a null error');
select isnt((select processed_at from public.payment_events where id = 'evt_r5b_p1_succeeded'), null::timestamptz,
  '1: and is marked processed');

-- The job's next checkout is a NEW row: voided freed the slot.
select tests.authenticate_as(:'customer');
select (public.begin_job_payment(:'j1')).id as p1b \gset
select tests.clear_auth();
insert into fx values ('p1b', :'p1b');
select isnt(:'p1b'::uuid, :'p1'::uuid,
  '1: customer — the next begin_job_payment returns a DIFFERENT row');
select is((select status::text from public.payments where id = :'p1b'), 'unfunded',
  '1: customer — which is unfunded');
select is((select job_id from public.payments where id = :'p1b'), :'j1'::uuid,
  '1: customer — on the same job');

-- The refund lands. The old row keeps its status: refunded would collide
-- with the live row on payments_one_active_per_job_kind.
select charge_amount_cents as p1_charge from public.payments where id = :'p1' \gset
select is(
  tests.r4_event('evt_r5b_p1_refunded', 'charge.refunded', :'p1'::text,
    jsonb_build_object('id', 'ch_r5b_p1', 'payment_intent', 'pi_r5b_p1', 'amount_refunded', :p1_charge,
                       'refunds', jsonb_build_object('data', jsonb_build_array(jsonb_build_object('id', 're_r5b_p1'))))
  ) ->> 'ok',
  'true',
  '1: runner — charge.refunded on the OLD row applies (ok:true)'
);
select is((select error from public.payment_events where id = 'evt_r5b_p1_refunded'), null::text,
  '1: runner — with a null error: no collision inside apply''s exception block');
select is((select status::text from public.payments where id = :'p1'), 'voided',
  '1: the old row is STILL voided, not refunded');
select is((select refund_ref from public.payments where id = :'p1'), 're_r5b_p1',
  '1: refund_ref is recorded');
select is((select refund_cents from public.payments where id = :'p1'), :p1_charge,
  '1: refund_cents is unchanged by the event');
select ok(not exists (select 1 from public.refunds_due where id = :'p1'),
  '1: and the row has left refunds_due');
select is((select status::text from public.payments where id = :'p1b'), 'unfunded',
  '1: the new row is untouched');
select is((select refund_cents from public.payments where id = :'p1b'), null::integer,
  '1: and carries no refund');

-- ---------------------------------------------------------------------------
-- §2. P2 — THE AMOUNT-CHANGED PATH. begin_job_payment voids a stale intent;
--     a late payment on it is refunded exactly as §1; a lost dispute on it
--     records the chargeback without moving the status (§1c's other branch).
-- ---------------------------------------------------------------------------
select tests.r4_hire(:'customer', :'worker', 5000, 'R5b P2 amount changed') as j2 \gset
select tests.authenticate_as(:'customer');
select (public.begin_job_payment(:'j2')).id as p2 \gset
select tests.clear_auth();
select public.attach_provider_ref(:'p2', 'pi_r5b_p2');
insert into fx values ('j2', :'j2'), ('p2', :'p2');

-- SURGERY: the agreed amount changes after the intent exists.
update public.jobs set final_amount_cents = 6000 where id = :'j2';

select tests.authenticate_as(:'customer');
select (public.begin_job_payment(:'j2')).id as p2b \gset
select tests.clear_auth();
insert into fx values ('p2b', :'p2b');

select isnt(:'p2b'::uuid, :'p2'::uuid,
  '2: customer — begin_job_payment returns a NEW row');
select is((select status::text from public.payments where id = :'p2'), 'voided',
  '2: the old row is voided');
select is((select last_error from public.payments where id = :'p2'), 'agreed amount changed before funding',
  '2: with begin_job_payment''s reason');
select is((select status::text from public.payments where id = :'p2b'), 'unfunded',
  '2: the new row is unfunded');
select is((select amount_cents from public.payments where id = :'p2b'), 6000,
  '2: at the new agreed amount');
select is((select refund_cents from public.payments where id = :'p2'), null::integer,
  '2: nothing is queued on the old row yet');

select is(
  tests.r4_event('evt_r5b_p2_succeeded', 'payment_intent.succeeded', :'p2'::text, '{"id":"pi_r5b_p2"}'::jsonb) ->> 'ok',
  'true',
  '2: runner — the stale intent succeeds and the event is processed'
);
select is((select error from public.payment_events where id = 'evt_r5b_p2_succeeded'), null::text,
  '2: with a null error');
select is((select status::text from public.payments where id = :'p2'), 'voided',
  '2: status stays voided');
select is((select held_at from public.payments where id = :'p2'), null::timestamptz,
  '2: held_at stays null');
select is(
  (select refund_cents from public.payments where id = :'p2'),
  (select charge_amount_cents from public.payments where id = :'p2'),
  '2: refund_cents = charge_amount_cents'
);
select is((select refund_reason from public.payments where id = :'p2'), 'funded_after_void',
  '2: refund_reason = funded_after_void');
select ok(exists (select 1 from public.refunds_due where id = :'p2'),
  '2: the old row is in refunds_due');
select is((select status::text from public.payments where id = :'p2b'), 'unfunded',
  '2: the new row is untouched');
select is((select refund_cents from public.payments where id = :'p2b'), null::integer,
  '2: and carries no refund');

-- §1c's other branch: a card dispute LOST on a voided row records the
-- chargeback and keeps the status (refunded would collide with p2b).
select is(
  tests.r4_event('evt_r5b_p2_dispute_open', 'charge.dispute.created', :'p2'::text,
    '{"id":"dp_r5b_p2","status":"needs_response"}'::jsonb) ->> 'ok',
  'true',
  '2: runner — charge.dispute.created on the voided row applies'
);
select is((select chargeback_ref from public.payments where id = :'p2'), 'dp_r5b_p2',
  '2: chargeback_ref is recorded');
select isnt((select chargeback_at from public.payments where id = :'p2'), null::timestamptz,
  '2: chargeback_at is recorded');
select is(
  tests.r4_event('evt_r5b_p2_dispute_lost', 'charge.dispute.closed', :'p2'::text,
    '{"id":"dp_r5b_p2","status":"lost"}'::jsonb) ->> 'ok',
  'true',
  '2: runner — charge.dispute.closed (lost) applies'
);
select is((select error from public.payment_events where id = 'evt_r5b_p2_dispute_lost'), null::text,
  '2: without a collision');
select is((select status::text from public.payments where id = :'p2'), 'voided',
  '2: status stays voided on a lost dispute too');
select is((select status::text from public.payments where id = :'p2b'), 'unfunded',
  '2: and the live row is still untouched');

-- ---------------------------------------------------------------------------
-- §3. P3 — THE NEGATIVE CONTROL. A second succeeded on a HELD row, under a
--     fresh event id, changes nothing.
-- ---------------------------------------------------------------------------
select tests.r4_hire(:'customer', :'worker', 5000, 'R5b P3 held control') as j3 \gset
select tests.r4_fund(:'customer', :'j3', 'evt_r5b_p3') as p3 \gset
insert into fx values ('j3', :'j3'), ('p3', :'p3');
select is((select status::text from public.payments where id = :'p3'), 'held',
  '3: runner — funded through the real path: held (positive control)');
select isnt((select held_at from public.payments where id = :'p3'), null::timestamptz,
  '3: runner — and held_at was stamped on the transition out of unfunded');

-- SURGERY: held_at rewound one hour so a re-stamp would be visible.
update public.payments set held_at = held_at - interval '1 hour' where id = :'p3';
select held_at as p3_held_at from public.payments where id = :'p3' \gset

select is(
  tests.r4_event('evt_r5b_p3_again', 'payment_intent.succeeded', :'p3'::text, '{"id":"pi_evt_r5b_p3"}'::jsonb) ->> 'ok',
  'true',
  '3: runner — a second succeeded under a fresh event id applies'
);
select is((select status::text from public.payments where id = :'p3'), 'held',
  '3: status held');
select is((select held_at from public.payments where id = :'p3'), :'p3_held_at'::timestamptz,
  '3: held_at unchanged');
select is((select refund_cents from public.payments where id = :'p3'), null::integer,
  '3: refund_cents unchanged (null)');
select is((select refund_reason from public.payments where id = :'p3'), null::text,
  '3: refund_reason null');
select is((select last_error from public.payments where id = :'p3'), null::text,
  '3: last_error null');
select ok(not exists (select 1 from public.refunds_due where id = :'p3'),
  '3: not in refunds_due');

-- ---------------------------------------------------------------------------
-- §4. P4 — THE CONSTRAINT. funded_after_void is a known reason; R4's six
--     survive verbatim and in order; an unknown reason is refused.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ update public.payments set refund_reason = 'funded_after_void' where id = (select v from fx where k = 'p3') $$,
  '4: runner — funded_after_void is admitted by payments_refund_reason_known'
);
select throws_ok(
  $$ update public.payments set refund_reason = 'bogus' where id = (select v from fx where k = 'p3') $$,
  '23514', 'new row for relation "payments" violates check constraint "payments_refund_reason_known"',
  '4: runner — bogus is refused by the constraint'
);
update public.payments set refund_reason = null where id = :'p3';
select ok(
  (select pg_get_constraintdef(c.oid) from pg_constraint c
    where c.conname = 'payments_refund_reason_known' and c.conrelid = 'public.payments'::regclass)
  like '%''customer_cancelled_free''%''customer_cancelled_late''%''worker_cancelled''%''no_show_withdrawn''%''customer_no_show''%''dispute_refund''%''funded_after_void''%',
  '4: runner — the six R4 reasons are kept verbatim and in order, with funded_after_void appended'
);
select is(
  (select count(*) from pg_constraint c
    where c.conname = 'payments_refund_reason_known' and c.conrelid = 'public.payments'::regclass),
  1::bigint,
  '4: runner — exactly one such constraint: dropped and re-added, not duplicated'
);

-- ---------------------------------------------------------------------------
-- §5. P5 — AUTHORIZATION. The provider account id and the payout state are
--     neither client-readable nor client-writable, by any identity; the one
--     client-readable fact is the caller's own status.
-- ---------------------------------------------------------------------------
select has_column('public', 'payment_accounts', 'payouts_status',
  '5: payment_accounts.payouts_status exists');
select col_not_null('public', 'payment_accounts', 'payouts_status',
  '5: and is not null');
select col_default_is('public', 'payment_accounts', 'payouts_status', 'none',
  '5: defaulting to none');
select ok(
  (select pg_get_constraintdef(c.oid) from pg_constraint c
    where c.conname = 'payment_accounts_payouts_status_known' and c.conrelid = 'public.payment_accounts'::regclass)
  like '%''none''%''action_needed''%''under_review''%''enabled''%',
  '5: with a check constraint over exactly the four app-facing states'
);
select has_function('public', 'set_payouts_enabled', array['text', 'boolean'],
  '5: R5''s set_payouts_enabled(text, boolean) still exists, untouched');
select has_function('public', 'my_payouts_enabled', array[]::text[],
  '5: R4''s my_payouts_enabled() still exists, untouched');

-- The catalog: EXECUTE on the three service functions, and on the one
-- client function, by role.
select ok(has_function_privilege('service_role', 'public.get_payment_account(uuid)', 'EXECUTE'),
  '5: service_role may execute get_payment_account (positive control)');
select ok(has_function_privilege('service_role', 'public.set_payment_account(uuid, text)', 'EXECUTE'),
  '5: service_role may execute set_payment_account (positive control)');
select ok(has_function_privilege('service_role', 'public.set_payouts_status(uuid, text)', 'EXECUTE'),
  '5: service_role may execute set_payouts_status (positive control)');
select ok(not has_function_privilege('authenticated', 'public.get_payment_account(uuid)', 'EXECUTE'),
  '5: authenticated holds no EXECUTE on get_payment_account');
select ok(not has_function_privilege('authenticated', 'public.set_payment_account(uuid, text)', 'EXECUTE'),
  '5: authenticated holds no EXECUTE on set_payment_account');
select ok(not has_function_privilege('authenticated', 'public.set_payouts_status(uuid, text)', 'EXECUTE'),
  '5: authenticated holds no EXECUTE on set_payouts_status');
select ok(not has_function_privilege('anon', 'public.get_payment_account(uuid)', 'EXECUTE'),
  '5: anon holds no EXECUTE on get_payment_account');
select ok(not has_function_privilege('anon', 'public.set_payment_account(uuid, text)', 'EXECUTE'),
  '5: anon holds no EXECUTE on set_payment_account');
select ok(not has_function_privilege('anon', 'public.set_payouts_status(uuid, text)', 'EXECUTE'),
  '5: anon holds no EXECUTE on set_payouts_status');
select ok(has_function_privilege('authenticated', 'public.my_payouts_status()', 'EXECUTE'),
  '5: authenticated may execute my_payouts_status (positive control)');
select ok(not has_function_privilege('anon', 'public.my_payouts_status()', 'EXECUTE'),
  '5: anon holds no EXECUTE on my_payouts_status');
select ok(not has_table_privilege('authenticated', 'public.payment_accounts', 'SELECT'),
  '5: authenticated has no SELECT on payment_accounts (unchanged from 030 §14)');
select ok(not has_table_privilege('authenticated', 'public.payment_accounts', 'INSERT'),
  '5: authenticated has no INSERT on payment_accounts (unchanged from 030 §14)');
select ok(not has_table_privilege('authenticated', 'public.payment_accounts', 'UPDATE'),
  '5: authenticated has no UPDATE on payment_accounts (unchanged from 030 §14)');
select ok(not has_table_privilege('anon', 'public.payment_accounts', 'SELECT'),
  '5: anon has no SELECT on payment_accounts (unchanged from 030 §14)');
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'payment_accounts'),
  '5: RLS is still enabled on payment_accounts'
);
select is(
  (select count(*) from pg_policy p where p.polrelid = 'public.payment_accounts'::regclass),
  0::bigint,
  '5: and it still carries NO policies — the new column added none'
);

-- As the owner: their own account id and state are not theirs to read or write.
select tests.authenticate_as(:'worker');
select throws_ok(
  $$ select public.get_payment_account((select v from fx where k = 'worker')) $$,
  '42501', 'permission denied for function get_payment_account',
  '5: owner — cannot read their own provider account id'
);
select throws_ok(
  $$ select public.set_payment_account((select v from fx where k = 'worker'), 'acct_forged') $$,
  '42501', 'permission denied for function set_payment_account',
  '5: owner — cannot write it'
);
select throws_ok(
  $$ select public.set_payouts_status((select v from fx where k = 'worker'), 'enabled') $$,
  '42501', 'permission denied for function set_payouts_status',
  '5: owner — cannot enable their own payouts'
);
select throws_ok(
  $$ select payouts_status from public.payment_accounts $$,
  '42501', 'permission denied for table payment_accounts',
  '5: owner — direct SELECT is refused'
);
select throws_ok(
  $$ insert into public.payment_accounts (user_id, stripe_account_id)
     values ((select v from fx where k = 'worker'), 'acct_forged') $$,
  '42501', 'permission denied for table payment_accounts',
  '5: owner — direct INSERT is refused'
);
select throws_ok(
  $$ update public.payment_accounts set payouts_status = 'enabled' $$,
  '42501', 'permission denied for table payment_accounts',
  '5: owner — direct UPDATE is refused'
);
select is(public.my_payouts_status(), 'none',
  '5: owner — my_payouts_status() is none with no row');
select is(public.my_payouts_enabled(), false,
  '5: owner — my_payouts_enabled() is false (R4''s function, unchanged)');
select tests.clear_auth();

-- As a stranger: the owner's id and state are not theirs either.
select tests.authenticate_as(:'stranger');
select throws_ok(
  $$ select public.get_payment_account((select v from fx where k = 'worker')) $$,
  '42501', 'permission denied for function get_payment_account',
  '5: stranger — cannot read another user''s provider account id'
);
select throws_ok(
  $$ select public.set_payment_account((select v from fx where k = 'worker'), 'acct_forged') $$,
  '42501', 'permission denied for function set_payment_account',
  '5: stranger — cannot write it'
);
select throws_ok(
  $$ select public.set_payouts_status((select v from fx where k = 'worker'), 'enabled') $$,
  '42501', 'permission denied for function set_payouts_status',
  '5: stranger — cannot enable another user''s payouts'
);
select throws_ok(
  $$ select payouts_status from public.payment_accounts $$,
  '42501', 'permission denied for table payment_accounts',
  '5: stranger — direct SELECT is refused'
);
select throws_ok(
  $$ insert into public.payment_accounts (user_id, stripe_account_id)
     values ((select v from fx where k = 'stranger'), 'acct_forged') $$,
  '42501', 'permission denied for table payment_accounts',
  '5: stranger — direct INSERT is refused'
);
select throws_ok(
  $$ update public.payment_accounts set payouts_status = 'enabled' $$,
  '42501', 'permission denied for table payment_accounts',
  '5: stranger — direct UPDATE is refused'
);
select is(public.my_payouts_status(), 'none',
  '5: stranger — my_payouts_status() is their OWN none, never the owner''s');
select tests.clear_auth();

-- As anon: a session-less caller is refused the same way, and has no status.
select tests.authenticate_anon();
select throws_ok(
  $$ select public.get_payment_account((select v from fx where k = 'worker')) $$,
  '42501', 'permission denied for function get_payment_account',
  '5: anon — get_payment_account is refused'
);
select throws_ok(
  $$ select public.set_payment_account((select v from fx where k = 'worker'), 'acct_forged') $$,
  '42501', 'permission denied for function set_payment_account',
  '5: anon — set_payment_account is refused'
);
select throws_ok(
  $$ select public.set_payouts_status((select v from fx where k = 'worker'), 'enabled') $$,
  '42501', 'permission denied for function set_payouts_status',
  '5: anon — set_payouts_status is refused'
);
select throws_ok(
  $$ select payouts_status from public.payment_accounts $$,
  '42501', 'permission denied for table payment_accounts',
  '5: anon — direct SELECT is refused'
);
select throws_ok(
  $$ insert into public.payment_accounts (user_id, stripe_account_id)
     values ((select v from fx where k = 'worker'), 'acct_forged') $$,
  '42501', 'permission denied for table payment_accounts',
  '5: anon — direct INSERT is refused'
);
select throws_ok(
  $$ update public.payment_accounts set payouts_status = 'enabled' $$,
  '42501', 'permission denied for table payment_accounts',
  '5: anon — direct UPDATE is refused'
);
select throws_ok(
  $$ select public.my_payouts_status() $$,
  '42501', 'permission denied for function my_payouts_status',
  '5: anon — my_payouts_status is refused too'
);
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- §6. P6 — THE SERVICE PATH the two edge functions use.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('role', 'service_role', true);
select is(
  public.get_payment_account((select v from fx where k = 'worker')), null,
  '6: service — a user with no payout account reads back null (so connect-onboarding knows to create one)'
);
select is(
  public.set_payment_account((select v from fx where k = 'worker'), 'acct_r5b_first'), 'acct_r5b_first',
  '6: service — the first write stores the account id and returns it'
);
select is(
  public.set_payment_account((select v from fx where k = 'worker'), 'acct_r5b_second'), 'acct_r5b_first',
  '6: service — FIRST WRITER WINS: a racing second write returns the stored id, never overwrites it'
);
select is(
  public.get_payment_account((select v from fx where k = 'worker')), 'acct_r5b_first',
  '6: service — and the stored id is still the first one'
);
select throws_ok(
  $$ select public.set_payment_account((select v from fx where k = 'stranger'), '') $$,
  'P0001', 'set_payment_account: user id and account id are required',
  '6: service — an empty account id is refused by name rather than stored'
);
select is(
  public.get_payment_account((select v from fx where k = 'stranger')), null,
  '6: service — and that refusal wrote nothing'
);
select is(
  public.set_payouts_status((select v from fx where k = 'worker'), 'enabled'), true,
  '6: service — set_payouts_status(owner, enabled) matches the row'
);
select set_config('role', 'none', true);

select is((select payouts_status from public.payment_accounts where user_id = :'worker'), 'enabled',
  '6: runner — payouts_status is enabled');
select is((select payouts_enabled from public.payment_accounts where user_id = :'worker'), true,
  '6: runner — payouts_enabled is DERIVED true, so process-settlements'' account lookup sees it');
select isnt((select payouts_checked_at from public.payment_accounts where user_id = :'worker'), null::timestamptz,
  '6: runner — payouts_checked_at is stamped');

select tests.authenticate_as(:'worker');
select is(public.my_payouts_enabled(), true,
  '6: owner — my_payouts_enabled() is true (R4''s function reads the derived column)');
select is(public.my_payouts_status(), 'enabled',
  '6: owner — my_payouts_status() is enabled');
select tests.clear_auth();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('role', 'service_role', true);
select is(
  public.set_payouts_status((select v from fx where k = 'worker'), 'action_needed'), true,
  '6: service — set_payouts_status(owner, action_needed) matches'
);
select set_config('role', 'none', true);
select is((select payouts_enabled from public.payment_accounts where user_id = :'worker'), false,
  '6: runner — and payouts_enabled is derived back to false');
select is((select payouts_status from public.payment_accounts where user_id = :'worker'), 'action_needed',
  '6: runner — payouts_status is action_needed');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('role', 'service_role', true);
select is(
  public.set_payouts_status((select v from fx where k = 'worker'), 'under_review'), true,
  '6: service — set_payouts_status(owner, under_review) matches'
);
select throws_ok(
  $$ select public.set_payouts_status((select v from fx where k = 'worker'), 'bogus') $$,
  '23514', 'new row for relation "payment_accounts" violates check constraint "payment_accounts_payouts_status_known"',
  '6: service — an unknown status fails on the constraint, by name'
);
select is(
  public.set_payouts_status(gen_random_uuid(), 'enabled'), false,
  '6: service — an unknown user matches no row: false, and nothing is created'
);
select is(
  public.set_payouts_status(null, 'enabled'), false,
  '6: service — a null user matches no row: false'
);
select set_config('role', 'none', true);
select is((select payouts_status from public.payment_accounts where user_id = :'worker'), 'under_review',
  '6: runner — the refused write left the row at under_review');
select is((select payouts_enabled from public.payment_accounts where user_id = :'worker'), false,
  '6: runner — with payouts_enabled false');
select is(
  (select count(*) from public.payment_accounts where user_id = :'worker'),
  1::bigint,
  '6: runner — exactly one payment_accounts row for the owner, whatever the write path did'
);
select is(
  (select count(*) from public.payment_accounts where user_id not in (select v from fx)),
  0::bigint,
  '6: runner — and no row was created for the unknown user'
);

select tests.authenticate_as(:'worker');
select is(public.my_payouts_status(), 'under_review',
  '6: owner — my_payouts_status() follows: under_review');
select is(public.my_payouts_enabled(), false,
  '6: owner — my_payouts_enabled() follows: false');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- §7. P7 — THE SENTINEL.
-- ---------------------------------------------------------------------------
select ok(public.connect_onboarding_enabled(),
  '7: connect_onboarding_enabled() is true — the whole migration committed');
select ok(has_function_privilege('authenticated', 'public.connect_onboarding_enabled()', 'EXECUTE'),
  '7: and authenticated may read the sentinel, as with the other two');

select * from finish();
rollback;
