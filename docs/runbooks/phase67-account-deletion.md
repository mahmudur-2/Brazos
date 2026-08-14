# Runbook — apply phase67 (account deletion)

**Status: written, NOT applied anywhere.** Only a green
`node scripts/verify-schema.mjs` counts as applied — four phase67 checks report
PENDING and become mandatory automatically once the migration lands.

This procedure is preserved **verbatim** from the HANDOFF.md that carried it
(repository state at commit `260a17f`). Only formatting has changed; no
requirement, expectation or assertion has been added, removed or reworded.

---

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

---

## Behaviour this migration establishes

Carried verbatim from the same HANDOFF.md, because it is what the walk-through
in step 2 is checking:

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

---

## Reminders that apply to every migration here

- Never execute SQL against any database from inside an autonomous run. This
  file is for a human at the SQL Editor.
- Staging only. Production (`avkighsiufeefyycbebf`) is never contacted, and
  `.env` stays pointed at staging.
- Production has none of the staging migrations; its ordered queue is
  `PROD_APPLY.md`.
