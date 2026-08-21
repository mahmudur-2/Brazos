# 13 — Tests

---

## Summary

| Fact | Value |
|-|-|
| Test files | **56** (`tests/*.test.mjs`) |
| Total LOC | **18,516** — larger than `lib/` (13,409) or `components/` (13,097) |
| Tests declared | ~**700** `test()` calls; **799 executed** (subtests included) |
| Baseline | **789 pass / 10 fail / 0 skipped / exit 1** ([Finding #1](01_environment.md)) |
| Suites | 7 |
| Duration | 28.3 s |
| **Files that EXECUTE real product code** | **19 of 56 (34%)** |
| **Files that assert on source TEXT only** | **37 of 56 (66%)** |
| Test framework dependency | **none** — `node --test` only ✅ |

---

## 1. What `npm run verify` actually runs

```
npm run verify  →  npm run lint && npm test
npm run lint    →  tsc --noEmit --pretty false --noUnusedLocals --noUnusedParameters
npm test        →  node --test tests/*.test.mjs
```

`npm run typecheck` is the bare `tsc --noEmit --pretty false` — the same check without the two unused-symbol flags.

**Three consequences worth naming, all VERIFIED:**

1. **`supabase/functions` is excluded from type checking.** `tsconfig.json` lists it in `exclude`. So `supabase/functions/send-push/index.ts` and `supabase/functions/worker-search/index.ts` are **never type-checked by any gate** — including the file carrying the service-role fallback in `08_security_schema.md` §K.2.
2. **No SQL is executed, ever.** Every schema assertion in `tests/` reads migration files **as text** and pattern-matches them. That is correct for an offline gate, and it is exactly the boundary `08_security_schema.md` §J describes for `verify-schema.mjs`.
3. **No test framework, no mock library, no renderer.** `node --test` with `node:assert` only. No Jest, no `@testing-library/react-native`, no `react-test-renderer`. This is a deliberate, documented choice (`docs/architecture.md:34` — *"offline, no test-framework dependency"*) and it is the single most consequential fact about this suite. See §3.

---

## 2. Inventory — 56 files

| file | LOC | `test()` |
|-|-|-|
| `emeraldFences.test.mjs` | **1,768** | 21 |
| `workerMatching.test.mjs` | 992 | 31 |
| `phoneOtp.test.mjs` | 940 | 48 |
| `voiceSearch.test.mjs` | 913 | 39 |
| `themeResolution.test.mjs` | 743 | 15 |
| `conversion.test.mjs` | 656 | 27 |
| `crossTabNavigation.test.mjs` | 642 | 12 |
| `mode.test.mjs` | 555 | 30 |
| `setupOnboarding.test.mjs` | 553 | 44 |
| `workerHome.test.mjs` | 535 | 23 |
| `offerActionParity.test.mjs` | 522 | 21 |
| `safety.test.mjs` | 487 | 19 |
| `hardening.test.mjs` | 459 | 14 |
| `workerDiscovery.test.mjs` | 439 | 29 |
| `unifiedConversation.test.mjs` | 424 | 21 |
| `goldOnForest.test.mjs` | 421 | 9 |
| `layout.test.mjs` | 373 | 8 |
| `lifecycle.test.mjs` | 310 | 13 |
| `authPhone.test.mjs` | 305 | 17 |
| `legalGate.test.mjs` | 304 | 23 |
| `notificationFeed.test.mjs` | 297 | 8 |
| `messagingLock.test.mjs` | 294 | 10 |
| `counterResponse.test.mjs` | 256 | 7 |
| `governance.test.mjs` | 249 | 8 |
| `themeTokens.test.mjs` | 242 | 5 |
| `customerCore.test.mjs` | 235 | 8 |
| `offerCopyAndRouting.test.mjs` | 220 | 8 |
| `locationPrivacy.test.mjs` | 218 | 11 |
| `fundingPath.test.mjs` | 217 | 6 |
| `crossModeNotification.test.mjs` | 205 | 7 |
| `paymentsMode.test.mjs` | 195 | 10 |
| `sandboxCheckout.test.mjs` | 193 | 6 |
| `buildGate.test.mjs` | 192 | 14 |
| `stage4dInvariants.test.mjs` | 186 | 9 |
| `postJobDraft.test.mjs` | 185 | 5 |
| `accountDeletion.test.mjs` | 178 | 8 |
| `counterCap.test.mjs` | 172 | 5 |
| `moneyCeiling.test.mjs` | 171 | 7 |
| `discovery.test.mjs` | 164 | 7 |
| `workerHeroCard.test.mjs` | 155 | 11 |
| `selfService.test.mjs` | 152 | 8 |
| `offerComposer.test.mjs` | 137 | 6 |
| `offerScopedChat.test.mjs` | 136 | 6 |
| `envParity.test.mjs` | 132 | 6 |
| `potentialEarnings.test.mjs` | 124 | 5 |
| `errorMessage.test.mjs` | 121 | 4 |
| `marketplaceThreadIdentity.test.mjs` | 113 | 6 |
| `pwa.test.mjs` | 111 | 3 |
| `platformFee.test.mjs` | 109 | 5 |
| `verificationBadgeRemoved.test.mjs` | 104 | 4 |
| `myJobsRetab.test.mjs` | 102 | 5 |
| `projections.test.mjs` | 100 | 2 |
| `mediaUploader.test.mjs` | 78 | 3 |
| `earnings.test.mjs` | 76 | 3 |
| `homeDesignStudio.test.mjs` | 67 | 2 |
| `reviews.test.mjs` | 48 | 3 |

---

## 3. The defining structural fact: two-thirds of the suite tests **text**, not behaviour

**VERIFIED.** Zero test files use a static `import … from '../…'`. Real product code is reached in exactly one way — `stripTypeScriptTypes()` from `node:module`, then `await import(dataUrl)`:

```js
// tests/mode.test.mjs:30
} = await import(toDataUrl(stripTypeScriptTypes(read('modes/types.ts'), { mode: 'strip' })));
```

**19 of 56 files (34%) do this and therefore execute real code:** `accountDeletion` · `authPhone` · `conversion` · `crossModeNotification` · `discovery` · `earnings` · `errorMessage` · `lifecycle` · `locationPrivacy` · `mode` · `paymentsMode` · `phoneOtp` · `potentialEarnings` · `sandboxCheckout` · `setupOnboarding` · and four more.

**The other 37 (66%) read source files as strings and pattern-match them.** `tests/emeraldFences.test.mjs` — the largest file in the suite at 1,768 lines — has **69** `read(...)` calls and zero dynamic imports.

### What that buys, and what it costs

**What it buys** is real and should not be dismissed. There is no framework, no renderer, no mock layer, no version churn, and the whole suite runs offline in 28 seconds. It can assert things a renderer cannot easily reach — that a *migration file* contains a `revoke`, that a *screen source* holds no hardcoded hex, that a *navigator* registers a route exactly once. `03_navigation.md` §7.4's three-layer guard on the WorkerResults crash exists only because text assertions can see a navigator's shape.

**What it costs** is that a text assertion cannot fail for the reason you want it to:

| the test says | what it actually proves |
|-|-|
| `assert.match(jobsSource, /transitionJobStatusWithoutRpc\(\{ jobId, status, … \}\)/)` (`hardening.test.mjs:159`) | that string is in the file — **not that the fallback works, and not that it should exist**. It currently pins a live invariant violation in place (`02_invariants.md` §I-13) |
| `assert.match(code, /borderColor: colors\.homeSlate/)` (`emeraldFences.test.mjs:1021`) | that token name is written there — **not that the ring renders at that colour** |
| `assert.doesNotMatch(workerRoot, /name="BrowseJobs"/)` (`workerHome.test.mjs:305`) | the string is absent — a genuinely good use of the technique |

**Three second-order effects, all observed in this audit:**

1. **Renaming a symbol breaks unrelated tests.** `10_dead_code.md` §B2 lists 37 symbols exported *only* because a `.mjs` test greps the identifier — but the test would pass without the `export`, because it reads text. The `export` is cargo.
2. **Deleting dead code fails the suite.** `screens/BrowseJobsScreen.tsx` is imported by nothing, yet **ten test files read its source as text**, so removing it goes red until all ten are updated in the same commit.
3. **The suite cannot catch a runtime failure.** Every one of `04_data_binding.md`'s findings — the fail-open legal gate, the ten discarded errors, the missing `TrackWorkerScreen` states — is invisible to a text assertion. So is every finding in `12_performance.md`.

**This is not a recommendation to adopt a framework.** The offline-no-dependency property is a real asset and the operator chose it deliberately. It *is* a recommendation to know which third of the suite is load-bearing for correctness, and to stop treating a text match as evidence of behaviour.

---

## 4. What is well covered

Ranked by strength of guarantee.

### 4.1 Excellent — behavioural, executing real code

| surface | file | why it is strong |
|-|-|-|
| **Phone auth / OTP** | `phoneOtp.test.mjs` (940 LOC, 48 tests) + `authPhone.test.mjs` (305, 17) | executes the real provider, the real E.164 normaliser, the real error mapper. Covers transposition-tolerant typo handling, trunk prefixes, calling-code stacking, E.164 overflow |
| **Worker matching** | `workerMatching.test.mjs` (992, 31) | executes the deterministic matcher and free-text interpreter; asserts ambiguous keywords are priced down, filler is ignored, multi-word phrases outrank their parts, and — critically — that *"'best matches' is claimed only when server ranking actually ran"* |
| **Voice search** | `voiceSearch.test.mjs` (913, 39) | the guarded vendor `require` degradation path |
| **Setup / onboarding** | `setupOnboarding.test.mjs` (553, 44) | executes `lib/setupState.ts` |
| **Account deletion** | `accountDeletion.test.mjs` (178, 8) | executes the blocker list; asserts *"neither RPC wrapper passes a user id"* and *"a successful delete signs out locally and can never surface an error"* |
| **Lifecycle derivation** | `lifecycle.test.mjs` (310, 13) | executes `lib/jobLifecycle.ts` — the canonical derivation |
| **Payments mode** | `paymentsMode.test.mjs`, `sandboxCheckout.test.mjs`, `platformFee.test.mjs`, `moneyCeiling.test.mjs` | executes the resolver allow-list and the fee constant |

### 4.2 Strong — text assertions used well

These assert **structure**, which is what text is actually good for:

- **`crossTabNavigation.test.mjs`** (642, 12) — the WorkerResults gate. Walks every screen the customer tree mounts and asserts every literal cross-tab target either resolves in that tab's customer stack **or** sits behind a worker-mode gate (`:50-108`), plus both-directions mode-union checking (`:110-163`). This is the best-designed test in the suite.
- **`hardening.test.mjs`** (459, 14) — keeps `accept_bid` / `respond_job_request` revoked and callerless.
- **`themeResolution.test.mjs`** (743, 15) — the baked-asset roster, **re-deriving each claim from the actual PNG pixels in both directions** (`:563`, `:607`). Not a text assertion at all — it reads image bytes. It is currently red, and it is red for a **correct** reason (`02_invariants.md` §I-9).
- **`safety.test.mjs`**, **`governance.test.mjs`**, **`stage4dInvariants.test.mjs`** — copy-ban and invariant sweeps, including the escrow ban.
- **`envParity.test.mjs`**, **`buildGate.test.mjs`**, **`pwa.test.mjs`** — config guards; `pwa.test.mjs:45,98` keeps `maplibre-gl` out of both the built HTML and `package.json`.

### 4.3 The geometry fences — a category of their own

`emeraldFences.test.mjs` (1,768), `goldOnForest.test.mjs` (421), `layout.test.mjs` (373), `themeTokens.test.mjs` (242), `homeDesignStudio.test.mjs` (67) — roughly **2,871 LOC, 15.5% of the suite**, asserting pixel geometry against the masters.

**These are the source of 8 of the 10 baseline failures**, and they are working correctly: the operator moved dial values and the fences noticed. Note the discipline behind them, from the `home(26)` commit message: *"NEW FENCE (H26), mutated two ways and observed red… every one of those was mutated red too."* **Every fence was mutation-tested before being kept.** That is a higher bar than most projects apply to any test.

---

## 5. 🔴 Highest-risk surfaces with NO coverage, ranked

Ranked by (blast radius × likelihood of silent failure).

### 1. **RLS, grants, and RLS-enablement — `public.payments` above all**

**No test, and no harness, asserts that RLS is enabled on any table.** `08_security_schema.md` §J.8 establishes that `verify-schema.mjs` never reads `relrowsecurity` and never enumerates `pg_policies`; `tests/` never executes SQL at all.

**S-1** (the money ledger's RLS switch and its only SELECT policy both live outside version control) is therefore invisible to **every** gate this project has. If it were ever off, nothing would say so.

**Why no test exists:** it genuinely cannot, offline. A text assertion can prove a migration *contains* `enable row level security`; it cannot prove the database *has* it. **The honest fix is not a test — it is a self-check inside the next migration**, the pattern phase64/68/73/75 already use and that `08_security_schema.md` credits with catching the 16-function drift.

### 2. **Status-literal drift — no compile check, no schema check, no test**

CLAUDE.md states the hazard: *"A status literal absent from the database enum fails at runtime, never at build time."* Three independent gaps compound:

- no generated database types (`04_data_binding.md` §8 — **20 hand-written `as { … }` row shapes**)
- `verify-schema.mjs` never reads enum values or column types
- no test compares `lib/jobLifecycle.ts`'s vocabulary against the migrations' `job_status` enum

**And `10_dead_code.md` §C2 shows there are five status vocabularies to keep in sync.** A `payment_status` value the database emits but `lib/payments.ts:226`'s union does not name becomes a `PaymentStatus` **by assertion**, then flows into money labels.

**A test IS possible here and would be high-value:** parse the enum out of the migration text, parse the union out of the TS, assert set equality. Offline, no database, ~40 lines. **This is the single best test this project does not have.**

### 3. **Every runtime data-binding failure**

None of `04_data_binding.md`'s findings can be caught by the current suite:
- `hooks/useLegalGate.ts:29-32` — the legal gate fails **open**
- the 10 `if (!error)` guards that discard errors, including two dispute reads feeding lifecycle derivation
- `TrackWorkerScreen`'s missing loading and error states
- `components/Avatar.tsx:21`'s missing `onError`

`useLegalGate` is a pure function of `fetchLegalStatus`'s result and **could** be tested by the existing `stripTypeScriptTypes` + injected-dependency pattern. `legalGate.test.mjs` exists (304 LOC, 23 tests) but asserts the *screen's* text, not the *hook's* fail-open branch.

### 4. **Rendering — nothing renders, anywhere**

No renderer means: no test can catch a crash on mount, a null-deref in a render path, a `<Text>`-outside-`<Text>` error, or an unhandled promise in an effect. **This is the gap the "rendered code frame" investigation (`07_ui_fidelity_inventory.md` §5) ran into** — the defect could be reasoned about mechanically but never reproduced, because nothing in the repo can mount a screen.

`scripts/home-shots.mjs` is the closest thing — it renders the real tree through a web export and takes screenshots — but CLAUDE.md is explicit that it *"is a comparison aid for `docs/mockups/`, not a check `npm run verify` runs."*

### 5. **Edge functions — excluded from `tsc` and untested**

`supabase/functions/send-push/index.ts` and `worker-search/index.ts` are in `tsconfig.json`'s `exclude` and have no test. `08_security_schema.md` §K.2's service-role fallback (`worker-search/index.ts:153`) sits in code **no gate reads**.

### 6. **Performance**

Nothing in `12_performance.md` is testable by this suite. The zero-`React.memo` finding, the unbounded `MyJobsHubScreen` lists, the O(rows × offers) filter — all invisible. Asset weight is the exception: `themeResolution.test.mjs` already reads PNG bytes, so **an asset-budget assertion would fit the existing pattern exactly** (e.g. "no file under `assets/` exceeds N bytes", "every file under `assets/` is referenced by source or config"). That would have caught all 2.24 MB of orphans.

### 7. **Deep linking and `expo-linking`**

`11_dependencies.md` §C flags `expo-linking` as declared-but-unreferenced. No test covers deep-link routing, and `App.tsx:170-176` mounts `NavigationContainer` with no `linking` prop — so nothing would notice if scheme handling broke.

---

## 6. Two structural observations about the suite itself

### 6.1 A test currently pins an invariant violation in place

`tests/hardening.test.mjs:156-159` asserts that `lib/jobs.ts` **contains** the `PGRST202` fallback to the client-side status writer:

```js
assert.match(jobsSource, /error\?\.code === 'PGRST202'/);
assert.match(jobsSource, /transitionJobStatusWithoutRpc\(\{ jobId, status, photoUrls, videoUrls \}\)/);
```

CLAUDE.md says *"Never set `assigned_worker_id` or `status` from the client."* **The test and the invariant contradict each other**, and an agent that removes the violation goes red. `08_security_schema.md` §B.3 confirms the path is dead against the current schema (no UPDATE policy, no UPDATE grant), so the correct move is to **invert the assertion** — assert the fallback does *not* exist — in the same commit that deletes it.

**This is the only place found where a test actively defends something the policy forbids.** Worth stating precisely because everywhere else the tests defend the policy well.

### 6.2 A stale allowlist protects a dead file

`tests/errorMessage.test.mjs:69` carries `'hooks/useChat.ts', // LOCKED hook — wrapped at the ChatScreen render seam`, and `:107-114` asserts the wrap. `hooks/useChat.ts` has **zero importers** (`10_dead_code.md` §A3); the guarantee is now about `useConversationChat`.

---

## 7. Coverage of this domain

**100%** — all 56 test files inventoried by LOC, test count, and execution mode.

Stated limits:
- **`test()` counts are lexical**, so the ~700 declared calls under-count the 799 executed (subtests inside a `test()` body are not counted).
- **No line/branch coverage was measured.** `node --test --experimental-test-coverage` exists but was not run: it is not what `npm run verify` runs, and running it would change nothing about the findings — the gaps in §5 are *structural absences*, not thin coverage of code that is otherwise exercised.
