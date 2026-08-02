# BRAZOS — Current Implementation Handoff

Read this file first in any new session before continuing this work. It is
the single source of truth for what's done, what's next, and why.

## Objective

Implement the feedback captured in the 13-page (11 content-page) requirements
PDF (`claude long prompt pdf.pdf`, supplied by the user, not stored in-repo)
as a **bounded pre-reset pass**: durable handoff + targeted repo mapping +
a small set of isolated, low-risk frontend-only improvements (Subphases
A–D below). Backend/schema/AI/messaging/media-architecture work is
explicitly deferred to a future session — see "Deferred requirements"
below.

## Baseline

- Branch: `mainexpo` (required branch — confirmed at session start)
- Baseline HEAD: `77d6ce80e3c56cd36e03a7cea776b6d611665840` ("chore: verify
  phase34 against the live schema")
- Working tree was clean at baseline.
- Supabase phases 29–34 are deployed and verified (per CLAUDE.md).

## All 12 requirements (as read from the PDF, 2026-08-01)

Numbering matches the PDF's own numbered annotations (1–12). Per user
instruction, requirements 3 and 9 are treated as one capability, and
requirements 2 and 11 are treated as one capability.

1. **Completion media upload** — "mark complete" flow needs one combined
   add-photo/video button: max 5 photos, 1 video, 2-minute video cap.
   Currently photo-only. **Deferred** (media-architecture change).
2. **/ 11. Canonical job-data consistency** — the same job renders
   differently depending on where it's viewed (Job & Bids card vs. Map
   "Jobs in this zone" vs. job details) — missing thumbnail/description/
   video in some contexts. Requirement: one canonical source of job data/
   formatting across all tabs; poster edits should propagate everywhere.
   **Deferred** (cross-screen data-layer rearchitecture — explicitly listed
   in "strictly defer" section of the user's instructions).
3. **/ 9. Direct-offer to a specific worker** — viewing another user's
   profile should never show "Post a job"; instead a "Send an offer" /
   "Work with X again" button sends a priced job request into the existing
   chat thread for accept/decline/counter. **Verified already implemented**
   in `screens/WorkerProfileScreen.tsx` (lines ~166–203): the screen
   branches on `canOffer` (backed by `canRehireWorker()` in `lib/jobs.ts`,
   gated on "has this client already completed a job with this worker").
   When `canOffer` is true it renders exactly the "Work with X again" /
   "Send an offer" card the PDF's page 9 screenshot shows as correct. When
   false, it deliberately renders a "Post a job" fallback card explaining
   "Direct offers open up once you've completed a job together" — this is
   what the PDF's page 3 screenshot flags as wrong, but reading the code,
   it is a designed gate (you can't have a private-offer thread with
   someone you have no completed-job relationship with yet), not a bug.
   Not touched this session beyond confirming this in the source. Flagged
   to the user: this may already be resolved, or the user may want the
   *fallback copy/behavior itself* reconsidered — that's a product
   decision, not something to guess at.
4. **Dedicated reviews screen** — tap rating/review count to see a full
   list of reviews (with photos) per user. **Deferred** (new screen +
   review-photo considerations — explicitly listed in "strictly defer").
5. **Replace native OS confirmation dialogs** — professional in-app dialog
   instead of `Alert.alert`-style popups, starting with the listed-price
   bid confirmation and delete-job confirmation. **Implemented this
   session — Subphase A.**
6. **Ownership indicator on job list cards** — "Your job" badge when the
   viewer posted the job themselves. **Implemented this session —
   Subphase D** (BrowseJobCard only; see notes).
7. **Video player overhaul** — fullscreen playback, scrubber/volume/pause,
   real captured-frame thumbnail instead of the current placeholder.
   **Deferred** (explicitly listed: "Fullscreen video-player
   rearchitecture", "Video-thumbnail generation/dependency installation").
8. **AI/worker-matching quality** — better semantic matching of workers to
   job searches. **Deferred** (explicitly listed: AI/pgvector/embeddings).
9. See 3.
10. **Own-profile action polish** — "Edit Profile" → "Edit" as a bigger
    bounded button; optional settings icon *only if a real destination
    exists*; "Add photos" restyled as a bounded secondary button. Also
    named (but left undefined) a "3 photos problem." **Implemented this
    session — Subphase B**, except the settings icon (skipped, see below)
    and the 3-photos problem (recorded as unresolved, see below).
11. See 2.
12. **Home/Map/job-list navigation & labels** — Home worker CTA reorder +
    rename to "Find Jobs Nearby"; "See All Jobs" link on Home and Map both
    pointing at the same list; rename "Find Work" screen to "All Open
    Jobs"; per-card pending-bid-count status text. **Partially implemented
    this session — Subphase C** (labels/navigation only). The "redirect to
    nearest hotspot" part of this requirement is deferred (see below) —
    it still opens the Map tab as it does today, not a specific zone.

## Unresolved requirement — "3 photos problem" (from requirement 10)

The PDF names this only as a caption under requirement 10's screenshot:
"Next is 3 photos problem, might require re-architecturing" — with no
screenshot, description, reproduction steps, or further detail anywhere
else in the document. Per explicit user instruction: **not investigated,
not implemented, not guessed at.** A future session needs a follow-up
description from the user (ideally with a screenshot/repro) before this
can be scoped at all. Do not infer a meaning for it from surrounding code.

## Phase checklist

- [x] Read requirements PDF in full (prior turn in this conversation)
- [x] Create this handoff, commit it — `a734a15`
- [x] Targeted repository mapping (below)
- [x] Subphase A — BRAZOS confirmation dialog (bid + delete) — `5e3fc10`
- [x] Subphase B — own-profile action polish — `40ea046`
- [x] Subphase C — Home/Map/job-list labels & navigation — `c174de3`
- [x] Subphase D — ownership badge + bid-count wording (partial, see notes) — `713c6fa`
- [x] **This bounded pass is complete.** Working tree is clean at `713c6fa`.
- [ ] **Everything in "Deferred requirements" below — next session, only
      after explicit user go-ahead per CLAUDE.md's migration/backend rules**

## Repository mapping (verified by reading the actual files, 2026-08-01)

| Area | File(s) | Symbol(s) |
|---|---|---|
| Listed-price bid confirmation | [screens/JobDetailScreen.tsx](../screens/JobDetailScreen.tsx) | `handleTakeListedPrice`, `confirmTakeListedPrice` (new), `placeBid` |
| Delete-job confirmation | [hooks/useJobOwnerActions.ts](../hooks/useJobOwnerActions.ts), [components/JobOwnerActions.tsx](../components/JobOwnerActions.tsx) | `onDelete`, `requestDelete`/`deleteDialog*` (new), `useJobOwnerActions()` |
| Reusable dialog primitives (before this session) | [lib/dialog.ts](../lib/dialog.ts) (`confirmAsync`/`alertAsync`, native `Alert`-backed), [components/ReportDialog.tsx](../components/ReportDialog.tsx) (existing in-app `Modal` pattern, used as the visual reference for the new dialog) | — |
| New reusable confirmation dialog | [components/ConfirmDialog.tsx](../components/ConfirmDialog.tsx) (new, Subphase A) | `ConfirmDialog` |
| Own Profile screen | [screens/ProfileScreen.tsx](../screens/ProfileScreen.tsx) | `ProfileScreen`, header `right` Edit action, Settings `Card` (inline, not a separate route) |
| Profile editing | same file | `isEditing`, `handleSave`, `handleCancel` |
| Settings navigation | [lib/navigation.ts](../lib/navigation.ts) `ProfileStackParamList` | Only `NotificationSettings`, `LegalDocument`, `AdminReports` exist as *routes*; there is no separate "Settings" screen/route — settings live inline as a `Card` on `ProfileMain` itself. See Subphase B notes on why the settings-icon requirement was skipped. |
| Portfolio / Add Photos | [components/PastWork.tsx](../components/PastWork.tsx), [components/PortfolioPicker.tsx](../components/PortfolioPicker.tsx), [lib/portfolio.ts](../lib/portfolio.ts) | `PastWork` (`manageLink` → restyled Subphase B), `onManage` prop from `ProfileScreen` |
| Home worker section | [screens/HomeScreen.tsx](../screens/HomeScreen.tsx) | `workSection`, `workHeader`, `goToFindWork`, `JobPreviewRow` |
| Map header and hotspot navigation | [screens/MapScreen.tsx](../screens/MapScreen.tsx), [hooks/useHotspots.ts](../hooks/useHotspots.ts) | `MapScreen`, title "Find Jobs Near You" (unchanged), `selected`/`CellJobs` drill-down (unchanged) |
| All Open Jobs / Find Work list | [screens/BrowseJobsScreen.tsx](../screens/BrowseJobsScreen.tsx) | `BrowseJobsScreen`, `ScreenHeader title` |
| Job-card ownership state | [components/BrowseJobCard.tsx](../components/BrowseJobCard.tsx), [hooks/useAuth.ts](../hooks/useAuth.ts) | `BrowseJobCard` (new `isOwn` derivation via `useAuth()` + `job.client_id`) |
| Bid-count source (general open jobs) | [lib/bids.ts](../lib/bids.ts) `fetchBidCount` (RPC `job_bid_count`, one call per job — **not batched**), [hooks/useBidCount.ts](../hooks/useBidCount.ts) | See Subphase D notes — **skipped for general cards**, reason below |
| Bid-count source (owner's own jobs) | [lib/jobs.ts](../lib/jobs.ts) `fetchJobsByClient`/`fetchJobById` (embeds `bids!bids_job_id_fkey(count)`, correctly scoped by RLS because the viewer *is* the poster), `formatBidCount` | Used as-is; new `formatPendingBidCount` added alongside it |
| job_bid_count RPC usage | [lib/bids.ts](../lib/bids.ts) `fetchBidCount` | Confirmed SECURITY DEFINER count-only RPC (phase15), exists specifically because a plain `bids` embed under-counts for non-owner viewers (RLS) |
| Current user/session source | [hooks/useAuth.ts](../hooks/useAuth.ts) → `lib/AuthContext.tsx` | `useAuth()` → `{ user, login, logout, signUp }` |
| Existing shared button/card/icon/theme | [components/Button.tsx](../components/Button.tsx), [components/Card.tsx](../components/Card.tsx), [components/StatusBadge.tsx](../components/StatusBadge.tsx), [lib/theme.ts](../lib/theme.ts) | `Button` (variant/size/palette), `colors`/`spacing`/`radius`/`shadows` |
| Owner-oriented "Job & Bids" screen | [screens/ClientJobDetailScreen.tsx](../screens/ClientJobDetailScreen.tsx) | `bids.length` + `formatBidCount` → `formatPendingBidCount` (Subphase D) |
| My Jobs hub cards (separate from "Job & Bids") | [screens/MyJobsHubScreen.tsx](../screens/MyJobsHubScreen.tsx), [components/HubCard.tsx](../components/HubCard.tsx) | Already shows its own bid-count wording inline (`${job.bid_count} bid(s)` / `Awaiting bids`) — **not touched**, out of the requirement's literal scope (requirement 12 names "the price listed" on the open-jobs list, not the hub) |

### Existing functionality reused (not reinvented)

- `lib/dialog.ts` (`confirmAsync`/`alertAsync`) stays as-is for every
  confirmation *not* explicitly named in requirement 5 (logout, discard
  changes, remove avatar, remove portfolio item, accept-bid, etc.) — the
  user's instructions scoped the new dialog to "only these currently
  verified native marketplace alerts: 1) listed-price bid, 2) delete-job,
  3) a directly related confirmation on the same action path, trivial
  only." Nothing else qualified as trivial/same-path, so nothing else was
  touched.
- `components/ReportDialog.tsx`'s `Modal`/backdrop/sheet structure was
  used as the direct visual/structural template for the new
  `ConfirmDialog` (same `colors.surface`/`radius.xl`/`shadows.raised`
  card-on-dimmed-backdrop pattern already in the codebase).
- `Button` component's existing `loading`/`disabled` props satisfy the
  "loading state" + "disable repeated submission" requirements without new
  logic.
- `formatBidCount` (already existed in `lib/jobs.ts`) reused as-is for
  Subphase D; a sibling `formatPendingBidCount` was added next to it
  rather than overloading the first function's signature.
- Cross-tab navigation to `BrowseJobs` from the Map tab reuses the same
  `navigation.getParent()?.navigate(...)` pattern already used elsewhere
  in this codebase (e.g. `JobDetailScreen.tsx`'s
  `navigation.getParent()?.navigate('MyJobs' as never)`), rather than
  registering a duplicate `BrowseJobs` route inside `MapStackParamList`.

### Backend / migration requirements

**None for Subphases A–D.** Every change in this session is presentation-
layer only (new component, renamed labels, reordered JSX, a derived
boolean, a second formatting function using already-fetched data). No SQL
files were created. No RPC signatures changed. No RLS/grants touched.

### Dependencies added

**None.** No `npm install` was run. `Modal` (react-native core) and
`@expo/vector-icons` (already a dependency, used throughout) cover
everything Subphase A needs.

### Risks and blockers

- The settings-icon part of requirement 10 could not be implemented as
  literally requested ("maybe a settings icon next to it") because there
  is no dedicated Settings *screen* in this codebase — settings
  (Notifications / Terms / Privacy) live inline in a `Card` on
  `ProfileMain` itself, directly below where Edit already is. Adding an
  icon that scrolls to or re-opens the same screen it's already on would
  be a decorative/dead action under the user's own constraint ("Do not
  add a decorative icon... a dead navigation action"). **Skipped, per the
  explicit fallback instruction** ("If no real settings destination
  exists, skip the icon and document that decision.").
- General open-job-card bid counts (Home preview rows, `BrowseJobCard` in
  "All Open Jobs") could not be added safely within the skip condition's
  constraints. The only existing batched bid-count source
  (`bids!bids_job_id_fkey(count)` embed used by `fetchJobsByClient`/
  `fetchJobById`) is only accurate when the viewer *is* the job's poster —
  `bids` RLS restricts a non-owner's SELECT to their own bid only, so the
  same embed on `fetchOpenJobs()` (browsing feed, viewer is not the
  poster) would silently under-count for every job that isn't the
  viewer's own. The only currently-correct per-job count for a
  non-owner viewer is `job_bid_count()` (`useBidCount`/`fetchBidCount`),
  which is one RPC call per job — an N+1 pattern across a list that can
  hold 90+ jobs (see PDF page 6 screenshot: "91 open jobs"). Per the
  explicit skip condition ("If implementing this safely requires... an
  N+1 request pattern... do not implement it in this bounded session"),
  **general-card bid counts are skipped.** A real fix needs either a new
  batched RPC (`job_bid_counts(job_ids uuid[])` or similar) or a
  materialized count column on `jobs` — both are schema/migration work,
  out of scope for this session.
- The "redirect to nearest hotspot/zone" part of requirement 12 (Home's
  "Find Jobs Nearby" button) was left pointing at the Map tab exactly as
  "Find Work" already did, per the user's own fallback instruction ("Do
  not implement automatic nearest-hotspot selection... unless the
  repository already has a complete reusable helper and the change is
  genuinely trivial"). `hooks/useHotspots.ts` returns zone *data* but
  there is no existing "nearest zone to the user" selector/helper — this
  would be new geolocation-adjacent logic, explicitly out of scope.

### Completed work from this session

All four permitted subphases (A–D) are implemented, validated, and
committed. See "Commits" at the bottom for hashes. Working tree is clean
at `713c6fa`. No further implementation work is in flight or partially
done.

### Exact next action for the post-reset Claude session

1. Read this file in full.
2. Run `git log --oneline -8` and `git status` to confirm the tree matches
   what's recorded here (should be clean, `713c6fa` as the tip).
3. This bounded pass is done. The next action is to get explicit user
   direction on which deferred requirement (1, 2/11, 4, 7, 8, or the
   hotspot-redirect half of 12) to scope next, since every one of them
   needs a real design/architecture decision the user hasn't made yet
   (e.g. requirement 1 needs a decision on video storage/compression;
   requirement 2/11 needs a decision on what the single canonical job
   data shape actually is before any code changes). Also surface to the
   user: requirement 3/9 appears to already be implemented as designed
   (see that entry above) — worth a quick confirmation from the user
   before assuming there's nothing left to do there.
4. Do **not** start any item in "Deferred requirements" without the user
   explicitly re-authorizing it in a new message — this session's
   instructions were explicit that those are out of bounds here.
5. If the user wants general-open-job-card bid counts (part of
   requirement 12/Subphase D, skipped this session — see "Risks and
   blockers"), that needs a new batched RPC or a materialized count
   column — a migration, which requires the user's explicit sign-off
   per CLAUDE.md's Supabase rules (write the SQL, hand it over, never
   run it against production directly).

## Deferred requirements (explicitly out of scope this session)

Per the user's instructions, none of the following were started:

- Completion-video support / completion-media columns (requirement 1)
- Canonical cross-screen job-data rearchitecture (requirements 2/11)
- Dedicated reviews screen / review-photo database changes (requirement 4)
- Fullscreen video-player rearchitecture / video-thumbnail generation
  (requirement 7)
- Semantic/AI worker matching, pgvector, embeddings, Edge Functions, any
  AI-provider integration (requirement 8)
- Automatic nearest-hotspot selection (part of requirement 12)
- Any new Supabase migration, RPC signature change, storage-policy
  change, or RLS/grant change
- The undefined "3 photos problem" (requirement 10 caption)

## Validation performed

| Command | When | Result |
|---|---|---|
| `git status` / `git rev-parse HEAD` | Session start | Clean, `mainexpo`, `77d6ce8` |
| `npm run lint` (`tsc --noEmit --noUnusedLocals --noUnusedParameters`) | After Subphase A | Clean, no errors |
| `npm run lint` | After Subphase B | Clean, no errors |
| `npm run lint` | After Subphase C | Clean, no errors (one fix needed mid-subphase: a cross-tab `navigation.getParent()?.navigate(...)` call in MapScreen needed the same untyped-cast pattern `useJobOwnerActions.ts`'s `onEdit` already uses, since the two-arg `navigate` overload doesn't resolve across stacks) |
| `npm run lint` | After Subphase D | Clean, no errors |
| `npm test` (`node --test tests/*.test.mjs`) | After Subphase D | 14 pass, 1 fail — the pre-existing `tests/pwa.test.mjs` config.js-version failure documented below, unrelated to any file this session touched |
| `git status` | After every subphase commit | Clean each time before starting the next subphase |

No native build, no Supabase schema verification, no full `npm run verify`
was run — none of this session's changes touch native modules, config, or
the database, so those checks would not exercise anything that changed.
**Nothing in this session has been manually tested on a real iPhone/
Android device or simulator** — that remains outstanding for every
Subphase A–D change, in particular:
- `ConfirmDialog` appearance/backdrop/Android hardware-back behavior
- Button `sm` size touch-target feel on a small iPhone (SE-class width)
- Home screen's reordered worker section spacing
- Map screen's new header-right "See All Jobs" link not colliding with
  the title or the map controls below it on a small width
- The "Your job" badge's wrap/truncation behavior next to a long
  category+location meta line

## Known failure (pre-existing, unrelated to this session)

`tests/pwa.test.mjs` → "web build is installable and receives hosted
runtime configuration" — expects `config.js?v=20260731-1`, ships
`-2` in `public/index.html`. Both sides are on the frozen web/PWA surface
per CLAUDE.md and are deliberately left alone. Not touched this session.

## Commits (this session)

| Hash | Subject |
|---|---|
| `a734a15` | docs: add BRAZOS implementation handoff |
| `5e3fc10` | feat: add BRAZOS marketplace confirmation dialog |
| `40ea046` | polish: improve own-profile actions |
| `c174de3` | polish: clarify job discovery navigation |
| `713c6fa` | feat: show job ownership and bid status |

Baseline was `77d6ce8`. Tip of `mainexpo` after this session is `713c6fa`.
Working tree is clean.
