# BRAZOS_BUILD_STATE
Updated: 2026-08-08

## Current phase
Phase 1 — Design system foundation. **PASS / CLOSED.** All gates green,
including manual real-device verification (see Gate status). Next exact
task: Phase 2 — Mode & navigation hardening (see "Exact next task" at the
bottom).

## Phase log
- [x] 0 audit · commit `2aec323` · Repository audit executed per §B; two
  deliverable docs produced (`SCREEN_CROSSWALK.md`, `DESIGN_SYSTEM_STATUS.md`),
  executive summary rewritten with KEEP/FIX/CONSOLIDATE/REMOVE/ADD, all VERIFY
  tags resolved, `verify-schema.mjs` run clean, `f3e75d0` evaluated (needed,
  not obsolete, not cherry-picked — see Known issues). Zero application-code
  changes.
- [x] 1 design system · commits `13af291`, `8f0738c`, plus this closure commit ·
  `ui/tokens.ts` + 17 primitives + 4 templates + dev catalog. Locked screens
  byte-identical; shared brand values proven unchanged. **PASS** — manually
  verified on a real Expo iOS device by the user: typography/spacing/colors,
  buttons/inputs, chips/segmented tabs/status pills, ListRow/Avatar/
  RatingStars/Skeleton, StepHeader/MediaGrid/Sheet, EmptyState + all five
  template states, bottom scroll/nav clearance — no clipping, overflow,
  safe-area, font, or layout regressions observed.
- [ ] 2 mode/nav · [ ] 3 data ·
  [ ] 4 post · [ ] 5 hire · [ ] 6 lifecycle · [ ] 7 messaging ·
  [ ] 8 discovery · [ ] 9 profiles · [ ] 10 reviews · [ ] 11 earnings ·
  [ ] 12 notifications · [ ] 13 hardening
(mark with commit hash + one-line note when done)

## Locked
Screens 01–07, 48. Frozen PWA. emerald-v2 references. Confirmed this pass:
Customer Home (`screens/HomeScreen.tsx`) and Worker Home
(`screens/BrowseJobsScreen.tsx`) are both full Emerald redesigns (hero art,
serif display type, live data feeds, mode-switch pill wired to
`useModeTransition()`), genuinely locked-worthy — not placeholders.

## Resolved VERIFY items
- router: **react-navigation** (`@react-navigation/native` + `bottom-tabs` + `native-stack`)
- server-state layer: **none exists** — no TanStack Query or equivalent; per-hook fetch/refetch/realtime pattern throughout (`useJob`, `useJobDetail`, `useMyJobsHub`, `useConversations`, etc.)
- radius search: **real Haversine RPC** (`jobs_within_radius()`, `supabase/phase41_jobs_within_radius.sql`) against `job_locations` exact coords; older `job_hotspots()`/`jobs_in_cell()` grid-cell RPCs kept in parallel for map density, untouched
- media tables: **per-domain**, not polymorphic (`jobs.photos`/`videos`/`completion_photos`/`completion_videos` as jsonb columns; `reviews.photos`; `portfolio_items.photo_url`)
- scheduled-function pattern: **on-read-check only** — no edge-function/cron pattern exists anywhere in the repo; the master plan's 72h auto-approve will need to be built as an on-read check first
- nav-bar bug: **confirmed still live** in 6 of 7 originally-patched screens (`AdminReportsScreen`, `CellJobsScreen`, `PostJobScreen`, `ProfileReviewsScreen`, `WorkerProfileScreen`, `WorkerSearchScreen`); `BrowseJobsScreen` alone is already correct. Fix in Phase 2.
- auth implementation: email/password (`lib/AuthContext.tsx`) is the only real session-creating path; phone auth is a tested mock (`lib/phoneAuth/`, `EXPO_PUBLIC_PHONE_AUTH_MODE` env var), real Supabase phone provider coded but dormant/unprovisioned
- messaging/realtime: real, via Supabase Realtime `postgres_changes` on `messages`, per-conversation + inbox-level channels; chat media private, signed-URL-resolved (6h TTL)
- payment implementation: **does not exist at any layer** — no table, ledger, provider, or real UI; one unbacked "Protected payment" marketing badge on `WelcomeScreen` flagged as a product/copy gap
- generated DB types: **do not exist** — `jobs.status` etc. typed as plain `string`; raw string-literal status comparisons throughout `lib/`
- open-job bid counteroffer vs. job_requests mechanism: **still two separate systems**, confirmed unchanged; unification decision remains open, not made by this audit
- reports table vs. new dispute table: **still unresolved**, unchanged from 2026-08-04
- saved workers presence: **still UNKNOWN** — check before Phase 5/9

## Key decisions (dated one-liners)
- 2026-08-08: `v2` (not `mainexpo`) is the authoritative BRAZOS V2 development
  branch — created from `feature/emerald-v2-fidelity` HEAD, which contains
  the real Emerald redesign work; `mainexpo` is an older baseline missing it.
  User-authorized override of the prior `CLAUDE.md` mainexpo-only rule.
- 2026-08-08: `f3e75d0` (mainexpo's lone unique commit, a safe-area fix) is
  needed but was **not** cherry-picked — its underlying bug still exists in
  6 of 7 originally-patched files, but 2 of those (`PostJobScreen`,
  `WorkerSearchScreen`) have been rewritten enough that the patch itself
  won't cleanly apply. Re-apply the same one-line fix by hand in Phase 2.
- 2026-08-08: the existing customer/worker mode-switch UX
  (`ModeTransitionOverlay`, the Home/Worker Home switch pills) is real,
  polished, user-facing work to preserve and re-home under Phase 2/3's real
  dual-navigator architecture — not a shortcut that reduces Phase 2's scope.
  Phase 2 is still the full structural build (ModeProvider, switchMode(),
  typed param lists, `profiles.active_mode`).

### Phase 1 design-system decisions (2026-08-08)

- **`ui/tokens.ts` is the one authoritative token system.** Rather than a
  third parallel palette, the seven shared Emerald hues (forest, emerald,
  gold, goldSoft, mint, mint2, ink) are now defined once in `ui/tokens.ts`'s
  `brand` and spread into both `lib/theme.ts` and `lib/authTheme.ts`. A
  scripted comparison against HEAD proved all 14 resolved values byte-identical,
  which is what makes this safe for the LOCKED screens — they import those
  files and cannot shift.
- **Legacy values deliberately NOT changed.** `lib/theme.ts`'s `background`
  (#F4F1E8), `textMuted` (#6B7566), `border` (#DDD6C4), `danger` (#A8432B) and
  its older radii/type scale differ from §I's targets (#F6F3EA / #6E7771 /
  #DDE2DD / #9C3F35 and the 10/13/14/17/20/22 radii). §I's exact values live in
  `ui/tokens.ts` for new screens; migrating existing screens onto them is a
  per-screen visual change and therefore belongs to whichever later phase
  touches that screen — not a blanket Phase 1 rewrite.
- **§I's control sizes are overridden by CLAUDE.md.** §I specifies "Buttons:
  height 38 (small 28)"; both are below CLAUDE.md's ≥44pt touch-target floor.
  Shipped heights are 48/44 with §I's reference numbers recorded in comments,
  matching the resolution `lib/authTheme.ts` already made for the auth surface.
- **No Inter font bundled.** §I names Inter for the type scale; no custom font
  is loaded anywhere in this app by deliberate prior decision (D5 — a
  font-loading flash on the screens that most need to paint instantly). Body
  copy uses the platform sans, display headlines the platform serif the locked
  screens already render with.
- **§I primitive cap justification (required by §I's own wording).** §I says
  "~25 — hard cap; adding a 26th requires a justification line in BUILD_STATE",
  and §I's own enumerated list is **26 items**. The justification: the list is
  the plan's, not an expansion of it — no 27th primitive was invented, and 9 of
  the 26 are deferred rather than built, so Phase 1 ships 17. If anything the
  effective count is under the cap.
- **StatusPill's unions are local types, temporarily.** §I wants it
  "enum-driven" and §L bans status string literals, but generated DB types do
  not exist until Phase 3. The unions are transcribed from §H's canonical state
  machines, so callers are already compile-checked against the plan's values;
  Phase 3 retargets them at the generated enums with identical string values.
- **MoneyText owns its own copy.** The §H payment captions are a fixed internal
  map with no prop to override them — a screen cannot label held funds "paid",
  because there is no API to do so.

## Phase 1 — primitives and templates

**Built new (8):** StatusPill, MoneyText, EmptyState, ListRow, SearchBar,
Sheet, StepHeader, MediaGrid.

**Consolidated by re-export, not duplicated (9):** Button, Card, Chip, Avatar,
Skeleton, SegmentedTabs (=SegmentedControl), TopBar (=ScreenHeader),
RatingStars (=StarRating), Input (=TextField, plus PhoneNumberInput). There is
still exactly one implementation of each — `ui/primitives` is a canonical
import path, not a second copy. Existing screens keep their old imports.

**Deferred (9), each blocked on a later phase — see the DEFERRED block at the
bottom of `ui/primitives/index.ts` for the per-item reasoning:** BottomNav
(Phase 2 — belongs to the navigator, and Phase 2 makes it mode-aware),
JobCard (Phase 2 — §I requires ModeContext, which does not exist yet),
MediaUploader (Phase 4 — listed explicitly there), WorkerCard + BidCard
(Phase 5 — `BidWorkerCard` serves both today), ChecklistCard + EvidenceGallery
(Phase 6 — no schema), ServiceCard (Phase 9 — no schema), LiveJobMap
(Phase 6/8 — map technology decision still open).

**Templates (4 of 6):** FormScreen (+wizard mode), ListScreen, DetailScreen,
SuccessScreen — each taking one `state` prop that renders all five non-ready
states from `ui/templates/ScreenStates.tsx` (loading skeleton/spinner, empty,
error+retry, offline, permission-denied). InboxScreen/ChatScreen are Phase 7
per the master plan and were not built.

**Dev catalog:** `dev-tools/ComponentCatalog.tsx`, registered in `App.tsx`
under `__DEV__` only (the route is not registered at all in production, rather
than merely hidden), reached from a `__DEV__`-gated row on the Profile tab.

## Migrations applied (verify-schema green)
phase15 through phase39: all confirmed live via `node scripts/verify-schema.mjs`
(clean run, 2026-08-08). phase40/phase41 are not covered by the script
(pre-existing gap, not new) — phase41 (`jobs_within_radius`) is confirmed live
indirectly, since `BrowseJobsScreen`/`WorkerResultsScreen` call it successfully
in the running app per source inspection; not independently re-verified via
the script this pass.

## Known issues
- ~~Device verification of the Phase 1 catalog was NOT performed by the
  agent.~~ **Resolved 2026-08-08**: user manually verified the catalog on a
  real Expo iOS device (Profile tab → "Component catalog (dev)") per the
  repo rule that Expo is never started from an agent session. Result: PASS —
  see the Phase log entry above for the checklist covered. No layout, safe-area,
  font, clipping, or overflow regressions observed.
- **ESLint was not run and is not installed.** `npx eslint .` would have to
  install the package (it is in neither `dependencies` nor `devDependencies`)
  and would then fail for lack of any config file — confirmed again this phase,
  consistent with DECISIONS.md D13. The repo's actual lint is
  `npm run lint` (`tsc --noEmit --noUnusedLocals --noUnusedParameters`), which
  is clean. No dependency was installed, per the standing rule.
- **2 pre-existing test failures, unchanged by Phase 1** (187/189 pass, both
  before and after — verified by stashing the Phase 1 work and re-running at
  HEAD): (1) `pwa.test.mjs` "web build is installable…", the documented frozen
  web-surface version-string mismatch; (2) `setupOnboarding.test.mjs`
  "navigation only ever follows a successful write", which slices
  `SetupScreen.tsx` on `'}\n\n'` and mis-slices under CRLF line endings — a
  brittle assertion, not a real regression in the screen. Neither was
  introduced here and neither was fixed here (out of Phase 1 scope).
- Nav-bar/safe-area duplicate-bottom-inset bug live in 6 screens (see above) — fix in Phase 2.
- `PostJobScreen` draft state is in-memory only (no `AsyncStorage`) — lost on app kill. Real gap against Phase 4's DoD.
- No scheduling/arrival-window field on `jobs` — confirmed absent (previously only suspected).
- `lib/acceptBidCompatibility.ts`'s `acceptBidWithoutRpc()` fallback (only runs on `PGRST202`, i.e. if `accept_bid` RPC ever drops from PostgREST's schema cache) does a non-atomic read-then-multi-step-update with no row lock — a real TOCTOU race, unlikely to be exercised since the RPC is confirmed live, but untested for concurrency.
- Avatar re-upload with a changed file extension orphans the old storage object (no cleanup call, unlike `deleteJobPhoto` for job photos).
- `WelcomeScreen` shows a "Protected payment" marketing badge; no payment system exists anywhere in the codebase. Flag to user before Phase 4/8.
- `components/SectionHeader.tsx` is dead code (never imported) — left in place per Phase 0 policy, candidate for Phase 13 deletion.

## Gate status
Phase 1 closure (2026-08-08):
- **tsc**: PASS — `npm run lint` (`tsc --noEmit --noUnusedLocals
  --noUnusedParameters`) exits 0, clean. Re-confirmed at closure.
- **eslint**: NOT RUN — not installed, no config file in repo; installing it
  was explicitly out of scope. Consistent with DECISIONS.md D13.
- **tests**: 187/189 PASS, 2 pre-existing failures, zero new. Baseline
  re-measured at HEAD (stash/pop) to confirm neither was introduced by
  Phase 1; re-confirmed at closure.
- **verify-schema**: PASS as of Phase 0; not re-run (Phase 1 touched no DB).
- **locked screens**: PASS — screens 01–07 and 48 byte-identical (`git diff`
  empty across all 11 files), and the shared brand token values they depend on
  proven unchanged against HEAD by a scripted 14-value comparison. Re-confirmed
  at closure.
- **mode-smoke**: N/A — the mode split does not exist yet (Phase 2 deliverable).
- **rls-probe**: N/A this phase — no policy or schema change.
- **device/simulator**: **PASS.** Manually verified by the user on a real
  Expo iOS device (not a simulator) — see the Phase log entry above for the
  full checklist. This closes the one open item from the earlier report.

**Phase 1 gate: fully green. Phase 1 is closed.**

## Exact next task (Phase 2 — Mode & navigation hardening)
Per BRAZOS_MASTER_PLAN.md §J. In order:
1. Add `profiles.active_mode` as a new numbered migration
   (`supabase/phase42_active_mode.sql`) — written for the user to run, never
   executed by an agent. Include an explicit
   `grant execute … to authenticated` on any new RPC (the phase32 lesson).
2. Build `ModeProvider` + `switchMode()` (confirm → persist `active_mode` →
   reset both stacks to tab roots → swap trees). `switchMode()` must be the
   only path that changes mode.
3. Split `CustomerParamList` / `WorkerParamList` so cross-tree
   `navigate()` is a compile error; mount exactly one tree under the root.
4. Re-home the existing `ModeTransitionOverlay` UX onto `switchMode()` — it is
   good work and must be preserved, not rebuilt.
5. Add the `ModeGuard` dev assertion.
6. **Fix the safe-area regression while here** (Phase 0 confirmed it live):
   change `edges={['top', 'bottom']}` → `edges={['top']}` in
   `AdminReportsScreen`, `CellJobsScreen`, `PostJobScreen`,
   `ProfileReviewsScreen`, `WorkerProfileScreen`, `WorkerSearchScreen`.
   `BrowseJobsScreen` is already correct. Do not cherry-pick `f3e75d0` — two
   of those files were rewritten since and the patch will not apply cleanly.
7. Build the `BottomNav` and mode-aware `JobCard` primitives deferred from
   Phase 1, now that `ModeContext` exists to drive them.
