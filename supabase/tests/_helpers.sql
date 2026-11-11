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
--   ADAPTATION 1 (D1) is gone since 20261108000000_lean_v1.sql: the
--   handle_new_user trigger on auth.users (on_auth_user_created) is now a
--   migration, so tests.create_user's auth.users insert creates the profile
--   exactly as sign-up does. 300_signup_and_push_schedule.sql proves it.
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
--   ADAPTATION 4 (B11, 20261112040000_payouts_gate.sql): sign-up makes no
--   payout account, but tests.create_user gives every account an ENABLED one
--   (a test acct_ id, then set_payouts_status 'enabled'), because a worker
--   without one can no longer bid, counter or be hired. A test about another
--   payout state says so with tests.set_payouts(user, status); 'none' removes
--   the row, the state of a fresh real account. Nothing here proves Stripe's
--   onboarding or connect-status itself.
--
-- Anything not listed above is the same object staging has.
create extension if not exists pgtap with schema extensions;

create schema if not exists tests;

-- The three identity switchers are called while the session is already
-- running as authenticated/anon (to move to the next identity, or back), so
-- those roles need to reach the schema and the functions.
grant usage on schema tests to anon, authenticated;

-- ADAPTATION 4: sets a user's payout state through the service-role functions
-- connect-onboarding and connect-status call. 'none' removes the row (no payout
-- account, as after sign-up). Runner only.
create or replace function tests.set_payouts(p_user uuid, p_status text)
returns void
language plpgsql
as $$
begin
  if p_status = 'none' then
    delete from public.payment_accounts where user_id = p_user;
    return;
  end if;
  perform public.set_payment_account(p_user, 'acct_test_' || replace(p_user::text, '-', ''));
  perform public.set_payouts_status(p_user, p_status);
end
$$;
revoke all on function tests.set_payouts(uuid, text) from public;

-- Creates an account the way sign-up leaves it: an auth.users row, whose
-- handle_new_user trigger writes the profile. Returns the new id. Plus
-- ADAPTATION 4: an enabled payout account.
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
  perform tests.set_payouts(v_id, 'enabled');
  return v_id;
end
$$;
revoke all on function tests.create_user(text, text) from public;

-- Funds an assigned job the way checkout does on the stripe path: begin_job_payment as the job's
-- customer, the intent id attached, a synthesized payment_intent.succeeded applied, so the
-- job_payment ends held. Runner only; the identity is the runner's again on return. Returns the
-- payment id. One call per job: a second one is refused, as a second checkout would be.
create or replace function tests.test_fund_job(p_job_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_pid uuid;
  v_evt text := 'evt_fund_' || replace(p_job_id::text, '-', '');
begin
  perform tests.authenticate_as((select client_id from public.jobs where id = p_job_id));
  v_pid := (public.begin_job_payment(p_job_id)).id;
  perform tests.clear_auth();
  perform public.attach_provider_ref(v_pid, 'pi_' || v_evt);
  insert into public.payment_events (id, type, payload)
  values (v_evt, 'payment_intent.succeeded', jsonb_build_object(
    'id', v_evt, 'type', 'payment_intent.succeeded',
    'data', jsonb_build_object('object', jsonb_build_object(
      'id', 'pi_' || v_evt, 'metadata', jsonb_build_object('payment_id', v_pid)))));
  perform public.apply_payment_event(v_evt);
  return v_pid;
end
$$;
revoke all on function tests.test_fund_job(uuid) from public;

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
  'create_user''s auth.users row got its profiles row from the handle_new_user trigger'
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
