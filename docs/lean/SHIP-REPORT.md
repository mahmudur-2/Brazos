# SHIP-REPORT (lean v1 run, 2026-11-07 → 2026-11-08)

Your time: ~15 min (7 "For you" steps below, in order; 1-3 min each).
Undo of the whole run: `git checkout -b restore pre-lean-2026-11` (the tag made before any change). Nothing on staging or production was changed by the run.

## What happened
- The repo was cut from 1497 tracked files to 691 and the docs from 570 files to 17. Web, PWA, Android, the practice-money path, three unused edge functions, every mockup and the old plan docs are gone (archived under git history and `_archive/`).
- Security blockers B1-B5 fixed (grants, storage flags, constant-time service auth, pinned build modes, audit 37 → 19).
- Tests: 1239 node checks, 1782 pgTAP checks, 47 TestSprite contract checks against staging, 10 Maestro flows for the phone.
- Two EAS builds finished: a simulator build for the phone tests and TestFlight build 9 (not uploaded: that is your click, step 3).
- `lean-v1` was merged into `mainexpo` and pushed once CI was green; later fixes landed on `mainexpo`.

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

Two earlier e2e attempts died downloading Maestro (installer CDN 504/503); the workflow now installs the pinned release with retries. Flows 02-10 have not run yet: they start after account B can sign in (steps 2 then 4), and their first run will likely need a few selector fixes, as 01 did.

## Builds (EAS, free plan)
| profile | id | status | what it is |
|---|---|---|---|
| e2e-test (simulator) | 68b4d69c-b3ec-4973-8b53-8e3d222bc41d | FINISHED | the app the Mac runner tests |
| testflight (store, build 9) | bfb47ced-8fb9-41ba-a4cd-2c083602f2b1 | FINISHED, not uploaded | staging backend + Stripe TEST keys; bundle `app.brazos.mobile` |

## For you (copy-paste, in this order)
1. **Apply the lean migration to staging (after a backup).** Supabase dashboard → project Brazos Staging → Database → Backups → take one now. Then GitHub → Actions → "Staging pipeline" → Run workflow → branch `mainexpo` → tick `allow_destructive` → Run. You should see the migrate job green and the deploy job deploying 9 functions. If it fails: the log names the line; paste it to a chat. The migration drops the practice-money tables, old columns and two orphan buckets; the chat-audio/chat-documents FILES on staging stay until you delete them in Storage.
2. **Second test phone for the phone tests.** Supabase dashboard → Authentication → Providers → Phone → Test phone numbers → add `13473208154` with code `123456` (the first one, `13473208153`, is already there). Save.
3. **Upload build 9 to TestFlight.** In a terminal in the repo:
   `npx eas-cli@latest submit --platform ios --profile testflight --latest`
   It asks for your Apple sign-in once. You should see "Submitted to App Store Connect". Then App Store Connect → TestFlight → Internal Testing → add your 5 friends. If the app id lookup fails, pick "Brazos MVP" from the list it shows.
4. **Phone-test run 3 (right after step 2; ~10-30 Mac minutes).** GitHub → Actions → "e2e iOS" → Run workflow → branch `mainexpo` → leave build_id empty → Run. Green = all ten flows passed. Red = paste the run link into a chat; the fix is a flow edit, no new build. Results: the run's Artifacts (junit, screen recording).
5. **`.env.example` cleanup (the chat may not open that file).** Remove the lines for EXPO_PUBLIC_POSTHOG_KEY and TWILIO_* and any script names that no longer exist (around lines 11 and 15).
6. **Supabase advisors.** Dashboard → Database → Security Advisor and Performance Advisor → export both; paste into a chat if anything is red.
7. **Optional EAS cleanup.** `eas env:list preview` and delete EXPO_PUBLIC_POSTHOG_KEY and the old MAESTRO_E2E_*_EMAIL / _PASSWORD secrets; confirm the staging edge-function STRIPE_SECRET_KEY starts with `sk_test_` (Supabase → Edge Functions → Secrets).

## Decided for you (flip one with its number)
1. `lean-v1` was merged into `mainexpo` and pushed before the phone tests ran (the plan had it last): GitHub only runs a workflow that exists on `mainexpo`, and `mainexpo` is the one branch a chat may push.
2. The orphan-bucket delete (chat-audio, chat-documents) runs inside the lean migration, so the staging pipeline halts on it until you tick `allow_destructive` (step 1).
3. `graphify-out/` (the code map, 10 MB, rewritten by graphify in the background) is git-ignored instead of committed; regenerate with `graphify extract . --code-only`.

## Open items (BACKLOG.md has the rest)
- e2e: flows 02-10 unproven until step 4; a red flow is a flow or app fix, not a blocker for TestFlight.
- Maestro's `takeScreenshot` files are not in the run artifacts yet (only junit and the recording); the recording is enough to diagnose.
- `banned_phones` keeps SELECT for signed-in users (zero policies, so no row is readable); a later migration can revoke it.
- `is_blocked_between` still answers for any two users (v1.1).
- Completion and review photos in `job-photos` are public URLs for v1 (v1.2: signed URLs).
- `std@0.224.0` Deno import in `_shared/serviceAuth.ts` is first fetched when staging deploys (step 1).
- Repo is private on the free plan: each e2e run costs macOS minutes at 10x; the workflow is manual-dispatch only (D-v3-10).
