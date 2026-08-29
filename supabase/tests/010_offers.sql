-- 010_offers.sql — the offer model, converted from scripts/phase5-proof.sql
-- (sections A–G) and the fixture half of scripts/phase6-proof.sql.
--
-- The proofs ran on staging as ONE transaction against three real profiles,
-- raised on the first failure and rolled back. This is the same walk, one
-- TAP assertion per invariant, against identities it creates itself (D2):
--   customer   posts the jobs, counters, accepts, funds
--   worker_a   the bidder who wins
--   worker_b   the rival whose bid must be superseded and who must see
--              nothing of worker_a's
--
-- Sections keep the proof's letters so the two can be read side by side:
--   A worker bid path · F address privacy (both halves) · B counter path ·
--   C acceptance atomicity · D sandbox checkout · G money honesty ·
--   E negative states (decline / withdraw / unauthorized / expiry)
--
-- FIXTURE SURGERY, DECLARED (unchanged from the proof): expiry cannot be
-- waited out inside one transaction, so exactly one probe-created offer has
-- its expires_at rewound by the runner (RLS bypassed). Nothing else is
-- touched outside the client RPCs.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(52);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('offers.customer@brazos.test', 'Casey Customer') as customer \gset
select tests.create_user('offers.worker.a@brazos.test', 'Wren Worker')    as worker_a \gset
select tests.create_user('offers.worker.b@brazos.test', 'Blake Backup')   as worker_b \gset
insert into fx values ('customer', :'customer'), ('worker_a', :'worker_a'), ('worker_b', :'worker_b');

-- ---------------------------------------------------------------------------
-- A. WORKER BID PATH
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select (public.create_job(
  p_title := 'OFFERS job one', p_description := 'probe row, rolled back',
  p_category := 'other', p_location := 'Probe Area',
  p_budget_min_cents := 4000, p_budget_max_cents := 6000,
  p_address_line := '123 Probe Street'
)).id as job1 \gset
insert into fx values ('job1', :'job1');
select is((select status::text from public.jobs where id = :'job1'), 'open', 'A1: customer published an open job');
select is((select visibility::text from public.jobs where id = :'job1'), 'open_market', 'A1: the job is on the open market');
select is((select budget_cents from public.jobs where id = :'job1'), 6000, 'A1: the legacy budget mirrors the range ceiling (6000)');

select tests.authenticate_as(:'worker_a');
select is((select count(*) from public.jobs where id = :'job1'), 1::bigint, 'A2: worker A can open the job through jobs_select_open');
select public.create_offer(p_amount_cents := 4500, p_job_id := :'job1', p_message := 'phase5 proof bid A') as offer_a \gset
insert into fx values ('offer_a', :'offer_a');
select is((select status::text from public.job_offers where id = :'offer_a'), 'pending', 'A3: worker A''s bid persisted, pending');
select is((select awaiting_id from public.job_offers where id = :'offer_a'), :'customer'::uuid, 'A3: the bid awaits the customer');
select ok((select expires_at > now() + interval '6 days' from public.job_offers where id = :'offer_a'), 'A3: the bid carries a 7-day deadline');

select tests.authenticate_as(:'worker_b');
select public.create_offer(p_amount_cents := 5200, p_job_id := :'job1', p_message := 'phase5 proof bid B') as offer_b \gset
insert into fx values ('offer_b', :'offer_b');

select tests.authenticate_as(:'customer');
select is((select count(*) from public.job_offers where job_id = :'job1'), 2::bigint, 'A4: the customer sees both bids');
select is((select count(*) from public.my_pending_offers() where job_id = :'job1'), 2::bigint, 'A4: my_pending_offers shows both bids awaiting the customer');

-- ---------------------------------------------------------------------------
-- F (first half). ADDRESS PRIVACY PRE-HIRE and cross-worker isolation
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'worker_a');
select is((select count(*) from public.job_locations where job_id = :'job1'), 0::bigint, 'F1: the exact address is unreadable to bidding worker A pre-hire');
select tests.authenticate_as(:'worker_b');
select is((select count(*) from public.job_locations where job_id = :'job1'), 0::bigint, 'F2: the exact address is unreadable to bidding worker B pre-hire');
select is((select count(*) from public.job_offers where job_id = :'job1' and worker_id = :'worker_a'), 0::bigint, 'F3: worker B cannot read worker A''s competing offer');
select is((select count(*) from public.job_offers where job_id = :'job1' and worker_id = :'worker_b'), 1::bigint, 'F3: worker B does read their own offer (the zero above is isolation, not absence)');

-- ---------------------------------------------------------------------------
-- B. COUNTER PATH — the customer counters A's bid
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select public.counter_offer(:'offer_a', 4800) as offer_a2 \gset
insert into fx values ('offer_a2', :'offer_a2');
select is((select status::text from public.job_offers where id = :'offer_a'), 'superseded', 'B1: the countered parent is superseded');
select is((select parent_offer_id from public.job_offers where id = :'offer_a2'), :'offer_a'::uuid, 'B1: the counter points at its parent');
select is((select root_offer_id from public.job_offers where id = :'offer_a2'), :'offer_a'::uuid, 'B1: the counter shares the chain''s root');
select is((select awaiting_id from public.job_offers where id = :'offer_a2'), :'worker_a'::uuid, 'B1: the counter awaits worker A');
select is((select amount_cents from public.job_offers where id = :'offer_a2'), 4800, 'B1: the counter carries 4800');
select throws_ok($$ select public.accept_offer((select v from fx where k = 'offer_a')) $$,
  'P0001', 'This offer is no longer open', 'B2: the stale superseded parent cannot be accepted');
select tests.authenticate_as(:'worker_a');
select is((select count(*) from public.my_pending_offers() where id = :'offer_a2'), 1::bigint, 'B3: worker A sees the counter and the turn is theirs');

-- ---------------------------------------------------------------------------
-- C. ACCEPTANCE — atomic, idempotent, sibling-superseding
-- ---------------------------------------------------------------------------
select is(public.accept_offer(:'offer_a2'), :'job1'::uuid, 'C0: worker A accepts the counter and gets the job id back');
select is(public.accept_offer(:'offer_a2'), :'job1'::uuid, 'C1: a repeated accept is idempotent — no second hire, same job');
select tests.authenticate_as(:'customer');
select is((select status::text from public.jobs where id = :'job1'), 'assigned', 'C2: the job is assigned');
select is((select assigned_worker_id from public.jobs where id = :'job1'), :'worker_a'::uuid, 'C2: the job is assigned to worker A');
select is((select accepted_offer_id from public.jobs where id = :'job1'), :'offer_a2'::uuid, 'C2: the job records the winning revision');
select is((select final_amount_cents from public.jobs where id = :'job1'), 4800, 'C2: the job is stamped at the countered amount');
select is((select count(*) from public.job_offers where job_id = :'job1' and status = 'accepted'), 1::bigint, 'C2: exactly one accepted offer on the job');
select is((select status::text from public.job_offers where id = :'offer_b'), 'superseded', 'C2: the sibling bid B was superseded atomically');
select throws_ok($$ select public.accept_offer((select v from fx where k = 'offer_b')) $$,
  'P0001', 'This offer is no longer open', 'C3: the losing sibling cannot be accepted afterwards');

-- ---------------------------------------------------------------------------
-- F (second half). ADDRESS AFTER HIRE — hired worker yes, rival still no
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'worker_a');
select is((select address_line from public.job_locations where job_id = :'job1'), '123 Probe Street', 'F4: the hired worker reads the exact address after acceptance');
select tests.authenticate_as(:'worker_b');
select is((select count(*) from public.job_locations where job_id = :'job1'), 0::bigint, 'F5: the losing worker still cannot read the address');

-- ---------------------------------------------------------------------------
-- D. SANDBOX CHECKOUT — authorize -> held, idempotent, single row
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.sandbox_authorize_job_payment((select v from fx where k = 'job1')) $$,
  'P0001', 'Job not found', 'D1: only the job owner can start checkout (worker B refused)');
select tests.authenticate_as(:'customer');
select (public.sandbox_authorize_job_payment(:'job1')).id as p1 \gset
insert into fx values ('p1', :'p1');
select ok((select status = 'authorized' and amount_cents = 4800 and provider = 'sandbox'
             and provider_ref like 'sandbox_%' and authorized_at is not null
             and payee_id = :'worker_a' and offer_id = :'offer_a2'
           from public.payments where id = :'p1'),
  'D2: authorize produced an authorized sandbox row at 4800 for worker A against the winning revision');
select is((public.sandbox_authorize_job_payment(:'job1')).id, :'p1'::uuid, 'D2: an authorize retry returns the same row, no duplicate');
select ok((select h.status = 'held' and h.held_at is not null and h.id = :'p1' from public.sandbox_hold_job_payment(:'job1') h),
  'D2: hold moved the same row to held');
select ok((select h.status = 'held' and h.id = :'p1' from public.sandbox_hold_job_payment(:'job1') h),
  'D2: a hold retry is still one row, still held');
select is((select count(*) from public.payments where job_id = :'job1'), 1::bigint, 'D2: exactly one ledger row for the job');
select tests.authenticate_as(:'worker_a');
select is((select status::text from public.payments where job_id = :'job1'), 'held', 'D3: the hired worker (payee) sees funds held in protection');
select tests.authenticate_as(:'worker_b');
select is((select count(*) from public.payments where job_id = :'job1'), 0::bigint, 'F6: the unrelated worker cannot read the payment row');

-- ---------------------------------------------------------------------------
-- G. MONEY HONESTY — nothing released or paid, no contraband release path
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select is((select count(*) from public.payments where job_id = :'job1' and status in ('released', 'paid_out', 'pending')), 0::bigint,
  'G: no payment claims a state this flow cannot produce');
select tests.clear_auth();
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname ilike '%release%payment%' or p.proname ilike '%payout%' or p.proname ilike '%cash_out%')
      -- R4 added the stripe-path successors of the sandbox release pair
      -- (release_job_payment, auto_release_due_payments) and two functions
      -- that only read/record the payouts_enabled flag and move no money
      -- (my_payouts_enabled, set_payouts_enabled). The scan itself is unchanged.
      and p.proname not in ('sandbox_release_job_payment', 'sandbox_cash_out', 'sandbox_cash_out_enabled',
                            'release_job_payment', 'auto_release_due_payments',
                            'my_payouts_enabled', 'set_payouts_enabled')),
  '',
  'G: the only functions that can move money past held are the sanctioned release pairs (sandbox and stripe)');

-- ---------------------------------------------------------------------------
-- E. NEGATIVE STATES — on a second job so job1's hire stays untouched
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select (public.create_job(
  p_title := 'OFFERS job two', p_description := 'probe row, rolled back',
  p_category := 'other', p_location := 'Probe Area', p_budget_cents := 5000
)).id as job2 \gset
insert into fx values ('job2', :'job2');

-- decline settles the offer
select tests.authenticate_as(:'worker_a');
select public.create_offer(p_amount_cents := 4000, p_job_id := :'job2', p_message := 'e1') as e_bid1 \gset
insert into fx values ('e_bid1', :'e_bid1');
select tests.authenticate_as(:'customer');
select lives_ok($$ select public.decline_offer((select v from fx where k = 'e_bid1')) $$, 'E1: the customer declines');
select is((select status::text from public.job_offers where id = :'e_bid1'), 'declined', 'E1: decline settles the offer');

-- withdraw: the author retracts while the other side owes the reply
select tests.authenticate_as(:'worker_a');
select public.create_offer(p_amount_cents := 4100, p_job_id := :'job2', p_message := 'e2') as e_bid2 \gset
insert into fx values ('e_bid2', :'e_bid2');
select lives_ok($$ select public.withdraw_offer((select v from fx where k = 'e_bid2')) $$, 'E2: the author withdraws');
select is((select status::text from public.job_offers where id = :'e_bid2'), 'withdrawn', 'E2: the author''s pending offer reads withdrawn');

-- only the author may withdraw; only a party may act at all
select public.create_offer(p_amount_cents := 4200, p_job_id := :'job2', p_message := 'e3') as e_bid3 \gset
insert into fx values ('e_bid3', :'e_bid3');
select tests.authenticate_as(:'worker_b');
select throws_ok($$ select public.withdraw_offer((select v from fx where k = 'e_bid3')) $$,
  'P0001', 'Offer not found', 'E3: an unrelated account cannot withdraw someone else''s offer');
select throws_ok($$ select public.decline_offer((select v from fx where k = 'e_bid3')) $$,
  'P0001', 'Offer not found', 'E3: an unrelated account cannot decline someone else''s offer');
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.withdraw_offer((select v from fx where k = 'e_bid3')) $$,
  'P0001', 'Only the person who sent this offer can withdraw it', 'E4: withdraw is author-only; the recipient''s exit is decline');

-- expiry: rewind the deadline (fixture surgery, probe row only), then prove
-- the lapsed offer cannot be accepted and the worker can bid again.
select tests.clear_auth();
update public.job_offers set expires_at = now() - interval '1 hour' where id = :'e_bid3';
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.accept_offer((select v from fx where k = 'e_bid3')) $$,
  'P0001', 'This offer has expired and can no longer be accepted', 'E5: an expired offer cannot be accepted');
select lives_ok($$ select public.decline_offer((select v from fx where k = 'e_bid3')) $$, 'E5b: a non-raising touch (decline) on the lapsed offer does not error');
select is((select status::text from public.job_offers where id = :'e_bid3'), 'expired', 'E5b: the row persists expired — the truthful outcome — not declined');
select tests.authenticate_as(:'worker_a');
select public.create_offer(p_amount_cents := 4300, p_job_id := :'job2', p_message := 'e4') as e_bid4 \gset
select is((select status::text from public.job_offers where id = :'e_bid4'), 'pending', 'E6: after decline / withdraw / expiry the worker can open a fresh chain');

select tests.clear_auth();
select * from finish();
rollback;
