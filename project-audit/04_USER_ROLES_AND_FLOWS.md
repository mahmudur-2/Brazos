# User Roles and Flows

No role column or explicit mode switch was found. Brazos uses a single authenticated account that can act as both a client and a worker. Administration is an additional profile flag enforced mainly by database functions/policies.

## Roles

| Role | State | Evidence class | Implementation |
|---|---|---|---|
| Guest | COMPLETE | VERIFIED | `App.tsx` routes users without a Supabase session to `AuthScreen`. |
| Authenticated marketplace user | PARTIAL | VERIFIED | Can post jobs, browse/bid, work jobs, message, review, and maintain a profile. Mutation coverage is incomplete. |
| Client for a job | PARTIAL | PARTIALLY VERIFIED | Determined by `jobs.client_id`; client-specific detail/bid-management UI exists. |
| Worker for a job | PARTIAL | PARTIALLY VERIFIED | Determined by accepted worker/bid relationship; worker lifecycle UI exists. |
| Administrator | PARTIAL | PARTIALLY VERIFIED | `profiles.is_admin`, `AdminReportsScreen`, and security-definer moderation RPCs exist; destructive actions were not exercised. |
| Banned user | PARTIAL | INFERRED | Ban records/RPCs and auth-time sign-out logic exist; full enforcement was not tested. |

## Flow 1 — Launch, authentication, and legal gate

```text
App launch
  -> AuthProvider restores Supabase session
  -> no session: AuthScreen
  -> session: profile/banned-state lookup
  -> useLegalGate checks current document acceptance
  -> acceptance required: LegalGateScreen
  -> accepted or lookup fails: main tabs
```

- **VERIFIED:** an existing session restored and reached the authenticated app.
- **PARTIALLY VERIFIED:** login/sign-up UI and handlers exist in `screens/AuthScreen.tsx` and `hooks/useAuth.tsx`.
- **UNKNOWN:** email-confirmation requirement in the connected Supabase project.
- **BROKEN BY DESIGN RISK:** `hooks/useLegalGate.ts` fails open on network/schema errors, so the legal gate is not a strict enforcement boundary.
- **NOT IMPLEMENTED:** password reset, MFA, social auth, account deletion, and self-service data export.

## Flow 2 — Client posts a job

```text
Home/Profile/My Jobs
  -> PostJobScreen
  -> category + title + description
  -> optional photos
  -> neighborhood/current location
  -> optional budget
  -> lib/jobs.createJob
  -> jobs insert
  -> separate job_locations insert when coordinates exist
```

- **VERIFIED UI:** the web form displayed all configured categories, title/description counters, up to five photos, location controls, and optional budget.
- **PARTIALLY VERIFIED backend:** storage/job/location code exists.
- **NOT EXECUTED:** no job was created during this read-only audit.
- **RISK:** `createJob` performs job and exact-location writes separately. A failed second write can leave a job without its expected coordinate row.
- **MISSING:** transactional creation, draft/save, scheduling, preview, and robust duplicate prevention.

## Flow 3 — Worker discovers and bids on work

```text
Browse Jobs or Map
  -> open jobs / hotspot RPC
  -> JobDetailScreen
  -> bid amount + pitch
  -> lib/bids.createBid
  -> client later accepts with lib/bids.acceptBid
```

- **VERIFIED:** live browse list, job detail, bid form, web hotspot zones, and cell drill-down rendered.
- **PARTIALLY VERIFIED:** list/detail reads use live Supabase data.
- **NOT EXECUTED:** bid submission and acceptance.
- **RISK:** `acceptBid` updates the job and bid in separate client-side calls rather than an atomic RPC.
- **MISSING:** search, category/distance/price filters, sort, saved searches, and scheduling/availability.

## Flow 4 — Client manages applicants and job status

```text
My Jobs
  -> Active / In Progress / Completed filters
  -> ClientJobDetailScreen
  -> inspect bids
  -> accept worker
  -> message / track status
  -> completion / cancellation
```

- **VERIFIED:** status filters and populated/empty states rendered; completed jobs showed appropriate badges.
- **PARTIALLY VERIFIED:** bid cards, job detail actions, and status functions exist.
- **NOT EXECUTED:** acceptance, cancellation, or completion writes.
- **MISSING:** transactional status state machine, dispute flow, audit trail, payment/escrow, and explicit cancellation/refund policy enforcement.

## Flow 5 — Worker performs and completes a job

```text
My Jobs
  -> WorkerJobScreen
  -> start job
  -> job chat / progress
  -> completion photos and completion action
  -> review state
```

- **VERIFIED:** a completed worker job detail and existing review rendered.
- **PARTIALLY VERIFIED:** completion-photo schema/storage and lifecycle UI exist.
- **UNKNOWN:** native photo capture/upload and full status transitions.
- **MISSING:** arrival confirmation/tracking, client approval/dispute, payment release, offline behavior, and evidence-retention policy.

## Flow 6 — Messaging and repeat work

```text
Messages inbox or job detail
  -> ChatScreen
  -> text / quick reply / media / reply / reaction
  -> Realtime messages and read state
  -> optional block, mute, report, unsend
  -> Hire Again request / counter / response
```

- **VERIFIED:** inbox/thread rendering, text messages, voice controls, quick replies, replies, and an unsent placeholder.
- **PARTIALLY VERIFIED:** Realtime/data/storage/RPC source exists.
- **NOT EXECUTED:** sending, recording, upload, reaction, read-state cross-account validation, unsend action, moderation actions, or job-request negotiation.
- **WEB LIMITATION:** camera and microphone controls are intentionally hidden.
- **MISSING:** delivery/offline queue, attachment scanning, retention tools, and operator access/audit policy.

## Flow 7 — Profile, portfolio, and reviews

```text
Profile
  -> edit name/tagline/language/location
  -> avatar / portfolio
  -> notification settings / legal documents
WorkerProfileScreen
  -> ratings + stats + portfolio
```

- **VERIFIED:** profile, statistics, verification badge, empty portfolio state, legal links, and an existing review render.
- **PARTIALLY VERIFIED:** update/upload/delete functions exist but were not mutated.
- **UI ONLY:** identity verification status has no verification workflow/provider.
- **UI ONLY:** language preference does not localize the product.
- **RISK:** `ProfileScreen` falls back to saving only older core fields if extended columns are missing, potentially masking schema drift.

## Flow 8 — Moderation

```text
User report
  -> reports table
  -> AdminReportsScreen / admin_open_reports RPC
  -> dismiss or ban
  -> banned phone and profile state affect future auth
```

- **VERIFIED:** admin-only entry visibility and empty report queue rendered for an admin-marked session.
- **PARTIALLY VERIFIED:** RLS/security-definer RPCs exist.
- **NOT EXECUTED:** report creation, dismissal, ban/unban, blocked-user interaction, or privilege-boundary attacks.
- **MISSING:** moderation audit log UI, appeals, evidence retention, staff-role granularity, and operator notifications.

## Flow 9 — Notifications

```text
Authenticated app
  -> usePushNotifications
  -> preference lookup
  -> permission/token registration
  -> push_tokens
Database event
  -> notification_outbox
  -> cron/Edge Function
  -> Expo Push Service
  -> device response routing
```

- **BROKEN on web:** `getLastNotificationResponseAsync` is called where unavailable.
- **VERIFIED configuration gap:** the notification settings runtime indicates that no EAS project ID is linked.
- **UNKNOWN:** Edge Function deployment, service-role secret, scheduled invocation, Expo receipts, and physical-device delivery.

## Runtime-safety note

The audit navigated read-only surfaces. It intentionally did not submit forms, toggle preferences, send messages, upload media, modify jobs, accept bids, write reviews, or invoke moderation actions.

