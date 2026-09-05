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


