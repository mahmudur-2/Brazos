# Emerald correction pass — independent verification, 2026-08-19

Adversarial verification of the eleven `emerald(N)` commits before they are
pushed. Written by a run that did NOT make them and did not read the chat log
that produced them: every verdict below is derived from `git log`, `git diff`
and the source at HEAD.

* Range under audit: `de048e9..HEAD` (`de048e9` = `fidelity(7)`, the last
  pushed commit; `origin/mainexpo` is still at it).
* HEAD at audit start: `098e108` (`emerald(11)`), branch `mainexpo`, tree clean.
* Baseline: bare `npm run verify`, stdout redirected, exit read from `$?` —
  **exit 0 · 775 pass · 0 fail · 0 skipped · 7 suites.** That is the floor.

---

## OPERATOR MUST READ

Nothing in this pass is incompatible with anything else in the repository.
There is no cross-run collision, because **only one run landed** (see audit 1).

Three things the operator should know before pushing, none of them a blocker:

1. **emerald(2) ADDED a painted layer; it did not remove one.** The decision as
   worded asks for everything behind the tab pill to be transparent. The run
   determined that nothing of ours was painting there at all, and that the white
   band was the *iOS root view* showing through a **missing** ground. So the fix
   is a new `backgroundColor: palette.background` on `navigation/ModeShell.tsx`
   — the opposite of "make it transparent." The reasoning is correct and the
   band is gone, but a future run that reads the decision literally and deletes
   that ground brings the white band straight back. It is now fenced twice
   (`tests/layout.test.mjs:47` and this run's new suite).

2. **Two currency figures DID change colour**, so "no currency figure's colour
   changed anywhere" is PARTIAL, not CONFIRMED. Both are *selection chips whose
   label happens to be an amount*, and only in their SELECTED dark state:
   `screens/ReviewAndTipScreen.tsx` tip presets and `components/JobFilterSheet.tsx`
   budget chips both went emerald → gold under D6's one-selection rule. Every
   money figure in a money role — `MoneyText`, `JobCard`, `WorkerJobCard`,
   `BrowseJobCard`, `MarketJobPreview`, `HubCard` — is byte-identical. The run's
   own end-of-pass confirmation checked only three files and would not have
   caught this.

3. **`lib/navigation.ts:449–455` is a stale comment** that still describes the
   pre-emerald(1) customer bar ("the two BARS are the same five tabs — Home ·
   Map · My Jobs · Messages · Profile — with the customer tree additionally
   registering Discover as a HIDDEN route"). emerald(1) rewrote the per-field
   docs directly beneath it and missed the block above. Not functional; logged
   under "Found, not fixed" because a future run reading it would believe the
   customer bar still carries Map and My Jobs.

**Verdict: SAFE TO PUSH.**

---

## Audit 1 — cross-run reconciliation

**Result: clean. Only the emerald run is present in the range.**

`git rev-list --count de048e9..HEAD` = **11**, and all eleven subjects begin
`emerald(`. `git log --all --grep="^light("` returns nothing: **no light-mode
parity run landed anywhere in this repository, on any ref.** The hypothetical
collision this audit exists to find does not exist, so there is nothing to
reconcile and no test in one run contradicting a test in another.

Prefix census over the whole Prestige campaign (`715ddf8~1..HEAD`), for the
record:

|Prefix|Count|Range|Relationship to this audit|
|-|-|-|-|
|`prestige(0a)`–`(7z)`|35|`715ddf8..04410c2`|Below the range. Not audited.|
|`fidelity(1)`–`(7)`|7|`fdb379f..de048e9`|Below the range; `de048e9` is its LAST commit and the audit BASE.|
|`emerald(1)`–`(11)`|11|`4af3a35..098e108`|The range under audit.|
|`light(1)`–`(7)`|**0**|—|Never landed.|

The one adjacency worth naming: `fidelity` is the emerald run's immediate
predecessor, and emerald deliberately reverses several fidelity decisions (the
emerald/red toggle, the flat clearance token, the seven scrims). That is **not**
a blind collision — the emerald run read the fidelity work, names it as the
thing it is reversing, and records every reversal in
`docs/mockups/PRESTIGE_RUN_REPORT.md` §(d). The two runs are sequential and
aware of each other, which is exactly the property the hypothetical light run
would have lacked.

**Light-mode values:** because no light run restored anything, there is no
"deliberately restored light value subsequently overwritten" case. Independently
verified that the emerald pass left light alone where it claims to
(§ Audit 2, D5 / D6 / D7 / D8 / D10) rather than inferring it from the absence
of a light run.

---

## Audit 2 — adversarial decision verification

### A note on the D-numbering

The correction pass's own record uses `D8` for two different things — the modal
scrim (`PRESTIGE_RUN_REPORT.md:1376`) and a freeze that includes money
(`:1471`). That ambiguity cannot be resolved from the repository, because the
emerald dispatch itself is not in it. This table is therefore keyed to the
**eleven commits**, which are unambiguous and cover every decision; the
decision label each commit carries is named in its row. Every specific claim the
audit brief lists is verified below the table, whichever commit owns it.

### Verdict table

|#|Commit|Decision|Verdict|
|-|-|-|-|
|D1|`4af3a35` emerald(1)|Customer bar → Home · Discover · [ + ] · Messages · Profile|**CONFIRMED**|
|D2|`e28e780` emerald(2)|Nothing behind the pill paints but the pill; D3 glyph sizing|**PARTIAL** — intent met, instruction inverted (see below)|
|D3|`c2e9d6b` emerald(3)|One derived floating-nav clearance; flat 68 deleted|**CONFIRMED**|
|D4|`315b481` emerald(4)|WorkerResults: register it or build it|**CONFIRMED** — neither branch applied; tests only, zero source|
|D5|`9ec0b18` emerald(5)|Convert the sign-in screens; `authTheme` frozen|**CONFIRMED**|
|D6|`bc88aa9` emerald(6)|One boolean in one place for the toggle|**CONFIRMED**|
|D7|`7179d63` emerald(7)|One way to say chosen, one way to say dead|**CONFIRMED**|
|D8|`a671758` emerald(8)|The band under Cancel; all seven scrims 0.7 → 0.55|**CONFIRMED**|
|D9|`30af8db` emerald(9)|MapKit tiles follow the resolved theme|**CONFIRMED**|
|D10|`d85c2aa` emerald(10)|Three master deltas; one real, two skipped|**CONFIRMED**|
|D11|`098e108` emerald(11)|The record|**CONFIRMED** — docs only, 0 source files|

Cross-cutting freezes:

|Freeze|Verdict|
|-|-|
|Money-figure colour immobility|**PARTIAL** — see F1|
|Verification badge absent from every user-visible surface|**CONFIRMED**|
|No raw colour literal entered the contract scan|**CONFIRMED**|
|No config / manifest / migration / frozen-web file touched|**CONFIRMED**|

---

### D1 — the customer bar — **CONFIRMED**

**Evidence.** `navigation/CustomerRoot.tsx:155–191` registers, in order:
`Home`, `Discover`, `Create`, `Messages`, `Profile`, then `Map` and `MyJobs`
each carrying `options={HIDDEN_TAB_ITEM_OPTIONS}`.
`ui/primitives/BottomNav.tsx:384–386` defines those options as
`tabBarItemStyle: { display: 'none' }`, which removes the item from Yoga layout
entirely rather than leaving a phantom flex slot.
`ui/primitives/BottomNav.tsx:107` pins `CUSTOMER_BAR_TABS = ['Home',
'Discover', 'Messages', 'Profile']` and `:112` pins `CUSTOMER_CREATE_SLOT = 2`.

**Mechanism.** Registration order IS bar order in `@react-navigation/bottom-tabs`.
Four destinations plus the action spliced in at index 2 draw as
`Home · Discover · [ + ] · Messages · Profile` — **five slots, of which the
[ + ] is the third of five, i.e. dead centre.** No slot is My Jobs.

**A discrepancy with the audit brief, stated plainly.** The brief asks to
confirm "exactly five slots **plus** the centre [ + ]", which would be six. That
describes the state *before* emerald(1): `PRESTIGE_RUN_REPORT.md:979` records
"the customer bar now has six slots, not five", and `de048e9:ui/primitives/BottomNav.tsx:80`
confirms the old roster was `['Home','Map','MyJobs','Messages','Profile']` + [ + ]
= six drawn slots. emerald(1) took it to **five total**, which is what the
decision's own roster (`Home · Discover · [ + ] · Messages · Profile`) names.
The implementation matches the decision; the brief's phrasing describes the
predecessor.

**Falsifier.** Looked for a second `tabBarItemStyle` that could override the
hidden options (per-screen `options` merge AFTER `screenOptions` in React
Navigation, so nothing in `bottomNavScreenOptions()` can win) — none exists.
Looked for a replacement `tabBar` renderer that might draw its own roster —
`BottomNav.tsx:15–21` states there is none, and `tests/mode.test.mjs:445`
already pins "there is exactly one bottom nav implementation". Looked for a
`MyJobs` entry in `CUSTOMER_BAR_TABS` — absent. Did not find a way to make the
bar draw six slots or a My Jobs item.

---

### D1 (second half) — My Jobs reachability and every deep link — **CONFIRMED**

Not spot-checked. **Every** dispatch in the tree that names the `MyJobs` TAB was
enumerated by grepping the whole source for `MyJobs` and reading each hit:

|#|Call site|Dispatch|Resolves?|
|-|-|-|-|
|1|`navigation/CustomerRoot.tsx:218`|`navigateAcrossTabs('MyJobs')` — the [ + ] sheet|✔|
|2|`hooks/useJobOwnerActions.ts:126`|`navigateAcrossTabs('MyJobs')`|✔|
|3|`screens/BidSentScreen.tsx:44`|`navigateAcrossTabs('MyJobs')`|✔|
|4|`screens/JobDetailScreen.tsx:421`|`navigateAcrossTabs('MyJobs')`|✔|
|5|`screens/JobDetailScreen.tsx:470`|`… 'MyJobs', 'WorkerJob'`|✔|
|6|`screens/ChatScreen.tsx:643`|`… 'MyJobs', 'Checkout'`|✔|
|7|`screens/ChatScreen.tsx:680`|`… 'MyJobs', 'WorkerJob'`|✔|
|8|`screens/ChatScreen.tsx:687`|`… 'MyJobs', 'JobDetail'`|✔|
|9|`screens/ChatScreen.tsx:710`|`… 'MyJobs', 'JobDetail'`|✔|
|10|`screens/ChatScreen.tsx:713`|`… 'MyJobs', 'ClientJobDetail'`|✔|
|11|`screens/PostJobScreen.tsx:527`|`… 'MyJobs', 'MyJobsHub'`|✔|
|12|`screens/PostJobScreen.tsx:551`|`… 'MyJobs', 'ClientJobDetail'`|✔|
|13|`lib/offerNavigation.ts:37`|`OFFER_JOB_TAB = 'MyJobs'`|✔|
|14|`lib/notificationRoutes.ts:262`|`navigateChecked('MyJobs','ClientJobDetail')`|✔|
|15|`lib/notificationRoutes.ts:267`|`navigateChecked('MyJobs','JobDetail')`|✔|

**Every notification deep link, enumerated exhaustively.** `TAB_FOR_SCREEN`
(`lib/notificationRoutes.ts:37–49`) is the complete map — five entries, no
others, and `resolveTarget()` fails closed on anything absent from it
(`:142–143`, `:178–179`):

|Payload `screen`|Tab|Registered on the customer navigator?|
|-|-|-|
|`Chat`|`Messages`|✔ `CustomerRoot.tsx:173` (drawn)|
|`ClientJobDetail`|`MyJobs`|✔ `CustomerRoot.tsx:187` (hidden, registered)|
|`WorkerJob`|`MyJobs`|✔ same|
|`JobDetail`|`MyJobs`|✔ same|
|`ProfileMain`|`Profile`|✔ `CustomerRoot.tsx:178` (drawn)|

**Mechanism.** `canNavigateTo()` (`lib/navigationRef.ts:62–75`) resolves against
`navigationRef.getRootState().routes`, which the TabRouter populates from every
registered `Tab.Screen` regardless of `tabBarItemStyle`. `display: 'none'` is a
render-time style on the bar item; it is not a route-state concept. So a hidden
tab is fully dispatchable.

**Falsifier.** Looked for a dispatch at a tab name that the customer navigator
does *not* register — none. Looked for `Discover` or `Create` appearing as a
notification target (either would be new and unhandled) — neither is in
`TAB_FOR_SCREEN`. Looked for the `MyJobsHub` screen having been deleted along
with the tab item — `navigation/sharedStacks.tsx:78` still registers it, and the
whole 22-route MyJobs stack is intact.

---

### D1 (third half) — Discover changed all three, not two of three — **CONFIRMED**

Verified against the pre-state at `de048e9`, per attribute **of the bar slot**:

|Attribute|Before (`de048e9`)|After (HEAD)|Changed?|
|-|-|-|-|
|Label|`Map` (`BottomNav.tsx:64`)|`Discover` (`BottomNav.tsx:79`)|✔|
|Glyph|`location` / `location-outline`|`search` / `search-outline`|✔|
|Destination|`MapStackNavigator` (`CustomerRoot.tsx:136`)|`DiscoverStackNavigator` (`CustomerRoot.tsx:159`)|✔|

And the `Discover` roster entry itself also had its glyph replaced:
`compass`/`compass-outline` → `search`/`search-outline`
(`de048e9:ui/primitives/BottomNav.tsx:69` vs `ui/primitives/BottomNav.tsx:79`),
which is the magnifier the decision names.

**Falsifier.** The one way this could have been "two of three" is a label and
glyph change over an unchanged destination — i.e. the slot still pointing at
`MapStackNavigator`. It does not: `CustomerRoot.tsx:157–161` names
`component={DiscoverStackNavigator}`, and `Map` is a separate, hidden
registration at `:182–186`. **Note: the destination is the one attribute the
existing suite does not pin.** Fenced by this run (audit 4, F3).

---

### D2 — the layers behind the pill — **PARTIAL**

**Verdict PARTIAL, not CONFIRMED, and the reason is the point.**

**What is true.** Everything between the app root and the pill paints nothing:
`App.tsx`'s `SafeAreaProvider` and `LaunchGate` root `View` are `{ flex: 1 }`
with no colour (`App.tsx:238`, `:242`); `BottomTabView`'s own
`SafeAreaProviderCompat` paints nothing; the NavigationContainer theme reaches
`<Screen>` only, and the bar is a sibling of the scene container.
`bottomNavScreenOptions()` declares **exactly one** `backgroundColor`
(`ui/primitives/BottomNav.tsx:359`, `palette.surface`) — that is the pill. No
`tabBarBackground` is set anywhere in `BottomNav.tsx`, `CustomerRoot.tsx` or
`WorkerRoot.tsx`.

**What contradicts the instruction as worded.** A NEW layer *does* paint behind
the pill: `navigation/ModeShell.tsx:72` —
`<View style={[styles.tree, { backgroundColor: palette.background }]}>` — added
by this commit. The instruction says every layer behind the pill should be
transparent; the run made one of them opaque on purpose, because the defect was
a *missing* ground rather than an unwanted one (the pill floats by margins, the
gap fell through to the iOS root view, which is white by platform default). The
band is genuinely gone and the diagnosis is sound.

**Why this is PARTIAL and not CONTRADICTED.** The decision's *goal* — no white
band behind the pill in dark — is met, and the run documented the inversion at
length (`BottomNav.tsx:192–227`, `ModeShell.tsx:30–49`). But it is **not listed
among the six reversals** in `PRESTIGE_RUN_REPORT.md` §(d), which is where a
future run would look. That omission is the actual risk here, and it is why this
audit fences the ground rather than trusting the prose.

**D3's sizing, verified as a reduction.** `TAB_ICON_SIZE = 28`,
`TAB_LABEL_FONT_SIZE = 11` (`BottomNav.tsx:137–138`) against
`de048e9`'s 29/12. The decision's heading says LARGER; the applied change is 1pt
smaller on both. The explicit numbers were followed and the direction is
recorded in the source comment. Already fenced at `tests/layout.test.mjs:106–107`.

**Falsifier.** Grepped the three bar-owning files for `tabBarBackground` (the
library's own second-ground hook) — absent from all three post-comment-strip.
Counted `backgroundColor:` occurrences inside `bottomNavScreenOptions` — exactly
one. Read `App.tsx` for a root-level `backgroundColor` — the only ones are the
gated loader and `StatusBar`. Found no *second* new painted layer.

---

### D3 — one derived clearance — **CONFIRMED**

**Evidence.** `ui/tokens.ts` deletes `layout.floatingNavClearance` and declares
`FLOATING_NAV_HEIGHT = 70` / `FLOATING_NAV_GAP = 12` once, exported as
`layout.floatingNavHeight` / `layout.floatingNavGap`.
`ui/primitives/BottomNav.tsx:169` and `:179` READ those two
(`TAB_BAR_CONTENT_HEIGHT`, `TAB_BAR_FLOAT_MARGIN`), and
`useFloatingNavClearance()` (`:256–259`) returns
`height + Math.max(insets.bottom, gap)`.

**Mechanism.** The clearance can no longer desynchronise from the bar, because
both are the same two numbers, and it now sees the device inset a static token
could not express (82 with no inset, 104 on a notched iPhone, against the old
flat 68). Applied to all three templates (`DetailScreen`, `FormScreen`,
`SuccessScreen`) plus 18 hand-rolled surfaces, with the rule "whichever element
is LAST above the pill takes the clearance" — so footers carry it, not scrollers
underneath them.

**Falsifier.** Grepped for a surviving `floatingNavClearance` — none. Checked
every template for a conditional hook call (a hook inside `if` would crash on a
state change) — all three call `useFloatingNavClearance()` unconditionally at
component top. Checked that `useSafeAreaInsets()` has a provider — `App.tsx:215`
wraps everything in `SafeAreaProvider`. Confirmed the four tab ROOTS still carry
`paddingBottom: 0` deliberately (`tests/layout.test.mjs:22`), so this did not
silently contradict an existing assertion.

---

### D4 — WorkerResults — **CONFIRMED (and the risk the brief flags is nil)**

The brief singles this out as the highest-risk commit, on the hypothesis that it
may have BUILT the screen and invented marketplace data.

**It built nothing.** `git show 315b481 --stat` is one file:
`tests/crossTabNavigation.test.mjs | 116 ++++++`. **Zero source files.** The
commit adds two assertions and changes no behaviour, so there is no figure,
rating, count or badge to invent. `screens/WorkerResultsScreen.tsx` predates the
range; its only edit anywhere in `de048e9..HEAD` is emerald(3)'s 6-line
clearance change.

**The claim it makes instead**, verified: the route was already registered
(`navigation/WorkerRoot.tsx`, one registration on `WorkerHomeStack`), all four
live dispatches are in `WorkerHomeScreen` which is the ROOT of that same stack,
and the operator's crash signature reproduces exactly in
`screens/BrowseJobsScreen.tsx` — which is registered by no navigator and
imported by nothing at HEAD.

**Falsifier.** Grepped the whole tree for `WorkerResults` dispatches to find one
outside a stack that registers it — the only such file is the unmounted
`BrowseJobsScreen`, and `tests/workerHome.test.mjs:304` already pins that the
worker tree registers no `BrowseJobs` route. Checked `WorkerResultsScreen.tsx`
for any hardcoded rating/count/badge — the file was not authored or modified by
this pass, so the invented-data risk does not arise from it.

---

### D5 — sign-in conversion, `authTheme` frozen — **CONFIRMED**

**`lib/authTheme.ts` was not touched.** `git diff de048e9..HEAD --
lib/authTheme.ts` is empty.

**`components/CountryPicker.tsx` is byte-identical.**
`git diff de048e9..HEAD -- components/CountryPicker.tsx` is empty, and every
module it resolves colour from is also unchanged — so byte-identity is
mechanical, not careful.

**The test that proves it:**
`tests/themeResolution.test.mjs:262` —
`'[static] the auth flow is one design system, and authTheme stayed frozen'`.
Part 1 asserts `lib/authTheme.ts` contains no `isDark`, `useThemeColors`,
`ColorPalette` or `palette` (so it cannot have gained a dark branch). **Part 3**
is the CountryPicker clause: no `themed` prop, no `useThemeColors`/`authSurface`
import, still resolving from `authColors.`. Part 4 pins that the `themed` opt-in
reached exactly five auth screens and none of the other four.

**The shared modules that DID change were checked for light impact.**
`lib/theme.ts`'s diff is three pure ADDITIONS (`selectedInDark()`,
`scrimInDark()` + `SCRIM_DARK_ALPHA`, `disabledControl()`) — no existing export
modified, and none expresses a light branch. `ui/tokens.ts`'s diff adds two
geometry numbers and deletes one; no colour token moved. So no auth consumer's
light rendering can have changed.

**The allowlist NARROWED.** `LITERAL_FILE_ALLOWLIST` lost both sign-in entries
(they were labelled "LOCKED screen" and the locked set is empty). The raw-colour
scan now covers both files for real. Nothing was added to any allowlist anywhere
in the range.

**Falsifier.** Listed all 25 files referencing `authTheme`/`authColors` and
intersected with the changed-file set: only the two sign-in screens, plus
`lib/theme.ts` and `ui/tokens.ts` whose diffs are additive as above. Grepped the
range for a widened allowlist or a new exemption — the only match is a comment
recording that the gold knob needs NO allowlist entry.

---

### D6 — one boolean in one place — **CONFIRMED**

**The control cannot express a contradiction.** `ui/primitives/Toggle.tsx:78`:

```ts
const trackColor = isDark ? palette.neutralBg : value ? palette.emerald : palette.border;
```

The dark branch is written **without a `value` term at all** — not merely the
same colour today, structurally incapable of carrying state. Knob colour
(`:84–88`), ring (`:89`), halo (`:90`) and position (`:63–71`, `:114–118`) all
read the single `value` prop.

**The boolean itself is singular.** `hooks/useProfile.ts` is now a module-level
store: one `snapshot` (`:46`), one `listeners` Set (`:48`), `publish()` creating
a fresh object each time (`:50–53`), consumed through
`useSyncExternalStore(subscribe, getSnapshot)` (`:69`).
`screens/ServicesPricingScreen.tsx:55` and `screens/WorkerHomeScreen.tsx:90`
both destructure `{ profile, setProfile }` from it, and both derive
`const accepting = profile?.accepting_work ?? true;` — the identical expression
(`ServicesPricing:194`, `WorkerHome:98`) — and both pass `value={accepting}`
unmodified. The private `useState<Profile | null>` that `ServicesPricing` used
to hold is deleted.

**All seven surfaces.** Three `<Toggle>` call sites render seven toggles:
`WorkerHomeScreen.tsx:358` (1), `ServicesPricingScreen.tsx:211` (1), and
`NotificationSettingsScreen.tsx:258` inside `NOTIFICATION_TOGGLES.map(...)` (5).
The five preferences are ONE control mapped over a list, so they cannot drift
from each other by construction.

**Attempt to construct a divergent state — failed.** (a) Two screens showing
different values: impossible, one module snapshot, and `publish()` notifies
every listener synchronously. (b) Track and knob disagreeing in dark: the track
has no `value` term, so there is nothing to disagree with. (c) Track and knob
disagreeing in LIGHT: both read the same `value` prop in the same render; the
knob's 160 ms slide is an animation transient, not a divergence, and the
`Animated.Value` is re-driven by `useEffect` on `[position, value]` with no
other writer. (d) A fourth surface with its own switch: the only two surviving
native `<Switch>` sites are `BrowseJobsScreen` (unmounted, nothing imports it)
and `SetupScreen` (auth flow, no dark treatment), and
`tests/workerHome.test.mjs:503` pins that exact pair as a closed set, so a NEW
hand-rolled switch fails.

---

### D7 — one way to say chosen, one way to say dead — **CONFIRMED**

`lib/theme.ts` gains `selectedInDark(palette)` returning
`{ line: gold, fill: 'transparent', idleLine: gold@35% }` and
`disabledControl(palette)` returning `{ backgroundColor: neutralBg,
borderColor: 'transparent', color: textMuted }`. Ten surfaces converted; every
call site reads `active && (isDark ? …Dark : …)`, so the light branch survives
at each. Verified by reading the diffs of `Chip`, `SegmentedControl`,
`JobFilterSheet`, `PortfolioPicker`, `PastWork`, `ReportDialog`,
`ServicesPricing`, `ApproveOrDispute`, `ReviewAndTip` and `MyJobsHub`.

Already fenced at `tests/goldOnForest.test.mjs:201` and `:244`.

**Falsifier.** Looked for a converted site that dropped its light branch — none;
every one is a ternary on `isDark` or a dark style layered on top. Looked for a
gold FILL introduced (which decision 3 forbids) — `selectedInDark().fill` is
`'transparent'` and `tests/goldOnForest.test.mjs:67` passes without a new
allowlist entry.

---

### D8 — the band, and the scrim — **CONFIRMED**

`SCRIM_DARK_ALPHA = 0.55` in `lib/theme.ts`, applied through `scrimInDark()`,
and **all seven** dark scrims read it: `ui/primitives/Sheet.tsx`,
`components/ActionSheet.tsx`, `AmountPrompt.tsx`, `ConfirmDialog.tsx`,
`ReactionPicker.tsx`, `ReportDialog.tsx`, `ServicePickerSheet.tsx` — each
previously an independent `withAlpha(ground, 0.7)`. The three LIGHT scrims
(35 % / 42 % / 45 %) are untouched, and `tests/goldOnForest.test.mjs:282`
asserts each file still carries its own light expression alongside the shared
dark one.

`ActionSheet` additionally gained the safe-area handling it never had:
`useSafeAreaInsets()` and `paddingBottom: insets.bottom + spacing.lg` on the
backdrop (`components/ActionSheet.tsx:60–66`), so the sheet ends above the home
indicator. The inline `paddingBottom` correctly overrides the stylesheet's
`padding: spacing.lg`.

**Falsifier.** Grepped the range for a surviving hand-rolled `withAlpha(…, 0.7)`
dark scrim — none. Checked that the light scrims did not collapse into the
shared value — all three distinct values survive.

---

### D9 — MapKit tiles — **CONFIRMED**

`components/HotspotMap.native.tsx:159` sets
`userInterfaceStyle={isDark ? 'dark' : 'light'}` from the RESOLVED theme, and
`:152` adds `key={isDark ? 'dark' : 'light'}` so a theme flip CONSTRUCTS a new
map view rather than asking a rasterised one to repaint. `regionRef` captures
the last completed region and feeds it back as `initialRegion`, so the remount
does not cost the user their position — a ref rather than state because
`onRegionChangeComplete` fires on every pan.

This is the only `MapView` in the tree (already fenced by
`tests/themeResolution.test.mjs:490`), and no dependency, native module or
manifest changed.

**Falsifier.** Checked that `initialRegion` is only read at mount (so seeding it
from a ref cannot cause a render loop) — correct. Checked the optional-call
change `onRegionChangeComplete?.(region)` for a behaviour regression — the prop
is optional in the type, and the ref capture now happens whether or not a
consumer passes a handler, which is strictly more correct.

---

### D10 — three deltas — **CONFIRMED**

Master 26 was real and fixed: `screens/NotificationsScreen.tsx` changed the
glyph inside the gold ring from `colors.gold` to `colors.emerald` in dark — a
one-token change so the ring and its contents stop flattening into one shape.
Light untouched. Masters 22 and 18 were skipped because their stated conditions
did not hold, and both skips are pinned by `tests/goldOnForest.test.mjs:371` so
a future run does not add a duplicate affordance beside the existing one.

**No invented data.** The commit's entire source diff is that single colour
token; nothing was added that reads or fabricates a marketplace figure.

---

### D11 — the record — **CONFIRMED**

`git show 098e108 --stat` is `HANDOFF.md` and
`docs/mockups/PRESTIGE_RUN_REPORT.md`. **Zero source files.**

---

### F1 — money-figure colour immobility — **PARTIAL**

**What is frozen, verified.** `git diff de048e9..HEAD` is EMPTY for every
dedicated money surface: `ui/primitives/MoneyText.tsx`, `ui/primitives/JobCard.tsx`,
`components/WorkerJobCard.tsx`, `components/BrowseJobCard.tsx`,
`components/MarketJobPreview.tsx`, `components/HubCard.tsx`. `MoneyText`'s rule
— `state && !SETTLED.includes(state) ? colors.muted : isDark ? colors.emerald :
colors.ink` (`MoneyText.tsx:56–57`) — is untouched, so the payment-state
machine's money colouring is intact. The five money-bearing detail screens
(`ChatScreen`, `ClientJobDetailScreen`, `JobDetailScreen`, `PostJobScreen`,
`WorkerJobScreen`) received **padding-only** edits from emerald(3); their diffs
contain no colour at all.

**What moved.** Two selection controls whose labels are currency figures took
D7's gold selected state in dark:

|File|Element|Before (dark, selected)|After|
|-|-|-|-|
|`screens/ReviewAndTipScreen.tsx:438`|Tip preset amount `{formatBudget(cents)}`|`colors.emerald`|`selectedInDark(colors).line` (gold)|
|`components/JobFilterSheet.tsx`|Budget chip `{formatBudget(cents)}+`|`colors.emerald`|`selectedInDark(colors).line` (gold)|

The UNSELECTED state of both is unchanged (`presetText.color = colors.textMuted`).

**Assessment.** These are chips, not money readouts — the amount is the option's
name, and the colour is expressing *chosen*, not *value*. No payment-state
label, no owner-facing/marketplace-facing money semantics, and no CLAUDE.md
money invariant is affected. But the freeze as stated is absolute, and the
correction pass's own end-of-run confirmation checked only three files
(`MoneyText`, `JobCard`, `WorkerJobCard`) and would not have surfaced this.
Recorded so the operator decides, not so it is quietly absorbed.

**Falsifier.** Searched every changed source file for a currency renderer
(`formatBudget`, `formatCents`, `toFixed(2)`, a literal `$`) and read each hit's
diff. Eight files matched; six were padding-only or non-money; the two above are
the complete set of currency-colour movements in the range.

---

### F2 — the verification badge — **CONFIRMED**

`components/VerificationBadge.tsx` does not exist. No file under `screens/`,
`components/`, `ui/`, `hooks/`, `lib/`, `modes/` or `navigation/` references
`VerificationBadge` or `isVerified` — asserted with **no allowlist at all** by
`tests/verificationBadgeRemoved.test.mjs:63`, which is untouched by this pass
and still passes 4/4. `verification_status` feeds no client projection
(`:89`). The background-check disclosure in `lib/legal/termsOfService.ts` is
pinned verbatim (`:98`).

**One honest exception, pre-existing and unchanged by this pass.**
`screens/WelcomeScreen.tsx:185` still renders the marketing line
`Verified workers`. It sits inside that suite's declared `LOCKED_SCREENS`
exclusion, is documented there as an operator unlock item, and `WelcomeScreen`
is not in this range at all. It is a marketing claim, not a per-worker badge —
but it is the only surviving user-visible use of the word, and the operator
should know the suite excludes it by design rather than by oversight.

Also noted: that suite's `LOCKED_SCREENS` still lists `SignInScreen.tsx` and
`EmailSignInScreen.tsx`, which emerald(5) converted and un-allowlisted
elsewhere. Neither contains banned copy, so the stale entry changes nothing
today. Not edited — this run may not relax or restructure an existing assertion.

---

### F3 — no raw colour literal entered — **CONFIRMED**

Scanned every added line across `screens/`, `components/`, `ui/`, `hooks/`,
`navigation/`, `modes/`, `lib/` and `dev-tools/` for `#RRGGBB`, `rgb()`,
`rgba()`, `hsl()`, `hsla()`. **Two matches, both inside comments:**
`// Was the literal #F5E7E4 —` (`EmailSignInScreen`) and
`// sage (#5FAE81) that reads as a light-mode leftover` (`emerald(7)`).
`stripCommentsForScan()` removes both before the contract test
(`tests/themeResolution.test.mjs:341`) evaluates. No executable raw colour
entered anywhere in the range, and the one that LEFT (`#F5E7E4`, a Heritage
form-error wash) was replaced by a palette token.

---

### F4 — no forbidden file touched — **CONFIRMED**

Top-level paths in `git diff de048e9..HEAD --name-only`: `HANDOFF.md`,
`components/`, `dev-tools/`, `docs/`, `hooks/`, `lib/`, `navigation/`,
`screens/`, `tests/`, `ui/` — and nothing else. No agent-config directory, no
`app.json`, no `package.json`, no `package-lock.json`, no dotenv file, no
migration directory, and none of the frozen web/PWA surface (`public/`,
`hosting/`, `dist/`, service worker, `*.web.ts` / `*.web.tsx`).

---

