-- 20260925000000_job_completions.sql — R6c: the completion-photo guard (D-14)
-- and the table that records it.
--
-- One transaction, ending in a sentinel function (phase50's shape):
-- job_completions_enabled() exists only if every statement here committed.
--
-- VOCABULARY. No money moves here. A job is "marked complete" by its assigned
-- worker; the customer then approves the finished work or reports an issue.
--
-- ---------------------------------------------------------------------------
-- WHY THIS FILE EXISTS
-- ---------------------------------------------------------------------------
-- D-14: at least one photo of the finished work is required to mark a job
-- complete. Until now transition_job_status() accepted a null or empty photo
-- array on the in_progress -> completed step, so a job could reach the
-- customer's approval screen with nothing to approve against — and the money
-- path behind it (release, the 72-hour auto-release clock) ran off a
-- completion no photo backed. The guard lives in the database, where every
-- completion already goes (transition_job_status is the only status mover,
-- CLAUDE.md), never only in the client. The table is the record of that
-- guard: one row per completed job, written ONLY inside transition_job_status,
-- readable by the job's two parties and nobody else.
--
-- THIS FILE (R6c D5)
--   §0 pre-flight: raises, by name, on a schema that lacks what this extends.
--   §1 job_completions — the table: RLS on, one SELECT policy admitting the
--      job's client and its assigned worker, zero client write grants.
--   §2 transition_job_status() replaced whole: byte-identical to
--      20260905000000_stripe_foundation.sql §17 except (a) the photo guard on
--      p_status = 'completed' and (b) the job_completions insert after the
--      job row is updated. The held gate, the media shape checks, the
--      idempotent retry and every other branch are unchanged, and the ACL is
--      preserved by create or replace.
--   §3 sentinel.
--
-- DEFAULT PRIVILEGES. The baseline's tail re-establishes
-- `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON
-- TABLES TO anon, authenticated, service_role`, so the table created here is
-- BORN writable by the client. It therefore revokes from public, anon and
-- authenticated before its one grant. Functions are born executable by
-- PUBLIC (CREATE-time default ACL) and the sentinel carries its own
-- revoke/grant pair.

begin;

-- ---------------------------------------------------------------------------
-- 0. Pre-flight. Fail with a named cause rather than at runtime later.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.transition_job_status(uuid, text, jsonb, jsonb)') is null then
    raise exception 'job_completions: transition_job_status(uuid, text, jsonb, jsonb) is not the live signature';
  end if;
  if to_regprocedure('public.settlement_retry_enabled()') is null then
    raise exception 'job_completions: 20260920000000_settlement_retry.sql has not been applied';
  end if;
  if to_regprocedure('public.is_profile_active(uuid)') is null then
    raise exception 'job_completions: is_profile_active(uuid) is missing; transition_job_status calls it';
  end if;
  if not exists (
    select 1 from pg_attribute
     where attrelid = 'public.jobs'::regclass and attname = 'completion_photos' and not attisdropped
  ) then
    raise exception 'job_completions: jobs.completion_photos is missing';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. job_completions: the record of the guard. One row per completed job,
--    at least one photo, written only by transition_job_status (below).
-- ---------------------------------------------------------------------------
create table public.job_completions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  completed_by uuid not null references public.profiles(id),
  photos text[] not null,
  created_at timestamptz not null default now(),
  constraint job_completions_job_id_key unique (job_id),
  -- cardinality, not array_length: array_length(photos, 1) is NULL on an
  -- empty array, and a NULL CHECK passes — the one shape this row must never
  -- have would have been admitted. cardinality('{}') is 0 and refuses.
  constraint job_completions_at_least_one_photo check (cardinality(photos) >= 1)
);
alter table public.job_completions enable row level security;
revoke all on table public.job_completions from public, anon, authenticated;
grant select on table public.job_completions to authenticated;
-- service_role keeps the default-privilege ALL, as on every other table.
-- No INSERT, UPDATE or DELETE for anon or authenticated, and no policy for
-- any of them: the only writer is the SECURITY DEFINER function in §2.

create policy job_completions_parties_select on public.job_completions
  for select to authenticated
  using (
    exists (
      select 1 from public.jobs j
       where j.id = job_completions.job_id
         and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
    )
  );

comment on table public.job_completions is
  'R6c (D-14): one row per completed job — who marked it complete and the photos that backed it (at least one, enforced here and in transition_job_status). Written only inside transition_job_status; readable by the job''s client and assigned worker.';
comment on column public.job_completions.photos is
  'The completion photos as passed to transition_job_status, in order; the same values jobs.completion_photos carries. Never empty.';
comment on column public.job_completions.completed_by is
  'The assigned worker who marked the job complete (auth.uid() at the time of the call).';

-- ---------------------------------------------------------------------------
-- 2. transition_job_status(): replaced whole. Byte-identical to
--    20260905000000_stripe_foundation.sql §17 except the two R6c blocks
--    marked below: the completion-photo guard, and the job_completions insert.
-- ---------------------------------------------------------------------------
create or replace function public.transition_job_status(p_job_id uuid, p_status text, p_completion_photos jsonb default null, p_completion_videos jsonb default null)
returns public.jobs
language plpgsql security definer set search_path = public, pg_temp as $$
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
  -- R4 (D8): the held gate. Work starts only on a payment held in protection.
  if v_job.status = 'assigned' and p_status = 'in_progress' then
    if not exists (
      select 1 from public.payments p
      where p.job_id = p_job_id and p.kind = 'job_payment'
        and p.status not in ('failed', 'voided')
        and p.status = 'held'
    ) then
      raise exception 'The customer hasn''t protected the payment yet. You''ll get a notification the moment it''s held.';
    end if;
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
  -- R6c (D-14): the completion-photo guard. A null or empty p_completion_photos
  -- cannot mark a job complete. The shape checks above have already made
  -- v_photos an array, so its length is the whole test.
  if p_status = 'completed' and jsonb_array_length(v_photos) = 0 then
    raise exception 'At least one photo of the finished work is required to mark this job complete';
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

  -- R6c (D-14): the record of the guard — one row per completed job, written
  -- here and nowhere else. The retry branch above returns before this point,
  -- so the unique job_id can never collide on a repeated call.
  if p_status = 'completed' then
    insert into public.job_completions (job_id, completed_by, photos)
    select p_job_id, v_user, array_agg(photo.value #>> '{}' order by photo.ord)
      from jsonb_array_elements(v_photos) with ordinality as photo(value, ord);
  end if;

  return v_job;
end;
$$;
-- create or replace preserves the live ACL (authenticated may execute).

-- ---------------------------------------------------------------------------
-- 3. Sentinel. Created last inside the transaction, so its presence proves
--    the entire file committed (phase50's shape).
-- ---------------------------------------------------------------------------
create or replace function public.job_completions_enabled() returns boolean
language sql immutable set search_path = public, pg_temp as $$ select true $$;
revoke all on function public.job_completions_enabled() from public, anon;
grant execute on function public.job_completions_enabled() to authenticated, service_role;
comment on function public.job_completions_enabled() is
  'Marker: 20260925000000_job_completions.sql has been applied. Created last inside its transaction, so its presence proves the entire file committed.';

commit;
