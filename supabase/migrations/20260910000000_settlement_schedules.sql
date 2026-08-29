-- 20260910000000_settlement_schedules.sql — R5: the money timers, the
-- settlement drain, the durable customer reference, and the release copy.
--
-- One transaction, ending in a sentinel function (phase50's shape):
-- settlement_schedules_enabled() exists only if every statement here
-- committed.
--
-- VOCABULARY. Payment-holding is "held in protection", everywhere. Money is
-- integer cents. No notification copy written here carries a dollar amount.
--
-- WHY THIS FILE EXISTS — THE BUG IT CORRECTS.
-- 20260905000000_stripe_foundation.sql section 22 guarded its schedules with
--
--     if to_regproc('cron.schedule') is null then ... return;
--
-- and pg_cron ships cron.schedule with TWO overloads —
-- (schedule text, command text) and (job_name text, schedule text, command
-- text). to_regproc() returns NULL for an AMBIGUOUS name, not only for an
-- absent one, so on staging — where pg_cron is installed and cron.job already
-- holds brazos-drain-push — the guard reported "pg_cron absent" and returned.
-- No money timer was ever created. The applied migration is not rewritten
-- (standing rule); this corrective file replaces the resolver test with a
-- CATALOG test, which two overloads cannot confuse, and creates all three
-- schedules.
--
-- WHAT IT ADDS BEYOND THAT CORRECTION:
--   * drain_settlements(), the Vault-indirected POST that wakes the
--     process-settlements edge function (the drain_notification_outbox
--     pattern, secret names process_settlements_*).
--   * get_payment_customer / set_payment_customer, the durable per-user
--     provider customer reference create-payment reads and writes. It lives
--     on public.payment_accounts.stripe_customer_id — the column
--     stripe_foundation section 5 already created for it — because that table
--     is RLS-enabled with NO policies and NO client grants, so it is
--     unreachable by anon and authenticated under every role. profiles was
--     rejected: it carries a legacy stripe_account_id and an owner UPDATE
--     policy, so a reference there would sit beside client-writable rows.
--   * notify_on_payment_release() made provider-aware, so the first live
--     payout does not tell a real worker their money moved "in the sandbox
--     ledger".
--
-- DEFAULT PRIVILEGES. The baseline's tail re-establishes ALTER DEFAULT
-- PRIVILEGES ... GRANT ALL ON TABLES TO anon, authenticated, service_role,
-- and functions are born executable by PUBLIC (the CREATE-time default ACL).
-- Every function below therefore carries its own revoke/grant pair in this
-- same file — a later phase cannot fix an ACL that create-or-replace
-- preserves.

begin;

-- ---------------------------------------------------------------------------
-- 1. The catalog probe that replaces to_regproc().
--
--    to_regproc() asks the RESOLVER "which single function is this name?" and
--    answers NULL when the name is ambiguous. This asks the CATALOG "does any
--    function by this name exist here?", which is the question the guard
--    always meant to ask. It is a function rather than an inline expression so
--    supabase/tests/050_settlements.sql can point THIS SHIPPED CODE at a
--    two-overload fixture and prove it where to_regproc() fails.
-- ---------------------------------------------------------------------------
create or replace function public.pg_function_present(p_namespace text, p_name text)
returns boolean
language sql stable set search_path = pg_catalog, pg_temp as $$
  select exists (
    select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = p_namespace
       and p.proname = p_name
  )
$$;
revoke all on function public.pg_function_present(text, text) from public, anon, authenticated;
grant execute on function public.pg_function_present(text, text) to service_role;
comment on function public.pg_function_present(text, text) is
  'Does a function of this name exist in this namespace? Overload-proof, unlike to_regproc(), which returns NULL for an ambiguous name — the exact reason stripe_foundation section 22 believed pg_cron was absent on a database that has it.';

-- ---------------------------------------------------------------------------
-- 2. drain_settlements(): cron wakes the process-settlements edge function.
--
--    Copied from drain_notification_outbox() in the baseline, secret names
--    changed. THE INDIRECTION IS THE POINT: cron.job.command is readable by
--    anyone who can query that table, so the service key must never appear in
--    it. The command is a bare `select public.drain_settlements();` and the
--    key is read from the Vault inside this SECURITY DEFINER body, which
--    only service_role may call.
--
--    Both secrets already exist in staging's Vault. A missing one raises a
--    NAMED exception rather than POSTing to a null URL, so the failure says
--    what is wrong instead of returning a request id for a request that never
--    had a destination.
-- ---------------------------------------------------------------------------
create or replace function public.drain_settlements() returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_url        text;
  v_key        text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'process_settlements_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'process_settlements_service_key';

  if v_url is null or v_key is null then
    raise exception 'drain_settlements: vault secrets missing';
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
revoke all on function public.drain_settlements() from public, anon, authenticated;
grant execute on function public.drain_settlements() to service_role;
comment on function public.drain_settlements() is
  'service_role only: POSTs the process-settlements edge function, reading its URL and service key from the Vault (process_settlements_url / process_settlements_service_key). The secret stays out of cron.job.command, which any reader of that table can see — that is the whole reason for the indirection. Raises drain_settlements: vault secrets missing rather than POSTing to a null URL.';

-- ---------------------------------------------------------------------------
-- 3. install_settlement_schedules(): the corrected guard and the three jobs.
--
--    Idempotent and re-runnable, so it can be proved by the pgTAP rather than
--    only observed once at migration time. Same skip-with-notice shape as
--    stripe_foundation section 22, so a local reset without pg_cron still
--    succeeds — that skip is the designed behaviour, not a failure.
--
--    cron.schedule() is documented as upserting on job name, but this block
--    does not rely on it: every name it is about to create is unscheduled BY
--    ID first, so re-applying can never fail on a duplicate name on any
--    pg_cron version. brazos-drain-push is not in the list and is never
--    touched.
-- ---------------------------------------------------------------------------
create or replace function public.install_settlement_schedules() returns text
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_names text[] := array[
    'auto-release-due-payments',
    'expire-unfunded-payments',
    'brazos-process-settlements'
  ];
  v_stale bigint;
begin
  if not public.pg_function_present('cron', 'schedule') then
    raise notice 'settlement_schedules: pg_cron absent (local stack) — schedules skipped';
    return 'skipped: pg_cron absent';
  end if;

  -- By jobid: cron.unschedule has a (bigint) and a (name) overload, and a
  -- declared bigint picks one of them without argument-resolution guesswork.
  for v_stale in select j.jobid from cron.job j where j.jobname = any (v_names)
  loop
    perform cron.unschedule(v_stale);
  end loop;

  perform cron.schedule('auto-release-due-payments', '*/10 * * * *',
                        $cron$select public.auto_release_due_payments();$cron$);
  perform cron.schedule('expire-unfunded-payments', '*/15 * * * *',
                        $cron$select public.expire_unfunded_payments();$cron$);
  perform cron.schedule('brazos-process-settlements', '*/5 * * * *',
                        $cron$select public.drain_settlements();$cron$);

  return 'scheduled: ' || array_length(v_names, 1)::text;
end
$fn$;
revoke all on function public.install_settlement_schedules() from public, anon, authenticated;
grant execute on function public.install_settlement_schedules() to service_role;
comment on function public.install_settlement_schedules() is
  'service_role only: creates the three money timers (auto-release-due-payments every 10 min, expire-unfunded-payments every 15 min, brazos-process-settlements every 5 min) when pg_cron is present, and skips with a notice when it is not. Idempotent — it unschedules each of its own names by jobid before creating it. Never touches brazos-drain-push.';

select public.install_settlement_schedules();

-- ---------------------------------------------------------------------------
-- 4. The durable customer reference (create-payment reads and writes it).
--
--    A provider idempotency key expires after roughly 24 hours, so
--    idempotency-by-user-id cannot supply durable reuse — only a stored
--    reference can, and it must survive forever or the same person acquires a
--    new provider customer every day.
--
--    HOME: public.payment_accounts.stripe_customer_id, created by
--    stripe_foundation section 5 for exactly this. user_id is the primary
--    key, so there is exactly one per user; the table is RLS-enabled with NO
--    policies and NO grants to anon or authenticated, so no client role can
--    read or write it under any policy. These two functions exist so the edge
--    function needs no table access at all: they are the narrow surface, in
--    the shape set_payouts_enabled() already established for R5.
-- ---------------------------------------------------------------------------
create or replace function public.get_payment_customer(p_user_id uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select a.stripe_customer_id from public.payment_accounts a where a.user_id = p_user_id
$$;
revoke all on function public.get_payment_customer(uuid) from public, anon, authenticated;
grant execute on function public.get_payment_customer(uuid) to service_role;
comment on function public.get_payment_customer(uuid) is
  'service_role only (R5 create-payment): this user''s stored provider customer id, or null when they have none yet. The read half of the durable reference on payment_accounts.stripe_customer_id.';

create or replace function public.set_payment_customer(p_user_id uuid, p_customer_id text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_effective text;
begin
  if p_user_id is null or coalesce(p_customer_id, '') = '' then
    raise exception 'set_payment_customer: user id and customer id are required';
  end if;

  -- FIRST WRITER WINS, and the winner is what comes back. Two concurrent
  -- checkouts for one user can both reach the provider before either stores
  -- anything; coalesce keeps the reference that is already recorded and
  -- returns it, so the caller uses the stored customer rather than the one it
  -- happened to create. Nothing here is monetary and nothing is overwritten.
  insert into public.payment_accounts as a (user_id, stripe_customer_id)
  values (p_user_id, p_customer_id)
  on conflict (user_id) do update
     set stripe_customer_id = coalesce(a.stripe_customer_id, excluded.stripe_customer_id),
         updated_at = now()
  returning a.stripe_customer_id into v_effective;

  return v_effective;
end;
$$;
revoke all on function public.set_payment_customer(uuid, text) from public, anon, authenticated;
grant execute on function public.set_payment_customer(uuid, text) to service_role;
comment on function public.set_payment_customer(uuid, text) is
  'service_role only (R5 create-payment): stores this user''s provider customer id once and returns the EFFECTIVE one. An id already recorded is never overwritten, so a race between two checkouts converges on a single customer rather than orphaning one.';

-- ---------------------------------------------------------------------------
-- 5. notify_on_payment_release(): provider-aware body (the parked copy).
--
--    The baseline told every released payee the money moved "in the sandbox
--    ledger." On the first live payout that sentence goes to a real worker
--    about real money. Only the BODY changes: the trigger
--    (payments_notify_release), the recipient (payee_id), the actor, the
--    category, the type, the title rule, the data payload and the dedupe key
--    are byte-for-byte the baseline's.
--
--    The sandbox sentence is allow-listed to provider = 'sandbox' rather than
--    block-listing 'stripe': a provider this branch has never heard of gets
--    the real-money sentence, which is the fail-safe direction — claiming
--    "sandbox ledger" about real money is the failure worth preventing.
--    Neither sentence carries a dollar amount, and the live one promises no
--    timing.
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_payment_release() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_title text;
  v_body  text;
begin
  if new.status = 'released' and old.status is distinct from 'released'
     and new.kind = 'job_payment' then
    v_title := case when new.release_reason = 'auto_approved'
      then 'Payment released automatically'
      else 'Your work was approved' end;
    v_body := case when new.provider = 'sandbox'
      then 'The payment is released to you in the sandbox ledger.'
      else 'Your payment has been released and is on its way to your bank.' end;
    perform public.enqueue_notification(
      new.payee_id,
      new.payer_id,
      'jobs',
      'payment_released',
      v_title,
      v_body,
      jsonb_build_object('screen', 'WorkerJob', 'jobId', new.job_id::text),
      'payment_released:' || new.id::text
    );
  end if;
  return new;
end;
$$;
revoke all on function public.notify_on_payment_release() from public, anon, authenticated;
comment on function public.notify_on_payment_release() is
  'AFTER UPDATE on payments (trigger payments_notify_release): tells the payee their job_payment reached released, once, keyed payment_released:<payment id>. The body is provider-aware — sandbox rows keep the sandbox-ledger sentence, everything else says the payment is on its way to their bank. No dollar amount, no timing promise.';

-- ---------------------------------------------------------------------------
-- 6. Sentinel. Created last inside the transaction, so its presence proves
--    the entire file committed (phase50's shape).
-- ---------------------------------------------------------------------------
create or replace function public.settlement_schedules_enabled() returns boolean
language sql immutable set search_path = public, pg_temp as $$ select true $$;
revoke all on function public.settlement_schedules_enabled() from public, anon;
grant execute on function public.settlement_schedules_enabled() to authenticated, service_role;
comment on function public.settlement_schedules_enabled() is
  'Marker: 20260910000000_settlement_schedules.sql has been applied. Created last inside its transaction, so its presence proves the entire file committed.';

commit;
