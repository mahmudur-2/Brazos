# HANDOFF

Resume: read this file, then `git log -25 --oneline` and `git status`. Git owns branch, HEAD and tree;
older versions of this file are in git history. Rewritten 2026-11-16 UTC by the directing chat of the run
"PRODUCTION RDY - BRAZOS" (Opus 5.5). The run's full handoff lives outside the repo, on the owner's PC:
`C:\Users\mdmah\runs\production-rdy-brazos-START-HERE.md` (state, rules, method, the next pack, the rest
of the run); its chronological log is `C:\Users\mdmah\runs\production-rdy-brazos-handoff.md`. The
owner's directing prompt and the Karpathy Guide, word for word: project memory
`brazos-directing-prompt-and-guide`. To the owner: Simplified English, his steps in the chat, never
"read this document".

## Now

**The run (owner, 2026-11-14):** "consolidate the entire brazos project and make it almost publish
ready" (no LLC), "least buggy as possible for the future", "I want staging gone", nothing unnecessary,
no feature removed. End goal: "Apple accepts Brazos, and it is safe for real people." Public release
planned for 2027-01-01; iOS only; test money for the whole run; no human testers (robot tests and
Apple's checks only).

**Pack 1, money: done** (14 commits `4d2eb32..74d9b04`, pushed 2026-11-16). A Codex audit (round 1: 53
findings in money, security and database), 13 more Codex rounds and one Gemini read on the money path.
Proof: db:test 60 files, 2554 tests, PASS; verify 1464 of 1464; CI, pgTAP, Staging pipeline and
TestSprite (9/9) green on `74d9b04`. Worker fee 7.5% with no minimum (`20261115000800`, D-v3-3). Known
limits, kept under the owner's rule "no part-refunds by hand in Stripe": `docs/BACKLOG.md`, v1 bugs.

**Staging** has pack 1 (the pipeline applied the nine `20261115*` migrations: never edit them). Full
backup of 2026-11-15 (database and Storage files, before pack 1) in the owner's Google Drive.

**Production** (`brazos-production`, ref `agjwgvclzvjmpqhjutpd`, us-east-1) was last pressed on
2026-11-13 (run 43504460817 at `b850a4b`). It does NOT have pack 1 (nine migrations; create-payment,
process-settlements, send-receipts, stripe-webhook). Test money: Stripe sandbox "Brazos production"
(`acct_1UbCNU3EJxHAJMVZ`, liability acknowledgement completed 2026-11-11). Phone sign-in through Twilio
Verify (service "Brazos", account `AC…9497`); email sign-in off. GitHub environment "Production":
reviewer `mahmudur-2`, branch `mainexpo`, 7 secrets. Proven 2026-11-13 on build 11: sign-in, payout
set-up, a $53.75 test payment, webhook HTTP 200. Not tested then: start, complete, release (ask the
owner). Each press so far printed "Stripe test webhook: made anew": pack 2 fixes that step.

**Phones:** build 11 (1.0.0) in TestFlight = production (`npm run release:production`, by the owner);
build 10 = staging (`testflight` profile). Both profiles build bundle `app.brazos.mobile`, App Store
Connect app `6832193439`. Pack 1's screen and text changes reach a phone only by an over-the-air update
or a new build (the owner's yes each time). The optional secret `PRODUCTION_TEST_OTP` gives one test
sign-in number; each press sets it for 7 more days.

**Next pack (2): deletion, bans, access, the Production button, the phone.** Planned from the real
database (a catalog dump of the local stack), three read-only reader reports and a Codex (Astra) read.
Biggest finding: account deletion keeps what the person shared (reviews, photos, job text, addresses),
all Storage files and the Stripe customer, against Apple's rule 5.1.1(v). Other findings: a ban does
not end sessions; a worker whose offer was not taken can read completion photos; image fields accept
outside URLs; the button's webhook step deletes before it makes; secret jobs install CLI code at run
time; the button does not run db:test. Nothing of pack 2 is built yet.

**Over-the-air update** (owner's yes each time): channel `testflight`, runtime 1.0.0 = build 10, group
`67c92705-9241-429d-a7aa-569e60b8a38b`. How: the four `env` values of eas.json's `testflight` profile in
the shell; `eas env:exec preview "npx expo export --platform ios --clear --output-dir <dir>"`; check the
bundle; `eas update --channel testflight --environment preview --platform ios --skip-bundler
--input-dir <dir>`. Undo: `eas update:roll-back-to-embedded`.

## Blocked

1. **The owner's four pack 2 answers:** what a deleted account keeps; that a ban hides the person's
   profile and written reviews; the words of the admin's push for a new report; the running-late limit
   ("make it a limit of 6": per job in total is the recommended reading).
2. **The Production press is the owner's.** Recommended: once, after pack 2 (pack 2 changes the button;
   its drop of the rating columns needs his `allow_destructive` click on staging and on production).
3. **Owner, after his tests:** release the rented Twilio number (about $1.15 a month); delete the GitHub
   secret `PRODUCTION_TEST_OTP` when no test sign-in number is wanted.
4. **Receipts:** a phone user gets no email (`supabase/functions/send-receipts/index.ts:109`: sign-in
   email only). The run's receipts step adds one optional Email field; it needs a domain (the owner has
   none yet) and his `RESEND_API_KEY` and `RECEIPT_FROM`.
5. **Steps only the owner does** (a chat refuses them): identity or bank values on Stripe's page;
   passwords, keys and tokens; legal acknowledgements; the Production button; anything sent to Apple.
6. **Owner items O1-O8** are in `docs/lean/AUDIT-LEDGER.md`. O1 is closed: the owner's lawyer approved
   the Terms and Privacy (owner, 2026-11-14).

## Next

1. Pack 2, then the run's packs 3 (app data), 4 (proof) and 5 (clean-up); then staging removal (after
   the robot tests have a new place; `scripts/staging-scan.sh` stays), receipts, Sentry, the Apple pack
   (review notes, a demo sign-in, privacy answers, a privacy manifest) and the production phone test
   (start, complete, release; then remove "TEST job delete later" by an allowed path). Order and
   details: the START-HERE file.
2. Before launch, tell the owner the items of the 2026-11-13 handoff's "Next 3" (`git show
   74d9b04:HANDOFF.md`).
3. Read results: `gh run view <id> -R mahmudur-2/Brazos --json status,conclusion,jobs` (`--log-failed`
   after the end). No push to `mainexpo` while a Production run is active.
4. A phone run, if needed (one at a time, about 2 hours, no database or function push meanwhile):
   `gh workflow run e2e-ios.yml -R mahmudur-2/Brazos --ref mainexpo -f build_id=e93b75b2-a5fc-4147-aac9-1391ebc8de54`
   (that simulator build holds the app code of `1633f10`). Result: `gh run view <id> -R
   mahmudur-2/Brazos --log | grep -oE "\[(Passed|Failed)\] .*"`. Artifacts: `gh run download <id>`, then
   decrypt (GPG; key file `C:\Users\mdmah\.brazos-artifact-key`, never print it).
5. `npm run db:test` needs Docker Desktop and `npx supabase start` (project `BRAZOS`, ports 543xx; never
   touch another chat's `brazos-ui-audit` stack, ports 553xx).

## Rules in force

- Production changes only by the owner's button; a chat never starts, approves or re-runs it. A chat
  never contacts a remote Supabase project's API; staging changes only by a push to `mainexpo`. The
  retired project is never contacted. Looks at the Supabase and Stripe dashboards in the owner's Chrome
  are allowed (his word), read only, never a page that shows a key.
- Never read or change `.env`. Never print a secret, a phone number or a sign-in code.
- Never run `npm run release:testflight` or `release:production`. No store submission by a chat.
- Git: stay on `mainexpo`; stage by exact path; push only `git push origin mainexpo` after
  `npm run verify` exits 0 in the same run; never reset --hard, clean, stash, amend or `--no-verify`.
- Never edit `.claude/`. A migration is a new file dated after every other; never edit an applied one.
- No part-refunds by hand in the Stripe dashboard until a later pack fixes the known limit (owner,
  2026-11-15).
- Helpers (owner's rules; project memory `brazos-helper-spawn-rules`): Opus builders, Sonnet readers, a
  named model and effort, the full Karpathy Guide in each brief, plan first for architecture, money and
  security. Critics (owner, 2026-11-16): Codex `gpt-6-astra` at xhigh for money, access, deletion, keys
  and the Production button; `gpt-6.1-sol` at xhigh for the rest.

## Revert

- One change: `git revert <hash>` (list: `git log --oneline 4d2eb32..`). An applied migration is undone
  only by a NEW migration, never by `git revert` (staging has pack 1's).
- Production: the database and functions are applied (runs 43369079390, 43435759116, 43498591852,
  43504460817). The simplest full undo while the project has no users: the owner deletes
  `brazos-production` and makes a new one (new ref in `scripts/supabase-ref.mjs`).
- `b850a4b` (connect-return 302): `git revert b850a4b`, push, one Production press.
- `fb4700b` (Email field + `connect-onboarding`): `git revert fb4700b`, push, then
  `eas update:roll-back-to-embedded` with the owner's yes.
- `064c003` (one privacy sentence): a revert must keep `PRIVACY_VERSION` in step with the text.
- `60d77fe` took `bids`, `direct_threads` and `message_reads` out of staging's realtime list (undo = a
  new migration). B1 (tips, `c8be212`): undo only by a new migration.
- The whole lean run: tag `pre-lean-2026-11`. Website and legal texts (live at
  https://brazos.brazosapp.workers.dev/): `git revert 29554fb`; the live site rolls back in Cloudflare.
