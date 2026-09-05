-- BRAZOS · Phase 32 · restrict function EXECUTE privileges
--
-- Safe to run repeatedly. Privileges only: this does not modify or delete
-- user data, function bodies, ownership, SECURITY DEFINER status, RLS, or
-- any table.
--
-- WHY
-- ---
-- Production audit found `anon` holding EXECUTE on functions that were only
-- ever meant for `authenticated` (and, for the outbox drainer, only for
-- `service_role`). The earlier phases revoked from PUBLIC, e.g.
--
--     revoke all on function public.accept_bid(uuid, uuid) from public;
--
-- but PUBLIC and `anon` are different grantees. Supabase ships default
-- privileges that grant EXECUTE on new functions in schema public to anon,
-- authenticated and service_role, so each `create or replace function` here
-- re-acquired an explicit `anon` grant that a `from public` revoke never
-- touched. Confirmed state before this migration: public_execute = false but
-- anon_execute = true on all five.
--
-- Section 2 closes the source of that drift so future functions do not
-- silently repeat it.
--
-- NOT IN SCOPE: public.claim_notification_batch(integer) is declared
-- `set search_path = public` without a trailing pg_temp, unlike the other
-- four. Deliberately left alone here — privileges only.

begin;

-- ---------------------------------------------------------------------------
-- 1. Per-function privileges.
--
-- Full signatures are spelled out so an overload can never be caught by
-- accident. Each function is stripped back to nothing and then granted only
-- the roles it needs, so the end state does not depend on what it had before.
-- ---------------------------------------------------------------------------

-- Policy/RLS helper. Called by other SECURITY DEFINER functions and by
-- policy predicates; service_role retains access for administrative use.
revoke execute on function public.is_active_user()
  from public, anon, authenticated, service_role;
grant execute on function public.is_active_user()
  to authenticated, service_role;

revoke execute on function public.create_review(uuid, uuid, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_review(uuid, uuid, integer, text)
  to authenticated, service_role;

revoke execute on function public.accept_bid(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.accept_bid(uuid, uuid)
  to authenticated, service_role;

revoke execute on function public.transition_job_status(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.transition_job_status(uuid, text, jsonb)
  to authenticated, service_role;

-- Outbox drainer: service_role ONLY. Called by the send-push Edge Function
-- with the service key. It increments notification_outbox.attempts, so an
-- ordinary caller reaching it can silently exhaust a notification's retries.
revoke execute on function public.claim_notification_batch(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_notification_batch(integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. Default privileges for functions created by `postgres` in schema public.
--
-- Removes the automatic EXECUTE grant that produced the drift above. From
-- here on a new function is unreachable until a migration grants it
-- explicitly, which is the intended direction: deny by default.
--
-- Scope limits worth knowing: this applies only to functions created FROM NOW
-- ON, only when created by role `postgres`, and only in schema public. It
-- does not retroactively alter existing functions (section 1 does that), and
-- it does not cover functions created by another role.
-- ---------------------------------------------------------------------------

alter default privileges for role postgres in schema public
  revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from service_role;

-- Refresh PostgREST's view of the schema so the RPC surface reflects the new
-- privileges immediately rather than at the next cache refresh.
notify pgrst, 'reload schema';

commit;
