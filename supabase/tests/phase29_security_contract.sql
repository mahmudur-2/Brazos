-- phase29_security_contract.sql — the phase29 grant contract, as TAP.
--
-- Was a single `do` block that raised on the FIRST failed invariant, so it
-- could report one problem at a time and never say which others existed.
-- Now one assertion per invariant, all of them reported. Read-only: it
-- creates no rows and needs no identities.
--
-- Signatures were stale and are pinned to the live ones: create_job grew to
-- fifteen parameters (phase49), transition_job_status to four (phase35's
-- completion videos), create_review to five (phase37's photos) and then six
-- (R8a's would_again). The create_bid and accept_bid shims went in lean v1
-- (ruling 46): their grants became does-not-exist checks.
--
-- One invariant cannot be proven on the local stack and says so instead of
-- passing vacuously: the chat-media buckets are storage DATA rows, which the
-- schema-only baseline dump does not carry, so the "not public" check is
-- explicitly SKIPPED here when the rows are absent and asserted when they
-- exist (staging). Their READ policies are schema and are asserted.
create extension if not exists pgtap with schema extensions;

begin;
set local search_path = public, extensions, pg_temp;
select plan(25);

-- profiles: no client writes at all
select ok(not has_table_privilege('authenticated', 'public.profiles', 'INSERT'), 'authenticated has no INSERT on profiles');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), 'authenticated has no UPDATE on profiles');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'DELETE'), 'authenticated has no DELETE on profiles');

-- profiles: private columns stay unreadable, public ones readable
select ok(not has_column_privilege('authenticated', 'public.profiles', 'phone', 'SELECT'), 'authenticated cannot select profiles.phone');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'SELECT'), 'authenticated cannot select profiles.is_admin');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'banned', 'SELECT'), 'authenticated cannot select profiles.banned');
select ok(has_column_privilege('authenticated', 'public.profiles', 'full_name', 'SELECT'), 'authenticated can select profiles.full_name (the marketplace name)');
select ok(has_column_privilege('authenticated', 'public.profiles', 'avatar_url', 'SELECT'), 'authenticated can select profiles.avatar_url');

-- the protected marketplace tables: RPC-write-only
select ok(not has_table_privilege('authenticated', 'public.jobs', 'INSERT'), 'authenticated has no INSERT on jobs');
select ok(not has_table_privilege('authenticated', 'public.jobs', 'UPDATE'), 'authenticated has no UPDATE on jobs');
select ok(not has_table_privilege('authenticated', 'public.bids', 'INSERT'), 'authenticated has no INSERT on bids');
select ok(not has_table_privilege('authenticated', 'public.bids', 'UPDATE'), 'authenticated has no UPDATE on bids');
select ok(not has_table_privilege('authenticated', 'public.reviews', 'INSERT'), 'authenticated has no INSERT on reviews');
select ok(not has_table_privilege('authenticated', 'public.job_locations', 'INSERT'), 'authenticated has no INSERT on job_locations');
select ok(not has_table_privilege('authenticated', 'public.job_locations', 'UPDATE'), 'authenticated has no UPDATE on job_locations');
select ok(not has_table_privilege('authenticated', 'public.job_locations', 'DELETE'), 'authenticated has no DELETE on job_locations');

-- the hardened RPCs stay reachable from the app, under their live signatures
select ok(has_function_privilege('authenticated', 'public.get_my_profile()', 'EXECUTE'), 'authenticated may execute get_my_profile()');
select ok(has_function_privilege('authenticated', 'public.update_my_profile(jsonb)', 'EXECUTE'), 'authenticated may execute update_my_profile(jsonb)');
-- a3 (2026-09-05): create_job gained p_pricing_mode as its sixteenth parameter; 2026-09-30 (idea 12,
-- 20260930000600): p_needed_today as its seventeenth, last; the sixteen-parameter identity no longer exists.
select ok(has_function_privilege('authenticated',
  'public.create_job(text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text, text, boolean)', 'EXECUTE'),
  'authenticated may execute create_job under its seventeen-parameter signature (idea 12, 2026-09-30: p_needed_today)');
select hasnt_function('public', 'create_bid', ARRAY['uuid', 'integer', 'text'], 'create_bid(uuid, integer, text) does not exist (ruling 46: the deprecated shim is gone)');
select hasnt_function('public', 'accept_bid', ARRAY['uuid', 'uuid'], 'accept_bid(uuid, uuid) does not exist (ruling 46: accept_offer is the only assignment path)');
select ok(has_function_privilege('authenticated', 'public.transition_job_status(uuid, text, jsonb, jsonb)', 'EXECUTE'), 'authenticated may execute transition_job_status under its four-parameter signature');
select ok(has_function_privilege('authenticated', 'public.create_review(uuid, uuid, integer, text, jsonb, boolean)', 'EXECUTE'), 'authenticated may execute create_review under its six-parameter signature (R8a''s would_again)');

-- chat media: private buckets (data — see the header) and party-only reads
select (count(*) = 0) as no_chat_buckets from storage.buckets where id = 'chat-photos' \gset
\if :no_chat_buckets
select skip('the chat-photos bucket row is storage data the schema-only baseline dump does not carry; "not public" cannot be proven on this stack', 1);
\else
select is((select count(*) from storage.buckets where id = 'chat-photos' and public), 0::bigint, 'the chat-photos bucket is not public (lean v1 removed chat-audio)');
\endif
select ok(exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'chat_photos_read_party'), 'the chat_photos_read_party policy exists on storage.objects');

select * from finish();
rollback;
