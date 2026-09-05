-- ============================================================================
-- Brazos · phase42 — profiles.active_mode (the persisted Customer/Worker mode)
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- WHY
--   BRAZOS_MASTER_PLAN.md §A/§F: "profiles.active_mode persists the user's last
--   mode. A root-level ModeProvider holds the current mode; the root navigator
--   mounts exactly one of two navigator trees." Until now there was no such
--   column anywhere — mode was a device-local navigation illusion (a pushed
--   route on the shared Home stack), so signing in on a second device, or
--   reinstalling, always dropped the user back into Customer Mode.
--
-- WHAT THIS ADDS
--   1. profiles.active_mode  — text, NOT NULL, default 'customer', constrained
--      to exactly {'customer','worker'} so an invalid mode cannot be stored.
--   2. get_my_active_mode()  — the caller's own mode, or 'customer' when the
--      row is missing. security definer, so it works despite phase29 having
--      revoked every direct grant on public.profiles.
--   3. set_active_mode(text) — the ONLY write path. Validates the value server
--      side; the check constraint is the second line of defence.
--
-- PRIVACY
--   active_mode is deliberately NOT added to phase29's public column grant on
--   public.profiles. Which mode someone is currently in is nobody else's
--   business, and nothing in the app needs to read another account's mode. The
--   two functions above are the only client-reachable paths, and both are
--   scoped to auth.uid() with no user parameter to point elsewhere.
--
-- PHASE32 LESSON
--   phase32 revoked default EXECUTE on new functions, so a function shipped
--   without an explicit grant is unreachable from the app. Both functions below
--   carry `grant execute ... to authenticated` immediately after their
--   definition. Do not remove those lines.
--
-- VERIFICATION
--   `node scripts/verify-schema.mjs` covers this file. get_my_active_mode() is
--   `language sql` and references profiles.active_mode directly, so Postgres
--   validates the column exists at CREATE time — the function existing is
--   itself proof the column landed. A SQL Editor "Success" message is not.
-- ============================================================================

-- 1. The column -------------------------------------------------------------

alter table public.profiles
  add column if not exists active_mode text not null default 'customer';

-- Guarded rather than `add constraint if not exists` (which Postgres has no
-- syntax for), so re-running this file is a no-op instead of an error.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_active_mode_check'
  ) then
    -- Any row that somehow predates the default is normalised first, so the
    -- constraint cannot fail to validate on an existing table.
    update public.profiles
       set active_mode = 'customer'
     where active_mode is null
        or active_mode not in ('customer', 'worker');

    alter table public.profiles
      add constraint profiles_active_mode_check
      check (active_mode in ('customer', 'worker'));
  end if;
end
$$;

-- 2. Read -------------------------------------------------------------------

create or replace function public.get_my_active_mode()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.active_mode from public.profiles p where p.id = auth.uid()),
    'customer'
  );
$$;

revoke all on function public.get_my_active_mode() from public;
grant execute on function public.get_my_active_mode() to authenticated;

-- 3. Write ------------------------------------------------------------------

create or replace function public.set_active_mode(p_mode text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  -- Rejected here as well as by the check constraint: the client should get a
  -- clear error, not a constraint violation, and a future column change must
  -- not silently widen what this accepts.
  if p_mode is null or p_mode not in ('customer', 'worker') then
    raise exception 'Unsupported mode: %', coalesce(p_mode, '(null)');
  end if;

  update public.profiles
     set active_mode = p_mode
   where id = v_user;

  return p_mode;
end;
$$;

revoke all on function public.set_active_mode(text) from public;
grant execute on function public.set_active_mode(text) to authenticated;
