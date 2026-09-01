-- 090_reputation.sql — the R8a proofs: 20260925000100_r8a_reputation.sql
-- proven on the local stack before the pipeline applies it anywhere. Each
-- section is one of the five operator decisions (docs/DECISIONS.md,
-- 2026-08-31) made executable. §10 (R8b-s) extends the file to
-- 20260925000200_r8bs_review_notification.sql — the notification side of D1.
--
-- THE CAST (named once; every assertion says which of these it ran as):
--   customer    posts worker1's three jobs (JA, JB, JC)
--   worker1     hired and completes all three; the double-blind subject
--   customer2   posts worker2's three jobs (JD, JE, JF); the unrelated viewer
--   worker2     the shrinkage / is_new subject — a fresh reviewee
--   customer3   the client_job_stats subject: five jobs, two workers
--   worker3     hired on customer3's J1, J2 and J5 (the repeat hire)
--   worker4     hired on customer3's J3, which is then cancelled
--   anon        no session at all (the grant assertions)
--   runner      the connection's own role, RLS bypassed — fixture surgery
--               (backdating created_at / completed_at, cancelling jobs), each
--               marked SURGERY, and ground truth
--
-- THE FIXTURE: every job goes through the real RPCs (create_job,
-- create_offer, accept_offer, the sandbox funding pair, transition_job_status
-- with a completion photo) via tests.r8_complete_job — the same chain
-- 040_authz.sql §0 uses. tests.r8_hire stops at assigned, for the
-- cancelled-after-hire job. Reviews go through create_review only. Everything
-- rolls back.
--
-- WHAT IS PROVEN, section by section:
--   §1 D4 cold start on an empty platform: total 0, average null,
--      shown_average exactly the 4.5 prior, is_new — for both roles.
--   §2 D1 reveal by counterpart: the second review makes both visible to
--      their reviewees; blind before, visible after.
--   §3 D1 reveal by time: a lone review backdated 8 days (SURGERY) becomes
--      readable by its reviewee.
--   §4 D2 the 30-day window from completed_at: 31 days -> refused with the
--      one sentence, 29 days -> lands; D5 would_again stored AND returned,
--      null when the reviewer skipped it.
--   §5 D3 role split: a review about the job's client appears under
--      p_role => 'customer' and NOT under the worker default, and vice
--      versa; an unknown role is an error on both readers.
--   §6 D4 is_new true at 2 revealed reviews.
--   §7 D4 is_new false at 3; shown_average equals the exact hand-computed
--      (5m + sum)/(5 + n) for worker2 AND worker1, blind rows excluded.
--   §8 D5 client_job_stats: posted/completed/cancelled unchanged,
--      cancelled_after_hire counts only assigned cancellations, rehires
--      counts the repeat hires, would_again_yes/total count only REVEALED
--      customer-role reviews.
--   §9 the grant posture of everything the migration created or recreated:
--      anon refused on all four app RPCs, authenticated may execute them;
--      review_is_revealed is the one deliberate anon grant (the reviews
--      SELECT policy calls it and must evaluate for anon's column-probe
--      SELECT grant — B in the run contract, fenced in 040_authz.sql §17).
--   §10 R8b-s: the review notification honours the blind window — the outbox
--      row enqueued by a blind insert carries no rating and says why; the
--      row enqueued by a revealing insert keeps the baseline star copy; the
--      reviews_notify trigger itself is byte-for-byte the baseline's.
--
-- PAIRING: every denial or zero-count sits beside the positive control that
-- proves the row exists for the identity meant to see it.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(61);

-- psql does not interpolate :'vars' inside dollar quotes, so ids also live in
-- this temp table for the statements throws_ok/lives_ok execute.
create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

-- ---------------------------------------------------------------------------
-- §0. FIXTURE
-- ---------------------------------------------------------------------------
select tests.create_user('r8a.customer@brazos.test',  'Cleo Customer')  as customer  \gset
select tests.create_user('r8a.worker1@brazos.test',   'Wan Worker')     as worker1   \gset
select tests.create_user('r8a.customer2@brazos.test', 'Cato Customer')  as customer2 \gset
select tests.create_user('r8a.worker2@brazos.test',   'Wu Worker')      as worker2   \gset
select tests.create_user('r8a.customer3@brazos.test', 'Cira Customer')  as customer3 \gset
select tests.create_user('r8a.worker3@brazos.test',   'Wre Worker')     as worker3   \gset
select tests.create_user('r8a.worker4@brazos.test',   'Wio Worker')     as worker4   \gset
insert into fx values
  ('customer', :'customer'), ('worker1', :'worker1'),
  ('customer2', :'customer2'), ('worker2', :'worker2'),
  ('customer3', :'customer3'), ('worker3', :'worker3'), ('worker4', :'worker4');

-- Hire the worker on a fresh job through the real RPCs and stop at assigned.
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
-- §1. D4 COLD START — before a single review exists anywhere, both roles show
--     the naked 4.5 prior: (5*4.5 + 0) / (5 + 0) = 4.5, and "New".
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select is((select total from public.profile_review_summary(:'worker1')), 0,
  '1: customer — a never-reviewed worker totals zero');
select is((select average from public.profile_review_summary(:'worker1')), null::numeric,
  '1: … their raw average is null, never invented');
select is((select shown_average from public.profile_review_summary(:'worker1')), 4.5::numeric,
  '1: … and shown_average is exactly the 4.5 prior on an empty platform');
select is((select is_new from public.profile_review_summary(:'worker1')), true,
  '1: … and they are New');
select is((select shown_average from public.profile_review_summary(:'customer', 'customer')), 4.5::numeric,
  '1: customer — the customer role starts at the same 4.5 prior');

-- ---------------------------------------------------------------------------
-- §2. D1 REVEAL BY COUNTERPART — JA. The customer's review is blind to
--     worker1 until worker1 writes theirs; then both read both.
-- ---------------------------------------------------------------------------
select tests.r8_complete_job(:'customer', :'worker1', 5000, 'R8a JA counterpart') as ja \gset
insert into fx values ('ja', :'ja');
select is((select status::text from public.jobs where id = :'ja'), 'completed',
  '2: fixture — JA ran the whole hire-fund-complete chain (canary for every job below)');
select tests.authenticate_as(:'customer');
select (public.create_review(:'ja', :'worker1', 5, 'R8a great work', '[]'::jsonb, true)).id as r_ja_cw \gset
insert into fx values ('r_ja_cw', :'r_ja_cw');
select is((select count(*) from public.reviews where id = :'r_ja_cw'), 1::bigint,
  '2: customer (reviewer) — reads their own review the moment it is written');
select tests.authenticate_as(:'worker1');
select is((select count(*) from public.reviews where id = :'r_ja_cw'), 0::bigint,
  '2: worker1 (reviewee) — reads ZERO rows while the review is blind');
select lives_ok($$ select public.create_review((select v from fx where k = 'ja'), (select v from fx where k = 'customer'), 4, 'R8a great client', '[]'::jsonb, true) $$,
  '2: worker1 — writes the counterpart');
select is((select count(*) from public.reviews where id = :'r_ja_cw'), 1::bigint,
  '2: worker1 — the counterpart revealed the review about them');
select tests.authenticate_as(:'customer');
select is((select count(*) from public.reviews where job_id = :'ja' and reviewee_id = :'customer'), 1::bigint,
  '2: customer — reads the review about them too; both sides now see both');

-- ---------------------------------------------------------------------------
-- §3. D1 REVEAL BY TIME — JB. A lone review, blind; 8 days old (SURGERY), the
--     reviewee reads it.
-- ---------------------------------------------------------------------------
select tests.r8_complete_job(:'customer', :'worker1', 5200, 'R8a JB time') as jb \gset
insert into fx values ('jb', :'jb');
select tests.authenticate_as(:'customer');
select (public.create_review(:'jb', :'worker1', 3, 'R8a fine work')).id as r_jb \gset
insert into fx values ('r_jb', :'r_jb');
select tests.authenticate_as(:'worker1');
select is((select count(*) from public.reviews where id = :'r_jb'), 0::bigint,
  '3: worker1 — a lone fresh review is blind to its reviewee');
select tests.clear_auth();
update public.reviews set created_at = created_at - interval '8 days' where id = :'r_jb';   -- SURGERY
select tests.authenticate_as(:'worker1');
select is((select count(*) from public.reviews where id = :'r_jb'), 1::bigint,
  '3: worker1 — 8 days after it was written, the same lone review is revealed');

-- ---------------------------------------------------------------------------
-- §4. D2 THE 30-DAY WINDOW — JC — and D5 would_again stored and returned.
-- ---------------------------------------------------------------------------
select tests.r8_complete_job(:'customer', :'worker1', 5400, 'R8a JC window') as jc \gset
insert into fx values ('jc', :'jc');
select tests.clear_auth();
update public.jobs set completed_at = now() - interval '31 days' where id = :'jc';   -- SURGERY
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.create_review((select v from fx where k = 'jc'), (select v from fx where k = 'worker1'), 4, 'too late') $$,
  'P0001', 'Review window has closed', '4: customer — 31 days after completion the window is closed');
select tests.clear_auth();
update public.jobs set completed_at = now() - interval '29 days' where id = :'jc';   -- SURGERY
select tests.authenticate_as(:'customer');
select is((public.create_review(:'jc', :'worker1', 4, 'R8a in time', '[]'::jsonb, true)).would_again, true,
  '4: customer — at 29 days the review lands, and create_review RETURNS the stored would_again');
select tests.clear_auth();
select is((select would_again from public.reviews where job_id = :'jc' and reviewer_id = :'customer'), true,
  '4: runner — the row carries would_again = true');
select is((select would_again from public.reviews where id = :'r_jb'), null::boolean,
  '4: runner — a review written without the answer carries NULL, not a guess');

-- ---------------------------------------------------------------------------
-- §5. D3 ROLE SPLIT — JA holds one review about the worker and one about the
--     client. Each appears only under its own role; an unknown role is an
--     error, not a guess. (JC's review stays blind: lone and fresh.)
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer2');
select is((select count(*) from public.profile_reviews(:'customer', p_role => 'customer')), 1::bigint,
  '5: customer2 — the review about JA''s client appears under p_role => customer');
select is((select count(*) from public.profile_reviews(:'customer')), 0::bigint,
  '5: customer2 — … and NOT under the worker default');
select is((select count(*) from public.profile_reviews(:'worker1')), 2::bigint,
  '5: customer2 — worker1''s two REVEALED worker-role reviews (JA, JB) appear under the default; blind JC does not');
select is((select count(*) from public.profile_reviews(:'worker1', p_role => 'customer')), 0::bigint,
  '5: customer2 — worker1 has no customer-role reviews');
select throws_ok($$ select * from public.profile_reviews((select v from fx where k = 'worker1'), p_role => 'boss') $$,
  'P0001', 'Role must be worker or customer', '5: customer2 — profile_reviews refuses an unknown role');
select throws_ok($$ select * from public.profile_review_summary((select v from fx where k = 'worker1'), p_role => 'boss') $$,
  'P0001', 'Role must be worker or customer', '5: customer2 — profile_review_summary refuses it too');

-- ---------------------------------------------------------------------------
-- §6. D4 IS_NEW AT TWO — worker2 gets two revealed reviews (time surgery).
-- ---------------------------------------------------------------------------
select tests.r8_complete_job(:'customer2', :'worker2', 4500, 'R8a JD shrink 1') as jd \gset
select tests.r8_complete_job(:'customer2', :'worker2', 4600, 'R8a JE shrink 2') as je \gset
insert into fx values ('jd', :'jd'), ('je', :'je');
select tests.authenticate_as(:'customer2');
select (public.create_review(:'jd', :'worker2', 5, 'R8a shrink five')).id as r_jd \gset
select (public.create_review(:'je', :'worker2', 4, 'R8a shrink four')).id as r_je \gset
select tests.clear_auth();
update public.reviews set created_at = created_at - interval '8 days' where id in (:'r_jd', :'r_je');   -- SURGERY
select tests.authenticate_as(:'customer');
select is((select total from public.profile_review_summary(:'worker2')), 2,
  '6: customer — worker2 totals two revealed reviews');
select is((select is_new from public.profile_review_summary(:'worker2')), true,
  '6: customer — two revealed reviews is still New');

-- ---------------------------------------------------------------------------
-- §7. D4 IS_NEW AT THREE, AND THE EXACT SHRINKAGE. After JF, the revealed
--     worker-role ledger platform-wide is worker1 {5, 3} + worker2 {5, 4, 3}
--     (JC's 4 is blind), so
--       m = (5+3+5+4+3) / 5 = 20/5 = 4.0
--       worker2: n = 3, sum = 12 -> (5*4.0 + 12) / (5+3) = 32/8  = 4.0
--       worker1: n = 2, sum =  8 -> (5*4.0 +  8) / (5+2) = 28/7  = 4.0
-- ---------------------------------------------------------------------------
select tests.r8_complete_job(:'customer2', :'worker2', 4700, 'R8a JF shrink 3') as jf \gset
insert into fx values ('jf', :'jf');
select tests.authenticate_as(:'customer2');
select (public.create_review(:'jf', :'worker2', 3, 'R8a shrink three')).id as r_jf \gset
select tests.clear_auth();
update public.reviews set created_at = created_at - interval '8 days' where id = :'r_jf';   -- SURGERY
select tests.authenticate_as(:'customer');
select is((select total from public.profile_review_summary(:'worker2')), 3,
  '7: customer — worker2 totals three revealed reviews');
select is((select is_new from public.profile_review_summary(:'worker2')), false,
  '7: customer — three revealed reviews is no longer New');
select is((select shown_average from public.profile_review_summary(:'worker2')), 4.0::numeric,
  '7: customer — worker2''s shown_average is exactly (5*4.0 + 12)/(5 + 3) = 4.0');
select is((select average from public.profile_review_summary(:'worker2')), 4.00::numeric,
  '7: customer — … while the raw average stays 12/3 = 4.00');
select is((select total from public.profile_review_summary(:'worker1')), 2,
  '7: customer — worker1 still totals two: the blind JC review is not counted');
select is((select shown_average from public.profile_review_summary(:'worker1')), 4.0::numeric,
  '7: customer — worker1''s shown_average is exactly (5*4.0 + 8)/(5 + 2) = 4.0');

-- ---------------------------------------------------------------------------
-- §8. D5 CLIENT_JOB_STATS — customer3: J1, J2, J5 completed by worker3 (two
--     repeat hires), J3 hired to worker4 then cancelled (SURGERY — the direct
--     writers' shape, as 030 §8 does), J4 cancelled unhired. Reviews about
--     customer3: J1 true and J2 false both revealed, J5 true left blind.
-- ---------------------------------------------------------------------------
select tests.r8_complete_job(:'customer3', :'worker3', 4000, 'R8a J1 stats') as j1 \gset
select tests.r8_complete_job(:'customer3', :'worker3', 4100, 'R8a J2 stats') as j2 \gset
select tests.r8_complete_job(:'customer3', :'worker3', 4200, 'R8a J5 stats') as j5 \gset
select tests.r8_hire(:'customer3', :'worker4', 4300, 'R8a J3 stats') as j3 \gset
select tests.authenticate_as(:'customer3');
select (public.create_job(
  p_title := 'R8a J4 stats', p_description := 'R8a probe row, rolled back',
  p_category := 'other', p_location := 'Probe Area', p_budget_cents := 4400
)).id as j4 \gset
insert into fx values ('j1', :'j1'), ('j2', :'j2'), ('j3', :'j3'), ('j4', :'j4'), ('j5', :'j5');
select tests.clear_auth();
update public.jobs set status = 'cancelled' where id in (:'j3', :'j4');   -- SURGERY
select tests.authenticate_as(:'worker3');
select (public.create_review(:'j1', :'customer3', 5, 'R8a again yes', '[]'::jsonb, true)).id  as r_j1 \gset
select (public.create_review(:'j2', :'customer3', 4, 'R8a again no',  '[]'::jsonb, false)).id as r_j2 \gset
select (public.create_review(:'j5', :'customer3', 5, 'R8a blind yes', '[]'::jsonb, true)).id  as r_j5 \gset
select tests.clear_auth();
update public.reviews set created_at = created_at - interval '8 days' where id in (:'r_j1', :'r_j2');   -- SURGERY (r_j5 stays blind)
select tests.authenticate_as(:'worker4');
select is((select posted from public.client_job_stats(:'customer3')), 5::bigint,
  '8: worker4 — posted counts all five non-draft jobs');
select is((select completed from public.client_job_stats(:'customer3')), 3::bigint,
  '8: worker4 — completed counts J1, J2, J5');
select is((select cancelled from public.client_job_stats(:'customer3')), 2::bigint,
  '8: worker4 — cancelled counts J3 and J4');
select is((select cancelled_after_hire from public.client_job_stats(:'customer3')), 1::bigint,
  '8: worker4 — cancelled_after_hire counts ONLY J3, the assigned cancellation');
select is((select rehires from public.client_job_stats(:'customer3')), 2::bigint,
  '8: worker4 — rehires: four assigned jobs minus two distinct workers = two repeat hires');
select is((select would_again_yes from public.client_job_stats(:'customer3')), 1::bigint,
  '8: worker4 — would_again_yes counts J1 only; J5''s yes is blind and does not count');
select is((select would_again_total from public.client_job_stats(:'customer3')), 2::bigint,
  '8: worker4 — would_again_total counts the two REVEALED answers, true and false alike');

-- ---------------------------------------------------------------------------
-- §9. GRANTS — everything the migration created or recreated. anon executes
--     none of the four app RPCs; review_is_revealed is the one deliberate
--     anon grant (the reviews SELECT policy must evaluate for anon's
--     column-probe SELECT — 040_authz.sql §17 fences the full allow-list).
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.create_review(uuid, uuid, integer, text, jsonb, boolean)', 'EXECUTE'),
  '9: anon may not execute create_review');
select ok(not has_function_privilege('anon', 'public.profile_reviews(uuid, integer, integer, text)', 'EXECUTE'),
  '9: anon may not execute profile_reviews');
select ok(not has_function_privilege('anon', 'public.profile_review_summary(uuid, text)', 'EXECUTE'),
  '9: anon may not execute profile_review_summary');
select ok(not has_function_privilege('anon', 'public.client_job_stats(uuid)', 'EXECUTE'),
  '9: anon may not execute client_job_stats');
select ok(has_function_privilege('anon', 'public.review_is_revealed(uuid, uuid, uuid, timestamp with time zone)', 'EXECUTE'),
  '9: anon MAY execute review_is_revealed — the deliberate exception the policy needs');
select ok(has_function_privilege('authenticated', 'public.create_review(uuid, uuid, integer, text, jsonb, boolean)', 'EXECUTE'),
  '9: authenticated may execute create_review (positive control)');
select ok(has_function_privilege('authenticated', 'public.profile_reviews(uuid, integer, integer, text)', 'EXECUTE'),
  '9: authenticated may execute profile_reviews');
select ok(has_function_privilege('authenticated', 'public.profile_review_summary(uuid, text)', 'EXECUTE'),
  '9: authenticated may execute profile_review_summary');
select ok(has_function_privilege('authenticated', 'public.client_job_stats(uuid)', 'EXECUTE'),
  '9: authenticated may execute client_job_stats');
select ok(has_function_privilege('authenticated', 'public.review_is_revealed(uuid, uuid, uuid, timestamp with time zone)', 'EXECUTE'),
  '9: authenticated may execute review_is_revealed');

-- ---------------------------------------------------------------------------
-- §10. R8b-s — THE NOTIFICATION STOPS LEAKING THE BLIND WINDOW
--      (20260925000200_r8bs_review_notification.sql). The outbox rows §2's
--      two inserts enqueued, read back as the runner by dedupe key — the
--      050 §4 shape. The customer's review of worker1 (r_ja_cw) was BLIND at
--      insert: no counterpart existed yet, so its notification must name no
--      rating. worker1's counterpart was REVEALED at insert: that insert
--      revealed both, so its notification keeps the baseline copy, star and
--      all. Nothing here inserts a review — the rows are read where §2's
--      trigger firings left them.
-- ---------------------------------------------------------------------------
select tests.clear_auth();
select id as r_ja_wc from public.reviews
 where job_id = (select v from fx where k = 'ja')
   and reviewer_id = (select v from fx where k = 'worker1') \gset

select is((select count(*) from public.notification_outbox where dedupe_key = 'review:' || :'r_ja_cw'::text), 1::bigint,
  '10: runner — exactly one outbox row for the blind insert, at dedupe key review:<review id>');
select is((select recipient_id from public.notification_outbox where dedupe_key = 'review:' || :'r_ja_cw'::text), :'worker1'::uuid,
  '10: runner — the blind row''s recipient is worker1, the reviewee');
select is((select type from public.notification_outbox where dedupe_key = 'review:' || :'r_ja_cw'::text), 'review_received',
  '10: runner — the type is still review_received (the client icon map and its pinning test hang off this string)');
select is((select category from public.notification_outbox where dedupe_key = 'review:' || :'r_ja_cw'::text), 'job_updates',
  '10: runner — the category is still job_updates');
select is((select title from public.notification_outbox where dedupe_key = 'review:' || :'r_ja_cw'::text), 'You got a review',
  '10: runner — the title is unchanged; it never carried the rating');
select is((select data ->> 'screen' from public.notification_outbox where dedupe_key = 'review:' || :'r_ja_cw'::text), 'ProfileMain',
  '10: runner — the tap target is unchanged');
select is((select body from public.notification_outbox where dedupe_key = 'review:' || :'r_ja_cw'::text),
  'Cleo Customer left you a review. It stays hidden until you review them back or seven days pass.',
  '10: runner — the BLIND body byte for byte: a review exists, both D1 reveal arms stated, no rating');
select ok((select body !~ '[0-9★]' from public.notification_outbox where dedupe_key = 'review:' || :'r_ja_cw'::text),
  '10: runner — the blind body carries no digit and no star (seven is spelled out so this can hold)');
select is((select count(*) from public.notification_outbox where dedupe_key = 'review:' || :'r_ja_wc'::text), 1::bigint,
  '10: runner — exactly one outbox row for the revealing insert, at the counterpart''s dedupe key');
select is((select recipient_id from public.notification_outbox where dedupe_key = 'review:' || :'r_ja_wc'::text), :'customer'::uuid,
  '10: runner — the revealed row''s recipient is the customer, that review''s reviewee');
select is((select body from public.notification_outbox where dedupe_key = 'review:' || :'r_ja_wc'::text),
  'Wan Worker left you 4★.',
  '10: runner — the REVEALED body is the baseline copy byte for byte: that insert revealed both, nothing is withheld');
select ok((select body ~ '4★' from public.notification_outbox where dedupe_key = 'review:' || :'r_ja_wc'::text),
  '10: runner — … and it does carry the rating: the pair for the blind negative above');
select is(
  (select pg_get_triggerdef(t.oid) from pg_trigger t
    where t.tgrelid = 'public.reviews'::regclass and t.tgname = 'reviews_notify'),
  'CREATE TRIGGER reviews_notify AFTER INSERT ON public.reviews FOR EACH ROW EXECUTE FUNCTION notify_on_review()',
  '10: runner — the trigger is byte-for-byte the baseline''s: AFTER INSERT, FOR EACH ROW, same function; only the function body moved');

select * from finish();
rollback;
