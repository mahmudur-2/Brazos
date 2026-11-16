-- 494_post_window.sql — the post_window migration (production-36h S4, step C2, verdicts C01a and C09;
-- critic A6-06 and A6-07): no job is posted, or moved, to a day and window already over; nothing new
-- is posted while posting is paused (a post, a direct offer, a repeat visit), and a series run holds
-- the switch for its whole length; no job is newly taken once its booked window has ended. Bids,
-- counters, accepts, payments, starts and completions on existing jobs keep working while posting
-- is paused. A7-03: a new bid or counter on an open job whose window is over is refused, and the
-- closer closes such a job at its window's end (one cutoff).
-- NOT RUN HERE: a pause committed by another session during a post or a series run (two
-- overlapping sessions). The catalog check in §6 shows posting_paused reads the row for share in
-- its one statement (A7-04); by construction the owner's UPDATE then waits for the reader's commit.
--
-- THE CAST: Pia (customer), Will (worker), Sid (a customer with a weekly series), and the runner
-- (RLS bypassed: fixtures, ground truth, the switch, the clock of the sweeps). "Today" is the New York
-- date of the transaction's own clock, computed here. The rules' exact moments are proven at fixed
-- instants written in UTC (the 2026 clock changes included); the RPCs, whose clock is now(), are
-- proven a day away from each edge, and the catalog pins that each passes its own row and now().
--
-- FIXTURE SURGERY, DECLARED: a job "in the past" is posted for tomorrow (and bid on, and hired where
-- the case needs it), then the runner moves its day back; the series' first visit likewise (the
-- series re-anchors itself: series_on_visit_change). The postingEnabled switch is written by the
-- runner, as the owner flips it. Rate counters are reset between posts (445's way). The
-- brazos-job-series timer's ok_at is moved back a day before §5's resumed run (TIMERS). Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(54);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('pw.customer@brazos.test', 'Pia Customer') as customer \gset
select tests.create_user('pw.worker@brazos.test',   'Will Worker')  as worker   \gset
select tests.create_user('pw.series@brazos.test',   'Sid Series')   as scust    \gset
insert into fx values ('customer', :'customer'), ('worker', :'worker'), ('scust', :'scust');

select ((now() at time zone 'America/New_York')::date) as today \gset
select ((now() at time zone 'America/New_York')::date + 1) as tomorrow \gset
select (((now() at time zone 'America/New_York')::date + time '12:00') at time zone 'America/New_York') as noon \gset
select extract(hour from (now() at time zone 'America/New_York'))::int as ny_h \gset

-- A post through the real RPC (as p_customer), counters reset first. Returns the job.
create or replace function tests.pw_post(p_customer uuid, p_title text, p_day date default null,
  p_start smallint default null, p_end smallint default null) returns uuid language plpgsql as $$
declare v_job uuid;
begin
  perform tests.clear_auth();
  update public.rate_counters set hits = 0 where user_id = p_customer;   -- SURGERY: rate counters
  perform tests.authenticate_as(p_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'Post window probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 4000, p_budget_max_cents := 4000, p_address_line := '4 Proof Way',
    p_scheduled_date := p_day, p_arrival_start_hour := p_start, p_arrival_end_hour := p_end
  )).id into v_job;
  perform tests.clear_auth();
  return v_job;
end $$;

-- Will's bid on a job. Returns the offer.
create or replace function tests.pw_bid(p_job uuid) returns uuid language plpgsql as $$
declare v_offer uuid;
begin
  perform tests.clear_auth();
  update public.rate_counters set hits = 0 where user_id = (select v from fx where k = 'worker');   -- SURGERY: rate counters
  perform tests.authenticate_as((select v from fx where k = 'worker'));
  v_offer := public.create_offer(p_amount_cents := 4000, p_job_id := p_job, p_message := 'Post window bid');
  perform tests.clear_auth();
  return v_offer;
end $$;

-- The switch set to p_value (the owner's one UPDATE), then the server's reading of it.
create or replace function tests.pw_reading(p_value jsonb) returns boolean language plpgsql as $$
begin
  update public.app_config set value = p_value where key = 'postingEnabled';   -- SURGERY: the switch
  return public.posting_paused();
end $$;

-- ---------------------------------------------------------------------------
-- §0. ACCESS: the three rules have no caller; the five RPCs keep their grants.
-- ---------------------------------------------------------------------------
select ok(not (select prosecdef from pg_proc where oid = 'public.posting_paused()'::regprocedure)
          and not has_function_privilege('anon', 'public.posting_paused()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.posting_paused()', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.posting_paused()', 'EXECUTE'),
  '0: posting_paused is an invoker helper no caller role can execute');
select ok(not (select prosecdef from pg_proc where oid = 'public.job_window_over(date,smallint,timestamptz)'::regprocedure)
          and not has_function_privilege('anon', 'public.job_window_over(date,smallint,timestamptz)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.job_window_over(date,smallint,timestamptz)', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.job_window_over(date,smallint,timestamptz)', 'EXECUTE'),
  '0: job_window_over is an invoker helper no caller role can execute');
select ok((select bool_and(p.prosecdef
                  and has_function_privilege('authenticated', p.oid, 'EXECUTE')
                  and not has_function_privilege('anon', p.oid, 'EXECUTE')
                  and not has_function_privilege('service_role', p.oid, 'EXECUTE'))
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('create_job', 'update_job_details', 'create_offer', 'accept_offer'))
          and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname in ('create_job', 'update_job_details', 'create_offer', 'accept_offer')) = 4
          and has_function_privilege('service_role', 'public.advance_job_series(timestamptz)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.advance_job_series(timestamptz)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.advance_job_series(timestamptz)', 'EXECUTE'),
  '0: one overload each; create_job, update_job_details, create_offer, accept_offer stay SECURITY DEFINER for authenticated only; advance_job_series stays the service role''s');
select ok(obj_description((select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_job'), 'pg_proc')
            like 'Posts a job for the signed-in caller (SECURITY DEFINER; authenticated only).% post_window: refused while posting is paused (posting_paused) and for a day and window already over (job_window_over).'
          and obj_description((select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'update_job_details'), 'pg_proc')
            like '% post_window: a changed day or window may not be one already over (job_window_over).'
          and obj_description('public.advance_job_series(timestamptz)'::regprocedure, 'pg_proc')
            like 'Idea 14: the hourly work of every active series,% post_window: returns 0 and moves nothing while posting is paused (posting_paused), the postingEnabled row locked for share to the end of the run.',
  '0: the three comments are the live ones, each with its post_window sentence added');

-- ---------------------------------------------------------------------------
-- §1. THE RULES at fixed instants, written in UTC (New York: EST is UTC-5, EDT is UTC-4).
-- ---------------------------------------------------------------------------
select ok(not public.job_window_over(null, 12::smallint, now()) and not public.job_window_over(null, null, '2100-01-01 00:00:00+00'),
  '1: an undated job: its window is never over (no cutoff, however late)');
select ok(not public.job_window_over('2026-12-01', 12::smallint, '2026-12-01 16:59:59+00')
          and public.job_window_over('2026-12-01', 12::smallint, '2026-12-01 17:00:00+00'),
  '1: Dec 1, window to 12:00 EST: over at exactly 17:00:00 UTC (the end instant itself), not a second before');
select ok(not public.job_window_over('2026-12-01', null, '2026-12-02 04:59:59+00')
          and public.job_window_over('2026-12-01', null, '2026-12-02 05:00:00+00'),
  '1: Dec 1 with no window: over at midnight EST after the day');
select ok(not public.job_window_over('2026-03-08', 2::smallint, '2026-03-08 06:59:59+00')
          and public.job_window_over('2026-03-08', 2::smallint, '2026-03-08 07:00:00+00'),
  '1: Mar 8, window to the missing 02:00: read as 03:00 EDT (07:00 UTC), not before');
set local timezone = 'America/New_York';
select ok(not public.job_window_over('2026-11-01', 1::smallint, '2026-11-01 05:30:00+00')
          and public.job_window_over('2026-11-01', 1::smallint, '2026-11-01 06:00:00+00'),
  '1: Nov 1, window to 01:00, which comes twice: read as the second (01:00 EST, 06:00 UTC), the same in a New York session');
reset timezone;

-- ---------------------------------------------------------------------------
-- §2. A NEW POST (create_job), as Pia, against the transaction's own clock.
-- ---------------------------------------------------------------------------
-- The window that ended at least an hour ago: today, to the hour before this one (or late yesterday
-- just after midnight). The window now running: this hour to the next.
select case when :ny_h >= 2 then :'today'::date else :'today'::date - 1 end as gone_day \gset
select case when :ny_h >= 2 then :ny_h - 2 else 22 end as gone_start \gset
select case when :ny_h >= 2 then :ny_h - 1 else 23 end as gone_end \gset
select tests.authenticate_as(:'customer');
select throws_ok(format($$ select public.create_job(p_title := 'PW yesterday', p_description := 'x', p_category := 'other',
    p_location := 'Probe Area', p_budget_cents := 4000, p_scheduled_date := %L, p_arrival_start_hour := 9::smallint,
    p_arrival_end_hour := 12::smallint) $$, :'today'::date - 1), 'P0001',
  'That time has already passed. Pick a later window or another day.',
  '2: yesterday 9 to 12 is refused, in the accepted sentence');
select throws_ok(format($$ select public.create_job(p_title := 'PW gone window', p_description := 'x', p_category := 'other',
    p_location := 'Probe Area', p_budget_cents := 4000, p_scheduled_date := %L, p_arrival_start_hour := %s::smallint,
    p_arrival_end_hour := %s::smallint) $$, :'gone_day', :gone_start, :gone_end), 'P0001',
  'That time has already passed. Pick a later window or another day.',
  '2: a window that ended earlier today is refused: the rule is the window''s end, not the day');
select throws_ok(format($$ select public.create_job(p_title := 'PW yesterday all day', p_description := 'x', p_category := 'other',
    p_location := 'Probe Area', p_budget_cents := 4000, p_scheduled_date := %L) $$, :'today'::date - 1), 'P0001',
  'That time has already passed. Pick a later window or another day.',
  '2: yesterday with no window is refused (it ended at midnight)');
select tests.clear_auth();
select ok(tests.pw_post(:'customer', 'PW window running', :'today'::date, :ny_h::smallint, (:ny_h + 1)::smallint) is not null,
  '2: the window now running (this hour to the next) is posted');
select ok(tests.pw_post(:'customer', 'PW today all day', :'today'::date) is not null
          and tests.pw_post(:'customer', 'PW undated') is not null,
  '2: today with no window, and an undated job, are posted');

-- ---------------------------------------------------------------------------
-- §3. AN EDIT (update_job_details), as Pia: a NEW day or window may not be over.
-- ---------------------------------------------------------------------------
select tests.pw_post(:'customer', 'PW U edit me', :'tomorrow'::date, 9::smallint, 12::smallint) as ju \gset
insert into fx values ('ju', :'ju');
select tests.authenticate_as(:'customer');
select throws_ok(format($$ select public.update_job_details(p_job_id := %L, p_title := 'PW U edit me', p_description := 'x',
    p_category := 'other', p_location := 'Probe Area', p_budget_cents := 4000, p_scheduled_date := %L,
    p_arrival_start_hour := 9::smallint, p_arrival_end_hour := 12::smallint) $$, :'ju', :'today'::date - 1), 'P0001',
  'That time has already passed. Pick a later window or another day.',
  '3: moving an open post to yesterday is refused');
select tests.clear_auth();
update public.jobs set scheduled_date = :'today'::date - 1 where id = :'ju';   -- SURGERY: U is an old post now (its window is over)
select tests.authenticate_as(:'customer');
select is((public.update_job_details(p_job_id := :'ju', p_title := 'PW U renamed', p_description := 'x',
    p_category := 'other', p_location := 'Probe Area', p_budget_cents := 4000, p_scheduled_date := :'today'::date - 1,
    p_arrival_start_hour := 9::smallint, p_arrival_end_hour := 12::smallint)).title, 'PW U renamed',
  '3: an old post keeps its own day: the title is edited with the day and window unchanged');
select throws_ok(format($$ select public.update_job_details(p_job_id := %L, p_title := 'PW U renamed', p_description := 'x',
    p_category := 'other', p_location := 'Probe Area', p_budget_cents := 4000, p_scheduled_date := %L,
    p_arrival_start_hour := 9::smallint, p_arrival_end_hour := 13::smallint) $$, :'ju', :'today'::date - 1), 'P0001',
  'That time has already passed. Pick a later window or another day.',
  '3: a changed window that is over too is refused (only the end hour moved)');
select is((public.update_job_details(p_job_id := :'ju', p_title := 'PW U renamed', p_description := 'x',
    p_category := 'other', p_location := 'Probe Area', p_budget_cents := 4000, p_scheduled_date := :'tomorrow'::date,
    p_arrival_start_hour := 9::smallint, p_arrival_end_hour := 12::smallint)).scheduled_date, :'tomorrow'::date,
  '3: moving it to tomorrow is accepted');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- §4. A HIRE (accept_offer): a NEW acceptance is refused once the booked window has ended.
-- ---------------------------------------------------------------------------
-- R: 9 to 12 two days ago. D: the window that ended at least an hour ago (gone_*: inside the 24
-- hours the old rule still allowed). G2: yesterday, no window (ended at midnight). N: the window
-- now running. Z: undated. K: hired, then its day moved three days back. A7-03: C: yesterday 9 to
-- 12, Will's bid countered by Pia (the counter waits for Will). B: yesterday 9 to 12, no bid yet.
select tests.pw_post(:'customer', 'PW R gone', :'tomorrow'::date, 9::smallint, 12::smallint) as jr \gset
select tests.pw_bid(:'jr') as o_r \gset
select tests.pw_post(:'customer', 'PW D gone lately', :'tomorrow'::date, :gone_start::smallint, :gone_end::smallint) as jd \gset
select tests.pw_bid(:'jd') as o_d \gset
select tests.pw_post(:'customer', 'PW G2 yesterday', :'tomorrow'::date) as jg2 \gset
select tests.pw_bid(:'jg2') as o_g2 \gset
select tests.pw_post(:'customer', 'PW N running', :'today'::date, :ny_h::smallint, (:ny_h + 1)::smallint) as jn \gset
select tests.pw_bid(:'jn') as o_n \gset
select tests.pw_post(:'customer', 'PW Z undated') as jz \gset
select tests.pw_bid(:'jz') as o_z \gset
select tests.pw_post(:'customer', 'PW K taken', :'tomorrow'::date) as jk \gset
select tests.pw_bid(:'jk') as o_k \gset
select tests.pw_post(:'customer', 'PW C countered', :'tomorrow'::date, 9::smallint, 12::smallint) as jc \gset
select tests.pw_bid(:'jc') as o_c \gset
select tests.pw_post(:'customer', 'PW B no bid yet', :'tomorrow'::date, 9::smallint, 12::smallint) as jb \gset
select tests.authenticate_as(:'customer');
select public.counter_offer(:'o_c', 4500) as o_c2 \gset
insert into fx values ('o_r', :'o_r'), ('o_d', :'o_d'), ('o_g2', :'o_g2'), ('o_c2', :'o_c2'), ('jb', :'jb');
select public.accept_offer(:'o_k');
select tests.clear_auth();
update public.jobs set scheduled_date = :'today'::date - 1 where id in (:'jc', :'jb');   -- SURGERY: C's and B's day was yesterday
update public.jobs set scheduled_date = :'today'::date - 2 where id = :'jr';      -- SURGERY: R's day was two days ago
update public.jobs set scheduled_date = :'gone_day'::date where id = :'jd';       -- SURGERY: D's window ended at least an hour ago
update public.jobs set scheduled_date = :'today'::date - 1 where id = :'jg2';     -- SURGERY: G2's day was yesterday
update public.jobs set scheduled_date = :'today'::date - 3 where id = :'jk';      -- SURGERY: K's day was three days ago
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.accept_offer((select v from fx where k = 'o_r')) $$, 'P0001',
  'This job''s booked time has passed, so it can no longer be accepted. Post it again with a new time.',
  '4: R, its window two days gone: the hire is refused, in the accepted sentence');
select throws_ok($$ select public.accept_offer((select v from fx where k = 'o_d')) $$, 'P0001',
  'This job''s booked time has passed, so it can no longer be accepted. Post it again with a new time.',
  '4: D, its window ended within the last day: refused (the old rule took it, and the no-show close would refund it)');
select throws_ok($$ select public.accept_offer((select v from fx where k = 'o_g2')) $$, 'P0001',
  'This job''s booked time has passed, so it can no longer be accepted. Post it again with a new time.',
  '4: G2, yesterday with no window: refused');
select throws_ok($$ select public.counter_offer((select v from fx where k = 'o_d'), 4500) $$, 'P0001',
  'This job''s booked time has passed. Post it again with a new time.',
  '4: A7-03: D: Pia''s counter on a job whose window is over is refused, in the customer''s new-offer sentence');
select tests.authenticate_as(:'worker');
select throws_ok($$ select public.accept_offer((select v from fx where k = 'o_c2')) $$, 'P0001',
  'This job''s booked time has passed, so it can no longer be accepted. Ask the customer to post it again with a new time.',
  '4: A7-03: C: Will accepting Pia''s counter after the window is refused, in the worker''s sentence');
select throws_ok($$ select public.create_offer(p_amount_cents := 4000, p_job_id := (select v from fx where k = 'jb'), p_message := 'late bid') $$, 'P0001',
  'This job''s booked time has passed, so it is closed to new bids.',
  '4: A7-03: B: a new bid on an open job whose window is over is refused');
select tests.clear_auth();
select ok(not exists (select 1 from public.job_offers where job_id = :'jb')
          and (select status::text from public.job_offers where id = :'o_c2') = 'pending',
  '4: A7-03: … and the refused bid and acceptance wrote nothing (B has no offer; Pia''s counter still waits)');
select is((select string_agg(j.title || ':' || j.status::text || '/' || o.status::text || '/'
                             || (select count(*) from public.job_agreements a where a.job_id = j.id)::text, ', ' order by j.title)
             from public.jobs j join public.job_offers o on o.job_id = j.id where j.id in (:'jr', :'jd', :'jg2')),
  'PW D gone lately:open/pending/0, PW G2 yesterday:open/pending/0, PW R gone:open/pending/0',
  '4: … and nothing is written: each job open, its bid pending, no agreement');
select tests.authenticate_as(:'customer');
select is(public.accept_offer(:'o_n'), :'jn'::uuid, '4: N, its window running now: the hire goes through');
select is(public.accept_offer(:'o_z'), :'jz'::uuid, '4: Z, undated: no cutoff, the hire goes through');
select is(public.accept_offer(:'o_k'), :'jk'::uuid, '4: K, already hired, its day now past: accepting again still answers with its job');
select tests.clear_auth();
select public.expire_open_jobs(now());
select is((select string_agg(title || '=' || status::text, ', ' order by title) from public.jobs where id in (:'jr', :'jd', :'jg2')),
  'PW D gone lately=cancelled, PW G2 yesterday=cancelled, PW R gone=cancelled',
  '4: A7-03: the closer run now closes R, D and G2: each window is over (one cutoff, no open job nobody can hire)');
-- A hire made while the window runs keeps the 24 hours the no-show close gives after the window.
select tests.test_fund_job(:'jn');
select public.close_no_show_hires(now());
select is((select status::text from public.jobs where id = :'jn'), 'assigned',
  '4: N, hired and paid while its window runs: the no-show close run now leaves it');
select public.close_no_show_hires(public.job_window_end(:'today'::date, (:ny_h + 1)::smallint) + interval '23 hours 59 minutes');
select is((select status::text from public.jobs where id = :'jn'), 'assigned',
  '4: … and still leaves it 23 hours 59 minutes after its window');

-- ---------------------------------------------------------------------------
-- §5. POSTING PAUSED: nothing new is posted; existing jobs go on.
-- ---------------------------------------------------------------------------
select ok(not public.posting_paused(), '5: the seeded switch (true): posting is on');
select ok(tests.pw_reading('false'::jsonb) and tests.pw_reading('"true"'::jsonb) and tests.pw_reading('null'::jsonb)
          and tests.pw_reading('1'::jsonb) and not tests.pw_reading('true'::jsonb),
  '5: only the jsonb boolean true is on: false, the string "true", null and 1 each pause posting');
update public.app_config set key = 'postingEnabled.moved' where key = 'postingEnabled';   -- SURGERY: the key is absent
select ok(not public.posting_paused(), '5: an absent key is on (as begin_job_payment reads paymentsEnabled)');
update public.app_config set key = 'postingEnabled' where key = 'postingEnabled.moved';   -- SURGERY: the key is back

-- Before the pause: an undated job P, and Sid's weekly series, hired, anchored four days ago.
select tests.pw_post(:'customer', 'PW P goes on', null) as jp \gset
select tests.pw_post(:'scust', 'PW S clean the flat', :'tomorrow'::date, 10::smallint, 12::smallint) as js \gset
select tests.authenticate_as(:'scust');
select (public.start_job_series(:'js', 'weekly')).id as series \gset
select tests.clear_auth();
select tests.pw_bid(:'js') as o_s \gset
select tests.authenticate_as(:'scust');
select public.accept_offer(:'o_s');
select tests.clear_auth();
update public.jobs set scheduled_date = :'today'::date - 4 where id = :'js';   -- SURGERY: the first visit was four days ago
select next_visit_no as s_no, next_visit_date as s_date from public.job_series where id = :'series' \gset

update public.app_config set value = 'false'::jsonb where key = 'postingEnabled';   -- SURGERY: the owner pauses posting
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.create_job(p_title := 'PW paused', p_description := 'x', p_category := 'other',
    p_location := 'Probe Area', p_budget_cents := 4000) $$, 'P0001',
  'Posting is paused right now. Please try again shortly.', '5: paused: a new post is refused, in the accepted sentence');
select throws_ok(format($$ select public.create_job(p_title := 'PW paused and gone', p_description := 'x', p_category := 'other',
    p_location := 'Probe Area', p_budget_cents := 4000, p_scheduled_date := %L) $$, :'today'::date - 1), 'P0001',
  'Posting is paused right now. Please try again shortly.', '5: paused: the pause is named first, also for a day already over');
select throws_ok(format($$ select public.create_offer(p_amount_cents := 4000, p_worker_id := %L, p_title := 'PW paused direct',
    p_category := 'other') $$, :'worker'), 'P0001',
  'Posting is paused right now. Please try again shortly.', '5: paused: a direct offer (it makes a new job) is refused');
select tests.clear_auth();
select tests.pw_bid(:'jp') as o_p \gset
select ok(:'o_p' is not null, '5: paused: Will bids on the existing job P');
select tests.authenticate_as(:'customer');
select public.counter_offer(:'o_p', 4500) as o_pc \gset
select tests.authenticate_as(:'worker');
select is(public.accept_offer(:'o_pc'), :'jp'::uuid, '5: paused: Pia counters and Will accepts the counter');
select tests.clear_auth();
select tests.test_fund_job(:'jp');
select tests.authenticate_as(:'worker');
select public.transition_job_status(:'jp', 'in_progress');
select public.transition_job_status(:'jp', 'completed', '["https://example.com/pw-done.jpg"]'::jsonb);
select tests.clear_auth();
select is((select status::text from public.jobs where id = :'jp'), 'completed', '5: paused: P is paid, started and completed');
select is(public.advance_job_series(:'noon'::timestamptz), 0, '5: paused: the series schedule moves nothing at noon');
select is((select next_visit_no::text || '/' || next_visit_date::text || '/' || coalesce(pending_job_id::text, 'none')
                  || '/' || (select count(*) from public.jobs j where j.series_id = :'series')::text
             from public.job_series where id = :'series'),
  :'s_no' || '/' || :'s_date' || '/none/1', '5: paused: the series is as it was: same next visit, nothing offered, no new visit');

update public.app_config set value = 'true'::jsonb where key = 'postingEnabled';   -- SURGERY: the owner resumes posting
-- A7-06 CONTROL: p_run while record_timer_run raises (the report fails), all of it undone after
-- (the replaced body too, in this block). Answers "<the run's answer>/<how much p_count grew>", or
-- "raised: <error>" when the failed report undid the run (the old bare record_timer_run line).
create or replace function tests.run_with_report_failing(p_run text, p_count text) returns text language plpgsql as $$
declare v_before bigint; v_run text; v_after bigint;
begin
  execute p_count into v_before;
  create or replace function public.record_timer_run(p_name text, p_error text default null, p_stale_after interval default null)
    returns void language plpgsql as $b$ begin raise exception 'the report fails'; end $b$;
  execute 'select (' || p_run || ')::text' into v_run;
  execute p_count into v_after;
  raise exception using errcode = 'TR001', message = v_run || '/' || (v_after - v_before);
exception
  when sqlstate 'TR001' then return sqlerrm;
  when others then return 'raised: ' || sqlerrm;
end $$;
select is(tests.run_with_report_failing(format('public.advance_job_series(%L::timestamptz)', :'noon'),
                                          'select count(*) from public.job_series where pending_job_id is not null'),
  '1/1', '5: resumed: A7-06: with the report failing, the same run still offers the next visit and returns 1 (undone after)');
update public.timer_runs set ok_at = now() - interval '1 day' where name = 'brazos-job-series';   -- SURGERY (TIMERS): only the next run can write now()
select is(public.advance_job_series(:'noon'::timestamptz), 1, '5: resumed: the first run moves the series');
select is((select (ok_at = now())::text || '/' || stale_after::text || '/' || (failing_since is null)::text
             from public.timer_runs where name = 'brazos-job-series'), 'true/04:00:00/true',
  '5: resumed: … and that same run reported itself to timer_runs (TIMERS: late after 4 hours)');
select ok((select pending_job_id is not null from public.job_series where id = :'series'),
  '5: resumed: the next visit is offered to Will');
select ok(tests.pw_post(:'customer', 'PW resumed') is not null, '5: resumed: Pia posts again');
select tests.authenticate_as(:'customer');
select lives_ok(format($$ select public.create_offer(p_amount_cents := 4000, p_worker_id := %L, p_title := 'PW resumed direct',
    p_category := 'other') $$, :'worker'), '5: resumed: control: the same direct offer goes through');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- §6. THE CATALOG: each RPC asks the one rule, with its own row and now().
-- ---------------------------------------------------------------------------
select ok(position('public.posting_paused()' in (select prosrc from pg_proc where proname = 'create_job' and pronamespace = 'public'::regnamespace)) > 0
          and position('public.job_window_over(p_scheduled_date, p_arrival_end_hour, now())' in (select prosrc from pg_proc where proname = 'create_job' and pronamespace = 'public'::regnamespace)) > 0
          and position('public.job_window_over(p_scheduled_date, p_arrival_end_hour, now())' in (select prosrc from pg_proc where proname = 'update_job_details' and pronamespace = 'public'::regnamespace)) > 0
          and position('if p_job_id is null and public.posting_paused() then' in (select prosrc from pg_proc where proname = 'create_offer' and pronamespace = 'public'::regnamespace)) > 0
          and position('public.job_window_over(v_job.scheduled_date, v_job.arrival_end_hour, clock_timestamp())' in (select prosrc from pg_proc where proname = 'accept_offer' and pronamespace = 'public'::regnamespace)) > 0
          and position('if public.posting_paused() then' in (select prosrc from pg_proc where proname = 'advance_job_series' and pronamespace = 'public'::regnamespace)) > 0,
  '6: create_job, update_job_details, create_offer, accept_offer and advance_job_series each ask the rule with their own row (accept_offer with the clock)');
-- A7-09 (a source pin, not a timed test): accept_offer reads the window with clock_timestamp(),
-- after both row locks (job, then offer) were granted, and never with the transaction's now().
select ok((select position('public.job_window_over(v_job.scheduled_date, v_job.arrival_end_hour, now())' in prosrc) = 0
                  and position('from public.jobs where id = v_job.id for update;' in prosrc) > 0
                  and position('from public.job_offers where id = p_offer_id for update;' in prosrc)
                      > position('from public.jobs where id = v_job.id for update;' in prosrc)
                  and position('v_job.arrival_end_hour, clock_timestamp())' in prosrc)
                      > position('from public.job_offers where id = p_offer_id for update;' in prosrc)
             from pg_proc where oid = 'public.accept_offer(uuid)'::regprocedure),
  '6: A7-09: accept_offer asks the window rule with clock_timestamp() after its two row locks, not with now()');
select ok(position('return v_offer.job_id;' in (select prosrc from pg_proc where proname = 'accept_offer' and pronamespace = 'public'::regnamespace))
          < position('public.job_window_over(' in (select prosrc from pg_proc where proname = 'accept_offer' and pronamespace = 'public'::regnamespace)),
  '6: accept_offer answers an offer already accepted before it asks the window rule');
select ok((select p.provolatile = 'v'
                  and position('where c.key = ''postingEnabled'' for share), true)' in p.prosrc) > 0
             from pg_proc p where p.oid = 'public.posting_paused()'::regprocedure)
          and (select position('app_config' in prosrc) = 0
                      and position('if public.posting_paused() then' in prosrc) > 0
                      and position('if public.posting_paused() then' in prosrc) < position('for v_id in' in prosrc)
                 from pg_proc where oid = 'public.advance_job_series(timestamptz)'::regprocedure),
  '6: A7-04: posting_paused reads the switch row for share in its one statement (volatile); advance_job_series asks it before its first series and reads the row nowhere else');
select ok(not exists (select 1 from pg_proc where proname = 'job_past_closing'),
  '6: there is no second closing rule (the window end is the one cutoff)');

select * from finish();
rollback;
