-- ============================================================================
-- BRAZOS · phase62 · counter-offer notification copy: first name, named action
--
-- STAGING deliverable — hand-apply with psql against STAGING only:
--   psql -v ON_ERROR_STOP=1 -f supabase/phase62_counter_notification_copy.sql -d "$SUPABASE_DB_URL_STAGING"
-- Runs as ONE transaction. Safe to re-run (idempotent).
--
-- WHAT CHANGES: one string, in one function.
--   before:  "<Full Name> countered $120.00 — your move."
--   after:   "<First> sent you a Counteroffer for $120.00 — your move."
--
-- WHY: the notification named the action with a bare verb and addressed the
-- counterparty by full legal name, which reads like a system log line rather
-- than a person. The two client surfaces that render the same moment —
-- screens/JobDetailScreen.tsx's respond card and screens/MyJobsHubScreen.tsx's
-- hub card — are changed to the same wording in the same commit, so all three
-- say one thing.
--
-- Everything else in phase59 is reproduced VERBATIM and deliberately: the
-- counters-only / marketplace-only guards, the 'bids' category, the dedupe
-- key, and the payload screens. The payload already routes to the party's own
-- response surface ('ClientJobDetail' for the job owner, 'JobDetail' for the
-- worker) — that is correct and is left exactly as it was; the client-side
-- half of that routing is fixed separately in screens/NotificationsScreen.tsx.
--
-- phase59 itself is NOT edited — it is applied, and an applied migration is
-- never rewritten. This file supersedes its function body.
-- ============================================================================

begin;

-- 1. Preconditions ------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.notify_on_offer_counter()') is null then
    raise exception 'phase59_staging_counter_notification.sql has not been applied.';
  end if;
  if to_regprocedure('public.notify_display_name(uuid)') is null then
    raise exception 'phase20_push_notifications.sql has not been applied — notify_display_name is missing.';
  end if;
end $$;

-- 2. The function -------------------------------------------------------------

create or replace function public.notify_on_offer_counter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs;
  v_author_name text;
  v_author_first text;
begin
  -- Counters only: a chain row WITH a parent. Root offers keep their existing
  -- notification (phase47 projection -> phase20 bid_received), and settled
  -- rows never arrive here pending.
  if new.parent_offer_id is null
     or new.status <> 'pending'
     or new.awaiting_id is null then
    return new;
  end if;

  -- Marketplace chains only — a direct-offer counter is notified through its
  -- thread message, and a second row here would double-notify the same moment.
  if new.offer_type <> 'marketplace_bid' then
    return new;
  end if;

  select * into v_job from public.jobs where id = new.job_id;
  if v_job.id is null then
    return new;
  end if;

  v_author_name := public.notify_display_name(new.author_id);
  -- phase62: first name only. notify_display_name() already supplies the
  -- fallback for a missing profile, so a name with no space (or none at all)
  -- falls back to that whole value rather than to an empty string.
  v_author_first := coalesce(
    nullif(split_part(btrim(v_author_name), ' ', 1), ''),
    v_author_name
  );

  perform public.enqueue_notification(
    new.awaiting_id,
    new.author_id,
    'bids',
    'offer_countered',
    'New counter-offer on ' || left(v_job.title, 60),
    v_author_first || ' sent you a Counteroffer for $'
      || to_char(round(new.amount_cents / 100.0, 2), 'FM999999990.00')
      || ' — your move.',
    jsonb_build_object(
      -- Unchanged from phase59: the awaiting party's OWN response surface.
      -- The job owner answers on ClientJobDetail (BidDetail lives behind it),
      -- the worker on JobDetail. Both are lib/notificationRoutes.ts's map.
      'screen',
      case when new.awaiting_id = v_job.client_id
        then 'ClientJobDetail'
        else 'JobDetail'
      end,
      'jobId', new.job_id::text
    ),
    'offer_countered:' || new.id::text
  );

  return new;
end;
$$;

-- Trigger function: never client-callable.
revoke all on function public.notify_on_offer_counter() from public, anon, authenticated;

-- The trigger itself is unchanged (phase59:116-120); restated so this file is
-- self-sufficient if replayed onto a database where it was dropped.
drop trigger if exists job_offers_notify_counter on public.job_offers;
create trigger job_offers_notify_counter
  after insert on public.job_offers
  for each row
  execute function public.notify_on_offer_counter();

notify pgrst, 'reload schema';

commit;
