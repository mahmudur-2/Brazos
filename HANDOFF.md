# HANDOFF

Resume: read CLAUDE.md, this file, then `git log -25 --oneline` and `git status`, then do "Next". Git owns
branch, HEAD and tree; older versions of this file are in git history. Written 2026-11-11 about 16:00 UTC
by the orchestrating chat (Fable 5.2). Phone run 40 was stopped at the owner's word. Nothing runs. Nothing waits in the work tree.

## Now

**The task (owner, 2026-11-11):** fix every open flaw in one run, then production. Production = a NEW
empty Supabase project that changes only by one GitHub button, which only the owner presses. Test money
only (Stripe not live). No LLC yet. The repo stays public until the phone tests pass. The old production
project is never contacted (the owner pauses it).

**Done, with proof**
- All fixes are on `mainexpo` and pushed. Batch B is fixed (B19 stays; owner: "its ok"); each row, its
  proof and its open parts: `docs/lean/AUDIT-LEDGER.md`. This chat's commits: `git log --oneline 2dd4dc0..`
  (among them the access-rights fix `5dc2ce8` and the realtime clean-up `60d77fe`).
- `npm run verify`: exit 0, 1417 pass, 0 fail, 0 skipped (at `fb4700b`).
- `npm run db:test` on the local stack: 50 files, 2158 tests, PASS (at `60d77fe`; no database file
  changed after it).
- Staging equals the migration files: pipeline run 43036282885, `prove` 19 of 19 sections PASS. That
  compares the schema only. No edge function (server code at Supabase) was called on staging after its
  deploy.
- The Production button (`.github/workflows/production.yml`) was rehearsed on the local stack only. Only
  the first real press proves its remote steps. Owner's steps: `docs/production/owner-steps.md` (24
  steps, about 77 min, 7 secrets, 2 approvals).
- Simulator build for the phone tests: EAS `e93b75b2-a5fc-4147-aac9-1391ebc8de54` (profile `e2e-test`,
  commit `1633f10`, the 10th iOS build this month). App code changed once after
  `1633f10`: the Email field of `fb4700b` (Blocked 1). The owner's phone has TestFlight build 10
  (`9b0064f`).

**Landed, not proven on a device** (flow files and the workflow only)
- `1633f10`: an 18 s wait after each app launch. `40c3005`: flow 06 cancels its side job (E6).
- `91a2ffb`: a flow runs one more time after a Maestro driver death (`DeviceUnreachableException`); only
  flows 01, 07, 09, 10; attempt 1 is kept in `e2e-reruns/`; a `RERUN` line goes to the log and the run
  summary. Tested only as a dry run on Windows.
- `ad3bc58`: a 6 s hold after each keyboard-closing tap in the sign-in and flows 02-06 (12 holds).
- B11 (`83219cf`): the new payout card and its texts were never seen on a phone.

**Phone tests** (the bar: ten flows green, two runs in a row, on the final code)
- Run 39 (43009644487, `2dd4dc0`): 9 of 10. Flow 02 died of the Maestro driver bug
  (mobile-dev-inc/maestro#3538): a screen read in flight when iOS retires its keyboard process, about
  4.8 s after a keyboard-closing tap or 8-14 s after a launch (a helper measured runs 37-39; this chat
  did not check the numbers). The waits and holds above are the answer.
- Run 40 (43036821370, `60d77fe`): cancelled after 27 min at the owner's word. GitHub kept no log and no
  artifact, so it shows nothing. No run on the final code yet.
- Temp files of this chat (about 3 GB, run 38 artifacts, safe to delete):
  `C:\Users\mdmah\AppData\Local\Temp\claude\c0009c647868b50f\24e8eca1-c2ee-4dee-91dd-7aea6fecc9f7\scratchpad`

## Blocked

**1. Payout set-up STARTS on staging (proven 2026-11-11, 16:02 UTC); the worker is not yet set up.**
- Cause, proven in Stripe's request log (sandbox "Brazos sandbox" `acct_1U2Ol543w4QKhn3t`; staging's key
  belongs to it, not to "Test mode"): `POST /v2/core/accounts` → 400 "the Account must have a contact
  email". A phone user has no email anywhere and production is phone-only: no worker could set up
  payouts. No way around it (tried in the sandbox's Workbench shell): without the recipient part
  `dashboard` is refused; `POST /v1/accounts` is refused for this platform.
- Second cause, gone: the sandbox's "Refunds and chargebacks liability acknowledgement" (Settings →
  Connect → Platform profile). The owner clicked it. A new Stripe account or live mode needs it again.
- Fix `fb4700b` (pipeline 43052135870 green, function deployed): Payouts shows an Email field while no
  account exists; `connect-onboarding` reads `{"email"}` only when it creates the account, sends it as
  `contact_email`, never stores or logs it (`connect-onboarding/account.mjs`, tested). No email → 400
  "update Brazos"; Stripe's `email_invalid` → 400 "check it".
- Proven in the shell at the pinned version: the exact create body + an email → 200; the exact
  account-link body → 200; the read has the fields `connect-status/classify.mjs` uses. The chat's two
  test accounts are closed.
- Proven on the owner's phone (build 10 + the update below): the Email field showed, Stripe's page
  opened. Stripe's log at 16:02 UTC: `POST /v2/core/accounts` 200 (from Deno, pinned version, with
  `contact_email` and the key `brazos-account-…`), then `POST /v2/core/account_links` 200.
- NOT proven: Stripe's page to its end, `connect-status` after it, a transfer to the worker. The e2e
  build holds the old app code; it has no update channel and needs no field once the test worker
  has an account.
- Delivery, done with the owner's yes: an over-the-air update on channel `testflight` (runtime 1.0.0 =
  build 10; update group `67c92705-9241-429d-a7aa-569e60b8a38b`, made at `fc8a096`). It holds ALL app
  code since build 10 (`9b0064f`), not only the field. How: the four `env` values of eas.json's
  `testflight` profile in the shell; `eas env:exec preview "npx expo export --platform ios --clear
  --output-dir <dir>"` (without `--clear` a stale Metro cache left the Stripe key out of the bundle);
  check the bundle; `eas update --channel testflight --environment preview --platform ios
  --skip-bundler --input-dir <dir>`. Undo: `eas update:roll-back-to-embedded`.
- New, not fixed: a phone user gets no email receipts (`send-receipts/index.ts:109`: sign-in email
  only). The privacy text (`lib/legal/privacyPolicy.ts:169-172`) does not say the app passes an email
  to Stripe.

**2. Phone flows 03-07 and 09 cannot pass** until the test worker ("E2E Worker") has payouts on: since
B11 a worker without payouts cannot bid, counter, accept or be hired (ledger O8).

**3. Steps that only the owner does** (a chat refuses them, also under "bypass permissions"): identity
or bank values on Stripe's page (also Stripe's public test values, also by a script); passwords, keys
and secrets; a new account or project; the Production button and its approvals; anything sent to Apple.

**4. Owner items O1-O8** are in the ledger. Not answered yet: arbitration or New York courts; which
company sends the production sign-in codes; the two URLs in App Store Connect (O2).

## Next

1. Done: payout set-up starts (Blocked 1). The lesson of this run: prove a step before the owner
   gets it.
2. **Owner, about 10 min:** Stripe's page as the test worker until the app says "Payouts are set up".
   Test sign-in number and code: Supabase dashboard → Authentication → Sign In / Providers → Phone →
   test numbers. Values for Stripe's page: Stripe's public "Testing Connect" page.
3. **Phone runs**, one at a time, about 2 hours each, no database or function push while one runs:
   `gh workflow run e2e-ios.yml -R mahmudur-2/Brazos --ref mainexpo -f build_id=e93b75b2-a5fc-4147-aac9-1391ebc8de54`
   Result: `gh run view <id> -R mahmudur-2/Brazos --log | grep -oE "\[(Passed|Failed)\] .*"`. Red:
   `gh run download <id>`, then decrypt (GPG; key file `C:\Users\mdmah\.brazos-artifact-key`, never
   print it; the full command is in this file's git history). A green run with a `RERUN` line counts as
   "green after one driver death": tell the owner. Known gaps: keyboard-closing taps in flows 07-10
   were not checked (flow 10 has one, in its no-blocker branch); with payouts on, test money really
   moves to the worker for the first time, so flows 05-09 can show texts that no run has seen.
4. **Final gate:** `npm run verify`, `npm run db:test`. Then the records: the ledger (its "local only"
   line is out of date; O8; E3, E4, E6; a new row for `60d77fe`) and `docs/lean/SHIP-REPORT.md` (runs 39
   and 40, build `e93b75b2`, the rerun guard, the holds).
5. **Owner:** production by `docs/production/owner-steps.md`. The chat asks one yes/no question before
   each production action. The owner approves within one day of the press.
6. **Tell the owner before production** (not said yet): the Maestro bug can still kill a run; B3 (the
   exact address only while a job is assigned or in progress); B9 (completion photos only while in
   progress); B12 (a ban records the sign-in phone); the B11 texts, and that a build with payments
   `disabled` cannot take bids; the money marks (overdue after 2 business days, nothing automatic after
   a card dispute, the 7-day "held long" mark, `payment_attention`) and his three answers
   (`record_settlement_sent`, `settlement_send_reopen`, `resolve_tip`); the Earnings texts of B21 and
   B23; E5 is Home only; on production email receipts are off until a Resend key is added, and there
   is no test sign-in number; before 2027 staging needs the new key in its Vault and an app build with
   the publishable key; Dependabot shows 9 alerts in build tools (N6); Terms §4 against the no-show
   waiver (N3); the deny-lines step in `.claude/settings.json`.

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
  (`1633f10`, `40c3005`, `91a2ffb`, `ad3bc58`) hold no app or server code.
- A commit that holds a migration is never undone by `git revert` (that removes an applied file). Staging
  has every migration of this run: undo is a NEW migration. `60d77fe` took `bids`, `direct_threads` and
  `message_reads` out of staging's realtime list (nothing listens to them); undo = a new migration that
  adds them. B11 undo (a worker without payouts can bid again) is money: plan first.
- Production was never touched. The old production project was never contacted.
- The whole lean run: tag `pre-lean-2026-11` (`git checkout -b restore pre-lean-2026-11`).
- Website and legal texts (live at https://brazos.brazosapp.workers.dev/): `git revert 29554fb`; the live
  site rolls back in Cloudflare (Workers & Pages → `brazos` → Deployments → Rollback).
- B1 (tips, `c8be212`): undo only by a new migration; the two functions to restore are named in this
  file's git history.
