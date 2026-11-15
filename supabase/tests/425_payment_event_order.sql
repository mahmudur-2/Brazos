-- 425_payment_event_order.sql — pack 1, A5: an older webhook event never undoes a newer state.
-- Proves 20261115000600_refund_failed_and_event_order.sql (apply_payment_event): the refund status
-- follows the greatest refunded total recorded, and a card dispute closed as won stays closed for
-- that dispute id; a closing event of another dispute clears nothing. Every older event is sent
-- twice, under two event ids, as a provider retry or a second endpoint would.
--
-- THE CAST: a customer, a worker with an enabled payout account, the runner (RLS bypassed; the
-- webhook's stand-in). Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(14);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('eo.customer@brazos.test', 'Eve Customer') as customer \gset
select tests.create_user('eo.worker@brazos.test',   'Eli Worker')   as worker   \gset
insert into fx values ('customer', :'customer'), ('worker', :'worker');

-- One stored provider event, applied. p_created is the event's own time (unix seconds).
create or replace function tests.eo_event(p_id text, p_type text, p_created bigint, p_object jsonb) returns jsonb language plpgsql as $$
begin
  insert into public.payment_events (id, type, payload)
  values (p_id, p_type, jsonb_build_object('id', p_id, 'type', p_type, 'created', p_created,
                                           'data', jsonb_build_object('object', p_object)))
  on conflict (id) do nothing;
  return public.apply_payment_event(p_id);
end $$;

-- Hire at $50 and fund: the payment is held. Returns the payment id.
create or replace function tests.eo_held(p_title text) returns uuid language plpgsql as $$
declare
  v_customer uuid := (select v from fx where k = 'customer');
  v_worker   uuid := (select v from fx where k = 'worker');
  v_job uuid;
  v_offer uuid;
begin
  perform tests.clear_auth();
  update public.rate_counters set hits = 0 where user_id in (v_customer, v_worker);
  perform tests.authenticate_as(v_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'Event order probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000, p_address_line := '4 Proof Way'
  )).id into v_job;
  perform tests.authenticate_as(v_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Event order bid');
  perform tests.authenticate_as(v_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  return tests.test_fund_job(v_job);
end $$;

-- A charge.refunded for payment p_pid with the charge's running refunded total p_total.
create or replace function tests.eo_refunded(p_id text, p_created bigint, p_pid uuid, p_total integer) returns jsonb language sql as $$
  select tests.eo_event(p_id, 'charge.refunded', p_created, jsonb_build_object(
    'id', 'ch_eo_' || left(md5(p_pid::text), 10), 'object', 'charge',
    'payment_intent', (select provider_ref from public.payments where id = p_pid),
    'amount_refunded', p_total))
$$;

-- A charge.dispute.* for payment p_pid: dispute p_dispute in status p_status.
create or replace function tests.eo_dispute(p_id text, p_type text, p_created bigint, p_pid uuid, p_dispute text, p_status text) returns jsonb language sql as $$
  select tests.eo_event(p_id, p_type, p_created, jsonb_build_object(
    'id', p_dispute, 'object', 'dispute', 'status', p_status, 'amount',
    (select charge_amount_cents from public.payments where id = p_pid),
    'payment_intent', (select provider_ref from public.payments where id = p_pid)))
$$;

create or replace function tests.eo_state(p_pid uuid) returns text language sql as $$
  select status::text || '/' || coalesce(refunded_cents::text, 'null')
    from public.payments where id = p_pid
$$;

create or replace function tests.eo_dispute_state(p_pid uuid) returns text language sql as $$
  select coalesce(chargeback_ref, 'null') || '/' || (chargeback_at is not null)::text || '/' || coalesce(chargeback_cents::text, 'null')
    from public.payments where id = p_pid
$$;

-- ---------------------------------------------------------------------------
-- 1. The refund status follows the greatest refunded total, whatever the order.
-- ---------------------------------------------------------------------------
select tests.eo_held('EO refund order') as p1 \gset
select charge_amount_cents as c1 from public.payments where id = :'p1' \gset

select tests.eo_refunded('evt_eo_r_full', 1800000200, :'p1', :'c1');
select is(tests.eo_state(:'p1'), 'refunded/' || :'c1', '1a (control): the full refund lands: refunded');
select tests.eo_refunded('evt_eo_r_part_a', 1800000100, :'p1', 1000);
select is(tests.eo_state(:'p1'), 'refunded/' || :'c1', '1b: an older partial charge.refunded after it: still refunded, total kept');
select tests.eo_refunded('evt_eo_r_part_b', 1800000100, :'p1', 1000);
select is(tests.eo_state(:'p1'), 'refunded/' || :'c1', '1c: the same older event under another id: still refunded');

select tests.eo_held('EO refund grows') as p2 \gset
select charge_amount_cents as c2 from public.payments where id = :'p2' \gset
select tests.eo_refunded('evt_eo_g_part', 1800000100, :'p2', 1000);
select is(tests.eo_state(:'p2'), 'partially_refunded/1000', '1d (control): a partial refund: partially_refunded');
select tests.eo_refunded('evt_eo_g_full', 1800000200, :'p2', :'c2');
select is(tests.eo_state(:'p2'), 'refunded/' || :'c2', '1e (control): the rest lands later: refunded');

-- ---------------------------------------------------------------------------
-- 2. A dispute closed as won stays closed for its id: a late dispute.created blocks nothing.
-- ---------------------------------------------------------------------------
select tests.eo_held('EO dispute order') as p3 \gset
select tests.eo_dispute('evt_eo_d1_won', 'charge.dispute.closed', 1800000300, :'p3', 'dp_eo_1', 'won');
select is(tests.eo_dispute_state(:'p3'), 'dp_eo_1/false/null', '2a (control): dp_eo_1 closed as won: no block');
select tests.eo_dispute('evt_eo_d1_new_a', 'charge.dispute.created', 1800000200, :'p3', 'dp_eo_1', 'needs_response');
select is(tests.eo_dispute_state(:'p3'), 'dp_eo_1/false/null', '2b: its older dispute.created arrives after: still no block');
select tests.eo_dispute('evt_eo_d1_new_b', 'charge.dispute.created', 1800000200, :'p3', 'dp_eo_1', 'needs_response');
select is(tests.eo_dispute_state(:'p3'), 'dp_eo_1/false/null', '2c: the same older event under another id: still no block');
select ok(not exists (select 1 from public.payment_attention a where a.payment_id = :'p3' and a.reason like 'card dispute%'),
  '2d: and payment_attention lists no open card dispute for it');

-- A warning_closed inquiry clears the same way.
select tests.eo_held('EO inquiry order') as p4 \gset
select tests.eo_dispute('evt_eo_i1_closed', 'charge.dispute.closed', 1800000300, :'p4', 'dp_eo_i1', 'warning_closed');
select tests.eo_dispute('evt_eo_i1_new', 'charge.dispute.created', 1800000200, :'p4', 'dp_eo_i1', 'warning_needs_response');
select is(tests.eo_dispute_state(:'p4'), 'dp_eo_i1/false/null', '2e: an inquiry closed as warning_closed stays closed for its id');

-- ---------------------------------------------------------------------------
-- 3. Another dispute: its own block, and only its own closing clears it.
-- ---------------------------------------------------------------------------
select tests.eo_dispute('evt_eo_d2_new', 'charge.dispute.created', 1800000400, :'p3', 'dp_eo_2', 'needs_response');
select is(tests.eo_dispute_state(:'p3'), 'dp_eo_2/true/' || (select charge_amount_cents from public.payments where id = :'p3'),
  '3a (control): a new dispute dp_eo_2 blocks the money');
select tests.eo_dispute('evt_eo_d1_won_again_a', 'charge.dispute.closed', 1800000500, :'p3', 'dp_eo_1', 'won');
select is(tests.eo_dispute_state(:'p3'), 'dp_eo_2/true/' || (select charge_amount_cents from public.payments where id = :'p3'),
  '3b: a closing event of dp_eo_1 clears nothing of dp_eo_2');
select tests.eo_dispute('evt_eo_d1_won_again_b', 'charge.dispute.closed', 1800000500, :'p3', 'dp_eo_1', 'won');
select is(tests.eo_dispute_state(:'p3'), 'dp_eo_2/true/' || (select charge_amount_cents from public.payments where id = :'p3'),
  '3c: the same under another id: still blocked');
select tests.eo_dispute('evt_eo_d2_won', 'charge.dispute.closed', 1800000600, :'p3', 'dp_eo_2', 'won');
select is(tests.eo_dispute_state(:'p3'), 'dp_eo_2/false/null', '3d (control): dp_eo_2 closed as won clears its block');

select * from finish();
rollback;
