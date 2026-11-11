-- 20261111100300_open_job_expiry.sql — ledger B15: an open job nobody is hired for is closed.
-- Spec: docs/critical/job-lifecycle.md, B15. Also the timer for B4's sweep.
--
-- WHAT WAS WRONG. Nothing but its owner ever closed an open job: an old one stayed in every feed
-- and on the owner's list for ever.
--
-- WHAT CHANGES.
-- 1. expire_open_jobs(p_now) (service_role, hourly). It closes a job that is open on the open
--    market (status 'open', visibility 'open_market') when
--      * it has a date and p_now is more than 24 hours past its arrival window end
--        (job_window_end), so a same-day job and a 90-minute phone test run are never cut short; or
--      * it has no date and was posted more than 30 days before p_now.
--    Close = cancelled, cancel_reason 'expired', cancelled_by null, as cancel_job() writes the other
--    columns; the existing cancel trigger declines its pending offers. The owner is told once, with
--    no amount. Drafts, hire requests (direct) and hired jobs are never touched. p_now moves the
--    clock the rules read (tests); the stamps written are now().
-- 2. install_lifecycle_schedules(): the newest installer pattern (lean_v1's install_push_schedule):
--    skips with a notice where pg_cron is absent, unschedules its own names by jobid, schedules
--      close-unpaid-hires  */15 * * * *  close_unpaid_hires()  (B4, 20261111100200)
--      expire-open-jobs    7 * * * *     expire_open_jobs()
--    then runs once.
--
-- Additive under scripts/staging-scan.sh. Reversible: a corrective migration unschedules the two
-- names and removes the functions.

begin;

create or replace function public.expire_open_jobs(p_now timestamptz default null)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_now  timestamptz := coalesce(p_now, now());
  v_job  public.jobs;
  v_done integer := 0;
begin
  for v_job in
    select j.* from public.jobs j
     where j.status = 'open' and j.visibility = 'open_market'
       and (
         (j.scheduled_date is not null
          and public.job_window_end(j.scheduled_date, j.arrival_end_hour) < v_now - interval '24 hours')
         or (j.scheduled_date is null and j.created_at < v_now - interval '30 days')
       )
     for update of j skip locked
  loop
    update public.jobs
       set status = 'cancelled'::public.job_status,
           cancelled_at = now(),
           cancelled_by = null,
           cancel_reason = 'expired'
     where id = v_job.id;

    perform public.enqueue_notification(
      v_job.client_id, null, 'jobs', 'job_cancelled',
      'Your job was closed',
      left(v_job.title, 60) || ': no worker was hired in time. Post it again when you are ready.',
      jsonb_build_object('screen', 'ClientJobDetail', 'jobId', v_job.id::text),
      'job_closed:' || v_job.id::text || ':' || v_job.client_id::text
    );

    v_done := v_done + 1;
  end loop;
  return v_done;
end
$fn$;
revoke all on function public.expire_open_jobs(timestamptz) from public, anon, authenticated;
grant execute on function public.expire_open_jobs(timestamptz) to service_role;
comment on function public.expire_open_jobs(timestamptz) is
  'B15: closes an open market job nobody was hired for: a dated one 24 hours after its arrival window ends, an undated one 30 days after it was posted. cancel_reason expired, cancelled_by null; pending offers are declined by the cancel trigger; the owner is told once with no amount. Returns the number closed. service_role only; pg_cron hourly (install_lifecycle_schedules). p_now is for tests.';

create or replace function public.install_lifecycle_schedules() returns text
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_names text[] := array['close-unpaid-hires', 'expire-open-jobs'];
  v_stale bigint;
begin
  if not public.pg_function_present('cron', 'schedule') then
    raise notice 'lifecycle: pg_cron absent (local stack) — schedules skipped';
    return 'skipped: pg_cron absent';
  end if;

  -- By jobid: cron.unschedule has a (bigint) and a (name) overload.
  for v_stale in select j.jobid from cron.job j where j.jobname = any (v_names)
  loop
    perform cron.unschedule(v_stale);
  end loop;

  perform cron.schedule('close-unpaid-hires', '*/15 * * * *',
                        $cron$select public.close_unpaid_hires();$cron$);
  perform cron.schedule('expire-open-jobs', '7 * * * *',
                        $cron$select public.expire_open_jobs();$cron$);

  return 'scheduled: ' || array_to_string(v_names, ', ');
end
$fn$;
revoke all on function public.install_lifecycle_schedules() from public, anon, authenticated;
grant execute on function public.install_lifecycle_schedules() to service_role;
comment on function public.install_lifecycle_schedules() is
  'Schedules the job lifecycle sweeps where pg_cron exists: close-unpaid-hires every 15 minutes (B4) and expire-open-jobs hourly at minute 7 (B15). Idempotent: unschedules its own names by jobid first and touches no other job. Skips with a notice on a stack without pg_cron. service_role only.';

select public.install_lifecycle_schedules();

commit;
