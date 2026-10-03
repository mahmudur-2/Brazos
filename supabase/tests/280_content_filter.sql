-- 280_content_filter.sql — FIX-RUN B3's proofs: 20261003000700_ugc_moderation.sql proven on the
-- local stack before the pipeline applies it anywhere.
--
-- THE CAST: a customer and a worker, plus the runner — the connection's own role, RLS bypassed —
-- for fixture rows. The job is posted and the bio saved AS THEIR OWNERS, on the paths the app
-- takes (create_job, update_my_profile); the offer goes through create_offer() as the worker.
-- Job edits, reviews, messages and portfolio items are written by the runner: their app paths need a
-- completed or assigned job, and a BEFORE trigger fires for every role alike, so the runner's
-- write proves the same refusal without rebuilding the lifecycle here (020/040 prove those paths).
-- Everything rolls back; no commit.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(23);

select tests.create_user('b3.customer@brazos.test', 'Cara Customer') as customer \gset
select tests.create_user('b3.worker@brazos.test',   'Wren Worker')   as worker   \gset

-- ---------------------------------------------------------------------------
-- 1. Jobs, as the customer: a blocked word in the title or the description is refused.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select throws_ok(
  $$ select public.create_job(p_title := 'Fuck this sink', p_description := 'leaking', p_category := 'other',
       p_location := 'Probe Area', p_budget_min_cents := 4000, p_budget_max_cents := 6000, p_address_line := '1 Probe St') $$,
  'P0001', 'That includes words Brazos doesn''t allow. Edit it and try again.',
  '1a: a blocked word in a job title is refused on the create_job path'
);
select (public.create_job(
  p_title := 'Mount a TV', p_description := 'Scunthorpe flat, flame retardant wall, spic and span after',
  p_category := 'other', p_location := 'Probe Area',
  p_budget_min_cents := 4000, p_budget_max_cents := 6000, p_address_line := '1 Probe St'
)).id as job \gset
select ok(:'job'::uuid is not null, '1c: clean text passes — a word that only CONTAINS a term (Scunthorpe, retardant) is not a match');
select tests.clear_auth();
-- The runner from here for jobs: the client holds no direct INSERT/UPDATE grant on jobs.
select throws_ok(
  format($$ insert into public.jobs (client_id, title, description) values (%L, 'Fix a sink', 'the whore next door') $$, :'customer'),
  'P0001', 'That includes words Brazos doesn''t allow. Edit it and try again.',
  '1b: a blocked word in a job description is refused'
);
select throws_ok(
  format($$ update public.jobs set description = 'retard' where id = %L $$, :'job'),
  'P0001', 'That includes words Brazos doesn''t allow. Edit it and try again.',
  '1d: an edit that introduces a blocked word is refused'
);

-- A legacy row (written before the list existed), then an unrelated edit to it.
alter table public.jobs disable trigger jobs_reject_blocked_terms;
insert into public.jobs (client_id, title) values (:'customer', 'Legacy fuck row') returning id as legacy \gset
alter table public.jobs enable trigger jobs_reject_blocked_terms;
select lives_ok(
  format($$ update public.jobs set description = 'now with a clean description' where id = %L $$, :'legacy'),
  '1e: a legacy row with a blocked title still takes an edit to another column'
);
select lives_ok(
  format($$ update public.jobs set title = title where id = %L $$, :'legacy'),
  '1f: re-writing the unchanged legacy title is not re-judged'
);

-- ---------------------------------------------------------------------------
-- 2. Profiles, as the owner through update_my_profile(): the bio.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'worker');
select throws_ok(
  $$ select public.update_my_profile('{"bio": "No sluts"}'::jsonb) $$,
  'P0001', 'That includes words Brazos doesn''t allow. Edit it and try again.',
  '2a: a blocked word in a bio is refused'
);
select lives_ok($$ select public.update_my_profile('{"bio": "Handy, careful, on time."}'::jsonb) $$, '2b: a clean bio saves');

-- ---------------------------------------------------------------------------
-- 3. Offers, through create_offer() as the worker: the bid message.
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$ select public.create_offer(p_amount_cents := 4500, p_job_id := %L, p_message := 'cunt') $$, :'job'),
  'P0001', 'That includes words Brazos doesn''t allow. Edit it and try again.',
  '3a: a blocked word in a bid message is refused'
);
select lives_ok(
  format($$ select public.create_offer(p_amount_cents := 4500, p_job_id := %L, p_message := 'Can do Saturday.') $$, :'job'),
  '3b: a clean bid message goes through'
);

-- ---------------------------------------------------------------------------
-- 3c. Service listings (20261003000900), as the worker on the app's own path — direct RLS
--     DML (lib/services.ts): the title and the description.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.worker_services (worker_id, title, category, published) values (auth.uid(), 'Porn shelf install', 'other', true) $$,
  'P0001', 'That includes words Brazos doesn''t allow. Edit it and try again.',
  '3c: a blocked word in a service title is refused'
);
insert into public.worker_services (worker_id, title, description, category, published)
  values (:'worker', 'TV mounting', 'Any wall, flame retardant brackets', 'tv_mounting', true)
  returning id as service \gset
select ok(:'service'::uuid is not null, '3d: a clean service listing publishes — "retardant" only contains a term');
select throws_ok(
  format($$ update public.worker_services set description = 'no whores' where id = %L $$, :'service'),
  'P0001', 'That includes words Brazos doesn''t allow. Edit it and try again.',
  '3e: an edit that puts a blocked word in a service description is refused'
);
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 4. Messages, reviews and portfolio captions (runner; see the header).
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$ insert into public.messages (job_id, sender_id, content) values (%L, %L, 'FUCKING late') $$, :'job', :'customer'),
  'P0001', 'That includes words Brazos doesn''t allow. Edit it and try again.',
  '4a: a blocked word in a message is refused, whatever its case'
);
select lives_ok(
  format($$ insert into public.messages (job_id, sender_id, content) values (%L, %L, 'See you at nine') $$, :'job', :'customer'),
  '4b: a clean message sends'
);
select throws_ok(
  format($$ insert into public.reviews (job_id, reviewer_id, reviewee_id, rating, comment) values (%L, %L, %L, 1, 'a total retard') $$, :'job', :'customer', :'worker'),
  'P0001', 'That includes words Brazos doesn''t allow. Edit it and try again.',
  '4c: a blocked word in a review comment is refused'
);
select throws_ok(
  format($$ insert into public.portfolio_items (worker_id, photo_url, category, caption) values (%L, 'https://example.test/p.jpg', 'other', 'porn shelf') $$, :'worker'),
  'P0001', 'That includes words Brazos doesn''t allow. Edit it and try again.',
  '4d: a blocked word in a portfolio caption is refused'
);

-- ---------------------------------------------------------------------------
-- 5. Reports: the new reason and the subject, as the reporter.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select lives_ok(
  format($$ insert into public.reports (reporter_id, reported_id, job_id, reason, subject_kind, subject_id)
            values (auth.uid(), %L, %L, 'inappropriate', 'profile', %L) $$, :'worker', :'job', :'worker'),
  '5a: a report with the inappropriate reason and a profile subject is filed by the reporter'
);
select throws_ok(
  format($$ insert into public.reports (reporter_id, reported_id, reason, subject_kind) values (auth.uid(), %L, 'other', 'profile') $$, :'worker'),
  '23514', null,
  '5b: a subject kind without its id is refused'
);
select throws_ok(
  format($$ insert into public.reports (reporter_id, reported_id, reason, subject_kind, subject_id) values (auth.uid(), %L, 'other', 'photo', %L) $$, :'worker', :'worker'),
  '23514', null,
  '5c: a subject kind outside the five is refused (allow-list)'
);
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 6. The list and the function are nobody's to read or call.
-- ---------------------------------------------------------------------------
select ok(
  not has_table_privilege('anon', 'public.blocked_terms', 'select')
  and not has_table_privilege('authenticated', 'public.blocked_terms', 'select'),
  '6a: neither anon nor authenticated can read blocked_terms'
);
select ok(
  not has_function_privilege('anon', 'public.reject_blocked_terms()', 'execute')
  and not has_function_privilege('authenticated', 'public.reject_blocked_terms()', 'execute'),
  '6b: reject_blocked_terms() carries no EXECUTE for anon or authenticated (PUBLIC revoked)'
);
select is(
  (select count(*)::int from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where p.proname = 'reject_blocked_terms' and not t.tgisinternal),
  7,
  '6c: the filter guards exactly the seven surfaces (20261003000900 added service listings)'
);

select * from finish();
rollback;
