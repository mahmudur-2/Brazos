# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## 2026-08-18 (Stage 4D-4) - dark theme activation; voice search pending

**No SQL executed, no database contacted, no schema object touched, nothing
pushed, no locked file edited, no `.env` read, no image asset generated.**
This HANDOFF is commit 6 of the dispatch, written deliberately BEFORE Block 2
(voice search) so a crash there still leaves a truthful document. Block 1
(dark theme) is complete; Block 2's outcome lands as a short amendment below
this line if it ran. Suite at the base gate: 696 pass / 0 fail. After Block 1:
**706 pass / 0 fail / 0 skipped**, every commit on a green `npm run verify`
(one exception honestly recorded in the table — 41d3b28 landed with one red
assertion because a piped `tail` masked verify's exit code; 53229b9 repaired
it minutes later and the pipe pattern was fixed for the rest of the run).

### Corrected facts (operator-supplied, supersede older HANDOFFs)

- `node scripts/verify-schema.mjs` ran GREEN against staging on 2026-08-18:
  every group OK, zero MISSING, zero PENDING. **phase74/75 are officially
  applied.** The old "item A" is resolved.
- The location-CHECK migration is **DEFERRED by operator decision, not
  pending**. Live inspection found zero coordinate-shaped rows in
  `jobs.location`, zero rows in `job_requests` (empty, superseded by
  job_offers), and `jobs.location_text` entirely null with no function
  writing it. The client already refuses and masks. The CHECK rides the next
  migration that has to happen anyway.
- The 4D device walk-through passed on the bid-ordering surface: no "Best
  value" badge, no chip selected by default, deterministic order confirmed
  on a physical iPhone.

### Block 1 — dark theme activation (commits 1-6)

| commit | what it did |
| --- | --- |
| 3fb1335 | Theme resolution is real: stored preference (`system\|light\|dark`, AsyncStorage-only by pre-made decision — no column, no sync) → system appearance → light. lib/themePreference.ts owns the pure rule (executed by tests), lib/ThemeContext.tsx owns the inputs, reads the preference BEFORE the themed tree paints (under the locked launch layer, so a dark cold start never flashes a light tree), subscribes to Appearance changes while `system`, and pushes a pinned choice to native surfaces via `Appearance.setColorScheme` (present in RN 0.81.5; react-native-web lacks it — guarded). NavigationContainer gets a palette-derived theme; the status bar derives from the resolution; app.json `userInterfaceStyle` → `"automatic"`. useThemeColors stays the ONE reactive hook, re-exported from lib/theme.ts. |
| 67f0d39 | Profile → Appearance: System / Light / Dark, current one checked, radio semantics, applies immediately through setPreference (persists + repaints + syncs native), survives restart. Existing primitives only; no copy beyond the three labels. |
| e195012 | THE SWEEP (97 files): every non-locked screen/component/primitive/template computes color-bearing styles from the resolved palette (themedStyles factories, cached per palette), inline JSX colors/spinners/placeholderTextColor ride the same read, every swept TextInput sets `keyboardAppearance` on iOS, the ui/ layer reads the resolved §I palette (hook's new `emerald` field), palette-prop components default to the resolved palette, the tab bar takes the palette as a bottomNavScreenOptions parameter, StatusBadge/StatusPill tone maps became palette functions, `emeraldColorsFor`/`typographyFor` replace static mappings in swept screens, ColorPalette gained `onForest` (light byte-identical; near-black in dark because forest is the GOLD primary under Prestige), and 4D-B's recorded intent is carried out: ClientJobDetail's forest hero card moved onto `surface` with a forest accent border. The permanent guard landed: a source-contract test scanning screens/, components/, ui/, hooks/, navigation/, modes/ for raw hex/rgb/hsl literals with a reasoned allowlist. |
| 41d3b28 | Map surface. Provider VERIFIED, not assumed: no Google provider configured anywhere → react-native-maps 1.20.1 renders **Apple Maps (MapKit)** on iOS, where `customMapStyle` is Google-only and INERT — the inert `customMapStyle={[]}` was removed and no style JSON ships. Tiles follow the RESOLVED theme via the per-MapView iOS `userInterfaceStyle` prop this version exposes (better than trait-following: covers a pinned preference), on top of commit 1's setColorScheme. All overlays (permission fallback, loading pill, empty banner, cluster pins — count flips to onForest on the gold fill) and MapScreen chrome read the palette. HotspotMap.web.tsx untouched (frozen), no shared prop changed. |
| 53229b9 | Repairs 41d3b28's red pin (the new test read raw source whose comment names customMapStyle; now comment-stripped like every other [static] scan). |
| a27c730 | docs/audits/DARK_ASSET_INVENTORY.md — the operator's dark-asset generation brief. No component change was needed: after the sweep, every raster brand asset renders on a locked-light screen or inside the transition panel's own baked background. Leads with the native splash (no `splash` config exists at all — dark cold starts open on Expo's default white; config change deliberately deferred to the asset pass). |

### Deliberately left light (each is a follow-up, not a bug)

- **LOCKED screens** (CLAUDE.md list: Launch, Welcome, SignIn, EmailSignIn,
  CreateAccount, EmailCreateAccount, VerifyPhone, Setup, LegalGate, Home,
  BrowseJobs) — includes the mounted customer HOME. In dark mode the auth
  flow and customer Home render light until the operator unlocks them. The
  unlock patch is mechanical: run the commit-3 conversion (themedStyles +
  useThemeColors) on each file and delete its line from the contract-test
  allowlist in tests/themeResolution.test.mjs.
- **lib/authTheme.ts and the auth components** (AuthNotice's two literals,
  CountryPicker's scrim) — authTheme is never-modified this run, so their
  literals cannot move into tokens yet; allowlisted with reasons.
- **ModeTransitionOverlay** — its gold chrome and `'#FFF3D6'` shimmer pair
  with the baked LIGHT transition PNGs; theming it before the dark PNGs
  exist would mismatch the artwork. Migrates with the assets (inventory).
- **lib/hotspots.ts tier glow colors** — theme-independent heat semantics
  (blue/green/amber/red alpha glows read on both tile sets).
- **SegmentedControl thumb shadow** follows `palette.text` (faint light glow
  in dark at 0.0x opacity) — cosmetic nit, noted for the device pass.

### Known cosmetic gap (single frame)

A user who pinned **Dark** on a **light-system** phone can catch one frame of
the light pre-resolution gate on cold start if the launch animation ever
fails to cover it; system-dark cold starts get a dark gate. Recorded in
lib/ThemeContext.tsx; invisible in practice because the locked launch layer
renders from frame one.

## Applied reality - staging `zzkumxcjtbqoselzptig`

Unchanged by this run — repository-only. phase74/75 officially applied and
verified green 2026-08-18 (corrected fact above); phases 67-73 applied and
verified 2026-08-16. No unapplied migration exists in the repository; the
location-CHECK is DEFERRED (see corrected facts), so nothing awaits apply.

**Production (`avkighsiufeefyycbebf`) still has none of the migrations.**
Standing decision: rebuild from a staging dump once staging is beta-ready;
`PROD_APPLY.md` is marked SUPERSEDED and is history/fallback only.
Production was never contacted.

### anon-EXECUTE evidence - preserve on any rewrite

Settled by a live `pg_proc` read on staging, 2026-08-16 (before phase74/75
were applied):

> Exactly ONE function in schema `public` is EXECUTE-able by `anon`:
> `job_categories_expanded()`, SECURITY INVOKER, returns boolean, ACL
> `postgres=X/postgres | anon=X/postgres | authenticated=X/postgres`. That is
> the deliberate one (phase69 re-granted it). `worker_job_stats`,
> `deactivate_push_token` and `resolve_notification` did NOT drift.

That ACL string cannot be re-derived from any file in this repository and
exists nowhere else. Preserve it on any rewrite of this document. Neither
phase74 nor phase75 disturbs the finding.

## Still blocking a beta, worst first

1. **Phone sign-in dead-ends on a release build.** `EXPO_PUBLIC_PHONE_AUTH_MODE`
   unset means `mock` in development and `disabled` in a release, and `mock`
   is refused when `__DEV__` is false - correctly, since no SMS provider is
   configured. Email + password is the only authenticating path. See
   `docs/phone-auth-activation.md`.
2. **Supabase session tokens sit in unencrypted AsyncStorage.** Swap the
   `createClient` storage adapter to `expo-secure-store`.
3. **Payments are sandbox-only and configuration-governed.**
   `EXPO_PUBLIC_PAYMENTS_MODE=sandbox` must be set for a release/TestFlight
   build to run payments at all; no real provider exists behind the
   resolver (deliberate for beta).

## Needs the operator - outside any run

**A. EAS BUILD (new, blocking everything this run shipped).** Native config
changed: `userInterfaceStyle: "automatic"` — dark mode is INERT in the
existing binary and in Expo Go pinned light. One iOS build (plus Block 2's
plugin if it shipped — see amendment) makes commits 1-5 real on device.
Then `git push` — nothing was pushed autonomously.

**B. Both-themes device flip-through.** Walk every major surface in Light,
Dark, and System (flip the OS setting live: the app must repaint without
restart; a pinned choice must survive restart and steer the KEYBOARD,
alerts, share sheet, and Apple Maps tiles). Known-light surfaces are listed
above and are not findings.

**C. Dark asset generation.** docs/audits/DARK_ASSET_INVENTORY.md is the
brief — splash config first (white flash on every dark cold start), then
the two transition PNGs (re-measure the gold-line geometry after), then the
Home illustrations for the unlock session.

**D. The authTheme/locked-screen unlock session.** The exact patch shape is
in "Deliberately left light" above. Home is the highest-value unlock: it is
the first themed-app screen a dark-mode user sees rendering light.

**E. TestFlight retry is now possible WITHOUT swapping keys.** The EAS gate
derives the ref from SUPABASE_URL; the `preview` environment's existing
`sb_pu…` publishable key passes the format check. The 4D-4 build (item A)
doubles as this confirmation run.

**F. "preview" still names two different things** (EAS environment holding
production credentials vs. the unreachable EXPECTED_REF row). Nothing is
broken; the docblock on EXPECTED_REF explains. Unchanged.

**G. `EXPO_PUBLIC_PAYMENTS_MODE` governs whether payments run.** For
payments on a release build set it to `sandbox` in `.env` and restart Metro
(Expo inlines `EXPO_PUBLIC_*` at bundle time).

**H. Locked patches A10-A12 (docs/LOCKED_FILE_PATCHES.md).** A12 (Welcome
copy: "Verified workers" → "Real customer reviews", "Protected payment" →
"Clear upfront pricing") should land before any external beta.

**I. PRIVACY_VERSION decision** (from the previous run): the corrected
WORKING DRAFT privacy policy has not had its version bumped; decide at the
counsel-reviewed pass whether users re-accept.

**J. Device-test backlog (pre-4D-4 items).** The bid-ordering surface
passed on device (corrected fact). Still open from the previous list: the
post-flow airplane-mode location behaviors, "Suggested starting range"
copy, and the corrected Privacy §7 — fold them into the both-themes
flip-through (item B).
