# 05 — Data and State Model Plan

Full raw inventory (every table/column/RPC/grant/policy with phase citations)
was gathered by a dedicated research pass and is summarized here at planning
altitude. For the complete reference — every RPC's grant history, every
storage policy, every trigger — treat this document's tables below as the
authoritative summary; do not re-derive it from the SQL files without reason.

## Current schema shape (confirmed across all 40 `supabase/phase*.sql` files)

**Baseline gap, confirmed:** `profiles`, `jobs`, `bids`, `reviews` and the
enums `job_status`, `bid_status`, `verification_status`, `job_category`
(original values) have no `CREATE TABLE`/`CREATE TYPE` anywhere in the
repository — they predate the tracked migration history entirely. This was
already flagged in the 2026-07-29 audit as a release blocker (no reproducible
blank-database baseline) and remains true today; not re-litigated further
here beyond confirming it still holds.

**Tables that do exist in tracked SQL, by phase:**

| Table | Phase created | Since altered |
|---|---|---|
| `messages` | 8 | 16, 18, 25, 36 |
| `message_reads` | 9 | — |
| `message_reactions` | 10 | — |
| `job_locations` | 12 | 29 (grant narrowing only) |
| `banned_phones` | 13 | — |
| `blocks` | 13 | — |
| `mutes` | 13 | — |
| `reports` | 13 | — |
| `portfolio_items` | 17 | 19 |
| `job_requests` | 18 | 33, 36 |
| `push_tokens` | 20 | — |
| `notification_prefs` | 20 | — |
| `notification_outbox` | 20 | — |
| `legal_acceptances` | 21 | — |
| `direct_threads` | 36 | — |
| `worker_semantic_docs` | 39 | — |

`jobs` gained `photos`(13), `completion_photos`(17), `videos`(34),
`completion_videos`(35) as `jsonb` columns, each capped and CHECK-validated.
`reviews` gained `photos`(37). `profiles` gained `is_admin`/`banned`(13);
`bio`/`language`/`categories`(7); column-level grants only, no new columns,
at phase29.

**Money is integer cents throughout** (`budget_cents`, `final_amount_cents`,
`amount_cents` on bids/job_requests) — the CLAUDE.md invariant is upheld
everywhere this pass looked; no dollar-float column was found.

**RLS is on for every table that exists in tracked SQL.** phase29 was a
genuine hardening pass: direct client INSERT/UPDATE/DELETE was revoked on
`profiles`/`jobs`/`bids`/`reviews`/`job_locations`, replaced with 7 validated
`SECURITY DEFINER` RPCs (`create_job`, `update_job_details`,
`transition_job_status`, `create_bid`, `accept_bid`, `create_review`,
`update_my_profile`). `worker_semantic_docs` and `notification_outbox` have
RLS on with **zero** policies — reachable only through SECURITY DEFINER
functions, which is the correct pattern for data that must never be directly
queryable.

**phase32 revoked the default `anon`-EXECUTE grant Supabase adds
automatically to new functions.** Every RPC added from phase32 onward re-
grants explicitly; a small number of pre-phase32 functions
(`is_blocked_between`, `job_request_parties_ok`, `should_notify`) have no
explicit grant statement in their own file and rely on whatever was in effect
when they were created — worth a live check (`node scripts/verify-schema.mjs`
does not currently probe this) before treating them as guaranteed-reachable.

**Storage:** `job-photos`/`avatars` are public buckets with owner-path-scoped
write policies; `chat-photos`/`chat-audio` were flipped from public to
private in phase29 and scoped to job-party membership. All four match the
"never weaken RLS to make a feature work, add a narrow SECURITY DEFINER
function instead" rule already in CLAUDE.md — this codebase already follows
that rule; preserve the pattern.

**Realtime publication membership:** `jobs`, `bids`, `messages`,
`message_reactions`, `job_requests`, `direct_threads`. `job_locations` is
**deliberately excluded** — Realtime's Postgres Changes bypasses column
grants and broadcasts full rows, so keeping exact coordinates off the
publication is structural privacy, not an oversight. **Any future table
holding precise location data (e.g. live worker tracking, atlas Screen 33/56)
must repeat this exclusion.**

## Verification gaps (explicitly not closed by this audit)

- `scripts/verify-schema.mjs` only checks phases **15 through 39** — phases
  1–14 and phase 40 have no live-existence check at all. phase40 was a
  runtime-only bugfix (`verification_status` enum-vs-text cast) that the
  script's `limit=0` dry-check methodology cannot catch by construction; if a
  future defect of the same shape lands, it will have the same blind spot
  unless the script gains actual function-execution checks.
- `supabase/tests/phase29_security_contract.sql` is the only file in
  `supabase/tests/` and is **stale** — it still asserts the 4-argument
  `create_review` signature phase37 replaced with a 5-argument one. Update it
  before next running it, or it will fail on an unrelated, already-resolved
  line.
- Live deployment status of phase29 through phase40 against the connected
  Supabase project was **not re-verified this pass** — this audit did not run
  `node scripts/verify-schema.mjs` (needs `.env` + network, outside this
  read-only pass's constraints). `docs/CURRENT_IMPLEMENTATION_HANDOFF.md`
  records phase15–38 as previously confirmed deployed and phase39 as
  deployed-with-iteration (v2/v3 Edge Function fixes); phase40's deployment
  status is UNKNOWN — requires runtime verification before relying on it.

## Mapping current schema to atlas concepts

| Atlas concept | Current schema support | Gap |
|---|---|---|
| One identity, two modes | `profiles` has no mode/role-preference column; the marketplace invariant ("no role field, same account posts and works") is already correctly unenforced at the schema level — there is genuinely nothing to change here structurally | The *preference* of which mode to land in has no durable home (see below) |
| Customer profile / worker profile details | Single `profiles` row serves both; `categories`, `bio` etc. are worker-facing fields with no customer-specific fields — matches the atlas's shared-identity model | None required unless customer-specific fields (e.g. saved payment methods) are added later |
| Mode preference (Setup screen) | **Not in Supabase at all** — `lib/setupState.ts` stores `{completed, landing}` in `AsyncStorage`, explicitly because "profiles has no onboarding column ... persisting server-side would mean a schema migration ... out of scope" (direct quote from the file's own header comment) | A `profiles.initial_mode` or `profiles.mode_preference` column, added via a new idempotent `supabase/phase41_*.sql`, is the natural fix once the dual-mode nav (Phase 2/3) actually needs a durable answer — do not add it speculatively before then |
| Services / service pricing / travel area | `profiles.categories` (text[]) is a coarse existing analog; no dedicated services/pricing table exists | New table(s) needed for atlas Screens 64 (Services & pricing) — deferrable to Phase 5 |
| Availability | Not modeled anywhere found | New table needed for Screens 50/66 — deferrable |
| Verification status | `profiles.verification_status` enum column exists and is displayed (`VerificationBadge`); **no verification workflow or provider** backs it — still UI-only, confirmed unchanged from the 2026-07-29 audit | See [06_DEFERRED_INTEGRATIONS.md](06_DEFERRED_INTEGRATIONS.md) |
| Job drafts | `PostJobScreen` holds draft state in memory/local component state only; no `jobs.status='draft'` row is created until publish, confirmed from `createJob()`'s call site | Matches the atlas's "drafts save automatically during posting" recovery rule only partially — a killed app loses an in-progress draft. Deferrable; not a blocker for any near-term phase |
| Published jobs, locations, scheduling, media | Fully modeled (`jobs`, `job_locations`, `photos`/`videos`/`completion_photos`/`completion_videos`) | Scheduling (a specific date/arrival-window field) was not confirmed present this pass — UNKNOWN, check `jobs` columns for a schedule field before Phase 3 posting-flow work |
| Bids, bid acceptance | Fully modeled and RPC-hardened | None |
| Counteroffers | Modeled via `job_requests.client_counters`/`worker_counters` (capped at 3/side) — this is the "Hire Again" negotiation path, not the open-job bid-counter path; confirm whether the atlas's Screen 30 (Counteroffer on an open-job bid) needs the same mechanism or a new one — **UNKNOWN, worth a design decision before Phase 4** |
| Job lifecycle events / checklist | `transition_job_status` enforces `assigned → in_progress → completed`; no discrete "checklist" sub-table exists (atlas Screen 57's shared checklist) — this is genuinely new work | Deferrable to Phase 4 |
| Completion evidence | Fully modeled (photos + one video, capped) | None |
| Reviews, tips | Reviews fully modeled with photos; **tips are not modeled anywhere** — new work | Deferrable to Phase 4 |
| Messages, message media | Fully modeled, including the new phase36 direct-thread system | None |
| Notifications | Fully modeled (outbox, prefs, 8 trigger-driven generators); delivery confirmation UNKNOWN | See [06](06_DEFERRED_INTEGRATIONS.md) |
| Saved workers | Not confirmed present this pass — UNKNOWN, grep `lib/*.ts` for a "saved"/"favorite" concept before assuming it needs to be built from zero | Check before Phase 5 |
| Portfolios, project stories | `portfolio_items` fully modeled; a "project story" (atlas Screen 24 — one portfolio item turned into a full scope/time/price/review narrative) is not a distinct schema concept today, it would compose `portfolio_items` + the completed job's `reviews`/`profile_reviews` RPC | Likely no new table needed, just a UI composition — confirm during Phase 5 design |
| Payment-intent placeholders, payment lifecycle, earnings, payouts | **Nothing modeled** — confirmed unchanged from the 2026-07-29 audit | See [06](06_DEFERRED_INTEGRATIONS.md); this is the single largest schema gap versus the atlas |
| Disputes, support requests | `reports` table exists (moderation-focused: no-show/unsafe/harassment/scam/other) — could be the seed of a dispute-reporting flow but is not currently connected to the payment/job-completion "report an issue" path the atlas describes (atlas Screen 36) | Needs a product decision on whether `reports` is extended or a parallel `job_disputes` concept is added — flag to user, don't guess |

## State machines (proposed, not implemented)

### Authentication/onboarding

```
signed_out
  → email_authenticated  (phone auth stays mock-only until Phase 8)
     → setup_incomplete  (useSetupStatus === 'incomplete')
        → legal_pending  (pushed LegalGate, if not yet accepted)
        → setup_complete (writeSetupRecord succeeds; mode/landing recorded)
     → legal_stale        (existing user, useLegalGate === 'needs_acceptance',
                            reached WITHOUT going through Setup again)
  → fully_onboarded       (MainTabs renders)
```
Matches current code exactly (`App.tsx::RootNavigator`'s branching). The only
proposed addition is a durable `mode` value living somewhere in
`fully_onboarded`, once Phase 2/3 needs one — not a new state, an added field.

### Job lifecycle

Current: `open → assigned → in_progress → completed` (plus `cancelled`,
confirmed via `jobs.status` usage), enforced only by `transition_job_status`.
Atlas asks for a richer set (draft, receiving bids, matched, confirmed,
worker en route, arrived, completion submitted, awaiting approval, disputed,
refunded). **Recommend layering, not replacing:** keep the 5 current values
as the authoritative `jobs.status` enum (changing it is a breaking,
hard-to-reverse enum migration touching every RPC that reads it), and model
the richer atlas states as either (a) client-derived presentation states
computed from `jobs.status` + `job_locations` presence + completion-evidence
presence + payment state (once it exists), or (b) a separate
`job_lifecycle_events` audit table if the atlas's "every state change must be
auditable" build note is taken literally. Do not decide this without the
user — it is a real architecture fork, not a detail.

### Bid lifecycle

Current: `pending`/`accepted`/`rejected` (bids), or
`pending`/`countered`/`accepted`/`declined` (job_requests, which is really a
parallel offer/negotiation lifecycle, not the same table). Atlas's fuller set
(draft, submitted, viewed, countered, withdrawn, expired) is partially
achievable today (submitted=pending, accepted, declined=rejected) and
partially not (no "viewed" tracking, no bid withdrawal path, no expiry
found in `bids`). Flag "viewed" specifically — it implies a read-receipt-like
column and event, not present today.

### Payment lifecycle

Entirely unbuilt. Proposed states (not implemented) exactly as the atlas
specifies: not_started → authorization_pending → authorized → held →
release_pending → released → refund_pending → refunded, with disputed/failed
as branches. This cannot be scoped further without the payment-provider
decision in [06_DEFERRED_INTEGRATIONS.md](06_DEFERRED_INTEGRATIONS.md).

### Worker arrival

Entirely unbuilt (no `job_locations`-adjacent "arrival state" column found).
Proposed: not_started → preparing → en_route → nearby → arrived, with
delayed/unable_to_arrive as branches — see
[06_DEFERRED_INTEGRATIONS.md](06_DEFERRED_INTEGRATIONS.md)'s
`LocationTrackingProvider` entry; recommend simulating this state machine in
UI before any real background-location work.

## Privacy requirements already correctly enforced (preserve exactly)

- Exact job location lives only in `job_locations`, never in `jobs`, never in
  the Realtime publication.
- `profiles.phone`/`is_admin`/`banned` are not directly SELECT-able by anyone
  but the row owner (via `get_my_profile()`) or SECURITY DEFINER helpers.
- Chat media is private and job-party-scoped since phase29.
- A completed job's title is deliberately never returned by the reviews RPCs
  — only its category — because (per the phase37 author's own reasoning,
  preserved in `docs/CURRENT_IMPLEMENTATION_HANDOFF.md`) a job title is "the
  client's own words about their own home."
- `worker_semantic_docs` is entirely outside the PostgREST surface — the only
  function that ever returns its `source_text` is grants-restricted to
  `service_role`.

Any new schema work under this plan must hold this bar, not lower it —
CLAUDE.md's "never weaken RLS to make a feature work" rule and this file's
own evidence say the same thing from two directions.

## Migration sequencing recommendation

- Next new migration, if any is authorized: `supabase/phase41_*.sql`.
- Idempotent, hand-written, handed to the user to run — never executed by an
  agent against production, per both CLAUDE.md and this audit's constraints.
- If a `profiles.mode_preference` (or similar) column is ever added, it must
  ship with an explicit `grant execute ... to authenticated` on any new RPC
  that reads/writes it (phase32 lesson) and must not weaken any existing
  `profiles` grant.
- Before writing phase41, first regenerate
  `supabase/tests/phase29_security_contract.sql`'s stale `create_review`
  assertion — cheap, unblocks trustworthy re-verification of everything else
  in the same pass.
