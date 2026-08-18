# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## 2026-08-18 - 4D-3 dispatch STOPPED at base gate 2: 4D-2 never landed

**Zero code changes. No SQL executed, no database contacted, no dependency
added, nothing pushed, no locked file touched.** The only commit this run
made is this HANDOFF rewrite.

The 4D-3 dispatch (customer conversion, trust and rebook: hero customer job
detail, five-step progress unification, positive-only trust rows, Compare
Bids vertical stack, Saved & past workers) opens with a five-item base gate.
Item 2 requires a 4D-2 HANDOFF commit in `git log --oneline -10` and states:
"If 4D-2 has not landed, STOP - this batch reads surfaces 4D-2 unified." The
dispatch's STOP CONDITIONS repeat it. 4D-2 has not landed:

- No commit in the entire history mentions 4D-2
  (`git log --all --oneline --grep="4D-2"` returns nothing). The stage-4D
  batches that exist are 4D-1a, 4D-1b, 4D-A (read-only audit), 4D-B.
- `docs/audits/STAGE4D_PLAN.md:147` defines 4D-2 as "Worker discovery
  (worker tree only)": map rebuild, photo-first job cards, distance filter
  chips, market job detail with scope above the fold, deterministic
  match-reason checkmarks. None of that work is in the log under any label.
- The dispatch's own fingerprint for 4D-2 - its Phase 0.4 asks whether
  "4D-2's own-postings filter" leaked from worker discovery into a customer
  fetch - matches nothing: `fetchOpenJobs()` (`lib/jobs.ts:297`) filters on
  `status = 'open'` only, and no `.neq('client_id', ...)` exists anywhere in
  `lib/` or `hooks/`. The only own-postings skips in the tree are
  `screens/BrowseJobsScreen.tsx:111` (locked screen, unmounted since 4D-1b,
  pre-existing) and `lib/earningsMath.ts:53` (potential-earnings sum, not a
  discovery fetch). There is no filter to leak because the batch that would
  have added it never ran.
- 4D-1b's HANDOFF closed by noting the trust-rows / hero-detail / progress
  work "remains undispatched". Since then only 4D-A and 4D-B landed.

Rest of the gate, raw, for the record: branch `mainexpo` OK; tree clean OK
(`git status --porcelain` empty); `git grep -n "BrowseJobs" -- navigation/`
empty OK; `npm run verify` GREEN at gate HEAD 5163a1e - **595 pass / 0 fail
/ 0 skipped**. The tree is ready for whichever dispatch comes next.

**One 4D-3 dispatch premise is already stale.** It asserts "Not verified" is
still rendered on worker rows, "confirmed in a live screenshot of staging" -
that screenshot predates 4D-B. Commit 43d1e7f deleted
`components/VerificationBadge.tsx` and its seven render sites plus
JobDetailScreen's inline "Unverified" pill;
`git grep "Not verified" -- screens components ui lib hooks` returns nothing
today, and `tests/verificationBadgeRemoved.test.mjs` already pins the
absence with a tree walk. If 4D-3 is re-issued, its D1 is already done and
its D1 "PROVE IT" test already exists (the sole remaining user-visible
verification claim is locked `screens/WelcomeScreen.tsx:158` - operator item
G below). D2-D6 remain real, undone work.

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

**NEW - sequencing decision for the UI track.** The 4D-3 run stopped exactly
where its gate told it to; it made no judgment call. Two ways forward:
(a) dispatch 4D-2 (worker discovery, per `docs/audits/STAGE4D_PLAN.md:147`)
first, then re-issue 4D-3 unchanged; or (b) if the read-dependency on 4D-2
is no longer real, re-issue 4D-3 with base-gate item 2 amended to name the
batches that actually landed (4D-1b HANDOFF `2f987fc`, 4D-B HANDOFF
`2ff0e59`). If (b), also drop or rewrite Phase 0.4 - the own-postings filter
it hunts for was never added - and note that D1 is already satisfied by 4D-B
so the run can spend itself on D2-D6.

**A. Run `node scripts/verify-schema.mjs` against staging** - the only thing
that makes "phase74/75 applied" official; their two groups have never run.
**New since 4D-B: the env-parity gate now fails closed.** If `.env`'s
`SUPABASE_KEY` is a new-format `sb_…` publishable key the run will stop at
the parity gate (exit 3) with the remedy in the message; check the prefix
first: `sed -n 's/^SUPABASE_KEY=\(...\).*/\1/p' .env` prints only the first
three characters (`eyJ` = will proceed, `sb_` = will stop — swap in the
legacy `eyJ…` anon key for the staging project). No agent run can read the
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
