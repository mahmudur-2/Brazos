-- 499_refund_owed.sql — money M2, A9 item g: payment_refund_owed(payments), one answer to "is a
-- refund still owed". Every step reads three things together: the answer; whether the refund queue
-- (refunds_ready) holds the row; and the refund codes of the owner's list (payment_attention). The
-- answer is true when one of the other two holds the refund. Two known edges (A12-01) are tested as
-- limits: R7b (b) and R10 (a); there the answer is not what the customer is still owed.
--
--   R1  nothing asked: false.
--   R2  queued, not sent: true (in the queue).
--   R3  sent with no answer (a), then recorded as sent and not confirmed (b): true.
--   R4  refunded in full by Stripe: false.
--   R5  the reader's case (A10-05, P3), on the real late-cancellation path: charge 8,600, fee 1,600
--       transferred, refund 7,000. The app's refund fails, Stripe refunds 3,000, the rest goes back
--       another way, and the arrangement is recorded: false.
--   R6  a failure after the arrangement: true again.
--   R7  a hand refund failed and was arranged, and the refund asked was never recorded as sent: true,
--       as the list's refund_failed_before line says. KNOWN LIMIT (b): true also when the arrangement
--       paid everything, until a developer corrects the row.
--   R8  a card dispute. While it is open the refund waits for the bank: true. Lost (the payment is
--       refunded): false.
--   R9  the function: not security definer, stable, its search_path, no grant to service_role,
--       authenticated or anon.
--   R10 KNOWN LIMIT (a): a card dispute for part of the charge, lost before the refund asked was
--       sent: the payment is refunded, so false, although part of the refund asked can still be owed.
--       The owner's list says so (A12-01): refund_after_dispute_lost.
--   R11 that line word for word. R12 a hand refund of a part keeps it; the rest ends it (refunded
--       plus disputed reach the refund asked). R8b: a dispute for the whole charge never shows it.
--   T1-T5 (A13-01) a second dispute: only lost disputes count; one with no known result keeps the
--       line and its amount and makes the code refund_after_dispute_pending. T6 is R8b, R10-R12.
-- THE CAST: a customer and a worker; the runner is the webhook's, the drain's and the owner's
-- stand-in. No job has a date. Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(25);

select tests.create_user('ro.c1@brazos.test', 'Rue Customer') as c1 \gset
select tests.create_user('ro.w1@brazos.test', 'Roy Worker')   as w1 \gset

-- Hired at p_cents and funded. Returns the job id.
create or replace function tests.ro_job(p_title text, p_cents integer, p_customer uuid, p_worker uuid) returns uuid language plpgsql as $$
declare
  v_job uuid;
  v_offer uuid;
begin
  perform tests.clear_auth();
  -- SURGERY (B10, as 370): the limit on posts an hour is not what this file tests.
  update public.rate_counters set hits = 0 where user_id in (p_customer, p_worker);
  perform tests.authenticate_as(p_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'Refund owed probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := p_cents, p_budget_max_cents := p_cents, p_address_line := '9 Owed Road'
  )).id into v_job;
  perform tests.authenticate_as(p_worker);
  v_offer := public.create_offer(p_amount_cents := p_cents, p_job_id := v_job, p_message := 'Owed bid');
  perform tests.authenticate_as(p_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  perform tests.test_fund_job(v_job);
  return v_job;
end $$;

create or replace function tests.ro_pid(p_job uuid) returns uuid language sql as $$
  select id from public.payments where job_id = p_job and kind = 'job_payment' order by created_at desc limit 1
$$;

-- One stored provider event, applied (as 426).
create or replace function tests.ro_event(p_id text, p_type text, p_object jsonb) returns jsonb language plpgsql as $$
begin
  insert into public.payment_events (id, type, payload)
  values (p_id, p_type, jsonb_build_object('id', p_id, 'type', p_type, 'data', jsonb_build_object('object', p_object)))
  on conflict (id) do nothing;
  return public.apply_payment_event(p_id);
end $$;

-- charge.refunded: the charge's running refunded total p_total, newest refund p_refund.
create or replace function tests.ro_refunded(p_id text, p_pid uuid, p_total integer, p_refund text) returns jsonb language sql as $$
  select tests.ro_event(p_id, 'charge.refunded', jsonb_build_object(
    'id', 'ch_ro_' || left(md5(p_pid::text), 10), 'object', 'charge',
    'payment_intent', (select provider_ref from public.payments where id = p_pid),
    'amount_refunded', p_total,
    'refunds', jsonb_build_object('data', jsonb_build_array(jsonb_build_object('id', p_refund)))))
$$;

-- refund.failed. p_meta: the drain's metadata[payment_id] (a refund made by hand carries none).
create or replace function tests.ro_failed(p_id text, p_pid uuid, p_refund text, p_amount integer, p_meta boolean) returns jsonb language sql as $$
  select tests.ro_event(p_id, 'refund.failed', jsonb_build_object(
    'id', p_refund, 'object', 'refund', 'amount', p_amount,
    'charge', 'ch_ro_' || left(md5(p_pid::text), 10),
    'payment_intent', (select provider_ref from public.payments where id = p_pid),
    'status', 'failed', 'failure_reason', 'expired_or_canceled_card',
    'metadata', case when p_meta then jsonb_build_object('payment_id', p_pid) else '{}'::jsonb end))
$$;

-- charge.dispute.*: dispute p_dispute in status p_status, for the whole charge.
create or replace function tests.ro_dispute(p_id text, p_type text, p_pid uuid, p_dispute text, p_status text) returns jsonb language sql as $$
  select tests.ro_event(p_id, p_type, jsonb_build_object(
    'id', p_dispute, 'object', 'dispute', 'status', p_status,
    'amount', (select charge_amount_cents from public.payments where id = p_pid),
    'payment_intent', (select provider_ref from public.payments where id = p_pid)))
$$;

-- The answer / in the refund queue / the refund codes of the owner's list.
create or replace function tests.ro_says(p_pid uuid) returns text language sql as $$
  select public.payment_refund_owed(p)::text
         || '/' || exists (select 1 from public.refunds_ready r where r.id = p.id)::text
         || '/' || coalesce((select string_agg(a.code, ',' order by a.code) from public.payment_attention a
                              where a.payment_id = p.id and a.what = 'refund'), '<none>')
    from public.payments p where p.id = p_pid
$$;

-- ---------------------------------------------------------------------------
-- R1-R4. One payment from nothing asked to refunded in full.
-- ---------------------------------------------------------------------------
select tests.ro_job('RO-R1 lifecycle', 5000, :'c1', :'w1') as ja \gset
select tests.ro_pid(:'ja') as pa \gset
select is(tests.ro_says(:'pa'), 'false/false/<none>', 'R1: funded and nothing asked: no refund is owed');

select tests.authenticate_as(:'w1');
select public.cancel_job(:'ja', 'worker_cancelled');
select tests.clear_auth();
select is(tests.ro_says(:'pa'), 'true/true/<none>', 'R2: the worker cancels: the whole charge is queued, not sent: owed (in the queue)');

select public.settlement_send_begin(:'pa', 'refund', 0, (select refund_cents from public.payments where id = :'pa'));
select public.record_settlement_result(:'pa', 'refund', 0, 'same_key', 'refund: no answer (RO probe)');
select is(tests.ro_says(:'pa'), 'true/true/refund_retrying', 'R3a: sent with no answer (the same key next run): owed (the queue and the list)');

select charge_amount_cents as ca from public.payments where id = :'pa' \gset
select public.record_settlement_sent(:'pa', 'refund', 're_ro_r3', :ca);
select is(tests.ro_says(:'pa'), 'true/false/refund_unconfirmed', 'R3b: recorded as sent, Stripe has not confirmed it: owed');

select tests.ro_refunded('evt_ro_r4', :'pa', :ca, 're_ro_r3');
select is((select status::text from public.payments where id = :'pa') || '/' || tests.ro_says(:'pa'),
  'refunded/false/false/<none>', 'R4: Stripe refunded the whole charge: not owed');

-- ---------------------------------------------------------------------------
-- R5-R6. The reader's case on the real late-cancellation path.
-- ---------------------------------------------------------------------------
select tests.ro_job('RO-R5 late cancel', 8000, :'c1', :'w1') as jp \gset
select tests.ro_pid(:'jp') as pp \gset
select tests.authenticate_as(:'w1');
select public.transition_job_status(:'jp', 'in_progress');
select tests.authenticate_as(:'c1');
select public.cancel_job(:'jp', 'customer_cancelled');
select tests.clear_auth();
-- The fee goes to the worker.
select tests.ro_event('evt_ro_p3_tr', 'transfer.created', jsonb_build_object(
  'id', 'tr_ro_p3', 'object', 'transfer', 'amount', 1600, 'metadata', jsonb_build_object('payment_id', :'pp')));
-- The app's refund of 7,000 is sent and recorded, then fails.
select public.settlement_send_begin(:'pp', 'refund', 0, 7000);
select public.record_settlement_sent(:'pp', 'refund', 're_ro_p3_app', 7000);
select tests.ro_failed('evt_ro_p3_f1', :'pp', 're_ro_p3_app', 7000, true);
select is((select charge_amount_cents || '/' || transfer_cents || '/' || refund_cents || '/' || refund_ref
                  || '/' || (select count(*) from public.payment_transfers t where t.payment_id = :'pp')
             from public.payments where id = :'pp') || '/' || tests.ro_says(:'pp'),
  '8600/1600/7000/re_ro_p3_app/1/true/false/refund_failed',
  'R5a: charge 8,600, fee 1,600 transferred, the app''s 7,000 refund failed: owed until it is arranged');
-- Stripe refunds 3,000 (by hand); 4,000 goes back another way; the owner records it.
select tests.ro_refunded('evt_ro_p3_r1', :'pp', 3000, 're_ro_p3_hand');
select ((public.resolve_refund_failure(:'pp', 'Stripe refunded 30.00 by hand; 40.00 went back by bank transfer.')).id is not null)::text as p3_arranged \gset
select is(:'p3_arranged' || '/' || (select status::text || '/' || refunded_cents || '/' || refund_cents from public.payments where id = :'pp')
          || '/' || tests.ro_says(:'pp'),
  'true/partially_refunded/3000/7000/false/false/<none>',
  'R5b (A10-05, P3): 3,000 through Stripe, the rest arranged another way and recorded: not owed, though the refunded total stays below the refund asked');

select tests.ro_failed('evt_ro_p3_f2', :'pp', 're_ro_p3_hand2', 1000, false);
select is(tests.ro_says(:'pp'), 'true/false/refund_failed',
  'R6: a refund that fails after the arrangement is owed again (no exemption for an earlier refund_arranged_at)');

-- ---------------------------------------------------------------------------
-- R7. A hand refund failed and was arranged; the refund asked was never recorded as sent.
-- ---------------------------------------------------------------------------
select tests.ro_job('RO-R7 hand failure', 5000, :'c1', :'w1') as jh \gset
select tests.ro_pid(:'jh') as ph \gset
select tests.authenticate_as(:'w1');
select public.cancel_job(:'jh', 'worker_cancelled');
select tests.clear_auth();
select tests.ro_failed('evt_ro_h_f1', :'ph', 're_ro_h_hand', 2000, false);
select is(tests.ro_says(:'ph'), 'true/false/refund_failed,refund_failed_before',
  'R7a: a hand refund failed before the app sent the refund asked: owed, and nothing sends it by itself');
select ((public.resolve_refund_failure(:'ph', 'The 20.00 hand refund went back by bank transfer.')).id is not null)::text as h_arranged \gset
select is(:'h_arranged' || '/' || coalesce((select refund_ref from public.payments where id = :'ph'), 'null') || '/' || tests.ro_says(:'ph'),
  'true/null/true/false/refund_failed_before',
  'R7b: the failed hand refund is arranged, but the refund asked was never recorded as sent: still owed, as refund_failed_before says (KNOWN LIMIT (b), A12-01: also when the arrangement paid everything)');

-- ---------------------------------------------------------------------------
-- R8. A card dispute: refunds_due sends nothing while it holds the money; lost refunds the payment.
-- ---------------------------------------------------------------------------
select tests.ro_job('RO-R8 dispute', 5000, :'c1', :'w1') as jd \gset
select tests.ro_pid(:'jd') as pd \gset
select tests.authenticate_as(:'w1');
select public.cancel_job(:'jd', 'worker_cancelled');
select tests.clear_auth();
select tests.ro_dispute('evt_ro_d1', 'charge.dispute.created', :'pd', 'dp_ro_d', 'needs_response');
select is(tests.ro_says(:'pd'), 'true/false/refund_card_dispute',
  'R8a: an open card dispute: the refund waits for the bank, out of the queue: owed');
select tests.ro_dispute('evt_ro_d2', 'charge.dispute.closed', :'pd', 'dp_ro_d', 'lost');
select is((select status::text from public.payments where id = :'pd') || '/' || tests.ro_says(:'pd'),
  'refunded/false/false/<none>', 'R8b: the dispute is lost: the bank returned the charge, the payment is refunded: not owed (A12-01: a dispute for the whole charge, so no refund_after_dispute_lost line)');

-- ---------------------------------------------------------------------------
-- R9. The function.
-- ---------------------------------------------------------------------------
select is((select p.prosecdef::text || '/' || p.provolatile::text || '/' || array_to_string(p.proconfig, ';')
             || '/' || has_function_privilege('service_role', p.oid, 'execute')::text
             || '/' || has_function_privilege('authenticated', p.oid, 'execute')::text
             || '/' || has_function_privilege('anon', p.oid, 'execute')::text
             from pg_proc p where p.oid = 'public.payment_refund_owed(public.payments)'::regprocedure),
  'false/s/search_path=public, pg_temp/false/false/false',
  'R9: not security definer, stable, search_path public, pg_temp, no grant to service_role, authenticated or anon');

-- ---------------------------------------------------------------------------
-- R10. KNOWN LIMIT (a), A12-01: a card dispute for 1,000 of the charge, lost before the refund of the
-- whole charge was sent.
-- ---------------------------------------------------------------------------
select tests.ro_job('RO-R10 part dispute', 5000, :'c1', :'w1') as jq \gset
select tests.ro_pid(:'jq') as pq \gset
select charge_amount_cents as cq, provider_ref as iq from public.payments where id = :'pq' \gset
select tests.authenticate_as(:'w1');
select public.cancel_job(:'jq', 'worker_cancelled');
select tests.clear_auth();
select tests.ro_event('evt_ro_q1', 'charge.dispute.created', jsonb_build_object(
  'id', 'dp_ro_q', 'object', 'dispute', 'status', 'needs_response', 'amount', 1000, 'payment_intent', :'iq'));
select tests.ro_event('evt_ro_q2', 'charge.dispute.closed', jsonb_build_object(
  'id', 'dp_ro_q', 'object', 'dispute', 'status', 'lost', 'amount', 1000, 'payment_intent', :'iq'));
select is((select status::text || '/' || refund_cents || '/' || coalesce(refunded_cents, 0) || '/' || chargeback_cents
             from public.payments where id = :'pq') || '/' || tests.ro_says(:'pq'),
  'refunded/' || :cq || '/0/1000/false/false/refund_after_dispute_lost',
  'R10 (KNOWN LIMIT (a), A12-01): the bank returned 1,000 of the charge, the refund asked was never sent, and the payment is marked refunded: false, although the rest of the refund asked can still be owed; the owner''s list says so (refund_after_dispute_lost; was no line)');

-- R11 (A12-01): that line, word for word: since the dispute's close, overdue, the rest, the owner
-- finishes it in Stripe.
select is((select concat_ws(' | ', a.code, a.what, a.since = (select d.closed_at from public.payment_disputes d where d.dispute_ref = 'dp_ro_q'),
                            a.overdue, a.cents, a.finish, a.reason)
             from public.payment_attention a where a.payment_id = :'pq' and a.what = 'refund'),
  'refund_after_dispute_lost | refund | t | t | ' || (:cq - 1000)::text || ' | stripe | The customer won a card dispute with their bank for part of this charge, and the refund the app asked for had not fully gone through. The app no longer sends that refund. Check in Stripe what the customer got back, and refund only the rest by hand there.',
  'R11: since the lost dispute''s close, overdue, the refund asked less the disputed 1,000, finished in Stripe, its sentence');

-- R12 (A12-01): the owner refunds by hand in Stripe: a part first (the line stays), then the rest
-- (refunded plus disputed reach the refund asked: the line ends).
select tests.ro_refunded('evt_ro_q3', :'pq', 2000, 're_ro_q_hand1');
select is(coalesce((select a.code || '/' || a.cents from public.payment_attention a where a.payment_id = :'pq' and a.what = 'refund'), '<none>'),
  'refund_after_dispute_lost/' || (:cq - 3000)::text, 'R12a: 2,000 refunded by hand: the line stays, with the rest less the 2,000');
select tests.ro_refunded('evt_ro_q4', :'pq', :cq - 1000, 're_ro_q_hand2');
select is((select status::text || '/' || refunded_cents || '/' || chargeback_cents from public.payments where id = :'pq') || '/' || tests.ro_says(:'pq'),
  'refunded/' || (:cq - 1000)::text || '/1000/false/false/<none>',
  'R12b: the rest refunded by hand: refunded plus disputed reach the refund asked, and the line ends');

-- ---------------------------------------------------------------------------
-- T1-T5 (A13-01): a second dispute of the charge. Only LOST disputes count against the refund asked;
-- one the bank has not decided, or whose result the app cannot tell, never ends the line or lowers its
-- amount: it makes the code refund_after_dispute_pending (finish bank). R below is the refund asked:
-- the whole charge of a worker-cancelled job.
-- ---------------------------------------------------------------------------
-- charge.dispute.*: dispute p_dispute in status p_status, for p_amount of the charge.
create or replace function tests.ro_dispute_part(p_id text, p_type text, p_pid uuid, p_dispute text, p_status text, p_amount integer) returns jsonb language sql as $$
  select tests.ro_event(p_id, p_type, jsonb_build_object(
    'id', p_dispute, 'object', 'dispute', 'status', p_status, 'amount', p_amount,
    'payment_intent', (select provider_ref from public.payments where id = p_pid)))
$$;
-- The refund lines: code / cents / since = the first lost dispute's close / overdue / finish / detail.
create or replace function tests.ro_line(p_pid uuid) returns text language sql as $$
  select coalesce(string_agg(a.code || '/' || a.cents::text
                    || '/' || (a.since = (select min(d.closed_at) from public.payment_disputes d where d.payment_id = p_pid and d.status = 'lost'))::text
                    || '/' || a.overdue::text || '/' || a.finish || '/' || split_part(a.detail, ' | ', 1), ' ++ ' order by a.code), '<none>')
    from public.payment_attention a where a.payment_id = p_pid and a.what = 'refund'
$$;
-- A worker-cancelled job (the whole charge asked back, never sent), then a dispute for 1,000 lost.
create or replace function tests.ro_lost_part(p_title text, p_tag text, p_customer uuid, p_worker uuid) returns uuid language plpgsql as $$
declare
  v_job uuid := tests.ro_job(p_title, 5000, p_customer, p_worker);
  v_pid uuid := tests.ro_pid(v_job);
begin
  perform tests.authenticate_as(p_worker);
  perform public.cancel_job(v_job, 'worker_cancelled');
  perform tests.clear_auth();
  perform tests.ro_dispute_part('evt_ro_' || p_tag || '_a1', 'charge.dispute.created', v_pid, 'dp_ro_' || p_tag || '_a', 'needs_response', 1000);
  perform tests.ro_dispute_part('evt_ro_' || p_tag || '_a2', 'charge.dispute.closed', v_pid, 'dp_ro_' || p_tag || '_a', 'lost', 1000);
  return v_pid;
end $$;

-- T1. The reader's history: a dispute of 1,000 lost; then a second dispute for the rest opens.
select tests.ro_lost_part('RO-T1 second dispute', 't1', :'c1', :'w1') as pt \gset
select refund_cents as rt from public.payments where id = :'pt' \gset
select is(tests.ro_line(:'pt'),
  'refund_after_dispute_lost/' || (:rt - 1000)::text || '/true/true/stripe/refund asked ' || :rt || ', refunded in Stripe 0, card disputes lost 1000: the payment is refunded and the app sends nothing more; refund the rest by hand in Stripe after checking what the customer got back',
  'T1a: a dispute of 1,000 lost: the first code, R less 1,000, its detail');
select tests.ro_dispute_part('evt_ro_t1_b1', 'charge.dispute.created', :'pt', 'dp_ro_t1_b', 'needs_response', :rt - 1000);
select is(tests.ro_line(:'pt'),
  'refund_after_dispute_pending/' || (:rt - 1000)::text || '/true/true/bank/refund asked ' || :rt || ', refunded in Stripe 0, card disputes lost 1000, other card disputes with no known result ' || (:rt - 1000)::text || ': the payment is refunded and the app sends nothing more; wait for the bank before any refund by hand',
  'T1b: a second dispute for the rest opens: the line STAYS, the pending code, the same amount and since, the detail names 1,000 lost and the rest with no known result (was: no line)');
select is((select a.reason from public.payment_attention a where a.payment_id = :'pt' and a.what = 'refund'),
  'The customer won a card dispute with their bank for part of this charge, and the refund the app asked for had not fully gone through. The app no longer sends that refund. The bank has not decided another dispute for this charge, or the app cannot tell its result. Do not refund by hand yet. Answer the open dispute in Stripe and wait for the bank. If Stripe shows no open dispute, ask your developer.',
  'T1c: the pending code''s sentence, word for word');

-- T2. From T1, the second dispute closes won: the first code again, the same amount.
select tests.ro_dispute_part('evt_ro_t1_b2', 'charge.dispute.closed', :'pt', 'dp_ro_t1_b', 'won', :rt - 1000);
select is(split_part(tests.ro_line(:'pt'), '/', 1) || '/' || split_part(tests.ro_line(:'pt'), '/', 2),
  'refund_after_dispute_lost/' || (:rt - 1000)::text, 'T2: the second dispute won: the first code again, R less 1,000');

-- T3. From T1, the second dispute closes lost: the customer has the whole refund back: no line.
select tests.ro_lost_part('RO-T3 second lost', 't3', :'c1', :'w1') as pu \gset
select tests.ro_dispute_part('evt_ro_t3_b1', 'charge.dispute.created', :'pu', 'dp_ro_t3_b', 'needs_response', :rt - 1000);
select tests.ro_dispute_part('evt_ro_t3_b2', 'charge.dispute.closed', :'pu', 'dp_ro_t3_b', 'lost', :rt - 1000);
select is(tests.ro_line(:'pu') || '/' || tests.ro_says(:'pu'), '<none>/false/false/<none>',
  'T3: the second dispute lost too: the lost disputes reach the refund asked: no line');

-- T4. The wording history: a second open dispute of 2,000: the pending code, R less 1,000 (not less
-- 3,000); it closes lost: the first code, R less 3,000.
select tests.ro_lost_part('RO-T4 second 2000', 't4', :'c1', :'w1') as pv \gset
select tests.ro_dispute_part('evt_ro_t4_b1', 'charge.dispute.created', :'pv', 'dp_ro_t4_b', 'needs_response', 2000);
select is(split_part(tests.ro_line(:'pv'), '/', 1) || '/' || split_part(tests.ro_line(:'pv'), '/', 2),
  'refund_after_dispute_pending/' || (:rt - 1000)::text, 'T4a: a second open dispute of 2,000: the pending code, R less 1,000 (was: R less 3,000)');
select tests.ro_dispute_part('evt_ro_t4_b2', 'charge.dispute.closed', :'pv', 'dp_ro_t4_b', 'lost', 2000);
select is(split_part(tests.ro_line(:'pv'), '/', 1) || '/' || split_part(tests.ro_line(:'pv'), '/', 2),
  'refund_after_dispute_lost/' || (:rt - 3000)::text, 'T4b: it closes lost: the first code, R less 3,000');

-- T5. A second dispute closed with a status that is none of won, lost or a warning (the trunk's
-- unclear shape, as 482 T13): the pending code.
select tests.ro_lost_part('RO-T5 second unclear', 't5', :'c1', :'w1') as pw \gset
select tests.ro_dispute_part('evt_ro_t5_b1', 'charge.dispute.created', :'pw', 'dp_ro_t5_b', 'needs_response', 2000);
select tests.ro_dispute_part('evt_ro_t5_b2', 'charge.dispute.closed', :'pw', 'dp_ro_t5_b', 'under_review', 2000);
select is(split_part(tests.ro_line(:'pw'), '/', 1) || '/' || split_part(tests.ro_line(:'pw'), '/', 2)
          || '/' || (select d.status || ':' || (d.closed_at is not null)::text from public.payment_disputes d where d.dispute_ref = 'dp_ro_t5_b'),
  'refund_after_dispute_pending/' || (:rt - 1000)::text || '/under_review:true', 'T5: a second dispute closed with no known result: the pending code, R less 1,000');

select * from finish();
rollback;
