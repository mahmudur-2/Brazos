-- 20261112000000_realtime_publication.sql — ledger B6 (docs/critical/production-path.md, part A).
--
-- The app listens with postgres_changes to public.messages, public.jobs and public.job_offers
-- (tests/realtimeTables.test.mjs keeps that list and this file equal). No migration ever put a
-- table in the supabase_realtime publication: the hosted projects had them switched on by hand, so
-- a database built from the files sent no live event at all.
--
-- Adds exactly those three, each only when it is not already a member, so the file is safe on a
-- database where they were added by hand. Nothing else is added: row security guards INSERT and
-- UPDATE events but not DELETE events, so job_locations (the exact address) never joins. No replica
-- identity changes. The supabase_realtime publication exists on every Supabase database.
--
-- Proof: supabase/tests/330_realtime_publication.sql.

begin;

do $realtime$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'jobs') then
    alter publication supabase_realtime add table public.jobs;
  end if;

  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'job_offers') then
    alter publication supabase_realtime add table public.job_offers;
  end if;
end
$realtime$;

commit;
