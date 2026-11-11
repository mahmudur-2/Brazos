# Critical blueprint: money safety (ledger B5, B13, B16, B17, B18, B20, B22)

Written 2026-11-11 by Fable. **Design only**: nothing is built, no database and no test was run.
An Opus builder continues from this file and reports its plan before it writes code.

**How to read a proof.** "checked" = the line was read in the last part of this task.
"not re-checked" = read earlier in this task and, on the orchestrator's instruction, not opened
again: confirm the line before you rely on it. The code was read at HEAD `7d2da9d` to `4bbd108`;
`c88cecf` and `e08061e` landed since (`lib/earnings.ts` changed, not re-read).

Short names: `baseline` = `supabase/migrations/20260901000000_baseline.sql`, `foundation` =
`…/20260905000000_stripe_foundation.sql`, `retry` = `…/20260920000000_settlement_retry.sql`,
`lean` = `…/20261108000000_lean_v1.sql`, `tip` = `…/20261111000000_tip_settlement.sql`,
`drain` = `supabase/functions/process-settlements/index.ts`, `classify` = `…/process-settlements/classify.mjs`,
`webhook` = `supabase/functions/stripe-webhook/index.ts`.

## Purpose

Money must not leave wrongly, and the ledger must say what really happened at Stripe. Today the
ledger stores what Brazos *wants* to happen (a transfer amount, a refund amount) and a few
references. It does not store how much came in, how much went back, or how much each worker still
holds. Most flaws below come from that gap. The fix: record the facts from each Stripe event, and
let the two send queues look at the facts at the moment of sending.

## Status of each flaw

| Flaw | Status | Fix in one line |
|---|---|---|
| B16 second transfer after 24 hours | **confirmed** by code and Stripe's documentation (not run). The most dangerous: it repeats every day | a send key is never used by itself after 23 hours; the drain asks the database before each send |
| B16b (new) same for refunds; a part refund may never leave the queue | **confirmed** in the SQL; the real event shape rests on a Stripe changelog title | the refund queue exits on the fact that a refund landed, not on a refund id |
| B18 queue ignores status | **confirmed** | the transfer queue checks status, card dispute, amount received and what is left |
| B13 lost card dispute | **confirmed** | record the dispute amount; show what the worker still holds; a person reverses it in Stripe |
| B13 issue reports never end | **confirmed** | no timer; the operator list shows the age against the promised 2 business days |
| B5 fee math overflow | **confirmed** | four functions compute in `numeric` |
| B20 stuck tip | **confirmed** | one operator function: send again, or refund |
| B22 stale comments | **confirmed** | new comment text |
| B22 `payment_intent.payment_failed` | **confirmed**; switching it on as it is would refund good payments | the SQL branch changes nothing; the event stays off |
| B17 columns exposed | **confirmed** | a column list for the app; hidden fields blanked in `job_payment_state()` |
| B17 no amount check | **confirmed** (job payments; no known path through the app) | store the amount received; a mismatch is never queued |
| B17 delete cascade | **confirmed**; effect on account deletion **not investigated** | plain foreign key, after the builder reads `delete_my_account()` |

## Rules that must never break

1. Every amount × rate is computed in `numeric`. No fee function raises "integer out of range" for a
   price up to the ceiling (10,000,000 cents) or a tip up to its cap.
2. A transfer is sent only when, under a lock on the payment row: the status is `held` or
   `partially_refunded`; no card dispute and no issue report is open; the amount received equals the
   row's charge; `transfer_cents` fits in what is left after refunds; the worker holds nothing from
   this payment; the send key was first used less than 23 hours ago.
3. A refund is sent only when no refund has landed on the charge yet, no card dispute is open, and
   the send key was first used less than 23 hours ago. The drain never sends a second refund on a
   payment by itself.
4. After 23 hours a key is used again only by an operator's hand step, after a look in Stripe.
5. The ledger keeps what Stripe said: `received_cents`, `refunded_cents` (only rises),
   `chargeback_cents`, and one row per Stripe transfer (`reversed_cents` only rises).
6. Nothing is taken from a worker automatically. What is short is shown; only a person reverses a
   transfer, in Stripe.
7. A waiting tip always has a way out, and only the operator holds it.
8. `payment_intent.payment_failed` never changes a row.
9. The app can read only the listed columns of a person's own payment rows.
10. Deleting a job never deletes a payment row.
11. Conservation: for every payment with facts, received = returned + transferred + held + kept; no
    term is negative except kept, and kept is negative only on a row shown to the operator as short.

## B16: a second transfer or refund after Stripe forgets the key

**Proof.**
- On success the drain writes nothing back: `drain:347-355` (transfer), `:417-422` (refund), header
  `:26-34` calls it "the contract" (not re-checked). The row stays in its queue until the webhook
  event is applied, and is posted again every five minutes with the same key
  `tr:<payment id>:<transfer_attempts>` / `rf:<payment id>:<refund_attempts>` (`drain:336-345`,
  `:407-415`, not re-checked).
- The key changes only on a definitive refusal: `classify:125`
  `const rotate = http >= 400 && http < 500 && http !== 409 && http !== 429;` (checked). A 2xx, a
  5xx, a 409, a 429 and a thrown call keep the key. `balance_insufficient` is a 400: it rotates.
- `classify:44-46` (checked): "the cached 5xx replays until the key expires at 24 hours, then
  executes fresh: slow, never double." A saved success expires the same way, and then "executes
  fresh" is a second transfer.
- Stripe (idempotent requests): "We generate a new request if a key is reused after the original is
  pruned"; keys go "after they're at least 24 hours old".
- An event can stay unapplied for ever: after 5 failed applies the webhook answers 200 and nothing
  re-drives it (`webhook:77`, `:224-228`, not re-checked); Stripe retries "for up to three days" in
  live mode and "three times over the course of a few hours" in a sandbox (webhooks page); an
  endpoint set up without `transfer.created` never receives it.
- Nothing at Stripe stops the second transfer: the drain sends no `source_transaction`
  (`drain:336-345`, not re-checked).

Result: while `transfer.created` is missing, the worker gets one more full transfer about every 24
hours, paid from other customers' money.

**B16b, the refund twin (new).** `retry:116-125` (checked): a row leaves `refunds_due` only when
`refund_ref` is set or `status = 'refunded'`. `refund_ref` is read only from `refunds.data[0].id` on
the Charge inside `charge.refunded` (`tip:258-259`, not re-checked). Stripe's changelog lists under
2022-11-15: "The `Charges` object no longer auto-expands refunds by default" (title only; the entry
was not read). Every test fixture adds that list by hand (`supabase/tests/030_payments.sql:480, 515,
533, 577`, not re-checked). If real events carry no list, a part refund (a late cancel, status
`partially_refunded`) never leaves the queue: Stripe replays it for 24 hours, then it is a new
refund request. It goes through when it still fits in the charge (a small job, where the 1,500
minimum fee is more than half the charge); otherwise Stripe refuses and the drain retries with a new
key every five minutes for ever. No webhook stall is needed.
**First builder step: open one real test-mode `charge.refunded` event in the Stripe Dashboard and
see whether it has `refunds.data`.**

**Fix.**
1. Table `settlement_sends (payment_id uuid references payments(id), kind text check (kind in
   ('transfer','refund')), attempt integer not null, first_sent_at timestamptz not null, primary key
   (payment_id, kind))`. RLS on, no policy, service_role only.
2. `settlement_send_begin(p_payment_id uuid, p_kind text, p_attempt integer) returns boolean`,
   security definer, service_role only. It locks the payment row; returns false unless the row is
   still in `transfers_ready` / `refunds_ready` and `p_attempt` equals the row's counter; stores the
   first use time of this attempt (a new attempt number starts a new clock); returns true.
3. `drain`: call it before each of the two Stripe POSTs. On false, or when the call itself fails,
   skip the row and count it. Nothing else changes; "success records nothing back" stays.
4. Both queue views drop a row whose current key was first used more than 23 hours ago, and
   `refunds_due` exits on the fact (SQL under B18).
5. Correct the comment at `classify:44-46`. Logic unchanged.

The pipeline applies migrations, then functions; an old drain on the new SQL behaves as today. Rows
already in a queue when this lands keep today's risk for one more day. Production starts empty.

## B18: the transfer queue does not look at the payment

**Proof.** The live `transfers_due` is still `foundation:860-873`: no later file re-creates it
(search over the migrations, checked; the predicate text itself not re-checked). It asks only for a
release request, no transfer reference, no park, a positive `transfer_cents`, no open issue report.
`release_job_payment()` refuses on a card dispute or a queued refund (`lean:355-361`, checked), and
`auto_release_due_payments()` too (`…/20260930000100_auto_release_told_gate.sql:76`, not
re-checked), but only at the moment of the request. A refund or a card dispute after that is not
seen.

**Fix.** Re-create both views (same `select p.*`; new table columns are added at the end, which
`create or replace view` accepts: precedent `retry:103-116`, checked). `transfers_ready` and
`refunds_ready` need no change. Restate both ACLs (service_role only).

```sql
-- transfers_due: the six existing clauses, then
and p.status in ('held', 'partially_refunded')
and p.chargeback_at is null
and coalesce(p.received_cents, p.charge_amount_cents) = p.charge_amount_cents
and p.transfer_cents <= coalesce(p.received_cents, p.charge_amount_cents)
                        - greatest(coalesce(p.refunded_cents, 0), coalesce(p.refund_cents, 0))
and not exists (select 1 from public.payment_transfers t
                 where t.payment_id = p.id and t.amount_cents > t.reversed_cents)
and not exists (select 1 from public.settlement_sends s
                 where s.payment_id = p.id and s.kind = 'transfer' and s.attempt = p.transfer_attempts
                   and s.first_sent_at < now() - interval '23 hours')

-- refunds_due: provider, refund_cents > 0 and refund_ref is null as today, then
and p.status in ('held', 'released', 'paid_out', 'voided', 'failed')   -- was: status <> 'refunded'
and coalesce(p.refunded_cents, 0) = 0
and p.chargeback_at is null
and not exists (… same, kind = 'refund', s.attempt = p.refund_attempts …)
```

`partially_refunded` stays in the transfer list because a late cancel refunds part and transfers the
fee. The refund status list is the old rule minus `unfunded`, `authorized` (no charge) and
`partially_refunded` (rule 3): the builder confirms with the suite that no real refund path is cut.
`supabase/tests/070_settlement_retry.sql` pins the old `refunds_due` text: update the pin and say so.
What is left open: a refund made in the Stripe Dashboard whose event has not arrived at send time
(seconds). It then shows as short on the operator list.

## Facts recorded from events (needed by B13, B16, B17, B18)

New on `payments` (integer, null, each `>= 0`): `received_cents`, `refunded_cents`,
`chargeback_cents`. New table `payment_transfers (transfer_ref text primary key, payment_id uuid not
null references payments(id), amount_cents integer not null, reversed_cents integer not null default
0, created_at, updated_at)`, RLS on, service_role read only. A table and not two columns, because
one payment can have more than one Stripe transfer, and Stripe may send two events for one object:
a row per transfer id cannot count twice.

`apply_payment_event(p_event_id text)` is re-created whole from `tip`. Only these branches change:

| Event | Change |
|---|---|
| `payment_intent.succeeded` | `received_cents = coalesce(amount_received, charge_amount_cents)`, set once. A **job payment** whose amount differs from its row's charge is still `held`, `last_error` says why, and the views never move it (B17). Tip rule 10 stays |
| `payment_intent.payment_failed` | changes nothing (B22) |
| `charge.refunded` | `refunded_cents = greatest(coalesce(refunded_cents, 0), amount_refunded)`; the rest as today |
| `charge.dispute.created` | as today, plus `chargeback_cents` = the dispute amount, unless the dispute status starts with `warning_` (an inquiry: no money is taken) |
| `charge.dispute.closed` | `won` **or `warning_closed`**: clear `chargeback_at` and `chargeback_cents`. `lost`: status as today, `chargeback_cents` kept (set it if empty) |
| `transfer.created` | add the row in `payment_transfers`; mark the payment released only if that transfer is not already fully reversed there (events can come out of order) |
| `transfer.reversed` | `reversed_cents = greatest(old, amount_reversed)`. Fully reversed, or no such field: as today (back to `held`, parked). Partly reversed: the payment stays `released`, `last_error` says so, no park |

Found while reading: `chargeback_at` is cleared only on `won` (`tip:260-263`, not re-checked), so an
inquiry closed as `warning_closed` blocks the payment for ever. Any `transfer.reversed`, even a part
one, is treated as full (`tip:187-188`, `:224-230`, not re-checked), and un-park sends the whole
`transfer_cents` again (`lean:628-634`, checked). An event that matches no row is marked processed
with no trace (`tip:271`, not re-checked).

Rows funded before these files have no facts. Views use the `coalesce` shown above. No backfill.

## B13: a lost card dispute, and issue reports that never end

**Lost dispute. Proof:** `tip:199-200` (not re-checked): `charge.dispute.closed` with `lost` only
sets the status to `refunded`. Nothing records the amount or what the worker holds. The only `lost`
test runs on a voided row (`supabase/tests/060_connect.sql:284-307`, not re-checked).
**Fix:** no automatic claw-back. The facts above give `short_cents` in the view `payment_money`
(what went out beyond what came in). After a lost dispute on a paid-out job it equals what the
worker holds. The operator reverses the transfer in Stripe (full or part); `transfer.reversed`
records it and the number falls. Stripe: "If you lose, reverse the transfer"; a reversal "can fail
when the account has insufficient available funds". Stripe's own dispute fee is outside this ledger.

**Issue reports. Proof:** `job_disputes` has no end date (`baseline:3687-3699`); an open report
blocks auto-release (`auto_release_told_gate.sql:79`) and the transfer queue; only the customer
(`withdraw_job_dispute`, `baseline:5461-5495`) or the operator (`resolve_job_dispute`,
`lean:576-674`, checked) ends it (the rest not re-checked).
**Fix:** no timer. An automatic end must move money against one side: against the worker is the
penalty the orchestrator ruled out; against the customer breaks the written promise of a human
look. The operator list shows open reports oldest first and marks one overdue after the number the
app already promises: "within 2 business days" (`docs/ARCHITECTURE.md:261-266`, not re-checked).

## B5: fee math overflows

**Proof (not re-checked):** `integer * integer` before the division at `foundation:167`, `:168`,
`:173` (`quote_job_price`), `:535` (`cancellation_fee_cents`), `:916` (`enforce_tip_ceiling`),
`tip:329-330` (`begin_tip_payment`). Ceiling: `baseline:2541`, 10,000,000 cents. With the fee row at
`foundation:127`, by arithmetic: a quote fails from 2,863,312 cents ($28,633.12; 750 bps); a late
cancel fails from 1,073,742 cents ($10,737.42; 2000 bps); **no tip can be added to a job priced from
429,497 cents ($4,294.97; 5000 bps)**; line 173 is safe only while tax is 0.
**Fix:** re-create the four functions with `p_amount_cents::numeric * bps / 10000`; same
signatures, return types and ACLs. For every price that works today the result is the same number.
Ceiling unchanged. No app change.

## B20: a tip with no way out

**Proof:** `transfer.reversed` parks any row (`tip:236-237`, not re-checked). The only un-park,
`resolve_job_dispute()`, reads `kind = 'job_payment'` (`lean:596-597`, checked) and raises "This job
has nothing to resolve" (`lean:606-608`, checked). A tip held by the amount lock has no exit
(`docs/critical/tip-settlement.md:81-83`, checked).
**Fix:** `resolve_tip(p_payment_id uuid, p_outcome text) returns public.payments`, security definer,
service_role only. Refused unless the row is a stripe tip in `held`, no card dispute is open, and
the worker holds nothing from it. `send`: only for a parked tip whose amount matched; clears the
park and adds 1 to `transfer_attempts` (a new key). `refund`: queues a refund of all that was
received (`refund_reason = 'dispute_refund'`, an existing value, so no app text changes) and sets
`transfer_cents = 0`. Known limit: a tip charged for more than its row cannot be refunded this way
(`payments_refund_cents_bounded`, `foundation:229-230`, checked); the operator refunds it in Stripe.

## B22: stale comments, and `payment_intent.payment_failed`

**Comments. Proof:** `foundation:251-252` (checked) and `baseline:2567` (not re-checked). Also
stale: `baseline:2551, 2559, 2563, 2571, 2575` (not re-checked), and after B20
`foundation:257-262` (checked). **Fix:** one file of `comment on`.

**Event. Proof:** handled at `tip:178-179` (unfunded becomes `failed`), not in the webhook's list
(`webhook:61-69`) (both not re-checked). Stripe: after a declined card the intent "returns to
`requires_payment_method` so that the payment can be retried". So with the event switched on, a
declined card would mark the row `failed`, and the customer's good second try would be refunded by
the paid-after-void rule. **Fix:** keep it off, and make the SQL branch change nothing; the row
stays `unfunded` until the existing expiry voids it. Test T5b in `320_tip_settlement.sql` then needs
a declared fixture step to reach `failed`.

## B17: three parts

**Columns. Proof:** policy `baseline:7443` and table-wide `GRANT SELECT` to `authenticated`
`baseline:8060` (not re-checked); `job_payment_state()` returns the whole row (`lean:270-300`,
checked). **Fix:** revoke the table-wide SELECT from `authenticated` and grant the 26 columns of
`PAYMENT_COLUMNS` (`lib/payments.ts:160-161`, not re-checked); the other two selects are inside that
list (`lib/payments.ts:273-277`, `lib/earnings.ts:38-41`, not re-checked). Hidden: `transfer_ref`,
`refund_ref`, `chargeback_ref`, `chargeback_at`, `last_error`, both attempt counters,
`transfer_reversed_at`, both fee rates, and the new columns. `job_payment_state()` blanks them.
Before writing the file the builder must check: every function that is not security definer and
reads `payments`; every policy that reads `payments`; any embedded `payments(...)` select in the
app; build 10's column list. A missed column gives "permission denied for table payments". **This
file goes last, so it can be held back alone.**

**Amount check. Proof:** the tip branch compares the amount (`tip:164-169`); the job branch does
not (`tip:175-177`) (not re-checked). **Fix:** in the event table above.

**Cascade. Proof:** `payments_job_id_fkey … ON DELETE CASCADE` (`baseline:7064-7065`, not
re-checked). **Fix:** `alter table public.payments drop constraint payments_job_id_fkey, add
constraint payments_job_id_fkey foreign key (job_id) references public.jobs(id);`. No migration
deletes rows of `jobs` or `payments` (search, checked); the app deletes a job only with zero bids
(`lib/jobs.ts:622-625`, checked). **Not investigated:** `delete_my_account()` ends with `delete from
auth.users where id = v_user;` (`lean:842`, checked; `lean:794` sets `deleted_at`). If that delete
can reach `jobs` by cascade, payment rows are erased today, and after this fix the delete would
fail. Read `lean:681-862` first. Test first: a person with a released payment deletes the account;
it succeeds and the payment rows are still there.

## Stripe events that matter

"Subscribed" = `webhook:61-69`. "Tested" is from earlier reading (not re-checked).

| Event | Subscribed | Handled in SQL | Tested | Stripe page |
|---|---|---|---|---|
| `payment_intent.succeeded` | yes | yes | yes (030, 320) | events/types |
| `payment_intent.payment_failed` | no (keep off) | yes (to be made empty) | 320 T5b only | paymentintents/lifecycle |
| `payment_intent.canceled` | yes | yes | yes | events/types, lifecycle |
| `charge.refunded` | yes | yes | yes, with a hand-made `refunds` list | events/types, changelog, charges/object |
| `charge.dispute.created` | yes | yes | yes | connect/disputes |
| `charge.dispute.closed` | yes | `won`, `lost`; not `warning_closed` | `won`; `lost` only on a voided row | events/types ("lost, warning_closed, or won") |
| `transfer.created` | yes | yes | yes | not verified |
| `transfer.reversed` | yes | yes, always as full | job payment only; part reversal never | separate-charges-and-transfers |
| `refund.created`, `refund.updated`, `refund.failed`, `charge.refund.updated`, `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`, `charge.dispute.updated`, `payout.paid`, `payout.failed` | no | no | no | events/types |

Add none in this run. First to add later: `refund.failed`, then the two `funds_` events.

Pages read (all under `https://docs.stripe.com/`): `connect/separate-charges-and-transfers` (refunds
do not touch transfers; reversals, full or part; the `source_transaction` cap), `api/idempotent_requests`
(keys), `connect/disputes` (the platform is debited; reverse after a loss), `api/events/types`,
`webhooks` (retries, no order, duplicates, resend 15 or 30 days), `payments/paymentintents/lifecycle`,
`api/charges/object` (`amount_refunded`), `changelog` (title only).
**Not verified from Stripe's documentation:** the fields `amount_reversed` on a Transfer, `amount`
and the status names on a Dispute, `amount_received` on a PaymentIntent, the two `transfer.*` event
texts, that refunds cannot exceed the charge, and that a webhook event never carries expanded lists.

## The conservation test (backbone)

New file `supabase/tests/330_money_conservation.sql`. The test plays Stripe with its own book (a
temp table: per payment, cents charged, refunded, lost to a dispute, transferred, reversed; and each
key with its first use time, forgotten after 24 hours) and a small copy of the drain (read the ready
view, call `settlement_send_begin`, book the money, send the matching event). After **every** step,
for every payment:

- (a) on the book, money sent out by the drain never exceeds money in;
- (b) the ledger's facts equal the book;
- (c) in `payment_money`: received = returned + transferred + held + kept, with no negative term
  except kept, and kept negative only where `short_cents > 0`;
- (d) in each named end state held is 0 and kept is the fee expected for that story.

Honest note: (c) is true by how "kept" is built. The teeth are (a), (b), the signs, and (d).

`payment_money` (new view, service_role only), per payment: `facts_known` (`received_cents is not
null`; older rows are skipped), `received`, `returned` = refunded + chargeback, `transferred` = sum
of `amount_cents - reversed_cents`, `left` = received − returned − transferred, `held` = all of
`left` while nothing is decided, else the part still owed by the row's own intent (transfer not yet
sent, refund not yet landed), `kept` = `left` − `held`, `short_cents` = `greatest(0, -left)`.

Stories: a normal job; a tip; a refund after the release request (B18); a card dispute won, lost
before the transfer, lost after it (B13); a stalled webhook past the key window for a transfer and
for a part refund (B16; the test moves `first_sent_at` back 25 hours, declared); a reversed tip then
`resolve_tip` (B20); a wrong amount received (B17); a late cancel with its fee; a part reversal;
`payment_failed` then success (B22).

## Tests to write first (each must fail on today's schema)

| File | Proves |
|---|---|
| `supabase/tests/330_money_conservation.sql` | rules 2 to 6, 8, 11 |
| `supabase/tests/340_fee_math.sql` | rule 1: `quote_job_price(10000000)` and `(2863312)` return rows; a late cancel above 1,073,742 cents charges the 3,500 cap; a tip on a job above 429,497 cents is accepted; an oversized tip gets the ceiling message; five prices that work today give the same fees |
| `supabase/tests/350_money_guards.sql` | rules 7, 9, 10: column grants (a hidden column is refused, the 26 are readable); `job_payment_state()` returns hidden fields empty; a job with a payment cannot be deleted; `resolve_tip` outcomes and refusals; ACLs of every new object; no comment names `sandbox_release_job_payment` |
| Jest, source text of `drain` | `settlement_send_begin` is called before each POST and a false skips the row |
| Changed: `070_settlement_retry.sql` (the pin), `320_tip_settlement.sql` (T5b) | say which and why in the report |

## Migration files, in order (all additive)

| File | Holds |
|---|---|
| `20261112010000_fee_math_numeric.sql` | `quote_job_price`, `cancellation_fee_cents`, `enforce_tip_ceiling`, `begin_tip_payment` |
| `20261112010100_money_facts.sql` | three columns; tables `payment_transfers`, `settlement_sends` |
| `20261112010200_payment_events_facts.sql` | `apply_payment_event` |
| `20261112010300_settlement_queue_guards.sql` | `transfers_due`, `refunds_due`, `settlement_send_begin` |
| `20261112010400_payment_money_view.sql` | `payment_money` |
| `20261112010500_resolve_tip.sql` | `resolve_tip` |
| `20261112010600_payments_job_fk_no_cascade.sql` | the foreign key |
| `20261112010700_payments_comments.sql` | comments |
| `20261112010800_payments_column_grants.sql` | the grant, `job_payment_state` (held back if build 10 is not checked) |

No new enum value. Every security definer function restates its revoke and grant. Run
`npm run db:types` in the same commit.

## What other groups must know: objects replaced or altered

- Functions replaced: `quote_job_price`, `cancellation_fee_cents`, `enforce_tip_ceiling`,
  `begin_tip_payment`, `apply_payment_event`, `job_payment_state`. New: `settlement_send_begin`,
  `resolve_tip`.
- Views replaced: `transfers_due`, `refunds_due`. New: `payment_money`. Unchanged: `transfers_ready`,
  `refunds_ready`.
- Table `payments`: three columns, the job foreign key, the SELECT grant for `authenticated`,
  comments. New tables: `payment_transfers`, `settlement_sends`. Policy "parties view own payments":
  unchanged.
- Other files: `supabase/functions/process-settlements/index.ts` (two call sites), `classify.mjs`
  (comment), `types/database.ts`, tests 070 and 320, `docs/ARCHITECTURE.md:481-498` (keys, events),
  `docs/critical/tip-settlement.md:74-83, 117-118` (now out of date), the ledger.
- Not touched: `release_job_payment`, `auto_release_due_payments`, `cancel_job`,
  `resolve_job_dispute`, `record_settlement_attempt`, `stripe-webhook`, `create-payment`, the app.

## New numbers and choices

- **23 hours** (the only new number): a key is not used by itself once it is 23 hours old, one hour
  inside Stripe's "at least 24 hours".
- No timer for issue reports; "overdue" uses the existing 2 business days.
- A transfer is sent only from `held` or `partially_refunded`.
- The drain never sends a second refund on a payment by itself.
- `warning_closed` is treated like `won`. A part reversal leaves the payment `released`.
- `payment_intent.payment_failed` stays off and changes nothing.
- The operator's tip refund uses the reason `dispute_refund`.

## Open questions, with the recommended answer

1. Should an unanswered issue report end by itself? **No.** Other choice: after 7 days (the
   existing auto-release number) it closes and the normal clock goes on; needs a sentence in Terms.
2. A customer's bank takes the money back before the worker was paid. Does Brazos still pay the
   worker? **Not automatically**: the row is listed and the owner decides.
3. After a lost dispute, reverse the worker's transfer? **The owner decides each case**; the page
   shows the amount.
4. An operator raises a refund after a part refund already landed. **Refund the rest by hand in
   Stripe.** Other choice: the drain sends the difference (more code in the money path).
5. Add `source_transaction` to transfers, so Stripe itself caps them at the charge? **Not in this
   run** (needs the charge id and a Stripe test run). First item for BACKLOG.
6. Hold the column-grant file until build 10's column list is known? **Yes.**
7. Production webhook: the seven events must be ticked when the endpoint is made. **Put it on the
   production checklist.**
8. Tips from before B1 (ledger B19): outside this design.

## Operator notes: what a day-one page must tell the owner

| Case | How the page knows | It says | Hand step |
|---|---|---|---|
| Stuck payment | an event not processed; or a send first tried over 23 hours ago and not confirmed; or amount received ≠ charge; or a tip parked or amount-locked | "This payment is waiting for you", with the reason and the age | Find the transfer or refund in Stripe by payment id. Found: `select public.apply_payment_event('<event id>')` (not verified that it accepts an event with 5 failed tries) or resend the event from Stripe. Not found: `select public.record_settlement_attempt('<payment id>', 'transfer' or 'refund', true, '<note>')` (`retry:147-184`, checked). Wrong amount: refund in Stripe. Tip: `resolve_tip` |
| Refund after release | `short_cents > 0`, no card dispute | "The customer was refunded and the worker still holds N" | Decide; reverse the transfer in Stripe, full or part |
| Lost dispute | `chargeback_cents > 0` and status `refunded` | "The bank took N back. The worker holds M" | Reverse in Stripe if you decide to. It can fail when the worker's balance is low; the row stays listed. Nothing is taken automatically |
| Reversed transfer | parked row, or a transfer with `reversed_cents > 0` | "A transfer was taken back: N of M" | Job: `resolve_job_dispute`. Tip: `resolve_tip`. A partly reversed transfer is never sent again by itself |
| Open issue reports | `job_disputes` open | age, and "overdue" after 2 business days | `resolve_job_dispute` |

## Effect on the phone tests and on the installed test build

- No RPC changes its parameters and no screen text changes: flows 04 and 06 need no step change. A
  real Stripe event carries the amount received, so the amount check passes.
- Old builds: every fix but one is invisible to the app. The one is the column grant: a build that
  selects a column outside the list gets "permission denied for table payments", which is not a
  readable error. Build 10's list was not checked; the file is last so it can wait.
- Test accounts' data: no change needed. Old rows have no facts and are skipped by `payment_money`.
  Old part-refunded rows stop being sent again (good).
- The foreign key change can touch flow 10 (Delete Account) only through the unread
  `delete_my_account()`: see B17.

## Staging scan

No file above contains a flagged shape outside a function body: they use `create or replace`,
`create table`, `alter table … add column / drop constraint / add constraint`, `revoke`, `grant`,
`comment on`. Keep the seven flagged phrases out of comment strings (the scan reads them), and use
plain `$$` for function bodies (a tag with a digit is not recognised:
`scripts/staging-scan.sh:229-237`, not re-checked). No file needs the owner's click.

## Not verified

Nothing was run: every claim here is from reading. Also open: the real `charge.refunded` payload;
the Stripe fields listed under the event table; build 10's selects; `delete_my_account()` and
cascades into `jobs`; other UPDATE triggers on `payments`; functions and policies that read
`payments` as the caller; how the cancelled-job branch of `resolve_job_dispute` (`lean:642-667`)
sets refunds; whether an operator log table exists (so `resolve_tip` takes no note).

## Undo

A new migration that re-creates the old definitions; never edit an applied file. Do not undo the
queue guards and keep the new drain, or the reverse: the drain needs `settlement_send_begin`. The
new columns and tables can stay; they hold facts only.
