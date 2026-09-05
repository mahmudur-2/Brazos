-- ============================================================================
-- BRAZOS · phase66 · free-form messaging is locked until the job is confirmed
--
-- STAGING deliverable — hand-apply with psql against STAGING only:
--   psql -v ON_ERROR_STOP=1 -f supabase/phase66_messaging_locked_until_confirmed.sql -d "$SUPABASE_DB_URL_STAGING"
-- Runs as ONE transaction. Safe to re-run (idempotent).
--
-- THE PRODUCT RULE
--   Before a job is confirmed, two people may interact ONLY through structured
--   marketplace actions — send offer, counteroffer, accept, decline. They may
--   NOT exchange ordinary person-to-person messages. Once the offer has been
--   accepted and the worker is actually assigned, normal messaging opens.
--
--   This deliberately narrows phase52's product decision. phase52 opened
--   pre-hire chat for marketplace-bid pairs ("a customer looking at a bid
--   cannot ask 'when could you start?' without accepting first"). That is now
--   answered by the negotiation cards themselves, which live inside the
--   thread and stay fully available. Nothing phase52 built is dropped: the
--   pair's direct_threads row still exists from the first offer, the thread
--   still renders, and every negotiation event still posts into it. Only
--   free-form content is gated.
--
-- WHY THIS IS A POLICY AND NOT A SCREEN
--   Hiding the composer is not enforcement. messages_insert_party (phase36)
--   let any party of a job or a direct thread insert a row, so a stale screen,
--   an alternate entry point or an older installed build could still send.
--   The rule therefore lives where the app cannot be talked out of it, and the
--   client is left to render a friendly refusal rather than a raw error.
--
-- WHAT IS NOT TOUCHED — READS
--   messages_select_party (phase36) is UNCHANGED. Threads that already contain
--   pre-confirmation chat in staging keep every row and keep rendering it for
--   both parties. Nothing is deleted, rewritten or migrated; the rule applies
--   forward only, to new inserts.
--
-- WHAT IS NOT TOUCHED — THE NEGOTIATION
--   Every structured event row is written by a SECURITY DEFINER function
--   (offer_post_event, create_offer, and the legacy create_job_request /
--   respond_job_request shims), which runs as the table owner and is not
--   subject to RLS at all — public.messages does not have FORCE ROW LEVEL
--   SECURITY. So create/counter/accept/decline cannot be affected by an INSERT
--   policy no matter what it says. The negotiation branch below is belt and
--   braces for any future non-definer writer, and it is deliberately payload-
--   free: a row claiming to be a negotiation event may carry no text, photo or
--   audio, so it can never be used to smuggle a free-form message past the
--   lock. ban_user()'s system notice is likewise SECURITY DEFINER (phase13)
--   and keeps working.
-- ============================================================================

begin;

-- 1. Preconditions ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'messages'
      and policyname = 'messages_insert_party'
  ) then
    raise exception 'phase66 expects phase36''s messages_insert_party policy to exist';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_active_user'
  ) then
    raise exception 'phase66 expects phase13''s is_active_user()';
  end if;
end $$;

-- 2. THE canonical unlock condition -------------------------------------------
--
-- "Confirmed" already has a definition in this app and it is NOT a second one
-- invented here: it is the state accept_offer() produces — the job carries an
-- assigned_worker_id and has not been cancelled. lib/jobLifecycle.ts derives
-- its richer 'confirmed' label from assigned + payment held, but that label is
-- TRANSIENT (it becomes en_route the moment the worker taps "on my way"), so
-- gating messaging on it would re-lock a conversation mid-job. The assignment
-- itself is the monotonic fact, and it is exactly what "the offer has been
-- accepted AND the worker has been assigned" means: accept_offer() does both
-- in one transaction.
--
-- Granted to authenticated on purpose. The chat screen asks THIS function
-- rather than re-deriving the rule client-side, so the UI gate and the policy
-- can never disagree about whether a thread is open.
--
-- It answers only about the CALLER's own conversations: both branches require
-- auth.uid() to be a participant, so it cannot be used to probe whether two
-- other people have worked together.

create or replace function public.messaging_unlocked(
  p_job_id uuid default null,
  p_direct_thread_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    -- A job's own thread: the pair is the client and the worker they hired.
    when p_job_id is not null then exists (
      select 1
      from public.jobs j
      where j.id = p_job_id
        and j.assigned_worker_id is not null
        and j.status in ('assigned', 'in_progress', 'completed')
        and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
    )
    -- The pair's own thread: open once ANY job between these two people has
    -- reached assignment. A cancelled job does not unlock anything.
    when p_direct_thread_id is not null then exists (
      select 1
      from public.direct_threads t
      join public.jobs j
        on (j.client_id = t.user_a and j.assigned_worker_id = t.user_b)
        or (j.client_id = t.user_b and j.assigned_worker_id = t.user_a)
      where t.id = p_direct_thread_id
        and (t.user_a = auth.uid() or t.user_b = auth.uid())
        and j.status in ('assigned', 'in_progress', 'completed')
    )
    else false
  end;
$$;

comment on function public.messaging_unlocked(uuid, uuid) is
  'THE pre-confirmation messaging gate (phase66). True once the caller and their counterparty share a job that reached assignment and was not cancelled — the state accept_offer() produces. Answers only about the caller''s own conversations. Used by both messages_insert_party and the chat screen, so the enforcement and the UI cannot drift.';

revoke all on function public.messaging_unlocked(uuid, uuid) from public, anon;
-- phase32 revoked the default EXECUTE on new functions; without this grant the
-- app could not ask the question.
grant execute on function public.messaging_unlocked(uuid, uuid) to authenticated;

-- 3. The INSERT policy --------------------------------------------------------
--
-- phase36's participant + block enforcement is carried forward BYTE FOR BYTE
-- as the first conjunct; the second is new. A blocked pair still cannot
-- insert, a non-participant still cannot insert, and a banned account still
-- cannot insert.

drop policy if exists "messages_insert_party" on public.messages;
create policy "messages_insert_party"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_active_user()
    and (
      exists (
        select 1 from public.jobs j
        where j.id = messages.job_id
          and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
          -- Neither direction of the pair may be blocked.
          and not public.is_blocked_between(
            j.client_id,
            coalesce(j.assigned_worker_id, j.client_id)
          )
      )
      or exists (
        select 1 from public.direct_threads t
        where t.id = messages.direct_thread_id
          and (t.user_a = auth.uid() or t.user_b = auth.uid())
          and not public.is_blocked_between(t.user_a, t.user_b)
      )
    )
    and (
      -- The conversation is open: the pair is hired.
      public.messaging_unlocked(messages.job_id, messages.direct_thread_id)
      -- ...or this is a structured negotiation event rather than a message.
      -- Identified by the discriminator the app itself reads first
      -- (messages.job_offer_id, phase46; messages.job_request_id, phase18 —
      -- see offerIdOf() in lib/offers.ts). Payload-free by construction, which
      -- is what stops the branch being used to smuggle free-form content:
      -- offer_post_event() and create_offer() both write content = '' with no
      -- media, so nothing legitimate is excluded.
      or (
        (messages.job_offer_id is not null or messages.job_request_id is not null)
        and coalesce(btrim(messages.content), '') = ''
        and messages.image_url is null
        and messages.audio_url is null
      )
    )
  );

comment on policy "messages_insert_party" on public.messages is
  'phase36''s participant + block rule, plus phase66''s pre-confirmation lock: a free-form message may only be inserted once messaging_unlocked() is true for the thread. Structured negotiation events are exempt and payload-free. Reads (messages_select_party) are deliberately untouched, so existing pre-confirmation history keeps rendering.';

-- 4. Post-condition -----------------------------------------------------------
--
-- Prove the policy actually carries the gate, so a partial apply cannot leave
-- the sentinel behind a policy that never got the new conjunct.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'messages'
      and policyname = 'messages_insert_party'
      and with_check like '%messaging_unlocked%'
  ) then
    raise exception 'phase66 post-condition failed: messages_insert_party does not reference messaging_unlocked()';
  end if;

  -- Reads must be exactly as phase36 left them.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'messages'
      and policyname = 'messages_select_party'
  ) then
    raise exception 'phase66 post-condition failed: messages_select_party is missing';
  end if;
end $$;

-- 5. verify-schema sentinel ---------------------------------------------------
--
-- Created last, inside this transaction and after the post-condition, so its
-- presence proves the whole migration committed AND that the policy carries
-- the gate. messaging_unlocked() is probeable on its own, but a policy is not
-- visible to a PostgREST existence probe at all, so the sentinel is what makes
-- "applied" mean "the lock is live".

create or replace function public.messaging_lock_enabled()
returns boolean
language sql
immutable
as $$
  select true;
$$;

revoke all on function public.messaging_lock_enabled() from public, anon;
grant execute on function public.messaging_lock_enabled() to authenticated;

notify pgrst, 'reload schema';

commit;
