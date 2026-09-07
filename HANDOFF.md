# HANDOFF — current operational context

WRITTEN: 2026-09-07 03:41 EDT.

This file was an 85 KB accumulated log. It has been archived and replaced with
current context only. It is rewritten as the last act of every run.

## What this run landed

- `docs: append standing invariants to CLAUDE.md` — two invariants added. A third
  was skipped as already present: CLAUDE.md's source-of-truth table already says
  machine state is read from git.
- `docs: inventory the dispatch pipeline's human steps` — new file
  `docs/HUMAN-STEPS.md`, 21 rows, prompt to landed commit.
- `docs: rotate HANDOFF.md, replace the log with current context` — this file, plus
  the old one at `docs/archive/HANDOFF_archive_2026-09-07.md`.

`npm run verify` green in this run: 1361 pass, 0 fail, exit 0.

## What is blocked

- **Reading `docs/archive/` and `docs/handoff-archive/`.** `.claude/hooks/evidence-guard.ps1`
  refuses them: "bulk history under docs/archive and docs/handoff-archive requires
  operator authorization". A run may move a file there but never read one back. The
  archived HANDOFF is therefore write-only history from now on.
- **Three dispatch steps blocked only by GUARD-PATH-ESCAPE** — writing the next
  run's prompt file, naming it freshly, and fixing the launcher scripts. The guard
  refuses any write outside the repository (`'GUARD-PATH-ESCAPE' 'outside-project-dir'`)
  and all three live in the operator's runs folder. Moving them inside removes all
  three; nothing else has to change. `docs/HUMAN-STEPS.md` rows 4, 6 and 20.

## Waiting on the operator

- **Deciding whether to move prompt files and the launcher scripts into the
  repository.** A run cannot make that decision or move files it cannot write to.
- **`docs/LAUNCH_CHECK.md` line 3 is a dead gate.** It asks for a tick that
  `preflight.ps1` line 41 (`if ($false)`) can never fail. Delete the line or
  re-enable the check — an operator edit, since the script is outside the repository.
- **Gate 3 items.** Open boxes are in `docs/GATES.md`, which owns them; they are not
  copied here.

## Open gates

See `docs/GATES.md`. Gates 0, 1 and 2 are closed. Gate 3 is the live one.
