# Guard coverage audit — 2026-08-22

Read-only findings. No guard, hook, deny rule, fence or lint rule was
weakened, disabled, narrowed or granted an allowance by this audit, and no
code was fixed. The question answered: **for every active guard in this
repository, what does it actually cover — and does the class of violation it
exists to prevent already exist in the paths it does not?**

Every coverage boundary below is quoted VERBATIM from the file that defines
it. Nothing is inferred: where a boundary cannot be read off disk it is marked
UNKNOWN with what would settle it.

## Header

* **HEAD at audit time:** `1714fd8` on `mainexpo` (after the L-010 star fix
  `dd518d9` and the L-002 accent move `1714fd8`).
* **Guards enumerated:** 4 harness-layer (deny matrix, PreToolUse guard,
  SessionStart hook, git-side hooks path), 1 type-check, 1 test runner, 1 CI
  workflow, 1 schema verifier, and 17 scope-bounded test fences — read off
  `.claude/`, `package.json`, `tsconfig.json`, `.github/workflows/ci.yml`,
  `scripts/`, and the 62 files matching `tests/*.test.mjs`.
* **Suite size:** 846 tests across 62 files, 722 of them top-level `test()`
  calls. 120 of the 846 (14.2%) are inside one Windows-gated `describe`.
* **Complement scanned:** 257 app `.ts`/`.tsx` files
  (`screens components ui hooks navigation modes lib dev-tools` + `App.tsx`,
  `index.ts`, `env.d.ts`), of which 102 sit outside the hex fence. 159 colour
  literals live in that complement. Separately: `public/` (3 files, 6
  literals), `hosting/` (1 file, 0), `scripts/` (10 files, 0).
* **Severity counts: P0 0 · P1 2 · P2 8.** No guard is absent where one is
  claimed, and no guard's own logic is wrong. Both P1s are coverage holes with
  a real violation already sitting in them.

---

## (a) The guard inventory, with verbatim coverage boundaries

### Harness layer — `.claude/`

| Guard | Enforces | Coverage boundary (verbatim) |
|-------|----------|------------------------------|
| **GH-1** `.claude/settings.json` → `permissions.deny` | 100 deny patterns: force/destructive push, history rewrite, DB CLIs, nested sessions, dynamic exec, bulk `git add`, and path bans. | Path bans, quoted: `"Edit(/design-reference/**)"`, `"Edit(/public/**)"`, `"Edit(/hosting/**)"`, `"Edit(/dist/**)"`, `"Edit(/WEB_DEPLOYMENT.md)"`, `"Edit(**/*.web.ts)"`, `"Edit(**/*.web.tsx)"`, `"Edit(/.claude/**)"`, `"Read(./start.ps1)"`, `"Read(./.env)"`, `"Read(./.env.*)"`, `"Edit(./start.ps1)"`, `"Edit(./.env)"`, `"Edit(./.env.*)"`. Production ref: `"Bash(*the production ref*)"` / `"PowerShell(*…*)"`. |
| **GH-2** `.claude/hooks/guard.ps1` | Fails closed (`exit 2` on any ambiguity). 10 rules: PRODREF, NESTED-CLAUDE, DYNEXEC, GIT, HOOKSPATH, DB, DEPS, SECRET, CLAUDEDIR, BRANCH. | Tool boundary, from `.claude/settings.json`: `"matcher": "Bash\|PowerShell\|Edit\|Write\|NotebookEdit"`. Inside the script: `if (-not ($isCommandTool -or $isEditTool -or $isNotebook)) { exit 0 }`. Path rules: `foreach ($pre in @('design-reference/', 'public/', 'hosting/', 'dist/'))`; `if ($rel.EndsWith('.web.ts') -or $rel.EndsWith('.web.tsx'))`; `if ($base -eq 'web_deployment.md' -or $base -eq 'start.ps1' -or $base -eq '.env' -or $base -match '^\.env\..+$')`. Push allow-list: `$pa[0] -eq 'origin' -and ($pa[1] -eq 'mainexpo' -or $pa[1] -eq 'mainexpo:mainexpo')`. |
| **GH-3** `.claude/hooks/session-context.ps1` | Nothing. Emits one line: `"[repo-state] branch=$branch HEAD=$head tree=$tree"`. | `SessionStart`, no matcher. Informational only — it enforces no rule and can block nothing (`exit 0` unconditionally). |
| **GH-4** GUARD-HOOKSPATH | Git's own hooks path, not the harness's. | Verbatim, including its own scope note: `# GUARD-HOOKSPATH governs GIT's own hooks (core.hooksPath), not Claude Code's.` and `if ($low.Contains('core.hookspath'))`. |

Two properties of GH-1/GH-2 are stated in `guard.ps1` itself and are quoted
rather than paraphrased, because both bound what the layer can promise:

> `ONE OF TWO LAYERS, NOT THE ONLY ONE. A hook that fails to start or times out
> does not block anything, so this guard can never be sole enforcement.`

> `GUARD-SECRET IS BEST-EFFORT DETECTION, NOT A BOUNDARY. It matches file names
> in command text; a subprocess can open a file without ever naming it.`

### Build, test and CI layer

| Guard | Enforces | Coverage boundary (verbatim) |
|-------|----------|------------------------------|
| **GT-1** `npm run lint` | Types, plus dead locals/params. | `"lint": "tsc --noEmit --pretty false --noUnusedLocals --noUnusedParameters"`. Scope from `tsconfig.json`: `"exclude": ["node_modules", "supabase/functions"]` — with no `include` or `files` key, so everything else under the project root is checked. |
| **GT-2** `npm run typecheck` | Types only. | `"typecheck": "tsc --noEmit --pretty false"`. Same `exclude`. Not run by `verify`. |
| **GR-1** `npm test` | Executes the suite. | `"test": "node --test tests/*.test.mjs"` — one literal glob, one directory deep, `.test.mjs` only. |
| **GV-1** `npm run verify` | The canonical offline gate. | `"verify": "npm run lint && npm test"` — exactly two sub-steps, in that order, short-circuiting on lint. |
| **GC-1** `.github/workflows/ci.yml` | Runs the canonical gate on the trunk. | `branches: [mainexpo]` under both `push` and `pull_request`, plus `workflow_dispatch`. `runs-on: ubuntu-latest`. One check step: `run: npm run verify`. Its own scope note: `# The canonical offline check, and nothing else.` |
| **GS-1** `scripts/verify-schema.mjs` | Schema drift against live staging. | Never runs in `verify` and never in an autonomous run — CLAUDE.md: "That script needs `.env` and live staging, so it never runs inside an autonomous run." Its coverage is therefore **operator-cadence, not repo-enforced**. |

### Scope-bounded test fences

Every fence below declares its scope in source. Fences whose assertions name
specific files rather than walking a tree are listed after the table.

| Fence | Enforces | Coverage boundary (verbatim) |
|-------|----------|------------------------------|
| **F-HEX** `themeResolution.test.mjs` | No raw colour literal. | `const roots = ['screens', 'components', 'ui', 'hooks', 'navigation', 'modes'];` (recursive), minus `LITERAL_FILE_ALLOWLIST` (10 files) and `if (/\.web\.tsx?$/.test(path)) continue;` |
| **F-TOKENIMPORT** `themeResolution.test.mjs` | Screens take tokens from `lib/theme.ts`. | `const dir = new URL('../screens/', import.meta.url);` — `screens/` only, and **non-recursive** (`readdir(dir)` with no `recursive: true`). |
| **F-RASTER** `themeResolution.test.mjs` | Every mounted raster is on the roster. | `const roots = ['screens', 'components', 'ui'];` (recursive). |
| **F-ARTGATE** `themeResolution.test.mjs` | Theme-specific artwork mounts behind `isDark`. | `const roots = ['screens', 'components', 'ui'];` (recursive), window `const GATE_WINDOW = 240;` |
| **F-MAP** `themeResolution.test.mjs` | One MapView, tiles follow the theme. | `for (const path of ['components', 'screens'])` (recursive). |
| **F-EMERALD** `emeraldFences.test.mjs` | 21 emerald-pass fences incl. F5 category gating. | `const SOURCE_DIRS = ['screens', 'components', 'ui', 'hooks', 'lib', 'navigation', 'modes'];` (recursive). **The only colour-adjacent fence whose scope includes `lib/`.** |
| **F-GOLD** `goldOnForest.test.mjs` | Gold is line-work, never a fill. | `const SOURCE_DIRS = ['screens', 'components', 'ui'];` (recursive). |
| **F-COPY** `copyHonesty.test.mjs` | No unbacked/AI marketing claim. | `const SCAN_DIRS = ['components', 'hooks', 'lib', 'modes', 'navigation', 'screens', 'ui'];` recursive, `!/\.web\.tsx?$/`. Comments included by design. |
| **F-MOTION** `motionDriver.test.mjs` | `useNativeDriver` decision on every animation. | `const SCAN_DIRS = ['components', 'dev-tools', 'hooks', 'lib', 'modes', 'navigation', 'screens', 'ui'];` + `const ROOT_FILES = ['App.tsx', 'index.ts'];`, `!/\.web\.tsx?$/`. **The widest app-source scope in the suite.** |
| **F-ERRREAD** `errorHonesty.test.mjs` | No silently discarded read error. | `for (const dir of ['screens', 'hooks', 'components']) walk(dir);` (recursive). |
| **F-FAILOPEN** `errorHonesty.test.mjs` | The fail-open log line stays extinct. | `for (const dir of [ 'screens', 'hooks', 'components', 'lib', 'modes', 'navigation', 'ui', 'dev-tools', 'tests', …` — recursive, and over `.ts/.tsx/.mjs/.js/.json/.md`. |
| **F-ERRMSG** `errorMessage.test.mjs` | **Ship-blocker: raw database text must never reach a user.** | `const dirs = ['screens', 'components', 'hooks'];` and `readdirSync(join(root, dir)).filter((f) => /\.(ts\|tsx)$/.test(f))` — **NON-recursive**, minus a 4-entry `RAW_MESSAGE_ALLOWLIST`. |
| **F-JOBSUPD** `hardening.test.mjs` | No direct `jobs` UPDATE from the client. | `for (const dir of ['lib', 'hooks', 'screens', 'components']) walk(dir);` recursive, and deliberately including `*.web.*`: `The frozen *.web.* files are deliberately included: the invariant is the data layer's, not a styling rule, and no platform is exempt.` |
| **F-STEPMAP** `lifecycle.test.mjs` | One status→step map, in the canonical file. | `for (const dir of ['screens', 'components', 'ui', 'hooks', 'lib']) walk(dir);` recursive, minus `relPath === 'lib/jobLifecycle.ts'`. |
| **F-SQLENUM** `statusVocabulary.test.mjs` | App status literals match the migrations. | `readdirSync(join(root, 'supabase')).filter((f) => f.endsWith('.sql'))` — `supabase/` only, **non-recursive**, `.sql` only. |
| **F-MIGRATED** `themeTokens.test.mjs` | Migrated files never regain a literal. | A hand-maintained 31-entry `MIGRATED_FILES` array — **an explicit list, not a walk** — plus `ALLOWED_LITERALS`. |
| **F-STAR / F-L002** `themeTokens.test.mjs` | L-010 star paint; L-002 accent values. | `filesUnder(['screens', 'components', 'ui'])` for the star sweep; the L-002 fence is file-specific (`lib/jobs.ts`, executed `ui/tokens.ts`). |

**File-named fences (no tree scope, so no complement to scan):**
`buildGate` (production ref + key shape), `envParity`, `verifySchemaGuards`,
`pwa`, `governance`, `homeDesignStudio`, `verificationBadgeRemoved`,
`mediaUploader`, `phase76Shape`, and the ~35 behavioural suites
(`phoneOtp`, `setupOnboarding`, `voiceSearch`, `workerMatching`, `mode`,
`conversion`, `lifecycle`, `offer*`, `payments*`, …). These assert facts about
named files or executed modules; they are guards, but their "coverage
boundary" is the file list each names inline.

**Nothing is marked UNKNOWN.** Every guard above declares its scope in source
that this audit read directly. The single scope that is *not* a path boundary
is **GS-1** (`verify-schema.mjs`): its coverage is a human cadence, not a rule
the repo can enforce, and that is recorded as such rather than guessed at.

---

## (b) P1 — coverage holes with a real violation already in them

| # | Sev | Where | Symptom | Proposed fix |
|---|-----|-------|---------|--------------|
| G-001 | P1 | `ui/primitives/MediaUploader.tsx:123` → `screens/PostJobScreen.tsx:1030,1051` | **Raw Supabase Storage error text reaches a user-facing alert.** `uploadAsset()` (`lib/storage.ts:76,85`) returns the service's own `StorageError` — or a raw caught `fetch` exception — unwrapped; `MediaUploader` extracts `error?.message` and hands it to `onUploadError`, and PostJobScreen renders it verbatim: `onUploadError={(message) => void alertAsync('Photo upload failed', message)}`. This is precisely the class F-ERRMSG exists to stop ("Ship-blocker guard — raw database text must never reach a user"). It survives because **F-ERRMSG's `dirs` are `['screens','components','hooks']` and `ui/` is not among them** — the extraction happens one directory outside the sweep, and by the time the string reaches the scanned screen it is bound to a parameter named `message`, which the fence's `\w*[Ee]rr\w*\??\.message` needle cannot see. Two live mounts (photo + video). | Route the extraction through `userMessage()` at the `ui/primitives/MediaUploader.tsx` seam, and add `'ui'` to F-ERRMSG's `dirs` with a recursive walk. |
| G-002 | P1 | `tests/safety.test.mjs:48-50,296` vs `.github/workflows/ci.yml:20` | **The guard layer's own regression suite never runs in CI.** `const PLATFORM_SKIP = IS_WIN ? false : \`platform gate: ${process.platform} is not win32, enforcement is Windows-only\`;` gates `describe('agent safety guard', { skip: PLATFORM_SKIP }, …)`, which holds **120 of the 846 tests** — every executed proof that `guard.ps1`'s ten rules and the deny matrix still behave. CI is `runs-on: ubuntu-latest`, so CI runs 726 tests and skips exactly the 120 that protect the controls. A weakening edit to `guard.ps1` or `settings.json` is green on every PR and is caught only when the operator happens to run `verify` on Windows. | Not a code fix — a process one. Either add a Windows job to the CI matrix for that suite, or record the Windows-only cadence explicitly so nobody reads a green CI badge as "the guards were verified". |

---

## (c) P2 — coverage holes, latent boundaries, and recorded exceptions

| # | Sev | Where | Symptom | Proposed fix |
|---|-----|-------|---------|--------------|
| G-003 | P2 | F-HEX `roots`, complement `lib/` | The hex fence's six roots exclude `lib/`, and the complement holds **4 live colour literals with no token home**: `lib/hotspots.ts` map heat-tier strokes `#4FA8E8 #5EBB6B #EAB308 #DC2626` (= L-003, **live rendering path**). The other 86 literals in `lib/` are the two sanctioned token surfaces — `lib/theme.ts` (65) and `lib/authTheme.ts` (21) — which CLAUDE.md permits; but **nothing mechanical distinguishes "sanctioned token surface" from "any other file in `lib/`"**. `lib/jobs.ts` held 22 such literals until `1714fd8` and no guard ever saw them. | Give the four hotspot strokes a token home the way the category accents just got one, then extend F-HEX to `lib/` with `lib/theme.ts` and `lib/authTheme.ts` named as the token layer — not as an allowance for arbitrary literals. |
| G-004 | P2 | `lib/sharing.ts:96` → `components/PhotoViewer.tsx:78` | Same class as G-001 from a different source: `message: err instanceof Error ? err.message : 'Could not share this photo.'` is rendered by `alertAsync('Could not share', result.message)`. The text is an expo-sharing / Web Share exception rather than database output, so it leaks platform vocabulary rather than schema vocabulary — but F-ERRMSG cannot see it either, because `lib/` is outside its `dirs`. | Wrap at `lib/sharing.ts`, or widen F-ERRMSG to `lib/` (which its 15 complement hits make a larger decision than it looks — see G-007). |
| G-005 | P2 | `tsconfig.json` `"exclude"` | `supabase/functions/send-push/index.ts` and `supabase/functions/worker-search/index.ts` are **TypeScript that nothing in this repo type-checks**. They are Deno edge functions, so the Expo `tsc` config genuinely cannot check them — but no second checker exists either, and `verify` is silent about them. **Live server code, unchecked.** | Out of scope for a run that touches no Supabase surface. Record it; a Deno `check` step is the operator's call. |
| G-006 | P2 | `tests/errorMessage.test.mjs:82` | F-ERRMSG walks `readdirSync(join(root, dir))` **without** `{ recursive: true }`. `screens/`, `components/` and `hooks/` have no subdirectories today, so nothing is missed right now — but the ship-blocker's scope shrinks silently the first time anyone adds one. F-TOKENIMPORT (`screens/` only) and F-SQLENUM (`supabase/` only) carry the same non-recursive shape. | Add `{ recursive: true }` to all three. No expectation changes; the sweep simply stops being one `mkdir` from a hole. |
| G-007 | P2 | `lib/adapters/payments.ts:37,62,79,99,104` | The adapter re-types every Supabase error as `error: { message: string } \| null`, **structurally dropping `code`**. No raw text ships — every consumer (`CheckoutScreen`, `ApproveOrDisputeScreen`, `EarningsScreen`, `ReviewAndTipScreen`) routes through `userMessage(...)`, and `userMessage` fails safe without a code. But it classifies by `code` first, so adapter-borne errors land on the generic branch instead of the specific one (`PGRST116` → "not available", `23505` → "already", …). Degradation, not leakage. | Widen the adapter's error type to carry `code`, or note the trade-off where the type is declared. |
| G-008 | P2 | `tests/themeTokens.test.mjs` `MIGRATED_FILES` | A hand-maintained 31-entry list, not a walk. A file migrated to token reads after that list was written is protected by F-HEX (if it is in the six roots) but never joins this stricter sweep. The list cannot go stale loudly — nothing asserts it is complete. | Either derive it, or assert its membership rule so an omission fails. |
| G-009 | P2 | `components/HotspotMap.web.tsx:443` | `#e8eee9` map placeholder ground, invisible to F-HEX by its explicit `if (/\.web\.tsx?$/.test(path)) continue;` and unmodifiable by any run (frozen web surface, denied by GH-1 `"Edit(**/*.web.tsx)"` and GH-2 rule 4). (= L-009.) **Frozen surface, operator-owned.** | None available to a run. |
| G-010 | P2 | `dev-tools/HomeDesignStudio.tsx:107` | `#E8ECE9` studio chrome. `dev-tools/` is outside F-HEX, F-GOLD, F-RASTER and F-COPY; only F-MOTION and F-FAILOPEN reach it. Gated `__DEV__` + web + `?studio=home`, so it is **dead code in any production build**. (= L-008.) | None needed; recorded so the directory's thin coverage is on the record. |

---

## (d) Complement scans that came back clean

Each was scanned for the exact class its guard exists to prevent. All returned
zero hits — recorded so the empty result is a measured fact, not an omission:

| Guard | Complement scanned | Violation class searched | Hits |
|-------|--------------------|--------------------------|------|
| F-RASTER / F-ARTGATE | `hooks lib modes navigation dev-tools` + root files | `require('…png\|jpg\|webp\|gif')` | **0** |
| F-GOLD | `hooks lib modes navigation dev-tools` + root files | `backgroundColor: *.gold` | **0** |
| F-EMERALD F5 | `dev-tools` + root files | `accent.bg` / `categoryAccent(…).bg\|icon` | **0** |
| F-ERRREAD | everything outside `screens hooks components` | `if (active && !error)` | **0** |
| F-JOBSUPD | `ui modes navigation dev-tools` + root files | `.from('jobs').update(` | **0** |
| F-STEPMAP | `modes navigation dev-tools` + root files | raw `status: <digit>` map | **0** |
| F-MOTION | `*.web.tsx?` only (its scope is otherwise total) | `Animated` without a `useNativeDriver` decision | **0** |
| GR-1 | `tests/` files the glob cannot match | an orphan test file that never runs | **0** — `tests/pngGeometry.mjs` is the only non-matching file and is an imported helper, correctly not a suite. |
| F-HEX (named colours) | all 257 app files, not just the complement | CSS named colour as a colour-property value (`color: 'red'`, `tintColor="gold"`, …), `transparent` excluded | **0**, confirmed by an independent grep |

`F-TOKENIMPORT`'s complement holds five direct `ui/tokens` importers —
`lib/theme.ts`, `lib/ThemeContext.tsx`, `lib/authTheme.ts`, `lib/jobs.ts`,
`dev-tools/ComponentCatalog.tsx` — and **none is a violation**: the rule
CLAUDE.md states is screen-scoped ("never import `ui/tokens.ts` directly in a
new screen"), the first three are the token plumbing itself, `lib/jobs.ts`
takes `categoryAccents` from the definition layer as of `1714fd8`, and the
last is dev-only. The fence matches its rule exactly.

---

## (e) What was not reached

Named precisely, rather than sampled:

* **`dist/`** — build output, regenerated by `expo export`; not source, and
  denied to every run (`"Edit(/dist/**)"`).
* **`.shots/`** — gitignored screenshot bundle. It does contain the app's
  compiled palette (the `emeraldColors` export is visible in
  `.shots/web/_expo/static/js/web/index-*.js`), which is how the raw pass
  confirmed the export currently ships in the web bundle. Not source.
* **`public/` (6 literals in 1 file) and `hosting/` (0)** — counted, not
  itemised: both are the frozen web surface, unmodifiable by any run, and no
  fence claims them.
* **`node_modules/`, `assets/`, `design-reference/`, `docs/`,
  `project-audit/`, `hardening-report/`** — dependencies, binaries, reference
  material and prose. No guard claims them and none is expected to.
* **`supabase/*.sql`** — the ~80 migrations are covered by F-SQLENUM for
  status vocabulary and by `hardening.test.mjs` for grants/RLS. A full
  SECURITY DEFINER ACL sweep across every migration was **not** performed:
  it is a database-shaped audit, and this run touches no SQL.
* **The 35 behavioural suites** were enumerated and classified but their
  assertions were not re-derived — they are file-named, so they have no
  complement to scan.

---

*No fix is proposed as an action and no batch is opened — every row above is
a record. The operator selects what gets fixed.*
