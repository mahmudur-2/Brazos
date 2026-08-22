# Database and Data Model

## Overview

**PARTIALLY VERIFIED**

Brazos uses a remote Supabase PostgreSQL database as its primary backend. Client code calls tables, views, and RPCs directly through `lib/supabase.ts`. The repository contains sequential `supabase/phase*.sql` files rather than a reproducible Supabase migration history.

The supplied `scripts/verify-schema.mjs` passed against the connected project for its targeted phase 15–25 checks. That verifier is not a complete schema diff, policy audit, or blank-database migration test.

## Critical reproducibility gap

**BROKEN**

The checked-in SQL assumes the following core objects already exist but does not define their original `CREATE TABLE` statements:

- `public.profiles`
- `public.jobs`
- `public.bids`
- `public.reviews`
- associated original enums/types and baseline policies

For example, `supabase/phase1_rls_and_realtime.sql` operates on `jobs` and `bids`, while later phases alter `profiles`, `reviews`, and `jobs`. A senior engineer cannot create an equivalent environment from this repository alone.

## Core entities

### Assumed baseline entities

| Entity | Key relationships/usage | Evidence | Status |
|---|---|---|---|
| `profiles` | keyed to Supabase auth user; profile, phone, admin/verification/language fields | `lib/profiles.ts`, `hooks/useAuth.tsx`, later ALTER scripts | PARTIAL / baseline missing |
| `jobs` | `client_id`, accepted worker/bid, status, category, content, public approximate place | `lib/jobs.ts`, many screens and phases | PARTIAL / baseline missing |
| `bids` | job-worker offers, amount, pitch, status | `lib/bids.ts`, `components/BidCard.tsx` | PARTIAL / baseline missing |
| `reviews` | completed-job party feedback | `lib/reviews.ts`, `supabase/phase5_reviews.sql` | PARTIAL / baseline missing |

### Repository-created entities and views

| Entity | Purpose | Important source |
|---|---|---|
| `messages` | job-party text/photo/audio/reply messages and unsent metadata | `lib/messages.ts`, `supabase/phase10_chat.sql`, phases 15/16/25 |
| `message_reads` | per-user conversation read state | `lib/conversations.ts`, chat SQL phases |
| `conversations` view | inbox aggregation | `lib/conversations.ts`, later chat migrations |
| `message_reactions` | emoji reactions by user/message | `lib/reactions.ts`, `supabase/phase14_reactions.sql` |
| `job_locations` | exact coordinates separated from public job row | `lib/jobs.ts`, `supabase/phase7_location_privacy.sql` |
| `banned_phones` | phone-based re-registration block | `lib/moderation.ts`, `supabase/phase4_moderation.sql` |
| `blocks` | user-to-user blocking | `lib/moderation.ts`, moderation SQL |
| `mutes` | notification/conversation muting | `lib/moderation.ts`, moderation SQL |
| `reports` | user/job/message reports | `lib/moderation.ts`, `AdminReportsScreen.tsx` |
| `portfolio_items` | worker work samples and metadata | `lib/portfolio.ts`, phases 17/19 |
| `job_requests` | repeat-work request/counter/accept workflow | `lib/jobRequests.ts`, phases 18/23 |
| `push_tokens` | Expo device-token registry | `lib/pushNotifications.ts`, `supabase/phase20_push_notifications.sql` |
| `notification_prefs` | per-user push category settings | `lib/notificationPrefs.ts`, phase 20 |
| `notification_outbox` | database-triggered delivery queue | Edge Function and phase 20 |
| `legal_acceptances` | append-only document version acceptance | `lib/legal.ts`, `supabase/phase21_legal.sql` |

## RPCs and computed views

**VERIFIED in SQL and targeted live checks**

- Discovery: `job_hotspots`, `jobs_in_cell`.
- Authorization/moderation: `is_active_user`, `is_blocked_between`, `ban_user`, `unban_user`, `admin_open_reports`.
- Auth/profile: `handle_new_user`.
- Jobs/bids/stats: `job_bid_count`, `worker_job_stats`.
- Repeat work: create/respond/counter/pending job-request functions.
- Legal: current acceptance/status functions.
- Messaging: `unsend_message` plus conversation/read helpers.
- Push: outbox enqueue, claim, success/failure, preference helpers, and database notification triggers.

The live verifier confirmed expected later-phase columns, relations, markers, views, and RPC calls. It did not confirm every row-level security policy, every storage policy, data correctness, scheduled jobs, or Edge Function deployment.

## Realtime

**PARTIALLY VERIFIED**

SQL publications and client hooks cover jobs, bids, messages, reactions, and job requests. `supabase/phase28_publication_repair.sql` suggests publication membership required repair. Realtime client subscriptions are present, but cross-client delivery and cleanup under reconnection were not load-tested.

## Storage model

**VERIFIED in SQL**

Public buckets:

- `job-photos`
- `avatars`
- `chat-photos`
- `chat-audio`

Client modules construct public URLs and persist them with domain rows. Job-photo delete policies were added later in `supabase/phase26_job_photo_delete_policies.sql`.

**Security concern:** insert/update policies in `supabase/phase3_storage.sql` are primarily bucket-based and do not consistently require the object path to belong to `auth.uid()` or to a job/conversation the caller owns. Public buckets also make URLs durable and unauthenticated once known. See `08_AUTH_SECURITY_AND_PERMISSIONS.md`.

## Data integrity concerns

1. `lib/bids.ts::acceptBid` updates job and bid separately. A partial failure can create disagreement.
2. `lib/jobs.ts::createJob` inserts the job and exact location separately.
3. `lib/jobs.ts::updateJob` separately updates/deletes the location row.
4. Client-side status strings are intentionally broad rather than generated from database enums.
5. Multiple modules use `select('*')` and `any`, so schema additions can unintentionally change data exposure and runtime shape.
6. No generated `Database` type ties TypeScript to the deployed schema.
7. Some migration phases repair or expand earlier constraints, so order is mandatory and reruns are not equivalent to a clean migration.

## Migration ordering and drift

- `supabase/phase17_portfolio.sql` initially limits portfolio categories; `supabase/phase19_portfolio_freeform.sql` removes/changes that constraint.
- `supabase/phase18_hire_again.sql` initially uses a narrower job-request category constraint; `supabase/phase23_realistic_seed.sql` expands category support.
- `supabase/phase20_push_notifications.sql` contains operational guidance for cron/Edge Function behavior, but repository presence does not prove remote deployment.
- Seed and repair phases mutate data and are mixed with schema changes.
- `supabase/phase28_publication_repair.sql` repairs Realtime publication membership rather than introducing a clean declarative end state.

## Seed and fake data

**VERIFIED**

- `supabase/phase22_job_listings_seed.sql`
- `supabase/phase23_realistic_seed.sql`
- `supabase/phase24_boost_jobs.sql`
- `supabase/phase27_dedupe_seeded_jobs.sql`

These scripts generate realistic demo listings and select existing profiles as owners. In the connected environment, this results in a large set of plausible fake jobs that can appear to belong to a real/test account. Seed application must be restricted to disposable demo/development environments, and source records should carry an explicit seed marker.

## Missing database operations

- Blank-project baseline migration.
- Versioned, timestamped, CLI-applied migration history.
- Generated TypeScript types.
- Automated policy tests with multiple identities.
- Transactional RPCs for job creation/location and bid acceptance.
- Payment/ledger/payout/refund tables.
- Verification-provider records and audit trail.
- Data retention, deletion, export, and anonymization jobs.
- Moderation audit log and staff-role model.
- Explicit production seed controls.

