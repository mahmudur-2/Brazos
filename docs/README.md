# BRAZOS documentation index

Every documentation surface in the repository, classified. If a file is not
listed here, treat it as code. **active** — authoritative now · **reference** —
accurate for its subject, not a statement of current state · **decision
record** — why a fork was resolved; never rewritten · **archive** — history,
never an authority. Machine state (branch, HEAD, tree) is owned by Git and
appears in no document.

## Active

| File | Owns |
| --- | --- |
| `CLAUDE.md` | Permanent policy and invariants. Binding. |
| `AGENTS.md` | Reading order for an agent starting a session. |
| `HANDOFF.md` | Current operational context: last work, blockers, next steps. |
| `docs/architecture.md` | Implemented architecture, reconstructed from source. |
| `BRAZOS_MASTER_PLAN.md` | Roadmap and priorities — intent, never current state. |
| `docs/runbooks/` | Procedures meant to be executed; currently the phase67 account-deletion apply. |
| `PROD_APPLY.md` | Human-executed production migration queue; production still has none of it. Its "source of truth" pointer now resolves to `docs/archive/BRAZOS_BUILD_STATE_2026-08.md`. |
| `docs/phone-auth-activation.md` | How to turn on SMS sign-in once a provider is paid for. |
| `WEB_DEPLOYMENT.md` | Frozen web/PWA surface. Never modified by product work. |

## Reference

| File | Subject |
| --- | --- |
| `brazos-product-spec.md` | Product intent. Its "Status" line is a 2026-06 snapshot and is not current. |
| `AUDIT_2026-08-12.md`, `SECURITY_AUDIT.md` | Read-only pre-release and staging-security audits; their open items feed `BRAZOS_MASTER_PLAN.md`. |
| `DIAG_inbox_and_routes.md`, `DIAG_offer_negotiation_messaging.md` | Read-only diagnostics, 2026-08-12. |
| `REVIEW_GUIDE.md` | Ordered device checklist for a human review pass. |
| `docs/LOCKED_FILE_PATCHES.md` | Authorized-ready diffs for locked files; none applied. |
| `docs/emerald-v2/**` | The v2 redesign plan and Phase 0 audit. Planning material; implementation status lives in `docs/architecture.md`. |
| `hardening-report/**`, `project-audit/**`, `dev-tools/README.md`, `.claude/rules/*.md` | Point-in-time run output, local launchers, and harness rules loaded by tooling. |

## Decision records

| File | Subject |
| --- | --- |
| `DECISIONS.md` | Forks resolved during the phases 6–12 run. |
| `docs/emerald-v2/DECISIONS.md` | Forks resolved during the Emerald V2 redesign. |
| `docs/emerald-v2/ARCHITECTURE_DECISION_job_offers.md` | Why `job_offers` replaced the two-table bid/request split. |
| `docs/audits/` | Records of consequential runs, one file per run. |

## Archive

History. **Never infer current state from it** — not schema, not test counts,
not phase status, not branch or HEAD. The root `BRAZOS_BUILD_STATE.md` is a
pointer stub, not a log.

| File | Was |
| --- | --- |
| `BRAZOS_MASTER_PLAN_v1_2026-08.md` | The original §A–§P plan. Source comments citing "§F" and similar mean this file. |
| `BRAZOS_BUILD_STATE_2026-08.md` | The former running build log. Superseded by `HANDOFF.md` + Git. |
| `CURRENT_IMPLEMENTATION_HANDOFF_2026-08.md` | An earlier handoff. Superseded by `HANDOFF.md`. |
| `CLAUDE_MD_AUDIT_2026-08-13.md` | Audit of the previous `CLAUDE.md`, since rewritten. |
| `AUTONOMOUS_RUN_2026-08.md` | Standing rules for the phases 6–12 run. Superseded by CLAUDE.md's Workflow. |
| `LEASES_2026-08-09.md` | File-lease protocol for one 2026-08-09 run. |
| `RUN_REPORT_2026-08.md` | Report from that run. |
| `FINDINGS_2026-08-12.md` | Durable memory of the 2026-08-12 fix-and-harden run. |
