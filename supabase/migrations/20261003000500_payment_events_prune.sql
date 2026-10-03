-- 20261003000500_payment_events_prune.sql — FIX-RUN A19 (2026-10-03): the 90-day prune the table
-- comment promised, built.
--
-- THE GAP. payment_events.payload carries the provider's raw event — cardholder billing details
-- included. Its comment (20260905000000 §4) said "the sweeper prunes payloads older than 90 days
-- (keeping id/type/processed_at)", and nothing did.
--
-- THE FIX. prune_payment_event_payloads(): every PROCESSED event received more than 90 days ago has
-- its payload replaced by the stub {"id", "type", "pruned_at"} — an UPDATE, never a DELETE: the row
-- stays as the idempotency record (id is the primary key the webhook de-duplicates on), only the
-- payload goes. Unprocessed rows are left whole: a 90-day-old unprocessed event is a defect to look
-- at, not data to shred. Idempotent — a stubbed payload has no "data" key and is never touched
-- again. Scheduled daily where pg_cron exists through install_payment_events_prune(), in the shape of
-- install_reminder_schedule() (20260930000900): by jobid, unschedule then schedule, skip with a
-- notice on the local stack. The table comment now names the function.
--
-- NOT DESTRUCTIVE under scripts/staging-scan.sh (no delete from, no drop, no truncate). Reversible:
-- one corrective migration unschedules the job and drops the two functions.

create or replace function public.prune_payment_event_payloads(p_older_than interval default interval '90 days') returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.payment_events e
     set payload = jsonb_build_object('id', e.id, 'type', e.type, 'pruned_at', now())
   where e.processed_at is not null
     and e.received_at < now() - p_older_than
     and e.payload ? 'data';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.prune_payment_event_payloads(interval) from public, anon, authenticated;
grant execute on function public.prune_payment_event_payloads(interval) to service_role;
comment on function public.prune_payment_event_payloads(interval) is
  'A19 (2026-10-03): replaces the payload of every PROCESSED payment_events row received more than p_older_than ago (default 90 days) with {"id","type","pruned_at"} — the cardholder billing details go, the idempotency record stays. An UPDATE, never a DELETE; unprocessed rows are left whole; idempotent. Returns the rows pruned. Called daily by the brazos-prune-payment-events schedule.';

comment on table public.payment_events is
  'Raw provider events. The payload carries cardholder billing details — service_role only, and prune_payment_event_payloads() (A19) replaces payloads older than 90 days with {"id","type","pruned_at"} once processed, keeping the row as the idempotency record.';

create or replace function public.install_payment_events_prune() returns text
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_stale bigint;
begin
  if not public.pg_function_present('cron', 'schedule') then
    raise notice 'payment_events_prune: pg_cron absent (local stack) — schedule skipped';
    return 'skipped: pg_cron absent';
  end if;

  -- By jobid: cron.unschedule has a (bigint) and a (name) overload.
  for v_stale in select j.jobid from cron.job j where j.jobname = 'brazos-prune-payment-events'
  loop
    perform cron.unschedule(v_stale);
  end loop;

  perform cron.schedule('brazos-prune-payment-events', '30 3 * * *',
                        $cron$select public.prune_payment_event_payloads();$cron$);
  return 'scheduled: brazos-prune-payment-events';
end
$fn$;
revoke all on function public.install_payment_events_prune() from public, anon, authenticated;
grant execute on function public.install_payment_events_prune() to service_role;
comment on function public.install_payment_events_prune() is
  'A19: installs (or re-installs) the daily brazos-prune-payment-events schedule at 03:30 UTC where pg_cron exists; skips with a notice where it does not. Idempotent.';

select public.install_payment_events_prune();
