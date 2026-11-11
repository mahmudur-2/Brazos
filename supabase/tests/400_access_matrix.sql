-- 400_access_matrix.sql — who may read and write what, after the privacy group
-- (docs/critical/privacy-and-limits.md; docs/lean/AUDIT-LEDGER.md B2, B3, B9, B12 part 1, B14, B17).
--
-- THE CAST, named once; every assertion says which of them it ran as:
--   anon      no session at all
--   owner     the customer: posted every job here
--   worker    hired on j_asg, j_run, j_done and j_cxl; bid on j_open
--   bidder    bid on j_open and j_asg, never hired
--   stranger  an unrelated, active, signed-in account
--   admin     profiles.is_admin, set by the runner (no RPC grants it)
--   near/edge two accounts whose home is near the B2 job; banme, the account §6 bans
--
-- THE FIXTURE. The B2 job is posted through create_job (its nearby alert is the subject). Every other
-- job, its address and its bids are written by the runner in the status each check needs, so this
-- file proves the policies and functions, not the lifecycle that leads there. The B2 coordinates
-- (about 10.12, 10.12) are far from every seeded job and home, so no other row shares their market
-- cell or their alert radius. Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(46);

-- psql does not interpolate :'vars' inside dollar quotes, so ids also live in this temp table.
create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('matrix.owner@brazos.test',    'Mia Owner')     as owner    \gset
select tests.create_user('matrix.worker@brazos.test',   'Will Worker')   as worker   \gset
select tests.create_user('matrix.bidder@brazos.test',   'Bo Bidder')     as bidder   \gset
select tests.create_user('matrix.stranger@brazos.test', 'Stan Stranger') as stranger \gset
select tests.create_user('matrix.admin@brazos.test',    'Ann Admin')     as admin    \gset
select tests.create_user('matrix.near@brazos.test',     'Nia Near')      as near     \gset
select tests.create_user('matrix.edge@brazos.test',     'Ed Edge')       as edge     \gset
select tests.create_user('matrix.banme@brazos.test',    'Ben Banned')    as banme    \gset
update public.profiles set is_admin = true where id = :'admin';
insert into fx values
  ('owner', :'owner'), ('worker', :'worker'), ('bidder', :'bidder'), ('stranger', :'stranger'),
  ('admin', :'admin'), ('banme', :'banme');

-- ---------------------------------------------------------------------------
-- §1. B2 — a job's distance is its market cell's (jobs_within_radius, notify_nearby_for_job).
-- The job J sits just inside the SOUTH edge of its 0.27-mile cell, on the cell's centre meridian,
-- about 0.134 mile south of the centre. Every probe point lies on that meridian, so each distance
-- is a pure north-south one and the half-mile snapping is predictable:
--   Q   1.2 mi north of the centre: centre 1.2 -> 1.0 snapped; exact 1.334 -> 1.5
--   Q2  1.3 mi south of the centre: centre 1.3 -> 1.5 snapped; exact 1.166 -> 1.0
--   near's home 0.95 mi north (radius 1): centre 0.95 inside; exact 1.084 outside
--   edge's home 1.05 mi south (radius 1): centre 1.05 outside; exact 0.916 inside
-- The grid is job_hotspots' own (baseline:2413-2416, 2434-2435), computed here inline.
-- ---------------------------------------------------------------------------
select
  (floor(10.1234 / (0.27 / 69.0)) * (0.27 / 69.0)) + 0.00002 as j_lat,
  (floor(10.1234 / (0.27 / (69.0 * cos(radians(40.7128))))) + 0.5) * (0.27 / (69.0 * cos(radians(40.7128)))) as j_lng,
  (floor(10.1234 / (0.27 / 69.0)) + 0.5) * (0.27 / 69.0) as c_lat,
  3958.8 * pi() / 180 as mi_per_deg
\gset
select
  :c_lat + 1.2 / :mi_per_deg as q_lat,
  :c_lat - 1.3 / :mi_per_deg as q2_lat,
  :c_lat + 0.95 / :mi_per_deg as near_lat,
  :c_lat - 1.05 / :mi_per_deg as edge_lat
\gset
update public.notification_prefs set home_lat = :near_lat, home_lng = :j_lng, nearby_radius_miles = 1 where user_id = :'near';
update public.notification_prefs set home_lat = :edge_lat, home_lng = :j_lng, nearby_radius_miles = 1 where user_id = :'edge';

select tests.authenticate_as(:'owner');
select (public.create_job(
  p_title := 'MATRIX cell job', p_description := 'fixture, rolled back',
  p_category := 'other', p_location := 'Matrix Area', p_budget_cents := 5000,
  p_lat := :j_lat, p_lng := :j_lng, p_address_line := '1 Matrix Cell St'
)).id as j_cell \gset
select tests.clear_auth();

select ok(
  (select abs(h.cell_lat - :c_lat) < 1e-9 from public.job_hotspots() h
    where h.ilat = floor(:j_lat / (0.27 / 69.0))::bigint
      and h.ilng = floor(:j_lng / (0.27 / (69.0 * cos(radians(40.7128)))))::bigint),
  'runner: the cell centre this file measures from is job_hotspots'' own for the job''s cell (guard)');

select tests.authenticate_as(:'stranger');
select is(
  (select r.distance_miles from public.jobs_within_radius(:q_lat, :j_lng, 25) r where r.id = :'j_cell'),
  1.0::double precision,
  'B2: stranger: the job''s distance from Q is its cell centre''s (1.2 mi, snapped 1.0), not its exact point''s (1.33, snapped 1.5)');
select is(
  (select count(*) from public.jobs_within_radius(:q_lat, :j_lng, 1) r where r.id = :'j_cell'),
  1::bigint,
  'B2: stranger: a 1-mile search from Q finds the job by its cell centre (by its exact point it would not)');
select is(
  (select count(*) from public.jobs_within_radius(:q2_lat, :j_lng, 1) r where r.id = :'j_cell'),
  0::bigint,
  'B2: stranger: a 1-mile search from Q2 does not find the job, whose exact point is 1.17 mi away but whose cell centre is 1.3');
select tests.clear_auth();
select is(
  (select count(*) from public.notification_outbox where recipient_id = :'near' and dedupe_key = 'job_nearby:' || :'j_cell' || ':' || :'near'),
  1::bigint,
  'B2: near (home 0.95 mi from the cell centre, radius 1) gets the nearby alert, though the exact point is 1.08 mi away');
select is(
  (select count(*) from public.notification_outbox where recipient_id = :'edge' and dedupe_key = 'job_nearby:' || :'j_cell' || ':' || :'edge'),
  0::bigint,
  'B2: edge (home 1.05 mi from the cell centre, radius 1) gets no alert, though the exact point is 0.92 mi away');

-- ---------------------------------------------------------------------------
-- The runner's jobs, addresses and bids for §2-§5.
-- ---------------------------------------------------------------------------
insert into public.jobs (client_id, title, status) values (:'owner', 'MATRIX open', 'open')
  returning id as j_open \gset
insert into public.jobs (client_id, title, status, assigned_worker_id) values (:'owner', 'MATRIX assigned', 'assigned', :'worker')
  returning id as j_asg \gset
insert into public.jobs (client_id, title, status, assigned_worker_id) values (:'owner', 'MATRIX running', 'in_progress', :'worker')
  returning id as j_run \gset
insert into public.jobs (client_id, title, status, assigned_worker_id, completed_at) values (:'owner', 'MATRIX done', 'completed', :'worker', now())
  returning id as j_done \gset
insert into public.jobs (client_id, title, status, assigned_worker_id) values (:'owner', 'MATRIX cancelled', 'cancelled', :'worker')
  returning id as j_cxl \gset
insert into fx values
  ('j_open', :'j_open'), ('j_asg', :'j_asg'), ('j_run', :'j_run'), ('j_done', :'j_done'), ('j_cxl', :'j_cxl');
insert into public.job_locations (job_id, address_line)
select j, '2 Matrix Street' from unnest(array[:'j_open', :'j_asg', :'j_run', :'j_done', :'j_cxl']::uuid[]) j;

-- Root marketplace bids: worker and bidder on j_open and on j_asg.
insert into public.job_offers (id, job_id, offer_type, root_offer_id, customer_id, worker_id, author_id, amount_cents)
select o.id, o.job_id, 'marketplace_bid', o.id, :'owner', o.worker_id, o.worker_id, 5000
from (values
  (gen_random_uuid(), :'j_open'::uuid, :'worker'::uuid),
  (gen_random_uuid(), :'j_open'::uuid, :'bidder'::uuid),
  (gen_random_uuid(), :'j_asg'::uuid,  :'worker'::uuid),
  (gen_random_uuid(), :'j_asg'::uuid,  :'bidder'::uuid)
) as o(id, job_id, worker_id);
insert into fx select 'o_open_w', id from public.job_offers where job_id = :'j_open' and worker_id = :'worker';
insert into fx select 'o_asg_w', id from public.job_offers where job_id = :'j_asg' and worker_id = :'worker';

-- ---------------------------------------------------------------------------
-- §2. B3 — job_locations_select_party: the hired worker reads the address while working only.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'worker');
select is((select count(*) from public.job_locations where job_id in (:'j_asg', :'j_run')), 2::bigint,
  'worker: reads the address of the jobs assigned to them and in progress (guard)');
select is((select count(*) from public.job_locations where job_id = :'j_done'), 0::bigint,
  'B3: worker: no longer reads the address once the job is completed');
select is((select count(*) from public.job_locations where job_id = :'j_cxl'), 0::bigint,
  'B3: worker: no longer reads the address once the job is cancelled');
select tests.authenticate_as(:'owner');
select is((select count(*) from public.job_locations where job_id in (:'j_open', :'j_asg', :'j_run', :'j_done', :'j_cxl')), 5::bigint,
  'owner: reads the address of every job they posted, in every status (guard)');
select tests.authenticate_as(:'bidder');
select is((select count(*) from public.job_locations where job_id in (:'j_open', :'j_asg')), 0::bigint,
  'bidder: reads no address (guard)');
select tests.authenticate_as(:'stranger');
select is((select count(*) from public.job_locations where job_id in (:'j_cell', :'j_open', :'j_asg', :'j_run', :'j_done', :'j_cxl')), 0::bigint,
  'stranger: reads no address (guard)');

-- ---------------------------------------------------------------------------
-- §3. B9 and B17 part 2 — job-photos. Each upload path the app uses, written as an insert that reads
-- its row back (insert … returning: the storage server returns the new object as the uploader, so the
-- read policy must admit it), then read back by its uploader. Then who else may list them, and when
-- completion files may change. (The local storage keeps versions: (bucket_id, name) is unique only per
-- version, so its upsert is not an ON CONFLICT this file can write; every app path names a new file.)
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'owner');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('job-photos', 'postings/' || (select v from fx where k = 'owner') || '/matrix-post.jpg')
  returning name $$,
  'owner: uploads a posting photo to postings/<own id>/ (the app''s upload, read back on insert)');
select is((select count(*) from storage.objects where bucket_id = 'job-photos' and name = 'postings/' || :'owner' || '/matrix-post.jpg'), 1::bigint,
  'owner: reads their posting photo back');
select tests.authenticate_as(:'worker');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('job-photos', 'reviews/' || (select v from fx where k = 'worker') || '/matrix-review.jpg')
  returning name $$,
  'worker: uploads a review photo to reviews/<own id>/ (the app''s upload, read back on insert)');
select is((select count(*) from storage.objects where bucket_id = 'job-photos' and name = 'reviews/' || :'worker' || '/matrix-review.jpg'), 1::bigint,
  'worker: reads their review photo back');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('job-photos', (select v from fx where k = 'j_run') || '/matrix-run.jpg')
  returning name $$,
  'worker: uploads a completion photo to <job>/ while the job is in progress (the app''s upload, read back on insert)');
select is((select count(*) from storage.objects where bucket_id = 'job-photos' and name = :'j_run' || '/matrix-run.jpg'), 1::bigint,
  'worker: reads their completion photo back');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('job-photos', (select v from fx where k = 'j_asg') || '/matrix-early.jpg') $$,
  '42501', 'new row violates row-level security policy for table "objects"',
  'B17: worker: cannot add a completion file before the job has started');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('job-photos', (select v from fx where k = 'j_done') || '/matrix-late.jpg') $$,
  '42501', 'new row violates row-level security policy for table "objects"',
  'B17: worker: cannot add a completion file once the job is completed');

-- Completion files the worker made earlier, placed by the runner: one on the finished job, one on
-- the running job (the positive control for the delete below).
select tests.clear_auth();
insert into storage.objects (bucket_id, name) values
  ('job-photos', :'j_done' || '/matrix-done.jpg'),
  ('job-photos', :'j_run' || '/matrix-run-2.jpg');

select tests.authenticate_as(:'stranger');
select is((select count(*) from storage.objects where bucket_id = 'job-photos' and name like '%matrix-%'), 0::bigint,
  'B9: stranger: lists none of these job photos');
select tests.authenticate_as(:'bidder');
select is((select count(*) from storage.objects where bucket_id = 'job-photos' and name like '%matrix-%'), 0::bigint,
  'B9: bidder: lists none of them either');
select tests.authenticate_as(:'owner');
select is((select count(*) from storage.objects where bucket_id = 'job-photos' and name like '%matrix-%'), 4::bigint,
  'B9: owner: lists their posting photo and the three completion files of their jobs, not the worker''s review photo');
select tests.authenticate_as(:'worker');
select is((select count(*) from storage.objects where bucket_id = 'job-photos' and name like '%matrix-%'), 4::bigint,
  'B9: worker: lists their review photo and the completion files of the jobs they were hired on, not the owner''s posting photo');
select tests.authenticate_anon();
select is((select count(*) from storage.objects where bucket_id = 'job-photos'), 0::bigint,
  'anon: lists no job photo (guard)');

-- Deletion goes through the Storage API, which sets storage.allow_delete_query for its own DELETE.
select tests.authenticate_as(:'worker');
select set_config('storage.allow_delete_query', 'true', true);
with d as (delete from storage.objects where bucket_id = 'job-photos' and name = (select v from fx where k = 'j_done') || '/matrix-done.jpg' returning 1)
select is((select count(*) from d), 0::bigint,
  'B17: worker: cannot remove a completion file once the job is completed');
with d as (delete from storage.objects where bucket_id = 'job-photos' and name = (select v from fx where k = 'j_run') || '/matrix-run-2.jpg' returning 1)
select is((select count(*) from d), 1::bigint,
  'worker: removes a completion file while the job is in progress (the positive control)');
select set_config('storage.allow_delete_query', 'false', true);

-- ---------------------------------------------------------------------------
-- §4. B14 — messages_insert_party: a client row is a plain message, never an offer card.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'worker');
select lives_ok($$ insert into public.messages (job_id, sender_id, content) values ((select v from fx where k = 'j_asg'), (select v from fx where k = 'worker'), 'On my way') $$,
  'worker: a plain message on the job they were hired on is accepted (the positive control)');
select throws_ok($$ insert into public.messages (job_id, sender_id, content, request_event) values ((select v from fx where k = 'j_asg'), (select v from fx where k = 'worker'), 'Accepted', 'accepted') $$,
  '42501', 'new row violates row-level security policy for table "messages"',
  'B14: worker: cannot post a row carrying request_event (a fake "accepted" card)');
select throws_ok($$ insert into public.messages (job_id, sender_id, content, request_amount_cents) values ((select v from fx where k = 'j_asg'), (select v from fx where k = 'worker'), '', 100) $$,
  '42501', 'new row violates row-level security policy for table "messages"',
  'B14: worker: cannot post a row carrying request_amount_cents');
select throws_ok($$ insert into public.messages (job_id, sender_id, content, job_offer_id) values ((select v from fx where k = 'j_asg'), (select v from fx where k = 'worker'), '', (select v from fx where k = 'o_asg_w')) $$,
  '42501', 'new row violates row-level security policy for table "messages"',
  'B14: worker: cannot post a row carrying job_offer_id, even once messaging is open');
select tests.authenticate_as(:'owner');
select throws_ok($$ insert into public.messages (job_id, sender_id, content, job_offer_id) values ((select v from fx where k = 'j_open'), (select v from fx where k = 'owner'), '', (select v from fx where k = 'o_open_w')) $$,
  '42501', 'new row violates row-level security policy for table "messages"',
  'B14: owner: cannot post an empty card-shaped row before messaging opens (the old exemption)');

-- ---------------------------------------------------------------------------
-- §5. B17 part 1 — bid counts answer only about a job the caller may see.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'stranger');
select is(public.job_offer_count(:'j_open'), 2,
  'stranger: the bid count of an open open-market job, as the market shows it (guard)');
select is(public.job_offer_count(:'j_asg'), 0,
  'B17: stranger: no bid count for a job already hired (0, as for a job with no bids)');
select is((select count(*) from public.job_offer_counts(array[:'j_open', :'j_asg']::uuid[])), 1::bigint,
  'B17: stranger: the batch leaves the hired job out');
select tests.authenticate_as(:'owner');
select is(public.job_offer_count(:'j_asg'), 2, 'owner: the bid count of their own hired job (guard)');
select tests.authenticate_as(:'worker');
select is((select c.offer_count from public.job_offer_counts(array[:'j_asg']::uuid[]) c), 2,
  'worker: the bid count of the job they were hired on (guard)');
select tests.authenticate_as(:'bidder');
select is(public.job_offer_count(:'j_asg'), 2, 'bidder: the bid count of a job they bid on (guard)');
select tests.authenticate_anon();
select throws_ok($$ select public.job_offer_count((select v from fx where k = 'j_open')) $$,
  '42501', 'permission denied for function job_offer_count',
  'anon: may not ask for a bid count at all (guard)');

-- ---------------------------------------------------------------------------
-- §6. B12 part 1 — a ban records the sign-in phone, and the record outlives the account.
-- banme signs in with a phone that is not their profile phone (the profile phone is editable).
-- The number is a fictional 555-01xx one.
-- ---------------------------------------------------------------------------
select tests.clear_auth();
update auth.users set phone = '15550104040' where id = :'banme';
select tests.authenticate_as(:'admin');
select lives_ok($$ select public.ban_user((select v from fx where k = 'banme')) $$, 'admin: bans banme (guard)');
select tests.clear_auth();
select is((select count(*) from public.banned_phones where phone = '+15550104040' and banned_profile_id = :'banme'), 1::bigint,
  'B12: the ban recorded banme''s sign-in phone, in the form handle_new_user() checks');
select tests.authenticate_as(:'banme');
select lives_ok($$ select public.delete_my_account() $$, 'banme: deletes their own account (guard)');
select tests.clear_auth();
select is((select count(*) from auth.users where id = :'banme'), 0::bigint, 'runner: banme''s sign-in is gone (guard)');
select is((select count(*) from public.banned_phones where phone = '+15550104040'), 1::bigint,
  'B12: the ban record outlives the deleted account');
select throws_ok($$
  insert into auth.users (instance_id, id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change, email_change_token_new)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '15550104040', now(),
          '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '') $$,
  'P0001', 'This phone number is not eligible to register.',
  'B12: a new account with the banned sign-in phone is refused');
select is((select count(*) from public.profiles where id = :'banme'), 1::bigint,
  'runner: the deleted account''s profile stays, as a tombstone (why the record keeps its banned_profile_id) (guard)');

select * from finish();
rollback;
