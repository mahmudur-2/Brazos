## 2026-08-22 — BATCH C: corrective migration phase76 — APPLIED TO STAGING, VERIFIED

**phase76 was hand-applied to STAGING by the operator on 2026-08-22, and the
operator's own `node scripts/verify-schema.mjs` run came back green** — the
posture line reading `rls posture: payments RLS on with a SELECT boundary
[payments RLS on, 1 SELECT policy(ies)]` and the run closing with `All
REQUIRED objects exist in the live database.` **F-002, F-004, F-040, F-049
and F-068 are CLOSED.** The evidence is that operator-run verify against live
staging — not a repository read; no agent run has contacted any database.
(This supersedes this section's original "AUTHORED, NOT APPLIED" banner,
which was true when written.)

**If the paste aborts, that is the file working.** Everything runs in one
transaction; nothing half-applies. The messages it can raise, and what each
means:

- `phase76: table public.<name> not found` / `phase76: job_request_parties_ok
  (uuid, uuid) not found` — wrong or unmigrated database; nothing happened.
- `phase76: policy <name> on public.blocks|mutes not found` — the phase13
  moderation policies are missing, so the premise of the narrowed revoke is
  false; investigate before re-running.
- `phase76: RLS is OFF on public.payments` — the F-002 disaster case is LIVE:
  the phase50:174 SELECT grant is exposing the money ledger. Do not re-run;
  investigate how RLS was lost. (The file asserts, deliberately never enables.)
- `worker_services_money_ceiling` constraint violation — a staging row has
  price_cents above 10,000,000 (or negative). The apply aborts loudly by
  design (no NOT VALID); report the row rather than widening the ceiling.
- `PHASE76 SELF-CHECK FAIL (a)–(f): …` — a post-condition did not hold
  (payments RLS/policy, the pg_temp re-pin, the grant sweep including the
  load-bearing blocks/mutes insert/delete grants, the ceiling, jobs.location,
  or the posture function's ACL). The transaction rolled back; nothing landed.

**What the file does, per finding:**
- **F-002** — asserts `payments` RLS is on (raises if off); then, at apply
  time, creates `payments_select_parties` (`payer_id = auth.uid() or payee_id
  = auth.uid()`, columns from phase50's own DDL) ONLY if staging has no
  SELECT policy on `payments`; if the pre-repo policy exists it creates
  nothing and records the policy name(s) in the table comment. Which branch
  ran is visible in the SQL Editor afterwards via the table comment.
- **F-004** — `alter function public.job_request_parties_ok(uuid, uuid) set
  search_path = public, pg_temp;` restoring phase64's pin that phase68's
  CREATE OR REPLACE silently dropped.
- **F-040** — write grants now tell the truth on the seven B.4 tables:
  full `insert, update, delete` revoke from `authenticated` on
  `job_requests`, `direct_threads`, `banned_phones`, `job_disputes` (re-assert
  of phase51:201) and `worker_semantic_docs` (re-assert of phase39:173);
  **UPDATE-only on `blocks` and `mutes`** — phase13's insert/delete policies
  carry live app writes (`lib/moderation.ts:80–104` block/unblock/mute/
  unmute), so those grants are load-bearing and kept, and the self-check
  asserts they SURVIVED. This is a deliberate, reported deviation from the
  dispatch's blanket list; the batch report has the evidence.
- **F-049** — `worker_services_money_ceiling`: `price_cents >= 0 and
  <= 10000000`. NULL still means "ask" and phase53's inline `> 0` check still
  rejects zero; this adds only the missing ceiling.
- **F-068** — `jobs.location text` folded in as idempotent DDL. The orphan
  `supabase/add_location_column.sql` is UNTOUCHED on disk; deleting it is an
  operator call.
- **New:** `phase76_rls_posture()` — SECURITY DEFINER, pg_temp-pinned,
  deliberately anon-executable (the second such function after
  `job_categories_expanded`), returning RLS booleans for a fixed eight-table
  list plus `payments.select_policy_count`. No names, no definitions, no rows.

**Machine state at end of run:** four commits on `mainexpo` (`e0fdd35`
schema, `e1e5dcc` verify group, `208448e` tests, plus this HANDOFF commit),
pushed under the autonomy gate after a green bare `npm run verify` — 810
pass / 0 fail / 0 skipped, exit 0 (baseline this run: 804 pass). The six new
tests were each mutated red before being kept. `git` remains the authority on
what reached the remote.

