-- 470_access_allow_list.sql — 20261116000000_access_allow_list.sql (production-36h S1, M1).
-- §1 is_blocked_between runs as the caller (B4): the two parties still get true, a stranger gets
-- false, every policy that asks still refuses both directions, and the definer callers still see the
-- block. §2 the table rights no call uses are refused at the grant, and every write the app makes
-- still works, in the app's own shape (B11: a report cannot carry its own status or date).
--
-- THE CAST: customer (C), worker (W, hired by C on j_run), stranger (S, no part in anything).
-- FIXTURE, DECLARED: the runner writes the jobs, the block and one test definer probe
-- (tests.b4_probe, owned by the runner like the real definer callers, granted to authenticated).
-- Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(55);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('allow.customer@brazos.test', 'Cal Customer') as cust \gset
select tests.create_user('allow.worker@brazos.test',   'Wyn Worker')   as wrk  \gset
select tests.create_user('allow.stranger@brazos.test', 'Sol Stranger') as str  \gset

insert into public.jobs (client_id, title, status, assigned_worker_id) values (:'cust', 'ALLOW running', 'in_progress', :'wrk')
  returning id as j_run \gset
insert into public.jobs (client_id, title, status) values (:'cust', 'ALLOW open', 'open')
  returning id as j_open \gset
insert into fx values ('cust', :'cust'), ('wrk', :'wrk'), ('str', :'str'), ('j_run', :'j_run'), ('j_open', :'j_open');

-- A definer caller, as the real ones are: owned by the runner (the owner of public.blocks).
create function tests.b4_probe(a uuid, b uuid) returns text
language sql stable security definer set search_path = public, pg_temp
as $f$ select public.is_blocked_between(a, b)::text || '/' || public.job_request_parties_ok(a, b)::text
             || '/' || public.should_notify(a, b, 'messages')::text $f$;
grant execute on function tests.b4_probe(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- §0. Before the block: every door the block will close is open (the positive controls).
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'str');
select is(tests.b4_probe(:'cust', :'wrk'), 'false/true/true',
  'control: stranger, through a definer caller: no block, the parties may deal, the customer would be told of the worker''s message');

select tests.authenticate_as(:'wrk');
select lives_ok($$ select public.create_offer(p_amount_cents := 5000, p_job_id := (select v from fx where k = 'j_open')) $$,
  'control: worker bids on the customer''s open job');
select lives_ok($$ insert into public.messages (job_id, sender_id, content) values ((select v from fx where k = 'j_run'), (select v from fx where k = 'wrk'), 'ALLOW on my way') $$,
  'control: worker writes in the job''s thread');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('chat-photos', (select v from fx where k = 'j_run')::text || '/' || (select v from fx where k = 'wrk')::text || '/allow-w.jpg') $$,
  'control: worker uploads a chat photo to the job''s thread');
select tests.clear_auth();
select id as dt from public.direct_threads
 where user_a = least(:'cust'::uuid, :'wrk'::uuid) and user_b = greatest(:'cust'::uuid, :'wrk'::uuid) \gset
insert into fx values ('dt', :'dt');
select ok(:'dt' is not null, 'fixture: the bid opened the pair''s direct thread');

select tests.authenticate_as(:'cust');
select lives_ok($$ insert into public.messages (direct_thread_id, sender_id, content) values ((select v from fx where k = 'dt'), (select v from fx where k = 'cust'), 'ALLOW hello') $$,
  'control: customer writes in the pair''s direct thread');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('chat-photos', (select v from fx where k = 'j_run')::text || '/' || (select v from fx where k = 'cust')::text || '/allow-c.jpg') $$,
  'control: customer uploads a chat photo to the job''s thread (a legitimate party upload)');
select is(public.is_blocked_between(:'cust', :'wrk'), false, 'control: customer: no block yet');

-- The block: the customer blocks the worker.
select tests.clear_auth();
insert into public.blocks (blocker_id, blocked_id) values (:'cust', :'wrk');

-- ---------------------------------------------------------------------------
-- §1. B4 — the block check answers only the parties.
-- ---------------------------------------------------------------------------
select ok(not (select prosecdef from pg_proc where oid = 'public.is_blocked_between(uuid, uuid)'::regprocedure),
  'B4: is_blocked_between is SECURITY INVOKER');
select ok(has_table_privilege('authenticated', 'public.blocks', 'SELECT')
          and has_function_privilege('authenticated', 'public.is_blocked_between(uuid, uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.is_blocked_between(uuid, uuid)', 'EXECUTE'),
  'B4: authenticated holds SELECT on blocks and EXECUTE on the check, which the policies evaluate as the caller; anon holds neither');

select tests.authenticate_as(:'cust');
select is(public.is_blocked_between(:'cust', :'wrk'), true, 'B4 (a): the blocker''s own call sees the block');
select is(public.is_blocked_between(:'wrk', :'cust'), true, 'B4 (a): … in either argument order');
select tests.authenticate_as(:'wrk');
select is(public.is_blocked_between(:'cust', :'wrk'), true, 'B4 (a): the blocked person''s own call sees the block');
select tests.authenticate_as(:'str');
select is(public.is_blocked_between(:'cust', :'wrk'), false, 'B4 (a): a stranger''s call learns nothing: false');
select is(public.is_blocked_between(:'wrk', :'cust'), false, 'B4 (a): … in either argument order');

-- (b) every policy that calls it refuses, in both directions.
select tests.authenticate_as(:'wrk');
select throws_ok($$ insert into public.messages (job_id, sender_id, content) values ((select v from fx where k = 'j_run'), (select v from fx where k = 'wrk'), 'ALLOW blocked w') $$,
  '42501', 'new row violates row-level security policy for table "messages"', 'B4 (b): the blocked worker cannot write in the job''s thread');
select throws_ok($$ insert into public.messages (direct_thread_id, sender_id, content) values ((select v from fx where k = 'dt'), (select v from fx where k = 'wrk'), 'ALLOW blocked w') $$,
  '42501', 'new row violates row-level security policy for table "messages"', 'B4 (b): … nor in the pair''s direct thread');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('chat-photos', (select v from fx where k = 'j_run')::text || '/' || (select v from fx where k = 'wrk')::text || '/allow-w2.jpg') $$,
  '42501', 'new row violates row-level security policy for table "objects"', 'B4 (b): … nor upload a chat photo');
select tests.authenticate_as(:'cust');
select throws_ok($$ insert into public.messages (job_id, sender_id, content) values ((select v from fx where k = 'j_run'), (select v from fx where k = 'cust'), 'ALLOW blocked c') $$,
  '42501', 'new row violates row-level security policy for table "messages"', 'B4 (b): the blocker cannot write in the job''s thread either');
select throws_ok($$ insert into public.messages (direct_thread_id, sender_id, content) values ((select v from fx where k = 'dt'), (select v from fx where k = 'cust'), 'ALLOW blocked c') $$,
  '42501', 'new row violates row-level security policy for table "messages"', 'B4 (b): … nor in the pair''s direct thread');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('chat-photos', (select v from fx where k = 'j_run')::text || '/' || (select v from fx where k = 'cust')::text || '/allow-c2.jpg') $$,
  '42501', 'new row violates row-level security policy for table "objects"', 'B4 (b): … nor upload a chat photo');
select tests.clear_auth();
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and (policyname ilike '%audio%' or policyname ilike '%document%')), 0::bigint,
  'B4 (b): there is no audio or document upload policy to check (lean v1 removed both doors)');

-- (c) the definer callers still see the block.
select tests.authenticate_as(:'str');
select is(tests.b4_probe(:'cust', :'wrk'), 'true/false/false',
  'B4 (c): stranger, through a definer caller: the block is seen, job_request_parties_ok refuses, should_notify stays quiet');
select tests.authenticate_as(:'wrk');
select throws_ok($$ select public.create_offer(p_amount_cents := 5100, p_job_id := (select v from fx where k = 'j_open')) $$,
  'P0001', 'Bid is not allowed', 'B4 (c): create_offer: the blocked worker cannot bid on the blocker''s job');
select throws_ok($$ select public.create_offer(p_amount_cents := 5000, p_worker_id := (select v from fx where k = 'cust'), p_title := 'ALLOW', p_category := 'other') $$,
  'P0001', 'This offer cannot be sent', 'B4 (c): create_offer: the blocked person cannot send the blocker a direct offer');
select tests.authenticate_as(:'cust');
select throws_ok($$ select public.create_offer(p_amount_cents := 5000, p_worker_id := (select v from fx where k = 'wrk'), p_title := 'ALLOW', p_category := 'other') $$,
  'P0001', 'This offer cannot be sent', 'B4 (c): create_offer: the blocker cannot send the blocked worker a direct offer');
-- ---------------------------------------------------------------------------
-- §2. Table rights no call uses are refused at the grant; every write the app makes still works.
-- ---------------------------------------------------------------------------
-- reports (B11): createReport's insert, in its exact shape (lib/moderation.ts, no RETURNING).
select tests.authenticate_as(:'cust');
select lives_ok($$ insert into public.reports (reporter_id, reported_id, job_id, reason, description)
                   values ((select v from fx where k = 'cust'), (select v from fx where k = 'wrk'), (select v from fx where k = 'j_run'), 'other', 'ALLOW report') $$,
  'B11: the reporter files a report in createReport''s shape (no subject)');
select lives_ok($$ insert into public.reports (reporter_id, reported_id, job_id, reason, description, subject_kind, subject_id)
                   values ((select v from fx where k = 'cust'), (select v from fx where k = 'wrk'), (select v from fx where k = 'j_run'), 'harassment', 'ALLOW report 2', 'profile', (select v from fx where k = 'wrk')) $$,
  'B11: the reporter files a report with all seven columns createReport can send');
select throws_ok($$ insert into public.reports (reporter_id, reported_id, reason, status)
                    values ((select v from fx where k = 'cust'), (select v from fx where k = 'wrk'), 'other', 'dismissed') $$,
  '42501', 'permission denied for table reports', 'B11: the reporter cannot set the report''s status');
select throws_ok($$ insert into public.reports (reporter_id, reported_id, reason, created_at)
                    values ((select v from fx where k = 'cust'), (select v from fx where k = 'wrk'), 'other', now() - interval '1 year') $$,
  '42501', 'permission denied for table reports', 'B11: the reporter cannot set the report''s date');
select throws_ok($$ insert into public.reports (id, reporter_id, reported_id, reason)
                    values (gen_random_uuid(), (select v from fx where k = 'cust'), (select v from fx where k = 'wrk'), 'other') $$,
  '42501', 'permission denied for table reports', 'B11: the reporter cannot choose the report''s id');
select tests.clear_auth();
select is((select string_agg(status || ':' || (created_at > now() - interval '1 minute')::text, ',' order by description)
             from public.reports where reporter_id = :'cust'),
  'open:true,open:true', 'B11: runner: the two filed reports are open and dated now');

-- messages: INSERT stays (§0); UPDATE and DELETE go (unsend_message is the door).
select tests.authenticate_as(:'wrk');
select is((select count(*) from public.messages where job_id = :'j_run' and sender_id = :'wrk'), 1::bigint,
  'control: the worker reads their own message (the row the refusals below aim at)');
select throws_ok($$ update public.messages set content = 'ALLOW edited' where sender_id = (select v from fx where k = 'wrk') $$,
  '42501', 'permission denied for table messages', 'grant: a sender cannot rewrite a message directly');
select throws_ok($$ delete from public.messages where sender_id = (select v from fx where k = 'wrk') $$,
  '42501', 'permission denied for table messages', 'grant: a sender cannot remove a message directly');

-- message_reads: the app's upsert (lib/conversations.ts), twice so the second takes the conflict path.
select tests.authenticate_as(:'cust');
select lives_ok($$ insert into public.message_reads (job_id, user_id, last_read_at)
                   values ((select v from fx where k = 'j_run'), (select v from fx where k = 'cust'), now())
                   on conflict (user_id, job_id) do update set job_id = excluded.job_id, user_id = excluded.user_id, last_read_at = excluded.last_read_at $$,
  'control: the customer marks the job thread read (the app''s upsert, insert path)');
select lives_ok($$ insert into public.message_reads (job_id, user_id, last_read_at)
                   values ((select v from fx where k = 'j_run'), (select v from fx where k = 'cust'), now())
                   on conflict (user_id, job_id) do update set job_id = excluded.job_id, user_id = excluded.user_id, last_read_at = excluded.last_read_at $$,
  'control: … and again (the conflict path)');
select is((select count(*) from public.message_reads where user_id = :'cust'), 1::bigint, 'control: one read marker, the customer''s');
select throws_ok($$ delete from public.message_reads where user_id = (select v from fx where k = 'cust') $$,
  '42501', 'permission denied for table message_reads', 'grant: a read marker cannot be removed');

-- notification_prefs: the app's update (lib/notificationPrefs.ts) stays; DELETE goes.
with u as (update public.notification_prefs set messages = true, updated_at = now() where user_id = :'cust' returning 1)
select is((select count(*) from u), 1::bigint, 'control: the customer updates their notification settings');
select throws_ok($$ delete from public.notification_prefs where user_id = (select v from fx where k = 'cust') $$,
  '42501', 'permission denied for table notification_prefs', 'grant: notification settings cannot be removed');

-- push_tokens: register_push_token and the sign-out deactivate (lib/pushNotifications.ts) stay.
select tests.authenticate_as(:'wrk');
select lives_ok($$ select public.register_push_token('allow-token-w', 'ios') $$, 'control: the worker registers a device');
with u as (update public.push_tokens set active = false where token = 'allow-token-w' returning 1)
select is((select count(*) from u), 1::bigint, 'control: the worker deactivates it on sign-out (the app''s direct UPDATE)');
select throws_ok($$ insert into public.push_tokens (user_id, token) values ((select v from fx where k = 'wrk'), 'allow-direct') $$,
  '42501', 'permission denied for table push_tokens', 'grant: a token cannot be inserted directly, even one''s own (register_push_token is the door)');
select throws_ok($$ delete from public.push_tokens where token = 'allow-token-w' $$,
  '42501', 'permission denied for table push_tokens', 'grant: a token cannot be removed directly, even one''s own');

-- legal_acceptances: accept_legal_documents stays the only write.
select is(public.accept_legal_documents('[{"document": "terms", "version": "2026-11"}]'::jsonb), 1, 'control: the worker accepts the terms through the RPC');
select is((select count(*) from public.legal_acceptances where user_id = :'wrk'), 1::bigint, 'control: … and reads the acceptance back');
select throws_ok($$ insert into public.legal_acceptances (user_id, document, version) values ((select v from fx where k = 'wrk'), 'privacy', 'forged') $$,
  '42501', 'permission denied for table legal_acceptances', 'grant: an acceptance cannot be written directly, even one''s own');
select throws_ok($$ update public.legal_acceptances set version = 'forged' where user_id = (select v from fx where k = 'wrk') $$,
  '42501', 'permission denied for table legal_acceptances', 'grant: an acceptance cannot be rewritten');
select throws_ok($$ delete from public.legal_acceptances where user_id = (select v from fx where k = 'wrk') $$,
  '42501', 'permission denied for table legal_acceptances', 'grant: an acceptance cannot be removed');

-- banned_phones: no signed-in read at all.
select throws_ok($$ select count(*) from public.banned_phones $$,
  '42501', 'permission denied for table banned_phones', 'grant: a signed-in user cannot read the ban list');

-- bids: SELECT stays, DELETE goes (040_authz.sql §4a has the five identities).
select is((select count(*) from public.bids where job_id = :'j_open' and worker_id = :'wrk'), 1::bigint,
  'control: the worker reads their projected bid');
select throws_ok($$ delete from public.bids where worker_id = (select v from fx where k = 'wrk') $$,
  '42501', 'permission denied for table bids', 'grant: a projected bid cannot be removed directly');

-- blocks: the app's block and unblock stay.
select tests.authenticate_as(:'str');
select lives_ok($$ insert into public.blocks (blocker_id, blocked_id) values ((select v from fx where k = 'str'), (select v from fx where k = 'cust')) $$,
  'control: a user blocks someone');
with d as (delete from public.blocks where blocker_id = :'str' returning 1)
select is((select count(*) from d), 1::bigint, 'control: … and unblocks them');

select tests.clear_auth();
select * from finish();
rollback;
