# HANDOFF

Resume: read CLAUDE.md, this file, then `git log -25 --oneline` and `git status`, then do "Next". Git owns
branch, HEAD and tree; older versions of this file are in git history. Written 2026-11-11 about 15:00 UTC
by the orchestrating chat (Fable 5.2). The owner said "pause all process": the helpers, the watchers and
phone run 40 are stopped. Nothing runs. Nothing waits in the work tree.

## Now

**The task (owner, 2026-11-11):** fix every open flaw in one run, then production. Production = a NEW
empty Supabase project that changes only by one GitHub button, which only the owner presses. Test money
only (Stripe not live). No LLC yet. The repo stays public until the phone tests pass. The old production
project is never contacted (the owner pauses it).

**Done, with proof**
- All fixes are on `mainexpo` and pushed. Batch B is fixed (B19 stays; owner: "its ok"); each row, its
  proof and its open parts: `docs/lean/AUDIT-LEDGER.md`. This chat's commits: `git log --oneline 2dd4dc0..`
  (among them the access-rights fix `5dc2ce8` and the realtime clean-up `60d77fe`).
- `npm run verify`: exit 0, 1410 pass, 0 fail, 0 skipped (this chat, on the final tree).
- `npm run db:test` on the local stack: 50 files, 2158 tests, PASS (at `60d77fe`; no database file
  changed after it).
- Staging equals the migration files: pipeline run 43036282885, `prove` 19 of 19 sections PASS. That
  compares the schema only. No edge function (server code at Supabase) was called on staging after its
  deploy.
- The Production button (`.github/workflows/production.yml`) was rehearsed on the local stack only. Only
  the first real press proves its remote steps. Owner's steps: `docs/production/owner-steps.md` (24
  steps, about 77 min, 7 secrets, 2 approvals).
- Simulator build for the phone tests: EAS `e93b75b2-a5fc-4147-aac9-1391ebc8de54` (profile `e2e-test`,
  commit `1633f10`, the 10th iOS build this month). App code did not change after `1633f10`: it is the
  final build. The owner's phone has TestFlight build 10 (`9b0064f`).

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

**0. The cause of 1 is PROVEN (a later chat, 2026-11-11 about 16:30 UTC; this beats the "open causes"
list in 1).** The owner allowed the chat to read Stripe and the Supabase dashboard in his Chrome. Staging's
Stripe key belongs to the sandbox "Brazos sandbox" (`acct_1U2Ol543w4QKhn3t`), not to "Test mode". Its
request log holds three `POST /v2/core/accounts` → 400 at 14:39 UTC. Two causes, both seen:
- (i) Stripe's answer in the log: `invalid_fields` · "If configuration.recipient is supplied, the Account
  must have a contact email." A phone user has no email anywhere (not in `auth.users`, no column, no
  screen), and production is phone-only, so NO user can set up payouts. An account without the recipient
  part is refused too (`dashboard` needs it): tried in the sandbox's Workbench shell.
- (ii) The same request PLUS a test email, tried in that shell: `account_creation_losses_collector_
  unavailable`. With `losses_collector: stripe` Stripe says a recipient-only account can only use
  `application`. Reason: the sandbox's Connect platform profile (Settings → Connect → Platform profile)
  says "Onboarding incomplete" and its "Refunds and chargebacks liability acknowledgement" is not
  acknowledged. Only the owner clicks "Acknowledge". `POST /v1/accounts` (Express, no email) gives the same
  error, so it is not yet known if v1 works without an email.
- Not a cause: the idempotency key (API v2 runs a failed request again). No test account was created.
- Next: owner clicks Acknowledge → the chat repeats both shell tests (exact body + email; v1 without
  email) → pick the fix for (i): v1 create (server only, Stripe's page asks for the email, no new build) if
  a v1 account works with `connect-status`'s v2 read and the v2 account link; else an email input in the
  app (new build). Money and a critical folder: the builder reports its plan first.

**1. Payout set-up fails on staging.** The owner tried it on his phone (build 10, signed in as the test
worker, 2026-11-11 about 14:40 UTC). Profile → Earnings & payouts → Set up payouts gives: "Could not
start payout setup. The payment provider is unavailable right now. Nothing changed." The page still
says "Payouts aren't set up yet".
- Source of the sentence: `supabase/functions/connect-onboarding/index.ts` answers HTTP 502 with it when
  Stripe refuses `POST /v2/core/accounts` (line 190) or `POST /v2/core/account_links` (line 232). The
  app shows the same sentence for any other 502 (`lib/payments/stripeRules.ts`).
- The status is still "none", so the account create is the likely failure (a conclusion, not seen).
- The cause is ONE log line on staging: `connect-onboarding: account create <status>: <type · code ·
  message>` (or `account link ...`). It holds no secret. No chat has read it: a chat does not contact a
  remote Supabase project.
- Not the cause, by reading: the old build (its 15 calls on this path fit today's server); this run's
  code (3 new lines in the function, the hourly limit of `f0d2faa`; the Stripe call is from
  2026-08-29). Unlikely, by run 39: a wrong key or an unknown version `2026-08-26.dahlia` (flow 04
  paid by card with both through `create-payment`).
- Never proven: no record shows that payout set-up, or a transfer to a worker, ever ran on staging or
  on a device.
- Open causes, most likely first, none checked: (a) the Stripe test account has not turned on Connect,
  has no finished platform profile, or has no access to Accounts v2; (b) Stripe refuses the request
  body (the test worker signs in by phone, so no `contact_email` is sent); (c) the idempotency key
  `brazos-account-<user id>` replays the first failed answer for about a day; (d) the key is a
  restricted key with no Connect rights; (e) the function crashed or timed out (a gateway 502).

**2. Phone flows 03-07 and 09 cannot pass** until the test worker ("E2E Worker") has payouts on: since
B11 a worker without payouts cannot bid, counter, accept or be hired (ledger O8).

**3. Steps that only the owner does** (a chat refuses them, also under "bypass permissions"): identity
or bank values on Stripe's page (also Stripe's public test values, also by a script); passwords, keys
and secrets; a new account or project; the Production button and its approvals; anything sent to Apple.

**4. Owner items O1-O8** are in the ledger. Not answered yet: arbitration or New York courts; which
company sends the production sign-in codes; the two URLs in App Store Connect (O2).

## Next

1. **Chat, no owner time:** try to see the error on the local stack. Start Docker Desktop, `npx supabase
   start`, call `connect-onboarding` as a local test user (B10's proof called each function this way:
   ledger row B10) and read the local log line. The answer "not configured" means the local stack has
   no Stripe key: go to step 2. Never read `.env`.
2. **Owner, about 3 min:** Supabase dashboard → staging project → Edge Functions → `connect-onboarding`
   → Logs. Tap "Set up payouts" in the app one more time, then send the newest line that starts with
   `connect-onboarding:`. Second source: Stripe dashboard in test mode → Developers → Logs → the failed
   `POST /v2/core/accounts`.
3. **Fix by cause.** (a) and (d) are owner clicks in the Stripe dashboard: write them one by one. (b)
   and (e) are code in a critical folder and money: an Opus builder reports its plan first, then a
   local test, then a push (the pipeline deploys). (c): wait a day, or change the key's text.
4. **Prove the path before the owner tries again.** The lesson of this run: he got this step before
   anyone had run it. Then the **owner, about 10 min:** payout set-up as the test worker until the page
   says "Payouts are set up". Test sign-in number and code: Supabase dashboard → Authentication → Sign
   In / Providers → Phone → test numbers. Values for Stripe's page: Stripe's public "Testing Connect"
   page.
5. **Phone runs**, one at a time, about 2 hours each, no database or function push while one runs:
   `gh workflow run e2e-ios.yml -R mahmudur-2/Brazos --ref mainexpo -f build_id=e93b75b2-a5fc-4147-aac9-1391ebc8de54`
   Result: `gh run view <id> -R mahmudur-2/Brazos --log | grep -oE "\[(Passed|Failed)\] .*"`. Red:
   `gh run download <id>`, then decrypt (GPG; key file `C:\Users\mdmah\.brazos-artifact-key`, never
   print it; the full command is in this file's git history). A green run with a `RERUN` line counts as
   "green after one driver death": tell the owner. Known gaps: keyboard-closing taps in flows 07-10
   were not checked (flow 10 has one, in its no-blocker branch); with payouts on, test money really
   moves to the worker for the first time, so flows 05-09 can show texts that no run has seen.
6. **Final gate:** `npm run verify`, `npm run db:test`. Then the records: the ledger (its "local only"
   line is out of date; O8; E3, E4, E6; a new row for `60d77fe`) and `docs/lean/SHIP-REPORT.md` (runs 39
   and 40, build `e93b75b2`, the rerun guard, the holds).
7. **Owner:** production by `docs/production/owner-steps.md`. The chat asks one yes/no question before
   each production action. The owner approves within one day of the press.
8. **Tell the owner before production** (not said yet): the Maestro bug can still kill a run; B3 (the
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
