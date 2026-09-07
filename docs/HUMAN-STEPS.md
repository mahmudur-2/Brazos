# HUMAN-STEPS — every step in the dispatch pipeline that still needs the operator

Promised 2026-08-29 ("I don't ever wanna have to repeat the safe autonomous runs
ever! If you dont need me to do something which you can already do.... DO IT!!"),
written 2026-09-07.

**What this walks.** One path only: from a written prompt to a landed commit. The
prompt file, `preflight.ps1`, the chain scripts (`chainA.ps1`, `night2.ps1`),
`.github/workflows/`, the `package.json` scripts, and the procedure files under
`docs/` that describe dispatching (`docs/LAUNCH_CHECK.md`, `docs/README.md`).

**What this deliberately does not walk.** CLAUDE.md § "Agent autonomy" names seven
conditions under which a run must hand back. Those are constitutional, not
candidates for removal, and they are not inventoried here. The
destructive-migration operator tap (`allow_destructive` in
`.github/workflows/staging.yml`) is one of them. Release steps past the commit —
`npm run release:testflight`, `npm run update:preview`, App Store work — are past
this walk's boundary. `docs/archive/` and `docs/handoff-archive/` were **not
read**: `.claude/hooks/evidence-guard.ps1` blocks reads there unless the
environment variable `BRAZOS_EVIDENCE` names them, nothing sets it, and this run
did not attempt to set it.

**This is an inventory. Nothing here was removed.**

**Terms.** *Deny rule* — a line in `.claude/settings.json` that refuses a command
before it runs. *Guard* — `.claude/hooks/guard.ps1`, a script that inspects every
command's text and blocks it; its refusals are named `GUARD-<something>`.
*GUARD-PATH-ESCAPE* — the guard's rule that a run may only write files inside
`C:\Users\mdmah\BRAZOS`. *GPE* is its shorthand below.

---

| Step | Where it happens | Why a run can't do it | Removable? |
|---|---|---|---|
| 1. Regenerate the project-knowledge bundles | `runs\make-bundles.ps1` | Nothing blocks it. The script only reads the repository and writes to the runs folder; no deny rule and no guard rule names it. | **YES** — a run, or the launcher's step 0, can invoke it. |
| 2. Upload the bundles into the chat's project knowledge | claude.ai, in a browser | A browser click behind a login. No run holds that session. | NO |
| 3. Decide what the next run does | the operator | Judgment about priorities. `docs/BACKLOG.md` and `docs/GATES.md` hold the candidates; choosing among them is not a mechanical step. | NO |
| 4. Write the prompt file | `docs/dispatch/<name>.md`, inside the repository | **CLOSED 2026-09-07.** Prompt files now live inside the repository, in the folder `docs/README.md` already designated for them, so GUARD-PATH-ESCAPE no longer applies and a run can write the next run's prompt. Deciding what it should say is row 3 and is still the operator's. | **REMOVED** |
| 5. Save the prompt as a downloaded file, never pasted from a rendered page | browser download | A browser click behind a login. The rule exists because a rendered page substitutes smart quotes, which `preflight.ps1` check 2 warns about and which are fatal inside a command line. | NO |
| 6. Give the prompt file a fresh, unused name | `docs/dispatch/` | **CLOSED 2026-09-07.** Same move as row 4. A run naming the file can also see what names are already taken, which the operator could only do by looking. | **REMOVED** |
| 7. Run `preflight.ps1 -Prompt <file>` | the operator's PowerShell | Nothing blocks a run from executing it — it is a read-only checker. Only the *documented invocation form* is blocked: the guard's GUARD-DYNEXEC list contains the substring `'powershell -'`, so `powershell -ExecutionPolicy Bypass -File ...` is refused. Calling the script directly is not. | **YES** — already automated for chained runs: `chainA.ps1`'s `Get-Preflight` runs it for every downstream prompt. Only the one-off dispatch still does it by hand. |
| 8. Read the preflight output and decide it says READY | the operator | Nothing. `chainA.ps1`'s `Test-Ready` already makes that decision mechanically (`READY` present, `NOT READY` absent). | **YES** — `docs/LAUNCH_CHECK.md` line 4 duplicates a check the launcher already performs. |
| 9. Tick `docs/LAUNCH_CHECK.md` line 3, "prompt last edited before 00:00" | `docs/LAUNCH_CHECK.md` | Nothing. The check it points at is switched off: `preflight.ps1` line 41 reads `if ($false)`, so the hour test can never fail and only prints OK. | **YES** — either delete the line or re-enable the check. Ticking a dead gate is the worst of both. |
| 10. Start Docker Desktop | the machine | It happens before any run exists. `chainA.ps1` and `night2.ps1` exit at `docker info` if it is down, and there is no run yet to start it. | NO |
| 11. Log in to EAS (`npx --yes eas-cli login`) | the operator's shell + Expo account | A credential no run holds. The chain exits at `eas-cli whoami`. | NO |
| 12. Log in to GitHub CLI (`gh auth login --web`) | a browser | A browser click behind a login. The chain exits at `gh auth status`. | NO |
| 13. Subscribe the iPhone to the ntfy topic | the phone | A physical device. `chainA.ps1` prints the topic and blocks on `Read-Host` until the operator presses Enter. | NO |
| 14. Pause OneDrive; disable sleep and hibernate; keep the lid open | Windows settings | Machine settings, set before any run exists. `docs/LAUNCH_CHECK.md` line 8. | NO |
| 15. Write `CLEARED-<run>.txt` for each queued run | `.shots\night1\cleared\` — inside the repository | No deny rule and no guard rule blocks it; the path is inside the project. It is a deliberate human sign-off, not a mechanical block. `chainA.ps1` refuses to launch a run without one. | **YES, mechanically** — but a run writing its own clearance is self-clearance. Removing this step means deciding to delete the gate, not automating it. That is the operator's call, not a run's. |
| 16. Type the launch line (`powershell -ExecutionPolicy Bypass -File scripts\dispatch\dispatch.ps1 -Prompt ... -Model ... -Effort ...`) | the operator's PowerShell | Three independent blocks, any one of which is enough. Deny matrix: `"Bash(claude *)"` and `"PowerShell(claude *)"`. Guard rule 2: `Write-Deny 'GUARD-NESTED-CLAUDE' 'nested-claude-session'`, whose own comment says "a nested session can be launched with hooks disabled, bypassing this entire layer in one command". `evidence-guard.ps1`: any command matching `dangerously-skip-permissions` is refused as "operator-only". | NO — **and it must stay.** This is the boundary that stops a run from spawning an unguarded run. |
| 17. Choose the model and the effort level | the same launch command | Part of row 16; it is carried by the blocked command. | NO |
| 18. Relaunch after the chain stops (read `STOPPED-*.txt`, paste the block again) | the operator's PowerShell | Same three blocks as row 16. | NO |
| 19. Set the three `staging` environment secrets in GitHub (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`) | github.com repository settings | Credentials no run holds, entered through a browser behind a login. One-time; already done. | NO |
| 20. Fix or extend the launcher and chain scripts | `scripts/dispatch/` | **CLOSED 2026-09-07** for `dispatch.ps1`, `chainA.ps1`, `night2.ps1` and `make-bundles.ps1` — all now inside the repository, where a run can maintain them under ordinary review. `preflight.ps1` deliberately stays in the operator's runs folder: it is the only gate before dispatch, and moving it in the same change that replaced the launcher would be two changes fighting. Improving the checker is therefore still GUARD-PATH-ESCAPE-blocked (`Write-Deny 'GUARD-PATH-ESCAPE' 'outside-project-dir'`). | **PARTLY REMOVED** — the checker stays outside. |
| 21. Read the run's NEEDS THE OPERATOR section and act on it | the run's report | Every item is in that section precisely because a run could not do it. | NO by construction — though any individual item wrongly listed there is removable, one item at a time. |

**Count at first writing (2026-09-07, morning): 21 rows, 8 Removable = YES, and 3
of those blocked only by GUARD-PATH-ESCAPE — rows 4, 6 and 20.** Those three were
the valuable ones: not policy, not credentials, not a device, just a file
location.

**Count now, after the same day's launcher run: rows 4 and 6 are closed, and row
20 is closed except for the pre-dispatch checker.** Five rows remain Removable =
YES — 1, 7, 8, 9 and 15 — and exactly one GUARD-PATH-ESCAPE row is left:
improving `preflight.ps1`, which stays outside the repository by decision rather
than by accident.

## What changed on 2026-09-07

- Dispatch prompts are written into `docs/dispatch/`, inside the repository. The
  operator's runs folder is no longer where a prompt lives.
- `scripts/dispatch/dispatch.ps1` replaced the pasted chain block for a single
  run. It takes the prompt, the model, the effort and the permission mode; it
  refuses to start when the model or the effort is missing rather than prompting
  for them, because a PowerShell prompt waits forever on an unattended machine.
- `chainA.ps1`, `night2.ps1` and `make-bundles.ps1` were copied to
  `scripts/dispatch/`. The copies are what a run maintains from now on; the
  originals in the runs folder are the operator's to delete.
- `preflight.ps1` stayed where it is, on purpose.

---

## Not a human step, recorded so it is not re-litigated

- **Pushing.** A run pushes its own work. CLAUDE.md § "Agent autonomy" permits
  exactly `git push origin mainexpo`, flag-free, after `npm run verify` exits 0 in
  the same run, and `guard.ps1` enforces that one form
  (`'git-push-not-gated-mainexpo'` for anything else).
- **Staging.** A push starts `.github/workflows/staging.yml` — verify, then
  migrate, then deploy — with no operator tap. There is no SQL Editor step for
  staging.
- **Retrying a run that did not finish.** `chainA.ps1` already retries twice, 20
  minutes apart, and detects rate-limit messages in the output.
- **Copying reports and renders out for the operator.** `chainA.ps1` does it
  (`Publish-Report`, `Copy-Shots`, `Publish-Side`).
- **Watching a single run.** `scripts/dispatch/dispatch.ps1` starts the agent as a
  background job, checks ninety seconds later whether its log is still growing and
  pushes ALIVE or STALLED, retries twice twenty minutes apart, pushes at launch,
  retry, finish, stop and failure, and writes a START and an END or STOPPED line
  into `HANDOFF.md`.
