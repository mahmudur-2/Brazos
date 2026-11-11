-- 330_realtime_publication.sql — ledger B6 (20261112000000_realtime_publication.sql): the three
-- tables the app listens to are in the supabase_realtime publication, and the exact address is not.
-- That the app listens to exactly these three is tests/realtimeTables.test.mjs's to prove; that the
-- migration's block is safe to run twice is proven there too (each add sits inside its own
-- not-exists check). Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(4);

select is(
  (select string_agg(pt.tablename::text, ', ' order by pt.tablename)
     from pg_publication_tables pt
    where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public'),
  'job_offers, jobs, messages',
  'B6: supabase_realtime carries exactly jobs, job_offers and messages from public');

select ok(
  not exists (select 1 from pg_publication_tables pt
               where pt.pubname = 'supabase_realtime' and pt.tablename = 'job_locations'),
  'B6: job_locations (the exact address) is never published');

select ok(
  (select p.pubinsert and p.pubupdate and p.pubdelete and not p.puballtables
     from pg_publication p where p.pubname = 'supabase_realtime'),
  'B6: the publication sends inserts, updates and deletes, and is not FOR ALL TABLES');

select is(
  (select count(*)
     from pg_publication_tables pt
     join pg_namespace n on n.nspname = pt.schemaname
     join pg_class c on c.relnamespace = n.oid and c.relname = pt.tablename
    where pt.pubname = 'supabase_realtime' and c.relreplident = 'f'),
  0::bigint,
  'B6: no published table has replica identity full, so no event carries a whole old row');

select * from finish();
rollback;
