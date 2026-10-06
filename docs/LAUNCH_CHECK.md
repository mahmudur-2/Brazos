# LAUNCH_CHECK — tick every line before an overnight run. No questions after the last tick.

- [ ] Prompt saved in `docs/dispatch/` — inside the repository, not the runs folder
- [ ] Prompt last edited before 00:00 (preflight checks the file's write time); dispatching at any hour is fine
- [ ] `preflight.ps1 -Prompt <file>` printed READY (paste the last line here)
- [ ] Prompt file name is new; saved as a downloaded file, never pasted from a rendered page
- [ ] Base gate is an ancestry check; allowlisted dirty paths named
- [ ] Every decision the run could stop on has a continue-path
- [ ] OneDrive paused; sleep and hibernate off; lid open if a laptop
- [ ] Model and effort named in the launch line — the launcher has no default for either and refuses to start without them
- [ ] Report path known; morning starts by reading NEEDS THE OPERATOR only

## The launch line

One run, from the repository root:

```
powershell -ExecutionPolicy Bypass -File scripts\dispatch\dispatch.ps1 -Prompt docs\dispatch\<name>.md -Model claude-opus-5 -Effort max
```

`-Mode` is optional and defaults to `bypass`, which is the flag pair the chain has
launched with since night 1. Add `-NoLaunch` to print the banner and stop without
starting anything.

A whole night of chained runs is still `scripts/dispatch/chainA.ps1`, pasted.
`scripts/dispatch/dispatch.ps1` replaces that block for a single dispatch only.

## Moved from CLAUDE.md (2026-10-06)

The two sections below lived in `CLAUDE.md` until the 2026-10-06 slim-down and are copied here
verbatim. They stay binding; the slimmed `CLAUDE.md` points here for them.

## Agent autonomy — what a run may finish without the operator

A run may complete end to end without stopping, including:
- Editing any source file (the locked list is empty).
- Running `npm run verify`, type checks, and any read-only repo command.
- Committing, by explicit path only.
- Pushing its own work. A run that finishes with every commit green ends by
  running `git push origin mainexpo` — that exact flag-free form is the one
  permitted push, and a bare `git push` is blocked. The push happens ONLY
  after `npm run verify` exits 0 in that same run; a red or unrun suite means
  commit and report, never push.

A run must STOP and hand back only for:
- A required new dependency.
- A destructive migration awaiting operator approval. An ordinary schema
  migration is NOT a stop: the run commits its migration file and pushes, and
  the staging pipeline then verifies, applies it, and deploys the edge
  functions — with no operator tap at all. A migration that DROPS or RENAMES a
  database object is the exception: the pipeline's safety scan stops the run
  before anything is applied, and the operator either applies that file by
  hand or re-runs the pipeline with the override checked.
- Any need to execute SQL or contact any database.
- Any need to touch production, `.env`, `start.ps1`, or the frozen web surface.
- Any need to weaken a regression fence's logic rather than update its
  expected constants.
- Physical-device verification, which only the operator can perform.
- A collision with an active hook or deny rule.

Everything the deny matrix forbids stays forbidden. This section widens what a
run may FINISH; it does not widen what a run may DO.

A stop that this contract already answers is a wasted dispatch.

## Screenshots

`node scripts/shots.mjs` writes every registered target — Home and the
Post-a-Job flow, dark and light — at 393x852 CSS px into `.shots/` (gitignored).
Each target is a registry entry naming its mode, colour scheme, an optional
navigation recipe, and the text that proves the surface arrived; adding a screen
is a registry entry, not a new script. `--build` forces a fresh `expo export`
first; without it the export under `.shots/web` is reused. `--only <substring>`
captures a subset and `--list` prints the registry.
`node scripts/home-shots.mjs` is the Home entry point and forwards to it.

The harness supplies its own `__BRAZOS_CONFIG__` for a project that does not
exist and answers every non-local request itself, so it needs no credentials and
reaches no database. It is a comparison aid for `docs/mockups/`, not a check
`npm run verify` runs.
