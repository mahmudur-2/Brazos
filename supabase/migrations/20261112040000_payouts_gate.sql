-- 20261112040000_payouts_gate.sql — lean B11 (docs/critical/job-lifecycle.md, B11): a worker who
-- cannot be paid cannot send, counter or accept an offer, and cannot be hired.
--
--   1. worker_payouts_ready(p_user): payment_accounts.payouts_enabled, false with no row. Always
--      asked about the WORKER of the offer, never about the caller.
--   2. create_offer(): a bid on an open job (the bidder is the worker) needs it. A customer's hire
--      request to a worker with no payout account is still allowed (it is the nudge).
--   3. counter_offer(): the worker's counter needs it; the customer's counter does not.
--   4. accept_offer(): the hire needs it, whoever accepts; the worker and the customer each get
--      their own sentence.
--
-- Bodies copied whole from their newest (and only) definition, 20260901000000_baseline.sql
-- (accept_offer :258, counter_offer :992, create_offer :1387), plus the gate lines only. Same
-- signatures. Known limit: payouts_enabled moves only when connect-status runs, so it can be stale
-- in both directions; the app runs that refresh where it shows the gate card.
--
-- The gate is on the server and does not know a build's payments mode, so a build in mode
-- 'disabled' cannot take bids.
--
-- ACLs restated, never left to default privileges: the three keep exactly the baseline's grant
-- (authenticated). The helper is owner-only: its three callers are security definer functions
-- owned by postgres, so no role needs it and none keeps it.

begin;

-- ---------------------------------------------------------------------------
-- 1. The helper.
-- ---------------------------------------------------------------------------
create or replace function public.worker_payouts_ready(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select a.payouts_enabled from public.payment_accounts a where a.user_id = p_user), false)
$$;
revoke all on function public.worker_payouts_ready(uuid) from public, anon, authenticated, service_role;
comment on function public.worker_payouts_ready(uuid) is
  'B11: true when this worker can be paid (payment_accounts.payouts_enabled), false with no row. Owner-only; asked by create_offer, counter_offer and accept_offer about the worker of the offer.';

-- ---------------------------------------------------------------------------
-- 2. create_offer: the bid branch is gated.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."create_offer"("p_amount_cents" integer, "p_job_id" "uuid" DEFAULT NULL::"uuid", "p_message" "text" DEFAULT NULL::"text", "p_worker_id" "uuid" DEFAULT NULL::"uuid", "p_title" "text" DEFAULT NULL::"text", "p_description" "text" DEFAULT NULL::"text", "p_category" "text" DEFAULT NULL::"text", "p_location" "text" DEFAULT NULL::"text", "p_photos" "jsonb" DEFAULT '[]'::"jsonb", "p_videos" "jsonb" DEFAULT '[]'::"jsonb", "p_lat" double precision DEFAULT NULL::double precision, "p_lng" double precision DEFAULT NULL::double precision, "p_thread_job_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;
revoke all on function public.create_offer(integer, uuid, text, uuid, text, text, text, text, jsonb, jsonb, double precision, double precision, uuid) from public, anon, authenticated, service_role;
grant execute on function public.create_offer(integer, uuid, text, uuid, text, text, text, text, jsonb, jsonb, double precision, double precision, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. counter_offer: the worker's counter is gated.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."counter_offer"("p_offer_id" "uuid", "p_amount_cents" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_parent public.job_offers;
  v_job_id uuid;
  v_used integer;
  v_next uuid;
  v_new_id uuid;
  -- phase63: the cap, named once. Mirrored by MAX_COUNTERS_PER_SIDE in
  -- lib/offers.ts, which only drives what the UI offers — this is the
  -- enforcement.
  v_max_per_side constant integer := 10;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Enter an amount greater than zero';
  end if;

  select job_id into v_job_id from public.job_offers where id = p_offer_id;
  if v_job_id is null then
    raise exception 'Offer not found';
  end if;
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
$$;
revoke all on function public.counter_offer(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.counter_offer(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. accept_offer: the hire is gated, after the worker-is-active check.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."accept_offer"("p_offer_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_offer public.job_offers;
  v_job public.jobs;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  -- LOCK ORDER: jobs, THEN job_offers — phase46's rule, unchanged.
  select job_id into v_job.id from public.job_offers where id = p_offer_id;
  if v_job.id is null then
    raise exception 'Offer not found';
  end if;

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
$$;
revoke all on function public.accept_offer(uuid) from public, anon, authenticated, service_role;
grant execute on function public.accept_offer(uuid) to authenticated;

commit;
