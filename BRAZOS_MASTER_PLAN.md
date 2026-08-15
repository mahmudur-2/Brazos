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

The prior three near-term priorities — apply phase68, the pre-push security
hardening pair (unauthenticated user-ID lookup → notification write, and
publicly listable photo storage), and the EAS development build — are all done.
phases 67–72 are applied to staging (live snapshot 2026-08-15); the notification
chain was closed by phase69 and photo enumeration by phase72; the dev build runs
on a physical iPhone. They leave this file. Their replacements below are each
evidenced by `docs/audits/COMPLETION_REVIEW_2026-08-15.md` (CR) or
`docs/audits/SECURITY_SWEEP_2026-08-15.md` (SS).

1. **Ship a scheduler for `send-push`.** Enqueue is automatic but nothing drains
   the outbox — the phase20 pg_cron block is commented out, so notifications
   arrive only on a manual invocation (CR §push, SS Q-PUSH). Beta needs pg_net +
   pg_cron (or an equivalent scheduler) enabled and `send-push` fired on an
   interval, with `claim_notification_batch` bounds unchanged.
2. **Settle the effective anon-EXECUTE state on staging.** ~11 pre-phase32
   functions revoke EXECUTE from `public` but never name `anon`; whether `anon`
   still holds EXECUTE is NOT DETERMINABLE STATICALLY and only a live
   `pg_proc.proacl` read (or the `verify-schema` sentinels) settles it (SS #2).
   If drifted, `worker_job_stats`/`deactivate_push_token`/`resolve_notification`
   are the concerning ones. A remediation migration follows only if the live
   check shows anon EXECUTE.
3. **Fix `transition_job_status` NULL-unsafe owner guard.** `assigned_worker_id
   <> v_user` is NULL — not TRUE — when the job is unassigned, so an
   authenticated caller can read any unassigned job's full row as SECURITY
   DEFINER and use the error text as a status oracle (SS #1). Read-only, but it
   bypasses the `jobs` SELECT policies. Its own migration; present since phase58.
4. **Fix the `saved_workers` save write.** `saveWorker` issues an upsert
   (ON CONFLICT DO UPDATE) against a table with no UPDATE grant or policy — a
   hard 42501 or a duplicate-save refusal depending on the live ACL (CR §saved
   workers). Fix is `ignoreDuplicates` (ON CONFLICT DO NOTHING), a client change,
   not a wider grant.
5. **Move the Supabase session store to SecureStore.** Access/refresh tokens
   persist in unencrypted AsyncStorage (SS #3) — a device-compromise exposure;
   swap the `createClient` storage adapter to `expo-secure-store`.

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
- **Production rebuild from a staging dump (standing decision).** Production
  (`avkighsiufeefyycbebf`) has none of the staging migrations and holds dev
  exhaust only, no real users. Rather than replay the numbered queue, the
  standing decision is to rebuild production from a staging schema dump once
  staging is beta-ready. `PROD_APPLY.md` remains the ordered fallback if a
  replay is chosen instead.

## Surfaced by the 2026-08-15 audits

Each item cites `COMPLETION_REVIEW_2026-08-15.md` (CR) or
`SECURITY_SWEEP_2026-08-15.md` (SS).

- **`delete_my_account` TOCTOU (SS #4).** The blocker gate takes no locks and is
  never re-checked, so a concurrent `accept_offer` can strand an assigned job on
  a tombstoned party. Fix: re-run the blockers under `FOR UPDATE` on the caller's
  party jobs before committing the tombstone. Its own migration.
- **`jobs_within_radius` trilateration (SS #5).** Returns full-precision
  `distance_miles` from a caller-chosen point with an unbounded radius; three
  probes recover exact coordinates, eroding the approximate-location invariant.
  Round or cell-snap the distance.
- **Unbounded money amounts (SS #6).** create/counter offer and job budgets
  reject only `<=0`, no ceiling; sandbox today but the gap must close before a
  real payment provider. Only tips are capped.
- **`unsend_message` active-user gate (SS #9).** Add the `is_active_user()` check
  its sibling write RPCs carry, so a banned account cannot blank its messages.
- **Capture pre-repo policies into migrations (SS Q-RLS F5) and add explicit
  `revoke … from anon` on the RLS-only tables (F7).** The `payments` SELECT
  policy is pre-repo and unauditable from files; several tables rely on
  `authenticated`-scoped policies with no anon table-revoke — defense-in-depth,
  matching phase29/50/51/53/56.
- **In-app notification dead-taps (CR §notifications).** Direct-message and
  `review_received` feed rows mark-read and navigate nowhere; `WorkerJob` rows
  land on the hub. Push taps are unaffected. Fix `NotificationsScreen` routing to
  match `notificationRoutes`.
- **Customer follow-along checklist is unrendered (CR §active-work).** RLS and UI
  copy promise a customer view of the worker's checklist, but no customer surface
  renders it. Either build the read surface or remove the promise.
- **Pair-thread media hole (CR §messaging).** A hired pair whose shared jobs are
  all cancelled resolves to the job-keyed pair thread and can never send
  photo/voice. Needs a thread-scoped storage path.
- **Remove dead code (CR dead-code sweep).** `components/SectionHeader.tsx` is
  dead; `hooks/useChat.ts` and `ui/templates/ListScreen.tsx` are statically
  orphaned; several exported symbols are stranded. Removal is mechanical but
  `useChat.ts` is comment-branded "LOCKED", so it is a human decision.
- **Dependency-advisory sweep (SS Q-DEPS).** `npm audit --omit=dev`: 0 critical /
  14 high / 13 moderate, all in the Expo/Metro/RN toolchain (build/CLI-time DoS
  classes, no runtime-data-path package). Resolve with a coordinated
  Expo-SDK/toolchain bump in a code-touching pass; not urgent, not a shipped-app
  RCE.

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
