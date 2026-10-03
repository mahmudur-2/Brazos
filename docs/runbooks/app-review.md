# Runbook — get Apple's reviewer through post → bid → pay

**Who:** the operator, by hand, before each App Store submission (FIX-RUN B4, 2026-10-03).
**Why:** Apple rejects a marketplace its reviewer cannot walk end to end. One account cannot both
post a job and bid on it (`jobs.client_id <> bidder` is enforced), so the reviewer needs two.

Nothing here is applied by a run. Every step below touches the production project, which only
the operator contacts. Credentials never enter this repository: they live in App Store Connect
(App Review Information → Sign-in required) and in the operator's own store
(`%LOCALAPPDATA%\BRAZOS\`).

## 1. Bring the production project up to date

Copy these migrations to the production project, in filename order, through the operator's own
session — the same hand-apply as every production migration (CLAUDE.md §Supabase):

- `20260930000600_needed_today.sql` through `20260930001300_live_card.sql` (eight files);
- this run's: `20261003000000_settlement_queue_ready.sql` through
  `20261003000700_ugc_moderation.sql` (eight files), plus any later file in
  `supabase/migrations/` that production does not list yet.

Prove it with `node scripts/verify-schema.mjs` pointed at production by the operator, never with
"SQL editor success".

## 2. Choose the build's settings

| Setting | Choose | Why |
|-|-|-|
| `EXPO_PUBLIC_PAYMENTS_MODE` (EAS `production` environment) | `stripe` | The card path, the one Apple must see. Unset resolves to `disabled` on a release build and the reviewer could not pay. |
| Stripe keys on the production project | Test-mode keys until Stripe live activation is approved; live keys after | With test keys the reviewer pays with Stripe's test card and no real money moves. The card path shows no "Test mode" label (those belong to sandbox mode), so the Review Notes below are where the reviewer reads it. |
| `EXPO_PUBLIC_PHONE_AUTH_MODE` | `disabled` (or unset) | No SMS service is provisioned. Welcome's buttons then open the email screens (B2). |
| Receipt email (`RESEND_API_KEY`, `RECEIPT_FROM`) | Set if the domain exists; otherwise leave unset | Unset, receipts are skipped and logged; nothing else waits on them. |

## 3. Create the two demo accounts

Sign up in the production app itself, by email, so each account goes through Setup and accepts the
current Terms and Privacy:

- **Demo customer** — starts in "Hire help".
- **Demo worker** — starts in "Find work"; in Earnings & payouts, finish Stripe's payout
  onboarding in test mode (Stripe's test values for identity and bank), so a release can land.

Record both logins in App Store Connect only.

## 4. Seed one job in each state

Walk them in the app with the two accounts (each step is the app's own path, so nothing is
faked):

1. **Open with a bid** — the customer posts a job; the worker bids on it. Leave it.
2. **Booked, payment held** — a second job: post, bid, accept and pay with the test card.
3. **Done, waiting for approval** — a third job: as 2, then the worker taps through On my way,
   I'm here, starts, and marks it done with a photo. Leave it unapproved.
4. **Released** — a fourth job: as 3, then the customer approves; the payment reaches the worker
   and both can leave a review.

Re-check them on the morning of submission: an unapproved job auto-releases 72 hours after the
customer was told it was done, so job 3 needs re-seeding if the review runs long.

## 5. Review Notes (paste into App Store Connect)

> Brazos is a local-services marketplace: a customer posts a job, workers bid, and accepting a
> bid pays for the job. The payment is held until the customer approves the finished work.
>
> Two demo accounts are provided: a customer and a worker (one account cannot bid on its own
> job). Jobs in each state are already there.
>
> Payments run in Stripe test mode: when asked for a card, use 4242 4242 4242 4242, any future
> expiry date, any CVC and any ZIP. No real money moves.
>
> To try the whole loop: as the customer, open the job with a bid in My Jobs, compare bids,
> accept one and pay. As the worker, open that job, tap through the stages and mark it done. As
> the customer, approve — the payment is released to the worker.
>
> Reporting and blocking: every job post, profile, review and portfolio photo has "Report"; the
> report sheet can also block the person. Chats and the inbox have Report and Block in their
> menus. Posts, bios, service listings, bids, reviews and messages are checked against a word list
> on the server.
>
> Account deletion: Profile → Account & safety → Delete Account.
>
> Support: Profile → Contact support, or the Support tab of the inbox.

## 6. After approval

Switch Stripe to live keys only once live activation is approved, then re-run section 4 with a
real card on a private account before inviting anyone.
