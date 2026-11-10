# HANDOFF

Resume: read CLAUDE.md, this file, then `git log -12 --oneline` and `git status`, then do "Next". Git owns
branch, HEAD and tree; older sections of this file are in git history. Written 2026-11-10 ~21:30Z by the
orchestrating chat (Opus 5.5), which stopped at the owner's weekly token cap (10% used; hard stop 15%).

## Now

- Lean v1 of Brazos (iOS, Expo) is on `mainexpo`. The open task: all ten Maestro flows green on GitHub
  Actions (public repo, free Macs), TWICE in a row on the final build (lean plan F4), then the H3 final
  gate (verify, db:test, e2e, TestSprite), SHIP-REPORT, this file, push, one short owner message.
- **Run 37 is RUNNING**: https://github.com/mahmudur-2/Brazos/actions/runs/42903515400 (head 0d454ae,
  F33), simulator build `c14fa739-532f-4cfe-a3f8-d96b1974a3a7`. Ten flows take ~90 min.
- Proven: run 32 had 01-07 green in one run; runs 33-36 each went red on Mac timing, fixed in the flows
  (F31-F33) or re-run (35: driver lost the simulator). **08, 09, 10 have never passed.** Expect one or
  two fixes each: the normal shape of this work.
- Build `c14fa739…` holds the app fixes P1-P5, F25, F29. Every later fix (F26-F28, F30-F33) is
  flow-only, so no new build is needed unless an app bug shows up.
- The audit (2026-11-10): `docs/lean/AUDIT-LEDGER.md` is the single list of every flaw: fixed, open from
  e2e (E3-E6), batch B deferred (database and payments), owner items O1-O7, later.
- Gates on HEAD 0d454ae: `npm run verify` 1276 pass, 0 fail. Tree clean after this commit.

## Blocked

- Nothing blocks the loop. Owner-only items are O1-O7 in the ledger (lawyer review, public privacy and
  support URLs, OTP rotation, App Review payment path, production env check, production auth settings,
  branch protection).

## Next

1. `gh run list -R mahmudur-2/Brazos -w e2e-ios.yml -L 1`. Running → `gh run watch <id> --exit-status`
   in the background. None running → dispatch:
   `gh workflow run e2e-ios.yml -R mahmudur-2/Brazos --ref mainexpo -f build_id=c14fa739-532f-4cfe-a3f8-d96b1974a3a7`
2. Result: `gh run view <id> --log | grep -oE "\[(Passed|Failed)\] .*"`. Ten passed → dispatch the
   same again; two all-green in a row → step 5.
3. Red: `gh run download <id> -R mahmudur-2/Brazos -D <scratchpad>/r<n>`, then decrypt (the artifact is
   GPG-encrypted; the key file is `C:\Users\mdmah\.brazos-artifact-key`, never print it):
   `gpg --batch --pinentry-mode loopback --passphrase-file /c/Users/mdmah/.brazos-artifact-key -d <dl>/e2e-ios/e2e-results.tar.gpg | tar -x -C <dir>`.
   Look at `e2e-debug/.maestro/tests/*/<flow>/screenshots/` (the failing step's PNG) and the matching
   `screen-hierarchy/*.json` (grep `accessibilityText`). `e2e-junit.xml` has the exception.
4. Decide: a Mac timing loss (lost tap, slow picker, dropped digit) → flow fix with a bounded retry
   (`repeat ... while`, `optional: true` waits); a real app bug → code fix + unit test + a new build
   (`npx --yes eas-cli@27.7.0 build --platform ios --profile e2e-test --non-interactive --no-wait --json`,
   wait for FINISHED, use the new id). Then `npm run verify`, stage exact paths, `git diff --cached
   --name-status`, commit `lean F<n>: <what> (run <n>: <why>)` (next is F34), `git push origin mainexpo`,
   add the SHIP-REPORT row, re-dispatch. Reuse `subflows/` (welcome-tap, launch-recover,
   open-photo-picker, sign-in-phone, sign-out) before writing a new retry.
5. Two all-green: H3 gate. `npm run verify`; `npm run db:test` on the local stack (start Docker Desktop
   `%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe`, `npx supabase start`, `npm run db:reset`,
   `npm run db:test`; baseline 33 files, 1782 tests); TestSprite per the lean plan. Then SHIP-REPORT,
   ledger, this file, push, a short owner message with both run links.
6. Then batch B (ledger): start with B1 (tips never reach the worker), B5 (fee math overflows above
   ~$28.6k), B6 (realtime publication missing on a fresh project), B3 (hired worker reads the address
   forever), B8 (no-show worker gets the cancellation fee). Each first gets a pgTAP test that fails on
   today's schema; critical folders, so Fable blueprint, Opus build, Fable review. Then E3/E4 (stale
   inbox stage and pending chain after flow 06) on the local stack, then E5 (notification opens the job
   in place), E6 (test jobs pile up; tied to B15).

## Rules in force

- Never contact production Supabase; never read or modify `.env`; staging only through the pipeline.
- Never print a secret, phone number or OTP; redact long numbers in any output you paste.
- Stage by explicit path; never reset --hard, clean, stash, revert, --amend; push only
  `git push origin mainexpo` after `npm run verify` exits 0 in the same run. Never edit `.claude/`.
- No store submission and never `npm run release:testflight` (it auto-submits).
- Owner's budget rule: a weekly cap set per run; check `get_usage` each wake and hand off before it.

## Revert

- The whole lean run: `git checkout -b restore pre-lean-2026-11` (tag before any change).
- One slice: `git revert <hash>` (`lean P*`, `F*`, `G*` commits on `mainexpo`). App fixes this run:
  P1-P5 (84c7d4e..98d6443), F25 2865121, F29 b2314da; everything else is `.maestro/` or docs.
- Database: untouched this run (batch B deferred). Production was never touched.
