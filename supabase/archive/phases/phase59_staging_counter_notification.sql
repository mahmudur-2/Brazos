-- ============================================================================
-- BRAZOS V2 · core-transactions run · counter-offer notification (AUD-P1-01)
--
-- STAGING deliverable — hand-apply with psql against STAGING only; verify
-- with `node scripts/verify-schema.mjs`. Safe to re-run (idempotent).
-- NOT part of the production apply queue until the owner promotes it.
--
-- WHY: a counter-offer on a marketplace bid had NO notification of any kind.
-- Marketplace chains never post thread messages (offer_post_event no-ops for
-- them — phase46 §5, deliberate), so phase20/57's message triggers never see
-- a counter, and phase20's bid_received fires only for a chain's ROOT (via
-- the phase47 projection — the shim harness pins "zero bid_received per
-- counter"). The party who owed the response learned about it only by
-- happening to reopen the job.
--
-- WHAT: one AFTER INSERT trigger on job_offers. A counter is a chain row
-- WITH a parent (never a type value — offer_type is fixed at the root). The
-- pending counter's awaiting_id is the party who owes the reply; they get
-- one feed/outbox row through the existing pipeline:
--   enqueue_notification (phase20) -> should_notify (phase56 body: prefs,
--   mutes, blocks, bans) -> notification_outbox (dedupe_key) -> the
--   NotificationsScreen feed and, when a push provider exists, delivery.
--
-- Scoped to marketplace_bid chains ONLY: a direct-offer counter already
-- posts its thread message (offer_post_event), which the message triggers
-- surface — a second row here would double-notify the same moment.
--
-- Category is 'bids': notification preferences route by the chain's
-- offer_type, the same toggle that governed the chain's root. Payload
-- screens ('JobDetail' / 'ClientJobDetail') are lib/notificationRoutes.ts's
-- existing contract — no client change is required by this file, and the
-- AUD-P1-01 client fixes stand fully without it (this is additive
-- convenience, not the fix).
-- ============================================================================

begin;

-- 1. Preconditions ------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.enqueue_notification(uuid, uuid, text, text, text, text, jsonb, text)') is null then
    raise exception 'phase20_push_notifications.sql has not been applied — enqueue_notification is missing.';
  end if;
  if to_regprocedure('public.notification_feed_enabled()') is null then
    raise exception 'phase56_notification_feed.sql has not been applied — its should_notify body (feed semantics, no token gate) is a dependency.';
  end if;
  if to_regclass('public.job_offers') is null then
    raise exception 'phase43_job_offers_foundation.sql has not been applied.';
  end if;
end $$;

-- 2. The trigger ---------------------------------------------------------------

create or replace function public.notify_on_offer_counter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs;
  v_author_name text;
begin
  -- Counters only: a chain row WITH a parent. Root offers keep their existing
  -- notification (phase47 projection -> phase20 bid_received), and settled
  -- rows never arrive here pending.
  if new.parent_offer_id is null
     or new.status <> 'pending'
     or new.awaiting_id is null then
    return new;
  end if;

  -- Marketplace chains only — see header for the direct-offer double-notify.
  if new.offer_type <> 'marketplace_bid' then
    return new;
  end if;

  select * into v_job from public.jobs where id = new.job_id;
  if v_job.id is null then
    return new;
  end if;

  v_author_name := public.notify_display_name(new.author_id);

  perform public.enqueue_notification(
    new.awaiting_id,
    new.author_id,
    'bids',
    'offer_countered',
    'New counter-offer on ' || left(v_job.title, 60),
    v_author_name || ' countered $'
      || to_char(round(new.amount_cents / 100.0, 2), 'FM999999990.00')
      || ' — your move.',
    jsonb_build_object(
      -- The awaiting party's OWN response surface: the job owner answers on
      -- ClientJobDetail (BidDetail lives behind it), the worker on JobDetail.
      -- Both screen strings are lib/notificationRoutes.ts's existing map.
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

drop trigger if exists job_offers_notify_counter on public.job_offers;
create trigger job_offers_notify_counter
  after insert on public.job_offers
  for each row
  execute function public.notify_on_offer_counter();

-- 3. verify-schema sentinel -----------------------------------------------------
--
-- Created last inside this file's transaction, so its presence proves the
-- whole migration committed (the phase52 situation: a trigger has no
-- PostgREST-probeable shape, so the sentinel carries the group).

create or replace function public.counter_notification_enabled()
returns boolean
language sql
immutable
as $$
  select true;
$$;

revoke all on function public.counter_notification_enabled() from public, anon;
grant execute on function public.counter_notification_enabled() to authenticated;

notify pgrst, 'reload schema';

commit;
