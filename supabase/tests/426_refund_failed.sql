-- 426_refund_failed.sql — pack 1, F2: a refund the provider reports as failed (refund.failed) is not
-- money that reached the customer. Proves 20261115000600_refund_failed_and_event_order.sql
-- (payments.refund_failed_at; apply_payment_event; settlement_send_reopen; payment_attention).
--
-- THE PROVIDER'S FACTS (docs.stripe.com/refunds, "Handle failed refunds"): the Refund's status
-- becomes failed with a failure_reason, refund.failed is sent, the money returns to the platform's
-- balance, and the platform must arrange another way to refund. The test events are built from the
-- documented objects; the fields read are the event's created, the Refund's id, amount,
-- payment_intent, failure_reason and metadata.payment_id, and the Charge's payment_intent,
-- amount_refunded and refunds.data[0].id.
--
-- THE CAST: a customer, a worker with an enabled payout account, the runner (RLS bypassed; the
-- webhook's, the drain's and the owner's stand-in). Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(30);

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

-- One stored provider event, applied. p_created is the event's own time (unix seconds).
create or replace function tests.rf_event(p_id text, p_type text, p_created bigint, p_object jsonb) returns jsonb language plpgsql as $$
begin
  insert into public.payment_events (id, type, payload)
  values (p_id, p_type, jsonb_build_object('id', p_id, 'type', p_type, 'created', p_created,
                                           'data', jsonb_build_object('object', p_object)))
  on conflict (id) do nothing;
  return public.apply_payment_event(p_id);
end $$;

-- Hire at $50. p_stage: 'held' (funded), 'released' (worked, approved, transferred) or 'unfunded'
-- (a checkout begun, its intent attached, nothing paid). Returns the job id.
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
  if p_stage = 'unfunded' then
    perform tests.authenticate_as(v_customer);
    v_pid := (public.begin_job_payment(v_job)).id;
    perform tests.clear_auth();
    perform public.attach_provider_ref(v_pid, 'pi_rf_' || left(md5(v_pid::text), 12));
    return v_job;
  end if;
  v_pid := tests.test_fund_job(v_job);
  if p_stage = 'released' then
    perform tests.authenticate_as(v_worker);
    perform public.transition_job_status(v_job, 'in_progress');
    perform public.transition_job_status(v_job, 'completed', '["https://example.com/rf-done.jpg"]'::jsonb);
    perform tests.authenticate_as(v_customer);
    perform public.release_job_payment(v_job);
    perform tests.clear_auth();
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

create or replace function tests.rf_state(p_pid uuid) returns text language sql as $$
  select status::text || '/' || coalesce(refunded_cents::text, 'null') from public.payments where id = p_pid
$$;

create or replace function tests.rf_lines(p_pid uuid, p_like text) returns integer language sql as $$
  select count(*)::integer from public.payment_attention a where a.payment_id = p_pid and a.reason like p_like
$$;

-- ---------------------------------------------------------------------------
-- A. A held payment refunded in full (the worker cancelled); the refund fails.
-- ---------------------------------------------------------------------------
select tests.rf_job('RF held', 'held') as ja \gset
select tests.rf_pid(:'ja') as pa \gset
select tests.authenticate_as(:'worker');
select public.cancel_job(:'ja', 'worker_cancelled');
select tests.clear_auth();
select charge_amount_cents as ca from public.payments where id = :'pa' \gset
select public.record_settlement_sent(:'pa', 'refund', 're_rf_a1', :ca);
select tests.rf_refunded('evt_rf_a_ref', 1800000010, :'pa', :ca, 're_rf_a1');
select is(tests.rf_state(:'pa'), 'refunded/' || :'ca', 'A0 (control): the refund lands: refunded');

select tests.rf_failed('evt_rf_a_fail', 1800000100, :'pa', 're_rf_a1', :ca);
select is(tests.rf_state(:'pa'), 'held/0', 'A1: refund.failed: nothing counts as refunded and the row is held again');
select is((select refund_failed_at from public.payments where id = :'pa'), to_timestamp(1800000100),
  'A2: refund_failed_at is the failure event''s own created time');
select is((select refund_ref || ' | ' || last_error from public.payments where id = :'pa'),
  're_rf_a1 | refund re_rf_a1 failed at the provider (expired_or_canceled_card); the money is back in the Stripe balance and a person must refund another way',
  'A3: the failed refund stays recorded and last_error names it');
select ok(not exists (select 1 from public.refunds_due r where r.id = :'pa'), 'A4: no automatic retry: the row is not in refunds_due');
select is(tests.rf_lines(:'pa', 'refund failed at the provider%'), 1, 'A5: payment_attention lists the failure once');
select is(tests.rf_lines(:'pa', 'refund sent, not yet confirmed%'), 0, 'A6: … and not as a refund still on its way');

select tests.rf_refunded('evt_rf_a_ref_old', 1800000050, :'pa', :ca, 're_rf_a1');
select is(tests.rf_state(:'pa'), 'held/0', 'A7: a charge.refunded created before the failure counts nothing');
select tests.rf_refunded('evt_rf_a_ref_same', 1800000100, :'pa', :ca, 're_rf_a1');
select is(tests.rf_state(:'pa'), 'held/0', 'A8: … nor one created in the same second as the failure');

select tests.authenticate_as(:'customer');
select is((select (s.refund_failed_at is not null)::text || '/' || s.status::text || '/' || coalesce(s.refund_ref, 'null')
             from public.job_payment_state(:'ja') s),
  'true/held/null', 'A9: the customer reads the failure (refund_failed_at) and still no server column');
select lives_ok(format('select refund_failed_at from public.payments where id = %L', :'pa'),
  'A10: refund_failed_at is a column the parties may select');
select tests.clear_auth();

-- The owner refunds by hand in the dashboard: a later charge.refunded counts.
select tests.rf_refunded('evt_rf_a_ref_hand', 1800000200, :'pa', :ca, 're_rf_a2');
select is(tests.rf_state(:'pa'), 'refunded/' || :'ca', 'A11: a charge.refunded created after the failure counts: refunded');
select is(tests.rf_lines(:'pa', 'refund failed at the provider%'), 0, 'A12: … and the failure leaves payment_attention');
select tests.rf_failed('evt_rf_a_fail_again', 1800000300, :'pa', 're_rf_a1', :ca);
select is(tests.rf_state(:'pa'), 'refunded/' || :'ca', 'A13: the same refund''s failure under another event id lowers nothing again');

-- ---------------------------------------------------------------------------
-- B. The owner reopens the failed refund: a new key, and the old charge.refunded stays old.
-- ---------------------------------------------------------------------------
select tests.rf_job('RF reopen', 'held') as jb \gset
select tests.rf_pid(:'jb') as pb \gset
select tests.authenticate_as(:'worker');
select public.cancel_job(:'jb', 'worker_cancelled');
select tests.clear_auth();
select charge_amount_cents as cb from public.payments where id = :'pb' \gset
select public.settlement_send_begin(:'pb', 'refund', 0);
select public.record_settlement_sent(:'pb', 'refund', 're_rf_b1', :cb);
select tests.rf_refunded('evt_rf_b_ref', 1800000010, :'pb', :cb, 're_rf_b1');
select tests.rf_failed('evt_rf_b_fail', 1800000100, :'pb', 're_rf_b1', :cb);
select is(tests.rf_try(format('select public.settlement_send_reopen(%L, %L)::text', :'pb', 'refund')), 'ok: true',
  'B1: settlement_send_reopen accepts a failed refund');
select is((select coalesce(refund_ref, 'null') || '/' || coalesce(refund_failed_at::text, 'null') || '/' || refund_attempts
             from public.payments where id = :'pb'), 'null/null/1', 'B2: the failure is cleared and the attempt is new (a new key)');
select ok(exists (select 1 from public.refunds_ready r where r.id = :'pb'), 'B3: the drain may send the new refund');
select is(tests.rf_lines(:'pb', 'refund failed at the provider%'), 0, 'B4: the failure is no longer listed');
select tests.rf_refunded('evt_rf_b_ref_replay', 1800000010, :'pb', :cb, 're_rf_b1');
select is(tests.rf_state(:'pb'), 'held/0', 'B5: a late copy of the old charge.refunded counts nothing after the reopen');
select ok(exists (select 1 from public.refunds_ready r where r.id = :'pb'), 'B6: … and the new refund is still ready');
select public.settlement_send_begin(:'pb', 'refund', 1);
select public.record_settlement_sent(:'pb', 'refund', 're_rf_b2', :cb);
select tests.rf_refunded('evt_rf_b_ref_new', 1800000500, :'pb', :cb, 're_rf_b2');
select is(tests.rf_state(:'pb') || '/' || (select refund_ref from public.payments where id = :'pb'), 'refunded/' || :'cb' || '/re_rf_b2',
  'B7 (control): the new refund lands: refunded');

-- ---------------------------------------------------------------------------
-- C. The late-cancellation shape: the fee went to the worker, the rest's refund fails.
-- ---------------------------------------------------------------------------
select tests.rf_job('RF fee kept', 'held') as jc \gset
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
select is(tests.rf_state(:'pc'), 'partially_refunded/' || (:cc - 1000), 'C0 (control): the rest lands: partially_refunded');
select tests.rf_failed('evt_rf_c_fail', 1800000100, :'pc', 're_rf_c1', :cc - 1000);
select is(tests.rf_state(:'pc') || '/' || (select (released_at is not null)::text from public.payments where id = :'pc'),
  'held/0/true', 'C1: the rest''s refund fails: held, as before the refund, the fee''s transfer kept');

-- ---------------------------------------------------------------------------
-- D. A released payment refunded by hand in the dashboard; that refund fails.
-- ---------------------------------------------------------------------------
select tests.rf_job('RF released', 'released') as jd \gset
select tests.rf_pid(:'jd') as pd \gset
select charge_amount_cents as cd from public.payments where id = :'pd' \gset
select is(tests.rf_state(:'pd'), 'released/null', 'D0 (control): the worker is paid: released');
select tests.rf_refunded('evt_rf_d_ref', 1800000010, :'pd', :cd, 're_rf_d1');
select tests.rf_failed('evt_rf_d_fail', 1800000100, :'pd', 're_rf_d1', :cd, false);
select is(tests.rf_state(:'pd'), 'released/0', 'D1: a hand refund (no metadata) fails: released again');
select is(tests.rf_lines(:'pd', 'refund failed at the provider%'), 1, 'D2: … and payment_attention lists it');

-- ---------------------------------------------------------------------------
-- E. paid_out (nothing writes it today; set here as a fixture): a hand refund fails.
-- ---------------------------------------------------------------------------
select tests.rf_job('RF paid out', 'released') as je \gset
select tests.rf_pid(:'je') as pe \gset
select charge_amount_cents as ce from public.payments where id = :'pe' \gset
update public.payments set status = 'paid_out', paid_out_at = now() where id = :'pe';
select tests.rf_refunded('evt_rf_e_ref', 1800000010, :'pe', :ce, 're_rf_e1');
select tests.rf_failed('evt_rf_e_fail', 1800000100, :'pe', 're_rf_e1', :ce, false);
select is(tests.rf_state(:'pe'), 'paid_out/0', 'E1: paid_out again');

-- ---------------------------------------------------------------------------
-- F. A voided row charged after the void (funded_after_void); its refund fails.
-- ---------------------------------------------------------------------------
select tests.rf_job('RF voided', 'unfunded') as jf \gset
select tests.rf_pid(:'jf') as pf \gset
select tests.authenticate_as(:'worker');
select public.cancel_job(:'jf', 'worker_cancelled');
select tests.clear_auth();
select charge_amount_cents as cf from public.payments where id = :'pf' \gset
select tests.rf_event('evt_rf_f_ok', 'payment_intent.succeeded', 1800000002, jsonb_build_object(
  'id', (select provider_ref from public.payments where id = :'pf'), 'object', 'payment_intent', 'amount_received', :cf,
  'metadata', jsonb_build_object('payment_id', :'pf')));
select public.record_settlement_sent(:'pf', 'refund', 're_rf_f1', :cf);
select tests.rf_refunded('evt_rf_f_ref', 1800000010, :'pf', :cf, 're_rf_f1');
select is(tests.rf_state(:'pf'), 'voided/' || :'cf', 'F0 (control): the refund lands on the voided row: voided, refunded counted');
select tests.rf_failed('evt_rf_f_fail', 1800000100, :'pf', 're_rf_f1', :cf);
select is(tests.rf_state(:'pf'), 'voided/0', 'F1: its refund fails: still voided, nothing counted as refunded');
select is(tests.rf_lines(:'pf', 'refund failed at the provider%'), 1, 'F2: … and payment_attention lists it');

select * from finish();
rollback;
