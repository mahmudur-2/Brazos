-- BRAZOS · Phase 34 · short video attachments on job postings
--
-- Safe to run repeatedly. Adds one nullable-by-default column and redefines
-- two existing job-writing functions to carry it. No data is modified or
-- deleted, no policy or RLS setting is changed, and no privilege is widened
-- beyond re-granting what these two functions already had.
--
-- RUN THIS BEFORE SHIPPING THE APP BUILD THAT GOES WITH IT. The client reads
-- jobs.videos in its column list, so an app that expects this column against a
-- database without it will fail every job read with 42703.
--
-- WHY A SEPARATE COLUMN RATHER THAN REUSING jobs.photos
-- -----------------------------------------------------
-- photos is read as image URLs in six places (the browse card thumbnail, the
-- job detail gallery, the client's before/after strip, the hire-request card,
-- and both edit paths). Putting video URLs in the same array would make every
-- one of those render a broken image unless each learned to tell the two
-- apart by file extension — a rule that would then have to stay correct in six
-- places forever. A separate column keeps photos meaning exactly what it has
-- always meant and leaves those call sites untouched.
--
-- WHY NO STORAGE CHANGES
-- ----------------------
-- Videos go to the existing public `job-photos` bucket under the same
-- `postings/<uid>/…` prefix the poster's photos already use. That bucket has
-- no allowed_mime_types restriction, and phase29's job_photos_insert policy
-- authorises on the path's owner rather than on content type, so a video is
-- already permitted by the policy as written. phase26's delete policy covers
-- removal by the same path rule. Nothing to add, and deliberately nothing
-- loosened.
--
-- LIMITS
-- ------
-- 5 photos (unchanged) and 2 videos per job. Duration and file size are
-- enforced in the picker, where the file is actually inspectable; the database
-- enforces count and shape.

begin;

-- 1. The column ------------------------------------------------------------

alter table public.jobs
  add column if not exists videos jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'jobs_videos_is_array'
  ) then
    alter table public.jobs
      add constraint jobs_videos_is_array check (jsonb_typeof(videos) = 'array');
  end if;
end $$;

comment on column public.jobs.videos is
  'Short videos attached to the posting, as public job-photos URLs. Max 2, enforced in create_job/update_job_details. Mirrors the shape of jobs.photos.';

-- 2. create_job ------------------------------------------------------------
--
-- The parameter list changes, so the old signature is dropped rather than
-- left behind: two overloads differing only by a defaulted trailing argument
-- would make PostgREST's overload resolution ambiguous for a caller that
-- omits it. Everything else in the body is phase29's, unchanged, with the
-- videos validation added alongside the photos validation it mirrors.

drop function if exists public.create_job(
  text, text, public.job_category, text, integer, jsonb, double precision, double precision
);

create or replace function public.create_job(
  p_title text,
  p_description text,
  p_category public.job_category,
  p_location text,
  p_budget_cents integer default null,
  p_photos jsonb default '[]'::jsonb,
  p_lat double precision default null,
  p_lng double precision default null,
  p_videos jsonb default '[]'::jsonb
)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
begin
  if v_user is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 80 then
    raise exception 'Title must be between 1 and 80 characters';
  end if;
  if length(btrim(coalesce(p_description, ''))) not between 1 and 500 then
    raise exception 'Description must be between 1 and 500 characters';
  end if;
  if length(btrim(coalesce(p_location, ''))) not between 1 and 200 then
    raise exception 'Location is required';
  end if;
  if p_budget_cents is not null and p_budget_cents <= 0 then
    raise exception 'Budget must be positive';
  end if;
  if jsonb_typeof(coalesce(p_photos, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_photos, '[]'::jsonb)) > 5 then
    raise exception 'Photos must be an array with at most 5 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) as photo(value)
    where jsonb_typeof(photo.value) <> 'string'
       or length(photo.value #>> '{}') > 2048
  ) then
    raise exception 'Each photo must be a valid URL or storage reference';
  end if;
  if jsonb_typeof(coalesce(p_videos, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_videos, '[]'::jsonb)) > 2 then
    raise exception 'Videos must be an array with at most 2 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_videos, '[]'::jsonb)) as video(value)
    where jsonb_typeof(video.value) <> 'string'
       or length(video.value #>> '{}') > 2048
  ) then
    raise exception 'Each video must be a valid URL or storage reference';
  end if;
  if (p_lat is null) <> (p_lng is null)
     or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180)) then
    raise exception 'Coordinates are invalid';
  end if;

  insert into public.jobs (
    client_id, title, description, category, location,
    budget_cents, photos, videos, status
  )
  values (
    v_user, btrim(p_title), btrim(p_description), p_category, btrim(p_location),
    p_budget_cents, coalesce(p_photos, '[]'::jsonb), coalesce(p_videos, '[]'::jsonb), 'open'
  )
  returning * into v_job;

  if p_lat is not null then
    insert into public.job_locations (job_id, lat, lng)
    values (v_job.id, p_lat, p_lng);
  end if;

  return v_job;
end;
$$;

-- phase32 turned OFF the default EXECUTE grant for functions created in this
-- schema, so a freshly created function is unreachable until granted here.
revoke all on function public.create_job(
  text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb
) from public, anon;
grant execute on function public.create_job(
  text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb
) to authenticated;

-- 3. update_job_details ----------------------------------------------------

drop function if exists public.update_job_details(
  uuid, text, text, public.job_category, text, integer, jsonb, double precision, double precision
);

create or replace function public.update_job_details(
  p_job_id uuid,
  p_title text,
  p_description text,
  p_category public.job_category,
  p_location text,
  p_budget_cents integer default null,
  p_photos jsonb default '[]'::jsonb,
  p_lat double precision default null,
  p_lng double precision default null,
  p_videos jsonb default '[]'::jsonb
)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_user then
    raise exception 'Job not found or not owned by caller';
  end if;
  if not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if v_job.status <> 'open'
     or exists (select 1 from public.bids b where b.job_id = p_job_id) then
    raise exception 'Jobs can only be edited while open and before the first bid';
  end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 80
     or length(btrim(coalesce(p_description, ''))) not between 1 and 500
     or length(btrim(coalesce(p_location, ''))) not between 1 and 200 then
    raise exception 'Job details are invalid';
  end if;
  if p_budget_cents is not null and p_budget_cents <= 0 then
    raise exception 'Budget must be positive';
  end if;
  if jsonb_typeof(coalesce(p_photos, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_photos, '[]'::jsonb)) > 5 then
    raise exception 'Photos must be an array with at most 5 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) as photo(value)
    where jsonb_typeof(photo.value) <> 'string'
       or length(photo.value #>> '{}') > 2048
  ) then
    raise exception 'Each photo must be a valid URL or storage reference';
  end if;
  if jsonb_typeof(coalesce(p_videos, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_videos, '[]'::jsonb)) > 2 then
    raise exception 'Videos must be an array with at most 2 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_videos, '[]'::jsonb)) as video(value)
    where jsonb_typeof(video.value) <> 'string'
       or length(video.value #>> '{}') > 2048
  ) then
    raise exception 'Each video must be a valid URL or storage reference';
  end if;
  if (p_lat is null) <> (p_lng is null)
     or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180)) then
    raise exception 'Coordinates are invalid';
  end if;

  update public.jobs
  set
    title = btrim(p_title),
    description = btrim(p_description),
    category = p_category,
    location = btrim(p_location),
    budget_cents = p_budget_cents,
    photos = coalesce(p_photos, '[]'::jsonb),
    videos = coalesce(p_videos, '[]'::jsonb)
  where id = p_job_id
  returning * into v_job;

  if p_lat is null then
    delete from public.job_locations where job_id = p_job_id;
  else
    insert into public.job_locations (job_id, lat, lng)
    values (p_job_id, p_lat, p_lng)
    on conflict (job_id) do update set lat = excluded.lat, lng = excluded.lng;
  end if;

  return v_job;
end;
$$;

revoke all on function public.update_job_details(
  uuid, text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb
) from public, anon;
grant execute on function public.update_job_details(
  uuid, text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb
) to authenticated;

-- Refresh PostgREST's schema cache so the new column and the new signatures
-- are visible immediately rather than at the next reload.
notify pgrst, 'reload schema';

commit;
