-- 310_grants.sql — 20261108010000_lean_v1_grants.sql, docs/lean/SECURITY-VERDICT.md B1 and B2.
-- §1 the grant sweep over every public relation and function (pg_class / pg_proc, so an object added
-- later is covered by the same assertions); §2 the bucket decisions and the storage policies.
-- Everything rolls back; no commit.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(31);

-- ---------------------------------------------------------------------------
-- §1. Grants (B1).
-- ---------------------------------------------------------------------------
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')),
  'app_config',
  'B1: anon holds a privilege on exactly one public relation, app_config');
select ok(has_table_privilege('anon', 'public.app_config', 'SELECT'),
  'B1: anon may SELECT app_config (the world-readable policy)');
select ok(not has_table_privilege('anon', 'public.app_config', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
  'B1: … and nothing else on it');
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')),
  'app_config',
  'B1: no column-level grant gives anon another relation');
select is(
  (select count(*)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S'
      and case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'USAGE,SELECT,UPDATE') end),
  0::bigint,
  'B1: anon holds nothing on any public sequence');
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_table_privilege('authenticated', c.oid, 'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')),
  '',
  'B1: authenticated holds no TRUNCATE, REFERENCES, TRIGGER or MAINTAIN on any public relation');
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_any_column_privilege('authenticated', c.oid, 'REFERENCES')),
  '',
  'B1: … nor a column-level REFERENCES');
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')),
  '',
  'B1: anon may execute no public function (review_is_revealed was the last)');
select ok(not has_function_privilege('authenticated', 'public.should_notify(uuid, uuid, text)', 'EXECUTE'),
  'B1: authenticated may not run should_notify (it answers about other users; its callers are definer functions)');
select ok(not has_function_privilege('authenticated', 'public.job_request_parties_ok(uuid, uuid)', 'EXECUTE'),
  'B1: authenticated may not run job_request_parties_ok');
select has_function('public', 'job_request_parties_ok', ARRAY['uuid', 'uuid'],
  'B1: job_request_parties_ok still exists: accept_offer, create_offer, counter_offer and advance_job_series call it');
select ok(has_function_privilege('authenticated', 'public.is_blocked_between(uuid, uuid)', 'EXECUTE'),
  'B1: authenticated keeps is_blocked_between: messages_insert_party and chat_photos_insert_party evaluate it as the caller');
select ok(has_function_privilege('authenticated', 'public.review_is_revealed(uuid, uuid, uuid, timestamp with time zone)', 'EXECUTE'),
  'B1: authenticated keeps review_is_revealed: reviews_select_party evaluates it as the caller');
select is(
  (select count(*)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0::bigint,
  'B1: every public table has row level security on');
select ok(not exists (
    select 1 from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace,
                  lateral aclexplode(d.defaclacl) a
     where n.nspname = 'public' and d.defaclrole = 'postgres'::regrole and a.grantee = 'anon'::regrole),
  'B1: the default privileges postgres gives new public objects carry no anon entry');
select ok(not exists (
    select 1 from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace,
                  lateral aclexplode(d.defaclacl) a
     where n.nspname = 'public' and d.defaclrole = 'postgres'::regrole and a.grantee = 'authenticated'::regrole
       and a.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')),
  'B1: … and no TRUNCATE, REFERENCES, TRIGGER or MAINTAIN for authenticated');

-- The sweep never over-revokes: what the app calls and reads still works for authenticated.
select ok(has_function_privilege('authenticated', 'public.accept_offer(uuid)', 'EXECUTE'),
  'B1: authenticated may still run accept_offer');
select ok(has_function_privilege('authenticated', 'public.create_offer(integer, uuid, text, uuid, text, text, text, text, jsonb, jsonb, double precision, double precision, uuid)', 'EXECUTE'),
  'B1: authenticated may still run create_offer');
select ok(has_function_privilege('authenticated', 'public.transition_job_status(uuid, text, jsonb, jsonb)', 'EXECUTE'),
  'B1: authenticated may still run transition_job_status');
select ok(has_function_privilege('authenticated', 'public.release_job_payment(uuid)', 'EXECUTE'),
  'B1: authenticated may still run release_job_payment');
select ok(has_function_privilege('authenticated', 'public.quote_job_price(integer, timestamp with time zone)', 'EXECUTE'),
  'B1: authenticated may still run quote_job_price');
select ok(has_function_privilege('authenticated', 'public.is_profile_active(uuid)', 'EXECUTE'),
  'B1: authenticated may still run is_profile_active');
select ok(has_table_privilege('authenticated', 'public.jobs', 'SELECT') and has_table_privilege('authenticated', 'public.messages', 'INSERT'),
  'B1: authenticated keeps the reads and writes RLS governs (jobs SELECT, messages INSERT)');

-- Behaviour, not only the catalog.
select tests.create_user('grants.trunc@brazos.test') as member \gset
select tests.authenticate_anon();
select throws_ok($$ select count(*) from public.jobs $$, '42501', 'permission denied for table jobs',
  'B1: anon is refused at the grant on jobs');
select lives_ok($$ select count(*) from public.app_config $$, 'B1: anon still reads app_config');
select tests.authenticate_as(:'member');
select throws_ok($$ truncate public.notification_outbox $$, '42501', 'permission denied for table notification_outbox',
  'B1: a signed-in user can no longer TRUNCATE a table (TRUNCATE ignores RLS)');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- §2. Storage (B2).
-- ---------------------------------------------------------------------------
select is(
  (select string_agg(id || '=' || public::text, ', ' order by id)
     from storage.buckets where id in ('avatars', 'chat-photos', 'job-photos')),
  'avatars=true, chat-photos=false, job-photos=true',
  'B2: avatars and job-photos are public, chat-photos is private');
select is(
  (select count(*) from storage.buckets
    where id in ('avatars', 'chat-photos', 'job-photos') and file_size_limit = 26214400),
  3::bigint,
  'B2: all three cap a file at 25 MB');
select is(
  (select count(*) from storage.buckets
    where id in ('avatars', 'chat-photos', 'job-photos')
      and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime']
      and cardinality(allowed_mime_types) = 6),
  3::bigint,
  'B2: all three accept exactly the six photo and video types');
select is(
  (select count(*) from storage.buckets where id in ('chat-audio', 'chat-documents')),
  0::bigint,
  'B2: the orphan buckets chat-audio and chat-documents are gone');
select is(
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('avatars_insert', 'avatars_read', 'avatars_update',
                         'chat_photos_insert_party', 'chat_photos_read_party',
                         'job_photos_delete_own_completion', 'job_photos_delete_own_posting',
                         'job_photos_delete_own_review', 'job_photos_insert', 'job_photos_insert_review',
                         'job_photos_read')),
  11::bigint,
  'B2: the eleven storage policies of the three buckets are all still there');

select * from finish();
rollback;
