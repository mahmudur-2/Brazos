-- unpaid_pause — production-36h S4, step A: a hire is never closed for not being paid while the
-- customer cannot pay.
--
-- WHAT WAS WRONG. close_unpaid_hires() (20261111100200_unpaid_hire_close.sql) closes an assigned
-- job 24 hours after the hire when no money is on it. While payments are paused (the
-- paymentsEnabled key), begin_job_payment refuses every checkout ('Payments are paused right now.
-- Please try again shortly.'), yet the sweep kept closing: a customer who could not pay lost the
-- hire. And when payments came back on, every hire older than 24 hours closed at the next run, with
-- no time left to pay.
--
-- WHAT CHANGES.
-- 1. app_config.updated_at becomes a trustworthy change time: a BEFORE UPDATE trigger writes now()
--    whenever a row's value changes (an update that leaves the value as it was keeps the time).
--    Until now nothing maintained it: it held the row's insert time. Flipping a switch is one
--    UPDATE (20260905000000_stripe_foundation.sql:304), so the time payments came back on is the
--    paymentsEnabled row's updated_at while its value is true.
--    ONE-TIME INSTALLATION GRACE (A-fix): before this file the row's updated_at said nothing about
--    a resume, so when payments are on at install their change time is set to the install time:
--    the first sweeps give every unpaid hire a full 24 hours. A7-05: a missing paymentsEnabled
--    row is created as on (true) at the install time; an existing row keeps its value.
-- 2. close_unpaid_hires(p_now): the 20261111100200 body, with two rules first, both on ONE read of
--    the switch (value and change time together, for share: held to the end of the run, so a pause
--    cannot commit half way through it):
--    * payments paused, read exactly as begin_job_payment reads it (absent key = on; only the
--      jsonb boolean true is on): it closes nothing;
--    * payments back on less than 24 hours before p_now: it closes nothing yet. Together with the
--      per-job rule this is: a job closes once p_now is past the later of (hire + 24 hours) and
--      (payments back on + 24 hours).
--    TIMER: each way out of a run ends by reporting it, record_timer_run(the cron job's name
--    'close-unpaid-hires', no error, late after 60 minutes = four 15-minute runs) (attention_plain),
--    so a timer that stopped is a timer_late line on payment_attention. A paused run and a run in
--    the 24 hours report too: the timer works, it only waits, so the owner's list stays quiet. The
--    sweep runs as its owner, which owns record_timer_run too: no grant is needed or added.
--    A7-06: the report goes through report_timer_run (release_clock 5b), so an error in the report
--    is a warning and never undoes the run's closes. Limit: a cancelled statement (a timeout) is
--    not caught.
--    Everything else (the locks, the money check, the void, the notices and their words, the
--    signature, the grants) is unchanged; the grants and the comment are restated.
-- LIMIT, NAMED. A resume made by deleting the paymentsEnabled row leaves no change time (absent =
-- on): such a resume gets no 24-hour grace. The supported flip is the UPDATE.
--
-- Additive under scripts/staging-scan.sh. Proof: supabase/tests/491_unpaid_pause.sql.

begin;

-- 1. The change time.
create or replace function public.app_config_touch() returns trigger
language plpgsql security invoker
set search_path = public, pg_temp
as $fn$
begin
  if new.value is distinct from old.value then
    new.updated_at := now();
  end if;
  return new;
end
$fn$;
revoke all on function public.app_config_touch() from public, anon, authenticated, service_role;
comment on function public.app_config_touch() is
  'Trigger on app_config: a changed value writes updated_at = now(), so updated_at is when the switch last changed (unpaid_pause). No caller grant.';

drop trigger if exists app_config_touch on public.app_config;
create trigger app_config_touch
  before update on public.app_config
  for each row
  execute function public.app_config_touch();

comment on column public.app_config.updated_at is
  'When this setting''s value last changed (app_config_touch, from the unpaid_pause migration; before it, the row''s insert time, except paymentsEnabled, set to the install time when on). close_unpaid_hires() reads paymentsEnabled''s as the moment payments came back on.';

-- 1b. The one-time installation grace: payments on at install count as back on now. A paused
-- switch keeps its time; it gets the grace when it is turned back on (the trigger above).
-- A7-05: a missing paymentsEnabled row is created as on (true) at the install time; an existing
-- row keeps its value (the update below).
insert into public.app_config (key, value, updated_at) values ('paymentsEnabled', 'true'::jsonb, now())
  on conflict (key) do nothing;
update public.app_config set updated_at = now()
 where key = 'paymentsEnabled' and value = 'true'::jsonb;

-- 2. The sweep waits while the customer cannot pay, and 24 hours after they can again.
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
  v_on   jsonb;
  v_back timestamptz;
begin
  -- THE SWITCH, read once: its value and change time together, for share (held to the end of the
  -- run, so a pause cannot commit half way through it). No row: payments are on, with no change time.
  select c.value, c.updated_at into v_on, v_back
    from public.app_config c
   where c.key = 'paymentsEnabled'
     for share;
  -- Payments paused (begin_job_payment's reading: only the jsonb boolean true is on): nobody can
  -- pay, so nothing closes.
  if found and v_on is distinct from 'true'::jsonb then
    perform public.report_timer_run('close-unpaid-hires', interval '60 minutes');   -- TIMER
    return 0;
  end if;
  -- Payments back on: a full 24 hours to pay before anything closes.
  if v_back is not null and v_back > v_now - interval '24 hours' then
    perform public.report_timer_run('close-unpaid-hires', interval '60 minutes');   -- TIMER
    return 0;
  end if;

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
  -- TIMER: this run is reported as the last statement (the owner's list: timer_late after 60 minutes).
  perform public.report_timer_run('close-unpaid-hires', interval '60 minutes');
  return v_done;
end
$fn$;
revoke all on function public.close_unpaid_hires(timestamptz) from public, anon, authenticated;
grant execute on function public.close_unpaid_hires(timestamptz) to service_role;
comment on function public.close_unpaid_hires(timestamptz) is
  'B4: closes an assigned job hired more than 24 hours ago that has no money on it and no checkout window still ahead. Voids its unfunded job_payment rows, sets cancelled with cancel_reason unpaid and cancelled_by null, tells each side once with no amount. Never re-opens. Closes nothing while payments are paused, nor in the 24 hours after they come back on (unpaid_pause), both read from one share-locked read of the paymentsEnabled row. Returns the number closed. service_role only; pg_cron every 15 minutes (install_lifecycle_schedules). p_now is for tests.';

commit;
