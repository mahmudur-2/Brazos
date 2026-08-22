# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## THE MASTER SET IS SPLIT — read this before citing any mockup

**Binding design authority, highest first:** the NUMBERED masters
(`docs/mockups/1_*.png` … `44_*.png`) · the emerald dispatch's D1–D11 ·
`docs/mockups/PRESTIGE_RUN_REPORT.md` (a "mismatch" logged there is CORRECT and
must not be reverted) · `docs/mockups/BRAZOS_MOCKUP_MANIFEST.md`.

**The WORD-NAMED masters are NOT authority and the operator has REJECTED them**
as an over-ornate render pass: `Compare_Bids_Dark.png`, `Discover_Map_Dark.png`,
`Messages_Inbox_Dark.png`, `My_Jobs_Active_Dark.png`, `My_Jobs_Closed_Dark.png`,
`My_Jobs_In_Progress_Dark.png`, `Notifications_Feed_Dark.png`,
`Notifications_Preferences_Dark.png`, `Payment_Methods_Dark.png`,
`Profile_Account_Safety_Dark.png`, `Profile_Details_Dark.png`,
`Profile_Past_Work_Settings_Dark.png`. Never cite one to justify a change; never
"restore" a detail that appears only there. You may read one to understand
intent where a numbered master is silent, but the change still needs a numbered
master, a dispatch decision or the run report behind it — and you log that you
read it.

**There is NO master for light mode.** Every mockup is dark. Never align a light
surface to one. **Six numbered masters the emerald dispatch cites do not exist
on disk** (33, 34, 39, 40, 45, 46; also absent: 21, 28, 35–38, 41, 42) — all of
them concern things D9 freezes as UNBUILT.

*Unchanged by the home reconstruction (2026-08-20), which cited no master: its
dispatch superseded `docs/dispatch/` and pre-decided every product question it
needed. Reaffirmed unchanged by the verification run (2026-08-19) and restated
at the head of the "Verification 2026-08-19" section of
`docs/mockups/PRESTIGE_RUN_REPORT.md`.*

## 2026-08-22 — LIGHT-PARITY CLEANUP + GUARD-COVERAGE AUDIT — COMPLETE, ONE COMMIT SKIPPED

Four dispatched commits; **three landed, one was skipped at its own gate**,
plus this record. `dd518d9` fixes the light star (L-010), `1714fd8` moves the
category accents into the token layer (L-002), `19357ab` writes the read-only
guard-coverage audit. Bare `npm run verify` exit 0 at baseline and after every
commit — **suite 844 → 845 → 846 → 846 pass / 0 fail / 0 skipped / 0 TS
errors**. Every delta is one added fence: +1 the L-010 star fence, +1 the L-002
value-parity fence, +0 for the docs-only audit. `git` is the authority on what
reached the remote.

**No guard, hook, deny rule, fence or lint rule was weakened, disabled,
narrowed or granted an allowance anywhere in this run.** That constraint is
what skipped a commit and what shaped the L-002 design; both are recorded
below rather than quietly absorbed.

### L-010 — the light star, fixed (`dd518d9`)

The dark pass gave the app ONE star treatment (`lib/theme.ts` `starColors`)
but repointed the three bare-`★`-in-a-sentence spans on the dark side only:
`<Text style={isDark ? styles.xStarDark : undefined}>★</Text>`. `undefined` is
not "the Heritage star" — it is no paint at all, so in light the glyph
inherited the muted grey of the meta line it sat in. The helper had expressed
light correctly the whole time; nothing called it there.

All three sites (`BidDetailScreen`, `ProfileScreen`, `SavedWorkersScreen`,
each re-located against current code rather than trusting the audit's recorded
line numbers) now paint through `starColors(colors, isDark).filled`, the same
expression the six Ionicons star sites already use. The three dark-only
`…StarDark: { color: colors.gold }` keys are deleted, not left dangling. Dark
is byte-unchanged. The `starColors` docblock, which had recorded "the light
pass owns that call", now records that the pass happened.

`tests/themeTokens.test.mjs` gains the fence — and with it an **executed
`lib/theme.ts`** (react-native stubbed, its `ui/tokens` import fed from the
module that file already executes, so the palette the helpers see is the real
one). Half one calls `starColors` against both palettes; half two derives the
site list by scanning `screens/`, `components/`, `ui/` for the glyph and
counts painted spans against glyphs per file, so a fourth bare star anywhere
fails by path. **Proven red before green:** repointing `SavedWorkersScreen` to
the exact pre-fix shape failed with `0 !== 1` at suite exit 1, then reverted.

### L-001 — SKIPPED at its gate: `emeraldColors` has live consumers

The dispatch's gate was "zero live consumers → delete; any live consumer → do
not delete, report and continue." Two search passes (gitignore-respecting and
raw, with `\bemeraldColors\b` so `emeraldColorsFor` cannot be confused for it)
found **zero production importers** — the five screens that name
`emeraldColors` all declare it as a LOCAL const from
`emeraldColorsFor(colors)` — but **two live consumers in test code**:

* `tests/customerCore.test.mjs:225` — `assert.match(theme, /export const emeraldColors/)`, a hard assertion the export exists.
* `tests/emeraldFences.test.mjs:1485` — `paletteBlock(theme, 'colors = {', 'emeraldColors')` uses the export's NAME as the end delimiter for slicing the light palette block, and `paletteBlock` asserts `${next} must stay a named export after ${name}`.

Deleting the export turns both red, and the only way through is to edit two
fences — which this run's binding constraint forbids. **The audit's L-001 line
("zero live consumers") is therefore contradicted by current code**: it
counted importers, not the two fences that pin the export's existence and use
its name as a source delimiter. Recorded, skipped, continued. Whoever picks
this up owns those two fences as part of the change.

### L-002 — category accents moved to the token layer (`1714fd8`)

The eleven job-category accents were twenty-two raw hexes in `lib/jobs.ts`: a
data-access module, so outside all three sanctioned token surfaces AND outside
the hex fence's scanned directories, where a twelfth could have been added with
nothing to catch it. They are now `categoryAccents` in `ui/tokens.ts`;
`lib/jobs.ts` keeps the vocabulary it owns and carries **no colour literal of
any kind**. All twenty-two values moved byte for byte — a refactor, pinned by a
fence that compares the executed token module against a copy of the
pre-refactor table.

**Two deliberate deviations from the dispatch's wording, both because current
code wins:**

1. The dispatch asked for resolution "through the palette". `emeraldFences` F5
   pins **both** `lib/jobs.ts` declarations verbatim —
   `JOB_CATEGORY_COLORS: Record<JobCategory, { bg: string; icon: string }>` and
   `categoryAccent(category: JobCategory)` — so a palette-parameterised
   accessor cannot land without editing that fence. It is also F5 that proves
   dark never paints this table at all (every read sits on the FALSE branch of
   an `isDark` ternary), so a dark half would be **dead by construction** and
   no golden master specifies one. One theme-constant group, the same shape
   `star`/`black`/`white`/`mediaChrome` already have.
2. The group is deliberately NOT folded into `colors`/`ColorToken`: eleven
   identity pairs are not palette roles, and folding them in would put
   twenty-two keys into every resolved `EmeraldPalette` that no primitive reads.

The hex fence was **not** extended to `lib/` and no allowance was recorded
anywhere — the dispatch forbade the allowance, and extending the fence would
have required them for `lib/theme.ts`, `lib/authTheme.ts` and `lib/hotspots.ts`.

### Guard-coverage audit (`19357ab`) — read-only, P0 0 / P1 2 / P2 8

`docs/audit/2026-08-22/guard_coverage.md`. Every active guard enumerated from
disk with its boundary quoted verbatim, then each guard's COMPLEMENT scanned
for the class of violation it exists to prevent.
`docs/emerald-v2/DECISIONS.md` **D31** carries the boundary table, which is the
part that must not be lost — the drift between a fence's docblock intent and
its actual directory list is what both P1s are made of.

**P1 · G-001 — raw Supabase Storage error text reaches a user-facing alert.**
`lib/storage.ts`'s `uploadAsset()` returns the service's own `StorageError`
unwrapped; `ui/primitives/MediaUploader.tsx:123` extracts `error?.message`;
`screens/PostJobScreen.tsx:1030,1051` render it with `alertAsync`. Two live
mounts (photo + video). This is exactly the class
`tests/errorMessage.test.mjs` calls a ship-blocker — and it survives because
that fence's `dirs` are `['screens','components','hooks']` and **`ui/` is not
among them**, so the extraction happens one directory outside the sweep and
arrives at the scanned screen bound to a parameter named `message`, which the
fence's `\w*[Ee]rr\w*\??\.message` needle cannot see.

**P1 · G-002 — the guard layer's own regression suite never runs in CI.**
`tests/safety.test.mjs` holds **120 of the 846 tests** — every executed proof
that `guard.ps1`'s ten rules and the deny matrix still behave — inside
`describe(…, { skip: PLATFORM_SKIP })`, and `PLATFORM_SKIP` is falsy only on
win32. `.github/workflows/ci.yml` is `runs-on: ubuntu-latest`. CI therefore
runs 726 tests and skips precisely the 120 that protect the controls: a
weakening edit to the guard or the matrix is green on every PR and is caught
only when the operator happens to run `verify` on Windows.

**P2s:** `lib/` outside the hex fence, with 4 live literals in
`lib/hotspots.ts` (L-003) and nothing mechanical separating a sanctioned token
surface from any other `lib/` file; `lib/sharing.ts` → `PhotoViewer` showing a
raw platform exception (same class as G-001, different source); the two Deno
edge functions type-checked by nothing (`tsconfig` excludes
`supabase/functions`); three non-recursive sweeps (F-ERRMSG, F-TOKENIMPORT,
F-SQLENUM) one `mkdir` from silently shrinking; `lib/adapters/payments.ts`
dropping `code` and degrading `userMessage`'s classification (no leak — it
fails safe — but it lands on the generic branch); `MIGRATED_FILES` being a
hand-list rather than a walk; and the two already-recorded frozen/dev-only
literals (L-009, L-008).

**Nine complement scans came back clean** and are recorded as measured facts,
including a tree-wide sweep for CSS **named** colour literals across all 257
app files — zero hits, confirmed by an independent grep. **Nothing is marked
UNKNOWN**: every scope was read from source. The one coverage that is not a
path boundary is `scripts/verify-schema.mjs`, whose scope is a human cadence.

**Not reached, named rather than sampled:** `dist/` and `.shots/` (build
output), `public/` + `hosting/` (counted, not itemised — frozen web),
`node_modules/`, `assets/`, `design-reference/`, `docs/`, and a full SECURITY
DEFINER ACL sweep of the ~80 migrations, which is database-shaped and out of
scope for a run that touches no SQL.

## 2026-08-22 — PLAYFAIR HEADINGS + ORPHAN DELETE + LIGHT-MODE AUDIT — COMPLETE

Three functional commits plus this record: `341fae8` bundles Playfair
Display, `81478c4` deletes the orphaned toolbox PNG, `ce4e6ec` writes the
read-only light-mode parity audit. Bare `npm run verify` exit 0 at baseline
and after every commit — **suite 843 → 844 pass / 0 fail / 0 TS errors**
(+1: the executed Playfair fence in `tests/themeTokens.test.mjs`, proven red
against a repoint at the platform serif before being kept). Pushed under the
autonomy gate after the final green verify; `git` is the authority on what
reached the remote.

**Playfair Display (operator decision 2026-08-22, supersedes emerald-v2 D5
for the three large heading roles ONLY):**

* `assets/fonts/` now holds `PlayfairDisplay-Bold.ttf` (700),
  `PlayfairDisplay-ExtraBold.ttf` (800) and `OFL.txt` — upstream Google
  Fonts statics, magic-bytes- and name-table-verified before commit.
* `type.display`/`h1` → `fonts.displayExtraBold`, `type.h2` →
  `fonts.displayBold` (ui/tokens.ts); `typography.title` → ExtraBold,
  `typography.heading` → Bold (lib/theme.ts). Their inert `fontWeight` is
  REMOVED — with a real file bundled, iOS would synthesize a fake bold on
  top. **Deliberately unmoved:** `type.title` (15pt), `typography.subheading`
  (17pt/600 — no 600 face bundled, Playfair degrades under ~18pt), and every
  screen style that names `fonts.display` directly (heroHeadline,
  sectionTitle, statusWord, earningsAmount…) — those stay Georgia and their
  fences stay byte-true. `fonts.display` itself still resolves the platform
  serif; do NOT repoint it.
* Loading is runtime `useFonts` in App.tsx's `LaunchGate` — no new package,
  no native rebuild, Metro/Expo Go fine. The gate holds `children` unmounted
  and holds `sessionReady` false until the faces resolve (or error → falls
  back to platform serif), so no frame paints a heading in the fallback face
  — that render gate is the answer D5's flash objection required, recorded in
  docs/emerald-v2/DECISIONS.md D5's dated superseding note.
* home(21)'s recorded cap-height debts (hero 2.6pt, promo 2.8pt owed because
  Georgia sets ~22% wider than the masters' Didone) are NOT closed by this:
  the screen styles that carry them still name `fonts.display`. Moving THEM
  onto Playfair is a separate operator call with its own measurement pass.

**Orphan deleted (gated):** `assets/brand/worker-home-toolbox.png` — the
full-tree search found zero live references (filename/require/roster/config;
only prose mentions in HANDOFF, PRESTIGE_RUN_REPORT, DARK_ASSET_INVENTORY,
STAGE4D_PLAN). Its sole historical `require()` died with BrowseJobsScreen
(`778fc5c`). This resolves Batch F+J's carry-forward bullet below. The dark
worker-home artwork is and remains `assets/prestige/hero_toolbox_worker.png`
(WorkerHomeScreen.tsx:50, dark-gated).

**Light-mode parity audit** — `docs/audit/2026-08-22/light_mode_parity.md`:
**P0 0 / P1 0 / P2 10.** The machinery is sound (key parity typed+fenced on
both palette surfaces, single resolution path, all four Prestige rasters
gated at their only render sites, glow/selection/scrim dark-gated with
Heritage light states intact). The ten P2s are token hygiene — `lib/jobs.ts`
+ `lib/hotspots.ts` literals sit OUTSIDE the hex-fence's scanned dirs, the
auth-surface literals' token home (`lib/authTheme.ts`) is now editable, a
dead static `emeraldColors` export invites non-flipping use — plus the known
light grey-star residue on three meta rows. Fix selection is the operator's;
no batch opened.

**Device checks OWED (operator, physical device):**
- Cold start: launch layer → Home with the large headings in Playfair from
  their FIRST visible frame (no Georgia flash). Only the 28/26/21pt heading
  roles moved; 15pt card titles and the hero/section styles deliberately
  stay Georgia — a Playfair card title on this build is a BUG, not a win.
- Both modes, both themes: heading weight reads ExtraBold at 28/26pt, Bold
  at 21pt; no double-bold smudge (that would mean a fontWeight crept back).
- Airplane-mode cold start still reaches the Terms retry screen (the font
  gate must release on error, never hold the launch layer forever).

## 2026-08-22 — BATCH F+J: dead code deleted, documents corrected (F-023, F-071 + J) — COMPLETE

Six commits: `778fc5c` deletes `screens/BrowseJobsScreen.tsx`,
`hooks/useWorkerAvailability.ts` and `hooks/useChat.ts` with their ten test
files updated in the same commit; `cb240d0` retires the openJobsPotential
duplicate's apparatus and the stale errorMessage allowlist entry; `239950d`
architecture.md; `e434a9c` CLAUDE.md (operator-authorized, decision-7 scope
only); `7991453` HANDOFF Batch-C correction + manifest banner + README;
plus this record. Bare `npm run verify` exit 0 after every commit — **final
suite 843 pass / 0 fail / 0 TS errors** (baseline 846; −3 = crossTab's
browse-remount test deleted with its subject, and potentialEarnings' five
tests became three lib-level executions). A repo-wide grep for the three
deleted names returns nothing outside `.git` and `docs/audit/`. Pushed under
the autonomy gate after the final green verify; `git` is the authority on
what reached the remote.

**Facts a later run needs:**

* `lib/earningsMath.ts`'s `openJobsPotential()` is the ONE implementation
  (live consumer: WorkerHomeScreen); the deleted screen's authorized inline
  twin went with it. ChatScreen's hook is `useConversationChat`; the
  superseded chat hook is deleted, not allowlisted.
* `tests/crossTabNavigation.test.mjs`'s WorkerResults mode sweep window is
  260 chars (was 160): the old window missed WorkerHomeScreen's long
  'nearby' dispatch and had been passing on the deleted screen's compact
  call — observed red before the widening. Fence logic unchanged.
* `assets/brand/worker-home-toolbox.png` (115,644 B) lost its only
  `require()` with the screen: on disk, orphaned, off the raster roster,
  and outside this run's scope — deleting it is an operator call.
* The audit's "J precedes F" batch-ordering constraint is DEAD: it existed
  only because CLAUDE.md's malformed locked section still named the dead
  screen, and the 2026-08-21 repair dissolved it. Recorded here per
  decision 4 — `docs/audit/` is a historical record and was not edited.
* F-069 recorded, not fixed: `phase69`'s comment cites `bids_insert_own` as
  live; phase29:301 dropped that policy. The phase69 conclusion still holds
  (three other live policies call the function). Applied migrations are
  history — the file stays byte-identical.
* `tests/verificationBadgeRemoved.test.mjs`'s formerly-locked list still
  carries both sign-in screens (open item 11, unchanged) — this run removed
  only the deleted screen's entry.

No database contacted, no schema change, no dependency change, no app
behavior change beyond the deletions, no theme or asset change.

## 2026-08-22 — BATCH I: money and lifecycle consolidation (F-011, F-012, F-070) — COMPLETE

Six functional commits plus this record: `76005a0` money, `df0a885` test,
`b0cc036` JobProgress, `d5d7a89` jobStage, `1440544` StatusPill/StatusBadge,
`47197a4` screens. Bare `npm run verify` exit 0 after every one; **final
suite 846 pass / 0 fail / 0 TS errors** (baseline 835 — +11: one money fence,
six statusVocabulary tests, four lifecycle fences). Pushed under the autonomy
gate; `git` is the authority on what reached the remote.

**Money (F-011):** `servicePriceLabel()` no longer re-implements
`formatBudget()` — it imports it and owns only the '/hr'/'flat' suffix and
the null 'Ask for a quote' guard. Fence: `lib/services.ts` may not contain
locale calls, cents arithmetic, or a hand-built dollar string.

**The five lifecycle vocabularies are now one derivation + presentation:**

* `lib/jobLifecycle.ts` — CANONICAL, body untouched this run.
* `components/JobProgress.tsx` — adapter: `trackStepIndex(deriveJobLifecycle(
  status, payment: null))` collapsed to its 3 steps; local ORDER map deleted.
  One deliberate NON-string delta (decision 5): off-track statuses
  (cancelled — reachable from a worker's closed job — and anything
  unclassifiable) used to fall through `?? 0` and draw "Assigned" as done;
  they now claim nothing.
* `lib/jobStage.ts` — adapter: switches on the DERIVED state (payment-blind
  by signature; raw 'assigned' arrives as 'pending_payment' and still labels
  'Assigned'); exports the ONE `formatStatus` title-caser.
* `components/StatusBadge.tsx` — presentation: imports that `formatStatus`;
  its local character-identical copy is deleted; colour map unchanged.
* `ui/primitives/StatusPill.tsx` — presentation over caller-supplied enums;
  derives nothing. Its 14-value job map has ZERO `kind="job"` callers (only
  offer/payment pills mount) and stays byte-frozen for the operator's label
  pass. Both stale Phase-3 promises in its header are deleted — replaced by
  standing facts, no new promise.

**tests/statusVocabulary.test.mjs (F-070)** — `create type public.job_status`
predates the tracked migrations (phase40's precedent), so the enum is
reconstructed from four value-reference patterns, each asserted non-empty:
ALTER TYPE (phase45: draft), casts (phase23/24/60: open; 45/46/50/61: draft;
46/50: assigned), literal jobs.status writes (phase13/67/75: cancelled;
29/30/46/50: assigned), transition graph (29/31/35/51/58/68 + rollback/73:
assigned/in_progress/completed). Union == deriveJobLifecycle's raw cases ==
{assigned, cancelled, completed, draft, in_progress, open}. Seven derived
states beyond the enum sit in a reasoned allowlist (pending_payment,
confirmed, en_route, arrived, awaiting_approval, disputed, unknown — note:
seven, the dispatch's list of six omitted 'confirmed'); 'assigned' is pinned
as the one enum value the derivation never emits.

**The label snapshot** in that file (StatusPill's three maps, StatusBadge's
keys + frozen title-caser chain + render pipeline, jobStage executed through
the stripTypeScriptTypes harness, JOB_LIFECYCLE_LABELS) is **byte-unchanged
since the commit that created it** — no user-visible string moved this run.
**Label COLLISIONS found and left standing for the operator:** `in_progress`
renders "In Progress" (StatusBadge/jobStage, on WorkerJob + ClientJobDetail)
but "In progress" (JOB_LIFECYCLE_LABELS, on RouteArrival/WorkerJob action
titles; also StatusPill's unreachable job map); `pending_payment` is
"Awaiting payment" (StatusPill, unreachable) vs "Awaiting payment
protection" (canonical, reachable). Converging any of these means editing
the snapshot in a commit that says so.

**Screen ladders (decision 6):** replaced 5 — ClientJobDetail's hasLifecycle
(now `trackStepIndex(...) >= 0`, payment-blind so a failed payment read
cannot flip AGREED PRICE) and its funding-card in_progress/completed copy
fork (1:1 under canFundNow), RouteArrival's arrival caption, WorkChecklist's
read-only tag. Left as control flow: ClientJobDetail ×6 (canAccept, fetch
gate, cancelled section, Track-worker gate, held-payment card selector, the
completed section fork — the raw check there also distinguishes
completed-with-failed-reads, which 'unknown' collapses, and three suites
anchor its text), WorkerJob ×4 (fetch gate + three action sections),
RouteArrival ×1 (action bar), WorkChecklist ×1 (RLS-mirror edit gate),
useJobOwnerActions ×2 (permission gates, documented Hire-Again reason).
`lib/disputes.ts` verdict: clean — its own disjoint dispute vocabulary,
filters only, no lifecycle classification.

**Fences added:** services no-currency; no raw status→step-index map outside
`lib/jobLifecycle.ts` (sweep over screens/components/ui/hooks/lib);
JobProgress explicit claim-nothing branch; jobStage explicit `case
'unknown'` + no raw-status switch; one title-caser only; no Phase-3 promise
in StatusPill; WorkChecklist added to the one-helper screen loop. Every new
assertion was mutated red first (nine mutations across the run, each named
in its commit message).

**Device walk OWED (operator):** one job through assigned → in_progress →
completed, naming every label at each step — hub card badge (StatusBadge via
jobStage: "Assigned"/"In Progress" poster-side/"Completed"), ClientJobDetail
hero badge + JobProgress steps, WorkerJob badge + action-card title
(canonical: "Awaiting payment protection"/"Confirmed"/"On the way"/
"Arrived"), RouteArrival "WHERE THINGS STAND", and a worker-side cancelled
job's stepper (must now show NO completed steps).

## 2026-08-22 — BATCH H: error-handling honesty (F-026, F-027, F-013, F-042) — COMPLETE

One lens: can a failure be mistaken for a fact? Six commits, `54b289e`,
`071010a`, `dfd7f8d`, `57cd858`, `12e918e`, plus this file. `npm run verify`
exited 0 after every one; final suite is **835 tests, 0 failures, 0 TS
errors** (baseline was 814/0/0 — 21 tests added, most in the new
`tests/errorHonesty.test.mjs`).

**The `unknown` states introduced, and where they render:**

* `deriveJobLifecycle` accepts `hasOpenDispute: 'unknown'` (a FAILED dispute
  read, distinct from "no dispute") and derives ONLY `'unknown'` from it —
  fenced by executing every status x payment combination. `TrackWorkerScreen`
  renders the shared error state with Retry; `ClientJobDetailScreen` replaces
  its money block and completed-job fork with a retry banner. A network error
  can no longer paint a normal job progressing to auto-release.
* `useLegalGate` gained `'unknown'` (operator chose FAIL CLOSED): a failed OR
  thrown acceptance read blocks in App.tsx on the shared error template with
  Retry (`legal.recheck`); nothing is persisted, and the fail-open log line is
  gone — fenced extinct over all source trees (docs/ keeps the audit record).
  `gateStateForStatus()` is pure, allow-listed, and executed offline with a
  rejected read.
* `TrackWorkerScreen` earns `ready`: skeleton loading until the payment+dispute
  pair and the worker-name read settle (F-027), through DetailScreen's
  ScreenState — configured, not reinvented.

**F-026's other eight:** exact address (ClientJobDetail timing card),
poster+stats (JobDetail, one settled pair, one retry row), worker job stats
(ProfileDetails meta row), bid count (`useJobOwnerActions` fails CLOSED and
`JobOwnerActions` says so with Retry). TrackWorker's payment read is part of
the settled pair; ReviewSection's submit already surfaced via alertAsync —
no change needed there. The `if (active && !error)` idiom is EXTINCT and
fenced (acceptance grep over screens/hooks/components returns nothing).

**F-042 — the six paths, and which are best-effort:** draft save retries once
then alerts ONCE per streak (executed test); dead notification tap alerts
when the payload names a screen it can't open (executed test). Classed
best-effort with recorded, later-acted-on state: (1) sign-out token
deactivation — retry, then `brazos.push.pendingDeactivation`, settled at next
sign-in BEFORE registration (the dispatch's own example); (2) launch token
sync — retry, then re-sync on every app foreground (an alert would misfire on
every routine offline launch); (3) server-side mode write — retry, then
`brazos.mode.pendingWrite.v1.<uid>`, which the next resolution reads to
refuse the stale remote and re-push (a failed write previously let the server
silently REVERT a switch on next launch). The "sixth path" ambiguity was
resolved per the continue-path to ReviewSection's storage-cleanup trio
(99/187/253) — retry once, still-failed urls stay in `draftPhotosRef` for the
session's later sweeps; the unmount-time residue has no in-app actor and says
so in a comment. `PostJobScreen.tsx:273` (same leak class) is OUTSIDE this
batch's file list and still owed.

**Files touched beyond the dispatch list, each forced by a decision:**
`lib/jobLifecycle.ts` (decision 1's "explicit unknown in the data layer"),
`App.tsx` (the gate's render site), `components/JobOwnerActions.tsx` (the
hook's surface), `hooks/usePushNotifications.ts` (named by path in decision
4), `modes/modeStorage.ts` (the mode-storage authority), three test files.

**Fence-fact updates (old → new):** `tests/postJobDraft.test.mjs` and
`tests/crossModeNotification.test.mjs` stub tables each gained the new
`./dialog` import (was: AsyncStorage-only / jobs+navigationRef-only).
No fence logic was weakened. Mutations run red-then-green: lifecycle
unknown-early-return, ClientJobDetail completed-fork gate, TrackWorker
settle-gate, gate fallback flipped to 'accepted' (3 tests red), draft
alert-once gate, dead-tap alert guard (line-verified after a no-op perl).

**Device checks OWED (operator, physical device):** airplane-mode cold start
→ must show the Terms-check retry screen, never Home and never an eternal
spinner; airplane-mode open of an assigned/completed job's detail → retry
banner, never a progressing/releasing job; Track Worker first frame →
skeleton, then timeline, no reflow.

**BATCH I follows** (money/lifecycle consolidation). Its two shared files
(`ClientJobDetailScreen.tsx`, `JobDetailScreen.tsx`) were touched ONLY on
error-handling lines here — verified hunk by hunk; the ten raw status
ladders, JobProgress, and StatusPill/StatusBadge are untouched for I.

## 2026-08-22 — RUN D+E+G: motion driver, asset diet, honest copy, dead status writer — COMPLETE

**D — one Animated driver (F-017, F-041, F-052).** `lib/motion.ts` now owns
the platform decision: `USE_NATIVE_DRIVER = Platform.OS !== 'web'`, plus
`JS_DRIVER = false` for the two borderColor animations no platform's native
module can drive (`AuthField`, `PhoneNumberInput` — their literal `false` was
required, not drift, but the fence bans all literals, so they read the named
constant; this is the run's one reported deviation from the dispatch's
enumerated sites). Thirteen files dropped private declarations; PhotoViewer's
seven, PulseDot's two and Customer Home's two hardcoded `true` became the
import; SetupScreen's two opacity-only `false` flipped to the shared constant
(the F-041 behavior change — those pulses now drive natively on device);
Toggle's inline platform read became the import. `tests/motionDriver.test.mjs`
fences it: no `useNativeDriver:` literal, no inline `Platform.` driver, no
redeclaration anywhere outside `lib/motion.ts`. Every fence branch was mutated
red before keeping.

**E — assets (F-016).** Deleted the four orphans re-proven unreferenced this
run by grep over every config, script and source file: `splash-icon.png`
(254,638 B) and the three `android-icon-*.png` (100,485 B) — 355,123 B gone.
The design master `brazos-logo-source.png` (1,887,276 B) moved out of the
bundled tree to `docs/brand-source/`, and `scripts/generate-icons.ps1`
archives the master there now. `node scripts/home-shots.mjs --build` exported
clean afterwards — 40 bundled assets, nothing missing, all four Home shots
rendered. **The downscale commit was SKIPPED: this machine has no image tool**
(no `sharp`/`jimp` in node_modules, no ImageMagick, no Python at all) and
installing one is outside a run's authority. `hero_toolbox_worker.png`
(1329×885 for a 162×108 pt slot) and `app-icon-v2.png` (1254×1254) stay
oversized on the raster roster; that work is owed to a session with a tool.
`brazos_b_drape.png` (F-036) untouched by standing decision.

**G — honest copy and the dead writer (F-007, F-024, F-008).** Customer
Home's search-arrow accessibility label is now `"Search"` (was "Smart
matching is on" — a router the product does not have), and the stale
gold-sparkle comment went with it. `tests/copyHonesty.test.mjs` fences
"smart matching", "matching is on" and the word "AI" out of components,
hooks, lib, modes, navigation, screens and ui entirely — comments included,
since a comment is exactly how the label drifted in. The demand caption now
states only what `similarPostedToday()` measures — `{n} similar jobs posted
today` (`1 similar job posted today` singular), rendering nothing at zero;
no distance or "area" claim survives anywhere. `lib/jobStatusCompatibility.ts`
and its PGRST202 fallback in `lib/jobs.ts` are DELETED, and the
`tests/hardening.test.mjs` test that asserted that writer exists is INVERTED:
it now proves the module stays deleted, no fallback returns, phase31's
`transition_job_status()` remains the only status mover, and nothing under
`lib/`, `hooks/`, `screens/`, `components/` chains `.update()` off the jobs
table at all. `isMissingRpc()` in `lib/profiles.ts` is a different shim and
was deliberately left alone. `scripts/verify-schema.mjs`'s comment naming the
deleted module was corrected in the same commit.

**Suite:** 810 tests at run start → 814 at run end (+3 motion fences, +1 copy
fence, hardening swapped one test for one test), all green, 0 TS errors,
`npm run verify` exit 0 after every commit. **Light mode FROZEN was honored
and proven:** the run's full diff contains exactly one style-sheet line — the
removal of the `jobMetaText` key orphaned by the caption merge — and zero
changed color, spacing, radius or palette values in either theme.

**Device checks OWED (operator, physical device):**
- Live Nearby pulse on Customer Home (driver now platform-derived).
- PhotoViewer pinch-zoom, double-tap zoom, and dismiss springs.
- Setup screen's legal-row completion pulse (now native-driven — F-041).
- Customer Home similar-jobs caption with real jobs posted today.

## 2026-08-22 — BATCH C: corrective migration phase76 — APPLIED TO STAGING, VERIFIED

**phase76 was hand-applied to STAGING by the operator on 2026-08-22, and the
operator's own `node scripts/verify-schema.mjs` run came back green** — the
posture line reading `rls posture: payments RLS on with a SELECT boundary
[payments RLS on, 1 SELECT policy(ies)]` and the run closing with `All
REQUIRED objects exist in the live database.` **F-002, F-004, F-040, F-049
and F-068 are CLOSED.** The evidence is that operator-run verify against live
staging — not a repository read; no agent run has contacted any database.
(This supersedes this section's original "AUTHORED, NOT APPLIED" banner,
which was true when written.)

**If the paste aborts, that is the file working.** Everything runs in one
transaction; nothing half-applies. The messages it can raise, and what each
means:

- `phase76: table public.<name> not found` / `phase76: job_request_parties_ok
  (uuid, uuid) not found` — wrong or unmigrated database; nothing happened.
- `phase76: policy <name> on public.blocks|mutes not found` — the phase13
  moderation policies are missing, so the premise of the narrowed revoke is
  false; investigate before re-running.
- `phase76: RLS is OFF on public.payments` — the F-002 disaster case is LIVE:
  the phase50:174 SELECT grant is exposing the money ledger. Do not re-run;
  investigate how RLS was lost. (The file asserts, deliberately never enables.)
- `worker_services_money_ceiling` constraint violation — a staging row has
  price_cents above 10,000,000 (or negative). The apply aborts loudly by
  design (no NOT VALID); report the row rather than widening the ceiling.
- `PHASE76 SELF-CHECK FAIL (a)–(f): …` — a post-condition did not hold
  (payments RLS/policy, the pg_temp re-pin, the grant sweep including the
  load-bearing blocks/mutes insert/delete grants, the ceiling, jobs.location,
  or the posture function's ACL). The transaction rolled back; nothing landed.

**What the file does, per finding:**
- **F-002** — asserts `payments` RLS is on (raises if off); then, at apply
  time, creates `payments_select_parties` (`payer_id = auth.uid() or payee_id
  = auth.uid()`, columns from phase50's own DDL) ONLY if staging has no
  SELECT policy on `payments`; if the pre-repo policy exists it creates
  nothing and records the policy name(s) in the table comment. Which branch
  ran is visible in the SQL Editor afterwards via the table comment.
- **F-004** — `alter function public.job_request_parties_ok(uuid, uuid) set
  search_path = public, pg_temp;` restoring phase64's pin that phase68's
  CREATE OR REPLACE silently dropped.
- **F-040** — write grants now tell the truth on the seven B.4 tables:
  full `insert, update, delete` revoke from `authenticated` on
  `job_requests`, `direct_threads`, `banned_phones`, `job_disputes` (re-assert
  of phase51:201) and `worker_semantic_docs` (re-assert of phase39:173);
  **UPDATE-only on `blocks` and `mutes`** — phase13's insert/delete policies
  carry live app writes (`lib/moderation.ts:80–104` block/unblock/mute/
  unmute), so those grants are load-bearing and kept, and the self-check
  asserts they SURVIVED. This is a deliberate, reported deviation from the
  dispatch's blanket list; the batch report has the evidence.
- **F-049** — `worker_services_money_ceiling`: `price_cents >= 0 and
  <= 10000000`. NULL still means "ask" and phase53's inline `> 0` check still
  rejects zero; this adds only the missing ceiling.
- **F-068** — `jobs.location text` folded in as idempotent DDL. The orphan
  `supabase/add_location_column.sql` is UNTOUCHED on disk; deleting it is an
  operator call.
- **New:** `phase76_rls_posture()` — SECURITY DEFINER, pg_temp-pinned,
  deliberately anon-executable (the second such function after
  `job_categories_expanded`), returning RLS booleans for a fixed eight-table
  list plus `payments.select_policy_count`. No names, no definitions, no rows.

**Machine state at end of run:** four commits on `mainexpo` (`e0fdd35`
schema, `e1e5dcc` verify group, `208448e` tests, plus this HANDOFF commit),
pushed under the autonomy gate after a green bare `npm run verify` — 810
pass / 0 fail / 0 skipped, exit 0 (baseline this run: 804 pass). The six new
tests were each mutated red before being kept. `git` remains the authority on
what reached the remote.

## 2026-08-21 — BATCH B: production guard + verify-schema honesty (F-003, F-006): COMPLETE

Five commits on `mainexpo`. **Suite at end of run: 804 pass / 0 fail / 0
skipped, exit 0** (bare `npm run verify`; this run's baseline was 799 pass /
0 fail). Pushed under the autonomy contract's gate after the final green
verify — flag-free `git push origin mainexpo`; as always, `git` is the
authority on what actually reached the remote.

**The CLAUDE.md push contradiction is CLOSED.** The Workflow bullet that
still said "Never autonomously `git push` …; also mechanically denied" now
defers to the "Agent autonomy" contract as the single authority and states
the gate: flag-free `git push origin mainexpo`, only after `npm run verify`
exits 0 in that same run. No other CLAUDE.md statement contradicts the
contract. This was the one protected-control edit the dispatch authorized.

**`scripts/verify-schema.mjs` was refactored and hardened, and was never
executed** — no database was contacted this run; the new tests import its
exported functions instead of running it.

- **F-003 closed.** main() hard-refuses the production project ref FIRST:
  a `.env` URL or key, or `SUPABASE_DB_URL_STAGING`, resolving to production
  exits 4 with the source named — evaluated before `headers` is assigned and
  before any request exists. Parity alone could never catch an
  all-production `.env` (three agreeing refs pass parity); that is the hole
  this closes.
- **The ref constants live in `scripts/supabase-ref.mjs`** (`STAGING_REF`,
  `PRODUCTION_REF`) — MOVED there from `eas-build-pre-install.mjs`, not
  retyped; both gates and the tests import the one definition. Never retype
  a ref literal anywhere.
- **F-006 closed.** PENDING now fails the run — an unmet sentinel used to
  print PENDING, suppress its whole group and still exit 0, so a completely
  unmigrated database passed. And `checkColumnRevoked` passes ONLY on a
  denial (403 / body code 42501, the `checkRpcDenied` shape); a 404 missing
  table or 42703 missing column now fails as absent-is-broken-not-secured —
  23 assertions, `payments` among them, previously passed on ANY non-2xx.
- **Exit codes** (the frozen `EXIT` map in the script header is the one
  definition): 0 ok · 1 MISSING ("applied wrong") · 2 missing `.env` values
  or control-probe failure · 3 env parity failure · 4 production ref
  refused · 5 PENDING ("not applied yet"). MISSING wins the code when both
  are red; the summary prints both counts.
- **Importing `verify-schema.mjs` is now side-effect-free** — everything
  effectful lives in main() behind the same isMain guard the EAS gate uses —
  which is what lets `tests/verifySchemaGuards.test.mjs` pin all of the
  above offline. Ten core assertions were mutated red in two batches and
  restored green before the commit.
- The missing-tooling-ref condition **stays a warning by decision**: the
  ref feeds only the optional app-vs-tooling cross-check, no probe uses it,
  the verdict line already refuses to over-claim ("app side only"), and
  `envParity.test.mjs` pins warn-not-fail as the designed contract.

**OPERATOR STEP OWED:** with `.env` pointed at staging, run
`node scripts/verify-schema.mjs` yourself (optionally with
`SUPABASE_DB_URL_STAGING` exported for the tooling cross-check). Expect
exit 5 while sentinel-gated migrations remain unapplied — that is the new
honest signal, not a regression. Exit 4 means a ref resolved to production:
stop and fix the environment before anything else.

**NEXT: BATCH C — phase76**, per the operator's batch sequence. Nothing in
this run touched `supabase/` or contacted any database.

## 2026-08-21 — Autonomy contract + locked-section repair (F-020): COMPLETE

Five commits on `mainexpo`, based on `36d7831`. **Suite at end of run,
measured 2026-08-21: 799 pass / 0 fail / 0 skipped, exit 0.** Bare
`npm run verify`, stdout redirected, exit read from `$?`. At this run's
baseline the suite was 798 pass / 1 fail — the one red was the `home(16)`
hero-column fence, green again once `HERO_ART_INK_LEFT` was set to the
operator-approved re-measurement (`0.1775`) for the trimmed hero raster.

CLAUDE.md's malformed locked section was repaired (the list is EMPTY by
decision), and the guard + deny matrix now permit exactly one push form —
`git push origin mainexpo`, flag-free — proven by a 27-case harness run
against the guard's own matching logic: every force, wrong-ref, flagged,
`-c`-prefixed and bare push form still blocks, as do the production-ref,
`.env`, `start.ps1` and `.claude/` guards. NOTHING WAS PUSHED this run, by
dispatch instruction: the operator pushes these five commits manually; every
run after them pushes itself under the contract.

**CLAUDE.md's "Agent autonomy — what a run may finish without the operator"
section is the authority on what a run may finish unattended.**

The open contradiction this section recorded — CLAUDE.md's Workflow bullet
still forbidding autonomous `git push` — is RESOLVED: the operator authorized
the Batch B run (section above) to rewrite that one bullet, and it now defers
to the autonomy contract and states the gate.

## 2026-08-20 — Customer Home to the REPLACED master 44 (`home(20)`–`home(28)`): COMPLETE

Seven functional commits plus this record, on `mainexpo`, based on `7bffaac`.
**Suite: 795 pass / 0 fail at baseline → 799 pass / 0 fail / 0 skipped, exit
0.** Bare `npm run verify` after every commit, stdout redirected, exit read
from `$?`. No assertion was relaxed, deleted, skipped or allowlisted; the
recorded FACTS that the master replacement made false were updated to the new
facts, and every one of them is named in the run report's "Stale numbers"
table. Every new or rewritten assertion was mutated and observed red before it
was kept.

The living record — every measurement, the acceptance table, the reversals, the
export specs and the device checks — is the **"Customer Home to the REPLACED
master 44 — 2026-08-20"** section at the end of
`docs/mockups/PRESTIGE_RUN_REPORT.md`. This is the operational summary.

### THE ONE THING TO READ BEFORE ANYTHING ELSE

**`docs/mockups/44_customer_home_dark.png` IS A DIFFERENT PICTURE.** It is
**853 x 1844** where the file every earlier run measured was **941 x 1672**, and
it draws two things that one did not: a centre **[ + ]** in the bottom bar, and
a promo heading on **TWO** lines rather than three.

So **every number in the sections BELOW this one that says "master 44
measures" or "master 44 draws" is stale**, including the ones in the
`home(11)`–`home(19)` section immediately following. The run report's "Stale
numbers" table is the complete list of what that voided and what replaced it —
27 rows, across `screens/HomeScreen.tsx`, `lib/homeDesignStudio.tsx` and three
test files. Nothing was left half-updated; a fence that recorded an old fact
now records the new one.

The aspect is the reason it matters beyond the pixel counts. The old file was
0.5628 against a 393x852 device's 0.46127 — 22% off, so only its WIDTH
transferred and `MASTER_TO_DEVICE` used the width ratio for vertical measures
too. The new file is 0.46258, **0.28% off**, so heights transfer and every
vertical number is now measured directly.

### The agent can measure this screen, not just look at it

`node scripts/home-diff.mjs` (new) takes a harness render and the master,
normalises the render onto the master's pixel width, and prints every outlined
control's box and every band of ink in POINTS, with the deltas. It reports Y
content-relative from two declared insets, because the master carries a 59pt
iOS safe area and the web harness reports none — raw Y would otherwise show a
59pt error on every element on the screen and hide the real ones. Output goes
to stdout only; nothing is written to disk.

`node scripts/home-shots.mjs --build` is still what makes the render.

### home(21) DID NOT RUN — no font is bundled

`assets/fonts/` does not exist and no PlayfairDisplay face is anywhere in the
tree. Nothing was downloaded and no font file was created. Every type size in
this run is therefore the **largest that sets master 44's line count inside the
measured column**, in the currently resolved Georgia / platform sans, with the
residual cap-height gap recorded rather than met:

- hero headline: master 24.03pt of cap, shipped 31pt (21.4pt) — **2.6pt owed**
- promo heading: master 15.25pt, shipped 18pt (12.5pt) — **2.8pt owed**
- everything else is within 0.3pt, or frozen and over

Georgia needs **22% more ink per point of size** than the master's Didone on
both display strings. That is why both are capped by their columns. **Bundling
the face is the only thing that closes it.**

### What master 44 turned out to be, this time

- the hero scene is **184 x 162 pt** and runs **7.8pt PAST the right screen
  edge** — 400 x 351 of the master's own pixels, which is exactly the asset's
  own pixel size. `home(14)`'s 151 x 135 at `right: 0` is void.
- the chips are **two rows**, not three: "Other" sits on row 2 beside TV
  Mounting.
- the promo heading is **two lines**, and its long one measures 232.7pt of ink.
- the subtitle is **one line**.
- the mode-switch pill is **156.2 x 40.2** and its ring is a **near-neutral
  light grey**, not a gold hairline.
- "Live Nearby" measures a **30px cap = 20pt of Georgia** — bigger than the app
  was drawing it, not smaller.

### Four reversals a later run must not "correct"

1. **"Live Nearby" 16 -> 20pt**, reversing `home(16)`'s shrink. The replaced
   master's L is a 30px stem where the old one measured 26.
2. **The mode-switch ring `border` -> `homeSlate`**, reversing the colour half
   of `home(17)`. The old master's ring peaked #A9814B (warm olive, luminance
   73); this one peaks #AFACA4 and integrates to luminance 151–168. The WEIGHT
   half of `home(17)` survives: 1pt, because the master's ring is 0.92.
3. **The hero art `right: 0` -> `right: -28`**, reversing `home(14)`. The
   asset's rightmost eighth is flat vignette, so stopping the BOX at the screen
   edge stops the visible scene 23pt short of it.
4. **The promo heading three lines -> two.** `home(16)` recorded the opposite as
   a fact and pinned a size on it.

### The two device defects are NOT reproducible from this tree

Both were searched mechanically and both came back clean; the full list of what
was ruled out is in the run report.

- **The red code frame (`home(22)`)** quotes `screens/HomeScreen.tsx` lines
  49-50 *as they stood twenty commits ago* — they are at 51-52 now. No app code
  renders source text (no monospace anywhere, no error-message passthrough, all
  category lookups guarded), the frame's text exists only as a source comment,
  it is absent from a production bundle, and every asset `require()` resolves.
- **The WorkerResults crash (`home(27)`)**: `HomeScreen.tsx` has never held that
  string in its history, and Customer Home's "View all" calls `switchMode()`,
  which navigates nothing. The only live dispatcher is Worker Home, inside the
  stack that registers it.

**Both are consistent with a device running a stale JS bundle. Rebuild before
judging either.** `home(22)` shipped no code; `home(27)` shipped the gate that
was actually missing — a test that every cross-tab target reachable from the
customer tree either resolves there or sits behind a worker-mode gate. Map
offers the worker job list twice and only one of its two gates was fenced.

### Light is frozen, and proven so

Every change is `isDark &&` gated or lives in a `*Dark` style, and the diff was
read line by line for it. `home(21)` did not run, so light typography did not
move either. The light render is the Heritage composition unchanged: three-line
headline, two-line subtitle, three chip rows, three-line promo heading. The H19
fence gains the light subtitle, which `home(23)` forked.

### Still only a device can confirm

Two things the harness cannot show, both first in the run report's tap order:
the **safe-area seam** at the top (web reports a zero top inset), and whether
the first Live Nearby card **peeks above the dock** (the harness's jobs fixture
is empty by design, so no card renders). The second was computed rather than
left open: the first card's top lands at **767.2pt absolute** against a dock
top of **748**, so it sits 19.2pt behind the dock and nothing peeks — which is
what master 44 draws. Confirm it with real jobs loaded.

## 2026-08-20 — Customer Home to master 44 (`shot(0)`, `home(11)`–`home(19)`): COMPLETE

> **SUPERSEDED ON EVERY MEASUREMENT.** The master file this section measured
> was replaced before the `home(20)`–`home(28)` run above. Read this for the
> mechanisms it built — the raster roster, the ink-versus-box distinction, the
> shots harness — and NOT for a single number it quotes about master 44. The
> run report's "Stale numbers" table is the complete list.

Ten commits on `mainexpo`, based on `64bb408`. **Suite: 790 pass / 0 fail at
baseline → 795 pass / 0 fail / 0 skipped, exit 0.** Bare `npm run verify` after
every commit, stdout redirected, exit read from `$?`. No assertion was relaxed,
deleted, skipped or allowlisted; two recorded FACTS were updated to new facts
and both are named in the run report.

The living record — every measurement, every reversal, the hero export spec and
the device checks — is the **"Customer Home to master 44 — 2026-08-20"** section
at the end of `docs/mockups/PRESTIGE_RUN_REPORT.md`. This is the operational
summary.

### The one thing to read before anything else

**A "share of the screen" fence was measuring the box, not the art, and three of
them were.** `hero_armchair_customer.png`'s visible pixels covered 69.3% of its
own canvas and `brazos_b_drape.png`'s cover 60.7%, so with `contain` and a box
of the canvas's aspect the CANVAS filled the box while the INK filled two-thirds
of it. A 150pt hero slot drew 104pt of art; an 18.3%-of-screen drape box drew a
mark 11.1% of the screen wide. Every affected fence now multiplies the declared
box by the asset's own measured ink fraction, using `tests/pngGeometry.mjs`.

**If you write a fence about how big something looks, measure the PNG.**

### The agent can now see this screen

`node scripts/home-shots.mjs` renders Customer Home and Worker Home, dark and
light, at 393x852 CSS px into `.shots/` (gitignored). `--build` forces a fresh
`expo export`. It needs no credentials and reaches no database — it supplies its
own `__BRAZOS_CONFIG__` for a project that does not exist and answers every
non-local request itself. It is a comparison aid, not a check `npm run verify`
runs. **`HomeDesignStudio` cannot serve this purpose**: `App.tsx` gates it on
`__DEV__`, and `expo export` is a production bundle.

It earned its place twice in this run. `home(16)` shipped three type values that
were not theme-scoped and retyped the FROZEN light composition; nothing in the
source review caught it, and the screenshot did. `home(16b)` is the repair.

### What master 44 turned out to be

**It is a 941x1672 render — 9:16 — and the device is 0.4613.** Height fractions
taken off it do not transfer. The conversion is 393/941 = 0.41764, calibrated on
the nav pill (172px → 71.8pt against `layout.floatingNavHeight`'s 70).

**The master's scale is smaller than the app's in several frozen places** — its
search field converts to 49.7pt where the app draws 70, its "Post a job" cap to
15pt where the app draws 24. Those are frozen by operator instruction and did
not move. Do not "correct" them toward the master later without asking.

**Its ground is much darker than `#03110E`** (gutters mean luminance 1.6 against
the token's 13.8) and the palette is frozen, so the seam was closed by
uncovering the atmosphere rather than by repainting anything.

### The three things the master contradicted, where the master won

- **D6 claims the promo heading sets on two lines in the master. It sets on
  three**, exactly as the app already did. Only the leading changed.
- **D9 describes "the master's dark ring" on the [ + ]. Master 44 draws no
  [ + ]** — five classic tabs. O1/O2 and the 85–88% band govern instead.
- **D7 calls the mark "transparent-backed", which it already was.** What is
  missing is the fabric behind it.

### Artwork still owed — recorded, not faked

1. **A re-export of the hero scene.** The restored file is master 44's
   composition but only 400x351, so it upscales about 1.3x at @3x. The run
   report carries an exact export spec — 906x810, 1.119:1, opaque RGB, right
   edge bleeding, and a left/bottom falloff to 4–7/255 that closes the one seam
   still visible. Drop it at the same path; nothing in the slot changes.
2. **The promo card's fabric.** The gold B sits on a dark green drape in the
   master; no asset in the tree or in history has it, and no glow was faked in
   its place.

### The one deliberate reversal

`home(18)` puts the centre [ + ] back INSIDE the nav pill, reversing `home(8)`'s
overhang on operator instruction. It is also a correction: a control that must
fit inside a pill of constant height cannot be sized as a share of the SCREEN.
Nothing else about the bar moved — pill height, radius, border, background,
items, labels, glyphs, tint, slot spacing and bottom margin are all frozen and
none appear in that diff.

### Light is frozen, and proven so

The pre-run tree was rebuilt from `64bb408` and rendered through the same
harness: **0 differing pixels on light Customer Home, 0 on light Worker Home.**
`home(19)`'s fence pins every light value this run could have moved.

### Still only a device can confirm

The seam D1 was about lives in the **safe-area inset**, and web reports that as
zero — the harness cannot show it. The run report's "device checks, in tap
order" is the list; item 1 is the one that matters most.

## 2026-08-20 — Home reconstruction (`home(1)`–`home(10)`): COMPLETE

Nine functional commits plus this record, on `mainexpo`, based on `fbb6be9`.
`origin/mainexpo` is at `fbb6be9`, so **this run's commits are the unpushed
ones** — the emerald and audit work that the previous handoff described as
unpushed has since reached the remote. Read that from `git`, not from here.

Scope: Customer Home, Worker Home, the shared pinned-footer template, the dark
base tokens, and the raster roster.

**Suite: 781 pass / 1 fail at baseline → 790 pass / 0 fail / 0 skipped, exit 0.**
The one red baseline assertion was the expected raster/alpha claim, failing
because the transparent replacements were already installed; `home(1)` corrected
the recorded fact. **No assertion was relaxed, deleted or allowlisted anywhere in
this run.** Bare `npm run verify` ran after every commit, stdout redirected,
exit read from `$?`.

The living record — every decision, skip, deviation and mutation — is the
**"Home reconstruction — 2026-08-20"** section at the end of
`docs/mockups/PRESTIGE_RUN_REPORT.md`. What follows is the operational summary.

### The one thing to read before anything else

**The app did not build.** `assets/brand/customer-home-post-mark-hd.png` had been
deleted from disk while `screens/HomeScreen.tsx:51` still `require`d it. Metro
resolves an asset `require` at BUNDLE time, so this was not a light-mode blemish
— it failed the whole bundle, in both themes. `home(1)` repointed the light mark
at `assets/brand/brazos_b_drape.png`, the byte-identical brand-folder drape
installed in the same batch, kept under `assets/brand` so light never mounts an
`assets/prestige` file. **The customer promo card's LIGHT artwork is therefore
different from what shipped before this run** — that is the deliberate reading of
operator intent, and it is the first thing to look at on a device.

### What changed, by commit

|Commit|What it decided|
|-|-|
|`e9d0706` home(1)|The three hero rasters are real cut-outs (72.66% / 38.51% / 69.39% of samples fully transparent, corners at 0), decoded here from IDAT rather than trusted. The roster now measures BOTH bake directions; relabelling an asset `transparent` used to remove it from all checking. The gate did NOT move with the bake. Repointed the broken light `require`.|
|`1007cb0` home(2)|The B drape is 18.3% of SCREEN WIDTH, measured at render, with its height from the artwork's own 918x753 aspect and the promo heading's column computed from the same width. A fixed pt value cannot be a fixed percentage.|
|`b5357af` home(3)|`letterSpacing: -1` on six serif heading roles — `display`/`h1`/`h2` and `title`/`heading`/`subheading` — and on nothing else.|
|`7b8e3a3` home(4)|`components/HomeAtmosphere.tsx`: one fixed layer behind both homes, a SIBLING of the scroller so it never travels, pulled up by the safe-area inset so it is full-bleed above the notch, `cover`, dark only.|
|`839dd6a` home(5)|Dark base ground `#08110E` → `#03110E` in exactly three declarations. Light untouched, proved by hex inventory.|
|`ab485d9` home(6)|The Post a Job seam was a STRAY TOKEN — the photo nudge painted `mint` beside a `surface` footer. Found by searching every dark token and every alpha step over `bg` and `surface`.|
|`cba05ce` home(7)|Pinned footers stop reserving the floating pill's footprint a second time. New shared `PINNED_FOOTER_BOTTOM_PADDING` (= `layout.floatingNavGap`) at both templates and PostJob's hand-rolled footer.|
|`3c476a1` home(8)|The centre `[ + ]` is a FILLED gold control with forest content, 14.9% of screen width, dark only.|
|`f8abe8d` home(9)|"View map" leaves customer Home. The Map ROUTE stays registered and hidden.|

### Four reversals this run made that a later run must not "correct"

These join the seven already listed further down; do not undo either set.

8. **Gold FILLS the centre `[ + ]` in dark**, reversing decision 3's "no gold
   fills anywhere" for exactly that one control, on operator instruction. The
   masters draw it as a gradient; no gradient library exists and none was added,
   so flat palette gold is the accepted approximation. The tree-wide gold-fill
   rule is NOT weakened — the exception is recorded in
   `tests/goldOnForest.test.mjs` as one file-AND-style-key pair, so a second
   gold fill in the same file is still an offender, and a stale exception now
   fails the suite.
9. **A PINNED footer must NOT take `useFloatingNavClearance()`.** The bar is laid
   out in normal flow beneath the scene, so its space is already reserved; a
   footer that reserved it again put ~104pt of empty chrome under every action
   button. Scrolling surfaces still take the clearance and the hook is untouched.
   `tests/layout.test.mjs` now asserts the two classes with OPPOSITE assertions;
   its old roster ACCEPTED a pinned footer carrying the clearance, which is how
   the double count survived a device pass.
10. **The customer has no link to Map at all**, and the Map ROUTE stays
    registered anyway. Un-registering a route because nothing currently calls it
    is what turns the next dispatch into NAVIGATE-not-handled. The worker Map tab
    is untouched.
11. **Sizes that are stated as a percentage of the screen are derived from the
    screen**, not written as points. Both the B drape and the `[ + ]` read
    `useWindowDimensions()` at render. A future run that "tidies" either back
    into a constant reverses the only implementation that can hold the stated
    figure across 320–440pt.

### Held by a test, added by this run

The B drape's ratio, aspect (re-derived from both PNGs on disk) and copy column;
the promo heading's 25pt, so shrinking type never becomes the fix for a wrap;
the -1 tracking in both scales and its absence everywhere under 15pt; the
atmosphere's gate, its `cover`, its inset pull-up, its presence on BOTH homes,
and its position OUTSIDE the scroller; the dark ground in all three declarations
and the three LIGHT grounds at their exact frozen values; the Post a Job seam's
two surfaces compared to EACH OTHER; the pinned-footer / scrolling-surface
split; the `[ + ]`'s ratio, its filled treatment, its dark content, light's
frozen 52pt, and that `bottomNavHeight` mentions no `CREATE_` constant; and that
nothing on the customer Home stack links to Map — derived by parsing the stack's
registrations and resolving them through the file's own import map, so a screen
added to that stack falls under the fence automatically.

**Every fence was mutated before it was kept**, and one was rewritten because it
survived: the pinned-footer assertion originally passed on the mere IMPORT of
the shared constant. The mutation table is in the run report.

### Two places where the dispatch and the code disagreed

Both are recorded rather than smoothed over, and both are worth the operator's
eye:

1. The dispatch says the B renders at **~34.9%** of screen width. No code path
   produces that; the drape's box was 92pt (21–29% by device). The
   identification is still certain because the dispatch names the consequence —
   the CTA heading wrapping to three lines — and that is definitively the
   `heroMarkDark` / `heroCopyDark` pair.
2. The dispatch says the Post a Job strip and its footer share **an edge with no
   border**. They do not: the nudge carries a 1pt mint2 hairline and an 8pt gap
   below it. Everything measurable matched, so it is the element — but if a
   different surface was meant, that description is where to start.

### Frozen through this run

**Light did not move.** Mechanically: `ui/tokens.ts`'s light palette is 16 hex
values, byte-identical to base; `lib/theme.ts`'s is 31, byte-identical. The dark
palette's whole delta is `#08110E` out, `#03110E` in. Light keeps its 52pt
forest-filled gold-ringed `[ + ]`, its fixed Heritage mark and its fixed 68pt
promo reserve.

Also untouched: every modal scrim (all seven still `scrimInDark` at
`SCRIM_DARK_ALPHA = 0.55`, now compositing over the new ground — token
propagation, not a change); money formatting, money colour and every
payment-state label; the five-slot customer bar; `ModeShell`'s painted ground;
the derived clearance hook and the still-absent static token; schema, SQL, env,
`app.json`, `package.json`, `.claude/`, and every frozen web surface. No
dependency added. No marketplace data invented. No raw colour literal
introduced.

### Found and NOT fixed by this run

* **`screens/ChatScreen.tsx` double-counts the floating-nav clearance** on its
  whole `KeyboardAvoidingView` column — the same defect `home(7)` fixed for
  pinned footers. It is a composer under live keyboard behaviour rather than a
  pinned action bar, and Chat was outside scope. **This is the highest-value
  carry-forward from this run.**
* **Customer Home's LIGHT `heroMark` box is `79x101`**, sized for the old
  portrait post-mark; it now holds the landscape drape, which `contain` renders
  at `79x65` centred inside it. Undistorted and correctly placed, but the box
  reserves ~36pt more height than the art uses. Light is frozen, so it was left.

*(One carry-forward WAS cleared: `lib/navigation.ts`'s stale block comment — item
9 below in the previous handoff, "the single most worthwhile one-line fix in the
tree" — is corrected. It sat directly above a JSDoc `home(9)` was editing and it
described the customer bar as `Home · Map · My Jobs · Messages · Profile`, which
is exactly what `home(9)` must not have restored.)*

## 2026-08-19 — Emerald correction pass: COMPLETE, and INDEPENDENTLY VERIFIED

**Now on `origin/mainexpo` (`fbb6be9`).** The previous handoff's "nothing is
pushed" no longer holds; `git` is the authority and says the seventeen
`emerald(N)` / `audit(N)` commits are on the remote.

### The verification, first

A second run audited the eleven emerald commits before they could be pushed. It
did not make them and did not read the chat log that produced them: every
verdict is derived from `git log`, `git diff` and the source at HEAD. Its record
is **`docs/audits/EMERALD_VERIFICATION_2026-08-19.md`**, and its summary is the
**"Verification 2026-08-19"** section of `docs/mockups/PRESTIGE_RUN_REPORT.md`.

**Verdict: SAFE TO PUSH.** No cross-run contradiction, no functional breakage,
no source file repaired. Six regression fences (`tests/emeraldFences.test.mjs`),
each proved red by mutation before it was kept. Floor **775 → 781 pass**.

**Three things it found that the pass's own record does not say plainly:**

1. **emerald(2) ADDED a painted layer; it did not remove one.** D2 as worded
   asks for every layer behind the tab pill to be transparent. Nothing of ours
   was painting — the band was the iOS root view showing through a MISSING
   ground — so the fix is a NEW `backgroundColor: palette.background` on
   `navigation/ModeShell.tsx`. That is the opposite of the instruction, it is
   correct, and **it is not in the six-reversal list below.** A run that reads
   D2 literally and deletes that View brings the white band straight back. Two
   suites now go red if it does.
2. **Two currency figures DID change colour**, so "money colour was not touched
   at all" is PARTIAL rather than absolute. Both are selection chips whose LABEL
   is an amount, and only in the selected dark state: `ReviewAndTipScreen`'s tip
   presets and `JobFilterSheet`'s budget chips took D6's gold. Every money
   surface in a money role is byte-identical.
3. **`lib/navigation.ts`'s stale block comment** describing the pre-emerald(1)
   customer bar. **Cleared by `home(10)`** — see above.

### The correction pass itself

**No SQL executed, no database contacted, no `.claude/` file modified, no `.env`
read, no dependency added or mutated, no frozen web surface touched, `app.json`
untouched, `package.json` untouched, `lib/authTheme.ts` untouched, no image
asset added.** The audit re-derived every one of those mechanically.

A second dark-mode pass on a physical iPhone produced 38 screenshots. That run
fixed what they show plus five direct operator instructions, and it was **not** a
paint-only run: two of the eleven commits changed structure (the customer tab
bar, the profile store), and three of the reported "paint" defects turned out to
have non-paint causes.

**The locked-screen set is EMPTY.** `CLAUDE.md` says so, and
`.claude/hooks/guard.ps1` agrees mechanically — its `GUARD-PATH-LOCKED` rule
sits inside `if ($false)` and can never fire. *(Two housekeeping notes for
whoever owns those files: the `$locked` array in the guard is now dead code that
still reads as live, and `CLAUDE.md`'s locked section ends with a dangling
`screens/BrowseJobsScreen.tsx` after the sentence that unlocks everything.)*

### Seven reversals a later run must not "correct"

1. **Map → Discover on the customer bar**, reversing manifest B-2. Label, glyph
   AND destination. The worker bar keeps Map.
2. **My Jobs left the customer bar.** The ROUTE stays registered — removing it
   would break the [ + ] sheet and all notification routing.
3. **The emerald/red toggle is retired.** Neutral track in both states; the knob
   carries the state. Red is not an error state for "not taking new work".
4. **Nav glyphs went 29 → 28** under a heading that says "LARGER". The explicit
   number won; the direction is on the record.
5. **`layout.floatingNavClearance` is deleted** as a token; a test fails if a
   static clearance token returns. *(`home(7)` narrowed WHO takes the derived
   replacement — scrolling surfaces, never pinned footers — without retiring the
   hook.)*
6. **All seven modal scrims went 0.7 → 0.55 in dark**, the filter sheet
   included — it was one of the seven identical copies, not the reference the
   others differed from.
7. **The ground behind the floating pill is PAINTED, not transparent.** D2's
   wording asks for the opposite; nothing of ours was painting and the white band
   was the iOS root view showing through a missing ground, so
   `navigation/ModeShell.tsx` gained a `backgroundColor: palette.background`.
   `tests/layout.test.mjs` and `tests/emeraldFences.test.mjs` both go red if you
   delete it.

### Frozen — as re-checked by the audit, which widened the check

The nav active tint is still `palette.emerald`. The verification badge is still
absent from every user-visible surface. Saturated per-category tile fills are
still retired in dark across all seven consumers. The centre [ + ] survives,
dead centre of five slots *(and is now filled gold in dark — see reversal 8)*.
Master 34's inbox search, master 46's compare grid and its "best fit" ribbon
remain unbuilt. No marketplace data was invented and no user-facing copy changed.

**Money is the one freeze that is PARTIAL.** All six dedicated money surfaces are
byte-identical and the five money-bearing detail screens took padding-only
edits — but two SELECTION CHIPS whose labels are amounts took D6's gold in their
selected dark state (`ReviewAndTipScreen`'s tip presets, `JobFilterSheet`'s
budget chips). No payment-state label moved and no CLAUDE.md money invariant is
affected. `MoneyText`'s colour rule is pinned by a test.

### Held by a test, versus held only by human review

**A test goes red if a future run reverts any of these:** the customer bar's
five-slot composition and the absence of a My Jobs item; My Jobs reachability
and every cross-tab dispatch target in both trees; Discover's label, glyph AND
destination; the hide-without-unregister mechanism; the ground behind the pill;
the state-blind toggle track and the single availability store; all seven
scrims; the selection and disabled helpers; the derived clearance, the deleted
static token and (new) the pinned-footer split; the nav glyph sizing;
`MoneyText`'s colour rule; the retired per-category fill; the absent
verification badge; `authTheme` and `CountryPicker`; the raw-literal scan; plus
everything `home(1)`–`home(9)` added, listed above.

**Nothing offline can reach these:** the band's rendered result on a real
iPhone; MapKit re-rasterisation across a live OS theme flip; anything reading a
runtime safe-area inset — which now includes BOTH the scroll clearance under the
pill AND the atmosphere layer's inset pull-up AND the pinned footers' new
spacing; keyboard appearance; label ellipsis at an accessibility text size; text
WRAPPING, which is what `home(2)` set out to fix; and the two availability
toggles agreeing ACROSS a navigation.

### What only a physical iPhone can confirm from THIS run

Nothing was rendered, screenshotted or visually verified — there was no
simulator and none was attempted. The full eleven-item list is at the end of the
run report's home section. The five that matter most:

1. **That the app builds and launches at all** — `home(1)` repaired a `require`
   of a deleted asset that would have failed the Metro bundle.
2. **The atmosphere layer** — full-bleed to the top of the screen, NOT moving
   when the page scrolls, uncovered by any card or scroller, and absent in light.
3. **The CTA heading's wrap** on Customer Home. Two lines rather than three is
   the whole point of `home(2)`, and text layout is not computable offline.
4. **The pinned footers' new 12pt** under Back / Continue, Publish job, Cash out
   and Delete my account — neither crowded by the pill nor floating away from it.
5. **The `[ + ]` where it overhangs the pill's rounded top edge.** It now rises
   ~11pt above the bar rather than ~4pt, and only a device shows whether that
   still draws cleanly.

### Carried forward from the earlier passes

The dark device pass before the emerald run is recorded in full as the **"Dark
device pass 2026-08-19"** section of the run report. Two of its findings still
stand and keep being rediscovered:

* **`forest` was the Heritage brand green ON CREAM; Prestige v2 made it the one
  solid FILL.** Any unconverted surface using it as CONTENT — a label, a body
  line, a dashed edge, a glyph — resolves in dark to one deep green on another
  and simply disappears.
* **The saturated per-category tile fills are retired in dark on purpose**,
  including the purple `dog_walking` tile masters 11 and 13 visibly draw.

**The raster roster** (`tests/themeResolution.test.mjs`) holds every mounted
image with its MEASURED background and a gate decision. `home(1)` strengthened
it to measure both directions and `home(4)` added the atmosphere layer to it.
**Adding a new image asset still fails the suite until it is put on that roster
with a gate decision.** That is intended.

### Invariants, unchanged

No schema was touched and no database contacted, in any of these runs. Money is
still integer cents through `formatBudget()`. `accept_offer()` is still the only
assignment path and `transition_job_status()` the only status mover; exact
address still comes from `job_locations` behind RLS; lifecycle derivation is
still expressed once; no marketplace data was invented. One account still
carries both capabilities, and mode still changes only through `switchMode()`.

**Navigation semantics changed twice, deliberately and customer-side only.**
emerald(1): two destinations left the customer bar and one joined it. `home(9)`:
the customer's last LINK to Map is gone. **No route was removed in either** —
`Map` and `MyJobs` stay registered and dispatchable, hidden — so every existing
NAVIGATE still resolves and no deep link needed retargeting.
`tests/emeraldFences.test.mjs` pins the whole class: every cross-tab tab name
dispatched anywhere must be registered in BOTH trees.

**One data-flow change** (emerald(6)): `hooks/useProfile.ts` is a shared store
rather than a per-component hook. Nine screens read it. Fetch behaviour is
unchanged — each mount still refreshes — but a write on one screen is now
visible on the others immediately.

## THE LIGHT-mode parity audit — DISPATCHED, AUDITED, PARTLY FIXED

**No longer outstanding as an audit.** `ce4e6ec` wrote it
(`docs/audit/2026-08-22/light_mode_parity.md`, P0 0 / P1 0 / P2 10) and the
2026-08-22 cleanup run above closed **L-010** (`dd518d9`) and **L-002**
(`1714fd8`), skipped **L-001** at its gate, and left the rest.

**Still open from that audit:** L-003 (`lib/hotspots.ts`'s 4 heat-tier
strokes — the last live-rendering literal with no token home, and now also
recorded as G-003), L-004/L-006 (auth-surface literals whose token home
`lib/authTheme.ts` is editable again), L-005 (`CountryPicker`'s hand-mixed
scrim), L-007 (shimmer core, blocked on dark transition assets), L-008 and
L-009 (dev-only and frozen-web, no action available).

**C2's item L1 is CLOSED.** `lib/jobs.ts`'s light-only `JOB_CATEGORY_COLORS`
was named there as "the biggest outstanding light decision"; `1714fd8`
resolved it — the values are a theme-constant token group in `ui/tokens.ts`,
F5 continues to prove dark never paints them, and the light rendering did not
move. Do not re-open it from the run report's C2 list.

The rest of the light debt below stands as written.

Light stayed FROZEN through the home reconstruction as it did through emerald:
every colour change branched on `isDark` or moved a dark-palette value only, and
the light palettes are byte-identical to base. The structural exceptions are
stated in the run report.

**This run added to the light debt:**

* **Customer Home's promo card mounts a DIFFERENT light mark** than it did
  before (`home(1)`), because the old one had been deleted from disk. Look at it.
* **The light `heroMark` box is `79x101` holding a landscape drape**, so
  `contain` centres a `79x65` render inside a taller reserve.
* **`screens/PostJobScreen.tsx`'s photo nudge is now `surface` in light too**
  (`home(6)`), not `mint`: white on the ivory page with a mint hairline. This is
  a token swap, not a palette change, and it closes the same seam in both themes.
* **`components/HomeAtmosphere.tsx` renders NOTHING in light** — deliberate, and
  the reason light's homes keep their existing flat ground.

**CORRECTION to the standing light list:** section (c)'s item **L4** says
`assets/brand/customer-home-chair.png` bakes `#FAF5F1` opaquely and is
"invisible only because it matches `homeBackground` exactly today". **That is no
longer true** — `home(1)` measured it as a real cut-out, 62.81% of samples fully
transparent. L4 is closed. Everything else in section (c) stands.

**The scope is written out in full** as section **(c) THE LIGHT AUDIT HANDOFF
LIST** at the end of `docs/mockups/PRESTIGE_RUN_REPORT.md`, in four parts: C1
(thirteen shared components with light branches), C2 (the five D10 deferrals —
of which L1, `lib/jobs.ts`'s light-only `JOB_CATEGORY_COLORS`, was the biggest
outstanding light decision and is now CLOSED by `1714fd8`), C3 (both-theme
changes nobody has seen under light — read it for its debt list, NOT for the
bar's composition, which it describes wrongly as six slots), and C4
(theme-neutral changes, listed so they are not re-audited).

### Open items carried forward

0. **The two P1s from the guard-coverage audit** (`19357ab`) are the most
   actionable items on this list and both are one-file changes with a fence
   attached. **G-001**: wrap the extraction in
   `ui/primitives/MediaUploader.tsx` through `userMessage()`, and add `'ui'`
   to `tests/errorMessage.test.mjs`'s `dirs` **with** `{ recursive: true }`.
   **G-002**: CI cannot run the 120-test guard suite on `ubuntu-latest`, so
   either add a Windows job for it or stop treating a green CI badge as
   evidence the guards were verified. Neither was fixed here — that audit was
   dispatched read-only.

1. **Master 34's inbox search, its four filter tabs and its per-thread unread
   COUNT** are not built — functionality, not presentation, and the data model
   has no support-thread kind and no per-thread count.
2. **Master 46's three-column grid and its "best fit" ribbon** are not built —
   bid count is unbounded, and the ribbon asserts a judgement no stored figure
   supports. The honest HIGHEST RATED badge stays.
3. **The map tiles are CLOSED, with the mechanism named.** `HotspotMap.native`
   sets the per-MapView appearance prop from the resolved theme and keys the view
   on the theme, because MKMapView will not reliably re-rasterise tiles it has
   already drawn. If light tiles ever return, that is the thing to re-test — not
   the prop, which is verified correct.
4. **The verification badge** stays removed from every user-visible surface.
5. **Disk filenames for ten masters are shuffled** relative to the manifest's
   numbering. Read by content; renaming is an operator call. Concerns the
   WORD-NAMED files, which are no longer authority at all.
6. **Master 40's "No real charge" gold pill** and **master 25's gold ledger
   amount** remain unimplemented, both for reasons already on the record.
7. **Hand-drawn standard-shaped controls inside individual screens** never got
   the gold-hairline sweep — only the shared `Button` did. The enabled-hairline
   half is still outstanding and is worth its own pass.
8. **Section (e) of the run report** lists eleven items the emerald pass logged
   and did not fix, each with its reason.
9. **`screens/ChatScreen.tsx`'s clearance double count** — see "Found and NOT
   fixed" above. New, and the most actionable item on this list.
10. **The D2 inversion is missing from the run report's §(d) reversal list.**
    Named in the report's Verification section and in this file, and fenced by
    `tests/emeraldFences.test.mjs` F6 — but §(d) itself is where a future run
    looks, and it is still six items rather than seven.
11. **`tests/verificationBadgeRemoved.test.mjs`'s `LOCKED_SCREENS` is stale.**
    It still excludes both sign-in screens, which emerald(5) converted and
    un-allowlisted elsewhere. Harmless today; the operator's call.
12. **Guard rules that fire on command TEXT rather than command effect**, now
    reproduced by a **fourth** run. Earlier runs hit: `git commit` refused for a
    message containing the bare token `Claude`
    (`GUARD-NESTED-CLAUDE` matches any whitespace-delimited `claude` token
    anywhere in the command, including inside a heredoc body); `node -e` refused
    as `GUARD-DYNEXEC`; `git stash list` refused as a forbidden subcommand
    despite being read-only; and `Write` to the session's own scratchpad refused
    as a path escape. The 2026-08-22 cleanup run reproduced the scratchpad
    refusal and added a fifth shape: **`GUARD-CLAUDEDIR` fires on any command
    whose text contains `.claude/` together with a `>` anywhere**, so the purely
    read-only `ls -la .claude/ 2>&1` is blocked as a config mutation — the `2>&1`
    is the whole trigger. All fail safe. **None has ever been worked around** —
    commit messages go through `-F` files in the allowlisted `.audit-scratch/`,
    probes are written into the project tree, `.claude/` is read with the file
    tools instead of the shell, and refused calls are dropped rather than
    rephrased. Worth fixing at the guard, because every run pays this tax and it
    is now the single most reproducible friction in the contract.
13. **`tests/customerCore.test.mjs:225` and `tests/emeraldFences.test.mjs:1485`
    own `lib/theme.ts`'s dead `emeraldColors` export.** The first asserts the
    export exists; the second uses its NAME as the slice delimiter for the light
    palette block. There are zero production importers, so the export is dead
    code that two fences keep alive. Deleting it is a three-file change (export
    + both fences) and needs a dispatch that authorises touching them — this run
    was forbidden from editing any fence and correctly skipped it.
