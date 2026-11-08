# SHIP-REPORT (lean v1 run, 2026-11-07 → 2026-11-08)

Your time: ~5 min (steps 1-3 were done on 2026-11-08; step 4 is one paste once build 10 finishes; 5-7 are optional).
Undo of the whole run: `git checkout -b restore pre-lean-2026-11` (the tag made before any change). Nothing on staging or production was changed by the run.

## What happened
- The repo was cut from 1497 tracked files to 691 and the docs from 570 files to 17. Web, PWA, Android, the practice-money path, three unused edge functions, every mockup and the old plan docs are gone (archived under git history and `_archive/`).
- Security blockers B1-B5 fixed (grants, storage flags, constant-time service auth, pinned build modes, audit 37 → 19).
- Tests: 1239 node checks, 1782 pgTAP checks, 47 TestSprite contract checks against staging, 10 Maestro flows for the phone.
- Two EAS builds finished: a simulator build for the phone tests and TestFlight build 9 (not uploaded: that is your click, step 3).
- `lean-v1` was merged into `mainexpo` and pushed once CI was green; later fixes landed on `mainexpo`.
- 2026-11-08, evening: staging received the lean migration and the 9 functions; build 9 went to TestFlight (record "Brazos MVP") and runs on your phone; the second test phone is in. Phone-test runs 3-6 found two bugs in the post-job flow: a flow fix (the custom budget field sits below the menu's fold) and a real app bug, the publish animation could leave the spinner turning forever over a job that WAS saved (fixed in 9b0064f). The fix needs new builds: TestFlight build 10 and a new simulator build are being made.

## Numbers (same commands on the `pre-lean-2026-11` tag and on HEAD)
| | before | after |
|---|---|---|
| tracked files | 1497 | 691 |
| code lines (.ts .tsx .mjs .js .sql, excl. dist/public/hosting/_archive) | 237,492 | 160,609 |
| docs/ files | 570 | 17 |
| dependencies / dev | 54 / 7 | 38 / 4 |
| edge functions | 12 | 9 (+ `_shared/`) |
| migrations | 35 | 37 |
| `npm run verify` | 1630 pass | 1239 pass, 0 fail |
| `npm run db:test` (fresh reset) | 1893 pass | 1782 pass |
| `npm audit --omit=dev` | 37 (1 critical, 16 high) | 19 (0 critical, 2 high, 16 moderate, 1 low) |

BASELINE.md's "32794 lines" was a measuring error (xargs printed one batch's total); the before number above is the correct count on the same tag.

## Test runs (GitHub Actions on `mainexpo`)
| workflow | result | link |
|---|---|---|
| CI (verify) | green | https://github.com/mahmudur-2/Brazos/actions/runs/42471533248 |
| pgTAP | green | https://github.com/mahmudur-2/Brazos/actions/runs/42471533241 |
| TestSprite (9 server functions, 47 checks, against staging) | 9/9 passed | https://github.com/mahmudur-2/Brazos/actions/runs/42471533285 |
| Staging pipeline | halted by design at the destructive `lean_v1` migration; nothing applied (step 1 below) | https://github.com/mahmudur-2/Brazos/actions/runs/42471533350 |
| e2e iOS run 1 (Maestro on a GitHub Mac) | red: a tap on "Finish setup" hit the screen title "Finish Setup" instead (fixed in c9771eb) | https://github.com/mahmudur-2/Brazos/actions/runs/42472575706 |
| e2e iOS run 2 | account A passes end to end (wrong code refused, sign-in, legal gate, Setup, Home, sign-out); account B stops at "We couldn't send a text message": its number is not a Supabase test number yet (step 2) | https://github.com/mahmudur-2/Brazos/actions/runs/42473778967 |
| Staging pipeline, re-run with `allow_destructive` (2026-11-08) | green: lean migration applied, 9 functions deployed | https://github.com/mahmudur-2/Brazos/actions/runs/42521851967 |
| TestSprite against the migrated staging | 9/9 passed | https://github.com/mahmudur-2/Brazos/actions/runs/42522047765 |
| e2e iOS run 3 | 01-auth passes for both accounts; 02 red: "Maximum budget in dollars" is below the budget menu's fold (fixed in c3ef70e: the flow picks the $50 preset) | https://github.com/mahmudur-2/Brazos/actions/runs/42522131056 |
| e2e iOS run 4 | 01 green; 02 red: Publish spinner never ends, yet the job IS on staging (created within a second of the tap) | https://github.com/mahmudur-2/Brazos/actions/runs/42523731607 |
| e2e iOS run 5 | same as run 4 (second job saved, spinner stuck). Cause found: the Seal animation race in `components/SealTransition.tsx`, fixed in 9b0064f | https://github.com/mahmudur-2/Brazos/actions/runs/42524845926 |
| e2e iOS run 6 | old simulator build, started before the cause was known: 01 green, 02 stuck at Publish a third time (3 of 5 publishes on staging). Run 7 on the new build is the one that counts | https://github.com/mahmudur-2/Brazos/actions/runs/42526455514 |

Two earlier e2e attempts died downloading Maestro (installer CDN 504/503); the workflow now installs the pinned release with retries. Maestro stops at the first red flow, so 03-10 have not run yet; they get their first run in run 7 (new simulator build) and will likely need a few selector fixes, as 01 and 02 did. Each run costs 150-200 of the month's 2000 free Mac minutes; six runs on 2026-11-08 used about half the month.

## Builds (EAS, free plan)
| profile | id | status | what it is |
|---|---|---|---|
| e2e-test (simulator) | 68b4d69c-b3ec-4973-8b53-8e3d222bc41d | FINISHED; used by runs 1-6 | the app the Mac runner tests (has the Seal bug) |
| testflight (store, build 9) | bfb47ced-8fb9-41ba-a4cd-2c083602f2b1 | on TestFlight (Brazos MVP) and on your phone since 2026-11-08 | staging backend + Stripe TEST keys; bundle `app.brazos.mobile`; has the Seal bug |
| e2e-test (simulator, 9b0064f) | bd7ca0f1-7b5a-4982-a3d5-5bbfc24d5680 | building | run 7 and later |
| testflight (store, build 10, 9b0064f) | 23bea9d2-bf1c-4ded-aeae-5480d835962f | building; not uploaded (step 4) | the Seal fix for testers |

App Store Connect has TWO records. "Brazos MVP" (Apple ID 6832193439, bundle `app.brazos.mobile`) is the TestFlight target: `eas.json` pins it in both submit profiles, and a test guards the pin. "BRAZOS Dev" (6832350967, `app.brazos.mobile.dev`) is your old personal dev record with the removed design studio; nothing from this run goes there (the first upload of build 9 landed there by mistake, Apple refused it, then it was re-sent with `--id` to Brazos MVP).

## For you (copy-paste, in this order)
1. ~~Apply the lean migration to staging~~ DONE 2026-11-08 (no backup: Backups need the Pro plan and you declined; staging holds test data only).
2. ~~Second test phone~~ DONE 2026-11-08 (`13473208154`, code `123456`).
3. ~~Upload build 9 to TestFlight~~ DONE 2026-11-08: build 9 is on Brazos MVP and installed on your phone. Friends later: App Store Connect → Users and Access → add each with the Marketing role → TestFlight → group "Friends" → add them.
4. **Send build 10 (the publish fix) to TestFlight.** Wait for the EAS mail "Build finished" for build 10, then in a terminal in the repo:
   `npx eas-cli@latest submit --platform ios --profile testflight --id 23bea9d2-bf1c-4ded-aeae-5480d835962f`
   You should see "ASC App ID 6832193439" in its output and "Submitted to App Store Connect". 10-20 min later the TestFlight app on your phone shows an Update button for 1.0.0 (10). If it says anything about `app.brazos.mobile.dev`, stop and paste the output into a chat.
   The phone-test run on the new simulator build (run 7) starts on its own when that build finishes; no click from you.
5. **`.env.example` cleanup (the chat may not open that file).** Remove the lines for EXPO_PUBLIC_POSTHOG_KEY and TWILIO_* and any script names that no longer exist (around lines 11 and 15).
6. **Supabase advisors.** Dashboard → Database → Security Advisor and Performance Advisor → export both; paste into a chat if anything is red.
7. **Optional EAS cleanup.** `eas env:list preview` and delete EXPO_PUBLIC_POSTHOG_KEY and the old MAESTRO_E2E_*_EMAIL / _PASSWORD secrets; confirm the staging edge-function STRIPE_SECRET_KEY starts with `sk_test_` (Supabase → Edge Functions → Secrets).

## Decided for you (flip one with its number)
1. `lean-v1` was merged into `mainexpo` and pushed before the phone tests ran (the plan had it last): GitHub only runs a workflow that exists on `mainexpo`, and `mainexpo` is the one branch a chat may push.
2. The orphan-bucket delete (chat-audio, chat-documents) runs inside the lean migration, so the staging pipeline halts on it until you tick `allow_destructive` (step 1).
3. `graphify-out/` (the code map, 10 MB, rewritten by graphify in the background) is git-ignored instead of committed; regenerate with `graphify extract . --code-only`.

## Open items (BACKLOG.md has the rest)
- e2e: 01 green on both accounts; 02 proven only to the Publish tap; 03-10 unrun until run 7 (new simulator build). A red flow is a flow or app fix, not a blocker for TestFlight.
- Build 9 on TestFlight has the publish bug: on a fast network a posted job can look stuck (the ring keeps turning). The job IS saved; do not tap Publish again, pull the Home list instead. Build 10 fixes it (step 4).
- Maestro's `takeScreenshot` files are not in the run artifacts yet (only junit and the recording); the recording is enough to diagnose.
- `banned_phones` keeps SELECT for signed-in users (zero policies, so no row is readable); a later migration can revoke it.
- `is_blocked_between` still answers for any two users (v1.1).
- Completion and review photos in `job-photos` are public URLs for v1 (v1.2: signed URLs).
- `std@0.224.0` Deno import in `_shared/serviceAuth.ts` is first fetched when staging deploys (step 1).
- Repo is private on the free plan: each e2e run costs macOS minutes at 10x; the workflow is manual-dispatch only (D-v3-10).
