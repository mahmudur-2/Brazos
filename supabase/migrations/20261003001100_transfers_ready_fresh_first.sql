-- 20261003001100_transfers_ready_fresh_first.sql — FIX-RUN A9 review (2026-10-03): a row the
-- provider keeps refusing cannot hold the head of the payout queue.
--
-- THE JAM. transfers_ready (20261003000000) kept transfers_due's order, release_requested_at. A
-- transfer the provider refuses for a reason of the row's own — a definitive 4xx other than 409 or
-- 429 — rotates its idempotency key (process-settlements classify.mjs says rotate;
-- record_settlement_attempt() increments transfer_attempts) and is retried on every tick, and it
-- stays exactly where it was: at the head, by its old release request. Twenty-five such rows fill
-- the drain's whole read (QUEUE_LIMIT 25), and every payable row behind them waits for ever. The
-- refund queue self-rotates — refunds_due orders by updated_at, which every recorded attempt moves —
-- transfers_due does not.
--
-- THE FIX. transfers_ready orders by transfer_attempts first, then release_requested_at: a row never
-- tried comes before any row that has been, and among rows tried the same number of times the
-- oldest release request still goes first. Each refusal moves the row one tier back, so a refused
-- row is retried once the fresher rows have had their turn and never starves them. The column list
-- is t.* from transfers_due, exactly as before, so CREATE OR REPLACE is legal; no predicate changes.
-- transfers_due stays the complete queue in its own order. The drain (process-settlements) reads the
-- view with no order of its own, so it takes this one.
--
-- NOT DESTRUCTIVE under scripts/staging-scan.sh: one CREATE OR REPLACE VIEW, its grants and comment.
-- Reversible: one corrective migration restores 20261003000000's order.

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
   order by t.transfer_attempts, t.release_requested_at;
revoke all on table public.transfers_ready from public, anon, authenticated;
grant select on table public.transfers_ready to service_role;
comment on view public.transfers_ready is
  'A9: transfers_due minus the rows the drain could never pay — the payee has no ENABLED payout account (payment_accounts.payouts_enabled with a stripe_account_id). process-settlements reads this view, so blocked payees at the head of transfers_due no longer hide payable rows behind them. A9 review (20261003001100): ordered by transfer_attempts, then release_requested_at — a row never tried is paid before any row the provider has refused, so refused rows at the head cannot starve the rest; transfers_due keeps its own order.';
