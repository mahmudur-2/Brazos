# 12 — Performance

**Scope:** `screens/ components/ ui/ lib/ hooks/ navigation/ modes/ App.tsx`. Excluded: `node_modules`, `dist`, `.expo`, `.shots`, `public/`, `hosting/`, `start.ps1`. `*.web.ts(x)` is noted but treated as frozen.

**How claims were verified:** presence/absence of props, line numbers and snippets are **VERIFIED** by direct file read. Byte sizes via `find -printf '%s'`; PNG dimensions from the IHDR header; duplicate detection by MD5. The hook inventory (285 calls) came from a brace/string/comment-aware scanner. **All re-render and cost claims are INFERRED from static reasoning — no runtime profiling was performed.**

---

## Headline findings

| # | Finding | Severity |
|-|-|-|
| **1** | **Zero `React.memo` / `PureComponent` in the entire codebase**, against 115 files consuming `useThemeColors` | **P1** |
| **2** | `MyJobsHubScreen` renders 4 unbounded lists via `.map()` inside a plain `ScrollView` — no virtualization | **P1** |
| **3** | `assets/` is 13.89 MiB; 85.5% is 7 oversized PNGs; 2.14 MB is entirely unreferenced | **P1** |
| **4** | 11 hardcoded `useNativeDriver: true` violate the CLAUDE.md web rule | **P1 (policy)** |
| **5** | `fetchOpenJobs()` has no `.limit()` — every open job in the marketplace, to render 4 cards | **P2** |
| **6** | `ChatScreen` runs an O(n) `.filter()` inside `renderItem` → O(rows × offers) | **P2** |
| **7** | `JobDetailScreen` filter + sort + slice over the whole feed in the render body | **P2** |
| **8** | All 9 `FlatList`s have a stable `keyExtractor`; 8 of 9 have no virtualization tuning | **P2** |
| **9** | 16 remote-`uri` `<Image>` sites omit `resizeMode`; `expo-image` is not used at all | **P3** |

**Verified good, worth stating:** all 6 Context providers memoize their `value`; `themedStyles` is WeakMap-cached per palette so `StyleSheet.create` never re-runs; every `FlatList` has a `keyExtractor` and none uses an index key; `useOfferCounts` key-guards internally.

---

## A. Lists

### A.1 Virtualized list inventory — 9 `FlatList`, 0 `SectionList`, 0 `FlashList`

Independently confirmed this run: **9 files contain `FlatList`, and each contains exactly one `keyExtractor`.**

| # | site | `keyExtractor` | stable? | `getItemLayout` | `initialNumToRender` | `windowSize` | `removeClippedSubviews` |
|-|-|-|-|-|-|-|-|
| 1 | `components/CountryPicker.tsx:156` | `(item) => item.code` | ✅ | ✅ `:160` | ❌ | ❌ | ❌ |
| 2 | `screens/AdminReportsScreen.tsx:134` | `(item) => item.id` | ✅ | ❌ | ❌ | ❌ | ❌ |
| 3 | `screens/BrowseJobsScreen.tsx:397` † | `(item) => item.id` | ✅ | ❌ | ❌ | ❌ | ❌ |
| 4 | `screens/CellJobsScreen.tsx:114` | `(item) => item.id` | ✅ | ❌ | ❌ | ❌ | ❌ |
| 5 | `screens/ChatScreen.tsx:992` | `(entry) => entry.key` | ✅ | ❌ | ❌ | ❌ | ❌ |
| 6 | `screens/MessagesInboxScreen.tsx:334` | `(item) => item.key` | ✅ | ❌ | ❌ | ❌ | ❌ |
| 7 | `screens/ProfileReviewsScreen.tsx:144` | `(item) => item.id` | ✅ | ❌ | ❌ | ❌ | ❌ |
| 8 | `screens/WorkerResultsScreen.tsx:337` | `(item) => item.id` | ✅ | ❌ | ✅ `8` | ✅ `11` | ❌ |
| 9 | `screens/WorkerSearchScreen.tsx:475` | `(item) => item.profile.id` | ✅ | ❌ | ❌ | ❌ | ❌ |

† dead screen (`10_dead_code.md` §A1).

**No list is missing `keyExtractor` — zero defects in that category, and no index-based list keys.** That is a clean result and unusual.

Only `CountryPicker` supplies `getItemLayout`, and it is the one list that can (fixed `ROW_HEIGHT`):

```tsx
getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
```

**P2 — 8 of 9 lists have no windowing configuration.** The three that grow without bound are `ChatScreen:992` (the whole message timeline), `ProfileReviewsScreen:144` (paginated via `onEndReached` at `:181`, so it grows monotonically), and `MessagesInboxScreen:334`. `ChatScreen` partially compensates — it handles `onScrollToIndexFailed` at `:1102`, an explicit acknowledgement that rows are variable-height. `BrowseJobsScreen` (dead) and `CellJobsScreen` are low-risk.

### A.2 🔴 Non-virtualized list rendering — P1

`screens/MyJobsHubScreen.tsx` renders **four unbounded collections** with `.map()` inside a plain `<ScrollView>` (`:294`):

```
:382   {workingItems.map((job) => (
:412   {postedItems.map((job) => {
:450   {bidItems.map((bid) => {
:503   {closedBidItems.map((bid) => {
```

Every `HubCard` for every job, posted job, pending bid and settled bid **mounts at once**, each with a remote thumbnail `<Image>` (`components/HubCard.tsx:89`). Keys are stable. This is the single largest structural list risk in the app: a heavy user's "My Jobs" mounts an unbounded card tree with no recycling. **VERIFIED** (structure), **INFERRED** (cost).

Bounded `.map()`-in-`ScrollView` lists, acceptable as-is: `HomeScreen:677` (`PREVIEW_COUNT = 4`), `WorkerHomeScreen:495` (3), `MapScreen:433`, `SavedWorkersScreen:216, 224`.

### A.3 `.map()` in JSX — key audit

Of 143 `.map(` occurrences: 91 render JSX with a stable key, 10 use an index-derived key, 42 are data transforms.

**All 10 index keys, judged:**

| site | key | assessment |
|-|-|-|
| `BrowseJobsScreen:391`, `MapScreen:420`, `WorkerResultsScreen:332` | `key={i}` over a literal `[0,1,2]` | ✅ benign — skeletons |
| `QuickReplies:64`, `VoiceNote:94`, `ScreenStates:74`, `AuthBackdrop:153` | `key={i}` over a fixed-length array | ✅ benign — decorative |
| `OtpInput:71` | `key={index}` over `cells` | ⚠️ **positional, and correct here** — an OTP cell *is* its position |
| `MarkdownText:79, 89` | `key={index}` over parsed `blocks` | ⚠️ **P3** — re-parsing shifts indices and can mis-reconcile |
| `DetailScreen:88` | `` key={section.title ?? `section-${index}`} `` | ⚠️ **P3** — index fallback when `title` is absent |

`HomeScreen:539` uses a module constant; `MediaGrid:83, 93` uses `` `${item.uri}-${index}` `` — uri-prefixed, effectively stable.

---

## B. `renderItem` allocation churn

**All 9 `renderItem`s are inline arrow functions** — a new identity every parent render.

**And no row component anywhere is memoized.** Independently confirmed this run: a grep for `\bmemo(` (excluding `useMemo(`), `PureComponent`, and `shouldComponentUpdate` across `screens/ components/ ui/ lib/ hooks/ navigation/ modes/ App.tsx` returns **nothing**. So the inline `renderItem` identity is not merely wasteful — **there is no memo boundary anywhere for it to defeat, and equally nothing to stop a full row re-render.**

| list | inline handlers per row | inline style arrays | row component memo'd? |
|-|-|-|-|
| `CountryPicker:168` | `onPress={() => onSelect(item)}` | `style={({pressed}) => [...]}` | inline JSX |
| `AdminReportsScreen:145` | multiple action handlers | — | `Card`, **no** |
| `BrowseJobsScreen:400` | `onPress={() => navigation.navigate('JobDetail', { job: item })}` — allocates a nav-params object per row | — | `WorkerJobCard`, **no** |
| `CellJobsScreen:117` | `onPress={() => navigation.navigate(...)}` | — | `BrowseJobCard`, **no** |
| **`ChatScreen:1003`** (108 lines) | **≥7**: `onAccept`, `onDecline`, `onCounter`, `onWithdraw`, `onOpenJob`, `onLongPress`, `onLongPressAvatar` | `style={[styles.requestRow, isOwn ? … : …]}` `:1000` | `OfferCard`, `ChatBubble`, **no** |
| `MessagesInboxScreen:337` | 3, one allocating a 5-key object | — | `ConversationRow`, **no** |
| `ProfileReviewsScreen:210` | one per photo, nested map | — | `Card`, **no** |
| `WorkerResultsScreen:340` | `onPress={() => navigation.navigate(...)}` | — | `WorkerJobCard`, **no** |
| `WorkerSearchScreen:495` | `onPress={() => openWorker(item)}` | — | `WorkerResultCard`, **no** |

### 🔴 Worst case — a linear scan inside `renderItem`

```tsx
// screens/ChatScreen.tsx:1038
chain={threadOffers.filter((o) => o.root_offer_id === request?.root_offer_id)}
```

Per offer row this scans the entire `threadOffers` array **and** allocates a fresh array, so `OfferCard` receives a new `chain` prop identity every render even when nothing changed. **Combined O(rows × offers).** VERIFIED (code), INFERRED (cost).

**Lower-severity churn:** inline `contentContainerStyle={[...]}` on 5 of 9 lists (`AdminReportsScreen:137`, `CellJobsScreen:124`, `ProfileReviewsScreen:147`, `WorkerResultsScreen:355`, `WorkerSearchScreen:478`), and `ListHeaderComponent`/`ListEmptyComponent` passed as JSX **elements** rather than component types (`BrowseJobsScreen:407` — where `header` is a large tree built in the render body at `:213`; `ProfileReviewsScreen:155`; `WorkerSearchScreen:482`). Both **P3**.

---

## C. Images

**`expo-image` is not a dependency and is not used anywhere** — the only `expo-image*` import is `expo-image-picker`. Every image is RN core `<Image>`; there are **zero `<ImageBackground>`**. Consequently there is no `contentFit`, no blurhash placeholder, no transition, and no disk cache beyond RN's default.

### C.1 Local `require()` assets — 11 sites, **all correct** ✅

Every one sets explicit dimensions *and* a `resizeMode`: `BrandLogo.tsx:24→:50`, `HomeAtmosphere.tsx:9→:59`, `modeTransitionAssets.ts:19,20 → ModeTransitionOverlay.tsx:357`, `BrowseJobsScreen.tsx:38→:250`, `HomeScreen.tsx:61,62,78,79→:431,:620`, `LaunchScreen.tsx:21`, `WorkerHomeScreen.tsx:50→:280`.

### C.2 Remote `uri` images — 16 sites with dimensions but **no `resizeMode`** (P3)

All have concrete width/height from their style, so nothing is unbounded; all silently rely on RN's default `cover`.

`Avatar.tsx:21` · `ChatBubble.tsx:105, 120` · `MarketJobPreview.tsx:127` · `OfferCard.tsx:432` · `PastWork.tsx:188` · `PortfolioPicker.tsx:352, 401` · `ReviewSection.tsx:323, 366` · `ApproveOrDisputeScreen.tsx:376` · `ChatScreen.tsx:1180` · `ClientJobDetailScreen.tsx:555, 908, 947` · `ProfileReviewsScreen.tsx:252` · `WorkerJobScreen.tsx:536, 599`.

**`components/Avatar.tsx:21` is the one worth calling out** — the most widely mounted remote image in the app, and its fallback fires only when `uri` is *absent*, never when the load *fails*:

```tsx
return <Image source={{ uri }} style={[styles.image, dimension, ring]} />;
```

A 404 or offline avatar renders as a bare `colors.border` square (`:37`) instead of the initials block that already exists at `:24`. Cross-referenced as a correctness defect in `04_data_binding.md` §5.

### C.3 The pattern to copy ✅

Five sites already pair explicit dimensions + `resizeMode="cover"` + an `onError` fallback: `BrowseJobCard.tsx:77`, `HubCard.tsx:89`, `WorkerJobCard.tsx:108`, `ui/primitives/JobCard.tsx:127`, `HomeScreen.tsx:751`. Also correct: `JobDetailScreen.tsx:568`, `MediaGrid.tsx:63`, `MediaUploader.tsx:157`, `DetailScreen.tsx:85` (uses `aspectRatio: 16/10` rather than a fixed height).

**No image in scope lacks *both* dimensions and resize behavior.**

---

## D. Asset weight — **13.89 MiB total (14,562,470 bytes) across 18 files**

### D.1 Every file over 500 KB, descending

| bytes | path | pixels | B/px | referenced? |
|-|-|-|-|-|
| 2,041,275 | `assets/prestige/home-atmosphere-dark.png` | 1080×2335 | 0.81 | ✅ `HomeAtmosphere.tsx:9` |
| 1,918,156 | `assets/brand/app-icon-v2.png` | 1254×1254 | 1.22 | ✅ `LaunchScreen.tsx:21` |
| **1,887,276** | **`assets/brazos-logo-source.png`** | 1254×1254 | 1.20 | ❌ **not by any code** |
| 1,759,959 | `assets/brand/transition-worker.png` | 1192×1319 | 1.12 | ✅ |
| 1,723,928 | `assets/brand/transition-customer.png` | 1192×1319 | 1.10 | ✅ |
| 1,635,946 | `assets/icon.png` | 1024×1024 | 1.56 | ✅ build-time only (`app.json`) |
| 1,483,022 | `assets/prestige/hero_toolbox_worker.png` | 1329×885 | 1.26 | ✅ `WorkerHomeScreen.tsx:50` |

Subtotal: **12,449,562 bytes = 85.5% of `assets/`.**

### D.2 🔴 Unreferenced — 2,242,399 bytes (15.4%) — P1

`assets/brazos-logo-source.png` (1,887,276) · `assets/splash-icon.png` (254,638) · `assets/android-icon-foreground.png` (78,796) · `assets/android-icon-background.png` (17,549) · `assets/android-icon-monochrome.png` (4,140).

Full reasoning in `10_dead_code.md` §D1/§D3. `brazos-logo-source.png` is **design master artwork** — not deletable, but it should not live under `assets/`, because Metro bundles anything there.

### D.3 Byte-identical duplicate — P2

```
f814001256c6265b207095901f70e622  assets/brand/brazos_b_drape.png     472,353 B
f814001256c6265b207095901f70e622  assets/prestige/brazos_b_drape.png  472,353 B
```

Both required from `screens/HomeScreen.tsx:61` and `:79`. **944,706 bytes shipped for one image.** See `10_dead_code.md` §D4 for why a merge is not as simple as it looks — the two paths encode a dark-only-vs-light gate decision, not just a filename.

### D.4 🔴 Resolution oversizing — P1

Comparing native pixels against the layout box each draws into (**VERIFIED** dimensions, **INFERRED** @3x sufficiency):

| asset | native | drawn at | @3x needs | over by |
|-|-|-|-|-|
| `hero_toolbox_worker.png` (1.48 MB) | 1329×885 | 162×108 pt (`WorkerHomeScreen.tsx:550`) | 486×324 | **~2.7×** |
| `brazos_b_drape.png` (472 KB **×2**) | 918×753 | ~63 pt wide (`HomeScreen.tsx:1153`, ratio 0.277) | ~189 px | **~4.9×** |
| `app-icon-v2.png` (1.92 MB) | 1254×1254 | the launch mark | — | large |
| `brazos-b-leaf.png` (453 KB) | 512×512 | `BrandLogo` `size` prop | — | **1.73 B/px — worst compression ratio in the tree** |

Legitimately full-bleed and reasonably sized: `home-atmosphere-dark.png` (a 1080×2335 full-screen backdrop) and the two `transition-*.png` panels. **`hero_armchair_customer.png` at 400×351 for a 112×124 pt slot is correctly sized — the one asset that is right.**

**Roughly 6–8 MB of the 13.89 MB is recoverable with no code change** — delete the orphans, dedupe the drape, downscale two heroes.

---

## E. Hook dependency arrays

**Inventory (VERIFIED):** 285 hook calls — 134 `useEffect`, 84 `useCallback`, 67 `useMemo`, 0 `useLayoutEffect`.

### E.1 Missing dependency array entirely — 2, both intentional and safe ✅

`components/ModeTransitionOverlay.tsx:174` and `hooks/useNotificationModeBridge.ts:22` — both the documented latest-ref pattern, bodies are ref writes only. **Not defects.**

> **Correction to the first-pass scan:** `lib/ThemeContext.tsx:103` was initially reported as missing deps. **It is not** — it has `[palette, emerald, isDark, effective, setPreference]` followed by a trailing comma, which the first parser mishandled. Re-run after fixing; no other site was affected.

### E.2 Deps containing a value recreated every render — **0 sites** ✅

Every dependency array in scope contains only plain identifiers — no inline object literals, array literals, or arrow functions. VERIFIED across all 283 arrays.

The highest-risk indirect case was checked by hand: `screens/MyJobsHubScreen.tsx:195` `useMemo(() => Date.now(), [posted, working, pendingBids, settledBids, payments])`. All five deps come from `useState` in `hooks/useMyJobsHub.ts:28-32`, returned unwrapped at `:132-144`, so identities are stable and the `nowMs` → `lifecycleOf` → `workingItems` chain does **not** cascade. **VERIFIED.**

### E.3 `[]` deps closing over changing values — 47 sites, **3 genuine risks**

**41 are safe**: they close only over `useState` setters (stable by contract), `useRef` objects, or a local `let mounted`/`active` flag — the standard mount-once pattern.

**The 3 that actually close over changing values:**

**(a) `screens/PostJobScreen.tsx:310` — highest-value case.** Deps `[]`, body spans `:310-375`, closes over `isFreshPost`, `params`, `draftUserId` — none of which are refs. The author documents the intent at `:373-375` (*"Runs once on mount only — this is a one-time restore, not a sync"*) with an `eslint-disable-next-line`. **Correct as written for a mount-time restore**, but a real latent stale closure: if this screen is ever reached without remounting (a param-only navigation to an already-mounted `PostJob`), the draft restore reads the *previous* params. VERIFIED (code), INFERRED (reachability — not every navigation path was traced).

**(b) `screens/WorkerSearchScreen.tsx:193`** — deps `[]`, closes over `params` and `run`. `run` is a `useCallback` with deps `[user?.id]` (`:189`), so it **does** change identity on sign-in/out. Same documented mount-once intent. Arriving at an already-mounted `WorkerSearch` with new params runs nothing.

**(c) `screens/NotificationSettingsScreen.tsx:101`** — closes over the imported `registerPushToken` and `setPushState`. Module-level import, safe in practice; listed for completeness.

Two `useCallback`s pin identities but are ref-guarded and not defects: `hooks/useConversationChat.ts:55`, `components/ReviewSection.tsx:104`.

---

## F. Expensive computation in the render body

**F.1 — P2 — `screens/JobDetailScreen.tsx:196-204`.** Filter + sort + slice over the entire open-jobs feed, unmemoized, on every render:

```tsx
const similarJobs: OpenJob[] = openJobs
  .filter((j) => j.id !== job.id)
  .sort((a, b) => { … })
  .slice(0, 3);
```

O(n log n) plus two array allocations per render, where n is the **whole marketplace feed** (`useOpenJobs()` at `:195`). This screen holds ~8 pieces of local state, so it re-renders often. **Every sibling screen memoizes the equivalent** (`BrowseJobsScreen:120`, `WorkerHomeScreen:114`) — this one is the outlier.

**F.2 — P2 — `screens/ChatScreen.tsx:1038`.** See §B. O(rows × offers).

**F.3 — P2 — `screens/HomeScreen.tsx:683`.** `similarPostedToday(jobs, job)` is called **per rendered card**:

```tsx
similarToday={similarPostedToday(jobs, job)}
```

Each call (`:263-273`) constructs a `new Date()`, then filters the full `jobs` array constructing **another `new Date(other.created_at)` per element**. With `PREVIEW_COUNT = 4` that is 4 × n date parses per render, and ISO date parsing dominates the cost, not the filter.

**F.4 — P3 — `screens/MyJobsHubScreen.tsx:225-238`.** `bidItems` and `closedBidItems` do `.filter()` (plus an array spread) in the render body, while their two siblings `workingItems:213` and `postedItems:217` are correctly wrapped in `useMemo`. An internal inconsistency within one file. Each row then additionally calls `lifecycleOf(job)`, `releaseDeadlineMs(job)`, `metaLineFor(job)` and allocates an inline object for `myJobsNextAction({...})` (`:394-400`).

**F.5–F.6 — P3 (low).** `components/PortfolioPicker.tsx:124` builds a fresh `Set` per render (small n). `screens/ProfileScreen.tsx:429` and `screens/ProfileDetailsScreen.tsx:78` reduce over a small category-stats array.

**F.7 — checked and cleared ✅**
- `screens/ProfileScreen.tsx:342`'s double `JSON.stringify` is inside `async function handleCancel()`, **not the render path**.
- `screens/CellJobsScreen.tsx:37`'s unmemoized `useOfferCounts(jobs.map(...))` is harmless: `hooks/useOfferCounts.ts:21` defends itself with `const key = jobIds.join(',')` and depends on the **string**. Stylistic inconsistency only.
- `components/CategoryAccordion.tsx:21` and `ui/primitives/BottomNav.tsx:119` build their `Set`/`Map` at **module scope**.
- `screens/MessagesInboxScreen.tsx:140` and `screens/ChatScreen.tsx:429` are correctly inside `useMemo`.

---

## G. Context and re-render triggers

### G.1 Provider inventory — **all 6 memoized** ✅

| provider | memoized? | deps | consumers |
|-|-|-|-|
| `lib/ThemeContext.tsx:121` | ✅ `useMemo` `:103` | `[palette, emerald, isDark, effective, setPreference]` — all stable | **115 files / 134 sites** |
| `lib/AuthContext.tsx:152` | ✅ `useMemo` `:111` | `[session, loading, bannedNotice]` | **45 files / 46 sites** |
| `modes/ModeProvider.tsx:295` | ✅ `useMemo` `:283` | 7 stable values | 15 files / 16 sites |
| `components/ModeTransitionOverlay.tsx:130` | ✅ `useMemo` `:124` | `[start, request]` | 2 files |
| `modes/perspective.tsx:38` | ✅ scalar string | — | via `useModePerspective` |
| `App.tsx:122` | ✅ scalar boolean | — | 2 files |

**No unmemoized provider value exists in scope.** This is a genuine strength — the widest context (115 consumers) is the best-guarded one.

### G.2 P3 — `lib/homeDesignStudio.tsx:38` is a dead provider

`HomeDesignStudioProvider` is **never mounted** — a grep across the whole scope returns only its own definition at `:33`. Its consumer `useHomeDesignSettings()` (`:43`) is used at `screens/HomeScreen.tsx:294` and therefore always resolves to the module constant `DEFAULT_HOME_DESIGN_SETTINGS` (`:31`), which is stable.

Dead today — but note `value={settings}` is a bare prop passthrough, so **if it is ever mounted with an inline object it will re-render `HomeScreen` on every parent render.** `06_design_studio_readiness.md` §3 proposes mounting exactly this provider with live state, so this is a trap for that work specifically.

### G.3 🔴 P1 — memo boundaries: it is the absence, not a defeat

The requested check ("components taking inline object/array/function props where the child is `React.memo`'d") returns **nothing, because no component in the codebase is memoized.** Independently confirmed this run.

**The consequence, given G.1:** `ThemeContext` re-renders **115 files' worth of consumers** on any theme change, and each one's entire subtree with it, because there is no memo boundary to stop propagation. The same holds for `useAuth` (45 files) on every session/loading change.

**The highest-leverage single change in this domain** is `React.memo` on the ~8 hot row components — `WorkerJobCard`, `BrowseJobCard`, `HubCard`, `ConversationRow`, `WorkerResultCard`, `ChatBubble`, `OfferCard`, `ui/primitives/JobCard` — **but it requires stabilizing the inline `onPress` handlers from §B first, or the memo is inert.** Doing the memo without the handlers is worse than doing nothing: it adds a comparison cost that always fails. **INFERRED** (impact).

### G.4 The mitigating factor — `themedStyles` is properly cached ✅

```ts
// lib/theme.ts:462-473
export function themedStyles<P extends object, T>(factory: (colors: P) => T): (palette: P) => T {
  const cache = new WeakMap<P, T>();
  return (palette) => {
    const cached = cache.get(palette);
    if (cached) return cached;
    const built = factory(palette);
    cache.set(palette, built);
    return built;
  };
}
```

So the **197** `stylesFor(colors)` call sites do **not** re-run `StyleSheet.create` per render — one build per palette object, and palettes are module constants. **This is what keeps the missing-memo situation from being much worse**, and it is also the constraint `06_design_studio_readiness.md` §5 flags for any multiplicative token knob: a studio that generates palettes must key this cache on the generated object, not defeat it.

---

## H. `Animated` usage

**Library ban: ✅ clean.** No animation library on any of four surfaces (`11_dependencies.md` §E).

### H.1 🔴 P1 (policy) — hardcoded `useNativeDriver: true`, 11 sites

| file:line |
|-|
| `components/PhotoViewer.tsx:137, 138, 139, 167, 176, 178, 290` |
| `components/PulseDot.tsx:31, 37` |
| `screens/HomeScreen.tsx:334, 335` |

All animate `opacity`/`transform`, so the fix is mechanical: `true` → `Platform.OS !== 'web'`.

**Note the propagation mechanism.** `components/PulseDot.tsx:8-12` documents itself as an extraction of `HomeScreen`'s live-dot pattern — **and it copied the hardcode along with the values.** So the Live Nearby indicator is animated by two separate hardcoded-`true` sites, one in the screen and one in the component extracted from it.

### H.2 P2 — hardcoded `useNativeDriver: false` on an opacity animation, 2 sites

`screens/SetupScreen.tsx:127, 132`. The animated value drives **opacity only** — `:141` `const pulseStyle = { opacity: pulse };`, applied at `:210`. Opacity is fully native-driver-capable, so this is an unnecessary JS-thread animation. **The file already defines `const USE_NATIVE_DRIVER = Platform.OS !== 'web'` at `:28` and uses it correctly at `:91`** — these two simply missed it.

### H.3 Justified `useNativeDriver: false` — not defects ✅

`components/AuthField.tsx:52` and `components/PhoneNumberInput.tsx:81` both animate `borderColor` through `focus.interpolate(...)` returning color strings. **The native driver cannot animate colors**, so `false` is required.

### H.4 🟡 P3 — the root cause: the constant is duplicated 13 times

`const USE_NATIVE_DRIVER = Platform.OS !== 'web';` is redeclared independently in **13 files**: `AuthButton:13`, `CountryPicker:19`, `FadeIn:5`, `ModeTransitionOverlay:17`, `SetupChoiceCard:9`, `SetupRow:9`, `Skeleton:5`, `LaunchScreen:15`, `LegalGateScreen:38`, `PostJobScreen:81`, `SetupScreen:28`, `VerifyPhoneScreen:48`, `WelcomeScreen:26`. **There is no shared export.**

**The three files in H.1 are exactly the ones that never declared it. The duplication *is* the mechanism by which the policy drifted.** A single exported constant in `lib/theme.ts` (or a new `lib/motion.ts`) would make H.1 non-recurring rather than merely fixed — which is why the fix queue batches H.4 with H.1 rather than after it.

### H.5 A positive worth preserving ✅

`components/Skeleton.tsx:13-40` runs **one** module-level `Animated.loop`, ref-counted across all mounted skeletons (`mounted` counter at `:14`, `start()`/`stop()` at `:17`/`:37`) rather than one loop per placeholder. **The correct pattern.**

---

## I. One data-layer scale defect (P2)

`lib/jobs.ts:302-310` — `fetchOpenJobs()` has **no `.limit()`, no `.range()`, no pagination**. It fetches every open job in the marketplace on every Home mount, and `hooks/useOpenJobs.ts:57` subscribes to realtime INSERTs that prepend to the same unbounded array. Home then renders four cards from it.

Full analysis in `04_data_binding.md` §10 — it is filed there because the fix is a data-layer change, and repeated here because it is the input to F.1 and F.3.

---

## Recommended order of work

1. **H.4 + H.1 + H.2** — export one `USE_NATIVE_DRIVER`, fix 11 hardcoded `true` and 2 `SetupScreen` `false`. Mechanical, closes a stated invariant, and removes the mechanism that caused it.
2. **D.2 + D.3 + D.4** — delete 2.24 MB of orphans, dedupe the drape (0.47 MB), downscale `hero_toolbox_worker.png` and `app-icon-v2.png`. **~6–8 MB of 13.89 MB recoverable with no code change.**
3. **A.2** — convert `MyJobsHubScreen`'s four `.map()` sections to one sectioned `FlatList`.
4. **G.3 + B** — `React.memo` the 8 hot row components **and** stabilize their `onPress` props in the same change, or the memo is inert.
5. **F.1, F.2, F.3** — `useMemo` `similarJobs`; hoist `ChatScreen`'s `chain` into a `useMemo` map keyed by `root_offer_id`; compute `similarPostedToday` once per render rather than per card.
6. **A.1** — add `initialNumToRender`/`windowSize`/`removeClippedSubviews` to `ChatScreen`, `MessagesInboxScreen`, `ProfileReviewsScreen`.
7. **C.2** — set `resizeMode` on the 16 remote images, and give `Avatar` an `onError` fallback to its existing initials block.

---

## Coverage

**100%** of the scope.

Stated limits:
- **No runtime profiling.** Every cost claim is INFERRED from static reasoning. A profiler run on a device would rank §G.3 and §A.2 against each other; this audit cannot.
- **@3x sufficiency in §D.4 is a judgement**, not a measurement — the dimensions are VERIFIED, the "over by" factor assumes a 3× device pixel ratio and no zoom.
