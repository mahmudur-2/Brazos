-- ============================================================
-- SUPERSEDED 2026-08-18 — DO NOT APPLY. Covers phases 51-58 only;
-- phases 59-75 are absent. The production path is a rebuild from a
-- staging schema dump (standing decision, BRAZOS_MASTER_PLAN.md).
-- Kept for history only.
-- ============================================================

-- PROD_VERIFY.sql — READ-ONLY sentinel check for the phase51-58 apply.
-- One row per sentinel that scripts/verify-schema.mjs asserts.
-- PASS requires BOTH: the zero-argument function exists in schema public,
-- AND role `authenticated` holds EXECUTE on it (phase32 revoked default
-- EXECUTE, so existence without the grant is unreachable from the app —
-- that is a FAIL, matching what verify-schema's PostgREST probe proves).
-- Reads pg_catalog only; modifies nothing.

select
  s.phase,
  s.sentinel as name,
  case
    when p.oid is null then 'FAIL'
    when not has_function_privilege('authenticated', p.oid, 'EXECUTE') then 'FAIL'
    else 'PASS'
  end as result,
  case
    when p.oid is null then 'function missing'
    when not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      then 'exists but authenticated lacks EXECUTE'
    else ''
  end as detail
from (values
    ('phase51', 'active_work_lifecycle_enabled'),
    ('phase52', 'offer_scoped_chat_enabled'),
    ('phase53', 'worker_self_service_enabled'),
    ('phase54', 'review_integrity_enabled'),
    ('phase55', 'sandbox_cash_out_enabled'),
    ('phase56', 'notification_feed_enabled'),
    ('phase57', 'direct_thread_notifications_enabled'),
    ('phase58', 'hardening_fixes_enabled')
  ) as s(phase, sentinel)
left join pg_catalog.pg_proc p
  on p.proname = s.sentinel
  and p.pronargs = 0
  and p.pronamespace = 'public'::regnamespace
order by s.phase;
