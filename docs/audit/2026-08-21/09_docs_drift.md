# 09 — Documentation drift

**Scope:** every factual claim in `docs/architecture.md` (371 lines), `CLAUDE.md` (180), `HANDOFF.md` (39.5 KB), and `BRAZOS_MASTER_PLAN.md` (12.3 KB), checked against the repository.

**Rule applied throughout — CLAUDE.md's own:** *"when it and the code disagree on what is implemented, the code wins and this file gets fixed."*

**No correction was applied.** Every proposal below is text for the operator to paste.

---

## Summary

| Document | Claims checked | Drifted | Worst |
|-|-|-|-|
| `docs/architecture.md` | ~90 | **6** | **D-1 — an entire stage stale** |
| `CLAUDE.md` | 31 (see `02_invariants.md`) | **3** | **D-7 — the Locked section contradicts itself** |
| `HANDOFF.md` | ~25 | **2** | D-10 — a green-suite claim that is now red |
| `BRAZOS_MASTER_PLAN.md` | ~15 | **0** ✅ | — |
| `docs/README.md` | — | **1** | D-13 — four surfaces unclassified |
| `docs/mockups/BRAZOS_MOCKUP_MANIFEST.md` | 44 | **1 (12 files)** | **D-12 — documents rejected masters as authority** |

**`BRAZOS_MASTER_PLAN.md` is clean.** Every claim checked is either evidenced or correctly hedged. It opens by disclaiming authority — *"This is a roadmap, not a current-state authority. Nothing here is evidence that anything is built, applied, or verified."* — and its "Near-term priorities" section cites a specific evidence file for each item. It is the best-behaved document in the repo and needs no correction.

---

## The one thing the audit prompt got wrong

> *"Explicitly confirm whether `architecture.md`'s tab-composition claim matches domain 03's findings."*

**It matches. The suspicion in the dispatch is incorrect — `architecture.md` does NOT claim the two trees are identical five-tab compositions.** `docs/architecture.md:73-78` says the opposite, and says it accurately:

> *"Since Stage 4D the two BARS differ: the worker bar keeps the five classic tabs (Home, Map, MyJobs, Messages, Profile); the customer bar shows Home · Discover · [ + ] · Messages · Profile, with Map and MyJobs still REGISTERED as hidden routes"*

`03_navigation.md` §8 derived exactly this from the code — worker 5 visible, customer 5 visible of 7 registered, `Map` and `MyJobs` behind `HIDDEN_TAB_ITEM_OPTIONS` at `navigation/CustomerRoot.tsx:189,194`. **VERIFIED agreement, sentence for sentence.**

Per the run's continue-path rule (*"A finding contradicts CLAUDE.md, HANDOFF.md, or memory → direct repo observation wins; record the contradiction explicitly"*), this is recorded and the audit continues. **No correction is owed to `architecture.md` for tab composition.**

There *is* a drift in the same paragraph, but it is the parenthetical, not the composition — **D-3** below.

---

## `docs/architecture.md`

### 🔴 D-1 (P1) — the theme-resolution section is an entire stage stale

**Claim** (`docs/architecture.md:116-122`):

> **"In this stage the provider returns the light palette unconditionally** — no `useColorScheme()`/Appearance read anywhere, no stored preference, and app.json keeps `userInterfaceStyle: "light"`. 4D-4 turns the provider's value into real state (AsyncStorage preference + Appearance) and does the both-themes screen sweep; nothing resolves to `dark` before then."

**Observed reality — every clause is false:**

| clause | reality | evidence |
|-|-|-|
| "returns the light palette unconditionally" | resolves preference → system → light | `lib/ThemeContext.tsx:25` |
| "no `useColorScheme()`/Appearance read anywhere" | both imported and used | `lib/ThemeContext.tsx:10` — `import { …, Appearance, …, useColorScheme } from 'react-native'` |
| "no stored preference" | read from AsyncStorage before the themed tree mounts | `lib/ThemeContext.tsx:28`, `lib/themePreferenceStorage.ts` |
| "app.json keeps `userInterfaceStyle: "light"`" | **`"userInterfaceStyle": "automatic"`** | `app.json` |
| "4D-4 turns the provider's value into real state" | 4D-4 shipped | `hooks/useThemeColors.ts:5` — *"which **since 4D-4** resolves stored preference → system appearance → light"* |
| "nothing resolves to `dark` before then" | the entire Prestige dark sweep is shipped | `ui/tokens.ts` `dark`, `screens/AppearanceScreen.tsx`, 8 commits of dark Home work |

**Why this is the worst drift in the repo.** An agent reading `architecture.md` — the document CLAUDE.md names as the owner of *implemented architecture* — would conclude that dark mode does not exist and that `dark` is unreachable. It would then treat every dark-palette style as dead code.

**Proposed corrected text** (replacing `:116-122`):

```markdown
Resolution is a context: `lib/ThemeContext.tsx`'s ThemeProvider (mounted once
in App.tsx, above auth and mode) feeds `hooks/useThemeColors.ts`, the single
reactive read. Since 4D-4 the provider resolves a real preference in order:
stored preference (AsyncStorage, `lib/themePreferenceStorage.ts`, read BEFORE
the themed tree mounts so there is no light flash) → system appearance
(`useColorScheme()`, subscribed to Appearance change events so an OS flip
repaints live) → light. A pinned preference is pushed to the native side with
`Appearance.setColorScheme` (RN 0.81.5 has it; react-native-web does not, and
the helper hands control back with null). `app.json` sets
`userInterfaceStyle: "automatic"`. `screens/AppearanceScreen.tsx` is the
setting surface. Both palettes are live and both are swept.
```

### 🔴 D-2 (P1) — "no screen re-derives any of it" is false

**Claim** (`docs/architecture.md:183-189`):

> *"Everything richer than those four values is *derived* in exactly one place, `lib/jobLifecycle.ts`… **and no screen re-derives any of it.**"*

**Observed reality (VERIFIED).** `10_dead_code.md` §C2 found **five** implementations of job-status derivation, and this audit independently confirmed the raw-ladder count:

| implementation | file |
|-|-|
| 1 | `lib/jobLifecycle.ts:71-107 deriveJobLifecycle` — 6 statuses → 12 states |
| 2 | `lib/jobStage.ts:28-54 jobStage` — 4 statuses → `{statusKey,label}` |
| 3 | `ui/primitives/StatusPill.tsx:69-101` — a 14-value vocabulary |
| 4 | `components/StatusBadge.tsx:13-43` — a 17-key flat map |
| 5 | `components/JobProgress.tsx:5-15` — status → step index, duplicating `lib/jobLifecycle.ts:133 trackStepIndex()` |

And **raw `status === '…'` ladders in 12 screens** (counted directly): `ClientJobDetailScreen` **10**, `WorkerJobScreen` 4, `VerifyPhoneScreen` 4 (unrelated — a phone-auth status), `ApproveOrDisputeScreen` 2, `CheckoutScreen` 2, `EarningsScreen` 2, `MyJobsHubScreen` 2, `RouteArrivalScreen` 2, `WorkChecklistScreen` 2, plus singles.

**`screens/ClientJobDetailScreen.tsx` is the proof.** It imports *both* derivations — `jobStage` at `:54`, `deriveJobLifecycle` at `:55`, calls them at `:155` and `:158` — and then hand-tests raw status **ten more times** at `:132, 221, 711, 820, 846, 848, 858, 971` and elsewhere.

**This also settles `02_invariants.md` §I-17,** which deferred the P3-31 lifecycle-duplication invariant to this sweep. **Verdict: VIOLATION.** CLAUDE.md's *"Lifecycle derivation is never duplicated (P3-31). One implementation per rule"* is not held.

**Proposed corrected text** (replacing `:183-189`):

```markdown
Everything richer than those four values is derived by `lib/jobLifecycle.ts`
from four facts: job status, payment state, the phase51 arrival timestamps,
and whether a dispute is open. It yields `draft, open, pending_payment,
confirmed, en_route, arrived, in_progress, awaiting_approval, disputed,
completed, cancelled, unknown`.

KNOWN DEBT (P3-31 is NOT held): four further status vocabularies exist —
`lib/jobStage.ts` (card badge), `ui/primitives/StatusPill.tsx`,
`components/StatusBadge.tsx`, and `components/JobProgress.tsx` (which
duplicates `trackStepIndex()`) — and twelve screens still test raw
`job.status` directly, `screens/ClientJobDetailScreen.tsx` ten times in a file
that already calls both derivations. Consolidation is queued; until it lands,
treat `lib/jobLifecycle.ts` as canonical and do not add a sixth.
```

### 🟠 D-3 (P2) — the Map-registration justification is stale

**Claim** (`docs/architecture.md:76-78`): *"…with Map and MyJobs still REGISTERED as hidden routes (**the locked Customer Home dispatches `navigate('Map')`**, and notification routing targets MyJobs in both modes…)"*

**Observed reality:** Customer Home does **not** dispatch `navigate('Map')` any more, and Customer Home is not locked. `screens/HomeScreen.tsx:400-408`:

> *"home(9): the 'View map' pill and its openMap() dispatch are gone from customer Home. The map is a WORKER surface… The Map ROUTE is untouched and still registered (hidden) on the customer tab navigator."*

A repo-wide grep for `navigate('Map'` finds **one hit, in a comment** (`lib/navigation.ts:474`, describing the removed pill in the past tense).

**The conclusion is still right — Map must stay registered — but for a different reason,** which the code states: *"React Navigation 7 resolves an untargeted NAVIGATE against the tab navigator only."*

**Proposed corrected text:**

```markdown
…with Map and MyJobs still REGISTERED as hidden routes. home(9) removed
Customer Home's "View map" pill and its dispatch — the map is a worker
surface — but the ROUTES stay, because React Navigation 7 resolves an
untargeted NAVIGATE against the tab navigator only, and notification routing
targets MyJobs in both modes (see `ui/primitives/BottomNav.tsx`).
```

### 🟠 D-4 (P2) — the dark palette is described as v1; the code is v2

**Claim** (`docs/architecture.md:108-109`): dark is *"Emerald Prestige: near-black emerald bg, dark-green cards, **gold hairline `line`, gold primary with a dark `onForest`**"*.

**Observed reality** — `ui/tokens.ts:139-148` records the reversal explicitly:

> *"v2 **INVERTS** v1's gold-primary premise: `forest` is a DEEP GREEN again — the one solid conversion fill of the whole master set — and `gold` is metal line-work (eyebrows, hairlines, icons, rings), **never a fill**. Cream/gold content on a forest fill is therefore correct in dark, exactly as in light; `onForest` is the cream ink."*

`ui/tokens.ts` `dark.onForest` is `#F1EDE1` — cream, not dark.

**Proposed corrected text:**

```markdown
…and `dark` (Emerald Prestige v2: near-black emerald bg, deep-green `forest`
as the one solid conversion fill, `gold` reserved for metal line-work —
eyebrows, hairlines, icons, rings — and never a fill, with a cream `onForest`.
v2 inverted v1's gold-primary premise; see the notes on `dark` in
ui/tokens.ts).
```

### 🟡 D-5 (P3) — the pending-migrations layer is no longer empty

**Claim** (`docs/architecture.md:22-24`): *"As of 2026-08-16 this layer is **empty**: phases 67-73 are all applied to staging and `verify-schema` reports zero MISSING and zero PENDING across every group."*

**Observed reality:** `supabase/phase74_push_scheduler.sql` and `supabase/phase75_security_hardening.sql` both exist. The claim is correctly date-stamped, so it is not *wrong* — but the document's own §4 says *"The layer is kept because it fills again the moment a new `phaseNN_*.sql` is written."* It has filled.

**Proposed corrected text:** change the date-stamp and the phase range, e.g. *"As of 2026-08-21 the repository contains phases 74 and 75 whose applied status this file does not know; `HANDOFF.md` owns that fact."*

### 🟡 D-6 (P3) — "the locked BrowseJobsScreen" (twice)

`docs/architecture.md:82-84` and `:150-151` both call `screens/BrowseJobsScreen.tsx` **locked**. CLAUDE.md says *"None. All screens unlocked 2026-08-19."*

The *substance* at `:82-84` is correct and valuable — *"unmounted since 4D-1b — kept on disk, registered nowhere, with every job-list intent landing on `WorkerResults{mode:'all'}`"* — and `10_dead_code.md` §A1 confirms it exactly. Only the word "locked" is stale, in both places.

---

## `CLAUDE.md`

### 🔴 D-7 (P1) — the "Locked — never modify" section contradicts itself and is malformed

Verbatim, `CLAUDE.md:78-82`:

```
## Locked — never modify

\## Locked — never modify

None. All screens unlocked 2026-08-19 for the Prestige dark sweep.`screens/BrowseJobsScreen.tsx`.
```

Three defects in five lines:
1. **The heading appears twice**, the second escaped (`\##`) — a bad paste.
2. **The content contradicts itself in one sentence**: *"None. All screens unlocked"* followed immediately by a file path with no verb.
3. **It names a dead screen.** `screens/BrowseJobsScreen.tsx` is imported by nothing and registered in neither tree (`10_dead_code.md` §A1); `tests/workerHome.test.mjs:494` calls it *"UNMOUNTED since 4D-1b."*

**This is the highest-consequence documentation defect in the repo**, because CLAUDE.md declares the locked list a **non-negotiable protected control** four lines later (`:98`). A protected control whose content is ambiguous cannot be enforced — an agent cannot tell whether `BrowseJobsScreen` is locked or unlocked, and both readings are defensible from the text.

**Proposed corrected text** (replacing `:78-82` in full):

```markdown
## Locked — never modify

None. All screens were unlocked 2026-08-19 for the Prestige dark sweep.

`screens/BrowseJobsScreen.tsx` is UNLOCKED but DEAD: imported by nothing,
registered in neither navigation tree since 4D-1b, and kept on disk only
because ten test files read its source as text. Do not style it, do not add
`hitSlop` to it, do not fix its hardcoded hex. Its removal is a queued task
that must update those tests in the same commit.
```

**Note the audit prompt's own locked list differs** from CLAUDE.md's — it names Launch, Welcome, SignIn, EmailSignIn, CreateAccount, EmailCreateAccount, VerifyPhone, Setup, LegalGate, Home, BrowseJobs, and `lib/authTheme.ts`. This audit honoured the **prompt's** list (read-only inspection only, no modification) because the prompt is authoritative for this run. **The divergence between the two lists is itself a NEEDS OPERATOR DECISION item** — a future dispatch inheriting the prompt's list would treat Home as locked while CLAUDE.md says otherwise.

### 🟠 D-8 (P2) — `lib/authTheme.ts` is an undocumented third token surface

`CLAUDE.md:67-70`: *"Token source of truth: `ui/tokens.ts`. `lib/theme.ts` wraps it… never create a third token surface."*

**Observed reality** (`02_invariants.md` §I-25, `05_theme_parity.md` §8): `lib/authTheme.ts` is a third surface with **17 hex literals** and **23 importers**, and it also declares parallel non-color scales (`authRadius`, `authSpacing`, `authSizes`, `authType`, `authShadows`). It is deliberate, defended in its own header, and partially reconciled — `:2` imports `brand` from `ui/tokens.ts` and spreads it at `:31`.

**Proposed corrected text:**

```markdown
Token source of truth: `ui/tokens.ts`. `lib/theme.ts` wraps it and is the
standard import for screens. `lib/authTheme.ts` is the one sanctioned
exception: the auth/launch flow renders on the emerald/ivory brand palette
rather than the in-app forest/cream one, so it carries auth-surface-only
values — and it takes its seven shared brand hues from `ui/tokens.ts`'s
`brand`, so there is still one definition of "forest". Never create a FOURTH
token surface. Never hardcode hex, radii, or spacing outside those three;
never import `ui/tokens.ts` directly in a new screen.
```

### 🟡 D-9 (P3) — Android is "deferred" but fully configured

`CLAUDE.md:24` — *"Expo / iOS native app. **Android deferred.**"*

`app.json` carries a complete Android block: `package: "com.brazos.app"`, an `adaptiveIcon` with `backgroundColor: "#082F27"`, `predictiveBackGestureEnabled: false`, and four permissions (`RECORD_AUDIO`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`, `MODIFY_AUDIO_SETTINGS`). `package.json` has an `android` script. Three Android icon assets exist (though `10_dead_code.md` §D1 shows all three are unreferenced by that config).

Not a defect — configuration can precede a target — but "deferred" reads as "absent", and it is not. **Proposed:** *"Android deferred — `app.json` carries a complete Android block and `npm run android` exists, but Android is not built, tested, or shipped, and no work should target it."*

---

## `HANDOFF.md`

### 🟠 D-10 (P2) — the green-suite claim no longer holds

`HANDOFF.md:36-38`: *"**Suite: 795 pass / 0 fail at baseline → 799 pass / 0 fail / 0 skipped, exit 0.**"*

**Observed baseline this run:** 799 tests, **789 pass, 10 fail, exit 1** (`01_environment.md` Finding #1).

**This is not HANDOFF being wrong.** It records what its own run achieved, and it was true at `9789f97`. The suite went red afterwards, from four **uncommitted** working-tree edits. `04_data_binding.md` and `05_theme_parity.md` trace all ten failures to those edits.

But an agent reading HANDOFF will expect green and will misattribute the ten failures to its own work. **Proposed addition, at the head of that section:**

```markdown
> **AS OF 2026-08-21 THE SUITE IS RED — 789 pass / 10 fail / exit 1 — and it is
> NOT this run's doing.** Four uncommitted working-tree edits
> (`assets/prestige/hero_armchair_customer.png`, `lib/homeDesignStudio.tsx`,
> `screens/HomeScreen.tsx`, `ui/tokens.ts`) moved dial values the fences assert
> on. See `docs/audit/2026-08-21/01_environment.md` Finding #1 for the
> value-by-value mapping. Resolve those before treating any failure as new.
```

### ✅ D-11 — the anon-EXECUTE evidence block is intact and must stay

The audit prompt instructs: *"Note that the anon-EXECUTE ACL evidence block in `HANDOFF.md` must be preserved verbatim in any future rewrite."*

**Confirmed present and cross-referenced.** `BRAZOS_MASTER_PLAN.md` states the same conclusion — *"anon-EXECUTE is settled and needs no remediation migration — a live `pg_proc` read on staging, 2026-08-16, found exactly one anon-executable function in schema `public`, the deliberate one"* — and `08_security_schema.md` §F.1 independently verifies from the migrations that exactly one such grant exists (`job_categories_expanded()`, `phase69:229-230`), used by `verify-schema.mjs:1258-1259` as its one positive anon probe.

**Static evidence and live evidence agree.** Preserve the block verbatim. **Do not let any future rewrite compress it into a summary** — it is the only record of a live `pg_proc` read, which no static audit can reproduce.

---

## `docs/mockups/BRAZOS_MOCKUP_MANIFEST.md`

### 🔴 D-12 (P1) — the manifest presents twelve REJECTED masters as numbered authority

`07_ui_fidelity_inventory.md` §4 found 12 manifest headings whose filenames do not exist on disk. **`HANDOFF.md` explains why, and the explanation makes this far more serious than a naming mismatch.**

`HANDOFF.md:11-21`:

> **"The WORD-NAMED masters are NOT authority and the operator has REJECTED them** as an over-ornate render pass: `Compare_Bids_Dark.png`, `Discover_Map_Dark.png`, `Messages_Inbox_Dark.png`, `My_Jobs_Active_Dark.png`, `My_Jobs_Closed_Dark.png`, `My_Jobs_In_Progress_Dark.png`, `Notifications_Feed_Dark.png`, `Notifications_Preferences_Dark.png`, `Payment_Methods_Dark.png`, `Profile_Account_Safety_Dark.png`, `Profile_Details_Dark.png`, `Profile_Past_Work_Settings_Dark.png`. **Never cite one to justify a change**; never 'restore' a detail that appears only there."

**Those are exactly, all twelve, the same files** as domain 07's mismatch list. Set-identical.

And `HANDOFF.md:24-26` completes the picture:

> *"**Six numbered masters the emerald dispatch cites do not exist on disk** (33, 34, 39, 40, 45, 46; also absent: 21, 28, 35–38, 41, 42)"*

So the true state is:

| | |
|-|-|
| The **numbered** masters 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 45, 46 | **do not exist** — HANDOFF is right |
| The **word-named** files of the same content | **exist on disk and are REJECTED** — HANDOFF is right |
| `BRAZOS_MOCKUP_MANIFEST.md` | **documents all twelve under their numbers, as authority** — the manifest is wrong |

**The risk is concrete.** `HANDOFF.md:7-9` ranks the manifest as binding design authority (fourth, after the numbered masters, the D1–D11 dispatch decisions, and the run report). An agent that reads the manifest without reading HANDOFF's warning block will find `### 35_My_Jobs_Active_Dark.png — Active tab`, treat it as a numbered master, resolve it to the file on disk, and implement a design the operator explicitly rejected — while believing it is following the highest authority.

**Proposed correction — a banner at the head of `BRAZOS_MOCKUP_MANIFEST.md`:**

```markdown
> **TWELVE ENTRIES IN THIS FILE ARE REJECTED AND ARE NOT AUTHORITY.**
> The headings numbered 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 45 and 46
> describe files that exist on disk only under WORD-NAMED filenames
> (`Discover_Map_Dark.png`, `My_Jobs_Active_Dark.png`, …). The operator has
> REJECTED that render pass as over-ornate — see HANDOFF.md, "THE MASTER SET
> IS SPLIT". Those numbers were never assigned to a file. Never cite one of
> those twelve to justify a change.
>
> This file also omits `9_job_post_dark.png` (941x1672), which does exist; the
> "all 43" count in the palette section should read 44 files, 32 of them
> numbered masters.
```

**NEEDS OPERATOR DECISION on the stronger option:** delete the twelve headings outright. A banner leaves rejected material one careless read away; deletion removes the hazard but also removes the record of what was rejected. This audit recommends the banner plus a `docs/archive/` copy of the deleted section.

---

## `docs/README.md`

### 🟡 D-13 (P3) — four surfaces are unclassified

`docs/README.md` opens with a strong rule: *"Every documentation surface in the repository, classified. **If a file is not listed here, treat it as code.**"* Four surfaces are not listed, so that rule mis-files them:

| unlisted | what it is |
|-|-|
| `PROD_APPLY_READY.sql` (69 KB) + `PROD_VERIFY.sql` | production migration SQL at the repo root. `PROD_APPLY.md` **is** classified; its two SQL siblings are not. See `08_security_schema.md` §H.9 |
| `docs/dispatch/` | dispatch prompts (`4D-1a.md`) |
| `docs/audit/` | **this** directory — note `docs/audits/` (plural) *is* classified, and the two names differ by one letter |
| `.openai/hosting.json` | a 96-byte vendor-hosting config from the PWA deploy, untouched since 2026-07-30 |

**Proposed:** add all four, and — because `docs/audit/` and `docs/audits/` one letter apart is a trap — **rename one of them**. That is a NEEDS OPERATOR DECISION: this run was dispatched to write into `docs/audit/2026-08-21/`, so it created the singular directory; folding it into `docs/audits/` would be tidier but contradicts the dispatch path.

---

## Files referenced by a doc that do not exist — **none** ✅

Every file path named in the four authority documents was resolved. All exist. The only near-miss is `docs/mockups/BRAZOS_MOCKUP_MANIFEST.md`'s twelve numbered names (D-12), which are headings rather than path references.

---

## Coverage

**100%** of the four authority documents plus `docs/README.md` and `BRAZOS_MOCKUP_MANIFEST.md`.

Two stated limits:
- **Layer-3 claims cannot be checked.** `architecture.md` §3 defines *"Last live-verified staging state"* as a category, and both it and `HANDOFF.md` carry claims of that kind (e.g. *"phases 67–72 are applied to staging (live snapshot 2026-08-15)"*). Confirming them requires a database, which this run is forbidden to touch. They are **NOT VERIFIABLE STATICALLY**, and both documents correctly date-stamp them, which is the right way to write an unverifiable claim.
- `docs/archive/`, `project-audit/`, `hardening-report/` and `docs/emerald-v2/` were **not** drift-checked. `docs/README.md` classifies them as archive or point-in-time reference, and CLAUDE.md says archive is *"never an authority for anything current"* — so drift in them is not a defect. `10_dead_code.md` §H records their staleness as hygiene.
