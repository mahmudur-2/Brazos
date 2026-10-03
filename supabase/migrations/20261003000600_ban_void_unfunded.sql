-- 20261003000600_ban_void_unfunded.sql — FIX-RUN A11 review (2026-10-03): a ban voids the checkout
-- it strands, as cancel_job() does.
--
-- THE GAP. 20261003000100 taught ban_user() to queue the refund of an UNDIRECTED HELD job_payment on
-- every job it cancels. A checkout that was started and never finished — a stripe row still
-- `unfunded` (the intent minted, the sheet never completed), or a sandbox row `authorized` and not
-- yet held — was left as it was on a job that is now terminal. cancel_job() voids exactly those
-- rows ("job cancelled before funding"); the ban did not. The consequence is the shape A14 fixed:
-- account_deletion_blockers() counts `unfunded` and `authorized` as money still moving, so the
-- counterparty could not delete their account — for up to 24 hours on the card path
-- (expire_unfunded_payments() sweeps a stripe row once funding_due_at passes), for ever on the
-- sandbox ledger, which nothing sweeps.
--
-- THE FIX. One more statement in the ban's loop, cancel_job()'s own void: status 'voided',
-- last_error 'job cancelled before funding'. Nothing was captured on such a row, so nothing is
-- refunded and nothing reaches the drain; a charge that lands after the void is already the
-- webhook's funded_after_void case (20260915000000). Status gate allow-listed
-- (`status in ('unfunded', 'authorized')`). Body otherwise 20261003000100's, verbatim; ACL re-stated
-- as the baseline granted it (authenticated — the admin check is inside).
--
-- NOT DESTRUCTIVE under scripts/staging-scan.sh. Reversible: one corrective migration restores the
-- 20261003000100 body.

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
    -- header of 20261003000100; the shape is cancel_job()'s worker_cancelled branch with its own
    -- reason.
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

    -- A11 review: a checkout started and never finished is voided, exactly as cancel_job() voids
    -- it — nothing was captured, so nothing is refunded, and the row leaves the deletion gate.
    update public.payments
       set status = 'voided', last_error = 'job cancelled before funding', updated_at = v_now
     where job_id = v_job.id
       and kind = 'job_payment'
       and status in ('unfunded', 'authorized');

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
  'Admin only (profiles.is_admin, checked inside). Bans the account, blocks its phone, cancels its in-flight jobs and tells each counterparty in the thread. A11 (2026-10-03): on every job it cancels, an UNDIRECTED held job_payment (nothing yet refunded, transferred or released) is queued for a full refund of the card charge, reason account_suspended — sandbox rows go refunded at once, card rows wait for charge.refunded through refunds_ready; a job_payment still unfunded or authorized (a checkout never finished) is voided as cancel_job() voids it, so it cannot block the counterparty''s account deletion. Rows already directed are left as they are; resolve_job_dispute() is the operator''s path for those.';
