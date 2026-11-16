-- release_clock — production-36h S4, step A: the automatic approval deadline follows the approved
-- Terms (lib/legal/termsOfService.ts:146-150): 72 hours after the customer is told the work is
-- complete, and in any case 7 days (168 hours) after the work was marked complete, unless an
-- issue, a card dispute, a refund or a reversed transfer holds the payment.
--
-- WHAT WAS WRONG. auto_release_due_payments() (20260930000100_auto_release_told_gate.sql) counted
-- the 72 hours from completion and used "told" only as a gate. A customer whose completion notice
-- became final 60 hours after completion had 12 hours, not 72. The app had no server answer for
-- the deadline at all; it computed its own 72-hour fallback.
--
-- WHAT CHANGES (all additive; no signature or result shape changes).
-- 1. jobs.completion_told_at: the moment the customer's job_completed notice reached a final state
--    (sent, skipped or failed). Written once, never moved. Null: not told yet.
-- 2. stamp_completion_told(): an AFTER INSERT OR UPDATE OF status trigger on notification_outbox,
--    for job_completed rows reaching a final state, whatever writes the status
--    (resolve_notification, claim_notification_batch, a later writer). It matches the row exactly
--    as the old told gate did: recipient = the job's customer, data.jobId = the job.
-- 3. fill_completion_told_at(): fills the column for notices that were final before this file,
--    only on a job that can still need the clock: completed, its job payment still held with no
--    release requested (a paid or refunded job gets no write). The time: a sent notice's sent_at;
--    any other final notice (skipped, failed, or sent with no sent_at) the fill's own time, since
--    its true final moment is unknown: so no older job gets less than told + 72 hours from the
--    install, and the 7-day cap still bounds it. Owner only; nulls only; safe to run twice. It runs
--    in its OWN migration, release_clock_fill, so this file's ALTER TABLE lock ends first.
-- 4. auto_approval_deadline(job id): THE RULE, in one place. The earlier of told + 72 hours and
--    completion + 168 hours; null whenever automatic approval cannot happen: the job is not
--    completed, its job payment is not a held stripe row, release was already requested, a card
--    dispute, a refund or a reversed transfer is recorded, or an issue report is open. Hours, not
--    days, so a clock change never makes 7 days 167 or 169 hours. Owner only. A7-08: and null
--    when the release it would write (amount - worker fee) is above what transfers_due pays
--    (charge - payment_refund_reserved_cents, the reservation shared): a recorded failed refund
--    reserves the whole charge, so its payment is never approved automatically.
-- 5. release_due_at(jobs): the app's field (a PostgREST computed field). For the job's customer and
--    hired worker it returns auto_approval_deadline(job); for anyone else null. SECURITY DEFINER
--    because the rule reads payments.chargeback_at and payments.transfer_reversed_at, which
--    authenticated may not select (20261112010800_payments_column_grants.sql). Cost per listed job:
--    a job that is not completed returns at once, with no read; a completed one reads the job by
--    primary key twice, its active job payment through payments_one_active_per_job_kind, and its
--    open report through job_disputes_one_open_per_job.
-- 6. auto_release_due_payments(): LOCK, THEN DECIDE. Each candidate payment row is locked (for
--    update skip locked: a row another writer holds waits for the next run, 10 minutes later), then
--    the rule is read again in a new statement, after the lock, and the write happens only when it
--    still says due. A customer's approval, an issue or a refund committed while the sweep waited
--    is never written over. The write, the signature, the grants (restated) and the cron are
--    unchanged. TIMER: the run's last statement reports it, record_timer_run(the cron job's name
--    'auto-release-due-payments', no error, late after 40 minutes = four 10-minute runs)
--    (attention_plain), so a timer that stopped is a timer_late line on payment_attention. The
--    sweep runs as its owner, which owns record_timer_run too: no grant is needed or added.
--    A7-06: the report goes through report_timer_run (5b, new, owner only), which catches an
--    error in the report as a warning, so a failed report never undoes the run's releases. Limit:
--    a cancelled statement (a timeout) is not caught.
--
-- NO CUSTOMER GETS LESS TIME. The notice is written in the completion transaction, so told is never
-- before completion: told + 72 hours is never before completion + 72 hours, the old moment. A
-- notice that is never final keeps the 7-day fallback, as before.
--
-- Additive under scripts/staging-scan.sh. Proof: supabase/tests/490_release_clock.sql.

begin;

-- 1. The told time.
alter table public.jobs add column if not exists completion_told_at timestamptz;
comment on column public.jobs.completion_told_at is
  'When the customer''s job_completed notice reached a final state (sent, skipped or failed): the start of the 72 hours in auto_approval_deadline(). Written once by stamp_completion_told(); for a notice already final at install, by fill_completion_told_at() (its sent_at when sent, else the install time, its true final moment being unknown); null until then.';

-- 2. The stamp.
create or replace function public.stamp_completion_told() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
begin
  -- A key that is not a uuid names no job; it must never make the drain's write fail.
  if new.data ->> 'jobId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    update public.jobs j
       set completion_told_at = now()
     where j.id = (new.data ->> 'jobId')::uuid
       and j.client_id = new.recipient_id
       and j.completion_told_at is null;
  end if;
  return null;
end
$fn$;
revoke all on function public.stamp_completion_told() from public, anon, authenticated, service_role;
comment on function public.stamp_completion_told() is
  'Trigger on notification_outbox: when the customer''s job_completed notice reaches sent, skipped or failed, writes jobs.completion_told_at = now() once. No caller grant.';

drop trigger if exists notification_outbox_completion_told on public.notification_outbox;
create trigger notification_outbox_completion_told
  after insert or update of status on public.notification_outbox
  for each row
  when (new.type = 'job_completed' and new.status in ('sent', 'skipped', 'failed'))
  execute function public.stamp_completion_told();

-- 3. The fill for notices that were final before this file (run by release_clock_fill).
create or replace function public.fill_completion_told_at() returns integer
language plpgsql security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_n integer;
begin
  update public.jobs j
     set completion_told_at = t.told_at
    from (select o.recipient_id,
                 (o.data ->> 'jobId')::uuid as job_id,
                 -- A sent notice's own time; any other final one is counted from now (the install):
                 -- its true final moment is unknown, and an earlier guess would shorten the 72 hours.
                 min(case when o.status = 'sent' and o.sent_at is not null then o.sent_at else now() end) as told_at
            from public.notification_outbox o
           where o.type = 'job_completed'
             and o.status in ('sent', 'skipped', 'failed')
             and o.data ->> 'jobId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           group by o.recipient_id, (o.data ->> 'jobId')::uuid) t
   where j.id = t.job_id
     and j.client_id = t.recipient_id
     and j.completion_told_at is null
     -- Only a job that can still need the clock: completed, its job payment held, no release asked.
     and j.status = 'completed'
     and exists (select 1 from public.payments p
                  where p.job_id = j.id and p.kind = 'job_payment'
                    and p.status = 'held' and p.release_requested_at is null);
  get diagnostics v_n = row_count;
  return v_n;
end
$fn$;
revoke all on function public.fill_completion_told_at() from public, anon, authenticated, service_role;
comment on function public.fill_completion_told_at() is
  'Owner only. Fills jobs.completion_told_at for job_completed notices that were final before the release_clock migration, on completed jobs whose job payment is still held with no release requested (no write to a paid or refunded job): sent_at for a sent notice, now() (the install) for any other final one, whose true final moment is unknown. Only null values are filled; safe to run twice; returns how many. Run by the release_clock_fill migration.';

-- 4. The rule.
create or replace function public.auto_approval_deadline(p_job_id uuid) returns timestamptz
language sql stable security invoker
set search_path = public, pg_temp
as $fn$
  select least(j.completion_told_at + interval '72 hours',
               j.completed_at + interval '168 hours')
    from public.jobs j
    join public.payments p
      on p.job_id = j.id and p.kind = 'job_payment' and p.status = 'held'
   where j.id = p_job_id
     and j.status = 'completed'
     and j.completed_at is not null
     and p.provider = 'stripe'
     and p.release_requested_at is null
     and p.chargeback_at is null
     and coalesce(p.refund_cents, 0) = 0
     -- A7-08: the release the sweep writes must be one transfers_due pays (its reservation, shared:
     -- a recorded failed refund reserves the whole charge).
     and p.amount_cents - p.platform_fee_cents <= p.charge_amount_cents - public.payment_refund_reserved_cents(p)
     and p.transfer_reversed_at is null
     and not exists (select 1 from public.job_disputes d
                      where d.job_id = j.id and d.status = 'open')
$fn$;
revoke all on function public.auto_approval_deadline(uuid) from public, anon, authenticated, service_role;
comment on function public.auto_approval_deadline(uuid) is
  'THE automatic approval deadline (Terms 146-150): the earlier of completion_told_at + 72 hours and completed_at + 168 hours. Null when automatic approval cannot happen: not completed, no held stripe job payment, release already requested, a card dispute, a refund or a reversed transfer recorded, an open issue report, or a refund reservation that leaves the transfer above what transfers_due pays (payment_refund_reserved_cents; A7-08: a recorded failed refund reserves the whole charge). auto_release_due_payments() and release_due_at() both read it; nothing else restates it. Owner only.';

-- 5. The app's field.
create or replace function public.release_due_at(p_job public.jobs) returns timestamptz
language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
begin
  -- Only a completed job can have a deadline; nothing is read for any other row.
  if p_job.id is null or p_job.status is distinct from 'completed'::public.job_status then
    return null;
  end if;
  -- The job's two parties only, judged on the stored row, never on the row passed in.
  if not exists (select 1 from public.jobs j
                  where j.id = p_job.id
                    and auth.uid() in (j.client_id, j.assigned_worker_id)) then
    return null;
  end if;
  return public.auto_approval_deadline(p_job.id);
end
$fn$;
revoke all on function public.release_due_at(public.jobs) from public, anon, authenticated, service_role;
grant execute on function public.release_due_at(public.jobs) to authenticated;
comment on function public.release_due_at(public.jobs) is
  'The automatic approval deadline of a job, for its customer and its hired worker (a computed field: select release_due_at on jobs). Null for anyone else, and whenever auto_approval_deadline() is null, so the app never shows a moment that will not come. Raises nothing.';

-- 5b. The isolated timer report (A7-06): a failed report never undoes the run it reports.
create or replace function public.report_timer_run(p_name text, p_stale_after interval) returns void
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  perform public.record_timer_run(p_name, null, p_stale_after);
exception when others then
  raise warning 'report_timer_run %: %', p_name, sqlerrm;
end
$fn$;
revoke all on function public.report_timer_run(text, interval) from public, anon, authenticated, service_role;
comment on function public.report_timer_run(text, interval) is
  'A7-06: reports a finished timer run, record_timer_run(p_name, no error, p_stale_after), in its own block: an error in the report is a warning (the name and the error text) and the run it reports is kept. Limit: a cancelled statement (a timeout or a cancel request) is not caught and still undoes the run. Called as the last statement of each way out of auto_release_due_payments, close_unpaid_hires and advance_job_series. Owner only.';

-- 6. The sweep reads the rule: lock, then decide.
create or replace function public.auto_release_due_payments() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id  uuid;
  v_job uuid;
  v_due timestamptz;
  v_n   integer := 0;
begin
  -- The candidates, from one read. None is written on this read alone.
  for v_id, v_job in
    select p.id, p.job_id from public.payments p
     where p.kind = 'job_payment' and p.status = 'held'
       and public.auto_approval_deadline(p.job_id) <= now()
  loop
    -- LOCK. A row another writer holds (an approval, an issue, a refund in flight) waits for the
    -- next run, ten minutes later.
    perform 1 from public.payments where id = v_id for update skip locked;
    continue when not found;
    -- THEN DECIDE, in a new statement after the lock: it sees every write committed before the
    -- lock was granted, so a decision made meanwhile is never written over.
    select public.auto_approval_deadline(v_job) into v_due;
    continue when v_due is null or v_due > now();
    update public.payments p
       set release_requested_at = now(),
           release_reason = 'auto_approved',
           transfer_cents = p.amount_cents - p.platform_fee_cents,
           updated_at = now()
     where p.id = v_id;
    v_n := v_n + 1;
  end loop;
  -- TIMER: this run is reported as the last statement (the owner's list: timer_late after 40 minutes).
  perform public.report_timer_run('auto-release-due-payments', interval '40 minutes');
  return v_n;
end $$;
revoke all on function public.auto_release_due_payments() from public, anon, authenticated;
grant execute on function public.auto_release_due_payments() to service_role;
comment on function public.auto_release_due_payments() is
  'Requests the transfer (release_reason auto_approved, transfer_cents = amount - worker fee; the row stays held for the transfer) of every held job payment whose auto_approval_deadline() has passed: 72 hours after the customer was told the work is complete, and at the latest 168 hours after completion, never while an issue, a card dispute, a refund or a reversed transfer holds it (release_clock). Each row is locked (skip locked) and the rule read again after the lock before the write. service_role only; pg_cron every 10 minutes.';

-- The fill for notices already final runs in its own migration, release_clock_fill, after this
-- file has committed (so the ALTER TABLE lock above is gone). The trigger covers every later one.

commit;
