# HANDOFF — current operational context

WRITTEN: 2026-09-17 (run home-slider-and-subcopy).

Rewritten as the last act of every run. Read it before naming what is blocked or
what just happened.

## What this run landed

Two changes, one commit each so the operator can revert either alone, plus
this docs commit.

- `e205714` — **feat(home): the hero sub-copy breaks after "Hire help."** One
  file: `screens/HomeScreen.tsx`. "Describe it. Hire help." then an explicit
  `{'\n'}`, then "Get it handled." — the way the headline above it breaks.
  Nothing else about the line moved.
- `753d71b` — **feat(home): one sliding tile row of every service, shared by
  both Homes.** Nine files: NEW `components/ServiceTileRow.tsx`;
  `lib/skillCategories.ts`, `screens/HomeScreen.tsx`,
  `screens/WorkerHomeScreen.tsx`, `ui/designStudioSchema.ts` and four fences
  (`tests/workerHome.test.mjs`, `tests/emeraldFences.test.mjs`,
  `tests/shotHarness.test.mjs`, `tests/launchCategories.test.mjs`).
- `docs: the two-line sub-copy and the service tile row - decision, handoff`
  (this commit) — `docs/DECISIONS.md` (one dated entry, two items),
  `docs/BACKLOG.md` (the previous run's nav cleanup note, one line), this file.

`npm run verify` green before every commit: **1361 pass, 0 fail, exit 0**. The
suite count did not move — no test was added or deleted, only re-pointed.

**THE ROW, by number.** `components/ServiceTileRow.tsx` renders
`lib/skillCategories.ts`'s `HOME_SERVICE_TILES` — `[...HOME_QUICK_SERVICES,
...MORE_SERVICES]` mapped onto the short `TILE_LABELS` — then its own "Other"
tile last: 25 tiles. Tile 68x68 (`TILE_SIZE`) at `emeraldRadius.md` (14), gap
`spacing.lg` (16), glyph 28 in `colors.emerald` on `colors.mint`, label 13/16
in `colors.textMuted`, two lines allowed; `snapToInterval` = 68 + 16, start
aligned, `decelerationRate="fast"`. Full bleed inside each screen's padded
column by `marginHorizontal: -inset` and `paddingHorizontal: inset` on the
content, where `inset` is the number the screen already pads its column
with — customer `design.screenPadding` (20), worker `contentPaddingX` (16).
Props: `inset`, `onSelect(key)`, `onOther()`, optional `heading`. The
accessibility hint is worded from `useModePerspective()` ("… help" /
"… jobs"), the wording each screen's chips had.

**MEASURED ON THE AFTER RENDERS (both themes, `tests/pngGeometry.mjs`):**
customer Home tiles at x 20/104/188/272, each 68, the fifth at 356..392 = 37
of 68 on screen; worker Home tiles at x 16/100/184/268, the fifth at 352..392
= 41 of 68. "Popular services" ink at rows 360..379 on customer Home; zero ink
between the worker field (ends 265) and its tiles (start 282). "Post a job"
moved from rows 576..622 (before) to 595..641 (after A, +19) to 644..687
(after B, +47) — the bar's hairline is at 776, so the pill keeps 88px in the
harness and about 24pt on a notched device. The worker "Search" disc still
sits at the field's right end (x 328..359, row 234).

**SNAPPING ON WEB (B10): no fallback was needed.** react-native-web's
ScrollView forwards only the props it knows, so `snapToInterval`,
`snapToAlignment` and `decelerationRate` are dropped silently and the scroll
renders horizontally; no `Platform.OS` branch exists in the component.

## What a following run must know

- **`ServiceTileRow` takes THREE props plus the heading, not "the tap handler
  and an optional heading" alone.** `onOther` exists because the "Other"
  sheet stays the SCREEN's — the two Homes word its subtitle differently
  ("Pick what you need help with" / "Pick the kind of work you're after"),
  and a component-owned sheet would have needed that as a prop instead.
  `inset` exists because a full-bleed row inside a padded column has to know
  the padding, and the two columns differ (20 / 16). Both are the screen's own
  numbers and neither is new data.
- **The mint box carries no ring.** The mockup's `.tile-box` has none and the
  dispatch named none, so in dark the box is `mint` #0E1F18 on the #02110D
  ground — faint, as `components/ServicePickerSheet.tsx`'s `rowIcon` docblock
  already records for the same pair (it added a `mint2` ring for that reason).
  If the operator wants the tiles to read harder in dark, that ring is the
  precedent; it is a colour-only change and not this run's.
- **The heading rung is a literal, cross-checked.** `HEADING_FONT_SIZE = 20`
  in the component; `tests/workerHome.test.mjs` re-derives the customer
  Home's `sectionTitle` rung from `MASTER_TO_DEVICE`, `GEORGIA_CAP_RATIO` and
  the 30px cap and compares. Move the ladder and this fence moves with it.
- **`scripts/shots.mjs` carries a stale comment** (lines 387-390: "Dog walking
  is not one of the four pills HOME_SERVICE_ROWS draws") — the constant it
  names is deleted. The recipe itself is unchanged and still works: it presses
  "Other services" (the tile's label) and the sheet row. The file was outside
  this run's scope; a one-line comment fix is owed.
- **The registry's screen rows are parsed as TEXT**, in a fixed field order,
  by `tests/screenDials.test.mjs`. A comment between two fields of a row
  breaks the parser. Notes go ABOVE the row's opening brace. No Customer Home
  dial reached the chips, so B8 deleted nothing; the two registry comments and
  the one `workerHome.content.gap` description that said "chips" now say
  "service tiles".
- **The previous run's nav cleanup is now on the backlog** (`docs/BACKLOG.md`
  v1 bugs, last line): `navBar.gold` and `navBar.glyphColorDark` orphaned,
  `create.border` and `create.glowColor` launching at values the app no
  longer draws.

### The fences this run touched, and how

Two authorised re-pointings, two constant moves. No fence's logic was
weakened and none was deleted.

| File | What moved |
|-|-|
| `tests/workerHome.test.mjs` | "the category pills mirror customer Home and land on WorkerResults seeded" → "the service row mirrors customer Home and lands on WorkerResults seeded" (AUTHORISED, B7). Before: `HOME_SERVICE_ROWS.map` on both screens, the two-slice definition, `variant="service"`, the sheet, six style entries byte-identical. After: both screens import and render `<ServiceTileRow` with `onSelect={searchCategory}` and `onOther={() => setMoreOpen(true)}`, neither keeps `HOME_SERVICE_ROWS`, a `<Chip` or the six styles; customer passes `heading="Popular services"` and `inset={design.screenPadding}`, worker passes no heading and `inset={contentPaddingX}`; both keep `<ServicePickerSheet` + `services={MORE_SERVICES}` with an onSelect that calls `searchCategory`; `lib/skillCategories.ts` is EXECUTED and `HOME_SERVICE_TILES` must equal the two lists in order with the 24 short labels; the component draws Other after the map with `ellipsis-horizontal` and "Other services"; the heading rung is re-derived from the screen's ladder. The three dispatch assertions (WorkerResults mode 'all' + category; the allow-list; the Set) are verbatim. |
| `tests/emeraldFences.test.mjs` | home(24) "master 44's five service chips fit on master 44's two rows" → "four service tiles fit on the screen and the fifth is cut" (AUTHORISED, B7). The two-row sum (chip paddings, row gap, three measured widths) is replaced by `padding + 4·tile + 3·gap ≤ 393` and `0 < 393 − (padding + 4·(tile+gap)) < tile`, within 15% of half — tile from the component's `TILE_SIZE`, gap from `THEME_SPACING_DEFAULTS.lg`, padding from the studio's `screenPadding`. Kept verbatim: `searchField: { marginTop: 8,`, `heroCard: { marginTop: 3,`, no `gap: design.sectionGap +`, no `*ChipDark` styles. Dropped with the layout: `serviceRows: { gap: 10 }`, `serviceChip`/`goldOutlineChip` pins (now asserted ABSENT). |
| `tests/shotHarness.test.mjs` | Constant: `accessibilityLabel="Other services"` is read from `components/ServiceTileRow.tsx`, the file that carries it; the screen is asserted to render `<ServiceTileRow`. |
| `tests/launchCategories.test.mjs` | Constant: `components/ServiceTileRow.tsx` joins the files that never see the allowlist. |

Read and found not to move: `tests/customerCore.test.mjs`,
`tests/workerDiscovery.test.mjs`, `tests/screenDials.test.mjs`,
`tests/layout.test.mjs`, `tests/homeDesignStudio.test.mjs`,
`tests/designStudio.test.mjs`. No test quoted the one-line sub-copy (A3).

### E2E (B9), read from both flows

Strings either Home renders that a flow taps, waits for or asserts: "Post a
job" (sign-in.yml `HOME_MARK`, money-walk.yml tap — the promo pill's
`accessibilityLabel`); "Create" (the bar's [ + ], Acts 3 and 5); "Search for
jobs or areas" (worker `HOME_MARK` and the field tap); "Search" (the disc's
label); "My Jobs" (the worker bar tab, Act 4). No chip label is tapped by any
flow. All five are untouched by this run; the pill's position is measured
above. The flows were not edited.

## What is blocked

- **Image reads.** `.claude/hooks/evidence-guard.ps1` refuses them for a run
  launched without operator authorization, and this run was. Every claim about
  a render here was produced by scripted pixel analysis over
  `tests/pngGeometry.mjs` (`.shots/slider-subcopy/{rowdiff,shift,probe,ink}.mjs`);
  no one has LOOKED at these PNGs. The visual review is the operator's.
- **A run cannot start an agent.** Unchanged.
- **The co-author trailer cannot appear in a Bash command's text.** All three
  commits were made with `git commit -F <file>`, the message written by the
  Write tool under the gitignored `.shots/`.
- **`git config` is refused** (GUARD-GIT git-config-write), even to read
  `core.autocrlf`; the "LF will be replaced by CRLF" warnings on add are
  git's normalisation notice and changed no content.

## Waiting on the operator

- **Everything this run landed is "landed, unverified" on a device.** No
  device ran it; the proof here is the offline suite and the web-export
  renders. The two-line sub-copy and the tile row reach a phone through
  `npm run update:preview` and two app launches. The snap-per-tile behaviour
  and the Other tile's sheet on a real horizontal scroll are device facts the
  harness cannot show.
- **The visual review.** Twenty-four PNGs are in `.shots/slider-subcopy/`
  (`before-` × 10 Home targets, `afterA-` × 4 customer Home targets,
  `afterB-` × 10 Home targets).
- **The two revert lines:** `git revert e205714` puts the sub-copy back on one
  line; `git revert 753d71b` brings the chip rows back on both Homes.
- Nothing on the push: `npm run verify` exited 0 in this run, so the autonomy
  contract's one permitted push — flag-free `git push origin mainexpo` — was
  run after this commit (see the run report for the result). Staging's
  pipeline has no work here: this run touches no migration and no edge
  function.

## Open gates

See `docs/GATES.md`. Gates 0, 1 and 2 are closed. Gate 3 is the live one. This
run ticks no box: it is design and structure work on surfaces Gate 2 already
recorded as rendered and reviewed, and it puts both Homes one render set ahead
of the 2026-09-06 review that box cites.

## Dispatch log

DISPATCH START 2026-09-17 22:17 - prompt home-plus-and-your-jobs, model claude-opus-5, effort max, mode bypass, log C:\Users\mdmah\BRAZOS\.audit-scratch\dispatch\home-plus-and-your-jobs-2026-09-17_2217.log
DISPATCH END 2026-09-17 22:49 - exit 0 - log C:\Users\mdmah\BRAZOS\.audit-scratch\dispatch\home-plus-and-your-jobs-2026-09-17_2217.log
DISPATCH START 2026-09-17 23:14 - prompt home-slider-and-subcopy, model claude-opus-5, effort max, mode bypass, log C:\Users\mdmah\BRAZOS\.audit-scratch\dispatch\home-slider-and-subcopy-2026-09-17_2314.log
