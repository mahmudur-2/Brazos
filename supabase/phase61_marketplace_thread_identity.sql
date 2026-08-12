-- ============================================================================
-- BRAZOS · phase61 · marketplace-bid chains get a real thread identity
--
-- STAGING deliverable — hand-apply with psql against STAGING only:
--   psql -v ON_ERROR_STOP=1 -f supabase/phase61_marketplace_thread_identity.sql -d "$SUPABASE_DB_URL_STAGING"
-- Runs as ONE transaction. Safe to re-run (idempotent).
--
-- THE DEFECT (AUD-P1-01's server half)
--   thread_job_id and direct_thread_id come back NULL for every
--   offer_type = 'marketplace_bid' chain. They are not stored on job_offers at
--   all — both are derived at read time from the chain's ROOT MESSAGE, by the
--   lateral join in my_pending_offers() (phase50:898-914) and by the same
--   lookup in offer_post_event() (phase46:255-266).
--
--   create_offer() posts that root message only in its direct branch —
--   phase50:863-869, `if v_type = 'direct_offer' then`. No root message means
--   the lateral yields one all-NULL row, so:
--     * my_pending_offers() hands the inbox a NULL thread key, which keyed as
--       `direct:null` and matched no row (AUD-P1-01);
--     * offer_post_event() early-returns at phase46:263-266, so NO chain event
--       (countered / accepted / declined / withdrawn / expired) is ever posted
--       for a marketplace chain, and ChatScreen's negotiation cards never
--       exist for one.
--
-- THE FIX — one branch and one guard
--   1. The marketplace branch of create_offer() resolves the pair's direct
--      thread, and the root-message insert stops being direct-only.
--   2. Backfill the same root message for marketplace chains that are still
--      LIVE (see the scope note below).
--
--   Nothing else needs to change. offer_post_event() keys on "is there a root
--   message", not on offer_type, so it starts working with zero edits.
--   my_pending_offers() simply stops returning NULLs — its signature and
--   return type are untouched, which matters because verify-schema.mjs probes
--   its shape.
--
--   The pair's direct_threads row ALREADY EXISTS for every marketplace bid:
--   phase52's ensure_thread_for_offer() trigger (phase52:42-69) calls
--   ensure_direct_thread() for every offer regardless of type, and phase52
--   backfilled the pending pairs. So this migration binds chains to threads
--   that are already there; it is not creating a new thread population.
--
-- WHY direct_thread_id AND NOT thread_job_id
--   The direct branch prefers a JOB thread (phase50:831-849). Mirroring that
--   for marketplace bids would be wrong and would leak nothing but would hide
--   everything: messages on a job thread are readable only by the job's
--   client_id / assigned_worker_id (phase36:110-125), and a bidding worker is
--   neither. The root would be invisible to the very person it exists to
--   reach. Marketplace chains therefore bind to the pair thread only;
--   thread_job_id stays NULL for them by design.
--
-- BACKFILL SCOPE — live chains only, deliberately
--   Only chains with a still-pending, not-yet-lapsed row are backfilled. That
--   is exactly the set where a root message changes any outcome: a badge to
--   raise, or a future event to post. Settled chains (accepted / declined /
--   withdrawn / expired / superseded) are terminal — every offer_post_event()
--   caller requires a pending row — so a root message there would surface a
--   dead negotiation as a brand-new unread inbox row and buy nothing. The
--   whole bid history is intentionally NOT resurrected into people's inboxes.
--   Backfilled rows keep the offer's own created_at, so a backfilled thread
--   does not jump to the top of the inbox.
--
-- DOUBLE-NOTIFY GUARD (§2, applied BEFORE the backfill on purpose)
--   Marketplace chains have never posted messages, so notify_on_message()
--   (phase57:19-91) has never seen one. Once they do, every bid and every
--   chain event would ALSO enqueue a generic "New message" on top of the
--   dedicated notifications that already cover them — phase20's bid_received
--   for the root (via the phase47 projection) and phase59's offer_countered
--   for counters, whose header states outright that its premise is that
--   marketplace chains post no thread message. §2 suppresses the generic row
--   for marketplace offer-event messages only. Direct-offer chains are byte
--   for byte unchanged, and ordinary chat is untouched: sendMessage() never
--   sets job_offer_id (lib/messages.ts:163-183).
-- ============================================================================

begin;

-- 1. Preconditions ------------------------------------------------------------

do $$
begin
  if to_regclass('public.job_offers') is null then
    raise exception 'phase43_job_offers_foundation.sql has not been applied.';
  end if;
  if to_regclass('public.direct_threads') is null then
    raise exception 'phase36_direct_offer_threads.sql has not been applied.';
  end if;
  if to_regprocedure('public.ensure_direct_thread(uuid, uuid)') is null then
    raise exception 'phase36_direct_offer_threads.sql has not been applied — ensure_direct_thread is missing.';
  end if;
  if to_regprocedure('public.offer_post_event(uuid, uuid, uuid, text, integer)') is null then
    raise exception 'phase46_offer_rpcs_and_rls.sql has not been applied — offer_post_event is missing.';
  end if;
  if to_regprocedure('public.notify_on_message()') is null then
    raise exception 'phase20/phase57 have not been applied — notify_on_message is missing.';
  end if;
end $$;

-- 2. Suppress the double-notify BEFORE any new message row can exist ----------
--
-- Identical to phase57's body except for the marketplace guard, which is the
-- only inserted block.

create or replace function public.notify_on_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs;
  v_thread public.direct_threads;
  v_recipient uuid;
  v_preview text;
begin
  -- Hire-request events also insert a message row (phase18). Those are
  -- notified from the negotiation triggers, which know the state — notifying
  -- here as well would double-buzz for a single action.
  if new.job_request_id is not null then
    return new;
  end if;

  -- phase61: marketplace offer chains now post thread messages, which they
  -- never did before. Their lifecycle is already notified by dedicated
  -- triggers — phase20 bid_received for the root (via the phase47 projection)
  -- and phase59 offer_countered for counters — so a generic "New message"
  -- here would double-buzz the same action. Scoped to marketplace chains:
  -- direct-offer events keep the exact behaviour phase57 shipped, and normal
  -- chat never carries job_offer_id (lib/messages.ts sendMessage()).
  if new.job_offer_id is not null and new.request_event is not null then
    perform 1
      from public.job_offers o
     where o.id = new.job_offer_id
       and o.offer_type = 'marketplace_bid';
    if found then
      return new;
    end if;
  end if;

  if new.job_id is not null then
    select * into v_job from public.jobs where id = new.job_id;
    if v_job.id is null then
      return new;
    end if;
    v_recipient := case
      when v_job.client_id = new.sender_id then v_job.assigned_worker_id
      else v_job.client_id
    end;
  elsif new.direct_thread_id is not null then
    -- phase57: the pre-hire pair thread. The recipient is simply the other
    -- participant.
    select * into v_thread from public.direct_threads where id = new.direct_thread_id;
    if v_thread.id is null then
      return new;
    end if;
    v_recipient := case
      when v_thread.user_a = new.sender_id then v_thread.user_b
      else v_thread.user_a
    end;
  else
    return new;
  end if;

  if v_recipient is null then
    return new;
  end if;

  v_preview := case
    when new.audio_url is not null then 'Voice message'
    when new.image_url is not null and coalesce(btrim(new.content), '') = '' then 'Photo'
    when new.image_url is not null then '📷 ' || new.content
    else new.content
  end;

  perform public.enqueue_notification(
    v_recipient,
    new.sender_id,
    'messages',
    'message',
    public.notify_display_name(new.sender_id),
    left(coalesce(nullif(btrim(v_preview), ''), 'New message'), 140),
    case
      when new.job_id is not null then
        jsonb_build_object('screen', 'Chat', 'jobId', new.job_id::text)
      else
        jsonb_build_object('screen', 'Chat', 'directThreadId', new.direct_thread_id::text)
    end,
    'message:' || new.id::text
  );

  return new;
end;
$$;

revoke all on function public.notify_on_message() from public, anon, authenticated;

-- 3. create_offer(): the marketplace branch gains a thread identity -----------
--
-- phase50:669-876 reproduced verbatim except for the two marked blocks.
-- Parameter list and return type are UNCHANGED, so this is a plain
-- CREATE OR REPLACE — no drop, no signature churn, no PostgREST contract
-- change.

create or replace function public.create_offer(
  p_amount_cents integer,
  p_job_id uuid default null,
  p_message text default null,
  p_worker_id uuid default null,
  p_title text default null,
  p_description text default null,
  p_category text default null,
  p_location text default null,
  p_photos jsonb default '[]'::jsonb,
  p_videos jsonb default '[]'::jsonb,
  p_lat double precision default null,
  p_lng double precision default null,
  p_thread_job_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

-- 4. Backfill: LIVE marketplace chains only ------------------------------------
--
-- One statement, guarded by NOT EXISTS, so re-running this file is a no-op.
-- There is no unique index on (job_offer_id, request_event) — the predicate is
-- the whole idempotency guarantee, which is why this must stay a single
-- statement rather than a loop.

insert into public.messages (
  job_id, direct_thread_id, sender_id, content,
  job_offer_id, request_event, request_amount_cents, created_at
)
select
  null::uuid,
  public.ensure_direct_thread(root.customer_id, root.worker_id),
  root.author_id,
  '',
  root.id,
  'created',
  root.amount_cents,
  root.created_at
from public.job_offers root
where root.offer_type = 'marketplace_bid'
  and root.parent_offer_id is null
  and exists (
    select 1
    from public.job_offers live
    where live.root_offer_id = root.id
      and live.status = 'pending'
      and (live.expires_at is null or live.expires_at > now())
  )
  and not exists (
    select 1
    from public.messages m
    where m.job_offer_id = root.id
      and m.request_event = 'created'
  );

-- 5. Regrants ------------------------------------------------------------------
--
-- Not strictly required (CREATE OR REPLACE keeps the ACL) but stated so this
-- file records who may call what — phase32 revoked the defaults.

revoke all on function public.create_offer(
  integer, uuid, text, uuid, text, text, text, text, jsonb, jsonb,
  double precision, double precision, uuid
) from public, anon;
grant execute on function public.create_offer(
  integer, uuid, text, uuid, text, text, text, text, jsonb, jsonb,
  double precision, double precision, uuid
) to authenticated;

-- 6. Sentinel ------------------------------------------------------------------
--
-- Created last inside the transaction, so its presence proves sections 2-5
-- committed. Same pattern as phase52/phase59: the load-bearing objects here
-- are a trigger function and a backfill, neither of which PostgREST can probe.

create or replace function public.marketplace_thread_identity_enabled()
returns boolean
language sql
immutable
as $$
  select true;
$$;

revoke all on function public.marketplace_thread_identity_enabled() from public, anon;
grant execute on function public.marketplace_thread_identity_enabled() to authenticated;

notify pgrst, 'reload schema';

commit;
