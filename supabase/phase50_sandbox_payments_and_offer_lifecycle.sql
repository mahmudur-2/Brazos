-- ============================================================================
-- BRAZOS V2 · Phase 50 · sandbox payments + the offer lifecycle Phase 5 owns
--
-- Apply with psql -f (or paste whole into the SQL Editor). Safe to re-run.
--
-- STRUCTURE — READ THIS FIRST
-- ---------------------------
-- Section 1 runs OUTSIDE the transaction block, on purpose. Postgres refuses
-- to USE an enum value inside the transaction that added it, and section 4's
-- partial unique index and section 3's column default both reference the new
-- payment_status values. phase45/phase46 hit the identical constraint and
-- solved it with two files; this file solves it with one file whose enum
-- additions are standalone autocommit statements ahead of the main
-- transaction. They are additive and idempotent (ADD VALUE IF NOT EXISTS),
-- so a partial run leaves nothing broken and a re-run is a no-op.
-- Everything from section 2 onward is one transaction ending in the sentinel.
--
-- WHAT THIS FILE DOES
--   1. payment_status gains §H.3's missing values; payment_kind is created.
--   2. The EXISTING public.payments table (a pre-repo scaffold: zero rows
--      ever, no triggers, no code references, a stripe-named column from an
--      abandoned era) is EXTENDED, not replaced: kind, offer_id, provider,
--      provider_ref, per-transition timestamps, integrity checks.
--   3. Write access is locked to phase29's standard: RLS SELECT for the two
--      parties (the policy already existed and is kept verbatim), all client
--      DML revoked explicitly, mutations only through SECURITY DEFINER RPCs.
--   4. sandbox_authorize_job_payment() / sandbox_hold_job_payment() — the
--      Phase 5 sandbox checkout. The names say sandbox because the bodies ARE
--      the sandbox provider: they fabricate a provider ref and move state
--      unfunded→authorized→held. NOTHING in this file or anywhere else can
--      move a payment past held: no release/paid-out path exists at any
--      layer, which is §H.3 honesty enforced by absence.
--   5. job_offers.expires_at + expiry enforcement inside the negotiation
--      RPCs, and withdraw_offer() — the two §H.2 states phase46 deliberately
--      left unreachable ("that is Phase 5").
--
-- WHAT THIS FILE DOES NOT DO
--   * No job_status enum change. accept_offer() keeps assigning the job —
--     §H.1's pending_payment/confirmed values would strand every installed
--     build mid-hire, and the shim-retirement phase (the one that ships a
--     version gate) owns that migration. "Confirmed" is the derived state
--     assigned + payment held, which the app renders from the ledger.
--   * No release, refund, payout, dispute or cash-out path. Phase 6+.
--   * No real payment provider. stripe_payment_intent_id is left in place,
--     unused, for the version-gate cleanup phase to drop.
--   * No policy is weakened. The one policy touched (payments write revokes)
--     strictly narrows.
-- ============================================================================

-- 1. Enum additions — standalone autocommit statements, see header ----------

alter type public.payment_status add value if not exists 'unfunded' before 'pending';
alter type public.payment_status add value if not exists 'authorized' after 'pending';
alter type public.payment_status add value if not exists 'paid_out' after 'released';
alter type public.payment_status add value if not exists 'voided' after 'failed';
alter type public.payment_status add value if not exists 'partially_refunded' after 'refunded';

do $$
begin
  if not exists (
    select 1 from pg_type
    where typname = 'payment_kind' and typnamespace = 'public'::regnamespace
  ) then
    create type public.payment_kind as enum ('job_payment', 'tip');
  end if;
end $$;

comment on type public.payment_status is
  'BRAZOS_MASTER_PLAN.md §H.3: unfunded -> authorized -> held -> released -> paid_out, branches failed/voided (from authorized) and refunded/partially_refunded (from held). The legacy ''pending'' label predates the repo''s migrations; nothing writes it and it is kept only because enum values cannot be dropped.';
comment on type public.payment_kind is
  '§G: job_payment = the protected checkout for a hire. tip = Phase 10''s review-time tip. Phase 5 writes only job_payment.';

begin;

-- 2. Preconditions ------------------------------------------------------------

do $$
begin
  if to_regclass('public.payments') is null then
    raise exception 'public.payments does not exist — this migration extends the pre-repo scaffold table and refuses to invent a replacement.';
  end if;
  if (select count(*) from public.payments) > 0 then
    -- The scaffold has held zero rows since creation. Rows appearing between
    -- audit and apply would mean something unknown writes it, and extending
    -- under it would be guessing. Refuse loudly instead.
    raise exception 'public.payments unexpectedly contains rows — audit them before applying phase50.';
  end if;
  if to_regprocedure('public.job_offer_rpcs_enabled()') is null then
    raise exception 'phase46 has not been applied — run the earlier migrations first.';
  end if;
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'payment_status' and e.enumlabel = 'authorized'
  ) then
    raise exception 'payment_status is missing ''authorized'' — section 1 of this file did not run (it must execute as standalone statements before this transaction).';
  end if;
end $$;

-- 3. Extend public.payments ---------------------------------------------------

alter table public.payments
  add column if not exists kind public.payment_kind not null default 'job_payment',
  add column if not exists offer_id uuid references public.job_offers(id),
  add column if not exists provider text not null default 'sandbox',
  add column if not exists provider_ref text,
  add column if not exists authorized_at timestamptz,
  add column if not exists held_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.payments alter column status set default 'unfunded';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payments_amount_positive'
  ) then
    alter table public.payments
      add constraint payments_amount_positive check (amount_cents > 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'payments_fee_not_negative'
  ) then
    alter table public.payments
      add constraint payments_fee_not_negative check (platform_fee_cents >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'payments_parties_distinct'
  ) then
    alter table public.payments
      add constraint payments_parties_distinct check (payer_id <> payee_id);
  end if;
  -- The sandbox is the only provider anything may write until a production
  -- adapter phase deliberately widens this. A typo'd or smuggled provider
  -- value fails here rather than masquerading as real money.
  if not exists (
    select 1 from pg_constraint where conname = 'payments_provider_known'
  ) then
    alter table public.payments
      add constraint payments_provider_known check (provider in ('sandbox'));
  end if;
end $$;

comment on table public.payments is
  'The §G money ledger: one row per money event. Phase 5 writes exactly one kind (job_payment) through the sandbox RPCs and stops at held — no release/payout path exists yet. Wallet/earnings surfaces must derive from this table, never a hand-kept balance.';
comment on column public.payments.provider is
  'Always ''sandbox'' in Phase 5 (enforced by payments_provider_known). A production provider phase widens the CHECK deliberately.';
comment on column public.payments.provider_ref is
  'The provider''s reference for this payment. Sandbox refs are fabricated (sandbox_<uuid>) and say so by their shape. stripe_payment_intent_id is the abandoned pre-repo column, unused, kept for the cleanup phase to drop.';
comment on column public.payments.offer_id is
  'The accepted job_offers row this payment funds — the auditable link from money to the negotiation that produced it.';

-- One ACTIVE payment per (job, kind). This is what makes a double-tapped or
-- retried checkout structurally incapable of producing two holds: the second
-- insert collides here and the RPC returns the surviving row instead.
-- failed/voided rows do not block a retry, which is the §H.3 branch's point.
create unique index if not exists payments_one_active_per_job_kind
  on public.payments (job_id, kind)
  where status not in ('failed', 'voided');

create index if not exists payments_payer_idx
  on public.payments (payer_id, created_at desc);
create index if not exists payments_payee_idx
  on public.payments (payee_id, created_at desc);
create index if not exists payments_job_idx
  on public.payments (job_id, kind);

-- Lockdown, phase29's standard. The existing SELECT policy ("parties view own
-- payments": payer or payee) is exactly §G's boundary and is KEPT — but the
-- scaffold era left full table grants to anon/authenticated sitting under RLS.
-- RLS with no write policy already denies those writes; the revokes make the
-- grants tell the truth too. Strictly narrowing.
revoke all on public.payments from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.payments from authenticated;
grant select on public.payments to authenticated;

-- 4. sandbox_authorize_job_payment() -----------------------------------------
--
-- The sandbox checkout's first half: creates the job's payment row in
-- `authorized`. Idempotent — a retry, a double tap or a lost response returns
-- the existing active row unchanged rather than minting a second one (belt:
-- the FOR UPDATE re-read; braces: payments_one_active_per_job_kind).
--
-- Caller must be the job's owner; the job must be assigned with an accepted
-- offer. The amount is the accepted terms (final_amount_cents, stamped by
-- accept_offer), never a client-supplied number — a checkout cannot invent a
-- price. platform_fee_cents is 0: no authoritative fee schedule exists
-- (screen 51's 10% is a labeled estimate, not a schedule), and inventing one
-- in a money table would be fabricated marketplace data.

create or replace function public.sandbox_authorize_job_payment(p_job_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_payment public.payments;
  v_amount integer;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  -- Same lock order as accept_offer(): the job row first, then dependents.
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then
    raise exception 'Job not found';
  end if;
  if v_job.assigned_worker_id is null or v_job.accepted_offer_id is null then
    raise exception 'This job has no accepted offer to fund yet';
  end if;
  if v_job.status <> 'assigned' then
    raise exception 'This job is not awaiting payment';
  end if;

  -- Idempotent return of the active row, whatever state it has reached.
  select * into v_payment
  from public.payments
  where job_id = p_job_id and kind = 'job_payment'
    and status not in ('failed', 'voided')
  for update;
  if found then
    return v_payment;
  end if;

  v_amount := coalesce(v_job.final_amount_cents, v_job.budget_cents);
  if v_amount is null or v_amount <= 0 then
    raise exception 'This job has no agreed amount to authorize';
  end if;

  insert into public.payments (
    job_id, offer_id, payer_id, payee_id, kind,
    amount_cents, platform_fee_cents,
    provider, provider_ref, status, authorized_at
  )
  values (
    v_job.id, v_job.accepted_offer_id, v_actor, v_job.assigned_worker_id,
    'job_payment', v_amount, 0,
    'sandbox', 'sandbox_' || gen_random_uuid(), 'authorized', now()
  )
  returning * into v_payment;

  return v_payment;
exception
  when unique_violation then
    -- A concurrent authorize won the race. Return its row: same outcome.
    select * into v_payment
    from public.payments
    where job_id = p_job_id and kind = 'job_payment'
      and status not in ('failed', 'voided');
    return v_payment;
end;
$$;

revoke all on function public.sandbox_authorize_job_payment(uuid) from public, anon;
grant execute on function public.sandbox_authorize_job_payment(uuid) to authenticated;

comment on function public.sandbox_authorize_job_payment(uuid) is
  'SANDBOX ONLY — no real money. Creates (or idempotently returns) the job''s active job_payment row in `authorized`. Amount comes from the accepted offer, fee is 0 (no authoritative fee schedule exists). Second half: sandbox_hold_job_payment().';

-- 5. sandbox_hold_job_payment() -----------------------------------------------
--
-- authorized -> held. Idempotent: already-held returns the row. Anything past
-- held cannot regress, and there is deliberately NO function that moves a row
-- past held — release is Phase 6's approval flow.

create or replace function public.sandbox_hold_job_payment(p_job_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_payment public.payments;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  select * into v_payment
  from public.payments
  where job_id = p_job_id and kind = 'job_payment'
    and status not in ('failed', 'voided')
  for update;
  if not found or v_payment.payer_id <> v_actor then
    raise exception 'No payment to protect — authorize it first';
  end if;

  if v_payment.status = 'held' then
    return v_payment;   -- retry of a hold that already landed
  end if;
  if v_payment.status <> 'authorized' then
    raise exception 'This payment is not in an authorizable state (%)', v_payment.status;
  end if;

  update public.payments
     set status = 'held', held_at = now(), updated_at = now()
   where id = v_payment.id
  returning * into v_payment;

  return v_payment;
end;
$$;

revoke all on function public.sandbox_hold_job_payment(uuid) from public, anon;
grant execute on function public.sandbox_hold_job_payment(uuid) to authenticated;

comment on function public.sandbox_hold_job_payment(uuid) is
  'SANDBOX ONLY — no real money. Moves the job''s payment authorized -> held (idempotent on held). held is the Phase 5 terminal state: no function anywhere moves a payment past it.';

-- 6. job_offers.expires_at ----------------------------------------------------
--
-- New offers (and every counter — each counter is a new insert) get a 7-day
-- window. 7 days is a product default recorded in BUILD_STATE, not a §H
-- number; §H.2 names the expired state but no duration.
--
-- EXISTING rows are deliberately left NULL = never expires. Retroactively
-- expiring live negotiations that were made under no-expiry rules would be
-- changing users' marketplace state by fiat. NULL rows behave exactly as
-- before this migration.

alter table public.job_offers
  add column if not exists expires_at timestamptz default (now() + interval '7 days');

comment on column public.job_offers.expires_at is
  'When a pending offer lapses (§H.2 expired). NULL = never (pre-phase50 rows). Enforced at decision time inside the RPCs — a stale row is flipped to expired on touch, and my_pending_offers() excludes it; there is no cron (repo rule: on-read-check only).';

create index if not exists job_offers_pending_expiry_idx
  on public.job_offers (expires_at)
  where status = 'pending' and expires_at is not null;

-- Internal helper: flip one stale pending offer to expired. Called only from
-- the RPCs below, under their locks. Never granted to clients.
create or replace function public.expire_offer_if_stale(p_offer public.job_offers)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_offer.status = 'pending'
     and p_offer.expires_at is not null
     and p_offer.expires_at <= now() then
    update public.job_offers
       set status = 'expired', awaiting_id = null, updated_at = now()
     where id = p_offer.id;
    perform public.offer_post_event(
      p_offer.id, p_offer.root_offer_id, coalesce(auth.uid(), p_offer.author_id),
      'expired', p_offer.amount_cents
    );
    return true;
  end if;
  return false;
end;
$$;

revoke all on function public.expire_offer_if_stale(public.job_offers)
  from public, anon, authenticated;

-- 7. withdraw_offer() ---------------------------------------------------------
--
-- §H.2's withdrawn: the AUTHOR of a pending revision retracts it while the
-- other side owes the reply. The counterparty's exit is decline_offer(); the
-- two are deliberately not interchangeable. Same shape as decline_offer():
-- single-row lock, idempotent on its own terminal state.

create or replace function public.withdraw_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_offer public.job_offers;
begin
  if v_actor is null then
    raise exception 'Not signed in';
  end if;

  select * into v_offer from public.job_offers where id = p_offer_id for update;
  if not found or v_actor not in (v_offer.customer_id, v_offer.worker_id) then
    raise exception 'Offer not found';
  end if;
  -- Idempotent: a retry of a withdraw that already landed is not an error.
  if v_offer.status = 'withdrawn' then
    return;
  end if;
  if public.expire_offer_if_stale(v_offer) then
    raise exception 'This offer has already expired';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'This offer is no longer open';
  end if;
  if v_offer.author_id is distinct from v_actor then
    raise exception 'Only the person who sent this offer can withdraw it';
  end if;

  update public.job_offers
     set status = 'withdrawn', awaiting_id = null, updated_at = now()
   where id = p_offer_id;

  perform public.offer_post_event(
    p_offer_id, v_offer.root_offer_id, v_actor, 'withdrawn', v_offer.amount_cents
  );
end;
$$;

revoke all on function public.withdraw_offer(uuid) from public, anon;
grant execute on function public.withdraw_offer(uuid) to authenticated;

comment on function public.withdraw_offer(uuid) is
  'The sender retracts their own pending offer revision (§H.2 withdrawn). The recipient''s counterpart is decline_offer(). Frees the one-live-chain slot, so a withdrawn worker may bid again.';

-- 8. Expiry enforcement in the existing RPCs ----------------------------------
--
-- Same signatures, so CREATE OR REPLACE swaps the bodies in place (the
-- phase47-over-phase46 precedent: superseding a body in a later migration is
-- the supported way to change one). Bodies are phase46/47's verbatim plus:
--
--   accept_offer():  a stale offer is flipped to expired and refused; stale
--                    pending siblings are expired (not superseded) before the
--                    losing sweep, so the audit trail says what actually
--                    happened to each chain.
--   counter_offer(): a stale parent is flipped and refused.
--   decline_offer(): declining a stale offer records expired (the sender
--                    should see it lapsed, not that the recipient acted) and
--                    returns without error — the caller''s intent, "make this
--                    go away", is satisfied either way.
--   create_offer():  the caller''s own stale chain on the target is expired
--                    first, so the partial unique indexes stop blocking the
--                    re-bid the one-active-chain rule promises.

create or replace function public.accept_offer(p_offer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_offer public.job_offers;
  v_job public.jobs;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  -- LOCK ORDER: jobs, THEN job_offers — phase46's rule, unchanged.
  select job_id into v_job.id from public.job_offers where id = p_offer_id;
  if v_job.id is null then
    raise exception 'Offer not found';
  end if;

  select * into v_job from public.jobs where id = v_job.id for update;
  if not found then
    raise exception 'Job not found';
  end if;

  select * into v_offer from public.job_offers where id = p_offer_id for update;
  if not found or v_actor not in (v_offer.customer_id, v_offer.worker_id) then
    raise exception 'Offer not found';
  end if;

  if v_offer.status = 'accepted' then
    return v_offer.job_id;
  end if;
  -- Phase 50: a lapsed offer cannot win, however fast the tap after the
  -- deadline. Flipped first so the row records expired, not a failed accept.
  if public.expire_offer_if_stale(v_offer) then
    raise exception 'This offer has expired and can no longer be accepted';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'This offer is no longer open';
  end if;
  if v_offer.awaiting_id is distinct from v_actor then
    raise exception 'It is not your turn to respond to this offer';
  end if;
  if not public.job_request_parties_ok(v_offer.customer_id, v_offer.worker_id) then
    raise exception 'This offer cannot be accepted';
  end if;
  if not public.is_profile_active(v_offer.worker_id) then
    raise exception 'Worker is not available';
  end if;
  if v_offer.job_id <> v_job.id then
    raise exception 'Offer no longer belongs to this job';
  end if;
  if v_job.accepted_offer_id is not null or v_job.assigned_worker_id is not null then
    raise exception 'This job has already been assigned';
  end if;
  if v_offer.offer_type = 'marketplace_bid' and v_job.status <> 'open' then
    raise exception 'This job no longer accepts offers';
  end if;
  if v_offer.offer_type = 'direct_offer' and v_job.status <> 'draft' then
    raise exception 'This job no longer accepts offers';
  end if;

  update public.job_offers
     set status = 'accepted', awaiting_id = null, updated_at = now()
   where id = p_offer_id;

  -- Phase 50: siblings that had already lapsed record expired; only genuinely
  -- live rivals record superseded. Under the job lock, so atomic either way.
  update public.job_offers
     set status = 'expired', awaiting_id = null, updated_at = now()
   where job_id = v_offer.job_id
     and id <> p_offer_id
     and status = 'pending'
     and expires_at is not null
     and expires_at <= now();

  update public.job_offers
     set status = 'superseded', awaiting_id = null, updated_at = now()
   where job_id = v_offer.job_id
     and id <> p_offer_id
     and status = 'pending';

  update public.jobs
     set status = 'assigned'::public.job_status,
         assigned_worker_id = v_offer.worker_id,
         accepted_offer_id = v_offer.id,
         final_amount_cents = v_offer.amount_cents
   where id = v_offer.job_id;

  perform public.offer_post_event(
    p_offer_id, v_offer.root_offer_id, v_actor, 'accepted', v_offer.amount_cents
  );

  return v_offer.job_id;
end;
$$;

create or replace function public.counter_offer(
  p_offer_id uuid,
  p_amount_cents integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_parent public.job_offers;
  v_job_id uuid;
  v_used integer;
  v_next uuid;
  v_new_id uuid;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Enter an amount greater than zero';
  end if;

  select job_id into v_job_id from public.job_offers where id = p_offer_id;
  if v_job_id is null then
    raise exception 'Offer not found';
  end if;
  perform 1 from public.jobs where id = v_job_id for update;

  select * into v_parent from public.job_offers where id = p_offer_id for update;
  if not found or v_actor not in (v_parent.customer_id, v_parent.worker_id) then
    raise exception 'Offer not found';
  end if;
  -- Phase 50: countering a lapsed offer records the lapse and refuses.
  if public.expire_offer_if_stale(v_parent) then
    raise exception 'This offer has expired and can no longer be countered';
  end if;
  if v_parent.status <> 'pending' then
    raise exception 'This offer is no longer open';
  end if;
  if v_parent.awaiting_id is distinct from v_actor then
    raise exception 'It is not your turn to respond to this offer';
  end if;
  if not public.job_request_parties_ok(v_parent.customer_id, v_parent.worker_id) then
    raise exception 'This offer cannot be updated';
  end if;

  select count(*) into v_used
  from public.job_offers o
  where o.root_offer_id = v_parent.root_offer_id
    and o.author_id = v_actor
    and o.parent_offer_id is not null;
  if v_used >= 3 then
    raise exception 'You have used all 3 counter-offers. Accept or decline to continue.';
  end if;

  update public.job_offers
     set status = 'superseded', awaiting_id = null, updated_at = now()
   where id = p_offer_id;

  v_next := case when v_actor = v_parent.customer_id
                 then v_parent.worker_id else v_parent.customer_id end;
  v_new_id := gen_random_uuid();

  -- expires_at deliberately not set here: the column default gives the
  -- counter its own fresh 7-day window.
  insert into public.job_offers (
    id, job_id, offer_type, parent_offer_id, root_offer_id,
    customer_id, worker_id, author_id, awaiting_id,
    amount_cents, status
  )
  values (
    v_new_id, v_parent.job_id, v_parent.offer_type, p_offer_id, v_parent.root_offer_id,
    v_parent.customer_id, v_parent.worker_id, v_actor, v_next,
    p_amount_cents, 'pending'
  );

  if v_parent.offer_type = 'direct_offer' then
    update public.jobs set budget_cents = p_amount_cents where id = v_parent.job_id;
  end if;

  perform public.offer_post_event(
    v_new_id, v_parent.root_offer_id, v_actor, 'countered', p_amount_cents
  );

  return v_new_id;
end;
$$;

create or replace function public.decline_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_offer public.job_offers;
begin
  if v_actor is null then
    raise exception 'Not signed in';
  end if;

  select * into v_offer from public.job_offers where id = p_offer_id for update;
  if not found or v_actor not in (v_offer.customer_id, v_offer.worker_id) then
    raise exception 'Offer not found';
  end if;
  if v_offer.status = 'declined' then
    return;
  end if;
  -- Phase 50: declining a lapsed offer records expired — the truthful outcome
  -- — and returns without error; "make this go away" is satisfied either way.
  if public.expire_offer_if_stale(v_offer) then
    return;
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'This offer is no longer open';
  end if;
  if v_offer.awaiting_id is distinct from v_actor then
    raise exception 'It is not your turn to respond to this offer';
  end if;

  update public.job_offers
     set status = 'declined', awaiting_id = null, updated_at = now()
   where id = p_offer_id;

  perform public.offer_post_event(
    p_offer_id, v_offer.root_offer_id, v_actor, 'declined', v_offer.amount_cents
  );
end;
$$;

create or replace function public.create_offer(
  p_amount_cents integer,
  p_job_id uuid default null,
  p_message text default null,
  p_worker_id uuid default null,
  p_title text default null,
  p_description text default null,
  p_category text default null,
  p_location text default null,
  p_photos jsonb default '[]'::jsonb,
  p_videos jsonb default '[]'::jsonb,
  p_lat double precision default null,
  p_lng double precision default null,
  p_thread_job_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_customer uuid;
  v_worker uuid;
  v_type public.offer_type;
  v_target_job uuid;
  v_awaiting uuid;
  v_offer_id uuid := gen_random_uuid();
  v_thread uuid;
  v_direct uuid;
  v_stale public.job_offers;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Enter an amount greater than zero';
  end if;
  if p_job_id is not null and p_worker_id is not null then
    raise exception 'Send either a bid on a job or an offer to a worker, not both';
  end if;
  if length(coalesce(p_message, '')) > 500 then
    raise exception 'Message is too long';
  end if;

  if p_job_id is not null then
    ---------------------------------------------------------------- marketplace
    select * into v_job from public.jobs where id = p_job_id for share;
    if not found
       or v_job.status <> 'open'
       or v_job.visibility <> 'open_market' then
      raise exception 'Job is not open';
    end if;
    if v_job.client_id = v_actor then
      raise exception 'A client cannot bid on their own job';
    end if;
    if public.is_blocked_between(v_actor, v_job.client_id) then
      raise exception 'Bid is not allowed';
    end if;

    -- Phase 50: a lapsed previous chain must not block the re-bid the
    -- one-active-chain rule promises. Flip it before the unique index sees
    -- the new root.
    for v_stale in
      select * from public.job_offers o
      where o.job_id = p_job_id and o.worker_id = v_actor
        and o.status = 'pending'
        and o.expires_at is not null and o.expires_at <= now()
      for update
    loop
      perform public.expire_offer_if_stale(v_stale);
    end loop;

    v_type := 'marketplace_bid';
    v_target_job := v_job.id;
    v_customer := v_job.client_id;
    v_worker := v_actor;
    v_awaiting := v_job.client_id;

  else
    -------------------------------------------------------------- direct offer
    if p_worker_id is null then
      raise exception 'Choose a worker to send this offer to';
    end if;
    if p_worker_id = v_actor then
      raise exception 'You cannot send an offer to yourself';
    end if;
    if not exists (select 1 from public.profiles p where p.id = p_worker_id) then
      raise exception 'That person is no longer available';
    end if;
    if not public.job_request_parties_ok(v_actor, p_worker_id) then
      raise exception 'This offer cannot be sent';
    end if;
    if length(btrim(coalesce(p_title, ''))) not between 1 and 80 then
      raise exception 'Title must be between 1 and 80 characters';
    end if;
    if length(btrim(coalesce(p_description, ''))) > 500 then
      raise exception 'Description must be 500 characters or fewer';
    end if;
    if p_category is null then
      raise exception 'Choose a category';
    end if;
    if jsonb_typeof(coalesce(p_photos, '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(p_photos, '[]'::jsonb)) > 5 then
      raise exception 'Photos must be an array with at most 5 entries';
    end if;
    if exists (
      select 1 from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) as photo(value)
      where jsonb_typeof(photo.value) <> 'string' or length(photo.value #>> '{}') > 2048
    ) then
      raise exception 'Each photo must be a valid URL or storage reference';
    end if;
    if jsonb_typeof(coalesce(p_videos, '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(p_videos, '[]'::jsonb)) > 2 then
      raise exception 'Videos must be an array with at most 2 entries';
    end if;
    if exists (
      select 1 from jsonb_array_elements(coalesce(p_videos, '[]'::jsonb)) as video(value)
      where jsonb_typeof(video.value) <> 'string' or length(video.value #>> '{}') > 2048
    ) then
      raise exception 'Each video must be a valid URL or storage reference';
    end if;
    if (p_lat is null) <> (p_lng is null)
       or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180)) then
      raise exception 'Coordinates are invalid';
    end if;

    -- Phase 50: same lapsed-chain sweep for the per-pair direct cap.
    for v_stale in
      select * from public.job_offers o
      where o.customer_id = v_actor and o.worker_id = p_worker_id
        and o.offer_type = 'direct_offer'
        and o.status = 'pending'
        and o.expires_at is not null and o.expires_at <= now()
      for update
    loop
      perform public.expire_offer_if_stale(v_stale);
    end loop;

    v_type := 'direct_offer';
    v_customer := v_actor;
    v_worker := p_worker_id;
    v_awaiting := p_worker_id;

    v_target_job := gen_random_uuid();
    insert into public.jobs (
      id, client_id, title, description, category, location,
      budget_cents, status, visibility, photos, videos
    )
    values (
      v_target_job, v_actor, btrim(p_title), coalesce(btrim(p_description), ''),
      p_category::public.job_category, p_location,
      p_amount_cents, 'draft'::public.job_status, 'direct'::public.job_visibility,
      coalesce(p_photos, '[]'::jsonb), coalesce(p_videos, '[]'::jsonb)
    );

    if p_lat is not null then
      insert into public.job_locations (job_id, lat, lng)
      values (v_target_job, p_lat, p_lng);
    end if;

    if p_thread_job_id is not null then
      select j.id into v_thread
      from public.jobs j
      where j.id = p_thread_job_id
        and j.client_id = v_actor
        and j.assigned_worker_id = p_worker_id;
    end if;
    if v_thread is null then
      select j.id into v_thread
      from public.jobs j
      where j.client_id = v_actor
        and j.assigned_worker_id = p_worker_id
        and j.status = 'completed'
      order by j.created_at desc
      limit 1;
    end if;
    if v_thread is null then
      v_direct := public.ensure_direct_thread(v_actor, p_worker_id);
    end if;
  end if;

  insert into public.job_offers (
    id, job_id, offer_type, parent_offer_id, root_offer_id,
    customer_id, worker_id, author_id, awaiting_id,
    amount_cents, message, status
  )
  values (
    v_offer_id, v_target_job, v_type, null, v_offer_id,
    v_customer, v_worker, v_actor, v_awaiting,
    p_amount_cents, nullif(btrim(coalesce(p_message, '')), ''), 'pending'
  );

  if v_type = 'direct_offer' then
    insert into public.messages (
      job_id, direct_thread_id, sender_id, content,
      job_offer_id, request_event, request_amount_cents
    )
    values (v_thread, v_direct, v_actor, '', v_offer_id, 'created', p_amount_cents);
  end if;

  return v_offer_id;
exception
  when unique_violation then
    raise exception 'You already have a live offer open here. Settle it before sending another.';
end;
$$;

-- my_pending_offers(): same signature, now excludes lapsed rows so the inbox
-- badge never counts an offer the RPCs would refuse to act on.
create or replace function public.my_pending_offers()
returns table (
  id uuid,
  job_id uuid,
  offer_type text,
  thread_job_id uuid,
  direct_thread_id uuid,
  customer_id uuid,
  worker_id uuid,
  amount_cents integer,
  status text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
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
  order by o.updated_at desc;
$$;

-- Regrants after CREATE OR REPLACE: not strictly required (REPLACE keeps the
-- ACL) but stated explicitly so this file records who may call what.
revoke all on function public.accept_offer(uuid) from public, anon;
grant execute on function public.accept_offer(uuid) to authenticated;
revoke all on function public.counter_offer(uuid, integer) from public, anon;
grant execute on function public.counter_offer(uuid, integer) to authenticated;
revoke all on function public.decline_offer(uuid) from public, anon;
grant execute on function public.decline_offer(uuid) to authenticated;
revoke all on function public.create_offer(
  integer, uuid, text, uuid, text, text, text, text, jsonb, jsonb,
  double precision, double precision, uuid
) from public, anon;
grant execute on function public.create_offer(
  integer, uuid, text, uuid, text, text, text, text, jsonb, jsonb,
  double precision, double precision, uuid
) to authenticated;
revoke all on function public.my_pending_offers() from public, anon;
grant execute on function public.my_pending_offers() to authenticated;

-- 9. Sentinel -----------------------------------------------------------------
--
-- Created last inside the transaction, so its presence proves sections 2-8
-- all committed. Section 1's enum values are validated by section 2's
-- precondition, so the sentinel transitively proves those too.

create or replace function public.sandbox_payments_enabled()
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$ select true $$;

comment on function public.sandbox_payments_enabled() is
  'Marker for scripts/verify-schema.mjs: phase50_sandbox_payments_and_offer_lifecycle.sql has been applied. Created last inside phase50''s transaction, so its presence proves the entire file committed.';

revoke all on function public.sandbox_payments_enabled() from public, anon;
grant execute on function public.sandbox_payments_enabled() to authenticated;

notify pgrst, 'reload schema';

commit;
