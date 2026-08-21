# BRAZOS — Full-repo audit, 2026-08-21

Read-only. **Zero code changed.** Zero database contact. `start.ps1` never opened.
The only files created are the fifteen markdown documents in this directory.

---

## Finding #0 — origin divergence

**This checkout is 8 commits AHEAD of `origin/mainexpo` and 0 commits behind.**

| | |
|-|-|
| Branch | `mainexpo` |
| HEAD at audit start | `9789f970bd59a9266bbc84fb259dfba2e955b674` |
| `origin/mainexpo` | `7bffaac5088ccdf7aa36527ea4f9c935b7fbb66f` |
| `git rev-list --left-right --count origin/mainexpo...HEAD` | `0	8` |
| Working tree | dirty — 4 modified files, preserved untouched |

> ⚠️ **Every finding in this audit reflects only the code present in this checkout** — `9789f97` plus four uncommitted working-tree modifications (`assets/prestige/hero_armchair_customer.png`, `lib/homeDesignStudio.tsx`, `screens/HomeScreen.tsx`, `ui/tokens.ts`). Eight commits of Home-screen work have never been pushed. Anyone reading this against `origin/mainexpo` is reading against a different tree.

Full commit list and diffs: [`01_environment.md`](01_environment.md).

---

## Finding #1 — baseline `npm run verify` is RED

| Stage | Result |
|-|-|
| `npm run lint` (`tsc --noEmit` + `noUnusedLocals`/`noUnusedParameters`) | **GREEN** — 0 `error TS` |
| `npm test` (`node --test tests/*.test.mjs`) | **RED** — 799 tests, **789 pass, 10 fail**, 0 skipped |
| Exit code | **1** |

**All 10 failures trace to the four uncommitted edits**, VERIFIED literal-by-literal against `git show HEAD:<path>` for 8 of 10 and INFERRED for the remaining 2 geometry fences. Eight are Home-geometry fences; two are baked-artwork assertions saying the replaced hero PNG *"is claimed opaque-dark but carries alpha down to 0."*

**NEEDS OPERATOR DECISION** — either the new dial values are the intended truth (re-derive the fences) or they are experimental (the operator reverts; agents are forbidden from reverting). Tracked as **F-001**.

### Final `npm run verify` — unchanged, as expected

Run bare at the end of this audit: **799 tests, 789 pass, 10 fail, exit 1, 0 TS errors.** The failing test names are **byte-identical** to the baseline set — only timings differ. This audit wrote no code, so it could not move the result in either direction.

---

## Findings by severity

| Severity | Count |
|-|-|
| **P0** — crash, security exposure, data loss, secret leak | **3** |
| **P1** — product invariant violation | **19** |
| **P2** — correctness or UX defect | **25** |
| **P3** — hygiene | **33** |
| **Total** | **80** |

## Findings by owner class

| Owner | Count | Meaning |
|-|-|-|
| **STRUCTURE** | **41** | a code change for an agent run |
| **OPERATOR** | **26** | needs the operator personally — device, credential, protected control, or product decision |
| **DIAL** | **7** | a taste value tuned live; the audit gives ranges, never final values |
| **SCHEMA** | **6** | a **new** corrective migration, hand-applied in the SQL Editor |

---

## Top 10 findings

| # | ID | Sev | Finding | file:line |
|-|-|-|-|-|
| 1 | **F-002** | **P0** | **`public.payments` — RLS never enabled by any migration**, and its only SELECT policy is also outside version control. The money ledger's access boundary is unversioned, and neither `verify-schema.mjs` nor any test can see it | `supabase/phase50_sandbox_payments_and_offer_lifecycle.sql:167-171` |
| 2 | **F-003** | **P0** | **`verify-schema.mjs` has no production guard** — it compares the three project refs only against each other. Point `.env` at production and it probes production | `scripts/verify-schema.mjs:73-95` |
| 3 | **F-001** | **P0** | **Baseline red: 10 failing tests** block every other batch from proving it caused no regression | `tests/emeraldFences.test.mjs` +3 files |
| 4 | **F-004** | P1 | **`job_request_parties_ok()` lost its `pg_temp` pin** — phase68 overwrote phase64's fix. No live exploit, but the invariant is false and re-running phase64 would abort | `supabase/phase68_deleted_at_authorization.sql:102` |
| 5 | **F-005** | P1 | **`phase22`/`phase23` mass-delete every job, bid and review** with no environment guard, no ref check, no row-count sanity check | `supabase/phase22_job_listings_seed.sql:77-84` |
| 6 | **F-008** | P1 | **Client-side `jobs.status` writer, defended by a test.** Dead against the current schema (no UPDATE policy, no grant) but `tests/hardening.test.mjs:156-159` asserts it exists — test and invariant contradict each other | `lib/jobStatusCompatibility.ts:117-124` |
| 7 | **F-013** | P1 | **`useLegalGate` fails OPEN** — a failed acceptance read logs *"allowing through"* and admits the user. A compliance boundary a transient error can cross | `hooks/useLegalGate.ts:29-32` |
| 8 | **F-012** | P1 | **Five job-status vocabularies — P3-31 is not held.** Plus raw `status === '…'` ladders in 12 screens; `ClientJobDetailScreen` does it **ten times** in a file that already calls both derivations | `lib/jobLifecycle.ts:71` +4 |
| 9 | **F-007** | P1 | **"Smart matching is on"** — AI/matching language in shipped screen-reader copy, present at `HEAD` | `screens/HomeScreen.tsx:532` |
| 10 | **F-020** | P1 | **CLAUDE.md's "Locked — never modify" section contradicts itself**, duplicates its own heading, and names a dead screen — while declaring itself a non-negotiable protected control four lines later | `CLAUDE.md:78-82` |

Two more worth the operator's eye immediately: **F-021** — `BRAZOS_MOCKUP_MANIFEST.md` presents twelve masters as numbered authority that `HANDOFF.md` records the operator as having **REJECTED** (the two lists are set-identical) — and **F-022**, six dark-palette values that have silently drifted apart and that the tests do **not** catch.

---

## Batch plan

| Batch | Findings | Owner class | Model / effort |
|-|-|-|-|
| **A — Unblock the baseline** | F-001 | DIAL + OPERATOR | Fable 5 / max |
| **B — The production guard** | F-003, F-006 | STRUCTURE | Fable 5 / max |
| **C — Corrective migration `phase76`** | F-002, F-004, F-040, F-049, F-068 | SCHEMA | Fable 5 / max |
| **D — Motion constant + driver correctness** | F-017, F-041, F-052 | STRUCTURE | Sonnet 5 / xhigh |
| **E — Asset diet** | F-016 | STRUCTURE | Sonnet 5 / xhigh |
| **F — Delete the dead screen** | F-023, F-071 | STRUCTURE | Fable 5 / max |
| **G — Invariant copy + client status writer** | F-007, F-024, F-008 | STRUCTURE | Fable 5 / max |
| **H — Error-handling honesty** | F-026, F-027, F-013, F-042 | STRUCTURE | Fable 5 / max |
| **I — Money and lifecycle consolidation** | F-011, F-012, F-070 | STRUCTURE | Fable 5 / max |
| **J — Documentation corrections** | 13 findings | OPERATOR | Sonnet 5 / xhigh |
| **K — Render performance** | F-014, F-015, F-032–F-035, F-076 | STRUCTURE | Fable 5 / max |
| **L — Contrast and touch-target dials** | F-010, F-022, F-037, F-038, F-073–F-075 | DIAL | operator-driven |
| **M — Hygiene sweep** (splittable, M1–M4) | 16 findings | STRUCTURE | Sonnet 5 / xhigh |

**Ordering constraints that are not optional:** A precedes D, G, K and L (all touch `screens/HomeScreen.tsx` or depend on which dial values won) · **J precedes F** (an agent must not delete a file the locked list still names) · **C is never batched with code** and is unresolved until hand-applied · within K, prop stabilization must precede `React.memo` or the memo is inert.

### ▶ START HERE — **BATCH A**

CLAUDE.md is unambiguous that *"a failing test is a failure"*, and until the ten are resolved **no other batch can prove it did not cause a regression**.

**If the operator's decision on F-001 is not immediate, dispatch BATCH B in parallel** — the only P0 an agent can close alone, two files nothing else touches, cannot break the app because the app never runs that script, and it closes a live path by which production could be contacted from a mis-pointed `.env`.

Full detail, per-finding evidence, exact files, commit ordering and operator pre/post steps: [`14_FIX_QUEUE.md`](14_FIX_QUEUE.md).

---

## Domain files

| # | File | Covers | Coverage |
|-|-|-|-|
| 01 | [`01_environment.md`](01_environment.md) | Branch, HEAD, divergence, tree state, toolchain, verify output, LOC by directory, tree map | 100% |
| 02 | [`02_invariants.md`](02_invariants.md) | **31 invariants** extracted from CLAUDE.md and judged: 19 PASS, 8 VIOLATION, 2 PARTIAL, 2 not statically verifiable | 100% |
| 03 | [`03_navigation.md`](03_navigation.md) | 56 routes, 89 registrations, 107 call sites, **0 unregistered targets**, the WorkerResults crash, real tab compositions | 100% |
| 04 | [`04_data_binding.md`](04_data_binding.md) | Per-screen loading/empty/error states, 10 discarded errors, 20 unchecked row shapes, **0 mock data in render paths** | 100% |
| 05 | [`05_theme_parity.md`](05_theme_parity.md) | 3 token surfaces, compile-enforced key parity, **6 drifted values**, WCAG ratios for both palettes | 100% |
| 06 | [`06_design_studio_readiness.md`](06_design_studio_readiness.md) | **2,155 hardcoded taste values** (40.5% token share), per-screen inventory, the existing knob pattern, a 3-tier knob schema | 100% |
| 07 | [`07_ui_fidelity_inventory.md`](07_ui_fidelity_inventory.md) | 46 files with dimensions, bytes and SHA-256; master→screen map; the code-frame investigation | 100% |
| 08 | [`08_security_schema.md`](08_security_schema.md) | 81 migrations, every table's RLS and policies, every grant, `transition_job_status()`, 155 definer functions, tombstone design, secret scan | 100% |
| 09 | [`09_docs_drift.md`](09_docs_drift.md) | 13 drifted claims with **corrected text drafted for each**; `BRAZOS_MASTER_PLAN.md` clean | 100% |
| 10 | [`10_dead_code.md`](10_dead_code.md) | 3 dead files, 124 unimported exports, 12 duplicated concepts, orphaned assets, **0 TODOs, 0 commented-out code, 0 `console.log`** | 100% |
| 11 | [`11_dependencies.md`](11_dependencies.md) | Lockfile parity, **1 undeclared import**, SDK 54 alignment, animation-library ban verified across 4 surfaces | 100% |
| 12 | [`12_performance.md`](12_performance.md) | 9 lists, **0 memo boundaries**, 285 hooks, asset weight, `Animated` driver conformance | 100% |
| 13 | [`13_tests.md`](13_tests.md) | 56 files, 18,516 LOC, **34% execute real code / 66% assert on text**, ranked untested surfaces | 100% |
| 14 | [`14_FIX_QUEUE.md`](14_FIX_QUEUE.md) | **80 findings**, ranked, owner-classed, with a 13-batch dispatch plan | — |

**No domain was capped. Every domain reports 100% coverage of its stated scope.**

Four scope limits are stated rather than hidden, because each is imposed by the run's own constraints:
- **No live database state was observed** — the run forbids it. Five tables and at least three policies exist only outside the repo, which is the source of F-002 and the reason `08_security_schema.md` distinguishes *"final state as expressed by the repo"* from live state.
- **No pixel measurement of the masters** — the dispatch forbids it; prior constants are stale after the master replacement. Hashes are recorded so a future run can detect the next replacement.
- **`design-reference/` was not inventoried** — it is `.gitignore`d (78 MB). Six auth screens source their design from it and are marked coverage **UNKNOWN**, not zero, in `07_ui_fidelity_inventory.md` §3.
- **`eas.json` was not re-read by this session** — the repo's own `.claude/` guard blocked it as credential-bearing. That control worked correctly and was respected rather than worked around; F-048 rests on the delegated scan's already-redacted output.

---

## Method and compliance

- **Zero code changed.** The only files written are the 15 markdown documents here. `git status` shows the operator's four pre-existing modifications **untouched and unstaged**, exactly as found.
- **15 commits, one per domain file**, each staged by **explicit path** and inspected with `git diff --cached --name-status` before committing. No `git add .`, no `-A`, no wildcard. Never pushed.
- **No database contact of any kind.** `scripts/verify-schema.mjs` was read, never executed. No command containing the production ref was constructed.
- **Nothing installed.** Where a tool was needed, a throwaway analyzer was written to `.audit-scratch/` (never staged) — six of them, for touch targets, the navigation graph, screen states, contrast and palette drift, taste-value counts, and mockup hashing.
- **`start.ps1` was never opened**, and every subagent was given the same exclusion explicitly.
- **Every finding is labelled VERIFIED or INFERRED**, cites file:line, and quotes the minimum evidence. Where two causes remained plausible, the cheapest discriminating check was run — see `02_invariants.md` §I-13 → `08_security_schema.md` §B.3, and `07_ui_fidelity_inventory.md` §5.
- **Three of this audit's own claims were corrected by a later domain**, and each correction is recorded in place rather than quietly fixed: the money invariant (§I-1 → F-011), the touch-target count (12 → 10 live, once the dead screen was found), and the dispatch's suspicion about `architecture.md`'s tab composition — **which turned out to be wrong; the document is accurate** (`09_docs_drift.md`).

> ⚠️ **`.audit-scratch/` is not gitignored** and will appear in `git status`. It holds only throwaway analyzers and two `verify` transcripts. This run could not add it to `.gitignore` (the dispatch forbids modifying that file). **Delete it or ignore it — see F-062.**
