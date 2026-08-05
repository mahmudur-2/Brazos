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
