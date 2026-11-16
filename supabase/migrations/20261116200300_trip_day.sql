-- trip_day — production-36h S4, step C1 (verdict C08): the worker's trip and the start of the work
-- wait for the job's own day, and the trip steps need the protected payment, as the start already
-- does.
--
-- WHAT WAS WRONG. mark_worker_arrival() (20260901000000_baseline.sql:2757) let the hired worker mark
-- "On my way" and "I'm here" on any assigned job: before the customer protected the payment, and on
-- any day, weeks before the job's booked day. transition_job_status() (its live body,
-- 20261115000200_work_start_money_rule.sql:150) let the work start on any day once the payment was
-- held. A false "I'm here" then starts the customer's clocks and notices for a visit that cannot
-- have happened.
--
-- WHAT CHANGES (each restated body is the live one verbatim, plus ONE block of trip_day lines):
--   1. job_day_reached(p_date, p_at): new, the one definition of "the job's day has come": no day,
--      or the New York date of p_at on or after it. Owner only (no grant to anyone).
--   1b. require_work_money(p_job_id): new, THE money rule for the trip and the start, in one
--      place: the start's two checks (a held job payment, then payment_money_clear), MOVED here
--      from transition_job_status word for word, with their two sentences. Owner only.
--   2. mark_worker_arrival(): after the status check, a step that would write a NEW time calls
--      require_work_money, then is refused before the job's day (the start's order). A repeat of a
--      step already marked returns the row as before, whatever the money; rows that already hold
--      an arrival keep it.
--   3. transition_job_status(): the start's two money checks become the require_work_money call
--      (the one change to its body besides the trip_day block); then assigned -> in_progress is
--      refused before the job's day. Every other transition, and the idempotent retry, is unchanged.
-- New sentence, both places (old apps show it as written: lib/errorMessage.ts userMessage):
--   "This job is booked for Tuesday, December 1; the trip and the start open on that day."
-- The money sentences on the trip steps are the start's existing ones, word for word:
--   "The customer hasn't protected the payment yet. You'll get a notification the moment it's held."
--   "This job's payment is on hold, so the work can't start yet."
-- There is no date change after the hire in this version: the sentence promises no early start.
-- Signatures, return shapes, settings and grants are unchanged and restated; the
-- mark_worker_arrival comment is restated with one sentence added.
--
-- Additive under scripts/staging-scan.sh. Proof: supabase/tests/493_trip_day.sql.

begin;

-- ---------------------------------------------------------------------------
-- 1. The one definition of "the job's day has come".
-- ---------------------------------------------------------------------------
create or replace function public.job_day_reached(p_date date, p_at timestamptz)
returns boolean
language sql stable
set search_path = public, pg_temp
as $fn$
  select p_date is null or (p_at at time zone 'America/New_York')::date >= p_date
$fn$;
revoke all on function public.job_day_reached(date, timestamptz) from public, anon, authenticated, service_role;
comment on function public.job_day_reached(date, timestamptz) is
  'trip_day: true when a job may be travelled to and started at p_at: it has no day, or p_at''s date in New York is on or after its day. Read by mark_worker_arrival and transition_job_status. Owner only.';

-- ---------------------------------------------------------------------------
-- 1b. The one money rule for the trip and the start (moved from transition_job_status).
-- ---------------------------------------------------------------------------
create or replace function public.require_work_money(p_job_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  -- R4 (D8): the held gate. Work starts only on a payment held in protection.
  if not exists (
    select 1 from public.payments p
    where p.job_id = p_job_id and p.kind = 'job_payment'
      and p.status = 'held'
  ) then
    raise exception 'The customer hasn''t protected the payment yet. You''ll get a notification the moment it''s held.';
  end if;
  -- A6: and only on money the queues can pay out (no card dispute, charged the row's amount).
  if not exists (
    select 1 from public.payments p
    where p.job_id = p_job_id and p.kind = 'job_payment'
      and p.status = 'held' and public.payment_money_clear(p)
  ) then
    raise exception 'This job''s payment is on hold, so the work can''t start yet.';
  end if;
end
$fn$;
revoke all on function public.require_work_money(uuid) from public, anon, authenticated, service_role;
comment on function public.require_work_money(uuid) is
  'trip_day: THE money rule for "On my way", "I''m here" and the start of work: a held job payment (else the "hasn''t protected the payment yet" sentence), whose money is clear (payment_money_clear; else the "on hold" sentence). Raises; returns nothing. Called by mark_worker_arrival and transition_job_status; nothing else restates it. Owner only.';

-- ---------------------------------------------------------------------------
-- 2. mark_worker_arrival: the baseline body, plus the trip_day block.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."mark_worker_arrival"("p_job_id" "uuid", "p_step" "text") RETURNS "public"."jobs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
begin
  if v_user is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  -- trip_day (A7-02): a null step is refused too (null passes "not in" and would skip the checks).
  if p_step is null or p_step not in ('en_route', 'arrived') then
    raise exception 'Unknown arrival step';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.assigned_worker_id is distinct from v_user then
    raise exception 'Job not found or not assigned to caller';
  end if;
  if v_job.status <> 'assigned' then
    raise exception 'Arrival can only be marked before the job is started';
  end if;

  -- >>> trip_day: a step that would write a new time needs the start's money rule, then the job's
  -- own day (the start's order). A step already marked returns the row unchanged, below.
  if (p_step = 'en_route' and v_job.en_route_at is null)
     or (p_step = 'arrived' and v_job.arrived_at is null) then
    perform public.require_work_money(p_job_id);
    if not public.job_day_reached(v_job.scheduled_date, now()) then
      raise exception 'This job is booked for %; the trip and the start open on that day.',
        to_char(v_job.scheduled_date, 'FMDay, FMMonth FMDD');
    end if;
  end if;
  -- <<< trip_day

  update public.jobs
     set en_route_at = coalesce(en_route_at, now()),
         arrived_at = case
           when p_step = 'arrived' then coalesce(arrived_at, now())
           else arrived_at
         end
   where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;
revoke all on function public.mark_worker_arrival(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.mark_worker_arrival(uuid, text) to authenticated;
comment on function public.mark_worker_arrival(uuid, text) is
  'The assigned worker declares en_route or arrived on an assigned job. Monotonic + idempotent: timestamps are set once, never cleared; arrived backfills en_route. No live location exists anywhere. trip_day: a step that writes a new time needs the start''s money rule (require_work_money) and the job''s own New York day (job_day_reached).';

-- ---------------------------------------------------------------------------
-- 3. transition_job_status: the work_start_money_rule body, its two money checks now the
--    require_work_money call, plus the trip_day block.
-- ---------------------------------------------------------------------------
create or replace function public.transition_job_status(p_job_id uuid, p_status text, p_completion_photos jsonb default null, p_completion_videos jsonb default null)
returns public.jobs
language plpgsql security definer set search_path = public, pg_temp as $fn$
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
  -- R4 (D8) and A6: the held gate and the clear money, now in one place (trip_day: the trip steps
  -- read the same rule).
  if v_job.status = 'assigned' and p_status = 'in_progress' then
    perform public.require_work_money(p_job_id);
  end if;
  -- >>> trip_day: after the held gate, the start waits for the job's own day (undated: no wait).
  if v_job.status = 'assigned' and p_status = 'in_progress'
     and not public.job_day_reached(v_job.scheduled_date, now()) then
    raise exception 'This job is booked for %; the trip and the start open on that day.',
      to_char(v_job.scheduled_date, 'FMDay, FMMonth FMDD');
  end if;
  -- <<< trip_day
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
$fn$;
revoke all on function public.transition_job_status(uuid, text, jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.transition_job_status(uuid, text, jsonb, jsonb) to authenticated;

commit;
