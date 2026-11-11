# Critical blueprint: job lifecycle (ledger B4, B8, B11, B15, E6)

Written 2026-11-11 by Fable. Design only: nothing is built, nothing was run (no database, no tests).
The orchestrator stopped the reading early: read "Not investigated" (last section) before building.

Proof marks: **[R]** = read in the last working session, quote taken from the file. **[N]** = from
earlier notes of this task, not re-checked. No quote was opened a second time.

| Flaw | Status | Fix in one line |
|---|---|---|
| B4 | confirmed | A server sweep releases a hire not paid 24 hours after the hire: the job goes back to open, or is closed when there is no market to go back to |
| B8 | confirmed | `cancel_job()`: no fee when the worker never tapped "arrived" and the arrival window is over |
| B11 | confirmed | A worker without a working payout account cannot send, counter or accept an offer, and cannot be hired |
| B15 | expiry half confirmed; "cannot close a job with offers" not confirmed (already fixed) | A server sweep closes open jobs that are too old |
| E6 | cause confirmed from code; the count on staging not checked | B15's sweep, plus one "Cancel job" step in flow 06 |

## Rules that must never break

1. Only the server un-hires or closes a job. No client write sets `status` or `assigned_worker_id`.
2. A job with money on it (a `job_payment` row that is not `unfunded`, `failed` or `voided`) is never
   released or expired by a sweep.
3. A checkout window the customer can still see (`funding_due_at` ahead) is never cut short.
4. After a release nothing of the old hire is left on the job: no worker, no accepted offer, no price,
   no arrival marks, no agreement row. The next hire writes fresh terms.
5. A worker who never tapped "arrived" and whose arrival window is over gets no cancellation fee.
6. A worker whose `payouts_enabled` is false is never assigned to a job.
7. No new status and no new client-sent cancel reason: the three new reasons are written by the server only.
8. Every number is reused from the code where one exists (see "New numbers and choices").

## B4. Accept, then never pay

1. **Confirmed.** `supabase/migrations/20260905000000_stripe_foundation.sql:846-852` [N]: the whole expiry is
   `update public.payments set status = 'voided', last_error = 'funding window expired' … where … status = 'unfunded' and … funding_due_at < now()`.
   No job row is touched. Also true today:
   - A hire with no checkout started has no payment row (`begin_job_payment()` mints it, same file
     :611-617 [R]), so nothing ever expires.
   - The job can never start: work needs a held payment (`20260925000000_job_completions.sql:151-159` [R]).
   - The stuck job blocks both accounts from deleting (`20261003001000_deletion_fee_owed.sql:53` [N]).
2. **Root cause.** The expiry was written for the payment row only; no server path undoes a hire.
3. **Fix.** New function `release_unpaid_hires(p_now timestamptz default null)`: security definer,
   `service_role` only; `p_now` exists for tests (pattern: `advance_job_series(p_now …)`,
   `20260930001000_job_series.sql:433` [R]). A cron runs it every 15 minutes.
   **Which jobs:** `status = 'assigned'` and all of:
   - hired more than 24 hours ago: `coalesce(job_agreements.accepted_at, the accepted offer's updated_at)`;
   - no `job_payment` row in a state other than `unfunded`, `failed`, `voided`;
   - no `unfunded` row whose `funding_due_at` is still ahead.
   So the customer has 24 hours to start paying, and a started checkout keeps its own 24 hours
   (`stripe_foundation.sql:616` [R]): about 48 hours at most.
   **What it does**, per job, job row locked first (`for update skip locked`; lock order jobs, offers,
   payments, as `baseline.sql:1019-1022` [R] and `stripe_foundation.sql:561, 575-577` [R]), conditions
   checked again after the lock:
   - a. Unfunded `job_payment` rows become `voided`, `last_error = 'hire released: not paid in time'`
     (shape of `20261108000000_lean_v1.sql:449-453` [N]). A charge landing later on a voided row is
     refunded by the existing `funded_after_void` path (`20261003000100_ban_refund.sql:27-31` [N]).
   - b. The accepted offer: `status = 'expired', awaiting_id = null, updated_at = now()`, then
     `offer_post_event(id, root_offer_id, author_id, 'expired', amount_cents)`: the pattern of
     `expire_offer_if_stale()` (`20260901000000_baseline.sql:2188-2194` [R]).
   - c. **Back to the open market** when `visibility = 'open_market'`, `series_id is null` and the job's
     time has not passed (`job_window_end(job)` is ahead; or no date and posted less than 30 days ago):
     `status = 'open'`; `assigned_worker_id`, `accepted_offer_id`, `final_amount_cents`, `en_route_at`,
     `arrived_at`, `late_minutes`, `late_reported_at` set to null; the job's `job_agreements` row removed.
     Why the row must go: it is keyed by job (`stripe_foundation.sql:401` [R]) and the next hire's
     snapshot is `on conflict (job_id) do nothing` (:478 [R]), so the old row would stay: wrong worker,
     wrong price, old `accepted_at` (the free-cancel clock, `job_terms()` :508, :516 [R]), and the
     released worker could still read it (:429-430 [R]). The immutability trigger is `before update`
     only (:441 [R]); no role may remove rows (:426 [R]) but a security definer function owned by the
     table owner can. Restate the table comment (:431-432 [R]).
     Why the arrival columns are reset: a worker can report "running late" on an unpaid job
     (`20260930000700_running_late.sql:73` [N]); the next worker must not inherit it (B8 reads `arrived_at`).
   - d. **Closed** in every other case (a hire request made to one worker: `visibility = 'direct'`,
     `baseline.sql:1531` [R]; a repeat visit; a job whose time has passed): `status = 'cancelled'`,
     `cancel_reason = 'unpaid'`, written with the columns `cancel_job()` writes (`lean_v1.sql:510-516` [N]),
     `cancelled_by` null. The agreement row stays. Reason: there is no listing to go back to, and a
     cancelled repeat visit is a state the repeat-job code already knows (`job_series.sql:552-555` [R]);
     a re-opened one is not.
   - e. Both people get a notification: `enqueue_notification(recipient, actor, 'jobs', type, title,
     body, data, dedupe_key)` (call shape: `20260930001200_hire_from_push.sql:185-197` [R]). No amount
     in the text. Customer, re-opened: "Your job is open again" / "<title>: it was not paid in 24 hours,
     so <first name> was released. Workers can send offers again." Customer, closed: "Your job was
     closed" / "<title>: it was not paid in 24 hours. Post it again when you are ready." Worker: "You
     were released from a job" / "<title>: the customer did not pay in time. Nothing was charged."
   **The other offers.** At the hire the rival pending offers became `superseded` or `expired`
   (`baseline.sql:334-338` [N]). They stay closed. Those workers see the job in the feed again and can
   send a new offer: the one-live-bid index covers pending offers only (`baseline.sql:6558` [R]) and
   `create_offer()` only needs the job open (:1420-1424 [R]). They are not notified.
   By themselves: messaging locks again (`messaging_unlocked`, `baseline.sql:3027-3055` [N]); the
   released worker loses the exact address (`job_locations_select_party`, `baseline.sql:7266-7268` [N]).
   Not changed: `expire_unfunded_payments()`, `begin_job_payment()`, `install_settlement_schedules()`.
4. **Tests first** (`supabase/tests/350_unpaid_hire_release.sql`; all fail today: the function does not
   exist and the job stays assigned). Time is moved with `p_now`, never by editing `accepted_at`.
   - T1 market job hired, no checkout: at +23 h nothing changes; at +25 h the job is `open`, the worker,
     accepted offer and price are null, the offer is `expired`, no `job_agreements` row.
   - T2 checkout started: at +25 h the unfunded row is `voided` with the new `last_error`, job `open`.
   - T3 a window still ahead (fixture: `funding_due_at` set to +30 h): at +25 h the job stays assigned.
   - T4 held payment (`tests.test_fund_job`, `_helpers.sql:76-96` [R]): at +72 h still assigned and held.
   - T5 re-hire: a second worker bids and is accepted; `job_agreements` names worker 2 and the new
     price; `begin_job_payment()` mints a new unfunded row.
   - T6 the released worker: `transition_job_status` raises; he reads zero `job_locations` rows.
   - T7 a superseded rival offer stays `superseded`; that worker's new `create_offer` succeeds.
   - T8 hire request (direct): at +25 h the job is `cancelled`, `cancel_reason = 'unpaid'`.
   - T9 dated job, `p_now` after its window end: `cancelled`, not `open`.
   - T10 arrival marks: `late_minutes` set before the release is null after it.
   - T11 `authenticated` and `anon` cannot execute the function (42501).
   - T12 the customer is no longer listed by `account_deletion_blockers()` for that job.
5. **App.** No new status. Copy only: customer, where the funding window is shown
   (`screens/ClientJobDetailScreen.tsx:1310-1315` [N], `screens/CheckoutScreen.tsx:221-227` [N]): add
   "If it is not paid by then, the worker is released." Worker, unpaid hire on `screens/WorkerJobScreen.tsx`:
   "If the customer does not pay within 24 hours of hiring, you are released from this job." Optional,
   one shared function in `lib/jobLifecycle.ts`: a label for `cancel_reason` (`unpaid`, `expired`,
   `worker_no_show`); the app reads `cancel_reason` nowhere today [N].

## B8. Worker no-show still earns the cancellation fee

1. **Confirmed.** `supabase/migrations/20261108000000_lean_v1.sql:460-490` [N]: for `customer_cancelled`
   on a held payment the rule looks at status, the date, 15 minutes after acceptance and 24 hours
   before the window start. It never reads `arrived_at`. When not free:
   `transfer_cents = v_fee, refund_cents = v_charge - v_fee, release_reason = 'cancellation_fee'`.
2. **Root cause.** The fee rule only asks when the customer cancelled, never whether the worker came.
3. **How "Customer wasn't there" works** (`lean_v1.sql:438-445` [N]): work not started; the worker
   tapped "arrived" ('Mark that you arrived before reporting a no-show'); a dated job; now is past
   `scheduled_date + coalesce(arrival_end_hour, 24)` hours, New York time ('A no-show can be reported
   once the arrival window has passed'). The payment then stays held and an operator decides
   (:498-507 [N]). App mirror: `lib/paymentRules.ts:279-294` [N].
   **Fix: the mirror, same numbers.** In `cancel_job()` (replaced whole; today's body
   `lean_v1.sql:377-549` [N]), `customer_cancelled` on a held payment gains one free case, checked
   before the fee: `status = 'assigned'` and `arrived_at is null` and a dated job and now is past
   `job_window_end(job) + late_minutes` (the worker's own reported delay, 10, 20 or 30 minutes,
   `20260930000700_running_late.sql:46` [R]). Then: full refund (`refund_reason =
   'customer_cancelled_free'`, an existing value, so the money group's constraint is not touched), no
   transfer, and the job gets `cancel_reason = 'worker_no_show'`. No operator step: no money goes to
   anyone but the payer. The two no-show claims cannot both hold: one needs `arrived_at`, the other needs
   it empty. The client still sends `customer_cancelled` (`lib/jobs.ts:638-646` [N]); the server decides.
   The reason allow-list of `cancel_job()` (:395 [N]) stays: a client can never send the new value.
   Unchanged: cancel during the window with no arrival yet (fee, as today); a job in progress (fee);
   a job with no date (free today).
4. **Tests first** (`supabase/tests/340_worker_no_show.sql`):
   - N1 held job, date moved to yesterday (declared fixture), no arrival, customer cancels:
     `refund_cents` equals the charge, `transfer_cents` and `release_requested_at` null. Fails today.
   - N2 after N1 the job's `cancel_reason` is `worker_no_show`. Fails today.
   - N3 same but `arrived_at` set: the fee is transferred as today (guard).
   - N4 window not over (date today, end hour 24): fee as today (guard).
   - N5 the customer no-show path still parks the payment and opens the report (guard).
   - `tests/cancelJob.test.mjs` [N]: `customerCancelPreview` is free in the no-show case, charges when
     arrived, charges inside the window, and `late_minutes` moves the line (the SQL late term has no
     stable pgTAP fixture: it is proven only in this mirror test).
5. **App.** `lib/paymentRules.ts` `customerCancelPreview` (:232-272 [N]): the same free case. Confirm
   copy in `lib/moneyCopy.ts` (near :166 [N]): "Your worker did not arrive in the window. You get a full
   refund." The worker's cancel notification (`lean_v1.sql:523-544` [N]) must not promise a fee in this case.

## B11. Hire of a worker who cannot be paid

1. **Confirmed.** `accept_offer()` (`baseline.sql:258-353` [N], only definition) checks that the worker
   is active (:304-306 [N]) and the job state (:310-318 [N]); `create_offer()` (:1387-1588 [R]) and
   `counter_offer()` (:992-1088 [R]) never read `payment_accounts`. The fact exists:
   `payment_accounts.payouts_enabled` (`stripe_foundation.sql:343` [N]), set from `payouts_status` by
   `set_payouts_status()` (`20260915000000_connect_onboarding.sql:329-336` [R]).
2. **Root cause.** Payout set-up was built after the offer functions and was never wired into them.
3. **Fix: the gate lives in both places.** One helper `worker_payouts_ready(uuid)` (no client grant,
   like `job_request_parties_ok`, `20261108010000_lean_v1_grants.sql:48-49` [N]). It is always asked
   about the WORKER of the offer, never about the caller.
   - `create_offer()`, bid on an open job (:1417-1456 [R]): refuse with "Finish payout set-up before
     you send an offer. Open Profile, then Earnings & payouts."
   - `counter_offer()` when the caller is the offer's worker: the same sentence.
   - `accept_offer()`, after the active check: caller is the worker: "Finish payout set-up before you
     accept. Open Profile, then Earnings & payouts."; caller is the customer: "This worker cannot be
     paid yet, so they cannot be hired. Choose another offer, or try again later."
   - A customer's hire request to a worker with no payout account is still allowed (it is the nudge);
     that worker can decline, but not accept or counter.
   Known limit: `payouts_enabled` is refreshed only when `connect-status` runs (no `account.updated`
   webhook, `docs/ARCHITECTURE.md` edge-function section [N]), so it can be stale in both directions.
4. **Tests first** (`supabase/tests/330_payouts_gate.sql`):
   - P1 worker with payouts off: `create_offer` on an open job raises the sentence. Fails today.
   - P2 offer sent while on, then payouts off: the customer's `accept_offer` raises; job stays `open`,
     offer stays `pending`. Fails today.
   - P3 hire request to a worker with payouts off: the customer's `create_offer` succeeds; the worker's
     `accept_offer` and `counter_offer` raise (fail today); `decline_offer` succeeds.
   - P4 a customer with no payout account counters a bid: succeeds (the gate reads the worker only).
   - P5 payouts on: bid, counter and hire succeed (guard). P6 the helper is not executable by
     `authenticated` or `anon`.
   **Helper change:** `tests.create_user` (`supabase/tests/_helpers.sql:49-69` [R]) makes no payout
   account, so after the gate every existing test that bids or hires fails. Give every created account
   an enabled payout account (`set_payment_account` then `set_payouts_status(…, 'enabled')`), add
   `tests.set_payouts(user, status)` for the tests above, and add it to the helper ledger as
   ADAPTATION 4. Then fix any test that asserts the `none` state of a fresh account.
5. **App.** The worker must learn before he sends: where the bid buttons are built
   (`screens/JobDetailScreen.tsx:155, 455, 528` [N], `components/OfferComposer.tsx:361` [N]) read
   `my_payouts_status()` (`connect_onboarding.sql:351-356` [R]; reader `lib/payments/stripe.ts:230-239`
   [N]). When it is not `enabled`, show a card instead of the buttons: "Finish payout set-up first" /
   "You need a payout account before you can send offers." / button "Set up payouts" to
   `screens/PayoutsScreen.tsx`; for `under_review`: "Your payout account is under review. You can send
   offers once it is on." Same card on a hire request he received. Customer: the accept error shows
   the server sentence (accept call: `lib/offers.ts:343` [N]). Strings beside the offer copy (`lib/offerCopy.ts`).

## B15. Jobs never expire; closing a job that has offers

1. **Expiry: confirmed.** `jobs` has no expiry column (`baseline.sql:1177-1214` [R]; later columns
   `series_id`, `job_number`, `late_minutes`, `late_reported_at`, `needed_today`, `pricing_mode` [R]);
   the feeds and the open-job policy filter only `status = 'open'` and `visibility = 'open_market'`
   (`baseline.sql:2427-2428, 2670-2671, 2710-2711, 7303` [N]); no schedule touches jobs
   (`20260910000000_settlement_schedules.sql:163-168` [N]).
   **"Owner cannot close a job that has offers": not confirmed, already fixed** (batch A, C1,
   `docs/lean/AUDIT-LEDGER.md:42` [R]). `cancel_job()` admits an open job for its customer
   (`lean_v1.sql:413-422` [N]); the app shows "Cancel job" on an open job with bids
   (`screens/ClientJobDetailScreen.tsx:1579-1593` [N]) and "Delete job" on one with none
   (`hooks/useJobOwnerActions.ts:102` [R], `components/JobOwnerActions.tsx:72` [R]).
   One gap, not investigated: Delete uses `job_offer_count()` (`useJobOwnerActions.ts:67` [R]) and
   Cancel uses the screen's `bids.length`. If the count includes withdrawn or declined offers and the
   list does not, a job whose only offers are dead shows neither button.
2. **Root cause.** Nothing ever closes an open job but its owner.
3. **Fix.** New function `expire_open_jobs(p_now timestamptz default null)` (`service_role` only), run
   every hour. It closes a job with `status = 'open'` and `visibility = 'open_market'` when:
   - it has a date and now is more than 24 hours past `job_window_end(job)`; or
   - it has no date and was posted more than 30 days ago (`created_at`).
   Close = `status = 'cancelled'`, `cancel_reason = 'expired'`, `cancelled_by` null, same columns as
   `cancel_job()`. Pending offers are declined by the existing trigger `jobs_settle_offers_on_cancel`
   (`baseline.sql:6746` [R], body :4810-4844 [N]). The owner is told: "Your job was closed" /
   "<title>: no worker was hired in time. Post it again when you are ready."
   No feed, view or policy changes: a cancelled job already leaves them. Drafts are not touched.
   Owner close: if the gap in item 1 is real, show "Cancel job" on every open job where Delete is not
   offered (app only; the server already allows it).
4. **Tests first** (`supabase/tests/360_open_job_expiry.sql`; all fail today: no such function):
   - X1 dated open job: `p_now` 23 hours past the window end, still open; 25 hours past, `cancelled`
     with `cancel_reason = 'expired'`.
   - X2 undated open job: at +29 days open; at +31 days cancelled.
   - X3 a pending offer on the expired job is `declined`.
   - X4 assigned, in-progress, completed, draft and direct jobs are never touched.
   - X5 `authenticated` and `anon` cannot execute it. X6 `install_lifecycle_schedules()` exists, is
     `service_role` only, and returns its skip text on the local stack (no pg_cron).
5. **App.** None required (a closed job reads as cancelled). Optional reason label: see B4 item 5.

## E6. Test accounts pile up open "side" jobs

1. **Cause confirmed from code; the count (36) was not checked** (a run never contacts staging).
   Flow 02 posts a side job each run (`.maestro/02-customer-post-job.yml:172-246` [R]); flows 03 and 04
   put offers on it (`03-worker-discover-bid.yml:114-175` [R], `04-customer-accept-pay.yml:95-106` [R]);
   once an offer row exists Delete is refused (`baseline.sql:829-835` [N]); flows 02, 03, 04 and 09
   never cancel it. Flows 05 to 08 and 10 were not read.
2. **Root cause.** B15, and no flow closes what it posts.
3. **Fix.** (a) B15's sweep closes the old ones by itself, no data fix. (b) In flow 06, after the
   "decline $42" step (`.maestro/README.md:10` [R]): open the side job, tap "Cancel job", confirm
   (labels 'Cancel this job?' / 'Cancel job' / 'Keep job', `lib/moneyCopy.ts:166` [N]). Read flow 06 first.
4. **Tests.** The new flow step asserts the side job reads cancelled; `360_open_job_expiry.sql` covers (a).
5. **App.** None.

## Migration files, in order (20261112020000 to 20261112025900)

Each file is one transaction, additive, with revoke and grant restated for every function.

1. `20261112020000_lifecycle_shared.sql`
   - `jobs_cancel_reason_known` (today `stripe_foundation.sql:389-391` [N]) replaced to allow also
     `worker_no_show`, `unpaid`, `expired`: the remove-if-exists-then-add form of
     `20261003000100_ban_refund.sql:27-31` [N].
   - `worker_payouts_ready(p_user uuid) returns boolean`: `coalesce((select payouts_enabled from
     public.payment_accounts where user_id = p_user), false)`. Stable, security definer; `service_role` only.
   - `job_window_end(p_job public.jobs) returns timestamptz`: null with no date, else
     `(scheduled_date::timestamp + make_interval(hours => coalesce(arrival_end_hour, 24)::int)) at time
     zone 'America/New_York'` (the formula of `lean_v1.sql:443` [N]). One shared derivation for B4, B8, B15.
2. `20261112020100_payouts_gate.sql` (B11): `create or replace` of `accept_offer(uuid)`,
   `create_offer(…13 parameters…)`, `counter_offer(uuid, integer)`: bodies copied from the newest
   definition, plus the gate lines only. Same signatures, so no signature removal is needed.
3. `20261112020200_worker_no_show.sql` (B8): `create or replace` of `cancel_job(uuid, text)` with the
   free case and `job_window_end()` in place of the inline formula.
4. `20261112020300_unpaid_hire_release.sql` (B4): `release_unpaid_hires(timestamptz)`; new comment on
   table `job_agreements`.
5. `20261112020400_open_job_expiry.sql` (B15): `expire_open_jobs(timestamptz)`;
   `install_lifecycle_schedules()` copied in shape from `install_settlement_schedules()`
   (`settlement_schedules.sql:141-172` [N]: skips with a notice when pg_cron is absent, replaces only its
   own job names): `release-unpaid-hires` at `*/15 * * * *`, `expire-open-jobs` at `7 * * * *`; then one
   call of the installer.

Then `npm run db:types` (new functions; no table shape change).

## Objects replaced or altered (for ordering with the other groups)

- Functions replaced: `accept_offer`, `create_offer`, `counter_offer`, `cancel_job`.
- Functions new: `worker_payouts_ready`, `job_window_end`, `release_unpaid_hires`, `expire_open_jobs`,
  `install_lifecycle_schedules`. Two new cron jobs.
- Constraint replaced: `jobs_cancel_reason_known` on `jobs`. Comment replaced: table `job_agreements`.
- Rows written by the new paths: `jobs`, `job_offers` (accepted to expired), `payments` (unfunded to
  voided), `job_agreements` (one row removed per re-opened job), `messages`, `notification_outbox`.
- Not touched: every view and policy; `expire_unfunded_payments`, `begin_job_payment`,
  `apply_payment_event`, `transfers_due`, `refunds_due`, `resolve_job_dispute`,
  `payments_refund_reason_known`, `payments_release_reason_known`, `transition_job_status`,
  `can_delete_own_job`, `update_job_details`, `jobs_within_radius`, `jobs_in_cell`, `job_hotspots`,
  `job_locations`, every repeat-job function.
- Money group (built before): if it replaces `cancel_job`, `accept_offer`, `create_offer` or
  `counter_offer`, copy ITS body, not the older one named here. Privacy group (built after): if it
  replaces one of the four, it must keep the gate lines and the no-show case.
- Other files: `supabase/tests/_helpers.sql`; four new pgTAP files (use the next free numbers after the
  money group's); `tests/cancelJob.test.mjs`; `lib/paymentRules.ts`, `lib/moneyCopy.ts`,
  `lib/offerCopy.ts`, `lib/jobLifecycle.ts`; `screens/JobDetailScreen.tsx`, `components/OfferComposer.tsx`,
  `screens/ClientJobDetailScreen.tsx`, `screens/CheckoutScreen.tsx`, `screens/WorkerJobScreen.tsx`;
  `.maestro/06-customer-approve-review.yml`; `types/database.ts`; `docs/ARCHITECTURE.md` (lifecycle);
  the invariant line in `CLAUDE.md` (a server un-hire is a new status move: assigned back to open).

## Effect on the phone tests and on the installed test build

- **B11 needs one owner step first.** Test worker B must have payouts on in Stripe test mode on
  staging before file 2 lands. Nothing in the repo shows it has: flow 09 accepts every payout state
  (`.maestro/09-worker-profile-payout.yml:49` [R]) and Stripe onboarding is not driven
  (`.maestro/README.md:17` [R]). Without it flow 03 stops at "Send bid" (it asserts "Could not place
  bid" is not visible, `03-worker-discover-bid.yml:68-70` [R]) and 04 to 07 and 09 lose the main job.
  Step: sign in as B (build 10 works), Profile, Earnings & payouts, finish Stripe's test set-up, open
  Payouts once more so the status is recorded. No flow file changes.
  Old build: the worker has no card; he gets the server sentence in the bid error alert (to confirm:
  `lib/errorMessage.ts` was not read). Pending bids from workers without payouts cannot be accepted
  and the customer reads the sentence.
- **B4.** Flow 04 pays within minutes: not affected. On the first sweep every old unpaid hire on
  staging is released or closed and both test accounts get notifications (flow 08's feed gets longer;
  flow 10 sees fewer blockers; both tolerate it). Old build: a re-opened job is simply open; a checkout
  on a released job gets "Accept an offer before protecting a payment" (`stripe_foundation.sql:567` [R]).
- **B8.** No flow that was read cancels after the window (05 to 07 not read). Old build: its cancel
  preview can show a fee the server no longer takes; the result reads the ledger. In the customer's favour.
- **B15.** The main job is posted "Today, Morning" (`02-customer-post-job.yml:129-135` [R]), often after
  that window is over. This is why a dated job closes 24 hours after the window, not at its end: a
  90-minute run is safe. The side job has no picked date ("Need it today" is tapped at :234 [R]; what
  that sets was not read); either rule gives it at least 24 hours. The piled-up side jobs close on the
  first sweeps, one notification each to account A. Old build: a closed job reads as cancelled.
- **E6.** One new step in flow 06 (above).

## Staging scan

No file is flagged. The five files hold only: `create or replace function`, the constraint
replacement (not one of the scan's seven shapes, `scripts/staging-scan.sh:229-237` [N]), `comment on`,
`revoke`, `grant` and one `select` of the installer. The only row removal (the `job_agreements` row)
is inside the body of `release_unpaid_hires`, which the scan strips. Two cautions for the builder: use
dollar-quote tags without digits (`$$`, `$fn$`, `$cron$`), because a tag with a digit is not stripped
[N]; and keep the scan's words out of `comment on` texts, because string text outside a body is not
stripped. Run the scan on each file before the commit, as B1 did (`docs/critical/tip-settlement.md:144-145` [R]).

## New numbers and choices

| What | Value | Why |
|---|---|---|
| Time to pay after a hire | 24 hours, counted from the hire; a started checkout keeps its own 24 hours (about 48 at most) | Reuses the funding window (`stripe_foundation.sql:616` [R]); the time the checkout screen shows stays true |
| Release sweep | every 15 minutes | Same as `expire-unfunded-payments` (`settlement_schedules.sql:163-168` [N]) |
| Worker no-show line | arrival window end, plus the worker's reported delay (10, 20, 30 min) | Same formula as "Customer wasn't there" (`lean_v1.sql:443` [N]); the delay is the worker's own number |
| Dated open job closes | 24 hours after its arrival window ends | 24 hours reused; keeps same-day jobs and the phone tests alive |
| Undated open job closes | 30 days after posting | NEW number; no existing one was found (docs not searched) |
| Expiry sweep | every hour, minute 7 | NEW; an hour of slack is harmless |
| New cancel reasons | `worker_no_show`, `unpaid`, `expired` | Server-written only |
| Re-open or close (B4) | re-open a plain open-market job whose time is ahead; close a hire request, a repeat visit, a job whose time has passed | Nothing to return to in those three cases |
| Payout gate | at offer, counter and hire | The customer never sees an offer he cannot accept |

## Open questions, with the recommended answer

1. B4: re-open, or always close? The orchestrator asked for re-open; it is the riskier path (it must
   undo every trace of a hire). **Recommended: as designed.** Fallback if the review finds a hole:
   always close with reason `unpaid` (leave out step c); the customer posts again with "Reuse a past
   job" (`.maestro/README.md:10` [R]).
2. B4: tell the earlier bidders the job is open again? **No, not in this run** (backlog).
3. B11: let a worker without payouts still send offers and block only the hire? **No: block both.**
   It costs the one-time set-up for test worker B.
4. B11: allow a hire request to a worker with no payout account? **Yes**; he cannot accept until done.
5. B8: count the worker's reported delay before calling it a no-show? **Yes.**
6. B8: a worker who taps "arrived" without coming keeps the fee, and the customer has no report path
   on a job that never completed (`open_job_dispute` needs a completed job, `baseline.sql:3705-3764`
   [N]). **Leave for now; add to the ledger.**
7. B15: 30 days for a job with no date, 24 hours after the window for a dated one? **Yes.**
8. The first sweep on staging closes or releases many old test jobs, one notification each. **Accept.**
9. Production must have pg_cron on before these files, or neither sweep ever runs (the installer only
   prints a notice: ledger B7). **Owner or orchestrator step; check after applying.**

## Not investigated (the builder checks these first)

- Nothing was run. Every claim above is from reading code. [N] quotes were not re-checked.
- Not read: flows 05, 06, 07, 08, 10; `supabase/functions/connect-status` and `connect-onboarding`;
  `lib/offers.ts`, `lib/errorMessage.ts` (does a raised sentence reach the user as written?),
  `lib/runningLate.ts`, `lib/moneyCopy.ts`, `lib/offerCopy.ts`, the worker bid screens, `PayoutsScreen`;
  pgTAP files 010, 020, 060, 080, 150, 270 (copy their style and how they make a window pass);
  `docs/DECISIONS.md`, `docs/BACKLOG.md` (search for an existing expiry number before using 30 days).
- B4 re-open, before building: read `jobs_live_card` (`20260930001300_live_card.sql:213` [R], fires on
  a status change) and `jobs_worker_semantic_stale` (`baseline.sql:6750` [R]) for a null worker; check
  whether anything sets the old column `jobs.accepted_bid_id` (`baseline.sql:1187` [R]) and clear it
  too; check `mark_worker_arrival` (`baseline.sql:2757-2791` [N]) for other per-hire marks; confirm
  that `counter_offer` and `accept_offer` have no newer definition.
- Notifications: read `enqueue_notification` (`20260930000800_quiet_hours.sql:99` [N]) for the dedupe
  rule and any list of allowed types; if a list exists, use the existing `job_cancelled` type for the
  closes. The "you are hired" push is keyed `job_assigned:<job>:<worker>`
  (`20261003000800_job_completed_copy.sql:14-53` [N]): a re-hire of the same worker on a re-opened job
  may send no push.
- `needed_today` (`20260930000600_needed_today.sql:48` [R]): does it set a date? It decides which expiry
  rule a "Need it today" job with no picked date gets.
- Repeat jobs: only the trigger was read (`hire_from_push.sql:142-236` [R]). The design keeps the sweep
  away from them (closed, never re-opened), but an expired first visit stops its series
  (`job_series.sql:552-555` [R]): confirm that is wanted.
- `job_offer_count()` against the screen's bid list (B15 item 1).
- Whether test worker B has payouts on at staging.
