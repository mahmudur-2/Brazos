-- Brazos - Phase 70 ROLLBACK - restore the pre-phase70 unsend_message
--
-- Paste into Supabase - SQL Editor and run. Safe to re-run (idempotent).
-- One transaction. Undoes supabase/phase70_unsend_message_authz.sql and
-- nothing else.
--
-- ===========================================================================
-- WHAT "PRIOR STATE" MEANS HERE, EXACTLY
-- ===========================================================================
-- The body below is the authoritative pre-phase70 definition, captured LIVE
-- from staging (zzkumxcjtbqoselzptig) on 2026-08-15. It is deliberately NOT
-- reconstructed by deleting the guard from the phase70 body, and NOT taken
-- from supabase/phase25_unsend_messages.sql: the live body already carries
-- phase64's search_path pin (`'public', 'pg_temp'`), which phase25 predates -
-- phase25:22 pins `public` alone, so deriving this file from phase25 would
-- silently drop the pin phase64 added.
--
-- The pre-phase70 ACL was
--   =X/postgres | postgres=X/postgres | authenticated=X/postgres
-- i.e. EXECUTE for PUBLIC (the CREATE-time default, materialised when
-- phase25:54 granted authenticated without revoking it) plus the explicit
-- authenticated grant. `grant ... to public; grant ... to authenticated;`
-- restores exactly that effective privilege set.
--
-- Rolling this back RE-OPENS Finding A: the `<>` guard is inert when
-- auth.uid() is NULL, so an unauthenticated caller holding a message UUID
-- can blank any message under 15 minutes old. Do not leave the database in
-- this state.

begin;

set local search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1. The pre-phase70 body, live-captured, verbatim
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
-- 2. The pre-phase70 ACL
--
-- `create or replace` preserved the phase70 ACL (postgres + authenticated),
-- so PUBLIC is restored explicitly. The authenticated grant is re-stated for
-- idempotence; both statements are no-ops on a second run.
-- ---------------------------------------------------------------------------

grant execute on function public.unsend_message(uuid) to public;
grant execute on function public.unsend_message(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Sentinel dropped, so scripts/verify-schema.mjs reports phase70 as not
--    applied and its checkRpcDenied probe goes back to PENDING.
-- ---------------------------------------------------------------------------

drop function if exists public.phase70_unsend_message_authz_enabled();

-- ---------------------------------------------------------------------------
-- 4. Self-check
-- ---------------------------------------------------------------------------

do $$
begin
  if not has_function_privilege('anon', 'public.unsend_message(uuid)'::regprocedure, 'execute') then
    raise exception
      'PHASE70 ROLLBACK FAIL: anon still cannot execute unsend_message(uuid), so the PUBLIC grant was not restored.';
  end if;

  if not has_function_privilege('authenticated', 'public.unsend_message(uuid)'::regprocedure, 'execute') then
    raise exception
      'PHASE70 ROLLBACK FAIL: authenticated cannot execute unsend_message(uuid).';
  end if;

  if position('Authentication required'
              in pg_get_functiondef('public.unsend_message(uuid)'::regprocedure)) > 0 then
    raise exception
      'PHASE70 ROLLBACK FAIL: the null-uid guard is still in the live body, so the pre-phase70 body was not restored.';
  end if;

  if to_regprocedure('public.phase70_unsend_message_authz_enabled()') is not null then
    raise exception 'PHASE70 ROLLBACK FAIL: the sentinel function still exists.';
  end if;

  raise notice 'PHASE70 ROLLBACK COMPLETE: pre-phase70 body and ACL restored';
  raise notice 'PHASE70 ROLLBACK WARNING: unsend_message is executable by anon again, and its ownership guard is inert for a null auth.uid()';
end $$;

notify pgrst, 'reload schema';

commit;
