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

