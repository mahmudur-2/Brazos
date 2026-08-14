# BRAZOS — Roadmap

**This is a roadmap, not a current-state authority.** Nothing here is evidence
that anything is built, applied, or verified. It records intent and ordering
only.

| For | Read |
| --- | --- |
| Permanent policy and invariants | `CLAUDE.md` |
| What last happened, what is blocked now | `HANDOFF.md` |
| What is actually implemented | `docs/architecture.md` |
| Branch, HEAD, tree state | `git`, never a document |
| How the repository got here | `docs/archive/` |

The previous plan — its §A–§P sections, phase numbering, and execution
protocol — is preserved verbatim at
[`docs/archive/BRAZOS_MASTER_PLAN_v1_2026-08.md`](docs/archive/BRAZOS_MASTER_PLAN_v1_2026-08.md).
Source comments that cite "BRAZOS_MASTER_PLAN.md §F" and similar refer to that
archived document, not to this one. Its execution protocol is superseded by
CLAUDE.md's Workflow section.

## How to read this file

Every item below is evidenced by the current `HANDOFF.md` or by the repository
itself. Nothing is carried forward on the strength of an older plan. When an
item lands, it leaves this file; when a new priority appears, it arrives here
with the evidence that produced it.

## Near-term priorities

1. **Apply `supabase/phase68_deleted_at_authorization.sql` to staging.** The
   migration is written and unapplied. It depends on phase67, which is applied
   and device-verified as of 2026-08-14. The apply steps, the expected NOTICE
   output and the meaning of each self-check failure are in the phase68 section
   of
   [`docs/runbooks/phase67-account-deletion.md`](docs/runbooks/phase67-account-deletion.md).
   Only a green `node scripts/verify-schema.mjs` counts as applied.
2. **Security hardening before push ships.** Two items are named in `HANDOFF.md`:
   an unauthenticated user-ID lookup chained to a notification write, and
   publicly listable photo storage. Both are prerequisites for shipping push
   notifications, not follow-ups to it.
3. **EAS development build**, required before TestFlight and before push can be
   tested on a device. The weakened production build gate is fixed in the same
   pass. Apple Developer Program enrolment is calendar-gated — start it before
   it is needed.

## Known follow-ups with a named cause

- **`decline_offer()` sweep for cancelled jobs.** Account deletion cancels an
  open posting with a raw UPDATE, because `transition_job_status()` permits
  only `assigned → in_progress` and `in_progress → completed` and authorises
  only the assigned worker. Offers other people authored on a cancelled job
  therefore stay `pending` and nobody is notified. The fix is its own
  migration.
- **Retire the RPC-missing shims.** `lib/jobStatusCompatibility.ts` and
  `isMissingRpc()` in `lib/profiles.ts` exist only for deployments predating
  phase30/phase31. Retire them once every environment the app runs against is
  confirmed past those migrations.
- **Remove the deprecated database functions.** `accept_bid()` and
  `respond_job_request()` have zero app callers and are scheduled for removal
  in a numbered migration.
- **Customer-safe market preview route.** `JobDetail` is registered in the Map
  and MyJobs stacks, so a customer drilling into a map cell can still reach a
  worker surface. Closing it needs a new customer-facing preview screen.
- **Production migration queue.** Production has none of the staging
  migrations. The human-executed order is in `PROD_APPLY.md`.

## Deferred, with the reason

- **Phone / SMS sign-in activation.** Fully built and running against a
  development-only mock; no SMS provider is configured or paid for. Turning it
  on is documented in
  [`docs/phone-auth-activation.md`](docs/phone-auth-activation.md).
- **The richer job-status enum.** The database vocabulary stays
  `open → assigned → in_progress → completed`; everything richer is derived in
  `lib/jobLifecycle.ts`. When the enum migration lands, the enum values replace
  that function's body and the app follows in one file.
- **Storage cleanup on account deletion.** Avatar keys carry the uploaded
  file's extension, and portfolio media shares the non-per-user `job-photos`
  bucket, so neither deletes cleanly by prefix.
- **`notification_outbox.title` / `body`** embed an actor's name with no actor
  column, so a renamed or deleted actor leaves stale copy behind.
- **`job_requests` has no withdrawn status.**
- **Ban checks that bypass the shared lifecycle predicate.** The old entry here
  claimed "six SECURITY DEFINER bodies still read `profiles.banned` directly"
  and was never enumerated. phase68 enumerated it; the full evidence, with file
  and line for every site, is in
  [`docs/audits/PHASE68_DIAGNOSTIC.md`](docs/audits/PHASE68_DIAGNOSTIC.md).
  Eleven functions reference `banned`. Six of them gate or filter on it, which
  is where "six" came from; the other five either write it (`ban_user`,
  `unban_user`), return it as data (`admin_open_reports`), or do not touch
  `profiles.banned` at all (`current_user_is_banned`, `handle_new_user`).
  Resolution:
  - **Repointed by phase68 (5):** `job_request_parties_ok`, `should_notify`,
    `transition_job_status` now call `public.is_profile_active(uuid)`;
    `match_workers_semantic` and `worker_semantic_refresh_queue` inline
    `deleted_at is null` beside the existing predicate, because both are set
    scans and a per-row definer call does not belong in one.
  - **Excluded (1):** `notify_nearby_for_job`. Its body carries a non-ASCII
    separator inside a user-visible notification string, and `create or replace`
    re-emits the whole body, so it cannot be patched without either breaking the
    ASCII rule or changing user-facing copy. A deleted account is already
    excluded from that fan-out structurally, because `delete_my_account` deletes
    the `notification_prefs` row the query inner-joins. Patching it needs a
    migration allowed to carry UTF-8, or a decision to encode the separator as
    `chr(183)`.
  - **Left alone deliberately (5):** the two writers, the one reader, and the
    two that never read `profiles.banned`.
- **Retire `current_user_is_banned()`.** It fails OPEN on a missing profile row
  and no function body calls it; its only caller is `lib/profiles.ts:132`.
  Removal needs its own migration plus that client sweep.
- **`42P17` RLS recursion on job delete**, and a stale map pin after an address
  edit.
- **Worker hero-card parity with the design reference** — never built, not a
  regression.

## Out of scope, permanently

AI screens 09–11 and every LLM dependency. Manual posting produces a
`JobDraft`; nothing may depend on AI. Android is deferred; iOS is the target.
The frozen web/PWA surface listed in `CLAUDE.md` is not modified by product
work.
