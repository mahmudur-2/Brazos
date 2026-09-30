-- 20260930000900_tomorrow_reminders.sql — idea 6, "Tomorrow's job reminder": the evening before a
-- hired job's day, both sides get one push with the job and the time; the worker's carries Message
-- and Route, the customer's Message.
--
-- THE DECISION: docs/DECISIONS.md 2026-09-30 entry (1) (docs/SCOPE.md's push-notification line; the
-- run's reading shown to the operator put 6 inside it). The record's §3: "The evening before, both
-- sides get one push with the job, the time and two actions (Message, Route) … a daily cron
-- enqueueing into notification_outbox".
--
-- THE VERSION: 20260930000800_quiet_hours.sql is the newest before it, so this takes 000900. The
-- pgTAP file is supabase/tests/170_tomorrow_reminders.sql.
--
-- THE CLOCK: the marketplace is one neighbourhood (docs/SCOPE.md — "Market: one neighbourhood", in
-- New York), so "tomorrow" is the market's: America/New_York. The schedule runs at 22:00 UTC —
-- 6 pm in summer, 5 pm in winter there — the evening before.
--
-- WHAT THIS FILE DOES, in one transaction:
--   (1) enqueue_tomorrow_reminders(p_today date default null) returns integer — for every job that
--       is ASSIGNED (hired, not started) and scheduled for the day after p_today (the market's
--       today when null), one notification to the customer and one to the worker, through
--       enqueue_notification() (should_notify: ban, block, mute, and each person's own Job updates
--       switch). Type 'job_reminder'; the title "Tomorrow <window> · <job>", the body the other
--       person and the area; data carries the screen (ClientJobDetail / WorkerJob), the job, and
--       the push's action set (categoryId job_reminder_customer / job_reminder_worker — the app
--       registers them; the send-push function passes categoryId through). Deduped per job, person
--       and day, so a second run the same evening sends nothing new. Returns how many jobs it
--       reminded. SECURITY DEFINER; revoked from public, anon and authenticated — the schedule calls
--       it as its owner.
--   (2) install_reminder_schedule() returns text — the settlement schedules' idempotent installer
--       shape (20260910000000): the catalog probe pg_function_present('cron', 'schedule'); on a
--       stack without pg_cron (the local one) it skips with a notice; otherwise it unschedules
--       brazos-tomorrow-reminders by id and schedules it at '0 22 * * *'. EXECUTE to service_role.
--       Called once at the end of this file.
--
-- WHAT THIS FILE DOES NOT TOUCH: job status, assignment, payments, every existing schedule, the
-- outbox's drain. NOT destructive under scripts/staging-scan.sh. Reversible: one corrective migration
-- unschedules the job and drops the two functions.

begin;

-- ---------------------------------------------------------------------------
-- 1. The evening-before reminders.
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_tomorrow_reminders(p_today date default null) returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_tomorrow date := coalesce(p_today, (now() at time zone 'America/New_York')::date) + 1;
  v_job record;
  v_window text;
  v_count integer := 0;
begin
  for v_job in
    select j.id, j.title, j.location, j.client_id, j.assigned_worker_id,
           j.arrival_start_hour, j.arrival_end_hour
    from public.jobs j
    where j.status = 'assigned'
      and j.scheduled_date = v_tomorrow
      and j.assigned_worker_id is not null
  loop
    v_window := case
      when v_job.arrival_start_hour is not null and v_job.arrival_end_hour is not null then
        ' ' || to_char(time '00:00' + make_interval(hours => v_job.arrival_start_hour), 'FMHH12 AM')
        || '–' || to_char(time '00:00' + make_interval(hours => v_job.arrival_end_hour), 'FMHH12 AM')
      else ''
    end;

    -- The customer: who is coming, where; Message.
    perform public.enqueue_notification(
      v_job.client_id,
      v_job.assigned_worker_id,
      'job_updates',
      'job_reminder',
      'Tomorrow' || v_window || ' · ' || left(v_job.title, 80),
      coalesce(public.notify_display_name(v_job.assigned_worker_id), 'Your worker') || coalesce(' · ' || v_job.location, ''),
      jsonb_build_object('screen', 'ClientJobDetail', 'jobId', v_job.id::text, 'categoryId', 'job_reminder_customer'),
      'job_reminder:' || v_job.id::text || ':' || v_job.client_id::text || ':' || v_tomorrow::text
    );

    -- The worker: for whom, where; Message and Route.
    perform public.enqueue_notification(
      v_job.assigned_worker_id,
      v_job.client_id,
      'job_updates',
      'job_reminder',
      'Tomorrow' || v_window || ' · ' || left(v_job.title, 80),
      coalesce(public.notify_display_name(v_job.client_id), 'Your customer') || coalesce(' · ' || v_job.location, ''),
      jsonb_build_object('screen', 'WorkerJob', 'jobId', v_job.id::text, 'categoryId', 'job_reminder_worker'),
      'job_reminder:' || v_job.id::text || ':' || v_job.assigned_worker_id::text || ':' || v_tomorrow::text
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.enqueue_tomorrow_reminders(date) from public, anon, authenticated;

comment on function public.enqueue_tomorrow_reminders(date) is
  'Idea 6 (2026-09-30): the evening before an assigned job''s scheduled day (the market''s, America/New_York), one job_reminder to the customer (Message) and one to the worker (Message, Route) through enqueue_notification; deduped per job, person and day. Returns the jobs reminded. Called by the brazos-tomorrow-reminders schedule.';

-- ---------------------------------------------------------------------------
-- 2. The schedule: 22:00 UTC, the evening before, where pg_cron exists.
-- ---------------------------------------------------------------------------
create or replace function public.install_reminder_schedule() returns text
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_stale bigint;
begin
  if not public.pg_function_present('cron', 'schedule') then
    raise notice 'tomorrow_reminders: pg_cron absent (local stack) — schedule skipped';
    return 'skipped: pg_cron absent';
  end if;

  -- By jobid: cron.unschedule has a (bigint) and a (name) overload.
  for v_stale in select j.jobid from cron.job j where j.jobname = 'brazos-tomorrow-reminders'
  loop
    perform cron.unschedule(v_stale);
  end loop;

  perform cron.schedule('brazos-tomorrow-reminders', '0 22 * * *',
                        $cron$select public.enqueue_tomorrow_reminders();$cron$);

  return 'scheduled: brazos-tomorrow-reminders';
end
$fn$;

revoke all on function public.install_reminder_schedule() from public, anon, authenticated;
grant execute on function public.install_reminder_schedule() to service_role;

comment on function public.install_reminder_schedule() is
  'Idea 6: schedules brazos-tomorrow-reminders at 22:00 UTC where pg_cron exists (the settlement schedules'' idempotent shape); skips with a notice on a stack without it.';

select public.install_reminder_schedule();

commit;
