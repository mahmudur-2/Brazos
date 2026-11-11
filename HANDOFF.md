# HANDOFF

Resume: read CLAUDE.md, this file, then `git log -12 --oneline` and `git status`, then do "Next". Git owns
branch, HEAD and tree; older sections of this file are in git history. Written 2026-11-10 ~21:30Z by the
orchestrating chat (Opus 5.5), which stopped at the owner's weekly token cap (10% used; hard stop 15%).
The website lines were rewritten 2026-11-11 ~07:00Z by the website chat (Fable 5.2); it did not touch the
e2e loop, so every e2e line below is as the orchestrating chat left it. The B1 (tip) lines were
written 2026-11-11 ~06:35Z by the B1 chat (Fable 5.2); it did not touch the e2e loop either.

## Now

- Lean v1 of Brazos (iOS, Expo) is on `mainexpo`. The open task: all ten Maestro flows green on GitHub
  Actions (public repo, free Macs), TWICE in a row on the final build (lean plan F4), then the H3 final
  gate (verify, db:test, e2e, TestSprite), SHIP-REPORT, this file, push, one short owner message.
- **Run 37 is RUNNING**: https://github.com/mahmudur-2/Brazos/actions/runs/42903515400 (head 0d454ae,
  F33), simulator build `c14fa739-532f-4cfe-a3f8-d96b1974a3a7`. Ten flows take ~90 min.
- Proven: run 32 had 01-07 green in one run; runs 33-36 each went red on Mac timing, fixed in the flows
  (F31-F33) or re-run (35: driver lost the simulator). **08, 09, 10 have never passed.** Expect one or
  two fixes each: the normal shape of this work.
- Build `c14fa739…` holds the app fixes P1-P5, F25, F29. Every later fix (F26-F28, F30-F33) is
  flow-only, so no new build is needed unless an app bug shows up.
- The audit (2026-11-10): `docs/lean/AUDIT-LEDGER.md` is the single list of every flaw: fixed, open from
  e2e (E3-E6), batch B deferred (database and payments), owner items O1-O7, later.
- **B1 is fixed** (c8be212, `supabase/migrations/20261111000000_tip_settlement.sql`, blueprint
  `docs/critical/tip-settlement.md`): a charged tip is now `held`, queued in `transfers_due` for the
  whole tip, sent by `process-settlements`, and `released` only by `transfer.created`. The app says
  "on its way" until then. The review found a second hole and it is closed in the same migration: a
  tip row's amount is never rewritten, and a tip is queued only when the amount received equals the
  row's charge. Proven on the local stack. On staging the pipeline applied it
  (https://github.com/mahmudur-2/Brazos/actions/runs/42972896348: verify, migrate, deploy all
  green; "List migrations (after)" shows `20261111000000` on both sides). Not tried with a real
  test-mode tip on a phone. Production: the owner applies the file by hand, as always.
- Build `c14fa739…` holds the OLD tip screen: its poll waits for `released`, so on it a paid tip is
  not confirmed on screen until the transfer lands (read from the old classifier, not run on a
  phone). The next app build carries the new wording. No Maestro flow pays a tip (flow 06 only
  checks "Add a tip?" is visible).
- The public website (brief: `docs/lean/WEBSITE-BRIEF.md`) is **live** at
  https://brazos.brazosapp.workers.dev/ (built by G19, 29554fb): Terms and Privacy rewritten for launch
  in `lib/legal/` (version `2026-11-11`, the draft notice removed at the owner's word),
  `node scripts/build-site.mjs` writes `site/` (git-ignored) in the look the owner picked (C "Ledger":
  no logo, no image, light and dark from the device). The owner uploaded `site/` to Cloudflare as a
  Worker with static assets named `brazos` (not Pages; HTML handling `auto-trailing-slash`, not found
  `404-page`); the account's workers.dev subdomain is `brazosapp`. Checked with curl 2026-11-11
  ~06:45Z: `/`, `/support`, `/privacy`, `/terms` return 200 and equal the built files byte for byte,
  an unknown path returns the built 404 page, the `_headers` rules are applied, no cookie is set.
  Still the owner's: paste `/privacy` and `/support` into App Store Connect (ledger O2; not confirmed).
- The new legal version asks every existing account to accept again on its next open of a build that
  holds it. Build `c14fa739…` still holds the draft4 text; the next app build picks up the new one.
- Run 37 (after this file was first written): 01-02 green, 03 red with no Maestro message; artifacts
  not yet read.
- Gates on c8be212: `npm run verify` 1282 pass, 0 fail; `npm run db:test` on the local stack 34 files,
  1805 tests, PASS, none skipped (`320_tip_settlement.sql` is new: 22 tests).

## Blocked

- Nothing blocks the loop. Owner-only items are O1-O7 in the ledger (lawyer review, public privacy and
  support URLs, OTP rotation, App Review payment path, production env check, production auth settings,
  branch protection).
- Website, owner only: pasting the two URLs into App Store Connect (O2). Open questions
  the owner has not answered: arbitration or New York courts (as written); which company sends the
  production sign-in codes (the policy says "a text-message provider"). No company owns Brazos yet, so
  the Terms name "the operator of Brazos": form an LLC, then put its name and address in section 1
  and bump the version (O1).
- What the new Terms say and the code does not yet do: Brazos "may recover" money lost to a card
  dispute (B13). A tip "goes to the Worker" is now true in the code (B1, c8be212) once the migration
  is on the database the app talks to.
- Owner decision (ledger B19): tips charged before the fix were never transferred and the fix does
  not touch them. Staging is Stripe test mode and production has no users, so "leave them" is a
  fair answer; a one-off requeue is the other.

## Next

1. `gh run list -R mahmudur-2/Brazos -w e2e-ios.yml -L 1`. Running → `gh run watch <id> --exit-status`
   in the background. None running → dispatch:
   `gh workflow run e2e-ios.yml -R mahmudur-2/Brazos --ref mainexpo -f build_id=c14fa739-532f-4cfe-a3f8-d96b1974a3a7`
2. Result: `gh run view <id> --log | grep -oE "\[(Passed|Failed)\] .*"`. Ten passed → dispatch the
   same again; two all-green in a row → step 5.
3. Red: `gh run download <id> -R mahmudur-2/Brazos -D <scratchpad>/r<n>`, then decrypt (the artifact is
   GPG-encrypted; the key file is `C:\Users\mdmah\.brazos-artifact-key`, never print it):
   `gpg --batch --pinentry-mode loopback --passphrase-file /c/Users/mdmah/.brazos-artifact-key -d <dl>/e2e-ios/e2e-results.tar.gpg | tar -x -C <dir>`.
   Look at `e2e-debug/.maestro/tests/*/<flow>/screenshots/` (the failing step's PNG) and the matching
   `screen-hierarchy/*.json` (grep `accessibilityText`). `e2e-junit.xml` has the exception.
4. Decide: a Mac timing loss (lost tap, slow picker, dropped digit) → flow fix with a bounded retry
   (`repeat ... while`, `optional: true` waits); a real app bug → code fix + unit test + a new build
   (`npx --yes eas-cli@27.7.0 build --platform ios --profile e2e-test --non-interactive --no-wait --json`,
   wait for FINISHED, use the new id). Then `npm run verify`, stage exact paths, `git diff --cached
   --name-status`, commit `lean F<n>: <what> (run <n>: <why>)` (next is F34), `git push origin mainexpo`,
   add the SHIP-REPORT row, re-dispatch. Reuse `subflows/` (welcome-tap, launch-recover,
   open-photo-picker, sign-in-phone, sign-out) before writing a new retry.
5. Two all-green: H3 gate. `npm run verify`; `npm run db:test` on the local stack (start Docker Desktop
   `%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe`, `npx supabase start`, `npm run db:reset`,
   `npm run db:test`; baseline 34 files, 1805 tests); TestSprite per the lean plan. Then SHIP-REPORT,
   ledger, this file, push, a short owner message with both run links.
6. Then batch B (ledger; B1 is done): start with B5 (fee math overflows above
   ~$28.6k), B6 (realtime publication missing on a fresh project), B3 (hired worker reads the address
   forever), B8 (no-show worker gets the cancellation fee). Each first gets a pgTAP test that fails on
   today's schema; critical folders, so Fable blueprint, Opus build, Fable review. Then E3/E4 (stale
   inbox stage and pending chain after flow 06) on the local stack, then E5 (notification opens the job
   in place), E6 (test jobs pile up; tied to B15).

## Rules in force

- Never contact production Supabase; never read or modify `.env`; staging only through the pipeline.
- Never print a secret, phone number or OTP; redact long numbers in any output you paste.
- Stage by explicit path; never reset --hard, clean, stash, revert, --amend; push only
  `git push origin mainexpo` after `npm run verify` exits 0 in the same run. Never edit `.claude/`.
- No store submission and never `npm run release:testflight` (it auto-submits).
- Owner's budget rule: a weekly cap set per run; check `get_usage` each wake and hand off before it.

## Revert

- The whole lean run: `git checkout -b restore pre-lean-2026-11` (tag before any change).
- One slice: `git revert <hash>` (`lean P*`, `F*`, `G*` commits on `mainexpo`). App fixes this run:
  P1-P5 (84c7d4e..98d6443), F25 2865121, F29 b2314da; everything else is `.maestro/` or docs.
- Database: one migration, B1 (`20261111000000_tip_settlement.sql`, c8be212). Never edit or delete it
  once applied. Undo is a NEW migration that re-creates `apply_payment_event()` from
  `20260915000000_connect_onboarding.sql` §1 and `begin_tip_payment()` from
  `20260905000000_stripe_foundation.sql` §16, both together (the old tip begin with the new
  settlement re-opens the amount hole); `git revert c8be212` undoes the app wording and the tests.
  Production was never touched.
- The website and the legal rewrite: `git revert 29554fb` (texts, versions, script, tests in one commit);
  the live site is rolled back in Cloudflare (Workers & Pages → `brazos` → Deployments → an older
  version → Rollback), or by uploading an older build of `site/` to the same Worker.
