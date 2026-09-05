-- ============================================================================
-- phase76_rls_and_search_path_corrections.sql
--
-- Five findings from the 2026-08-21 security/schema audit
-- (docs/audit/2026-08-21/08_security_schema.md, 14_FIX_QUEUE.md), one
-- transaction, hand-applied to STAGING only. Corrective statements only:
-- phase50, phase53, phase64 and phase68 are applied history and are not
-- rewritten here.
--
--   F-002  public.payments - no migration ever enabled RLS on the money
--          ledger and its only SELECT policy lives outside version control.
--          Section 1 asserts RLS is ON (raising, never enabling: if it is
--          off, something upstream happened that a migration must not paper
--          over) and puts the payer/payee SELECT boundary under version
--          control - creating it if absent, recording the pre-existing
--          policy names in the table comment if present.
--   F-004  job_request_parties_ok(uuid, uuid) lost its pg_temp pin when
--          phase68's CREATE OR REPLACE (search_path = public) overwrote
--          phase64's ALTER. Section 2 re-pins it; the self-check reads
--          pg_proc.proconfig to prove it.
--   F-040  Seven tables named by 08_security_schema.md B.4 deny client
--          writes through RLS while authenticated still holds CREATE-time
--          write grants. Section 3 makes the grants tell the truth. On
--          blocks and mutes the revoke is UPDATE only: phase13 created live
--          insert/delete policies there (blocks_insert_own,
--          blocks_delete_own, mutes_insert_own, mutes_delete_own) and
--          lib/moderation.ts writes through them today, so the CREATE-time
--          grant is load-bearing for insert/delete and divergent only for
--          UPDATE, the one command with no policy.
--   F-049  worker_services.price_cents is client-writable money with no
--          ceiling. Section 4 adds the phase75 ceiling (10,000,000 cents =
--          $100,000.00). Deliberately NOT "not valid": if staging holds a
--          violating row the apply aborts loudly and the operator reports.
--   F-068  supabase/add_location_column.sql is an unnumbered orphan with no
--          transaction, sentinel or verify entry. Section 5 folds its exact
--          effect in as idempotent DDL; the orphan file stays on disk
--          untouched (its removal is an operator call).
--
-- Section 6 creates phase76_rls_posture(): the harness-facing introspection
-- function that lets scripts/verify-schema.mjs finally SEE RLS posture
-- (08_security_schema.md J.8: relrowsecurity and pg_policies have no
-- PostgREST surface). It is the repo's second deliberate anon-executable
-- function, after job_categories_expanded (phase69).
--
-- Section 7 is the in-transaction self-check: any failed assertion raises
-- and aborts the whole file (the phase64/68/73/75 discipline). Section 8
-- creates the sentinel last, so verify-schema.mjs cannot see it unless
-- everything above committed.
--
-- ASCII only. One transaction. Safe to run more than once.
-- ============================================================================

begin;

-- Transaction-scoped default, the phase68 convention (no extensions entry:
-- nothing here touches pgvector). Every function created below also pins its
-- own search_path independently.
set local search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 0. Preconditions. Each raises and rolls back rather than half-applying.
--    The blocks/mutes policy assertions matter most: section 3 narrows the
--    revoke on those two tables BECAUSE those policies carry live app writes
--    (lib/moderation.ts). If they have vanished, this file's premise is wrong
--    and it must not apply.
-- ---------------------------------------------------------------------------
do $$
declare
  v_table text;
  v_policy text;
  v_tables constant text[] := array[
    'payments', 'worker_services', 'jobs', 'job_requests', 'direct_threads',
    'job_disputes', 'banned_phones', 'blocks', 'mutes', 'worker_semantic_docs'
  ];
  v_policies constant text[][] := array[
    ['blocks', 'blocks_insert_own'],
    ['blocks', 'blocks_delete_own'],
    ['mutes',  'mutes_insert_own'],
    ['mutes',  'mutes_delete_own']
  ];
  i integer;
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'phase76: table public.% not found', v_table;
    end if;
  end loop;

  if to_regprocedure('public.job_request_parties_ok(uuid,uuid)') is null then
    raise exception 'phase76: job_request_parties_ok(uuid, uuid) not found - apply phase18/phase68 first';
  end if;

  for i in 1 .. array_length(v_policies, 1) loop
    v_table  := v_policies[i][1];
    v_policy := v_policies[i][2];
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = v_table and policyname = v_policy
    ) then
      raise exception
        'phase76: policy % on public.% not found - section 3 narrows the blocks/mutes revoke to UPDATE because these policies carry live writes; without them this file was written for a different database',
        v_policy, v_table;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 1. F-002 - public.payments.
--
-- (a) Assert RLS is enabled. Asserting rather than enabling is deliberate:
--     phase50:174 grants SELECT to authenticated, which is safe ONLY under
--     RLS. If RLS is off, the money ledger is already exposed and turning it
--     on quietly would hide the incident this file exists to make detectable.
--     Raise, roll back, operator investigates.
-- (b) Version-control the payer/payee SELECT boundary. The columns come from
--     phase50's own DDL, not from memory: payments_parties_distinct
--     (phase50:130) is check (payer_id <> payee_id), and the phase50:160-163
--     indexes are on (payer_id, ...) and (payee_id, ...). If no SELECT
--     policy exists, create payments_select_parties (named per the
--     phase50-era convention, phase51's disputes_select_parties). If one or
--     more already exist (the audit expects the pre-repo "parties view own
--     payments"), create nothing - permissive policies OR together, so a
--     duplicate would widen review surface for no gain - and record the
--     names in the table comment so the repo finally carries the fact.
-- ---------------------------------------------------------------------------
do $$
declare
  v_rls boolean;
begin
  select c.relrowsecurity into v_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'payments' and c.relkind = 'r';

  if v_rls is distinct from true then
    raise exception
      'phase76: RLS is OFF on public.payments - the phase50:174 SELECT grant is only safe under RLS, so every payer, payee and amount would be readable by any signed-in user. Refusing to proceed; investigate how RLS was lost before re-running (F-002).';
  end if;
end $$;

do $$
declare
  v_names text;
begin
  select string_agg(policyname, ', ' order by policyname) into v_names
  from pg_policies
  where schemaname = 'public' and tablename = 'payments' and cmd = 'SELECT';

  if v_names is null then
    create policy payments_select_parties
      on public.payments for select
      to authenticated
      using (payer_id = auth.uid() or payee_id = auth.uid());
  else
    execute format('comment on table public.payments is %L',
      'The money ledger: one row per money event. Phase 5 writes exactly one kind (job_payment) through the sandbox RPCs and stops at held - no release/payout path exists yet. Wallet/earnings surfaces must derive from this table, never a hand-kept balance. '
      || 'F-002 (phase76): RLS verified enabled at apply time; the SELECT boundary is carried by pre-existing policy(ies) created outside version control: '
      || v_names
      || '. phase76 created no policy because these already exist; this comment is the version-controlled record of their names.');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. F-004 - re-pin pg_temp on the one definer function that lost it.
--    phase64:72 pinned it; phase68's CREATE OR REPLACE (SET search_path =
--    public) replaced proconfig and silently undid it. One ALTER, exactly
--    phase64's form. The self-check reads pg_proc.proconfig to prove it took.
-- ---------------------------------------------------------------------------
alter function public.job_request_parties_ok(uuid, uuid) set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 3. F-040 - make the write grants tell the truth (B.4's seven tables).
--
-- Five tables have no write policy of any kind, so every client write is
-- RLS-denied today while the CREATE-time grant claims otherwise. The app
-- holds no direct .insert/.update/.delete/.upsert on any of the five
-- (verified by grep across lib/, hooks/, screens/, components/, modes/), so
-- nothing can break:
--   job_requests          select_party only (phase18:131)
--   direct_threads        select_party only (phase36:73); app reads only
--   banned_phones         zero policies by design (phase13; definer-only)
--   job_disputes          already revoked at phase51:200-203 - re-asserted
--                         here so the sweep is complete and self-checked
--   worker_semantic_docs  already revoked at phase39:173 - same
--
-- blocks and mutes are the deliberate exception, UPDATE only. phase13
-- created insert/delete policies on both, and lib/moderation.ts:80-104
-- writes through them in production paths (block/unblock/mute/unmute), so
-- insert/delete grants are load-bearing and correct. UPDATE has no policy on
-- either table - that is the one divergent grant, and the one revoked.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.job_requests         from authenticated;
revoke insert, update, delete on public.direct_threads       from authenticated;
revoke insert, update, delete on public.banned_phones        from authenticated;
revoke insert, update, delete on public.job_disputes         from authenticated;
revoke insert, update, delete on public.worker_semantic_docs from authenticated;
revoke update                 on public.blocks               from authenticated;
revoke update                 on public.mutes                from authenticated;

-- ---------------------------------------------------------------------------
-- 4. F-049 - the worker_services money ceiling.
--    Same 10,000,000-cent ($100,000.00) sanity bound as phase75's ceilings.
--    price_cents is nullable (NULL means "ask", phase53) and NULL passes a
--    CHECK, so quotes-on-request survive. phase53's inline column check
--    (price_cents is null or price_cents > 0) stays in force, so zero
--    remains rejected by that older, stricter floor; this constraint adds
--    the ceiling. Deliberately a plain constraint, NOT "not valid": a
--    staging row above $100,000 should abort this apply loudly.
-- ---------------------------------------------------------------------------
alter table public.worker_services drop constraint if exists worker_services_money_ceiling;
alter table public.worker_services add constraint worker_services_money_ceiling
  check (price_cents >= 0 and price_cents <= 10000000);

-- ---------------------------------------------------------------------------
-- 5. F-068 - fold in the unnumbered orphan add_location_column.sql.
--    Its exact column definition, made idempotent here inside a transaction
--    with a sentinel and a verify-schema entry - everything the orphan
--    lacked. The orphan file itself stays on disk; removing it is an
--    operator decision.
-- ---------------------------------------------------------------------------
alter table public.jobs
  add column if not exists location text;

-- ---------------------------------------------------------------------------
-- 6. phase76_rls_posture() - RLS posture, made visible to the harness.
--
-- scripts/verify-schema.mjs probes over PostgREST with the publishable key,
-- and relrowsecurity / pg_policies have no PostgREST surface - which is
-- exactly why F-002 was invisible (08_security_schema.md J.8). This definer
-- function reads ONLY pg_class.relrowsecurity and pg_policies for a FIXED
-- table list and returns booleans plus one count: no object names, no
-- policy definitions, no row data. A table that does not exist reports
-- rls_enabled false - absent is broken, not secured.
-- ---------------------------------------------------------------------------
create or replace function public.phase76_rls_posture()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with wanted(relname) as (
    values ('payments'), ('job_offers'), ('job_locations'),
           ('notification_outbox'), ('job_disputes'), ('worker_services'),
           ('saved_workers'), ('profiles')
  )
  select jsonb_object_agg(
    w.relname,
    jsonb_build_object('rls_enabled', coalesce(c.relrowsecurity, false))
      || case when w.relname = 'payments'
              then jsonb_build_object('select_policy_count',
                     (select count(*) from pg_policies
                       where schemaname = 'public'
                         and tablename = 'payments'
                         and cmd = 'SELECT'))
              else '{}'::jsonb end)
  from wanted w
  left join (pg_class c
             join pg_namespace n
               on n.oid = c.relnamespace and n.nspname = 'public')
    on c.relname = w.relname and c.relkind = 'r'
$function$;

-- The second deliberate anon-executable function in this repo, after
-- job_categories_expanded (phase69:229-230), and for the same reason:
-- verify-schema.mjs runs with the app's publishable key, which is the anon
-- role, and this function exists so that harness can assert RLS posture
-- (F-002) instead of being blind to it. SECURITY DEFINER so the catalog
-- reads do not depend on client roles holding catalog privileges. The
-- explicit revoke-then-grant is the phase69 ACL discipline: the CREATE-time
-- default would leave it executable by PUBLIC.
revoke all on function public.phase76_rls_posture() from public, anon;
grant execute on function public.phase76_rls_posture() to anon, authenticated;

comment on function public.phase76_rls_posture() is
  'RLS posture for a fixed eight-table list as {table: {rls_enabled}} plus payments.select_policy_count. Reads only pg_class.relrowsecurity and pg_policies; returns no names, definitions or row data. Deliberately executable by anon - the SECOND such function after job_categories_expanded (phase69) - because scripts/verify-schema.mjs probes with the publishable (anon) key and this is how it sees what PostgREST cannot show (F-002).';

-- ---------------------------------------------------------------------------
-- 7. Self-check. Aborts the whole file on any failure.
--
-- (a) payments: RLS on AND at least one SELECT policy present.
-- (b) job_request_parties_ok pins pg_temp again (pg_proc.proconfig).
-- (c) authenticated holds no write grant where RLS holds no write policy -
--     and STILL holds the load-bearing grants: insert/delete on blocks and
--     mutes (lib/moderation.ts), select on the tables the app reads.
-- (d) the worker_services ceiling exists and is validated.
-- (e) jobs.location exists.
-- (f) the posture function is definer, pg_temp-pinned, anon-executable, and
--     its own report agrees payments is covered.
-- ---------------------------------------------------------------------------
do $$
declare
  v_rls boolean;
  v_select_policies integer;
  v_config text;
  v_table text;
  v_cmd text;
  v_posture jsonb;
  v_no_write constant text[] := array[
    'job_requests', 'direct_threads', 'banned_phones',
    'job_disputes', 'worker_semantic_docs'
  ];
begin
  -- (a)
  select c.relrowsecurity into v_rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'payments' and c.relkind = 'r';
  if v_rls is distinct from true then
    raise exception 'PHASE76 SELF-CHECK FAIL (a): RLS is not enabled on public.payments';
  end if;
  select count(*) into v_select_policies
  from pg_policies
  where schemaname = 'public' and tablename = 'payments' and cmd = 'SELECT';
  if v_select_policies < 1 then
    raise exception 'PHASE76 SELF-CHECK FAIL (a): public.payments has no SELECT policy';
  end if;

  -- (b)
  select array_to_string(p.proconfig, ',') into v_config
  from pg_proc p
  where p.oid = to_regprocedure('public.job_request_parties_ok(uuid,uuid)');
  if v_config is null or v_config not like '%pg_temp%' then
    raise exception
      'PHASE76 SELF-CHECK FAIL (b): job_request_parties_ok proconfig is [%] - pg_temp is not pinned', coalesce(v_config, 'null');
  end if;

  -- (c)
  foreach v_table in array v_no_write loop
    foreach v_cmd in array array['INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege('authenticated', 'public.' || quote_ident(v_table), v_cmd) then
        raise exception
          'PHASE76 SELF-CHECK FAIL (c): authenticated still holds % on public.%', v_cmd, v_table;
      end if;
    end loop;
  end loop;
  foreach v_table in array array['blocks', 'mutes'] loop
    if has_table_privilege('authenticated', 'public.' || quote_ident(v_table), 'UPDATE') then
      raise exception
        'PHASE76 SELF-CHECK FAIL (c): authenticated still holds UPDATE on public.%', v_table;
    end if;
    foreach v_cmd in array array['INSERT', 'DELETE'] loop
      if not has_table_privilege('authenticated', 'public.' || quote_ident(v_table), v_cmd) then
        raise exception
          'PHASE76 SELF-CHECK FAIL (c): authenticated lost % on public.% - lib/moderation.ts writes through the phase13 policies and needs that grant', v_cmd, v_table;
      end if;
    end loop;
  end loop;
  foreach v_table in array array['blocks', 'mutes', 'direct_threads', 'job_disputes'] loop
    if not has_table_privilege('authenticated', 'public.' || quote_ident(v_table), 'SELECT') then
      raise exception
        'PHASE76 SELF-CHECK FAIL (c): authenticated lost SELECT on public.% - the app reads it', v_table;
    end if;
  end loop;

  -- (d)
  if not exists (
    select 1 from pg_constraint
    where conname = 'worker_services_money_ceiling' and convalidated
  ) then
    raise exception
      'PHASE76 SELF-CHECK FAIL (d): worker_services_money_ceiling is missing or not validated';
  end if;

  -- (e)
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs' and column_name = 'location'
  ) then
    raise exception 'PHASE76 SELF-CHECK FAIL (e): jobs.location does not exist';
  end if;

  -- (f)
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'phase76_rls_posture'
      and p.prosecdef
      and array_to_string(p.proconfig, ',') like '%pg_temp%'
  ) then
    raise exception
      'PHASE76 SELF-CHECK FAIL (f): phase76_rls_posture is missing, not SECURITY DEFINER, or not pg_temp-pinned';
  end if;
  if not has_function_privilege('anon', 'public.phase76_rls_posture()', 'execute') then
    raise exception
      'PHASE76 SELF-CHECK FAIL (f): anon cannot execute phase76_rls_posture - verify-schema.mjs probes with the publishable key and would go blind';
  end if;
  v_posture := public.phase76_rls_posture();
  if (v_posture->'payments'->>'rls_enabled')::boolean is distinct from true
     or coalesce((v_posture->'payments'->>'select_policy_count')::integer, 0) < 1 then
    raise exception
      'PHASE76 SELF-CHECK FAIL (f): phase76_rls_posture reports payments uncovered: %',
      v_posture->'payments';
  end if;

  raise notice 'PHASE76 SELF-CHECK PASS: 6 assertion groups verified';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Sentinel, created last, so verify-schema.mjs cannot see it unless every
--    section above committed.
-- ---------------------------------------------------------------------------
create or replace function public.phase76_corrections_enabled()
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$ select true $function$;

revoke all on function public.phase76_corrections_enabled() from public, anon;
grant execute on function public.phase76_corrections_enabled() to authenticated;

comment on function public.phase76_corrections_enabled() is
  'Marker for scripts/verify-schema.mjs: phase76_rls_and_search_path_corrections.sql has been applied. Created last inside phase76''s transaction, so its presence proves the entire file - the payments RLS assertion and self-check included - committed.';

commit;
