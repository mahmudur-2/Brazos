-- BRAZOS · Phase 37 · a profile's reviews, and photos on a review
--
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- RUN THIS BEFORE SHIPPING THE APP BUILD THAT GOES WITH IT. The client calls
-- profile_reviews()/profile_review_summary() and passes p_photos to
-- create_review(); against a database without this migration the reviews
-- screen has nothing to read and submitting a review resolves to no function.
--
-- WHY A SECURITY DEFINER READER RATHER THAN A WIDER RLS POLICY
-- ------------------------------------------------------------
-- phase6's reviews_select_party restricts SELECT to `reviewer_id = auth.uid()
-- or reviewee_id = auth.uid()`. That is why a profile can show "3.5 (2
-- reviews)" — the aggregate is maintained on the profile row by a trigger —
-- while tapping it could never show the reviews themselves: a third party
-- cannot read a single row of them.
--
-- The policy is NOT widened. Two narrow SECURITY DEFINER functions return
-- exactly what a reputation page needs and nothing else, so the table stays
-- as locked down as it is today for every other query.
--
-- WHAT IS DELIBERATELY NOT RETURNED
-- ---------------------------------
-- The related job's TITLE is not returned, only its category. A job created
-- by accepting a private direct offer (phase18/phase36) never appears
-- publicly, and its title is the client's own words about their own home or
-- errand; surfacing it on the worker's public reputation page would leak a
-- private arrangement to anyone who opened that page. The category is a label
-- the worker already advertises on their profile, so it adds context without
-- adding disclosure.
--
-- Reviewer name and avatar come from the same public profile columns any
-- signed-in user can already read (phase29's grant list), so showing them
-- discloses nothing new.
--
-- WHY REVIEW PHOTOS GET THEIR OWN STORAGE PREFIX
-- ----------------------------------------------
-- phase29's job_photos_insert policy authorises either `postings/<uid>/…`
-- (the poster's own attachments) or `<jobId>/…` for that job's ASSIGNED
-- WORKER. A review is written by either party, so a client reviewing a worker
-- matches neither branch. Rather than loosen either one, this adds a third,
-- narrower policy for `reviews/<uid>/…`: writable and deletable only by the
-- account whose id is in the path. Nothing existing changes.

begin;

-- 1. The column ------------------------------------------------------------

alter table public.reviews
  add column if not exists photos jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reviews_photos_is_array'
  ) then
    alter table public.reviews
      add constraint reviews_photos_is_array check (jsonb_typeof(photos) = 'array');
  end if;
end $$;

comment on column public.reviews.photos is
  'Photos the reviewer attached, as public job-photos URLs under reviews/<uid>/. Max 5, enforced in create_review(). Empty for every review written before phase37.';

-- 2. Storage for review photos ---------------------------------------------

drop policy if exists "job_photos_insert_review" on storage.objects;
create policy "job_photos_insert_review"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'job-photos'
    and public.is_active_user()
    and (storage.foldername(name))[1] = 'reviews'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "job_photos_delete_own_review" on storage.objects;
create policy "job_photos_delete_own_review"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] = 'reviews'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- 3. create_review ----------------------------------------------------------
--
-- The parameter list changes, so the old signature is dropped rather than left
-- behind: two overloads differing only by a defaulted trailing argument would
-- make PostgREST's overload resolution ambiguous. The body is phase29's,
-- unchanged — same completed-job check, same active-caller check, same
-- participation check, same rating and comment-length validation — with photo
-- validation added.

drop function if exists public.create_review(uuid, uuid, integer, text);

create or replace function public.create_review(
  p_job_id uuid,
  p_reviewee_id uuid,
  p_rating integer,
  p_comment text default null,
  p_photos jsonb default '[]'::jsonb
)
returns public.reviews
language plpgsql
security definer
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
    job_id, reviewer_id, reviewee_id, rating, comment, photos
  )
  values (
    p_job_id, v_user, p_reviewee_id, p_rating, nullif(btrim(p_comment), ''), v_photos
  )
  returning * into v_review;

  return v_review;
end;
$$;

-- phase32 turned OFF the default EXECUTE grant for functions created in this
-- schema, so a freshly created function is unreachable until granted here.
revoke all on function public.create_review(uuid, uuid, integer, text, jsonb)
  from public, anon;
grant execute on function public.create_review(uuid, uuid, integer, text, jsonb)
  to authenticated;

-- 4. Reading one profile's reviews ------------------------------------------

create or replace function public.profile_reviews(
  p_user uuid,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  rating integer,
  comment text,
  photos jsonb,
  created_at timestamptz,
  reviewer_id uuid,
  reviewer_name text,
  reviewer_avatar_url text,
  job_category text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
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
  left join public.jobs j on j.id = r.job_id
  where r.reviewee_id = p_user
    and auth.uid() is not null
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.profile_reviews(uuid, integer, integer) from public, anon;
grant execute on function public.profile_reviews(uuid, integer, integer) to authenticated;

-- 5. The aggregate, from the same rows --------------------------------------
--
-- Read from `reviews` rather than from profiles.rating_avg/rating_count, so
-- the header on the reviews screen can never disagree with the list beneath
-- it — a drifted trigger would otherwise show "2 reviews" above three of them.

create or replace function public.profile_review_summary(p_user uuid)
returns table (
  total integer,
  average numeric,
  five integer,
  four integer,
  three integer,
  two integer,
  one integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    count(*)::integer,
    round(avg(r.rating)::numeric, 2),
    count(*) filter (where r.rating = 5)::integer,
    count(*) filter (where r.rating = 4)::integer,
    count(*) filter (where r.rating = 3)::integer,
    count(*) filter (where r.rating = 2)::integer,
    count(*) filter (where r.rating = 1)::integer
  from public.reviews r
  where r.reviewee_id = p_user
    and auth.uid() is not null;
$$;

revoke all on function public.profile_review_summary(uuid) from public, anon;
grant execute on function public.profile_review_summary(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
