# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## 2026-08-18 (Stage 4D-4 tail) - voice search made REACHABLE: COMPLETE

**No SQL executed, no database contacted, no schema object touched, nothing
pushed, no locked file edited, no `.env` read, no dependency added or
mutated, no frozen web surface touched.** One commit this run. Base gate:
`mainexpo`, a3c1279 an ancestor, baseline bare `npm run verify` green —
730 pass / 0 fail / 0 skipped, exit code 0 read directly. After the change:
**735 pass / 0 fail / 0 skipped, exit code 0**, again bare with the exit
code read directly. One pre-existing untracked file (`repo_manifest.txt`, a
generated UTF-16 file listing, unrelated to any task file) was preserved
untouched and NOT staged.

### What shipped

4D-4 Block 2 had left the press-and-hold mic mounted only in
dev-tools/ComponentCatalog.tsx. This run converted every unlocked screen
with a free-text search input to the shared `ui/primitives/SearchBar`, so
the mic now rides the two live search surfaces:

| surface | mode | conversion |
| --- | --- | --- |
| screens/WorkerSearchScreen.tsx | Customer (Discover tab root; also pushed from the locked Home's search affordance) | The "What do you need help with?" field. Submit stays dual-path (keyboard return + the retained forest arrow button, now in SearchBar's new `trailing` slot), typing still resets the run guard / results / pinned chip, the clear control performs the identical state reset through `onChangeText('')`, `autoFocus` keeps the tab-root-vs-pushed rule, placeholder and a11y label verbatim. |
| screens/WorkerHomeScreen.tsx | Worker (worker tree's initial route) | The "Search for jobs or areas" field that mirrors the locked 48's. Divider + arrow-circle submit retained verbatim in `trailing`; `disableClear` keeps the mirror's no-clear-control design; dispatch to WorkerResults mode 'search' untouched. |

Both screens pass their existing container style into SearchBar's `style`
prop, so each field keeps its exact geometry (WorkerSearch's 64pt xl-radius
shadowed row; WorkerHome's locked-48-mirror pill). What SearchBar
standardizes — the only user-visible deltas beyond the mic: leading search
icon (18pt emerald), input typography (tokens `type.body`, 14pt, was 16),
placeholder color token, iOS `keyboardAppearance` following the resolved
theme, and WorkerSearch's clear glyph becoming the standard `close-circle`.
Every behavioural axis the dispatch enumerated is preserved: placeholder
text, value/onChangeText wiring, no debounce anywhere (both fields are
submit-driven, before and after), submit behaviour, clear affordance
semantics, keyboard type / return key ("search"), autocorrect +
autocapitalize posture ("sentences" + autocorrect on both).

### SearchBar additive props (defaults keep existing consumers byte-identical)

Four optional props, none renamed, no default changed:

- `autoCapitalize` — default `'none'`, the previously hardcoded literal.
- `autoCorrect` — default `false`, the previously hardcoded literal.
- `disableClear` — default `false`; the clear conditional becomes
  `value.length > 0 && !disableClear`, identical when false.
- `trailing` (ReactNode) — rendered after the mic inside the field; absent
  by default, rendering nothing.

With nothing new passed (the catalog's usage), the rendered tree is
identical to before — the defaults reproduce the exact prior JSX. Proven by
the new static test "SearchBar's additive props default to the exact
posture existing consumers had" plus the untouched pre-existing SearchBar
suite. `disableVoiceSearch` is passed NOWHERE (statically asserted): the
mic is on for every converted surface.

### Deliberately skipped search-like surfaces (each with its reason)

- **screens/HomeScreen.tsx** ("Describe a service or problem") — LOCKED.
  Future unlock item: convert on the operator's unlock session (item D).
- **screens/BrowseJobsScreen.tsx** ("Search for jobs or areas") — LOCKED
  and unmounted (atlas 48). Same future unlock item, if it ever remounts.
- **components/CountryPicker.tsx** ("Country or code") — a list filter
  over a fixed country set inside the auth sheet, not a search query
  surface; also rendered by locked auth screens.
- **components/CategoryAccordion.tsx** ("Other (type a category)") — a
  custom-category entry field, not search.
- Everything else with a TextInput is an amount, address, message,
  checklist, review, or description field — not search.

### Tests (5 new, all in tests/voiceSearch.test.mjs; no existing test edited)

Converted surfaces render SearchBar from the primitives barrel with no raw
TextInput left; no converted surface opts out of the mic or touches the
voice boundary directly; WorkerSearch's behaviour pins (submit dual-path,
run-guard reset, autoFocus rule, verbatim copy); WorkerHome's locked-48
mirror pins (disableClear, divider + arrow, submitSearch dual-path); the
SearchBar defaults proof. Existing suites that pin these screens
(workerHome, customerCore, workerMatching, hardening, conversion, layout,
themeResolution, themeTokens) all pass unmodified.

### Voice-search facts an operator should know (carried forward, updated)

- **The mic still renders on NO current binary** — the boundary correctly
  reports unavailable until the EAS build (item A) ships the native module.
  After that build, the mic appears on WorkerSearchScreen (Customer mode)
  and WorkerHomeScreen (Worker mode) whenever on-device en-US recognition
  is available — no longer only in the dev catalog.
- The two iOS permission strings remain a behavioural contract the code
  keeps literally true: hold-to-talk only, on-device only, transcript's
  one egress is `onChangeText`.
- en-US only, by pre-made decision. No locale selection exists.

### Prior 4D-4 context (compressed; details in git history a3c1279 and earlier)

Block 1 (dark theme, commits 1-6) and Block 2 (voice search, commits 7-9)
both shipped 2026-08-18. Operator-confirmed facts from that session still
standing: phase74/75 verified applied on staging (green
`verify-schema.mjs`, zero missing/pending); the location-CHECK migration is
DEFERRED by operator decision (zero offending rows live; rides the next
migration); the bid-ordering device walk-through passed on a physical
iPhone. Known cosmetic gap: a pinned-Dark user on a light-system phone can
catch one frame of the light pre-resolution gate on cold start — recorded
in lib/ThemeContext.tsx, invisible in practice behind the locked launch
layer.

### Deliberately left light (follow-ups, not bugs — unchanged)

- **LOCKED screens** (CLAUDE.md list) render light in dark mode until the
  operator unlocks them; the unlock patch is mechanical (themedStyles +
  useThemeColors + drop the tests/themeResolution.test.mjs allowlist line).
- **lib/authTheme.ts + auth components** (AuthNotice, CountryPicker scrim)
  — literals allowlisted with reasons; authTheme is never-modified.
- **ModeTransitionOverlay** gold chrome + `'#FFF3D6'` shimmer — paired with
  the baked LIGHT transition PNGs; migrates with the assets.
- **lib/hotspots.ts tier glows** — theme-independent heat semantics.
- **SegmentedControl thumb shadow** cosmetic nit — for the device pass.

## Applied reality - staging `zzkumxcjtbqoselzptig`

Unchanged by this run — repository-only. phase74/75 officially applied and
verified green 2026-08-18; phases 67-73 applied and verified 2026-08-16. No
unapplied migration exists in the repository; the location-CHECK is
DEFERRED (operator decision above), so nothing awaits apply.

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
correctly reports unavailable there). One iOS build makes all of 4D-4 —
including this run's reachable mic — real on device. Then `git push` —
nothing was pushed autonomously.

**B. Both-themes device flip-through.** Walk every major surface in Light,
Dark, and System (flip the OS setting live: the app must repaint without
restart; a pinned choice must survive restart and steer the KEYBOARD,
alerts, share sheet, and Apple Maps tiles). Known-light surfaces are listed
above and are not findings. On the new build, exercise the mic ON THE REAL
SURFACES now: Customer → Discover (WorkerSearch) and Worker → Home. First
hold shows BOTH permission dialogs with the two authored strings;
hold-speak-release lands the phrase in the field exactly as typing would
(WorkerSearch: results/chip reset then submit by hand; WorkerHome: submit
dispatches to WorkerResults); airplane mode must change nothing
(on-device); denying either permission must leave the mic quietly inert.
Also confirm the two converted fields kept their look: geometry unchanged,
14pt input text, standard clear glyph on WorkerSearch, no clear control on
WorkerHome.

**C. Dark asset generation.** docs/audits/DARK_ASSET_INVENTORY.md is the
brief — splash config first (white flash on every dark cold start), then
the two transition PNGs (re-measure the gold-line geometry after), then the
Home illustrations for the unlock session.

**D. The authTheme/locked-screen unlock session.** The exact patch shape is
in "Deliberately left light" above. Home is the highest-value unlock: it is
the first themed-app screen a dark-mode user sees rendering light — and it
now also carries the two remaining un-converted search inputs (Home's
"Describe a service or problem" and the unmounted atlas-48 field), which
should adopt SearchBar on unlock so the mic is uniform.

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

**J. Device-test backlog (pre-4D-4 items).** Still open: the post-flow
airplane-mode location behaviors, "Suggested starting range" copy, and the
corrected Privacy §7 — fold them into the both-themes flip-through (item B).

**K. Stray file at repo root.** `repo_manifest.txt` (untracked, UTF-16 file
listing, looks generated) predates this run and was left exactly as found.
Delete or ignore it at your discretion; no run should stage it.
