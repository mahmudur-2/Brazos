# TESTING

What proves a change, from fastest to slowest. A failing test is a failure: fix the code or the
test, and say which. A test is never skipped to make a run green.

## 1. `npm run verify` (offline, every change)

`npm run verify` = `npm run lint` then `npm test`.

- `lint` is `tsc --noEmit --pretty false --noUnusedLocals --noUnusedParameters`: a strict
  type-check that also fails on unused locals and parameters.
- `test` is `node --test tests/*.test.mjs`. No test framework, no network, no database, no secrets.
- `ci.yml` runs the same command on every push and pull request to `mainexpo`.

**Many tests read source files as text.** They open a screen, a migration or a doc with
`readFileSync` and match its shape, so a fence (a rule that must never break) goes red with its
name on it when an edit undoes it. When you move, rename or delete a file, search `tests/` for its
path: a test may read it. Rules for editing a test:

- Repoint a check at the live file when the same check still makes sense.
- Delete a check only when its subject is gone for good.
- Never loosen a check about something that stays. Update its expected constant only when the
  change is deliberate and the reason is in the commit.
- A flaky test is re-run once, then fixed.

Docs have size fences too: `tests/docsBudget.test.mjs` caps `CLAUDE.md` (under 5,000 bytes),
`HANDOFF.md` (12,000) and `docs/DECISIONS.md` (40,000); `tests/governance.test.mjs` checks the
active docs for retired names and the repository for tracked secrets.

## 2. Database tests (local Docker stack only)

pgTAP files live in `supabase/tests/` (plus `seed.sql` for fixtures and storage buckets).
Docker Desktop must be running and the local stack started with `npx supabase start`.

| Command | What it does |
|---|---|
| `npm run db:reset` | rebuilds the local database from `supabase/migrations/` and `seed.sql` |
| `npm run db:test` | runs every pgTAP file in `supabase/tests/` against it |
| `npm run db:types` | regenerates `types/database.ts` from the local schema |

Always `db:reset` before `db:test`. A schema change is done when `db:reset` is clean, `db:test`
is fully green and `types/database.ts` is regenerated in the same commit. The local stack has
`vault`, `pg_cron` and `pg_net` (the last two come from `20261112000100_schedules_loud.sql`), so the
timers are installed there too and a timer that skips is an error. Identity in tests is a transaction-local role switch plus
`request.jwt.claims`. `.github/workflows/pgtap.yml` runs reset and test on a runner-started stack.
Never run these commands, or any SQL, against a remote project: `--linked`, `--db-url` and
`--project-ref` never appear in a run. Staging gets a migration only through the pipeline
(`docs/ARCHITECTURE.md`, Staging pipeline); production only through the Production button, which
only the owner starts. Its logic is tested offline: `tests/productionDeploy.test.mjs` (fake fetch,
including a search of all output for every secret in raw and encoded form),
`tests/productionWorkflow.test.mjs` (the workflow's shape) and `tests/stagingScan.test.mjs` (the
scan, run on fixture files). Staging's `prove` job runs the same schema check first.

- A local stack that has run for days can have a storage server older than its storage schema.
  Then every upload answers 500 with "database error, code: 42P10" (seen 2026-11-11: storage server
  v1.71.0 against schema step 79). Fix: `npx supabase stop`, then `npx supabase start` (no data is
  lost), then `npm run db:reset`.
- In a chat's shell the Supabase CLI sees an AI agent and prints JSON, so
  `scripts/staging-scan.sh --pending-files` and `--applied-count` stop with FATAL on its migration
  list. GitHub Actions is not affected. To get the table the scan reads:

  ```
  env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_SESSION_ID -u CLAUDE_AGENT_SDK_VERSION -u AI_AGENT npx supabase migration list --local
  ```

## 3. Maestro iPhone flows

Flows live in `.maestro/`: `01-auth.yml` … `10-account-delete.yml`, `subflows/` and `config.yaml`
(runs 01 to 10 in order). `.maestro/README.md` says what each flow proves and what is not covered.
They drive a real build of the app in the iOS Simulator against the staging project, with two
staging accounts (a customer and a worker, both Supabase test phone numbers; the worker is
Connect-onboarded once, in Stripe test mode, by the owner, and the flows never open payout setup).

- Where: GitHub's macOS runner, through `.github/workflows/e2e-ios.yml`. It runs on manual dispatch
  only (Actions → e2e iOS → Run workflow, optional `build_id`).
  It finds the latest FINISHED `e2e-test` EAS simulator build (or the `build_id`), installs it on an
  iPhone simulator, runs Maestro 2.12.1 over `.maestro/`, and uploads a junit file, debug output
  and a screen recording as artifacts. Secrets: `MAESTRO_E2E_PHONE`, `MAESTRO_E2E_OTP`,
  `MAESTRO_E2E_PHONE_2`, `MAESTRO_E2E_OTP_2` (two Supabase test phone numbers with fixed codes; no
  SMS is sent).
- The app: the `e2e-test` EAS profile in `eas.json` builds a simulator app (`ios.simulator: true`,
  `withoutCredentials`, staging environment).
- Local run: needs a Mac with Xcode and Maestro installed; `maestro test .maestro/<flow>.yml`
  against that simulator build. A Windows PC cannot run them.
- Writing flows: dismiss the keyboard after every typed field (`hideKeyboard` after single-line
  fields, a static-label tap after multiline ones); a silent wait asserts the screen's own error
  text and fails in 30 seconds.
- Each run leaves jobs titled `E2E lean` on staging (`E2E <MAESTRO_RUN_ID>` when that variable is
  set); the flows pick the newest card. No cleanup, by decision.

## 4. TestFlight (the owner's steps)

A chat never runs a production step; these are parked steps for the owner. The upload to App Store
Connect is also an owner step.

1. `npm run verify` is green on `mainexpo`.
2. `npm run release:testflight` (= `npx eas-cli@latest build --platform ios --profile testflight`,
   no auto-submit). The `testflight` profile has store distribution, `autoIncrement` and the
   `preview` EAS environment (staging Supabase), which must hold
   `EXPO_PUBLIC_PAYMENTS_MODE=stripe`, the Stripe publishable test key,
   `EXPO_PUBLIC_PHONE_AUTH_MODE=supabase`, the Sentry DSN, and the Supabase URL and key.
   `release:production` is the old production line and is not used for v1.
3. `npx eas-cli@latest submit --platform ios --profile testflight --latest`, run by the owner.
4. In App Store Connect, add the build to the internal testers group. Apple's two-factor sign-in is
   the owner's.
5. Install from TestFlight on a phone and walk the loop (section 5 below) before inviting anyone.

A new native dependency or plugin needs a new build; a JavaScript-only change can go as an
`npm run update:preview` update (run `npm run fingerprint` first if unsure).

## 5. Apple reviewer accounts

Apple rejects a marketplace its reviewer cannot walk end to end. One account cannot both post a job
and make an offer on it, so the reviewer needs two. Credentials live in App Store Connect (App
Review Information, Sign-in required) and in the owner's own store (`%LOCALAPPDATA%\BRAZOS\`),
never in this repository.

- Two test accounts on staging: a **customer** (starts in "Hire help") and a **worker** (starts in
  "Find work"; finish Stripe's payout onboarding in test mode so a release can land). Sign them up
  in the app so each accepts the current Terms and Privacy. A build with phone sign-in live offers
  no email sign-up (`screens/WelcomeScreen.tsx`), so use the test phone numbers below.
- Phone sign-in: in the Supabase dashboard (Authentication, Providers, Phone) add a test phone
  number with a fixed code, so the reviewer never needs a real SMS.
- Payments: Stripe test mode. The card is `4242 4242 4242 4242`, any future expiry, any CVC, any
  ZIP. No real money moves.
- Seed one job in each state by walking the two accounts (each step is the app's own path):
  1. open with an offer, left alone;
  2. booked, payment held (post, offer, accept, pay with the test card);
  3. done, waiting for approval (as 2, then the worker taps On my way, I'm here, starts, and marks it
     done with a photo; leave it unapproved);
  4. released (as 3, then the customer approves; both can review).
  Re-check them on the morning of submission: an unapproved job auto-releases 72 hours after the
  customer was told it was done, so job 3 needs re-seeding if the review runs long.
- Review notes to paste: Brazos is a local-services marketplace: a customer posts a job, workers
  make offers, and accepting an offer pays for the job; the payment is held until the customer
  approves the finished work. Two demo accounts are provided, with jobs in each state. Payments run
  in Stripe test mode with the card above. Every job post, profile, review and chat has Report and
  Block; posts, bios, offers, reviews and messages are checked against a word list on the server.
  Account deletion: Profile, Account & safety, Delete Account. Support: Profile, Contact support.

## 6. Server-function contract tests (TestSprite)

- What: one backend test per server function in `tests/testsprite/` (about 45 checks): a missing or bogus token, a wrong method and a bogus body each get a 4xx (never a 200 or a 404), stripe-webhook refuses every bad signature with a 400, and no response holds a secret-shaped string. No secret is sent; happy paths need a staging test user (`docs/BACKLOG.md`).
- Where: TestSprite project "Brazos staging", environment `staging`. `.github/workflows/testsprite.yml` runs them on a push to `mainexpo` that touches `supabase/functions/`, and on one click: GitHub, Actions, TestSprite, Run workflow. It reads one secret, `TESTSPRITE_API_KEY`.
- Credits: every run spends TestSprite credits for all nine tests; check `testsprite usage` before running often.
- `tests/testspriteGate.test.mjs` fences the workflow and the suite offline.
