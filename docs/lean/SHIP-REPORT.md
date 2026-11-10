# SHIP-REPORT (lean v1 run, 2026-11-07 → 2026-11-08)

Your time: ~0 min right now. Steps 1-4 done on 2026-11-08; 5-7 are optional; step 8 was done on 2026-11-09 (the repo is public, the phone-test loop is running on its own).
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
| e2e iOS run 7 (simulator build on the Seal fix) | 01 green; 02: both publishes, the draft and Edit job pass (the Seal fix holds), red at the last step: the "All services" sheet is open but its rows are folded into one accessibility element (fixed in the next commit, `accessible={false}`, as ActionSheet already had) | https://github.com/mahmudur-2/Brazos/actions/runs/42528070363 |
| e2e iOS run 8 (simulator build `e0edf633…`, the sheet fix) | 02 red: the mode row's label hides its title, so "You're in Customer mode" never matched (F8, 44a400f: the subflows and flows 08/09 look for "Switch to Worker/Customer") | https://github.com/mahmudur-2/Brazos/actions/runs/42531302624 |
| e2e iOS run 9 | 02 green for the first time; 03 red: the sheet's exit pill reads "Back to …" not "Back" (F9, 225beb2) | https://github.com/mahmudur-2/Brazos/actions/runs/42532514287 |
| e2e iOS run 10 | 03 green; 04 red at Pay: Stripe's keyboard covers the Pay button and Maestro's `hideKeyboard` fails on Stripe's sheet (F10, 8be5cf4) | https://github.com/mahmudur-2/Brazos/actions/runs/42534310198 |
| e2e iOS run 11 | 04 still red at Pay (F10 did not close the keyboard; F11, 33e3633: a tap beside the ZIP field closes it) | https://github.com/mahmudur-2/Brazos/actions/runs/42536357242 |
| e2e iOS run 12 | 04 green (card, Pay, escrow held); 02 red: the "Not published yet" draft card sat under the tab bar (F12, acb7a4b: scroll it to the centre first) | https://github.com/mahmudur-2/Brazos/actions/runs/42537623943 |
| e2e iOS run 13 | 01-04 green; 05 red: "Send counter-offer" under the tab bar (F13, 1c6bf00) | https://github.com/mahmudur-2/Brazos/actions/runs/42540144005 |
| e2e iOS run 14 | 03 red: "Pending bids" below the fold on a hub that grew with each run's jobs (F14, d4ede89) | https://github.com/mahmudur-2/Brazos/actions/runs/42542230849 |
| e2e iOS run 15 | runner fault ("Device became unreachable"), rerun as 16 | https://github.com/mahmudur-2/Brazos/actions/runs/42542970067 |
| e2e iOS run 16 | 05 red: no "Running 10 minutes late" chip. The Mac runs on UTC, so after 7 PM New York the job was "tomorrow" (F15, 5554483: the runner uses America/New_York; BACKLOG notes the wizard's device-local "Today") | https://github.com/mahmudur-2/Brazos/actions/runs/42545672277 |
| e2e iOS run 17 | 05 red: the late chip's tap hit the floating "I'm here" bar (F16, b6c93cc); then the photo picker's confirm has no "Add" label on the runner's iOS (F17, 30bb03c) | https://github.com/mahmudur-2/Brazos/actions/runs/42548237428 |
| e2e iOS run 18 | **01-05 green** (post, bid, counter, pay, on my way, late, start, photo, complete); 06 approved and released the payment, rated 5 stars, red at "Submit review": the keyboard covered it (F18, 06f79f5) | https://github.com/mahmudur-2/Brazos/actions/runs/42550933715 |
| e2e iOS run 19 | not started: GitHub refused the Mac job, "recent account payments have failed or your spending limit needs to be increased" (the free Mac minutes are used up; step 8) | https://github.com/mahmudur-2/Brazos/actions/runs/42553851982 |
| e2e iOS run 20 (first run on the PUBLIC repo) | red at Install Maestro: github.com's download edge answered 504 six times (F19, 299b682: second route via `gh release download`) | https://github.com/mahmudur-2/Brazos/actions/runs/42581519233 |
| e2e iOS run 21 | same 504s (started before F19 landed) | https://github.com/mahmudur-2/Brazos/actions/runs/42582199145 |
| e2e iOS run 22 | 01 green in 9m35 (4m30 before: public-repo Macs run about half as fast); 02 red at the "Not published yet" scroll with the card on screen for 3 minutes, one hierarchy read outran the 20 s budget (F20, 6617ded: every scrollUntilVisible gets 60 s) | https://github.com/mahmudur-2/Brazos/actions/runs/42582975936 |
| e2e iOS run 23 | red in 2 minutes: "iOS driver not ready in time" at Maestro's 2-minute default (F21, 8b67879: ten minutes, and one retry when no flow ran) | https://github.com/mahmudur-2/Brazos/actions/runs/42587396408 |
| e2e iOS run 24 | 01, 02, 03 green (7m30, 11m08, 8m37), 04 nine minutes in when the job's own 45-minute limit cancelled it (F22, 2414cf5: the job gets 180 minutes; ten flows need about two hours on these Macs) | https://github.com/mahmudur-2/Brazos/actions/runs/42588458764 |
| e2e iOS run 25 | red in 01-auth: the tap on Welcome's "Continue with email" was lost (Welcome's rim light never stops; F23, 2cc09c2: `subflows/welcome-tap.yml` retries the tap while the next screen is not up) | https://github.com/mahmudur-2/Brazos/actions/runs/42595077494 |
| e2e iOS run 26 (simulator build `e0edf633…`, F23) | 01-04 green (11m32, 12m31, 9m45, 5m47); 05 red at the photo picker: it sat on "Loading..." for a minute and the 30 s wait ran out (F24: `subflows/open-photo-picker.yml` closes a stuck picker and reopens it, used by 02 and 05) | https://github.com/mahmudur-2/Brazos/actions/runs/42793635889 |

Two earlier e2e attempts died downloading Maestro (installer CDN 504/503); the workflow now installs the pinned release with retries. Maestro stops at the first red flow, so flows 07-10 have never run and 06 is proven only up to its review step. On the private repo the free plan's $12 of monthly compute (macOS $0.062/min) ran out after about 304 Mac minutes and GitHub refused every job, Linux too. On 2026-11-09 the owner made the repo public: public repos run on standard runners for free, with no cap. Price: the public Macs run about half as fast (run 22), and the repo's docs are readable by anyone (the history was scanned first: no key, token or password; the test phone numbers and one-time code left the docs in 7917fbd and the owner rotated the code).

## Builds (EAS, free plan)
| profile | id | status | what it is |
|---|---|---|---|
| e2e-test (simulator) | 68b4d69c-b3ec-4973-8b53-8e3d222bc41d | FINISHED; used by runs 1-6 | the app the Mac runner tests (has the Seal bug) |
| testflight (store, build 9) | bfb47ced-8fb9-41ba-a4cd-2c083602f2b1 | on TestFlight (Brazos MVP) and on your phone since 2026-11-08 | staging backend + Stripe TEST keys; bundle `app.brazos.mobile`; has the Seal bug |
| e2e-test (simulator, 9b0064f) | bd7ca0f1-7b5a-4982-a3d5-5bbfc24d5680 | FINISHED | run 7 and later |
| testflight (store, build 10, 9b0064f) | 23bea9d2-bf1c-4ded-aeae-5480d835962f | FINISHED; uploaded to Brazos MVP 2026-11-08 17:11 | the Seal fix for testers |
| e2e-test (simulator, f0be185) | e0edf633-cd7d-4f6e-9712-afa3881b0102 | FINISHED | runs 8-18; the Seal fix plus the "All services" sheet fix. The only app change since build 10 is that sheet fix, so a build 11 is optional |

App Store Connect has TWO records. "Brazos MVP" (Apple ID 6832193439, bundle `app.brazos.mobile`) is the TestFlight target: `eas.json` pins it in both submit profiles, and a test guards the pin. "BRAZOS Dev" (6832350967, `app.brazos.mobile.dev`) is your old personal dev record with the removed design studio; nothing from this run goes there (the first upload of build 9 landed there by mistake, Apple refused it, then it was re-sent with `--id` to Brazos MVP).

## For you (copy-paste, in this order)
1. ~~Apply the lean migration to staging~~ DONE 2026-11-08 (no backup: Backups need the Pro plan and you declined; staging holds test data only).
2. ~~Second test phone~~ DONE 2026-11-08 (number and code live in the GitHub secrets and the Supabase dashboard, not here: the repo is public).
3. ~~Upload build 9 to TestFlight~~ DONE 2026-11-08: build 9 is on Brazos MVP and installed on your phone. Friends later: App Store Connect → Users and Access → add each with the Marketing role → TestFlight → group "Friends" → add them.
4. ~~Send build 10 (the publish fix) to TestFlight~~ DONE 2026-11-08 17:11: uploaded to Brazos MVP (6832193439); Apple processes it in 5-10 min, then the TestFlight app on your phone offers Update to 1.0.0 (10). A later build needs the same one line, run inside `C:\Users\mdmah\BRAZOS`:
   `npx eas-cli@latest submit --platform ios --profile testflight --id <build id from the chat>`
5. **`.env.example` cleanup (the chat may not open that file).** Remove the lines for EXPO_PUBLIC_POSTHOG_KEY and TWILIO_* and any script names that no longer exist (around lines 11 and 15).
6. **Supabase advisors.** Dashboard → Database → Security Advisor and Performance Advisor → export both; paste into a chat if anything is red.
7. **Optional EAS cleanup.** `eas env:list preview` and delete EXPO_PUBLIC_POSTHOG_KEY and the old MAESTRO_E2E_*_EMAIL / _PASSWORD secrets; confirm the staging edge-function STRIPE_SECRET_KEY starts with `sk_test_` (Supabase → Edge Functions → Secrets).
8. **Done 2026-11-09.** You made the repo public, so GitHub runs the Mac phone tests for free again; the OTP was rotated and the test numbers left the docs first. Nothing to do: the chat dispatches `gh workflow run e2e-ios.yml --ref mainexpo -f build_id=e0edf633-cd7d-4f6e-9712-afa3881b0102`, fixes red flows and re-runs until all ten are green (HANDOFF.md "Next" has the loop). Make the repo private again later if you want; then Mac minutes cost money again.

## Decided for you (flip one with its number)
1. `lean-v1` was merged into `mainexpo` and pushed before the phone tests ran (the plan had it last): GitHub only runs a workflow that exists on `mainexpo`, and `mainexpo` is the one branch a chat may push.
2. The orphan-bucket delete (chat-audio, chat-documents) runs inside the lean migration, so the staging pipeline halts on it until you tick `allow_destructive` (step 1).
3. `graphify-out/` (the code map, 10 MB, rewritten by graphify in the background) is git-ignored instead of committed; regenerate with `graphify extract . --code-only`.

## Open items (BACKLOG.md has the rest)
- e2e: flows 01-05 green in one run (run 18) on simulator build `e0edf633…`; 06 red at "Submit review" with a flow fix pushed but unproven (06f79f5); 07-10 have never run. Runs 20-24 on the public repo fixed four runner problems (F19-F22: Maestro download route, scroll timeouts, driver start-up, job limit); run 24 proved 01-03 green on these Macs; run 25 is the first with all four. 14 distinct problems were found and fixed on 2026-11-08 (two in the app: the Seal race and the sheet; the rest in the flows or the runner). A red flow is a flow or app fix, not a blocker for TestFlight.
- Staging holds the test jobs of runs 3-25 (titles `E2E <run id>`); flow 10 deletes each run's account when it passes, and until then the hubs grow with each run.
- Build 9 on TestFlight has the publish bug: on a fast network a posted job can look stuck (the ring keeps turning). The job IS saved; do not tap Publish again, pull the Home list instead. Build 10 fixes it (step 4).
- Maestro's `takeScreenshot` files are not in the run artifacts yet (only junit and the recording); the recording is enough to diagnose.
- `banned_phones` keeps SELECT for signed-in users (zero policies, so no row is readable); a later migration can revoke it.
- `is_blocked_between` still answers for any two users (v1.1).
- Completion and review photos in `job-photos` are public URLs for v1 (v1.2: signed URLs).
- `std@0.224.0` Deno import in `_shared/serviceAuth.ts` is first fetched when staging deploys (step 1).
- Repo is PUBLIC since 2026-11-09 (free unlimited Actions minutes, slower Macs); the workflow is manual-dispatch only (D-v3-10). Secrets live only in GitHub secrets and the Supabase dashboard.
