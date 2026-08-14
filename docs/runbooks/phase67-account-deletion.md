# Runbook — apply phase67 (account deletion)

**Status: APPLIED to staging (`zzkumxcjtbqoselzptig`) 2026-08-14.** The
end-to-end delete was walked on a device the same day and passed on all five
checks: the auth row is gone, the tombstone row is present, `phone` is NULL, the
open posting flipped to `cancelled`, and a completed job was left untouched.
Completed-job survival was verified by reading the function body, not on a
device.

**Production still needs this migration**, so the whole procedure below is
preserved unchanged for that run. `PROD_APPLY.md` holds the ordered queue.

Applying phase68 afterwards is a separate step with its own section at the
bottom of this file.

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
  `job_requests` has no withdrawn status; the SECURITY DEFINER bodies that still
  read `profiles.banned` directly. That last item was never enumerated when it
  was written, and "six" was only ever the GATE + FILTER count. Eleven functions
  reference `banned`; six of them gate or filter on it. phase68 repoints five and
  excludes one, with evidence, in
  [`docs/audits/PHASE68_DIAGNOSTIC.md`](../audits/PHASE68_DIAGNOSTIC.md)

---

## Reminders that apply to every migration here

- Never execute SQL against any database from inside an autonomous run. This
  file is for a human at the SQL Editor.
- Staging only. Production (`avkighsiufeefyycbebf`) is never contacted, and
  `.env` stays pointed at staging.
- Production has none of the staging migrations; its ordered queue is
  `PROD_APPLY.md`.

---

## Apply phase68 (ban checks through `is_profile_active`)

phase68 depends on phase67: it routes five SECURITY DEFINER bodies through
`public.is_profile_active(uuid)`, which only gained its `deleted_at is null`
term in phase67. Apply phase67 first, always.

**Status: written, NOT applied anywhere.**

### Steps

1. Open the Supabase SQL Editor for **STAGING `zzkumxcjtbqoselzptig`**. Confirm
   the project ref in the URL before pasting anything. Production
   (`avkighsiufeefyycbebf`) is never contacted.
2. Paste the whole of `supabase/phase68_deleted_at_authorization.sql` and run
   it. It is one transaction and is safe to run more than once, including after
   a failed run.
3. Read the NOTICE output. Expect exactly these six lines, then the pass line:

   ```
   PHASE68 PATCHED: job_request_parties_ok(uuid, uuid) [FORM A, GATE-OTHER]
   PHASE68 PATCHED: should_notify(uuid, uuid, text) [FORM A, FILTER]
   PHASE68 PATCHED: transition_job_status(uuid, text, jsonb, jsonb) [FORM A, GATE-SELF]
   PHASE68 PATCHED: match_workers_semantic(double precision[], text[], integer, double precision) [FORM B, FILTER]
   PHASE68 PATCHED: worker_semantic_refresh_queue(integer) [FORM B, FILTER]
   PHASE68 EXCLUDED: notify_nearby_for_job(uuid) - non-ASCII notification literal, see docs/audits/PHASE68_DIAGNOSTIC.md
   PHASE68 SELF-CHECK PASS: 5 functions verified
   ```

   `PHASE68 SELF-CHECK PASS: 5 functions verified` is the line that matters. Any
   `PHASE68 SELF-CHECK FAIL` aborts the transaction and nothing is applied; the
   message names the function and which assertion failed.
4. Run `node scripts/verify-schema.mjs`. The six phase68 checks flip from
   PENDING to OK. Only a green run counts as applied.
5. If something is wrong, paste `supabase/phase68_rollback.sql`. It restores all
   five bodies to their pre-phase68 form and drops the sentinel, and is itself
   safe to run more than once.

### What a self-check failure means

- **(a)** the body that was created does not contain the lifecycle predicate at
  all, so the patch did not take.
- **(b)** the function's argument list changed, which `create or replace` cannot
  do; something else in the database redefined it.
- **(c)** SECURITY DEFINER, volatility or the pinned `search_path` was lost.
  Losing the pinned `search_path` is a privilege-escalation risk, not cosmetic.
- **(d)** a patched function became executable by `PUBLIC` or by `anon`. These
  are internal helpers; that would newly expose them over PostgREST.
