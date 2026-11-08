-- 110_auto_release_gate.sql — the n3 proofs: 20260930000100_auto_release_told_gate.sql
-- proven on the local stack before the pipeline applies it anywhere. Each
-- section is one case of the run's dispatch (D3, cases 1-9) plus §0, the
-- restated ACLs; its assertions say which.
--
-- THE CAST (named once; every assertion says which of these it ran as):
--   customer   posts and pays for every job here — the payer, the one who
--              must be TOLD before the 72-hour clock may release
--   worker     is hired on all of them (the payee)
--   service    the service role (set_config role/claims), for
--              resolve_job_dispute as 030 §11 runs it
--   anon / authenticated   privilege checks only (§0)
--   runner     the connection's own role, RLS bypassed — fixtures, ground
--              truth, SURGERY, and the stand-in for the webhook
--              (payment_events rows) and for the drain (outbox status writes)
--
-- THE FIXTURE, per case: one job hired through the real RPCs (create_job,
-- create_offer, accept_offer) by tests.r4_hire, funded through
-- begin_job_payment + a synthesized payment_intent.succeeded event
-- (tests.r4_fund), worked to completed by tests.r4_work — which fires the
-- jobs_notify_status trigger, so notify_on_job_status enqueues the
-- job_completed row (pending) for the customer. r4_hire, r4_event and
-- r4_fund are copied verbatim from 060_connect.sql (lines 62-121); r4_work
-- from 030_payments.sql (lines 135-143), the only file that defines it —
-- each file's transaction owns its own copy and rolls it back. Everything
-- rolls back.
--
-- FIXTURE SURGERY, DECLARED (each one a state the product cannot reach in a
-- single transaction, or cannot reach at all); every line carries -- SURGERY:
--   * jobs.completed_at is rewound — 73 hours, 6 days 23 hours, 7 days
--     1 hour, 8 days — the clocks cannot be waited out (030 §13 precedent).
--   * the job_completed notification_outbox row is removed (cases 1, 6, 7:
--     the row the pre-n3 suppression never wrote) or flipped to skipped /
--     failed / sent (cases 3-5) as resolve_notification would write it
--     (030 §13 flips pending -> sent the same way).
--   * the customer's notification_prefs row (every profile gets one from the
--     create_default_notification_prefs trigger) is upserted to
--     job_updates = false, and a blocks row is inserted, by the runner
--     (case 8), in the shapes the prefs upsert and the app's block insert
--     write; written AFTER the hire because create_offer refuses under a
--     block while transition_job_status carries no block check.
--
-- WHAT CASE 7 PROVES, AND WHY IT HAS TWO JOBS: resolve_job_dispute in the
-- worker's favour on a completed job is ITSELF the release (release_reason
-- dispute_resolved, release_requested_at set — 030 §6 and §11), so after a
-- resolution the fallback has nothing left to release and the truthful
-- assertion is 0, not 1: no double release. The "once the report is no
-- longer open the fallback releases" clause is proven on the first job, whose
-- report the customer WITHDRAWS (030 J1, line 297) — a withdrawal leaves the
-- payment untouched (refund_on_no_show_withdrawn acts only on a cancelled
-- no-show), so the row is still the fallback's to release.
--
-- PAIRING: every refusal sits beside the positive control on the same
-- fixture. throws_ok pins code AND message.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(45);

select tests.create_user('n3.customer@brazos.test', 'Cara Customer') as customer \gset
select tests.create_user('n3.worker@brazos.test',   'Wren Worker')   as worker   \gset

-- ---------------------------------------------------------------------------
-- Helpers for this file: r4_hire, r4_event, r4_fund copied from
-- 060_connect.sql; r4_work copied from 030_payments.sql. Created inside the
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

create or replace function tests.r4_work(p_worker uuid, p_job uuid, p_complete boolean default true) returns void language plpgsql as $$
begin
  perform tests.authenticate_as(p_worker);
  perform public.transition_job_status(p_job, 'in_progress');
  if p_complete then
    perform public.transition_job_status(p_job, 'completed', '["https://example.com/r4-done.jpg"]'::jsonb);
  end if;
  perform tests.clear_auth();
end $$;

-- ---------------------------------------------------------------------------
-- §0. THE RESTATED ACLs. create or replace preserves whatever ACL a function
--     already had, so the migration restates each one; this proves the live
--     ACL is what it restates.
-- ---------------------------------------------------------------------------
select ok(has_function_privilege('service_role', 'public.auto_release_due_payments()', 'EXECUTE'),
  '0: service_role may execute auto_release_due_payments (the cron''s role, positive control)');
select ok(not has_function_privilege('authenticated', 'public.auto_release_due_payments()', 'EXECUTE'),
  '0: authenticated holds no EXECUTE on auto_release_due_payments');
select ok(not has_function_privilege('anon', 'public.auto_release_due_payments()', 'EXECUTE'),
  '0: anon holds no EXECUTE on auto_release_due_payments');
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.auto_release_due_payments() $$,
  '42501', 'permission denied for function auto_release_due_payments',
  '0: customer — a client cannot run the clock (030 §14''s proof, still green after the restatement)');
select tests.clear_auth();
select ok(not has_function_privilege('authenticated', 'public.should_notify(uuid, uuid, text)', 'EXECUTE'),
  '0: authenticated holds no EXECUTE on should_notify (lean E4 revoked the baseline''s grant: its callers are definer functions)');
select ok(not has_function_privilege('anon', 'public.should_notify(uuid, uuid, text)', 'EXECUTE'),
  '0: anon holds no EXECUTE on should_notify (PUBLIC revoked, restated)');
select ok(not has_function_privilege('anon', 'public.notify_on_job_status()', 'EXECUTE'),
  '0: anon holds no EXECUTE on notify_on_job_status (PUBLIC revoked, restated)');
select ok(not has_function_privilege('authenticated', 'public.notify_on_job_status()', 'EXECUTE'),
  '0: authenticated holds no EXECUTE on notify_on_job_status either — a trigger function needs no caller grant');

-- ---------------------------------------------------------------------------
-- §1. TOLD-GATE, ABSENT ROW: no job_completed row at 73 h releases nothing.
-- ---------------------------------------------------------------------------
select tests.r4_hire(:'customer', :'worker', 5000, 'n3 C1 told-gate absent row') as j1 \gset
select tests.r4_fund(:'customer', :'j1', 'evt_n3_c1') as p1 \gset
select tests.r4_work(:'worker', :'j1');
select is((select count(*) from public.notification_outbox where recipient_id = :'customer' and type = 'job_completed' and data ->> 'jobId' = :'j1'::text), 1::bigint,
  '1: runner — completing the job enqueued exactly one job_completed row for the customer (the fixture is real)');
delete from public.notification_outbox where recipient_id = :'customer' and type = 'job_completed' and data ->> 'jobId' = :'j1'::text;   -- SURGERY: the row the pre-n3 suppression never wrote
update public.jobs set completed_at = now() - interval '73 hours' where id = :'j1';   -- SURGERY
select is(public.auto_release_due_payments(), 0, '1: told-gate — with no job_completed row at 73 h nothing releases');
select ok((select status = 'held' and release_requested_at is null and release_reason is null from public.payments where id = :'p1'),
  '1: … the row stays held with release_requested_at null');

-- ---------------------------------------------------------------------------
-- §2. TOLD-GATE, PENDING ROW: the drain has not looked at it; still refused.
-- ---------------------------------------------------------------------------
select tests.r4_hire(:'customer', :'worker', 5000, 'n3 C2 told-gate pending row') as j2 \gset
select tests.r4_fund(:'customer', :'j2', 'evt_n3_c2') as p2 \gset
select tests.r4_work(:'worker', :'j2');
select is((select status from public.notification_outbox where recipient_id = :'customer' and type = 'job_completed' and data ->> 'jobId' = :'j2'::text), 'pending',
  '2: runner — the fresh job_completed row is pending');
update public.jobs set completed_at = now() - interval '73 hours' where id = :'j2';   -- SURGERY
select is(public.auto_release_due_payments(), 0, '2: told-gate — a pending row at 73 h releases nothing (unchanged behaviour; 030 §13 proves it too)');
select ok((select status = 'held' and release_requested_at is null from public.payments where id = :'p2'), '2: … the row is untouched');

-- ---------------------------------------------------------------------------
-- §3. TOLD-GATE, SKIPPED ROW: no active push token, yet the feed shows it.
-- ---------------------------------------------------------------------------
select tests.r4_hire(:'customer', :'worker', 5000, 'n3 C3 told-gate skipped row') as j3 \gset
select tests.r4_fund(:'customer', :'j3', 'evt_n3_c3') as p3 \gset
select tests.r4_work(:'worker', :'j3');
update public.notification_outbox set status = 'skipped', last_error = 'no active push tokens' where recipient_id = :'customer' and type = 'job_completed' and data ->> 'jobId' = :'j3'::text;   -- SURGERY: as send-push resolves a row with no token
update public.jobs set completed_at = now() - interval '73 hours' where id = :'j3';   -- SURGERY
select is(public.auto_release_due_payments(), 1, '3: told-gate — a skipped row at 73 h releases exactly this row');
select ok((select status = 'held' and release_requested_at is not null and release_reason = 'auto_approved'
             and transfer_cents = amount_cents - platform_fee_cents and transfer_cents = 4625
           from public.payments where id = :'p3'),
  '3: … auto_approved, transfer_cents = amount minus the platform fee (4625 on a $50 job), the row left held for the transfer');
select is((select count(*) from public.transfers_due where id = :'p3'), 1::bigint, '3: … and the row is in transfers_due');

-- ---------------------------------------------------------------------------
-- §4. TOLD-GATE, FAILED ROW: nothing at HEAD writes it and the constraint
--     allows it; a future writer may.
-- ---------------------------------------------------------------------------
select tests.r4_hire(:'customer', :'worker', 5000, 'n3 C4 told-gate failed row') as j4 \gset
select tests.r4_fund(:'customer', :'j4', 'evt_n3_c4') as p4 \gset
select tests.r4_work(:'worker', :'j4');
update public.notification_outbox set status = 'failed', last_error = 'delivery failed' where recipient_id = :'customer' and type = 'job_completed' and data ->> 'jobId' = :'j4'::text;   -- SURGERY: the terminal status no writer uses yet
update public.jobs set completed_at = now() - interval '73 hours' where id = :'j4';   -- SURGERY
select is(public.auto_release_due_payments(), 1, '4: told-gate — a failed row at 73 h releases exactly this row');
select ok((select release_requested_at is not null and release_reason = 'auto_approved' and transfer_cents = 4625 from public.payments where id = :'p4'), '4: … auto_approved');

-- ---------------------------------------------------------------------------
-- §5. TOLD-GATE, SENT ROW: the pre-n3 path, still green.
-- ---------------------------------------------------------------------------
select tests.r4_hire(:'customer', :'worker', 5000, 'n3 C5 told-gate sent row') as j5 \gset
select tests.r4_fund(:'customer', :'j5', 'evt_n3_c5') as p5 \gset
select tests.r4_work(:'worker', :'j5');
update public.notification_outbox set status = 'sent', sent_at = now() where recipient_id = :'customer' and type = 'job_completed' and data ->> 'jobId' = :'j5'::text;   -- SURGERY: as the drain would (030 §13)
update public.jobs set completed_at = now() - interval '73 hours' where id = :'j5';   -- SURGERY
select is(public.auto_release_due_payments(), 1, '5: told-gate — a sent row at 73 h releases exactly this row (the pre-n3 path, unchanged)');
select ok((select release_requested_at is not null and release_reason = 'auto_approved' and transfer_cents = 4625 from public.payments where id = :'p5'), '5: … auto_approved');

-- ---------------------------------------------------------------------------
-- §6. THE FALLBACK: an absent row, 7 days after completion, releases anyway.
-- ---------------------------------------------------------------------------
select tests.r4_hire(:'customer', :'worker', 5000, 'n3 C6 fallback absent row') as j6 \gset
select tests.r4_fund(:'customer', :'j6', 'evt_n3_c6') as p6 \gset
select tests.r4_work(:'worker', :'j6');
delete from public.notification_outbox where recipient_id = :'customer' and type = 'job_completed' and data ->> 'jobId' = :'j6'::text;   -- SURGERY
update public.jobs set completed_at = now() - interval '6 days 23 hours' where id = :'j6';   -- SURGERY: one hour short of the fallback
select is(public.auto_release_due_payments(), 0, '6: fallback — one hour short of 7 days, with no row, nothing releases');
update public.jobs set completed_at = now() - interval '7 days 1 hour' where id = :'j6';   -- SURGERY
select is(public.auto_release_due_payments(), 1, '6: fallback — 7 days and 1 hour after completion the absent row no longer matters: exactly this row releases');
select ok((select status = 'held' and release_requested_at is not null and release_reason = 'auto_approved' and transfer_cents = 4625 from public.payments where id = :'p6'),
  '6: … auto_approved, the same write as the told clock');
select is((select count(*) from public.transfers_due where id = :'p6'), 1::bigint, '6: … in transfers_due');

-- ---------------------------------------------------------------------------
-- §7. THE FALLBACK REFUSES UNDER AN OPEN ISSUE REPORT, and releases once the
--     report is no longer open. J7: the customer reports, the fallback
--     refuses, the customer withdraws, the fallback releases.
-- ---------------------------------------------------------------------------
select tests.r4_hire(:'customer', :'worker', 5000, 'n3 C7 fallback under a report, withdrawn') as j7 \gset
select tests.r4_fund(:'customer', :'j7', 'evt_n3_c7') as p7 \gset
select tests.r4_work(:'worker', :'j7');
delete from public.notification_outbox where recipient_id = :'customer' and type = 'job_completed' and data ->> 'jobId' = :'j7'::text;   -- SURGERY
update public.jobs set completed_at = now() - interval '8 days' where id = :'j7';   -- SURGERY
select tests.authenticate_as(:'customer');
select (public.open_job_dispute(:'j7', 'incomplete', 'n3 probe report')).id as d7 \gset
select tests.clear_auth();
select is((select status::text from public.job_disputes where id = :'d7'), 'open', '7: customer — the issue report is open (the real RPC, as 030 opens one)');
select is(public.auto_release_due_payments(), 0, '7: fallback — 8 days after completion an open issue report still holds the payment');
select ok((select status = 'held' and release_requested_at is null from public.payments where id = :'p7'), '7: … the row is untouched');
select tests.authenticate_as(:'customer');
select is((public.withdraw_job_dispute(:'d7')).status::text, 'withdrawn', '7: customer — withdraws the report (030 J1); a withdrawal on a completed job leaves the payment untouched');
select tests.clear_auth();
select is(public.auto_release_due_payments(), 1, '7: fallback — once the report is no longer open, exactly this row releases');
select ok((select status = 'held' and release_requested_at is not null and release_reason = 'auto_approved' and transfer_cents = 4625 from public.payments where id = :'p7'),
  '7: … auto_approved');
-- J7b: the same refusal, then the report RESOLVED for the worker as
-- service_role (030 §11): the resolution is itself the release, so the
-- fallback then has nothing left — no double release.
select tests.r4_hire(:'customer', :'worker', 5000, 'n3 C7b fallback under a report, resolved') as j7b \gset
select tests.r4_fund(:'customer', :'j7b', 'evt_n3_c7b') as p7b \gset
select tests.r4_work(:'worker', :'j7b');
delete from public.notification_outbox where recipient_id = :'customer' and type = 'job_completed' and data ->> 'jobId' = :'j7b'::text;   -- SURGERY
update public.jobs set completed_at = now() - interval '8 days' where id = :'j7b';   -- SURGERY
select tests.authenticate_as(:'customer');
select (public.open_job_dispute(:'j7b', 'incomplete', 'n3 probe report, to be resolved')).id as d7b \gset
select tests.clear_auth();
select is(public.auto_release_due_payments(), 0, '7: fallback — refused again under the second job''s open report');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('role', 'service_role', true);
select is(current_user::text, 'service_role', '7: the session is now the service role');
select ok((select p.release_reason = 'dispute_resolved' and p.release_requested_at is not null and p.transfer_cents = 4625 and p.status = 'held'
           from public.resolve_job_dispute(:'j7b', 'worker', 'n3: the photos show the work') p),
  '7: service — resolving for the worker is itself the release (dispute_resolved), as 030 §11 proves');
select set_config('role', 'none', true);
select set_config('request.jwt.claims', '', true);
select is(public.auto_release_due_payments(), 0, '7: fallback — after the resolution nothing is left to release: release_requested_at is set, so the row is outside the fallback''s set (no double release)');
select ok((select release_reason = 'dispute_resolved' and status = 'held' from public.payments where id = :'p7b'), '7: … and the resolution''s release_reason stands, not overwritten by auto_approved');

-- ---------------------------------------------------------------------------
-- §8. THE CATEGORY: with Job updates OFF and a block, completing a
--     job STILL tells the customer — under 'jobs'. The suppressors go in
--     after the hire (create_offer refuses under a block; transition_job_status
--     carries no block check).
-- ---------------------------------------------------------------------------
select tests.r4_hire(:'customer', :'worker', 5000, 'n3 C8 always-on category') as j8 \gset
select tests.r4_fund(:'customer', :'j8', 'evt_n3_c8') as p8 \gset
insert into public.notification_prefs (user_id, job_updates) values (:'customer', false)
  on conflict (user_id) do update set job_updates = excluded.job_updates;   -- SURGERY: the customer switched Job updates off (the prefs upsert shape; the row may already exist)
insert into public.blocks (blocker_id, blocked_id) values (:'customer', :'worker');   -- SURGERY: the customer blocked the worker (permanent: expires_at null)
select ok(public.is_blocked_between(:'customer', :'worker')
          and (select job_updates = false from public.notification_prefs where user_id = :'customer'),
  '8: runner — ground truth: the block and job_updates = false are both in place');
select is(public.should_notify(:'customer', :'worker', 'job_updates'), false, '8: control — under those two the old category, job_updates, is suppressed by should_notify');
select is(public.should_notify(:'customer', :'worker', 'jobs'), true, '8: … and the always-on category, jobs, is not: a preference or a block never suppresses it (n3)');
select is(public.should_notify(null::uuid, :'worker', 'jobs'), false, '8: … a null recipient still refuses above the insertion');
select is(public.should_notify(:'customer', :'customer', 'jobs'), false, '8: … and so does a self-actor');
select tests.r4_work(:'worker', :'j8');
select is((select count(*) from public.notification_outbox where recipient_id = :'customer' and type = 'job_completed' and data ->> 'jobId' = :'j8'::text), 1::bigint,
  '8: worker completes — the job_completed row for the customer STILL exists');
select is((select category from public.notification_outbox where recipient_id = :'customer' and type = 'job_completed' and data ->> 'jobId' = :'j8'::text), 'jobs',
  '8: … under category jobs');
-- C6 (20261003000800): the words changed — "<first name> finished the job" over "“<title>” is done. Check the work and approve."
select ok((select dedupe_key = 'job_completed:' || :'j8'::text and data ->> 'screen' = 'ClientJobDetail'
                  and title ~ '^\S+ finished the job$' and title !~ 'marked complete'
                  and body = '“' || left((select j.title from public.jobs j where j.id = :'j8'), 60) || '” is done. Check the work and approve.'
           from public.notification_outbox where recipient_id = :'customer' and type = 'job_completed' and data ->> 'jobId' = :'j8'::text),
  '8: … with the type, the dedupe key and the screen unchanged, and the words a person would write (C6) — the feed and lib/notificationRoutes.ts key on type and data, not on category or copy');

-- ---------------------------------------------------------------------------
-- §9. IDEMPOTENT: nothing released above releases twice, and nothing else is due.
-- ---------------------------------------------------------------------------
select is(public.auto_release_due_payments(), 0, '9: a second run releases nothing more — every released row is out of the set, every refused row still refused');

select * from finish();
rollback;
