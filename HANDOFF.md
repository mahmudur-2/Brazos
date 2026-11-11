# HANDOFF

Resume: read CLAUDE.md, this file, then `git log -25 --oneline` and `git status`, then do "Next". Git owns
branch, HEAD and tree; older versions of this file are in git history. Written 2026-11-11 about 23:45 UTC
by the orchestrating chat (Fable 5.2). Nothing runs. Nothing waits in the work tree.

## Now

**The task (owner, 2026-11-11):** fix every open flaw in one run, then production. Production = a NEW
empty Supabase project that changes only by one GitHub button, which only the owner presses. Test money
only (Stripe not live). No LLC yet. The repo stays public until the phone tests pass. The old production
project is never contacted (the owner pauses it).

**The phone-test bar is met** (ten flows green, two runs in a row, on the final code)
- Run 42 (43079527505, ended 21:02 UTC) and run 43 (43099685205, ended 23:11 UTC): both at `dd77647`,
  10 of 10 `[Passed]`, 0 `RERUN` lines. Run 43's `e2e-reruns/` is empty.
- Limit 1: the simulator build (EAS `e93b75b2-a5fc-4147-aac9-1391ebc8de54`, profile `e2e-test`, the 10th
  iOS build this month) holds the app code of `1633f10`. The only app code after it is the Email field
  of `fb4700b` (`screens/PayoutsScreen.tsx`, `lib/payments/stripe.ts`). No flow shows that field (the
  flows' worker has an account already); it was seen only on the owner's phone. The server side of both
  runs is the final staging code. The chat's advice: accept this; a new build would prove nothing more.
- Limit 2: the new tap retry (`dd77647`) was not needed in run 43 (438 taps, each with its lift). Run
  42's artifacts were not read. So the retry path was never seen at work on a device.

**Done, with proof**
- All fixes are on `mainexpo` and pushed. Each row, its proof and its open parts:
  `docs/lean/AUDIT-LEDGER.md`. The runs and builds: `docs/lean/SHIP-REPORT.md`. Commits:
  `git log --oneline 2dd4dc0..`.
- `npm run verify`: exit 0, 1417 pass, 0 fail, 0 skipped (at `dd77647`; only documents changed after).
- `npm run db:test` on the local stack: 50 files, 2158 tests, PASS (at `dd77647`).
- Staging equals the migration files: pipeline run 43036282885, `prove` 19 of 19 sections PASS (schema
  only). The phone runs then used staging's edge functions (server code at Supabase) from end to end.
- Money to the worker, seen two ways. Run 43's screenshot `06-released.png`: "PAYMENT $53.75, Approved,
  on its way to E2E". Stripe's sandbox ("Brazos sandbox" `acct_1U2Ol543w4QKhn3t`) transfer list: $46.25
  to `acct_1UadyW43w4324f4q` at 20:00 and 22:20 UTC (the approvals of runs 42 and 43). Four more of
  $46.25 at 16:55 UTC, during run 41; the chat's reading, not proven: older released jobs were paid out
  when the worker's payouts turned on.
- `09-payouts.png` (run 43): "Payouts are set up" for the E2E Worker. So the account the owner set up is
  the flows' worker and staging stores it as enabled. B11's card for a worker WITHOUT payouts (in place
  of the bid bar) was still never seen on a device.
- `06-side-cancelled.png` (run 43): the run's side job shows "Cancelled" (E6, `40c3005`, works).
- The waits, the holds and the rerun guard (`1633f10`, `91a2ffb`, `ad3bc58`) ran in two green runs. The
  rerun guard itself never fired on a device (no driver death in runs 41-43).
- The Production button (`.github/workflows/production.yml`) was rehearsed on the local stack only. Only
  the first real press proves its remote steps. Owner's steps: `docs/production/owner-steps.md` (24
  steps, about 77 min, 7 secrets, 2 approvals).

**Payout set-up (fixed 2026-11-11, `fb4700b`)**
- Cause, proven in Stripe's request log: `POST /v2/core/accounts` gave 400 "the Account must have a
  contact email"; a phone user has no email and production is phone-only. Second cause: the sandbox's
  "Refunds and chargebacks liability acknowledgement" (Settings, Connect, Platform profile). The owner
  clicked it. A new Stripe account or live mode needs it again.
- Fix: Payouts shows an Email field while no account exists; `connect-onboarding` sends it as
  `contact_email` when it creates the account, never stores or logs it.
- Proven on the owner's phone (TestFlight build 10 `9b0064f` + an over-the-air update): Stripe's log
  16:02 UTC, accounts 200, then account_links 200. The owner did Stripe's page as the test worker.
- The over-the-air update (owner's yes each time): channel `testflight`, runtime 1.0.0 = build 10,
  update group `67c92705-9241-429d-a7aa-569e60b8a38b`, made at `fc8a096`; it holds ALL app code since
  build 10. How: the four `env` values of eas.json's `testflight` profile in the shell; `eas env:exec
  preview "npx expo export --platform ios --clear --output-dir <dir>"` (without `--clear` a stale cache
  left the Stripe key out); check the bundle; `eas update --channel testflight --environment preview
  --platform ios --skip-bundler --input-dir <dir>`. Undo: `eas update:roll-back-to-embedded`.

**Phone-test history**
- Run 39 (43009644487, `2dd4dc0`): 9 of 10; flow 02 died of the Maestro driver bug
  (mobile-dev-inc/maestro#3538). Run 40: cancelled at the owner's word; shows nothing.
- Run 41 (43055784999, `8be419f`): 7 of 10. Flows 02 and 05 red: the simulator lost the finger-lift of
  2 taps in 369 (its log: touch-down, then a cancel, no lift), both on a Home screen. Home's pulsing dot
  (`components/LiveDot.tsx`) makes Maestro judge "something changed", so Maestro did not retry. Flow 06
  red only because 05 stopped. Not an app flaw: a real finger lifts. Why the simulator drops a lift is
  not known.
- Fix `dd77647` (flow files only): `.maestro/subflows/home-tap.yml` taps again (at most 3 tries) while
  the next screen does not show; the two worker searches search again, then retype.
- Run 41 left test data on staging: its main job paid and held, never started; its side job open with a
  $45 counter. Test money only.
- The temp files of this run (about 11 GB, with the downloaded proof of runs 41 and 43) were deleted at
  the owner's word. The run artifacts stay at GitHub (encrypted) for as long as GitHub keeps them.

## Blocked

**1. Nothing blocks a chat.** The next step is the owner's: production.

**2. Open flaw, not fixed, the owner has not decided:** a phone user gets no email receipts
(`supabase/functions/send-receipts/index.ts:109`: sign-in email only). The privacy text
(`lib/legal/privacyPolicy.ts:169-172`) does not say that the app passes an email to Stripe at payout
set-up. A change to the privacy text is a legal text: the owner's word first.

**3. Steps that only the owner does** (a chat refuses them, also under "bypass permissions"): identity
or bank values on Stripe's page (also Stripe's public test values, also by a script); passwords, keys
and secrets; a new account or project; the Production button and its approvals; anything sent to Apple.

**4. Owner items O1-O8** are in the ledger. Not answered yet: arbitration or New York courts; which
company sends the production sign-in codes; the two URLs in App Store Connect (O2).

## Next

1. **Tell the owner before production** (not said yet; say it in short groups, then ask for his word):
   Blocked 2; the two limits of the bar (Now); a new Stripe account or live mode needs the liability
   acknowledgement again; a worker types an email at payout set-up; the Maestro bug or a lost tap can
   still kill a phone run (test tool, not the app); B3 (the exact address only while a job is assigned
   or in progress); B9 (completion photos only while in progress); B12 (a ban records the sign-in
   phone); the B11 texts, and that a build with payments `disabled` cannot take bids; the money marks
   (overdue after 2 business days, nothing automatic after a card dispute, the 7-day "held long" mark,
   `payment_attention`) and his three answers (`record_settlement_sent`, `settlement_send_reopen`,
   `resolve_tip`); the Earnings texts of B21 and B23; E5 is Home only; on production email receipts
   are off until a Resend key is added, and there is no test sign-in number; before 2027 staging needs
   the new key in its Vault and an app build with the publishable key; Dependabot shows 9 alerts in
   build tools (N6); Terms §4 against the no-show waiver (N3); the deny-lines step in
   `.claude/settings.json`.
2. **Owner: production** by `docs/production/owner-steps.md`. The chat asks one yes/no question before
   each production action and never presses the button. The owner approves within one day of the press.
3. **If a phone run is needed again** (one at a time, about 2 hours, no database or function push while
   it runs): `gh workflow run e2e-ios.yml -R mahmudur-2/Brazos --ref mainexpo -f build_id=e93b75b2-a5fc-4147-aac9-1391ebc8de54`
   Result: `gh run view <id> -R mahmudur-2/Brazos --log | grep -oE "\[(Passed|Failed)\] .*"`. Reruns:
   grep `RERUN [0-9]{2}-` (the workflow's own script line also holds the word). Artifacts:
   `gh run download <id>`, then decrypt (GPG; key file `C:\Users\mdmah\.brazos-artifact-key`, never
   print it; the full command is in this file's git history). A lost lift shows in a flow's
   `logs/device-simulator.log`: more `Touch entered` lines than `contact 2 presence: none` lines.
   `.maestro/` files must hold no run of 10 or more digits (`tests/maestroFlows.test.mjs`).
4. `npm run db:test` needs Docker Desktop (`%LOCALAPPDATA%\Programs\DockerDesktop`) and
   `npx supabase start`.

## Rules in force

- No chat touches production: never start, approve or re-run the Production workflow (`gh` here is
  signed in as the owner, so only this rule stops it). Never contact a remote Supabase project; staging
  changes only by a push to `mainexpo`.
- Never read or change `.env`. Never print a secret, a phone number or a sign-in code.
- Never run `npm run release:testflight` or `release:production`. No store submission by a chat.
- Git: stay on `mainexpo`; stage by exact path; push only `git push origin mainexpo` after
  `npm run verify` exits 0 in the same run; never reset --hard, clean, stash, amend or `--no-verify`.
- Never edit `.claude/`. A migration is a new file dated after every other; never edit an applied one.
- Helpers (owner's rules; project memory `brazos-helper-spawn-rules`): Opus builders, Sonnet readers, a
  named model and effort, the full Karpathy Guide in each brief, plan first for architecture, money and
  security. To the owner: Simplified English, the answer first, about ten lines, "Your time: ~N min".

## Revert

- One change: `git revert <hash>` (list: `git log --oneline 2dd4dc0..`). The flow and workflow commits
  (`1633f10`, `40c3005`, `91a2ffb`, `ad3bc58`, `dd77647`) hold no app or server code.
- `fb4700b` (Email field + `connect-onboarding`): `git revert fb4700b`, push (the pipeline deploys the
  function), then `eas update:roll-back-to-embedded` with the owner's yes. Payout set-up then fails again.
- A commit that holds a migration is never undone by `git revert` (that removes an applied file). Staging
  has every migration of this run: undo is a NEW migration. `60d77fe` took `bids`, `direct_threads` and
  `message_reads` out of staging's realtime list (nothing listens to them); undo = a new migration that
  adds them. B11 undo (a worker without payouts can bid again) is money: plan first.
- Production was never touched. The old production project was never contacted.
- The whole lean run: tag `pre-lean-2026-11` (`git checkout -b restore pre-lean-2026-11`).
- Website and legal texts (live at https://brazos.brazosapp.workers.dev/): `git revert 29554fb`; the live
  site rolls back in Cloudflare (Workers & Pages, `brazos`, Deployments, Rollback).
- B1 (tips, `c8be212`): undo only by a new migration; the two functions to restore are named in this
  file's git history.
