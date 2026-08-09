-- ============================================================================
-- BRAZOS V2 · Phase 11 · simulated cash-out (released -> paid_out)
--
-- Safe to re-run (idempotent). Apply with psql; verify with
-- `node scripts/verify-schema.mjs`.
--
-- The wallet's three buckets are DERIVED from payments rows (§G: never a
-- hand-kept balance): pending = held, available = released, transferred =
-- paid_out. This file adds the one missing motion — the payee sweeping their
-- released rows to paid_out — and the timestamp that records it. SANDBOX:
-- no bank, no transfer, no provider; the labels say "simulated" on screen.
-- ============================================================================

begin;

alter table public.payments
  add column if not exists paid_out_at timestamptz;

comment on column public.payments.paid_out_at is
  'When the payee''s simulated cash-out swept this row released -> paid_out (phase55). Sandbox only — no real transfer exists.';

-- The payee sweeps every released row they are owed. Affecting zero rows is
-- a fine, honest answer (nothing to cash out) — an empty set, never an
-- error, so a double tap is a no-op by construction.
create or replace function public.sandbox_cash_out()
returns setof public.payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  return query
  update public.payments
     set status = 'paid_out',
         paid_out_at = now(),
         updated_at = now()
   where payee_id = v_actor
     and status = 'released'
  returning *;
end;
$$;

revoke all on function public.sandbox_cash_out() from public, anon;
grant execute on function public.sandbox_cash_out() to authenticated;

comment on function public.sandbox_cash_out() is
  'SANDBOX ONLY — no real money. Sweeps the caller''s released rows (job payments and tips) to paid_out, stamping paid_out_at. Zero released rows returns an empty set; repeat calls are no-ops.';

create or replace function public.sandbox_cash_out_enabled()
returns boolean
language sql
immutable
as $$
  select true;
$$;

revoke all on function public.sandbox_cash_out_enabled() from public, anon;
grant execute on function public.sandbox_cash_out_enabled() to authenticated;

notify pgrst, 'reload schema';

commit;
