-- 410_abuse_limits.sql — B10: the text caps and the per-account rates
-- (docs/critical/privacy-and-limits.md; docs/lean/AUDIT-LEDGER.md B10;
-- migrations 20261112032000_text_caps.sql and 20261112032500_rate_limits.sql).
--
-- THE CAST:
--   talker    hired on j_chat; sends the chat messages
--   listener  j_chat's customer; the other party, and the person reported
--   reporter  files the reports
--   poster    posts the jobs, sends one direct offer, starts a repeat series
--   bidder    bids on the runner's jobs
--   client2   owns the jobs the runner writes for the bids
--   target    the account the admin bans; customer of 31 jobs hired to `hired`
--   admin     profiles.is_admin, set by the runner
--
-- now() is frozen for the whole transaction, so every write here falls in one window of every
-- limit: the file proves the counting, not the clock. The last section proves the window itself on
-- the counter function. Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(32);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('limits.talker@brazos.test',   'Tia Talker')    as talker   \gset
select tests.create_user('limits.listener@brazos.test', 'Lou Listener')  as listener \gset
select tests.create_user('limits.reporter@brazos.test', 'Rae Reporter')  as reporter \gset
select tests.create_user('limits.poster@brazos.test',   'Pat Poster')    as poster   \gset
select tests.create_user('limits.bidder@brazos.test',   'Bea Bidder')    as bidder   \gset
select tests.create_user('limits.client2@brazos.test',  'Cy Client')     as client2  \gset
select tests.create_user('limits.target@brazos.test',   'Tom Target')    as target   \gset
select tests.create_user('limits.hired@brazos.test',    'Hal Hired')     as hired    \gset
select tests.create_user('limits.admin@brazos.test',    'Ada Admin')     as admin    \gset
update public.profiles set is_admin = true where id = :'admin';
insert into fx values
  ('talker', :'talker'), ('listener', :'listener'), ('reporter', :'reporter'), ('poster', :'poster'),
  ('bidder', :'bidder'), ('client2', :'client2'), ('target', :'target');

-- The runner's fixture: the hired chat, one offer on it for the card row, the jobs to bid on.
insert into public.jobs (client_id, title, status, assigned_worker_id)
values (:'listener', 'LIMITS chat', 'assigned', :'talker')
returning id as j_chat \gset
insert into public.job_offers (id, job_id, offer_type, root_offer_id, customer_id, worker_id, author_id, awaiting_id, amount_cents, status)
select o, :'j_chat', 'marketplace_bid', o, :'listener', :'talker', :'talker', :'listener', 5000, 'accepted'
from gen_random_uuid() o
returning id as o_chat \gset
insert into fx values ('j_chat', :'j_chat'), ('o_chat', :'o_chat');

insert into public.jobs (client_id, title, status)
select :'client2', 'LIMITS bid target ' || g, 'open' from generate_series(1, 31) g;
insert into fx
select 'bid' || lpad((row_number() over (order by id))::text, 2, '0'), id
from public.jobs where client_id = :'client2';

-- ---------------------------------------------------------------------------
-- §1. The caps: 2,000 characters for a message and for a report's description.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'talker');
select throws_ok($$ insert into public.messages (job_id, sender_id, content) values ((select v from fx where k = 'j_chat'), (select v from fx where k = 'talker'), repeat('a', 2001)) $$,
  'P0001', 'That message is too long. Keep it under 2,000 characters.',
  'B10: talker: a 2,001-character message is refused with the sentence');
select lives_ok($$ insert into public.messages (job_id, sender_id, content) values ((select v from fx where k = 'j_chat'), (select v from fx where k = 'talker'), repeat('a', 2000)) $$,
  'talker: a 2,000-character message is stored (message 1 of the minute)');

select tests.authenticate_as(:'reporter');
select throws_ok($$ insert into public.reports (reporter_id, reported_id, reason, description) values ((select v from fx where k = 'reporter'), (select v from fx where k = 'listener'), 'other', repeat('b', 2001)) $$,
  'P0001', 'That report is too long. Keep it under 2,000 characters.',
  'B10: reporter: a 2,001-character report is refused with the sentence');
select lives_ok($$ insert into public.reports (reporter_id, reported_id, reason, description) values ((select v from fx where k = 'reporter'), (select v from fx where k = 'listener'), 'other', repeat('b', 2000)) $$,
  'reporter: a 2,000-character report is stored (report 1 of the day)');

-- ---------------------------------------------------------------------------
-- §2. Messages: 30 a minute per sender. An offer card is not counted; the other party is not held.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'talker');
select lives_ok($$ insert into public.messages (job_id, sender_id, content)
  select (select v from fx where k = 'j_chat'), (select v from fx where k = 'talker'), 'note ' || g from generate_series(2, 30) g $$,
  'talker: messages 2 to 30 of the minute are stored');

-- A card row, written as the offer functions write it: the caller's identity, the runner's rights
-- (the functions are SECURITY DEFINER). At 30 already, it would be refused if it were counted.
select tests.clear_auth();
select set_config('request.jwt.claims', json_build_object('sub', :'talker', 'role', 'authenticated')::text, true);
select lives_ok($$ insert into public.messages (job_id, sender_id, content, job_offer_id, request_event, request_amount_cents)
  values ((select v from fx where k = 'j_chat'), (select v from fx where k = 'talker'), '', (select v from fx where k = 'o_chat'), 'created', 5000) $$,
  'an offer card the server writes for talker is not counted against their messages');
select tests.clear_auth();

select tests.authenticate_as(:'talker');
select throws_ok($$ insert into public.messages (job_id, sender_id, content) values ((select v from fx where k = 'j_chat'), (select v from fx where k = 'talker'), 'one too many') $$,
  'P0001', 'You''re sending messages too fast. Wait a minute and try again.',
  'B10: talker: the 31st message of the minute is refused with the sentence');
select tests.authenticate_as(:'listener');
select lives_ok($$ insert into public.messages (job_id, sender_id, content) values ((select v from fx where k = 'j_chat'), (select v from fx where k = 'listener'), 'Still here') $$,
  'listener: the other party still sends (the limit is per sender)');

-- ---------------------------------------------------------------------------
-- §3. Job posts: 10 an hour per customer. A direct offer's draft job and a series' repeat visit are
-- not posts the customer made.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'poster');
select lives_ok($$ select count(public.create_job(
    p_title := 'LIMITS post ' || g, p_description := 'fixture, rolled back', p_category := 'other',
    p_location := 'Limits Area', p_budget_cents := 5000))
  from generate_series(1, 10) g $$,
  'poster: ten jobs in the hour are posted');
select throws_ok($$ select public.create_job(p_title := 'LIMITS post 11', p_description := 'fixture, rolled back',
    p_category := 'other', p_location := 'Limits Area', p_budget_cents := 5000) $$,
  'P0001', 'You''ve posted a lot of jobs in the last hour. Try again later.',
  'B10: poster: the 11th job of the hour is refused with the sentence');
select lives_ok($$ select public.create_offer(p_amount_cents := 4000, p_worker_id := (select v from fx where k = 'talker'),
    p_title := 'LIMITS direct', p_description := 'fixture, rolled back', p_category := 'other', p_location := 'Limits Area') $$,
  'poster: a direct offer still goes out (its draft job is not a post; the offer counts as an offer)');
select lives_ok($$ select public.start_job_series(
    (select j.id from public.jobs j where j.client_id = (select v from fx where k = 'poster') and j.title = 'LIMITS post 1'), 'weekly') $$,
  'poster: turns their first post into a weekly series (guard)');
select tests.clear_auth();
select lives_ok($$ select public.series_open_visit(s, current_date + 7, null)
  from public.job_series s
  where s.origin_job_id = (select j.id from public.jobs j where j.client_id = (select v from fx where k = 'poster') and j.title = 'LIMITS post 1') $$,
  'the schedule opens poster''s next visit to bids although poster is at the limit (it is the schedule''s post, not a tap)');
select is((select count(*) from public.jobs where client_id = :'poster' and title = 'LIMITS post 1'), 2::bigint,
  'runner: the repeat visit was posted (guard)');

-- ---------------------------------------------------------------------------
-- §4. Offers: 30 an hour per author.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'bidder');
select lives_ok($$ select count(public.create_offer(p_amount_cents := 5000, p_job_id := v))
  from fx where k ~ '^bid[0-9]{2}$' and k <> 'bid31' $$,
  'bidder: thirty bids in the hour are sent');
select throws_ok($$ select public.create_offer(p_amount_cents := 5000, p_job_id := (select v from fx where k = 'bid31')) $$,
  'P0001', 'You''ve sent a lot of offers in the last hour. Try again later.',
  'B10: bidder: the 31st offer of the hour is refused with the sentence');

-- ---------------------------------------------------------------------------
-- §5. Reports: 10 a day per reporter (the 2,000-character one in §1 was the first).
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'reporter');
select lives_ok($$ insert into public.reports (reporter_id, reported_id, reason, description)
  select (select v from fx where k = 'reporter'), (select v from fx where k = 'listener'), 'other', 'report ' || g from generate_series(2, 10) g $$,
  'reporter: reports 2 to 10 of the day are stored');
select throws_ok($$ insert into public.reports (reporter_id, reported_id, reason, description) values ((select v from fx where k = 'reporter'), (select v from fx where k = 'listener'), 'other', 'one too many') $$,
  'P0001', 'You''ve sent a lot of reports. Try again later.',
  'B10: reporter: the 11th report of the day is refused with the sentence');

-- ---------------------------------------------------------------------------
-- §6. What the server writes is never refused.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'client2');
select lives_ok($$ select public.create_job(p_title := 'LIMITS client2 own post', p_description := 'fixture, rolled back',
    p_category := 'other', p_location := 'Limits Area', p_budget_cents := 5000) $$,
  'client2: posts their own job although the runner wrote 31 jobs for them (server rows are not counted)');
select tests.clear_auth();

-- The ban's notices are attributed to the banned account and written while the admin is signed in.
insert into public.jobs (client_id, title, status, assigned_worker_id)
select :'target', 'LIMITS ban ' || g, 'assigned', :'hired' from generate_series(1, 31) g;
select tests.authenticate_as(:'admin');
select lives_ok($$ select public.ban_user((select v from fx where k = 'target')) $$,
  'admin: bans an account that is the customer of 31 hired jobs');
select tests.clear_auth();
select is((select count(*) from public.messages m join public.jobs j on j.id = m.job_id
            where j.client_id = :'target' and j.title like 'LIMITS ban %' and m.sender_id = :'target'
              and m.content like 'This job was cancelled automatically%'), 31::bigint,
  'the ban wrote all 31 notices (none refused as the banned account''s messages)');

-- ---------------------------------------------------------------------------
-- §7. The counter: private, one row per account and action, a new window starts again at one.
-- ---------------------------------------------------------------------------
select is(has_table_privilege('anon', 'public.rate_counters', 'select, insert, update, delete, truncate, references, trigger'), false,
  'B10: anon holds no privilege on rate_counters');
select is(has_table_privilege('authenticated', 'public.rate_counters', 'select, insert, update, delete, truncate, references, trigger'), false,
  'B10: authenticated holds no privilege on rate_counters');
select is(has_function_privilege('authenticated', 'public.rate_limit_take(uuid, text, integer, interval)', 'execute'), false,
  'B10: authenticated may not run rate_limit_take');
select is(has_function_privilege('service_role', 'public.rate_limit_take(uuid, text, integer, interval)', 'execute'), true,
  'B10: the service role (the payment functions) may run rate_limit_take');
select is((select array_agg(action order by action) from public.rate_counters where user_id = :'poster'), array['job_post', 'offer'],
  'poster: one counter row for posts and one for offers, however many writes');
select is((select hits from public.rate_counters where user_id = :'talker' and action = 'message'), 30,
  'talker: 30 hits; the refused 31st and the card row left no trace');

select is(public.rate_limit_take(:'hired', 'fn:probe', 2, interval '1 hour'), true, 'rate_limit_take: the first call in the window passes');
select is(public.rate_limit_take(:'hired', 'fn:probe', 2, interval '1 hour'), true, 'rate_limit_take: the second passes (the maximum)');
select is(public.rate_limit_take(:'hired', 'fn:probe', 2, interval '1 hour'), false, 'rate_limit_take: the third is over');
update public.rate_counters set window_start = window_start - interval '1 hour' where user_id = :'hired' and action = 'fn:probe';
select is(public.rate_limit_take(:'hired', 'fn:probe', 2, interval '1 hour'), true, 'rate_limit_take: once the window has moved on, the count starts again');
select is((select count(*)::int || ':' || max(hits) from public.rate_counters where user_id = :'hired' and action = 'fn:probe'), '1:1',
  'rate_limit_take: the new window overwrote the old one in the same row');

select * from finish();
rollback;
