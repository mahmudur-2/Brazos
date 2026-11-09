# HANDOFF

Resume: read this file, then `git log -10 --oneline` and `git status`, then do Next. Git owns branch,
HEAD and tree; older sections of this file are in git history.

## Now

Lean v1 is on `mainexpo`. Read `docs/lean/SHIP-REPORT.md` first: numbers, every test-run link, build
ids, the two App Store Connect records, the owner's remaining steps and "Decided for you".
- Gates: `npm run verify` green on every `lean F*` commit through 06f79f5; CI, pgTAP, TestSprite (9/9
  against the MIGRATED staging, run 42522047765) green on 9b0064f.
- Staging has the lean migration and the 9 functions (pipeline run 42521851967, 2026-11-08). Both
  test phones (`13473208153`, `13473208154`, code `123456`) are Supabase test numbers.
- TestFlight: build 9 (`bfb47ced…`) is on record "Brazos MVP" (Apple ID 6832193439, bundle
  `app.brazos.mobile`) and on the owner's phone. `eas.json` pins that record in both submit profiles
  (`tests/easProfiles.test.mjs`). "BRAZOS Dev" (6832350967, `.dev`) is the owner's old record: never submit there.
- Found and fixed 2026-11-08 (9b0064f): `components/SealTransition.tsx` could strand Publish with the
  ring turning over a job that WAS saved (a fast answer let the intro animation stop the saved sequence).
  Build 9 still has it. Builds on 9b0064f, both FINISHED: simulator `bd7ca0f1…` (e2e-test) and store
  build 10 `23bea9d2…`, which the owner uploaded to Brazos MVP on 2026-11-08 17:11 (Apple processing).
- e2e iOS (`.github/workflows/e2e-ios.yml`, manual dispatch, `build_id` input), 19 runs on 2026-11-08/09
  (SHIP-REPORT has every link and fix). Simulator build `e0edf633-cd7d-4f6e-9712-afa3881b0102` (f0be185:
  Seal fix + "All services" sheet fix) is the one to test. Run 18 (42550933715): **01-05 green**; 06 red at
  "Submit review" (keyboard over the button), fixed in 06f79f5 (flow-only), UNPROVEN. 07-10 have never run.
  Maestro stops at the first red flow; flows title jobs `E2E <run id>`, so later flows depend on the same
  run's earlier flows. The runner now uses America/New_York (`isLateDay` uses the market date).
- Since store build 10 the only app change is the sheet fix (f0be185): build 11 is optional.

## Blocked

- GitHub refuses new Mac jobs (run 19, 42553851982: "recent account payments have failed or your spending
  limit needs to be increased"): the month's 2000 free minutes are spent (macOS bills 10x; ~304 wall minutes
  used). Owner's choice, SHIP-REPORT step 8: raise the Actions spending limit / fix the payment method, or
  wait for the monthly reset. Nothing else is blocked.

## Next

1. Once Mac minutes exist: `gh workflow run e2e-ios.yml --ref mainexpo -f build_id=e0edf633-cd7d-4f6e-9712-afa3881b0102`,
   then `gh run watch`; read `[Passed]/[Failed]` lines from `gh run view <id> --log`, download the artifact
   (`e2e-ios/work/Brazos/Brazos/e2e.mp4`, `e2e-junit.xml`) and cut frames with ffmpeg to see the red step.
2. Fix red flows (a flow edit needs no build; an app fix needs a new `e2e-test` build and later a
   `testflight` build: plain `npx eas-cli@latest build --platform ios --profile <p> --non-interactive --no-wait --json`,
   never `release:testflight`, which auto-submits; store submits are the owner's). Maestro traps learned:
   accessible containers fold children; a label hides inner text; `tapOn` hits the centre even under the
   tab bar, a floating bar or the keyboard, so `scrollUntilVisible` with `centerElement: true` first;
   `hideKeyboard` fails on Stripe's sheet; `swipe UP` dismisses the keyboard where `keyboardDismissMode` is set.
3. Keep SHIP-REPORT's run table, "For you" and "Open items" current after each run.
4. Backlog: `docs/BACKLOG.md` ("Security (from the lean verdict)" first).

## Revert

- The whole run: `git checkout -b restore pre-lean-2026-11` (tag before any change).
- One slice: `git revert <hash>` (commits `lean D1` … `lean F6` on `mainexpo`).
- Database: a corrective migration; rows in the dropped practice-money tables do not return (staging had
  no backup: Pro-only). Production was never touched.
- Moved files: `_archive/2026-11-lean/` (git-ignored) with `MOVED.txt`; the lean working docs are there too.
