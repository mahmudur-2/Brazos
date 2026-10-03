-- 20261003000200_reminders_payment_gate.sql — FIX-RUN A13 (2026-10-03): the evening-before reminder
-- follows the payment.
--
-- THE GAP. enqueue_tomorrow_reminders() (20260930000900) reminded both people of every assigned job
-- scheduled for tomorrow whether or not the customer had protected the payment. The worker was told
-- "Tomorrow 9 AM–11 AM" for a job they cannot start — transition_job_status() refuses
-- assigned → in_progress on an unheld row — and the customer was reminded of the visit, not of the
-- one thing it waits on.
--
-- THE FIX. Same loop, one gate: a job_payment row held in protection.
--   held     → exactly the two reminders of 20260930000900, byte for byte (title, body, data, key);
--   not held → the worker gets nothing, and the customer gets "Protect the payment" instead —
--              same type, same preference, same dedupe key (one reminder per person per day, whichever
--              shape it takes), opening the job with intent 'checkout' so the tap lands in Checkout.
-- Status gate allow-listed (`status = 'held'`, never a block-list — CLAUDE.md §Supabase). Only the
-- function body changes; the schedule, its installer and every ACL stay as 20260930000900 left them.
--
-- NOT DESTRUCTIVE under scripts/staging-scan.sh. Reversible: one corrective migration restores the
-- 20260930000900 body.

create or replace function public.enqueue_tomorrow_reminders(p_today date default null) returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_tomorrow date := coalesce(p_today, (now() at time zone 'America/New_York')::date) + 1;
  v_job record;
  v_window text;
  v_held boolean;
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

    -- A13: the gate. Held in protection, or not yet.
    v_held := exists (
      select 1 from public.payments p
       where p.job_id = v_job.id and p.kind = 'job_payment' and p.status = 'held'
    );

    if v_held then
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
    else
      -- Unpaid: the customer is reminded of the one thing tomorrow waits on; the worker is not
      -- reminded of a job they cannot start. Same dedupe key as the held shape — one per day.
      perform public.enqueue_notification(
        v_job.client_id,
        v_job.assigned_worker_id,
        'job_updates',
        'job_reminder',
        'Tomorrow' || v_window || ' · Protect the payment',
        coalesce(public.notify_display_name(v_job.assigned_worker_id), 'Your worker')
          || ' can start ' || left(v_job.title, 60) || ' once the payment is protected.',
        jsonb_build_object('screen', 'ClientJobDetail', 'jobId', v_job.id::text, 'intent', 'checkout', 'categoryId', 'job_reminder_customer'),
        'job_reminder:' || v_job.id::text || ':' || v_job.client_id::text || ':' || v_tomorrow::text
      );
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.enqueue_tomorrow_reminders(date) from public, anon, authenticated;

comment on function public.enqueue_tomorrow_reminders(date) is
  'Idea 6 (2026-09-30): the evening before an assigned job''s scheduled day (the market''s, America/New_York), one job_reminder to the customer (Message) and one to the worker (Message, Route) through enqueue_notification; deduped per job, person and day. A13 (2026-10-03): only while the job_payment is held — unpaid, the worker gets nothing and the customer gets "Protect the payment" (intent checkout) under the same dedupe key. Returns the jobs reminded. Called by the brazos-tomorrow-reminders schedule.';
