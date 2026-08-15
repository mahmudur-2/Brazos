-- Brazos - Phase 70 - unsend_message: null-uid guard + execute lockdown
--
-- Paste into Supabase - SQL Editor and run. Safe to re-run (idempotent), and
-- safe to re-run after a failed run: everything is one transaction, so a failed
-- run leaves nothing behind.
--
-- ===========================================================================
-- WHY THIS FILE EXISTS
-- ===========================================================================
-- Live staging (read 2026-08-15) shows unsend_message(uuid) is one of exactly
-- two functions in schema public callable by `anon` - and unlike
-- job_categories_expanded() it is SECURITY DEFINER and it WRITES. Its
-- authorization guard is
--
--   if v_sender_id <> auth.uid() then
--     raise exception 'You can only unsend your own messages';
--   end if;
--
-- For an unauthenticated caller auth.uid() is NULL, and `x <> NULL` yields
-- NULL, not true, so the branch never fires and execution reaches the UPDATE.
-- A signed-out caller holding a message UUID can blank any message under 15
-- minutes old. Authenticated callers are unaffected - the bug is the anon
-- path only.
--
-- Two changes, both required:
--
--   1. BODY: a null-uid guard, placed FIRST so an unauthenticated caller
--      cannot use the 'Message not found' path as a message-existence oracle.
--   2. ACL: the live ACL is
--        =X/postgres | postgres=X/postgres | authenticated=X/postgres
--      and the leading `=X/` entry is PUBLIC. phase25:54 granted
--      `authenticated` without revoking the CREATE-time PUBLIC default, which
--      materialised the ACL with PUBLIC still in it. phase69 swept only NULL
--      ACLs (the pure defaults), so this shape - explicit grants stacked on
--      an unrevoked PUBLIC - is the residual pattern phase69 does not detect.
--
-- Call-site inventory: docs/audits/ANON_EXPOSURE_2026-08-15.md, Q1. The one
-- functional caller is lib/messages.ts:93 via screens/ChatScreen.tsx:773,
-- always with a signed-in JWT. No service_role caller exists, so no
-- service_role grant is emitted. The scripts/verify-schema.mjs phase25 probe
-- treats a 403 as proof of existence, so it stays green after this applies.

begin;

set local search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1. The body: identical to live except the null-uid guard, which runs FIRST
-- ---------------------------------------------------------------------------

create or replace function public.unsend_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sender_id uuid;
  v_created_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select sender_id, created_at into v_sender_id, v_created_at
  from public.messages
  where id = p_message_id;

  if v_sender_id is null then
    raise exception 'Message not found';
  end if;

  if v_sender_id <> auth.uid() then
    raise exception 'You can only unsend your own messages';
  end if;

  if now() - v_created_at > interval '15 minutes' then
    raise exception 'Unsend is only available for 15 minutes after sending';
  end if;

  update public.messages
  set content = '',
      image_url = null,
      audio_url = null,
      audio_duration_ms = null,
      unsent_at = now()
  where id = p_message_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. The ACL
--
-- `create or replace function` PRESERVES the existing ACL (the phase68/69
-- lesson), so the PUBLIC entry survives the replace above and must be revoked
-- explicitly. The Q1 call-site inventory proves `authenticated` and nothing
-- else needs EXECUTE.
-- ---------------------------------------------------------------------------

revoke all on function public.unsend_message(uuid) from public, anon;
grant execute on function public.unsend_message(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Sentinel
--
-- scripts/verify-schema.mjs probes over PostgREST with the publishable key,
-- so it cannot see a function BODY or an ACL. This marker is created in the
-- same transaction as the replace and the revoke above, so its presence is
-- the proof the file ran and the self-check passed. Same shape as the
-- phase69 sentinel (phase69_execute_privilege_lockdown.sql:242-256).
-- ---------------------------------------------------------------------------

create or replace function public.phase70_unsend_message_authz_enabled()
returns boolean
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select true;
$$;

revoke all on function public.phase70_unsend_message_authz_enabled() from public, anon;
grant execute on function public.phase70_unsend_message_authz_enabled() to authenticated;

comment on function public.phase70_unsend_message_authz_enabled() is
  'phase70 sentinel. Present only if phase70_unsend_message_authz.sql committed: unsend_message carries the null-uid guard as its first statement and is executable by authenticated only - not by PUBLIC, not by anon.';

-- ---------------------------------------------------------------------------
-- 4. Self-check
--
-- Reads system catalogs only and writes nothing. Aborts the whole
-- transaction on any failure, so the sentinel cannot exist unless every
-- assertion below passed. has_function_privilege answers the question that
-- matters - can this role execute, by any route, including inheritance from
-- PUBLIC.
-- ---------------------------------------------------------------------------

do $$
begin
  -- (a) anon must NOT hold EXECUTE, by any route.
  if has_function_privilege('anon', 'public.unsend_message(uuid)'::regprocedure, 'execute') then
    raise exception
      'PHASE70 SELF-CHECK FAIL (a): anon can still execute unsend_message(uuid).';
  end if;

  -- (b) authenticated MUST keep EXECUTE - the positive direction, so a
  --     fumbled revoke cannot turn this lockdown into an outage for the one
  --     real caller (ChatScreen's signed-in unsend).
  if not has_function_privilege('authenticated', 'public.unsend_message(uuid)'::regprocedure, 'execute') then
    raise exception
      'PHASE70 SELF-CHECK FAIL (b): authenticated lost execute on unsend_message(uuid).';
  end if;

  -- (c) the deployed body actually carries the guard.
  if position('Authentication required'
              in pg_get_functiondef('public.unsend_message(uuid)'::regprocedure)) = 0 then
    raise exception
      'PHASE70 SELF-CHECK FAIL (c): the live unsend_message body carries no null-uid guard.';
  end if;

  -- (d) the sentinel exists.
  if to_regprocedure('public.phase70_unsend_message_authz_enabled()') is null then
    raise exception
      'PHASE70 SELF-CHECK FAIL (d): the sentinel function is missing.';
  end if;

  raise notice 'PHASE70 SELF-CHECK PASS: unsend_message locked to authenticated, null-uid guard live';
end $$;

notify pgrst, 'reload schema';

commit;
