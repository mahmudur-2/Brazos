-- 20260930000800_quiet_hours.sql — idea 7, "Quiet hours": midnight to 6 am, OFF until each person
-- switches it on; nearby-job alerts wait until morning, their own jobs and money still come through.
--
-- THE DECISION: docs/DECISIONS.md 2026-09-30 entry (3), and the operator's answers recorded in
-- docs/dispatch/LUX-LIST-3.md §7: the hours are midnight to 6 am ("12pm - 6am", read and confirmed
-- as midnight to 6 am) and the default is OFF ("Off until turned on").
--
-- THE VERSION: 20260930000700_running_late.sql is the newest before it, so this takes 000800. The
-- pgTAP file is supabase/tests/160_quiet_hours.sql.
--
-- WHAT THIS FILE DOES, in one transaction:
--   (1) notification_prefs.quiet_hours boolean not null default false — additive, defaulted OFF, so
--       every existing row and every row the profile-insert trigger writes reads off; and
--       notification_prefs.quiet_tz text — the IANA zone the person's phone reported when they
--       switched it on ("America/New_York"), since midnight is theirs, not the server's. A shape
--       CHECK bounds it; a zone the server does not know is treated as no quiet hours (3). The
--       owner writes both through the table's existing own-row UPDATE policy, as every other
--       switch on this screen is written (lib/notificationPrefs.ts); no grant or policy changes.
--   (2) notification_outbox.send_after timestamptz — null means "now", as every row before this
--       file reads. A row is not claimed for delivery before it.
--   (3) quiet_hours_until(uuid) returns timestamptz — for a recipient whose quiet hours are on and
--       whose local time (in quiet_tz) is between midnight and 6 am, the next local 6 am; otherwise
--       null. An unknown zone never holds an alert back: it returns null. SECURITY DEFINER, reached
--       only from enqueue_notification() — revoked from public, anon and authenticated.
--   (4) enqueue_notification(): the same gate (should_notify) and insert, plus send_after for the
--       'nearby_jobs' category ALONE — every other category (messages, bids, job updates, hire
--       requests, the always-on 'jobs' money and completion rows) is never delayed. Same identity,
--       so its ACL is restated as the baseline set it (revoked from public; now explicitly from anon
--       and authenticated too: it is only ever called from SECURITY DEFINER functions).
--   (5) claim_notification_batch(): the same claim, skipping a row whose send_after is still ahead.
--       Its ACL restated as the baseline set it: EXECUTE to service_role (the send-push drain) only.
--   The auto-release "told" gate (20260930000100) reads job_completed rows, category 'jobs' — never
--   delayed here — so no money clock moves.
--
-- WHAT THIS FILE DOES NOT TOUCH: should_notify(), every trigger that enqueues, the drain's schedule
-- and the send-push function, every payments object. NOT destructive under scripts/staging-scan.sh.
-- Reversible: one corrective migration restores the two functions' previous bodies and drops the
-- helper and the three columns.

begin;

-- ---------------------------------------------------------------------------
-- 1. The person's switch and their zone.
-- ---------------------------------------------------------------------------
alter table public.notification_prefs add column if not exists quiet_hours boolean not null default false;
alter table public.notification_prefs add column if not exists quiet_tz text;
alter table public.notification_prefs drop constraint if exists notification_prefs_quiet_tz_shape;
alter table public.notification_prefs add constraint notification_prefs_quiet_tz_shape
  check (quiet_tz is null or (length(quiet_tz) between 1 and 64 and quiet_tz ~ '^[A-Za-z0-9_+-]+(/[A-Za-z0-9_+-]+)*$'));
comment on column public.notification_prefs.quiet_hours is 'Idea 7 (docs/DECISIONS.md 2026-09-30 entry (3)): quiet hours, midnight to 6 am in quiet_tz; nearby-job alerts wait until 6 am, nothing else waits. OFF until the person switches it on.';
comment on column public.notification_prefs.quiet_tz is 'Idea 7: the IANA zone the person''s phone reported when they switched quiet hours on. An unknown zone means no quiet hours (quiet_hours_until).';

-- ---------------------------------------------------------------------------
-- 2. When a queued notification may leave.
-- ---------------------------------------------------------------------------
alter table public.notification_outbox add column if not exists send_after timestamptz;
comment on column public.notification_outbox.send_after is 'Idea 7: not delivered before this instant (null: now). Set only for a nearby-job alert enqueued inside the recipient''s quiet hours — to their next 6 am.';

-- ---------------------------------------------------------------------------
-- 3. The next local 6 am, for someone inside their quiet hours; otherwise null.
-- ---------------------------------------------------------------------------
create or replace function public.quiet_hours_until(p_recipient uuid) returns timestamptz
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_prefs public.notification_prefs;
  v_local timestamp;
begin
  select * into v_prefs from public.notification_prefs where user_id = p_recipient;
  if v_prefs.user_id is null or not v_prefs.quiet_hours or v_prefs.quiet_tz is null then
    return null;
  end if;
  begin
    v_local := now() at time zone v_prefs.quiet_tz;
  exception when others then
    -- A zone the server does not know never holds an alert back.
    return null;
  end;
  if extract(hour from v_local) < 6 then
    return (date_trunc('day', v_local) + interval '6 hours') at time zone v_prefs.quiet_tz;
  end if;
  return null;
end;
$$;

revoke all on function public.quiet_hours_until(uuid) from public, anon, authenticated;

comment on function public.quiet_hours_until(uuid) is
  'Idea 7: for a recipient whose quiet hours are on and whose local time (quiet_tz) is between midnight and 6 am, the next local 6 am; otherwise null — an unknown zone included. Reached only from enqueue_notification().';

-- ---------------------------------------------------------------------------
-- 4. The one enqueue: a nearby alert waits out quiet hours; nothing else ever waits.
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_notification(
  p_recipient uuid,
  p_actor uuid,
  p_category text,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb,
  p_dedupe_key text
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.should_notify(p_recipient, p_actor, p_category) then
    return;
  end if;

  insert into public.notification_outbox (
    recipient_id, category, type, title, body, data, dedupe_key, send_after
  )
  values (
    p_recipient, p_category, p_type, p_title, p_body,
    coalesce(p_data, '{}'::jsonb), p_dedupe_key,
    -- Idea 7: only a nearby-job alert waits for the recipient's morning.
    case when p_category = 'nearby_jobs' then public.quiet_hours_until(p_recipient) end
  )
  on conflict (dedupe_key) do nothing;
end;
$$;

revoke all on function public.enqueue_notification(uuid, uuid, text, text, text, text, jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. The claim: a row waiting for its morning is not claimed yet.
-- ---------------------------------------------------------------------------
create or replace function public.claim_notification_batch(p_limit integer default 100)
returns table(outbox_id uuid, recipient_id uuid, type text, title text, body text, data jsonb, tokens text[])
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with claimed as (
    select o.id
    from public.notification_outbox o
    where o.status = 'pending'
      and o.attempts < 5
      -- Idea 7: quiet hours — not before its morning.
      and (o.send_after is null or o.send_after <= now())
    order by o.created_at
    limit greatest(1, least(coalesce(p_limit, 100), 100))
    for update skip locked
  ),
  marked as (
    update public.notification_outbox o
       set attempts = o.attempts + 1
      from claimed c
     where o.id = c.id
    returning o.*
  )
  select
    m.id,
    m.recipient_id,
    m.type,
    m.title,
    m.body,
    m.data,
    coalesce(
      array(
        select t.token from public.push_tokens t
        where t.user_id = m.recipient_id and t.active
      ),
      array[]::text[]
    )
  from marked m;
end;
$$;

revoke all on function public.claim_notification_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_batch(integer) to service_role;

commit;
