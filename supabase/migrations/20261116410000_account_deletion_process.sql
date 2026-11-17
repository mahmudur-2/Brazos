-- account_deletion_process — production-36h S1, M3 (plan section 4; B3, Apple 1B-04). Deleting an
-- account deletes what no other person's record shows and no dispute can need: in the same
-- transaction the exact address of its posts nobody was hired for; afterwards, by the settlements
-- timer, its Stripe customer (with every saved card). Every review and every job stays (Privacy
-- sections 6, 7). This file removes no file and closes no payout account: payment_accounts keeps the
-- payout account as it is, so a payment still owed to the person reaches it (the settlement drain,
-- transfers_ready, reads it there).
--
-- 0. The order rule (whoever lands first, the later lane re-derives): the three functions restated on
--    purpose (2, 3, 6) must still have the fingerprint of the definitions they were written from
--    (function_fingerprint(), ban_switch 0b: body, settings and shape; A8-06; the message names each
--    with the fingerprint it found), and the names this file makes new must not exist yet. Otherwise
--    the file stops before any change. The file is one transaction, and a second run of it stops
--    here by design (P12).
-- 1. NEW public.account_cleanups: one row per deleted account, written only by delete_my_account,
--    record_account_cleanup and set_payment_customer (6). Row security on, no policy, no right for
--    any client role and none for the service role (it goes through the functions in 4 and 6). A row
--    names only the Stripe customer the account itself held in payment_accounts when it was deleted
--    (a trigger refuses any other id), or, when it held none, the one the provider made for it while
--    the deletion ran (6); that id never changes, the step once done stays done (but for that one
--    reopening), step_opened_at says when the step was last opened, and a row is finished only when
--    its step is done (a check).
--    NEW public.payment_unsettled_for(payments, uuid): the one rule for "this payment still moves money
--    to or from this person", read by the deletion check (2).
-- 2. account_deletion_blockers(), restated from its live body. The money lane's finding: a stripe row
--    that is partially_refunded with no release asked for is a refund made outside the app (every
--    refund the app asks for is the whole charge, or a fee split that asks for the release in the same
--    statement), and the rest of the charge is held until a person decides who gets it. It now blocks
--    both the customer and the worker. The customer also waits while a refund of the payment is owed;
--    the worker still waits for a queued fee (A14 review). A landed late cancellation stays final for
--    both (A14). A10-05 (decision 7): "owed" is the money lane's payment_refund_owed(payments)
--    (20261116300500_refund_owed.sql), called, never copied: a failed refund that was arranged
--    another way no longer blocks, and a new failure blocks again. A held stripe row whose whole
--    charge is directed to a refund (no transfer) with no refund owed is settled for both sides (its
--    refund failed and was arranged; the row never leaves held). A partly refunded tip whose transfer
--    is queued says 'This tip has not reached your payout account yet.' (not the fee sentence).
--    WRITTEN LIMITS (the helper's two known edges): (7a) after a lost card dispute for PART of a
--    charge the payment is refunded and the answer is false, so the deletion passes although part of
--    a refund asked can still be owed (the owner's list has its own line for that state); (7b) a
--    failed refund arranged outside Stripe on a row with no refund_ref keeps the answer true until a
--    developer corrects the row, so the deletion stays refused, with the sentence of the row's state
--    (partially_refunded: 'Part of your refund has not reached your card yet.'; held: 'This payment is
--    being held for a job and has not been released.'). Neither names a way to reach support.
-- 3. delete_my_account(), restated from its live body (the lock, the gate, the cancellations, the
--    deletes, the tombstone and the mark unchanged). New, before the jobs lock: the account lock
--    (A8-02, lock_account exclusive; ban_switch 2c). New (A11-08): the withdrawal of the offers it
--    sent becomes the settlement of every pending offer it is part of, on both sides, by the rule
--    ban_user() uses (settle_offers_of_suspended(), ban_switch 3a): what it sent is withdrawn, what
--    waits on its answer is declined, oldest first, with the usual chain event and its usual push; a
--    failed update stops the deletion as it stops a ban, a chain event that cannot be posted does
--    not. New, after the settlement: the job_locations row of each post it made with no hire, no
--    payment, no agreement and no report is deleted (nobody else could ever read it; the post stays,
--    closed by the cancellation). No review and no job is deleted. Then rate_counters, and language
--    in the tombstone. New (A11-10 decision 11): other people's alert rows about a message it sent
--    get the title 'Deleted user'; new (A14-F F3, (g2)): six more kinds of other people's alert rows,
--    whose title begins with its name and whose key ties them to it, get 'Deleted user' in place of
--    that name (the written limit F10 below names what keeps a name). Before the
--    auth row goes, one account_cleanups row records its Stripe customer
--    id. New (A10 small fix 2), right after the account lock: a repeat call by an account already
--    deleted (a tombstone with its cleanup row: the first answer was lost, or a second tap waited on
--    the lock) returns quietly and changes nothing.
-- 4. NEW, service role only: claim_account_cleanups(limit) hands the settlements timer up to 10 due
--    rows and leases each for 10 minutes; record_account_cleanup(...) keeps what was done, retries
--    every 5 minutes in the first hour and every hour after that. A row is due one minute early, so a
--    timer that runs every 5 minutes does not skip it; the lease adds that minute, so it is a true 10
--    minutes (A10 small fix 1).
-- 5. NEW account_cleanup_attention, select for the service role only, in the payment list's shape
--    (A10-06): every row not finished whose customer step has been open for 1 hour since it was last
--    opened (step_opened_at), whether or not a try ran: code cleanup_customer_open, one plain
--    sentence (what is not deleted yet, who finishes it and how), since, a detail that names the
--    Stripe customer and the last error, finish stripe.
--    WRITTEN LIMIT (A14-F F5), the view and the speed. account_cleanup_attention lists every cleanup
--    row not finished whose customer step has been open for 1 hour. Only the service role can read
--    it: no client role, and no admin in the app. It is NOT part of payment_attention, so the
--    owner's payment list does not show it and nothing pushes it; a person reads it with the service
--    role. The speed: the settlements run (every 5 minutes) gives the cleanup at most one row, and
--    only in a quiet run, one whose money passes end within the first 10 of its 60 seconds
--    (fits(run, 4)); while the money passes use the run, it gets none, and a row cut off is tried
--    again at a later run. A row whose step is still open 1 hour after it was opened gets its line on
--    this view.
-- 6. set_payment_customer(), restated from its live body (A10-03, A11-06). New, first after its
--    argument check: the account lock (lock_account shared; ban_switch 2c), before it reads the
--    account and before any row lock. New: for a deleted account it writes payment_accounts nothing
--    and returns null; the customer the provider made for it while the deletion ran goes to the
--    account's cleanup row while that row names no customer, and opens its step again (customer_done
--    false, finished_at null, due now, step_opened_at now). A row that already names a customer keeps
--    it; a second, different customer made in that race stays at Stripe, never used (the caller gets
--    null), as the trunk leaves a second customer of a live account (a written limit).
--
-- WRITTEN LIMIT (F10, what is left after A11-10 decision 11 and A14-F F3): the deletion removes the
-- person's own alert rows (e) and changes other people's rows of seven kinds. (g): an alert about a
-- message the person sent (type message, dedupe key 'message:' || the message id; notify_on_message
-- writes the sender's name as its title) gets the title 'Deleted user'. (g2): an alert of the six
-- kinds whose TITLE begins with the person's name (hire_accepted and job_completed from
-- notify_on_job_status, job_running_late from report_running_late, series_confirm from
-- series_on_visit_change, series_worker_dropped from drop_series_worker, series_stopped from
-- stop_job_series) gets 'Deleted user' in place of the name, when its key ties it to the person and
-- its whole title is the name followed by exactly the rest its trigger writes. The table has no actor
-- column. What still keeps the name:
--   - every BODY that holds it: bid_received ('<first name> bid $..', notify_on_bid), offer_countered
--     ('<first name> sent you a Counteroffer ..', notify_on_offer_counter), review_received ('<name>
--     left you ..', notify_on_review), job_reminder ('<name> · <place>', '<name> can start ..',
--     enqueue_tomorrow_reminders), series_first_refusal ('<job> for <first name> · ..',
--     series_offer_visit), series_open ('<first name> didn''t take this one · ..', series_open_visit),
--     and a message preview (the body of (g)) whose own words name the person;
--   - a title of the six kinds written under an older name of the person (a name changed since), or
--     in older words of its trigger;
--   - what has already left the table: a push shown on a phone, a receipt already emailed (P11).

begin;

-- 0. The order rule.
do $order_rule$
declare
  v_bad text;
begin
  select string_agg(w.sig || ' found=' || coalesce(public.function_fingerprint(p.oid::pg_catalog.regprocedure), 'none'),
                    ', ' order by w.sig) into v_bad
  from (values
    -- each restated on purpose; sections 2, 3 and 6 say what changes
    ('public.account_deletion_blockers()',       '8811a7967c2583669327102e01a64f80'),
    ('public.delete_my_account()',               '41ec1071df47382a2aca2c43a07b4e3b'),
    ('public.set_payment_customer(uuid,text)',   '78e1044f47d1f1b9c5756c11559a399a')
  ) as w(sig, md5)
  left join pg_catalog.pg_proc p on p.oid = to_regprocedure(w.sig)
  where p.oid is null or public.function_fingerprint(p.oid::pg_catalog.regprocedure) is distinct from w.md5;
  if v_bad is not null then
    raise exception 'account_deletion_process: written from a definition that is no longer live (re-derive from the live definition): %', v_bad;
  end if;

  select string_agg(n.sig, ', ' order by n.sig) into v_bad
  from (values
    ('public.account_cleanup_guard()'),
    ('public.payment_unsettled_for(public.payments,uuid)'),
    ('public.claim_account_cleanups(integer)'),
    ('public.record_account_cleanup(uuid,boolean,text)')
  ) as n(sig)
  where to_regprocedure(n.sig) is not null;
  if v_bad is not null then
    raise exception 'account_deletion_process: a function this file makes new already exists (re-derive from it): %', v_bad;
  end if;
end
$order_rule$;

-- 1. The cleanup table and the one money rule.
create table public.account_cleanups (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null unique references public.profiles (id),
  stripe_customer_id text unique,
  customer_done      boolean not null default false,
  attempts           integer not null default 0,
  next_attempt_at    timestamptz not null default now(),
  last_error         text,
  created_at         timestamptz not null default now(),
  step_opened_at     timestamptz not null default now(),
  finished_at        timestamptz,
  constraint account_cleanups_finished_only_when_done
    check (finished_at is null or customer_done)
);
alter table public.account_cleanups enable row level security;
revoke all on table public.account_cleanups from public, anon, authenticated, service_role;
comment on table public.account_cleanups is
  'production-36h S1 M3: one row per deleted account, what still has to go after delete_my_account: the Stripe customer (deleted through the Stripe API with every saved card). Written only by delete_my_account (insert), record_account_cleanup (update) and set_payment_customer (A10-03: a late customer for a row with none, which opens the step again; step_opened_at is when the step was last opened), read by claim_account_cleanups and account_cleanup_attention. Row security on, no policy, no right for anon, authenticated or service_role. account_cleanup_guard: the customer id is the account''s own payment_accounts id at insert, the account, the customer id and created_at never change (but for that late customer), a done step stays done (but for that reopening). A row is finished only when its step is done.';

create function public.account_cleanup_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $trg$
declare
  v_reopen boolean;
begin
  if tg_op = 'UPDATE' then
    -- A10-03: the one change of the customer id, set_payment_customer's late customer for an account
    -- deleted with none: it opens the customer step again.
    v_reopen := old.stripe_customer_id is null and new.stripe_customer_id is not null;
    if new.user_id is distinct from old.user_id
       or (new.stripe_customer_id is distinct from old.stripe_customer_id and not v_reopen)
       or (new.step_opened_at is distinct from old.step_opened_at and not v_reopen)
       or new.created_at is distinct from old.created_at then
      raise exception 'account_cleanups: the account and its Stripe customer never change';
    end if;
    if v_reopen and (new.customer_done or new.finished_at is not null or exists (
         select 1 from public.payment_accounts pa
          where pa.stripe_customer_id = new.stripe_customer_id and pa.user_id <> new.user_id)) then
      raise exception 'account_cleanups: a late Stripe customer opens the step again and is no other account''s';
    end if;
    if old.customer_done and not new.customer_done and not v_reopen then
      raise exception 'account_cleanups: a step that is done stays done';
    end if;
    return new;
  end if;
  if new.stripe_customer_id is not null and not exists (
       select 1 from public.payment_accounts pa
        where pa.user_id = new.user_id and pa.stripe_customer_id = new.stripe_customer_id) then
    raise exception 'account_cleanups: the Stripe customer is not this account''s own';
  end if;
  return new;
end
$trg$;
revoke all on function public.account_cleanup_guard() from public, anon, authenticated, service_role;
comment on function public.account_cleanup_guard() is
  'production-36h S1 M3: the account_cleanups trigger. Insert: a Stripe customer id must be the one payment_accounts holds for that same account (payment_accounts keeps each id unique, so no other account holds it). Update: user_id, the customer id, step_opened_at and created_at never change, and customer_done never goes back to false, with one exception (A10-03): a row with no customer id may get one (set_payment_customer''s late customer for a deleted account) only in the same update that opens the step again (customer_done false, finished_at null) and only when no other account''s payment_accounts row holds that id; step_opened_at may change in that update.';

create trigger account_cleanups_guard
  before insert or update on public.account_cleanups
  for each row execute function public.account_cleanup_guard();

create function public.payment_unsettled_for(p public.payments, p_user uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $fn$
  select (p.payer_id = p_user or p.payee_id = p_user)
    and (
      p.status is null
      -- An allow-list of terminal values, so an unclassified or newly added status counts as unsettled.
      or (p.status not in ('released', 'paid_out', 'refunded', 'partially_refunded', 'failed', 'voided')
          -- A10-05 (decision 7): but a held stripe row whose whole charge is directed to a refund
          -- (refund_cents = charge_amount_cents, no transfer) and on which no refund is owed: its refund
          -- failed and was arranged another way (resolve_refund_failure), and the row never leaves held.
          -- Owed is the money lane's one rule (payment_refund_owed); an unknown answer keeps it open.
          and not coalesce(
                p.status = 'held'
                and p.provider = 'stripe'
                and coalesce(p.refund_cents, 0) > 0
                and p.refund_cents = p.charge_amount_cents
                and coalesce(p.transfer_cents, 0) = 0
                and not public.payment_refund_owed(p),
                false))
      -- partially_refunded is written only by charge.refunded, on a stripe row; a sandbox row finalised
      -- in the statement that wrote it.
      or (
        p.status = 'partially_refunded'
        and p.provider = 'stripe'
        and (
          -- No release asked for: refunded in part outside the app, the rest held until a person
          -- decides who gets it. Either side may still be owed it.
          p.release_requested_at is null
          -- A14 review: the worker waits while the fee (or the tip) is still in transfers_due.
          or (p.payee_id = p_user and coalesce(p.transfer_cents, 0) > 0 and p.transfer_ref is null)
          -- The customer waits while a refund of the payment is owed (A10-05, decision 7: the money
          -- lane's payment_refund_owed; a failed refund that was arranged no longer blocks, a new
          -- failure blocks again). An unknown answer counts as owed.
          or (p.payer_id = p_user and coalesce(public.payment_refund_owed(p), true))
        )
      )
    )
$fn$;
revoke all on function public.payment_unsettled_for(public.payments, uuid) from public, anon, authenticated, service_role;
comment on function public.payment_unsettled_for(public.payments, uuid) is
  'production-36h S1 M3: true while this payment still moves money to or from p_user (the payer or the payee): any status outside released, paid_out, refunded, partially_refunded, failed and voided, but for a held stripe row whose whole charge is directed to a refund (refund_cents = charge_amount_cents, no transfer) with no refund owed (A10-05: a failed refund arranged another way); and a stripe partially_refunded row while no release was asked for (a refund made outside the app, the rest held), for the payee while its fee or tip is still queued (transfer_cents > 0, no transfer_ref), for the payer while a refund is owed. Owed is public.payment_refund_owed(payments), the money lane''s one rule, never copied here; an unknown answer counts as owed. Stable: it reads payment_refund_failures through that rule. The one rule account_deletion_blockers reads. Called only inside definer functions.';

-- 2. The deletion check. Restated from the live body; the payment arm's filter is now
--    payment_unsettled_for (the same allow-list, plus the finding and A10-05), and the
--    partially_refunded sentence says which of four things it waits for.
create or replace function public.account_deletion_blockers()
returns table (kind text, ref_id uuid, label text, detail text)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
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
        -- Reachable only by a stripe row payment_unsettled_for keeps open: the rest still held (M3),
        -- the payee's fee or tip still queued (A14 review), or a refund still owed to the payer
        -- (payment_refund_owed, A10-05).
        when 'partially_refunded' then
          case
            when p.release_requested_at is null
              then 'Part of this payment was refunded, and the rest is still held until support decides who gets it.'
            -- A10-05 (decision 7, the reader's P10): a partly refunded tip whose transfer is queued
            -- holds no cancellation fee.
            when p.payee_id = me.uid and p.kind = 'tip'
              then 'This tip has not reached your payout account yet.'
            when p.payee_id = me.uid
              then 'The cancellation fee has not reached your payout account yet.'
            else 'Part of your refund has not reached your card yet.'
          end
        else 'This payment has not reached a final state yet.'
      end as detail,
      2 as sort_group,
      p.created_at as sort_key
    from public.payments p
    cross join me
    where me.uid is not null
      and (p.payer_id = me.uid or p.payee_id = me.uid)
      and public.payment_unsettled_for(p, me.uid)

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
$function$;

-- Live grants and comment restated; the comment gains the M3 sentence.
revoke all on function public.account_deletion_blockers() from public, anon;
grant execute on function public.account_deletion_blockers() to authenticated;
comment on function public.account_deletion_blockers() is
  'Everything still tying auth.uid() to money or to another person''s work. Empty = deletion permitted. Every status filter is an allow-list of terminal values (NOT IN), so an unclassified or newly added enum value blocks by default. Takes no parameters on purpose: a caller-supplied id would make this an oracle for other accounts. A14 (2026-10-03): partially_refunded counts as finished — it is the late-cancellation ledger''s final state — for the customer, and for the worker once the fee has left; a stripe row with transfer_cents > 0 and no transfer_ref still blocks its payee (A14 review), because the fee is still in transfers_due. production-36h S1 M3: the payment filter is payment_unsettled_for(); a stripe partially_refunded row with no release asked for (refunded in part outside the app, the rest held) blocks both sides, and one on which a refund is owed (payment_refund_owed, A10-05) blocks the customer; a held stripe row whose whole charge went to a refund that failed and was arranged another way (no refund owed) blocks nobody (A10-05); a partly refunded tip whose transfer is queued says This tip has not reached your payout account yet.';

-- 3. delete_my_account. Restated from the live body; the new statements are (a1), (a1b), (d), (d2),
--    the rate_counters delete in (e), language in (f), the alert titles in (g) and (h).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_cancelled integer := 0;
  v_settled integer := 0;
  v_auth_deleted integer;
  v_blocking text[];
  v_customer text;
  v_full text;
  v_first text;
begin
  -- active_account_rule (C5): this account may still leave while it is banned. The mark lets this
  -- function's own inner calls (the fee functions the jobs triggers reach) pass
  -- the guard for this uid only. It is cleared before the function returns; an error rolls it back.
  perform set_config('brazos.inactive_ok', coalesce(v_user::text, ''), true);

  -- (a)
  if v_user is null then
    raise exception 'Not signed in';
  end if;

  -- (a1) A8-02: the account lock (lock_account, exclusive), before any row lock. An accept that
  --      names this account (accept_offer() takes it shared) waits for this deletion, or this
  --      deletion waits for that accept.
  perform public.lock_account(v_user, false);

  -- (a1b) A10 small fix (2): a deletion that already happened (its answer was lost, or a second tap
  --       waited on the lock above) is not done again: the tombstone with its cleanup row returns
  --       quietly and changes nothing. Read after the lock, so a deletion that just committed is seen.
  if exists (select 1 from public.profiles p where p.id = v_user and p.deleted_at is not null)
     and exists (select 1 from public.account_cleanups c where c.user_id = v_user) then
    perform set_config('brazos.inactive_ok', '', true);
    return;
  end if;

  -- (a2) phase75: lock every job this account is party to, before the gate
  --      reads them. jobs first, always - see the header.
  perform 1
  from public.jobs
  where client_id = v_user or assigned_worker_id = v_user
  order by id
  for update;

  -- (b) The gate. Never a silent no-op: the client matches this exact string
  --     and re-renders the blocker list instead of showing a raw error.
  --     Read AFTER the lock above, so what it sees cannot move under it.
  --     S4-09 (active_account_rule): the detail says what blocks and that support can help.
  select array_agg(distinct b.kind) into v_blocking from public.account_deletion_blockers() b;
  if v_blocking is not null then
    raise exception using
      errcode = 'P0001',
      message = 'ACCOUNT_DELETION_BLOCKED',
      detail = 'This account cannot be deleted yet.'
        || case when 'job' = any (v_blocking) then ' A job of yours has not finished.' else '' end
        || case when v_blocking && array['payment_incoming', 'payment_outgoing']
                then ' A payment of yours has not settled.' else '' end
        || case when 'dispute' = any (v_blocking) then ' A dispute on one of your jobs is still open.' else '' end
        || ' Contact support if you need help.';
  end if;

  -- (c) Cancel, do not orphan. Raw UPDATE because transition_job_status()
  --     permits only assigned -> in_progress and in_progress -> completed and
  --     authorises only the assigned worker; an open job has no assigned
  --     worker at all. Drafts stay at draft on purpose. IN not NOT IN, so an
  --     unrecognised status is never auto-cancelled. No exception handler
  --     here, deliberately the opposite call from (d): a refusal to cancel the
  --     user's own live posting must abort, or the tombstone commits with a
  --     posting nobody can cancel.
  --
  --     phase75: offers other people authored on these jobs are now settled by
  --     the jobs_settle_offers_on_cancel trigger, which fires on this UPDATE.
  update public.jobs
     set status = 'cancelled'
   where client_id = v_user
     and status = 'open';

  get diagnostics v_cancelled = row_count;

  -- (d) A11-08 (production-36h S1): every pending, unexpired offer this account is part of is
  --     settled, on both sides, by settle_offers_of_suspended() (ban_switch 3a), the rule ban_user()
  --     uses, in its order (oldest first, each row locked): the bids, counters and hire requests it
  --     sent are withdrawn, the hire requests and counters waiting on its answer are declined, each
  --     with the chain event withdraw_offer() or decline_offer() posts (it keeps the bids projection
  --     and the feed consistent), this account as actor. The other person is told as on a withdraw or
  --     a decline: a direct offer's event buzzes "New message", a marketplace bid's does not (phase61).
  --     A chain event that cannot be posted does not undo the settlement. An offer past its deadline
  --     is left to expire the canonical way (expire_offer_if_stale(), at the next touch); the offers
  --     on its own open posts were declined by (c). Runs before (f), while the account is not deleted.
  v_settled := public.settle_offers_of_suspended(v_user);

  -- (d2) production-36h S1 M3: the exact address and access notes of each post it made that nobody
  --      was hired for (no worker, no agreement: jobs_snapshot_agreement writes one at every hire),
  --      with no payment and no report. Nobody else could ever read the row (job_locations_select_party:
  --      the poster, and the hired worker while assigned or in progress). The post itself stays,
  --      closed by (c); a job with a hire keeps its address (the worker's record, dispute evidence).
  delete from public.job_locations l
  using public.jobs j
  where j.id = l.job_id
    and j.client_id = v_user
    and j.assigned_worker_id is null
    and not exists (select 1 from public.payments p where p.job_id = j.id)
    and not exists (select 1 from public.job_agreements a where a.job_id = j.id)
    and not exists (select 1 from public.reports rp
                    where rp.job_id = j.id or (rp.subject_kind = 'job' and rp.subject_id = j.id));

  -- (e) Hard delete private-only rows carrying no counterparty value.
  --     blocks is NOT here: a block has to survive.
  if to_regclass('public.push_tokens') is not null then
    delete from public.push_tokens where user_id = v_user;
  end if;
  if to_regclass('public.notification_prefs') is not null then
    delete from public.notification_prefs where user_id = v_user;
  end if;
  if to_regclass('public.notification_outbox') is not null then
    delete from public.notification_outbox where recipient_id = v_user;
  end if;
  if to_regclass('public.message_reads') is not null then
    delete from public.message_reads where user_id = v_user;
  end if;
  if to_regclass('public.worker_services') is not null then
    delete from public.worker_services where worker_id = v_user;
  end if;
  delete from public.rate_counters where user_id = v_user;

  -- (e2) A14-F F3: the name the alert triggers write, read before (f) replaces it: the whole display
  --      name (notify_display_name(), the triggers' own reader) and its first word, as they take it.
  v_full := public.notify_display_name(v_user);
  v_first := split_part(btrim(v_full), ' ', 1);

  -- (f) Scrub the profile to a tombstone. NOT touched on purpose: id,
  --     created_at, rating_avg, rating_count, and banned - deletion must never
  --     launder a ban.
  update public.profiles
     set full_name         = 'Deleted user',
         phone             = null,
         avatar_url        = null,
         bio               = null,
         availability_note = null,
         categories        = null,
         completion_rate   = null,
         on_time_pct       = null,
         response_time     = null,
         language          = null,
         is_admin          = false,
         accepting_work    = false,
         deleted_at        = now()
   where id = v_user;

  -- verification_status is a named enum this repo never defines, so the reset
  -- runs only if 'unverified' is actually a label. The app treats anything but
  -- 'verified' as unverified, so skipping is safe; guessing would break it.
  if exists (
    select 1
    from information_schema.columns c
    join pg_namespace ns on ns.nspname = c.udt_schema
    join pg_type t on t.typname = c.udt_name and t.typnamespace = ns.oid
    join pg_enum e on e.enumtypid = t.oid
    where c.table_schema = 'public'
      and c.table_name = 'profiles'
      and c.column_name = 'verification_status'
      and e.enumlabel = 'unverified'
  ) then
    execute 'update public.profiles set verification_status = ''unverified'' where id = $1'
      using v_user;
  else
    raise notice
      'phase67: profiles.verification_status left as-is (no ''unverified'' label found).';
  end if;

  -- stripe_account_id appears in no migration in this repo; cleared only if
  -- the live table actually has it.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'stripe_account_id'
  ) then
    execute 'update public.profiles set stripe_account_id = null where id = $1'
      using v_user;
  end if;

  -- (g) Denormalised identity on retained tables: audited, nothing to scrub, but for one kind.
  --     A11-10 (decision 11): other people's alert rows about a message this account sent
  --     (notify_on_message: dedupe key 'message:' || the message id, the sender's name as the title)
  --     are shown under "Deleted user", as Privacy says of kept content; the body (the preview)
  --     stays. The rows (d) just wrote count too. The other rows that keep a name are a written limit
  --     (the header, F10).
  update public.notification_outbox n
     set title = 'Deleted user'
    from public.messages m
   where m.sender_id = v_user
     and n.dedupe_key = 'message:' || m.id::text
     and n.recipient_id <> v_user
     and n.title is distinct from 'Deleted user';

  -- (g2) A14-F F3 (C14-04): other people's alert rows of six more kinds whose TITLE begins with this
  --      account's name get 'Deleted user' in place of that name; the rest of the title and the body
  --      stay. A row qualifies only when (1) its own dedupe key ties it to this account: the key names
  --      this account, a job this account was hired for (a job's worker is written once, by
  --      accept_offer() alone), or a series this account owns or left; and (2) its whole title is this
  --      account's name as the kind's trigger took it (v_full, or its first word v_first), followed by
  --      exactly the rest that trigger writes (anchored at both ends). It never searches inside a
  --      sentence, and a row about another person, whatever their name, has another key. A title
  --      written under an older name, or in an older trigger's words, keeps it (the header, F10).
  --        hire_accepted          '<first> accepted your offer'        key hire_accepted:<job>:<worker>
  --        job_completed          '<first> finished the job'           key job_completed:<job>
  --        job_running_late       '<full> is running <m> min late'     key job_running_late:<job>:<m>:<time>
  --        series_confirm         '<first> can come <day>[ <hour>]'    key series_confirm:<visit job>
  --        series_worker_dropped  '<first> won''t take future visits'  key series_worker_dropped:<series>:<worker>
  --        series_stopped         '<first> stopped repeating'          key series_stopped:<series> (its customer)
  update public.notification_outbox n
     set title = 'Deleted user' || substr(n.title, length(t.name) + 1)
    from (
      select o.id, v_first as name, '^ accepted your offer$' as rest
        from public.jobs j
        join public.notification_outbox o on o.dedupe_key = 'hire_accepted:' || j.id::text || ':' || v_user::text
       where j.assigned_worker_id = v_user and o.type = 'hire_accepted'
      union all
      select o.id, v_first, '^ finished the job$'
        from public.jobs j
        join public.notification_outbox o on o.dedupe_key = 'job_completed:' || j.id::text
       where j.assigned_worker_id = v_user and o.type = 'job_completed'
      union all
      select o.id, v_full, '^ is running (10|20|30) min late$'
        from public.jobs j
        join public.notification_outbox o
          on o.recipient_id = j.client_id
         and split_part(o.dedupe_key, ':', 1) = 'job_running_late'
         and split_part(o.dedupe_key, ':', 2) = j.id::text
       where j.assigned_worker_id = v_user and o.type = 'job_running_late'
      union all
      select o.id, v_first, '^ can come [A-Z][a-z]{2}( [0-9]{1,2} (AM|PM))?$'
        from public.jobs j
        join public.notification_outbox o on o.dedupe_key = 'series_confirm:' || j.id::text
       where j.assigned_worker_id = v_user and o.type = 'series_confirm'
      union all
      select o.id, v_first, '^ won''t take future visits$'
        from public.job_series s
        join public.notification_outbox o on o.dedupe_key = 'series_worker_dropped:' || s.id::text || ':' || v_user::text
       where v_user = any (s.dropped_worker_ids) and o.type = 'series_worker_dropped'
      union all
      select o.id, v_first, '^ stopped repeating$'
        from public.job_series s
        join public.notification_outbox o on o.dedupe_key = 'series_stopped:' || s.id::text
       where s.client_id = v_user and o.type = 'series_stopped'
    ) t
   where n.id = t.id
     and n.recipient_id <> v_user
     and left(n.title, length(t.name)) = t.name
     and substr(n.title, length(t.name) + 1) ~ t.rest;

  -- (h) production-36h S1 M3: what the settlements timer finishes (claim_account_cleanups): the
  --     Stripe customer payment_accounts holds for this account, nothing else (account_cleanup_guard).
  --     No customer: the step is done at once. The payout account is not touched: payment_accounts
  --     keeps it, so a payment still owed to this person reaches it.
  select pa.stripe_customer_id into v_customer
  from public.payment_accounts pa
  where pa.user_id = v_user;

  insert into public.account_cleanups (user_id, stripe_customer_id, customer_done, finished_at)
  values (v_user, v_customer, v_customer is null, case when v_customer is null then now() end);

  -- (i) The auth row. Only reachable because phase67 section 1 dropped every
  --     public foreign key pointing at auth.users. The row-count assertion is
  --     not padding: RLS is enabled on auth.users and this DELETE lands only
  --     while the function owner carries BYPASSRLS. Without the check, a
  --     zero-row DELETE would commit the tombstone and the scrub while the
  --     account could still sign in.
  delete from auth.users where id = v_user;

  get diagnostics v_auth_deleted = row_count;
  if v_auth_deleted <> 1 then
    raise exception
      'phase67: auth.users delete affected % row(s), expected 1. '
      'Rolling back - the profile scrub must not commit without it.',
      v_auth_deleted;
  end if;

  raise notice
    'phase67: account % deleted (% open posting(s) cancelled, % pending offer(s) settled).',
    v_user, v_cancelled, v_settled;

  -- active_account_rule (C5): the mark ends here and at (a1b), the only ways out that are not an
  -- error. Nothing after this call, in this transaction, passes the guard for this uid.
  perform set_config('brazos.inactive_ok', '', true);

  -- RETAINED DELIBERATELY, all pointing at the tombstone: reviews, reports,
  -- blocks, banned_phones, legal_acceptances, payments, job_disputes, jobs,
  -- job_offers, bids, messages, conversations, direct_threads, job_locations
  -- (all but those (d2) deletes).
end;
$function$;

-- Live grants restated; the comment gains the M3 sentences.
revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'Deletes the CALLING account (auth.uid() only — no parameters). Refuses with ACCOUNT_DELETION_BLOCKED while account_deletion_blockers() returns anything. Leaves a tombstone profiles row so retained reviews, payments and disputes still resolve to "Deleted user"; deletes the auth.users row last. active_account_rule (C5): exempt from the guard, so a banned account can still leave; it marks brazos.inactive_ok with its own uid at its first statement and clears it before it returns. S4-09: the refusal''s detail says what blocks the deletion (a job that has not finished, a payment that has not settled, an open dispute) and that support can help. production-36h S1 M3: it also deletes the job_locations row of each job it posted with no hire, no payment, no agreement and no report, its rate_counters and its profile language, and deletes no review and no job; and before the auth row goes it writes one account_cleanups row: its payment_accounts customer id, which the settlements timer deletes at Stripe. It removes no file and leaves the payout account in payment_accounts. A8-02: it takes the account lock (lock_account, exclusive) before any row lock. A11-08: it settles every pending, unexpired offer it is part of through settle_offers_of_suspended(), the rule ban_user() uses: the ones it sent are withdrawn, the ones waiting on its answer are declined. A10: a repeat call by an account it already deleted (a tombstone with its account_cleanups row; read after the account lock) returns quietly and changes nothing. A11-10: other people''s alert rows about a message it sent (dedupe key message:<id>) get the title Deleted user; their body stays. A14-F F3: other people''s alert rows of six more kinds (hire_accepted, job_completed, job_running_late, series_confirm, series_worker_dropped, series_stopped) whose key ties them to it and whose whole title is its name followed by the words their trigger writes get Deleted user in place of the name; their body stays.';

-- The settlement rule's live comment (ban_switch 3a), restated with its new caller; its definition
-- and its grants do not change.
comment on function public.settle_offers_of_suspended(uuid) is
  'ban_switch: settles every pending, unexpired offer p_user is part of: the ones p_user sent are withdrawn, the ones waiting on p_user are declined, each with the chain event withdraw_offer() or decline_offer() posts, p_user as actor. Called by ban_user() (before the account is marked banned, so the other person is told as on a withdraw or decline), by the ban_switch backfill and, since account_deletion_process (A11-08), by delete_my_account() (before the account is marked deleted); no client may call it. Returns how many offers it settled.';

-- 4. The settlements timer's two calls.
create function public.claim_account_cleanups(p_limit integer)
returns table (id uuid, stripe_customer_id text, customer_done boolean)
language sql
volatile
security definer
set search_path = public, pg_temp
as $fn$
  with due as (
    select c.id
    from public.account_cleanups c
    where c.finished_at is null
      and c.next_attempt_at <= now() + interval '1 minute'
    order by c.next_attempt_at, c.id
    limit least(greatest(coalesce(p_limit, 0), 0), 10)
    for update skip locked
  ), leased as (
    -- A10 small fix (1): a true 10-minute lease. A row is due one minute early, so the lease adds
    -- that minute: the row is handed out again 10 minutes after this claim, never at 9.
    update public.account_cleanups c
       set next_attempt_at = now() + interval '10 minutes' + interval '1 minute'
      from due
     where c.id = due.id
    returning c.*
  )
  select l.id, l.stripe_customer_id, l.customer_done
  from leased l
  order by l.created_at, l.id;
$fn$;
revoke all on function public.claim_account_cleanups(integer) from public, anon, authenticated;
grant execute on function public.claim_account_cleanups(integer) to service_role;
comment on function public.claim_account_cleanups(integer) is
  'production-36h S1 M3, service_role only (process-settlements): up to 10 unfinished account_cleanups rows that are due (next_attempt_at at most one minute from now, so a 5-minute timer never skips one), oldest first, for update skip locked, each leased for 10 minutes (next_attempt_at 10 minutes plus the early minute ahead, so no claim hands it out again before 10 minutes): the row id, its Stripe customer id and whether that step is done.';

create function public.record_account_cleanup(p_id uuid, p_customer boolean, p_error text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row public.account_cleanups;
begin
  update public.account_cleanups c
     set customer_done = c.customer_done or coalesce(p_customer, false)
   where c.id = p_id
  returning * into v_row;
  if not found then
    return;
  end if;

  if v_row.customer_done then
    update public.account_cleanups c
       set finished_at = coalesce(c.finished_at, now()), last_error = null
     where c.id = p_id;
  else
    update public.account_cleanups c
       set attempts = c.attempts + 1,
           last_error = left(coalesce(nullif(btrim(p_error), ''), 'no reason given'), 500),
           next_attempt_at = now() + case when now() - c.created_at < interval '1 hour'
                                          then interval '5 minutes' else interval '1 hour' end
     where c.id = p_id;
  end if;

  -- What Stripe no longer has, payment_accounts no longer names: only for this account's own row and
  -- its recorded id, so repeating it changes nothing. The payout account columns are not touched.
  if v_row.customer_done and v_row.stripe_customer_id is not null then
    update public.payment_accounts
       set stripe_customer_id = null, updated_at = now()
     where user_id = v_row.user_id and stripe_customer_id = v_row.stripe_customer_id;
  end if;
end
$fn$;
revoke all on function public.record_account_cleanup(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.record_account_cleanup(uuid, boolean, text) to service_role;
comment on function public.record_account_cleanup(uuid, boolean, text) is
  'production-36h S1 M3, service_role only (process-settlements): records one try of an account_cleanups row. The customer step reported done is done for good; reported not done, it keeps what it was. Done: finished_at, last_error cleared. Otherwise attempts + 1, last_error (its first 500 characters; the caller writes a status and a code, never a secret) and the next try 5 minutes later in the first hour after the deletion, 1 hour later after that. Customer done: payment_accounts.stripe_customer_id is cleared, only while it still holds the recorded id. The payout account in payment_accounts is never touched.';

-- 5. The owner's view.
-- A10-06 (decision 15): the payment list's shape (code, reason, since, detail, finish); a row is
-- listed once its customer step has been open for 1 hour since it was last opened, whether or not a
-- try ran.
create view public.account_cleanup_attention as
select c.id,
       c.user_id,
       c.step_opened_at as since,
       'A deleted account''s Stripe customer is not deleted yet. The app tries again by itself. If this line stays, delete the customer named in the detail in the Stripe dashboard. If Stripe does not show that customer, ask your developer.'::text as reason,
       'Stripe customer ' || coalesce(c.stripe_customer_id, 'none') || '; last try: '
         || coalesce(c.last_error, 'none recorded yet') as detail,
       c.attempts,
       'cleanup_customer_open'::text as code,
       'stripe'::text as finish
from public.account_cleanups c
where c.finished_at is null
  and c.step_opened_at <= now() - interval '1 hour';
revoke all on table public.account_cleanup_attention from public, anon, authenticated, service_role;
grant select on table public.account_cleanup_attention to service_role;
comment on view public.account_cleanup_attention is
  'production-36h S1 M3, the owner''s list of deleted accounts whose Stripe customer is not deleted yet: select * from public.account_cleanup_attention order by since; One row per account_cleanups row not finished whose customer step has been open for 1 hour since step_opened_at (A10-06), whether or not a try ran. The payment list''s shape: code cleanup_customer_open; reason, one plain sentence (what is not deleted, who finishes it and how); since, when the step was last opened; detail, the Stripe customer id and the last error (a status and a code) or none recorded yet; finish stripe; attempts. service_role only. payment_attention is unchanged.';

-- 6. set_payment_customer. Restated from the live body (settlement_schedules); the new statements are
--    (a1) and (a2). Its grants and comment restated, the comment with the new sentences.
create or replace function public.set_payment_customer(p_user_id uuid, p_customer_id text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_effective text;
begin
  if p_user_id is null or coalesce(p_customer_id, '') = '' then
    raise exception 'set_payment_customer: user id and customer id are required';
  end if;

  -- (a1) A11-06: the account lock (lock_account, shared; ban_switch 2c), before the account is read
  --      and before any row lock. delete_my_account takes it exclusive: this save waits for a deletion
  --      in flight and then sees its tombstone, or the deletion waits for this save and then reads
  --      the id it stored (its step (h)).
  perform public.lock_account(p_user_id, true);

  -- (a2) A10-03: a deleted account gets no customer in payment_accounts. The provider made this one
  --      for it while the deletion ran: it goes to the account's cleanup row, so the settlements timer
  --      deletes it at Stripe, only while that row names no customer, and the step is opened again.
  --      A row that already names another customer keeps it. Nothing is returned: the account has no
  --      customer to use.
  if exists (select 1 from public.profiles p where p.id = p_user_id and p.deleted_at is not null) then
    update public.account_cleanups c
       set stripe_customer_id = p_customer_id,
           customer_done = false,
           finished_at = null,
           next_attempt_at = now(),
           step_opened_at = now()
     where c.user_id = p_user_id
       and c.stripe_customer_id is null;
    return null;
  end if;

  -- FIRST WRITER WINS, and the winner is what comes back. Two concurrent
  -- checkouts for one user can both reach the provider before either stores
  -- anything; coalesce keeps the reference that is already recorded and
  -- returns it, so the caller uses the stored customer rather than the one it
  -- happened to create. Nothing here is monetary and nothing is overwritten.
  insert into public.payment_accounts as a (user_id, stripe_customer_id)
  values (p_user_id, p_customer_id)
  on conflict (user_id) do update
     set stripe_customer_id = coalesce(a.stripe_customer_id, excluded.stripe_customer_id),
         updated_at = now()
  returning a.stripe_customer_id into v_effective;

  return v_effective;
end;
$function$;

-- Live grants and comment restated; the comment gains the A10-03 and A11-06 sentences.
revoke all on function public.set_payment_customer(uuid, text) from public, anon, authenticated;
grant execute on function public.set_payment_customer(uuid, text) to service_role;
comment on function public.set_payment_customer(uuid, text) is
  'service_role only (R5 create-payment): stores this user''s provider customer id once and returns the EFFECTIVE one. An id already recorded is never overwritten, so a race between two checkouts converges on a single customer rather than orphaning one. A11-06: it takes the account lock (lock_account, shared) before it reads the account. A10-03: for a deleted account it writes payment_accounts nothing and returns null; the id goes to the account''s account_cleanups row while that row names no customer, and opens its step again, so the settlements timer deletes the customer at Stripe.';

commit;
