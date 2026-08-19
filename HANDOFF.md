# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## 2026-08-18 (4D-4 device-pass fixes) - tap-to-talk, worker home anatomy, gold-on-forest: COMPLETE

**No SQL executed, no database contacted, no schema object touched, nothing
pushed, no locked file edited, no `.env` read, no dependency added or
mutated, no frozen web surface touched.** Three commits this run. Base
gate: `mainexpo`, 41975a3 at HEAD, clean tree, baseline bare
`npm run verify` green — 735 pass / 0 fail / 0 skipped, exit code 0 read
directly. Each commit's verify was run bare with the exit code read
directly:

| commit | subject | verify |
| --- | --- | --- |
| 2527726 | voice(tap): tap-to-talk with app-side silence timer and an unconditional 30s ceiling | 741 pass / 0 fail / 0 skipped, exit 0 |
| 424c266 | worker-home(anatomy): the approved 43 anatomy - hero, divided summary card, feed heading | 744 pass / 0 fail / 0 skipped, exit 0 |
| a75458e | theme(sweep): no gold on forest anywhere - HotspotMap pin fixed, the class pinned by scan | 746 pass / 0 fail / 0 skipped, exit 0 |

tests/themeResolution.test.mjs is byte-untouched this run — green with no
new allowlist entry, trivially auditable.

### Commit 1 — voice search is tap-to-talk now

One tap starts listening; listening ends on ~2s of continuous silence after
speech has begun, a hard 30-second ceiling, a second tap, the screen
blurring, the app backgrounding, or unmount. The transcript still reaches
consumers ONLY through `onChangeText`; no auto-submit, no second write
path. On-device-only, the availability probes, first-class unavailable
states, no-network-fallback, vendor importable only from lib/voiceSearch/,
and error-payloads-die-unread all hold unchanged (same tests, updated to
the new interaction).

**How silence-ending actually works, from the installed vendor source
(v3.1.3, the only authority per dispatch):** iOS exposes NO usable silence
signal. `"speechend"` is registered in the module's Events list but never
sent — no `sendEvent("speechend")` exists in
ios/ExpoSpeechRecognitionModule.swift — and the `speechStartHandler` stored
in ios/ExpoSpeechRecognizer.swift is dead code (its trigger
`handleSpeechStart()` has no call site). The vendor's own non-continuous
stop is an internal, unconfigurable, unobservable timer in
ExpoSpeechRecognizer.swift: `Timer.scheduledTimer(withTimeInterval: 3,
repeats: false)` whose callback comment reads "Stop the speech recognizer
if the timer fires after not receiving a result for 3 seconds". So the ~2s
silence detector is APP-SIDE in the boundary (the dispatch's continue-path
for exactly this finding): `start()` now passes `interimResults: true`, and
each result event carrying a transcript restarts a 2s timer
(`VOICE_SILENCE_MS`); when it fires the boundary calls `stop()`, the vendor
delivers the final result (committed once, the normal path) then `end`.
Interim results are never committed. Before speech begins no silence timer
exists — the vendor's own 3s no-speech timeout and the ceiling cover a
session where nothing is said. `continuous: false` and
`requiresOnDeviceRecognition: true` are unchanged.

**The 30s ceiling is independent by construction:** `VOICE_MAX_SESSION_MS`
is armed synchronously inside `beginSession()` BEFORE the first vendor
call, on injected `setTimeout` (real clock in lib/voiceSearch/index.ts,
hand-driven fakes in tests). When it fires it requests `abort()` but calls
`finish()` without waiting for any vendor event — teardown, listener
removal, and `onEnd` happen even if the recognizer never reports anything.
Executed tests prove: the ceiling armed at tap before availability
resolves; the ceiling firing against a vendor that emits NOTHING (no
result, no error, no end) still ends the session, removes all listeners,
commits nothing, and ignores a late-waking vendor; the ceiling ends even a
session stuck inside an unresolved permission prompt; and no timer ever
outlives a session.

**The new microphone usage string (operator-authored, byte-exact in
app.json, pinned by test):**

> BRAZOS uses your microphone only while you are searching by voice, and stops listening when you finish speaking.

`speechRecognitionPermission` is unchanged. Both remain behavioural
contracts the code keeps literally true.

UI: the SearchBar mic is a plain tap target (`onPress` toggle — press-in/
press-out are gone). The listening state keeps the palette-read emerald
wash + filled glyph (no raw literal, no allowlist change). New exit paths:
a `blur` listener via `useContext(NavigationContext)` (raw context, not
`useNavigation()`, so the primitive still mounts outside a navigator) and
an `AppState` listener cancel the session — cancel, not stop: nothing
commits behind the user's back. A11y label flips "Search by voice" /
"Stop listening".

### Commit 2 — worker home rebuilt to the approved anatomy (mockup 43)

Top to bottom as shipped: greeting + Switch to Customer (untouched;
switchMode() confirm intact) → serif hero **"Get hired. / Get paid."**
with the whole second sentence in the palette's green accent
(`colors.emerald` — green in BOTH palettes; never forest, the gold primary
under Prestige) and subtitle **"Grow your reputation."**, mirroring the
customer Home headline token-for-token (display serif, 39/45, -0.3
tracking, ink; subtitle 16/500 homeSlate), full width, no illustration →
search field (untouched) → **the summary card**: ONE surface-filled
container with a gold hairline border, split by a vertical divider —
left: the Taking new work control (title, switch, and its explanatory line
byte-identical: "Shown on your public profile — it tells customers what to
expect."; single writer `updateProfile(accepting_work)` unchanged);
right: POTENTIAL EARNINGS gold section label, the money figure large in
`colors.emerald` (formatBudget() only), the across-N caption; while the
feed loads the figures are Skeleton pulses (the old card's loading gate,
kept — never a fake $0) — and the two count chips as bordered pills INSIDE
the card below the divided row → section heading relabeled **Available
Jobs** with a feed status dot + View all → job cards and below unchanged.

The dark defect is resolved by construction: the old earnings card filled
with forest (gold under Prestige) putting its gold eyebrow gold-on-gold
and its figure white-on-gold; surface + gold border is the e195012
ClientJobDetail pattern, applied. Token values read for both palettes:
light — gold #C8A15B border and label on #FFFFFF surface, emerald #0D6B52
figure; dark — gold #D9B978 border/label on #132A22-family surface
(#1B2620 in the app palette), emerald #4E9E82 figure. Both legible.

**Deviations from the dispatch's framing, reported:**
- "Section heading … with the existing status dot … relabel only": no
  status dot existed in the shipped screen — the dispatch presumed one.
  The mockup shows it, so the dot was ADDED (palette emerald, static, no
  animation) rather than merely kept. It marks the jobs feed, not worker
  presence; the availability half carries no dot, and a test pins both
  facts.
- The mockup's left half reads "AVAILABLE NOW / Offline / Not visible to
  customers" — all forbidden by the dispatch's label constraints, which
  override the mockup. Shipped labels are exactly the constrained ones;
  tests/workerHome.test.mjs's presence-vocabulary ban still passes and was
  extended (no "Available now", no "visible to customers").
- The two halves stayed side-by-side (no stacking fallback needed): the
  left half stacks title/switch/note vertically so nothing wraps against
  the switch, and the money figure keeps numberOfLines={1} with capped
  font scaling.
- The old "Your work today" headline was replaced by the approved hero —
  the target anatomy has one headline, and it is the new one.
- The empty-state copy and the "View all open jobs" a11y label still say
  "open jobs" — below-the-heading content the dispatch froze; only the
  visible heading was relabeled.

### Commit 3 — the same defect everywhere else

Sweep of screens/, components/, ui/ for forest fills (or styles deriving
from one — `emeraldColorsFor().primary` IS `palette.forest`) carrying
gold-family paint. Full inventory, every instance:

**Fixed (the one live instance):**
- components/HotspotMap.native.tsx `pinBadge` + `pinTail` — forest fill
  with a GOLD hairline (`borderColor: colors.gold`): invisible
  gold-on-gold border in dark. The hairline is now per-theme via a ternary
  (`isDark ? …Dark : …Light`): light keeps the reference gold
  byte-identically (the Light override carries the same
  `borderColor: colors.gold` the base style used to), dark uses
  `colors.onForest` — the token that exists for content that must sit on a
  forest fill; the pin count already used it.

**Judged safe and deliberately left, with reasons:**
- Forest fills already carrying `onForest` content (the e195012 sweep):
  SuccessScreen primary button, FormScreen primary button, EmptyState
  action, Chip `chipFilterSelected`, BottomNav create button (isDark →
  onForest glyph), MyJobsHub headerMark + primaryCta, PostJob locationBtn
  + successCircle, WorkerSearch searchButton. Correct by pattern.
- StepHeader `segmentDone` — a bare 4px progress bar; nothing renders on
  it.
- ClientJobDetail `successCircle` — an UNUSED style (no JSX references
  it); nothing renders on it. Left in place (no unrelated cleanup).
- Chip `chipFilterSelected` `borderColor: colors.forest` on its forest
  fill — the deliberate matching-border idiom (border intentionally
  invisible in both palettes); the scan permits exactly this idiom.
- `palette.primary` fills via palette-prop components (Button, JobProgress,
  MapPinIcon) — content is `onPrimary`, not gold-family; out of the
  defect class.
- ModeTransitionOverlay gold shimmer — decorative glow over the baked
  LIGHT transition PNGs, migrates with those assets (standing decision).
- **screens/HomeScreen.tsx (LOCKED)** `heroCard` fills forest with
  `heroEyebrow` gold — the exact defect class, BUT the file imports the
  static light palette (frozen light in both themes), so it is not live
  today. It becomes this defect the day the unlock session themes it —
  fold the e195012/commit-2 pattern into unlock item D below.
- **screens/BrowseJobsScreen.tsx (LOCKED, unmounted)** `banner` forest
  fill with `bannerEyebrow` gold — same situation, and the screen is
  unmounted besides.
- WorkerHomeScreen — already fixed in commit 2; excluded per dispatch.

**The guard:** tests/goldOnForest.test.mjs. The SAME-OBJECT form is a
reliable static scan and is enforced repo-wide over screens/, components/,
ui/: no style object may both fill with forest and set `color:` from
{gold, goldSoft, forest} or a border color from {gold, goldSoft}
(matching-border idiom permitted); the scan self-checks that it saw >100
files and ≥10 real forest fills. The CROSS-OBJECT form (fill in one style,
gold text in a sibling style on a child — how WorkerHome failed) cannot be
expressed honestly by a text scan, so the repaired surfaces are pinned
individually instead, as the dispatch allows: WorkerHome's card in
tests/workerHome.test.mjs, the HotspotMap pin in goldOnForest itself.

### Voice-search facts an operator should know (carried forward, updated)

- **The mic still renders on NO current binary** — the boundary correctly
  reports unavailable until the EAS build (item A) ships the native
  module. After that build it appears on WorkerSearchScreen (Customer) and
  WorkerHomeScreen (Worker) whenever on-device en-US recognition exists.
- The interaction is now TAP-to-talk; the new microphone permission string
  above describes it and the code enforces it (silence stop, 30s ceiling,
  blur/background/unmount cancel).
- en-US only, by pre-made decision. No locale selection, no transcript
  stored, logged, or sent anywhere.
- Customer Home's stale "Voice search is coming" dialog remains — a known
  LOCKED-screen item awaiting the operator's unlock session (item D).

### Deliberately left light (follow-ups, not bugs — unchanged)

- **LOCKED screens** (CLAUDE.md list) render frozen light in dark mode
  until the operator unlocks them; the unlock patch is mechanical
  (themedStyles + useThemeColors + drop the themeResolution allowlist
  line) — plus, now inventoried above: Home's heroCard and BrowseJobs's
  banner must take the surface-fill/gold-border pattern when themed, or
  they become live gold-on-forest defects.
- **lib/authTheme.ts + auth components** — literals allowlisted with
  reasons; authTheme is never-modified.
- **ModeTransitionOverlay** gold chrome + `'#FFF3D6'` shimmer — paired
  with the baked LIGHT transition PNGs; migrates with the assets.
- **lib/hotspots.ts tier glows** — theme-independent heat semantics.
- **SegmentedControl thumb shadow** cosmetic nit — for the device pass.

## Applied reality - staging `zzkumxcjtbqoselzptig`

Unchanged by this run — repository-only. phase74/75 officially applied and
verified green 2026-08-18; phases 67-73 applied and verified 2026-08-16. No
unapplied migration exists in the repository; the location-CHECK is
DEFERRED (operator decision), so nothing awaits apply.

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
changed again this run: the NEW NSMicrophoneUsageDescription string rides
the expo-speech-recognition plugin (plus the earlier
`userInterfaceStyle: "automatic"` and the native module itself). One iOS
build makes dark mode AND the tap-to-talk mic real on device. Then
`git push` — nothing was pushed autonomously.

**B. Both-themes device flip-through.** Walk every major surface in Light,
Dark, System (live OS flips must repaint without restart; a pinned choice
must survive restart and steer keyboard, alerts, share sheet, Maps tiles).
On the new build exercise the mic on the REAL surfaces with the NEW
interaction: tap once (both permission dialogs show the authored strings on
first use), speak, and confirm it stops ~2s after you stop; confirm a
30-second monologue is cut off; confirm a second tap stops it; navigate
away / background mid-listen and confirm the mic dies without writing to
the field; airplane mode must change nothing (on-device); denial leaves the
mic quietly inert. Also walk the rebuilt Worker Home in both palettes —
hero accent, gold-hairline summary card, chips inside the card, feed dot —
and the map pins in dark (near-black hairline on gold pins, unchanged in
light).

**C. Dark asset generation — NOW ALSO THE WORKER HERO ILLUSTRATION.**
docs/audits/DARK_ASSET_INVENTORY.md is the brief — splash config first,
then the two transition PNGs, then the Home illustrations for the unlock
session. NEW ITEM: the worker-home hero illustration (mockup 43's toolbox
art, right of "Get hired. Get paid."). The screen ships full-width text
with no artwork by design — no image was generated, sourced, or referenced
in-run. When the asset exists, mount it beside the hero block (mirror the
customer Home's `homeHeroArt` arrangement) and constrain the headline
width to match.

**D. The authTheme/locked-screen unlock session.** The mechanical patch
shape is in "Deliberately left light". Home is the highest-value unlock;
it also carries the two un-converted search inputs (adopt SearchBar for a
uniform mic), the stale "Voice search is coming" dialog to remove, and —
inventoried this run — the heroCard gold-on-forest pair that must take the
surface-fill/gold-border pattern when themed (BrowseJobs's banner likewise,
if it ever remounts).

**E. TestFlight retry is possible WITHOUT swapping keys.** The EAS gate
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
copy) should land before any external beta.

**I. PRIVACY_VERSION decision.** The corrected WORKING DRAFT privacy policy
has not had its version bumped. Note the microphone usage string CHANGED
this run (tap-to-talk wording) and ships with item A's build — fold voice
search into the counsel-reviewed pass; the strings promise on-device-only
processing that stops when you finish speaking, which the code enforces.

**J. Device-test backlog (pre-4D-4 items).** Still open: the post-flow
airplane-mode location behaviors, "Suggested starting range" copy, and the
corrected Privacy §7 — fold into item B.

**K. `repo_manifest.txt` is gone.** The stray untracked root file the
previous handoff flagged no longer exists — the tree was clean at this
run's base gate. Nothing to do.
