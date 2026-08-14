-- ============================================================================
-- Brazos · Phase 67 · in-app account deletion (App Store Guideline 5.1.1(v))
--
-- Apply to STAGING (zzkumxcjtbqoselzptig) via the Supabase SQL Editor.
-- Production (avkighsiufeefyycbebf) is never contacted by this run.
-- Safe to run twice: every statement is `if not exists` / `create or replace`
-- / a guarded DO block.
--
-- WHAT THIS BUILDS
--   1. auth.users FKs in `public` are dropped (apply-time discovery) so a
--      profiles row can outlive its auth row. See the comment on section 1.
--   2. profiles.deleted_at — the tombstone marker.
--   3. ONE lifecycle predicate. is_profile_active(uuid) gains `deleted_at is
--      null` and is_active_user() becomes a one-line call to it, so the rule
--      has exactly one implementation (CLAUDE.md P3-31). `deleted_at is null`
--      is written NOWHERE else in this file or the codebase.
--   4. account_deletion_blockers() — what still ties this account to money or
--      to another person's work.
--   5. delete_my_account() — cancel, withdraw, purge, tombstone, drop the auth
--      row. One transaction.
--
-- THE BLOCKING RULE, AND WHY IT IS WRITTEN THIS WAY
--   There are no generated Supabase types in this repo (lib/supabase.ts calls
--   createClient with no type parameter), so nothing in the app is
--   compile-checked against these enums. A status filter therefore has to fail
--   safe on its own. Every blocking condition below is written as
--   `status not in (<terminal set>)` — an ALLOW-LIST. A value added to any of
--   these enums later is AT RISK by default and blocks deletion until someone
--   deliberately classifies it. Never rewrite these as `status in (<blocking
--   set>)`: that would silently permit deletion on top of an unclassified
--   state.
--
--   Terminal sets, reconstructed from the migrations that define each enum:
--     job_status      terminal: completed, cancelled, open, draft
--                     blocking: assigned, in_progress
--     payment_status  terminal: released, paid_out, refunded, failed, voided
--                     blocking: unfunded, pending, authorized, held,
--                               partially_refunded
--     dispute_status  terminal: resolved, withdrawn
--                     blocking: open
--
--   'open' and 'draft' are terminal FOR THIS GATE ONLY — they are not terminal
--   in the job lifecycle, and nothing else in the schema should read them that
--   way. They sit here because neither one holds another person to anything: a
--   draft is an unsent private note, and an open posting has no worker
--   committed and no money moved, so cancelling it on the owner's behalf
--   produces exactly the outcome the owner would have produced by cancelling
--   it themselves. Blocking deletion behind that housekeeping is what App
--   Review reads as a 5.1.1(v) failure.
--
--   Consequence worth knowing before this ships: deleting an account CANCELS
--   every job it posted that is still open — step (c) of delete_my_account()
--   does it, and the deletion screen says so before the user confirms. Drafts
--   are left as drafts: invisible to everyone, owned by a tombstone. What
--   still blocks is work somebody else is depending on — an assigned or
--   in-progress job, money that has not finished moving, an open dispute.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   * No storage cleanup. The avatars bucket keys objects as
--     `avatars/<uid>/avatar.<ext>` where <ext> follows the uploaded file, so
--     there is no single deterministic path to remove, and portfolio_items
--     media reuses the shared `job-photos` bucket under paths that are not
--     per-user. Partial confidence is not confidence; recorded as follow-up.
--   * No rewrite of any RLS policy or view to call the predicates above —
--     every live policy already goes through is_active_user() /
--     is_profile_active(). The remaining direct `profiles.banned` reads are
--     all inside SECURITY DEFINER function bodies (see section 3's note).
--   * No policy defined ON public.profiles is touched (42P17 RLS recursion).
--   * No enum is widened. No table is renamed. Nothing is revoked from anyone
--     who has it today.
-- ============================================================================

begin;

-- 0. Preconditions ------------------------------------------------------------

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'public.profiles does not exist — this is not a Brazos database.';
  end if;
  if to_regprocedure('public.is_profile_active(uuid)') is null then
    raise exception 'phase29 has not been applied — is_profile_active(uuid) is missing.';
  end if;
  if to_regprocedure('public.is_active_user()') is null then
    raise exception 'phase13/phase29 have not been applied — is_active_user() is missing.';
  end if;
  if to_regclass('public.payments') is null then
    raise exception 'public.payments does not exist — apply phase50 first.';
  end if;
  if to_regclass('public.job_disputes') is null then
    raise exception 'public.job_disputes does not exist — apply phase51 first.';
  end if;
end $$;

-- 1. Drop every public-schema foreign key pointing at auth.users --------------

-- A deleted account leaves a tombstone profiles row behind so
-- retained reviews and payments still resolve to a name. That row
-- must outlive its auth.users row. CASCADE would delete the
-- tombstone; NO ACTION and RESTRICT both REJECT the parent delete
-- while a child row exists. No ON DELETE value permits this, so
-- these constraints are dropped. Any other public FK to auth.users
-- is dropped for the same reason: left in place it would either
-- destroy retained records or block the delete outright.
-- Integrity for live users is maintained by the signup trigger
-- and RLS. auth-internal FKs are untouched and cascade correctly.
do $$
declare
  r record;
  v_dropped integer := 0;
begin
  for r in
    select c.conname, n.nspname as table_schema, cl.relname as table_name
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and c.connamespace = 'public'::regnamespace
    order by n.nspname, cl.relname, c.conname
  loop
    execute format(
      'alter table %I.%I drop constraint %I',
      r.table_schema, r.table_name, r.conname
    );
    v_dropped := v_dropped + 1;
    raise notice
      'phase67: dropped foreign key %.% -> auth.users (constraint %)',
      r.table_schema, r.table_name, r.conname;
  end loop;

  if v_dropped = 0 then
    -- Not an error on a second run: the first run already dropped them.
    raise notice
      'phase67: no public-schema foreign key to auth.users found (already dropped, or none existed).';
  else
    raise notice 'phase67: % foreign key(s) dropped.', v_dropped;
  end if;
end $$;

-- 2. The tombstone marker -----------------------------------------------------

alter table public.profiles
  add column if not exists deleted_at timestamptz;

comment on column public.profiles.deleted_at is
  'Set by delete_my_account(). The row is a TOMBSTONE from that moment: it exists only so retained reviews, payments and disputes still resolve to a name ("Deleted user"). Never re-used, never un-set. Read it only through is_profile_active()/is_active_user() — phase67 is the one place this column is compared to null.';

create index if not exists profiles_deleted_at_idx
  on public.profiles (id)
  where deleted_at is not null;

-- 3. ONE lifecycle predicate --------------------------------------------------
--
-- is_profile_active(uuid) is the sole implementation; is_active_user() is a
-- call to it. Both keep phase29's volatility (stable), SECURITY mode (definer)
-- and search_path (public, pg_temp) exactly.
--
-- NOTE ON DRIFT (audited before writing this file): no live RLS policy and no
-- live view reads public.profiles.banned directly — phase29 already routed
-- jobs_select_open and bids_select_job_owner through is_profile_active(), and
-- phase43 narrowed jobs_select_open further while keeping that call. The
-- direct `profiles.banned` reads that remain are all inside SECURITY DEFINER
-- FUNCTION bodies (phase18 can_transact_between, phase20/phase56 should_notify
-- and the nearby-jobs fan-out, phase39/phase40 worker ranking, phase30
-- accept_bid, phase58 transition_job_status). Those are not repointed here:
-- `create or replace function` re-emits an entire body, several of those
-- bodies are the product of stacked definitions across up to five migrations,
-- and reproducing one from a single file would silently revert later fixes.
-- They are listed as follow-ups instead. Their exposure is bounded — the
-- self-checks (`p.id = auth.uid()`) are unreachable once the auth row is gone,
-- and the counterparty checks are covered structurally: section 5(e) deletes
-- worker_semantic_docs, worker_services and portfolio_items, which is what
-- makes a profile discoverable in the first place.

create or replace function public.is_profile_active(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user
      and not coalesce(p.banned, false)
      and p.deleted_at is null
  );
$$;

comment on function public.is_profile_active(uuid) is
  'THE account-lifecycle predicate (CLAUDE.md P3-31): true when the profile exists, is not banned, and has not been deleted. Every other gate calls this rather than re-deriving it.';

revoke all on function public.is_profile_active(uuid) from public, anon;
grant execute on function public.is_profile_active(uuid) to authenticated;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_profile_active(auth.uid());
$$;

comment on function public.is_active_user() is
  'The caller''s own is_profile_active(). Deliberately nothing but a call to it, so a ban rule and a deletion rule can never disagree.';

revoke all on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated;

-- 4. What still blocks deletion ----------------------------------------------
--
-- No parameters. The subject is auth.uid() and only auth.uid() — a
-- client-supplied id would turn this into an enumeration oracle for other
-- people's open work. Empty result = deletion permitted.
--
-- `kind` tells the client what ref_id points at, because the deletion screen
-- lives in ProfileStack and that stack registers no job-detail route:
--   job              -> ref_id is a job id            (no route; label only)
--   dispute          -> ref_id is the disputed job id (no route; label only)
--   payment_incoming -> caller is the PAYEE; ref_id is the job id when the
--                       payment has one, else the payment id. Opens Earnings.
--   payment_outgoing -> caller is the PAYER. No customer-side payment record
--                       screen exists in this stack, so: label only.
--
-- No money is formatted here. Amounts are integer cents and CLAUDE.md allows
-- exactly one formatter (formatBudget), which lives in the app — so these
-- labels describe state in words and never render a figure.

create or replace function public.account_deletion_blockers()
returns table (kind text, ref_id uuid, label text, detail text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (select auth.uid() as uid)
  select b.kind, b.ref_id, b.label, b.detail
  from (
    -- Jobs the caller posted or is assigned to, not yet in a terminal state.
    select
      'job'::text as kind,
      j.id as ref_id,
      coalesce(nullif(btrim(j.title), ''), 'Untitled job') as label,
      -- No 'open' or 'draft' branch: both are terminal for this gate (see the
      -- header), so neither can reach this CASE.
      case j.status::text
        when 'assigned'    then 'A worker is assigned to this job.'
        when 'in_progress' then 'Work is underway on this job.'
        else 'This job has not reached a final state yet.'
      end as detail,
      1 as sort_group,
      j.created_at as sort_key
    from public.jobs j
    cross join me
    where me.uid is not null
      and (j.client_id = me.uid or j.assigned_worker_id = me.uid)
      and (
        j.status is null
        or j.status not in ('completed', 'cancelled', 'open', 'draft')
      )

    union all

    -- Money that has not finished moving, in either direction.
    select
      case when p.payee_id = me.uid
        then 'payment_incoming'::text
        else 'payment_outgoing'::text
      end as kind,
      coalesce(p.job_id, p.id) as ref_id,
      case when p.payee_id = me.uid
        then 'Payment owed to you'
        else 'Payment you sent'
      end as label,
      case p.status::text
        when 'held'               then 'This payment is being held for a job and has not been released.'
        when 'unfunded'           then 'This payment has not been funded yet.'
        when 'pending'            then 'This payment has not settled yet.'
        when 'authorized'         then 'This payment is authorized but has not been held or released.'
        when 'partially_refunded' then 'A refund on this payment has not completed.'
        else 'This payment has not reached a final state yet.'
      end as detail,
      2 as sort_group,
      p.created_at as sort_key
    from public.payments p
    cross join me
    where me.uid is not null
      and (p.payer_id = me.uid or p.payee_id = me.uid)
      and (
        p.status is null
        or p.status not in ('released', 'paid_out', 'refunded', 'failed', 'voided')
      )

    union all

    -- Disputes the caller opened, or that sit on a job they are party to.
    select
      'dispute'::text as kind,
      d.job_id as ref_id,
      'Open dispute' as label,
      'A dispute on this job has to be resolved before this account can be deleted.' as detail,
      3 as sort_group,
      d.created_at as sort_key
    from public.job_disputes d
    join public.jobs dj on dj.id = d.job_id
    cross join me
    where me.uid is not null
      and (
        d.opened_by = me.uid
        or dj.client_id = me.uid
        or dj.assigned_worker_id = me.uid
      )
      and (
        d.status is null
        or d.status not in ('resolved', 'withdrawn')
      )
  ) b
  order by b.sort_group, b.sort_key desc, b.label;
$$;

comment on function public.account_deletion_blockers() is
  'Everything still tying auth.uid() to money or to another person''s work. Empty = deletion permitted. Every status filter is an allow-list of terminal values (NOT IN), so an unclassified or newly added enum value blocks by default. Takes no parameters on purpose: a caller-supplied id would make this an oracle for other accounts.';

-- 5. The deletion itself ------------------------------------------------------

create or replace function public.delete_my_account()
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_offer record;
  v_cancelled integer := 0;
  v_withdrawn integer := 0;
  v_offer_failures integer := 0;
  v_auth_deleted integer;
begin
  -- (a) ------------------------------------------------------------------
  if v_user is null then
    raise exception 'Not signed in';
  end if;

  -- (b) The gate. Never a silent no-op: the client matches this exact string
  --     and re-renders the blocker list instead of showing a raw error.
  if exists (select 1 from public.account_deletion_blockers()) then
    raise exception using
      errcode = 'P0001',
      message = 'ACCOUNT_DELETION_BLOCKED';
  end if;

  -- (c) Cancel, don't orphan.
  --
  --     'open' is terminal for the gate at (b), so an open posting no longer
  --     blocks deletion — which makes THIS the step that stops a live listing
  --     from outliving its owner. It is reachable now; it was not before.
  --
  --     WHY THIS IS A RAW UPDATE AND NOT transition_job_status().
  --     The canonical lifecycle RPC cannot perform this transition. Its live
  --     definition is phase58's
  --     transition_job_status(uuid, text, jsonb, jsonb), and:
  --       * its allow-list is exactly `assigned -> in_progress` and
  --         `in_progress -> completed`. Anything else — including
  --         'open' -> 'cancelled' — raises 'Invalid job status transition'.
  --       * its authorisation is `v_job.assigned_worker_id <> v_user`: only
  --         the ASSIGNED WORKER may call it. The caller here is the job's
  --         CLIENT, and an open job has no assigned worker at all.
  --     There is no other cancellation RPC in this schema — the only other
  --     writer of 'cancelled' is phase13's admin ban_user(), itself a raw
  --     UPDATE. The canonical path does not exist to be taken here, rather
  --     than being bypassed. Widening transition_job_status means editing a
  --     body stacked across phases 29/31/35/51/58 and is a follow-up
  --     migration, not this one.
  --
  --     FOLLOW-UP, RECORDED WITH THE RISK NAMED: because this does not route
  --     through an offer-aware path, offers OTHER people authored on these
  --     jobs stay `pending` on a job that is now cancelled. They are
  --     unreachable — the job is cancelled and its owner is a tombstone — but
  --     they are not settled, and no notification tells those workers. The fix
  --     is a decline_offer() sweep here (it authorises as the job owner, which
  --     this function is running as); it needs its own migration and its own
  --     proof.
  --
  --     DRAFTS ARE DELIBERATELY LEFT AT 'draft'. A draft job is an unsent
  --     direct-offer negotiation, visible to nobody, and 'draft' ->
  --     'cancelled' is a transition nothing in this schema performs. Leaving
  --     it untouched under a tombstone owner is the smaller lie than inventing
  --     a status move for it.
  --
  --     The filter is an IN, not a NOT IN, and that is the fail-safe direction
  --     HERE: the gate at (b) blocks on any status it does not recognise,
  --     while this statement refuses to auto-cancel any status it does not
  --     recognise. Both fail closed; they just fail closed in opposite
  --     directions.
  --
  --     NO EXCEPTION HANDLER HERE — deliberately the opposite call from (d).
  --     A refusal to withdraw an offer sitting on somebody else's job must not
  --     veto the user's deletion. A refusal to cancel the user's OWN live
  --     posting must: swallowing it would commit the tombstone and leave a
  --     posting in the open market that nobody can cancel, which is the exact
  --     orphan this step exists to prevent.
  update public.jobs
     set status = 'cancelled'
   where client_id = v_user
     and status = 'open';

  get diagnostics v_cancelled = row_count;

  -- (d) Withdraw outbound commitments.
  --
  --     job_offers is the one negotiation table. withdraw_offer() is the
  --     correct path — it posts the chain event, which is what keeps the
  --     `bids` projection (phase47 trigger) and the notification feed
  --     consistent — so nothing here writes job_offers.status directly.
  --     It raises on a stale offer, so only offers that are genuinely still
  --     live are passed to it; an already-expired chain is terminal anyway and
  --     the next read settles it.
  --
  --     `bids` is a read-only projection of job_offers and is never written
  --     here. `job_requests` is retired (phase45) and its status CHECK has no
  --     withdrawn value at all — inventing one would be worse than leaving it,
  --     so it is deliberately skipped and recorded as a follow-up.
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
      -- Each withdrawal is its own subtransaction. A pending offer sits on
      -- SOMEBODY ELSE'S job, and the gate at (b) never examined that job — so
      -- withdraw_offer() can legitimately refuse (the job moved on, the chain
      -- went stale, a rule tightened). Unhandled, one refusal would abort the
      -- whole transaction and fail the deletion with an opaque error the user
      -- cannot act on. Deletion is a right the user is exercising; a single
      -- unwithdrawable offer must not veto it. The failures are counted and
      -- named in the closing notice rather than silently swallowed.
      begin
        perform public.withdraw_offer(v_offer.id);
        v_withdrawn := v_withdrawn + 1;
      exception when others then
        v_offer_failures := v_offer_failures + 1;
        raise notice
          'phase67: offer % could not be withdrawn (%) — left as-is, continuing.',
          v_offer.id, sqlerrm;
        continue;
      end;
    end loop;
  end if;

  -- (e) Hard delete private-only rows that carry no counterparty value.
  --
  --     to_regclass guards so a database missing one of these does not abort
  --     the whole transaction; a statement inside an untaken branch is never
  --     planned, so a missing table cannot fail at parse time either.
  --
  --     saved_workers is deleted on the user_id side ONLY. A row where this
  --     account is the worker_id belongs to somebody else's private list —
  --     it is their data, and after the scrub below it correctly reads
  --     "Deleted user". `mutes` goes both ways because a mute of, or by, a
  --     gone account is meaningless. `blocks` is NOT here: a block has to
  --     survive (see the retained list at the end of this section).
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

  -- (f) Scrub the profile down to a tombstone.
  --
  --     NOT touched, on purpose: id and created_at (the row has to stay
  --     resolvable), rating_avg / rating_count (they belong to the reviews
  --     that are retained, and zeroing them would rewrite other people's
  --     ratings), and `banned` — deletion must never launder a ban. The phone
  --     ban is independent of this row anyway: banned_phones stores the number
  --     itself, and its FK to profiles is ON DELETE SET NULL.
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

  -- profiles.verification_status is a named ENUM in the live database
  -- (phase40's whole reason for existing), and this repo has no migration that
  -- defines its labels — so the reset is applied only if 'unverified' actually
  -- exists in that enum. The app treats anything other than 'verified' as not
  -- verified, so skipping is safe; guessing a label would break the delete.
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

  -- profiles.stripe_account_id appears in no migration in this repo. Cleared
  -- only if the live table actually has it, for the same reason as above.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'stripe_account_id'
  ) then
    execute 'update public.profiles set stripe_account_id = null where id = $1'
      using v_user;
  end if;

  -- (g) Denormalized identity on retained tables.
  --
  --     Audited: conversations (a VIEW — it resolves names through profiles at
  --     read time, so the tombstone is enough), direct_threads, messages,
  --     reviews, reports, blocks, job_locations, payments and
  --     notification_prefs all reference profiles by FK and store no copy of a
  --     name, phone, email or avatar. Nothing to scrub on any of them.
  --
  --     ONE exception, and it is not scrubbable: notification_outbox.title and
  --     .body are rendered strings that embed the actor's display name at
  --     enqueue time (notify_display_name(), phase20). The table has no actor
  --     column and `data` carries no actor id, so rows delivered to OTHER
  --     people about this account cannot be found except by substring-matching
  --     the old name — which would corrupt the copy of every other user who
  --     happens to share it. Left alone and recorded as a follow-up; the rows
  --     are recipient-only readable and the records they point at already
  --     resolve through the tombstone.

  -- (h) Storage cleanup: deliberately not attempted. See the file header.

  -- (i) The auth row. Only safe because section 1 of THIS FILE dropped every
  --     public foreign key pointing at auth.users — without that, this either
  --     cascades the tombstone away or is rejected outright.
  --
  --     THE ASSERTION IS NOT DEFENSIVE PADDING. RLS is ENABLED on auth.users.
  --     This DELETE reaches the row only while the owner of this SECURITY
  --     DEFINER function carries BYPASSRLS — true today (owner: postgres), and
  --     not something this file controls. An owner change, a new policy, or a
  --     platform change would turn it into a zero-row DELETE that raises
  --     nothing. Without the check that zero-row DELETE would COMMIT the
  --     tombstone and the scrub while leaving the auth row alive: the user
  --     could sign back in to a hollowed-out account that every lifecycle gate
  --     rejects, and every log line would say the deletion succeeded. Raising
  --     here rolls the whole transaction back instead.
  delete from auth.users where id = v_user;

  get diagnostics v_auth_deleted = row_count;
  if v_auth_deleted <> 1 then
    raise exception
      'phase67: auth.users delete affected % row(s), expected 1. '
      'Rolling back — the profile scrub must not commit without it.',
      v_auth_deleted;
  end if;

  raise notice
    'phase67: account % deleted (% open posting(s) cancelled, % outbound offer(s) withdrawn, % withdrawal(s) failed).',
    v_user, v_cancelled, v_withdrawn, v_offer_failures;

  -- RETAINED DELIBERATELY, all now pointing at the tombstone: reviews
  -- (written and received), reports (both sides), blocks (both sides),
  -- banned_phones, legal_acceptances, payments, job_disputes, jobs,
  -- job_offers, bids, job_requests, messages, conversations, direct_threads,
  -- job_checklist_items, job_locations.
end;
$$;

comment on function public.delete_my_account() is
  'Deletes the CALLING account (auth.uid() only — no parameters). Refuses with ACCOUNT_DELETION_BLOCKED while account_deletion_blockers() returns anything. Leaves a tombstone profiles row so retained reviews, payments and disputes still resolve to "Deleted user"; deletes the auth.users row last.';

-- 6. Grants — phase32 revoked the default, so without these the app cannot
--    reach either function.

revoke all on function public.account_deletion_blockers() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.account_deletion_blockers() to authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- 7. Sentinel -----------------------------------------------------------------
--
-- scripts/verify-schema.mjs probes over PostgREST with the publishable key, so
-- it cannot see a dropped constraint, a column it has no SELECT grant on, or a
-- function body. This marker carries all of that: it is created in the same
-- transaction as everything above, so its presence is the proof the file ran.

create or replace function public.account_deletion_enabled()
returns boolean
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select true;
$$;

revoke all on function public.account_deletion_enabled() from public, anon;
grant execute on function public.account_deletion_enabled() to authenticated;

comment on function public.account_deletion_enabled() is
  'phase67 sentinel. Present only if phase67_account_deletion.sql committed: the auth.users FK drops, profiles.deleted_at, the single lifecycle predicate, and both deletion RPCs.';

commit;
