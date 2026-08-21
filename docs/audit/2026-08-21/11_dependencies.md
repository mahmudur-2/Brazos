# 11 — Dependencies

**Nothing was installed.** No `npm install`/`ci`/`update`/`audit fix`, no `expo install --check`, no `expo-doctor`, no network. `package.json`, `package-lock.json` and `node_modules/*/package.json` were read only.

**Scope:** 37 declared packages (31 `dependencies`, 6 `devDependencies`), 326 source files, 843 lockfile entries.

---

## Summary

| Check | Result |
|-|-|
| Declared vs lockfile vs `node_modules` | **zero mismatches, zero missing** ✅ |
| **Imported but not declared** | **1 — `expo-constants`, P2** |
| Declared but never imported | 9 — **8 justified**, 1 genuine orphan |
| Expo SDK 54 alignment | **zero actual version mismatches** ✅ |
| Animation libraries (banned) | **absent from all four surfaces** ✅ |
| Dependencies added in the last 30 commits | **1** — approval status UNKNOWN |
| Deprecated packages that are direct dependencies | **0** ✅ |

---

## A. Declared vs installed — clean ✅ (VERIFIED)

Every declared package resolves **identically** in `package-lock.json` (lockfileVersion 3) and in `node_modules/<pkg>/package.json`. The lockfile's root blocks are byte-identical to `package.json`. The tree is in sync.

| package | kind | declared | resolved |
|-|-|-|-|
| `@expo/vector-icons` | dep | `^15.0.2` | 15.1.1 |
| `@react-native-async-storage/async-storage` | dep | `2.2.0` | 2.2.0 |
| `@react-navigation/bottom-tabs` | dep | `^7.18.3` | 7.18.3 |
| `@react-navigation/native` | dep | `^7.3.4` | 7.3.14 |
| `@react-navigation/native-stack` | dep | `^7.17.6` | 7.17.6 |
| `@supabase/supabase-js` | dep | `^2.108.2` | 2.108.2 |
| `expo` | dep | `54.0.36` | 54.0.36 |
| `expo-asset` | dep | `~12.0.13` | 12.0.13 |
| `expo-audio` | dep | `~1.1.1` | 1.1.1 |
| `expo-dev-client` | dep | `~6.0.21` | 6.0.21 |
| `expo-device` | dep | `~8.0.10` | 8.0.10 |
| `expo-file-system` | dep | `~19.0.23` | 19.0.23 |
| `expo-font` | dep | `~14.0.12` | 14.0.12 |
| `expo-image-picker` | dep | `~17.0.11` | 17.0.11 |
| `expo-linking` | dep | `~8.0.12` | 8.0.12 |
| `expo-location` | dep | `~19.0.8` | 19.0.8 |
| `expo-notifications` | dep | `~0.32.17` | 0.32.17 |
| `expo-sharing` | dep | `~14.0.8` | 14.0.8 |
| `expo-speech-recognition` | dep | `3.1.3` | 3.1.3 |
| `expo-status-bar` | dep | `~3.0.9` | 3.0.9 |
| `expo-updates` | dep | `~29.0.19` | 29.0.19 |
| `expo-video` | dep | `~3.0.16` | 3.0.16 |
| `ol` | dep | `^10.10.0` | 10.10.0 |
| `react` | dep | `19.1.0` | 19.1.0 |
| `react-dom` | dep | `19.1.0` | 19.1.0 |
| `react-native` | dep | `0.81.5` | 0.81.5 |
| `react-native-maps` | dep | `1.20.1` | 1.20.1 |
| `react-native-safe-area-context` | dep | `~5.6.0` | 5.6.2 |
| `react-native-screens` | dep | `~4.16.0` | 4.16.0 |
| `react-native-url-polyfill` | dep | `^3.0.0` | 3.0.0 |
| `react-native-web` | dep | `^0.21.2` | 0.21.2 |
| `@expo/ngrok` | dev | `^4.1.3` | 4.1.3 |
| `@types/react` | dev | `~19.1.10` | 19.1.17 |
| `babel-preset-expo` | dev | `~54.0.10` | 54.0.12 |
| `playwright` | dev | `^1.62.1` | 1.62.1 |
| `react-native-dotenv` | dev | `^3.4.11` | 3.4.11 |
| `typescript` | dev | `~5.9.2` | 5.9.3 |

Six packages sit above their declared floor (`@expo/vector-icons`, `@react-navigation/native`, `react-native-safe-area-context`, `@types/react`, `babel-preset-expo`, `typescript`) — all satisfy their ranges. Normal caret/tilde drift, **not a finding**.

---

## B. 🟠 Imported but NOT declared — **`expo-constants`** (P2, VERIFIED independently this run)

```ts
// lib/pushNotifications.ts:3
import Constants, { ExecutionEnvironment } from 'expo-constants';
```

Confirmed by direct check:
- `grep -c "expo-constants" package.json` → **0**. It is in neither `dependencies` nor `devDependencies`.
- `node_modules/expo-constants/package.json` → `"version": "18.0.13"`
- `node_modules/expo/bundledNativeModules.json` → `"expo-constants": "~18.0.13"`

**It resolves today only by hoisting.** Four installed packages depend on it — `expo`, `expo-asset`, `expo-linking`, `expo-notifications`, all pinning `~18.0.13` — so npm places it at `node_modules/expo-constants`, where a bare import finds it.

**Why this matters more than it looks:**

1. **Nothing in this repo pins it.** If a future SDK bump drops it from Expo's dependency graph, or npm's hoisting changes, `lib/pushNotifications.ts` breaks **at runtime, on push registration** — not at build time.
2. **`npm run verify` structurally cannot catch it.** `tsc --noEmit` resolves through `node_modules` regardless of declaration, so the audit gate stays green while the dependency is undeclared. Only this kind of scan finds it.
3. Verified repo-wide: `expo-constants` appears **exactly once** outside `node_modules`/lockfile — that one line.

**Fix (not applied):** add `"expo-constants": "~18.0.13"` to `dependencies` — the exact pin SDK 54 expects, so it changes no installed bytes. **STRUCTURE**, and about as low-risk as a change can be.

### `@env` — checked and cleared, not a finding

`lib/supabase.ts:4` and `lib/supabase.web.ts:4` import from `'@env'`. This is a **virtual module**, not a package: created by the `module:react-native-dotenv` Babel plugin (`babel.config.js:7-16`, `moduleName: '@env'`) and typed in `env.d.ts:2`. `react-native-dotenv` is correctly declared as a devDependency. **Correct as-is.**

### Everything else is declared

24 further bare-imported packages, all present. **Two independent extraction methods** — a multi-regex scanner and a separate raw grep sweep — produced the same package set, including `import 'x'` side-effect form, `require()`, dynamic `import()`, subpaths (`ol/Feature.js`, `react-native-url-polyfill/auto`), and scoped names.

---

## C. Declared but never imported — 9, of which 8 are justified

| package | source imports | status |
|-|-|-|
| `expo-dev-client` | 0 | **REQUIRED** — `eas.json` `development.developmentClient: true` |
| `expo-font` | 0 | **REQUIRED** — `app.json` plugins list; also a peer of `@expo/vector-icons` (`>=14.0.4`) |
| `expo-updates` | 0 | **REQUIRED** — `app.json` `updates.url` + `runtimeVersion.policy: "fingerprint"`; `eas.json` channels |
| `react-dom` | 0 | **REQUIRED** — peer of `react-native-web`; needed for the web bundle |
| `react-native-screens` | 0 | **REQUIRED** — peer of both `@react-navigation` navigators (`>= 4.0.0`) |
| `react-native-web` | 0 imports (11 comment mentions) | **REQUIRED** — the web platform target itself |
| `expo-asset` | 0 | **Redundant but harmless** — already a dependency of `expo` and a peer of `expo-audio`. Expo convention is to declare it. |
| `@expo/ngrok` (dev) | 0 | **Zero references anywhere.** Only reachable via `expo start --tunnel`. See §F.4 |
| **`expo-linking`** | 0 | **Genuinely unreferenced (INFERRED)** — see below |

### `expo-linking` is the one true orphan

No import, no `app.json`/`eas.json`/`babel.config.js` reference, and — verified against the lockfile — **no other installed package requires it**; the root `package.json` is its only requirer. `App.tsx:170-176` mounts `<NavigationContainer>` with `ref`/`theme`/`onReady` and **no `linking` prop**, and there is no `Linking.createURL` or `prefixes` config anywhere.

**Caveat before anyone removes it:** `app.json` declares `scheme: "brazos"`, and push-notification taps are routed via `flushPendingNavigation`. A deep-link smoke test should precede removal, and that is an **OPERATOR** action (device required), not an agent one.

---

## D. Expo SDK 54 alignment — **VERIFIED STATICALLY, essentially clean** ✅

`node_modules/expo/bundledNativeModules.json` **exists** (119 entries), so this section was fully settled offline — no `expo install --check`, no network, no "NOT VERIFIABLE STATICALLY" caveat needed.

`expo` is pinned exactly at **54.0.36**. Of the 37 declared packages, 23 appear in the SDK map. **21 are exact matches. Every installed version satisfies the SDK's expected range — there are zero actual version mismatches.** Two declared *ranges* differ cosmetically:

| package | declared | SDK 54 expects | installed | assessment |
|-|-|-|-|-|
| `@expo/vector-icons` | `^15.0.2` | `^15.0.3` | 15.1.1 | declared floor one patch below the SDK's; installed satisfies both. **Cosmetic.** |
| `react-native-web` | `^0.21.2` | `~0.21.0` | 0.21.2 | on a `0.x` version, `^0.21.2` resolves to `>=0.21.2 <0.22.0` — functionally the SDK's `~0.21.0` with a higher floor. **Cosmetic.** |

Transitive SDK modules are also on-pin: `expo-constants` 18.0.13, `expo-modules-core` 3.0.30, `expo-application` 7.0.8, `expo-manifests` 1.0.11, `expo-image-loader` 6.0.0, `expo-server` 1.0.7, `@expo/fingerprint` 0.15.5.

Correctly unmanaged by the SDK map: all `@react-navigation/*`, `@supabase/supabase-js`, `ol`, `react-native-url-polyfill`, `expo-speech-recognition`, and every devDependency.

---

## E. Recently added dependencies — **approval status UNKNOWN**

Only **17 commits in repo history** touch `package.json`, and **exactly one falls inside the last 30 commits**:

| commit | date | subject | added |
|-|-|-|-|
| `d944334` | 2026-08-20 | `home(20): the master file was replaced, and this is the instrument` | **`playwright: ^1.62.1`** (devDependencies) |

**Approval status UNKNOWN — the operator must confirm.**

Widening past 30 commits for context:

| commit | date | subject | added |
|-|-|-|-|
| `031f2bc` | 2026-08-18 | `deps(voice): expo-speech-recognition 3.1.3 + config plugin…` | `expo-speech-recognition: 3.1.3` |
| `d3ff213` | 2026-08-15 | `stage2: add expo-dev-client` | `expo-dev-client: ~6.0.21` |
| `c8a397b` | 2026-08-01 | `feat: support job video attachments` | `expo-video: ~3.0.16` |

**Approval status UNKNOWN for all.** Two of these (`031f2bc`, `d3ff213`) carry commit subjects that read as deliberate, announced additions, consistent with CLAUDE.md's flag-before-adding rule — **but a commit subject is not a record of approval**, and this audit will not treat it as one.

### The animation-library ban — CLEAN ✅ (VERIFIED)

Checked `reanimated`, `moti`, `lottie`, `react-spring`, `framer-motion`, `gsap`, `popmotion`, `rive`, `animejs`, `velocity` across **four independent surfaces**: `package.json`, all 843 lockfile entries, the `node_modules` directory listing, and all source imports. **Not present in any of the four.**

The codebase uses React Native's built-in `Animated` with **48 `useNativeDriver` sites** — exactly the CLAUDE.md-mandated approach. (The *driver value* at 11 of those sites is a separate defect — see `02_invariants.md` §I-30 and `12_performance.md` §H. The **library** half of the invariant is clean.)

---

## F. Risk notes

### F.1 `ol` vs `react-native-maps` is NOT duplication — it is a documented platform split ✅

`components/HotspotMap.native.tsx:4` imports `react-native-maps`; `components/HotspotMap.web.tsx` imports 17 `ol/*` submodules; `components/HotspotMap.d.ts` is the shared type surface Metro resolves per platform. The reason is in the code at `lib/hotspots.ts:131-132` — *"HotspotMap.native.tsx uses react-native-maps; HotspotMap.web.tsx uses OpenLayers because react-native-maps has no web support."* **`ol` never enters the native bundle.**

Residual note: `ol` is **15 MB installed**, with all 18 import sites in one file — and that file is inside the **frozen web/PWA surface**. Heavyweight, no cheaper web option, and untouchable.

### F.2 `maplibre-gl` removal is complete and regression-tested ✅

`tests/pwa.test.mjs:45` asserts the built HTML contains no `/maplibre/i`; `:98` asserts `dependencies['maplibre-gl'] === undefined`. Good hygiene. `node_modules/@maplibre` and `node_modules/@mapbox` remain as **empty orphan directories** — zero subdirectories, absent from the lockfile. Purely cosmetic; they vanish on a clean reinstall.

### F.3 `playwright` — correctly scoped, one dynamic use

`scripts/home-shots.mjs:205`: `const { chromium } = await import('playwright');` — dynamically imported, so it never loads unless the screenshot harness runs. This is the CLAUDE.md-documented `node scripts/home-shots.mjs` tool. Browser binaries live outside the repo (`~/AppData/Local/ms-playwright`). **Never enters the app bundle.**

Minor unclaimed saving: the script only launches chromium and never uses the test runner, so `playwright-core` would do the same job at roughly half the 5 MB. Not a problem — just noted.

### F.4 `@expo/ngrok` — strongest removal candidate

devDependency, **zero references anywhere in the repo**, reachable only through `expo start --tunnel`. Bundles a deprecated `uuid@3.4.0`.

**Flagging rather than recommending removal:** CLAUDE.md forbids agents running `expo start`, so the operator may tunnel manually and depend on it. **OPERATOR decision.**

### F.5 Deprecated packages — 8 in the tree, **zero are direct dependencies** ✅

From lockfile `deprecated` fields: `inflight@1.0.6` (*"leaks memory. Do not use it"*), `rimraf@3.0.2`, `glob@7.2.3` ×4 (under `react-native`, `@react-native/babel-preset`, `rimraf`, `test-exclude`), `uuid@7.0.3`, `uuid@3.4.0` (under `@expo/ngrok`).

**All live inside React Native's, Expo's, or ngrok's own trees — not actionable from this `package.json`.** They clear when RN/Expo upgrade. Recorded so a future run does not chase them.

### F.6 `expo-speech-recognition` — the only non-Expo-org native module, and its risk is already handled well

`gh:jamsch/expo-speech-recognition`, single maintainer, **exactly pinned at `3.1.3`** (no range) — correct for an unmanaged native module.

It is loaded through a **guarded `require()`** at `lib/voiceSearch/index.ts:23` with a documented reason: its entry calls `requireNativeModule("ExpoSpeechRecognition")` at import time and **throws on a binary lacking the native module**, so a static import would crash the app at startup. The lazy caught require degrades to `unavailable` instead.

Noted as **maintenance / supply-chain concentration**, not a defect. It is the one dependency whose disappearance would need a code change rather than a version bump.

### F.7 No other duplicate-purpose pairs ✅

One storage layer (`AsyncStorage`, 10 sites), one data layer (`@supabase/supabase-js`, 7 sites), one icon set (`@expo/vector-icons`, 83 sites), one navigation stack.

### F.8 `react-native-url-polyfill` loads on web too (very minor)

Both sites are `import 'react-native-url-polyfill/auto'` — `lib/supabase.ts:1` and `lib/supabase.web.ts:1`. On web the native `URL` API already exists, so the web-side polyfill is redundant. Harmless; the web file is frozen anyway.

---

## Bottom line

**The dependency tree is in unusually good shape.** Lockfile and `node_modules` agree perfectly, SDK 54 alignment is exact, no banned animation library exists on any of four surfaces, and the one apparent map-library duplication is a documented and correct platform split.

Three items for the queue:
1. **`expo-constants` is undeclared** and `npm run verify` structurally cannot catch it — **P2, STRUCTURE**.
2. Two cleanup candidates — `expo-linking` and `@expo/ngrok` — both needing an **OPERATOR** confirmation before removal.
3. One approval question — **`playwright`**, added in `d944334`, status UNKNOWN.

---

## Coverage

**100%** of declared packages and source imports.

Stated limits:
- **No installs, no network.** SDK alignment (§D) was resolvable offline only because `bundledNativeModules.json` ships inside `node_modules/expo`. If a future run finds that file absent, §D becomes NOT VERIFIABLE STATICALLY and the cheapest settlement is `npx expo install --check` — which this run is forbidden to make.
- **`eas.json` was read only by the delegated scan**, not re-read here: the repo's own guard blocks it as credential-bearing (see `08_security_schema.md` §K.1). Its `developmentClient` and channel claims in §C rest on that scan.
