-- ban_switch — production-36h S1, M2 (the ban). A ban now ends the banned person's open business with
-- other people (Terms section 12: their unfinished jobs are cancelled), and only an ACTIVE admin can
-- ban, unban, list or dismiss reports.
--
-- 1. current_user_is_admin() (A3) answers true only for an admin who is neither banned nor deleted.
--    It stays a policy helper (reports_select_admin, reports_update_admin): a boolean, never an error.
-- 2. The cancel path, split (S4-01): public.cancel_job_core(p_job_id, p_reason, p_actor) holds
--    cancel_job()'s live body, keyed on p_actor instead of the caller. No client and no service role
--    may call it. cancel_job(p_job_id, p_reason) is now a thin wrapper: its old caller check, a
--    refusal of every reason but the three caller reasons ('Unknown cancellation reason'), then the
--    core with the caller as actor. Every party, reason, status and payment check, and every money
--    rule, stays inside the core, so the customer's own cancel, the worker's own cancel and the ban
--    run one implementation. A null actor is refused. A8-01: the core has one more reason,
--    account_suspended, the ban's own mode, which cancel_job() refuses:
--      - the job is ALWAYS cancelled (the customer's open, hired or started job; the worker's hired or
--        started job), cancelled_at stamped, cancelled_by and cancel_reason null (closed by Brazos, as
--        the closing sweeps write it; the cancel_reason check is unchanged);
--      - the money keeps its rule, A11's: a checkout never finished is voided as cancel_job() voids
--        it; a held payment with no direction yet (nothing refunded, transferred or released) is
--        refunded in full, reason account_suspended, except on the customer's STARTED job, where it
--        stays held and directed nowhere for the operator (A11 review 2: the worker has been working);
--        a payment that already has a direction (a release requested, a transfer or a refund set, or a
--        part refund made outside the app) keeps it: a ban never claws money back;
--      - the OTHER party gets one notice, category jobs (always on), type job_cancelled, title "Job
--        cancelled", the data the customer's and worker's own cancel notices carry (screen WorkerJob or
--        ClientJobDetail, jobId). To the worker: "Brazos cancelled this job. Open it to see what
--        happens with the payment." To the customer, by the payment's state after the ban's own
--        writes: refunded in full by this ban, "Brazos cancelled this job. Your payment is being
--        refunded in full.", or, while a card dispute holds it, "Brazos cancelled this job. Your bank
--        is reviewing this payment. Your refund waits for the bank's decision."; no money ever came
--        in, "Brazos cancelled this job. It was not paid for yet."; any other state, the worker's
--        neutral sentence. An open job has nobody else on it and gets no notice.
--    2c. A8-02: NEW lock_account(p_id, p_shared), the repo's first advisory lock: a transaction lock
--    on (400500, hashtext(p_id)), shared or exclusive. No client and no service role may call it.
--    Its callers, each before any row lock of its transaction: accept_offer() and counter_offer()
--    take it shared for both parties, the lower id first (active_account_rule; counter_offer's is
--    A11-09); set_payment_customer() shared for the account (account_deletion_process, A11-06);
--    ban_user() exclusive for the account; delete_my_account() exclusive for the caller
--    (account_deletion_process); the repair pass (8) exclusive for each suspended account, in id
--    order. So an accept or a counter and a ban or a deletion of one of its two parties never
--    overlap: the later one waits, then reads afresh. The account lock adds no new lock cycle; one
--    inherited cycle exists: a ban or a deletion of an account against a decline or a withdrawal
--    (decline_offer(), withdraw_offer(), by either party) of a pending offer of that account whose
--    thread belongs to an older job of the account (the decline or the withdrawal holds the offer and
--    needs the foreign-key lock on the older job for its thread line; the ban or the deletion holds
--    the older job and waits for the offer). Postgres ends one of the two calls with an error, and
--    the call can be made again. The same cycle through counter_offer() (A11-09: the counter holds
--    the new job and its offer and needs the older job for its thread line) is closed by its account
--    locks: the counter and the ban or the deletion no longer both hold a row lock.
--    WRITTEN LIMIT (A14-F, C14-06), that one cycle: its end is clean. Postgres stops one of the two
--    transactions with a deadlock error (40P01) and rolls the whole of it back: no money moves, no row
--    is half-written, and the call can be made again; a deletion stopped this way leaves the account
--    as it was (the installed app may already have removed its saved cards). The recipe for a later
--    corrective file: in withdraw_offer() and decline_offer(), after the guard, read the offer without
--    a lock, read the job its thread line will name (the job of the root offer's 'created' message,
--    offer_post_event()'s own read), take that job's key-share lock (select 1 from jobs where id =
--    that job for key share), and only then the offer's row lock and every check as today. Every path
--    then locks the job before the offer.
-- 3. ban_user(), re-created from its live body (lean_v1's):
--    - the admin check goes through current_user_is_admin() (A3), and an admin account (the caller's
--      own included) cannot be banned (S4-10);
--    - then the account lock, exclusive (2c);
--    - every job of the account is locked next (delete_my_account's lock order);
--    - every unfinished job of the account is cancelled through cancel_job_core(job,
--      'account_suspended', account) (section 2). A draft or a done job is not touched;
--    - then every pending offer still open on other people's jobs is settled through the new
--      settle_offers_of_suspended(): an offer the banned person sent is withdrawn, an offer waiting
--      on them is declined, each with the chain event their own withdraw_offer() or decline_offer()
--      posts. The cancellations and the settlements run BEFORE the account is marked banned, while it
--      is still active (the path account deletion takes: delete_my_account() cancels and withdraws
--      before it writes deleted_at). Nothing is addressed to the banned person;
--    - then the account is marked banned. B1: it no longer copies profiles.phone (a field the user
--      can edit) into banned_phones; the profiles_ban_record_sign_in_phone trigger, which fires on the
--      same UPDATE, records the phone the account signs in with. unban_user() still removes every row;
--    - then the thread line on each job it cancelled that has another party, word for word as before,
--      and its push tokens are switched off.
--      register_push_token() switches a token back on at the next signed-in launch, so an unban needs
--      nothing. No sign-in ban: auth.users.banned_until is never set (a banned person must still be
--      able to sign in and delete the account).
--    An unban gives the account back. It does not bring back a cancelled job, a settled offer or a
--    series the series sweep stopped.
--    WRITTEN LIMIT (A14-F, C14-05): a suspended worker's FINISHED job (completed, its payment still
--    held) is not touched by the ban. It follows the normal approval (the customer's own, or the
--    automatic one) and the normal payout (transfers_ready asks only for the payout account, not for
--    the ban), and the customer gets no notice of the ban. Terms section 12
--    (lib/legal/termsOfService.ts:349-353) speaks only of unfinished jobs. The customer can still
--    report an issue on the finished job (open_job_dispute), which stops the payout while it is open.
-- 4. unban_user(): the admin check goes through current_user_is_admin(); nothing else changes.
-- 5. my_pending_offers() (S4-03): an offer whose author is no longer active is not listed.
-- 6. NEW admin_open_reports_v2(): admin_open_reports()'s twelve columns plus subject_kind, subject_id
--    and subject_text (the first 200 characters of the reported review or message, or the job's
--    title; null for a profile or a portfolio item). admin_open_reports() itself stays until the app
--    reads the new one (a REMOVE, parked).
-- 7. NEW dismiss_report(): an active admin dismisses an OPEN report; true when it did, false when the
--    report was not open. The reports UPDATE right stays until the app uses this call (parked).
-- 8. NEW repair_suspended_jobs() (A11-02), run once here: every unfinished job that still has a
--    suspended party (banned, not deleted) gets the ban's own treatment, cancel_job_core()'s
--    account_suspended mode with its notice: as a customer its open, hired or started jobs, as a
--    worker its hired or started jobs. Customer side first, so on a job whose two parties are both
--    suspended the customer's row decides (a started job keeps its payment held). ban_user()'s lock
--    order. No exception is caught: if it fails, this file fails. A second run finds nothing. No
--    client and no service role may call it. On a database with no such job it changes nothing.
-- 9. Backfill, once: accounts banned or deleted before this file have their pending offers settled
--    and their push tokens switched off. UPDATEs only.
--
-- Every function keeps or gets explicit rights. The guard line (active_account_rule) is added to the
-- client-executable ones by that file, which runs last.
--
-- 0. The order rule: each function this file restates was rewritten from the body the database held
--    at 20261116000000 (still the same after the money lane's 20261116290000 ... 20261116300500). Before anything is changed, the file checks that none of the names it makes
--    new exists yet (0a), makes the fingerprint helper (0b), then checks the fingerprint of each live
--    definition (body, settings and shape; A8-06) against the definition it was written from (0c); if
--    another migration changed one of them first, the file stops, so an older body is never copied
--    over a newer one, and the message names each such function with the fingerprint it found.
--    Re-derive the function from the live definition, then update its fingerprint here.
--    0b. NEW function_fingerprint(p_fn regprocedure): the md5 of one fixed-order list of catalog
--    values: the body (prosrc, carriage returns removed), the settings (proconfig), the language,
--    the kind, security definer, leakproof, strict, set-returning, volatility and parallel flags, and
--    the arguments (defaults included) and the result as pg_get_function_arguments() and
--    pg_get_function_result() print them. It runs with an empty search_path, so every type outside
--    pg_catalog is printed with its schema whatever the caller's search_path; md5 of
--    pg_get_functiondef() is not used, because it names a type's schema only when the session's
--    search_path does not reach the type, and its layout belongs to the server version. Every order
--    rule of the access lane (ban_switch, ban_hides_content, active_account_rule,
--    account_deletion_process) and test 475 compare it. No client and no service role may call it.
--    WRITTEN LIMIT (A14-F, C14-08; this corrects the wording "never printed function text"): two of
--    those values ARE printed text. pg_get_function_arguments() and pg_get_function_result() deparse
--    the catalog; they print the same on the Postgres major version this repo runs
--    (supabase/config.toml), and a new major version may print them differently, so every pin is taken
--    again after such an upgrade. The fingerprint is blind to the grants (proacl), the owner, the
--    comment, the cost and prosqlbody: a grant changed on a pinned function is not seen (each file
--    restates its grants by hand), and a SQL-standard body (begin atomic) has an empty prosrc, so a
--    change to it is not seen (no function in public has one today). A later corrective file adds
--    proacl, proowner and prosqlbody to the list and takes every pin again.

begin;

-- ---------------------------------------------------------------------------------------------------
-- 0. The order rule.
-- ---------------------------------------------------------------------------------------------------
-- 0a. None of the names this file makes new exists yet.
do $new_names$
declare
  v_bad text;
begin
  select string_agg(n.sig, ', ' order by n.sig) into v_bad
  from (values
    ('public.function_fingerprint(regprocedure)'),
    ('public.cancel_job_core(uuid,text,uuid)'),
    ('public.lock_account(uuid,boolean)'),
    ('public.settle_offers_of_suspended(uuid)'),
    ('public.repair_suspended_jobs()'),
    ('public.admin_open_reports_v2()'),
    ('public.dismiss_report(uuid)')
  ) as n(sig)
  where to_regprocedure(n.sig) is not null;
  if v_bad is not null then
    raise exception 'ban_switch: a function this file makes new already exists (re-derive from it): %', v_bad;
  end if;
end
$new_names$;

-- 0b. The fingerprint the order rules and test 475 compare. Invoker rights: it reads only the
--     catalog, which every role can read.
create function public.function_fingerprint(p_fn regprocedure)
returns text
language sql
stable
set search_path = ''
as $function$
  select pg_catalog.md5(pg_catalog.jsonb_build_array(
           pg_catalog.replace(p.prosrc, pg_catalog.chr(13), ''),
           p.proconfig,
           l.lanname,
           p.prokind,
           p.prosecdef,
           p.proleakproof,
           p.proisstrict,
           p.proretset,
           p.provolatile,
           p.proparallel,
           pg_catalog.pg_get_function_arguments(p.oid),
           pg_catalog.pg_get_function_result(p.oid))::pg_catalog.text)
  from pg_catalog.pg_proc p
  join pg_catalog.pg_language l on l.oid = p.prolang
  where p.oid = p_fn;
$function$;

revoke all on function public.function_fingerprint(regprocedure) from public, anon, authenticated, service_role;

comment on function public.function_fingerprint(regprocedure) is
  'ban_switch (0b): the md5 of one fixed-order jsonb list of catalog values of the function: prosrc with carriage returns removed, proconfig, the language name, prokind, prosecdef, proleakproof, proisstrict, proretset, provolatile, proparallel, pg_get_function_arguments() and pg_get_function_result(), the last two printed under an empty search_path (every type outside pg_catalog with its schema). The same on every session and server layout, unlike md5 of pg_get_functiondef(). The access lane''s order rules and test 475 compare it; no client and no service role may call it.';

-- 0c. Each restated function is still the one it was written from.
do $order_rule$
declare
  v_bad text;
begin
  select string_agg(w.sig || ' found=' || coalesce(public.function_fingerprint(p.oid::pg_catalog.regprocedure), 'none'),
                    ', ' order by w.sig) into v_bad
  from (values
    -- each restated on purpose; sections 1, 2, 3, 4 and 5 say what changes
    ('public.current_user_is_admin()',  'd5cd20c693c66660e89e8e611a65f080'),
    ('public.cancel_job(uuid,text)',    '735b015a96fa5304b59109b1e766c244'),
    ('public.ban_user(uuid,uuid)',      'b209b799eb8579ac18a4ca71dd332f3c'),
    ('public.unban_user(uuid)',         '1159ae68c41cf3cb6cfa14d8ba84cde0'),
    ('public.my_pending_offers()',      'ca5427a2e2f465dd62166019769eed0a')
  ) as w(sig, md5)
  left join pg_catalog.pg_proc p on p.oid = to_regprocedure(w.sig)
  where p.oid is null or public.function_fingerprint(p.oid::pg_catalog.regprocedure) is distinct from w.md5;
  if v_bad is not null then
    raise exception 'ban_switch: written from a definition that is no longer live (re-derive from the live definition): %', v_bad;
  end if;
end
$order_rule$;

-- ---------------------------------------------------------------------------------------------------
-- 1. A3: an admin must be active.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_admin, false)
      and not coalesce(p.banned, false)
      and p.deleted_at is null
  );
$function$;

revoke all on function public.current_user_is_admin() from public, anon, service_role;
grant execute on function public.current_user_is_admin() to authenticated;

comment on function public.current_user_is_admin() is
  'A3 (ban_switch): true only when the caller is an admin who is neither banned nor deleted. A policy helper (reports_select_admin, reports_update_admin) and the check inside ban_user, unban_user, admin_open_reports_v2 and dismiss_report: it returns a boolean and never raises.';

-- ---------------------------------------------------------------------------------------------------
-- 2a. The cancel path's one implementation. cancel_job()'s live body (money_notices), keyed on p_actor.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.cancel_job_core(p_job_id uuid, p_reason text, p_actor uuid)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor       uuid := p_actor;
  v_now         timestamptz := now();
  v_job         public.jobs;
  v_payment     public.payments;
  v_is_customer boolean;
  v_is_worker   boolean;
  v_terms       record;
  v_free        boolean;
  v_fee         integer := 0;
  v_charge      integer;
  v_anchor      timestamptz;
  v_window_end  timestamptz;
  v_other       uuid;
  v_reason      text := p_reason;
  v_voided      boolean := false;
  v_refunded    boolean := false;
begin
  -- The actor is the person the cancellation acts for. Who may name an actor is the caller's
  -- business: cancel_job() names the signed-in caller, ban_user() the banned account.
  if v_actor is null then raise exception 'Active authentication required'; end if;
  if p_reason is null
     or p_reason not in ('customer_cancelled', 'worker_cancelled', 'customer_no_show', 'account_suspended') then
    raise exception 'Unknown cancellation reason';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then raise exception 'Job not found'; end if;
  v_is_customer := (v_job.client_id = v_actor);
  v_is_worker   := (v_job.assigned_worker_id is not null and v_job.assigned_worker_id = v_actor);
  if not v_is_customer and not v_is_worker then raise exception 'Job not found'; end if;

  -- A8-01, account_suspended (Terms section 12): ban_user()'s own mode, p_actor the suspended account.
  -- cancel_job() refuses this reason, and no client or service role may call this function. The job
  -- is always cancelled: the customer's open, hired or started job, the worker's hired or started job.
  -- The money keeps its rule, as A11 wrote it: a checkout never finished is voided; a held payment
  -- with no direction yet (nothing refunded, transferred or released) is refunded in full, reason
  -- account_suspended, except on the customer's started job, where it stays held and directed nowhere
  -- for the operator (A11 review 2); a payment that already has a direction keeps it. Closed by
  -- Brazos, so cancelled_by and cancel_reason stay null (as the closing sweeps write them). The OTHER
  -- party gets one 'jobs' notice; the banned account's thread line is ban_user()'s.
  if p_reason = 'account_suspended' then
    if not ((v_is_customer and v_job.status in ('open', 'assigned', 'in_progress'))
            or (v_is_worker and v_job.status in ('assigned', 'in_progress'))) then
      raise exception 'This job cannot be cancelled from its current state (%)', v_job.status;
    end if;

    -- Lock order: the job row first, then the payment.
    select * into v_payment from public.payments
     where job_id = p_job_id and kind = 'job_payment' and status not in ('failed', 'voided') for update;
    if v_payment.id is null then
      null;
    elsif v_payment.status in ('unfunded', 'authorized') then
      update public.payments
         set status = 'voided', last_error = 'job cancelled before funding', updated_at = v_now
       where id = v_payment.id;
      v_voided := true;
    elsif v_payment.status = 'held'
          and coalesce(v_payment.refund_cents, 0) = 0
          and coalesce(v_payment.transfer_cents, 0) = 0
          and v_payment.release_requested_at is null
          and not (v_is_customer and v_job.status = 'in_progress') then
      update public.payments
         set refund_cents = charge_amount_cents, transfer_cents = 0, refund_reason = 'account_suspended',
             updated_at = v_now
       where id = v_payment.id;
      v_refunded := true;
    end if;

    update public.jobs
       set status = 'cancelled'::public.job_status,
           cancelled_at = v_now,
           cancelled_by = null,
           cancel_reason = null
     where id = p_job_id
    returning * into v_job;

    -- One notice to the OTHER party (none on an open job: nobody else is on it). Each sentence is
    -- true for every row that gets it; any payment state not named gets the neutral sentence.
    v_other := case when v_is_customer then v_job.assigned_worker_id else v_job.client_id end;
    if v_other is not null then
      perform public.enqueue_notification(
        v_other, v_actor, 'jobs', 'job_cancelled',
        'Job cancelled',
        case
          when v_is_customer
            then 'Brazos cancelled this job. Open it to see what happens with the payment.'
          when v_refunded and public.payment_refund_held_by_dispute(v_payment.id)
            then 'Brazos cancelled this job. Your bank is reviewing this payment. Your refund waits for the bank''s decision.'
          when v_refunded
            then 'Brazos cancelled this job. Your payment is being refunded in full.'
          when (v_payment.id is null or v_voided)
               and not exists (select 1 from public.payments p
                                where p.job_id = p_job_id and p.kind = 'job_payment'
                                  and (p.held_at is not null or coalesce(p.received_cents, 0) > 0
                                       or coalesce(p.refund_cents, 0) > 0))
            then 'Brazos cancelled this job. It was not paid for yet.'
          else 'Brazos cancelled this job. Open it to see what happens with the payment.'
        end,
        jsonb_build_object('screen', case when v_is_customer then 'WorkerJob' else 'ClientJobDetail' end,
                           'jobId', p_job_id::text),
        'job_cancelled:' || p_job_id::text
      );
    end if;

    return v_job;
  end if;

  -- The caller's role must match the reason.
  if p_reason = 'customer_cancelled' and not v_is_customer then
    raise exception 'Only the customer can cancel as the customer';
  end if;
  if p_reason in ('worker_cancelled', 'customer_no_show') and not v_is_worker then
    raise exception 'Only the assigned worker can cancel as the worker';
  end if;

  -- Job status admitted: open and draft (customer only), assigned and
  -- in_progress (either party). Allow-list, never a block-list.
  if v_job.status = 'cancelled' then raise exception 'This job is already cancelled'; end if;
  if v_job.status = 'completed' then raise exception 'This job is finished and can no longer be cancelled'; end if;
  if v_job.status not in ('open', 'draft', 'assigned', 'in_progress') then
    raise exception 'This job cannot be cancelled from its current state (%)', v_job.status;
  end if;
  if v_job.status in ('open', 'draft') and not v_is_customer then
    raise exception 'Only the customer can cancel a job that has no worker';
  end if;

  -- Lock order: the job row first, then the payment.
  select * into v_payment from public.payments
   where job_id = p_job_id and kind = 'job_payment' and status not in ('failed', 'voided') for update;
  if found and v_payment.status in ('released', 'paid_out', 'refunded', 'partially_refunded') then
    raise exception 'This job''s payment has already settled.';
  end if;
  if found and v_payment.status not in ('unfunded', 'authorized', 'held') then
    raise exception 'This job''s payment is in a state that cannot be cancelled automatically (%)', v_payment.status;
  end if;

  -- D6: the four no-show gates. A no-show is a CLAIM: it moves no money by
  -- itself (arrived_at and the claim are both worker-controlled). Only
  -- resolve_job_dispute() moves that money. The worker may still cancel as
  -- worker_cancelled instead.
  if p_reason = 'customer_no_show' then
    if v_job.status <> 'assigned' then raise exception 'A no-show can only be reported before the work starts'; end if;
    if v_job.arrived_at is null then raise exception 'Mark that you arrived before reporting a no-show'; end if;
    if v_job.scheduled_date is null then raise exception 'A no-show can only be reported on a scheduled job'; end if;
    v_window_end := public.job_window_end(v_job.scheduled_date, v_job.arrival_end_hour);
    if v_now <= v_window_end then raise exception 'A no-show can be reported once the arrival window has passed'; end if;
  end if;

  if v_payment.id is null then
    null;   -- no money: nothing to void, nothing to refund, nothing for R5
  elsif v_payment.status in ('unfunded', 'authorized') then
    -- Nothing was ever captured ('authorized' occurs only on legacy sandbox rows).
    update public.payments
       set status = 'voided', last_error = 'job cancelled before funding', updated_at = v_now
     where id = v_payment.id;
  else
    -- held in protection: the money branches. The charge = price + protection
    -- fee + tax; the fee, when it applies, is taken from the price alone, so
    -- the protection fee and tax are refunded in full in every case.
    v_charge := v_payment.charge_amount_cents;

    if p_reason = 'customer_cancelled' then
      -- D5, in this order: in_progress always carries the fee; otherwise free
      -- when there is no scheduled_date, or within 15 minutes of acceptance
      -- (snapshot only), or (B8) when the worker missed the window, or more
      -- than 24h before the anchor.
      select * into v_terms from public.job_terms(p_job_id, v_payment.amount_cents);
      if v_job.status = 'in_progress' then
        v_free := false;
      elsif v_job.scheduled_date is null then
        v_free := true;
      elsif v_terms.accepted_at is not null and v_now - v_terms.accepted_at <= interval '15 minutes' then
        v_free := true;
      elsif public.worker_missed_window(v_job, v_now) then
        -- B8: never marked arrived, and the window plus the reported delay is over: no fee.
        v_free := true;
        v_reason := 'worker_no_show';
      else
        v_anchor := (v_job.scheduled_date::timestamp + make_interval(hours => coalesce(v_job.arrival_start_hour, 0)::int))
                    at time zone 'America/New_York';
        v_free := v_now < v_anchor - interval '24 hours';
      end if;

      if v_free then
        perform public.queue_free_cancel_refund(v_payment.id);
      else
        v_fee := public.cancellation_fee_cents(p_job_id, v_payment.amount_cents);
        update public.payments
           set transfer_cents = v_fee, refund_cents = v_charge - v_fee,
               release_reason = 'cancellation_fee', release_requested_at = v_now,
               refund_reason = 'customer_cancelled_late',
               updated_at = v_now
         where id = v_payment.id;
      end if;

    elsif p_reason = 'worker_cancelled' then
      update public.payments
         set refund_cents = v_charge, transfer_cents = 0, refund_reason = 'worker_cancelled',
             updated_at = v_now
       where id = v_payment.id;

    else
      -- customer_no_show: the payment stays held, untouched. The claim is a
      -- job_disputes row the customer is notified of (notify_on_dispute);
      -- resolve_job_dispute() applies the fee or refunds in full, and a
      -- withdrawal refunds in full by trigger.
      insert into public.job_disputes (job_id, payment_id, opened_by, reason, status, details)
      values (p_job_id, v_payment.id, v_actor, 'no_show', 'open',
              'The worker reported a customer no-show: arrived at ' || v_job.arrived_at::text
              || ', arrival window ended ' || v_window_end::text || '.');
    end if;
  end if;

  update public.jobs
     set status = 'cancelled'::public.job_status,
         cancelled_at = v_now,
         cancelled_by = v_actor,
         cancel_reason = v_reason
   where id = p_job_id
  returning * into v_job;
  -- jobs_settle_offers_on_cancel (AFTER UPDATE OF status) declines the job's
  -- pending offers; the accepted offer keeps its history.

  -- Exactly one notification to the OTHER party. A no-show sends none from
  -- here: the customer's notice is the dispute row's own (notify_on_dispute),
  -- and "refunded in full" would be untrue while the claim is open.
  if p_reason <> 'customer_no_show' then
    v_other := case when v_is_customer then v_job.assigned_worker_id else v_job.client_id end;
    if v_other is not null then
      if v_is_customer then
        perform public.enqueue_notification(
          v_other, v_actor, 'jobs', 'job_cancelled',
          'Job cancelled',
          'The customer cancelled this job. Open it to see what happens with the payment.',
          jsonb_build_object('screen', 'WorkerJob', 'jobId', p_job_id::text),
          'job_cancelled:' || p_job_id::text
        );
      else
        perform public.enqueue_notification(
          v_other, v_actor, 'jobs', 'job_cancelled',
          'Job cancelled',
          case when public.payment_refund_held_by_dispute(v_payment.id)
               then 'The worker cancelled this job. Your bank is reviewing this payment. Your money comes back when the bank decides.'
               when v_payment.id is null or v_payment.status in ('unfunded', 'authorized')
               then 'The worker cancelled this job. It was not paid for yet. If a charge still comes through, it is refunded in full.'
               else 'The worker cancelled this job. Your payment is being refunded in full.'
          end,
          jsonb_build_object('screen', 'ClientJobDetail', 'jobId', p_job_id::text),
          'job_cancelled:' || p_job_id::text
        );
      end if;
    end if;
  end if;

  return v_job;
end $function$;

revoke all on function public.cancel_job_core(uuid, text, uuid) from public, anon, authenticated, service_role;

comment on function public.cancel_job_core(uuid, text, uuid) is
  'ban_switch (S4-01): THE cancel path, one implementation. cancel_job()''s rules, keyed on p_actor (the person the cancellation acts for; null is refused): p_reason customer_cancelled (p_actor is the customer; free outside the window, within the 15-minute grace, or when the worker missed the window and never marked arrived, recorded as worker_no_show; otherwise the cancellation fee to the worker), worker_cancelled (p_actor is the worker; full refund), customer_no_show (p_actor is the worker, after arriving, once the window passed; a claim resolve_job_dispute decides). A8-01: account_suspended (p_actor is the suspended account; ban_user() only, cancel_job() refuses it): the customer''s open, hired or started job or the worker''s hired or started job is always cancelled, cancelled_at stamped, cancelled_by and cancel_reason null; a checkout never finished is voided, an undirected held payment is refunded in full (refund_reason account_suspended) except on the customer''s started job, where it stays held and undirected, and a payment that already has a direction keeps it; the other party gets one jobs notice "Brazos cancelled this job." with a sentence true for the payment''s state. Terminal. Called by cancel_job() (the signed-in caller) and ban_user() (the banned account); no client and no service role may call it. A later restatement keeps this argument list and restates only the body.';

-- ---------------------------------------------------------------------------------------------------
-- 2b. cancel_job(): the caller's own cancel, a thin wrapper.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.cancel_job(p_job_id uuid, p_reason text)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'Active authentication required'; end if;
  -- A8-01: a caller passes only the three caller reasons; account_suspended is ban_user()'s own.
  if p_reason is null or p_reason not in ('customer_cancelled', 'worker_cancelled', 'customer_no_show') then
    raise exception 'Unknown cancellation reason';
  end if;
  return public.cancel_job_core(p_job_id, p_reason, auth.uid());
end $function$;

revoke all on function public.cancel_job(uuid, text) from public, anon, service_role;
grant execute on function public.cancel_job(uuid, text) to authenticated;

comment on function public.cancel_job(uuid, text) is
  'The lifecycle exit. p_reason: customer_cancelled (the customer; free outside the window, within the 15-minute grace, or when the worker missed the window and never marked arrived, recorded as worker_no_show; otherwise the cancellation fee to the worker), worker_cancelled (the worker; full refund), customer_no_show (the worker, after arriving, once the window passed; a claim resolve_job_dispute decides). Terminal. ban_switch: the signed-in caller''s own cancel; the rules live in cancel_job_core(), with the caller as actor. Any other reason, account_suspended included, is refused with ''Unknown cancellation reason'' before the core.';

-- ---------------------------------------------------------------------------------------------------
-- 2c. The account lock (A8-02).
-- ---------------------------------------------------------------------------------------------------
create or replace function public.lock_account(p_id uuid, p_shared boolean)
returns void
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if p_shared then
    perform pg_advisory_xact_lock_shared(400500, hashtext(p_id::text));
  else
    perform pg_advisory_xact_lock(400500, hashtext(p_id::text));
  end if;
end;
$function$;

revoke all on function public.lock_account(uuid, boolean) from public, anon, authenticated, service_role;

comment on function public.lock_account(uuid, boolean) is
  'ban_switch (A8-02): the account lock, a transaction advisory lock on (400500, hashtext(p_id)), shared when p_shared, else exclusive; it ends with the transaction. accept_offer() takes it shared for both parties, the lower id first; ban_user(), delete_my_account() and repair_suspended_jobs() take it exclusive; each before any row lock. No client and no service role may call it.';

-- ---------------------------------------------------------------------------------------------------
-- 3a. Settling the pending offers a suspended or deleted person is still part of. Definer code only.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.settle_offers_of_suspended(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_offer record;
  v_event text;
  v_settled integer := 0;
begin
  if p_user is null then
    return 0;
  end if;

  -- An offer already past its deadline is left to expire the canonical way, as delete_my_account()
  -- leaves it (expire_offer_if_stale(), at the next touch).
  for v_offer in
    select o.id, o.root_offer_id, o.amount_cents, o.author_id
    from public.job_offers o
    where o.status = 'pending'
      and p_user in (o.customer_id, o.worker_id)
      and (o.expires_at is null or o.expires_at > now())
    order by o.created_at
    for update
  loop
    v_event := case when v_offer.author_id = p_user then 'withdrawn' else 'declined' end;

    -- withdraw_offer()'s and decline_offer()'s own update and chain event, p_user as actor.
    update public.job_offers
       set status = v_event::public.offer_status, awaiting_id = null, updated_at = now()
     where id = v_offer.id;
    v_settled := v_settled + 1;

    -- As in settle_offers_on_cancelled_job(), a thread that cannot take the event does not undo
    -- the settlement.
    begin
      perform public.offer_post_event(
        v_offer.id, v_offer.root_offer_id, p_user, v_event, v_offer.amount_cents
      );
    exception when others then
      raise notice 'ban_switch: chain event for offer % not posted (%)', v_offer.id, sqlerrm;
    end;
  end loop;

  return v_settled;
end;
$function$;

revoke all on function public.settle_offers_of_suspended(uuid) from public, anon, authenticated, service_role;

comment on function public.settle_offers_of_suspended(uuid) is
  'ban_switch: settles every pending, unexpired offer p_user is part of: the ones p_user sent are withdrawn, the ones waiting on p_user are declined, each with the chain event withdraw_offer() or decline_offer() posts, p_user as actor. Called by ban_user() (before the account is marked banned, so the other person is told as on a withdraw or decline) and by the ban_switch backfill; no client may call it. Returns how many offers it settled.';

-- ---------------------------------------------------------------------------------------------------
-- 3b. ban_user(), re-created once.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.ban_user(p_target uuid, p_report_id uuid default null::uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_job record;
  v_other uuid;
  v_jobs uuid[] := '{}';
  v_i integer;
begin
  -- A3: only an ACTIVE admin.
  if not public.current_user_is_admin() then
    raise exception 'Only admins may ban users';
  end if;
  -- S4-10: never the caller's own account, never an admin account.
  if p_target = auth.uid()
     or exists (select 1 from public.profiles p where p.id = p_target and coalesce(p.is_admin, false)) then
    raise exception 'An admin account cannot be banned in the app.';
  end if;

  -- A8-02: the account lock, exclusive, before any row lock. An accept that names this account
  -- (accept_offer() takes it shared) waits for this ban, or this ban waits for that accept.
  perform public.lock_account(p_target, false);

  -- Every job of the account, locked next: delete_my_account()'s order (jobs, then payments).
  perform 1
  from public.jobs
  where client_id = p_target or assigned_worker_id = p_target
  order by id
  for update;

  -- A8-01 (Terms section 12): every unfinished job of the account is cancelled through the one cancel
  -- path's account_suspended mode, the account as actor: the customer's open, hired or started job,
  -- the worker's hired or started job. A draft or a done job is not touched. The money keeps its rule
  -- there (cancel_job_core()): a ban never claws back money that already has a direction.
  for v_job in
    select j.id, j.client_id, j.assigned_worker_id
    from public.jobs j
    where (j.client_id = p_target and j.status in ('open', 'assigned', 'in_progress'))
       or (j.assigned_worker_id = p_target and j.client_id is distinct from p_target
           and j.status in ('assigned', 'in_progress'))
    order by j.id
  loop
    perform public.cancel_job_core(v_job.id, 'account_suspended', p_target);
    v_other := case when v_job.client_id = p_target then v_job.assigned_worker_id else v_job.client_id end;
    if v_other is not null then
      v_jobs := v_jobs || v_job.id;
    end if;
  end loop;

  -- The offers still open on other people's jobs (the cancellations above settled the ones on the
  -- jobs they cancelled, through jobs_settle_offers_on_cancel), so no Accept waits on this account.
  perform public.settle_offers_of_suspended(p_target);

  -- B1: the profiles_ban_record_sign_in_phone trigger records the sign-in phone on this UPDATE.
  update public.profiles set banned = true where id = p_target;

  -- The thread line on each job this ban cancelled, as before. There's no system-sender concept in
  -- `messages`, so it is attributed to the banned user and lands as an INBOUND message for the
  -- person being told.
  for v_i in 1 .. coalesce(array_length(v_jobs, 1), 0) loop
    insert into public.messages (job_id, sender_id, content)
    values (
      v_jobs[v_i],
      p_target,
      'This job was cancelled automatically because this account was suspended by Brazos.'
    );
  end loop;

  -- No push reaches the banned person's devices.
  update public.push_tokens
     set active = false
   where user_id = p_target
     and active;

  if p_report_id is not null then
    update public.reports set status = 'actioned' where id = p_report_id;
  end if;
end;
$function$;

revoke all on function public.ban_user(uuid, uuid) from public, anon, service_role;
grant execute on function public.ban_user(uuid, uuid) to authenticated;

comment on function public.ban_user(uuid, uuid) is
  'Admin only (an ACTIVE admin, current_user_is_admin(); A3); never an admin account, the caller''s own included (S4-10). ban_switch (S4-01): takes the account lock (lock_account, exclusive; A8-02), locks the account''s jobs, then (A8-01, Terms section 12) cancels every unfinished one through cancel_job_core() in its account_suspended mode, the account as actor: its open, hired or started jobs as customer and its hired or started jobs as worker are always cancelled, cancelled_at stamped, cancelled_by and cancel_reason null; a checkout never finished is voided as cancel_job() voids it, an undirected held payment is refunded in full (refund_reason account_suspended) except on its started job as customer, where the held row is left undirected for the operator (A11 review 2), and a payment that already has a direction keeps it (a ban never claws money back); the other party gets one jobs notice. Then its other pending offers are settled (settle_offers_of_suspended), then the account is banned (the profiles_ban_record_sign_in_phone trigger records the sign-in phone; B1), the thread on each cancelled job that has another party gets its line, its push tokens are switched off, and the report is actioned. No sign-in ban: auth.users is not touched.';

-- ---------------------------------------------------------------------------------------------------
-- 4. unban_user(): A3.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.unban_user(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if not public.current_user_is_admin() then
    raise exception 'Only admins may unban users';
  end if;

  update public.profiles set banned = false where id = p_target;
  delete from public.banned_phones where banned_profile_id = p_target;
end;
$function$;

revoke all on function public.unban_user(uuid) from public, anon, service_role;
grant execute on function public.unban_user(uuid) to authenticated;

comment on function public.unban_user(uuid) is
  'Admin only (an ACTIVE admin, current_user_is_admin(); A3). Lifts the ban and frees the account''s banned phone numbers. It does not bring back a job the ban cancelled, an offer it settled or a series the series sweep stopped; the push tokens come back on at the account''s next signed-in launch (register_push_token).';

-- ---------------------------------------------------------------------------------------------------
-- 5. my_pending_offers() (S4-03): an offer from an account that is no longer active is not listed.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.my_pending_offers()
returns table(
  id uuid, job_id uuid, offer_type text, thread_job_id uuid, direct_thread_id uuid,
  customer_id uuid, worker_id uuid, amount_cents integer, status text, updated_at timestamp with time zone
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    o.id, o.job_id, o.offer_type::text,
    t.job_id, t.direct_thread_id,
    o.customer_id, o.worker_id, o.amount_cents, o.status::text, o.updated_at
  from public.job_offers o
  left join lateral (
    select m.job_id, m.direct_thread_id
    from public.messages m
    where m.job_offer_id = o.root_offer_id
      and m.request_event = 'created'
    order by m.created_at
    limit 1
  ) t on true
  where o.awaiting_id = auth.uid()
    and o.status = 'pending'
    and (o.expires_at is null or o.expires_at > now())
    and public.is_profile_active(o.author_id)
  order by o.updated_at desc;
$function$;

revoke all on function public.my_pending_offers() from public, anon, service_role;
grant execute on function public.my_pending_offers() to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- 6. admin_open_reports_v2(): the report list with its subject.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.admin_open_reports_v2()
returns table(
  id uuid, reporter_id uuid, reported_id uuid, reporter_name text, reported_name text,
  reported_banned boolean, job_id uuid, job_title text, reason text, description text, status text,
  created_at timestamp with time zone, subject_kind text, subject_id uuid, subject_text text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    r.id, r.reporter_id, r.reported_id,
    rp.full_name, rd.full_name, rd.banned,
    r.job_id, j.title,
    r.reason, r.description, r.status, r.created_at,
    r.subject_kind, r.subject_id,
    case r.subject_kind
      when 'review' then (select left(rv.comment, 200) from public.reviews rv where rv.id = r.subject_id)
      when 'message' then (select left(m.content, 200) from public.messages m where m.id = r.subject_id)
      when 'job' then (select left(sj.title, 200) from public.jobs sj where sj.id = r.subject_id)
    end
  from public.reports r
  left join public.profiles rp on rp.id = r.reporter_id
  left join public.profiles rd on rd.id = r.reported_id
  left join public.jobs j on j.id = r.job_id
  where public.current_user_is_admin()
  order by
    case when r.status = 'open' then 0 else 1 end,
    r.created_at desc;
$function$;

revoke all on function public.admin_open_reports_v2() from public, anon, authenticated, service_role;
grant execute on function public.admin_open_reports_v2() to authenticated;

comment on function public.admin_open_reports_v2() is
  'P2-8 (ban_switch): admin_open_reports()''s rows, for an ACTIVE admin only, plus the report''s subject: subject_kind, subject_id and subject_text (the first 200 characters of the reported review or message, or the reported job''s title; null for a profile or a portfolio item). Anyone else gets no rows.';

-- ---------------------------------------------------------------------------------------------------
-- 7. dismiss_report().
-- ---------------------------------------------------------------------------------------------------
create or replace function public.dismiss_report(p_report_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if not public.current_user_is_admin() then
    raise exception 'Only admins may dismiss reports';
  end if;

  update public.reports
     set status = 'dismissed'
   where id = p_report_id
     and status = 'open';
  return found;
end;
$function$;

revoke all on function public.dismiss_report(uuid) from public, anon, authenticated, service_role;
grant execute on function public.dismiss_report(uuid) to authenticated;

comment on function public.dismiss_report(uuid) is
  'P2-8 (ban_switch): an ACTIVE admin dismisses a report that is still open. True when it dismissed it now; false when the report was not open (already dismissed, actioned, or no such report).';

-- ---------------------------------------------------------------------------------------------------
-- 8. The repair pass (A11-02): no unfinished job keeps a suspended party.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.repair_suspended_jobs()
returns integer
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_account uuid;
  v_job record;
  v_repaired integer := 0;
begin
  -- ban_user()'s lock order: the account locks (exclusive, in id order), then every job of those
  -- accounts (in id order), then each cancellation (the job, then its payment).
  for v_account in
    select p.id
    from public.profiles p
    where coalesce(p.banned, false) and p.deleted_at is null
    order by p.id
  loop
    perform public.lock_account(v_account, false);
  end loop;

  perform 1
  from public.jobs j
  where exists (select 1 from public.profiles p
                 where p.id in (j.client_id, j.assigned_worker_id)
                   and coalesce(p.banned, false) and p.deleted_at is null)
  order by j.id
  for update;

  -- The customer side first: on a job whose two parties are both suspended, the customer's row
  -- decides (Terms section 12: a suspended customer's started job keeps its payment held).
  for v_job in
    select j.id, j.client_id
    from public.jobs j
    join public.profiles p on p.id = j.client_id
    where coalesce(p.banned, false) and p.deleted_at is null
      and j.status in ('open', 'assigned', 'in_progress')
    order by j.id
  loop
    perform public.cancel_job_core(v_job.id, 'account_suspended', v_job.client_id);
    v_repaired := v_repaired + 1;
  end loop;

  -- Then the worker side: a suspended worker's hired or started job for someone else.
  for v_job in
    select j.id, j.assigned_worker_id
    from public.jobs j
    join public.profiles p on p.id = j.assigned_worker_id
    where coalesce(p.banned, false) and p.deleted_at is null
      and j.client_id is distinct from j.assigned_worker_id
      and j.status in ('assigned', 'in_progress')
    order by j.id
  loop
    perform public.cancel_job_core(v_job.id, 'account_suspended', v_job.assigned_worker_id);
    v_repaired := v_repaired + 1;
  end loop;

  return v_repaired;
end;
$function$;

revoke all on function public.repair_suspended_jobs() from public, anon, authenticated, service_role;

comment on function public.repair_suspended_jobs() is
  'ban_switch (A11-02): every unfinished job that still has a suspended party (banned, not deleted) is cancelled through cancel_job_core() in its account_suspended mode, with its notice: the suspended customer''s open, hired or started jobs first, then the suspended worker''s hired or started jobs for someone else, so the customer''s row decides when both parties are suspended. ban_user()''s lock order; no exception is caught. Returns how many jobs it cancelled; a second run finds none. Run once by ban_switch; no client and no service role may call it.';

select public.repair_suspended_jobs();

-- ---------------------------------------------------------------------------------------------------
-- 9. Backfill: accounts banned or deleted before this file.
-- ---------------------------------------------------------------------------------------------------
do $backfill$
declare
  v_user uuid;
  v_offers integer := 0;
  v_tokens integer;
begin
  for v_user in
    select p.id
    from public.profiles p
    where coalesce(p.banned, false) or p.deleted_at is not null
    order by p.id
  loop
    v_offers := v_offers + public.settle_offers_of_suspended(v_user);
  end loop;

  update public.push_tokens t
     set active = false
   where t.active
     and not public.is_profile_active(t.user_id);
  get diagnostics v_tokens = row_count;

  raise notice 'ban_switch backfill: % pending offer(s) settled, % push token(s) switched off.',
    v_offers, v_tokens;
end;
$backfill$;

commit;
