# 10 — Dead code and hygiene

**Method:** a full static import graph was built over all **327** code files in `screens/ lib/ ui/ components/ navigation/ modes/ hooks/ dev-tools/ scripts/ tests/` plus root `App.tsx`, `index.ts`, `env.d.ts`. `tsconfig.json` extends `expo/tsconfig.base` and declares **no `paths` aliases**, so every intra-repo specifier is relative and resolution is unambiguous. A grep for `import(` / `React.lazy` across the whole scope returned **zero hits** — there is no dynamic import or string-keyed component registry anywhere, so the graph is complete and §A is **VERIFIED**, not inferred.

`start.ps1` was never opened.

---

## Summary

| Check | Result |
|-|-|
| Files reachable from `index.ts` → `App.tsx` | **256 of 327** |
| **Unreachable source files (excluding tests/scripts roots)** | **3** |
| Exported symbols with no importer | **124** |
| Duplicate implementations of one concept | **12 concepts** |
| **Orphaned assets** | **355 KB true orphans + 472 KB byte-identical duplicate** |
| **Broken asset references** | **0** ✅ |
| **Commented-out code blocks > 5 lines** | **0** ✅ |
| `console.log` in app source | **0** ✅ |
| `console.warn`/`error` where it is the ONLY handling | **35** |
| **TODO / FIXME / HACK / XXX** | **0** ✅ |

Three of those clean results are unusual enough to state up front: **zero commented-out code, zero `console.log`, and zero TODO markers across 327 files.** This project tracks work in `HANDOFF.md` rather than in code comments, and it is consistent about it.

---

## A. Unreferenced files — 3

### A1. `screens/BrowseJobsScreen.tsx` — DEAD SCREEN, 583 lines (VERIFIED)

**Zero import statements anywhere.** Independently confirmed this run: `grep -rn "^import.*BrowseJobsScreen\|from '.*BrowseJobsScreen'"` across every `.ts`/`.tsx` returns **nothing**. The four files that name it do so only in prose:

```
screens/WorkerResultsScreen.tsx:42  // BrowseJobsScreen imports it from this path.
lib/discoveryFilter.ts:16           * BrowseJobsScreen's `import { NEARBY_RADIUS_MILES } from
lib/earningsMath.ts:39              * Same semantics as the LOCKED BrowseJobsScreen's inline
hooks/useBidCounts.ts:9             * `screens/HomeScreen.tsx` (screen 07) and `screens/BrowseJobsScreen.tsx`
```

It is registered in neither tree, and the tests **actively assert its absence**: `tests/workerHome.test.mjs:305-306` (`assert.doesNotMatch(workerRoot, /name="BrowseJobs"/)`), `tests/mode.test.mjs:238`. `tests/workerHome.test.mjs:494` states it plainly — *"BrowseJobsScreen: the atlas-48 screen, **UNMOUNTED since 4D-1b**."*

Last touched `eb6b1a8`, 2026-08-12.

**It is nonetheless load-bearing as a test fixture.** At least ten test files read its source **as text**: `tests/mode.test.mjs:42`, `tests/potentialEarnings.test.mjs:19`, `tests/workerDiscovery.test.mjs:425`, `tests/layout.test.mjs:155`, `tests/safety.test.mjs:74`, `tests/verificationBadgeRemoved.test.mjs:42`, `tests/themeResolution.test.mjs:253`, `tests/crossTabNavigation.test.mjs:172`, `tests/workerHome.test.mjs`. **Deleting it fails the suite until those are updated in the same commit.**

**And it is still listed as LOCKED in CLAUDE.md** — in the same block that says "None. All screens unlocked." See `09_docs_drift.md` D-7.

**Its dead weight is measurable across three other domains:** 65 hardcoded taste values (`06_design_studio_readiness.md`), 2 sub-44 touch targets and 1 hardcoded hex (`02_invariants.md`), and 4 `WorkerResults` dispatch sites (`03_navigation.md`). **None of those should be fixed. The screen should be deleted.**

### A2. `hooks/useWorkerAvailability.ts` — DEAD, transitively (VERIFIED)

Its only importer is A1 (`screens/BrowseJobsScreen.tsx:24`). `tests/workerHome.test.mjs:370-373` pins this exact state — it walks every source file and asserts the user list deep-equals `['screens/BrowseJobsScreen.tsx']`. `screens/WorkerHomeScreen.tsx:72` documents the replacement: *"presence: nothing here reads or writes useWorkerAvailability."* **Dies with A1.**

### A3. `hooks/useChat.ts` — DEAD, 100+ lines (VERIFIED)

**Zero importers.** Independently confirmed: a grep for `useChat` across `screens/ components/ hooks/ lib/` returns **only its own definition file**. `screens/ChatScreen.tsx:32` imports `useConversationChat` instead — `useChat` was superseded and never removed. Last touched `249589f`, 2026-08-02.

**A stale test allowlist still protects it.** `tests/errorMessage.test.mjs:69` carries `'hooks/useChat.ts', // LOCKED hook — wrapped at the ChatScreen render seam`, and `:107-114` asserts the ChatScreen wrap that supposedly protects it. That guarantee is now about `useConversationChat`. **The allowlist entry protects a file with no consumer.**

See also §C9 — it is a near-complete duplicate of `useConversationChat`.

### A4. Operator scripts with no automated caller (not dead — recorded)

`scripts/rls-probe-offers.mjs` (10.8 KB), `scripts/seed-review.mjs` (11.1 KB), `scripts/lifecycle-proof.mjs` (20.1 KB), `scripts/reset-test-user-password.mjs` (7.3 KB). Nothing in `package.json`, no test, no other script invokes them; all four require live staging and `.env`, so they can only be run by hand. `scripts/home-shots.mjs` and `scripts/verify-schema.mjs` look similar but are documented in CLAUDE.md; `scripts/supabase-ref.mjs` is imported by two others.

### A5. A dev tool bundled into production (P3, VERIFIED)

`App.tsx:25` does an **unconditional static import**:

```ts
import { HomeDesignStudio } from './dev-tools/HomeDesignStudio';
```

The *render* is gated — `App.tsx:27-31` `SHOW_HOME_DESIGN_STUDIO = __DEV__ && Platform.OS === 'web' && …`, used at `:92` — but the **import is not**, so `dev-tools/HomeDesignStudio.tsx` (6.1 KB) and `lib/homeDesignStudio.tsx` ship in every release bundle and can never run.

Same pattern at `navigation/sharedStacks.tsx:44` for `ComponentCatalog` (19.5 KB). There the *route* is `__DEV__`-gated at `:169`, and the comment at `:165-168` claims *"a production bundle has no route to it at all"* — true of the route, **not** of the 19.5 KB of component code.

**This matters more as the studio grows** — see `06_design_studio_readiness.md` §3, which proposes expanding it from 8 knobs to ~30.

---

## B. Exported but never imported — 124 symbols

### B1. Exported and unused even inside its own file — strongest delete candidates

| file:line | symbol |
|-|-|
| `hooks/useChat.ts:22` | `useChat` (whole file dead — A3) |
| `lib/conversations.ts:40` | `conversationTarget` |
| `lib/offers.ts:506` | `fetchOfferCount` |
| `lib/skillCategories.ts:96` | `skillCategoryIcon` |
| `lib/phoneAuth/errors.ts:123` | `maskPhoneForLog` |
| `lib/phoneAuth/index.ts:26` | `phoneAuthMode` (screens call `phoneAuth.getMode()` — its own `:16-18` says so) |
| `lib/phoneAuth/index.ts:34` | `phoneAuthConfigError` |
| `lib/adapters/payments.ts:71` | `paymentsConfigError` |
| `lib/phoneNumber.ts:161` | `fromE164` |
| `lib/navigation.ts:180` | `DiscoverStackNavigation` (type) |
| `ui/tokens.ts:396` | `ButtonVariant` (type) |
| `lib/legal/index.ts:52` | `LegalAcceptance` (type) |
| `lib/offerNavigation.ts:37` | `OFFER_JOB_TAB` |

### B2. Over-exported — used only inside its own module (drop the `export`)

37 symbols: `hooks/useVoiceRecorder.ts:16 START_DELAY_MS` · `lib/countries.ts:20 DEFAULT_COUNTRY_CODE` · `lib/discoveryFilter.ts:26 isDistanceFilterMiles` · `lib/jobLifecycle.ts:54 AUTO_RELEASE_HOURS`, `:185 releaseCountdownLabel` · `lib/jobs.ts:151 mapJobRow` · `lib/locationPrivacy.ts:23 isCoordinateShapedLocation` · `lib/messages.ts:82 UNSEND_WINDOW_MS`, `:102 WORKER_CHAT_TEMPLATES`, `:109 CUSTOMER_CHAT_TEMPLATES` · `lib/navigationRef.ts:31 navigateWhenReady`, `:62 canNavigateTo` · `lib/offerNavigation.ts:59 isOfferJobOpenable` · `lib/offers.ts:119 MAX_COUNTERS_PER_SIDE` · `lib/phoneNumber.ts:67 nationalDigits` · `lib/postJobDraft.ts:24 LEGACY_DRAFT_STORAGE_KEY`, `:31 draftStorageKey` · `lib/priceGuidance.ts:24 PRICE_GUIDANCE`, `:39 priceGuidanceFor` · `lib/profileCompleteness.ts:12 SERVICES_TARGET`, `:13 PORTFOLIO_TARGET` · `lib/pushNotifications.ts:20 ANDROID_CHANNEL_ID`, `:92 hasAskedForPush` · `lib/rebook.ts:16 DELETED_USER_LABEL`, `:19 isTombstonedName` · `lib/reverseGeocode.ts:70 neighbourhoodOf`, `:77 boroughOf`, `:91 stateCodeOf`, `:106 formatArea` · `lib/setupState.ts:29 isLandingPreference` · `lib/storage.ts:214 isSupportedVideo` · `lib/theme.ts:401 SCRIM_DARK_ALPHA` · `lib/themePreference.ts:28 isThemePreference` · `lib/validation.ts:22 MONEY_CEILING_CENTS`, `:50 JOB_DESCRIPTION_MIN_CHARS` · `lib/workerSearch.ts:49 WORKER_RESULT_LIMIT`, **`:451 searchWorkers`**.

**Important caveat before removing any of these:** many are exported *because a `.mjs` test greps for the identifier*. Those tests read the file as **text**, so they would pass without the `export` — but that has to be checked per symbol, not assumed.

### B3. Barrel re-exports nothing consumes

`ui/primitives/index.ts` re-exports three symbols used only inside `ui/primitives/BottomNav.tsx`: `BottomNavItem` (`:101`), `bottomNavHeight` (`:103`), `CUSTOMER_CREATE_SLOT` (`:107`). Contrast `TAB_BAR_CONTENT_HEIGHT`, whose own `:171-173` comment defends its export — that one **is** consumed externally.

### B4. Type-only exports with no external consumer — 77

Full list omitted for length; representative: `components/OfferCard.tsx:116 OfferCardProps` · `lib/compareBids.ts:141 TrustRow` · `lib/hotspots.ts:23 HotspotTier` · `lib/jobStage.ts:17 JobStage` · `lib/matchReasons.ts:20 MatchReasonKey` · `lib/offers.ts:25 OfferType` · `ui/tokens.ts:102 ColorToken`. **Low priority** — types cost nothing at runtime — but each is a public API surface nobody asked for.

---

## C. Duplicate implementations — 12 concepts

### 🔴 C1. Money formatting — **a CLAUDE.md invariant is broken** (VERIFIED this run)

Canonical: `lib/jobs.ts:661 formatBudget()`, 24 direct importers, wrapped by `ui/primitives/MoneyText.tsx:68`.

`lib/services.ts:103-111 servicePriceLabel()` contains a **byte-identical copy of `formatBudget`'s body**, and `lib/services.ts` never imports `formatBudget` at all — its only import is `./supabase` (`:1`). Read side by side:

```ts
// lib/services.ts:105-109                    // lib/jobs.ts:663-667
const dollars = service.price_cents / 100;    const dollars = cents / 100;
const amount = `$${dollars.toLocaleString(    return `$${dollars.toLocaleString(
  'en-US', { minimumFractionDigits: 0,          'en-US', { minimumFractionDigits: 0,
  maximumFractionDigits: 2 })}`;                maximumFractionDigits: 2 })}`;
```

CLAUDE.md: *"Money is integer cents… formatted **only** through `formatBudget()`."*

**This is the one true bypass.** `Intl.NumberFormat` and `.toFixed(2)` appear **zero** times anywhere in scope — the invariant holds everywhere else. It also **corrects `02_invariants.md` §I-1**, which reported this invariant as a clean PASS: that scan looked for the *bypass idioms*, and `servicePriceLabel` bypasses by **re-implementing** instead. Both scans were right about what they measured; only together do they give the answer. **Verdict: VIOLATION.**

Related, same missing abstraction (cents → dollar *input string*, the inverse of `lib/jobs.ts:652 dollarsToCents`), hand-rolled 5×: `components/AmountPrompt.tsx:48`, `screens/PostJobScreen.tsx:227, 454, 459, 461`.

### 🔴 C2. Job status / lifecycle — **P3-31 broken, five vocabularies**

| # | implementation | over | verdict |
|-|-|-|-|
| 1 | `lib/jobLifecycle.ts:71-107 deriveJobLifecycle` | 6 DB statuses → 12 states | **canonical** — 6 consumers |
| 2 | `lib/jobStage.ts:28-54 jobStage` | 4 statuses → `{statusKey,label}` | second; 1 consumer |
| 3 | `ui/primitives/StatusPill.tsx:69-101` | a 14-value enum | third. Its own `:19-22` admits *"This does not replace components/StatusBadge.tsx… They converge in Phase 3"* — **Phase 3 never happened** |
| 4 | `components/StatusBadge.tsx:13-43` | 17-key flat map | fourth; 7 consumers |
| 5 | `components/JobProgress.tsx:5-15` | 3 statuses → step index | fifth; duplicates `lib/jobLifecycle.ts:133 trackStepIndex()` |

A **character-identical title-caser** appears twice: `lib/jobStage.ts:52` and `components/StatusBadge.tsx:46` — `status.replace(/_/g,' ').replace(/\b\w/g,(c)=>c.toUpperCase())`.

And **12 screens test raw `job.status` directly**, bypassing all five. `screens/ClientJobDetailScreen.tsx` does it **ten times** (`:132, 221, 711, 820, 846, 848, 858, 971` …) in a file that already imports and calls *both* derivations (`:54-55`, `:155`, `:158`). `lib/jobStatusCompatibility.ts:80` hardcodes the transition graph a sixth time.

`lib/disputes.ts` is clean — a disjoint vocabulary.

**This settles `02_invariants.md` §I-17 as a VIOLATION** and is the evidence behind `09_docs_drift.md` D-2.

### C3. Empty-state / loading — the shared primitive has zero screen consumers

`ui/primitives/EmptyState.tsx:39` is imported **only** by `ui/templates/ScreenStates.tsx:2` and `dev-tools/ComponentCatalog.tsx:14`. Its own docstring (`:22-24`) says it exists to stop *"four near-identical treatments drifting apart across ~40 routes."*

**17 surfaces hand-roll the same glyph→title→body block** — `BrowseJobsScreen:414`, `MessagesInboxScreen:385`, `CellJobsScreen:133`, `AdminReportsScreen:207`, `ProfileReviewsScreen:194`, `ChatScreen:1112`, `MyJobsHubScreen:329` (whose string *"Nothing here yet"* is literally `ScreenStates.tsx:84`'s own default), `WorkerResultsScreen:372` **and** `:389`, `ClientJobDetailScreen:602, 619`, `WorkChecklistScreen:187`, `HomeScreen:672`, `WorkerHomeScreen:490`, `EarningsScreen:146`, `components/PastWork.tsx:144`, `components/PortfolioPicker.tsx:335`, `components/CountryPicker.tsx:166`.

**20 hand-rolled centred spinners** duplicate `ScreenStates.tsx:66-70`: `AdminReportsScreen:130`, `CellJobsScreen:110`, `ChatScreen:988`, `ClientJobDetailScreen:598`, `LegalDocumentScreen:33`, `NotificationSettingsScreen:199`, `WorkerProfileScreen:237`, `ProfileScreen:510`, `MyJobsHubScreen:289`, `WorkerJobScreen:333`, `MessagesInboxScreen:330`, `ProfileReviewsScreen:130`, `PostJobScreen:898`, `SetupScreen:365`, `JobDetailScreen:698`, `navigation/ModeShell.tsx:66`, `components/PortfolioPicker.tsx:331`, `components/HotspotMap.web.tsx:340`, `components/HotspotMap.native.tsx:114`, `components/PastWork.tsx:128`.

**This quantifies `02_invariants.md` §I-27's PARTIAL.** 14 screens configure the templates correctly; 17+20 surfaces reinvent them.

### C4. Four job-card implementations; the canonical one renders on zero screens

| file | consumers |
|-|-|
| `ui/primitives/JobCard.tsx:52` (§I canonical, mode-aware) | **zero screens** — only `dev-tools/ComponentCatalog.tsx:398` |
| `components/BrowseJobCard.tsx:31` | `CellJobsScreen:118`, `JobDetailScreen:936` |
| `components/WorkerJobCard.tsx:28` | `BrowseJobsScreen:401`, `MapScreen:434`, `WorkerHomeScreen:496`, `WorkerResultsScreen:346` — **de-facto canonical by usage** |
| `screens/HomeScreen.tsx:708 OpenJobCard` | `HomeScreen:678` — a fourth, screen-private copy |

All four import the same `categoryAccent` / `JOB_CATEGORY_ICONS` / `JOB_CATEGORY_LABELS` / `jobThumbnailUrl` / `formatBudget` / `formatTimeAgo` set and draw the same shape. `ui/primitives/JobCard.tsx:46-50` admits *"No existing screen has been migrated onto this card in Phase 2."*

`components/Card.tsx:25` is the correct generic container (20 consumers) — but `WorkerJobCard` and `ui/primitives/JobCard` both re-implement surface/border/shadow inline instead of composing it.

### C5. Date / relative time

Canonical `lib/time.ts` is clean, 14 importers. But `lib/offerCopy.ts:96 offerExpiryLabel` was written *specifically* to end an inline-date duplication (its `:91-93` says so) and only 2 of 4 sites adopted it:
- `screens/BidDetailScreen.tsx:156-159` — still inline
- `screens/JobDetailScreen.tsx:763-767` — still inline, **in the file that already imports `offerExpiryLabel` at `:37` and uses it at `:718`**

Two independent "next N days" builders: `lib/offerMessage.ts:105-123` vs `screens/PostJobScreen.tsx:120-139`. Two "member since" formatters: `screens/ProfileDetailsScreen.tsx:31-40` vs `screens/ProfileScreen.tsx:430-434`.

### C6. Distance — **two different strings for the same number**

Canonical `lib/discoveryFilter.ts:66 formatDistanceMiles()` → `"2.5 mi away"`.

`ui/primitives/JobCard.tsx:156` — the §I canonical card — hand-rolls `` ` · ${distanceMiles.toFixed(1)} mi` ``, producing **`"2.0 mi"`** where `components/WorkerJobCard.tsx:160`'s correct `formatDistanceMiles(distanceMiles)` produces **`"2 mi away"`**. `screens/NotificationSettingsScreen.tsx:277` re-implements `distanceFilterLabel`.

Note also `screens/WorkerResultsScreen.tsx:43` re-exports `NEARBY_RADIUS_MILES`, so `BrowseJobsScreen:32` and `WorkerHomeScreen:46` import a **lib constant laundered through a screen**.

### C7. Theme surfaces

The documented chain is intact (`ui/tokens.ts` → `lib/theme.ts` → `lib/ThemeContext.tsx`), and `hooks/useThemeColors.ts:15` is a one-line delegation, not a second hook. Full analysis in `05_theme_parity.md`. Two additions from this sweep:

- **`screens/BrowseJobsScreen.tsx:45`'s `AVAILABILITY_ONLINE_COLOR = '#0DBC5A'` is byte-identical to `lib/theme.ts:75`'s `homeLive` token.** A token existed and a literal was written anyway.
- **`lib/jobs.ts:69-81` is a 22-hex color surface inside a data module**, invisible to the theme system and with no dark variant.

### C8. Two phone display formatters with **divergent output**

- `lib/phone.ts:7 formatPhoneDisplay` → `"(555) 123-4567"`. Whole file is 19 lines; **one importer**: `screens/ProfileDetailsScreen.tsx:14`.
- `lib/phoneNumber.ts:120 formatNational` → `"555 123 4567"`, part of the 168-line E.164 module that owns masking, validation and country resolution.

**The same US number renders two different ways depending on the screen.** `lib/phoneNumber.ts` is canonical; `lib/phone.ts` is vestigial.

Two phone *validators* too: `lib/validation.ts:73 isValidPhone` (`/^\d{7,15}$/`, country-blind, E.164 max inlined at `:74`) vs `lib/phoneNumber.ts:98 phoneValidationError` (country-aware, uses `E164_MAX_DIGITS`).

### C9. `hooks/useChat.ts` duplicates `hooks/useConversationChat.ts`

Same imports (`chatTargetFilter`, `chatTargetKey`, `fetchMessages`, `resolveMessageMedia`), same `useId()` + `runRef` realtime-channel-naming pattern (`useChat.ts:59` vs `useConversationChat.ts:106`). See A3.

### C10. Avatar / initials — **clean**, the best-consolidated concept in the repo ✅

`lib/profiles.ts:193 getInitials()` is the only initials derivation; `components/Avatar.tsx:29` its only consumer; `components/AvatarPressable.tsx:30,34` delegates. **No inline `.charAt(0)` initials anywhere.**

### C11. Other duplication

- **`toPhotoArray` copied verbatim** — `lib/jobs.ts:146` and `lib/reviews.ts:27`, identical bodies. `jobs.ts` canonical (6 vs 3 call sites).
- **A payment-caption map duplicated inside one directory** — `ui/primitives/MoneyText.tsx:24-34 CAPTIONS` ≡ `ui/primitives/StatusPill.tsx:138-148 PAYMENT_LABELS`, **nine identical keys and strings** — and `MoneyText.tsx:5` already imports `PaymentStatus` *from* `StatusPill`.
- **`knownRating()` exists and nothing renders through it.** `lib/compareBids.ts:32` is the canonical "a rating is null, never zero" rule; **zero rendering surfaces call it.** Eight re-derive `?? 0` instead — `components/OfferCard.tsx:180-185` and `screens/WorkerSearchScreen.tsx:625-629` are near-byte-identical (differing only in icon size 14 vs 13 and `'No reviews yet'` vs `'no reviews yet'`), plus `SavedWorkersScreen:150`, `BidDetailScreen:204`, `CompareBidsScreen:264`, `ProfileScreen:442`, `ProfileDetailsScreen:148`, `ProfileReviewsScreen:160`, `WorkerProfileScreen:286`. **This is a marketplace-data-honesty rule with a canonical implementation that nothing uses.**
- **Seven AsyncStorage try/catch wrappers, no shared helper** — `modes/modeStorage.ts`, `lib/discoveryFilterStorage.ts`, `lib/setupStorage.ts`, `lib/themePreferenceStorage.ts`, `lib/postJobDraft.ts`, `hooks/useWorkerAvailability.ts`, `hooks/useOneTimeNotice.ts`, `lib/pushNotifications.ts`. Naming hazard: `lib/storage.ts` is *Supabase file storage*, unrelated.
- **`lib/supabase.ts` vs `lib/supabase.web.ts`** — a legitimate Metro platform split, but the auth-config block (`:14-21` vs `:24-29`) is duplicated verbatim; only URL/key resolution genuinely differs.
- **`openJobsPotential` duplicated into the dead screen** — `lib/earningsMath.ts:46-58` and `screens/BrowseJobsScreen.tsx:105-116`, line for line. Documented as deliberate at `earningsMath.ts:39-40` *because the screen was LOCKED*. **Since A1 shows the screen is dead, this duplicate can now go.**
- **`ui/primitives/StepHeader.tsx` bypassed by the one wizard that needs it** — its `:11-13` says *"PostJobScreen currently draws its own version of this inline"*; confirmed at `screens/PostJobScreen.tsx:915-930`.
- **Three modal shells** — `ui/primitives/Sheet.tsx`, `components/ActionSheet.tsx`, `components/ServicePickerSheet.tsx` each independently build `Modal` + `useSafeAreaInsets()` + `scrimInDark` + rounded-top surface. `Sheet.tsx:18-23` cites DECISIONS.md D7 as settling this; the content models do differ, but the scaffolding is triplicated.
- **Three category taxonomies** — `lib/jobs.ts:31,48,69`, `lib/skillCategories.ts:21,45,68,92,96`, `lib/workerSearch.ts CATEGORY_KEYWORDS`. `skillCategories.ts:18` documents the overlap as intentional.

### C12. Verified clean ✅

Fee math (`lib/payments.ts:94-104`, single-source) · error copy (`lib/errorMessage.ts userMessage()`, and **zero `Alert.alert` calls** in scope — the `lib/dialog.ts` rule is honoured) · offer-lapse logic · `lib/earnings.ts`/`earningsMath.ts` fetch/pure split · `lib/mapClustering.ts`/`hotspots.ts` · `HotspotMap.native/.web` + shared `.d.ts` · `hooks/useBidCounts.ts:22` (a documented one-line facade) · `hooks/useJob.ts` vs `useJobDetail.ts` (different contracts).

---

## D. Assets

**18 files, 14 MB** in the only asset directory.

### D1. True orphans — 355 KB (VERIFIED)

| file | bytes | why it is unreachable |
|-|-|-|
| `assets/splash-icon.png` | 254,638 | **`app.json` has no `splash` key at all** and `expo-splash-screen` is in neither `plugins` nor `package.json` |
| `assets/android-icon-foreground.png` | 78,796 | `app.json` `adaptiveIcon.foregroundImage` points at `./assets/icon.png`, not this |
| `assets/android-icon-background.png` | 17,549 | `app.json` uses `backgroundColor: "#082F27"`, not an image |
| `assets/android-icon-monochrome.png` | 4,140 | no `monochromeImage` key exists |

CLAUDE.md says Android is deferred, which explains the three Android icons — but they are unreachable **today**, by the config that ships. See `09_docs_drift.md` D-9.

### D2. Transitively orphaned

`assets/brand/worker-home-toolbox.png` — 115,644 B. Sole reference: `screens/BrowseJobsScreen.tsx:38` (dead). **Dies with A1.**

### D3. Design source in the runtime asset folder

`assets/brazos-logo-source.png` — **1,887,276 B**, the largest single file. No `.ts`/`.tsx`/`.json` reference; its only consumer is `scripts/generate-icons.ps1`. **Not deletable** — it is the master artwork — but Metro will happily bundle anything under `assets/`. It belongs outside `assets/`.

### D4. Byte-identical duplicate shipped twice (VERIFIED by MD5)

```
f814001256c6265b207095901f70e622  assets/brand/brazos_b_drape.png     472,353 B
f814001256c6265b207095901f70e622  assets/prestige/brazos_b_drape.png  472,353 B
```

Both `require`d from the **same file**, for the two themes — `screens/HomeScreen.tsx:61` (`POST_MARK`) and `:79` (`PRESTIGE_B_DRAPE`). `HomeScreen.tsx:118` even comments *"Both copies of brazos_b_drape.png (brand and prestige) are 918 x 753"* — the file knows they are twins. **472 KB of avoidable bundle weight.**

**Do not merge them casually:** `tests/emeraldFences.test.mjs:467` pins the prestige path and `tests/themeResolution.test.mjs:441-454` pins **both**, and `02_invariants.md` §I-9 shows the gate roster treats `assets/prestige/*` as dark-only by standing decision — the brand copy exists precisely so the light path does not touch `assets/prestige`. A merge needs that decision revisited, not just a test update.

### D5. Broken references — **NONE** ✅ (VERIFIED)

All 11 `require()` calls in app source resolve to existing files; both `app.json` paths resolve; every asset path named in `tests/` and `scripts/` resolves. **The highest-severity class in this section is empty** — which is also what closes one branch of the code-frame investigation in `07_ui_fidelity_inventory.md` §5.

### D6. Bundle-weight note (INFERRED)

`assets/icon.png` (1.6 MB) and `assets/brand/app-icon-v2.png` (1.9 MB) are both live, and `transition-worker`/`transition-customer` are 1.7 MB each for a transient overlay. Nothing here is dead, but **~9 MB of the 14 MB is four PNGs almost certainly larger than their display size warrants.** Full resolution analysis in `12_performance.md` §D.

---

## E. Commented-out code blocks > 5 lines — **NONE** ✅

Two independent passes: (a) runs of ≥6 consecutive `//` lines where ≥50% of the content parses as code, and (b) a targeted grep for `^\s*//\s*(import |const |let |return |function |export |<[A-Z]|});|};|await |if ()`.

Pass (a) surfaced exactly one candidate — `tests/emeraldFences.test.mjs:848-854` — which is **prose about layout**, not code. Pass (b) returned 6 hits, **all prose sentences that happen to begin with those words** (`ui/primitives/BottomNav.tsx:172` "export stays because…", `hooks/useAuth.ts:2` a usage example inside a doc comment, `tests/envParity.test.mjs:14` "function is unnecessary here…").

Only two non-doc `/* */` blocks exist in app source at all (`screens/PostJobScreen.tsx:1419`, `App.tsx:163`) and both are JSX explanatory comments.

**A genuinely clean result.** The codebase's comment volume is high, but it is all prose rationale, not corpses.

---

## F. `console.*` — 47 calls, zero of them debug noise

**Zero `console.log`.** Zero `console.debug`, `info`, `trace`. Every call is `warn` or `error` and every one carries a `[Tag]` prefix.

### (a) Legitimately dev-gated — 4
`lib/AuthContext.tsx:59` (gated `:58`) · `lib/navigationRef.ts:157` (gated `:146`) · `components/AppErrorBoundary.tsx:46` (gated `:45`) · `modes/ModeGuard.tsx:31` (gated `:26`). Plus everything in `scripts/` — legitimate by location.

### (b) 🔴 Error paths where `console` is the ONLY handling — **35**

Not dev-gated; the error reaches no user-visible surface. Most carry a rationale comment citing "hardening A8" (keep last-known-good rather than write a failed read through), which makes them **deliberate** — but they remain silent production failures. The ones whose consequence is user-visible:

| file:line | consequence |
|-|-|
| **`hooks/useLegalGate.ts:30`** | **the legal gate FAILS OPEN.** `:32` then sets `'accepted'`. See `04_data_binding.md` §4 — **P1** |
| `lib/postJobDraft.ts:110` | **a draft is not persisted — the user loses typed work silently** |
| `hooks/usePushNotifications.ts:39` | token sync fails → **the user silently gets no notifications, forever, with no retry** |
| `lib/pushNotifications.ts:276` | unregister fails on sign-out → **the device keeps receiving pushes for a signed-out account** |
| `lib/notificationRoutes.ts:222` | unknown notification screen → **the user taps a push and nothing happens** (compounds `03_navigation.md` §7.5) |
| `modes/ModeProvider.tsx:269` | `active_mode` not persisted server-side → **mode desyncs across devices, silently** |
| `screens/PostJobScreen.tsx:273` | orphan media cleanup fails → **silent storage leak** |
| `components/ReviewSection.tsx:99, 187, 253` | same — three more storage leaks |

The remaining 24: `ChatScreen:291, 321` · `JobDetailScreen:283, 294, 340` · `MessagesInboxScreen:100, 112` · `NotificationsScreen:106` · `PostJobScreen:624, 792` · `WorkerJobScreen:283` · `WorkerSearchScreen:124, 138` · `lib/geolocation.ts:125` · `lib/notificationRoutes.ts:224, 256` · `lib/postJobDraft.ts:118` · `lib/pushNotifications.ts:86` · `lib/reverseGeocode.ts:140, 251, 284` · `components/JobVideo.tsx:42` · `hooks/useJobOffers.ts:114` · `hooks/usePushNotifications.ts:56` · `App.tsx:210`.

**Note `screens/ChatScreen.tsx:321` for contrast** — the messaging-lock read fails **closed**, which is correct, and shows the codebase does distinguish the two directions when it thinks about it.

### (c) Leftover debug noise in a render path — **NONE** ✅

### F-adjacent: 8 calls that also surface an error (acceptable)
`PostJobScreen:786` · `WorkerJobScreen:272` · `lib/geolocation.ts:102` · `lib/sharing.ts:62, 93` · `components/ReviewSection.tsx:220` · `hooks/useVoiceRecorder.ts:96, 137`.

### F-adjacent: 34 fully empty `catch {}` (INFERRED mostly intentional)
`lib/voiceSearch/provider.ts` (8) · `hooks/useSetupPermissions.ts` (5) · `lib/postJobDraft.ts` (2) · the six AsyncStorage wrappers (2 each) · `lib/reverseGeocode.ts:180` · `lib/setupState.ts:61` · `lib/sharing.ts:32` · `lib/voiceSearch/index.ts:27` (documented — the guarded vendor require) · `lib/phoneAuth/supabase.ts:194` · **`screens/DeleteAccountScreen.tsx:125`** · `components/HotspotMap.native.tsx:84` · `components/HotspotMap.web.tsx:311` · `hooks/useOneTimeNotice.ts:38` · `hooks/useVoiceRecorder.ts:163`.

Most are AsyncStorage-fallback shapes where an empty catch is right. **`screens/DeleteAccountScreen.tsx:125` is the one worth a second look**, given what that screen does.

---

## G. TODO / FIXME / HACK / XXX — **TOTAL: 0** ✅

| scope | hits |
|-|-|
| all source + `scripts/` + `tests/` + root files | **0** |
| `supabase/` | **0** |
| `docs/` | 2 text hits, **both false positives** |

The two doc hits: `docs/audits/HARDENING_RUN_B_2026-08-14.md:11` (*"…written here as an explicit `\uXXXX` escape"* — a Unicode notation) and `docs/emerald-v2/01_CURRENT_APP_INVENTORY.md:168` (a prior audit recording the same zero result). 20 further "binary file matches" in `docs/mockups/*.png` are coincidental PNG byte sequences.

**A real, verified zero.**

---

## H. Root-level clutter

### H1. Classified by `docs/README.md` — documented, several stale

`CLAUDE.md` · `AGENTS.md` · `HANDOFF.md` · `BRAZOS_MASTER_PLAN.md` · `PROD_APPLY.md` · `WEB_DEPLOYMENT.md` · `BRAZOS_BUILD_STATE.md` (pointer stub) · `brazos-product-spec.md` · `AUDIT_2026-08-12.md` (47 KB) · `SECURITY_AUDIT.md` (23 KB) · `DIAG_inbox_and_routes.md` (15 KB) · `DIAG_offer_negotiation_messaging.md` (26 KB) · `REVIEW_GUIDE.md` · `DECISIONS.md` (31.5 KB) · `hardening-report/` (7 files, 25.6 KB) · `project-audit/` (16 files, 111 KB).

**`hardening-report/` and `project-audit/` are the stalest classified material** — **22 days untouched**, 137 KB across 23 files, describing a codebase that has since been through the Prestige dark sweep and phases 60–75. They are classified, so they are not "undocumented" — but `project-audit/10_BUGS_AND_INCOMPLETE_WORK.md`, `/12_TECHNICAL_DEBT_AND_RISKS.md` and `/15_FILES_REQUIRING_REVIEW.md` are exactly the files an agent will read as current and be wrong.

### H2. Undocumented — see `09_docs_drift.md` D-13

`PROD_APPLY_READY.sql` (69 KB, self-labelled DO NOT APPLY — `08_security_schema.md` §H.9) · `PROD_VERIFY.sql` · `.openai/hosting.json` (96 B, untouched 22 days) · `docs/dispatch/4D-1a.md` · `docs/audit/` (this directory). `LICENSE` is unclassified but needs no classification.

### H3. 🟠 Untracked artifacts — one needs action

| path | bytes | ignored? |
|-|-|-|
| **`.audit-scratch/`** | 100 KB+ | **NOT IGNORED** — `git check-ignore` returns no match |
| `brazos-review.zip` | 943,209 | ignored by exact name (`.gitignore:38`), 23 days stale |
| `.expo-start.log`, `.expo-start-error.log` | 2,720 | ignored (`*.log`), stale |
| `design-reference/` | **109,124,356** | ignored with a documented rationale — correct |

**`.audit-scratch/` is the only untracked path that will show in `git status`, and it is not gitignored.** This run created it under the dispatch's instruction (*".audit-scratch/ is scratch space. NEVER git add it."*) and has honoured that — every commit here staged exactly one explicit path, verified with `git diff --cached --name-status`. But it is one `git add .` away from being committed, which is precisely why CLAUDE.md's explicit-path rule exists.

**This audit cannot fix it** — the dispatch forbids modifying `.gitignore`, and CLAUDE.md classes it as a protected control. **OPERATOR action:** add `.audit-scratch/` to `.gitignore`, or delete the directory after reading this audit. It holds only throwaway analyzers and a `verify` transcript; nothing in it is needed once these reports are committed.

### H4. Tracked directory weight

`docs/` is **69 MB tracked**, of which `docs/mockups/` alone is **68 MB**. `supabase/` 878 KB, `public/` 501 KB, `hosting/` 3 KB, `.github/` 1 KB (one workflow, `ci.yml`).

**Design comps are split across two homes with opposite policies:** `docs/mockups/` at 68 MB is **committed**, `design-reference/` at 104 MB is **ignored** — and CLAUDE.md describes both as *"direction, not canvases."* That asymmetry is undocumented in `docs/README.md`.

---

## Coverage

**100%** of the source scope. §A is VERIFIED rather than inferred because the absence of dynamic imports makes the static graph complete.

One stated limit: §B's 124 unimported exports were found by grepping each identifier across every other source file. A symbol referenced only from a `.mjs` test **as text** counts as unimported here — correctly, since the `export` keyword is not what makes such a test pass — but that means removing any B2 entry requires a per-symbol check, not a bulk sweep.
