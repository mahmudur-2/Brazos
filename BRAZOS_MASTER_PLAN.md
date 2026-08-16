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

Four more leave with Stage 4A and its tail, all evidenced in
`HANDOFF.md` and `docs/audits/STAGE4A_FINDINGS.md`:

- **anon-EXECUTE is settled and needs no remediation migration** — a live
  `pg_proc` read on staging, 2026-08-16, found exactly one anon-executable
  function in schema `public`, the deliberate one. Evidence, including the ACL
  string, is in `HANDOFF.md`; it exists nowhere else.
- **`transition_job_status`'s NULL-unsafe owner guard and `unsend_message`'s
  missing active-user gate are both CLOSED** by
  `supabase/phase73_null_safe_owner_guard_and_unsend_gate.sql`, applied to
  staging and verified green on 2026-08-16.
- **The `saved_workers` save write is fixed** in the client as
  `ignoreDuplicates` (ON CONFLICT DO NOTHING). The table has neither an UPDATE
  grant nor an UPDATE policy, and either absence alone refuses the conflict
  path.
- **The in-app notification dead-taps are fixed**, plus the feed's dead
  `review` icon key — no trigger emits that type; phase20 emits
  `review_received`.

Six more leave with Stage 4C — phase74 and phase75, applied to staging on
2026-08-16, evidenced in `HANDOFF.md` and `docs/audits/STAGE4C_REPORT.md`:

- **Ship a scheduler for `send-push`** — phase74 carried it: pg_cron fires
  `drain_notification_outbox()` every minute, which reads Vault and posts to
  `send-push` through pg_net; `claim_notification_batch` bounds unchanged.
- **`delete_my_account` TOCTOU (SS #4)** — phase75 carried it: the caller's
  party jobs are locked `FOR UPDATE` before the blocker gate reads.
- **`jobs_within_radius` trilateration (SS #5)** — phase75 carried it:
  distance snapped to a half mile, ordered and filtered on the snapped
  value, radius clamped.
- **Unbounded money amounts (SS #6)** — phase75 carried it: $100,000 CHECK
  ceilings on `jobs`, `job_offers` and `payments`.
- **`decline_offer()` sweep for cancelled jobs** — phase75 carried it: a
  trigger on `jobs` settles pending offers on any cancellation, so every
  canceller inherits it.
- **The anon-revoke half of SS Q-RLS F7** — phase75 carried it: anon's write
  privileges removed schema-wide; SELECT deliberately retained for the
  verify-schema harness. The F5 half is NOT done and stays below.

1. **Move the Supabase session store to SecureStore.** Access/refresh tokens
   persist in unencrypted AsyncStorage (SS #3) — a device-compromise exposure;
   swap the `createClient` storage adapter to `expo-secure-store`.

## Known follow-ups with a named cause

- **Full anon SELECT revoke, blocked on the harness.** *Named cause:* phase75
  removed anon's write grants but kept SELECT, because
  `scripts/verify-schema.mjs` probes ~55 columns over PostgREST with the
  publishable key and its control check reads `jobs.photos` the same way.
  Revoking SELECT would make the harness report those objects missing.
  Closing it means rebuilding verify-schema's existence probe on a SECURITY
  DEFINER introspection function first.
- **Client-side money ceiling mirror.** *Named cause:* the $100,000 bound is
  enforced only in the database, so a user who exceeds it sees a raw
  constraint violation rather than a written message. Mirror it in `lib/`
  alongside `MAX_COUNTERS_PER_SIDE` (`lib/offers.ts`) when the redesign
  touches those forms.
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
- **The next TestFlight build fails its own gate — replace the EAS `preview`
  environment's `SUPABASE_KEY` with a legacy `eyJ…` anon key.** *Named cause:*
  the value is a new-format publishable key (`sb_pu…`), and `refFromJwt`
  (`scripts/supabase-ref.mjs`) returns null for it because there is no JWT
  payload to decode. `evaluateGate` then reports `env:SUPABASE_KEY does not
  resolve to a Supabase project ref` and exits 1 **before dependencies
  install**. The gate is working exactly as designed — fail closed on anything
  it cannot prove — so this is a configuration fix, not a code fix, and it is
  an operator action outside any run. It must be the legacy anon key for the
  **production** project, because `EXPECTED_REF.testflight` is `PRODUCTION_REF`.
  *Second-order:* `scripts/verify-schema.mjs` shares the same `refFromJwt`, and
  its parity check only compares when the key ref is truthy
  (`if (keyRef && appRef && keyRef !== appRef)`). If staging ever moves to a
  new-format key, that check degrades **silently** to `UNRESOLVED` and still
  prints `parity: OK` rather than failing. Worth making it fail closed the way
  the EAS gate does.
- **"preview" means two different things across `eas.json` and the build
  gate.** *Named cause:* `EXPECTED_REF` (`scripts/eas-build-pre-install.mjs`)
  maps `preview → STAGING_REF`, but `eas.json` declares no `preview` BUILD
  profile at all — only `development`, `testflight` and `production`. The EAS
  **environment** named `preview` is a different namespace, it holds
  **production** credentials, and it is what the `testflight` build profile
  selects (`"environment": "preview"`). Nothing is broken today:
  `EAS_BUILD_PROFILE` is `testflight` on that build and
  `EXPECTED_REF.testflight → PRODUCTION_REF` is the deliberate documented
  decision ("TestFlight binaries reach real testers with real data"). But the
  two files read together imply preview means staging, which is false. Fix is
  documentation at the point of collision, or renaming the environment.
- **Production rebuild from a staging dump (standing decision).** Production
  (`avkighsiufeefyycbebf`) has none of the staging migrations and holds dev
  exhaust only, no real users. Rather than replay the numbered queue, the
  standing decision is to rebuild production from a staging schema dump once
  staging is beta-ready. `PROD_APPLY.md` remains the ordered fallback if a
  replay is chosen instead.

## Surfaced by the 2026-08-15 audits

Each item cites `COMPLETION_REVIEW_2026-08-15.md` (CR) or
`SECURITY_SWEEP_2026-08-15.md` (SS).

- **Capture the pre-repo `payments` SELECT policy into a migration (SS Q-RLS
  F5).** The policy predates the repository and is unauditable from files;
  every other policy is declared in a numbered phase. (F7, the explicit anon
  revoke, landed with phase75 and left this file.)
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
