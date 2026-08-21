# 14 — FIX QUEUE

Every finding from domains 01–13, consolidated and ranked. **Nothing here was applied.**

**Severity:** P0 = crash, security exposure, data loss, or secret leak · P1 = product invariant violation · P2 = correctness or UX defect · P3 = hygiene.

**Owner class:**
- **DIAL** — a taste value the operator tunes live with Fast Refresh. Exact file, line, current value, and a sensible *range*. No final value is proposed.
- **STRUCTURE** — a code change for an agent run.
- **SCHEMA** — a **new** corrective migration, hand-applied by the operator in the SQL Editor. **Never rewrite an applied migration.**
- **OPERATOR** — requires the operator personally: a device test, a push, Metro, a credential, a protected control, or a product decision.

---

## Totals

| Severity | Count |
|-|-|
| **P0** | **3** |
| **P1** | **19** |
| **P2** | **25** |
| **P3** | **33** |
| **Total** | **80** |

| Owner class | Count |
|-|-|
| **STRUCTURE** | **41** |
| **OPERATOR** | **26** |
| **DIAL** | **7** |
| **SCHEMA** | **6** |

---

## P0 — 3 findings

### F-001 · Baseline is RED: 10 failing tests block every other batch
**`01_environment.md` Finding #1** · **VERIFIED** · **DIAL**

`npm run verify` exits 1: 799 tests, **789 pass, 10 fail**. `tsc` is clean; `node --test` is not. All 10 trace to four **uncommitted** working-tree edits, confirmed literal-by-literal against `git show HEAD:<path>`.

| file | line | current | test expects |
|-|-|-|-|
| `ui/tokens.ts` | `:137` `forest` | `'#1B3527'` | `'#1E3A2C'` |
| `ui/tokens.ts` | `:145` `bg` | `'#02110D'` | `'#03110E'` |
| `ui/tokens.ts` | `:139` `gold` | `'#D4A24C'` | — |
| `ui/tokens.ts` | `:141-142` `mint`/`mint2` | `'#0E1F18'`/`'#254539'` | — |
| `ui/tokens.ts` | `:146` `surface` | `'#0A1813'` | — |
| `lib/homeDesignStudio.tsx` | `:20` `heroFontSize` | `33` | `31` — **range 28–56** |
| `lib/homeDesignStudio.tsx` | `:23` `searchHeight` | `65` | `70` — **range 44–96** |
| `screens/HomeScreen.tsx` | `:254` `HERO_ART_DARK.top` | `70` | `35` |
| `screens/HomeScreen.tsx` | `:254` `HERO_ART_DARK.right` | `-33` | `-28` |
| `screens/HomeScreen.tsx` | `:935` `modeSwitchDark` | `'#6A736C'` | `colors.homeSlate` |
| `screens/HomeScreen.tsx` | `:1152` `heroHeadlineDark` | `19`/`30` | `18`/`28` |

**NEEDS OPERATOR DECISION** — (a) the new values are truth → the 8 fences and 2 bake assertions get re-derived, or (b) they are experimental → the operator reverts (agents are forbidden from reverting).

**Not a taste dial:** failures 9 and 10 (`tests/themeResolution.test.mjs:563, 607`) say the replaced `assets/prestige/hero_armchair_customer.png` *"is claimed opaque-dark but carries alpha down to 0."* That is a **baked-artwork contract violation** — re-flatten the PNG onto the dark ground; do not relax the assertion.

**No other batch can be honestly validated until this is resolved.**

---

### F-002 · `public.payments` — RLS never enabled by any migration
**`08_security_schema.md` §B.2** · **VERIFIED** · **SCHEMA**

A repo-wide grep for RLS enablement on `payments` returns **zero hits** in `.sql`, `.md` or `.mjs`. Its only SELECT policy is also in no migration. Both exist only as prose at `supabase/phase50_sandbox_payments_and_offer_lifecycle.sql:167-171`.

`phase50:174` grants `select on public.payments to authenticated` — safe **only** while RLS is on and the payer/payee policy exists. If RLS were ever off (a restore, a rebuild from a schema export, a hand-run `disable row level security`), **every payer, payee and amount row becomes readable by any signed-in user.**

**Nothing can detect that.** `08_security_schema.md` §J.8: `verify-schema.mjs` never reads `relrowsecurity` and never enumerates `pg_policies`; `13_tests.md` §5.1: no test executes SQL.

**Fix:** a new `phase76_*.sql` that asserts `relrowsecurity` on `payments` and **raises if false**, adds `create policy if not exists` for the payer/payee boundary so it is version-controlled, and adds both to `verify-schema.mjs`.

---

### F-003 · `verify-schema.mjs` has no production guard
**`08_security_schema.md` §J.2** · **VERIFIED** · **STRUCTURE**

`envParityProblems()` (`scripts/verify-schema.mjs:73-95`) compares the three project refs **only against each other**. There is no check refusing a particular ref. **Point `.env` at production and it probes production.** A missing `toolingRef` is only a *warning* (`:119-123`), so with `SUPABASE_DB_URL_STAGING` unset the comparison silently does not happen.

This contradicts CLAUDE.md's first Supabase rule — *"Production is never contacted, read or write — mechanically blocked."* It is blocked for **agents** (the `.claude/` guard matrix stopped this audit from even reading `eas.json`) but **not** for this script run by a human with a mis-pointed `.env`.

**Fix:** import `STAGING_REF` / `PRODUCTION_REF` from `scripts/eas-build-pre-install.mjs:44,46` — which already has them — and hard-refuse the production ref. **The single highest-value one-line hardening in the repo.**

---

## P1 — 19 findings

### F-004 · `job_request_parties_ok()` lost its `pg_temp` pin
`08_security_schema.md` §E.1 · **VERIFIED** · **SCHEMA**
`supabase/phase68_deleted_at_authorization.sql:102` — `set search_path = public`, no `pg_temp`. **A regression of `phase64:72`**, which had already fixed it; `CREATE OR REPLACE … SET` replaces `proconfig`. No live exploit (the body has no unqualified relation references), but **the invariant is false and re-running phase64 would abort at its own post-condition**. Fix: one `alter function … set search_path = public, pg_temp;` in the next corrective migration.

### F-005 · `phase22`/`phase23` mass-delete every job, bid and review with no guard
`08_security_schema.md` §H.1 · **VERIFIED** · **SCHEMA**
`phase22_job_listings_seed.sql:77-84` and `phase23_realistic_job_seed.sql:108-115` (byte-identical) `delete from public.jobs/bids/reviews where … not in (protected_job_ids)`. No environment precondition, no ref check, no row-count sanity check. **Applied to production they would delete the marketplace.** Fix: a `raise exception` precondition, mirroring the discipline phase50 and phase75 already show.

### F-006 · `verify-schema.mjs` exits 0 on an unmigrated database
`08_security_schema.md` §J.5–J.6 · **VERIFIED** · **STRUCTURE**
`:1471-1477` — an unmet sentinel prints `PENDING` and suppresses its whole group; `:1501` exits 0. **A completely unmigrated database passes.** Separately, `checkColumnRevoked` (`:150-160`, **23 assertions**) passes on *any* non-2xx, so a 404 "table missing" is indistinguishable from a 403 "secured" — and `payments` is one of those 23, compounding F-002.

### F-007 · "Smart matching is on" — AI/matching language in shipped copy
`02_invariants.md` §I-19 · **VERIFIED** · **STRUCTURE**
`screens/HomeScreen.tsx:532` — `accessibilityLabel="Smart matching is on"`. A screen reader announces it verbatim. **Present at `HEAD`**; the uncommitted diff changed only the icon `name` from `"sparkles"` to `"arrow-forward"`, leaving the label. The icon change is the tell — the sparkles glyph was the visual half of the same idea. One line.

### F-008 · Client-side `jobs.status` writer, defended by a test
`02_invariants.md` §I-13, `08_security_schema.md` §B.3, `13_tests.md` §6.1 · **VERIFIED** · **STRUCTURE**
`lib/jobStatusCompatibility.ts:117-124` writes `jobs.status` from the client, reached from `lib/jobs.ts:628-630`. CLAUDE.md: *"Never set `assigned_worker_id` or `status` from the client."*
**The discriminating check named in domain 02 was run in domain 08: `jobs` has no UPDATE policy and no UPDATE grant to `authenticated`. The path is dead — not exploitable.** It is still a P1 to remove, because `tests/hardening.test.mjs:156-159` **asserts it exists**, so the test and the invariant contradict each other and no future run can resolve that alone. Fix: delete the module and the branch, and **invert** the test assertion in the same commit. **NEEDS OPERATOR DECISION** on whether any deployment target still lacks the RPC.

### F-009 · 30 hardcoded hex literals outside the two sanctioned token files
`02_invariants.md` §I-7 · **VERIFIED** · **STRUCTURE** (22) + **DIAL** (8)
**STRUCTURE** — `lib/jobs.ts:70-80` (11 `bg` + 11 `icon` = 22 values, `JOB_CATEGORY_ACCENTS`) and `lib/hotspots.ts:32-35` (4 density strokes). These are *categorical* scales, not brand taste, and `lib/jobs.ts`'s map **has no dark variant** — `screens/HomeScreen.tsx:764` already ignores `accent.bg` under dark. Move both into `ui/tokens.ts` as named `categorical`/`density` scales with light and dark values: satisfies the invariant *and* fixes the missing dark half.
**DIAL** — `screens/HomeScreen.tsx:935` `'#6A736C'` (**uncommitted**, part of F-001) · `screens/VerifyPhoneScreen.tsx:519,523` `'#7A5A18'` · `components/AuthNotice.tsx:31,50` · `components/ModeTransitionOverlay.tsx:449` `'#FFF3D6'` · `dev-tools/HomeDesignStudio.tsx:107` `'#E8ECE9'`.
**DO NOT TOUCH** — `components/HotspotMap.web.tsx:443` (frozen web surface) · `screens/BrowseJobsScreen.tsx:45` (dead — resolved by F-023).

### F-010 · 10 live interactive elements below the 44pt floor with no `hitSlop`
`02_invariants.md` §I-8 · **VERIFIED** · **DIAL**
`ui/tokens.ts:379-380` declares `minTouchTarget: 44` — *"non-negotiable"* — and it is referenced in exactly one file.

| file:line | style | current | range |
|-|-|-|-|
| `screens/WorkChecklistScreen.tsx:199` | `itemMain` | 32 | **44–56** |
| `components/CategoryAccordion.tsx:118` | `otherAddBtn` | 34×34 | **44–48** |
| `components/QuickReplies.tsx:75` | `CHIP_HEIGHT` (=18+7·2+2) | 34 | **44–52** |
| `screens/ProfileDetailsScreen.tsx:190` | `chip` | 34 | **44–52** |
| `screens/ProfileScreen.tsx:527, 737` | `hubChip` | 34 | **44–52** |
| `components/JobFilterSheet.tsx:85, 118` | `chip` | 36 | **44–52** |
| `screens/SavedWorkersScreen.tsx:166` | `hireButton` | 40 | **44–56** |
| `screens/WorkerProfileScreen.tsx:407` | `serviceBook` | 40 | **44–56** |

Plus 8 **probable** by padding arithmetic (`PastWork.tsx:240`, `PortfolioPicker.tsx:409,445`, `CategoryAccordion.tsx:53,75`, `ReactionPicker.tsx:53`, `ServicesPricingScreen.tsx:334`, `ComponentCatalog.tsx:433`) and 2 dev-only (`HomeDesignStudio.tsx:68,80`, 42×42).
`screens/BrowseJobsScreen.tsx:228, 370` are in dead code — resolved by F-023, not by adding `hitSlop`.

### F-011 · `servicePriceLabel()` re-implements `formatBudget()` verbatim
`10_dead_code.md` §C1 · **VERIFIED** · **STRUCTURE**
`lib/services.ts:103-111` contains a byte-identical copy of `lib/jobs.ts:663-667`'s body, and `lib/services.ts` never imports `formatBudget` — its only import is `./supabase`. CLAUDE.md: *"formatted **only** through `formatBudget()`."*
**This corrects `02_invariants.md` §I-1**, which reported the invariant clean: that scan looked for bypass *idioms* (`toFixed(2)`, `Intl.NumberFormat`) and found none, because this bypasses by **re-implementing**. Both scans were right about what they measured.

### F-012 · Five job-status vocabularies — P3-31 is not held
`10_dead_code.md` §C2, `09_docs_drift.md` D-2 · **VERIFIED** · **STRUCTURE**
`lib/jobLifecycle.ts:71` (canonical) · `lib/jobStage.ts:28` · `ui/primitives/StatusPill.tsx:69` · `components/StatusBadge.tsx:13` · `components/JobProgress.tsx:5` (duplicating `trackStepIndex()`). Plus a character-identical title-caser in two files, and **raw `status === '…'` ladders in 12 screens** — `screens/ClientJobDetailScreen.tsx` **ten times**, in a file that already imports and calls both derivations. `ui/primitives/StatusPill.tsx:19-22` admits *"They converge in Phase 3"*; Phase 3 never happened. **This settles `02_invariants.md` §I-17 as a VIOLATION.**

### F-013 · `useLegalGate` fails OPEN
`04_data_binding.md` §4, `10_dead_code.md` §F(b) · **VERIFIED** · **OPERATOR** then **STRUCTURE**
`hooks/useLegalGate.ts:29-32` — on a failed acceptance read it logs *"allowing through"* and sets `'accepted'`. A network blip lets a user past a blocking legal gate, with a console line as the only record.
**NEEDS OPERATOR DECISION** — a compliance call, not an engineering one: (a) keep failing open but **persist** the bypass so it is auditable and re-gates, or (b) fail closed with a retry surface. An agent must not choose.

### F-014 · Zero `React.memo` in the entire codebase
`12_performance.md` §G.3 · **VERIFIED** · **STRUCTURE**
Independently confirmed: `\bmemo(` (excluding `useMemo(`), `PureComponent`, `shouldComponentUpdate` return **nothing** across the whole scope. `ThemeContext` has **115 consumers**, `useAuth` 45; there is no boundary to stop propagation. The 8 hot row components — `WorkerJobCard`, `BrowseJobCard`, `HubCard`, `ConversationRow`, `WorkerResultCard`, `ChatBubble`, `OfferCard`, `ui/primitives/JobCard` — are the target. **`React.memo` alone is worse than nothing here:** the inline `onPress` props (§B) must be stabilized in the same change or every comparison fails.

### F-015 · `MyJobsHubScreen` renders 4 unbounded lists in a plain `ScrollView`
`12_performance.md` §A.2 · **VERIFIED** · **STRUCTURE**
`screens/MyJobsHubScreen.tsx:294` wraps `.map()` at `:382, 412, 450, 503`. Every `HubCard` for every job, posted job, pending bid and settled bid mounts at once, each with a remote thumbnail. **The largest structural list risk in the app.**

### F-016 · 2.24 MB of unreferenced assets + resolution oversizing
`12_performance.md` §D, `10_dead_code.md` §D · **VERIFIED** · **STRUCTURE**
Orphans: `assets/brazos-logo-source.png` (1,887,276 — design master, **move out of `assets/`, do not delete**), `splash-icon.png` (254,638 — `app.json` has no `splash` key), `android-icon-foreground/background/monochrome.png` (100,485 — the config points elsewhere).
Oversizing: `hero_toolbox_worker.png` 1329×885 for a 162×108 pt slot (**~2.7×**), `brazos_b_drape.png` 918×753 for ~63 pt (**~4.9×**), `brazos-b-leaf.png` at 1.73 B/px. **~6–8 MB of 13.89 MB recoverable with no code change.**

### F-017 · 11 hardcoded `useNativeDriver: true` — breaks the web target
`02_invariants.md` §I-30, `12_performance.md` §H.1 · **VERIFIED** · **STRUCTURE**
`components/PhotoViewer.tsx:137,138,139,167,176,178,290` · `components/PulseDot.tsx:31,37` · `screens/HomeScreen.tsx:334,335`. All animate `opacity`/`transform`, so the swap to `Platform.OS !== 'web'` is mechanical. **Fix F-054 in the same batch or it recurs** — the three offending files are exactly the three that never declared the constant.

### F-018 · `architecture.md`'s theme section is an entire stage stale
`09_docs_drift.md` D-1 · **VERIFIED** · **OPERATOR**
`docs/architecture.md:116-122` claims *"the provider returns the light palette unconditionally"*, *"no `useColorScheme()`/Appearance read anywhere"*, *"no stored preference"*, and *"app.json keeps `userInterfaceStyle: "light"`"*. **Every clause is false.** An agent reading the document CLAUDE.md names as the owner of implemented architecture would conclude dark mode does not exist. Corrected text drafted in D-1.

### F-019 · `architecture.md`: "no screen re-derives any of it" is false
`09_docs_drift.md` D-2 · **VERIFIED** · **OPERATOR**
`docs/architecture.md:183-189`. Contradicted by F-012. Corrected text drafted in D-2, including an explicit KNOWN DEBT paragraph.

### F-020 · CLAUDE.md's "Locked — never modify" section contradicts itself
`09_docs_drift.md` D-7 · **VERIFIED** · **OPERATOR**
`CLAUDE.md:78-82` — the heading appears twice (second escaped, `\##`), the content says *"None. All screens unlocked"* immediately followed by a bare file path, and that path is a **dead screen**. CLAUDE.md declares the locked list a **non-negotiable protected control** four lines later. **A protected control whose content is ambiguous cannot be enforced.** Corrected text drafted in D-7. *(Also: this run's dispatch carries a **different** locked list than CLAUDE.md's — a separate NEEDS OPERATOR DECISION.)*

### F-021 · The mockup manifest presents 12 REJECTED masters as numbered authority
`09_docs_drift.md` D-12, `07_ui_fidelity_inventory.md` §4 · **VERIFIED** · **OPERATOR**
`BRAZOS_MOCKUP_MANIFEST.md` gives numbered headings (33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 45, 46) to twelve files that exist on disk **only under word-named filenames** — and `HANDOFF.md:11-21` records that **the operator REJECTED exactly those twelve** as an over-ornate render pass, *"Never cite one to justify a change."* The two lists are set-identical.
**The risk is concrete:** `HANDOFF.md:7-9` ranks the manifest as binding design authority. An agent reading the manifest without the HANDOFF warning will implement a rejected design believing it is following the highest authority. Banner text drafted in D-12.

### F-022 · Six dark-palette values have drifted apart
`05_theme_parity.md` §3 · **VERIFIED** · **STRUCTURE** (sequence after F-001)
`lib/theme.ts`'s `darkColors` mirrors 17 `ui/tokens.ts` `dark` values — 13 by reference (drift-proof), **6 by hex literal**. The uncommitted token edit moved the token and not the copy:

| `lib/theme.ts` | line | holds | mirrored | now |
|-|-|-|-|-|
| `primary` | `:147` | `#1E3A2C` | `dark.forest` | `#1B3527` |
| `primarySoft` | `:149` | `#11241C` | `dark.mint` | `#0E1F18` |
| `homeBackground` | `:167` | `#03110E` | `dark.bg` | `#02110D` |
| `background` | `:176` | `#03110E` | `dark.bg` | `#02110D` |
| `surface` | `:180` | `#0E1D17` | `dark.surface` | `#0A1813` |
| `successBg` | `:189` | `#11241C` | `dark.mint` | `#0E1F18` |

`lib/theme.ts:144-146` states *"the primary role IS emeraldDark.forest"* — that identity is now false. `screens/HomeScreen.tsx:863` says `background` and `bg` are *"one ground"* — they no longer are, which is how a visible seam appears.
**The tests do not catch this** — `emeraldFences.test.mjs:1436` asserts on `dark.bg` alone. Resolving F-001 by re-deriving fences leaves this in place **silently**. Fix: make all six references, matching the 13 that already are.

---

## P2 — 25 findings

| ID | Finding | file:line | Owner | Domain |
|-|-|-|-|-|
| **F-023** | **Dead screen, 583 lines** — `BrowseJobsScreen` imported by nothing, registered in neither tree, still marked LOCKED. Drags `useWorkerAvailability` and (separately) `useChat` with it. **Ten test files read its source as text**, so deletion must update them in the same commit | `screens/BrowseJobsScreen.tsx`, `hooks/useWorkerAvailability.ts`, `hooks/useChat.ts` | STRUCTURE | 10 §A1-A3 |
| **F-024** | **"High demand in your area"** asserts geography the computation never checks — `similarPostedToday()` filters on **category and calendar day only**, no distance term | `screens/HomeScreen.tsx:820` / `:263-273` | STRUCTURE | 02 §I-6 |
| **F-025** | `lib/authTheme.ts` is an undocumented **third token surface** (17 hexes, 23 importers, plus parallel `authRadius`/`authSpacing`/`authSizes`/`authType`/`authShadows`). Deliberate and defensible — CLAUDE.md just does not record the exception | `CLAUDE.md:67-70` | OPERATOR | 02 §I-25 |
| **F-026** | **10 errors silently discarded** by `if (active && !error)`. **Two are dispute reads feeding `deriveJobLifecycle`** — a failed read is indistinguishable from "no dispute", so a network error shows a normal job progressing to auto-release | `TrackWorkerScreen:67,70`, `ClientJobDetailScreen:223,226,245`, `JobDetailScreen:334,339`, `ProfileDetailsScreen:71`, `useJobOwnerActions:61`, `ReviewSection:244` | STRUCTURE | 04 §3 |
| **F-027** | `TrackWorkerScreen` has **no loading and no error state** — renders `ready` from the first frame with three fetches outstanding, then reflows | `screens/TrackWorkerScreen.tsx:95-117` | STRUCTURE | 04 §2 |
| **F-028** | **`expo-constants` imported but undeclared** — resolves only by npm hoisting. `npm run verify` **structurally cannot catch it** (tsc resolves through `node_modules` regardless). Add `"expo-constants": "~18.0.13"` — the exact SDK 54 pin, changes no installed bytes | `lib/pushNotifications.ts:3` / `package.json` | OPERATOR (needs a lockfile regen) | 11 §B |
| **F-029** | **20 hand-written `as { … }` row shapes** with no compile-time or schema check. `lib/payments.ts:226` casts to a local `PaymentStatus` union that then flows into money labels. `lib/jobFilters.ts:78` is the honest one (`unknown` + narrow) — the pattern the other 19 should follow | `lib/` × 20 | STRUCTURE | 04 §8 |
| **F-030** | `fetchOpenJobs()` has **no `.limit()`** — fetches every open job in the marketplace on every Home mount, to render 4 cards, with realtime prepending to the same unbounded array | `lib/jobs.ts:302-310` | STRUCTURE | 04 §10 |
| **F-031** | **4 navigation `as unknown as { … }` casts** bypass the param-list type. `ChatScreen:929` casts params to bare **`object`** — any object satisfies it | `JobDetailScreen:920,940`, `SubmitBidScreen:82`, `ChatScreen:929` | STRUCTURE | 03 §6 |
| **F-032** | O(rows × offers): `threadOffers.filter(...)` **inside `renderItem`**, allocating a fresh array so `OfferCard` gets a new `chain` identity every render | `screens/ChatScreen.tsx:1038` | STRUCTURE | 12 §B |
| **F-033** | Filter + sort + slice over the whole open-jobs feed **in the render body**, unmemoized, on a screen with ~8 pieces of local state. Every sibling screen memoizes the equivalent | `screens/JobDetailScreen.tsx:196-204` | STRUCTURE | 12 §F.1 |
| **F-034** | `similarPostedToday(jobs, job)` called **per card** — 4 × n ISO date parses per render | `screens/HomeScreen.tsx:683` | STRUCTURE | 12 §F.3 |
| **F-035** | 8 of 9 `FlatList`s have **no windowing config**. The three that grow unbounded: `ChatScreen:992`, `ProfileReviewsScreen:144`, `MessagesInboxScreen:334` | see 12 §A.1 | STRUCTURE | 12 §A.1 |
| **F-036** | **472 KB byte-identical PNG shipped twice** from one file (MD5 `f814001256…`). **Not a simple merge** — the two paths encode a dark-only-vs-light gate decision, and both are pinned by tests | `assets/{brand,prestige}/brazos_b_drape.png`, `HomeScreen:61,79` | OPERATOR (decision) then STRUCTURE | 10 §D4 |
| **F-037** | **`primary`/`background` = 1.56:1 in dark.** `primary` is a **fill** — buttons, chips, chat bubbles. The label is readable (10.57) but the **button's shape is not**. WCAG 1.4.11 failure on the app's most important control. Compounded by F-022 (it is a *stale* forest) | `lib/theme.ts:147` vs `:176` | DIAL — needs ≥3:1, range `#2A5540`–`#3A6B52` | 05 §4.4 |
| **F-038** | **`textSubtle` in light — 2.32:1 on `background`, 2.62:1 on `surface`.** A text token used for tertiary captions, failing both thresholds badly. Dark is fine (5.32). **The clearest single accessibility defect found** | `lib/theme.ts:82` (`#9AA38F`) | DIAL — needs ≥4.5:1, range `#6B7566`–`#7C8672` | 05 §4.4 |
| **F-039** | `worker-search` edge function silently sends the **service-role key as `apikey`** on the user-identity path if `SUPABASE_ANON_KEY` is unset. `?? ''` defaults make it silent. **This file is excluded from `tsc`** — no gate reads it | `supabase/functions/worker-search/index.ts:153` | STRUCTURE | 08 §K.2 |
| **F-040** | 7 tables deny `authenticated` writes via **RLS-with-no-policy** while still holding the CREATE-time grant. Safe today; the grants do not tell the truth | `job_requests`, `direct_threads`, `job_disputes`, `banned_phones`, `blocks`, `mutes` | SCHEMA | 08 §B.4 |
| **F-041** | `useNativeDriver: false` on an **opacity-only** animation, in a file that already defines and correctly uses the constant at `:28`/`:91` | `screens/SetupScreen.tsx:127,132` | STRUCTURE | 12 §H.2 |
| **F-042** | **35 error paths where `console.*` is the only handling.** User-visible consequences: a lost draft (`postJobDraft:110`), permanent silent push failure (`usePushNotifications:39`), pushes continuing after sign-out (`pushNotifications:276`), a tapped notification doing nothing (`notificationRoutes:222`), silent cross-device mode desync (`ModeProvider:269`), four storage leaks | see 10 §F(b) | STRUCTURE | 10 §F |
| **F-043** | "Rendered code frame" on Live Nearby — **NOT REPRODUCIBLE from this tree.** Reading (a) *app renders source text* is **ruled out** (no monospace font, no source renderer, text exists only as a comment a production bundle strips). Reading (b) *a stale bundle's LogBox frame* is plausible — the quoted line numbers point at where those comments sat **20 commits ago** | — | OPERATOR — force a clean bundle, reload, reopen Home with real jobs; if it survives, capture the **current** line numbers | 07 §5 |
| **F-044** | `architecture.md`: *"the locked Customer Home dispatches `navigate('Map')`"* — `home(9)` removed that dispatch; grep finds one hit, in a past-tense comment. The **conclusion** (Map stays registered) is still right, for the reason the code gives | `docs/architecture.md:76-78` | OPERATOR | 09 D-3 |
| **F-045** | `architecture.md` describes the dark palette as **v1** (*"gold primary with a dark `onForest`"*); `ui/tokens.ts:139-148` records that **v2 inverted exactly that**, and `dark.onForest` is `#F1EDE1` — cream | `docs/architecture.md:108-109` | OPERATOR | 09 D-4 |
| **F-046** | `HANDOFF.md` claims **"799 pass / 0 fail / exit 0"**. True at `9789f97`; the tree is red now from uncommitted edits. An agent will misattribute the 10 failures to its own work | `HANDOFF.md:36-38` | OPERATOR — banner drafted in D-10 | 09 D-10 |
| **F-047** | **"escrows" ships in the Terms of Service.** Used as a *negation* (*"not a payment Brazos holds, guarantees, escrows, or collects"*), and `docs/audits/STAGE4D_AUDIT.md:76` already flagged it as pre-existing. The state machine itself is clean and test-guarded | `lib/legal/termsOfService.ts:79` | OPERATOR — legal copy; an agent must not silently rewrite it | 02 §I-2 |

---

## P3 — 33 findings

| ID | Finding | Owner |
|-|-|-|
| **F-048** | `eas.json:12` commits a Supabase **anon/staging** JWT. Not a leak (anon keys are publishable and already ship in the bundle) but it pins a staging credential into build config a production profile also reads. *Note: the repo's own guard blocked this session from re-reading the file — the control working correctly* | OPERATOR |
| **F-049** | `worker_services.price_cents` is **client-writable money with no ceiling** — `phase53:73` grants full DML, `lib/services.ts:88-89` writes it, and phase75's ceilings cover `jobs`/`job_offers`/`payments` but not this table | SCHEMA |
| **F-050** | `PROD_APPLY_READY.sql` — 69 KB, runnable, **17 phases stale**, self-labelled DO NOT APPLY, tracked at the repo root. Move to `docs/archive/` | OPERATOR |
| **F-051** | Dev tools ship in every release bundle: `App.tsx:25` imports `HomeDesignStudio` **unconditionally** (render gated, import not); `sharedStacks.tsx:44` the same for `ComponentCatalog` (19.5 KB). Matters more once the studio grows to ~30 knobs | STRUCTURE |
| **F-052** | `USE_NATIVE_DRIVER` redeclared in **13 files**, no shared export. **The duplication IS the mechanism** by which F-017 drifted — the three offending files are the three that never declared it | STRUCTURE |
| **F-053** | 16 remote `<Image>` sites omit `resizeMode`; `components/Avatar.tsx:21` has **no `onError`**, so a failed avatar draws a blank tinted square instead of the initials block two lines away. Five components already do this correctly | STRUCTURE |
| **F-054** | `ui/primitives/EmptyState.tsx` has **zero screen consumers**; 17 surfaces hand-roll the empty block and 20 hand-roll a centred spinner. Its own docstring says it exists to prevent exactly this | STRUCTURE |
| **F-055** | **Four job-card implementations**; the §I canonical `ui/primitives/JobCard.tsx` renders on **zero screens** (only the dev catalog). `components/WorkerJobCard.tsx` is canonical by usage | STRUCTURE |
| **F-056** | **124 exports with no importer** — 13 unused even inside their own file, 37 over-exported, 77 type-only. Caveat: many are exported because a `.mjs` test greps the name, and those tests read **text**, so the `export` is cargo | STRUCTURE |
| **F-057** | **Two phone display formatters with divergent output** — `lib/phone.ts:7` → `"(555) 123-4567"` (one importer), `lib/phoneNumber.ts:120` → `"555 123 4567"`. The same number renders two ways depending on the screen. Two validators too | STRUCTURE |
| **F-058** | `lib/compareBids.ts:32 knownRating()` is the canonical "a rating is null, never zero" rule and **zero rendering surfaces call it**; 8 re-derive `?? 0`, two of them near-byte-identical. A marketplace-honesty rule with an unused implementation | STRUCTURE |
| **F-059** | `ui/primitives/MoneyText.tsx:24-34` ≡ `ui/primitives/StatusPill.tsx:138-148` — nine identical payment-caption keys and strings, in the same directory, where `MoneyText.tsx:5` already imports a type from `StatusPill` | STRUCTURE |
| **F-060** | `toPhotoArray` copied verbatim into `lib/jobs.ts:146` and `lib/reviews.ts:27` | STRUCTURE |
| **F-061** | Distance strings diverge: `ui/primitives/JobCard.tsx:156` hand-rolls `"2.0 mi"` where `formatDistanceMiles()` gives `"2 mi away"`. `WorkerResultsScreen:43` re-exports a lib constant, so two screens import it **laundered through a screen** | STRUCTURE |
| **F-062** | **`.audit-scratch/` is NOT gitignored** and will show in every `git status`. One `git add .` from being committed — which is why the explicit-path rule exists. *This audit cannot fix it: the dispatch forbids modifying `.gitignore`* | OPERATOR — gitignore it or delete it |
| **F-063** | `docs/README.md` says *"If a file is not listed here, treat it as code"* but omits `PROD_APPLY_READY.sql`, `PROD_VERIFY.sql`, `docs/dispatch/`, `docs/audit/`, `.openai/hosting.json`. **`docs/audit/` and `docs/audits/` differ by one letter** — a trap | OPERATOR |
| **F-064** | `expo-linking` is declared, imported nowhere, and required by no other installed package. `App.tsx:170-176` mounts `NavigationContainer` with **no `linking` prop**. But `app.json` declares `scheme: "brazos"` — needs a deep-link smoke test before removal | OPERATOR |
| **F-065** | `@expo/ngrok` — zero references anywhere, reachable only via `expo start --tunnel`, bundles a deprecated `uuid@3.4.0`. Agents cannot run `expo start`, so the operator may depend on it | OPERATOR |
| **F-066** | `playwright ^1.62.1` added in `d944334` (2026-08-20). **Approval status UNKNOWN.** Three earlier adds (`expo-speech-recognition`, `expo-dev-client`, `expo-video`) also UNKNOWN — announced-looking commit subjects are not a record of approval | OPERATOR |
| **F-067** | `phase11_hotspots_demo_seed.sql` is numbered 11 but **requires phase12** (documented at `:10-11`). The only forward reference in 81 files. Rename to `phase12b_` or move to `seeds/` | SCHEMA |
| **F-068** | `add_location_column.sql` — unnumbered, unguarded, untransacted, no sentinel, no `verify-schema` entry, and must run before anything reads `jobs.location` | SCHEMA |
| **F-069** | `phase69:48` cites `bids_insert_own` as a live policy; dropped at `phase29:301`, **stale by 40 migrations**. The conclusion still holds (three other live policies call the function) | OPERATOR |
| **F-070** | **No test compares `lib/jobLifecycle.ts`'s status vocabulary against the migrations' enum.** Parse the enum from migration text, parse the union from the TS, assert set equality — offline, ~40 lines. **The single best test this project does not have** | STRUCTURE |
| **F-071** | `tests/errorMessage.test.mjs:69` carries a stale allowlist entry protecting `hooks/useChat.ts`, which has zero importers. The guarantee is now about `useConversationChat` | STRUCTURE |
| **F-072** | Index-derived keys over **parsed** content: `MarkdownText:79,89` (re-parsing shifts indices), `DetailScreen:88` (index fallback when `title` is absent). The other 8 index keys are benign | STRUCTURE |
| **F-073** | Seven contrast pairs clustered at **4.17–4.30**, just under 4.5:1 — each clears with a one-step luminance nudge. `muted`/`bg` 4.17 · `warn`/`bg` 4.21 · `textMuted`/`background` 4.26 · `success`/`successBg` 4.20 · `warning`/`warningBg` 4.27 · dark `danger`/`dangerBg` 4.30 · dark `danger`/`dangerSurface` 4.18 | DIAL |
| **F-074** | `navInactive` — 2.95 (light `lib/theme.ts`) / 3.00 (light `ui/tokens.ts`). Inactive tab labels are small text, so 4.5:1 is the right bar and both miss it. Dark is fine (5.33) | DIAL |
| **F-075** | `star`/`surface` = 2.15 — amber on white. A filled glyph, so 3:1 applies, and it misses that too. The token's comment defends the convention. **NEEDS OPERATOR DECISION** — convention vs contrast is a design call | DIAL |
| **F-076** | `lib/homeDesignStudio.tsx:38`'s provider is **never mounted** — a dead provider whose consumer always resolves to the module constant. `value={settings}` is a bare passthrough: **mounting it with an inline object will re-render `HomeScreen` every render** — a trap for the studio work itself | STRUCTURE |
| **F-077** | `9_job_post_dark.png` (941×1672, the **largest** master) has no manifest heading, and the manifest's *"all 43"* count should be 44 | OPERATOR |
| **F-078** | CLAUDE.md says *"Android deferred"*; `app.json` carries a complete Android block, `package.json` an `android` script. Configuration can precede a target, but "deferred" reads as "absent" | OPERATOR |
| **F-079** | Three modal shells triplicate the same `Modal` + `useSafeAreaInsets()` + `scrimInDark` + rounded-top scaffolding (`Sheet`, `ActionSheet`, `ServicePickerSheet`); `ui/primitives/StepHeader.tsx` is bypassed by the one wizard that needs it (`PostJobScreen:915-930`); 7 AsyncStorage try/catch wrappers have no shared helper | STRUCTURE |
| **F-080** | `project-audit/` (16 files, 111 KB) and `hardening-report/` (7, 25.6 KB) are **22 days stale**, classified as reference, and describe a pre-Prestige, pre-phase-60 codebase. `10_BUGS_AND_INCOMPLETE_WORK.md`, `12_TECHNICAL_DEBT_AND_RISKS.md`, `15_FILES_REQUIRING_REVIEW.md` will be read as current and be wrong | OPERATOR |

---

## BATCH PLAN

Grouping rules applied: batch together **only** work that is file-disjoint, mutually independent, and validated the same way. Split when files overlap, when one batch depends on another's output, when separate revert boundaries materially reduce risk, or when the work is schema/migration/security. **Every split names its reason.**

---

### BATCH A — Unblock the baseline
**Findings:** F-001 · **Model: Fable 5, effort max** (ambiguous, high-risk: geometry re-derivation against a replaced master)

| | |
|-|-|
| Commits | 1. operator settles the dial values → 2. re-flatten the hero PNG → 3. re-derive the 8 fences and 2 bake assertions, each mutated red before keeping |
| Files | `ui/tokens.ts` · `lib/homeDesignStudio.tsx` · `screens/HomeScreen.tsx` · `assets/prestige/hero_armchair_customer.png` · `tests/emeraldFences.test.mjs` · `tests/goldOnForest.test.mjs` · `tests/homeDesignStudio.test.mjs` · `tests/themeResolution.test.mjs` |
| Why batching is safe | All ten failures share one cause and one file set. Splitting them would leave the suite red between commits, which is exactly what CLAUDE.md forbids. |
| **Split reason** | **Everything else depends on this.** Until the suite is green, no other batch can distinguish its own regressions from these ten. |
| Operator BEFORE | **Decide (a) or (b) on the dial values.** Blocking — an agent must not choose. |
| Operator AFTER | Device-check Customer Home in dark; `node scripts/home-shots.mjs --build` to compare against master 44. |

---

### BATCH B — The production guard
**Findings:** F-003, F-006 · **Model: Fable 5, effort max** (security)

| | |
|-|-|
| Commits | 1. hard-refuse the production ref in `verify-schema.mjs` → 2. make PENDING fail the run, and split `checkColumnRevoked` into "denied" vs "missing" |
| Files | `scripts/verify-schema.mjs` · `scripts/supabase-ref.mjs` |
| Why batching is safe | Two defects in one script, same validation, no app code. |
| **Split reason** | **File-disjoint from every other batch, and it is the only P0 an agent can close alone.** It also cannot break the app — the app never runs this script. |
| Operator BEFORE | none |
| Operator AFTER | Run `node scripts/verify-schema.mjs` against staging once with `.env` correct, and once with it deliberately mis-pointed, to confirm the refusal fires. |

---

### BATCH C — Corrective migration `phase76`
**Findings:** F-002, F-004, F-040, F-049, F-068 · **Model: Fable 5, effort max** (schema + security)

| | |
|-|-|
| Commits | 1. author `supabase/phase76_rls_and_search_path_corrections.sql` → 2. add its group to `scripts/verify-schema.mjs` |
| Files | `supabase/phase76_*.sql` (new) · `scripts/verify-schema.mjs` |
| Contents | assert `relrowsecurity` on `payments` and **raise if false** · `create policy if not exists` for the payer/payee SELECT boundary · `alter function public.job_request_parties_ok(uuid, uuid) set search_path = public, pg_temp;` · `revoke insert, update, delete` on the 7 divergent tables · a money ceiling on `worker_services.price_cents` · an in-transaction self-check that aborts rather than half-applies, per the phase64/68/73/75 precedent |
| Why batching is safe | One migration, one transaction, one apply. Splitting into several files multiplies hand-application steps without reducing risk. |
| **Split reason** | **Schema/migration/security — never batched with code.** Requires hand-application; the repo cannot verify it. |
| **Never** | Do not rewrite phase50, phase53, phase64 or phase68. A new discovery gets a **new** migration. |
| Operator BEFORE | Confirm no production apply is in flight. |
| Operator AFTER | **Paste into the Supabase SQL Editor against staging** — the only path. Then `node scripts/verify-schema.mjs` green. **F-002 is unresolved until this is applied**, not when the file is committed. |

---

### BATCH D — Motion constant + driver correctness
**Findings:** F-017, F-041, F-052 · **Model: Sonnet 5 / xhigh** (scoped, mechanical)

| | |
|-|-|
| Commits | 1. export one `USE_NATIVE_DRIVER` and adopt it in the 13 declaring files → 2. fix the 11 hardcoded `true` → 3. fix the 2 `SetupScreen` `false` |
| Files | `lib/motion.ts` (new) · `components/PhotoViewer.tsx` · `components/PulseDot.tsx` · `screens/HomeScreen.tsx` · `screens/SetupScreen.tsx` · the 13 files declaring the constant |
| Why batching is safe | One mechanism, one invariant, mechanical substitution. **F-052 must ship with F-017 or the drift recurs** — the duplication *is* the cause. |
| **Split reason** | **Touches `screens/HomeScreen.tsx` → must run AFTER BATCH A.** |
| Operator AFTER | Device-check the Live Nearby pulse and the photo viewer's pinch-zoom. |

---

### BATCH E — Asset diet
**Findings:** F-016 · **Model: Sonnet 5 / xhigh**

| | |
|-|-|
| Commits | 1. delete the 4 unreferenced icons (355 KB) → 2. move `brazos-logo-source.png` out of `assets/` → 3. downscale `hero_toolbox_worker.png` and `app-icon-v2.png` |
| Files | `assets/**` only |
| Why batching is safe | **No source file changes.** Every deletion is independently verified unreferenced (`10_dead_code.md` §D1) with **zero broken references** repo-wide (§D5). |
| **Split reason** | File-disjoint from everything. `brazos_b_drape` (F-036) is **excluded** — it needs an operator decision on the dark-only gate. |
| Operator AFTER | One clean `expo export` to confirm the bundle still builds. |

---

### BATCH F — Delete the dead screen
**Findings:** F-023, F-071 · **Model: Fable 5, effort max** (11 test files must move together)

| | |
|-|-|
| Commits | 1. delete `BrowseJobsScreen`, `useWorkerAvailability`, `useChat` **and** update all 11 test files in the same commit → 2. remove the now-dead `openJobsPotential` duplicate and the stale `errorMessage` allowlist entry |
| Files | `screens/BrowseJobsScreen.tsx` · `hooks/useWorkerAvailability.ts` · `hooks/useChat.ts` · `lib/earningsMath.ts` · 11 files under `tests/` |
| Why batching is safe | The three files die together — one is the sole importer of the second, the third is independently unreferenced. |
| **Split reason** | **A separate revert boundary materially reduces risk**: 583 deleted lines across 11 test files is the kind of change you want to revert as one unit. **Also blocked on F-020** — CLAUDE.md still lists this file as LOCKED, and an agent must not delete a file a protected control names. |
| Operator BEFORE | **Fix CLAUDE.md's locked list first (F-020, in BATCH J).** |
| Operator AFTER | none — it renders nowhere. |

---

### BATCH G — Invariant copy + the client status writer
**Findings:** F-007, F-024, F-008 · **Model: Fable 5, effort max** (F-008 inverts a test that guards an invariant)

| | |
|-|-|
| Commits | 1. `screens/HomeScreen.tsx:532` — replace the "Smart matching is on" label → 2. `:820` — resolve the "in your area" claim (change the copy, or add a distance term to `similarPostedToday`) → 3. delete `lib/jobStatusCompatibility.ts` and the `PGRST202` branch, **inverting** `tests/hardening.test.mjs:156-159` in the same commit |
| Files | `screens/HomeScreen.tsx` · `lib/jobStatusCompatibility.ts` (delete) · `lib/jobs.ts` · `tests/hardening.test.mjs` |
| Why batching is safe | Three invariant violations, each a small localized edit, all validated by `npm run verify`. |
| **Split reason** | **Touches `screens/HomeScreen.tsx` → after BATCH A and after BATCH D** (D touches the same file). |
| Operator BEFORE | **Decide F-008**: does any deployment target still lack `transition_job_status()`? BATCH C's §B.3 evidence says the path is already dead. And **decide F-024**: change the copy, or add the distance term? |

---

### BATCH H — Error-handling honesty
**Findings:** F-026, F-027, F-013, F-042 (the 6 user-visible subset) · **Model: Fable 5, effort max** (F-013 is a compliance boundary)

| | |
|-|-|
| Commits | 1. the two **dispute** reads — distinguish unknown from false, render lifecycle as indeterminate → 2. the other 8 discarded errors → 3. `TrackWorkerScreen` loading + error states → 4. `useLegalGate` per the operator's decision → 5. the 6 user-visible console-only paths |
| Files | `screens/TrackWorkerScreen.tsx` · `screens/ClientJobDetailScreen.tsx` · `screens/JobDetailScreen.tsx` · `screens/ProfileDetailsScreen.tsx` · `hooks/useJobOwnerActions.ts` · `hooks/useLegalGate.ts` · `lib/postJobDraft.ts` · `lib/pushNotifications.ts` · `lib/notificationRoutes.ts` · `modes/ModeProvider.tsx` |
| Why batching is safe | One class of defect, one review lens: *"can a failure be mistaken for a fact?"* |
| **Split reason** | **Overlaps `ClientJobDetailScreen.tsx` and `JobDetailScreen.tsx` with BATCH I — sequence, do not merge.** |
| Operator BEFORE | **Decide F-013** (fail open + persist, or fail closed + retry). Blocking. |

---

### BATCH I — Money and lifecycle consolidation
**Findings:** F-011, F-012, F-070 · **Model: Fable 5, effort max** (architecture)

| | |
|-|-|
| Commits | 1. `servicePriceLabel` → `formatBudget` → 2. add the status-vocabulary test (**F-070 first — it is the safety net for what follows**) → 3. collapse `JobProgress` onto `trackStepIndex()` → 4. converge `StatusPill` and `StatusBadge` → 5. replace `ClientJobDetailScreen`'s 10 raw ladders with the derivation it already imports |
| Files | `lib/services.ts` · `lib/jobStage.ts` · `ui/primitives/StatusPill.tsx` · `components/StatusBadge.tsx` · `components/JobProgress.tsx` · `screens/ClientJobDetailScreen.tsx` · `screens/WorkerJobScreen.tsx` · `screens/RouteArrivalScreen.tsx` · `screens/WorkChecklistScreen.tsx` · `hooks/useJobOwnerActions.ts` · `tests/statusVocabulary.test.mjs` (new) |
| Why batching is safe | One invariant (P3-31), and the new test guards every subsequent commit in the batch. |
| **Split reason** | **The largest architectural batch. Overlaps BATCH H — sequence.** Its blast radius is money and lifecycle labels, which is the one place `02_invariants.md` says the marketplace is *wrong*, not just ugly. |
| Operator AFTER | Device-walk a job through `assigned → in_progress → completed` and confirm every label. |

---

### BATCH J — Documentation corrections
**Findings:** F-018, F-019, F-020, F-021, F-025, F-044, F-045, F-046, F-063, F-077, F-078, F-069, F-080 · **Model: Sonnet 5 / xhigh** (text drafted; judgement already done)

| | |
|-|-|
| Commits | 1. `docs/architecture.md` (5 corrections) → 2. `CLAUDE.md` (locked list, authTheme exception, Android) → 3. `HANDOFF.md` banner → 4. `BRAZOS_MOCKUP_MANIFEST.md` banner → 5. `docs/README.md` |
| Files | `docs/architecture.md` · `CLAUDE.md` · `HANDOFF.md` · `docs/mockups/BRAZOS_MOCKUP_MANIFEST.md` · `docs/README.md` |
| Why batching is safe | Documentation only. Zero code, zero test impact. Every corrected text is already drafted in `09_docs_drift.md`. |
| **Split reason** | **`CLAUDE.md` is a protected control** — CLAUDE.md:98 says agents *"must not modify, weaken, or bypass"* it without explicit authorization. This batch is **OPERATOR-executed**, or agent-executed only under explicit written authorization naming the file. **It must precede BATCH F**, which cannot delete a file the locked list still names. |
| **PRESERVE VERBATIM** | The anon-EXECUTE ACL evidence block in `HANDOFF.md`. It is the only record of a live `pg_proc` read; no static audit can reproduce it. |

---

### BATCH K — Render performance
**Findings:** F-014, F-015, F-032, F-033, F-034, F-035, F-076 · **Model: Fable 5, effort max**

| | |
|-|-|
| Commits | 1. stabilize the inline `onPress`/`renderItem` props on the 8 hot rows → 2. `React.memo` those 8 (**must follow 1, or the memo is inert**) → 3. `MyJobsHubScreen` → one sectioned `FlatList` → 4. the three unmemoized computations → 5. windowing on the three unbounded lists |
| Files | `components/{WorkerJobCard,BrowseJobCard,HubCard,ConversationRow,ChatBubble,OfferCard}.tsx` · `ui/primitives/JobCard.tsx` · `screens/{MyJobsHubScreen,ChatScreen,JobDetailScreen,HomeScreen,MessagesInboxScreen,ProfileReviewsScreen,WorkerSearchScreen}.tsx` |
| Why batching is safe | One lens (allocation and re-render), and steps 1–2 are strictly ordered. |
| **Split reason** | **Overlaps `HomeScreen.tsx` (A, D, G), `ChatScreen.tsx` (H), `JobDetailScreen.tsx` (H). Sequence last among the code batches.** No test can validate it (`13_tests.md` §5.6), so it needs a device check — a separate revert boundary is worth having. |
| Operator AFTER | **Device-required.** Scroll a long Chat thread, a long My Jobs, and toggle Appearance while a list is mounted. |

---

### BATCH L — Contrast and touch-target dials
**Findings:** F-010, F-022, F-037, F-038, F-073, F-074, F-075 · **Model: operator-driven; agent applies chosen values at xhigh**

| | |
|-|-|
| Commits | 1. F-022 — make the six drifted values **references** (structural, do first) → 2. the contrast dials → 3. the 10 touch-target heights |
| Files | `lib/theme.ts` · `ui/tokens.ts` · the 10 files in F-010 |
| Why batching is safe | All are single-number edits the operator tunes live with Fast Refresh. |
| **Split reason** | **Must follow BATCH A** — F-022's correct target depends on which dial values won. **DIAL, not STRUCTURE**: the audit gives ranges, never final values. |
| Operator BEFORE | Tune with `dev-tools/HomeDesignStudio.tsx` and `node scripts/home-shots.mjs`. **Decide F-075** (star gold: convention or contrast?). |

---

### BATCH M — Hygiene sweep
**Findings:** F-029, F-030, F-031, F-039, F-051, F-053, F-054, F-055, F-056, F-057, F-058, F-059, F-060, F-061, F-072, F-079 · **Model: Sonnet 5 / xhigh**

Deliberately **last** and deliberately **splittable** — none of it is urgent, and each item is independently revertible. Suggested sub-batches by file-disjointness: **M1** duplication (`lib/phone.ts`, `lib/reviews.ts`, `MoneyText`/`StatusPill`, `knownRating`) · **M2** shared components (`EmptyState` adoption, `JobCard` convergence, the three modal shells) · **M3** the data layer (`fetchOpenJobs` limit, the 20 row casts, the 4 nav casts) · **M4** edge functions (F-039 — **note: `tsc` does not read these**, so it needs its own review).

---

## START HERE

**BATCH A — Unblock the baseline.**

CLAUDE.md is unambiguous that *"a failing test is a failure"*, and until those ten are resolved **no other batch can prove it did not cause a regression** — every subsequent run would be reading its own result through ten pre-existing failures.

**One caveat, stated plainly:** BATCH A is blocked on an operator decision that no agent may make. If that decision is not immediate, **dispatch BATCH B in parallel** — it is the only P0 an agent can close alone, it touches two files nothing else touches, it cannot break the app because the app never runs that script, and it closes a live path by which production could be contacted from a mis-pointed `.env`.
