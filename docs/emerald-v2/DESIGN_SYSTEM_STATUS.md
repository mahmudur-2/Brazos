# Design System Status (Phase 0 — BRAZOS_MASTER_PLAN.md §B.7)

Audit date: 2026-08-08. Branch `v2` (HEAD `24bd550`).

Answers the two-part question §B.7 asks: do shared tokens/components exist,
and do the locked screens (01–07, 48) consume them or carry standalone
styles? **Both are true, partially** — see below. This document is additive
to `04_DESIGN_SYSTEM_PLAN.md` (2026-08-04, still substantially accurate);
it verifies and updates the token-value claims specifically, since
`lib/theme.ts` changed materially since that doc was written.

## Locked screens — styling source

- **Screens 01–06** (`WelcomeScreen`, `SignInScreen`, `EmailSignInScreen`,
  `CreateAccountScreen`, `EmailCreateAccountScreen`, `VerifyPhoneScreen`,
  `SetupScreen`, `LegalGateScreen`) consume `lib/authTheme.ts` — a separate,
  parallel token file (`authColors`, `authRadius`, `authShadows`,
  `authSpacing`, `authType`, `authSizes`).
- **Screen 07** (`HomeScreen.tsx`, Customer Home) and **Screen 48**
  (`BrowseJobsScreen.tsx`, Worker Home) consume `lib/theme.ts` — specifically
  the `colors`/`spacing`/`radius`/`fonts`/`shadows` export, **not**
  `authTheme.ts`.
- Neither locked-screen family consumes a single unified token file today.
  This is the exact gap Phase 1 exists to close — do not restyle the locked
  screens to fix this; extract/consolidate the token *values*, leave the
  screens byte-identical.

## Token values — verified against `BRAZOS_MASTER_PLAN.md` §I

`lib/theme.ts`'s `colors` export already carries the atlas's core Emerald
Trust brand hues, lifted verbatim (confirmed exact hex match):

| Token | §I target | `lib/theme.ts` `colors.*` | Match |
|---|---|---|---|
| forest | `#064C3B` | `forest: '#064C3B'` | Exact |
| emerald | `#0D6B52` | `emerald: '#0D6B52'` | Exact |
| gold | `#C8A15B` | `gold: '#C8A15B'` | Exact |
| goldSoft | `#F3E7CE` | `goldSoft: '#F3E7CE'` | Exact |
| mint | `#E5F1EC` | `mint: '#E5F1EC'` | Exact |
| mint2 | `#D3E8DF` | `mint2: '#D3E8DF'` | Exact |
| ink | `#13201B` | `ink: '#13201B'` | Exact |

These **do not** yet match §I and need reconciling in Phase 1 (not
necessarily "wrong" — some may be pre-Emerald legacy tokens still in active
use by non-locked screens, so changing them is a Phase-1 migration decision,
not a Phase-0 fix):

| Token | §I target | `lib/theme.ts` current | Delta |
|---|---|---|---|
| bg (background) | `#F6F3EA` | `background: '#F4F1E8'` | Close, not exact |
| muted | `#6E7771` | `textMuted: '#6B7566'` | Close, not exact |
| line (border) | `#DDE2DD` | `border: '#DDD6C4'` | Close, not exact |
| danger | `#9C3F35` | `danger: '#A8432B'` | Close, not exact |

`lib/theme.ts` also exports `emeraldColors` (a customer-facing remap of the
same shape, `primary→forest` etc.) and a full `darkColors` variant — **dark
mode is not otherwise wired up anywhere** (no `useColorScheme`-driven theme
switch found; `App.tsx` hardcodes `<StatusBar style="dark">` and comments
explain the app is light-only for now). Treat `darkColors` as unused
scaffolding, not an active feature.

**Radii** — current `radius` scale (`sm 8 · md 12 · lg 16 · xl 24 · pill
999`) does **not** match §I's target scale (`xs 10 · sm 13 · md 14 · lg 17 ·
xl 20 · xxl 22 · pill 999`) — different value set entirely, not just
unmapped names. Reconciling this is Phase 1 work.

**Type scale** — current `typography` (`title 28/800 · heading 22/700 ·
subheading 17/600 · body 15/400 · label 13/600 · caption 12/500`) uses
different names and sizes than §I's target (`display 28/1.05/800 · h1 26 ·
h2 21 · title 15/600–700 · body 14 · sub 11 · caption 10 · eyebrow
9/800/uppercase`). No `eyebrow` token exists in `lib/theme.ts` today (it
exists in `authTheme.ts` as `authType.eyebrow`). Not reconciled — Phase 1
work.

**Spacing** — current `spacing` (`xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl
32`) is a 4-base scale, directionally matching §I's `4/8/12/16/20/24/32`, but
not value-identical (`lg` is 16 here vs. §I implying 16 is present too — this
one is close enough to treat as compatible; the larger gap is radii/type
above, not spacing).

**`fonts.display`** — resolves to Georgia/serif/system-serif stack
(`Platform.select`), no bundled custom font anywhere in the app (confirmed —
`LaunchScreen`'s wordmark uses the same fallback pattern). This matches §I's
implicit direction (a display serif for headlines) without a hard hex/token
mismatch to fix.

## Shared primitives / components — current inventory vs. §I's ~25-cap list

No component in the repo is named identically to §I's list, but several
existing components serve the same role. None of this is "missing" so much
as "not yet named/shaped as the target primitive set" — Phase 1 should
promote/rename in place, not build 25 new files from zero:

| §I primitive | Closest existing equivalent | Gap |
|---|---|---|
| Button | `components/Button.tsx` + a separate `AuthButton.tsx` (two palette families) | Not yet unified |
| Input | `components/TextField.tsx` + `AuthField.tsx` (+ `PhoneNumberInput.tsx`) | Not yet unified |
| Card | `components/Card.tsx` | Exists |
| Chip | `components/Chip.tsx` (extended with variants per DECISIONS.md D6) | Exists, already extended for Emerald use |
| SegmentedTabs | `components/SegmentedControl.tsx` | Exists, different name |
| TopBar | `components/ScreenHeader.tsx` | Exists, different name |
| BottomNav | Inline in `App.tsx::MainTabs` (not a component) | Not extracted |
| Avatar | `components/Avatar.tsx` + `AvatarPressable.tsx` | Exists |
| StatusPill | `components/StatusBadge.tsx` | Exists, not yet enum-driven off generated types (none exist) |
| ListRow | No direct equivalent (`SetupRow.tsx` is setup-specific) | Gap |
| SearchBar | Inline in `HomeScreen.tsx`/`WorkerSearchScreen.tsx`, not extracted | Gap |
| EmptyState | No formal shared component — ad hoc per screen (confirmed by 2026-08-04 audit, not re-verified as fixed) | Gap |
| Skeleton | `components/Skeleton.tsx` | Exists |
| Sheet/Modal | `components/ActionSheet.tsx`, `ServicePickerSheet.tsx` | Exists, two variants for different content shapes (DECISIONS.md D7) |
| MoneyText | No equivalent — no payment system exists yet to format | Gap (blocked on Phase 4/8) |
| StepHeader | `PostJobScreen.tsx`'s inline `progressSegment`/`progressLabel` | Not extracted into a shared component |
| RatingStars | `components/StarRating.tsx` | Exists, different name |
| MediaGrid | No direct equivalent (`PastWork.tsx`, `PortfolioPicker.tsx` each roll their own grid) | Gap |
| MediaUploader | `lib/storage.ts`'s `uploadAsset()` + per-screen picker UI, not a shared component | Logic centralized, UI not componentized |
| JobCard (mode-aware) | `components/BrowseJobCard.tsx` + `components/WorkerJobCard.tsx` (two separate components, deliberately per DECISIONS.md D22) | **Not mode-aware via context** — perspective is which *component* is used, not a `ModeContext`-driven render branch. This is the master plan's exact JobCard requirement and does not exist yet |
| WorkerCard | `components/BidWorkerCard.tsx` | Exists, different name |
| ServiceCard | No equivalent — no services/pricing schema | Gap |
| BidCard | `components/BidWorkerCard.tsx` | Exists |
| ChecklistCard | No equivalent — no checklist schema | Gap |
| EvidenceGallery | Inline photo/video display in `ClientJobDetailScreen.tsx`/`WorkerJobScreen.tsx`, not extracted | Gap |
| LiveJobMap | `components/HotspotMap.native.tsx` / `.web.tsx` (aggregated hotspot view, not a live pannable map with pins) | Different shape than target |

**Dev component catalog**: does not exist. `dev-tools/HomeDesignStudio.tsx`
is a web-only, dev-only tool for live-tuning `HomeScreen.tsx`'s own layout
constants (padding/font-size/radii sliders) — useful prior art for the
catalog's interaction pattern, but it is not a component-state catalog and
only wraps `HomeScreen`, not every primitive. Build the real catalog in
Phase 1 per §I; `HomeDesignStudio` is a reasonable reference, not a
substitute.

## Screen templates (§I's 6) — status

None of the six (`FormScreen`, `ListScreen`, `DetailScreen`, `SuccessScreen`,
`InboxScreen`, `ChatScreen`) exist as reusable templates. Every screen in the
repo (locked and unlocked) is a hand-built layout with its own loading/empty/
error handling, duplicated per screen rather than inherited from a shared
template. This is unchanged from the 2026-08-04 finding and is exactly what
Phase 1 is scoped to fix for the first four templates (Form/List/Detail/
Success); Inbox/Chat templates are explicitly Phase 7 per the master plan.

## What Phase 1 genuinely needs to build vs. what already exists

**Already exists, extend/promote rather than rebuild:**
- Core Emerald brand hex values (forest/emerald/gold/goldSoft/mint/mint2/ink)
  — already correct in `lib/theme.ts`, verified exact-match this pass.
- A large majority of the "primitive" roles already have a working, if
  differently-named/shaped, component (see table above) — most Phase 1 work
  here is consolidation/renaming/extension, not net-new construction.
- `useSetupPermissions.ts`'s three/four-state permission model — still the
  reference pattern to generalize (per 2026-08-04's recommendation, unchanged
  this pass).
- `lib/storage.ts`'s upload logic is already failure-safe (single-request
  upsert; a failed request never deletes/corrupts the existing file) — a
  `MediaUploader` component can wrap this logic directly rather than
  redesigning it. One real gap found this pass: changing a file's extension
  across re-uploads (e.g. `.jpg`→`.png` avatar) orphans the old object —
  `deleteJobPhoto`-style cleanup exists for job photos but not avatars.

**Genuinely net-new for Phase 1:**
- Radii and type-scale reconciliation to §I's exact values (colors are
  already close/exact; radii and type are not).
- A single consolidated token file (`ui/tokens.ts` per §O) — today there are
  three parallel-but-overlapping sources (`lib/theme.ts`, `lib/authTheme.ts`,
  and ad hoc inline hex/constants like `App.tsx`'s `TAB_ICON_SIZE = 29`).
- A true `ModeContext`-driven `JobCard` (today's `BrowseJobCard`/
  `WorkerJobCard` split is components-by-caller, not perspective-by-context —
  this is also a Phase 2 dependency, since there is no `ModeContext` yet).
- The dev component catalog itself.
- `EmptyState`, `MediaGrid`, `EvidenceGallery`, `ChecklistCard`,
  `ServiceCard`, `MoneyText` — no existing component to extend; build fresh
  when the phase that needs them arrives (most are Phase 4+, not Phase 1).

## Not a Phase-0 or Phase-1 concern (flagged, deferred correctly)

- Dark mode (`darkColors` exists but is unwired) — out of scope per
  CLAUDE.md, no action needed.
- `hooks/useReducedMotion.ts` consistency outside the auth-surface/mode-
  transition screens — UNKNOWN, not re-verified this pass; worth a targeted
  grep before broad animation work in later phases, not blocking Phase 1.
