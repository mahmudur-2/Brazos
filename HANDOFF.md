# BRAZOS — HANDOFF

Rewritten in full at the end of every run. Never appended.
Paste this file at the start of a planning session.

**Branch:** `mainexpo` — single-branch rule, all work lands here
**HEAD:** last **code** commit `1ba21e0`, with this run's docs/state commits on
top. `git rev-parse HEAD` is authoritative — this line deliberately does not
try to name the branch tip, because a commit cannot contain its own SHA and a
hand-typed tip is exactly how the previous stamp went three commits stale.
**Remote:** `origin/mainexpo` at `64055e2` — **ahead, not pushed**
**Tree:** clean

## Last landed

- `1ba21e0` — feat(account-deletion): settings entry, blockers screen, and sign-out flow
- `48e0b23` — feat(account-deletion): phase67 migration — tombstone profile, deletion gates, RPCs
- `8275e0c` — docs: correct CLAUDE.md table names from live staging schema
- `64055e2` — docs: session state — branch topology resolved, device pass complete

## ACTION REQUIRED — phase67 is written but NOT applied

Paste `supabase/phase67_account_deletion.sql` into the Supabase SQL Editor for
**STAGING `zzkumxcjtbqoselzptig`** and run it. Then confirm two things the repo
cannot prove:

1. The DO block's NOTICE output names the dropped `auth.users` foreign keys
   (expect `public.profiles` at minimum). Zero dropped on a first run means the
   FK was never there — investigate before trusting the tombstone.
2. `delete_my_account()` can actually `delete from auth.users` under the
   function owner's privileges. `auth.users` is owned by `supabase_auth_admin`,
   not `postgres`. Test with a throwaway staging account end to end.

Only a green `node scripts/verify-schema.mjs` counts as applied — 4 phase67
checks currently report PENDING and become mandatory automatically.

## Verification status

- **Device-verified:** inbox one-row-per-person; merged conversation timeline;
  mode-switch animation
- **Test-green only:** account deletion (phase67, unapplied); messaging lock
  (phase66); offer negotiation unification
- **Tests:** 390 total / 389 pass / 1 known frozen-PWA failure (`pwa.test.mjs`)
- **verify-schema:** 181 OK, 0 MISSING, 4 PENDING (phase67), exit 0.
  PostgREST-reachability mode — `SUPABASE_DB_URL_STAGING` is not set, so no SQL
  proof can run in this shell.

## Top 3 open

1. **Apply phase67** (above), then physically walk delete on a staging account
2. **Security** — unauthenticated user-ID lookup chained to notification write
   (blocks push ship); photo storage publicly listable
3. **EAS development build** — required for TestFlight and push; fix weakened
   production build gate in the same pass

## Notes

- **An open or draft job posting blocks account deletion.** Deliberate: the
  terminal set for `job_status` is `completed, cancelled` only. Widening it is a
  one-line change in phase67 §4 and `delete_my_account()` step (c) is already
  written to cancel those jobs when it happens.
- Deferred from phase67: storage cleanup (avatar keys carry the uploaded file's
  extension; portfolio media shares the non-per-user `job-photos` bucket);
  `notification_outbox.title/body` embed an actor's name with no actor column to
  find them by; `job_requests` has no withdrawn status to set.
- Stripe key mode in `start.ps1`: **UNVERIFIED** — affects security severity
- Apple Developer Program enrollment is calendar-gated; start before it's needed
- Deferred: `42P17` RLS recursion on job delete; stale map pin on address edit;
  P1-03 / P1-05 / P1-08 / P1-10
- Worker hero-card parity with Atlas 55 is never-built, not a regression
