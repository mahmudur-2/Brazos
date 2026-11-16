-- 487_event_order.sql — money M2, A5-11: the fields a re-read fact (the drain's intent re-read and
-- failed-refund facts) or a scanned event (the drain's event scan, Stripe's own event ids) can write,
-- each in both arrival orders. apply_payment_event (refund_failed_and_event_order) applies one event
-- id once; a re-read fact has an id of its own, so the webhook's event and the drain's fact for the
-- same Stripe object both reach the writer: the field rules below decide.
--
--   E1  charge.refunded, two hand refunds (300 then 500, and 500 then 300): refunded_cents and the
--       status, largest wins; refund_cents, first wins (a limit: shown only, the app sends nothing).
--   E2  transfer.reversed, two partial pictures (200, 500) in both orders: reversed_cents, largest wins.
--   E3  charge.dispute.created and .closed (won) in both orders.
--   E4  charge.dispute.created and .closed (lost) in both orders.
--   E5  payment_intent.succeeded from the webhook and from the drain's re-read, in both orders; and
--       two different received amounts (a limit: Stripe does not change amount_received after the
--       success; if it did, the first recorded wins and nothing is sent).
--   E6  refund.failed from the webhook and from the drain's own answer (one refund), in both orders.
--   E7  transfer.created and a full transfer.reversed in both orders: the late created never un-parks;
--       the side effects differ (a finding, pinned in E7c: created first, the "payment released" notice
--       and the two receipts stay sent after the reversal, and no one is told of the reversal).
--   E8  one event id applied twice: the second changes nothing.
--
-- HOW: each history runs inside a savepoint; the money state (the whole payments row, its transfers,
-- disputes and failed refunds, its owner's-list lines, whether a queue lists it, and the notice and
-- receipt outboxes) is kept in a psql variable, and the savepoint is rolled back before the other
-- order runs on the same payment. now() is fixed inside the transaction, so two equal histories give
-- equal timestamps (updated_at too: an older picture still writes updated_at = now(), no money state;
-- inside one transaction that cannot be seen, which is a limit of this file).
-- Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(18);

select tests.create_user('eo.c1@brazos.test', 'Eve Customer') as c1 \gset
select tests.create_user('eo.w1@brazos.test', 'Ed Worker')   as w1 \gset

-- ---------------------------------------------------------------------------
-- Helpers (as 482; created inside the transaction, gone at rollback).
-- ---------------------------------------------------------------------------
create or replace function tests.eo_hire(p_title text, p_customer uuid, p_worker uuid) returns uuid language plpgsql as $$
declare
  v_job uuid;
  v_offer uuid;
begin
  perform tests.clear_auth();
  -- SURGERY (B10, as 370): the limit on posts an hour is not what this file tests.
  update public.rate_counters set hits = 0 where user_id in (p_customer, p_worker);
  perform tests.authenticate_as(p_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'Event order probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000, p_address_line := '7 Order Way'
  )).id into v_job;
  perform tests.authenticate_as(p_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Order bid');
  perform tests.authenticate_as(p_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  return v_job;
end $$;

create or replace function tests.eo_release(p_job uuid) returns uuid language plpgsql as $$
declare
  v_pid uuid;
begin
  perform tests.authenticate_as((select assigned_worker_id from public.jobs where id = p_job));
  perform public.transition_job_status(p_job, 'in_progress');
  perform public.transition_job_status(p_job, 'completed', '["https://example.com/eo-done.jpg"]'::jsonb);
  perform tests.authenticate_as((select client_id from public.jobs where id = p_job));
  v_pid := (public.release_job_payment(p_job)).id;
  perform tests.clear_auth();
  return v_pid;
end $$;

-- One event, stored and applied as the webhook (and the drain) do; ok and already, as text.
create or replace function tests.eo_event(p_id text, p_type text, p_object jsonb) returns text language plpgsql as $$
declare
  v jsonb;
begin
  insert into public.payment_events (id, type, payload)
  values (p_id, p_type, jsonb_build_object('id', p_id, 'type', p_type, 'data', jsonb_build_object('object', p_object)))
  on conflict (id) do nothing;
  v := public.apply_payment_event(p_id);
  return (v ->> 'ok') || case when coalesce((v ->> 'already')::boolean, false) then '/already' else '' end;
end $$;

-- The money state of one payment, every column but those named in p_skip.
create or replace function tests.eo_state(p_pid uuid, p_skip text[] default '{}', p_outbox boolean default true) returns text language sql as $$
  select concat_ws(' | ',
    (select (to_jsonb(p) - p_skip)::text from public.payments p where p.id = p_pid),
    (select coalesce(jsonb_agg(to_jsonb(t) order by t.transfer_ref)::text, '[]') from public.payment_transfers t where t.payment_id = p_pid),
    (select coalesce(jsonb_agg(to_jsonb(d) order by d.dispute_ref)::text, '[]') from public.payment_disputes d where d.payment_id = p_pid),
    (select coalesce(jsonb_agg(to_jsonb(f) order by f.refund_ref)::text, '[]') from public.payment_refund_failures f where f.payment_id = p_pid),
    'lines=' || coalesce((select string_agg(a.code || '/' || coalesce(a.cents::text, 'null'), ',' order by a.code)
                           from public.payment_attention a where a.payment_id = p_pid), ''),
    'refunds_due=' || exists (select 1 from public.refunds_due r where r.id = p_pid)::text,
    'transfers_due=' || exists (select 1 from public.transfers_due r where r.id = p_pid)::text,
    case when p_outbox then 'notices=' || (select count(*) from public.notification_outbox)::text end,
    case when p_outbox then 'receipts=' || (select count(*) from public.receipt_outbox)::text end)
$$;

-- What the outboxes hold for this payment's two people, and its receipts (the side effects by name).
create or replace function tests.eo_sent(p_pid uuid) returns text language sql as $$
  select coalesce((select string_agg(n.type || ':' || case when n.recipient_id = p.payer_id then 'customer' else 'worker' end, ',' order by n.type, n.recipient_id = p.payer_id)
                     from public.notification_outbox n join public.payments p on p.id = p_pid
                    where n.recipient_id in (p.payer_id, p.payee_id) and n.data ->> 'jobId' = p.job_id::text), '')
      || ' :: ' || coalesce((select string_agg(r.role, ',' order by r.role) from public.receipt_outbox r where r.payment_id = p_pid), '')
$$;

create or replace function tests.eo_refunded(p_id text, p_pid uuid, p_total integer) returns text language sql as $$
  select tests.eo_event(p_id, 'charge.refunded', jsonb_build_object(
    'id', 'ch_eo_' || left(md5(p_pid::text), 10), 'object', 'charge',
    'payment_intent', (select provider_ref from public.payments where id = p_pid), 'amount_refunded', p_total))
$$;

create or replace function tests.eo_transfer(p_id text, p_type text, p_pid uuid, p_ref text, p_reversed integer, p_full boolean)
returns text language sql as $$
  select tests.eo_event(p_id, p_type, jsonb_build_object(
    'id', p_ref, 'object', 'transfer', 'amount', (select transfer_cents from public.payments where id = p_pid),
    'amount_reversed', p_reversed, 'reversed', p_full, 'metadata', jsonb_build_object('payment_id', p_pid)))
$$;

create or replace function tests.eo_dispute(p_id text, p_type text, p_pid uuid, p_ref text, p_status text) returns text language sql as $$
  select tests.eo_event(p_id, p_type, jsonb_build_object(
    'id', p_ref, 'object', 'dispute', 'status', p_status,
    'amount', (select charge_amount_cents from public.payments where id = p_pid),
    'payment_intent', (select provider_ref from public.payments where id = p_pid)))
$$;

-- ---------------------------------------------------------------------------
-- E1. Two hand refunds on a held charge, in both orders.
-- ---------------------------------------------------------------------------
select tests.test_fund_job(tests.eo_hire('EO-E1 refunds', :'c1', :'w1')) as e1 \gset
savepoint eo;
select tests.eo_refunded('evt_eo1_300', :'e1', 300), tests.eo_refunded('evt_eo1_500', :'e1', 500);
select tests.eo_state(:'e1', '{refund_cents}') as e1a, (select refund_cents from public.payments where id = :'e1') as e1a_rc \gset
rollback to savepoint eo;
select tests.eo_refunded('evt_eo1_500', :'e1', 500);
select tests.eo_state(:'e1') as e1b_mid \gset
select tests.eo_refunded('evt_eo1_300', :'e1', 300);
select tests.eo_state(:'e1', '{refund_cents}') as e1b, tests.eo_state(:'e1') as e1b_full,
       (select refund_cents from public.payments where id = :'e1') as e1b_rc \gset
rollback to savepoint eo;
select is(:'e1a'::text, :'e1b', 'E1a: both orders: one money state (refunded_cents 500, partially refunded, nothing queued) but for refund_cents');
select is(:'e1a_rc' || '/' || :'e1b_rc', '300/500', 'E1b: refund_cents, first wins (a limit: a hand refund''s amount is shown only; refunds_due needs refunded_cents 0)');
select is(:'e1b_full'::text, :'e1b_mid', 'E1c: the older picture (300) after the newer (500) changes nothing');

-- ---------------------------------------------------------------------------
-- E2. Two partial reversals of one transfer, in both orders.
-- ---------------------------------------------------------------------------
select tests.eo_hire('EO-E2 reversals', :'c1', :'w1') as e2j \gset
select tests.test_fund_job(:'e2j');
select tests.eo_release(:'e2j') as e2 \gset
select tests.eo_transfer('evt_eo2_tc', 'transfer.created', :'e2', 'tr_eo2', 0, false);
savepoint eo;
select tests.eo_transfer('evt_eo2_r200', 'transfer.reversed', :'e2', 'tr_eo2', 200, false),
       tests.eo_transfer('evt_eo2_r500', 'transfer.reversed', :'e2', 'tr_eo2', 500, false);
select tests.eo_state(:'e2') as e2a \gset
rollback to savepoint eo;
select tests.eo_transfer('evt_eo2_r500', 'transfer.reversed', :'e2', 'tr_eo2', 500, false);
select tests.eo_state(:'e2') as e2b_mid \gset
select tests.eo_transfer('evt_eo2_r200', 'transfer.reversed', :'e2', 'tr_eo2', 200, false);
select tests.eo_state(:'e2') as e2b, (select reversed_cents from public.payment_transfers where transfer_ref = 'tr_eo2') as e2b_rev \gset
rollback to savepoint eo;
select is(:'e2a'::text, :'e2b', 'E2a: both orders: one money state');
select is(:'e2b'::text, :'e2b_mid', 'E2b: the older picture (200) after the newer (500) changes nothing');
select is(:'e2b_rev'::text, '500', 'E2c: reversed_cents, largest wins');

-- ---------------------------------------------------------------------------
-- E3, E4. A card dispute opened and closed, the close first or last.
-- ---------------------------------------------------------------------------
select tests.test_fund_job(tests.eo_hire('EO-E3 won', :'c1', :'w1')) as e3 \gset
savepoint eo;
select tests.eo_dispute('evt_eo3_dp', 'charge.dispute.created', :'e3', 'dp_eo3', 'needs_response'),
       tests.eo_dispute('evt_eo3_cl', 'charge.dispute.closed', :'e3', 'dp_eo3', 'won');
select tests.eo_state(:'e3') as e3a \gset
rollback to savepoint eo;
select tests.eo_dispute('evt_eo3_cl', 'charge.dispute.closed', :'e3', 'dp_eo3', 'won'),
       tests.eo_dispute('evt_eo3_dp', 'charge.dispute.created', :'e3', 'dp_eo3', 'needs_response');
select tests.eo_state(:'e3') as e3b \gset
rollback to savepoint eo;
select is(:'e3a'::text, :'e3b', 'E3: won, in both orders: one money state (a created event never reopens a closed dispute)');

select tests.test_fund_job(tests.eo_hire('EO-E4 lost', :'c1', :'w1')) as e4 \gset
savepoint eo;
select tests.eo_dispute('evt_eo4_dp', 'charge.dispute.created', :'e4', 'dp_eo4', 'needs_response'),
       tests.eo_dispute('evt_eo4_cl', 'charge.dispute.closed', :'e4', 'dp_eo4', 'lost');
select tests.eo_state(:'e4') as e4a, (select status::text from public.payments where id = :'e4') as e4a_st \gset
rollback to savepoint eo;
select tests.eo_dispute('evt_eo4_cl', 'charge.dispute.closed', :'e4', 'dp_eo4', 'lost'),
       tests.eo_dispute('evt_eo4_dp', 'charge.dispute.created', :'e4', 'dp_eo4', 'needs_response');
select tests.eo_state(:'e4') as e4b \gset
rollback to savepoint eo;
select is(:'e4a'::text, :'e4b', 'E4a: lost, in both orders: one money state');
select is(:'e4a_st'::text, 'refunded', 'E4b: the lost dispute writes refunded');

-- ---------------------------------------------------------------------------
-- E5. The charge's success from the webhook and from the drain's re-read, in both orders.
-- ---------------------------------------------------------------------------
select tests.eo_hire('EO-E5 success', :'c1', :'w1') as e5j \gset
select tests.authenticate_as(:'c1');
select (public.begin_job_payment(:'e5j')).id as e5 \gset
select tests.clear_auth();
select public.attach_provider_ref(:'e5', 'pi_eo5');
select charge_amount_cents as e5c from public.payments where id = :'e5' \gset
savepoint eo;
select tests.eo_event('evt_eo5', 'payment_intent.succeeded', jsonb_build_object('id', 'pi_eo5', 'object', 'payment_intent', 'status', 'succeeded', 'amount_received', :e5c));
select tests.eo_state(:'e5') as e5a_mid \gset
select tests.eo_event('process-settlements:reread:pi_eo5:succeeded:' || :e5c, 'payment_intent.succeeded',
  jsonb_build_object('id', 'pi_eo5', 'object', 'payment_intent', 'status', 'succeeded', 'amount_received', :e5c));
select tests.eo_state(:'e5') as e5a \gset
rollback to savepoint eo;
savepoint eo;
select tests.eo_event('process-settlements:reread:pi_eo5:succeeded:' || :e5c, 'payment_intent.succeeded',
  jsonb_build_object('id', 'pi_eo5', 'object', 'payment_intent', 'status', 'succeeded', 'amount_received', :e5c)),
       tests.eo_event('evt_eo5', 'payment_intent.succeeded', jsonb_build_object('id', 'pi_eo5', 'object', 'payment_intent', 'status', 'succeeded', 'amount_received', :e5c));
select tests.eo_state(:'e5') as e5b \gset
rollback to savepoint eo;
-- THE LIMIT: two different received amounts for one intent (Stripe does not change amount_received
-- after the success). The first recorded wins; the second changes no money state.
select tests.eo_event('evt_eo5', 'payment_intent.succeeded', jsonb_build_object('id', 'pi_eo5', 'object', 'payment_intent', 'status', 'succeeded', 'amount_received', :e5c));
select tests.eo_event('process-settlements:reread:pi_eo5:succeeded:' || (:e5c - 1), 'payment_intent.succeeded',
  jsonb_build_object('id', 'pi_eo5', 'object', 'payment_intent', 'status', 'succeeded', 'amount_received', :e5c - 1));
select is(:'e5a'::text, :'e5b', 'E5a: the webhook''s event and the drain''s re-read, in both orders: one money state');
select is(:'e5a'::text, :'e5a_mid', 'E5b: the second picture of the same success changes nothing');
select is((select status::text || '/' || (received_cents = :e5c)::text || '/' || coalesce(refund_cents, 0)::text from public.payments where id = :'e5'),
  'held/true/0', 'E5c: a second, different received amount: the first recorded wins, and nothing is sent or refunded');

-- ---------------------------------------------------------------------------
-- E6. One failed refund, from the webhook and from the drain's own answer, in both orders.
-- ---------------------------------------------------------------------------
select tests.eo_hire('EO-E6 failed refund', :'c1', :'w1') as e6j \gset
select tests.test_fund_job(:'e6j') as e6 \gset
select tests.authenticate_as(:'w1');
select (public.cancel_job(:'e6j', 'worker_cancelled')).status;
select tests.clear_auth();
select refund_attempts as e6att, refund_cents as e6rc from public.payments where id = :'e6' \gset
select public.settlement_send_begin(:'e6', 'refund', :e6att, :e6rc), public.record_settlement_sent(:'e6', 'refund', 're_eo6', :e6rc);
\set e6obj '{"id": "re_eo6", "object": "refund", "status": "failed", "failure_reason": "expired_or_canceled_card"}'
select jsonb_build_object('amount', :e6rc, 'payment_intent', provider_ref, 'metadata', jsonb_build_object('payment_id', id)) || :'e6obj'::jsonb as e6o
  from public.payments where id = :'e6' \gset
savepoint eo;
select tests.eo_event('evt_eo6', 'refund.failed', :'e6o'::jsonb), tests.eo_event('process-settlements:re_eo6', 'refund.failed', :'e6o'::jsonb);
select tests.eo_state(:'e6') as e6a \gset
rollback to savepoint eo;
select tests.eo_event('process-settlements:re_eo6', 'refund.failed', :'e6o'::jsonb), tests.eo_event('evt_eo6', 'refund.failed', :'e6o'::jsonb);
select tests.eo_state(:'e6') as e6b, (select count(*) from public.payment_refund_failures where payment_id = :'e6') as e6n \gset
rollback to savepoint eo;
select is(:'e6a'::text, :'e6b', 'E6a: the webhook''s refund.failed and the drain''s, in both orders: one money state');
select is(:'e6n'::text, '1', 'E6b: one failure row per refund id, first wins');

-- ---------------------------------------------------------------------------
-- E7. A transfer and its full reversal, the reversal first or last.
-- ---------------------------------------------------------------------------
select tests.eo_hire('EO-E7 created reversed', :'c1', :'w1') as e7j \gset
select tests.test_fund_job(:'e7j');
select tests.eo_release(:'e7j') as e7 \gset
select transfer_cents as e7t, tests.eo_sent(:'e7') as e7s0 from public.payments where id = :'e7' \gset
savepoint eo;
select tests.eo_transfer('evt_eo7_tc', 'transfer.created', :'e7', 'tr_eo7', 0, false),
       tests.eo_transfer('evt_eo7_tr', 'transfer.reversed', :'e7', 'tr_eo7', :e7t, true);
select tests.eo_state(:'e7', '{}', false) as e7a, tests.eo_sent(:'e7') as e7sa \gset
rollback to savepoint eo;
select tests.eo_transfer('evt_eo7_tr', 'transfer.reversed', :'e7', 'tr_eo7', :e7t, true),
       tests.eo_transfer('evt_eo7_tc', 'transfer.created', :'e7', 'tr_eo7', 0, false);
select tests.eo_state(:'e7', '{}', false) as e7b, tests.eo_sent(:'e7') as e7sb, (select status::text || '/' || coalesce(transfer_ref, 'null') from public.payments where id = :'e7') as e7b_st \gset
rollback to savepoint eo;
select is(:'e7a'::text, :'e7b', 'E7a: created and fully reversed, in both orders: one money state');
select is(:'e7b_st'::text, 'held/null', 'E7b: a late transfer.created never un-parks a fully reversed transfer');
-- A FINDING, pinned (not changed here: no new rule at the doors). Created first, the worker is told
-- the payment is released and both receipts are queued, and the reversal after it tells no one;
-- reversed first, nothing is sent. The money state is the same.
select is('before: ' || :'e7s0' || ' | created first: ' || :'e7sa' || ' | reversed first: ' || :'e7sb',
  'before: bid_received:customer,job_assigned:worker,job_completed:customer :: '
  || ' | created first: bid_received:customer,job_assigned:worker,job_completed:customer,payment_released:worker :: customer,worker'
  || ' | reversed first: bid_received:customer,job_assigned:worker,job_completed:customer :: ',
  'E7c: the side effects differ by order: created first, the released notice and the two receipts stay sent after the reversal');

-- ---------------------------------------------------------------------------
-- E8. The same event id twice (the webhook's retry, the scan's read of it): applied once.
-- ---------------------------------------------------------------------------
select tests.test_fund_job(tests.eo_hire('EO-E8 twice', :'c1', :'w1')) as e8 \gset
select tests.eo_refunded('evt_eo8', :'e8', 400);
select tests.eo_state(:'e8') as e8a \gset
select is(tests.eo_event('evt_eo8', 'charge.refunded', '{}'::jsonb) || ' :: ' || tests.eo_state(:'e8'), 'true/already :: ' || :'e8a',
  'E8: a second apply of one id answers already and changes nothing (the stored payload is the first)');

select * from finish();
rollback;
