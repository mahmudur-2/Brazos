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

-- verify-schema sentinel --------------------------------------------------------
--
-- AMENDED 2026-08-13, after the original staging apply — see the note at the
-- foot of this file.
--
-- Created last inside this file's transaction — after the post-condition
-- above — so its presence proves both the ALTER and the check that no view in
-- public was left on owner rights. Needed because ALTER VIEW … SET creates no
-- object, and v_bids_projection_drift is unreadable by the publishable key
-- both before and after this change, so no column probe can tell them apart.

create or replace function public.view_security_invoker_enabled()
returns boolean
language sql
immutable
as $$
  select true;
$$;

revoke all on function public.view_security_invoker_enabled() from public, anon;
grant execute on function public.view_security_invoker_enabled() to authenticated;

notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- AMENDMENT NOTE — 2026-08-13
--
-- This file was applied to STAGING on 2026-08-12 WITHOUT the sentinel. It was
-- added the next day, when registering phase60-65 in
-- scripts/verify-schema.mjs showed this migration created no object a
-- PostgREST probe could see — it only ALTERs an existing view, and that view
-- is sealed to the publishable key on both sides of the change (phase47/48
-- already assert "v_bids_projection_drift not readable").
--
-- The amended file was then re-applied to staging. It is idempotent, and
-- everything above the sentinel is byte-identical to what ran on 2026-08-12,
-- so the re-apply changed nothing except adding the sentinel.
--
-- NOTE FOR THE PRODUCTION APPLY: the post-condition covers EVERY view in
-- public, not just this one. If production carries a view this run never saw
-- that is still on owner rights, the transaction aborts and the sentinel is
-- never created — verify-schema then reports PENDING instead of a green light
-- over a view that still bypasses RLS. That is the intended behaviour; fix the
-- view rather than the check.
--
-- THE PRODUCTION APPLY MUST USE THIS AMENDED FILE, not the 2026-08-12
-- version. Applying the older one leaves the sentinel absent and
-- verify-schema will correctly report this migration as PENDING.
-- ============================================================================
