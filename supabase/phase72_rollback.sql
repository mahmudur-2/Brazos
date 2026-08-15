-- Brazos - Phase 72 ROLLBACK - storage read policies back to role public
--
-- Paste into Supabase - SQL Editor and run. Safe to re-run (idempotent).
-- One transaction. Undoes supabase/phase72_storage_read_lockdown.sql and
-- nothing else: avatars_read and job_photos_read go back to role `public`
-- with their USING clauses untouched, and the phase72 sentinel is dropped.
--
-- The same ownership caveat as the forward file applies: storage.objects is
-- owned by supabase_storage_admin, so ALTER POLICY may be refused for the
-- SQL-editor role. The handler below names the Dashboard fallback; if the
-- forward change was made through the Dashboard, this rollback must be too.
--
-- Rolling this back RE-OPENS anonymous enumeration of both buckets: every
-- avatar path (which embeds user ids) and every job-photo path (which embeds
-- job ids) becomes listable with the anon key again.

begin;

set local search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1. Move both policies back to role public
-- ---------------------------------------------------------------------------

do $$
declare
  v_owner text := (select pg_get_userbyid(c.relowner)
                   from pg_class c
                   where c.oid = 'storage.objects'::regclass);
begin
  begin
    alter policy avatars_read    on storage.objects to public;
    alter policy job_photos_read on storage.objects to public;
  exception
    when insufficient_privilege then
      raise exception
        'PHASE72 ROLLBACK FAIL: current role % cannot ALTER POLICY on storage.objects (owned by %). Move avatars_read and job_photos_read back to role public via Dashboard > Storage > Policies, then re-run this file to drop the sentinel.',
        current_user, v_owner;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Sentinel dropped, so scripts/verify-schema.mjs reports phase72 as not
--    applied.
-- ---------------------------------------------------------------------------

drop function if exists public.phase72_storage_read_lockdown_enabled();

-- ---------------------------------------------------------------------------
-- 3. Self-check
-- ---------------------------------------------------------------------------

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_policies p
  where p.schemaname = 'storage'
    and p.tablename = 'objects'
    and p.policyname in ('avatars_read', 'job_photos_read')
    and p.cmd = 'SELECT'
    and 'public' = any(p.roles);

  if v_count <> 2 then
    raise exception
      'PHASE72 ROLLBACK FAIL: expected both policies back on role public, found %.',
      v_count;
  end if;

  if to_regprocedure('public.phase72_storage_read_lockdown_enabled()') is not null then
    raise exception 'PHASE72 ROLLBACK FAIL: the sentinel function still exists.';
  end if;

  raise notice 'PHASE72 ROLLBACK COMPLETE: both storage read policies serve role public again';
  raise notice 'PHASE72 ROLLBACK WARNING: anonymous enumeration of avatars and job-photos is open again';
end $$;

notify pgrst, 'reload schema';

commit;
