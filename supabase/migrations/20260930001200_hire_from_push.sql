-- 20260930001200_hire_from_push.sql — idea 20, "Hire from the push": a bid's push offers View and
-- Accept & pay; a customer who saved a card hires and pays in one confirm, through accept_offer() and
-- the Checkout payment path; a declined card sends a push that opens Checkout.
--
-- THE DECISION: docs/DECISIONS.md 2026-09-30 entry (4) (20), and the build run's brief
-- (docs/dispatch/BUILD-RUN.md §1, "20."): the saved-card opt-in, off by default, at Checkout and in
-- Payment methods (removable); setup_future_usage in create-payment; the off-session charge
-- server-side on Confirm; notification actions through expo-notifications; a declined card sends a
-- push that opens Checkout; the accept goes through accept_offer() and the payment through the
-- Checkout path.
--
-- THE VERSION: 20260930001100_receipts.sql is the newest before it, so this takes 001200. The pgTAP
-- file is supabase/tests/200_hire_from_push.sql.
--
-- WHAT THIS FILE DOES, in one transaction:
--   (1) notify_on_bid(): the baseline body (supabase/migrations/20260901000000_baseline.sql), with the
--       customer's push carrying what the two buttons need — data.offerId (the bid IS its root offer:
--       project_offer_chain_to_bids keys bids.id on it) and data.categoryId 'bid_hire' (the button set
--       the app registers) — and the all-in total in its body, "Sam bid $80 · $86 all-in": a push's
--       button titles are fixed when the app registers them, so the amount the customer would pay
--       rides in the words beside them. The rivals' push is the baseline's, byte for byte.
--   (2) enqueue_payment_declined(p_payment_id) — the create-payment function's call when a saved
--       card is declined off-session: one push to the payer, 'jobs' (the hire and its payment,
--       always on), "Your card was declined", opening the job with the checkout intent.
--       service_role only.
--   (3) series_on_visit_change(): 20260930001000's body whole, with the repeat visit's Confirm push
--       naming its button set (data.categoryId 'series_confirm'): its Confirm button pays with the
--       saved card in Checkout; a plain tap still opens Checkout. Same identity and trigger.
--
-- WHAT THIS FILE DOES NOT TOUCH: accept_offer(), begin_job_payment(), every payments column and
-- function, the rivals' push. NOT destructive under scripts/staging-scan.sh. Reversible: one
-- corrective migration restores notify_on_bid()'s baseline body and drops the one function.

begin;

-- ---------------------------------------------------------------------------
-- 1. The bid's push: the offer to accept, the button set, the all-in total.
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_bid() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $_$
declare
  v_job public.jobs;
  v_worker_name text;
  v_rival record;
  v_total integer;
begin
  select * into v_job from public.jobs where id = new.job_id;
  if v_job.id is null then
    return new;
  end if;

  v_worker_name := public.notify_display_name(new.worker_id);
  -- Idea 20: what the customer would pay, from the one price arithmetic.
  select q.total_cents into v_total from public.quote_job_price(new.amount_cents) q;

  -- (2) The client who posted the job — with View and Accept & pay (idea 20).
  perform public.enqueue_notification(
    v_job.client_id,
    new.worker_id,
    'bids',
    'bid_received',
    'New bid on ' || left(v_job.title, 60),
    v_worker_name || ' bid ' || public.money_label(new.amount_cents)
      || coalesce(' · ' || public.money_label(v_total) || ' all-in', ''),
    jsonb_build_object(
      'screen', 'ClientJobDetail',
      'jobId', new.job_id::text,
      -- The bid is its root offer (project_offer_chain_to_bids keys bids.id on it).
      'offerId', new.id::text,
      'categoryId', 'bid_hire'
    ),
    'bid_received:' || new.id::text
  );

  -- (3) Competitive pressure: everyone else who already bid on this job.
  -- Governed by the same 'bids' toggle — of the five switches the user has,
  -- this is bid activity, so it belongs with bids rather than job updates.
  for v_rival in
    select distinct b.worker_id
    from public.bids b
    where b.job_id = new.job_id
      and b.worker_id <> new.worker_id
      and b.status = 'pending'
  loop
    perform public.enqueue_notification(
      v_rival.worker_id,
      new.worker_id,
      'bids',
      'bid_competition',
      'Another bid came in',
      'Someone else bid on ' || left(v_job.title, 60) || '. Your bid is still pending.',
      jsonb_build_object('screen', 'JobDetail', 'jobId', new.job_id::text),
      'bid_competition:' || new.id::text || ':' || v_rival.worker_id::text
    );
  end loop;

  return new;
end;
$_$;
revoke all on function public.notify_on_bid() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. A saved card declined: the push that opens Checkout.
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_payment_declined(p_payment_id uuid) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.payments;
  v_title text;
begin
  select * into v_payment from public.payments where id = p_payment_id;
  if v_payment.id is null or v_payment.kind <> 'job_payment' then
    return;
  end if;
  select j.title into v_title from public.jobs j where j.id = v_payment.job_id;
  perform public.enqueue_notification(
    v_payment.payer_id,
    null,
    'jobs',
    'payment_declined',
    'Your card was declined',
    coalesce(left(v_title, 60) || ' · ', '') || 'Tap to pay in Checkout.',
    jsonb_build_object('screen', 'ClientJobDetail', 'jobId', v_payment.job_id::text, 'intent', 'checkout'),
    'payment_declined:' || v_payment.id::text || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text
  );
end;
$$;
revoke all on function public.enqueue_payment_declined(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_payment_declined(uuid) to service_role;
comment on function public.enqueue_payment_declined(uuid) is
  'Idea 20, service_role only (create-payment): a saved card declined off-session — one always-on push to the payer that opens the job''s Checkout.';

-- ---------------------------------------------------------------------------
-- 3. The repeat visit's Confirm push names its button: series_on_visit_change(), exactly as
--    20260930001000_job_series.sql defines it, with data.categoryId 'series_confirm' added.
-- ---------------------------------------------------------------------------
create or replace function public.series_on_visit_change() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_series public.job_series;
  v_offer public.job_offers;
  v_total integer;
  v_first text;
  v_today date := (now() at time zone 'America/New_York')::date;
  v_rejoins boolean;
begin
  select * into v_series from public.job_series where id = new.series_id for update;
  if v_series.id is null then
    return new;
  end if;

  if old.assigned_worker_id is null and new.assigned_worker_id is not null then
    -- The same worker gets the next visit first, at this price — unless they dropped the series
    -- (any worker who ever did: the group 4 review).
    v_rejoins := not (new.assigned_worker_id = any (v_series.dropped_worker_ids));
    update public.job_series
       set worker_id = case when v_rejoins then new.assigned_worker_id else v_series.worker_id end,
           price_cents = case when v_rejoins then coalesce(new.final_amount_cents, v_series.price_cents)
                              else v_series.price_cents end,
           -- The visit on offer, taken: on to the one after it.
           pending_job_id = case when v_series.pending_job_id = new.id then null else v_series.pending_job_id end,
           next_visit_no = case when v_series.pending_job_id = new.id
                                then v_series.next_visit_no + 1 else v_series.next_visit_no end,
           next_visit_date = case when v_series.pending_job_id = new.id and v_series.anchor_date is not null
                                  then public.series_visit_date(v_series.anchor_date, v_series.cadence, v_series.next_visit_no + 1)
                                  else v_series.next_visit_date end,
           updated_at = now()
     where id = v_series.id;

    -- A first refusal taken: the worker said yes to the customer's standing offer. The customer
    -- confirms, and pays, in Checkout — nothing is charged before they do.
    if old.status = 'draft' then
      select * into v_offer from public.job_offers where id = new.accepted_offer_id;
      if v_offer.author_id = new.client_id then
        select q.total_cents into v_total
        from public.quote_job_price(coalesce(new.final_amount_cents, v_offer.amount_cents)) q;
        v_first := coalesce(nullif(split_part(btrim(public.notify_display_name(new.assigned_worker_id)), ' ', 1), ''), 'Your worker');
        perform public.enqueue_notification(
          new.client_id,
          new.assigned_worker_id,
          'jobs',
          'series_confirm',
          v_first || ' can come ' || to_char(new.scheduled_date, 'FMDy')
            || coalesce(' ' || to_char(time '00:00' + make_interval(hours => new.arrival_start_hour), 'FMHH12 AM'), ''),
          'Confirm ' || public.money_label(v_total) || ' · ' || left(new.title, 60),
          -- Idea 20: the push carries its Confirm button (the app's series_confirm set); a plain tap still
          -- opens Checkout, the button pays with the saved card there.
          jsonb_build_object('screen', 'ClientJobDetail', 'jobId', new.id::text, 'intent', 'checkout', 'categoryId', 'series_confirm'),
          'series_confirm:' || new.id::text
        );
      end if;
    end if;
  end if;

  -- The first visit's day moved (Edit, before anyone was hired) while it is still the series' only
  -- visit: the series counts from the new day (the group 4 review) — or, made flexible, from the day
  -- it is done.
  if new.id = v_series.origin_job_id
     and old.scheduled_date is distinct from new.scheduled_date
     and v_series.pending_job_id is null
     and not exists (select 1 from public.jobs j where j.series_id = v_series.id and j.id <> new.id) then
    update public.job_series
       set anchor_date = new.scheduled_date,
           next_visit_no = 1,
           next_visit_date = case when new.scheduled_date is not null
                                  then public.series_visit_date(new.scheduled_date, v_series.cadence, 1) end,
           updated_at = now()
     where id = v_series.id;
    select * into v_series from public.job_series where id = v_series.id;
  end if;

  -- A flexible first visit, done: the series counts from today.
  if new.status = 'completed' and old.status is distinct from 'completed' and v_series.anchor_date is null then
    update public.job_series
       set anchor_date = v_today,
           next_visit_no = 1,
           next_visit_date = public.series_visit_date(v_today, v_series.cadence, 1),
           updated_at = now()
     where id = v_series.id;
  end if;

  return new;
end;
$$;
revoke all on function public.series_on_visit_change() from public, anon, authenticated;
drop trigger if exists jobs_series_visit on public.jobs;
create trigger jobs_series_visit after update of assigned_worker_id, status, scheduled_date on public.jobs
  for each row when (new.series_id is not null)
  execute function public.series_on_visit_change();

commit;
