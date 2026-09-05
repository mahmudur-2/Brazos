-- 100_nearby_alerts_default.sql — the n1 proofs: 20260930000300_nearby_alerts_default.sql
-- proven on the local stack before the pipeline applies it anywhere. Three
-- assertions, in the order the run's D4 names them; each says what it proves.
--
-- THE CAST: the runner only — the connection's own role, RLS bypassed. The
-- proof is about two column defaults and a trigger's insert, not about who may
-- read or write the row, so no identity switch is needed (040_authz.sql owns
-- notification_prefs' authorization proofs).
--
-- THE FIXTURE: one account created by tests.create_user (the _helpers.sql
-- helper inserts auth.users and public.profiles, the way staging's sign-up
-- leaves them); the profiles_default_notification_prefs AFTER INSERT trigger
-- (baseline line 6770) then runs create_default_notification_prefs(), whose
-- body inserts (user_id) only (baseline line 1166) — so the row's nearby_jobs
-- is whatever the column default is. That is the real path a new account
-- takes, and assertion 3 reads it back. Everything rolls back.
--
-- WHAT THIS FILE CANNOT PROVE, said plainly: the migration's backfill
-- (update ... where nearby_jobs = false). On a fresh local stack every prefs
-- row is created AFTER the migration ran, so there is no pre-migration row
-- holding false to be flipped; its proof is the statement's shape and
-- staging's list-after step. No pre-migration row is faked here.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(3);

-- 1. The column default itself (docs/DECISIONS.md 2026-09-04, night1 n1 entry 1).
select col_default_is('public', 'notification_prefs', 'nearby_jobs', true, '1: nearby_jobs defaults to true (DECISIONS 2026-09-04)');

-- 2. accepting_work: true since the baseline (line 2239); the migration carries
--    no statement for it (D3), and this assertion is its record.
select col_default_is('public', 'profiles', 'accepting_work', true, '2: accepting_work defaults to true for a new profile (baseline, unchanged)');

-- 3. The default through the real path: a fresh account's prefs row, written by
--    the profile-insert trigger with user_id only.
select tests.create_user('n1.worker@brazos.test', 'Nia Nearby') as w \gset
select is((select nearby_jobs from public.notification_prefs where user_id = :'w'), true, '3: a fresh account''s prefs row is created with nearby_jobs true');

select * from finish();
rollback;
