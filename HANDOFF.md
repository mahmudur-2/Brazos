# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## 2026-08-18 (Stage 4D-4) - dark theme activation + voice search: COMPLETE

**No SQL executed, no database contacted, no schema object touched, nothing
pushed, no locked file edited, no `.env` read, no dependency-mutating command
run, no image asset generated.** Stage 4D-4 shipped both blocks this date:
Block 1 (dark theme, commits 1-6) in the first session, Block 2 (voice
search, commits 7-9 below) in a second session dispatched after the operator
installed the pre-approved dependency themselves (the agent-side install had
been guard-denied, which skipped Block 2 in session one — that skip is now
history, superseded by this shipment). Suite: 706 pass at Block 2's base
gate → **730 pass / 0 fail / 0 skipped** after commit 9; every Block 2
commit landed on a green bare `npm run verify` with the exit code read
directly (the piped-`tail` failure mode from Block 1's 41d3b28 was not
repeated).

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

### Block 2 — voice search (commits 7-9), SHIPPED

| commit | what it did |
| --- | --- |
| 031f2bc | Dependency + native config. Stages the operator-installed `expo-speech-recognition@3.1.3` (package.json/package-lock.json, exactly the one entry) and registers the package's own config plugin in app.json — identifier `"expo-speech-recognition"` (root app.plugin.js) — with the two operator-authored iOS strings as its `microphonePermission` / `speechRecognitionPermission` options, which the installed plugin source assigns to `NSMicrophoneUsageDescription` / `NSSpeechRecognitionUsageDescription` (options win over pre-existing values). No source file changed. |
| 34705b3 | lib/voiceSearch/ — the ONE place allowed to import the vendor (statically enforced), on the lib/phoneAuth pattern: pure types.ts + provider.ts executed by tests against injected doubles, index.ts the only impure file. On-device is REQUIRED: `start()` always carries `requiresOnDeviceRecognition: true` and is unreachable unless `supportsOnDeviceRecognition()`, `isRecognitionAvailable()` and an installed en-US locale all passed — necessary because the installed vendor SILENTLY DROPS the flag when the recognizer lacks on-device support (ios/ExpoSpeechRecognizer.swift, prepareRequest), which would otherwise be a silent network fallback. Every degraded case (non-iOS, module missing — the operator's current binary, recognizer unavailable, no on-device support, locale absent, permission denied, probe threw) is first-class `unavailable`; the vendor require is lazy + caught so the app imports safely without the native module; the vendor error payload dies unread (no raw text can cross); the transcript's only egress is the caller's callback. 19 tests. |
| b7e3e6d | Press-and-hold mic in ui/primitives/SearchBar.tsx, behind the existing onChangeText contract: the transcript handler IS `onChangeText`, no second write path, no auto-submit, consumers unchanged. Hold = onPressIn → beginHold; release = onPressOut → release(); unmount cancels; never a toggle. Mic renders ONLY when the boundary reports available — absent (not disabled) on the current binary and web/Android. `disableVoiceSearch` opts out; default present-when-available. Palette-fed colours (emerald active / navInactive idle / withAlpha wash), no raw literal, no themeResolution allowlist entry; 44pt effective touch target. 5 more tests. |

Voice-search facts an operator should know:

- **The two permission strings are a behavioural contract the code keeps
  literally true**: recognition runs only between press-in and release
  (a hold released during the permission round-trip never starts), and
  there is no code path that can send audio off-device (iOS-only gate — web's
  speech API streams to browser-vendor servers; on-device required and
  probed, not just flagged; no network recognizer branch exists to fall
  back to).
- **On the current dev binary the mic simply does not render** (native
  module absent → boundary unavailable). It first appears on the EAS build
  in item A below.
- **Only dev-tools/ComponentCatalog.tsx mounts SearchBar today** — no
  production screen and no locked screen inherits the mic until a screen
  adopts the shared SearchBar.
- **en-US only, by pre-made decision.** No locale selection exists.
- The `npx expo config --type introspect` proof was substituted (that CLI
  reads `.env`, forbidden in-run) with static tests: app.json carries both
  strings byte-exact AND the installed app.plugin.js provably maps the two
  options onto the two Info.plist keys.

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

**A. EAS BUILD (blocking everything Stage 4D-4 shipped).** Native config
changed twice this stage: `userInterfaceStyle: "automatic"` (dark mode is
INERT in the existing binary and in Expo Go pinned light) AND the
expo-speech-recognition plugin with its native module + the two permission
strings (the mic cannot appear on any existing binary — the boundary
correctly reports unavailable there). One iOS build makes commits 1-9 real
on device. Then `git push` — nothing was pushed autonomously.

**B. Both-themes device flip-through.** Walk every major surface in Light,
Dark, and System (flip the OS setting live: the app must repaint without
restart; a pinned choice must survive restart and steer the KEYBOARD,
alerts, share sheet, and Apple Maps tiles). Known-light surfaces are listed
above and are not findings. On the new build, also exercise the mic in the
dev-tools ComponentCatalog: first hold shows BOTH permission dialogs with
the two authored strings; hold-speak-release lands the phrase in the field;
airplane mode must change nothing (on-device); denying either permission
must leave the mic quietly inert (session ends, nothing raw surfaces).

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
counsel-reviewed pass whether users re-accept. Note the new
NSMicrophoneUsageDescription / NSSpeechRecognitionUsageDescription strings
ship with item A's build — fold voice search into that same
counsel-reviewed pass (the strings promise on-device-only processing, which
the code enforces; the policy should say the same).

**J. Device-test backlog (pre-4D-4 items).** The bid-ordering surface
passed on device (corrected fact). Still open from the previous list: the
post-flow airplane-mode location behaviors, "Suggested starting range"
copy, and the corrected Privacy §7 — fold them into the both-themes
flip-through (item B).
