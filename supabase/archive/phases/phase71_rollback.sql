-- Brazos - Phase 71 ROLLBACK - restore the world-readable reviews policy
--
-- Paste into Supabase - SQL Editor and run. Safe to re-run (idempotent).
-- One transaction. Undoes supabase/phase71_reviews_read_lockdown.sql and
-- nothing else: it recreates the permissive SELECT policy exactly as it
-- existed (for select, to public, using (true)) and drops the phase71
-- sentinel. reviews_select_party and reviews_insert_completed_party are not
-- touched in either direction.
--
-- Rolling this back RE-OPENS the exposure this phase closed: every review
-- row - including job_id / reviewer_id / reviewee_id, the full
-- who-hired-whom graph - becomes readable with the anon key again. Do not
-- leave the database in this state.

begin;

set local search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1. Recreate the permissive policy exactly as it existed
-- ---------------------------------------------------------------------------

drop policy if exists "reviews are viewable by everyone" on public.reviews;
create policy "reviews are viewable by everyone"
  on public.reviews for select
  to public
  using (true);

-- ---------------------------------------------------------------------------
-- 2. Sentinel dropped, so scripts/verify-schema.mjs reports phase71 as not
--    applied.
-- ---------------------------------------------------------------------------

drop function if exists public.phase71_reviews_read_lockdown_enabled();

-- ---------------------------------------------------------------------------
-- 3. Self-check
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'reviews'
      and p.policyname = 'reviews are viewable by everyone'
      and p.cmd = 'SELECT'
      and 'public' = any(p.roles)
      and p.qual = 'true'
  ) then
    raise exception
      'PHASE71 ROLLBACK FAIL: the permissive policy was not recreated as SELECT / to public / using (true).';
  end if;

  if not exists (
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'reviews'
      and p.policyname = 'reviews_select_party'
  ) then
    raise exception
      'PHASE71 ROLLBACK FAIL: reviews_select_party is missing - this file must not touch it.';
  end if;

  if to_regprocedure('public.phase71_reviews_read_lockdown_enabled()') is not null then
    raise exception 'PHASE71 ROLLBACK FAIL: the sentinel function still exists.';
  end if;

  raise notice 'PHASE71 ROLLBACK COMPLETE: the world-readable policy is back beside reviews_select_party';
  raise notice 'PHASE71 ROLLBACK WARNING: every review row is readable with the anon key again';
end $$;

notify pgrst, 'reload schema';

commit;
