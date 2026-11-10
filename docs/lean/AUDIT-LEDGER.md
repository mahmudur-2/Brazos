# Audit ledger: every flaw found before production, and where it stands

Started 2026-11-10 by the orchestrating chat (Opus). Lenses: release readiness, client app, backend,
CEO/journeys (altitude), then rotating. Each finding was checked against the code by the orchestrator
before it entered this list. Status: OPEN, FIXING (batch), FIXED (commit), OWNER (needs you), LATER
(BACKLOG, with the reason). Proof column: how it was verified (code read, local DB probe, run).

## Fixed

| ID | Finding | Commit | Proof |
|---|---|---|---|
| R1 | Staging backup workflow would publish every user row and phone number to the public | G15 f45a804 | workflow read |
| R2 | e2e artifacts (video of test phone + code typing) downloadable by anyone; 22 deleted | G15 f45a804 | artifacts listed, deleted |
| R10 | `eas-cli@latest` unpinned in the job holding EXPO_TOKEN | G15 f45a804 | workflow read |
| R14 | LICENSE was Expo's MIT template (anyone could copy the app) | G15 f45a804 | file read |
| R9a | Secret scanning + push protection were off | repo setting | `gh api` shows enabled |
| E1 | Welcome taps lost on slow Macs (run 25) | F23 2cc09c2 | run 25 video |
| E2 | Inbox row: VoiceOver heard "Working, <job>" while the screen showed "Job request · needs your reply"; a card message previewed as a bare "…" | F25 2865121 | run 27 screen hierarchy + screenshot; unit test |
| E7 | Report from an inbox row's menu did nothing on iOS (opened while the menu's Modal closed) | F29 b2314da | run 31 hierarchy; run 32 flow 07 green; unit test |

## Open, found by e2e (investigate on the local stack before fixing)

| ID | Finding | Proof |
|---|---|---|
| E3 | After flow 06 approved the main job, flow 07's Inbox still derived its stage as "Working" (`in_progress`), and the job was still picked as the pair's active job | run 27 screen hierarchy (spoken label) |
| E5 | A notification opens its job in the My Jobs tab, so Back leaves the person in My Jobs, not the feed (one tap on Home returns). Opening it in place needs the job screens registered in both Home stacks: a navigation change, not done in this run | run 32 |
| E6 | Test accounts pile up open "side" jobs (36 by run 32): every run posts one and none is closed (B15: jobs never expire) | run 32 screen hierarchy |
| E4 | After flow 06 declined the worker's $42 counter, the customer's row still said "Job request · needs your reply" (`pendingByThread` still held the chain) | run 27 screenshot |

## Batch A: app fixes (Sonnet fixer, orchestrator reviews), commits `lean P1..P5`

FIXED 2026-11-10: P1 84c7d4e, P2 d7e0b04, P3 0c8aa40, P4 e5eab93, P5 98d6443 (verify 1274 pass).
Proven by unit tests only so far; the e2e run on a build that includes them is still owed.
Follow-ups found while fixing: the cancel preview in `lib/paymentRules.ts` mirrors `cancel_job()`
(rates from the hire's snapshot) — a server preview RPC in batch B would remove the mirror; the worker
cannot see when "Customer wasn't there" will appear; logout's bounded push-unregister keeps running
in the background after sign-out.

| ID | Finding | Source |
|---|---|---|
| C1 | No Cancel anywhere: `cancel_job` RPC never called; blocks account deletion (App Store 5.1.1v) | CEO#1, verified grep |
| C12 | Cancellation terms never shown before paying; "protection" reads like insurance | CEO#4,#12 |
| A1 | Crafted reset link swaps the signed-in account | client#1 |
| A4 | Recovery mode has no visible failure and no way out | client#4 |
| A9 | useProfile stale response shows account A's profile to account B | client#9 |
| A8 | No request timeout (60 s hangs; sign-out waits on push unregister) | client#8 |
| A14 | Error boundary does not cover the providers | client#14 |
| A15 | Chat offer response guarded by state, not ref (double RPC) | client#15 |
| A6 | Developer strings ("phase7 SQL") shown to users; "Saved" after failed upload | client#6 |
| A7 | Profile phone saved as typed, not E.164 | client#7 |
| A3 | Profile form: keyboard covers Save on small phones | client#3 |
| A5c | Chat composer has no length limit | client#5 |
| A12 | Money-release failure alert claims certainty it cannot have | client#12 |
| L1 | Terms promise a "mute" tool that does not exist; mention a test mode | CEO#3 |
| L2 | Terms require 18+, sign-up never asks | CEO#3 |

## Batch B: database and payment fixes (critical skill: Fable blueprint, Opus build, Fable review, local pgTAP)

DEFERRED to the next run (owner's weekly token cap, 2026-11-10). Start with B1, B5, B6, B3, B8: each
gets a pgTAP test that fails on today's schema first. Local stack works: start Docker Desktop
(`%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe`), `npx supabase start`, `npm run db:reset`,
`npm run db:test` (baseline 2026-11-10: 33 files, 1782 tests, PASS).

| ID | Finding | Source | Proof |
|---|---|---|---|
| B1 | Tips are charged and marked released but never enter `transfers_due`: the worker is never paid the tip | backend#1 | code read (create-payment has no transfer_data; tip row has no release_requested_at/transfer_cents) |
| B2 | `jobs_within_radius` accepts any origin: exact job location recoverable by trilateration | backend#2, CEO#5 | code read |
| B3 | Hired worker can read the customer's exact address forever (no status/time limit) | CEO#6 | policy read |
| B4 | Accept-then-never-pay: unfunded expiry voids payment but the job stays assigned forever | CEO#2 | code read |
| B5 | Fee math overflows int4 above ~$28.6k (ceiling is $100k): accept/pay error | backend#6 | local DB: `quote_job_price(3000000)` → integer out of range |
| B6 | Realtime publication has no tables in migrations: a fresh production project has no live chat/job updates | backend#11 | local DB: publication tables NONE |
| B7 | Cron installers skip silently; `scripts/verify-schema.mjs` (named by the rules) does not exist | backend#10 | file missing |
| B8 | Worker no-show: customer pays a cancellation fee to the worker who never came | backend#12 | code read |
| B9 | `job-photos` bucket listable by any signed-in user (home interiors) | backend#3 | policy read |
| B10 | No server length caps on messages/reports; no rate limits on RPCs and payment functions | backend#9 | code read |
| B11 | Hire possible with a worker who cannot be paid (no payouts_enabled gate) | backend#4, CEO#9 | code read |
| B12 | Ban evasion: ban uses editable profile phone; email sign-up needs no phone | backend#8, CEO#7 | code read |
| B13 | Lost chargeback does not reverse the worker transfer; disputes never expire | backend#13 | code read |
| B14 | Forged negotiation cards via direct message insert | backend#14 | policy read |
| B15 | Jobs never expire; owner cannot close a job that has offers | CEO#14 | code read |
| B16 | Possible second transfer after the 24 h idempotency window if webhooks stall | backend#7 | plausible |
| B17 | Smaller: missing indexes, payments columns over-exposed, no amount check on success, notifications never 'failed', status oracles, completion-photo deletion, ON DELETE CASCADE on payments | backend#16-22 | code read |

## Needs you (owner)

| ID | What | Why |
|---|---|---|
| O1 | Lawyer review of Terms + Privacy; then remove the "working draft" banner | shown to every user and App Review |
| O2 | Public URLs for Privacy Policy and Support (App Store Connect requires them); a support mailbox that is not personal Gmail | release#4, CEO#20 |
| O3 | Rotate the two test OTP codes again (Supabase test phones + GitHub secrets) | old public videos showed them |
| O4 | Decide the App Review payment path (live keys + review card) and remove review test phones after approval | release#5 |
| O5 | Before the first production build: `eas env:list production` shows a live Stripe key, Sentry DSN, Sentry auth token | release#6 |
| O6 | Production Supabase auth: password min 8+, email confirmation on (or email sign-up off), OTP rate limits | release#13 |
| O7 | Protect `mainexpo` (require CI) once the autonomous runs end | release#9 |

## Later (BACKLOG, reason)

Dispute operator queue and worker evidence form (CEO#10,#21), image moderation and EXIF strip (CEO#18,#23,
needs a dependency), Nominatim proxy (release#16), per-job time zones (backend#21), review weighting and
minimum price (CEO#17,#19, a pricing decision), pre-hire Q&A (CEO#8, product decision), single-step
accept-and-pay (CEO journey 1), tax documents link (CEO#24).
