# HANDOFF — current operational context

WRITTEN: 2026-09-21 (the Lux chat, latest: THE WELCOME PAGE BUILT — the reference the
operator brought, on the Lux ground, with the rim light on the lead action; code commit
`b8456f6`, verify 1393/0, NOT walked on the phone; its section is second, after the Fable
chat's RUN WEBP, which is the latest OTA on preview). The mode switch's record, the Lux
drawing run's, the eighteen-item run's and the two sittings before it follow, unchanged.

Rewritten as the last act of every run. Read it before naming what is blocked or
what just happened.

## RUN WEBP COMPLETED (2026-09-21, the Fable chat) — the four mounted prestige rasters ship as WebP; OTA `b962496b` live on preview

**What changed (commit `0dcdd58`, pushed to `mainexpo`; CI verify runs on the push).** The
four rasters the app mounts — `hero_armchair_customer`, `hero_armchair_customer_light`,
`hero_toolbox_worker`, `home-atmosphere-dark` — are required as `.webp` (q90, alpha kept,
encoded with Chromium's libwebp through Playwright, so NO new dependency): 165 → 21 KB,
150 → 19 KB, 1,448 → 234 KB, 3,729 → 94 KB; 5.9 MB of PNG to 0.5 MB, measured at 36–45 dB
PSNR against the PNGs (mean error 1–2 points per channel out of 255). The PNG masters
STAY on disk beside them: `tests/themeResolution.test.mjs` measures each bake on the
master (`scripts/atmosphere-tune.mjs`, `home-ground-blend.mjs` and the mockup builders
read them too). `brazos_b_drape.png` is mounted by nothing and is untouched.

**The fence, read carefully (the one thing the operator should review).** The BAKED_ART
roster now keys the `.webp` mounts, each naming its PNG `master`; a new `rosterBytes()`
proves the WebP exists, is RIFF/WEBP, and is exactly the master's size (`webpDims()`
reads VP8X / VP8L / VP8 headers), THEN the unchanged alpha sweep measures the master's
bytes as it always did. Nothing was loosened: every prior assertion still runs on real
alpha samples; the indirection was added, not a check removed. The three other pins
(`workerHome`, `emeraldFences` home(4), `postJobPublish`'s light-hero gate) take the
new filename only. `npm run verify`: lint clean, 1387 tests pass.

**The OTA.** `npm run update:preview` → branch `preview`, runtime `1.0.0`, update group
`b962496b-83d0-43d0-85de-6d740d9a5df8`, iOS update `01a0c2da-c0f3-7fdc-a1e0-51e54cfff423`,
4 new assets uploaded (47 reused). Dashboard:
https://expo.dev/accounts/mah_r2/projects/BRAZOS/updates/b962496b-83d0-43d0-85de-6d740d9a5df8.
NOT yet walked on a device — that check is the operator's: Customer Home's hero and
atmosphere, Worker Home's toolbox, both themes, after the Beta build pulls the update.
`dist/` is unchanged by git's account after the export.

**Why this and not a drawing.** The operator asked whether the hero could be redrawn in
CSS/SVG to shrink the app; a four-round measured attempt (`.shots/vector/`, gitignored)
reached 95% mean-colour match and was judged "not even close" by eye, as predicted —
vector cannot carry velvet, brass or leaves. Parked. WebP keeps the photo and takes
91% of the bytes; the tooling is `.shots/webp/` (convert / compare.html / emit /
patch-tests), gitignored.

**Also from this chat, docs only, UNCOMMITTED by instruction:** the nine Fable Lux pages
(`docs/mockups/html/lux/lux-<key>-fable.html` for home, post-review, compare, cjob, chat,
checkout, review-tip, welcome, signin; their render functions appended to
`lux.build.mjs`, `index.html` rebuilt to 76 screens; the Lux chat composes the
Opus-vs-Fable sheets and records the operator's pick in `SCREENS.md`).

**Tree at the end of this run.** Modified, uncommitted: `docs/mockups/html/lux/lux.build.mjs`
and `index.html` (the Fable pages). Untracked: the nine `lux-*-fable.html` pages, and the
Lux chat's own `welcome-ideas.html`, `welcome-motion.html`, `mode-switch-*.html`. This
HANDOFF commit carries the Lux chat's uncommitted Welcome-page note below unchanged —
flagged here because that note was theirs and still awaiting the operator's pick.

## THE WELCOME PAGE — BUILT (2026-09-21, the Lux chat): the reference on the Lux ground, the rim light on the lead action; `b8456f6`, NOT walked on the phone

**What just happened.** The operator picked f (the rim glint) from the six motions and said
"can we implement that?" — so the Welcome page they brought, kept as it is on the Lux ground
(version 1 of `welcome-ideas.html`, polished in `welcome-motion.html`), is now the APP's dark
Welcome, with the light on the lead button. One code commit, `b8456f6` (DECISIONS 16), then
this docs commit. `npm run verify` 1393 pass / 0 fail, twice in the run (before the code
commit and after the docs edits).

**Three rulings the build is held to — none of them taste, all of them fences:**
- THE LIGHT IS ON EMAIL, NOT PHONE. The reference and the operator named "Continue with
  phone"; `tests/firstSession.test.mjs` n5 keeps email FIRST and phone second, undemoted,
  because phone auth resolves to `disabled` on every non-development build
  (`lib/phoneAuth/mode.ts` — the Beta included; `CreateAccountScreen` then shows the notice
  and "Use Email Instead"). A light circling a switched-off control would be wrong, and
  demoting phone would mean weakening n5's logic — a stop condition. So the lead action
  (email) is lit and carries the light; phone keeps the standard treatment at the same
  shape with its own glyph and chevron; sign-in is the ghost with the chevron. THE SWAP IS
  ONE LINE plus a ruling on n5, the day SMS is switched on — say so to the operator if they
  ask why the phone button is not the lit one.
- THREE ACTIONS, not the reference's two: the live screen's "Continue with email" is the
  path that registers anyone today and stays.
- THE HEADLINE IS THE SYSTEM SANS. The reference and the Lux README draw it in Georgia;
  `tests/themeTokens.test.mjs`'s one-serif fence permits `fonts.displayHero` in
  `screens/HomeScreen.tsx` alone, and widening it is a decision of its own (a dated
  DECISIONS entry + the fence's allow-list), deliberately NOT made in this run.

**What landed (`b8456f6`):** `ui/tokens.ts` + `lib/theme.ts` — eight role tokens in both
palettes (`authGroundTop/Mid/Bottom` = the Lux ground `#062421 → #0A1A17 → #07110F`,
`heroDiscTop/Mid/Bottom`, `authCtaTop/Bottom`; light: the ivory `bg` thrice, the mint/sand
family, the forest twice — flat by construction). `lib/authTheme.ts` — `heroButton` 58 / r22
and `authShadows.hero`. `components/AuthScaffold.tsx` — `ground` (the diagonal gradient,
dark only). `components/AuthBackdrop.tsx` — `full` re-anchored to the page's corner (five
arcs from (1.22w, −.047h), radii .331w in steps of .0765w, fading .36 → .12 in dark; the
wash a soft gold radial haze; the two mid-band sweeps drawn in NO colour in dark, kept in
light); `soft` untouched. `components/AuthButton.tsx` — optional `hero` (shape), `lit`
(the fill between the two CTA stops + the depth), `icon`, `chevron`, `light`; absent, the
control renders byte-identically (the plain label stays the Pressable's direct child).
`screens/WelcomeScreen.tsx` — the art as the page's: three discs from one radial fill,
their rims CRESCENTS (a ring peeking out from under a disc set 1.5 pt off it — no inset
shadow, no mask, old-arch-safe), the haze, the ghost ring, the badges at the page's
positions as fractions of the art box (measured by `onLayout`), the two-tone headline in
one Text (`emeraldBright` for the promise); the same structure in both themes. THE LIGHT:
`components/RimLight.shared.tsx` (lap 6000 ms, light 120 × 44, inset 2, cover inset 1,
`rimPoint` — a 'worklet' — and `rimSamples`), `RimLight.motion120.tsx` (one shared value,
`withRepeat(withTiming(1, linear), -1, false)`, the point per frame on the UI thread),
`RimLight.tsx` (through `resolveMotion120`; the native-driver fallback interpolates the
sampled table on `Animated.loop`; `null` under reduced motion — the rim rests). Fences:
NEW `tests/rimLight.test.mjs` (six tests; the lap EXECUTED via `stripTypeScriptTypes`);
`tests/motion120.test.mjs`'s SIBLINGS table and worklet-callable roster gain the sibling.

**Proven, offline and by pixels (image reads were blocked for this run — every visual
claim is a measurement):** the harness (`scripts/shots.mjs --build --only auth-welcome`,
which BY DESIGN runs under `prefers-reduced-motion: reduce` with animations disabled)
rendered the live screen both themes — `.shots/auth-welcome-{dark,light}.png`: the arcs
within two points of the page's on the same row (x 261/285/319/356 vs 251/284/318/355), the
three badges (teal glass fill, gold glyph, cream text, gold hairline), the three-line
headline (cream, then `emeraldBright` twice), the two-line muted body, three 58-tall
gold-hairlined buttons at y 650/718/786 (web has no safe insets — on the phone everything
sits 59 lower at the top and the actions end 34 above the bottom), the ground at 18.5 vs the
page's 17.4; light intact in its own colours (ivory ground, mint discs, white badge cards,
forest fills). With motion ON (`.shots/lux/welcome-motion-live.mjs`, the same export served
the harness's way, `reducedMotion: 'no-preference'`): thirteen frames half a second apart
track ONE bright point clockwise round the lead button's rim — the bottom edge right to
left (x 319 → 233 → 150 → 66), the left edge, the top edge left to right (106 → 191 → 277 →
351), the bottom again — peaks 220–224 against the plain hairline's 166, the fill beside it
64 in every frame (the cover holds), no page errors. The still shows the rim at rest, which
is what `RimLight` renders under reduced motion.

**NOT DONE — the operator's:** the phone walk (the OTA, if they want it: `npm run
update:preview` on their word, as the mode switch was published), and two rulings — the
serif headline (widen the one-serif fence or not) and, when SMS is provisioned, the lead
action (n5) and with it where the light goes.

**The pages (this docs commit):** `docs/mockups/html/lux/welcome-ideas.html` (the three
grounds; v1 the pick), `welcome-motion.html` (the polished v1 still + six motions live; f
the pick — THE TRACKED REFERENCE for this screen; `SCREENS.md`'s welcome row says so).
`lux.build.mjs`'s own `welcome` / `welcome-fable` renders are NOT replaced: that file
carries the Fable chat's uncommitted changes in this tree and was left exactly as found.
Scratch (gitignored, `.shots/lux/`): `welcome-ideas.build.mjs`, `welcome-measure.mjs`,
`welcome-motion-shoot.mjs`, `welcome-live-probe.mjs`, `welcome-live-rim.mjs`,
`welcome-motion-live.mjs`, `welcome-dark-probe2.mjs`, `welcome-light-probe.mjs`, the
`patch-*.mjs` that made the CRLF-preserving edits, `commit-welcome.txt`.

## THE MODE SWITCH — the glass wipe carrying the capsule (2026-09-21, app code)

**What changed and why.** The operator, on the 1000 ms artwork sheet: "get rid of this
annoying switching mode transition … consistent with the emerald lux glass theme … show
me diff versions … optimized for smoothness." Six ideas were drawn live (no app run:
`docs/mockups/html/lux/mode-switch-ideas.html`, CSS on Lux phones with a slow-motion
toggle); they picked **the glass wipe carrying the capsule** (shown alone both ways in
`mode-switch-wipe-capsule.html`), then "implement this right now". Asked and answered:
the confirm dialog stays as it is; the capsule holds ~700 ms then retracts; publish the
OTA. DECISIONS (15).

**What landed (one code commit, `npm run verify` 1387 pass / 0 fail — six new tests):**
- `components/ModeTransitionOverlay.shared.tsx` — NEW: every number (pane in 260 ms,
  swap under full cover, hold ≥ 60 ms, reveal fail-safe 400 ms after the swap, pane out
  280 ms; capsule in at 180 ms over 220, holds until 1100, out over 200; reduced motion
  110/130), `runSequence` (THE one clock: the swap fires once from the cover callback
  with the layout waiter armed first, the reveal waits for the tree's layout or the
  fail-safe then one frame), the themed styles (the pane is `palette.background`, the
  leading edge the mint `emeraldBright` rim at .55 + a specular line, the shadow a
  gradient strip from the palette's black — no literal colour).
- `components/ModeTransitionOverlay.motion120.tsx` — NEW: the Reanimated path (two
  shared values — the pane's translateX, the capsule's translateY — each `withTiming`
  ending in one `runOnJS` hop), chosen through `resolveMotion120` like the other
  siblings.
- `components/ModeTransitionOverlay.tsx` — rewritten: the provider (`start`, `busy`,
  and the new `markTreeLaidOut`), `ModeTreeLayoutSignal` (the paint signal), the
  native-driver sibling and the reduced-motion crossfade (opacity only, the same
  capsule), all over `runSequence`. `busy` ends when the pane has left; the layer
  unmounts when the capsule has gone.
- `navigation/ModeShell.tsx` — mounts `<ModeTreeLayoutSignal key={treeMode} />` inside
  the painted tree View (its fences untouched: the View's opening tag and the ground
  paint are byte-identical).
- RETIRED: `components/modeTransitionAssets.ts` (deleted); `assets/brand/transition-
  customer.png` and `transition-worker.png` stay on disk, required by nothing.
- Fences moved as constants with dated reasons: `tests/motion120.test.mjs` (the fast-path
  roster and the SIBLINGS table gain the new sibling), `tests/themeResolution.test.mjs`
  (the two sheets leave the raster roster; the shimmer allowance goes; the D6 lazy-sheet
  count holds at 23 because the base file keeps `metricStyles`), `tests/themeTokens.test.mjs`
  (the `'#FFF3D6'` allowance goes — the map is empty), `tests/goldOnForest.test.mjs` (the
  gold-fill allowlist is empty). NEW `tests/modeTransition.test.mjs`: the one clock, the
  swap once under cover with the waiter armed first, the paint signal keyed by the tree,
  the one owner, transform/opacity only, reduced motion never travels, the sheets
  required by nothing.

**Not walked on the phone.** THE OTA IS LIVE on the preview channel (asked: "Yes, publish"): update group `2b439b2e-3e43-4189-a3d7-bac9e6e1b9b1`, iOS update `01a0c2c0-6c7b-7d6d-8336-e9b277464a5d`, commit `cc4889f`; dashboard `https://expo.dev/accounts/mah_r2/projects/BRAZOS/updates/2b439b2e-3e43-4189-a3d7-bac9e6e1b9b1`. The operator
open the Beta twice and switch modes both ways: the pane should never rest, the new
home should already be there when it clears, the capsule should drop, hold and leave on
its own, and the customer's [+] sheet / the worker's Profile row must stay disabled only
until the pane has left. If the incoming home ever shows blank under the leaving pane, the
layout signal did not fire — the fail-safe (400 ms) is the floor to check first.

**A working-tree note.** While this landed, the operator's OTHER chat (Fable 5.1, the
seven comparison pages) was editing `docs/mockups/html/lux/lux.build.mjs` and adding
`lux-*-fable.html` pages in the same tree; those files were left exactly as found and
are not in this commit.

## THE LUX DRAWING RUN (2026-09-21) — all 67 screens are pages; NOTHING is applied

**What exists now.** `docs/mockups/html/lux/lux-<key>.html` for every row of
`docs/mockups/html/lux/SCREENS.md` (67 screens, 84 frames — a screen that scrolls
carries a second frame, `lux-<key>-2`, shifted to end exactly at the bar; the Filters
popups, the chat menus, the portfolio steps and the amount/confirm pair are one frame
each), all from `lux.build.mjs`, all opened by `docs/mockups/html/lux/index.html`.
The review sheets the operator sees are `.shots/mockups/lux-sheet-b<batch>-<n>.png`
(gitignored, 23 of them) and the singles `lux-<key>.png` beside them.

**What the operator said, and where the loop stands.** Batches 1 and 2 (23 screens):
**"Yes, all of them"**, asked one batch at a time per the handover's loop. Then, before
batch 3: *"Build all of the batches til 6, without my permission, I'll be stepping away
… just NO IMPLEMENTATION IN THE ACTUAL REPO ALL I WANT IS MOCKUP … save them in the repo
somewhere and I will come back and say what to change"* — so batches 3–6 (44 screens)
were drawn without a pause and AWAIT THEIR REVIEW. They also ruled Fable 5.1 reserved
for hard accuracy or layout calls only and gave leave to switch models when needed; no
call arose and Fable was not used. Ultracode and the Agent tool stay refused on this
machine; one hand drew every page.

**How every page was proven (measured, never viewed — image Reads are refused).** Per
page: the source screen read and its controls listed; the column measured against the
bar or the sticky bar (`.shots/lux/measure.mjs`, the pattern of
`.shots/harness-blur/redesign/measure.mjs`); every clipped or squeezed text flagged
(`.shots/lux/clipcheck.mjs` — only the source's own one-line ellipses remain); and
every string the source draws asserted present in the page (`.shots/lux/controls.mjs`,
green on all 67). The whole set was rebuilt from scratch in one run at the end
(`node docs/mockups/html/lux/lux.build.mjs`, no key), then `npm run verify`: 1381
pass, 0 fail, before each of the six pushes.

**Commits, one per batch, all pushed to `mainexpo`:** `c34aa75` batch 1, `cce4c50`
batch 2, `bf370b3` batch 3, `64fa0b6` batch 4, `c18921f` batch 5, `97adab3` batch 6
(the full rebuild + index), then this docs commit. Every one is docs under
`docs/mockups/html/lux/` — no app file moved. Revert: `git revert` any of them; each
stands alone.

**Corrections and additions made on the way, for the reviewer to know:** Worker Home
and Available Jobs (approved in the previous sitting) were re-barred with the WORKER
bar (Home · Map · My Jobs · Inbox · Profile) the README specifies — they had carried
the customer's [+] bar. `SCREENS.md`'s `post-live` source was corrected to
`PostJobScreen`'s success overlay (not `JobConfirmedScreen`). The README's honesty
rules now name the added fixtures: the sample worker (Sam Okafor), a second sample
bidder (Priya Natarajan), the sample job's two bids and its one funded payment at the
fee schedule's 7.5% ($110 agreed → $118.25 charged → $101.75 to the worker), and the
customer map's tiles (the approved worker-map stand-in). No rating, review, completed-
job count or balance was invented anywhere — a worker reads "New worker" / "No reviews
yet", and Earnings sums the one sample row.

**Two rulings are the operator's on return:** (1) batch 6 is drawn in Lux — whether
the auth flow keeps its own emerald/ivory palette (`lib/authTheme.ts`) is theirs;
(2) reviews and the worker's profile are drawn with no reputation, by the README's
rule — say "draw sample reviews" to see that layout.

**What the next chat does.** Read the operator's changes per screen; remake only those
(README §Working loop; a remake is a render function edit, `lux.build.mjs <key>`,
`shoot.mjs`, the three checks, a sheet); then ask "plan the rebuild, or park it?" —
applying anything is a NEW plan (tokens → primitives → screens) and never a step of
the review. The seven Fable comparison pastes in `docs/dispatch/LUX-HANDOVER.md` stay
optional.

> **BEFORE THIS RUN, THE SAME DATE: the dark rebuild's direction was chosen —
> B, Emerald Lux Glass — and NOTHING was applied.** The harness gained `--design <file>`
> (a candidate token table rendered as real screens) and a comma list for `--only`.
> DECISIONS (14). What follows is that run's record, unchanged.

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

- **THE LUX PAGES (this run): the review of batches 3–6** — 44 screens drawn under the
  standing "build all batches" instruction — and the two rulings above (the auth
  palette; sample reviews or none). Open `docs/mockups/html/lux/index.html`, or the
  sheets `.shots/mockups/lux-sheet-b3-1.png` … `b6-3.png`. Say what to change per
  screen; nothing is applied until a rebuild plan is asked for.
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
