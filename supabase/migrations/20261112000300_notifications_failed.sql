-- 20261112000300_notifications_failed.sql — ledger B17, "notifications never 'failed'"
-- (docs/critical/production-path.md, part E).
--
-- claim_notification_batch() hands out pending rows with attempts < 5, and send-push writes back
-- 'sent' or 'pending', never 'failed'. So a row that failed five times stayed pending for ever.
--
-- The newest definition (20260930000800_quiet_hours.sql) is copied unchanged, with one first
-- statement added: a pending row whose five attempts are used ends 'failed', with the error text
-- 'retries exhausted' when it carries none. Rows already stuck are cleared at the next claim. The
-- edge function does not change; 'failed' already passes notification_outbox_status_valid.
--
-- Effect on the 72-hour release (accepted): the auto-release gate counts 'failed' as an end status
-- (20260930000100_auto_release_told_gate.sql), so a release notice that exhausted its retries now
-- lets the release go ahead instead of holding it for ever.
--
-- Proof: supabase/tests/333_notifications_failed.sql.

begin;

create or replace function public.claim_notification_batch(p_limit integer default 100)
returns table(outbox_id uuid, recipient_id uuid, type text, title text, body text, data jsonb, tokens text[])
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  -- B17: a row that has used its five attempts will never be claimed again; it ends failed, with
  -- the reason written when the sender left none.
  update public.notification_outbox o
     set status = 'failed',
         last_error = coalesce(o.last_error, 'retries exhausted')
   where o.status = 'pending'
     and o.attempts >= 5;

  -- Idea 7, the group 3 review: an alert that waited out quiet hours may have gone stale — the job
  -- hired or withdrawn, the customer blocked or muted, nearby alerts switched off. Re-checked now,
  -- once, before it can leave; a stale one is resolved as skipped.
  update public.notification_outbox o
     set status = 'skipped',
         last_error = 'quiet hours: stale by morning'
   where o.status = 'pending'
     and o.category = 'nearby_jobs'
     and o.send_after is not null
     and o.send_after <= now()
     and not exists (
       select 1
       from public.jobs j
       where j.id::text = o.data ->> 'jobId'
         and j.status = 'open'
         and public.should_notify(o.recipient_id, j.client_id, 'nearby_jobs')
     );

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
