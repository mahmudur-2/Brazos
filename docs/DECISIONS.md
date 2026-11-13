# DECISIONS: the rules the code follows

One row per decision in force: money, offers, lifecycle, security, scope, platform, testing. A row
that replaces another deletes it and names it. Taste and layout choices are not listed; the code
and `tests/` are their record. Full history of every ruling up to 2026-11-07 is in git
(`git log -- docs/DECISIONS.md`, tag `pre-lean-2026-11`).

- To add a decision: append `| D-<yyyymmdd>-<k> | <date> | <decision> |`, `k` a serial within the date.
- The standing decisions D-1 to D-15 of the old roadmap are the `D-v3-` rows. Two numbers are not
  carried: D-12 (Android ships) and D-13 (runs push to `mainexpo`).
- A taste decision (colour, asset, spacing) is never reversed within 48 hours of its date.
- Budget: 40,000 bytes (`tests/docsBudget.test.mjs`).

| ID | Date | Decision |
|-|-|-|
| D-20261108-1 | 2026-11-08 | Payments mode is `stripe` or `disabled`; there is no practice-money path. Unset or any other value is `disabled`. TestFlight builds use Stripe test-mode keys. |
| D-20261108-2 | 2026-11-08 | Nothing may depend on AI: no AI or LLM screen, edge function or dependency. Semantic search and message translation are backlog items that stay off by rule. |
| D-20261108-3 | 2026-11-08 | iOS only. No Android or web/PWA config, and no `*.web.*` file. |
| D-20261108-4 | 2026-11-08 | Both themes stay: light and dark are both shipped, both tested (`tests/themeResolution.test.mjs`, `tests/themeTokens.test.mjs`). |
| D-20261108-5 | 2026-11-08 | The lock-screen live card is out of v1 and in `docs/BACKLOG.md` (item 1): it needs `expo-live-activity` and APNs keys. |
| D-20261108-6 | 2026-11-08 | Staging migrations reach staging only through the pipeline (push to `mainexpo`, owner's click for a destructive file). The migration that cut v1 (`20261108000000_lean_v1.sql`) is applied to staging only on the owner's click, after a backup. Production changes only through the Production button (D-20261111-2), never by a chat. |
| D-20261108-7 | 2026-11-08 | No feature flags: the flag table and its functions are gone; a feature ships or is removed. |
| D-20261108-8 | 2026-11-08 | Out of v1, now in `docs/BACKLOG.md`: saved workers, portfolio, work checklist, live location and Track worker, voice and document messages, translation, read ticks, reactions, inbox archive and mute, semantic search, the search mic (Post Job dictation stays), price guidance, analytics (PostHog), i18n. |
| D-20261108-9 | 2026-11-08 | TestFlight builds use the `testflight` profile: store distribution, staging backend (EAS environment `preview`), Stripe test key, bundle id app.brazos.mobile. `production` builds against the new production project (D-20261111-1). |
| D-20261108-11 | 2026-11-08 | The Maestro e2e workflow signs in with two Supabase test phone numbers (fixed codes, no SMS) and runs on manual dispatch only. `graphify-out/` is a local, regenerated code map and is git-ignored. |
| D-20261108-12 | 2026-11-08 | For v1 the `avatars` and `job-photos` buckets are public (the privacy policy says so) and `chat-photos` stays private. Completion and review photos move to signed URLs in v1.2 (`docs/BACKLOG.md`, Security). |
| D-20261111-1 | 2026-11-11 | Production is a new, empty Supabase project. The old one is retired: paused, never contacted, refused by every tool (`RETIRED_PRODUCTION_REF` in `scripts/supabase-ref.mjs`). The new ref is the `production` environment's secret; it is `PRODUCTION_REF` in `scripts/supabase-ref.mjs`, and the build gate (`scripts/eas-build-pre-install.mjs`) pins the `production` profile to it (2026-11-13). |
| D-20261111-2 | 2026-11-11 | Production changes only through `.github/workflows/production.yml`: the owner starts it and approves its plan job, then its apply job; a chat never starts, approves or re-runs it. Every step is safe to repeat. Replaces D-20261011-1; critical folders stay listed in `CLAUDE.md`. |
| D-20261111-3 | 2026-11-11 | Production takes test money only until a dated decision says otherwise: the button refuses a Stripe key that does not start with `sk_test_` and makes a Stripe test webhook. |
| D-20261111-4 | 2026-11-11 | Production sign-in is by phone, through Twilio Verify; email sign-in is off; a password has at least 8 characters (`scripts/production-auth.json`). |
| D-20261111-5 | 2026-11-11 | A hire with no money on it is closed by the server 24 hours after the hire (`close_unpaid_hires`, every 15 minutes; a started checkout keeps its own 24 hours, so about 48 hours at most): cancel reason `unpaid`, closed by nobody, each side told once with no amount; nothing is re-opened (ledger B4). |
| D-20261111-6 | 2026-11-11 | An open market job nobody is hired for is closed as `expired` 24 hours after its arrival window ends, or 30 days after posting when it has no date (`expire_open_jobs`, hourly); its pending offers are declined; drafts, hire requests and hired jobs are never touched (ledger B15). |
| D-20261111-7 | 2026-11-11 | A held, dated job whose worker never marked arrived is closed 24 hours after the window end plus the worker's reported delay (`close_no_show_hires`, hourly): full refund, no transfer, no fee, cancel reason `worker_no_show`. A notice never says "refunded in full" while a card dispute holds the refund (ledger B24). |
| D-20261111-8 | 2026-11-11 | A customer who cancels after the worker missed the arrival window (assigned, never marked arrived, dated, past the window end plus `late_minutes`) pays no fee: the whole charge is refunded and the job records `worker_no_show`, a reason no client can send (ledger B8). |
| D-20261111-9 | 2026-11-11 | A worker whose payouts are not on (`payment_accounts.payouts_enabled`; no row is off) cannot send, counter or accept an offer, and cannot be hired, whoever accepts. The customer's counter is not gated; a hire request to him is still sent, and he can only decline it. The gate does not read a build's payments mode (ledger B11). |
| D-20261111-10 | 2026-11-11 | The hired worker reads the exact address (`job_locations`) only while the job is `assigned` or `in_progress`; the customer's read is unchanged (ledger B3). |
| D-20261111-11 | 2026-11-11 | `job-photos`: a person lists their own `postings/` and `reviews/` folders; a job's folder is listed only by its customer and hired worker; completion files are added or removed only while the job is `in_progress`. The bucket stays public for `getPublicUrl` (D-20261108-12; ledger B9). |
| D-20261111-12 | 2026-11-11 | Abuse limits (ledger B10). A message and a report description hold at most 2,000 characters. Per account, in fixed windows: 30 messages a minute, 10 open-market posts an hour, 30 offers an hour, 10 reports a day; only a person's own write counts. The four payment functions allow per account per hour: `create-payment` 150, `payment-methods` 600, `connect-onboarding` 100, `connect-status` 300, then HTTP 429; a fault in that check never stops a payment. |
| D-20261111-13 | 2026-11-11 | A ban records the account's sign-in phone (`auth.users.phone`) in `banned_phones`, which outlives a deleted account, so the same phone cannot sign up again. While phone sign-in is live, no control opens the email sign-up (ledger B12). |
| D-20261111-14 | 2026-11-11 | The ledger records what Stripe did: `received_cents`, `refunded_cents` (it only rises), `chargeback_cents`, and one `payment_transfers` row per transfer. A job payment charged another amount stays held and is never sent. A card dispute's block clears only when it closes `won` or `warning_closed`; a lost dispute waits for a person. `payment_intent.payment_failed` changes nothing and is not subscribed. A reversed tip waits for the owner's `resolve_tip(id, 'send' or 'refund')` (ledger B13, B17, B20, B22). |
| D-20261111-15 | 2026-11-11 | Settlement sends: one attempt = one key (`tr:<id>:<attempt>`, `rf:<id>:<attempt>`); the database is asked before each send and every answer is written back at once; a key first used 23 hours ago is used again only by the owner (`record_settlement_sent` or `settlement_send_reopen`). The queues send only money that is there (status, card dispute, amount received, money left, no live transfer). `payment_attention` (service role) lists every row the system will not move (ledger B16, B18). |
| D-20261111-16 | 2026-11-11 | `supabase/functions/_shared/` holds two modules. `serviceAuth.ts` reads the keys (the new key named `default` first, the legacy key as fallback) and holds the two caller checks: `requireServiceRole` (POST only, constant time) for `send-push`, `send-receipts` and `process-settlements`; `verifiedUser` for the four user functions. `rateLimit.ts` holds the payment functions' hourly limit. `verify_jwt` is explicit in `supabase/config.toml`. Replaces D-20261108-10. |
| D-20261111-17 | 2026-11-11 | A database built from the migrations ends with the tested rights whatever it started as: a new function in `public` gets no default EXECUTE (postgres only), and every right a new cloud project's defaults add is revoked (`20261112050000_access_start_state.sql`, ledger ACL). |
| D-v3-1 | v3 | Bidding is sealed: a worker sees that other offers exist and their count, never a competitor's amount, before or after bidding. Customers see all offers. No worker-facing surface, RPC, view, log or push copy reveals another worker's amount; enforcement belongs in RLS, not only in a screen. |
| D-v3-2 | v3 | Vocabulary: "held in protection" in copy, code and docs. The fee is named Brazos Protection. |
| D-v3-3 | v3 | Rates: 750 bps customer, 750 bps worker, $1.00 worker-side minimum; tips carry the customer side only and the worker keeps 100% of every tip; a rate change is a new `fee_schedule` row with a future `effective_from`, never an UPDATE. |
| D-v3-4 | v3 | All-in display: every customer surface shows `charge_amount_cents` as the price, at least as prominently as any other number; `quote_job_price()` is the only arithmetic; no literal rate in a component; the total never rises between the offer card and checkout; the worker sees all three numbers on their own offer. |
| D-v3-5 | v3 | Capture at hire; separate charges and transfers; the ledger is the state machine and provider events move it through one idempotent function; no work before the ledger says `held`, and the gate lives in `transition_job_status()`. |
| D-v3-6 | v3 | Change orders: no `adjustment` payment kind; renegotiate before funding; after funding the top-up rides the tip rail. |
| D-v3-7 | v3 | A cancelled job is terminal; a no-show claim moves no money until resolved; resolution is service-role only. |
| D-v3-8 | v3 | Applied migrations are never rewritten; new evidence gets a new corrective migration. |
| D-v3-9 | v3 | Edge-function house style: plain `fetch`, no client library, no import map, no shared module (exception: D-20261111-16); a function may import its own sibling `.mjs` file of pure logic, which a Node test runs (`verify.mjs`, `classify.mjs`, `page.mjs`, `receipt.mjs`). No edge function computes an amount. |
| D-v3-10 | v3 | The iPhone end-to-end workflow (`.github/workflows/e2e-ios.yml`) runs on manual dispatch (optionally a tag push), never on a branch push: a metered macOS build per commit is the one unbounded meter. |
| D-v3-11 | v3 | The client is typed: `lib/supabase.ts` is `createClient<Database>` over `types/database.ts`, regenerated with `npm run db:types` in the same commit as any migration that changes a table, view, enum or function signature. SQL that filters on status allow-lists what it accepts. (This corrects the old row, which said the client stayed untyped.) |
| D-v3-14 | v3 | At least one completion photo is required to mark a job complete, unless the owner says otherwise. |
| D-v3-15 | v3 | `payout.paid` is deliberately unhandled; the ledger stops at `released`; `paid_out` stays in the enum. |
| D-20260831-1 | 2026-08-31 | iOS is the only release target (the old "Android stays buildable" half is replaced by D-20261108-3). |
| D-20260831-2 | 2026-08-31 | Reviews are double-blind: hidden until both sides write, or 7 days, whichever comes first. |
| D-20260831-3 | 2026-08-31 | Review writing window: 30 days from job completion, separate from the blind window. |
| D-20260831-4 | 2026-08-31 | Two reputations per person (worker, customer), derived per review, no role column. |
| D-20260831-5 | 2026-08-31 | A new rating shrinks to the platform prior; shown as "New" under 3 revealed reviews. |
| D-20260831-6 | 2026-08-31 | Would-you-hire-again is captured per review; rehires are counted; workers see client stats. |
| D-20260831-7 | 2026-08-31 | The legacy mixed rating aggregate (`recompute_profile_rating`, `profiles.rating_avg`, `rating_count`) stays untouched and read by no display. |
| D-20260901-1 | 2026-09-01 | One rating number is shown everywhere (`shown_average` or "New"); the raw average is never shown. |
| D-20260901-3 | 2026-09-01 | Skipping would-you-hire-again stays legitimate: NULL is valid, no Skip control. |
| D-20260901-4 | 2026-09-01 | The review section shows the other person's first name only, in both roles. |
| D-20260901-8 | 2026-09-01 | The retired production ref appears only in the guard machinery (`CLAUDE.md`, `.claude/settings.json`, `scripts/supabase-ref.mjs`, the tests that guard them); other docs say "the retired production project". The new project's ref lives in the `production` environment's secret, and in `scripts/supabase-ref.mjs` (`PRODUCTION_REF`) for the build gate (D-20261111-1). |
| D-20260901-9 | 2026-09-01 | Real secrets live only under `%LOCALAPPDATA%\BRAZOS\`; `.env` holds client-public values only. |
| D-20260902-1 | 2026-09-02 | The money walk is one Maestro flow against two staging accounts. |
| D-20260902-2 | 2026-09-02 | Maestro: dismiss the keyboard after every typed field; a silent wait asserts the screen's own error text and fails in 30 s. |
| D-20260902-3 | 2026-09-02 | Maestro: `hideKeyboard` after single-line fields; a static-label tap after multiline fields. |
| D-20260903-1 | 2026-09-03 | The Maestro worker fixture is Connect-onboarded once, in Stripe test mode, by the owner; the flow never opens payout setup. |
| D-20260904-n3-1 | 2026-09-04 | Auto-release gates on the customer being told (a notification row exists), not on push delivery; 7-day hard fallback. |
| D-20260904-n1-1 | 2026-09-04 | Nearby alerts default on for every user; the one-tap opt-out stays. |
| D-20260904-n1-3 | 2026-09-04 | `accepting_work` defaults on for new profiles. |
| D-20260904-n1-5 | 2026-09-04 | The worker's three offer numbers come from the server's `quote_job_price()`, never a client-side rate. |
| D-20260905-1 | 2026-09-05 | The 10-user TestFlight cohort runs on staging with test money; production is set up by the Production button, with test money only (D-20261111-3). |
| D-20260905-2 | 2026-09-05 | Posted-price choice at posting is in v1: the customer picks a posted price or open bids (not Instant Book). |
| D-20260905-3 | 2026-09-05 | Support contact is brazosmvp@gmail.com, one mailto row on Profile. |
| D-20260930-1 | 2026-09-30 | In v1: running-late chips (10, 20, 30 minutes), the "Need it today" toggle, and the Post-a-job dictation mics (title and description). |
| D-20260930-3 | 2026-09-30 | Quiet hours run midnight to 6 am, off until each person turns them on; category posting questions (2 to 4 each). |
| D-20260930-4 | 2026-09-30 | In v1: the post-release receipt email, hire from the push, repeat jobs (first refusal, not a calendar). |
| D-20260930-5 | 2026-09-30 | Repeat visits: weekly, biweekly or monthly; a 24-hour first refusal to the same worker 3 days ahead; either side can stop or drop; every visit is its own job through `accept_offer()` and `transition_job_status()`. |
| D-20260930-6 | 2026-09-30 | Hire from the push: the button reads "Accept & pay"; a tap opens an in-app confirm (never pays silently); a declined saved card alerts in-app and pushes a Checkout link. |
| D-20260930-7 | 2026-09-30 | The receipt email goes through Resend's HTTP API, card payments only; "skipped" until `RESEND_API_KEY` and `RECEIPT_FROM` are set. |
| D-20260930-8 | 2026-09-30 | Repeat-job refusals and posts go out 9 am to 9 pm New York only; too-close visits skip; moving or cancelling the first visit moves or ends the series. |
| D-20261003-2 | 2026-10-03 | A legal-gate failure admits only on-device proof that the server confirmed this account accepted the current Terms and Privacy; otherwise it fails closed; sign-out always works locally. |
