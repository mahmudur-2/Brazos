-- 130_job_pricing_mode.sql — the a3 proofs: 20260930000400_job_pricing_mode.sql
-- proven on the local stack before the pipeline applies it anywhere. Thirty
-- assertions in sixteen numbered groups, in the order the run's D4 names them
-- (3 sits after 4, which creates the job it needs); each says what it proves.
--
-- THE CAST: a customer (posts and edits), a worker (requests the posted-price
-- job), and the runner — the connection's own role, RLS bypassed — for the two
-- direct UPDATEs that prove the CHECK constraints (3 and 11) and for the
-- catalogue reads (1, 2, 12, 13, 14, 16). 040_authz.sql owns jobs'
-- authorization proofs; nothing here re-proves who may read or write a row.
--
-- THE FIXTURE: two accounts by tests.create_user (the _helpers.sql ledger). The
-- customer posts job4 WITHOUT p_pricing_mode — the fifteen-name call every
-- installed build sends (lib/jobs.ts createJob) — with a 4000-6000 range, and
-- job5 as a posted price of 5000 with no range. Ids are parked in the temp
-- table fx so that a throws_ok body (a dollar-quoted string, where psql
-- interpolates nothing) can read them back. Everything rolls back; no commit.
--
-- WHAT THIS FILE CANNOT PROVE, said plainly: (a) that PostgREST resolves a
-- fifteen-name call to the one sixteen-parameter overload — 12a proves there
-- is exactly ONE create_job in pg_proc, the condition under which a PGRST203
-- ambiguity cannot arise, but PostgREST itself is not exercised here;
-- (b) that rows written BEFORE the migration read open_bids — on a fresh
-- local stack every row is created after it ran, so the default (1) and the
-- NOT NULL (2) are the proof of that clause, and no pre-migration row is
-- faked. Assertion 1 passes the bare value to col_default_is: pg_get_expr
-- renders the default as 'open_bids'::text and pgTAP's _def_is casts both
-- sides to the column's type before comparing, so the want is the value, not
-- the rendered expression.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(30);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('a3.customer@brazos.test', 'Priya Poster') as customer \gset
select tests.create_user('a3.worker@brazos.test', 'Wade Worker') as worker \gset
insert into fx values ('customer', :'customer'), ('worker', :'worker');

-- ---------------------------------------------------------------------------
-- 1, 2. The column: defaulted and NOT NULL (docs/DECISIONS.md 2026-09-05
--       entry (2)).
-- ---------------------------------------------------------------------------
select col_default_is('public', 'jobs', 'pricing_mode', 'open_bids', '1: jobs.pricing_mode defaults to open_bids (DECISIONS 2026-09-05 entry 2)');
select col_not_null('public', 'jobs', 'pricing_mode', '2: jobs.pricing_mode is NOT NULL - a row is never modeless');

-- ---------------------------------------------------------------------------
-- 4. The fifteen-name call every installed build sends, WITHOUT
--    p_pricing_mode: the row it inserts today plus pricing_mode open_bids; the
--    legacy mirror is unchanged (the range ceiling, 010_offers.sql A1).
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select (public.create_job(
  p_title := 'A3 open bids', p_description := 'probe row, rolled back',
  p_category := 'other', p_location := 'Probe Area',
  p_budget_min_cents := 4000, p_budget_max_cents := 6000,
  p_address_line := '4 Probe Street'
)).id as job4 \gset
insert into fx values ('job4', :'job4');
select is((select pricing_mode from public.jobs where id = :'job4'), 'open_bids', '4a: create_job without p_pricing_mode writes open_bids - the fifteen-name call is unchanged');
select is((select budget_cents from public.jobs where id = :'job4'), 6000, '4b: the legacy mirror still holds the range ceiling (6000)');

-- ---------------------------------------------------------------------------
-- 3. jobs_pricing_mode_known, as the runner (RLS bypassed): a value outside
--    the allow-list is refused with 23514 whoever writes it.
-- ---------------------------------------------------------------------------
select tests.clear_auth();
select throws_ok(
  $$ update public.jobs set pricing_mode = 'auction' where id = (select v from fx where k = 'job4') $$,
  '23514', null, '3: the CHECK refuses an unknown mode');

-- ---------------------------------------------------------------------------
-- 5. A posted price: one budget_cents figure, no range.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select (public.create_job(
  p_title := 'A3 posted price', p_description := 'probe row, rolled back',
  p_category := 'other', p_location := 'Probe Area',
  p_budget_cents := 5000, p_pricing_mode := 'posted_price',
  p_address_line := '5 Probe Street'
)).id as job5 \gset
insert into fx values ('job5', :'job5');
select is((select pricing_mode from public.jobs where id = :'job5'), 'posted_price', '5a: create_job with p_pricing_mode posted_price writes posted_price');
select is((select budget_cents from public.jobs where id = :'job5'), 5000, '5b: the posted price is budget_cents (5000) - the mirror resolves to p_budget_cents');
select is((select budget_min_cents from public.jobs where id = :'job5'), null::integer, '5c: a posted-price job carries no budget_min_cents');
select is((select budget_max_cents from public.jobs where id = :'job5'), null::integer, '5d: a posted-price job carries no budget_max_cents');

-- ---------------------------------------------------------------------------
-- 6, 7, 8. The three refusals, as the customer, each matched on the exact
--          text the function raises (P0001).
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.create_job(p_title := 'A3 no amount', p_description := 'probe row, rolled back', p_category := 'other', p_location := 'Probe Area', p_pricing_mode := 'posted_price', p_budget_cents := null) $$,
  'P0001', 'A posted price needs an amount', '6: a posted price without an amount is refused');
select throws_ok(
  $$ select public.create_job(p_title := 'A3 ranged posted price', p_description := 'probe row, rolled back', p_category := 'other', p_location := 'Probe Area', p_pricing_mode := 'posted_price', p_budget_cents := 5000, p_budget_max_cents := 6000) $$,
  'P0001', 'A posted price is one amount, not a range', '7: a posted price with a range is refused');
select throws_ok(
  $$ select public.create_job(p_title := 'A3 auction', p_description := 'probe row, rolled back', p_category := 'other', p_location := 'Probe Area', p_pricing_mode := 'auction') $$,
  'P0001', 'Pricing mode must be open_bids or posted_price', '8: an unknown mode is refused by the allow-list');

-- ---------------------------------------------------------------------------
-- 9. update_job_details on the open, zero-bid job4: to a posted price of
--    4500, no range. The address is re-sent so the job_locations row stays.
-- ---------------------------------------------------------------------------
select (public.update_job_details(
  p_job_id := :'job4', p_title := 'A3 open bids', p_description := 'probe row, rolled back',
  p_category := 'other', p_location := 'Probe Area',
  p_budget_cents := 4500, p_pricing_mode := 'posted_price',
  p_address_line := '4 Probe Street'
)).id as job4_edit1 \gset
select is((select pricing_mode from public.jobs where id = :'job4'), 'posted_price', '9a: update_job_details with p_pricing_mode posted_price writes posted_price');
select is((select budget_cents from public.jobs where id = :'job4'), 4500, '9b: the posted price replaces the mirror (4500)');
select is((select budget_min_cents from public.jobs where id = :'job4'), null::integer, '9c: the edit cleared budget_min_cents');
select is((select budget_max_cents from public.jobs where id = :'job4'), null::integer, '9d: the edit cleared budget_max_cents');

-- ---------------------------------------------------------------------------
-- 10. The same job back to open bids with a 4000-6000 range — WITHOUT
--     p_pricing_mode, the sixteen-name call every installed build sends
--     (lib/jobs.ts updateJob), so the default is proven on this function too.
-- ---------------------------------------------------------------------------
select (public.update_job_details(
  p_job_id := :'job4', p_title := 'A3 open bids', p_description := 'probe row, rolled back',
  p_category := 'other', p_location := 'Probe Area',
  p_budget_min_cents := 4000, p_budget_max_cents := 6000,
  p_address_line := '4 Probe Street'
)).id as job4_edit2 \gset
select is((select pricing_mode from public.jobs where id = :'job4'), 'open_bids', '10a: update_job_details without p_pricing_mode writes open_bids - the sixteen-name call is unchanged');
select is((select budget_cents from public.jobs where id = :'job4'), 6000, '10b: the legacy mirror holds the range ceiling again (6000)');

-- ---------------------------------------------------------------------------
-- 11. jobs_posted_price_has_price, as the runner: a posted price with no
--     amount is refused at the table, not only in the function.
-- ---------------------------------------------------------------------------
select tests.clear_auth();
select throws_ok(
  $$ update public.jobs set pricing_mode = 'posted_price', budget_cents = null where id = (select v from fx where k = 'job4') $$,
  '23514', null, '11: a posted price without an amount is refused by jobs_posted_price_has_price');

-- ---------------------------------------------------------------------------
-- 12, 13. One overload each, and the new parameter is the LAST one.
-- ---------------------------------------------------------------------------
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_job'), 1, '12a: one create_job - the fifteen-parameter signature is gone');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'update_job_details'), 1, '12b: one update_job_details - the sixteen-parameter signature is gone');
-- 2026-09-30 (idea 12, 20260930000600): create_job's last parameter is p_needed_today now; p_pricing_mode sits right before it.
select ok((select pg_get_function_identity_arguments(p.oid) like '%, p_pricing_mode text, p_needed_today boolean' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_job'), '13a: create_job takes p_pricing_mode next to last, before p_needed_today');
select ok((select pg_get_function_identity_arguments(p.oid) like '%, p_pricing_mode text' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'update_job_details'), '13b: update_job_details takes p_pricing_mode last');

-- ---------------------------------------------------------------------------
-- 14. The ACL each re-created function carries (CLAUDE.md section Supabase):
--     authenticated may execute, anon may not. The 120_reputation_batch.sql
--     section 10 idiom, on the new identities.
-- ---------------------------------------------------------------------------
-- 2026-09-30 (idea 12): create_job's identity is the seventeen-parameter one (140_needed_today.sql).
select ok(has_function_privilege('authenticated', 'public.create_job(text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text, text, boolean)', 'EXECUTE'), '14a: authenticated may execute create_job under its seventeen-parameter signature');
select ok(not has_function_privilege('anon', 'public.create_job(text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text, text, boolean)', 'EXECUTE'), '14b: anon holds no EXECUTE on create_job');
select ok(has_function_privilege('authenticated', 'public.update_job_details(uuid, text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text, text)', 'EXECUTE'), '14c: authenticated may execute update_job_details under its seventeen-parameter signature');
select ok(not has_function_privilege('anon', 'public.update_job_details(uuid, text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text, text)', 'EXECUTE'), '14d: anon holds no EXECUTE on update_job_details');

-- ---------------------------------------------------------------------------
-- 15. The worker's request at the posted price is an ordinary offer (the
--     010_offers.sql A3 shape): pending, awaiting the customer, who still
--     accepts and funds. Not Instant Book.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'worker');
select public.create_offer(p_amount_cents := 5000, p_job_id := :'job5', p_message := 'a3 proof') as offer5 \gset
insert into fx values ('offer5', :'offer5');
select is((select status::text from public.job_offers where id = :'offer5'), 'pending', '15a: the worker''s request at the posted price is a pending offer');
select is((select awaiting_id from public.job_offers where id = :'offer5'), :'customer'::uuid, '15b: the request awaits the customer, who accepts and funds as for any offer');

-- ---------------------------------------------------------------------------
-- 16. The assignment path is mode-blind (D2 of the run): accept_offer() does
--     not read pricing_mode.
-- ---------------------------------------------------------------------------
select tests.clear_auth();
select ok((select p.prosrc not like '%pricing_mode%' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'accept_offer'), '16: accept_offer does not read pricing_mode');

select * from finish();
rollback;
