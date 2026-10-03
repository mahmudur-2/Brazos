-- 20261003000100_ban_refund.sql — FIX-RUN A11 (2026-10-03): a ban queues the refund it strands.
--
-- THE GAP. ban_user() (baseline) cancels every in-flight job of the banned account with a raw
-- `update public.jobs set status = 'cancelled'` and moves no money: a customer's payment held on
-- such a job stayed held, with no path home — cancel_job() is the customer's and refuses a
-- cancelled job, and resolve_job_dispute() is the operator's by hand. The app then hid the row,
-- because the client's job page skipped the payment read on cancelled jobs (fixed beside this).
--
-- THE FIX. The ban queues a full refund of the card charge on every UNDIRECTED held job_payment of
-- a job it cancels — a held row with nothing yet directed: refund_cents 0, transfer_cents 0, no
-- release requested — in exactly cancel_job()'s worker_cancelled shape: refund_cents = the charge,
-- transfer_cents = 0, a named reason, status refunded on the sandbox ledger and unchanged on the
-- card path until charge.refunded lands (refunds_due / refunds_ready carry it to the drain).
-- A row already directed (release requested, a transfer or refund in flight) is left exactly as
-- it is: a ban never claws money back from a release the customer approved, and never touches a
-- settlement already moving. resolve_job_dispute() remains the operator's path for those.
--
-- The reason is new — `account_suspended` — so the ledger says what happened; the check constraint
-- is re-stated with it, on the NEWEST list (R4's six, then 20260915's funded_after_void, then this),
-- drop constraint being this repository's ordinary way to widen a CHECK and not a destructive shape
-- under scripts/staging-scan.sh. Body otherwise the baseline's, verbatim;
-- ACL re-stated as the baseline granted it (authenticated — the admin check is inside).
--
-- NOT DESTRUCTIVE under scripts/staging-scan.sh. Reversible: one corrective migration restores the
-- baseline body and the previous constraint list.

alter table public.payments drop constraint if exists payments_refund_reason_known;
alter table public.payments add constraint payments_refund_reason_known
  check (refund_reason is null or refund_reason in
    ('customer_cancelled_free', 'customer_cancelled_late', 'worker_cancelled', 'no_show_withdrawn',
     'customer_no_show', 'dispute_refund', 'funded_after_void', 'account_suspended'));

create or replace function public.ban_user(p_target uuid, p_report_id uuid default null) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text;
  v_job record;
  v_other uuid;
  v_now timestamptz := now();
begin
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  ) then
    raise exception 'Only admins may ban users';
  end if;

  update public.profiles set banned = true where id = p_target;

  select phone into v_phone from public.profiles where id = p_target;
  if v_phone is not null and length(btrim(v_phone)) > 0 then
    insert into public.banned_phones (phone, banned_profile_id)
    values (btrim(v_phone), p_target)
    on conflict (phone) do nothing;
  end if;

  -- Cancel anything still in flight, notifying the counterparty.
  for v_job in
    select id, client_id, assigned_worker_id
    from public.jobs
    where status in ('open', 'assigned', 'in_progress')
      and (client_id = p_target or assigned_worker_id = p_target)
  loop
    update public.jobs set status = 'cancelled' where id = v_job.id;

    -- A11: the money the cancellation strands goes home. Undirected held rows only — see the
    -- header; the shape is cancel_job()'s worker_cancelled branch with its own reason.
    update public.payments
       set refund_cents = charge_amount_cents,
           transfer_cents = 0,
           refund_reason = 'account_suspended',
           status = case when provider = 'sandbox' then 'refunded'::public.payment_status else status end,
           updated_at = v_now
     where job_id = v_job.id
       and kind = 'job_payment'
       and status = 'held'
       and coalesce(refund_cents, 0) = 0
       and coalesce(transfer_cents, 0) = 0
       and release_requested_at is null;

    v_other := case
      when v_job.client_id = p_target then v_job.assigned_worker_id
      else v_job.client_id
    end;

    -- Notify the counterparty in the job's thread. There's no system-sender
    -- concept in `messages`, so this is attributed to the banned user — that
    -- way it lands as an INBOUND message for the person being notified,
    -- rather than appearing as something they sent themselves.
    if v_other is not null then
      insert into public.messages (job_id, sender_id, content)
      values (
        v_job.id,
        p_target,
        'This job was cancelled automatically because this account was suspended by Brazos.'
      );
    end if;
  end loop;

  if p_report_id is not null then
    update public.reports set status = 'actioned' where id = p_report_id;
  end if;
end;
$$;

revoke all on function public.ban_user(uuid, uuid) from public, anon;
grant execute on function public.ban_user(uuid, uuid) to authenticated;
comment on function public.ban_user(uuid, uuid) is
  'Admin only (profiles.is_admin, checked inside). Bans the account, blocks its phone, cancels its in-flight jobs and tells each counterparty in the thread. A11 (2026-10-03): on every job it cancels, an UNDIRECTED held job_payment (nothing yet refunded, transferred or released) is queued for a full refund of the card charge, reason account_suspended — sandbox rows go refunded at once, card rows wait for charge.refunded through refunds_ready. Rows already directed are left as they are; resolve_job_dispute() is the operator''s path for those.';
