-- active_account_rule — production-36h S1, M2 (R2-a, R2-b, R2-c, C1-C9; S4-02, S4-07, S4-09). One
-- rule for every door: a banned or deleted account can no longer act, whichever way it reaches the
-- database.
--
-- 0. The order rule (whoever lands first, the later lane re-derives). Two checks, both on the database
--    the file runs on:
--    - before any change: the six functions restated on purpose (3, 4, 6c) must still have the
--      fingerprint of the definitions they were written from (function_fingerprint(), ban_switch 0b:
--      body, settings and shape; A8-06; the message names each with the fingerprint it found), and
--      the four new names (1, 2, 5) must not exist yet;
--    - at the end (8a): each of the 45 guard-only functions must equal the copy taken of it at run
--      time plus the one guard line. The comparison is exact text: white space and comments count, so
--      a body another migration changed in any way after this file was generated fails it.
--    Either one stops the whole file. The fix is to re-derive from the live bodies, never to edit the
--    check.
-- 1. NEW require_active_caller(): the guard. Every client-executable SECURITY DEFINER function, except
--    the 11 exempt ones named in (8), runs it as its FIRST statement. It refuses:
--      banned                -> "This account has been suspended for violating the Brazos community
--                               rules. Contact support if you think this is a mistake."
--                               (P0001, hint 'account_suspended'; the installed app's own words)
--      deleted, no profile,  -> "This account is no longer active." (P0001, hint 'account_inactive')
--      or a token with role authenticated and no sub
--    A null uid without that role (cron, triggers, the service key) passes, and the function's own
--    checks decide, as before. The one trusted exception is the mark (C5): delete_my_account sets
--    brazos.inactive_ok to the caller's own uid for its own inner calls and clears it before it
--    returns; a mark holding any other uid passes nobody.
-- 2. NEW admit_user_call(): the edge functions' one question (service role only): is this account
--    active, and is it within its hourly limit? It answers 'ok', 'suspended', 'inactive' or 'limited'
--    and takes the rate-limit hit only for an active account. rate_limit_take is left as it is, so
--    the functions deployed today keep working until the new ones are deployed.
-- 3. claim_notification_batch(), restated from its live body: a pending row whose recipient is no
--    longer active is resolved as skipped before the claim, so no push reaches a banned or deleted
--    account (C9).
-- 4. delete_my_account(), restated from its live body: the mark is set at its first statement and
--    cleared before it returns (C5). S4-09: a refusal keeps the message ACCOUNT_DELETION_BLOCKED (the
--    app matches it) and now says in its detail what blocks the deletion and that support can help.
--    It reads nothing before its own checks, so a banned account can call it straight away.
-- 5. NEW, no client may call them: function_shape(oid), every column of a function's pg_proc row
--    except the body (owner, language, cost, rows, support, kind, security, leakproof, strict,
--    set-returning, volatility, parallel, argument types, modes, names and defaults, return type,
--    settings, grants as a set, comment); and active_guard_problem(oid), the one written test of "the
--    guard is the first statement": null when it holds, otherwise the reason. It first blanks every
--    comment (-- and nested /* */, read as Postgres reads them: a comment mark inside '...', E'...',
--    "..." or $tag$...$tag$ is text; A8-06); a comment or a quoted text that does not end is a
--    problem. Then, on what is left: plpgsql: the line right after the earliest line that holds only
--    "begin" (it must be the single column-0 one) is the guard line (trailing blanks aside), and the
--    DECLARE part above it holds no query, no PERFORM, no other "begin", and no call but auth.uid,
--    auth.role, coalesce, nullif, btrim, now and gen_random_uuid (a default runs before the guard).
--    sql: the body's first line is the guard (trailing blanks aside). An argument default that holds
--    a query or names public is a problem too.
-- 6. The guard in 45 functions (29 plpgsql, 16 sql), as static text a person can read: each is
--    the function's definition as the database held it after report_push, with one line added, and
--    its grants and comment restated. Before they are re-created, their function_shape() and bodies
--    are copied aside.
--    6c. A8-02: four more, restated on purpose from the same bodies with the guard line first:
--    - accept_offer(): after the plain read of the offer, the account lock (ban_switch 2c) of both
--      parties, shared, the lower id first, then the guard again (a ban or a deletion that committed
--      while it waited refuses the caller with the guard's own words), then the row locks and the
--      checks as before ('This offer cannot be accepted', 'Worker is not available');
--    - counter_offer() (A11-09): the same, after its plain read of the offer: both parties' account
--      locks, shared, the lower id first, then the guard again, then its row locks (jobs, then
--      job_offers) and its checks as before ('This offer cannot be updated' for an inactive other
--      party). A ban or a deletion of either party now waits for the counter, or the counter waits
--      for it, before either holds a row lock, so the counter's thread line no longer closes a lock
--      cycle with them (ban_switch 2c names the cycle that is left);
--    - begin_job_payment(): after the job lock, a hired worker who is no longer active is refused
--      with 'Worker is not available' (A11-02);
--    - begin_tip_payment(): after the job lock, a suspended worker (banned, not deleted) is refused
--      with 'This worker can no longer receive tips.'; a deleted worker's tip is unchanged.
-- 7. 40 restrictive policies, (select public.is_active_user()) as an InitPlan: every (table, command)
--    the authenticated role holds in public (36 on 21 tables) and on storage.objects (4). For a banned
--    or deleted account a read returns no rows, an INSERT is refused (42501), and an UPDATE or DELETE
--    changes no row and raises nothing (S4-09). It keeps its own profile row and its own
--    avatars/<uid>/ files. app_config is left out (anon reads the same rows); conversations is a
--    security_invoker view over tables covered here; the other storage tables have row security on
--    and no policy at all. D9 (A10): the active check runs once per policy occurrence in a query, not
--    once per row and not once per query.
-- 8. The proof, in this same transaction, on the database it runs on (S4-07). It raises unless:
--    a. each of the 45 differs from its copy only by the guard line: function_shape() equal, and the
--       body minus the guard line equal to the old body;
--    b. every SECURITY DEFINER function in public and graphql_public that the authenticated role can
--       execute is exempt (by full signature) or passes active_guard_problem();
--    c. every exempt signature names such a function (a stale entry fails);
--    d. every (table, command) the authenticated role holds in public and on storage.objects, by a
--       table or a column right, has row security on and a restrictive policy for that command (or
--       for all) that calls is_active_user(); only public.app_config is left out, by name.
--       WRITTEN LIMIT (A14-F, C14-07): (d) reads each policy's expression as printed text and asks
--       only that it CALLS is_active_user(), so a restrictive policy that calls it without depending
--       on it (true or (select is_active_user())) would pass; and it reads tables only (relkind r and
--       p), never a view. Today's 40 were read: 37 are exactly (select is_active_user()), and 3 add
--       only the exceptions 7 names (its own profile row, its own avatars/<uid>/ files); the one view
--       the authenticated role reads, conversations, is security_invoker over tables covered here. A
--       later corrective file compares each policy's whole expression with an allowed list of forms,
--       and adds the views.
--    Exempt, each because it must answer an inactive caller about itself or is a policy helper that
--    returns a boolean and never raises (each answers an inactive caller about itself only, or
--    false; ban_hides_content): current_user_is_banned, account_deletion_blockers, delete_my_account
--    (carries the mark), is_profile_active, is_active_user, can_delete_own_job, messaging_unlocked,
--    review_is_revealed, current_user_is_admin, profile_visible. And release_due_at(jobs)
--    (release_clock): a computed field read inside every jobs read, which must stay "null, raises
--    nothing" (its comment, 490_release_clock); it answers only the job's own customer and hired
--    worker, and an inactive account's jobs reads return no rows (7), so it can tell such a caller
--    only about its own job.

begin;

-- 0. The order rule. The six functions restated on purpose (3, 4, 6c) were rewritten from the
--    definitions the database held after report_push: the fingerprint of each live definition
--    (function_fingerprint(), ban_switch 0b) must still be the one they were written from, and none
--    of the names this file makes new may exist yet. Otherwise the file stops here.
--    The guard-only functions are checked at the end instead (8a), against a copy taken at run time.
do $order_rule$
declare
  v_bad text;
begin
  select string_agg(w.sig || ' found=' || coalesce(public.function_fingerprint(p.oid::pg_catalog.regprocedure), 'none'),
                    ', ' order by w.sig) into v_bad
  from (values
    -- each restated on purpose; sections 3, 4 and 6c say what changes
    ('public.claim_notification_batch(integer)', 'cc2ac45e52c783fd45b3dcee511c55f1'),
    ('public.delete_my_account()',               '07b6660d054a4cc9333e43d4a167f12a'),
    ('public.accept_offer(uuid)',                '302a3dc6e346b7dc08dae7cce60f7410'),
    ('public.counter_offer(uuid,integer)',       '39b2bde20c6d894ec71f8cfd11b8f7ed'),
    ('public.begin_job_payment(uuid)',           'd26f9a06159d7e378957b327d70ac612'),
    ('public.begin_tip_payment(uuid,integer)',   '280585f6dc7b07a7443304b367961597')
  ) as w(sig, md5)
  left join pg_catalog.pg_proc p on p.oid = to_regprocedure(w.sig)
  where p.oid is null or public.function_fingerprint(p.oid::pg_catalog.regprocedure) is distinct from w.md5;
  if v_bad is not null then
    raise exception 'active_account_rule: written from a definition that is no longer live (re-derive from the live definition): %', v_bad;
  end if;

  select string_agg(n.sig, ', ' order by n.sig) into v_bad
  from (values
    ('public.require_active_caller()'),
    ('public.admit_user_call(uuid,text,integer,interval,boolean)'),
    ('public.function_shape(oid)'),
    ('public.active_guard_problem(oid)')
  ) as n(sig)
  where to_regprocedure(n.sig) is not null;
  if v_bad is not null then
    raise exception 'active_account_rule: a function this file makes new already exists (re-derive from it): %', v_bad;
  end if;
end
$order_rule$;

-- 1. The guard.
create or replace function public.require_active_caller()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    -- A token that says "authenticated" but names nobody is refused; any other caller with no uid
    -- (cron, triggers, the service key) goes on to the function's own checks.
    if auth.role() = 'authenticated' then
      raise exception using
        errcode = 'P0001',
        message = 'This account is no longer active.',
        hint = 'account_inactive';
    end if;
    return;
  end if;

  -- C5: the mark delete_my_account sets for its own uid, and only for that uid.
  if current_setting('brazos.inactive_ok', true) = v_uid::text then
    return;
  end if;

  if public.is_profile_active(v_uid) then
    return;
  end if;

  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.banned, false)) then
    raise exception using
      errcode = 'P0001',
      message = 'This account has been suspended for violating the Brazos community rules. Contact support if you think this is a mistake.',
      hint = 'account_suspended';
  end if;

  -- Deleted, or no profile row at all.
  raise exception using
    errcode = 'P0001',
    message = 'This account is no longer active.',
    hint = 'account_inactive';
end;
$function$;

revoke all on function public.require_active_caller() from public, anon, authenticated;

comment on function public.require_active_caller() is
  'active_account_rule: the guard, the first statement of every client-executable definer function except the eleven exempt ones (test 475, 2a). Refuses a banned caller (hint account_suspended), a deleted caller or one with no profile row, and a token with role authenticated and no sub (hint account_inactive). Any other null uid passes; so does the caller whose own uid delete_my_account marked in brazos.inactive_ok. No client may call it directly.';

-- 2. The edge functions' admission.
create or replace function public.admit_user_call(
  p_user uuid,
  p_action text,
  p_max integer,
  p_window interval,
  p_allow_suspended boolean default false
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_banned boolean;
  v_deleted_at timestamptz;
begin
  select coalesce(p.banned, false), p.deleted_at
    into v_banned, v_deleted_at
  from public.profiles p
  where p.id = p_user;

  if not found or v_deleted_at is not null then
    return 'inactive';
  end if;

  if v_banned and not coalesce(p_allow_suspended, false) then
    return 'suspended';
  end if;

  if public.rate_limit_take(p_user, p_action, p_max, p_window) then
    return 'ok';
  end if;
  return 'limited';
end;
$function$;

revoke all on function public.admit_user_call(uuid, text, integer, interval, boolean) from public, anon, authenticated;
grant execute on function public.admit_user_call(uuid, text, integer, interval, boolean) to service_role;

comment on function public.admit_user_call(uuid, text, integer, interval, boolean) is
  'active_account_rule (R2-c): the one question the payment edge functions ask before any provider call. ''inactive'' for a deleted account or one with no profile, ''suspended'' for a banned one (unless p_allow_suspended: listing and removing one''s own cards), otherwise one hit on rate_limit_take(p_user, p_action, p_max, p_window): ''ok'' or ''limited''. Service role only.';

-- 3. No push to an account that is no longer active (C9). Restated from the live body; the one new
--    statement is the second update.
create or replace function public.claim_notification_batch(p_limit integer default 100)
returns table(outbox_id uuid, recipient_id uuid, type text, title text, body text, data jsonb, tokens text[])
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  -- B17: a row that has used its five attempts will never be claimed again; it ends failed, with
  -- the reason written when the sender left none.
  update public.notification_outbox o
     set status = 'failed',
         last_error = coalesce(o.last_error, 'retries exhausted')
   where o.status = 'pending'
     and o.attempts >= 5
     -- A14: not while its last attempt is still out under the lease.
     and (o.send_after is null or o.send_after <= now());

  -- C9 (active_account_rule): a row whose recipient was banned or deleted after it was queued never
  -- leaves; it is resolved as skipped. Not while an attempt is out under the lease (A14).
  update public.notification_outbox o
     set status = 'skipped',
         last_error = 'the recipient is not active'
   where o.status = 'pending'
     and (o.send_after is null or o.send_after <= now())
     and not public.is_profile_active(o.recipient_id);

  -- Idea 7, the group 3 review: an alert that waited out quiet hours may have gone stale — the job
  -- hired or withdrawn, the customer blocked or muted, nearby alerts switched off. Re-checked now,
  -- once, before it can leave; a stale one is resolved as skipped.
  update public.notification_outbox o
     set status = 'skipped',
         last_error = 'quiet hours: stale by morning'
   where o.status = 'pending'
     and o.category = 'nearby_jobs'
     and o.send_after <= now()
     and not exists (
       select 1
       from public.jobs j
       where j.id::text = o.data ->> 'jobId'
         and j.status = 'open'
         and public.should_notify(o.recipient_id, j.client_id, 'nearby_jobs')
     );

  return query
  with claimed as (
    select o.id
    from public.notification_outbox o
    where o.status = 'pending'
      and o.attempts < 5
      -- Idea 7: quiet hours — not before its morning.
      and (o.send_after is null or o.send_after <= now())
    order by o.created_at
    limit greatest(1, least(coalesce(p_limit, 100), 100))
    for update skip locked
  ),
  marked as (
    update public.notification_outbox o
       set attempts = o.attempts + 1,
           -- A14: the lease. Not claimed again, and not swept, while this run may still send it.
           send_after = now() + interval '10 minutes'
      from claimed c
     where o.id = c.id
    returning o.*
  )
  select
    m.id,
    m.recipient_id,
    m.type,
    m.title,
    m.body,
    m.data,
    coalesce(
      array(
        select t.token from public.push_tokens t
        where t.user_id = m.recipient_id and t.active
      ),
      array[]::text[]
    )
  from marked m;
end;
$function$;

-- Live grants restated (no comment existed): service role only.
revoke all on function public.claim_notification_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_batch(integer) to service_role;

-- 4. The mark (C5) and the refusal's detail (S4-09). Restated from the live body; the new statements
--    are the first one, the gate (b), and the last one.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_offer record;
  v_cancelled integer := 0;
  v_withdrawn integer := 0;
  v_offer_failures integer := 0;
  v_auth_deleted integer;
  v_blocking text[];
begin
  -- active_account_rule (C5): this account may still leave while it is banned. The mark lets this
  -- function's own inner calls (withdraw_offer, and the fee functions the jobs triggers reach) pass
  -- the guard for this uid only. It is cleared before the function returns; an error rolls it back.
  perform set_config('brazos.inactive_ok', coalesce(v_user::text, ''), true);

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
  --     S4-09 (active_account_rule): the detail says what blocks and that support can help.
  select array_agg(distinct b.kind) into v_blocking from public.account_deletion_blockers() b;
  if v_blocking is not null then
    raise exception using
      errcode = 'P0001',
      message = 'ACCOUNT_DELETION_BLOCKED',
      detail = 'This account cannot be deleted yet.'
        || case when 'job' = any (v_blocking) then ' A job of yours has not finished.' else '' end
        || case when v_blocking && array['payment_incoming', 'payment_outgoing']
                then ' A payment of yours has not settled.' else '' end
        || case when 'dispute' = any (v_blocking) then ' A dispute on one of your jobs is still open.' else '' end
        || ' Contact support if you need help.';
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
  if to_regclass('public.message_reads') is not null then
    delete from public.message_reads where user_id = v_user;
  end if;
  if to_regclass('public.worker_services') is not null then
    delete from public.worker_services where worker_id = v_user;
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

  -- active_account_rule (C5): the mark ends here, on the only way out that is not an error. Nothing
  -- after this call, in this transaction, passes the guard for this uid.
  perform set_config('brazos.inactive_ok', '', true);

  -- RETAINED DELIBERATELY, all pointing at the tombstone: reviews, reports,
  -- blocks, banned_phones, legal_acceptances, payments, job_disputes, jobs,
  -- job_offers, bids, messages, conversations, direct_threads, job_locations.
end;
$function$;

-- Live grants and comment restated.
revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'Deletes the CALLING account (auth.uid() only — no parameters). Refuses with ACCOUNT_DELETION_BLOCKED while account_deletion_blockers() returns anything. Leaves a tombstone profiles row so retained reviews, payments and disputes still resolve to "Deleted user"; deletes the auth.users row last. active_account_rule (C5): exempt from the guard, so a banned account can still leave; it marks brazos.inactive_ok with its own uid at its first statement and clears it before it returns. S4-09: the refusal''s detail says what blocks the deletion (a job that has not finished, a payment that has not settled, an open dispute) and that support can help.';


-- 5. The two catalog helpers the proof (8) and the catalog test use. Invoker rights: they read only
--    the catalog, which every role can read. No client may call them.
create or replace function public.function_shape(p_fn oid)
returns jsonb
language sql
stable
set search_path = pg_catalog, pg_temp
as $function$
  select jsonb_build_object(
    'name', p.proname,
    'schema', p.pronamespace::regnamespace::text,
    'owner', p.proowner::regrole::text,
    'language', l.lanname,
    'cost', p.procost,
    'rows', p.prorows,
    'variadic', p.provariadic::regtype::text,
    'support', p.prosupport::regproc::text,
    'kind', p.prokind,
    'security_definer', p.prosecdef,
    'leakproof', p.proleakproof,
    'strict', p.proisstrict,
    'returns_set', p.proretset,
    'volatility', p.provolatile,
    'parallel', p.proparallel,
    'nargs', p.pronargs,
    'nargdefaults', p.pronargdefaults,
    'return_type', p.prorettype::regtype::text,
    'arg_types', p.proargtypes::oid[]::regtype[]::text,
    'all_arg_types', p.proallargtypes::regtype[]::text,
    'arg_modes', p.proargmodes::text,
    'arg_names', p.proargnames::text,
    'arg_defaults', pg_get_expr(p.proargdefaults, 0),
    'transforms', p.protrftypes::regtype[]::text,
    'settings', p.proconfig::text,
    'grants', (select jsonb_agg(a.item::text order by a.item::text) from unnest(p.proacl) as a(item)),
    'arguments', pg_get_function_arguments(p.oid),
    'result', pg_get_function_result(p.oid),
    'comment', obj_description(p.oid, 'pg_proc'),
    'sql_body', p.prosqlbody is not null,
    'probin', p.probin
  )
  from pg_proc p
  join pg_language l on l.oid = p.prolang
  where p.oid = p_fn;
$function$;

revoke all on function public.function_shape(oid) from public, anon, authenticated, service_role;

comment on function public.function_shape(oid) is
  'active_account_rule (S4-07): every column of the function''s pg_proc row except the body, as jsonb (owner, language, cost, rows, support, kind, security, leakproof, strict, set-returning, volatility, parallel, argument types, modes, names and defaults, return type, settings, grants as a set, comment). The proof at the end of active_account_rule compares it before and after the guard; no client may call it.';

create or replace function public.active_guard_problem(p_fn oid)
returns text
language plpgsql
stable
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_lang text;
  v_src text;
  v_defaults text;
  v_chars text[];
  v_n integer;
  v_i integer := 1;
  v_c text;
  v_next text;
  v_state text := 'code';
  v_depth integer := 0;
  v_tag text;
  v_lines text[];
  v_first integer;
  v_col0 integer;
  v_declare text;
  v_call text;
begin
  select l.lanname, p.prosrc, pg_get_expr(p.proargdefaults, 0)
    into v_lang, v_src, v_defaults
  from pg_proc p
  join pg_language l on l.oid = p.prolang
  where p.oid = p_fn;
  if not found then
    return 'no such function';
  end if;
  if coalesce(v_defaults, '') ~* '\mselect\M|public\.' then
    return 'an argument default holds a query or names public';
  end if;
  if v_lang not in ('sql', 'plpgsql') then
    return 'written in ' || v_lang || ', not plpgsql or sql';
  end if;

  -- A8-06: comments do not count. Every character of a -- or a /* */ comment (nested, as Postgres
  -- reads them) becomes a blank, a newline stays; '...', E'...' (backslash escapes), "..." and
  -- $tag$...$tag$ are read as Postgres reads them, so a comment mark inside one is text.
  v_chars := string_to_array(v_src, null);
  v_n := coalesce(array_length(v_chars, 1), 0);
  while v_i <= v_n loop
    v_c := v_chars[v_i];
    v_next := coalesce(v_chars[v_i + 1], '');
    if v_state = 'line' then
      if v_c = E'\n' then
        v_state := 'code';
      else
        v_chars[v_i] := ' ';
      end if;
    elsif v_state = 'block' then
      if v_c || v_next in ('/*', '*/') then
        v_depth := v_depth + case when v_c = '/' then 1 else -1 end;
        v_chars[v_i] := ' ';
        v_chars[v_i + 1] := ' ';
        v_i := v_i + 1;
        if v_depth = 0 then
          v_state := 'code';
        end if;
      elsif v_c <> E'\n' then
        v_chars[v_i] := ' ';
      end if;
    elsif v_state in ('quote', 'escape', 'ident') then
      if v_state = 'escape' and v_c = '\' then
        v_i := v_i + 1;
      elsif v_c = (case when v_state = 'ident' then '"' else '''' end) then
        if v_next = v_c then
          v_i := v_i + 1;
        else
          v_state := 'code';
        end if;
      end if;
    elsif v_state = 'dollar' then
      if v_c = '$' and array_to_string(v_chars[v_i:v_i + length(v_tag) - 1], '') = v_tag then
        v_i := v_i + length(v_tag) - 1;
        v_state := 'code';
      end if;
    elsif v_c || v_next in ('--', '/*') then
      v_state := case when v_c = '-' then 'line' else 'block' end;
      v_depth := 1;
      v_chars[v_i] := ' ';
      v_chars[v_i + 1] := ' ';
      v_i := v_i + 1;
    elsif v_c = '''' then
      v_state := case when lower(coalesce(v_chars[v_i - 1], '')) = 'e'
                            and coalesce(v_chars[v_i - 2], ' ') !~ '[A-Za-z0-9_$]|[^\x01-\x7f]'
                      then 'escape' else 'quote' end;
    elsif v_c = '"' then
      v_state := 'ident';
    elsif v_c = '$' and coalesce(v_chars[v_i - 1], ' ') !~ '[A-Za-z0-9_$]|[^\x01-\x7f]' then
      v_tag := substring(array_to_string(v_chars[v_i:v_i + 64], '')
                         from '^\$(?:(?:[A-Za-z_]|[^\x01-\x7f])(?:[A-Za-z0-9_]|[^\x01-\x7f])*)?\$');
      if v_tag is not null then
        v_state := 'dollar';
        v_i := v_i + length(v_tag) - 1;
      end if;
    end if;
    v_i := v_i + 1;
  end loop;
  if v_state not in ('code', 'line') then
    return 'a comment or a quoted text does not end';
  end if;
  v_lines := string_to_array(array_to_string(v_chars, ''), E'\n');

  if v_lang = 'sql' then
    if rtrim(coalesce(v_lines[1], ''), E' \t') = ''
       and rtrim(coalesce(v_lines[2], ''), E' \t') = 'select public.require_active_caller();'
       and array_length(v_lines, 1) > 2 then
      return null;
    end if;
    return 'the guard is not the first statement';
  end if;

  select min(i) into v_first
  from generate_subscripts(v_lines, 1) i
  where v_lines[i] ~* '^[ \t]*begin[ \t]*$';
  select count(*) into v_col0
  from generate_subscripts(v_lines, 1) i
  where v_lines[i] ~* '^begin[ \t]*$';
  if v_first is null or v_col0 <> 1 or v_lines[v_first] !~* '^begin[ \t]*$' then
    return 'no single outer begin line';
  end if;
  if rtrim(coalesce(v_lines[v_first + 1], ''), E' \t') <> '  perform public.require_active_caller();' then
    return 'the guard is not the first statement';
  end if;
  v_declare := array_to_string(v_lines[1:v_first - 1], E'\n');
  if v_declare ~* '\mselect\M|\mperform\M|\mbegin\M' then
    return 'the declare part holds a query, a perform or another begin';
  end if;
  -- A default runs before the guard: only calls that read no table and nothing in public.
  for v_call in
    select lower(m[1]) from regexp_matches(v_declare, '([A-Za-z_][A-Za-z0-9_.]*)\s*\(', 'g') as m
  loop
    if v_call <> all (array['auth.uid', 'auth.role', 'coalesce', 'nullif', 'btrim', 'now', 'gen_random_uuid']) then
      return 'the declare part calls ' || v_call;
    end if;
  end loop;
  return null;
end;
$function$;

revoke all on function public.active_guard_problem(oid) from public, anon, authenticated, service_role;

comment on function public.active_guard_problem(oid) is
  'active_account_rule (S4-07): the one written test of "the guard is the first statement". Null when it holds; otherwise the reason. A8-06: every comment (-- and nested /* */) is blanked first, read as Postgres reads it, so a comment mark inside a quoted text is text; a comment or a quoted text that does not end fails. Then plpgsql: the line right after the earliest line that holds only "begin" (the single column-0 one) is "  perform public.require_active_caller();" (trailing blanks aside), and the DECLARE part above holds no query, no PERFORM, no other begin and no call but auth.uid, auth.role, coalesce, nullif, btrim, now and gen_random_uuid (a default runs before the guard). sql: the body''s first line is "select public.require_active_caller();" (trailing blanks aside). An argument default that holds a query or names public fails too. No client may call it.';

-- 6a. Every column of the guarded functions' pg_proc rows except the body, copied aside before they
--     are re-created; the proof (8) compares them.
create temp table active_account_rule_before on commit drop as
select p.oid as fn, p.oid::regprocedure::text as sig, public.function_shape(p.oid) as shape, p.prosrc as src
from pg_catalog.pg_proc p
where p.oid = any (array[
  'public.admin_open_reports_v2()',
  'public.admin_open_reports()',
  'public.client_job_stats(uuid)',
  'public.current_fee(timestamp with time zone)',
  'public.get_my_active_mode()',
  'public.get_my_profile()',
  'public.job_hotspots()',
  'public.job_offer_count(uuid)',
  'public.job_offer_counts(uuid[])',
  'public.jobs_in_cell(bigint,bigint)',
  'public.jobs_within_radius(double precision,double precision,double precision)',
  'public.my_payouts_on_their_way()',
  'public.my_payouts_status()',
  'public.my_pending_offers()',
  'public.quote_job_price(integer,timestamp with time zone)',
  'public.worker_job_stats(uuid)',
  'public.accept_legal_documents(jsonb)',
  'public.ban_user(uuid,uuid)',
  'public.cancel_job(uuid,text)',
  'public.create_job(text,text,public.job_category,text,integer,jsonb,double precision,double precision,jsonb,integer,integer,date,smallint,smallint,text,text,boolean)',
  'public.create_offer(integer,uuid,text,uuid,text,text,text,text,jsonb,jsonb,double precision,double precision,uuid)',
  'public.create_review(uuid,uuid,integer,text,jsonb,boolean)',
  'public.decline_offer(uuid)',
  'public.dismiss_report(uuid)',
  'public.drop_series_worker(uuid)',
  'public.job_payment_state(uuid)',
  'public.mark_direct_thread_read(uuid)',
  'public.mark_worker_arrival(uuid,text)',
  'public.open_job_dispute(uuid,text,text)',
  'public.profile_review_summaries(uuid[],text)',
  'public.profile_review_summary(uuid,text)',
  'public.profile_reviews(uuid,integer,integer,text)',
  'public.register_push_token(text,text)',
  'public.release_job_payment(uuid)',
  'public.report_running_late(uuid,integer)',
  'public.set_active_mode(text)',
  'public.start_job_series(uuid,text)',
  'public.stop_job_series(uuid)',
  'public.transition_job_status(uuid,text,jsonb,jsonb)',
  'public.unban_user(uuid)',
  'public.unsend_message(uuid)',
  'public.update_job_details(uuid,text,text,public.job_category,text,integer,jsonb,double precision,double precision,jsonb,integer,integer,date,smallint,smallint,text,text)',
  'public.update_my_profile(jsonb)',
  'public.withdraw_job_dispute(uuid)',
  'public.withdraw_offer(uuid)'
]::regprocedure[]::oid[]);

-- 6b. The guard in 45 functions (29 plpgsql, 16 sql): each function's definition as the
--     database held it after report_push, with one line added, and its grants and comment restated.

-- public.admin_open_reports_v2()
CREATE OR REPLACE FUNCTION public.admin_open_reports_v2()
 RETURNS TABLE(id uuid, reporter_id uuid, reported_id uuid, reporter_name text, reported_name text, reported_banned boolean, job_id uuid, job_title text, reason text, description text, status text, created_at timestamp with time zone, subject_kind text, subject_id uuid, subject_text text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
select public.require_active_caller();
  select
    r.id, r.reporter_id, r.reported_id,
    rp.full_name, rd.full_name, rd.banned,
    r.job_id, j.title,
    r.reason, r.description, r.status, r.created_at,
    r.subject_kind, r.subject_id,
    case r.subject_kind
      when 'review' then (select left(rv.comment, 200) from public.reviews rv where rv.id = r.subject_id)
      when 'message' then (select left(m.content, 200) from public.messages m where m.id = r.subject_id)
      when 'job' then (select left(sj.title, 200) from public.jobs sj where sj.id = r.subject_id)
    end
  from public.reports r
  left join public.profiles rp on rp.id = r.reporter_id
  left join public.profiles rd on rd.id = r.reported_id
  left join public.jobs j on j.id = r.job_id
  where public.current_user_is_admin()
  order by
    case when r.status = 'open' then 0 else 1 end,
    r.created_at desc;
$function$;

revoke all on function public.admin_open_reports_v2() from public, anon, authenticated, service_role;
grant execute on function public.admin_open_reports_v2() to authenticated;

comment on function public.admin_open_reports_v2() is
  'P2-8 (ban_switch): admin_open_reports()''s rows, for an ACTIVE admin only, plus the report''s subject: subject_kind, subject_id and subject_text (the first 200 characters of the reported review or message, or the reported job''s title; null for a profile or a portfolio item). Anyone else gets no rows.';

-- public.admin_open_reports()
CREATE OR REPLACE FUNCTION public.admin_open_reports()
 RETURNS TABLE(id uuid, reporter_id uuid, reported_id uuid, reporter_name text, reported_name text, reported_banned boolean, job_id uuid, job_title text, reason text, description text, status text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
select public.require_active_caller();
  select
    r.id, r.reporter_id, r.reported_id,
    rp.full_name, rd.full_name, rd.banned,
    r.job_id, j.title,
    r.reason, r.description, r.status, r.created_at
  from public.reports r
  left join public.profiles rp on rp.id = r.reporter_id
  left join public.profiles rd on rd.id = r.reported_id
  left join public.jobs j on j.id = r.job_id
  where exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  )
  order by
    case when r.status = 'open' then 0 else 1 end,
    r.created_at desc;
$function$;

revoke all on function public.admin_open_reports() from public, anon, authenticated, service_role;
grant execute on function public.admin_open_reports() to authenticated;

-- (no comment on public.admin_open_reports())

-- public.client_job_stats(uuid)
CREATE OR REPLACE FUNCTION public.client_job_stats(p_client_id uuid)
 RETURNS TABLE(posted bigint, completed bigint, cancelled bigint, cancelled_after_hire bigint, rehires bigint, would_again_yes bigint, would_again_total bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
select public.require_active_caller();
  select
    count(*) filter (where status <> 'draft'),
    count(*) filter (where status = 'completed'),
    count(*) filter (where status = 'cancelled'),
    count(*) filter (where status = 'cancelled' and assigned_worker_id is not null),
    -- D5: rehires — among this client's non-draft jobs that ever had a worker
    -- assigned, every job beyond a worker's first is a repeat hire.
    count(*) filter (where status <> 'draft' and assigned_worker_id is not null)
      - count(distinct assigned_worker_id) filter (where status <> 'draft' and assigned_worker_id is not null),
    (select count(*)
       from public.reviews r
       join public.jobs j on j.id = r.job_id
      where j.client_id = p_client_id
        and r.reviewee_id = p_client_id
        and r.would_again = true
        and public.review_is_revealed(r.job_id, r.reviewer_id, r.reviewee_id, r.created_at)),
    (select count(*)
       from public.reviews r
       join public.jobs j on j.id = r.job_id
      where j.client_id = p_client_id
        and r.reviewee_id = p_client_id
        and r.would_again is not null
        and public.review_is_revealed(r.job_id, r.reviewer_id, r.reviewee_id, r.created_at))
  from public.jobs
  where client_id = p_client_id;
$function$;

revoke all on function public.client_job_stats(uuid) from public, anon, authenticated, service_role;
grant execute on function public.client_job_stats(uuid) to authenticated;

comment on function public.client_job_stats(uuid) is
  'Counted (never estimated) posting history for any client — the JobDetail trust signal, and since R8a (D5) the worker''s look at a customer''s record before bidding: cancellations after a hire, repeat hires, and would-work-for-them-again over REVEALED customer-role reviews only. SECURITY DEFINER because the counts deliberately cover rows the viewer cannot read row-wise.';

-- public.current_fee(timestamp with time zone)
CREATE OR REPLACE FUNCTION public.current_fee(p_at timestamp with time zone DEFAULT now())
 RETURNS TABLE(id bigint, effective_from timestamp with time zone, customer_bps integer, worker_bps integer, worker_min_fee_cents integer, tip_customer_bps integer, tax_bps integer, cancel_fee_bps integer, cancel_fee_min_cents integer, cancel_fee_max_cents integer, tip_max_bps integer, tip_max_cents integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
select public.require_active_caller();
  select f.id, f.effective_from,
         f.customer_bps, f.worker_bps, f.worker_min_fee_cents, f.tip_customer_bps,
         f.tax_bps, f.cancel_fee_bps, f.cancel_fee_min_cents, f.cancel_fee_max_cents,
         f.tip_max_bps, f.tip_max_cents
  from public.fee_schedule f
  where f.effective_from <= p_at
  order by f.effective_from desc
  limit 1
$function$;

revoke all on function public.current_fee(timestamp with time zone) from public, anon, authenticated, service_role;
grant execute on function public.current_fee(timestamp with time zone) to authenticated, service_role;

comment on function public.current_fee(timestamp with time zone) is
  'The fee_schedule row in force at p_at (default now()) — every rate together, never one alone. A future-dated row does not apply until its effective_from.';

-- public.get_my_active_mode()
CREATE OR REPLACE FUNCTION public.get_my_active_mode()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
select public.require_active_caller();
  select coalesce(
    (select p.active_mode from public.profiles p where p.id = auth.uid()),
    'customer'
  );
$function$;

revoke all on function public.get_my_active_mode() from public, anon, authenticated, service_role;
grant execute on function public.get_my_active_mode() to authenticated;

-- (no comment on public.get_my_active_mode())

-- public.get_my_profile()
CREATE OR REPLACE FUNCTION public.get_my_profile()
 RETURNS SETOF public.profiles
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
select public.require_active_caller();
  select p.*
  from public.profiles p
  where p.id = auth.uid();
$function$;

revoke all on function public.get_my_profile() from public, anon, authenticated, service_role;
grant execute on function public.get_my_profile() to authenticated;

-- (no comment on public.get_my_profile())

-- public.job_hotspots()
CREATE OR REPLACE FUNCTION public.job_hotspots()
 RETURNS TABLE(ilat bigint, ilng bigint, cell_lat double precision, cell_lng double precision, job_count integer, categories jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
select public.require_active_caller();
  with params as (
    select
      0.27 / 69.0 as dlat,
      0.27 / (69.0 * cos(radians(40.7128))) as dlng
  ),
  cell_cats as (
    select
      floor(loc.lat / p.dlat)::bigint as ilat,
      floor(loc.lng / p.dlng)::bigint as ilng,
      j.category::text as category,
      count(*)::int as n
    from public.jobs j
    join public.job_locations loc on loc.job_id = j.id
    cross join params p
    where j.status = 'open'
      and j.visibility = 'open_market'
    group by 1, 2, 3
  )
  select
    cc.ilat,
    cc.ilng,
    (cc.ilat + 0.5) * p.dlat as cell_lat,
    (cc.ilng + 0.5) * p.dlng as cell_lng,
    sum(cc.n)::int as job_count,
    jsonb_object_agg(cc.category, cc.n) as categories
  from cell_cats cc
  cross join params p
  group by cc.ilat, cc.ilng, p.dlat, p.dlng;
$function$;

revoke all on function public.job_hotspots() from public, anon, authenticated, service_role;
grant execute on function public.job_hotspots() to authenticated;

comment on function public.job_hotspots() is
  'Aggregated open-market job counts per ~0.27mi grid cell. Returns NO individual job coordinates, and never covers direct/draft jobs.';

-- public.job_offer_count(uuid)
CREATE OR REPLACE FUNCTION public.job_offer_count(p_job_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
select public.require_active_caller();
  select coalesce(
    (select c.offer_count from public.job_offer_counts(array[p_job_id]) c),
    0
  );
$function$;

revoke all on function public.job_offer_count(uuid) from public, anon, authenticated, service_role;
grant execute on function public.job_offer_count(uuid) to authenticated;

comment on function public.job_offer_count(uuid) is
  'The bid count of one job, through job_offer_counts() and its rule (B17): 0 for a job the caller may not see, as for a job with no bids.';

-- public.job_offer_counts(uuid[])
CREATE OR REPLACE FUNCTION public.job_offer_counts(p_job_ids uuid[])
 RETURNS TABLE(job_id uuid, offer_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
select public.require_active_caller();
  select o.job_id, count(*)::int
  from public.job_offers o
  join public.jobs j on j.id = o.job_id
  where auth.uid() is not null
    and p_job_ids is not null
    and array_length(p_job_ids, 1) <= 200
    and o.job_id = any (p_job_ids)
    and o.offer_type = 'marketplace_bid'
    and o.parent_offer_id is null
    and (
      (j.status = 'open' and j.visibility = 'open_market')
      or j.client_id = auth.uid()
      or j.assigned_worker_id = auth.uid()
      or exists (
        select 1 from public.job_offers mine
        where mine.job_id = j.id
          and mine.worker_id = auth.uid()
      )
    )
  group by o.job_id;
$function$;

revoke all on function public.job_offer_counts(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.job_offer_counts(uuid[]) to authenticated;

comment on function public.job_offer_counts(uuid[]) is
  'Batched bid counts (root marketplace bids), B17: only for an open open-market job, or a job the caller owns, is hired on, or has an offer on. Any other id, and a job with no bids, is absent; the caller treats a missing id as zero. Capped at 200 ids so this cannot become a bulk scan.';

-- public.jobs_in_cell(bigint,bigint)
CREATE OR REPLACE FUNCTION public.jobs_in_cell(p_ilat bigint, p_ilng bigint)
 RETURNS TABLE(id uuid, client_id uuid, title text, description text, category text, location text, budget_cents integer, status text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
select public.require_active_caller();
  with params as (
    select
      0.27 / 69.0 as dlat,
      0.27 / (69.0 * cos(radians(40.7128))) as dlng
  )
  select
    j.id, j.client_id, j.title, j.description,
    j.category::text, j.location, j.budget_cents, j.status, j.created_at
  from public.jobs j
  join public.job_locations loc on loc.job_id = j.id
  cross join params p
  where j.status = 'open'
    and j.visibility = 'open_market'
    and floor(loc.lat / p.dlat)::bigint = p_ilat
    and floor(loc.lng / p.dlng)::bigint = p_ilng
  order by j.created_at desc;
$function$;

revoke all on function public.jobs_in_cell(bigint,bigint) from public, anon, authenticated, service_role;
grant execute on function public.jobs_in_cell(bigint,bigint) to authenticated;

comment on function public.jobs_in_cell(bigint,bigint) is
  'Open-market jobs within one hotspot grid cell, WITHOUT lat/lng. Never covers direct/draft jobs.';

-- public.jobs_within_radius(double precision,double precision,double precision)
CREATE OR REPLACE FUNCTION public.jobs_within_radius(p_lat double precision, p_lng double precision, p_radius_miles double precision)
 RETURNS TABLE(id uuid, client_id uuid, title text, description text, category text, location text, budget_cents integer, status text, created_at timestamp with time zone, photos jsonb, videos jsonb, distance_miles double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
select public.require_active_caller();
  with bounded as (
    select least(greatest(coalesce(nullif(p_radius_miles, 0), 25), 0.5), 3000)::double precision as radius_miles
  )
  select
    j.id, j.client_id, j.title, j.description,
    j.category::text, j.location, j.budget_cents, j.status, j.created_at,
    j.photos, j.videos,
    d.snapped_miles as distance_miles
  from public.jobs j
  join public.job_locations loc on loc.job_id = j.id
  cross join bounded b
  cross join lateral public.market_cell_centre(loc.lat, loc.lng) c
  cross join lateral (
    select greatest(
             0.5,
             round((2 * 3958.8 * asin(least(1, sqrt(
               sin(radians((c.lat - p_lat) / 2)) ^ 2
               + cos(radians(p_lat)) * cos(radians(c.lat))
                 * sin(radians((c.lng - p_lng) / 2)) ^ 2
             ))) * 2)::numeric, 0) / 2.0
           )::double precision as snapped_miles
  ) d
  where j.status = 'open'
    and j.visibility = 'open_market'
    and d.snapped_miles <= b.radius_miles
  order by d.snapped_miles asc, j.created_at desc, j.id asc;
$function$;

revoke all on function public.jobs_within_radius(double precision,double precision,double precision) from public, anon, authenticated, service_role;
grant execute on function public.jobs_within_radius(double precision,double precision,double precision) to authenticated;

comment on function public.jobs_within_radius(double precision,double precision,double precision) is
  'Open-market jobs within p_radius_miles of (p_lat, p_lng), nearest first, each measured to the centre of its 0.27-mile market cell (market_cell_centre, B2); the radius is clamped to 0.5..3000 miles (25 when absent). Never returns or measures raw stored coordinates, and never covers direct/draft jobs.';

-- public.my_payouts_on_their_way()
CREATE OR REPLACE FUNCTION public.my_payouts_on_their_way()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
select public.require_active_caller();
  select p.id
    from public.payments p
   where (p.payer_id = auth.uid() or p.payee_id = auth.uid())
     and public.payment_payout_on_its_way(p)
$function$;

revoke all on function public.my_payouts_on_their_way() from public, anon, authenticated, service_role;
grant execute on function public.my_payouts_on_their_way() to authenticated;

comment on function public.my_payouts_on_their_way() is
  'Codex R8-A1: the ids of the caller''s own payments (payer or payee, the rule of the RLS policy "parties view own payments") whose payout is on its way (payment_payout_on_its_way). Nothing else leaves: no reason, no other column, no other user''s row. lib/payments.ts fetchPayoutsOnTheirWay puts the answer on each row it reads; a failed read says less. authenticated only.';

-- public.my_payouts_status()
CREATE OR REPLACE FUNCTION public.my_payouts_status()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
select public.require_active_caller();
  select coalesce((select payouts_status from public.payment_accounts where user_id = auth.uid()), 'none')
$function$;

revoke all on function public.my_payouts_status() from public, anon, authenticated, service_role;
grant execute on function public.my_payouts_status() to authenticated;

comment on function public.my_payouts_status() is
  'The caller''s own payout state: none | action_needed | under_review | enabled. none when no payout account exists yet. Own row only; nothing else on payment_accounts is client-readable.';

-- public.my_pending_offers()
CREATE OR REPLACE FUNCTION public.my_pending_offers()
 RETURNS TABLE(id uuid, job_id uuid, offer_type text, thread_job_id uuid, direct_thread_id uuid, customer_id uuid, worker_id uuid, amount_cents integer, status text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
select public.require_active_caller();
  select
    o.id, o.job_id, o.offer_type::text,
    t.job_id, t.direct_thread_id,
    o.customer_id, o.worker_id, o.amount_cents, o.status::text, o.updated_at
  from public.job_offers o
  left join lateral (
    select m.job_id, m.direct_thread_id
    from public.messages m
    where m.job_offer_id = o.root_offer_id
      and m.request_event = 'created'
    order by m.created_at
    limit 1
  ) t on true
  where o.awaiting_id = auth.uid()
    and o.status = 'pending'
    and (o.expires_at is null or o.expires_at > now())
    and public.is_profile_active(o.author_id)
  order by o.updated_at desc;
$function$;

revoke all on function public.my_pending_offers() from public, anon, authenticated, service_role;
grant execute on function public.my_pending_offers() to authenticated;

-- (no comment on public.my_pending_offers())

-- public.quote_job_price(integer,timestamp with time zone)
CREATE OR REPLACE FUNCTION public.quote_job_price(p_amount_cents integer, p_at timestamp with time zone DEFAULT now())
 RETURNS TABLE(job_price_cents integer, customer_fee_cents integer, tax_cents integer, total_cents integer, worker_fee_cents integer, worker_receives_cents integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
select public.require_active_caller();
  with f as (select * from public.current_fee(p_at)),
  c as (
    select p_amount_cents as price,
           round(p_amount_cents::numeric * f.customer_bps / 10000)::integer as cfee,
           least(p_amount_cents, greatest(round(p_amount_cents::numeric * f.worker_bps / 10000)::integer, f.worker_min_fee_cents)) as wfee,
           f.tax_bps
    from f
  ),
  t as (
    select c.*, round((c.price::numeric + c.cfee) * c.tax_bps / 10000)::integer as tax from c
  )
  select t.price, t.cfee, t.tax, t.price + t.cfee + t.tax, t.wfee, t.price - t.wfee from t
$function$;

revoke all on function public.quote_job_price(integer,timestamp with time zone) from public, anon, authenticated, service_role;
grant execute on function public.quote_job_price(integer,timestamp with time zone) to authenticated, service_role;

comment on function public.quote_job_price(integer,timestamp with time zone) is
  'The only price arithmetic: job price, Brazos Protection (customer side), tax, the all-in total the customer pays, the worker-side fee and what the worker receives — at the schedule in force at p_at. B5 (20261112010000): products in numeric, exact to the cent up to the $100,000 ceiling.';

-- public.worker_job_stats(uuid)
CREATE OR REPLACE FUNCTION public.worker_job_stats(p_worker uuid)
 RETURNS TABLE(category text, job_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
select public.require_active_caller();
  select j.category::text, count(*)::int
  from public.jobs j
  where j.assigned_worker_id = p_worker
    and j.status = 'completed'
  group by j.category
  order by count(*) desc, j.category::text asc;
$function$;

revoke all on function public.worker_job_stats(uuid) from public, anon, authenticated, service_role;
grant execute on function public.worker_job_stats(uuid) to authenticated;

comment on function public.worker_job_stats(uuid) is
  'Completed job counts per category for one worker. Aggregate only — exposes no job rows.';

-- public.accept_legal_documents(jsonb)
CREATE OR REPLACE FUNCTION public.accept_legal_documents(p_documents jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_count integer := 0;
  v_doc jsonb;
  v_key text;
  v_version text;
begin
  perform public.require_active_caller();
  if v_user is null then
    raise exception 'Not signed in';
  end if;
  if p_documents is null or jsonb_typeof(p_documents) <> 'array' then
    raise exception 'Expected an array of documents';
  end if;

  for v_doc in select * from jsonb_array_elements(p_documents)
  loop
    v_key := v_doc->>'document';
    v_version := v_doc->>'version';

    if v_key is null or btrim(v_key) = '' then
      raise exception 'Document key missing';
    end if;
    if v_version is null or btrim(v_version) = '' then
      raise exception 'Document version missing';
    end if;

    insert into public.legal_acceptances (user_id, document, version)
    values (v_user, v_key, v_version)
    on conflict (user_id, document, version) do nothing;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

revoke all on function public.accept_legal_documents(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.accept_legal_documents(jsonb) to authenticated;

comment on function public.accept_legal_documents(jsonb) is
  'Records acceptance of one or more legal documents for the calling user, timestamped by the server clock.';

-- public.ban_user(uuid,uuid)
CREATE OR REPLACE FUNCTION public.ban_user(p_target uuid, p_report_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_job record;
  v_other uuid;
  v_jobs uuid[] := '{}';
  v_i integer;
begin
  perform public.require_active_caller();
  -- A3: only an ACTIVE admin.
  if not public.current_user_is_admin() then
    raise exception 'Only admins may ban users';
  end if;
  -- S4-10: never the caller's own account, never an admin account.
  if p_target = auth.uid()
     or exists (select 1 from public.profiles p where p.id = p_target and coalesce(p.is_admin, false)) then
    raise exception 'An admin account cannot be banned in the app.';
  end if;

  -- A8-02: the account lock, exclusive, before any row lock. An accept that names this account
  -- (accept_offer() takes it shared) waits for this ban, or this ban waits for that accept.
  perform public.lock_account(p_target, false);

  -- Every job of the account, locked next: delete_my_account()'s order (jobs, then payments).
  perform 1
  from public.jobs
  where client_id = p_target or assigned_worker_id = p_target
  order by id
  for update;

  -- A8-01 (Terms section 12): every unfinished job of the account is cancelled through the one cancel
  -- path's account_suspended mode, the account as actor: the customer's open, hired or started job,
  -- the worker's hired or started job. A draft or a done job is not touched. The money keeps its rule
  -- there (cancel_job_core()): a ban never claws back money that already has a direction.
  for v_job in
    select j.id, j.client_id, j.assigned_worker_id
    from public.jobs j
    where (j.client_id = p_target and j.status in ('open', 'assigned', 'in_progress'))
       or (j.assigned_worker_id = p_target and j.client_id is distinct from p_target
           and j.status in ('assigned', 'in_progress'))
    order by j.id
  loop
    perform public.cancel_job_core(v_job.id, 'account_suspended', p_target);
    v_other := case when v_job.client_id = p_target then v_job.assigned_worker_id else v_job.client_id end;
    if v_other is not null then
      v_jobs := v_jobs || v_job.id;
    end if;
  end loop;

  -- The offers still open on other people's jobs (the cancellations above settled the ones on the
  -- jobs they cancelled, through jobs_settle_offers_on_cancel), so no Accept waits on this account.
  perform public.settle_offers_of_suspended(p_target);

  -- B1: the profiles_ban_record_sign_in_phone trigger records the sign-in phone on this UPDATE.
  update public.profiles set banned = true where id = p_target;

  -- The thread line on each job this ban cancelled, as before. There's no system-sender concept in
  -- `messages`, so it is attributed to the banned user and lands as an INBOUND message for the
  -- person being told.
  for v_i in 1 .. coalesce(array_length(v_jobs, 1), 0) loop
    insert into public.messages (job_id, sender_id, content)
    values (
      v_jobs[v_i],
      p_target,
      'This job was cancelled automatically because this account was suspended by Brazos.'
    );
  end loop;

  -- No push reaches the banned person's devices.
  update public.push_tokens
     set active = false
   where user_id = p_target
     and active;

  if p_report_id is not null then
    update public.reports set status = 'actioned' where id = p_report_id;
  end if;
end;
$function$;

revoke all on function public.ban_user(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.ban_user(uuid,uuid) to authenticated;

comment on function public.ban_user(uuid,uuid) is
  'Admin only (an ACTIVE admin, current_user_is_admin(); A3); never an admin account, the caller''s own included (S4-10). ban_switch (S4-01): takes the account lock (lock_account, exclusive; A8-02), locks the account''s jobs, then (A8-01, Terms section 12) cancels every unfinished one through cancel_job_core() in its account_suspended mode, the account as actor: its open, hired or started jobs as customer and its hired or started jobs as worker are always cancelled, cancelled_at stamped, cancelled_by and cancel_reason null; a checkout never finished is voided as cancel_job() voids it, an undirected held payment is refunded in full (refund_reason account_suspended) except on its started job as customer, where the held row is left undirected for the operator (A11 review 2), and a payment that already has a direction keeps it (a ban never claws money back); the other party gets one jobs notice. Then its other pending offers are settled (settle_offers_of_suspended), then the account is banned (the profiles_ban_record_sign_in_phone trigger records the sign-in phone; B1), the thread on each cancelled job that has another party gets its line, its push tokens are switched off, and the report is actioned. No sign-in ban: auth.users is not touched.';

-- public.cancel_job(uuid,text)
CREATE OR REPLACE FUNCTION public.cancel_job(p_job_id uuid, p_reason text)
 RETURNS public.jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.require_active_caller();
  if auth.uid() is null or not public.is_active_user() then raise exception 'Active authentication required'; end if;
  -- A8-01: a caller passes only the three caller reasons; account_suspended is ban_user()'s own.
  if p_reason is null or p_reason not in ('customer_cancelled', 'worker_cancelled', 'customer_no_show') then
    raise exception 'Unknown cancellation reason';
  end if;
  return public.cancel_job_core(p_job_id, p_reason, auth.uid());
end $function$;

revoke all on function public.cancel_job(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.cancel_job(uuid,text) to authenticated;

comment on function public.cancel_job(uuid,text) is
  'The lifecycle exit. p_reason: customer_cancelled (the customer; free outside the window, within the 15-minute grace, or when the worker missed the window and never marked arrived, recorded as worker_no_show; otherwise the cancellation fee to the worker), worker_cancelled (the worker; full refund), customer_no_show (the worker, after arriving, once the window passed; a claim resolve_job_dispute decides). Terminal. ban_switch: the signed-in caller''s own cancel; the rules live in cancel_job_core(), with the caller as actor. Any other reason, account_suspended included, is refused with ''Unknown cancellation reason'' before the core.';

-- public.create_job(text,text,public.job_category,text,integer,jsonb,double precision,double precision,jsonb,integer,integer,date,smallint,smallint,text,text,boolean)
CREATE OR REPLACE FUNCTION public.create_job(p_title text, p_description text, p_category public.job_category, p_location text, p_budget_cents integer DEFAULT NULL::integer, p_photos jsonb DEFAULT '[]'::jsonb, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_videos jsonb DEFAULT '[]'::jsonb, p_budget_min_cents integer DEFAULT NULL::integer, p_budget_max_cents integer DEFAULT NULL::integer, p_scheduled_date date DEFAULT NULL::date, p_arrival_start_hour smallint DEFAULT NULL::smallint, p_arrival_end_hour smallint DEFAULT NULL::smallint, p_address_line text DEFAULT NULL::text, p_pricing_mode text DEFAULT 'open_bids'::text, p_needed_today boolean DEFAULT false)
 RETURNS public.jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_address text := nullif(btrim(coalesce(p_address_line, '')), '');
begin
  perform public.require_active_caller();
  if v_user is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  -- >>> post_window: no new post while posting is paused, and none for a day and window already over.
  if public.posting_paused() then
    raise exception 'Posting is paused right now. Please try again shortly.';
  end if;
  if public.job_window_over(p_scheduled_date, p_arrival_end_hour, now()) then
    raise exception 'That time has already passed. Pick a later window or another day.';
  end if;
  -- <<< post_window
  if length(btrim(coalesce(p_title, ''))) not between 1 and 80 then
    raise exception 'Title must be between 1 and 80 characters';
  end if;
  if length(btrim(coalesce(p_description, ''))) not between 1 and 500 then
    raise exception 'Description must be between 1 and 500 characters';
  end if;
  if length(btrim(coalesce(p_location, ''))) not between 1 and 200 then
    raise exception 'Location is required';
  end if;
  if p_budget_cents is not null and p_budget_cents <= 0 then
    raise exception 'Budget must be positive';
  end if;
  if (p_budget_min_cents is not null and p_budget_min_cents <= 0)
     or (p_budget_max_cents is not null and p_budget_max_cents <= 0) then
    raise exception 'Budget range values must be positive';
  end if;
  if p_budget_min_cents is not null and p_budget_max_cents is not null
     and p_budget_min_cents > p_budget_max_cents then
    raise exception 'Minimum budget cannot exceed maximum budget';
  end if;
  -- a3 (2026-09-05): the posting choice. An allow-list, never a block-list;
  -- a posted price is one amount and no range.
  if p_pricing_mode is null or p_pricing_mode not in ('open_bids', 'posted_price') then
    raise exception 'Pricing mode must be open_bids or posted_price';
  end if;
  if p_pricing_mode = 'posted_price' and (p_budget_cents is null or p_budget_cents <= 0) then
    raise exception 'A posted price needs an amount';
  end if;
  if p_pricing_mode = 'posted_price' and (p_budget_min_cents is not null or p_budget_max_cents is not null) then
    raise exception 'A posted price is one amount, not a range';
  end if;
  -- 10 photos per the screen-13 spec (was 5 before phase49).
  if jsonb_typeof(coalesce(p_photos, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_photos, '[]'::jsonb)) > 10 then
    raise exception 'Photos must be an array with at most 10 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) as photo(value)
    where jsonb_typeof(photo.value) <> 'string'
       or length(photo.value #>> '{}') > 2048
  ) then
    raise exception 'Each photo must be a valid URL or storage reference';
  end if;
  -- Server cap stays 2 (permissive superset) so already-installed builds that
  -- allow two clips keep working; the phase-4 UI itself offers one.
  if jsonb_typeof(coalesce(p_videos, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_videos, '[]'::jsonb)) > 2 then
    raise exception 'Videos must be an array with at most 2 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_videos, '[]'::jsonb)) as video(value)
    where jsonb_typeof(video.value) <> 'string'
       or length(video.value #>> '{}') > 2048
  ) then
    raise exception 'Each video must be a valid URL or storage reference';
  end if;
  if (p_lat is null) <> (p_lng is null)
     or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180)) then
    raise exception 'Coordinates are invalid';
  end if;
  if (p_arrival_start_hour is null) <> (p_arrival_end_hour is null) then
    raise exception 'Arrival window needs both a start and an end';
  end if;
  if p_arrival_start_hour is not null
     and (p_arrival_start_hour not between 0 and 23
          or p_arrival_end_hour not between 1 and 24
          or p_arrival_start_hour >= p_arrival_end_hour) then
    raise exception 'Arrival window hours are invalid';
  end if;
  if v_address is not null and length(v_address) > 200 then
    raise exception 'Address must be at most 200 characters';
  end if;

  insert into public.jobs (
    client_id, title, description, category, location,
    budget_cents, budget_min_cents, budget_max_cents,
    pricing_mode,
    needed_today,
    scheduled_date, arrival_start_hour, arrival_end_hour,
    photos, videos, status
  )
  values (
    v_user, btrim(p_title), btrim(p_description), p_category, btrim(p_location),
    -- Legacy single-budget mirror: the range's ceiling, so every pre-range
    -- reader (including the locked Worker Home) shows a real, stated number.
    coalesce(p_budget_max_cents, p_budget_min_cents, p_budget_cents),
    p_budget_min_cents, p_budget_max_cents,
    p_pricing_mode,
    -- Idea 12: the customer's own "Need it today"; a null from any caller reads as no.
    coalesce(p_needed_today, false),
    p_scheduled_date, p_arrival_start_hour, p_arrival_end_hour,
    coalesce(p_photos, '[]'::jsonb), coalesce(p_videos, '[]'::jsonb), 'open'
  )
  returning * into v_job;

  -- The job_locations insert fires the nearby alert (notify_on_job_location), which reads the
  -- row above — needed_today included — inside this same transaction.
  if p_lat is not null or v_address is not null then
    insert into public.job_locations (job_id, lat, lng, address_line)
    values (v_job.id, p_lat, p_lng, v_address);
  end if;

  return v_job;
end;
$function$;

revoke all on function public.create_job(text,text,public.job_category,text,integer,jsonb,double precision,double precision,jsonb,integer,integer,date,smallint,smallint,text,text,boolean) from public, anon, authenticated, service_role;
grant execute on function public.create_job(text,text,public.job_category,text,integer,jsonb,double precision,double precision,jsonb,integer,integer,date,smallint,smallint,text,text,boolean) to authenticated;

comment on function public.create_job(text,text,public.job_category,text,integer,jsonb,double precision,double precision,jsonb,integer,integer,date,smallint,smallint,text,text,boolean) is
  'Posts a job for the signed-in caller (SECURITY DEFINER; authenticated only). a3 (2026-09-05): p_pricing_mode is the posting choice (open_bids or posted_price). Idea 12 (2026-09-30, docs/DECISIONS.md entry (1)): p_needed_today, last and defaulted to false, is the customer''s "Need it today"; nearby workers'' alert then says so. The fifteen- and sixteen-name calls installed builds send resolve here; migration 20260930000600 replaced the sixteen-parameter identity so PostgREST sees one overload. post_window: refused while posting is paused (posting_paused) and for a day and window already over (job_window_over).';

-- public.create_offer(integer,uuid,text,uuid,text,text,text,text,jsonb,jsonb,double precision,double precision,uuid)
CREATE OR REPLACE FUNCTION public.create_offer(p_amount_cents integer, p_job_id uuid DEFAULT NULL::uuid, p_message text DEFAULT NULL::text, p_worker_id uuid DEFAULT NULL::uuid, p_title text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_location text DEFAULT NULL::text, p_photos jsonb DEFAULT '[]'::jsonb, p_videos jsonb DEFAULT '[]'::jsonb, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_thread_job_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_customer uuid;
  v_worker uuid;
  v_type public.offer_type;
  v_target_job uuid;
  v_awaiting uuid;
  v_offer_id uuid := gen_random_uuid();
  v_thread uuid;
  v_direct uuid;
  v_stale public.job_offers;
begin
  perform public.require_active_caller();
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Enter an amount greater than zero';
  end if;
  if p_job_id is not null and p_worker_id is not null then
    raise exception 'Send either a bid on a job or an offer to a worker, not both';
  end if;
  if length(coalesce(p_message, '')) > 500 then
    raise exception 'Message is too long';
  end if;
  -- >>> post_window: a direct offer makes a new job (its draft), so it waits while posting is paused.
  if p_job_id is null and public.posting_paused() then
    raise exception 'Posting is paused right now. Please try again shortly.';
  end if;
  -- <<< post_window

  if p_job_id is not null then
    ---------------------------------------------------------------- marketplace
    select * into v_job from public.jobs where id = p_job_id for share;
    if not found
       or v_job.status <> 'open'
       or v_job.visibility <> 'open_market' then
      raise exception 'Job is not open';
    end if;
    if v_job.client_id = v_actor then
      raise exception 'A client cannot bid on their own job';
    end if;
    if public.is_blocked_between(v_actor, v_job.client_id) then
      raise exception 'Bid is not allowed';
    end if;
    -- B11: the bidder is the worker of the offer; a worker who cannot be paid cannot bid.
    if not public.worker_payouts_ready(v_actor) then
      raise exception 'Finish payout set-up before you send an offer. Open Profile, then Earnings & payouts.';
    end if;

    -- Phase 50: a lapsed previous chain must not block the re-bid the
    -- one-active-chain rule promises. Flip it before the unique index sees
    -- the new root.
    for v_stale in
      select * from public.job_offers o
      where o.job_id = p_job_id and o.worker_id = v_actor
        and o.status = 'pending'
        and o.expires_at is not null and o.expires_at <= now()
      for update
    loop
      perform public.expire_offer_if_stale(v_stale);
    end loop;

    v_type := 'marketplace_bid';
    v_target_job := v_job.id;
    v_customer := v_job.client_id;
    v_worker := v_actor;
    v_awaiting := v_job.client_id;

    -- >>> phase61: the chain's thread identity. The pair thread already
    -- exists (phase52's trigger), so this is a get-or-create lookup, not a
    -- new thread population. v_thread stays NULL: see the header for why a
    -- marketplace chain must NOT bind to a job thread.
    v_direct := public.ensure_direct_thread(v_customer, v_worker);
    -- <<< phase61

  else
    -------------------------------------------------------------- direct offer
    if p_worker_id is null then
      raise exception 'Choose a worker to send this offer to';
    end if;
    if p_worker_id = v_actor then
      raise exception 'You cannot send an offer to yourself';
    end if;
    if not exists (select 1 from public.profiles p where p.id = p_worker_id) then
      raise exception 'That person is no longer available';
    end if;
    if not public.job_request_parties_ok(v_actor, p_worker_id) then
      raise exception 'This offer cannot be sent';
    end if;
    if length(btrim(coalesce(p_title, ''))) not between 1 and 80 then
      raise exception 'Title must be between 1 and 80 characters';
    end if;
    if length(btrim(coalesce(p_description, ''))) > 500 then
      raise exception 'Description must be 500 characters or fewer';
    end if;
    if p_category is null then
      raise exception 'Choose a category';
    end if;
    if jsonb_typeof(coalesce(p_photos, '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(p_photos, '[]'::jsonb)) > 5 then
      raise exception 'Photos must be an array with at most 5 entries';
    end if;
    if exists (
      select 1 from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) as photo(value)
      where jsonb_typeof(photo.value) <> 'string' or length(photo.value #>> '{}') > 2048
    ) then
      raise exception 'Each photo must be a valid URL or storage reference';
    end if;
    if jsonb_typeof(coalesce(p_videos, '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(p_videos, '[]'::jsonb)) > 2 then
      raise exception 'Videos must be an array with at most 2 entries';
    end if;
    if exists (
      select 1 from jsonb_array_elements(coalesce(p_videos, '[]'::jsonb)) as video(value)
      where jsonb_typeof(video.value) <> 'string' or length(video.value #>> '{}') > 2048
    ) then
      raise exception 'Each video must be a valid URL or storage reference';
    end if;
    if (p_lat is null) <> (p_lng is null)
       or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180)) then
      raise exception 'Coordinates are invalid';
    end if;

    -- Phase 50: same lapsed-chain sweep for the per-pair direct cap.
    for v_stale in
      select * from public.job_offers o
      where o.customer_id = v_actor and o.worker_id = p_worker_id
        and o.offer_type = 'direct_offer'
        and o.status = 'pending'
        and o.expires_at is not null and o.expires_at <= now()
      for update
    loop
      perform public.expire_offer_if_stale(v_stale);
    end loop;

    v_type := 'direct_offer';
    v_customer := v_actor;
    v_worker := p_worker_id;
    v_awaiting := p_worker_id;

    v_target_job := gen_random_uuid();
    insert into public.jobs (
      id, client_id, title, description, category, location,
      budget_cents, status, visibility, photos, videos
    )
    values (
      v_target_job, v_actor, btrim(p_title), coalesce(btrim(p_description), ''),
      p_category::public.job_category, p_location,
      p_amount_cents, 'draft'::public.job_status, 'direct'::public.job_visibility,
      coalesce(p_photos, '[]'::jsonb), coalesce(p_videos, '[]'::jsonb)
    );

    if p_lat is not null then
      insert into public.job_locations (job_id, lat, lng)
      values (v_target_job, p_lat, p_lng);
    end if;

    if p_thread_job_id is not null then
      select j.id into v_thread
      from public.jobs j
      where j.id = p_thread_job_id
        and j.client_id = v_actor
        and j.assigned_worker_id = p_worker_id;
    end if;
    if v_thread is null then
      select j.id into v_thread
      from public.jobs j
      where j.client_id = v_actor
        and j.assigned_worker_id = p_worker_id
        and j.status = 'completed'
      order by j.created_at desc
      limit 1;
    end if;
    if v_thread is null then
      v_direct := public.ensure_direct_thread(v_actor, p_worker_id);
    end if;
  end if;

  insert into public.job_offers (
    id, job_id, offer_type, parent_offer_id, root_offer_id,
    customer_id, worker_id, author_id, awaiting_id,
    amount_cents, message, status
  )
  values (
    v_offer_id, v_target_job, v_type, null, v_offer_id,
    v_customer, v_worker, v_actor, v_awaiting,
    p_amount_cents, nullif(btrim(coalesce(p_message, '')), ''), 'pending'
  );

  -- >>> phase61: was `if v_type = 'direct_offer' then` — the root message is
  -- what gives a chain its thread identity, and both kinds need one now.
  -- Exactly one of v_thread / v_direct is set on either path, which is what
  -- the messages_one_thread XOR constraint (phase36:87-98) requires.
  insert into public.messages (
    job_id, direct_thread_id, sender_id, content,
    job_offer_id, request_event, request_amount_cents
  )
  values (v_thread, v_direct, v_actor, '', v_offer_id, 'created', p_amount_cents);
  -- <<< phase61

  return v_offer_id;
exception
  when unique_violation then
    raise exception 'You already have a live offer open here. Settle it before sending another.';
end;
$function$;

revoke all on function public.create_offer(integer,uuid,text,uuid,text,text,text,text,jsonb,jsonb,double precision,double precision,uuid) from public, anon, authenticated, service_role;
grant execute on function public.create_offer(integer,uuid,text,uuid,text,text,text,text,jsonb,jsonb,double precision,double precision,uuid) to authenticated;

-- (no comment on public.create_offer(integer,uuid,text,uuid,text,text,text,text,jsonb,jsonb,double precision,double precision,uuid))

-- public.create_review(uuid,uuid,integer,text,jsonb,boolean)
CREATE OR REPLACE FUNCTION public.create_review(p_job_id uuid, p_reviewee_id uuid, p_rating integer, p_comment text DEFAULT NULL::text, p_photos jsonb DEFAULT '[]'::jsonb, p_would_again boolean DEFAULT NULL::boolean)
 RETURNS public.reviews
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_review public.reviews;
  v_photos jsonb := coalesce(p_photos, '[]'::jsonb);
begin
  perform public.require_active_caller();
  select * into v_job from public.jobs where id = p_job_id;
  if not found or v_job.status <> 'completed' then
    raise exception 'Completed job not found';
  end if;
  -- D2 (R8a): 30 days from completion to write. NULL completed_at (legacy
  -- rows) enforces no window. A separate clock from the D1 blind window.
  if v_job.completed_at is not null and now() > v_job.completed_at + interval '30 days' then
    raise exception 'Review window has closed';
  end if;
  if v_user is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if not (
    (v_job.client_id = v_user and p_reviewee_id = v_job.assigned_worker_id)
    or (v_job.assigned_worker_id = v_user and p_reviewee_id = v_job.client_id)
  ) then
    raise exception 'Review parties are invalid';
  end if;
  if p_rating not between 1 and 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;
  if length(coalesce(p_comment, '')) > 1000 then
    raise exception 'Review comment is too long';
  end if;
  if jsonb_typeof(v_photos) <> 'array' or jsonb_array_length(v_photos) > 5 then
    raise exception 'Reviews can carry at most 5 photos';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_photos) as photo(value)
    where jsonb_typeof(photo.value) <> 'string'
       or length(photo.value #>> '{}') > 2048
  ) then
    raise exception 'Each review photo must be a valid URL or storage reference';
  end if;

  insert into public.reviews (
    job_id, reviewer_id, reviewee_id, rating, comment, photos, would_again
  )
  values (
    p_job_id, v_user, p_reviewee_id, p_rating, nullif(btrim(p_comment), ''), v_photos, p_would_again
  )
  returning * into v_review;

  return v_review;
end;
$function$;

revoke all on function public.create_review(uuid,uuid,integer,text,jsonb,boolean) from public, anon, authenticated, service_role;
grant execute on function public.create_review(uuid,uuid,integer,text,jsonb,boolean) to authenticated;

-- (no comment on public.create_review(uuid,uuid,integer,text,jsonb,boolean))

-- public.decline_offer(uuid)
CREATE OR REPLACE FUNCTION public.decline_offer(p_offer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_offer public.job_offers;
begin
  perform public.require_active_caller();
  if v_actor is null then
    raise exception 'Not signed in';
  end if;

  select * into v_offer from public.job_offers where id = p_offer_id for update;
  if not found or v_actor not in (v_offer.customer_id, v_offer.worker_id) then
    raise exception 'Offer not found';
  end if;
  if v_offer.status = 'declined' then
    return;
  end if;
  -- Phase 50: declining a lapsed offer records expired — the truthful outcome
  -- — and returns without error; "make this go away" is satisfied either way.
  if public.expire_offer_if_stale(v_offer) then
    return;
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'This offer is no longer open';
  end if;
  if v_offer.awaiting_id is distinct from v_actor then
    raise exception 'It is not your turn to respond to this offer';
  end if;

  update public.job_offers
     set status = 'declined', awaiting_id = null, updated_at = now()
   where id = p_offer_id;

  perform public.offer_post_event(
    p_offer_id, v_offer.root_offer_id, v_actor, 'declined', v_offer.amount_cents
  );
end;
$function$;

revoke all on function public.decline_offer(uuid) from public, anon, authenticated, service_role;
grant execute on function public.decline_offer(uuid) to authenticated;

-- (no comment on public.decline_offer(uuid))

-- public.dismiss_report(uuid)
CREATE OR REPLACE FUNCTION public.dismiss_report(p_report_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.require_active_caller();
  if not public.current_user_is_admin() then
    raise exception 'Only admins may dismiss reports';
  end if;

  update public.reports
     set status = 'dismissed'
   where id = p_report_id
     and status = 'open';
  return found;
end;
$function$;

revoke all on function public.dismiss_report(uuid) from public, anon, authenticated, service_role;
grant execute on function public.dismiss_report(uuid) to authenticated;

comment on function public.dismiss_report(uuid) is
  'P2-8 (ban_switch): an ACTIVE admin dismisses a report that is still open. True when it dismissed it now; false when the report was not open (already dismissed, actioned, or no such report).';

-- public.drop_series_worker(uuid)
CREATE OR REPLACE FUNCTION public.drop_series_worker(p_series_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_series public.job_series;
  v_latest uuid;
  v_title text;
begin
  perform public.require_active_caller();
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  select * into v_series from public.job_series where id = p_series_id;
  if not found or v_series.worker_id is distinct from v_actor then
    raise exception 'Repeat not found';
  end if;
  -- LOCK ORDER: the visit on offer (jobs), then the series.
  if v_series.pending_job_id is not null then
    perform 1 from public.jobs where id = v_series.pending_job_id for update;
  end if;
  select * into v_series from public.job_series where id = p_series_id for update;
  if v_series.worker_id is distinct from v_actor then
    return;
  end if;
  if v_series.pending_job_id is not null then
    -- The decline's own thread event stays quiet: the customer is told below, in words.
    perform set_config('brazos.series_quiet', 'on', true);
    perform public.series_close_offers(v_series.pending_job_id, v_actor);
    perform set_config('brazos.series_quiet', 'off', true);
  end if;
  update public.job_series
     set worker_id = null,
         price_cents = null,
         -- Every worker who ever dropped the series, so none of them is enrolled again by a later hire.
         dropped_worker_ids = array_append(array_remove(dropped_worker_ids, v_actor), v_actor),
         updated_at = now()
   where id = p_series_id;

  -- The customer: the next visits will open to bids.
  if v_series.status = 'active' then
    -- An allow-list of the statuses a customer's job screen shows (a draft is an offer, not a job).
    select j.id, j.title into v_latest, v_title
    from public.jobs j
    where j.series_id = p_series_id and j.status in ('open', 'assigned', 'in_progress', 'completed')
    order by j.created_at desc
    limit 1;
    perform public.enqueue_notification(
      v_series.client_id,
      v_actor,
      'job_updates',
      'series_worker_dropped',
      coalesce(nullif(split_part(btrim(public.notify_display_name(v_actor)), ' ', 1), ''), 'Your worker')
        || ' won''t take future visits',
      coalesce(left(v_title, 60) || ' · ', '') || 'The next visits open to bids.',
      jsonb_build_object('screen', 'ClientJobDetail', 'jobId', coalesce(v_latest, v_series.origin_job_id)::text),
      'series_worker_dropped:' || p_series_id::text || ':' || v_actor::text
    );
  end if;
end;
$function$;

revoke all on function public.drop_series_worker(uuid) from public, anon, authenticated, service_role;
grant execute on function public.drop_series_worker(uuid) to authenticated;

comment on function public.drop_series_worker(uuid) is
  'Idea 14: the series'' worker drops its future visits; a first refusal still pending is declined (or their counter withdrawn), the next visits open to bids, and the customer is told. Visits already hired stay hired. SECURITY DEFINER; authenticated only.';

-- public.job_payment_state(uuid)
CREATE OR REPLACE FUNCTION public.job_payment_state(p_job_id uuid)
 RETURNS public.payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_payment public.payments;
begin
  perform public.require_active_caller();
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  select * into v_job from public.jobs where id = p_job_id;
  if not found or (v_job.client_id <> v_actor
                   and v_job.assigned_worker_id is distinct from v_actor) then
    raise exception 'Job not found';
  end if;

  select * into v_payment
  from public.payments
  where job_id = p_job_id and kind = 'job_payment'
    and status not in ('failed', 'voided')
  for update;
  if not found then
    return null;
  end if;

  -- B17: only the 26 columns a party may read leave this function.
  return public.payment_for_party(v_payment);
end;
$function$;

revoke all on function public.job_payment_state(uuid) from public, anon, authenticated, service_role;
grant execute on function public.job_payment_state(uuid) to authenticated;

comment on function public.job_payment_state(uuid) is
  'The job''s active job_payment row for its two parties, read-only; its 72h clock is auto_release_due_payments(). NULL when checkout never ran. B17 (20261112010800): the columns authenticated may not select are returned null.';

-- public.mark_direct_thread_read(uuid)
CREATE OR REPLACE FUNCTION public.mark_direct_thread_read(p_thread_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
begin
  perform public.require_active_caller();
  if v_user is null then
    raise exception 'Not signed in';
  end if;

  update public.direct_threads
     set user_a_read_at = case when user_a = v_user then now() else user_a_read_at end,
         user_b_read_at = case when user_b = v_user then now() else user_b_read_at end
   where id = p_thread_id
     and (user_a = v_user or user_b = v_user);
end;
$function$;

revoke all on function public.mark_direct_thread_read(uuid) from public, anon, authenticated, service_role;
grant execute on function public.mark_direct_thread_read(uuid) to authenticated;

-- (no comment on public.mark_direct_thread_read(uuid))

-- public.mark_worker_arrival(uuid,text)
CREATE OR REPLACE FUNCTION public.mark_worker_arrival(p_job_id uuid, p_step text)
 RETURNS public.jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
begin
  perform public.require_active_caller();
  if v_user is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  -- trip_day (A7-02): a null step is refused too (null passes "not in" and would skip the checks).
  if p_step is null or p_step not in ('en_route', 'arrived') then
    raise exception 'Unknown arrival step';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.assigned_worker_id is distinct from v_user then
    raise exception 'Job not found or not assigned to caller';
  end if;
  if v_job.status <> 'assigned' then
    raise exception 'Arrival can only be marked before the job is started';
  end if;

  -- >>> trip_day: a step that would write a new time needs the start's money rule, then the job's
  -- own day (the start's order). A step already marked returns the row unchanged, below.
  if (p_step = 'en_route' and v_job.en_route_at is null)
     or (p_step = 'arrived' and v_job.arrived_at is null) then
    perform public.require_work_money(p_job_id);
    if not public.job_day_reached(v_job.scheduled_date, now()) then
      raise exception 'This job is booked for %; the trip and the start open on that day.',
        to_char(v_job.scheduled_date, 'FMDay, FMMonth FMDD');
    end if;
  end if;
  -- <<< trip_day

  update public.jobs
     set en_route_at = coalesce(en_route_at, now()),
         arrived_at = case
           when p_step = 'arrived' then coalesce(arrived_at, now())
           else arrived_at
         end
   where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$function$;

revoke all on function public.mark_worker_arrival(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.mark_worker_arrival(uuid,text) to authenticated;

comment on function public.mark_worker_arrival(uuid,text) is
  'The assigned worker declares en_route or arrived on an assigned job. Monotonic + idempotent: timestamps are set once, never cleared; arrived backfills en_route. No live location exists anywhere. trip_day: a step that writes a new time needs the start''s money rule (require_work_money) and the job''s own New York day (job_day_reached).';

-- public.open_job_dispute(uuid,text,text)
CREATE OR REPLACE FUNCTION public.open_job_dispute(p_job_id uuid, p_reason text, p_details text DEFAULT NULL::text)
 RETURNS public.job_disputes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_payment public.payments;
  v_dispute public.job_disputes;
begin
  perform public.require_active_caller();
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if p_reason is null or p_reason not in
     ('not_as_described', 'incomplete', 'damage', 'no_show', 'other') then
    raise exception 'Unknown issue reason';
  end if;
  if p_details is not null and length(p_details) > 2000 then
    raise exception 'Issue details are limited to 2000 characters';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then
    raise exception 'Job not found';
  end if;
  if v_job.status <> 'completed' then
    raise exception 'An issue can be reported once the work is submitted as complete';
  end if;

  -- Idempotent-ish: an already-open report is returned rather than doubled.
  select * into v_dispute
  from public.job_disputes
  where job_id = p_job_id and status = 'open';
  if found then
    return v_dispute;
  end if;

  -- The freeze only means something while the money is still holdable.
  select * into v_payment
  from public.payments
  where job_id = p_job_id and kind = 'job_payment'
    and status not in ('failed', 'voided')
  for update;
  if found and v_payment.status in ('released', 'paid_out') then
    raise exception 'This payment was already released and can no longer be held';
  end if;
  if found and public.payment_transfer_unconfirmed(v_payment) then
    raise exception 'This payment is already on its way to the worker and can no longer be held';
  end if;

  insert into public.job_disputes (job_id, payment_id, opened_by, reason, details)
  values (p_job_id, v_payment.id, v_actor, p_reason::public.dispute_reason, p_details)
  returning * into v_dispute;

  return v_dispute;
exception
  when unique_violation then
    select * into v_dispute
    from public.job_disputes
    where job_id = p_job_id and status = 'open';
    return v_dispute;
end;
$function$;

revoke all on function public.open_job_dispute(uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.open_job_dispute(uuid,text,text) to authenticated;

comment on function public.open_job_dispute(uuid,text,text) is
  'The customer reports an issue on a completed job, freezing release (manual and auto) while it stays open. One open report per job; a second call returns the existing one. Refused once the payment has released.';

-- public.profile_review_summaries(uuid[],text)
CREATE OR REPLACE FUNCTION public.profile_review_summaries(p_users uuid[], p_role text DEFAULT 'worker'::text)
 RETURNS TABLE(user_id uuid, total integer, average numeric, five integer, four integer, three integer, two integer, one integer, shown_average numeric, is_new boolean, completed_jobs integer, on_time_pct numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_m numeric;
begin
  perform public.require_active_caller();
  if p_role not in ('worker', 'customer') then
    raise exception 'Role must be worker or customer';
  end if;
  -- D4: the platform prior m — the average rating over ALL revealed reviews
  -- of this role, anyone's; 4.5 when the platform has none yet. Computed once
  -- per call: profile_review_summary's query, verbatim.
  select avg(r.rating)::numeric into v_m
  from public.reviews r
  join public.jobs j on j.id = r.job_id
  where public.review_is_revealed(r.job_id, r.reviewer_id, r.reviewee_id, r.created_at)
    and case p_role
          when 'worker' then j.assigned_worker_id = r.reviewee_id
          else j.client_id = r.reviewee_id
        end;
  v_m := coalesce(v_m, 4.5);

  return query
  select
    u.id,
    -- count(rv.rating), not count(*): a LEFT JOIN row with no review counts 0.
    count(rv.rating)::integer,
    round(avg(rv.rating)::numeric, 2),
    count(rv.rating) filter (where rv.rating = 5)::integer,
    count(rv.rating) filter (where rv.rating = 4)::integer,
    count(rv.rating) filter (where rv.rating = 3)::integer,
    count(rv.rating) filter (where rv.rating = 2)::integer,
    count(rv.rating) filter (where rv.rating = 1)::integer,
    -- D4: shrinkage toward the prior with weight 5 — (5m + sum) / (5 + n).
    (5 * v_m + coalesce(sum(rv.rating), 0)) / (5 + count(rv.rating)),
    count(rv.rating) < 3,
    -- completed_jobs: worker_job_stats' predicate (worker role) and
    -- client_job_stats' completed predicate (customer role), verbatim, so the
    -- three never disagree.
    (select count(*)::integer
       from public.jobs j
      where case p_role
              when 'worker' then j.assigned_worker_id = u.id
              else j.client_id = u.id
            end
        and j.status = 'completed'),
    -- on_time_pct: the profile column as it stands; null is unknown.
    (select p.on_time_pct from public.profiles p where p.id = u.id)
  from (select distinct x as id from unnest(p_users) as x) u
  -- The single's WHERE (r8a lines 277-285) with r.reviewee_id = u.id and the
  -- same auth.uid() guard, as a lateral so each id joins only its own rows.
  left join lateral (
    select r.rating
    from public.reviews r
    join public.jobs j on j.id = r.job_id
    where r.reviewee_id = u.id
      and auth.uid() is not null
      and public.review_is_revealed(r.job_id, r.reviewer_id, r.reviewee_id, r.created_at)
      and case p_role
            when 'worker' then j.assigned_worker_id = r.reviewee_id
            else j.client_id = r.reviewee_id
          end
  ) rv on true
  group by u.id
  order by u.id;
end;
$function$;

revoke all on function public.profile_review_summaries(uuid[],text) from public, anon, authenticated, service_role;
grant execute on function public.profile_review_summaries(uuid[],text) to authenticated;

comment on function public.profile_review_summaries(uuid[],text) is
  'n6: the batch form of profile_review_summary for list surfaces (compare bids, worker search, saved workers, search scoring) — one row per distinct id in p_users, ordered by user_id. Same visibility (any signed-in user; refused to anon), same reveal rule (review_is_revealed: counterpart written or 7 days old), same shrinkage — shown_average = (5m + sum)/(5 + n) with m the platform-wide revealed average for the role, 4.5 when the platform has none — and the same is_new under three revealed reviews. completed_jobs (worker_job_stats'' predicate for the worker role, client_job_stats'' completed predicate for the customer role) and on_time_pct (profiles.on_time_pct; null when unknown, never zero) ride along so the client makes one call per list.';

-- public.profile_review_summary(uuid,text)
CREATE OR REPLACE FUNCTION public.profile_review_summary(p_user uuid, p_role text DEFAULT 'worker'::text)
 RETURNS TABLE(total integer, average numeric, five integer, four integer, three integer, two integer, one integer, shown_average numeric, is_new boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_m numeric;
begin
  perform public.require_active_caller();
  if p_role not in ('worker', 'customer') then
    raise exception 'Role must be worker or customer';
  end if;
  -- D4: the platform prior m — the average rating over ALL revealed reviews
  -- of this role, anyone's; 4.5 when the platform has none yet.
  select avg(r.rating)::numeric into v_m
  from public.reviews r
  join public.jobs j on j.id = r.job_id
  where public.review_is_revealed(r.job_id, r.reviewer_id, r.reviewee_id, r.created_at)
    and case p_role
          when 'worker' then j.assigned_worker_id = r.reviewee_id
          else j.client_id = r.reviewee_id
        end;
  v_m := coalesce(v_m, 4.5);

  return query
  select
    count(*)::integer,
    round(avg(r.rating)::numeric, 2),
    count(*) filter (where r.rating = 5)::integer,
    count(*) filter (where r.rating = 4)::integer,
    count(*) filter (where r.rating = 3)::integer,
    count(*) filter (where r.rating = 2)::integer,
    count(*) filter (where r.rating = 1)::integer,
    -- D4: shrinkage toward the prior with weight 5 — (5m + sum) / (5 + n).
    (5 * v_m + coalesce(sum(r.rating), 0)) / (5 + count(*)),
    count(*) < 3
  from public.reviews r
  join public.jobs j on j.id = r.job_id
  where r.reviewee_id = p_user
    and auth.uid() is not null
    and public.review_is_revealed(r.job_id, r.reviewer_id, r.reviewee_id, r.created_at)
    and case p_role
          when 'worker' then j.assigned_worker_id = r.reviewee_id
          else j.client_id = r.reviewee_id
        end;
end;
$function$;

revoke all on function public.profile_review_summary(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.profile_review_summary(uuid,text) to authenticated;

comment on function public.profile_review_summary(uuid,text) is
  'D4 (R8a): the rating header over REVEALED reviews of one role. shown_average = (5m + sum)/(5 + n) with m the platform-wide revealed average for that role (4.5 when the platform has none); is_new under three revealed reviews. average stays the raw per-user mean the distribution below it explains.';

-- public.profile_reviews(uuid,integer,integer,text)
CREATE OR REPLACE FUNCTION public.profile_reviews(p_user uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_role text DEFAULT 'worker'::text)
 RETURNS TABLE(id uuid, rating integer, comment text, photos jsonb, created_at timestamp with time zone, reviewer_id uuid, reviewer_name text, reviewer_avatar_url text, job_category text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.require_active_caller();
  if p_role not in ('worker', 'customer') then
    raise exception 'Role must be worker or customer';
  end if;
  return query
  select
    r.id,
    r.rating,
    r.comment,
    r.photos,
    r.created_at,
    r.reviewer_id,
    p.full_name,
    p.avatar_url,
    j.category::text
  from public.reviews r
  join public.profiles p on p.id = r.reviewer_id
  join public.jobs j on j.id = r.job_id
  where r.reviewee_id = p_user
    and auth.uid() is not null
    and public.review_is_revealed(r.job_id, r.reviewer_id, r.reviewee_id, r.created_at)
    and case p_role
          when 'worker' then j.assigned_worker_id = r.reviewee_id
          else j.client_id = r.reviewee_id
        end
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;

revoke all on function public.profile_reviews(uuid,integer,integer,text) from public, anon, authenticated, service_role;
grant execute on function public.profile_reviews(uuid,integer,integer,text) to authenticated;

comment on function public.profile_reviews(uuid,integer,integer,text) is
  'D3 (R8a): one page of REVEALED reviews about p_user in the requested role — worker reviews are those where the job''s assigned worker was the reviewee, customer reviews those where the job''s client was. The join to jobs is the role derivation; there is no role column.';

-- public.register_push_token(text,text)
CREATE OR REPLACE FUNCTION public.register_push_token(p_token text, p_platform text DEFAULT 'unknown'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
begin
  perform public.require_active_caller();
  if v_user is null then
    raise exception 'Not signed in';
  end if;
  if p_token is null or btrim(p_token) = '' then
    raise exception 'Empty push token';
  end if;

  insert into public.push_tokens (user_id, token, platform, active, last_seen_at)
  values (v_user, btrim(p_token), coalesce(p_platform, 'unknown'), true, now())
  on conflict (token) do update
    set user_id      = excluded.user_id,
        platform     = excluded.platform,
        active       = true,
        last_seen_at = now();
end;
$function$;

revoke all on function public.register_push_token(text,text) from public, anon, authenticated, service_role;
grant execute on function public.register_push_token(text,text) to authenticated;

-- (no comment on public.register_push_token(text,text))

-- public.release_job_payment(uuid)
CREATE OR REPLACE FUNCTION public.release_job_payment(p_job_id uuid)
 RETURNS public.payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_payment public.payments;
begin
  perform public.require_active_caller();
  if v_actor is null or not public.is_active_user() then raise exception 'Active authentication required'; end if;
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then raise exception 'Job not found'; end if;
  select * into v_payment from public.payments
   where job_id = p_job_id and kind = 'job_payment' and status not in ('failed', 'voided') for update;
  if not found then raise exception 'This job has no payment to release'; end if;
  -- Idempotent return, not a refusal: a release already requested (or already
  -- landed) returns the row with release_requested_at UNCHANGED. This is also
  -- what keeps a reversal-parked row exactly where it is.
  if v_payment.status in ('released', 'paid_out') or v_payment.release_requested_at is not null then return public.payment_for_party(v_payment); end if;
  if v_job.status <> 'completed' then raise exception 'Funds release only after the job is completed'; end if;
  if exists (select 1 from public.job_disputes d where d.job_id = p_job_id and d.status = 'open') then
    raise exception 'An open issue report is holding this payment';
  end if;
  if v_payment.chargeback_at is not null then
    raise exception 'This payment is under review by the card issuer and cannot be released';
  end if;
  -- D6: a row already directed to a refund, or parked after a reversal, is skipped.
  if coalesce(v_payment.refund_cents, 0) > 0 or v_payment.transfer_reversed_at is not null then
    raise exception 'This payment is being refunded and cannot be released';
  end if;
  if v_payment.status <> 'held' then raise exception 'This payment is not held (%)', v_payment.status; end if;

  update public.payments
     set release_requested_at = now(),
         release_reason = 'approved',
         transfer_cents = amount_cents - platform_fee_cents,
         updated_at = now()
   where id = v_payment.id returning * into v_payment;
  return public.payment_for_party(v_payment);
end $function$;

revoke all on function public.release_job_payment(uuid) from public, anon, authenticated, service_role;
grant execute on function public.release_job_payment(uuid) to authenticated;

comment on function public.release_job_payment(uuid) is
  'The customer approves the finished work. Guards: completed, no open issue report, no card dispute, not being refunded, held. Sets release_requested_at + transfer_cents (R5 transfers exactly that). A repeated call returns the row unchanged.';

-- public.report_running_late(uuid,integer)
CREATE OR REPLACE FUNCTION public.report_running_late(p_job_id uuid, p_minutes integer)
 RETURNS public.jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_window text;
begin
  perform public.require_active_caller();
  if v_user is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if p_minutes is null or p_minutes not in (10, 20, 30) then
    raise exception 'Running late is 10, 20 or 30 minutes';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.assigned_worker_id is distinct from v_user then
    raise exception 'Job not found or not assigned to caller';
  end if;
  if v_job.status <> 'assigned' or v_job.arrived_at is not null then
    raise exception 'Running late can only be said before you arrive';
  end if;
  -- A delay is about today's arrival: the job's own day in the market's zone, or a job with none.
  if v_job.scheduled_date is not null
     and v_job.scheduled_date <> (now() at time zone 'America/New_York')::date then
    raise exception 'Running late is for the day of the job';
  end if;
  -- The delay already told: nothing changes, nobody is told twice.
  if v_job.late_minutes is not distinct from p_minutes then
    return v_job;
  end if;

  update public.jobs
     set late_minutes = p_minutes,
         late_reported_at = now()
   where id = p_job_id
  returning * into v_job;

  -- The moved window, when the job has one: "6:20 PM–8:20 PM".
  if v_job.arrival_start_hour is not null and v_job.arrival_end_hour is not null then
    v_window :=
      to_char(time '00:00' + make_interval(mins => v_job.arrival_start_hour * 60 + p_minutes), 'FMHH12:MI AM')
      || '–' ||
      to_char(time '00:00' + make_interval(mins => v_job.arrival_end_hour * 60 + p_minutes), 'FMHH12:MI AM');
  end if;

  perform public.enqueue_notification(
    v_job.client_id,
    v_user,
    'job_updates',
    'job_running_late',
    coalesce(public.notify_display_name(v_user), 'Your worker') || ' is running ' || p_minutes::text || ' min late',
    left(v_job.title, 80) || coalesce(' · now ' || v_window, ''),
    jsonb_build_object('screen', 'ClientJobDetail', 'jobId', v_job.id::text),
    -- One key per report: a return to an earlier delay is news again (20, then 30, then 20). The
    -- wall clock, not the transaction's, so two reports can never share an instant.
    'job_running_late:' || v_job.id::text || ':' || p_minutes::text || ':'
      || (extract(epoch from clock_timestamp()) * 1000000)::bigint::text
  );

  return v_job;
end;
$function$;

revoke all on function public.report_running_late(uuid,integer) from public, anon, authenticated, service_role;
grant execute on function public.report_running_late(uuid,integer) to authenticated;

comment on function public.report_running_late(uuid,integer) is
  'Idea 5 (2026-09-30, docs/DECISIONS.md entry (1)): the job''s assigned worker says they are running 10, 20 or 30 minutes late, while the job is assigned, before they arrive, on the job''s own day (America/New_York) or any day for a job with none. Sets jobs.late_minutes / late_reported_at (the latest tap wins) and enqueues one job_updates notification to the customer per change of delay; the delay already recorded is a no-op. SECURITY DEFINER; authenticated only.';

-- public.set_active_mode(text)
CREATE OR REPLACE FUNCTION public.set_active_mode(p_mode text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
begin
  perform public.require_active_caller();
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  -- Rejected here as well as by the check constraint: the client should get a
  -- clear error, not a constraint violation, and a future column change must
  -- not silently widen what this accepts.
  if p_mode is null or p_mode not in ('customer', 'worker') then
    raise exception 'Unsupported mode: %', coalesce(p_mode, '(null)');
  end if;

  update public.profiles
     set active_mode = p_mode
   where id = v_user;

  return p_mode;
end;
$function$;

revoke all on function public.set_active_mode(text) from public, anon, authenticated, service_role;
grant execute on function public.set_active_mode(text) to authenticated;

-- (no comment on public.set_active_mode(text))

-- public.start_job_series(uuid,text)
CREATE OR REPLACE FUNCTION public.start_job_series(p_job_id uuid, p_cadence text)
 RETURNS public.job_series
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_series public.job_series;
  v_anchor date;
begin
  perform public.require_active_caller();
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if p_cadence is null or p_cadence not in ('weekly', 'biweekly', 'monthly') then
    raise exception 'Repeat every week, every 2 weeks or every month';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then
    raise exception 'Job not found';
  end if;
  -- Idempotent: a job already in a series answers with it.
  if v_job.series_id is not null then
    select * into v_series from public.job_series where id = v_job.series_id;
    return v_series;
  end if;
  -- An allow-list: the customer's own posted job, not yet over.
  if v_job.visibility <> 'open_market'
     or v_job.status not in ('open', 'assigned', 'in_progress', 'completed') then
    raise exception 'This job can''t repeat';
  end if;

  -- The first visit's day; a flexible one counts from the day it is done (series_on_visit_change).
  v_anchor := case
    when v_job.scheduled_date is not null then v_job.scheduled_date
    when v_job.status = 'completed' then (now() at time zone 'America/New_York')::date
  end;

  insert into public.job_series (
    client_id, origin_job_id, cadence, anchor_date, next_visit_no, next_visit_date, worker_id, price_cents
  )
  values (
    v_actor, v_job.id, p_cadence, v_anchor, 1,
    case when v_anchor is not null then public.series_visit_date(v_anchor, p_cadence, 1) end,
    v_job.assigned_worker_id,
    case when v_job.assigned_worker_id is not null then v_job.final_amount_cents end
  )
  returning * into v_series;

  update public.jobs set series_id = v_series.id where id = v_job.id;
  return v_series;
end;
$function$;

revoke all on function public.start_job_series(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.start_job_series(uuid,text) to authenticated;

comment on function public.start_job_series(uuid,text) is
  'Idea 14: the signed-in customer''s own open-market job (open, hired, started or done) becomes the first visit of a series repeating every week, every 2 weeks or every month. Idempotent. SECURITY DEFINER; authenticated only.';

-- public.stop_job_series(uuid)
CREATE OR REPLACE FUNCTION public.stop_job_series(p_series_id uuid)
 RETURNS public.job_series
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_series public.job_series;
  v_title text;
  v_last_visit uuid;
begin
  perform public.require_active_caller();
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  select * into v_series from public.job_series where id = p_series_id;
  if not found or v_series.client_id <> v_actor then
    raise exception 'Repeat not found';
  end if;
  -- LOCK ORDER: the visit on offer (jobs), then the series — accept_offer()'s order.
  if v_series.pending_job_id is not null then
    perform 1 from public.jobs where id = v_series.pending_job_id for update;
  end if;
  select * into v_series from public.job_series where id = p_series_id for update;
  if v_series.status = 'stopped' then
    return v_series;
  end if;
  if v_series.pending_job_id is not null then
    -- The withdrawal's own thread event stays quiet: the worker is told below, in words.
    perform set_config('brazos.series_quiet', 'on', true);
    perform public.series_close_offers(v_series.pending_job_id, v_actor);
    perform set_config('brazos.series_quiet', 'off', true);
  end if;
  update public.job_series
     set status = 'stopped', stopped_at = now(), pending_job_id = null, updated_at = now()
   where id = p_series_id
  returning * into v_series;

  -- The series' worker is told (the group 4 review): no more visits will come to them first.
  if v_series.worker_id is not null then
    select j.title into v_title from public.jobs j where j.id = v_series.origin_job_id;
    -- Their own last visit of the series, for the push to open.
    select j.id into v_last_visit from public.jobs j
     where j.series_id = p_series_id and j.assigned_worker_id = v_series.worker_id
     order by j.created_at desc
     limit 1;
    perform public.enqueue_notification(
      v_series.worker_id,
      v_actor,
      'job_updates',
      'series_stopped',
      coalesce(nullif(split_part(btrim(public.notify_display_name(v_actor)), ' ', 1), ''), 'Your customer')
        || ' stopped repeating',
      coalesce(left(v_title, 60) || ' · ', '') || 'Visits already booked stay booked.',
      case when v_last_visit is not null
           then jsonb_build_object('screen', 'WorkerJob', 'jobId', v_last_visit::text)
           else '{}'::jsonb end,
      'series_stopped:' || p_series_id::text
    );
  end if;
  return v_series;
end;
$function$;

revoke all on function public.stop_job_series(uuid) from public, anon, authenticated, service_role;
grant execute on function public.stop_job_series(uuid) to authenticated;

comment on function public.stop_job_series(uuid) is
  'Idea 14: the customer stops their repeating job; a first refusal still pending is withdrawn (or its counter declined) and the series'' worker is told. Visits already hired stay hired. Idempotent. SECURITY DEFINER; authenticated only.';

-- public.transition_job_status(uuid,text,jsonb,jsonb)
CREATE OR REPLACE FUNCTION public.transition_job_status(p_job_id uuid, p_status text, p_completion_photos jsonb DEFAULT NULL::jsonb, p_completion_videos jsonb DEFAULT NULL::jsonb)
 RETURNS public.jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_photos jsonb := coalesce(p_completion_photos, '[]'::jsonb);
  v_videos jsonb := coalesce(p_completion_videos, '[]'::jsonb);
begin
  perform public.require_active_caller();
  select * into v_job
  from public.jobs
  where id = p_job_id
  for update;

  -- phase73: NULL-safe comparison. On an unassigned job the column is NULL, and
  -- the previous inequality test yielded NULL rather than TRUE, so the guard
  -- never fired and the caller received the row.
  if not found or v_user is null or v_job.assigned_worker_id is distinct from v_user then
    raise exception 'Job not found or not assigned to caller';
  end if;
  if not public.is_profile_active(v_user) then
    raise exception 'Active authentication required';
  end if;

  -- phase58: a retry of a transition that already landed returns the row
  -- (the sibling-RPC idempotency pattern). The retry's media is ignored -
  -- the first call's payload already landed.
  if v_job.status::text = p_status then
    return v_job;
  end if;

  if not (
    (v_job.status = 'assigned' and p_status = 'in_progress')
    or (v_job.status = 'in_progress' and p_status = 'completed')
  ) then
    raise exception 'Invalid job status transition';
  end if;
  -- R4 (D8) and A6: the held gate and the clear money, now in one place (trip_day: the trip steps
  -- read the same rule).
  if v_job.status = 'assigned' and p_status = 'in_progress' then
    perform public.require_work_money(p_job_id);
  end if;
  -- >>> trip_day: after the held gate, the start waits for the job's own day (undated: no wait).
  if v_job.status = 'assigned' and p_status = 'in_progress'
     and not public.job_day_reached(v_job.scheduled_date, now()) then
    raise exception 'This job is booked for %; the trip and the start open on that day.',
      to_char(v_job.scheduled_date, 'FMDay, FMMonth FMDD');
  end if;
  -- <<< trip_day
  if jsonb_typeof(v_photos) <> 'array' or jsonb_array_length(v_photos) > 5 then
    raise exception 'Completion photos must be an array with at most 5 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_photos) as photo(value)
    where jsonb_typeof(photo.value) <> 'string'
      or length(photo.value #>> '{}') > 2048
  ) then
    raise exception 'Each completion photo must be a valid URL or storage reference';
  end if;
  -- R6c (D-14): the completion-photo guard. A null or empty p_completion_photos
  -- cannot mark a job complete. The shape checks above have already made
  -- v_photos an array, so its length is the whole test.
  if p_status = 'completed' and jsonb_array_length(v_photos) = 0 then
    raise exception 'At least one photo of the finished work is required to mark this job complete';
  end if;
  if jsonb_typeof(v_videos) <> 'array' or jsonb_array_length(v_videos) > 1 then
    raise exception 'Completion videos must be an array with at most 1 entry';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_videos) as video(value)
    where jsonb_typeof(video.value) <> 'string'
      or length(video.value #>> '{}') > 2048
  ) then
    raise exception 'Each completion video must be a valid URL or storage reference';
  end if;

  update public.jobs
  set
    status = p_status::public.job_status,
    completion_photos = case
      when p_status = 'completed' and p_completion_photos is not null then v_photos
      else completion_photos
    end,
    completion_photo_url = case
      when p_status = 'completed' and jsonb_array_length(v_photos) > 0
        then v_photos->>0
      else completion_photo_url
    end,
    completion_videos = case
      when p_status = 'completed' and p_completion_videos is not null then v_videos
      else completion_videos
    end,
    completed_at = case
      when p_status = 'completed' then coalesce(completed_at, now())
      else completed_at
    end
  where id = p_job_id
  returning * into v_job;

  -- R6c (D-14): the record of the guard — one row per completed job, written
  -- here and nowhere else. The retry branch above returns before this point,
  -- so the unique job_id can never collide on a repeated call.
  if p_status = 'completed' then
    insert into public.job_completions (job_id, completed_by, photos)
    select p_job_id, v_user, array_agg(photo.value #>> '{}' order by photo.ord)
      from jsonb_array_elements(v_photos) with ordinality as photo(value, ord);
  end if;

  return v_job;
end;
$function$;

revoke all on function public.transition_job_status(uuid,text,jsonb,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.transition_job_status(uuid,text,jsonb,jsonb) to authenticated;

-- (no comment on public.transition_job_status(uuid,text,jsonb,jsonb))

-- public.unban_user(uuid)
CREATE OR REPLACE FUNCTION public.unban_user(p_target uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.require_active_caller();
  if not public.current_user_is_admin() then
    raise exception 'Only admins may unban users';
  end if;

  update public.profiles set banned = false where id = p_target;
  delete from public.banned_phones where banned_profile_id = p_target;
end;
$function$;

revoke all on function public.unban_user(uuid) from public, anon, authenticated, service_role;
grant execute on function public.unban_user(uuid) to authenticated;

comment on function public.unban_user(uuid) is
  'Admin only (an ACTIVE admin, current_user_is_admin(); A3). Lifts the ban and frees the account''s banned phone numbers. It does not bring back a job the ban cancelled, an offer it settled or a series the series sweep stopped; the push tokens come back on at the account''s next signed-in launch (register_push_token).';

-- public.unsend_message(uuid)
CREATE OR REPLACE FUNCTION public.unsend_message(p_message_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sender_id uuid;
  v_created_at timestamptz;
begin
  perform public.require_active_caller();
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- phase73: banned or tombstoned accounts may not blank their messages.
  if not public.is_active_user() then
    raise exception 'Active authentication required';
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
      unsent_at = now()
  where id = p_message_id;
end;
$function$;

revoke all on function public.unsend_message(uuid) from public, anon, authenticated, service_role;
grant execute on function public.unsend_message(uuid) to authenticated;

-- (no comment on public.unsend_message(uuid))

-- public.update_job_details(uuid,text,text,public.job_category,text,integer,jsonb,double precision,double precision,jsonb,integer,integer,date,smallint,smallint,text,text)
CREATE OR REPLACE FUNCTION public.update_job_details(p_job_id uuid, p_title text, p_description text, p_category public.job_category, p_location text, p_budget_cents integer DEFAULT NULL::integer, p_photos jsonb DEFAULT '[]'::jsonb, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_videos jsonb DEFAULT '[]'::jsonb, p_budget_min_cents integer DEFAULT NULL::integer, p_budget_max_cents integer DEFAULT NULL::integer, p_scheduled_date date DEFAULT NULL::date, p_arrival_start_hour smallint DEFAULT NULL::smallint, p_arrival_end_hour smallint DEFAULT NULL::smallint, p_address_line text DEFAULT NULL::text, p_pricing_mode text DEFAULT 'open_bids'::text)
 RETURNS public.jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_address text := nullif(btrim(coalesce(p_address_line, '')), '');
begin
  perform public.require_active_caller();
  if v_user is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  select * into v_job
  from public.jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'Job not found';
  end if;
  if v_job.client_id <> v_user then
    raise exception 'Only the job poster can edit this job';
  end if;
  if v_job.status <> 'open' then
    raise exception 'Only open jobs can be edited';
  end if;
  if exists (select 1 from public.job_offers o where o.job_id = p_job_id)
     or exists (select 1 from public.bids b where b.job_id = p_job_id) then
    raise exception 'Jobs with bids can no longer be edited';
  end if;
  -- >>> post_window: a NEW day or window may not be one already over (an unchanged one may stay).
  if (p_scheduled_date is distinct from v_job.scheduled_date
      or p_arrival_start_hour is distinct from v_job.arrival_start_hour
      or p_arrival_end_hour is distinct from v_job.arrival_end_hour)
     and public.job_window_over(p_scheduled_date, p_arrival_end_hour, now()) then
    raise exception 'That time has already passed. Pick a later window or another day.';
  end if;
  -- <<< post_window

  if length(btrim(coalesce(p_title, ''))) not between 1 and 80 then
    raise exception 'Title must be between 1 and 80 characters';
  end if;
  if length(btrim(coalesce(p_description, ''))) not between 1 and 500 then
    raise exception 'Description must be between 1 and 500 characters';
  end if;
  if length(btrim(coalesce(p_location, ''))) not between 1 and 200 then
    raise exception 'Location is required';
  end if;
  if p_budget_cents is not null and p_budget_cents <= 0 then
    raise exception 'Budget must be positive';
  end if;
  if (p_budget_min_cents is not null and p_budget_min_cents <= 0)
     or (p_budget_max_cents is not null and p_budget_max_cents <= 0) then
    raise exception 'Budget range values must be positive';
  end if;
  if p_budget_min_cents is not null and p_budget_max_cents is not null
     and p_budget_min_cents > p_budget_max_cents then
    raise exception 'Minimum budget cannot exceed maximum budget';
  end if;
  -- a3 (2026-09-05): the posting choice. An allow-list, never a block-list;
  -- a posted price is one amount and no range.
  if p_pricing_mode is null or p_pricing_mode not in ('open_bids', 'posted_price') then
    raise exception 'Pricing mode must be open_bids or posted_price';
  end if;
  if p_pricing_mode = 'posted_price' and (p_budget_cents is null or p_budget_cents <= 0) then
    raise exception 'A posted price needs an amount';
  end if;
  if p_pricing_mode = 'posted_price' and (p_budget_min_cents is not null or p_budget_max_cents is not null) then
    raise exception 'A posted price is one amount, not a range';
  end if;
  if jsonb_typeof(coalesce(p_photos, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_photos, '[]'::jsonb)) > 10 then
    raise exception 'Photos must be an array with at most 10 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) as photo(value)
    where jsonb_typeof(photo.value) <> 'string'
       or length(photo.value #>> '{}') > 2048
  ) then
    raise exception 'Each photo must be a valid URL or storage reference';
  end if;
  if jsonb_typeof(coalesce(p_videos, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_videos, '[]'::jsonb)) > 2 then
    raise exception 'Videos must be an array with at most 2 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_videos, '[]'::jsonb)) as video(value)
    where jsonb_typeof(video.value) <> 'string'
       or length(video.value #>> '{}') > 2048
  ) then
    raise exception 'Each video must be a valid URL or storage reference';
  end if;
  if (p_lat is null) <> (p_lng is null)
     or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180)) then
    raise exception 'Coordinates are invalid';
  end if;
  if (p_arrival_start_hour is null) <> (p_arrival_end_hour is null) then
    raise exception 'Arrival window needs both a start and an end';
  end if;
  if p_arrival_start_hour is not null
     and (p_arrival_start_hour not between 0 and 23
          or p_arrival_end_hour not between 1 and 24
          or p_arrival_start_hour >= p_arrival_end_hour) then
    raise exception 'Arrival window hours are invalid';
  end if;
  if v_address is not null and length(v_address) > 200 then
    raise exception 'Address must be at most 200 characters';
  end if;

  update public.jobs
  set
    title = btrim(p_title),
    description = btrim(p_description),
    category = p_category,
    location = btrim(p_location),
    pricing_mode = p_pricing_mode,
    budget_cents = coalesce(p_budget_max_cents, p_budget_min_cents, p_budget_cents),
    budget_min_cents = p_budget_min_cents,
    budget_max_cents = p_budget_max_cents,
    scheduled_date = p_scheduled_date,
    arrival_start_hour = p_arrival_start_hour,
    arrival_end_hour = p_arrival_end_hour,
    photos = coalesce(p_photos, '[]'::jsonb),
    videos = coalesce(p_videos, '[]'::jsonb)
  where id = p_job_id
  returning * into v_job;

  if p_lat is null and v_address is null then
    delete from public.job_locations where job_id = p_job_id;
  else
    insert into public.job_locations (job_id, lat, lng, address_line)
    values (p_job_id, p_lat, p_lng, v_address)
    on conflict (job_id) do update
      set lat = excluded.lat,
          lng = excluded.lng,
          address_line = excluded.address_line;
  end if;

  return v_job;
end;
$function$;

revoke all on function public.update_job_details(uuid,text,text,public.job_category,text,integer,jsonb,double precision,double precision,jsonb,integer,integer,date,smallint,smallint,text,text) from public, anon, authenticated, service_role;
grant execute on function public.update_job_details(uuid,text,text,public.job_category,text,integer,jsonb,double precision,double precision,jsonb,integer,integer,date,smallint,smallint,text,text) to authenticated;

comment on function public.update_job_details(uuid,text,text,public.job_category,text,integer,jsonb,double precision,double precision,jsonb,integer,integer,date,smallint,smallint,text,text) is
  'Edits the caller''s own open job while it has zero offers and zero bids (SECURITY DEFINER; authenticated only). a3 (2026-09-05, docs/DECISIONS.md entry (2)): p_pricing_mode, last and defaulted to open_bids, rewrites the posting choice under the same three checks as create_job; the sixteen-name call every installed build sends resolves here and writes open_bids. Migration 20260930000400 replaced the sixteen-parameter identity so PostgREST sees one overload. post_window: a changed day or window may not be one already over (job_window_over).';

-- public.update_my_profile(jsonb)
CREATE OR REPLACE FUNCTION public.update_my_profile(p_patch jsonb)
 RETURNS SETOF public.profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_categories text[];
begin
  perform public.require_active_caller();
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_active_user() then
    raise exception 'Suspended accounts cannot update profiles';
  end if;
  if jsonb_typeof(coalesce(p_patch, '{}'::jsonb)) <> 'object' then
    raise exception 'Profile update must be an object';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) as k(key)
    where k.key not in (
      'full_name', 'phone', 'avatar_url', 'bio', 'language', 'categories',
      'accepting_work', 'availability_note'
    )
  ) then
    raise exception 'Profile update contains a protected or unknown field';
  end if;

  if p_patch ? 'full_name'
     and (length(btrim(coalesce(p_patch->>'full_name', ''))) < 1
          or length(btrim(p_patch->>'full_name')) > 100) then
    raise exception 'Full name must be between 1 and 100 characters';
  end if;
  if p_patch ? 'phone'
     and (length(btrim(coalesce(p_patch->>'phone', ''))) < 7
          or length(btrim(p_patch->>'phone')) > 30) then
    raise exception 'Phone number is invalid';
  end if;
  if p_patch ? 'avatar_url'
     and p_patch->>'avatar_url' is not null
     and length(p_patch->>'avatar_url') > 2048 then
    raise exception 'Avatar URL is too long';
  end if;
  if p_patch ? 'bio'
     and length(coalesce(p_patch->>'bio', '')) > 200 then
    raise exception 'Bio is too long';
  end if;
  if p_patch ? 'language'
     and p_patch->>'language' not in ('en', 'es') then
    raise exception 'Unsupported language';
  end if;
  if p_patch ? 'categories' then
    if jsonb_typeof(p_patch->'categories') <> 'array'
       or jsonb_array_length(p_patch->'categories') > 20 then
      raise exception 'Categories must be an array with at most 20 entries';
    end if;
    select coalesce(array_agg(c.value), '{}'::text[])
      into v_categories
      from jsonb_array_elements_text(p_patch->'categories') as c(value);
  end if;
  if p_patch ? 'accepting_work'
     and jsonb_typeof(p_patch->'accepting_work') <> 'boolean' then
    raise exception 'accepting_work must be true or false';
  end if;
  if p_patch ? 'availability_note'
     and length(coalesce(p_patch->>'availability_note', '')) > 140 then
    raise exception 'Availability note is limited to 140 characters';
  end if;

  update public.profiles p
  set
    full_name = case
      when p_patch ? 'full_name' then btrim(p_patch->>'full_name')
      else p.full_name
    end,
    phone = case
      when p_patch ? 'phone' then btrim(p_patch->>'phone')
      else p.phone
    end,
    avatar_url = case
      when p_patch ? 'avatar_url' then nullif(p_patch->>'avatar_url', '')
      else p.avatar_url
    end,
    bio = case
      when p_patch ? 'bio' then nullif(btrim(p_patch->>'bio'), '')
      else p.bio
    end,
    language = case
      when p_patch ? 'language' then p_patch->>'language'
      else p.language
    end,
    categories = case
      when p_patch ? 'categories' then v_categories
      else p.categories
    end,
    accepting_work = case
      when p_patch ? 'accepting_work' then (p_patch->'accepting_work')::boolean
      else p.accepting_work
    end,
    availability_note = case
      when p_patch ? 'availability_note'
        then nullif(btrim(p_patch->>'availability_note'), '')
      else p.availability_note
    end
  where p.id = v_user;

  if not found then
    raise exception 'Profile not found';
  end if;

  return query select p.* from public.profiles p where p.id = v_user;
end;
$function$;

revoke all on function public.update_my_profile(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.update_my_profile(jsonb) to authenticated;

-- (no comment on public.update_my_profile(jsonb))

-- public.withdraw_job_dispute(uuid)
CREATE OR REPLACE FUNCTION public.withdraw_job_dispute(p_dispute_id uuid)
 RETURNS public.job_disputes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_dispute public.job_disputes;
begin
  perform public.require_active_caller();
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  select * into v_dispute
  from public.job_disputes
  where id = p_dispute_id
  for update;
  if not found or v_dispute.opened_by <> v_actor then
    raise exception 'Issue report not found';
  end if;
  if v_dispute.status = 'withdrawn' then
    return v_dispute;   -- retry of a withdraw that already landed
  end if;
  if v_dispute.status <> 'open' then
    raise exception 'Only an open issue report can be withdrawn';
  end if;

  update public.job_disputes
     set status = 'withdrawn',
         resolved_at = now()
   where id = v_dispute.id
  returning * into v_dispute;

  return v_dispute;
end;
$function$;

revoke all on function public.withdraw_job_dispute(uuid) from public, anon, authenticated, service_role;
grant execute on function public.withdraw_job_dispute(uuid) to authenticated;

comment on function public.withdraw_job_dispute(uuid) is
  'The opener withdraws their own open issue report (idempotent on withdrawn), unfreezing release. Resolution by anyone else is a later, human phase.';

-- public.withdraw_offer(uuid)
CREATE OR REPLACE FUNCTION public.withdraw_offer(p_offer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_offer public.job_offers;
begin
  perform public.require_active_caller();
  if v_actor is null then
    raise exception 'Not signed in';
  end if;

  select * into v_offer from public.job_offers where id = p_offer_id for update;
  if not found or v_actor not in (v_offer.customer_id, v_offer.worker_id) then
    raise exception 'Offer not found';
  end if;
  -- Idempotent: a retry of a withdraw that already landed is not an error.
  if v_offer.status = 'withdrawn' then
    return;
  end if;
  if public.expire_offer_if_stale(v_offer) then
    raise exception 'This offer has already expired';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'This offer is no longer open';
  end if;
  if v_offer.author_id is distinct from v_actor then
    raise exception 'Only the person who sent this offer can withdraw it';
  end if;

  update public.job_offers
     set status = 'withdrawn', awaiting_id = null, updated_at = now()
   where id = p_offer_id;

  perform public.offer_post_event(
    p_offer_id, v_offer.root_offer_id, v_actor, 'withdrawn', v_offer.amount_cents
  );
end;
$function$;

revoke all on function public.withdraw_offer(uuid) from public, anon, authenticated, service_role;
grant execute on function public.withdraw_offer(uuid) to authenticated;

comment on function public.withdraw_offer(uuid) is
  'The sender retracts their own pending offer revision (§H.2 withdrawn). The recipient''s counterpart is decline_offer(). Frees the one-live-chain slot, so a withdrawn worker may bid again.';

-- 6c. Restated on purpose (A8-02), each from its live body with the guard line first and its grants
--     and comment restated; the order rule (0) pins the definitions they were written from.
-- public.accept_offer(uuid): A8-02, the two parties' account locks (shared, the lower id first)
-- before the row locks, then the guard again, so a ban or a deletion of either party that committed
-- while this call waited is seen; the checks after the row locks are unchanged.
CREATE OR REPLACE FUNCTION public.accept_offer(p_offer_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_offer public.job_offers;
  v_job public.jobs;
  v_customer uuid;
  v_worker uuid;
begin
  perform public.require_active_caller();
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  -- LOCK ORDER: the two accounts (A8-02), then jobs, THEN job_offers — phase46's rule, unchanged.
  select job_id, customer_id, worker_id into v_job.id, v_customer, v_worker
  from public.job_offers where id = p_offer_id;
  if v_job.id is null then
    raise exception 'Offer not found';
  end if;

  -- A8-02: a ban or a deletion of either party takes the same lock exclusive, so it waits for this
  -- accept or this accept waits for it. The caller is checked again after the wait, with the guard's
  -- own refusal; the other party's activity is checked after the row locks, as before.
  perform public.lock_account(least(v_customer, v_worker), true);
  perform public.lock_account(greatest(v_customer, v_worker), true);
  perform public.require_active_caller();

  select * into v_job from public.jobs where id = v_job.id for update;
  if not found then
    raise exception 'Job not found';
  end if;

  select * into v_offer from public.job_offers where id = p_offer_id for update;
  if not found or v_actor not in (v_offer.customer_id, v_offer.worker_id) then
    raise exception 'Offer not found';
  end if;

  if v_offer.status = 'accepted' then
    return v_offer.job_id;
  end if;
  -- >>> post_window: a NEW acceptance is refused once the booked window has ended (an undated
  -- job has no cutoff), so a fresh hire always has the 24 hours before the no-show close. A7-09:
  -- read with the clock NOW, after the locks above were granted, not the transaction's start.
  if public.job_window_over(v_job.scheduled_date, v_job.arrival_end_hour, clock_timestamp()) then
    -- A7-03: the sentence says what the one who tapped can do next.
    if v_actor = v_offer.worker_id then
      raise exception 'This job''s booked time has passed, so it can no longer be accepted. Ask the customer to post it again with a new time.';
    end if;
    raise exception 'This job''s booked time has passed, so it can no longer be accepted. Post it again with a new time.';
  end if;
  -- <<< post_window
  -- Phase 50: a lapsed offer cannot win, however fast the tap after the
  -- deadline. Flipped first so the row records expired, not a failed accept.
  if public.expire_offer_if_stale(v_offer) then
    raise exception 'This offer has expired and can no longer be accepted';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'This offer is no longer open';
  end if;
  if v_offer.awaiting_id is distinct from v_actor then
    raise exception 'It is not your turn to respond to this offer';
  end if;
  if not public.job_request_parties_ok(v_offer.customer_id, v_offer.worker_id) then
    raise exception 'This offer cannot be accepted';
  end if;
  if not public.is_profile_active(v_offer.worker_id) then
    raise exception 'Worker is not available';
  end if;
  -- B11: the worker of the offer must be able to be paid, whoever accepts.
  if not public.worker_payouts_ready(v_offer.worker_id) then
    if v_actor = v_offer.worker_id then
      raise exception 'Finish payout set-up before you accept. Open Profile, then Earnings & payouts.';
    end if;
    raise exception 'This worker cannot be paid yet, so they cannot be hired. Choose another worker, or try again later.';
  end if;
  if v_offer.job_id <> v_job.id then
    raise exception 'Offer no longer belongs to this job';
  end if;
  if v_job.accepted_offer_id is not null or v_job.assigned_worker_id is not null then
    raise exception 'This job has already been assigned';
  end if;
  if v_offer.offer_type = 'marketplace_bid' and v_job.status <> 'open' then
    raise exception 'This job no longer accepts offers';
  end if;
  if v_offer.offer_type = 'direct_offer' and v_job.status <> 'draft' then
    raise exception 'This job no longer accepts offers';
  end if;

  update public.job_offers
     set status = 'accepted', awaiting_id = null, updated_at = now()
   where id = p_offer_id;

  -- Phase 50: siblings that had already lapsed record expired; only genuinely
  -- live rivals record superseded. Under the job lock, so atomic either way.
  update public.job_offers
     set status = 'expired', awaiting_id = null, updated_at = now()
   where job_id = v_offer.job_id
     and id <> p_offer_id
     and status = 'pending'
     and expires_at is not null
     and expires_at <= now();

  update public.job_offers
     set status = 'superseded', awaiting_id = null, updated_at = now()
   where job_id = v_offer.job_id
     and id <> p_offer_id
     and status = 'pending';

  update public.jobs
     set status = 'assigned'::public.job_status,
         assigned_worker_id = v_offer.worker_id,
         accepted_offer_id = v_offer.id,
         final_amount_cents = v_offer.amount_cents
   where id = v_offer.job_id;

  perform public.offer_post_event(
    p_offer_id, v_offer.root_offer_id, v_actor, 'accepted', v_offer.amount_cents
  );

  return v_offer.job_id;
end;
$function$;

revoke all on function public.accept_offer(uuid) from public, anon, authenticated, service_role;
grant execute on function public.accept_offer(uuid) to authenticated;

-- (no comment on public.accept_offer(uuid))

-- public.counter_offer(uuid,integer): A11-09, the two parties' account locks (shared, the lower id
-- first) before the row locks, then the guard again, as accept_offer() does; the checks after the
-- row locks are unchanged.
CREATE OR REPLACE FUNCTION public.counter_offer(p_offer_id uuid, p_amount_cents integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_parent public.job_offers;
  v_job_id uuid;
  v_customer uuid;
  v_worker uuid;
  v_used integer;
  v_next uuid;
  v_new_id uuid;
  -- phase63: the cap, named once. Mirrored by MAX_COUNTERS_PER_SIDE in
  -- lib/offers.ts, which only drives what the UI offers — this is the
  -- enforcement.
  v_max_per_side constant integer := 10;
begin
  perform public.require_active_caller();
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Enter an amount greater than zero';
  end if;

  select job_id, customer_id, worker_id into v_job_id, v_customer, v_worker
  from public.job_offers where id = p_offer_id;
  if v_job_id is null then
    raise exception 'Offer not found';
  end if;
  -- A11-09: a ban or a deletion of either party takes the same lock exclusive, so it waits for this
  -- counter or this counter waits for it, before either holds a row lock. The caller is checked
  -- again after the wait, with the guard's own refusal; the other party's activity is checked after
  -- the row locks, as before.
  perform public.lock_account(least(v_customer, v_worker), true);
  perform public.lock_account(greatest(v_customer, v_worker), true);
  perform public.require_active_caller();
  -- LOCK ORDER: jobs, THEN job_offers (phase46:679-692). This lock is what
  -- makes the cap count below atomic — every row that can contribute to it
  -- belongs to this job. Do not move the count above it.
  perform 1 from public.jobs where id = v_job_id for update;

  select * into v_parent from public.job_offers where id = p_offer_id for update;
  if not found or v_actor not in (v_parent.customer_id, v_parent.worker_id) then
    raise exception 'Offer not found';
  end if;
  -- Phase 50: countering a lapsed offer records the lapse and refuses.
  if public.expire_offer_if_stale(v_parent) then
    raise exception 'This offer has expired and can no longer be countered';
  end if;
  if v_parent.status <> 'pending' then
    raise exception 'This offer is no longer open';
  end if;
  if v_parent.awaiting_id is distinct from v_actor then
    raise exception 'It is not your turn to respond to this offer';
  end if;
  if not public.job_request_parties_ok(v_parent.customer_id, v_parent.worker_id) then
    raise exception 'This offer cannot be updated';
  end if;
  -- B11: a worker who cannot be paid cannot counter; the customer's counter is not gated.
  if v_actor = v_parent.worker_id and not public.worker_payouts_ready(v_parent.worker_id) then
    raise exception 'Finish payout set-up before you send an offer. Open Profile, then Earnings & payouts.';
  end if;

  -- >>> phase63: 10 per side, per chain. Scoped to ONE chain by
  -- root_offer_id and to ONE side by author_id; the chain-opening root is
  -- excluded by parent_offer_id is not null. Read under the locks above.
  select count(*) into v_used
  from public.job_offers o
  where o.root_offer_id = v_parent.root_offer_id
    and o.author_id = v_actor
    and o.parent_offer_id is not null;
  if v_used >= v_max_per_side then
    raise exception
      'You have used all % counter-offers on this negotiation. Accept or decline to continue.',
      v_max_per_side;
  end if;
  -- <<< phase63

  update public.job_offers
     set status = 'superseded', awaiting_id = null, updated_at = now()
   where id = p_offer_id;

  v_next := case when v_actor = v_parent.customer_id
                 then v_parent.worker_id else v_parent.customer_id end;
  v_new_id := gen_random_uuid();

  -- expires_at deliberately not set here: the column default gives the
  -- counter its own fresh 7-day window.
  insert into public.job_offers (
    id, job_id, offer_type, parent_offer_id, root_offer_id,
    customer_id, worker_id, author_id, awaiting_id,
    amount_cents, status
  )
  values (
    v_new_id, v_parent.job_id, v_parent.offer_type, p_offer_id, v_parent.root_offer_id,
    v_parent.customer_id, v_parent.worker_id, v_actor, v_next,
    p_amount_cents, 'pending'
  );

  if v_parent.offer_type = 'direct_offer' then
    update public.jobs set budget_cents = p_amount_cents where id = v_parent.job_id;
  end if;

  perform public.offer_post_event(
    v_new_id, v_parent.root_offer_id, v_actor, 'countered', p_amount_cents
  );

  return v_new_id;
end;
$function$;

revoke all on function public.counter_offer(uuid,integer) from public, anon, authenticated, service_role;
grant execute on function public.counter_offer(uuid,integer) to authenticated;

-- (no comment on public.counter_offer(uuid,integer))

-- public.begin_job_payment(uuid): A8-02 (A11-02), under the job lock a hired worker who is no longer
-- active is refused with accept_offer()'s sentence 'Worker is not available'; nothing else changes.
CREATE OR REPLACE FUNCTION public.begin_job_payment(p_job_id uuid)
 RETURNS public.payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor    uuid := auth.uid();
  v_job      public.jobs;
  v_payment  public.payments;
  v_amount   integer;
  v_t        record;
  v_reuse    boolean := false;
begin
  perform public.require_active_caller();
  if v_actor is null or not public.is_active_user() then raise exception 'Active authentication required'; end if;

  -- DIVERGENCE (D12): the kill switch is the paymentsEnabled key. Absent =
  -- enabled; only the jsonb boolean true enables — anything else pauses.
  if not coalesce((select c.value = 'true'::jsonb from public.app_config c where c.key = 'paymentsEnabled'), true) then
    raise exception 'Payments are paused right now. Please try again shortly.';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then raise exception 'Job not found'; end if;

  -- Only 'assigned'. Accepting in_progress or completed here would say the
  -- protection is optional; D8 makes 'held' the gate to in_progress.
  if v_job.assigned_worker_id is null or v_job.status <> 'assigned' then
    raise exception 'Accept an offer before protecting a payment';
  end if;
  -- A8-02 (A11-02): read after the job lock, which a ban and a deletion take too.
  if not public.is_profile_active(v_job.assigned_worker_id) then
    raise exception 'Worker is not available';
  end if;

  v_amount := coalesce(v_job.final_amount_cents, v_job.budget_cents);
  if v_amount is null or v_amount <= 0 then raise exception 'This job has no agreed amount'; end if;
  -- The terms the customer was quoted at acceptance, when a snapshot exists.
  select * into v_t from public.job_terms(p_job_id, v_amount);

  select * into v_payment from public.payments
   where job_id = p_job_id and kind = 'job_payment' and status not in ('failed', 'voided')
   for update;

  if found then
    if v_payment.status <> 'unfunded' then raise exception 'This job already has a protected payment'; end if;

    if v_payment.funding_due_at is not null and v_payment.funding_due_at < now() then
      -- A2: the window closed before the sweeper ran. Never resumed: void it, then fall through.
      update public.payments
        set status = 'voided', last_error = 'funding window expired', updated_at = now()
      where id = v_payment.id;
    elsif v_payment.amount_cents = v_amount then
      v_reuse := true;                       -- plain resume: same money, same intent
    elsif v_payment.provider_ref is null then
      update public.payments set                                  -- nothing exists at the provider yet
        amount_cents = v_amount,
        customer_fee_cents = v_t.customer_fee_cents,
        platform_fee_cents = v_t.worker_fee_cents,
        tax_cents = v_t.tax_cents,
        customer_fee_bps = v_t.customer_fee_bps, worker_fee_bps = v_t.worker_fee_bps,
        funding_due_at = now() + interval '24 hours', updated_at = now()
      where id = v_payment.id returning * into v_payment;
      v_reuse := true;
    else
      -- A PaymentIntent exists at a stale amount and nothing has been charged.
      -- Abandon it. Then fall through.
      update public.payments
        set status = 'voided', last_error = 'agreed amount changed before funding', updated_at = now()
      where id = v_payment.id;
    end if;

    if v_reuse then
      if v_payment.funding_due_at is null then
        update public.payments set funding_due_at = now() + interval '24 hours', updated_at = now()
        where id = v_payment.id returning * into v_payment;
      end if;
      return public.payment_for_party(v_payment);
    end if;
  end if;

  insert into public.payments (job_id, offer_id, payer_id, payee_id, kind, amount_cents,
                               customer_fee_cents, platform_fee_cents, tax_cents,
                               customer_fee_bps, worker_fee_bps, provider, status, funding_due_at)
  values (p_job_id, v_job.accepted_offer_id, v_actor, v_job.assigned_worker_id, 'job_payment', v_amount,
          v_t.customer_fee_cents, v_t.worker_fee_cents, v_t.tax_cents,
          v_t.customer_fee_bps, v_t.worker_fee_bps, 'stripe', 'unfunded', now() + interval '24 hours')
  returning * into v_payment;
  return public.payment_for_party(v_payment);
end $function$;

revoke all on function public.begin_job_payment(uuid) from public, anon, authenticated, service_role;
grant execute on function public.begin_job_payment(uuid) to authenticated;

comment on function public.begin_job_payment(uuid) is
  'The customer starts protecting an assigned job''s payment: the stripe ledger row is born unfunded with BOTH fee sides and tax frozen from the agreement snapshot (or current_fee()). Idempotent on an existing unfunded row inside its funding window; past funding_due_at that row is voided (funding window expired) and a new one is born (A2). Returns the row through payment_for_party (A4). A8-02 (A11-02): a hired worker who is no longer active is refused, after the job lock, with ''Worker is not available''.';

-- public.begin_tip_payment(uuid,integer): A8-02 (decision 1), under the job lock a SUSPENDED worker
-- (banned, not deleted) gets no new tip: 'This worker can no longer receive tips.' A deleted
-- worker's tip is unchanged (paid when the payout account works, else the list line tip_payee_gone).
CREATE OR REPLACE FUNCTION public.begin_tip_payment(p_job_id uuid, p_amount_cents integer)
 RETURNS public.payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_main public.payments;
  v_tip public.payments;
  v_fee record;
  v_cfee integer;
  v_tax integer;
begin
  perform public.require_active_caller();
  if v_actor is null or not public.is_active_user() then raise exception 'Active authentication required'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Enter a tip amount greater than zero'; end if;
  if not coalesce((select c.value = 'true'::jsonb from public.app_config c where c.key = 'paymentsEnabled'), true) then
    raise exception 'Payments are paused right now. Please try again shortly.';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then raise exception 'Job not found'; end if;
  if v_job.status <> 'completed' or v_job.assigned_worker_id is null then raise exception 'Tips are for completed jobs'; end if;
  -- A8-02 (decision 1): read after the job lock, which a ban takes too.
  if exists (select 1 from public.profiles p
              where p.id = v_job.assigned_worker_id and coalesce(p.banned, false) and p.deleted_at is null) then
    raise exception 'This worker can no longer receive tips.';
  end if;

  select * into v_main from public.payments
   where job_id = p_job_id and kind = 'job_payment' and status not in ('failed', 'voided') for update;
  if not found or v_main.status not in ('released', 'paid_out') then
    raise exception 'The job payment releases first — then a tip can be added';
  end if;

  select * into v_fee from public.current_fee();
  -- B5: numeric products, so an amount far over the ceiling reaches the ceiling's sentence.
  v_cfee := round(p_amount_cents::numeric * v_fee.tip_customer_bps / 10000)::integer;
  v_tax := round((p_amount_cents::numeric + v_cfee) * v_fee.tax_bps / 10000)::integer;

  select * into v_tip from public.payments
   where job_id = p_job_id and kind = 'tip' and status not in ('failed', 'voided') for update;
  if found then
    if v_tip.status <> 'unfunded' then raise exception 'A tip was already added to this job'; end if;
    if v_tip.amount_cents = p_amount_cents and not coalesce(v_tip.funding_due_at < now(), false) then return public.payment_for_party(v_tip); end if;
    -- B1: no in-place rewrite of the amount, with or without an intent
    -- attached. The row keeps the amount it was minted with; a different
    -- amount gets a new row through the insert below (and its ceiling).
    update public.payments
       set status = 'voided', last_error = case when v_tip.funding_due_at < now() then 'funding window expired' else 'tip amount changed before funding' end, updated_at = now()
     where id = v_tip.id;
  end if;

  insert into public.payments (job_id, offer_id, payer_id, payee_id, kind, amount_cents,
                               platform_fee_cents, customer_fee_cents, customer_fee_bps, tax_cents,
                               provider, status, funding_due_at)
  values (v_job.id, v_job.accepted_offer_id, v_actor, v_job.assigned_worker_id, 'tip', p_amount_cents,
          0, v_cfee, v_fee.tip_customer_bps, v_tax,
          'stripe', 'unfunded', now() + interval '24 hours')
  returning * into v_tip;
  return public.payment_for_party(v_tip);
end $function$;

revoke all on function public.begin_tip_payment(uuid,integer) from public, anon, authenticated, service_role;
grant execute on function public.begin_tip_payment(uuid,integer) to authenticated;

comment on function public.begin_tip_payment(uuid,integer) is
  'The customer starts a stripe tip on a completed job whose payment released: row born unfunded, customer fee only (platform_fee_cents = 0), capped by the tip trigger. A tip row''s amount is never rewritten: asking for a different amount voids the unfunded row and inserts a new one, through the same trigger. payment_intent.succeeded holds the tip and queues the whole tip for transfer to the worker (release_requested_at, transfer_cents); transfer.created releases it (20261111000000_tip_settlement.sql). B5 (20261112010000): fee products in numeric. A8-02: a suspended worker (banned, not deleted) is refused, after the job lock, with ''This worker can no longer receive tips.''; a deleted worker''s tip is unchanged.';

-- 7. The restrictive policies.
drop policy if exists bids_active_select on public.bids;
create policy bids_active_select on public.bids as restrictive for select to authenticated
  using ((select public.is_active_user()));

drop policy if exists blocks_active_select on public.blocks;
create policy blocks_active_select on public.blocks as restrictive for select to authenticated
  using ((select public.is_active_user()));
drop policy if exists blocks_active_insert on public.blocks;
create policy blocks_active_insert on public.blocks as restrictive for insert to authenticated
  with check ((select public.is_active_user()));
drop policy if exists blocks_active_delete on public.blocks;
create policy blocks_active_delete on public.blocks as restrictive for delete to authenticated
  using ((select public.is_active_user()));

drop policy if exists direct_threads_active_select on public.direct_threads;
create policy direct_threads_active_select on public.direct_threads as restrictive for select to authenticated
  using ((select public.is_active_user()));

drop policy if exists job_agreements_active_select on public.job_agreements;
create policy job_agreements_active_select on public.job_agreements as restrictive for select to authenticated
  using ((select public.is_active_user()));

drop policy if exists job_completions_active_select on public.job_completions;
create policy job_completions_active_select on public.job_completions as restrictive for select to authenticated
  using ((select public.is_active_user()));

drop policy if exists job_disputes_active_select on public.job_disputes;
create policy job_disputes_active_select on public.job_disputes as restrictive for select to authenticated
  using ((select public.is_active_user()));

drop policy if exists job_locations_active_select on public.job_locations;
create policy job_locations_active_select on public.job_locations as restrictive for select to authenticated
  using ((select public.is_active_user()));

drop policy if exists job_offers_active_select on public.job_offers;
create policy job_offers_active_select on public.job_offers as restrictive for select to authenticated
  using ((select public.is_active_user()));

drop policy if exists job_series_active_select on public.job_series;
create policy job_series_active_select on public.job_series as restrictive for select to authenticated
  using ((select public.is_active_user()));

drop policy if exists jobs_active_select on public.jobs;
create policy jobs_active_select on public.jobs as restrictive for select to authenticated
  using ((select public.is_active_user()));
drop policy if exists jobs_active_delete on public.jobs;
create policy jobs_active_delete on public.jobs as restrictive for delete to authenticated
  using ((select public.is_active_user()));

drop policy if exists legal_acceptances_active_select on public.legal_acceptances;
create policy legal_acceptances_active_select on public.legal_acceptances as restrictive for select to authenticated
  using ((select public.is_active_user()));

drop policy if exists message_reads_active_select on public.message_reads;
create policy message_reads_active_select on public.message_reads as restrictive for select to authenticated
  using ((select public.is_active_user()));
drop policy if exists message_reads_active_insert on public.message_reads;
create policy message_reads_active_insert on public.message_reads as restrictive for insert to authenticated
  with check ((select public.is_active_user()));
drop policy if exists message_reads_active_update on public.message_reads;
create policy message_reads_active_update on public.message_reads as restrictive for update to authenticated
  using ((select public.is_active_user()))
  with check ((select public.is_active_user()));

drop policy if exists messages_active_select on public.messages;
create policy messages_active_select on public.messages as restrictive for select to authenticated
  using ((select public.is_active_user()));
drop policy if exists messages_active_insert on public.messages;
create policy messages_active_insert on public.messages as restrictive for insert to authenticated
  with check ((select public.is_active_user()));

drop policy if exists notification_outbox_active_select on public.notification_outbox;
create policy notification_outbox_active_select on public.notification_outbox as restrictive for select to authenticated
  using ((select public.is_active_user()));
drop policy if exists notification_outbox_active_update on public.notification_outbox;
create policy notification_outbox_active_update on public.notification_outbox as restrictive for update to authenticated
  using ((select public.is_active_user()))
  with check ((select public.is_active_user()));

drop policy if exists notification_prefs_active_select on public.notification_prefs;
create policy notification_prefs_active_select on public.notification_prefs as restrictive for select to authenticated
  using ((select public.is_active_user()));
drop policy if exists notification_prefs_active_insert on public.notification_prefs;
create policy notification_prefs_active_insert on public.notification_prefs as restrictive for insert to authenticated
  with check ((select public.is_active_user()));
drop policy if exists notification_prefs_active_update on public.notification_prefs;
create policy notification_prefs_active_update on public.notification_prefs as restrictive for update to authenticated
  using ((select public.is_active_user()))
  with check ((select public.is_active_user()));

drop policy if exists payments_active_select on public.payments;
create policy payments_active_select on public.payments as restrictive for select to authenticated
  using ((select public.is_active_user()));

-- The own row stays readable: the installed app reads it to learn of the ban (C2).
drop policy if exists profiles_active_select on public.profiles;
create policy profiles_active_select on public.profiles as restrictive for select to authenticated
  using ((select public.is_active_user()) or id = (select auth.uid()));

drop policy if exists push_tokens_active_select on public.push_tokens;
create policy push_tokens_active_select on public.push_tokens as restrictive for select to authenticated
  using ((select public.is_active_user()));
drop policy if exists push_tokens_active_update on public.push_tokens;
create policy push_tokens_active_update on public.push_tokens as restrictive for update to authenticated
  using ((select public.is_active_user()))
  with check ((select public.is_active_user()));

drop policy if exists reports_active_select on public.reports;
create policy reports_active_select on public.reports as restrictive for select to authenticated
  using ((select public.is_active_user()));
drop policy if exists reports_active_insert on public.reports;
create policy reports_active_insert on public.reports as restrictive for insert to authenticated
  with check ((select public.is_active_user()));
drop policy if exists reports_active_update on public.reports;
create policy reports_active_update on public.reports as restrictive for update to authenticated
  using ((select public.is_active_user()))
  with check ((select public.is_active_user()));

drop policy if exists reviews_active_select on public.reviews;
create policy reviews_active_select on public.reviews as restrictive for select to authenticated
  using ((select public.is_active_user()));

drop policy if exists worker_services_active_select on public.worker_services;
create policy worker_services_active_select on public.worker_services as restrictive for select to authenticated
  using ((select public.is_active_user()));
drop policy if exists worker_services_active_insert on public.worker_services;
create policy worker_services_active_insert on public.worker_services as restrictive for insert to authenticated
  with check ((select public.is_active_user()));
drop policy if exists worker_services_active_update on public.worker_services;
create policy worker_services_active_update on public.worker_services as restrictive for update to authenticated
  using ((select public.is_active_user()))
  with check ((select public.is_active_user()));
drop policy if exists worker_services_active_delete on public.worker_services;
create policy worker_services_active_delete on public.worker_services as restrictive for delete to authenticated
  using ((select public.is_active_user()));

-- storage.objects: writes need an active account; reads and removals also allow the person's own
-- avatars/<uid>/ files (C2), so a banned account still sees and can later remove its own picture.
drop policy if exists objects_active_select on storage.objects;
create policy objects_active_select on storage.objects as restrictive for select to authenticated
  using (
    (select public.is_active_user())
    or (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  );
drop policy if exists objects_active_insert on storage.objects;
create policy objects_active_insert on storage.objects as restrictive for insert to authenticated
  with check ((select public.is_active_user()));
drop policy if exists objects_active_update on storage.objects;
create policy objects_active_update on storage.objects as restrictive for update to authenticated
  using ((select public.is_active_user()))
  with check ((select public.is_active_user()));
drop policy if exists objects_active_delete on storage.objects;
create policy objects_active_delete on storage.objects as restrictive for delete to authenticated
  using (
    (select public.is_active_user())
    or (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  );

-- 8. The proof (S4-07), on the database this runs on, in this transaction.
do $proof$
declare
  v_exempt constant text[] := array[
    'public.current_user_is_banned()',
    'public.account_deletion_blockers()',
    'public.delete_my_account()',
    'public.is_profile_active(uuid)',
    'public.is_active_user()',
    'public.can_delete_own_job(uuid)',
    'public.messaging_unlocked(uuid,uuid)',
    'public.review_is_revealed(uuid,uuid,uuid,timestamp with time zone)',
    'public.current_user_is_admin()',
    'public.profile_visible(uuid)',
    'public.release_due_at(public.jobs)'
  ];
  v_bad text;
  v_count integer;
begin
  -- a. The guarded functions changed by the guard line only.
  select count(*) into v_count from active_account_rule_before;
  if v_count <> 45 then
    raise exception 'active_account_rule: % guarded functions copied aside, expected 45', v_count;
  end if;
  select string_agg(b.sig, ', ' order by b.sig) into v_bad
  from active_account_rule_before b
  left join pg_catalog.pg_proc p on p.oid = b.fn
  where p.oid is null
     or public.function_shape(p.oid) is distinct from b.shape
     or length(p.prosrc) - length(b.src)
        <> length(case (b.shape ->> 'language') when 'sql' then E'\nselect public.require_active_caller();'
                                                 else E'\n  perform public.require_active_caller();' end)
     or replace(p.prosrc,
                case (b.shape ->> 'language') when 'sql' then E'\nselect public.require_active_caller();'
                                               else E'\n  perform public.require_active_caller();' end,
                '') is distinct from b.src;
  if v_bad is not null then
    raise exception 'active_account_rule: changed beyond the guard line: %', v_bad;
  end if;

  -- b. Every client-executable definer function is exempt or has the guard first.
  select string_agg(p.oid::regprocedure::text || ' (' || public.active_guard_problem(p.oid) || ')', ', '
                    order by p.oid::regprocedure::text)
    into v_bad
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'graphql_public')
    and p.prosecdef
    and pg_catalog.has_function_privilege('authenticated', p.oid, 'execute')
    and p.oid <> all (v_exempt::regprocedure[]::oid[])
    and public.active_guard_problem(p.oid) is not null;
  if v_bad is not null then
    raise exception 'active_account_rule: a client-executable definer function has no guard first: %', v_bad;
  end if;

  -- c. Every exempt entry names a client-executable definer function.
  select string_agg(e.sig, ', ' order by e.sig) into v_bad
  from unnest(v_exempt) as e(sig)
  where not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = e.sig::regprocedure
      and p.prosecdef
      and pg_catalog.has_function_privilege('authenticated', p.oid, 'execute')
  );
  if v_bad is not null then
    raise exception 'active_account_rule: a stale exempt entry: %', v_bad;
  end if;

  -- d. Every (table, command) the authenticated role holds has row security and a restrictive
  --    policy for that command that calls is_active_user().
  select string_agg(t.rel || ' ' || t.cmd, ', ' order by t.rel, t.cmd) into v_bad
  from (
    select c.oid, c.oid::regclass::text as rel, c.relrowsecurity, cmd.cmd
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as cmd(cmd)
    where c.relkind in ('r', 'p')
      and (n.nspname = 'public' or c.oid = 'storage.objects'::regclass)
      and c.oid <> 'public.app_config'::regclass
      and (
        pg_catalog.has_table_privilege('authenticated', c.oid, cmd.cmd)
        or (cmd.cmd <> 'DELETE' and pg_catalog.has_any_column_privilege('authenticated', c.oid, cmd.cmd))
      )
  ) t
  where not t.relrowsecurity
     or not exists (
       select 1
       from pg_catalog.pg_policy pol
       where pol.polrelid = t.oid
         and not pol.polpermissive
         and pol.polcmd in ('*', case t.cmd when 'SELECT' then 'r' when 'INSERT' then 'a'
                                            when 'UPDATE' then 'w' else 'd' end)
         and (pol.polroles = array[0::oid] or 'authenticated'::regrole::oid = any (pol.polroles))
         and coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '')
             || coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), '') ~ 'is_active_user\(\)'
     );
  if v_bad is not null then
    raise exception 'active_account_rule: a table right with no active-account policy: %', v_bad;
  end if;

  raise notice 'active_account_rule: proof passed (45 guarded, % exempt).', array_length(v_exempt, 1);
end;
$proof$;

commit;
