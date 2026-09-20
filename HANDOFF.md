# HANDOFF — current operational context

WRITTEN: 2026-09-20 (the same chat session as 2026-09-19's Map + Filters build — the
operator walked it on the phone, sent screenshots, and ruled each fix; see
docs/DECISIONS.md 2026-09-20, the last block, and 2026-09-19 before it).

Rewritten as the last act of every run. Read it before naming what is blocked or
what just happened.

## What this session landed

**2026-09-20 — THE PHONE WALK'S FIXES: `7792aaf`**, one commit over `e127ebe`, plus the
docs commit that carries this file. The operator walked `f2d7f1c` on the Beta:
- The Custom popups showed the distance list under every pill and the whole screen
  shifted green while one was up — four nested Modals. Fixed at the cause: the Sheet
  primitive has an `overlay` slot (full-window, box-none, inside its own Modal) and
  the Filters sheet renders ONE `PickerPopover` into it, fed by whichever pill opened
  it; the popover has no Modal, wears the sheet's own `pane` glass, opens on the
  current value. Sheet also gained `topRadius` / `hairline` / `footer` (Filters: 28,
  sage in dark, pinned Reset + Show) and its ScrollView shrinks for the footer.
- Filters: the When row scrolls sideways; "Show N jobs" is the Post-a-job-green
  capsule; the Categories note says how to unlock Best Match when no skills are seen.
- The peek row (`PeekRow` in WorkerJobCard, mockup `docs/mockups/html/peek-card-*`):
  neighbourhood only (`neighbourhoodLabel`), day word Today / Tmrw / "Sep 2", beside
  the chip when it fits (measured) else after the location, the pay column over the
  top two lines with the 26pt amount centred, the location line full width.
- The jobs sheet takes the height its rows need, capped under the SEARCH PILL
  (`maxHeight`, the pill measured as a whole); the toggle hides when nothing lies
  beyond the peek.
- SearchBar `emphasis="ink"` (the map's bright field); the `pane` material's sheen.
`npm run verify` after it: **1375 pass, 0 fail, exit 0**.

**NOT YET SEEN ON THE PHONE:** `7792aaf` itself — the operator's next walk (below).

**STILL OPEN FROM THE WALK:** the Best Match chip did not appear although the operator
says the profile lists job categories. The new note under Categories is the
diagnostic: if it shows "Pick job categories…" with categories set, `useProfile`'s
`categories` read (or its filter to the ten `JOB_CATEGORIES` keys — custom-typed
categories do not count) is the bug. The pins were not flagged; the dark map's other
findings arrived as the four fixed above.

---

The 2026-09-19 build, three code commits over `889d50e` and its docs commit. Each is
revertible alone:

- `da82f33` — **feat(filters): the worker filter's rules** — the brain, no screen
  change. `lib/jobFilters.ts`: `JobSort` = smart | newest | pay | distance | bids
  (`JOB_SORTS`, Smart Match default), `JobSortContext` (skills, completedByCategory,
  offerCounts), `scheduledUntil` (the window), `dateWindowPreset`, `customDateKeys`,
  `BUDGET_CUSTOM_VALUES_CENTS` (126), `BUDGET_FILTER_PRESETS_CENTS`,
  `completedByCategory`; `lib/discoveryFilter.ts`: `DISTANCE_CUSTOM_VALUES` (34),
  `DISTANCE_FILTER_MAX` 3000; `lib/jobs.ts`: `JOB_CATEGORY_CHIP_LABELS` / `_ORDER`;
  `supabase/migrations/20260930000500_radius_cap_3000.sql` (the clamp 50 → 3000,
  additive, ACL restated); `tests/jobFilterRules.test.mjs` (new, executes every rule).
  Pushed at the time; verify 1373.
- `f462224` — **feat(map): the approved Map screen.** `ui/tokens.ts` (pin tokens
  `pinTop` / `pinBottom` / `pinGlyph` per palette; the fifth material `pane`),
  `lib/theme.ts`, `ui/designStudioSchema.ts` (the material's dials; the map's four new
  dials replacing the four capsule dials), `components/HotspotMap.native.tsx` (the
  teardrop pin, drawn from Views; selection in the Marker key), `lib/hotspots.ts`
  (`selectedPinKey`, `hideLocateButton`), `components/PeekSheet{,.shared,.motion120}.tsx`
  (new — the draggable jobs pane), `components/WorkerJobCard.tsx` (`variant="peek"`),
  `lib/jobFilters.ts` (`scheduledDayLabel`), `screens/MapScreen.tsx` (rewritten chrome),
  eleven fences. Verify 1375.
- `f2d7f1c` — **feat(filters): the approved Filters sheet.** `components/JobFilterSheet.tsx`
  (rebuilt), `components/PickerPopover.tsx` (new), `ui/primitives/Sheet.tsx` (optional
  `material` prop, default unchanged), `screens/MapScreen.tsx` (the shared sheet
  replaces the slider sheet; the sort context wired), `screens/WorkerResultsScreen.tsx`
  (the sheet's new props; the sort context; `base` kept apart for the count),
  `lib/jobFilters.ts` (`BUDGET_FILTER_STEP_CENTS` gone), `components/FilterSlider*`
  DELETED (three files), six fences. Verify 1374.

`npm run verify` after every code commit: **exit 0, 0 fail** (1373 / 1375 / 1374 — the
count moved as the slider's three fences left and the sheet's and the sheet-fence's
tests arrived).

**NOT SEEN ON THE PHONE.** Nothing in this session was rendered: the shots harness
has no Map target (external tile hosts fail its escape assertion — docs/GATES.md Gate 2
box 2 lists why), and the Filters sheet and the popover are unrendered by it too. The
operator's review is the next step (below).

**WHAT THE MAP IS NOW** (`f462224` + `f2d7f1c`): the map is the ground; the chrome is
three `pane` Surfaces — the search pill (56pt / 28, the SearchBar with its ground
handed over; placeholder "Explore nearby jobs"; the distance pill in `trailing`, always
"N mi" or "Any", opening the Filters sheet), the Today chip (42 / 21; chosen: the gold
line in dark, forest fill in light), and the jobs sheet (`PeekSheet`, corner 30, inset
16, side padding 24 — all four dialled). The sheet peeks with the grab, "N open jobs",
"Near you • Within N miles | Any distance | Location off", "View ›", and one peek row;
pulled up (or tapped) it lists the same rows and ends in "Open the full list ›" →
WorkerResults `mode: 'all'`. Its list is `jobs_within_radius` when a radius is applied
with a position, the open feed otherwise, then `applyJobFilters(source, filters,
{ skills, completedByCategory, offerCounts })`. The customer map keeps its glow cells,
the CellJobs card and the locate button, and gets a `pane` count capsule. The pin
sheet (a tapped cluster's cards) is untouched.

**WHAT THE FILTERS SHEET IS NOW** (`f2d7f1c`): `ui/primitives/Sheet` wearing `pane`,
five rows of 34pt pills — Distance (when the caller passes `distance`), Minimum budget,
When, Categories (Best Match + eleven, one scrolling row), Sort ("Sort by <rule>") — a
Reset and "Show N jobs" / "Show jobs" pinned as the sheet's footer. Custom pills open
ONE `PickerPopover` in the Sheet's `overlay` (no Modal — 2026-09-20; `measureInWindow`-
anchored, `pane` glass under the menu rim, six rows, tick on the current value; When
and Sort open upward). Every close applies the draft.

**THE MOTION** (`PeekSheet`): the pane is laid out at its OPEN height inside a
same-size clip and slides by `translateY`; closed = open height − measured peek. Fast
path: a Pan on the head block, worklet update clamped `[-OVERDRAG, closed]`, release
springs on the UI thread then `runOnJS(settle)`; fallback: `Animated.spring` on
`USE_NATIVE_DRIVER`, the head a button. Neither animates a layout; `tests/motion120`
pins it. On the Beta binary (`d2ccc7f`, which carries reanimated + gesture-handler)
the fast path is what runs.

## What a following run must know

- **Five materials now**: `chrome | sheet | menu | clear | pane`. `pane` = ink 0.90,
  blur 30, mint rim 0.40, highlight 0.30, fallback 0.94, radius 28 top-only, no light
  block, and (2026-09-20) a `sheen` — white 0.09 → 0.04 diagonal, dark only, the one
  material with one. `tests/themeTokens` pins it; `tests/designStudio` enumerates it;
  its dials are live in Blur & Material.
- **The pin tokens are three per palette** (`pinTop`, `pinBottom`, `pinGlyph`), by
  reference in `lib/theme.ts`. Gold on a pin means SELECTED.
- **The map's distance state is `radiusMiles`**; the `themeRadius` alias is gone.
- **`WorkerJobCard` has three variants**: compact, full, peek. Peek reads
  `JOB_CATEGORY_CHIP_LABELS` and `scheduledDayLabel`.
- **`useMyJobsHub()` is now mounted by the map's sheet child and by WorkerResults**
  (for `completedByCategory`). It is the same batched hub read My Jobs and the create
  sheet's Needs-you make; if it reads as cost on the phone, a shared provider is the
  alternative the create-sheet HANDOFF already named.
- **A changed radius has no count**: the sheet's button says "Show jobs" until the
  radius is applied and a read has answered. Deliberate, not a bug.
- **The migration is unproven locally.** Docker was off; `supabase db reset` /
  `db test` did not run this sitting. The staging pipeline (verify → migrate → deploy)
  applied it on the `da82f33` push — confirm in the Actions tab if a Custom radius past
  50 answers as 50.
- **FilterSlider is gone and fenced gone** (`tests/motion120`, "the filter slider is
  retired"). Do not rebuild a slider; the Custom lists were the ruling.
- **JobFilterSheet is the D6 exception** (emerald selection, both themes) — it left
  `tests/goldOnForest`'s D6 roster with a note; DECISIONS 2026-09-19 (3) is the record.
- **The Sheet primitive's `material` prop defaults to `sheet`**; only the Filters
  sheet passes `pane`. No other dialog moved.
- **Stale comments still owed** (unchanged): `scripts/shots.mjs` lines 387-390. (The
  `MAP_SEARCH_HEIGHT` note is gone with the rewrite.)
- **A popup over a sheet renders into the Sheet's `overlay`** — never a second Modal.
  `tests/jobFilterRules` pins `PickerPopover` Modal-free.
- **The peek row measures whether the day fits beside the chip** (`dayFits`), renders
  the day unseen until it has, and clips its body. Do not replace the measure with a
  character estimate; the fonts differ from the mockup's.
- **`scheduledDayLabel` is short now** (Tmrw, "Sep 2"); the Filters date popup keeps its
  own long form (`longDate` in JobFilterSheet).

### The fences this session touched, and how

| File | What moved |
|-|-|
| `tests/jobFilterRules.test.mjs` | NEW in `da82f33` (eleven executed rules); `f462224` adds the day word; `f2d7f1c` adds the sheet/popover static fence. |
| `tests/workerDiscovery.test.mjs` | Ceiling 50 → 3000 (`da82f33`); the pins fence (Views only in a Marker, the two new props), the structure fence rewritten to the sheet, the B3 fences to the shared sheet, the dead-location note's new home. |
| `tests/discovery.test.mjs` | The chip row: Today alone, Nearby's absence a decision; `applyJobFilters(base, filters, sortContext)`. |
| `tests/emeraldFences.test.mjs` | map(1) rewritten: the ground through the `pane` material, the retired slabs, the placeholder. |
| `tests/mode.test.mjs` | The gated controls: the distance pill in `trailing`, the chip row, the sheet child. |
| `tests/goldOnForest.test.mjs` | The pin fence rewritten (pin tokens, emerald stroke, gold = selected); JobFilterSheet off the D6 roster. |
| `tests/screenDials.test.mjs` | The Map table: the four new dials. |
| `tests/themeTokens.test.mjs`, `tests/designStudio.test.mjs` | The fifth material. |
| `tests/motion120.test.mjs` | PeekSheet in SIBLINGS and the worklet roster; a new transform fence; the slider block replaced by its retirement fence. |
| `tests/crossTabNavigation.test.mjs` | Unchanged and green: two dispatches, both gated. |

## What is blocked

- **Image `Read`s** stay refused by `.claude/hooks/evidence-guard.ps1`; no render was
  made this sitting (no Map target in the harness).
- **The Write tool cannot reach the plan file or the memory directory**
  (`GUARD-PATH-ESCAPE`). Scratch and patch scripts live under `.shots/harness-blur/`.
- **Bash heredocs are unreliable in this harness** (a `\\` collapses to `\`; bodies
  with quotes fail to parse) — every patch script and message file was written with the
  Write tool; `node -e` is refused; `git config` reads are refused (GUARD-GIT).
- **`lib/hotspots.ts` is CRLF in the working copy** while most files are LF; the patch
  helper normalises per file. Git normalises on commit.
- **The co-author trailer cannot appear in a Bash command's text** — all commits by
  `git commit -F <file>`.

## Waiting on the operator

- **The phone, again.** `npm run update:preview`, then: the four Custom popups (each
  its own list, no colour shift while open, opened on the ticked value; When and Sort
  upward); the Filters head hairline and corners, the pinned Reset / Show capsule, the
  When row scrolling; the peek rows (neighbourhood only, "Tmrw" / "Sep 2", nothing over
  the pay, the amount centred); the sheet's height with the real job count (stops at
  its rows, caps under the search pill); the bright search field; the pane's sheen in
  dark. And whether the Categories note says "Pick job categories…" — see STILL OPEN.
- **Staging**: the Actions tab for the `da82f33` push (the migration) and this push
  (no migration, no function — verify only).
- **Revert lines:** `git revert 7792aaf` (the walk's fixes), then `git revert f2d7f1c`
  (the Filters sheet; the slider returns), `git revert f462224` (the Map screen),
  `git revert da82f33` (the brain — the other two depend on it).
- The push: `npm run verify` exited 0 in this session after `7792aaf`, so the one
  permitted push — flag-free `git push origin mainexpo` — runs after the docs commit
  (result in the session report). No migration, no function: verify only.

## Open gates

See `docs/GATES.md`. Gates 0, 1 and 2 are closed. Gate 3 is the live one. This session
ticks no box.

## Dispatch log

DISPATCH START 2026-09-17 22:17 - prompt home-plus-and-your-jobs, model claude-opus-5, effort max, mode bypass, log C:\Users\mdmah\BRAZOS\.audit-scratch\dispatch\home-plus-and-your-jobs-2026-09-17_2217.log
DISPATCH END 2026-09-17 22:49 - exit 0 - log C:\Users\mdmah\BRAZOS\.audit-scratch\dispatch\home-plus-and-your-jobs-2026-09-17_2217.log
DISPATCH START 2026-09-17 23:14 - prompt home-slider-and-subcopy, model claude-opus-5, effort max, mode bypass, log C:\Users\mdmah\BRAZOS\.audit-scratch\dispatch\home-slider-and-subcopy-2026-09-17_2314.log
DISPATCH END 2026-09-17 23:46 - exit 0 - log C:\Users\mdmah\BRAZOS\.audit-scratch\dispatch\home-slider-and-subcopy-2026-09-17_2314.log
DISPATCH START 2026-09-17 23:57 - prompt home-task-card, model claude-opus-5, effort max, mode bypass, log C:\Users\mdmah\BRAZOS\.audit-scratch\dispatch\home-task-card-2026-09-17_2357.log
DISPATCH END 2026-09-18 00:34 - exit 0 - log C:\Users\mdmah\BRAZOS\.audit-scratch\dispatch\home-task-card-2026-09-17_2357.log
