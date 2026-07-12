-- The "Post a Job" screen writes a `location` text field, but the live
-- public.jobs table is missing that column (it has lat/lng and budget_cents,
-- but no `location`). Run this in the Supabase SQL editor to add it.
--
-- Note: budget is stored in the existing `budget_cents` column (integer cents),
-- so no budget column is added here.

alter table public.jobs
  add column if not exists location text;
