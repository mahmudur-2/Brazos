# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## 2026-08-16 - stage4C: phase74 + phase75 wired into the repository

**This run changed the repository only. No SQL was executed, no schema was
applied, and no database was contacted by the run.** Three commits: the two
migration files landed byte-for-byte as the operator applied them to staging
(integrity measured before staging - line counts 130/729, occurrence counts,
ASCII-only byte scan; every number in `docs/audits/STAGE4C_REPORT.md`), two
new verify-schema groups covering them, and this documentation pass.

`npm run verify` after the changes is GREEN: **547 tests, 547 pass, 0 fail,
0 skipped** (lint = `tsc --noEmit` plus `noUnusedLocals` /
`noUnusedParameters`, then the full `node --test tests/*.test.mjs` suite).

## Applied reality - staging `zzkumxcjtbqoselzptig`

**phase74 (push scheduler) and phase75 (security hardening) are APPLIED to
staging.** The operator applied both before this run: phase74's header
records the apply verified by `net._http_response` returning status 200 and
four categories of push arriving on a physical device, and phase75 commits
only if its in-transaction self-check passes, so its sentinel existing is the
self-check passing. Phases 67-73 were already applied and verified green on
2026-08-16.

**Per standing policy, only a green `node scripts/verify-schema.mjs` counts
as applied - and the two groups that check phase74/75 were added by this
run, so no verify-schema run has covered them yet.** The next operator
action is to run it (needs `.env` and live staging, so it never runs inside
an autonomous run). Expected: every group OK including the two new
sentinels, zero MISSING, zero PENDING. With phase74/75 committed there is no
unapplied migration in the repository - the pending layer is empty again.

**Production (`avkighsiufeefyycbebf`) still has none of the migrations.**
The standing decision is a rebuild from a staging dump once staging is
beta-ready; `PROD_APPLY.md` remains the ordered fallback if a replay is
chosen instead. Production was never contacted during this run.

### anon-EXECUTE evidence - preserve on any rewrite

Settled by a live `pg_proc` read on staging, 2026-08-16 (before phase74/75
were applied):

> Exactly ONE function in schema `public` is EXECUTE-able by `anon`:
> `job_categories_expanded()`, SECURITY INVOKER, returns boolean, ACL
> `postgres=X/postgres | anon=X/postgres | authenticated=X/postgres`. That is
> the deliberate one (phase69 re-granted it). `worker_job_stats`,
> `deactivate_push_token` and `resolve_notification` did NOT drift.

That ACL string cannot be re-derived from any file in this repository and
exists nowhere else. Preserve it on any rewrite of this document. Neither
new phase disturbs the finding: phase74's `drain_notification_outbox()` is
revoked from public/anon/authenticated in the same file that creates it, and
phase75's sweep removes table WRITE grants, not function EXECUTE.

## What this run changed in the tree

1. **`supabase/phase74_push_scheduler.sql` (130 lines) and
   `supabase/phase75_security_hardening.sql` (729 lines) are committed,
   unmodified.** phase74: pg_cron fires `public.drain_notification_outbox()`
   every minute; it reads the endpoint and service_role key from Vault and
   POSTs to the `send-push` Edge Function through pg_net; fire-and-forget,
   so `cron.job_run_details` succeeds independently of delivery and
   `net._http_response` holds the outcome. phase75: six security-sweep
   findings - money CHECK ceilings ($100,000) on `jobs`/`job_offers`/
   `payments`, an explicit `'jobs'` arm in `should_notify`, half-mile-snapped
   distance in `jobs_within_radius` (ordered AND filtered on the snapped
   value), `delete_my_account` TOCTOU closed under `FOR UPDATE` job locks,
   a trigger settling pending offers on any job cancellation, and anon's
   write privileges removed schema-wide with SELECT deliberately retained.
2. **`scripts/verify-schema.mjs` gained two groups at the end of
   MIGRATIONS**, sentinel-carried like phase43 onward. `node --check` exits
   0. Note for the next reader: the dispatch prompt placed them "after the
   phase69 group", but phase70-73 groups already followed phase69; the end
   of the array (after phase73) is where they went and belong.
3. **Documentation truth-up** - this file, `BRAZOS_MASTER_PLAN.md`
   (scheduler and five phase75-carried items leave; two follow-ups with
   named causes arrive; F5 restated alone), `docs/architecture.md`
   (Notifications: the scheduled drain; Money: the ceilings; Security model:
   the anon write revoke and the snapped-distance sort), and the new
   `docs/audits/STAGE4C_REPORT.md`.

## Still blocking a beta, worst first

The push scheduler is OFF this list (phase74 drains the outbox every minute
on staging), and so are unbounded money amounts (phase75's ceilings bound
every writer; the client-side mirror is a master-plan follow-up, not a
blocker).

1. **Phone sign-in dead-ends on a release build.** `EXPO_PUBLIC_PHONE_AUTH_MODE`
   unset means `mock` in development and `disabled` in a release, and `mock`
   is refused outright when `__DEV__` is false - correctly, since no SMS
   provider is configured or paid for. Email + password is therefore the only
   path that authenticates anyone. See `docs/phone-auth-activation.md`.
2. **Supabase session tokens sit in unencrypted AsyncStorage.** A
   device-compromise exposure; swap the `createClient` storage adapter to
   `expo-secure-store`.
3. **Payments are sandbox-only and availability is configuration-governed.**
   `EXPO_PUBLIC_PAYMENTS_MODE` must be set to `sandbox` for a release/
   TestFlight build to run payments at all (unset resolves to disabled
   outside development), and there is no real provider behind the resolver -
   deliberate for the beta, but the beta cannot exercise checkout until the
   env is set and a provider decision is eventually made.

## Needs the operator - outside any run

**A. Run `node scripts/verify-schema.mjs` against staging.** It is the only
thing that makes "phase74/75 applied" official under this repository's
policy, and the two new groups have never been exercised. Expect every group
OK, zero MISSING, zero PENDING.

**B. The next TestFlight build will fail its own gate** - unchanged from
Stage 4A. The EAS `preview` environment's `SUPABASE_KEY` is a new-format
publishable key (`sb_pu…`); `refFromJwt` cannot resolve a ref from it, so
`evaluateGate` fails closed and exits 1 before dependencies install. Replace
the value with the legacy `eyJ…` anon key - **production's**, because the
`testflight` profile selects the `preview` environment and
`EXPECTED_REF.testflight` is the production ref. Related trap:
`verify-schema.mjs` shares `refFromJwt` and only compares a truthy ref, so a
staging move to a new-format key would degrade its parity check silently to
`UNRESOLVED`; worth making it fail closed like the EAS gate.

**C. "preview" names two different things.** `EXPECTED_REF` maps
`preview → STAGING_REF`, but `eas.json` declares no `preview` BUILD profile;
the EAS **environment** named `preview` holds production credentials and is
what the `testflight` profile selects. Nothing is broken - the deliberate
`EXPECTED_REF.testflight → production` decision applies - but the two files
read together imply preview means staging, which is false. Documented in the
`EXPECTED_REF` docblock.

**D. `EXPO_PUBLIC_PAYMENTS_MODE` still governs whether payments run.**
Unset reproduces the old `__DEV__` behaviour exactly. For payments on a
release build, set `EXPO_PUBLIC_PAYMENTS_MODE=sandbox` in `.env` and restart
Metro (Expo inlines `EXPO_PUBLIC_*` at bundle time). Declared in
`.env.example` since commit `4d78ce9`.

**E. `RAISE NOTICE` is invisible in the Supabase SQL Editor.** Acceptance
for single-transaction migrations is "Success. No rows returned." with no
error, plus the real gate: a green verify-schema. phase74 and phase75 were
both written post-lesson - each ends with a visible-acceptance SELECT that
returns its outcome as rows.
