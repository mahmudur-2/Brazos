-- payout_reread — money M2-3b (R-E, the hourly payout re-read): process-settlements reads again, from
-- Stripe, the payout account of a worker whose payout waits, so a worker who finished setup in Stripe
-- is paid without opening the app, and a worker Stripe will not pay is shown as the one who must act.
-- Proof: supabase/tests/486_payout_reread.sql; tests/settlementRun.test.mjs (process-settlements).
--
-- WHAT WAS WRONG. payment_accounts.payouts_status moves only when connect-status runs, and it runs only
-- when the worker opens the payouts screen (there is no connected-account webhook). A worker who
-- finished setup in Stripe's own pages and never came back left the payout waiting
-- (transfer_no_payout_account) with no end; an account Stripe stopped paying stayed enabled here, so
-- the payout was refused every five minutes (transfer_retrying, after refusal_limit 3 days, then
-- transfer_stopped) instead of waiting for the worker.
--
-- WHAT CHANGES (additive; nothing that 9d1c56d calls changes its signature or result shape).
-- 1. payout_account_checks (new table, RLS on, no policy, no grant): one row per account the drain
--    read: when, and what the read proved in the drain's words. It keeps the rotation fair when a
--    read proves nothing (an account Stripe does not answer for moves to the back like any other).
-- 2. payout_accounts_due (new view, service_role): the accounts to read again, oldest read first
--    (never read first): a stored Stripe account of a worker who is neither banned nor deleted, with
--    a payout in transfers_due, and either payouts not enabled here, or enabled with a transfer
--    refusal run going on (settlement_refusals); and not read in the last hour (the later of
--    payouts_checked_at and the last read). A banned or deleted worker is not read again: their
--    payouts stay as they are today (director, finding 1).
-- 3. record_payout_check(user, seen, status, answer) (new, service_role): the drain records one
--    read. A status (enabled, action_needed, under_review: connect-status's own rule, classifyAccount)
--    is written through set_payouts_status (the same rule, not a copy), and only when payouts_checked_at
--    is still the one the drain saw when it listed the account: a state another writer recorded
--    during the read (connect-status, for the worker) stands. Every call stamps the read (the
--    rotation). Moves no money.
--
-- THE NUMBERS. 1 hour: each account is read at most once an hour. 10: the drain reads at most 10
-- accounts a run (PAYOUT_READ_LIMIT in process-settlements), every five minutes, so at most 120
-- accounts an hour.
--
-- Additive under scripts/staging-scan.sh.

begin;

-- 1. The drain's reads.
create table if not exists public.payout_account_checks (
  user_id  uuid primary key references public.payment_accounts (user_id) on delete cascade,
  tried_at timestamptz not null default now(),
  answer   text not null
);
alter table public.payout_account_checks enable row level security;
revoke all on table public.payout_account_checks from public, anon, authenticated, service_role;
comment on table public.payout_account_checks is
  'M2-3b (R-E): one row per payout account process-settlements read again from Stripe (record_payout_check): tried_at, the last read; answer, what it proved in the drain''s words. With payouts_checked_at it orders payout_accounts_due. No client and no service_role grant: written by record_payout_check, read by payout_accounts_due.';

-- 2. The accounts to read again.
create or replace view public.payout_accounts_due as
  select a.user_id, a.stripe_account_id, a.payouts_checked_at,
         greatest(a.payouts_checked_at, c.tried_at) as last_read_at
    from public.payment_accounts a
    left join public.payout_account_checks c on c.user_id = a.user_id
   where a.stripe_account_id is not null
     and exists (select 1 from public.profiles pr
                  where pr.id = a.user_id and not coalesce(pr.banned, false) and pr.deleted_at is null)
     and ((not a.payouts_enabled
           and exists (select 1 from public.transfers_due t where t.payee_id = a.user_id))
          or (a.payouts_enabled
              and exists (select 1 from public.transfers_due t
                            join public.settlement_refusals r
                              on r.payment_id = t.id and r.kind = 'transfer' and r.ended_at is null
                           where t.payee_id = a.user_id)))
     and (greatest(a.payouts_checked_at, c.tried_at) is null
          or greatest(a.payouts_checked_at, c.tried_at) < now() - interval '1 hour')
   order by greatest(a.payouts_checked_at, c.tried_at) nulls first, a.user_id;
revoke all on table public.payout_accounts_due from public, anon, authenticated, service_role;
grant select on table public.payout_accounts_due to service_role;
comment on view public.payout_accounts_due is
  'M2-3b (R-E), service_role only: the payout accounts process-settlements reads again from Stripe, never read first, then the oldest read: a stored Stripe account of a worker neither banned nor deleted, with a payout in transfers_due, and payouts not enabled, or enabled while that payout''s refusals go on (settlement_refusals); not read in the last hour (the later of payouts_checked_at and payout_account_checks.tried_at). The drain reads at most 10 a run.';

-- 3. One read, recorded.
create or replace function public.record_payout_check(p_user_id uuid, p_seen timestamptz, p_status text, p_answer text)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_acc public.payment_accounts;
  v_now boolean;
begin
  if p_status is not null and p_status not in ('enabled', 'action_needed', 'under_review') then
    raise exception 'record_payout_check: unknown status %; enabled, action_needed or under_review only', p_status;
  end if;
  select * into v_acc from public.payment_accounts a where a.user_id = p_user_id for update;
  if not found or v_acc.stripe_account_id is null then
    return false;
  end if;
  -- A state recorded by another writer since the drain listed the account stands.
  v_now := v_acc.payouts_checked_at is not distinct from p_seen;
  if v_now and p_status is not null then
    perform public.set_payouts_status(p_user_id, p_status);
  end if;
  insert into public.payout_account_checks as c (user_id, tried_at, answer)
  values (p_user_id, now(),
          left(coalesce(nullif(btrim(p_answer), ''), 'no answer')
               || case when v_now then '' else '; not recorded: the state changed during the read' end, 300))
  on conflict (user_id) do update
     set tried_at = excluded.tried_at,
         answer   = excluded.answer;
  return v_now;
end $fn$;
revoke all on function public.record_payout_check(uuid, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.record_payout_check(uuid, timestamptz, text, text) to service_role;
comment on function public.record_payout_check(uuid, timestamptz, text, text) is
  'M2-3b (R-E), service_role only: process-settlements read this worker''s payout account again (payout_accounts_due). p_status, when the read proved one (connect-status''s rule, classifyAccount), is written through set_payouts_status, only while payouts_checked_at is still p_seen, the value the drain listed; null = the read proved nothing and nothing changes. Every call records the read (payout_account_checks), so the account moves to the back. True when the read was recorded against the state the drain saw; false for no stored account, or a state recorded meanwhile (then only the read is stamped). An unknown status is refused. Moves no money.';

commit;
