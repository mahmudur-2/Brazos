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
--   worker_a   bids, is hired, declares arrival, plans, completes, cashes out
--   worker_b   the unassigned worker who must be refused everywhere
--
-- Walk: post → bid → pair thread → pre-hire chat REFUSED → accept (worker
-- notified) → hold → en route → arrived → checklist → in progress →
-- completion evidence → post-hire chat both ways → dispute freeze (manual and
-- the auto clock) → withdraw → approve/release (worker notified) → tip →
-- mutual reviews → auto-release on the second job → cash-out → ledger and
-- feed sweeps → the phase58 late-funding and retry regressions.
--
-- FIXTURE SURGERY, DECLARED (unchanged from the proof): the 72-hour clocks
-- cannot be waited out, so completed_at is rewound by the runner, twice, on
-- probe rows only.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(74);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

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
select lives_ok($$ select public.sandbox_authorize_job_payment((select v from fx where k = 'job1')) $$, 'hold: authorize job1');
select is((public.sandbox_hold_job_payment(:'job1')).status::text, 'held', 'hold: protect job1 — the payment is held');
select lives_ok($$ select public.sandbox_authorize_job_payment((select v from fx where k = 'job2')) $$, 'hold: authorize job2');
select is((public.sandbox_hold_job_payment(:'job2')).status::text, 'held', 'hold: protect job2 — the payment is held');
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
-- C. CHECKLIST — the RLS boundary, both directions
-- ---------------------------------------------------------------------------
select lives_ok($$ insert into public.job_checklist_items (job_id, position, label)
  values ((select v from fx where k = 'job1'), 0, 'LIFECYCLE step one'), ((select v from fx where k = 'job1'), 1, 'LIFECYCLE step two') $$,
  'C1: the assigned worker writes the checklist');
with u as (update public.job_checklist_items set done = true, done_at = now() where job_id = :'job1' and position = 0 returning 1)
select is((select count(*) from u), 1::bigint, 'C1: the assigned worker toggles a step');
select is((select count(*) from public.job_checklist_items where job_id = :'job1'), 2::bigint, 'C1: the worker reads their two steps');
select tests.authenticate_as(:'customer');
select is((select count(*) from public.job_checklist_items where job_id = :'job1'), 2::bigint, 'C2: the customer reads the checklist');
select throws_ok($$ insert into public.job_checklist_items (job_id, position, label) values ((select v from fx where k = 'job1'), 9, 'LIFECYCLE customer intrusion') $$,
  '42501', 'new row violates row-level security policy for table "job_checklist_items"', 'C2: the customer reads but cannot write');
select tests.authenticate_as(:'worker_b');
select is((select count(*) from public.job_checklist_items where job_id = :'job1'), 0::bigint, 'C3: an outsider sees zero checklist rows');

-- ---------------------------------------------------------------------------
-- D. TRANSITIONS — release refused early; completed_at stamped; the arrival
--    window and the checklist close once work starts / ends
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.sandbox_release_job_payment((select v from fx where k = 'job1')) $$,
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
select throws_ok($$ insert into public.job_checklist_items (job_id, position, label) values ((select v from fx where k = 'job1'), 5, 'LIFECYCLE after the fact') $$,
  '42501', 'new row violates row-level security policy for table "job_checklist_items"', 'D4: the checklist closes at completion');
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
select throws_ok($$ select public.sandbox_release_job_payment((select v from fx where k = 'job1')) $$,
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
select throws_ok($$ select public.sandbox_release_job_payment((select v from fx where k = 'job1')) $$,
  'P0001', 'Job not found', 'F1: the payee cannot release to themselves');
select tests.authenticate_as(:'customer');
select ok((select p.status = 'released' and p.release_reason = 'approved' and p.released_at is not null
           from public.sandbox_release_job_payment(:'job1') p),
  'F2: held -> released, recorded as approved with released_at');
select tests.clear_auth();
select released_at as first_release from public.payments where job_id = :'job1' and kind = 'job_payment' \gset
select tests.authenticate_as(:'customer');
select ok((select p.status = 'released' and p.released_at = :'first_release'::timestamptz from public.sandbox_release_job_payment(:'job1') p),
  'F2: a repeated release is a no-op that returns the same row');
select tests.authenticate_as(:'worker_b');
select throws_ok($$ select public.job_payment_state((select v from fx where k = 'job1')) $$,
  'P0001', 'Job not found', 'F3: an outsider cannot read job_payment_state');
select tests.authenticate_as(:'worker_a');
select is((select count(*) from public.notification_outbox where recipient_id = :'worker_a' and type = 'payment_released'), 1::bigint,
  'approve/release: the worker was notified of the release exactly once (phase56)');

-- ---------------------------------------------------------------------------
-- G. TIP — release-first, payer-only, capped, one per job
-- ---------------------------------------------------------------------------
select lives_ok($$ select public.transition_job_status((select v from fx where k = 'job2'), 'in_progress') $$, 'G: the worker starts job2');
select lives_ok($$ select public.transition_job_status((select v from fx where k = 'job2'), 'completed') $$, 'G: the worker completes job2 without releasing it');
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.sandbox_tip_worker((select v from fx where k = 'job2'), 500) $$,
  'P0001', 'The job payment releases first — then a tip can be added', 'G1: a tip is refused until the job payment releases');
select tests.authenticate_as(:'worker_a');
select throws_ok($$ select public.sandbox_tip_worker((select v from fx where k = 'job1'), 500) $$,
  'P0001', 'Job not found', 'G2: the payee cannot tip themselves');
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.sandbox_tip_worker((select v from fx where k = 'job1'), 200000) $$,
  'P0001', 'Tip must be between $0.01 and $1,000', 'G3: the $1,000 cap is enforced');
select throws_ok($$ select public.sandbox_tip_worker((select v from fx where k = 'job1'), 0) $$,
  'P0001', 'Tip must be between $0.01 and $1,000', 'G4: a zero tip is refused');
select (public.sandbox_tip_worker(:'job1', 500)).id as tip1 \gset
insert into fx values ('tip1', :'tip1');
select ok((select kind = 'tip' and status = 'released' and amount_cents = 500 and released_at is not null from public.payments where id = :'tip1'),
  'G5: the tip is a released tip ledger row at 500');
select ok((select t.id = :'tip1' and t.amount_cents = 500 from public.sandbox_tip_worker(:'job1', 1000) t),
  'G5: a second tip on the same job returns the original, not a new row');

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
-- H. AUTO-RELEASE — the 72h on-read clock on job2, nothing holding it
-- ---------------------------------------------------------------------------
select tests.clear_auth();
update public.jobs set completed_at = now() - interval '73 hours' where id = :'job2';
select tests.authenticate_as(:'worker_a');
select ok((select p.status = 'released' and p.release_reason = 'auto_approved' from public.job_payment_state(:'job2') p),
  'H: the 72h on-read auto-release fired and recorded auto_approved');
select is((public.job_payment_state(:'job2')).release_reason, 'auto_approved', 'H: a second read does not disturb the record');

-- ---------------------------------------------------------------------------
-- Wallet + cash-out; ledger and feed sweeps (lifecycle-proof.mjs)
-- ---------------------------------------------------------------------------
select is((select sum(amount_cents) from public.payments where payee_id = :'worker_a' and status = 'released'), 8500::bigint,
  'wallet: available = 5000 job1 + 500 tip + 3000 job2, all released to the worker');
select is((select count(*) from public.sandbox_cash_out()), 3::bigint, 'cash-out: the sweep moves the three released rows to paid_out');
select is((select count(*) from public.sandbox_cash_out()), 0::bigint, 'cash-out: a second sweep moves nothing');
select tests.clear_auth();
select is((select sum(amount_cents) from public.payments where job_id = :'job1'), 5500::bigint, 'ledger: job1 nets 5500');
select ok((select bool_and(payer_id = :'customer' and payee_id = :'worker_a' and provider = 'sandbox') from public.payments where job_id in (:'job1', :'job2')),
  'ledger: every row is customer -> worker A, sandbox — no self-pay, no other provider');
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
-- late authorize + hold (which the section already performed) have landed.
-- The phase58 retry regression keeps its own assertion after the start.
select tests.authenticate_as(:'worker_a');
select throws_ok($$ select public.transition_job_status((select v from fx where k = 'job3'), 'in_progress') $$,
  'P0001', 'The customer hasn''t protected the payment yet. You''ll get a notification the moment it''s held.',
  'I1: the worker cannot start BEFORE checkout — the held gate refuses while no payment exists');
select tests.authenticate_as(:'customer');
select is((public.sandbox_authorize_job_payment(:'job3')).status::text, 'authorized', 'I1: a late authorize still lands');
select is((public.sandbox_hold_job_payment(:'job3')).status::text, 'held', 'I1: a late hold still lands — a job refused at the gate can be funded');
select tests.authenticate_as(:'worker_a');
select is((public.transition_job_status(:'job3', 'in_progress')).status::text, 'in_progress', 'I2: the start succeeds once the payment is held');
select is((public.transition_job_status(:'job3', 'in_progress')).status::text, 'in_progress', 'I2: a repeated transition returns the row instead of raising (phase58)');

select tests.clear_auth();
select * from finish();
rollback;
