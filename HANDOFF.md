# HANDOFF — current operational context

WRITTEN: 2026-09-18 (run home-task-card, dispatched 2026-09-17 23:57).

Rewritten as the last act of every run. Read it before naming what is blocked or
what just happened.

## What this run landed

One change to the customer Home, in one commit so the operator can revert it
with a single command, plus this docs commit.

- `6e453fb` — **feat(home): the task card replaces the search bar and the
  promo card.** Thirteen files: `screens/HomeScreen.tsx`,
  `ui/primitives/SearchBar.tsx`, `ui/primitives/LitSurface.tsx`,
  `ui/tokens.ts`, `lib/theme.ts`, `lib/homeDesignStudio.tsx`,
  `ui/designStudioSchema.ts`, and six fences (`tests/emeraldFences.test.mjs`,
  `tests/homeDesignStudio.test.mjs`, `tests/voiceSearch.test.mjs`,
  `tests/litSurface.test.mjs`, `tests/themeTokens.test.mjs`,
  `tests/themeResolution.test.mjs`).
- `docs: the task card - decision, handoff` (this commit) — `docs/DECISIONS.md`
  (one dated 2026-09-18 entry), this file.

`npm run verify` green before the code commit: **1361 pass, 0 fail, exit 0**.
The suite count did not move — no test was added or deleted, only re-pointed.
The verify before this docs commit is in the run report.

**THE CARD, top to bottom.** Directly under the hero at the screen's content
padding (20), one `Animated.View` (`styles.taskCard`: padding 17, gap 14, a
1pt `taskCardEdge` border, `taskCardLitBottom` as the flat fill,
`shadows.card`; radius 22 through the `home.promoCard.radius` dial, whose key
keeps its name) holding: the title "What do you need done?" (20/24, 700,
`colors.ink`); the SAME `SearchBar` instance Home always had, with placeholder
"Describe your task...", at `searchHeight` 44 / `searchRadius` 17
(`lib/homeDesignStudio.tsx`, was 65 / 35), the real mic rendered by
`SearchBar` when the device can, and the trailing slot's gold glyph now the
Ionicons "search" magnifier (same 23 size, same `colors.gold`, same
`onPress={submitSearch}`, same label "Search") — the field passes the new
`disableLeadingIcon` so it draws one magnifier, at the trailing end; and the
LIVE "Post a job" pill, moved and not redesigned (`styles.heroButton`, the
same `litFill` recipe, "Post a job ›", `startJobDraft`, `ctaHeight` 48,
`ctaRadius` 24). Dark is lit between two explicit stops through the new
`litBetween` helper (below); light is the flat card — surface, a line
hairline, the card shadow.

**THE THREE TOKENS** (`ui/tokens.ts`, reached by `lib/theme.ts` by reference
on both sides): `taskCardLitTop` #15362B, `taskCardLitBottom` #0B2019,
`taskCardEdge` #27473A in dark; in light they are the flat card's own
colours — #FFFFFF (surface), #FFFFFF (surface), #DDE2DD (line) — because the
two palettes carry identical key sets by compile-time contract, and the screen
reads all three in both themes. There is no `*Dark` style for the card; the
theme gates only whether the gradient is drawn (`flat: !isDark`).

**THE HELPER.** `ui/primitives/LitSurface.tsx` now exports
`litBetween({ top, bottom, flat })` and `litBetweenGradient`: a straight
180deg gradient between two given palette stops, both through `withAlpha` at
full opacity, returned as a style through the ONE platform branch `litFill`
also uses — `backgroundImageStyle(image)`, `backgroundImage` on web and
`experimental_backgroundImage` on native. Not on the barrel; Home imports it
from the file, as `screens/MapScreen.tsx` imports `SearchBar`.

**THE PROP.** `SearchBar` gains `disableLeadingIcon?: boolean` (default
false); it omits the leading "search" glyph on both render paths. No caller
but Home passes it.

**MEASURED ON THE AFTER RENDERS (both themes, `tests/pngGeometry.mjs`,
`.shots/task-card/probe.mjs`):** the card's edge at x 20..372, rows 260..439 —
180 tall, exactly the term-by-term sum 2 + 34 + 24 + 14 + 44 + 14 + 48 —
starting 32 rows under the sub-copy's last ink row (227); the title's ink at
rows 283..297; the field's ring at rows 316..359 (44) and the pill's green
band at rows 374..421 (48), each at x 38..354, i.e. full width inside the
card; "Popular services" ink at rows 467..481 and the tile boxes at rows
499..566, directly under the card; the bar's hairline still at 776, so the
pill's bottom edge keeps 355 rows above it (it was at rows 642..689 before).
Dark: #15362B at rows 261..269 falling monotonically (#123026 near 308,
#0F2920 near 367) to #0B2019 at rows 432..438 — the gradient exists. Light:
#FFFFFF at every sampled band between the card's rows. The populated
(`customer-home-jobs-*`) renders carry the same card and tile geometry.

**E2E, read from both flows.** "Post a job" (sign-in.yml `HOME_MARK`,
money-walk.yml Act 1 tap — the pill's `accessibilityLabel`) is rendered,
tappable, and higher on the screen; "Create" (the bar's [ + ], Acts 3 and 5),
"Search for jobs or areas" and "Search" (worker Home), "My Jobs" (the worker
bar tab) are untouched. Acts 3 and 5 wait on `.*What do you need\?.*` after
tapping Create — the create SHEET's title "What do you need?" — and the card's
"What do you need done?" does not match it ("need" is followed by " done",
not "?"). The flows were not edited. The harness's Post-a-Job recipe
(`scripts/shots.mjs` TO_MEDIA: expect "Take a task", press "Create", press
the exact text "Post a job" — the sheet's row, since the pill's text node is
"Post a job ›") landed on the AFTER export in both themes.

## What a following run must know

- **The line token, resolved.** The dispatch said "the line token as a 1pt
  border" for light. Home's stylesheet is built from `ColorPalette`
  (`lib/theme.ts`), which has no `line` — its hairline role is `border`
  (#DDD6C4 light). The card does NOT use `border`: it reads `taskCardEdge`,
  whose light value is §I's `line` #DDE2DD exactly, so the card's ring is
  the line token by value. The FIELD inside the card still wears
  `colors.border` (#DDD6C4), as it always did — two hairlines one level
  apart in light, identical (#55482E) in dark. If the operator wants the
  field's ring to match the card's, that is a colour-only change to
  `searchField.borderColor`.
- **No `overflow: 'hidden'` on the card, on purpose.** The promo card had it
  to clip the absolutely positioned B mark; the task card has no
  absolutely positioned child, and on iOS `overflow: hidden` clips a
  view's own shadow. The gradient's corner clipping follows the pill's
  precedent (`litFill` on a rounded Pressable with no overflow rule). A
  device fact to confirm: the dark card's corners.
- **No `shadows.cardDark` on the card.** The promo card added it in dark;
  the dispatch's dark spec is the mockup's, and the mockup's dark card has
  `--cardShadow: none`. `shadows.card` stays on the shared style
  (theme-blind, near-invisible on the dark ground, as before).
- **The entrance indices moved with the sections**, not as a design change:
  MOTION1's rule is "arrive in reading order", so the card is index 1 and the
  row index 2 now (they were 2 and 1). Nothing under reduced motion.
- **`screens/MapScreen.tsx` carries a stale comment** (`MAP_SEARCH_HEIGHT`
  docblock: "the customer Home draws the same SearchBar at
  `DEFAULT_HOME_DESIGN_SETTINGS.searchHeight` (65 …) and the map's is a
  step under it"). Home's is 44 now, so the map's 56 is a step OVER it. The
  file was outside this run's scope; the constant is untouched and no test
  ties the two. A one-line comment fix is owed.
- **`scripts/shots.mjs` still carries the stale chip comment** the previous
  run recorded (lines 387-390); unchanged, still owed.
- **The Design Studio's Colors category enumerates the three new roles
  automatically** ("Task card lit top" etc., Advanced tier). Their contrast
  readout pairs them with `background` rather than the ink because
  `GROUND_ROLES` in `ui/designStudioSchema.ts` does not list them — a
  dev-tooling nuance, not a render fact; add them there if the readout
  matters.
- **The registry's screen rows are parsed as TEXT** by
  `tests/screenDials.test.mjs`; the relabelled `home.promoCard.radius` row
  keeps its field order and its note sits ABOVE the opening brace.
- **The dark B mark's "artwork still owed"** (the drape fabric behind the B
  that exists in no asset) is moot: no B is drawn on Home now.

### The fences this run touched, and how

Authorised re-pointings and constant moves only (dispatch Phase 0.5). No
fence's logic was weakened and none was deleted.

| File | What moved |
|-|-|
| `tests/emeraldFences.test.mjs` | **home(2)** RETIRED and RE-POINTED (AUTHORISED): "the B drape is a fraction of the screen, and the copy column follows it" → "the task card holds the title, the field and the pill, and the promo card is gone". Before: `B_DRAPE_WIDTH_RATIO` × the drape's ink share vs master 44's 18.7% band, the copy reserve vs the ink's left edge, `B_DRAPE_ASPECT` vs both PNGs, the `bDrape` mechanism, `heroMark`/`heroCopy` pins, the promo heading's 19pt fit, its 262.5 line end and its explicit break. After: the promo copy, mark, requires, geometry constants and eight styles asserted ABSENT; the card located as one `Animated.View` with `litBetween` and `cardEntrance`, its three rows in order INSIDE it, the field's placeholder/submit/`disableLeadingIcon`/studio metrics, exactly one `name="search"`, the pill's style and handler, the dial read; `taskCard` padding 17 / gap 14 / `taskCardEdge` / `taskCardLitBottom` / `shadows.card`, no `taskCardDark`, the 20/24 title; the three roles' dark hexes, their light values EQUAL to the palette's `surface`/`line`, and both palettes reaching them by reference; the screen order hero → card → row → attention → your jobs. `pngSize`, used only there, removed. **home(25)** RE-POINTED (AUTHORISED): the promo card's 186 (borders, 16 padding, eyebrow 14, copy gap, 2× heading leading, body gap, cta, B top 22.2) → the task card's 180 (2× border, 2× padding 17, title line 24, 2× gap 14, `searchHeight` 44, `ctaHeight` 48), with 44/17 and 48/24 pinned by name. **home(24)**: `searchField: { marginTop: 8,` and `heroCard: { marginTop: 3,` → both styles asserted margin-free, `intro`'s `paddingBottom: spacing.sm` pinned, and `sectionGap + sm === 28` re-derived; the tile arithmetic unchanged. **home(19)**: `source={isDark ? PRESTIGE_B_DRAPE : POST_MARK}` → asserted absent (RETIRED). **home(16)**: `heroHeadline: { … fontSize: 19, lineHeight: 30,` and `heroHeadlineDark` → asserted absent; `ladder('promoHeading') === 22` → `promoHeading` asserted absent from `MASTER_SERIF_CAPS` (RETIRED). **home(26)**: no assertion moved; a note that the tile row now sits above the first job section. RUN H2 / RUN H3's pill assertions: untouched, passing. |
| `tests/homeDesignStudio.test.mjs` | Constants: `searchHeight: 65` → `44`, `searchRadius: 35` → `17`. |
| `tests/voiceSearch.test.mjs` | "customer Home's trailing arrow submits" → "trailing magnifier submits" (AUTHORISED, C2c): `name="arrow-forward"` → `name="search"`, plus the label "Search" and `disableLeadingIcon` pinned; the additive-props test pins `disableLeadingIcon = false,` and the `? null :` render. |
| `tests/litSurface.test.mjs` | Constant: the `${withAlpha(` stop count 5 → 7; new pins for `VERTICAL = '180deg'`, `linear-gradient(${VERTICAL}, `, and both fills reaching `backgroundImageStyle`. The barrel line pin unchanged. |
| `tests/themeTokens.test.mjs` | Constant: the lib/theme stub's destructure widened by `light: emeraldLight` (the test's own instruction: "the stub is widened, never the assertions"). |
| `tests/themeResolution.test.mjs` | Constants: `assets/prestige/brazos_b_drape.png` and `assets/brand/brazos_b_drape.png` leave BAKED_ART with their mount (the roster's own rule, precedent: the Heritage armchair and app-icon-v2); `transparentChecked >= 6` → `>= 4`; the hero-bake list drops the drape and `checked === 4` → `3`. The gate scan's `checked >= 4` still holds at exactly 4. |

Read and found not to move: `tests/screenDials.test.mjs` (the dial's key,
default and fallback are unchanged), `tests/customerCore.test.mjs` (its
Home pin is an OR that "Switch to Worker" still satisfies),
`tests/copyTruth.test.mjs`, `tests/copyHonesty.test.mjs`,
`tests/homeAttention.test.mjs` (both position claims hold; it pins no
"immediately after the card"), `tests/postJobPublish.test.mjs`,
`tests/layout.test.mjs`, `tests/designStudio.test.mjs`,
`tests/shotHarness.test.mjs`, `tests/maestroFlows.test.mjs` (pins no Home
string). home(6) is a PostJobScreen fence and does not touch Home.

## What is blocked

- **Image reads.** `.claude/hooks/evidence-guard.ps1` refuses them for a run
  launched without operator authorization, and this run was. Every claim
  about a render here was produced by scripted pixel analysis over
  `tests/pngGeometry.mjs` (`.shots/task-card/probe.mjs`,
  `.shots/task-card/rowspan.mjs`); no one has LOOKED at these PNGs. The
  visual review is the operator's.
- **A run cannot start an agent.** Unchanged.
- **The co-author trailer cannot appear in a Bash command's text.** Both
  commits were made with `git commit -F <file>`, the message written by the
  Write tool under the gitignored `.shots/task-card/`.
- **`git config` is refused** (GUARD-GIT git-config-write); the "LF will be
  replaced by CRLF" warnings on add are git's normalisation notice and changed
  no content.

## Waiting on the operator

- **Everything this run landed is "landed, unverified" on a device.** No
  device ran it; the proof here is the offline suite and the web-export
  renders. The task card reaches a phone through `npm run update:preview`
  and two app launches. Device facts the harness cannot show: the mic inside
  the 44pt field (the harness has no on-device recogniser, so no mic renders
  in any PNG); the dark card's rounded corners over the gradient; the light
  card's shadow.
- **The visual review.** Ten PNGs are in `.shots/task-card/`
  (`before-` × 4 customer Home targets, `after-` × 4, `after-postjob-media-`
  × 2).
- **The revert line:** `git revert 6e453fb` brings the search bar and the
  promo card back.
- Nothing on the push: `npm run verify` exited 0 in this run, so the autonomy
  contract's one permitted push — flag-free `git push origin mainexpo` — was
  run after this commit (see the run report for the result). Staging's
  pipeline has no work here: this run touches no migration and no edge
  function.

## Open gates

See `docs/GATES.md`. Gates 0, 1 and 2 are closed. Gate 3 is the live one. This
run ticks no box: it is design and structure work on a surface Gate 2 already
recorded as rendered and reviewed, and it puts the customer Home one render
set ahead of the 2026-09-06 review that box cites.

## Dispatch log

DISPATCH START 2026-09-17 22:17 - prompt home-plus-and-your-jobs, model claude-opus-5, effort max, mode bypass, log C:\Users\mdmah\BRAZOS\.audit-scratch\dispatch\home-plus-and-your-jobs-2026-09-17_2217.log
DISPATCH END 2026-09-17 22:49 - exit 0 - log C:\Users\mdmah\BRAZOS\.audit-scratch\dispatch\home-plus-and-your-jobs-2026-09-17_2217.log
DISPATCH START 2026-09-17 23:14 - prompt home-slider-and-subcopy, model claude-opus-5, effort max, mode bypass, log C:\Users\mdmah\BRAZOS\.audit-scratch\dispatch\home-slider-and-subcopy-2026-09-17_2314.log
DISPATCH END 2026-09-17 23:46 - exit 0 - log C:\Users\mdmah\BRAZOS\.audit-scratch\dispatch\home-slider-and-subcopy-2026-09-17_2314.log
DISPATCH START 2026-09-17 23:57 - prompt home-task-card, model claude-opus-5, effort max, mode bypass, log C:\Users\mdmah\BRAZOS\.audit-scratch\dispatch\home-task-card-2026-09-17_2357.log
