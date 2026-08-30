-- 070_settlement_retry.sql — the R6b proofs: 20260920000000_settlement_retry.sql
-- proven on the local stack before the pipeline applies it anywhere. Each
-- section is one line of the run's proof ledger; its assertions say which.
--
-- THE CAST (named once; every assertion says which of these it ran as):
--   customer   posts and pays for the one job here (the payer)
--   worker     is hired on it (the payee)
--   stranger   an unrelated, active, authenticated account
--   anon       no session at all (privilege checks only, as in 060)
--   service    the service role (set_config role/claims, as process-settlements'
--              recorder RPC runs)
--   runner     the connection's own role, RLS bypassed — fixtures, ground
--              truth, snapshots, and the stand-in for the webhook
--
-- THE FIXTURE: one job hired through the real RPCs (create_job, create_offer,
-- accept_offer) by tests.r4_hire and funded through begin_job_payment + a
-- synthesized payment_intent.succeeded event (tests.r4_fund). The three
-- helpers are copied from 060_connect.sql verbatim — same names, same call
-- shapes — because each file's transaction owns its own copy and rolls it
-- back. Everything rolls back.
--
-- FIXTURE SURGERY, DECLARED (each one is a state the product cannot reach in
-- a single transaction, or cannot reach at all):
--   * payments.updated_at is rewound one hour before each recorder call, so
--     "stamped" is provable (now() is constant inside the transaction).
--   * §6 walks refunds_due's predicate one term at a time by raw runner
--     UPDATEs of refund_cents, refund_ref, status and provider on the funded
--     row, restoring each. No RPC writes those columns in the shapes needed to
--     isolate a single term, and the proof is about the VIEW, not its writers.
--
-- THE ASSERTION THAT MATTERS MOST (§2, §3): the whole payments row is captured
-- as jsonb BEFORE and AFTER each recorder call, and the two are asserted equal
-- once the three columns the recorder owns — the kind's counter, last_error,
-- updated_at — are removed from both. Run for kind transfer (refund_attempts
-- stays inside the compared remainder) and for kind refund (transfer_attempts
-- stays inside it), so each proves the OTHER counter untouched. No payments
-- trigger writes a column on update (payments_notify_release only enqueues a
-- notification, and only when status becomes released; payments_tip_ceiling
-- is BEFORE INSERT), so the exclusion is exactly those three.
--
-- PAIRING: every refusal sits beside the positive control on the same
-- fixture. throws_ok pins code AND message.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(97);

-- psql does not interpolate :'vars' inside dollar quotes, so ids also live in
-- this temp table for the statements throws_ok/lives_ok execute.
create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated, service_role;
-- Whole-row snapshots for the "nothing else changed" proofs.
create temp table snap (k text primary key, j jsonb);

select tests.create_user('r6b.customer@brazos.test', 'Cara Customer') as customer \gset
select tests.create_user('r6b.worker@brazos.test',   'Wren Worker')   as worker   \gset
select tests.create_user('r6b.stranger@brazos.test', 'Sal Stranger')  as stranger \gset
insert into fx values ('customer', :'customer'), ('worker', :'worker'), ('stranger', :'stranger');

-- ---------------------------------------------------------------------------
-- Helpers for this file, copied from 060_connect.sql. Created inside the
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
-- §0. THE SENTINEL, and the two migrations §0 of the file pre-flights against.
-- ---------------------------------------------------------------------------
select ok(public.settlement_retry_enabled(),
  '0: settlement_retry_enabled() is true — the whole migration committed');
select ok(has_function_privilege('authenticated', 'public.settlement_retry_enabled()', 'EXECUTE'),
  '0: and authenticated may read the sentinel, as with stripe_foundation_enabled and connect_onboarding_enabled');
select ok(public.stripe_foundation_enabled() and public.connect_onboarding_enabled(),
  '0: the two migrations the pre-flight requires are applied beneath it');

-- ---------------------------------------------------------------------------
-- §1. THE COLUMN AND ITS CONSTRAINT (D4): refund_attempts, shaped exactly on
--     transfer_attempts, refusing a negative by name.
-- ---------------------------------------------------------------------------
select has_column('public', 'payments', 'refund_attempts', '1: payments.refund_attempts exists');
select col_type_is('public', 'payments', 'refund_attempts', 'integer', '1: it is an integer');
select col_not_null('public', 'payments', 'refund_attempts', '1: not null');
select col_default_is('public', 'payments', 'refund_attempts', 0, '1: default 0 — every existing row starts unrotated, exactly as transfer_attempts did');
select ok(
  (select col_description(a.attrelid, a.attnum) from pg_attribute a
    where a.attrelid = 'public.payments'::regclass and a.attname = 'refund_attempts') like '%rf:<payment id>:<refund_attempts>%',
  '1: the column comment names the key it rotates'
);
select is(
  (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = 'public.payments'::regclass and c.conname = 'payments_refund_attempts_not_negative'),
  'CHECK ((refund_attempts >= 0))',
  '1: payments_refund_attempts_not_negative is CHECK ((refund_attempts >= 0))'
);
select is(
  (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = 'public.payments'::regclass and c.conname = 'payments_transfer_attempts_not_negative'),
  'CHECK ((transfer_attempts >= 0))',
  '1: shaped exactly on payments_transfer_attempts_not_negative, which is unchanged'
);

-- The fixture: one funded stripe row.
select tests.r4_hire(:'customer', :'worker', 5000, 'R6b settlement retry') as j1 \gset
select tests.r4_fund(:'customer', :'j1', 'evt_r6b_p1') as p1 \gset
insert into fx values ('j1', :'j1'), ('p1', :'p1');

select is((select status::text from public.payments where id = :'p1'), 'held',
  '1: runner — the fixture row is held (funded through the real RPCs)');
select is((select refund_attempts from public.payments where id = :'p1'), 0,
  '1: runner — a freshly funded row starts at refund_attempts 0');
select is((select transfer_attempts from public.payments where id = :'p1'), 0,
  '1: runner — and transfer_attempts 0 (the pair for §2)');
select is((select last_error from public.payments where id = :'p1'), null::text,
  '1: runner — and last_error null: nothing has been attempted, and nothing says so');

select throws_ok(
  $$ update public.payments set refund_attempts = -1 where id = (select v from fx where k = 'p1') $$,
  '23514', 'new row for relation "payments" violates check constraint "payments_refund_attempts_not_negative"',
  '1: runner — a negative refund_attempts is refused by name'
);
select lives_ok(
  $$ update public.payments set refund_attempts = 0 where id = (select v from fx where k = 'p1') $$,
  '1: runner — zero is admitted (paired control)'
);
select throws_ok(
  $$ update public.payments set transfer_attempts = -1 where id = (select v from fx where k = 'p1') $$,
  '23514', 'new row for relation "payments" violates check constraint "payments_transfer_attempts_not_negative"',
  '1: runner — the transfer twin still refuses a negative'
);

-- ---------------------------------------------------------------------------
-- §2. THE RECORDER, kind transfer (D2, D3): rotate true increments
--     transfer_attempts; rotate false does not; both write last_error and
--     stamp updated_at; NOTHING ELSE on the row changes.
-- ---------------------------------------------------------------------------
select count(*) as outbox_before from public.notification_outbox \gset

-- SURGERY: updated_at rewound one hour so the stamp is provable.
update public.payments set updated_at = updated_at - interval '1 hour' where id = :'p1';
insert into snap select 't1_before', to_jsonb(p) from public.payments p where id = :'p1';

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('role', 'service_role', true);
select is(
  public.record_settlement_attempt((select v from fx where k = 'p1'), 'transfer', true,
    '400 balance_insufficient: You have insufficient available funds in your Stripe account.'),
  true,
  '2: service — kind transfer, rotate true: a payments row matched (true)'
);
select set_config('role', 'none', true);
insert into snap select 't1_after', to_jsonb(p) from public.payments p where id = :'p1';

select is((select transfer_attempts from public.payments where id = :'p1'), 1,
  '2: runner — transfer_attempts 0 → 1: the key rotates from tr:<id>:0 to tr:<id>:1');
select is((select refund_attempts from public.payments where id = :'p1'), 0,
  '2: runner — refund_attempts is untouched by a transfer record');
select is((select last_error from public.payments where id = :'p1'),
  'transfer: 400 balance_insufficient: You have insufficient available funds in your Stripe account.',
  '2: runner — last_error is the kind, a colon, and what the provider said');
select is((select updated_at from public.payments where id = :'p1'), now(),
  '2: runner — updated_at is stamped (it was rewound one hour before the call)');
select is(
  (select j from snap where k = 't1_before') - 'transfer_attempts' - 'last_error' - 'updated_at',
  (select j from snap where k = 't1_after')  - 'transfer_attempts' - 'last_error' - 'updated_at',
  '2: NO OTHER COLUMN of the row changed across the call — the whole row as jsonb, minus exactly the three the recorder owns, is identical before and after'
);
select is(
  (select count(*) from jsonb_each((select j from snap where k = 't1_before')) b
     join jsonb_each((select j from snap where k = 't1_after')) a using (key)
    where b.value is distinct from a.value),
  3::bigint,
  '2: and exactly three keys differ between the two snapshots'
);
select is((select count(*) from public.notification_outbox), :outbox_before::bigint,
  '2: runner — payments_notify_release enqueued nothing: the money state did not move');

-- rotate false: the failure is still recorded, the key is kept.
update public.payments set updated_at = updated_at - interval '1 hour' where id = :'p1';
insert into snap select 't2_before', to_jsonb(p) from public.payments p where id = :'p1';

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('role', 'service_role', true);
select is(
  public.record_settlement_attempt((select v from fx where k = 'p1'), 'transfer', false, '500: empty body'),
  true,
  '2: service — kind transfer, rotate false: matched (true)'
);
select set_config('role', 'none', true);
insert into snap select 't2_after', to_jsonb(p) from public.payments p where id = :'p1';

select is((select transfer_attempts from public.payments where id = :'p1'), 1,
  '2: runner — rotate false leaves transfer_attempts at 1: the key is KEPT (a 5xx, a 409, a 429, a throw)');
select is((select last_error from public.payments where id = :'p1'), 'transfer: 500: empty body',
  '2: runner — but the failure is still recorded');
select is((select updated_at from public.payments where id = :'p1'), now(),
  '2: runner — and updated_at is stamped again');
select is(
  (select j from snap where k = 't2_before') - 'transfer_attempts' - 'last_error' - 'updated_at',
  (select j from snap where k = 't2_after')  - 'transfer_attempts' - 'last_error' - 'updated_at',
  '2: NO OTHER COLUMN changed on the rotate-false call either'
);

-- ---------------------------------------------------------------------------
-- §3. THE SAME PAIR, kind refund: refund_attempts moves, transfer_attempts
--     stays inside the compared remainder — the proof the OTHER counter is
--     untouched, in both directions.
-- ---------------------------------------------------------------------------
update public.payments set updated_at = updated_at - interval '1 hour' where id = :'p1';
insert into snap select 'r1_before', to_jsonb(p) from public.payments p where id = :'p1';

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('role', 'service_role', true);
select is(
  public.record_settlement_attempt((select v from fx where k = 'p1'), 'refund', true,
    '400 charge_already_refunded: Charge ch_r6b has already been refunded.'),
  true,
  '3: service — kind refund, rotate true: matched (true)'
);
select set_config('role', 'none', true);
insert into snap select 'r1_after', to_jsonb(p) from public.payments p where id = :'p1';

select is((select refund_attempts from public.payments where id = :'p1'), 1,
  '3: runner — refund_attempts 0 → 1: the key rotates from rf:<id>:0 to rf:<id>:1');
select is((select transfer_attempts from public.payments where id = :'p1'), 1,
  '3: runner — transfer_attempts is untouched by a refund record');
select is((select last_error from public.payments where id = :'p1'),
  'refund: 400 charge_already_refunded: Charge ch_r6b has already been refunded.',
  '3: runner — last_error carries the refund kind');
select is((select updated_at from public.payments where id = :'p1'), now(),
  '3: runner — updated_at is stamped');
select is(
  (select j from snap where k = 'r1_before') - 'refund_attempts' - 'last_error' - 'updated_at',
  (select j from snap where k = 'r1_after')  - 'refund_attempts' - 'last_error' - 'updated_at',
  '3: NO OTHER COLUMN changed — transfer_attempts is inside the compared remainder, so this is the proof the other counter is untouched'
);
select is(
  (select count(*) from jsonb_each((select j from snap where k = 'r1_before')) b
     join jsonb_each((select j from snap where k = 'r1_after')) a using (key)
    where b.value is distinct from a.value),
  3::bigint,
  '3: and exactly three keys differ'
);

update public.payments set updated_at = updated_at - interval '1 hour' where id = :'p1';
insert into snap select 'r2_before', to_jsonb(p) from public.payments p where id = :'p1';

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('role', 'service_role', true);
select is(
  public.record_settlement_attempt((select v from fx where k = 'p1'), 'refund', false, 'threw: fetch failed'),
  true,
  '3: service — kind refund, rotate false: matched (true)'
);
select set_config('role', 'none', true);
insert into snap select 'r2_after', to_jsonb(p) from public.payments p where id = :'p1';

select is((select refund_attempts from public.payments where id = :'p1'), 1,
  '3: runner — rotate false leaves refund_attempts at 1: the key is kept');
select is((select last_error from public.payments where id = :'p1'), 'refund: threw: fetch failed',
  '3: runner — a throw is recorded like any other non-success');
select is((select updated_at from public.payments where id = :'p1'), now(),
  '3: runner — updated_at is stamped');
select is(
  (select j from snap where k = 'r2_before') - 'refund_attempts' - 'last_error' - 'updated_at',
  (select j from snap where k = 'r2_after')  - 'refund_attempts' - 'last_error' - 'updated_at',
  '3: NO OTHER COLUMN changed on the rotate-false refund call either'
);

-- ---------------------------------------------------------------------------
-- §4. THE EDGES: an unknown kind raises and writes nothing; an unknown or
--     null row is false; the error is bounded at 500; a null error and a null
--     rotate degrade to "recorded, not rotated".
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('role', 'service_role', true);
select throws_ok(
  $$ select public.record_settlement_attempt((select v from fx where k = 'p1'), 'payout', true, 'x') $$,
  'P0001', 'record_settlement_attempt: unknown kind payout; transfer or refund only',
  '4: service — an unknown kind raises by name'
);
select throws_ok(
  $$ select public.record_settlement_attempt((select v from fx where k = 'p1'), null, true, 'x') $$,
  'P0001', 'record_settlement_attempt: unknown kind <null>; transfer or refund only',
  '4: service — and so does a null kind: allow-list, never block-list'
);
select is(
  public.record_settlement_attempt(gen_random_uuid(), 'transfer', true, 'x'), false,
  '4: service — an unknown payment id matches no row: false'
);
select is(
  public.record_settlement_attempt(null, 'transfer', true, 'x'), false,
  '4: service — a null payment id matches no row: false'
);
select set_config('role', 'none', true);

select is((select transfer_attempts from public.payments where id = :'p1'), 1,
  '4: runner — the refused and unmatched calls left transfer_attempts at 1');
select is((select refund_attempts from public.payments where id = :'p1'), 1,
  '4: runner — and refund_attempts at 1');
select is((select last_error from public.payments where id = :'p1'), 'refund: threw: fetch failed',
  '4: runner — and last_error as §3 left it: they wrote nothing');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('role', 'service_role', true);
select is(
  public.record_settlement_attempt((select v from fx where k = 'p1'), 'transfer', true, repeat('x', 600)),
  true,
  '4: service — a 600-character provider error is accepted'
);
select set_config('role', 'none', true);
select is((select length(last_error) from public.payments where id = :'p1'), 500,
  '4: runner — and last_error is bounded at 500 characters');
select ok((select last_error like 'transfer: xxxxxxxxxx%' from public.payments where id = :'p1'),
  '4: runner — with the kind prefix intact: the bound trims the tail, never the head');
select is((select transfer_attempts from public.payments where id = :'p1'), 2,
  '4: runner — and that rotate-true call moved transfer_attempts 1 → 2');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('role', 'service_role', true);
select is(
  public.record_settlement_attempt((select v from fx where k = 'p1'), 'transfer', false, null),
  true,
  '4: service — a null error is accepted'
);
select set_config('role', 'none', true);
select is((select last_error from public.payments where id = :'p1'), 'transfer: ',
  '4: runner — and still records the kind: last_error never goes back to null once an attempt happened');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('role', 'service_role', true);
select is(
  public.record_settlement_attempt((select v from fx where k = 'p1'), 'transfer', null, 'null rotate'),
  true,
  '4: service — a null rotate flag is accepted'
);
select set_config('role', 'none', true);
select is((select transfer_attempts from public.payments where id = :'p1'), 2,
  '4: runner — and is no rotation: transfer_attempts stays at 2');
select is((select last_error from public.payments where id = :'p1'), 'transfer: null rotate',
  '4: runner — while the failure is still recorded');

-- ---------------------------------------------------------------------------
-- §5. GRANTS (D3): authenticated and anon have nothing; service_role
--     executes; paired on the same fixture row.
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.record_settlement_attempt(uuid, text, boolean, text)', 'EXECUTE'),
  '5: authenticated has no EXECUTE on record_settlement_attempt');
select ok(not has_function_privilege('anon', 'public.record_settlement_attempt(uuid, text, boolean, text)', 'EXECUTE'),
  '5: anon has no EXECUTE on record_settlement_attempt');
select ok(has_function_privilege('service_role', 'public.record_settlement_attempt(uuid, text, boolean, text)', 'EXECUTE'),
  '5: service_role has EXECUTE (positive control)');
select is(
  (select array_to_string(p.proacl, ' ; ') from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'record_settlement_attempt'),
  'postgres=X/postgres ; service_role=X/postgres',
  '5: the ACL is exactly the 20260915 pattern — owner and service_role, nothing left from PUBLIC (set_payouts_status carries the same)'
);

select tests.authenticate_as(:'worker');
select throws_ok(
  $$ select public.record_settlement_attempt((select v from fx where k = 'p1'), 'transfer', true, 'x') $$,
  '42501', 'permission denied for function record_settlement_attempt',
  '5: worker — the payee cannot record an attempt on their own row'
);
select tests.authenticate_as(:'customer');
select throws_ok(
  $$ select public.record_settlement_attempt((select v from fx where k = 'p1'), 'refund', true, 'x') $$,
  '42501', 'permission denied for function record_settlement_attempt',
  '5: customer — nor can the payer'
);
select tests.authenticate_as(:'stranger');
select throws_ok(
  $$ select public.record_settlement_attempt((select v from fx where k = 'p1'), 'transfer', true, 'x') $$,
  '42501', 'permission denied for function record_settlement_attempt',
  '5: stranger — nor an unrelated account'
);
select tests.clear_auth();

select is((select transfer_attempts from public.payments where id = :'p1'), 2,
  '5: runner — the refused calls left transfer_attempts at 2');
select is((select refund_attempts from public.payments where id = :'p1'), 1,
  '5: runner — and refund_attempts at 1');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('role', 'service_role', true);
select is(
  public.record_settlement_attempt((select v from fx where k = 'p1'), 'refund', false, 'grant pair'),
  true,
  '5: service — the same call on the same row succeeds (positive control)'
);
select set_config('role', 'none', true);
select is((select last_error from public.payments where id = :'p1'), 'refund: grant pair',
  '5: runner — and wrote');

-- ---------------------------------------------------------------------------
-- §6. THE VIEWS (D5): transfers_due byte-unchanged; refunds_due with the same
--     predicate, refund_attempts appended, the same rows admitted and refused.
-- ---------------------------------------------------------------------------
select is(
  btrim(regexp_replace(pg_get_viewdef('public.transfers_due'::regclass, true), '\s+', ' ', 'g')),
  'SELECT id, job_id, payer_id, payee_id, amount_cents, platform_fee_cents, stripe_payment_intent_id, status, created_at, kind, offer_id, provider, provider_ref, authorized_at, held_at, updated_at, released_at, release_reason, paid_out_at, customer_fee_bps, customer_fee_cents, worker_fee_bps, tax_cents, transfer_ref, refund_ref, release_requested_at, funding_due_at, chargeback_ref, chargeback_at, last_error, transfer_cents, refund_cents, refund_reason, transfer_reversed_at, transfer_attempts, charge_amount_cents FROM payments p WHERE provider = ''stripe''::text AND release_requested_at IS NOT NULL AND transfer_ref IS NULL AND transfer_reversed_at IS NULL AND COALESCE(transfer_cents, 0) > 0 AND NOT (EXISTS ( SELECT 1 FROM job_disputes d WHERE d.job_id = p.job_id AND d.status = ''open''::dispute_status)) ORDER BY release_requested_at;',
  '6: transfers_due is BYTE-UNCHANGED — its definition is exactly what 20260905 §15 created (captured from the stack before this migration existed)'
);
select is(
  (select string_agg(column_name::text, ',' order by ordinal_position) from information_schema.columns
    where table_schema = 'public' and table_name = 'transfers_due'),
  'id,job_id,payer_id,payee_id,amount_cents,platform_fee_cents,stripe_payment_intent_id,status,created_at,kind,offer_id,provider,provider_ref,authorized_at,held_at,updated_at,released_at,release_reason,paid_out_at,customer_fee_bps,customer_fee_cents,worker_fee_bps,tax_cents,transfer_ref,refund_ref,release_requested_at,funding_due_at,chargeback_ref,chargeback_at,last_error,transfer_cents,refund_cents,refund_reason,transfer_reversed_at,transfer_attempts,charge_amount_cents',
  '6: transfers_due still lists the 36 columns it was created with — refund_attempts is NOT among them, which is what "a view freezes its column list" means'
);

select has_column('public', 'refunds_due', 'refund_attempts', '6: refunds_due now exposes refund_attempts');
select is(
  (select string_agg(column_name::text, ',' order by ordinal_position) from information_schema.columns
    where table_schema = 'public' and table_name = 'refunds_due'),
  (select string_agg(column_name::text, ',' order by ordinal_position) from information_schema.columns
    where table_schema = 'public' and table_name = 'payments'),
  '6: refunds_due''s column list is payments'' column list, in order'
);
select is(
  (select column_name::text from information_schema.columns
    where table_schema = 'public' and table_name = 'refunds_due' order by ordinal_position desc limit 1),
  'refund_attempts',
  '6: and refund_attempts is the LAST column — appended, never inserted or reordered'
);
select is(
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'refunds_due'),
  37::bigint,
  '6: exactly one column gained: 36 → 37'
);
select is(
  btrim(regexp_replace(pg_get_viewdef('public.refunds_due'::regclass, true), '\s+', ' ', 'g')),
  'SELECT id, job_id, payer_id, payee_id, amount_cents, platform_fee_cents, stripe_payment_intent_id, status, created_at, kind, offer_id, provider, provider_ref, authorized_at, held_at, updated_at, released_at, release_reason, paid_out_at, customer_fee_bps, customer_fee_cents, worker_fee_bps, tax_cents, transfer_ref, refund_ref, release_requested_at, funding_due_at, chargeback_ref, chargeback_at, last_error, transfer_cents, refund_cents, refund_reason, transfer_reversed_at, transfer_attempts, charge_amount_cents, refund_attempts FROM payments p WHERE provider = ''stripe''::text AND COALESCE(refund_cents, 0) > 0 AND refund_ref IS NULL AND status <> ''refunded''::payment_status ORDER BY updated_at;',
  '6: refunds_due''s definition is 20260905''s with refund_attempts appended to the select list and NOTHING else different'
);
select is(
  substring(regexp_replace(pg_get_viewdef('public.refunds_due'::regclass, true), '\s+', ' ', 'g') from 'WHERE.*$'),
  'WHERE provider = ''stripe''::text AND COALESCE(refund_cents, 0) > 0 AND refund_ref IS NULL AND status <> ''refunded''::payment_status ORDER BY updated_at;',
  '6: its WHERE / ORDER BY predicate is byte-for-byte the 20260905 one'
);
select ok(not has_table_privilege('authenticated', 'public.refunds_due', 'SELECT'),
  '6: authenticated still has no SELECT on refunds_due after the replace');
select ok(not has_table_privilege('anon', 'public.refunds_due', 'SELECT'),
  '6: anon still has no SELECT on refunds_due');
select ok(has_table_privilege('service_role', 'public.refunds_due', 'SELECT'),
  '6: service_role reads refunds_due (positive control)');
select ok((select obj_description('public.refunds_due'::regclass, 'pg_class')) like '%rf:<id>:<refund_attempts>%',
  '6: the view comment names the new key shape');

-- SAME ROWS: the funded row walks every term of the predicate, one at a
-- time, each refusal beside its admission. The values are what the predicate
-- admitted and refused before this migration; the predicate text above is
-- unchanged, so the same rows are admitted and refused after it.
select status::text as p1_status from public.payments where id = :'p1' \gset
select ok(not exists (select 1 from public.refunds_due where id = :'p1'),
  '6: a held row with refund_cents null is REFUSED (coalesce(refund_cents, 0) > 0)');
update public.payments set refund_cents = 1000 where id = :'p1';
select ok(exists (select 1 from public.refunds_due where id = :'p1'),
  '6: refund_cents 1000, refund_ref null, status held, provider stripe: ADMITTED');
select is((select refund_attempts from public.refunds_due where id = :'p1'), 1,
  '6: and the queue row carries the counter the drain builds rf:<id>:<refund_attempts> from');
update public.payments set refund_ref = 're_r6b_probe' where id = :'p1';
select ok(not exists (select 1 from public.refunds_due where id = :'p1'),
  '6: a recorded refund_ref REFUSES the row');
update public.payments set refund_ref = null where id = :'p1';
select ok(exists (select 1 from public.refunds_due where id = :'p1'),
  '6: refund_ref back to null: admitted again');
update public.payments set status = 'refunded' where id = :'p1';
select ok(not exists (select 1 from public.refunds_due where id = :'p1'),
  '6: status refunded REFUSES the row (the hand-refund divergence)');
update public.payments set status = :'p1_status'::public.payment_status where id = :'p1';
select ok(exists (select 1 from public.refunds_due where id = :'p1'),
  '6: status back to held: admitted again');
update public.payments set provider = 'sandbox' where id = :'p1';
select ok(not exists (select 1 from public.refunds_due where id = :'p1'),
  '6: a sandbox row is REFUSED — only stripe rows are settled by the provider');
update public.payments set provider = 'stripe' where id = :'p1';
select ok(exists (select 1 from public.refunds_due where id = :'p1'),
  '6: provider back to stripe: admitted again');
update public.payments set refund_cents = 0 where id = :'p1';
select ok(not exists (select 1 from public.refunds_due where id = :'p1'),
  '6: refund_cents 0 is REFUSED');
update public.payments set refund_cents = null where id = :'p1';
select ok(not exists (select 1 from public.refunds_due where id = :'p1'),
  '6: refund_cents null is REFUSED');
update public.payments set refund_cents = 1000 where id = :'p1';
select ok(exists (select 1 from public.refunds_due where id = :'p1'),
  '6: refund_cents back to 1000: admitted (final control)');
select is((select count(*) from public.transfers_due where id = :'p1'), 0::bigint,
  '6: and none of that put the row in transfers_due — no release was requested');

-- The drain's exact selects, as the service role reads them.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('role', 'service_role', true);
select lives_ok(
  $$ select id, provider_ref, refund_cents, refund_attempts from public.refunds_due limit 25 $$,
  '6: service — the drain''s refunds select (id, provider_ref, refund_cents, refund_attempts) is answerable'
);
select lives_ok(
  $$ select id, payee_id, transfer_cents, transfer_attempts from public.transfers_due limit 25 $$,
  '6: service — and the drain''s transfers select (id, payee_id, transfer_cents, transfer_attempts) still is'
);
select is(
  (select refund_attempts from public.refunds_due where id = (select v from fx where k = 'p1')), 1,
  '6: service — reading the counter through the view as the drain does'
);
select set_config('role', 'none', true);

select * from finish();
rollback;
