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
`vault` but not `pg_cron` or `pg_net`, so anything reaching `cron.job` or `net.http_post` stops
there and must say so. Identity in tests is a transaction-local role switch plus
`request.jwt.claims`. `.github/workflows/pgtap.yml` runs reset and test on a runner-started stack.
Never run these commands, or any SQL, against a remote project: `--linked`, `--db-url` and
`--project-ref` never appear in a run. Staging gets a migration only through the pipeline
(`docs/ARCHITECTURE.md`, Staging pipeline); production is the owner's, by hand.

## 3. Maestro iPhone flows

Flows live in `.maestro/` (`sign-in.yml`, `money-walk.yml`, `screens-walk.yml`; Phase F adds one per
screen group). They drive a real build of the app in the iOS Simulator against the staging
project, with two staging accounts (a customer and a worker; the worker is Connect-onboarded once,
in Stripe test mode, by the owner, and the flows never open payout setup).

- Where: GitHub's macOS runner, through `.github/workflows/e2e-ios.yml` (added in Phase F). It runs
  on manual dispatch, not on every push.
- The app: the `e2e-test` EAS profile in `eas.json` builds a simulator app (`ios.simulator: true`,
  `withoutCredentials`, staging environment).
- Local run: needs a Mac with Xcode and Maestro installed; `maestro test .maestro/<flow>.yml`
  against that simulator build. A Windows PC cannot run them.
- Writing flows: dismiss the keyboard after every typed field (`hideKeyboard` after single-line
  fields, a static-label tap after multiline ones); a silent wait asserts the screen's own error
  text and fails in 30 seconds.
- Each money-walk run leaves a job titled `E2E <timestamp>` on staging (no cleanup by decision).

## 4. TestFlight (the owner's steps)

A chat never runs a production step; these are parked steps for the owner.

1. `npm run verify` is green on `mainexpo`.
2. `npx eas-cli@latest build --profile production --platform ios` (or `npm run release:testflight`,
   which adds `--auto-submit`). The `production` profile has `autoIncrement` and the `production`
   EAS environment, which must hold `EXPO_PUBLIC_PAYMENTS_MODE=stripe`, the Stripe publishable
   test key, `EXPO_PUBLIC_PHONE_AUTH_MODE=supabase`, the Sentry DSN, and the Supabase URL and key.
3. `npx eas-cli@latest submit --platform ios` if it was not auto-submitted.
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
  in the app by email so each accepts the current Terms and Privacy.
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
