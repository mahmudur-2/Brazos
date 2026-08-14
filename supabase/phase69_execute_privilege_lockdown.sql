-- Brazos - Phase 69 - execute privilege lockdown in schema public
--
-- Paste into Supabase - SQL Editor and run. Safe to re-run (idempotent), and
-- safe to re-run after a failed run: everything is one transaction, so a failed
-- run leaves nothing behind.
--
-- ===========================================================================
-- WHY THIS FILE EXISTS
-- ===========================================================================
-- phase68 aborted at its own self-check (d) on staging:
--
--   PHASE68 SELF-CHECK FAIL (d): public.job_request_parties_ok(uuid, uuid)
--   has a default ACL, which grants EXECUTE to PUBLIC.
--
-- That is phase68 working correctly, not phase68 being wrong. phase68 re-emits
-- job_request_parties_ok at phase68_deleted_at_authorization.sql:97 and emits
-- no revoke/grant for it, and `create or replace function` PRESERVES the
-- existing ACL - which for that function was still the CREATE-time default.
-- For functions the default ACL grants EXECUTE to PUBLIC, so the helper was
-- reachable by `anon`. phase68 refused to commit rather than publish it.
--
-- Sixteen of the 116 functions in schema public are in that state. Every one of
-- them is defined in phase6, phase7, phase13, phase17, phase18, phase20 or
-- phase23 - all BEFORE phase32, which is the migration that changed the default
-- (phase32_function_execute_privileges.sql:82-89) and explicitly re-granted only
-- five named functions (:41-66). Anything created earlier and never re-granted
-- since kept the original default. This file closes that set.
--
-- APPLY ORDER: this file FIRST, then phase68 unchanged. phase68 needs no edit.
--
-- ===========================================================================
-- WHAT THIS FILE DOES NOT DO
-- ===========================================================================
-- It changes privileges only. There is not one `create or replace function`
-- here except the phase69 sentinel at the end. No function body is touched, no
-- policy is touched, no table is touched. The five functions that already carry
-- correct explicit grants - is_profile_active, match_workers_semantic,
-- should_notify, transition_job_status, worker_semantic_refresh_queue - are
-- named nowhere in the DDL below, and self-check (e) proves their ACLs are
-- byte-identical before and after.
--
-- ===========================================================================
-- THE ONE NON-OBVIOUS GRANT: is_blocked_between
-- ===========================================================================
-- is_blocked_between(uuid, uuid) is not called by the app, but it IS called
-- from inside four RLS policies, every one of them granted `to authenticated`:
--
--   bids_insert_own          public.bids       phase13:233-245, call at :243
--   messages_insert_party    public.messages   phase66:143+,    calls at :156, :165
--   chat_photos_insert_party storage.objects   phase29:772-790, call at :785
--   chat_audio_insert_party  storage.objects   phase29:806-824, call at :819
--
-- A policy expression is evaluated as the querying role, so that role must hold
-- EXECUTE on every function the expression calls. Revoking is_blocked_between
-- from `authenticated` and granting nothing would make every authenticated
-- INSERT into bids, messages, chat-photos and chat-audio fail with
-- "permission denied for function is_blocked_between". So it keeps an
-- authenticated grant and loses only PUBLIC and anon - neither of which is the
-- applicable role of any of the four.
--
-- This is the same shape phase67 already used for the other policy-called
-- helper: is_profile_active is called by jobs_select_open (phase43:517-525) and
-- bids_select_job_owner (phase29:263-275), both `to authenticated`, and is
-- granted exactly `authenticated` at phase67:197.
--
-- Full call-site evidence: docs/audits/PHASE69_DIAGNOSTIC.md, Q2.
--
-- ===========================================================================
-- IF IT ABORTS
-- ===========================================================================
-- Run it as the role that owns these functions - the same role the earlier
-- phases were pasted as, which for this project is `postgres`. REVOKE and GRANT
-- require ownership or grant option, so running as anything else fails on the
-- first statement it cannot change. That failure is safe: one transaction, so
-- nothing is half-applied, and the error names the function.

begin;

set local search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 0. Preconditions
--
-- Every function this file touches must already exist. A revoke against a
-- missing function would abort anyway; this block just fails with a sentence
-- that names the problem instead of a bare Postgres error.
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select unnest(array[
      -- the ten trigger functions
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
      -- the five callable SECURITY DEFINER functions
      'public.enqueue_notification(uuid, uuid, text, text, text, text, jsonb, text)',
      'public.notify_display_name(uuid)',
      'public.notify_nearby_for_job(uuid)',
      'public.is_blocked_between(uuid, uuid)',
      'public.job_request_parties_ok(uuid, uuid)',
      -- the one callable SECURITY INVOKER function
      'public.job_categories_expanded()',
      -- the five already-correct functions, read-only here but snapshotted
      -- below, so (e) can prove this file did not touch them
      'public.is_profile_active(uuid)',
      'public.match_workers_semantic(double precision[], text[], integer, double precision)',
      'public.should_notify(uuid, uuid, text)',
      'public.transition_job_status(uuid, text, jsonb, jsonb)',
      'public.worker_semantic_refresh_queue(integer)'
    ]) as sig
  loop
    if to_regprocedure(r.sig) is null then
      raise exception
        'PHASE69 PRECONDITION FAIL: % does not exist. Apply the migration that creates it first.',
        r.sig;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Snapshot, for self-check (e)
--
-- The ACLs of the five functions this file must NOT touch, captured before any
-- revoke runs. Compared again at the end. proacl is cast to text so a NULL and
-- an empty array stay distinguishable, and compared with IS DISTINCT FROM so a
-- NULL on both sides counts as unchanged.
-- ---------------------------------------------------------------------------

drop table if exists pg_temp.phase69_acl_before;

create temp table phase69_acl_before as
select
  t.sig,
  to_regprocedure(t.sig)::oid as fn_oid,
  (select p.proacl::text from pg_proc p where p.oid = to_regprocedure(t.sig)::oid) as acl
from (values
  ('public.is_profile_active(uuid)'),
  ('public.match_workers_semantic(double precision[], text[], integer, double precision)'),
  ('public.should_notify(uuid, uuid, text)'),
  ('public.transition_job_status(uuid, text, jsonb, jsonb)'),
  ('public.worker_semantic_refresh_queue(integer)')
) as t(sig);

-- ---------------------------------------------------------------------------
-- 2. The ten trigger functions
--
-- All ten are `returns trigger` and all ten are reachable only through a
-- `for each row execute function` binding - a repo-wide search found zero
-- direct calls (docs/audits/PHASE69_DIAGNOSTIC.md, Q2). Postgres checks EXECUTE
-- on a trigger function at CREATE TRIGGER time, not on each fire, so revoking
-- it cannot break an existing trigger. Migrations run as the owning role, which
-- keeps its own grant, so a future CREATE TRIGGER still works.
--
-- Grant nothing. `revoke all` and `revoke execute` are the same statement for a
-- function - EXECUTE is the only privilege one has - and `revoke all` is the
-- house form (phase39:683, phase56:116, phase67:196).
-- ---------------------------------------------------------------------------

revoke all on function public.close_requests_on_block() from public, anon, authenticated;
revoke all on function public.create_default_notification_prefs() from public, anon, authenticated;
revoke all on function public.enforce_portfolio_cap() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.notify_on_bid() from public, anon, authenticated;
revoke all on function public.notify_on_job_location() from public, anon, authenticated;
revoke all on function public.notify_on_job_request() from public, anon, authenticated;
revoke all on function public.notify_on_job_status() from public, anon, authenticated;
revoke all on function public.notify_on_review() from public, anon, authenticated;
revoke all on function public.recompute_profile_rating() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The notification chain
--
-- enqueue_notification, notify_display_name and notify_nearby_for_job are
-- SECURITY DEFINER and, until this file, executable by `anon`. Together they
-- let an unauthenticated caller write rows into notification_outbox and read a
-- display name for an arbitrary uuid. Every real caller is another SECURITY
-- DEFINER function or a trigger body - classification (iii) with no (i), (ii)
-- or (iv) caller anywhere - so none of them needs a role grant at all.
-- ---------------------------------------------------------------------------

revoke all on function public.enqueue_notification(uuid, uuid, text, text, text, text, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.notify_display_name(uuid) from public, anon, authenticated;
revoke all on function public.notify_nearby_for_job(uuid) from public, anon, authenticated;

-- is_blocked_between is the fourth link in that chain and the one exception:
-- (iv) callers require `authenticated`. See the header.
revoke all on function public.is_blocked_between(uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. job_request_parties_ok - the function that blocked phase68
--
-- Internal helper, no app call site. `authenticated` because it is a
-- marketplace-party predicate, `service_role` so a future Edge Function can
-- reach it; never `anon`. This is the single change phase68's self-check (d) is
-- waiting on.
-- ---------------------------------------------------------------------------

revoke all on function public.job_request_parties_ok(uuid, uuid) from public, anon;
grant execute on function public.job_request_parties_ok(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. job_categories_expanded
--
-- SECURITY INVOKER (phase23:80-86 is `language sql immutable` with no
-- `security definer`), so it respects RLS, and it is a plausible pre-auth
-- catalog read. Keeping `anon` preserves today's PUBLIC-derived behaviour while
-- removing the PUBLIC default itself.
--
-- Note: phase23:88-89 already emits a `from public` revoke and an
-- `authenticated` grant for this function. Live staging still shows a default
-- ACL, so those two statements did not take effect there - phase23 carries a
-- `commit;` at :65 and this block sits after it, in a separate transaction.
-- Either way this file sets the ACL explicitly.
-- ---------------------------------------------------------------------------

revoke all on function public.job_categories_expanded() from public;
grant execute on function public.job_categories_expanded() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Sentinel
--
-- scripts/verify-schema.mjs probes over PostgREST with the publishable key, so
-- it cannot see an ACL - see the note in that file's phase69 block. This marker
-- is created in the same transaction as every revoke above, so its presence is
-- the proof the file ran and the self-check passed. Same shape as the phase68
-- sentinel (phase68_deleted_at_authorization.sql:528-542).
-- ---------------------------------------------------------------------------

create or replace function public.phase69_execute_lockdown_enabled()
returns boolean
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select true;
$$;

revoke all on function public.phase69_execute_lockdown_enabled() from public, anon;
grant execute on function public.phase69_execute_lockdown_enabled() to authenticated;

comment on function public.phase69_execute_lockdown_enabled() is
  'phase69 sentinel. Present only if phase69_execute_privilege_lockdown.sql committed: the sixteen functions that still carried a CREATE-time default ACL now have explicit privileges, and none of the notification chain is reachable by anon.';

-- ---------------------------------------------------------------------------
-- 7. Self-check
--
-- Reads system catalogs only and writes nothing. Aborts the whole transaction
-- on any of:
--   (a) any of the sixteen still has proacl IS NULL - i.e. still the default,
--       which for a function grants EXECUTE to PUBLIC;
--   (b) any of the four notification-chain functions is still executable by
--       anon;
--   (c) job_request_parties_ok is still executable by anon;
--   (d) any pg_policies entry references job_request_parties_ok while its
--       applicable roles include anon or public. This is the live-state proof
--       that revoking anon is safe. If it fires, the migration must not apply;
--   (e) any of the five already-correct functions had its ACL changed here.
-- Plus the positive direction: the roles that MUST retain EXECUTE still do.
-- That half is what catches a fumbled grant turning a lockdown into an outage.
--
-- has_function_privilege is used rather than aclexplode because it answers the
-- question that actually matters - can this role execute this function, by any
-- route, including inheritance from PUBLIC.
-- ---------------------------------------------------------------------------

do $$
declare
  r        record;
  v_oid    oid;
  v_acl    aclitem[];
  v_n      integer := 0;
begin
  -- (a), (b), (c)
  for r in
    select *
    from (values
      ('public.close_requests_on_block()',                true,  'trigger'),
      ('public.create_default_notification_prefs()',      true,  'trigger'),
      ('public.enforce_portfolio_cap()',                  true,  'trigger'),
      ('public.handle_new_user()',                        true,  'trigger'),
      ('public.notify_on_bid()',                          true,  'trigger'),
      ('public.notify_on_job_location()',                 true,  'trigger'),
      ('public.notify_on_job_request()',                  true,  'trigger'),
      ('public.notify_on_job_status()',                   true,  'trigger'),
      ('public.notify_on_review()',                       true,  'trigger'),
      ('public.recompute_profile_rating()',               true,  'trigger'),
      ('public.enqueue_notification(uuid, uuid, text, text, text, text, jsonb, text)',
                                                          true,  'b'),
      ('public.notify_display_name(uuid)',                true,  'b'),
      ('public.notify_nearby_for_job(uuid)',              true,  'b'),
      ('public.is_blocked_between(uuid, uuid)',           true,  'b'),
      ('public.job_request_parties_ok(uuid, uuid)',       true,  'c'),
      -- anon KEEPS this one on purpose, so it is checked for (a) only
      ('public.job_categories_expanded()',                false, '-')
    ) as t(sig, anon_blocked, chk)
  loop
    v_oid := to_regprocedure(r.sig);
    if v_oid is null then
      raise exception 'PHASE69 SELF-CHECK FAIL: % disappeared mid-transaction.', r.sig;
    end if;

    select p.proacl into v_acl from pg_proc p where p.oid = v_oid;

    -- (a) A null ACL is the DEFAULT ACL, and for functions the default grants
    --     EXECUTE to PUBLIC. That is a failure here, not an absence of one.
    if v_acl is null then
      raise exception
        'PHASE69 SELF-CHECK FAIL (a): % still has a default ACL, which grants EXECUTE to PUBLIC.',
        r.sig;
    end if;

    -- (b) / (c)
    if r.anon_blocked and has_function_privilege('anon', v_oid, 'EXECUTE') then
      raise exception
        'PHASE69 SELF-CHECK FAIL (%): % is still executable by anon.',
        r.chk, r.sig;
    end if;

    v_n := v_n + 1;
  end loop;

  -- (d) The live-state proof that dropping anon from job_request_parties_ok is
  --     safe. pg_policies.roles is {public} when a policy has no TO clause, so
  --     this catches an unqualified policy as well as an explicitly anon one.
  if exists (
    select 1
    from pg_policies pol
    where (coalesce(pol.qual, '') like '%job_request_parties_ok%'
        or coalesce(pol.with_check, '') like '%job_request_parties_ok%')
      and pol.roles::text[] && array['anon', 'public']::text[]
  ) then
    raise exception
      'PHASE69 SELF-CHECK FAIL (d): a policy granted to anon or public references job_request_parties_ok. Revoking anon would break it.';
  end if;

  -- (e) The five functions this file must not touch.
  for r in select * from pg_temp.phase69_acl_before loop
    if (select p.proacl::text from pg_proc p where p.oid = r.fn_oid)
       is distinct from r.acl then
      raise exception
        'PHASE69 SELF-CHECK FAIL (e): % had its ACL changed by this migration.',
        r.sig;
    end if;
  end loop;

  -- The positive direction. A lockdown that silently removed one of these would
  -- take a marketplace surface down; each one is asserted, not assumed.
  for r in
    select *
    from (values
      -- four RLS policies, all `to authenticated`, call this one
      ('public.is_blocked_between(uuid, uuid)',     'authenticated'),
      ('public.job_request_parties_ok(uuid, uuid)', 'authenticated'),
      ('public.job_request_parties_ok(uuid, uuid)', 'service_role'),
      ('public.job_categories_expanded()',          'anon'),
      ('public.job_categories_expanded()',          'authenticated')
    ) as t(sig, role_name)
  loop
    if not has_function_privilege(r.role_name::name, to_regprocedure(r.sig)::oid, 'EXECUTE') then
      raise exception
        'PHASE69 SELF-CHECK FAIL: % must remain executable by %, and is not.',
        r.sig, r.role_name;
    end if;
  end loop;

  -- The sentinel itself.
  if to_regprocedure('public.phase69_execute_lockdown_enabled()') is null then
    raise exception 'PHASE69 SELF-CHECK FAIL: the sentinel function is missing.';
  end if;
  if not has_function_privilege(
        'authenticated',
        to_regprocedure('public.phase69_execute_lockdown_enabled()')::oid,
        'EXECUTE') then
    raise exception 'PHASE69 SELF-CHECK FAIL: authenticated cannot execute the sentinel.';
  end if;

  raise notice 'PHASE69 SELF-CHECK PASS: % functions locked', v_n;
end $$;

-- ---------------------------------------------------------------------------
-- 8. What this file changed
-- ---------------------------------------------------------------------------

do $$
begin
  raise notice 'PHASE69 LOCKED: 10 trigger functions - revoked from public, anon, authenticated; granted to nobody';
  raise notice 'PHASE69 LOCKED: enqueue_notification(...) - granted to nobody';
  raise notice 'PHASE69 LOCKED: notify_display_name(uuid) - granted to nobody';
  raise notice 'PHASE69 LOCKED: notify_nearby_for_job(uuid) - granted to nobody';
  raise notice 'PHASE69 LOCKED: is_blocked_between(uuid, uuid) - granted to authenticated (four RLS policies call it)';
  raise notice 'PHASE69 LOCKED: job_request_parties_ok(uuid, uuid) - granted to authenticated, service_role';
  raise notice 'PHASE69 LOCKED: job_categories_expanded() - granted to anon, authenticated';
  raise notice 'PHASE69 NEXT: apply phase68_deleted_at_authorization.sql unchanged';
end $$;

notify pgrst, 'reload schema';

commit;
