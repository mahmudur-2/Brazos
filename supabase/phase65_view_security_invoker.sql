-- ============================================================================
-- BRAZOS · phase65 · security_invoker on the one view that lacked it
--
-- STAGING deliverable — hand-apply with psql against STAGING only:
--   psql -v ON_ERROR_STOP=1 -f supabase/phase65_view_security_invoker.sql -d "$SUPABASE_DB_URL_STAGING"
-- Runs as ONE transaction. Safe to re-run.
--
-- CONTEXT
--   A view runs with its OWNER's privileges unless it carries
--   security_invoker = on, which is the classic way RLS gets bypassed
--   silently. There are exactly two views in public:
--
--     public.conversations           security_invoker = true   (already)
--     public.v_bids_projection_drift no reloptions             (this file)
--
--   public.conversations — the one the client actually selects from
--   (lib/conversations.ts:68-72) — ALREADY had security_invoker = true before
--   this run, set at phase36:611-612 and pinned by
--   tests/hardening.test.mjs:397. It is deliberately NOT touched here: adding
--   or dropping the option on it would change who can read what.
--
-- WHY THIS ONE IS LOW RISK
--   v_bids_projection_drift is an ops artifact (the phase48 bid-drift check).
--   Its grants are postgres and service_role ONLY — neither anon nor
--   authenticated holds any privilege on it, and no client code references it.
--   Both grantees hold BYPASSRLS, so switching to invoker rights cannot hide a
--   row from either of them.
--
--   The usual precondition for this change — "confirm a normal authenticated
--   user can still see their own rows through the view" — is vacuous here,
--   because no normal user can see the view at all. It is applied purely as
--   defence in depth, so that a future `grant select … to authenticated` does
--   not silently inherit owner privileges and turn an ops view into a
--   full-table read.
--
--   ALTER VIEW … SET is used rather than recreating the view, so the
--   definition and its ACL are untouched.
-- ============================================================================

begin;

do $$
begin
  if to_regclass('public.v_bids_projection_drift') is null then
    raise exception 'phase48_bids_drift_view_rewrite.sql has not been applied — v_bids_projection_drift is missing.';
  end if;
end $$;

alter view public.v_bids_projection_drift set (security_invoker = true);

-- Post-condition: both views must now be invoker-rights, and conversations
-- must still be, exactly as it was found.
do $$
declare v_left text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into v_left
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and coalesce(array_to_string(c.reloptions, ','), '') not like '%security_invoker=true%';
  if v_left is not null then
    raise exception 'Views still running with owner rights: %', v_left;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
