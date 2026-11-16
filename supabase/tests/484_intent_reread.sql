-- 484_intent_reread.sql — money M2-2 (R-F; critic R-A "Intent cancel unknown", A4-04 for the intent's
-- facts): intent_reread. An answer that proves nothing is recorded with its first
-- time (record_intent_check) and the row goes to the back of the queue; after 1 day unproven the row
-- is listed (cancel_unconfirmed); an intent read back as canceled ends the row only through its fact
-- and the stamp; an intent read back as succeeded is the existing funded-after-void refund, whichever
-- of the read and the webhook arrives first. The drain's side is tests/intentCancel.test.mjs.
--
-- THE CAST: a customer, a worker, the runner (RLS bypassed; the drain's and the webhook's stand-in).
-- FIXTURE SURGERY, DECLARED (now() is fixed inside a transaction): payment_intent_checks.first_tried_at
-- and checked_at are moved back to make a row 2 or 25 hours old; payments.intent_cancel_at is moved
-- back 2 hours (the M1 arm's hour). Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(30);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('ir.customer@brazos.test', 'Iris Customer') as customer \gset
select tests.create_user('ir.worker@brazos.test',   'Ira Worker')   as worker   \gset
insert into fx values ('customer', :'customer'), ('worker', :'worker');

create or replace function tests.ir_try(p_sql text) returns text language plpgsql as $$
declare v_out text;
begin
  execute p_sql into v_out;
  return 'ok: ' || coalesce(v_out, 'null');
exception when others then
  return 'error: ' || sqlerrm;
end $$;

-- A fact as the drain stores it (the webhook's two steps): the payload is the drain's projection.
create or replace function tests.ir_fact(p_id text, p_type text, p_object jsonb) returns jsonb language plpgsql as $$
begin
  insert into public.payment_events (id, type, payload)
  values (p_id, p_type, jsonb_build_object('id', p_id, 'type', p_type, 'data', jsonb_build_object('object', p_object)))
  on conflict (id) do nothing;
  return public.apply_payment_event(p_id);
end $$;

create or replace function tests.ir_intent(p_pid uuid, p_status text, p_received integer) returns jsonb language sql as $$
  select jsonb_build_object('id', p.provider_ref, 'object', 'payment_intent', 'status', p_status,
                            'amount', p.charge_amount_cents, 'amount_received', p_received, 'currency', 'usd')
    from public.payments p where p.id = p_pid
$$;

-- A hire at $50, checkout begun (the intent attached as create-payment does), then the worker cancels:
-- a voided row with an intent that took nothing. Returns the payment id.
create or replace function tests.ir_voided(p_title text) returns uuid language plpgsql as $$
declare
  v_customer uuid := (select v from fx where k = 'customer');
  v_worker   uuid := (select v from fx where k = 'worker');
  v_job uuid;
  v_offer uuid;
  v_pid uuid;
begin
  perform tests.clear_auth();
  update public.rate_counters set hits = 0 where user_id in (v_customer, v_worker);
  perform tests.authenticate_as(v_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'Intent re-read probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000, p_address_line := '9 Proof Way'
  )).id into v_job;
  perform tests.authenticate_as(v_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Intent re-read bid');
  perform tests.authenticate_as(v_customer);
  perform public.accept_offer(v_offer);
  v_pid := (public.begin_job_payment(v_job)).id;
  perform tests.clear_auth();
  perform public.attach_provider_ref(v_pid, 'pi_ir_' || left(md5(v_pid::text), 12));
  perform tests.authenticate_as(v_worker);
  perform public.cancel_job(v_job, 'worker_cancelled');
  perform tests.clear_auth();
  return v_pid;
end $$;

create or replace function tests.ir_queued(p_pid uuid) returns boolean language sql as $$
  select exists (select 1 from public.intents_to_cancel q where q.id = p_pid)
$$;

-- The cancel_unconfirmed lines of a payment: code/ref/finish/since.
create or replace function tests.ir_lines(p_pid uuid) returns text language sql as $$
  select coalesce(string_agg(a.code || '/' || a.ref || '/' || a.finish || '/' || coalesce(a.since::text, 'no since'), ' | ' order by a.code),
                  '<none>')
    from public.payment_attention a where a.payment_id = p_pid and a.code = 'cancel_unconfirmed'
$$;

-- The drain's call (its right is A3's; the runner calls it here).
create or replace function tests.ir_check(p_pid uuid, p_answer text) returns text language sql as $$
  select tests.ir_try(format('select public.record_intent_check(%L, %L)::text', p_pid, p_answer))
$$;

-- ---------------------------------------------------------------------------
-- A. The table and the recorder: server only.
-- ---------------------------------------------------------------------------
select ok((select c.relrowsecurity from pg_class c where c.oid = 'public.payment_intent_checks'::regclass)
          and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_intent_checks'),
  'A1: payment_intent_checks has row security on and no policy');
select ok(not has_table_privilege('anon', 'public.payment_intent_checks', 'SELECT,INSERT,UPDATE')
          and not has_table_privilege('authenticated', 'public.payment_intent_checks', 'SELECT,INSERT,UPDATE')
          and not has_table_privilege('service_role', 'public.payment_intent_checks', 'SELECT,INSERT,UPDATE'),
  'A2: no client and no service_role right on it');
select ok(not has_function_privilege('anon', 'public.record_intent_check(uuid, text)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.record_intent_check(uuid, text)', 'EXECUTE')
          and has_function_privilege('service_role', 'public.record_intent_check(uuid, text)', 'EXECUTE'),
  'A3: record_intent_check: service_role only');
select is((select p.prosecdef::text || ' ' || array_to_string(p.proconfig, ',') from pg_proc p
            where p.oid = 'public.record_intent_check(uuid, text)'::regprocedure),
  'true search_path=public, pg_temp', 'A4: security definer, with its search_path');
select ok(not has_function_privilege('anon', 'public.payment_attention_more()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.payment_attention_more()', 'EXECUTE'),
  'A5: payment_attention_more stays server only');

-- ---------------------------------------------------------------------------
-- B. An answer that proves nothing.
-- ---------------------------------------------------------------------------
select tests.ir_voided('IR open') as p1 \gset
select ok(tests.ir_queued(:'p1'), 'B1 (control): the voided row is queued for its cancel');
select is(tests.ir_check(:'p1', 'cancel 400 probe; read 200 requires_payment_method received 0'), 'ok: true', 'B2: recorded');
select is((select (c.first_tried_at = now())::text || '/' || (c.checked_at = now())::text || '/' || c.answer
             from public.payment_intent_checks c where c.payment_id = :'p1'),
  'true/true/cancel 400 probe; read 200 requires_payment_method received 0', 'B3: the first time and the answer');
select is((select (intent_cancel_tried_at = now())::text || '/' || coalesce(intent_cancel_at::text, 'not stamped')
             from public.payments where id = :'p1'),
  'true/not stamped', 'B4: moved to the back of the queue (record_intent_cancel(id, false)), never stamped');
-- SURGERY: the first answer was 2 hours ago.
update public.payment_intent_checks set first_tried_at = now() - interval '2 hours', checked_at = now() - interval '2 hours'
 where payment_id = :'p1';
select is(tests.ir_check(:'p1', '  '), 'ok: true', 'B5: a second answer is recorded');
select is((select (c.first_tried_at = now() - interval '2 hours')::text || '/' || (c.checked_at = now())::text || '/' || c.answer
             from public.payment_intent_checks c where c.payment_id = :'p1'),
  'true/true/no answer', 'B6: the first time never moves; a blank answer reads "no answer"');

select tests.ir_voided('IR held control') as p9 \gset
update public.payments set held_at = now() where id = :'p9';  -- SURGERY: a row the queue does not offer.
select is(tests.ir_check(:'p9', 'cancel 500'), 'ok: false', 'B7: a row intents_to_cancel does not offer is refused');
select is((select count(*)::integer from public.payment_intent_checks where payment_id = :'p9'), 0, 'B8: and nothing is recorded for it');

-- ---------------------------------------------------------------------------
-- C. Unproven for 1 day: listed.
-- ---------------------------------------------------------------------------
select is(tests.ir_lines(:'p1'), '<none>', 'C1: 2 hours unproven: not listed');
-- SURGERY: the first unproven answer was 25 hours ago.
update public.payment_intent_checks set first_tried_at = now() - interval '25 hours' where payment_id = :'p1';
select is(tests.ir_lines(:'p1'),
  'cancel_unconfirmed/' || (select provider_ref from public.payments where id = :'p1') || '/developer/' || (now() - interval '1 hour')::text,
  'C2: 25 hours unproven: cancel_unconfirmed, the intent its ref, since the first answer + 1 day');
select is((select a.reason from public.payment_attention a where a.payment_id = :'p1' and a.code = 'cancel_unconfirmed'),
  'The app closed this payment because it had no record of money for it, but Stripe has not confirmed that the payment is closed. Money may still have been taken from the card. Ask your developer to check it in Stripe.',
  'C3: the sentence of the code, unchanged');
select ok((select a.detail from public.payment_attention a where a.payment_id = :'p1' and a.code = 'cancel_unconfirmed')
            like 'intent pi_ir_%: cancel not proven 1 day after the first answer (%); last answer %: no answer (payment_intent_checks)%',
  'C4: the detail names the first answer and the last one (then the row''s last_error, as every payment line)');

-- The intent read back as canceled: its fact, then the stamp. Both arms of the code stay empty.
select ok((tests.ir_fact('process-settlements:reread:' || (select provider_ref from public.payments where id = :'p1') || ':canceled:0',
                         'payment_intent.canceled', tests.ir_intent(:'p1', 'canceled', 0)) ->> 'payment_id') = :'p1',
  'C5: the canceled fact is applied to its payment');
select is(tests.ir_try(format('select public.record_intent_cancel(%L)::text', :'p1')), 'ok: true', 'C6: then the final stamp');
select ok(not tests.ir_queued(:'p1') and tests.ir_lines(:'p1') = '<none>', 'C7: the row left the queue and its 1-day line ended');
-- SURGERY: the stamp is 2 hours old, past the M1 arm's hour.
update public.payments set intent_cancel_at = now() - interval '2 hours' where id = :'p1';
select is(tests.ir_lines(:'p1'), '<none>', 'C8: a stamp with its canceled fact is never cancel_unconfirmed (the M1 arm)');

-- ---------------------------------------------------------------------------
-- D. The intent read back as succeeded (funded after the void), with the webhook in both orders (2c).
-- ---------------------------------------------------------------------------
select tests.ir_voided('IR read first') as p2 \gset
select is(tests.ir_check(:'p2', 'cancel 400 payment_intent_unexpected_state; read 503 probe'), 'ok: true', 'D1 (control): unproven once');
update public.payment_intent_checks set first_tried_at = now() - interval '25 hours' where payment_id = :'p2';  -- SURGERY
select tests.ir_fact('process-settlements:reread:' || (select provider_ref from public.payments where id = :'p2') || ':succeeded:'
                     || (select charge_amount_cents from public.payments where id = :'p2'),
                     'payment_intent.succeeded', tests.ir_intent(:'p2', 'succeeded', (select charge_amount_cents from public.payments where id = :'p2')));
select is((select status::text || '/' || refund_reason || '/' || (refund_cents = charge_amount_cents)::text || '/' || (received_cents = charge_amount_cents)::text
             from public.payments where id = :'p2'),
  'voided/funded_after_void/true/true', 'D2: the read fact: the whole charge goes back (the existing rule), the amount read recorded');
select ok(not tests.ir_queued(:'p2') and tests.ir_lines(:'p2') = '<none>'
          and exists (select 1 from public.refunds_due r where r.id = :'p2'),
  'D3: the row left the cancel queue, its line ended, and its refund is due');
create temp table ir_before as select refund_cents, received_cents, refund_reason, last_error from public.payments where id = :'p2';
-- The webhook's own event for the same charge, later.
select tests.ir_fact('evt_ir_late_' || :'p2', 'payment_intent.succeeded', tests.ir_intent(:'p2', 'succeeded', (select charge_amount_cents from public.payments where id = :'p2')));
select ok((select (p.refund_cents, p.received_cents, p.refund_reason, p.last_error) is not distinct from (b.refund_cents, b.received_cents, b.refund_reason, b.last_error)
             from public.payments p, ir_before b where p.id = :'p2')
          and (select count(*) from public.refunds_due r where r.id = :'p2') = 1,
  'D4: the webhook after the read changes nothing: one refund, of the same amount');

select tests.ir_voided('IR webhook first') as p3 \gset
select tests.ir_fact('evt_ir_first_' || :'p3', 'payment_intent.succeeded', tests.ir_intent(:'p3', 'succeeded', (select charge_amount_cents from public.payments where id = :'p3')));
select ok(not tests.ir_queued(:'p3'), 'D5: the webhook first: the row leaves the cancel queue, so the drain never reads it');
create temp table ir_before3 as select refund_cents, received_cents, refund_reason, last_error from public.payments where id = :'p3';
select tests.ir_fact('process-settlements:reread:' || (select provider_ref from public.payments where id = :'p3') || ':succeeded:'
                     || (select charge_amount_cents from public.payments where id = :'p3'),
                     'payment_intent.succeeded', tests.ir_intent(:'p3', 'succeeded', (select charge_amount_cents from public.payments where id = :'p3')));
select ok((select (p.refund_cents, p.received_cents, p.refund_reason, p.last_error) is not distinct from (b.refund_cents, b.received_cents, b.refund_reason, b.last_error)
             from public.payments p, ir_before3 b where p.id = :'p3')
          and (select count(*) from public.refunds_due r where r.id = :'p3') = 1,
  'D6: a read fact after the webhook (a race) changes nothing either');

select tests.ir_voided('IR other amount') as p4 \gset
select tests.ir_fact('process-settlements:reread:' || (select provider_ref from public.payments where id = :'p4') || ':succeeded:1000',
                     'payment_intent.succeeded', tests.ir_intent(:'p4', 'succeeded', 1000));
select ok((select received_cents = 1000 from public.payments where id = :'p4')
          and not exists (select 1 from public.refunds_due r where r.id = :'p4')
          and exists (select 1 from public.payment_attention a where a.payment_id = :'p4' and a.code = 'amount_differs'),
  'D7: a read of another amount is recorded as read: no refund is sent, and the row is listed amount_differs');

-- ---------------------------------------------------------------------------
-- Z. The view is whole.
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from public.payment_attention a
            where not exists (select 1 from public.payment_attention_codes() s where s.code = a.code)), 0,
  'Z1: every line has a code in the map');
select is((select count(*)::integer from (select what, code, ref from public.payment_attention
                                           group by what, code, ref having count(*) > 1) d), 0,
  'Z2: what, code and ref still name one line');

select * from finish();
rollback;
