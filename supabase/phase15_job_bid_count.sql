-- ============================================================================
-- Brazos · Public bid count for the job status timeline
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- THE PROBLEM
--   The new job status timeline needs to show "Bid received" / "N bids
--   received" to EVERYONE who can see a job (poster, bidders, anyone
--   browsing) — not just the poster. But bids SELECT RLS (phase1) only
--   grants a worker their own bid row (worker_id = auth.uid()) or the job's
--   poster all bids on their job (jobs.client_id = auth.uid()). A random
--   browsing worker has no row-level access to another job's bids at all,
--   so a plain `select count(*) from bids where job_id = ...` from them
--   would silently return 0 regardless of the real count — RLS filters the
--   rows before they're counted, not after.
--
-- THE FIX
--   A SECURITY DEFINER function that returns ONLY the integer count, never
--   individual bid rows — no amounts, messages, or worker identities, so
--   there's nothing sensitive to leak. This is the same "how many bids does
--   an open job have" information already shown to the poster via
--   jobs.bid_count; this just makes it safely readable by anyone.
-- ============================================================================

create or replace function public.job_bid_count(p_job_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.bids where job_id = p_job_id;
$$;

comment on function public.job_bid_count(uuid) is
  'Count-only bid total for a job, readable by anyone — bypasses bids RLS deliberately since a bare count exposes nothing sensitive.';

revoke all on function public.job_bid_count(uuid) from public;
grant execute on function public.job_bid_count(uuid) to authenticated;
