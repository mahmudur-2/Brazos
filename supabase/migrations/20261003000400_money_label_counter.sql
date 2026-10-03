-- 20261003000400_money_label_counter.sql — FIX-RUN A17 (2026-10-03): one money format in SQL.
--
-- THE GAP. Money is formatted only through formatBudget() (CLAUDE.md): a whole-dollar amount bare
-- ("$135"), otherwise two decimals. The database has that rule as public.money_label(integer)
-- (20260930001000, immutable) and notify_on_bid() already reads it (20260930001200) — but the live
-- counter-offer push, notify_on_offer_counter() (baseline), still wrote its own
-- '$' || to_char(round(amount / 100.0, 2), 'FM999999990.00'), so the feed said "$135.00" where
-- every screen says "$135".
--
-- THE FIX. notify_on_offer_counter() reads money_label(); body otherwise the baseline's verbatim.
-- The two other baseline sites with the old formatter — notify_on_bid() on `bids` (superseded by
-- 20260930001200's body, which already uses money_label) and notify_on_job_request() on
-- `job_requests` — belong to the deprecated compatibility shims (accept_bid, respond_job_request)
-- that CLAUDE.md says never to extend or imitate; they have no app callers and are left alone.
--
-- NOT DESTRUCTIVE under scripts/staging-scan.sh. Reversible: one corrective migration restores the
-- baseline body.

create or replace function public.notify_on_offer_counter() returns trigger
language plpgsql security definer
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
    -- A17: money_label() is formatBudget()'s rule — "$135", "$135.50" — never a second formatter.
    v_author_first || ' sent you a Counteroffer for '
      || public.money_label(new.amount_cents)
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

revoke all on function public.notify_on_offer_counter() from public, anon, authenticated;
comment on function public.notify_on_offer_counter() is
  'AFTER INSERT on job_offers: a pending marketplace counter notifies the party whose move it is, on their own response surface. A17 (2026-10-03): the amount is public.money_label() — formatBudget()''s rule — not a second formatter.';
