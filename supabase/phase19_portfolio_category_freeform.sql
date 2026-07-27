-- ============================================================================
-- Brazos · Let a portfolio item's category be free text ("Other: …")
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- THE PROBLEM
--   Featuring a photo now requires the worker to pick a category, with an
--   "Other" option to type a custom one (e.g. "Pressure washing"). But
--   portfolio_items_category_valid (phase17) restricts `category` to the
--   exact 7 job_category enum strings — a custom value would be rejected by
--   the CHECK constraint at insert time.
--
-- THE FIX
--   Replace the enum-matching CHECK with a simple non-empty check.
--   `portfolio_items.category` was already plain `text`, not the enum type
--   itself (phase17's own comment explains why: a copied text value
--   shouldn't be coupled to a future change in the job_category enum) — so
--   this only loosens a CHECK constraint, no column type change. Known
--   category keys ('handyman', 'dog_walking', …) still display through
--   JOB_CATEGORY_LABELS in the app; anything else displays as the worker
--   typed it, which is exactly what a custom "Other" entry should do.
-- ============================================================================

alter table public.portfolio_items
  drop constraint if exists portfolio_items_category_valid;

alter table public.portfolio_items
  add constraint portfolio_items_category_not_blank
  check (length(btrim(category)) > 0);

-- A constraint swap has no shape a PostgREST schema probe can see (no new
-- column/table/RPC), so scripts/verify-schema.mjs has nothing to check for
-- phase19 without this. A trivial marker function makes it independently
-- confirmable the same way every other phase already is.
create or replace function public.portfolio_category_freeform_enabled()
returns boolean
language sql
immutable
as $$
  select true;
$$;

revoke all on function public.portfolio_category_freeform_enabled() from public;
grant execute on function public.portfolio_category_freeform_enabled() to authenticated;

