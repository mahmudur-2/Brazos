-- 20260925000100_r8a_reputation.sql — R8a: the reputation core.
--
-- Implements the five operator decisions dated 2026-08-31 in docs/DECISIONS.md:
--   D1  double-blind reveal: a review is hidden from its reviewee until the
--       counterpart review exists OR 7 days have passed since it was written.
--   D2  a 30-day writing window from jobs.completed_at — a separate clock from
--       the blind window. A late review still lands; it just isn't blind.
--       completed_at NULL (legacy rows) -> no window enforced.
--   D3  two reputations per person, worker and customer, never mixed. Role is
--       derived per review from the job — the reviewee was the worker if
--       jobs.assigned_worker_id = reviewee_id, the customer if
--       jobs.client_id = reviewee_id. No role column.
--   D4  cold start: the shown rating is shrunk toward a platform prior;
--       "New" under three revealed reviews.
--   D5  would-you-again captured per review; rehires counted; workers see a
--       customer's record before bidding.
--
-- Deliberately untouched (R8b repoints the readers): recompute_profile_rating,
-- profiles.rating_avg, profiles.rating_count — the legacy mixed aggregate —
-- and every table grant. anon keeps its table-level SELECT on reviews
-- (scripts/verify-schema.mjs probes it); RLS is what returns anon zero rows.

-- ---------------------------------------------------------------------------
-- 1. would_again (D5). Nullable: every pre-R8a review simply has no answer.
-- ---------------------------------------------------------------------------
alter table public.reviews add column would_again boolean;

comment on column public.reviews.would_again is
  'D5 (R8a): the reviewer''s answer to would-you-hire-again (about a worker) or would-you-work-for-them-again (about a customer). NULL on every review written before R8a and whenever the reviewer skipped the question.';

-- ---------------------------------------------------------------------------
-- 2. The reveal predicate (D1) — computed at read time; no reveal column, no
--    cron. SECURITY DEFINER because the reviews SELECT policy below calls it,
--    and an inline EXISTS on reviews inside a reviews policy recurses.
--    Granted to anon AS WELL AS authenticated: anon holds a table-level
--    SELECT grant on reviews that scripts/verify-schema.mjs probes, so the
--    policy must evaluate for anon without a function-permission error
--    (a policy expression runs as the querying role — the phase69 lesson).
-- ---------------------------------------------------------------------------
create function public.review_is_revealed(
  p_job_id uuid,
  p_reviewer_id uuid,
  p_reviewee_id uuid,
  p_created_at timestamptz
) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.reviews c
    where c.job_id = p_job_id
      and c.reviewer_id = p_reviewee_id
      and c.reviewee_id = p_reviewer_id
  ) or p_created_at <= now() - interval '7 days';
$$;

comment on function public.review_is_revealed(uuid, uuid, uuid, timestamptz) is
  'D1 (R8a): true once the counterpart review exists (same job, parties swapped) or 7 days after the review was written, whichever comes first. Called from reviews_select_party and from every revealed-only reader.';

revoke all on function public.review_is_revealed(uuid, uuid, uuid, timestamptz) from public;
grant execute on function public.review_is_revealed(uuid, uuid, uuid, timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS (D1): reviews_select_party becomes double-blind. The reviewer always
--    reads their own; the reviewee reads it only once revealed. No table-level
--    grant moves.
-- ---------------------------------------------------------------------------
drop policy "reviews_select_party" on public.reviews;

create policy "reviews_select_party" on public.reviews
  for select to authenticated
  using (
    reviewer_id = auth.uid()
    or (
      reviewee_id = auth.uid()
      and public.review_is_revealed(job_id, reviewer_id, reviewee_id, created_at)
    )
  );

comment on policy "reviews_select_party" on public.reviews is
  'R8a (D1): the reviewer always reads their own review; the reviewee reads it only once revealed (counterpart written or 7 days old). Everyone else reads reviews through the revealed-only profile readers, never the table.';

-- ---------------------------------------------------------------------------
-- 4. create_review (D2, D5): drop the five-parameter signature, recreate with
--    p_would_again and the 30-day window check. Body otherwise as the
--    baseline defined it. The app's five named arguments keep resolving.
-- ---------------------------------------------------------------------------
drop function public.create_review(uuid, uuid, integer, text, jsonb);

create function public.create_review(
  p_job_id uuid,
  p_reviewee_id uuid,
  p_rating integer,
  p_comment text default null,
  p_photos jsonb default '[]'::jsonb,
  p_would_again boolean default null
) returns public.reviews
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_review public.reviews;
  v_photos jsonb := coalesce(p_photos, '[]'::jsonb);
begin
  select * into v_job from public.jobs where id = p_job_id;
  if not found or v_job.status <> 'completed' then
    raise exception 'Completed job not found';
  end if;
  -- D2 (R8a): 30 days from completion to write. NULL completed_at (legacy
  -- rows) enforces no window. A separate clock from the D1 blind window.
  if v_job.completed_at is not null and now() > v_job.completed_at + interval '30 days' then
    raise exception 'Review window has closed';
  end if;
  if v_user is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if not (
    (v_job.client_id = v_user and p_reviewee_id = v_job.assigned_worker_id)
    or (v_job.assigned_worker_id = v_user and p_reviewee_id = v_job.client_id)
  ) then
    raise exception 'Review parties are invalid';
  end if;
  if p_rating not between 1 and 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;
  if length(coalesce(p_comment, '')) > 1000 then
    raise exception 'Review comment is too long';
  end if;
  if jsonb_typeof(v_photos) <> 'array' or jsonb_array_length(v_photos) > 5 then
    raise exception 'Reviews can carry at most 5 photos';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_photos) as photo(value)
    where jsonb_typeof(photo.value) <> 'string'
       or length(photo.value #>> '{}') > 2048
  ) then
    raise exception 'Each review photo must be a valid URL or storage reference';
  end if;

  insert into public.reviews (
    job_id, reviewer_id, reviewee_id, rating, comment, photos, would_again
  )
  values (
    p_job_id, v_user, p_reviewee_id, p_rating, nullif(btrim(p_comment), ''), v_photos, p_would_again
  )
  returning * into v_review;

  return v_review;
end;
$$;

revoke all on function public.create_review(uuid, uuid, integer, text, jsonb, boolean) from public, anon;
grant execute on function public.create_review(uuid, uuid, integer, text, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. profile_reviews (D1, D3): drop the three-parameter signature, recreate
--    with p_role, filtered to REVEALED reviews of the requested role only.
--    Same return columns; existing three-named-argument calls resolve to the
--    worker default. plpgsql so an unknown role is an error, not a guess.
-- ---------------------------------------------------------------------------
drop function public.profile_reviews(uuid, integer, integer);

create function public.profile_reviews(
  p_user uuid,
  p_limit integer default 20,
  p_offset integer default 0,
  p_role text default 'worker'
) returns table(
  id uuid,
  rating integer,
  comment text,
  photos jsonb,
  created_at timestamp with time zone,
  reviewer_id uuid,
  reviewer_name text,
  reviewer_avatar_url text,
  job_category text
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if p_role not in ('worker', 'customer') then
    raise exception 'Role must be worker or customer';
  end if;
  return query
  select
    r.id,
    r.rating,
    r.comment,
    r.photos,
    r.created_at,
    r.reviewer_id,
    p.full_name,
    p.avatar_url,
    j.category::text
  from public.reviews r
  join public.profiles p on p.id = r.reviewer_id
  join public.jobs j on j.id = r.job_id
  where r.reviewee_id = p_user
    and auth.uid() is not null
    and public.review_is_revealed(r.job_id, r.reviewer_id, r.reviewee_id, r.created_at)
    and case p_role
          when 'worker' then j.assigned_worker_id = r.reviewee_id
          else j.client_id = r.reviewee_id
        end
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

comment on function public.profile_reviews(uuid, integer, integer, text) is
  'D3 (R8a): one page of REVEALED reviews about p_user in the requested role — worker reviews are those where the job''s assigned worker was the reviewee, customer reviews those where the job''s client was. The join to jobs is the role derivation; there is no role column.';

revoke all on function public.profile_reviews(uuid, integer, integer, text) from public, anon;
grant execute on function public.profile_reviews(uuid, integer, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. profile_review_summary (D1, D3, D4): drop the one-parameter signature,
--    recreate with p_role, computed over revealed reviews of that role only,
--    plus the cold-start pair — shown_average shrunk toward the platform
--    prior, and is_new under three revealed reviews.
-- ---------------------------------------------------------------------------
drop function public.profile_review_summary(uuid);

create function public.profile_review_summary(
  p_user uuid,
  p_role text default 'worker'
) returns table(
  total integer,
  average numeric,
  five integer,
  four integer,
  three integer,
  two integer,
  one integer,
  shown_average numeric,
  is_new boolean
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
  -- of this role, anyone's; 4.5 when the platform has none yet.
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
    count(*)::integer,
    round(avg(r.rating)::numeric, 2),
    count(*) filter (where r.rating = 5)::integer,
    count(*) filter (where r.rating = 4)::integer,
    count(*) filter (where r.rating = 3)::integer,
    count(*) filter (where r.rating = 2)::integer,
    count(*) filter (where r.rating = 1)::integer,
    -- D4: shrinkage toward the prior with weight 5 — (5m + sum) / (5 + n).
    (5 * v_m + coalesce(sum(r.rating), 0)) / (5 + count(*)),
    count(*) < 3
  from public.reviews r
  join public.jobs j on j.id = r.job_id
  where r.reviewee_id = p_user
    and auth.uid() is not null
    and public.review_is_revealed(r.job_id, r.reviewer_id, r.reviewee_id, r.created_at)
    and case p_role
          when 'worker' then j.assigned_worker_id = r.reviewee_id
          else j.client_id = r.reviewee_id
        end;
end;
$$;

comment on function public.profile_review_summary(uuid, text) is
  'D4 (R8a): the rating header over REVEALED reviews of one role. shown_average = (5m + sum)/(5 + n) with m the platform-wide revealed average for that role (4.5 when the platform has none); is_new under three revealed reviews. average stays the raw per-user mean the distribution below it explains.';

revoke all on function public.profile_review_summary(uuid, text) from public, anon;
grant execute on function public.profile_review_summary(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. client_job_stats (D5): drop and recreate with the same name and
--    argument. posted / completed / cancelled exactly as before, plus the
--    worker-facing record of this client: cancellations after hiring, repeat
--    hires, and the revealed would-work-for-them-again counts.
-- ---------------------------------------------------------------------------
drop function public.client_job_stats(uuid);

create function public.client_job_stats(p_client_id uuid)
returns table(
  posted bigint,
  completed bigint,
  cancelled bigint,
  cancelled_after_hire bigint,
  rehires bigint,
  would_again_yes bigint,
  would_again_total bigint
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select
    count(*) filter (where status <> 'draft'),
    count(*) filter (where status = 'completed'),
    count(*) filter (where status = 'cancelled'),
    count(*) filter (where status = 'cancelled' and assigned_worker_id is not null),
    -- D5: rehires — among this client's non-draft jobs that ever had a worker
    -- assigned, every job beyond a worker's first is a repeat hire.
    count(*) filter (where status <> 'draft' and assigned_worker_id is not null)
      - count(distinct assigned_worker_id) filter (where status <> 'draft' and assigned_worker_id is not null),
    (select count(*)
       from public.reviews r
       join public.jobs j on j.id = r.job_id
      where j.client_id = p_client_id
        and r.reviewee_id = p_client_id
        and r.would_again = true
        and public.review_is_revealed(r.job_id, r.reviewer_id, r.reviewee_id, r.created_at)),
    (select count(*)
       from public.reviews r
       join public.jobs j on j.id = r.job_id
      where j.client_id = p_client_id
        and r.reviewee_id = p_client_id
        and r.would_again is not null
        and public.review_is_revealed(r.job_id, r.reviewer_id, r.reviewee_id, r.created_at))
  from public.jobs
  where client_id = p_client_id;
$$;

comment on function public.client_job_stats(p_client_id uuid) is
  'Counted (never estimated) posting history for any client — the JobDetail trust signal, and since R8a (D5) the worker''s look at a customer''s record before bidding: cancellations after a hire, repeat hires, and would-work-for-them-again over REVEALED customer-role reviews only. SECURITY DEFINER because the counts deliberately cover rows the viewer cannot read row-wise.';

revoke all on function public.client_job_stats(uuid) from public, anon;
grant execute on function public.client_job_stats(uuid) to authenticated;
