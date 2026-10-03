-- 20261003000000_settlement_queue_ready.sql — FIX-RUN A9 (2026-10-03): the payout queue cannot jam
-- behind payees it can never pay.
--
-- THE JAM. process-settlements reads transfers_due with `limit=25` (QUEUE_LIMIT), then skips every
-- row whose payee has no ENABLED payout account — counted blocked, left in place. transfers_due is
-- ordered by release_requested_at, so 25 such rows at the head hide every payable row behind them,
-- tick after tick, for ever. refunds_due has the same shape: a row with no provider reference to
-- refund against is skipped and stays at the head.
--
-- THE FIX, IN THE DATABASE. Two additive views, each the matching *_due view minus the rows the
-- drain could never act on, in the same order:
--   transfers_ready — transfers_due whose payee has a payment_accounts row with payouts_enabled and
--                     a stripe_account_id (the exact predicate of the drain's payee lookup);
--   refunds_ready   — refunds_due with a provider_ref.
-- The drain reads the *_ready views; the *_due views stay as the complete queues, untouched, and
-- "blocked" in the drain's summary becomes the whole difference between the two (queue-wide), not
-- the handful that happened to land in one batch. No predicate of either *_due view changes: the
-- ready views are built ON them, so an admission rule changed there is changed here too.
--
-- NOT DESTRUCTIVE under scripts/staging-scan.sh: two CREATE VIEWs, their grants and comments.
-- Reversible: one corrective migration drops the two views and the drain reads *_due again.

create or replace view public.transfers_ready as
  select t.*
    from public.transfers_due t
   where exists (
           select 1
             from public.payment_accounts a
            where a.user_id = t.payee_id
              and a.payouts_enabled
              and a.stripe_account_id is not null
         )
   order by t.release_requested_at;
revoke all on table public.transfers_ready from public, anon, authenticated;
grant select on table public.transfers_ready to service_role;
comment on view public.transfers_ready is
  'A9: transfers_due minus the rows the drain could never pay — the payee has no ENABLED payout account (payment_accounts.payouts_enabled with a stripe_account_id). process-settlements reads this view, so blocked payees at the head of transfers_due no longer hide payable rows behind them. Same order as transfers_due.';

create or replace view public.refunds_ready as
  select r.*
    from public.refunds_due r
   where r.provider_ref is not null
   order by r.updated_at;
revoke all on table public.refunds_ready from public, anon, authenticated;
grant select on table public.refunds_ready to service_role;
comment on view public.refunds_ready is
  'A9: refunds_due minus the rows with no provider reference to refund against. process-settlements reads this view; refunds_due stays the complete queue. Same order as refunds_due.';
