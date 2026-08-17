# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## 2026-08-17 - stage4D batch 1a: navigation restructure + mode purity

**App-code-only run. No SQL was executed, no schema object was created or
modified, no database was contacted, no dependency was added, and nothing was
pushed.** Four commits, one per dispatch work item
(`docs/dispatch/4D-1a.md`):

1. `8c49fbd` - customer bar becomes `Home · Discover · [ + ] · Messages ·
   Profile`. Discover mounts the existing WorkerSearchScreen (workers and
   services, never job postings) as a tab root; the raised forest [ + ]
   opens the existing ActionSheet with exactly Post a job / Hire someone
   again / My jobs, each through `navigateAcrossTabs()`. **Map and MyJobs
   stay registered on the customer tab navigator as HIDDEN routes**
   (`HIDDEN_TAB_ITEM_OPTIONS` in `ui/primitives/BottomNav.tsx`) instead of
   the dispatch's pushed-route-in-Home-stack sketch — React Navigation 7
   resolves an untargeted NAVIGATE against the dispatching navigator and its
   ancestors only (child propagation is gated on `action.target`; verified
   in the installed `@react-navigation/core` 7.21.11 `useOnAction.js`), so
   the LOCKED Home's `getParent()?.navigate('Map')` pill and every
   MyJobs-tab dispatch keep resolving only because those names stay on the
   tab navigator. Worker bar unchanged: five classic tabs.
2. `8ae3324` - new `screens/WorkerHomeScreen.tsx` roots the worker Home
   stack; locked BrowseJobsScreen (atlas 48) sits after it, unmodified, as
   "View all". Greeting + confirmed mode switch, phase53 `accepting_work`
   toggle via `updateProfile()` (the dispatch's named
   `hooks/useWorkerAvailability.ts` is actually a device-local
   online/offline preference, NOT the phase53 field — reported), potential
   earnings via new `openJobsPotential()` in `lib/earningsMath.ts`
   (executed against the locked screen's inline memo in tests), skill/nearby
   counts from the exact sources 48 uses.
3. `fc47df4` - MyJobsHub is mode-aware from ModeContext and retabbed to
   Active / Review / Closed through `lib/jobLifecycle.ts` only
   (`deriveMyJobsTab`, `myJobsNextAction`; `deriveJobLifecycle` now also
   mirrors phase51's on-read 72h auto-release client-side, dispute-frozen
   like the server). Worker mode renders no posting affordance. Every card
   carries a derived next-action primary label; HubCard demotes "View
   details". New one-query-per-fact batched reads: payment statuses
   (`lib/payments.ts`), open disputes (`lib/disputes.ts`), own reviews
   (`lib/reviews.ts`), settled declined/expired bids (`lib/offers.ts`).
4. `a1bd460` - cross-mode notification routing: destinations carry a mode
   affinity (`MODE_FOR_SCREEN`); a tap owned by the other mode prompts
   `switchMode()` (confirmation mandatory, in the provider) and routes only
   after it resolves. `switchMode()` now returns `Promise<boolean>`,
   resolving true only after the target tree is committed. Both consumers
   forward ModeContext via `hooks/useNotificationModeBridge.ts`.
   `tests/crossModeNotification.test.mjs` executes the real router with its
   two runtime imports stubbed.

`npm run verify` GREEN before the run (**547/547**) and after every commit;
final: **571 tests, 571 pass, 0 fail, 0 skipped**. No locked file, no
`design-reference/`, no frozen web/PWA surface, no `supabase/` file, no
`package.json` change anywhere in the diff (`git diff 95b8864..HEAD`).

Known follow-ups deliberately NOT done here (out of scope per dispatch):
the customer map stack still reaches `JobDetail` (documented Phase-8 gap);
the locked Home's "View map" chip removal is the operator's unlock session,
after which the hidden customer Map route can drop; 4D-1b owns trust rows,
hero job detail, progress unification, inbox chips.

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

**F. Device-test the 4D-1a navigation** (this run is suite-verified only;
no simulator was run): the four customer tabs + [ + ] sheet actions, the
locked Home's "View map" pill landing on the map, a bid notification tapped
in customer mode prompting the Worker-mode switch and landing on the job,
and My Jobs' Active/Review/Closed buckets against a job mid-approval.
