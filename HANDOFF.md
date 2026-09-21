# HANDOFF — current operational context

WRITTEN: 2026-09-21 (the run that applied the eighteen-item list — Available Jobs,
the Filters sheet and its popups, the Sort popup, the customer Home, the ground +
hero — from this chat, opus at max; docs/DECISIONS.md 2026-09-20 (sitting 3), (13)).
The two sitting-3 docs rounds and sitting 2's record follow below, unchanged.

Rewritten as the last act of every run. Read it before naming what is blocked or
what just happened.

## What this session landed

**THE EIGHTEEN-ITEM RUN — four code commits over `1cdacc9`**, each revertible alone,
`npm run verify` green before each (1381 pass, 0 fail after the last); then this docs
commit. The specification is `docs/dispatch/NEXT-RUN-2026-09-21.md` (now marked
LANDED); the record is DECISIONS (13).

- `7370b9c` — **feat(jobs)**: one card size (the tile a constant 120 — the reference's
  118 fill inside its rim — every card 146, pitch 158, measured in the harness), the pay
  block's clearance MEASURED + 8, the chip's full label unless it would not fit (decided
  from the chip's own layout at the full label, unseen until decided; `Chip` forwards
  `onLayout`), and **`useScrollClearance()`** beside `useFloatingNavClearance()`: by
  route — the bar's footprint on the two atmosphere homes, `spacing.lg` everywhere else,
  where the bar is in the layout flow and the footprint was a ~104pt double count.
  Twenty-one scrolling surfaces swapped; Chat and the studio panel keep the footprint.
- `c5545c0` — **feat(filters)**: `paneFills.filters` (ui/tokens.ts, beside `paneEdges`)
  drawn by `Surface fill` as the tint itself — no scrim, no sheen — on the Filters sheet
  alone (the map's panes keep recipe D); `emeraldBright` (dark #84DFAA, light the
  emerald) on the chosen pills, ticks, caret and the popup's chosen row; the popover on
  the **menu** material, values centred with the tick pinned left (Sort keeps its left
  layout via `contentAlign`), iOS's own bar flashed once on open, light-grey dividers,
  the date popup 192. Harness: `worker-results-filters-{dark,light}` and the budget
  popup, with the new `landmarks` field (the boxes of named texts beside the PNG).
- `2b20f0d` — **feat(home, sort)**: the sixth sort `'reset'` (latest added first,
  nothing else; grey, last; the pill "Sort by Latest added"); "Earliest jobs first"; the
  sheet's footer centred (22 above the button, only the safe inset below it — a footer
  brings its own air). Home: one rhythm of 24 (headline margin 16, the hero's padding
  gone, `sectionGap` 24, the section margin −9); the field 56 r20 with ONE trailing
  control (`SearchBar.micBecomesSearch`); the tile measured from the row, the gap the
  gutter itself, four whole and none peeking; the copy (no period, three-line sub-copy,
  "You haven't posted any jobs yet"). Harness: the customer-home targets carry landmarks.
- `d9bbb0e` — **feat(home)**: `scripts/home-ground-blend.mjs --apply`, once — the hero
  feathered in its file, the ground pooled to the photo's night; the marker
  `assets/prestige/home-ground-blend.json` refuses a second pass; the roster says
  'baked-feathered'; the atmosphere docblock re-measured.

**THE LOOPS (measured, not eyeballed; the scripts are the gitignored
`.shots/harness-blur/loop-filters.mjs` and `loop-home.mjs` — re-create from the
pattern if the folder is gone: the app's landmark boxes + PNG against the reference's
boxes by Playwright + its 2x shot, sampled beside the same texts):**
- Filters, light: 0/channel everywhere. Dark: the chosen pill within 2, the popup within
  1, the ground and the unchosen pill 3–5 darker than the reference — the harness
  backdrop (the jobs list, not the mockup's brighter blurred map) through the tint's own
  5–9%. The numbers are the reference's exactly and were NOT tuned against that
  harness-only artifact; the phone, whose backdrop is the map, decides.
- Home, both themes: greeting → headline 24 / 24, sub-copy → card 42 / 42, card → Popular
  services 24 / 24, tile labels → Your jobs 39.5 / 40; tiles 73 at 20 / 113 / 207 / 300
  in both, none peeking; the field 56 (fenced). NOT in the list, left alone: "Your jobs"
  → the empty row (app 36.5, reference 11 — the app's row has no subtitle and a 44pt
  header row); the harness has no status inset, so its hero sits 59 higher than the
  phone's — the seam is compared with that offset.

**NOT YET SEEN ON THE PHONE:** all of it. **THE OTA IS LIVE** on the preview channel
(asked: "yes, publish"): update group `b6a3d686-a879-4d5c-9d74-8550e0bb2901`, iOS update
`01a0c177-4906-7e06-a5c2-a0bebe2498be`, commit `4bb4f2d`; dashboard
`https://expo.dev/accounts/mah_r2/projects/BRAZOS/updates/b6a3d686-a879-4d5c-9d74-8550e0bb2901`.
The operator opens the Beta twice and walks the list below.

### Earlier this sitting and the sitting before (unchanged record)

**SITTING 3 — THE FILTERS SHEET'S COLOURS AND ITS POPUPS, RULED AND REFERENCED (docs
only).** The operator sent the live dark Filters sheet beside the mockup ("warmer",
chosen pills "very dim") and asked for: the mockup's gradient copied accurately, a
scroll bar in the popups (iOS's own, subtle), no gradient on the popups, the values
centred — questions first, then HTML mockups, then the list. Answered (asked): dark
only for the colours, centring and the bar in light too; the sweep on the Filters
sheet ONLY; the tick stays at the left edge; the built-in bar; Sort stays left; the
Newest hint loses ", then newest posted". THE CAUSE, read from the code: the pane's
near-white mint sheen (.10 → .04 over #062418 @.88) lifts the green into grey-olive —
the reference measures rgb(5,27,19) at the sheet's top-left, the app's numbers
rgb(30,57,46); and the chosen pills wear `dark.emerald` #5FAE81 where the mockup wears
#84dfaa at the same alphas. LANDED: `docs/mockups/html/map-explore.build.mjs`
(`--filters`): popups at the app's menu numbers (.82, no inner line, no end fade),
rows centred with the tick pinned left (Sort left), the date popup 192, iOS's bar in
the open moments, the Filters blur without `saturate()`, the shorter hint;
`map-explore-filters-{dark,light}.html` regenerated; NEW `filters-fix.build.mjs` →
`filters-fix-dark.html` (NOW beside FIXED, derived from the gallery). Measured in the
pages (Playwright): 15 + 15 + 2 phones, 0 nested; every centred row's content ≥ 10pt
clear of the tick; the bar and no mask on every open popup. DECISIONS (1)–(6);
the run list `docs/dispatch/NEXT-RUN-2026-09-21.md` "PART TWO", items 4–9 with the
reference's sampled colours. NOT BUILT: nothing in the app moved this sitting.

**SITTING 3, SECOND ROUND — the Sort popup again, the customer Home, the ground + hero.**
The operator sent four more screenshots. LANDED (docs + one tracked script, no app code):
the Filters gallery's sixteen moments (the grey Reset row → "Sort by Latest added", "Earliest
jobs first", light-grey dividers, the footer centred over a drawn home indicator);
`docs/mockups/html/home-redesign.html` re-cut to the operator's list (rhythm 24, field 56
r20 with the mic alone, four whole tiles at gap 20, the copy) and made honest — it draws
the app's ground raster and the hero as `<img>`s, no CSS mask; the ground + hero blend
(pick c: the hero feathered in its file, the ground pooled to the photo's night under it)
with its transform `scripts/home-ground-blend.mjs` on the repo's own PNG codec
(`scripts/atmosphere-tune.mjs` `encodePng` gained `bpp: 4`, self-test green). Measured in
the pages: 32 + 2 phones, 0 nested; field 56 r20; tiles 73.25, four whole, none peeking;
every gap 24; the seam ≤ 2 levels. DECISIONS (7)–(12); the run list's PART THREE, items
10–18. `--apply` has NOT been run: the assets are unchanged until the run.

**SITTING 2 — THE TWELVE-ITEM RUN — three code commits over `a4382bf`**, each revertible alone,
then this docs commit (the regenerated mockups, DECISIONS (8), this file, the session
notes). `npm run verify` after the last code commit: **1380 pass, 0 fail, exit 0**
(five new tests in `tests/workerSkills.test.mjs`).

- `5dfb096` — **feat(glass)**: the `pane` material wears recipe **D** — its own ink
  `PANE_SCRIM` #062418 at .88, the mint rim .46, a MINT sheen .10 → .04
  (`MaterialSpec.sheen.color`, drawn by Surface), and `highlightAlpha` **0**: no dark
  pane draws the inner top line any more (the search pill, the Today chip, the jobs
  sheet, the Filters sheet, the popover). The Filters sheet rings its **top edge
  only** (`Sheet edge="top"`; every other sheet keeps `'all'`), hairlines .20.
  Distance / Minimum budget / When **fill their row** (`Section fill`); Categories
  scrolls; Sort's pill never grows. **Best Match reads one skills rule** —
  `lib/workerSkills.ts` (pure, executed by the fence) applied by
  `hooks/useWorkerSkills.ts`: profile categories ∪ listed services' categories
  (`worker_services`, one read per account through a module store), labels tolerated,
  and a state the Categories note names (loading / couldn't load / pick categories).
  The map's sheet, Available Jobs (also its Skill Matches filter) and Worker Home read
  it; `jobMatchesSkills` takes a `ReadonlySet`.
- `062d5a9` — **feat(map)**: the jobs sheet **rests on the nav bar**
  (`MAP_SHEET_BOTTOM` 0; the sides keep `map.sheet.inset`) with **three stops** —
  a pull down from the peek tucks it to MINI (the handle + the top half of the count
  line, measured), a pull or a tap restores the peek, always the peek when the map
  comes into view (`useFocusEffect`). Fast path: a release aims where the finger was
  heading and takes the nearest stop; a flick moves one stop. Fallback: two stops.
  Apple's Legal link rides above the resting pane (`legalLabelInsets`, native only,
  peek height + 8). The search pill is **62** tall (corner 31, ink glyphs 25 / 23,
  the distance pill 34). Light's "Any" pill: cream, no rim, ink. Available Jobs'
  distance chips: whole-number heights (chip 44, row 60) against the clipped outline.
- `1f057dd` — **feat(card)**: `WorkerJobCard` layout **a1** on Home AND Available
  Jobs — location line, ONE facts line ("Sat, Sep 5 · No bids · 2w ago";
  `formatBidCountShort`, `formatTimeAgoShort`), Break the ice, a **square picture as
  tall as the text block** (measured; the harness renders 118 × 118), the pay block
  over the top-right. The peek row's light amount wears `amountGold` #C08F2E.

**Reference mockups** (all regenerated, committed): `docs/mockups/html/map-explore.build.mjs`
(recipe D, no spec line, the light chip cream / no rim, the fill rows, the sheet at
`bottom: 93px`, a `mini` moment in `--card`), `docs/mockups/html/worker-results-card.{build.mjs,html}`
(the card, a1, both themes).

**THEN, ITEM 13 (the same sitting, after the OTA): THE PANES' OWN EDGES** — the
operator's picks from seven honest renders: the search pill and the Today chip wear
the dark emerald rim `#5FAE81` at .70 under a soft glow of three 2pt rings (option C);
the jobs sheet the bright green `#7DE7A4` at .60 under the same rings (option B); the
Filters sheet's top line is a hairline (one physical pixel), no glow. One table —
`ui/tokens.ts` `paneEdges` + `PANE_HALO_RING`; `Surface` gained `rim` / `halo` (dark
glass only; the rings are plain Views outside the box, no shadow); `Sheet` passes
`rim`; the peek sheet's frame grows by `PEEK_HALO_REACH` (6) on the top and sides.
DECISIONS (9). Verify after it: 1380 / 0. Published as a second OTA.

**THE OPERATOR WALKED AVAILABLE JOBS after the first OTA** and ruled the next run —
three findings with one approved reference, `docs/mockups/html/worker-results-screen.html`:
one card size (a constant 118 tile, the text block at least 118), the title and chip
clearing the pay block by its MEASURED width + 8 (the full chip label unless it would
not fit), and the list ending 16pt above the bar (a `useScrollClearance()` for every
scrolling screen — the bar-footprint padding is a double count everywhere but the two
Homes). NOT BUILT YET. The method, file by file, is `docs/dispatch/NEXT-RUN-2026-09-21.md`;
DECISIONS (10).

**NOT YET SEEN ON THE PHONE:** everything but Available Jobs — the map, the sheet, the
Filters sheet, the light pill and gold, the search pill 62, item 13's edges. The OTA was published at the
end of this run (the operator's "yes — publish at the end"); the operator opens the
Beta twice and walks it (below).

**WHAT COULD NOT BE CHECKED OFFLINE:** the map, its sheet and the Filters sheet have no
harness target (external tile hosts fail the escape assertion) — every number was
matched to the mockup's and fenced, and the mockups were re-measured with Playwright
(fill rows end at the row's edge; sheet bottom = nav top; mini shows 48px). The
Available Jobs card WAS rendered by the harness (`node scripts/shots.mjs --build
--only worker-results`): the first card's tile measures 118 × 118 (light) / 116 inside
its rim (dark), at the mockup's padding.

## What a following run must know

- **`useScrollClearance()` is what a scrolling surface pads its end with**; the old
  `useFloatingNavClearance()` is the bar's real footprint and is right for Chat's
  keyboard rise and the studio panel only. `tests/layout` names the one exception.
- **The Filters sheet's tint is `paneFills.filters`**, drawn by `Surface fill` in place
  of the scrim and the sheen where the glass draws; the fallback keeps the material's
  scrim. The map's panes still wear `pane` (recipe D) with no fill. A new pane names
  its fill from the table, never at a call site.
- **The popover wears `menu`** and centres its values; `contentAlign="start"` is the
  Sort popup's left layout. `emeraldBright` is the chosen green on this sheet and its
  popups only; `dark.emerald` is untouched (D0 pins it).
- **A `Sheet` with a footer keeps only the safe inset below it** — the footer's own
  22 above its button is the air. The Filters sheet is the only footer caller.
- **The Home field's one control is `SearchBar.micBecomesSearch`** — the mic while empty,
  the magnifier once text is typed and no dictation is listening; Home only (asked).
- **The tile is measured**: `tileSizeFor(rowWidth, gap)` with `gap = inset` (the
  gutter); `TILE_FLOOR` only until the row lays out. Nothing may re-introduce a
  constant tile.
- **The ground and the hero are transformed files now.** `scripts/home-ground-blend.mjs`
  is the record; the marker refuses `--apply` twice; the originals are
  `git show c59d2aa:<path>`. The roster records the dark hero as 'baked-feathered'.
- **The harness's `landmarks` field** writes the LAST exact match's box per text (a sheet
  over a screen renders later in the DOM than the screen's own chips) after the shutter;
  the loops read them. `tests/shotHarness` counts 86 targets.
- **The references' NOW pages record the app at `c59d2aa`**
  (`docs/mockups/html/filters-fix-dark.html`, `worker-results-screen.html`) — historical
  by their own headers now that the app moved.
- **Stale comments still owed** (unchanged): `scripts/shots.mjs` lines 387-390.

### The earlier notes (unchanged)

- **(DONE 2026-09-21, the run above.) The next run is ONE big run: Available Jobs 1–3 then the Filters 4–9**, both in
  `docs/dispatch/NEXT-RUN-2026-09-21.md`, each with its approved HTML reference. The
  operator's rule from sitting 3: the HTML IS the reference the loop measures against —
  build the harness target, sample beside named texts, compare to the numbers in that
  file, iterate on alphas only. Nothing is judged by eye.
- **(DONE 2026-09-21 — `d9bbb0e`.) `scripts/home-ground-blend.mjs --apply` rewrites two assets and is guarded by a marker** —
  run it exactly once in the run, then re-measure the raster fences (item 17). The reference
  already shows its result; the app does not yet.
- **`filters-fix.build.mjs` depends on the gallery**: run `map-explore.build.mjs --filters`
  first; it slices the gallery's first slot. NOW's CSS in it is the app's numbers at
  `c59d2aa` — update it when the app changes, or it lies.

- **The pane material is recipe D and rim-only.** `highlightAlpha` 0 on `pane`;
  `sheen: { fromAlpha: 0.1, toAlpha: 0.04, color: brand.mint }`; `scrimColor`
  `PANE_SCRIM` (#062418) — GLASS_SCRIM (#071B15) is untouched and every other material
  keeps it. `tests/themeTokens` pins all of it. The phone's blur cannot saturate; the
  richness is the tint.
- **`Sheet` has `edge`** ('all' | 'top'), default 'all'. Only the Filters sheet passes
  'top'. `Surface`'s `border` prop was already there; `edge` just feeds it.
- **The Filters rows**: `Section fill` = the scrolling row + `flexGrow: 1` content +
  a growing cell per child (`Children.map`). A wrapping `pillRow` still exists for any
  row that passes neither `scroll` nor `fill` (none today).
- **Skills come from `useWorkerSkills()` and nowhere else.** The rules are
  `lib/workerSkills.ts`; the hook holds a module store for the services read (the
  `useProfile` pattern). `JobFilterSheet` takes `skillsState`; `categoriesNote()` is
  exported and fenced. If the phone STILL says "Pick job categories…" with categories
  set, the note now distinguishes loading / error / empty — read which.
- **`PeekSheet` props changed**: `stop: PeekStop` + `onStopChange` replaced
  `open` + `onOpenChange`; `insetBottom` (default `inset`); `onPeekHeight`. `PeekStop`
  is exported from `components/PeekSheet`. `usePeekMetrics` returns `miniOffset` and
  `canMini`; the title Text reports its height (`onTitleLayout`). MINI is a pull's
  destination only; a tap never tucks. `tests/motion120` pins the mechanics.
- **The map's sheet bottom is a constant** (`MAP_SHEET_BOTTOM`), not the dial; the
  `sheetMaxHeight` formula subtracts it. `LEGAL_LINK_AIR` 8.
- **`WorkerJobCard`'s `variant` 'compact' and 'full' now draw the same card**; the
  names stay for callers. `PAY_CLEAR` 96 pads the title and the chip row; `META_GLYPH`
  16. The picture's size is `Math.max(THUMB_SIZE, infoHeight)` from `onLayout` on the
  info block — never a constant.
- **Short labels share their rules**: `formatTimeAgoShort` / `formatTimeAgo` are
  `relativeAge(iso, 'short' | 'long')`; `formatBidCountShort` wraps `formatBidCount`.
- **`amountGold`** is a `constantAccents` entry (both palettes, one value); only the
  peek row's light amount wears it. `goldDeep` is untouched.
- **`DistanceChips`** reads its row height at use time (`rowHeight()`, D7); the chips
  carry an explicit `height: 44` over the primitive's `minHeight`. If the outline still
  clips on the Beta, add 1pt of `paddingBottom` to the row and say so.
- **The mockup builder's blur saturation is `lqSat`** (dark 2.1, default 1.9) —
  mockup-only richness; do not look for it in the app.
- **`OPEN_THRESHOLD` in PeekSheet.shared is exported and now unused** by the fast path
  (the release picks the nearest stop); left in place, harmless — remove with the
  next touch of that file.
- **Stale comments still owed** (unchanged): `scripts/shots.mjs` lines 387-390.
- **The panes' edges are per pane now** (`paneEdges.search` / `.sheet` / `.filters`):
  a rim is 1pt or a hairline, never thicker (fenced); a glow is rings, never a shadow.
  A new pane names its edge from the table; the shared pane rim (brand.mint .46) is
  what a pane gets when it names none. A parent that clips a haloed pane must leave
  the rings their room (the peek frame is the model).

### The fences this session touched, and how

| File | What moved |
|-|-|
| `tests/themeTokens.test.mjs` | The pane: #062418 / .88 / .46 / highlight 0 / the mint sheen. |
| `tests/jobFilterRules.test.mjs` | `SHEET_EDGE` 'top', hairline .2, the three `fill` rows, Categories `scroll`, the fill styles. |
| `tests/workerSkills.test.mjs` | NEW: the rules executed (keys, labels, the union, the state), the note copy, the three screens on the one hook. |
| `tests/workerDiscovery.test.mjs` | B2 rewritten to layout a1 (the facts line, the measured square, the short labels); the map's bar/legal/stops; the chip row's heights. |
| `tests/motion120.test.mjs` | The PeekSheet fence: three stops (`canToggle`, `canMini`, the mini clamp, the release's nearest-stop / one-stop-per-flick, `offsetOf` worklet, the fallback's target). |
| `tests/screenDials.test.mjs` | `map.searchPill.radius` drew 31. |
| `tests/voiceSearch.test.mjs` | The ink mic 23. |

## What is blocked

- **Image `Read`s** stay refused by `.claude/hooks/evidence-guard.ps1`; renders were
  measured with pngjs / Playwright, never viewed.
- **The Write tool cannot reach the plan file or the memory directory**
  (`GUARD-PATH-ESCAPE`). Scratch and patch scripts live under `.shots/harness-blur/`.
- **Bash heredocs are unreliable in this harness** (a `\\` collapses to `\`) — every
  patch script with a backslash was written with the Write tool; `.shots/harness-blur/
  patchlib.mjs` is the CR-aware exact-match patch helper; `node -e` is refused.
- **CRLF files**: `docs/DECISIONS.md`, `lib/time.ts`, `lib/hotspots.ts` (and others) —
  the helper normalises per file; Git normalises on commit.
- **The co-author trailer cannot appear in a Bash command's text** — all commits by
  `git commit -F <file>`.

## Waiting on the operator

- **The phone — open the Beta twice, then walk, item by item:** (1) Available Jobs —
  every card the same height with the same square picture; long titles no longer
  losing room to the price; "Packing/Unpacking" whole; the list ending 16pt above the
  bar (and every other screen's list end — no dead space); (4) the dark Filters sheet's
  green — deep, the mockup's, not grey-olive; (5) the chosen pills bright; (6)–(8) the
  popups flat, values centred, the tick at the left edge, the bar shown on open and while
  scrolling; (10) the Sort popup's Reset row (grey, last) and the pill reading "Sort by
  Latest added" after it; "Earliest jobs first"; light-grey dividers; (12) the Show
  button centred in the footer; (13)–(16) Home — the even rhythm, the taller rounder
  field with the mic that becomes a magnifier when typing, four whole tiles, the copy;
  (17) the chair, the lamp and the plant sitting in the room, no rectangle around them.
  Also still unwalked from sitting 2: the map's sheet stops, item 13's edges, the light
  "Any" pill and gold, the search pill 62.
- **The Filters ground on the phone**: if it still reads greyer than the reference, send
  a PNG screenshot; the loop reads it (pngjs) and the two stops' ALPHAS are the only
  dials.
- **Staging**: the Actions tab for this push — verify only (no migration, no function).
- **Revert lines, latest first:** `git revert d9bbb0e` (the assets), `2b20f0d`,
  `c5545c0`, `7370b9c`; the docs commit reverts with them. After any revert:
  `npm run verify`, then an OTA on the operator's word.

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
