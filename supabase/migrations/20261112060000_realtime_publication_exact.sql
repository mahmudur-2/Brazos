-- 20261112060000_realtime_publication_exact.sql — staging's realtime publication equals the files.
--
-- The staging proof report (GitHub run 43033427086, commit 1633f10) found three members of
-- supabase_realtime on staging that a database built from the migrations does not have:
-- public.bids, public.direct_threads and public.message_reads. They were switched on by hand long
-- ago. The app listens only to messages, jobs and job_offers (tests/realtimeTables.test.mjs), so
-- nothing listens to these three.
--
-- Takes exactly those three out, each only when it is a member, so the file changes nothing on a
-- database where they are not (the local stack, a new production project). messages, jobs,
-- job_offers and every replica identity are left as they are. No table is removed: only its
-- membership in the publication.
--
-- Proof: supabase/tests/330_realtime_publication.sql.

begin;

do $realtime$
begin
  if exists (select 1 from pg_publication_tables
              where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bids') then
    alter publication supabase_realtime drop table public.bids;
  end if;

  if exists (select 1 from pg_publication_tables
              where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_threads') then
    alter publication supabase_realtime drop table public.direct_threads;
  end if;

  if exists (select 1 from pg_publication_tables
              where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reads') then
    alter publication supabase_realtime drop table public.message_reads;
  end if;
end
$realtime$;

commit;
