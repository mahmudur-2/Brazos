# HANDOFF

Resume: read this file, then `git log -30 --oneline` and `git status`. Git owns branch, HEAD and tree;
older versions of this file are in git history. Rewritten 2026-11-18 UTC by the directing chat (Fable)
at the end of the owner's 48-hour production run. The run's full records are on the owner's PC and not
in git (this repository is public): `docs/RELEASE_DOSSIER.md` (the report to the owner: what changed,
each proof, the limits, his steps), `docs/PRODUCTION_LEDGER.md` (decisions D1 to D110 and the work log)
and `%USERPROFILE%\runs\production-36h\STATE-NOW.md`. The owner's directing prompt and the Karpathy
Guide, word for word: project memory `brazos-directing-prompt-and-guide`. To the owner: Simplified
English, his steps in the chat, never "read this document".

## Now

**The run (2026-11-16 06:35 UTC to 2026-11-18).** The owner's goal: "make BRAZOS 100% production-ready
... in one continuous autonomous operation without compromising quality". Test money for the whole run;
nothing went to production, Apple or real money. 22 commits `b8c420b..79b1dc1` (list: `git log
--oneline 9d1c56d..`), 433 files, and then this documents commit:
- Production button (`b8c420b`, `798c141`, `beae402`, `79f161e`): approval only after the database
  tests pass; the Expo tool and the Supabase tool run only from pinned and checked bytes; a service key
  can never ship in an app build; the button never deletes a Stripe webhook or a saved secret; a
  signed, never-charged test event proves the webhook; the migration scan reads SQL statements.
- Access, bans, deletion (`3934244`, `33020d4`, `4e4a4de`): a suspended account is stopped at the
  server; a deleted account is cleaned up; two lookups closed; unused table rights removed.
- Money and lifecycle (`448551e`, `482f17a`, `77f63b4`, `ab73c81`, `ea1b1fe`, `41eabd9`): the owner's
  payment list in plain words; each timer reports its runs; automatic approval 72 hours after "work is
  done" (7 days at the latest); the admin's attention list with decisions; the record of a work start;
  payment repairs; no money or account screen says a thing that the app does not know.
- App (`b2b470e`, `79b1dc1`): the new look and the in-place structure, light and dark (305 files); the
  posting bar's main button is fully on the screen on the iPhone.
- The robot phone flows for the new look (`a45554a`, `35ecc5b`, `c7c38cb`, `90c7f11`); postcss updated
  by one `overrides` line (`105b7c4`, four security alerts closed).

**Proof on `79b1dc1`:** `npm run verify` 1888 of 1888 (this PC and CI run 44186984456). Robot phone
test 10 of 10 flows (run 44187304448: a simulated iPhone against staging, from sign-in to account
deletion; no flow covers the admin list). Database tests 3656 in 96 files (pgTAP run 44046342174; no
database file changed after it). Staging pipeline green on `41eabd9` (no server file changed after
it). TestSprite green on staging (run 44089530106). Five rules broken on purpose on a throwaway copy
(a ban, a deleted account, the completion photos, a change of money state, an admin-only path): 5 of 5
turned a test red. Readers of the raw diffs: an independent Opus reader for each landing in money,
access, deletion, bans and the button; the Gemini CLI in packets (it has gaps). **Not proved:** a real
iPhone, real money, a person on production.

**Staging** has all of it. Every migration up to `20261116420000` is applied there: never edit one.

**Production** (`brazos-production`, us-east-1) was pressed by the owner on 2026-11-18 03:28 UTC (run
44228429661, Production #6, at `e91fbf2`, `allow_destructive` checked): plan `bfea8f0a` "32 to apply,
12 flagged, 70 applied before", then all 25 rows of the PRODUCTION table PASS (the database matches the
local build; functions deployed; the Stripe test webhook updated in place and a signed test event
reached it; the timers answered with HTTP 200; "Admin account: PRODUCTION_ADMIN_USER_ID not set"). So
production has all 102 migration files, pack 1 and this run, and the new button workflow has run for
real. The sign-in row says one test sign-in number works until 2026-11-25. Test money: Stripe sandbox "Brazos production" (`acct_1UbCNU3EJxHAJMVZ`). Phone sign-in
through Twilio Verify; email sign-in off. GitHub environment "Production": the reviewer is the owner's
account, branch `mainexpo`, 8 secrets; the optional secret `PRODUCTION_ADMIN_USER_ID` is not set.

**Phones:** TestFlight build 11 (1.0.0) = production (channel `production`; made with `npm run
release:production` by the owner). Builds 9 and 10 = staging (`testflight` profile, channel
`testflight`). **Over-the-air update of 2026-11-18 00:49 UTC:** group
`cd09d3cc-cfb0-449b-9a99-27ee1b82c152`, channel `testflight`, runtime 1.0.0, iOS. It carries all app
code from build 10 (2026-11-08) to `79b1dc1`, exported in the `preview` environment (checked in the
bundle: staging values, the Stripe test key, no production ref). Build 11 does not get it. The update
before it: group `67c92705-9241-429d-a7aa-569e60b8a38b` (`fb4700b`). Since build 10 no dependency,
plugin or native folder changed (`package.json`: one `overrides` line and a pinned Expo tool in three
scripts; `app.config.ts`: a check of the key's kind and the privacy manifest). The privacy manifest
reaches a phone only with a new store build.

How to send an update (the owner's yes each time): the four `env` values of eas.json's `testflight`
profile in the shell; `eas env:exec preview "npx expo export --platform ios --clear --output-dir
<dir>"`; check the bundle; `eas update --channel testflight --environment preview --platform ios
--skip-bundler --input-dir <dir>`. An update carries ALL app code since the build. The rule of this
run: no update before a green phone run on the same commit.

## Blocked

1. **The Production press: done** (2026-11-18, run 44228429661, PRODUCTION: PASS). The owner pressed
   after the Gemini read (in packets, with gaps); the full Codex audit of `git diff 77f63b4..HEAD`
   stays a condition before real money (item 5).
2. **The admin on production:** after the press, the owner's own account on production, then the
   secret `PRODUCTION_ADMIN_USER_ID` (his User UID) and one more press. Without it the admin's
   attention list on production has no admin.
3. **A look on a real iPhone.** No person and no machine saw this version on one: the dark customer
   home, the nav bar, the 120 Hz feel, the keyboard, the safe areas, light and dark.
4. **Before the public date (2027-01-01):** one new store build by the owner (the privacy manifest).
5. **Before real money** (it needs the owner's LLC and live Stripe keys): the Codex audit of item 1;
   clear the stored Stripe test ids; the first money items of `docs/BACKLOG.md` (a tip that one person
   starts on two phones; a first payment that settles late).
6. **Receipts:** a phone user gets no email. It needs a small feature (a person adds an email), a
   domain (the owner has none yet) and his `RESEND_API_KEY` and `RECEIPT_FROM`.
7. **Steps only the owner does** (a chat refuses them): identity or bank values on Stripe's page;
   passwords, keys and tokens; legal acknowledgements; the Production button; anything sent to Apple.
8. **From the earlier handoff, not checked in this run:** release the rented Twilio number; delete the
   secret `PRODUCTION_TEST_OTP` when no test sign-in number is wanted; the owner items O2 to O8 in
   `docs/lean/AUDIT-LEDGER.md`.

## Next

1. After the press: the production phone test of the earlier plan (start, complete and release on
   production with test money; then remove "TEST job delete later" by an allowed path).
2. `docs/BACKLOG.md`. First: the two rare double-charge cases (today the server refunds the extra
   charge by itself), the suspension gate in the app, the gaps of the migration scan.
3. Open from the earlier plan and not done in this run: staging removal (after the robot tests have a
   new place), email receipts, the Apple pack (review notes, a demo sign-in, privacy answers).
4. Read results: `gh run view <id> --json status,conclusion,jobs` (`--log-failed` after the end). No
   push to `mainexpo` while a Production run is active.
5. A phone run (one at a time, about 2.5 hours; a second start cancels a running one): `gh workflow run
   e2e-ios.yml --ref mainexpo -f build_this_commit=true` makes one paid Expo build of the commit (the
   owner allowed 7 for this run and 4 are used: ask him before the next). With no input the workflow
   tests the latest finished `e2e-test` build. Result: `gh run view <id> --log`, then search for
   `[Passed]` and `[Failed]`. Only a simulator or phone run proves a layout on the iPhone: the web
   measures some boxes differently (`79b1dc1`). In this run no chat opened the encrypted results or
   used the owner's key file; a failure was read from the public log lines.
6. `npm run db:test` needs Docker Desktop and `npx supabase start` (never touch another chat's
   `brazos-ui-audit` stack, ports 553xx).

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
- No part-refunds by hand in the Stripe dashboard (owner, 2026-11-15).
- The lawyer-approved Terms and Privacy (`lib/legal/`) never change without the owner, and they win
  over a built behaviour.
- Helpers (owner's rules; project memory `brazos-helper-spawn-rules`): Opus builders, Sonnet readers, a
  named model and effort, the full Karpathy Guide in each brief, plan first for architecture, money and
  security. Critics: Codex `gpt-6-astra` at xhigh for money, access, deletion, keys and the Production
  button and `gpt-6.1-sol` for the rest (owner, 2026-11-16). In the run that ended 2026-11-18 Codex had
  no usage, so the critics were the Gemini CLI and an independent Opus reader that gets the raw diff.

## Revert

- One change: `git revert <hash>` (list: `git log --oneline 4d2eb32..`). An applied migration is undone
  only by a NEW migration, never by `git revert` (staging has every migration up to `20261116420000`).
- The app update of 2026-11-18, with the owner's yes: `eas update:republish --group
  67c92705-9241-429d-a7aa-569e60b8a38b` (back to the update before it) or `eas
  update:roll-back-to-embedded --channel testflight` (back to the build's own code).
- Production: the database and functions are applied (runs 43369079390, 43435759116, 43498591852,
  43504460817, 44228429661). The simplest full undo while the project has no users: the owner deletes
  `brazos-production` and makes a new one (new ref in `scripts/supabase-ref.mjs`).
- `b850a4b` (connect-return 302): `git revert b850a4b`, push, one Production press.
- `fb4700b` (Email field + `connect-onboarding`): `git revert fb4700b`, push, then a new update.
- `064c003` (one privacy sentence): a revert must keep `PRIVACY_VERSION` in step with the text.
- `60d77fe` took `bids`, `direct_threads` and `message_reads` out of staging's realtime list (undo = a
  new migration). B1 (tips, `c8be212`): undo only by a new migration.
- The whole lean run: tag `pre-lean-2026-11`. Website and legal texts (live at
  https://brazos.brazosapp.workers.dev/): `git revert 29554fb`; the live site rolls back in Cloudflare.
