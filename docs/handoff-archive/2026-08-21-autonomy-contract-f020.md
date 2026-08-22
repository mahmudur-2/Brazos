## 2026-08-21 — Autonomy contract + locked-section repair (F-020): COMPLETE

Five commits on `mainexpo`, based on `36d7831`. **Suite at end of run,
measured 2026-08-21: 799 pass / 0 fail / 0 skipped, exit 0.** Bare
`npm run verify`, stdout redirected, exit read from `$?`. At this run's
baseline the suite was 798 pass / 1 fail — the one red was the `home(16)`
hero-column fence, green again once `HERO_ART_INK_LEFT` was set to the
operator-approved re-measurement (`0.1775`) for the trimmed hero raster.

CLAUDE.md's malformed locked section was repaired (the list is EMPTY by
decision), and the guard + deny matrix now permit exactly one push form —
`git push origin mainexpo`, flag-free — proven by a 27-case harness run
against the guard's own matching logic: every force, wrong-ref, flagged,
`-c`-prefixed and bare push form still blocks, as do the production-ref,
`.env`, `start.ps1` and `.claude/` guards. NOTHING WAS PUSHED this run, by
dispatch instruction: the operator pushes these five commits manually; every
run after them pushes itself under the contract.

**CLAUDE.md's "Agent autonomy — what a run may finish without the operator"
section is the authority on what a run may finish unattended.**

The open contradiction this section recorded — CLAUDE.md's Workflow bullet
still forbidding autonomous `git push` — is RESOLVED: the operator authorized
the Batch B run (section above) to rewrite that one bullet, and it now defers
to the autonomy contract and states the gate.

