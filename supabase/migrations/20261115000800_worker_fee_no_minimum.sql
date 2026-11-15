-- 20261115000800_worker_fee_no_minimum.sql — the worker-side $1 minimum fee goes.
--
-- THE OWNER, 2026-11-15: "remove that hidden bs, on a $10 job we should only take .75 cents... no
-- minimum of that." Asked "Remove the worker's $1 minimum fee from the app?": "Yes, remove it".
--
-- WHAT CHANGES. One new fee_schedule row, in force from this migration, with
-- worker_min_fee_cents = 0. Every other number is copied from the row in force (current_fee()),
-- none typed again. No row is UPDATEd (fee_schedule is time-versioned): a job hired before keeps
-- the terms its agreement froze (job_agreements.worker_fee_cents; job_terms reads its own
-- fee_schedule_id). No function changes: quote_job_price already takes the minimum from
-- current_fee(), so a quote is 7.5% of the price, rounded, and nothing more.
--
-- Guarded: when the row in force already has no minimum, nothing is inserted, so a second run adds
-- no row. Additive under scripts/staging-scan.sh. Proof: supabase/tests/455_worker_fee_no_minimum.sql.

begin;

insert into public.fee_schedule (effective_from, customer_bps, worker_bps, worker_min_fee_cents, tip_customer_bps,
                                 tax_bps, cancel_fee_bps, cancel_fee_min_cents, cancel_fee_max_cents, tip_max_bps, tip_max_cents)
select now(), f.customer_bps, f.worker_bps, 0, f.tip_customer_bps,
       f.tax_bps, f.cancel_fee_bps, f.cancel_fee_min_cents, f.cancel_fee_max_cents, f.tip_max_bps, f.tip_max_cents
  from public.current_fee() f
 where f.worker_min_fee_cents <> 0;

commit;
