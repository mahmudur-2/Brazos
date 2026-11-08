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
| D-20261108-6 | 2026-11-08 | Staging migrations reach staging only through the pipeline (push to `mainexpo`, owner's click for a destructive file). The migration that cut v1 (`20261108000000_lean_v1.sql`) is applied to staging only on the owner's click, after a backup. Production is hand-applied by the owner, never by a chat. |
| D-20261108-7 | 2026-11-08 | No feature flags: the flag table and its functions are gone; a feature ships or is removed. |
| D-20261108-8 | 2026-11-08 | Out of v1, now in `docs/BACKLOG.md`: saved workers, portfolio, work checklist, live location and Track worker, voice and document messages, translation, read ticks, reactions, inbox archive and mute, semantic search, the search mic (Post Job dictation stays), price guidance, analytics (PostHog), i18n. |
| D-v3-1 | v3 | Bidding is sealed: a worker sees that other offers exist and their count, never a competitor's amount, before or after bidding. Customers see all offers. No worker-facing surface, RPC, view, log or push copy reveals another worker's amount; enforcement belongs in RLS, not only in a screen. |
| D-v3-2 | v3 | Vocabulary: "held in protection" in copy, code and docs. The fee is named Brazos Protection. |
| D-v3-3 | v3 | Rates: 750 bps customer, 750 bps worker, $1.00 worker-side minimum; tips carry the customer side only and the worker keeps 100% of every tip; a rate change is a new `fee_schedule` row with a future `effective_from`, never an UPDATE. |
| D-v3-4 | v3 | All-in display: every customer surface shows `charge_amount_cents` as the price, at least as prominently as any other number; `quote_job_price()` is the only arithmetic; no literal rate in a component; the total never rises between the offer card and checkout; the worker sees all three numbers on their own offer. |
| D-v3-5 | v3 | Capture at hire; separate charges and transfers; the ledger is the state machine and provider events move it through one idempotent function; no work before the ledger says `held`, and the gate lives in `transition_job_status()`. |
| D-v3-6 | v3 | Change orders: no `adjustment` payment kind; renegotiate before funding; after funding the top-up rides the tip rail. |
| D-v3-7 | v3 | A cancelled job is terminal; a no-show claim moves no money until resolved; resolution is service-role only. |
| D-v3-8 | v3 | Applied migrations are never rewritten; new evidence gets a new corrective migration. |
| D-v3-9 | v3 | Edge-function house style: plain `fetch`, no client library, no import map, no shared module; the one exception is `stripe-webhook`'s `./verify.mjs`, which a Node test runs. No edge function computes an amount. |
| D-v3-10 | v3 | The iPhone end-to-end workflow (`.github/workflows/e2e-ios.yml`, Phase F) runs on manual dispatch (optionally a tag push), never on a branch push: a metered macOS build per commit is the one unbounded meter. |
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
| D-20260901-8 | 2026-09-01 | The production ref appears only in the guard machinery (`CLAUDE.md`, `.claude/settings.json`, `scripts/supabase-ref.mjs`, the tests that guard them); other docs say "the production ref". |
| D-20260901-9 | 2026-09-01 | Real secrets live only under `%LOCALAPPDATA%\BRAZOS\`; `.env` holds client-public values only. |
| D-20260902-1 | 2026-09-02 | The money walk is one Maestro flow against two staging accounts. |
| D-20260902-2 | 2026-09-02 | Maestro: dismiss the keyboard after every typed field; a silent wait asserts the screen's own error text and fails in 30 s. |
| D-20260902-3 | 2026-09-02 | Maestro: `hideKeyboard` after single-line fields; a static-label tap after multiline fields. |
| D-20260903-1 | 2026-09-03 | The Maestro worker fixture is Connect-onboarded once, in Stripe test mode, by the owner; the flow never opens payout setup. |
| D-20260904-n3-1 | 2026-09-04 | Auto-release gates on the customer being told (a notification row exists), not on push delivery; 7-day hard fallback. |
| D-20260904-n1-1 | 2026-09-04 | Nearby alerts default on for every user; the one-tap opt-out stays. |
| D-20260904-n1-3 | 2026-09-04 | `accepting_work` defaults on for new profiles. |
| D-20260904-n1-5 | 2026-09-04 | The worker's three offer numbers come from the server's `quote_job_price()`, never a client-side rate. |
| D-20260905-1 | 2026-09-05 | The 10-user TestFlight cohort runs on staging with test money; production is untouched until real money. |
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
| D-20261011-1 | 2026-10-11 | Production deploys stay manual: a production step is always a parked step for the owner, never run by a chat. Critical folders are listed in `CLAUDE.md`. |
