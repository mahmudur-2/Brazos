-- ============================================================================
-- BRAZOS · phase60 · break the jobs DELETE policy recursion (42P17)
--
-- STAGING deliverable — hand-apply with psql against STAGING only:
--   psql -v ON_ERROR_STOP=1 -f supabase/phase60_jobs_delete_policy_recursion.sql -d "$SUPABASE_DB_URL_STAGING"
-- Runs as ONE transaction. Safe to re-run (idempotent).
--
-- THE BUG
--   Deleting an own open job with zero bids fails with
--     SQLSTATE 42P17  infinite recursion detected in policy for relation "jobs"
--   Reproduced on staging 2026-08-12 as an authenticated owner.
--
--   The cycle:
--     jobs_delete_own (phase46:190-199) evaluates
--       not exists (select 1 from public.bids b where b.job_id = jobs.id)
--     inline. That subquery is a normal client-side read, so `bids` RLS
--     expands: bids_select_job_owner (phase29:263-275) subqueries
--       select 1 from public.jobs j where j.id = bids.job_id ...
--     which re-enters `jobs` mid-expansion. Postgres tracks the expansion by
--     relation, sees `jobs` a second time, and aborts with 42P17.
--
--   Both halves predate the offers work: the bids term is phase1/phase14
--   (phase14:36-42), the bids read policy is phase29. phase59 did NOT
--   introduce it.
--
-- THE FIX
--   Move the WHOLE delete condition into one STABLE SECURITY DEFINER helper
--   and reduce the policy to a single function call, so no client-side
--   subquery on `bids` (or `job_offers`) is left in the policy to expand.
--   The helper runs as its owner (postgres, which owns these tables and holds
--   BYPASSRLS), so the reads inside it are not policy-expanded at all — that
--   is what actually breaks the cycle. `auth.uid()` is unaffected by
--   SECURITY DEFINER: it reads the request.jwt.claims GUC, which is a session
--   setting, not a privilege (verified on staging before this file was
--   written).
--
-- ACCESS IS UNCHANGED — the helper reproduces phase46's five terms exactly:
--   owner, status = 'open', caller not banned, no bids, no job_offers.
--   It grants nothing new and takes nothing away.
--
--   NOTE on the job_offers term: phase46:180-199 added it deliberately, so a
--   job that has collected real offers cannot be deleted out from under them
--   through the cascade. Dropping it here to keep the helper to jobs+bids
--   would WIDEN delete access, so it is kept. Likewise the caller-banned
--   check delegates to the existing public.is_active_user() rather than
--   duplicating a profiles read.
--
-- LEAK SHAPE
--   The helper returns a bare boolean and nothing else. A non-owner gets
--   FALSE for "not yours", "has bids", "has offers" and "no such job" alike —
--   the four cases are indistinguishable from the caller's side, so it cannot
--   be used to probe for the existence of another user's job.
-- ============================================================================

begin;

-- 1. Preconditions -----------------------------------------------------------

do $$
begin
  if to_regclass('public.jobs') is null then
    raise exception 'public.jobs is missing.';
  end if;
  if to_regclass('public.bids') is null then
    raise exception 'public.bids is missing.';
  end if;
  if to_regclass('public.job_offers') is null then
    raise exception 'phase43_job_offers_foundation.sql has not been applied — public.job_offers is missing.';
  end if;
  if to_regprocedure('public.is_active_user()') is null then
    raise exception 'phase29_security_hardening.sql has not been applied — is_active_user() is missing.';
  end if;
end $$;

-- 2. The helper ---------------------------------------------------------------

create or replace function public.can_delete_own_job(p_job_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_id uuid;
  v_status    public.job_status;
begin
  -- Only the two columns the decision needs.
  select j.client_id, j.status
    into v_client_id, v_status
    from public.jobs j
   where j.id = p_job_id;

  -- (a) OWNERSHIP first. A missing job leaves v_client_id NULL and falls out
  --     here, so "does not exist" and "not yours" return the same FALSE.
  --     An anonymous caller has auth.uid() = NULL, which is distinct from any
  --     real client_id, so anon is denied here too.
  if v_client_id is null then
    return false;
  end if;
  if v_client_id is distinct from auth.uid() then
    return false;
  end if;
  if not public.is_active_user() then
    return false;
  end if;

  -- (b) STATUS: only an open job may be deleted (phase29's term).
  if v_status is distinct from 'open'::public.job_status then
    return false;
  end if;

  -- (c) ENGAGEMENT: legacy bids (phase14) and live offers (phase46).
  if exists (select 1 from public.bids b where b.job_id = p_job_id) then
    return false;
  end if;
  if exists (select 1 from public.job_offers o where o.job_id = p_job_id) then
    return false;
  end if;

  return true;
end;
$$;

comment on function public.can_delete_own_job(uuid) is
  'phase60. The whole jobs DELETE condition as one call, so jobs_delete_own '
  'holds no inline subquery on bids/job_offers to policy-expand (42P17). '
  'Returns a bare boolean; every denial reason looks identical to the caller.';

-- phase32 revoked default EXECUTE; grant explicitly or the policy denies
-- everyone.
revoke all on function public.can_delete_own_job(uuid) from public, anon;
grant execute on function public.can_delete_own_job(uuid) to authenticated;

-- 3. The policy ---------------------------------------------------------------

drop policy if exists "jobs_delete_own" on public.jobs;
create policy "jobs_delete_own"
  on public.jobs for delete
  to authenticated
  using (public.can_delete_own_job(jobs.id));

notify pgrst, 'reload schema';

commit;
