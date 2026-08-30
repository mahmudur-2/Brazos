-- 20260920000000_settlement_retry.sql — R6b: the settlement corrective.
--
-- One transaction, ending in a sentinel function (phase50's shape):
-- settlement_retry_enabled() exists only if every statement here committed.
--
-- VOCABULARY. Money is integer cents. Nothing here computes, moves or
-- re-labels money: this file adds a counter, exposes it, and records failures.
--
-- ---------------------------------------------------------------------------
-- WHY THIS FILE EXISTS — the evidence, not a theory
-- ---------------------------------------------------------------------------
-- The money walk ran end to end on staging on 2026-08-30 and closed ($107.50
-- charged, $92.50 transferred, the row reached released). It found one
-- launch-blocking defect, cleared by hand:
--
--   process-settlements' transfer for one payment failed at 03:20 with the
--   provider's `insufficient available funds` (the platform test balance was
--   $0). The balance was then funded. The 03:25, 03:30, 03:35 and 03:40 ticks
--   ALL returned the identical failure against a funded balance. A hand
--   `update payments set transfer_attempts = 1` freed it: the very next tick
--   succeeded with a real transfer reference.
--
-- THE CAUSE. The provider saves the status code and body of the FIRST request
-- made under an idempotency key — success or failure alike — and replays it
-- for 24 hours. process-settlements keys transfers tr:<payment id>:
-- <transfer_attempts> and, on failure, wrote NOTHING back to the row. So
-- transfer_attempts stayed 0, every five-minute tick reused the identical key,
-- and the provider replayed the cached 400 verbatim. Funding the balance could
-- not fix it; only rotating the key could, and nothing in the system rotated
-- it. Nothing on the row (transfer_attempts 0, last_error null) recorded that
-- an attempt had ever been made.
--
-- The refund path was worse: rf:<payment id> carried no counter at all, so a
-- wedged refund could not be rotated even by hand — and that money is the
-- customer's.
--
-- ---------------------------------------------------------------------------
-- THIS FILE (R6b D3, D4, D5, D13)
-- ---------------------------------------------------------------------------
--   §0 pre-flight: raises, by name, on a schema that lacks what this extends.
--   §1 payments.refund_attempts — the counter the refund key now carries.
--   §2 refunds_due re-created with an IDENTICAL predicate and refund_attempts
--      appended, because a view's column list is frozen at creation.
--   §3 record_settlement_attempt(): the one service-role write that records a
--      failed attempt on the row and, when the drain says so, rotates the key.
--   §4 sentinel.
--
-- NOT HERE, BY DECISION (v3 §3, R12's): time-based backoff, any change to
-- either queue's admission predicate, active reconciliation by listing the
-- provider's transfers. transfers_due is not touched at all.
--
-- DEPLOY INVARIANT. The refund idempotency key changes shape from rf:<id> to
-- rf:<id>:<refund_attempts>. That is safe ONLY because refunds_due is EMPTY at
-- deploy: the operator verified staging's count is 0 before dispatching this
-- run, and production has no rows. A refund in flight across the deploy would
-- be re-sent under the new key.

begin;

-- ---------------------------------------------------------------------------
-- 0. Pre-flight. This file extends columns and a sentinel two earlier
--    migrations created; on a schema without them it must refuse, by name,
--    rather than half-apply.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'payments' and column_name = 'transfer_attempts'
  ) then
    raise exception 'settlement_retry: payments.transfer_attempts is absent — 20260905000000_stripe_foundation.sql has not been applied';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'payments' and column_name = 'last_error'
  ) then
    raise exception 'settlement_retry: payments.last_error is absent — 20260905000000_stripe_foundation.sql has not been applied';
  end if;
  if not exists (
    select 1 from pg_proc
     where pronamespace = 'public'::regnamespace and proname = 'connect_onboarding_enabled'
  ) then
    raise exception 'settlement_retry: connect_onboarding_enabled() is absent — 20260915000000_connect_onboarding.sql has not been applied';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. refund_attempts joins the ledger (D4), shaped exactly on
--    transfer_attempts and payments_transfer_attempts_not_negative (20260905
--    §3). Additive: a new column with a default, appended at the end of
--    payments, which is what §2 relies on.
-- ---------------------------------------------------------------------------
alter table public.payments
  add column if not exists refund_attempts integer not null default 0;

alter table public.payments drop constraint if exists payments_refund_attempts_not_negative;
alter table public.payments add constraint payments_refund_attempts_not_negative check (refund_attempts >= 0);

comment on column public.payments.refund_attempts is
  'How many refunds have been attempted for this row. process-settlements'' idempotency key is rf:<payment id>:<refund_attempts>; record_settlement_attempt() increments it when a definitive 4xx refusal (never a 409, a 429, a 5xx or a throw) has been cached under the current key, so the next tick sends a genuinely new request instead of replaying the refusal. Before R6b the refund key carried no counter and a wedged refund could not be rotated even by hand.';

-- ---------------------------------------------------------------------------
-- 2. refunds_due exposes the counter (D5). A view's column list is frozen when
--    it is created: refunds_due, created by 20260905 §15 as `select p.*`,
--    lists the 36 columns payments had then and cannot show refund_attempts
--    however payments grows. The drain must read the counter to build its key,
--    so the view is re-created here. CREATE OR REPLACE VIEW accepts columns
--    APPENDED at the end and nothing else — `select p.*` now expands to the
--    same 36 columns in the same order plus refund_attempts last, because §1
--    appended it to payments. The WHERE / ORDER BY is byte-for-byte 20260905's,
--    comment line included; supabase/tests/070_settlement_retry.sql pins the
--    predicate text and proves the same fixture rows are admitted and refused.
--    transfers_due already exposes transfer_attempts and is not touched. Any
--    change to either queue's admission is R12's, never this file's.
-- ---------------------------------------------------------------------------
create or replace view public.refunds_due as
  select p.*
    from public.payments p
   where p.provider = 'stripe'
     and coalesce(p.refund_cents, 0) > 0
     and p.refund_ref is null
     -- DIVERGENCE (safety): a row already refunded without a recorded ref
     -- (a hand refund in the dashboard) is not refunded twice.
     and p.status <> 'refunded'
   order by p.updated_at;
-- OR REPLACE keeps the view's privileges; re-stated so this file is safe to
-- read on its own.
revoke all on table public.refunds_due from public, anon, authenticated;
grant select on table public.refunds_due to service_role;
comment on view public.refunds_due is
  'stripe rows whose refund to the customer is due: refund_cents > 0 and no refund recorded yet. process-settlements refunds refund_cents against the charge with idempotency key rf:<id>:<refund_attempts>; charge.refunded then settles the status. Predicate unchanged since 20260905 §15; R6b appended refund_attempts to the column list.';

-- ---------------------------------------------------------------------------
-- 3. record_settlement_attempt() — the recorder (D2, D3). Every non-success
--    the drain sees is written to the row: last_error and updated_at always,
--    and the kind's attempt counter + 1 when the drain's classifier says the
--    key must rotate (a definitive 4xx refusal, cached under the current
--    key). The classifier — not this function — decides rotation; this
--    function only records what it is told, so a 409 (the original request
--    may still be executing) or a 5xx (money may already have moved) is
--    recorded with rotate = false and the key is kept.
--
--    service_role only: no client may write payments, and the edge function
--    holds no table access — it calls this through PostgREST with the service
--    key, exactly as set_payouts_status is called.
-- ---------------------------------------------------------------------------
create or replace function public.record_settlement_attempt(
  p_payment_id uuid,
  p_kind text,
  p_rotate boolean,
  p_error text
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rows integer := 0;
begin
  -- Allow-list, never block-list: the two kinds this function knows and
  -- nothing else. A null kind lands here too.
  if p_kind is distinct from 'transfer' and p_kind is distinct from 'refund' then
    raise exception 'record_settlement_attempt: unknown kind %; transfer or refund only', coalesce(p_kind, '<null>');
  end if;

  -- Two statements rather than one with a CASE per counter, so that a
  -- transfer record never NAMES refund_attempts and a refund record never
  -- names transfer_attempts. Nothing else on the row is in either SET list.
  if p_kind = 'transfer' then
    update public.payments
       set transfer_attempts = transfer_attempts + (case when coalesce(p_rotate, false) then 1 else 0 end),
           last_error        = left(p_kind || ': ' || coalesce(p_error, ''), 500),
           updated_at        = now()
     where id = p_payment_id;
  else
    update public.payments
       set refund_attempts = refund_attempts + (case when coalesce(p_rotate, false) then 1 else 0 end),
           last_error      = left(p_kind || ': ' || coalesce(p_error, ''), 500),
           updated_at      = now()
     where id = p_payment_id;
  end if;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;
revoke all on function public.record_settlement_attempt(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.record_settlement_attempt(uuid, text, boolean, text) to service_role;
comment on function public.record_settlement_attempt(uuid, text, boolean, text) is
  'service_role only (R6b process-settlements): records one failed settlement attempt on a payments row. ALWAYS sets last_error = left(kind || '': '' || error, 500) and updated_at = now(); when p_rotate is true also increments the kind''s attempt counter — transfer_attempts for ''transfer'', refund_attempts for ''refund'' — by exactly 1, which rotates the provider idempotency key so the next tick sends a genuinely new request instead of replaying a cached refusal. Touches nothing else: not status, not transfer_cents, refund_cents, transfer_ref, refund_ref, release_requested_at, released_at, refund_reason, transfer_reversed_at or any other money column. This function moves no money and can never move money. Returns true when a payments row matched, false otherwise; any kind other than transfer or refund raises.';

-- ---------------------------------------------------------------------------
-- 4. Sentinel. Created last inside the transaction, so its presence proves
--    the entire file committed (phase50's shape).
-- ---------------------------------------------------------------------------
create or replace function public.settlement_retry_enabled() returns boolean
language sql immutable set search_path = public, pg_temp as $$ select true $$;
revoke all on function public.settlement_retry_enabled() from public, anon;
grant execute on function public.settlement_retry_enabled() to authenticated, service_role;
comment on function public.settlement_retry_enabled() is
  'Marker: 20260920000000_settlement_retry.sql has been applied. Created last inside its transaction, so its presence proves the entire file committed.';

commit;
