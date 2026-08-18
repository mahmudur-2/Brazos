# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## 2026-08-18 - stage 4D-3.5 + 4D-2 + 4E (merged dispatch)

**No SQL executed, no database contacted, no schema object touched, no
dependency added, nothing pushed, no locked file edited, no `.env` read.**
Six feature commits plus this docs commit, in dispatch order (batch A → B →
C), each landed on a green `npm run verify`. Suite: **620 pass at the base
gate → 665 pass / 0 fail / 0 skipped** at the end. New suites:
`tests/themeTokens.test.mjs` (batch A), `tests/workerDiscovery.test.mjs`
(batch B), `tests/workerHeroCard.test.mjs` (batch C); pure modules are
EXECUTED (strip-types / direct-import patterns), screen wiring pinned
`[static]`. Two existing assertions were amended because the behaviour they
pinned legitimately changed, neither weakened: `tests/discovery.test.mjs`
(distanceAvailable gained the `radiusActive` disjunct) and
`tests/selfService.test.mjs` (the save button gained the `hireable`
conjunct).

### Batch A — token layer (4D-3.5), light-pinned

- `ui/tokens.ts` now exports `light` (Heritage, values unchanged) and `dark`
  (Emerald Prestige: near-black emerald bg `#0A1613`, dark-green cards
  `#132A22`, gold hairline `line #4A3D24`, gold primary `forest #D9B978`
  with dark `onForest`), key parity enforced by
  `satisfies Record<ColorToken, string>`. Per-key intent is documented on the
  palette for 4D-4's device tuning.
- `lib/ThemeContext.tsx` (new) + `hooks/useThemeColors.ts`: the resolver
  returns light UNCONDITIONALLY this stage. No Appearance/useColorScheme read
  anywhere, no persistence, app.json untouched (`userInterfaceStyle: "light"`
  — flipping it is 4D-4's native build, trap T1).
- `withAlpha(token, alpha)` (`ui/colorAlpha.ts`, re-exported through tokens
  and theme) replaced every scrim/on-fill rgba literal byte-for-byte;
  lib/theme gained `black` and `mediaChrome` tokens and re-exports `layout`,
  `controls`, `emeraldRadius` (§I radius scale) for screens. lib/theme's
  `darkColors` brand hues now spread from the tokens `dark` palette (one
  definition of dark-forest); its other dark values are its own and are
  unreachable until 4D-4 either way.
- The A0 hex measure (`git grep -c -E "#[0-9a-fA-F]{3,8}" -- screens
  components ui navigation modes`): **48 before → 60 after**, the rise being
  ui/tokens.ts itself growing by the 17-key dark palette (25 → 42 at the
  definition site — correct). Outside token-definition files, locked screens
  and the frozen web map, hex went 8 → 3: `components/AuthNotice.tsx` ×2 and
  `components/ModeTransitionOverlay.tsx:449` ×1, all deliberate leaves —
  see LOCKED_FILE_PATCHES **A10/A11** (authTheme is read-only this run and is
  the token home for the auth-surface strays; `#FFF3D6` is a brand-asset
  shimmer tint paired with the transition PNGs, T3). CountryPicker's one-off
  auth sheet scrim rgba also stays, queued in A10.
- Net user-visible change from batch A: none (the acceptance bar). One
  sub-visible caveat recorded: on the frozen web PWA in a dark-scheme
  browser, `components/MapPinIcon.tsx` previously dark-adapted via
  useColorScheme and is now pinned light like everything else — iOS (the
  product platform) is pinned by app.json either way.

### Batch B — worker discovery (4D-2), worker tree only

1. **Map (B1).** `lib/mapClustering.ts` — pure fixed-grid clustering (the
   dispatch's pre-made decision: no library), executed by node --test;
   deterministic pins with count-weighted centroids. Worker mode on the
   shared MapScreen renders count-badged pins (Text badges, safe with
   `tracksViewChanges={false}`); pin tap → bottom Sheet of WorkerJobCards
   for the member cells → JobDetail in the Map stack. Customer mode keeps
   the glow/CellJobs experience untouched; the tier legend hides in worker
   mode (pins state their counts). New `HotspotMapProps` members are all
   OPTIONAL — `components/HotspotMap.web.tsx` is byte-untouched and ignores
   them, so worker-mode-on-web keeps the pre-4D-2 glow view (frozen surface;
   iOS is the product).
2. **Cards (B2).** WorkerJobCard `variant="full"` gains distance
   (`formatDistanceMiles`, only from a real `distance_miles`) and the
   arrival window (the ONE `arrivalWindowLabel` formatter). Compact Home
   cards keep the locked reference's exact field list. The no-photo state
   stays the category-glyph tile — never stock imagery; no fixture has
   photos and the state is test-pinned.
3. **Filter (B3).** `lib/discoveryFilter.ts` (pure rules: options 2/5/10/25,
   per-account versioned key, fail-safe coercion to Any) +
   `lib/discoveryFilterStorage.ts` (AsyncStorage, modeStorage pattern — the
   pre-made decision, NOT SecureStore) + `components/DistanceChips.tsx` on
   both the map (filters cells via cellsWithinMiles once the native map
   reports a real fix) and WorkerResults (radius routes all/skills through
   jobs_within_radius; jobs without recorded coordinates drop only while a
   radius is APPLIED — that is what a distance filter means). Honesty rules:
   nearby mode always ARRIVES at the promised 5 regardless of the persisted
   value and its title tracks the chip; a user-chosen radius pins search's
   5→10→15 widening ladder; a dead location is announced in writing and the
   feed stays unfiltered rather than faked.
4. **Detail (B4) + reasons (B5).** JobDetail leads with the scope of work
   (description directly under the title); approximate `jobs.location` only
   (no job_locations surface — test-pinned). `lib/matchReasons.ts` derives
   the three boolean checkmarks (category / distance ≤ persisted radius,
   default the 5-mile promise / budget ceiling ≥ cheapest published FLAT
   listed price — hourly/quote rows are incomparable and contribute
   nothing). Unknown or unmet renders nothing; no percentages or scores,
   test-guarded. `budgetCeiling` is now exported from lib/jobFilters (one
   rule); `NEARBY_RADIUS_MILES` moved to lib/discoveryFilter with
   WorkerResultsScreen re-exporting it so the LOCKED BrowseJobsScreen import
   path (`from './WorkerResultsScreen'`) resolves unchanged.

### Batch C — worker hero card (4E)

`lib/workerHeroCard.ts` composes lib/compareBids.ts (knownRating,
totalCompletedJobs over worker_job_stats, onTimePercent, trustRowFor) —
reuse, not a second copy, guarded by test. Hero trust content is
positive-only, non-null only: rating (only with counted reviews — the old
"New" / "no reviews yet" placeholders are GONE, and the ProfileReviews entry
exists only when there are reviews), jobs completed (null while the stats
read is unanswered/failed; a KNOWN zero also renders nothing), responds-in
(`profiles.response_time` verbatim, trimmed). compareBids' KNOWN-new verdict
renders "New worker" and replaces the fact rows. The hero's completion% line
left the surface (the plan's trust row is exactly the three facts).
Tombstoned profiles (rebook's canHire, one predicate) carry no offer, book,
or save affordance — the mockups' verification pill, five-tab customer bar
and Hire-on-a-deleted-user are recorded defects and were not reproduced.

### Judgment calls a reviewer should see

- **Dark `forest` is GOLD.** The Prestige spec says "gold primary", and
  brand.forest's documented role IS the primary (CTAs, display titles,
  active nav). Screens using forest as a large card fill will read wrong in
  dark BY DESIGN until 4D-4's sweep restyles those cards onto `surface`; the
  intent note lives on the palette. `sage success` has no §I key — it lives
  in lib/theme's status pairs, untouched this run.
- **Alphas stay inline numbers.** withAlpha keeps the COLOUR a token read;
  the opacity is a per-surface style parameter like any other number.
  Nearly-token scrim hues were NOT converged (CountryPicker `#0B2019`,
  JobVideo's `#0F1F17` family got its own `mediaChrome` token instead)
  because batch A's bar was zero visible change.
- **Spacing/radius migration was exact-value only.** On-scale literals
  migrated; the large residue of 0–7pt optical nudges, size-derived circle
  radii (width/2), and off-scale one-offs (ChatBubble's 40pt row insets,
  JobProgress's ±12 connector pair) stay literal — snapping them changes
  rendering and inventing scale names corrupts the documented 4-base system.
- **The distance filter is per-surface state, not a live bus.** Map and
  results both read storage at mount and write on change; two simultaneously
  mounted surfaces don't live-sync until remount. Accepted as the
  modeStorage-pattern cost; a change-notify layer was not worth the moving
  part.
- **Map sheet distance join is an enhancement read.** One
  jobs_within_radius call sized to the pin; if it fails the cards render
  without distance rather than blocking.
- **`response_time` renders as "Responds in {value}"** — the column is a
  nullable free-text string the app never writes; the label assumes the
  stored value is a duration phrase ("2 hours"). If ops ever writes another
  shape there, the copy needs a second look.
- **B5's budget reason uses the job's stated CEILING** (the exported
  budgetCeiling), reading "within what the customer is willing to pay" —
  and only against FLAT published prices.

## Applied reality - staging `zzkumxcjtbqoselzptig`

Unchanged by this run — the run was repository-only. phase74 (push
scheduler) + phase75 (security hardening) are committed and
operator-applied to staging; phases 67-73 applied and verified green
2026-08-16. **Per standing policy only a green
`node scripts/verify-schema.mjs` counts as applied, and the two groups
covering phase74/75 have still never been exercised** - that run remains the
next operator action (needs `.env` + live staging, never inside an
autonomous run). Expected: every group OK, zero MISSING, zero PENDING; no
unapplied migration exists in the repository.

**Production (`avkighsiufeefyycbebf`) still has none of the migrations.**
Standing decision: rebuild from a staging dump once staging is beta-ready;
`PROD_APPLY.md` is the ordered fallback. Production was never contacted.

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

**A. Run `node scripts/verify-schema.mjs` against staging** - the only thing
that makes "phase74/75 applied" official; their two groups have never run.
**The env-parity gate fails closed (4D-B).** If `.env`'s `SUPABASE_KEY` is a
new-format `sb_…` publishable key the run will stop at the parity gate
(exit 3) with the remedy in the message; check the prefix first:
`sed -n 's/^SUPABASE_KEY=\(...\).*/\1/p' .env` prints only the first three
characters (`eyJ` = will proceed, `sb_` = will stop — swap in the legacy
`eyJ…` anon key for the staging project). No agent run can read the prefix
itself: `.env` is mechanically denied to agents.

**B. The next TestFlight build will fail its own gate** (unchanged from
Stage 4A): the EAS `preview` environment's `SUPABASE_KEY` is a new-format
publishable key (`sb_pu…`); `refFromJwt` cannot resolve it, so
`evaluateGate` fails closed. Replace with the legacy `eyJ…` anon key -
**production's**, because the `testflight` profile selects the `preview`
environment and `EXPECTED_REF.testflight` is the production ref. The
related verify-schema silent-degradation noted here previously was FIXED in
4D-B — it now fails closed the same way.

**C. "preview" names two different things.** `EXPECTED_REF` maps
`preview → STAGING_REF`, but the EAS **environment** named `preview` holds
production credentials and is what the `testflight` profile selects.
Nothing is broken; the docblock on `EXPECTED_REF` explains.

**D. `EXPO_PUBLIC_PAYMENTS_MODE` governs whether payments run.** For
payments on a release build set it to `sandbox` in `.env` and restart Metro
(Expo inlines `EXPO_PUBLIC_*` at bundle time).

**E. `RAISE NOTICE` is invisible in the Supabase SQL Editor.** Acceptance
for single-transaction migrations is "Success. No rows returned." plus a
green verify-schema; phase74/75 each end with a visible-acceptance SELECT.

**F. Device-test backlog.** Still pending from 4D-1a/4D-1b and 4D-3 (see the
2026-08-18 4D-3 HANDOFF in git history for the full earlier list): worker
cold start, worker search field, cross-mode bid-notification prompt, four
customer tabs + [ + ] sheet, My Jobs buckets, the 4D-3 post-flow aids,
Compare Bids ordering, Saved & past workers, bid chips, "Book at listed
price", Flat price / Ask me, completeness meter. **New from this run — no
offline test can confirm:**
- Map (worker): pins cluster/split while pinch-zooming; pin tap opens the
  sheet; a sheet card opens JobDetail and Back returns to the map; the pin
  badge renders its count on FIRST render (tracksViewChanges=false capture);
  customer mode still shows the glow cells and CellJobs drill-down.
- Distance chips: selection survives an app kill (AsyncStorage); the map
  filters pins once location resolves; "Location is off" notes appear when
  permission is denied; nearby's title follows the chip; the same selection
  appears on both surfaces after remount.
- Cards: distance and arrival-window rows appear on radius surfaces and the
  map sheet; no distance row on the plain feed; no-photo jobs render the
  category tile.
- Detail: description sits above the fold on a real device with a 3-photo
  hero; match checkmarks appear/disappear with profile categories, radius
  and a listed flat price; none render as ✗.
- Hero card: a profile with zero reviews shows NO rating row and no
  placeholder; a deleted user's profile shows history but no offer/book/
  save controls; "New worker" appears only for a known sub-3 count with
  null on-time.
- Batch A bar: flip through every screen — nothing visibly changed.

**G. Unlock decision — WelcomeScreen's "Verified workers" line.** With the
badge removed everywhere else, locked screen 02 is the only remaining
user-visible verification claim. Removing or rewording it requires
unlocking that screen; the 4D-B suite's allow-list names it so the
exception stays visible.

**H. LOCKED_FILE_PATCHES grew A10 + A11 (4D-3.5).** A10 adds the auth-surface
token homes to READ-ONLY lib/authTheme.ts (then three one-line unlocked
call-site migrations); A11 lists the locked screens' remaining colour
literals with exact replacements for the T4 unlock/theming session.

**I. 4D-2 and 4E are DONE (this run); 4D-4 is the next dispatch** — dark
resolution (Appearance + stored preference + setting UI), dark map style
(T2), dark brand assets (T3), `userInterfaceStyle: "automatic"` (T1, native
build), and the both-themes full-screen sweep, per
`docs/audits/STAGE4D_PLAN.md`.
