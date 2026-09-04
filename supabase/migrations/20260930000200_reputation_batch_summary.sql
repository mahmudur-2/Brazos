-- 20260930000200_reputation_batch_summary.sql — night1 (n6): the batch,
-- per-role, REVEALED reputation summary for list surfaces.
--
-- WHY. R8b-c (2026-09-01) moved every single-subject surface onto
-- profile_review_summary(p_user, p_role): revealed reviews of one role,
-- shrunk toward the platform prior, "New" under three. The list surfaces
-- (CompareBidsScreen and components/OfferCard.tsx via lib/compareBids.ts,
-- WorkerSearchScreen, SavedWorkersScreen, lib/workerSearch.ts scoring)
-- stayed on profiles.rating_avg / rating_count — the legacy mixed aggregate,
-- which counts UNREVEALED reviews of BOTH roles (docs/BACKLOG.md §v1.2) —
-- because one RPC per card was not acceptable (R8b-c D7). This file is the
-- schema half of closing that gap: ONE function, ONE call per list. The
-- client repoint is n7.
--
-- WHAT. public.profile_review_summaries(p_users uuid[], p_role) — the batch
-- form of profile_review_summary. Same role check; the platform prior m
-- computed ONCE per call with the single's exact query; the single's
-- revealed-only WHERE per reviewee; the same aggregate expressions; the same
-- auth.uid() guard — an unauthenticated call returns zeros rather than
-- raising, exactly as the single does, and the batch mirrors it rather than
-- improving on it; the same ACL (any signed-in user; refused to anon). One
-- row per DISTINCT id, ordered by user_id so two calls agree; an id with no
-- revealed review still gets its row (total 0, average null, shown_average
-- m, is_new true). Two columns ride along so the client makes one call per
-- list: completed_jobs — worker_job_stats' predicate summed over its
-- categories for the worker role, client_job_stats' completed predicate for
-- the customer role — and on_time_pct, profiles.on_time_pct verbatim (null
-- when unknown, never zero).
--
-- WHAT NOT. Nothing existing changes: no table, column, policy, trigger or
-- grant moves; profile_review_summary keeps its body and its callers;
-- recompute_profile_rating, profiles.rating_avg and profiles.rating_count
-- are untouched (their retirement is docs/BACKLOG.md §v1.2, after n7).
-- Plain create function, not create or replace, so a name collision fails
-- loudly instead of silently replacing. Additive: scripts/staging-scan.sh
-- finds none of its shapes here. Proof: supabase/tests/120_reputation_batch.sql.
-- Reversible by one corrective migration removing the function.

create function public.profile_review_summaries(
  p_users uuid[],
  p_role text default 'worker'
) returns table(
  user_id uuid,
  total integer,
  average numeric,
  five integer,
  four integer,
  three integer,
  two integer,
  one integer,
  shown_average numeric,
  is_new boolean,
  completed_jobs integer,
  on_time_pct numeric
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_m numeric;
begin
  if p_role not in ('worker', 'customer') then
    raise exception 'Role must be worker or customer';
  end if;
  -- D4: the platform prior m — the average rating over ALL revealed reviews
  -- of this role, anyone's; 4.5 when the platform has none yet. Computed once
  -- per call: profile_review_summary's query, verbatim.
  select avg(r.rating)::numeric into v_m
  from public.reviews r
  join public.jobs j on j.id = r.job_id
  where public.review_is_revealed(r.job_id, r.reviewer_id, r.reviewee_id, r.created_at)
    and case p_role
          when 'worker' then j.assigned_worker_id = r.reviewee_id
          else j.client_id = r.reviewee_id
        end;
  v_m := coalesce(v_m, 4.5);

  return query
  select
    u.id,
    -- count(rv.rating), not count(*): a LEFT JOIN row with no review counts 0.
    count(rv.rating)::integer,
    round(avg(rv.rating)::numeric, 2),
    count(rv.rating) filter (where rv.rating = 5)::integer,
    count(rv.rating) filter (where rv.rating = 4)::integer,
    count(rv.rating) filter (where rv.rating = 3)::integer,
    count(rv.rating) filter (where rv.rating = 2)::integer,
    count(rv.rating) filter (where rv.rating = 1)::integer,
    -- D4: shrinkage toward the prior with weight 5 — (5m + sum) / (5 + n).
    (5 * v_m + coalesce(sum(rv.rating), 0)) / (5 + count(rv.rating)),
    count(rv.rating) < 3,
    -- completed_jobs: worker_job_stats' predicate (worker role) and
    -- client_job_stats' completed predicate (customer role), verbatim, so the
    -- three never disagree.
    (select count(*)::integer
       from public.jobs j
      where case p_role
              when 'worker' then j.assigned_worker_id = u.id
              else j.client_id = u.id
            end
        and j.status = 'completed'),
    -- on_time_pct: the profile column as it stands; null is unknown.
    (select p.on_time_pct from public.profiles p where p.id = u.id)
  from (select distinct x as id from unnest(p_users) as x) u
  -- The single's WHERE (r8a lines 277-285) with r.reviewee_id = u.id and the
  -- same auth.uid() guard, as a lateral so each id joins only its own rows.
  left join lateral (
    select r.rating
    from public.reviews r
    join public.jobs j on j.id = r.job_id
    where r.reviewee_id = u.id
      and auth.uid() is not null
      and public.review_is_revealed(r.job_id, r.reviewer_id, r.reviewee_id, r.created_at)
      and case p_role
            when 'worker' then j.assigned_worker_id = r.reviewee_id
            else j.client_id = r.reviewee_id
          end
  ) rv on true
  group by u.id
  order by u.id;
end;
$$;

revoke all on function public.profile_review_summaries(uuid[], text) from public, anon;
grant execute on function public.profile_review_summaries(uuid[], text) to authenticated;

comment on function public.profile_review_summaries(uuid[], text) is
  'n6: the batch form of profile_review_summary for list surfaces (compare bids, worker search, saved workers, search scoring) — one row per distinct id in p_users, ordered by user_id. Same visibility (any signed-in user; refused to anon), same reveal rule (review_is_revealed: counterpart written or 7 days old), same shrinkage — shown_average = (5m + sum)/(5 + n) with m the platform-wide revealed average for the role, 4.5 when the platform has none — and the same is_new under three revealed reviews. completed_jobs (worker_job_stats'' predicate for the worker role, client_job_stats'' completed predicate for the customer role) and on_time_pct (profiles.on_time_pct; null when unknown, never zero) ride along so the client makes one call per list.';
