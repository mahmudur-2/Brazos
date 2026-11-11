-- 20261111100000_lifecycle_shared.sql — ledger B4, B8, B15, B24: what the job lifecycle fixes share.
-- Spec: docs/critical/job-lifecycle.md.
--
-- 1. jobs_cancel_reason_known widened with the three reasons only the server writes:
--      worker_no_show  cancel_job() decides it when the customer cancels after the worker missed the
--                      arrival window (B8); the hourly sweep writes it when nobody cancels (B24)
--      unpaid          the 15-minute sweep closes a hire not paid 24 hours after the hire (B4)
--      expired         the hourly sweep closes an open job nobody was hired for (B15)
--    cancel_job()'s own allow-list of client reasons is unchanged: a client can never send these.
--    The list is restated on the newest one (stripe_foundation's three), in the widen-a-CHECK form
--    of 20261003000100_ban_refund.sql.
-- 2. job_window_end(date, end hour): when a job's arrival window ends, New York time; null with no
--    date. The formula cancel_job() had inline for the no-show gate (lean_v1), now one home for
--    cancel_job, the worker no-show line and the open-job expiry.
--
-- Additive under scripts/staging-scan.sh. Reversible by one corrective migration.

begin;

alter table public.jobs drop constraint if exists jobs_cancel_reason_known;
alter table public.jobs add constraint jobs_cancel_reason_known
  check (cancel_reason is null or cancel_reason in
    ('customer_cancelled', 'worker_cancelled', 'customer_no_show', 'worker_no_show', 'unpaid', 'expired'));
comment on column public.jobs.cancel_reason is
  'Why the job was cancelled. From cancel_job(): customer_cancelled, worker_cancelled, customer_no_show (the caller''s reason), or worker_no_show (the server''s, when the customer cancels after the worker missed the window). From the server sweeps, closed by nobody: unpaid, expired, worker_no_show. NULL for the two direct writers (ban_user, delete_my_account) and for jobs never cancelled. A cancelled job is terminal.';

create or replace function public.job_window_end(p_scheduled_date date, p_arrival_end_hour smallint)
returns timestamptz
language sql stable
set search_path = public, pg_temp
as $fn$
  select case when p_scheduled_date is not null then
    (p_scheduled_date::timestamp + make_interval(hours => coalesce(p_arrival_end_hour, 24)::int))
      at time zone 'America/New_York'
  end
$fn$;
revoke all on function public.job_window_end(date, smallint) from public, anon, authenticated;
comment on function public.job_window_end(date, smallint) is
  'When a job''s arrival window ends, New York time: the date plus the end hour (24, midnight after the day, when there is none). Null with no date. Server helper for cancel_job, worker_missed_window and expire_open_jobs; no client grant.';

commit;
