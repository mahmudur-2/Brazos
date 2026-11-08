-- 080_job_completions.sql — the R6c proofs: 20260925000000_job_completions.sql
-- proven on the local stack before the pipeline applies it anywhere. Each
-- section is one line of the run's proof ledger; its assertions say which.
--
-- THE CAST (named once; every assertion says which of these it ran as):
--   customer   posts and pays for every job here (the payer)
--   worker     is hired on every job (the payee; the one who marks complete)
--   bidder     bids on J1 and loses (the losing bidder)
--   stranger   an unrelated, active, authenticated account
--   anon       no session at all
--   service    the service role (set_config role, as the crons run)
--   runner     the connection's own role, RLS bypassed — fixtures, ground
--              truth, and the stand-in for the webhook (payment_events rows)
--
-- THE FIXTURE: J1 is hired through the real RPCs (create_job, create_offer,
-- accept_offer) by tests.r4_hire with a losing bidder, and funded on the
-- stripe path through begin_job_payment + a synthesized
-- payment_intent.succeeded event (tests.r4_fund). J2 and J3 are hired the same
-- way and funded through the shared tests.test_fund_job (lean v1 removed the
-- sandbox path they used to take). The three helpers are copied from
-- 070_settlement_retry.sql verbatim — same names, same call shapes — because
-- each file's transaction owns its own copy and rolls it back. Everything
-- rolls back.
--
-- WHAT IS PROVEN, section by section:
--   §0 the ACLs the migration must not have moved, the table's
--      shape and its privilege posture (one SELECT policy, no client writes).
--   §2 the guard, stripe path: null photos, an empty array and a video-only
--      payload are each refused with the one sentence; the job is untouched
--      and nobody is notified. The unchanged shape check still fires first on
--      a non-array.
--   §3 the positive control: one photo completes the job exactly as 020/030
--      already expect (completed_at stamped, the cover photo, the customer's
--      job_completed notification), writes ONE job_completions row naming the
--      worker and the photo, and a phase58 retry neither raises nor writes.
--   §4 the table's own constraints as the runner: one per job, at least one
--      photo, never null.
--   §5 RLS and privileges as every member of the cast: the two parties read,
--      the bidder and the stranger get zero rows, anon is refused outright,
--      nobody inserts, updates or deletes, service reads.
--   §6 a second job (J2) refuses and records identically.
--   §7 five photos keep their order; six still hit the unchanged cap.
--   §8 the money path after a guarded completion is unchanged: the customer
--      can still approve (release_job_payment requests the transfer, D23).
--
-- PAIRING: every refusal sits beside the positive control on the same
-- fixture. throws_ok pins code AND message.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(64);

-- psql does not interpolate :'vars' inside dollar quotes, so ids also live in
-- this temp table for the statements throws_ok/lives_ok execute.
create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated, service_role;

select tests.create_user('r6c.customer@brazos.test', 'Cara Customer') as customer \gset
select tests.create_user('r6c.worker@brazos.test',   'Wren Worker')   as worker   \gset
select tests.create_user('r6c.bidder@brazos.test',   'Bo Bidder')     as bidder   \gset
select tests.create_user('r6c.stranger@brazos.test', 'Sal Stranger')  as stranger \gset
insert into fx values ('customer', :'customer'), ('worker', :'worker'), ('bidder', :'bidder'), ('stranger', :'stranger');

-- ---------------------------------------------------------------------------
-- Helpers for this file, copied from 070_settlement_retry.sql. Created inside
-- the transaction, gone at rollback.
-- ---------------------------------------------------------------------------
-- Hire the worker on a fresh job through the real RPCs; an optional losing bidder.
create or replace function tests.r4_hire(p_customer uuid, p_worker uuid, p_amount integer, p_title text,
  p_scheduled_date date default null, p_start smallint default null, p_end smallint default null,
  p_bidder uuid default null)
returns uuid language plpgsql as $$
declare
  v_job uuid;
  v_offer uuid;
begin
  perform tests.authenticate_as(p_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'R4 probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := p_amount, p_budget_max_cents := p_amount,
    p_address_line := '4 Proof Way',
    p_scheduled_date := p_scheduled_date,
    p_arrival_start_hour := p_start, p_arrival_end_hour := p_end
  )).id into v_job;
  perform tests.authenticate_as(p_worker);
  v_offer := public.create_offer(p_amount_cents := p_amount, p_job_id := v_job, p_message := 'R4 bid');
  if p_bidder is not null then
    perform tests.authenticate_as(p_bidder);
    perform public.create_offer(p_amount_cents := p_amount + 100, p_job_id := v_job, p_message := 'R4 losing bid');
  end if;
  perform tests.authenticate_as(p_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  return v_job;
end $$;

-- A provider event, in the minimum shape apply_payment_event reads, applied.
create or replace function tests.r4_event(p_id text, p_type text, p_payment text,
  p_object jsonb default '{}'::jsonb, p_with_metadata boolean default true)
returns jsonb language plpgsql as $$
declare
  v_obj jsonb := coalesce(p_object, '{}'::jsonb);
begin
  if p_with_metadata then
    v_obj := v_obj || jsonb_build_object('metadata', jsonb_build_object('payment_id', p_payment));
  end if;
  insert into public.payment_events (id, type, payload)
  values (p_id, p_type, jsonb_build_object('id', p_id, 'type', p_type, 'data', jsonb_build_object('object', v_obj)))
  on conflict (id) do nothing;
  return public.apply_payment_event(p_id);
end $$;

-- The stripe checkout: begin_job_payment as the customer, the intent id
-- attached, payment_intent.succeeded applied. Returns the payment id.
create or replace function tests.r4_fund(p_customer uuid, p_job uuid, p_evt text) returns uuid language plpgsql as $$
declare v_pid uuid;
begin
  perform tests.authenticate_as(p_customer);
  v_pid := (public.begin_job_payment(p_job)).id;
  perform tests.clear_auth();
  perform public.attach_provider_ref(v_pid, 'pi_' || p_evt);
  perform tests.r4_event(p_evt, 'payment_intent.succeeded', v_pid::text, jsonb_build_object('id', 'pi_' || p_evt));
  return v_pid;
end $$;

-- ---------------------------------------------------------------------------
-- §0. The ACLs the migration must not have moved, and the table's shape and
--     privilege posture (its sentinel went in lean v1, ruling 53).
-- ---------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.transition_job_status(uuid, text, jsonb, jsonb)', 'EXECUTE'),
  '0: create or replace preserved transition_job_status''s ACL — authenticated still executes it');
select ok(not has_function_privilege('anon', 'public.transition_job_status(uuid, text, jsonb, jsonb)', 'EXECUTE'),
  '0: … and anon still does not');

select has_table('public', 'job_completions', '1: job_completions exists');
select ok((select relrowsecurity from pg_class where oid = 'public.job_completions'::regclass),
  '1: row level security is on');
select columns_are('public', 'job_completions', array['id', 'job_id', 'completed_by', 'photos', 'created_at'],
  '1: exactly the five columns D5 names');
select col_type_is('public', 'job_completions', 'photos', 'text[]', '1: photos is text[]');
select col_not_null('public', 'job_completions', 'photos', '1: photos is not null');
select col_is_unique('public', 'job_completions', 'job_id', '1: one completion per job — job_id is unique');
select col_is_fk('public', 'job_completions', 'job_id', '1: job_id references jobs');
select col_is_fk('public', 'job_completions', 'completed_by', '1: completed_by references profiles');
select policies_are('public', 'job_completions', array['job_completions_parties_select'],
  '1: exactly one policy on the table');
select policy_cmd_is('public', 'job_completions', 'job_completions_parties_select', 'SELECT',
  '1: … and it is a SELECT policy');
select policy_roles_are('public', 'job_completions', 'job_completions_parties_select', array['authenticated'],
  '1: … for authenticated');
select table_privs_are('public', 'job_completions', 'anon', '{}'::text[],
  '1: anon holds no privilege on the table');
select table_privs_are('public', 'job_completions', 'authenticated', array['SELECT'],
  '1: authenticated holds SELECT and nothing else — no INSERT, UPDATE or DELETE');

-- ---------------------------------------------------------------------------
-- §2. THE GUARD, stripe path (J1). Hired with a losing bidder, funded, started.
-- ---------------------------------------------------------------------------
select tests.r4_hire(:'customer', :'worker', 5000, 'R6c J1 stripe', p_bidder := :'bidder') as j1 \gset
insert into fx values ('j1', :'j1');
select tests.r4_fund(:'customer', :'j1', 'evt_r6c_j1') as p1 \gset
insert into fx values ('p1', :'p1');
select is((select status::text from public.payments where id = :'p1'), 'held',
  'J1: funded on the stripe path — the row is held, so the start can land');
select tests.authenticate_as(:'worker');
select is((public.transition_job_status(:'j1', 'in_progress')).status::text, 'in_progress',
  '2: assigned -> in_progress needs no photo — the guard is on completion only');
select throws_ok($$ select public.transition_job_status((select v from fx where k = 'j1'), 'completed') $$,
  'P0001', 'At least one photo of the finished work is required to mark this job complete',
  '2: worker: completing with no photos at all (null) is refused, naming the reason');
select throws_ok($$ select public.transition_job_status((select v from fx where k = 'j1'), 'completed', '[]'::jsonb) $$,
  'P0001', 'At least one photo of the finished work is required to mark this job complete',
  '2: worker: an empty photo array is refused the same way');
select throws_ok($$ select public.transition_job_status((select v from fx where k = 'j1'), 'completed', '[]'::jsonb, '["https://example.com/r6c-j1.mp4"]'::jsonb) $$,
  'P0001', 'At least one photo of the finished work is required to mark this job complete',
  '2: worker: a video alone is not a photo — refused');
select throws_ok($$ select public.transition_job_status((select v from fx where k = 'j1'), 'completed', '"https://example.com/not-an-array.jpg"'::jsonb) $$,
  'P0001', 'Completion photos must be an array with at most 5 entries',
  '2: worker: the unchanged shape check still fires first on a non-array');
select tests.clear_auth();
select ok((select status = 'in_progress' and completed_at is null and completion_photos = '[]'::jsonb from public.jobs where id = :'j1'),
  '2: the refusals left the job in_progress, completed_at null, no photos stored');
select is((select count(*) from public.job_completions where job_id = :'j1'), 0::bigint,
  '2: … and wrote no job_completions row');
select is((select count(*) from public.notification_outbox where recipient_id = :'customer' and type = 'job_completed'), 0::bigint,
  '2: … and notified nobody of a completion');

-- ---------------------------------------------------------------------------
-- §3. THE POSITIVE CONTROL: one photo completes J1 exactly as before, and
--     writes the one row. A retry neither raises nor writes.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'worker');
select ok((select j.status = 'completed' and j.completed_at is not null
             and j.completion_photos = '["https://example.com/r6c-j1.jpg"]'::jsonb
             and j.completion_photo_url = 'https://example.com/r6c-j1.jpg'
           from public.transition_job_status(:'j1', 'completed', '["https://example.com/r6c-j1.jpg"]'::jsonb) j),
  '3: worker: with one photo the completion lands — status completed, completed_at stamped, the photo stored, the first one the cover (020 D3 / 030 J1 unchanged)');
select tests.clear_auth();
select is((select count(*) from public.job_completions where job_id = :'j1'), 1::bigint,
  '3: exactly one job_completions row was written');
select ok((select c.completed_by = :'worker' and c.photos = array['https://example.com/r6c-j1.jpg'] and c.created_at is not null
           from public.job_completions c where c.job_id = :'j1'),
  '3: the row names the worker and carries the photo');
select is((select count(*) from public.notification_outbox where recipient_id = :'customer' and type = 'job_completed'), 1::bigint,
  '3: the customer was notified of the completion exactly once — the trigger 020/030 rely on is untouched');
select tests.authenticate_as(:'worker');
select is((public.transition_job_status(:'j1', 'completed')).status::text, 'completed',
  '3: worker: a retry of the landed completion — no photos passed — returns the row (phase58), never the guard');
select tests.clear_auth();
select is((select count(*) from public.job_completions where job_id = :'j1'), 1::bigint,
  '3: … and did not write a second row');
select is((select count(*) from public.notification_outbox where recipient_id = :'customer' and type = 'job_completed'), 1::bigint,
  '3: … or a second notification');

-- ---------------------------------------------------------------------------
-- §4. THE TABLE'S OWN CONSTRAINTS, as the runner (RLS bypassed): one per job,
--     at least one photo, never null. J2 is hired here for the next sections.
-- ---------------------------------------------------------------------------
select tests.r4_hire(:'customer', :'worker', 4000, 'R6c J2') as j2 \gset
insert into fx values ('j2', :'j2');
select throws_ok($$ insert into public.job_completions (job_id, completed_by, photos)
  values ((select v from fx where k = 'j1'), (select v from fx where k = 'worker'), array['https://example.com/second.jpg']) $$,
  '23505', 'duplicate key value violates unique constraint "job_completions_job_id_key"',
  '4: runner: a second completion for the same job is refused by the unique constraint');
select throws_ok($$ insert into public.job_completions (job_id, completed_by, photos)
  values ((select v from fx where k = 'j2'), (select v from fx where k = 'worker'), array[]::text[]) $$,
  '23514', 'new row for relation "job_completions" violates check constraint "job_completions_at_least_one_photo"',
  '4: runner: an empty photos array is refused by the check constraint');
select throws_ok($$ insert into public.job_completions (job_id, completed_by, photos)
  values ((select v from fx where k = 'j2'), (select v from fx where k = 'worker'), null) $$,
  '23502', 'null value in column "photos" of relation "job_completions" violates not-null constraint',
  '4: runner: null photos are refused');
select is((select count(*) from public.job_completions where job_id = :'j2'), 0::bigint,
  '4: nothing landed for J2');

-- ---------------------------------------------------------------------------
-- §5. RLS AND PRIVILEGES on J1's row, as every member of the cast. Each
--     refusal sits beside the positive read on the same row.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select is((select count(*) from public.job_completions), 1::bigint,
  '5: customer — reads the completion of their own job');
select throws_ok($$ insert into public.job_completions (job_id, completed_by, photos)
  values ((select v from fx where k = 'j2'), (select v from fx where k = 'worker'), array['https://example.com/x.jpg']) $$,
  '42501', 'permission denied for table job_completions', '5: customer — cannot insert');
select throws_ok($$ delete from public.job_completions $$,
  '42501', 'permission denied for table job_completions', '5: customer — cannot delete');
select tests.authenticate_as(:'worker');
select is((select count(*) from public.job_completions), 1::bigint,
  '5: worker — reads the completion they wrote');
select throws_ok($$ insert into public.job_completions (job_id, completed_by, photos)
  values ((select v from fx where k = 'j2'), (select v from fx where k = 'worker'), array['https://example.com/x.jpg']) $$,
  '42501', 'permission denied for table job_completions', '5: worker — cannot insert directly; only transition_job_status writes');
select throws_ok($$ update public.job_completions set photos = array['https://example.com/tamper.jpg'] $$,
  '42501', 'permission denied for table job_completions', '5: worker — cannot update');
select tests.authenticate_as(:'bidder');
select is((select count(*) from public.job_completions), 0::bigint,
  '5: losing bidder — zero rows');
select throws_ok($$ insert into public.job_completions (job_id, completed_by, photos)
  values ((select v from fx where k = 'j2'), (select v from fx where k = 'bidder'), array['https://example.com/x.jpg']) $$,
  '42501', 'permission denied for table job_completions', '5: losing bidder — cannot insert');
select tests.authenticate_as(:'stranger');
select is((select count(*) from public.job_completions), 0::bigint,
  '5: stranger — zero rows');
select throws_ok($$ insert into public.job_completions (job_id, completed_by, photos)
  values ((select v from fx where k = 'j2'), (select v from fx where k = 'stranger'), array['https://example.com/x.jpg']) $$,
  '42501', 'permission denied for table job_completions', '5: stranger — cannot insert');
select tests.authenticate_anon();
select throws_ok($$ select count(*) from public.job_completions $$,
  '42501', 'permission denied for table job_completions', '5: anon — cannot read the table at all');
select throws_ok($$ insert into public.job_completions (job_id, completed_by, photos)
  values ((select v from fx where k = 'j2'), (select v from fx where k = 'worker'), array['https://example.com/x.jpg']) $$,
  '42501', 'permission denied for table job_completions', '5: anon — cannot insert');
select throws_ok($$ select public.transition_job_status((select v from fx where k = 'j2'), 'in_progress') $$,
  '42501', 'permission denied for function transition_job_status', '5: anon — cannot execute transition_job_status');
select tests.clear_auth();
select set_config('role', 'service_role', true);
select is((select count(*) from public.job_completions), 1::bigint,
  '5: service — reads every row (default-privilege ALL, RLS bypassed, as on every table)');
select set_config('role', 'none', true);

-- ---------------------------------------------------------------------------
-- §6. A SECOND JOB (J2): the guard refuses and the row is written
--     identically.
-- ---------------------------------------------------------------------------
select tests.test_fund_job(:'j2') as p2 \gset
insert into fx values ('p2', :'p2');
select is((select status::text from public.payments where id = :'p2'), 'held', 'J2: the hold lands');
select tests.authenticate_as(:'worker');
select is((public.transition_job_status(:'j2', 'in_progress')).status::text, 'in_progress',
  '6: J2: the start succeeds once held');
select throws_ok($$ select public.transition_job_status((select v from fx where k = 'j2'), 'completed') $$,
  'P0001', 'At least one photo of the finished work is required to mark this job complete',
  '6: J2: completing without a photo is refused identically');
select ok((select j.status = 'completed' and j.completed_at is not null
           from public.transition_job_status(:'j2', 'completed', '["https://example.com/r6c-j2.jpg"]'::jsonb) j),
  '6: J2: the completion lands with one photo');
select tests.clear_auth();
select ok((select c.completed_by = :'worker' and c.photos = array['https://example.com/r6c-j2.jpg']
           from public.job_completions c where c.job_id = :'j2'),
  '6: J2: the row is written the same way');
select is((select count(*) from public.job_completions), 2::bigint, '6: two completed jobs, two rows');

-- ---------------------------------------------------------------------------
-- §7. FIVE PHOTOS keep their order (J3); six still hit the unchanged cap.
-- ---------------------------------------------------------------------------
select tests.r4_hire(:'customer', :'worker', 3000, 'R6c J3 five photos') as j3 \gset
insert into fx values ('j3', :'j3');
select tests.test_fund_job(:'j3') as p3 \gset
insert into fx values ('p3', :'p3');
select is((select status::text from public.payments where id = :'p3'), 'held', 'J3: the hold lands');
select tests.authenticate_as(:'worker');
select is((public.transition_job_status(:'j3', 'in_progress')).status::text, 'in_progress', 'J3: started');
select throws_ok($$ select public.transition_job_status((select v from fx where k = 'j3'), 'completed',
  '["https://example.com/1.jpg","https://example.com/2.jpg","https://example.com/3.jpg","https://example.com/4.jpg","https://example.com/5.jpg","https://example.com/6.jpg"]'::jsonb) $$,
  'P0001', 'Completion photos must be an array with at most 5 entries',
  '7: worker: six photos still hit the unchanged cap');
select ok((select j.status = 'completed'
           from public.transition_job_status(:'j3', 'completed',
             '["https://example.com/r6c-j3-1.jpg","https://example.com/r6c-j3-2.jpg","https://example.com/r6c-j3-3.jpg","https://example.com/r6c-j3-4.jpg","https://example.com/r6c-j3-5.jpg"]'::jsonb) j),
  '7: worker: five photos complete the job');
select tests.clear_auth();
select is((select photos from public.job_completions where job_id = :'j3'),
  array['https://example.com/r6c-j3-1.jpg', 'https://example.com/r6c-j3-2.jpg', 'https://example.com/r6c-j3-3.jpg', 'https://example.com/r6c-j3-4.jpg', 'https://example.com/r6c-j3-5.jpg'],
  '7: all five photos are recorded in the order given');
select is((select completion_photo_url from public.jobs where id = :'j3'), 'https://example.com/r6c-j3-1.jpg',
  '7: the first is still the cover');
select is((select count(*) from public.job_completions), 3::bigint, '7: three completed jobs, three rows');

-- ---------------------------------------------------------------------------
-- §8. THE MONEY PATH after a guarded completion is unchanged: the customer
--     approves J1, and release_job_payment requests the transfer on the held
--     stripe row (D23) exactly as before.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select ok((select p.release_requested_at is not null and p.status = 'held' and p.transfer_cents > 0
           from public.release_job_payment(:'j1') p),
  '8: customer — approving the guarded completion still requests the transfer on the held stripe row (D23)');
select tests.authenticate_as(:'worker');
select throws_ok($$ select public.release_job_payment((select v from fx where k = 'j1')) $$,
  'P0001', 'Job not found', '8: worker — release is still refused for a caller who is not the customer');
select tests.clear_auth();
select set_config('role', 'none', true);

select * from finish();
rollback;
