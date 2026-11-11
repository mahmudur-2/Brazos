-- 20261111100200_unpaid_hire_close.sql — ledger B4: a hire nobody pays is closed by the server.
-- Spec: docs/critical/job-lifecycle.md, B4, in the "always close" form the orchestrator chose.
--
-- WHAT WAS WRONG. expire_unfunded_payments() voids a lapsed checkout and touches no job, and a hire
-- with no checkout started has no payment row at all. Either way the job stayed assigned for ever:
-- the work cannot start without a held payment, and the stuck job blocked both accounts' deletion.
--
-- WHAT CHANGES. close_unpaid_hires(p_now) (service_role; the 15-minute timer, installed by
-- install_lifecycle_schedules() in 20261111100300). It closes a job that is
--   * assigned, hired more than 24 hours before p_now (the agreement's accepted_at, or the accepted
--     offer's updated_at for a job hired before agreements existed),
--   * with no job_payment row other than unfunded, failed or voided (money on the job keeps it),
--   * and no unfunded row whose funding_due_at is still ahead (a started checkout keeps its own
--     24 hours, so about 48 hours at most).
-- Per job: the job row is locked first (skip locked), then its job_payment rows (lock order jobs,
-- then payments), and the conditions are read again after the locks. Unfunded rows become voided
-- ('job closed: not paid in time'; a charge landing later on a voided row is refunded by
-- apply_payment_event's funded_after_void path). The job becomes cancelled with cancel_reason
-- 'unpaid', closed by nobody (cancelled_by null), as cancel_job() writes the other columns. The
-- existing cancel trigger declines pending offers. Each side gets one notice, with no amount.
-- Nothing is re-opened. p_now moves the clock the rules read (tests); the stamps written are now().
--
-- A repeat visit reaches assigned only through accept_offer, and its customer is told to pay in the
-- same transaction (series_confirm, 20260930001200_hire_from_push.sql), so the 24 hours count from
-- when the customer is told; no special case.
--
-- Additive under scripts/staging-scan.sh. Reversible: a corrective migration removes the function.

begin;

create or replace function public.close_unpaid_hires(p_now timestamptz default null)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_now  timestamptz := coalesce(p_now, now());
  v_id   uuid;
  v_job  public.jobs;
  v_done integer := 0;
begin
  for v_id in
    select j.id from public.jobs j
     where j.status = 'assigned'
       and coalesce((select a.accepted_at from public.job_agreements a where a.job_id = j.id),
                    (select o.updated_at from public.job_offers o where o.id = j.accepted_offer_id))
           < v_now - interval '24 hours'
  loop
    select * into v_job from public.jobs where id = v_id and status = 'assigned' for update skip locked;
    continue when not found;

    perform 1 from public.payments where job_id = v_id and kind = 'job_payment' for update;
    continue when exists (
      select 1 from public.payments p
       where p.job_id = v_id and p.kind = 'job_payment'
         and (p.status not in ('unfunded', 'failed', 'voided')
              or (p.status = 'unfunded' and p.funding_due_at > v_now)));

    update public.payments
       set status = 'voided', last_error = 'job closed: not paid in time', updated_at = now()
     where job_id = v_id and kind = 'job_payment' and status = 'unfunded';

    update public.jobs
       set status = 'cancelled'::public.job_status,
           cancelled_at = now(),
           cancelled_by = null,
           cancel_reason = 'unpaid'
     where id = v_id;

    perform public.enqueue_notification(
      v_job.client_id, null, 'jobs', 'job_cancelled',
      'Your job was closed',
      left(v_job.title, 60) || ': it was not paid within 24 hours of the hire. Post it again when you are ready.',
      jsonb_build_object('screen', 'ClientJobDetail', 'jobId', v_id::text),
      'job_closed:' || v_id::text || ':' || v_job.client_id::text
    );
    perform public.enqueue_notification(
      v_job.assigned_worker_id, null, 'jobs', 'job_cancelled',
      'A job was closed',
      left(v_job.title, 60) || ': the customer did not pay within 24 hours of the hire.',
      jsonb_build_object('screen', 'WorkerJob', 'jobId', v_id::text),
      'job_closed:' || v_id::text || ':' || v_job.assigned_worker_id::text
    );

    v_done := v_done + 1;
  end loop;
  return v_done;
end
$fn$;
revoke all on function public.close_unpaid_hires(timestamptz) from public, anon, authenticated;
grant execute on function public.close_unpaid_hires(timestamptz) to service_role;
comment on function public.close_unpaid_hires(timestamptz) is
  'B4: closes an assigned job hired more than 24 hours ago that has no money on it and no checkout window still ahead. Voids its unfunded job_payment rows, sets cancelled with cancel_reason unpaid and cancelled_by null, tells each side once with no amount. Never re-opens. Returns the number closed. service_role only; pg_cron every 15 minutes (install_lifecycle_schedules). p_now is for tests.';

commit;
