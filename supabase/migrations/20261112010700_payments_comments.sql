-- 20261112010700_payments_comments.sql — lean B22: the payments comments say what the code does.
-- Spec: docs/critical/money-safety.md.
--
-- WHAT WAS WRONG. The baseline comments describe the sandbox ledger (tips born released, a
-- simulated cash-out, an on-read 72-hour clock), and transfer_cents' comment predates tips and
-- the lifecycle sweeps that now write it. Comments only; no behaviour changes.

begin;

comment on table public.payments is
  'The money ledger: one row per money object (a job payment or a tip), each a stripe PaymentIntent. What the database ASKS for is transfer_cents / refund_cents with release_requested_at; what the provider SAYS happened is received_cents, refunded_cents, chargeback_cents, refund_ref and payment_transfers. process-settlements sends only what transfers_due / refunds_due offer; every row it will not send is in payment_attention. Earnings derive from this table, never a hand-kept balance. RLS: parties view own payments (payer or payee); authenticated reads a column list only (20261112010800).';
comment on column public.payments.provider_ref is
  'The stripe PaymentIntent id (pi_...), attached by attach_provider_ref. Legacy sandbox rows carry a fabricated sandbox_<uuid>. stripe_payment_intent_id is an abandoned pre-repo column, unused.';
comment on column public.payments.released_at is
  'When the worker''s transfer was recorded (transfer.created, or the drain''s write-back through record_settlement_sent): held -> released for job payments and tips alike. Cleared when the transfer is reversed. Legacy sandbox rows were stamped at release.';
comment on column public.payments.release_reason is
  'Why the release was requested: approved (the customer), auto_approved (auto_release_due_payments), cancellation_fee (cancel_job late), dispute_resolved (resolve_job_dispute). NULL for tips and for rows never released.';
comment on column public.payments.paid_out_at is
  'Legacy sandbox rows only (the simulated cash-out). No current path writes it: payout.paid is not handled.';
comment on column public.payments.transfer_cents is
  'What must move to the worker, decided by the database: release_job_payment, auto_release_due_payments, cancel_job, resolve_job_dispute, resolve_tip, the lifecycle sweeps, and apply_payment_event for a charged tip. process-settlements transfers exactly this and computes nothing, and only while transfers_due offers the row.';
comment on column public.payments.release_requested_at is
  'When a transfer to the worker was requested (the release, or a tip''s charge). Preserved through a transfer reversal so the customer''s release button never re-opens; resolve_job_dispute (job payment) or resolve_tip (tip) clears a reversal park.';
comment on column public.payments.transfer_reversed_at is
  'Set when no transfer of the row is left live after transfer.reversed: the row is parked, out of transfers_due, until resolve_job_dispute or resolve_tip decides, either of which increments transfer_attempts.';
comment on column public.payments.transfer_attempts is
  'The transfer attempt number. The idempotency key is tr:<payment id>:<transfer_attempts>: one attempt, one key, at most one transfer. Moved only by record_settlement_result (a refusal), settlement_send_reopen (the owner), resolve_job_dispute and resolve_tip (a reversed transfer re-opened).';
comment on column public.payments.refund_attempts is
  'The refund attempt number. The idempotency key is rf:<payment id>:<refund_attempts>. Moved only by record_settlement_result (a refusal) and settlement_send_reopen (the owner); record_settlement_attempt, the recorder of drains deployed before 20261112010300, still rotates it on a refusal.';

commit;
