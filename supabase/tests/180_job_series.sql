-- 180_job_series.sql — idea 14's proofs: 20260930001000_job_series.sql proven on the local stack
-- before the pipeline applies it anywhere. Fifty-eight assertions: thirteen numbered groups (the
-- thirteenth, the group 4 review's edges) and the two money rules at the end; each says what it proves.
--
-- THE CAST: one worker (Sam) every series has hired, a stranger (Olly), and six customers — one per
-- series, because a pair holds one live direct offer at a time: A (the worker says yes), B (the
-- worker declines), C (the 24 hours lapse), D (the customer stops), E (the worker drops the
-- series), F (a flexible first visit). The runner — the connection's own role, RLS bypassed — reads
-- ground truth and plays the clock.
--
-- THE CLOCK: the schedule's work takes its clock as an argument, so the proofs hold whatever hour
-- the suite runs at: NOON is today at 12:00 in the market (America/New_York), NIGHT today at 3:00.
-- Every weekly series is anchored four days ago, so its next visit is in three days — the first day
-- of its offer window. A lapse is played by moving the offer's own instants back 25 hours.
-- Everything rolls back; no commit.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(58);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select (((now() at time zone 'America/New_York')::date + time '12:00') at time zone 'America/New_York') as noon \gset
select (((now() at time zone 'America/New_York')::date + time '03:00') at time zone 'America/New_York') as night \gset
select ((now() at time zone 'America/New_York')::date) as today \gset
select ((now() at time zone 'America/New_York')::date - 4) as anchor \gset
select ((now() at time zone 'America/New_York')::date + 3) as visit \gset
select to_char((now() at time zone 'America/New_York')::date + 3, 'FMDy') as visit_dy \gset

select tests.create_user('i14.worker@brazos.test', 'Sam Okafor') as worker \gset
select tests.create_user('i14.other@brazos.test', 'Olly Other') as other \gset
select tests.create_user('i14.a@brazos.test', 'Ana Accepts') as cust_a \gset
select tests.create_user('i14.b@brazos.test', 'Ben Declined') as cust_b \gset
select tests.create_user('i14.c@brazos.test', 'Cal Lapsed') as cust_c \gset
select tests.create_user('i14.d@brazos.test', 'Dee Stops') as cust_d \gset
select tests.create_user('i14.e@brazos.test', 'Eve Dropped') as cust_e \gset
select tests.create_user('i14.f@brazos.test', 'Fay Flexible') as cust_f \gset
select tests.create_user('i14.h@brazos.test', 'Hal Moves') as cust_h \gset
select tests.create_user('i14.i@brazos.test', 'Ida Withdraws') as cust_i \gset
select tests.create_user('i14.j@brazos.test', 'Jo Stale') as cust_j \gset
select tests.create_user('i14.k@brazos.test', 'Kit Waiting') as cust_k \gset
select tests.create_user('i14.l@brazos.test', 'Lou Pair') as cust_l \gset
insert into fx values ('worker', :'worker'), ('other', :'other');

-- A customer posts (10 AM–12 PM, an exact address), Sam bids the posted amount, the customer
-- accepts — through the real RPCs, 020_lifecycle.sql's way. The series starts before the hire when
-- p_start_first (A), after it otherwise.
create function pg_temp.i14_post_and_hire(p_customer uuid, p_title text, p_amount integer, p_date date, p_start_first boolean)
returns uuid
language plpgsql
as $fn$
declare
  v_job uuid;
  v_offer uuid;
begin
  perform tests.authenticate_as(p_customer);
  v_job := (public.create_job(
    p_title := p_title, p_description := 'probe row, rolled back', p_category := 'cleaning',
    p_location := 'Park Slope', p_budget_cents := p_amount, p_lat := 40.6720, p_lng := -73.9780,
    p_scheduled_date := p_date, p_arrival_start_hour := 10::smallint, p_arrival_end_hour := 12::smallint,
    p_address_line := '12 Garfield Pl, Brooklyn'
  )).id;
  if p_start_first then
    perform public.start_job_series(v_job, 'weekly');
  end if;
  perform tests.authenticate_as((select v from fx where k = 'worker'));
  v_offer := public.create_offer(p_amount_cents := p_amount, p_job_id := v_job, p_message := 'i14 bid');
  perform tests.authenticate_as(p_customer);
  perform public.accept_offer(v_offer);
  if not p_start_first then
    perform public.start_job_series(v_job, 'weekly');
  end if;
  perform tests.clear_auth();
  return v_job;
end
$fn$;

select pg_temp.i14_post_and_hire(:'cust_a', 'I14 A clean the flat', 8000, :'anchor'::date, true) as job_a \gset
select pg_temp.i14_post_and_hire(:'cust_b', 'I14 B clean the flat', 6000, :'anchor'::date, false) as job_b \gset
select pg_temp.i14_post_and_hire(:'cust_c', 'I14 C clean the flat', 5000, :'anchor'::date, false) as job_c \gset
select pg_temp.i14_post_and_hire(:'cust_d', 'I14 D clean the flat', 5000, :'anchor'::date, false) as job_d \gset
select pg_temp.i14_post_and_hire(:'cust_e', 'I14 E clean the flat', 5000, :'anchor'::date, false) as job_e \gset
select tests.clear_auth();
select series_id as series_a from public.jobs where id = :'job_a' \gset
select series_id as series_b from public.jobs where id = :'job_b' \gset
select series_id as series_c from public.jobs where id = :'job_c' \gset
select series_id as series_d from public.jobs where id = :'job_d' \gset
select series_id as series_e from public.jobs where id = :'job_e' \gset
insert into fx values ('series_d', :'series_d'), ('series_e', :'series_e'), ('job_a', :'job_a');

-- F: a flexible first visit (no day), not yet hired.
select tests.authenticate_as(:'cust_f');
select (public.create_job(
  p_title := 'I14 F flexible', p_description := 'probe row, rolled back', p_category := 'cleaning',
  p_location := 'Park Slope', p_budget_cents := 4000, p_lat := 40.6720, p_lng := -73.9780
)).id as job_f \gset
select (public.start_job_series(:'job_f', 'biweekly')).id as series_f \gset
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 1. The table, the column and the ACLs (CLAUDE.md section Supabase).
-- ---------------------------------------------------------------------------
select has_table('public', 'job_series', '1a: public.job_series exists');
select ok((select relrowsecurity from pg_class where oid = 'public.job_series'::regclass), '1b: RLS is on for job_series');
select ok(
  not has_table_privilege('authenticated', 'public.job_series', 'INSERT')
  and not has_table_privilege('authenticated', 'public.job_series', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.job_series', 'DELETE')
  and not has_table_privilege('anon', 'public.job_series', 'SELECT'),
  '1c: nobody writes a series directly, and anon cannot read one'
);
select has_column('public', 'jobs', 'series_id', '1d: jobs.series_id ties each visit to its series');
select ok(
  has_function_privilege('authenticated', 'public.start_job_series(uuid, text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.stop_job_series(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.drop_series_worker(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.start_job_series(uuid, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.stop_job_series(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.drop_series_worker(uuid)', 'EXECUTE'),
  '1e: start, stop and drop are the signed-in user''s, never anon''s'
);
select ok(
  has_function_privilege('service_role', 'public.advance_job_series(timestamptz)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.install_series_schedule()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.advance_job_series(timestamptz)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.install_series_schedule()', 'EXECUTE'),
  '1f: the schedule''s work and its installer are the service role''s alone'
);
select ok(
  not has_function_privilege('authenticated', 'public.series_offer_visit(public.job_series, date)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.series_open_visit(public.job_series, date, uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.series_close_offers(uuid, uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.series_visit_date(date, text, integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.money_label(integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.series_offer_visit(public.job_series, date)', 'EXECUTE'),
  '1g: the internal steps are nobody''s to call'
);

-- ---------------------------------------------------------------------------
-- 2. The start, and the two helpers.
-- ---------------------------------------------------------------------------
select ok(
  (select cadence = 'weekly' and anchor_date = :'anchor'::date and next_visit_no = 1 and next_visit_date = :'visit'::date
   from public.job_series where id = :'series_a'),
  '2a: a weekly series anchors on the first visit''s day; its next visit is a week on'
);
select tests.authenticate_as(:'cust_a');
select is((public.start_job_series(:'job_a', 'monthly')).id, :'series_a'::uuid, '2b: starting again answers with the same series (idempotent)');
select tests.authenticate_as(:'other');
select throws_ok(
  $$ select public.start_job_series((select v from fx where k = 'job_a'), 'weekly') $$,
  'P0001', 'Job not found', '2c: a stranger cannot make someone else''s job repeat');
select tests.authenticate_as(:'cust_a');
select throws_ok(
  $$ select public.start_job_series((select v from fx where k = 'job_a'), 'daily') $$,
  'P0001', 'Repeat every week, every 2 weeks or every month', '2d: the cadence is an allow-list');
select tests.clear_auth();
select ok(
  public.series_visit_date(date '2026-01-31', 'monthly', 1) = date '2026-02-28'
  and public.series_visit_date(date '2026-01-31', 'monthly', 2) = date '2026-03-31'
  and public.series_visit_date(date '2026-09-01', 'biweekly', 2) = date '2026-09-29',
  '2e: visits count from the anchor, so a month never drifts off the 31st'
);
select ok(
  public.money_label(8600) = '$86' and public.money_label(10750) = '$107.50' and public.money_label(123400) = '$1,234',
  '2f: money_label reads as formatBudget() does'
);

-- ---------------------------------------------------------------------------
-- 3, 4. The hire names the first refusal; each person reads only their own series.
-- ---------------------------------------------------------------------------
select ok(
  (select worker_id = :'worker'::uuid and price_cents = 8000 from public.job_series where id = :'series_a'),
  '3: the hire (after the start) makes that worker the next first refusal, at that price'
);
select tests.authenticate_as(:'cust_a');
select is((select count(*)::int from public.job_series), 1, '4a: the customer reads their own series');
select tests.authenticate_as(:'worker');
select ok((select count(*)::int from public.job_series where id in (:'series_a', :'series_b', :'series_e')) = 3, '4b: the series'' worker reads the series they get first');
select tests.authenticate_as(:'other');
select is((select count(*)::int from public.job_series), 0, '4c: anyone else reads none');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 5. Night: nothing moves at 3 am.
-- ---------------------------------------------------------------------------
select ok(
  public.advance_job_series(:'night'::timestamptz) = 0
  and not exists (select 1 from public.jobs where series_id is not null and status = 'draft'),
  '5: at 3 am in the market the schedule does nothing'
);

-- ---------------------------------------------------------------------------
-- 6. Noon, three days before: a first refusal to each series' worker.
-- ---------------------------------------------------------------------------
select public.advance_job_series(:'noon'::timestamptz) as moved1 \gset
select pending_job_id as draft_a from public.job_series where id = :'series_a' \gset
select id as offer_a from public.job_offers where job_id = :'draft_a' \gset
select is(:moved1, 5, '6a: five series moved - A to E each offered; F waits for its flexible first visit');
select ok(
  (select status = 'draft' and visibility = 'direct' and scheduled_date = :'visit'::date
          and arrival_start_hour = 10 and arrival_end_hour = 12 and series_id = :'series_a'::uuid
          and budget_cents = 8000 and client_id = :'cust_a'::uuid
   from public.jobs where id = :'draft_a'),
  '6b: the visit is a direct offer''s draft, on the day three days on, in the same window, at the same price'
);
select ok(
  (select status = 'pending' and offer_type = 'direct_offer' and worker_id = :'worker'::uuid
          and awaiting_id = :'worker'::uuid and author_id = :'cust_a'::uuid and amount_cents = 8000
          and expires_at > now() + interval '23 hours' and expires_at <= now() + interval '24 hours'
   from public.job_offers where id = :'offer_a'),
  '6c: the offer is the customer''s, to Sam, at Sam''s price, awaiting Sam, for 24 hours'
);
select is((select address_line from public.job_locations where job_id = :'draft_a'), '12 Garfield Pl, Brooklyn', '6d: the exact address goes with the visit');
select is(
  (select title || ' | ' || body || ' | ' || category from public.notification_outbox
    where recipient_id = :'worker' and dedupe_key = 'series_first_refusal:' || :'offer_a'),
  'Repeat visit · ' || :'visit_dy' || ' 10 AM | I14 A clean the flat for Ana · $80. Yours first for 24 hours. | hire_requests',
  '6e: Sam is told which visit, for whom, the price, and that it is his first for 24 hours'
);
select is(
  (select count(*)::int from public.notification_outbox where recipient_id = :'worker' and type = 'message'),
  0,
  '6f: and no second, generic "New message" push for the same offer'
);
select ok(
  (select next_visit_no = 1 and next_visit_date = :'visit'::date from public.job_series where id = :'series_a'),
  '6g: the series points at the visit on offer until it is settled'
);

-- ---------------------------------------------------------------------------
-- 7. A: Sam says yes — accept_offer(), the only assignment path.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'worker');
select public.accept_offer(:'offer_a') as taken_a \gset
select tests.clear_auth();
select ok(
  (select status = 'assigned' and assigned_worker_id = :'worker'::uuid from public.jobs where id = :'draft_a'),
  '7a: the visit is Sam''s - assigned, and nothing is paid yet'
);
select is(
  (select title || ' | ' || body || ' | ' || category || ' | ' || (data ->> 'intent') || ' | ' || (data ->> 'categoryId')
     from public.notification_outbox
    where recipient_id = :'cust_a' and dedupe_key = 'series_confirm:' || :'draft_a'),
  'Sam can come ' || :'visit_dy' || ' 10 AM | Confirm $86 · I14 A clean the flat | jobs | checkout | series_confirm',
  '7b: Ana is asked to confirm $86 (the $80 price and its protection fee, quote_job_price()); the push opens Checkout, with its Confirm button (20260930001200)'
);
select is(
  (select count(*)::int from public.notification_outbox where recipient_id = :'cust_a' and type = 'message'),
  0,
  '7c: the accepted event does not buzz her a second time'
);
select ok(
  (select pending_job_id is null and next_visit_no = 2 and next_visit_date = :'anchor'::date + 14
   from public.job_series where id = :'series_a'),
  '7d: the series moves on to the visit after'
);

-- ---------------------------------------------------------------------------
-- 8, 9. B: Sam declines. C: the 24 hours lapse. The next run opens both to bids.
-- ---------------------------------------------------------------------------
select pending_job_id as draft_b from public.job_series where id = :'series_b' \gset
select id as offer_b from public.job_offers where job_id = :'draft_b' \gset
select pending_job_id as draft_c from public.job_series where id = :'series_c' \gset
select id as offer_c from public.job_offers where job_id = :'draft_c' \gset
select tests.authenticate_as(:'worker');
select public.decline_offer(:'offer_b') as declined_b \gset
select tests.clear_auth();
update public.job_offers
   set created_at = created_at - interval '25 hours', expires_at = now() - interval '1 hour'
 where id = :'offer_c';
select public.advance_job_series(:'noon'::timestamptz) as moved2 \gset
select id as open_b from public.jobs where series_id = :'series_b' and status = 'open' \gset
select is(:moved2, 2, '8a: two series moved - B (declined) and C (lapsed); A, D and E wait');
select ok(
  (select visibility = 'open_market' and scheduled_date = :'visit'::date and arrival_start_hour = 10
          and budget_cents = 6000 and client_id = :'cust_b'::uuid
   from public.jobs where id = :'open_b'),
  '8b: B''s visit is an ordinary open post, on the same day, in the same window, as the first was posted'
);
select is((select address_line from public.job_locations where job_id = :'open_b'), '12 Garfield Pl, Brooklyn', '8c: the address goes with it');
select is(
  (select title || ' | ' || body from public.notification_outbox where recipient_id = :'cust_b' and dedupe_key = 'series_open:' || :'open_b'),
  'Your ' || :'visit_dy' || ' visit is open to bids | Sam didn''t take this one · I14 B clean the flat',
  '8d: Ben is told the visit is up for bids, and why'
);
select ok(
  (select pending_job_id is null and next_visit_no = 2 from public.job_series where id = :'series_b'),
  '8e: B moves on to the visit after'
);
select is((select status::text from public.job_offers where id = :'offer_c'), 'expired', '9a: C''s lapsed offer is recorded expired, the canonical way');
select ok(
  exists (select 1 from public.jobs where series_id = :'series_c' and status = 'open' and scheduled_date = :'visit'::date),
  '9b: and C''s visit is open to bids'
);

-- ---------------------------------------------------------------------------
-- 10. D: the customer stops the series.
-- ---------------------------------------------------------------------------
select pending_job_id as draft_d from public.job_series where id = :'series_d' \gset
select id as offer_d from public.job_offers where job_id = :'draft_d' \gset
select tests.authenticate_as(:'worker');
select throws_ok(
  $$ select public.stop_job_series((select v from fx where k = 'series_d')) $$,
  'P0001', 'Repeat not found', '10a: only the customer can stop their series');
select tests.authenticate_as(:'cust_d');
select is((public.stop_job_series(:'series_d')).status, 'stopped', '10b: the customer stops it');
select tests.clear_auth();
select is((select status::text from public.job_offers where id = :'offer_d'), 'withdrawn', '10c: the first refusal still pending is withdrawn');
select public.advance_job_series(:'noon'::timestamptz) as moved3 \gset
select ok(
  (select count(*) from public.jobs where series_id = :'series_d') = 2
  and not exists (select 1 from public.jobs where series_id = :'series_d' and status = 'open'),
  '10d: a stopped series posts nothing more - its first visit and the withdrawn offer''s draft, nothing new'
);
select is(
  (select title from public.notification_outbox where recipient_id = :'worker' and type = 'series_stopped'),
  'Dee stopped repeating',
  '10e: Sam is told the customer stopped (the group 4 review) - in words, not as a withdrawn offer'
);
select ok(
  (select count(*) from public.notification_outbox
    where recipient_id = :'worker' and type = 'message' and data ->> 'jobId' = :'job_d') = 0
  and (select count(*) from public.notification_outbox
    where recipient_id = :'worker' and type = 'message' and data ->> 'jobId' = :'job_c') = 1,
  '10f: the stop''s withdrawal stays quiet, while the lapse on C still told Sam his offer ran out (never left uninformed)'
);

-- ---------------------------------------------------------------------------
-- 11. E: Sam drops the series.
-- ---------------------------------------------------------------------------
select pending_job_id as draft_e from public.job_series where id = :'series_e' \gset
select id as offer_e from public.job_offers where job_id = :'draft_e' \gset
select tests.authenticate_as(:'other');
select throws_ok(
  $$ select public.drop_series_worker((select v from fx where k = 'series_e')) $$,
  'P0001', 'Repeat not found', '11a: only the series'' worker can drop it');
select tests.authenticate_as(:'worker');
select public.drop_series_worker(:'series_e') as dropped_e \gset
select is((select count(*)::int from public.job_series where id = :'series_e'), 0, '11b: once dropped, Sam no longer reads the series');
select tests.clear_auth();
select ok(
  (select worker_id is null and dropped_worker_ids = array[:'worker'::uuid] and status = 'active' from public.job_series where id = :'series_e'),
  '11c: the series goes on without him'
);
select is((select status::text from public.job_offers where id = :'offer_e'), 'declined', '11d: his pending first refusal is declined');
select is(
  (select title from public.notification_outbox where recipient_id = :'cust_e' and type = 'series_worker_dropped'),
  'Sam won''t take future visits',
  '11e: Eve is told'
);
select public.advance_job_series(:'noon'::timestamptz) as moved4 \gset
select ok(
  exists (select 1 from public.jobs where series_id = :'series_e' and status = 'open' and scheduled_date = :'visit'::date),
  '11f: the next run opens that visit to bids'
);

-- ---------------------------------------------------------------------------
-- 12. F: a flexible first visit counts from the day it is done.
-- ---------------------------------------------------------------------------
select ok(
  (select anchor_date is null and next_visit_date is null from public.job_series where id = :'series_f'),
  '12a: a flexible first visit sets no clock yet'
);
update public.jobs set status = 'completed' where id = :'job_f';
select ok(
  (select anchor_date = :'today'::date and next_visit_date = :'today'::date + 14 from public.job_series where id = :'series_f'),
  '12b: done today, every 2 weeks: the next visit is two weeks from today'
);

-- ---------------------------------------------------------------------------
-- 13. The group 4 review's edges.
-- ---------------------------------------------------------------------------
select ok(
  has_column_privilege('authenticated', 'public.job_series', 'next_visit_date', 'SELECT')
  and not has_column_privilege('authenticated', 'public.job_series', 'last_error', 'SELECT')
  and not has_column_privilege('authenticated', 'public.job_series', 'dropped_worker_ids', 'SELECT'),
  '13a: the two people read the series, not its bookkeeping (who dropped it before, the last error)'
);

-- H: the first visit's day moves before anyone is hired; the series counts from the new day.
select tests.authenticate_as(:'cust_h');
select (public.create_job(
  p_title := 'I14 H water the plants', p_description := 'probe row, rolled back', p_category := 'errands',
  p_location := 'Park Slope', p_budget_cents := 3000, p_scheduled_date := (:'today'::date + 10)
)).id as job_h \gset
select (public.start_job_series(:'job_h', 'weekly')).id as series_h \gset
select tests.clear_auth();
update public.jobs set scheduled_date = :'today'::date + 12 where id = :'job_h';
select ok(
  (select anchor_date = :'today'::date + 12 and next_visit_date = :'today'::date + 19 from public.job_series where id = :'series_h'),
  '13b: a first visit moved to another day moves the whole series with it'
);

-- I, J, L: hired as the others were. J also has an old post, for a day gone by, that nobody took.
-- K: nobody hired yet (its first visit is still open, for a day gone by), and a later post waits for
-- a day still to come. L: a live direct offer between the two already.
select pg_temp.i14_post_and_hire(:'cust_i', 'I14 I clean the flat', 5000, :'anchor'::date, false) as job_i \gset
select pg_temp.i14_post_and_hire(:'cust_j', 'I14 J clean the flat', 5000, :'anchor'::date, false) as job_j \gset
select pg_temp.i14_post_and_hire(:'cust_l', 'I14 L clean the flat', 5000, :'anchor'::date, false) as job_l \gset
select tests.clear_auth();
select series_id as series_i from public.jobs where id = :'job_i' \gset
select series_id as series_j from public.jobs where id = :'job_j' \gset
select series_id as series_l from public.jobs where id = :'job_l' \gset
insert into public.jobs (client_id, title, status, scheduled_date, series_id)
values (:'cust_j', 'I14 J the stale post', 'open', :'today'::date - 3, :'series_j');
select tests.authenticate_as(:'cust_k');
select (public.create_job(
  p_title := 'I14 K mow the lawn', p_description := 'probe row, rolled back', p_category := 'yard_work',
  p_location := 'Park Slope', p_budget_cents := 4000, p_scheduled_date := :'anchor'::date
)).id as job_k \gset
select (public.start_job_series(:'job_k', 'weekly')).id as series_k \gset
select tests.clear_auth();
insert into public.jobs (client_id, title, status, scheduled_date, series_id)
values (:'cust_k', 'I14 K the next post', 'open', :'today'::date + 5, :'series_k');
select tests.authenticate_as(:'cust_l');
select public.create_offer(
  p_amount_cents := 5000, p_worker_id := :'worker', p_title := 'I14 L something else', p_category := 'cleaning'
) as pair_offer \gset
select tests.clear_auth();
select public.advance_job_series(:'noon'::timestamptz) as moved5 \gset

select ok(
  (select pending_job_id is not null from public.job_series where id = :'series_j'),
  '13c: an old post from a day gone by never takes the worker''s first refusal away'
);
select ok(
  not exists (select 1 from public.jobs where series_id = :'series_k' and scheduled_date = :'visit'::date)
  and exists (select 1 from public.notification_outbox where recipient_id = :'cust_k' and type = 'series_skipped'),
  '13d: with a post for a day still to come waiting, the next visit is not stacked - it is skipped, and the customer is told'
);
select ok(
  (select pending_job_id is null and next_visit_no = 1 from public.job_series where id = :'series_l')
  and not exists (select 1 from public.jobs where series_id = :'series_l' and id <> :'job_l'),
  '13e: a live offer between the two already: the first refusal waits for a later run, nothing goes to bids'
);

-- I: the customer withdraws the standing offer to skip a week.
select pending_job_id as draft_i from public.job_series where id = :'series_i' \gset
select id as offer_i from public.job_offers where job_id = :'draft_i' \gset
select tests.authenticate_as(:'cust_i');
select public.withdraw_offer(:'offer_i') as withdrawn_i \gset
select tests.clear_auth();
select public.advance_job_series(:'noon'::timestamptz) as moved6 \gset
select ok(
  (select pending_job_id is null and next_visit_no = 2 from public.job_series where id = :'series_i')
  and not exists (select 1 from public.jobs where series_id = :'series_i' and status = 'open' and scheduled_date = :'visit'::date)
  and not exists (select 1 from public.notification_outbox where recipient_id = :'cust_i' and type = 'series_open'),
  '13f: the customer calling off the week skips it - nothing posted, nobody told they "didn''t take it"'
);

-- The money rules: no visit was ever charged by the series; every hire went through accept_offer().
select ok(
  not exists (
    select 1 from public.payments p join public.jobs j on j.id = p.job_id
    where j.series_id is not null
  ),
  'money: no series visit has a payment - nothing is charged before the customer confirms in Checkout'
);
select ok(
  (select bool_and(j.accepted_offer_id is not null) from public.jobs j where j.series_id is not null and j.assigned_worker_id is not null),
  'assignment: every hired visit carries its accepted offer - accept_offer() was the only path'
);

select * from finish();
rollback;
