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

1. **Apply `supabase/phase67_account_deletion.sql` to staging, then walk the
   flow on a device.** The migration is written and unapplied. The procedure —
   including the foreign-key NOTICE expectations and the deletion-count
   assertions — is
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
- **Six SECURITY DEFINER bodies still read `profiles.banned` directly** rather
  than through a shared predicate.
- **`42P17` RLS recursion on job delete**, and a stale map pin after an address
  edit.
- **Worker hero-card parity with the design reference** — never built, not a
  regression.

## Out of scope, permanently

AI screens 09–11 and every LLM dependency. Manual posting produces a
`JobDraft`; nothing may depend on AI. Android is deferred; iOS is the target.
The frozen web/PWA surface listed in `CLAUDE.md` is not modified by product
work.
