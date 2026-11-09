# HANDOFF

Resume: read this file, then `git log -10 --oneline` and `git status`, then do "Next". Git owns branch,
HEAD and tree; older sections of this file are in git history. Written 2026-11-09 09:45Z by the chat
that ran the lean ship (b193d4bf); the owner is switching to a second Claude account mid-run.

## The job in one paragraph

Lean v1 of Brazos (iOS, Expo) is on `mainexpo`. Everything is built, tested and on TestFlight (store
build 10). The one open task: get all ten Maestro phone-test flows (`.maestro/01-…10-…`) green in ONE
GitHub Actions run on the public repo, fixing whatever turns red, autonomously, until done; then update
`docs/lean/SHIP-REPORT.md`, rewrite this file, push, and tell the owner in one short message. The owner
is not a coder, sleeps while this runs, and wants no questions. Hard stops only: sending to real people,
moving real money, deleting data with no backup, store submissions. Everything else: just do it.

## State of the run (09:45Z, 2026-11-09)

- **Run 25 is RUNNING**: id `42595077494`, commit 2414cf5, dispatched 09:38Z, first run with F22 (job
  limit 180 min). Expect it to end 11:30-11:50Z if all green. Watch it:
  `gh run watch 42595077494 --exit-status`, then step 2 of "Next".
- Run 24 (42588458764, 8b67879): **01, 02, 03 green** (7m30, 11m08, 8m37), 04 nine minutes in when the
  job's old 45-minute limit cancelled it (shows as "cancelled", not a flow failure). F22 fixed that.
- Run 18 (private repo, faster Macs): 01-05 green; 06 red at "Submit review" (keyboard over the button),
  fixed in 06f79f5, UNPROVEN. **07-10 have never run.** Expect 06-10 to each need a fix or two: that is
  the normal shape of this work (14 fixes on 2026-11-08 for 01-05).
- Build under test: EAS simulator build `e0edf633-cd7d-4f6e-9712-afa3881b0102` (f0be185: Seal fix +
  "All services" sheet fix). Store build 10 `23bea9d2…` is on TestFlight; the only app change since is
  the sheet fix, so build 11 is optional (owner's call later).
- Repo went PUBLIC 2026-11-09 (owner's choice: free unlimited Mac minutes after the private plan's $12
  ran out). History was scanned: no key/token/password. Test phone numbers and the one-time code left
  the docs (7917fbd); the owner rotated the code in Supabase and in the GitHub secrets
  `MAESTRO_E2E_PHONE`, `MAESTRO_E2E_PHONE_2`, `MAESTRO_E2E_OTP`, `MAESTRO_E2E_OTP_2`. NEVER write a phone
  number or code into any file, log, commit or chat reply.
- Public-repo Macs run about HALF as fast as before. Fixes for that: F19 Maestro download falls back to
  `gh release download`; F20 every `scrollUntilVisible` timeout is 60 s; F21
  `MAESTRO_DRIVER_STARTUP_TIMEOUT` 600000 + one retry when no flow ran; F22 `timeout-minutes: 180`.
- Gates: `npm run verify` (lint + 1243 tests) green on HEAD 2414cf5. Tree clean.

## Next (the loop)

1. `gh run list -w e2e-ios.yml -L 1`. Running → `gh run watch <id> --exit-status` (a flow takes 7-11
   minutes; ten flows about 2 hours). None running → dispatch:
   `gh workflow run e2e-ios.yml --ref mainexpo -f build_id=e0edf633-cd7d-4f6e-9712-afa3881b0102`
2. When it ends: `gh run view <id> --log | grep -E "\[Passed\]|\[Failed\]"`. Ten `[Passed]` → step 4.
3. A red flow: `gh run download <id> -D <scratchpad>/e2e-run-<id>`; the recording is
   `e2e-ios/work/Brazos/Brazos/e2e.mp4` (also `e2e-junit.xml` with the failing command, `e2e-debug/`).
   See the red step with ffmpeg: a grid `-vf "fps=1/30,scale=150:-1,tile=9x5"` of the whole video, then
   single frames (`-ss <sec> -frames:v 1`) around the end. Decide: flow fix (edit `.maestro/`, no build)
   or app fix (edit code, then a new simulator build with
   `npx eas-cli@latest build --platform ios --profile e2e-test --non-interactive --no-wait --json`, wait
   for FINISHED with `npx eas-cli@latest build:view <id> --json`, use the new id in the dispatch).
   Then: `npm run verify`; `git add <exact paths>`; `git diff --cached --name-status`; commit
   `lean F<n>: <what and why, with the run id>` (next is F23); `git push origin mainexpo`; re-dispatch;
   add the run's row to SHIP-REPORT's table. Repeat.
   Maestro 2.12.1 traps already learned: accessible containers fold their children (match the container's
   text); a label hides inner text; `tapOn` hits the element's centre even when the tab bar, a floating
   bar or the keyboard covers it, so `scrollUntilVisible` with `centerElement: true` first;
   `hideKeyboard` fails on Stripe's sheet; `swipe UP` dismisses the keyboard where
   `keyboardDismissMode` is set; a slow hierarchy read needs a long `scrollUntilVisible` timeout;
   "iOS driver not ready" and 504 downloads are the Mac, not the flow (F19/F21 handle them); flows title
   jobs `E2E <run id>` (`MAESTRO_RUN_ID`), so a later flow depends on the same run's earlier flows and
   you cannot run 07 alone against old data; the runner clock is America/New_York.
4. All ten green: SHIP-REPORT (table row, "Open items", "Your time", "For you"), this file, one commit,
   `git push origin mainexpo`; then one short message to the owner: all ten green, the run link, and
   whether build 11 is worth making (only if the owner wants the sheet fix on TestFlight: plain
   `--profile testflight` build; the owner pastes the submit line; NEVER `npm run release:testflight`,
   it auto-submits).
5. Not this run: the production pipeline (the owner wants a chat to build and apply it, but it needs the
   owner to change `.claude/rules/supabase.md` and CLAUDE.md first, both forbid workflows against
   production, and production secrets in a GitHub environment). Staging must NOT be deleted (build 10,
   e2e, TestSprite and the pipeline all read it); a full dump of 2026-11-09 sits in
   `_archive/backups/staging-2026-11-09/` (git-ignored). Dependabot's 9 alerts: BACKLOG L6.

## Rules in force (the chat must keep these; the hooks enforce some)

- Never read `.env` or `.env.example`; never print or paste a secret, phone number or code.
- Never contact production (`avkighsiufeefyycbebf`); never type that ref. Staging DB changes only via the
  pipeline (push a migration). Remote Supabase projects are the owner's; the chat runs only GitHub,
  EAS and the repo. `psql` only through docker exec on the local stack.
- The Bash hook denies any command whose text contains `--linked`, `--project-ref`, `--db-url`,
  `eas submit` or `--auto-submit`: use Read/Grep/Write for such files instead.
- Git: stage by explicit path, never `git add -A`; never reset/stash/clean/revert/--amend/force
  checkout; push only `git push origin mainexpo`, only after `npm run verify` exits 0 in the same run.
- Never modify `.claude/`. No new dependency without flagging it. Keep unrelated changes.
- Files: create or edit with Write/Edit (a small `.mjs` written with Write and run with node is fine for
  scripted edits); no heredocs or echo-built files.
- Report facts from `git`, `gh` and the files, never from memory. "Done" needs the run link.

## Where things are

- `docs/lean/SHIP-REPORT.md`: every run (1-25) with its fix, builds, the owner's steps, open items.
- `.github/workflows/e2e-ios.yml`: the Mac job. `.maestro/`: ten flows + `subflows/`.
- `docs/lean/SHIP-READINESS.md`: the "is this professionally shippable" report (seven holds).
- `docs/BACKLOG.md`: everything outside v1. `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/TESTING.md`.
- App Store Connect record "Brazos MVP" (6832193439, `app.brazos.mobile`); "BRAZOS Dev" is the old
  record, never submit there. `eas.json` pins the record (`tests/easProfiles.test.mjs`).

## Revert

- The whole lean run: `git checkout -b restore pre-lean-2026-11` (tag before any change).
- One slice: `git revert <hash>` (`lean D*`, `F*`, `G*` commits on `mainexpo`).
- Database: a corrective migration via the pipeline; the 2026-11-09 dump in `_archive/backups/`.
  Production was never touched.
- Moved files: `_archive/2026-11-lean/` (git-ignored) with `MOVED.txt`.
