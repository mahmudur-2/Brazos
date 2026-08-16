# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## 2026-08-16 - stage4A-tail: labelling, dead route, documentation truth-up

`npm run verify` is GREEN: **547 tests pass / 0 fail / 0 skipped** (lint =
`tsc --noEmit` plus `noUnusedLocals` / `noUnusedParameters`, then the full
`node --test tests/*.test.mjs` suite). Three commits: one label fix, one
notification reconciliation, one documentation pass. **No SQL was executed and
no migration file was written this run.** Per-commit detail, including three
places where the dispatch prompt's premise did not match the repository, is in
`docs/audits/STAGE4A_FINDINGS.md`.

## Applied reality - staging `zzkumxcjtbqoselzptig`

**`node scripts/verify-schema.mjs` ran GREEN on 2026-08-16: every group OK,
zero MISSING, zero PENDING**, including the three phase73 checks. Phases 67-73
are all applied. There is currently **no unapplied migration in the
repository** - the pending-migration layer is empty.

Account deletion and push are proven end-to-end on a physical iPhone; an EAS
**development** build (`app.brazos.mobile`, staging) runs on device;
`send-push` is deployed.

Production has none of the migrations; the standing decision is a rebuild from
a staging dump. It was never contacted during this run, and its project ref is
not repeated here. `supabase/.temp/` is expected untracked CLI state.

### Blocker 4 is CLOSED on both halves

**Half one - `transition_job_status` NULL-unsafe owner guard: closed by
phase73.** `supabase/phase73_null_safe_owner_guard_and_unsend_gate.sql` is
APPLIED. The guard compared `assigned_worker_id` with an inequality, which is
NULL rather than TRUE on an unassigned job, so the guard did not fire and the
idempotent return branch handed any authenticated caller the full `jobs` row as
SECURITY DEFINER - read-only, but it bypassed the `jobs` SELECT policies. The
same migration added the missing active-user gate to `unsend_message`, so a
banned or tombstoned account can no longer blank its own messages.

**Half two - residual anon EXECUTE: settled by a live `pg_proc` read on
staging, 2026-08-16.** This was previously recorded as NOT DETERMINABLE
STATICALLY. It is now determined, and **no remediation migration is needed**.

> Exactly ONE function in schema `public` is EXECUTE-able by `anon`:
> `job_categories_expanded()`, SECURITY INVOKER, returns boolean, ACL
> `postgres=X/postgres | anon=X/postgres | authenticated=X/postgres`. That is
> the deliberate one (phase69 re-granted it). `worker_job_stats`,
> `deactivate_push_token` and `resolve_notification` did NOT drift.

That ACL string cannot be re-derived from any file in this repository and
exists nowhere else. Preserve it on any rewrite of this document.

## What this run changed in the tree

1. **The checkout sandbox banner states the money fact, not the build fact.**
   It read `SANDBOX — development build`, which became false the moment Stage
   4A let sandbox payments run on a release binary - a TestFlight tester was
   being shown a wrong statement. It now reads **`SANDBOX — no real money
   moves. No real money is charged, held or transferred.`**, and it renders if
   and only if the RESOLVED payments mode is `sandbox` (a `configError` always
   resolves to `disabled`, so that case needs no separate condition). The
   confirm dialog carried the identical false claim one tap later ("in this
   development build") and was corrected with it. No RPC, amount, payment-state
   or state-machine change - this was a label.
2. **The notification feed's maps are reconciled against what the database
   actually emits.** `enqueue_notification()` is the only insert into
   `notification_outbox`, all fourteen call sites pass literal categories, and
   the complete inventory is six categories / fourteen (category, type) pairs /
   five screens - tabulated in `docs/audits/STAGE4A_FINDINGS.md`. The routing
   table needed no change: every emitted screen was already registered and
   handled. **The dead entry was the feed's icon map**, which keys on `type` and
   carried `review` - no trigger emits that; phase20 emits `review_received`, so
   the star had never rendered on a review notification. Three new tests
   reconcile both directions off one declared list, so the client maps and the
   migrations cannot drift.
3. **Documentation truth-up** - this file, `BRAZOS_MASTER_PLAN.md`,
   `docs/architecture.md`, and the phase67/68 runbook.

Still live from the previous run: payments availability is declared by
`EXPO_PUBLIC_PAYMENTS_MODE` (allow-list; unset reproduces the old `__DEV__`
behaviour exactly), the saved-worker write is `ON CONFLICT DO NOTHING`, and
notification feed taps delegate wholly to `lib/notificationRoutes.ts`.

## Still blocking a beta, worst first

1. **Push has no scheduler.** Enqueue is automatic, but the outbox drains only
   on a manual `send-push` invocation - the phase20 pg_cron block is **still
   commented out**. Beta needs pg_net + pg_cron (or an equivalent scheduler)
   firing `send-push` on an interval, with `claim_notification_batch` bounds
   unchanged.
2. **Phone sign-in dead-ends on a release build.** `EXPO_PUBLIC_PHONE_AUTH_MODE`
   unset means `mock` in development and `disabled` in a release, and `mock` is
   refused outright when `__DEV__` is false - correctly, since no SMS provider
   is configured or paid for. Email + password is therefore the only path that
   authenticates anyone. See `docs/phone-auth-activation.md`.
3. **Supabase session tokens sit in unencrypted AsyncStorage.** A
   device-compromise exposure; swap the `createClient` storage adapter to
   `expo-secure-store`.
4. **Money amounts are unbounded.** Create/counter offer and job budgets reject
   only `<= 0`, with no ceiling. Sandbox today, but the gap must close before a
   real payment provider. Only tips are capped.

## Needs the operator - outside any run

**A. The next TestFlight build will fail its own gate.** See
`BRAZOS_MASTER_PLAN.md` "Known follow-ups with a named cause" and
`docs/audits/STAGE4A_FINDINGS.md` "EAS finding 1" for the full evidence. In
short: the EAS `preview` environment's `SUPABASE_KEY` is a new-format
publishable key (`sb_pu…`), `refFromJwt` cannot resolve a project ref from it
because there is no JWT to decode, and `evaluateGate` therefore fails closed
with `env:SUPABASE_KEY does not resolve to a Supabase project ref` and exits 1
**before dependencies install**. The gate is working as designed; the
configuration is what is wrong. Replace that value with the legacy `eyJ…` anon
key - **production's**, because the `testflight` profile selects the `preview`
environment and `EXPECTED_REF.testflight` is the production ref.

A related trap, same file family: `scripts/verify-schema.mjs` shares
`refFromJwt` and only compares when the ref is truthy, so if staging ever moves
to a new-format key its parity check degrades **silently** to `UNRESOLVED` and
still prints `parity: OK` instead of failing. Worth making it fail closed the
way the EAS gate does.

**B. "preview" names two different things.** `EXPECTED_REF` maps
`preview → STAGING_REF`, but `eas.json` declares no `preview` BUILD profile at
all, while the EAS **environment** named `preview` holds production credentials
and is what the `testflight` profile selects. Nothing is broken - the deliberate
`EXPECTED_REF.testflight → production` decision is what actually applies - but
the two files read together imply preview means staging, which is false. The
distinction is now documented in the `EXPECTED_REF` docblock.

**C. `EXPO_PUBLIC_PAYMENTS_MODE` still governs whether payments run.** Leaving
it unset reproduces the old `__DEV__` behaviour exactly. To get payments on a
release build, set `EXPO_PUBLIC_PAYMENTS_MODE=sandbox` in `.env` and **restart
Metro** (Expo inlines `EXPO_PUBLIC_*` at bundle time; a hot reload will not pick
it up). It is declared in `.env.example` as of commit `4d78ce9`.

**D. `RAISE NOTICE` is invisible in the Supabase SQL Editor.** The dashboard
renders query results only, and Postgres does not log below WARNING by default,
so the notices are not in the logs either. Any runbook step that said "read the
NOTICE output" was unfollowable. Acceptance for these single-transaction
migrations is **"Success. No rows returned." with no error** - the self-check
raises on failure and rolls the whole thing back - and the real gate is a green
`node scripts/verify-schema.mjs`. Corrected throughout
`docs/runbooks/phase67-account-deletion.md`, which keeps the expected NOTICE
text as a `psql`-only reference.

## One documentation error this run corrected, worth remembering

The previous HANDOFF and `docs/audits/STAGE4A_FINDINGS.md` both claimed
`docs/architecture.md:48` says payments are "disabled in a release". That line
is in the **Auth and session boundary** section and is about
`EXPO_PUBLIC_PHONE_AUTH_MODE`, where it remains exactly true. The dispatch
prompt for this run inherited the error from those documents. Two documents
agreeing is not evidence when one of them is where the other one read it. The
real gap - that `docs/architecture.md` documented the sandbox payment flow but
never said how availability is decided - is now filled in its Money section.
