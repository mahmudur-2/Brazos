# BASELINE (before any cleanup)

Measured 2026-11-07, lean-and-ship run, Phase A step A2+A3. Read-only. No source file changed.

## 1. Git
- `git status -sb` first line: `## mainexpo...origin/mainexpo [ahead 1]`
- `git log -1 --oneline`: `1aeeaa5 harness T38: Verify line for the verify gate`

## 2. Size
- Tracked files: **1497**
- Tracked files per top-level entry (folders, then loose root files):

| count | entry |
|---|---|
| 570 | docs |
| 171 | supabase |
| 159 | components |
| 148 | lib |
| 140 | tests |
| 54 | screens |
| 46 | dev-tools |
| 45 | scripts |
| 45 | hooks |
| 29 | assets |
| 28 | ui |
| 8 | public |
| 7 | .claude |
| 6 | modes |
| 4 | navigation |
| 3 | .maestro |
| 3 | .github |
| 2 | .eas |
| 1 each | types, hosting, config |

  Root files (1 each): tsconfig.json, package.json, package-lock.json, metro.config.js, index.ts, eas.json, babel.config.js, app.config.ts, WEB_DEPLOYMENT.md, REVIEW_GUIDE.md, README.md, PROD_VERIFY.sql, PROD_APPLY_READY.sql, PROD_APPLY.md, LICENSE, HANDOFF.md, DECISIONS.md, CLAUDE.md, BRAZOS_BUILD_STATE.md.

- Total lines of app/code files (`.ts .tsx .mjs .js .sql`, excluding dist, public, hosting, _archive): **32794**
- Tracked files under docs/: **570**
- package.json: **54** dependencies, **7** devDependencies
- File counts (tracked = on disk for all of these):
  - supabase/migrations: 35 files
  - supabase/functions: 12 folders (connect-onboarding, connect-return, connect-status, create-payment, payment-methods, process-settlements, send-live-cards, send-push, send-receipts, stripe-webhook, translate, worker-search)
  - supabase/tests: 32 files
  - tests/: 140 files
  - screens/: 54 files
  - components/: 159 files
  - lib/: 148 files

## 3. Offline check: `npm run verify`
- Exit code: **0**
- Wall time: **56 s** (test runner reported duration_ms 40941)
- Test summary: tests **1630**, suites 7, pass **1630**, fail **0**, cancelled 0, skipped 0, todo 0
- Failing tests: none
- Note: Node prints a module-type warning ("add type: module to package.json"). Not a failure.

## 4. Database tests
- Docker daemon: answers, server version 29.8.2.
- `npx supabase status` (before start): stack not running (container supabase_db_BRAZOS missing).
- `npx supabase start`: OK, about 35 s. Running: db, auth, rest, realtime, storage, kong, studio, pg_meta, edge_runtime, inbucket, analytics. Not running: imgproxy, pooler (stopped by config). The vector container was restarting (log shipper only; tests do not use it).
- `npm run db:test` run 1 (right after start, database restored from an old local backup): **exit 1**, `Files=32, Tests=1893`, 4 s test time (7 s wall), `Result: FAIL`. 16 failed assertions in 4 files. All are "one row too many" or a shown_average of 5.0 instead of the 4.5 prior, i.e. leftover rows in the restored local data. Not a schema error.
  - 040_authz.sql: test 533 "stranger: CAN read all three job photos" (have 4, want 3)
  - 080_job_completions.sql: tests 54, 60, 67 (first: "5: service - reads every row", have 2, want 1)
  - 090_reputation.sql: tests 3, 5, 28, 31 (first: "shown_average is exactly the 4.5 prior on an empty platform", have 5.0, want 4.5)
  - 120_reputation_batch.sql: tests 4, 6, 13, 22, 43-44, 59, 79 (first: same "4.5 prior" check)
- `npm run db:reset` (local only, run to clear the leftover rows): exit 0, 34 s wall (migrations applied, seed.sql loaded).
- `npm run db:test` run 2 (after reset): **exit 0**, `Files=32, Tests=1893`, 3 s test time (6 s wall), `Result: PASS`.
- **Baseline: PASS, 1893 of 1893 on a freshly reset local database.** These tests need a freshly reset database: run `npm run db:reset` before `npm run db:test`.
- Side note: the first `supabase status` error output included a "linked_project" field naming the staging project (Brazos Staging). That is only the CLI's own link record. No linked or remote command was run, and the production ref was not contacted.
- Resolved: the Docker NEEDS-JUDGE in the Flags section below is now answered (Docker running, baseline filled).

## 5. EAS
- `eas-cli whoami`: user **mah_r2** (accounts: mah_r2 Owner, mahr2s-team Owner). eas-cli 27.5.0 is available; the installed one is older (works).
- `build:list --platform ios --limit 5`: 5 builds, all FINISHED, all distribution INTERNAL (none store):

| profile | status | createdAt | appVersion / build | distribution |
|---|---|---|---|---|
| preview | FINISHED | 2026-10-03T20:17:15Z | 1.0.0 / 5 | internal |
| preview | FINISHED | 2026-10-03T18:36:17Z | 1.0.0 / 4 | internal |
| preview | FINISHED | 2026-09-30T13:32:40Z | 1.0.0 / 3 | internal |
| preview | FINISHED | 2026-09-06T18:24:11Z | 1.0.0 / 2 | internal |
| development | FINISHED | 2026-09-06T18:07:10Z | 1.0.0 / 1 | internal |

- Extra check: `build:list --platform ios --build-profile production --limit 5` returned an empty list. No production-profile iOS build has ever been created, finished or failed.
- **Apple credentials present for production profile: NO** (no finished production build proves them). The finished internal preview and development builds only show that an Apple developer setup exists for ad-hoc/internal signing. They do not prove store (production) credentials.
- No tokens or credential-bearing URLs were recorded here.

## 6. Node
- node: v24.18.0
- npm: 11.16.0

## Flags
- BLOCKED: none.
- Resolved 2026-11-07 22:00: Docker Desktop started, local stack up, section 4 filled (1893/1893 after `npm run db:reset`).
- Apple credentials for the production profile: NO (no production build has ever existed). The first TestFlight build needs the owner at the keyboard for the Apple ID sign-in + 2-factor code.
