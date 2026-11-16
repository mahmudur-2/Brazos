-- ready_wait — money M2, A5-04 (iv): a transfer or refund that has been ready to send for more than
-- 1 hour, without a break, is listed on the owner's list: no try begun (_not_started), or (A12-03
-- part 1) a try begun with no answer recorded (_no_answer_yet). It only sees.
-- Proof: supabase/tests/489_ready_wait.sql, 497_event_scan_gap.sql, 498_begin_order.sql; tests/settlementRun.test.mjs (process-settlements).
--
-- WHAT WAS WRONG. payment_attention lists a transfer or refund the queue does not offer, and one that
-- was refused or got no answer; a row the queue offers and the drain never starts had no line. The
-- turns between runs (A5-04 ii) turn only the 25 rows a pass reads (A9-03): a row behind them had no
-- bound and no line, and transfers_ready put every row of a higher attempt (a payout due again after a
-- reversal) behind every new row.
--
-- WHAT CHANGES (additive).
-- 1. settlement_ready_since (new table, RLS on, no policy, no grant): one row per payment, kind and
--    attempt that is ready (transfers_ready, refunds_ready), and since when it has been so at every
--    note. A12-03 part 1: also after a try began on that attempt (was: no try begun).
-- 2. note_ready_rows() (new, service_role): process-settlements calls it once a run, before its
--    passes. Two set statements, no loop: rows no longer ready on the same attempt leave the table (a
--    row that leaves the queue and comes back starts a new clock), and ready rows not in it enter with
--    since = now(). It moves no money, and nothing reads the table for a money decision: no queue
--    view, no money function and no pass of the drain reads it; only payment_attention_more does. A
--    failure is the run's error (record_timer_run) and the passes still run.
-- 3. payment_attention_more(): restated from money_not_moving word for word, plus two arms, since =
--    the row's since, after 1 hour, overdue, while it is still ready with the same attempt:
--    transfer_not_started or refund_not_started when no try began on it; A12-03 part 1:
--    transfer_no_answer_yet or refund_no_answer_yet when a try began on it and that side has no saved
--    error (the exact complement of the transfer and refund arms of payment_attention, money_timers,
--    which list a ready row only with its side's own error). So a ready row first seen more than an
--    hour ago always has one line of its side: at the begin its code changes and its since stays; a
--    closed attempt (the 23-hour stop) leaves the queue and is listed by those arms (_no_answer).
-- 4. payment_attention_codes(): restated from money_not_moving word for word, plus the four sentences.
-- The view (money_timers) is not restated: it reads both functions.
-- 5. A9-03 (c): transfers_ready, restated from settlement_guards word for word but its order: the row
--    whose last change is oldest first in the queue's order (order by updated_at, the order
--    refunds_ready already has); inside one fetched batch the drain's turn rotates (rowOrder), so the
--    tries are not strictly oldest first.
--    No column holds the last try alone; every begun try moves updated_at (settlement_send_begin,
--    item 7), and so does every write-back (record_settlement_result, refusal_limit;
--    record_settlement_sent takes the row out of the queue), so a row just tried goes to the back. Was transfer_attempts, then release_requested_at.
-- 6. A9-02: a time the event scan could not read stays on the owner's list until a developer clears
--    it. event_scan_coverage (one row): covered_to, the end of the time earlier scans covered.
--    record_event_scan (service_role; process-settlements calls it after a scan whose every listed
--    event of its version was stored): the gap runs from covered_to to the oldest event time this
--    scan reached back to; an overflow that reaches back into covered time is no gap. The very first
--    scan (no covered_to) counts from the start of its own window: one that read its whole window
--    gives no line; one that was cut (the page limit or the run stopped it) records the part of its
--    own window that it did not read, from the window's start to the oldest event it read. Then
--    covered_to = now() - 1 minute
--    (the list was read in this run, at most a minute ago). event_scan_gaps: one row per gap; no later
--    scan removes it; clear_event_scan_gap(id, note) does, after the developer compared Stripe's events
--    of that time with payment_events. payment_attention_more lists each gap not cleared
--    (event_scan_gap).
-- 7. A9-03 (c): settlement_send_begin, restated from transfer_in_flight (its section 5) word for word
--    plus one statement: every begin that returns true sets updated_at = now() on its row, both kinds,
--    so a try that never writes back (the run died, or its write-back failed or did not fit) also puts
--    its row behind the rows that waited longer. Same signature, return values, security definer,
--    search_path, revoke and grant; the old drain makes the same call and gets the same answer. No
--    trigger acts on it (payments_notify_release acts only when status turns released;
--    payments_enqueue_receipts fires on status only). It starts no clock: the 23-hour stop reads
--    transfer_sent_at and refund_sent_at (set on an attempt's first begin only), the 3-day refusal
--    limit settlement_refusals.first_refused_at, the 1-hour line settlement_ready_since. What it
--    moves: the since of refund_retrying (money_timers: updated_at) and with it that line's 3-day
--    overdue, as every landed write-back already does; a try with no write-back keeps its attempt, and
--    that attempt's 23-hour stop lists refund_no_answer, overdue, at most 23 hours after its first
--    begin.
-- 8. A12-03 part 2: record_settlement_sent, restated from settlement_guards (its only definition,
--    20261112010300_settlement_guards.sql:193-228) word for word plus one assignment: its refund
--    branch also sets refund_sent_at = coalesce(refund_sent_at, now()) with refund_ref. refund_unconfirmed
--    (money_timers) ages from coalesce(refund_sent_at, updated_at); a refund a person recorded by hand
--    had no refund_sent_at, so a begin of the payout (item 7) or any other change of the row moved its
--    confirmation clock. The drain's write-back is unchanged (its begin set refund_sent_at). Every other
--    reader of refund_sent_at needs refund_ref null (refunds_due, the refund arm of payment_attention,
--    settlement_send_begin) or refund_sent_attempt = refund_attempts, which this does not set
--    (settlement_attempt_closed); the stop of record_settlement_result (refusal_limit) writes it on an
--    attempt with no begin and keeps it otherwise; clients never see it. After a
--    reopen, an older attempt's refund_sent_at is kept: the line is overdue sooner, never hidden.
--    KNOWN LIMIT: no backfill. A refund a person recorded by hand before this migration keeps
--    refund_sent_at null, so its line still ages from updated_at, which later changes of the row move.
-- 9. A12-01, A13-01: payment_attention_more gets one arm more, refund_after_dispute_lost (finish
--    stripe) or refund_after_dispute_pending (finish bank), and payment_attention_codes their
--    sentences. A lost card dispute marks the payment refunded with no amount compared
--    (20261115000600_refund_failed_and_event_order.sql:258-259), so a refund asked that had not fully
--    gone through had no line and no queue (the refund arm, refund_unconfirmed and refunds_due all
--    leave a refunded payment out). The arm lists a stripe payment marked refunded with a lost dispute
--    while refunded_cents + the lost disputes' amount is less than refund_cents, and no refund failure
--    is recorded (those have their own lines). The lost amount is counted by itself, not
--    chargeback_cents (which also counts the open disputes, E:333-337), so a dispute the bank has not
--    decided, or whose result the app cannot tell, never ends the line or lowers its amount; while one
--    exists the code is refund_after_dispute_pending: wait for the bank, nothing by hand. A hand refund
--    of the rest (charge.refunded raises refunded_cents) ends it; a dispute lost for the whole charge
--    never shows it. No change to apply_payment_event, the queues or payment_refund_owed. A payout
--    asked on the same payment keeps its own line (card_dispute_lost).
--    KNOWN LIMIT (A13-02): a payment with a recorded refund failure gets no line here, also after the
--    failure was arranged, though part of the refund asked can still be owed; the amount of an
--    arrangement is not recorded.
--
-- LIMIT. The clock is read only when the drain notes it (each run, every few minutes): a row that
-- leaves the queue and comes back between two notes is not seen leaving, and a row that flaps (leaves
-- and comes back across notes, again and again) starts a new clock each time, so it can hide a long
-- wait.
--
-- Additive under scripts/staging-scan.sh.

begin;

-- 1. The ready rows and since when.
create table if not exists public.settlement_ready_since (
  payment_id uuid not null references public.payments (id) on delete cascade,
  kind       text not null check (kind in ('transfer', 'refund')),
  attempt    integer not null,
  since      timestamptz not null,
  primary key (payment_id, kind, attempt)
);
alter table public.settlement_ready_since enable row level security;
revoke all on table public.settlement_ready_since from public, anon, authenticated, service_role;
comment on table public.settlement_ready_since is
  'A5-04 (iv): one row per payment, kind (transfer, refund) and attempt that the queue offers (transfers_ready, refunds_ready), also after a try began on that attempt (A12-03 part 1); since: the first note of an unbroken run of notes (note_ready_rows, each process-settlements run). It only sees: read by payment_attention_more alone, never for a money decision. No client and no service_role grant.';

-- 2. The note, once a drain run.
create or replace function public.note_ready_rows()
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_n integer;
begin
  -- A12-03 part 1: a row whose try began stays while it is ready on the same attempt (was: it left at
  -- its begin), so its line changes code at the begin and keeps its since.
  delete from public.settlement_ready_since s
   where not exists (
           select 1 from public.transfers_ready r
            where s.kind = 'transfer' and r.id = s.payment_id and r.transfer_attempts = s.attempt)
     and not exists (
           select 1 from public.refunds_ready r
            where s.kind = 'refund' and r.id = s.payment_id and r.refund_attempts = s.attempt);
  insert into public.settlement_ready_since (payment_id, kind, attempt, since)
  select t.id, 'transfer', t.transfer_attempts, now()
    from public.transfers_ready t
  union all
  select r.id, 'refund', r.refund_attempts, now()
    from public.refunds_ready r
  on conflict (payment_id, kind, attempt) do nothing;
  select count(*)::integer into v_n from public.settlement_ready_since;
  return v_n;
end $fn$;
revoke all on function public.note_ready_rows() from public, anon, authenticated;
grant execute on function public.note_ready_rows() to service_role;
comment on function public.note_ready_rows() is
  'A5-04 (iv), service_role only: process-settlements calls it once a run, before its passes. Keeps settlement_ready_since: the rows no longer offered by transfers_ready or refunds_ready, or whose attempt changed, leave; the offered rows not in it enter with since = now(); a row whose try began stays (A12-03 part 1). Returns how many rows it holds. Moves no money; nothing reads the table for a money decision.';

-- 2b. A9-03 (c): the transfer queue, oldest last change first in the queue's order (inside one
--     fetched batch the drain's turn rotates). Its comment stays.
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
   order by t.updated_at;
revoke all on table public.transfers_ready from public, anon, authenticated;
grant select on table public.transfers_ready to service_role;

-- 2c. A9-02: the event scan's coverage and its gaps. RLS on, no policy, no grant.
create table if not exists public.event_scan_coverage (
  only_row   boolean primary key default true check (only_row),
  covered_to timestamptz not null
);
alter table public.event_scan_coverage enable row level security;
revoke all on table public.event_scan_coverage from public, anon, authenticated, service_role;
comment on table public.event_scan_coverage is
  'A9-02: one row: covered_to, the end of the time the event scans of process-settlements covered (record_event_scan). No client and no service_role grant.';

create table if not exists public.event_scan_gaps (
  id           bigint generated always as identity primary key,
  missing_from timestamptz not null,
  missing_to   timestamptz not null,
  found_at     timestamptz not null default now(),
  cleared_at   timestamptz,
  cleared_note text
);
alter table public.event_scan_gaps enable row level security;
revoke all on table public.event_scan_gaps from public, anon, authenticated, service_role;
comment on table public.event_scan_gaps is
  'A9-02: one row per time the event scan could not read (record_event_scan): Stripe events from missing_from to missing_to may not have reached the app. Listed (event_scan_gap) until clear_event_scan_gap records cleared_at and the note; no scan removes a row. No client and no service_role grant.';

create or replace function public.record_event_scan(p_window_from bigint, p_read_from bigint)
returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_last timestamptz;
  v_from timestamptz;
  v_to   timestamptz := to_timestamp(p_read_from);
begin
  select c.covered_to into v_last from public.event_scan_coverage c for update;
  v_from := coalesce(v_last, to_timestamp(p_window_from));
  insert into public.event_scan_coverage as c (only_row, covered_to) values (true, now() - interval '1 minute')
  on conflict (only_row) do update set covered_to = greatest(c.covered_to, excluded.covered_to);
  if v_to is null or v_from is null or v_to <= v_from then
    return false;
  end if;
  insert into public.event_scan_gaps (missing_from, missing_to) values (v_from, v_to);
  return true;
end $fn$;
revoke all on function public.record_event_scan(bigint, bigint) from public, anon, authenticated;
grant execute on function public.record_event_scan(bigint, bigint) to service_role;
comment on function public.record_event_scan(bigint, bigint) is
  'A9-02, service_role only: process-settlements reports what one event scan read. p_window_from: the start of its window (Stripe event time, seconds; null when the list was empty); p_read_from: the oldest event time it reached back to (the window start when it read the whole window; the oldest event read when its page limit or the run stopped it; null when it read every listed event). A gap from the end of the time earlier scans covered (event_scan_coverage; the very first scan: its window start) to p_read_from is recorded in event_scan_gaps (true); covered_to becomes now() - 1 minute. Moves no money.';

create or replace function public.clear_event_scan_gap(p_id bigint, p_note text)
returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_note text := left(nullif(btrim(p_note), ''), 500);
begin
  if v_note is null then
    raise exception 'Say what the comparison with Stripe found';
  end if;
  update public.event_scan_gaps set cleared_at = now(), cleared_note = v_note
   where id = p_id and cleared_at is null;
  return found;
end $fn$;
revoke all on function public.clear_event_scan_gap(bigint, text) from public, anon, authenticated;
grant execute on function public.clear_event_scan_gap(bigint, text) to service_role;
comment on function public.clear_event_scan_gap(bigint, text) is
  'A9-02, service_role only: a developer who compared Stripe''s events of a gap''s time with payment_events (and applied what was missing) clears its line, with a note of what was found. false when the gap is unknown or already cleared. Moves no money.';

-- 2d. A9-03 (c): settlement_send_begin, from transfer_in_flight (its section 5) word for word plus one
--     statement: every begin that returns true sets updated_at = now(), both kinds. Same signature,
--     return values, security definer, search_path, revoke and grant; the old drain makes the same
--     call and gets the same answer. THE BOUND: it moves the since of refund_retrying (money_timers,
--     the refund arm: updated_at) and with it that line's 3-day overdue, as every landed write-back
--     already does; the line stays, with its code. A try with no write-back keeps its attempt, so
--     that attempt's 23-hour stop (refund_sent_at, set on its first begin only) lists refund_no_answer,
--     overdue, at most 23 hours after that first begin: the overdue flag can read false for at most
--     23 hours more than before. Nothing else reads payments.updated_at for whether a line shows, a
--     wait or a stop (the transfer arm, the 23-hour stop, the 3-day refusal limit, the 1-hour line).
create or replace function public.settlement_send_begin(p_payment_id uuid, p_kind text, p_attempt integer, p_amount_cents integer)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_pay public.payments;
begin
  if p_kind is distinct from 'transfer' and p_kind is distinct from 'refund' then
    raise exception 'settlement_send_begin: unknown kind %; transfer or refund only', coalesce(p_kind, '<null>');
  end if;
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then return false; end if;

  if p_kind = 'transfer' then
    if p_attempt is distinct from v_pay.transfer_attempts then return false; end if;
    if p_amount_cents is distinct from v_pay.transfer_cents then return false; end if;
    if not exists (select 1 from public.transfers_ready r where r.id = p_payment_id) then return false; end if;
    if v_pay.transfer_sent_attempt is distinct from v_pay.transfer_attempts then
      update public.payments
         set transfer_sent_attempt = transfer_attempts, transfer_sent_at = now()
       where id = p_payment_id;
    end if;
  else
    if p_attempt is distinct from v_pay.refund_attempts then return false; end if;
    if p_amount_cents is distinct from v_pay.refund_cents then return false; end if;
    if not exists (select 1 from public.refunds_ready r where r.id = p_payment_id) then return false; end if;
    if v_pay.refund_sent_attempt is distinct from v_pay.refund_attempts then
      update public.payments
         set refund_sent_attempt = refund_attempts, refund_sent_at = now()
       where id = p_payment_id;
    end if;
  end if;
  -- A9-03 (c): every begun try puts its row behind the rows that waited longer (the queues are
  -- oldest last change first in their order; inside one fetched batch the drain's turn rotates),
  -- also a try that never writes back.
  update public.payments set updated_at = now() where id = p_payment_id;
  return true;
end $fn$;
revoke all on function public.settlement_send_begin(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.settlement_send_begin(uuid, text, integer, integer) to service_role;
comment on function public.settlement_send_begin(uuid, text, integer, integer) is
  'service_role only, step 1 of process-settlements per row: true when the row is still in transfers_ready / refunds_ready for exactly this attempt and p_amount_cents is the row''s transfer_cents (refund_cents) under the lock (R5-A1); on the attempt''s first use it records transfer_sent_attempt/at (refund_sent_attempt/at), which starts its 23-hour clock. false = do not send. Moves no money. A9-03 (c) (ready_wait): every begin that returns true also sets updated_at = now(), so the row goes behind the rows that waited longer in transfers_ready and refunds_ready, also when its try never writes back.';

-- 2e. A12-03 part 2: record_settlement_sent, from settlement_guards (its only definition) word for
--     word plus one assignment: the refund branch also sets refund_sent_at = coalesce(refund_sent_at,
--     now()). Same signature, return values, security definer, search_path, revoke and grant.
create or replace function public.record_settlement_sent(p_payment_id uuid, p_kind text, p_ref text, p_amount_cents integer)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_pay public.payments;
begin
  if p_kind is distinct from 'transfer' and p_kind is distinct from 'refund' then
    raise exception 'record_settlement_sent: unknown kind %; transfer or refund only', coalesce(p_kind, '<null>');
  end if;
  if p_ref is null or btrim(p_ref) = '' then raise exception 'record_settlement_sent: the provider id is required'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'record_settlement_sent: the amount must be a positive number of cents';
  end if;
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found or v_pay.provider <> 'stripe' then raise exception 'Payment not found'; end if;

  if p_kind = 'transfer' then
    if p_ref not like 'tr\_%' then raise exception 'A transfer id starts with tr_'; end if;
    if v_pay.release_requested_at is null or coalesce(v_pay.transfer_cents, 0) <= 0 then
      raise exception 'This payment never asked for a transfer';
    end if;
    return public.payment_record_transfer(p_payment_id, p_ref, p_amount_cents);
  end if;

  if p_ref not like 're\_%' and p_ref not like 'pyr\_%' then raise exception 'A refund id starts with re_'; end if;
  if coalesce(v_pay.refund_cents, 0) <= 0 then raise exception 'This payment never asked for a refund'; end if;
  if p_amount_cents > v_pay.charge_amount_cents then raise exception 'A refund cannot be larger than the charge'; end if;
  if v_pay.refund_ref = p_ref then return false; end if;
  if v_pay.refund_ref is not null then raise exception 'A different refund is already recorded for this payment'; end if;
  -- A12-03 part 2: a refund recorded by hand gets its own confirmation clock (refund_unconfirmed
  -- reads coalesce(refund_sent_at, updated_at)); the drain's write-back keeps the one its begin set.
  update public.payments set refund_ref = p_ref, refund_sent_at = coalesce(refund_sent_at, now()), updated_at = now()
   where id = p_payment_id;
  return true;
end $fn$;
revoke all on function public.record_settlement_sent(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.record_settlement_sent(uuid, text, text, integer) to service_role;
comment on function public.record_settlement_sent(uuid, text, text, integer) is
  'service_role only. Records that the provider made this transfer (tr_...) or refund (re_...) for the payment: the drain''s write-back of a 2xx, and the owner''s answer "the transfer exists" after a look in Stripe. A transfer goes through payment_record_transfer (recorded once; held -> released when nothing is being refunded); a refund sets refund_ref (charge.refunded still settles the status). Returns true when newly recorded, false when already recorded. Refuses a payment that never asked for that kind, an id of the wrong shape, an id recorded on another payment, and a refund when a different one is recorded. Moves no money. A12-03 part 2 (ready_wait): a refund also sets refund_sent_at when it is null, so the confirmation clock of a refund recorded by hand does not move with later changes of the row.';
-- A13-03: refund_sent_at has two writers now (money_facts wrote the first text).
comment on column public.payments.refund_sent_at is
  'B16: when the key of the refund attempt in refund_sent_attempt was first used (settlement_send_begin); that attempt closes 23 hours later, as transfer_sent_at. A12-03 part 2: when no attempt began, the time a refund was recorded by hand (record_settlement_sent sets it only when it is null).';

-- 3. The lines added after attention_plain, plus the ready wait.
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
  union all
  -- A5 point 12 (money_not_moving), A9 PART 2 b: a held job payment that the automatic approval must
  -- pay (the lifecycle's own eligibility: auto_approval_deadline is not null) and did not, more than
  -- 169 hours after the job's completion (it pays at the latest 168 hours after completion; 1 hour
  -- more for its 10-minute timer). Its own deadline: completed_at + 169 hours.
  select p.id, p.job_id, 'payment'::text, 'money_not_moving'::text,
         'job completed ' || j.completed_at::text
           || ': payment still held and no release asked 169 hours later (the automatic approval pays by 168 hours)',
         j.completed_at + interval '169 hours', true, p.charge_amount_cents, p.last_error, p.id::text
    from public.payments p
    join public.jobs j on j.id = p.job_id
   where p.kind = 'job_payment' and p.status = 'held'
     and j.completed_at < now() - interval '169 hours'
     and public.auto_approval_deadline(j.id) is not null
  union all
  -- A9 PART 2 b (2), payout_not_automatic: the rows money_not_moving leaves out because the automatic
  -- approval refuses them (auto_approval_deadline is null) while no other line explains the hold: a
  -- held stripe job payment, completed more than 169 hours ago, nothing asked, no card dispute, no
  -- reversal park, no open issue report. With these exclusions the one clause of
  -- auto_approval_deadline left (20261116200000_release_clock.sql:149) is the reservation: a recorded
  -- refund failure, arranged or not, reserves the whole charge (payment_refund_reserved_cents), so the
  -- payout never fits. Since: the completion time.
  select p.id, p.job_id, 'payment'::text, 'payout_not_automatic'::text,
         'job completed ' || j.completed_at::text
           || ': payment still held and no release asked 169 hours later; the automatic approval does not ask for it ('
           || case when exists (select 1 from public.payment_refund_failures f where f.payment_id = p.id)
                   then 'a refund of this charge failed before: payment_refund_reserved_cents reserves the whole charge'
                   else 'auto_approval_deadline is null' end || ')',
         j.completed_at, true, p.charge_amount_cents, p.last_error, p.id::text
    from public.payments p
    join public.jobs j on j.id = p.job_id
   where p.provider = 'stripe' and p.kind = 'job_payment' and p.status = 'held'
     and j.status = 'completed'
     and j.completed_at < now() - interval '169 hours'
     and p.release_requested_at is null and coalesce(p.refund_cents, 0) = 0
     and p.chargeback_at is null and p.transfer_reversed_at is null
     and not exists (select 1 from public.job_disputes d where d.job_id = j.id and d.status = 'open')
     and public.auto_approval_deadline(j.id) is null
  union all
  -- A5-04 (iv): a transfer or refund that has been ready to send for more than 1 hour without a break,
  -- with no try begun on its attempt (settlement_ready_since, which note_ready_rows keeps each drain
  -- run). Listed only while it is still so now: ready, the same attempt, no try begun.
  select s.payment_id, p.job_id, s.kind, s.kind || '_not_started',
         s.kind || ' attempt ' || s.attempt::text || ' ready since ' || s.since::text
           || ' and no try begun (settlement_ready_since, note_ready_rows)',
         s.since, true,
         case s.kind when 'transfer' then p.transfer_cents else p.refund_cents end,
         p.last_error, p.id::text
    from public.settlement_ready_since s
    join public.payments p on p.id = s.payment_id
   where s.since < now() - interval '1 hour'
     and ((s.kind = 'transfer' and s.attempt = p.transfer_attempts
           and p.transfer_sent_attempt is distinct from p.transfer_attempts
           and exists (select 1 from public.transfers_ready r where r.id = p.id))
       or (s.kind = 'refund' and s.attempt = p.refund_attempts
           and p.refund_sent_attempt is distinct from p.refund_attempts
           and exists (select 1 from public.refunds_ready r where r.id = p.id)))
  union all
  -- A12-03 part 1: the same rows once a try began on their attempt, while that side has no saved error
  -- (the exact complement of the transfer arm's and the refund arm's ready rows, money_timers: those
  -- list a ready row only with its side's own error, never 'reopened'). Since: the row's first note,
  -- which the begin does not move; after the same 1 hour. A closed attempt is not ready (the queues
  -- leave it out), so the 23-hour stop lists it there instead.
  select s.payment_id, p.job_id, s.kind, s.kind || '_no_answer_yet',
         s.kind || ' attempt ' || s.attempt::text || ' ready since ' || s.since::text || ', its try begun at '
           || coalesce((case s.kind when 'transfer' then p.transfer_sent_at else p.refund_sent_at end)::text, 'an unknown time')
           || ', and no answer recorded (settlement_ready_since, note_ready_rows)',
         s.since, true,
         case s.kind when 'transfer' then p.transfer_cents else p.refund_cents end,
         p.last_error, p.id::text
    from public.settlement_ready_since s
    join public.payments p on p.id = s.payment_id
   where s.since < now() - interval '1 hour'
     and ((s.kind = 'transfer' and s.attempt = p.transfer_attempts
           and p.transfer_sent_attempt = p.transfer_attempts
           and not coalesce(p.last_error like 'transfer: %' and p.last_error not like 'transfer: reopened %', false)
           and exists (select 1 from public.transfers_ready r where r.id = p.id))
       or (s.kind = 'refund' and s.attempt = p.refund_attempts
           and p.refund_sent_attempt = p.refund_attempts
           and not coalesce(p.last_error like 'refund: %' and p.last_error not like 'refund: reopened %', false)
           and exists (select 1 from public.refunds_ready r where r.id = p.id)))
  union all
  -- A12-01: a refund asked that had not fully gone through when a card dispute for part of the charge
  -- was lost: apply_payment_event marks the payment refunded (20261115000600, its :258-259), so no
  -- other refund line and no queue holds it. A13-01: the lost disputes are counted by themselves
  -- (v.lost; each amount as chargeback_cents counts it, E:333-337: coalesce(amount_cents, the
  -- charge)); the others chargeback_cents counts (open, or closed with no known result: not a
  -- warning, not won, not lost) are v.undecided. Listed while what Stripe recorded as refunded plus
  -- the lost amount is less than the refund asked; an undecided dispute never ends the line and never
  -- lowers its amount, it only makes the code refund_after_dispute_pending (the bank first). A hand
  -- refund of the rest (charge.refunded) ends it, and a dispute lost for the whole charge never shows
  -- it. A recorded refund failure has its own lines (refund_failed_dispute_lost while it is not
  -- arranged), so none here. cents: the refund asked less those two. Since: the first lost dispute's
  -- close, for both codes.
  select p.id, p.job_id, 'refund'::text,
         case when v.undecided > 0 then 'refund_after_dispute_pending' else 'refund_after_dispute_lost' end,
         'refund asked ' || p.refund_cents::text || ', refunded in Stripe ' || coalesce(p.refunded_cents, 0)::text
           || ', card disputes lost ' || v.lost::text
           || case when v.undecided > 0
                   then ', other card disputes with no known result ' || v.undecided::text
                        || ': the payment is refunded and the app sends nothing more; wait for the bank before any refund by hand'
                   else ': the payment is refunded and the app sends nothing more; refund the rest by hand in Stripe after checking what the customer got back' end,
         (select min(d.closed_at) from public.payment_disputes d where d.payment_id = p.id and d.status = 'lost'),
         true,
         p.refund_cents - coalesce(p.refunded_cents, 0) - v.lost,
         p.last_error, p.id::text
    from public.payments p
    cross join lateral (
      select coalesce(sum(coalesce(d.amount_cents, p.charge_amount_cents)) filter (where d.status = 'lost'), 0)::integer as lost,
             coalesce(sum(coalesce(d.amount_cents, p.charge_amount_cents))
                        filter (where d.status not like 'warning\_%' and d.status not in ('won', 'lost')), 0)::integer as undecided
        from public.payment_disputes d where d.payment_id = p.id) v
   where p.provider = 'stripe' and p.status = 'refunded'
     and coalesce(p.refund_cents, 0) > 0
     and coalesce(p.refunded_cents, 0) + v.lost < p.refund_cents
     and exists (select 1 from public.payment_disputes d where d.payment_id = p.id and d.status = 'lost')
     and not exists (select 1 from public.payment_refund_failures f where f.payment_id = p.id)
  union all
  -- A9-02: a time the event scan could not read, until a developer clears it (clear_event_scan_gap).
  select null::uuid, null::uuid, 'system'::text, 'event_scan_gap'::text,
         'Stripe events from ' || g.missing_from::text || ' to ' || g.missing_to::text
           || ' were not all read by the event scan: compare Stripe''s events of that time with payment_events, apply what is missing, then clear_event_scan_gap('
           || g.id::text || ', ''<what you found>'')',
         g.missing_from, true, null::integer, null::text, 'event_gap:' || g.id::text
    from public.event_scan_gaps g
   where g.cleared_at is null
$fn$;
revoke all on function public.payment_attention_more() from public, anon, authenticated;
grant execute on function public.payment_attention_more() to service_role;
comment on function public.payment_attention_more() is
  'M2: the payment_attention arms added after attention_plain, in its arm columns (payment_id, job_id, what, code, old, since, overdue, cents, more, ref). M2-1: a task with an expected row that never reported, late after expected_from + stale_after. M2-2: cancel_unconfirmed for a row of intents_to_cancel whose cancel is unproven 1 day after its first unproven answer (payment_intent_checks). A5 point 12 (money_not_moving), A9 PART 2 b: a held job payment that the automatic approval must pay (auto_approval_deadline is not null) on a job completed more than 169 hours ago, since completed_at + 169 hours. A9 PART 2 b (2): payout_not_automatic, a held stripe job payment completed more than 169 hours ago with nothing asked, no card dispute, no reversal park and no open issue report that the approval refuses (auto_approval_deadline is null: today only a recorded refund failure), since completed_at. A5-04 (iv): transfer_not_started and refund_not_started, a row ready for more than 1 hour without a break and no try begun on its attempt (settlement_ready_since), while it is still so. A12-01, A13-01: refund_after_dispute_lost, a stripe payment marked refunded after a lost card dispute while what Stripe recorded as refunded plus the lost disputes'' amount is less than the refund asked, with no recorded refund failure; refund_after_dispute_pending instead while another dispute counted in chargeback_cents is not lost (open, or no known result); since the first lost dispute''s close. A12-03 part 1: transfer_no_answer_yet and refund_no_answer_yet, the same ready rows once a try began on their attempt while that side has no saved error (the complement of the ready rows the transfer and refund arms list), since the row''s first note. service_role only; read by payment_attention.';

-- 4. The code map, plus the two sentences.
create or replace function public.payment_attention_codes()
returns table (code text, reason text, finish text)
language sql immutable
set search_path = public, pg_temp
as $fn$
  values
    ('transfer_reversed',          'The worker''s payout was taken back in Stripe. Decide who gets this money.', 'app'),
    -- M1b (A4-07): under an open card dispute the worker's side is refused (resolve_job_dispute,
    -- resolve_tip) and no refund is sent (refunds_due needs no card dispute), so the bank decides first.
    ('transfer_reversed_disputed', 'The worker''s payout was taken back in Stripe, and the customer also disputed the card charge with their bank. Paying the worker again is refused while the dispute is open, and no refund is sent either. Answer the dispute in Stripe and wait for the bank to decide.', 'bank'),
    ('transfer_stopped',          'Sending the worker''s payout stopped after Stripe said no.', 'developer'),
    ('transfer_no_answer',         'Stripe has not confirmed the worker''s payout for a day.', 'developer'),
    ('transfer_card_dispute',      'The customer disputed the card charge. The payout waits for the bank.', 'bank'),
    ('transfer_issue_open',        'An issue report is open. The payout waits for your decision.', 'app'),
    ('transfer_already_recorded',  'A payout is already recorded for this payment. Ask your developer.', 'developer'),
    -- M1b (A4-07): the predicate proves only that the app will not send it; any refund failure ever
    -- recorded reserves the whole charge, so "what is left" is not known.
    ('transfer_more_than_left',    'The app will not send this payout by itself, because refunds on this payment, or a refund that failed, may leave less than the payout. The app cannot tell the exact amount left. Ask your developer.', 'developer'),
    ('transfer_payee_gone',        'The worker''s account was suspended or deleted, so this payout cannot be sent. Ask your developer.', 'developer'),
    -- M1b (A4 tip history): resolve_tip(id, 'refund') works for a held tip that was never sent.
    ('tip_payee_gone',             'The worker''s account was suspended or deleted, so this tip cannot be sent. You can refund the tip to the customer here.', 'app'),
    ('transfer_payout_review',     'Stripe has not cleared the worker''s payout account yet, so the payout waits. Stripe can also refuse an account; your developer can check which.', 'developer'),
    ('transfer_no_payout_account', 'The worker has not finished setting up payouts. The money waits for them.', 'worker'),
    -- M2-3 (R-E): a refusal that repeats for 3 days now stops the payout (then transfer_stopped).
    ('transfer_balance_low',       'Stripe last refused this worker''s payout because your Stripe balance was too low. The app keeps trying, and stops if Stripe still says no after 3 days. Add money to your Stripe balance.', 'stripe'),
    -- M1b (A4-07): a timeout is not a refusal; the line covers both and reads only a transfer error.
    -- M1c (A5-06): a timeout can follow a send Stripe accepted, so the line never says it did not go through.
    ('transfer_retrying',          'The app has no answer from Stripe that the worker''s payout went through. Stripe refused the last try, or the app got no answer it could read, so the money may or may not have moved. The app keeps trying by itself. Ask your developer if this stays.', 'developer'),
    -- A5-04 (iv): ready for 1 hour and never started; the drain may be stuck on other rows or not running.
    ('transfer_not_started',       'The worker''s payout was first seen ready to send more than an hour ago, and its next try has not started. Ask your developer.', 'developer'),
    -- A12-03 part 1: a try began and no answer was recorded (the send is in flight, or its
    -- write-back was lost); the same key is sent again each run until the 23-hour stop.
    ('transfer_no_answer_yet',     'The worker''s payout was first seen ready to send more than an hour ago. A try has started, and the app has not recorded an answer for it yet. The app keeps trying by itself. Ask your developer if this stays.', 'developer'),
    ('transfer_partly_reversed',   'Part of the worker''s payout was taken back. Ask your developer.', 'developer'),
    ('refund_stopped',             'Sending the customer''s refund stopped after Stripe said no.', 'developer'),
    ('refund_no_answer',           'Stripe has not confirmed the customer''s refund for a day.', 'developer'),
    ('refund_card_dispute',        'The customer disputed the card charge. The refund waits for the bank.', 'bank'),
    ('refund_partly_landed',       'Part of this charge was already refunded in Stripe. Finish the refund in Stripe.', 'stripe'),
    ('refund_more_than_left',      'The refund is bigger than what is left after the payout. Ask your developer.', 'developer'),
    -- M1c (A5-06, A4-05): the amount shown is the refund asked, not what is still owed after a
    -- failed refund that was arranged another way.
    ('refund_failed_before',       'A refund on this charge failed before, so the app does not send this refund by itself. The amount shown is the refund asked, not always what the customer is still owed. Check in Stripe, and in how the failed refund was arranged, what is still owed, and refund only that by hand in Stripe.', 'stripe'),
    ('refund_no_intent',           'There is no Stripe payment to refund. Ask your developer.', 'developer'),
    ('refund_retrying',            'The app has no answer from Stripe that the customer''s refund went through. Stripe refused the last try, or the app got no answer it could read, so the money may or may not have moved. The app keeps trying by itself. Ask your developer if this stays.', 'developer'),
    ('refund_not_started',         'The customer''s refund was first seen ready to send more than an hour ago, and its next try has not started. Ask your developer.', 'developer'),
    ('refund_no_answer_yet',       'The customer''s refund was first seen ready to send more than an hour ago. A try has started, and the app has not recorded an answer for it yet. The app keeps trying by itself. Ask your developer if this stays.', 'developer'),
    ('refund_unconfirmed',         'A refund was sent. Stripe has not confirmed it yet. If this stays for a day, ask your developer.', 'developer'),
    -- M1b (A4-03): a failed amount is never shown as a debt. Marking it done is
    -- resolve_refund_failure(payment, note): it records how it was settled and moves no money, so it
    -- also records a refund that was already settled another way.
    ('refund_failed',              'Stripe could not return money to the customer''s card. The amount shown is what that refund tried to return, not always what the customer is still owed. Before you pay anything, check in Stripe for a later refund of this payment that went through, a card dispute, or a payment you already made to the customer. Pay only what is still owed, another way. Then mark it done here, also when nothing more was owed.', 'app'),
    -- A2-04: two or more failures on one payment. A later refund can be a new try for the same
    -- money (the app's refund failed, then one by hand), so the sum is not always what is owed.
    -- M1b (A4-03): the amount shown is the sum capped at the charge, and the sentence says so.
    ('refund_failed_several',      'Stripe could not return money to the customer''s card, more than once. The amount shown adds up the failed refunds, but never more than the charge, and a later failure can be a new try for the same money, so it is not what the customer is still owed. Before you pay anything, check in Stripe for a refund of this payment that went through, a card dispute, or a payment you already made to the customer. Pay only what is still owed, another way. Then mark it done here, also when nothing more was owed.', 'app'),
    -- M1b: the bank may return the money to the customer, so nothing is paid before it decides.
    -- M1c (A5-06): only while a card dispute is open.
    ('refund_failed_disputed',    'Stripe could not return money to the customer''s card, and the customer also disputed the charge with their bank. Do not pay the customer another way while the dispute is open: the bank may return the money to them. Answer the dispute in Stripe first.', 'bank'),
    -- M1c (A5-06): the card dispute is closed and lost: the bank already returned the disputed amount.
    ('refund_failed_dispute_lost', 'Stripe could not return money to the customer''s card, and the customer won a card dispute with their bank, so the bank already gave the customer the disputed amount from your Stripe balance. The failed refund is not a debt for the money the bank returned, so do not pay that again. Ask your developer what, if anything, is still owed.', 'developer'),
    -- M1c (A5-06): the card dispute is closed, neither won nor lost: the app cannot tell the outcome.
    ('refund_failed_dispute_unclear', 'Stripe could not return money to the customer''s card, and the customer''s card dispute with their bank is closed, but the app cannot tell who kept the money. Do not pay the customer another way before your developer checks it. Ask your developer.', 'developer'),
    -- A12-01: the amount shown is the refund asked less what Stripe recorded as refunded and the
    -- disputed amount; the owner checks in Stripe first.
    ('refund_after_dispute_lost',  'The customer won a card dispute with their bank for part of this charge, and the refund the app asked for had not fully gone through. The app no longer sends that refund. Check in Stripe what the customer got back, and refund only the rest by hand there.', 'stripe'),
    -- A13-01: the same, while another dispute of the charge has no known result: nothing by hand yet.
    ('refund_after_dispute_pending', 'The customer won a card dispute with their bank for part of this charge, and the refund the app asked for had not fully gone through. The app no longer sends that refund. The bank has not decided another dispute for this charge, or the app cannot tell its result. Do not refund by hand yet. Answer the open dispute in Stripe and wait for the bank. If Stripe shows no open dispute, ask your developer.', 'bank'),
    ('amount_differs',             'Stripe charged a different amount than the app expected. Ask your developer.', 'developer'),
    ('status_unusual',             'This payment is in an unusual state. Ask your developer.', 'developer'),
    -- M1b (A4-05): after a failed refund the refunded total never goes down, so this can be a
    -- counting error and not a loss (finding 2, M3).
    ('money_short',                'The app counts more money out of Stripe than this job brought in. It can be a real loss, for example a card dispute lost after the worker was paid, or a counting error after a refund failed. Ask your developer before you try to get money back.', 'developer'),
    ('card_dispute_open',          'The customer disputed the card charge with their bank. Answer it in Stripe.', 'bank'),
    ('card_dispute_unclear',       'The bank closed the customer''s card dispute, but the app cannot tell who kept the money. Ask your developer.', 'developer'),
    -- M1b (A4-07): a lost dispute is a known outcome; the payout asked for is not sent (the payment
    -- is refunded) and no decision in the app pays the worker under a card dispute.
    ('card_dispute_lost',          'The customer won a card dispute with their bank, so the bank took the charge back from your Stripe balance. The worker''s payout is not sent by itself. Whether the worker is still paid is your decision. Ask your developer.', 'developer'),
    -- A12-04: what each way gives is cancel_job's (20261115000500_money_notices.sql:54-63, :100-132:
    -- a started job, or a dated one the worker arrived at, keeps a fee) and ban_user's
    -- (20261108000000_lean_v1.sql:196-230); refunds_due waits while a card dispute holds the money.
    ('job_stuck',                  'This job is paid but still not finished 7 days after its date, or 7 days after the hire if it has no date, so its payment stays held. The customer can cancel the job. The cancellation rules of the job then decide the refund: the full amount, or the amount less a cancellation fee that the worker keeps. The refund is asked for at once, but it can wait, for example while a bank reviews a card dispute. Suspending the worker''s account also cancels this job and asks for a full refund to the customer, but it cancels every unfinished job of that account, also the jobs it posted as a customer. Ask your developer if neither fits.', 'developer'),
    ('job_closed_money_held',      'This job was cancelled while its payment was still held. You can refund the customer here. Paying the worker needs your developer.', 'app'),
    -- A5 point 12: the automatic approval pays at the latest 168 hours after completion; nothing in
    -- the app pays a completed job without an issue report but the customer's approval and that clock.
    ('money_not_moving',           'This job was completed more than 7 days ago and its payment is still held. The automatic approval should have asked for the worker''s payout by then. Ask your developer.', 'developer'),
    -- A9 PART 2 b (2): the one cause today is a recorded refund failure (release_clock.sql:149).
    ('payout_not_automatic',       'This job was completed more than 7 days ago and its payment is still held. A refund on this payment failed before, so the app does not pay the worker by itself. Ask your developer.', 'developer'),
    -- M1b (A4-07): a failed part refund leaves the refunded total as it was, so the rest shown can be wrong.
    ('refund_outside_app',         'Part of this payment was refunded in Stripe, outside the app, and the app has not decided what happens to the rest. The amount shown may be wrong if a refund failed. Ask your developer.', 'developer'),
    -- M1b (A4-07): no money recorded is not proof that none was taken.
    ('cancel_unconfirmed',         'The app closed this payment because it had no record of money for it, but Stripe has not confirmed that the payment is closed. Money may still have been taken from the card. Ask your developer to check it in Stripe.', 'developer'),
    ('issue_open',                 'A customer reported an issue. Decide who gets the money.', 'app'),
    ('issue_no_show',              'A worker reported that the customer was not there. Decide who gets the money.', 'app'),
    ('event_failed',               'A message from Stripe was received, but the app could not use it. Ask your developer.', 'developer'),
    -- A9-02: from when to when is in the detail.
    ('event_scan_gap',             'Some messages from Stripe about payments in one period may not have reached the app, so a payment change from that time, such as a failed refund, may be missing from the app. The period is in the detail. Your developer compares Stripe''s events of that period with the app, then clears this line. Ask your developer.', 'developer'),
    ('timer_missing',              'An automatic task is not set up. Ask your developer.', 'developer'),
    ('timer_failed',               'An automatic task failed on its last run. Ask your developer.', 'developer'),
    ('timer_late',                 'An automatic task has not finished on time. Ask your developer.', 'developer'),
    ('vault_missing',              'A setting the automatic tasks need is missing. Ask your developer.', 'developer'),
    ('push_stuck',                 'Notifications are not going out. Ask your developer.', 'developer')
$fn$;
revoke all on function public.payment_attention_codes() from public, anon, authenticated;
grant execute on function public.payment_attention_codes() to service_role;
comment on function public.payment_attention_codes() is
  'M1: every payment_attention code with its plain sentence (reason, what the owner reads) and its finish: app (a decision the app makes), stripe (done in the Stripe dashboard), bank (the card network decides; answer the dispute in Stripe), worker (the worker must act), wait (the app ends it by itself), developer (nobody else can end it safely). service_role only. M2-3 (refusal_limit): the transfer_balance_low sentence says the app stops after 3 days of refusals. A5 point 12 (money_not_moving): one code added. A5-04 (iv): transfer_not_started and refund_not_started added. A12-01: refund_after_dispute_lost added; A13-01: refund_after_dispute_pending added. A12-03 part 1: transfer_no_answer_yet and refund_no_answer_yet added.';

commit;
