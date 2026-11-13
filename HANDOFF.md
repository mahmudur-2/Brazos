# HANDOFF

Resume: read CLAUDE.md, this file, then `git log -25 --oneline` and `git status`, then do "Next". Git owns
branch, HEAD and tree; older versions of this file are in git history. Written 2026-11-13 by the
orchestrating chat (Fable 5.2), updated the same day by the Opus 5.5 chat that took over as director. Nothing runs. Nothing
waits in the work tree. The owner's directing prompt and the Karpathy Guide, word for word: project
memory `brazos-directing-prompt-and-guide`. To the owner: his steps in the chat, in few words, never
"read this document".

## Now

**The task (owner, 2026-11-11):** fix every open flaw in one run, then production. Production = a NEW
empty Supabase project that changes only by one GitHub button. Test money only (Stripe not live). No LLC
yet. The repo stays public. The old production project is never contacted (the owner paused it).

**Production works end to end in test money (2026-11-13): sign-in, payout set-up, a payment.**
- Owner's test on build 11: a second account (a rented Twilio number, added by the owner) set up
  payouts through Stripe's test onboarding; the client paid $53.75 (Stripe "Brazos production" test
  payments: Succeeded, `pi_3UbR7d3EJxHAJMVZ1bcm7CyN`); the webhook delivery `payment_intent.succeeded`
  got HTTP 200 `{"ok":true}` (read in the owner's Chrome). Not tested yet: start, complete, release.
- Bug the owner saw: the payout return page showed HTML as text. Fixed in `b850a4b` (a 302 to
  `brazos://payouts?from=…`, no page); run 43504460817 PASS, 21 rows, new row "connect-return sends the
  browser back to the app: HTTP 302". Not yet seen on a phone.
- Twilio: the Individual Primary Compliance Profile is approved (error 21608 gone). The optional secret
  `PRODUCTION_TEST_OTP` (owner's value, never seen) gives one test sign-in number; each press sets it
  for 7 more days (now until 2026-11-20).
- Each press says "Stripe test webhook: made anew" (runs 43498591852 and 43504460817): not checked why
  it is not kept.
- New Supabase project `brazos-production`, ref `agjwgvclzvjmpqhjutpd` (us-east-1), made by the owner.
- Stripe sandbox "Brazos production" (`acct_1UbCNU3EJxHAJMVZ`): Connect platform profile complete, the
  liability acknowledgement shows "Completed November 11, 2026"; a worker's payout set-up works there.
- Twilio: account `AC…9497` (paid, the one production uses); the Verify service "Brazos" is reused.
- GitHub environment "Production": reviewer `mahmudur-2`, branch `mainexpo`, 7 secrets present. A custom
  rule `TestSprite` was on; the owner turned it off (the rules API now lists no custom rule).
- **Run 43435759116 (at `78571b9`): "PRODUCTION: PASS", all 20 rows.** The owner made and pasted the
  new token `production button 2` (10 rows: `docs/production/owner-steps.md` step 5). The chat pressed
  the button and approved both steps at the owner's word ("do everything yourself from now on");
  GitHub's record: two approvals by `mahmudur-2` with the chat's comments. Plan `7b938245`: 0 to
  apply, 0 flagged, 70 applied before. Rows: database matches the local build; functions deployed and
  listed; STRIPE_SECRET_KEY set; Stripe test webhook made; timer key stored; send-push HTTP 403,
  connect-status HTTP 401, stripe-webhook HTTP 400 (each the function's own answer); the timers reach
  send-push, process-settlements and send-receipts (HTTP 200); phone sign-in through Twilio Verify,
  email sign-in off.
- expo.dev `production` holds the production Supabase URL, its `sb_publishable_` key and the Stripe
  "Brazos production" publishable key (owner's pastes; Stripe checked by account-id counts, no value
  printed; `preview` keeps "Brazos sandbox"). The sign-in on build 11 proved the Supabase key. The
  build gate does not catch a `sb_publishable_` key of another project and never checks Stripe keys.
- Build 11 (1.0.0) = the owner's `npm run release:production`, in TestFlight.
- The `production` and `testflight` profiles both build variant `production` (bundle
  `app.brazos.mobile`, App Store Connect app `6832193439`): a production build lands in the same
  TestFlight app as the staging builds; build 10 stays installable there for staging.

**Code since the last handoff (pushed; CI run 43370777178 success at `064c003`)**
- `c1ac2a5`: the `production` build profile is pinned to the new ref (`PRODUCTION_REF` in
  `scripts/supabase-ref.mjs`). Proven by tests that start the gate script; no real production build ran.
- `064c003`: one privacy sentence, the owner's yes ("Yes, add it"): the payout set-up email is passed
  to Stripe. `PRIVACY_VERSION` is `2026-11-13`, so every account accepts the policy again after the
  next app update (read in the code, not seen on a device). The website is not rebuilt or uploaded.
- `npm run verify`: exit 0, 1419 pass, 0 fail, 0 skipped (at `064c003`).

**The phone-test bar is met** (runs 43079527505 and 43099685205 at `dd77647`, 10 of 10 each, 0 reruns).
Limits: the simulator build `e93b75b2-a5fc-4147-aac9-1391ebc8de54` holds the app code of `1633f10` (the
Email field of `fb4700b` was seen only on the owner's phone); the tap retry of `dd77647` was never
needed on a device. All rows and proof: `docs/lean/AUDIT-LEDGER.md`, `docs/lean/SHIP-REPORT.md`.
`npm run db:test`: 50 files, 2158 tests, PASS at `dd77647`.

**Over-the-air update** (owner's yes each time): channel `testflight`, runtime 1.0.0 = build 10, group
`67c92705-9241-429d-a7aa-569e60b8a38b` made at `fc8a096`. How: the four `env` values of eas.json's
`testflight` profile in the shell; `eas env:exec preview "npx expo export --platform ios --clear
--output-dir <dir>"`; check the bundle; `eas update --channel testflight --environment preview
--platform ios --skip-bundler --input-dir <dir>`. Undo: `eas update:roll-back-to-embedded`.

## Blocked

**1. Owner, after his tests:** release the rented Twilio number (about $1.15 a month), and delete the
GitHub secret `PRODUCTION_TEST_OTP` if no test sign-in number is wanted after 2026-11-20.

**2. Open flaw, the owner has not decided:** a phone user gets no email receipts
(`supabase/functions/send-receipts/index.ts:109`: sign-in email only).

**3. Steps that only the owner does** (a chat refuses them, also with "full control"): identity or bank
values on Stripe's page; passwords, keys and tokens (also the two key values of step G); legal
acknowledgements; anything sent to Apple.

**4. Owner items O1-O8** are in the ledger. Not answered: arbitration or New York courts; the two URLs
in App Store Connect (O2). The sign-in codes come from Twilio Verify.

## Next

1. **Finish the production test** (owner's phones): the worker starts and completes the job, the
   client releases the money; a new payout set-up should now open the app ("Open in BRAZOS?"). Then
   remove the test job "TEST job delete later" by an allowed path only. The Production button is
   needed again only after a new migration or function change. A new chat asks
   the owner first, reads the plan, and approves only when it shows nothing unexpected. Read results:
   `gh run view <id> -R mahmudur-2/Brazos --json status,conclusion,jobs`, `--log-failed` after the
   end, `gh api repos/mahmudur-2/Brazos/actions/runs/<id>/approvals`. No push to `mainexpo` while a
   Production run is active.
2. Receipts stay off until `RESEND_API_KEY` and `RECEIPT_FROM`; do not change the Stripe webhook.
   Rebuild and upload the website (the privacy text changed; upload = owner).
3. **Tell the owner before launch** (said only in short form; six small items left out): the two limits
   of the bar; a worker types an email at payout set-up; live mode needs the liability acknowledgement
   again; the Maestro bug can still kill a phone run; B3 (exact address only while assigned or in
   progress); B9 (completion photos only while in progress); B12 (a ban records the sign-in phone); the
   B11 texts, and a build with payments `disabled` cannot take bids; the money marks (overdue after 2
   business days, nothing automatic after a card dispute, the 7-day "held long" mark,
   `payment_attention`) and his three answers (`record_settlement_sent`, `settlement_send_reopen`,
   `resolve_tip`); the Earnings texts of B21 and B23; E5 is Home only; the optional test sign-in number on
   production (App Review needs its own sign-in path); before 2027 staging needs the new key in its Vault and an app build with the publishable
   key; Dependabot shows 9 alerts in build tools (N6); Terms §4 against the no-show waiver (N3); the
   deny-lines step in `.claude/settings.json`.
4. **A phone run, if needed** (one at a time, about 2 hours, no database or function push meanwhile):
   `gh workflow run e2e-ios.yml -R mahmudur-2/Brazos --ref mainexpo -f build_id=e93b75b2-a5fc-4147-aac9-1391ebc8de54`
   Result: `gh run view <id> -R mahmudur-2/Brazos --log | grep -oE "\[(Passed|Failed)\] .*"`. Artifacts:
   `gh run download <id>`, then decrypt (GPG; key file `C:\Users\mdmah\.brazos-artifact-key`, never print
   it; the full command is in this file's git history). `.maestro/` files hold no run of 10+ digits.
5. `npm run db:test` needs Docker Desktop and `npx supabase start`.

## Rules in force

- Production changes only by the button. A chat never contacts a remote Supabase project's API; staging
  changes only by a push to `mainexpo`. Looks at the Supabase and Stripe dashboards in the owner's
  Chrome are allowed (owner's word), read only, never a page that shows a key.
- Never read or change `.env`. Never print a secret, a phone number or a sign-in code.
- Never run `npm run release:testflight` or `release:production`. No store submission by a chat.
- Git: stay on `mainexpo`; stage by exact path; push only `git push origin mainexpo` after
  `npm run verify` exits 0 in the same run; never reset --hard, clean, stash, amend or `--no-verify`.
- Never edit `.claude/`. A migration is a new file dated after every other; never edit an applied one.
- Helpers (owner's rules; project memory `brazos-helper-spawn-rules`): Opus builders, Sonnet readers, a
  named model and effort, the full Karpathy Guide in each brief, plan first for architecture, money and
  security. To the owner: Simplified English, the answer first, about ten lines, "Your time: ~N min".

## Revert

- One change: `git revert <hash>` (list: `git log --oneline 2dd4dc0..`). `c1ac2a5` and `064c003` hold no
  migration; a revert of `064c003` must also keep `PRIVACY_VERSION` in step with the text.
- Production: the database and functions are applied (run 43369079390); run 43435759116 added the
  Stripe secret, the webhook, the timer key and the sign-in settings. Undo of a migration is a NEW
  migration, never `git revert`. The simplest full undo while the project is empty of users: the owner
  deletes the project `brazos-production` and makes a new one (new ref in `scripts/supabase-ref.mjs`).
- `b850a4b` (connect-return 302): `git revert b850a4b`, push, one Production press (the old page
  shows as text again).
- `fb4700b` (Email field + `connect-onboarding`): `git revert fb4700b`, push, then
  `eas update:roll-back-to-embedded` with the owner's yes. Payout set-up then fails again.
- Staging has every migration of the lean run; `60d77fe` took `bids`, `direct_threads` and
  `message_reads` out of staging's realtime list (undo = a new migration). B11 undo is money: plan first.
- The whole lean run: tag `pre-lean-2026-11`. Website and legal texts (live at
  https://brazos.brazosapp.workers.dev/): `git revert 29554fb`; the live site rolls back in Cloudflare.
- B1 (tips, `c8be212`): undo only by a new migration; the two functions are named in this file's history.
