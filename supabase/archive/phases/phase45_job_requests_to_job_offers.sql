-- ============================================================================
-- BRAZOS V2 · Phase 45 · migrate `job_requests` into `job_offers`
--
-- FINALIZED 2026-08-08. Apply FIRST, before phase46. Safe to re-run.
--
-- Both Phase 3A gates are cleared:
--
-- GATE 1 — the requirement-3 live-row check. STRUCTURAL half already passed in
--   3A (every NOT NULL, no-default column on `jobs`/`job_locations` is
--   derivable from `job_requests`, proven by respond_job_request() performing
--   this exact insert in production). ROW-LEVEL half run by the user against
--   the live database on 2026-08-08: live_total = 0, accepted_total = 0,
--   not_migrated_total = 1, every hard-stop column 0, and both
--   chain-fidelity counts 0. The guards in section 2 re-assert all of it at
--   apply time, so a row created between then and the run cannot slip past.
--
-- GATE 2 — sequencing behind the UI. lib/jobs.ts's fetchJobsByClient() now
--   excludes unaccepted direct drafts, and that fix ships in the same commit
--   sequence as this file. With live_total = 0 there is additionally no
--   existing row that could produce a phantom My Jobs entry.
--
-- APPLY ORDER: phase45 THEN phase46. Section 1 adds the `draft` value to the
--   job_status enum and commits it; phase46's accept_offer() references that
--   value, and Postgres refuses to use an enum value added by a transaction
--   that has not yet committed. That dependency, not convention, is what fixes
--   the order.
--
-- ---------------------------------------------------------------------------
-- WHAT IT DOES, WHEN IT IS EVENTUALLY RUN
--
--   A. ACCEPTED requests -> one root offer, status `accepted`, attached to the
--      job that already exists (job_requests.created_job_id). No job is
--      created; nothing is invented.
--
--   B. LIVE requests (pending/countered) -> a draft/direct `jobs` row (+ a
--      `job_locations` row when and only when the request carries both
--      coordinates, exactly as respond_job_request() does), then the
--      negotiation CHAIN, reconstructed from the `messages` event log.
--
--   NOT MIGRATED: declined and closed requests. They have no job row and never
--      will, and `job_offers.job_id` is NOT NULL — so migrating them would
--      mean fabricating a job for a negotiation that never produced one. Their
--      history stays in `messages`, which is the historical log by design.
--      Phase 3B must decide deliberately whether job_offers should carry dead
--      negotiations at all; this file will not decide it by inventing rows.
--
-- WHY THE CHAIN IS RECONSTRUCTED RATHER THAN COLLAPSED
--   phase18's job_requests is ONE MUTATING ROW: each counter overwrites
--   amount_cents and increments client_counters / worker_counters, which are
--   what enforce the three-counters-per-side cap. Collapsing a live
--   negotiation into a single job_offers row would silently hand both parties
--   three fresh counters mid-negotiation. The `messages` log already holds the
--   full, ordered, attributed history (request_event + request_amount_cents +
--   sender_id), so the chain is rebuilt from it — and then CHECKED against the
--   stored counter columns. If the rebuilt chain and the stored counts
--   disagree by even one, the whole migration aborts rather than guessing.
-- ============================================================================

-- 0. Preconditions -----------------------------------------------------------
--
-- The DRAFT interlock that stood here in Phase 3A is removed: both gates it
-- guarded are cleared (see the header). The dependency checks below stay —
-- they guard against running the files out of order, which is a different
-- failure and still possible.

begin;

do $$
begin
  if to_regclass('public.job_offers') is null then
    raise exception 'phase43_job_offers_foundation.sql has not been applied — run it first.';
  end if;
  if not exists (select 1 from public.job_offers where source_table = 'bids')
     and exists (select 1 from public.bids) then
    raise exception 'phase44_backfill_bids_to_job_offers.sql has not been applied — run it first.';
  end if;
end $$;

commit;

-- 1. The `draft` job state ---------------------------------------------------
--
-- A job carrying a live, unaccepted offer is neither `open` (that would put a
-- private negotiation into the public feed, the exact failure phase18 was
-- built to prevent) nor `assigned` (that would claim a hire that has not
-- happened). BRAZOS_MASTER_PLAN.md §H.1 already names the state: `draft` is
-- the first job-lifecycle status. The value comes from the plan; it is not
-- invented here.
--
-- ALTER TYPE ... ADD VALUE may run inside a transaction on modern Postgres,
-- but the new value cannot be USED until that transaction has committed
-- ("unsafe use of new value of enum type"). Hence the explicit commit, exactly
-- as phase23 does for job_category. Harmless if the SQL Editor autocommits
-- each statement; load-bearing if it does not.

alter type public.job_status add value if not exists 'draft';

commit;

begin;

-- 2. Preconditions -----------------------------------------------------------
--
-- Every check below is a refusal. None of them repairs anything.

do $$
declare
  v_bad integer;
  v_detail text;
begin
  -- Unmapped status values.
  select string_agg(distinct r.status, ', ') into v_detail
    from public.job_requests r
   where r.status not in ('pending', 'countered', 'accepted', 'declined', 'closed');
  if v_detail is not null then
    raise exception
      'job_requests.status holds value(s) with no mapping: %. Extend section 3 before running.', v_detail;
  end if;

  -- An accepted request MUST have produced a job. If one has not, its offer
  -- has nothing to attach to and the operator has to look at it.
  select count(*) into v_bad
    from public.job_requests r
   where r.status = 'accepted' and r.created_job_id is null;
  if v_bad > 0 then
    raise exception
      '% accepted job_request(s) have no created_job_id. job_offers.job_id is NOT NULL, so these cannot be migrated without inventing a job. Inspect them first.', v_bad;
  end if;

  -- Participants must differ (job_offers_parties_distinct). job_requests has
  -- its own job_requests_no_self CHECK, so this should be vacuous — asserted
  -- because "should be" is not "is".
  --
  -- Scoped to the rows this migration actually converts. A declined/closed
  -- legacy row is never read, never written and never becomes an offer, so a
  -- defect in one is not a reason to block a migration that does not touch it.
  select count(*) into v_bad
    from public.job_requests r
   where r.client_id = r.worker_id
     and r.status in ('pending', 'countered', 'accepted');
  if v_bad > 0 then
    raise exception
      '% live/accepted job_request(s) have client_id = worker_id.', v_bad;
  end if;

  -- Same scoping, same reason: amount and title are only load-bearing for a
  -- row that becomes an offer or a job.
  select count(*) into v_bad
    from public.job_requests r
   where r.status in ('pending', 'countered', 'accepted')
     and (r.amount_cents <= 0 or btrim(coalesce(r.title, '')) = '' or r.category is null);
  if v_bad > 0 then
    raise exception
      '% live/accepted job_request(s) have a non-positive amount, an empty title, or no category — none can be populated without inventing data.', v_bad;
  end if;

  -- Every LIVE request needs exactly one 'created' event to root its chain.
  select count(*) into v_bad
    from public.job_requests r
   where r.status in ('pending', 'countered')
     and (
       select count(*) from public.messages m
        where m.job_request_id = r.id and m.request_event = 'created'
     ) <> 1;
  if v_bad > 0 then
    raise exception
      '% live job_request(s) do not have exactly one ''created'' event in messages. The chain cannot be reconstructed for these; resolve before migrating.', v_bad;
  end if;

  -- The reconstructed counter counts must match the stored caps, per side.
  -- This is the fidelity check that makes reconstruction trustworthy: if the
  -- message log and the counter columns disagree, the rebuilt chain would
  -- hand someone counters they have already used.
  select count(*) into v_bad
    from public.job_requests r
   where r.status in ('pending', 'countered')
     and (
       (select count(*) from public.messages m
         where m.job_request_id = r.id
           and m.request_event = 'countered'
           and m.sender_id = r.client_id) <> r.client_counters
       or
       (select count(*) from public.messages m
         where m.job_request_id = r.id
           and m.request_event = 'countered'
           and m.sender_id = r.worker_id) <> r.worker_counters
     );
  if v_bad > 0 then
    raise exception
      '% live job_request(s) have a message log that disagrees with client_counters/worker_counters. Reconstructing their chain would reset counter caps. Aborting rather than guessing.', v_bad;
  end if;

  -- The newest event's amount must be the request's current amount, or the
  -- reconstructed chain would end on the wrong price.
  select count(*) into v_bad
    from public.job_requests r
   where r.status in ('pending', 'countered')
     and coalesce((
       select m.request_amount_cents
         from public.messages m
        where m.job_request_id = r.id
          and m.request_event in ('created', 'countered')
        order by m.created_at desc, m.id desc
        limit 1
     ), -1) <> r.amount_cents;
  if v_bad > 0 then
    raise exception
      '% live job_request(s) have a latest message amount that differs from amount_cents. Aborting rather than guessing which is current.', v_bad;
  end if;
end $$;

-- 3. A. Accepted requests -> one accepted root offer -------------------------
--
-- These attach to the job that respond_job_request() already created, so no
-- job row is materialized. The chain is collapsed to a single row on purpose:
-- a settled negotiation's counter caps can never be consumed again, so there
-- is no fidelity to preserve, and `messages` still holds the full history.

insert into public.job_offers (
  id, job_id, offer_type, parent_offer_id, root_offer_id,
  customer_id, worker_id, author_id, awaiting_id,
  amount_cents, message, status,
  source_table, source_id, created_at, updated_at
)
select
  r.id,                       -- reuse the request id, as phase44 reuses bid ids
  r.created_job_id,
  'direct_offer'::public.offer_type,
  null,
  r.id,
  r.client_id,
  r.worker_id,
  r.client_id,                -- a direct offer is opened by the customer
  null,                       -- settled: nobody owes a move
  r.amount_cents,
  null,
  'accepted'::public.offer_status,
  'job_requests',
  r.id,
  r.created_at,
  r.updated_at
from public.job_requests r
where r.status = 'accepted'
  and r.created_job_id is not null
on conflict (id) do update
   set status     = excluded.status,
       updated_at = now()
 where job_offers.source_table = 'job_requests';

-- Link the accepted job to the offer that won it, mirroring phase44.
update public.jobs j
   set accepted_offer_id = r.id
  from public.job_requests r
 where r.created_job_id = j.id
   and r.status = 'accepted'
   and j.accepted_offer_id is distinct from r.id
   and exists (select 1 from public.job_offers o where o.id = r.id);

-- 4. B. Live requests -> draft/direct job + reconstructed chain --------------
--
-- Written as a loop rather than one large CTE because it spans three tables
-- with a per-row ordering dependency, and because a loop can carry the
-- per-request guards that make a partial or wrong reconstruction impossible.

do $$
declare
  r            public.job_requests;
  ev           record;
  v_job_id     uuid;
  v_root_id    uuid;
  v_prev_id    uuid;
  v_seq        integer;
  v_total      integer;
  v_jobs_made  integer := 0;
  v_offers     integer := 0;
begin
  for r in
    select * from public.job_requests
     where status in ('pending', 'countered')
     order by created_at
  loop
    -- Already migrated? The root offer's provenance is the link; there is no
    -- column on job_requests pointing at the materialized job, deliberately —
    -- writing one would leave an orphan draft behind if the request is later
    -- accepted through the untouched respond_job_request() path.
    select o.job_id into v_job_id
      from public.job_offers o
     where o.source_table = 'job_requests' and o.source_id = r.id;

    if v_job_id is null then
      v_job_id := gen_random_uuid();

      -- Every column below is sourced 1:1 from the request. This is the same
      -- insert respond_job_request() performs on accept, minus the two fields
      -- that assert a hire (assigned_worker_id, final_amount_cents), plus the
      -- two this migration defines (status, visibility).
      insert into public.jobs (
        id, client_id, title, description, category, location,
        budget_cents, status, visibility, photos, videos, created_at
      )
      values (
        v_job_id,
        r.client_id,
        r.title,
        r.description,
        r.category::public.job_category,
        r.location,
        r.amount_cents,
        'draft'::public.job_status,
        'direct'::public.job_visibility,
        coalesce(r.photos, '[]'::jsonb),
        coalesce(r.videos, '[]'::jsonb),
        r.created_at
      );
      v_jobs_made := v_jobs_made + 1;

      -- Coordinates only when BOTH are present — the same condition
      -- respond_job_request() applies. job_locations.lat/lng are NOT NULL, so
      -- a half-populated pair is skipped rather than defaulted to anything.
      if r.lat is not null and r.lng is not null then
        insert into public.job_locations (job_id, lat, lng)
        values (v_job_id, r.lat, r.lng)
        on conflict (job_id) do nothing;
      end if;
    end if;

    -- Rebuild the chain from the event log. Offer ids are the ids of the
    -- messages they were reconstructed from, which makes this loop idempotent
    -- without a synthetic key. Provenance (source_table/source_id) is carried
    -- on the ROOT only, so job_offers_source_row_key stays one-row-per-request
    -- and section 4's "already migrated?" lookup above stays unambiguous.
    select count(*) into v_total
      from public.messages m
     where m.job_request_id = r.id
       and m.request_event in ('created', 'countered');

    v_seq := 0;
    v_prev_id := null;
    v_root_id := null;

    for ev in
      select m.id, m.sender_id, m.request_event, m.request_amount_cents, m.created_at
        from public.messages m
       where m.job_request_id = r.id
         and m.request_event in ('created', 'countered')
       order by m.created_at, m.id
    loop
      v_seq := v_seq + 1;
      if v_seq = 1 then
        v_root_id := ev.id;
      end if;

      insert into public.job_offers (
        id, job_id, offer_type, parent_offer_id, root_offer_id,
        customer_id, worker_id, author_id, awaiting_id,
        amount_cents, message, status,
        source_table, source_id, created_at, updated_at
      )
      values (
        ev.id,
        v_job_id,
        'direct_offer'::public.offer_type,
        v_prev_id,
        v_root_id,
        r.client_id,
        r.worker_id,
        ev.sender_id,
        -- Only the newest revision is live, and it is waiting on whoever
        -- job_requests says it is waiting on. Ancestors are settled history.
        case when v_seq = v_total then r.awaiting_id else null end,
        ev.request_amount_cents,
        null,
        case when v_seq = v_total
             then 'pending'::public.offer_status
             else 'superseded'::public.offer_status
        end,
        case when v_seq = 1 then 'job_requests' else null end,
        case when v_seq = 1 then r.id else null end,
        ev.created_at,
        ev.created_at
      )
      on conflict (id) do update
         set status      = excluded.status,
             awaiting_id = excluded.awaiting_id,
             job_id      = excluded.job_id,
             updated_at  = now();

      v_prev_id := ev.id;
      v_offers := v_offers + 1;
    end loop;
  end loop;

  raise notice 'phase45: materialized % draft/direct job(s)', v_jobs_made;
  raise notice 'phase45: wrote % offer row(s) for live negotiations', v_offers;
end $$;

-- 5. Report ------------------------------------------------------------------

do $$
declare
  v_live      integer;
  v_live_migr integer;
  v_acc       integer;
  v_acc_migr  integer;
  v_skipped   integer;
begin
  select count(*) into v_live
    from public.job_requests where status in ('pending', 'countered');
  select count(*) into v_live_migr
    from public.job_requests r
   where r.status in ('pending', 'countered')
     and exists (
       select 1 from public.job_offers o
        where o.source_table = 'job_requests' and o.source_id = r.id
     );
  select count(*) into v_acc
    from public.job_requests where status = 'accepted';
  select count(*) into v_acc_migr
    from public.job_offers where source_table = 'job_requests' and status = 'accepted';
  select count(*) into v_skipped
    from public.job_requests where status in ('declined', 'closed');

  raise notice 'phase45: live requests %/% migrated', v_live_migr, v_live;
  raise notice 'phase45: accepted requests %/% migrated', v_acc_migr, v_acc;
  raise notice 'phase45: % declined/closed request(s) deliberately NOT migrated (no job row exists; see header)', v_skipped;

  if v_live_migr <> v_live then
    raise exception 'phase45: % of % live requests migrated. Rolled back.', v_live_migr, v_live;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
