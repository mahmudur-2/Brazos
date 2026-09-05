-- ============================================================================
-- phase75_security_hardening.sql
--
-- Six findings from the 2026-08-15 security sweep, in one transaction.
--
--   1. Money has no ceiling anywhere. CHECK constraints, not function edits,
--      so every writer is bound including future ones.
--   2. should_notify() decides category 'jobs' by falling off the end of a
--      CASE. Named explicitly instead.
--   3. jobs_within_radius() returns full-precision distance from a
--      caller-chosen point with an unbounded radius: three probes recover an
--      exact address. Distance snapped to a half mile, radius capped.
--   4. delete_my_account() reads its blocker gate without locks, so a
--      concurrent accept_offer() can strand an assigned job on a tombstone.
--      The caller's jobs are locked before the gate is read.
--   5. Offers other people authored on a cancelled job stay 'pending' forever
--      and nobody is told. A trigger settles them on any cancellation.
--   6. Thirteen tables still carry Supabase's CREATE-time anon grants,
--      including INSERT/UPDATE/DELETE.
--
-- ON THE anon REVOKE, DELIBERATELY PARTIAL. scripts/verify-schema.mjs probes
-- for column existence over PostgREST with the publishable (anon) key; ~55 of
-- its checks and its control probe depend on anon holding SELECT on messages,
-- jobs, push_tokens, job_requests, notification_prefs and others. Revoking
-- SELECT would make the harness report those objects missing and exit before
-- reporting anything. It is inert in any case: no policy on any of these
-- tables admits anon (every one is scoped TO authenticated, and the few
-- written TO public gate on auth.uid(), null for a signed-out caller), so the
-- grant yields zero rows. The write grants are what would become live if a
-- policy were ever widened, so those are what this file removes. A full
-- SELECT revoke needs verify-schema.mjs rebuilt on a definer introspection
-- function first; recorded as a follow-up, not done here.
--
-- MONEY CEILING = 10,000,000 cents ($100,000.00). A sanity bound, not a
-- product limit: no legitimate job on this marketplace approaches it, and a
-- constraint violation is therefore a path no real user walks. Tips keep
-- their own tighter $1,000 cap in sandbox_tip_worker().
--
-- The reasoning phase67 carried inline in delete_my_account's comments is
-- preserved in supabase/phase67_account_deletion.sql and
-- docs/runbooks/phase67-account-deletion.md. This file re-emits that function
-- with condensed ASCII comments: create or replace requires the whole body,
-- and re-emitting ~120 lines of non-ASCII commentary is the exact hazard that
-- made phase68 exclude notify_nearby_for_job. The self-check at the end
-- asserts every load-bearing statement survived the rewrite.
--
-- ASCII only. One transaction. Safe to run more than once.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Preconditions. Each raises and rolls back rather than half-applying.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.should_notify(uuid,uuid,text)') is null then
    raise exception 'phase75: should_notify(uuid,uuid,text) not found';
  end if;
  if to_regprocedure('public.delete_my_account()') is null then
    raise exception 'phase75: delete_my_account() not found - apply phase67 first';
  end if;
  if to_regprocedure('public.jobs_within_radius(double precision,double precision,double precision)') is null then
    raise exception 'phase75: jobs_within_radius(...) not found';
  end if;
  if to_regprocedure('public.withdraw_offer(uuid)') is null then
    raise exception 'phase75: withdraw_offer(uuid) not found - apply phase50 first';
  end if;
  if to_regprocedure('public.offer_post_event(uuid,uuid,uuid,text,integer)') is null then
    raise exception 'phase75: offer_post_event(...) not found - apply phase46 first';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Money ceilings.
--
-- Declarative, so no writer can bypass them and no future function has to
-- remember. Added NOT VALID then validated in a subtransaction: dev exhaust
-- predating this rule must not be able to fail the migration. Section 7
-- reports which ones validated, so unvalidated legacy data is visible rather
-- than silent.
-- ---------------------------------------------------------------------------
alter table public.jobs drop constraint if exists jobs_money_ceiling;
alter table public.jobs add constraint jobs_money_ceiling check (
      (budget_cents     is null or (budget_cents     > 0 and budget_cents     <= 10000000))
  and (budget_min_cents is null or (budget_min_cents > 0 and budget_min_cents <= 10000000))
  and (budget_max_cents is null or (budget_max_cents > 0 and budget_max_cents <= 10000000))
) not valid;

alter table public.job_offers drop constraint if exists job_offers_money_ceiling;
alter table public.job_offers add constraint job_offers_money_ceiling
  check (amount_cents > 0 and amount_cents <= 10000000) not valid;

alter table public.payments drop constraint if exists payments_money_ceiling;
alter table public.payments add constraint payments_money_ceiling
  check (amount_cents > 0 and amount_cents <= 10000000) not valid;

do $$
begin
  begin
    alter table public.jobs validate constraint jobs_money_ceiling;
  exception when others then
    raise notice 'phase75: jobs_money_ceiling left NOT VALID (%)', sqlerrm;
  end;
  begin
    alter table public.job_offers validate constraint job_offers_money_ceiling;
  exception when others then
    raise notice 'phase75: job_offers_money_ceiling left NOT VALID (%)', sqlerrm;
  end;
  begin
    alter table public.payments validate constraint payments_money_ceiling;
  exception when others then
    raise notice 'phase75: payments_money_ceiling left NOT VALID (%)', sqlerrm;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 2. should_notify(): category 'jobs' decided on purpose.
--
-- Body is phase68's, unchanged except for the one new CASE arm. 'jobs' carries
-- payment_released and dispute_opened - transactional notices about money and
-- conflict, deliberately not mutable. The else arm stays true so a category
-- added later still delivers; what changes is that 'jobs' no longer depends on
-- it. The null-prefs branch above already allows 'jobs' and is consistent.
-- ---------------------------------------------------------------------------
create or replace function public.should_notify(p_recipient uuid, p_actor uuid, p_category text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_prefs public.notification_prefs;
  v_allowed boolean;
begin
  if p_recipient is null then
    return false;
  end if;
  if p_actor is not null and p_actor = p_recipient then
    return false;
  end if;
  if not public.is_profile_active(p_recipient) then
    return false;
  end if;
  if p_actor is not null then
    if public.is_blocked_between(p_recipient, p_actor) then
      return false;
    end if;
    if exists (
      select 1 from public.mutes m
      where m.muter_id = p_recipient and m.muted_id = p_actor
    ) then
      return false;
    end if;
    if not public.is_profile_active(p_actor) then
      return false;
    end if;
  end if;

  select * into v_prefs from public.notification_prefs where user_id = p_recipient;
  if v_prefs.user_id is null then
    v_allowed := (p_category <> 'nearby_jobs');
  else
    v_allowed := case p_category
      when 'messages'      then v_prefs.messages
      when 'bids'          then v_prefs.bids
      when 'job_updates'   then v_prefs.job_updates
      when 'hire_requests' then v_prefs.hire_requests
      when 'nearby_jobs'   then v_prefs.nearby_jobs
      -- phase75: transactional, deliberately always on.
      when 'jobs'          then true
      else true
    end;
  end if;

  return v_allowed;
end;
$function$;

revoke all on function public.should_notify(uuid, uuid, text) from public, anon;
grant execute on function public.should_notify(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. jobs_within_radius(): distance snapped, radius bounded.
--
-- Full-precision distance from a point the caller chooses is a trilateration
-- oracle: three calls from three points intersect to the exact coordinate that
-- job_locations exists to keep private. Two changes close it:
--
--   * the returned distance is snapped to the nearest half mile with a 0.5
--     floor, so no job ever reports 0 (which would be a pinpoint), and
--   * ORDER BY reads the SNAPPED value, not the exact one. Ordering by the
--     precise distance while returning a rounded one leaks the precision back
--     through the sort - the rounding would have been decorative.
--
-- Radius is clamped to (0.5 .. 50] miles; null or 0 means 25. Filtering uses
-- the snapped value too, so the boundary is consistent with what is shown.
-- least(1, ...) inside asin() guards the float rounding that can push the
-- haversine argument just past 1 and raise instead of returning a distance.
--
-- Signature, column list and column order are unchanged: this is a body swap,
-- and lib/ callers see the same shape.
-- ---------------------------------------------------------------------------
create or replace function public.jobs_within_radius(p_lat double precision, p_lng double precision, p_radius_miles double precision)
returns table(id uuid, client_id uuid, title text, description text, category text, location text, budget_cents integer, status text, created_at timestamp with time zone, photos jsonb, videos jsonb, distance_miles double precision)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with bounded as (
    select least(greatest(coalesce(nullif(p_radius_miles, 0), 25), 0.5), 50)::double precision as radius_miles
  )
  select
    j.id, j.client_id, j.title, j.description,
    j.category::text, j.location, j.budget_cents, j.status, j.created_at,
    j.photos, j.videos,
    d.snapped_miles as distance_miles
  from public.jobs j
  join public.job_locations loc on loc.job_id = j.id
  cross join bounded b
  cross join lateral (
    select greatest(
             0.5,
             round((2 * 3958.8 * asin(least(1, sqrt(
               sin(radians((loc.lat - p_lat) / 2)) ^ 2
               + cos(radians(p_lat)) * cos(radians(loc.lat))
                 * sin(radians((loc.lng - p_lng) / 2)) ^ 2
             ))) * 2)::numeric, 0) / 2.0
           )::double precision as snapped_miles
  ) d
  where j.status = 'open'
    and j.visibility = 'open_market'
    and d.snapped_miles <= b.radius_miles
  order by d.snapped_miles asc, j.created_at desc, j.id asc;
$function$;

revoke all on function public.jobs_within_radius(double precision, double precision, double precision) from public, anon;
grant execute on function public.jobs_within_radius(double precision, double precision, double precision) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Settle offers when a job is cancelled.
--
-- delete_my_account() cancels the caller's open postings with a raw UPDATE,
-- because transition_job_status() permits only assigned -> in_progress and
-- in_progress -> completed and authorises only the assigned worker. Offers
-- other people authored on those jobs therefore stayed 'pending' on a job that
-- no longer exists to anyone, and nobody was told.
--
-- decline_offer() cannot do this sweep: it refuses unless awaiting_id is the
-- caller, and on half these chains the awaiting party is the worker. So the
-- settlement is its own definer function, and it hangs off a TRIGGER on
-- jobs rather than off delete_my_account - ban_user() also writes 'cancelled'
-- by raw UPDATE, and any future canceller inherits this for free. One
-- implementation of the rule, per CLAUDE.md.
--
-- offer_post_event() posts the chain event, which is what reaches the other
-- party: it inserts the message that notify_on_message turns into an outbox
-- row. Marketplace chains have carried a root message since phase61, so both
-- offer kinds reach it.
-- ---------------------------------------------------------------------------
create or replace function public.settle_offers_on_cancelled_job()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_offer record;
begin
  for v_offer in
    select o.id, o.root_offer_id, o.amount_cents, o.customer_id
    from public.job_offers o
    where o.job_id = new.id
      and o.status = 'pending'
    order by o.created_at
    for update
  loop
    update public.job_offers
       set status = 'declined', awaiting_id = null, updated_at = now()
     where id = v_offer.id;

    -- The job's client is the party the cancellation acts for. A failure to
    -- post one chain event must not veto the cancellation itself, which is
    -- either an account deletion the user is entitled to or an admin ban.
    begin
      perform public.offer_post_event(
        v_offer.id, v_offer.root_offer_id, v_offer.customer_id,
        'declined', v_offer.amount_cents
      );
    exception when others then
      raise notice 'phase75: chain event for offer % not posted (%)', v_offer.id, sqlerrm;
    end;
  end loop;

  return new;
end;
$function$;

revoke all on function public.settle_offers_on_cancelled_job() from public, anon, authenticated;

drop trigger if exists jobs_settle_offers_on_cancel on public.jobs;
create trigger jobs_settle_offers_on_cancel
  after update of status on public.jobs
  for each row
  when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function public.settle_offers_on_cancelled_job();

-- ---------------------------------------------------------------------------
-- 5. delete_my_account(): the blocker gate reads under a lock.
--
-- Body is phase67's, logic for logic, with one addition marked phase75: the
-- caller's jobs are locked FOR UPDATE before account_deletion_blockers() is
-- read. Without it the gate is a snapshot - a concurrent accept_offer() can
-- assign a job to this account between the check and the commit, leaving an
-- assigned job whose party is a tombstone.
--
-- LOCK ORDER IS jobs THEN job_offers, matching accept_offer() and
-- counter_offer() (phase46). Taking them in this order is what makes a
-- deadlock impossible rather than merely unlikely. ORDER BY id inside the lock
-- keeps the order deterministic across the set.
--
-- account_deletion_blockers() stays STABLE and lock-free: it is also the
-- client's read for the blocker list, and a screen render must not take row
-- locks. The lock belongs here, at the write.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_offer record;
  v_cancelled integer := 0;
  v_withdrawn integer := 0;
  v_offer_failures integer := 0;
  v_auth_deleted integer;
begin
  -- (a)
  if v_user is null then
    raise exception 'Not signed in';
  end if;

  -- (a2) phase75: lock every job this account is party to, before the gate
  --      reads them. jobs first, always - see the header.
  perform 1
  from public.jobs
  where client_id = v_user or assigned_worker_id = v_user
  order by id
  for update;

  -- (b) The gate. Never a silent no-op: the client matches this exact string
  --     and re-renders the blocker list instead of showing a raw error.
  --     Read AFTER the lock above, so what it sees cannot move under it.
  if exists (select 1 from public.account_deletion_blockers()) then
    raise exception using
      errcode = 'P0001',
      message = 'ACCOUNT_DELETION_BLOCKED';
  end if;

  -- (c) Cancel, do not orphan. Raw UPDATE because transition_job_status()
  --     permits only assigned -> in_progress and in_progress -> completed and
  --     authorises only the assigned worker; an open job has no assigned
  --     worker at all. Drafts stay at draft on purpose. IN not NOT IN, so an
  --     unrecognised status is never auto-cancelled. No exception handler
  --     here, deliberately the opposite call from (d): a refusal to cancel the
  --     user's own live posting must abort, or the tombstone commits with a
  --     posting nobody can cancel.
  --
  --     phase75: offers other people authored on these jobs are now settled by
  --     the jobs_settle_offers_on_cancel trigger, which fires on this UPDATE.
  update public.jobs
     set status = 'cancelled'
   where client_id = v_user
     and status = 'open';

  get diagnostics v_cancelled = row_count;

  -- (d) Withdraw outbound commitments through withdraw_offer(), which posts
  --     the chain event that keeps the bids projection and the feed
  --     consistent. Each withdrawal is its own subtransaction: a pending offer
  --     sits on somebody else's job, and one refusal must not veto a deletion
  --     the user is entitled to. Failures are counted and named.
  if to_regclass('public.job_offers') is not null
     and to_regprocedure('public.withdraw_offer(uuid)') is not null then
    for v_offer in
      select o.id
      from public.job_offers o
      where o.author_id = v_user
        and o.status = 'pending'
        and (o.expires_at is null or o.expires_at > now())
      order by o.created_at
    loop
      begin
        perform public.withdraw_offer(v_offer.id);
        v_withdrawn := v_withdrawn + 1;
      exception when others then
        v_offer_failures := v_offer_failures + 1;
        raise notice
          'phase67: offer % could not be withdrawn (%) - left as-is, continuing.',
          v_offer.id, sqlerrm;
        continue;
      end;
    end loop;
  end if;

  -- (e) Hard delete private-only rows carrying no counterparty value.
  --     saved_workers on the user_id side ONLY - a row where this account is
  --     the worker_id is somebody else's private list. mutes goes both ways.
  --     blocks is NOT here: a block has to survive.
  if to_regclass('public.push_tokens') is not null then
    delete from public.push_tokens where user_id = v_user;
  end if;
  if to_regclass('public.notification_prefs') is not null then
    delete from public.notification_prefs where user_id = v_user;
  end if;
  if to_regclass('public.notification_outbox') is not null then
    delete from public.notification_outbox where recipient_id = v_user;
  end if;
  if to_regclass('public.saved_workers') is not null then
    delete from public.saved_workers where user_id = v_user;
  end if;
  if to_regclass('public.mutes') is not null then
    delete from public.mutes where muter_id = v_user or muted_id = v_user;
  end if;
  if to_regclass('public.message_reads') is not null then
    delete from public.message_reads where user_id = v_user;
  end if;
  if to_regclass('public.message_reactions') is not null then
    delete from public.message_reactions where user_id = v_user;
  end if;
  if to_regclass('public.portfolio_items') is not null then
    delete from public.portfolio_items where worker_id = v_user;
  end if;
  if to_regclass('public.worker_services') is not null then
    delete from public.worker_services where worker_id = v_user;
  end if;
  if to_regclass('public.worker_semantic_docs') is not null then
    delete from public.worker_semantic_docs where worker_id = v_user;
  end if;

  -- (f) Scrub the profile to a tombstone. NOT touched on purpose: id,
  --     created_at, rating_avg, rating_count, and banned - deletion must never
  --     launder a ban.
  update public.profiles
     set full_name         = 'Deleted user',
         phone             = null,
         avatar_url        = null,
         bio               = null,
         availability_note = null,
         categories        = null,
         completion_rate   = null,
         on_time_pct       = null,
         response_time     = null,
         is_admin          = false,
         accepting_work    = false,
         deleted_at        = now()
   where id = v_user;

  -- verification_status is a named enum this repo never defines, so the reset
  -- runs only if 'unverified' is actually a label. The app treats anything but
  -- 'verified' as unverified, so skipping is safe; guessing would break it.
  if exists (
    select 1
    from information_schema.columns c
    join pg_namespace ns on ns.nspname = c.udt_schema
    join pg_type t on t.typname = c.udt_name and t.typnamespace = ns.oid
    join pg_enum e on e.enumtypid = t.oid
    where c.table_schema = 'public'
      and c.table_name = 'profiles'
      and c.column_name = 'verification_status'
      and e.enumlabel = 'unverified'
  ) then
    execute 'update public.profiles set verification_status = ''unverified'' where id = $1'
      using v_user;
  else
    raise notice
      'phase67: profiles.verification_status left as-is (no ''unverified'' label found).';
  end if;

  -- stripe_account_id appears in no migration in this repo; cleared only if
  -- the live table actually has it.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'stripe_account_id'
  ) then
    execute 'update public.profiles set stripe_account_id = null where id = $1'
      using v_user;
  end if;

  -- (g) Denormalised identity on retained tables: audited, nothing to scrub.
  --     One exception, unscrubbable: notification_outbox.title/.body embed the
  --     actor's display name with no actor column. Recorded as a follow-up.

  -- (h) Storage cleanup deliberately not attempted.

  -- (i) The auth row. Only reachable because phase67 section 1 dropped every
  --     public foreign key pointing at auth.users. The row-count assertion is
  --     not padding: RLS is enabled on auth.users and this DELETE lands only
  --     while the function owner carries BYPASSRLS. Without the check, a
  --     zero-row DELETE would commit the tombstone and the scrub while the
  --     account could still sign in.
  delete from auth.users where id = v_user;

  get diagnostics v_auth_deleted = row_count;
  if v_auth_deleted <> 1 then
    raise exception
      'phase67: auth.users delete affected % row(s), expected 1. '
      'Rolling back - the profile scrub must not commit without it.',
      v_auth_deleted;
  end if;

  raise notice
    'phase67: account % deleted (% open posting(s) cancelled, % outbound offer(s) withdrawn, % withdrawal(s) failed).',
    v_user, v_cancelled, v_withdrawn, v_offer_failures;

  -- RETAINED DELIBERATELY, all pointing at the tombstone: reviews, reports,
  -- blocks, banned_phones, legal_acceptances, payments, job_disputes, jobs,
  -- job_offers, bids, job_requests, messages, conversations, direct_threads,
  -- job_checklist_items, job_locations.
end;
$function$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Remove every write privilege anon holds anywhere in schema public.
--
-- SELECT is deliberately retained - see the header. service_role and
-- authenticated are untouched.
--
-- The sweep is driven off information_schema rather than a hand-written list.
-- A list is a claim about the database that rots: the first pass here named
-- seventeen tables and left nine grants standing on public.profiles (the
-- CREATE-time TRUNCATE/REFERENCES/TRIGGER residue phase29 never removed,
-- because phase29 was narrowing SELECT) and on the public.conversations view
-- (which no list of TABLES would ever have reached). TRUNCATE is the one that
-- earns this: unlike every other write privilege here it is NOT filtered by
-- row-level security, so a policy-scoped table is no defence against it. It is
-- unreachable through PostgREST, which exposes no TRUNCATE verb, but "no route
-- today" is not the same as "not granted".
--
-- Driving off the catalog makes the intent enforceable instead of enumerated:
-- anon holds no write privilege in public, and section 7 asserts exactly that.
-- ---------------------------------------------------------------------------
do $$
declare
  v_rel text;
begin
  for v_rel in
    select distinct table_name
    from information_schema.role_table_grants
    where grantee = 'anon'
      and table_schema = 'public'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
    order by table_name
  loop
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on table public.%I from anon',
      v_rel
    );
  end loop;
end $$;

-- The seventeen tables the security sweep named explicitly. Present as a
-- precondition, not as the mechanism: if one of them has vanished, this file
-- is being applied to a database it was not written for.
do $$
declare
  v_table text;
  v_tables constant text[] := array[
    'banned_phones', 'bids', 'blocks', 'direct_threads', 'job_locations',
    'job_requests', 'jobs', 'legal_acceptances', 'message_reactions',
    'message_reads', 'messages', 'mutes', 'notification_prefs',
    'portfolio_items', 'push_tokens', 'reports', 'reviews'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'phase75: table public.% not found', v_table;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Self-check. Aborts the whole file on any failure.
--
-- (a) should_notify names 'jobs' rather than falling through.
-- (b) jobs_within_radius orders by the snapped value, not the exact one.
-- (c) delete_my_account took the lock AND kept every load-bearing statement.
-- (d) the cancellation trigger exists and is attached to jobs.
-- (e) anon holds no write privilege on any listed table, and still holds
--     SELECT on the ones verify-schema.mjs probes.
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_table text;
  v_frag text;
  v_missing text[] := '{}';
  v_probed constant text[] := array['messages', 'jobs', 'push_tokens', 'job_requests', 'notification_prefs'];
  v_tables constant text[] := array[
    'banned_phones', 'bids', 'blocks', 'direct_threads', 'job_locations',
    'job_requests', 'jobs', 'legal_acceptances', 'message_reactions',
    'message_reads', 'messages', 'mutes', 'notification_prefs',
    'portfolio_items', 'push_tokens', 'reports', 'reviews'
  ];
  v_required constant text[] := array[
    'order by id',
    'for update',
    'ACCOUNT_DELETION_BLOCKED',
    'delete from auth.users where id = v_user',
    'v_auth_deleted <> 1',
    'deleted_at        = now()',
    'withdraw_offer',
    'accepting_work    = false',
    'is_admin          = false',
    'phone             = null',
    'delete from public.push_tokens where user_id = v_user',
    'delete from public.mutes where muter_id = v_user or muted_id = v_user',
    'status = ''cancelled'''
  ];
begin
  -- (a)
  v_def := pg_get_functiondef(to_regprocedure('public.should_notify(uuid,uuid,text)'));
  if position('when ''jobs''' in v_def) = 0 then
    raise exception 'PHASE75 SELF-CHECK FAIL (a): should_notify has no explicit jobs arm';
  end if;

  -- (b)
  v_def := pg_get_functiondef(to_regprocedure('public.jobs_within_radius(double precision,double precision,double precision)'));
  if position('order by d.snapped_miles' in v_def) = 0 then
    raise exception 'PHASE75 SELF-CHECK FAIL (b): jobs_within_radius does not order by the snapped distance';
  end if;
  if position('snapped_miles <= b.radius_miles' in v_def) = 0 then
    raise exception 'PHASE75 SELF-CHECK FAIL (b): jobs_within_radius does not filter on the snapped distance';
  end if;

  -- (c)
  v_def := pg_get_functiondef(to_regprocedure('public.delete_my_account()'));
  foreach v_frag in array v_required loop
    if position(v_frag in v_def) = 0 then
      v_missing := v_missing || v_frag;
    end if;
  end loop;
  if array_length(v_missing, 1) is not null then
    raise exception 'PHASE75 SELF-CHECK FAIL (c): delete_my_account lost: %', array_to_string(v_missing, ' | ');
  end if;

  -- (d)
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'jobs'
      and t.tgname = 'jobs_settle_offers_on_cancel' and not t.tgisinternal
  ) then
    raise exception 'PHASE75 SELF-CHECK FAIL (d): jobs_settle_offers_on_cancel trigger is missing';
  end if;

  -- (e)
  if exists (
    select 1 from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
  ) then
    raise exception 'PHASE75 SELF-CHECK FAIL (e): anon still holds write privileges in public: %',
      (select string_agg(distinct table_name || '.' || privilege_type, ', ')
         from information_schema.role_table_grants
        where grantee = 'anon' and table_schema = 'public'
          and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'));
  end if;
  foreach v_table in array v_tables loop
    if to_regclass('public.' || quote_ident(v_table)) is null then
      raise exception 'PHASE75 SELF-CHECK FAIL (e): table public.% is missing', v_table;
    end if;
  end loop;
  foreach v_table in array v_probed loop
    if not has_table_privilege('anon', 'public.' || quote_ident(v_table), 'SELECT') then
      raise exception
        'PHASE75 SELF-CHECK FAIL (e): anon lost SELECT on public.% - verify-schema.mjs cannot probe it', v_table;
    end if;
  end loop;

  raise notice 'PHASE75 SELF-CHECK PASS: 5 assertions verified';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Sentinel, created last, so verify-schema.mjs cannot see it unless every
--    section above committed.
-- ---------------------------------------------------------------------------
create or replace function public.phase75_security_hardening_enabled()
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$ select true $function$;

revoke all on function public.phase75_security_hardening_enabled() from public, anon;
grant execute on function public.phase75_security_hardening_enabled() to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- 9. Visible acceptance. The SQL Editor does not print RAISE NOTICE, so the
--    outcome is returned as rows instead. All five must read as stated.
-- ---------------------------------------------------------------------------
select
  (select count(*) from pg_constraint
    where conname in ('jobs_money_ceiling', 'job_offers_money_ceiling', 'payments_money_ceiling'))
                                                                    as ceilings_present,
  (select count(*) from pg_constraint
    where conname in ('jobs_money_ceiling', 'job_offers_money_ceiling', 'payments_money_ceiling')
      and convalidated)                                             as ceilings_validated,
  (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'jobs' and t.tgname = 'jobs_settle_offers_on_cancel') as cancel_trigger,
  (select count(*) from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
                                                                    as anon_write_grants_left,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'phase75_security_hardening_enabled')
                                                                    as sentinel;
