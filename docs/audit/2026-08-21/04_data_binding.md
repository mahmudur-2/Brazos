# 04 — Data binding

**Scope:** all 52 screens plus the components and hooks that feed them.
**Method:** a throwaway analyzer (`.audit-scratch/states.mjs`, never committed) classified each screen, then every non-trivial result was confirmed by reading the source. Where the analyzer over-reported, that is stated and the false positives are named.

---

## Summary

| Check | Result |
|-|-|
| Screens that consume data | 45 of 52 |
| Screens configuring a shared template's `state` prop | 16 |
| **Screens missing a genuine state** | **1 confirmed (`TrackWorkerScreen`), 3 partial** |
| **Errors silently discarded by an `if (!error)` guard** | **10 sites — P2** |
| Error paths where `console.*` is the only handling | **35 sites** (enumerated in `10_dead_code.md` §F) |
| Empty `catch {}` blocks | 34 (mostly justified) |
| Hand-written DB row shapes with no compile-time schema check | **20 `as { … }` casts** |
| Unguarded property access on possibly-undefined data | **0 real** (1 candidate checked and cleared) |
| Mock/placeholder data surviving into a render path | **0** ✅ |
| Failed fetch rendering as if it were real data | **4 confirmed paths — P2/P1** |

---

## 1. The template system works, and 16 screens use it properly ✅

`ui/templates/ScreenStates.tsx:22-53` defines a six-variant discriminated union — `ready`, `loading` (skeleton or spinner), `empty`, `error`, `offline`, `permissionDenied` — and the templates render it instead of their body whenever `state.kind !== 'ready'`. The design intent is stated at `:14-17`:

> *"The point of centralising these is that a screen author cannot forget one. A template takes a single `state` prop… Screens configure the copy, they do not reimplement the state."*

Every variant ships usable default copy (`:79-104`), so a screen passing `{ kind: 'error' }` and nothing else still gets an honest surface rather than a blank frame.

**Which state kinds each template-consuming screen actually configures (VERIFIED):**

| Screen | loading | empty | error | permissionDenied |
|-|-|-|-|-|
| `ApproveOrDisputeScreen` | ✅ | ✅ | ✅ | ✅ |
| `CheckoutScreen` | ✅ | ✅ | ✅ | ✅ |
| `NotificationsScreen` | ✅ | ✅ | ✅ | ✅ |
| `ReviewAndTipScreen` | ✅ | ✅ | ✅ | ✅ |
| `RouteArrivalScreen` | ✅ | ✅ | ✅ | ✅ |
| `SavedWorkersScreen` | ✅ | ✅ | ✅ | ✅ |
| `WorkChecklistScreen` | ✅ | ✅ | ✅ | ✅ |
| `BidDetailScreen` | ✅ | ✅ | ✅ | — |
| `CompareBidsScreen` | ✅ | ✅ | ✅ | — |
| `JobConfirmedScreen` | ✅ | ✅ | ✅ | — |
| `EarningsScreen` | ✅ | — | ✅ | ✅ |
| `ServicesPricingScreen` | ✅ | — | ✅ | ✅ |
| `DeleteAccountScreen` | ✅ | — | ✅ | — |
| **`TrackWorkerScreen`** | **❌** | ✅ | **❌** | ✅ |
| `PaymentMethodsScreen` | n/a — `state={{ kind: 'ready' }}`, static content | | | |

**Correction to the first-pass scan:** the analyzer initially flagged 12 template screens as "missing loading". That was wrong — those screens supply loading through the `state` prop rather than an inline `ActivityIndicator`, which the heuristic did not model. Only `TrackWorkerScreen` is genuinely missing states.

---

## 2. `TrackWorkerScreen` — the one screen missing states (P2, VERIFIED)

`screens/TrackWorkerScreen.tsx:95-117` derives its `ScreenState` through a four-branch ternary:

```ts
const state: ScreenState = missing
  ? { kind: 'empty', title: 'This job is no longer available', … }
  : !isOwner
    ? { kind: 'permissionDenied', title: 'Only the job's owner can track it here', … }
    : currentIndex < 0
      ? { kind: 'empty', title: 'No worker to track yet', … }
      : { kind: 'ready' };
```

**There is no `loading` branch and no `error` branch.** The screen fetches three things at focus (`:64-89`) — payment state, dispute state, and the assigned worker's name — and renders `ready` from the first frame, before any of them have resolved.

The observable result: the tracking stepper paints immediately with `payment = null`, `hasOpenDispute = false`, `workerName = null`, then reflows as each fetch lands. There is no point at which the user is told data is still arriving, and no point at which they are told it failed. This screen is the customer's live view of a job in progress, which makes an unannounced wrong-then-right transition worse here than on a static surface.

It already imports the state machinery and configures three of the six variants, so the fix is to add two more branches. Owner class STRUCTURE.

---

## 3. Silently discarded errors — 10 sites (P2, VERIFIED)

The pattern is `if (active && !error) setX(data)`: on failure the error is neither surfaced, logged, nor recorded — the setter simply does not run, and the component keeps its initial state.

| file:line | fetch | what the user sees on failure |
|-|-|-|
| `screens/TrackWorkerScreen.tsx:67` | `fetchJobPaymentState` | payment stays `null` — "no payment" |
| **`screens/TrackWorkerScreen.tsx:70`** | **`fetchOpenJobDispute`** | **`hasOpenDispute` stays `false` — "no dispute"** |
| `screens/ClientJobDetailScreen.tsx:223` | `fetchJobPaymentState` | payment stays `null` |
| **`screens/ClientJobDetailScreen.tsx:226`** | **`fetchOpenJobDispute`** | **`openDispute` stays `null` — "no dispute"** |
| `screens/ClientJobDetailScreen.tsx:245` | `fetchJobLocation` | address stays `null` — "no exact address" |
| `screens/JobDetailScreen.tsx:334` | `fetchProfileById` (poster) | poster stays `null` |
| `screens/JobDetailScreen.tsx:339` | poster stats | stats stay `null` |
| `screens/ProfileDetailsScreen.tsx:71` | `jobStats` | stats stay `null` |
| `hooks/useJobOwnerActions.ts:61` | bid count | falls back to `0` — "no bids" |
| `components/ReviewSection.tsx:244` | review submit | success branch simply skipped |

**The two dispute reads are the serious ones.** Both `TrackWorkerScreen` and `ClientJobDetailScreen` feed the result straight into lifecycle derivation:

```ts
// screens/TrackWorkerScreen.tsx:92
const lifecycle = deriveJobLifecycle({ job, payment, hasOpenDispute });
```

A failed dispute read is therefore indistinguishable from *"there is no dispute"*, and the customer is shown a normal, non-disputed job progressing toward auto-release. That is a money-adjacent false negative produced by a network error. **This is the strongest finding in this domain.**

`hooks/useJobOwnerActions.ts:61` is the same shape in miniature — `setBidCount(typeof data === 'number' ? data : 0)` guarded by `!error`, so a failed count reads as "no bids yet" on the poster's own job.

**Recommendation, not applied:** these should distinguish the three cases the UI already has vocabulary for — `null` (unknown), a value, and an error. The minimum viable change is to set an error flag on the dispute reads specifically, and render the lifecycle as indeterminate rather than as "fine". Owner class STRUCTURE.

---

## 4. `useLegalGate` fails **open** — P1 (VERIFIED)

`hooks/useLegalGate.ts:23-32`:

```ts
const { status, error } = await fetchLegalStatus(user.id);
if (error) {
  console.error('[legal] acceptance check failed, allowing through:', error);
}
setState(status === 'needs_acceptance' ? 'needs_acceptance' : 'accepted');
```

When the acceptance read fails, `status` is not `'needs_acceptance'`, so the ternary lands on **`'accepted'`** and the user passes the legal gate. The `console.error` is the only record, and its own message says what is happening: *"allowing through"*.

This is a **deliberate** choice — the message is written, not accidental — and there is a real argument for it: a network blip should not lock a paying user out of the app. But the consequence is that a user can reach the marketplace without having accepted the Terms, and the only evidence is a console line no one will read on a production device.

**NEEDS OPERATOR DECISION.** This is a product/legal call, not an engineering one. The two defensible positions are:
- (a) keep failing open, but persist the fact — record that the gate was bypassed so the next successful check re-gates, and so it is auditable; or
- (b) fail closed with a retry surface, i.e. a `{ kind: 'error', onRetry }` state rather than silent admission.

An agent must not pick between these. Severity P1 because it is a compliance boundary that a transient error can cross. Owner class OPERATOR (decision) then STRUCTURE (implementation).

---

## 5. Failed fetches that render as real data

Four confirmed paths where a failure is visually indistinguishable from a legitimate result:

| # | Path | Failure renders as | Severity |
|-|-|-|-|
| 1 | `screens/TrackWorkerScreen.tsx:70` → `deriveJobLifecycle` | "no dispute on this job" | **P2** |
| 2 | `screens/ClientJobDetailScreen.tsx:226` → `deriveJobLifecycle` | "no dispute on this job" | **P2** |
| 3 | `hooks/useLegalGate.ts:29-32` | "terms accepted" | **P1** |
| 4 | `components/Avatar.tsx:21` | a blank `colors.border` square | **P3** |

**On (4)** — `components/Avatar.tsx:21` renders `<Image source={{ uri }} …/>` with no `onError`. The initials fallback at `:24` fires only when `uri` is **absent**, never when the load **fails**, so a 404 or offline avatar draws an empty tinted square rather than the initials block that already exists two lines away. This is the most widely mounted remote image in the app. The correct pattern is already used in five other components — `components/BrowseJobCard.tsx:77`, `components/HubCard.tsx:89`, `components/WorkerJobCard.tsx:108`, `ui/primitives/JobCard.tsx:127`, `screens/HomeScreen.tsx:751` all pair `resizeMode` with an `onError` fallback.

---

## 6. Mock / placeholder data in render paths — **NONE** ✅ (VERIFIED)

A repo-wide scan of `screens/ components/ ui/ lib/ hooks/` for `MOCK`, `PLACEHOLDER_`, `FAKE_`, `SAMPLE_`, `DEMO_`, `DUMMY`, `STUB_`, `SEED_DATA` found **no fabricated marketplace data reaching a render path**.

Every hit belongs to one of two legitimate systems:

1. **`lib/phoneAuth/mock.ts`** — a development-only phone-auth provider, selected by `EXPO_PUBLIC_PHONE_AUTH_MODE` (`lib/phoneAuth/mode.ts:41-53`). It is structurally prevented from shipping: `lib/phoneAuth/mode.ts:50` refuses the mode in a release build — *"development-only mock provider, which cannot run in a release."* And when it *is* active, `screens/VerifyPhoneScreen.tsx:421` labels it to the user in capitals: `MOCK MODE`, with `:426` explaining *"Phone verification flow passed in mock mode."* This is the opposite of invented data — it announces itself.
2. **`screens/WorkerHomeScreen.tsx:337`** — the word "mockup" inside a comment about a design master.

The no-invented-data invariant is also actively defended in the data layer. `lib/jobs.ts:360-362`:

> *"Returning null means the caller should fall back to that category's tinted icon block — there is deliberately no stock imagery standing in for a real upload."*

The one exception is not in the client at all: four **staging seed migrations** insert fabricated jobs (`08_security_schema.md` §H-2). Those are database tooling, self-labelled, and never reach a production render path — but they are the only files in the repo that contradict a stated invariant, and nothing mechanically prevents applying them. That finding stays in domain 08.

---

## 7. Unguarded property access — 0 real (VERIFIED)

A scan for non-null assertions (`!.`) across `screens/` and `components/` found exactly **one** candidate:

```tsx
// components/PortfolioPicker.tsx:402
source={{ uri: selected ? selected.photoUrl : editingItem!.photo_url }}
```

**Checked and cleared.** The enclosing block is guarded at `:377` by `{(selected || editingItem) && (`. Inside it, if `selected` is falsy then `editingItem` must be truthy, so the assertion is sound — TypeScript simply cannot narrow across the two expressions. Not a finding.

Optional chaining is used consistently elsewhere (`data?.full_name ?? null`, `job.photos?.[0] ?? null`, `bidCounts[job.id]` with an explicit `undefined` branch at `screens/HomeScreen.tsx:729`). With `strict: true` and a green `tsc`, the remaining risk is not nullability — it is **shape**, which is §8.

---

## 8. The real correctness risk: 20 unverified row shapes (P2, VERIFIED)

CLAUDE.md records the constraint: *"There are NO generated Supabase database types. `lib/supabase.ts` calls `createClient(URL, KEY, {…})` with no type parameter, so nothing is compile-checked against the schema."*

The practical consequence is 20 hand-written row shapes asserted with `as { … }`, each of which is a claim about the database that nothing verifies:

```ts
lib/clientStats.ts:22    const row = data as { posted: number; completed: number; cancelled: number };
lib/payments.ts:226      for (const row of (data ?? []) as { job_id: string; status: PaymentStatus }[])
lib/offers.ts:531        for (const row of (data ?? []) as { job_id: string; offer_count: number }[])
lib/portfolio.ts:72      ((data ?? []) as { category: string; job_count: number }[])
lib/earnings.ts:45       for (const j of (jobs ?? []) as { id: string; title: string }[])
lib/disputes.ts:80       ((data ?? []) as { job_id: string }[])
lib/reviews.ts:155       ((data ?? []) as { job_id: string }[])
lib/savedWorkers.ts:17   ((data ?? []) as { worker_id: string }[])
lib/savedWorkers.ts:30   ((data ?? []) as { worker_id: string; created_at: string; profiles: Profile }[])
lib/jobs.ts:348          (row as { id: string }).id
lib/jobFilters.ts:78     (j as { distance_miles?: unknown }).distance_miles
lib/navigationRef.ts:72  tabRoute.state as { routeNames?: string[] } | undefined
lib/reverseGeocode.ts:143 (await response.json()) as { address?: NominatimAddress }
lib/pushNotifications.ts:56 (Constants as { easConfig?: { projectId?: string } })
lib/offers.ts:371, :434, :459, :490  four row-array casts
lib/offers.ts:287        error: { … } as { message: string; code?: string }
```

**Why this matters more than it looks.** `08_security_schema.md` §J establishes that `scripts/verify-schema.mjs` cannot see column *types*, constraints, or function return shapes — its `checkColumn` helper issues `?select=<col>&limit=0` and passes on any 2xx. So a renamed or retyped column is caught by **neither** the type system **nor** the schema harness. It fails at runtime, on a user's device, as `undefined`.

Two of these are notably load-bearing:
- `lib/payments.ts:226` casts to `PaymentStatus` — a local union. A status value the database emits but the union does not name becomes a `PaymentStatus` by assertion and then flows into money labels. This is precisely the failure mode CLAUDE.md's fail-safe rule exists for.
- `lib/jobFilters.ts:78` is the honest one — it casts to `{ distance_miles?: unknown }` and then narrows, rather than asserting a type. **That is the pattern the other 19 should follow.**

**Recommendation, not applied:** where a cast crosses a trust boundary (an RPC result, a joined embed), validate rather than assert — the `unknown` + narrow shape at `lib/jobFilters.ts:78` is already in the codebase and needs no new dependency. Owner class STRUCTURE. This is a P2 that will not surface until a migration renames something, which is exactly why it belongs in a queue rather than a bug list.

---

## 9. Swallowed errors — the full picture

Three distinct populations, with different verdicts:

| Population | Count | Verdict |
|-|-|-|
| `if (!error)` guards that drop the error entirely | **10** | **§3 above — P2, real** |
| `catch` where `console.warn`/`console.error` is the only handling | **35** | see `10_dead_code.md` §F(b) |
| Fully empty `catch {}` | **34** | mostly justified |

**On the 35 console-only paths:** most carry an explicit rationale comment citing "hardening A8" — keep last-known-good rather than write a failed read through — which makes them deliberate rather than sloppy. But several are silent failures a user would want to know about, and the four worth naming here because they are data-binding failures rather than logging hygiene:

- `lib/postJobDraft.ts:110` — a draft is not persisted. **The user loses typed work with no indication.**
- `hooks/usePushNotifications.ts:39` — token sync fails. The user silently receives no notifications, forever, and nothing ever retries.
- `lib/pushNotifications.ts:276` — unregister fails on sign-out. The device **keeps receiving pushes for an account that signed out**.
- `lib/notificationRoutes.ts:222` — a notification's target screen is unknown. **The user taps a push and the app does nothing.** This compounds the cross-tab routing note in `03_navigation.md` §7.5.

**On the 34 empty `catch {}`:** most are AsyncStorage fallbacks where "the value isn't there" is a legitimate outcome and an empty catch is the right answer (`modes/modeStorage.ts`, `lib/themePreferenceStorage.ts`, `lib/discoveryFilterStorage.ts`, `lib/setupStorage.ts`, `hooks/useOneTimeNotice.ts`). `lib/voiceSearch/index.ts:27` is documented — a guarded vendor `require()` that must degrade rather than crash at import time. **One is worth a second look**: `screens/DeleteAccountScreen.tsx:125`, an empty catch on the account-deletion screen, where silently absorbing a failure is the least acceptable place to do it.

---

## 10. One scale defect found while tracing data flow (P2, VERIFIED)

```ts
// lib/jobs.ts:302-310
export async function fetchOpenJobs() {
  const { data, error } = await supabase
    .from('jobs')
    .select(OPEN_JOB_COLUMNS)
    .eq('status', 'open')
    .order('created_at', { ascending: false });
```

**No `.limit()`, no `.range()`, no pagination.** This fetches *every open job in the marketplace* on every Home mount, and `hooks/useOpenJobs.ts` additionally subscribes to realtime INSERTs that prepend to the same unbounded array (`:57`).

Home then uses `jobs.slice(0, PREVIEW_COUNT)` — four cards (`screens/HomeScreen.tsx:320`). The full array is fetched to render four rows.

There is one silver lining worth stating, because it changes another finding: because the fetch is unbounded, `similarPostedToday()` (`screens/HomeScreen.tsx:263-273`) counts against the *whole* open marketplace rather than a page, so its number is honest. (Its headline copy still is not — see `02_invariants.md` §I-6.)

At current staging volumes this is invisible. It is filed here rather than in `12_performance.md` because it is a data-binding decision, not a rendering one, and because the fix — a `.limit()` plus a real "view all" path — is a data-layer change.

---

## 11. Coverage

**100% of the 52 screens** were classified, and every screen the analyzer flagged was confirmed or cleared by reading the source.

One limit stated honestly: §3's list of discarded errors was found by grepping the `if (!error)` idiom. A fetch whose error is dropped by a *differently shaped* expression would not appear. The 10 found all share one idiom, which suggests a copied pattern rather than scattered oversights — but the enumeration is of that idiom, not a proof that no other shape exists.
