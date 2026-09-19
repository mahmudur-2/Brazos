# HANDOFF — current operational context

WRITTEN: 2026-09-19 (chat session, continuing 2026-09-18's — the operator was present
and decided on renders; see docs/DECISIONS.md 2026-09-18 second block and 2026-09-19).

Rewritten as the last act of every run. Read it before naming what is blocked or
what just happened.

## What this session landed

Six commits on `mainexpo` over two sittings, on top of `c797a94`; the first three
(`158d057`, `830a6e3`, `011f745`) are the create sheet itself and its docs, recorded in
the previous HANDOFF (now history in git, summarised below); the last three are this
sitting's:

- `0030dd4` — **fix(create): the sheet's rows match the mockup.** `components/CreateSheet.tsx`,
  `navigation/CustomerRoot.tsx`, `tests/emeraldFences.test.mjs` (home(17)'s hint pin, a
  constant). No hairline above the first action row; chevrons and the "confirms first"
  hint in the cream at 35% / 45% (dark) and `navInactive` / `textMuted` (light); the
  plus drawn as two 2pt bars (`PlusGlyph`) so `CreateSheetItem.icon` is optional and a
  `primary` row draws its own; row hairlines 6%, the switch row's 10%, the switch disc's
  ring `secondaryBorder` / cream 12%.
- `f3ef985` — **feat(harness): the web export blurs — every glass render is honest.**
  `lib/blur.tsx` (a web branch: a colourless `View` with `backdrop-filter: blur(px)`,
  `px = intensity × 0.5`; `canBlur` true on web; the vendor ternary untouched),
  `ui/primitives/Surface.tsx` (`flat = reduceTransparency || !canBlur`),
  `tests/blurBoundary.test.mjs` (the boundary test renamed and extended, every prior
  assertion verbatim; ONE new test — `backdrop-filter` only in the boundary — so the
  suite is **1362**).
- `6634c9d` — docs (this file, `docs/DECISIONS.md` 2026-09-19 entries (1) and (2)).
- `889d50e` — **fix(create): the Post-a-job disc is the "2 List" one** — a 40pt rounded
  square, radius 12, solid `postPillGreen`, the white plus at 14 × 2.5, both themes;
  `components/CreateSheet.tsx` only (the operator's pick after seeing the phone;
  `docs/DECISIONS.md` 2026-09-19 entry (3)).
- the docs commit for that (this file, DECISIONS).

`npm run verify` after every code commit: **1362 pass, 0 fail, exit 0**. The verify
before the last docs commit is in the session report.

**SEEN ON THE PHONE (operator, 2026-09-19):** "it looks good" — the docked glass sheet
after the OTA, dark; the one change asked for was the disc above.

**WHAT THE CREATE SHEET IS NOW** (`830a6e3` + `0030dd4`): `components/CreateSheet.tsx`,
mounted by `CustomerRoot.tsx` where `<ActionSheet>` was (ActionSheet untouched, still
the chat / inbox / profile menus). A docked `Modal` (`slide`), a scrim-only backdrop at
the fenced strengths (`withAlpha(colors.text, 0.35)` light, `scrimInDark(background)`
dark — 0.55, the operator's choice over the mockup's 0.30), then ONE
`<Surface material="clear" corners="top">`: the 36×4 handle; "What do you need?"
(17/22/600); the **Needs you** card (a child inside the Modal — `useMyJobsHub()` +
`attentionItems()` on mount, the first item, hidden while loading / on error / when
empty; tap → `onOpenJob`); three action rows from `items` (**Post a job** primary — the "2 List" disc, a
40pt solid `postPillGreen` rounded square with the white two-bar plus — **Hire again**,
**My jobs**), 12 + 34 + 12 on 6% hairlines (the primary row 12 + 40 + 12), none above
the first; **Switch to Worker** set apart under a 10% hairline, ringed disc, hint
"confirms first", `disabled={switching}`. Labels are the accessibility labels; the E2E
walk's "Create" → "What do you need?" → "My jobs" is untouched and lands in the harness.

**THE MATERIAL** (`ui/tokens.ts`): `MaterialName` = `chrome | sheet | menu | clear`.
`materials.clear`: blur 60, `GLASS_SCRIM` at 0.40, rim `colors.surface` (white) at 0.14,
`highlightAlpha` 0.22, fallback 0.92, radius 28 top-only, plus its `light` block
(`LightGlassSpec`, "L2 Frost"): blur 50, white 0.72, rim white 0.85, highlight 0.95,
fallback 0.96. Only `clear` carries a light block; `tests/themeTokens` pins that the
other three do not. Surface resolves one recipe per theme (`glass = isDark ? spec :
spec.light ?? null`) and draws the 1pt highlight inset by the corner radius.

**THE HARNESS NOW SHOWS GLASS.** Web draws the blur with CSS; every glass material
renders at its REAL mix in the harness. PROVEN over the whole registry — 82 targets
rendered twice from fresh exports at the same HEAD (`.shots/harness-blur/before-*`,
`after-*`, `diff.mjs`, `jitter.mjs`): 75 byte-identical (every Home, every target that
draws no `BlurLayer` and wears no `Surface` — the services sheets and the budget dialog
are their own cards); `customer-create-sheet-{dark,light}` moved in rows 534..851
exactly; four worker targets moved by 8–27 px at 1–4/255 (jitter); and
`worker-results-jobs-light` by one 9×12 location glyph one pixel higher, on a screen
with no Surface and no BlurLayer — not this change's, recorded.

**THE PILL** (`830a6e3`): customer Home's "Switch to Worker" is gone with its five
styles, `switchToWorker()`, the `useMode()` read, the sans-ladder rung and the
`home.modeSwitch.paddingX` dial + registry row; the switch is the sheet's bottom row.
Worker Home untouched. On the four customer-Home renders the only changed pixels were
the pill's footprint (x 70..372, y 11..54).

## What a following run must know

- **A glass surface can be judged from a render now.** `BlurLayer` on web is a CSS
  `backdrop-filter`; only the vendor is short-circuited there. If a render of a
  sheet, menu or dialog looks different from before, that is the blur arriving — the
  services sheets and the budget dialog did NOT move because they wear no Surface and
  draw no BlurLayer (their own cards).
- **`canBlur` now means "the vendor on native, CSS on web".** Surface's fallback
  (`fallbackScrimAlpha`) applies for Reduce Transparency and for a binary without the
  module, nowhere else.
- **The only targets that render a `BlurLayer` are the create sheet's** (the pane's own
  blur). No target opens an ActionSheet, a `ui/primitives/Sheet`, an AmountPrompt or a
  ConfirmDialog, so their MOTION1 backdrop blur (12px on web now) is unrendered by the
  harness; adding such a target is a registry entry.
- **The label weights differ between the mockup and the harness on Windows** (Arial vs
  Segoe UI); on the phone both are SF Pro. Do not chase it.
- **The mode switch has ONE customer-side home: the sheet's bottom row.** home(17)
  (re-pointed) and `tests/mode.test.mjs` pin it, and pin Worker Home's pill staying.
- **`homeModeRing` is orphaned** in both palettes — the cleanup run's, beside
  `navBar.gold` and `navBar.glyphColorDark`.
- **Needs-you fetches on every open** (one batched hub read). If its arrival reads as a
  pop-in on the phone, the alternative the operator declined for now is a shared
  provider so Home and the sheet read one cache.
- **The rim is white, not mint — deliberately**; `tests/themeTokens` pins the exception.
- **Stale comments still owed** (unchanged): `screens/MapScreen.tsx` `MAP_SEARCH_HEIGHT`
  docblock (Home's field is 44, the map's 56 is a step OVER it); `scripts/shots.mjs`
  lines 387-390.

### The fences this session touched, and how

| File | What moved |
|-|-|
| `tests/blurBoundary.test.mjs` | The boundary test RENAMED ("renders the vendor, a colourless CSS blur on web, or nothing — and the vendor never runs on web"); every prior assertion verbatim (the vendor ternary, `load()`'s one call site, `if (!BlurView) return null;`, no `backgroundColor`); pins ADDED for the web branch's exact shape, `canBlur`, `WEB_PX_PER_INTENSITY = 0.5`, and "no tint on the CSS branch". ONE NEW TEST: `backdrop-filter` named only in `lib/blur.tsx` (suite 1361 → 1362). |
| `tests/emeraldFences.test.mjs` | home(17): the hint pin `<Text style={styles.hint}>` → `style={[styles.hint, isDark && styles.hintDark]}` (a constant). |
| From `830a6e3` (previous sitting) | `themeTokens` (material keys + clear's pins), `designStudio` (material enumerations, the panel's banned names, the Surface blur-mount expression reading `glass`), `screenDials` (the dial row), `goldOnForest` (the new file in the scrim roster and the home-indicator pin) — constants; `emeraldFences` home(17)/home(19), `mode.test`, `customerCore` — re-pointed on the operator's decision. |

Read and found not to move this sitting: `tests/designStudio.test.mjs` (its Surface
pins read `glass`, unchanged), `tests/layout.test.mjs` and `tests/emeraldFences` (the
"blur layer paints no ground" pins — still true), `tests/blurBoundary`'s other three
tests, `tests/mode.test.mjs`, `tests/goldOnForest.test.mjs`, `tests/shotHarness.test.mjs`.

## What is blocked

- **Image `Read`s** stay refused by `.claude/hooks/evidence-guard.ps1`; this session
  looked at renders through the desktop browser pane on `file://` URLs (open to a chat
  session, closed to a run). Every claim above is also scripted
  (`.shots/harness-blur/*.mjs` over `tests/pngGeometry.mjs`).
- **The Write tool cannot reach the plan file or the memory directory**
  (`GUARD-PATH-ESCAPE`). Scratch files live under `.shots/harness-blur/`.
- **Long Bash heredocs are unreliable in this harness** (a `\\` collapses to `\`;
  bodies with unbalanced quotes fail to parse). Patch scripts were written with the
  Write tool under `.shots/` and run with `node <file>`; `node -e` is refused.
- **The co-author trailer cannot appear in a Bash command's text** — all commits by
  `git commit -F <file>`.

## Waiting on the operator

- **The phone.** `npm run update:preview`, then two launches. Device facts the harness
  still cannot show: expo-blur's own dark tint under the 40% pane (it may read heavier
  than the CSS blur — the `clear` material's dials are live in the design studio's
  Blur & Material category; bake what lands); the Needs-you card (needs a job waiting
  on the customer); the confirm from the sheet's Switch row; the slide.
- **The renders**: `.shots/harness-blur/after-customer-create-sheet-{dark,light}.png`
  beside `docs/mockups/html/create-sheet-decide.html`'s G1S and L2 frames.
- **Revert lines:** `git revert 889d50e` (the solid disc), `git revert f3ef985` (the
  harness blur), `git revert 0030dd4` (the row fixes), `git revert 830a6e3` (the sheet
  and the pill, together).
- The push: `npm run verify` exited 0 in this session, so the one permitted push —
  flag-free `git push origin mainexpo` — was run after the docs commit (result in the
  session report). Staging's pipeline has no work here: no migration, no edge function.

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
