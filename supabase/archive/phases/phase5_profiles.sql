-- ============================================================================
-- Brazos · Prompt 5 (accept a bid) — profiles read access + reputation fields
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- The client's "Job & Bids" screen reads each bidding worker's profile
-- (name, avatar, rating, verification, completion). That needs:
--   1. a SELECT policy so authenticated users can read profiles, and
--   2. the reputation columns the spec defers to a later phase.
-- The app already works without (2) — completion % just hides and the value
-- score uses a baseline — but adding the columns makes completion % real.
-- ============================================================================

alter table public.profiles enable row level security;

-- SELECT: any signed-in user can read profiles (public marketplace profiles).
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

-- Reputation signal fields (nullable; populate as jobs complete in Phase 2).
-- completion_rate may be stored as 0-1 or 0-100; the app handles both.
alter table public.profiles
  add column if not exists completion_rate numeric,
  add column if not exists on_time_pct numeric,
  add column if not exists response_time integer;
