# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## 2026-08-17 - stage4D batch 1b: one worker home

**App-code-only run. No SQL was executed, no schema object was created or
modified, no database was contacted, no dependency was added or changed, and
nothing was pushed.** Three code commits plus this rewrite, per
the 4D-1b dispatch ("one worker home"):

1. `f9d40cd` - every job-list intent resolves to `WorkerResults{mode:'all'}`
   while BrowseJobs was still mounted: WorkerHome's "View all"
   (was `navigate('BrowseJobs')`) and MapScreen's worker-gated "See All
   Jobs" (was `navigateAcrossTabs('Home','BrowseJobs')`), both mirroring
   the locked screen 48's own "View all" dispatch byte-for-byte. The worker
   Home stack now declares `initialRouteName="WorkerHome"` explicitly.
2. `e222a8b` - the search field moves up to WorkerHome (D2): placed between
   the greeting/switch row and the taking-new-work card, mirroring 48's
   inline field (48 does NOT use `ui/primitives/SearchBar` - checked) and
   its exact dispatch `WorkerResults{mode:'search', query: trimmed}` with
   the same trim-and-guard. KeyboardAvoidingView + keyboardShouldPersistTaps
   added per `.claude/rules/native-ui.md`; nothing visual.
3. `0fe3470` - BrowseJobs UNMOUNTED: registration + import removed from
   `navigation/WorkerRoot.tsx`; `BrowseJobs` removed from
   `WorkerHomeStackParamList` so a future `navigate('BrowseJobs')` is a
   compile error. The locked `screens/BrowseJobsScreen.tsx` itself is
   untouched - on disk, registered nowhere, dispatched to by nothing.
   New executed contract T1-T7 in `tests/workerHome.test.mjs`; mode /
   setupOnboarding / crossTabNavigation suites flipped to the new truth,
   none weakened. Stale prose corrected (`docs/architecture.md` still
   claimed the worker stack rooted at `BrowseJobs` - pre-4D-1a state).

**The defect this run closed:** two unrelated availability stores were both
user-visible - WorkerHome's "Taking new work" writes server-side
`profiles.accepting_work` (phase53, what customers see) while the old browse
screen's "Online/Offline" wrote a device-local AsyncStorage value nobody
else can read (confirmed contradicting on device). The device-local writer
is now unreachable by construction: its only consumer is the unmounted
locked screen (T6 asserts exactly that consumer set).

**D3 took its leave-in-place branch, deliberately.** Screen 48 is
`hooks/useWorkerAvailability.ts`'s SOLE consumer, but the dispatch's
delete-the-hook branch is unexecutable: the locked screen is type-checked
(tsconfig has no `include` narrowing, so unmounted files still compile) and
deleting the hook would strand a locked import. The hook stays on disk,
byte-identical, exactly like the locked screen that consumes it. No test of
the hook's own device-local behavior existed to delete. Removing both
together is a future unlock-session item.

**Landing-route finding (dispatch section 0.3):** switchMode() never
resolved a route name - it swaps whole navigator trees (ModeShell), and the
worker Home stack previously relied on declaration order alone. No
`initialRouteName` existed anywhere in the repo, no persisted navigation
state exists (`NavigationContainer` has no `initialState`/`onStateChange`),
and `lib/setupLanding.ts` resolves a MODE, not a route. The reported
sometimes-lands-on-BrowseJobs symptom therefore had no reproducible
route-resolution mechanism in the current source; the fix is structural
regardless - explicit initialRouteName (T4) plus the unmount, after which no
BrowseJobs route exists to land on (T1-T3).

`npm run verify` GREEN at the base (571/571) and after every commit:
571 after commit 1, 572 after commit 2 (+1 search-field test), **579 after
commit 3** (+7 T-contract tests). 0 fail, 0 skipped throughout. No locked
file, no `design-reference/`, no frozen web/PWA surface, no `supabase/`
object, no `.claude/` file, no `package.json` change in the diff
(`git diff 142517a..HEAD`).

Note: the previous HANDOFF forecast 4D-1b as "trust rows, hero job detail,
progress unification, inbox chips" - the actual 4D-1b dispatch was this
consolidation instead; that other work remains undispatched.

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

**B. The next TestFlight build will fail its own gate** (unchanged from
Stage 4A): the EAS `preview` environment's `SUPABASE_KEY` is a new-format
publishable key (`sb_pu…`); `refFromJwt` cannot resolve it, so
`evaluateGate` fails closed. Replace with the legacy `eyJ…` anon key -
**production's**, because the `testflight` profile selects the `preview`
environment and `EXPECTED_REF.testflight` is the production ref. Related:
`verify-schema.mjs` shares `refFromJwt` and would silently degrade to
`UNRESOLVED` on a staging key-format move; worth making it fail closed.

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

**F. Device-test 4D-1b** (this run is suite-verified only; no simulator was
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
