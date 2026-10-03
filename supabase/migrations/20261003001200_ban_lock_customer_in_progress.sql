-- 20261003001200_ban_lock_customer_in_progress.sql — FIX-RUN A11 review 2 (2026-10-03): a ban
-- does not refund a job the banned CUSTOMER's worker is already doing, and the loop that now moves
-- money locks what it touches.
--
-- THE GAP, IN TWO PARTS.
--   1. 20261003000600's loop refunds every UNDIRECTED held job_payment on every job it cancels —
--      including a job whose client is the banned account and whose status is in_progress. There
--      the worker has been working, and the whole payment went back to the account that was just
--      banned, with nothing left for the operator to decide.
--   2. The loop reads the in-flight jobs with a plain select, cancels each with no status re-check
--      and writes the money either way. A job that a concurrent transition_job_status() or
--      cancel_job() moved on in the meantime (completed, or already cancelled with its own refund
--      shape) was cancelled over the top and its money queued again.
--
-- THE FIX, in the same loop. The jobs are read FOR UPDATE, so nothing else moves one while the ban
-- holds it; the cancellation re-states the allow-list it is leaving (status in open / assigned /
-- in_progress); and when that update touched no row — the job had moved on — the iteration ends
-- there: no refund, no void, no message, because this ban cancelled nothing. The refund keeps its
-- A11 shape for every other case (the banned worker's jobs; the banned customer's job not yet
-- started), and is SKIPPED when the banned account is the job's client and the job is in_progress:
-- that row stays held and undirected, exactly the shape resolve_job_dispute() admits for a cancelled
-- job ("cancelled with no open claim" — docs/runbooks/dispute-resolution.md), and the operator
-- decides by hand. LIMIT recorded rather than hidden: resolve_job_dispute() directs such a row in the
-- customer's favour only (a full refund); paying the worker on that shape is a hand decision outside
-- it today. Body otherwise 20261003000600's, verbatim; ACL re-stated as the baseline granted it
-- (authenticated — the admin check is inside).
--
-- NOT DESTRUCTIVE under scripts/staging-scan.sh. Reversible: one corrective migration restores the
-- 20261003000600 body.

create or replace function public.ban_user(p_target uuid, p_report_id uuid default null) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text;
  v_job record;
  v_other uuid;
  v_rows integer;
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

  -- Cancel anything still in flight, notifying the counterparty. A11 review 2: each job is LOCKED
  -- before anything is written, the cancellation re-checks the status it is leaving, and a job the
  -- lock found already moved on is left alone — no money, no message, since this ban cancelled
  -- nothing there.
  for v_job in
    select id, client_id, assigned_worker_id, status
    from public.jobs
    where status in ('open', 'assigned', 'in_progress')
      and (client_id = p_target or assigned_worker_id = p_target)
    for update
  loop
    update public.jobs
       set status = 'cancelled'
     where id = v_job.id
       and status in ('open', 'assigned', 'in_progress');
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      continue;
    end if;

    -- A11: the money the cancellation strands goes home. Undirected held rows only — see the
    -- header of 20261003000100; the shape is cancel_job()'s worker_cancelled branch with its own
    -- reason. A11 review 2: NOT when the banned account is the CUSTOMER of a job already in
    -- progress — the worker has been working, and a refund would hand their pay back to the
    -- account that was banned. That row stays held and undirected for the operator
    -- (resolve_job_dispute(): a cancelled job with no open claim and an undirected held row).
    if not (v_job.client_id = p_target and v_job.status = 'in_progress') then
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
    end if;

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
  'Admin only (profiles.is_admin, checked inside). Bans the account, blocks its phone, cancels its in-flight jobs and tells each counterparty in the thread. A11 (2026-10-03): on every job it cancels, an UNDIRECTED held job_payment (nothing yet refunded, transferred or released) is queued for a full refund of the card charge, reason account_suspended — sandbox rows go refunded at once, card rows wait for charge.refunded through refunds_ready; a job_payment still unfunded or authorized (a checkout never finished) is voided as cancel_job() voids it, so it cannot block the counterparty''s account deletion. Rows already directed are left as they are; resolve_job_dispute() is the operator''s path for those. A11 review 2: the jobs are locked (for update) and re-checked before they are cancelled, a job that moved on meanwhile is skipped whole, and when the banned account is the job''s client and the job is in_progress the held row is left undirected for the operator instead of refunded.';
