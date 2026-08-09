# BRAZOS_BUILD_STATE
Updated: 2026-08-08

## Current phase
Phase 3B — Offer RPCs, RLS and application integration. **CODE-COMPLETE.**
**Phase 3 overall is PARTIAL, not CLOSED.**

phase43, 44, 45 and 46 are all applied and verified live (all ten phase46
checks flipped to OK on their own). **phase47 is written and NOT applied** — it
replaces phase46's two-call-site `bids` mirror with a trigger-driven
projection and repairs any drift that mirror left. `verify-schema.mjs` shows
every phase0–46 check OK and phase47's two as PENDING.

Phase 3 closes only when: (1) phase47 applied, (2) post-apply verify-schema
full PASS with zero PENDING, (3) a real-device regression pass. None has
happened. See "Exact next task".

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
- [x] 2 mode/nav · commits `e8cbb92`, `1696ec3`, plus this closure commit ·
  ModeProvider + switchMode(), typed Customer/Worker trees, ModeShell +
  ModeGuard, phase42 migration (applied + verify-schema green), BottomNav +
  JobCard primitives, six-screen safe-area fix. **PASS** — manually verified
  by the user: schema applied and confirmed via `verify-schema.mjs` (not a
  SQL Editor message), real Expo device mode-switch checklist all green (see
  Phase log entry below / "Manual verification" section for the checklist
  covered).
- [~] 3 data · **3A + 3B code-complete, phase 3 still PARTIAL** · `job_offers` unification decided
  and written: phase43 (structure, final), phase44 (bids backfill, final),
  phase45 (job_requests materialization, **DRAFT / held**). Decision doc:
  `docs/emerald-v2/ARCHITECTURE_DECISION_job_offers.md`. Nothing applied
  remotely; no RPC body, RLS policy (except a strict narrowing of
  `jobs_select_open`), or UI changed. 3B = RLS + `accept_offer` /
  `advance_job_status` + retire `bids`/`job_requests`.
  [ ] 4 post · [ ] 5 hire · [ ] 6 lifecycle · [ ] 7 messaging ·
  [ ] 8 discovery · [ ] 9 profiles · [ ] 10 reviews · [ ] 11 earnings ·
  [ ] 12 notifications · [ ] 13 hardening
(mark with commit hash + one-line note when done)

## Locked
Screens 01–07, 48. Frozen PWA. emerald-v2 references. Confirmed this pass:
Customer Home (`screens/HomeScreen.tsx`) and Worker Home
(`screens/BrowseJobsScreen.tsx`) are both full Emerald redesigns (hero art,
serif display type, live data feeds, mode-switch pill — since Phase 2 wired to
`switchMode()` rather than driving the overlay directly), genuinely
locked-worthy — not placeholders.

## Resolved VERIFY items
- router: **react-navigation** (`@react-navigation/native` + `bottom-tabs` + `native-stack`)
- server-state layer: **none exists** — no TanStack Query or equivalent; per-hook fetch/refetch/realtime pattern throughout (`useJob`, `useJobDetail`, `useMyJobsHub`, `useConversations`, etc.)
- radius search: **real Haversine RPC** (`jobs_within_radius()`, `supabase/phase41_jobs_within_radius.sql`) against `job_locations` exact coords; older `job_hotspots()`/`jobs_in_cell()` grid-cell RPCs kept in parallel for map density, untouched
- media tables: **per-domain**, not polymorphic (`jobs.photos`/`videos`/`completion_photos`/`completion_videos` as jsonb columns; `reviews.photos`; `portfolio_items.photo_url`)
- scheduled-function pattern: **on-read-check only** — no edge-function/cron pattern exists anywhere in the repo; the master plan's 72h auto-approve will need to be built as an on-read check first
- nav-bar bug: **confirmed still live** in 6 of 7 originally-patched screens (`AdminReportsScreen`, `CellJobsScreen`, `PostJobScreen`, `ProfileReviewsScreen`, `WorkerProfileScreen`, `WorkerSearchScreen`); `BrowseJobsScreen` alone was already correct. **Fixed in Phase 2** (`e8cbb92`), by hand rather than by cherry-pick, and now guarded by `tests/layout.test.mjs`.
- auth implementation: email/password (`lib/AuthContext.tsx`) is the only real session-creating path; phone auth is a tested mock (`lib/phoneAuth/`, `EXPO_PUBLIC_PHONE_AUTH_MODE` env var), real Supabase phone provider coded but dormant/unprovisioned
- messaging/realtime: real, via Supabase Realtime `postgres_changes` on `messages`, per-conversation + inbox-level channels; chat media private, signed-URL-resolved (6h TTL)
- payment implementation: **does not exist at any layer** — no table, ledger, provider, or real UI; one unbacked "Protected payment" marketing badge on `WelcomeScreen` flagged as a product/copy gap
- generated DB types: **do not exist** — `jobs.status` etc. typed as plain `string`; raw string-literal status comparisons throughout `lib/`
- open-job bid counteroffer vs. job_requests mechanism: **RESOLVED in Phase 3A (2026-08-08) — unify into `job_offers`.** `job_requests` and `bids` are both retired in Phase 3B. Full reasoning, the `offer_type`/`parent_offer_id` shape, the uniqueness design and the one-bid-ever-vs-one-active-chain decision are in `docs/emerald-v2/ARCHITECTURE_DECISION_job_offers.md`
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

### Phase 3A decisions (2026-08-08)

Full argument for each: `docs/emerald-v2/ARCHITECTURE_DECISION_job_offers.md`.

- **`bids` + `job_requests` → one `job_offers` table.** phase18's separation
  argument (only one side has counters) is obsolete now that §H.2 gives the
  public side counters too; phase33 is live proof that `job_requests`'
  duplicated job fields drift out of sync with `jobs` and break users.
- **No `kind = 'counter'`.** `offer_type` (`marketplace_bid` | `direct_offer`)
  is set once on the root; a counter is identified structurally by having a
  `parent_offer_id`. Inheritance of job/type/participants/root down a chain is
  enforced by a composite self-referencing FK, not by a trigger or by code —
  so "offer_type never changes within a chain" is a schema guarantee.
- **No separate negotiation-chain table.** The only thing it would hold is the
  tuple the composite FK already pins. Rejected for lack of evidence it was
  needed, as the brief required.
- **PRODUCT CHANGE, NEEDS SIGN-OFF: one ACTIVE chain per (job, worker), not
  one bid ever.** `bids`' unconditional `unique (job_id, worker_id)` cannot
  survive counter chains in any form, so the only question was how far to
  loosen. Under one-chain-ever, §H.2's new `withdrawn` and `expired` states
  would permanently bar a worker from a job they are still eligible for —
  Phase 5 is chartered to build both. Reversible in one line (append
  `and parent_offer_id is null` to `job_offers_one_live_bid_per_worker`).
- **phase18's per-pair direct-offer cap is preserved,** not repealed —
  otherwise phase45 would have silently dropped an existing anti-spam rule.
- **`job_private_details` = extend `job_locations`, not a new table.** phase12
  already implements §G's exact privacy shape and RLS; phase43 adds
  `address_line` + `access_notes` to it. Renaming it would break phase12/18/
  29/36/41 and three live RPCs.
- **`notification_prefs.bids` / `.hire_requests` are NOT merged** — routed by
  `offer_type`. `bids OR hire_requests` was rejected: it silently opts users
  into a category they never chose. Recorded only; Phase 12 implements.
- **`jobs.accepted_bid_id` NOT renamed** — the rename conflicts with the
  "don't touch lifecycle RPC bodies" guardrail (`accept_bid()` and
  `acceptBidCompatibility.ts` both write it). `accepted_offer_id` added
  alongside instead; Phase 3B flips writers and drops the old column.
- **`bids_job_id_fkey` NOT renamed** — `lib/bids.ts` and `lib/jobs.ts` name it
  in embed hints; renaming breaks them at runtime with no client change
  shipped this phase.
- **No hand-written DB types.** `supabase gen types` needs the CLI plus a local
  Postgres or a service-role connection — none present, and adding either is a
  flaggable new dependency. Nothing in 3A needs to compile against the new
  schema, so inventing unions now would create a second source of truth.
  Authoritative regeneration deferred to immediately after the Phase 3
  migrations are applied.

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

## Migrations written but NOT applied

`phase47_bids_projection_trigger.sql` — **final.** Replaces phase46's `bids`
mirror with an AFTER INSERT OR UPDATE trigger on `job_offers`, supersedes the
`create_bid`/`accept_bid` bodies so nothing writes `bids` by hand any more,
adds the `v_bids_projection_drift` diagnostic view, and reprojects every
marketplace chain to repair drift. The repair is unconditional and idempotent,
so it does not depend on knowing the drift count in advance; it aborts if any
row is still drifted afterwards.

## Migrations applied (verify-schema green)
phase45 (`phase45_job_requests_to_job_offers.sql`) + phase46
(`phase46_offer_rpcs_and_rls.sql`): **applied by the user via the Supabase SQL
Editor**, phase45 first as the enum dependency requires. Confirmed by a green
`node scripts/verify-schema.mjs` run — all ten phase46 checks flipped from
PENDING to OK on their own — 2026-08-08.

phase43 (`phase43_job_offers_foundation.sql`) + phase44
(`phase44_backfill_bids_to_job_offers.sql`): **applied by the user via the
Supabase SQL Editor and confirmed by a green `node scripts/verify-schema.mjs`
run** — all six phase43 checks flipped from PENDING to OK on their own, which
is the sentinel mechanism working as designed. phase44 confirmed separately by
row counts: 25/25 bids migrated, 24/24 accepted links set — 2026-08-08.

phase42 (`phase42_active_mode.sql`): **applied by the user via the Supabase
SQL Editor, then confirmed via a green `node scripts/verify-schema.mjs` run**
(all three phase42 checks OK) — 2026-08-08.

phase15 through phase39: all confirmed live via `node scripts/verify-schema.mjs`
(clean run, 2026-08-08). phase40/phase41 are not covered by the script
(pre-existing gap, not new) — phase41 (`jobs_within_radius`) is confirmed live
indirectly, since `BrowseJobsScreen`/`WorkerResultsScreen` call it successfully
in the running app per source inspection; not independently re-verified via
the script this pass.

## Phase 3B test changes (deliberate, itemised)

Baseline stays 212/214. Nothing lost coverage; assertions moved to the code
that replaced what they pointed at.

- `hardening.test.mjs` — "missing accept_bid deployments have a constrained
  compatibility path" **replaced** by "offer acceptance has no client-side
  fallback write path". The old test asserted the behaviour of
  `lib/acceptBidCompatibility.ts`, which this phase deletes on purpose; the
  new test asserts its absence and that `lib/offers.ts` contains no PGRST202
  fallback and no direct write, so reintroducing one fails here.
- `hardening.test.mjs` — the marketplace-writes test now reads
  `lib/offers.ts` and requires all four offer RPCs plus no direct write to
  `job_offers`, `bids` or `job_requests`.
- `customerCore.test.mjs` — five assertions retargeted from deleted files to
  their replacements: `createJobRequest`→`createDirectOffer`,
  `acceptBid`→`acceptOffer`, `BidWorkerCard.tsx`→`OfferCard.tsx`,
  `useJobBids.ts`→`useJobOffers.ts`, `setBids`→`setOffers`.

## Known issues
- **`PostJob` is unreachable from the worker Home tab** — navigating to it
  from anywhere inside `WorkerHomeStack` throws `The action 'NAVIGATE' with
  payload {"name":"PostJob"...} was not handled by any navigator`. Found during
  the Phase 3B device pass (2026-08-08).
  - **Cause:** `PostJob` is registered in `CustomerHomeStack` and in all three
    shared stacks (MyJobs, Messages, Map) but **not** in `WorkerHomeStack`,
    which does register `WorkerProfile`. `screens/WorkerProfileScreen.tsx:46`
    carries a comment asserting the opposite — "PostJob is registered alongside
    WorkerProfile in every stack that can reach this screen" — which was true
    when written and stopped being true when Phase 2 added the worker tree. It
    is a comment, so nothing type-checks it.
  - **NOT a Phase 3B regression.** `git diff 0e230bf..HEAD -- navigation/
    lib/navigation.ts App.tsx` is empty; `navigation/` was last touched by
    Phase 2's `e8cbb92`. It became reachable now only because the device pass
    is the first time these paths were walked in worker mode.
  - **UNRESOLVED: which call site.** The reported payload carried empty params,
    which does NOT match `WorkerProfileScreen.tsx:231` ("Send an offer", passes
    `hireWorkerId`). The bare `navigate('PostJob')` callers are
    `MyJobsHubScreen.tsx:129` and `WorkerSearchScreen.tsx:324`, and both live in
    stacks that DO register the route — so if the failure came from My Jobs it
    is a second, separate defect this diagnosis does not explain. Confirm the
    screen before fixing.
  - **Workaround in use:** post from the My Jobs tab (shared stack, registers
    the route) or switch to customer mode first.
  - **Do NOT fix by registering `PostJob` in `WorkerHomeStack`.** Posting a job
    and sending a paid offer are customer actions; §F and Phase 2's own recorded
    decision route cross-mode actions through an explicit confirm plus
    `switchMode()`, as Customer Home's Live Nearby cards already do. Adding the
    route would let a worker-mode session post jobs without ever switching mode
    and weaken the isolation Phase 2 exists to enforce. Owner: a future
    navigation phase, not Phase 3.
- **OfferCard hid the Accept button in worker mode** — found in the same device
  pass, fixed in `51e5c38`. A perspective gate added in phase-3b suppressed the
  accept affordance whenever the app was in worker mode, and `ClientJobDetail`
  is mounted in both trees, so an owner viewing their own job from the shared My
  Jobs tab could not hire anyone. Removed; guard test added. This was a real
  Phase 3B regression and is the clearest argument on record for not closing
  Phase 3 on SQL evidence alone.
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
- ~~Nav-bar/safe-area duplicate-bottom-inset bug live in 6 screens.~~
  **Fixed in Phase 2** by hand (not cherry-picked), guarded by
  `tests/layout.test.mjs`, and confirmed clean on a real device at closure.
- ~~Mode switch mounts a whole navigator tree inside the overlay's 500→700ms
  window, where it used to push a single screen — risk of a white/unpainted
  frame on a slow device.~~ **Confirmed clean on a real device at closure.**
  If a white frame ever does show up on a lower-end device than was tested,
  the fix is the overlay's `FALL_START_MS`, not a sleep in `switchMode()`.
- **Switching mode resets every tab's stack**, including an open chat or a
  half-filled Post-a-job wizard. That is §F's required behaviour ("resets
  navigation stacks"), and the wizard already warns before losing progress —
  but it is a real, deliberate behaviour change worth knowing about.
- `PostJobScreen` draft state is in-memory only (no `AsyncStorage`) — lost on app kill. Real gap against Phase 4's DoD.
- No scheduling/arrival-window field on `jobs` — confirmed absent (previously only suspected).
- `lib/acceptBidCompatibility.ts`'s `acceptBidWithoutRpc()` fallback (only runs on `PGRST202`, i.e. if `accept_bid` RPC ever drops from PostgREST's schema cache) does a non-atomic read-then-multi-step-update with no row lock — a real TOCTOU race, unlikely to be exercised since the RPC is confirmed live, but untested for concurrency. **Phase 3A verdict: not dead code** — `lib/bids.ts:2,196` and `tests/hardening.test.mjs:86,91` reference it, so it was left in place and marked in-file for **mandatory removal in Phase 3B**, when `accept_offer()` replaces `accept_bid()` and it has nothing left to fall back from.
- **`fetchJobsByClient()` (`lib/jobs.ts`) has no status filter** — it returns every job a client owns. Harmless today; it becomes a real defect the moment draft/direct jobs exist, so it is one of the two gates holding phase45. Fix it (or ship the draft-job UI) before applying that migration.
- **A worker cannot read the job a direct offer refers to before accepting it.** `jobs_select_assigned_worker` needs `assigned_worker_id`, which a live direct offer has not set. Phase 3B must add a policy for the targeted worker, or the offer surfaces will render an unreadable job.
- **Declined/closed `job_requests` have no migration path** into `job_offers` — they never produced a job row and `job_offers.job_id` is NOT NULL. phase45 deliberately skips them rather than fabricating a job. Phase 3B decides whether `job_offers` should carry dead negotiations at all (if yes, `job_id` must become nullable — a model change).
- **`bids` carries duplicate `public`- and `authenticated`-role RLS policies** (`workers view own bids` ≈ `bids_select_own`, `job owner views bids on their job` ≈ `bids_select_job_owner`) — leftovers from a role migration. The `public` pair is strictly weaker (no `is_profile_active(worker_id)` term) and, being permissive, ORs with the stricter pair, so the stricter one currently adds nothing. Untouched in 3A per the brief; Phase 3B's RLS consolidation should drop the `public` pair.
- Avatar re-upload with a changed file extension orphans the old storage object (no cleanup call, unlike `deleteJobPhoto` for job photos).
- `WelcomeScreen` shows a "Protected payment" marketing badge; no payment system exists anywhere in the codebase. Flag to user before Phase 4/8.
- `components/SectionHeader.tsx` is dead code (never imported) — left in place per Phase 0 policy, candidate for Phase 13 deletion.

## Gate status

Phase 3B (2026-08-08) — code-complete, phase45/46 not applied:
- **tsc**: PASS — `npm run lint` exits 0, clean.
- **eslint**: NOT RUN — still not installed, no config. Unchanged.
- **tests**: **212/214 PASS — same total, same two pre-existing failures, zero
  unexplained new ones.** Six assertions were deliberately retargeted and one
  test deliberately replaced; see "Phase 3B test changes" below.
- **verify-schema**: **PASS (pre-apply state, as specified).** Every phase0–44
  check OK, all ten phase46 checks `PENDING — NOT APPLIED`, exit 0. Post-apply
  contract: those ten become mandatory automatically and must all read OK.
- **locked screens**: PASS — `HomeScreen.tsx` and `BrowseJobsScreen.tsx`
  untouched, not even their imports. `hooks/useBidCounts.ts` survives as a
  one-line deprecated re-export of `useOfferCounts` specifically so both stay
  byte-identical.
- **mode-smoke**: N/A — no navigation or mode change. OfferCard reads
  `useModePerspective()` rather than taking a perspective prop.
- **rls-probe**: N/A this session — phase46's policies are unapplied. Re-run
  after applying, and specifically confirm a second worker cannot read another
  worker's offer on the same job.
- **device/simulator**: **NOT RUN — required before Phase 3 can close.**

**Phase 3B gate: green for everything that can be checked before the
migrations are applied. Phase 3 is NOT closed.**

Phase 3A (2026-08-08) — code complete, migrations not applied:
- **tsc**: PASS — `npm run lint` exits 0, clean.
- **eslint**: NOT RUN — still not installed, no config. Unchanged.
- **tests**: **212/214 PASS — identical to the Phase 2 baseline.** The same two
  pre-existing failures (`pwa.test.mjs` frozen-web version string,
  `setupOnboarding.test.mjs` CRLF mis-slice), zero new failures, zero new
  tests. Phase 3A adds no TypeScript, so the suite is unchanged by design.
- **verify-schema**: **PASS (pre-migration state, as specified).** Every
  phase15–phase42 check reports OK; all six phase43 checks report
  `PENDING — NOT APPLIED`; exit code 0. The script now supports a per-group
  `sentinel`: while the sentinel RPC is absent the group's checks are reported
  as pending and excluded from the failure total; the moment phase43 is applied
  the same checks become mandatory automatically. No earlier check was
  weakened and no missing object is reported as passing.
- **locked screens**: N/A — Phase 3A changed no screen. The only TypeScript
  edit in the phase is a doc comment in `lib/acceptBidCompatibility.ts`.
- **mode-smoke**: N/A — no navigation or mode change.
- **rls-probe**: N/A this phase — no policy is applied. phase43 contains
  exactly one policy statement, a strict narrowing of `jobs_select_open`
  (adds `visibility = 'open_market'`), and it is unapplied. Re-run the probe
  after applying phase43.
- **device/simulator**: N/A — nothing user-visible changed.

**Phase 3A gate: green for what 3A is allowed to do.** It is deliberately NOT
a phase closure: Phase 3 closes when 3B's RLS, `accept_offer` /
`advance_job_status` and the applied migrations are verified.

Phase 2 closure (2026-08-08):
- **tsc**: PASS — `npm run lint` exits 0, clean. Re-confirmed at closure.
- **eslint**: NOT RUN — still not installed, no config. Unchanged from Phase 1.
- **tests**: 212/214 PASS. The same 2 pre-existing failures, zero new. 25 new
  tests in `tests/mode.test.mjs`, all passing. Three existing guard tests were
  updated, not deleted, because they asserted the architecture Phase 2
  replaces: `customerCore` now reads route registrations from `navigation/`
  instead of `App.tsx`; `layout` reads the tab-bar arithmetic from
  `ui/primitives/BottomNav.tsx` (byte-identical, moved file) and gained a new
  assertion covering all nine tab-contained screens' `edges`; `setupOnboarding`
  asserts the landing choice now resolves a MODE rather than parking a
  navigate. Every original assertion's intent is preserved. Re-confirmed at
  closure.
- **verify-schema**: **PASS.** phase15–phase42 all OK, including phase42's
  `get_my_active_mode()`, `set_active_mode()`, and the
  `profiles.active_mode not publicly readable` privacy check. The migration
  was applied by the user via the SQL Editor; this run (not that editor's own
  "Success" message) is the proof.
- **locked screens**: PASS. Screens 01–06 byte-identical (git hashes compared
  before and after). 07 (`HomeScreen`) and 48 (`BrowseJobsScreen`) changed by
  wiring only — imports, the navigation type parameter, and the bodies of the
  switch/browse handlers. No JSX structure, style, token, string, layout or
  prop change; `git diff` contains no style-object or JSX-attribute edits other
  than two `onPress` handler names. Real-device visual check at closure found
  no regression.
- **mode-smoke**: **PASS.** Cross-tree `navigate()` is a compile error
  (asserted by `tests/mode.test.mjs`, and by tsc rejecting the old call sites
  before they were rewritten). Confirmed on a real Expo device: mode
  persistence across restart, both switch directions, tab re-press in both
  modes, rapid double-tap, all four shared tabs from both modes, no loop, no
  white frame during the transition. See "Manual verification performed"
  above for the full checklist.
- **rls-probe**: N/A this phase — no policy change. phase42 adds no grant on
  `profiles`, and `verify-schema` confirms `active_mode` stays unreadable with
  the publishable key.
- **device/simulator**: **PASS.** Manually verified by the user on a real
  Expo device — see "Manual verification performed" above for the full
  checklist. This closes the last open item from Phase 2.

**Phase 2 gate: fully green. Phase 2 is closed.**

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

## Phase 2 — what was built

### Architecture
- **`modes/`** — the one authoritative mode layer. `types.ts` is pure (no
  React/RN/Supabase) so its coercion, keying and precedence rules are executed
  by `tests/mode.test.mjs` rather than asserted as text. `ModeProvider.tsx`
  owns the state and is the only thing that may set it; `switchMode()` always
  confirms and has no opt-out flag. `ModeGuard.tsx` is the §F dev canary (logs,
  never blanks, never redirects). `perspective.tsx` supplies
  `useModePerspective()` plus a `__DEV__`-only `ModePreview` override used by
  exactly one caller, the catalog.
- **`navigation/`** — `CustomerRoot`, `WorkerRoot`, `sharedStacks`, `ModeShell`.
  Exactly one tree is mounted; swapping them IS the stack reset, so
  `switchMode()` needs no navigation choreography and there is no timer
  papering over a race. `App.tsx` no longer contains a navigator.
- **Typed split** — `CustomerParamList` / `WorkerParamList` (tabs) and
  `CustomerHomeStackParamList` / `WorkerHomeStackParamList` (the mode-defining
  Home tab). `HomeStackParamList` is deleted. Cross-tree `navigate()` is a tsc
  error, not a convention.
- **Persistence** — `profiles.active_mode` + `get_my_active_mode()` /
  `set_active_mode()` (phase42). Resolution precedence: Setup's just-made
  choice > server > device cache > `'customer'`. A missing RPC (phase42 not
  applied), an offline device, or a garbage value all fall back safely; an
  invalid mode cannot be stored (server check + column constraint) or held
  (`coerceAppMode` is the single narrowing point).

### The three named bugs, and how each is now structurally impossible
- *Customer-mode actions open Worker Home* — `BrowseJobs` is not in
  `CustomerHomeStackParamList` and not registered in `CustomerRoot`.
- *Home tab sends worker users back to Customer Home* — Worker Home is the
  ROOT of the worker Home stack, so popping to root is correct. The `tabPress`
  listener that used to infer mode from stack contents is deleted.
- *Customer "View all" crosses into worker behaviour* — it now takes §F's
  cross-mode route: an explicit confirm, then `switchMode('worker')`. Same for
  the Live Nearby cards (see Deferred).

### Files changed
New: `supabase/phase42_active_mode.sql` · `modes/{types,modeStorage,
ModeProvider,ModeGuard,perspective,index}` · `navigation/{CustomerRoot,
WorkerRoot,sharedStacks,ModeShell}` · `ui/primitives/{BottomNav,JobCard}` ·
`tests/mode.test.mjs`.
Modified: `App.tsx` · `lib/navigation.ts` · `lib/profiles.ts` ·
`lib/notificationRoutes.ts` · `screens/HomeScreen.tsx` (LOCKED, wiring only) ·
`screens/BrowseJobsScreen.tsx` (LOCKED, wiring only) ·
`screens/WorkerSearchScreen.tsx` · `screens/WorkerResultsScreen.tsx` ·
`screens/{AdminReports,CellJobs,PostJob,ProfileReviews,WorkerProfile}Screen.tsx`
(safe-area) · `ui/primitives/index.ts` · `dev-tools/ComponentCatalog.tsx` ·
`scripts/verify-schema.mjs` · `tests/{layout,customerCore,setupOnboarding}.test.mjs`.

## Phase 2 decisions (2026-08-08)

- **The tab set is unchanged (Home/Map/MyJobs/Messages/Profile), identical in
  both modes.** §F sketches `CustomerTabs: Home · Explore · Post(+) · Inbox ·
  Profile` and `WorkerTabs: Find Jobs · Map · My Work · Inbox · Profile`, but
  Explore (MarketplaceBrowse) is Phase 8 and the Post wizard tab is Phase 4 —
  those tabs have no screens yet. Renaming the existing four to §F's labels
  without their screens would be cosmetic churn on chrome that renders beneath
  LOCKED screens 07/48. The tab set is revisited when Phases 4/8 create what it
  is meant to point at.
- **Four tabs are genuinely shared, not duplicated.** A Brazos account is
  simultaneously customer and worker (CLAUDE.md: no role switch, no role gate),
  so its job hub, inbox, map and profile are the same surfaces in both modes.
  They are declared once in `navigation/sharedStacks.tsx` and mounted by both
  trees. §F "preserve shared routes"; §P.3 "no second version of a screen".
- **BottomNav is a config factory + item renderer, not a replacement
  `tabBar`.** React Navigation still draws the bar. The bar's correctness comes
  from a long argument with that library's internals (the
  `TAB_BAR_CONTENT_HEIGHT` arithmetic), and reimplementing it to satisfy the
  word "primitive" would risk exactly the pixel drift Phase 2 must not
  introduce on LOCKED screens. There is still one implementation; the catalog
  renders `BottomNavPreview` from the same renderer and constants.
- **JobCard is built but no screen was migrated onto it.** Migrating
  `BrowseJobCard` / `WorkerJobCard` / Home's `OpenJobCard` is a visual change
  to screens Phase 2 may not redesign, one of which is LOCKED. The primitive
  exists, is catalogued in both perspectives, and later phases adopt it per
  screen.
- **`switchMode()` adds a confirmation the locked homes did not have before.**
  Required by CLAUDE.md and §F ("mode changes ONLY via switchMode() with
  confirm + stack reset"). It changes behaviour, not rendered output — the
  pills, labels and disabled states are untouched. Flagged here rather than
  buried.
- **Customer Home's Live Nearby cards now open the cross-mode confirm instead
  of the worker bid screen.** The customer-safe destination is §E/§F's
  `MarketJobPreview`, which Phase 8 owns; building it here would be a new
  feature screen, explicitly outside Phase 2. Until then the honest behaviour
  for "show me the open-job marketplace" is §F's confirm-then-switch, not a
  silent push into a worker surface. Behaviour change on a LOCKED screen, no
  visual change.
- **`JobDetail` push notifications now route through the shared MyJobs tab.**
  They used to target the Home tab, which since the split only registers
  `JobDetail` in the worker tree — a customer-mode tap would have silently
  landed on Customer Home. MyJobs is mounted in both trees. §F's real answer is
  a mode segment in the payload, which Phase 12 owns.
- **`f3e75d0` still not cherry-picked; its fix applied by hand** to the six
  screens Phase 0 confirmed, exactly as recommended. `tests/layout.test.mjs`
  now asserts the absence of `edges={['top', 'bottom']}` across all nine
  tab-contained screens, so the regression cannot come back silently.

## Manual verification performed (Phase 2 closure, 2026-08-08)

**Supabase — done by the user:**
1. `supabase/phase42_active_mode.sql` applied via the Supabase SQL Editor.
2. `node scripts/verify-schema.mjs` re-run by the agent afterward and
   confirmed green: `phase42_active_mode.sql` shows OK for
   `get_my_active_mode()`, `set_active_mode()`, and
   `profiles.active_mode not publicly readable`; script exits 0. This is the
   proof — the SQL Editor's own "Success" message was not treated as one.

**Real Expo device — done by the user, all PASS:**
1. Session restores directly into the persisted mode, no opposite-mode flash.
2. Customer Home tab always returns to Customer Home.
3. Worker Home tab always returns to Worker Home.
4. Customer → Worker switch confirms, transitions, and lands correctly.
5. Worker → Customer switch confirms, transitions, and lands correctly.
6. Mode persists across kill/relaunch.
7. Rapid/double-tap on a switch pill produces exactly one confirm and one
   transition — no duplicates.
8. Shared Map / My Jobs / Messages / Profile tabs work correctly in both
   modes, same bottom bar in the same place.
9. No redirect/navigation loops observed.
10. No white/unpainted frame during the mode transition (the specific risk
    flagged in Known issues below, given the transition now mounts a whole
    tree instead of pushing one screen) — confirmed clean.
11. Safe-area/bottom-nav checks pass on the six screens fixed this phase.
12. Component Catalog's new BottomNav and JobCard sections confirmed correct
    (EST. PRICE / no bid button in customer perspective, EST. PAY / bid button
    / distance / "Break the ice" in worker perspective).

## Deferred out of Phase 2 (with the phase that owns each)

- **`MarketJobPreview`** (customer-safe job browsing) — Phase 8. Until it
  exists, Customer Home's marketplace entry points confirm-and-switch.
- **`JobDetail` reachable from the shared Map and MyJobs stacks in customer
  mode** — the same Phase 8 dependency. A customer drilling into a map cell can
  still reach the worker bid screen. Phase 2 closed the two leaks it owns and
  left this one flagged rather than half-fixed.
- **Deep-link scheme `brazos://c/…` / `brazos://w/…`** — §J lists it under
  Phase 2, but no linking configuration exists in the repo at all
  (`NavigationContainer` has no `linking` prop and no scheme is registered), so
  adding one is net-new deep-link plumbing rather than mode hardening. The
  cross-mode confirm it depends on is built and in use. Phase 12 wires the
  notification/deep-link router per §F and should add the scheme there.
- **Migrating existing job cards onto the `JobCard` primitive** — per screen,
  in the phase that touches that screen.
- **Generated DB enums for `active_mode`** — Phase 3, with every other status
  enum. `AppMode` is a hand-written union today, matching the DB constraint's
  two values exactly.

## Exact next task (apply phase47, then close Phase 3)

phase43–46 are live. Everything below is manual and none of it has been done.

1. **Optional pre-check** — measure the drift phase47 will repair:
   `select count(*) from public.v_bids_projection_drift;` will not work yet
   (the view ships in phase47). To see it beforehand, run the standalone audit
   query recorded in the Phase 3B report, or simply apply phase47 and read its
   `drifted rows BEFORE = n, AFTER = 0` NOTICE — it prints the same number.
2. **Apply `supabase/phase47_bids_projection_trigger.sql`.** Read the NOTICE
   lines. It aborts and rolls back if any chain is still drifted afterwards.
3. **Re-run `node scripts/verify-schema.mjs`.** Both phase47 checks must flip
   from PENDING to OK on their own. Only that green run counts as applied.
4. **Real-device regression pass**: bid → poster sees it and the count is right
   → accept → job assigns and rival offers settle; direct offer from a worker
   profile → counter from the other side → turn flips live → accept; My Jobs
   never shows a phantom draft.
5. **RLS probe**: a second worker cannot read another worker's offer on the same
   job; the job owner can read all of them.

**Only after 2–5 is Phase 3 CLOSED.** Until then it stays PARTIAL.

Carry forward, not part of Phase 3:
- The six legacy shims, the projection trigger, and
  `v_bids_projection_drift` all retire together in the first phase that ships
  a version gate (§11 of the decision doc), which also means updating the
  phase18/29/30/36/38 groups in `verify-schema.mjs`.
- Generated database types still do not exist.
- The §H.1 job-lifecycle enum beyond `draft`, and withdraw/expire (Phase 5).
