-- ============================================================================
-- BRAZOS V2 · Phase 9 · worker self-service: services & pricing, saved
-- workers, portfolio drafts, availability.
--
-- Safe to re-run (idempotent). Apply with psql; verify with
-- `node scripts/verify-schema.mjs`.
--
-- Four additive pieces, all backward compatible with installed builds:
--   1. worker_services — the screen-64/25 services & pricing model. The
--      portfolio_items treatment: direct RLS DML by the owner, published
--      rows readable by any signed-in user.
--   2. saved_workers — screen 46 (+ the deferred Rebook 08). Private to the
--      saver: not even the saved worker can see the row.
--   3. portfolio_items.published — drafts. Default TRUE so every existing
--      row (and every insert from an installed build) stays public exactly
--      as before; only a new build can deliberately save a draft.
--   4. profiles.accepting_work / availability_note — the screen-66
--      availability facts. Public marketplace columns (column-granted like
--      phase29's list); written ONLY through update_my_profile(), which is
--      re-created with the two keys added to its allowlist.
-- ============================================================================

begin;

-- 1. worker_services -----------------------------------------------------------

create table if not exists public.worker_services (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 80),
  description text check (description is null or length(description) <= 500),
  category text not null check (length(btrim(category)) > 0),
  /** NULL = "ask for a quote" — a real answer, not a zero. */
  price_cents integer check (price_cents is null or price_cents > 0),
  price_unit text not null default 'flat' check (price_unit in ('flat', 'hourly')),
  published boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists worker_services_worker_idx
  on public.worker_services (worker_id, position, created_at);

alter table public.worker_services enable row level security;

drop policy if exists "services_select_visible" on public.worker_services;
create policy "services_select_visible"
  on public.worker_services for select
  to authenticated
  using (published = true or worker_id = auth.uid());

drop policy if exists "services_insert_own" on public.worker_services;
create policy "services_insert_own"
  on public.worker_services for insert
  to authenticated
  with check (worker_id = auth.uid() and public.is_active_user());

drop policy if exists "services_update_own" on public.worker_services;
create policy "services_update_own"
  on public.worker_services for update
  to authenticated
  using (worker_id = auth.uid())
  with check (worker_id = auth.uid() and public.is_active_user());

drop policy if exists "services_delete_own" on public.worker_services;
create policy "services_delete_own"
  on public.worker_services for delete
  to authenticated
  using (worker_id = auth.uid());

revoke all on public.worker_services from public, anon;
grant select, insert, update, delete on public.worker_services to authenticated;

comment on table public.worker_services is
  'Screens 64/25: a worker''s advertised services with optional pricing. Owner-managed via direct RLS DML (the portfolio_items treatment); published rows are public marketplace info, drafts are owner-only. price_cents NULL means "ask" — never rendered as $0.';

-- 2. saved_workers -------------------------------------------------------------

create table if not exists public.saved_workers (
  user_id uuid not null references public.profiles(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, worker_id),
  constraint saved_workers_not_self check (user_id <> worker_id)
);

alter table public.saved_workers enable row level security;

-- Private to the saver in BOTH directions: a worker cannot enumerate who
-- saved them, and nobody can read anyone else's list.
drop policy if exists "saved_select_own" on public.saved_workers;
create policy "saved_select_own"
  on public.saved_workers for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "saved_insert_own" on public.saved_workers;
create policy "saved_insert_own"
  on public.saved_workers for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_active_user());

drop policy if exists "saved_delete_own" on public.saved_workers;
create policy "saved_delete_own"
  on public.saved_workers for delete
  to authenticated
  using (user_id = auth.uid());

revoke all on public.saved_workers from public, anon;
grant select, insert, delete on public.saved_workers to authenticated;

-- 3. portfolio drafts ----------------------------------------------------------

alter table public.portfolio_items
  add column if not exists published boolean not null default true;

-- The old select policy exposed every row to every signed-in user. Narrowed:
-- drafts are visible only to their owner. Existing rows defaulted to
-- published=true, so nothing an installed build shows today disappears.
drop policy if exists "portfolio_select_all" on public.portfolio_items;
drop policy if exists "portfolio_select_visible" on public.portfolio_items;
create policy "portfolio_select_visible"
  on public.portfolio_items for select
  to authenticated
  using (published = true or worker_id = auth.uid());

comment on column public.portfolio_items.published is
  'FALSE = a draft only its owner can see (phase53). Defaults TRUE so installed builds'' inserts keep behaving exactly as before the column existed.';

-- 4. availability on profiles --------------------------------------------------

alter table public.profiles
  add column if not exists accepting_work boolean not null default true,
  add column if not exists availability_note text
    check (availability_note is null or length(availability_note) <= 140);

-- Public marketplace facts, same column-grant mechanism as phase29's list.
grant select (accepting_work, availability_note) on public.profiles to authenticated;

comment on column public.profiles.accepting_work is
  'Screen 66: whether the worker is currently taking new work. Display truth only — nothing blocks a customer from sending an offer; the worker declines as usual.';
comment on column public.profiles.availability_note is
  'Screen 66: a short free-text availability line ("Weekday evenings, weekends"). 140 chars.';

-- update_my_profile: same signature, allowlist widened with the two new
-- keys + their validations. Body otherwise phase29's, unchanged.
create or replace function public.update_my_profile(p_patch jsonb)
returns setof public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_categories text[];
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_active_user() then
    raise exception 'Suspended accounts cannot update profiles';
  end if;
  if jsonb_typeof(coalesce(p_patch, '{}'::jsonb)) <> 'object' then
    raise exception 'Profile update must be an object';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) as k(key)
    where k.key not in (
      'full_name', 'phone', 'avatar_url', 'bio', 'language', 'categories',
      'accepting_work', 'availability_note'
    )
  ) then
    raise exception 'Profile update contains a protected or unknown field';
  end if;

  if p_patch ? 'full_name'
     and (length(btrim(coalesce(p_patch->>'full_name', ''))) < 1
          or length(btrim(p_patch->>'full_name')) > 100) then
    raise exception 'Full name must be between 1 and 100 characters';
  end if;
  if p_patch ? 'phone'
     and (length(btrim(coalesce(p_patch->>'phone', ''))) < 7
          or length(btrim(p_patch->>'phone')) > 30) then
    raise exception 'Phone number is invalid';
  end if;
  if p_patch ? 'avatar_url'
     and p_patch->>'avatar_url' is not null
     and length(p_patch->>'avatar_url') > 2048 then
    raise exception 'Avatar URL is too long';
  end if;
  if p_patch ? 'bio'
     and length(coalesce(p_patch->>'bio', '')) > 200 then
    raise exception 'Bio is too long';
  end if;
  if p_patch ? 'language'
     and p_patch->>'language' not in ('en', 'es') then
    raise exception 'Unsupported language';
  end if;
  if p_patch ? 'categories' then
    if jsonb_typeof(p_patch->'categories') <> 'array'
       or jsonb_array_length(p_patch->'categories') > 20 then
      raise exception 'Categories must be an array with at most 20 entries';
    end if;
    select coalesce(array_agg(c.value), '{}'::text[])
      into v_categories
      from jsonb_array_elements_text(p_patch->'categories') as c(value);
  end if;
  if p_patch ? 'accepting_work'
     and jsonb_typeof(p_patch->'accepting_work') <> 'boolean' then
    raise exception 'accepting_work must be true or false';
  end if;
  if p_patch ? 'availability_note'
     and length(coalesce(p_patch->>'availability_note', '')) > 140 then
    raise exception 'Availability note is limited to 140 characters';
  end if;

  update public.profiles p
  set
    full_name = case
      when p_patch ? 'full_name' then btrim(p_patch->>'full_name')
      else p.full_name
    end,
    phone = case
      when p_patch ? 'phone' then btrim(p_patch->>'phone')
      else p.phone
    end,
    avatar_url = case
      when p_patch ? 'avatar_url' then nullif(p_patch->>'avatar_url', '')
      else p.avatar_url
    end,
    bio = case
      when p_patch ? 'bio' then nullif(btrim(p_patch->>'bio'), '')
      else p.bio
    end,
    language = case
      when p_patch ? 'language' then p_patch->>'language'
      else p.language
    end,
    categories = case
      when p_patch ? 'categories' then v_categories
      else p.categories
    end,
    accepting_work = case
      when p_patch ? 'accepting_work' then (p_patch->'accepting_work')::boolean
      else p.accepting_work
    end,
    availability_note = case
      when p_patch ? 'availability_note'
        then nullif(btrim(p_patch->>'availability_note'), '')
      else p.availability_note
    end
  where p.id = v_user;

  if not found then
    raise exception 'Profile not found';
  end if;

  return query select p.* from public.profiles p where p.id = v_user;
end;
$$;

revoke all on function public.update_my_profile(jsonb) from public, anon;
grant execute on function public.update_my_profile(jsonb) to authenticated;

-- 5. verify-schema sentinel ----------------------------------------------------

create or replace function public.worker_self_service_enabled()
returns boolean
language sql
immutable
as $$
  select true;
$$;

revoke all on function public.worker_self_service_enabled() from public, anon;
grant execute on function public.worker_self_service_enabled() to authenticated;

notify pgrst, 'reload schema';

commit;
