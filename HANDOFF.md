# HANDOFF — current operational context

WRITTEN: 2026-09-07 23:19 EDT.

Rewritten as the last act of every run. Read it before naming what is blocked or
what just happened.

## What this run landed

An interactive session with the operator, not a dispatched run: the claude.ai
project was moved onto the GitHub sync, and the repository was corrected where it
contradicted that or itself.

- `docs: README states the staging pipeline, not the hand-apply that preceded it` —
  the Database migrations section claimed staging schema changes are hand-applied
  and that "no tool in this repository executes SQL", which `CLAUDE.md` §Supabase
  contradicts in bold and `.github/workflows/staging.yml` disproves. Also dropped
  the pinned Expo version (`AGENTS.md` forbids one) and added `docs/GATES.md` and
  `docs/SCOPE.md` to the governing-documents table, which omitted both binding
  imports.
- `docs: the GitHub sync replaces the bundle upload` — the ruling in
  `docs/DECISIONS.md`, the live selection and capacity in `docs/HUMAN-STEPS.md`,
  and a superseded-header on `scripts/dispatch/make-bundles.ps1`.
- `docs: PROJECT-CHAT.md mirrors the frame pasted into the project` — the new file,
  its `docs/README.md` classification row, and its addition to ACTIVE_DOCS in
  `tests/governance.test.mjs` so it is fenced like every other active document.
- `docs: archive the 2026-08-30 build retrospective` — it was in project
  knowledge, where a retrieved fragment answers as if it were current, and three
  of its claims are not. Now in `docs/archive/` with a header dating each
  falsified claim against the evidence that falsified it.
- `docs: HANDOFF rewrite - the project-knowledge sync`.

`npm run verify` green in this run: 1361 pass, 0 fail, exit 0.

## How a run is launched now

One line, from the repository root:

```
powershell -ExecutionPolicy Bypass -File scripts\dispatch\dispatch.ps1 -Prompt docs\dispatch\<name>.md -Model claude-opus-5 -Effort max
```

`-Mode` defaults to `bypass`. `-NoLaunch` prints the banner and stops.

## What is blocked

- **A run cannot start an agent, and that boundary was not approached.** Three
  independent layers refuse it: the deny matrix (`"Bash(claude *)"`), `guard.ps1`
  rule 2 (`'GUARD-NESTED-CLAUDE' 'nested-claude-session'`), and
  `evidence-guard.ps1` on `dangerously-skip-permissions`. The launcher is
  therefore untested end to end — the first real launch is the operator's.
- **Improving `preflight.ps1` is still GUARD-PATH-ESCAPE-blocked.** It stays in
  the operator's runs folder by decision: it is the only gate before dispatch, and
  moving the checker in the same change that replaced the launcher would be two
  changes fighting.
- **Reading `docs/archive/` and `docs/handoff-archive/`** — `evidence-guard.ps1`
  refuses them.

## Waiting on the operator

- **The first real launch**, which proves the parts a run cannot reach: the phone
  pushes, the ninety-second liveness check, retry and the finally block.
- **Deleting four files outside the repository** now that copies live in
  `scripts/dispatch/`. Listed in that run's report. A run may not delete outside
  the repository.
- **A known consequence of the START line.** The launcher writes into `HANDOFF.md`
  before the agent starts, so the agent sees a dirty tree. A dispatch prompt whose
  base gate demands a clean tree must allowlist `HANDOFF.md`.
- **Pasting the updated frame** into the claude.ai project's instructions box.
  `docs/PROJECT-CHAT.md` is only the mirror; the box is the copy that has effect,
  and the two are in sync only while the operator keeps them so.
- **Ticking `README.md` at the next sync.** It was left out of project knowledge
  while its migration section contradicted `CLAUDE.md`; that is corrected above.

## Open gates

See `docs/GATES.md`. Gates 0, 1 and 2 are closed. Gate 3 is the live one.
