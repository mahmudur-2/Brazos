# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## THE MASTER SET IS SPLIT — read this before citing any mockup

**Binding design authority, highest first:** the NUMBERED masters
(`docs/mockups/1_*.png` … `44_*.png`) · the emerald dispatch's D1–D11 ·
`docs/mockups/PRESTIGE_RUN_REPORT.md` (a "mismatch" logged there is CORRECT and
must not be reverted) · `docs/mockups/BRAZOS_MOCKUP_MANIFEST.md`.

**The WORD-NAMED masters are NOT authority and the operator has REJECTED them**
as an over-ornate render pass: `Compare_Bids_Dark.png`, `Discover_Map_Dark.png`,
`Messages_Inbox_Dark.png`, `My_Jobs_Active_Dark.png`, `My_Jobs_Closed_Dark.png`,
`My_Jobs_In_Progress_Dark.png`, `Notifications_Feed_Dark.png`,
`Notifications_Preferences_Dark.png`, `Payment_Methods_Dark.png`,
`Profile_Account_Safety_Dark.png`, `Profile_Details_Dark.png`,
`Profile_Past_Work_Settings_Dark.png`. Never cite one to justify a change; never
"restore" a detail that appears only there. You may read one to understand
intent where a numbered master is silent, but the change still needs a numbered
master, a dispatch decision or the run report behind it — and you log that you
read it.

**There is NO master for light mode.** Every mockup is dark. Never align a light
surface to one. **Six numbered masters the emerald dispatch cites do not exist
on disk** (33, 34, 39, 40, 45, 46; also absent: 21, 28, 35–38, 41, 42) — all of
them concern things D9 freezes as UNBUILT.

## 2026-08-19 — Emerald correction pass: COMPLETE

**No SQL executed, no database contacted, nothing pushed, no `.claude/` file
modified, no `.env` read, no dependency added or mutated, no frozen web surface
touched, `app.json` untouched, `package.json` untouched, `lib/authTheme.ts`
untouched, no image asset added.**

A second dark-mode pass on a physical iPhone produced 38 screenshots. This run
fixed what they show plus five direct operator instructions, and it was **not**
a paint-only run: two of the eleven commits changed structure (the customer tab
bar, the profile store), and three of the reported "paint" defects turned out to
have non-paint causes. Ten commits carry the `emerald(N)` prefix; the eleventh
is this rewrite.

**The locked-screen set is EMPTY.** `CLAUDE.md` says so, and
`.claude/hooks/guard.ps1` agrees mechanically — its `GUARD-PATH-LOCKED` rule
sits inside `if ($false)` and can never fire. That is what allowed emerald(5) to
convert the sign-in screens rather than write the operator a patch. *(Two
housekeeping notes for whoever owns those files: the `$locked` array in the
guard is now dead code that still reads as live, and `CLAUDE.md`'s locked
section ends with a dangling `screens/BrowseJobsScreen.tsx` after the sentence
that unlocks everything.)*

The campaign's living record — every finding, judgment call, skip and deviation
with its reason — is the **"Emerald correction pass 2026-08-19"** section of
`docs/mockups/PRESTIGE_RUN_REPORT.md`. Read it before reopening any of this;
what follows is the operational summary only.

### Verify

Every commit ran bare `npm run verify`, stdout redirected to a file and never
piped, with the exit code read from `$?` — a redirect leaves it as verify's own;
a pipe would mask it. Baseline **758 pass**; final state **775 pass / 0 fail /
0 skipped, exit 0**, the 17 new tests being this run's own contracts. **No
assertion was relaxed and no allowlist widened.** Two allowlist entries were
DELETED (both sign-in screens, in `tests/themeResolution.test.mjs`), which
narrows the permission rather than widening it. Four assertions moved — the two
`tests/mode.test.mjs` slot assertions D1 explicitly authorises, the toggle
assertions D5 authorises, and two mechanical re-anchorings after a JSX
reformat — and every one came back at equal or greater strength, each named in
the run report.

### The three "paint" defects that were not paint

This is the thing worth remembering from this run.

1. **The white band under the nav pill** was not a layer that needed turning
   transparent — it was a MISSING GROUND. Every ancestor of the floating pill's
   margin gap was a colourless `flex: 1`, so what showed through was the iOS
   root view, white by platform default. Invisible in light, glaring in dark.
   One painted View on `ModeShell` fixed it for both trees — and, as a bonus,
   for the "unthemed grey band" under the creation sheet's Cancel, which was
   the same white seen through a scrim.
2. **Content under the pill** was not a missing padding rule — the rule existed
   and its NUMBER was wrong. §I's flat 68 was short of the pill's real footprint
   (70 plus a float margin that grows to the 34pt home-indicator inset), so even
   the screens that applied it were 36pt short on a notched phone.
3. **The two availability toggles disagreeing** was not a colour bug. Every
   caller of `useProfile()` held its own copy of the row, and Services &
   availability refetches on focus while Worker Home did not. No repaint could
   have fixed it.

### What changed, by commit

- **`emerald(1)` `4af3a35`** — customer bar becomes `Home · Discover · [ + ] ·
  Messages · Profile`. Two reversals; see below.
- **`emerald(2)` `e28e780`** — the bar row paints nothing but the pill; glyph
  28pt / label 11pt; the pill's ring is one weight.
- **`emerald(3)` `c2e9d6b`** — ONE derived clearance, `useFloatingNavClearance()`,
  across 3 templates and 18 hand-rolled surfaces. The static token is gone.
- **`emerald(4)` `315b481`** — WorkerResults needed no fix; the failure class is
  pinned by two new tests instead.
- **`emerald(5)` `9ec0b18`** — both sign-in screens converted onto their
  siblings' `authSurface()` path. `lib/authTheme.ts` untouched.
- **`emerald(6)` `bc88aa9`** — neutral toggle track, gold knob, and
  `useProfile` becomes a shared store.
- **`emerald(7)` `7179d63`** — `selectedInDark()` and `disabledControl()`: one
  way to say chosen, one way to say dead, across ten surfaces.
- **`emerald(8)` `a671758`** — one scrim (`SCRIM_DARK_ALPHA = 0.55`) across all
  seven modals; the creation sheet gains safe-area handling.
- **`emerald(9)` `30af8db`** — the map is keyed on the theme.
- **`emerald(10)` `d85c2aa`** — master 26's emerald glyph in its gold ring;
  masters 22 and 18 were already built.

### Six reversals a later run must not "correct"

1. **Map → Discover on the customer bar**, reversing manifest B-2. Label, glyph
   AND destination. The worker bar keeps Map.
2. **My Jobs left the customer bar.** The ROUTE stays registered — removing it
   would break the [ + ] sheet and all notification routing.
3. **The emerald/red toggle is retired.** Neutral track in both states; the knob
   carries the state. Red is not an error state for "not taking new work".
4. **Nav glyphs went 29 → 28** under a heading that says "LARGER". The explicit
   number won; the direction is on the record.
5. **`layout.floatingNavClearance` is deleted** as a token; a test fails if a
   static clearance token returns.
6. **All seven modal scrims went 0.7 → 0.55 in dark**, the filter sheet
   included — it was one of the seven identical copies, not the reference the
   others differed from.

### Frozen, and mechanically confirmed at the end of the run

No money colour moved anywhere (`git diff de048e9..HEAD` over `MoneyText`,
`JobCard` and `WorkerJobCard` is empty). The nav active tint is still
`palette.emerald`. The verification badge is still absent from every
user-visible surface — its suite passes 4/4. Saturated per-category tile fills
are still retired in dark. The centre [ + ] survives, now dead centre of five
slots. Master 34's inbox search, master 46's compare grid and its "best fit"
ribbon remain unbuilt. No marketplace data was invented, no user-facing copy
changed, and no new raster was added.

### Carried forward from the previous pass (`fidelity(1)`–`fidelity(7)`)

The dark device pass immediately before this one is recorded in full as the
**"Dark device pass 2026-08-19"** section of the run report. Two of its
decisions have since been REVERSED by this run and must not be restored: its D1
(the emerald/red toggle) and its five-slot customer bar. Two of its findings
still stand and are repeated here because they keep being rediscovered:

* **`forest` was the Heritage brand green ON CREAM; Prestige v2 made it the one
  solid FILL.** Any unconverted surface using it as CONTENT — a label, a body
  line, a dashed edge, a glyph — resolves in dark to one deep green on another
  and simply disappears.
* **The saturated per-category tile fills are retired in dark on purpose**,
  including the purple `dog_walking` tile masters 11 and 13 visibly draw.
  Operator instruction, with the pixel evidence in the run report.

### fidelity(5) found no defect, and shipped a guard instead

Customer Home's armchair and gold-B drape have resolved per palette since
prestige(1a); the reported leak is not in the code. Every raster the app mounts
was inventoried and its background MEASURED — from each PNG's IHDR colour type,
and for the RGBA ones a corner-alpha decode — and none leaks a wrong-theme
ground. The evidence table is in the run report.

So the commit made the rule enforceable instead: `tests/themeResolution.test.mjs`
now holds a roster every mounted raster must appear on with its measured
background, re-derives the no-alpha claim from the PNG header so the roster
cannot rot, and scans that every gated asset is mounted with `isDark` within
240 preceding characters — comment-stripped, so a docblock cannot stand in for
a real gate. **Adding a new image asset will now fail the suite until it is put
on that roster with a gate decision.** That is intended.

### Invariants, unchanged

No schema was touched and no database contacted. Money is still integer cents
through `formatBudget()`, and money COLOUR was not touched at all (D8);
`accept_offer()` is still the only assignment path and `transition_job_status()`
the only status mover; exact address still comes from `job_locations` behind
RLS; lifecycle derivation is still expressed once; no marketplace data was
invented. One account still carries both capabilities, and mode still changes
only through `switchMode()`.

**Navigation semantics DID change, deliberately and customer-side only**
(emerald(1)): two destinations left the customer bar and one joined it. No route
was removed — `Map` and `MyJobs` are registered and dispatchable, hidden — so
every existing NAVIGATE still resolves and no deep link needed retargeting.
`tests/mode.test.mjs` pins all of it.

**One data-flow change** (emerald(6)): `hooks/useProfile.ts` is a shared store
rather than a per-component hook. Nine screens read it. Fetch behaviour is
unchanged — each mount still refreshes — but a write on one screen is now
visible on the others immediately.

## NEXT SCHEDULED RUN — the LIGHT-mode parity audit

Light stayed FROZEN through this run too: every colour change branched on
`isDark` and left the light value byte-identical, with the structural exceptions
stated in the run report (the customer bar's composition, `ModeShell`'s ground,
the derived scroll clearance, and the ActionSheet's safe-area inset — all of
which apply to both themes by nature). That freeze is now two runs of debt, and
paying it is the next run.

**This run added to it.** Section (c) of the run report is the previous pass's
list and is still accurate; add to it: the light SELECTED state of the ten
surfaces emerald(7) converted (each keeps its Heritage treatment, and light now
carries three different ones where dark carries one), the light DISABLED fills
emerald(7) introduced on two hand-rolled buttons, the three un-unified light
scrims (35% / 42% / 45%), and the two sign-in screens, whose light rendering
moved from the frozen `authTheme` constants onto the resolved palette when
emerald(5) converted them — the same shift Welcome and both Create-account
screens took earlier, and the reason the flow is now one design system.

**The scope is written out in full** as section **(c) THE LIGHT AUDIT HANDOFF
LIST** at the end of `docs/mockups/PRESTIGE_RUN_REPORT.md`. It is meant to be
audited from directly, without rediscovery, and has four parts:

- **C1** — every shared component this run touched that carries a light branch,
  with what light renders today and why it needs looking at (thirteen entries,
  from the `Toggle` to `MediaUploader` to the seven modal scrims).
- **C2** — the five items deferred under D10. The largest is **L1**:
  `lib/jobs.ts`'s `JOB_CATEGORY_COLORS` is now a LIGHT-ONLY table, and whether
  light keeps eleven category colours or joins the one-tile rule is the biggest
  outstanding light decision. Also **L4**: `customer-home-chair.png` bakes
  `#FAF5F1` opaquely — invisible only because it matches `homeBackground`
  exactly today.
- **C3** — what prestige(0c)/(1c)/(0d)/(7a) changed in BOTH themes and nobody
  has seen under light: the shared Toggle, the disabled-button treatment, serif
  screen headers, segmented tabs, both steppers, the floating nav pill in both
  trees (now six slots on the customer side), the three profile pages, and the
  Avatar.
- **C4** — theme-neutral changes from this run, listed so they are not
  re-audited as light debt.

### Open items carried forward (unchanged by this pass)

1. **Master 34's inbox search, its four filter tabs and its per-thread unread
   COUNT** are not built — functionality, not presentation, and the data model
   has no support-thread kind and no per-thread count.
2. **Master 46's three-column grid and its "best fit" ribbon** are not built —
   bid count is unbounded, and the ribbon asserts a judgement no stored figure
   supports. The honest HIGHEST RATED badge stays.
3. **The map tiles are CLOSED, with the mechanism named.** `HotspotMap.native`
   sets the per-MapView appearance prop from the resolved theme, and
   react-native-maps 1.20.1 really does apply it — it assigns
   `overrideUserInterfaceStyle` on its `MKMapView` subclass. The residual
   problem was that MKMapView repaints its basemap on a trait CHANGE and will
   not reliably re-rasterise tiles it has already drawn, so emerald(9) keys the
   view on the theme. If light tiles ever return, that is the thing to re-test —
   not the prop, which is verified correct.
4. **The verification badge** stays removed from every user-visible surface.
5. **Disk filenames for ten masters are shuffled** relative to the manifest's
   numbering — `My_Jobs_Closed_Dark.png` holds master 35's ACTIVE tab, and so
   on. Read by content; renaming is an operator call. Note this concerns the
   WORD-NAMED files, which are no longer authority at all (see the top of this
   file).
6. **Master 40's "No real charge" gold pill** and **master 25's gold ledger
   amount** remain unimplemented, both for reasons already on the record.
7. **Hand-drawn standard-shaped controls inside individual screens** never got
   the gold-hairline sweep — only the shared `Button` did. emerald(7) took the
   two hand-rolled buttons that expressed DISABLED wrongly
   (`ServicesPricingScreen`, `CategoryAccordion`); the enabled-hairline half of
   the same sweep is still outstanding and is worth its own pass.
8. **Section (e) of the run report** lists eleven items this run logged and did
   not fix, each with its reason — including the four tab roots' deliberate
   `paddingBottom: 0`, the two surviving native `<Switch>` sites, and two
   housekeeping notes on `.claude/hooks/guard.ps1` and `CLAUDE.md`.
