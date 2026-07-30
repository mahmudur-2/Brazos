# Verified findings

Status vocabulary:

- `VERIFIED`: directly observed in source, a command, or local runtime.
- `FIXED IN CHANGESET`: corrected by this branch, with code/static validation.
- `PENDING DATABASE VALIDATION`: migration exists but was not executed.
- `REMAINING`: intentionally not changed in this pass.

## P0 findings

### Protected profile fields were caller-writable

- Status: VERIFIED; FIXED IN CHANGESET; PENDING DATABASE VALIDATION.
- Evidence: `supabase/phase7_profiles_two_way.sql`, policies
  `profiles_update_own` and `profiles_insert_own`, constrained only the row ID.
  They did not protect `role`, `verification_status`, `rating_avg`,
  `rating_count`, `is_admin`, or `banned`.
- Fix: `supabase/phase29_security_hardening.sql` revokes direct profile
  mutations and adds `public.update_my_profile(p_patch jsonb)`, whose allowlist
  contains only `full_name`, `phone`, `avatar_url`, `bio`, `language`, and
  `categories`.

### Authenticated users could read other users' private profile columns

- Status: VERIFIED; FIXED IN CHANGESET; PENDING DATABASE VALIDATION.
- Evidence: `profiles_select_authenticated` used `using (true)`;
  `lib/profiles.ts::fetchProfileById` used `select('*')`; and
  `lib/bids.ts::fetchBidsForJob` embedded `profiles(*)`.
- Fix: phase 29 revokes table-wide profile SELECT and grants only named public
  columns. `get_my_profile()` returns the caller's complete row.
  `PUBLIC_PROFILE_COLUMNS`, `fetchProfileById`, and `fetchBidsForJob` use the
  same public allowlist.

### Job and bid state was broadly mutable

- Status: VERIFIED; FIXED IN CHANGESET; PENDING DATABASE VALIDATION.
- Evidence: `supabase/phase1_rls_and_realtime.sql` allowed a job owner and
  assigned worker to update their entire job row, and allowed a bid worker/job
  owner to update an entire bid row. Insert policies trusted all
  caller-supplied fields except the owner ID.
- Fix: phase 29 removes those mutation policies and direct INSERT/UPDATE
  privileges. `create_job`, `update_job_details`, `create_bid`,
  `accept_bid`, and `transition_job_status` derive identities and enforce state
  transitions on the server.

### Bid acceptance was non-atomic and trusted client values

- Status: VERIFIED; FIXED IN CHANGESET; PENDING DATABASE VALIDATION.
- Evidence: the former `lib/bids.ts::acceptBid` updated `jobs` and then `bids`
  in separate requests, accepting caller-provided worker and amount values.
- Fix: `public.accept_bid(p_job_id, p_bid_id)` locks the job and bid, verifies
  ownership/pending state/active parties, derives worker and amount, assigns
  the job, accepts the selected bid, and rejects other pending bids in one
  transaction.

### Assigned/completed zero-bid jobs were deletable by the client

- Status: VERIFIED; FIXED IN CHANGESET; PENDING DATABASE VALIDATION.
- Evidence: `supabase/phase14_job_edit_delete.sql::jobs_delete_own` checked
  ownership and zero bids but not job status. Direct-hire jobs can have zero
  bids after assignment.
- Fix: phase 29 recreates `jobs_delete_own` with `status = 'open'`,
  `is_active_user()`, ownership, and zero-bid checks.

### Reviews trusted caller-supplied row fields

- Status: VERIFIED; FIXED IN CHANGESET; PENDING DATABASE VALIDATION.
- Evidence: the phase 6 RLS policy checked parties, but authenticated callers
  still directly inserted all review columns.
- Fix: phase 29 revokes review mutations and adds
  `public.create_review`, which derives the reviewer, requires the correct
  completed-job parties, and validates rating/comment. `lib/reviews.ts`
  now calls that function.

### Chat media was public and upload paths were not owned

- Status: VERIFIED; FIXED IN CHANGESET; PENDING DATABASE VALIDATION.
- Evidence: `supabase/phase8_chat.sql` and
  `supabase/phase16_voice_messages.sql` created public chat buckets and
  bucket-only insert policies. `lib/storage.ts` used `{jobId}/{timestamp}`.
- Fix: phase 29 makes both buckets private; read policies require job-party
  membership; inserts require `{jobId}/{auth.uid()}/...`, active status, job
  membership, and no party block. `resolveChatMediaUrl` supplies short-lived
  signed display URLs while preserving legacy object paths.

### Public media upload policies did not bind paths strongly enough

- Status: VERIFIED; FIXED IN CHANGESET; PENDING DATABASE VALIDATION.
- Evidence: earlier avatar/job-photo insert policies checked the bucket only.
- Fix: avatar paths must start with `auth.uid()`; posting paths must be
  `postings/{auth.uid()}/...`; completion paths must identify a job assigned to
  the caller.

## P1 findings

### Web invoked unsupported notification response APIs

- Status: VERIFIED; FIXED IN CHANGESET.
- Evidence: local web console previously reported the unavailable cold-start
  notification API. `hooks/usePushNotifications.ts` registered both response
  paths on all platforms.
- Fix: both response effects now return immediately on web. The prior runtime
  error did not recur in the final smoke test.

### Chat subscriptions and late asynchronous work could become stale

- Status: VERIFIED BY SOURCE; FIXED IN CHANGESET.
- Evidence: `hooks/useChat.ts` used a channel topic based only on job ID and
  asynchronous realtime media resolution had no cleanup guard.
- Fix: `useChat` uses an instance-unique topic, removes the exact channel,
  ignores post-cleanup realtime completions, and invalidates superseded/unmounted
  initial loads.

### Broad projections increased accidental disclosure and payload risk

- Status: VERIFIED; FIXED IN MODIFIED SECURITY-RELEVANT PATHS.
- Evidence: `profiles(*)`, profile/job/bid/review/message `select('*')`
  patterns were present in the changed data-access functions.
- Fix: explicit projection constants/strings now cover profile, job, bid,
  review, and message reads involved in this pass.

### UI made unsupported verification and proximity claims

- Status: VERIFIED; FIXED IN CHANGESET.
- Evidence: `components/VerificationBadge.tsx` displayed `ID-checked` for all
  non-verified users although the repository contains no ID-check provider.
  `screens/HomeScreen.tsx` and `screens/JobDetailScreen.tsx` used “nearby”
  labels for queries with no distance filter.
- Fix: labels are now `Not verified`, `Open jobs`, and `Similar open jobs`.

### Strict unused-code checking failed

- Status: VERIFIED; FIXED IN CHANGESET.
- Evidence: the baseline strict TypeScript command reported nine unused
  imports/constants.
- Fix: only the reported dead imports/constants were removed from `App.tsx`,
  map components, `PhotoViewer`, and `ChatScreen`; the final strict command
  passes.
