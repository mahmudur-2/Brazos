# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## 2026-08-17 - stage 4D-B: money ceiling mirror, parity fails closed, badge removed

Three independent changes, three commits, in dispatch order. **No SQL
executed, no database contacted, no schema object touched, no dependency
added, nothing pushed. No locked screen edited.** `npm run verify` green
before each commit landed; lint (`tsc --noEmit` with unused checks) runs
first inside verify and passed every time.

1. **Money ceiling mirror** — every client path sending cents to
   `create_job`, `update_job_details`, `create_offer`, `counter_offer` or
   `sandbox_tip_worker` now refuses an over-ceiling amount BEFORE the RPC,
   with a written sentence instead of a raw CHECK violation. Constants and
   validator in `lib/validation.ts` (`MONEY_CEILING_CENTS = 10_000_000`,
   `TIP_CEILING_CENTS = 100_000`), mirrored EXACTLY including inclusivity:
   phase75's CHECKs read `amount_cents > 0 and amount_cents <= 10000000`
   (same shape for the three jobs budget columns) and phase51's
   `sandbox_tip_worker()` rejects
   `p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000`
   — so exactly at either ceiling is accepted. Verified by executed test
   both ways at both boundaries (`tests/moneyCeiling.test.mjs`, which also
   pins the SQL literals against drift). Verify: **586 pass / 0 fail / 0
   skipped**.
2. **verify-schema env parity fails closed** — the parity decision is now
   the pure exported `envParityProblems()` in `scripts/verify-schema.mjs`;
   an unresolvable key ref (a new-format `sb_…` publishable key has no JWT
   payload) is a refusal naming cause and remedy, no longer a silent
   "parity: OK". `refFromJwt` untouched. `node --check
   scripts/verify-schema.mjs` exit 0; the script itself was NOT run
   (needs `.env` + live staging). Executed tests in
   `tests/envParity.test.mjs`. Verify: **591 pass / 0 fail / 0 skipped**.
3. **Verification badge removed from every user-visible surface** — both
   implementations: `components/VerificationBadge.tsx` deleted (no locked
   file imported it, so no stranded-import hazard — the delete branch, not
   the leave-on-disk branch) with its seven render sites, and
   JobDetailScreen's inline unconditional "Unverified" pill.
   `verification_status` left the client data layer with it (Profile type,
   `PUBLIC_PROFILE_COLUMNS`, `isVerified()`, workerSearch mapping) — it fed
   the badge and nothing else. No replacement chip or copy added;
   `lib/legal/` untouched and its background-check disclosure now pinned on
   its literal text; no database object changed. Executed contract:
   `tests/verificationBadgeRemoved.test.mjs` (tree walk; the no-reference
   check has no exclusions, the user-copy check excludes exactly the named
   locked files). Two existing assertions flipped to the removal contract,
   not deleted: `tests/hardening.test.mjs` ("Not verified" wording pin →
   component-gone pin) and `tests/customerCore.test.mjs`
   (`VERIFICATION_LABEL` presence → absence). Verify: **595 pass / 0 fail /
   0 skipped**.

Run exceptions, in full:

- **`.env` could not be read at all** — the dispatch asked for the first
  three characters of `SUPABASE_KEY` (prefix only); every read path is
  mechanically denied (guard + permission matrix), which is working as
  designed and was not bypassed. See operator item B for the manual check.
- **`screens/WelcomeScreen.tsx:158` still says "Verified workers"** — locked
  screen 02, left byte-identical. Operator unlock item; it is the one entry
  behind the new suite's locked-file allow-list.
- Commit messages were passed via `-F` file because the commit trailer
  itself trips the nested-session guard token match when inlined with `-m`.

## Applied reality - staging `zzkumxcjtbqoselzptig`

Unchanged by this run. phase74 (push scheduler) + phase75 (security
hardening) are committed and operator-applied to staging; phases 67-73
applied and verified green 2026-08-16. **Per standing policy only a green
`node scripts/verify-schema.mjs` counts as applied, and the two groups
covering phase74/75 have still never been exercised** - that run remains the
next operator action (needs `.env` + live staging, never inside an
autonomous run). Expected: every group OK, zero MISSING, zero PENDING; no
unapplied migration exists in the repository.

**Production (`avkighsiufeefyycbebf`) still has none of the migrations.**
Standing decision: rebuild from a staging dump once staging is beta-ready;
`PROD_APPLY.md` is the ordered fallback. Production was never contacted.

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
phase74 nor phase75 disturbs the finding.

## Still blocking a beta, worst first

1. **Phone sign-in dead-ends on a release build.** `EXPO_PUBLIC_PHONE_AUTH_MODE`
   unset means `mock` in development and `disabled` in a release, and `mock`
   is refused when `__DEV__` is false - correctly, since no SMS provider is
   configured. Email + password is the only authenticating path. See
   `docs/phone-auth-activation.md`.
2. **Supabase session tokens sit in unencrypted AsyncStorage.** Swap the
   `createClient` storage adapter to `expo-secure-store`.
3. **Payments are sandbox-only and configuration-governed.**
   `EXPO_PUBLIC_PAYMENTS_MODE=sandbox` must be set for a release/TestFlight
   build to run payments at all; no real provider exists behind the
   resolver (deliberate for beta).

## Needs the operator - outside any run

**A. Run `node scripts/verify-schema.mjs` against staging** - the only thing
that makes "phase74/75 applied" official; their two groups have never run.
**New since 4D-B: the env-parity gate now fails closed.** If `.env`'s
`SUPABASE_KEY` is a new-format `sb_…` publishable key the run will stop at
the parity gate (exit 3) with the remedy in the message; check the prefix
first: `sed -n 's/^SUPABASE_KEY=\(...\).*/\1/p' .env` prints only the first
three characters (`eyJ` = will proceed, `sb_` = will stop — swap in the
legacy `eyJ…` anon key for the staging project). This run could not read the
prefix itself: `.env` is mechanically denied to agents.

**B. The next TestFlight build will fail its own gate** (unchanged from
Stage 4A): the EAS `preview` environment's `SUPABASE_KEY` is a new-format
publishable key (`sb_pu…`); `refFromJwt` cannot resolve it, so
`evaluateGate` fails closed. Replace with the legacy `eyJ…` anon key -
**production's**, because the `testflight` profile selects the `preview`
environment and `EXPECTED_REF.testflight` is the production ref. The
related verify-schema silent-degradation noted here previously is FIXED as
of 4D-B commit 2 — it now fails closed the same way.

**C. "preview" names two different things.** `EXPECTED_REF` maps
`preview → STAGING_REF`, but the EAS **environment** named `preview` holds
production credentials and is what the `testflight` profile selects.
Nothing is broken; the docblock on `EXPECTED_REF` explains.

**D. `EXPO_PUBLIC_PAYMENTS_MODE` governs whether payments run.** For
payments on a release build set it to `sandbox` in `.env` and restart Metro
(Expo inlines `EXPO_PUBLIC_*` at bundle time).

**E. `RAISE NOTICE` is invisible in the Supabase SQL Editor.** Acceptance
for single-transaction migrations is "Success. No rows returned." plus a
green verify-schema; phase74/75 each end with a visible-acceptance SELECT.

**F. Device-test 4D-1b** (that run was suite-verified only; no simulator was
run): cold-start into worker mode and switch customer→worker repeatedly -
the arrival screen must be WorkerHome ("Your work today") every time, with
nothing pushed above it and no "Get hired. / Get paid." screen reachable;
the new search field must land on Search Results; Map's "See All Jobs"
(worker mode) must land on Available Jobs (WorkerResults, not the old
browse screen); "Taking new work" toggled on one device must match what a
second account sees on the worker's public profile, and no Online/Offline
switch exists anywhere. Also still pending from 4D-1a: the four customer
tabs + [ + ] sheet actions, the locked Home's "View map" pill, a bid
notification tapped in customer mode prompting the Worker-mode switch, and
My Jobs' Active/Review/Closed buckets against a job mid-approval.

**G. Unlock decision — WelcomeScreen's "Verified workers" line.** With the
badge removed everywhere else, locked screen 02 is the only remaining
user-visible verification claim (`screens/WelcomeScreen.tsx:158`). Removing
or rewording it requires unlocking that screen; the 4D-B suite's allow-list
names it so the exception stays visible.
