# Emerald Lux Glass — the dark redesign's system

Chosen by the operator on 2026-09-21 from three rendered directions (A Obsidian
Editorial, B Emerald Lux Glass, C Warm Charcoal Studio; the concept pages that
decided it are recorded in `docs/DECISIONS.md` that date). **Nothing here is
applied to the app.** These pages are the reference every screen will be matched
to once the operator has seen every screen drawn this way and approved them.

`lux.build.mjs` beside this file is the one source: the numbers below live there
as CSS, the screens as render functions, one `lux-<screen>.html` per screen.
`SCREENS.md` is the checklist of every current screen and sheet still to draw.

## The brief, in the operator's words

"Rebuild my entire dark mode to match my light mode and make it sexier, more
consistent, overall very well balanced." Then, on the directions: "I really like
B … keep in mind I want all of the features as they are currently, just if there
was a better way to lay it out — cleaner, subtler, luxury, like Emerald Lux
Glass." Rulings from the same sitting: **same structure as light, dark colours**
(no dark-only layout forks); **neutral / mint hairlines**, never the warm gold
line; gold stays for accents.

## The system

**Ground.** One diagonal gradient, teal-green into near-black:
`linear-gradient(165deg, #062421 0%, #0A1A17 55%, #07110F 100%)`. The app draws
it with `experimental_backgroundImage` on the screen's root, replacing the Home
atmosphere raster. No other ground.

**Glass card** (`.card`): `rgba(12,44,38,.52)` over a 18px blur, a 1px rim
`rgba(200,255,230,.20)`, a specular top edge `inset 0 1px 0 rgba(255,255,255,.16)`,
a shadow `0 10px 30px rgba(0,0,0,.35)`, radius 22. Every panel, row card, hub
tile and sheet is this one material; nothing invents a second glass.
**Inner surface** (`.card2`, fields, thumbs): `rgba(255,255,255,.06)`, radius 22
or 16 — a well inside a card, never a card inside a card.

**Ink.** `#F3F1E8` cream for text; `#A9B8B1` muted. Eyebrows are 11.5px, 700,
tracking 1.6px, uppercase, **gold** (`#E9C170`).

**Accent.** Mint `#7EE2B4` is the ONE action colour: links, glyphs in fields and
tiles, the active tab, chosen states, the chips' tint (`rgba(126,226,180,.14)`
fill, mint ink). The CTA is a mint gradient pill
(`linear-gradient(135deg,#8DF0C0,#4FC58C)`, dark ink `#062018`, 52 tall, radius
26, a mint shadow). **Gold is money only**: amounts, "EST. PAY", the greeting's
name — never a line, never a fill, never a control.

**Lines.** No hairlines inside content. A divider between rows is
`rgba(200,255,230,.10)`; the nav's and a sticky bar's top edge
`rgba(200,255,230,.16)`. Nothing warm.

**Shape and rhythm.** Radius 22 (cards, sheets), 18 (tiles, hub tiles), 16
(thumbs), pills for fields, chips and CTAs. 24 between blocks, 14–18 inside a
card, 20 side gutters. Type: Georgia for headlines (34/38 hero, 24–30 titles,
tracking −.4) and the system sans for everything else (17 titles, 15 body, 13
meta, 11–12 labels).

**Navigation.** A glass bar 84 tall (`rgba(5,24,20,.72)`, blur 24, the mint-tinted
top edge), five slots with labels, the active tab a glowing mint pill behind its
glyph; the customer tree's centre slot is the mint [+] tile. The worker tree's bar
has no centre tile (Home · Map · My Jobs · Inbox · Profile). Sticky action bars
(Send a bid, Continue, Show N jobs) are the same glass with a 34 safe inset.

**Photos.** The app's own art only (the armchair, the toolbox) — never stock, never
placeholder people. A job's photo is a 96 or 118 square at radius 16 inside its
card; a job detail's photo bleeds full width under a glass facts panel.

## Layout principles (how every screen is re-laid)

1. **The action is the hero.** Whatever the screen exists to do sits above the fold
   in a glass panel with its field and its CTA (Home's "What do you need done?",
   Submit Bid's amount, Checkout's pay button).
2. **Money pinned top-right, in gold.** On every job row, card and detail panel,
   the amount reads first; the eyebrow "EST. PAY" above it.
3. **Facts strips, not paragraphs.** When / where / bids / posted-ago are one line
   of muted meta with mint glyphs, or a facts panel of three cells.
4. **Stacked panels.** A detail screen is panels in reading order — photo, facts,
   about, the poster, the actions — never a single long card.
5. **Chips carry categories and states**, mint-tinted; a chosen pill is mint with
   dark ink; a disabled control is a flat inner surface with muted ink.
6. **Empty states are a card with the app's own words** — the row's glyph in a
   round well, the title, one line under it.
7. **Same structure as light.** The Lux page of a screen keeps every control the
   light screen has, in the same order; only what light never had (the atmosphere,
   the monogram marks) is dropped, and nothing dark-only is added.

## Honesty rules for a Lux page

- Only what the phone draws: flat fills, CSS linear gradients, blur where the app
  has a material (`ui/tokens.ts` materials), `-webkit-mask` only where the app's
  file carries that edge (the feathered heroes).
- The app's copy, verbatim (read the screen's source). The harness's four seeded
  jobs (`scripts/shots.mjs` SEEDED_JOBS), the mockup's sample detail job and — for
  the one screen that is somebody else's profile — the mockup's sample worker
  (`lux.build.mjs` WORKER: a name, a bio, categories, listed services) are the only
  invented rows; no ratings, no reviews, no completed-job counts, no fake balances.
- Every control the live screen has is on the page; "cleaner" means laid out
  better, never fewer features.
- One screen per page, `.phone[data-shot="lux-<screen>"]`; labels inside the frame
  when a page shows more than one state. A screen that scrolls past the bar keeps
  its first frame honest (the column clipped at the bar, exactly as a phone) and
  adds a second, `lux-<screen>-2`, the same column shifted up by `frames[1]` so the
  rest is seen; the sheet captions it "(scrolled)".

## Working loop (for the chat that draws the rest)

1. Read the screen's source (`screens/<Name>Screen.tsx` and the components it
   renders) and list every control and state.
2. Add a render function to `lux.build.mjs` from the primitives; add the key to
   `SCREENS`; run `node docs/mockups/html/lux/lux.build.mjs <key>`.
3. `node docs/mockups/html/shoot.mjs lux/lux-<key>.html` → `.shots/mockups/lux-<key>.png`.
4. Measure before sending: no overflow past the nav or the sticky bar, nothing
   wider than the frame but the rails (the pattern is
   `.shots/harness-blur/redesign/measure.mjs`).
5. Send the batch as a sheet (three or four phones across, captions inside) and
   the `file:///` paths; tick the row in `SCREENS.md`.
