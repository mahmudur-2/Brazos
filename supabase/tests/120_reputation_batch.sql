-- 120_reputation_batch.sql — the n6 proofs: 20260930000200_reputation_batch_summary.sql
-- proven on the local stack before the pipeline applies it anywhere. Each
-- section is one case of the run's dispatch (D4, cases 1-7), in fixture order;
-- every assertion's description starts with its case number.
--
-- THE CAST (named once; every assertion says which of these it ran as):
--   customer    posts worker1's three jobs (JA, JB, JC) and the assigned-only JG
--   worker1     hired on all four, completes JA, JB, JC; the subject with a
--               blind review (JC) beside two revealed ones
--   customer2   posts worker2's three jobs (JD, JE, JF); reviewed as a
--               customer once, with a 1, so the customer role's prior differs
--               from the worker role's and a leaked prior would show
--   worker2     the is_new subject — two revealed reviews, then three
--   stranger    an unrelated signed-in account with no jobs and no reviews:
--               the default viewer, case 6's "id with no reviews", and the
--               identity case 7 compares against the owner
--   anon        no session at all (the refusal in case 7)
--   runner      the connection's own role, RLS bypassed — fixture surgery
--               (backdating created_at, setting on_time_pct), each line
--               marked SURGERY; ground truth; and the no-session call in
--               case 7
--
-- THE FIXTURE is 090_reputation.sql §0's: every job goes through the real RPCs
-- (create_job, create_offer, accept_offer, the sandbox funding pair,
-- transition_job_status with a completion photo) via tests.r8_complete_job;
-- tests.r8_hire stops at assigned. Both helpers are copied verbatim from
-- 090_reputation.sql lines 87-122 — each file's transaction owns its own copy
-- and rolls it back (the 070 / 110 precedent); create_user, authenticate_as,
-- authenticate_anon and clear_auth are _helpers.sql's. Reviews go through
-- create_review only. Everything rolls back.
--
-- FIXTURE SURGERY, DECLARED (each a state the product cannot reach in a
-- single transaction); every line carries -- SURGERY:
--   * reviews.created_at rewound 8 days, so a lone review is revealed by
--     time (090 §3, §6 and §7 do the same).
--   * profiles.on_time_pct set to 92.5 on worker1 by the runner — no RPC
--     writes the column, and case 5 is about the column riding along.
--
-- THE LEDGER, so every hand-computed number below can be checked:
--   worker role, revealed: worker1 {5 (JA, by counterpart), 3 (JB, by time)};
--     worker2 {5 (JD), 4 (JE), 3 (JF)}; JC's 4 stays blind until the last
--     section -> m = 20/5 = 4.0; worker1 (5*4.0 + 8)/(5+2) = 4.0;
--     worker2 (5*4.0 + 12)/(5+3) = 4.0 — the same numbers as 090 §7.
--   customer role, revealed: customer {4 (JA, by worker1)}; customer2
--     {1 (JD, by worker2)} -> m = 2.5; customer (5*2.5 + 4)/(5+1) = 2.75;
--     customer2 (5*2.5 + 1)/(5+1) = 2.25. A batch that used the worker
--     role's prior for the customer role would print 4.0 here instead.
--
-- WHAT IS PROVEN, case by case (D4):
--   1 batch equals single: worker1, worker2 (at two and at three), customer,
--     customer2 and the stranger, both roles, every column the two share —
--     compared as whole rows (to_jsonb of the single against the batch row
--     minus its three extra keys), from ONE call carrying every id.
--   2 unrevealed excluded: the batch row for worker1 is identical before and
--     after a blind review lands; once that review is revealed by time (the
--     last section) it counts.
--   3 other role excluded: a customer-role review is absent from the worker
--     row and the reverse; each role shrinks toward its OWN prior; an
--     unknown role is an error, not a guess.
--   4 "New" under three: is_new true at two revealed, false at three.
--   5 completed_jobs equals the sum of worker_job_stats(p_worker).job_count
--     (worker role) and client_job_stats(p_client).completed (customer role);
--     an assigned-but-not-completed job does not count; on_time_pct is
--     profiles.on_time_pct — set by SURGERY it comes back, unset it stays null.
--   6 an id with no reviews (a real profile, and a uuid that is no profile)
--     returns one row with total 0, average null, shown_average m and
--     is_new; a duplicated id returns one row; an empty or null array returns
--     zero rows; the output is ordered by user_id whatever the input order.
--   7 authorization: anon holds no EXECUTE (090 §9's posture for the single,
--     mirrored) and the call is refused with 42501; the owner and a stranger
--     get the same rows; with no session the counts are 0 — the auth.uid()
--     guard the single carries, mirrored, not raised.
--
-- PAIRING: every zero-count and every refusal sits beside the positive control
-- that proves the row exists for the identity meant to see it.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(83);

-- psql does not interpolate :'vars' inside dollar quotes, so ids also live in
-- this temp table for the statements throws_ok/lives_ok execute.
create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;
-- Whole-row snapshots for the "nothing changed" and "same rows" proofs (070's
-- shape). Written as a signed-in identity, so authenticated needs the grant.
create temp table snap (k text primary key, j jsonb);
grant select, insert on snap to anon, authenticated;

-- ---------------------------------------------------------------------------
-- §0. FIXTURE
-- ---------------------------------------------------------------------------
select tests.create_user('n6.customer@brazos.test',  'Cleo Customer')  as customer  \gset
select tests.create_user('n6.worker1@brazos.test',   'Wan Worker')     as worker1   \gset
select tests.create_user('n6.customer2@brazos.test', 'Cato Customer')  as customer2 \gset
select tests.create_user('n6.worker2@brazos.test',   'Wu Worker')      as worker2   \gset
select tests.create_user('n6.stranger@brazos.test',  'Sal Stranger')   as stranger  \gset
insert into fx values
  ('customer', :'customer'), ('worker1', :'worker1'),
  ('customer2', :'customer2'), ('worker2', :'worker2'), ('stranger', :'stranger');

-- Hire the worker on a fresh job through the real RPCs and stop at assigned.
-- (090_reputation.sql lines 87-105, verbatim.)
create or replace function tests.r8_hire(p_customer uuid, p_worker uuid, p_amount integer, p_title text)
returns uuid language plpgsql as $$
declare
  v_job uuid;
  v_offer uuid;
begin
  perform tests.authenticate_as(p_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'R8a probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_cents := p_amount, p_address_line := '8 Reputation Way'
  )).id into v_job;
  perform tests.authenticate_as(p_worker);
  v_offer := public.create_offer(p_amount_cents := p_amount, p_job_id := v_job, p_message := 'R8a bid');
  perform tests.authenticate_as(p_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  return v_job;
end $$;

-- The whole chain: hire, fund on the sandbox path, start, complete with one
-- photo — the completed_at clock every review window here hangs off.
-- (090_reputation.sql lines 109-122, verbatim.)
create or replace function tests.r8_complete_job(p_customer uuid, p_worker uuid, p_amount integer, p_title text)
returns uuid language plpgsql as $$
declare
  v_job uuid := tests.r8_hire(p_customer, p_worker, p_amount, p_title);
begin
  perform tests.authenticate_as(p_customer);
  perform public.sandbox_authorize_job_payment(v_job);
  perform public.sandbox_hold_job_payment(v_job);
  perform tests.authenticate_as(p_worker);
  perform public.transition_job_status(v_job, 'in_progress');
  perform public.transition_job_status(v_job, 'completed', '["https://example.com/r8a-done.jpg"]'::jsonb);
  perform tests.clear_auth();
  return v_job;
end $$;

-- ---------------------------------------------------------------------------
-- §1. THE COLD START — before a single review exists anywhere: case 6's
--     no-review row on an empty platform (the naked 4.5 prior, 090 §1), and
--     case 1's first equality.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'stranger');
select is((select count(*) from public.profile_review_summaries(array[:'worker1']::uuid[])), 1::bigint,
  '6: stranger — a never-reviewed worker still gets exactly one row');
select is((select total from public.profile_review_summaries(array[:'worker1']::uuid[])), 0,
  '6: stranger — … totalling zero');
select is((select average from public.profile_review_summaries(array[:'worker1']::uuid[])), null::numeric,
  '6: stranger — … with a null raw average, never invented');
select is((select shown_average from public.profile_review_summaries(array[:'worker1']::uuid[])), 4.5::numeric,
  '6: stranger — … shown_average exactly the 4.5 prior on an empty platform');
select is((select is_new from public.profile_review_summaries(array[:'worker1']::uuid[])), true,
  '6: stranger — … and New');
select is((select shown_average from public.profile_review_summaries(array[:'customer']::uuid[], 'customer')), 4.5::numeric,
  '6: stranger — the customer role starts at the same 4.5 prior');
select is(
  (select to_jsonb(b) - 'user_id' - 'completed_jobs' - 'on_time_pct' from public.profile_review_summaries(array[:'worker1']::uuid[]) b),
  (select to_jsonb(s) from public.profile_review_summary(:'worker1') s),
  '1: stranger — on the empty platform the batch row for worker1 equals the single, column for column');
select is(
  (select to_jsonb(b) - 'user_id' - 'completed_jobs' - 'on_time_pct' from public.profile_review_summaries(array[:'customer']::uuid[], 'customer') b),
  (select to_jsonb(s) from public.profile_review_summary(:'customer', 'customer') s),
  '1: stranger — … and so does the customer''s customer-role row');

-- ---------------------------------------------------------------------------
-- §2. JA (revealed by counterpart) and JB (revealed by time, SURGERY) —
--     worker1's two revealed reviews, 090 §2-§3's shape. JA also carries
--     worker1's 4 about the customer: the customer role's first revealed row.
-- ---------------------------------------------------------------------------
select tests.r8_complete_job(:'customer', :'worker1', 5000, 'n6 JA counterpart') as ja \gset
select tests.r8_complete_job(:'customer', :'worker1', 5200, 'n6 JB time') as jb \gset
insert into fx values ('ja', :'ja'), ('jb', :'jb');
select is((select count(*) from public.jobs where id in (:'ja', :'jb') and status = 'completed'), 2::bigint,
  '0: fixture — JA and JB ran the whole hire-fund-complete chain (canary for every job below)');
select tests.authenticate_as(:'customer');
select (public.create_review(:'ja', :'worker1', 5, 'n6 great work', '[]'::jsonb, true)).id as r_ja_cw \gset
select tests.authenticate_as(:'worker1');
select (public.create_review(:'ja', :'customer', 4, 'n6 great client', '[]'::jsonb, true)).id as r_ja_wc \gset
select tests.authenticate_as(:'customer');
select (public.create_review(:'jb', :'worker1', 3, 'n6 fine work')).id as r_jb \gset
select tests.clear_auth();
update public.reviews set created_at = created_at - interval '8 days' where id = :'r_jb';   -- SURGERY
insert into fx values ('r_ja_cw', :'r_ja_cw'), ('r_ja_wc', :'r_ja_wc'), ('r_jb', :'r_jb');

-- ---------------------------------------------------------------------------
-- §3. CASE 2 — UNREVEALED EXCLUDED. JC's review is lone and fresh: blind. The
--     batch row for worker1 is snapshotted before it lands and compared after.
-- ---------------------------------------------------------------------------
select tests.r8_complete_job(:'customer', :'worker1', 5400, 'n6 JC blind') as jc \gset
insert into fx values ('jc', :'jc');
select tests.authenticate_as(:'stranger');
insert into snap select 'w1_before', to_jsonb(b) from public.profile_review_summaries(array[:'worker1']::uuid[]) b;
select tests.authenticate_as(:'customer');
select (public.create_review(:'jc', :'worker1', 4, 'n6 blind four')).id as r_jc \gset
insert into fx values ('r_jc', :'r_jc');
select tests.authenticate_as(:'worker1');
select is((select count(*) from public.reviews where id = :'r_jc'), 0::bigint,
  '2: worker1 — the lone fresh review about them is blind: they read zero rows (090 §3''s control)');
select tests.authenticate_as(:'stranger');
select is(
  (select to_jsonb(b) from public.profile_review_summaries(array[:'worker1']::uuid[]) b),
  (select j from snap where k = 'w1_before'),
  '2: stranger — the batch row for worker1 is identical before and after the blind review landed');
select is((select total from public.profile_review_summaries(array[:'worker1']::uuid[])), 2,
  '2: stranger — total is the two REVEALED reviews: JA by counterpart, JB by time');
select is((select shown_average from public.profile_review_summaries(array[:'worker1']::uuid[])), 4.0::numeric,
  '2: stranger — shown_average is exactly (5*4.0 + 8)/(5 + 2) = 4.0: the blind 4 is outside both m and the sum');
select is((select five from public.profile_review_summaries(array[:'worker1']::uuid[])), 1,
  '2: stranger — the five bucket holds JA''s 5');
select is((select three from public.profile_review_summaries(array[:'worker1']::uuid[])), 1,
  '2: stranger — the three bucket holds JB''s 3');
select is((select four from public.profile_review_summaries(array[:'worker1']::uuid[])), 0,
  '2: stranger — the four bucket is empty: JC''s 4 is in none');

-- ---------------------------------------------------------------------------
-- §4. CASE 4 — "NEW" AT TWO. JD and JE for worker2, revealed by time
--     (SURGERY, as 090 §6). On JD worker2 also reviews customer2 — a 1 — so
--     the customer role's ledger is {4, 1} and its prior 2.5 differs from the
--     worker role's 4.0 (case 3 leans on that).
-- ---------------------------------------------------------------------------
select tests.r8_complete_job(:'customer2', :'worker2', 4500, 'n6 JD shrink 1') as jd \gset
select tests.r8_complete_job(:'customer2', :'worker2', 4600, 'n6 JE shrink 2') as je \gset
insert into fx values ('jd', :'jd'), ('je', :'je');
select tests.authenticate_as(:'customer2');
select (public.create_review(:'jd', :'worker2', 5, 'n6 shrink five')).id as r_jd \gset
select (public.create_review(:'je', :'worker2', 4, 'n6 shrink four')).id as r_je \gset
select tests.authenticate_as(:'worker2');
select (public.create_review(:'jd', :'customer2', 1, 'n6 rough client')).id as r_jd_wc \gset
select tests.clear_auth();
update public.reviews set created_at = created_at - interval '8 days' where id in (:'r_jd', :'r_je');   -- SURGERY
insert into fx values ('r_jd', :'r_jd'), ('r_je', :'r_je'), ('r_jd_wc', :'r_jd_wc');
select tests.authenticate_as(:'stranger');
select is((select total from public.profile_review_summaries(array[:'worker2']::uuid[])), 2,
  '4: stranger — worker2 totals two revealed reviews');
select is((select is_new from public.profile_review_summaries(array[:'worker2']::uuid[])), true,
  '4: stranger — two revealed reviews is still New');
select is(
  (select to_jsonb(b) - 'user_id' - 'completed_jobs' - 'on_time_pct' from public.profile_review_summaries(array[:'worker2']::uuid[]) b),
  (select to_jsonb(s) from public.profile_review_summary(:'worker2') s),
  '1: stranger — at two revealed reviews the batch row for worker2 equals the single');

-- ---------------------------------------------------------------------------
-- §5. CASE 4 — NOT NEW AT THREE, AND THE EXACT SHRINKAGE (090 §7's ledger:
--     worker1 {5, 3} + worker2 {5, 4, 3}, JC's 4 blind -> m = 4.0).
-- ---------------------------------------------------------------------------
select tests.r8_complete_job(:'customer2', :'worker2', 4700, 'n6 JF shrink 3') as jf \gset
insert into fx values ('jf', :'jf');
select tests.authenticate_as(:'customer2');
select (public.create_review(:'jf', :'worker2', 3, 'n6 shrink three')).id as r_jf \gset
select tests.clear_auth();
update public.reviews set created_at = created_at - interval '8 days' where id = :'r_jf';   -- SURGERY
insert into fx values ('r_jf', :'r_jf');
select tests.authenticate_as(:'stranger');
select is((select total from public.profile_review_summaries(array[:'worker2']::uuid[])), 3,
  '4: stranger — worker2 totals three revealed reviews');
select is((select is_new from public.profile_review_summaries(array[:'worker2']::uuid[])), false,
  '4: stranger — three revealed reviews is no longer New');
select is((select shown_average from public.profile_review_summaries(array[:'worker2']::uuid[])), 4.0::numeric,
  '4: stranger — worker2''s shown_average is exactly (5*4.0 + 12)/(5 + 3) = 4.0');
select is((select average from public.profile_review_summaries(array[:'worker2']::uuid[])), 4.00::numeric,
  '4: stranger — … while the raw average stays 12/3 = 4.00');

-- ---------------------------------------------------------------------------
-- §6. CASE 1 — BATCH EQUALS SINGLE, from ONE call carrying every id, for both
--     roles. The three columns the batch adds are removed from its row; what
--     is left must be the single's row exactly.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'stranger');
select is((select count(*) from public.profile_review_summaries(array[:'customer', :'worker1', :'customer2', :'worker2', :'stranger']::uuid[])), 5::bigint,
  '1: stranger — five ids in, five worker-role rows out');
select is((select count(*) from public.profile_review_summaries(array[:'customer', :'worker1', :'customer2', :'worker2', :'stranger']::uuid[], 'customer')), 5::bigint,
  '1: stranger — … and five customer-role rows');
insert into snap
  select 'w:' || b.user_id::text, to_jsonb(b) - 'user_id' - 'completed_jobs' - 'on_time_pct'
    from public.profile_review_summaries(array[:'customer', :'worker1', :'customer2', :'worker2', :'stranger']::uuid[]) b;
insert into snap
  select 'c:' || b.user_id::text, to_jsonb(b) - 'user_id' - 'completed_jobs' - 'on_time_pct'
    from public.profile_review_summaries(array[:'customer', :'worker1', :'customer2', :'worker2', :'stranger']::uuid[], 'customer') b;
select is((select j from snap where k = 'w:' || :'worker1'), (select to_jsonb(s) from public.profile_review_summary(:'worker1') s),
  '1: stranger — worker1, worker role: the batch row equals the single (two revealed, one blind)');
select is((select j from snap where k = 'c:' || :'worker1'), (select to_jsonb(s) from public.profile_review_summary(:'worker1', 'customer') s),
  '1: stranger — worker1, customer role: equal (no customer-role reviews)');
select is((select j from snap where k = 'w:' || :'worker2'), (select to_jsonb(s) from public.profile_review_summary(:'worker2') s),
  '1: stranger — worker2, worker role: equal (three revealed, not New)');
select is((select j from snap where k = 'c:' || :'worker2'), (select to_jsonb(s) from public.profile_review_summary(:'worker2', 'customer') s),
  '1: stranger — worker2, customer role: equal');
select is((select j from snap where k = 'w:' || :'customer'), (select to_jsonb(s) from public.profile_review_summary(:'customer') s),
  '1: stranger — customer, worker role: equal (no worker-role reviews)');
select is((select j from snap where k = 'c:' || :'customer'), (select to_jsonb(s) from public.profile_review_summary(:'customer', 'customer') s),
  '1: stranger — customer, customer role: equal (one revealed customer-role review)');
select is((select j from snap where k = 'w:' || :'customer2'), (select to_jsonb(s) from public.profile_review_summary(:'customer2') s),
  '1: stranger — customer2, worker role: equal');
select is((select j from snap where k = 'c:' || :'customer2'), (select to_jsonb(s) from public.profile_review_summary(:'customer2', 'customer') s),
  '1: stranger — customer2, customer role: equal (one revealed customer-role review, a 1)');
select is((select j from snap where k = 'w:' || :'stranger'), (select to_jsonb(s) from public.profile_review_summary(:'stranger') s),
  '1: stranger — the stranger, worker role: equal (nothing at all)');
select is((select j from snap where k = 'c:' || :'stranger'), (select to_jsonb(s) from public.profile_review_summary(:'stranger', 'customer') s),
  '1: stranger — the stranger, customer role: equal');

-- ---------------------------------------------------------------------------
-- §7. CASE 3 — OTHER ROLE EXCLUDED, and each role's OWN prior.
-- ---------------------------------------------------------------------------
select is((select total from public.profile_review_summaries(array[:'customer']::uuid[])), 0,
  '3: stranger — the review about JA''s client is NOT in the customer''s worker row');
select is((select total from public.profile_review_summaries(array[:'customer']::uuid[], 'customer')), 1,
  '3: stranger — … it is in their customer row');
select is((select total from public.profile_review_summaries(array[:'worker1']::uuid[], 'customer')), 0,
  '3: stranger — worker1''s two worker-role reviews are NOT in their customer row');
select is((select total from public.profile_review_summaries(array[:'worker1']::uuid[])), 2,
  '3: stranger — … they are in their worker row (positive control)');
select is((select total from public.profile_review_summaries(array[:'customer2']::uuid[])), 0,
  '3: stranger — customer2''s customer-role 1 is NOT in their worker row');
select is((select total from public.profile_review_summaries(array[:'customer2']::uuid[], 'customer')), 1,
  '3: stranger — … it is in their customer row');
select is((select total from public.profile_review_summaries(array[:'worker2']::uuid[], 'customer')), 0,
  '3: stranger — worker2 has no customer-role reviews');
select is((select shown_average from public.profile_review_summaries(array[:'customer']::uuid[], 'customer')), 2.75::numeric,
  '3: stranger — the customer role shrinks toward ITS OWN prior: m = (4+1)/2 = 2.5, so (5*2.5 + 4)/(5+1) = 2.75, not the worker role''s 4.0');
select is((select shown_average from public.profile_review_summaries(array[:'customer2']::uuid[], 'customer')), 2.25::numeric,
  '3: stranger — … and customer2''s is (5*2.5 + 1)/(5+1) = 2.25');
select throws_ok($$ select * from public.profile_review_summaries(array[(select v from fx where k = 'worker1')]::uuid[], 'boss') $$,
  'P0001', 'Role must be worker or customer', '3: stranger — an unknown role is an error, not a guess (the single''s sentence)');

-- ---------------------------------------------------------------------------
-- §8. CASE 5 — completed_jobs AND on_time_pct RIDE ALONG. JG is hired to
--     worker1 and left at assigned: it must not count.
-- ---------------------------------------------------------------------------
select tests.r8_hire(:'customer', :'worker1', 5600, 'n6 JG assigned only') as jg \gset
insert into fx values ('jg', :'jg');
select tests.clear_auth();
update public.profiles set on_time_pct = 92.5 where id = :'worker1';   -- SURGERY: no RPC writes the column
select tests.authenticate_as(:'stranger');
select is((select completed_jobs from public.profile_review_summaries(array[:'worker1']::uuid[])),
  (select coalesce(sum(job_count), 0)::integer from public.worker_job_stats(:'worker1')),
  '5: stranger — worker1''s completed_jobs equals the sum of worker_job_stats(p_worker).job_count');
select is((select completed_jobs from public.profile_review_summaries(array[:'worker1']::uuid[])), 3,
  '5: stranger — … which is 3: JA, JB, JC; the assigned-only JG does not count');
select is((select completed_jobs from public.profile_review_summaries(array[:'worker2']::uuid[])),
  (select coalesce(sum(job_count), 0)::integer from public.worker_job_stats(:'worker2')),
  '5: stranger — worker2''s completed_jobs equals worker_job_stats too (3: JD, JE, JF)');
select is((select completed_jobs from public.profile_review_summaries(array[:'customer']::uuid[], 'customer')),
  (select completed::integer from public.client_job_stats(:'customer')),
  '5: stranger — the customer''s customer-role completed_jobs equals client_job_stats(p_client).completed');
select is((select completed_jobs from public.profile_review_summaries(array[:'customer']::uuid[], 'customer')), 3,
  '5: stranger — … which is 3: JA, JB, JC completed; JG is only assigned');
select is((select completed_jobs from public.profile_review_summaries(array[:'customer']::uuid[])), 0,
  '5: stranger — the customer''s WORKER-role completed_jobs is 0: they never worked a job');
select is((select completed_jobs from public.profile_review_summaries(array[:'worker1']::uuid[], 'customer')), 0,
  '5: stranger — worker1''s CUSTOMER-role completed_jobs is 0: they never posted one');
select is((select on_time_pct from public.profile_review_summaries(array[:'worker1']::uuid[])), 92.5::numeric,
  '5: stranger — on_time_pct is profiles.on_time_pct: the 92.5 set by surgery comes back');
select is((select on_time_pct from public.profile_review_summaries(array[:'worker1']::uuid[], 'customer')), 92.5::numeric,
  '5: stranger — … in the customer role too: one profile column, whichever role is asked');
select is((select on_time_pct from public.profile_review_summaries(array[:'worker2']::uuid[])), null::numeric,
  '5: stranger — worker2''s on_time_pct was never set: null stays null, never zero');

-- ---------------------------------------------------------------------------
-- §9. CASE 6 — IDS WITHOUT REVIEWS, DUPLICATES, EMPTY, ORDER.
-- ---------------------------------------------------------------------------
select is((select count(*) from public.profile_review_summaries(array[:'stranger']::uuid[])), 1::bigint,
  '6: stranger — a real profile with no reviews returns exactly one row');
select is((select total from public.profile_review_summaries(array[:'stranger']::uuid[])), 0,
  '6: stranger — … total 0');
select is((select average from public.profile_review_summaries(array[:'stranger']::uuid[])), null::numeric,
  '6: stranger — … average null');
select is((select shown_average from public.profile_review_summaries(array[:'stranger']::uuid[])), 4.0::numeric,
  '6: stranger — … shown_average is m as it stands NOW: (5*4.0 + 0)/(5 + 0) = 4.0, not the 4.5 of an empty platform');
select is((select is_new from public.profile_review_summaries(array[:'stranger']::uuid[])), true,
  '6: stranger — … and New');
select is((select completed_jobs from public.profile_review_summaries(array[:'stranger']::uuid[])), 0,
  '6: stranger — … completed_jobs 0');
select is((select on_time_pct from public.profile_review_summaries(array[:'stranger']::uuid[])), null::numeric,
  '6: stranger — … on_time_pct null');
select is((select count(*) from public.profile_review_summaries(array['ffffffff-ffff-4fff-8fff-ffffffffffff']::uuid[])), 1::bigint,
  '6: stranger — a uuid that is no profile at all still returns one row');
select is((select (total = 0 and average is null and completed_jobs = 0 and on_time_pct is null and is_new)
             from public.profile_review_summaries(array['ffffffff-ffff-4fff-8fff-ffffffffffff']::uuid[])), true,
  '6: stranger — … total 0, average null, completed_jobs 0, on_time_pct null, New');
select is((select count(*) from public.profile_review_summaries(array[:'worker1', :'worker1', :'worker1']::uuid[])), 1::bigint,
  '6: stranger — a duplicated id returns one row');
select is((select total from public.profile_review_summaries(array[:'worker1', :'worker1', :'worker1']::uuid[])), 2,
  '6: stranger — … with the reviews counted once');
select is((select count(*) from public.profile_review_summaries(array[]::uuid[])), 0::bigint,
  '6: stranger — an empty array returns zero rows');
select is((select count(*) from public.profile_review_summaries(null::uuid[])), 0::bigint,
  '6: stranger — … and so does a null array');
select is(
  (select array_agg(user_id) from public.profile_review_summaries(array[:'worker2', :'stranger', :'customer', :'worker1', :'customer2']::uuid[])),
  (select array_agg(user_id order by user_id) from public.profile_review_summaries(array[:'worker2', :'stranger', :'customer', :'worker1', :'customer2']::uuid[])),
  '6: stranger — the rows come back ordered by user_id whatever the input order');
select is(
  (select jsonb_agg(to_jsonb(b)) from public.profile_review_summaries(array[:'worker2', :'stranger', :'customer', :'worker1', :'customer2']::uuid[]) b),
  (select jsonb_agg(to_jsonb(b)) from public.profile_review_summaries(array[:'customer', :'worker1', :'customer2', :'worker2', :'stranger']::uuid[]) b),
  '6: stranger — two calls with the same ids in a different order agree row for row');

-- ---------------------------------------------------------------------------
-- §10. CASE 7 — AUTHORIZATION. The posture 090 §9 asserts for the single,
--      mirrored; the anon call itself; owner and stranger see the same rows;
--      no session is zero, not an error.
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.profile_review_summaries(uuid[], text)', 'EXECUTE'),
  '7: anon holds no EXECUTE on profile_review_summaries (090 §9''s posture for the single, mirrored)');
select ok(has_function_privilege('authenticated', 'public.profile_review_summaries(uuid[], text)', 'EXECUTE'),
  '7: authenticated may execute profile_review_summaries');
select tests.authenticate_anon();
select throws_ok($$ select * from public.profile_review_summaries(array[(select v from fx where k = 'worker1')]::uuid[], 'worker') $$,
  '42501', 'permission denied for function profile_review_summaries',
  '7: anon — the call itself is refused with 42501');
select tests.authenticate_as(:'worker1');
insert into snap select 'owner:w', jsonb_agg(to_jsonb(b))
  from public.profile_review_summaries(array[:'customer', :'worker1', :'customer2', :'worker2', :'stranger']::uuid[]) b;
insert into snap select 'owner:c', jsonb_agg(to_jsonb(b))
  from public.profile_review_summaries(array[:'customer', :'worker1', :'customer2', :'worker2', :'stranger']::uuid[], 'customer') b;
select is((select total from public.profile_review_summaries(array[:'worker1']::uuid[])), 2,
  '7: worker1 (the owner) — reads their own two revealed reviews (positive control)');
select tests.authenticate_as(:'stranger');
select is(
  (select jsonb_agg(to_jsonb(b)) from public.profile_review_summaries(array[:'customer', :'worker1', :'customer2', :'worker2', :'stranger']::uuid[]) b),
  (select j from snap where k = 'owner:w'),
  '7: stranger — the same ids return the same worker-role rows the owner saw');
select is(
  (select jsonb_agg(to_jsonb(b)) from public.profile_review_summaries(array[:'customer', :'worker1', :'customer2', :'worker2', :'stranger']::uuid[], 'customer') b),
  (select j from snap where k = 'owner:c'),
  '7: stranger — … and the same customer-role rows');
select tests.clear_auth();
select is((select total from public.profile_review_summaries(array[:'worker1']::uuid[])),
  (select total from public.profile_review_summary(:'worker1')),
  '7: runner, no session — the batch mirrors the single: the auth.uid() guard zeroes both, neither raises');
select is((select total from public.profile_review_summaries(array[:'worker1']::uuid[])), 0,
  '7: runner, no session — … and that mirrored count is 0');
select is((select shown_average from public.profile_review_summaries(array[:'worker1']::uuid[])), 4.0::numeric,
  '7: runner, no session — … while m is still computed (4.0): the guard is on the per-user rows, as in the single');

-- ---------------------------------------------------------------------------
-- §11. CASE 2, THE PAIR — JC's review revealed by time (SURGERY) now counts.
--      Last, so nothing above depends on it.
-- ---------------------------------------------------------------------------
select tests.clear_auth();
update public.reviews set created_at = created_at - interval '8 days' where id = :'r_jc';   -- SURGERY
select tests.authenticate_as(:'stranger');
select is((select total from public.profile_review_summaries(array[:'worker1']::uuid[])), 3,
  '2: stranger — once JC''s review is 8 days old it counts: worker1 totals three');
select is((select four from public.profile_review_summaries(array[:'worker1']::uuid[])), 1,
  '2: stranger — … and the 4 is now in its bucket');
select is((select is_new from public.profile_review_summaries(array[:'worker1']::uuid[])), false,
  '2: stranger — … so worker1 is no longer New');
select is(
  (select to_jsonb(b) - 'user_id' - 'completed_jobs' - 'on_time_pct' from public.profile_review_summaries(array[:'worker1']::uuid[]) b),
  (select to_jsonb(s) from public.profile_review_summary(:'worker1') s),
  '1: stranger — and the batch still equals the single after the reveal');

select * from finish();
rollback;
