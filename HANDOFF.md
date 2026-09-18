# HANDOFF — current operational context

WRITTEN: 2026-09-17 (run home-plus-and-your-jobs).

Rewritten as the last act of every run. Read it before naming what is blocked or
what just happened.

## What this run landed

Two changes to the customer Home, one commit each so the operator can revert
either alone, plus this docs commit.

- `27adc77` — **feat(nav): the dark centre button takes the Post-a-job green,
  no ring.** Six files: `ui/tokens.ts`, `ui/primitives/BottomNav.tsx`,
  `ui/designStudioSchema.ts` and three fences.
- `a1e2c81` — **feat(home): "Your jobs" replaces Nearby on the customer Home.**
  Twelve files: `screens/HomeScreen.tsx`, `ui/designStudioSchema.ts`,
  `lib/homeDesignStudio.tsx`, `dev-tools/HomeDesignStudio.tsx`,
  `scripts/shots.mjs` and seven fences.
- `docs: the green centre button and "Your jobs" — decision, backlog, handoff`
  (this commit) — `docs/DECISIONS.md`, `docs/BACKLOG.md`, this file.

`npm run verify` green before every commit: **1361 pass, 0 fail, exit 0**. The
suite count did not move — no test was added or deleted, only re-pointed.

**THE BUTTON, by token.** Dark only. Fill `colors.postPillGreen` under
`litFill({ surface, lift: colors.emerald, liftAlpha: navBar.createLiftAlpha,
highlight: false, flat: !isDark })` — the dark "Post a job" pill's own recipe,
so the two controls are identical by construction and no new hue entered the
app. Glyph `colors.onForest`. Ring NONE (`borderColor: 'transparent'`, by
colour and not by width, so no geometry forks). Glow follows the fill: one
`glow.halo`, one shape, one alpha, a ternary on the colour alone.

**LIGHT DID NOT MOVE, proven:** `customer-home-light` and
`customer-home-jobs-light`, before against afterA, **0 differing pixels on both
pairs**. Dark's 54 pixels above the bar are 1/255 on one channel each, confined
to the "Switch to Worker" ring at rows 24–54 — the same browser rasterisation
artefact `screens/HomeScreen.tsx` already documents at that exact ring; nothing
in the change can reach it.

**HOME'S SECTION ORDER NOW:** greeting → hero → search → service chips → promo
card with "Post a job" → "Needs your attention" (only when non-empty, position
unmoved) → "Your jobs" (always present). "Post a job" is above the fold: its
ink sits at y 576..623 of the 852pt screen, and every row above 671 is
byte-identical to the render taken before Change B.

## What a following run must know

- **THREE TOKENS ARE NOW ORPHANED OR DISAGREE WITH THE RENDER**, left standing
  because the dispatch scoped this run to two studio rows. `navBar.gold`
  (#D8A448) and `navBar.glyphColorDark` (#107257) have **no call site at all**
  — nothing in the app or the registry reads them. And two live dials launch at
  values the app no longer draws: `create.border` at `navBar.ringColorDark`
  (the dark button has no ring) and `create.glowColor` at the palette gold
  (dark's halo is `postPillGreen` now). That is the obvious next nav dispatch.
- **`navBar.createLiftAlpha` (0.13) and `CTA_LIFT_ALPHA` in
  `screens/HomeScreen.tsx` are ONE decision written twice.** It could not be
  imported — the value lives in a screen and a `ui/` primitive must not reach
  into `screens/`. Both docblocks say so. Move either and the other has to move
  with it, or the [ + ] and the Post-a-job pill stop matching.
- **Six of the nineteen N3 values are still held by no fence** — `nav.barHeight`
  70, `nav.activeColor` #49C481, `create.radius` 18, `create.glyphSize`'s 0.645
  ratio, and (as of this run) `create.fill` and `create.glyphColor` at their new
  values. `create.fill` and `create.glyphColor` are now pinned BY TOKEN NAME in
  `tests/emeraldFences.test.mjs` (home(8) and RUN H3) and
  `tests/designStudio.test.mjs`, which is stronger than N3 left them but still
  not a value pin. Closing that gap is still un-dispatched.
- **`tests/layout.test.mjs` still fences the literals 106 and 122**, which were
  the bar's footprint before N3. The live footprint is 82 (70 + 12) and 104
  (70 + 34); `\b82\b` and `\b104\b` cannot be swapped in because they match a
  pressed-opacity and a thumbnail elsewhere. The value-independent half of that
  fence — no screen may do arithmetic on the bar-height tokens — is the live
  guard.
- **The registry's screen rows are parsed as TEXT**, in a fixed field order, by
  `tests/screenDials.test.mjs`. A comment between two fields of a row breaks the
  parser. Notes go ABOVE the row's opening brace.
- **Customer Home now declares TWO screen dials, not six.** The four
  `home.jobCard.*` rows and the `jobCardRadius` home-design setting were deleted
  with `OpenJobCard`, the only thing that read them. A dial whose wearer is gone
  is a control that lies, which is `tests/screenDials.test.mjs`'s own charter.

### The fences this run touched, and how

Two authorised re-pointings per change, plus expected constants. No fence's
logic was weakened and none was deleted.

| File | What moved |
|-|-|
| `tests/emeraldFences.test.mjs` | home(8): the fill pins as `colors.postPillGreen`, the lit recipe is read off the source, and the two ring assertions ("a token, never the fill's own colour") become the stronger "no ring at all", cross-checked against the dark pill's own spelling. RUN H3: the dark glyph is `onForest`; the dark branch is still asserted WHOLE and light is still pinned unchanged. RUN H2: the heading text node → "Your jobs", and the live dot is asserted GONE. home(26): re-pointed at "the first job section"; the measurement is untouched. |
| `tests/designStudio.test.mjs` | S3 nav paint: the dark ring reads `'transparent'`, the fill reads `colors.postPillGreen`, the lit alpha is pinned. D14's token and BOTH `create.border` dial defaults are asserted exactly as before. |
| `tests/goldOnForest.test.mjs` | The recorded gold-fill exception `ui/primitives/BottomNav.tsx::createButtonDark` is DELETED — it stopped matching anything, and that file's own deepEqual treats a stale exception as a failure. The unread dot is the one exception left. |
| `tests/homeAttention.test.mjs` | The position claim is unchanged (above the pill forbidden, leading the job sections required); it reads `">Your jobs</Text>"` as the section below. Its second test is re-pointed off the deleted `OpenJobCard` onto the card that survived: both lists must still say when a job was posted and who it is with. |
| `tests/ownJobCard.test.mjs` | The `isOwn ? openOwnJob : browseOpenJobs` ternary is gone with the mixed feed. The rule is stronger: `browseOpenJobs` and `isOwn` must appear nowhere in the file. |
| `tests/customerCore.test.mjs` | Four pins that named the removed section replaced by the copy that took its place — `YOUR_JOBS_COUNT = 3` and `counterpartyLine` for `PREVIEW_COUNT = 4` and `previewNeighborhood`; "Your jobs" for "Live Nearby / N pros interested"; the two motion pins went with the live dot's pulse. Every `doesNotMatch` is untouched. |
| `tests/screenDials.test.mjs` | Customer Home's table drops the four `home.jobCard.*` rows. |
| `tests/homeDesignStudio.test.mjs` | Drops `jobCardRadius` from the defaults list and the control list; the Home read moves to `design.ctaRadius`. |
| `tests/shotHarness.test.mjs` | The populated-Home wait is `SEEDED_JOBS[2].title`; the jobs-table stub branches are counted at three, all flag-gated. |

### The populated render — continue-path (a) was taken

`customer-home-jobs-*` would have photographed the empty state: "Your jobs"
reads jobs by `client_id`, a different query from the open-market feed, and the
harness answered only the feed. `scripts/shots.mjs` now answers that read too,
**with the same four rows it already seeds** — no fifth row, no new field; only
the ownership changes, and it has to, because those rows ARE the signed-in
customer's postings in that read where they are a stranger's in the feed. Still
gated on `jobs: true`, so every target that did not opt in keeps the empty
answer. The wait moved from the last of the four to the last of the THREE drawn.
The populated variant rendered green in both schemes — the wait is a title only
a drawn card shows, so that is the proof it populated.

## What is blocked

- **Image reads.** `.claude/hooks/evidence-guard.ps1` refuses them for a run
  launched without operator authorization, and this run was. Every claim about
  a render here was produced by scripted pixel analysis over
  `tests/pngGeometry.mjs`; no one has LOOKED at these PNGs. The visual review is
  the operator's.
- **A run cannot start an agent.** Three independent layers refuse it: the deny
  matrix, `guard.ps1` rule 2, and `evidence-guard.ps1`. Unchanged by this run.
- **The co-author trailer cannot appear in a Bash command's text.** All three
  commits were made with `git commit -F <file>`, the message written by the
  Write tool under the gitignored `.shots/`.
- **Improving `preflight.ps1`** is still GUARD-PATH-ESCAPE-blocked, and reading
  `docs/archive/` and `docs/handoff-archive/` is still refused.

## Waiting on the operator

- **THE NINETEEN NAV VALUES ARE CONFIRMED ON THE DEVICE — 2026-09-17, by the
  operator.** That wait-list item is CLEARED. N3's "landed, unverified" is
  closed, including the 34pt-inset assumption behind `navBottomPad` = 12.
- **Everything this run landed is itself "landed, unverified" on a device.** No
  device ran it; the proof here is the offline suite and the web-export renders.
  The green [ + ] and "Your jobs" reach a phone through
  `npm run update:preview` and two app launches.
- **The visual review.** Twelve PNGs are in `.shots/plus-yourjobs/`
  (`before-`, `afterA-`, `afterB-` × customer Home dark/light, empty and
  populated). The harness is a comparison aid, not a check `npm run verify`
  runs.
- Nothing on the push: `npm run verify` exited 0 in this run, so the autonomy
  contract's one permitted push — flag-free `git push origin mainexpo` — was
  run, and the three commits are on the remote. Staging's pipeline has no work
  here: this run touches no migration and no edge function.

## Open gates

See `docs/GATES.md`. Gates 0, 1 and 2 are closed. Gate 3 is the live one. This
run ticks no box: it is design and structure work on a surface Gate 2 already
recorded as rendered and reviewed, and it puts the customer Home one render set
ahead of the 2026-09-06 review that box cites.

## Dispatch log

DISPATCH START 2026-09-17 22:17 - prompt home-plus-and-your-jobs, model claude-opus-5, effort max, mode bypass, log C:\Users\mdmah\BRAZOS\.audit-scratch\dispatch\home-plus-and-your-jobs-2026-09-17_2217.log
