-- 20261111100400_no_show_close.sql — ledger B24: a paid job the worker never came to is closed.
--
-- THE GAP (found while building B8). A dated job that is assigned, paid (held) and never marked
-- arrived ended only when the customer cancelled. A customer who never opened the app again left
-- the money held for ever: auto_release_due_payments() reads completed jobs only, and nothing else
-- moves an assigned job.
--
-- WHAT CHANGES.
-- 1. close_no_show_hires(p_now) (service_role, hourly). It closes a job when
--    worker_missed_window(job, p_now - 24 hours) holds (assigned, never marked arrived, dated, 24
--    hours past the window end plus the worker's reported delay) and its job payment is held. The
--    money is the customer's free no-show cancel's, through the same function cancel_job() calls,
--    queue_free_cancel_refund(): the whole charge refunded, nothing transferred, no fee. The job
--    becomes cancelled with cancel_reason 'worker_no_show', closed by nobody (cancelled_by null);
--    the existing cancel trigger declines pending offers. Each side is told once, with no amount.
--    Lock order: the job row (skip locked), then its payment. An unpaid hire is not this sweep's
--    (close_unpaid_hires, B4); a job with no date or with an arrival is never touched.
--    p_now moves the clock the rules read (tests); the stamps written are now().
-- 2. install_lifecycle_schedules() replaced (20261111100300's body) with a third name:
--      close-no-show-hires  7 * * * *  close_no_show_hires()
--    then runs once.
--
-- Additive under scripts/staging-scan.sh. Reversible: a corrective migration restores the
-- two-name installer, unschedules close-no-show-hires and removes the function.

begin;

create or replace function public.close_no_show_hires(p_now timestamptz default null)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_now     timestamptz := coalesce(p_now, now());
  v_job     public.jobs;
  v_payment public.payments;
  v_done    integer := 0;
begin
  for v_job in
    select j.* from public.jobs j
     where j.status = 'assigned' and j.arrived_at is null and j.scheduled_date is not null
       and public.worker_missed_window(j, v_now - interval '24 hours')
     for update of j skip locked
  loop
    select * into v_payment from public.payments
     where job_id = v_job.id and kind = 'job_payment' and status = 'held'
     for update;
    continue when not found;

    perform public.queue_free_cancel_refund(v_payment.id);

    update public.jobs
       set status = 'cancelled'::public.job_status,
           cancelled_at = now(),
           cancelled_by = null,
           cancel_reason = 'worker_no_show'
     where id = v_job.id;

    perform public.enqueue_notification(
      v_job.client_id, null, 'jobs', 'job_cancelled',
      'Your job was closed',
      left(v_job.title, 60) || ': the worker did not arrive, so your payment is being refunded in full.',
      jsonb_build_object('screen', 'ClientJobDetail', 'jobId', v_job.id::text),
      'job_closed:' || v_job.id::text || ':' || v_job.client_id::text
    );
    perform public.enqueue_notification(
      v_job.assigned_worker_id, null, 'jobs', 'job_cancelled',
      'A job was closed',
      left(v_job.title, 60) || ': you did not mark that you arrived, so the customer is refunded in full.',
      jsonb_build_object('screen', 'WorkerJob', 'jobId', v_job.id::text),
      'job_closed:' || v_job.id::text || ':' || v_job.assigned_worker_id::text
    );

    v_done := v_done + 1;
  end loop;
  return v_done;
end
$fn$;
revoke all on function public.close_no_show_hires(timestamptz) from public, anon, authenticated;
grant execute on function public.close_no_show_hires(timestamptz) to service_role;
comment on function public.close_no_show_hires(timestamptz) is
  'B24: closes a dated, assigned, held job the worker never marked arrived, 24 hours after the arrival window end plus the reported delay. Money through queue_free_cancel_refund (the customer''s free cancel: full refund, no transfer); cancel_reason worker_no_show, cancelled_by null; each side told once with no amount. Returns the number closed. service_role only; pg_cron hourly (install_lifecycle_schedules). p_now is for tests.';

create or replace function public.install_lifecycle_schedules() returns text
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_names text[] := array['close-unpaid-hires', 'expire-open-jobs', 'close-no-show-hires'];
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
  perform cron.schedule('close-no-show-hires', '7 * * * *',
                        $cron$select public.close_no_show_hires();$cron$);

  return 'scheduled: ' || array_to_string(v_names, ', ');
end
$fn$;
revoke all on function public.install_lifecycle_schedules() from public, anon, authenticated;
grant execute on function public.install_lifecycle_schedules() to service_role;
comment on function public.install_lifecycle_schedules() is
  'Schedules the job lifecycle sweeps where pg_cron exists: close-unpaid-hires every 15 minutes (B4), expire-open-jobs (B15) and close-no-show-hires (B24) hourly at minute 7. Idempotent: unschedules its own names by jobid first and touches no other job. Skips with a notice on a stack without pg_cron. service_role only.';

select public.install_lifecycle_schedules();

commit;
