-- 20261003000300_deletion_partial_refund.sql — FIX-RUN A14 (2026-10-03): a partly refunded job no
-- longer blocks account deletion for ever.
--
-- THE GAP. account_deletion_blockers() (baseline) treats payments.status 'partially_refunded' as
-- money still moving ("A refund on this payment has not completed."). It is not: partially_refunded
-- is the ledger's FINAL state for a late cancellation — the fee released to the worker, the rest
-- refunded to the customer — written by apply_payment_event() once charge.refunded lands, and the
-- row is that job's permanent money record (stripe_foundation §"one active money row"). Nothing ever
-- moves it on, so either account was blocked from deleting itself for ever.
--
-- THE FIX. 'partially_refunded' joins the terminal list and loses its CASE line. Everything else is
-- the baseline body verbatim, and the gate stays what the baseline comment says it is: an allow-list
-- of terminal values, so an unclassified or newly added status still blocks by default. ACL re-stated
-- as the baseline granted it.
--
-- NOT DESTRUCTIVE under scripts/staging-scan.sh. Reversible: one corrective migration restores the
-- baseline body.

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
        -- A14: partially_refunded is final — the late-cancellation ledger record.
        or p.status not in ('released', 'paid_out', 'refunded', 'partially_refunded', 'failed', 'voided')
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
  'Everything still tying auth.uid() to money or to another person''s work. Empty = deletion permitted. Every status filter is an allow-list of terminal values (NOT IN), so an unclassified or newly added enum value blocks by default. Takes no parameters on purpose: a caller-supplied id would make this an oracle for other accounts. A14 (2026-10-03): partially_refunded counts as finished — it is the late-cancellation ledger''s final state.';
