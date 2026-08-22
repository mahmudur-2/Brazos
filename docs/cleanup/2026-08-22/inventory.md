# Repository root inventory — 2026-08-22

Written by the cleanup run before anything moved. One row per root-level
entry. Sizes are bytes for files and KiB-on-disk for directories (`du -sk`);
`node_modules/` and `.git/` were not measured. "Tracked" is whether `git
ls-files` holds the entry (wholly or partly); every untracked entry below is
also `.gitignore`d — `git ls-files --others --exclude-standard` returns
nothing.

Classifications: **LIVE** (referenced or load-bearing) · **HISTORICAL**
(record of past work, superseded, worth keeping — moves to `docs/archive/`) ·
**DEAD** (tracked, provably unreferenced — none qualified) · **UNTRACKED**
(never deleted by this run) · **PROTECTED** (hard-protection list, deny
matrix, or fence-pinned) · **UNPROVABLE** (none).

## Files

| Entry | Size (B) | Modified | Tracked | Class | Evidence / note |
|---|---|---|---|---|---|
| `.env` | 1,355 | 2026-08-15 | untracked | UNTRACKED + PROTECTED | Credential file. Never opened by this run. Existence observed only. |
| `.env.example` | 2,955 | 2026-08-16 | tracked | LIVE | Secret-free template, normal scope. |
| `.expo-start-error.log` | 95 | 2026-07-29 | untracked | UNTRACKED | Stale startup log. Recommend operator delete by hand. |
| `.expo-start.log` | 2,625 | 2026-07-30 | untracked | UNTRACKED | Stale startup log. Recommend operator delete by hand. |
| `.gitattributes` | 19 | 2026-08-14 | tracked | LIVE | Line-ending policy. |
| `.gitignore` | 1,394 | 2026-08-22 | tracked | LIVE | |
| `.nvmrc` | 3 | 2026-08-14 | tracked | LIVE | CI reads it; `tests/governance.test.mjs` asserts it matches the runtime. |
| `AGENTS.md` | 1,290 | 2026-08-14 | tracked | LIVE | Pinned by path in `tests/governance.test.mjs` `ACTIVE_DOCS`; content-asserted there. Cannot move. |
| `AUDIT_2026-08-12.md` | 47,007 | 2026-08-13 | tracked | HISTORICAL | Dated pre-release audit; superseded by `docs/audit/2026-08-21/` + `2026-08-22/`. References: historical records + `docs/README.md` only. |
| `App.tsx` | 10,782 | 2026-08-22 | tracked | LIVE | App entry source. |
| `BRAZOS_BUILD_STATE.md` | 444 | 2026-08-14 | tracked | LIVE | Retirement pointer stub; pinned by path in `tests/governance.test.mjs` `ACTIVE_DOCS`. Cannot move. |
| `BRAZOS_MASTER_PLAN.md` | 12,261 | 2026-08-18 | tracked | LIVE | Roadmap authority (CLAUDE.md hierarchy); governance-pinned. |
| `CLAUDE.md` | 12,147 | 2026-08-22 | tracked | PROTECTED | Governing document. Not modified by this run. |
| `DECISIONS.md` | 31,506 | 2026-08-13 | tracked | LIVE | Decision record, "never rewritten" per `docs/README.md`; cited from source and tests: `ui/primitives/index.ts:35`, `ui/primitives/Sheet.tsx:20`, `ui/primitives/MediaGrid.tsx:15`, `ui/templates/SuccessScreen.tsx:26`, `tests/sandboxCheckout.test.mjs:144`, `scripts/phase5-proof.sql:414`, `supabase/phase51:164` and more. Cannot move. |
| `DIAG_inbox_and_routes.md` | 15,149 | 2026-08-13 | tracked | HISTORICAL | Read-only diagnostic, 2026-08-12. References: historical records + `docs/README.md` only. |
| `DIAG_offer_negotiation_messaging.md` | 26,310 | 2026-08-13 | tracked | HISTORICAL — SKIPPED | Saved by a source reference: `lib/offerNavigation.ts:57` cites it. Correcting source is outside this run's scope, so the file stays. |
| `HANDOFF.md` | 96,714 | 2026-08-22 | tracked | LIVE | Current-context authority; split in this run's commit 4. Governance-pinned path. |
| `LICENSE` | 1,127 | 2026-08-13 | tracked | LIVE | |
| `PROD_APPLY.md` | 4,038 | 2026-08-18 | tracked | LIVE | "Active" per `docs/README.md`: human-executed production migration queue; production has none of it yet. |
| `PROD_APPLY_READY.sql` | 69,528 | 2026-08-18 | tracked | LIVE | Staged SQL for that active queue (self-labelled DO NOT APPLY). Referenced by `PROD_APPLY.md`, `BRAZOS_MASTER_PLAN.md`. |
| `PROD_VERIFY.sql` | 1,804 | 2026-08-18 | tracked | LIVE | Verification half of the same queue. |
| `REVIEW_GUIDE.md` | 3,949 | 2026-08-18 | tracked | LIVE | Referenced by `scripts/lifecycle-proof.mjs` and `scripts/seed-review.mjs` — hard-protection ("anything referenced by any file under scripts/"). |
| `SECURITY_AUDIT.md` | 23,136 | 2026-08-13 | tracked | HISTORICAL | Dated staging-security audit; superseded by later sweeps. References: historical records + `docs/README.md` only. |
| `WEB_DEPLOYMENT.md` | 1,224 | 2026-08-13 | tracked | PROTECTED | Frozen web surface (deny matrix). |
| `app.json` | 2,703 | 2026-08-22 | tracked | LIVE | |
| `babel.config.js` | 543 | 2026-08-13 | tracked | LIVE | |
| `brazos-product-spec.md` | 13,081 | 2026-08-18 | tracked | LIVE | Product-intent reference per `docs/README.md`; not a record of past work. Stays. |
| `eas.json` | 765 | 2026-08-15 | tracked | LIVE | |
| `env.d.ts` | 184 | 2026-08-13 | tracked | LIVE | |
| `index.ts` | 315 | 2026-08-13 | tracked | LIVE | |
| `package-lock.json` | 398,417 | 2026-08-22 | tracked | LIVE | |
| `package.json` | 2,240 | 2026-08-22 | tracked | LIVE | |
| `start.ps1` | 961 | 2026-08-09 | untracked | UNTRACKED + PROTECTED | Credential launcher. Never opened by this run. Existence observed only. |
| `tsconfig.json` | 160 | 2026-08-13 | tracked | LIVE | |

## Directories

| Entry | Size (KiB) | Modified | Tracked | Class | Evidence / note |
|---|---|---|---|---|---|
| `.audit-scratch/` | 3,450 | 2026-08-22 | untracked | UNTRACKED + PROTECTED | Allowlisted scratch. Recommend operator prune old verify logs at leisure. |
| `.claude/` | 62 | 2026-08-18 | tracked | PROTECTED | Deny matrix + guard. Read-only to this run. |
| `.expo/` | 18 | 2026-08-22 | untracked | UNTRACKED + PROTECTED | Expo cache. Leave. |
| `.git/` | — | 2026-08-22 | — | PROTECTED | |
| `.github/` | 8 | 2026-08-15 | tracked | LIVE | CI workflow, fence-asserted by `tests/governance.test.mjs`. |
| `.openai/` | 5 | 2026-08-13 | tracked | PROTECTED | One file, `hosting.json` (96 B) — classified by `docs/README.md` as part of the frozen PWA deploy surface, and referenced there. Not deleted, not moved. |
| `.shots/` | 18,620 | 2026-08-22 | untracked | UNTRACKED + PROTECTED | Screenshot harness output (gitignored by design). |
| `assets/` | 11,960 | 2026-08-22 | tracked | PROTECTED | Raster roster. |
| `components/` | 537 | 2026-08-22 | tracked | LIVE | Source. |
| `design-reference/` | 107,036 | 2026-08-11 | untracked | UNTRACKED + PROTECTED | Frozen reference tree (deny matrix). Gitignored — git does NOT hold these 107 MB; operator may want an external backup. |
| `dev-tools/` | 253 | 2026-08-19 | tracked | LIVE | `App.tsx:26` imports `dev-tools/HomeDesignStudio`; launchers documented in `dev-tools/README.md`. |
| `dist/` | 7,096 | 2026-08-11 | untracked | UNTRACKED + PROTECTED | Frozen web build output. |
| `docs/` | 75,249 | 2026-08-22 | tracked | LIVE | Documentation tree; `docs/README.md` is the classifier. |
| `hardening-report/` | 36 | 2026-08-13 | tracked | HISTORICAL | 7 files, 2026-07-30 run output; `docs/README.md` itself marks it **STALE** point-in-time output describing the pre-Prestige codebase. References: historical audit records, `docs/emerald-v2/01`, `docs/README.md`. Moves to `docs/archive/`. |
| `hooks/` | 129 | 2026-08-22 | tracked | LIVE | Source. |
| `hosting/` | 4 | 2026-08-13 | tracked | PROTECTED | Frozen web surface. |
| `lib/` | 752 | 2026-08-22 | tracked | LIVE | Source. |
| `modes/` | 44 | 2026-08-22 | tracked | LIVE | Source. |
| `navigation/` | 40 | 2026-08-20 | tracked | LIVE | Source. |
| `node_modules/` | — | 2026-08-22 | untracked | PROTECTED | |
| `project-audit/` | 144 | 2026-08-13 | tracked | HISTORICAL | 16 files, 2026-07-30 run output; `docs/README.md` marks it **STALE**. Same reference profile as `hardening-report/`. Moves to `docs/archive/`. |
| `public/` | 510 | 2026-08-13 | tracked | PROTECTED | Frozen web surface. |
| `screens/` | 1,040 | 2026-08-22 | tracked | LIVE | Source. |
| `scripts/` | 392 | 2026-08-22 | tracked | LIVE | Hard-protected as a referrer set. |
| `supabase/` | 1,078 | 2026-08-22 | tracked | PROTECTED | Applied migrations are history; nothing here is touched. |
| `tests/` | 1,076 | 2026-08-22 | tracked | LIVE | The fence suite. |
| `ui/` | 200 | 2026-08-22 | tracked | LIVE | Source. |

## Credential files in git history

The dispatch asked for `git log --all --oneline -- .env start.ps1`. The
`.claude/` guard (GUARD-SECRET) blocks any agent command whose text names
either file, so the literal command cannot run inside this session, and no
workaround that names the files in a command was attempted. The equivalent
answer was derived without naming them: the full history path listing
(`git log --all --format='COMMIT %h %ad' --date=short --name-only`, 3,573
lines covering every commit on every ref, saved to
`.audit-scratch/history-paths-2026-08-22.txt`) contains **zero** occurrences
of `.env` and **zero** of `start.ps1` as a committed path. The only
`.env`-like path anywhere in history is `.env.example` (the secret-free
template), appearing in four commits.

**Plain statement: neither `.env` nor `start.ps1` has ever been committed.
There is no credential file in git history and nothing to scrub.** Both files
exist on disk, untracked and gitignored, exactly as intended. The operator
may re-confirm by hand with the literal command above.

## Delete candidates evaluated for commit 2

Every candidate the dispatch named was evaluated; **no tracked file qualified
as DEAD**, so commit 2 takes its continue-path (no deletions):

* Root stale logs (`.expo-start.log`, `.expo-start-error.log`) — untracked,
  so excluded from deletion by the dispatch's own untracked rule.
* `hardening-report/`, `project-audit/` — referenced (see rows above), and
  `docs/README.md` records their deletion as an operator call. Reclassified
  HISTORICAL and archived instead.
* `.openai/` — referenced by `docs/README.md` and classified there as part of
  the frozen web deploy surface. Stays.
* Zip/archive of the project: none exists at run time. (`docs/audit/2026-08-21`
  recorded a gitignored `brazos-review.zip`; it is no longer on disk.)
