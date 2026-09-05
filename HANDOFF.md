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


