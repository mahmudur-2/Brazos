# BRAZOS documentation index

Every documentation surface in the repository, classified. If a file is not
listed here, treat it as code. **active** — authoritative now · **reference** —
accurate for its subject, not a statement of current state · **decision
record** — why a fork was resolved; never rewritten · **archive** — history,
never an authority. Machine state (branch, HEAD, tree) is owned by Git and
appears in no document.

**Moved 2026-10-06 (the token diet).** An older pointer resolves like this: a
document it names that is gone from its old place now sits under the same name
in `docs/archive/` (`BRAZOS_MASTER_PLAN.md`, `BRAZOS_TARGET_ARCHITECTURE_v2.md`,
`LOCKED_FILE_PATCHES.md`); a dispatch brief missing from `docs/dispatch/` is in
`docs/archive/dispatch/`; "`docs/DECISIONS.md` <date> entry (n)" is item (n) of
that date in `docs/archive/DECISIONS-2026-10.md`, and the index
`docs/DECISIONS.md` says whether it still applies; a HANDOFF section from before that date is
in `docs/handoff-archive/2026-10-HANDOFF-full.md`; a Gate 0–2 box is in
`docs/archive/GATES_closed_2026-10.md`.

## Folders under docs/, at a glance

| Folder | Holds |
| --- | --- |
| `docs/archive/` | History, never an authority: retired root documents, the decision log's full text to 2026-10-06 (`DECISIONS-2026-10.md`), the closed Gates 0–2 (`GATES_closed_2026-10.md`), retired dispatch briefs (`dispatch/`), plus `root-audits/`, `diagnostics/`, `hardening-report/`, `project-audit/` (archived from the root 2026-08-22). |
| `docs/audit/` | Point-in-time audit sweeps, one dated directory per audit (`2026-08-21/`, `2026-08-22/`). Never edited after the fact. |
| `docs/audits/` | Records of consequential runs, one file per run. One letter from `docs/audit/` — read carefully. |
| `docs/brand-source/` | Unbundled design master rasters (`brazos-logo-source.png`). |
| `docs/cleanup/` | Repository-cleanup run inventories (`2026-08-22/inventory.md`). |
| `docs/design/` | Operator-authored design notes. Not edited by runs. |
| `docs/device-captures/` | Physical-device screenshot sets, dated. |
| `docs/dispatch/` | The active dispatch briefs, three at most — instructions at a point in time. Older briefs move to `docs/archive/dispatch/`. |
| `docs/emerald-v2/` | The v2 redesign plan, Phase 0 audit, and its `DECISIONS.md`. |
| `docs/handoff-archive/` | Per-run HANDOFF records, verbatim, indexed by `INDEX.md`; `HANDOFF.md` at the root keeps only Now / Blocked / Next / Revert. |
| `docs/mockups/` | The numbered golden-master PNGs (binding), their manifest and run report; `rejected/` holds the operator-rejected word-named renders. |
| `docs/proposed/` | Changes a run drafted for files only the owner changes (`CLAUDE.md`, `.claude/`), with the script that applies them. Not in force until the owner applies them. |
| `docs/runbooks/` | Procedures meant to be executed: the phase67 account-deletion apply, `dispute-resolution.md` — how the operator resolves a reported issue (A12), and `app-review.md` — getting Apple's reviewer through post → bid → pay (B4). |

## Active

| File | Owns |
| --- | --- |
| `CLAUDE.md` | Permanent policy and invariants. Binding. |
| `docs/GATES.md` | The phase gates: the open Gate 3. Binding — named by `CLAUDE.md`. A box ticks only with its evidence path beside it; an open box carries what is still missing. The closed Gates 0–2 are in `docs/archive/GATES_closed_2026-10.md`. |
| `docs/SCOPE.md` | The v1 feature list, plus the frozen list of everything that already exists beyond it. Binding — named by `CLAUDE.md`. |
| `docs/DOMAIN.md` | The model a run reads before writing: state machines, tables, RPC contracts, product rules. Pointers only, never definitions. |
| `docs/DECISIONS.md` | The decisions still in force, one line each: ID, date, decision, where the full text is. 40,000 bytes at most (`tests/docsBudget.test.mjs`). New decisions are added as new lines. The full text to 2026-10-06 is `docs/archive/DECISIONS-2026-10.md`; the root `DECISIONS.md` and `docs/emerald-v2/DECISIONS.md` are older history. |
| `docs/BACKLOG.md` | The only place unscheduled work lives. A dispatch reads an item from here, never from chat memory. |
| `docs/BRAZOS_TARGET_ARCHITECTURE_v3.md` | The one roadmap owner: the run queue, priorities and backlog. Its state section is a snapshot at its named commit, never live state. |
| `docs/LAUNCH_CHECK.md` | The pre-run checklist for an overnight dispatch (every line ticks before the launch command), the agent-autonomy contract, and how the screenshot harness runs. |
| `docs/PROJECT-CHAT.md` | The frame pasted into the claude.ai project's instructions box, mirrored here so it is versioned. The live copy is the box; edit both together. Never synced into project knowledge — what is synced is ruled in `docs/DECISIONS.md` 2026-09-07 and inventoried in `docs/HUMAN-STEPS.md`. |
| `AGENTS.md` | Reading order for an agent starting a session. |
| `HANDOFF.md` | Current operational context: Now / Blocked / Next / Revert only, 12,000 bytes at most (`tests/docsBudget.test.mjs`). A finished run's section moves to `docs/handoff-archive/`. |
| `docs/architecture.md` | Implemented architecture, reconstructed from source. |
| `docs/runbooks/` | Procedures meant to be executed: the phase67 account-deletion apply, `dispute-resolution.md` (resolving a reported issue), and `app-review.md` (the App Review walk). |
| `PROD_APPLY.md` | Human-executed production migration queue; production still has none of it. Its "source of truth" pointer now resolves to `docs/archive/BRAZOS_BUILD_STATE_2026-08.md`. |
| `docs/phone-auth-activation.md` | How to turn on SMS sign-in once a provider is paid for. |
| `WEB_DEPLOYMENT.md` | Frozen web/PWA surface. Never modified by product work. |

## Reference

| File | Subject |
| --- | --- |
| `docs/archive/brazos-product-spec.md` | Product intent, archived from the root 2026-10-03 (fix run F23). Its "Status" line is a 2026-06 snapshot and is not current. |
| `docs/archive/root-audits/AUDIT_2026-08-12.md`, `docs/archive/root-audits/SECURITY_AUDIT.md` | Read-only pre-release and staging-security audits (archived 2026-08-22); their open items fed the old master plan, now `docs/archive/BRAZOS_MASTER_PLAN.md`. |
| `docs/archive/diagnostics/DIAG_inbox_and_routes.md`, `docs/archive/diagnostics/DIAG_offer_negotiation_messaging.md` | Read-only diagnostics, 2026-08-12, both archived (the second on 2026-10-03, fix run F23; `lib/offerNavigation.ts` cites its archive path). |
| `REVIEW_GUIDE.md` | Ordered device checklist for a human review pass. |
| `docs/emerald-v2/**` | The v2 redesign plan and Phase 0 audit. Planning material; implementation status lives in `docs/architecture.md`. |
| `docs/archive/hardening-report/**`, `docs/archive/project-audit/**` | **STALE** point-in-time run output (archived from the root 2026-08-22): last touched 2026-07-30, describing the pre-Prestige, pre-phase-60 codebase. In particular `10_BUGS_AND_INCOMPLETE_WORK.md`, `12_TECHNICAL_DEBT_AND_RISKS.md` and `15_FILES_REQUIRING_REVIEW.md` are not current; deleting the two directories is an operator call. |
| `PROD_APPLY_READY.sql`, `PROD_VERIFY.sql` | Root-level production migration SQL staged for the human-executed queue that `PROD_APPLY.md` owns; the apply file is self-labelled DO NOT APPLY. |
| `docs/dispatch/` | The active dispatch briefs (three at most) — instructions at a point in time, not current state. |
| `.openai/hosting.json` | 96-byte vendor-hosting config from the PWA deploy (frozen web surface); untouched since 2026-07-30. |
| `dev-tools/README.md`, `.claude/rules/*.md` | Local launchers and harness rules loaded by tooling. |

## Decision records

| File | Subject |
| --- | --- |
| `docs/archive/DECISIONS-2026-10.md` | The full dated decision log to 2026-10-06, verbatim. What still applies is the matching line in `docs/DECISIONS.md`; this file says why. |
| `DECISIONS.md` | Forks resolved during the phases 6–12 run. |
| `docs/emerald-v2/DECISIONS.md` | Forks resolved during the Emerald V2 redesign. |
| `docs/emerald-v2/ARCHITECTURE_DECISION_job_offers.md` | Why `job_offers` replaced the two-table bid/request split. |
| `docs/audits/` | Records of consequential runs, one file per run. |
| `docs/audit/` | Point-in-time audit sweeps, one dated directory per audit (currently `2026-08-21/`). A historical record — never edited after the fact. One letter from `docs/audits/`; renaming either is an operator call. |

## Archive

History. **Never infer current state from it** — not schema, not test counts,
not phase status, not branch or HEAD. The root `BRAZOS_BUILD_STATE.md` is a
pointer stub, not a log.

| File | Was |
| --- | --- |
| `BRAZOS_MASTER_PLAN.md` | Roadmap intent until 2026-10-06; `docs/BRAZOS_TARGET_ARCHITECTURE_v3.md` owns the roadmap now. |
| `BRAZOS_TARGET_ARCHITECTURE_v2.md` | The roadmap before v3. |
| `LOCKED_FILE_PATCHES.md` | Authorized-ready diffs for files once locked; none applied. The locked list has been empty since 2026-08-19. |
| `GATES_closed_2026-10.md` | Gates 0–2, every box ticked with its evidence, verbatim. |
| `dispatch/` | Retired dispatch briefs, moved out of `docs/dispatch/` once older than a week. |
| `BRAZOS_MASTER_PLAN_v1_2026-08.md` | The original §A–§P plan. Source comments citing "§F" and similar mean this file. |
| `BRAZOS_BUILD_STATE_2026-08.md` | The former running build log. Superseded by `HANDOFF.md` + Git. |
| `CURRENT_IMPLEMENTATION_HANDOFF_2026-08.md` | An earlier handoff. Superseded by `HANDOFF.md`. |
| `CLAUDE_MD_AUDIT_2026-08-13.md` | Audit of the previous `CLAUDE.md`, since rewritten. |
| `AUTONOMOUS_RUN_2026-08.md` | Standing rules for the phases 6–12 run. Superseded by CLAUDE.md's Workflow. |
| `LEASES_2026-08-09.md` | File-lease protocol for one 2026-08-09 run. |
| `RUN_REPORT_2026-08.md` | Report from that run. |
| `FINDINGS_2026-08-12.md` | Durable memory of the 2026-08-12 fix-and-harden run. |
| `BRAZOS_RETROSPECTIVE_2026-08-30.md` | Build retrospective covering 2026-08-08 → 2026-08-30, recovered from project knowledge 2026-09-07. Its header dates the claims that have since become false. Part 5 is a rule set for a future project, not an instruction to a run. |
