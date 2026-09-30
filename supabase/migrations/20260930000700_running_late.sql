-- 20260930000700_running_late.sql — idea 5, "Running late, one tap": jobs.late_minutes and
-- jobs.late_reported_at, written by report_running_late(), which tells the customer.
--
-- THE DECISION: docs/DECISIONS.md 2026-09-30 entry (1) — "Running late, one tap" is IN v1
-- (docs/SCOPE.md "In v1", the line beginning "Running late, one tap"): the worker's 10 / 20 / 30
-- min chips, inside the progress card on their job screen, tell the customer and move the arrival
-- time. The app shows the moved window wherever it shows the booked one (lib/runningLate.ts) until
-- the worker arrives; this file records the delay and sends the one push.
--
-- THE VERSION: 20260930000600_needed_today.sql is the newest before it, so this takes 000700. The
-- pgTAP file is supabase/tests/150_running_late.sql.
--
-- WHAT THIS FILE DOES, in one transaction:
--   (1) jobs.late_minutes smallint (null, or one of 10 / 20 / 30 — an allow-list CHECK, never a
--       block-list) and jobs.late_reported_at timestamptz. Additive and nullable: every earlier row,
--       and every row an installed build reads, has no delay. jobs' grants are table-level
--       (baseline: SELECT to anon and authenticated; no client UPDATE path writes these — the RPC
--       below is the one writer), so the columns need no grant of their own; RLS is unchanged.
--   (2) report_running_late(p_job_id uuid, p_minutes integer) returns public.jobs — SECURITY
--       DEFINER, for the job's ASSIGNED worker only, only while the job is assigned and before they
--       arrive (mark_worker_arrival()'s own window). It sets the delay (the latest tap wins — not
--       cumulative) and enqueues ONE notification to the customer under 'job_updates' (their own
--       switch, through should_notify: ban, block, mute, preference): "<worker> is running 20 min
--       late", the body the job and, when the job has an arrival window, the moved one. The dedupe
--       key carries the minutes, so a second tap of the same chip sends nothing new and a different
--       chip sends its own. Revoked from public and anon; EXECUTE to authenticated — the one role
--       the call-site inventory names (lib/jobs.ts reportRunningLate, through supabase.rpc).
--
-- WHAT THIS FILE DOES NOT TOUCH: status (transition_job_status() stays the only status mover),
-- assignment, mark_worker_arrival(), every payments / ledger / settlement object. NOT destructive
-- under scripts/staging-scan.sh. Reversible: one corrective migration drops the function and the
-- two columns.

begin;

-- ---------------------------------------------------------------------------
-- 1. The columns.
-- ---------------------------------------------------------------------------
alter table public.jobs add column if not exists late_minutes smallint;
alter table public.jobs add column if not exists late_reported_at timestamptz;
alter table public.jobs drop constraint if exists jobs_late_minutes_known;
alter table public.jobs add constraint jobs_late_minutes_known check (late_minutes is null or late_minutes in (10, 20, 30));
comment on column public.jobs.late_minutes is 'Idea 5 (docs/DECISIONS.md 2026-09-30 entry (1)): the hired worker''s last "running late" tap, in minutes (10, 20 or 30), before they arrive. Written only by report_running_late(); the app moves the arrival window by it until arrived_at is set.';
comment on column public.jobs.late_reported_at is 'Idea 5: when the worker last said they are running late (report_running_late()).';

-- ---------------------------------------------------------------------------
-- 2. The one writer, and the one push.
-- ---------------------------------------------------------------------------
create or replace function public.report_running_late(p_job_id uuid, p_minutes integer) returns public.jobs
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_window text;
begin
  if v_user is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if p_minutes is null or p_minutes not in (10, 20, 30) then
    raise exception 'Running late is 10, 20 or 30 minutes';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.assigned_worker_id is distinct from v_user then
    raise exception 'Job not found or not assigned to caller';
  end if;
  if v_job.status <> 'assigned' or v_job.arrived_at is not null then
    raise exception 'Running late can only be said before you arrive';
  end if;

  update public.jobs
     set late_minutes = p_minutes,
         late_reported_at = now()
   where id = p_job_id
  returning * into v_job;

  -- The moved window, when the job has one: "6:20 PM–8:20 PM".
  if v_job.arrival_start_hour is not null and v_job.arrival_end_hour is not null then
    v_window :=
      to_char(time '00:00' + make_interval(mins => v_job.arrival_start_hour * 60 + p_minutes), 'FMHH12:MI AM')
      || '–' ||
      to_char(time '00:00' + make_interval(mins => v_job.arrival_end_hour * 60 + p_minutes), 'FMHH12:MI AM');
  end if;

  perform public.enqueue_notification(
    v_job.client_id,
    v_user,
    'job_updates',
    'job_running_late',
    coalesce(public.notify_display_name(v_user), 'Your worker') || ' is running ' || p_minutes::text || ' min late',
    left(v_job.title, 80) || coalesce(' · now ' || v_window, ''),
    jsonb_build_object('screen', 'ClientJobDetail', 'jobId', v_job.id::text),
    'job_running_late:' || v_job.id::text || ':' || p_minutes::text
  );

  return v_job;
end;
$$;

revoke all on function public.report_running_late(uuid, integer) from public, anon;
grant execute on function public.report_running_late(uuid, integer) to authenticated;

comment on function public.report_running_late(uuid, integer) is
  'Idea 5 (2026-09-30, docs/DECISIONS.md entry (1)): the job''s assigned worker says they are running 10, 20 or 30 minutes late, while the job is assigned and before they arrive. Sets jobs.late_minutes / late_reported_at (the latest tap wins) and enqueues one job_updates notification to the customer. SECURITY DEFINER; authenticated only.';

commit;
