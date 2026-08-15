# BRAZOS — Completion Review — 2026-08-15

> This is a STATIC source audit. It finds design and logic holes in the code as
> written. It CANNOT prove runtime security. A clean result means no obvious
> defect in source — never "safe to launch." Live-staging and on-device
> adversarial testing remain required before beta.

Method: each user-facing flow was traced through its full runtime dependency
graph — screen file → navigation registration → hooks/components → `lib/*.ts`
Supabase call (exact RPC / table) → the migration that defines the RPC and its
grant. Effective schema is the last definition of each object across
`supabase/phaseNN_*.sql` applied in numeric order through phase72 (rollbacks not
applied). The feature list was derived from the code, never from a plan.

Verdict rubric (exactly one per flow):
**COMPLETE** = statically complete AND covered by an automated test OR the §1
device evidence · **UNTESTED** = statically complete + wired, no test/runtime
proof · **PARTIAL** = reachable but a named piece is missing · **ORPHANED** =
code exists, no route reaches it · **ABSENT** = a document claims it, it does
not exist.

Device evidence on file (from the dispatch ground truth): account-deletion
walked end-to-end on a physical iPhone 2026-08-14 (5 checks); push proven
end-to-end on device; an EAS *development* build (staging env) boots and signs
in on a physical iPhone. Nothing else has runtime proof.

`npm run verify` (this run, §2): **GREEN** — lint clean (`tsc --noEmit`
+ `noUnusedLocals`/`noUnusedParameters`), tests **531 pass / 0 fail / 0 skipped**
across 7 suites. A red verify would have been finding #1; it is green, so there
is none.

---

## Verdict tally

| Verdict | Count | Flows |
| --- | --- | --- |
| COMPLETE | 17 | sign-in, setup/onboarding, mode switch, account deletion, payment-methods screen, post a job, browse/search, offers/counteroffers, hire/checkout, worker search, job detail / my-jobs, approve/dispute, review+tip, earnings/cash-out, worker self-service+pricing, messaging (text/lock/threads/inbox), push-token registration |
| UNTESTED | 8 | legal gate, profile+portfolio, map, admin/reports, messaging media+voice, unsend, reactions, sharing |
| PARTIAL | 3 | saved workers, active-work lifecycle, notifications feed |
| ORPHANED | see §Dead code | `components/SectionHeader.tsx` (dead); `hooks/useChat.ts`, `ui/templates/ListScreen.tsx`, `modes/ModeGuard.tsx` (statically orphaned / test-only) |
| ABSENT | 4 | `offer_events` table, `job_private_details`, `completion_records`, `job_media` — none exist; superseded by `messages` / `job_locations` / jsonb-on-`jobs` |

---

## Flows

### Authentication, onboarding, identity

**Sign-up / sign-in — COMPLETE.** `AuthFlow` gate (`App.tsx:68`) → six screens
registered (`screens/AuthFlow.tsx:29-37`). Email/password
(`lib/AuthContext.tsx:123,136`) is the **only session-creating path** in every
current build; `handle_new_user` (final `phase13:418`) seeds the profile,
banned-phone refusal at signup. `phoneOtp.test.mjs`/`authPhone.test.mjs` execute
both providers (940+ lines: no-session-is-never-auth, sign-in cannot create,
draft written only under a real session, mock impossible outside `__DEV__`).
*Tester note:* the phone-OTP path is dormant — **mock in dev** (returns no
session, routes to email) and **fail-closed "phone sign-in is switched off" in a
release binary**. On a TestFlight build the top-billed phone CTA dead-ends and
the user must self-route to the email alternate; on the tester's dev build,
email against staging works (the device evidence requires it).

**Legal gate — UNTESTED.** `LegalGateScreen` on both the re-prompt path
(`App.tsx:86`) and onboarding (`SetupScreen.tsx:148`);
`accept_legal_documents` final `phase21:77`, grant `phase21:120-121`. All 22
`legalGate.test.mjs` assertions are source-text; the status read *fails open* on
error (by design). No named device walk.

**Setup / onboarding — COMPLETE.** Device-local only, no DB surface by design;
`setupOnboarding.test.mjs` (43 tests) executes the whole persistence core
(per-user keying, no cross-account inheritance, unreadable⇒show-setup,
navigate-only-after-write).

**Mode switch — COMPLETE.** `ModeProvider` resolution (`modes/ModeProvider.tsx:161-243`),
`get_my_active_mode`/`set_active_mode` final `phase42:73/91` grants `:86-87/:119-120`;
`active_mode` is RPC-only (not in the public column grant). `mode.test.mjs`
executes the landing>remote>cache>default precedence and asserts the two trees
cannot name each other's routes. Interactive confirm→overlay→swap is text-guarded
only.

**Profile + portfolio — UNTESTED.** All hops registered, every RPC granted
(`get_my_profile` `phase29:107`, `update_my_profile` final `phase53:148`,
portfolio direct-DML under `phase17`/`phase53` RLS, review readers `phase37`).
Coverage is text/SQL-text guards only; no device walk named. Benign latent branch:
`lib/profiles.ts:72-79` PGRST202 fallback does a direct `profiles` UPDATE that
phase29 revoked — unreachable while the RPC exists, fails closed if reached.

**Account deletion — COMPLETE.** `delete_my_account`/`account_deletion_blockers`
final `phase67:331/234`, grants `phase67:624-627`; `accountDeletion.test.mjs`
executes the blocker/format logic; walked on-device 2026-08-14. Local-only
sign-out handles the JWT-outlives-row trap.

**Payment-methods screen — COMPLETE.** Honest static screen — zero network,
states the build's payments mode and "no provider connected"; no fabricated card
vault. `resolvePaymentsMode` executed by `sandboxCheckout.test.mjs`.

### Marketplace core

**Post a job — COMPLETE.** `create_job` (15-arg) final `phase49:110`, grant
`:230-239`; exact address goes only to `job_locations`. `postJobDraft.test.mjs`
executes the draft layer; `hardening.test.mjs:50-90` locks RPC-only writes.

**Browse / search — COMPLETE.** `BrowseJobsScreen` (LOCKED) → `fetchOpenJobs`
(RLS-scoped, column allowlist) + `job_offer_counts` (`phase46:847`) +
`jobs_within_radius` (`phase43:452`). `discovery.test.mjs` executes
`lib/jobFilters.ts`; `crossTabNavigation.test.mjs` proves registration parity.

**Map — UNTESTED.** `MapScreen`→`CellJobs`→`JobDetail` wired; `job_hotspots`/
`jobs_in_cell` final `phase43:367/414`, grants `:499-502` (aggregates only, no raw
coords). No test executes tier math or map wiring.

**Offers / counteroffers — COMPLETE.** All writes through `lib/offers.ts` (zero
direct `job_offers` writes). `create_offer` final `phase61:204`, `counter_offer`
final `phase63:69` (10/side cap), accept/decline/withdraw `phase50`. Executed by
`offerActionParity.test.mjs`, `counterCap.test.mjs`, `offerComposer.test.mjs`.

**Hire / checkout — COMPLETE (within the sandbox boundary).** `sandbox_authorize_job_payment`
final `phase58:66`, `sandbox_hold_job_payment` `phase50:269`. `sandboxCheckout.test.mjs`/
`fundingPath.test.mjs` execute the mode resolver and funding matrix. **Payments
resolve to `disabled` on any non-dev binary** (`lib/adapters/paymentsMode.ts:35-41`)
— checkout works only on the `__DEV__` dev-client build.

**Worker search / direct hire — COMPLETE.** Semantic path
(`functions.invoke('worker-search')` → `match_workers_semantic` final `phase68:290`)
falls back deterministically on any failure; direct hire routes through
`create_offer` (the `create_job_request` shim `phase46:1035` has zero app callers).
`workerMatching.test.mjs` (992 lines) executes a mirror of the ranking. Edge-function
deployment status is NOT DETERMINABLE STATICALLY; the fallback keeps the flow alive.

**Saved workers — PARTIAL.** List + unsave clean (own-scoped RLS, `phase53:80-111`).
**Named missing piece:** `saveWorker` (`lib/savedWorkers.ts:36`) calls
`.upsert(..., {onConflict})`, which PostgREST runs as `INSERT … ON CONFLICT DO
UPDATE`, but phase53 grants **no UPDATE** on `saved_workers` and defines no UPDATE
policy. Statically that is either a hard 42501 on every save (if the live ACL is
exactly phase53's) or a duplicate-save refusal (if Supabase's default `GRANT ALL`
survived table creation) — NOT DETERMINABLE STATICALLY. Safe fix is
`ignoreDuplicates` (ON CONFLICT DO NOTHING), not a wider grant.

**Job detail / my jobs — COMPLETE.** Hub + all three detail screens; lifecycle
derivation exists exactly once (`deriveJobLifecycle`, `jobStage` — P3-31 honored,
asserted by `lifecycle.test.mjs:92`). `transition_job_status` final `phase68:189`.

### Active-work, money, admin

**Active-work lifecycle — PARTIAL.** En-route/arrived (`mark_worker_arrival`
`phase51:214`), checklist (direct DML, worker-scoped `phase51:88-157`), transitions
(`transition_job_status` `phase68:189`) all wired. **Named missing piece:** the
customer "follow along" checklist read is promised in RLS (`phase51:106-114`) and
in UI copy (`WorkChecklistScreen.tsx:82`) but **no customer surface renders it** —
`fetchChecklist` has one caller, which shows permission-denied to non-workers.
Also: **live location tracking does not exist** — no `watchPositionAsync` anywhere;
`TrackWorker` renders only `en_route_at`/`arrived_at` timestamps, and says so.
Arrival/checklist DB behavior is text-asserted only (no execution).

**Approve / dispute — COMPLETE.** `sandbox_release_job_payment` `phase51:370`,
`open_job_dispute`/`withdraw_job_dispute` `phase51:511/584`; `job_disputes` is
RPC-write-only (`phase51:200-203`). `fundingPath.test.mjs` executes the fork.
By-design edge: an open dispute never withdrawn blocks release forever — no
`resolved` writer / admin-resolution surface exists (documented deferral).

**Review + tip — COMPLETE.** `create_review` final `phase37:99` (party-of-completed-job,
unique constraint), `sandbox_tip_worker` `phase51:636` (release-first, one-per-job,
$1,000 cap). phase71 preserves the party-scoped review read + definer readers.
`reviews.test.mjs`/`hardening.test.mjs` cover it (static).

**Earnings / cash-out — COMPLETE.** `deriveEarnings` (pure) executed by
`earnings.test.mjs`; `sandbox_cash_out` final `phase55:25` (payee-scoped,
released→paid_out, idempotent).

**Worker self-service + pricing — COMPLETE.** `worker_services` CRUD under own-scoped
RLS (`phase53:27-73`); availability via `update_my_profile`. `selfService.test.mjs`
asserts grants, the exact allowlist, draft policies, and reachability.

**Admin / reports — UNTESTED.** `AdminReportsScreen` registered in both modes,
UI-gated by `profile.is_admin`; every data call is server-gated
(`admin_open_reports`/`ban_user`/`unban_user` `phase13`, `reports_update_admin`
via `current_user_is_admin` `phase29`). **Zero automated coverage of the flow**;
only `verify-schema` (staging-only) probes the functions.

### Messaging, push, notifications

**Messaging (text/lock/threads/inbox) — COMPLETE.** One INSERT for all send paths
(`lib/messages.ts:207`); INSERT policy final `phase66:143-185` gated by
`messaging_unlocked` (final `phase66:92`). `messagingLock.test.mjs`/
`unifiedConversation.test.mjs` execute the resolver and lock logic.
**Media + voice — UNTESTED** (wiring proven end to end; only guard-position
asserted). **Unsend — UNTESTED** (`unsend_message` final `phase70:51`, UI +
realtime present; **zero tests mention unsend**). *Feature hole:* a hired pair
whose shared jobs are all cancelled resolves to the pair thread, which is
job-keyed for storage, so they can never send photo/voice (composer hides the
controls — degraded, not a crash).

**Push-token registration — COMPLETE.** `register_push_token` `phase20:105`, grant
`:134-135`; sign-out detach uses the owner-RLS UPDATE (not the service-role RPC).
Device-proven end to end. *Operational gap:* nothing schedules `send-push` (the
phase20 pg_cron block is commented out) — the outbox drains only on manual
invocation, so the delivery pipeline is **operationally PARTIAL** until a
scheduler exists. Enqueue is fully automatic.

**Notifications feed + routing — PARTIAL.** Pipeline, prefs, and feed read/mark-read
complete and test-pinned (`notificationFeed.test.mjs`). Push-tap routing
(`lib/notificationRoutes.ts`) handles all payload shapes. **Named missing pieces
— in-app feed taps only:** a direct-thread message notification
(`{screen:'Chat', directThreadId}`, no jobId) and a `review_received`
notification (`{screen:'ProfileMain'}`) both mark-read and **navigate nowhere**
(`NotificationsScreen.tsx:70-91`); `WorkerJob` payloads land on MyJobsHub instead
of the job (degraded).

**Reactions — UNTESTED.** Fully wired (`useReactions`, `message_reactions` RLS
`phase10`, realtime); zero tests.

**Sharing — UNTESTED.** Single consumer `PhotoViewer.tsx`; `sharePhoto` never
executed; expo-file-system v19 behavior NOT DETERMINABLE STATICALLY.

---

## Dead code / orphans

Searches run per item: file-level import diff (catches `require`/dynamic
`import()`), symbol-level `-rw` cross-ref against all app dirs + tests,
route-name-string diff against every `Stack.Screen name=` registration, and a
repo-wide raw grep. **Every one of the 48 screens is registered on a reachable
route** (37 in the mode trees/shared stacks, 6 in `AuthFlow`, 2 in
`OnboardingFlow`, the rest mounted in `App.tsx`). No unregistered screen.

- **`components/SectionHeader.tsx` — ORPHANED (dead).** Zero imports anywhere;
  only hits are RN internals in frozen `dist/` and historic `project-audit/*.md`.
- **`hooks/useChat.ts` — STATICALLY ORPHANED** (superseded by
  `useConversationChat`). Zero imports; only reference is an allowlist *string*
  in `errorMessage.test.mjs` (path is `continue`d, never executed). Labeled
  orphaned not dead because the allowlist comment brands it "LOCKED" — removal is
  a policy decision, not this run's.
- **`ui/templates/ListScreen.tsx` — STATICALLY ORPHANED** (barrel-exported,
  zero runtime consumers).
- **`modes/ModeGuard.tsx` — TEST-ONLY** (a deliberate dev canary installed
  nowhere; asserted by `mode.test.mjs`).
- **Orphaned exported symbols** (no external or test refs): `conversationTarget`
  (`lib/conversations.ts:40`), `fetchOpenJobsInCells` (`lib/hotspots.ts:251`),
  `OFFER_JOB_TAB` (`lib/offerNavigation.ts:37`), `fetchOfferCount`
  (`lib/offers.ts:446`, superseded by the batch RPC).
- Catalog-only primitives (`ListRow`, `SearchBar`, `MediaGrid`, and barrel
  aliases) reach their only consumer through the `__DEV__`-gated ComponentCatalog
  — not in a release bundle, not actionable.
- `lib/supabase.web.ts`, `lib/jobStatusCompatibility.ts`, `lib/launchContext.ts`,
  `lib/homeDesignStudio.tsx`, `lib/hotspots.ts` all confirmed WIRED (details in
  the transcript). `jobStatusCompatibility` is dormant-by-design on staging, not
  orphaned.

## ABSENT (claimed somewhere, does not exist)

- **`offer_events`** table — negotiation events live in `public.messages`
  (`job_offer_id` + `request_event`).
- **`job_private_details`** — never built; `job_locations` is that surface (per
  CLAUDE.md / `phase43`).
- **`completion_records`, `job_media`** — never built; completion media lives on
  `jobs` as jsonb columns.

---

## TESTER-READY VERDICT

**Can a stranger install this and complete a job end to end without a dead end?
On the EAS *development* build (staging), yes — the happy path closes.** Every
hop from post → offer → accept → fund → work → release → review/tip is
registered, param-typed, and lands on a granted RPC that exists in the effective
schema. Account deletion and push are device-proven; the offer/lifecycle/money
logic is either test-executed or device-adjacent.

Blockers, ordered by what breaks a tester first:

1. **Build type gates the money loop.** Checkout → release → tip → cash-out only
   function on a `__DEV__` dev-client build; a release/TestFlight binary resolves
   payments to `disabled` and Checkout refuses. The tester must be on the
   development build (they are, per §1). *If a release build is handed to a
   tester, the entire money half of the app is inert.*
2. **Phone sign-in dead-ends on a release build.** The primary CTA shows "phone
   sign-in is switched off"; the tester must use email. Non-issue on the dev
   build; a real wall on a release binary until Supabase Phone Auth is
   provisioned.
3. **Push delivery needs a manual kick.** Enqueue is automatic but nothing drains
   the outbox on a schedule — notifications arrive only when `send-push` is
   invoked. A tester waiting on a push may see nothing until the operator runs it.
4. **Saved-workers save may hard-fail** (42501) depending on the live
   `saved_workers` table ACL — NOT DETERMINABLE STATICALLY, verify on staging.
   List and unsave are fine.
5. **In-app notification taps dead-end** for direct-message and review
   notifications (mark-read, go nowhere); WorkerJob taps land on the hub. Push
   taps are unaffected.
6. **Customer "follow along" checklist is promised but unrendered** — a customer
   watching an active job sees no checklist even though the worker is filling one
   in. Not a hard stop; a broken promise in the UI copy.

"Not determinable without a device" items that a live pass must settle: whether
staging's applied functions behave as their files read (ACL inheritance across
`create or replace`, the 72-hour auto-release clock, trigger fan-out); whether
the `worker-search` Edge Function is deployed; and the `saved_workers` ACL in
(4). The device evidence on file covers account-deletion, push, and boot/sign-in
only — none of the six blockers above except (1)/(2)'s dev-build assumption.
