-- 20261115000200_work_start_money_rule.sql — pack 1, A6 (one money rule for starting work and both
-- queues) and the A1 reservation in refunds_due.
--
-- WHAT WAS WRONG.
--   A6: transition_job_status let the work start on any held payment, including one under a card
--       dispute or charged for another amount than the row says: money neither queue will ever pay
--       out. The queues each spelled the same two-clause rule on their own.
--   A1: refunds_due subtracted only the transfers RECORDED for a payment. A transfer whose send
--       began and whose answer was lost was not subtracted, so a refund queued on top of it could
--       send the whole charge back while the transfer paid the worker.
--
-- WHAT CHANGES.
-- 1. payment_money_clear(payments): no card dispute holds the charge, and the charge collected what
--    the row says. The two B13/B17 clauses of both queues, in one place.
-- 2. transfers_due and refunds_due: those clauses become the helper call. refunds_due also reserves
--    transfer_cents while payment_transfer_unconfirmed holds (20261115000000). Every other clause,
--    the column list (p.*: payments is unchanged), the order and the ACL are as in
--    20261112010300_settlement_guards.sql. transfers_ready and refunds_ready select over them and need
--    no restatement.
-- 3. transition_job_status: the start gate also requires payment_money_clear. Body verbatim from
--    20260925000000_job_completions.sql otherwise; signature, security, search_path and ACL as they were.
--
-- THE CANCELLATION FEE (a fee transfer and a partial refund queued together) still goes in either
-- order: the refund is charge - fee, and while the fee transfer is unknown the limit is
-- charge - 0 - fee. Proof: supabase/tests/420_transfer_in_flight.sql §F.
--
-- Additive under scripts/staging-scan.sh. Proof: supabase/tests/435_work_start_money_rule.sql and
-- supabase/tests/420_transfer_in_flight.sql.

begin;

create or replace function public.payment_money_clear(p public.payments)
returns boolean
language sql immutable
set search_path = public, pg_temp
as $fn$
  select p.chargeback_at is null and coalesce(p.received_cents, p.charge_amount_cents) = p.charge_amount_cents
$fn$;
revoke all on function public.payment_money_clear(public.payments) from public, anon, authenticated;
grant execute on function public.payment_money_clear(public.payments) to service_role;
comment on function public.payment_money_clear(public.payments) is
  'A6: no card dispute holds the charge (B13) and the charge collected what the row says (B17). Work starts, and either queue sends, only while this holds. Read by transition_job_status, transfers_due and refunds_due.';

create or replace view public.transfers_due as
  select p.*
    from public.payments p
   where p.provider = 'stripe'
     and p.release_requested_at is not null
     and p.transfer_ref is null
     and p.transfer_reversed_at is null
     and coalesce(p.transfer_cents, 0) > 0
     -- DIVERGENCE (safety, beyond D11's predicate): an open in-app dispute
     -- freezes the transfer as it freezes the release.
     and not exists (select 1 from public.job_disputes d where d.job_id = p.job_id and d.status = 'open')
     -- B18: the charge is still there: held, or partly refunded by a late cancellation.
     and p.status in ('held', 'partially_refunded')
     -- B13, B17 (A6): no card dispute holds the money, and the charge collected what the row says.
     and public.payment_money_clear(p)
     -- B18: never more than is left after refunds, asked for or landed.
     and p.transfer_cents <= p.charge_amount_cents - greatest(coalesce(p.refunded_cents, 0), coalesce(p.refund_cents, 0))
     -- B16: no live transfer is recorded for this payment.
     and not exists (select 1 from public.payment_transfers t
                      where t.payment_id = p.id and t.reversed_cents < t.amount_cents)
     -- B16: the current attempt is neither stopped nor past its 23 hours.
     and not public.settlement_attempt_closed(p.transfer_attempts, p.transfer_sent_attempt, p.transfer_sent_at, p.transfer_stopped_at)
   order by p.release_requested_at;
revoke all on table public.transfers_due from public, anon, authenticated;
grant select on table public.transfers_due to service_role;

create or replace view public.refunds_due as
  select p.*
    from public.payments p
   where p.provider = 'stripe'
     and coalesce(p.refund_cents, 0) > 0
     and p.refund_ref is null
     -- DIVERGENCE (safety): a row already refunded without a recorded ref
     -- (a hand refund in the dashboard) is not refunded twice.
     and p.status <> 'refunded'
     -- B16: allow-list of the states a refund is sent from.
     and p.status in ('held', 'released', 'paid_out', 'voided', 'failed')
     -- B16: nothing refunded yet (a partial refund already landed needs a person).
     and coalesce(p.refunded_cents, 0) = 0
     -- B13, B17 (A6): no card dispute holds the money, and the charge collected what the row says.
     and public.payment_money_clear(p)
     -- B18: never more than is left after what went to the worker.
     and p.refund_cents <= p.charge_amount_cents
           - (select coalesce(sum(t.amount_cents - t.reversed_cents), 0)::integer
                from public.payment_transfers t where t.payment_id = p.id)
           -- A1: and after a transfer whose send began and whose result is not recorded.
           - (case when public.payment_transfer_unconfirmed(p) then coalesce(p.transfer_cents, 0) else 0 end)
     -- B16: the current attempt is neither stopped nor past its 23 hours.
     and not public.settlement_attempt_closed(p.refund_attempts, p.refund_sent_attempt, p.refund_sent_at, p.refund_stopped_at)
   order by p.updated_at;
revoke all on table public.refunds_due from public, anon, authenticated;
grant select on table public.refunds_due to service_role;
comment on view public.refunds_due is
  'stripe rows whose refund to the customer may be sent: refund_cents > 0 and no refund recorded yet; and (20261112010300) in an allow-listed state, nothing refunded yet, no card dispute, charged the row''s amount, refund_cents within what is left after live transfers (and, 20261115000200, after a transfer whose send began and whose result is not recorded), and the current attempt neither stopped nor past 23 hours. process-settlements refunds refund_cents against the charge with idempotency key rf:<id>:<refund_attempts>. Every row asked for and not here is in payment_attention.';

create or replace function public.transition_job_status(p_job_id uuid, p_status text, p_completion_photos jsonb default null, p_completion_videos jsonb default null)
returns public.jobs
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_photos jsonb := coalesce(p_completion_photos, '[]'::jsonb);
  v_videos jsonb := coalesce(p_completion_videos, '[]'::jsonb);
begin
  select * into v_job
  from public.jobs
  where id = p_job_id
  for update;

  -- phase73: NULL-safe comparison. On an unassigned job the column is NULL, and
  -- the previous inequality test yielded NULL rather than TRUE, so the guard
  -- never fired and the caller received the row.
  if not found or v_user is null or v_job.assigned_worker_id is distinct from v_user then
    raise exception 'Job not found or not assigned to caller';
  end if;
  if not public.is_profile_active(v_user) then
    raise exception 'Active authentication required';
  end if;

  -- phase58: a retry of a transition that already landed returns the row
  -- (the sibling-RPC idempotency pattern). The retry's media is ignored -
  -- the first call's payload already landed.
  if v_job.status::text = p_status then
    return v_job;
  end if;

  if not (
    (v_job.status = 'assigned' and p_status = 'in_progress')
    or (v_job.status = 'in_progress' and p_status = 'completed')
  ) then
    raise exception 'Invalid job status transition';
  end if;
  -- R4 (D8): the held gate. Work starts only on a payment held in protection.
  if v_job.status = 'assigned' and p_status = 'in_progress' then
    if not exists (
      select 1 from public.payments p
      where p.job_id = p_job_id and p.kind = 'job_payment'
        and p.status not in ('failed', 'voided')
        and p.status = 'held'
    ) then
      raise exception 'The customer hasn''t protected the payment yet. You''ll get a notification the moment it''s held.';
    end if;
    -- A6: and only on money the queues can pay out (no card dispute, charged the row's amount).
    if not exists (
      select 1 from public.payments p
      where p.job_id = p_job_id and p.kind = 'job_payment'
        and p.status = 'held' and public.payment_money_clear(p)
    ) then
      raise exception 'This job''s payment is on hold, so the work can''t start yet.';
    end if;
  end if;
  if jsonb_typeof(v_photos) <> 'array' or jsonb_array_length(v_photos) > 5 then
    raise exception 'Completion photos must be an array with at most 5 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_photos) as photo(value)
    where jsonb_typeof(photo.value) <> 'string'
      or length(photo.value #>> '{}') > 2048
  ) then
    raise exception 'Each completion photo must be a valid URL or storage reference';
  end if;
  -- R6c (D-14): the completion-photo guard. A null or empty p_completion_photos
  -- cannot mark a job complete. The shape checks above have already made
  -- v_photos an array, so its length is the whole test.
  if p_status = 'completed' and jsonb_array_length(v_photos) = 0 then
    raise exception 'At least one photo of the finished work is required to mark this job complete';
  end if;
  if jsonb_typeof(v_videos) <> 'array' or jsonb_array_length(v_videos) > 1 then
    raise exception 'Completion videos must be an array with at most 1 entry';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_videos) as video(value)
    where jsonb_typeof(video.value) <> 'string'
      or length(video.value #>> '{}') > 2048
  ) then
    raise exception 'Each completion video must be a valid URL or storage reference';
  end if;

  update public.jobs
  set
    status = p_status::public.job_status,
    completion_photos = case
      when p_status = 'completed' and p_completion_photos is not null then v_photos
      else completion_photos
    end,
    completion_photo_url = case
      when p_status = 'completed' and jsonb_array_length(v_photos) > 0
        then v_photos->>0
      else completion_photo_url
    end,
    completion_videos = case
      when p_status = 'completed' and p_completion_videos is not null then v_videos
      else completion_videos
    end,
    completed_at = case
      when p_status = 'completed' then coalesce(completed_at, now())
      else completed_at
    end
  where id = p_job_id
  returning * into v_job;

  -- R6c (D-14): the record of the guard — one row per completed job, written
  -- here and nowhere else. The retry branch above returns before this point,
  -- so the unique job_id can never collide on a repeated call.
  if p_status = 'completed' then
    insert into public.job_completions (job_id, completed_by, photos)
    select p_job_id, v_user, array_agg(photo.value #>> '{}' order by photo.ord)
      from jsonb_array_elements(v_photos) with ordinality as photo(value, ord);
  end if;

  return v_job;
end;
$fn$;
revoke all on function public.transition_job_status(uuid, text, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.transition_job_status(uuid, text, jsonb, jsonb) to authenticated;

commit;
