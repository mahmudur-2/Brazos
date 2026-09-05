# BRAZOS - HANDOFF

Records before 2026-09-04 live, unchanged, in docs/archive/HANDOFF_archive_2026-09-04.md (history, never an authority); this file keeps the head sections and the newest run record only.

Operational context, rewritten every run. Machine state is Git's, not here.

## THE PER-RUN RECORDS ARE ARCHIVED — read docs/handoff-archive/

This file carries ONLY the live edge. Every dated per-run record that used
to accumulate here now lives, verbatim and byte-preserved, in
`docs/handoff-archive/` — one file per run, listed oldest-to-newest by
`docs/handoff-archive/INDEX.md`. Consult the archive for any past run's
measurements, decisions, reversals and evidence. Nothing there is an
authority on current state, and nothing here restates what a record already
says.

## THE MASTER SET IS SPLIT — read this before citing any mockup

**Binding design authority, highest first:** the NUMBERED masters
(`docs/mockups/1_*.png` … `44_*.png`) · the emerald dispatch's D1–D11 ·
`docs/mockups/PRESTIGE_RUN_REPORT.md` (a "mismatch" logged there is CORRECT and
must not be reverted) · `docs/mockups/BRAZOS_MOCKUP_MANIFEST.md`.

**The WORD-NAMED masters are NOT authority and the operator has REJECTED them**
as an over-ornate render pass: `Compare_Bids_Dark.png`, `Discover_Map_Dark.png`,
`Messages_Inbox_Dark.png`, `My_Jobs_Active_Dark.png`, `My_Jobs_Closed_Dark.png`,
`My_Jobs_In_Progress_Dark.png`, `Notifications_Feed_Dark.png`,
`Notifications_Preferences_Dark.png`, `Payment_Methods_Dark.png`,
`Profile_Account_Safety_Dark.png`, `Profile_Details_Dark.png`,
`Profile_Past_Work_Settings_Dark.png`. Never cite one to justify a change; never
"restore" a detail that appears only there. You may read one to understand
intent where a numbered master is silent, but the change still needs a numbered
master, a dispatch decision or the run report behind it — and you log that you
read it.

**There is NO master for light mode.** Every mockup is dark. Never align a light
surface to one. **Six numbered masters the emerald dispatch cites do not exist
on disk** (33, 34, 39, 40, 45, 46; also absent: 21, 28, 35–38, 41, 42) — all of
them concern things D9 freezes as UNBUILT.

*Unchanged by the home reconstruction (2026-08-20), which cited no master: its
dispatch superseded `docs/dispatch/` and pre-decided every product question it
needed. Reaffirmed unchanged by the verification run (2026-08-19) and restated
at the head of the "Verification 2026-08-19" section of
`docs/mockups/PRESTIGE_RUN_REPORT.md`.*


## THE GATE 1 DEVICE WALK — PASSED (2026-08-31, evening)

This section is the operator's own testimony, given on the evening of
2026-08-31. **No run performed it and no run observed it** — a device walk is
the operator's alone (`CLAUDE.md` §Agent autonomy). When first transcribed,
nothing in it had been checked against a database, a provider dashboard, a log
or a test; the corroboration rows below (R8b-s, 2026-08-31) now check it —
DATA the operator read from the staging SQL editor after the walk, not
testimony. It is transcribed here because it is the only source for the walk,
and it is the evidence Gate 1's payment-provider device box cites.

**Where it ran.** On the operator's iPhone, against STAGING, on the Beta build
— EAS build `d2ccc7f` — after an OTA to `f95b7f92` via `npm run update:preview`.

**What passed.** All eight numbered steps of the Gate 1 device box, in one
sitting: the job was posted; the bid was placed; the bid was accepted and
funded — **$53.75 charged on the 4242 test card for a $50 job**, which is the
7.5% customer fee; the work was completed; the customer approved.

**The release was hands-off.** The payment reached `released` ON ITS OWN,
with NO hand-run SQL — the funds left held in protection without an operator
hand on the database. The corroboration rows time it exactly (all UTC
2026-09-01): `release_requested_at` 00:40:39 → `updated_at` 00:45:03 =
**4 minutes 24 seconds from approval to release**, and `held_at` 00:35:29 →
`updated_at` 00:45:03 = **9 minutes 34 seconds from funding to release**. (An
earlier version of this record said "roughly eight minutes after approval";
the rows corrected the number, not the verdict.) The idempotency wedge the
operator had to clear by hand during the R6b walk did not recur.

**The reviews.** Reviews were written in both directions, and the counterpart
reveal held: neither side saw the other's review before its condition was met.

**The provider.** The provider's test dashboard shows the charge.

**The corroboration (R8b-s, 2026-08-31).** After the walk, the operator read
these rows from the STAGING SQL editor. They are DATA, not testimony — they
check what the transcription above could not. The 2026-09-01 UTC timestamps
and the 2026-08-31 evening walk date are the same sitting: local evening,
next-day UTC — do not "correct" either date to match the other.

- job `01fd3f6e-f9e9-49a4-b62f-2cd29a67d108`.
- payments `a36beb95-86e8-46ed-a0ec-d50bfa72ede0` — status `released`,
  `transfer_attempts` **0**, `transfer_ref` `tr_1UAfow43w4QKhn3toCdTFkf8`,
  `held_at` 00:35:29, `release_requested_at` 00:40:39, `updated_at` 00:45:03
  (the row's last write, which was the release), all UTC 2026-09-01.
  `transfer_attempts` 0 is the load-bearing column: the transfer cleared
  FIRST TRY, so the hands-off release is now proven by a column and not only
  by the operator's account.
- two `reviews` rows on that job, 00:38:25 and 00:40:45 UTC 2026-09-01, both
  `would_again` NULL — NULL by construction, not because the reviewer
  skipped: the client never asks the question (`docs/BACKLOG.md` §R8b
  item 4).


## RUN a2-home-attention COMPLETED (2026-09-05) - Home shows the posted jobs that need the customer's move; the Nearby card says when the job was posted

Dispatch `C:\Users\mdmah\runs\night2\a2-home-attention.txt`; report `.shots/night2/reports/a2-home-attention.md`. Base `b4f4d3d` (an ancestor), branch `mainexpo`, tree clean and level with origin/mainexpo at start on `d8cdb0e` ("docs: a1 record") - a FRESH start. Chain A's third run, on `docs/DECISIONS.md` 2026-09-05 entry (4). Nothing under `supabase/` changed, so no staging pipeline ran for it; ci.yml ran verify. Untouched: every money file, `screens/MyJobsHubScreen.tsx` and `hooks/useMyJobsHub.ts` (called as they are), the `[ + ]` sheet, `.maestro/`, `.gitignore`, the guard directory, the production project.

**Commit `f1ffde4`**, "a2: Home shows what needs your attention - the posted jobs awaiting your move, from the hub's reads" - three files by explicit path:
- `lib/homeAttention.ts` (new, 133): the selection rule, pure and injection-free. One runtime import, `./jobLifecycle`. `attentionItems()` ranks the customer's posted jobs 0-5 - finished work to approve, a hire waiting on payment protection, bids to review, arrived, en route, a review to leave - newest first within a rank, ties by id, and returns ALL of them so the caller can slice to `ATTENTION_CAP` (3) and count the rest. Every exclusion carries its reason beside it: an open job with no bids is a wait not a move; a `draft` row is `create_offer()`'s direct offer, never the device-local wizard draft; confirmed and in_progress are the worker's move; a dispute means the customer already acted; reviewed and cancelled are closed; `unknown` is omitted rather than guessed at. The card's line is `myJobsNextAction()`'s - one implementation, called twice (P3-31).
- `screens/HomeScreen.tsx`: `useMyJobsHub()` called exactly as the hub calls it, refreshed on focus the same way, with the three colliding names aliased; `nowMs` is one clock reading per load. NO new RPC, table, column or migration - R4's condition is met by the hub's existing reads - and no second derivation on this screen.
- `tests/homeAttention.test.mjs` (new, 14 tests at this commit): the rule EXECUTED against the real `lib/jobLifecycle.ts` through `stripTypeScriptTypes`, every expected line asserted against the string `myJobsNextAction()` itself returns rather than a retyped literal, plus the raw-text pins on Home.

**Commit `8d5f548`**, "a2: the Nearby card says when the job was posted" - `screens/HomeScreen.tsx` and one more test. `docs/BACKLOG.md`'s parked card-facts item: `OpenJobCard` was the one card in the app carrying the bid count and no posted-ago line. A second row under the neighbourhood row, in that row's own two styles (`jobPlaceRow`, `jobPlace`) with `WorkerJobCard`'s clock glyph. Always drawn - `jobs.created_at` is NOT NULL. No new style, prop or dial; the interest line is untouched.

**The position, and why.** The section sits directly below the promo card's `</LitSurface>` and above Nearby. Not a taste choice: the E2E money walk finds "Post a job" on Home WITHOUT scrolling (`.maestro/sign-in.yml`'s HOME_MARK, then money-walk.yml's tap), Maestro taps nothing below the 852pt fold, and the E2E customer fixture owns staging jobs that need attention - so a block ABOVE the card would push the pill off-screen and break the walk without a flow change, which the chain forbids. The ruling's "leads with" is met as the FIRST job section. No new colour, spacing, font, radius, shadow, component or style: every style existed already, and every card is `components/HubCard.tsx` with the hub's own props. Zero items and no error render nothing at all; a failed read renders Nearby's notice, because it must not look like "nothing needs attention".

**Proof.** `npm run verify` green before each commit: 1342 pass / 0 fail at `f1ffde4`, 1343 at `8d5f548`. Rendered at 393x852 after each app change by `node scripts/shots.mjs --build --only customer-home`, exit 0 both times, four PNGs each: `.shots/customer-home-dark.png`, `.shots/customer-home-light.png`, `.shots/customer-home-jobs-dark.png`, `.shots/customer-home-jobs-light.png`. THE ATTENTION BLOCK IS UNRENDERED BY CONSTRUCTION: the harness answers only the `status=eq.open` feed read and the by-id read, so the hub's `client_id=eq.<USER_ID>` read comes back empty and the block is absent from every capture - STEP 1's renders prove Home still mounts unchanged, and STEP 2's `customer-home-jobs` pair is where the posted-ago line shows on the four seeded cards. The run read no image.

**Exceptions.** None. No fence needed an expected-constant update; no test was moved or deleted.

**NEEDS THE OPERATOR.** Nothing blocking: no SQL, no secret, no device step, no destructive migration, no new dependency. Three standing notes. (1) This is an APP change, so no installed TestFlight or e2e build shows either surface until a fresh build carries it. (2) The hub hook's WORKER-side reads (`working`, `pendingBids`, `settledBids`) now also run on customer Home - the price of one aggregation. A `posted`-only option on the hook is the later choice, deliberately not taken here. (3) The Figma pass owns the final section order; `tests/emeraldFences.test.mjs`'s home(26) fence still measures the gap below the promo card, which is now this section's gap on a customer who has work waiting.


## RUN a1-support-contact COMPLETED (2026-09-05) - Contact support row: brazosmvp@gmail.com by mailto on the profile's Settings list

Dispatch `C:\Users\mdmah\runs\night2\a1-support-contact.txt`; report `.shots/night2/reports/a1-support-contact.md`. Base `b4f4d3d` (an ancestor), branch `mainexpo`, tree clean and level with origin/mainexpo at start on `c5ecf7c` ("docs: rulings 2026-09-05") - a FRESH start. Chain A's second run, and a0-rulings had landed, so `docs/DECISIONS.md` 2026-09-05 entry (3) is the authority the code cites. Nothing under `supabase/` changed, so no staging pipeline ran for it; ci.yml ran verify. Untouched: every money file, Home, the Post-a-Job flow, `.maestro/`, `.gitignore`, `app.config.ts`, the guard directory, the production project.

**Commit `c880330`**, "a1: Contact support - a mailto row on the profile's Settings list (brazosmvp@gmail.com)" - three files staged by explicit path:
- `lib/appLinks.ts` (+20): `SUPPORT_EMAIL = 'brazosmvp@gmail.com'` and `supportMailtoUrl()`, beside the two names it already carried. The comment names the source and states the consequence: no domain exists yet (`docs/BACKLOG.md` side backlog 7), so this is the ONE line to change when the domain's mailbox does. The module stays import-free, which is what lets the test execute it straight from its file URL.
- `screens/ProfileScreen.tsx` (+56/-7): `HUB_SETTINGS` is now `SettingsRow[]`, a discriminated shape - a row either names a route in this stack or carries `mailto: true` - and gains a SIXTH, LAST entry, "Contact support", `mail-outline`, whose sub interpolates the imported constant. The address is never retyped in this file. The one map that draws the card changed in exactly two places: `key` is `row.label` (route no longer exists on every row) and `onPress` is `'route' in row ? () => navigation.navigate(row.route) : () => void openSupportMail()`. Every style, both dials (`profile.settingsRow.height`, `profile.settingsGlyph.size`), the glyph colour rule and the five existing rows are byte-identical. `openSupportMail()` calls `Linking.openURL(supportMailtoUrl())` - the house shape from `screens/PayoutsScreen.tsx`, since expo-web-browser is not installed and this run added no dependency - and on rejection shows `alertAsync` (never `Alert.alert`) naming the address, so the contact is published even where no mail app is configured. `canOpenURL` is deliberately NOT called: on iOS it needs an `LSApplicationQueriesSchemes` entry `app.config.ts` does not carry and this run did not touch, and the direct call's own rejection is already the answer.
- `tests/supportContact.test.mjs` (new, 3 tests): `lib/appLinks.ts` executed for real; the screen's import, its single opener, the absence of `canOpenURL`, the failure sentence, and the six labels in order pinned as text; and a census of `lib/`, `screens/`, `components/`, `hooks/` (never `*.web.*`) proving the address is spelled in exactly ONE app file. That census is what keeps the mailbox move a one-line edit.

**Proof.** `npm run lint` clean; `npm test` 1328 pass / 0 fail / 0 skipped (1325 + the 3 new). Rendered at 393x852 by `node scripts/shots.mjs --build --only customer-profile`, exit 0, four PNGs: `.shots/customer-profile-dark.png`, `.shots/customer-profile-light.png`, `.shots/customer-profile-details-dark.png`, `.shots/customer-profile-details-light.png`. The two `customer-profile-<scheme>` targets wait on "Choose which events can alert you." - the first Settings row's sub - so the card mounted with the widened row type. The run read no image and made no appearance judgement: whether the sixth row falls inside 852pt is the operator's to see.

**Exceptions.** (1) One comment beyond the three named edits: the JSX comment above the Settings card said "five rows", which this run made false, so it now says six. (2) `docs/BACKLOG.md`'s bullet was anchored by its quoted text, not by line number.

**NEEDS THE OPERATOR.** Nothing blocking: no SQL, no secret, no device step, no destructive migration, no new dependency. One standing fact - this is an APP change, so no installed TestFlight or e2e build shows the row until a fresh build carries it (the reusable simulator build `1ffe5205-ced7-4e1f-a740-61d99f0e4324` predates it). The address itself moves to the domain's mailbox in one constant when side backlog 7 buys the domain.


## RUN a0-rulings COMPLETED (2026-09-05) - the operator's four rulings recorded; SCOPE gains the posted-price line; BACKLOG annotated for chain A

Dispatch `C:\Users\mdmah\runs\night2\a0-rulings.txt`; report `.shots/night2/reports/a0-rulings.md`. Base `b4f4d3d` (an ancestor), branch `mainexpo`, tree clean and level with origin/mainexpo at start on `5435d28` ("docs: m1 record") - a FRESH start. DOCS ONLY: no code, no SQL, nothing under `supabase/`, so no staging pipeline ran for it; ci.yml ran verify. `docs/GATES.md`, `docs/BRAZOS_TARGET_ARCHITECTURE_v3.md` (its section 4.1 production row stays as written), `.gitignore`, `.maestro/`, the guard directory and the production project are untouched.

**The commit.** One commit, "docs: rulings 2026-09-05 - DECISIONS R1-R4, the SCOPE posted-price line, BACKLOG annotations, HANDOFF record", four files staged by explicit path: `docs/DECISIONS.md` (one dated block, four entries), `docs/SCOPE.md` (one line under "In v1"), `docs/BACKLOG.md` (eight bullets, each gaining a sentence at its end - no bullet removed or reordered), `HANDOFF.md` (this record). Its sha is Git's to state, not this file's.

**The four rulings**, planned by plan-a (`.shots/night1/reports/plan-a.md`) and recorded in full in `docs/DECISIONS.md` under 2026-09-05:
- (1) The ten-user TestFlight cohort runs on STAGING with test money; production is not touched and no migration is hand-applied to it until real money moves. For the cohort only this reverses v3 section 4.1's production row, which stands for launch - and the row itself is not edited.
- (2) The posted-price choice at posting is IN v1: at posting the customer chooses between a posted price and open bids. Not Instant Book - the customer still accepts and funds; the counter-offer cap stays 10; open bids is the default, so the E2E money walk posts, bids, accepts, funds, completes and releases exactly as before.
- (3) brazosmvp@gmail.com is the published support contact, as a mailto row on the profile's Settings list - the app has no help, support or contact surface today, and no domain exists yet.
- (4) The customer Home leads with what needs attention, as logic and data only: the customer's own posted jobs that need their move, read through `hooks/useMyJobsHub.ts` and drawn on `components/HubCard.tsx`, directly below the Post-a-job card and above Nearby - a section above the card would push the walk's pill below the fold.

**Chain A's launch order** (`.shots/night1/chainA-manifest.txt`): a0-rulings (this run), a1-support-contact, a2-home-attention, a3-posted-price-schema (dep a0-rulings), a4-posted-price-client (dep a3-posted-price-schema), a6-payout-copy (MONEY, its own revert boundary). a5-rating-retire is SKIPPED on its own ruling's condition: readers of `profiles.rating_avg` / `rating_count` remain after n7 - `match_workers_semantic()` (baseline 2855-2984), `supabase/functions/worker-search/index.ts` 410-437, `supabase/tests/020_lifecycle.sql` 241, `scripts/lifecycle-proof.mjs` 360-361 - and the retirement is a destructive migration the staging pipeline stops for the operator. Also SKIPPED by plan-a and annotated in the backlog: the waiting-state facts and nudges, the "Available this week" label, and the bank-arrival half of the payout ETA copy.

**Exceptions.** (1) The record names its commit by message, not by short sha: one commit carries all four files, and a commit cannot contain its own SHA - the rule this file states at its head. (2) `docs/BACKLOG.md`'s eight bullets were anchored by their opening text, not by line number: m1's bullet had already moved every one of them down by one.

**NEEDS THE OPERATOR.** Nothing from this run: no SQL, no secret, no device step, no destructive migration, no new dependency. Standing, from plan-a: the two planner decisions written in your name (the Home section's position; a4 leaving the worker side untouched), a5-rating-retire's unblocking schema run, and n4's remaining money steps.


## RUN m1-mode-race COMPLETED (2026-09-05) - the gate hooks answer for the current user, synchronously; the mode race after Setup is closed

Dispatch `C:\Users\mdmah\runs\night2\m1-mode-race.txt`; report `.shots/night2/reports/m1-mode-race.md`. Base gate PASS: `git merge-base --is-ancestor b453c47 HEAD` exit 0, `git rev-parse --abbrev-ref HEAD` printed `mainexpo`, `git status --porcelain` empty; m1 started from `b453c47` ("docs: NIGHT1 maestro result"). This record is written by the follow-up run m1b-docs, because m1 exited before its own reporting step and left the repository with no record of the fix.

**THE BUG.** A user who finished Setup with "Find work" landed in the customer tree. `hooks/useSetupStatus.ts` and `hooks/useLegalGate.ts` both flip to 'loading' inside a `useEffect`, so in the one render where the user first appears they still answered from their signed-out branches ('complete' / 'accepted'); `App.tsx`'s RootNavigator dropped its loader and mounted MainTabs for that commit, `navigation/ModeShell.tsx` armed the resolution, and `modes/ModeProvider.tsx` resolved and stamped the user with no landing parked yet — so the 'work' landing `screens/SetupScreen.tsx` parked a moment later was never consumed, and the server-side `active_mode` decided the tree.

BEFORE walk: MAESTRO RED 01a07320-6419-7e1a-b440-8913e9184e5d — `Assertion is false: "Search for jobs or areas" is visible`, failing at the worker's `runFlow sign-in.yml` in Act 2 with customer Home in the screen hierarchy behind it; deliberate, on the unfixed build be257242-4fef-4e62-8cfe-0f3797c5d115 at `b453c47`. It is not the pass condition — it is the proof that the walk sees the bug.

**Commit.** `bfb8e0c` "m1: the gate hooks answer for the current user, synchronously" — five files, staged by explicit path: `lib/gateAnswer.ts` (new — the pure derivation `deriveGateAnswer(userId, stored, signedOut)` over a `GateAnswer<T>` `{ forUser, value }` record, importing nothing), `tests/gateAnswer.test.mjs` (new — 10 tests, including both hooks executed from a data URL through the errorHonesty micro hook runtime), `hooks/useSetupStatus.ts` and `hooks/useLegalGate.ts` (each derives its answer in the same render now, so an answer stored for another user — or for nobody — reads 'loading' instead of the signed-out value, and the public API of both hooks is unchanged), and `tests/errorHonesty.test.mjs` (+8 — one exact-line replacement in its data-URL harness, which cannot resolve a relative specifier; its four gate assertions are untouched). Proof: `npm run lint` clean, `npm test` 1325 pass / 0 fail / 0 skipped; pushed with the bare `git push origin mainexpo`.

AFTER walk: money_walk GREEN, 21m56s, EAS run 01a07330-a127-7c91-9bc0-cb256c3355d1, build 1ffe5205-ced7-4e1f-a740-61d99f0e4324 (confirmed by the operator from eas workflow:runs, 2026-09-05).

**The build is reusable.** `1ffe5205-ced7-4e1f-a740-61d99f0e4324` is the e2e-test simulator build that carries the fix, recorded in `.shots/night2/build_id.txt`. A later walk skips the simulator build entirely by passing `-F build_id=1ffe5205-ced7-4e1f-a740-61d99f0e4324` to `.eas/workflows/e2e-ios.yml`, which is how m1's own BEFORE walk ran on the unfixed build. **NEEDS THE OPERATOR.** Nothing from m1: no SQL, no secret, no device step, no destructive migration, no new dependency; nothing under `supabase/` changed, so no staging pipeline ran for it.


## NIGHT1 COMPLETED (2026-09-04) - eight dispatches authored by the planner, seven runs landed: n3 the auto-release told-gate, n6 the batch reputation summary, n7 lists on that summary, n1 nearby alerts default on, n2 the harness registry, n5 the first session, n9 Sentry captures; n4 never started; n8 (this record) the hygiene sweep

Planned 2026-09-04 (`.shots/night1/reports/plan.md`, base `b4f4d3d`), executed 2026-09-04 → 2026-09-05 by the operator's night1 chain; prompts under `.shots/night1/prompts/`, reports under `.shots/night1/reports/` (both gitignored). One line per run — name, its last commit, its result, how its report ends:
- n1-nearby-schema — `d806576` — nearby alerts default ON: migration `20260930000300_nearby_alerts_default.sql` + pgTAP 100 (the D5-substituted version), five DECISIONS entries dated 2026-09-04 (n1), Gate 2 box 1 ticked — RUN COMPLETE.
- n2-harness-registry — `4e318c5` — `lib/notificationPrefs.ts` DEFAULT_PREFS.nearby_jobs mirrors the schema (Gate 2 box 3 ticked); the shots registry widened to 74 targets, every renderable v1 screen dark and light; Gate 2 box 2 stays OPEN on "reviewed" — RUN COMPLETE.
- n3-autorelease-schema — `473482e` — the 72-hour auto-release gates on TOLD (a job_completed outbox row in any terminal status), a 7-day fallback, job_completed always on: migration `20260930000100_auto_release_told_gate.sql` + pgTAP 110 — RUN COMPLETE.
- n4-money-ops — NO REPORT, NO COMMIT: never started. Its STEP 3 was split out and landed as n9; STEPS 1, 2 and 4 (the `payouts_enabled` filter on the settlement drain, the Payouts notice, the Maestro walk on 8aa5fe85) remain to run, as n4.
- n5-first-session — `bb23576` — email-first Welcome, permissions asked at first need, no launch floor, the worker's take-home line from `quote_job_price()`, a customer's own Nearby card opens its job detail, VoiceOver names for the rating stars and the bare back chevron — RUN COMPLETE.
- n6-reputation-schema — `44040af` — `profile_review_summaries()`, the batch per-role REVEALED summary: migration `20260930000200_reputation_batch_summary.sql` + pgTAP 120 — RUN COMPLETE.
- n7-reputation-client — `5a95430` — every list surface reads the revealed per-role summary in one batch call; `rating_avg` / `rating_count` read nowhere in app code, fenced by `tests/legacyAggregateFence.test.mjs` — RUN COMPLETE.
- n9-sentry — `ef61107` — `Sentry?.captureException` beside all 32 handled console.error sites in 13 app files, with the per-file census fence in `tests/observability.test.mjs` — RUN COMPLETE.
- n8-hygiene (this run; report `.shots/night1/reports/n8-hygiene.md`): STEP 1 `442cc84` — the 83 pre-baseline `supabase/phase*.sql` files moved, unchanged, to `supabase/archive/phases/`; 28 tests, seven directory listings, the areas-seed generator and every ACTIVE document follow (history, decision records, app-code and SQL comments keep their provenance text). STEP 2 `52c1ceb` — HANDOFF.md cut to this live edge; the whole prior file is `docs/archive/HANDOFF_archive_2026-09-04.md`, byte-exact. STEP 3 `075e258` — translate leaves the deploy set: `[functions.translate] enabled = false` in `supabase/config.toml`; that push's staging pipeline ran green (run 33962424840 — verify, migrate, deploy all success). STEP 4 `d6cab03` — `.github/workflows/pgtap.yml`: `supabase start` → `db:reset` → `db:test` on the runner's own local stack, no secret, fenced by `tests/governance.test.mjs`. STEP 6 — the fresh e2e-test build and the Maestro walk on it: the MAESTRO line at the end of this record.
Also on record, no commits: plan.md and verify.md (2026-09-04), plan-a.md and verify-a.md (2026-09-05) — each RUN COMPLETE; chain A's six prompts (a0–a6) are written and verified but were not launched before this run.

**NEEDS THE OPERATOR** — every run's items, verbatim from its report:
- n1: none (advisory: each of its pushes ran the staging pipeline; the migrate job's list-after step is the backfill's proof on staging). n3: none. n6: none.
- n2: "The review of the 74 renders under `.shots/` (D11: the run read no PNG and made no appearance judgement). Gate 2 box 2 stays OPEN until that review is recorded beside it." · "One decision, not a blocker: whether to let the seeded-jobs branch also answer `jobs?id=eq.<seeded id>` (from the same four rows, `jobs: true` targets only) so worker job detail and Submit Bid can be registered; a one-line stub change that D6/D7 kept this run from making."
- n5: "Every app change in C1–C6 needs a rebuild before it reaches a device; n8 STEP 6 builds fresh." · "Review the ten renders listed above (the run reads no image). One thing to look at on `auth-setup-*`: the Terms row's `divider` hairline now sits at the top edge of the card (kept exactly as D2 asked)." · "The mobile push at the end of this run was not delivered."
- n7: "An app change needs a rebuild before a device sees it; n8 STEP 6 builds fresh. Nothing else — no SQL, no secret, no device step, no destructive migration, no new dependency."
- n9: "Every capture in C1 needs a rebuild before it reaches a device (n8 STEP 6 builds fresh); until then installed builds report only `AppErrorBoundary`'s render crashes to Sentry." · "n4's STEPS 1, 2 and 4 — the `payouts_enabled` filter on the drain, the Payouts notice, the pipeline wait and the Maestro walk on build `8aa5fe85` — remain to run, as n4." · "The mobile push at the end of this run was not delivered."
- n8: (1) `.claude/rules/supabase.md` line 7 is operator-only — replace "The `supabase/phase*.sql` files are historical, superseded" with "The `supabase/archive/phases/phase*.sql` files are historical, superseded"; nothing else on the line changes. (2) The translate function already deployed on staging by earlier runs is not removed by a deploy that skips it: delete it from the dashboard if it should not exist at all (a remote action no run performs). (3) Root `README.md` line 61 still reads "Schema changes are numbered files, `supabase/phaseNN_*.sql`" — outside this run's step list and not an ACTIVE document in docs/README.md; correct it by hand or dispatch it.
- plan.md, still open: "Before n4: sign in as the E2E worker fixture (the MAESTRO_E2E_WORKER account) on any device or simulator and open Profile > Earnings > Payouts once, so connect-status records payment_accounts.payouts_enabled = true." Its item 1 (install and authenticate GitHub CLI) is DONE — gh 2.100.0 answered `gh auth status` on this machine at n8's preflight.

MAESTRO RED 01a07145-96a6-7f92-a62f-51cc27d40a8e Assertion is false: "Search for jobs or areas" is visible — run https://expo.dev/accounts/mah_r2/projects/BRAZOS/workflows/01a07145-96a6-7f92-a62f-51cc27d40a8e (2026-09-05, fired 11:12:59Z, terminal 11:28:29Z): `build_ios_simulator` SUCCESS, `money_walk` FAILURE at 196.6 s (JUnit), device iPhone 16 - iOS 18.3. THE NEW REUSABLE BUILD ID for `-F build_id=`: `be257242-4fef-4e62-8cfe-0f3797c5d115` (e2e-test, SDK 54.0.37, built fresh at `39638e8` — every n2 / n5 / n7 / n9 app change is in it; the previous reusable id `8aa5fe85` predates them all).
WHERE IT DIED: the WORKER's sign-in subflow — "Find work" and "Finish setup" both COMPLETED, then the 60 s wait for worker Home's search placeholder failed; the step's screen hierarchy (read as text, never the frame) is the CUSTOMER Home ("Good morning,", "Describe the job. BRAZOS handles the rest.", "Post a job", "Switch to Worker", the run's own job `E2E 1788607494700` under Nearby): the worker account opened in customer mode, so Setup's "Start in: Find work" did not take effect. Act 1 (the customer posting) passed — `posted.png` is in the bundle; 81 commands COMPLETED, 2 FAILED (the assert and its runFlow), 3 WARNED (the optional hideKeyboards), 2 SKIPPED (the optional "Get notified?" waits). The placeholder is unchanged in `screens/WorkerHomeScreen.tsx:346`; no file under `.maestro/`, `.eas/` or `eas.json` changed since the green run 01a065d8.
WHY, as far as the source can say (D7: NEEDS THE OPERATOR — this run edited no flow and no app file): right after sign-in, RootNavigator (`App.tsx`) renders MainTabs for one frame — `useLegalGate` still reports 'accepted' and `useSetupStatus` still reports 'complete' from their signed-out branches until their effects flip both to 'loading', and AuthContext's `loading` covers only session restore — so ModeShell mounts and arms, and ModeProvider resolves the mode with no landing and stamps `resolvedFor`; when Setup later finishes, its `setPendingLanding('work')` is never consumed because the resolution effect exits on `resolvedFor === userId`. Every earlier walk passed anyway because the fixtures' server-side `profiles.active_mode` decided the mode (worker / customer). So the proximate cause is the WORKER fixture's `active_mode` on staging no longer reading 'worker' (or `get_my_active_mode` answering null, which on a clearState device falls to the customer default) — a data fact only the operator can read — and the standing cause is that sign-in-frame race, pre-existing and not introduced by night1 (no night1 commit touched `modes/`, `navigation/`, `hooks/useSetupStatus.ts` or `hooks/useLegalGate.ts` beyond n9's Sentry capture).
OPERATOR: (1) read the E2E worker fixture's `profiles.active_mode` on staging (SQL editor, operator-only) — or sign in as the fixture on a device and switch to Worker, which persists it — and, if it is not 'worker', set it so; (2) rerun the walk on the fresh build: `npx eas-cli@latest workflow:run .eas/workflows/e2e-ios.yml -F build_id=be257242-4fef-4e62-8cfe-0f3797c5d115`; (3) the race itself is a client bug for a client run (docs/BACKLOG.md §v1 bugs), never a flow edit: RootNavigator must hold the loader until both gates have re-read for the new user, or ModeProvider must re-resolve when a landing is parked after `resolvedFor` was stamped.


## RUN n9-sentry COMPLETED (2026-09-05) - Sentry captureException beside every handled console.error; the census fence

Dispatch `C:\Users\mdmah\runs\night1\n9-sentry.txt` — n4-money-ops STEP 3 alone, split out so that money code keeps its own revert boundary (`docs/BACKLOG.md` line 15);
n4's STEPS 1, 2 and 4 are NOT run here: process-settlements, the Payouts screen and Maestro are untouched. Base `b4f4d3d` (an ancestor), HEAD `bb23576`, branch `mainexpo`,
tree clean, HEAD equal to origin/mainexpo (FRESH). Report `.shots/night1/reports/n9-sentry.md`. Nothing under supabase/ changed (no staging pipeline; ci.yml ran verify); no
dependency added; `.gitignore`, `.maestro/`, the guard directory, the production project and every money file untouched.

**Commits.** C1 `7076280` — the census re-run at HEAD matched D3's count exactly: 32 console.error sites in 13 app files (lib/geolocation 2, notificationRoutes 3,
postJobDraft 2, pushNotifications 3, reverseGeocode 3, sharing 6; hooks/useLegalGate 1, useLiveLocation 1, usePushNotifications 2, useVoiceRecorder 2; screens/PostJobScreen 4,
WorkerJobScreen 2; components/ReviewSection 1; AppErrorBoundary already captured). Each gains, beside the console.error it keeps,
`Sentry?.captureException(<the caught error, or new Error(<the console message>)>, { extra: { site: '<file>.<function>', … } })`, importing `{ Sentry }` from
`lib/observability/sentry` — the nullable seam, so every capture is a no-op wherever the vendor did not load. `extra` carries identifiers and codes only (a job id, a PostgREST
code, an HTTP status, a screen name, a stage label); the scrubber deep-scrubs it before it leaves the device. No site's control flow changes. `tests/observability.test.mjs` + 1,
'the census · every console.error in app code has a Sentry capture beside it': every file under lib/, hooks/, screens/, components/ (never *.web.*) that calls console.error must
import Sentry by its own relative path and capture at least as many times as it logs, counted per file. Four data-URL loaders learned the import and stub it to null:
`tests/chatDocuments.test.mjs`, `tests/crossModeNotification.test.mjs`, `tests/errorHonesty.test.mjs`, `tests/postJobDraft.test.mjs`; no test deleted; invariants 11 and 12
untouched. C2 — this record (CLAUDE.md's end-of-run rewrite; the step itself is the one commit the dispatch asked for).

**Exceptions.** (1) `lib/reverseGeocode.ts` gained its first import; its header's "imports nothing from expo" stays true, but a bare-node script would now pull config/env — no
such script exists (`scripts/` names the module nowhere). (2) The fence counts captures per file rather than requiring one, because "at least one" would let a second
console.error into an already-capturing file unnoticed, which is the gap the fence exists to close. (3) The commit carries the n9 prefix, not n4's, so git log, the report and
this record agree. **Proof.** `verify` lint clean, 1314 pass / 0 fail before C1; pushed with the bare `git push origin mainexpo`. **NEEDS THE OPERATOR.** Every capture needs a
rebuild before it reaches a device (n8 STEP 6 builds fresh); until then installed builds report only the error boundary's crashes. n4's STEPS 1, 2 and 4 remain to run, as n4.


