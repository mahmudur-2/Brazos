# Critical blueprint: tip settlement (ledger B1)

Written 2026-11-11 by Fable (critical skill). Module: the tip's path through the payments ledger.
Tests: `supabase/tests/320_tip_settlement.sql` (pgTAP, local stack), `tests/payouts.test.mjs`,
`tests/moneyCopy.test.mjs`.

## Purpose

A tip the customer is charged for must reach the hired worker, once, by the same settlement route as a
job payment: a row in `transfers_due`, sent by `process-settlements`, confirmed by `transfer.created`.
Before this change a charged tip was marked `released` at once and never transferred (B1).

## Interface (nothing new; two function bodies change)

- `begin_tip_payment(p_job_id, p_amount_cents)`: same signature and refusals. Mints the unfunded tip
  row (`platform_fee_cents = 0`, customer fee only). One change (rule 9): it no longer rewrites an
  unfunded tip's amount in place.
- `apply_payment_event(p_event_id)`: replaced whole in `20261111000000_tip_settlement.sql`. Only the
  tip branch of `payment_intent.succeeded` changes (rules 1 and 10); every other branch is identical
  to `20260915000000_connect_onboarding.sql` §1.
- `transfers_due`, `transfers_ready`, `process-settlements`, `create-payment`: unchanged. The tip row
  now satisfies the view's existing predicate.
- Client (words and one classifier; no money math):
  - `classifyTipPoll()` in `lib/payments.ts`: `TipPollState = 'charged' | 'released' | 'gone' |
    'pending'`. `held` → `'charged'` (the card was charged and the tip is queued: the poll's success);
    `released` / `paid_out` → `'released'`; the rest as before.
  - `paymentCaption()` in `lib/moneyCopy.ts`, a held tip: customer `Tip on its way to <name>`
    (fallback `your worker`), worker `Tip from <name> — on its way` (unchanged). Released tip captions
    unchanged (`Tip sent to <name>` / `Tip received`).
  - The tip card in `screens/ReviewAndTipScreen.tsx`: the poll and the re-read stop on `'charged'` or
    `'released'`; the note under the amount says "Your tip is on its way to <name>" while the row is
    held and "Your tip went to <name>" only once it is released or paid out.

## Rules that must never break

1. `payment_intent.succeeded` on an **unfunded tip** sets, in one update: `status = held`,
   `held_at = now()`, `release_requested_at = now()`,
   `transfer_cents = amount_cents - platform_fee_cents` (the whole tip: the tip trigger forces
   `platform_fee_cents = 0`). `released_at` and `transfer_ref` stay null. `release_reason` stays null.
2. After rule 1 the tip is in `transfers_due` **exactly once**, with `payee_id` = the hired worker and
   `transfer_cents` = the tip's `amount_cents`. The customer fee is never part of the transfer.
3. `transfer.created` for the tip sets `status = released`, `released_at`, `transfer_ref`; the tip
   leaves `transfers_due`. A stripe tip is never `released` without a `transfer_ref`.
4. A second `payment_intent.succeeded` for the same tip (a new event id) changes nothing:
   `release_requested_at`, `transfer_cents` and `status` are as the first left them, before and after
   the transfer lands. The tip is never queued twice.
5. `payment_intent.succeeded` on a **voided or failed tip** queues a full refund
   (`refund_reason = funded_after_void`) and no transfer: `release_requested_at` and `transfer_cents`
   stay null, and the row is not in `transfers_due`.
6. A job payment is untouched: `payment_intent.succeeded` leaves it `held` with
   `release_requested_at` null and out of `transfers_due` until the customer approves or the clock runs.
7. Every amount is integer cents read from a ledger column. No edge function and no client code
   computes a tip amount.
8. No customer-facing or worker-facing text says a tip was sent, paid or received before the row is
   `released`. A held tip reads "on its way".
9. A tip row's amount never changes after the row is minted (added after review, 2026-11-11: the
   transfer is now real money, so the row a payment intent was made for must be the row that is
   paid out). Asking `begin_tip_payment` for a different amount voids the unfunded row and mints a
   new one, whether or not an intent is attached; the new row passes the tip ceiling again
   (`payments_tip_ceiling` is an insert trigger). A refused amount leaves the old row as it was.
10. A tip is queued for transfer only when the provider's event says it received exactly the row's
    `charge_amount_cents` (`amount_received`; an event with no such field is taken as matching).
    On a mismatch the tip is held, **not** queued (`release_requested_at` and `transfer_cents` stay
    null), and `last_error` says why. Nothing is transferred until an operator decides. With rule 9
    this cannot happen through the app; it is the second lock on the one step that sends money out.

## Edge cases

- An open issue report on the job keeps the tip out of `transfers_due` (the view's own dispute clause)
  until it is resolved.
- The worker's payout account is not enabled: the tip waits in `transfers_due`, absent from
  `transfers_ready`, like a job payment.
- The platform balance is not yet available: `process-settlements` defers and retries (unchanged).
- `transfer.reversed` on a tip parks it (`transfer_reversed_at`); nothing un-parks a tip
  automatically. An operator decides. Known, not changed here.
- Tips charged before this migration stay `released` with no `transfer_ref`. The migration does not
  touch them: moving money for old rows is the owner's decision.
- Not fixed here (ledger B18): `transfers_due` does not look at `status`, so a charge refunded or
  lost to a card dispute after release was requested and before the transfer lands is still
  transferred. True for job payments today; a tip now has the same short window.
- A tip held by rule 10 (wrong amount received) stays held with no automatic way out: no transfer,
  no refund, and the customer cannot add another tip to that job. An operator refunds it in the
  provider's dashboard. It cannot be reached through the app (rule 9).
- Changing the tip amount several times before paying leaves one voided row per change. Voided
  rows are not live (`payments_one_active_per_job_kind` ignores them) and the payment reads in
  `lib/payments.ts` filter them out. The app's own checkout already made one per change, because
  it attaches an intent every time.

## Test list

| Rule | Test (in `320_tip_settlement.sql` unless named) |
|---|---|
| 1 | T1: after the event the tip is held, held_at and release_requested_at set, transfer_cents = amount, released_at and transfer_ref null |
| 2 | T2: exactly one `transfers_due` row for the tip; payee is the hired worker; transfer_cents = tip amount (and not the charge amount) |
| 2 | T2b: with an enabled payout account the tip is in `transfers_ready` |
| 3 | T3: `transfer.created` moves it to released with transfer_ref; zero rows in `transfers_due` |
| 4 | T4a: a replayed succeeded before the transfer leaves release_requested_at and transfer_cents unchanged, still one row; T4b: after the transfer, still zero rows |
| 5 | T5: a voided tip that is then paid gets a refund queued, no transfer, not in `transfers_due` |
| 6 | T6: a funded job payment is held, release_requested_at null, not in `transfers_due` |
| 7 | T2 (amount equality on integer columns); `create-payment` and `process-settlements` unchanged |
| 5 | T5b: a failed tip that is then paid gets a refund queued, no transfer |
| 8 | `tests/moneyCopy.test.mjs` (held tip captions; "sent" only when released), `tests/payouts.test.mjs` (poll classifier: held = charged, a success; the tip card says "went to" only behind `isReleased`) |
| 9 | T8: changing an unfunded tip with no intent attached voids it and mints a new row; the first row's amount is unchanged |
| 9 | T9: raising an unfunded tip above the ceiling is refused and the first row is untouched |
| 9 | T10: an intent made for the first amount, attached after the amount was changed, lands on the voided row: paying it queues a refund and no transfer, and the new row stays unfunded |
| 10 | T11: a charged tip whose event reports a different `amount_received` is held, not queued, `last_error` set; T1 covers the matching case (T1's event carries the matching amount) |
| edge | T7: an open issue report keeps the tip out of `transfers_due` |

Notes from the test writer, kept so nobody "simplifies" them away:

- T4a rewinds the tip's `held_at` and `release_requested_at` by one hour first (declared fixture
  surgery). `now()` is fixed for the whole test transaction, so without it a replay that re-stamped
  either column would write the value already there and the test could not see it.
- T7 opens the issue report between the customer's approval and the job payment's
  `transfer.created`. That is the only real window: `open_job_dispute` refuses once the job
  payment has released, and a tip needs it released.
- T5b uses `payment_intent.payment_failed`, which the SQL handles but the webhook is not
  subscribed to today. The rule still has to hold if that event is ever switched on.
- T10 computes the 1000 tip's charge from the fee table, not from the row, so the expected number
  does not move if the row were rewritten.

## Proof (local stack, 2026-11-11)

- Before the fix: `320_tip_settlement.sql` on the schema without this migration, 10 of 15 failed
  (T1, T2, T2b, T3, T4a, T4b, T7 and the invariant); T1 read `status released, transfer_cents null`.
- After the first version of the migration: full suite green, then the review found the amount
  hole (rules 9 and 10). The five new tests (T8, T9 twice, T10, T11) failed on that version: T10
  showed a tip charged for the 1000 amount queued with `transfer_cents 2100`.
- After the hardening: `npm run db:reset` clean, `npm run db:test` 34 files, 1805 tests, PASS, none
  skipped; `npm run verify` 1282 pass, 0 fail.

## Undo

`git revert <commit>` removes the client change. The database: a new migration that re-creates
`apply_payment_event()` from `20260915000000_connect_onboarding.sql` §1 and `begin_tip_payment()`
from `20260905000000_stripe_foundation.sql` §16 (never edit or delete the applied file). Do not undo
the two halves apart: the old `begin_tip_payment()` with the new settlement re-opens the amount
hole. Tips charged while the fix was live stay correct either way.

## Data notes

No table, column, view, trigger or grant changes; no data is rewritten. Additive SQL only (two
`create or replace function`, their `revoke`/`grant` restated, two `comment on`), so the staging
pipeline applies it without the destructive gate (`scripts/staging-scan.sh false <file>`: no
destructive shape). `types/database.ts` is unchanged (`npm run db:types`: no diff). Local proof only:
`npx supabase start`, `npm run db:reset`, `npm run db:test`.
