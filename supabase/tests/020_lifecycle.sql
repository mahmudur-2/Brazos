-- 020_lifecycle.sql — the active-work lifecycle, converted from
-- scripts/lifecycle-proof.mjs and the lifecycle half of
-- scripts/phase6-proof.sql (sections B–I).
--
-- lifecycle-proof.mjs drove two REAL staging sessions over PostgREST; this
-- file asserts the same state transitions with the same identity mechanism
-- 010_offers.sql uses, so it proves the database's half of that walk (RPCs,
-- RLS, triggers, ledger) and nothing about PostgREST or the app. The
-- identities are its own (D2):
--   customer   posts, funds, reports, approves, tips, reviews
--   worker_a   bids, is hired, declares arrival, completes
--   worker_b   the unassigned worker who must be refused everywhere
--
-- Walk: post → bid → pair thread → pre-hire chat REFUSED → accept (worker
-- notified) → hold → en route → arrived → in progress → completion evidence
-- → post-hire chat both ways → dispute freeze (manual and the auto clock) →
-- withdraw → approve/release (worker notified) → tip → mutual reviews →
-- auto-release on the second job → ledger and feed sweeps → the phase58
-- late-funding and retry regressions.
--
-- Money moves on the stripe path: tests.test_fund_job is checkout, and the
-- runner applies the provider events (tests.lc_event) the webhook would.
--
-- FIXTURE SURGERY, DECLARED (unchanged from the proof): the 72-hour clocks
-- cannot be waited out, so completed_at is rewound by the runner, twice, on
-- probe rows only; and job2's job_completed notification is flipped to sent,
-- as the drain would, for the auto-release gate.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(64);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

-- A provider event in the minimum shape apply_payment_event reads, applied by
-- the runner. Created inside the transaction, gone at rollback.
create or replace function tests.lc_event(p_type text, p_payment uuid, p_object_id text)
returns jsonb language plpgsql as $$
begin
  insert into public.payment_events (id, type, payload)
  values ('evt_' || p_object_id, p_type, jsonb_build_object('id', 'evt_' || p_object_id, 'type', p_type,
    'data', jsonb_build_object('object', jsonb_build_object('id', p_object_id,
      'metadata', jsonb_build_object('payment_id', p_payment)))));
  return public.apply_payment_event('evt_' || p_object_id);
end $$;

select tests.create_user('lifecycle.customer@brazos.test', 'Lia Lifecycle') as customer \gset
select tests.create_user('lifecycle.worker.a@brazos.test', 'Wes Lifecycle') as worker_a \gset
select tests.create_user('lifecycle.worker.b@brazos.test', 'Blake Backup')  as worker_b \gset
insert into fx values ('customer', :'customer'), ('worker_a', :'worker_a'), ('worker_b', :'worker_b');

-- ---------------------------------------------------------------------------
-- A. FIXTURES THROUGH THE REAL RPCS — two jobs carried to assigned + held,
--    with the pre-hire steps lifecycle-proof.mjs asserted on the way.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select (public.create_job(
  p_title := 'LIFECYCLE full walk', p_description := 'probe row, rolled back',
  p_category := 'other', p_location := 'Probe Area',
  p_budget_min_cents := 5000, p_budget_max_cents := 5000, p_address_line := '1 Proof Way'
)).id as job1 \gset
select (public.create_job(
  p_title := 'LIFECYCLE auto-release job', p_description := 'probe row, rolled back',
  p_category := 'other', p_location := 'Probe Area',
  p_budget_min_cents := 3000, p_budget_max_cents := 3000, p_address_line := '125 Probe Street'
)).id as job2 \gset
insert into fx values ('job1', :'job1'), ('job2', :'job2');
select is((select status::text from public.jobs where id = :'job1'), 'open', 'post: the customer creates the job, open');

select tests.authenticate_as(:'worker_a');
select public.create_offer(p_amount_cents := 5000, p_job_id := :'job1', p_message := 'proof bid') as offer1 \gset
select public.create_offer(p_amount_cents := 3000, p_job_id := :'job2', p_message := 'proof bid two') as offer2 \gset
insert into fx values ('offer1', :'offer1'), ('offer2', :'offer2');
select id as thread from public.direct_threads
  where user_a = least(:'customer'::uuid, :'worker_a'::uuid) and user_b = greatest(:'customer'::uuid, :'worker_a'::uuid) \gset
insert into fx values ('thread', :'thread');
select ok(:'thread' is not null, 'bid: the pair thread exists from the offer (phase52)');
select throws_ok($$ insert into public.messages (direct_thread_id, sender_id, content) values ((select v from fx where k = 'thread'), (select v from fx where k = 'worker_a'), 'could I come at nine?') $$,
  '42501', 'new row violates row-level security policy for table "messages"', 'chat pre-hire: a free-form message is REFUSED by the policy (phase66)');

select tests.authenticate_as(:'customer');
select is(public.accept_offer(:'offer1'), :'job1'::uuid, 'accept: the customer accepts on job1');
select is(public.accept_offer(:'offer2'), :'job2'::uuid, 'accept: the customer accepts on job2');
select is((select status::text from public.jobs where id = :'job1'), 'assigned', 'accept: job1 is assigned');
select is((select assigned_worker_id from public.jobs where id = :'job1'), :'worker_a'::uuid, 'accept: job1 is assigned to worker A');
select tests.clear_auth();
select lives_ok($$ select tests.test_fund_job((select v from fx where k = 'job1')) $$, 'hold: checkout funds job1');
select is((select status::text from public.payments where job_id = :'job1' and kind = 'job_payment'), 'held', 'hold: protect job1 — the payment is held');
select lives_ok($$ select tests.test_fund_job((select v from fx where k = 'job2')) $$, 'hold: checkout funds job2');
select is((select status::text from public.payments where job_id = :'job2' and kind = 'job_payment'), 'held', 'hold: protect job2 — the payment is held');
select tests.authenticate_as(:'worker_a');
select ok((select count(*) from public.notification_outbox where recipient_id = :'worker_a') >= 1, 'accept: the worker got a notification');
select ok((select status = 'held' and amount_cents = 5000 from public.payments where job_id = :'job1' and kind = 'job_payment'),
  'hold: the payee''s wallet view shows 5000 held');
select is((select count(*) from public.payments where job_id in (:'job1', :'job2') and kind = 'job_payment' and status = 'held'), 2::bigint,
  'A: two jobs assigned to worker A with payments held');

-- ---------------------------------------------------------------------------
-- B. ARRIVAL — authorization + monotonicity
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.mark_worker_arrival((select v from fx where k = 'job1'), 'en_route') $$,
  'P0001', 'Job not found or not assigned to caller', 'B1: the customer cannot mark arrival');
select tests.authenticate_as(:'worker_b');
select throws_ok($$ select public.mark_worker_arrival((select v from fx where k = 'job1'), 'en_route') $$,
  'P0001', 'Job not found or not assigned to caller', 'B2: an unassigned worker cannot mark arrival');
select tests.authenticate_as(:'worker_a');
select throws_ok($$ select public.mark_worker_arrival((select v from fx where k = 'job1'), 'teleported') $$,
  'P0001', 'Unknown arrival step', 'B3: an unknown arrival step is refused');
select ok((select j.en_route_at is not null and j.arrived_at is null from public.mark_worker_arrival(:'job1', 'en_route') j),
  'B4: en_route sets exactly en_route_at');
select tests.clear_auth();
select en_route_at as first_en_route from public.jobs where id = :'job1' \gset
select tests.authenticate_as(:'worker_a');
select is((select j.en_route_at from public.mark_worker_arrival(:'job1', 'en_route') j), :'first_en_route'::timestamptz,
  'B4: repeating en_route does not move the timestamp');
select ok((select j.arrived_at is not null and j.en_route_at = :'first_en_route'::timestamptz from public.mark_worker_arrival(:'job1', 'arrived') j),
  'B4: arrived sets arrived_at and leaves en_route_at alone');

-- ---------------------------------------------------------------------------
-- D. TRANSITIONS — release refused early; completed_at stamped; the arrival
--    window closes once work starts
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.release_job_payment((select v from fx where k = 'job1')) $$,
  'P0001', 'Funds release only after the job is completed', 'D1: release is refused while the job is only assigned');
select tests.authenticate_as(:'worker_a');
select is((public.transition_job_status(:'job1', 'in_progress')).status::text, 'in_progress', 'D2: the worker starts the job');
select throws_ok($$ select public.mark_worker_arrival((select v from fx where k = 'job1'), 'arrived') $$,
  'P0001', 'Arrival can only be marked before the job is started', 'D2: arrival closes once work starts');
select ok((select j.status = 'completed' and j.completed_at is not null
             and j.completion_photos = '["https://example.com/proof-done.jpg"]'::jsonb
             and j.completion_photo_url = 'https://example.com/proof-done.jpg'
           from public.transition_job_status(:'job1', 'completed', '["https://example.com/proof-done.jpg"]'::jsonb) j),
  'D3: completed with evidence; completed_at stamped; the first photo becomes the cover');
select tests.authenticate_as(:'customer');
select ok((select count(*) from public.notification_outbox where recipient_id = :'customer') >= 2, 'start + complete: the customer was notified of the status changes');

-- post-hire chat, both threads, both directions, each notifying the other
select tests.authenticate_as(:'worker_a');
select count(*) as w_msgs_before from public.notification_outbox where recipient_id = :'worker_a' and type = 'message' \gset
select tests.authenticate_as(:'customer');
select lives_ok($$ insert into public.messages (job_id, sender_id, content) values ((select v from fx where k = 'job1'), (select v from fx where k = 'customer'), 'LIFECYCLE looks great') $$,
  'chat post-hire: the customer posts on the job thread');
select tests.authenticate_as(:'worker_a');
select is((select count(*) from public.notification_outbox where recipient_id = :'worker_a' and type = 'message'), (:'w_msgs_before' + 1)::bigint,
  'chat post-hire: the job-thread message notified the worker exactly once');
select count(*) as c_msgs_before from public.notification_outbox where recipient_id = :'customer' and type = 'message' \gset
select lives_ok($$ insert into public.messages (direct_thread_id, sender_id, content) values ((select v from fx where k = 'thread'), (select v from fx where k = 'worker_a'), 'LIFECYCLE on my way') $$,
  'chat post-hire: the pair thread now accepts a free-form message (assignment opened it)');
select tests.authenticate_as(:'customer');
select ok((select count(*) from public.notification_outbox where recipient_id = :'customer' and type = 'message') > :'c_msgs_before',
  'chat post-hire: the pair-thread message notified the customer');

-- ---------------------------------------------------------------------------
-- E. DISPUTE — freezes release (manual AND the auto clock), opener-only
--    withdraw, one open per job
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'worker_a');
select throws_ok($$ select public.open_job_dispute((select v from fx where k = 'job1'), 'incomplete', null) $$,
  'P0001', 'Job not found', 'E1: the worker cannot open the customer''s issue report');
select tests.authenticate_as(:'customer');
select (public.open_job_dispute(:'job1', 'incomplete', 'LIFECYCLE second shelf missing')).id as dispute1 \gset
insert into fx values ('dispute1', :'dispute1');
select is((public.open_job_dispute(:'job1', 'other', null)).id, :'dispute1'::uuid, 'E2: a second open returns the existing report — one open report per job');
select throws_ok($$ select public.release_job_payment((select v from fx where k = 'job1')) $$,
  'P0001', 'An open issue report is holding this payment', 'E2: manual release is frozen while the report is open');
select tests.clear_auth();
update public.jobs set completed_at = now() - interval '73 hours' where id = :'job1';
select tests.authenticate_as(:'worker_a');
select is((public.job_payment_state(:'job1')).status::text, 'held', 'E3: the 72h auto-release stays frozen while the report is open');
select tests.authenticate_as(:'worker_b');
select throws_ok($$ select public.withdraw_job_dispute((select v from fx where k = 'dispute1')) $$,
  'P0001', 'Issue report not found', 'E4: only the opener can withdraw');
select tests.authenticate_as(:'customer');
select ok((select d.status = 'withdrawn' and d.resolved_at is not null from public.withdraw_job_dispute(:'dispute1') d),
  'E5: the opener withdrew; the report is closed with resolved_at');
select is((public.withdraw_job_dispute(:'dispute1')).status::text, 'withdrawn', 'E5: a repeated withdraw is a no-op');

-- ---------------------------------------------------------------------------
-- F. RELEASE — payer-only, idempotent, honestly recorded, notified
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'worker_a');
select throws_ok($$ select public.release_job_payment((select v from fx where k = 'job1')) $$,
  'P0001', 'Job not found', 'F1: the payee cannot release to themselves');
select tests.authenticate_as(:'customer');
select (public.release_job_payment(:'job1')).id as pay1 \gset
select tests.clear_auth();
select tests.lc_event('transfer.created', :'pay1', 'tr_lc_job1');
select ok((select p.status = 'released' and p.release_reason = 'approved' and p.released_at is not null
           from public.payments p where p.id = :'pay1'),
  'F2: held -> released (the approval, then the transfer), recorded as approved with released_at');
select released_at as first_release from public.payments where job_id = :'job1' and kind = 'job_payment' \gset
select tests.authenticate_as(:'customer');
select ok((select p.status = 'released' and p.released_at = :'first_release'::timestamptz from public.release_job_payment(:'job1') p),
  'F2: a repeated release is a no-op that returns the same row');
select tests.authenticate_as(:'worker_b');
select throws_ok($$ select public.job_payment_state((select v from fx where k = 'job1')) $$,
  'P0001', 'Job not found', 'F3: an outsider cannot read job_payment_state');
select tests.authenticate_as(:'worker_a');
select is((select count(*) from public.notification_outbox where recipient_id = :'worker_a' and type = 'payment_released'), 1::bigint,
  'approve/release: the worker was notified of the release exactly once (phase56)');

-- ---------------------------------------------------------------------------
-- G. TIP — release-first, payer-only (the cap, zero and one-per-job: 030 §5)
-- ---------------------------------------------------------------------------
select lives_ok($$ select public.transition_job_status((select v from fx where k = 'job2'), 'in_progress') $$, 'G: the worker starts job2');
select throws_ok($$ select public.transition_job_status((select v from fx where k = 'job2'), 'completed') $$,
  'P0001', 'At least one photo of the finished work is required to mark this job complete',
  'G: the worker cannot complete job2 without a photo (R6c D-14; 080_job_completions.sql carries the full proof)');
select lives_ok($$ select public.transition_job_status((select v from fx where k = 'job2'), 'completed', '["https://example.com/proof-job2.jpg"]'::jsonb) $$, 'G: the worker completes job2 with a photo, without releasing it');
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.begin_tip_payment((select v from fx where k = 'job2'), 500) $$,
  'P0001', 'The job payment releases first — then a tip can be added', 'G1: a tip is refused until the job payment releases');
select tests.authenticate_as(:'worker_a');
select throws_ok($$ select public.begin_tip_payment((select v from fx where k = 'job1'), 500) $$,
  'P0001', 'Job not found', 'G2: the payee cannot tip themselves');
select tests.authenticate_as(:'customer');
select (public.begin_tip_payment(:'job1', 500)).id as tip1 \gset
insert into fx values ('tip1', :'tip1');
select tests.clear_auth();
select tests.lc_event('payment_intent.succeeded', :'tip1', 'pi_lc_tip1');
select ok((select kind = 'tip' and status = 'held' and amount_cents = 500 and held_at is not null
                  and release_requested_at is not null and transfer_cents = 500 and released_at is null and transfer_ref is null
             from public.payments where id = :'tip1'),
  'G5: the charged tip is held and queued for its transfer at 500, not released before the transfer lands (B1 rule 1)');
select tests.lc_event('transfer.created', :'tip1', 'tr_lc_tip1');
select ok((select kind = 'tip' and status = 'released' and amount_cents = 500 and released_at is not null and transfer_ref = 'tr_lc_tip1'
             from public.payments where id = :'tip1'),
  'G5: the tip is a released tip ledger row at 500 once its transfer lands (B1 rule 3)');
select tests.authenticate_as(:'customer');

-- ---------------------------------------------------------------------------
-- Reviews — mutual, aggregates move (lifecycle-proof.mjs)
-- ---------------------------------------------------------------------------
select lives_ok($$ select public.create_review((select v from fx where k = 'job1'), (select v from fx where k = 'worker_a'), 5, 'LIFECYCLE great work') $$,
  'reviews: the customer reviews the worker');
select tests.authenticate_as(:'worker_a');
select lives_ok($$ select public.create_review((select v from fx where k = 'job1'), (select v from fx where k = 'customer'), 5, 'LIFECYCLE great client') $$,
  'reviews: the worker reviews the customer');
select tests.authenticate_as(:'customer');
select ok((select rating_count >= 1 from public.profiles where id = :'worker_a'), 'reviews: the worker''s public aggregate moved');

-- ---------------------------------------------------------------------------
-- H. AUTO-RELEASE — the 72h clock on job2 (auto_release_due_payments, the
--    cron's function, then the transfer), nothing holding it
-- ---------------------------------------------------------------------------
select tests.clear_auth();
update public.jobs set completed_at = now() - interval '73 hours' where id = :'job2';
update public.notification_outbox set status = 'sent'
 where recipient_id = :'customer' and type = 'job_completed' and data ->> 'jobId' = :'job2';
select public.auto_release_due_payments();
select tests.lc_event('transfer.created', (select id from public.payments where job_id = :'job2' and kind = 'job_payment'), 'tr_lc_job2');
select tests.authenticate_as(:'worker_a');
select ok((select p.status = 'released' and p.release_reason = 'auto_approved' from public.job_payment_state(:'job2') p),
  'H: the 72h auto-release fired and recorded auto_approved');
select is((public.job_payment_state(:'job2')).release_reason, 'auto_approved', 'H: a second read does not disturb the record');

-- ---------------------------------------------------------------------------
-- Wallet; ledger and feed sweeps (lifecycle-proof.mjs)
-- ---------------------------------------------------------------------------
select is((select sum(amount_cents) from public.payments where payee_id = :'worker_a' and status = 'released'), 8500::bigint,
  'wallet: available = 5000 job1 + 500 tip + 3000 job2, all released to the worker');
select tests.clear_auth();
select is((select sum(amount_cents) from public.payments where job_id = :'job1'), 5500::bigint, 'ledger: job1 nets 5500');
select ok((select bool_and(payer_id = :'customer' and payee_id = :'worker_a' and provider = 'stripe') from public.payments where job_id in (:'job1', :'job2')),
  'ledger: every row is customer -> worker A, stripe — no self-pay, no other provider');
select is((select count(*) from public.payments p left join public.jobs j on j.id = p.job_id where p.payer_id = :'customer' and j.id is null), 0::bigint,
  'ledger: no orphaned payments');
select is((select count(*) - count(distinct dedupe_key) from public.notification_outbox where recipient_id in (:'customer', :'worker_a')), 0::bigint,
  'notifications: zero duplicate dedupe keys for the pair');

-- ---------------------------------------------------------------------------
-- I. HARDENING-RUN REGRESSIONS (phase58) — the late-funding race and the
--    transition retry
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select (public.create_job(
  p_title := 'LIFECYCLE late-funding job', p_description := 'probe row, rolled back',
  p_category := 'other', p_location := 'Probe Area',
  p_budget_min_cents := 2500, p_budget_max_cents := 2500, p_address_line := '129 Probe Street'
)).id as job3 \gset
insert into fx values ('job3', :'job3');
select tests.authenticate_as(:'worker_a');
select public.create_offer(p_amount_cents := 2500, p_job_id := :'job3', p_message := 'late-funding bid') as offer3 \gset
select tests.authenticate_as(:'customer');
select is(public.accept_offer(:'offer3'), :'job3'::uuid, 'I: the customer accepts on job3');
-- R4 (D8) re-pointed this section: the held gate now refuses a start before
-- checkout, so I1 proves the refusal and I2 proves the start lands once the
-- late checkout (which the section already performed) has landed.
-- The phase58 retry regression keeps its own assertion after the start.
select tests.authenticate_as(:'worker_a');
select throws_ok($$ select public.transition_job_status((select v from fx where k = 'job3'), 'in_progress') $$,
  'P0001', 'The customer hasn''t protected the payment yet. You''ll get a notification the moment it''s held.',
  'I1: the worker cannot start BEFORE checkout — the held gate refuses while no payment exists');
select tests.clear_auth();
select lives_ok($$ select tests.test_fund_job((select v from fx where k = 'job3')) $$, 'I1: a late checkout still lands');
select is((select status::text from public.payments where job_id = :'job3' and kind = 'job_payment'), 'held', 'I1: a late hold still lands — a job refused at the gate can be funded');
select tests.authenticate_as(:'worker_a');
select is((public.transition_job_status(:'job3', 'in_progress')).status::text, 'in_progress', 'I2: the start succeeds once the payment is held');
select is((public.transition_job_status(:'job3', 'in_progress')).status::text, 'in_progress', 'I2: a repeated transition returns the row instead of raising (phase58)');

select tests.clear_auth();
select * from finish();
rollback;
