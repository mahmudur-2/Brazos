-- ============================================================================
-- BRAZOS · phase64 · pin pg_temp in every SECURITY DEFINER search_path
--
-- STAGING deliverable — hand-apply with psql against STAGING only:
--   psql -v ON_ERROR_STOP=1 -f supabase/phase64_security_definer_search_path.sql -d "$SUPABASE_DB_URL_STAGING"
-- Runs as ONE transaction. Safe to re-run (ALTER … SET is idempotent).
--
-- THE GAP
--   Nothing in public is missing an explicit search_path — all 87 SECURITY
--   DEFINER functions have one. But 28 of them pin `search_path = public`
--   without pg_temp, and PostgreSQL searches pg_temp FIRST for relation names
--   unless pg_temp appears explicitly in the list. Those functions therefore
--   resolve unqualified table references against the CALLER's temp schema
--   before public, while running as postgres.
--
--   Any role that may create temp tables — authenticated may — could create
--   pg_temp.jobs (or pg_temp.profiles, pg_temp.notification_outbox …) and have
--   a SECURITY DEFINER function read their table instead of the real one.
--   Functions and operators are never resolved from pg_temp, so the exposure
--   is limited to unqualified RELATION references — which is most of these
--   bodies.
--
-- WHY THIS IS SAFE
--   Adding pg_temp at the END can only REMOVE the implicit pg_temp-first
--   lookup. It cannot change how any public object resolves, so a function
--   that works today under `search_path = public` works identically after.
--   It would only break a function that deliberately reads a temp relation:
--   checked before writing this file — NONE of the 28 creates or references
--   a temp relation (no `create temp`, `create temporary`, or `pg_temp.`
--   anywhere in their bodies).
--
--   ALTER FUNCTION … SET is used rather than recreating any body: no
--   definition is rewritten, no ACL is touched, no signature changes, so
--   nothing here can alter behaviour or reachability.
--
--   The remaining 59 SECURITY DEFINER functions already carry
--   `search_path = public, pg_temp` and are untouched.
-- ============================================================================

begin;

-- 1. Precondition -------------------------------------------------------------
--
-- Fail loudly rather than silently no-op onto a schema where these functions
-- do not exist.

do $$
declare v_n int;
begin
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef;
  if v_n = 0 then
    raise exception 'No SECURITY DEFINER functions found in public — wrong database?';
  end if;
end $$;

-- 2. Pin pg_temp last ---------------------------------------------------------

alter function public.accept_legal_documents(p_documents jsonb) set search_path = public, pg_temp;
alter function public.admin_open_reports() set search_path = public, pg_temp;
alter function public.ban_user(p_target uuid, p_report_id uuid) set search_path = public, pg_temp;
alter function public.claim_notification_batch(p_limit integer) set search_path = public, pg_temp;
alter function public.close_requests_on_block() set search_path = public, pg_temp;
alter function public.create_default_notification_prefs() set search_path = public, pg_temp;
alter function public.deactivate_push_token(p_token text) set search_path = public, pg_temp;
alter function public.enforce_portfolio_cap() set search_path = public, pg_temp;
alter function public.enqueue_notification(p_recipient uuid, p_actor uuid, p_category text, p_type text, p_title text, p_body text, p_data jsonb, p_dedupe_key text) set search_path = public, pg_temp;
alter function public.handle_new_user() set search_path = public, pg_temp;
alter function public.is_blocked_between(a uuid, b uuid) set search_path = public, pg_temp;
alter function public.job_hotspots() set search_path = public, pg_temp;
alter function public.job_request_parties_ok(p_a uuid, p_b uuid) set search_path = public, pg_temp;
alter function public.jobs_in_cell(p_ilat bigint, p_ilng bigint) set search_path = public, pg_temp;
alter function public.jobs_within_radius(p_lat double precision, p_lng double precision, p_radius_miles double precision) set search_path = public, pg_temp;
alter function public.notify_display_name(p_user uuid) set search_path = public, pg_temp;
alter function public.notify_nearby_for_job(p_job_id uuid) set search_path = public, pg_temp;
alter function public.notify_on_bid() set search_path = public, pg_temp;
alter function public.notify_on_job_location() set search_path = public, pg_temp;
alter function public.notify_on_job_request() set search_path = public, pg_temp;
alter function public.notify_on_job_status() set search_path = public, pg_temp;
alter function public.notify_on_review() set search_path = public, pg_temp;
alter function public.recompute_profile_rating() set search_path = public, pg_temp;
alter function public.register_push_token(p_token text, p_platform text) set search_path = public, pg_temp;
alter function public.resolve_notification(p_outbox_id uuid, p_status text, p_error text) set search_path = public, pg_temp;
alter function public.unban_user(p_target uuid) set search_path = public, pg_temp;
alter function public.unsend_message(p_message_id uuid) set search_path = public, pg_temp;
alter function public.worker_job_stats(p_worker uuid) set search_path = public, pg_temp;

-- 3. Post-condition -----------------------------------------------------------
--
-- Every SECURITY DEFINER function in public must now pin pg_temp. If any is
-- left behind (a new one landed between the audit and this apply), fail the
-- whole transaction rather than report a half-done sweep.

do $$
declare v_left text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_left
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and (p.proconfig is null or array_to_string(p.proconfig, ',') not like '%pg_temp%');
  if v_left is not null then
    raise exception 'SECURITY DEFINER functions still without pg_temp: %', v_left;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
