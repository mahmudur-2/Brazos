# Emerald V2 — Decision Log

Design and architecture forks resolved during the Emerald V2 redesign, with
the reasoning. Standing rule for this log: when a fork has a "build it
properly" option and a "defer it" option, **defer** — the phased plan in
[07_PHASED_IMPLEMENTATION_PLAN.md](07_PHASED_IMPLEMENTATION_PLAN.md) already
owns the real architecture work, and pulling it forward mid-redesign trades a
bounded visual change for an unbounded structural one.

Tie-breakers, in order: least regression risk → fewest existing files/systems
touched → still visually matches the reference.

---

## Screen 07 — Customer Home

### D1. "Switch to Worker" pill navigates to BrowseJobs rather than switching a mode
**Fork:** the reference implies a customer/worker mode system. None exists —
no mode field, no dual navigation, one shared five-tab bar (confirmed in
[01_CURRENT_APP_INVENTORY.md](01_CURRENT_APP_INVENTORY.md) §4).
**Chosen:** wire the pill to the existing `BrowseJobs` screen — the app's real
"find work" entry point.
**Why:** deferred per the standing rule. Real mode switching is Phase 2/3 and
touches the root navigator every signed-in user hits. The pill is honest about
where it goes, and rewiring it later is a one-line change.

### D2. Bottom nav keeps all five existing tabs; no centre FAB
**Fork:** the reference nav is Home / Explore / [+ FAB] / Inbox / Profile. The
FAB sits exactly where My Jobs is (centre slot), so matching it displaces a
core screen.
**Chosen:** reskin the five existing tabs and routes; no FAB.
**Why:** fewest systems touched, zero routes moved. Post-a-job already has
strong placement as Home's hero CTA, so the FAB adds little that the redesign
does not already deliver.

### D3. Voice input deferred; the mic explains itself
**Fork:** no speech-to-text path exists that is both free and Expo Go
compatible — every option needs either a custom dev build
(`expo-speech-recognition`, `@react-native-voice/voice`) or a paid
transcription API.
**Chosen:** render the mic per the reference; tapping it says voice is not
switched on yet and focuses the field.
**Why:** deferred. A control that silently fails is worse than one that says
what it is. Avoids both a dev-build workflow change and a per-call cost.

### D4. Emerald tokens added to `lib/theme.ts`, not a third palette
**Fork:** the Emerald values already live in `lib/authTheme.ts` (auth surface),
while every in-app screen reads `lib/theme.ts`.
**Chosen:** add `forest`/`emerald`/`gold`/`goldSoft`/`mint`/`mint2`/`ink` and a
`fonts.display` token to `lib/theme.ts`, lifted verbatim from the atlas
stylesheet's `:root` block. Existing tokens untouched.
**Why:** one in-app token source. Additive, so no existing screen moves.

### D5. Platform serifs, no bundled font
**Chosen:** `fonts.display` resolves to Georgia / `serif` / a web stack, the
same way `LaunchScreen`'s wordmark already does.
**Why:** bundling a font buys a font-loading flash on exactly the screens that
most need to paint instantly, and adds a dependency for a handful of headlines.

**Superseded 2026-08-22 (operator decision), for the large heading roles
only.** Playfair Display static TTFs (Bold 700, ExtraBold 800, with the OFL
license) are bundled in `assets/fonts/` and carried by `fonts.displayBold` /
`fonts.displayExtraBold` on both token surfaces. `type.display`/`h1`/`h2`
(ui/tokens.ts) and `typography.title`/`heading` (lib/theme.ts) now name those
faces — weight-mapped, their inert `fontWeight` removed so iOS cannot
synthesize a fake bold on top of a real face. The flash objection above is
answered by a render gate rather than by abstaining: App.tsx's `LaunchGate`
resolves the faces with expo-font's `useFonts` (runtime loading — no new
package, no native rebuild) and neither mounts the themed tree nor lets the
launch layer hand over until they resolve (or error, which degrades to the
platform serif), so no frame paints a heading in the fallback face. Everything
below the ~18pt degradation floor keeps the platform serif: 15pt card
`title`s, the 17pt/600 `subheading`, and every screen style that names
`fonts.display` directly. tests/themeTokens.test.mjs fences the mapping.

**Reversed 2026-08-22 (operator decision, later the same day) — and the
platform serif retired with it.** The app has no serif at all any more. The
Playfair TTFs and their OFL file are deleted, `assets/fonts/` is gone,
`fonts.displayBold` / `fonts.displayExtraBold` are gone from both token
surfaces, App.tsx's `useFonts` load and the font half of its `LaunchGate` are
gone (the gate still holds for `sessionReady`), and `LaunchScreen`'s wordmark
dropped its own copy of the Georgia / `serif` stack. `fonts.display` survives
as a NAMED ROLE resolving to the platform system sans — the family body copy
already used — because roughly sixty screen styles reach the heading voice
through it, and one lever is worth more than sixty edits if that voice is ever
repointed again. **Why:** the operator reviewed ~60 real device captures
(`docs/design/EMERALD_COMPLAINTS.md`) and chose the plain iOS system face for
the whole app; both the bundling above and the platform serif that predated it
are what the reversal removes. With no file bundled, `fontWeight` is
load-bearing on iOS again, so the weights the bundling had made inert are
restored to their pre-bundling values (`type.display`/`h1` 800, `type.h2` 700,
`typography.title` 800, `typography.heading` 700). Type SIZES, line heights and
the `letterSpacing: -1` on the heading roles are deliberately unchanged: they
were measured against a serif and are an operator dial for a device pass, not
something this change guessed at. tests/themeTokens.test.mjs's Playfair fence
is INVERTED, not deleted — it now fails if a serif family name or a bundled
`.ttf` returns.

**Partially reversed 2026-08-22 (operator decision) — one role returns to
Playfair.** The customer Home hero title ("Take a task off your plate.") —
that one role and nothing else — sets in Playfair Display again. The Bold
static and the OFL license are recovered BYTE-IDENTICAL from the
pre-retirement commit's parent (`fd00e1a`, hash-verified against the
historical blobs; nothing downloaded); the ExtraBold static stays in history
because no role names it. Registration is the pre-retirement arrangement
restored: App.tsx's `LaunchGate` resolves the face with expo-font's
`useFonts`, holds the themed tree and the launch handover until it resolves,
and releases on a load error (the hero then degrades to the system sans).
The face rides a new role-scoped token, `fonts.displayHero` (lib/theme.ts),
named by exactly one style — the hero headline, which drops its `fontWeight`
because a bundled static makes the weight inert on iOS (the bundling era's
own convention; the retirement-era style's '600' has no 600 static in
history, and Bold is the recovered face nearest it). Size, leading and
tracking are untouched — the hero keeps the studio-driven metrics the parity
pass unified. Every other heading, the worker hero included, stays on the
system sans. tests/themeTokens.test.mjs's no-serif fence is NARROWED, not
retired: it permits `fonts.displayHero` in that one file exactly once,
requires the resolved token, the single bundled `.ttf` and the restored
loader, and still fails on any other serif anywhere — proven red by adding
the face to a second role before landing.

### D6. `Chip` extended with variants instead of a parallel `Pill` component
**Fork:** the brief listed "Pill" as a foundational component, but `Chip`
already does that job.
**Chosen:** add `service` / `outlineGold` / `soft` variants and an `sm` size to
`Chip`; default rendering left byte-identical.
**Why:** avoids two components with the same responsibility. Only two existing
call sites, both verified unchanged.

### D7. `ServicePickerSheet` is a new component, not an `ActionSheet` variant
**Fork:** `ActionSheet` is the existing bottom sheet.
**Chosen:** new component.
**Why:** `ActionSheet` lays items out in a fixed, unscrollable column — correct
for a four-item long-press menu, structurally unable to show eighteen rows.
Merging them would force a scroll container onto the short menu that it never
needs.

### D8. The 18 "Other" services map onto existing category keys
**Fork:** none of the 18 labels are existing categories.
**Chosen:** each row carries a real category key (`handyman`, `cleaning`, …),
so selecting one runs exactly the same downstream search as a visible chip.
Several rows deliberately share a key.
**Why:** no migration, no enum change, no new schema. These are search entry
points, not new marketplace categories.

### D9. Three reference elements deliberately not rendered
**Chosen:** omit the per-job distance badge ("1.2 mi"), omit "High demand in
your area", keep "N similar jobs posted today".
**Why:** exact job coordinates live in `job_locations`, readable only by the
poster and assigned worker — an open job has no client-computable distance.
No "demand" signal exists in the schema, and deriving one from an invented
threshold would be fabricating marketplace data (CLAUDE.md forbids this).
The similar-jobs count *is* real — computed from open jobs already loaded.

### D10. Home illustration is a palette-correct placeholder
**Chosen:** blush oval + forest leaf glyph, flagged as follow-up.
**Why:** the reference's armchair/plant/lamp artwork has no asset in the
project. A placeholder in the right palette and mass beats blocking the
redesign on sourcing artwork.

### D11. `components/HomeGreeting.tsx` deleted
**Why:** the redesign was its only consumer; confirmed orphaned repo-wide.
Leaving it would be litter created by this change.

### D12. Search: per-token best-match scoring, Damerau typos, tightened budget
**Chosen:** score each typed word once per category via its best keyword
(was: once per matching keyword); weight keywords down by how many categories
share them; add a phrase table; allow 2 edits only at 9+ characters, 1 at 5+,
using Damerau distance so a transposition costs 1.
**Why:** per-keyword counting let one word score twice ("cleaning" hitting both
`clean` and `cleaning`) and favoured categories with long keyword lists. The
edit budget matters more than the weights: at 2 edits below nine characters,
`leaking`↔`cleaning` and `washing`↔`walking` matched each other. Verified
against the compiled module, 23/23 cases.

### D13. ESLint not run
**Why:** ESLint is not a dependency and has no config in this repo, so
`npx eslint .` would install a package and then fail for lack of config. The
repo's actual lint is `npm run lint` (`tsc --noUnusedLocals
--noUnusedParameters`), which is run and clean.

### D14. Device verification not performed by the agent
**Why:** the repo rule is that Expo is never started from this session; the
LAN URL is handed over instead. Static gates (typecheck, strict lint, 178/179
tests — the one failure pre-existing and documented) are what was verified.

---

## Screen 48 — Worker Home ("Find jobs")

### D15. Redesigned `BrowseJobsScreen` in place; it stays a pushed route
**Fork:** the atlas treats Worker Home as a top-level tab. Today
`BrowseJobsScreen` is a pushed route inside `HomeStack`.
**Chosen:** redesign it where it is. No route, tab or param-list change.
**Why:** deferred — promoting it to a tab is the Phase 3 mode-split, and D2
already committed to not restructuring the tab bar mid-redesign.

### D16. No back chevron; the avatar badge takes that corner
**Fork:** the reference puts an avatar badge top-left, where this screen
currently has a back button.
**Chosen:** follow the reference. The avatar opens the Profile tab.
**Why:** back is preserved three other ways — the iOS edge-swipe gesture
(native-stack default), Android hardware back, and the visible tab bar, where
tapping **Home** pops this stack to its root. So the reference's header costs
no navigability.

### D17. The "Online" status is omitted
**Fork:** the brief says to wire the status to "the existing go-online/offline
toggle". There is no such toggle, and no availability or presence model
anywhere in the project — `lib/workerSearch.ts` states this directly
("availability / calendars — not stored").
**Chosen:** omit it rather than render static text.
**Why:** deferred (availability schema is Phase 5). A pill that always reads
"Online" would tell a worker they are visible and available when no such state
exists — the same class of fabrication as D9's "high demand". Building it
properly needs a migration, which is out of scope for a screen redesign.

### D18. Distance is omitted; the banner says "AVAILABLE NOW", not "NEAR YOU"
**Chosen:** no per-job distance, no "Under 3 mi" filter chip, and the banner
label drops the proximity claim.
**Why:** exact job coordinates live in `job_locations`, readable only by the
poster and the assigned worker (D9). The feed is every open job, not a
geographically scoped one, so "near you" would assert proximity the data
cannot support.

### D19. Card tags are category, bid count and posted-age — no "% fit", no time slot
**Chosen:** drop the reference's "98% fit" and "Today, 4 PM" tags.
**Why:** no job-to-worker fit score exists (the semantic matcher ranks workers
for a query, not jobs for a worker), and `jobs` has no schedule/arrival-window
column. The brief explicitly rules out fabricating the fit score. The three
tags kept are all real.

### D20. Banner's second pill is "N posted today", not "N fit your schedule"
**Why:** same missing schedule data as D17/D19. "Posted today" is real,
derived from `created_at`, and keeps the reference's two-pill composition.
The skills pill is hidden entirely when the worker has advertised no
categories — "0 match your skills" on an empty profile reads as a market
problem when it is an unfilled profile.

### D21. Filters and sort run on real columns only
**Chosen:** chips are **Best fit** (ranks the worker's advertised categories
first), **Today** (`created_at`), **$100+** (`budget_cents >= 10000`). The
top-right button opens the existing `ActionSheet` with the three sort modes.
**Why:** every one maps to a column the schema has. The sort sheet reuses an
existing component rather than introducing a Filters screen, which does not
exist and would be new architecture.

### D22. `WorkerJobCard` is a new component, not a `BrowseJobCard` variant
**Why:** `BrowseJobCard` is also rendered by the map drill-down
(`CellJobsScreen`) and the similar-jobs strip on `JobDetailScreen`. Giving it
a second layout would put a branch in a component three screens depend on, to
serve one of them. `BrowseJobCard` is left untouched.

### D23. `BrowseJobCardSkeleton` deleted
**Why:** `BrowseJobsScreen` was its only consumer, so this redesign orphaned
it. Strict lint does not flag unused *exports*, so it was found by hand.

### D24. The bottom tab bar is NOT made floating
**Fork:** the reference shows a floating rounded nav bar with a visible margin,
distinct from Customer Home's flush bar.
**Chosen:** leave the tab bar exactly as the Customer Home pass reskinned it.
**Why:** the tab bar belongs to the tab navigator, not to this screen — making
it floating would change it on *every* tab screen, including Customer Home,
which the brief wants to look different. Per-screen `tabBarStyle` overrides
would be new cross-screen machinery for a visual detail. Deferred to the Phase
3 mode-split, which is where two genuinely different navs become possible.
Logged as a known deviation from the reference.

### D25. `greetingFor()` moved to `lib/time.ts`
**Why:** both Home screens need it. Extracting beats a second copy; `lib/time`
already owns the other date/time formatters.

---

## Post-ship fixes — Customer Home header, hero banner, Launch screen

### D26. Header overlap fixed by switching the title from absolute-fill-centred to flex:1
**Bug (user-reported):** "Home" and the "Switch to Worker" pill collided on
real device widths.
**Root cause, confirmed by measurement, not guessed:** `headerTitle` used
`StyleSheet.absoluteFillObject` to centre "Home" against the *entire* header
row width, independent of the pill's own rendered width. The reference mock's
390pt canvas has room for both with no knowledge of each other; a real
device's content padding (`spacing.xl`=24 each side) plus the pill's actual
rendered width (icon + "Switch to Worker" + padding, ~109-160pt depending on
width) leaves too little room, and the two elements' boxes overlap.
**Chosen:** `header` becomes a flex row (`justifyContent: 'space-between'`),
`headerTitle` takes `flex: 1` with centred text and `numberOfLines={1}`,
`headerAction` gets `flexShrink: 0`.
**Verified, not just code-reviewed:** live `getBoundingClientRect()` on the
running app (auth bypassed locally for inspection only, reverted before
commit — see D14's precedent) at both 375x812 and 320x568: title's right edge
stayed 45px clear of the pill's left edge at both widths.
**Trade-off, logged per the standing rule:** the title is no longer
dead-centre on the full screen width — it centres within the space left of
the pill, which shifts it slightly left of true centre. This is the
correctness-over-exact-centring trade the fix instructions asked for; there
is no left-side element to counterbalance the pill for true centring without
a measured spacer, which was judged unnecessary complexity for a static
"Home" string that will never itself overflow.

### D27. Hero banner monogram: real `app-icon-v2.png` file, restructured to bleed past the card's padding
**Bug (user-reported):** the B-monogram had been "implemented wrong twice";
explicit instruction to stop recomposing it from primitives and instead
render `app_icon_v2.png` whole and unmodified, sized/positioned to match
`design-reference/emerald-auth-v1/postbarexample.png`.
**Investigation:** the file exists at
`design-reference/emerald-auth-v1/app icon v2.png` (space-separated name).
Copied to `assets/brand/app-icon-v2.png` following the existing kebab-case
asset convention. The prior implementation (committed in `ac65d2a`) already
rendered a real image (`brazos-b-leaf.png`) via a plain `<Image
resizeMode="contain">` — not primitives — so "wrong twice" was a sizing/
positioning defect, not a recreate-from-scratch one.
**Measured, not eyeballed:** used `pngjs` (already in `node_modules`) to find
the badge's pixel bounding box in `postbarexample.png` two ways — direct
gold-glyph detection (unreliable alone, since the badge's own dark-green
backing nearly matches the card's `forest` fill and doesn't separate
algorithmically) and a scale-inferred method (compare the gold glyph's size
in the 1254x1254 source icon to its size in the target crop, then apply that
scale factor to the full icon canvas and to the glyph's own margins within
it). Result: badge is roughly 24.8% of the card's width, right edge flush
with the card's right edge, top edge only roughly 2% of the card's height
down from the card's top — i.e. bleeding almost to the card's own corner,
well inside the card's normal `padding: spacing.xl` (24pt) that a flex child
would otherwise respect.
**Chosen:** restructured `heroCard` — padding moved into a new `heroBody`
wrapper (holds the eyebrow/headline/button); the badge is now a sibling
`Image`, absolutely positioned (`top: 4, right: 0, width: 84, height: 84`)
against the card's true edge, not the padded content box. `heroCard` gained
`overflow: 'hidden'` as a clipping safety net. `heroCopy` gained
`paddingRight: 64` so the two-line headline wraps clear of the badge instead
of running under it.
**Verified via live DOM measurement** (same bypass-and-revert technique as
D26): badge rendered at 84x84 inside a 342-wide card (24.6% — target was
24.8%), right edge exactly flush with the card's right edge (366=366, 0px
gap), top inset 4px. Headline/eyebrow text boxes' right edge (278) stayed 4px
clear of the badge's left edge (282) — no overlap. Image `complete: true`,
natural size 1254x1254 — confirmed loading the real file, not a broken image.

### D28. Launch screen: swapped the badge to `app-icon-v2.png` via a new `BrandLogo` override prop; safe-area and background-pattern edges audited and found correct, unchanged
**Bug (user-reported):** "edges are visibly off" on `LaunchScreen`; asked to
check corner radius on the icon badge, safe-area/edge padding, and whether
the background pattern clips/seams at the screen edges — and to look before
guessing which one is wrong.
**Investigated all three, in order, before changing anything:**
1. **Safe-area/edge padding** — measured the launch root's live
   `getBoundingClientRect()`: exactly `(0, 0, viewportWidth, viewportHeight)`
   at 390x844, matching `StyleSheet.absoluteFillObject`'s intent. The atlas
   reference (`design-reference/01_launch.png`) also shows the green
   full-bleed under the status bar. **No bug found — left unchanged.**
2. **Background pattern edge coverage** — read the live
   `getBoundingClientRect()` of all 8 `RadialGlow` layers and all 5
   `WaveLines` circles; every value matched the hand-computed geometry from
   source (e.g. the largest glow layer spans -340.5 to 925.5 on a 390-wide
   screen — comfortably overflowing both edges by design, clipped cleanly by
   `root`'s `overflow: 'hidden'`). **No clipping/seam bug found in the
   layout math — left unchanged.** (A separate, unrelated finding from this
   same investigation is logged below.)
3. **Icon badge corner radius** — measured via `pngjs` alpha-channel
   scanning (find where each row's alpha crosses from transparent to opaque
   at the shape's flat top edge, which locates the corner radius directly):
   `brazos-b-leaf.png` (`BrandLogo`'s current default, used by `LaunchScreen`)
   measures roughly 21.5% of its canvas width; `app-icon-v2.png` (the asset
   named in the prior banner-fix instruction, already established as
   authoritative for this pass) measures roughly 18.7% — a real, visible
   difference, and exactly the place the user pointed ("the icon badge's
   corners specifically"). **This is the actual bug.**
**Chosen fix:** rather than change `BrandLogo`'s shared default asset (it is
also used by `SignInScreen` and `EmailSignInScreen`, screens this task never
named — changing the default would regress them unrequested), added an
optional `source` override prop to `BrandLogo` and pass `app-icon-v2.png`
from `LaunchScreen` only. Least regression risk and fewest files touched of
the options considered (the alternative — bypassing `BrandLogo` entirely and
inlining a second `<Image>` in `LaunchScreen` — would have duplicated the
sizing/shadow logic `BrandLogo` already owns).
**Verified via live DOM measurement:** confirmed the launch badge's `<img>`
src now includes `app-icon-v2`, `complete: true`, natural size 1254x1254, at
the same position/size the old asset rendered at (only the source changed,
so position/size math is provably unaffected).
**Unrelated finding, explicitly not fixed (out of scope):** while measuring
the launch screen, found that on this web preview, `LaunchScreen`'s entire
entrance animation (logo scale/fade, wordmark rise, tagline rise, wave-line
fade-in) is permanently frozen at its pre-animation starting values — the
effect that starts the `Animated.parallel(...)` is gated on
`if (reducedMotion === null) return;`, and `reducedMotion` (from
`useReducedMotion()`) never resolves away from `null` on `react-native-web`
in this environment, so `.start()` is never called. This is very likely a
web-preview-only artifact (native `AccessibilityInfo` is well-supported on
iOS/Android, where this hook almost certainly resolves normally) and is
unrelated to the three edge/corner/padding concerns this task named. **Not
fixed** — different bug, outside this task's scope, and touching
`useReducedMotion.ts` risks the frozen web/PWA surface CLAUDE.md protects.
Flagged here for awareness; worth a dedicated look if the web build is ever a
real target again.

### D29. Verification method for D26-D28: temporary, fully-reverted local-only bypasses
All three fixes above needed to see the actual authenticated/timed screens to
verify against a real DOM, not just re-read the code. Two temporary edits were
made, confirmed via `git diff` to be the *only* change in their file, and
reverted (one via a direct edit undo, one via `git checkout --`) before this
log entry was written — neither reached a commit:
- `App.tsx`'s `RootNavigator` was temporarily short-circuited to
  `return <MainTabs />;` so Home/Worker Home could be inspected without a
  signed-in session (no credentials were entered anywhere).
- `LaunchScreen.tsx`'s `MIN_VISIBLE` was temporarily raised from `1120` to
  `120000` so the launch layer could be inspected before its own timer
  dismissed it.
Screenshots were unavailable throughout (the Browser pane's compositor needs
the pane displayed on the user's side, which it wasn't) — verification used
`getBoundingClientRect()`/`getComputedStyle()` measurements instead, which is
sufficient for layout/geometry claims (position, size, overlap) but cannot
confirm pixel-level color/rendering fidelity. That gap is why D28's
corner-radius comparison used the *source PNG files* directly (via `pngjs`)
rather than trying to eyeball rendered pixels.

### D30. M3 Customer Core: in-place Emerald presentation over the existing marketplace loop
**Chosen:** redesign the current `HomeScreen`, `WorkerSearchScreen`,
`PostJobScreen`, `MyJobsHubScreen`, `ClientJobDetailScreen`, `HubCard`, and
`BidWorkerCard` rather than introduce parallel V2 routes or services. The
existing Supabase RPC boundaries, edit/direct-offer branches, route names,
combined customer/worker My Jobs feed, bid acceptance, messaging, evidence,
and review flows remain authoritative.

`PostJobScreen` now presents its existing form state as four internal steps
(Describe, Media, Location, Review). This is UI progression only: it does not
add schema fields or change `create_job`, `update_job_details`, or
`create_job_request`. Session-only uploads are cleaned up when an unfinished
post is abandoned, and successful submission now waits for an explicit next
action instead of forcing a timed navigation.

**Small supported gaps added:** keyboard avoidance on customer search surfaces,
retry/missing/empty states, focus and pull refresh for bids, job lifecycle
clarity, posting-media visibility to the owner, truthful review-count labels,
duplicate-write guards, and actionable My Jobs empty states.

**Explicitly deferred beyond M3:** scheduling or arrival windows, min/max
budgets, BRAZOS estimates, availability/distance/fit claims, open-bid
counteroffers, payments/holds/tips, live tracking, mode-specific tab
architecture, and separate Atlas routes for every customer job state. The
current schema and providers cannot support those claims honestly, and adding
them here would cross into later milestones or paid-service work.

Direct-thread **Hire Again** is also deferred: the current request RPC can
target a job conversation but cannot target a direct-thread id. The header
action is therefore shown only in job-backed chats (and remains available from
supported worker/profile entry points) instead of risking an offer appearing
in the wrong older conversation.

---

## Guard coverage — the recorded boundary of every active guard

### D31. Each guard's REAL coverage boundary, read off disk and written down

**Fork:** guards were being reasoned about by their names and their docblocks'
intent ("EVERY screen, component and hook is scanned") rather than by the
directory list actually in the source, and the two had drifted. A fence whose
scope is assumed is a fence that can be argued past.

**Chosen:** record the literal scope of every active guard here, quoted from
the file that defines it, so a future run reads the boundary instead of
inferring one. Full findings and the complement scans are in
[docs/audit/2026-08-22/guard_coverage.md](../audit/2026-08-22/guard_coverage.md);
this table is the boundary itself, which is the part that must not be lost.

**Why:** two of the ten findings that audit produced exist *only* because a
scope was narrower than its docblock implied — a ship-blocker fence that says
it sweeps every component does not sweep `ui/`, and the suite that proves the
guard layer works is skipped on the platform CI runs on. Neither is visible
without the literal boundary in front of you.

| Guard | Coverage boundary, verbatim |
|-------|-----------------------------|
| `.claude/settings.json` deny matrix | 100 patterns. Paths: `Edit(/design-reference/**)`, `Edit(/public/**)`, `Edit(/hosting/**)`, `Edit(/dist/**)`, `Edit(/WEB_DEPLOYMENT.md)`, `Edit(**/*.web.ts)`, `Edit(**/*.web.tsx)`, `Edit(/.claude/**)`, `Read(./start.ps1)`, `Read(./.env)`, `Read(./.env.*)`, `Edit(./start.ps1)`, `Edit(./.env)`, `Edit(./.env.*)`, `Bash(*the production ref*)`. |
| `.claude/hooks/guard.ps1` | Tools: `"matcher": "Bash\|PowerShell\|Edit\|Write\|NotebookEdit"`. Frozen prefixes: `@('design-reference/', 'public/', 'hosting/', 'dist/')`. Web modules: `.web.ts` / `.web.tsx`. Secret basenames: `web_deployment.md`, `start.ps1`, `.env`, `^\.env\..+$`. Push allow-list: `origin mainexpo` \| `origin mainexpo:mainexpo`, no pre-flags. Fails closed — every ambiguity is `exit 2`. |
| `.claude/hooks/session-context.ps1` | SessionStart, informational. Enforces nothing, blocks nothing, `exit 0` unconditionally. |
| `npm run lint` / `typecheck` | `tsconfig.json`: `"exclude": ["node_modules", "supabase/functions"]`, no `include`/`files`. Everything else under the root is type-checked; the two Deno edge functions are checked by nothing. |
| `npm test` | `node --test tests/*.test.mjs` — one directory deep, `.test.mjs` only. |
| `npm run verify` | `npm run lint && npm test` — exactly two sub-steps, short-circuiting on lint. |
| `.github/workflows/ci.yml` | `branches: [mainexpo]` (push + PR) and `workflow_dispatch`; `runs-on: ubuntu-latest`; one step, `npm run verify`. |
| `scripts/verify-schema.mjs` | Not repo-enforced. Needs `.env` and live staging, so it never runs in `verify` or in an autonomous run — its cadence is the operator's. |
| F-HEX `themeResolution` | `['screens', 'components', 'ui', 'hooks', 'navigation', 'modes']` recursive, minus a 10-file `LITERAL_FILE_ALLOWLIST` and every `*.web.tsx?`. **`lib/` is not covered.** |
| F-TOKENIMPORT `themeResolution` | `screens/` only, **non-recursive**. |
| F-RASTER / F-ARTGATE `themeResolution` | `['screens', 'components', 'ui']` recursive; gate window 240 chars. |
| F-MAP `themeResolution` | `['components', 'screens']` recursive. |
| F-EMERALD `emeraldFences` | `['screens', 'components', 'ui', 'hooks', 'lib', 'navigation', 'modes']` recursive — the only colour-adjacent fence that includes `lib/`. |
| F-GOLD `goldOnForest` | `['screens', 'components', 'ui']` recursive. |
| F-COPY `copyHonesty` | `['components', 'hooks', 'lib', 'modes', 'navigation', 'screens', 'ui']` recursive, `*.web.tsx?` skipped, comments included. |
| F-MOTION `motionDriver` | `['components', 'dev-tools', 'hooks', 'lib', 'modes', 'navigation', 'screens', 'ui']` + `['App.tsx', 'index.ts']`, `*.web.tsx?` skipped — the widest app-source scope in the suite. |
| F-ERRREAD `errorHonesty` | `['screens', 'hooks', 'components']` recursive. |
| F-FAILOPEN `errorHonesty` | `['screens','hooks','components','lib','modes','navigation','ui','dev-tools','tests', …]` recursive, over `.ts/.tsx/.mjs/.js/.json/.md`. |
| F-ERRMSG `errorMessage` | `['screens', 'components', 'hooks']`, **non-recursive**, minus a 4-entry allowlist. **`ui/` and `lib/` are not covered** — the G-001 hole. |
| F-JOBSUPD `hardening` | `['lib', 'hooks', 'screens', 'components']` recursive, `*.web.*` deliberately INCLUDED. |
| F-STEPMAP `lifecycle` | `['screens', 'components', 'ui', 'hooks', 'lib']` recursive, minus `lib/jobLifecycle.ts`. |
| F-SQLENUM `statusVocabulary` | `supabase/` only, **non-recursive**, `.sql` only. |
| F-MIGRATED `themeTokens` | A hand-maintained 31-entry `MIGRATED_FILES` array — an explicit list, not a walk. |
| F-STAR / F-L002 `themeTokens` | Star sweep: `['screens', 'components', 'ui']` recursive. L-002: file-specific (`lib/jobs.ts`, executed `ui/tokens.ts`). |
| `tests/safety.test.mjs` | `describe('agent safety guard', { skip: PLATFORM_SKIP })` where `PLATFORM_SKIP` is falsy **only on win32**. 120 of the suite's 846 tests. CI is `ubuntu-latest`, so CI never runs them. |

Nothing above is marked UNKNOWN: every scope was read directly from source.
The one coverage that is not a path boundary is `verify-schema.mjs`, whose
scope is a human cadence and is recorded as such rather than guessed at.

## Auth session storage — device keychain (2026-08-22)

### D32. Supabase auth session moved into the device keychain, chunked, with a deliberate dev-only fallback

**Fork:** the session (two JWTs plus the user object) persisted in plain
AsyncStorage — readable by anything that can read app storage — versus the
platform keychain via `expo-secure-store`.

**Chosen:** the keychain. `lib/supabase.ts`'s `auth.storage` now points at the
adapter in `lib/secureSessionStorage.ts`, built from the pure core in
`lib/secureSessionStorageCore.ts` (landed `9552f70`, executed by
`tests/secureSessionStorage.test.mjs`). Three sub-decisions are permanent:

- **2000-byte chunking, forced by the platform.** Expo documents a ~2048-byte
  per-value ceiling for SecureStore, and a Supabase session routinely exceeds
  it. Values split into ≤2000-byte UTF-8 chunks (margin under the ceiling,
  never splitting a surrogate pair) under per-write generation keys, with the
  manifest written last as the completion mark — a torn read returns old, new
  or absent, never a mixture.
- **Dev-only fallback, deliberate.** If the native module is absent and
  `__DEV__` is true, the adapter falls back to plain AsyncStorage with one
  unmissable `██ DEV FALLBACK ██` warning, so Metro stays usable against a dev
  client that predates the module. A NON-dev build with the module absent
  hard-rejects instead: a release must never quietly store tokens in plain
  storage. The asymmetry is the point; do not "fix" either side.
- **One wiring path, fenced.** `tests/secureSessionStorageFence.test.mjs`
  (proven red first): `auth.storage` never resolves to plain AsyncStorage,
  only the wiring imports the core, only `lib/supabase.ts` imports the wiring,
  and no app code names the session key by literal. `lib/supabase.web.ts` and
  `scripts/home-shots.mjs` are web-only surfaces outside the fence by design.

**Why:** auth tokens are credentials; the keychain is the platform's answer
for credentials. The move changes WHERE the session is written and nothing
else — existing sessions migrate silently once (write-through first, clear
the source after), so nobody is signed out.
