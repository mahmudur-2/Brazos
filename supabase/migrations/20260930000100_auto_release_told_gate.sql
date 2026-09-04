-- 20260930000100_auto_release_told_gate.sql — night1 (n3): the 72-hour
-- auto-release gates on the customer having been TOLD, not on a push having
-- been SENT; an unconditional 7-day fallback; job_completed always on.
--
-- THE GAP (docs/BACKLOG.md §v1 bugs, "auto-release liveness gap"). At HEAD
-- auto_release_due_payments() (20260905000000_stripe_foundation.sql §13)
-- releases a stripe row only when a notification_outbox row of type
-- job_completed carries status 'sent'. That row is enqueued under the
-- user-toggleable category 'job_updates' (baseline, notify_on_job_status
-- branch 5); enqueue_notification() inserts nothing when should_notify() is
-- false (Job updates off, a mute, a block); and a row that IS inserted
-- resolves 'skipped' when the customer has no active push token
-- (supabase/functions/send-push/index.ts) or stays 'pending' for ever once
-- claim_notification_batch stops claiming it at five attempts — nothing at
-- HEAD writes 'failed'. So a customer without push permission, with Job
-- updates off, or who muted or blocked the worker could hold a completed,
-- undisputed job's payment indefinitely: the worker bore the cost, and the
-- only release left was the customer's own tap.
--
-- THE FIX: three CREATE OR REPLACEs and nothing else — no new table, column,
-- view, trigger, type or grant to a new role. Every function restates its own
-- ACL here because create or replace preserves whatever ACL the function
-- already had (CLAUDE.md §Supabase).
--   (a) auto_release_due_payments(): two clocks. TOLD-BY-ANY-CHANNEL — 72
--       hours after completion once a job_completed outbox row exists for the
--       customer in ANY terminal status (sent, skipped, failed): the in-app
--       feed (lib/notifications.ts) shows the row whether or not a push left
--       the server, so the row's existence is what "told" means; a pending
--       row still refuses, because the drain has not looked at it yet.
--       FALLBACK — 7 days after completion, unconditionally, so no completed,
--       undisputed job holds money for ever. Both clocks run under the same
--       refusal set as release_job_payment(): no open issue report, no card
--       dispute, not refund-directed or parked, held. Every other condition
--       is exactly as at HEAD. Sandbox rows are untouched — their 72 h clock
--       is on-read inside job_payment_state() (stripe_foundation §17).
--   (b) notify_on_job_status(): branch (5) enqueues job_completed under the
--       always-on category 'jobs' (phase75) instead of 'job_updates'. The
--       type, title, body, data (screen ClientJobDetail, jobId) and dedupe key
--       are unchanged — lib/notificationRoutes.ts and the feed key on type
--       and data, not on category.
--   (c) should_notify(): the always-on category returns true after the
--       null-recipient / self-actor / inactive-recipient refusals and BEFORE
--       the actor checks, so a block or a mute no longer suppresses it. The
--       category already bypassed the PREFERENCE (the `when 'jobs' then true`
--       arm); what it lacked was the block / mute bypass. Deliberate
--       consequence: the existing 'jobs' events — dispute_opened and
--       payment_released — bypass block and mute too; both are money or
--       dispute events between two parties already in a contract, which
--       tests/notificationFeed.test.mjs records as deliberate.
--
-- The R12 plan to gate the money timer on DELIVERED is withdrawn by
-- docs/DECISIONS.md 2026-09-04: delivery truth is a push concern, not a
-- money gate. Proof: supabase/tests/110_auto_release_gate.sql. Additive:
-- scripts/staging-scan.sh finds none of its shapes here. Reversible by one
-- corrective migration restoring the three bodies.

-- ---------------------------------------------------------------------------
-- (a) auto_release_due_payments() — stripe_foundation §13, the gate replaced.
--     The body is the HEAD body verbatim except the gate: the 72-hour line
--     moved inside the told branch, the status set widened to every terminal
--     status, and the 7-day fallback OR-ed beside it.
-- ---------------------------------------------------------------------------
create or replace function public.auto_release_due_payments() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n integer;
begin
  update public.payments p
     set release_requested_at = now(),
         release_reason = 'auto_approved',
         transfer_cents = p.amount_cents - p.platform_fee_cents,
         updated_at = now()
    from public.jobs j
   where j.id = p.job_id
     and p.provider = 'stripe'
     and p.kind = 'job_payment' and p.status = 'held'
     and p.release_requested_at is null and p.chargeback_at is null
     and coalesce(p.refund_cents, 0) = 0 and p.transfer_reversed_at is null
     and j.status = 'completed' and j.completed_at is not null
     and not exists (select 1 from public.job_disputes d where d.job_id = j.id and d.status = 'open')
     -- THE GATE, two clocks (n3). TOLD: 72 hours after completion, once the
     -- completion notification exists for the customer in any terminal
     -- status — sent, skipped (no active push token) or failed — because the
     -- in-app feed shows the row whether or not a push left the server; a
     -- pending row still refuses. FALLBACK: 7 days after completion,
     -- unconditionally, so no completed, undisputed job holds money for ever.
     and (
       (
         now() >= j.completed_at + interval '72 hours'
         and exists (
           select 1 from public.notification_outbox o
            where o.recipient_id = j.client_id
              and o.type = 'job_completed'
              and o.data ->> 'jobId' = j.id::text
              and o.status in ('sent', 'skipped', 'failed')
         )
       )
       or now() >= j.completed_at + interval '7 days'
     );
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.auto_release_due_payments() from public, anon, authenticated;
grant execute on function public.auto_release_due_payments() to service_role;
comment on function public.auto_release_due_payments() is
  'The stripe auto-release, two clocks (n3). TOLD-BY-ANY-CHANNEL: 72 hours after completion once a job_completed notification_outbox row exists for the customer in any terminal status (sent, skipped, failed) — the in-app feed shows the row whether or not a push left the server; a pending row still refuses. FALLBACK: 7 days after completion, unconditionally. Both under the same refusal set as release_job_payment: no open issue report, no card dispute, not refund-directed or parked, held. Sets release_requested_at + transfer_cents (auto_approved) and leaves the row held for the transfer. Sandbox rows are not this clock''s (job_payment_state). service_role only; pg_cron every 10 minutes.';

-- ---------------------------------------------------------------------------
-- (b) notify_on_job_status() — the baseline body verbatim, except that
--     branch (5) enqueues job_completed under the always-on category 'jobs'.
--     ACL restated exactly as the baseline's.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."notify_on_job_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  -- (4) Assigned to a worker — covers both accepting a bid and a direct hire.
  if new.assigned_worker_id is not null
     and (old.assigned_worker_id is null or old.assigned_worker_id <> new.assigned_worker_id)
  then
    perform public.enqueue_notification(
      new.assigned_worker_id,
      new.client_id,
      'job_updates',
      'job_assigned',
      'You got the job',
      left(new.title, 80) || ' is yours. Tap for the details.',
      jsonb_build_object('screen', 'WorkerJob', 'jobId', new.id::text),
      'job_assigned:' || new.id::text || ':' || new.assigned_worker_id::text
    );
  end if;

  -- (5) Worker marked it complete — tell the client, and land them on the
  -- screen showing the completion photos.
  if new.status = 'completed' and old.status is distinct from 'completed' then
    perform public.enqueue_notification(
      new.client_id,
      new.assigned_worker_id,
      'jobs',
      'job_completed',
      'Job marked complete',
      coalesce(public.notify_display_name(new.assigned_worker_id), 'The worker')
        || ' finished ' || left(new.title, 60) || '.',
      jsonb_build_object('screen', 'ClientJobDetail', 'jobId', new.id::text),
      'job_completed:' || new.id::text
    );
  end if;

  return new;
end;
$$;
REVOKE ALL ON FUNCTION "public"."notify_on_job_status"() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- (c) should_notify() — the baseline body verbatim, with ONE insertion after
--     the inactive-recipient check and before the actor checks. ACL restated
--     exactly as the baseline's.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."should_notify"("p_recipient" "uuid", "p_actor" "uuid", "p_category" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_prefs public.notification_prefs;
  v_allowed boolean;
begin
  if p_recipient is null then
    return false;
  end if;
  if p_actor is not null and p_actor = p_recipient then
    return false;
  end if;
  if not public.is_profile_active(p_recipient) then
    return false;
  end if;
  -- night1 (n3): the always-on category is transactional between two parties already in a contract; a preference, a mute or a block never suppresses it. Recipient null / self / inactive still refuse above.
  if p_category = 'jobs' then return true; end if;
  if p_actor is not null then
    if public.is_blocked_between(p_recipient, p_actor) then
      return false;
    end if;
    if exists (
      select 1 from public.mutes m
      where m.muter_id = p_recipient and m.muted_id = p_actor
    ) then
      return false;
    end if;
    if not public.is_profile_active(p_actor) then
      return false;
    end if;
  end if;

  select * into v_prefs from public.notification_prefs where user_id = p_recipient;
  if v_prefs.user_id is null then
    v_allowed := (p_category <> 'nearby_jobs');
  else
    v_allowed := case p_category
      when 'messages'      then v_prefs.messages
      when 'bids'          then v_prefs.bids
      when 'job_updates'   then v_prefs.job_updates
      when 'hire_requests' then v_prefs.hire_requests
      when 'nearby_jobs'   then v_prefs.nearby_jobs
      -- phase75: transactional, deliberately always on.
      when 'jobs'          then true
      else true
    end;
  end if;

  return v_allowed;
end;
$$;
REVOKE ALL ON FUNCTION "public"."should_notify"("p_recipient" "uuid", "p_actor" "uuid", "p_category" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."should_notify"("p_recipient" "uuid", "p_actor" "uuid", "p_category" "text") TO "authenticated";
