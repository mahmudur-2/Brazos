# BRAZOS — HANDOFF

Rewritten in full at the end of every run. Never appended.
Paste this file at the start of a planning session.

**Branch:** `mainexpo` — single-branch rule, all work lands here
**HEAD:** last **code** commit `2369100`, read with `git rev-parse` after that
commit landed, with this run's docs/state commits on top. `git rev-parse HEAD`
is authoritative for the tip — this line deliberately does not name it, because
a commit cannot contain its own SHA.
**Remote:** `origin/mainexpo` at `64055e2` — **ahead, not pushed**
**Tree:** clean

## Last landed

- `2369100` — fix(account-deletion): screen copy — open postings are cancelled, not blocking
- `3cadb0b` — fix(account-deletion): phase67 — open/draft terminal, canonical cancel path, resilient offer withdrawal, auth-delete assertion
- `3ffe870` — docs: make the HANDOFF HEAD stamp unfalsifiable
- `1ba21e0` — feat(account-deletion): settings entry, blockers screen, and sign-out flow
- `48e0b23` — feat(account-deletion): phase67 migration — tombstone, gates, RPCs

## ACTION REQUIRED — phase67 is written but NOT applied

Paste `supabase/phase67_account_deletion.sql` into the Supabase SQL Editor for
**STAGING `zzkumxcjtbqoselzptig`** and run it. It was amended this run and never
executed anywhere. Then confirm two things the repo cannot prove:

1. The section-1 DO block's NOTICE names the dropped `auth.users` foreign keys
   (expect `public.profiles`). Zero dropped on a first run means the FK was
   never there — investigate before trusting the tombstone.
2. Walk a throwaway staging account through delete end to end, with an OPEN
   posting on it. Expect: deletion succeeds, the posting flips to `cancelled`,
   and the closing NOTICE reports the counts.

Only a green `node scripts/verify-schema.mjs` counts as applied — 4 phase67
checks report PENDING and become mandatory automatically.

## Verification status

- **Device-verified:** inbox one-row-per-person; merged conversation timeline;
  mode-switch animation
- **Test-green only:** account deletion (phase67, unapplied); messaging lock
  (phase66); offer negotiation unification
- **Tests:** 390 total / 389 pass / 1 known frozen-PWA failure (`pwa.test.mjs`)
- **verify-schema:** 179 object checks OK + parity + control probe (the "181"
  of earlier runs), 0 MISSING, 4 PENDING (phase67), exit 0. PostgREST-
  reachability mode — `SUPABASE_DB_URL_STAGING` is not set, so no SQL proof runs

## Top 3 open

1. **Apply phase67** (above), then physically walk delete on a staging account
2. **Security** — unauthenticated user-ID lookup chained to notification write
   (blocks push ship); photo storage publicly listable
3. **EAS development build** — required for TestFlight and push; fix weakened
   production build gate in the same pass

## Notes

- **An open posting no longer blocks deletion — it is cancelled.** `job_status`
  terminal set for the deletion gate is now `completed, cancelled, open, draft`.
  Drafts are left at `draft`. Assigned/in-progress jobs, unsettled money and
  open disputes still block. The screen says so before the user confirms.
- **Follow-up with the risk named:** step (c) cancels via a raw UPDATE because
  `transition_job_status` allows only `assigned -> in_progress` and
  `in_progress -> completed` and authorises only the assigned worker. Offers
  other people authored on a cancelled job therefore stay `pending` and nobody
  is notified. Fix is a `decline_offer()` sweep in its own migration.
- Deferred from phase67: storage cleanup (avatar keys carry the uploaded file's
  extension; portfolio media shares the non-per-user `job-photos` bucket);
  `notification_outbox.title/body` embed an actor's name with no actor column;
  `job_requests` has no withdrawn status; the six SECURITY DEFINER bodies that
  still read `profiles.banned` directly
- Stripe key mode in `start.ps1`: **UNVERIFIED** — affects security severity
- Apple Developer Program enrollment is calendar-gated; start before it's needed
- Deferred: `42P17` RLS recursion on job delete; stale map pin on address edit;
  P1-03 / P1-05 / P1-08 / P1-10
- Worker hero-card parity with Atlas 55 is never-built, not a regression
