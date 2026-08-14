# Hardening Run A — documentation authority, deterministic validation, CI

**Date:** 2026-08-14 · **Scope:** documentation, tests, CI. Zero product
behavior, zero SQL, zero dependencies, nothing under `.claude/`.

## Base snapshot — 2026-08-14, before any write

| Check | Required | Found |
| --- | --- | --- |
| Branch | `mainexpo` | `mainexpo` |
| HEAD | `260a17f2258f969d725018cdd632cc6c29d5ccca` | identical |
| Tree | clean | `git status --porcelain=v1 -uall` produced no output |

Base gate passed. No pre-existing dirty paths, so none are excluded from the
commits below.

## Baseline validation, before any edit

| Command | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | **390 tests / 389 pass / 1 fail** |

The single failure was `tests/pwa.test.mjs` → "web build is installable and
receives hosted runtime configuration", exactly the known assertion. Nothing
else failed, so the run proceeded.

## Hypotheses

| # | Hypothesis | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | Exact location lives in `job_locations`; `job_private_details` was a planned name satisfied by extending it | **VERIFIED** | `supabase/phase43_job_offers_foundation.sql:527` — "job_private_details — satisfied by extending job_locations"; line 566 describes the table as "The §G job_private_details table under its original phase12 name". Also `supabase/phase49_post_wizard_fields.sql:25`. No `job_private_details` relation is created anywhere in `supabase/`. |
| 2 | `transition_job_status()` is the only status mover; `accept_offer()` the only assignment path | **VERIFIED** | Real callers: `lib/jobs.ts:564` (`supabase.rpc('transition_job_status')`), `lib/offers.ts:309` (`supabase.rpc('accept_offer')`). |
| 3 | `accept_bid()` / `respond_job_request()` are shims with no app callers | **VERIFIED** | Grep over tracked `*.ts` / `*.tsx`: `respond_job_request` has zero occurrences; `accept_bid` appears once, in a prose comment at `screens/JobDetailScreen.tsx:308`. Neither is ever passed to `supabase.rpc()`. |
| 4 | `advance_job_status` does not exist | **VERIFIED** | Absent from `supabase/` and from all source. Appeared only in three documents, all now archived or rewritten. |
| 5 | `npm run verify` is already offline | **VERIFIED — no change made** | `package.json`: `verify` = `npm run lint && npm test`; `lint` = `tsc --noEmit --pretty false --noUnusedLocals --noUnusedParameters`; `test` = `node --test tests/*.test.mjs`. No live check to restructure. |
| 6 | The stale `pwa.test.mjs` expectation is the defect, not `public/index.html` | **VERIFIED, and larger than stated** | `public/index.html:23` ships `config.js?v=20260731-2`; the test expected `-1`. **A second stale literal was hiding behind it:** once the first was fixed, the same test failed on `CACHE_NAME`, where `public/sw.js:1` is `brazos-shell-v6` and the test expected `v5`. `git show 560ebb4` proves both literals were bumped in that one intentional commit. Both expectations were corrected; no frozen file was touched. |
| 7 | `package.json` has an `engines` field that might conflict with `.nvmrc` | **REJECTED** | No `engines` field exists, so per scope none was added and `package.json` is unmodified. |

## Phase67 procedure — preserved verbatim

The complete ACTION REQUIRED procedure now lives at
[`docs/runbooks/phase67-account-deletion.md`](../runbooks/phase67-account-deletion.md),
including the foreign-key NOTICE expectation (`public.profiles`; zero dropped
means investigate), the open-posting end-to-end walk-through, the closing
deletion-count NOTICE, and the "only a green verify-schema counts as applied /
4 PENDING checks" requirement.

Preservation was checked mechanically, not by eye: lines 22–36 of
`HANDOFF.md` at commit `260a17f` were diffed against the runbook's
corresponding section and came back **identical**. The related behaviour notes
(terminal `job_status` set, the raw-UPDATE cancellation risk and its
`decline_offer()` follow-up, and the deferred items) were carried across
verbatim too, in a clearly labelled section.

## Documentation authority model

| Domain | Owner |
| --- | --- |
| Machine state — branch, HEAD, tree | **Git.** No document may claim it. |
| Permanent policy and invariants | `CLAUDE.md` (152 lines) |
| Current operational context | `HANDOFF.md` (40 lines) |
| Implemented architecture | `docs/architecture.md` (251 lines) |
| Roadmap | `BRAZOS_MASTER_PLAN.md` (95 lines) — intent only |
| Documentation classification | `docs/README.md` (60 lines) |
| History | `docs/archive/` — never authoritative |

`docs/architecture.md` separates four layers explicitly: application contract,
repository-defined schema, last live-verified staging state (per HANDOFF, not
re-verified — no database was contacted), and pending migrations (phase67,
confirmed still unapplied in HANDOFF).

Eight superseded documents were moved with `git mv` (100% rename similarity, so
history follows): the v1 master plan, the BUILD_STATE log, an earlier
implementation handoff, the audit of the previous CLAUDE.md, and four
run-scoped process documents. `BRAZOS_BUILD_STATE.md` remains at the root as a
10-line pointer stub that is never appended to.

**Known consequence:** source comments across `lib/`, `modes/`, `navigation/`
and several migrations cite "BRAZOS_MASTER_PLAN.md §F" and similar. Those
§-sections now live in `docs/archive/BRAZOS_MASTER_PLAN_v1_2026-08.md`, which
both the new roadmap and `docs/README.md` say explicitly. Product code was not
edited to re-point them, as that is out of scope.

## Validation outcomes

| Command | Before | After |
| --- | --- | --- |
| `npm run typecheck` | exit 0 | exit 0 |
| `npm run lint` | exit 0 | exit 0 |
| `npm test` | 390 / 389 pass / **1 fail** | 398 / **398 pass / 0 fail / 0 skipped** |
| `npm run verify` | non-zero (test failure) | **exit 0** |
| `tests/governance.test.mjs` | did not exist | 8 / 8 pass |

Everything ran offline. `node scripts/verify-schema.mjs` was **not** run and no
database of any kind was contacted.

The eight new tests were each proven capable of failing rather than passing
vacuously: a bare mention of a retired name is flagged while a warned mention
is allowed; the Stripe and Postgres-URI patterns fire on planted material and
not on prose; the service-role gate distinguishes a `service_role` JWT payload
from an `anon` one; the tracked-file list is asserted non-empty so the secret
scan cannot pass over nothing; and the AGENTS.md version rule was confirmed to
reject the file's own previous contents (`.../versions/v56.0.0/`, against an
`expo` dependency of 54.0.36).

One governance assertion was corrected during development rather than
weakened: the CI checks first failed on the workflow's own header comment,
which names the surfaces CI must avoid. Failing a file for *documenting* the
rule is the same error as deleting a "do not use X" warning to make a test
pass, so the checks now scan executable YAML with comments stripped.

## CI

`.github/workflows/ci.yml` — push to `mainexpo`, pull_request targeting
`mainexpo`, and `workflow_dispatch`; `permissions: contents: read`;
`ubuntu-latest`; 15-minute timeout. Steps: checkout, setup-node reading
`node-version-file: .nvmrc` with npm cache, `npm ci`, `npm run verify`. No
secrets, no database, no `verify-schema`, no EAS, no deploy. Not pushed —
committing the file is the deliverable.

Both actions are pinned to full 40-hex commit SHAs resolved from the live
remotes via `git ls-remote`, so **no tag-pin fallback was needed**:

| Action | Tag | SHA |
| --- | --- | --- |
| `actions/checkout` | v7 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node` | v7 | `820762786026740c76f36085b0efc47a31fe5020` |

`.nvmrc` contains `24`, the major of the runtime that actually executed the
green suite (`node --version` → v24.18.0). The governance test asserts the two
agree, so the file cannot drift from reality unnoticed.

## Commits

| # | Hash | Subject |
| --- | --- | --- |
| 1 | `c3c382d` | docs: establish single source-of-truth hierarchy |
| 2 | `af496cf` | test: deterministic validation, CI, and refreshed handoff |

Every commit was staged by explicit path and its index inspected with
`git diff --cached --name-status` beforehand. `git diff 260a17f..HEAD
--name-only` contains only task-owned paths — no product code, no `supabase/`,
no `.claude/`, no frozen web surface, no `package.json`.

This report's own commit is recorded only in the run's final response, since a
commit cannot contain its own hash.
