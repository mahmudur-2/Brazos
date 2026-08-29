-- 20260905000000_stripe_foundation.sql — R4: payments schema and the
-- lifecycle exits.
--
-- One transaction, ending in a sentinel function (phase50's shape):
-- stripe_foundation_enabled() exists only if every statement here committed.
-- Implements docs/BRAZOS_TARGET_ARCHITECTURE_v2.md §5.2, adapted to the live
-- shape of the baseline; every place the written design did not survive that
-- contact is marked "DIVERGENCE" in the comments below and repeated in the
-- run report's divergence ledger.
--
-- VOCABULARY. Payment-holding is "held in protection", everywhere. Money is
-- integer cents. No notification copy written here carries a dollar amount.
--
-- THE TWO PROVIDER RULES (every RPC in this file obeys them):
--   * provider = 'sandbox' rows FINALIZE their status in the same statement.
--     Nothing else will ever move them — exactly how sandbox_release_job_payment
--     already behaves. The five sandbox_* functions are untouched; the
--     table-level rules added here (the tip trigger, the widened checks) apply
--     to their rows too, on purpose.
--   * provider = 'stripe' rows STORE THE INTENT (transfer_cents, refund_cents,
--     release_requested_at, the reasons) and stay 'held' until R5's provider
--     events land through apply_payment_event(). R5 moves the stored numbers
--     and computes no policy.
--
-- IMMUTABLE POLICY: fee_schedule is time-versioned. A rate, tax or
-- cancellation-policy change is an INSERT with a future effective_from — never
-- an UPDATE and never a schema change — and no function reads one rate without
-- the others (current_fee() returns the whole row).
--
-- DEFAULT PRIVILEGES. The baseline's tail re-establishes
-- `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON
-- TABLES / SEQUENCES TO anon, authenticated, service_role`, so every table,
-- view and sequence created here is BORN writable by the client. Each one
-- therefore revokes from public, anon and authenticated before any grant.
-- Functions are born executable by PUBLIC (CREATE-time default ACL) and each
-- carries its own revoke/grant pair in the same file.

begin;

-- ---------------------------------------------------------------------------
-- 0. Pre-flight. Fail with a named cause rather than at runtime later.
-- ---------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  -- Every enum label this migration uses already exists on staging (verified
  -- 2026-08-29), so no `alter type … add value` is needed here. If one ever
  -- is, it must run as its own autocommit statement AHEAD of this transaction
  -- (Postgres refuses to use a label inside the transaction that added it),
  -- with this check as the precondition — phase50's pattern.
  select string_agg(want, ', ') into v_missing
  from (values
    ('payment_status', 'refunded'), ('payment_status', 'partially_refunded'),
    ('payment_status', 'voided'), ('payment_status', 'unfunded'),
    ('job_status', 'cancelled'), ('dispute_status', 'resolved'),
    ('dispute_status', 'withdrawn'), ('dispute_reason', 'no_show')
  ) as need(typ, want)
  where not exists (
    select 1 from pg_type t join pg_enum e on e.enumtypid = t.oid
    where t.typnamespace = 'public'::regnamespace and t.typname = need.typ and e.enumlabel = need.want
  );
  if v_missing is not null then
    raise exception 'stripe_foundation: enum label(s) missing: %. Add them as standalone statements before this migration.', v_missing;
  end if;

  if to_regclass('public.notification_outbox') is null then
    raise exception 'stripe_foundation: notification_outbox is missing; the auto-release gate depends on it';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'notification_outbox' and column_name = 'status') then
    raise exception 'stripe_foundation: notification_outbox.status is missing; the auto-release gate reads it';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_provider_known' and conrelid = 'public.payments'::regclass) then
    raise exception 'stripe_foundation: payments_provider_known is not the live provider constraint name';
  end if;
  if to_regprocedure('public.transition_job_status(uuid, text, jsonb, jsonb)') is null then
    raise exception 'stripe_foundation: transition_job_status(uuid, text, jsonb, jsonb) is not the live signature';
  end if;
  if to_regprocedure('public.job_payment_state(uuid)') is null then
    raise exception 'stripe_foundation: job_payment_state(uuid) is missing';
  end if;
  if to_regprocedure('public.enqueue_notification(uuid, uuid, text, text, text, text, jsonb, text)') is null then
    raise exception 'stripe_foundation: enqueue_notification has an unexpected signature';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'payments_one_active_per_job_kind') then
    raise exception 'stripe_foundation: payments_one_active_per_job_kind is missing';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Fee schedule: BOTH sides, tax, cancellation and tip policy, all
--    time-versioned and read together. No client constant.
-- ---------------------------------------------------------------------------
create table if not exists public.fee_schedule (
  id bigint generated always as identity primary key,
  effective_from timestamptz not null,
  customer_bps integer not null check (customer_bps between 0 and 3000),
  worker_bps integer not null check (worker_bps between 0 and 3000),
  worker_min_fee_cents integer not null default 0 check (worker_min_fee_cents >= 0),
  tip_customer_bps integer not null default 0 check (tip_customer_bps between 0 and 3000),
  -- R4 additions (D4): the policy numbers that used to live in function bodies.
  tax_bps integer not null default 0 check (tax_bps between 0 and 3000),
  cancel_fee_bps integer not null default 0 check (cancel_fee_bps between 0 and 10000),
  cancel_fee_min_cents integer not null default 0 check (cancel_fee_min_cents >= 0),
  cancel_fee_max_cents integer not null default 0 check (cancel_fee_max_cents >= 0),
  tip_max_bps integer not null default 0 check (tip_max_bps between 0 and 10000),
  tip_max_cents integer not null default 0 check (tip_max_cents >= 0),
  created_at timestamptz not null default now(),
  constraint fee_schedule_cancel_bounds check (cancel_fee_min_cents <= cancel_fee_max_cents)
);
alter table public.fee_schedule enable row level security;   -- no policies: reachable only through current_fee()
revoke all on table public.fee_schedule from public, anon, authenticated;
revoke all on sequence public.fee_schedule_id_seq from public, anon, authenticated;
-- service_role keeps the default-privilege ALL: a policy change is an INSERT
-- by the operator (SQL Editor / service role), never by the app.

comment on table public.fee_schedule is
  'Time-versioned marketplace policy: fee rates both sides, tax, the cancellation fee and the tip ceilings. Never UPDATE a row — INSERT one with a future effective_from; rows already quoted keep their terms (job_agreements). Read only through current_fee().';

-- DECIDED 2026-08-27 (ADR-0013): 7.5% each side, worker-side minimum $1.00.
-- Tips carry the CUSTOMER fee only. R4 (D4/D5/D9): tax 0 today, cancellation
-- fee 20% of the agreed price floored at $15 and capped at $35, tips capped at
-- 50% of the job price and at $1,000.
insert into public.fee_schedule (effective_from, customer_bps, worker_bps, worker_min_fee_cents, tip_customer_bps,
                                 tax_bps, cancel_fee_bps, cancel_fee_min_cents, cancel_fee_max_cents, tip_max_bps, tip_max_cents)
  select '2026-01-01', 750, 750, 100, 750, 0, 2000, 1500, 3500, 5000, 100000
  where not exists (select 1 from public.fee_schedule);

-- ONE function returns every number, all time-filtered together. Reading one
-- rate with `effective_from <= now()` and another without it is how a
-- future-dated row starts charging today.
create or replace function public.current_fee(p_at timestamptz default now())
returns table (id bigint, effective_from timestamptz,
               customer_bps integer, worker_bps integer, worker_min_fee_cents integer, tip_customer_bps integer,
               tax_bps integer, cancel_fee_bps integer, cancel_fee_min_cents integer, cancel_fee_max_cents integer,
               tip_max_bps integer, tip_max_cents integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select f.id, f.effective_from,
         f.customer_bps, f.worker_bps, f.worker_min_fee_cents, f.tip_customer_bps,
         f.tax_bps, f.cancel_fee_bps, f.cancel_fee_min_cents, f.cancel_fee_max_cents,
         f.tip_max_bps, f.tip_max_cents
  from public.fee_schedule f
  where f.effective_from <= p_at
  order by f.effective_from desc
  limit 1
$$;
revoke all on function public.current_fee(timestamptz) from public, anon;
grant execute on function public.current_fee(timestamptz) to authenticated, service_role;
comment on function public.current_fee(timestamptz) is
  'The fee_schedule row in force at p_at (default now()) — every rate together, never one alone. A future-dated row does not apply until its effective_from.';

-- The quote a screen shows BEFORE a payment row exists. One source of
-- arithmetic for every surface, so no screen ever multiplies by a rate.
-- DIVERGENCE (D4): returns a tax_cents line and total_cents includes it. Tax
-- is computed on what the customer is charged (price + protection fee); the
-- rate is 0 today, so this is a shape decision, not a number.
-- DIVERGENCE (defensive): the worker-side fee never exceeds the price itself,
-- so worker_receives_cents cannot go negative on a job below the minimum fee.
create or replace function public.quote_job_price(p_amount_cents integer, p_at timestamptz default now())
returns table (job_price_cents integer, customer_fee_cents integer, tax_cents integer, total_cents integer,
               worker_fee_cents integer, worker_receives_cents integer)
language sql stable security definer set search_path = public, pg_temp as $$
  with f as (select * from public.current_fee(p_at)),
  c as (
    select p_amount_cents as price,
           round(p_amount_cents * f.customer_bps / 10000.0)::integer as cfee,
           least(p_amount_cents, greatest(round(p_amount_cents * f.worker_bps / 10000.0)::integer, f.worker_min_fee_cents)) as wfee,
           f.tax_bps
    from f
  ),
  t as (
    select c.*, round((c.price + c.cfee) * c.tax_bps / 10000.0)::integer as tax from c
  )
  select t.price, t.cfee, t.tax, t.price + t.cfee + t.tax, t.wfee, t.price - t.wfee from t
$$;
revoke all on function public.quote_job_price(integer, timestamptz) from public, anon;
grant execute on function public.quote_job_price(integer, timestamptz) to authenticated, service_role;
comment on function public.quote_job_price(integer, timestamptz) is
  'The only price arithmetic: job price, Brazos Protection (customer side), tax, the all-in total the customer pays, the worker-side fee and what the worker receives — at the schedule in force at p_at.';

-- ---------------------------------------------------------------------------
-- 2. Ledger widening — EXTEND public.payments, never replace it.
-- ---------------------------------------------------------------------------
-- DIVERGENCE (D2): §5.2 drops "payments_provider_check"; the live constraint
-- is payments_provider_known. Dropped and recreated BY THE LIVE NAME.
alter table public.payments drop constraint if exists payments_provider_known;
alter table public.payments add constraint payments_provider_known check (provider in ('sandbox', 'stripe'));

-- release_reason gains the two exits this migration creates.
alter table public.payments drop constraint if exists payments_release_reason_known;
alter table public.payments add constraint payments_release_reason_known
  check (release_reason is null or release_reason in ('approved', 'auto_approved', 'cancellation_fee', 'dispute_resolved'));

alter table public.payments
  add column if not exists customer_fee_bps integer,
  add column if not exists customer_fee_cents integer not null default 0,
  add column if not exists worker_fee_bps integer,
  add column if not exists tax_cents integer not null default 0,
  add column if not exists transfer_ref text,
  add column if not exists refund_ref text,
  add column if not exists release_requested_at timestamptz,
  add column if not exists funding_due_at timestamptz,
  add column if not exists chargeback_ref text,
  add column if not exists chargeback_at timestamptz,
  add column if not exists last_error text,
  -- R4 (D3/D6): what R5 must move, stored as intent on stripe rows.
  add column if not exists transfer_cents integer,
  add column if not exists refund_cents integer,
  add column if not exists refund_reason text,
  -- R4 (D11): the reversal park and the idempotency counter.
  add column if not exists transfer_reversed_at timestamptz,
  add column if not exists transfer_attempts integer not null default 0;

-- The number the card is charged. amount_cents keeps its existing meaning —
-- the agreed job price, the worker's accepted bid — so nothing that reads it
-- today changes meaning. Generated, so the three can never drift.
alter table public.payments
  add column if not exists charge_amount_cents integer
  generated always as (amount_cents + customer_fee_cents + tax_cents) stored;

alter table public.payments drop constraint if exists payments_customer_fee_not_negative;
alter table public.payments add constraint payments_customer_fee_not_negative check (customer_fee_cents >= 0);
alter table public.payments drop constraint if exists payments_tax_not_negative;
alter table public.payments add constraint payments_tax_not_negative check (tax_cents >= 0);
alter table public.payments drop constraint if exists payments_transfer_cents_not_negative;
alter table public.payments add constraint payments_transfer_cents_not_negative check (transfer_cents is null or transfer_cents >= 0);
alter table public.payments drop constraint if exists payments_refund_cents_bounded;
alter table public.payments add constraint payments_refund_cents_bounded
  check (refund_cents is null or (refund_cents >= 0 and refund_cents <= amount_cents + customer_fee_cents + tax_cents));
alter table public.payments drop constraint if exists payments_transfer_attempts_not_negative;
alter table public.payments add constraint payments_transfer_attempts_not_negative check (transfer_attempts >= 0);
-- Exactly the reasons this migration writes, nothing else.
alter table public.payments drop constraint if exists payments_refund_reason_known;
alter table public.payments add constraint payments_refund_reason_known
  check (refund_reason is null or refund_reason in
    ('customer_cancelled_free', 'customer_cancelled_late', 'worker_cancelled', 'no_show_withdrawn', 'customer_no_show', 'dispute_refund'));

comment on column public.payments.amount_cents is
  'The agreed job price (the accepted bid). NOT what the card is charged — see charge_amount_cents.';
comment on column public.payments.customer_fee_cents is
  'Brazos Protection, added on top of the job price and paid by the customer. 0 for legacy sandbox rows.';
comment on column public.payments.tax_cents is
  'Tax on what the customer is charged, frozen at quote time from fee_schedule.tax_bps (0 today). Refunded in full on every cancellation.';
comment on column public.payments.platform_fee_cents is
  'The WORKER-side deduction. Worker receives amount_cents - platform_fee_cents. Always 0 for tips.';
comment on column public.payments.charge_amount_cents is
  'What the PaymentIntent charges and what every customer-facing surface must display. All-in pricing is not optional (NYC DCWP).';
comment on column public.payments.chargeback_at is
  'A CARD NETWORK dispute (charge.dispute.created), not the in-app job_disputes flow. Blocks release while set.';
comment on column public.payments.transfer_cents is
  'What must move to the worker: set by release_job_payment / auto_release_due_payments / cancel_job / resolve_job_dispute. R5 transfers exactly this and computes nothing.';
comment on column public.payments.refund_cents is
  'What must go back to the customer, against charge_amount_cents: set by cancel_job / resolve_job_dispute / the no-show withdrawal trigger. R5 refunds exactly this and computes nothing.';
comment on column public.payments.refund_reason is
  'Why refund_cents was written. customer_cancelled_free / customer_cancelled_late / worker_cancelled / no_show_withdrawn / customer_no_show / dispute_refund.';
comment on column public.payments.release_requested_at is
  'When a transfer to the worker was requested (the release). Preserved through a transfer reversal so the customer''s release button never re-opens; only resolve_job_dispute clears a reversal park.';
comment on column public.payments.transfer_reversed_at is
  'Set by transfer.reversed: the row is parked — out of transfers_due — until resolve_job_dispute decides. Cleared only there, incrementing transfer_attempts.';
comment on column public.payments.transfer_attempts is
  'How many transfers have been attempted for this row. R5''s idempotency key is tr:<payment id>:<transfer_attempts>, so a reversed transfer is never returned by a retry.';

-- payments_one_active_per_job_kind (unique on (job_id, kind) where status not
-- in ('failed', 'voided')) is UNCHANGED, on purpose. A cancelled job is
-- terminal and never needs a second checkout; a refunded or
-- partially_refunded row is that job's permanent money record and occupies
-- the slot ON PURPOSE so nothing can open a second charge on a cancelled job.
comment on index public.payments_one_active_per_job_kind is
  'One active money row per (job, kind). failed and voided free the slot so a fresh checkout can start; refunded and partially_refunded do NOT — a cancelled job is terminal and its refund row is its permanent money record, so nothing can open a second charge on it.';

-- The release queue index matches public.transfers_due (section 9) as closely
-- as an index can: the view additionally excludes rows whose job has an open
-- in-app dispute, which an index predicate cannot express.
-- DIVERGENCE (D11): §5.2's predicate was (release_requested_at not null and
-- transfer_ref null), which would re-queue a reversed transfer.
drop index if exists public.payments_release_queue_idx;
create index if not exists payments_release_queue_idx on public.payments (release_requested_at)
  where provider = 'stripe' and release_requested_at is not null and transfer_ref is null
    and transfer_reversed_at is null and transfer_cents > 0;
create index if not exists payments_funding_window_idx on public.payments (funding_due_at)
  where status = 'unfunded' and funding_due_at is not null;
create unique index if not exists payments_provider_ref_uniq on public.payments (provider, provider_ref)
  where provider_ref is not null;

-- ---------------------------------------------------------------------------
-- 3. Remote config: the kill switch, the version floor, maintenance.
-- DIVERGENCE (D12): §5.2 wrote a single-row table; the shipped client
-- (lib/remoteConfig.ts) reads `select key, value from app_config` and expects
-- one row per setting, anon-readable, merged over its fallback. The client's
-- shape wins — a single-row table would never be read.
-- ---------------------------------------------------------------------------
create table if not exists public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
revoke all on table public.app_config from public, anon, authenticated;
grant select on table public.app_config to anon, authenticated;
grant all on table public.app_config to service_role;
drop policy if exists "app_config is world-readable" on public.app_config;
create policy "app_config is world-readable" on public.app_config for select to anon, authenticated using (true);
-- Writes: service_role and the SQL Editor only. Flipping a switch is one UPDATE.
insert into public.app_config (key, value) values
  ('maintenanceMode', 'false'::jsonb),
  ('maintenanceMessage', '""'::jsonb),
  ('minimumSupportedVersion', '"0.0.0"'::jsonb),
  ('postingEnabled', 'true'::jsonb),
  ('paymentsEnabled', 'true'::jsonb)
on conflict (key) do nothing;
comment on table public.app_config is
  'One row per setting, read by lib/remoteConfig.ts as (key, value jsonb) and merged over the client fallback. paymentsEnabled gates begin_job_payment / begin_tip_payment (absent key = enabled; only the jsonb boolean true enables). Writes are service_role / SQL Editor only.';

-- ---------------------------------------------------------------------------
-- 4. Provider event inbox (idempotency key = the provider''s event id)
-- ---------------------------------------------------------------------------
create table if not exists public.payment_events (
  id text primary key,
  type text not null,
  account_id text,                       -- event.account for connected-account events
  payment_id uuid references public.payments (id),
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0,
  error text
);
alter table public.payment_events enable row level security;
revoke all on table public.payment_events from public, anon, authenticated;
grant all on table public.payment_events to service_role;
create index if not exists payment_events_unprocessed_idx on public.payment_events (received_at) where processed_at is null;
comment on table public.payment_events is
  'Raw provider events. The payload carries cardholder billing details — service_role only, and the sweeper prunes payloads older than 90 days (keeping id/type/processed_at).';

-- ---------------------------------------------------------------------------
-- 5. Provider identity lives in ITS OWN owner-only table, never on profiles.
-- ---------------------------------------------------------------------------
create table if not exists public.payment_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_account_id text unique,
  payouts_enabled boolean not null default false,
  payouts_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.payment_accounts enable row level security;
revoke all on table public.payment_accounts from public, anon, authenticated;
grant all on table public.payment_accounts to service_role;
-- No policies and no client grants: reachable only through SECURITY DEFINER
-- functions and service_role. The one fact a user needs about their own row
-- is payouts_enabled, and my_payouts_enabled() returns it.

create or replace function public.my_payouts_enabled() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select payouts_enabled from public.payment_accounts where user_id = auth.uid()), false)
$$;
revoke all on function public.my_payouts_enabled() from public, anon;
grant execute on function public.my_payouts_enabled() to authenticated;

-- DIVERGENCE (D11): §5.2 parsed account.updated inside apply_payment_event.
-- The provider''s account object has changed shape and R5 owns that parsing;
-- R5 calls this instead.
create or replace function public.set_payouts_enabled(p_stripe_account_id text, p_enabled boolean) returns boolean
language sql security definer set search_path = public, pg_temp as $$
  with u as (
    update public.payment_accounts
       set payouts_enabled = p_enabled, payouts_checked_at = now(), updated_at = now()
     where stripe_account_id = p_stripe_account_id
    returning 1
  )
  select exists (select 1 from u)
$$;
revoke all on function public.set_payouts_enabled(text, boolean) from public, anon, authenticated;
grant execute on function public.set_payouts_enabled(text, boolean) to service_role;
comment on function public.set_payouts_enabled(text, boolean) is
  'service_role only (R5): records whether the connected account can receive payouts. Returns true when a payment_accounts row matched.';

-- ---------------------------------------------------------------------------
-- 6. jobs: the cancellation record (D6). All nullable — ban_user() and
--    delete_my_account() keep writing status = cancelled directly and leave
--    these null.
-- ---------------------------------------------------------------------------
alter table public.jobs
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles (id) on delete set null,
  add column if not exists cancel_reason text;
alter table public.jobs drop constraint if exists jobs_cancel_reason_known;
alter table public.jobs add constraint jobs_cancel_reason_known
  check (cancel_reason is null or cancel_reason in ('customer_cancelled', 'worker_cancelled', 'customer_no_show'));
comment on column public.jobs.cancel_reason is
  'Why cancel_job() cancelled this job: customer_cancelled / worker_cancelled / customer_no_show. NULL for the two direct writers (ban_user, delete_my_account) and for jobs never cancelled. A cancelled job is terminal.';

-- ---------------------------------------------------------------------------
-- 7. The agreement snapshot (D10): one immutable row per job, written when
--    jobs.accepted_offer_id goes from null to a value. It is the chargeback
--    evidence and the written-terms record; it cannot be retrofitted.
-- ---------------------------------------------------------------------------
create table if not exists public.job_agreements (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  offer_id uuid not null references public.job_offers (id),
  customer_id uuid not null references public.profiles (id),
  worker_id uuid not null references public.profiles (id),
  category text not null,
  title text not null,
  description text,
  agreed_price_cents integer not null check (agreed_price_cents > 0),
  customer_fee_cents integer not null check (customer_fee_cents >= 0),
  worker_fee_cents integer not null check (worker_fee_cents >= 0),
  tax_cents integer not null check (tax_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  cancel_fee_bps integer not null,
  cancel_fee_min_cents integer not null,
  cancel_fee_max_cents integer not null,
  fee_schedule_id bigint not null references public.fee_schedule (id),
  scheduled_date date,
  arrival_start_hour smallint,
  arrival_end_hour smallint,
  accepted_at timestamptz not null default now()
);
alter table public.job_agreements enable row level security;
-- No role holds INSERT, UPDATE or DELETE — including service_role. A row is
-- written only by the trigger below (SECURITY DEFINER, as the owner) and
-- leaves only with its job's own cascade.
revoke all on table public.job_agreements from public, anon, authenticated, service_role;
grant select on table public.job_agreements to authenticated, service_role;
drop policy if exists "job_agreements_select_parties" on public.job_agreements;
create policy "job_agreements_select_parties" on public.job_agreements for select to authenticated
  using ((select auth.uid()) in (customer_id, worker_id));
comment on table public.job_agreements is
  'The written terms at acceptance: scope text, agreed price, both fee sides, tax, the all-in total and the cancellation terms, frozen from the fee_schedule in force. Immutable (UPDATE raises for every role); readable by the two parties only; leaves only with its job''s cascade.';

create or replace function public.job_agreements_immutable() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'job_agreements is immutable: the written terms of a hire cannot be changed';
end $$;
revoke all on function public.job_agreements_immutable() from public, anon, authenticated;
drop trigger if exists job_agreements_immutable on public.job_agreements;
create trigger job_agreements_immutable before update on public.job_agreements
  for each row execute function public.job_agreements_immutable();

-- Written by an AFTER UPDATE trigger on jobs rather than by editing
-- accept_offer(): accept_offer sets status, assigned_worker_id,
-- accepted_offer_id and final_amount_cents in one UPDATE, and a repeated
-- accept returns early, so the null -> value edge fires exactly once.
-- on conflict do nothing makes the snapshot idempotent regardless.
create or replace function public.snapshot_job_agreement() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_offer public.job_offers;
  v_fee record;
  v_quote record;
  v_amount integer;
begin
  select * into v_offer from public.job_offers where id = new.accepted_offer_id;
  if not found then
    return new;   -- the FK makes this unreachable; never block a hire on the snapshot
  end if;
  v_amount := coalesce(new.final_amount_cents, v_offer.amount_cents);
  select * into v_fee from public.current_fee();
  select * into v_quote from public.quote_job_price(v_amount);

  insert into public.job_agreements (
    job_id, offer_id, customer_id, worker_id, category, title, description,
    agreed_price_cents, customer_fee_cents, worker_fee_cents, tax_cents, total_cents,
    cancel_fee_bps, cancel_fee_min_cents, cancel_fee_max_cents, fee_schedule_id,
    scheduled_date, arrival_start_hour, arrival_end_hour, accepted_at
  )
  values (
    new.id, v_offer.id, new.client_id, coalesce(new.assigned_worker_id, v_offer.worker_id),
    new.category::text, new.title, new.description,
    v_amount, v_quote.customer_fee_cents, v_quote.worker_fee_cents, v_quote.tax_cents, v_quote.total_cents,
    v_fee.cancel_fee_bps, v_fee.cancel_fee_min_cents, v_fee.cancel_fee_max_cents, v_fee.id,
    new.scheduled_date, new.arrival_start_hour, new.arrival_end_hour, now()
  )
  on conflict (job_id) do nothing;
  return new;
end $$;
revoke all on function public.snapshot_job_agreement() from public, anon, authenticated;
drop trigger if exists jobs_snapshot_agreement on public.jobs;
create trigger jobs_snapshot_agreement after update of accepted_offer_id on public.jobs
  for each row when (old.accepted_offer_id is null and new.accepted_offer_id is not null)
  execute function public.snapshot_job_agreement();

-- ---------------------------------------------------------------------------
-- 8. The terms a job is charged and cancelled under: ONE lookup (P3-31).
--    A funded job keeps the terms it was quoted (the snapshot); a job hired
--    before this migration has no snapshot, uses current_fee(), and has no
--    15-minute grace (accepted_at is null).
-- ---------------------------------------------------------------------------
create or replace function public.job_terms(p_job_id uuid, p_amount_cents integer)
returns table (from_snapshot boolean, accepted_at timestamptz, fee_schedule_id bigint,
               customer_fee_bps integer, worker_fee_bps integer,
               customer_fee_cents integer, worker_fee_cents integer, tax_cents integer, total_cents integer,
               cancel_fee_bps integer, cancel_fee_min_cents integer, cancel_fee_max_cents integer)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_a public.job_agreements;
  v_sched public.fee_schedule;
  v_f record;
  v_q record;
begin
  select * into v_a from public.job_agreements a where a.job_id = p_job_id;
  if found and v_a.agreed_price_cents = p_amount_cents then
    select * into v_sched from public.fee_schedule s where s.id = v_a.fee_schedule_id;
    return query select true, v_a.accepted_at, v_a.fee_schedule_id,
      v_sched.customer_bps, v_sched.worker_bps,
      v_a.customer_fee_cents, v_a.worker_fee_cents, v_a.tax_cents, v_a.total_cents,
      v_a.cancel_fee_bps, v_a.cancel_fee_min_cents, v_a.cancel_fee_max_cents;
    return;
  end if;
  select * into v_f from public.current_fee();
  select * into v_q from public.quote_job_price(p_amount_cents);
  return query select false, v_a.accepted_at, v_f.id,
    v_f.customer_bps, v_f.worker_bps,
    v_q.customer_fee_cents, v_q.worker_fee_cents, v_q.tax_cents, v_q.total_cents,
    v_f.cancel_fee_bps, v_f.cancel_fee_min_cents, v_f.cancel_fee_max_cents;
end $$;
revoke all on function public.job_terms(uuid, integer) from public, anon, authenticated;

-- The cancellation fee (D5): 20% of the agreed price — never the all-in
-- total — floored and capped by the terms, and never more than the price.
-- The whole fee goes to the worker; no worker-side platform fee is taken
-- from it. Used by cancel_job() and resolve_job_dispute(); nowhere else.
create or replace function public.cancellation_fee_cents(p_job_id uuid, p_amount_cents integer) returns integer
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_t record;
  v_fee integer;
begin
  select * into v_t from public.job_terms(p_job_id, p_amount_cents);
  v_fee := least(v_t.cancel_fee_max_cents,
                 greatest(v_t.cancel_fee_min_cents, round(p_amount_cents * v_t.cancel_fee_bps / 10000.0)::integer));
  return least(v_fee, p_amount_cents);
end $$;
revoke all on function public.cancellation_fee_cents(uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. begin_job_payment(): the authenticated entry to a stripe checkout.
-- ---------------------------------------------------------------------------
create or replace function public.begin_job_payment(p_job_id uuid) returns public.payments
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor    uuid := auth.uid();
  v_job      public.jobs;
  v_payment  public.payments;
  v_amount   integer;
  v_t        record;
  v_reuse    boolean := false;
begin
  if v_actor is null or not public.is_active_user() then raise exception 'Active authentication required'; end if;

  -- DIVERGENCE (D12): the kill switch is the paymentsEnabled key. Absent =
  -- enabled; only the jsonb boolean true enables — anything else pauses.
  if not coalesce((select c.value = 'true'::jsonb from public.app_config c where c.key = 'paymentsEnabled'), true) then
    raise exception 'Payments are paused right now. Please try again shortly.';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then raise exception 'Job not found'; end if;

  -- Only 'assigned'. Accepting in_progress or completed here would say the
  -- protection is optional; D8 makes 'held' the gate to in_progress.
  if v_job.assigned_worker_id is null or v_job.status <> 'assigned' then
    raise exception 'Accept an offer before protecting a payment';
  end if;

  v_amount := coalesce(v_job.final_amount_cents, v_job.budget_cents);
  if v_amount is null or v_amount <= 0 then raise exception 'This job has no agreed amount'; end if;
  -- The terms the customer was quoted at acceptance, when a snapshot exists.
  select * into v_t from public.job_terms(p_job_id, v_amount);

  select * into v_payment from public.payments
   where job_id = p_job_id and kind = 'job_payment' and status not in ('failed', 'voided')
   for update;

  if found then
    if v_payment.status <> 'unfunded' then raise exception 'This job already has a protected payment'; end if;

    if v_payment.amount_cents = v_amount then
      v_reuse := true;                       -- plain resume: same money, same intent
    elsif v_payment.provider_ref is null then
      update public.payments set                                  -- nothing exists at the provider yet
        amount_cents = v_amount,
        customer_fee_cents = v_t.customer_fee_cents,
        platform_fee_cents = v_t.worker_fee_cents,
        tax_cents = v_t.tax_cents,
        customer_fee_bps = v_t.customer_fee_bps, worker_fee_bps = v_t.worker_fee_bps,
        funding_due_at = now() + interval '24 hours', updated_at = now()
      where id = v_payment.id returning * into v_payment;
      v_reuse := true;
    else
      -- A PaymentIntent exists at a stale amount and nothing has been charged.
      -- Abandon it; the sweeper cancels it at the provider. Then fall through.
      update public.payments
        set status = 'voided', last_error = 'agreed amount changed before funding', updated_at = now()
      where id = v_payment.id;
    end if;

    if v_reuse then
      if v_payment.funding_due_at is null then
        update public.payments set funding_due_at = now() + interval '24 hours', updated_at = now()
        where id = v_payment.id returning * into v_payment;
      end if;
      return v_payment;
    end if;
  end if;

  insert into public.payments (job_id, offer_id, payer_id, payee_id, kind, amount_cents,
                               customer_fee_cents, platform_fee_cents, tax_cents,
                               customer_fee_bps, worker_fee_bps, provider, status, funding_due_at)
  values (p_job_id, v_job.accepted_offer_id, v_actor, v_job.assigned_worker_id, 'job_payment', v_amount,
          v_t.customer_fee_cents, v_t.worker_fee_cents, v_t.tax_cents,
          v_t.customer_fee_bps, v_t.worker_fee_bps, 'stripe', 'unfunded', now() + interval '24 hours')
  returning * into v_payment;
  return v_payment;
end $$;
revoke all on function public.begin_job_payment(uuid) from public, anon;
grant execute on function public.begin_job_payment(uuid) to authenticated;
comment on function public.begin_job_payment(uuid) is
  'The customer starts protecting an assigned job''s payment: the stripe ledger row is born unfunded with BOTH fee sides and tax frozen from the agreement snapshot (or current_fee()). Idempotent on an existing unfunded row.';

-- ---------------------------------------------------------------------------
-- 10. Service-role only: attach the PaymentIntent id.
-- ---------------------------------------------------------------------------
create or replace function public.attach_provider_ref(p_payment_id uuid, p_ref text) returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.payments set provider_ref = p_ref, updated_at = now()
   where id = p_payment_id and provider = 'stripe' and provider_ref is null;
$$;
revoke all on function public.attach_provider_ref(uuid, text) from public, anon, authenticated;
grant execute on function public.attach_provider_ref(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 11. apply_payment_event(): THE state mover for stripe rows.
--     Idempotent per event id; monotonic per ledger row; NEVER raises past its
--     own boundary — it records the error on the event and returns ok:false.
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
            (case when v_refunded is null then status
                  when v_refunded >= charge_amount_cents then 'refunded'
                  else 'partially_refunded' end)
          when v_type = 'charge.dispute.closed' and v_obj ->> 'status' = 'lost' then 'refunded'
          else status end::public.payment_status,

        held_at      = case when v_type = 'payment_intent.succeeded' and v_payment.kind = 'job_payment'
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
        last_error   = case when v_type = 'transfer.reversed' then 'transfer reversed at the provider' else last_error end,
        refund_cents = case when v_type = 'charge.refunded' then coalesce(refund_cents, v_refunded) else refund_cents end,
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

-- ---------------------------------------------------------------------------
-- 12. release_job_payment(): the customer's approval.
--     stripe rows: sets the intent (release_requested_at, transfer_cents) and
--     stays held until transfer.created. sandbox rows: finalize here (D3).
-- ---------------------------------------------------------------------------
create or replace function public.release_job_payment(p_job_id uuid) returns public.payments
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_payment public.payments;
begin
  if v_actor is null or not public.is_active_user() then raise exception 'Active authentication required'; end if;
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then raise exception 'Job not found'; end if;
  select * into v_payment from public.payments
   where job_id = p_job_id and kind = 'job_payment' and status not in ('failed', 'voided') for update;
  if not found then raise exception 'This job has no payment to release'; end if;
  -- Idempotent return, not a refusal: a release already requested (or already
  -- landed) returns the row with release_requested_at UNCHANGED. This is also
  -- what keeps a reversal-parked row exactly where it is.
  if v_payment.status in ('released', 'paid_out') or v_payment.release_requested_at is not null then return v_payment; end if;
  if v_job.status <> 'completed' then raise exception 'Funds release only after the job is completed'; end if;
  if exists (select 1 from public.job_disputes d where d.job_id = p_job_id and d.status = 'open') then
    raise exception 'An open issue report is holding this payment';
  end if;
  if v_payment.chargeback_at is not null then
    raise exception 'This payment is under review by the card issuer and cannot be released';
  end if;
  -- D6: a row already directed to a refund, or parked after a reversal, is skipped.
  if coalesce(v_payment.refund_cents, 0) > 0 or v_payment.transfer_reversed_at is not null then
    raise exception 'This payment is being refunded and cannot be released';
  end if;
  if v_payment.status <> 'held' then raise exception 'This payment is not held (%)', v_payment.status; end if;

  update public.payments
     set release_requested_at = now(),
         release_reason = 'approved',
         transfer_cents = amount_cents - platform_fee_cents,
         status = case when provider = 'sandbox' then 'released'::public.payment_status else status end,
         released_at = case when provider = 'sandbox' then now() else released_at end,
         updated_at = now()
   where id = v_payment.id returning * into v_payment;
  return v_payment;
end $$;
revoke all on function public.release_job_payment(uuid) from public, anon;
grant execute on function public.release_job_payment(uuid) to authenticated;
comment on function public.release_job_payment(uuid) is
  'The customer approves the finished work. Guards: completed, no open issue report, no card dispute, not being refunded, held. Sets release_requested_at + transfer_cents (R5 transfers exactly that); sandbox rows release immediately. A repeated call returns the row unchanged.';

-- ---------------------------------------------------------------------------
-- 13. The stripe 72h clock, gated on the customer actually having been told.
-- DIVERGENCE (D13): §5.2 gated on an outbox row older than one hour because
-- the delivery-state column was UNKNOWN. notification_outbox carries
-- status in ('pending','sent','failed','skipped') and sent_at: the gate is
-- status = 'sent' and the age test is dropped. The completion notification is
-- type 'job_completed' with data.jobId (notify_on_job_status), not
-- '%complet%' / data.job_id as §5.2 guessed.
-- sandbox rows are NOT this clock's: their 72h clock stays inside
-- job_payment_state() (section 17).
-- ---------------------------------------------------------------------------
create or replace function public.auto_release_due_payments() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n integer;
begin
  update public.payments p
     set release_requested_at = now(),
         release_reason = 'auto_approved',
         transfer_cents = p.amount_cents - p.platform_fee_cents,
         updated_at = now()
    from public.jobs j
   where j.id = p.job_id
     and p.provider = 'stripe'
     and p.kind = 'job_payment' and p.status = 'held'
     and p.release_requested_at is null and p.chargeback_at is null
     and coalesce(p.refund_cents, 0) = 0 and p.transfer_reversed_at is null
     and j.status = 'completed' and j.completed_at is not null
     and now() >= j.completed_at + interval '72 hours'
     and not exists (select 1 from public.job_disputes d where d.job_id = j.id and d.status = 'open')
     -- THE GATE: the completion notification actually went out.
     and exists (
       select 1 from public.notification_outbox o
        where o.recipient_id = j.client_id
          and o.type = 'job_completed'
          and o.data ->> 'jobId' = j.id::text
          and o.status = 'sent'
     );
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.auto_release_due_payments() from public, anon, authenticated;
grant execute on function public.auto_release_due_payments() to service_role;

-- ---------------------------------------------------------------------------
-- 14. The funding window: an unfunded stripe row does not sit forever.
-- ---------------------------------------------------------------------------
create or replace function public.expire_unfunded_payments() returns setof public.payments
language sql security definer set search_path = public, pg_temp as $$
  update public.payments
     set status = 'voided', last_error = 'funding window expired', updated_at = now()
   where provider = 'stripe' and status = 'unfunded' and funding_due_at is not null and funding_due_at < now()
  returning *;
$$;
revoke all on function public.expire_unfunded_payments() from public, anon, authenticated;
grant execute on function public.expire_unfunded_payments() to service_role;

-- ---------------------------------------------------------------------------
-- 15. The two queues, defined ONCE (D11), service-role only. R5's crons and
--     the tests both read these; nothing re-derives them.
-- ---------------------------------------------------------------------------
create or replace view public.transfers_due as
  select p.*
    from public.payments p
   where p.provider = 'stripe'
     and p.release_requested_at is not null
     and p.transfer_ref is null
     and p.transfer_reversed_at is null
     and coalesce(p.transfer_cents, 0) > 0
     -- DIVERGENCE (safety, beyond D11's predicate): an open in-app dispute
     -- freezes the transfer as it freezes the release. A dispute opened in
     -- the minute between release_requested_at and transfer.created would
     -- otherwise be toothless.
     and not exists (select 1 from public.job_disputes d where d.job_id = p.job_id and d.status = 'open')
   order by p.release_requested_at;
revoke all on table public.transfers_due from public, anon, authenticated;
grant select on table public.transfers_due to service_role;
comment on view public.transfers_due is
  'stripe rows whose transfer to the worker is due: release requested, not yet transferred, not parked by a reversal, transfer_cents > 0, no open issue report. R5 transfers transfer_cents with idempotency key tr:<id>:<transfer_attempts>.';

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
revoke all on table public.refunds_due from public, anon, authenticated;
grant select on table public.refunds_due to service_role;
comment on view public.refunds_due is
  'stripe rows whose refund to the customer is due: refund_cents > 0 and no refund recorded yet. R5 refunds refund_cents against the charge; charge.refunded then settles the status.';

-- ---------------------------------------------------------------------------
-- 16. Tips (D9): BOTH ceilings enforced in the database, on both paths, by
--     one BEFORE INSERT trigger. Tips carry the customer fee only.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_tip_ceiling() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $tip$
declare
  v_fee record;
  v_base integer;
  v_limit integer;
begin
  if new.kind <> 'tip' then return new; end if;
  if new.platform_fee_cents <> 0 then
    raise exception 'Tips carry no worker-side fee';
  end if;
  select * into v_fee from public.current_fee();
  select p.amount_cents into v_base
    from public.payments p
   where p.job_id = new.job_id and p.kind = 'job_payment' and p.status not in ('failed', 'voided');
  if v_base is null then
    raise exception 'A tip needs the job payment first';
  end if;
  v_limit := least(v_fee.tip_max_cents, round(v_base * v_fee.tip_max_bps / 10000.0)::integer);
  if new.amount_cents > v_limit then
    raise exception 'A tip on this job can be at most $%', to_char(v_limit / 100.0, 'FM999,999,990.00');
  end if;
  return new;
end $tip$;
revoke all on function public.enforce_tip_ceiling() from public, anon, authenticated;
drop trigger if exists payments_tip_ceiling on public.payments;
create trigger payments_tip_ceiling before insert on public.payments
  for each row when (new.kind = 'tip') execute function public.enforce_tip_ceiling();
-- sandbox_tip_worker's own $1,000 check stays untouched and is now redundant.

-- DIVERGENCE (D9): §5.2 has no stripe-path tip entry. The customer's tip on a
-- completed job whose payment released: a separate charge, row born unfunded,
-- released on payment_intent.succeeded, through the same trigger.
create or replace function public.begin_tip_payment(p_job_id uuid, p_amount_cents integer) returns public.payments
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_main public.payments;
  v_tip public.payments;
  v_fee record;
  v_cfee integer;
  v_tax integer;
begin
  if v_actor is null or not public.is_active_user() then raise exception 'Active authentication required'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Enter a tip amount greater than zero'; end if;
  if not coalesce((select c.value = 'true'::jsonb from public.app_config c where c.key = 'paymentsEnabled'), true) then
    raise exception 'Payments are paused right now. Please try again shortly.';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then raise exception 'Job not found'; end if;
  if v_job.status <> 'completed' or v_job.assigned_worker_id is null then raise exception 'Tips are for completed jobs'; end if;

  select * into v_main from public.payments
   where job_id = p_job_id and kind = 'job_payment' and status not in ('failed', 'voided') for update;
  if not found or v_main.status not in ('released', 'paid_out') then
    raise exception 'The job payment releases first — then a tip can be added';
  end if;

  select * into v_fee from public.current_fee();
  v_cfee := round(p_amount_cents * v_fee.tip_customer_bps / 10000.0)::integer;
  v_tax := round((p_amount_cents + v_cfee) * v_fee.tax_bps / 10000.0)::integer;

  select * into v_tip from public.payments
   where job_id = p_job_id and kind = 'tip' and status not in ('failed', 'voided') for update;
  if found then
    if v_tip.status <> 'unfunded' then raise exception 'A tip was already added to this job'; end if;
    if v_tip.amount_cents = p_amount_cents then return v_tip; end if;
    if v_tip.provider_ref is null then
      update public.payments
         set amount_cents = p_amount_cents, customer_fee_cents = v_cfee, tax_cents = v_tax,
             customer_fee_bps = v_fee.tip_customer_bps,
             funding_due_at = now() + interval '24 hours', updated_at = now()
       where id = v_tip.id returning * into v_tip;
      return v_tip;
    end if;
    update public.payments
       set status = 'voided', last_error = 'tip amount changed before funding', updated_at = now()
     where id = v_tip.id;
  end if;

  insert into public.payments (job_id, offer_id, payer_id, payee_id, kind, amount_cents,
                               platform_fee_cents, customer_fee_cents, customer_fee_bps, tax_cents,
                               provider, status, funding_due_at)
  values (v_job.id, v_job.accepted_offer_id, v_actor, v_job.assigned_worker_id, 'tip', p_amount_cents,
          0, v_cfee, v_fee.tip_customer_bps, v_tax,
          'stripe', 'unfunded', now() + interval '24 hours')
  returning * into v_tip;
  return v_tip;
end $$;
revoke all on function public.begin_tip_payment(uuid, integer) from public, anon;
grant execute on function public.begin_tip_payment(uuid, integer) to authenticated;
comment on function public.begin_tip_payment(uuid, integer) is
  'The customer starts a stripe tip on a completed job whose payment released: row born unfunded, customer fee only (platform_fee_cents = 0), capped by the tip trigger, released on payment_intent.succeeded.';

-- ---------------------------------------------------------------------------
-- 17. THE HELD GATE (D8). transition_job_status gains exactly one guard —
--     before assigned -> in_progress, refuse unless the job's active
--     job_payment row is held. Nothing else in the body changes. No
--     completion-photo guard and no job_completions table (they ride R6 with
--     the client change).
-- ---------------------------------------------------------------------------
create or replace function public.transition_job_status(p_job_id uuid, p_status text, p_completion_photos jsonb default null, p_completion_videos jsonb default null)
returns public.jobs
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_photos jsonb := coalesce(p_completion_photos, '[]'::jsonb);
  v_videos jsonb := coalesce(p_completion_videos, '[]'::jsonb);
begin
  select * into v_job
  from public.jobs
  where id = p_job_id
  for update;

  -- phase73: NULL-safe comparison. On an unassigned job the column is NULL, and
  -- the previous inequality test yielded NULL rather than TRUE, so the guard
  -- never fired and the caller received the row.
  if not found or v_user is null or v_job.assigned_worker_id is distinct from v_user then
    raise exception 'Job not found or not assigned to caller';
  end if;
  if not public.is_profile_active(v_user) then
    raise exception 'Active authentication required';
  end if;

  -- phase58: a retry of a transition that already landed returns the row
  -- (the sibling-RPC idempotency pattern). The retry's media is ignored -
  -- the first call's payload already landed.
  if v_job.status::text = p_status then
    return v_job;
  end if;

  if not (
    (v_job.status = 'assigned' and p_status = 'in_progress')
    or (v_job.status = 'in_progress' and p_status = 'completed')
  ) then
    raise exception 'Invalid job status transition';
  end if;
  -- R4 (D8): the held gate. Work starts only on a payment held in protection.
  if v_job.status = 'assigned' and p_status = 'in_progress' then
    if not exists (
      select 1 from public.payments p
      where p.job_id = p_job_id and p.kind = 'job_payment'
        and p.status not in ('failed', 'voided')
        and p.status = 'held'
    ) then
      raise exception 'The customer hasn''t protected the payment yet. You''ll get a notification the moment it''s held.';
    end if;
  end if;
  if jsonb_typeof(v_photos) <> 'array' or jsonb_array_length(v_photos) > 5 then
    raise exception 'Completion photos must be an array with at most 5 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_photos) as photo(value)
    where jsonb_typeof(photo.value) <> 'string'
      or length(photo.value #>> '{}') > 2048
  ) then
    raise exception 'Each completion photo must be a valid URL or storage reference';
  end if;
  if jsonb_typeof(v_videos) <> 'array' or jsonb_array_length(v_videos) > 1 then
    raise exception 'Completion videos must be an array with at most 1 entry';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_videos) as video(value)
    where jsonb_typeof(video.value) <> 'string'
      or length(video.value #>> '{}') > 2048
  ) then
    raise exception 'Each completion video must be a valid URL or storage reference';
  end if;

  update public.jobs
  set
    status = p_status::public.job_status,
    completion_photos = case
      when p_status = 'completed' and p_completion_photos is not null then v_photos
      else completion_photos
    end,
    completion_photo_url = case
      when p_status = 'completed' and jsonb_array_length(v_photos) > 0
        then v_photos->>0
      else completion_photo_url
    end,
    completion_videos = case
      when p_status = 'completed' and p_completion_videos is not null then v_videos
      else completion_videos
    end,
    completed_at = case
      when p_status = 'completed' then coalesce(completed_at, now())
      else completed_at
    end
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;
-- create or replace preserves the live ACL (authenticated may execute).

-- ---------------------------------------------------------------------------
-- 18. TWO CLOCKS (D13). job_payment_state() keeps its on-read 72h
--     auto-release — it is the sandbox's only auto-release — restricted to
--     provider = 'sandbox'. A stripe row is read-only here; its clock is
--     auto_release_due_payments() (section 13).
-- DIVERGENCE: §5.2 removed this branch outright.
-- ---------------------------------------------------------------------------
create or replace function public.job_payment_state(p_job_id uuid) returns public.payments
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_payment public.payments;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  select * into v_job from public.jobs where id = p_job_id;
  if not found or (v_job.client_id <> v_actor
                   and v_job.assigned_worker_id is distinct from v_actor) then
    raise exception 'Job not found';
  end if;

  select * into v_payment
  from public.payments
  where job_id = p_job_id and kind = 'job_payment'
    and status not in ('failed', 'voided')
  for update;
  if not found then
    return null;
  end if;

  -- The sandbox clock (D13). stripe rows never move here.
  if v_payment.provider = 'sandbox'
     and v_payment.status = 'held'
     and v_job.status = 'completed'
     and v_job.completed_at is not null
     and now() >= v_job.completed_at + interval '72 hours'
     and not exists (
       select 1 from public.job_disputes d
       where d.job_id = p_job_id and d.status = 'open'
     ) then
    update public.payments
       set status = 'released',
           released_at = now(),
           release_reason = 'auto_approved',
           updated_at = now()
     where id = v_payment.id
    returning * into v_payment;
  end if;

  return v_payment;
end;
$$;
comment on function public.job_payment_state(uuid) is
  'The job''s active job_payment row for its two parties. For provider = sandbox it runs the 72h on-read auto-release on the way (release_reason auto_approved); a stripe row is read-only here — its clock is auto_release_due_payments(). NULL when checkout never ran.';

-- ---------------------------------------------------------------------------
-- 19. cancel_job(): THE EXIT (D5/D6). A cancelled job is terminal and never
--     reopens. ban_user() and delete_my_account() keep their direct writes.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_job(p_job_id uuid, p_reason text) returns public.jobs
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor       uuid := auth.uid();
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
begin
  if v_actor is null or not public.is_active_user() then raise exception 'Active authentication required'; end if;
  if p_reason is null or p_reason not in ('customer_cancelled', 'worker_cancelled', 'customer_no_show') then
    raise exception 'Unknown cancellation reason';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then raise exception 'Job not found'; end if;
  v_is_customer := (v_job.client_id = v_actor);
  v_is_worker   := (v_job.assigned_worker_id is not null and v_job.assigned_worker_id = v_actor);
  if not v_is_customer and not v_is_worker then raise exception 'Job not found'; end if;

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

  -- Same lock order as the sandbox RPCs: the job row first, then the payment.
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
    v_window_end := (v_job.scheduled_date::timestamp + make_interval(hours => coalesce(v_job.arrival_end_hour, 24)::int))
                    at time zone 'America/New_York';
    if v_now <= v_window_end then raise exception 'A no-show can be reported once the arrival window has passed'; end if;
  end if;

  if v_payment.id is null then
    null;   -- no money: nothing to void, nothing to refund, nothing for R5
  elsif v_payment.status in ('unfunded', 'authorized') then
    -- Nothing was ever captured ('authorized' occurs only on the sandbox path).
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
      -- when more than 24h before the anchor, or within 15 minutes of
      -- acceptance (snapshot only), or when there is no scheduled_date.
      select * into v_terms from public.job_terms(p_job_id, v_payment.amount_cents);
      if v_job.status = 'in_progress' then
        v_free := false;
      elsif v_job.scheduled_date is null then
        v_free := true;
      elsif v_terms.accepted_at is not null and v_now - v_terms.accepted_at <= interval '15 minutes' then
        v_free := true;
      else
        v_anchor := (v_job.scheduled_date::timestamp + make_interval(hours => coalesce(v_job.arrival_start_hour, 0)::int))
                    at time zone 'America/New_York';
        v_free := v_now < v_anchor - interval '24 hours';
      end if;

      if v_free then
        update public.payments
           set refund_cents = v_charge, transfer_cents = 0, refund_reason = 'customer_cancelled_free',
               status = case when provider = 'sandbox' then 'refunded'::public.payment_status else status end,
               updated_at = v_now
         where id = v_payment.id;
      else
        v_fee := public.cancellation_fee_cents(p_job_id, v_payment.amount_cents);
        update public.payments
           set transfer_cents = v_fee, refund_cents = v_charge - v_fee,
               release_reason = 'cancellation_fee', release_requested_at = v_now,
               refund_reason = 'customer_cancelled_late',
               status = case when provider = 'sandbox' then 'partially_refunded'::public.payment_status else status end,
               released_at = case when provider = 'sandbox' and v_fee > 0 then v_now else released_at end,
               updated_at = v_now
         where id = v_payment.id;
      end if;

    elsif p_reason = 'worker_cancelled' then
      update public.payments
         set refund_cents = v_charge, transfer_cents = 0, refund_reason = 'worker_cancelled',
             status = case when provider = 'sandbox' then 'refunded'::public.payment_status else status end,
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
         cancel_reason = p_reason
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
          'The worker cancelled this job. Your payment is being refunded in full.',
          jsonb_build_object('screen', 'ClientJobDetail', 'jobId', p_job_id::text),
          'job_cancelled:' || p_job_id::text
        );
      end if;
    end if;
  end if;

  return v_job;
end $$;
revoke all on function public.cancel_job(uuid, text) from public, anon;
grant execute on function public.cancel_job(uuid, text) to authenticated;
comment on function public.cancel_job(uuid, text) is
  'The lifecycle exit. p_reason: customer_cancelled (the customer; free outside the window, otherwise the cancellation fee to the worker), worker_cancelled (the worker; full refund), customer_no_show (the worker, after arriving, once the window passed; a claim resolve_job_dispute decides). Terminal.';

-- ---------------------------------------------------------------------------
-- 20. notify_on_dispute(): a worker-opened row (the no-show claim) notifies
--     the CUSTOMER. The customer-opened branch is byte-for-byte unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_dispute() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_worker uuid;
  v_client uuid;
begin
  select assigned_worker_id, client_id into v_worker, v_client from public.jobs where id = new.job_id;
  if v_worker is not null and new.opened_by = v_worker then
    perform public.enqueue_notification(
      v_client,
      new.opened_by,
      'jobs',
      'dispute_opened',
      'A no-show was reported',
      'The worker reported that no one was available for this job. Brazos will review it before any fee is charged.',
      jsonb_build_object('screen', 'ClientJobDetail', 'jobId', new.job_id::text),
      'dispute_opened:' || new.id::text
    );
  elsif v_worker is not null then
    perform public.enqueue_notification(
      v_worker,
      new.opened_by,
      'jobs',
      'dispute_opened',
      'An issue was reported',
      'The customer reported an issue with the finished work — the payment holds while it''s open.',
      jsonb_build_object('screen', 'WorkerJob', 'jobId', new.job_id::text),
      'dispute_opened:' || new.id::text
    );
  end if;
  return new;
end;
$$;

-- A withdrawn no-show claim refunds the customer in full — no human needed.
create or replace function public.refund_on_no_show_withdrawn() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_job public.jobs;
  v_payment public.payments;
begin
  select * into v_job from public.jobs where id = new.job_id for update;
  if not found or v_job.status <> 'cancelled' or v_job.cancel_reason is distinct from 'customer_no_show' then
    return new;
  end if;
  select * into v_payment from public.payments
   where job_id = new.job_id and kind = 'job_payment' and status not in ('failed', 'voided') for update;
  if not found or v_payment.status <> 'held'
     or coalesce(v_payment.refund_cents, 0) > 0 or coalesce(v_payment.transfer_cents, 0) > 0 then
    return new;
  end if;
  update public.payments
     set refund_cents = v_payment.charge_amount_cents, transfer_cents = 0, refund_reason = 'no_show_withdrawn',
         status = case when provider = 'sandbox' then 'refunded'::public.payment_status else status end,
         updated_at = now()
   where id = v_payment.id;
  return new;
end $$;
revoke all on function public.refund_on_no_show_withdrawn() from public, anon, authenticated;
drop trigger if exists job_disputes_refund_on_withdrawn on public.job_disputes;
create trigger job_disputes_refund_on_withdrawn after update of status on public.job_disputes
  for each row when (new.status = 'withdrawn' and old.status = 'open')
  execute function public.refund_on_no_show_withdrawn();

-- ---------------------------------------------------------------------------
-- 21. resolve_job_dispute(): SERVICE ROLE ONLY. The urgent half — nothing
--     else can write 'resolved', so an open claim would freeze money until
--     the opener withdrew. Binary: worker or customer.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_job_dispute(p_job_id uuid, p_in_favour_of text, p_note text default null) returns public.payments
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_now        timestamptz := now();
  v_job        public.jobs;
  v_payment    public.payments;
  v_dispute    public.job_disputes;
  v_worker_won boolean;
  v_park       boolean;
  v_undirected boolean;
  v_fee        integer;
  v_charge     integer;
begin
  if p_in_favour_of is null or p_in_favour_of not in ('worker', 'customer') then
    raise exception 'Resolve in favour of the worker or the customer';
  end if;
  v_worker_won := (p_in_favour_of = 'worker');

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then raise exception 'Job not found'; end if;
  select * into v_payment from public.payments
   where job_id = p_job_id and kind = 'job_payment' and status not in ('failed', 'voided') for update;
  select * into v_dispute from public.job_disputes
   where job_id = p_job_id and status = 'open' for update;

  v_park := v_payment.id is not null and v_payment.transfer_reversed_at is not null;
  v_undirected := v_payment.id is not null and v_payment.status = 'held'
                  and coalesce(v_payment.refund_cents, 0) = 0 and coalesce(v_payment.transfer_cents, 0) = 0
                  and v_payment.release_requested_at is null;

  if v_dispute.id is null and not v_park and not (v_job.status = 'cancelled' and v_undirected) then
    raise exception 'This job has nothing to resolve';
  end if;

  if v_dispute.id is not null then
    update public.job_disputes
       set status = 'resolved', resolved_at = v_now, resolution_note = p_note
     where id = v_dispute.id;
  end if;

  if v_payment.id is null then
    return null;   -- a claim with no money row: closed, nothing moves
  end if;
  v_charge := v_payment.charge_amount_cents;

  if v_job.status = 'completed' then
    if v_worker_won then
      if v_payment.chargeback_at is not null then
        raise exception 'This payment is under review by the card issuer and cannot be released';
      end if;
      -- The normal release; a reversal park is cleared here and ONLY here,
      -- incrementing transfer_attempts so R5's idempotency key changes.
      update public.payments
         set release_reason = 'dispute_resolved', release_requested_at = v_now,
             transfer_cents = amount_cents - platform_fee_cents, refund_cents = 0,
             transfer_attempts = transfer_attempts + (case when v_park then 1 else 0 end),
             transfer_reversed_at = null,
             status = case when provider = 'sandbox' then 'released'::public.payment_status else status end,
             released_at = case when provider = 'sandbox' then v_now else released_at end,
             updated_at = v_now
       where id = v_payment.id returning * into v_payment;
    else
      update public.payments
         set refund_cents = v_charge, transfer_cents = 0, refund_reason = 'dispute_refund',
             status = case when provider = 'sandbox' then 'refunded'::public.payment_status else status end,
             updated_at = v_now
       where id = v_payment.id returning * into v_payment;
    end if;

  elsif v_job.status = 'cancelled' then
    if v_dispute.id is not null and v_job.cancel_reason = 'customer_no_show' then
      if v_worker_won then
        v_fee := public.cancellation_fee_cents(p_job_id, v_payment.amount_cents);
        update public.payments
           set transfer_cents = v_fee, refund_cents = v_charge - v_fee,
               release_reason = 'cancellation_fee', refund_reason = 'customer_no_show', release_requested_at = v_now,
               status = case when provider = 'sandbox' then 'partially_refunded'::public.payment_status else status end,
               released_at = case when provider = 'sandbox' and v_fee > 0 then v_now else released_at end,
               updated_at = v_now
         where id = v_payment.id returning * into v_payment;
      else
        update public.payments
           set refund_cents = v_charge, transfer_cents = 0, refund_reason = 'dispute_refund',
               status = case when provider = 'sandbox' then 'refunded'::public.payment_status else status end,
               updated_at = v_now
         where id = v_payment.id returning * into v_payment;
      end if;
    else
      -- Cancelled, payment still held, no open claim (withdrawn or never
      -- opened): the customer's favour only.
      if v_worker_won then
        raise exception 'A cancelled job with no open claim can only be resolved in the customer''s favour';
      end if;
      update public.payments
         set refund_cents = v_charge, transfer_cents = 0, refund_reason = 'dispute_refund',
             status = case when provider = 'sandbox' then 'refunded'::public.payment_status else status end,
             updated_at = v_now
       where id = v_payment.id returning * into v_payment;
    end if;

  else
    raise exception 'This job has nothing to resolve';
  end if;

  return v_payment;
end $$;
revoke all on function public.resolve_job_dispute(uuid, text, text) from public, anon, authenticated;
grant execute on function public.resolve_job_dispute(uuid, text, text) to service_role;
comment on function public.resolve_job_dispute(uuid, text, text) is
  'service_role only. Resolves the job''s open issue report (status resolved, resolved_at, resolution_note) and/or clears a transfer-reversal park, then directs the money: completed+worker = release (dispute_resolved); completed+customer = full refund; no-show+worker = the cancellation fee; no-show+customer = full refund; cancelled with no open claim = full refund, customer only. Never granted to authenticated.';

-- ---------------------------------------------------------------------------
-- 22. Schedules. cron.schedule() upserts on job name, so re-running is safe.
--     Wrapped so a local stack without pg_cron does not abort `db reset`.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regproc('cron.schedule') is null then
    raise notice 'stripe_foundation: pg_cron absent (local stack) — schedules skipped';
    return;
  end if;
  perform cron.schedule('auto-release-due-payments', '*/10 * * * *',
                        $cron$select public.auto_release_due_payments();$cron$);
  -- process-transfers and payments-sweeper are scheduled by the phase74 pattern
  -- (cron -> pg_net POST with the Vault secret), added in R5 when the functions exist.
end $$;

-- ---------------------------------------------------------------------------
-- 23. Indexes (D14). Of §5.2 section 14 only three ride this migration; the
--     rest are launch-deferred performance work with their own migration.
-- DIVERGENCE: payments_job_kind_idx is NOT created — the baseline already has
-- payments_job_idx on (job_id, kind), identical. job_disputes_job_open_idx is
-- NOT created — the unique partial index job_disputes_one_open_per_job on
-- (job_id) where status = 'open' already covers it.
-- ---------------------------------------------------------------------------
create index if not exists payments_payee_status_idx on public.payments (payee_id, status);

-- ---------------------------------------------------------------------------
-- 24. Sentinel. Created last inside the transaction, so its presence proves
--     the entire file committed (phase50's shape).
-- ---------------------------------------------------------------------------
create or replace function public.stripe_foundation_enabled() returns boolean
language sql immutable set search_path = public, pg_temp as $$ select true $$;
revoke all on function public.stripe_foundation_enabled() from public, anon;
grant execute on function public.stripe_foundation_enabled() to authenticated, service_role;
comment on function public.stripe_foundation_enabled() is
  'Marker: 20260905000000_stripe_foundation.sql has been applied. Created last inside its transaction, so its presence proves the entire file committed.';

commit;
