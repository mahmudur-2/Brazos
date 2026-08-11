# 00 — Executive Summary: BRAZOS Phase 0 Repository Audit

Audit date: 2026-08-08. Executed per `BRAZOS_MASTER_PLAN.md` §B, as Phase 0 of
the master plan (§J). Supersedes the 2026-08-04 executive summary below this
line's predecessor for every claim revised here; that pass's file-by-file
evidence for anything **not** revised below is still accurate and is not
re-derived from scratch. See `docs/emerald-v2/SCREEN_CROSSWALK.md` and
`docs/emerald-v2/DESIGN_SYSTEM_STATUS.md` for the full detail this summary
condenses.

## Branch and working-tree status

**Branch:** `v2` (HEAD `24bd550`), created directly from
`feature/emerald-v2-fidelity` HEAD `f295a65` — confirmed the correct,
authorized baseline (user-directed; `mainexpo` is an older, less-developed
branch missing the entire Emerald redesign). Working tree: clean before and
after this audit; the only changes are the `docs/emerald-v2/*.md` files
listed at the end of this document, plus `BRAZOS_BUILD_STATE.md`.

## Reality check

The app is expected to build and run: `node scripts/verify-schema.mjs`
passes clean (every checked object — phase15 through phase39 tables/columns/
RPCs — exists in the live database; phase40/41 remain outside the script's
coverage, a known pre-existing gap, not a new one). No TypeScript/lint run
was performed in this pass (not requested; `npm run verify` is unchanged
tooling per `package.json`).

**Bottom-nav/safe-area bug — confirmed still live in 6 of 7 originally-
affected screens.** `mainexpo`'s only unique commit, `f3e75d0` ("remove
duplicate bottom safe-area inset on tab-contained screens"), patched
`AdminReportsScreen`, `BrowseJobsScreen`, `CellJobsScreen`, `PostJobScreen`,
`ProfileReviewsScreen`, `WorkerProfileScreen`, `WorkerSearchScreen` to drop
`edges={['top', 'bottom']}` → `edges={['top']}` on their `SafeAreaView`,
because `MainTabs` (`App.tsx`) already folds `insets.bottom` into the tab
bar's own height, so reserving it a second time shows as a blank cream band.
Direct grep of the current `v2` source shows:

| Screen | Current `edges` prop | Bug present? |
|---|---|---|
| `BrowseJobsScreen.tsx` | `['top']` | No — already correct, independently arrived at through the Worker Home Emerald rebuild |
| `AdminReportsScreen.tsx` | `['top', 'bottom']` | **Yes** |
| `CellJobsScreen.tsx` | `['top', 'bottom']` | **Yes** |
| `PostJobScreen.tsx` | `['top', 'bottom']` | **Yes** |
| `ProfileReviewsScreen.tsx` | `['top', 'bottom']` | **Yes** |
| `WorkerProfileScreen.tsx` | `['top', 'bottom']` | **Yes** |
| `WorkerSearchScreen.tsx` | `['top', 'bottom']` | **Yes** |

**f3e75d0 verdict: NOT obsolete, NOT safe to cherry-pick verbatim.** The
underlying bug reproduces identically in 6 of the 7 files. It is not
obsolete. But a direct cherry-pick is not recommended: `PostJobScreen.tsx`
and `WorkerSearchScreen.tsx` have been substantially rewritten since the
patch was authored (different line counts/structure entirely — see
`SCREEN_CROSSWALK.md`), so the patch will likely fail to apply or apply to
the wrong lines. **Recommendation:** re-apply the same one-line fix
(`edges={['top', 'bottom']}` → `edges={['top']}`) fresh, by hand, to the 6
files above, in Phase 2 ("fix the bottom-nav breakage here if Phase 0
confirmed it" — master plan §J, Phase 2). This is a trivial, low-risk fix
once Phase 2 is underway; it is not applied now because Phase 0 is
read-only.

## What already works (confirmed this pass, current `v2` state)

The marketplace core remains real and RPC-hardened, and the Emerald redesign
has gone further than the 2026-08-04 snapshot in ways that matter for
sequencing later phases:

- **Screens 01–07 and 48 are genuinely finished to a locked-worthy
  standard.** Customer Home and Worker Home are both full Emerald redesigns
  (hero art, serif display type, forest/gold/mint palette, live data feeds),
  not placeholders. `BRAZOS_MASTER_PLAN.md` correctly locks them.
- **Radius search is real**, not a stub: `jobs_within_radius()`
  (`supabase/phase41_jobs_within_radius.sql`) does true Haversine
  great-circle distance against `job_locations`' exact coordinates,
  `security definer`, phase32-compliant explicit grant, never returns raw
  lat/lng of a job the caller doesn't own. Both `BrowseJobsScreen` (Worker
  Home) and `WorkerResultsScreen` (new) call it. The older
  `job_hotspots()`/`jobs_in_cell()` grid-cell system is untouched and still
  serves the map's density view — the two coexist deliberately, not in
  conflict.
- **Bid acceptance and job-request response are atomic**, via
  `security definer` RPCs that take row locks (`accept_bid`,
  `respond_job_request`, `transition_job_status`) — confirmed by direct SQL
  read this pass, not just by the existence of a test file.
- **RLS posture holds**: `profiles`/`jobs`/`bids`/`reviews`/`job_locations`
  have zero direct client INSERT/UPDATE/DELETE grants; every write goes
  through a validated RPC; `notification_outbox` and `worker_semantic_docs`
  have RLS on with zero policies (server/service-role-only, correct for data
  that must never be directly queryable); `job_locations` is party-scoped
  (client + assigned worker only), matching the address-privacy pattern the
  master plan requires — this pattern already exists and just needs
  preserving, not building.
- **Storage uploads are failure-safe** by construction: a single
  `upsert: true` PUT per file, so a failed request never deletes or
  corrupts the previous object. (One narrow, non-blocking gap: an avatar
  re-uploaded with a different file extension orphans the old file — no
  cleanup call exists for avatars the way `deleteJobPhoto` exists for job
  photos. Worth a small fix whenever avatar upload is next touched, not
  urgent.)
- **Post-job wizard is now a real 4-step flow** (Describe/Media/Location/
  Review), still correctly creating no `jobs` row until the final publish
  step — an improvement over the 2026-08-04 "merged into one screen" state.

## What is incomplete or newly-confirmed-gap (this pass)

1. **The customer/worker "mode" is a navigation illusion, not the target
   architecture.** `ModeTransitionOverlay` provides a genuinely polished
   branded transition, and `HomeScreen`/`BrowseJobsScreen` both wire into it
   via `useModeTransition()` — but underneath, there is still exactly one
   five-tab bar (`Home`/`Map`/`MyJobs`/`Messages`/`Profile`), shared by
   everyone. "Switching to Worker" pushes `BrowseJobs` onto the *same*
   `HomeStack`; the Home tab's re-press handler infers "we're in worker
   mode" by checking whether `BrowseJobs` is present on that stack
   (`App.tsx`, `tabPress` listener). There is no `CustomerParamList`/
   `WorkerParamList` type split, no `ModeProvider`, no `switchMode()`, and
   no `profiles.active_mode`/`mode_preference` column anywhere (confirmed by
   repo-wide grep — the only hits are documentation references, none in
   code). **This is real, substantial Phase 2/3 work, not wiring on top of
   something that already exists** — treat the existing mode-switch UX as
   valuable prior art (the overlay, the destination-mount timing) to
   preserve and re-home under the real architecture, not as a shortcut that
   shrinks Phase 2.
2. **Draft persistence does not exist.** `PostJobScreen`'s 4-step wizard
   state is plain `useState`, no `AsyncStorage` reference anywhere in the
   file — an app kill mid-post loses everything. The master plan's Phase 4
   DoD ("drafts survive app kill") is not yet met and has real work ahead of
   it, not a check-the-box item.
3. **A concrete race condition exists in the bid-acceptance compatibility
   fallback**, newly confirmed this pass by direct code read.
   `lib/acceptBidCompatibility.ts`'s `acceptBidWithoutRpc()` — which only
   runs if the `accept_bid` RPC ever drops out of PostgREST's schema cache
   (`PGRST202`) — does a read-then-multi-step-conditional-update sequence
   with **no row lock**, unlike the atomic RPC it's a fallback for. Two
   concurrent callers hitting this exact path simultaneously could
   interleave. It is explicitly labeled compatibility-only and is unlikely
   to be exercised in practice (the RPC is deployed and confirmed live by
   `verify-schema.mjs`), but it is live, reachable code with no test
   covering its concurrency behavior — worth a tracked note, not an
   emergency fix.
4. **A marketing/capability mismatch, not previously flagged**:
   `WelcomeScreen.tsx` renders a "Protected payment" badge with a lock icon.
   No payment, checkout, escrow, or ledger system exists anywhere in the
   codebase (confirmed by exhaustive grep this pass — the only "payment"
   hits are `lib/legal/termsOfService.ts` explicitly disclaiming that Brazos
   processes any payments). This is a product/copy decision, not an
   engineering one — flag to the user before Phase 4/8 rather than silently
   resolving it either direction.
5. **Scheduling/arrival-window field confirmed absent** from the post
   wizard (previously only suspected, per the 2026-08-04 audit). Atlas
   Screen 14 needs a real schema field, not just a UI section.
6. **Dead code**: `components/SectionHeader.tsx` exists, exports a working
   component, and is never imported anywhere in the repo. Left in place per
   Phase 0 policy (list-only, no deletion); candidate for Phase 13.

## VERIFY DURING REPOSITORY AUDIT — all tags resolved

Per `BRAZOS_MASTER_PLAN.md`, every tag below is now resolved:

| VERIFY item | Resolution |
|---|---|
| Router (expo-router vs react-navigation) | **react-navigation** (`@react-navigation/native` + `bottom-tabs` + `native-stack`). Plan adapts to this; never switch routers. |
| Server-state/cache layer | **None exists.** No TanStack Query, no other cache library in `package.json`. Server state is per-hook (`useJob`, `useJobDetail`, `useMyJobsHub`, `useConversations`, etc.), each doing its own fetch/refetch/realtime-subscribe. TanStack Query remains the master plan's one pre-approved addition, to be added in Phase 1 if the team chooses to close this gap then. |
| Radius-search mechanism | **Real Haversine RPC** (`jobs_within_radius()`, phase41), not PostGIS, not client-side filtering. The older `job_hotspots()`/`jobs_in_cell()` grid-cell RPCs remain in parallel for map density and are untouched. |
| Media-table structure | **Per-domain**, not polymorphic: `jobs.photos`/`jobs.videos`/`jobs.completion_photos`/`jobs.completion_videos` (jsonb array columns), `reviews.photos` (jsonb), `portfolio_items.photo_url` (single column, one row per image). No single generic media table exists. |
| Scheduled-function/cron pattern | **On-read-check only** — no edge-function/cron pattern found anywhere in `supabase/` or `scripts/`. The master plan's 72h auto-approve (§H.5) will need to be built as an on-read check first, per the plan's own fallback language. |
| Nav-bar/safe-area bug | **Confirmed still live** in 6 of 7 originally-patched screens (see Reality Check above); fix in Phase 2. |
| Auth implementation | **Email/password is the only real session-creating path** (`lib/AuthContext.tsx`, direct Supabase `auth.signUp`/`signInWithPassword`). Phone auth is a working, tested, provider-adapter-shaped mock (`lib/phoneAuth/`) — `EXPO_PUBLIC_PHONE_AUTH_MODE` env var selects `mock`/`supabase`/`disabled`; the real Supabase provider exists in code but is dormant/unprovisioned. E.164 normalization is real and tested (`lib/phoneNumber.ts`). |
| Messaging/realtime | **Real**, via Supabase Realtime `postgres_changes` on the `messages` table, filtered per-conversation (job or direct-thread) plus a second unfiltered inbox-level channel relying on RLS for scoping. Chat media is private, signed-URL-resolved (6h TTL), never a public URL. |
| Payment implementation | **Does not exist at any layer** — no table, no ledger, no provider, no UI beyond a single unbacked "Protected payment" marketing badge on `WelcomeScreen` (see gap #4 above). Confirmed via exhaustive grep, not just absence-of-evidence. |
| Generated DB types | **Do not exist.** No `database.types.ts` or equivalent anywhere in the repo. `jobs.status` and similar fields are typed as plain `string` in `lib/jobs.ts`; status comparisons use raw string literals (`'open'`, `'completed'`, etc.) throughout the data layer — the master plan's "no string literals for statuses" rule is not yet upheld anywhere and is real Phase 3 work. |
| Open-job bid counteroffer vs. job_requests mechanism | **Still two genuinely separate systems**, confirmed by direct SQL/code read this pass (`bids` table for public competitive bidding, no counter mechanism on it; `job_requests` for private negotiation, with a real 3-counters-per-side turn-taking counteroffer mechanism). The master plan's Phase 3 "job_offers unification or a mapping layer" decision remains open and should be made deliberately, not assumed — this audit does not decide it. |
| `reports` table vs. new dispute table | **Still unresolved**, unchanged from 2026-08-04 — `reports` exists (moderation-focused: no-show/unsafe/harassment/scam/other) but is not confirmed wired to the job-completion "report an issue" path. Product decision, not re-derived here. |
| Saved workers presence | **Still UNKNOWN** — not confirmed present or absent this pass either; grep before Phase 5/9 work touches it. |

## KEEP / FIX / CONSOLIDATE / REMOVE LATER / ADD

**KEEP as-is (do not rebuild, do not restyle):**
- Screens 01–07, 48 (locked). The entire marketplace RPC layer (`create_job`,
  `update_job_details`, `accept_bid`, `transition_job_status`,
  `create_job_request`, `respond_job_request`, `create_review`, and their
  RLS/grant posture). `job_locations`' privacy-split pattern. The
  `lib/phoneAuth/` provider-adapter shape (template for every future
  deferred integration). `jobs_within_radius()` and the older hotspot
  RPCs — keep both, they serve different UI needs. `lib/storage.ts`'s
  upload-is-upsert failure-safety pattern.

**FIX:**
- The 6-screen safe-area regression (Phase 2, see above).
- Avatar re-upload extension-change orphaning a stale file (small, whenever
  avatar upload is next touched).
- `WelcomeScreen`'s unbacked "Protected payment" badge (product decision:
  remove the claim, or scope it as real work before Phase 4/8).

**CONSOLIDATE (Phase 1, per `DESIGN_SYSTEM_STATUS.md`):**
- `lib/theme.ts` + `lib/authTheme.ts` into one token source. Core brand
  colors (forest/emerald/gold/goldSoft/mint/mint2/ink) already match
  `BRAZOS_MASTER_PLAN.md` §I exactly and should be preserved verbatim;
  radii and type scale do not match §I's target values and need
  reconciling; background/muted/border/danger are close-but-not-exact and
  are a judgment call, not an error.
- `Button`/`AuthButton`, `TextField`/`AuthField` — two palette-scoped
  families each, consolidate per §I's primitive list once Phase 1 tokens
  land.
- `BrowseJobCard`/`WorkerJobCard` into a real `ModeContext`-driven `JobCard`
  once `ModeContext` exists (Phase 2 dependency).

**REMOVE LATER (Phase 13, not now):**
- `components/SectionHeader.tsx` (confirmed dead — never imported).

**ADD (net-new, no existing equivalent to extend):**
- The dual-navigator mode-split architecture itself (Phase 2/3) —
  `ModeProvider`, `switchMode()`, typed `CustomerParamList`/
  `WorkerParamList`, `profiles.active_mode` column.
- Draft persistence for `PostJobScreen` (Phase 4).
- Generated DB types + canonical status enums (Phase 3).
- A real dev component catalog (Phase 1).
- `MoneyText`, `ChecklistCard`, `EvidenceGallery`, `ServiceCard`,
  `EmptyState`, `MediaGrid` shared components (as their respective phases
  need them — mostly Phase 4+, not Phase 1).
- Payment/ledger schema and sandbox adapter (Phase 4/8, per master plan).
- Scheduling/arrival-window field on `jobs` (Phase 3/4 migration).

## Recommended immediate next task

Per `BRAZOS_MASTER_PLAN.md` §J/§K: **Phase 1 — Design system foundation.**
Start from `DESIGN_SYSTEM_STATUS.md`'s "What Phase 1 genuinely needs to
build vs. what already exists" section — most of the primitive roles already
have a working component to extend/rename, and the core brand colors are
already correct; the real Phase 1 work is the radii/type-scale reconciliation,
one consolidated token file, and the dev catalog.

## Documents produced/updated this pass

- `docs/emerald-v2/SCREEN_CROSSWALK.md` (new — supersedes `02_SCREEN_CROSSWALK.md` for revised rows)
- `docs/emerald-v2/DESIGN_SYSTEM_STATUS.md` (new)
- `docs/emerald-v2/00_EXECUTIVE_SUMMARY.md` (this file, rewritten in place)
- `BRAZOS_BUILD_STATE.md` (updated separately)

The numbered docs `01`–`10` and `DECISIONS.md` (2026-08-04) are left
unmodified as historical reference; their claims not explicitly revised
above or in `SCREEN_CROSSWALK.md`/`DESIGN_SYSTEM_STATUS.md` remain accurate
and load-bearing.
