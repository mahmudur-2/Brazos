# HANDOFF

Resume: read CLAUDE.md, this file, then `git log -25 --oneline` and `git status`, then do "Next". Git owns
branch, HEAD and tree; older versions of this file are in git history. Written 2026-11-13 by the
orchestrating chat (Fable 5.2). Nothing runs. Nothing waits in the work tree.

## Now

**The task (owner, 2026-11-11):** fix every open flaw in one run, then production. Production = a NEW
empty Supabase project that changes only by one GitHub button. Test money only (Stripe not live). No LLC
yet. The repo stays public. The old production project is never contacted (the owner paused it).

**Production set-up: started, not complete (2026-11-13)**
- New Supabase project `brazos-production`, ref `agjwgvclzvjmpqhjutpd` (us-east-1), made by the owner.
- Stripe sandbox "Brazos production" (`acct_1UbCNU3EJxHAJMVZ`): Connect platform profile complete, the
  liability acknowledgement shows "Completed November 11, 2026". Not proven: a worker's payout set-up
  there (the profile says liability "Stripe"; the code sends `losses_collector: 'application'`).
- Twilio: the account has credit; the Verify service "Brazos" (SMS + email) existed and is reused.
- GitHub environment "Production": reviewer `mahmudur-2`, branch `mainexpo`, 7 secrets present. A custom
  rule `TestSprite` was on; the owner turned it off (the rules API now lists no custom rule).
- **Run 43369079390** (at `4dae46c`): the owner pressed the button and approved both steps (GitHub's
  record: two approvals by `mahmudur-2`). PASS: Safety checks, Project is running, Project keys, Link,
  the migration list, Plan unchanged, Apply the migrations, "Database matches the local build", Deploy
  the edge functions, List the edge functions. **FAIL: Function secret STRIPE_SECRET_KEY, HTTP 403.**
  Not run: Stripe test webhook, Timer key stored, the three refuse checks, Timers reach the functions,
  Sign-in settings.
- **Run 43373752766** (at `64fb589`): after the owner's "Pasted", the chat pressed the button and
  approved both steps (GitHub's record: two approvals by `mahmudur-2`, each comment says "Approved by
  the chat at the owner's word"). Plan `82e580fc`: 0 to apply, 0 flagged. Same result: PASS up to
  "List the edge functions", then **FAIL: Function secret STRIPE_SECRET_KEY, HTTP 403**.
- So production HAS the full database and the edge functions. It has NO Stripe function secret, no
  Stripe webhook, no timer key and no phone sign-in settings. The app cannot work against it yet.
- Cause (seen in Supabase after the second run): the token list holds only `production button`
  ("last used" = the time of the second run); no `production button 2` exists. Its "View permissions":
  9 rows, and the row "Edge Function Secrets" is missing. So the new token was never made, and the
  value pasted into GitHub was the old token. Supabase's docs: that endpoint needs
  `edge_functions_secrets_write` and no other permission. A token cannot be changed. The 10 rows:
  `docs/production/owner-steps.md` step 5. Whether the other 9 rows are enough for the steps that did
  not run is proven only by the next run.
- Left ready in the owner's Chrome, a second time (gone if Chrome reloads the tab): the Supabase form
  for `production button 2` at its last step (10 rows seen on the review page, project
  `brazos-production` only, never expires as the first one), and GitHub's "Update secret" dialog for
  `SUPABASE_ACCESS_TOKEN`.

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

**1. The new Supabase token is the owner's step.** Its value shows on the screen once; a chat must not
see, copy or type a token. Owner: click "Create token" (this click was missed the first time), copy,
paste into GitHub's `SUPABASE_ACCESS_TOKEN`, Update secret. Check before a new press (read only):
the token list shows `production button 2`. The old token is deleted only after a PASS.

**2. Open flaw, the owner has not decided:** a phone user gets no email receipts
(`supabase/functions/send-receipts/index.ts:109`: sign-in email only).

**3. Steps that only the owner does** (a chat refuses them, also with "full control"): identity or bank
values on Stripe's page; passwords, keys and tokens (also the three expo.dev values of step G); legal
acknowledgements; anything sent to Apple.

**4. Owner items O1-O8** are in the ledger. Not answered: arbitration or New York courts; the two URLs
in App Store Connect (O2). The sign-in codes come from Twilio Verify.

## Next

1. **After the owner's paste: the Production button again** (new plan, two approvals). The owner's word
   to the chat of 2026-11-13: "any necessary steps, please make them yourselves ... Fully autonomously
   complete this entire thing". That chat told the owner first, then pressed and approved run
   43373752766 (the plan showed nothing to apply). A new chat asks the owner first.
   Read results (read only): `gh run view <id> -R mahmudur-2/Brazos --json status,conclusion,jobs`,
   `--log-failed` after the end, `gh api repos/mahmudur-2/Brazos/actions/runs/<id>/approvals`.
   No push to `mainexpo` while a Production run is active.
2. **After "PRODUCTION: PASS"** (owner-steps part G): the three expo.dev values of the `production`
   environment (owner); receipts stay off until `RESEND_API_KEY` and `RECEIPT_FROM`; do not change the
   Stripe webhook. Then rebuild and upload the website (the privacy text changed; upload = owner).
3. **Tell the owner before launch** (said only in short form; six small items left out): the two limits
   of the bar; a worker types an email at payout set-up; live mode needs the liability acknowledgement
   again; the Maestro bug can still kill a phone run; B3 (exact address only while assigned or in
   progress); B9 (completion photos only while in progress); B12 (a ban records the sign-in phone); the
   B11 texts, and a build with payments `disabled` cannot take bids; the money marks (overdue after 2
   business days, nothing automatic after a card dispute, the 7-day "held long" mark,
   `payment_attention`) and his three answers (`record_settlement_sent`, `settlement_send_reopen`,
   `resolve_tip`); the Earnings texts of B21 and B23; E5 is Home only; no test sign-in number on
   production; before 2027 staging needs the new key in its Vault and an app build with the publishable
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
- Production: the database and functions of run 43369079390 are applied (43373752766 changed nothing). Undo of a migration is a NEW
  migration, never `git revert`. The simplest full undo while the project is empty of users: the owner
  deletes the project `brazos-production` and makes a new one (new ref in `scripts/supabase-ref.mjs`).
- `fb4700b` (Email field + `connect-onboarding`): `git revert fb4700b`, push, then
  `eas update:roll-back-to-embedded` with the owner's yes. Payout set-up then fails again.
- Staging has every migration of the lean run; `60d77fe` took `bids`, `direct_threads` and
  `message_reads` out of staging's realtime list (undo = a new migration). B11 undo is money: plan first.
- The whole lean run: tag `pre-lean-2026-11`. Website and legal texts (live at
  https://brazos.brazosapp.workers.dev/): `git revert 29554fb`; the live site rolls back in Cloudflare.
- B1 (tips, `c8be212`): undo only by a new migration; the two functions are named in this file's history.
