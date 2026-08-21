# 03 — Navigation

**Method:** the full route registry and call graph were built mechanically by a throwaway analyzer (`.audit-scratch/navgraph.mjs`, never committed) over `screens/ components/ ui/ lib/ hooks/ navigation/ modes/`, then every non-trivial result was confirmed by reading the source. Conclusions are **VERIFIED** or **INFERRED**.

---

## Summary

| Check | Result |
|-|-|
| Distinct registered route names | **56** |
| Total `Screen` registrations | 89 |
| Navigation call sites found | **107** |
| **Targets not registered anywhere** | **0** ✅ |
| Duplicate route names (same name, several navigators) | 13 — **all deliberate** |
| Registered but never a `navigate()` target | 14 — **all reachable by other means** ✅ |
| WorkerResults crash | **VERIFIED cause; already fixed and gated** |
| Customer / Worker tab compositions identical? | **NO — 7 vs 5 registrations, 5 vs 5 visible, and different tabs** |
| Type-cast escape hatches on navigation | **4** — P2 finding |

---

## 1. The registered route graph

### 1.1 Navigators

| Navigator | File | Screens | Mounted in |
|-|-|-|-|
| `Tab` (customer) | `navigation/CustomerRoot.tsx:162-199` | 7 | customer tree root |
| `Tab` (worker) | `navigation/WorkerRoot.tsx:80-92` | 5 | worker tree root |
| `CustomerHomeStack` | `navigation/CustomerRoot.tsx:104-108` | 5 | customer `Home` tab |
| `DiscoverStack` | `navigation/CustomerRoot.tsx:122-129` | 4 | customer `Discover` tab |
| `WorkerHomeStack` | `navigation/WorkerRoot.tsx:53-69` | 9 | worker `Home` tab |
| `MyJobsStack` | `navigation/sharedStacks.tsx:78-99` | 18 | **both** trees' `MyJobs` tab |
| `MessagesStack` | `navigation/sharedStacks.tsx:110-114` | 5 | **both** trees' `Messages` tab |
| `MapStack` | `navigation/sharedStacks.tsx:122-131` | 9 | **both** trees' `Map` tab |
| `ProfileStack` | `navigation/sharedStacks.tsx:139-170` | 17 | **both** trees' `Profile` tab |
| `Stack` (auth) | `screens/AuthFlow.tsx:29-37` | 6 | pre-session |
| `Stack` (onboarding) | `screens/OnboardingFlow.tsx:44-49` | 2 | post-session, pre-shell |

### 1.2 Every registered route name

`AccountSafety` · `AdminReports` · `Appearance` · `ApproveOrDispute` · `BidDetail` · `BidSent` · `CellJobs` · `Chat` · `Checkout` · `ClientJobDetail` · `CompareBids` · `ComponentCatalog` · `Counteroffer` · `Create` · `CreateAccount` · `DeleteAccount` · `Discover` · `Earnings` · `EmailCreateAccount` · `EmailSignIn` · `Home` · `HomeMain` · `JobConfirmed` · `JobDetail` · `LegalDocument` · `LegalGate` · `Map` · `MapMain` · `Messages` · `MessagesInbox` · `MyJobs` · `MyJobsHub` · `NotificationSettings` · `Notifications` · `PaymentMethods` · `PostJob` · `Profile` · `ProfileDetails` · `ProfileMain` · `ProfileReviews` · `ReviewAndTip` · `RouteArrival` · `SavedWorkers` · `ServicesPricing` · `Setup` · `SignIn` · `SubmitBid` · `TrackWorker` · `VerifyPhone` · `Welcome` · `WorkChecklist` · `WorkerHome` · `WorkerJob` · `WorkerProfile` · `WorkerResults` · `WorkerSearch`

---

## 2. Targets that are not registered anywhere

**NONE. (VERIFIED.)**

Every one of the 107 navigation call sites resolves to a route name that is registered in at least one navigator. This is the single most important result in this domain and it is clean.

---

## 3. Duplicate route names

13 names are registered in more than one navigator. **Every one is deliberate, and the codebase states the rule.**

| Route | Registrations | Rationale |
|-|-|-|
| `PostJob` | **7** — every stack | `lib/navigation.ts:210-215`: *"PostJob has been registered in all four shared tabs since Phase 5–9: it is a shared surface… the standing every-stack-that-surfaces-a-user rule applies here as everywhere."* |
| `WorkerProfile` | **7** — every stack | same rule |
| `ProfileReviews` | **7** — every stack | same rule |
| `Chat` | 4 — WorkerHome, MyJobs, Messages, Map | `lib/navigation.ts:196-198`: *"Registered alongside JobDetail in every stack that mounts it (the SubmitBid rule)"* |
| `JobDetail` | 3 — WorkerHome, MyJobs, Map | the SubmitBid rule |
| `SubmitBid` | 3 — WorkerHome, MyJobs, Map | `lib/navigation.ts:199-200` |
| `BidSent` | 3 — WorkerHome, MyJobs, Map | `lib/navigation.ts:202-203` |
| `WorkerSearch` | 2 — CustomerHome, Discover | customer-only, two entry points |
| `Home` / `Map` / `Messages` / `MyJobs` / `Profile` | 2 each — one per tree | by design: two trees |

**This is not a defect.** React Navigation resolves a bare `navigate('X')` within the *current* stack, so registering `PostJob` in all seven stacks is precisely what makes a bare dispatch safe from any screen. `lib/navigation.ts:204-214` records the incident that produced the rule — the worker Home stack was *"the ONLY stack of the six not registering it, so those taps threw `NAVIGATE 'PostJob' was not handled by any navigator`."*

**One consequence worth stating (INFERRED):** because these names are registered many times, a rename must be applied in all N places at once, and the four type casts in §6 mean tsc will not catch a partial rename on those paths.

---

## 4. Registered but never a `navigate()` target

14 routes never appear as a literal `navigate()` argument. **All 14 are reachable. None is dead. (VERIFIED.)**

| Route | How it is actually entered |
|-|-|
| `HomeMain`, `MapMain`, `MessagesInbox`, `MyJobsHub`, `ProfileMain`, `WorkerHome`, `Welcome`, `Setup` | **stack roots** — entered by mounting, not dispatch |
| `Map`, `Messages`, `MyJobs` | **tab names** — entered by tab press or as the first argument to `navigateAcrossTabs` |
| `Create` | **never navigated by design.** `navigation/CustomerRoot.tsx:135-141`: *"Never rendered in practice: the slot's `tabBarButton` opens the creation sheet instead of navigating."* Its component is `CreateActionScreen()` → `return null` |
| `SubmitBid` | dispatched via a **type cast** at `screens/JobDetailScreen.tsx:920-922` — see §6 |
| `BidSent` | dispatched via a **type cast** at `screens/SubmitBidScreen.tsx:82-91` — see §6 |
| `Notifications`, `NotificationSettings` | dispatched **dynamically** from a data-driven row list: `screens/ProfileScreen.tsx:74` types `route:`, `:751` calls `navigate(item.route)` |

The analyzer's `(dynamic)` bucket (11 sites) is `goBack` / `popToTop` / `pop` and the `ProfileScreen` row dispatch. No dynamic target is unaccounted for.

---

## 5. Parameter contracts

### 5.1 `WorkerResults` — complete and machine-enforced ✅ (VERIFIED)

Declared at `lib/navigation.ts:237-249`:

```ts
WorkerResults: {
  mode: 'all' | 'skills' | 'nearby' | 'search';
  query?: string;
  lat?: number;
  lng?: number;
  label?: string;
};
```

All four modes are dispatched, and every dispatched mode is declared:

| mode | live dispatch sites |
|-|-|
| `all` | `screens/WorkerHomeScreen.tsx:467`; `screens/MapScreen.tsx:237`, `:335` (both `navigateAcrossTabs`) |
| `skills` | `screens/WorkerHomeScreen.tsx:411` |
| `search` | `screens/WorkerHomeScreen.tsx:187` |
| `nearby` | `screens/WorkerHomeScreen.tsx:432-437` (passes `lat`/`lng`/`label`) |

Four further dispatch sites live in `screens/BrowseJobsScreen.tsx` (`:189`, `:193`, `:334`, `:371`) — **that screen is dead** (`10_dead_code.md` §A1), so they are not live paths.

This contract is enforced by tests, not just by types. `tests/crossTabNavigation.test.mjs:110-163` parses the declared mode union out of `lib/navigation.ts`, parses `MODE_TITLES` out of `screens/WorkerResultsScreen.tsx:45`, and asserts **both directions**: no caller dispatches an undeclared mode (`:156`), and no declared mode lacks a caller (`:162`). Passing at baseline.

### 5.2 Params read but not passed / passed but not read

**No mismatch found that TypeScript does not already prevent.** Because every stack param list is a strict object type and `npm run lint` is green with `strict: true`, a missing required param or an unknown extra key is a compile error on the 103 statically-typed call sites.

**The four cast sites in §6 are the exception** — they are outside that guarantee. For each, the passed keys were checked by hand against the declared param list:

| cast site | passes | declared | match |
|-|-|-|-|
| `screens/JobDetailScreen.tsx:922` → `SubmitBid` | `{ job }` | `{ job: OpenJob }` | ✅ |
| `screens/JobDetailScreen.tsx:942` → `JobDetail` | `{ job: sj }` | `{ job: OpenJob }` | ✅ |
| `screens/SubmitBidScreen.tsx:87-91` → `BidSent` | `{ jobTitle, amountCents, offerId }` | `{ jobTitle: string; amountCents: number; offerId: string }` | ✅ |
| `screens/ChatScreen.tsx:929-941` → `PostJob` | `{ hireWorkerId, hireWorkerName, threadJobId }` | all optional on `PostJob` | ✅ |

All four are **currently correct**. The finding is that nothing keeps them correct.

---

## 6. Type-cast escape hatches — **P2 (VERIFIED)**

Four navigation dispatches bypass the param-list type entirely with `as unknown as { … }`:

```tsx
// screens/JobDetailScreen.tsx:920-922
(navigation as unknown as {
  navigate: (screen: 'SubmitBid', params: { job: OpenJob }) => void;
}).navigate('SubmitBid', { job })
```

| file:line | target | cast param type |
|-|-|-|
| `screens/JobDetailScreen.tsx:920` | `SubmitBid` | `{ job: OpenJob }` |
| `screens/JobDetailScreen.tsx:940` | `JobDetail` | `{ job: OpenJob }` |
| `screens/SubmitBidScreen.tsx:82` | `BidSent` | `{ jobTitle; amountCents; offerId }` |
| `screens/ChatScreen.tsx:929` | `PostJob` | **`params: object`** — fully untyped |

**Why they exist (INFERRED, well-supported).** `JobDetail`, `SubmitBid`, `BidSent` and `Chat` are each registered in three or four different stacks (§3). A screen mounted in three stacks cannot name one param list for its own `navigation` object, so the author asserted the shape locally instead. The reasoning is the same one `lib/navigationRef.ts:110-112` states for the cross-tab case: *"tsc cannot catch that: a shared screen types its own stack, and the tab-level jump is an untyped cast by construction."*

**Why it is still a finding.** `screens/ChatScreen.tsx:929` casts params to bare `object`, so **any** object satisfies it — a typo in `hireWorkerId` compiles and fails silently at runtime by simply not prefilling the hire. The other three assert the correct shape today, but nothing links the assertion to `lib/navigation.ts`; if a param list changes, these four keep compiling against the stale shape.

**Recommendation, not applied.** Give the multi-stack screens a union navigation type — e.g. `type JobDetailNavigation = NativeStackNavigationProp<WorkerHomeStackParamList | MyJobsStackParamList | MapStackParamList>` — or narrow `ChatScreen`'s cast to the real `PostJob` param type at minimum. Owner class STRUCTURE. `screens/ChatScreen.tsx:929` is the one worth doing first; it is a one-line change from `object` to the declared union.

**Correction to `02_invariants.md` §I-28, for completeness:** that section reported zero `as any` and zero `@ts-ignore` on navigation calls, which remains accurate. These four use `as unknown as`, a different spelling of the same bypass. The invariant "cross-tree navigation must be a compile error" still holds — none of these four crosses a *tree*; all four target a route registered in the caller's own stack.

---

## 7. The WorkerResults crash — **VERIFIED cause. Already fixed. Gated.**

### 7.1 The failure

The reported symptom, quoted from the code that fixes it (`screens/MapScreen.tsx:217-221`):

```
"The 'state' or 'screen' passed in the params couldn't be applied to the
 navigator with the screens: HomeMain, PostJob, WorkerSearch, WorkerProfile,
 ProfileReviews"
```

and from the test that guards it (`tests/crossTabNavigation.test.mjs:16-17`):

```
The device report was "NAVIGATE {name:'WorkerResults'} ... do you have a
screen named 'WorkerResults'?"
```

### 7.2 The mechanism (VERIFIED, three-step)

1. **`WorkerResults` is registered in exactly one place** — `navigation/WorkerRoot.tsx:54`, inside `WorkerHomeStack`. Confirmed by the analyzer (`WorkerResults [1x]`) and independently asserted by `tests/crossTabNavigation.test.mjs:36-46`, which requires *exactly one* registration and forbids an alias route.

2. **`MapScreen` dispatches it across tabs** — `screens/MapScreen.tsx:237` and `:335`, both `navigateAcrossTabs('Home', 'WorkerResults', { mode: 'all' })`.

3. **`MapScreen` is mounted in BOTH trees.** `MapStack` is registered at `navigation/CustomerRoot.tsx:189` *and* `navigation/WorkerRoot.tsx:81`. So in **customer** mode, `'Home'` resolves to `CustomerHomeStackNavigator`, whose five routes are exactly the five the error message lists — `HomeMain, PostJob, WorkerSearch, WorkerProfile, ProfileReviews`. `WorkerResults` is not among them, and React Navigation throws.

The root cause is therefore: **a worker-only destination dispatched from a screen that renders in both modes.** Not a missing registration, not a misspelled route, not a params problem.

### 7.3 The fix, as it stands in this checkout (VERIFIED)

Both dispatch sites are now **mode-gated**, and the control is removed rather than disabled:

```tsx
// screens/MapScreen.tsx:235-246 — header control
right={
  mode === 'worker' ? (
    <Pressable onPress={() => navigateAcrossTabs('Home', 'WorkerResults', { mode: 'all' })} …>
```

```tsx
// screens/MapScreen.tsx:333-335 — footer card control
{isWorker ? (
  <Pressable onPress={() => navigateAcrossTabs('Home', 'WorkerResults', { mode: 'all' })} …>
```

The rationale is recorded in place at `screens/MapScreen.tsx:216-227`, including the design judgement — *"Absent beats disabled beats a redirect somewhere else: there is no customer equivalent of 'all open jobs' to send them to"* — and the note that perspective is *"read from ModeContext, never a passed prop"* (consistent with invariant I-5).

### 7.4 Defence in depth — three independent layers (VERIFIED)

1. **Runtime choke point.** Every cross-tab jump goes through `navigateAcrossTabs` (`lib/navigationRef.ts:117`), which calls `canNavigateTo(tab, screen)` and *"asks the LIVE navigator, which is the observable form of ModeContext's decision, so it can never drift from the mode that is actually mounted"* (`:113-115`). Even without the mode gate, the dispatch would be dropped rather than thrown.
2. **Static test gate.** `tests/crossTabNavigation.test.mjs:50-108` — *"a screen may dispatch WorkerResults only if it is unmounted, or if every stack that mounts it also registers WorkerResults."* Plus `:630-640`, which specifically checks the `MapScreen` calls against the customer Home stack.
3. **Uniqueness gate.** `:36-46` forbids a second registration or alias.

All of these pass in the baseline run.

### 7.5 Verdict

**VERIFIED: fixed.** No second plausible cause remains — the error message names the exact five-route stack, that stack is `CustomerHomeStackNavigator`, and the only dispatcher reachable in customer mode is `MapScreen`, now gated at both sites.

**One residual risk, INFERRED and worth an operator note.** `lib/navigationRef.ts:82-86` documents that `fallbackToTabRoot` is deliberately *not* used for notification routing: *"landing a tapped alert on an unrelated screen is worse than doing nothing."* That is the right call, but it means a push notification routed to a worker-mode destination while the user is in customer mode **silently does nothing**. The user taps a notification and the app does not move. That is a UX defect rather than a crash, and it is separately visible in `10_dead_code.md` §F as `lib/notificationRoutes.ts:222` — a `console.warn` that is the only handling for an unroutable notification. Carried to `14_FIX_QUEUE.md`.

---

## 8. Actual tab composition — **`docs/architecture.md`'s claim is wrong**

The audit prompt suspected `architecture.md` wrongly claims the two trees are identical five-tab compositions. **They are not identical.** (VERIFIED.)

### 8.1 Customer tree — 7 registrations, 5 visible

`navigation/CustomerRoot.tsx:162-199`:

| # | Route | Component | Visible in the bar? |
|-|-|-|-|
| 1 | `Home` | `CustomerHomeStackNavigator` | ✅ |
| 2 | `Discover` | `DiscoverStackNavigator` (label "Discover") | ✅ |
| 3 | `Create` | `CreateActionScreen` (returns `null`) | ✅ **as a button, not a destination** — `tabBarButton: () => <CenterCreateButton onPress={…}/>` |
| 4 | `Messages` | `MessagesStackNavigator` | ✅ |
| 5 | `Profile` | `ProfileStackNavigator` | ✅ |
| 6 | `Map` | `MapStackNavigator` | ❌ `HIDDEN_TAB_ITEM_OPTIONS` |
| 7 | `MyJobs` | `MyJobsStackNavigator` | ❌ `HIDDEN_TAB_ITEM_OPTIONS` |

The comment at `:186-188` states the intent: *"Hidden routes — dispatchable, absent from the bar. D1 took their bar items, not their reachability."*

### 8.2 Worker tree — 5 registrations, 5 visible

`navigation/WorkerRoot.tsx:80-92`:

| # | Route | Component | Visible? |
|-|-|-|-|
| 1 | `Home` | `WorkerHomeStackNavigator` | ✅ |
| 2 | `Map` | `MapStackNavigator` (label "Map") | ✅ |
| 3 | `MyJobs` | `MyJobsStackNavigator` | ✅ |
| 4 | `Messages` | `MessagesStackNavigator` | ✅ |
| 5 | `Profile` | `ProfileStackNavigator` | ✅ |

### 8.3 The differences, stated plainly

| | Customer | Worker |
|-|-|-|
| `Tab.Screen` registrations | **7** | **5** |
| Items drawn in the bar | 5 | 5 |
| `Discover` tab | ✅ visible | ❌ **does not exist** |
| `Create` [ + ] button | ✅ visible (opens a sheet) | ❌ **does not exist** |
| `Map` tab | registered, **hidden** | ✅ visible |
| `MyJobs` tab | registered, **hidden** | ✅ visible |
| `Home` stack contents | 5 routes (`HomeMain`, `PostJob`, `WorkerSearch`, `WorkerProfile`, `ProfileReviews`) | 9 routes (`WorkerHome`, `WorkerResults`, `JobDetail`, `SubmitBid`, `BidSent`, `Chat`, `PostJob`, `WorkerProfile`, `ProfileReviews`) |

**Both bars draw five items, and that is presumably where the "identical five-tab" claim came from — but only three of the five are the same tab.** Customer draws Home · Discover · [+] · Messages · Profile; worker draws Home · Map · MyJobs · Messages · Profile. `Discover` and `Create` exist in one tree only; `Map` and `MyJobs` are visible in one and hidden in the other.

The **worker tree has no `Discover`**, so the customer-only `WorkerSearch` stack has no worker counterpart. And the **customer tree has no `WorkerResults`**, which is precisely the fact §7 turns on. Any document claiming the two trees are identical is not just imprecise — it describes away the cause of a shipped crash.

**Cross-reference to `09_docs_drift.md`:** confirmed, `docs/architecture.md`'s tab-composition claim contradicts the code. The code wins (CLAUDE.md's own rule). Exact corrected text is proposed there.

---

## 9. Coverage

**100%.** Every navigator, every registration, and all 107 call sites were enumerated and classified. The only category answered by reasoning rather than enumeration is §5.2's params check on the 103 type-safe sites, where a green `tsc --strict` is the evidence.
