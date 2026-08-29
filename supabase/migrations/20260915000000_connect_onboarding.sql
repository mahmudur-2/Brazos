-- 20260915000000_connect_onboarding.sql — R5b: Connect onboarding on Stripe
-- Accounts v2, carrying the E-6 money corrective as its first sections.
--
-- One transaction, ending in a sentinel function (phase50's shape):
-- connect_onboarding_enabled() exists only if every statement here committed.
--
-- VOCABULARY. Money is integer cents. Payment-holding is "held in protection".
-- A worker "sets up payouts"; no user-facing string here names the provider.
--
-- ---------------------------------------------------------------------------
-- THE E-6 FINDING (v3 Appendix A.4), AND WHY IT RIDES THIS FILE FIRST
-- ---------------------------------------------------------------------------
-- A stripe payments row is voided on two paths that leave its PaymentIntent
-- ALIVE at the provider: expire_unfunded_payments() when the 24-hour funding
-- window lapses (20260905000000_stripe_foundation.sql §14), and
-- begin_job_payment() when the agreed amount changes after an intent exists
-- (§9). §9's comment says "the sweeper cancels it at the provider". That
-- sweeper was never built (v3 §4.5), no cancel endpoint is in R5's
-- inventory, and R12 owns it — so the comment is FALSE today and stays false
-- until R12 lands. This file does not edit it: a migration that has been
-- applied anywhere is never rewritten.
--
-- A customer whose payment sheet was still open can therefore pay a voided
-- intent. §11's apply_payment_event() guarded the STATUS for that case — a
-- voided row keeps its status — but consumed the event silently: held_at was
-- stamped on the voided row, no refund was queued, the event was marked
-- processed with ok:true, and the captured money sat on a row nothing would
-- ever settle. Worse, a charge.refunded landing later (a hand refund in the
-- dashboard) would have moved the row to refunded and collided with the
-- job's live row on payments_one_active_per_job_kind — which excludes only
-- failed and voided — inside apply's exception block: ok:false, and the
-- provider retrying that event forever.
--
-- §1 makes a succeeded intent on a voided or failed row queue a refund of
-- the FULL charge (fee and tax included) through refunds_due, which
-- process-settlements already drains; the status and held_at stay put, and a
-- later charge.refunded or lost dispute records its refs without moving the
-- status. §2 admits the new refund reason. §3 records that refunds_due
-- needed no change. The provider-side cancel of an expired or voided intent
-- is NOT built here — it is R12's, beside the other drains.
--
-- ---------------------------------------------------------------------------
-- THE ONBOARDING HALF (§4–§7)
-- ---------------------------------------------------------------------------
-- Worker payout accounts are Stripe Accounts v2 with the Express dashboard
-- and the recipient configuration only: the platform charges the customer
-- and transfers to the worker — separate charges and transfers, as R5 built.
-- The app reads ONE text column, payment_accounts.payouts_status:
--   none           no payout account yet                 → "Set up payouts"
--   action_needed  the provider needs something from the worker
--                                                        → "Finish setting up payouts"
--   under_review   nothing to do; the provider is reviewing
--                                                        → "Payouts under review"
--   enabled        transfers can land                    → no call to action
-- payouts_enabled stays and is DERIVED (= status 'enabled') by
-- set_payouts_status(), so my_payouts_enabled() and process-settlements'
-- account lookup are untouched. Status truth is on-demand (connect-status);
-- there is no connected-account webhook (D3), so nothing here parses one.
--
-- Every new SECURITY DEFINER function carries its revoke/grant pair in this
-- file (CLAUDE.md): the three account functions are service_role only,
-- shaped on get/set_payment_customer; my_payouts_status() is authenticated,
-- own row only. Nothing is added to the payments table here (D10).

begin;

-- ---------------------------------------------------------------------------
-- 0. Pre-flight. Fail with a named cause rather than at runtime later.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.stripe_foundation_enabled()') is null then
    raise exception 'connect_onboarding: 20260905000000_stripe_foundation.sql has not been applied';
  end if;
  if to_regprocedure('public.settlement_schedules_enabled()') is null then
    raise exception 'connect_onboarding: 20260910000000_settlement_schedules.sql has not been applied';
  end if;
  if to_regprocedure('public.apply_payment_event(text)') is null then
    raise exception 'connect_onboarding: apply_payment_event(text) is missing';
  end if;
  if not exists (
    select 1 from pg_attribute
     where attrelid = 'public.payments'::regclass and attname = 'refund_reason' and not attisdropped
  ) then
    raise exception 'connect_onboarding: payments.refund_reason is missing';
  end if;
  if not exists (
    select 1 from pg_attribute
     where attrelid = 'public.payment_accounts'::regclass and attname = 'payouts_enabled' and not attisdropped
  ) then
    raise exception 'connect_onboarding: payment_accounts.payouts_enabled is missing';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. apply_payment_event(): THE state mover for stripe rows — replaced whole.
--    Idempotent per event id; monotonic per ledger row; NEVER raises past its
--    own boundary — it records the error on the event and returns ok:false.
--
--    R5b (E-6) changes exactly three things; every other branch is
--    behaviourally identical to 20260905000000_stripe_foundation.sql §11:
--      a. payment_intent.succeeded on a voided or failed row (any kind):
--         status and held_at unchanged; when nothing is queued yet,
--         refund_cents = charge_amount_cents, refund_reason =
--         'funded_after_void', last_error names it. The event is processed.
--      b. held_at is stamped only when the row WAS unfunded (and is a
--         job_payment) — never on a row that was already voided or failed.
--      c. charge.refunded, and charge.dispute.closed with status lost, on a
--         voided or failed row: the status stays; refund_cents, refund_ref,
--         chargeback_ref and chargeback_at are recorded exactly as before.
--         (refunded would collide with the job's live row on
--         payments_one_active_per_job_kind.)
-- ---------------------------------------------------------------------------
create or replace function public.apply_payment_event(p_event_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ev       public.payment_events;
  v_obj      jsonb;
  v_type     text;
  v_payment  public.payments;
  v_pid      uuid;
  v_refunded integer;
begin
  select * into v_ev from public.payment_events where id = p_event_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'unknown event'); end if;
  if v_ev.processed_at is not null then
    return jsonb_build_object('ok', true, 'already', true, 'payment_id', v_ev.payment_id);
  end if;
  v_type := v_ev.type;

  begin
    v_obj := v_ev.payload -> 'data' -> 'object';

    -- Resolve the ledger row. metadata.payment_id FIRST: matching by
    -- (job, kind) breaks the moment a job has more than one money object.
    v_pid := nullif(v_obj -> 'metadata' ->> 'payment_id', '')::uuid;
    if v_pid is not null then
      select * into v_payment from public.payments where id = v_pid for update;
    elsif v_type like 'payment_intent.%' then
      select * into v_payment from public.payments
       where provider = 'stripe' and provider_ref = v_obj ->> 'id' for update;
    elsif v_type like 'charge.%' then
      select * into v_payment from public.payments
       where provider = 'stripe' and provider_ref = v_obj ->> 'payment_intent' for update;
    end if;

    if v_payment.id is not null then
      v_refunded := nullif(v_obj ->> 'amount_refunded', '')::integer;

      update public.payments set
        status = case
          when v_type = 'payment_intent.succeeded' then
            (case when v_payment.kind = 'tip' and status = 'unfunded' then 'released'
                  when status = 'unfunded' then 'held'
                  else status end)
          when v_type = 'payment_intent.payment_failed' then
            (case when status = 'unfunded' then 'failed' else status end)
          when v_type = 'payment_intent.canceled' then
            (case when status = 'unfunded' then 'voided' else status end)
          -- D6: a transfer moves held -> released only when nothing is being
          -- refunded; a fee cancellation records transfer_ref and waits for
          -- charge.refunded to reach partially_refunded, in either order.
          when v_type = 'transfer.created' then
            (case when status = 'held' and coalesce(refund_cents, 0) = 0 then 'released' else status end)
          when v_type = 'transfer.reversed' then
            (case when status = 'released' then 'held' else status end)
          when v_type = 'charge.refunded' then
            -- Against the CHARGED amount, not the job price. A payload with no
            -- amount_refunded leaves the status alone (fail safe).
            -- R5b (E-6): a voided or failed row keeps its status — it is no
            -- longer the job's live row, and refunded would collide with the
            -- live one on payments_one_active_per_job_kind.
            (case when v_refunded is null then status
                  when status in ('voided', 'failed') then status
                  when v_refunded >= charge_amount_cents then 'refunded'
                  else 'partially_refunded' end)
          when v_type = 'charge.dispute.closed' and v_obj ->> 'status' = 'lost' then
            (case when status in ('voided', 'failed') then status else 'refunded' end)
          else status end::public.payment_status,

        -- R5b (E-6): stamped only on the transition out of unfunded. A late
        -- payment on a voided or failed row was never held.
        held_at      = case when v_type = 'payment_intent.succeeded' and v_payment.kind = 'job_payment'
                             and v_payment.status = 'unfunded'
                            then coalesce(held_at, now()) else held_at end,
        released_at  = case when v_type = 'transfer.created'
                              or (v_type = 'payment_intent.succeeded' and v_payment.kind = 'tip')
                            then coalesce(released_at, now())
                            when v_type = 'transfer.reversed' then null
                            else released_at end,
        transfer_ref = case when v_type = 'transfer.created' then v_obj ->> 'id'
                            when v_type = 'transfer.reversed' then null
                            else transfer_ref end,
        -- D11: a reversal PARKS the row. release_requested_at is PRESERVED
        -- (the customer's release button must not re-open — a second real
        -- transfer) and transfer_reversed_at keeps it out of transfers_due
        -- (re-queueing would be the same second transfer). Only
        -- resolve_job_dispute clears the park.
        transfer_reversed_at = case when v_type = 'transfer.reversed' then now() else transfer_reversed_at end,
        last_error   = case when v_type = 'transfer.reversed' then 'transfer reversed at the provider'
                            when v_type = 'payment_intent.succeeded' and v_payment.status in ('voided', 'failed')
                             and coalesce(v_payment.refund_cents, 0) = 0
                            then 'funded after the row was voided; refunding in full'
                            else last_error end,
        -- R5b (E-6): money captured on a row that is no longer live goes back
        -- in full — the whole charge, fee and tax included — through
        -- refunds_due, which process-settlements drains. Once only: a refund
        -- already queued or recorded is never re-queued.
        refund_cents = case when v_type = 'charge.refunded' then coalesce(refund_cents, v_refunded)
                            when v_type = 'payment_intent.succeeded' and v_payment.status in ('voided', 'failed')
                             and coalesce(v_payment.refund_cents, 0) = 0
                            then charge_amount_cents
                            else refund_cents end,
        refund_reason = case when v_type = 'payment_intent.succeeded' and v_payment.status in ('voided', 'failed')
                              and coalesce(v_payment.refund_cents, 0) = 0
                             then 'funded_after_void'
                             else refund_reason end,
        refund_ref   = case when v_type = 'charge.refunded'
                            then coalesce(v_obj -> 'refunds' -> 'data' -> 0 ->> 'id', refund_ref) else refund_ref end,
        chargeback_ref = case when v_type like 'charge.dispute.%' then v_obj ->> 'id' else chargeback_ref end,
        chargeback_at  = case when v_type = 'charge.dispute.created' then coalesce(chargeback_at, now())
                              when v_type = 'charge.dispute.closed' and v_obj ->> 'status' = 'won' then null
                              else chargeback_at end,
        updated_at = now()
      where id = v_payment.id;
    end if;

    -- DIVERGENCE (D11): no account.updated branch. R5 calls set_payouts_enabled().
    -- payout.paid is DELIBERATELY not handled (§5.2 note 9).

    update public.payment_events set processed_at = now(), payment_id = v_payment.id where id = p_event_id;
    return jsonb_build_object('ok', true, 'payment_id', v_payment.id);

  exception when others then
    -- The block's savepoint rolls the ledger write back; this UPDATE then
    -- commits with the function because we do NOT re-raise. The caller turns
    -- ok:false into a 5xx so the provider retries.
    update public.payment_events
       set error = left(sqlerrm, 500), attempts = attempts + 1
     where id = p_event_id;
    return jsonb_build_object('ok', false, 'error', 'apply failed');
  end;
end $$;
revoke all on function public.apply_payment_event(text) from public, anon, authenticated;
grant execute on function public.apply_payment_event(text) to service_role;
comment on function public.apply_payment_event(text) is
  'service_role only: applies one stored provider event to its payments row, idempotently. R5b (E-6): a payment_intent.succeeded on a voided or failed row queues a full refund (refund_reason funded_after_void) instead of being consumed silently.';

-- ---------------------------------------------------------------------------
-- 2. The refund reasons: R4's six, verbatim and in order, plus the one §1
--    writes. Dropped and re-added because a check constraint cannot be
--    altered in place; nothing else about the column changes.
-- ---------------------------------------------------------------------------
alter table public.payments drop constraint if exists payments_refund_reason_known;
alter table public.payments add constraint payments_refund_reason_known
  check (refund_reason is null or refund_reason in
    ('customer_cancelled_free', 'customer_cancelled_late', 'worker_cancelled', 'no_show_withdrawn', 'customer_no_show', 'dispute_refund', 'funded_after_void'));

-- ---------------------------------------------------------------------------
-- 3. refunds_due — NO CHANGE, and why. Its predicate is
--      provider = 'stripe' and coalesce(refund_cents, 0) > 0
--      and refund_ref is null and status <> 'refunded'
--    (20260905000000_stripe_foundation.sql §15). A voided or failed row with
--    refund_cents > 0 and no refund_ref satisfies every term, so the row §1
--    writes is already admitted and process-settlements' runRefunds() already
--    refunds it against provider_ref. Replacing the view would be a rewrite
--    that hides that reading; 060_connect.sql §1 proves the admission.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 4. payment_accounts.payouts_status — the one app-facing payout state.
--    text + check, NOT an enum: an enum label cannot be added inside the
--    transaction that uses it, and one file is the whole migration.
-- ---------------------------------------------------------------------------
alter table public.payment_accounts
  add column if not exists payouts_status text not null default 'none';
alter table public.payment_accounts drop constraint if exists payment_accounts_payouts_status_known;
alter table public.payment_accounts add constraint payment_accounts_payouts_status_known
  check (payouts_status in ('none', 'action_needed', 'under_review', 'enabled'));
comment on column public.payment_accounts.payouts_status is
  'R5b: the app-facing payout state, written only by set_payouts_status() (service_role). none = no payout account yet; action_needed = the provider needs something from the worker; under_review = nothing to do, the provider is reviewing; enabled = transfers can land. payouts_enabled is derived from it (= enabled).';

-- ---------------------------------------------------------------------------
-- 5. Service-role only: the provider account reference and the payout state.
--    Shaped on get/set_payment_customer (20260910000000_settlement_schedules.sql).
--    set_payouts_enabled(text, boolean) and my_payouts_enabled() are not
--    touched.
-- ---------------------------------------------------------------------------
create or replace function public.get_payment_account(p_user_id uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select a.stripe_account_id from public.payment_accounts a where a.user_id = p_user_id
$$;
revoke all on function public.get_payment_account(uuid) from public, anon, authenticated;
grant execute on function public.get_payment_account(uuid) to service_role;
comment on function public.get_payment_account(uuid) is
  'service_role only (R5b connect-onboarding / connect-status): this user''s stored provider account id, or null when they have none yet. The read half of the durable reference on payment_accounts.stripe_account_id.';

create or replace function public.set_payment_account(p_user_id uuid, p_account_id text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_effective text;
begin
  if p_user_id is null or coalesce(p_account_id, '') = '' then
    raise exception 'set_payment_account: user id and account id are required';
  end if;

  -- FIRST WRITER WINS, and the winner is what comes back. Two taps on "Set up
  -- payouts" can both reach the provider before either stores anything (the
  -- provider idempotency key on the create call makes that the same account
  -- inside its window, but not beyond it); coalesce keeps the reference that
  -- is already recorded and returns it, so the caller mints the onboarding
  -- link for the stored account rather than the one it happened to create.
  -- Nothing here is monetary and nothing is overwritten.
  insert into public.payment_accounts as a (user_id, stripe_account_id)
  values (p_user_id, p_account_id)
  on conflict (user_id) do update
     set stripe_account_id = coalesce(a.stripe_account_id, excluded.stripe_account_id),
         updated_at = now()
  returning a.stripe_account_id into v_effective;

  return v_effective;
end;
$$;
revoke all on function public.set_payment_account(uuid, text) from public, anon, authenticated;
grant execute on function public.set_payment_account(uuid, text) to service_role;
comment on function public.set_payment_account(uuid, text) is
  'service_role only (R5b connect-onboarding): stores this user''s provider account id once and returns the EFFECTIVE one. An id already recorded is never overwritten, so a race between two onboarding taps converges on a single account rather than orphaning one.';

create or replace function public.set_payouts_status(p_user_id uuid, p_status text) returns boolean
language sql security definer set search_path = public, pg_temp as $$
  with u as (
    update public.payment_accounts
       set payouts_status = p_status,
           payouts_enabled = (p_status = 'enabled'),
           payouts_checked_at = now(),
           updated_at = now()
     where user_id = p_user_id
    returning 1
  )
  select exists (select 1 from u)
$$;
revoke all on function public.set_payouts_status(uuid, text) from public, anon, authenticated;
grant execute on function public.set_payouts_status(uuid, text) to service_role;
comment on function public.set_payouts_status(uuid, text) is
  'service_role only (R5b connect-onboarding / connect-status): records the app-facing payout state and derives payouts_enabled from it (= enabled). Returns true when a payment_accounts row matched; an unknown status fails on payment_accounts_payouts_status_known.';

-- ---------------------------------------------------------------------------
-- 6. my_payouts_status(): the one fact a user needs about their own row, in
--    the vocabulary the payouts screen speaks. 'none' when there is no row.
-- ---------------------------------------------------------------------------
create or replace function public.my_payouts_status() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select payouts_status from public.payment_accounts where user_id = auth.uid()), 'none')
$$;
revoke all on function public.my_payouts_status() from public, anon;
grant execute on function public.my_payouts_status() to authenticated;
comment on function public.my_payouts_status() is
  'The caller''s own payout state: none | action_needed | under_review | enabled. none when no payout account exists yet. Own row only; nothing else on payment_accounts is client-readable.';

-- ---------------------------------------------------------------------------
-- 7. Sentinel. Created last inside the transaction, so its presence proves
--    the entire file committed (phase50's shape).
-- ---------------------------------------------------------------------------
create or replace function public.connect_onboarding_enabled() returns boolean
language sql immutable set search_path = public, pg_temp as $$ select true $$;
revoke all on function public.connect_onboarding_enabled() from public, anon;
grant execute on function public.connect_onboarding_enabled() to authenticated, service_role;
comment on function public.connect_onboarding_enabled() is
  'Marker: 20260915000000_connect_onboarding.sql has been applied. Created last inside its transaction, so its presence proves the entire file committed.';

commit;
