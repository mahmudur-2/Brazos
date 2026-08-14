-- Brazos - Phase 69 ROLLBACK - restore the pre-phase69 execute privileges
--
-- Paste into Supabase - SQL Editor and run. Safe to re-run (idempotent).
-- One transaction. Undoes supabase/phase69_execute_privilege_lockdown.sql and
-- nothing else.
--
-- ===========================================================================
-- WHAT "PRIOR STATE" MEANS HERE, EXACTLY
-- ===========================================================================
-- Before phase69 all sixteen functions had `pg_proc.proacl IS NULL` - the
-- CREATE-time default, which for a function grants EXECUTE to PUBLIC. SQL
-- cannot set proacl back to NULL: once any grant or revoke touches an object,
-- Postgres materialises the ACL and it stays materialised. `grant execute ... to
-- public` restores the EFFECTIVE privilege exactly - PUBLIC, and therefore anon,
-- authenticated and service_role, can execute again - but the stored ACL will
-- read `{owner=X/owner,=X/owner}` rather than NULL.
--
-- That difference is visible in exactly one place, and it is harmless: after
-- this rollback, phase68 still aborts on job_request_parties_ok, but on the
-- SECOND half of its check (d) ("grants EXECUTE to PUBLIC or to anon",
-- phase68_deleted_at_authorization.sql:659-671) instead of the first ("has a
-- default ACL", :654-658). Same refusal, different sentence. phase68 cannot
-- apply until phase69 does.
--
-- Rolling this back re-opens what phase69 closed: enqueue_notification,
-- notify_display_name, notify_nearby_for_job and is_blocked_between become
-- reachable by `anon` again, which means an unauthenticated caller can write
-- rows into notification_outbox and read display names for arbitrary uuids.
-- Do not leave the database in this state.

begin;

set local search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1. The ten trigger functions
-- ---------------------------------------------------------------------------

revoke all on function public.close_requests_on_block() from anon, authenticated;
grant execute on function public.close_requests_on_block() to public;

revoke all on function public.create_default_notification_prefs() from anon, authenticated;
grant execute on function public.create_default_notification_prefs() to public;

revoke all on function public.enforce_portfolio_cap() from anon, authenticated;
grant execute on function public.enforce_portfolio_cap() to public;

revoke all on function public.handle_new_user() from anon, authenticated;
grant execute on function public.handle_new_user() to public;

revoke all on function public.notify_on_bid() from anon, authenticated;
grant execute on function public.notify_on_bid() to public;

revoke all on function public.notify_on_job_location() from anon, authenticated;
grant execute on function public.notify_on_job_location() to public;

revoke all on function public.notify_on_job_request() from anon, authenticated;
grant execute on function public.notify_on_job_request() to public;

revoke all on function public.notify_on_job_status() from anon, authenticated;
grant execute on function public.notify_on_job_status() to public;

revoke all on function public.notify_on_review() from anon, authenticated;
grant execute on function public.notify_on_review() to public;

revoke all on function public.recompute_profile_rating() from anon, authenticated;
grant execute on function public.recompute_profile_rating() to public;

-- ---------------------------------------------------------------------------
-- 2. The notification chain
-- ---------------------------------------------------------------------------

revoke all on function public.enqueue_notification(uuid, uuid, text, text, text, text, jsonb, text)
  from anon, authenticated;
grant execute on function public.enqueue_notification(uuid, uuid, text, text, text, text, jsonb, text)
  to public;

revoke all on function public.notify_display_name(uuid) from anon, authenticated;
grant execute on function public.notify_display_name(uuid) to public;

revoke all on function public.notify_nearby_for_job(uuid) from anon, authenticated;
grant execute on function public.notify_nearby_for_job(uuid) to public;

revoke all on function public.is_blocked_between(uuid, uuid) from anon, authenticated;
grant execute on function public.is_blocked_between(uuid, uuid) to public;

-- ---------------------------------------------------------------------------
-- 3. job_request_parties_ok
-- ---------------------------------------------------------------------------

revoke all on function public.job_request_parties_ok(uuid, uuid) from anon, authenticated, service_role;
grant execute on function public.job_request_parties_ok(uuid, uuid) to public;

-- ---------------------------------------------------------------------------
-- 4. job_categories_expanded
-- ---------------------------------------------------------------------------

revoke all on function public.job_categories_expanded() from anon, authenticated;
grant execute on function public.job_categories_expanded() to public;

-- ---------------------------------------------------------------------------
-- 5. Sentinel
--
-- Dropped, so scripts/verify-schema.mjs reports phase69 as not applied.
-- ---------------------------------------------------------------------------

drop function if exists public.phase69_execute_lockdown_enabled();

-- ---------------------------------------------------------------------------
-- 6. Self-check
--
-- Proves the rollback actually restored PUBLIC execute on all sixteen and
-- removed the sentinel. The five functions phase69 never touched are checked
-- too: this file must not have touched them either.
-- ---------------------------------------------------------------------------

do $$
declare
  r     record;
  v_oid oid;
  v_n   integer := 0;
begin
  for r in
    select unnest(array[
      'public.close_requests_on_block()',
      'public.create_default_notification_prefs()',
      'public.enforce_portfolio_cap()',
      'public.handle_new_user()',
      'public.notify_on_bid()',
      'public.notify_on_job_location()',
      'public.notify_on_job_request()',
      'public.notify_on_job_status()',
      'public.notify_on_review()',
      'public.recompute_profile_rating()',
      'public.enqueue_notification(uuid, uuid, text, text, text, text, jsonb, text)',
      'public.notify_display_name(uuid)',
      'public.notify_nearby_for_job(uuid)',
      'public.is_blocked_between(uuid, uuid)',
      'public.job_request_parties_ok(uuid, uuid)',
      'public.job_categories_expanded()'
    ]) as sig
  loop
    v_oid := to_regprocedure(r.sig);
    if v_oid is null then
      raise exception 'PHASE69 ROLLBACK FAIL: % does not exist.', r.sig;
    end if;
    if not has_function_privilege('anon', v_oid, 'EXECUTE') then
      raise exception
        'PHASE69 ROLLBACK FAIL: % is still not executable by anon, so the default was not restored.',
        r.sig;
    end if;
    v_n := v_n + 1;
  end loop;

  if to_regprocedure('public.phase69_execute_lockdown_enabled()') is not null then
    raise exception 'PHASE69 ROLLBACK FAIL: the sentinel function still exists.';
  end if;

  -- The five phase69 never touched must still carry their explicit grants.
  for r in
    select unnest(array[
      'public.is_profile_active(uuid)',
      'public.match_workers_semantic(double precision[], text[], integer, double precision)',
      'public.should_notify(uuid, uuid, text)',
      'public.transition_job_status(uuid, text, jsonb, jsonb)',
      'public.worker_semantic_refresh_queue(integer)'
    ]) as sig
  loop
    v_oid := to_regprocedure(r.sig);
    if v_oid is null then
      raise exception 'PHASE69 ROLLBACK FAIL: % does not exist.', r.sig;
    end if;
    if (select p.proacl from pg_proc p where p.oid = v_oid) is null then
      raise exception
        'PHASE69 ROLLBACK FAIL: % lost its explicit ACL. This file must not touch it.',
        r.sig;
    end if;
  end loop;

  raise notice 'PHASE69 ROLLBACK COMPLETE: % functions returned to PUBLIC execute', v_n;
  raise notice 'PHASE69 ROLLBACK WARNING: the unauthenticated notification chain is open again';
end $$;

notify pgrst, 'reload schema';

commit;
