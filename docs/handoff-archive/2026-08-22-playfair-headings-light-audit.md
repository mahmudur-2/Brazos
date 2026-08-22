## 2026-08-22 — PLAYFAIR HEADINGS + ORPHAN DELETE + LIGHT-MODE AUDIT — COMPLETE

Three functional commits plus this record: `341fae8` bundles Playfair
Display, `81478c4` deletes the orphaned toolbox PNG, `ce4e6ec` writes the
read-only light-mode parity audit. Bare `npm run verify` exit 0 at baseline
and after every commit — **suite 843 → 844 pass / 0 fail / 0 TS errors**
(+1: the executed Playfair fence in `tests/themeTokens.test.mjs`, proven red
against a repoint at the platform serif before being kept). Pushed under the
autonomy gate after the final green verify; `git` is the authority on what
reached the remote.

**Playfair Display (operator decision 2026-08-22, supersedes emerald-v2 D5
for the three large heading roles ONLY):**

* `assets/fonts/` now holds `PlayfairDisplay-Bold.ttf` (700),
  `PlayfairDisplay-ExtraBold.ttf` (800) and `OFL.txt` — upstream Google
  Fonts statics, magic-bytes- and name-table-verified before commit.
* `type.display`/`h1` → `fonts.displayExtraBold`, `type.h2` →
  `fonts.displayBold` (ui/tokens.ts); `typography.title` → ExtraBold,
  `typography.heading` → Bold (lib/theme.ts). Their inert `fontWeight` is
  REMOVED — with a real file bundled, iOS would synthesize a fake bold on
  top. **Deliberately unmoved:** `type.title` (15pt), `typography.subheading`
  (17pt/600 — no 600 face bundled, Playfair degrades under ~18pt), and every
  screen style that names `fonts.display` directly (heroHeadline,
  sectionTitle, statusWord, earningsAmount…) — those stay Georgia and their
  fences stay byte-true. `fonts.display` itself still resolves the platform
  serif; do NOT repoint it.
* Loading is runtime `useFonts` in App.tsx's `LaunchGate` — no new package,
  no native rebuild, Metro/Expo Go fine. The gate holds `children` unmounted
  and holds `sessionReady` false until the faces resolve (or error → falls
  back to platform serif), so no frame paints a heading in the fallback face
  — that render gate is the answer D5's flash objection required, recorded in
  docs/emerald-v2/DECISIONS.md D5's dated superseding note.
* home(21)'s recorded cap-height debts (hero 2.6pt, promo 2.8pt owed because
  Georgia sets ~22% wider than the masters' Didone) are NOT closed by this:
  the screen styles that carry them still name `fonts.display`. Moving THEM
  onto Playfair is a separate operator call with its own measurement pass.

**Orphan deleted (gated):** `assets/brand/worker-home-toolbox.png` — the
full-tree search found zero live references (filename/require/roster/config;
only prose mentions in HANDOFF, PRESTIGE_RUN_REPORT, DARK_ASSET_INVENTORY,
STAGE4D_PLAN). Its sole historical `require()` died with BrowseJobsScreen
(`778fc5c`). This resolves Batch F+J's carry-forward bullet below. The dark
worker-home artwork is and remains `assets/prestige/hero_toolbox_worker.png`
(WorkerHomeScreen.tsx:50, dark-gated).

**Light-mode parity audit** — `docs/audit/2026-08-22/light_mode_parity.md`:
**P0 0 / P1 0 / P2 10.** The machinery is sound (key parity typed+fenced on
both palette surfaces, single resolution path, all four Prestige rasters
gated at their only render sites, glow/selection/scrim dark-gated with
Heritage light states intact). The ten P2s are token hygiene — `lib/jobs.ts`
+ `lib/hotspots.ts` literals sit OUTSIDE the hex-fence's scanned dirs, the
auth-surface literals' token home (`lib/authTheme.ts`) is now editable, a
dead static `emeraldColors` export invites non-flipping use — plus the known
light grey-star residue on three meta rows. Fix selection is the operator's;
no batch opened.

**Device checks OWED (operator, physical device):**
- Cold start: launch layer → Home with the large headings in Playfair from
  their FIRST visible frame (no Georgia flash). Only the 28/26/21pt heading
  roles moved; 15pt card titles and the hero/section styles deliberately
  stay Georgia — a Playfair card title on this build is a BUG, not a win.
- Both modes, both themes: heading weight reads ExtraBold at 28/26pt, Bold
  at 21pt; no double-bold smudge (that would mean a fontWeight crept back).
- Airplane-mode cold start still reaches the Terms retry screen (the font
  gate must release on error, never hold the launch layer forever).

> **CORRECTION 2026-08-22 (later the same day) — EVERYTHING ABOVE ABOUT
> PLAYFAIR AND ABOUT GEORGIA IS HISTORY, NOT CURRENT STATE.** The operator
> reversed the bundling in full and retired the platform serif with it: the
> app now sets entirely in the iOS system sans. `assets/fonts/` and the three
> files in it are deleted; `fonts.displayBold` / `fonts.displayExtraBold` are
> gone from both token surfaces; App.tsx's `useFonts` load and the font half
> of `LaunchGate` are gone (the gate still holds for `sessionReady`);
> `LaunchScreen`'s wordmark no longer names a serif either. `fonts.display`
> DOES still exist and IS still the single lever for every heading style that
> names it — but it now resolves to the system sans, so the instruction above
> not to repoint it no longer describes a serif. The `fontWeight`s that the
> bundling removed as inert are restored (`type.display`/`h1` 800, `type.h2`
> 700, `typography.title` 800, `typography.heading` 700); sizes, line heights
> and the heading `letterSpacing: -1` are untouched and are the operator's
> dial for a device pass. The three device checks above are superseded by the
> ones in this run's own section at the top of this file. The Playfair fence
> in `tests/themeTokens.test.mjs` is INVERTED, not deleted. See
> docs/emerald-v2/DECISIONS.md D5's second dated note.

