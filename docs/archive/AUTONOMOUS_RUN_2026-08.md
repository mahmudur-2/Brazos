# AUTONOMOUS RUN — STANDING RULES

Run scope: **Phases 6 through 12, continuously.** Phase 13 (hardening & release
checkpoint) is human-led — do not begin it.

## Authoritative sources

1. `BRAZOS_MASTER_PLAN.md` — product/build scope.
2. `BRAZOS_BUILD_STATE.md` — current implementation state.
3. `CLAUDE.md` — repository operating constraints.
4. `DECISIONS.md` — previously settled architectural decisions (if present).
5. `SCREEN_CROSSWALK.md`, `DESIGN_SYSTEM_STATUS.md`, `screen_map.json`, and the
   screen mockups (`NN_slug.html` / `NN_slug.png`) for screens in scope.
6. Phase-specific architecture docs or migrations explicitly referenced above.

This file governs *execution behaviour*. It does not override settled product or
architecture decisions in the sources above. Before each phase, read the parts of
those sources relevant to that phase; do not reread unrelated material.

---

## 0. Preflight

Before modifying any file:

1. Read the authoritative sources and `DECISIONS.md`.
2. Record the current branch and HEAD SHA.
3. **The working tree must already be clean.** If it is not, STOP under §4. Do
   not stash, discard, or auto-commit pre-existing changes.
4. **The recovery point already exists** — tag `phase-5-known-good`, and the
   working branch `autonomous-6-12` is already cut from it. Do not create a new
   branch or tag for this run, do not switch branches, do not rebase onto
   `mainexpo`, and never delete or move `phase-5-known-good`.
5. Never force-push, rewrite history, or modify any other branch.
6. Confirm `SUPABASE_DB_URL_STAGING` is set, without printing its value. If it is
   absent, STOP under §4.
7. Capture a **baseline test run** and record every failing test's exact name,
   location, and failure message into `DECISIONS.md`. §9 depends on this baseline.

## 1. Execution model

- **Single agent.** Fable 5, xhigh effort. Do NOT use ultracode or spawn
  auto-approving subagents. Locked-screen and file-list guardrails are not
  reliably respected under multi-agent execution, and parallel agents collide on
  the shared spine (navigation types, `ModeContext`, `JobCard`).
- **Auto permission mode.** Do not pause for approval at normal decision points.
- **Do not stop at phase boundaries.** Close phase N (tag it), then begin phase
  N+1 in the same run. Stop only per §4.
- Respect the master plan's dependency order. Phases marked parallelizable are
  still executed sequentially by this single agent.

## 2. Context continuity — read this before you lose context

This run spans many context windows. You **will** be compacted. Treat every phase
as if the next one will be executed by a fresh agent with no memory of this
session, because functionally it will be.

- **Durable state lives in files, never in context.** `BRAZOS_BUILD_STATE.md` and
  `DECISIONS.md` are the run's memory. If a fact matters to a later phase and is
  not written down, it is lost.
- **At the close of every phase**, before starting the next, write to
  `BRAZOS_BUILD_STATE.md`: phase status, commit SHA, tag, files changed, what was
  built, what was deliberately deferred, and the exact next step. Assume the
  reader knows nothing about this session.
- **On resuming with degraded or empty context**: re-read the authoritative
  sources and this file, run `git log --oneline -20`, read the last
  `BRAZOS_BUILD_STATE.md` and `DECISIONS.md` entries, verify the working tree is
  clean, and continue from the recorded next step. Do not guess at prior intent —
  if the record is ambiguous, STOP under §4.
- Never leave the tree in a broken state between phases. Every phase boundary must
  be a clean, compiling, committed tree, because it may be a handoff point.

## 3. Engineering standard

Priorities, in strict order. When they conflict, the earlier one wins.

1. Correctness and no regressions
2. Simple, maintainable architecture
3. Minimal code and minimal files
4. Performance and type safety
5. Token/usage efficiency

**Work surgically:**

- Inspect existing architecture before editing. Reuse or refactor existing code
  rather than adding a parallel system.
- Prefer the smallest complete solution that fully solves the requirement.
- One source of truth for shared state, tokens, navigation, and business logic.
- Prefer deleting or consolidating obsolete code over layering new code on top.
- Keep components and functions focused; keep APIs strongly typed. No `any`
  escapes on new code.
- Comment only where intent is not obvious from the code itself.

**Do not** add speculative abstractions, unnecessary wrappers, duplicate helpers,
dead code, premature optimization, or parallel state/navigation systems. Do not
perform unrelated cleanup. Do not change working behaviour unnecessarily.

Over a long unattended run the characteristic failure is drift toward
over-engineering. If a change adds a layer that nothing today requires, delete it.

## 4. Screen construction standard

- **Build against the mockups.** For each screen in scope, read its
  `NN_slug.html` / `NN_slug.png` and match layout, hierarchy, spacing, copy tone,
  and states. The mockups are the design spec, not inspiration.
- **Consolidate routes.** The target is roughly 40 routes across ~63 in-scope
  screens, via shared templates and primitives. Before creating a new route or
  screen file, check whether an existing template, primitive, or parameterised
  route already covers it. Prefer extending one over adding another.
- Reuse existing primitives (`OfferComposer`, `SuccessScreen`, `StatusBadge`,
  `StatusPill`, `OfferCard`, `JobCard`) rather than writing near-duplicates.
- Every new surface must respect `ModeContext` perspective isolation and must not
  leak customer-only or worker-only data across modes.
- Copy must be honest about sandbox state. Never render "Paid", "Released to your
  bank", or any claim the ledger cannot substantiate.

## 5. Hard constraints

- **Locked screens:** 01–07, 48, and the shared auth flow. Never modify. If a
  requirement appears to demand it, that is a §7 stop.
- **Production database is off-limits.** All database execution goes to
  `SUPABASE_DB_URL_STAGING`. The production connection string is not in this
  environment; do not reconstruct it, do not read it from any file, do not prompt
  for it. Production apply is a human step performed after the run.
- **Never print a connection string, password, or key** into terminal output,
  commit messages, or docs. Sessions sync to a remote device.
- **RPC-only writes** on sensitive tables. Every new RPC needs an explicit
  `GRANT EXECUTE ... TO authenticated` (the phase32 lesson).
- **Postgres enums**, never ad hoc status strings.
- **Backward compatibility is a hard constraint.** Real users are on installed
  builds. A schema change that strands an installed build is a §7 stop, not a
  judgment call. Existing legacy shims keep working.
- **Migrations are numbered, hand-applied, idempotent**, and verified by
  `scripts/verify-schema.mjs`. Continue the existing `phaseNN_` convention. Every
  migration must be safely re-runnable.
- **No new dependencies.** If one seems genuinely required, that is a §7 stop.
  Do not install eslint — it is absent by repo convention.

## 6. Staging environment — provenance and limits

Read this before touching staging.

- Staging (`brazos-staging`) was built by loading a **`pg_dump --schema-only`
  capture of production**, not by replaying the numbered migrations. The numbered
  migrations **cannot** reproduce this schema from empty: `phase1_rls_and_realtime`
  fails immediately because the base tables were created outside the numbered
  sequence. Do not attempt a from-scratch migration replay as a reset strategy.
- The `vector` extension had to be created manually in the `extensions` schema
  before `worker_semantic_docs` would load.
- Staging is **schema-only**: no rows, no `auth.users`. Seed tooling must create
  its own identities rather than assuming any exist.
- Schema/data damage to staging is recoverable and you may reset or rebuild
  **schema objects and data** when necessary. Do NOT delete or recreate the
  Supabase project itself, alter billing or project configuration, or destroy
  staging Auth/Storage configuration.
- If staging becomes unrecoverable by ordinary means, STOP under §7 — restoring it
  requires a production dump, which is a human step.

## 7. Stop conditions — halt the run, write the reason to `DECISIONS.md`

Stop only for these. Do not work around them.

1. A requirement cannot be met without modifying a locked screen.
2. A schema change would break an installed build's read or write path.
3. An **architectural fork with material downstream consequences** — two viable
   designs where later phases would be built differently depending on the choice.
4. An irreversible or production-affecting operation appears necessary.
   Reproducible staging schema/data resets authorized by §6 do not count as
   irreversible for this rule.
5. Staging is unreachable, or the run record is too ambiguous to resume safely.
6. A new dependency appears genuinely required.
7. The working tree was not clean at preflight.

**The test for #3:** *would a later phase be written differently depending on which
way this goes?* If yes, stop. If it is merely hard or ugly, resolve it yourself.

**Gray-zone tiebreaker.** When you genuinely cannot tell whether something is a
§8 decision or a §7 fork:

- If it touches **payment state, job lifecycle status, or the identity/permission
  model** — stop. These three poison everything downstream.
- Otherwise — choose the more conservative and more easily reversed option,
  continue, and record it in `DECISIONS.md` under a prominent
  `NEEDS REVIEW` heading. A flagged decision the human can reverse in one commit
  is worth more than six idle hours.

## 8. Resolve these yourself — do not stop

Minor bugs, failing tests, refactors, naming, file layout, component
decomposition, styling, copy, migration mechanics, staging resets per §6, test
fixtures, and ordinary implementation uncertainty. Reversible decisions are yours.
Make the call, note it in `DECISIONS.md`, keep moving.

**Cross-phase regressions:** if a later phase reveals a defect introduced by an
earlier phase in this run, fix it properly at the root and note it — do not patch
around it, and do not rewrite the earlier phase's commit.

## 9. Pre-authorized decisions (Phase 6) — build these, do not re-litigate

- **Release path:** add `sandbox_release` as a third `SECURITY DEFINER` RPC,
  mirroring the existing authorize/hold pattern. `held → released`. Provider stays
  `sandbox`; no provider SDK, no real processing.
  - Customer approval, ownership, and valid current payment/job state must be
    enforced **inside the RPC**. UI navigation order is not an authorization
    boundary.
  - Repeated release after an already-successful release must return the existing
    successful state as a no-op — never error, never release twice.
- **Ratings ordering:** screen 37 (Review & tip) moves behind the approve gate.
  Release first, then review — per the UI atlas.
- **Tracking scope:** static `en_route` / `arrived` status transitions only. No
  live location, no background permissions, no new location dependency. Screens
  33 and 56 render the static states.

## 10. Carry-forward known issues

- `accept_offer` sets `assigned`; "confirmed" is derived as *assigned + held*.
  The §H.1 `pending_payment`/`confirmed` enum migration rides the
  shim-retirement / version-gate phase. Revisiting this is a §7 fork.
- Fee = 0, stated on screen. No authoritative fee schedule exists.
- SubmitBid inherits JobDetail's documented customer-mode reachability leak. Do
  not widen it. **Phase 8 is explicitly authorized to close it** if its scope
  requires. That repair is NOT a §7 fork unless fixing it requires changing the
  underlying identity, `ModeContext`, authorization, or navigation architecture.

## 11. Per-phase required artifacts

A phase is not complete without all three.

1. `scripts/seed-phase-N.sql` — creates its own test identities (staging has no
   `auth.users`) and puts two accounts into the exact state needed to tap through
   this phase's screens on a physical device, without manual setup taps.
2. `BRAZOS_BUILD_STATE.md` → "Phase N — physical checklist": numbered taps with
   expected state after each, plus the §2 continuity record.
3. `DECISIONS.md` — append per phase: decisions made autonomously and why;
   anything deferred; anything flagged `NEEDS REVIEW`; anything you would have
   asked about.

**Physical-device verification being pending does not stop progression.** Generate
the checklist, mark it pending, and continue — unless the missing physical result
creates a genuine §7 architectural uncertainty.

## 12. Gate around each milestone commit

**Before commit:**

- `tsc` clean
- repo's existing test run
- `scripts/verify-schema.mjs` green
- all applicable existing `scripts/rls-probe-*.mjs` probes green
- new tests covering this phase's authorization boundaries and state transitions
- inspect the diff; confirm no unrelated files and no unnecessary new files
- distinguish baseline failures from regressions introduced by this run

The two documented pre-existing failures (PWA frozen web string; setupOnboarding
CRLF mis-slice) may be ignored **only if their failure signatures exactly match
the §0 baseline**. Any changed message, changed location, additional assertion
failure, or newly failing test is a regression until proven otherwise.

**Then commit** the coherent milestone — phase-related work only. Commit at each
stable milestone, not only at phase end.

**After commit:** `git status` must be clean; record the commit SHA. Tag `phase-N`
at phase close.

## 13. Final report (once, at end of run or at a §7 stop)

Concise: phases completed · commits and tags · files changed per phase ·
validation results against the §0 baseline · every `NEEDS REVIEW` flag raised ·
the §7 stop reason if any · migration files awaiting production apply, in order ·
exact next step.
