-- 426_refund_failed.sql — pack 1, F2: a refund the provider reports as failed (refund.failed) is one
-- durable fact and a person, never a state the system repairs. Proves
-- 20261115000600_refund_failed_and_event_order.sql (payments.refund_failed_at, payment_refund_failures,
-- apply_payment_event, resolve_refund_failure, payment_attention) after Codex round 3: R3-A1, R3-A3,
-- R3-A4, R3-A5 (refunds) and R3-A7 (by design); after round 4: R4-A3 (G, the failed refunds join the
-- transfer reservation, payment_refund_reserved_cents) and P3 (refund_arranged_at: C3b, C7, F7).
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
select plan(53);

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
select is(tests.rf_state(:'pa'), 'refunded/' || :'ca' || '/re_rf_a2', 'A10: the owner''s replacement refund lands: refunded, its id recorded');
select coalesce(refund_failed_at::text, 'null') as rfa from public.payments where id = :'pa' \gset
select tests.rf_failed('evt_rf_a_fail_late', null, :'pa', 're_rf_a1', :ca);
select is(tests.rf_state(:'pa') || '/' || (select coalesce(refund_failed_at::text, 'null') from public.payments where id = :'pa'),
  'refunded/' || :'ca' || '/re_rf_a2/' || :'rfa',
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
select is(tests.rf_flag(:'pa') || '/' || tests.rf_state(:'pa'), 'false/refunded/' || :'ca' || '/re_rf_a2',
  'A18 (R3-A5): after the prune, the same refund''s failure under a new event id raises nothing again');

-- ---------------------------------------------------------------------------
-- B. The other order, on a refund the drain never recorded (its 2xx said failed, so it stopped).
-- ---------------------------------------------------------------------------
select tests.rf_job('RF failure first', 'held') as jb \gset
select tests.rf_pid(:'jb') as pb \gset
select tests.rf_cancel(:'jb');
select charge_amount_cents as cb from public.payments where id = :'pb' \gset
select public.settlement_send_begin(:'pb', 'refund', 0);
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
select is(tests.rf_state(:'pd') || '/' || tests.rf_lines(:'pd', 'refund re_rf_d1 failed at the provider%'), 'refunded/' || :'cd' || '/re_rf_d1/1',
  'D1: a hand refund (no metadata) fails: found by its payment_intent, listed, still refunded');
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
select ok(not exists (select 1 from public.transfers_due t where t.id = :'pg'),
  'G3: after resolve_refund_failure the arranged failure still holds the transfer back');

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
select public.settlement_send_begin(:'pl', 'refund', 0) as l_begun \gset
select public.record_settlement_sent(:'pl', 'refund', 're_rf_l1', :cl - 1000) as l_sent \gset
select tests.rf_failed('evt_rf_l_fail', 1800000100, :'pl', 're_rf_l1', :cl - 1000);
select is(tests.rf_state(:'pl') || '/' || tests.rf_flag(:'pl') || '/' || (select count(*)::text from public.transfers_due t where t.id = :'pl'),
  'held/0/re_rf_l1/true/1', 'G6: late-cancellation control: the own refund failed, the fee transfer is still due');
select tests.rf_try(format('select (public.resolve_refund_failure(%L, %L)).id::text', :'pl', 'Refunded by bank transfer.')) as l_res \gset
select ok(exists (select 1 from public.transfers_due t where t.id = :'pl'), 'G7: and after resolve_refund_failure too');

select * from finish();
rollback;
