# Critical blueprint: the path to production (ledger B6, B7, B17 parts)

Written 2026-11-11 by Fable (critical skill, design only). Nothing here is built; this file is the only
file changed. An Opus builder continues from it and reports its plan before it writes code.

Decisions it rests on (owner, 2026-11-11):

- Production is a NEW, empty Supabase project that the owner creates. The old project (its ref is in
  CLAUDE.md) is retired and is still never contacted.
- Every production step is one GitHub workflow that only the owner starts and approves. No chat ever
  starts, approves or re-runs it. This replaces "production is hand-applied".
- Step one is test money only: Stripe test keys. Real money is a later step.
- The repo stays public and Supabase stays on the free plan for now.

Proof marks. `[2]` after a path:line: opened a second time in this task and the quote confirmed. No
mark: read once, not re-checked (the orchestrator ended the check early). `[doc S1]` and the like: a
public documentation page in the list at the end (retold, not quoted). "Not investigated": not looked at.

## Purpose

A database built only from `supabase/migrations/` must behave like staging: live updates, running
timers, and a tool that proves it. Then one button takes that proven build to the new production
project and answers PASS or FAIL in plain words.

## Rules that must never break

1. No chat starts, approves or re-runs the production workflow, and no chat contacts the production
   project. GitHub cannot tell the owner from a chat using his login, so this rule also needs deny
   lines in `.claude/settings.json` (owner only, part G).
2. Production secrets live only in the GitHub environment `production`. That environment allows only
   `mainexpo` and needs the owner's approval.
3. Apply runs only with the plan code of a dry run for the same commit and the same database state.
4. A flagged file on a database that already has applied files needs the tick box. The first run on
   an empty database does not.
5. Test money only: the workflow refuses a Stripe key that is not a test key.
6. The workflow never prints a secret, a phone number or a sign-in code. It never uses
   `--include-seed` (`supabase/seed.sql` is local test data) and never `--prune`.
7. PASS means every check passed, the fingerprint included. A skipped check is FAIL.
8. `job_locations` never joins the realtime publication.
9. The fingerprint tool refuses the retired ref, and refuses any hosted database when it is not
   running inside GitHub Actions.
10. Every exclusion from the fingerprint is written in this file with its reason.

## A. Realtime tables (ledger B6): confirmed

**Proof.** The app listens to three tables and no other (13 lines, `[2]`):

| Table | Where the app listens (event) |
|---|---|
| `public.messages` | `hooks/useConversations.ts:160` (INSERT); `hooks/useConversationChat.ts:185` (INSERT, filtered), `:200` (UPDATE, filtered) |
| `public.jobs` | `hooks/useHotspots.ts:55` (`*`); `hooks/useJobLive.ts:29` (UPDATE, filter `id`), `:32` (DELETE); `hooks/useOpenJobs.ts:76` (INSERT), `:85` (UPDATE), `:99` (DELETE); `screens/CellJobsScreen.tsx:80` (`*`) |
| `public.job_offers` | `hooks/useJobOffers.ts:180` (`*`); `hooks/useJobOwnerActions.ts:84` (INSERT, filter `job_id`), `:89` (DELETE, filter `job_id`) |

No migration puts a table in the publication: a search of every file in `supabase/migrations/` and of
`supabase/seed.sql` for `alter publication` and `create publication` finds nothing `[2]`. Ledger
`docs/lean/AUDIT-LEDGER.md:72`: "local DB: publication tables NONE" `[2]`.

**Root cause.** The tables were switched on by hand in the dashboard of the hosted projects (assumed:
no record exists), so a database built from the files has none.

**Fix.** `20261112000000_realtime_publication.sql`, one `do` block, safe to run twice:

1. If publication `supabase_realtime` does not exist, create it empty.
2. For `public.messages`, `public.jobs`, `public.job_offers`: if the table is not in
   `pg_publication_tables`, run `alter publication supabase_realtime add table …` `[doc S4]`.

Nothing else is added, ever without a new decision: row security guards INSERT and UPDATE events but is
not applied to DELETE events `[doc S4]`. No replica identity change (no migration sets one `[2]`).

**Tests first** (each fails today):

- `supabase/tests/330_realtime_publication.sql`: the members in schema `public` are exactly
  `job_offers`, `jobs`, `messages` (today: none); `job_locations` is not a member (guard); running the
  block again leaves three.
- `tests/realtimeTables.test.mjs`: the tables named in `postgres_changes` subscriptions in app code
  equal the tables named in the migration. A later subscription to a new table then fails
  `npm run verify` until a migration adds it.

**Finding A2 (new, not fixed here).** `hooks/useJobOwnerActions.ts:89` filters DELETE events on
`job_id` `[2]`. A DELETE event can be filtered only when the table's replica identity is `full`
`[doc S4]`, and no table has that `[2]`. So this listener cannot work as written. Do NOT set `full`:
the whole deleted row would then travel in an event that row security does not guard. Recommended: a
ledger entry and a client fix (listen without the filter, match the id in code). Whether users notice:
not investigated.

## B. Timers and the proof tool (ledger B7): confirmed, both halves

### B1. A missing timer is silent

**Proof.** `supabase/tests/300_signup_and_push_schedule.sql:103-104` `[2]`:
`select is(public.install_push_schedule(), 'skipped: pg_cron absent', '45: without pg_cron the
installer skips with a notice, so a reset never fails on it');`. The only `create extension` in any
migration is `vector` (`20260901000000_baseline.sql:16`) `[2]`: nothing creates `pg_cron` or `pg_net`.

Six installers, eight timers (each installer is called once at the end of its own file, and returns
`skipped: pg_cron absent` when `cron.schedule` is missing):

| Installer (file:line) | Timer | Schedule |
|---|---|---|
| `install_settlement_schedules()` `20260910000000_settlement_schedules.sql:141` | `auto-release-due-payments` | `*/10 * * * *` |
| same | `expire-unfunded-payments` | `*/15 * * * *` |
| same | `brazos-process-settlements` | `*/5 * * * *` |
| `install_reminder_schedule()` `20260930000900_tomorrow_reminders.sql:108` | `brazos-tomorrow-reminders` | `0 22 * * *` |
| `install_series_schedule()` `20260930001000_job_series.sql:672` | `brazos-job-series` | `17 * * * *` |
| `install_receipt_schedule()` `20260930001100_receipts.sql:280` | `brazos-send-receipts` | `*/5 * * * *` |
| `install_payment_events_prune()` `20261003000500_payment_events_prune.sql:44` | `brazos-prune-payment-events` | `30 3 * * *` |
| `install_push_schedule()` `20261108000000_lean_v1.sql:1205` | `brazos-drain-push` | `* * * * *` (`300…sql:127` `[2]`) |

The drains also need secrets in the database Vault, by NAME: `send_push_url`, `send_push_service_key`
(`baseline.sql:1975-2007`), `process_settlements_url`, `process_settlements_service_key`
(`settlement_schedules.sql`); optional `send_receipts_url`, `send_receipts_service_key`, which fall back
to the settlement pair (`receipts.sql:245-255`). Without them a drain raises `vault secrets missing`.

**Root cause.** The installers treat "no pg_cron" as a designed skip, no file creates pg_cron or pg_net,
and nothing checks afterwards.

**Fix.** `20261112000100_schedules_loud.sql`:

1. `create extension if not exists pg_cron;` and `… pg_net;`. No guard: if they cannot be created the
   file fails, which is the point.
2. A `do` block calls the six installers again and raises when a result starts with `skipped`. (Only
   the push installer's success text is confirmed: `scheduled: brazos-drain-push`, `300…sql:123` `[2]`.
   So test for `skipped`, not for a success word.) A second install replaces a job, it does not add one
   (`300…sql:132-134` `[2]`, push installer only).
3. `public.schedule_health()` returns jsonb: per timer its name, schedule, active flag, last run status
   and time (`cron.job`, `cron.job_run_details`), and `vault_missing`: which of the four required names
   are absent. Names only, never a value.
4. `public.set_drain_secrets(p_functions_base_url text, p_service_key text)`: writes the four Vault
   secrets (two URLs built from the base, the key twice). Only the production workflow calls it.

Both functions: `security definer`, fixed `search_path`, `revoke all … from public, anon,
authenticated`, `grant execute … to service_role` in the same file (`.claude/rules/supabase.md`).

So a missing timer is loud three times: the file fails; pgTAP fails on a fresh reset; the hosted
fingerprint (B2) differs from the local build and `schedule_health()` fails the workflow.

**Tests first** (`supabase/tests/340_schedules_loud.sql`, all fail today): both extensions exist;
`cron.job` holds exactly the eight rows (name, schedule, command); a second install leaves eight; the
two functions exist and only `service_role` may run them; `vault_missing` lists four names on a fresh
reset and none after `set_drain_secrets`.

**Existing tests that must change (fix the test, and say so).** `300…sql:101-104` asserts the opposite
("this stack has no pg_cron") `[2]`, and its stand-in at `:106-121` creates schema `cron`, which will
already exist `[2]`. Files 170, 180, 190 and 260 probably hold the same stand-in: not investigated.

**Check first, before any code.** On the local stack:
`select name from pg_available_extensions where name in ('pg_cron','pg_net')`. Not investigated here
(this task could not start Docker). `docs/TESTING.md:42-44` says the local stack has neither; that may
mean "not switched on". The install statement for pg_cron is NOT confirmed from the documentation
(`[doc S5]` returned only the uninstall statement).

- Both rows come back: build as above. Then real timers run on the local stack between reset and
  test. The three drains fail fast (no Vault secrets); the other five act on seed rows. Run
  `npm run db:test` twice; a flake is a real finding.
- Not available locally: fallback. Local stays without timers. The owner switches both extensions on in
  the new project's dashboard (one more owner step). The file raises only when pg_cron is present and an
  installer skipped. One new function `expected_schedules()` holds the eight rows and the fingerprint
  compares the hosted timers against it.

### B2. `scripts/verify-schema.mjs` does not exist

**Proof.** Ledger `:73`: "file missing" `[2]`. The rules name it: `.claude/rules/supabase.md` "Proof of
application is `node scripts/verify-schema.mjs` or the pipeline's list-after step" (text `[2]`).
`tests/governance.test.mjs:233` forbids the name inside `ci.yml`.

**Root cause.** The tool was removed or never written while the rules kept naming it.

**Fix.** Two pieces.

1. `20261112000200_schema_fingerprint.sql`: `public.schema_fingerprint()` returns one jsonb value,
   `{section: [lines]}`. `security definer`, `service_role` only. It reads catalogs only.
2. `scripts/verify-schema.mjs` (plain `fetch`, no new dependency, no `psql`: `.claude/settings.json`
   denies `psql` to a chat). It calls `POST /rest/v1/rpc/schema_fingerprint`, sorts each section's
   lines, takes sha256 per section, and prints `section  lines  digest`.
   `node scripts/verify-schema.mjs print local` and `… compare local hosted`. `compare` prints PASS or
   FAIL per section and at most 20 differing lines per failed section; exit 0 only when all pass.
   `local` reads the URL and key from `npx supabase status`. `hosted` reads `FINGERPRINT_URL` and
   `FINGERPRINT_KEY` from the environment, which only a workflow sets (rule 9). One jsonb value, so the
   PostgREST row limit cannot cut it. It retries up to 60 s while PostgREST learns the new function.

**What the fingerprint includes** (19 sections; "public" means schema `public`):

| Section | One line per | In the line |
|---|---|---|
| `server` | the database | Postgres major version |
| `extensions` | `vector`, `pg_cron`, `pg_net` | name only |
| `enums` | enum type in public | labels, in order |
| `tables` | table in public | row security on/forced, replica identity, owner |
| `columns` | column | type, not null, default, identity or generated |
| `constraints` | constraint | `pg_get_constraintdef` |
| `indexes` | index | `pg_get_indexdef` |
| `functions` | function in public | arguments, result, language, definer or invoker, volatility, strict, settings, owner, md5 of the body (CR removed) |
| `function_grants` | function + role | EXECUTE |
| `table_grants` | table, column or sequence + role | privilege |
| `default_privileges` | role `postgres` in public | each default grant |
| `policies` | policy on a public table | command, roles, permissive, USING and CHECK text |
| `triggers` | trigger on a public table; on `auth.users` or `storage.objects` when its function is in public | `pg_get_triggerdef`, enabled state |
| `views` | view in public | definition, options |
| `realtime` | publication `supabase_realtime` | its event flags; one line per member table |
| `schedules` | timer | name, schedule, md5 of the command, active |
| `buckets` | storage bucket | id, public, size limit, mime list |
| `storage_policies` | policy on `storage.objects` and `storage.buckets` | as `policies` |
| `migrations` | applied file | 14-digit version |

**What it leaves out, and why:**

- Schemas the platform owns (`auth`, storage internals, `realtime`, `vault`, `net`, cron internals,
  `extensions`, `graphql`, `pgbouncer`): Supabase changes them on its own; hosted and local differ.
- Objects that belong to an extension: not the app's.
- Object ids, column positions, job ids, cron node and port: they differ by history and change no
  behaviour. Columns are sorted by name.
- Comments; extension versions; the Postgres minor version: no behaviour, or set by the platform.
- Every table row (`app_config`, `fee_schedule`, `blocked_terms`, users, Vault, cron run history):
  data, and some of it secret. (The reference rows come from migrations, not from the seed:
  `20260905000000_stripe_foundation.sql:125`, `:305`; `20261003000700_ugc_moderation.sql:70` `[2]`.)
- Function bodies and timer commands as text: only their md5, so no log can carry a pasted secret.
- Edge functions, function secrets, sign-in settings: not in the database; part C checks them.

**Expected first result on staging: FAIL.** Staging was built partly by hand. Likely sections:
`realtime`, `extensions`, the grant sections. Each difference is closed by a new migration, or by an
exclusion written in the list above with its reason. Never by quietly loosening the tool.

**Tests first:** `supabase/tests/350_schema_fingerprint.sql` (function exists, `service_role` only,
returns all 19 sections, two calls are equal, a table made inside the test changes `tables` and
`columns` only) and `tests/verifySchema.test.mjs` (same lines in any order give the same digest; one
changed line gives FAIL naming the section; refuses the retired ref and a hosted URL outside CI; prints
no body text). Both fail today: nothing exists.

### B3. Staging proves it first

New fourth job `prove` in `.github/workflows/staging.yml`: `needs: migrate`, `environment: staging`,
beside `deploy`. Steps: checkout, Node, `npm ci`, `npx supabase start`, `npm run db:reset` (as
`pgtap.yml:68-73` `[2]`), fetch staging's service key through the Management API the way
`scripts/backup-storage.mjs` does (`/v1/projects/{ref}/api-keys?reveal=true`) and mask it, then
`node scripts/verify-schema.mjs compare local hosted`, the read-only checks of part C
(`schedule_health()`, sign-in settings read-back), a PASS/FAIL table in the run summary, and
`npx supabase stop --no-backup` under `if: always()`.

It starts as a report (`continue-on-error: true`). After one green run it becomes blocking. Production
may rely on the fingerprint only after that. It must not live in `ci.yml` or `pgtap.yml`
(`tests/governance.test.mjs:209-279` fences both).

## C. The production workflow

File `.github/workflows/production.yml`. Trigger: `workflow_dispatch` only, with three inputs: `mode`
(`dry-run` default, or `apply`), `confirm` (text), `allow_destructive` (tick box).
`permissions: contents: read`. `concurrency: group: production-pipeline, cancel-in-progress: false`.
Only GitHub's own actions, at the SHAs staging uses (`staging.yml:102`, `:105` `[2]`); the CLI as
`npx --yes supabase@2.116.0` (`staging.yml:144` `[2]`). Every `run:` starts with `set -euo pipefail`;
secrets and inputs reach a step through `env:` only, never written into the shell text.

Job 1, `verify`: a copy of `staging.yml:93-116` `[2]`. No secrets.

Job 2, `release`: `needs: verify`, `environment: production`, 30 minutes. ONE job, so the owner
approves once per run. Steps in order:

1. Guards: branch is `mainexpo`; the project ref is not the staging ref and not the retired ref; the
   Stripe key starts with `sk_test_`. Nothing is printed.
2. Project status through the Management API. A paused project stops here with plain words.
3. Link, then `migration list` (`staging.yml:144`, `:154` `[2]`).
4. Waiting files from `scripts/staging-scan.sh --pending-files -`, and the count of applied files from
   a new mode `--applied-count -` (so the decision is tested script code, not YAML:
   `staging.yml:160-173` `[2]` tells why).
5. Scan the waiting files (`staging.yml:217` `[2]`), keeping the list of flagged files.
6. Plan code: first 8 hex characters of sha256 over the commit, the waiting versions, the flagged
   files and the applied count.
7. Dry-run report (run summary): commit; waiting files; flagged files; "first run on an empty
   database" or not; functions to deploy; secret NAMES present, to be set, or missing; Stripe webhook
   exists or will be made; timers and Vault names (or "database is empty"); sign-in settings that
   differ (names only); project status; the plan code and how to apply. **Dry run stops here and has
   changed nothing.**
8. Apply only: `confirm` must equal the plan code, else stop: "The plan changed. Run the dry run
   again." Then the destructive gate (below).
9. `db push`; `migration list` again (`staging.yml:230`, `:241` `[2]`).
10. `functions deploy --project-ref`, then `functions list` (`staging.yml:287`, `:297` `[2]`).
    `verify_jwt` comes from `supabase/config.toml` only (`staging.yml:276-280` `[2]`). Smoke check: an
    unsigned POST to `stripe-webhook` must get the function's own signature error, not the gateway's
    401 (this replaces the hand check asked for at `stripe-webhook/index.ts:38-41`).
11. Function secrets by name: `STRIPE_SECRET_KEY`; optional `RESEND_API_KEY`, `RECEIPT_FROM`,
    `RECEIPT_REPLY_TO` (receipts are skipped until the first two exist). Never `RECEIPT_TEST_TO`.
    `SUPABASE_URL`, `SUPABASE_SECRET_KEYS`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SERVICE_ROLE_KEY`
    and `SUPABASE_ANON_KEY` come from the platform; `supabase/functions/_shared/serviceAuth.ts` reads
    the key named `default` in the first two, else the legacy one.
12. Stripe test webhook: list endpoints; if none points at this project's `stripe-webhook`, create one
    with the seven events of `HANDLED_EVENTS` (`stripe-webhook/index.ts:61-69`), mask the signing
    secret from the answer and set it as `STRIPE_WEBHOOK_SECRET` `[doc T1]`. If the endpoint exists
    but the secret name is missing, remove and re-create it (test mode only).
13. Vault: fetch the service key (masked), call `set_drain_secrets()`.
14. Timers: `schedule_health()` must show no missing Vault name; wait up to 180 s for a `succeeded`
    run of `brazos-drain-push` that started after step 13.
15. Sign-in settings: `PATCH /v1/projects/{ref}/config/auth` with the wanted values `[doc S3]`, then
    read back and compare. `sms_test_otp` is never sent, so the owner's test numbers stay untouched.
16. Fingerprint: start the local stack on the runner, reset, `compare local hosted`.
17. Summary: one line per check with PASS or FAIL, then `PRODUCTION: PASS` or
    `PRODUCTION: FAIL at <check>`. Stop the local stack under `if: always()`.

The logic of steps 1, 2, 6-8 and 11-15 lives in one script, `scripts/production-deploy.mjs`, tested
with a fake `fetch`. The workflow only orchestrates.

**The destructive-file gate (coordinator's point 1).** On a new project every file is waiting, and the
scan flags files that drop tables (`20261108000000_lean_v1.sql` is one).

- Applied count is 0 (first run, empty database): flagged files are listed in the dry run and do not
  block. They can only remove what the same run creates. The owner still types the plan code.
  Assumption: a database with no applied file holds no app table. A new project meets it.
- Applied count is 1 or more: a flagged waiting file stops the run unless `allow_destructive` is
  ticked, as on staging, and the plan code is still needed. Recommended first: press the backup button
  (open question 10). The free plan has no backups.

**How the gate works on a public repo.**

- Only a person with write access can start a manual run, from the Actions tab, the GitHub CLI or the
  API; the workflow file must be on the default branch `[doc G3]`. A stranger or a fork cannot.
- A job that names an environment cannot start or read its secrets until the environment's rules pass
  `[doc G2]`. Rules to set: deployment branches "selected", `mainexpo` only (matched against the run's
  branch) `[doc G1]`; required reviewer: the owner (one approval is enough; "Prevent self-review" must
  stay OFF because he starts and approves) `[doc G2]`; "Allow administrators to bypass" unticked (it is
  on by default) `[doc G1]` `[doc G2]`.
- In a personal-account repo only the repository owner can change an environment `[doc G2]`.
- Limit 1: GitHub sees a chat using the owner's login as the owner. See rule 1.
- Limit 2: any workflow file on `mainexpo` that names `environment: production` gets the same
  approval screen. The owner approves only runs named "Production".
- Limit 3: the Supabase access token already kept in the `staging` environment probably reaches every
  project of the account (not investigated). Then the real lock on production is who can push to
  `mainexpo`: do ledger O7 before real money.

**If the repo becomes private on a free GitHub plan.** Protection rules and environment secrets are
ignored and environments cannot be configured; they return if the repo is public again `[doc G2]`. The
`release` job would get empty secrets and fail at the link step. GitHub Pro or Team bring back
environments, environment secrets and the branch rule for private repos, but required reviewers stay
public-only on Free, Pro and Team `[doc G1]`: the approval button would be gone. Also likely lost, not
checked: the free Mac minutes the e2e runs use (`HANDOFF.md:12-13` `[2]`) and free secret scanning
(ledger `:16` `[2]`).

**Supabase CLI facts `[doc S1]`.** `db push` applies every local file the history table lacks and
records each one; it has `--dry-run`, `--include-all`, `--include-seed`, `--include-roles`,
`--password`, `--skip-vault`. `config push` copies `supabase/config.toml` to the project.
`secrets set NAME=VALUE` takes `--env-file`. `functions deploy` has `--no-verify-jwt`, `--prune`,
`--use-api`. `db query` runs SQL. WARNING: that page describes the newest CLI and names the target with
`--remote`; the pipeline pins 2.116.0 and uses `--project-ref`. Confirm each flag with
`npx --yes supabase@2.116.0 <command> --help` (local, contacts nothing) before use.

**Do not use `config push` in step one.** `supabase/config.toml` holds local-development sign-in values
(`site_url` 127.0.0.1 `:168`, password length 6 `:190`, phone sign-up off `:268`). Pushed as it is, it
would break sign-in; pushed at staging it would break the installed builds. `[remotes]` is documented
for persistent branches, not for a second project `[doc S2]`; `[doc S7]` gave no detail. Hence step 15.

## D. The owner's one-time steps, in order

| # | Step | Check | Can the workflow do it? |
|---|---|---|---|
| 1 | Supabase: pause the retired production project (do not delete). The free plan allows 2 active projects; paused ones do not count `[doc S6]` | dashboard shows it paused | No: it is never contacted |
| 2 | Supabase: create the new project (free plan). Keep the database password in a password manager | project page is healthy; note the ref | No: his account |
| 3 | In the dashboard, look at Settings, API keys: is there a `service_role` key? (open question 2) | yes or no, told to the chat | No |
| 4 | Give the ref to a chat (a ref is not a secret). A builder puts it in the build gate | `npm run verify` green | The chat does the code |
| 5 | GitHub, Settings, Environments, new `production`: branch `mainexpo` only; required reviewer himself; self-review allowed; admin bypass off | a dry run waits at "Review deployments" | No: a setting |
| 6 | In that environment, add secrets by NAME: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `STRIPE_SECRET_KEY` (test), `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`; optional `RESEND_API_KEY`, `RECEIPT_FROM`, `RECEIPT_REPLY_TO`, `ARTIFACT_KEY` | the dry run shows each name as present | No: it only reads them |
| 7 | Stripe: a separate test sandbox for production (open question 6), Connect switched on; its secret test key goes in step 6 | after apply: one webhook with seven events; summary "Stripe test webhook: PASS" | Yes: the workflow makes the webhook and its secret |
| 8 | Twilio: a Verify service (or staging's); its three values go in step 6 | summary "Sign-in settings: PASS" | Yes: the workflow sets the provider |
| 9 | Supabase dashboard: test phone numbers for App Review (ledger O3, O4) | sign in with the review number | No: they are sign-in codes; never in the repo or a log |
| 10 | Expo (EAS) `production` environment, by NAME: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY`, `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (test), `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | `eas env:list production` shows five names (ledger O5; exact command not investigated) | No: his Expo account |
| 11 | Actions, "Production", Run workflow, mode `dry-run`, Approve. Read the list and the code | summary ends with the plan code | It is the workflow |
| 12 | Run again, mode `apply`, type the code, Approve | `PRODUCTION: PASS` | It is the workflow |
| 13 | Add deny lines to `.claude/settings.json`: the new ref, `production.yml`, `pending_deployments` | a chat's attempt is refused | No: chats cannot edit `.claude/` |
| 14 | Later, not step one: the production build (`npm run release:production`; it auto-submits; owner only), ledger O1, O2, O7 | | |

Build settings read from `eas.json`, profile `production`: channel `production`, environment
`production`, auto-increment, and it sets `APP_VARIANT`, `EXPO_PUBLIC_APP_VARIANT`,
`EXPO_PUBLIC_PHONE_AUTH_MODE=supabase`, `EXPO_PUBLIC_PAYMENTS_MODE=stripe`. The build gate
`scripts/eas-build-pre-install.mjs:68-74` still expects the RETIRED ref for `production`
(`scripts/supabase-ref.mjs:48`), so a production build fails until step 4 is done. Good: it fails
closed. `package.json` runs both release scripts with `eas-cli@latest` and `--auto-submit`; pinning
the version (ledger R10 fixed the same in a workflow, `:14` `[2]`) is recommended.

Sentry: only the app uses it (no edge function reads a Sentry name). Nothing to do on the backend.
Push credentials for the production bundle id: not investigated.

## E. Ledger B17, the two parts asked for

**"Notifications never 'failed'": confirmed.** `supabase/functions/send-push/index.ts:202-205` sends
`p_status: delivered ? 'sent' : 'pending'` and never `failed`. The newest
`claim_notification_batch()` (`20260930000800_quiet_hours.sql:135-197`) claims only
`status = 'pending' and attempts < 5`. So a row that failed five times stays `pending` for ever.
Root cause: the code that gives up never writes the word. Fix, `20261112000300_notifications_failed.sql`:
the same function body, with one first statement that sets `status = 'failed'` and the error text
`retries exhausted` (when the row has none) on rows `pending` with `attempts >= 5`; grants restated.
It also clears rows already stuck. The edge function does not change. Column names: read
`baseline.sql:6008-6024` first. Tests first, `supabase/tests/360_notifications_failed.sql` (fail
today): a pending row at 5 attempts becomes `failed` at the next claim and is not returned; a row at 4
is claimed, then fails at the following claim if still pending; a `sent` row stays `sent`.

**"Missing indexes": confirmed for two app reads.** `lib/notifications.ts:25-31`, `:40-46` filter
`notification_outbox` by `recipient_id`; `lib/jobs.ts:733-738` filters `jobs` by `assigned_worker_id`;
no index leads with either (`baseline.sql:6518-6646`). Root cause: indexes were made for the first
screens only. Fix, `20261112000400_read_path_indexes.sql`:
`notification_outbox_recipient_created_idx (recipient_id, created_at desc)` and
`jobs_assigned_worker_created_idx (assigned_worker_id, created_at desc)`, both
`create index if not exists`. Tests first, `supabase/tests/370_read_path_indexes.sql` (fail today):
both exist with those leading columns. About 30 other foreign keys have no leading index (static scan,
not checked one by one); they only slow a parent delete and are not added.

The other B17 items (payments columns, amount check, status oracles, photo deletion, cascade): not
investigated.

## F. Rehearsal: how each part is proven before the button

| Part | Proven where | Evidence |
|---|---|---|
| A, B1, E migrations | local stack: `npm run db:reset`, `npm run db:test`, new tests red first, then green; `pgtap.yml` repeats it on push | test counts (today 34 files, 1805 tests, ledger `:64` `[2]`; after: 39 files) |
| Fingerprint is deterministic | local: two resets, `print local` twice, equal digests | the two outputs |
| Fingerprint, hosted = local | staging, job `prove`: report first, blocking after one green run | run link, PASS table |
| Timers and Vault names on a hosted project | staging, job `prove`: `schedule_health()` and the `schedules` section | same run |
| Scan's new mode, plan code, gates, webhook and settings logic | `npm run verify`: fixture tests and fake-`fetch` tests | test names |
| The workflow file | `tests/productionWorkflow.test.mjs` (text fences); then the dry run on the empty project, which changes nothing | dry-run summary |
| Replay of every file from zero on a hosted project | cannot be rehearsed on staging. The first apply on the EMPTY production project is the rehearsal: nothing can be lost | `PRODUCTION: PASS` |

Until PASS, one sign-in and one test payment on a phone, production has no users. If the first replay
fails, the owner deletes the empty project and creates another (new ref and secrets), after a
corrective plan. What the five new files do on staging when pushed: none is flagged, so they apply by
themselves; `000000` adds only missing members; `000100` re-installs the timers and fails loudly if
one skips; `000300` marks stuck notification rows `failed`; `000400` takes a short lock on two tables.

## G. Lines that today's decisions make false

For a later helper. Line numbers without `[2]` come from the first read.

- `CLAUDE.md` (text `[2]`): `:6` "BRAZOS production deploys stay manual: a production step is always a
  parked step for the owner, never run by a chat." (say: only through `production.yml`, started and
  approved by the owner). `:32` "Production (`avkighsiufeefyycbebf`) is never contacted, read or
  write." (that ref is now the retired project; add the new one and the workflow). Keep the old ref in
  the file (`tests/governance.test.mjs:68`) and stay under the size cap.
- `HANDOFF.md` `[2]`: `:32` "Production: the owner applies the file by hand, as always."; `:56-58`
  (owner list grows); `:94-99` (B6 done); `:103`; `:107` (add `release:production`); `:120`.
- `docs/DECISIONS.md`: rows `:21` D-20261108-6, `:24` D-20261108-9, `:51` D-20260901-8, `:61`
  D-20260905-1, `:72` D-20261011-1 (read each; only the ids were kept). Add rows for the four decisions.
- `docs/TESTING.md`: `:42-44` (local stack has no pg_cron or pg_net), `:46-48` (production by hand),
  `:77`, `:81-82` (says `release:testflight` does not auto-submit; `package.json` and `HANDOFF.md:107`
  `[2]` say it does), `:86`.
- `docs/ARCHITECTURE.md`: `:25-50` (SMS provider set in the dashboard only), `:340-341`, `:345-349`,
  `:379-383` (installer skips locally), `:446-449` (newest migration named), `:500-516` (`:515`
  "Production is hand-applied and no job targets it.").
- `docs/BACKLOG.md`: `:95-96` (production migration by hand, never a workflow), `:101-102`.
- `docs/lean/AUDIT-LEDGER.md` `[2]`: `:72`, `:73`, `:83` (status); `:98` O5 "a live Stripe key" (a test
  key in step one); `:99` O6 (now set and checked by the workflow).
- `.github/workflows/staging.yml` `[2]`: `:3` and `:73` "THREE … JOBS" (four with `prove`); `:18-19`
  "Production has no users; staging effectively does."; `:27-29` "PRODUCTION IS NEVER AUTOMATED. It
  stays hand-applied by the operator, in their own shell, one migration at a time. No job in this
  repository targets it and none ever should."
- `.github/workflows/pgtap.yml:23-25` `[2]`: "the staging pipeline (staging.yml) is the only workflow
  that reaches a remote project" (already untrue: `backup-staging.yml` does too).
- `scripts/staging-scan.sh:12` and its stop text `:348-359` speak of staging only; production will run
  the same script. `scripts/supabase-ref.mjs:47-48` and `scripts/eas-build-pre-install.mjs:60-74`
  (production = retired ref). `supabase/functions/stripe-webhook/index.ts:38-41` (hand check after each
  deploy; step 10 replaces it).
- Tests that pin today's state and must change with the code: `tests/buildGate.test.mjs:22-23`,
  `:226-239`; `tests/appConfig.test.mjs:126`; `tests/maestroFlows.test.mjs:121`;
  `tests/testspriteGate.test.mjs:115`; `tests/governance.test.mjs:209-279`.
- **For the owner (`.claude/` cannot be changed by a chat).** `.claude/rules/supabase.md` (text `[2]`):
  line 20 "Production: hand-applied by the operator, always. No automation targets production.";
  lines 28-32 "Production migrations are hand-applied by the operator, always: no automation targets
  production, no workflow in this repository may be pointed at it, and none ever applies a migration
  to it."; "one pipeline of three dependent jobs" (four); "The reason is not production, which has no
  users" (false once it has). `.claude/settings.json:22-23` deny only the retired ref; nothing denies
  starting `production.yml` or approving a waiting deployment.

## Migration files, in order (coordinator's point 2)

1. `20261112000000_realtime_publication.sql` (A)
2. `20261112000100_schedules_loud.sql` (B1)
3. `20261112000200_schema_fingerprint.sql` (B2)
4. `20261112000300_notifications_failed.sql` (E)
5. `20261112000400_read_path_indexes.sql` (E)

None is flagged by `scripts/staging-scan.sh` (`:229-237`): no `drop table`, `drop column`,
`drop schema`, `truncate` statement, `rename to`, `rename column` or `delete from` outside a function
body. Keep it so: the scan removes comments and dollar-quoted bodies only, so none of those words may
stand in a string or a `comment on` text, and a dollar tag must not hold a digit (`:273-297`). Note
for a later undo of A: `alter publication … drop table` IS flagged.

## New numbers and choices

| Number or choice | Why |
|---|---|
| Realtime members: exactly `messages`, `jobs`, `job_offers` | the only tables the app listens to |
| Extensions made by a migration: `pg_cron`, `pg_net` | so no timer can be skipped silently |
| An installer result starting with `skipped` fails the migration | loud, and does not depend on a success word |
| Retry limit 5 kept; a pending row at 5 becomes `failed`, text `retries exhausted` | the limit exists already (`quiet_hours.sql`); only the word was missing |
| Two indexes (E) | the two unindexed app reads found |
| Plan code: 8 hex characters of sha256(commit, waiting versions, flagged files, applied count) | short enough to type; changes when anything that matters changes |
| "First run" means 0 applied files on the remote | the one state where a drop cannot lose data |
| Wait up to 180 s for the every-minute timer | three ticks |
| Retry the fingerprint call up to 60 s | PostgREST needs a moment to see a new function |
| At most 20 differing lines printed per section | readable summary |
| Job time limits: `verify` 15 min (as staging), `release` 30 min (as `pgtap.yml`) | copied |
| `concurrency: production-pipeline`, never cancel | as staging: two runs must not race |
| Workflow refuses a Stripe key not starting `sk_test_`, and the staging or retired ref | step one is test money; wrong target is the worst mistake |
| Password length 8 | ledger O6 |
| Sign-in rate limits left at the platform's defaults (30 texts an hour for the whole project `[doc S2]`) | enough for step one; raise before a real launch |
| Staging `prove` job: report first, blocking after one green run | staging is expected to differ at first |
| Environment `production`: branch `mainexpo`, reviewer the owner, self-review allowed, admin bypass off | part C |
| pgTAP files 330, 340, 350, 360, 370 | next free numbers after 320 |

## Open questions (each with the recommended answer; work continues on it)

1. Does the local stack offer pg_cron and pg_net? Recommended: the builder checks first (B1); the
   fallback is designed.
2. Does a project created today still have a `service_role` key? The drains, `set_drain_secrets` and
   the fingerprint call use it. Not settled. The API keys page
   (https://supabase.com/docs/guides/getting-started/api-keys), read 2026-11-11 through an extraction
   tool and not verified against the page text, does not say whether a new project still gets the two
   old keys. It says a secret key has the same database rights as `service_role`, and that functions
   get `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_SECRET_KEYS` by
   default. Whether the function gateway's JWT check accepts a secret key: not verified. Recommended:
   the owner looks on day one (step 3); the workflow reads the key list and stops in plain words when
   no key fits; if the `service_role` key is
   absent, the builder adapts before any apply.
3. Email sign-up on production? Ledger O6 wants confirmation on, or email sign-up off. The built-in
   mail sender allows 2 mails an hour `[doc S2]`. Recommended: off in step one if the sign-up screen
   can live without it (builder checks the screen); else on, with confirmation and a mail sender.
4. `site_url` for production? Recommended: the public site, with `brazos://reset-password` in the
   redirect list (`supabase/config.toml:172`).
5. Which company sends the sign-in texts (`HANDOFF.md:60-61` `[2]`: unanswered)? Recommended: Twilio
   Verify, as staging.
6. One Stripe test account for staging and production, or two? With one, each project's webhook gets
   the other's events (recorded and ignored, `stripe-webhook/index.ts:213-214`). Recommended: a
   separate sandbox.
7. Typed plan code, or a second approval in the same run? Recommended: the typed code; it also proves
   a dry run was read for this exact commit.
8. Free-plan pause after a week without activity `[doc S6]`: add a keep-alive? Recommended: no. The
   timers call the functions every minute, which probably counts as activity (not confirmed), and
   step 2 of the workflow says "paused" plainly.
9. Where does the new ref live? Recommended: `scripts/supabase-ref.mjs`, as `PRODUCTION_REF`; the old
   one renamed `RETIRED_PRODUCTION_REF` and still refused everywhere.
10. A backup button for production? Recommended: yes, `backup-production.yml`, a copy of
    `backup-staging.yml` with a manual trigger and the same encryption; press it before any flagged
    file and weekly once users exist.
11. Who writes the Vault secrets: the workflow (`set_drain_secrets`) or the owner by hand in the
    dashboard? Recommended: the workflow.
12. When does real money start? Recommended: after a paid Supabase plan (backups), ledger O1, O4, O7,
    and a new decision that removes the `sk_test_` guard.

## Everything the build creates or changes

Database objects: publication `supabase_realtime` gets three members; extensions `pg_cron`, `pg_net`;
eight timers on any database that lacked them; new functions `schedule_health()`,
`set_drain_secrets(text, text)`, `schema_fingerprint()`; replaced function
`claim_notification_batch(integer)`; indexes `notification_outbox_recipient_created_idx`,
`jobs_assigned_worker_created_idx`; rows: stuck notification rows become `failed`; on production only,
four Vault secrets (by the workflow).

New files: the five migrations; `supabase/tests/330…370` (five files); `scripts/verify-schema.mjs`;
`scripts/production-deploy.mjs` and its wanted sign-in values (a small JSON, no secret);
`.github/workflows/production.yml`; `.github/workflows/backup-production.yml` (if question 10 is yes);
`tests/realtimeTables.test.mjs`, `tests/verifySchema.test.mjs`, `tests/productionWorkflow.test.mjs`,
`tests/productionDeploy.test.mjs`, `tests/stagingScan.test.mjs`.

Changed files: `.github/workflows/staging.yml` (job `prove`, comments); `.github/workflows/pgtap.yml`
(comment); `scripts/staging-scan.sh` (mode `--applied-count`, neutral stop text);
`scripts/supabase-ref.mjs`; `scripts/eas-build-pre-install.mjs`; the tests named in part G;
`supabase/tests/300…` and probably 170, 180, 190, 260; `types/database.ts` (`npm run db:types`);
`package.json` (pin `eas-cli`, if accepted); the documents of part G. Critical folders: follow the
critical skill for `supabase/migrations/`.

## Undo

The workflow: delete the file; nothing on production changes. The empty production project: the owner
deletes it. Migrations: never edit an applied file; undo is a new migration (`drop index`,
`drop function`, the old `claim_notification_batch` body from `quiet_hours.sql`; removing a
publication member is a flagged file).

## Documentation pages

- S1 Supabase CLI reference: https://supabase.com/docs/reference/cli/supabase-db-push
- S2 Supabase CLI config: https://supabase.com/docs/guides/local-development/cli/config
- S3 Management API, update auth config: https://supabase.com/docs/reference/api/v1-update-auth-service-config
  (fields `site_url`, `uri_allow_list`, `password_min_length`, `external_email_enabled`,
  `mailer_autoconfirm`, `external_phone_enabled`, `sms_provider`, `sms_twilio_verify_account_sid`,
  `sms_twilio_verify_auth_token`, `sms_twilio_verify_message_service_sid`, `sms_test_otp`,
  `rate_limit_sms_sent`, `rate_limit_otp`, `rate_limit_verify`)
- S4 Realtime, Postgres Changes: https://supabase.com/docs/guides/realtime/postgres-changes
- S5 Cron install: https://supabase.com/docs/guides/cron/install
- S6 Pricing and pausing: https://supabase.com/pricing and
  https://supabase.com/docs/guides/platform/free-project-pausing
- S7 Managing config and secrets: https://supabase.com/docs/guides/local-development/managing-config
- G1 GitHub, deployments and environments:
  https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
- G2 GitHub, managing environments:
  https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments
- G3 GitHub, manually running a workflow:
  https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow
- T1 Stripe, create a webhook endpoint: https://docs.stripe.com/api/webhook_endpoints/create

## Not verified

- Anything on a running database: this task could not start Docker or contact a remote project. No
  test here was run; every "fails today" is from reading.
- Flags of the pinned CLI 2.116.0 (the reference describes a newer CLI); `supabase status` output
  shape; whether `functions list` shows `verify_jwt`.
- Management API paths other than the auth update (read-back, project status, API keys): not on the
  fetched page. `scripts/backup-storage.mjs` already uses the API-keys path.
- The pg_cron install statement on a hosted project, from a migration.
- That staging has pg_cron, pg_net, the eight timers and the Vault names today (staging is never read
  by a chat). The `prove` job will tell.
- Whether the baseline ever ran from zero on a hosted project.
- The success texts of five installers; the stand-ins in pgTAP files 170, 180, 190, 260; the exit
  codes of `scripts/staging-scan.sh`; `notification_outbox` column names.
- Every path:line without `[2]`.
