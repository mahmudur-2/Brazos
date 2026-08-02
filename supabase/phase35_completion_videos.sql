-- BRAZOS · Phase 35 · completion video evidence
--
-- Safe to run repeatedly. Adds one column with a default and replaces one
-- existing function's signature. No data is modified or deleted, no policy or
-- RLS setting is changed, and no privilege is widened beyond re-granting what
-- transition_job_status() already had.
--
-- RUN THIS BEFORE SHIPPING THE APP BUILD THAT GOES WITH IT. The client calls
-- transition_job_status with p_completion_videos; against a database without
-- this migration that call resolves to nothing and marking a job complete
-- fails.
--
-- WHY A SEPARATE COLUMN RATHER THAN REUSING jobs.completion_photos
-- ----------------------------------------------------------------
-- Same reasoning phase34 recorded for jobs.photos vs jobs.videos, and the same
-- shape of consequence: completion_photos is read as image URLs by the
-- worker's completed view, the client's completed view, and the portfolio
-- flow (completionPhotosOf() in lib/jobs.ts, which additionally folds in the
-- pre-phase17 single completion_photo_url). A video URL in that array would
-- render as a broken image in every one of them unless each learned to tell
-- the two apart by file extension. A separate column keeps completion_photos
-- meaning exactly what it has always meant and leaves those call sites alone.
--
-- Legacy rows are untouched: the column defaults to '[]', so every job
-- completed before this migration keeps its photos and simply has no video.
--
-- WHY NO STORAGE CHANGES
-- ----------------------
-- Completion videos go to the existing public `job-photos` bucket at
-- `{jobId}/completion/{unique}.{ext}`. phase29's job_photos_insert policy
-- authorises any non-`postings` path whose FIRST folder segment is a job the
-- caller is the assigned worker on, and phase26's
-- job_photos_delete_own_completion policy scopes deletes by the same rule.
-- A `completion/` segment sits *below* that first segment, so both policies
-- already cover this path exactly as written — the video is writable only by
-- the job's own assigned worker, and by nobody else. Nothing to add, and
-- deliberately nothing loosened.
--
-- LIMITS
-- ------
-- 5 completion photos (unchanged) and at most 1 completion video per job.
-- Duration (2 minutes) and file size are enforced in the picker, where the
-- file is actually inspectable; the database enforces count and shape.

begin;

-- 1. The column ------------------------------------------------------------

alter table public.jobs
  add column if not exists completion_videos jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'jobs_completion_videos_is_array'
  ) then
    alter table public.jobs
      add constraint jobs_completion_videos_is_array
      check (jsonb_typeof(completion_videos) = 'array');
  end if;
end $$;

comment on column public.jobs.completion_videos is
  'Video the assigned worker attached when marking the job complete, as public job-photos URLs. Max 1, enforced in transition_job_status(). Mirrors the shape of jobs.completion_photos.';

-- 2. transition_job_status --------------------------------------------------
--
-- The parameter list changes, so the old three-argument signature is dropped
-- rather than left behind: two overloads differing only by a defaulted
-- trailing argument would make PostgREST's overload resolution ambiguous for
-- a caller that omits it. Everything else in the body is phase31's, unchanged
-- — same assignee check, same active-profile check, same allowed transitions,
-- same photo validation — with the video validation added alongside the photo
-- validation it mirrors.

drop function if exists public.transition_job_status(uuid, text, jsonb);

create or replace function public.transition_job_status(
  p_job_id uuid,
  p_status text,
  p_completion_photos jsonb default null,
  p_completion_videos jsonb default null
)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_photos jsonb := coalesce(p_completion_photos, '[]'::jsonb);
  v_videos jsonb := coalesce(p_completion_videos, '[]'::jsonb);
begin
  select * into v_job
  from public.jobs
  where id = p_job_id
  for update;

  if not found or v_user is null or v_job.assigned_worker_id <> v_user then
    raise exception 'Job not found or not assigned to caller';
  end if;
  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user
      and not coalesce(p.banned, false)
  ) then
    raise exception 'Active authentication required';
  end if;
  if not (
    (v_job.status = 'assigned' and p_status = 'in_progress')
    or (v_job.status = 'in_progress' and p_status = 'completed')
  ) then
    raise exception 'Invalid job status transition';
  end if;
  if jsonb_typeof(v_photos) <> 'array' or jsonb_array_length(v_photos) > 5 then
    raise exception 'Completion photos must be an array with at most 5 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_photos) as photo(value)
    where jsonb_typeof(photo.value) <> 'string'
      or length(photo.value #>> '{}') > 2048
  ) then
    raise exception 'Each completion photo must be a valid URL or storage reference';
  end if;
  if jsonb_typeof(v_videos) <> 'array' or jsonb_array_length(v_videos) > 1 then
    raise exception 'Completion videos must be an array with at most 1 entry';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_videos) as video(value)
    where jsonb_typeof(video.value) <> 'string'
      or length(video.value #>> '{}') > 2048
  ) then
    raise exception 'Each completion video must be a valid URL or storage reference';
  end if;

  update public.jobs
  set
    status = p_status::public.job_status,
    completion_photos = case
      when p_status = 'completed' and p_completion_photos is not null then v_photos
      else completion_photos
    end,
    completion_photo_url = case
      when p_status = 'completed' and jsonb_array_length(v_photos) > 0
        then v_photos->>0
      else completion_photo_url
    end,
    completion_videos = case
      when p_status = 'completed' and p_completion_videos is not null then v_videos
      else completion_videos
    end
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

-- phase32 turned OFF the default EXECUTE grant for functions created in this
-- schema, so a freshly created function is unreachable until granted here.
revoke all on function public.transition_job_status(uuid, text, jsonb, jsonb)
  from public, anon;
grant execute on function public.transition_job_status(uuid, text, jsonb, jsonb)
  to authenticated;

-- Refresh PostgREST's schema cache so the new column and the new signature are
-- visible immediately rather than at the next reload.
notify pgrst, 'reload schema';

commit;
