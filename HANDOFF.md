# HANDOFF

Resume: read this file, then `git log -10 --oneline` and `git status`, then do Next. Git owns branch,
HEAD and tree; older sections of this file are in git history.

## Now

Lean v1 is on `mainexpo`. Read `docs/lean/SHIP-REPORT.md` first: numbers, every test-run link, build
ids, the two App Store Connect records, the owner's remaining steps and "Decided for you".
- Gates: `npm run verify` green on every `lean F*` commit through 06f79f5; CI, pgTAP, TestSprite (9/9
  against the MIGRATED staging, run 42522047765) green on 9b0064f.
- Staging has the lean migration and the 9 functions (pipeline run 42521851967, 2026-11-08). Both
  test phones are Supabase test numbers (numbers and code: GitHub secrets `MAESTRO_E2E_PHONE`,
  `MAESTRO_E2E_PHONE_2`, `MAESTRO_E2E_OTP`, `MAESTRO_E2E_OTP_2`; never in a document, the repo is public).
- TestFlight: build 9 (`bfb47ced…`) is on record "Brazos MVP" (Apple ID 6832193439, bundle
  `app.brazos.mobile`) and on the owner's phone. `eas.json` pins that record in both submit profiles
  (`tests/easProfiles.test.mjs`). "BRAZOS Dev" (6832350967, `.dev`) is the owner's old record: never submit there.
- Found and fixed 2026-11-08 (9b0064f): `components/SealTransition.tsx` could strand Publish with the
  ring turning over a job that WAS saved (a fast answer let the intro animation stop the saved sequence).
  Build 9 still has it. Builds on 9b0064f, both FINISHED: simulator `bd7ca0f1…` (e2e-test) and store
  build 10 `23bea9d2…`, which the owner uploaded to Brazos MVP on 2026-11-08 17:11 (Apple processing).
- e2e iOS (`.github/workflows/e2e-ios.yml`, manual dispatch, `build_id` input): 24 runs on 2026-11-08/09
  (SHIP-REPORT has links and fixes). Simulator build `e0edf633-cd7d-4f6e-9712-afa3881b0102` (f0be185:
  Seal fix + "All services" sheet fix) is the one to test. Run 18 (42550933715): **01-05 green**; 06 red at
  "Submit review" (keyboard over the button), fixed in 06f79f5 (flow-only), UNPROVEN. 07-10 have never run.
  Maestro stops at the first red flow; flows title jobs `E2E <run id>`, so later flows depend on the same
  run's earlier flows. The runner uses America/New_York (`isLateDay` uses the market date).
- The repo went PUBLIC on 2026-11-09 (owner's choice: free unlimited Mac minutes; history scanned, no
  key/token/password; the test phone numbers + OTP left the docs in G11 and the owner rotated the OTP in
  Supabase + GitHub secrets). Public-repo Macs run about HALF as fast (run 22: 01 took 9m35 vs 4m30), so:
  F19 Maestro download falls back to `gh release download`; F20 every `scrollUntilVisible` timeout is 60 s;
  F21 `MAESTRO_DRIVER_STARTUP_TIMEOUT` 600000 + one retry when no flow ran. Run 24 (42588458764, on 8b67879)
  is the first run with all three; it was in the flows step at 09:08Z.
- Since store build 10 the only app change is the sheet fix (f0be185): build 11 is optional.

## Blocked

- Nothing blocks the e2e loop now. A pushed migration reaches staging again (pipeline runs on Linux).
- Owner's standing asks (2026-11-09): staging backup DONE by hand into `_archive/backups/staging-2026-11-09/`
  (roles, schema, data incl. auth+storage rows; no photo files; git-ignored). Staging must NOT be deleted:
  build 10 on phones, e2e, TestSprite and the pipeline all read it. The production pipeline (owner wants a
  chat to build and apply it) still needs the owner to change `.claude/rules/supabase.md` and CLAUDE.md
  (both forbid any workflow targeting production; a chat may not edit `.claude/`) and to add production
  secrets to a GitHub environment; ref and password never go through a chat.

## Next (the loop; any chat, any account, continues from here)

1. Is a run going? `gh run list -w e2e-ios.yml -L 1`. If yes: `gh run watch <id> --exit-status` (10-20 min
   per flow on these Macs; all ten about 60-80 min). If none: dispatch
   `gh workflow run e2e-ios.yml --ref mainexpo -f build_id=e0edf633-cd7d-4f6e-9712-afa3881b0102`.
2. When it ends: `gh run view <id> --log | grep -E "\[Passed\]|\[Failed\]"`. All ten passed = step 4.
3. A red flow: `gh run download <id> -D <scratch>/e2e-run-<id>`; the video is
   `e2e-ios/work/Brazos/Brazos/e2e.mp4` (+ `e2e-junit.xml`, `e2e-debug/`). Cut frames with ffmpeg
   (`-vf fps=1/30,scale=150:-1,tile=9x5` for a grid, `-ss` near the end for the red step). Fix the flow
   in `.maestro/` (no build needed) or the app (new `e2e-test` build: plain
   `npx eas-cli@latest build --platform ios --profile e2e-test --non-interactive --no-wait --json`, then the
   new id in the dispatch). `npm run verify`, stage by path, commit `lean F<n>: ...`, `git push origin
   mainexpo`, re-dispatch, add the run's row to SHIP-REPORT. Repeat until all ten are green.
   Maestro traps: accessible containers fold children; a label hides inner text; `tapOn` hits the centre
   even under the tab bar, a floating bar or the keyboard, so `scrollUntilVisible` with `centerElement:
   true` first; `hideKeyboard` fails on Stripe's sheet; `swipe UP` dismisses the keyboard where
   `keyboardDismissMode` is set; a slow hierarchy read needs a big `scrollUntilVisible` timeout; "iOS
   driver not ready" is the Mac, not the flow (F21 retries once).
4. All green: SHIP-REPORT rows + "Open items" + "Your time" updated, this file rewritten, one push, then
   the owner's ping. Build 11 only if the owner wants the sheet fix on TestFlight (plain `testflight`
   build, the owner pastes the submit line; never `release:testflight`).
5. Backlog: `docs/BACKLOG.md` ("Security (from the lean verdict)" first).

## Revert

- The whole run: `git checkout -b restore pre-lean-2026-11` (tag before any change).
- One slice: `git revert <hash>` (commits `lean D1` … `lean F6` on `mainexpo`).
- Database: a corrective migration; rows in the dropped practice-money tables do not return (staging had
  no backup: Pro-only). Production was never touched.
- Moved files: `_archive/2026-11-lean/` (git-ignored) with `MOVED.txt`; the lean working docs are there too.
