-- 425_payment_event_order.sql — pack 1, A5: an older webhook event never undoes a newer state.
-- Proves 20261115000600_refund_failed_and_event_order.sql (apply_payment_event, payment_disputes):
-- the refund status follows the greatest refunded total recorded, and a card dispute closed as won
-- stays closed for that dispute id; a closing event of another dispute clears nothing. Every older
-- event is sent twice, under two event ids, as a provider retry or a second endpoint would.
-- Codex round 3: the money stays blocked while any dispute of the payment is open (R3-A2), a
-- dispute closed twice never lets money leave after a lost, and the rules still hold after the
-- 90-day prune empties the payloads (R3-A5).
--
-- THE CAST: a customer, a worker with an enabled payout account, the runner (RLS bypassed; the
-- webhook's stand-in). Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(26);

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

-- A held payment with a transfer and a refund asked (the late-cancellation shape cancel_job writes,
-- 20261115000500_money_notices.sql): both queues would send it while nothing blocks the money.
create or replace function tests.eo_asked(p_title text) returns uuid language plpgsql as $$
declare v_pid uuid := tests.eo_held(p_title);
begin
  update public.payments
     set transfer_cents = 1000, refund_cents = charge_amount_cents - 1000, release_reason = 'cancellation_fee',
         release_requested_at = now(), refund_reason = 'customer_cancelled_late'
   where id = v_pid;
  return v_pid;
end $$;

-- in transfers_due / in refunds_due / status.
create or replace function tests.eo_queues(p_pid uuid) returns text language sql as $$
  select (exists (select 1 from public.transfers_due t where t.id = p_pid))::text || '/'
      || (exists (select 1 from public.refunds_due r where r.id = p_pid))::text || '/'
      || (select status::text from public.payments where id = p_pid)
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

-- ---------------------------------------------------------------------------
-- 4. R3-A2: D2 opens, a late D1 opens after it, D1 closes; the open D2 keeps both queues blocked.
-- ---------------------------------------------------------------------------
select tests.eo_asked('EO two disputes won') as q1 \gset
select tests.eo_asked('EO two disputes inquiry') as q2 \gset
select tests.eo_asked('EO two disputes lost') as q3 \gset
select is(tests.eo_queues(:'q1') || ' ' || tests.eo_queues(:'q2') || ' ' || tests.eo_queues(:'q3'),
  'true/true/held true/true/held true/true/held', '4a (control): a transfer and a refund asked: both queues would send them');
select tests.eo_dispute('evt_eo_q1_d2', 'charge.dispute.created', 1800000700, :'q1', 'dp_eo_q1_2', 'needs_response');
select tests.eo_dispute('evt_eo_q1_d1', 'charge.dispute.created', 1800000600, :'q1', 'dp_eo_q1_1', 'needs_response');
select tests.eo_dispute('evt_eo_q1_d1c', 'charge.dispute.closed', 1800000800, :'q1', 'dp_eo_q1_1', 'won');
select is(tests.eo_queues(:'q1'), 'false/false/held', '4b: D1 closes as won: the open D2 keeps both queues blocked');
select tests.eo_dispute('evt_eo_q2_d2', 'charge.dispute.created', 1800000700, :'q2', 'dp_eo_q2_2', 'needs_response');
select tests.eo_dispute('evt_eo_q2_d1', 'charge.dispute.created', 1800000600, :'q2', 'dp_eo_q2_1', 'warning_needs_response');
select tests.eo_dispute('evt_eo_q2_d1c', 'charge.dispute.closed', 1800000800, :'q2', 'dp_eo_q2_1', 'warning_closed');
select is(tests.eo_queues(:'q2'), 'false/false/held', '4c: D1, an inquiry, closes as warning_closed: still blocked');
select tests.eo_dispute('evt_eo_q3_d2', 'charge.dispute.created', 1800000700, :'q3', 'dp_eo_q3_2', 'needs_response');
select tests.eo_dispute('evt_eo_q3_d1', 'charge.dispute.created', 1800000600, :'q3', 'dp_eo_q3_1', 'needs_response');
select tests.eo_dispute('evt_eo_q3_d1c', 'charge.dispute.closed', 1800000800, :'q3', 'dp_eo_q3_1', 'lost');
select is(tests.eo_queues(:'q3'), 'false/false/refunded', '4d: D1 closes as lost: refunded, and nothing is sent');
select is((select string_agg((p.chargeback_at is not null)::text, ',' order by p.id) from public.payments p where p.id in (:'q1', :'q2', :'q3')),
  'true,true,true', '4e: chargeback_at stays set on all three while D2 is open');

-- ---------------------------------------------------------------------------
-- 5. One dispute closed twice: the last closing status recorded wins, and after a lost nothing
--    leaves, in either order (refunded is never written back).
-- ---------------------------------------------------------------------------
select tests.eo_asked('EO lost then won') as r1 \gset
select tests.eo_dispute('evt_eo_r1_new', 'charge.dispute.created', 1800000600, :'r1', 'dp_eo_r1', 'needs_response');
select tests.eo_dispute('evt_eo_r1_lost', 'charge.dispute.closed', 1800000700, :'r1', 'dp_eo_r1', 'lost');
select is(tests.eo_queues(:'r1'), 'false/false/refunded', '5a: lost: refunded, both queues empty');
select tests.eo_dispute('evt_eo_r1_won', 'charge.dispute.closed', 1800000800, :'r1', 'dp_eo_r1', 'won');
select is(tests.eo_queues(:'r1'), 'false/false/refunded', '5b: a late won of the same dispute: still refunded, both queues empty');
select tests.eo_asked('EO won then lost') as r2 \gset
select tests.eo_dispute('evt_eo_r2_new', 'charge.dispute.created', 1800000600, :'r2', 'dp_eo_r2', 'needs_response');
select tests.eo_dispute('evt_eo_r2_won', 'charge.dispute.closed', 1800000700, :'r2', 'dp_eo_r2', 'won');
select is(tests.eo_queues(:'r2'), 'true/true/held', '5c (control): won: the money is free again');
select tests.eo_dispute('evt_eo_r2_lost', 'charge.dispute.closed', 1800000800, :'r2', 'dp_eo_r2', 'lost');
select is(tests.eo_queues(:'r2'), 'false/false/refunded', '5d: a late lost of the same dispute: refunded, both queues empty');

-- ---------------------------------------------------------------------------
-- 6. R3-A5: the 90-day prune empties the payloads; later events under new ids still meet the facts.
-- ---------------------------------------------------------------------------
update public.payment_events set received_at = now() - interval '100 days' where payment_id in (:'p1', :'p3');
-- The prune runs in its own statement: a check in the same statement would read the rows as they
-- were before it.
select public.prune_payment_event_payloads() as pruned \gset
select ok(:pruned >= 1
          and not exists (select 1 from public.payment_events e where e.payment_id in (:'p1', :'p3') and e.payload ? 'data'),
  '6a (control): the prune emptied every event of p1 and p3');
select tests.eo_dispute('evt_eo_d1_new_pruned', 'charge.dispute.created', 1800000200, :'p3', 'dp_eo_1', 'needs_response');
select tests.eo_dispute('evt_eo_d2_new_pruned', 'charge.dispute.created', 1800000400, :'p3', 'dp_eo_2', 'needs_response');
select is(tests.eo_dispute_state(:'p3'), 'dp_eo_2/false/null',
  '6b: late dispute.created events of the two disputes closed as won, under new ids after the prune: no block');
select tests.eo_refunded('evt_eo_r_part_pruned', 1800000100, :'p1', 1000);
select is(tests.eo_state(:'p1'), 'refunded/' || :'c1', '6c: an older partial charge.refunded after the prune: still refunded');

select * from finish();
rollback;
