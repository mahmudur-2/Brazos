-- ============================================================================
-- Brazos · Two-way users + editable profiles
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- Adds:
--   1. profile columns: bio, language, categories (phone/avatar_url already exist)
--   2. role defaults to 'both' (every user is client AND worker); existing rows
--      backfilled to 'both'
--   3. signup trigger populates full_name + phone from signup metadata and sets
--      role 'both' (stops defaulting anyone to "New User")
--   4. RLS so users can read all profiles and edit their own
--   5. public `avatars` storage bucket + policies
-- ============================================================================

-- 1. New profile columns --------------------------------------------------------
alter table public.profiles
  add column if not exists bio text,
  add column if not exists language text default 'en',
  add column if not exists categories text[];

-- 2. Everyone is both a client and a worker ------------------------------------
alter table public.profiles alter column role set default 'both';
update public.profiles set role = 'both' where role is distinct from 'both';

-- 3. Signup trigger: write name/phone/role from auth metadata -------------------
-- The app passes { full_name, phone } as signUp options.data (user metadata).
-- SECURITY DEFINER so it can insert the profile row. `on conflict` makes it safe
-- alongside any pre-existing auto-create trigger.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'phone', ''),
    'both'
  )
  on conflict (id) do update set
    full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
    phone = coalesce(nullif(excluded.phone, ''), public.profiles.phone),
    role = coalesce(public.profiles.role, 'both');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- NOTE: if your project's existing auto-create trigger uses a different name and
-- still sets full_name to 'New User', drop it so this one is authoritative.

-- 4. Profiles RLS: read all, edit your own -------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

-- 5. Avatars storage bucket -----------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_read" on storage.objects;
create policy "avatars_read"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert" on storage.objects;
create policy "avatars_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars');

-- Avatar path is stable per user (userId/avatar.ext), so re-uploads need UPDATE.
drop policy if exists "avatars_update" on storage.objects;
create policy "avatars_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars')
  with check (bucket_id = 'avatars');
