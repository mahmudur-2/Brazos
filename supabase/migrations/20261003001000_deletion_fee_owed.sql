-- 20261003001000_deletion_fee_owed.sql — FIX-RUN A14 review (2026-10-03): a worker still owed the
-- cancellation fee cannot delete their account until the fee has reached them.
--
-- THE GAP. 20261003000300 made payments.status 'partially_refunded' terminal for BOTH sides of a
-- late cancellation. It is terminal for the CUSTOMER — apply_payment_event() writes it when
-- charge.refunded lands, so their money is home — but not yet for the WORKER on the card path:
-- cancel_job()'s late branch queues both halves at once (transfer_cents = the fee, with
-- release_requested_at; refund_cents = the rest), charge.refunded writes partially_refunded whether
-- or not the transfer has landed, and the row stays in transfers_due (release requested, transfer_ref
-- null, transfer_cents > 0) until transfer.created. A worker who never set payouts up — whose row
-- waits in transfers_due and never reaches transfers_ready — could delete their account with the
-- fee still owed, and the fee would then have nowhere to go.
--
-- THE FIX. partially_refunded stays terminal except for the PAYEE of a stripe row whose fee is still
-- queued: transfer_cents > 0 and transfer_ref null. That row blocks the worker with its own sentence
-- ("The cancellation fee has not reached your payout account yet.") and never the customer. A
-- sandbox row finalises in the statement that writes it (stripe_foundation's header: sandbox rows
-- FINALIZE their status; transfer_ref is written by transfer.created alone, so a sandbox row never
-- carries one) and stays terminal for both. Everything else is 20261003000300's body verbatim, and
-- the gate stays what it was: an allow-list of terminal values, so an unclassified or newly added
-- status still blocks by default. ACL re-stated as the baseline granted it.
--
-- NOT DESTRUCTIVE under scripts/staging-scan.sh. Reversible: one corrective migration restores the
-- 20261003000300 body.

create or replace function public.account_deletion_blockers() returns table (kind text, ref_id uuid, label text, detail text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with me as (select auth.uid() as uid)
  select b.kind, b.ref_id, b.label, b.detail
  from (
    -- Jobs the caller posted or is assigned to, not yet in a terminal state.
    select
      'job'::text as kind,
      j.id as ref_id,
      coalesce(nullif(btrim(j.title), ''), 'Untitled job') as label,
      -- No 'open' or 'draft' branch: both are terminal for this gate (see the
      -- header), so neither can reach this CASE.
      case j.status::text
        when 'assigned'    then 'A worker is assigned to this job.'
        when 'in_progress' then 'Work is underway on this job.'
        else 'This job has not reached a final state yet.'
      end as detail,
      1 as sort_group,
      j.created_at as sort_key
    from public.jobs j
    cross join me
    where me.uid is not null
      and (j.client_id = me.uid or j.assigned_worker_id = me.uid)
      and (
        j.status is null
        or j.status not in ('completed', 'cancelled', 'open', 'draft')
      )

    union all

    -- Money that has not finished moving, in either direction.
    select
      case when p.payee_id = me.uid
        then 'payment_incoming'::text
        else 'payment_outgoing'::text
      end as kind,
      coalesce(p.job_id, p.id) as ref_id,
      case when p.payee_id = me.uid
        then 'Payment owed to you'
        else 'Payment you sent'
      end as label,
      case p.status::text
        when 'held'               then 'This payment is being held for a job and has not been released.'
        when 'unfunded'           then 'This payment has not been funded yet.'
        when 'pending'            then 'This payment has not settled yet.'
        when 'authorized'         then 'This payment is authorized but has not been held or released.'
        -- A14 review: reachable only by the payee of a stripe row whose fee is still queued.
        when 'partially_refunded' then 'The cancellation fee has not reached your payout account yet.'
        else 'This payment has not reached a final state yet.'
      end as detail,
      2 as sort_group,
      p.created_at as sort_key
    from public.payments p
    cross join me
    where me.uid is not null
      and (p.payer_id = me.uid or p.payee_id = me.uid)
      and (
        p.status is null
        -- A14: partially_refunded is final — the late-cancellation ledger record …
        or p.status not in ('released', 'paid_out', 'refunded', 'partially_refunded', 'failed', 'voided')
        -- A14 review: … for the customer, whose refund it records. For the worker it is final once
        -- the fee has left: a stripe row with transfer_cents > 0 and no transfer_ref is still in
        -- transfers_due, and its payee waits with it.
        or (
          p.status = 'partially_refunded'
          and p.payee_id = me.uid
          and p.provider = 'stripe'
          and coalesce(p.transfer_cents, 0) > 0
          and p.transfer_ref is null
        )
      )

    union all

    -- Disputes the caller opened, or that sit on a job they are party to.
    select
      'dispute'::text as kind,
      d.job_id as ref_id,
      'Open dispute' as label,
      'A dispute on this job has to be resolved before this account can be deleted.' as detail,
      3 as sort_group,
      d.created_at as sort_key
    from public.job_disputes d
    join public.jobs dj on dj.id = d.job_id
    cross join me
    where me.uid is not null
      and (
        d.opened_by = me.uid
        or dj.client_id = me.uid
        or dj.assigned_worker_id = me.uid
      )
      and (
        d.status is null
        or d.status not in ('resolved', 'withdrawn')
      )
  ) b
  order by b.sort_group, b.sort_key desc, b.label;
$$;

revoke all on function public.account_deletion_blockers() from public, anon;
grant execute on function public.account_deletion_blockers() to authenticated;
comment on function public.account_deletion_blockers() is
  'Everything still tying auth.uid() to money or to another person''s work. Empty = deletion permitted. Every status filter is an allow-list of terminal values (NOT IN), so an unclassified or newly added enum value blocks by default. Takes no parameters on purpose: a caller-supplied id would make this an oracle for other accounts. A14 (2026-10-03): partially_refunded counts as finished — it is the late-cancellation ledger''s final state — for the customer, and for the worker once the fee has left; a stripe row with transfer_cents > 0 and no transfer_ref still blocks its payee (A14 review), because the fee is still in transfers_due.';
