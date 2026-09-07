# HANDOFF — current operational context

WRITTEN: 2026-09-07 04:20 EDT.

Rewritten as the last act of every run. Read it before naming what is blocked or
what just happened.

## What this run landed

- `dispatch: one in-repo launcher for a single run, plus the chain scripts` —
  `scripts/dispatch/dispatch.ps1`, plus byte-for-byte copies of `chainA.ps1`,
  `night2.ps1` and `make-bundles.ps1`.
- `chore: ignore the run's commit-message scratch file and the launcher log` —
  `commit-msg.txt` at any depth, and `.audit-scratch/dispatch/`.
- `docs: dispatch prompts move into the repository; procedure files follow` —
  prompts now live in `docs/dispatch/`; `docs/LAUNCH_CHECK.md` and
  `docs/HUMAN-STEPS.md` updated to match.

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
  `scripts/dispatch/`. Listed in this run's report. A run may not delete outside
  the repository.
- **A known consequence of the START line.** The launcher writes into `HANDOFF.md`
  before the agent starts, so the agent sees a dirty tree. A dispatch prompt whose
  base gate demands a clean tree must allowlist `HANDOFF.md`.

## Open gates

See `docs/GATES.md`. Gates 0, 1 and 2 are closed. Gate 3 is the live one.
