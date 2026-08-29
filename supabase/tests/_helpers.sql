-- _helpers.sql — test-only helpers for every pgTAP file in this directory.
--
-- HOW IT IS LOADED. pg_prove runs the files of this directory in byte order,
-- and '_' sorts AFTER every digit, so this file would run LAST — after the
-- numbered files that need it. Each numbered file therefore includes it
-- itself:
--
--     \set tests_included 1
--     \ir _helpers.sql
--
-- The definitions below are idempotent (create or replace) and run outside
-- any transaction, so they also persist in the local database until the next
-- reset. When pg_prove runs THIS file on its own, tests_included is not set
-- and the smoke test at the bottom runs; when a numbered file includes it,
-- the smoke test is skipped so the including file's TAP plan stays its own.
--
-- THE HELPER LEDGER — what these helpers do differently from staging, and
-- what that means the tests do NOT prove:
--
--   ADAPTATION 1 (D1): tests.create_user inserts the public.profiles row
--   itself. On staging the row is created by the handle_new_user trigger on
--   auth.users; the baseline dump excludes the auth schema, so the trigger
--   does not exist on the local stack. The insert mirrors the trigger's
--   columns (id, full_name, phone, role='both') exactly, but NOTHING here
--   proves the trigger still does that on staging, or that the trigger's
--   banned_phones refusal still fires. Same adaptation R3a made in seed.sql.
--
--   ADAPTATION 2: no auth.identities row is written. GoTrue needs one to log
--   the account in; these tests never log in — identity is asserted with
--   set_config below, exactly as PostgREST asserts it — so the row would be
--   dead weight. Nothing here proves the email/password login path.
--
--   ADAPTATION 3: identity is a transaction-local role switch plus a
--   request.jwt.claims setting, the mechanism scripts/phase5-proof.sql and
--   phase6-proof.sql used on staging. It exercises RLS, grants and
--   SECURITY DEFINER bodies exactly as PostgREST does, but it does not
--   exercise PostgREST itself (schema cache, JWT verification, the
--   statement_timeout the roles migration sets at login).
--
-- Anything not listed above is the same object staging has.
create extension if not exists pgtap with schema extensions;

create schema if not exists tests;

-- The three identity switchers are called while the session is already
-- running as authenticated/anon (to move to the next identity, or back), so
-- those roles need to reach the schema and the functions.
grant usage on schema tests to anon, authenticated;

-- Creates an account the way staging would leave it after sign-up: an
-- auth.users row plus its profile (ADAPTATION 1). Returns the new id.
create or replace function tests.create_user(p_email text, p_full_name text default null)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := gen_random_uuid();
  v_name text := coalesce(p_full_name, split_part(p_email, '@', 1));
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    p_email, extensions.crypt('brazos-test-1234', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', v_name), now(), now(), '', '', '', ''
  );
  -- ADAPTATION 1 (D1): what handle_new_user writes on staging, written here.
  insert into public.profiles (id, full_name, phone, role)
  values (v_id, v_name, null, 'both');
  return v_id;
end
$$;
revoke all on function tests.create_user(text, text) from public;

-- Becomes p_user for the rest of the transaction: the same two settings
-- PostgREST applies for a bearer token. Deliberately NOT security definer —
-- Postgres refuses set_config('role', …) inside one, and none is needed:
-- SET ROLE is checked against the session user (the runner's connection),
-- which may assume authenticated whatever the current role is.
create or replace function tests.authenticate_as(p_user uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
end
$$;

-- Becomes the anonymous role: a publishable key with no session.
create or replace function tests.authenticate_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end
$$;

-- Back to the runner's own role (RLS bypassed): for fixtures and for reading
-- ground truth that no identity's policy filters.
create or replace function tests.clear_auth()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'none', true);
end
$$;

grant execute on function tests.authenticate_as(uuid) to anon, authenticated;
grant execute on function tests.authenticate_anon() to anon, authenticated;
grant execute on function tests.clear_auth() to anon, authenticated;

\if :{?tests_included}
\else
-- ---------------------------------------------------------------------------
-- The helper's own smoke test (runs only when pg_prove executes this file
-- directly): a created identity has a profile, is active, and the identity
-- switch is what the RPC layer sees.
-- ---------------------------------------------------------------------------
begin;
set local search_path = public, extensions, pg_temp;
select plan(8);

select tests.create_user('helper.smoke@brazos.test') as smoke_user \gset

select is(
  (select count(*) from public.profiles where id = :'smoke_user'),
  1::bigint,
  'create_user wrote the profiles row the staging trigger would have written'
);
select is(
  (select role::text from public.profiles where id = :'smoke_user'),
  'both',
  'the profile carries role = both, as handle_new_user sets it'
);
select ok(
  public.is_profile_active(:'smoke_user'),
  'is_profile_active() is true for a created identity'
);

select tests.authenticate_as(:'smoke_user');
select is(current_user::text, 'authenticated', 'authenticate_as switched the role to authenticated');
select is(auth.uid(), :'smoke_user'::uuid, 'auth.uid() resolves to the created identity');
select ok(public.is_active_user(), 'is_active_user() is true for the authenticated identity');

select tests.clear_auth();
select isnt(current_user::text, 'authenticated', 'clear_auth returned to the runner role');
select is(auth.uid(), null, 'clear_auth cleared the claims');

select * from finish();
rollback;
\endif
