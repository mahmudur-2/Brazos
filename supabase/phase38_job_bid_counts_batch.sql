-- BRAZOS · Phase 38 · batched bid counts for job lists
--
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- Additive only: one new function. No table, column, policy, grant or existing
-- function is touched, so this can be applied at any time without a matching
-- app build — the client falls back to showing no count until it is deployed.
--
-- WHY
-- ---
-- Open-job cards need to say "3 bids" / "No bids yet". phase15 explains why a
-- plain count cannot come from the client: bids RLS gives a browsing worker
-- access to their own bid row only, so `select count(*) from bids` silently
-- returns 0 for everyone who is not the poster. job_bid_count() solves that
-- for ONE job — but a list is 90+ jobs, and calling it per row is an N+1 the
-- feed cannot afford. That is precisely why the counts were left off the cards
-- until now.
--
-- This is the same function, plural: one round trip for a whole page.
--
-- WHAT IT EXPOSES
-- ---------------
-- Exactly what job_bid_count() already does, and nothing more — a job id and
-- an integer. No amounts, no messages, no worker identities. The two must
-- always agree, so the count here is the identical `count(*) ... where job_id`
-- with no extra status filter: a detail screen and a card showing different
-- numbers for the same job would be worse than showing none.
--
-- Callers are capped at 200 ids per call so this cannot be turned into a bulk
-- scan of the whole table.

begin;

create or replace function public.job_bid_counts(p_job_ids uuid[])
returns table (job_id uuid, bid_count integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.job_id, count(*)::int
  from public.bids b
  where auth.uid() is not null
    and p_job_ids is not null
    and array_length(p_job_ids, 1) <= 200
    and b.job_id = any (p_job_ids)
  group by b.job_id;
$$;

comment on function public.job_bid_counts(uuid[]) is
  'Batched form of job_bid_count(): count-only bid totals for a page of jobs, readable by any signed-in user. Bypasses bids RLS deliberately, since a bare count exposes nothing sensitive. Jobs with no bids are simply absent from the result — the caller treats a missing id as zero.';

-- phase32 turned OFF the default EXECUTE grant for functions created in this
-- schema, so a freshly created function is unreachable until granted here.
revoke all on function public.job_bid_counts(uuid[]) from public, anon;
grant execute on function public.job_bid_counts(uuid[]) to authenticated;

notify pgrst, 'reload schema';

commit;
