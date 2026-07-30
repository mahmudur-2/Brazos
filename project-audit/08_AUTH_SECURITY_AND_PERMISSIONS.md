# Authentication, Security, and Permissions

This is a source and configuration audit, not a penetration test. No privilege escalation, destructive write, account creation, or policy bypass was attempted.

## Authentication flow

**PARTIALLY VERIFIED**

`hooks/useAuth.tsx::AuthProvider`:

- restores the Supabase session with `getSession`;
- listens to `onAuthStateChange`;
- starts/stops token refresh based on application state;
- signs in with email/password;
- signs up with full-name/phone metadata;
- upserts a profile when sign-up immediately returns a session;
- looks up profile/ban state and signs out a banned account;
- signs out and clears local state.

`lib/supabase.ts` persists the session in AsyncStorage and enables refresh/persistence.

### Strengths

- Session refresh responds to foreground/background state.
- Banned-profile state is checked after authentication.
- `supabase/phase6_auth_profile_trigger.sql::handle_new_user` centralizes initial profile creation and phone-ban validation.
- UI error handling avoids exposing raw database details in many paths.

### Gaps

- Password recovery is not implemented.
- MFA and social providers are not implemented.
- Email confirmation behavior is not made explicit in repository configuration.
- Account deletion/data export are not implemented.
- No session/device management UI exists.
- Sign-up profile creation is split between a database trigger and a client upsert, creating overlapping responsibility.
- No client/server abuse throttling strategy is documented.

## Authorization model

**PARTIALLY VERIFIED**

The client has no trusted server middleware. PostgreSQL RLS, RPC grants, and Storage policies are therefore the main authorization layer.

Positive controls found in SQL:

- Many application tables enable RLS.
- Jobs/bids/messages/reviews restrict writes based on party identity and state.
- `job_locations` separates exact coordinates and limits reads to job participants.
- Public open-job queries in `lib/jobs.ts` use an explicit field allowlist rather than `select('*')`.
- Review insertion validates completed-job parties.
- Moderation RPCs use security-definer functions and explicit grants.
- Legal acceptances are append-only.
- Push outbox claim/result functions are intended for the service role.
- `supabase/functions/send-push/index.ts` compares bearer authorization to its service-role secret.

## High-priority authorization/privacy findings

### 1. Public storage write scope

**PARTIAL / security risk**

`supabase/phase3_storage.sql` defines public buckets and broad authenticated insert/update rules primarily by `bucket_id`. The policies do not consistently bind the object path to `auth.uid()` or a job/conversation relationship.

Potential impacts:

- unauthorized overwrite if an object name/path can be targeted;
- unbounded orphan uploads and cost abuse;
- chat media uploaded without storage-layer proof of conversation membership;
- public, durable URLs with limited revocation.

Required follow-up: design user/job-scoped object paths, validate MIME/size, bind writes/deletes to ownership, and test policies with attacker/victim accounts.

### 2. Broad authenticated profile visibility

**PARTIAL / privacy review required**

The profile policy allows authenticated reads broadly, while the client `Profile` shape includes phone information and several modules use `select('*')`. Confirm the deployed column grants/view strategy ensures phone and internal flags are not exposed to every signed-in user. Prefer a public-profile view with an explicit field allowlist.

### 3. Legal gate fails open

**VERIFIED**

`hooks/useLegalGate.ts` deliberately allows entry when acceptance lookup fails. This is a UX continuity choice, not reliable legal enforcement. If acceptance is mandatory, enforce it server-side for protected mutations and fail closed with a recoverable screen.

### 4. Non-transactional state transitions

**VERIFIED in source**

- `lib/bids.ts::acceptBid` updates the job and bid separately.
- `lib/jobs.ts::createJob` writes the job and location separately.
- `lib/jobs.ts::updateJob` updates/deletes location separately.

RLS cannot provide transaction atomicity across independent client requests. Move these transitions into validated RPCs.

### 5. Administrative route defense

**PARTIALLY VERIFIED**

`ProfileScreen` only shows the admin entry when `profile?.is_admin`, but `AdminReports` remains registered in the profile navigator for all clients. Navigation visibility is not authorization. Database RPC/policy checks appear to protect the data/actions, but they need explicit adversarial tests.

### 6. Seed data ownership

**VERIFIED**

Seed SQL assigns fabricated jobs to existing profile IDs. This can misattribute content to users and create privacy/support confusion. Production must never run these scripts, and seeded rows need a traceable marker in non-production.

## Messaging and moderation security

- RLS and `is_blocked_between` support job-party messaging restrictions.
- Blocks, mutes, reports, ban/unban, and admin report retrieval exist.
- Unsend is time-limited through a server RPC/view rather than a simple client delete.
- Public chat-media buckets remain a weaker boundary than message-row RLS.
- No attachment content scanning, antivirus, EXIF stripping, abuse classifier, or operator evidence policy was found.
- No moderation audit trail or staff role separation was found.
- No rate limit for messages/reports/requests was found.

## Push security

- Service-role operations are kept in the Edge Function source, not the app bundle.
- Token and preference tables use RLS.
- Exact deployment secrets were not inspected or copied.
- Edge Function deployment and secret configuration are **UNKNOWN**.
- The SQL/function design needs replay, batch ownership, poison-message, and receipt-handling tests.

## Secret handling

- `.env` exists locally but was not read or copied.
- `.env.example` exposes only required variable names.
- `SUPABASE_KEY` appears intended to be the public client key; use a modern publishable/anon key and never a service-role key in the client.
- `react-native-dotenv` embeds configured client values in bundles; only public client configuration belongs there.
- No secret scanning or CI check exists.

## Recommended security verification

1. Create automated RLS tests using guest, user A, user B, job client, accepted worker, banned user, and admin identities.
2. Replace broad profile reads with public/private views and field allowlists.
3. Redesign Storage paths/policies and test object overwrite/delete attempts.
4. Move multi-row transitions into transactional, state-validating RPCs.
5. Enforce current legal acceptance on protected server mutations if legally required.
6. Add rate limiting, upload limits, MIME verification, and retention/deletion workflows.
7. Introduce secret scanning, dependency review, audit logging, and production monitoring.
8. Commission a dedicated threat model and penetration test before handling payments or sensitive verification documents.

