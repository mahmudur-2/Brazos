-- 473_ban_hides_content.sql — production-36h S1, M2: ban_hides_content (R2-e, S4-02, S4-03) proven
-- on the local stack.
--
-- THE CAST: an admin; Bo, a customer who reviewed his worker and is then banned; Vic, the worker Bo
-- hired (the counterpart); Dot, another customer of Vic's who reviewed him and then deletes her
-- account; Sam, a stranger; Cleo, a customer with an open job; and the runner (RLS bypassed) for the
-- fixture rows. Everything rolls back; no commit.
--
-- FIXTURE SURGERY, DECLARED: the two finished jobs and their reviews are raw rows by the runner,
-- dated eight days back so the reviews are revealed by the 7-day rule. The pending bid Bo "sends"
-- after his ban (A3: a request already running when the ban lands may still finish) is a raw row
-- too: the ban itself settles every pending offer, so only a direct insert can make one. Bo's one
-- published service (A8-05 (a), 1d, 3h, 3i, 5e) is a raw row too.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(26);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated, service_role;

select tests.create_user('bh.admin@brazos.test', 'Ada Admin')    as admin \gset
select tests.create_user('bh.bo@brazos.test',    'Bo Banned')    as bo    \gset
select tests.create_user('bh.vic@brazos.test',   'Vic Worker')   as vic   \gset
select tests.create_user('bh.dot@brazos.test',   'Dot Deleter')  as dot   \gset
select tests.create_user('bh.sam@brazos.test',   'Sam Stranger') as sam   \gset
select tests.create_user('bh.cleo@brazos.test',  'Cleo Client')  as cleo  \gset
update public.profiles set is_admin = true where id = :'admin';
insert into fx values ('admin', :'admin'), ('bo', :'bo'), ('vic', :'vic'), ('dot', :'dot'), ('sam', :'sam'), ('cleo', :'cleo');

insert into public.jobs (client_id, title, assigned_worker_id, status, completed_at)
values (:'bo', 'BH bo hired vic', :'vic', 'completed', now() - interval '9 days') returning id as j_bo \gset
insert into public.jobs (client_id, title, assigned_worker_id, status, completed_at)
values (:'dot', 'BH dot hired vic', :'vic', 'completed', now() - interval '9 days') returning id as j_dot \gset
insert into public.reviews (job_id, reviewer_id, reviewee_id, rating, comment, created_at)
values (:'j_bo', :'bo', :'vic', 1, 'BH review by the account that is banned', now() - interval '8 days'),
       (:'j_dot', :'dot', :'vic', 5, 'BH review by the account that is deleted', now() - interval '8 days');
-- A8-05 (a): one account, both capabilities: Bo also lists a published service (raw, by the runner).
insert into public.worker_services (worker_id, title, category, price_cents, published)
values (:'bo', 'BH bo service', 'other', 5000, true);

select tests.authenticate_as(:'cleo');
select (public.create_job(p_title := 'BH cleo open', p_description := 'probe row, rolled back', p_category := 'other',
  p_location := 'Probe Area', p_budget_min_cents := 4000, p_budget_max_cents := 6000, p_address_line := '9 Probe Street')).id as j_open \gset
select tests.authenticate_as(:'vic');
select public.create_offer(p_amount_cents := 4500, p_job_id := :'j_open', p_message := 'BH vic bid') as vic_bid \gset
select tests.authenticate_as(:'dot');
select lives_ok($$ select public.delete_my_account() $$, '0a: Dot deletes her account (guard)');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 1. Before the ban: what other people see of Bo (the controls).
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'sam');
select is((select count(*) from public.profiles where id = :'bo'), 1::bigint, '1a: before the ban a stranger reads Bo''s profile (guard)');
select is((select count(*) from public.profile_reviews(:'vic')), 2::bigint, '1b: before the ban Vic''s public reviews are two (guard)');
select is((select count(*) from public.worker_services where worker_id = :'bo'), 1::bigint,
  '1d: before the ban a stranger reads Bo''s published service (guard)');
select tests.authenticate_as(:'vic');
select is((select count(*) from public.reviews where reviewee_id = :'vic'), 2::bigint, '1c: before the ban Vic reads both reviews of him (guard)');

-- ---------------------------------------------------------------------------
-- 2. Bo is banned.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'admin');
select lives_ok($$ select public.ban_user((select v from fx where k = 'bo')) $$, '2a: the admin bans Bo (guard)');
select tests.clear_auth();
-- A3: a bid of Bo's that lands after the ban (a request already running), raw.
insert into public.job_offers (id, job_id, offer_type, root_offer_id, customer_id, worker_id, author_id, awaiting_id, amount_cents, message, status)
select x.id, :'j_open', 'marketplace_bid', x.id, :'cleo', :'bo', :'bo', :'cleo', 4400, 'BH late bid', 'pending'
from (select gen_random_uuid() as id) x
returning id as bo_bid \gset
insert into fx values ('bo_bid', :'bo_bid');

-- ---------------------------------------------------------------------------
-- 3. R2-e: the profile and the reviews leave other people's screens.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'sam');
select is((select count(*) from public.profiles where id = :'bo'), 0::bigint, '3a: R2-e: a stranger no longer reads the banned profile');
select is(
  (select p.full_name from public.profiles p where p.id = :'dot'),
  'Deleted user',
  '3b: a deleted account''s tombstone still reads "Deleted user" (the old app''s row) (guard)'
);
select is(
  (select string_agg(r.reviewer_name, ',') from public.profile_reviews(:'vic') r),
  'Deleted user',
  '3c: R2-e: Vic''s public reviews leave out the banned reviewer''s and keep the deleted reviewer''s'
);
select is((select total from public.profile_review_summary(:'vic')), 1, '3d: R2-e: and the total counts one review');
select is((select count(*) from public.worker_services where worker_id = :'bo'), 0::bigint,
  '3h: A8-05 (a): a stranger no longer reads the banned account''s services');
select tests.authenticate_as(:'vic');
select is((select count(*) from public.profiles where id = :'bo'), 1::bigint,
  '3e: the counterpart (Vic, whom Bo hired) still reads Bo''s profile (profile_visible) (guard)');
select is((select count(*) from public.worker_services where worker_id = :'bo'), 1::bigint,
  '3i: A8-05 (a, b): the counterpart still reads Bo''s service, as the profile rule gives him the profile');
select is(
  (select string_agg(r.reviewer_id::text, ',') from public.reviews r where r.reviewee_id = :'vic'),
  :'dot'::text,
  '3f: R2-e: Vic reads only the deleted reviewer''s review of him now'
);
select tests.authenticate_as(:'bo');
select is((select count(*) from public.profiles where id = :'bo'), 1::bigint, '3g: Bo still reads his own profile row (guard)');

-- ---------------------------------------------------------------------------
-- 4. S4-03 (A3): a pending offer from the banned account is not shown and cannot be accepted.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'cleo');
select is((select count(*) from public.job_offers where id = :'vic_bid'), 1::bigint,
  '4a: control: Cleo reads Vic''s pending bid on her job (guard)');
select is((select count(*) from public.job_offers where id = :'bo_bid'), 0::bigint,
  '4b: S4-03: Cleo does not read the banned account''s pending bid');
select is((select count(*) from public.bids where job_id = :'j_open' and worker_id = :'bo'), 0::bigint,
  '4c: S4-03: nor its row in bids');
select is((select count(*) from public.my_pending_offers() where id = :'bo_bid'), 0::bigint,
  '4d: S4-03: my_pending_offers() does not list it');
select is((select count(*) from public.my_pending_offers() where id = :'vic_bid'), 1::bigint,
  '4e: control: my_pending_offers() lists Vic''s (guard)');
select throws_ok($$ select public.accept_offer((select v from fx where k = 'bo_bid')) $$,
  'P0001', 'This offer cannot be accepted', '4f: A3: accept_offer() refuses it (job_request_parties_ok) (guard)');

-- ---------------------------------------------------------------------------
-- 5. The unban gives it all back: nothing was deleted.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'admin');
select lives_ok($$ select public.unban_user((select v from fx where k = 'bo')) $$, '5a: the admin lifts the ban (guard)');
select tests.authenticate_as(:'sam');
select is((select count(*) from public.profiles where id = :'bo'), 1::bigint, '5b: a stranger reads Bo''s profile again (guard)');
select is((select total from public.profile_review_summary(:'vic')), 2, '5c: Vic''s total counts both reviews again (guard)');
select is((select count(*) from public.worker_services where worker_id = :'bo'), 1::bigint,
  '5e: A8-05 (a): a stranger reads Bo''s service again (guard)');
select tests.authenticate_as(:'vic');
select is((select count(*) from public.reviews where reviewee_id = :'vic'), 2::bigint, '5d: Vic reads both reviews again (guard)');
select tests.clear_auth();

select * from finish();
rollback;
