-- refund_owed — money M2, A9 item g: one answer to "is a refund still owed on this payment".
-- Proof: supabase/tests/499_refund_owed.sql.
--
-- WHAT WAS WRONG. No function answered it, so a reader outside the money lane wrote its own test.
-- refunded_cents >= refund_cents is false forever after a refund arranged another way
-- (resolve_refund_failure moves no money, so it changes neither the status nor the refunded total).
-- The other refund functions answer other questions. payment_refund_reserved_cents is the part of the
-- charge held back from the worker. payment_refund_held_by_dispute only says whether a card dispute
-- blocks the payment.
--
-- WHAT CHANGES (additive). payment_refund_owed(payments) is true when a refund of the payment is in
-- the refund queue (refunds_ready) or on the owner's list (a refund line of payment_attention,
-- 20261116290000_money_timers), apart from the two known edges below. It is built only from that
-- view's three refund predicates. The view leaves a ready row with no error off its list: that row is
-- in the queue. It follows the queue and the list; it is not a record of what the customer got back.
--   (1) a failed refund nobody has arranged yet: the failure arm (payment_refund_failures,
--       arranged_at is null). This holds on any row, as the line does; the owner records the
--       arrangement also when nothing more was owed;
--   (2) a refund asked that the app has not recorded as sent: the refund arm (stripe, refund_cents > 0,
--       refund_ref is null, not refunded, refunded total below the refund asked). This covers queued,
--       retrying, stopped, past the 23-hour stop, under a card dispute, and after an earlier failure;
--   (3) a refund recorded as sent and not confirmed by charge.refunded: refund_unconfirmed (refund_ref
--       set, not refunded, refunded total below the refund asked, and no failure has that refund id).
-- So an arrangement ends the answer only where the list ends: once the failure is arranged and the
-- refund recorded on the payment is the one that failed. A later failure is a new row with
-- arranged_at null, so the answer is true again; it never reads refund_arranged_at. A card dispute
-- follows the list too. While it is open the refund waits for the bank, and the answer is true until
-- the refund lands. A lost dispute makes the payment refunded (apply_payment_event), so the answer is
-- false, unless a failed refund is still not arranged.
-- KNOWN EDGES (A12-01; 499 R10 and R7b test them as limits):
--   (a) after a lost card dispute for PART of a charge, apply_payment_event marks the payment refunded
--       with no amount compared (20261115000600_refund_failed_and_event_order.sql:258-259), so the
--       answer is false although part of a refund asked can still be owed;
--   (b) with refund_ref null, the answer stays true after a failed refund was arranged another way
--       outside Stripe (resolve_refund_failure changes neither refund_ref nor the totals), until a
--       developer corrects the row.
-- No client grant. A security definer function owned by postgres calls it as its owner.
--
-- Additive under scripts/staging-scan.sh.

begin;

create or replace function public.payment_refund_owed(p public.payments)
returns boolean
language sql stable
set search_path = public, pg_temp
as $fn$
  select exists (select 1 from public.payment_refund_failures f
                  where f.payment_id = p.id and f.arranged_at is null)
      or (p.provider = 'stripe'
          and coalesce(p.refund_cents, 0) > 0
          and p.status <> 'refunded'
          and coalesce(p.refunded_cents, 0) < p.refund_cents
          and (p.refund_ref is null
               or not exists (select 1 from public.payment_refund_failures f where f.refund_ref = p.refund_ref)))
$fn$;
revoke all on function public.payment_refund_owed(public.payments) from public, anon, authenticated;
comment on function public.payment_refund_owed(public.payments) is
  'A9 item g: true when a refund of the payment is in refunds_ready or on payment_attention (a refund line), apart from two known edges (A12-01): after a lost card dispute for part of a charge the payment is marked refunded, so the answer is false although part of a refund asked can still be owed; with refund_ref null the answer stays true after a failed refund was arranged another way outside Stripe, until a developer corrects the row. That is: a failed refund not yet arranged (resolve_refund_failure); or a stripe refund asked (refund_cents > 0), not refunded, with the refunded total below it, either not recorded as sent (refund_ref null) or recorded and not the refund that failed. False once Stripe refunded it, or once the refund recorded on the payment failed and was arranged another way. A later failure makes it true again. No client grant: a security definer function owned by postgres calls it.';

commit;
