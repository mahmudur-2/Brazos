-- post_window — production-36h S4, step C2 (my M2, verdicts C01a and C09; critic A6-06, A6-07): no
-- job is posted for a time already gone; no new work is posted while posting is paused; no job is
-- taken once its booked window has ended.
--
-- WHAT WAS WRONG.
--   * create_job() and update_job_details() accepted a day and arrival window already over: the post
--     went live for a time nobody can come, and expire_open_jobs() closed it the next day.
--   * The postingEnabled switch (app_config, 20260905000000_stripe_foundation.sql:309) was read only
--     by the app: an old or modified app could post while posting was paused.
--   * accept_offer() hired on a job whose window had ended, even days before. A hire made after
--     the window end + 24 hours is closed by the sweeps at once (expire_open_jobs, an open job;
--     close_no_show_hires, a paid hire with no arrival: 20261111100300_open_job_expiry.sql:42-43,
--     20261112010900_dispute_notice.sql:54), and one made in the 24 hours before that, a day it can
--     no longer be worked, is closed and refunded as a no-show.
--
-- WHAT CHANGES (each restated body is the live one verbatim, plus ONE post_window block):
--   1. Two new helpers, each the one definition of its rule; owner only (no caller grant):
--      posting_paused() (postingEnabled read exactly as begin_job_payment reads paymentsEnabled:
--      absent = on, only the jsonb boolean true is on) and job_window_over(day, end hour, at) (the
--      window has ended at that instant, from the end instant itself on; no day: never).
--      A7-04: posting_paused() reads the row FOR SHARE in that same statement (so it is volatile):
--      the lock is held to the end of the caller's transaction, so a pause cannot commit between
--      the read and the caller's commit. create_job, create_offer and advance_job_series all read
--      the switch through it, with the same lock.
--   2. create_job() (20260930000600_needed_today.sql): after the sign-in check, refused while
--      posting is paused, then for a window already over.
--   3. update_job_details() (20260930000400_job_pricing_mode.sql): after the edit checks, a CHANGED
--      day or window may not be over (an old post keeps its own day and can still be edited).
--   4. create_offer() (20261112040000_payouts_gate.sql): a direct offer (it makes a draft job) is
--      refused while posting is paused. Bids and counters on existing jobs are untouched by the
--      pause (a bid or counter on a job whose window is over: item 7).
--   5. accept_offer() (20261112040000_payouts_gate.sql): after the idempotent return, a NEW
--      acceptance is refused once the booked window has ended (job_window_over). An offer already
--      accepted still answers with its job; a job with no day has no cutoff. The customer cannot
--      give an open job with offers a later time (update_job_details refuses any job with an offer:
--      20260930000400_job_pricing_mode.sql:272-275), so the sentence names posting it again; to
--      the worker (A7-03), asking the customer to.
--   6. advance_job_series() (20260930001000_job_series.sql): after the daytime check, the
--      postingEnabled row is locked for share (held to the end of the run, so a pause committed
--      during the run waits, and every create_job inside the run gets the same answer), then the
--      run returns 0 while posting is paused: nothing raises inside the schedule (its per-series
--      handler would skip the visit for ever) and nothing rolls forward.
--      TIMER: each way out of a run ends by reporting it, record_timer_run(the cron job's name
--      'brazos-job-series', no error, late after 4 hours = four hourly runs) (attention_plain), so
--      a timer that stopped is a timer_late line on payment_attention. A night run and a paused run
--      report too: the timer works, it only waits. The run's own per-series handler is unchanged.
--      A7-06: the report goes through report_timer_run (release_clock 5b), so an error in the
--      report is a warning and never undoes the run's posts. Limit: a cancelled statement (a
--      timeout) is not caught.
--      LIMITS, NAMED: after the pause, a visit not yet offered that has come closer than two days
--      is skipped by the existing two-day rule; it is never posted late. A first refusal that was
--      waiting (A7-07) opens to bids when its day is tomorrow or later, as in the normal design;
--      when its day is today or gone it is never posted: its offer expires, the draft stays
--      unlisted and the series moves to the next visit (the schedule-was-down skip). A pause made
--      by INSERTING the row while it is absent (absent = on) is not held off by the lock; the
--      supported flip is the UPDATE.
--   7. A7-03: refuse_offer_after_window(), new, a BEFORE INSERT trigger on job_offers (owner
--      only): a new bid (create_offer) or counter (counter_offer) on an open market job whose
--      window is over is refused (job_window_over, the clock now). One place for both writers.
--   8. A7-03: expire_open_jobs() (20261111100300_open_job_expiry.sql): ONE CUTOFF. A dated open
--      market job closes at the closer's first hourly run once its window is over
--      (job_window_over), no longer 24 hours later; an undated one keeps its 30 days. The notice,
--      its key, the signature, the grants and the schedule are unchanged; the comment is restated.
-- New sentences (old apps show them as written: lib/errorMessage.ts userMessage):
--   "That time has already passed. Pick a later window or another day."
--   "Posting is paused right now. Please try again shortly."
--   "This job's booked time has passed, so it can no longer be accepted. Post it again with a new time."
--   "This job's booked time has passed, so it can no longer be accepted. Ask the customer to post it again with a new time."
--   "This job's booked time has passed, so it is closed to new bids."
--   "This job's booked time has passed. Post it again with a new time."
-- Bids, counters, accepts, payments, starts and completions on existing jobs keep working while
-- posting is paused. Signatures, return shapes, settings and grants are unchanged and restated;
-- the comments of create_job, update_job_details and advance_job_series are restated with one
-- sentence added (create_offer and accept_offer have none).
--
-- Additive under scripts/staging-scan.sh. Proof: supabase/tests/494_post_window.sql.

begin;

-- ---------------------------------------------------------------------------
-- 1. The two rules, each defined once. Owner only: no caller role executes them.
-- ---------------------------------------------------------------------------
create or replace function public.posting_paused()
returns boolean
language sql volatile
set search_path = public, pg_temp
as $fn$
  select not coalesce((select c.value = 'true'::jsonb from public.app_config c where c.key = 'postingEnabled' for share), true)
$fn$;
revoke all on function public.posting_paused() from public, anon, authenticated, service_role;
comment on function public.posting_paused() is
  'post_window: true while new work is paused: the postingEnabled key holds anything but the jsonb boolean true (absent = on), the reading begin_job_payment gives paymentsEnabled. The row is read for share (A7-04), held to the end of the caller''s transaction, so a pause waits for every transaction that read posting on. Read by create_job, create_offer (a direct offer''s draft) and advance_job_series. Owner only.';

create or replace function public.job_window_over(p_date date, p_end_hour smallint, p_at timestamptz)
returns boolean
language sql stable
set search_path = public, pg_temp
as $fn$
  select p_date is not null and public.job_window_end(p_date, p_end_hour) <= p_at
$fn$;
revoke all on function public.job_window_over(date, smallint, timestamptz) from public, anon, authenticated, service_role;
comment on function public.job_window_over(date, smallint, timestamptz) is
  'post_window: true when a dated job''s arrival window (job_window_end, New York) has ended at p_at (from its end instant on). Read by create_job, update_job_details and accept_offer. Owner only.';

-- ---------------------------------------------------------------------------
-- 2. create_job: the needed_today body, plus the post_window block.
-- ---------------------------------------------------------------------------
create or replace function public.create_job(
  p_title text,
  p_description text,
  p_category public.job_category,
  p_location text,
  p_budget_cents integer default null,
  p_photos jsonb default '[]'::jsonb,
  p_lat double precision default null,
  p_lng double precision default null,
  p_videos jsonb default '[]'::jsonb,
  p_budget_min_cents integer default null,
  p_budget_max_cents integer default null,
  p_scheduled_date date default null,
  p_arrival_start_hour smallint default null,
  p_arrival_end_hour smallint default null,
  p_address_line text default null,
  p_pricing_mode text default 'open_bids',
  p_needed_today boolean default false
) returns public.jobs
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_address text := nullif(btrim(coalesce(p_address_line, '')), '');
begin
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
$$;
revoke all on function public.create_job(text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.create_job(text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text, text, boolean) to authenticated;
comment on function public.create_job(text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text, text, boolean) is
  'Posts a job for the signed-in caller (SECURITY DEFINER; authenticated only). a3 (2026-09-05): p_pricing_mode is the posting choice (open_bids or posted_price). Idea 12 (2026-09-30, docs/DECISIONS.md entry (1)): p_needed_today, last and defaulted to false, is the customer''s "Need it today"; nearby workers'' alert then says so. The fifteen- and sixteen-name calls installed builds send resolve here; migration 20260930000600 replaced the sixteen-parameter identity so PostgREST sees one overload. post_window: refused while posting is paused (posting_paused) and for a day and window already over (job_window_over).';

-- ---------------------------------------------------------------------------
-- 3. update_job_details: the job_pricing_mode body, plus the post_window block.
-- ---------------------------------------------------------------------------
create or replace function public.update_job_details(
  p_job_id uuid,
  p_title text,
  p_description text,
  p_category public.job_category,
  p_location text,
  p_budget_cents integer default null,
  p_photos jsonb default '[]'::jsonb,
  p_lat double precision default null,
  p_lng double precision default null,
  p_videos jsonb default '[]'::jsonb,
  p_budget_min_cents integer default null,
  p_budget_max_cents integer default null,
  p_scheduled_date date default null,
  p_arrival_start_hour smallint default null,
  p_arrival_end_hour smallint default null,
  p_address_line text default null,
  p_pricing_mode text default 'open_bids'
) returns public.jobs
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_address text := nullif(btrim(coalesce(p_address_line, '')), '');
begin
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
$$;
revoke all on function public.update_job_details(uuid, text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text, text) from public, anon, authenticated, service_role;
grant execute on function public.update_job_details(uuid, text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text, text) to authenticated;
comment on function public.update_job_details(uuid, text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text, text) is
  'Edits the caller''s own open job while it has zero offers and zero bids (SECURITY DEFINER; authenticated only). a3 (2026-09-05, docs/DECISIONS.md entry (2)): p_pricing_mode, last and defaulted to open_bids, rewrites the posting choice under the same three checks as create_job; the sixteen-name call every installed build sends resolves here and writes open_bids. Migration 20260930000400 replaced the sixteen-parameter identity so PostgREST sees one overload. post_window: a changed day or window may not be one already over (job_window_over).';

-- ---------------------------------------------------------------------------
-- 4. create_offer: the payouts_gate body, plus the post_window block.
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
$$;
revoke all on function public.create_offer(integer, uuid, text, uuid, text, text, text, text, jsonb, jsonb, double precision, double precision, uuid) from public, anon, authenticated, service_role;
grant execute on function public.create_offer(integer, uuid, text, uuid, text, text, text, text, jsonb, jsonb, double precision, double precision, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. accept_offer: the payouts_gate body, plus the post_window block.
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
$$;
revoke all on function public.accept_offer(uuid) from public, anon, authenticated, service_role;
grant execute on function public.accept_offer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. advance_job_series: the job_series body, plus the post_window block.
-- ---------------------------------------------------------------------------
create or replace function public.advance_job_series(p_now timestamptz default null)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_local timestamp := coalesce(p_now, now()) at time zone 'America/New_York';
  v_today date := v_local::date;
  v_id uuid;
  v_series public.job_series;
  v_draft public.jobs;
  v_root public.job_offers;
  v_last public.job_offers;
  v_offer public.job_offers;
  v_waiting public.jobs;
  v_passed_by uuid;
  v_visit date;
  v_next integer;
  v_made uuid;
  v_retry boolean;
  v_done integer := 0;
begin
  -- The market's daytime only: nobody gets a first refusal, and no visit is posted, at 3 am.
  if extract(hour from v_local) < 9 or extract(hour from v_local) >= 21 then
    perform public.report_timer_run('brazos-job-series', interval '4 hours');   -- TIMER (post_window)
    return 0;
  end if;
  -- >>> post_window: the posting switch is locked for share for the whole run (posting_paused's own
  -- read, A7-04): a pause waits for the run to end, so every create_job inside it gets the answer
  -- read here. While posting is paused nothing is offered or posted and nothing rolls forward; the
  -- first run after posting is back does the work. A visit that has come closer than two days by
  -- then is skipped by the two-day rule below, as when the schedule was down.
  if public.posting_paused() then
    perform public.report_timer_run('brazos-job-series', interval '4 hours');   -- TIMER
    return 0;
  end if;
  -- <<< post_window

  for v_id in
    select s.id from public.job_series s where s.status = 'active' order by s.created_at
  loop
    v_next := null;
    begin
      select * into v_series from public.job_series where id = v_id;
      v_next := v_series.next_visit_no;

      if not public.is_profile_active(v_series.client_id) then
        update public.job_series
           set status = 'stopped', stopped_at = now(), updated_at = now(),
               last_error = 'the customer is no longer active'
         where id = v_id;
        continue;
      end if;

      -- (a) A first refusal in flight. LOCK ORDER: the visit (jobs), then the series — the order
      --     accept_offer() takes them in, through the trigger.
      if v_series.pending_job_id is not null then
        select * into v_draft from public.jobs where id = v_series.pending_job_id for update;
        select * into v_series from public.job_series where id = v_id for update;
        if v_series.status <> 'active' or v_series.pending_job_id is distinct from v_draft.id then
          continue;
        end if;
        if v_draft.id is null or v_draft.status <> 'draft' then
          -- Gone (a taken one is moved on by the trigger): on to the visit after it.
          update public.job_series
             set pending_job_id = null,
                 next_visit_no = next_visit_no + 1,
                 next_visit_date = public.series_visit_date(anchor_date, cadence, next_visit_no + 1),
                 updated_at = now()
           where id = v_id;
          continue;
        end if;
        select * into v_root from public.job_offers o
         where o.job_id = v_draft.id and o.parent_offer_id is null
         order by o.created_at
         limit 1;
        if exists (select 1 from public.job_offers o where o.job_id = v_draft.id and o.status = 'pending')
           and now() < v_root.created_at + interval '24 hours' then
          continue;   -- still inside the worker's 24 hours
        end if;
        -- The 24 hours are up: whatever is still pending expires the canonical way.
        for v_offer in
          select * from public.job_offers o
          where o.job_id = v_draft.id and o.status = 'pending'
          for update
        loop
          update public.job_offers set expires_at = now() where id = v_offer.id;
          select * into v_offer from public.job_offers where id = v_offer.id;
          perform public.expire_offer_if_stale(v_offer);
        end loop;

        -- Who ended the first refusal decides what happens to the visit (the group 4 review): the last
        -- word in the chain says.
        select * into v_last from public.job_offers o
         where o.job_id = v_draft.id
         order by o.updated_at desc, o.created_at desc
         limit 1;
        if (v_last.status = 'withdrawn' and v_last.author_id = v_series.client_id)
           or (v_last.status = 'declined' and v_last.author_id is distinct from v_series.client_id) then
          -- The customer called it off — withdrew the offer, or turned down the worker's counter: this
          -- visit is skipped, nothing is posted, nobody is told they "didn't take it".
          update public.job_series
             set pending_job_id = null,
                 next_visit_no = next_visit_no + 1,
                 next_visit_date = public.series_visit_date(anchor_date, cadence, next_visit_no + 1),
                 last_error = null,
                 updated_at = now()
           where id = v_id;
          continue;
        end if;
        -- The worker passed, or the 24 hours ran out: the visit opens to bids — unless its day is
        -- already too close (the schedule was down), when it is skipped rather than posted late.
        -- A7-07: "too close" here is today or gone; a visit tomorrow still opens to bids.
        if v_draft.scheduled_date is not null and v_draft.scheduled_date >= v_today + 1 then
          -- "<worker> didn't take this one" only when the last word was the customer's own offer.
          v_passed_by := case when v_last.author_id = v_series.client_id then v_root.worker_id end;
          perform public.series_open_visit(v_series, v_draft.scheduled_date, v_passed_by);
          v_done := v_done + 1;
        end if;
        update public.job_series
           set pending_job_id = null,
               next_visit_no = next_visit_no + 1,
               next_visit_date = public.series_visit_date(anchor_date, cadence, next_visit_no + 1),
               last_error = null,
               updated_at = now()
         where id = v_id;
        continue;
      end if;

      -- (b) The next visit.
      -- A first visit cancelled before any other visit exists ends the series (scheduled or flexible).
      if exists (select 1 from public.jobs j where j.id = v_series.origin_job_id and j.status = 'cancelled')
         and not exists (select 1 from public.jobs j where j.series_id = v_id and j.id <> v_series.origin_job_id) then
        update public.job_series
           set status = 'stopped', stopped_at = now(), updated_at = now(),
               last_error = 'the first visit was cancelled'
         where id = v_id;
        continue;
      end if;
      if v_series.anchor_date is null then
        continue;   -- a flexible first visit counts from the day it is done
      end if;

      select * into v_series from public.job_series where id = v_id for update skip locked;
      if not found or v_series.status <> 'active' or v_series.pending_job_id is not null then
        continue;
      end if;

      -- A day already too close (the schedule was down, or the series began late) is skipped, never
      -- rushed: at least two days' notice.
      v_next := v_series.next_visit_no;
      v_visit := public.series_visit_date(v_series.anchor_date, v_series.cadence, v_next);
      for i in 1..1000 loop
        exit when v_visit >= v_today + 2;
        v_next := v_next + 1;
        v_visit := public.series_visit_date(v_series.anchor_date, v_series.cadence, v_next);
      end loop;
      if v_today < v_visit - 3 then
        if v_next <> v_series.next_visit_no or v_series.next_visit_date is distinct from v_visit then
          update public.job_series
             set next_visit_no = v_next, next_visit_date = v_visit, updated_at = now()
           where id = v_id;
        end if;
        continue;   -- not yet: three days before
      end if;

      -- The first refusal, to the series' worker at their price.
      v_made := null;
      v_retry := false;
      if v_series.worker_id is not null and v_series.price_cents is not null
         and public.job_request_parties_ok(v_series.client_id, v_series.worker_id) then
        begin
          v_made := public.series_offer_visit(v_series, v_visit);
        exception when others then
          v_made := null;
          -- The two already have a live offer between them (one per pair): a later run tries again
          -- while the visit is still two days off, rather than taking the worker's first refusal away.
          v_retry := sqlerrm like 'You already have a live offer open here%' and v_visit > v_today + 2;
        end;
      end if;
      if v_retry then
        continue;
      end if;

      if v_made is not null then
        -- The pointer stays on the visit on offer until it is taken (the trigger) or settled (a).
        update public.job_series
           set pending_job_id = v_made,
               next_visit_no = v_next,
               next_visit_date = v_visit,
               last_error = null,
               updated_at = now()
         where id = v_id;
        v_done := v_done + 1;
        continue;
      end if;

      -- To bids — but never a second post while one of the series' posts for a day still to come
      -- waits for a hire (the group 4 review: a stale post from a past day never blocks the series).
      select * into v_waiting from public.jobs j
       where j.series_id = v_id and j.status = 'open' and j.scheduled_date >= v_today
       order by j.scheduled_date
       limit 1;
      if v_waiting.id is not null then
        perform public.enqueue_notification(
          v_series.client_id,
          null,
          'job_updates',
          'series_skipped',
          'Your ' || to_char(v_visit, 'FMDy') || ' visit was skipped',
          left(v_waiting.title, 60) || ' · your last post is still waiting for a worker.',
          jsonb_build_object('screen', 'ClientJobDetail', 'jobId', v_waiting.id::text),
          'series_skipped:' || v_id::text || ':' || v_visit::text
        );
      else
        perform public.series_open_visit(v_series, v_visit, null);
        v_done := v_done + 1;
      end if;
      update public.job_series
         set next_visit_no = v_next + 1,
             next_visit_date = public.series_visit_date(v_series.anchor_date, v_series.cadence, v_next + 1),
             last_error = null,
             updated_at = now()
       where id = v_id;
    exception when others then
      -- One series' failure never stops the others; it is recorded, and that visit — the one this run
      -- rolled forward to — is skipped rather than retried every hour.
      update public.job_series
         set last_error = left(sqlerrm, 300),
             pending_job_id = null,
             next_visit_no = greatest(next_visit_no, coalesce(v_next, next_visit_no)) + 1,
             next_visit_date = case when anchor_date is not null
                                    then public.series_visit_date(anchor_date, cadence,
                                           greatest(next_visit_no, coalesce(v_next, next_visit_no)) + 1) end,
             updated_at = now()
       where id = v_id;
    end;
  end loop;

  -- TIMER (post_window): this run is reported as the last statement (timer_late after 4 hours).
  perform public.report_timer_run('brazos-job-series', interval '4 hours');
  return v_done;
end;
$$;
revoke all on function public.advance_job_series(timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.advance_job_series(timestamptz) to service_role;
comment on function public.advance_job_series(timestamptz) is
  'Idea 14: the hourly work of every active series, in the market''s daytime (9 am - 9 pm, America/New_York): a first refusal in flight waits out its 24 hours, then opens to bids; from three days before the next visit, a first refusal to the series'' worker at their price (create_offer()), or bids (create_job()). Returns how many series moved. Called by the brazos-job-series schedule. post_window: returns 0 and moves nothing while posting is paused (posting_paused), the postingEnabled row locked for share to the end of the run.';

-- ---------------------------------------------------------------------------
-- 7. A7-03: no new bid or counter on an open market job whose window is over.
-- ---------------------------------------------------------------------------
create or replace function public.refuse_offer_after_window() returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_job public.jobs;
begin
  select * into v_job from public.jobs j
   where j.id = new.job_id and j.status = 'open' and j.visibility = 'open_market';
  if found and public.job_window_over(v_job.scheduled_date, v_job.arrival_end_hour, clock_timestamp()) then
    if new.author_id = new.customer_id then
      raise exception 'This job''s booked time has passed. Post it again with a new time.';
    end if;
    raise exception 'This job''s booked time has passed, so it is closed to new bids.';
  end if;
  return new;
end
$fn$;
revoke all on function public.refuse_offer_after_window() from public, anon, authenticated, service_role;
comment on function public.refuse_offer_after_window() is
  'Trigger on job_offers (A7-03): a new offer row (a bid from create_offer, a counter from counter_offer) on an open market job whose window is over (job_window_over, the clock now) is refused: the customer''s counter with "Post it again", anything else as closed to new bids. No caller grant.';
drop trigger if exists job_offers_refuse_after_window on public.job_offers;
create trigger job_offers_refuse_after_window
  before insert on public.job_offers
  for each row
  execute function public.refuse_offer_after_window();

-- ---------------------------------------------------------------------------
-- 8. expire_open_jobs: the open_job_expiry body; A7-03: a dated job closes once its window is over.
-- ---------------------------------------------------------------------------
create or replace function public.expire_open_jobs(p_now timestamptz default null)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_now  timestamptz := coalesce(p_now, now());
  v_job  public.jobs;
  v_done integer := 0;
begin
  for v_job in
    select j.* from public.jobs j
     where j.status = 'open' and j.visibility = 'open_market'
       and (
         -- A7-03: the one cutoff (job_window_over), no longer its end + 24 hours.
         public.job_window_over(j.scheduled_date, j.arrival_end_hour, v_now)
         or (j.scheduled_date is null and j.created_at < v_now - interval '30 days')
       )
     for update of j skip locked
  loop
    update public.jobs
       set status = 'cancelled'::public.job_status,
           cancelled_at = now(),
           cancelled_by = null,
           cancel_reason = 'expired'
     where id = v_job.id;

    perform public.enqueue_notification(
      v_job.client_id, null, 'jobs', 'job_cancelled',
      'Your job was closed',
      left(v_job.title, 60) || ': no worker was hired in time. Post it again when you are ready.',
      jsonb_build_object('screen', 'ClientJobDetail', 'jobId', v_job.id::text),
      'job_closed:' || v_job.id::text || ':' || v_job.client_id::text
    );

    v_done := v_done + 1;
  end loop;
  return v_done;
end
$fn$;
revoke all on function public.expire_open_jobs(timestamptz) from public, anon, authenticated;
grant execute on function public.expire_open_jobs(timestamptz) to service_role;
comment on function public.expire_open_jobs(timestamptz) is
  'B15: closes an open market job nobody was hired for: a dated one once its arrival window is over (job_window_over; A7-03, before: 24 hours after), an undated one 30 days after it was posted. cancel_reason expired, cancelled_by null; pending offers are declined by the cancel trigger; the owner is told once with no amount. Returns the number closed. service_role only; pg_cron hourly (install_lifecycle_schedules). p_now is for tests.';

commit;
