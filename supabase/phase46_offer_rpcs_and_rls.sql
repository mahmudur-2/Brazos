-- ============================================================================
-- BRAZOS V2 · Phase 46 · unified offer RPCs, RLS, and legacy compatibility
--
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
-- APPLY AFTER phase45. Section 9's accept_offer() references the `draft` value
-- of job_status, which phase45 adds and commits; Postgres refuses to use an
-- enum value whose adding transaction has not committed, so this ordering is a
-- real dependency, not a convention.
--
-- CONTENTS
--   1. Preconditions
--   2. messages.job_offer_id — the negotiation event log, repointed
--   3. The customer-owns-the-job invariant, enforced (composite FK)
--   4. RLS on job_offers: SELECT for the two parties, and nothing else
--   5. offer_post_event() — internal thread helper
--   6. create_offer()
--   7. counter_offer()
--   8. decline_offer()
--   9. accept_offer()
--  10. my_pending_offers()
--  11. job_offer_count() / job_offer_counts()
--  12. Legacy compatibility shims  <-- READ THE HEADER OF THIS SECTION
--  13. Sentinel
--
-- WHAT THIS FILE DOES NOT DO
--   * It does not drop or rename `bids` or `job_requests`. Both are frozen —
--     no longer the source of truth, still present for rollback and audit.
--     A physical DROP is a later cleanup phase requiring separate approval.
--   * It does not build withdraw or expire. §H.2's `withdrawn`/`expired`
--     values exist (phase43) but nothing reaches them; that is Phase 5.
--   * It does not change notification routing. notify_on_bid() /
--     notify_on_job_request() are untouched — see section 12's note on why
--     they keep firing correctly anyway.
--
-- EVERY RPC BELOW: validates auth.uid(), validates that the caller is a
-- participant or the owner, validates the current lifecycle state BEFORE
-- acting, takes a row lock where it mutates shared state, sets an explicit
-- search_path, and is granted to `authenticated` by name (phase32 revoked the
-- default EXECUTE). There is no client-side fallback path for any of them, by
-- design — the Phase 3A compatibility shim was deleted with this migration.
-- ============================================================================

begin;

-- 1. Preconditions -----------------------------------------------------------

do $$
begin
  if to_regclass('public.job_offers') is null then
    raise exception 'phase43_job_offers_foundation.sql has not been applied — run it first.';
  end if;
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'job_status' and e.enumlabel = 'draft'
  ) then
    raise exception
      'job_status has no ''draft'' value — apply phase45_job_requests_to_job_offers.sql FIRST. accept_offer() below cannot be created without it.';
  end if;
end $$;

-- 2. The negotiation event log, repointed ------------------------------------
--
-- phase18 gave `messages` a job_request_id so a negotiation event could render
-- in the conversation. Offers need the same thing pointing at the new table.
-- Additive: job_request_id stays exactly as it is, so every historical event
-- row keeps resolving. `messages` remains the historical log — nothing here
-- rewrites a past row, and nothing requires a complete message history to
-- reconstruct an offer chain.

alter table public.messages
  add column if not exists job_offer_id uuid
    references public.job_offers(id) on delete cascade;

create index if not exists messages_job_offer_idx
  on public.messages (job_offer_id, created_at);

comment on column public.messages.job_offer_id is
  'The offer revision this message records. Successor to job_request_id, which is kept for historical rows. The event vocabulary is messages_request_event_valid, widened additively by phase43.';

-- 3. The customer-owns-the-job invariant, enforced ---------------------------
--
-- Section 4's SELECT policy gives a job owner every offer on their job by
-- matching customer_id = auth.uid(). That is only correct if customer_id is
-- genuinely the job's client_id on every row. phase43 makes customer_id NOT
-- NULL and pins it constant down a chain, and phase44 populates it from
-- jobs.client_id — but nothing *enforced* the equality, leaving the policy's
-- correctness resting on RPC discipline alone.
--
-- This closes it. Every existing row already satisfies it (phase44 sourced the
-- value from this exact column; phase45's direct offers create the job with
-- client_id = customer_id), so the constraint validates without a rewrite.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'jobs_id_client_key'
  ) then
    alter table public.jobs
      add constraint jobs_id_client_key unique (id, client_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'job_offers_customer_owns_job_fkey'
  ) then
    -- ON DELETE CASCADE is not optional here. phase43 already declared
    -- job_id -> jobs(id) ON DELETE CASCADE, and this constraint covers the
    -- SAME job_id column. Leaving it on the default NO ACTION would put two
    -- contradictory referential actions on one column: deleting a job would
    -- fire a cascade from one FK and a restrict-check from the other, and
    -- Postgres does not guarantee which trigger runs first. Matching the
    -- existing action makes the outcome deterministic — the offers go with
    -- the job, exactly as they already did.
    alter table public.job_offers
      add constraint job_offers_customer_owns_job_fkey
      foreign key (job_id, customer_id) references public.jobs (id, client_id)
      on delete cascade;
  end if;
end $$;

comment on constraint job_offers_customer_owns_job_fkey on public.job_offers is
  'An offer''s customer IS the job''s owner. This is what makes the job-owner half of job_offers_select_party correct at the schema level rather than by RPC convention.';

-- 4. RLS ---------------------------------------------------------------------
--
-- phase43 shipped job_offers with RLS enabled, zero policies and every grant
-- revoked — unreadable by design until the model was settled. It is settled.
--
-- SELECT: the two participants, and only them. Because customer_id is the
-- job's owner (section 3), this single predicate gives the job owner every
-- offer on their job — which is what the compare-bids surface needs — while a
-- competing worker matches only on worker_id and therefore sees exclusively
-- their own chain. One rule, both behaviours, no second policy to keep in
-- sync.
--
-- There is deliberately NO INSERT, UPDATE or DELETE policy. Every mutation
-- goes through the SECURITY DEFINER functions below, so turn order, counter
-- caps, lifecycle gates and sibling supersession cannot be bypassed by writing
-- to the table. The revokes are explicit rather than inherited, matching what
-- phase29 did for jobs and bids.

drop policy if exists "job_offers_select_party" on public.job_offers;
create policy "job_offers_select_party"
  on public.job_offers for select
  to authenticated
  using (customer_id = auth.uid() or worker_id = auth.uid());

grant select on public.job_offers to authenticated;
revoke insert, update, delete on public.job_offers from public, anon, authenticated;

-- Public aggregate counts continue to come from SECURITY DEFINER functions
-- that deliberately bypass this policy (section 11) — a bare integer exposes
-- nothing, and RLS would silently under-count for a browsing worker. Same
-- reasoning phase15 recorded for job_bid_count().

-- The missing policy Phase 3A flagged, now required rather than theoretical.
--
-- A direct offer's job is `draft` + `direct`. The customer reads it through
-- phase1's jobs_select_own; the TARGETED WORKER could not read it at all,
-- because jobs_select_assigned_worker matches on assigned_worker_id and a live
-- offer has not hired anyone yet. Without this, the negotiation card in a
-- worker's chat has no title, category, description or media to render — the
-- fields that used to live on job_requests and now live on the job.
--
-- Scoped to workers who actually hold an offer on the row, so it grants
-- exactly the job a worker is already negotiating and nothing else. Additive
-- and permissive: it widens no existing policy and narrows none.
drop policy if exists "jobs_select_offer_party" on public.jobs;
create policy "jobs_select_offer_party"
  on public.jobs for select
  to authenticated
  using (
    exists (
      select 1 from public.job_offers o
      where o.job_id = jobs.id
        and o.worker_id = auth.uid()
    )
  );

-- jobs_delete_own, repointed. phase29's version let an owner delete their own
-- open job only while nothing had engaged with it, and it measured that as
-- "no rows in `bids`". `bids` is frozen from this migration onward, so that
-- guard silently stops seeing new activity: a job could collect real offers
-- and still look deletable, taking every offer with it through the cascade.
--
-- The bids term is KEPT alongside the new one rather than replaced, so a
-- legacy job whose only engagement predates the unification stays protected
-- too. This strictly narrows what can be deleted; it grants nothing.
drop policy if exists "jobs_delete_own" on public.jobs;
create policy "jobs_delete_own"
  on public.jobs for delete
  to authenticated
  using (
    client_id = auth.uid()
    and status = 'open'
    and public.is_active_user()
    and not exists (select 1 from public.bids b where b.job_id = jobs.id)
    and not exists (select 1 from public.job_offers o where o.job_id = jobs.id)
  );

-- NOTE FOR PHASE 5: a `draft` job created by an unaccepted direct offer is not
-- deletable by anyone, because this policy requires status = 'open'. That is
-- correct for now — withdrawing an offer is Phase 5's job, and it should
-- retire the offer through an RPC rather than by deleting the job underneath
-- it.

-- Realtime. phase43 deliberately withheld this until the read rule existed:
-- Postgres Changes replays raw tuples and applies the ROW check only, sending
-- every column of a row that passes (see phase12's header). Now that the row
-- check is "you are one of the two parties", every column of a delivered row
-- is one both parties may already read, so there is nothing left to leak.
--
-- It is needed for the same reason phase18 published job_requests: the
-- negotiation card's buttons are driven by whose turn it is, so without this a
-- counter or an accept from the other side would leave a stale turn on screen
-- until the thread was reopened.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'job_offers'
  ) then
    alter publication supabase_realtime add table public.job_offers;
  end if;
end $$;

-- 5. Thread helper -----------------------------------------------------------
--
-- Negotiation events render inside a conversation. A chain's thread is fixed
-- by its root message, so every later event posts into whichever thread that
-- message used. A marketplace bid has no thread message (bids have never
-- appeared in chat), so this no-ops for them — preserving today's behaviour
-- exactly rather than newly injecting bids into conversations.
--
-- Internal: never granted to a client role.

create or replace function public.offer_post_event(
  p_offer_id uuid,
  p_root_id uuid,
  p_actor uuid,
  p_event text,
  p_amount integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job uuid;
  v_thread uuid;
begin
  select m.job_id, m.direct_thread_id
    into v_job, v_thread
  from public.messages m
  where m.job_offer_id = p_root_id
    and m.request_event = 'created'
  order by m.created_at
  limit 1;

  -- No root message => not a threaded negotiation (a marketplace bid).
  if v_job is null and v_thread is null then
    return;
  end if;

  insert into public.messages (
    job_id, direct_thread_id, sender_id, content,
    job_offer_id, request_event, request_amount_cents
  )
  values (v_job, v_thread, p_actor, '', p_offer_id, p_event, p_amount);
end;
$$;

revoke all on function public.offer_post_event(uuid, uuid, uuid, text, integer)
  from public, anon, authenticated;

-- 6. create_offer() — open a negotiation -------------------------------------
--
-- One entry point, two shapes, discriminated by whether a job already exists:
--
--   p_job_id given    -> MARKETPLACE BID. A worker answers a public open job.
--                        The job exists; the offer attaches to it.
--   p_job_id null     -> DIRECT OFFER. A customer approaches one named worker.
--                        No public job exists, so the offer brings its own:
--                        a draft/direct job is created here, which is why the
--                        job fields are on this signature at all.
--
-- The two shapes are mutually exclusive and validated as such — passing both a
-- job and a worker is an error, not a silent precedence rule. Splitting this
-- into two functions was considered; it would have made "open a negotiation"
-- two code paths again, which is the thing this phase exists to end.

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

    v_type := 'marketplace_bid';
    v_target_job := v_job.id;
    v_customer := v_job.client_id;
    v_worker := v_actor;
    v_awaiting := v_job.client_id;   -- the owner owes the next move

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
    -- Same field validation phase36's create_job_request() applied, because
    -- these values become a real job row.
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

    v_type := 'direct_offer';
    v_customer := v_actor;
    v_worker := p_worker_id;
    v_awaiting := p_worker_id;

    -- The job this offer is about. `draft` + `direct` keeps it out of the open
    -- feed, the map and the radius search (phase43 gates all four on
    -- status = 'open' AND visibility = 'open_market'), so a private
    -- negotiation still cannot surface publicly — phase18's guarantee, kept.
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

    -- Thread resolution, in phase36's order: a thread the caller names, then
    -- the pair's most recent shared completed job, then their direct thread.
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

  -- The root message, for a threaded (direct) negotiation only. Inserted after
  -- the offer so its FK resolves, and it is what offer_post_event() later
  -- reads to find this chain's thread.
  if v_type = 'direct_offer' then
    insert into public.messages (
      job_id, direct_thread_id, sender_id, content,
      job_offer_id, request_event, request_amount_cents
    )
    values (v_thread, v_direct, v_actor, '', v_offer_id, 'created', p_amount_cents);
  end if;

  return v_offer_id;
exception
  when unique_violation then
    -- job_offers_one_live_bid_per_worker / _direct_per_job / _direct_per_pair.
    raise exception 'You already have a live offer open here. Settle it before sending another.';
end;
$$;

revoke all on function public.create_offer(
  integer, uuid, text, uuid, text, text, text, text, jsonb, jsonb,
  double precision, double precision, uuid
) from public, anon;
grant execute on function public.create_offer(
  integer, uuid, text, uuid, text, text, text, text, jsonb, jsonb,
  double precision, double precision, uuid
) to authenticated;

-- 7. counter_offer() ---------------------------------------------------------
--
-- A counter is a new CHILD row, not an edit. The parent is superseded FIRST
-- and the child inserted second: the partial unique indexes permit exactly one
-- `pending` row per pair per job, so inserting before superseding would
-- collide with the constraint that makes one-live-chain true.
--
-- The three-per-side cap that phase18 kept in client_counters/worker_counters
-- is now simply a count of the chain's rows authored by the caller. There is
-- no counter column to drift out of sync with the chain.

create or replace function public.counter_offer(
  p_offer_id uuid,
  p_amount_cents integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_parent public.job_offers;
  v_job_id uuid;
  v_used integer;
  v_next uuid;
  v_new_id uuid;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Enter an amount greater than zero';
  end if;

  -- Same lock order as accept_offer(): jobs, then job_offers. This function
  -- writes jobs.budget_cents further down for a direct offer, so taking the
  -- offer lock first would invert the order against accept_offer() and the two
  -- could deadlock on a job where one party counters while the other accepts.
  select job_id into v_job_id from public.job_offers where id = p_offer_id;
  if v_job_id is null then
    raise exception 'Offer not found';
  end if;
  perform 1 from public.jobs where id = v_job_id for update;

  select * into v_parent from public.job_offers where id = p_offer_id for update;
  if not found or v_actor not in (v_parent.customer_id, v_parent.worker_id) then
    raise exception 'Offer not found';
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

  select count(*) into v_used
  from public.job_offers o
  where o.root_offer_id = v_parent.root_offer_id
    and o.author_id = v_actor
    and o.parent_offer_id is not null;
  if v_used >= 3 then
    raise exception 'You have used all 3 counter-offers. Accept or decline to continue.';
  end if;

  update public.job_offers
     set status = 'superseded', awaiting_id = null, updated_at = now()
   where id = p_offer_id;

  v_next := case when v_actor = v_parent.customer_id
                 then v_parent.worker_id else v_parent.customer_id end;
  v_new_id := gen_random_uuid();

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

  -- A direct offer's job carries the live proposed price, the way phase18's
  -- job_requests.amount_cents did, so an accept has nothing to recompute.
  if v_parent.offer_type = 'direct_offer' then
    update public.jobs set budget_cents = p_amount_cents where id = v_parent.job_id;
  end if;

  perform public.offer_post_event(
    v_new_id, v_parent.root_offer_id, v_actor, 'countered', p_amount_cents
  );

  return v_new_id;
end;
$$;

revoke all on function public.counter_offer(uuid, integer) from public, anon;
grant execute on function public.counter_offer(uuid, integer) to authenticated;

-- 8. decline_offer() ---------------------------------------------------------

create or replace function public.decline_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_offer public.job_offers;
begin
  if v_actor is null then
    raise exception 'Not signed in';
  end if;

  select * into v_offer from public.job_offers where id = p_offer_id for update;
  if not found or v_actor not in (v_offer.customer_id, v_offer.worker_id) then
    raise exception 'Offer not found';
  end if;
  -- Idempotent: a retry of a decline that already landed is not an error.
  if v_offer.status = 'declined' then
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
$$;

revoke all on function public.decline_offer(uuid) from public, anon;
grant execute on function public.decline_offer(uuid) to authenticated;

-- 9. accept_offer() ----------------------------------------------------------
--
-- §H.2's atomic accept: this offer accepted, every sibling pending offer on
-- the job superseded, the job stamped with the hired worker and the winning
-- offer — all under a lock on both the offer and the job, so two customers
-- accepting two bids at the same instant cannot both win.
--
-- §H.2 says accept moves the job to `pending_payment`. There is no payment
-- system at any layer yet (Phase 5 builds it), so the job goes to `assigned`,
-- which is exactly what accept_bid() and respond_job_request() do today. This
-- preserves current behaviour rather than inventing a state nothing can leave.
--
-- jobs.accepted_bid_id is deliberately NOT written any more: it is an FK to
-- bids(id), and a natively created offer has no bid row to point at. Nothing
-- in the app reads that column (verified) and phase44 left it populated for
-- historical rows, so freezing it is invisible.

create or replace function public.accept_offer(p_offer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_offer public.job_offers;
  v_job public.jobs;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  -- LOCK ORDER: jobs, THEN job_offers. Every function in this file that takes
  -- both locks takes them in that order, and accept_bid() already locked the
  -- job first, so this is the existing strategy rather than a new one.
  --
  -- It is what stops a deadlock. This function updates EVERY sibling offer on
  -- the job (they all lose), so two concurrent accepts on two different offers
  -- of the same job would each hold one offer row and reach for the other's.
  -- Serialising on the job row first makes that impossible: the second caller
  -- waits at the job, not half-way through the sibling sweep.
  --
  -- The unlocked read below is only to learn which job to lock. Every value it
  -- produced is re-read under the lock afterwards and nothing is trusted from
  -- it, so a row that changed in between is caught by the re-check, not acted
  -- on.
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

  -- Idempotent accept: a dropped response or a double tap that got past the
  -- disabled button returns the job that was assigned, rather than raising on
  -- an action that in fact succeeded.
  if v_offer.status = 'accepted' then
    return v_offer.job_id;
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
  -- The offer must still belong to the job that was locked. Re-checked rather
  -- than assumed, because the id came from the unlocked read above.
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

  -- Every other live chain on this job loses, atomically.
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

revoke all on function public.accept_offer(uuid) from public, anon;
grant execute on function public.accept_offer(uuid) to authenticated;

-- 10. my_pending_offers() ----------------------------------------------------
--
-- Drives the inbox badge. Successor to my_pending_job_requests(), with the
-- thread keys derived from the chain's root message rather than stored on the
-- offer — a marketplace bid has no thread and returns nulls for both, which is
-- what the inbox already expects.

create or replace function public.my_pending_offers()
returns table (
  id uuid,
  job_id uuid,
  offer_type text,
  thread_job_id uuid,
  direct_thread_id uuid,
  customer_id uuid,
  worker_id uuid,
  amount_cents integer,
  status text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
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
  order by o.updated_at desc;
$$;

revoke all on function public.my_pending_offers() from public, anon;
grant execute on function public.my_pending_offers() to authenticated;

-- 11. Public counts ----------------------------------------------------------
--
-- The real implementations; job_bid_count/job_bid_counts become wrappers over
-- these in section 12 so the two can never disagree.
--
-- Counts ROOT marketplace offers, i.e. distinct bidding workers — not rows.
-- Counting rows would inflate the number every time someone countered, so a
-- job with one worker mid-negotiation would advertise "3 bids".
--
-- SECURITY DEFINER on purpose, exactly as phase15 documented: job_offers RLS
-- gives a browsing worker only their own row, so a plain count would silently
-- return 0 for everyone but the owner. A bare integer exposes no amount, no
-- message and no identity.

create or replace function public.job_offer_count(p_job_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int
  from public.job_offers o
  where o.job_id = p_job_id
    and o.offer_type = 'marketplace_bid'
    and o.parent_offer_id is null;
$$;

comment on function public.job_offer_count(uuid) is
  'Count of distinct marketplace bidders on a job (root offers only), readable by anyone. Bypasses job_offers RLS deliberately — a bare count exposes nothing sensitive.';

create or replace function public.job_offer_counts(p_job_ids uuid[])
returns table (job_id uuid, offer_count integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.job_id, count(*)::int
  from public.job_offers o
  where auth.uid() is not null
    and p_job_ids is not null
    and array_length(p_job_ids, 1) <= 200
    and o.job_id = any (p_job_ids)
    and o.offer_type = 'marketplace_bid'
    and o.parent_offer_id is null
  group by o.job_id;
$$;

comment on function public.job_offer_counts(uuid[]) is
  'Batched job_offer_count(). Jobs with no offers are absent; the caller treats a missing id as zero. Capped at 200 ids so this cannot become a bulk scan.';

revoke all on function public.job_offer_count(uuid) from public, anon;
grant execute on function public.job_offer_count(uuid) to authenticated;
revoke all on function public.job_offer_counts(uuid[]) from public, anon;
grant execute on function public.job_offer_counts(uuid[]) to authenticated;

-- 12. Legacy compatibility shims =============================================
--
-- READ THIS BEFORE CHANGING ANYTHING BELOW.
--
-- BRAZOS ships as an installed Expo binary. Users run old builds for weeks
-- after a release, and those builds call create_bid(), accept_bid(),
-- job_bid_count(), job_bid_counts(), create_job_request() and
-- respond_job_request() by name. Dropping those functions, or leaving them in
-- place raising an error, breaks bidding and hiring on every phone that has
-- not updated. So each keeps its exact name, parameter list and return type,
-- and its body now operates on job_offers.
--
-- These six are TEMPORARY. They are removed in the first phase that can
-- enforce a minimum app version — see the Deprecation section of
-- docs/emerald-v2/ARCHITECTURE_DECISION_job_offers.md. They are not a second
-- implementation: every one of them delegates, none contains negotiation logic
-- of its own.
--
-- THE READ PATH, AND THE ONE DELIBERATE ASYMMETRY
-- ------------------------------------------------
-- A function shim cannot cover a table SELECT. Old builds read `bids` and
-- `job_requests` directly through PostgREST, and no RPC can intercept that.
--
--   * `bids` — 25 live rows, real ongoing usage. create_bid()/accept_bid()
--     therefore ALSO mirror into `bids`, using the same id (phase44 already
--     made bid ids and offer ids the same values), so an old build keeps
--     seeing its own bids and the poster keeps seeing the list. The mirror is
--     write-only compatibility: nothing in the new app reads `bids`, and
--     job_offers is the only source of truth. This is a deliberate, temporary
--     exception to "stop writing to the frozen tables", taken because the
--     alternative is a silent read break on live installs.
--
--   * `job_requests` — 0 live rows, 0 accepted rows, 1 dead legacy row
--     (measured 2026-08-08). No mirror is written, because there is no user to
--     protect and mirroring a mutating single-row negotiation would mean
--     re-implementing phase18's counter bookkeeping. An old build can still
--     SEND a direct offer; it will not render the live negotiation card. With
--     zero production usage this is a documented degradation, not a break.
--
-- NOTIFICATIONS: notify_on_bid()/notify_on_job_request() are triggers on
-- `bids`/`job_requests`. The bids mirror means bid notifications keep firing
-- unchanged. Direct-offer notifications stop, along with the zero rows that
-- would have produced them. Notification routing is Phase 12; nothing is added
-- here beyond leaving the existing paths working.

-- create_bid() — same signature, same `public.bids` return type. The returned
-- row is assembled from the created offer; the mirror insert is what an old
-- client will later read back.
create or replace function public.create_bid(
  p_job_id uuid,
  p_amount_cents integer,
  p_message text default ''
)
returns public.bids
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offer_id uuid;
  v_offer public.job_offers;
  v_bid public.bids;
begin
  v_offer_id := public.create_offer(
    p_amount_cents := p_amount_cents,
    p_job_id := p_job_id,
    p_message := p_message
  );

  select * into v_offer from public.job_offers where id = v_offer_id;

  insert into public.bids (id, job_id, worker_id, amount_cents, message, status, created_at)
  values (
    v_offer.id, v_offer.job_id, v_offer.worker_id, v_offer.amount_cents,
    v_offer.message, 'pending'::public.bid_status, v_offer.created_at
  )
  -- Untargeted on purpose. `bids` still carries phase1's UNCONDITIONAL
  -- unique (job_id, worker_id), so a worker opening a SECOND chain on a job
  -- after their first one settled — which the new one-active-chain rule
  -- permits — would collide on that index, not on the id. The offer is
  -- already written and authoritative either way; the mirror is best-effort
  -- compatibility and must never fail the real write.
  on conflict do nothing;

  v_bid.id := v_offer.id;
  v_bid.job_id := v_offer.job_id;
  v_bid.worker_id := v_offer.worker_id;
  v_bid.amount_cents := v_offer.amount_cents;
  v_bid.message := v_offer.message;
  v_bid.status := 'pending'::public.bid_status;
  v_bid.created_at := v_offer.created_at;
  return v_bid;
end;
$$;

revoke all on function public.create_bid(uuid, integer, text) from public, anon;
grant execute on function public.create_bid(uuid, integer, text) to authenticated;

comment on function public.create_bid(uuid, integer, text) is
  'DEPRECATED compatibility shim (phase46). Delegates to create_offer() and mirrors into bids for old app builds. Remove once a minimum app version can be enforced.';

-- accept_bid() — same signature, same void return.
create or replace function public.accept_bid(p_job_id uuid, p_bid_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job_id uuid;
begin
  if not exists (
    select 1 from public.job_offers o where o.id = p_bid_id and o.job_id = p_job_id
  ) then
    raise exception 'Bid not found for this job';
  end if;

  v_job_id := public.accept_offer(p_bid_id);

  -- Keep the legacy table's statuses consistent for old readers.
  update public.bids set status = 'accepted'::public.bid_status where id = p_bid_id;
  update public.bids
     set status = 'rejected'::public.bid_status
   where job_id = v_job_id and id <> p_bid_id and status = 'pending'::public.bid_status;
end;
$$;

revoke all on function public.accept_bid(uuid, uuid) from public, anon;
grant execute on function public.accept_bid(uuid, uuid) to authenticated;

comment on function public.accept_bid(uuid, uuid) is
  'DEPRECATED compatibility shim (phase46). Delegates to accept_offer() and mirrors statuses into bids for old app builds. Remove once a minimum app version can be enforced.';

-- job_bid_count() / job_bid_counts() — repointed at job_offers so a mixed
-- fleet of old and new builds never sees two different numbers for one job.
create or replace function public.job_bid_count(p_job_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select public.job_offer_count(p_job_id) $$;

create or replace function public.job_bid_counts(p_job_ids uuid[])
returns table (job_id uuid, bid_count integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select c.job_id, c.offer_count from public.job_offer_counts(p_job_ids) c $$;

revoke all on function public.job_bid_count(uuid) from public, anon;
grant execute on function public.job_bid_count(uuid) to authenticated;
revoke all on function public.job_bid_counts(uuid[]) from public, anon;
grant execute on function public.job_bid_counts(uuid[]) to authenticated;

comment on function public.job_bid_count(uuid) is
  'DEPRECATED compatibility shim (phase46) — now a wrapper over job_offer_count(). Remove once a minimum app version can be enforced.';
comment on function public.job_bid_counts(uuid[]) is
  'DEPRECATED compatibility shim (phase46) — now a wrapper over job_offer_counts(). Remove once a minimum app version can be enforced.';

-- create_job_request() — 11-argument phase36 signature preserved exactly.
create or replace function public.create_job_request(
  p_worker_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_location text,
  p_amount_cents integer,
  p_photos jsonb default '[]'::jsonb,
  p_lat double precision default null,
  p_lng double precision default null,
  p_thread_job_id uuid default null,
  p_videos jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.create_offer(
    p_amount_cents := p_amount_cents,
    p_worker_id := p_worker_id,
    p_title := p_title,
    p_description := p_description,
    p_category := p_category,
    p_location := p_location,
    p_photos := p_photos,
    p_videos := p_videos,
    p_lat := p_lat,
    p_lng := p_lng,
    p_thread_job_id := p_thread_job_id
  );
end;
$$;

revoke all on function public.create_job_request(
  uuid, text, text, text, text, integer, jsonb, double precision, double precision, uuid, jsonb
) from public, anon;
grant execute on function public.create_job_request(
  uuid, text, text, text, text, integer, jsonb, double precision, double precision, uuid, jsonb
) to authenticated;

comment on function public.create_job_request(uuid, text, text, text, text, integer, jsonb, double precision, double precision, uuid, jsonb) is
  'DEPRECATED compatibility shim (phase46). Delegates to create_offer()''s direct branch. Returns an offer id, not a job_requests id — old builds cannot render the resulting negotiation card (zero production impact: no live rows existed at cutover). Remove once a minimum app version can be enforced.';

-- respond_job_request() — 3-argument signature preserved exactly.
create or replace function public.respond_job_request(
  p_request_id uuid,
  p_action text,
  p_amount_cents integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_action = 'accept' then
    return public.accept_offer(p_request_id);
  elsif p_action = 'decline' then
    perform public.decline_offer(p_request_id);
    return null;
  elsif p_action = 'counter' then
    perform public.counter_offer(p_request_id, p_amount_cents);
    return null;
  end if;
  raise exception 'Unknown action: %', p_action;
end;
$$;

revoke all on function public.respond_job_request(uuid, text, integer) from public, anon;
grant execute on function public.respond_job_request(uuid, text, integer) to authenticated;

comment on function public.respond_job_request(uuid, text, integer) is
  'DEPRECATED compatibility shim (phase46). Delegates to accept_offer()/decline_offer()/counter_offer(). Remove once a minimum app version can be enforced.';

-- my_pending_job_requests() — return shape preserved; now reads the direct
-- offers out of job_offers so an old inbox badge still counts correctly.
create or replace function public.my_pending_job_requests()
returns table (
  id uuid,
  thread_job_id uuid,
  direct_thread_id uuid,
  client_id uuid,
  worker_id uuid,
  amount_cents integer,
  status text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.id, o.thread_job_id, o.direct_thread_id,
         o.customer_id, o.worker_id, o.amount_cents, o.status, o.updated_at
  from public.my_pending_offers() o
  where o.offer_type = 'direct_offer';
$$;

revoke all on function public.my_pending_job_requests() from public, anon;
grant execute on function public.my_pending_job_requests() to authenticated;

comment on function public.my_pending_job_requests() is
  'DEPRECATED compatibility shim (phase46) — now a filtered view of my_pending_offers(). Remove once a minimum app version can be enforced.';

-- 13. Sentinel ---------------------------------------------------------------
--
-- Created last inside this file's single transaction, so its presence proves
-- the whole migration committed. scripts/verify-schema.mjs reads it to decide
-- whether phase46's checks are pending or mandatory.

create or replace function public.job_offer_rpcs_enabled()
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$ select true $$;

comment on function public.job_offer_rpcs_enabled() is
  'Marker for scripts/verify-schema.mjs: phase46_offer_rpcs_and_rls.sql has been applied. Created last inside phase46''s transaction, so its presence proves the entire file committed.';

revoke all on function public.job_offer_rpcs_enabled() from public, anon;
grant execute on function public.job_offer_rpcs_enabled() to authenticated;

notify pgrst, 'reload schema';

commit;
