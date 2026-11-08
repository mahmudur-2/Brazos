# Inventory B4: docs, root files, scripts, dev-tools, CI, assets

Reader: Sonnet 5.5 high. Branch `lean-v1`, HEAD `1e5b458` when counted (A1b already deleted `tests/safety.test.mjs`). Nothing was moved, edited or deleted. `.env*`, `start.ps1`, KEY/SECRET files were never read.

Counting rules: tracked files only (`git ls-files`). `docs/lean/` is untracked working material and is not counted (archive it at the end of the run). Bytes are on-disk sizes. "Referenced by" separates real uses (package.json script, workflow, a test that reads/imports/spawns the file) from comment-only citations (a code or SQL comment that names the path; harmless, but the path will dangle).

Proposal words: **keep** (stays as is or becomes one of the five), **fold into X** (1-3 lines move into X, then the file is archived), **archive** (move to `_archive/2026-11-lean/`), **list** (code/config another helper labels).

The five docs: README.md, CLAUDE.md, docs/ARCHITECTURE.md (today `docs/architecture.md`), docs/DECISIONS.md, docs/TESTING.md (new). Plus the one-page backlog (new).

---

## 1. Root files

| path | kind | what it is | referenced by | proposal | note |
|---|---|---|---|---|---|
| README.md (4,708 B) | active doc | App intro, stack, install, doc pointers | `AGENTS.md`, `docs/README.md` cite it; no test reads it | keep (one of five) | Rewrite pointers: it cites `docs/README.md`, GATES, SCOPE, architecture, archive/, design/, mockups/ (+ MANIFEST, PRESTIGE_RUN_REPORT, rejected/), handoff-archive/. Receives the v1 scope list from `docs/SCOPE.md`. |
| CLAUDE.md (4,485 B) | active doc | Project rules and invariants (money, offers, supabase, workflow) | tests: `governance` (needs `mainexpo`, `transition_job_status`, `accept_offer`, `job_locations`, the production ref literal), `docsBudget` (under 5,000 B, no `@` lines) | keep (one of five) | Cites GATES.md, LAUNCH_CHECK.md, docs/mockups/, docs/handoff-archive/, docs/STATE.md, v3, docs/README.md: all dangle after the move. Receives `AGENTS.md` reading order. Keep the production-ref literal (test). |
| HANDOFF.md (11,705 B) | active doc | Now / Blocked / Next / Revert for the next chat | tests: `docsBudget` (max 12,000 B), `governance` (no `HEAD:` stamp), `motion120` (message only) | keep, rewrite to one screen (plan H2) | NEEDS-JUDGE: not one of the five. Plan H2 and the project CLAUDE.md both name it; tests read it. Judge confirms it stays as a sixth file or folds into README. |
| AGENTS.md (1,346 B) | active doc | Reading order for an agent, "git owns state", derive Expo SDK from package.json | test: `governance` (reads it; asserts it mentions package.json and SDK, no pinned version) | fold into CLAUDE.md | Keep 3 lines: read CLAUDE.md then HANDOFF.md then only files the task touches; machine state comes from git; derive the Expo SDK from package.json, never hard-code. NEEDS-JUDGE: `governance.test.mjs` ACTIVE_DOCS must drop it. |
| DECISIONS.md (31,506 B) | archive | Append-only log of the phases 6-12 autonomous run (Aug 2026) | comment cites in 19 app files, 17 SQL, 11 tests (no test reads it) | archive | `docs/README.md` already calls it "older history". |
| BRAZOS_BUILD_STATE.md (444 B) | archive | Retired pointer stub to the old build log | tests: `governance` reads it (ACTIVE_DOCS); comment cites in `lib/navigation.ts`, `ui/primitives/index.ts`, `tests/crossTabNavigation` | archive | Remove from `governance` ACTIVE_DOCS. |
| PROD_APPLY.md (4,158 B) | archive | Production migration queue, self-labelled SUPERSEDED, do not apply | `docs/README.md` only | archive | Header says phases 59-75 absent; prod is a rebuild from a staging dump. |
| PROD_APPLY_READY.sql (69,528 B) | archive | Staged production SQL, self-labelled DO NOT APPLY | `docs/README.md` only | archive | Largest root file. |
| PROD_VERIFY.sql (1,804 B) | archive | Read-only sentinel check for the phase 51-58 apply | `docs/README.md` only | archive | Superseded header. |
| REVIEW_GUIDE.md (3,949 B) | archive | Device checklist built on `seed-phase-6.sql` accounts | `docs/README.md`, `scripts/seed-review.mjs`, `scripts/lifecycle-proof.mjs` | archive | Candidate source for TESTING.md only if judge wants a manual walk list. |
| WEB_DEPLOYMENT.md (1,224 B) | archive | How the Expo web/PWA build deployed | `docs/README.md`, CLAUDE.md names the frozen web surface; comment in `lib/appLinks.ts` | archive | Owner decision: web/PWA goes. |
| LICENSE (1,127 B) | config | License text | none | keep | |
| .env.example (2,955 B) | config | Example env names (not read, per limits) | package/docs | keep | Name only. |
| .gitattributes (19 B) | config | `*.sql text eol=lf` | none | keep | |
| .gitignore (2,057 B) | config | Ignore rules | none (test `chatDocuments` mentions the string only) | keep, edit later | Prune entries for archived machinery: `.audit-scratch/dispatch/`, `commit-msg.txt` comment about the guard, `.shots/`, `design-reference/` (keep `_archive/`, `start.ps1`, `.env`). |
| .nvmrc (3 B) | config | Node major (24) | `.github/workflows/ci.yml`, `pgtap.yml`; test `governance` | keep | |
| tsconfig.json (160 B) | config | Extends expo base, strict | test `chatComposer` reads it | keep | |
| babel.config.js (884 B) | config | `babel-preset-expo` only | test `motion120` reads raw text | keep | |
| metro.config.js (1,280 B) | config | Sentry debug-id serializer | build | keep | |
| eas.json (1,361 B) | config | EAS profiles: development, preview, production, e2e-test | package.json `release:testflight`, `update:preview`; tests `buildGate`, `maestroFlows`, `pwa`, `appConfig` | keep | Android buildType keys remain (Android slice may trim). |
| package.json (3,569 B) | config | Scripts and 54 deps + 7 devDeps | CI (`npm ci`, `npm run verify`) | keep | After the move these scripts point at archived files: `build:web` (prepare-sites-build.mjs), `demo:refresh` (scripts/demo-link). `i18n:extract` goes with the i18n slice. |
| package-lock.json (513,380 B) | config | Lockfile | CI `npm ci` | keep | |
| App.tsx, index.ts, app.config.ts (20,679 + 315 + 11,163 B) | code (list) | App entry and Expo config | many tests read `app.config.ts` | list | `app.config.ts` has a `web:` block (favicon) and an `android:` block (adaptiveIcon uses `assets/icon.png`). |
| start.ps1 | config | Local launcher, git-ignored | none tracked | keep (name only) | Untracked; Glob found no file in the checkout. UNKNOWN if it exists elsewhere. Never read. |

---

## 2. docs/ top level (13 tracked files)

| path | kind | what it is | referenced by | proposal | note |
|---|---|---|---|---|---|
| docs/architecture.md (24,714 B) | active doc | Implemented architecture, 17 sections, from source | tests `governance` (ACTIVE_DOCS), `legacyAggregateFence` (comment); README, AGENTS, docs/README, CLAUDE.md | keep: becomes docs/ARCHITECTURE.md | Rename is case-only: on Windows `git mv` needs a two-step rename. Update `governance` path. Receives DOMAIN, phone-auth, dispute lines (section 8). |
| docs/DECISIONS.md (19,805 B) | decision record | 111 one-line decisions in force (9 Aug, 98 Sep, 4 Oct) | test `docsBudget` (max 40,000 B); comment cites in 12 app, 4 edge, 15 SQL files, 9 tests | keep (one of five) | NEEDS-JUDGE: 66 of the 111 rows (D-20260908-1 to D-20260929-4) are UI taste rulings (nav bar 70, Lux glass, filter sheet radii) tied to mockups. Judge trims to rules still true of the code. Its "Full text" column points to `docs/archive/DECISIONS-2026-10.md` (178,215 B), which this run would archive. |
| docs/DOMAIN.md (6,158 B) | reference | State machines, tables, RPC contracts, product rules (pointers) | `docs/DECISIONS.md`, `docs/README.md` | fold into docs/ARCHITECTURE.md | See section 8. Product rules half goes to DECISIONS. |
| docs/SCOPE.md (7,788 B) | active doc | v1 list, "not in v1", "built already" flag roster | test `notificationFeed` (message only); comment cites in `lib/pricingMode.ts`, `send-receipts`, 6 SQL, staging.yml; CLAUDE.md names it "binding" | fold into README.md | Keep: iOS only, one neighbourhood, loop, the 15 "In v1" bullets, "Adding a line needs a dated DECISIONS entry". The "Built already" section (flags LIVE_LOCATION, DOCUMENTS, HIDDEN_CHATS, TRANSLATION, voice, design studio, web, Android) becomes false as deletion slices land: do not carry it over. |
| docs/BACKLOG.md (40,678 B) | active doc | Unscheduled work: v1 bugs, v1.2, side backlog, verify-landed, analytics gaps | tests (comment only) x6, 5 app files, 3 SQL; CLAUDE.md names it | fold into the one-page backlog | Source for the new page: "v1 bugs" (lines 5-18) and "Parked, operator decisions" (line 195). The R7/R7D/R8b sections are history. |
| docs/BRAZOS_TARGET_ARCHITECTURE_v3.md (99,243 B) | reference | Roadmap v3: stack snapshot, DB sections, run queue, backlog, D-1..D-16 | test `maestroFlows` (comment); `.eas/workflows/e2e-ios.yml` (comment); AGENTS, CLAUDE.md, README, docs/README | fold into docs/DECISIONS.md (+ ARCHITECTURE) | Take section 2.2 decisions (section 8). D-12 ("Android is a shipping target") is overridden by D-20260831-1: do not copy. Sections 1.2.1 and 1.3 contracts partly to ARCHITECTURE. Run queue = history. |
| docs/GATES.md (2,050 B) | process machinery | Gate 3 (TestFlight) open boxes | CLAUDE.md names it "binding"; README; comment in `scripts/shots.mjs` | archive | Ruling worth one line already lives in SCOPE: no feature outside v1 list. CLAUDE.md line 13 and 49 must be edited. |
| docs/HUMAN-STEPS.md (13,749 B) | process machinery | Inventory of operator steps in the dispatch pipeline | `docs/README.md` | archive | |
| docs/LAUNCH_CHECK.md (4,242 B) | process machinery | Pre-run checklist for overnight dispatch, autonomy contract, harness how-to | CLAUDE.md (2 cites), docs/README, `scripts/dispatch/*`, `scripts/home-shots.mjs` (comment) | archive | CLAUDE.md cites it twice. |
| docs/PROJECT-CHAT.md (9,486 B) | process machinery | Mirror of the claude.ai project instruction box | test `governance` (ACTIVE_DOCS) | archive | Remove from `governance`. |
| docs/README.md (10,247 B) | process machinery | Classifies every doc file | tests `docsBudget` (comment), `fixRunA` (asserts it matches `/dispute-resolution\.md/`), `governance` (ACTIVE_DOCS) | archive | Update `fixRunA` line 65 and `governance`. |
| docs/phone-auth-activation.md (5,511 B) | reference | How to turn on SMS sign-in (mock vs real) | `lib/phoneAuth/supabase.ts` (comment), docs/README | fold into docs/ARCHITECTURE.md | NEEDS-JUDGE: plan decision 5 says Twilio Verify via Supabase dashboard now; check what in the doc is stale. |
| docs/LEAN-SHIP-PLAN.md (24,191 B, modified in tree) | plan | This run's plan | the run | archive (at run end) | Not before Phase H. |

### docs/ subfolders (rolled up)

| path + count | kind | what it is | referenced by | proposal | note |
|---|---|---|---|---|---|
| docs/mockups/ (352 files, 102,304,484 B) | mockup or render | 35 numbered PNGs, 289 `html/` mockups + build scripts, 10 `refresh/`, 12 `rejected/`, 6 `directions/`, manifest + run report | test `emeraldFences` line 1592 reads `docs/mockups/44_customer_home_dark.png`; test `authPhone` line 374 only excludes `docs/mockups/html/lux/` from a scan; comment cites in 25 app files, 9 tests, 4 scripts | archive | Owner decided. 94% of all bytes in scope. Delete or rewrite the `emeraldFences` pixel fence at line 1592 first. |
| docs/device-captures/ (66, 5,095,678 B) | mockup or render | `2026-08-22-dark/` real-device screenshots | `docs/README.md` | archive | Screenshot folder. |
| docs/brand-source/ (1, 1,887,276 B) | asset | `brazos-logo-source.png`, logo master | `docs/README.md`; `.gitignore` says the shipping copy is in `assets/brand/` | archive | |
| docs/archive/ (61, 2,066,454 B) | archive | Retired plans, audits, `DECISIONS-2026-10.md` (178,215 B), closed gates, `dispatch/`, `hardening-report/`, `project-audit/`, `root-audits/`, `diagnostics/` | test `governance` (comment: exempt); `lib/offerNavigation.ts` cites a path; 6 kept docs cite it | archive | NEEDS-JUDGE: `DECISIONS-2026-10.md` is the only "why" behind the 111 decision rows; moving it out of git breaks the "Full text" pointers. |
| docs/handoff-archive/ (18, 268,298 B) | archive | Per-run HANDOFF records + `2026-10-HANDOFF-full.md` (165,791 B) | HANDOFF.md, CLAUDE.md, docs/README | archive | |
| docs/audit/ (17, 419,340 B) | archive | Dated audit sweeps 2026-08-21/22 | comment only: tests `errorMessage`, `themeTokens`; `ui/tokens.ts`, `MediaUploader.tsx` | archive | |
| docs/audits/ (14, 405,526 B) | archive | One report per consequential run | comment only: `emeraldFences`, `projections`, `stage4dInvariants`; `scripts/verify-schema.mjs` | archive | `tests/safety.test.mjs` (which wrote a report here) is already gone. |
| docs/emerald-v2/ (15 files total, 250,667 B; this row = 14 files) | archive | v2 redesign plan + its DECISIONS.md | comment only: `themeTokens`; 4 app files | archive | |
| docs/emerald-v2/ARCHITECTURE_DECISION_job_offers.md (the 15th file) | archive | Why `job_offers` replaced bids/requests | comments in `phase43`, `phase46` SQL | archive | `docs/architecture.md` section "Offers, one negotiation model" already states the model. |
| docs/proposed/ (8, 56,155 B) | process machinery | Drafted guard hooks test, `lean-settings.json`, apply scripts, rule copies | HANDOFF.md, docs/README | archive | `lean-settings.json` and `apply-lean-settings.ps1` were applied in A1; `rules/*.md` duplicate `.claude/rules/`. |
| docs/dispatch/ (3, 92,025 B) | process machinery | FIX-RUN, LUX-LIST-3, MOTION-INVENTORY briefs | tests mention them in comments only (12 tests); `scripts/dispatch/*` | archive | `fixRunA.test.mjs` line 3 comment only. |
| docs/design/ (1, 3,009 B) | archive | EMERALD_COMPLAINTS.md draft | README.md, docs/README | archive | |
| docs/cleanup/ (1, 10,032 B) | archive | 2026-08-22 repo inventory | docs/README | archive | |
| docs/runbooks/dispute-resolution.md (4,146 B) | active doc | Operator procedure for a reported issue (SQL + promise) | test `fixRunA` lines 58-65 reads it; `screens/ApproveOrDisputeScreen.tsx` comment | fold into docs/ARCHITECTURE.md | See section 8. NEEDS-JUDGE: the "find open reports" SQL query has no home in five docs. `fixRunA` must change. |
| docs/runbooks/app-review.md (4,854 B) | active doc | How to get Apple's reviewer through post, bid, pay | none | fold into docs/TESTING.md | 3 lines (section 8). Its production-migration steps are stale. |
| docs/runbooks/phase67-account-deletion.md (9,129 B) | archive | Apply log for the phase67 migration (applied to staging 2026-08-14) | comment in `phase75` SQL | archive | |

---

## 3. scripts/ (45 files)

Keep rule: a script stays only if package.json, a workflow or a test calls it. "Called" = script entry, workflow step, or a test that imports or spawns it. Tests that only read its source text are counted too, and marked.

| path | kind | what it is | referenced by | proposal | note |
|---|---|---|---|---|---|
| scripts/eas-build-pre-install.mjs (12,406 B) | script | EAS build gate: pins each profile to one Supabase project | package.json `eas-build-pre-install`; test `buildGate` imports and spawns it | keep | |
| scripts/supabase-ref.mjs (2,837 B) | script | Shared Supabase project-ref parsers | imported by `eas-build-pre-install.mjs`, `verify-schema.mjs`, `demo-link/lib.mjs`; tests `appConfig`, `demoLink`, `envParity`, `maestroFlows`, `verifySchemaGuards` import it | keep | |
| scripts/staging-scan.sh (15,152 B) | script | Destructive-migration tripwire for staging | `.github/workflows/staging.yml` (steps at lines ~175-217); comments in 22 migrations and `.claude/rules/supabase.md` | keep | |
| scripts/verify-schema.mjs (93,809 B) | script | Asks a live Supabase DB what exists (manual probe) | tests import it (`phase76Shape`, `verifySchemaGuards`) and read its text (`counterResponse`, `envParity`, `lifecycle`, `messagingLock`, `mode`, `phase77Shape`); not in package.json or a workflow | keep | NEEDS-JUDGE: called only by tests, and only text-fences matter in 8 of them. It is a manual live-DB probe, 94 KB. pgTAP could replace it; archiving means rewriting 8 tests. |
| scripts/demo-link/ (6 files, 38,441 B) | script | Exports the web app, runs a robot, deploys a demo link | package.json `demo:refresh`; test `demoLink` reads `lib.mjs`, `refresh.mjs`, `robot.mjs`, `frame.html` | archive | NEEDS-JUDGE: package.json calls it, but it exports and deploys the web surface (owner: web goes). Needs package.json edit and deleting `tests/demoLink.test.mjs`. |
| scripts/prepare-sites-build.mjs (1,407 B) | script | Copies the web build and `hosting/sites-worker.js` into `dist/server` | package.json `build:web`; test `pwa` reads it | archive | Web surface. Remove `build:web` and `tests/pwa.test.mjs`. |
| scripts/shots.mjs (67,340 B) | process machinery | Web screenshot harness (393x852, dark and light) | test `shotHarness` spawns `--list` and reads its text; comments in `hooks/usePressFeedback.ts`, `lib/designOverrides.ts`, `LitSurface.tsx`, `.maestro/screens-walk.yml` | archive | NEEDS-JUDGE: a test spawns it, but it is screenshot machinery (owner: screenshots go). Delete `tests/shotHarness.test.mjs`. |
| scripts/home-shots.mjs (1,813 B) | process machinery | Home entry for `shots.mjs` | comment in `HomeScreen.tsx`, `docs/LAUNCH_CHECK.md`, `scripts/shots.mjs`, test `secureSessionStorageFence` (comment) | archive | |
| scripts/home-diff.mjs (2,069 B) | process machinery | Measures a render against mockup 44 | comments in `emeraldFences`, `pngGeometry.mjs` | archive | |
| scripts/master-diff.mjs (47,995 B) | process machinery | Generalised render-vs-master diff | comment in `HomeScreen.tsx`, `LitSurface.tsx`, `litSurface` test | archive | |
| scripts/atmosphere-tune.mjs (18,019 B) | process machinery | Rewrites `home-atmosphere-dark.png` by measurement | comment in `themeResolution` test | archive | |
| scripts/home-ground-blend.mjs (9,523 B) | process machinery | Blends the dark Home ground and hero | comment in `themeResolution`; HANDOFF.md | archive | Reads `assets/prestige/home-ground-blend.json`. |
| scripts/dispatch/ (4 files, 49,354 B) | process machinery | `chainA.ps1`, `dispatch.ps1`, `make-bundles.ps1`, `night2.ps1` overnight launchers | docs only (LAUNCH_CHECK, HUMAN-STEPS) | archive | Owner decided. |
| scripts/generate-icons.ps1 (2,455 B) | script | One-off icon resizer | docs only | archive | |
| scripts/build-areas-seed.mjs (31,464 B) | script | Generates `phase78_areas_seed.sql` from NYC data | comment in the generated SQL | archive | Output already committed. |
| scripts/lifecycle-proof.mjs (20,172 B) | script | Staging end-to-end lifecycle proof (two accounts) | comments in `supabase/tests/020_lifecycle.sql`, REVIEW_GUIDE | archive | Replaced by pgTAP `020_lifecycle.sql`. |
| scripts/rls-probe-offers.mjs (10,801 B) | script | Staging RLS probe for offers | comment in `supabase/seed.sql`, `seed-phase-6.sql` | archive | |
| scripts/seed-review.mjs (11,171 B) | script | Seeds review jobs on staging | REVIEW_GUIDE, PROD_APPLY | archive | |
| scripts/reset-test-user-password.mjs (7,336 B) | script | Local admin: reset one test user password | docs/archive only | archive | Uses a service-role value at run time (never in the file). |
| scripts/staging-acl-bootstrap.sql (2,177 B) | script | One-time staging grants fix | root DECISIONS.md, PROD_APPLY | archive | |
| scripts/phase5..12, 60..63, 66-proof.sql (13 files, 131,103 B) | script | Staging proofs per old phase | comment in `supabase/tests/010_offers.sql`, `_helpers.sql`; docs | archive | pgTAP files under `supabase/tests/` replaced them. |
| scripts/seed-phase-6, 7, 8, 9.sql (4 files, 22,562 B) | script | Staging seeds for dead phases | comment in `supabase/seed.sql`; REVIEW_GUIDE, PROD_APPLY | archive | |

---

## 4. dev-tools/ (46 files)

| path | kind | what it is | referenced by | proposal | note |
|---|---|---|---|---|---|
| dev-tools/ComponentCatalog.tsx (18,177 B) | code (list) | In-app component catalog screen | `navigation/sharedStacks.tsx` (lazy require); tests `mediaUploader`, `mode`, `fixRunF` | list | Part of the design-studio/dev-tools slice (another helper labels it). |
| dev-tools/HomeDesignStudio.tsx (5,850 B) | code (list) | Home design studio screen | `App.tsx` (flag `SHOW_HOME_DESIGN_STUDIO`); tests `homeDesignStudio`, `fixRunF` | list | Same slice. |
| dev-tools/README.md, Setup-Launchers.ps1, `launchers/` (14 .lnk), `icons/` (14 .ico), `scripts/` (14 .bat) (44 files, 131,467 B) | process machinery | Windows desktop launchers: start, build, test, git checkpoint | nothing but each other; many tests list `dev-tools` only as a scan directory | archive | Not called by package.json, workflows or tests. |

---

## 5. CI, config folders, web surface, modes

| path + count | kind | what it is | referenced by | proposal | note |
|---|---|---|---|---|---|
| .github/workflows/ci.yml (3 files total, 19,954 B) | CI | lint + tests on push/PR | test `governance` fences it | keep | Section 10 for all three. |
| .github/workflows/pgtap.yml | CI | pgTAP on a local Supabase stack | test `governance` fences it | keep | |
| .github/workflows/staging.yml | CI | verify, migrate, deploy to staging | calls `scripts/staging-scan.sh` | keep | No test fences it. |
| .eas/workflows/e2e-ios.yml (2 files, 3,946 B) | CI | EAS: simulator build, then Maestro money walk | test `maestroFlows` reads it and every file under `.eas/` | keep | Plan Phase F rewrites. Comment names v3 D-10. |
| .eas/workflows/screens-walk-ios.yml | CI | EAS: simulator build, then Maestro screens walk | `maestroFlows` (all `.eas/` files) | keep (NEEDS-JUDGE) | Plan F2 splits flows by screen; judge decides if the screens walk survives. |
| .maestro/money-walk.yml, sign-in.yml, screens-walk.yml (3 files, 28,609 B) | CI | Maestro flows (551 / 132 lines + sign-in) | tests `maestroFlows` (readdir on `.maestro/`), `pricingMode` (reads money-walk) | keep | Phase F base. |
| .openai/hosting.json (96 B) | config | Vendor hosting project id from the PWA deploy | docs/README | archive | Web surface. |
| hosting/sites-worker.js (1 file, 3,142 B) | script | Web worker for the PWA host | test `pwa`; `prepare-sites-build.mjs` | archive | Delete `tests/pwa.test.mjs` first. |
| public/ (8 files, 500,849 B) | asset | PWA shell: index.html, manifest.json, sw.js, config.js, robots.txt, 3 PNG icons | test `pwa` reads manifest, index.html, sw.js, 3 PNGs; `fixRunF` names two URLs only (strings) | archive | Owner decided. |
| dist/ (0 tracked; 97,845,130 B on disk) | asset | Expo web export output, git-ignored | `.gitignore` | archive (disk) | Regenerable build output. NEEDS-JUDGE: move to `_archive/` or delete. |
| design-reference/ (0 tracked; 112,500,178 B on disk) | mockup or render | Supplied auth-flow design comps, git-ignored | `.gitignore`; test `analyticsPrivacy` skip-list only | archive (disk) | Owner decided. Only copy exists on this disk, so move, never delete. |
| modes/ (6 files, 30,733 B) | code (list) | ModeGuard, ModeProvider, index, modeStorage, perspective, types | app code | list | Another helper labels. |

---

## 6. assets/ (29 files)

| path | kind | what it is | referenced by | proposal | note |
|---|---|---|---|---|---|
| assets/brand/app-icon-b-leaf.png (1,225,679 B) | asset | App icon for all three variants | `app.config.ts` lines 61-63; `screens/LaunchScreen.tsx`; tests `appConfig`, `launchMark`, `pwa`, `themeResolution` | keep | |
| assets/brand/brazos-b-leaf.png (453,236 B) | asset | In-app logo mark | `components/BrandLogo.tsx`; test `themeResolution` | keep | |
| assets/brand/customer-home-chair.png (58,629 B) | asset | Old Home hero | none (`HomeScreen.tsx` comment: "required by nothing") | archive | |
| assets/brand/transition-worker.png (1,759,959 B) | asset | Old mode-transition sheet | only the mockup builder `docs/mockups/html/lux/lux.build.mjs` (comment in `themeResolution`) | archive | |
| assets/favicon.png (8,852 B) | asset | Web favicon | `app.config.ts` line 136 (`web` block); `scripts/generate-icons.ps1` | archive | NEEDS-JUDGE: goes with the `web` block deletion. |
| assets/icon.png (1,635,946 B) | asset | Android adaptive-icon foreground | `app.config.ts` line 112 (android block); test `pwa` | keep | NEEDS-JUDGE: only Android uses it; archive if the Android slice lands (`pwa` test goes anyway). |
| assets/fonts/PlayfairDisplay-Bold.ttf (193,720 B), OFL.txt (4,449 B) | asset | Serif font and its license; loaded by nothing (`lib/theme.ts` comment) | test `themeTokens` line 409 asserts the only font file is this one | archive | NEEDS-JUDGE: edit that assertion first or the test fails. |
| assets/glyphs/ (8 files, 23,985 B): drill, drill-fill, roller, roller-fill, trash, trash-fill, home-flat, home-outline-flat | asset | Category and tab icons | `components/CategoryGlyph.tsx`, `MeltTabBar.shared.tsx`, `ui/primitives/BottomNav.tsx`; test `themeResolution` | keep | |
| assets/prestige/hero_armchair_customer_lamp_dark.webp (51,492 B), lamp_light.webp (58,136 B) | asset | Customer Home hero, dark and light | `screens/HomeScreen.tsx` 169-170; test `themeResolution` | keep | |
| assets/prestige/hero_toolbox_worker.webp (239,420 B) | asset | Worker Home hero | `screens/WorkerHomeScreen.tsx` line 80; tests `themeResolution`, `workerHome` | keep | |
| assets/prestige/hero_armchair_customer_glow_dark.png, glow_light.png, shadow_dark.png, shadow_light.png (4 files, 7,341 B) | asset | Soft layers under the hero | `screens/HomeScreen.tsx` 171-174; test `themeResolution` | keep | |
| assets/prestige/hero_armchair_customer_lamp_dark.png (261,042 B), lamp_light.png (273,838 B), hero_toolbox_worker.png (1,483,022 B) | asset | PNG masters of the shipped WebPs | app: none; tests `emeraldFences` (lamp PNGs, lines 1459-1516), `themeResolution` (roster masters) | archive | NEEDS-JUDGE: tests read pixels from these. Rewrite or delete those fences first. |
| assets/prestige/home-atmosphere-dark.png (3,818,236 B) | asset | Retired Home background raster | tests `emeraldFences` lines 1573, 1929; scripts (archived) | archive | NEEDS-JUDGE: same fence; app does not mount it (D-20260927-3). Largest asset. |
| assets/prestige/home-atmosphere-dark.webp (96,724 B), home-ground-blend.json (475 B) | asset | WebP twin and tuning data of the above | `themeResolution` (comment: GONE 2026-09-27); `scripts/home-ground-blend.mjs` | archive | |

---

## 7. Docs that are not archived (what survives, in one list)

README.md, CLAUDE.md, docs/ARCHITECTURE.md (renamed), docs/DECISIONS.md, docs/TESTING.md (new), a one-page backlog (new), HANDOFF.md (NEEDS-JUDGE). Everything else under `docs/` and every root `*.md`/`*.sql` is folded or archived.

---

## 8. What to fold, by target (1-3 lines each)

**Into README.md** (from docs/SCOPE.md): iOS only, one neighbourhood; loop "post, bid (sealed), accept = fund, work, complete, release, review"; the 15 "In v1" bullets; the "Not in v1" list; "adding a line needs a dated DECISIONS entry".

**Into CLAUDE.md** (from AGENTS.md): read CLAUDE.md, then HANDOFF.md, then only the files the task touches; branch, HEAD and tree come from git, not a document; derive the Expo SDK from `package.json`, never hard-code (governance test checks these words).

**Into docs/ARCHITECTURE.md**
- From docs/DOMAIN.md: job `open → assigned → in_progress → completed` with `transition_job_status()` the only mover and `accept_offer()` the only assignment path; offers are one `job_offers` chain, RPC-write-only, sealed; payment = ledger is the state machine, no work before `held`; table/RPC owner table for `jobs`, `job_offers`, `payments`, `job_locations`; `accept_bid()` and `respond_job_request()` are deprecated shims.
- From docs/BRAZOS_TARGET_ARCHITECTURE_v3.md: webhook response rule (section 1.3.1), the `create-payment` contract (1.3.2), the staging pipeline summary (1.4).
- From docs/phone-auth-activation.md: `EXPO_PUBLIC_PHONE_AUTH_MODE=mock` generates an on-device code, cannot run in a release build; real mode swaps the `lib/phoneAuth/` implementation behind one boundary.
- From docs/runbooks/dispute-resolution.md: the app promises a reply by email within 2 business days; while a report is open the payment stays held (`transfers_due` excludes it, 72-hour auto-release does not run); resolution is manual and service-role only.

**Into docs/DECISIONS.md** (from v3 section 2.2, minus stale D-12 and D-13): D-1 sealed bids; D-2 "held in protection" vocabulary; D-3 fee 750 bps each side, $1.00 worker minimum, tips 100% to worker, a rate change is a new `fee_schedule` row; D-4 `charge_amount_cents` is the price, `quote_job_price()` the only arithmetic; D-5 capture at hire, ledger gate in `transition_job_status`; D-6 no change-order payment kind; D-7 cancelled job terminal; D-8 applied migrations never rewritten; D-9 edge-function house style (plain `fetch`, no amount computed); D-10 EAS e2e workflow dispatch-only; D-11 client stays untyped; D-14 one completion photo required; D-15 `payout.paid` unhandled. Also from DOMAIN: address lives in `job_locations` (owner + hired worker).

**Into docs/TESTING.md** (from docs/runbooks/app-review.md): the Apple reviewer needs two accounts because `jobs.client_id <> bidder` is enforced; credentials live only in App Store Connect; production steps in that runbook are stale. Plus the Maestro/EAS material the plan says Haiku writes in F5.

**Into the one-page backlog** (from docs/BACKLOG.md): "v1 bugs" (lines 5-18: $92.50 vs $100 take, missing approved-payout copy, "Brazos sandbox" Stripe account name, key roll, ActionSheet accessibility), the v1.2 list (lines 19-39), and "Parked, operator decisions" (line 195).

---

## 9. Paths that `tests/*.test.mjs` read or fence (so deletion helpers know what to update)

Method: grep of non-comment test lines for `docs/`, `scripts/`, `.github`, `.maestro`, `.eas`, `public/`, `hosting/`, `assets/`, `dev-tools/`, and root file names. "read" = the test opens the file; "import" / "spawn" = runs code; "scan" = enumerates a directory.

| path | test(s) and line | how | what breaks if archived |
|---|---|---|---|
| CLAUDE.md | `governance` 51; `docsBudget` 28 | read | needs `mainexpo`, `transition_job_status`, `accept_offer`, `job_locations`, the production ref literal; under 5,000 B; no `@` lines |
| AGENTS.md | `governance` 32, 72 | read | whole test group (ACTIVE_DOCS + "derives SDK from package.json") |
| HANDOFF.md | `governance` 33, 124; `docsBudget` 14 | read | max 12,000 B; no `HEAD:` stamp line |
| docs/architecture.md | `governance` 34 | read | rename to ARCHITECTURE.md breaks the path (stale-term scan) |
| docs/README.md | `governance` 35; `fixRunA` 65 | read | `fixRunA` asserts it matches `/dispute-resolution\.md/` |
| docs/PROJECT-CHAT.md | `governance` 36 | read | |
| BRAZOS_BUILD_STATE.md | `governance` 37 | read | |
| docs/DECISIONS.md | `docsBudget` 15 | read | max 40,000 B |
| docs/runbooks/dispute-resolution.md | `fixRunA` 58, 60 | read | exists + content assertions |
| .github/workflows/ci.yml, pgtap.yml | `governance` 210, 248-254 | read | no secrets, `node-version-file: .nvmrc`, pgTAP only on local stack |
| .nvmrc | `governance` 212, 281-288 | read | must equal running Node major |
| .maestro/ (all files), .eas/ (all files), .maestro/money-walk.yml, sign-in.yml, .eas/workflows/e2e-ios.yml | `maestroFlows` 37-39, 50-53, 195-196; `pricingMode` 286 | read, scan | credential-free fence over every flow and workflow file |
| eas.json | `buildGate` 278-391; `maestroFlows` 179; `pwa` 181; `appConfig` | read | profile shape |
| app.config.ts | `appConfig`, `connect`, `dictation`, `liveCard`, `maestroFlows`, `payouts`, `pwa`, `sessionGaps`, `stripePayments`, `supportContact`, `themeTokens`, `voiceSearch` | import | web and android blocks asserted by `pwa` |
| scripts/eas-build-pre-install.mjs | `buildGate` 12, 20 | import, spawn | |
| scripts/supabase-ref.mjs | `appConfig` 8; `demoLink` 7; `envParity` 129; `maestroFlows` 32; `verifySchemaGuards` 21 | import | |
| scripts/verify-schema.mjs | import: `phase76Shape` 10, `verifySchemaGuards` 18; read: `counterResponse` 262, `envParity` 16-114, `lifecycle` 399, `messagingLock` 307, `mode` 634, `phase77Shape` 75-87 | import, read | 8 tests |
| scripts/demo-link/{lib,refresh,robot}.mjs, frame.html | `demoLink` 6, 48-70 | import, read | whole file `demoLink.test.mjs` |
| scripts/prepare-sites-build.mjs, hosting/sites-worker.js, public/manifest.json, index.html, sw.js, apple-touch-icon.png, icon-192.png, icon-512.png | `pwa` 23-28, 73-75 | read | whole file `pwa.test.mjs` |
| scripts/shots.mjs | `shotHarness` 42, 158-498 | spawn, read | whole file `shotHarness.test.mjs` |
| assets/icon.png, assets/brand/app-icon-b-leaf.png | `pwa` 72-117 | read | |
| docs/mockups/44_customer_home_dark.png | `emeraldFences` 1592 | read | pixel fence |
| assets/prestige/hero_armchair_customer_lamp_dark.png, lamp_light.png, home-atmosphere-dark.png | `emeraldFences` 1459-1573, 1929 | read | pixel fences |
| assets/prestige/*.webp, glow/shadow PNGs, hero_toolbox_worker.png, assets/glyphs/*, assets/brand/brazos-b-leaf.png, app-icon-b-leaf.png | `themeResolution` 511-588, 631, 650, 925-931 (roster); `workerHome` 264 | read | the roster asserts add/remove of every mounted raster; masters are `lamp_*.png`, `hero_toolbox_worker.png` |
| assets/fonts/PlayfairDisplay-Bold.ttf | `themeTokens` 409 | scan | asserts it is the only font file under `assets/` |
| dev-tools/HomeDesignStudio.tsx, ComponentCatalog.tsx | `homeDesignStudio` 19; `mediaUploader` 74; `mode` 614-615; `fixRunF` 20-40 | read | tied to the design-studio slice |
| dev-tools (scan dir name only) | `blurBoundary`, `chatComposer`, `haptics`, `liveCard`, `motion120`, `motionDriver`, `paymentsMode`, `remoteImage`, `secureSessionStorageFence`, `stripePayments`, `themeTokens`, `voiceSearch`, `legacyAggregateFence`, `supportContact`, `copyTruth`, `errorHonesty` | scan | none if the folder is missing (scans skip) |
| babel.config.js; tsconfig.json | `motion120` 1727-1770; `chatComposer` 1348 | read | |
| all tracked files | `governance` 158 (secret scan), `authPhone` 374 (phone-number scan, excludes `docs/mockups/html/lux/`, `docs/dispatch/`) | scan | none; archived files just leave the scan |
| docs/BACKLOG.md, docs/SCOPE.md, docs/dispatch/*, docs/audit*, docs/emerald-v2/*, docs/mockups/html/*, docs/archive/ | many tests | comment or message string only | none (checked: no non-comment read) |

Already gone: `tests/safety.test.mjs` (deleted in A1b) used to guard `public/index.html`, `start.ps1` and `scripts/verify-schema.mjs` strings.

---

## 10. The three GitHub workflows

- **ci.yml** ("CI"): on push and pull request to `mainexpo` and manual run; `npm ci`, then `npm run verify` (lint + `node --test tests/*.test.mjs`) on ubuntu, 15 min; secrets: none.
- **pgtap.yml** ("pgTAP"): on push to `mainexpo` touching `supabase/migrations/**`, `supabase/tests/**`, `supabase/seed.sql`, `supabase/config.toml` or itself, and manual run; `npx supabase start`, `npm run db:reset`, `npm run db:test`, `supabase stop` on a local Docker stack, 30 min; secrets: none.
- **staging.yml** ("Staging pipeline"): on push to `mainexpo` touching migrations, edge functions or `supabase/config.toml`, and manual run (input `allow_destructive`); three ordered jobs: `verify` (same as ci.yml), `migrate` (link, list, `scripts/staging-scan.sh`, push migrations), `deploy` (deploy every edge function); runs in environment `staging`; secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` (deploy uses the first two only).

EAS workflows (not GitHub): `.eas/workflows/e2e-ios.yml` and `screens-walk-ios.yml`, both `workflow_dispatch` only; use environment `preview` with `MAESTRO_E2E_CUSTOMER_EMAIL`, `MAESTRO_E2E_CUSTOMER_PASSWORD`, `MAESTRO_E2E_WORKER_EMAIL`, `MAESTRO_E2E_WORKER_PASSWORD`.

---

## 11. Summary

Scope: 1,498 tracked files in the repo; this inventory covers 742 (docs 573, root 25, scripts 45, dev-tools 46, `.github` 3, `.maestro` 3, `.eas` 2, `.openai` 1, `public` 8, `hosting` 1, `assets` 29, `modes` 6; `dist/` and `design-reference/` have 0 tracked files). The other 756 (components, lib, hooks, screens, ui, navigation, supabase, tests, types, config, .claude) belong to other helpers.

Counts per proposal (files / bytes):

| proposal | files | bytes |
|---|---|---|
| keep | 46 | 4,464,160 (package-lock 513,380; assets 3,695,235; scripts 124,204; CI/config the rest; docs 44,519) |
| fold, then archive the source | 8 | 169,724 (docs 7 files 168,378; AGENTS.md 1,346) |
| archive | 677 | 122,114,353 (about 116.5 MiB) |
| list (code/config, not labelled here) | 11 | 86,917 |

Of the 677 archived: docs 564 files / 112,932,038 B (mockups alone 352 / 102,304,484 B), assets 11 / 7,958,946 B, public 8 / 500,849 B, scripts 41 / 475,202 B, dev-tools launchers 44 / 131,467 B, root 7 / 112,613 B, hosting 3,142 B, `.openai` 96 B. Docs only: 2 keep (44,519 B), 7 fold (168,378 B), 564 archive. On-disk but untracked: `dist/` 97,845,130 B and `design-reference/` 112,500,178 B.

Scripts that stay: `eas-build-pre-install.mjs` (package.json + `buildGate`), `supabase-ref.mjs` (imported by the first, by tests, by `verify-schema`), `staging-scan.sh` (`staging.yml`), `verify-schema.mjs` (tests only). 41 archive.

Docs proposed for folding: DOMAIN, phone-auth-activation, runbooks/dispute-resolution into ARCHITECTURE; SCOPE into README; AGENTS into CLAUDE.md; v3 into DECISIONS (plus contracts into ARCHITECTURE); runbooks/app-review into TESTING; BACKLOG into the one-page backlog.

### NEEDS-JUDGE (all)

1. HANDOFF.md is not one of the five but plan H2 and tests keep it.
2. AGENTS.md fold: `governance.test.mjs` asserts on it.
3. docs/SCOPE.md "Built already" roster becomes false as slices land; carry only the v1 list. CLAUDE.md calls SCOPE and GATES "binding".
4. docs/DECISIONS.md: 66 of 111 rows are UI taste rulings (Sep 8 to Sep 29); trim to rules still true.
5. `DECISIONS-2026-10.md` (178,215 B) is the only "why" behind those rows; archiving breaks the "Full text" pointers.
6. v3 D-12 (Android shipping) is overridden by D-20260831-1; v3 D-13 (runs push to mainexpo) conflicts with the lean merge flow.
7. `scripts/verify-schema.mjs`: keep (tests) vs archive (live-DB manual probe; 8 tests read it).
8. `scripts/demo-link/`, `prepare-sites-build.mjs`: package.json and tests call them, but they are web surface. Needs package.json edit plus deleting `demoLink` and `pwa` tests.
9. `scripts/shots.mjs`: spawned by `shotHarness.test.mjs`; screenshot machinery.
10. `.eas/workflows/screens-walk-ios.yml` and `.maestro/screens-walk.yml`: survive Phase F or not.
11. `assets/icon.png` (Android only) and `assets/favicon.png` (web only) follow the Android and web slices.
12. `assets/prestige` PNG masters, `home-atmosphere-dark.png`, `docs/mockups/44_customer_home_dark.png`, `PlayfairDisplay-Bold.ttf`: tests read them (`emeraldFences`, `themeResolution`, `themeTokens` 409); fences must be rewritten first.
13. `docs/runbooks/dispute-resolution.md` is read by `fixRunA`; its operator SQL has no home among five docs.
14. `docs/phone-auth-activation.md` may be stale after the Twilio Verify decision.
15. `dist/` (disk only): move or delete; `design-reference/`: move only.
16. `docs/LEAN-SHIP-PLAN.md`, `docs/lean/` and `docs/proposed/lean-settings.json`: archive only after Phase H.
17. Renaming `docs/architecture.md` to `ARCHITECTURE.md` is case-only: two-step `git mv` on Windows, update `governance`.
18. 57 app/edge files and 36 supabase files cite `docs/` paths in comments; they will dangle (no test impact).
19. `start.ps1`: untracked; Glob found no file; existence UNKNOWN.
