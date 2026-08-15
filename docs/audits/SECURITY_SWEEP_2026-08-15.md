# BRAZOS — Static Security Sweep — 2026-08-15

> This is a STATIC source audit. It finds design and logic holes in the code as
> written. It CANNOT prove runtime security. A clean result means no obvious
> defect in source — never "safe to launch." Live-staging and on-device
> adversarial testing remain required before beta.

Scope: effective final state only. `supabase/phaseNN_*.sql` are applied in
numeric order through phase72; `*_rollback.sql` are NOT applied. Every function,
policy, and grant below is the LAST such statement in phase order; superseded
historical definitions are never reported as live. Where final state is not
statically determinable (a pre-repo object, an ACL that only the live catalog
can settle, or the platform half of a control), the finding says NOT DETERMINABLE
STATICALLY and names the missing proof. The deliverable is naming the gap — no
fixes, no code.

Two facts bound the reassurance in this report: (1) there are NO generated
Supabase types, so status literals are runtime-checked only; and (2) `create or
replace` preserves a function's existing ACL, so several "is anon still
EXECUTE?" questions can only be closed by reading live `pg_proc.proacl`. Those
are called out inline.

---

## Findings by severity (reachable-by-anon first)

### 1 — MEDIUM · `transition_job_status` NULL-unsafe guard leaks unassigned jobs (authenticated)
`supabase/phase68_deleted_at_authorization.sql:211` (guard) + `:221-223`
(idempotent echo). The owner guard is
`if not found or v_user is null or v_job.assigned_worker_id <> v_user then raise`.
When `assigned_worker_id IS NULL`, `assigned_worker_id <> v_user` evaluates to
NULL, the whole disjunction is NULL (not TRUE), and the raise does not fire. Any
authenticated caller who guesses a job's current status reaches the same-status
idempotent branch and receives the **full `public.jobs` row as SECURITY DEFINER**
— title, description, budget_cents, photos — for any unassigned / draft /
direct-offer job of a stranger, bypassing the four narrow `jobs` SELECT policies.
A mismatched status guess returns "Invalid job status transition" vs "Job not
found", giving a status/existence oracle. It **cannot force an illegal
transition** (the allow-list only permits `assigned→in_progress` and
`in_progress→completed`, which imply a non-null worker), so the impact is
read-only. Bounded by whether the data invariant "status ∈ {assigned,in_progress}
⇒ assigned_worker_id NOT NULL" holds in live rows — NOT DETERMINABLE STATICALLY.
Present since `phase58_hardening_fixes.sql:138`, inherited verbatim by phase68.

### 2 — MEDIUM / NOT DETERMINABLE STATICALLY · residual explicit `anon` EXECUTE on ~11 pre-phase32 functions
Grant/revoke statements for these functions revoke from `public` but **never name
`anon`**: `accept_legal_documents` (`phase21:120`), `admin_open_reports`
(`phase13:412`), `ban_user` (`phase13:349`), `unban_user` (`phase13:370`),
`register_push_token` (`phase20:134`), `worker_job_stats` (`phase17:161`),
`deactivate_push_token` (`phase20:846`), `resolve_notification` (`phase20:832`),
`current_user_is_admin` (`phase29:76`), `current_user_is_banned` (`phase29:135`),
`get_my_profile` (`phase29:119`). `phase32_function_execute_privileges.sql:9-20`
records that Supabase's project defaults granted `anon` an EXPLICIT EXECUTE at
CREATE time that `revoke … from public` does not remove; phase32 repaired only 5
functions and phase69 only the 16 NULL-`proacl` ones — this set was never swept.
Whether `anon` still holds EXECUTE is settleable **only by reading live
`pg_proc.proacl`**. Impact if drifted: `worker_job_stats` leaks per-worker
aggregates to anon; `deactivate_push_token` / `resolve_notification` become
anon-writable (a token string / outbox uuid is required); the rest fail closed on
NULL `auth.uid()`. Missing proof: a live catalog check (e.g. the sentinel/
`verify-schema` probes cited in phase69).

### 3 — MEDIUM (local) · Supabase session/refresh tokens in unencrypted AsyncStorage
`lib/supabase.ts:13-21` (and `lib/supabase.web.ts:23-30`) pass `storage:
AsyncStorage` to `createClient`, not `expo-secure-store`/SecureStore. Access and
refresh tokens sit in plaintext; a device-level attacker (jailbreak, unencrypted
backup) can lift a live session. Not remotely reachable; no Keychain/Keystore
adapter is configured.

### 4 — MEDIUM · `delete_my_account` TOCTOU can strand a job on a tombstone (authenticated)
`supabase/phase67_account_deletion.sql:353` (blocker gate) takes no locks and is
never re-checked before the tombstone commits at `:596-604`. A concurrent
`accept_offer` that wins the `jobs` row lock (customer side — defeats the
open-job cancel at `:409-412` via EvalPlanQual) or that commits between the gate
and the withdraw sweep (worker side — the refusal is deliberately swallowed at
`:448-457`) commits an `assigned` job whose party is a tombstone with no
`auth.users` row. The job is then permanently stuck: `transition_job_status`
refuses a tombstoned worker (`phase68:214`) and a tombstoned customer can never
authorize/release payment. A concurrent *second delete* is safe (the
`auth.users` row-count assertion rolls the loser back). phase67's comments record
the pending-offer orphan follow-up (`:383-389`) but not this assignment race.
Narrow window; real stuck-state.

### 5 — LOW / MEDIUM · `jobs_within_radius` trilateration erodes the approximate-location invariant (authenticated)
`supabase/phase43_job_offers_foundation.sql:452-494` returns `distance_miles` at
full double precision from an arbitrary caller-supplied probe point, with an
unbounded `p_radius_miles`. Three queries recover the exact stored
`job_locations` coordinates of any open-market job — contradicting both the
function's own comment (`:496-497`, "Never returns raw stored coordinates") and
the CLAUDE.md invariant that open-market surfaces show approximate location only.
Sibling `jobs_in_cell` / `job_hotspots` are correctly quantized (~0.27 mi cells);
this one is not. Mitigation would round or cell-snap `distance_miles`.
authenticated-only.

### 6 — LOW (sandbox now, pattern risk) · money amounts have no upper bound
`create_offer` rejects only `null`/`<=0` (`phase50:705-707` /
`phase61:240-242`); `counter_offer` likewise (`phase63:93-95`) and writes
`p_amount_cents` straight into `jobs.budget_cents` on the direct branch
(`phase63:160-162`); `create_job` / `update_job_details` budgets likewise
(`phase49:149-158`, `:317-326`). Up to `int4` max (~$21.4M) is accepted and flows
via `accept_offer` (`phase50:525`) into `payments.amount_cents`
(`sandbox_authorize_job_payment` checks only `>0`, `phase58:106`; the table CHECK
is only `amount_cents>0`, `phase50:118`). Reachable through the shims
`create_bid` / `create_job_request` / `respond_job_request('counter')`. Only
`sandbox_tip_worker` has a ceiling ($1,000, `phase51:672`). Sandbox money today,
but the missing ceiling will carry into a real provider.

### 7 — LOW · `register_push_token` last-writer-wins token reassignment (authenticated, conditional)
`supabase/phase20_push_notifications.sql:124-130`:
`on conflict (token) do update set user_id = excluded.user_id`. Any authenticated
caller who learns another user's Expo push-token string can re-bind it to their
own account — silencing the victim's device and redirecting the victim's future
pushes into the attacker's account context. Gated by token secrecy (`push_tokens`
is owner-only RLS; the token is deliberately not on `profiles`), so exploitability
is low, but there is no proof-of-possession check. This is the legitimate
device-handoff mechanism with no separate re-bind guard.

### 8 — LOW / deferred · `avatars` and `job-photos` remain public buckets
`phase72_storage_read_lockdown.sql` moved the READ policies for both buckets from
`public` to `authenticated`, closing anon *enumeration* (`.list`). But both
buckets stay `public=true`, so Supabase's public object path bypasses RLS: an
unauthenticated holder of a *known* object URL still fetches it, and paths embed
user-ids (avatars) / job-ids (job-photos). Documented as deferred in the phase72
header (full closure needs private buckets + signed URLs everywhere). No app
break; low real-world exposure now that URLs are not enumerable. Chat buckets
(`chat-photos`, `chat-audio`) are correctly private and job-party-scoped
(`phase29:749-824`) — no private-bucket-wide-read gap.

### 9 — LOW · `unsend_message` has no active-user gate
`supabase/phase70_unsend_message_authz.sql:51-89` guards null-uid and ownership
and the 15-minute window, but omits the `is_active_user()` / `is_profile_active()`
check every sibling write RPC carries — a banned account with a live JWT can still
blank its own <15-min-old messages. Exit-only, self-scoped; low impact but an
undocumented asymmetry.

### 10 — LOW · user-writable `phone` feeds the ban system with length-only validation
`update_my_profile` (`phase53:183-187`) validates `phone` for length only, yet
`ban_user` snapshots `profiles.phone` into `banned_phones` at ban time
(`phase13:308-313`) and `handle_new_user` refuses signup on a matching phone
(`phase13:427-431`). By static reasoning: (a) a user anticipating a ban can swap
in a junk phone so the ban fails to follow their real number; (b) a user can set
their phone to a victim's number, and if later banned, poison that number's
eligibility to register. Whether a live uniqueness / verified-phone constraint
mitigates (b) is NOT DETERMINABLE STATICALLY (the `profiles` base table predates
the numbered migrations).

### 11 — INFO · `decline_offer` / `withdraw_offer` omit the active-user gate
`phase50:636` / `phase50:380` raise on null uid but do not call `is_active_user()`,
unlike accept/counter/create. A banned user can still decline/withdraw
(exit-only). Plausibly deliberate; undocumented.

### 12 — INFO · `ban_user` moves job status by direct UPDATE
`phase13:322` sets `jobs.status='cancelled'` outside `transition_job_status()`
(the single sanctioned status mover), and inserts a system message attributed to
the banned user (`:334-339`). Admin-only and predates the RPC, but it violates
the single-mover principle and skips transition validation.

### 13 — INFO / not exploitable · `job_request_parties_ok` lost its `pg_temp` search_path pin
`phase68_deleted_at_authorization.sql:102` recreates the function with
`set search_path = public` (no `pg_temp`), silently reverting `phase64:72`'s pin.
Not exploitable as written (the body calls only schema-qualified functions, and
functions are never resolved from `pg_temp`), but it is exactly the regression
class phase64 swept, and it is now the one SECURITY DEFINER function whose pin is
short a schema.

### 14 — INFO · unguarded read RPCs (public by design)
`client_job_stats` (`phase58:43`), `worker_job_stats` (`phase17:143`),
`job_offer_count` (`phase46:830`), `profile_reviews` / `profile_review_summary`
(`phase37:169/219`) have no `auth.uid()` ownership check — any authenticated
caller gets aggregates/reviews for any id. All are documented trust-signal
surfaces returning bounded, non-sensitive data (counts, public reputation); the
reviews readers are the sanctioned path phase71 left in place after dropping the
world-readable policy. Recorded, not flagged. `is_profile_active(uuid)`
(`phase67:177`, granted authenticated) is a minor active-vs-banned oracle for any
uuid; profile rows are broadly readable anyway.

### 15 — INFO / cosmetic
- `create_review` (`phase37:99`) has no `unique_violation` handler — a double-tap
  surfaces a raw 23505 instead of the sibling RPCs' idempotent return.
  Duplication is still prevented by `reviews_job_reviewer_uniq` (`phase6:24-25`).
- `mark_worker_arrival` (`phase51:238-240`) raises on a replay that lands after
  the job left `assigned`, rather than returning the row — the one active-work RPC
  without the idempotent-retry branch. No state damage.
- `current_user_is_banned` (`phase29:129-132`) coalesces a missing profile to
  `false` ("not banned") — a fail-open shape, but no function body calls it
  (`phase68:65`); its only caller is the client sign-out at `lib/profiles.ts`.
  Latent.
- Notification pipeline is at-least-once (`claim_notification_batch`
  `phase20:758`, `FOR UPDATE SKIP LOCKED`): concurrent double-claims are
  impossible, but a claim whose `resolve_notification` never lands is re-sent
  until `attempts=5`. Bounded, service_role-only, standard outbox behavior.

---

## Named questions

### Q-ROLE — privilege escalation via `profiles`. **No escalation chain exists.**
The columns any effective policy or SECURITY DEFINER body trusts for
authorization are `is_admin`, `banned`, and `deleted_at`. None is writable by a
normal authenticated user in the trusted direction:
- **`update_my_profile`** (final `phase53:148-262`) key-allowlists exactly
  `full_name, phone, avatar_url, bio, language, categories, accepting_work,
  availability_note` (`:170-176`) and raises on any other key; its SET list
  (`:219-254`) touches only those eight columns. `role`, `is_admin`, `banned`,
  `deleted_at`, `verification_status`, `active_mode`, `rating_*` are excluded.
- **Direct DML on `profiles` is impossible**: phase29 dropped the phase7
  update/insert policies (`phase29:84-85`) and revoked all table privileges
  (`:87-89`), regranting only column-level SELECT on a public-safe list
  (`is_admin`/`banned`/`phone`/`deleted_at`/`active_mode` excluded). No later
  phase recreates any write policy or privilege on `profiles`.
- **`is_admin`** has no user-reachable write path (the only writer,
  `delete_my_account`, sets it *false*). **`banned`** is written only inside
  `ban_user`/`unban_user`, both gated on the caller's own `is_admin`
  (`phase13:300-304`, `:359-363`) — circular only through a column the user
  cannot write. **`deleted_at`** is written only by self-scoped
  `delete_my_account`, and only ever set, never cleared (self-lockout, not
  escalation).
- **`role` is vestigial**: written once at signup by `handle_new_user`, hardcoded
  `'both'` (`phase13:433-439`), read by zero policies, zero function bodies, zero
  views. Client-side it is a typed field only; nothing branches on it. It is dead
  weight plus one extra byte of public read surface.
- Client check: `ProfileUpdate` (`lib/profiles.ts:35-44`) carries only the eight
  allowlisted keys; a hand-crafted `{"is_admin":true}` is rejected by the
  allowlist and, at the table, by the privilege revoke.

Secondary items feed the general findings: the `phone`→ban-system path (#10) and
`admin_open_reports` being granted to all `authenticated` with only an in-body
`is_admin` check (safe today because the gate is inside the body and `is_admin`
is unwritable — the pattern phase69 tightened elsewhere but left here). Caveat:
whether live staging matches this file stack is NOT DETERMINABLE STATICALLY — only
a green `verify-schema.mjs` / the `phase29_security_contract.sql` assertions prove
it.

### Q-PUSH — can an arbitrary internet caller drive `send-push`? **No, via an in-repo fail-closed guard; the platform half is unproven.**
`supabase/functions/send-push/index.ts:218-224` does an exact-string compare
`if (auth !== "Bearer " + SERVICE_KEY) → 403`, where `SERVICE_KEY =
Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`. It is fail-closed: any caller lacking
the exact key gets 403. The observed staging behavior (accepts the `sb_secret_`
key, rejects the legacy `service_role` JWT) is explained entirely by this line —
the deployed env holds the `sb_secret_` value, so only that exact bearer matches —
and implies platform `verify_jwt` is effectively OFF (a non-JWT `sb_secret_`
bearer could not otherwise reach the code). **FINDING (stated as such): the
platform half of authorization is decided by platform config with no proof in
the repo** — there is no `config.toml`, `deno.json`, function-level config, or
deploy script pinning `verify_jwt`; the only CI workflow does no deploy. The
in-repo guard is verifiable and holds; the gateway setting is NOT DETERMINABLE
STATICALLY. No amplification/redirect/drain path for an unauthenticated caller:
`claim_notification_batch` / `resolve_notification` / `deactivate_push_token` are
service_role-only (`phase20:808-810,832-834,846-848`); the batch is capped at 100
with `FOR UPDATE SKIP LOCKED`; recipient, tokens, and content are all
server-derived from the claimed row — no request field can redirect them. Repeated
calls are bounded by `attempts<5` and rows flipping to `sent`. One live invocation
draining 94 claims is the batch cap × passes working as designed.

### Q-IDOR — **no true IDOR.** Every id-taking RPC verifies ownership/participation
on the effective body before returning or mutating (full table in the transcript;
accept/counter/decline/withdraw by offer party + turn; sandbox_* by job owner/payer;
`transition_job_status` by assignee; `job_payment_state` by party; `create_review`
by party-of-completed-job; `mark_direct_thread_read` by participant in the UPDATE
WHERE). The unguarded reads are the public-by-design trust signals in finding #14.
`jobs_within_radius` is the one read that leaks more than intended (finding #5).

### Q-RLS — effective per-table state holds.
`job_offers` is **RPC-write-only** (no INSERT/UPDATE/DELETE policy; privileges
revoked, `phase43`/`phase46`). `job_locations` is readable by **owner + assigned
worker only** (`job_locations_select_party`, writes RPC-only). `jobs` has no
UPDATE path at all, so an owner cannot set `status`/`assigned_worker_id` directly;
the legacy permissive "viewable by authenticated" read was **dropped in phase58**,
leaving four narrow SELECT policies. `payments`, `job_disputes` are SELECT-only +
RPC-write. Every UPDATE policy that exists constrains WITH CHECK and none permits
owner-repointing. Both client-exposed views (`conversations`,
`v_bids_projection_drift`) are `security_invoker=true` — no definer-view-over-RLS
bypass. `reviews`' world-readable SELECT was **dropped in phase71** (anon keeps a
table grant but has zero applicable policy → zero rows). Caveats: **F5 — the
`payments` "parties view own payments" SELECT policy is pre-repo** and created by
no migration; its exact predicate and NULL-safety are NOT DETERMINABLE
STATICALLY — recommend capturing it into a migration. **F7 — several tables
(`messages`, `message_reactions`, `message_reads`, `direct_threads`,
`notification_prefs`, `legal_acceptances`, `push_tokens`, `portfolio_items`,
`job_requests`, `blocks`, `mutes`, `reports`) rely on RLS + `authenticated`-scoped
policies with no in-repo `revoke … from anon` on the table grant.** Safe in
effective state (anon has no applicable policy → zero rows), but this is the exact
fragility phase71/72 had to remediate; a future `public`/`anon` or `USING(true)`
policy would make the un-revoked grant live. Defense-in-depth: add explicit anon
revokes.

### Q-STORE — per bucket. Private buckets are correctly scoped.
`chat-photos` / `chat-audio` are `public=false` (`phase29:749-751`) with
job-party-scoped read and caller-owned-path insert (`phase29:758-824`) — no
authenticated user can read another pair's media; the app fetches via
`createSignedUrl`. `avatars` / `job-photos` are public buckets: reads moved to
`authenticated` by phase72 (enumeration closed), inserts are folder-keyed to
`auth.uid()` — but the buckets stay public so a known URL still fetches anon
(finding #8). No public bucket whose READ is broader than WRITE beyond that
accepted residual.

### Q-MSG — pre-assignment messaging lock. **LOCKED; not bypassable.**
`messages_insert_party` (final `phase66:143-185`) requires
`sender_id=auth.uid()` ∧ `is_active_user()` ∧ (job-party OR direct-thread-party,
block-checked) ∧ (`messaging_unlocked(job_id, direct_thread_id)` OR a payload-free
structured event row: `job_offer_id`/`job_request_id` set, `btrim(content)=''`,
no image, no audio). `messaging_unlocked` (final `phase66:92-126`, DEFINER,
authenticated-only) returns true only when caller + counterparty share a job with
`assigned_worker_id` set and `status in (assigned,in_progress,completed)`, and the
caller is a participant in both branches — no stranger-probing. The structured-event
exemption is payload-free by construction (the offer RPCs write `content=''`, no
media), so it cannot smuggle free-form text. `ensure_direct_thread` is revoked
from all client roles — a client cannot mint a thread to talk through; thread
existence grants read/turn visibility but not free-form insert. No effective policy
or RPC lets two users exchange free-form messages before assignment.

### Q-RACE — every money/lifecycle mutation is race-SAFE except finding #4.
Full verdict table in the transcript. `accept_offer` serializes on jobs→offer
`FOR UPDATE` with post-lock status re-checks — double-accept, two-workers-same-job,
superseded-offer, withdrawn/declined, and lapsed all refuse safely. `counter_offer`
vs `accept_offer` both take the jobs lock first; a countered offer cannot still be
accepted. `sandbox_authorize/hold/release/tip` combine row locks with the partial
UNIQUE `payments_one_active_per_job_kind (job_id, kind) WHERE status NOT IN
('failed','voided')` (`phase50:156-158`) and `unique_violation` handlers — no
double-pay, no double-tip. `sandbox_cash_out` is a single atomic conditional
UPDATE (`WHERE payee_id=uid AND status='released'`) — earnings cannot be swept
twice. `transition_job_status` is idempotent on same-state. The 10-per-side
counter cap is counted under the jobs lock and backed by partial unique indexes,
so interleaving cannot exceed it or open two counters. `claim_notification_batch`
uses `FOR UPDATE SKIP LOCKED`. The deprecated shims `accept_bid`/`respond_job_request`
delegate to the guarded RPCs and bypass nothing (still granted to authenticated,
but bypass-free by construction). **The one race defect is #4** (delete_my_account
TOCTOU). All verdicts assume READ COMMITTED (Supabase default) — an environment
fact, NOT DETERMINABLE STATICALLY from the repo; the `payments`/`reviews` unique
indexes are asserted by sentinels but only `verify-schema.mjs` proves them live.

### Q-SECRET — no secret in the tracked tree or local history.
Searched all 242 commits and the working tree with local git tooling (never
printing any value). No `sb_secret_`, no `service_role` JWT, no password-bearing
`postgres(ql)://` URI, no private key, no full-length `AIza…`/`ghp_…`/`AKIA…`/
`xoxb…` token. The only JWT present in tree or history is the staging **anon**
key in `eas.json:12` (decodes to `role: anon`, ref `zzkumxcjtbqoselzptig`) — an
expected client publishable value, not a finding. The credential-prefix strings
in `SECURITY_AUDIT.md` are that document's own detection-pattern list, not live
secrets (verified: zero full-length matches). No `.env`-equivalent is tracked
(`.env` is gitignored; only `.env.example` is committed). `eas.json` testflight/
production build blocks carry no `env`; `app.json extra` holds only
`eas.projectId`. `start.ps1` (noted to embed a live DB credential) is gitignored
and absent from the tree.

### Q-CLIENT — no UI-only authorization gap.
Every candidate control re-enforces server-side: admin view/ban/unban/dismiss
(`admin_open_reports` in-body `is_admin`, `ban_user`/`unban_user` raise,
`reports_update_admin` via `current_user_is_admin`); edit/delete job
(`update_job_details` owner+open+no-bids; `jobs_delete_own` via
`can_delete_own_job`); tip amount (`sandbox_tip_worker` caller=client, released,
$1,000 cap, one/job); counteroffer cap (server 10/side under lock); review
eligibility (`reviews_insert_completed_party` + `create_review` party checks);
open/withdraw dispute (RPC-only). **Mode (Customer/Worker) gates nothing
server-side** — every mutation enforces by identity (`client_id`/`worker_id`/
`assigned_worker_id`/`awaiting_id`), never `active_mode`, so switching mode grants
no server capability. Assignment/lifecycle are DB-only (client reaches only
`transition_job_status` and `accept_offer`; direct INSERT/UPDATE on
jobs/bids/reviews/job_locations all revoked).

### Q-MOBILE — committed client config.
(1) Session/refresh tokens: **unencrypted AsyncStorage** (finding #3). (2) No
non-publishable secret reachable from the JS bundle — `eas.json` dev env carries
only the staging URL + anon key; no `service_role`/`sb_secret_` in any committed
config or `lib/`. (3) Deep links: scheme `brazos` (`app.json:12`), **no React
Navigation `linking`/`prefixes` config** in the repo — push taps route through
`lib/notificationRoutes.ts` using `jobId`/`directThreadId` only to navigate +
fetch-by-id (RLS re-checked); no route where possession = authorization. (4)
Notification payloads are read-only routing — never written or asserted as state.
(5) Dev bypasses are **fail-closed in release**: `resolvePhoneAuthMode` returns
`disabled` whenever `!__DEV__` (mock impossible in a release binary), payments
resolve `disabled`, and dev-tools/debug rows are `__DEV__`-gated. (6) No cleartext
HTTP endpoint the app calls (Expo push is HTTPS; a stored `http://` media URL is a
legacy passthrough, not a fixed endpoint); `Math.random` is used only for the
dev-only mock OTP and for filename uniqueness — never for a security-relevant
token/nonce. `app.json` has **no `NSAllowsArbitraryLoads` / ATS exception**;
permission strings match declared features.

### Q-DEPS — `npm audit --omit=dev` (registry reachable, read-only).
**0 critical / 14 high / 13 moderate / 0 low (27 total).** Every advisory is in
the Expo / Metro / React Native build-and-tooling subtree — no runtime-data-path
package. High: `brace-expansion` (ReDoS/OOM), `image-size` (ICNS/JXL/HEIF infinite
loops), `js-yaml` (quadratic `!!omap`), `nanoid` (size-zero loop), `postcss`
(sourceMappingURL path traversal / XSS in stringify), plus the `@expo/*`, `metro*`,
`react-native`, `expo` roll-ups that depend on them. Moderate: `uuid` (buffer
bounds), `xcode`, and the `expo-*` roll-ups (`expo-notifications`, `expo-updates`,
`expo-dev-client`, `expo-linking`, `expo-constants`, `expo-asset`). Most are
build/CLI-time DoS classes, not remotely reachable in the shipped app; none is a
credential or RCE advisory. `audit fix` was NOT run and the lockfile was NOT
modified (out of scope for this doc-only run) — resolution is a dependency-bump
decision for a later, code-touching pass.

---

## Cross-cutting NOT DETERMINABLE STATICALLY (the live pass must settle these)

- Whether staging's live `pg_proc.proacl` matches the file stack — specifically
  the finding #2 anon-EXECUTE set, and any other explicit-grant-over-unrevoked-
  PUBLIC residual beyond the `unsend_message` case phase70 already found and fixed
  live on 2026-08-15. `create or replace` preserves ACLs, so files alone cannot
  prove this.
- The `payments` SELECT policy predicate (F5) and any other pre-repo policy not
  re-created in a migration.
- The `jobs.client_id` / `assigned_worker_id` and `payments.payer_id`/`payee_id`
  NOT NULL constraints that bound findings #1 and #4 to read-only / narrow-window.
- Transaction isolation level (all Q-RACE verdicts assume READ COMMITTED).
- The live `saved_workers` table ACL that decides whether the `saveWorker` upsert
  hard-fails (see the Completion Review).
- Deployment/config state of `send-push` (`verify_jwt`, finding Q-PUSH) and the
  `worker-search` Edge Function.
