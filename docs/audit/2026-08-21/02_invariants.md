# 02 — Invariants

**Method:** CLAUDE.md was read end to end (180 lines) and every stated invariant, hard constraint, and forbidden pattern extracted into the numbered checklist below. The audit prompt's known-invariant list was then merged in. Each item is judged **PASS**, **VIOLATION**, **PARTIAL**, or **NOT VERIFIABLE STATICALLY**.

Conclusions are labelled **VERIFIED** (directly observed in this checkout) or **INFERRED** (reasoned).

`start.ps1` was excluded from every scan. No database was contacted.

---

## Summary

| | Count |
|-|-|
| Checklist items derived | **31** |
| PASS | 19 |
| VIOLATION | 8 |
| PARTIAL | 2 |
| NOT VERIFIABLE STATICALLY | 2 |

**The eight violations, by severity:**

| ID | Item | Severity |
|-|-|-|
| **I-13** | Client-side `jobs.status` write path exists and is enforced by a test | P1 |
| **I-19** | "Smart matching is on" — AI/matching language in shipped copy | P1 |
| **I-7** | 30 hardcoded hex literals outside the two allowed token files | P1 |
| **I-8** | 12 interactive elements below the 44pt floor with no `hitSlop` | P1 |
| **I-25** | `lib/authTheme.ts` is a third token surface (grandfathered, undocumented) | P2 |
| **I-30** | 11 `useNativeDriver: true` hardcoded — breaks the web target | P2 |
| **I-6** | "High demand in your area" asserts geography the computation never checks | P2 |
| **I-2** | "escrows" appears in shipped Terms of Service copy | P2 |

---

## A. Invariants derived from CLAUDE.md

### I-1 — Money is integer cents, formatted only through `formatBudget()`
**PASS (VERIFIED).**
`formatBudget()` is defined exactly once, at `lib/jobs.ts:661`, and has **94 call sites** across `screens/ components/ ui/ lib/ hooks/`. A repo-wide scan for money formatting that bypasses it — `cents / 100` interpolation, `.toFixed(2)`, `Intl.NumberFormat(..., { currency })` — returned **zero hits** in `screens/ components/ ui/ lib/ hooks/`.

Column naming is consistent with the invariant: `budget_cents`, `amount_cents`, `platform_fee_cents`, `final_amount_cents`.

### I-2 — Money labels follow the payment state machine; never "paid" before released
**PARTIAL (VERIFIED).**

The state machine itself is clean. `ui/primitives/StatusPill.tsx:141` and `ui/primitives/MoneyText.tsx:27` both map the `held` state to the required wording:

```ts
held: 'Funds held in protection',
```

`tests/stage4dInvariants.test.mjs:138` enforces it: *`4D · no lifecycle label says "paid", and none says "escrow"`*, asserting `assert.doesNotMatch(label, /escrow/i, …)` over every state and both perspectives (`:142`, `:165`).

**The violation is outside the state machine.** `lib/legal/termsOfService.ts:79` ships the word to users:

```
Brazos holds, guarantees, escrows, or collects. Clients and Workers arrange
payment directly between themselves.
```

This is rendered copy — `lib/legal/index.ts:3` imports `TERMS_OF_SERVICE`, which `LegalDocumentScreen` displays. The rule as the audit prompt states it is absolute: *"the word 'escrow' must never appear in user-facing copy."*

`docs/audits/STAGE4D_AUDIT.md:76` already recorded this as *"pre-existing"* and left it. It has not been fixed since.

**NEEDS OPERATOR DECISION.** The sentence uses "escrows" as a *negation* — it tells the user Brazos does **not** escrow. Rewriting it to "…holds, guarantees, or collects" preserves the legal disclaimer and satisfies the ban. But Terms of Service is legal copy, and an agent should not silently rewrite a legal document. Severity P2, owner class OPERATOR.

Every other `escrow` hit in the repo is in non-shipping surfaces: `brazos-product-spec.md` (7), `project-audit/` (5), `docs/` (8), `DECISIONS.md:176`, `PROD_APPLY_READY.sql:644`, `supabase/phase51_active_work_lifecycle.sql:633`, and three test files that exist to enforce the ban. None reach a user.

### I-3 — One account, both capabilities: no role gating at the data layer
**PASS (INFERRED — static, cross-checked in `08_security_schema.md`).**
No client-side code gates a table, RPC, or query by account type. Every capability check observed is per-row (`client_id`, `assigned_worker_id`), never per-role.

### I-4 — Mode changes ONLY via `switchMode()` with confirm + stack reset
**PASS (VERIFIED).**
`switchMode` is the only mode mutator. Call sites: `screens/HomeScreen.tsx:363,376`, `screens/BrowseJobsScreen.tsx:183`, `screens/WorkerHomeScreen.tsx:181`, and `lib/notificationRoutes.ts:240` (through an injected bridge).

The confirmation is structurally non-optional. `modes/ModeProvider.tsx:66-74`:

```ts
export type SwitchModeOptions = {
  /**
   * Replaces the default confirmation copy. The confirmation itself is NOT
   * optional and there is deliberately no flag to skip it — §F requires an
   * intentional, acknowledged switch, and an opt-out would be the first thing
   * a future caller reached for.
   */
  confirm?: SwitchConfirmation;
};
```

Callers that pass no options (`BrowseJobsScreen.tsx:183`, `WorkerHomeScreen.tsx:181`) get `defaultConfirmation(target)` at `modes/ModeProvider.tsx:115` — they are not skipping the confirm.

Stack reset is by construction, not by call: `modes/ModeProvider.tsx:55-57` — *"swapping `mode` swaps which navigator tree is mounted, which resets both stacks to their tab roots by construction."*

### I-5 — Card perspective comes from `ModeContext`, never a hand-passed prop
**PASS (VERIFIED).**
A scan of all `.tsx` under `screens/ components/ ui/` for `perspective=`, `mode={`, `isWorker=`, `isCustomer=`, `viewerMode=` returned **zero hits**. 21 files consume `useMode` / `ModeContext` / `usePerspective` directly.

### I-6 — Never invent marketplace data
**VIOLATION — one instance (VERIFIED). Everything else PASSES.**

The good news first, because it is the majority of the surface. `screens/HomeScreen.tsx`'s Live Nearby card binds every displayed figure to live data:

| Displayed | Bound to |
|-|-|
| price | `job.budget_cents` via `formatBudget()` (`:786`), else the literal `'Open'` |
| location | `previewNeighborhood(job.location)` (`:794`), gated on `job.location` being present |
| bid interest | `bidCounts[job.id]` from `useBidCounts` (`:711`, `:728-735`) |
| "N similar jobs posted today" | `similarPostedToday(jobs, job)` (`:263-273`) — a real filter over fetched rows |
| thumbnail | `jobThumbnailUrl(job)` → `job.photos?.[0] ?? null`, falling back to a **category glyph, not stock imagery** (`lib/jobs.ts:364-366`, whose comment says so explicitly) |

Loading, error and empty states are all present and honest (`:653-673`).

**The violation is the copy, not the number.** `screens/HomeScreen.tsx:815-822`:

```tsx
{similarToday > 0 ? (
  …
  <Text style={[styles.demandText, isDark && styles.demandTextDark]}>
    High demand in your area
  </Text>
```

`similarPostedToday()` at `screens/HomeScreen.tsx:263-273` filters on exactly two things:

```ts
other.category === job.category &&
new Date(other.created_at) >= midnight
```

**There is no geographic term in that predicate.** The copy asserts "in your area"; the computation checks category and calendar day. A user in Houston sees "High demand in your area" because someone in Dallas posted a cleaning job this morning. The *number* below it ("3 similar jobs posted today") is honest; the *headline above it* is not.

Two clean resolutions, operator's choice: change the copy to "High demand today", or add a distance term to the predicate. Severity P2.

### I-7 — Never hardcode hex, radii, or spacing
**VIOLATION (VERIFIED). 30 live hex literals across 10 files.**

Scan: `/#[0-9a-fA-F]{3,8}\b/` across every tracked `.ts`/`.tsx`, excluding the two sanctioned files (`ui/tokens.ts`, `lib/theme.ts`) and `start.ps1`. 57 raw matches; 27 are inside explanatory comments (legitimate — they record measured values), **30 are live code**.

| file:line | value | component / context | note |
|-|-|-|-|
| `screens/HomeScreen.tsx:935` | `'#6A736C'` | `modeSwitchDark.borderColor` | **UNCOMMITTED.** Replaced `colors.homeSlate`. Also breaks `emeraldFences.test.mjs:1005`. |
| `screens/BrowseJobsScreen.tsx:45` | `'#0DBC5A'` | `AVAILABILITY_ONLINE_COLOR` | used at `:202`, `:295`, `:367` |
| `screens/VerifyPhoneScreen.tsx:519` | `'#7A5A18'` | text color | locked screen |
| `screens/VerifyPhoneScreen.tsx:523` | `'#7A5A18'` | text color | locked screen |
| `components/AuthNotice.tsx:31` | `'#3E4F47'` | inline `Text` color | locked-flow component |
| `components/AuthNotice.tsx:50` | `'#F5E7E4'` | `backgroundColor` | locked-flow component |
| `components/ModeTransitionOverlay.tsx:449` | `'#FFF3D6'` | `backgroundColor` | |
| `lib/jobs.ts:70-80` | 11 `bg` + 11 `icon` = **22 values** | `JOB_CATEGORY_ACCENTS` | see below |
| `lib/hotspots.ts:32-35` | `'#4FA8E8'` `'#5EBB6B'` `'#EAB308'` `'#DC2626'` | hotspot density strokes | see below |
| `dev-tools/HomeDesignStudio.tsx:107` | `'#E8ECE9'` | dev-tool root background | dev-only, lowest severity |
| `components/HotspotMap.web.tsx:443` | `'#e8eee9'` | `backgroundColor` | **FROZEN web surface — do not touch** |

**`lib/jobs.ts:70-80` is the largest block and deserves a judgement rather than a reflex.** It is a per-category accent map:

```ts
handyman: { bg: '#3B6FA6', icon: '#FFFFFF' }, // blue
cleaning: { bg: '#2E8B84', icon: '#FFFFFF' }, // teal
…
errands: { bg: '#E0A93A', icon: '#3D2B0F' }, // amber — light enough to need a dark glyph
```

These are **categorical** colors — eleven mutually-distinguishable hues, deliberately outside the brand palette (the comment on `yard_work` says *"distinct from the brand's deeper forest green"*). They are not taste dials on a brand surface. But the invariant makes no exception, and there is a real defect here regardless: **the map has no dark-palette variant.** `screens/HomeScreen.tsx:764` shows the codebase already knows this — under dark it substitutes `styles.jobThumbFallbackDark` and ignores `accent.bg` entirely, using `accent.bg` only in light. So the map is already half-abandoned. Carried to `05_theme_parity.md`.

`lib/hotspots.ts:32-35` is the same shape: a four-step density ramp (blue→green→amber→red) that is semantic, not brand. Same judgement.

**Recommendation, not applied:** move `JOB_CATEGORY_ACCENTS` and the hotspot ramp into `ui/tokens.ts` as named `categorical` / `density` scales with dark and light values. That satisfies the invariant *and* fixes the missing dark variant. Owner class STRUCTURE.

**Radii and spacing** are clean by comparison — `ui/tokens.ts` exposes `radius` (`:234-242`) and `spacing` (`:165-173`) and screens use them. Raw numeric radii/spacing do appear inline in `screens/HomeScreen.tsx` (it is under live dial work) but they are geometry the design studio owns; they are inventoried in `06_design_studio_readiness.md` rather than counted as violations here.

### I-8 — 44pt minimum touch target with `hitSlop`
**VIOLATION (VERIFIED). 12 confirmed sub-44 interactive elements without `hitSlop`.**

The codebase uses `Pressable` exclusively — **186 instances, zero `TouchableOpacity`/`TouchableHighlight`/`TouchableWithoutFeedback`**. That part is clean and consistent.

It also *knows* the rule. `ui/tokens.ts:379-380`:

```ts
/** The minimum any tappable thing may be. CLAUDE.md, non-negotiable. */
minTouchTarget: 44,
```

That token is referenced in exactly one place — `ui/primitives/ListRow.tsx`. Everywhere else, sizes are typed by hand.

**Method.** A throwaway analyzer (`.audit-scratch/touch2.mjs`, never committed) walked every `<Pressable>` opening tag, resolved its `styles.*` references against the file's `StyleSheet`, and substituted the numeric values of `spacing.*`, `controls.*`, `layout.*`, `authSpacing.*` and file-local `const NAME = <number>`. 130 Pressables carry no `hitSlop`. Of those, the ones below have an **explicitly resolved height under 44** — these are certain:

| file:line | style | resolved height |
|-|-|-|
| `screens/WorkChecklistScreen.tsx:199` | `itemMain` | **32** |
| `components/CategoryAccordion.tsx:118` | `otherAddBtn` | **34 × 34** |
| `screens/ProfileDetailsScreen.tsx:190` | `chip` | **34** |
| `screens/ProfileScreen.tsx:527` | `hubChip` | **34** |
| `screens/ProfileScreen.tsx:737` | `hubChip` | **34** |
| `components/QuickReplies.tsx:50` | `chip` → `CHIP_HEIGHT` = `18 + 7*2 + 2` | **34** |
| `components/JobFilterSheet.tsx:85` | `chip` | **36** |
| `components/JobFilterSheet.tsx:118` | `chip` | **36** |
| `screens/BrowseJobsScreen.tsx:370` | `viewAll` | **36** |
| `screens/BrowseJobsScreen.tsx:228` | `modeSwitch` | **40** |
| `screens/SavedWorkersScreen.tsx:166` | `hireButton` | **40** |
| `screens/WorkerProfileScreen.tsx:407` | `serviceBook` | **40** |

Plus two in a dev-only surface: `dev-tools/HomeDesignStudio.tsx:68` and `:80` (`stepButton`, 42 × 42).

**Probable, by padding arithmetic** (vertical padding × 2 + a ~20pt line box, no explicit height):

| file:line | style | estimate |
|-|-|-|
| `components/PastWork.tsx:240` | `tab` (`pv: spacing.xs` = 4) | ~28 |
| `components/PortfolioPicker.tsx:409` | `categoryChip` (pv 4) | ~28 |
| `components/PortfolioPicker.tsx:445` | `categoryChip` (pv 4) | ~28 |
| `components/CategoryAccordion.tsx:53` | `summaryRow` (pv 8) | ~36 |
| `components/CategoryAccordion.tsx:75` | `row` (pv 8) | ~36 |
| `components/ReactionPicker.tsx:53` | `removeBtn` (pv 8) | ~36 |
| `screens/ServicesPricingScreen.tsx:334` | `categoryChip` (pv 8) | ~36 |
| `dev-tools/ComponentCatalog.tsx:433` | `stateTab` (pv 8) | ~36 |

**Method limits, stated honestly.** The analyzer also flagged ~34 Pressables as "no resolvable size". Spot-checking five of them proved they are **false positives**: `components/Chip.tsx:189` has `minHeight: 44`; `components/Button.tsx:17-24` sizes are 44/52/64; `components/AuthButton.tsx` uses `authSizes.button = 54` (`lib/authTheme.ts:103`). The rest are large containers (backdrops, sheets, cards) that trivially clear 44. **Only the 12 + 2 explicit and 8 probable entries above should be treated as findings.** The remainder are not cleared, merely not proven either way by this method — settling them costs a per-file read, which a fix batch would do anyway.

**Two entries are in dead code.** `screens/BrowseJobsScreen.tsx:228` and `:370` sit in a screen that is **registered in neither navigation tree and imported by nothing** — see `10_dead_code.md` §A1, where `tests/workerHome.test.mjs:494` states it outright: *"BrowseJobsScreen: the atlas-48 screen, UNMOUNTED since 4D-1b."* Those two touch-target defects cannot reach a user. They stay on the list because the file is still tracked, still marked LOCKED in CLAUDE.md, and still read as source text by ten test files — but they should be resolved by **deleting the screen**, not by adding `hitSlop` to it. The same applies to the `'#0DBC5A'` hex at `screens/BrowseJobsScreen.tsx:45` in I-7.

That leaves **10 live confirmed sub-44 targets**, not 12.

### I-9 — Dark-only baked artwork must render only under the dark palette
**PASS (VERIFIED) — and this is the best-implemented invariant in the repo.**

Every baked asset is palette-gated at its render site:

| asset | gate | site |
|-|-|-|
| `assets/prestige/hero_armchair_customer.png` | `source={isDark ? PRESTIGE_HERO_ART : HOME_HERO_ART}` | `screens/HomeScreen.tsx:432` |
| `assets/prestige/brazos_b_drape.png` | `source={isDark ? PRESTIGE_B_DRAPE : POST_MARK}` | `screens/HomeScreen.tsx:621` |
| `assets/prestige/hero_toolbox_worker.png` | `{isDark ? (<Image source={PRESTIGE_TOOLBOX_ART} …/>) : …}` | `screens/WorkerHomeScreen.tsx:279-281` |
| `assets/prestige/home-atmosphere-dark.png` | `if (!isDark) return null;` | `components/HomeAtmosphere.tsx:56` |
| `assets/brand/customer-home-chair.png` | light half of the `:432` pair | `screens/HomeScreen.tsx:432` |
| `assets/brand/brazos_b_drape.png` | light half of the `:621` pair | `screens/HomeScreen.tsx:621` |

There is a machine-checked roster at `tests/themeResolution.test.mjs:400-440` recording each asset's bake type (`opaque-dark` / `transparent`) and gate decision, and two tests that **re-derive both claims from the actual pixels, in both directions** (`:563` and `:607`). That is stronger than a static gate check — it catches an asset being swapped for one with different compositing properties.

**And it is currently catching exactly that.** Both those tests are red in the baseline (Finding #1 items 9 and 10) because the uncommitted replacement of `hero_armchair_customer.png` (148,424 → 176,718 bytes) introduced an alpha channel into a file the roster records as `opaque-dark`:

```
assets/prestige/hero_armchair_customer.png is claimed opaque-dark but carries alpha down to 0
```

The invariant's *mechanism* passes. Its *current data* does not. That is a working-tree defect, recorded as F-001 in `14_FIX_QUEUE.md`, and the fix is to re-flatten the PNG — not to relax the roster.

### I-10 — Assignment and lifecycle are DB-only
See **I-13** below — this is where the audit's most consequential invariant finding sits.

### I-11 — `accept_offer()` is the only assignment path
**PASS (VERIFIED).** No client code writes `assigned_worker_id`. A scan of every `.update(` in `lib/ hooks/ screens/ components/` (10 sites total) found none touching that column.

### I-12 — `accept_bid()` and `respond_job_request()` have no app callers
**PASS (VERIFIED).** Zero call sites. The only occurrences are: a comment at `screens/JobDetailScreen.tsx:391`, and four test assertions in `tests/hardening.test.mjs` (`:60`, `:90`, `:221`, `:377`) that exist to keep them revoked and unused. `tests/hardening.test.mjs:90` is explicit — *"The accept_bid compatibility path is deliberately GONE (Phase 3B)."*

### I-13 — `transition_job_status()` is the only status mover; never set `status` from the client
**VIOLATION (VERIFIED). P1.**

`lib/jobStatusCompatibility.ts:117-124` writes `jobs.status` directly from the client:

```ts
const { data: updatedJob, error: updateError } = await supabase
  .from('jobs')
  .update(patch)                      // patch = { status: params.status, … }
  .eq('id', params.jobId)
  .eq('assigned_worker_id', user.id)
  .eq('status', expectedStatus)
  .select('id, status')
  .maybeSingle();
```

It is reached from `lib/jobs.ts:628-630`:

```ts
if (error?.code === 'PGRST202') {
  return transitionJobStatusWithoutRpc({ jobId, status, photoUrls, videoUrls });
}
```

**This is the only `.update()` in the entire client that touches `jobs`.** All 10 client `.update()` sites were enumerated; the other nine target `checklist`, `reports`, `notification_prefs`, `notifications`, `portfolio_items`, `profiles`, `push_tokens`, `services`.

**Three things make this worse than a stale shim:**

1. **A test enforces its existence.** `tests/hardening.test.mjs:156-159` asserts the fallback is wired:
   ```
   assert.match(jobsSource, /error\?\.code === 'PGRST202'/);
   assert.match(jobsSource, /transitionJobStatusWithoutRpc\(\{ jobId, status, photoUrls, videoUrls \}\)/)
   ```
   So an agent that deletes the violation breaks the suite. The test and the invariant contradict each other, and no future run can resolve that without an operator decision.

2. **Its own comment says it should already be gone.** `lib/jobStatusCompatibility.ts:36` — *"Phase31 restores the transactional server function and makes this path unnecessary."* The repo is at phase75+. Phase31 shipped long ago.

3. **The safety argument is conditional, not absolute.** The comment at `:33-35` says *"RLS remains the final authority on legacy databases."* That is true only if `authenticated` actually lacks a direct UPDATE grant on `jobs` and the RLS update policy is restrictive. **If a direct UPDATE grant exists, this path is a live client-side lifecycle mover that bypasses `transition_job_status()`'s state machine entirely** — including whatever guards it applies beyond assignee and prior status.

   The discriminating check is static and cheap: read the grants and the `jobs` UPDATE policy from the migrations. That is exactly what `08_security_schema.md` §C does. **The two findings must be read together** — if §C reports no direct UPDATE grant to `authenticated` on `jobs`, this is dead code (still a violation, still P1 to remove, but not exploitable). If §C reports a grant, the severity rises.

**Recommendation, not applied:** delete `lib/jobStatusCompatibility.ts`, delete the `PGRST202` branch at `lib/jobs.ts:628-630`, and replace `tests/hardening.test.mjs:156-159` with an assertion that the fallback **does not exist**. That inverts the test to guard the invariant instead of the shim. Owner class STRUCTURE. **NEEDS OPERATOR DECISION** on whether any deployment target still lacks the RPC.

A second, smaller instance of the same pattern: `lib/profiles.ts:51-58` has a `PGRST202` fallback with a self-limiting comment — *"only for the pre-migration development window"*. It writes `profiles`, not lifecycle state, so it does not violate this invariant. Recorded for hygiene in `10_dead_code.md`.

### I-14 — `job_offers` is RPC-write-only
**PASS (VERIFIED).** Zero direct `insert`/`update`/`upsert`/`delete` against `job_offers` anywhere in `lib/ hooks/ screens/ components/`. `tests/hardening.test.mjs:142` additionally asserts the offers source contains no `PGRST202` fallback — the escape hatch that I-13 has was deliberately never given to offers.

### I-15 — Messaging is locked pre-assignment
**PASS (VERIFIED — server-authoritative).**
The gate is a database function, not a client check. `lib/messages.ts:177-178`:

```ts
export async function fetchMessagingUnlocked(target: ChatTarget) {
  const { data, error } = await supabase.rpc('messaging_unlocked', {
```

with the comment at `:165` — *"THE question is answered by the database (phase66 `messaging_unlocked()`)"*. `lib/conversations.ts:122` further constrains the active set to `ACTIVE_JOB_STATUSES = ['assigned', 'in_progress']`.

### I-16 — Exact address lives in `job_locations`, RLS-enforced, never frontend-only
**NOT VERIFIABLE STATICALLY from the client alone — see `08_security_schema.md`.**
Client-side evidence is consistent with the invariant: `lib/jobs.ts:305` selects a fixed `OPEN_JOB_COLUMNS` allowlist for the open-market feed, `lib/jobs.ts:320-322` documents that `fetchOpenJobById` uses *"deliberately the same OPEN_JOB_COLUMNS allowlist… so this exposes nothing a worker browsing the public feed cannot already read"*, and `screens/HomeScreen.tsx:276-278` `previewNeighborhood()` truncates to the first comma-separated segment. But an allowlist in the client is not RLS. The authoritative check is the policy set on `job_locations`, in domain 08.

### I-17 — Lifecycle derivation is never duplicated (P3-31)
**NOT VERIFIABLE STATICALLY at this depth — deferred to `10_dead_code.md` §C.**
CLAUDE.md names four surfaces that carry status literals: `lib/jobLifecycle.ts`, `lib/jobStage.ts`, `lib/disputes.ts`, `ui/primitives/StatusPill.tsx`. Whether these are one rule expressed in four places or four copies of one rule requires reading all four against each other. Delegated to the duplicate-implementation sweep.

### I-18 — Nothing may depend on AI; manual posting produces a `JobDraft`
**PASS (VERIFIED) for dependencies.** No LLM SDK, no AI service client, and no AI screen (09–11) exists. The dependency audit independently confirms no AI/LLM package in `package.json`, the lockfile, or `node_modules`.
**The copy is a separate matter — see I-19.**

### I-19 — No match percentages, compatibility scores, "% match", or AI-router / smart-matching language
**VIOLATION (VERIFIED). P1.**

`screens/HomeScreen.tsx:528-534`:

```tsx
<Ionicons
  name="arrow-forward"
  size={23}
  color={colors.gold}
  accessibilityLabel="Smart matching is on"
/>
```

This is shipped user-facing copy — a screen reader announces it verbatim. **It is present at `HEAD`, not introduced by the working tree**; the uncommitted diff changed only the icon `name` from `"sparkles"` to `"arrow-forward"`, leaving the label untouched. The icon change is itself the tell: the sparkles glyph was the visual half of the same "smart matching" idea, and it was removed while its label was left behind.

The rest of the surface is clean:
- No `% match`, `match score`, `compatibility`, `matchScore`, or `smartMatch` identifiers anywhere.
- `lib/workerSearch.ts:713` has a `"Best matches"` header, but it is deliberately honest: the comment reads *"'Best matches' is only ever claimed when ranking actually ran"*, and `tests/…` enforces it — *`13 · "best matches" is claimed only when server ranking actually ran`* (passing at baseline). This is a ranking label backed by a real ranking, not a fabricated compatibility score. **PASS**, though the operator may still prefer different wording.
- `lib/jobs.ts:370` mentions Worker Home's *"X match your skills"* count — that is category-set intersection against the worker's own advertised services, not a score. **PASS.**

**Recommendation, not applied:** change the label to describe what the control does — e.g. `accessibilityLabel="Search"`. One line, `screens/HomeScreen.tsx:532`. Owner class STRUCTURE (it is copy in a render path, not a taste dial).

### I-20 — Deprecated shims are never called, extended, or imitated
**PASS (VERIFIED).** Covered by I-12.

### I-21 — Never weaken RLS, a policy, or a grant to make a feature work
**Deferred to `08_security_schema.md`.**

### I-22 — Every new SECURITY DEFINER function carries explicit `revoke`/`grant`
**Deferred to `08_security_schema.md` §E/§F.**

### I-23 — Production ref `the production ref` is never contacted
**PASS for this audit run (VERIFIED).** No command containing that string was constructed or executed. Whether any *repo file* references it is a domain 08 question.

### I-24 — There are NO generated database types
**PASS (VERIFIED) — as a factual claim.**
`lib/supabase.ts` calls `createClient(URL, KEY, {…})` with no type parameter. Status values are plain `string`.

This is recorded as a *constraint*, not a goal, and its consequence is real: a status literal absent from the database enum fails at runtime, never at build time. That is the direct cause of the fail-safe rule CLAUDE.md states next ("allow-list what it accepts, never block-list what it rejects"), and it is why `13_tests.md` ranks status-literal drift as a high-risk untested surface.

### I-25 — Token source of truth is `ui/tokens.ts`; never create a third token surface
**VIOLATION — grandfathered and undocumented (VERIFIED). P2.**

There are **three** color surfaces, not two:

| surface | role | hex literals |
|-|-|-|
| `ui/tokens.ts` | source of truth (`brand`, `light`, `dark`, `spacing`, `radius`, `controls`, `layout`) | sanctioned |
| `lib/theme.ts` | wrapper; standard screen import | sanctioned |
| **`lib/authTheme.ts`** | Emerald Trust auth/launch palette | **17** |

`lib/authTheme.ts` is imported by **23 files** — 11 components and 12 screens, including every locked auth screen. It defends itself at `:16-21`:

> *"These are NOT a second design system: they exist because the auth flow is the one part of the app that renders on the emerald/ivory brand palette rather than the in-app forest/cream palette in lib/theme.ts."*

And it has already been partially reconciled — `lib/authTheme.ts:2` imports `brand` from `ui/tokens.ts` and spreads it at `:31`, so the seven shared hues are no longer restated. The 17 remaining literals are auth-surface-only values (`sand`, the three launch-gradient stops, `onDark`, shadow colors).

**This is a defensible engineering decision that CLAUDE.md does not record.** The file is also on this run's locked list, so it cannot be changed here regardless. The correct action is **documentation, not code**: CLAUDE.md's "never create a third token surface" should read "…a *fourth*; `lib/authTheme.ts` is the sanctioned auth-surface palette and takes its shared hues from `ui/tokens.ts`." Owner class OPERATOR (CLAUDE.md edit). Carried to `09_docs_drift.md`.

One related observation, **not** a violation: `lib/theme.ts:68` and `:168` define `homeSlate` (`#526477` light / `#93A096` dark), a token that does **not** exist in `ui/tokens.ts`. It is used in 12 places across `screens/HomeScreen.tsx`, `screens/BrowseJobsScreen.tsx`, `screens/WorkerHomeScreen.tsx` and `dev-tools/HomeDesignStudio.tsx`. A token that lives only in the wrapper is a soft drift from "`ui/tokens.ts` is the source of truth". Carried to `05_theme_parity.md`.

### I-26 — Never import `ui/tokens.ts` directly in a new screen
**PASS (VERIFIED).** Zero screens import it. Grep for `from '../ui/tokens'` / `from '../../ui/tokens'` across `screens/ components/ hooks/ navigation/ modes/` returned **no hits**.

### I-27 — Shared templates provide loading / empty / error / offline / permission-denied — configure, don't reinvent
**PARTIAL (VERIFIED).**
Four templates exist in `ui/templates/`: `DetailScreen.tsx`, `FormScreen.tsx`, `ScreenStates.tsx`, `SuccessScreen.tsx`. Adoption across the 52 screens:

| template | screens using it |
|-|-|
| `DetailScreen` | 14 |
| `ScreenStates` | 13 |
| `FormScreen` | 5 |
| `SuccessScreen` | 3 |

`screens/HomeScreen.tsx` is a clear example of reinvention: it hand-rolls its own skeleton (`:653-663`), error notice with retry (`:664-671`), and empty state (`:672-675`) rather than configuring `ScreenStates`. Given Home is the master-fidelity surface, that may well be deliberate. The full per-screen state inventory is `04_data_binding.md`; the reinvention count is quantified there rather than guessed at here.

### I-28 — Dual navigation trees; cross-tree navigation must be a compile error
**PASS (VERIFIED).**
`lib/navigation.ts` defines `CustomerParamList` (`:469`) and `WorkerParamList` (`:512`) as separate types over separate per-tab stack param lists. No screen imports both trees' param lists — a per-file check across all 52 screens found **zero** files referencing both a customer-side and a worker-side param list type. And critically, there are **no `as any` casts and no `@ts-ignore` / `@ts-expect-error` on any navigation call** in `screens/ components/ lib/ navigation/`, so the type separation is not being defeated. `npm run lint` is green, which means the separation currently holds.

### I-29 — Route param types live in `lib/navigation.ts`
**PASS (VERIFIED).** All eight stack param lists and both tree param lists are defined there (`:32`–`:573`).

### I-30 — No animation libraries; built-in `Animated` with `useNativeDriver: Platform.OS !== 'web'`
**VIOLATION — the driver half (VERIFIED). P2. The library half PASSES.**

**Library ban: PASS.** The dependency audit checked `reanimated`, `moti`, `lottie`, `react-spring`, `framer-motion`, `gsap`, `popmotion`, `rive`, `animejs`, `velocity` against `package.json`, all 843 lockfile entries, the `node_modules` listing, and every source import. Absent from all four.

**Driver rule: VIOLATION.** The correct pattern is declared in 13 files as `const USE_NATIVE_DRIVER = Platform.OS !== 'web';` and used at 32 sites. But **11 sites hardcode `true`**, which throws on web:

| file:line |
|-|
| `screens/HomeScreen.tsx:334`, `:335` (the Live Nearby pulse) |
| `components/PhotoViewer.tsx:137`, `:138`, `:139`, `:167`, `:176`, `:178`, `:290` |
| `components/PulseDot.tsx:31`, `:37` |

`components/PulseDot.tsx:8` documents itself as *"Customer Home's 'Live Nearby' indicator"* — so **the Live Nearby card is animated by two separate hardcoded-`true` sites**, one in the screen and one in the component it mounts.

Four sites hardcode `false` — `screens/SetupScreen.tsx:127`, `:132`, `components/AuthField.tsx:52`, `components/PhoneNumberInput.tsx:81`. These are almost certainly correct: the native driver cannot animate layout or color properties, which is what those animate. **INFERRED**; verifying costs one read each. They are listed for completeness, not proposed for change.

The 11 `true` sites are a genuine defect against the stated rule. Note the mitigating context: web is a frozen surface and iOS is the target, so nothing ships broken today — but `scripts/home-shots.mjs` renders the app through a web export, which is exactly the path these break.

### I-31 — Frozen web/PWA surface
**PASS for this audit (VERIFIED).** `public/`, `hosting/`, `dist/`, `*.web.ts(x)`, `sw.js` were inspected read-only and never modified. Two findings above touch frozen files (`components/HotspotMap.web.tsx:443` hex; the `useNativeDriver` web breakage) and are recorded as **do-not-touch / note-only**.

---

## B. Items the audit prompt named that map to the above

| Prompt item | Checklist ID | Verdict |
|-|-|-|
| "escrow" never in user-facing copy; use "held in protection" | I-2 | VIOLATION (`lib/legal/termsOfService.ts:79`) |
| Fee language never claims permanence | see below | **PASS** |
| "Deleted user" verbatim | see below | **PASS** |
| No match %, compatibility, AI-router / smart-matching | I-19 | VIOLATION (`screens/HomeScreen.tsx:532`) |
| No worker availability calendars | see below | **PASS** |
| No invented marketplace data | I-6 | VIOLATION (one copy claim) |
| No hardcoded hex outside the two token files | I-7 | VIOLATION (30) |
| 44pt + `hitSlop` on every touchable | I-8 | VIOLATION (12 confirmed + 8 probable) |
| Dark-only baked art palette-gated | I-9 | PASS (mechanism); currently red on data |

### Fee permanence — PASS (VERIFIED)
Scanned for `always free`, `forever`, `never change(s)`, `no fees ever`, `always N%`, and `fee` within 30 characters of `always`/`forever`/`never`. **Zero hits in user-facing copy.** The 12 matches for `forever`/`never changes` are all code comments about unrelated things (`lib/AuthContext.tsx:47`, `lib/directThreads.ts:9`, `ui/primitives/Toggle.tsx:6`, etc.).

The only fee copy in the app is `screens/JobDetailScreen.tsx:849-858`, and it is careful:

```tsx
{PLATFORM_FEE_RATE > 0 ? 'Est. payout after fee' : 'Est. payout'}
…
: 'Estimate only, from the customer's stated budget. BRAZOS takes no platform fee — you receive the full agreed amount.'}{' '}
Payments currently run in a clearly-labeled development sandbox — no
real money is charged or paid out through the app yet.
```

Both the label and the sentence derive from one constant, `PLATFORM_FEE_RATE` (`lib/payments.ts:94`, currently `0`), so the card cannot drift from what checkout charges. The claim is present-tense ("takes no platform fee"), hedged by "currently", and carries no permanence word. `lib/payments.ts:89-92` states the exit path explicitly — *"WHEN A REAL SCHEDULE ARRIVES it comes from the database with the payment row, not from a client constant… This constant is the honest stand-in until then, not a config knob to turn."*

This is the invariant working as intended.

### "Deleted user" verbatim — PASS (VERIFIED)
The label is defined once and used verbatim everywhere. `lib/rebook.ts:16`:

```ts
export const DELETED_USER_LABEL = 'Deleted user';
```

Render sites: `screens/DeleteAccountScreen.tsx:137`, `:169`, `:174`. Database sites: `supabase/phase67_account_deletion.sql:513` and `supabase/phase75_security_hardening.sql:449`, both `set full_name = 'Deleted user'`.

**No softened variant exists anywhere** — scanned for `Removed user`, `Former user`, `[deleted]`, `Unavailable user`. Zero hits.

The tombstone semantics are documented at `supabase/phase67_account_deletion.sql:148`: *"The row is a TOMBSTONE from that moment: it exists only so retained reviews, payments and disputes still resolve to a name ('Deleted user'). Never re-used, never un-set."* Independently verified in `08_security_schema.md` §G.

### No worker availability calendars — PASS (VERIFIED)
No calendar UI, no weekday grid, no time-slot scheduler for worker availability exists in any of the 52 screens.

Two near-misses, both correctly *not* calendars:

1. **`hooks/useWorkerAvailability.ts`** drives a single **online/offline toggle** on `screens/BrowseJobsScreen.tsx:288-299` — a `Switch` with `accessibilityLabel="Availability"`. Binary presence, not a schedule.
2. **`screens/PostJobScreen.tsx:118-137`** has `SCHEDULE_DAYS = 14` feeding a horizontal date row ("Today", "Tomorrow", then `weekday, month day`) plus four fixed arrival windows (`Morning · 8–11 AM` … `Evening · 5–8 PM`). This is **the customer choosing when they want a job done** — a job attribute — not a worker publishing availability.

Note for the operator: `docs/mockups/23_availability_workerview_dark.png` and `24_availability_workerview_pg2_dark.png` exist in the master set with no implementing screen. That is the *right* outcome under this invariant, but it means the master set contains two designs that must never be built. Recorded in `07_ui_fidelity_inventory.md` and `09_docs_drift.md`.

---

## C. Coverage

**100% of CLAUDE.md's stated invariants were extracted and judged.**

Three items are deliberately deferred to their owning domains rather than answered twice: I-16 (RLS on `job_locations`), I-17 (lifecycle duplication), I-21/I-22 (grants and SECURITY DEFINER). Deferring is not a coverage gap — it is the source-of-truth rule applied to the audit itself.
