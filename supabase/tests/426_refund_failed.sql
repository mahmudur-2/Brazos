-- 426_refund_failed.sql — pack 1, F2: a refund the provider reports as failed (refund.failed) is one
-- durable fact and a person, never a state the system repairs. Proves
-- 20261115000600_refund_failed_and_event_order.sql (payments.refund_failed_at, payment_refund_failures,
-- apply_payment_event, resolve_refund_failure, payment_attention) after Codex round 3: R3-A1, R3-A3,
-- R3-A4, R3-A5 (refunds) and R3-A7 (by design); after round 4: R4-A3 (G, the failed refunds join the
-- transfer reservation, payment_refund_reserved_cents) and P3 (refund_arranged_at: C3b, C7, F7); after
-- round 5: R5-A3 (H, refund_ref only for the app's begun attempt, and no refund sent by itself on a
-- row with a refund failure; J) and R5-A4 (I, the customer's read of a voided row's failed refund);
-- after round 6: R6-A1 (H15-H18, refund_ref only for the app's own refund of the current attempt;
-- the "failed before" line says to look at the charge's refunds first) and R6-A2 (I3, I4, an open
-- failure is read before arranged history).
--
-- THE PROVIDER'S FACTS (docs.stripe.com/refunds, "Failed refunds"): the Refund's status becomes
-- failed with a failure_reason, refund.failed is sent, the money returns to the platform's balance,
-- and the platform must arrange another way to refund. The test events are built from the
-- documented objects (docs.stripe.com/api/refunds/object); the fields read are the Refund's id,
-- amount, payment_intent, failure_reason and metadata.payment_id, and the Charge's payment_intent,
-- amount_refunded and refunds.data[0].id. No event's created is read.
--
-- THE CAST: a customer, a worker with an enabled payout account, the runner (RLS bypassed; the
-- webhook's, the drain's and the owner's stand-in). Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(77);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('rf.customer@brazos.test', 'Rae Customer') as customer \gset
select tests.create_user('rf.worker@brazos.test',   'Rex Worker')   as worker   \gset
insert into fx values ('customer', :'customer'), ('worker', :'worker');

create or replace function tests.rf_try(p_sql text) returns text language plpgsql as $$
declare v_out text;
begin
  execute p_sql into v_out;
  return 'ok: ' || coalesce(v_out, 'null');
exception when others then
  return 'error: ' || sqlerrm;
end $$;

-- One stored provider event, applied. p_created is the event's own time (unix seconds); null leaves
-- the key out, as a payload that carries none.
create or replace function tests.rf_event(p_id text, p_type text, p_created bigint, p_object jsonb) returns jsonb language plpgsql as $$
begin
  insert into public.payment_events (id, type, payload)
  values (p_id, p_type, jsonb_strip_nulls(jsonb_build_object('id', p_id, 'type', p_type, 'created', p_created))
                        || jsonb_build_object('data', jsonb_build_object('object', p_object)))
  on conflict (id) do nothing;
  return public.apply_payment_event(p_id);
end $$;

-- Hire at $50. p_stage: 'held' (funded), 'approved' (worked and approved, not yet transferred) or
-- 'released' (worked, approved, transferred). Returns the job id.
create or replace function tests.rf_job(p_title text, p_stage text) returns uuid language plpgsql as $$
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
    p_title := p_title, p_description := 'Refund failure probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000, p_address_line := '4 Proof Way'
  )).id into v_job;
  perform tests.authenticate_as(v_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Refund failure bid');
  perform tests.authenticate_as(v_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  v_pid := tests.test_fund_job(v_job);
  if p_stage in ('approved', 'released') then
    perform tests.authenticate_as(v_worker);
    perform public.transition_job_status(v_job, 'in_progress');
    perform public.transition_job_status(v_job, 'completed', '["https://example.com/rf-done.jpg"]'::jsonb);
    perform tests.authenticate_as(v_customer);
    perform public.release_job_payment(v_job);
    perform tests.clear_auth();
  end if;
  if p_stage = 'released' then
    perform tests.rf_event('evt_rf_tc_' || v_pid, 'transfer.created', 1800000000, jsonb_build_object(
      'id', 'tr_rf_' || left(md5(v_pid::text), 12), 'object', 'transfer',
      'amount', (select transfer_cents from public.payments where id = v_pid),
      'metadata', jsonb_build_object('payment_id', v_pid)));
  end if;
  return v_job;
end $$;

create or replace function tests.rf_pid(p_job uuid) returns uuid language sql as $$
  select id from public.payments where job_id = p_job and kind = 'job_payment' order by created_at desc limit 1
$$;

-- The worker cancels: the whole charge is queued back to the card.
create or replace function tests.rf_cancel(p_job uuid) returns void language plpgsql as $$
begin
  perform tests.authenticate_as((select v from fx where k = 'worker'));
  perform public.cancel_job(p_job, 'worker_cancelled');
  perform tests.clear_auth();
end $$;

-- charge.refunded: the charge's running refunded total p_total, newest refund p_refund.
create or replace function tests.rf_refunded(p_id text, p_created bigint, p_pid uuid, p_total integer, p_refund text) returns jsonb language sql as $$
  select tests.rf_event(p_id, 'charge.refunded', p_created, jsonb_build_object(
    'id', 'ch_rf_' || left(md5(p_pid::text), 10), 'object', 'charge',
    'payment_intent', (select provider_ref from public.payments where id = p_pid),
    'amount_refunded', p_total,
    'refunds', jsonb_build_object('data', jsonb_build_array(jsonb_build_object('id', p_refund)))))
$$;

-- refund.failed: the documented Refund object. p_meta: the drain's metadata[payment_id] (a refund
-- made by hand in the dashboard carries none).
create or replace function tests.rf_failed(p_id text, p_created bigint, p_pid uuid, p_refund text, p_amount integer, p_meta boolean default true) returns jsonb language sql as $$
  select tests.rf_event(p_id, 'refund.failed', p_created, jsonb_build_object(
    'id', p_refund, 'object', 'refund', 'amount', p_amount,
    'charge', 'ch_rf_' || left(md5(p_pid::text), 10),
    'payment_intent', (select provider_ref from public.payments where id = p_pid),
    'status', 'failed', 'failure_reason', 'expired_or_canceled_card',
    'metadata', case when p_meta then jsonb_build_object('payment_id', p_pid) else '{}'::jsonb end))
$$;

-- charge.dispute.*: dispute p_dispute in status p_status.
create or replace function tests.rf_dispute(p_id text, p_type text, p_pid uuid, p_dispute text, p_status text) returns jsonb language sql as $$
  select tests.rf_event(p_id, p_type, 1800000050, jsonb_build_object(
    'id', p_dispute, 'object', 'dispute', 'status', p_status,
    'amount', (select charge_amount_cents from public.payments where id = p_pid),
    'payment_intent', (select provider_ref from public.payments where id = p_pid)))
$$;

-- status / refunded total / refund id.
create or replace function tests.rf_state(p_pid uuid) returns text language sql as $$
  select status::text || '/' || coalesce(refunded_cents, 0)::text || '/' || coalesce(refund_ref, 'null')
    from public.payments where id = p_pid
$$;

create or replace function tests.rf_flag(p_pid uuid) returns text language sql as $$
  select (refund_failed_at is not null)::text from public.payments where id = p_pid
$$;

-- The failure rows of a payment, through rf_try so a missing table is a failed assertion.
create or replace function tests.rf_failures(p_pid uuid) returns text language sql as $$
  select tests.rf_try(format(
    $q$select string_agg(f.refund_ref || ':' || coalesce(f.amount_cents::text, 'null') || ':'
                         || coalesce(f.failure_reason, 'null') || ':'
                         || case when f.arranged_at is null then 'waiting' else 'arranged: ' || f.arranged_note end,
                         ', ' order by f.refund_ref)
         from public.payment_refund_failures f where f.payment_id = %L$q$, p_pid))
$$;

create or replace function tests.rf_lines(p_pid uuid, p_like text) returns integer language sql as $$
  select count(*)::integer from public.payment_attention a where a.payment_id = p_pid and a.reason like p_like
$$;

-- ---------------------------------------------------------------------------
-- A. A held payment refunded in full (the worker cancelled): charge.refunded, then refund.failed.
-- ---------------------------------------------------------------------------
select tests.rf_job('RF held', 'held') as ja \gset
select tests.rf_pid(:'ja') as pa \gset
select tests.rf_cancel(:'ja');
select charge_amount_cents as ca from public.payments where id = :'pa' \gset
select public.record_settlement_sent(:'pa', 'refund', 're_rf_a1', :ca);
select tests.rf_refunded('evt_rf_a_ref', 1800000010, :'pa', :ca, 're_rf_a1');
select is(tests.rf_state(:'pa'), 'refunded/' || :'ca' || '/re_rf_a1', 'A0 (control): the refund lands: refunded');
select coalesce(last_error, 'null') as lea from public.payments where id = :'pa' \gset

select tests.rf_failed('evt_rf_a_fail', 1800000100, :'pa', 're_rf_a1', :ca);
select is(tests.rf_state(:'pa'), 'refunded/' || :'ca' || '/re_rf_a1',
  'A1: refund.failed moves nothing: still refunded, the total and the refund id kept');
select is(tests.rf_flag(:'pa') || '/' || (select coalesce(last_error, 'null') from public.payments where id = :'pa'), 'true/' || :'lea',
  'A2: refund_failed_at shows the failure; last_error is not written');
select is(tests.rf_failures(:'pa'), 'ok: re_rf_a1:' || :'ca' || ':expired_or_canceled_card:waiting',
  'A3: one failure row, keyed by the refund id, with its amount and reason');
select ok(not exists (select 1 from public.refunds_due r where r.id = :'pa'), 'A4: nothing sends it again: the row is not in refunds_due');
select is(tests.rf_try(format('select public.settlement_send_reopen(%L, %L)::text', :'pa', 'refund')),
  'error: A refund is recorded for this payment; nothing to reopen', 'A5: and nothing reopens it');
select is(tests.rf_lines(:'pa', 'refund re_rf_a1 failed at the provider (expired_or_canceled_card): the money is back in the Stripe balance. Arrange the refund another way, then record it with resolve_refund_failure'),
  1, 'A6: payment_attention lists it once, with what to do');
select is(tests.rf_lines(:'pa', '%reopen%'), 0, 'A7: … and says nothing about a reopen');

select tests.authenticate_as(:'customer');
select is((select (s.refund_failed_at is not null)::text || '/' || s.status::text || '/' || coalesce(s.refund_ref, 'null')
             from public.job_payment_state(:'ja') s),
  'true/refunded/null', 'A8: the customer reads the failure (refund_failed_at) and still no server column');
select lives_ok(format('select refund_failed_at from public.payments where id = %L', :'pa'),
  'A9: refund_failed_at is a column the parties may select');
select tests.clear_auth();

-- R3-A1, R3-A3: the owner refunds by hand in Stripe; a late copy of the old failure erases nothing.
select tests.rf_refunded('evt_rf_a_ref_hand', 1800000200, :'pa', :ca, 're_rf_a2');
select is(tests.rf_state(:'pa'), 'refunded/' || :'ca' || '/re_rf_a1', 'A10: the owner''s replacement refund lands: refunded; the app''s own refund id is not written over (R5-A3)');
select coalesce(refund_failed_at::text, 'null') as rfa from public.payments where id = :'pa' \gset
select tests.rf_failed('evt_rf_a_fail_late', null, :'pa', 're_rf_a1', :ca);
select is(tests.rf_state(:'pa') || '/' || (select coalesce(refund_failed_at::text, 'null') from public.payments where id = :'pa'),
  'refunded/' || :'ca' || '/re_rf_a1/' || :'rfa',
  'A11 (R3-A1, R3-A3): a late copy of the old failure, under another event id and with no created, erases nothing');
select is(tests.rf_try(format('select count(*)::text from public.payment_refund_failures where payment_id = %L', :'pa')), 'ok: 1',
  'A12: … and adds no second failure');
select ok(not exists (select 1 from public.refunds_due r where r.id = :'pa'), 'A13: … and nothing is sent: no third refund');

-- The owner records the arrangement.
select is(tests.rf_try(format('select coalesce((public.resolve_refund_failure(%L, %L)).refund_failed_at::text, %L)',
                              :'pa', 'Refunded again by hand in Stripe (re_rf_a2).', 'cleared')),
  'ok: cleared', 'A14: resolve_refund_failure records the arrangement: refund_failed_at clears');
select is(tests.rf_failures(:'pa'), 'ok: re_rf_a1:' || :'ca' || ':expired_or_canceled_card:arranged: Refunded again by hand in Stripe (re_rf_a2).',
  'A15: the failure row keeps the arrangement and its note');
select is(tests.rf_lines(:'pa', 'refund % failed at the provider%'), 0, 'A16: … and payment_attention lists it no more');

-- R3-A5: the 90-day prune empties the payloads; the same refund's failure under a new event id is
-- still known.
update public.payment_events set received_at = now() - interval '100 days' where payment_id = :'pa';
select public.prune_payment_event_payloads() as pruned \gset
select ok(:pruned >= 1
          and not exists (select 1 from public.payment_events e where e.payment_id = :'pa' and e.payload ? 'data'),
  'A17 (control): the prune emptied every event of the payment');
select tests.rf_failed('evt_rf_a_fail_pruned', 1800000400, :'pa', 're_rf_a1', :ca);
select is(tests.rf_flag(:'pa') || '/' || tests.rf_state(:'pa'), 'false/refunded/' || :'ca' || '/re_rf_a1',
  'A18 (R3-A5): after the prune, the same refund''s failure under a new event id raises nothing again');

-- ---------------------------------------------------------------------------
-- B. The other order, on a refund the drain never recorded (its 2xx said failed, so it stopped).
-- ---------------------------------------------------------------------------
select tests.rf_job('RF failure first', 'held') as jb \gset
select tests.rf_pid(:'jb') as pb \gset
select tests.rf_cancel(:'jb');
select charge_amount_cents as cb from public.payments where id = :'pb' \gset
select public.settlement_send_begin(:'pb', 'refund', 0, (select refund_cents from public.payments where id = :'pb'));
select public.record_settlement_result(:'pb', 'refund', 0, 'stop', 'refund re_rf_b1 failed');
select tests.rf_failed('evt_rf_b_fail', 1800000100, :'pb', 're_rf_b1', :cb);
select is(tests.rf_state(:'pb') || '/' || tests.rf_flag(:'pb'), 'held/0/re_rf_b1/true',
  'B1: the failure arrives first: held, nothing counted, the failed refund''s id recorded');
select is(tests.rf_try(format('select public.settlement_send_reopen(%L, %L)::text', :'pb', 'refund')),
  'error: A refund is recorded for this payment; nothing to reopen', 'B2: a failed refund with no ref of its own cannot be reopened');
select ok(not exists (select 1 from public.refunds_due r where r.id = :'pb'), 'B3: … nor sent again');
select is(tests.rf_lines(:'pb', 'refund sent, not yet confirmed%') || '/' || tests.rf_lines(:'pb', 'refund re_rf_b1 failed at the provider%'),
  '0/1', 'B4: listed as failed, never as a refund on its way');
select tests.rf_refunded('evt_rf_b_ref', 1800000010, :'pb', :cb, 're_rf_b1');
select is(tests.rf_state(:'pb') || '/' || tests.rf_flag(:'pb'), 'refunded/' || :'cb' || '/re_rf_b1/true',
  'B5: its charge.refunded arrives after: the same end as the other order (A1, A2)');

-- ---------------------------------------------------------------------------
-- C. Several refund ids on one charge (the late-cancellation shape), and repeats after the record.
-- ---------------------------------------------------------------------------
select tests.rf_job('RF several', 'held') as jc \gset
select tests.rf_pid(:'jc') as pc \gset
select charge_amount_cents as cc from public.payments where id = :'pc' \gset
-- Fixture: the shape cancel_job writes for a late cancellation (20261115000500_money_notices.sql).
update public.payments
   set transfer_cents = 1000, refund_cents = :cc - 1000, release_reason = 'cancellation_fee',
       release_requested_at = now(), refund_reason = 'customer_cancelled_late'
 where id = :'pc';
select tests.rf_event('evt_rf_c_tc', 'transfer.created', 1800000005, jsonb_build_object(
  'id', 'tr_rf_c1', 'object', 'transfer', 'amount', 1000, 'metadata', jsonb_build_object('payment_id', :'pc')));
select public.record_settlement_sent(:'pc', 'refund', 're_rf_c1', :cc - 1000);
select tests.rf_refunded('evt_rf_c_ref', 1800000010, :'pc', :cc - 1000, 're_rf_c1');
select is(tests.rf_state(:'pc'), 'partially_refunded/' || (:cc - 1000) || '/re_rf_c1', 'C0 (control): the rest lands: partially_refunded');
select tests.rf_failed('evt_rf_c_fail1', 1800000100, :'pc', 're_rf_c1', :cc - 1000);
select tests.rf_failed('evt_rf_c_fail2', 1800000110, :'pc', 're_rf_c2', 500, false);
select is(tests.rf_state(:'pc') || '/' || (select (released_at is not null)::text from public.payments where id = :'pc'),
  'partially_refunded/' || (:cc - 1000) || '/re_rf_c1/true', 'C1: two refunds fail: the status, the total and the fee''s transfer stay');
select is(tests.rf_lines(:'pc', 'refund re_rf_c_ failed at the provider%'), 2, 'C2: one line per failed refund');
select is(tests.rf_try(format('select (public.resolve_refund_failure(%L, %L)).id::text', :'pc', 'Paid back by bank transfer.')),
  'ok: ' || :'pc', 'C3: one record covers every waiting failure of the payment');
select is((select (refund_arranged_at is not null)::text || '/' || (refund_failed_at is null)::text from public.payments where id = :'pc'),
  'true/true', 'C3b (P3): the record stamps refund_arranged_at in the update that clears refund_failed_at');
select is(tests.rf_failures(:'pc'), 'ok: re_rf_c1:' || (:cc - 1000) || ':expired_or_canceled_card:arranged: Paid back by bank transfer., '
                                 || 're_rf_c2:500:expired_or_canceled_card:arranged: Paid back by bank transfer.',
  'C4: … each with the note');
select tests.rf_failed('evt_rf_c_fail1_again', 1800000300, :'pc', 're_rf_c1', :cc - 1000);
select is(tests.rf_flag(:'pc'), 'false', 'C5: after the record, a repeat of a known refund''s failure raises nothing');
select tests.rf_failed('evt_rf_c_fail3', 1800000400, :'pc', 're_rf_c3', 250, false);
select is(tests.rf_flag(:'pc') || '/' || tests.rf_lines(:'pc', 'refund re_rf_c3 failed at the provider%'), 'true/1',
  'C6: another refund''s failure raises it again, listed once');
select is((select (refund_arranged_at is not null)::text from public.payments where id = :'pc'), 'true',
  'C7 (P3): the earlier arrangement''s stamp stays; the new failure wins on the customer''s card (lib/paymentRules.ts)');

-- ---------------------------------------------------------------------------
-- D. A released payment refunded by hand in the dashboard (no metadata); that refund fails.
-- ---------------------------------------------------------------------------
select tests.rf_job('RF released', 'released') as jd \gset
select tests.rf_pid(:'jd') as pd \gset
select charge_amount_cents as cd from public.payments where id = :'pd' \gset
select tests.rf_refunded('evt_rf_d_ref', 1800000010, :'pd', :cd, 're_rf_d1');
select count(*) from public.claim_receipt_batch(50);
select tests.rf_failed('evt_rf_d_fail', 1800000100, :'pd', 're_rf_d1', :cd, false);
select count(*) from public.claim_receipt_batch(50);
select is(tests.rf_state(:'pd') || '/' || tests.rf_lines(:'pd', 'refund re_rf_d1 failed at the provider%'), 'refunded/' || :'cd' || '/null/1',
  'D1: a hand refund (no metadata) fails: found by its payment_intent, listed, still refunded; no refund_ref, the app never sent one (R5-A3)');
select is((select string_agg(r.status, ',' order by r.role) from public.receipt_outbox r where r.payment_id = :'pd'), 'skipped,skipped',
  'D2 (R3-A7, by design): the status never goes back to released, so its receipts stay skipped with it');

-- ---------------------------------------------------------------------------
-- E. R3-A4: a refund fails while a card dispute is open; the dispute is then won.
-- ---------------------------------------------------------------------------
select tests.rf_job('RF disputed', 'held') as je \gset
select tests.rf_pid(:'je') as pe \gset
select tests.rf_cancel(:'je');
select charge_amount_cents as ce from public.payments where id = :'pe' \gset
select public.record_settlement_sent(:'pe', 'refund', 're_rf_e1', :ce);
select tests.rf_refunded('evt_rf_e_ref', 1800000010, :'pe', :ce, 're_rf_e1');
select tests.rf_dispute('evt_rf_e_dc', 'charge.dispute.created', :'pe', 'dp_rf_e1', 'needs_response');
select tests.rf_failed('evt_rf_e_fail', 1800000100, :'pe', 're_rf_e1', :ce);
select is(tests.rf_state(:'pe') || '/' || (select (chargeback_at is not null)::text from public.payments where id = :'pe') || '/' || tests.rf_flag(:'pe'),
  'refunded/' || :'ce' || '/re_rf_e1/true/true', 'E1: a failure during an open dispute: still refunded, still blocked, the failure shown');
select tests.rf_dispute('evt_rf_e_won', 'charge.dispute.closed', :'pe', 'dp_rf_e1', 'won');
select is(tests.rf_state(:'pe') || '/' || (select (chargeback_at is not null)::text from public.payments where id = :'pe') || '/' || tests.rf_flag(:'pe'),
  'refunded/' || :'ce' || '/re_rf_e1/false/true', 'E2 (R3-A4): the dispute is won: the block clears and the failure is still shown');
select is(tests.rf_lines(:'pe', 'refund re_rf_e1 failed at the provider%')
          + (select count(*)::integer from public.refunds_due r where r.id = :'pe')
          + (select count(*)::integer from public.transfers_due t where t.id = :'pe'), 1,
  'E3: … listed for a person, and neither queue sends anything');

-- ---------------------------------------------------------------------------
-- F. resolve_refund_failure refuses what it cannot record; who may call it; the two tables.
-- ---------------------------------------------------------------------------
select is(tests.rf_try(format('select (public.resolve_refund_failure(%L, %L)).id::text', :'pb', '  ')),
  'error: Say how the refund was arranged (p_note)', 'F1: a note is required');
select is(tests.rf_try(format('select (public.resolve_refund_failure(%L, %L)).id::text', :'pa', 'Again.')),
  'error: This payment has no failed refund waiting', 'F2: nothing waiting: refused');
select is(tests.rf_try(format('select (public.resolve_refund_failure(%L, %L)).id::text', gen_random_uuid(), 'Note.')),
  'error: Payment not found', 'F3: an unknown payment: refused');
select is(tests.rf_try($q$select (not has_function_privilege('anon', 'public.resolve_refund_failure(uuid, text)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.resolve_refund_failure(uuid, text)', 'EXECUTE')
          and has_function_privilege('service_role', 'public.resolve_refund_failure(uuid, text)', 'EXECUTE'))::text$q$),
  'ok: true', 'F4: resolve_refund_failure: service_role only');
select is(tests.rf_try($q$select p.prosecdef::text || ' ' || array_to_string(p.proconfig, ',') from pg_proc p
                           where p.oid = 'public.resolve_refund_failure(uuid, text)'::regprocedure$q$),
  'ok: true search_path=public, pg_temp', 'F5: security definer with the fixed search_path');
select is(tests.rf_try($q$select ((select bool_and(c.relrowsecurity) from pg_class c
                                    where c.oid in ('public.payment_refund_failures'::regclass, 'public.payment_disputes'::regclass))
          and not exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('payment_refund_failures', 'payment_disputes'))
          and not has_table_privilege('anon', 'public.payment_refund_failures', 'SELECT')
          and not has_table_privilege('authenticated', 'public.payment_refund_failures', 'SELECT')
          and not has_table_privilege('anon', 'public.payment_disputes', 'SELECT')
          and not has_table_privilege('authenticated', 'public.payment_disputes', 'SELECT')
          and has_table_privilege('service_role', 'public.payment_refund_failures', 'SELECT')
          and has_table_privilege('service_role', 'public.payment_disputes', 'SELECT')
          and not has_table_privilege('service_role', 'public.payment_refund_failures', 'INSERT, UPDATE, DELETE')
          and not has_table_privilege('service_role', 'public.payment_disputes', 'INSERT, UPDATE, DELETE'))::text$q$),
  'ok: true', 'F6: both tables: RLS on and no policy, read by service_role only, written only through the functions');
select is((select string_agg(p.proname, ',' order by p.proname) from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.prosrc ilike '%refund_arranged_at%'),
  'resolve_refund_failure', 'F7 (P3): no function but resolve_refund_failure names refund_arranged_at');

-- ---------------------------------------------------------------------------
-- G. Codex R4-A3: a failed refund whose charge.refunded never came still keeps its amount from the
--    worker. The reservation is the greatest of refunded_cents, refund_cents and the sum of the
--    payment's failures (arranged or not), never one added on top of another.
-- ---------------------------------------------------------------------------
select is(tests.rf_try($q$select (has_function_privilege('service_role', 'public.payment_refund_reserved_cents(public.payments)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.payment_refund_reserved_cents(public.payments)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.payment_refund_reserved_cents(public.payments)', 'EXECUTE'))::text
          || ' ' || (select array_to_string(p.proconfig, ',') from pg_proc p
                      where p.oid = 'public.payment_refund_reserved_cents(public.payments)'::regprocedure)$q$),
  'ok: true search_path=public, pg_temp', 'G0: payment_refund_reserved_cents: service_role only, the fixed search_path');
select tests.rf_job('RF approved, full failure', 'approved') as jg \gset
select tests.rf_pid(:'jg') as pg \gset
select charge_amount_cents as cg from public.payments where id = :'pg' \gset
select ok(exists (select 1 from public.transfers_due t where t.id = :'pg'), 'G1 (control): approved, nothing refunded: the transfer is due');
-- A refund made by hand in the dashboard (no metadata) fails; its charge.refunded never comes.
select tests.rf_failed('evt_rf_g_fail', 1800000100, :'pg', 're_rf_g1', :cg, false);
select is((select coalesce(refunded_cents, 0)::text || '/' || coalesce(refund_cents, 0)::text from public.payments where id = :'pg')
          || '/' || (select count(*)::text from public.transfers_due t where t.id = :'pg')
          || '/' || tests.rf_lines(:'pg', 'transfer is more than is left after refunds: a person decides'),
  '0/0/0/1', 'G2: only a full refund.failed, refund totals empty: no transfer is due, and payment_attention says why');
select tests.rf_try(format('select (public.resolve_refund_failure(%L, %L)).id::text', :'pg', 'Refunded by bank transfer.')) as g_res \gset
select is(left(:'g_res', 4) || (select (refund_failed_at is null)::text || '/' || (refund_arranged_at is not null)::text from public.payments where id = :'pg')
          || '/' || exists (select 1 from public.transfers_due t where t.id = :'pg')::text,
  'ok: true/true/false',
  'G3: resolve_refund_failure records the arrangement (refund_failed_at cleared, refund_arranged_at set), and the arranged failure still holds the transfer back');

select tests.rf_job('RF approved, partial failures', 'approved') as jh \gset
select tests.rf_pid(:'jh') as ph \gset
select (charge_amount_cents - transfer_cents) as room from public.payments where id = :'ph' \gset
select tests.rf_failed('evt_rf_h_fail1', 1800000100, :'ph', 're_rf_h1', :room, false);
select ok(exists (select 1 from public.transfers_due t where t.id = :'ph'),
  'G4: a partial failure that leaves exactly the transfer: still due');
select tests.rf_failed('evt_rf_h_fail2', 1800000110, :'ph', 're_rf_h2', 1, false);
select ok(not exists (select 1 from public.transfers_due t where t.id = :'ph'),
  'G5: a second refund id fails for one cent: the failures add up and the transfer is no longer due');

-- The late-cancellation control: the fee transfer (1,000) and the rest refunded; the rest's own refund
-- fails and its charge.refunded never comes. Its failure is inside refund_cents: the fee still goes.
select tests.rf_job('RF late cancel, refund failed', 'held') as jl \gset
select tests.rf_pid(:'jl') as pl \gset
select charge_amount_cents as cl from public.payments where id = :'pl' \gset
update public.payments
   set transfer_cents = 1000, refund_cents = :cl - 1000, release_reason = 'cancellation_fee',
       release_requested_at = now(), refund_reason = 'customer_cancelled_late'
 where id = :'pl';
select public.settlement_send_begin(:'pl', 'refund', 0, (select refund_cents from public.payments where id = :'pl')) as l_begun \gset
select public.record_settlement_sent(:'pl', 'refund', 're_rf_l1', :cl - 1000) as l_sent \gset
select tests.rf_failed('evt_rf_l_fail', 1800000100, :'pl', 're_rf_l1', :cl - 1000);
select is(tests.rf_state(:'pl') || '/' || tests.rf_flag(:'pl') || '/' || (select count(*)::text from public.transfers_due t where t.id = :'pl'),
  'held/0/re_rf_l1/true/1', 'G6: late-cancellation control: the own refund failed, the fee transfer is still due');
select tests.rf_try(format('select (public.resolve_refund_failure(%L, %L)).id::text', :'pl', 'Refunded by bank transfer.')) as l_res \gset
select is(left(:'l_res', 4) || (select (refund_failed_at is null)::text || '/' || (refund_arranged_at is not null)::text from public.payments where id = :'pl')
          || '/' || exists (select 1 from public.transfers_due t where t.id = :'pl')::text,
  'ok: true/true/true', 'G7: resolve_refund_failure records the arrangement, and the fee transfer is still due');

-- ---------------------------------------------------------------------------
-- H. Codex R5-A3, R6-A1: refund.failed writes refund_ref only for the app's own refund (its
--    metadata.payment_id) of the current attempt (that attempt began).
--    (i) The app's own refund, its answer lost, then failed: its id is kept, so it is never reopened
--        or sent again, whatever refund_cents holds.
--    (ii) A refund the app never sent (a hand refund) fails: refund_ref stays empty, and a refund any
--        writer queues later on that row is listed for a person, never sent by itself (refunds_due
--        sends nothing on a row with a refund failure: it may have been arranged another way), also
--        after the owner recorded the arrangement.
-- ---------------------------------------------------------------------------
-- Hire at $50 without funding. p_yesterday: yesterday's 9-12 arrival window (a no-show claim needs one).
create or replace function tests.rf_hire(p_title text, p_yesterday boolean) returns uuid language plpgsql as $$
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
    p_title := p_title, p_description := 'Refund failure probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000, p_address_line := '4 Proof Way',
    p_scheduled_date := case when p_yesterday then (now() at time zone 'America/New_York')::date - 1 end,
    p_arrival_start_hour := case when p_yesterday then 9::smallint end,
    p_arrival_end_hour := case when p_yesterday then 12::smallint end
  )).id into v_job;
  perform tests.authenticate_as(v_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Refund failure bid');
  perform tests.authenticate_as(v_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  return v_job;
end $$;

create or replace function tests.rf_reopen(p_pid uuid) returns text language sql as $$
  select tests.rf_try(format('select public.settlement_send_reopen(%L, %L)::text', p_pid, 'refund'))
$$;

-- The drain begins the current refund and its answer is lost.
create or replace function tests.rf_sent_lost(p_pid uuid) returns text language plpgsql as $$
declare v_begun boolean;
begin
  v_begun := public.settlement_send_begin(p_pid, 'refund', 0, (select refund_cents from public.payments where id = p_pid));
  return v_begun::text || '/' || public.record_settlement_result(p_pid, 'refund', 0, 'same_key', 'no answer: timeout')::text;
end $$;

-- The customer opens an issue and the owner decides it.
create or replace function tests.rf_decide(p_job uuid, p_side text) returns text language plpgsql as $$
begin
  perform tests.authenticate_as((select v from fx where k = 'customer'));
  perform public.open_job_dispute(p_job, 'other');
  perform tests.clear_auth();
  return tests.rf_try(format('select (public.resolve_job_dispute(%L, %L)).refund_cents::text', p_job, p_side));
end $$;

-- In refunds_due / its line for a person.
create or replace function tests.rf_later(p_pid uuid) returns text language sql as $$
  select exists (select 1 from public.refunds_due r where r.id = p_pid)::text || '/'
         || tests.rf_lines(p_pid, 'a refund on this charge failed before: look at the refunds on this charge in Stripe first (one that the app sent can be there), check how the failed one was arranged, refund only what is still owed by hand, then record_settlement_sent')
$$;

create or replace function tests.rf_arrange(p_pid uuid) returns text language sql as $$
  select left(tests.rf_try(format('select (public.resolve_refund_failure(%L, %L)).id::text', p_pid, 'Paid back 20.00 by bank transfer.')), 4)
$$;

-- (i) refund_cents > 0: the worker cancels; the drain's refund begins, its answer is lost; it fails.
select tests.rf_job('RF own lost', 'held') as jk1 \gset
select tests.rf_pid(:'jk1') as pk1 \gset
select tests.rf_cancel(:'jk1');
select tests.rf_sent_lost(:'pk1') as k1s \gset
select tests.rf_failed('evt_rf_k1_fail', 1800000100, :'pk1', 're_rf_k1_own', (select refund_cents from public.payments where id = :'pk1'));
select is(:'k1s' || '/' || tests.rf_state(:'pk1') || '/' || tests.rf_reopen(:'pk1'),
  'true/true/held/0/re_rf_k1_own/error: A refund is recorded for this payment; nothing to reopen',
  'H1 (i): the app''s own refund, its answer lost, fails: its id is kept and it cannot be reopened');
update public.payments set refund_sent_at = now() - interval '24 hours' where id = :'pk1';
select is(tests.rf_reopen(:'pk1') || '/' || exists (select 1 from public.refunds_due r where r.id = :'pk1')::text,
  'error: A refund is recorded for this payment; nothing to reopen/false',
  'H2 (i): nor 24 hours after its send began, and nothing sends it again');

-- (i) refund_cents 0: the refund landed, a second issue was decided for the worker, then it fails.
select tests.rf_job('RF own zero', 'approved') as jk2 \gset
select tests.rf_pid(:'jk2') as pk2 \gset
select charge_amount_cents as ck2 from public.payments where id = :'pk2' \gset
select tests.rf_decide(:'jk2', 'customer') as k2a \gset
select tests.rf_sent_lost(:'pk2') as k2s \gset
select tests.rf_refunded('evt_rf_k2_ref', 1800000050, :'pk2', :ck2, 're_rf_k2_own');
select tests.rf_decide(:'jk2', 'worker') as k2b \gset
select tests.rf_failed('evt_rf_k2_fail', 1800000100, :'pk2', 're_rf_k2_own', :ck2);
select is(:'k2b' || '/' || tests.rf_state(:'pk2') || '/' || tests.rf_reopen(:'pk2') || '/' || exists (select 1 from public.refunds_due r where r.id = :'pk2')::text,
  'ok: 0/refunded/' || :'ck2' || '/re_rf_k2_own/error: This payment never asked for a refund/false',
  'H3 (i): the same on a row whose refund_cents a later decision set to 0: the id is kept, nothing reopens or sends it');

-- (i) refund_cents null. SURGERY: no writer leaves a row whose refund began with refund_cents null.
select tests.rf_job('RF own null', 'held') as jk3 \gset
select tests.rf_pid(:'jk3') as pk3 \gset
select tests.rf_cancel(:'jk3');
select tests.rf_sent_lost(:'pk3') as k3s \gset
update public.payments set refund_cents = null where id = :'pk3';
select tests.rf_failed('evt_rf_k3_fail', 1800000100, :'pk3', 're_rf_k3_own', 1000);
select is(tests.rf_state(:'pk3') || '/' || tests.rf_reopen(:'pk3'), 'held/0/re_rf_k3_own/error: This payment never asked for a refund',
  'H4 (i): with refund_cents null the rule still reads the begun attempt: the id is kept');

-- (ii) cancel_job, on a row that asked for no refund (refund_cents null).
select tests.rf_job('RF hand then cancel', 'held') as jk4 \gset
select tests.rf_pid(:'jk4') as pk4 \gset
select tests.rf_failed('evt_rf_k4_fail', 1800000100, :'pk4', 're_rf_k4_hand', 2000, false);
select is(tests.rf_state(:'pk4') || '/' || coalesce((select refund_cents::text from public.payments where id = :'pk4'), 'null'),
  'held/0/null/null', 'H5 (ii): a hand refund the app never sent fails: refund_ref stays empty');
select tests.rf_cancel(:'jk4');
select is(tests.rf_later(:'pk4'), 'false/1', 'H6 (ii): the worker cancels: the full refund is not sent by itself; it is listed for a person');
select tests.rf_arrange(:'pk4') as k4r \gset
select is(:'k4r' || tests.rf_later(:'pk4') || '/' || tests.rf_lines(:'pk4', 'refund re_rf_k4_hand failed at the provider%'),
  'ok: false/1/0', 'H7 (ii): the owner records the arrangement: the failure line goes, the refund asked is still listed');

-- (ii) resolve_job_dispute, on a row a decision for the worker set to refund_cents 0; arranged first.
select tests.rf_job('RF zero hand', 'approved') as jk5 \gset
select tests.rf_pid(:'jk5') as pk5 \gset
select tests.rf_decide(:'jk5', 'worker') as k5a \gset
select tests.rf_failed('evt_rf_k5_fail', 1800000100, :'pk5', 're_rf_k5_hand', 2000, false);
select tests.rf_arrange(:'pk5') as k5r \gset
select tests.rf_decide(:'jk5', 'customer') as k5b \gset
select is(:'k5a' || '/' || :'k5r' || :'k5b' || '/' || coalesce((select refund_ref from public.payments where id = :'pk5'), 'null') || '/' || tests.rf_later(:'pk5'),
  'ok: 0/ok: ok: ' || (select charge_amount_cents::text from public.payments where id = :'pk5') || '/null/false/1',
  'H8 (ii): refund_cents 0, a hand refund failed and arranged, then a decision for the customer: listed, not sent');

-- (ii) the no-show trigger (job_disputes_refund_on_withdrawn); arranged first.
select tests.rf_hire('RF no-show', true) as jk6 \gset
select tests.test_fund_job(:'jk6') as pk6 \gset
select tests.authenticate_as(:'worker');
select public.mark_worker_arrival(:'jk6', 'arrived');
select (public.cancel_job(:'jk6', 'customer_no_show')).status as k6c \gset
select tests.clear_auth();
select tests.rf_failed('evt_rf_k6_fail', 1800000100, :'pk6', 're_rf_k6_hand', 2000, false);
select tests.rf_arrange(:'pk6') as k6r \gset
select id as dk6 from public.job_disputes where job_id = :'jk6' \gset
select tests.authenticate_as(:'worker');
select (public.withdraw_job_dispute(:'dk6')).status as k6w \gset
select tests.clear_auth();
select is(:'k6r' || :'k6w' || '/' || (select refund_reason || '/' || (refund_cents = charge_amount_cents)::text from public.payments where id = :'pk6')
          || '/' || tests.rf_later(:'pk6'),
  'ok: withdrawn/no_show_withdrawn/true/false/1',
  'H9 (ii): the no-show claim is withdrawn after a hand refund failed and was arranged: the full refund is listed, not sent');

-- (ii) funded_after_void: the row was voided before it was paid; a hand refund of the late charge
-- fails before the charge's payment_intent.succeeded is applied.
select tests.rf_hire('RF voided', false) as jk7 \gset
select tests.authenticate_as(:'customer');
select (public.begin_job_payment(:'jk7')).id as pk7 \gset
select tests.clear_auth();
select public.attach_provider_ref(:'pk7', 'pi_rf_k7');
select tests.rf_cancel(:'jk7');
select tests.rf_failed('evt_rf_k7_fail', 1800000100, :'pk7', 're_rf_k7_hand', (select charge_amount_cents from public.payments where id = :'pk7'), false);
select tests.rf_event('evt_rf_k7_paid', 'payment_intent.succeeded', 1800000200, jsonb_build_object(
  'id', 'pi_rf_k7', 'object', 'payment_intent', 'amount_received', (select charge_amount_cents from public.payments where id = :'pk7'),
  'metadata', jsonb_build_object('payment_id', :'pk7')));
select is((select status::text || '/' || refund_reason || '/' || coalesce(refund_ref, 'null') from public.payments where id = :'pk7') || '/' || tests.rf_later(:'pk7'),
  'voided/funded_after_void/null/false/1', 'H10 (ii): the late charge queues the full refund: listed, not sent');
select tests.rf_arrange(:'pk7') as k7r \gset
select is(:'k7r' || tests.rf_later(:'pk7'), 'ok: false/1', 'H11 (ii): and still listed after the arrangement');

-- (ii) resolve_tip: a tip whose hand refund failed is refunded by the owner's decision (not refused).
select tests.rf_job('RF tip', 'released') as jk8 \gset
select tests.authenticate_as(:'customer');
select (public.begin_tip_payment(:'jk8', 1000)).id as tk8 \gset
select tests.clear_auth();
select public.attach_provider_ref(:'tk8', 'pi_rf_k8_tip');
select tests.rf_event('evt_rf_k8_paid', 'payment_intent.succeeded', 1800000020, jsonb_build_object(
  'id', 'pi_rf_k8_tip', 'object', 'payment_intent', 'amount_received', (select charge_amount_cents from public.payments where id = :'tk8'),
  'metadata', jsonb_build_object('payment_id', :'tk8')));
select tests.rf_failed('evt_rf_k8_fail', 1800000100, :'tk8', 're_rf_k8_hand', (select charge_amount_cents from public.payments where id = :'tk8'), false);
select tests.rf_try(format('select (public.resolve_tip(%L, %L)).refund_cents::text', :'tk8', 'refund')) as k8t \gset
select is(:'k8t' || '/' || coalesce((select refund_ref from public.payments where id = :'tk8'), 'null') || '/' || tests.rf_later(:'tk8'),
  'ok: ' || (select charge_amount_cents::text from public.payments where id = :'tk8') || '/null/false/1',
  'H12 (ii): resolve_tip refunds a tip whose hand refund failed: the decision passes and the refund is listed, not sent');

-- The other side of the rule: the app's attempt 0 was refused (new_key), then a hand refund fails.
-- refund_ref stays empty because attempt 1 never began; written here, it would hide attempt 1 from
-- every queue and line once the failure is arranged.
select tests.rf_job('RF new key', 'held') as jk9 \gset
select tests.rf_pid(:'jk9') as pk9 \gset
select tests.rf_cancel(:'jk9');
select public.settlement_send_begin(:'pk9', 'refund', 0, (select refund_cents from public.payments where id = :'pk9')) as k9b \gset
select public.record_settlement_result(:'pk9', 'refund', 0, 'new_key', 'card_declined') as k9n \gset
select tests.rf_failed('evt_rf_k9_fail', 1800000100, :'pk9', 're_rf_k9_hand', 1000, false);
select is(tests.rf_state(:'pk9') || '/' || (select refund_sent_attempt::text || '/' || refund_attempts::text from public.payments where id = :'pk9')
          || '/' || tests.rf_later(:'pk9'),
  'held/0/null/0/1/false/1', 'H13: an older attempt began, not the current one: refund_ref stays empty and the current refund is listed for a person');
select tests.rf_arrange(:'pk9') as k9r \gset
select is(:'k9r' || tests.rf_later(:'pk9'), 'ok: false/1', 'H14: and still listed after the arrangement');

-- Codex R6-A1: the current attempt began and its answer was lost; then a smaller refund made by hand
-- (no metadata) fails. Written into refund_ref, it would hide the refund still owed from every queue
-- and line once arranged, and refuse the app's own refund id.
select tests.rf_job('RF own lost, hand fails', 'held') as jk10 \gset
select tests.rf_pid(:'jk10') as pk10 \gset
select tests.rf_cancel(:'jk10');
select tests.rf_sent_lost(:'pk10') as k10s \gset
select tests.rf_failed('evt_rf_k10_fail', 1800000100, :'pk10', 're_rf_k10_hand', 2000, false);
select is(:'k10s' || '/' || tests.rf_state(:'pk10') || '/' || tests.rf_later(:'pk10')
          || '/' || tests.rf_lines(:'pk10', 'refund re_rf_k10_hand failed at the provider%'),
  'true/true/held/0/null/false/1/1',
  'H15 (R6-A1): the app''s refund began, a smaller hand refund fails: refund_ref stays empty and the refund owed is listed for a person');
select tests.rf_arrange(:'pk10') as k10r \gset
select is(:'k10r' || coalesce((select refund_ref from public.payments where id = :'pk10'), 'null') || '/' || tests.rf_later(:'pk10'),
  'ok: null/false/1', 'H16 (R6-A1): the owner arranges only that failure: the refund owed is still listed and nothing sends it');
select tests.rf_try(format('select public.record_settlement_sent(%L, %L, %L, %s)::text', :'pk10', 'refund', 're_rf_k10_own',
                           (select refund_cents from public.payments where id = :'pk10'))) as k10o \gset
select is(:'k10o' || '/' || tests.rf_state(:'pk10') || '/' || tests.rf_lines(:'pk10', 'refund sent, not yet confirmed by charge.refunded')
          || '/' || tests.rf_later(:'pk10'),
  'ok: true/held/0/re_rf_k10_own/1/false/0', 'H17 (R6-A1): the app''s own refund id is then recorded, listed as sent and not yet confirmed');

-- R6-A1, the attempt condition beside the label: attempt 0 stopped, the owner reopened, a decision for
-- the worker set the refund to 0; then attempt 0's own refund (with metadata) fails late. Kept out of
-- refund_ref, the owner can still decide for the customer, and the refund owed is listed for a person.
select tests.rf_job('RF reopened, late own failure', 'approved') as jk11 \gset
select tests.rf_pid(:'jk11') as pk11 \gset
select charge_amount_cents as ck11 from public.payments where id = :'pk11' \gset
select tests.rf_decide(:'jk11', 'customer') as k11a \gset
select public.settlement_send_begin(:'pk11', 'refund', 0, (select refund_cents from public.payments where id = :'pk11')) as k11b \gset
select public.record_settlement_result(:'pk11', 'refund', 0, 'stop', 'refund: an answer that needs a person') as k11s \gset
select tests.rf_reopen(:'pk11') as k11o \gset
select tests.rf_decide(:'jk11', 'worker') as k11w \gset
select tests.rf_failed('evt_rf_k11_fail', 1800000100, :'pk11', 're_rf_k11_own0', :ck11);
select tests.rf_decide(:'jk11', 'customer') as k11c \gset
select is(:'k11a' || '/' || :'k11o' || '/' || :'k11w' || '/' || :'k11c' || '/'
          || coalesce((select refund_ref from public.payments where id = :'pk11'), 'null') || '/' || tests.rf_later(:'pk11'),
  'ok: ' || :ck11 || '/ok: true/ok: 0/ok: ' || :ck11 || '/null/false/1',
  'H18 (R6-A1): a late failure of an older attempt''s own refund leaves refund_ref empty: the owner can still decide for the customer, and it is listed');

-- ---------------------------------------------------------------------------
-- I. Codex R5-A4: a failed refund on a voided row reaches the customer. The read is
--    lib/payments.ts fetchJobRefundIssue, made as the customer under RLS and the column grant.
-- ---------------------------------------------------------------------------
select tests.rf_hire('RF voided, own refund', false) as ji \gset
select tests.authenticate_as(:'customer');
select (public.begin_job_payment(:'ji')).id as pi1 \gset
select tests.clear_auth();
select public.attach_provider_ref(:'pi1', 'pi_rf_i1');
select tests.rf_cancel(:'ji');
select tests.rf_event('evt_rf_i1_paid', 'payment_intent.succeeded', 1800000200, jsonb_build_object(
  'id', 'pi_rf_i1', 'object', 'payment_intent', 'amount_received', (select charge_amount_cents from public.payments where id = :'pi1'),
  'metadata', jsonb_build_object('payment_id', :'pi1')));
select public.settlement_send_begin(:'pi1', 'refund', 0, (select refund_cents from public.payments where id = :'pi1')) as i1b \gset
select public.record_settlement_sent(:'pi1', 'refund', 're_rf_i1', (select refund_cents from public.payments where id = :'pi1')) as i1s \gset
select tests.rf_failed('evt_rf_i1_fail', 1800000300, :'pi1', 're_rf_i1', (select refund_cents from public.payments where id = :'pi1'));
select tests.authenticate_as(:'customer');
select is((select count(*)::integer from public.payments p where p.job_id = :'ji' and p.kind = 'job_payment' and p.status not in ('failed', 'voided')),
  0, 'I0: the active-row read (fetchJobPayment) finds nothing: the row is voided');
select is((select p.status::text || '/' || (p.refund_failed_at is not null)::text || '/' || (p.refund_arranged_at is not null)::text
             from public.payments p
            where p.job_id = :'ji' and p.kind = 'job_payment' and p.status in ('failed', 'voided')
              and (p.refund_failed_at is not null or p.refund_arranged_at is not null)
            order by p.created_at desc limit 1),
  'voided/true/false', 'I1: the customer reads the failed refund of the voided row');
select tests.clear_auth();
select tests.rf_try(format('select (public.resolve_refund_failure(%L, %L)).id::text', :'pi1', 'Refunded by bank transfer.')) as i1r \gset
select tests.authenticate_as(:'customer');
select is((select p.status::text || '/' || (p.refund_failed_at is not null)::text || '/' || (p.refund_arranged_at is not null)::text
             from public.payments p
            where p.job_id = :'ji' and p.kind = 'job_payment' and p.status in ('failed', 'voided')
              and (p.refund_failed_at is not null or p.refund_arranged_at is not null)
            order by p.created_at desc limit 1),
  'voided/false/true', 'I2: after the owner records the arrangement, the customer reads that it was arranged');
select tests.clear_auth();

-- Codex R6-A2: two replaced tips of one job, both charged late, both refunds failed; the owner
-- arranged the newer one only. lib/payments.ts fetchJobRefundIssue orders refund_failed_at desc
-- nulls last, then created_at desc (tests/refundFailed.test.mjs pins it); read as the customer.
select tests.rf_job('RF two tips', 'released') as jt \gset
select tests.authenticate_as(:'customer');
select (public.begin_tip_payment(:'jt', 1000)).id as ta \gset
select tests.clear_auth();
select public.attach_provider_ref(:'ta', 'pi_rf_ta');
select tests.authenticate_as(:'customer');
select (public.begin_tip_payment(:'jt', 1500)).id as tb \gset
select tests.clear_auth();
select public.attach_provider_ref(:'tb', 'pi_rf_tb');
select tests.authenticate_as(:'customer');
select (public.begin_tip_payment(:'jt', 2000)).id as tc \gset
select tests.clear_auth();
-- SURGERY: one transaction has one now(); the first tip becomes the older row.
update public.payments set created_at = created_at - interval '1 hour' where id = :'ta';
select tests.rf_event('evt_rf_ta_paid', 'payment_intent.succeeded', 1800000200, jsonb_build_object(
  'id', 'pi_rf_ta', 'object', 'payment_intent', 'amount_received', (select charge_amount_cents from public.payments where id = :'ta'),
  'metadata', jsonb_build_object('payment_id', :'ta')));
select tests.rf_event('evt_rf_tb_paid', 'payment_intent.succeeded', 1800000200, jsonb_build_object(
  'id', 'pi_rf_tb', 'object', 'payment_intent', 'amount_received', (select charge_amount_cents from public.payments where id = :'tb'),
  'metadata', jsonb_build_object('payment_id', :'tb')));
select tests.rf_failed('evt_rf_ta_fail', 1800000300, :'ta', 're_rf_ta', (select refund_cents from public.payments where id = :'ta'));
select tests.rf_failed('evt_rf_tb_fail', 1800000300, :'tb', 're_rf_tb', (select refund_cents from public.payments where id = :'tb'));
select tests.rf_try(format('select (public.resolve_refund_failure(%L, %L)).id::text', :'tb', 'Refunded by bank transfer.')) as tbr \gset
select tests.authenticate_as(:'customer');
select is((select p.id::text || '/' || (p.refund_failed_at is not null)::text
             from public.payments p
            where p.job_id = :'jt' and p.kind = 'tip' and p.status in ('failed', 'voided')
              and (p.refund_failed_at is not null or p.refund_arranged_at is not null)
            order by p.refund_failed_at desc nulls last, p.created_at desc limit 1),
  :'ta' || '/true', 'I3 (R6-A2): the older tip whose refund failure is still open is read, not the newer arranged one');
select is((select p.id::text || '/' || (p.refund_arranged_at is not null)::text
             from public.payments p
            where p.job_id = :'jt' and p.kind = 'tip' and p.status in ('failed', 'voided')
              and (p.refund_failed_at is not null or p.refund_arranged_at is not null)
            order by p.created_at desc limit 1),
  :'tb' || '/true', 'I4 (R6-A2, control): newest first alone reads the arranged tip and hides the open failure');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- J. (ii) ban_user, last: it cancels every job of the banned worker in this file.
-- ---------------------------------------------------------------------------
select tests.create_user('rf.admin@brazos.test', 'Ada Admin') as admin \gset
update public.profiles set is_admin = true where id = :'admin';
select tests.rf_job('RF banned', 'held') as jj \gset
select tests.rf_pid(:'jj') as pj \gset
select tests.rf_failed('evt_rf_j_fail', 1800000100, :'pj', 're_rf_j_hand', 2000, false);
select tests.rf_arrange(:'pj') as jr \gset
select tests.authenticate_as(:'admin');
select public.ban_user(:'worker');
select tests.clear_auth();
select is(:'jr' || (select refund_reason || '/' || (refund_cents = charge_amount_cents)::text from public.payments where id = :'pj') || '/' || tests.rf_later(:'pj'),
  'ok: account_suspended/true/false/1',
  'J1 (ii): the admin bans the worker after a hand refund failed and was arranged: the full refund is listed, not sent');

select * from finish();
rollback;
