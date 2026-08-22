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

