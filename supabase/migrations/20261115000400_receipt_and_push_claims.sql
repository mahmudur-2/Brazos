-- 20261115000400_receipt_and_push_claims.sql — pack 1, A14 (a claim leases its rows) and A13 (a
-- receipt goes out only for money that stayed with the worker).
--
-- WHAT WAS WRONG.
--   A14: claim_receipt_batch and claim_notification_batch counted the attempt and left the row
--        claimable at once, so a run that overlapped a slow one claimed and sent the same row
--        again; and claim_notification_batch ended a row as failed while its fifth attempt was
--        still out. claim_receipt_batch never ended a row that used its five attempts, and
--        drain_receipts never woke for one.
--   A13: a receipt was claimed whatever happened to the money after the release: a transfer
--        reversed in full (the payment back to held, released_at cleared) or a refund still sent
--        "paid to the worker". receipt_details said released at the approval time when there was
--        no release, and paid_to_worker_cents was the amount asked for, not what the provider left.
--
-- WHAT CHANGES.
-- 1. THE LEASE: 10 minutes, the same for both. A claim sets next_attempt_at (receipts) or
--    send_after (pushes) to now() + 10 minutes; neither sweep ends a row whose lease is ahead.
--    The rule: longer than the longest run of the claiming function. Neither has a time budget or
--    a fetch timeout (send-push/index.ts:36-39 and :219-226, send-receipts/index.ts:55-56 and
--    :216-228), so that run is bounded only by the Edge Functions wall-clock limit, 400 seconds on a
--    paid plan (150 on free). 5 minutes (300 s) is shorter; 10 minutes (600 s) is the smallest round
--    value longer. A sender's 'pending' answer: resolve_receipt writes its own back-off over the
--    lease, as before; resolve_notification leaves it, so a push retry waits out the lease (it
--    went at the next minute before).
-- 2. claim_receipt_batch: ends a pending row that used its five attempts and whose lease ran out
--    as failed ('retries exhausted' when it carries no error); skips the pending receipts of a
--    payment that can never be released again; claims only receipts of a payment that is released
--    or paid_out. NEVER RELEASED AGAIN: the only writer of status 'released' is
--    payment_record_transfer, from 'held' (20261112010100); 'held' is written only from 'unfunded'
--    (apply_payment_event) and from 'released' (payment_record_reversal); nothing writes 'unfunded'
--    over a row. So refunded, partially_refunded, voided and failed never reach 'released'.
-- 3. drain_receipts wakes when a pending row is due and either used its five attempts or belongs
--    to a payment that is released, paid_out or never released again: everything the claim
--    can send or sweep. Receipts waiting on a parked (held) payment wake nothing.
-- 4. receipt_details: 'released_at' is p.released_at (no fallback to the approval time);
--    'paid_to_worker_cents' is the live amount of the transfers recorded for the payment, falling
--    back to the columns as before when none is recorded.
-- 5. claim_notification_batch: the B17 sweep spares a row under its lease; the claim leases.
-- Bodies verbatim from 20260930001100_receipts.sql, 20261112020000_drain_apikey_probe.sql and
-- 20261112000300_notifications_failed.sql otherwise; signatures, security, search_path and ACLs
-- (service_role only) as they were.
--
-- Additive under scripts/staging-scan.sh. Proof: supabase/tests/440_outbox_claim_lease.sql and
-- supabase/tests/333_notifications_failed.sql.

begin;

create or replace function public.claim_receipt_batch(p_limit integer default 20)
returns setof public.receipt_outbox
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
begin
  -- A14: a row that used its five attempts and whose lease ran out ends failed.
  update public.receipt_outbox r
     set status = 'failed', last_error = coalesce(r.last_error, 'retries exhausted')
   where r.status = 'pending' and r.attempts >= 5
     and (r.next_attempt_at is null or r.next_attempt_at <= now());
  -- A13: a payment that can never be released again sends no receipt.
  update public.receipt_outbox r set status = 'skipped', last_error = 'the payment can no longer be released'
   where r.status = 'pending' and (r.next_attempt_at is null or r.next_attempt_at <= now())
     and exists (select 1 from public.payments p where p.id = r.payment_id
                  and p.status in ('refunded', 'partially_refunded', 'voided', 'failed'));

  return query
  with claimed as (
    select r.id
    from public.receipt_outbox r
    where r.status = 'pending' and r.attempts < 5
      and (r.next_attempt_at is null or r.next_attempt_at <= now())
      -- A13: only while the money is with the worker.
      and exists (select 1 from public.payments p where p.id = r.payment_id and p.status in ('released', 'paid_out'))
    order by r.created_at
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    for update skip locked
  ),
  marked as (
    update public.receipt_outbox r
       set attempts = r.attempts + 1,
           -- A14: the lease. Not claimed again, and not swept, while this run may still send it.
           next_attempt_at = now() + interval '10 minutes'
      from claimed c
     where r.id = c.id
    returning r.*
  )
  select * from marked;
end;
$fn$;
revoke all on function public.claim_receipt_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_receipt_batch(integer) to service_role;

create or replace function public.drain_receipts() returns bigint
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
begin
  -- Nothing to claim or to sweep: the function is not woken at all.
  if not exists (
    select 1 from public.receipt_outbox r
    where r.status = 'pending' and (r.next_attempt_at is null or r.next_attempt_at <= now())
      and (r.attempts >= 5
           or exists (select 1 from public.payments p where p.id = r.payment_id
                       and p.status in ('released', 'paid_out', 'refunded', 'partially_refunded', 'voided', 'failed')))
  ) then
    return null;
  end if;

  return public.drain_receipts_post();
end;
$fn$;
revoke all on function public.drain_receipts() from public, anon, authenticated;
grant execute on function public.drain_receipts() to service_role;
comment on function public.drain_receipts() is
  'Idea 8, service_role only: when a receipt can be claimed or swept (due, and five attempts used or its payment released, paid out or never released again), wakes the send-receipts edge function through drain_receipts_post(); null otherwise (20261115000400).';

create or replace function public.receipt_details(p_payment_id uuid) returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'job_id', j.id,
    'job_number', j.job_number,
    'title', j.title,
    'category', j.category::text,
    'location', j.location,
    'posted_at', j.created_at,
    'completed_at', j.completed_at,
    'hired_at', coalesce(a.accepted_at, p.created_at),
    'held_at', p.held_at,
    'approved_at', p.release_requested_at,
    'released_at', p.released_at,
    'release_reason', p.release_reason,
    'provider', p.provider,
    'provider_ref', p.provider_ref,
    -- Every amount is the ledger's, verbatim; the fallbacks are the columns' own documented rules
    -- for a row written before they existed.
    'agreed_cents', p.amount_cents,
    'protection_fee_cents', p.customer_fee_cents,
    'tax_cents', p.tax_cents,
    'charged_cents', coalesce(p.charge_amount_cents, p.amount_cents + p.customer_fee_cents + p.tax_cents),
    'worker_fee_cents', p.platform_fee_cents,
    'worker_fee_bps', p.worker_fee_bps,
    'paid_to_worker_cents', coalesce((select sum(t.amount_cents - t.reversed_cents)::integer from public.payment_transfers t where t.payment_id = p.id), p.transfer_cents, p.amount_cents - p.platform_fee_cents),
    'customer_id', p.payer_id,
    'customer_name', public.notify_display_name(p.payer_id),
    'worker_id', p.payee_id,
    'worker_name', public.notify_display_name(p.payee_id),
    'offer_by_worker', (o.author_id = p.payee_id),
    'offer_cents', o.amount_cents,
    'offered_at', o.created_at
  )
  from public.payments p
  join public.jobs j on j.id = p.job_id
  left join public.job_agreements a on a.job_id = j.id
  left join public.job_offers o on o.id = coalesce(p.offer_id, j.accepted_offer_id)
  where p.id = p_payment_id
$fn$;
revoke all on function public.receipt_details(uuid) from public, anon, authenticated;
grant execute on function public.receipt_details(uuid) to service_role;

create or replace function public.claim_notification_batch(p_limit integer default 100)
returns table(outbox_id uuid, recipient_id uuid, type text, title text, body text, data jsonb, tokens text[])
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
begin
  -- B17: a row that has used its five attempts will never be claimed again; it ends failed, with
  -- the reason written when the sender left none.
  update public.notification_outbox o
     set status = 'failed',
         last_error = coalesce(o.last_error, 'retries exhausted')
   where o.status = 'pending'
     and o.attempts >= 5
     -- A14: not while its last attempt is still out under the lease.
     and (o.send_after is null or o.send_after <= now());

  -- Idea 7, the group 3 review: an alert that waited out quiet hours may have gone stale — the job
  -- hired or withdrawn, the customer blocked or muted, nearby alerts switched off. Re-checked now,
  -- once, before it can leave; a stale one is resolved as skipped.
  update public.notification_outbox o
     set status = 'skipped',
         last_error = 'quiet hours: stale by morning'
   where o.status = 'pending'
     and o.category = 'nearby_jobs'
     and o.send_after is not null
     and o.send_after <= now()
     and not exists (
       select 1
       from public.jobs j
       where j.id::text = o.data ->> 'jobId'
         and j.status = 'open'
         and public.should_notify(o.recipient_id, j.client_id, 'nearby_jobs')
     );

  return query
  with claimed as (
    select o.id
    from public.notification_outbox o
    where o.status = 'pending'
      and o.attempts < 5
      -- Idea 7: quiet hours — not before its morning.
      and (o.send_after is null or o.send_after <= now())
    order by o.created_at
    limit greatest(1, least(coalesce(p_limit, 100), 100))
    for update skip locked
  ),
  marked as (
    update public.notification_outbox o
       set attempts = o.attempts + 1,
           -- A14: the lease. Not claimed again, and not swept, while this run may still send it.
           send_after = now() + interval '10 minutes'
      from claimed c
     where o.id = c.id
    returning o.*
  )
  select
    m.id,
    m.recipient_id,
    m.type,
    m.title,
    m.body,
    m.data,
    coalesce(
      array(
        select t.token from public.push_tokens t
        where t.user_id = m.recipient_id and t.active
      ),
      array[]::text[]
    )
  from marked m;
end;
$fn$;
revoke all on function public.claim_notification_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_batch(integer) to service_role;

commit;
