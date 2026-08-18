# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## 2026-08-17 - stage 4D-A: UI inventory audit (read-only)

**Audit-only run. No application code was changed, no SQL executed, no schema
object created or modified, no database contacted, no dependency added or
changed, and nothing was pushed.** One new file —
`docs/audits/STAGE4D_UI_INVENTORY.md` (2,310 lines, the six evidence sections
the 4D-A dispatch ordered) — plus this rewrite. `npm run verify` at the
starting HEAD `2f987fc`: **579 pass / 0 fail / 0 skipped** across 7 suites,
exit 0 (lint — `tsc --noEmit` with unused checks — runs first inside verify
and passed). Tree clean before the run; the commit contains exactly the audit
file and this document.

Method, for reproducibility: sections 1 (token compliance) and 4 (trust and
money copy) came from a mechanical regex scan over every non-comment line of
the 164 in-scope `.ts`/`.tsx` files (temporary scanner script at repo root
during the run, deleted before commit; multi-line JSX text and template
literals captured by a raw-line pass; every ambiguous match hand-verified
against source). Sections 2, 3, 5 and 6 are file-by-file reads. The frozen
web surface was excluded throughout; locked screens were read, never edited.

Headline findings — facts only, details and every line reference in the audit
file:

- **Token compliance:** 55 literal colours across 30 usage files and 878 bare
  numeric literals (padding/margin/gap/borderRadius/fontSize/lineHeight)
  across 95 usage files, listed per file. Exactly two files import
  `ui/tokens` directly: `lib/theme.ts` (the sanctioned wrapper) and
  `lib/authTheme.ts`. No screen or component imports tokens directly.
- **Screen states:** 0 of 49 screens render an offline state — the
  `kind:'offline'` variant in `ui/templates/ScreenStates.tsx` has zero
  consumers. 14 screens go through the ScreenStates templates at least
  partially; the rest handle states ad hoc or not at all (each ad-hoc
  construct is named with file:line). `ListScreen` is a template no screen
  uses.
- **Verification badge:** "Verified" renders iff
  `profiles.verification_status === 'verified'` exactly
  (`lib/profiles.ts:203-205`); 7 render sites, every chain ending at that one
  column. No migration in this repo ever writes `'verified'` (only
  `'unverified'`, on account deletion), the app cannot write the column
  (`update_my_profile` rejects it), and the enum's labels are defined by no
  file in the repo — any verified profile was set outside this repository.
- **Trust and money copy:** 27 user-visible word-list strings in app scope —
  dominated by "protected" (payment surfaces) and "fee"; zero user-visible
  uses of "escrow", "guarantee(d)", "0%", or "background check" in app copy;
  10 matches in `lib/legal/`, tabled separately as legal copy.
- **Map surface:** hotspot cells are aggregated server-side by
  `job_hotspots()` (current body phase43, search_path hardened phase64); the
  client only maps tiers, glow rings and tap polygons. `jobs_in_cell` returns
  no lat/lng and its rows are re-hydrated through the `OPEN_JOB_COLUMNS`
  allowlist.
- **Duplicated presentation:** four components plus the locked HomeScreen's
  local `OpenJobCard` render the same OpenJob-card concept while
  `ui/primitives/JobCard` has zero screen consumers; `StatusBadge` and
  `StatusPill` keep two separate status→colour/label maps; the
  `SectionHeader` and `SearchBar` primitives have no app consumers; money
  renders through `MoneyText` at 10 sites versus ~45 direct `formatBudget()`
  sites; the verification pill exists twice with different wording
  ("Unverified" in JobDetailScreen vs "Not verified" in VerificationBadge);
  the category-glyph block recurs at seven sites; "Best value" and
  "POTENTIAL EARNINGS" each have two implementations.

This run adds no new operator action; the audit is input for future 4D
dispatches. Operator item F (device-test 4D-1b) below remains open.

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
