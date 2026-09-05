-- Brazos - Phase 72 - storage read lockdown (avatars, job-photos)
--
-- Paste into Supabase - SQL Editor and run. Safe to re-run (idempotent) -
-- including after a Dashboard fix; the re-run path skips the ALTER and goes
-- straight to the self-check and sentinel.
--
-- ===========================================================================
-- WHAT THIS CLOSES, AND WHAT IT DELIBERATELY DOES NOT
-- ===========================================================================
-- storage.objects carries exactly two SELECT policies targeting role
-- `public` on live staging (read 2026-08-15):
--
--   avatars_read     USING (bucket_id = 'avatars')      (phase7)
--   job_photos_read  USING (bucket_id = 'job-photos')   (phase6)
--
-- Role `public` includes `anon`, and storage's list/search endpoints run
-- through RLS on storage.objects - so an anon-key holder can ENUMERATE both
-- buckets: every avatar path (which embeds user ids) and every job photo
-- path (which embeds job ids). The correct pattern already exists on the
-- same table: chat_photos_read_party and chat_audio_read_party are both
-- `to authenticated` (phase29).
--
-- This file moves the two policies to `authenticated`, closing anonymous
-- ENUMERATION of the two buckets. It does NOT stop an unauthenticated fetch
-- of an already-known object URL: both buckets are PUBLIC buckets, and
-- Supabase serves public buckets through a path that bypasses RLS. Full
-- closure needs private buckets plus signed URLs everywhere a public URL is
-- rendered today, and is deferred.
--
-- No USING clause changes. No bucket flips public/private. The chat_*
-- policies and every INSERT/UPDATE/DELETE policy are untouched. The app is
-- unaffected either way: no app code calls .list() at all, and every screen
-- that touches these buckets sits below the auth gate
-- (docs/audits/ANON_EXPOSURE_2026-08-15.md, Q4).
--
-- ===========================================================================
-- OWNERSHIP, AND WHY THE FAILURE PATH IS AN EXCEPTION HANDLER
-- ===========================================================================
-- storage.objects is owned by supabase_storage_admin, not postgres, so ALTER
-- POLICY may be refused for the SQL-editor role. Postgres checks that
-- capability with has_privs_of_role (inheritance-aware): a NOINHERIT
-- membership reports pg_has_role(..., 'MEMBER') as true while the ALTER
-- still fails, so no role-membership test can predict the outcome. The block
-- below therefore tests the capability by EXERCISING it and catches
-- insufficient_privilege; the error names the fallback (Dashboard > Storage
-- > Policies), and a re-run after that fix takes the empty-collection path
-- straight to the self-check, which is what installs the sentinel.

begin;

set local search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1. Move the two policies (or fall through after a Dashboard fix)
-- ---------------------------------------------------------------------------

do $$
declare
  v_names text[];
  v_owner text := (select pg_get_userbyid(c.relowner)
                   from pg_class c
                   where c.oid = 'storage.objects'::regclass);
begin
  select coalesce(array_agg(p.policyname::text order by p.policyname), '{}')
    into v_names
  from pg_policies p
  where p.schemaname = 'storage'
    and p.tablename = 'objects'
    and p.cmd = 'SELECT'
    and 'public' = any(p.roles);

  if v_names = '{}'::text[] then
    -- The re-run-after-Dashboard-fix path: nothing left to move. The
    -- self-check below still decides whether the sentinel may install.
    raise notice
      'PHASE72: no SELECT policy on storage.objects targets role public - nothing to alter; continuing to the self-check.';
  elsif v_names <> array['avatars_read', 'job_photos_read']::text[] then
    -- Fail closed; never guess at an unrecognised policy.
    raise exception
      'PHASE72 PRECONDITION FAIL: unexpected public-role SELECT policies on storage.objects: %. This file only knows avatars_read and job_photos_read; refusing to touch anything else.',
      v_names;
  else
    begin
      alter policy avatars_read    on storage.objects to authenticated;
      alter policy job_photos_read on storage.objects to authenticated;
    exception
      when insufficient_privilege then
        raise exception
          'PHASE72 PRECONDITION FAIL: current role % cannot ALTER POLICY on storage.objects (owned by %). Set avatars_read and job_photos_read to the authenticated role via Dashboard > Storage > Policies, then re-run this file to install the sentinel.',
          current_user, v_owner;
    end;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Sentinel
--
-- A storage policy has no PostgREST-probeable shape, so this marker -
-- created in the same transaction as the ALTER and before the self-check
-- that can still abort it - is what scripts/verify-schema.mjs keys the group
-- on. Same shape as the phase69 sentinel.
-- ---------------------------------------------------------------------------

create or replace function public.phase72_storage_read_lockdown_enabled()
returns boolean
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select true;
$$;

revoke all on function public.phase72_storage_read_lockdown_enabled() from public, anon;
grant execute on function public.phase72_storage_read_lockdown_enabled() to authenticated;

comment on function public.phase72_storage_read_lockdown_enabled() is
  'phase72 sentinel. Present only if phase72_storage_read_lockdown.sql committed: avatars_read and job_photos_read both exist, serve SELECT to authenticated only, and keep their original bucket-scoped USING clauses. Anonymous fetches of already-known public-bucket URLs remain possible by design; see the file header.';

-- ---------------------------------------------------------------------------
-- 3. Self-check - the POSITIVE desired state, not merely the absence of the
--    bad one. A check that only asserted "no public-role policies remain"
--    would also pass if BOTH policies had been DROPPED, silently breaking
--    avatar and job-photo display for every signed-in user. (a)-(c) close
--    that hole; (d) is the negative half.
-- ---------------------------------------------------------------------------

do $$
declare
  v_count integer;
  r record;
begin
  -- (a) both policies still exist - altered, never destroyed.
  select count(*) into v_count
  from pg_policies p
  where p.schemaname = 'storage'
    and p.tablename = 'objects'
    and p.policyname in ('avatars_read', 'job_photos_read');

  if v_count <> 2 then
    raise exception
      'PHASE72 SELF-CHECK FAIL (a): expected both avatars_read and job_photos_read on storage.objects, found % of the two. A policy was dropped rather than altered; restore it before installing the sentinel.',
      v_count;
  end if;

  -- (b) each is SELECT and targets exactly {authenticated} - not merely
  --     "does not contain public"; (c) each still names its own bucket.
  for r in
    select p.policyname, p.cmd, p.roles, coalesce(p.qual, '') as qual
    from pg_policies p
    where p.schemaname = 'storage'
      and p.tablename = 'objects'
      and p.policyname in ('avatars_read', 'job_photos_read')
  loop
    if r.cmd <> 'SELECT' then
      raise exception
        'PHASE72 SELF-CHECK FAIL (b): % is a % policy rather than SELECT.',
        r.policyname, r.cmd;
    end if;
    if r.roles <> array['authenticated']::name[] then
      raise exception
        'PHASE72 SELF-CHECK FAIL (b): % targets % rather than exactly {authenticated}.',
        r.policyname, r.roles;
    end if;
    if r.policyname = 'avatars_read' and position('avatars' in r.qual) = 0 then
      raise exception
        'PHASE72 SELF-CHECK FAIL (c): avatars_read no longer references the avatars bucket in its USING clause: %',
        r.qual;
    end if;
    if r.policyname = 'job_photos_read' and position('job-photos' in r.qual) = 0 then
      raise exception
        'PHASE72 SELF-CHECK FAIL (c): job_photos_read no longer references the job-photos bucket in its USING clause: %',
        r.qual;
    end if;
  end loop;

  -- (d) nothing on storage.objects serves SELECT to role public any more.
  if exists (
    select 1
    from pg_policies p
    where p.schemaname = 'storage'
      and p.tablename = 'objects'
      and p.cmd = 'SELECT'
      and 'public' = any(p.roles)
  ) then
    raise exception
      'PHASE72 SELF-CHECK FAIL (d): a SELECT policy on storage.objects still targets role public.';
  end if;

  -- The sentinel itself.
  if to_regprocedure('public.phase72_storage_read_lockdown_enabled()') is null then
    raise exception 'PHASE72 SELF-CHECK FAIL: the sentinel function is missing.';
  end if;

  raise notice 'PHASE72 SELF-CHECK PASS: avatars_read and job_photos_read serve authenticated only; USING clauses unchanged';
end $$;

notify pgrst, 'reload schema';

commit;
