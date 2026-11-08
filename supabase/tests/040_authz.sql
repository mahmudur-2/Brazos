-- 040_authz.sql — the authorization matrix: does BRAZOS leak one user's data
-- to another, or let one user act as another?
--
-- THE CAST (D3), named once. Every assertion below says which of these it
-- ran as:
--   anon      no session at all (a publishable key)
--   owner     posted every job here (the customer)
--   worker    bid on every job; hired on j_live and j_done (the assigned worker)
--   bidder    bid on j_open and j_live and lost (the losing bidder)
--   stranger  an unrelated, active, authenticated account
-- plus ONE declared extra, used only by §16 (the admin surface):
--   admin     an account with profiles.is_admin = true, set directly by the
--             runner because no RPC grants admin (fixture surgery, declared).
--
-- THE FIXTURE (D2): everything is created here, through the real RPCs where
-- the app would use them, and rolled back at the end. Nothing reads a row
-- seed.sql created; the coordinates used sit in open water so no seeded job
-- can share a hotspot cell with these.
--   j_open   open, open-market, exact address; pending bids from worker+bidder
--   j_live   assigned to worker (accept_offer), payment HELD; bidder lost
--   j_done   completed by worker, payment HELD, then released in §10
--   j_del    open, no bids, no address — the one job that may be deleted
--
-- THE THREE SURFACES (D4):
--   (a) tables whose client writes are REVOKED at the grant level — proven by
--       has_table_privilege AND by an actual refused statement (42501,
--       "permission denied for table …")
--   (b) tables the client still writes through a policy — proven by the
--       authorized identity succeeding and each other identity being
--       refused (42501, "new row violates row-level security policy …") or
--       silently touching zero rows (UPDATE/DELETE USING)
--   (c) SECURITY DEFINER RPCs — RLS never applies inside them, so every
--       refusal is the function body's own; proven by the exact message
--       (P0001) the body raises, never a wildcard
--
-- PAIRING (C-1): every denial sits next to the positive control that proves
-- the row exists and the authorized identity reaches it. A count of zero is
-- evidence only because the same row counted as one for someone else.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(438);

-- psql does not interpolate :'vars' inside dollar quotes, so ids also live in
-- this temp table for the statements throws_ok/lives_ok execute.
create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

-- ---------------------------------------------------------------------------
-- §0. FIXTURE
-- ---------------------------------------------------------------------------
select tests.create_user('authz.owner@brazos.test',    'Olive Owner')   as owner    \gset
select tests.create_user('authz.worker@brazos.test',   'Wes Worker')    as worker   \gset
select tests.create_user('authz.bidder@brazos.test',   'Bea Bidder')    as bidder   \gset
select tests.create_user('authz.stranger@brazos.test', 'Sam Stranger')  as stranger \gset
select tests.create_user('authz.admin@brazos.test',    'Ada Admin')     as admin    \gset
update public.profiles set is_admin = true where id = :'admin';
insert into fx values
  ('owner', :'owner'), ('worker', :'worker'), ('bidder', :'bidder'),
  ('stranger', :'stranger'), ('admin', :'admin');

-- Jobs, as the owner, through create_job. j_open and j_live share exact
-- coordinates so the discovery functions can only tell them apart by status.
select tests.authenticate_as(:'owner');
select (public.create_job(
  p_title := 'AUTHZ open job', p_description := 'fixture, rolled back',
  p_category := 'handyman', p_location := 'Open water',
  p_budget_min_cents := 4000, p_budget_max_cents := 6000,
  p_lat := 10.1234, p_lng := 10.1234, p_address_line := '100 Authz Open St'
)).id as j_open \gset
select (public.create_job(
  p_title := 'AUTHZ live job', p_description := 'fixture, rolled back',
  p_category := 'cleaning', p_location := 'Open water',
  p_budget_cents := 5000,
  p_lat := 10.1234, p_lng := 10.1234, p_address_line := '200 Authz Live St'
)).id as j_live \gset
select (public.create_job(
  p_title := 'AUTHZ done job', p_description := 'fixture, rolled back',
  p_category := 'moving', p_location := 'Open water',
  p_budget_cents := 5500, p_address_line := '300 Authz Done St'
)).id as j_done \gset
select (public.create_job(
  p_title := 'AUTHZ deletable job', p_description := 'fixture, rolled back',
  p_category := 'errands', p_location := 'Open water', p_budget_cents := 1000
)).id as j_del \gset
insert into fx values
  ('j_open', :'j_open'), ('j_live', :'j_live'), ('j_done', :'j_done'), ('j_del', :'j_del');

-- Bids, through create_offer, as the two workers.
select tests.authenticate_as(:'worker');
select public.create_offer(p_amount_cents := 4500, p_job_id := :'j_open', p_message := 'worker on open') as o_open_w \gset
select public.create_offer(p_amount_cents := 5000, p_job_id := :'j_live', p_message := 'worker on live') as o_live_w \gset
select public.create_offer(p_amount_cents := 5500, p_job_id := :'j_done', p_message := 'worker on done') as o_done_w \gset
select tests.authenticate_as(:'bidder');
select public.create_offer(p_amount_cents := 4800, p_job_id := :'j_open', p_message := 'bidder on open') as o_open_b \gset
select public.create_offer(p_amount_cents := 5200, p_job_id := :'j_live', p_message := 'bidder on live') as o_live_b \gset
insert into fx values
  ('o_open_w', :'o_open_w'), ('o_live_w', :'o_live_w'), ('o_done_w', :'o_done_w'),
  ('o_open_b', :'o_open_b'), ('o_live_b', :'o_live_b');

-- The owner hires the worker on j_live and j_done, and funds both.
select tests.authenticate_as(:'owner');
select lives_ok($$ select public.accept_offer((select v from fx where k = 'o_live_w')) $$,
  'owner: accept_offer on the worker''s j_live bid succeeds (positive control for every accept_offer refusal below)');
select lives_ok($$ select public.accept_offer((select v from fx where k = 'o_done_w')) $$,
  'owner: accept_offer on the worker''s j_done bid succeeds');
select tests.clear_auth();
select tests.test_fund_job(:'j_live') as p_live \gset
select tests.test_fund_job(:'j_done') as p_done \gset
insert into fx values ('p_live', :'p_live'), ('p_done', :'p_done');

-- The worker carries j_done to completed.
select tests.authenticate_as(:'worker');
select lives_ok($$ select public.transition_job_status((select v from fx where k = 'j_done'), 'in_progress') $$,
  'worker: transition_job_status j_done -> in_progress (positive control for the transition refusals)');
select lives_ok($$ select public.transition_job_status((select v from fx where k = 'j_done'), 'completed', '["https://example.com/authz-done.jpg"]'::jsonb) $$,
  'worker: transition_job_status j_done -> completed with evidence');

-- Ground truth the fixture must have produced, read with RLS bypassed.
select tests.clear_auth();
select is((select status::text from public.jobs where id = :'j_live'), 'assigned', 'fixture: j_live is assigned');
select is((select assigned_worker_id from public.jobs where id = :'j_live'), :'worker'::uuid, 'fixture: j_live is assigned to the worker');
select is((select status::text from public.job_offers where id = :'o_live_b'), 'superseded', 'fixture: the bidder''s j_live bid was superseded by the accept');
select is((select status::text from public.jobs where id = :'j_done'), 'completed', 'fixture: j_done is completed');
select is((select status::text from public.payments where id = :'p_live'), 'held', 'fixture: j_live''s payment is held');
select is((select status::text from public.payments where id = :'p_done'), 'held', 'fixture: j_done''s payment is held');
select id as dt_ow from public.direct_threads
  where user_a = least(:'owner'::uuid, :'worker'::uuid) and user_b = greatest(:'owner'::uuid, :'worker'::uuid) \gset
select id as dt_ob from public.direct_threads
  where user_a = least(:'owner'::uuid, :'bidder'::uuid) and user_b = greatest(:'owner'::uuid, :'bidder'::uuid) \gset
insert into fx values ('dt_ow', :'dt_ow'), ('dt_ob', :'dt_ob');
select ok(:'dt_ow' is not null and :'dt_ob' is not null, 'fixture: the offers created the owner-worker and owner-bidder pair threads');

-- ---------------------------------------------------------------------------
-- §1. SURFACE (a): writes revoked at the grant level. has_table_privilege is
-- the contract; the refused statement is the proof. Each table's positive
-- control is the sanctioned path that DID create its fixture row (§0) — and
-- the row is counted here by the identity that owns it.
-- ---------------------------------------------------------------------------
select ok(not has_table_privilege('authenticated', 'public.jobs', 'INSERT'), 'grant: authenticated has no INSERT on jobs');
select ok(not has_table_privilege('authenticated', 'public.jobs', 'UPDATE'), 'grant: authenticated has no UPDATE on jobs');
select ok(not has_table_privilege('authenticated', 'public.bids', 'INSERT'), 'grant: authenticated has no INSERT on bids');
select ok(not has_table_privilege('authenticated', 'public.bids', 'UPDATE'), 'grant: authenticated has no UPDATE on bids');
select ok(not has_table_privilege('authenticated', 'public.reviews', 'INSERT'), 'grant: authenticated has no INSERT on reviews');
select ok(not has_table_privilege('authenticated', 'public.reviews', 'UPDATE'), 'grant: authenticated has no UPDATE on reviews');
select ok(not has_table_privilege('authenticated', 'public.reviews', 'DELETE'), 'grant: authenticated has no DELETE on reviews');
select ok(not has_table_privilege('authenticated', 'public.job_locations', 'INSERT'), 'grant: authenticated has no INSERT on job_locations');
select ok(not has_table_privilege('authenticated', 'public.job_locations', 'UPDATE'), 'grant: authenticated has no UPDATE on job_locations');
select ok(not has_table_privilege('authenticated', 'public.job_locations', 'DELETE'), 'grant: authenticated has no DELETE on job_locations');
select ok(not has_table_privilege('authenticated', 'public.job_offers', 'INSERT'), 'grant: authenticated has no INSERT on job_offers (RPC-write-only)');
select ok(not has_table_privilege('authenticated', 'public.job_offers', 'UPDATE'), 'grant: authenticated has no UPDATE on job_offers');
select ok(not has_table_privilege('authenticated', 'public.job_offers', 'DELETE'), 'grant: authenticated has no DELETE on job_offers');
select ok(not has_table_privilege('authenticated', 'public.payments', 'INSERT'), 'grant: authenticated has no INSERT on payments');
select ok(not has_table_privilege('authenticated', 'public.payments', 'UPDATE'), 'grant: authenticated has no UPDATE on payments');
select ok(not has_table_privilege('authenticated', 'public.payments', 'DELETE'), 'grant: authenticated has no DELETE on payments');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'INSERT'), 'grant: authenticated has no INSERT on profiles');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), 'grant: authenticated has no UPDATE on profiles');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'DELETE'), 'grant: authenticated has no DELETE on profiles');
select ok(not has_table_privilege('authenticated', 'public.job_disputes', 'INSERT'), 'grant: authenticated has no INSERT on job_disputes');
select ok(not has_table_privilege('authenticated', 'public.job_disputes', 'UPDATE'), 'grant: authenticated has no UPDATE on job_disputes');
select ok(not has_table_privilege('authenticated', 'public.notification_outbox', 'INSERT'), 'grant: authenticated has no INSERT on notification_outbox');
select ok(not has_table_privilege('authenticated', 'public.notification_outbox', 'DELETE'), 'grant: authenticated has no DELETE on notification_outbox');
select ok(not has_table_privilege('authenticated', 'public.direct_threads', 'INSERT'), 'grant: authenticated has no INSERT on direct_threads');
select ok(not has_table_privilege('authenticated', 'public.direct_threads', 'UPDATE'), 'grant: authenticated has no UPDATE on direct_threads');
select ok(not has_table_privilege('authenticated', 'public.banned_phones', 'INSERT'), 'grant: authenticated has no INSERT on banned_phones');
select ok(not has_table_privilege('anon', 'public.profiles', 'SELECT'), 'grant: anon has no SELECT on profiles');
select ok(not has_table_privilege('anon', 'public.job_offers', 'SELECT'), 'grant: anon has no SELECT on job_offers');
select ok(not has_table_privilege('anon', 'public.payments', 'SELECT'), 'grant: anon has no SELECT on payments');
select ok(not has_table_privilege('anon', 'public.job_disputes', 'SELECT'), 'grant: anon has no SELECT on job_disputes');
select ok(not has_table_privilege('anon', 'public.notification_outbox', 'SELECT'), 'grant: anon has no SELECT on notification_outbox');
select ok(not has_table_privilege('anon', 'public.worker_services', 'SELECT'), 'grant: anon has no SELECT on worker_services');

-- The refusals, as the owner — the most-entitled real identity for these rows.
select tests.authenticate_as(:'owner');
select is((select count(*) from public.jobs where id = :'j_open'), 1::bigint,
  'owner: reads j_open, the row create_job made (positive control for the direct-write refusals on jobs)');
select throws_ok($$ insert into public.jobs (client_id, title, description, category, location)
  values ((select v from fx where k = 'owner'), 'direct', 'direct', 'other', 'x') $$,
  '42501', 'permission denied for table jobs', 'owner: direct INSERT into jobs is refused');
select throws_ok($$ update public.jobs set status = 'assigned', assigned_worker_id = (select v from fx where k = 'worker') where id = (select v from fx where k = 'j_open') $$,
  '42501', 'permission denied for table jobs', 'owner: direct UPDATE of jobs (assigning a worker by hand) is refused');
select is((select count(*) from public.bids where job_id = :'j_open'), 2::bigint,
  'owner: reads both projected bids on j_open (positive control for the bids refusals)');
select throws_ok($$ insert into public.bids (job_id, worker_id, amount_cents) values ((select v from fx where k = 'j_open'), (select v from fx where k = 'owner'), 1) $$,
  '42501', 'permission denied for table bids', 'owner: direct INSERT into bids is refused');
select throws_ok($$ update public.bids set status = 'accepted' where job_id = (select v from fx where k = 'j_open') $$,
  '42501', 'permission denied for table bids', 'owner: direct UPDATE of bids is refused');
select is((select count(*) from public.job_locations where job_id = :'j_open'), 1::bigint,
  'owner: reads j_open''s exact address, the row create_job made (positive control for the job_locations refusals)');
select throws_ok($$ insert into public.job_locations (job_id, address_line) values ((select v from fx where k = 'j_del'), 'direct') $$,
  '42501', 'permission denied for table job_locations', 'owner: direct INSERT into job_locations is refused');
select throws_ok($$ update public.job_locations set address_line = 'moved' where job_id = (select v from fx where k = 'j_open') $$,
  '42501', 'permission denied for table job_locations', 'owner: direct UPDATE of job_locations is refused');
select throws_ok($$ delete from public.job_locations where job_id = (select v from fx where k = 'j_open') $$,
  '42501', 'permission denied for table job_locations', 'owner: direct DELETE from job_locations is refused');
select is((select count(*) from public.job_offers where job_id = :'j_open'), 2::bigint,
  'owner: reads both offers on j_open, the rows create_offer made (positive control for the job_offers refusals)');
select throws_ok($$ insert into public.job_offers (job_id, offer_type, root_offer_id, customer_id, worker_id, author_id, amount_cents)
  values ((select v from fx where k = 'j_open'), 'marketplace_bid', gen_random_uuid(), (select v from fx where k = 'owner'), (select v from fx where k = 'worker'), (select v from fx where k = 'worker'), 1) $$,
  '42501', 'permission denied for table job_offers', 'owner: direct INSERT into job_offers is refused');
select throws_ok($$ update public.job_offers set status = 'accepted' where id = (select v from fx where k = 'o_open_w') $$,
  '42501', 'permission denied for table job_offers', 'owner: direct UPDATE of job_offers is refused');
select throws_ok($$ delete from public.job_offers where id = (select v from fx where k = 'o_open_b') $$,
  '42501', 'permission denied for table job_offers', 'owner: direct DELETE from job_offers is refused');
select is((select count(*) from public.payments where id = :'p_live'), 1::bigint,
  'owner: reads j_live''s held payment, the row checkout made (positive control for the payments refusals)');
select throws_ok($$ insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents)
  values ((select v from fx where k = 'j_open'), (select v from fx where k = 'owner'), (select v from fx where k = 'worker'), 1, 0) $$,
  '42501', 'permission denied for table payments', 'owner: direct INSERT into payments is refused');
select throws_ok($$ update public.payments set status = 'released' where id = (select v from fx where k = 'p_live') $$,
  '42501', 'permission denied for table payments', 'owner: direct UPDATE of payments (releasing money by hand) is refused');
select throws_ok($$ delete from public.payments where id = (select v from fx where k = 'p_live') $$,
  '42501', 'permission denied for table payments', 'owner: direct DELETE from payments is refused');
select is((select count(*) from public.profiles where id = :'owner'), 1::bigint,
  'owner: reads their own profile row (positive control for the profiles refusals)');
select throws_ok($$ insert into public.profiles (id, full_name) values (gen_random_uuid(), 'direct') $$,
  '42501', 'permission denied for table profiles', 'owner: direct INSERT into profiles is refused');
select throws_ok($$ update public.profiles set full_name = 'direct' where id = (select v from fx where k = 'owner') $$,
  '42501', 'permission denied for table profiles', 'owner: direct UPDATE of profiles, even their own row, is refused');
select throws_ok($$ delete from public.profiles where id = (select v from fx where k = 'owner') $$,
  '42501', 'permission denied for table profiles', 'owner: direct DELETE from profiles is refused');
select throws_ok($$ insert into public.job_disputes (job_id, opened_by, reason) values ((select v from fx where k = 'j_done'), (select v from fx where k = 'owner'), 'other') $$,
  '42501', 'permission denied for table job_disputes', 'owner: direct INSERT into job_disputes is refused (open_job_dispute is the path, §10)');
select throws_ok($$ insert into public.notification_outbox (recipient_id, category, type, title, body)
  values ((select v from fx where k = 'worker'), 'messages', 'message', 'direct', 'direct') $$,
  '42501', 'permission denied for table notification_outbox', 'owner: direct INSERT into notification_outbox (forging a notification) is refused');
select throws_ok($$ insert into public.direct_threads (user_a, user_b) values (least((select v from fx where k = 'owner'), (select v from fx where k = 'stranger')), greatest((select v from fx where k = 'owner'), (select v from fx where k = 'stranger'))) $$,
  '42501', 'permission denied for table direct_threads', 'owner: direct INSERT into direct_threads is refused');
select throws_ok($$ insert into public.banned_phones (phone) values ('+15550000000') $$,
  '42501', 'permission denied for table banned_phones', 'owner: direct INSERT into banned_phones is refused');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- §2. jobs — jobs_select_own / jobs_select_assigned_worker /
--     jobs_select_offer_party / jobs_select_open. Same four rows, five readers.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'owner');
select is((select count(*) from public.jobs where id in (:'j_open', :'j_live', :'j_done', :'j_del')), 4::bigint, 'owner: sees all four of their jobs');
select tests.authenticate_as(:'worker');
select is((select count(*) from public.jobs where id = :'j_live'), 1::bigint, 'worker: sees j_live (assigned to them)');
select is((select count(*) from public.jobs where id = :'j_open'), 1::bigint, 'worker: sees j_open (open market)');
select is((select count(*) from public.jobs where id = :'j_del'), 1::bigint, 'worker: sees j_del (open market)');
select tests.authenticate_as(:'bidder');
select is((select count(*) from public.jobs where id = :'j_live'), 1::bigint, 'bidder: still sees j_live after losing, through jobs_select_offer_party (their offer history)');
select is((select count(*) from public.jobs where id = :'j_done'), 0::bigint, 'bidder: does NOT see j_done (never bid there; not open)');
select tests.authenticate_as(:'stranger');
select is((select count(*) from public.jobs where id = :'j_open'), 1::bigint, 'stranger: sees j_open (open market — the marketplace is public to accounts)');
select is((select count(*) from public.jobs where id = :'j_live'), 0::bigint, 'stranger: does NOT see the assigned j_live');
select is((select count(*) from public.jobs where id = :'j_done'), 0::bigint, 'stranger: does NOT see the completed j_done');
select throws_ok($$ update public.jobs set title = 'hijacked' where id = (select v from fx where k = 'j_open') $$,
  '42501', 'permission denied for table jobs', 'stranger: direct UPDATE of someone else''s job is refused');
select tests.authenticate_anon();
select throws_ok($$ select count(*) from public.jobs $$, '42501', 'permission denied for table jobs', 'anon: cannot read jobs at all, even the open one (lean E4 revoked anon''s SELECT; no policy admitted anon before it)');

-- ---------------------------------------------------------------------------
-- §3. job_locations — job_locations_select_party. The exact address.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'owner');
select is((select address_line from public.job_locations where job_id = :'j_live'), '200 Authz Live St', 'owner: reads j_live''s exact address');
select tests.authenticate_as(:'worker');
select is((select address_line from public.job_locations where job_id = :'j_live'), '200 Authz Live St', 'worker: reads j_live''s exact address once hired');
select is((select count(*) from public.job_locations where job_id = :'j_open'), 0::bigint, 'worker: does NOT read j_open''s address while only a bidder there');
select tests.authenticate_as(:'bidder');
select is((select count(*) from public.job_locations where job_id = :'j_live'), 0::bigint, 'bidder: does NOT read j_live''s address after losing');
select is((select count(*) from public.job_locations where job_id = :'j_open'), 0::bigint, 'bidder: does NOT read j_open''s address pre-hire');
select tests.authenticate_as(:'stranger');
select is((select count(*) from public.job_locations where job_id in (:'j_open', :'j_live', :'j_done')), 0::bigint, 'stranger: reads no address at all');
select tests.authenticate_anon();
select throws_ok($$ select count(*) from public.job_locations $$, '42501', 'permission denied for table job_locations', 'anon: reads no address at all (refused at the grant since lean E4)');

-- ---------------------------------------------------------------------------
-- §4. job_offers + bids — job_offers_select_party; the bids projection's
--     three SELECT policies. The competing bid must stay invisible.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'owner');
select is((select count(*) from public.job_offers where job_id = :'j_open'), 2::bigint, 'owner: sees both offers on j_open (the ground truth the next four are measured against)');
select tests.authenticate_as(:'worker');
select is((select count(*) from public.job_offers where job_id = :'j_open' and worker_id = :'worker'), 1::bigint, 'worker: sees their own j_open offer');
select is((select count(*) from public.job_offers where job_id = :'j_open' and worker_id = :'bidder'), 0::bigint, 'worker: does NOT see the bidder''s competing offer');
select is((select count(*) from public.bids where job_id = :'j_open' and worker_id = :'bidder'), 0::bigint, 'worker: does NOT see the bidder''s row in the legacy bids projection');
select tests.authenticate_as(:'bidder');
select is((select count(*) from public.job_offers where job_id = :'j_open' and worker_id = :'bidder'), 1::bigint, 'bidder: sees their own j_open offer');
select is((select count(*) from public.job_offers where job_id = :'j_open' and worker_id = :'worker'), 0::bigint, 'bidder: does NOT see the worker''s competing offer');
select tests.authenticate_as(:'stranger');
select is((select count(*) from public.job_offers where job_id in (:'j_open', :'j_live')), 0::bigint, 'stranger: sees no offers');
select is((select count(*) from public.bids where job_id in (:'j_open', :'j_live')), 0::bigint, 'stranger: sees no bids');
select tests.authenticate_anon();
select throws_ok($$ select count(*) from public.job_offers $$, '42501', 'permission denied for table job_offers', 'anon: cannot read job_offers at all');
select throws_ok($$ select count(*) from public.bids $$, '42501', 'permission denied for table bids', 'anon: cannot read bids at all (lean E4)');

-- ---------------------------------------------------------------------------
-- §4a. bids — the DELETE grant (R7b). R7's census of client-writable tables
--      found this the one table in `public` reachable by a client write with
--      no authorization proof: `authenticated` holds DELETE
--      (20260901000000_baseline.sql:7813), RLS is on, and not one of the four
--      policies is FOR DELETE. The grant is therefore real and the command
--      default-denied — every row is unreachable through it. That is asserted
--      here on ONE row, as five identities, rather than inferred from the
--      catalog: the catalog assertions record the shape, the statements
--      record what the shape actually does.
--
--      `bids` is the LEGACY projection, not the live write surface: it is
--      maintained from job_offers by the phase47/48 projection and §1 already
--      proves authenticated holds no INSERT and no UPDATE on it; its dead
--      "workers insert/update own bids" policies went in lean v1 (ruling 52).
-- ---------------------------------------------------------------------------
select tests.clear_auth();
select id as b_live from public.bids where job_id = :'j_live' and worker_id = :'worker' \gset
insert into fx values ('b_live', :'b_live');
select is((select count(*) from public.bids where id = :'b_live'), 1::bigint,
  'runner: the worker''s j_live bid row exists in the projection (the row every DELETE below tries to remove)');

-- The catalog, as fact rather than inference.
select policies_are('public', 'bids', ARRAY[
  'bids_select_job_owner', 'bids_select_own', 'job owner views bids on their job',
  'workers view own bids'],
  'catalog: public.bids carries exactly these four SELECT policies, and NONE for DELETE');
select table_privs_are('public', 'bids', 'authenticated',
  ARRAY['SELECT', 'DELETE'],
  'catalog: authenticated really does hold DELETE on bids (recorded, not inferred), plus SELECT (lean E4 took REFERENCES/TRIGGER/TRUNCATE)');
select table_privs_are('public', 'bids', 'anon',
  '{}'::text[],
  'catalog: anon holds nothing on bids, DELETE included (lean E4)');
select ok((select relrowsecurity from pg_class where oid = 'public.bids'::regclass),
  'catalog: row level security is enabled on bids, so a command with no policy of its own is default-denied');

-- The bidding worker: the row is theirs and they can see it.
select tests.authenticate_as(:'worker');
select is((select count(*) from public.bids where id = :'b_live'), 1::bigint,
  'worker: sees their own j_live bid row (positive control — the row is there to delete)');
with d as (delete from public.bids where id = (select v from fx where k = 'b_live') returning 1)
select is((select count(*) from d), 0::bigint,
  'worker: DELETE of their OWN bid row touches zero rows — the DELETE grant has no policy behind it');
select tests.clear_auth();
select is((select count(*) from public.bids where id = :'b_live'), 1::bigint,
  'runner: the row survived the worker''s DELETE');

-- The job's client: they can see the bid, and still cannot remove it.
select tests.authenticate_as(:'owner');
select is((select count(*) from public.bids where id = :'b_live'), 1::bigint,
  'owner: sees the worker''s bid on their own job (positive control)');
with d as (delete from public.bids where id = (select v from fx where k = 'b_live') returning 1)
select is((select count(*) from d), 0::bigint,
  'owner: DELETE of a bid on their own job touches zero rows');
select tests.clear_auth();
select is((select count(*) from public.bids where id = :'b_live'), 1::bigint,
  'runner: the row survived the owner''s DELETE');

-- The losing bidder: cannot even see the winning bid.
select tests.authenticate_as(:'bidder');
select is((select count(*) from public.bids where id = :'b_live'), 0::bigint,
  'bidder: does NOT see the worker''s winning bid row (no SELECT policy admits them)');
with d as (delete from public.bids where id = (select v from fx where k = 'b_live') returning 1)
select is((select count(*) from d), 0::bigint,
  'bidder: DELETE of the winning bid touches zero rows');
select tests.clear_auth();
select is((select count(*) from public.bids where id = :'b_live'), 1::bigint,
  'runner: the row survived the losing bidder''s DELETE');

-- An unrelated stranger.
select tests.authenticate_as(:'stranger');
select is((select count(*) from public.bids where id = :'b_live'), 0::bigint,
  'stranger: does NOT see the bid row');
with d as (delete from public.bids where id = (select v from fx where k = 'b_live') returning 1)
select is((select count(*) from d), 0::bigint,
  'stranger: DELETE of someone else''s bid touches zero rows');
select tests.clear_auth();
select is((select count(*) from public.bids where id = :'b_live'), 1::bigint,
  'runner: the row survived the stranger''s DELETE');

-- anon: refused at the grant, one step earlier than everyone else.
select tests.authenticate_anon();
select throws_ok($$ delete from public.bids where id = (select v from fx where k = 'b_live') $$,
  '42501', 'permission denied for table bids', 'anon: DELETE from bids is refused outright — anon holds no DELETE grant');
select tests.clear_auth();
select is((select count(*) from public.bids where id = :'b_live'), 1::bigint,
  'runner: the row survived anon''s attempt — five identities, zero deletions');

-- ---------------------------------------------------------------------------
-- §5. Offer RPCs (surface c). Turn, party and author checks in the bodies.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'owner');
select is((select count(*) from public.my_pending_offers() where job_id = :'j_open'), 2::bigint, 'owner: my_pending_offers lists both j_open bids awaiting them');
select tests.authenticate_as(:'bidder');
select is((select count(*) from public.my_pending_offers()), 0::bigint, 'bidder: my_pending_offers lists nothing (their bids await the owner)');
select tests.authenticate_as(:'stranger');
select is((select count(*) from public.my_pending_offers()), 0::bigint, 'stranger: my_pending_offers lists nothing');
select is(public.job_offer_count(:'j_open'), 2, 'stranger: job_offer_count reports the bare bidder count for an open job (readable by design)');

-- accept_offer
select tests.authenticate_as(:'worker');
select throws_ok($$ select public.accept_offer((select v from fx where k = 'o_open_w')) $$,
  'P0001', 'It is not your turn to respond to this offer', 'worker: cannot accept their own bid');
select tests.authenticate_as(:'bidder');
select throws_ok($$ select public.accept_offer((select v from fx where k = 'o_open_w')) $$,
  'P0001', 'Offer not found', 'bidder: cannot accept the worker''s bid (not a party)');
select tests.authenticate_as(:'stranger');
select throws_ok($$ select public.accept_offer((select v from fx where k = 'o_open_w')) $$,
  'P0001', 'Offer not found', 'stranger: cannot accept anyone''s bid');
select tests.authenticate_anon();
select throws_ok($$ select public.accept_offer((select v from fx where k = 'o_open_w')) $$,
  '42501', 'permission denied for function accept_offer', 'anon: cannot execute accept_offer');

-- counter_offer
select tests.authenticate_as(:'bidder');
select throws_ok($$ select public.counter_offer((select v from fx where k = 'o_open_w'), 4000) $$,
  'P0001', 'Offer not found', 'bidder: cannot counter the worker''s bid');
select tests.authenticate_as(:'worker');
select throws_ok($$ select public.counter_offer((select v from fx where k = 'o_open_w'), 4000) $$,
  'P0001', 'It is not your turn to respond to this offer', 'worker: cannot counter their own pending bid');
select tests.authenticate_as(:'stranger');
select throws_ok($$ select public.counter_offer((select v from fx where k = 'o_open_b'), 4000) $$,
  'P0001', 'Offer not found', 'stranger: cannot counter anyone''s bid');
select tests.authenticate_anon();
select throws_ok($$ select public.counter_offer((select v from fx where k = 'o_open_b'), 4000) $$,
  '42501', 'permission denied for function counter_offer', 'anon: cannot execute counter_offer');

-- decline_offer / withdraw_offer
select tests.authenticate_as(:'bidder');
select throws_ok($$ select public.decline_offer((select v from fx where k = 'o_open_w')) $$,
  'P0001', 'Offer not found', 'bidder: cannot decline the worker''s bid');
select throws_ok($$ select public.withdraw_offer((select v from fx where k = 'o_open_w')) $$,
  'P0001', 'Offer not found', 'bidder: cannot withdraw the worker''s bid');
select tests.authenticate_as(:'worker');
select throws_ok($$ select public.decline_offer((select v from fx where k = 'o_open_w')) $$,
  'P0001', 'It is not your turn to respond to this offer', 'worker: cannot decline their own bid (their exit is withdraw)');
select tests.authenticate_as(:'owner');
select throws_ok($$ select public.withdraw_offer((select v from fx where k = 'o_open_w')) $$,
  'P0001', 'Only the person who sent this offer can withdraw it', 'owner: cannot withdraw the worker''s bid (their exit is decline)');
select tests.authenticate_as(:'stranger');
select throws_ok($$ select public.decline_offer((select v from fx where k = 'o_open_w')) $$,
  'P0001', 'Offer not found', 'stranger: cannot decline anyone''s bid');
select throws_ok($$ select public.withdraw_offer((select v from fx where k = 'o_open_w')) $$,
  'P0001', 'Offer not found', 'stranger: cannot withdraw anyone''s bid');
select tests.authenticate_anon();
select throws_ok($$ select public.decline_offer((select v from fx where k = 'o_open_w')) $$,
  '42501', 'permission denied for function decline_offer', 'anon: cannot execute decline_offer');
select throws_ok($$ select public.withdraw_offer((select v from fx where k = 'o_open_w')) $$,
  '42501', 'permission denied for function withdraw_offer', 'anon: cannot execute withdraw_offer');

-- create_offer
select tests.authenticate_as(:'owner');
select throws_ok($$ select public.create_offer(p_amount_cents := 100, p_job_id := (select v from fx where k = 'j_open')) $$,
  'P0001', 'A client cannot bid on their own job', 'owner: cannot bid on their own job');
select tests.authenticate_as(:'stranger');
select throws_ok($$ select public.create_offer(p_amount_cents := 100, p_job_id := (select v from fx where k = 'j_live')) $$,
  'P0001', 'Job is not open', 'stranger: cannot bid on the assigned j_live');
select tests.authenticate_anon();
select throws_ok($$ select public.create_offer(p_amount_cents := 100, p_job_id := (select v from fx where k = 'j_open')) $$,
  '42501', 'permission denied for function create_offer', 'anon: cannot execute create_offer');

-- Positive controls for counter / decline / withdraw, on the same j_open rows.
select tests.authenticate_as(:'owner');
select public.counter_offer(:'o_open_b', 4600) as o_open_b2 \gset
insert into fx values ('o_open_b2', :'o_open_b2');
select is((select awaiting_id from public.job_offers where id = :'o_open_b2'), :'bidder'::uuid, 'owner: counter_offer on the bidder''s bid succeeds and awaits the bidder');
select tests.authenticate_as(:'bidder');
select is((select count(*) from public.my_pending_offers() where id = :'o_open_b2'), 1::bigint, 'bidder: my_pending_offers now shows the counter awaiting them');
select lives_ok($$ select public.decline_offer((select v from fx where k = 'o_open_b2')) $$, 'bidder: decline_offer on the counter awaiting them succeeds');
select is((select status::text from public.job_offers where id = :'o_open_b2'), 'declined', 'bidder: the counter reads declined');
select tests.authenticate_as(:'worker');
select lives_ok($$ select public.withdraw_offer((select v from fx where k = 'o_open_w')) $$, 'worker: withdraw_offer on their own bid succeeds');
select is((select status::text from public.job_offers where id = :'o_open_w'), 'withdrawn', 'worker: their bid reads withdrawn');

-- ---------------------------------------------------------------------------
-- §6. Lifecycle RPCs on j_live: mark_worker_arrival, transition_job_status.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'owner');
select throws_ok($$ select public.mark_worker_arrival((select v from fx where k = 'j_live'), 'en_route') $$,
  'P0001', 'Job not found or not assigned to caller', 'owner: cannot mark arrival on their own job');
select throws_ok($$ select public.transition_job_status((select v from fx where k = 'j_live'), 'in_progress') $$,
  'P0001', 'Job not found or not assigned to caller', 'owner: cannot move their own job''s status');
select tests.authenticate_as(:'bidder');
select throws_ok($$ select public.mark_worker_arrival((select v from fx where k = 'j_live'), 'en_route') $$,
  'P0001', 'Job not found or not assigned to caller', 'bidder: cannot mark arrival on the job they lost');
select throws_ok($$ select public.transition_job_status((select v from fx where k = 'j_live'), 'in_progress') $$,
  'P0001', 'Job not found or not assigned to caller', 'bidder: cannot move the status of the job they lost');
select tests.authenticate_as(:'stranger');
select throws_ok($$ select public.mark_worker_arrival((select v from fx where k = 'j_live'), 'en_route') $$,
  'P0001', 'Job not found or not assigned to caller', 'stranger: cannot mark arrival');
select throws_ok($$ select public.transition_job_status((select v from fx where k = 'j_live'), 'in_progress') $$,
  'P0001', 'Job not found or not assigned to caller', 'stranger: cannot move a status');
select tests.authenticate_as(:'worker');
select throws_ok($$ select public.transition_job_status((select v from fx where k = 'j_open'), 'in_progress') $$,
  'P0001', 'Job not found or not assigned to caller', 'worker: cannot move an UNASSIGNED job (assigned_worker_id null — the phase73 null-safe guard)');
select tests.authenticate_anon();
select throws_ok($$ select public.mark_worker_arrival((select v from fx where k = 'j_live'), 'en_route') $$,
  '42501', 'permission denied for function mark_worker_arrival', 'anon: cannot execute mark_worker_arrival');
select throws_ok($$ select public.transition_job_status((select v from fx where k = 'j_live'), 'in_progress') $$,
  '42501', 'permission denied for function transition_job_status', 'anon: cannot execute transition_job_status');
select tests.authenticate_as(:'worker');
select lives_ok($$ select public.mark_worker_arrival((select v from fx where k = 'j_live'), 'en_route') $$, 'worker: mark_worker_arrival en_route on j_live succeeds');
select tests.clear_auth();
select isnt((select en_route_at from public.jobs where id = :'j_live'), null, 'runner: j_live carries en_route_at after the worker''s call');
select tests.authenticate_as(:'worker');
select lives_ok($$ select public.transition_job_status((select v from fx where k = 'j_live'), 'in_progress') $$, 'worker: transition_job_status j_live -> in_progress succeeds');
select tests.clear_auth();
select is((select status::text from public.jobs where id = :'j_live'), 'in_progress', 'runner: j_live is in_progress after the worker''s call');

-- ---------------------------------------------------------------------------
-- §7. Messaging: messages, direct_threads, message_reads, the conversations
--     view, unsend_message, the read-marker RPC, and the phase66 pre-hire
--     lock.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'owner');
select lives_ok($$ insert into public.messages (job_id, sender_id, content) values ((select v from fx where k = 'j_live'), (select v from fx where k = 'owner'), 'AUTHZ owner message') $$,
  'owner: posts a free-form message on the assigned j_live job thread (positive control for messages)');
select throws_ok($$ insert into public.messages (direct_thread_id, sender_id, content) values ((select v from fx where k = 'dt_ob'), (select v from fx where k = 'owner'), 'pre-hire chat') $$,
  '42501', 'new row violates row-level security policy for table "messages"', 'owner: free-form message to the bidder is refused — no job between them reached assignment (phase66 lock)');
select tests.clear_auth();
select id as m_live_owner from public.messages where job_id = :'j_live' and sender_id = :'owner' and content = 'AUTHZ owner message' \gset
insert into fx values ('m_live_owner', :'m_live_owner');
select tests.authenticate_as(:'worker');
select is((select count(*) from public.messages where id = :'m_live_owner'), 1::bigint, 'worker: reads the owner''s j_live message');
select lives_ok($$ insert into public.messages (direct_thread_id, sender_id, content) values ((select v from fx where k = 'dt_ow'), (select v from fx where k = 'worker'), 'AUTHZ worker pair message') $$,
  'worker: posts a free-form message on the owner-worker pair thread (unlocked by j_live''s assignment)');
select throws_ok($$ insert into public.messages (job_id, sender_id, content) values ((select v from fx where k = 'j_live'), (select v from fx where k = 'owner'), 'impersonation') $$,
  '42501', 'new row violates row-level security policy for table "messages"', 'worker: cannot post a message as the owner (sender_id must be auth.uid())');
select tests.authenticate_as(:'bidder');
select is((select count(*) from public.messages where id = :'m_live_owner'), 0::bigint, 'bidder: does NOT read the j_live job-thread message');
select is((select count(*) from public.messages where direct_thread_id = :'dt_ow'), 0::bigint, 'bidder: does NOT read the owner-worker pair thread');
select ok((select count(*) from public.messages where direct_thread_id = :'dt_ob') >= 1, 'bidder: reads the negotiation events in their own pair thread with the owner');
select throws_ok($$ insert into public.messages (direct_thread_id, sender_id, content) values ((select v from fx where k = 'dt_ob'), (select v from fx where k = 'bidder'), 'pre-hire chat') $$,
  '42501', 'new row violates row-level security policy for table "messages"', 'bidder: free-form message to the owner is refused pre-hire (phase66 lock)');
select throws_ok($$ insert into public.messages (job_id, sender_id, content) values ((select v from fx where k = 'j_live'), (select v from fx where k = 'bidder'), 'lost bidder') $$,
  '42501', 'new row violates row-level security policy for table "messages"', 'bidder: cannot post on the job thread they lost');
-- The policy exempts payload-free negotiation events (job_offer_id set,
-- empty content, no media) from the lock. The exemption is what the lock
-- must not be smuggled through: a structured row that CARRIES text is
-- free-form messaging wearing a costume. (R3b probed the exemption itself
-- and found a party CAN insert an empty fake event row; that is reported,
-- not asserted here — see the run report.)
select throws_ok($$ insert into public.messages (direct_thread_id, sender_id, content, job_offer_id, request_event) values ((select v from fx where k = 'dt_ob'), (select v from fx where k = 'bidder'), 'smuggled text', (select v from fx where k = 'o_open_b'), 'created') $$,
  '42501', 'new row violates row-level security policy for table "messages"', 'bidder: cannot smuggle text through a structured negotiation event pre-hire');
select tests.authenticate_as(:'stranger');
select is((select count(*) from public.messages where id = :'m_live_owner'), 0::bigint, 'stranger: does NOT read the j_live message');
select is((select count(*) from public.messages where direct_thread_id in (:'dt_ow', :'dt_ob')), 0::bigint, 'stranger: reads neither pair thread');
select throws_ok($$ insert into public.messages (job_id, sender_id, content) values ((select v from fx where k = 'j_live'), (select v from fx where k = 'stranger'), 'intrusion') $$,
  '42501', 'new row violates row-level security policy for table "messages"', 'stranger: cannot post on j_live');
select tests.authenticate_anon();
select throws_ok($$ select count(*) from public.messages $$, '42501', 'permission denied for table messages', 'anon: cannot read messages at all (lean E4)');

-- messaging_unlocked, the gate itself
select tests.authenticate_as(:'owner');
select ok(public.messaging_unlocked(p_job_id := :'j_live'), 'owner: messaging_unlocked is true for j_live');
select ok(not public.messaging_unlocked(p_direct_thread_id := :'dt_ob'), 'owner: messaging_unlocked is false for the owner-bidder pair');
select tests.authenticate_as(:'stranger');
select ok(not public.messaging_unlocked(p_job_id := :'j_live'), 'stranger: messaging_unlocked is false for j_live');

-- direct_threads + the read-marker RPC
select tests.authenticate_as(:'owner');
select is((select count(*) from public.direct_threads where id in (:'dt_ow', :'dt_ob')), 2::bigint, 'owner: sees both of their pair threads');
select tests.authenticate_as(:'stranger');
select is((select count(*) from public.direct_threads where id in (:'dt_ow', :'dt_ob')), 0::bigint, 'stranger: sees neither pair thread');
select lives_ok($$ select public.mark_direct_thread_read((select v from fx where k = 'dt_ow')) $$, 'stranger: mark_direct_thread_read on someone else''s thread does not raise…');
select tests.clear_auth();
select ok((select user_a_read_at is null and user_b_read_at is null from public.direct_threads where id = :'dt_ow'), 'runner: …and neither read marker on dt_ow moved');
select tests.authenticate_as(:'owner');
select lives_ok($$ select public.mark_direct_thread_read((select v from fx where k = 'dt_ow')) $$, 'owner: mark_direct_thread_read on their own thread succeeds');
select tests.clear_auth();
select isnt((select case when user_a = :'owner' then user_a_read_at else user_b_read_at end from public.direct_threads where id = :'dt_ow'), null, 'runner: the owner''s own read marker moved');
select is((select case when user_a = :'owner' then user_b_read_at else user_a_read_at end from public.direct_threads where id = :'dt_ow'), null, 'runner: the worker''s read marker did not');
select tests.authenticate_anon();
select throws_ok($$ select count(*) from public.direct_threads $$, '42501', 'permission denied for table direct_threads', 'anon: cannot read threads at all (lean E4)');
select throws_ok($$ select public.mark_direct_thread_read((select v from fx where k = 'dt_ow')) $$,
  '42501', 'permission denied for function mark_direct_thread_read', 'anon: cannot execute mark_direct_thread_read');

-- message_reads (job threads)
select tests.authenticate_as(:'worker');
select lives_ok($$ insert into public.message_reads (user_id, job_id) values ((select v from fx where k = 'worker'), (select v from fx where k = 'j_live')) $$,
  'worker: records their own read marker on j_live');
select is((select count(*) from public.message_reads where job_id = :'j_live' and user_id = :'worker'), 1::bigint, 'worker: sees their own read marker on j_live (message_reads_select_own; the party-read policy went with read ticks)');
select tests.authenticate_as(:'bidder');
select is((select count(*) from public.message_reads where job_id = :'j_live'), 0::bigint, 'bidder: sees no read markers on j_live');
select tests.authenticate_as(:'stranger');
select is((select count(*) from public.message_reads where job_id = :'j_live'), 0::bigint, 'stranger: sees no read markers on j_live');
select throws_ok($$ insert into public.message_reads (user_id, job_id) values ((select v from fx where k = 'worker'), (select v from fx where k = 'j_live')) $$,
  '42501', 'new row violates row-level security policy for table "message_reads"', 'stranger: cannot write a read marker as the worker');
with u as (update public.message_reads set last_read_at = now() where user_id = :'worker' returning 1)
select is((select count(*) from u), 0::bigint, 'stranger: an UPDATE of the worker''s read marker touches zero rows');

-- the conversations view (security_invoker: the base tables'' RLS applies)
select tests.authenticate_as(:'owner');
select is((select count(*) from public.conversations where job_id = :'j_live'), 1::bigint, 'owner: the conversations view lists j_live');
select tests.authenticate_as(:'stranger');
select is((select count(*) from public.conversations where job_id = :'j_live' or direct_thread_id in (:'dt_ow', :'dt_ob')), 0::bigint, 'stranger: the conversations view lists none of them');
select tests.authenticate_anon();
select throws_ok($$ select count(*) from public.conversations $$, '42501', 'permission denied for view conversations', 'anon: cannot read the conversations view at all (lean E4)');

-- conversation states went in lean v1: the RPC anon was refused is gone
select hasnt_function('public', 'set_conversation_state', 'anon: set_conversation_state does not exist (lean v1)');

-- unsend_message
select tests.authenticate_as(:'worker');
select throws_ok($$ select public.unsend_message((select v from fx where k = 'm_live_owner')) $$,
  'P0001', 'You can only unsend your own messages', 'worker: cannot unsend the owner''s message');
select tests.authenticate_as(:'stranger');
select throws_ok($$ select public.unsend_message((select v from fx where k = 'm_live_owner')) $$,
  'P0001', 'You can only unsend your own messages', 'stranger: cannot unsend the owner''s message');
select tests.authenticate_anon();
select throws_ok($$ select public.unsend_message((select v from fx where k = 'm_live_owner')) $$,
  '42501', 'permission denied for function unsend_message', 'anon: cannot execute unsend_message');
select tests.authenticate_as(:'owner');
select lives_ok($$ select public.unsend_message((select v from fx where k = 'm_live_owner')) $$, 'owner: unsend_message on their own message succeeds');
select tests.clear_auth();
select ok((select content = '' and unsent_at is not null from public.messages where id = :'m_live_owner'), 'runner: the owner''s message is blanked and stamped unsent');

-- ---------------------------------------------------------------------------
-- §8 and §9. Live location (slice D6) and the checklist (ruling 49) went in lean v1;
--     the live-location RPC anon was refused is gone.
-- ---------------------------------------------------------------------------
select hasnt_function('public', 'start_live_location', 'start_live_location (anon was refused it) does not exist (lean v1)');

-- ---------------------------------------------------------------------------
-- §10. Money: payments, job_payment_state, the checkout, release and tip
--      RPCs, disputes.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'owner');
select is((select status::text from public.payments where id = :'p_live'), 'held', 'owner (payer): reads j_live''s payment as held');
select is((public.job_payment_state(:'j_live')).status::text, 'held', 'owner: job_payment_state reports held');
select tests.authenticate_as(:'worker');
select is((select status::text from public.payments where id = :'p_live'), 'held', 'worker (payee): reads j_live''s payment as held');
select is((public.job_payment_state(:'j_live')).status::text, 'held', 'worker: job_payment_state reports held');
select throws_ok($$ select public.begin_job_payment((select v from fx where k = 'j_live')) $$,
  'P0001', 'Job not found', 'worker: cannot start checkout on the job they work');
select throws_ok($$ select public.release_job_payment((select v from fx where k = 'j_done')) $$,
  'P0001', 'Job not found', 'worker: cannot release their own payment');
select throws_ok($$ select public.begin_tip_payment((select v from fx where k = 'j_done'), 500) $$,
  'P0001', 'Job not found', 'worker: cannot tip themselves');
select tests.authenticate_as(:'bidder');
select is((select count(*) from public.payments where id in (:'p_live', :'p_done')), 0::bigint, 'bidder: sees no payment rows');
select throws_ok($$ select public.job_payment_state((select v from fx where k = 'j_live')) $$,
  'P0001', 'Job not found', 'bidder: job_payment_state is refused');
select throws_ok($$ select public.begin_job_payment((select v from fx where k = 'j_live')) $$,
  'P0001', 'Job not found', 'bidder: cannot start checkout on the job they lost');
select tests.authenticate_as(:'stranger');
select is((select count(*) from public.payments where id in (:'p_live', :'p_done')), 0::bigint, 'stranger: sees no payment rows');
select throws_ok($$ select public.job_payment_state((select v from fx where k = 'j_live')) $$,
  'P0001', 'Job not found', 'stranger: job_payment_state is refused');
select throws_ok($$ select public.begin_job_payment((select v from fx where k = 'j_live')) $$,
  'P0001', 'Job not found', 'stranger: cannot start checkout');
select throws_ok($$ select public.release_job_payment((select v from fx where k = 'j_done')) $$,
  'P0001', 'Job not found', 'stranger: cannot release a payment');
select throws_ok($$ select public.begin_tip_payment((select v from fx where k = 'j_done'), 500) $$,
  'P0001', 'Job not found', 'stranger: cannot tip on someone else''s job');
select tests.authenticate_anon();
select throws_ok($$ select count(*) from public.payments $$, '42501', 'permission denied for table payments', 'anon: cannot read payments at all');
select throws_ok($$ select public.job_payment_state((select v from fx where k = 'j_live')) $$,
  '42501', 'permission denied for function job_payment_state', 'anon: cannot execute job_payment_state');
select hasnt_function('public', 'sandbox_authorize_job_payment', 'sandbox_authorize_job_payment (anon was refused it) does not exist (ruling 47)');
select hasnt_function('public', 'sandbox_release_job_payment', 'sandbox_release_job_payment (anon was refused it) does not exist (ruling 47)');
select hasnt_function('public', 'sandbox_cash_out', 'sandbox_cash_out (anon was refused it) does not exist (ruling 47)');

-- disputes on j_done, before the release
select tests.authenticate_as(:'worker');
select throws_ok($$ select public.open_job_dispute((select v from fx where k = 'j_done'), 'incomplete', 'worker complaint') $$,
  'P0001', 'Job not found', 'worker: cannot open the customer''s issue report');
select tests.authenticate_as(:'stranger');
select throws_ok($$ select public.open_job_dispute((select v from fx where k = 'j_done'), 'incomplete', 'intrusion') $$,
  'P0001', 'Job not found', 'stranger: cannot open an issue report');
select tests.authenticate_anon();
select throws_ok($$ select public.open_job_dispute((select v from fx where k = 'j_done'), 'incomplete', 'x') $$,
  '42501', 'permission denied for function open_job_dispute', 'anon: cannot execute open_job_dispute');
select tests.authenticate_as(:'owner');
select throws_ok($$ select public.open_job_dispute((select v from fx where k = 'j_live'), 'incomplete', 'too early') $$,
  'P0001', 'An issue can be reported once the work is submitted as complete', 'owner: cannot report an issue before completion');
select (public.open_job_dispute(:'j_done', 'incomplete', 'AUTHZ second shelf missing')).id as d_done \gset
insert into fx values ('d_done', :'d_done');
select is((select count(*) from public.job_disputes where id = :'d_done'), 1::bigint, 'owner: open_job_dispute on j_done succeeds and they read the report');
select throws_ok($$ select public.release_job_payment((select v from fx where k = 'j_done')) $$,
  'P0001', 'An open issue report is holding this payment', 'owner: release is frozen while the report is open');
select tests.authenticate_as(:'worker');
select is((select count(*) from public.job_disputes where id = :'d_done'), 1::bigint, 'worker: reads the report on their job (disputes_select_parties)');
select throws_ok($$ select public.withdraw_job_dispute((select v from fx where k = 'd_done')) $$,
  'P0001', 'Issue report not found', 'worker: cannot withdraw the customer''s report');
select tests.authenticate_as(:'bidder');
select is((select count(*) from public.job_disputes where id = :'d_done'), 0::bigint, 'bidder: does NOT read the report');
select tests.authenticate_as(:'stranger');
select is((select count(*) from public.job_disputes where id = :'d_done'), 0::bigint, 'stranger: does NOT read the report');
select throws_ok($$ select public.withdraw_job_dispute((select v from fx where k = 'd_done')) $$,
  'P0001', 'Issue report not found', 'stranger: cannot withdraw the report');
select tests.authenticate_anon();
select throws_ok($$ select count(*) from public.job_disputes $$, '42501', 'permission denied for table job_disputes', 'anon: cannot read job_disputes at all');
select tests.authenticate_as(:'owner');
select is((public.withdraw_job_dispute(:'d_done')).status::text, 'withdrawn', 'owner: withdraw_job_dispute on their own report succeeds');

-- release, tip
select throws_ok($$ select public.release_job_payment((select v from fx where k = 'j_live')) $$,
  'P0001', 'Funds release only after the job is completed', 'owner: cannot release j_live''s payment before completion (money never moves early)');
select throws_ok($$ select public.begin_tip_payment((select v from fx where k = 'j_live'), 500) $$,
  'P0001', 'Tips are for completed jobs', 'owner: cannot tip before completion');
select is((public.release_job_payment(:'j_done')).release_reason, 'approved', 'owner: release_job_payment on the completed j_done succeeds as approved');
-- the transfer lands (the runner stands in for the webhook), so the tip may follow
select tests.clear_auth();
insert into public.payment_events (id, type, payload)
values ('evt_authz_tr_done', 'transfer.created', jsonb_build_object('id', 'evt_authz_tr_done', 'type', 'transfer.created',
  'data', jsonb_build_object('object', jsonb_build_object('id', 'tr_authz_done', 'metadata', jsonb_build_object('payment_id', :'p_done'::text)))));
select public.apply_payment_event('evt_authz_tr_done');
select tests.authenticate_as(:'owner');
select is((public.begin_tip_payment(:'j_done', 500)).amount_cents, 500, 'owner: begin_tip_payment after release succeeds');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- §11. reviews — create_review, the double-blind reviews_select_party (R8a
--      D1), the profile readers over REVEALED rows only.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'bidder');
select throws_ok($$ select public.create_review((select v from fx where k = 'j_done'), (select v from fx where k = 'worker'), 1, 'sour grapes') $$,
  'P0001', 'Review parties are invalid', 'bidder: cannot review the worker on a job they were not party to');
select tests.authenticate_as(:'stranger');
select throws_ok($$ select public.create_review((select v from fx where k = 'j_done'), (select v from fx where k = 'worker'), 1, 'drive-by') $$,
  'P0001', 'Review parties are invalid', 'stranger: cannot review anyone on j_done');
select tests.authenticate_as(:'worker');
select throws_ok($$ select public.create_review((select v from fx where k = 'j_done'), (select v from fx where k = 'bidder'), 5, 'wrong target') $$,
  'P0001', 'Review parties are invalid', 'worker: cannot review a non-party of the job');
select tests.authenticate_as(:'owner');
select throws_ok($$ select public.create_review((select v from fx where k = 'j_live'), (select v from fx where k = 'worker'), 5, 'too early') $$,
  'P0001', 'Completed job not found', 'owner: cannot review before completion');
select throws_ok($$ insert into public.reviews (job_id, reviewer_id, reviewee_id, rating) values ((select v from fx where k = 'j_done'), (select v from fx where k = 'owner'), (select v from fx where k = 'worker'), 5) $$,
  '42501', 'permission denied for table reviews', 'owner: direct INSERT into reviews is refused (create_review is the path)');
select tests.authenticate_anon();
select throws_ok($$ select public.create_review((select v from fx where k = 'j_done'), (select v from fx where k = 'worker'), 5, 'x') $$,
  '42501', 'permission denied for function create_review', 'anon: cannot execute create_review');
-- The double-blind sequence (R8a D1): the owner's review exists the moment it
-- is written, but its reviewee reads zero rows until the counterpart lands.
select tests.authenticate_as(:'owner');
select (public.create_review(:'j_done', :'worker', 5, 'AUTHZ great work')).id as r_ow \gset
insert into fx values ('r_ow', :'r_ow');
select is((select count(*) from public.reviews where id = :'r_ow'), 1::bigint, 'owner (reviewer): create_review of the worker on j_done succeeds and they read their own while it is blind');
select tests.authenticate_as(:'worker');
select is((select count(*) from public.reviews where id = :'r_ow'), 0::bigint, 'worker (reviewee): reads ZERO rows through the table while the review is blind');
select tests.authenticate_as(:'stranger');
select is((select count(*) from public.profile_reviews(:'worker')), 0::bigint, 'stranger: profile_reviews shows nothing while the only review is blind');
select tests.authenticate_as(:'worker');
select lives_ok($$ select public.create_review((select v from fx where k = 'j_done'), (select v from fx where k = 'owner'), 5, 'AUTHZ great client') $$, 'worker: create_review of the owner succeeds (the counterpart)');
select is((select count(*) from public.reviews where job_id = :'j_done'), 2::bigint, 'worker: the counterpart revealed both — they now read both j_done reviews');
select tests.authenticate_as(:'owner');
select is((select count(*) from public.reviews where job_id = :'j_done'), 2::bigint, 'owner: reads both j_done reviews once mutual');
select tests.authenticate_as(:'bidder');
select is((select count(*) from public.reviews where job_id = :'j_done'), 0::bigint, 'bidder: reads no j_done reviews');
select tests.authenticate_as(:'stranger');
select is((select count(*) from public.reviews where job_id = :'j_done'), 0::bigint, 'stranger: reads no j_done reviews through the table');
select is((select count(*) from public.profile_reviews(:'worker')), 1::bigint, 'stranger: profile_reviews shows only the revealed worker-role review (the counterpart is customer-role, about the owner)');
select is((select total from public.profile_review_summary(:'worker')), 1, 'stranger: profile_review_summary counts it');
select tests.authenticate_anon();
select throws_ok($$ select count(*) from public.reviews $$, '42501', 'permission denied for table reviews', 'anon: cannot read reviews at all (lean E4)');
select throws_ok($$ select * from public.profile_reviews((select v from fx where k = 'worker')) $$,
  '42501', 'permission denied for function profile_reviews', 'anon: cannot execute profile_reviews');

-- ---------------------------------------------------------------------------
-- §12. profiles — column grants, update_my_profile, get_my_profile, modes,
--      account_deletion_blockers.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'stranger');
select is((select full_name from public.profiles where id = :'owner'), 'Olive Owner', 'stranger: reads the owner''s public name (positive control for the column refusals)');
select throws_ok($$ select phone from public.profiles where id = (select v from fx where k = 'owner') $$,
  '42501', 'permission denied for table profiles', 'stranger: cannot read anyone''s phone');
select throws_ok($$ select is_admin from public.profiles where id = (select v from fx where k = 'owner') $$,
  '42501', 'permission denied for table profiles', 'stranger: cannot read is_admin');
select throws_ok($$ select banned from public.profiles where id = (select v from fx where k = 'owner') $$,
  '42501', 'permission denied for table profiles', 'stranger: cannot read banned');
select throws_ok($$ select deleted_at from public.profiles where id = (select v from fx where k = 'owner') $$,
  '42501', 'permission denied for table profiles', 'stranger: cannot read deleted_at');
select throws_ok($$ select stripe_account_id from public.profiles where id = (select v from fx where k = 'owner') $$,
  '42501', 'permission denied for table profiles', 'stranger: cannot read stripe_account_id');
select throws_ok($$ select public.update_my_profile('{"is_admin": true}'::jsonb) $$,
  'P0001', 'Profile update contains a protected or unknown field', 'stranger: update_my_profile cannot grant is_admin');
select throws_ok($$ select public.update_my_profile('{"banned": false}'::jsonb) $$,
  'P0001', 'Profile update contains a protected or unknown field', 'stranger: update_my_profile cannot touch banned');
select throws_ok($$ select public.update_my_profile('{"verification_status": "verified"}'::jsonb) $$,
  'P0001', 'Profile update contains a protected or unknown field', 'stranger: update_my_profile cannot self-verify');
select throws_ok($$ select public.update_my_profile('{"rating_avg": 5}'::jsonb) $$,
  'P0001', 'Profile update contains a protected or unknown field', 'stranger: update_my_profile cannot invent a rating');
select throws_ok($$ select public.update_my_profile('{"deleted_at": null}'::jsonb) $$,
  'P0001', 'Profile update contains a protected or unknown field', 'stranger: update_my_profile cannot touch deleted_at');
select is((select bio from public.update_my_profile('{"bio": "AUTHZ bio"}'::jsonb)), 'AUTHZ bio', 'stranger: update_my_profile changes an allowed field on their own row');
select is((select id from public.get_my_profile()), :'stranger'::uuid, 'stranger: get_my_profile returns their own row');
select is(public.set_active_mode('worker'), 'worker', 'stranger: set_active_mode switches their own mode');
select is(public.get_my_active_mode(), 'worker', 'stranger: get_my_active_mode reads it back');
select is((select count(*) from public.account_deletion_blockers()), 0::bigint, 'stranger: account_deletion_blockers shows nothing — none of the owner''s live work leaks here');
select tests.clear_auth();
select is((select is_admin from public.profiles where id = :'stranger'), false, 'runner: the stranger is still not an admin');
select is((select active_mode from public.profiles where id = :'owner'), 'customer', 'runner: the owner''s mode did not move with the stranger''s');
select tests.authenticate_as(:'owner');
select is(public.get_my_active_mode(), 'customer', 'owner: get_my_active_mode is still customer');
select ok(exists (select 1 from public.account_deletion_blockers() where kind = 'job' and ref_id = :'j_live'), 'owner: account_deletion_blockers names their in-flight j_live');
select tests.authenticate_anon();
select throws_ok($$ select full_name from public.profiles $$, '42501', 'permission denied for table profiles', 'anon: cannot read profiles at all');
select throws_ok($$ select * from public.get_my_profile() $$, '42501', 'permission denied for function get_my_profile', 'anon: cannot execute get_my_profile');
select throws_ok($$ select public.update_my_profile('{"bio": "x"}'::jsonb) $$, '42501', 'permission denied for function update_my_profile', 'anon: cannot execute update_my_profile');
select throws_ok($$ select public.delete_my_account() $$, '42501', 'permission denied for function delete_my_account', 'anon: cannot execute delete_my_account');
select throws_ok($$ select public.set_active_mode('worker') $$, '42501', 'permission denied for function set_active_mode', 'anon: cannot execute set_active_mode');

-- ---------------------------------------------------------------------------
-- §13. Per-user tables: notification_prefs, notification_outbox, push_tokens,
--      legal_acceptances, blocks, worker_services.
-- ---------------------------------------------------------------------------
-- notification_prefs (rows come from the profiles trigger)
select tests.authenticate_as(:'owner');
select is((select count(*) from public.notification_prefs where user_id = :'owner'), 1::bigint, 'owner: reads their own notification prefs');
select is((select count(*) from public.notification_prefs where user_id = :'worker'), 0::bigint, 'owner: does NOT read the worker''s prefs');
with u as (update public.notification_prefs set nearby_radius_miles = 3 where user_id = :'owner' returning 1)
select is((select count(*) from u), 1::bigint, 'owner: updates their own prefs');
with u as (update public.notification_prefs set nearby_radius_miles = 3 where user_id = :'worker' returning 1)
select is((select count(*) from u), 0::bigint, 'owner: an UPDATE of the worker''s prefs touches zero rows');
select throws_ok($$ insert into public.notification_prefs (user_id) values ((select v from fx where k = 'stranger')) $$,
  '42501', 'new row violates row-level security policy for table "notification_prefs"', 'owner: cannot insert prefs for someone else');
select tests.authenticate_anon();
select throws_ok($$ select count(*) from public.notification_prefs $$, '42501', 'permission denied for table notification_prefs', 'anon: cannot read prefs at all (lean E4)');

-- notification_outbox (rows come from the fixture's triggers)
select tests.authenticate_as(:'worker');
select ok((select count(*) from public.notification_outbox where recipient_id = :'worker') >= 1, 'worker: reads their own notification feed (the fixture''s accept notified them)');
select is((select count(*) from public.notification_outbox where recipient_id = :'owner'), 0::bigint, 'worker: does NOT read the owner''s feed');
with u as (update public.notification_outbox set read_at = now() where recipient_id = :'worker' returning 1)
select ok((select count(*) from u) >= 1, 'worker: marks their own feed read');
with u as (update public.notification_outbox set read_at = now() where recipient_id = :'owner' returning 1)
select is((select count(*) from u), 0::bigint, 'worker: an UPDATE of the owner''s feed touches zero rows');
select throws_ok($$ update public.notification_outbox set title = 'forged' where recipient_id = (select v from fx where k = 'worker') $$,
  '42501', 'permission denied for table notification_outbox', 'worker: cannot rewrite a notification''s title (only read_at is granted)');
select tests.authenticate_as(:'stranger');
select is((select count(*) from public.notification_outbox where recipient_id in (:'owner', :'worker')), 0::bigint, 'stranger: reads neither feed');
select tests.authenticate_anon();
select throws_ok($$ select count(*) from public.notification_outbox $$, '42501', 'permission denied for table notification_outbox', 'anon: cannot read notification_outbox at all');

-- push_tokens
select tests.authenticate_as(:'worker');
select lives_ok($$ select public.register_push_token('authz-token-worker', 'ios') $$, 'worker: register_push_token stores their device token');
select is((select count(*) from public.push_tokens where user_id = :'worker'), 1::bigint, 'worker: reads their own token');
select tests.authenticate_as(:'stranger');
select is((select count(*) from public.push_tokens where user_id = :'worker'), 0::bigint, 'stranger: does NOT read the worker''s token');
select throws_ok($$ insert into public.push_tokens (user_id, token) values ((select v from fx where k = 'worker'), 'planted') $$,
  '42501', 'new row violates row-level security policy for table "push_tokens"', 'stranger: cannot plant a token on the worker');
with d as (delete from public.push_tokens where user_id = :'worker' returning 1)
select is((select count(*) from d), 0::bigint, 'stranger: a DELETE of the worker''s token touches zero rows');
select tests.authenticate_anon();
select throws_ok($$ select count(*) from public.push_tokens $$, '42501', 'permission denied for table push_tokens', 'anon: cannot read tokens at all (lean E4)');
select throws_ok($$ select public.register_push_token('anon-token', 'ios') $$, '42501', 'permission denied for function register_push_token', 'anon: cannot execute register_push_token');

-- legal_acceptances
select tests.authenticate_as(:'owner');
select is(public.accept_legal_documents('[{"document": "terms", "version": "2026-01"}]'::jsonb), 1, 'owner: accept_legal_documents records their acceptance');
select is((select count(*) from public.legal_acceptances where user_id = :'owner'), 1::bigint, 'owner: reads their own acceptance');
select tests.authenticate_as(:'stranger');
select is((select count(*) from public.legal_acceptances where user_id = :'owner'), 0::bigint, 'stranger: does NOT read the owner''s acceptance');
select throws_ok($$ insert into public.legal_acceptances (user_id, document, version) values ((select v from fx where k = 'owner'), 'privacy', 'forged') $$,
  '42501', 'new row violates row-level security policy for table "legal_acceptances"', 'stranger: cannot record an acceptance for the owner');
select tests.authenticate_anon();
select throws_ok($$ select public.accept_legal_documents('[]'::jsonb) $$, '42501', 'permission denied for function accept_legal_documents', 'anon: cannot execute accept_legal_documents');

-- blocks (the app inserts through blocks_insert_own; blocks_delete_own unblocks)
select tests.authenticate_as(:'stranger');
select lives_ok($$ insert into public.blocks (blocker_id, blocked_id) values ((select v from fx where k = 'stranger'), (select v from fx where k = 'admin')) $$, 'stranger: blocks the admin');
select is((select count(*) from public.blocks where blocker_id = :'stranger' and blocked_id = :'admin'), 1::bigint, 'stranger: reads their own block');
select tests.authenticate_as(:'admin');
select is((select count(*) from public.blocks where blocker_id = :'stranger' and blocked_id = :'admin'), 1::bigint, 'admin (the blocked): can see the block involving them (blocks_select_involved, by design)');
select tests.authenticate_as(:'bidder');
select is((select count(*) from public.blocks where blocker_id = :'stranger'), 0::bigint, 'bidder: does NOT see the stranger''s block');
select throws_ok($$ insert into public.blocks (blocker_id, blocked_id) values ((select v from fx where k = 'stranger'), (select v from fx where k = 'owner')) $$,
  '42501', 'new row violates row-level security policy for table "blocks"', 'bidder: cannot block on the stranger''s behalf');
with d as (delete from public.blocks where blocker_id = :'stranger' returning 1)
select is((select count(*) from d), 0::bigint, 'bidder: a DELETE of the stranger''s block touches zero rows');
select hasnt_function('public', 'set_block', 'set_block (anon was refused it) does not exist (slice D6)');
select tests.authenticate_as(:'stranger');
with d as (delete from public.blocks where blocker_id = :'stranger' and blocked_id = :'admin' returning 1)
select is((select count(*) from d), 1::bigint, 'stranger: unblocks the admin through blocks_delete_own');

-- worker_services
select tests.authenticate_as(:'worker');
select lives_ok($$ insert into public.worker_services (worker_id, title, category, price_cents, published) values ((select v from fx where k = 'worker'), 'AUTHZ mounting', 'tv_mounting', 8000, true) $$, 'worker: publishes a service');
select lives_ok($$ insert into public.worker_services (worker_id, title, category, published) values ((select v from fx where k = 'worker'), 'AUTHZ draft', 'other', false) $$, 'worker: keeps a service draft');
select is((select count(*) from public.worker_services where worker_id = :'worker'), 2::bigint, 'worker: reads both of their services');
select tests.authenticate_as(:'stranger');
select is((select count(*) from public.worker_services where worker_id = :'worker'), 1::bigint, 'stranger: reads only the published service');
select throws_ok($$ insert into public.worker_services (worker_id, title, category) values ((select v from fx where k = 'worker'), 'planted', 'other') $$,
  '42501', 'new row violates row-level security policy for table "worker_services"', 'stranger: cannot add a service to the worker');
with u as (update public.worker_services set price_cents = 1 where worker_id = :'worker' returning 1)
select is((select count(*) from u), 0::bigint, 'stranger: an UPDATE of the worker''s services touches zero rows');
select tests.authenticate_anon();
select throws_ok($$ select count(*) from public.worker_services $$, '42501', 'permission denied for table worker_services', 'anon: cannot read worker_services at all');

-- ---------------------------------------------------------------------------
-- §14. Discovery reads: jobs_within_radius, jobs_in_cell, job_hotspots,
--      client_job_stats, worker_job_stats. Approximate location only, open
--      jobs only.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'stranger');
select is((select count(*) from public.jobs_within_radius(10.1234, 10.1234, 1) r where r.id = :'j_open'), 1::bigint, 'stranger: jobs_within_radius lists the open j_open');
select is((select count(*) from public.jobs_within_radius(10.1234, 10.1234, 1) r where r.id = :'j_live'), 0::bigint, 'stranger: jobs_within_radius does NOT list the assigned j_live at the same coordinates');
select ok(pg_get_function_result('public.jobs_within_radius(double precision, double precision, double precision)'::regprocedure) !~* 'address|lat|lng|access_notes',
  'jobs_within_radius returns no exact-address, coordinate or access-note column');
select ok(pg_get_function_result('public.jobs_in_cell(bigint, bigint)'::regprocedure) !~* 'address|lat|lng|access_notes',
  'jobs_in_cell returns no exact-address, coordinate or access-note column');
select is((select count(*) from public.jobs_in_cell(floor(10.1234 / (0.27 / 69.0))::bigint, floor(10.1234 / (0.27 / (69.0 * cos(radians(40.7128)))))::bigint) c where c.id = :'j_open'), 1::bigint,
  'stranger: jobs_in_cell lists j_open in its cell');
select is((select count(*) from public.jobs_in_cell(floor(10.1234 / (0.27 / 69.0))::bigint, floor(10.1234 / (0.27 / (69.0 * cos(radians(40.7128)))))::bigint) c where c.id = :'j_live'), 0::bigint,
  'stranger: jobs_in_cell does NOT list the assigned j_live in the same cell');
select is((select job_count from public.job_hotspots() h where h.ilat = floor(10.1234 / (0.27 / 69.0))::bigint and h.ilng = floor(10.1234 / (0.27 / (69.0 * cos(radians(40.7128)))))::bigint), 1,
  'stranger: job_hotspots counts exactly one job in the fixture cell — j_open, not the assigned j_live beside it');
select is((select completed from public.client_job_stats(:'owner')), 1::bigint, 'stranger: client_job_stats counts the owner''s one completed job (an aggregate, by design)');
select is((select job_count from public.worker_job_stats(:'worker') where category = 'moving'), 1, 'stranger: worker_job_stats counts the worker''s completed moving job (an aggregate, by design)');
select tests.authenticate_anon();
select throws_ok($$ select * from public.jobs_within_radius(10.1234, 10.1234, 1) $$, '42501', 'permission denied for function jobs_within_radius', 'anon: cannot execute jobs_within_radius');
select throws_ok($$ select * from public.job_hotspots() $$, '42501', 'permission denied for function job_hotspots', 'anon: cannot execute job_hotspots');

-- ---------------------------------------------------------------------------
-- §15. Editing and deleting a job: update_job_details, can_delete_own_job,
--      jobs_delete_own — on j_del (no bids) and j_open (bids).
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'stranger');
select throws_ok($$ select public.update_job_details((select v from fx where k = 'j_del'), 'hijacked', 'hijacked', 'other', 'x') $$,
  'P0001', 'Only the job poster can edit this job', 'stranger: cannot edit the owner''s job');
select ok(not public.can_delete_own_job(:'j_del'), 'stranger: can_delete_own_job is false for the owner''s job');
with d as (delete from public.jobs where id = :'j_del' returning 1)
select is((select count(*) from d), 0::bigint, 'stranger: a DELETE of the owner''s job touches zero rows');
select tests.authenticate_as(:'worker');
select throws_ok($$ select public.update_job_details((select v from fx where k = 'j_open'), 'hijacked', 'hijacked', 'other', 'x') $$,
  'P0001', 'Only the job poster can edit this job', 'worker: cannot edit a job they bid on');
select tests.authenticate_anon();
select throws_ok($$ select public.update_job_details((select v from fx where k = 'j_del'), 'x', 'x', 'other', 'x') $$,
  '42501', 'permission denied for function update_job_details', 'anon: cannot execute update_job_details');
select tests.authenticate_as(:'owner');
select throws_ok($$ select public.update_job_details((select v from fx where k = 'j_open'), 'edited', 'edited', 'other', 'x') $$,
  'P0001', 'Jobs with bids can no longer be edited', 'owner: cannot edit j_open once it has bids');
select is((public.update_job_details(:'j_del', 'AUTHZ edited', 'fixture, rolled back', 'errands', 'Open water', 1200)).title, 'AUTHZ edited', 'owner: update_job_details on the bid-free j_del succeeds');
select ok(not public.can_delete_own_job(:'j_open'), 'owner: can_delete_own_job is false for j_open (it has bids)');
select ok(public.can_delete_own_job(:'j_del'), 'owner: can_delete_own_job is true for j_del');
with d as (delete from public.jobs where id = :'j_del' returning 1)
select is((select count(*) from d), 1::bigint, 'owner: deletes j_del through jobs_delete_own');

-- ---------------------------------------------------------------------------
-- §16. The admin surface: reports, admin_open_reports, ban_user, unban_user,
--      banned_phones. Runs last because the ban touches the bidder.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'owner');
select throws_ok($$ insert into public.reports (reporter_id, reported_id, job_id, reason, description) values ((select v from fx where k = 'owner'), (select v from fx where k = 'bidder'), (select v from fx where k = 'j_open'), 'other', 'AUTHZ report') returning id $$,
  '42501', 'new row violates row-level security policy for table "reports"', 'owner (the reporter): cannot RETURN the report they file — reports are admin-read-only, so RETURNING fails the SELECT policy');
select lives_ok($$ insert into public.reports (reporter_id, reported_id, job_id, reason, description) values ((select v from fx where k = 'owner'), (select v from fx where k = 'bidder'), (select v from fx where k = 'j_open'), 'other', 'AUTHZ report') $$,
  'owner: files a report about the bidder (reports_insert_own, no RETURNING)');
select tests.clear_auth();
select id as rep_1 from public.reports where reporter_id = :'owner' and reported_id = :'bidder' and description = 'AUTHZ report' \gset
insert into fx values ('rep_1', :'rep_1');
select tests.authenticate_as(:'owner');
select is((select count(*) from public.reports where id = :'rep_1'), 0::bigint, 'owner (the reporter): cannot read back their own report — reports are admin-read-only, by design');
select throws_ok($$ select public.ban_user((select v from fx where k = 'bidder')) $$, 'P0001', 'Only admins may ban users', 'owner: cannot ban');
select throws_ok($$ select public.unban_user((select v from fx where k = 'bidder')) $$, 'P0001', 'Only admins may unban users', 'owner: cannot unban');
select is((select count(*) from public.admin_open_reports()), 0::bigint, 'owner: admin_open_reports returns nothing');
select tests.authenticate_as(:'stranger');
select throws_ok($$ insert into public.reports (reporter_id, reported_id, reason) values ((select v from fx where k = 'owner'), (select v from fx where k = 'worker'), 'scam') $$,
  '42501', 'new row violates row-level security policy for table "reports"', 'stranger: cannot file a report in the owner''s name');
select is((select count(*) from public.reports where id = :'rep_1'), 0::bigint, 'stranger: does NOT read the report');
with u as (update public.reports set status = 'dismissed' where id = :'rep_1' returning 1)
select is((select count(*) from u), 0::bigint, 'stranger: an UPDATE of the report touches zero rows');
select throws_ok($$ select public.ban_user((select v from fx where k = 'bidder')) $$, 'P0001', 'Only admins may ban users', 'stranger: cannot ban');
select throws_ok($$ select public.unban_user((select v from fx where k = 'bidder')) $$, 'P0001', 'Only admins may unban users', 'stranger: cannot unban');
select is((select count(*) from public.admin_open_reports()), 0::bigint, 'stranger: admin_open_reports returns nothing');
select tests.authenticate_anon();
select throws_ok($$ select public.ban_user((select v from fx where k = 'bidder')) $$, '42501', 'permission denied for function ban_user', 'anon: cannot execute ban_user');
select throws_ok($$ select * from public.admin_open_reports() $$, '42501', 'permission denied for function admin_open_reports', 'anon: cannot execute admin_open_reports');
select tests.authenticate_as(:'bidder');
select lives_ok($$ select public.update_my_profile('{"phone": "+15550001111"}'::jsonb) $$, 'bidder: sets a phone number (so the ban below has one to record)');
select tests.authenticate_as(:'admin');
select is((select count(*) from public.reports where id = :'rep_1'), 1::bigint, 'admin: reads the report (reports_select_admin)');
select is((select count(*) from public.admin_open_reports() r where r.id = :'rep_1'), 1::bigint, 'admin: admin_open_reports lists it');
select lives_ok($$ select public.ban_user((select v from fx where k = 'bidder'), (select v from fx where k = 'rep_1')) $$, 'admin: ban_user on the bidder succeeds');
select tests.clear_auth();
select ok(not public.is_profile_active(:'bidder'), 'runner: the bidder is no longer active after the ban');
select is((select status from public.reports where id = :'rep_1'), 'actioned', 'runner: the report is marked actioned');
select is((select count(*) from public.banned_phones where banned_profile_id = :'bidder'), 1::bigint, 'runner: the bidder''s phone was recorded in banned_phones');
select tests.authenticate_as(:'admin');
select is((select count(*) from public.banned_phones where banned_profile_id = :'bidder'), 0::bigint, 'admin: banned_phones has no SELECT policy, so even an admin reads zero rows through the table');
select tests.authenticate_anon();
select throws_ok($$ select count(*) from public.banned_phones $$, '42501', 'permission denied for table banned_phones', 'anon: cannot read banned phones at all (lean E4)');
select tests.authenticate_as(:'bidder');
select throws_ok($$ select public.create_offer(p_amount_cents := 100, p_job_id := (select v from fx where k = 'j_open')) $$,
  'P0001', 'Active authentication required', 'bidder (banned): can no longer bid — is_active_user() gates the RPC');
select tests.authenticate_as(:'admin');
select lives_ok($$ select public.unban_user((select v from fx where k = 'bidder')) $$, 'admin: unban_user on the bidder succeeds');
select tests.clear_auth();
select ok(public.is_profile_active(:'bidder'), 'runner: the bidder is active again');
select is((select count(*) from public.banned_phones where banned_profile_id = :'bidder'), 0::bigint, 'runner: the banned_phones row is gone');

-- ---------------------------------------------------------------------------
-- §17. The SECURITY DEFINER grant contract, as an allow-list. Every function
--      anon or authenticated may execute is named here, so a new grant fails
--      this test until someone adds it on purpose. The deprecated shims are
--      gone (ruling 46) and pinned absent so they cannot come back.
-- ---------------------------------------------------------------------------
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')),
  '',
  'anon may execute no SECURITY DEFINER function (lean E4 revoked review_is_revealed, the last one: anon holds no grant on reviews, so the reviews SELECT policy never evaluates for anon)');
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  'accept_legal_documents, accept_offer, account_deletion_blockers, admin_open_reports, ban_user, begin_job_payment, begin_tip_payment, can_delete_own_job, cancel_job, client_job_stats, counter_offer, create_job, create_offer, create_review, current_fee, current_user_is_admin, current_user_is_banned, decline_offer, delete_my_account, drop_series_worker, get_my_active_mode, get_my_profile, is_active_user, is_blocked_between, is_profile_active, job_hotspots, job_offer_count, job_offer_counts, job_payment_state, jobs_in_cell, jobs_within_radius, mark_direct_thread_read, mark_worker_arrival, messaging_unlocked, my_payouts_status, my_pending_offers, open_job_dispute, profile_review_summaries, profile_review_summary, profile_reviews, quote_job_price, register_push_token, release_job_payment, report_running_late, review_is_revealed, set_active_mode, start_job_series, stop_job_series, transition_job_status, unban_user, unsend_message, update_job_details, update_my_profile, withdraw_job_dispute, withdraw_offer, worker_job_stats',
  'the SECURITY DEFINER functions authenticated may execute are exactly this list (R4 added begin_job_payment, begin_tip_payment, cancel_job, current_fee, quote_job_price, release_job_payment; R5b added my_payouts_status; R8a added review_is_revealed; n6 added profile_review_summaries — the batch per-role revealed summary, any signed-in user, refused to anon, proven in 120_reputation_batch.sql §10; idea 5 (2026-09-30) added report_running_late — the hired worker only, before arriving, refused to anon, proven in 150_running_late.sql §5-§8; idea 14 (2026-09-30) added start_job_series, stop_job_series and drop_series_worker — the customer''s own job / series, the series'' worker, refused to anon, proven in 180_job_series.sql §1-§2, §10-§11; lean v1 (20261108000000) removed thirty: the cut features'' RPCs, the sandbox money RPCs, the deprecated shims and the probe markers; lean E4 (20261108010000) removed should_notify and job_request_parties_ok, whose only callers are definer functions, proven in 310_grants.sql)');
select ok(has_function_privilege('service_role', 'public.claim_notification_batch(integer)', 'EXECUTE'), 'service_role may execute claim_notification_batch (positive control for the two refusals below)');
-- R4: the service-role-only money functions, same pattern — the positive
-- control is service_role's privilege, the proof is the stranger's refusal.
select ok(has_function_privilege('service_role', 'public.apply_payment_event(text)', 'EXECUTE'), 'service_role may execute apply_payment_event (positive control)');
select ok(has_function_privilege('service_role', 'public.attach_provider_ref(uuid, text)', 'EXECUTE'), 'service_role may execute attach_provider_ref (positive control)');
select ok(has_function_privilege('service_role', 'public.set_payouts_enabled(text, boolean)', 'EXECUTE'), 'service_role may execute set_payouts_enabled (positive control)');
select ok(has_function_privilege('service_role', 'public.resolve_job_dispute(uuid, text, text)', 'EXECUTE'), 'service_role may execute resolve_job_dispute (positive control)');
select ok(has_function_privilege('service_role', 'public.expire_unfunded_payments()', 'EXECUTE'), 'service_role may execute expire_unfunded_payments (positive control)');
select ok(has_function_privilege('service_role', 'public.auto_release_due_payments()', 'EXECUTE'), 'service_role may execute auto_release_due_payments (positive control)');
select tests.authenticate_as(:'stranger');
select throws_ok($$ select * from public.claim_notification_batch(1) $$, '42501', 'permission denied for function claim_notification_batch', 'stranger: cannot claim the push queue (service_role only)');
select throws_ok($$ select public.resolve_notification(gen_random_uuid(), 'sent') $$, '42501', 'permission denied for function resolve_notification', 'stranger: cannot resolve queue rows (service_role only)');
select throws_ok($$ select public.apply_payment_event('authz-forged') $$, '42501', 'permission denied for function apply_payment_event', 'stranger: cannot apply a provider event (service_role only)');
select throws_ok($$ select public.attach_provider_ref(gen_random_uuid(), 'pi_forged') $$, '42501', 'permission denied for function attach_provider_ref', 'stranger: cannot attach a provider reference (service_role only)');
select throws_ok($$ select public.set_payouts_enabled('acct_forged', true) $$, '42501', 'permission denied for function set_payouts_enabled', 'stranger: cannot flip payouts_enabled (service_role only)');
select throws_ok($$ select public.resolve_job_dispute((select v from fx where k = 'j_done'), 'worker', 'forged') $$, '42501', 'permission denied for function resolve_job_dispute', 'stranger: cannot resolve an issue report (service_role only)');
select throws_ok($$ select public.expire_unfunded_payments() $$, '42501', 'permission denied for function expire_unfunded_payments', 'stranger: cannot expire unfunded payments (service_role only)');
select throws_ok($$ select public.auto_release_due_payments() $$, '42501', 'permission denied for function auto_release_due_payments', 'stranger: cannot run the auto-release clock (service_role only)');
select throws_ok($$ select public.enqueue_notification((select v from fx where k = 'owner'), (select v from fx where k = 'stranger'), 'messages', 'message', 'forged', 'forged', '{}'::jsonb, 'authz-forged') $$,
  '42501', 'permission denied for function enqueue_notification', 'stranger: cannot enqueue a notification directly (the phase69 chain stays closed)');
select throws_ok($$ select public.ensure_direct_thread((select v from fx where k = 'owner'), (select v from fx where k = 'stranger')) $$,
  '42501', 'permission denied for function ensure_direct_thread', 'stranger: cannot open a thread with the owner by calling the internal helper');
select throws_ok($$ select public.drain_notification_outbox() $$, '42501', 'permission denied for function drain_notification_outbox', 'stranger: cannot drain the outbox');
select tests.clear_auth();
select hasnt_function('public', 'accept_bid', 'the accept_bid shim does not exist — accept_offer is the only assignment path (CLAUDE.md, ruling 46)');
select hasnt_function('public', 'respond_job_request', 'the respond_job_request shim does not exist (CLAUDE.md, ruling 46)');


-- ---------------------------------------------------------------------------
-- §18. storage.objects — the media surface (R7b). The second table R7's
--      census found client-writable without an authorization proof:
--      `grant all on storage.objects to authenticated` AND `to anon`
--      (20260901000000_baseline.sql:8640-8641), with fifteen policies across
--      five buckets that this file had never mentioned. Every privilege a
--      client holds here is therefore RLS's to withhold, and nothing else's.
--
--      Lean v1 (20261108000000) dropped the chat-audio and chat-documents
--      policies with voice and document messages. Eleven remain: eight writes
--      (four INSERT, one UPDATE, three DELETE) and three SELECT.
--
--      The bucket ROWS are storage data, not schema: the baseline is a
--      schema-only dump, so a fresh stack has none. 20261108010000_lean_v1_grants.sql
--      creates the three the policies name (seed.sql keeps a backstop), which is why the behaviour half below can
--      run at all — and why `npm run db:reset` must precede `npm run db:test`.
--      phase29_security_contract.sql's conditional skip closes for the same
--      reason.
-- ---------------------------------------------------------------------------
select tests.clear_auth();
select policies_are('storage', 'objects', ARRAY[
  'avatars_insert', 'avatars_read', 'avatars_update',
  'chat_photos_insert_party', 'chat_photos_read_party',
  'job_photos_delete_own_completion', 'job_photos_delete_own_posting', 'job_photos_delete_own_review',
  'job_photos_insert', 'job_photos_insert_review', 'job_photos_read'],
  'catalog: storage.objects carries exactly these eleven policies — eight writes and three reads, across three buckets');

-- The eight write policies: command and roles, one assertion each.
select policy_cmd_is('storage', 'objects', 'avatars_insert', 'INSERT', 'catalog: avatars_insert is FOR INSERT');
select policy_cmd_is('storage', 'objects', 'avatars_update', 'UPDATE', 'catalog: avatars_update is FOR UPDATE');
select policy_cmd_is('storage', 'objects', 'chat_photos_insert_party', 'INSERT', 'catalog: chat_photos_insert_party is FOR INSERT');
select policy_cmd_is('storage', 'objects', 'job_photos_insert', 'INSERT', 'catalog: job_photos_insert is FOR INSERT');
select policy_cmd_is('storage', 'objects', 'job_photos_insert_review', 'INSERT', 'catalog: job_photos_insert_review is FOR INSERT');
select policy_cmd_is('storage', 'objects', 'job_photos_delete_own_completion', 'DELETE', 'catalog: job_photos_delete_own_completion is FOR DELETE');
select policy_cmd_is('storage', 'objects', 'job_photos_delete_own_posting', 'DELETE', 'catalog: job_photos_delete_own_posting is FOR DELETE');
select policy_cmd_is('storage', 'objects', 'job_photos_delete_own_review', 'DELETE', 'catalog: job_photos_delete_own_review is FOR DELETE');
select policy_roles_are('storage', 'objects', 'avatars_insert', ARRAY['authenticated']::name[], 'catalog: avatars_insert admits authenticated only');
select policy_roles_are('storage', 'objects', 'avatars_update', ARRAY['authenticated']::name[], 'catalog: avatars_update admits authenticated only');
select policy_roles_are('storage', 'objects', 'chat_photos_insert_party', ARRAY['authenticated']::name[], 'catalog: chat_photos_insert_party admits authenticated only');
select policy_roles_are('storage', 'objects', 'job_photos_insert', ARRAY['authenticated']::name[], 'catalog: job_photos_insert admits authenticated only');
select policy_roles_are('storage', 'objects', 'job_photos_insert_review', ARRAY['authenticated']::name[], 'catalog: job_photos_insert_review admits authenticated only');
select policy_roles_are('storage', 'objects', 'job_photos_delete_own_completion', ARRAY['authenticated']::name[], 'catalog: job_photos_delete_own_completion admits authenticated only');
select policy_roles_are('storage', 'objects', 'job_photos_delete_own_posting', ARRAY['authenticated']::name[], 'catalog: job_photos_delete_own_posting admits authenticated only');
select policy_roles_are('storage', 'objects', 'job_photos_delete_own_review', ARRAY['authenticated']::name[], 'catalog: job_photos_delete_own_review admits authenticated only');
select table_privs_are('storage', 'objects', 'anon',
  ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REFERENCES', 'TRIGGER', 'TRUNCATE'],
  'catalog: anon holds every table privilege on storage.objects — no policy admits it, so RLS is the whole boundary');
select table_privs_are('storage', 'objects', 'authenticated',
  ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REFERENCES', 'TRIGGER', 'TRUNCATE'],
  'catalog: authenticated holds every table privilege on storage.objects — likewise');
select ok((select relrowsecurity from pg_class where oid = 'storage.objects'::regclass),
  'catalog: row level security is enabled on storage.objects (without it those grants would be unrestricted)');

-- The bucket rows the policies name, and the control that the behaviour half
-- below is measuring something real.
select is((select count(*) from storage.buckets where id in ('avatars', 'chat-photos', 'job-photos')), 3::bigint,
  'runner: all three buckets the policies name exist (20261108010000_lean_v1_grants.sql; seed.sql backstop) — the behaviour half below is live, not vacuous');

-- avatars: own folder only, but readable by every account.
select tests.authenticate_as(:'worker');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('avatars', (select v from fx where k = 'worker')::text || '/authz-avatar.jpg') $$,
  'worker: writes an avatar into their OWN folder (positive control for every avatars refusal below)');
select tests.authenticate_as(:'stranger');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('avatars', (select v from fx where k = 'worker')::text || '/authz-hijack.jpg') $$,
  '42501', 'new row violates row-level security policy for table "objects"', 'stranger: cannot write into the worker''s avatar folder');
select is((select count(*) from storage.objects where bucket_id = 'avatars'), 1::bigint,
  'stranger: CAN read the worker''s avatar — avatars_read carries no ownership clause, so avatars are readable by every account by design');
with u as (update storage.objects set metadata = '{}'::jsonb where bucket_id = 'avatars' returning 1)
select is((select count(*) from u), 0::bigint, 'stranger: an UPDATE of the worker''s avatar touches zero rows');
select tests.authenticate_as(:'worker');
with u as (update storage.objects set metadata = '{}'::jsonb where bucket_id = 'avatars' returning 1)
select is((select count(*) from u), 1::bigint, 'worker: an UPDATE of their OWN avatar touches one row (avatars_update, the positive control for the refusal above)');
select tests.authenticate_anon();
select is((select count(*) from storage.objects where bucket_id = 'avatars'), 0::bigint, 'anon: reads no avatar (every policy here admits authenticated only)');

-- chat-photos: <job>/<uploader>/… , both parties to an assigned job.
select tests.authenticate_as(:'worker');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('chat-photos', (select v from fx where k = 'j_live')::text || '/' || (select v from fx where k = 'worker')::text || '/authz.jpg') $$,
  'worker: writes a chat photo into j_live''s thread, under their own uid (positive control)');
select tests.authenticate_as(:'owner');
select is((select count(*) from storage.objects where bucket_id = 'chat-photos'), 1::bigint,
  'owner: reads the worker''s chat photo — the other party to the assigned job');
select tests.authenticate_as(:'bidder');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('chat-photos', (select v from fx where k = 'j_live')::text || '/' || (select v from fx where k = 'bidder')::text || '/authz.jpg') $$,
  '42501', 'new row violates row-level security policy for table "objects"', 'bidder: cannot write a chat photo into the job they lost');
select is((select count(*) from storage.objects where bucket_id = 'chat-photos'), 0::bigint, 'bidder: reads no chat photo from the job they lost');
select tests.authenticate_as(:'stranger');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('chat-photos', (select v from fx where k = 'j_live')::text || '/' || (select v from fx where k = 'stranger')::text || '/authz.jpg') $$,
  '42501', 'new row violates row-level security policy for table "objects"', 'stranger: cannot write a chat photo into j_live');
select is((select count(*) from storage.objects where bucket_id = 'chat-photos'), 0::bigint, 'stranger: reads no chat photo');

-- job-photos: three write paths — postings/<uid>/…, <job>/… for the assigned
-- worker, reviews/<uid>/… — and one bucket-wide read.
select tests.authenticate_as(:'owner');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('job-photos', 'postings/' || (select v from fx where k = 'owner')::text || '/authz.jpg') $$,
  'owner: writes a posting photo under their own uid (positive control)');
select tests.authenticate_as(:'worker');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('job-photos', (select v from fx where k = 'j_live')::text || '/authz-done.jpg') $$,
  'worker: writes a completion photo on j_live, the job assigned to them (positive control)');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('job-photos', 'reviews/' || (select v from fx where k = 'worker')::text || '/authz.jpg') $$,
  'worker: writes a review photo under their own uid (positive control)');
select tests.authenticate_as(:'stranger');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('job-photos', 'postings/' || (select v from fx where k = 'owner')::text || '/authz-intrusion.jpg') $$,
  '42501', 'new row violates row-level security policy for table "objects"', 'stranger: cannot write into the owner''s postings folder');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('job-photos', (select v from fx where k = 'j_live')::text || '/authz-intrusion.jpg') $$,
  '42501', 'new row violates row-level security policy for table "objects"', 'stranger: cannot write a completion photo on a job they are not assigned to');
select tests.authenticate_as(:'bidder');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('job-photos', (select v from fx where k = 'j_live')::text || '/authz-bidder.jpg') $$,
  '42501', 'new row violates row-level security policy for table "objects"', 'bidder: cannot write a completion photo on the job they lost');
select tests.authenticate_as(:'stranger');
select is((select count(*) from storage.objects where bucket_id = 'job-photos'), 3::bigint,
  'stranger: CAN read all three job photos — job_photos_read carries no ownership clause, so job photos are readable by every account by design');
with u as (update storage.objects set metadata = '{}'::jsonb where bucket_id = 'job-photos' returning 1)
select is((select count(*) from u), 0::bigint, 'stranger: an UPDATE of a job photo touches zero rows (no UPDATE policy covers this bucket at all)');

-- DELETE: the three job_photos_delete_* policies are unreachable from SQL.
-- storage''s own protect_objects_delete trigger (storage.protect_delete)
-- refuses every direct DELETE before RLS is consulted, for the row''s owner
-- as flatly as for a stranger. Deletion is the Storage API''s alone, and
-- these assertions are the fence that says so if that ever changes.
select tests.authenticate_as(:'owner');
select throws_ok($$ delete from storage.objects where bucket_id = 'job-photos' $$,
  '42501', 'Direct deletion from storage tables is not allowed. Use the Storage API instead.',
  'owner: a direct DELETE is refused even where job_photos_delete_own_posting would have matched');
select tests.authenticate_as(:'worker');
select throws_ok($$ delete from storage.objects where bucket_id = 'job-photos' $$,
  '42501', 'Direct deletion from storage tables is not allowed. Use the Storage API instead.',
  'worker: a direct DELETE is refused even where job_photos_delete_own_completion would have matched');
select tests.authenticate_as(:'stranger');
select throws_ok($$ delete from storage.objects where bucket_id = 'avatars' $$,
  '42501', 'Direct deletion from storage tables is not allowed. Use the Storage API instead.',
  'stranger: a direct DELETE is refused as well');
select tests.clear_auth();
select ok(exists (select 1 from pg_trigger where tgrelid = 'storage.objects'::regclass and tgname = 'protect_objects_delete' and not tgisinternal),
  'runner: protect_objects_delete is the trigger doing it — named so the three refusals above cannot be mistaken for RLS');

-- anon, across the whole surface.
select tests.authenticate_anon();
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('avatars', 'anon/authz.jpg') $$,
  '42501', 'new row violates row-level security policy for table "objects"', 'anon: holds every grant on storage.objects and can still write nothing — no policy admits it');
select is((select count(*) from storage.objects), 0::bigint, 'anon: reads zero objects of the five this section created');

select * from finish();
rollback;
