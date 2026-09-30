-- 20260930001100_receipts.sql — idea 8, "The receipt": after a release, the customer and the worker
-- each get a receipt by email, with a short job number, the amount, the What-happened timeline,
-- category · area and the price lines, and under them only "Questions? Reply to this email and quote
-- the job number."
--
-- THE DECISION: docs/DECISIONS.md 2026-09-30 entry (4) (8), and the build run's brief
-- (docs/dispatch/BUILD-RUN.md §1, "8."): Brazos's own email (the operator: "Brazos's own email"),
-- a short job number (an additive column, e.g. BZ-0186), the two receipts as drawn (the record's §3,
-- .shots/refresh/boards/full-list.html, demos M1 and M2), sent from an edge function through an email
-- service's HTTP API — no npm package — whose key is a staging secret only the operator places;
-- until it exists the send is skipped and logged.
--
-- THE VERSION: 20260930001000_job_series.sql is the newest before it, so this takes 001100. The
-- pgTAP file is supabase/tests/190_receipts.sql; the email itself is supabase/functions/send-receipts.
--
-- WHAT THIS FILE DOES, in one transaction:
--   (1) jobs.job_number integer — a short serial for people to quote: every existing job numbered
--       in the order it was created, then a sequence default for every new one, NOT NULL, unique.
--       Additive; jobs' grants are table-level and no client write path reaches the column. The
--       app never shows a formatted number it computed: the receipt prints "BZ-" and at least four
--       digits (send-receipts/receipt.mjs).
--   (2) public.receipt_outbox — one row per side per released job payment (customer, worker),
--       pending → sent / skipped / failed, five attempts at most. RLS on, no policy, no grant to
--       authenticated or anon: only the service role reads it.
--   (3) enqueue_receipts() — AFTER UPDATE OF status on payments, the moment a JOB payment reaches
--       'released' (payments_notify_release's own condition), for a provider on the allow-list
--       ('stripe'): a sandbox payment moved no money, and a receipt would claim a charge that never
--       happened. Deduped per payment and side, so a transfer reversal and a second release never
--       send a second receipt.
--   (4) claim_receipt_batch(p_limit), resolve_receipt(...), receipt_details(p_payment_id) — the
--       send-receipts function's three calls, service_role only. receipt_details reads the ledger:
--       every amount on a receipt is a payments column, verbatim (the agreed price amount_cents,
--       the protection fee customer_fee_cents, the all-in charge_amount_cents, the worker-side fee
--       platform_fee_cents and what moved to the worker, transfer_cents) — the one fallback for a
--       row without them is the columns' own documented rule, here, in the database.
--   (5) drain_receipts() and install_receipt_schedule() — every five minutes, and only when a
--       receipt is waiting, POST the send-receipts function. Its address and key come from the Vault:
--       send_receipts_url / send_receipts_service_key when the operator has placed them, otherwise
--       the settlement function's own entries (process_settlements_url with this function's name,
--       and the same service key every function checks against) — so no new secret is needed for
--       the plumbing, only the email service's key.
--
-- WHAT THIS FILE DOES NOT TOUCH: every payments column, release_job_payment(), the settlement
-- functions, payments_notify_release. NOT destructive under scripts/staging-scan.sh. Reversible: one
-- corrective migration unschedules brazos-send-receipts, drops the functions, the trigger, the
-- outbox, and the column with its sequence.

begin;

-- ---------------------------------------------------------------------------
-- 1. The job number.
-- ---------------------------------------------------------------------------
create sequence if not exists public.job_number_seq as integer start with 1 minvalue 1;
alter table public.jobs add column if not exists job_number integer;
update public.jobs j
   set job_number = n.rn
  from (select id, row_number() over (order by created_at, id) as rn from public.jobs) n
 where j.id = n.id
   and j.job_number is null;
select setval('public.job_number_seq', coalesce((select max(job_number) from public.jobs), 0) + 1, false);
alter table public.jobs alter column job_number set default nextval('public.job_number_seq');
alter table public.jobs alter column job_number set not null;
alter sequence public.job_number_seq owned by public.jobs.job_number;
revoke all on sequence public.job_number_seq from public, anon, authenticated;
create unique index if not exists jobs_job_number_key on public.jobs (job_number);
comment on column public.jobs.job_number is 'Idea 8 (docs/DECISIONS.md 2026-09-30 entry (4)): the short number a person quotes — "BZ-0186" on the receipts. Every job before this column numbered in creation order; every new one from job_number_seq.';

-- ---------------------------------------------------------------------------
-- 2. The receipts waiting to go.
-- ---------------------------------------------------------------------------
create table if not exists public.receipt_outbox (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  role text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  provider_ref text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint receipt_outbox_role_known check (role in ('customer', 'worker')),
  constraint receipt_outbox_status_known check (status in ('pending', 'sent', 'skipped', 'failed')),
  constraint receipt_outbox_one_per_side unique (payment_id, role)
);
alter table public.receipt_outbox enable row level security;
revoke all on table public.receipt_outbox from public, anon, authenticated, service_role;
grant select on table public.receipt_outbox to service_role;
create index if not exists receipt_outbox_pending_idx on public.receipt_outbox (created_at) where status = 'pending';
comment on table public.receipt_outbox is
  'Idea 8: one receipt per side per released job payment, sent by the send-receipts edge function (woken by drain_receipts). Service role only; written by enqueue_receipts, claim_receipt_batch and resolve_receipt.';

-- ---------------------------------------------------------------------------
-- 3. The moment of release: one receipt to each side.
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_receipts() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.receipt_outbox (payment_id, job_id, recipient_id, role)
  values
    (new.id, new.job_id, new.payer_id, 'customer'),
    (new.id, new.job_id, new.payee_id, 'worker')
  on conflict (payment_id, role) do nothing;
  return new;
end;
$$;
revoke all on function public.enqueue_receipts() from public, anon, authenticated;
drop trigger if exists payments_enqueue_receipts on public.payments;
create trigger payments_enqueue_receipts after update of status on public.payments
  for each row
  when (new.status = 'released' and old.status is distinct from 'released'
        and new.kind = 'job_payment' and new.provider in ('stripe'))
  execute function public.enqueue_receipts();

-- ---------------------------------------------------------------------------
-- 4. The sender's three calls.
-- ---------------------------------------------------------------------------
create or replace function public.claim_receipt_batch(p_limit integer default 20)
returns setof public.receipt_outbox
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with claimed as (
    select r.id
    from public.receipt_outbox r
    where r.status = 'pending' and r.attempts < 5
    order by r.created_at
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    for update skip locked
  ),
  marked as (
    update public.receipt_outbox r
       set attempts = r.attempts + 1
      from claimed c
     where r.id = c.id
    returning r.*
  )
  select * from marked;
end;
$$;
revoke all on function public.claim_receipt_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_receipt_batch(integer) to service_role;

create or replace function public.resolve_receipt(
  p_id uuid,
  p_status text,
  p_error text default null,
  p_provider_ref text default null
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if p_status is null or p_status not in ('pending', 'sent', 'skipped', 'failed') then
    raise exception 'resolve_receipt: unknown status';
  end if;
  update public.receipt_outbox
     set status = case when p_status = 'pending' and attempts >= 5 then 'failed' else p_status end,
         last_error = left(p_error, 500),
         provider_ref = coalesce(p_provider_ref, provider_ref),
         sent_at = case when p_status = 'sent' then now() else sent_at end
   where id = p_id;
end;
$$;
revoke all on function public.resolve_receipt(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.resolve_receipt(uuid, text, text, text) to service_role;

create or replace function public.receipt_details(p_payment_id uuid) returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'job_id', j.id,
    'job_number', j.job_number,
    'title', j.title,
    'category', j.category::text,
    'location', j.location,
    'posted_at', j.created_at,
    'completed_at', j.completed_at,
    'hired_at', coalesce(a.accepted_at, p.created_at),
    'held_at', p.held_at,
    'approved_at', p.release_requested_at,
    'released_at', coalesce(p.released_at, p.release_requested_at),
    'release_reason', p.release_reason,
    'provider', p.provider,
    'provider_ref', p.provider_ref,
    -- Every amount is the ledger's, verbatim; the fallbacks are the columns' own documented rules
    -- for a row written before they existed.
    'agreed_cents', p.amount_cents,
    'protection_fee_cents', p.customer_fee_cents,
    'tax_cents', p.tax_cents,
    'charged_cents', coalesce(p.charge_amount_cents, p.amount_cents + p.customer_fee_cents + p.tax_cents),
    'worker_fee_cents', p.platform_fee_cents,
    'worker_fee_bps', p.worker_fee_bps,
    'paid_to_worker_cents', coalesce(p.transfer_cents, p.amount_cents - p.platform_fee_cents),
    'customer_id', p.payer_id,
    'customer_name', public.notify_display_name(p.payer_id),
    'worker_id', p.payee_id,
    'worker_name', public.notify_display_name(p.payee_id),
    'offer_by_worker', (o.author_id = p.payee_id),
    'offer_cents', o.amount_cents,
    'offered_at', o.created_at
  )
  from public.payments p
  join public.jobs j on j.id = p.job_id
  left join public.job_agreements a on a.job_id = j.id
  left join public.job_offers o on o.id = coalesce(p.offer_id, j.accepted_offer_id)
  where p.id = p_payment_id
$$;
revoke all on function public.receipt_details(uuid) from public, anon, authenticated;
grant execute on function public.receipt_details(uuid) to service_role;
comment on function public.receipt_details(uuid) is
  'Idea 8, service_role only (send-receipts): everything a receipt says about one job payment — the job number, title, category, area, the What-happened instants, and every amount verbatim from the ledger — as one object.';

-- ---------------------------------------------------------------------------
-- 5. The wake-up, and its schedule.
-- ---------------------------------------------------------------------------
create or replace function public.drain_receipts() returns bigint
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_url        text;
  v_key        text;
  v_request_id bigint;
begin
  -- Nothing waiting: the function is not woken at all.
  if not exists (select 1 from public.receipt_outbox where status = 'pending' and attempts < 5) then
    return null;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'send_receipts_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'send_receipts_service_key';
  if v_url is null or v_key is null then
    -- The same project's settlement function: its address with this function's name, and the
    -- service key every function checks against. No new secret for the plumbing.
    select replace(decrypted_secret, '/process-settlements', '/send-receipts') into v_url
      from vault.decrypted_secrets where name = 'process_settlements_url';
    select decrypted_secret into v_key
      from vault.decrypted_secrets where name = 'process_settlements_service_key';
  end if;
  if v_url is null or v_key is null or v_url not like '%/send-receipts%' then
    raise exception 'drain_receipts: vault secrets missing';
  end if;

  select net.http_post(
    url                  := v_url,
    body                 := '{}'::jsonb,
    params               := '{}'::jsonb,
    headers              := jsonb_build_object(
                              'Content-Type',  'application/json',
                              'Authorization', 'Bearer ' || v_key
                            ),
    timeout_milliseconds := 30000
  ) into v_request_id;

  return v_request_id;
end;
$$;
revoke all on function public.drain_receipts() from public, anon, authenticated;
grant execute on function public.drain_receipts() to service_role;
comment on function public.drain_receipts() is
  'Idea 8, service_role only: when a receipt waits, POSTs the send-receipts edge function — its URL and key from the Vault (send_receipts_url / send_receipts_service_key, else the settlement function''s entries with this function''s name). Raises rather than POSTing to a null URL.';

create or replace function public.install_receipt_schedule() returns text
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_stale bigint;
begin
  if not public.pg_function_present('cron', 'schedule') then
    raise notice 'receipts: pg_cron absent (local stack) — schedule skipped';
    return 'skipped: pg_cron absent';
  end if;

  -- By jobid: cron.unschedule has a (bigint) and a (name) overload.
  for v_stale in select j.jobid from cron.job j where j.jobname = 'brazos-send-receipts'
  loop
    perform cron.unschedule(v_stale);
  end loop;

  perform cron.schedule('brazos-send-receipts', '*/5 * * * *',
                        $cron$select public.drain_receipts();$cron$);

  return 'scheduled: brazos-send-receipts';
end
$fn$;
revoke all on function public.install_receipt_schedule() from public, anon, authenticated;
grant execute on function public.install_receipt_schedule() to service_role;
comment on function public.install_receipt_schedule() is
  'Idea 8: schedules brazos-send-receipts every five minutes where pg_cron exists (the settlement schedules'' idempotent shape); skips with a notice on a stack without it.';

select public.install_receipt_schedule();

commit;
