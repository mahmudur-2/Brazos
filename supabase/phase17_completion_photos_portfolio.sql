-- ============================================================================
-- Brazos · Completion photos + worker portfolio ("Past Work")
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- Contents
--   1. jobs.completion_photos jsonb  (mirrors jobs.photos)
--   2. portfolio_items table + RLS + a 20-item cap trigger
--   3. worker_job_stats() — completed-jobs-by-category, publicly readable
--
-- ---------------------------------------------------------------------------
-- WHY portfolio_items STORES THE PHOTO URL RATHER THAN A POINTER
-- ---------------------------------------------------------------------------
-- completion_photos is a jsonb ARRAY, so the "obvious" reference would be
-- (source_job_id, array index). Two things rule that out:
--
--   1. Correctness. An index into a mutable array is a silent-corruption
--      hazard — if the worker later removes or reorders a completion photo,
--      every portfolio entry pointing past that index now shows a DIFFERENT
--      photo than the one curated, with no error anywhere.
--
--   2. It cannot satisfy the "publicly viewable" requirement at all. `jobs`
--      RLS only exposes a row to the client, the assigned worker, or anyone
--      when status = 'open' (phase1 + phase13). A stranger viewing a worker's
--      profile is none of those for a COMPLETED job, so a pointer-based
--      design would leave them unable to resolve the photo — the gallery
--      would render empty for exactly the audience it exists for.
--
-- So photo_url (and category, for the same visibility reason) is denormalized
-- onto the portfolio row, with source_job_id kept alongside purely as
-- provenance — nullable and ON DELETE SET NULL, so deleting an old job blanks
-- the link without destroying the curated gallery entry.
-- ============================================================================

-- 1. Completion photos ------------------------------------------------------
-- Same shape and default as jobs.photos (phase13) so both read identically in
-- the client. The older scalar jobs.completion_photo_url is left in place and
-- still written with the first photo, so anything reading it keeps working.
alter table public.jobs
  add column if not exists completion_photos jsonb not null default '[]'::jsonb;

-- 2. Portfolio --------------------------------------------------------------
-- `category` is text + CHECK rather than the job_category enum: the values
-- must match jobs.category, but a copied text value can't be broken by a
-- future enum alteration, and it keeps this migration independent of the
-- enum's exact schema-qualified name.
create table if not exists public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id) on delete cascade,
  -- Provenance only; the gallery never needs to read the job to render.
  source_job_id uuid references public.jobs(id) on delete set null,
  photo_url text not null,
  category text not null,
  caption text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  -- The same photo can't be featured twice by the same worker.
  constraint portfolio_items_unique_photo unique (worker_id, photo_url),
  constraint portfolio_items_category_valid check (
    category in (
      'dog_walking', 'cleaning', 'moving', 'yard_work',
      'handyman', 'errands', 'other'
    )
  ),
  constraint portfolio_items_caption_len check (
    caption is null or length(caption) <= 140
  )
);

create index if not exists portfolio_items_worker_idx
  on public.portfolio_items (worker_id, display_order, created_at);

alter table public.portfolio_items enable row level security;

-- SELECT: the whole point of a portfolio — any signed-in user can view any
-- worker's gallery. Nothing here is private: the worker explicitly curated
-- each entry, and is warned in-app before adding one.
drop policy if exists "portfolio_select_all" on public.portfolio_items;
create policy "portfolio_select_all"
  on public.portfolio_items for select
  to authenticated
  using (true);

-- INSERT: a worker may only feature their OWN photos, and (when provenance is
-- recorded) only from a job they were actually assigned to — so one worker
-- can't pass off another's completion photo as their own work.
drop policy if exists "portfolio_insert_own" on public.portfolio_items;
create policy "portfolio_insert_own"
  on public.portfolio_items for insert
  to authenticated
  with check (
    worker_id = auth.uid()
    and (
      source_job_id is null
      or exists (
        select 1 from public.jobs j
        where j.id = source_job_id
          and j.assigned_worker_id = auth.uid()
      )
    )
  );

drop policy if exists "portfolio_update_own" on public.portfolio_items;
create policy "portfolio_update_own"
  on public.portfolio_items for update
  to authenticated
  using (worker_id = auth.uid())
  with check (worker_id = auth.uid());

drop policy if exists "portfolio_delete_own" on public.portfolio_items;
create policy "portfolio_delete_own"
  on public.portfolio_items for delete
  to authenticated
  using (worker_id = auth.uid());

-- The 20-item cap is enforced here as well as in the UI, so it holds even if
-- something writes to the table directly.
create or replace function public.enforce_portfolio_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*) from public.portfolio_items where worker_id = new.worker_id
  ) >= 20 then
    raise exception 'Portfolio is limited to 20 photos. Remove one to add another.';
  end if;
  return new;
end;
$$;

drop trigger if exists portfolio_items_cap on public.portfolio_items;
create trigger portfolio_items_cap
  before insert on public.portfolio_items
  for each row execute function public.enforce_portfolio_cap();

-- 3. Completed-jobs-by-category --------------------------------------------
-- Powers the "12 Handyman, 6 Dog walking" breakdown. SECURITY DEFINER for the
-- same reason as the URL denormalization above: a visitor cannot read another
-- user's completed `jobs` rows under RLS, so a plain count would come back
-- empty. Only aggregate counts leave this function — no job details.
create or replace function public.worker_job_stats(p_worker uuid)
returns table (category text, job_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select j.category::text, count(*)::int
  from public.jobs j
  where j.assigned_worker_id = p_worker
    and j.status = 'completed'
  group by j.category
  order by count(*) desc, j.category::text asc;
$$;

comment on function public.worker_job_stats(uuid) is
  'Completed job counts per category for one worker. Aggregate only — exposes no job rows.';

revoke all on function public.worker_job_stats(uuid) from public;
grant execute on function public.worker_job_stats(uuid) to authenticated;
