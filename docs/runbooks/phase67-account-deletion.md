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
(repository state at commit `260a17f`), with one exception, corrected
2026-08-16: every acceptance step that told the operator to *read the NOTICE
output* has been replaced, because the Supabase SQL Editor does not display
`RAISE NOTICE` at all. See the box below. No other requirement, expectation or
assertion has been added, removed or reworded.

---

## READ THIS FIRST — `RAISE NOTICE` is invisible in the SQL Editor

Every migration in this repository reports progress with `raise notice`. **None
of it reaches the Supabase dashboard.** The SQL Editor renders query *results*
only, and Postgres does not log below `WARNING` by default
(`log_min_messages = warning`), so the notices are not in the dashboard logs
either. An operator has already gone hunting for a panel that does not exist.

What that changes about acceptance:

- **The gate is the absence of an error.** Every migration here is a single
  transaction whose self-check `raise`s an exception on failure, and an
  exception rolls the whole thing back. So **"Success. No rows returned." with
  no error means the self-check passed.** There is nothing else to look for in
  the editor.
- **The real proof is `node scripts/verify-schema.mjs`.** A migration's
  sentinel and checks flip from PENDING to OK only when the objects genuinely
  exist. That run is what counts as applied — SQL Editor success on its own
  never was.
- **The expected NOTICE text below is kept for `psql`.** Applying with
  `psql -f` (or any client that surfaces server notices) does print those
  lines, and they are useful there. In the SQL Editor, expect to see none of
  them; their absence is not a failure.

---

## ACTION REQUIRED — phase67 is written but NOT applied

Paste `supabase/archive/phases/phase67_account_deletion.sql` into the Supabase SQL Editor for
**STAGING `zzkumxcjtbqoselzptig`** and run it. It was amended this run and never
executed anywhere. Then confirm two things the repo cannot prove:

1. **In the SQL Editor:** "Success. No rows returned." with no error. That is
   the whole acceptance signal there — see the box above. The section-1 DO
   block's NOTICE (which names the dropped `auth.users` foreign keys, expect
   `public.profiles`) is **not visible** in the editor. If you applied via
   `psql`, that notice does print, and zero dropped on a first run means the FK
   was never there — investigate before trusting the tombstone. From the SQL
   Editor, check the FK instead by querying `pg_constraint` for a remaining
   `auth.users` reference from `public.profiles`.
2. Walk a throwaway staging account through delete end to end, with an OPEN
   posting on it. Expect: deletion succeeds and the posting flips to
   `cancelled` — verify both by *reading the rows*, not by looking for the
   closing count NOTICE, which the editor does not show.

Only a green `node scripts/verify-schema.mjs` counts as applied — 4 phase67
checks report PENDING and become mandatory automatically. **That run is the
real gate**, not anything the SQL Editor prints.

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
- **Do not look for `RAISE NOTICE` output in the dashboard.** It is never
  shown. Acceptance is "Success. No rows returned." with no error, then a green
  `node scripts/verify-schema.mjs`. Full explanation in the box at the top.
- Staging only. Production (`the production ref`) is never contacted, and
  `.env` stays pointed at staging.
- Production has none of the staging migrations; its ordered queue is
  `PROD_APPLY.md`.

---

## Apply phase68 (ban checks through `is_profile_active`)

phase68 depends on phase67: it routes five SECURITY DEFINER bodies through
`public.is_profile_active(uuid)`, which only gained its `deleted_at is null`
term in phase67. Apply phase67 first, always.

**Status: APPLIED to staging (`zzkumxcjtbqoselzptig`), self-check passed
(`PHASE68 SELF-CHECK PASS: 5 functions verified`), confirmed against a live
schema snapshot 2026-08-15. Production still needs it** — the procedure below is
preserved unchanged for that run.

### Steps

1. Open the Supabase SQL Editor for **STAGING `zzkumxcjtbqoselzptig`**. Confirm
   the project ref in the URL before pasting anything. Production
   (`the production ref`) is never contacted.
2. Paste the whole of `supabase/archive/phases/phase68_deleted_at_authorization.sql` and run
   it. It is one transaction and is safe to run more than once, including after
   a failed run.
3. **Accept on "Success. No rows returned." with no error.** phase68 is one
   transaction and its self-check `raise`s on failure, so a clean run *is* the
   self-check passing — there is nothing to read. Any `PHASE68 SELF-CHECK FAIL`
   arrives as an **error**, which the editor does show; it aborts the
   transaction, nothing is applied, and the message names the function and
   which assertion failed.

   The `raise notice` lines below are **not visible in the SQL Editor** (see
   the box at the top of this file). They are kept as a reference for applying
   with `psql`, which does print them:

   ```
   PHASE68 PATCHED: job_request_parties_ok(uuid, uuid) [FORM A, GATE-OTHER]
   PHASE68 PATCHED: should_notify(uuid, uuid, text) [FORM A, FILTER]
   PHASE68 PATCHED: transition_job_status(uuid, text, jsonb, jsonb) [FORM A, GATE-SELF]
   PHASE68 PATCHED: match_workers_semantic(double precision[], text[], integer, double precision) [FORM B, FILTER]
   PHASE68 PATCHED: worker_semantic_refresh_queue(integer) [FORM B, FILTER]
   PHASE68 EXCLUDED: notify_nearby_for_job(uuid) - non-ASCII notification literal, see docs/audits/PHASE68_DIAGNOSTIC.md
   PHASE68 SELF-CHECK PASS: 5 functions verified
   ```

   Not seeing `PHASE68 SELF-CHECK PASS: 5 functions verified` in the dashboard
   is expected and is **not** a failure signal.
4. Run `node scripts/verify-schema.mjs`. The six phase68 checks flip from
   PENDING to OK. **This is the real gate** — only a green run counts as
   applied.
5. If something is wrong, paste `supabase/archive/phases/phase68_rollback.sql`. It restores all
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
