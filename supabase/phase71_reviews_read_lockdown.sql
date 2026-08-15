-- Brazos - Phase 71 - reviews read lockdown
--
-- Paste into Supabase - SQL Editor and run. Safe to re-run (idempotent), and
-- safe to re-run after a failed run: everything is one transaction, so a failed
-- run leaves nothing behind.
--
-- ===========================================================================
-- WHY THIS FILE EXISTS
-- ===========================================================================
-- public.reviews carries THREE policies on live staging (read 2026-08-15):
--
--   "reviews are viewable by everyone"  SELECT  roles=public         USING (true)
--   reviews_select_party                SELECT  roles=authenticated  USING (reviewer_id = auth.uid() or reviewee_id = auth.uid())
--   reviews_insert_completed_party      INSERT  roles=authenticated  (phase54)
--
-- and the table grant gives `anon` SELECT. Permissive policies OR together,
-- so the first subsumes the second: reviews_select_party is dead code today,
-- and any anon-key holder reads EVERY review row - including job_id /
-- reviewer_id / reviewee_id, the full who-hired-whom graph. The
-- world-readable policy predates the repo's numbered migrations (no
-- supabase/*.sql creates it); phase6 added the party policy beside it and
-- phase54 tightened INSERT, but nothing ever dropped it.
--
-- The fix is ONE statement: drop the permissive policy. Third-party review
-- display never used it - it goes through profile_reviews() /
-- profile_review_summary(), the SECURITY DEFINER readers phase37 grants to
-- authenticated - and the app's one direct table read is self-scoped
-- (reviewer_id = the caller). Full consumer inventory:
-- docs/audits/ANON_EXPOSURE_2026-08-15.md, Q3.
--
-- ===========================================================================
-- WHY THE PRECONDITIONS EXIST
-- ===========================================================================
-- The safety of this migration rests entirely on the definer read path
-- bypassing RLS - and that is a property of OWNERSHIP, not of the SECURITY
-- DEFINER keyword. A table owner is exempt from RLS only while FORCE ROW
-- LEVEL SECURITY is off. All three facts are proven in-database below, in
-- this transaction, before anything is dropped; none is assumed. The same
-- exemption is what keeps the phase6 rating trigger
-- (recompute_profile_rating, also definer-owned) counting ALL of a
-- reviewee's rows after the drop.
--
-- ===========================================================================
-- THE GRANT THAT STAYS - deliberate
-- ===========================================================================
-- anon's table-level SELECT GRANT on public.reviews is NOT revoked.
-- scripts/verify-schema.mjs runs checkColumn('reviews', 'photos') in its
-- phase37 group; that limit=0 probe needs the GRANT to resolve the column -
-- revoking it answers 42501 and flips the whole verify run red. Dropping the
-- POLICY alone closes the exposure: with RLS enabled and no applicable
-- policy, anon sees ZERO rows, and the probe still answers 200 with an empty
-- set.

begin;

set local search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1. Preconditions
-- ---------------------------------------------------------------------------

do $$
declare
  v_reviews_owner oid;
  v_definer_count integer;
begin
  -- (a) the party policy this table falls back to must exist.
  if not exists (
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'reviews'
      and p.policyname = 'reviews_select_party'
  ) then
    raise exception
      'PHASE71 PRECONDITION FAIL (a): reviews_select_party is absent - dropping the permissive policy would leave public.reviews unreadable by anyone. Apply phase54 first.';
  end if;

  -- (b) the owner is exempt from RLS only while FORCE RLS is off.
  if (select c.relforcerowsecurity from pg_class c where c.oid = 'public.reviews'::regclass) then
    raise exception
      'PHASE71 PRECONDITION FAIL (b): public.reviews has FORCE ROW LEVEL SECURITY, so its owner is NOT exempt from RLS and the SECURITY DEFINER read path would return zero rows once the permissive policy is dropped.';
  end if;

  -- (c) both third-party readers are SECURITY DEFINER AND owned by the owner
  --     of public.reviews - together, the two facts that make them bypass RLS.
  select c.relowner into v_reviews_owner
  from pg_class c
  where c.oid = 'public.reviews'::regclass;

  select count(*) into v_definer_count
  from pg_proc p
  where p.oid in (
      to_regprocedure('public.profile_reviews(uuid, integer, integer)'),
      to_regprocedure('public.profile_review_summary(uuid)'))
    and p.prosecdef
    and p.proowner = v_reviews_owner;

  if v_definer_count <> 2 then
    raise exception
      'PHASE71 PRECONDITION FAIL (c): the third-party review read path is not a SECURITY DEFINER function owned by the owner of public.reviews, so it does not bypass RLS and dropping the permissive policy would break third-party review display.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The drop. anon keeps the table GRANT (see the header) but loses its only
--    applicable policy, so it reads zero rows from here on.
-- ---------------------------------------------------------------------------

drop policy if exists "reviews are viewable by everyone" on public.reviews;

-- ---------------------------------------------------------------------------
-- 3. Sentinel
--
-- A policy drop has no PostgREST-probeable shape (the phase54 situation), so
-- this marker - created in the same transaction as the drop and after the
-- preconditions - is what scripts/verify-schema.mjs keys the group on. Same
-- shape as the phase69 sentinel.
-- ---------------------------------------------------------------------------

create or replace function public.phase71_reviews_read_lockdown_enabled()
returns boolean
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select true;
$$;

revoke all on function public.phase71_reviews_read_lockdown_enabled() from public, anon;
grant execute on function public.phase71_reviews_read_lockdown_enabled() to authenticated;

comment on function public.phase71_reviews_read_lockdown_enabled() is
  'phase71 sentinel. Present only if phase71_reviews_read_lockdown.sql committed: the world-readable "reviews are viewable by everyone" policy is gone, reviews_select_party is intact, and anon reads zero review rows while keeping the column-probe SELECT grant.';

-- ---------------------------------------------------------------------------
-- 4. Self-check
-- ---------------------------------------------------------------------------

do $$
declare
  v_roles name[];
begin
  -- (a) no SELECT policy on public.reviews reaches role public any more.
  if exists (
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'reviews'
      and p.cmd = 'SELECT'
      and 'public' = any(p.roles)
  ) then
    raise exception
      'PHASE71 SELF-CHECK FAIL (a): a SELECT policy on public.reviews still targets role public.';
  end if;

  -- (b) the party policy SURVIVED and still targets exactly {authenticated} -
  --     a positive assertion, so a run that removed the wrong policy cannot
  --     pass.
  select p.roles into v_roles
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'reviews'
    and p.policyname = 'reviews_select_party'
    and p.cmd = 'SELECT';

  if v_roles is null then
    raise exception
      'PHASE71 SELF-CHECK FAIL (b): reviews_select_party is gone - the wrong policy was dropped.';
  end if;
  if v_roles <> array['authenticated']::name[] then
    raise exception
      'PHASE71 SELF-CHECK FAIL (b): reviews_select_party targets % rather than exactly {authenticated}.',
      v_roles;
  end if;

  -- (c) the sentinel exists.
  if to_regprocedure('public.phase71_reviews_read_lockdown_enabled()') is null then
    raise exception 'PHASE71 SELF-CHECK FAIL (c): the sentinel function is missing.';
  end if;

  raise notice 'PHASE71 SELF-CHECK PASS: anon reads zero review rows; reviews_select_party intact';
end $$;

notify pgrst, 'reload schema';

commit;
