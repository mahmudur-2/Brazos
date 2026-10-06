# The Lux remake — the After, second pass (brief for the run, 2026-09-27)

The operator reviewed the Before / After viewer (`.shots/refresh/index.html`, built by
`docs/mockups/refresh/`) and ruled: keep "BEFORE · your app today" exactly; remake
"AFTER · Lux, simpler", because it did not look like the Emerald Lux pages. Nothing in the
real app changes until the operator says "build it" — every change is made in the practice copy
(`.shots/refresh/practice`) and lands only in `docs/mockups/refresh/after.patch`.

The reference for every screen is its Emerald Lux page (`docs/mockups/html/lux/lux-<key>.html`,
system in `docs/mockups/html/lux/README.md`), with the rulings below on top. Where a ruling and a
Lux page disagree, the ruling wins.

## Rulings (the operator, 2026-09-27, in order of weight)

1. **Bottom nav bar: untouched**, everywhere, both modes. Hard rule. (Its colours stay frozen
   through `navBarPalette()`; nothing about it moves, the active-tab glow included.)
2. **Map (worker and customer), the Filters sheet and its popups: untouched** — layout, glass,
   behaviour — and their **colours pinned to today's exact values** ("Pin today's colours"), so
   the palette change cannot reach them. Their liquid-glass style (the `pane` material) may be
   reused elsewhere where it makes a screen simpler.
3. **One font.** The system face everywhere — the After Welcome's ("I like the font (keep
   this)"). No serif anywhere, although the Lux pages draw serif headlines.
4. **Gold is `#D4A24C`** (today's `brand.gold`), never the Lux `#E9C170`; "please dont change any
   gold colors besides that". Gold, in dark, on: **every field label** (Phone number, Email,
   Password, Title, Description, Category, Area…), **every small section heading / eyebrow**
   (POPULAR SERVICES, YOUR JOBS, NEEDS YOUR ATTENTION, GETTING THERE, FINAL SETUP, BEFORE YOU
   START, STEP 1 OF 4, BRAZOS MARKETPLACE…), money, and the greeting's name. Light: gold on the
   cream ground fails contrast for small text, so light keeps its emerald labels and eyebrows;
   gold stays in light where it is today (money, stars).
5. **Mint is `#4FC58C`**, everywhere the Lux pages use mint (both `#8DF0C0` and `#7EE2B4`):
   CTA fills, links, glyphs in fields and tiles, selected states. One accent, nothing brighter.
6. **The Post-a-job progress bar** keeps today's thickness and `#5FAE81`.
7. **Corner rings gone**: the contour arcs `AuthBackdrop` draws top-right leave every screen
   (Welcome, Sign in, Create account, Verify, Setup, the legal gate).
8. **The main goal: "3D pop-out" cards everywhere** — the Lux glass card: a fill lighter than
   the ground, a 1px mint-neutral rim, a specular top edge, a drop shadow
   (`0 10px 30px rgba(0,0,0,.35)`), radius 22 — for every panel, row card, hub tile and field
   group (the phone-number card and the Published summary card are the models). **Light:** a
   white card with a soft shadow (`authShadows.card`) on today's cream ground, same layouts.
   Cards are flat — no blur: on a static ground a blur adds nothing but frames. Blur stays where
   it is today (sheets, menus, the map panes).
9. **The ground** is the Lux ground, `linear-gradient(165deg, #062421 0%, #0A1A17 55%, #07110F
   100%)`, on every dark screen, the auth flow included.
10. **Copy: nothing on two lines when one line says it.** Every subtitle, hint and helper is cut
    to one line at default Dynamic Type on a 393-wide phone; what cannot be (the Media privacy
    note) gets two lines at most. Fenced sentences (the sandbox sentences, the honesty copy) are
    shortened only with the fence moved by a ruling — otherwise listed as left long.
11. **Selected chips** (category, filters, skills): the chip keeps its dark glass; the icon and
    text turn `#4FC58C` and the rim lights mint. Size unchanged from today ("keep the category
    pills current size").
12. **Icons**: the Lux line icons — the Ionicons `-outline` variants, mint — in the Popular
    services tiles and wherever the Lux page draws a line icon; every broken icon fixed, both
    modes.
13. **Flow changes from the last After stay** (`docs/dispatch/SCREEN-BY-SCREEN.md`) except
    three: the pinned Continue on Post a job (gone), the "Looking for a specific pro? Browse
    workers ›" line on Home (gone), Discover's missing back circle (back, gold). And "try to
    smart guess what my taste is": chrome that eats space and duplicates a control goes; a step
    that disappears stays gone; nothing loses a feature.
14. **Motion**: everything that does not move in the 120 Hz style is noted, screen by screen
    (`docs/dispatch/MOTION-INVENTORY.md`), and the cheap ones are added now: the "Your job is
    live" check draws itself in under a second; press scale on cards and buttons; the chip
    selection transition; the wizard progress bar; the worker's stepper.
15. **Dark and light for Setup and the legal gate** ("There is no dark mode"): both follow the
    scheme like Welcome and Sign in do, in the emerald style, today's layouts.

## Screen by screen (the operator's pictures, in their order)

1. **Welcome** — keep the After (the font, the art, the three badges, phone first, "Continue
   with phone" the main button); remove the top-right rings; "BRAZOS MARKETPLACE" gold; the
   mint lines `#4FC58C`.
2. **Sign in (phone)** — the phone-number card lifted (pop-out, shadow behind), "Phone number"
   gold; "US +1 ›" | the number; the rest as today (Continue on top of the keyboard, the
   "Instead" pill under).
3. **Sign in (email)** — one lifted card: Email (paper-plane glyph), Password (lock, eye),
   "Forgot password?" at the right under the fields inside the card; keep today's "Continue" and
   "Use phone number instead" at the bottom.
4. **The legal gate** — today's layout exactly ("Yes, today's gate exactly"): BEFORE YOU START
   / Terms & Privacy / one-line subtitle ("Read both to the end, then confirm."); the small card
   with the two documents as status rows that switch the open document; the document scrolling
   under it; the checkbox; Agree and continue; Sign out. Emerald pop-out cards, dark and light.
   (Pic 5 — "Terms of Service / Read the current agreement." — is Account & safety, shown for
   its card style; its two-row list is NOT the gate's layout.)
5. **Setup** — today's layout: Setup; FINAL SETUP; Set up your experience; These choices can
   be changed later; the Terms & Privacy row card; Start in: Hire help / Find work tiles; the
   helper line; Finish setup; Sign out. Emerald pop-out cards, dark and light; no name field
   (the Lux page's), no rings.
6. **Customer Home** — the After minus the "Browse workers" line. The Lux ground with the
   chair / lamp / plant **blended in** (a feathered-alpha bake of the hero PNG, matching the Lux
   page's radial mask; the worker's toolbox the same). "Good morning, Mahmudur" (name gold), the
   bell. "Take a task off your plate" with the THREE lines "Describe it. / Hire help. / Get it
   handled." The task card: "What do you need done?", the field with a magnifier before
   "Describe your task…" (the mic as today), the "Post a job ›" pill at **today's size and font**,
   coloured as the system CTA. "POPULAR SERVICES" as a gold eyebrow over the Lux tiles (glass,
   line icons, mint); "YOUR JOBS · View all" and "NEEDS YOUR ATTENTION · See all" as gold
   eyebrows.
7. **Discover** — the Lux "Find help" page's layout: the circle back button with a **gold**
   chevron (it goes Home, as today's `goBackOrHome`), title "Discover", no eyebrow; the subtitle
   on one line ("Describe the task, or pick a service below."); the search field's placeholder
   on ONE line, never two ("What do you need?" — or the size drops until it fits) with the mic
   and the arrow disc; POPULAR SERVICES (gold) with the glass tiles, swipeable; the big card:
   START WITH THE TASK / Describe what you need / e.g. "move a queen mattress up three flights"
   — the example alone, one line.
8. **Post a job · 1 What** — "< Home" on step 1 (it goes Home; later steps "< Describe",
   "< Media", "< Location"); "Post a Job"; "Media ›" greyed until the step is complete
   ("Link greys out + inline hint"); STEP 1 OF 4 gold; "What needs doing?"; a one-line subtitle
   ("A clear title and a few details help workers decide."); today's progress bar; TITLE with
   "Required · 0/80" right beside the label (gold label, muted count — not at the far right);
   DESCRIPTION with "Required · 0/500"; CATEGORY "Required"; chips at today's size with the rim
   + icon lighting up when selected; the reason under the blocking field ("6 more characters",
   "Pick a category"); **no pinned Continue, no footer padding**.
9. **Post a job · 2 Media** — today's layout, no Continue; the privacy note at most two lines
   ("Avoid faces, documents, plates, addresses and other personal details."); "A short clip
   explains an awkward job fast." on one line.
10. **Post a job · 3 Where, · 4 Review** — the same treatment; Publish stays on the last step as
    today (the last-step footer), coloured as the system CTA; the summary card is the pop-out.
11. **Your job is live** — the check draws itself (< 1 s, 120 Hz); the summary card pop-out
    (the operator's pic 17 is the model for every card).
12. **Every other screen (68 in the viewer)** — its Lux page's layout under these rulings, the
    kept flow changes, the one-line copy rule, the pop-out cards.

## Mechanics

- Work in `.shots/refresh/practice` (it holds the last After). Never the working tree.
- Tokens first: `ui/tokens.ts` dark palette and `lib/theme.ts` — gold `#D4A24C`, mint
  `#4FC58C` as `emerald` and as the CTA, the ground, the card material; light: white cards +
  `authShadows.card`, today's cream ground.
- One card primitive: `Surface` with a flat `card` material (the `pane` numbers minus blur; the
  Lux rim, specular edge and shadow), used by every card; its light spec white + shadow.
- Pin Map / Filters: a frozen palette copy for `MapScreen`, the customer map, `JobFilterSheet`,
  `PickerPopover`, `PeekSheet` (like `navBarPalette()`), so today's values survive the change.
- `AuthScaffold`: drop the backdrop rings; draw the ground gradient.
- The hero bake: a node script on `pngjs` (in `node_modules` already) writes
  `assets/prestige/hero_armchair_customer_lux.png` (and the worker toolbox) with the Lux radial
  mask baked into alpha (ellipse 80% × 86% at 60% / 48%, solid to 45%, clear at 100%); the
  BAKED_ART fence in `tests/themeResolution.test.mjs` moves to the new files with the ruling.
- Copy pass: from the export's text dumps, every string that wraps at 393 wide is listed, then cut.
- Motion: `docs/dispatch/MOTION-INVENTORY.md`; the check through the motion boundary
  (`lib/motion120`: Reanimated where present, `Animated` fallback) as two strokes drawn in
  sequence — no new dependency (there is no SVG library, and a new dependency is a stop).
- Verification, every batch: practice `npx tsc --noEmit --pretty false --noUnusedLocals
  --noUnusedParameters`; `node --test` on the practice tests (all but `safety` and `governance`);
  `node docs/mockups/refresh/export.mjs after`; `prepare.mjs before after`;
  `validate.mjs after dark` and `light`; the `screens.js` notes rewritten for the new After;
  `make-patch.mjs` → `docs/mockups/refresh/after.patch`; in the real repo `git apply --check
  --ignore-whitespace` and `npm run verify`.
- Evidence: launched with the guard's image authorization (`BRAZOS_EVIDENCE` containing
  `images`), the run compares every After screenshot (`.shots/refresh/after/*.png`) with its Lux
  page by eye; launched without it, only the text / box / colour dumps, and the report says so.
- The end: the viewer reopened at `.shots/refresh/index.html`, HANDOFF rewritten, docs
  committed by path, `npm run verify` green, `git push origin mainexpo`, one mobile push.
