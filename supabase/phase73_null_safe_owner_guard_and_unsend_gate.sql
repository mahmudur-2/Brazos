-- supabase/phase73_null_safe_owner_guard_and_unsend_gate.sql
--
-- Two SECURITY DEFINER body fixes in one transaction. Hand-applied by a human in
-- the Supabase SQL Editor against STAGING zzkumxcjtbqoselzptig. Never production.
-- Safe to run more than once.
--
-- (1) transition_job_status(): the owner guard used an inequality test against
--     assigned_worker_id. On an UNASSIGNED job that column is NULL, so the test
--     yields NULL rather than TRUE, the guard does not fire, and the idempotent
--     return branch hands any authenticated caller the full jobs row - bypassing
--     the jobs SELECT policies. Read-only (the transition allow-list still
--     rejects the write) but it is a full-row disclosure. Fixed with
--     IS DISTINCT FROM, which is NULL-safe.
--
-- (2) unsend_message(): carried no lifecycle check, so a banned or tombstoned
--     account could still blank its own messages. Adds is_active_user(), the
--     same predicate its sibling write RPCs carry.
--
-- create or replace preserves the existing ACL; the revoke/grant statements are
-- restated anyway, per CLAUDE.md.

begin;

-- (1) --------------------------------------------------------------------------

create or replace function public.transition_job_status(
  p_job_id uuid,
  p_status text,
  p_completion_photos jsonb default null::jsonb,
  p_completion_videos jsonb default null::jsonb
)
returns public.jobs
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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

  -- phase73: NULL-safe comparison. On an unassigned job the column is NULL, and
  -- the previous inequality test yielded NULL rather than TRUE, so the guard
  -- never fired and the caller received the row.
  if not found or v_user is null or v_job.assigned_worker_id is distinct from v_user then
    raise exception 'Job not found or not assigned to caller';
  end if;
  if not public.is_profile_active(v_user) then
    raise exception 'Active authentication required';
  end if;

  -- phase58: a retry of a transition that already landed returns the row
  -- (the sibling-RPC idempotency pattern). The retry's media is ignored -
  -- the first call's payload already landed.
  if v_job.status::text = p_status then
    return v_job;
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
    end,
    completed_at = case
      when p_status = 'completed' then coalesce(completed_at, now())
      else completed_at
    end
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$function$;

revoke all on function public.transition_job_status(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.transition_job_status(uuid, text, jsonb, jsonb) to authenticated;

-- (2) --------------------------------------------------------------------------

create or replace function public.unsend_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sender_id uuid;
  v_created_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- phase73: banned or tombstoned accounts may not blank their messages.
  if not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  select sender_id, created_at into v_sender_id, v_created_at
  from public.messages
  where id = p_message_id;

  if v_sender_id is null then
    raise exception 'Message not found';
  end if;

  if v_sender_id <> auth.uid() then
    raise exception 'You can only unsend your own messages';
  end if;

  if now() - v_created_at > interval '15 minutes' then
    raise exception 'Unsend is only available for 15 minutes after sending';
  end if;

  update public.messages
  set content = '',
      image_url = null,
      audio_url = null,
      audio_duration_ms = null,
      unsent_at = now()
  where id = p_message_id;
end;
$function$;

revoke all on function public.unsend_message(uuid) from public, anon;
grant execute on function public.unsend_message(uuid) to authenticated;

-- SENTINEL ---------------------------------------------------------------------
-- Created inside the same transaction as the self-check below. A failed assertion
-- rolls the whole file back, so this function cannot exist unless every check
-- passed. Function bodies are invisible to a PostgREST probe; this is what
-- verify-schema keys on.

create or replace function public.phase73_null_safe_guards_enabled()
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select true;
$function$;

revoke all on function public.phase73_null_safe_guards_enabled() from public, anon;
grant execute on function public.phase73_null_safe_guards_enabled() to authenticated;

-- SELF-CHECK -------------------------------------------------------------------
-- Asserts the positive desired state, not merely the absence of the bad state.

do $$
declare
  v_tjs text;
  v_uns text;
  r record;
begin
  select pg_get_functiondef(p.oid) into v_tjs
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'transition_job_status'
    and pg_get_function_identity_arguments(p.oid) = 'p_job_id uuid, p_status text, p_completion_photos jsonb, p_completion_videos jsonb';

  if v_tjs is null then
    raise exception 'PHASE73 SELF-CHECK FAIL (a): transition_job_status(uuid,text,jsonb,jsonb) not found';
  end if;
  if position('is distinct from v_user' in v_tjs) = 0 then
    raise exception 'PHASE73 SELF-CHECK FAIL (b): transition_job_status is missing the NULL-safe guard';
  end if;
  if position('assigned_worker_id <> v_user' in v_tjs) > 0 then
    raise exception 'PHASE73 SELF-CHECK FAIL (c): transition_job_status still contains the NULL-unsafe comparison';
  end if;

  select pg_get_functiondef(p.oid) into v_uns
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'unsend_message'
    and pg_get_function_identity_arguments(p.oid) = 'p_message_id uuid';

  if v_uns is null then
    raise exception 'PHASE73 SELF-CHECK FAIL (d): unsend_message(uuid) not found';
  end if;
  if position('is_active_user()' in v_uns) = 0 then
    raise exception 'PHASE73 SELF-CHECK FAIL (e): unsend_message is missing the lifecycle gate';
  end if;

  for r in
    select p.proname, p.prosecdef, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('transition_job_status', 'unsend_message')
  loop
    if not r.prosecdef then
      raise exception 'PHASE73 SELF-CHECK FAIL (f): % lost SECURITY DEFINER', r.proname;
    end if;
    if r.proconfig is null
       or array_to_string(r.proconfig, ',') not like '%search_path=%'
       or array_to_string(r.proconfig, ',') not like '%pg_temp%' then
      raise exception 'PHASE73 SELF-CHECK FAIL (g): % lost its pinned search_path', r.proname;
    end if;
  end loop;

  for r in
    select p.proname, p.oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('transition_job_status', 'unsend_message',
                        'phase73_null_safe_guards_enabled')
  loop
    if has_function_privilege('anon', r.oid, 'EXECUTE') then
      raise exception 'PHASE73 SELF-CHECK FAIL (h): % is executable by anon', r.proname;
    end if;
    if not has_function_privilege('authenticated', r.oid, 'EXECUTE') then
      raise exception 'PHASE73 SELF-CHECK FAIL (i): % is NOT executable by authenticated', r.proname;
    end if;
  end loop;

  raise notice 'PHASE73 PATCHED: transition_job_status(uuid, text, jsonb, jsonb) [NULL-safe owner guard]';
  raise notice 'PHASE73 PATCHED: unsend_message(uuid) [is_active_user gate]';
  raise notice 'PHASE73 SELF-CHECK PASS: 2 functions verified';
end;
$$;

commit;
