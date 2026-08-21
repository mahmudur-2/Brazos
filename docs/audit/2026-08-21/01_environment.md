# 01 — Environment

**Audit date:** 2026-08-21
**Repo:** `C:\Users\mdmah\OneDrive\Documents\BRAZOS`
**Mode:** read-only. Zero code changed. Zero database contact. `start.ps1` excluded from every scan.

---

## 1. Git state (VERIFIED)

| Fact | Value |
|-|-|
| Branch | `mainexpo` |
| HEAD | `9789f970bd59a9266bbc84fb259dfba2e955b674` (`9789f97`) |
| `origin/mainexpo` | `7bffaac5088ccdf7aa36527ea4f9c935b7fbb66f` (`7bffaac`) |
| Divergence (`git rev-list --left-right --count origin/mainexpo...HEAD`) | `0	8` |
| Working tree | **dirty** — 4 modified files, 0 staged, 0 untracked (before this audit created `docs/audit/2026-08-21/` and `.audit-scratch/`) |

### Finding #0 — origin divergence

**This checkout is 8 commits AHEAD of `origin/mainexpo` and 0 commits behind.**

Everything in this audit describes **only the code present in this checkout at `9789f97` plus four uncommitted working-tree modifications.** Eight commits of Home-screen work have never been pushed. Anyone reading this audit against `origin/mainexpo` will be reading against a tree that is missing all of the following:

```
9789f97 home(28): the record — the master file was replaced, and what that voided
6e1a49e home(25b): the promo heading's break is the master's, not the column's
6d6a94f home(27): the WorkerResults dispatch is not in the tree, and here is the gate
0b7874d home(26): Live Nearby, and the ring that is not gold after all
9320186 home(25): the promo card's heading sets on two lines, like the master's
79c841e home(24): the rhythm below the hero is five gaps, not one
6fd4159 home(23): the hero block, against a master that is a different file
d944334 home(20): the master file was replaced, and this is the instrument
```

Last 15 commits (for the record):

```
9789f97 home(28): the record — the master file was replaced, and what that voided
6e1a49e home(25b): the promo heading's break is the master's, not the column's
6d6a94f home(27): the WorkerResults dispatch is not in the tree, and here is the gate
0b7874d home(26): Live Nearby, and the ring that is not gold after all
9320186 home(25): the promo card's heading sets on two lines, like the master's
79c841e home(24): the rhythm below the hero is five gaps, not one
6fd4159 home(23): the hero block, against a master that is a different file
d944334 home(20): the master file was replaced, and this is the instrument
7bffaac home(19): the record, and light proven frozen        <-- origin/mainexpo
1cc4d60 home(16b): the serif ladder was reaching light, which is frozen
cbae3f2 home(18): the [ + ] sits inside the bar — a reversal of home(8)'s overhang
07aa80c home(17): the switch control's ring is a hairline, not the brightest line on the screen
68333f2 home(16): one serif ladder, and the hero's size is governed by its column
53cf34d home(15): the monogram was the right file at the wrong size
fb97d87 home(14): the hero is a slot, and the artwork in it is the one 44 was drawn from
```

### Working tree — the 4 uncommitted modifications (VERIFIED)

```
 M assets/prestige/hero_armchair_customer.png    (148,424 -> 176,718 bytes)
 M lib/homeDesignStudio.tsx                      (2 values changed)
 M screens/HomeScreen.tsx                        (5 values changed)
 M ui/tokens.ts                                  (6 values changed)
```

These are **live dial work in progress**, not stray edits. Full content, for the record, because the baseline test failures depend on them entirely:

`lib/homeDesignStudio.tsx`
```diff
-  heroFontSize: 31,
+  heroFontSize: 33,
-  searchHeight: 70,
+  searchHeight: 65,
```

`ui/tokens.ts` (the `dark` palette)
```diff
-  forest: '#1E3A2C',      +  forest: '#1B3527',
-  gold: '#DCAB60',        +  gold: '#D4A24C',
-  mint: '#11241C',        +  mint: '#0E1F18',
-  mint2: '#2A4C3D',       +  mint2: '#254539',
-  bg: '#03110E',          +  bg: '#02110D',
-  surface: '#0E1D17',     +  surface: '#0A1813',
```

`screens/HomeScreen.tsx`
```diff
-const HERO_ART_DARK = { width: 184, height: 162, right: -28, top: 35 } as const;
+const HERO_ART_DARK = { width: 184, height: 162, right: -33, top: 70 } as const;
-                  name="sparkles"
+                  name="arrow-forward"
-    paddingHorizontal: 13,
+    paddingHorizontal: 10,
-  modeSwitchDark: { borderWidth: 1, borderColor: colors.homeSlate },
+  modeSwitchDark: { borderWidth: 1, borderColor: '#6A736C' },
-  heroHeadlineDark: { color: colors.ink, fontSize: 18, lineHeight: 28 },
+  heroHeadlineDark: { color: colors.ink, fontSize: 19, lineHeight: 30 },
```

> **`screens/HomeScreen.tsx:935` now carries a raw hex literal** — `borderColor: '#6A736C'` — where HEAD had `colors.homeSlate`. That is a live violation of the "no hardcoded hex outside `lib/theme.ts` / `ui/tokens.ts`" invariant, introduced by uncommitted work. See `02_invariants.md`.

---

## 2. Baseline `npm run verify` — **RED** (VERIFIED)

Command: `npm run verify` (bare, redirected to a file; never paged).
Composition: `npm run lint && npm test` → `tsc --noEmit --pretty false --noUnusedLocals --noUnusedParameters` then `node --test tests/*.test.mjs`.

| Stage | Result |
|-|-|
| `npm run lint` (tsc, strict + noUnusedLocals + noUnusedParameters) | **GREEN** — 0 `error TS` lines |
| `npm test` (`node --test tests/*.test.mjs`) | **RED** |
| Overall exit code | **1** |

```
ℹ tests 799
ℹ suites 7
ℹ pass 789
ℹ fail 10
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 28265.2443
```

### Finding #1 — 10 failing tests at baseline

Verbatim assertions, stack frames elided:

**1. `tests/emeraldFences.test.mjs:451` — `home(2) fence: the B drape is a fraction of the screen, and the copy column follows it`**
```
AssertionError [ERR_ASSERTION]: the promo heading's long line ends 262.5pt from the
card's left edge; master 44 ends it at 251.1, 18pt clear of the B mark
    actual: false,  expected: true,  operator: '=='
```

**2. `tests/emeraldFences.test.mjs:880` — `home(25) fence: the promo card's height is master 44's, term by term`**
```
AssertionError [ERR_ASSERTION]: the promo card stacks to 186pt; master 44 measures
180.7 (its top edge at 449.1 and its bottom at 629.8 below the content box)
    actual: false,  expected: true,  operator: '=='
```

**3. `tests/emeraldFences.test.mjs:1005` — `home(17) fence: the mode switch wears the hairline in dark, gold in light`**
```
AssertionError [ERR_ASSERTION]: the dark ring is the neutral the replaced master
measures, not the gold hairline
    actual:   " borderWidth: 1, borderColor: '#6A736C' ",
    expected: /borderColor: colors\.homeSlate/,
    operator: 'match'
```

**4. `tests/emeraldFences.test.mjs:1087` — `home(16) fence: one serif ladder, measured off master 44`**
```
AssertionError [ERR_ASSERTION]: the dark headline's leading must resolve to master 44's
measured 37.9pt pitch, not 38.0
    actual: false,  expected: true,  operator: '=='
```

**5. `tests/emeraldFences.test.mjs:1267` — `home(14) fence: the dark hero fills its slot and bleeds to the screen edge`**
```
AssertionError [ERR_ASSERTION]: master 44 starts the scene 34.9pt below the content top;
this slot starts at 70pt
    actual: false,  expected: true,  operator: '=='
```

**6. `tests/emeraldFences.test.mjs:1436` — `home(5) fence: one dark ground in three places, light untouched`**
```
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual '#02110D'
  - expected '#03110E'
```

**7. `tests/goldOnForest.test.mjs:125` — `[static] the v2 dark palette keeps forest green and gold metal, distinct`**
```
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual '#1B3527'
  - expected '#1E3A2C'
```

**8. `tests/homeDesignStudio.test.mjs:16` — `Home Design Studio defaults preserve the current Home geometry and controls update real styles`**
```
AssertionError [ERR_ASSERTION]: The input did not match the regular expression
/heroFontSize: 31/.  (file now reads `heroFontSize: 33,`)
```

**9. `tests/themeResolution.test.mjs:563` — `[static] every roster bake claim is re-derived from the file, both ways`**
```
AssertionError [ERR_ASSERTION]: assets/prestige/hero_armchair_customer.png is claimed
opaque-dark but carries alpha down to 0
  0 !== 255
```

**10. `tests/themeResolution.test.mjs:607` — `[static] each hero raster is the bake the roster records`**
```
AssertionError [ERR_ASSERTION]: assets/prestige/hero_armchair_customer.png is recorded
room-baked but carries an alpha channel
  true !== false
```

### Root cause — VERIFIED, static

**All 10 failures are caused by the four uncommitted working-tree modifications, not by committed code.** The discriminating check was to compare the exact literal each test expects against the value at `HEAD` via `git show HEAD:<path>`:

| # | Test expects | Working tree has | `HEAD` has | Verdict |
|-|-|-|-|-|
| 3 | `/borderColor: colors\.homeSlate/` | `borderColor: '#6A736C'` | `borderColor: colors.homeSlate` | dirty-tree caused |
| 6 | `'#03110E'` | `bg: '#02110D'` | `bg: '#03110E'` | dirty-tree caused |
| 7 | `'#1E3A2C'` | `forest: '#1B3527'` | `forest: '#1E3A2C'` | dirty-tree caused |
| 8 | `/heroFontSize: 31/` | `heroFontSize: 33` | `heroFontSize: 31` | dirty-tree caused |
| 5 | scene top `34.9pt` | `HERO_ART_DARK.top: 70` | `HERO_ART_DARK.top: 35` | dirty-tree caused |
| 4 | pitch `37.9pt` | `fontSize: 19, lineHeight: 30` | `fontSize: 18, lineHeight: 28` | dirty-tree caused |
| 9, 10 | opaque, no alpha channel | PNG replaced, 148,424 → 176,718 B, now carries alpha | prior PNG | dirty-tree caused |
| 1, 2 | promo metrics | driven by `heroFontSize` 33 + `searchHeight` 65 | 31 / 70 | INFERRED dirty-tree caused |

Rows 3–10 are **VERIFIED** by direct literal comparison against `git show HEAD:<path>`. Rows 1 and 2 are **INFERRED**: they are geometry fences over the same Home layout whose only changed inputs are the same four files, but the audit did not re-run the suite against a clean tree (that would require `git stash` or a checkout, both forbidden by this run's constraints).

### Severity caveat — NEEDS OPERATOR DECISION

The audit rubric assigns P0 to "crash, security exposure, data loss, or secret leak." A red test suite is none of those. But CLAUDE.md is unambiguous: *"A failing test is a failure. There are no blessed failures."* This audit records the baseline as **a P0 blocker for any dispatch**, because no later agent run can tell its own regressions apart from these 10 until they are resolved. The finding is carried into `14_FIX_QUEUE.md` as **F-001**, owner class **DIAL** — the values are taste dials the operator is actively tuning, not structural defects.

**The operator must decide one of two things, and no agent may decide it for them:**
- (a) the dial values in the working tree are the intended new truth → the eight fences and two bake assertions must be re-derived and the tests updated, or
- (b) the dial values are experimental → the working tree is reverted by the operator (agents are forbidden from reverting).

**One further check the operator should not skip:** failures 9 and 10 say the replaced `hero_armchair_customer.png` "is claimed opaque-dark but carries alpha down to 0" and "is recorded room-baked but carries an alpha channel." That is not a taste dial — it is a **baked-artwork contract violation** (see `02_invariants.md`). A dark-only baked hero that now carries transparency will composite against whatever sits behind it rather than presenting the baked room. The correct resolution is almost certainly to re-flatten the PNG onto the dark ground, not to relax the assertion.

---

## 3. Toolchain (VERIFIED)

| Tool | Version | Source |
|-|-|-|
| Node | `v24.18.0` | `node --version` |
| npm | `11.16.0` | `npm --version` |
| `.nvmrc` | present at root (3 bytes) | `.nvmrc` |
| TypeScript | `~5.9.2` | `package.json` devDependencies |
| Expo SDK | **`54.0.36`** (exact pin, no range) | `package.json` |
| React Native | `0.81.5` (exact pin) | `package.json` |
| React / React DOM | `19.1.0` / `19.1.0` (exact pins) | `package.json` |
| React Navigation | native `^7.3.4`, native-stack `^7.17.6`, bottom-tabs `^7.18.3` | `package.json` |
| Supabase JS | `^2.108.2` | `package.json` |

`tsconfig.json` (10 lines) extends `expo/tsconfig.base`, sets `"strict": true`, and excludes `node_modules` and **`supabase/functions`** — meaning edge functions are not type-checked by `npm run lint`. See `13_tests.md`.

`app.json`: Expo app `BRAZOS`, slug `BRAZOS`, `userInterfaceStyle: "automatic"` (both palettes reachable at runtime — relevant to `05_theme_parity.md`), scheme `brazos`, iOS bundle `app.brazos.mobile`, EAS project `c870820e-40cf-4367-9ae5-3eb2c6c8c481`, updates URL `https://u.expo.dev/c870820e-…`, `runtimeVersion.policy: "fingerprint"`.

Android config is present (`com.brazos.app`, adaptive icon with background `#082F27`, 4 permissions) despite CLAUDE.md declaring **"Android deferred."** Recorded as a config/docs drift item in `09_docs_drift.md`.

---

## 4. Repo size (VERIFIED)

**646 tracked files.**

Tracked files by top-level directory:

| Dir | Files | LOC (ts/tsx/mjs/js/sql/md) |
|-|-|-|
| `docs/` | 89 | 21,686 |
| `lib/` | 86 | 13,409 |
| `supabase/` | 83 | 21,474 |
| `components/` | 62 | 13,097 |
| `tests/` | 57 | 18,516 |
| `screens/` | 52 | 27,589 |
| `dev-tools/` | 46 | 968 |
| (root) | 30 | 10,973 |
| `scripts/` | 29 | 7,384 |
| `hooks/` | 25 | 2,131 |
| `ui/` | 20 | 4,046 |
| `assets/` | 18 | — (binary) |
| `project-audit/` | 16 | — |
| `public/` | 8 | — (frozen) |
| `hardening-report/` | 7 | — |
| `modes/` | 6 | 572 |
| `.claude/` | 5 | — |
| `navigation/` | 4 | 590 |
| `hosting/` | 1 | — (frozen) |
| `.openai/` | 1 | — |
| `.github/` | 1 | — |

**Observation (VERIFIED):** `screens/` is 27,589 LOC across 52 files — a mean of **531 lines per screen**. That is the single largest concentration of logic in the repo and the primary driver of the DIAL-vs-STRUCTURE split in `06_design_studio_readiness.md`.

**Observation (VERIFIED):** `tests/` (18,516 LOC) is larger than `lib/` (13,409) and `components/` (13,097). Test mass is not the problem; test *aim* may be — see `13_tests.md`.

---

## 5. Top-level tree map

| Path | Purpose | Status |
|-|-|-|
| `App.tsx` | Root component: providers, error boundary, font load, mode shell mount | live |
| `index.ts` | Expo entry (registers `App`) | live |
| `env.d.ts` | Ambient types for `react-native-dotenv` | live |
| `assets/` | Ship assets: `icon.png`, `favicon.png`, `brand/`, `prestige/` (baked hero art) | live |
| `components/` | 62 shared components (auth scaffolding, cards, sheets, prompts, error boundary) | live |
| `design-reference/` | Supplied auth-flow comps + `screen_map.json`. **`.gitignore`d** (78 MB) | reference |
| `dev-tools/` | `ComponentCatalog.tsx`, `HomeDesignStudio.tsx`, launcher scripts, icons | dev-only |
| `dist/` | Built web output (`client/`, `server/`). **Frozen web surface** | frozen |
| `docs/` | `architecture.md`, `README.md`, `mockups/`, `archive/`, `audits/`, `audit/`, `dispatch/`, `emerald-v2/`, `runbooks/` | docs |
| `hardening-report/` | 7 markdown files from a past hardening run | historical |
| `hooks/` | 25 data hooks (`useAuth`, `useJob`, `useChat`, `useConversations`, …) | live |
| `hosting/` | `sites-worker.js`. **Frozen web surface** | frozen |
| `lib/` | 86 files: theme, backend client, navigation types, lifecycle, dialogs, adapters | live |
| `modes/` | `ModeProvider.tsx` (`switchMode()`, `ModeContext`), `ModeGuard`, `perspective` | live |
| `navigation/` | `CustomerRoot.tsx`, `WorkerRoot.tsx`, `ModeShell.tsx`, `sharedStacks.tsx` | live |
| `project-audit/` | 16 markdown files from an earlier full-repo audit | historical |
| `public/` | PWA shell: `index.html`, `sw.js`, `manifest.json`, `config.js`. **Frozen** | frozen |
| `screens/` | 52 screens | live |
| `scripts/` | Build/verify/proof scripts and `phaseNN-proof.sql` files | tooling |
| `supabase/` | 83 files: `phaseNN_*.sql` migrations plus `functions/` (edge, **excluded from tsc**) | schema |
| `tests/` | 57 `*.test.mjs` files run by `node --test` | tests |
| `ui/` | `tokens.ts` (token source of truth), `colorAlpha.ts`, `primitives/`, `templates/` | live |
| `.claude/` | `settings.json`, `hooks/`, `rules/` — agent policy and deny matrix | policy |
| `.github/` | `workflows/` | CI |
| `.openai/` | `hosting.json` (1 file) | orphan? |
| `.shots/` | `scripts/home-shots.mjs` output. **`.gitignore`d** | scratch |
| `.expo/` | Expo local state. **`.gitignore`d** | scratch |
| `start.ps1` | **QUARANTINED — live credential. `.gitignore`d. Never read during this audit.** | quarantine |

### Root-level files that are not config (VERIFIED — carried into `10_dead_code.md`)

`AGENTS.md`, `AUDIT_2026-08-12.md` (47 KB), `BRAZOS_BUILD_STATE.md`, `BRAZOS_MASTER_PLAN.md`, `DECISIONS.md` (31 KB), `DIAG_inbox_and_routes.md` (15 KB), `DIAG_offer_negotiation_messaging.md` (26 KB), `PROD_APPLY.md`, `PROD_APPLY_READY.sql` (**69 KB**), `PROD_VERIFY.sql`, `REVIEW_GUIDE.md`, `SECURITY_AUDIT.md` (23 KB), `WEB_DEPLOYMENT.md`, `brazos-product-spec.md`, `brazos-review.zip` (**943 KB, `.gitignore`d but present on disk**), `LICENSE`, `.expo-start.log`, `.expo-start-error.log`.

That is roughly 280 KB of loose markdown and SQL at the repo root that CLAUDE.md's source-of-truth table does not name as the owner of anything. `PROD_APPLY_READY.sql` (69 KB) sitting at the root of a repo whose stated policy is "production is never contacted" deserves specific scrutiny — see `08_security_schema.md`.

---

## 6. `.gitignore` posture (VERIFIED — sound)

`start.ps1` is ignored with an explicit comment: *"local launcher (embeds a live DB credential — must never be committed)."* `.env` and `.env*.local` are ignored. `design-reference/` is ignored with a size rationale. `.shots/`, `.expo/`, `dist/`, `node_modules/`, `brazos-review.zip` are ignored. `*.key`, `*.p8`, `*.p12`, `*.jks`, `*.mobileprovision`, `*.pem` are ignored.

`.claude/settings.local.json` is ignored while `.claude/settings.json` is versioned — the intended split. Independent secret-scan results are in `08_security_schema.md`.

---

## 7. Coverage

**100%.** No part of this domain was capped.
