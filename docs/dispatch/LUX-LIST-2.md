# LUX-LIST-2 — the operator's next list of changes to the After (brief; BUILT in the practice copy 2026-09-29 — §4)

Started 2026-09-28, right after LUX-LIST-64 landed (`03b5e15`), in a list sitting like the one
that wrote `docs/dispatch/LUX-LIST-64.md`: the operator sends changes one at a time; each is
confirmed ("make sure you understand 100%"), written here, and every seven the whole list goes
back to the operator (every five in the first chat; the second chat moved it to seven). NOTHING is
built during the sitting ("dont rebuild it yet"; the second chat: "nothing gets built in actual
app live code (all in html references for now)") — except item 1, which was already applied
before that instruction arrived, and items 2 and 5, which the operator had applied from a separate
chat ("Add it to the list"; for 5, "build it out in the app" → "The After, in the viewer"); their
STATUS lines say so.

## 1. Boundaries and how to run (as LUX-LIST-64 §1, unless the operator moves them)

- Build ONLY in the practice copy `.shots/refresh/practice`. The Before stays exactly as it is;
  the real app's code does not change. The After reaches the repo only as
  `docs/mockups/refresh/after.patch`, applied only when the operator says "build it".
- First check: `node docs/mockups/refresh/make-patch.mjs` then
  `git status --short docs/mockups/refresh/after.patch`. At `03b5e15` the expected differences
  are items 1, 2 and 5 (all three already in the practice copy — 5's eight new files sit in its
  `assets/prestige/`, which the patch does not carry); anything else means the practice copy
  moved.
- Rule 0: pictures point at the problem; the references build the fix. Rule 0b: every change
  applies to light mode too — only colours differ. Everything feels 120 Hz. No new dependency.
- FASTER, SAME QUALITY (the operator, 2026-09-28: "these runs are taking wayy to much time..
  architect these in a way where it does 99% but significantly less time, without sacrificing any
  quality / accuracy"; popup: "Yes, parallel helpers"). The run goes in three phases:
  1. SHARED FIRST, the lead alone: every item that crosses areas (tokens, shared components such
     as #3's sheet presenter, fences) — built, `tsc`, its fences, exported, its screens rendered
     and looked at. The practice copy is then snapshotted as the helpers' baseline.
  2. PARALLEL HELPERS, one per area (sign-in, Home, Post a Job, Inbox, …), each in its own copy
     of the baseline (`node_modules` joined by a junction, as the practice copy's is), each owning
     a DISJOINT set of files written in §6 before any helper starts — items that share a file
     share a helper. A helper builds its items, runs `tsc` and only the fences its files touch,
     exports ITS copy to its own folder, renders only its screens in BOTH schemes and looks at
     them, then hands back one diff from the baseline.
  3. THE ONE FULL GATE, the lead: the diffs applied (disjoint, so no conflicts; any overlap is the
     lead's to merge), then everything the old run did once: full `tsc`, full `node --test`, one
     export, all 71 screens validated in both schemes, every changed screen shot in both schemes
     and looked at on contact sheets, the truncation probe, `make-patch.mjs`, `git apply
     --check`, the real `npm run verify`, DECISIONS, HANDOFF, commit, push, one phone push.
  - Renders run 4–6 pages at once in ONE browser (never several browser jobs at once — HANDOFF's
    rule); pages wait on the app's arrival signal, not on fixed sleeps; a page that times out is
    retried alone. The full 71 × 2 validation happens once, at the end — never per batch.
- Answer the operator by item number. One mobile push at the end of the run.

## 2. Pictures

`.shots/refresh/brief-pics-2/` (gitignored), named by item: `1a.webp`, `1b.png`, … `3a.png`,
`4a.webp`–`4c.webp`, #5's `5a-…`–`5h-…`, `6a.png`–`6e.png`, `7a.png`–`7c.webp`, `8a.png`, `8b.png`,
`9a.png` (#9's reference: `.shots/refresh/dd/cc-dark.png`, `cc-light.png`).
The Before/After references: #6 `.shots/refresh/depth/index.html`, #7
`.shots/refresh/profile/index.html`, #8 `.shots/refresh/notif/sheet-dark.png` / `sheet-light.png`. `q-86641A.png` is the operator's question that became #4 (the legal gate's
"BEFORE YOU START", Before green beside After gold). The `#86641A` sheet and its data:
`.shots/refresh/antique/` (`sheet-1..3.png`, `spots.json`), made by `.shots/refresh/antique-scan.mjs`
+ `antique-sheet.mjs` (the scan reads `.shots/refresh/after/`; the sheet above was made from the
snapshot `AQ_DIR=after-aq`, #1's After, while a separate chat was rebuilding the practice copy).

## 3. The list

**1.** LIGHT MODE ONLY (confirmed by the operator) — three more spots leave the gold `#C8A15B` for
the green `#064C3B` (#47's rule, the `mark` role: `#064C3B` in light, the gold `#D4A24C` in dark,
so dark does not move), from the operator's marks on the #47 gold sheet:
- Profile details (`details`): the "Edit profile" outline pill — its rim, its pencil and its
  word — and the JOB CATEGORIES chips ("Furniture Assembly", "Handyman/Repairs") — rim and
  word. `screens/ProfileDetailsScreen.tsx`: the pencil's colour, and the shared `chip` /
  `chipText` styles.
- Welcome (`welcome`): the "BRAZOS MARKETPLACE" wordmark. `screens/WelcomeScreen.tsx` `eyebrow`.
- Everything else on the sheet STAYS gold: the Welcome's three badges, the sign-in buttons'
  rings and glyphs, rating stars, the client job detail's badge ring, toggle knobs, "Break the
  ice", the Map.
- This reverses two of #47's "stay gold" entries (the Profile details category chips; the
  Launch wordmark) — record in DECISIONS with the date.
- STATUS: already applied in the practice copy on 2026-09-28 — `ProfileDetailsScreen.tsx` (pencil,
  `chip`, `chipText` → `colors.mark`), `WelcomeScreen.tsx` (`eyebrow` → `colors.mark`), and the
  fence `tests/rimLight.test.mjs` moved with a dated ruling (the eyebrow's colour → `colors.mark`).
  Practice `tsc` clean, `node --test` 1282/1282, the After exported and 71/71 in both schemes.
  Now in `after.patch`, DECISIONS 2026-09-29 and the viewer notes since the list run (§4). (pics 1a, 1b)

**2.** BOTH SCHEMES (the operator's pick from drawn options, in a separate chat) — the auth
buttons' full pill softens to radius **22**, still 52 tall. The operator, on the sign-in phone
screen, Before (58 tall, radius 22) beside After (52, #6's pill at 26): "i feel as though this is
too circular... is there like a middle ground between the 2?" Options were drawn at the app's
height, border and light colours — Now 26 · a 24 · b 22 · c 20 · d 18 · Before 58/22 — and the
operator picked **b · 22**, the halfway point: 8 pt of straight side on the 52 height, where the
pill has none and the old 58/22 had 14.
- ONE shape on every auth button — launch, sign-in, sign-up, verify, legal, setup, the outlined
  "Use … Instead" included: `lib/authTheme.ts` `authRadius.button` and `authRadius.heroButton`
  26 → 22. Every one reads them through `components/AuthButton.tsx`; the Welcome's rim light
  follows `authRadius.heroButton`. Heights stay 52 (#6).
- This softens LUX-LIST-64 #6 ("fully round") — record in DECISIONS with the date, as the
  operator's order.
- STATUS: already applied in the practice copy on 2026-09-28 (the separate chat) —
  `lib/authTheme.ts` (`authRadius.button` and `authRadius.heroButton` → 22),
  `components/AuthButton.tsx` (the stale "58 tall at radius 22" prop comment → 52), and the fence
  `tests/rimLight.test.mjs` moved with a dated ruling (`heroButton: 26` → `22`, and the base
  `button: 22` pinned beside it). Practice `tsc` clean, `node --test` 1282/1282, the After
  exported and 71/71 in both schemes. Measured by `.shots/refresh/probe-auth-radius.mjs`: 28
  auth buttons on the eight auth screens, both schemes, every one 52 tall at corner 22, 0 misses
  (the legal gate's and Setup's in-card rows read no auth token and keep their square corners).
  Before beside After: `.shots/refresh/r22/signin-phone-sheet.png`. Now in `after.patch`, DECISIONS 2026-09-29 and the viewer notes since the list run (§4) — the eight auth
  after-notes in `docs/mockups/refresh/screens.js` say "52 tall, corners 22".

**3.** EVERY SLIDE-UP SHEET, BOTH HOMES, BOTH SCHEMES (confirmed by popup) — the shadow (the dim
scrim behind a sheet) stops rising with the sheet. The operator, tapping "View all →" beside
POPULAR SERVICES: "it animates by bringing the shadow up while it goes up... it looks off.. i want
the shadow to be instant the second you click". The cause: each of these is a
`<Modal transparent animationType="slide">` with the scrim INSIDE the sliding content, so the dim
travels up the screen with the card — mid-slide the top of Home is still bright (pic 3a).
- WANT, opening: the moment of the tap, the WHOLE screen dims at once — no fade, no travel, the
  same darkness as today — and only the card slides up.
- WANT, closing (popup: "Goes at once"): the dim disappears the moment the close begins — Close /
  X, a tap on the dim, Android back, or picking a row — then the card slides down, then the Modal
  unmounts.
- WHERE (popup: "Every slide-up sheet"): `components/ServicePickerSheet.tsx` (All services, both
  Homes — both `HomeScreen.tsx` and `WorkerHomeScreen.tsx` mount it), `components/CreateSheet.tsx`
  (the [+] Create sheet), and `ui/primitives/Sheet.tsx`, which carries Filters
  (`JobFilterSheet.tsx`), Hire again (`HireAgainRow.tsx`), the Map's cell sheet (`MapScreen.tsx`)
  and `TranslationSheet.tsx` (dark flag). NOT in scope: the ones that fade today (`ActionSheet`,
  the dialogs, the viewers, the dropdowns).
- HOW (the run's detail): the Modal stops animating (`animationType="none"`); the scrim renders
  full-screen from the first frame; the card animates its own translateY on the native driver
  (Reanimated 4, or `Animated` with `useNativeDriver: Platform.OS !== 'web'`) at today's slide
  timing — 120 Hz, nothing on the JS thread per frame. Sheet.tsx's MOTION1 frost (`BlurLayer`,
  over the scrim) is part of the dim: instant in, instant out. Reduce Motion: the card fades in
  and out briefly instead of sliding; the dim is instant either way.
- UNCHANGED: the dim's colour and strength (D7 `scrimInDark`, the `sheet.backdrop*` dials), tap
  the dim to close, the card's size, look and contents.
- Check: one shared way to present a sheet (#64's "one way to close sheets") — the three files
  should get the fix from one place, not three copies (P3-31). The viewer cannot show motion; the
  phone walk can (open and close All services, [+], Filters, Hire again, the Map sheet).
- STATUS: BUILT 2026-09-29 (the list run) — `hooks/useSheetPresence.ts`, read by
  `ServicePickerSheet`, `CreateSheet` and `ui/primitives/Sheet.tsx` (Modal `animationType="none"`, the
  dim rendered only while open, the card a native-driver translateY; a fade under Reduce Motion).
  The motion itself is the phone's to see.
  (pic 3a)

**4.** LIGHT MODE ONLY (the operator's boxes on the `#86641A` sheet, then four popups) — LUX-LIST-64
#48 is mostly reversed: the small labels go back to the green `#0D6B52` (the light eyebrow before
#48), and 25 labels keep the antique gold `#86641A`. The operator, on the legal gate's "BEFORE YOU
START": "i might've made a mistake and need to reverse into a #0D6B52 green again not sure so just
show me all right now in light mode" → the sheet of all 85 labels, NOW beside IF GREEN
(`.shots/refresh/antique/sheet-1.png` … `sheet-3.png`) → "every section i didnt rectangle... you
can switch to green ... Just make sure the consistency is there as well as visual appeal" → the
boxes redone: "i rectangled which ones I want kept gold", "everything under blue line stays gold"
→ four consistency popups, each answered "match".
- STAY `#86641A` — 25 labels, on EVERY screen each appears:
  - Customer Home: POPULAR SERVICES (also on Discover and Discover · a category), NEEDS YOUR
    ATTENTION, YOUR JOBS, HOW BRAZOS WORKS, NOT PUBLISHED YET (the draft card on Home and My Jobs).
  - Discover: HIRE SOMEONE AGAIN; START WITH THE TASK (popup: match its neighbours).
  - Post a Job, Review: MAX BUDGET; PRICE, the same field under "Set a price" (popup: match).
  - My Jobs: DRAFT (customer), PENDING BIDS (worker).
  - Worker Home: NEEDS YOU; AVAILABLE JOBS (popup: gold like the Homes' headings).
  - Worker job detail: EST. PAYOUT AFTER FEE, TAKE IT AT THE LISTED PRICE.
  - Bids: YOU'RE BIDDING ON and YOUR BID (USD) (Submit a bid); COUNTERING and YOUR COUNTER-OFFER
    (USD) (Counteroffer — popup: match the worker's twins).
  - Hired job: YOUR PROGRESS and PAYMENT PROTECTED (the worker's job); JOB PROGRESS and PROTECTED
    PAYMENT (the customer's job and Track worker — popup: match the worker's twins); YOUR STATUS
    (Route & arrival).
  - Earnings: LEDGER.
- GO GREEN `#0D6B52` — the other 60: BEFORE YOU START · WORKERS TO CONSIDER, WORKER PROFILE · the
  worker's category tags (FURNITURE ASSEMBLY, HANDYMAN — public profile, Profile, Edit profile) ·
  Post a Job's STEP N OF 4, TITLE, DESCRIPTION, CATEGORY, AREA OR NEIGHBORHOOD, SERVICE ADDRESS,
  JOB SUMMARY, MEDIA, AREA, TIMING, ADDRESS (PRIVATE), BUDGET (on every screen), PUBLISHED, WHAT
  HAPPENS NEXT · My Jobs' YOU POSTED, YOU'RE WORKING · the customer's job pages' JOB SCOPE, TIMING
  & ADDRESS, WORKER OFFERS, BID, WHO YOU'D BE HIRING, THEIR PITCH, ASSIGNED WORKER, WHERE THINGS
  STAND, SCHEDULED WINDOW, PAYMENT, WORK EVIDENCE, AFTER · FINISHED WORK, HELD PAYMENT · Worker
  Home's TAKING NEW WORK, NEARBY DEMAND · SIMILAR OPEN JOBS · PITCH · GETTING THERE · Earnings'
  PENDING, AVAILABLE, TRANSFERRED tags · WHAT HAPPENED? (OPTIONAL) · YOU'RE IN CUSTOMER / WORKER
  MODE · Profile details' SHARED IDENTITY, JOB CATEGORIES, PROOF OF WORK · Edit profile's FULL NAME,
  LANGUAGE, BIO (OPTIONAL), JOB CATEGORIES (OPTIONAL) · ACCOUNT & SAFETY, SAFETY PRINCIPLE · THEME
  · PAYMENT PROTECTION, FUNDING SOURCE · SAVED, WORKED FOR YOU BEFORE · ACTIVE JOB.
- UNCHANGED: dark — every label keeps `#D4A24C`. The look-alikes, a different colour ("everything
  under blue line stays gold"): the Assigned pill and its dot `#8A6414`, "On the way", the live
  bar's dot, "Bids Pending (2)" and Delete account's warning box `#9A5B1E`. Also the red Sonar dots
  (#49), #1's `mark` spots, and the sign-in field labels (#1–#3's own green).
- HOW (the run's detail): the light `eyebrow` role (`ui/tokens.ts`, `#86641A` since #48) returns to
  `#0D6B52`; a second role (e.g. `eyebrowGold`: light `#86641A`, dark `#D4A24C`, so dark never
  moves) is what the 25 read. Where one shared piece draws both kinds — My Jobs' `SectionHeading`
  (DRAFT, PENDING BIDS gold; YOU POSTED, YOU'RE WORKING green), `TextField`'s label (the two
  amount labels gold; TITLE, PITCH green) — the call site picks the role through a tone prop,
  never an `isDark` fork. Fences that pin the eyebrow's light value move with a dated ruling.
- This reverses most of LUX-LIST-64 #48 — record in DECISIONS with the date and the 25.
- ACCEPTANCE: re-run `.shots/refresh/antique-scan.mjs` on the new After — exactly these 25 in
  `#86641A` and the 60 in `#0D6B52`; a dark run shows every label unchanged.
- STATUS: BUILT 2026-09-29 (the list run) — `eyebrowGold` in `ui/tokens.ts` / `lib/theme.ts`, the
  25 call sites on it, the light `eyebrow` back to `#0D6B52`; ACCEPTANCE in §4.
  (pics 4a = sheet 1, 4b = sheet 2, 4c = sheet 3, with the operator's boxes)

**5.** BOTH SCHEMES (the operator's pick from rendered options, in a separate chat) — the customer
Home's hero art becomes the operator's two cut-outs, "Lamp-lit" (option c). The operator, sending
a light scene (sage armchair, brass lamp, plant in a brass pot) and a dark one (deep-emerald
armchair, brass lamp, dark plant in a black pot): "is there a way to kind of blend these into the
home customer screen....if so how would it look?" Four options were rendered on the REAL After
Home (the art swapped into the export, dark and light): a swap, b grounded (a floor shadow), c
lamp-lit (the shadow plus the lamp's warm glow), d lamp-lit and bigger, bleeding off the right
edge. The pick: **c** — "can u use these high quality pictures?" Yes: every render and the build
start from the operator's own 1254 × 1254 files.
- WHAT: dark draws the dark cut-out, light the light one (both WebP with a transparent ground).
  No room box any more — the objects stand on the Home's own ground, a soft floor shadow under
  the chair, pot and lamp base, and behind the lamp a warm pool of its light. Today's baked room
  scenes (`hero_armchair_customer_lux.webp`, `hero_armchair_customer_light.webp`) retire.
- WHERE: `screens/HomeScreen.tsx` — the `homeHeroArt` image and the `HERO_ART_*` constants —
  in today's spot: the art's ink 156 pt tall, its right edge at 390 pt and its bottom at 292 pt
  on the 393-pt screen (the ink starts at x 241 dark / 245 light; today's at 244.6). The headline
  column and every other box on the screen stay where they are.
- THE LOOK, as rendered (`.shots/refresh/blend/options.mjs`, option c): the glow — a radial
  gradient on the lamp's opening, dark `#E9C170` at .30, light `#F2C77B` at .20, fading to 0 over
  560 / 520 source px, 1.15× as tall as wide. AS BUILT, two polish steps past the render (the
  operator: "the blend in looks most natural and no one can really tell its an png image"):
  (1) SOLID IS SOLID — the cut-outs never reached full opacity (87% of their ink sat at alpha
  240–253), so everything from 232 up became 255 and the soft edge below scaled by 255/232;
  (2) CONTACT, NOT A BAND — option c's shadow (the silhouette squashed onto one base line) left
  the front-left leg floating 6 pt above its shadow in the three-quarter view; the built shadow
  is a tight dark core under each leg tip, the pot's base and the lamp's disc (found on the
  files by `.shots/refresh/blend/feet.mjs`) plus one soft pool under the chair's footprint —
  chosen over the band and over both from renders inside the built Home
  (`.shots/refresh/blend/shadow-variants.mjs`, `shadow/sheet.png`). The edge fringe was measured
  and needs no defringe (4.7 / 0.4 levels off the edge it borders, on average).
- THE SIZE SWEET SPOT (the operator: "whats the sweet spot where i dont lose quality / crispness
  but want the size of file / app / repo to be small as possible"; then "I think 92"), measured
  (`.shots/refresh/blend/encode.mjs`, `split.mjs`, `diffmap.mjs`, `build-assets.mjs`):
  - Pixels: 3× the drawn size. More is invisible on every iPhone; 2× is visibly soft on a 3×
    phone (pic 5f).
  - The art: WebP **q92** (the operator's number) — dark 50.3 KB, light 56.8 KB, both 450 × 468
    (the solid interiors made the alpha cleaner and the files smaller than the q92 estimate).
  - The glow and the shadow are their OWN small layers the phone stretches, one exact colour at
    varying opacity (the PNG written by the builder itself — Chromium's export un-premultiplies
    faint pixels into noisy colours): glow 65 × 99 px, 1.4 / 1.1 KB; shadow 274 × 72 px (2 px/pt,
    for the contacts), 2.4 / 2.3 KB.
  - So 54.1 KB for dark, 60.2 KB for light, **~114 KB in the app for both** (today's two hero
    files: 52 KB — but drawn at 2.2×, soft on a 3× phone).
  - App: only what the code requires ships (`app.config.ts` has no `assetBundlePatterns`).
    Repo: the roster fence REQUIRES a same-size PNG master beside every WebP mount (it measures
    the bake on the master), so the two masters come too (255 + 267 KB) — and with them the
    operator's 1254-px originals need not be committed (the masters hold everything the app will
    ever show). Delete the six retired armchair files (563 KB) by hand in the build —
    `make-patch.mjs` cannot delete — and the repo ends roughly where it started.
- GEOMETRY AS BUILT (screen pt, 393 wide; each box shared by both schemes, the FILE the only
  fork): the art 240..390 × 136..292 (`HERO_ART_DARK` { width 150, height 156, right -17, top 74 },
  `resizeMode="cover"` on a file of the box's own aspect, so nothing crops); the glow 263..393 ×
  78..276 (`HERO_GLOW`); the shadow 256..393 × 264..300 (`HERO_SHADOW`); `HERO_ART_INK_LEFT` 0.08
  (measured 0.073 dark / 0.087 light on the headline's rows) — the headline column 232 pt for a
  217-pt widest line. Measured in the built page: all three boxes land to the point, both schemes.
- FENCES (practice copy, each with a dated ruling, never weakened): `tests/themeResolution.test.mjs`
  — the roster swaps the two room scenes for the two cut-outs ('transparent', gated, PNG masters)
  and adds the four soft layers under a new word, `soft-layer` (RGBA, fades to 0, NO fully opaque
  sample — pinned in the hero sweep, which now measures seven); the floors rise with the roster
  (non-opaque 10 → 14, gated 2 → 6, gate-scan mounts 2 → 6). `tests/emeraldFences.test.mjs`
  home(14) — the box bands 184 / 162 / 70 → 150 / 156 / 74, the overhang 13 → -3 (a cut-out has
  nothing to bleed), and the ink readings on the mounted masters. `tests/postJobPublish.test.mjs`
  — the light-hero gate follows the file (`hero_armchair_customer_lamp_light`).
- STATUS: APPLIED in the practice copy on 2026-09-29 (the separate chat): `screens/HomeScreen.tsx`,
  the three fences above, and EIGHT new files in the practice copy's `assets/prestige/` —
  `hero_armchair_customer_lamp_{dark,light}.webp` + their `.png` masters,
  `hero_armchair_customer_glow_{dark,light}.png`, `hero_armchair_customer_shadow_{dark,light}.png`
  (copies in `.shots/refresh/blend/final/`, rebuilt by `.shots/refresh/blend/build-assets.mjs`).
  Practice `tsc` clean, `node --test` 1282/1282, the After exported and 71/71 in both schemes;
  `.shots/refresh/blend/verify-home.mjs` — the three layer boxes exact in both schemes, the hero
  within 1–2.6% of the approved render (outlines and the new shadow), the close-ups at 3×
  (`verify/zooms.png`) with no halo and every foot on its shadow. THE BUILD RUN MUST COPY THE
  EIGHT FILES into the real `assets/prestige/` (`make-patch.mjs` carries no `assets/`, as with
  LUX-LIST-64's glyphs). Now in `after.patch`, DECISIONS 2026-09-29 and the viewer notes since the list run (§4). (pics 5a, 5b = the
  operator's originals; 5c, 5d = the options, dark and light; 5e = c on the whole Home; 5f = the
  quality ladder; 5g = the built Home, both schemes; 5h = the built close-ups)

**6.** EVERY SCREEN, BOTH MODES, BOTH SCHEMES (confirmed by popups and a Before/After reference) —
cards, tiles, icon squares and status pills get the "3D" look of the sim and the Lux mockups. The
operator, boxing the sim Home's search card and tiles and lux-myjobs' job card beside today's Home:
"it doesnt look as well built currently but look at … sim.html and … lux-myjobs.html — you can
see it looks more 3d and more high quality built and looks more polished" (pics 6a–6c). Popups:
every screen, both modes; the pieces = cards, tiles and icon squares, chips and small pills — NOT
the buttons ("Keep them flat"); "I also see before and after.. in a html reference... so its
most accurate" → the reference `.shots/refresh/depth/index.html`; the pick "B lit but (maybe just
a tiny bit lesser dial on the lit)"; then, on the top edge: "first one is from the sim / og
mockup i like that still of top better... even ur rendered images have the weird overlapping line
on top + i cant see if the top is like slightly bigger aswell" (pics 6d, 6e) → fixed in the
reference and confirmed ("Yes, add it"). Names inside the tiles; status pills only; light too.
- WHY the Lux numbers alone were not enough: the After's cards already carry the Lux fill, rim and
  shadow (measured, `.shots/refresh/depth-compare.mjs`); "Lux exact" (option A) came out FLATTER
  than today's search card, which has a lit wash. What was missing: the Lux top edge (today's is
  a straight strip that pokes into the corners), a lit fill on every card and tile, and filled
  status pills.
- DARK — every card and glass bar (job cards, the search card, How Brazos works, the live bar,
  settings groups, job-page panels; `Surface`'s card material and every hand-styled card):
  - fill: the lit wash `linear-gradient(180deg, rgb(15,46,39) 0%, rgb(11,33,28) 100%)` over
    `rgb(11,33,28)` — today's search-card wash (top `rgb(17,52,44)`) at 70% of its lift, the
    operator's "tiny bit lesser";
  - rim: 1pt `rgba(200,255,230,0.20)` (the Lux `--rim`);
  - top edge: the Lux `inset 0 1px 0 rgba(255,255,255,0.16)`, drawn IN the card's `boxShadow`
    beside today's drop shadow `0 12px 34px rgba(0,0,0,0.42)` (unchanged). It follows the corner
    arcs and makes the top read ~2pt, like the mockup (RN 0.81 draws inset box shadows on the
    new architecture; the web draws the same CSS). REMOVE today's straight strip —
    `ui/primitives/Surface.tsx`'s `highlight` View, 1pt at top 0 inset by half the radius — the
    "weird overlapping line".
  - radius unchanged; no blur (ruled out before: "on a static ground a blur adds nothing but
    frames").
- DARK — tiles and icon squares (the service tiles, the category squares on job cards, the icon
  squares of Profile's rows): the same fill, rim and top edge; tiles keep today's drop shadow.
- THE SERVICE TILES (both Homes and Discover — every row `components/ServiceTileRow.tsx` draws):
  the name moves INSIDE the tile, under the icon — the sim's `.tile`: a column, gap 6, the name
  12/600, up to two lines ("TV mounting" wraps; the tile stays 73). The icon stays 30 (#12). The
  row is a horizontal scroller, which clips its content, so it gets 16pt of bottom padding to keep
  the tiles' shadows whole (without it the reference showed a hard band under the row).
- STATUS PILLS (Open, Assigned, In progress, Completed, Review work, …): no outline; the fill is the
  pill's own colour at .14 (the Lux `.chip`); the text is unchanged. Chips you TAP — days, arrival
  windows, categories, filters, the Inbox filter pills — keep their outline (the Lux `.seg .p`).
  This drops the rim from LUX-LIST-64 #20 (Assigned: text + rim) and #46 (In progress: rim .55,
  fill .09) in dark.
- LIGHT — cards: `linear-gradient(180deg, #FFFFFF 0%, #F9F8F3 100%)` over `#F9F8F3`, rim 1pt
  `rgba(13,107,82,0.14)`, shadow `0 10px 30px rgba(16,38,29,0.105)` (the Lux light card); no top
  edge (white on white). Tiles and light icon squares: the same fill and rim, shadow
  `0 6px 16px rgba(16,38,29,0.08)`. A category square filled with its category colour under a
  white glyph (the light job cards' blue Handyman, slate, …) keeps its colour — never glassed.
  Status pills are already a filled tint in light; only their near-invisible rim goes.
- BUTTONS unchanged — flat. This also answers the question carried since DECISIONS 2026-09-27
  review (9): the Lux "Post a job" gradient is declined.
- THE REFERENCE (local; `node .shots/refresh/depth-ref.mjs` then `node .shots/refresh/depth-page.mjs`
  regenerate it): the real After restyled in place with only what the phone can draw. The pick is
  RECIPES `S` in `depth-ref.mjs` (dark and light); names inside = the `IN` shots; the top-edge
  close-ups `edge-home.png` / `edge-myjobs.png` stack the og mockup, today and the pick at 3×;
  A / B / C stay on the page for the record. Numbers: dark from `docs/mockups/html/lux/
  lux.build.mjs` SYSTEM_CSS `.card` / `.tile` / `.chip` plus the After's own wash and shadow;
  light from the Lux light pages (`docs/mockups/html/lux/modes/*.light.html`, untracked — the
  numbers are copied here).
- HOW (the run's detail): one implementation (P3-31) — the card material and `LitSurface` carry the
  wash, rim and edge, and hand-styled cards read the same tokens; the reference found them by shape
  (cards: radius 16–30, ≥ 200 wide, bordered or glass; tiles: radius 10–20, square, 40–100),
  which is a good census for the run. Fences that pin the card material, the highlight strip or
  the pills' rims move with a dated ruling. DECISIONS: the pick, the dropped strip, the pills'
  rims (#20, #46), the declined gradient.
- ACCEPTANCE: the reference's classifier run on the new After finds every card and tile with the
  rim and the inset edge, no 1pt strip left in any card, no visible rim on a status pill; the
  top-edge close-ups match the og mockup's; both schemes. PHONE: scroll long lists (My Jobs,
  Available Jobs) at 120 Hz with the inset shadows on.
  (pics 6a = the sim Home, boxed; 6b = lux-myjobs, boxed; 6c = today's Home; 6d = the sim's top
  edge; 6e = the reference's first B with today's strip)
- STATUS: BUILT 2026-09-29 (the list run) — `ui/tokens.ts` `litCard` + the card material's `wash`,
  `ui/primitives/Surface.tsx` (the strip gone; one `boxShadow` with the inset edge),
  `litCardStyle()` on every hand-styled card, tile and dark category square, the tiles' names
  inside, the status pills' fills; ACCEPTANCE in §4.

**7.** THE PROFILE TAB, BOTH MODES, BOTH SCHEMES (confirmed by popups and a Before/After reference) —
rebuilt on the sim's Profile, made simpler, nothing lost. The operator, sending the sim's Profile:
"i like the sim's profile tab... it look simpler... Check the html.... and let me know if there's
a even better / smarter / simpler way to architect everything out to look as clean as possible
without losing any feature" (pic 7a); then, on the first render, boxing rows to "drop down"
like Worker tools — "im trying to make this as easy to navigate / easiest to change things the
smoothest way … But im not 100% sure if it would be a smart move... let me know what you think
first?" (pics 7b, 7c) → advice given (a dropdown suits small, finite things; a full page or a
list of people stays a screen) and every recommendation taken. The reference:
`.shots/refresh/profile/index.html` — TODAY is the real After, full length; NEW is drawn with
the After's own ground, font, Ionicons and colours, #6's card look and the sim's list sizes
(regenerate: `node .shots/refresh/profile-ref.mjs` then `node .shots/refresh/profile-page.mjs`).
- TOP: the title "Profile", big on the left (#27; popup). No header pencil — ONE edit button,
  the "Edit" pill on your card ("Edit", not "Edit profile", so the name fits: 17/700 in 176pt,
  measured).
- YOUR CARD, FIRST (popup: "You first"): photo or initials (#25), 52; your name; "★ No reviews
  yet", or the rating and count once there are reviews (tap → the reviews, today's gated link);
  "View profile ›" in the accent. Tapping the card opens Profile details, which already shows
  what leaves this screen: "1 completed", "Member since", and the past work (PROOF OF WORK). So
  there is no separate Profile details row, and the hub's "Past Work" block goes.
- THEN THE MODE ROW: a round swap icon, "You're in Customer mode", "Switch to Worker · confirms
  first", chevron (the confirm is today's).
- WORKER ONLY, next: today's "Complete your worker profile — N of 5" checklist, unchanged — it
  shows only while a step is missing.
- SECTIONS, each an eyebrow over one card of rows (row: 22 icon, 16/700 title, 12 sub, chevron;
  rows 14/16 padded, a hairline between):
  - YOUR PROFILE — customer: Saved & past workers, with the people's faces and names in the row
    ("Sam and Priya": two 30pt initials faces, overlapping 6) → its screen. Worker: Services &
    availability.
  - MONEY — customer: Payment methods. Worker: Earnings & payouts, then Payment methods.
  - NOTIFICATIONS — ONE row, "Notifications", with the unread count → the feed; a settings
    button at the top of the feed opens Notification settings (popup: "One row, settings
    inside"). The two rows today (Notification feed, Notification settings) become this one.
  - ACCOUNT — Account & safety · Appearance, with Light / Dark / Auto RIGHT IN THE ROW (a
    3-way switch: one tap, nothing opens; the selected one filled like My Jobs' Active pill) ·
    Legal, a DROPDOWN that opens in place to Terms of Service and Privacy Policy (each opens its
    document) · Contact support (today's mail link) · Worker tools (customer) / Customer tools
    (worker), a DROPDOWN that opens in place to the other mode's rows — Services & availability
    and Earnings & payouts / Saved & past workers. Nothing is deleted (popup: "Behind one
    expandable row").
  - SIGN OUT at the bottom, a quiet red outlined button that confirms first — the only place it
    lives (popup: "Only at the bottom").
- ACCOUNT & SAFETY, after the move: keeps "Private by default", the SAFETY PRINCIPLE card and
  Delete account. Payment methods, Appearance, the two legal rows and Log out all leave it (each
  has its place on the hub), and so does its second mode switch.
- ICONS: plain icons in the accent — mint `#4FC58C` dark, green `#064C3B` light (#47) — not
  today's gold icons in outlined squares (popup: "Plain mint, like NEW"). The section eyebrows
  follow #4: gold `#D4A24C` in dark, and in light the green `#0D6B52`, since they are not among
  #4's 25.
- MOTION: a dropdown opens and closes in place with a short height and fade animation on the
  native driver; its chevron turns. With Reduce Motion it opens at once.
- HOW (the run's detail): `screens/ProfileScreen.tsx` (the hub: `HUB_SETTINGS`, the identity card,
  the mode card, the Past Work block, the meter), `screens/AccountSafetyScreen.tsx` (what stays),
  the Notification feed screen's header (the settings button), `lib/ThemeContext.tsx` /
  `lib/themePreference.ts` (the in-row switch writes the same stored preference the Appearance
  screen does). Appearance's own screen can stay for deep links, or go if nothing reaches it —
  the run checks. Fences that pin the hub's rows, their order or their names (M-16's two
  notification names) move with a dated ruling. DECISIONS: the new hub, the moves, the merged
  notification row.
- ACCEPTANCE: every destination the old hub and Account & safety reached is still reachable,
  checked as a list — Profile details, Edit, reviews, Saved & past workers, Services &
  availability, Earnings & payouts, Payment methods, the feed, Notification settings, Appearance,
  Terms, Privacy, Contact support, the mode switch, Sign out, Delete account, and the past work.
  Both modes, both schemes, the dropdowns open and shut.
  (pics 7a = the sim's Profile; 7b, 7c = the operator's boxes on the first render, customer and
  worker)
- STATUS: BUILT 2026-09-29 (the list run) — `screens/ProfileScreen.tsx` (the hub),
  `components/ModeSwitchRow.tsx` (the mode card), `screens/AccountSafetyScreen.tsx` (trimmed),
  `screens/ProfileDetailsScreen.tsx` (the past work, moved — DECISIONS 2026-09-29 (3a)),
  `hooks/useDropdownPresence.ts`, `hooks/useUnreadNotificationCount.ts`, `lib/savedWorkers.ts`
  `fetchRehirePeople()`; the destinations list checked in §4.

**8.** THE NOTIFICATIONS SCREEN, BOTH MODES, BOTH SCHEMES (confirmed by popups and a Before/After
reference) — made smarter. The operator, sending today's feed beside the sim's: "I wanna improve
notification screen in the smartest way....... Some of the ideas im thinking is having dff icons
for each type of notification... Like for example on the right [the sim's pin in a round well] …
and for notficaiton i dont want the < Home... its taking too much space... the notification feed
thats acessible from customer home page... it should be common sense if u press back it goes back
to customer home" (pics 8a, 8b). The reference: `.shots/refresh/notif/` — `sheet-dark.png` and
`sheet-light.png` (TODAY opened from Home's bell · NEW · every type and its look), `new-*.html`
(regenerate: `node .shots/refresh/notif-ref.mjs`).
- HEADER (popup: "Back · centred title · gear"): the round back button ALONE — no "Home" beside it
  on this screen, wherever it was opened from (an exception to LUX-LIST-64 #60 for this screen
  only; back still returns where you came from). The title "Notifications" centred at 17/700 —
  the name #7's Profile row uses, so row and screen match (M-16's rule). On the right, a round
  settings gear that opens Notification settings (#7 moved them there). One line under the
  header: "3 unread" muted on the left, "Mark all read" in the accent on the right (only while
  something is unread).
- LAYOUT (popup: "One card per day group"): eyebrows "Today" and "Earlier" (the run may add
  "Yesterday" and "This week" if the dates call for them), each over ONE #6 card of rows with a
  hairline between them — not one card per notification. Row: a 40 round well with the type's
  icon (20), the title (15; 800 unread, 600 read), the body (13/18, two lines), the time (12),
  and the unread dot. Unread rows also keep today's soft tint: dark `rgba(79,197,140,0.06)`, light
  `rgba(14,107,82,0.07)`.
- AN ICON FOR EVERY TYPE, COLOURED BY KIND (popups: "Colour by kind"; messages "Soft blue"). The
  well is the colour at .14 (dark) / .11 (light), the icon the colour. Keyed on the 14 types the
  database emits (`tests/notificationFeed.test.mjs` OUTBOX), replacing `KIND_ICONS`' four:
  - Bids and jobs — mint `#4FC58C` / light `#0E6B52`: `bid_received` pricetag · `bid_competition`
    people · `offer_countered` and `hire_countered` swap-horizontal · `hire_request` repeat ·
    `hire_accepted` and `job_assigned` checkmark-circle · `job_completed` clipboard ·
    `job_nearby` location.
  - Money — gold `#E9C170` / light `#8A6414`: `payment_released` cash.
  - Messages — soft blue `#7DB9F0` / light `#2F6FA8`, new to the app, for this one kind:
    `message` chatbubble.
  - Disputes — red `#D8604B` / light `#A8432B`: `dispute_opened` alert-circle.
  - Reviews — gold `#E9C170` / light `#8A6414`: `review_received` star.
  - Declined — grey `#909594` / light `#6B7566`: `hire_declined` close-circle.
  - Anything else keeps today's fallback, the bell (the fence requires it). All glyphs are the
    `-outline` Ionicons.
  - The viewer's sample feed uses two made-up types (`new_offer`, `worker_en_route` in
    `.shots/refresh/shared/mock.js`). The sample should switch to the real `bid_received`, and the
    on-the-way row either takes a real type or goes, since no trigger emits one. The reference drew
    it as a job update (navigate icon).
- GROUP BIDS ON THE SAME JOB (popup: "Group bids on the same job"): two or more `bid_received` on
  one job on the same day become ONE row: "2 new bids on your job", "Priya Natarajan $135 · Sam
  Okafor $120 on Assemble a three-seat sofa and an armchair.", the newest time. It is unread if any
  of them is, and tapping it opens the job's bids and marks them all read. "N unread" still counts
  events, so it matches the bell. Nothing else groups.
- UNCHANGED: tapping a row opens what it is about (`lib/notificationRoutes.ts`, including the
  mode-switch confirm for the other mode's events), and the row is marked read; Mark all read; the
  empty and error states.
- HOW (the run's detail): `screens/NotificationsScreen.tsx` (the header, the groups, the wells,
  `KIND_ICONS` → a type → [icon, kind] table, the bid grouping as a pure helper with its own
  test), the header's back label for this route, and the gear to `NotificationSettings`. The
  `notificationFeed` fence moves with a dated ruling: every key is still a type a migration
  emits, and the bell fallback stays. DECISIONS: the new colour (messages), the grouping rule, and
  the #60 exception.
- ACCEPTANCE: every one of the 14 types draws its icon and colour (a fixture row per type, both
  schemes); two bids on one job the same day draw one row; back from the feed lands where it was
  opened (Home's bell, Profile's row); the gear opens Notification settings.
  (pics 8a = today's feed from Home; 8b = the sim's)
- STATUS: BUILT 2026-09-29 (the list run) — `screens/NotificationsScreen.tsx`,
  `lib/notificationGroups.ts` + `tests/notificationGroups.test.mjs`, `notifMessage`, the
  NotificationSettings route on both Home stacks, `DetailScreen`'s `backLabel`; ACCEPTANCE in §4.

**9.** EVERY POP-UP WITH TEXT, BOTH MODES, BOTH SCHEMES (confirmed by popups and rendered options) —
the glass stops showing what is behind it. The operator, on the Inbox ••• menu: "this dropdown in
chat gotta get fixed... why can i see the background this clearly?" (pic 9a: the rows' text
reads straight through Mute, Archive, Report).
- WHY: every pop-up glass is see-through (the Inbox dropdown's gradient .66 → .80, `menu` .82,
  the dialogs' `sheet` .72) and relies on a blur to hide what is behind it. Where no blur draws,
  the rows read right through: the operator's current phone build (build 7 predates expo-blur),
  a browser without `backdrop-filter`, and whatever showed pic 9a. `lib/blur.tsx` ASSUMES web can
  blur (`canBlur = Platform.OS === 'web' || BlurView != null`), so the solid fallback that exists
  (`fallbackScrimAlpha`) never switches on there.
- THE PICK (popups: "Frosted, stronger", then "B, stronger + denser"): FROSTED, STRONGER AND DENSER
  — blur 80 on the phone (expo-blur intensity; the web draws 40px), and thicker glass: the
  dropdown's gradient .66 → .80 becomes .86 → .92 (light: the frosted white .82 → .76 becomes
  .86 → .92); the `menu` scrim .82 → .90; the dialogs' and action sheets' scrim .72 → .86. The
  rows behind become faint smudges and the pane still reads as glass. The colours, rim, top edge
  (#6's inset edge in place of Surface's straight strip) and shadow are unchanged.
- WHERE BLUR CAN'T DRAW → SOLID (popup: "Yes, solid there"): the same pane at alpha 1 — same
  colours and gradient, nothing behind it ever shows. And the app finds out for real whether blur
  draws: web asks `CSS.supports('backdrop-filter', 'blur(1px)')` (or the `-webkit-` form);
  native needs the BlurView module AND Reduce Transparency off. Today's
  `fallbackScrimAlpha` (.95 / .97) becomes 1 for these panes.
- WHICH (popup: "Every pop-up with text"): the Inbox ••• (`GlassDropdown`, `dropdown` material);
  every menu and dropdown on the `menu` material — the Filters popups and tick lists
  (`PickerPopover`, `DropMenu`), the price dropdown, the country dropdown (`CountryPicker`), Post a
  Job's add-media menu (`JobSummaryCard`), the mode-switch capsule; the action sheets
  (`ActionSheet`) and the dialogs (`ConfirmDialog`, `AmountPrompt`). NOT the bottom sheets
  (`ui/primitives/Sheet.tsx`: Filters, Hire again, the Map's) or the [+] Create sheet's "Clear"
  glass. Those keep today's look (the operator's 09-18 pick). Careful: the dialogs and action sheets
  share the `sheet` material with the bottom sheets, so they need their own recipe (a `dialog`
  material, or overrides at their call sites). The bottom sheets must not move.
- PERFORMANCE: a blur of 80 on a small, still pane is cheap. None of these panes move under a
  finger. 120 Hz is checked on the phone.
- THE REFERENCE: `.shots/refresh/dd/cc-dark.png` and `cc-light.png` — Today (blur 22) · A stronger
  blur · B (the pick) · the solid fallback, drawn on the real After's Inbox with only the glass's
  alpha and the blur changed (`node .shots/refresh/dd-ref.mjs`).
- ACCEPTANCE: with blur off (a forced render), no pop-up in the list shows any text behind it;
  with blur on, the rows behind are smudges, not words (both schemes); the bottom sheets and the
  [+] sheet render exactly as before. DECISIONS: the frost numbers, the solid rule, the honest
  blur check.
  (pic 9a = the operator's picture of the Inbox ••• menu)
- STATUS: BUILT 2026-09-29 (the list run) — `ui/tokens.ts` (menu, dropdown, `paneFills.dropdown`),
  `lib/blur.tsx` (`CSS.supports`), `ActionSheet` / `AmountPrompt` / `ConfirmDialog` on `menu`;
  native already goes flat under Reduce Transparency (`Surface`). ACCEPTANCE in §4.

## 4. The run (2026-09-29) — built in the practice copy; the After is `after.patch`, NOT applied

The operator: "run the list for now and make changes update into … the viewer … Implement these
surgically and also see if there are any small inconsistencies / bugs … (fully autonomous)". The
record of what was decided is `docs/DECISIONS.md` 2026-09-29 "LUX-LIST-2" (1)–(10).

- BUILT: items 3, 4, 6, 7, 8 and 9 (1, 2 and 5 were already in the practice copy). Practice `tsc`
  clean and `node --test` 1286/1286; the After exported, and 72/72 in both apps and both schemes.
  `after.patch` regenerated (186 modified, 46 added) and `git apply --check` clean. The real
  `npm run verify` is green.
- ACCEPTANCE:
  - #4: exactly the 25 in `#86641A`, none missing or extra; the look-alikes are the brief's own set.
  - #6: the census of every card and tile, both schemes (`.shots/refresh/lx2-census.mjs`), after
    the follow-up in DECISIONS (8).
  - #7: every destination on the list is reachable — Profile details (the card), Edit (the pill),
    the reviews (the rating line, gated), Saved & past workers, Services & availability and
    Earnings & payouts (each mode's own section or the other mode's tools), Payment methods
    (MONEY), the feed (Notifications), Notification settings (the feed's gear), Appearance (in
    the row; its screen via "Design studio" in internal builds), Terms and Privacy (Legal),
    Contact support, the mode switch, Sign out, Delete account (Account & safety), and the past
    work (Profile details, moved there).
  - #8: all 14 types from a fixture feed, both schemes.
  - #9: pop-ups on the thicker glass, solid where no blur draws.
- JUDGMENT CALLS, for the operator to overturn in one line each:
  - the past work moved to Profile details;
  - Appearance's screen stays for the design studio;
  - the gold-outlined icon squares of the settings pages stay outlined;
  - #8's grouped row keeps the trigger's "$135.00".
- ALSO FIXED (small bugs, DECISIONS (9)): the four cut-offs HANDOFF had carried — "Your job" under
  the pay, "releases i…", the Map's "$1…", "Priya Na…".
- FOR THE BUILD RUN ("build it"):
  - apply `after.patch`;
  - copy item 5's eight files into `assets/prestige/`;
  - delete the six retired armchair files by hand;
  - `npm run verify`, then the phone: #3's instant dim, #7's dropdowns and Reduce Motion, #9's frost
    with expo-blur and under Reduce Transparency, 120 Hz with the inset shadows.
