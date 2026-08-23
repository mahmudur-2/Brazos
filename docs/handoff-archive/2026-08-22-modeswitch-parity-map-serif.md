# 2026-08-22 — mode-switch crash root cause, Home parity, pills, Map, hero serif

Six commits, landed in dispatch order on `mainexpo` from base `66634bc`.
Baseline bare `npm run verify`: exit 0, 860 pass / 0 fail / 0 skipped.
Final: 864 pass / 0 fail / 0 skipped. Every delta is a named fence:
+1 the two-commit-swap fence (mode.test.mjs), +2 the worker-pill mirror and
customer-arrow fences (workerHome / voiceSearch), +1 the Map structure fence
(workerDiscovery); the workerDiscovery B3 codec tests and the themeTokens
no-serif fence were replaced 1:1 by their successors.

## d2ed51f — the mode-switch navigation red box, root cause

Device symptom: after any mode switch, every navigate inside the new tree's
Home tab red-boxed ("The action 'NAVIGATE' ... was not handled by any
navigator" — WorkerResults after switching to worker, WorkerSearch after
switching back), although crossTabNavigation.test.mjs:271 proves at every
commit that both routes are registered in their stacks. Reload fixed
whichever mode was mounted at reload; symmetric.

Root cause, pinned in the INSTALLED @react-navigation source (core 7.21.11):
the NavigationContainer keeps ONE authoritative root-state store, and
`useNavigationBuilder` adopts whatever initialized state that store hands it
when the router `type` matches — `isStateInitialized`'s only identity check
(useNavigationBuilder.tsx:442–448, 648–654). Both trees root in a bottom-tab
navigator and both Home stacks are native stacks, so a single-commit swap of
CustomerRoot/WorkerRoot made the incoming tree's first render adopt the
outgoing mode's state. The route-names fixups preserve route keys and the
state's own key (SwitchRouter.tsx:282–291/320–323, StackRouter.tsx:296–302),
which lets the outgoing tree's unmount cleanup (SceneView.tsx:67–97,
useNavigationBuilder.tsx:844–855) and the incoming tree's first publication
(the layout-flush of useSyncState.tsx:84–101 plus the mount-notify at
813–842) interleave over that one store. The tree DRAWS correctly — render
uses the locally fixed `nextState` (line 804) — while `getState()` at
dispatch time (859–867) serves the store, left holding the other mode's
nested Home-stack routeNames; `useOnAction` (line 78) evaluates the NAVIGATE
against it, StackRouter rejects the name, the tab router has no such route,
there is no parent, and RN7 does not search children without a target. The
exact final interleaving that makes the broken store STABLE on device was
not derivable statically — several orderings self-heal on paper — and the
fix deliberately does not depend on winning any interleaving.

Fix (modes/ModeProvider.tsx, navigation/ModeShell.tsx): the swap is TWO
commits. `treeMode` trails `mode` by one commit; ModeShell renders NO tree
while they differ (a ground-painted gap frame, inside the switch overlay's
at-rest window — 200ms full-motion, ~35ms reduced, both > 1 frame). The
outgoing tree therefore unmounts completely — its cleanup empties the store
— before the incoming tree first renders and initializes fresh: nothing to
adopt, no cleanup left to race, in either direction. Initial resolution and
sign-out set both values in one commit, so the gap exists only during a
switch. The Stage 4D awaited-switch contract moved with it:
pendingSwitchResolvers resolve from the [treeMode] effect, which fires after
the target tree's own effects — still the earliest dispatchable moment, and
never during the gap.

Runtime render-testing is impossible here (no jest/react-test-renderer/
react-dom-with-DOM in the repo, and no new dependencies), so the mechanism
is fenced statically: mode.test.mjs pins the treeMode state, the trailing
effect, the mode-only onSwitch seam, the both-at-once resolution writes, the
no-tree gap branch (mutated red by collapsing the swap to one commit,
observed, reverted) and the [treeMode] resolver; emeraldFences/layout track
the swap expression. Device repro for the operator is in the tap-through
list below.

## 7b36e05 — light/dark Home parity

Operator instruction: on both Home screens light inherits dark's IMPLEMENTED
layout numbers exactly; only colours (and artwork files) differ. This
dissolved the standing light-freeze for the two Homes; emeraldFences
home(19) now enforces the new contract (a sweep proving every *Dark style on
both Homes carries colours only) instead of the old freeze.

Customer Home, light old -> new: hero box 112x124@(-6,47)/contain ->
HERO_ART_DARK 184x162@(-33,70)/cover; hero headline '73%'/39/45 -> computed
column / design.heroFontSize (33) / x38/31 leading (40) / marginTop 30;
subtitle 16/mt8 -> 14/mt10; mode-switch ring 1.25 -> 1 and label 15 -> 13
(sans ladder); search marginTop 0 -> 8; service gaps 8/8 -> 10/6 and chip
paddings ->12/8, goldOutlineChip loses its 1.25 width; promo card mt 0 -> 3,
border 0 -> 1 (transparent in light), body gap 12 -> 20, copy reserve fixed
68 -> computed, copy gap 4 -> 8; promo heading 25/29 (three lines) -> 19/30
(two, both themes); B mark fixed 79x101@(12,10) -> computed bDrape.art
(0.277 screen) @(21,0) — the same rendered mark size in both modes is what
un-wraps the heading; "Post a job" -> "Post a job ›" both; CTA border 0 -> 1
transparent; Live Nearby mt 0 -> -6, section title 22 -> 20, View all 15 ->
14; job cards border 0 -> 1 transparent. Worker Home: hero copy column
full-width -> 58% both themes; the toolbox crop renders in BOTH themes at
162x108@(-10,18) — it carries a BAKED DARK HALO DISC (probed: 40% alpha
cut-out, opaque ring at 0.42 x min-dim), which light shows as drawn; look at
it on a device. WorkerJobCard hairlines moved into the base box (transparent
in light). BottomNav: the [ + ] is one geometry — pill-ratio 60pt, centred
inset (raise 2), glyph 37 — light keeps only forest/gold colours; the bar
was already mode-identical.

## 4cce832 — search arrow + worker category pills

Customer Home's trailing gold arrow was a bare <Ionicons>; it is now a
Pressable firing the same submitSearch() the keyboard fires (empty query =
silent no-op, inside submitSearch). REPO CONTRADICTED THE PROMPT'S "both
modes": worker Home's arrow was already a Pressable dispatching
submitSearch, fenced since 4D — only the customer side was dead.

Worker Home draws customer Home's category pill row under its search bar —
same Chip service variant, same categories, same geometry, same "Other" ->
ServicePickerSheet. The two-row arrangement is ONE definition now
(lib/skillCategories.HOME_SERVICE_ROWS; HomeScreen's private slice deleted);
workerHome.test.mjs pins the two screens' row styles byte-identical. A pill
lands on the EXISTING WorkerResults with a new optional `category` param
(plain string, WorkerSearch's shape) that SEEDS the screen's existing
job-filter model — badge shows it, the sheet's category chip arrives
pre-selected, clearing filters clears it — allow-listed against
JOB_CATEGORY_LABELS so an unknown key seeds nothing.

## bba471d — Map restructure + session-only distance

The "MAP DISCOVERY / Open jobs on the map" header card is GONE (the customer
tier legend rode in it and went with it); the map fills title-to-bottom-row.
The header's top-right control is the distance filter now: it opens a Sheet
(existing primitive) holding the same DistanceChips presets plus a custom
stepper — 1–50 whole miles, clamped, applied on each tap; from Any the first
tap turns the dial on at 10 mi — and the control widens into a labeled pill
("10 mi") when a radius is applied. The bottom "NEAR YOU" card is one
compact bar on the page ground: count left, "View list →" right, no slab.
The only map mockup on disk (Discover_Map_Dark.png) is a REJECTED word-named
render and draws the very slab removed here; it was READ for intent and is
logged as such — no numbered master exists for this screen, so the
dispatch's instruction governed, and the bar sits on the page ground rather
than overlaying tiles so its text never fights the map for contrast.

Distance filter state is SESSION-ONLY (Map + Available Jobs list):
lib/discoveryFilterStorage.ts is an in-memory session Map — cold start = Any
by construction, the choice carries between Map and list because both read
the same store, and the module's ONE AsyncStorage call is removeItem on the
retired per-account key (once, best-effort, no migration file; nothing is
adopted from it — the dispatch's "read-then-remove" is satisfied by the
in-code removal, and no read is needed because cold start must be Any
regardless). DistanceFilterMiles widened to a validated number (whole miles
1–50, isDistanceFilterMiles / clampDistanceFilterMiles); the persistence-era
encode/coerce codec is deleted with the persistence.

## c05b290 — the customer hero returns to Playfair (one role)

DECISIONS.md D5's third dated note carries the full record. Recovered
byte-identical from fd00e1a (hash-verified: TTF 86bfcfa2…, OFL 13153890…),
nothing downloaded; ExtraBold left in history (no consumer). Registered the
pre-removal way (LaunchGate useFonts + child hold + sessionReady coupling +
error release). The hero style names the new role-scoped token
fonts.displayHero and DROPS its fontWeight (a bundled static makes weight
inert on iOS; the pre-removal '600' has no 600 static in history — Bold is
the nearest recovered face and is what renders). Size/leading/tracking
untouched. themeTokens' no-serif fence NARROWED to the one-serif fence —
mutated red by pointing sectionTitle at the face ("…must be named by exactly
ONE style — the hero title — not 2"), reverted, green.

## Prompt-vs-repo contradictions found

1. "The trailing arrow ... (both modes) currently does nothing" — worker's
   arrow was already functional and fenced; only customer's was dead.
2. The commit-1 prompt suggested adding a navigate-target-vs-registered-
   routes test — it already exists (crossTabNavigation.test.mjs:271) and was
   green at the broken HEAD, which is itself evidence the defect was state
   identity, not registration.
3. "Read the Map master before choosing" — no numbered map master exists on
   disk (33/34 absent, per the standing HANDOFF note); the only map mockup
   is the rejected word-named render, which draws the slab the dispatch
   removes.

## Guard friction (recurring item 12)

`Write` to the session's own scratchpad was NOT needed this run (probes went
to `.audit-scratch/`), and no guard rule fired on any command. The
commit-message path (`git commit -F .audit-scratch/…`) was used throughout.

## Device checks OWED from this run (operator, physical device)

Under ten minutes, in order:

1. Cold start, customer Home: the hero title renders Playfair Bold (a real
   serif), "off your plate." stays on ONE line inside the column, and the
   launch screen hands over normally (the gate now also waits for the face).
2. Light mode, customer Home: layout is IDENTICAL to dark (hero box, search
   Y, chip rows, promo card two-line heading, B mark size, "Post a job ›",
   [ + ] inset in the bar) — only colours differ. Then the same pass on
   worker Home, INCLUDING the toolbox crop now visible in light: its baked
   dark halo disc is an asset property — judge whether it is acceptable on
   ivory or needs a light-specific crop.
3. The commit-1 repro, both directions: fresh load customer -> pill tap
   (works) -> switch to worker -> "View all", a job card, a category pill
   (all must work, no red box) -> switch back to customer -> pill tap and
   Discover (work). No reload anywhere.
4. Worker Home: tap each category pill — WorkerResults opens with the filter
   badge showing 1 and the sheet's category pre-selected; tap the search
   arrow with text (searches) and empty (nothing, no error). Customer Home:
   same two arrow taps.
5. Map: no header card; the map runs title-to-bottom-row; the filter icon
   opens the sheet; presets and the stepper (try 7 mi) apply immediately and
   the header control shows "7 mi"; the bottom row is one slab-free line;
   "View list" opens the list with the same radius; kill the app, relaunch —
   the filter is back to Any.

## Still open, unchanged by this run

G-002 (CI cannot run the 120-test guard suite on ubuntu-latest) and the
standing items 1–13 of the live HANDOFF list, except where this run's
commits touched them (none were items on that list).
