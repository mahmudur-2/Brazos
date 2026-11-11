-- B14 (docs/lean/AUDIT-LEDGER.md; design docs/critical/privacy-and-limits.md): offer cards in a chat
-- are written by the server only.
--
-- messages_insert_party (20261108000000_lean_v1.sql:103-124) let a party insert a row carrying
-- job_offer_id before messaging opened (the "structured negotiation event" exemption), and once
-- messaging was open it never looked at request_event or request_amount_cents. Either way a person
-- could post a card that looks like an offer, a counter or an acceptance and never happened. The
-- card rows are written by the offer functions (create_offer, counter_offer, accept_offer,
-- decline_offer, withdraw_offer, expire_offer_if_stale, settle_offers_on_cancelled_job), all
-- security definer, so RLS never applied to them; no client code sends those three columns
-- (lib/messages.ts sendMessage, the one insert, at HEAD and at TestFlight build 10, 9b0064f).
--
-- A client row is now plain: messaging open, and the three card columns null. The participant and
-- block rule is lean v1's, unchanged. Additive: ALTER POLICY.

begin;

alter policy messages_insert_party on public.messages with check (
  sender_id = auth.uid()
  and public.is_active_user()
  and (
    exists (
      select 1 from public.jobs j
      where j.id = messages.job_id
        and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
        and not public.is_blocked_between(j.client_id, coalesce(j.assigned_worker_id, j.client_id))
    )
    or exists (
      select 1 from public.direct_threads t
      where t.id = messages.direct_thread_id
        and (t.user_a = auth.uid() or t.user_b = auth.uid())
        and not public.is_blocked_between(t.user_a, t.user_b)
    )
  )
  and public.messaging_unlocked(job_id, direct_thread_id)
  and job_offer_id is null
  and request_event is null
  and request_amount_cents is null
);

comment on policy messages_insert_party on public.messages is
  'A party to the thread, not blocked, once messaging_unlocked() is true, and a plain message only: job_offer_id, request_event and request_amount_cents stay null (B14). Offer cards are written by the offer functions, which run as their owner.';

commit;
