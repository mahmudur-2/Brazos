-- BRAZOS · Phase 31 · restore transactional job-status transitions
--
-- Safe to run repeatedly. This is intentionally limited to the missing RPC
-- reported by production; it does not modify or delete user data.

begin;

create or replace function public.transition_job_status(
  p_job_id uuid,
  p_status text,
  p_completion_photos jsonb default null
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
    end
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function public.transition_job_status(uuid, text, jsonb) from public;
grant execute on function public.transition_job_status(uuid, text, jsonb) to authenticated;

-- Expose the repaired function immediately instead of waiting for the normal
-- PostgREST schema-cache refresh.
notify pgrst, 'reload schema';

commit;
