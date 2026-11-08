# HANDOFF

Resume: read this file, then `git log -10 --oneline` and `git status`, then do Next. Git owns branch,
HEAD and tree; older sections of this file are in git history.

## Now

Lean v1 is on `mainexpo`. Read `docs/lean/SHIP-REPORT.md` first: numbers, every test-run link, build
ids, the two App Store Connect records, the owner's remaining steps and "Decided for you".
- Gates on HEAD (9b0064f): `npm run verify` 1243 pass; CI, pgTAP, TestSprite (9/9 against the
  MIGRATED staging, run 42522047765) green.
- Staging has the lean migration and the 9 functions (pipeline run 42521851967, 2026-11-08). Both
  test phones (`13473208153`, `13473208154`, code `123456`) are Supabase test numbers.
- TestFlight: build 9 (`bfb47ced…`) is on record "Brazos MVP" (Apple ID 6832193439, bundle
  `app.brazos.mobile`) and on the owner's phone. `eas.json` pins that record in both submit profiles
  (`tests/easProfiles.test.mjs`). "BRAZOS Dev" (6832350967, `.dev`) is the owner's old record: never submit there.
- Found and fixed 2026-11-08 (9b0064f): `components/SealTransition.tsx` could strand Publish with the
  ring turning over a job that WAS saved (a fast answer let the intro animation stop the saved sequence).
  Build 9 still has it. Builds on 9b0064f, both FINISHED: simulator `bd7ca0f1…` (e2e-test) and store
  build 10 `23bea9d2…`, which the owner uploaded to Brazos MVP on 2026-11-08 17:11 (Apple processing).
- e2e iOS (`.github/workflows/e2e-ios.yml`, manual dispatch, `build_id` input): runs 1-6 on the old
  simulator build; 01-auth green on both accounts, 02 red at Publish (the Seal bug). Maestro stops at the
  first red flow, so 03-10 have never run. Run 7 on `bd7ca0f1…` (42528070363): the Seal fix holds (both
  publishes pass); 02 red at its last step, the All services sheet (fixed: `accessible={false}` on its
  absorber, needs a new e2e-test build; build 10 keeps the old sheet, which Home tiles make up for).

## Blocked

- Nothing. Every required owner step is done; SHIP-REPORT steps 5-7 are optional.

## Next

1. Read run 7's result; fix red flows (a flow edit needs no build; an app fix needs a new `e2e-test`
   build and a new `testflight` build: plain `npx eas-cli@latest build --platform ios --profile <p>`,
   never `release:testflight`, which auto-submits; store submits are the owner's).
2. Keep SHIP-REPORT's run table and "For you" current after each run.
3. Backlog: `docs/BACKLOG.md` ("Security (from the lean verdict)" first).

## Revert

- The whole run: `git checkout -b restore pre-lean-2026-11` (tag before any change).
- One slice: `git revert <hash>` (commits `lean D1` … `lean F6` on `mainexpo`).
- Database: a corrective migration; rows in the dropped practice-money tables do not return (staging had
  no backup: Pro-only). Production was never touched.
- Moved files: `_archive/2026-11-lean/` (git-ignored) with `MOVED.txt`; the lean working docs are there too.
