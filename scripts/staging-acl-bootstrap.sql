-- staging-acl-bootstrap.sql
--
-- STAGING ONLY. Never run against production — production already has these
-- grants from the platform's project defaults.
--
-- Why this exists: brazos-staging was built by loading a privilege-stripped
-- `pg_dump --schema-only` of production (prod_schema.sql contains zero GRANT
-- statements), and this project generation's default ACL for the `postgres`
-- role grants only TRUNCATE/REFERENCES/TRIGGER/MAINTAIN ("Dxtm") to the app
-- roles — not the full "arwdDxtm" production's tables received when they were
-- created under the platform's permissive defaults. Result: every table loaded
-- from the dump was missing SELECT/INSERT/UPDATE/DELETE for anon/authenticated/
-- service_role, and PostgREST answered 42501 for everything.
--
-- This script restores the PRE-hardening Supabase baseline. It must be
-- followed immediately by replaying the numbered migrations in order, so the
-- deliberate narrowings (phase29 profiles column grants, phase32 function
-- EXECUTE revocation, phase42 active_mode privacy, phase50 payments seal) and
-- every explicit `grant execute` land on top, exactly as they did in
-- production's history. Running this alone leaves staging WIDER than
-- production — do not stop halfway.
--
-- Idempotent: GRANT and ALTER DEFAULT PRIVILEGES are safe to re-run.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated;
grant all privileges on all tables in schema public to service_role;

grant usage, select on all sequences in schema public to anon, authenticated;
grant all privileges on all sequences in schema public to service_role;

-- Future objects created by the postgres role (psql-applied migrations) get
-- the same grants production's platform defaults would give them, so numbered
-- migrations behave identically on staging and production.
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;
