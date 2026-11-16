-- intent_reread — money M2-2 (R-F; critic A4-07 cancel_unconfirmed, R-A "Intent
-- cancel unknown"): the drain reads a voided row's PaymentIntent back, a cancel is final only when the
-- intent read back says canceled, and a cancel that stays unproven gets a line after 1 day.
-- Proof: supabase/tests/484_intent_reread.sql; tests/intentCancel.test.mjs (process-settlements).
--
-- WHAT WAS WRONG. process-settlements stamped a cancel final (record_intent_cancel, p_final true) on any
-- 2xx and on any 4xx other than 401, 403, 409, 429. A 404, a parameter-mismatch 400, or a 400 because
-- the intent had SUCCEEDED (the customer paid a row that was voided, and the webhook was missed) all
-- ended the row's queue life as "cancelled". And an answer that was never final had no end: the row
-- was asked again every tick, forever, and nothing told anyone.
--
-- WHAT CHANGES (additive; nothing that 9d1c56d calls changes its signature or result shape).
-- 1. payment_intent_checks (new table, RLS on, no policy, no grant): one row per payment whose cancel
--    was answered without proof, with the first such answer's time (never moves), the last answer's
--    time, and the last answer in the drain's words. A side table, not a payments column: a payments
--    column would change refunds_due's column list (its select p.*, 070 §6) and payment_for_party.
-- 2. record_intent_check(uuid, text): the drain records an answer that proved nothing. It moves the
--    row to the back of intents_to_cancel through record_intent_cancel(id, false) (the same rule, not a
--    copy) and keeps the first time. Only a row intents_to_cancel offers. Moves no money.
-- 3. The drain itself (process-settlements, same commit): after its cancel, unless the answer is this
--    intent read back as canceled or succeeded, it reads the intent (GET /v1/payment_intents/<id>,
--    platform scope). canceled: a payment_intent.canceled fact, stored and applied as the webhook's
--    own two steps, then the final stamp. succeeded: a payment_intent.succeeded fact with the
--    amount_received read back, applied by the existing funded-after-void rule (the whole charge back
--    through refunds_due; a different amount is blocked by payment_money_clear and listed). Anything
--    else proves nothing: requires_payment_method, requires_confirmation, requires_action,
--    requires_capture, processing, an unfamiliar status, another object, a 404, any 400, 409, 429,
--    5xx, a throw: record_intent_check, and the next tick cancels and reads again (a cancel is allowed
--    in every open status; a second cancel of a canceled intent is refused and the read decides).
--    The fact's id is the accepted re-read form with the value that can change while the intent and
--    its status are the same (2c, A4-04): process-settlements:reread:<intent>:<status>:<amount_received>.
-- 4. payment_attention_more(), replaced from money_timers (the timer_late arm word for word) with
--    one arm more: cancel_unconfirmed for a row of intents_to_cancel whose first unproven answer is
--    more than 1 day old (ref the intent id, since first answer + 1 day, which never moves). The M1
--    arm of the same code lists a row stamped final with no payment_intent.canceled applied; a row is
--    never in both (the queue holds only rows not stamped). Its sentence (payment_attention_codes) is
--    true here too: Stripe has not confirmed the close, and money may still have been taken.
-- 5. Comments of payments.intent_cancel_at and record_intent_cancel say what "final" now means.
--
-- Rows stamped final before this file (by a 4xx) are not re-read: the M1 arm lists each one an hour
-- after its stamp, unless a payment_intent.canceled was applied. Re-queueing them is one update of
-- rows the old code stamped; not done here.
--
-- Additive under scripts/staging-scan.sh.

begin;

-- 1. The unproven answers.
create table if not exists public.payment_intent_checks (
  payment_id     uuid primary key references public.payments (id) on delete cascade,
  first_tried_at timestamptz not null default now(),
  checked_at     timestamptz not null default now(),
  answer         text not null
);
alter table public.payment_intent_checks enable row level security;
revoke all on table public.payment_intent_checks from public, anon, authenticated, service_role;
comment on table public.payment_intent_checks is
  'M2-2 (R-F): one row per payment whose PaymentIntent cancel was answered without proof (record_intent_check): first_tried_at, the first such answer (never moves); checked_at and answer, the last one in the drain''s words. A cancel is proven only by the intent read back as canceled (then intent_cancel_at); after 1 day unproven, payment_attention lists cancel_unconfirmed. No client and no service_role grant: written by record_intent_check, read by payment_attention_more.';

-- 2. The drain records an answer that proved nothing.
create or replace function public.record_intent_check(p_payment_id uuid, p_answer text)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if not exists (select 1 from public.intents_to_cancel q where q.id = p_payment_id) then
    return false;
  end if;
  -- The same move to the back as a deferred cancel (R3-A6), not a copy of it.
  if not public.record_intent_cancel(p_payment_id, false) then
    return false;
  end if;
  insert into public.payment_intent_checks as c (payment_id, first_tried_at, checked_at, answer)
  values (p_payment_id, now(), now(), left(coalesce(nullif(btrim(p_answer), ''), 'no answer'), 300))
  on conflict (payment_id) do update
     set checked_at = excluded.checked_at,
         answer     = excluded.answer;
  return true;
end $fn$;
revoke all on function public.record_intent_check(uuid, text) from public, anon, authenticated;
grant execute on function public.record_intent_check(uuid, text) to service_role;
comment on function public.record_intent_check(uuid, text) is
  'M2-2 (R-F), service_role only: process-settlements answered its cancel of this voided row''s PaymentIntent and read the intent back, and neither proved the intent canceled or succeeded. Moves the row to the back of intents_to_cancel (record_intent_cancel(id, false)) and records the answer (payment_intent_checks; the first time is kept). True when recorded; false when intents_to_cancel does not offer the row. Moves no money.';

-- 3. The lines added after M1: timer_late (money_timers, word for word) and the unproven cancel.
create or replace function public.payment_attention_more()
returns table (payment_id uuid, job_id uuid, what text, code text, old text, since timestamptz,
               overdue boolean, cents integer, more text, ref text)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  -- A4-09 (i): a task expected since expected_from that never reported (no good run, no failure).
  select null::uuid, null::uuid, 'system'::text, 'timer_late'::text,
         'task ' || r.name || ': never reported since ' || r.expected_from::text || ' (timer_runs)',
         r.expected_from + r.stale_after, true, null::integer, null::text, 'task:' || r.name
    from public.timer_runs r
   where r.ok_at is null and r.failing_since is null
     and r.expected_from is not null and r.expected_from < now() - r.stale_after
  union all
  -- M2-2 (R-F): a cancel the queue still offers, unproven for more than 1 day since its first
  -- unproven answer.
  select p.id, p.job_id, 'payment'::text, 'cancel_unconfirmed'::text,
         'intent ' || p.provider_ref || ': cancel not proven 1 day after the first answer (' || c.first_tried_at::text
           || '); last answer ' || c.checked_at::text || ': ' || c.answer || ' (payment_intent_checks)',
         c.first_tried_at + interval '1 day', true, p.charge_amount_cents, p.last_error, p.provider_ref
    from public.intents_to_cancel q
    join public.payments p on p.id = q.id
    join public.payment_intent_checks c on c.payment_id = q.id
   where c.first_tried_at < now() - interval '1 day'
$fn$;
revoke all on function public.payment_attention_more() from public, anon, authenticated;
grant execute on function public.payment_attention_more() to service_role;
comment on function public.payment_attention_more() is
  'M2: the payment_attention arms added after attention_plain, in its arm columns (payment_id, job_id, what, code, old, since, overdue, cents, more, ref). M2-1: a task with an expected row that never reported, late after expected_from + stale_after. M2-2: cancel_unconfirmed for a row of intents_to_cancel whose cancel is unproven 1 day after its first unproven answer (payment_intent_checks). service_role only; read by payment_attention.';

-- 4. What "final" means from this file on.
comment on column public.payments.intent_cancel_at is
  'Server only: when process-settlements recorded its cancel of this voided row''s PaymentIntent as final (record_intent_cancel). From intent_reread the drain stamps it only after the intent read back as canceled was applied as a payment_intent.canceled fact; before, a 2xx or a 4xx about the intent was taken as final (payment_attention lists such a row as cancel_unconfirmed when no payment_intent.canceled was applied). Null = not asked yet, or asked without proof.';
comment on function public.record_intent_cancel(uuid, boolean) is
  'service_role only: process-settlements answered its cancel of this voided row''s PaymentIntent. Every call stamps intent_cancel_tried_at (the row goes to the back of intents_to_cancel); p_final true also stamps intent_cancel_at, once. From intent_reread the drain passes p_final true only after the intent read back as canceled was applied as a payment_intent.canceled fact, and records an unproven answer through record_intent_check, which calls this with p_final false. True when the row was stamped, false when it is not a voided stripe row or already has its final answer. Moves no money.';

commit;
