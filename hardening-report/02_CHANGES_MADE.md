# Changes made

## Authorization and privacy

| Verified risk | Smallest safe change | Primary implementation | Reproducible check |
|---|---|---|---|
| Protected/self profile updates shared one broad table policy | Revoke direct writes; allowlist self-editable JSON keys in one RPC | `supabase/phase29_security_hardening.sql::update_my_profile`; `lib/profiles.ts::updateProfile` | `tests/hardening.test.mjs` profile test |
| Public profile reads included phone/moderation fields | Column-level SELECT grants plus a self-only RPC | `get_my_profile`, `current_user_is_banned`, `PUBLIC_PROFILE_COLUMNS` | Node test plus staging SQL contract |
| Job and exact-location writes trusted client row patches | Transactional, validated create/edit RPCs | `create_job`, `update_job_details`; `lib/jobs.ts` | Marketplace-write Node test |
| Job status could be arbitrarily patched by an assigned worker | Permit only assigned→in-progress→completed | `transition_job_status`; `lib/jobs.ts::updateJobStatus` | Marketplace-write Node test |
| Zero-bid delete policy included non-open jobs | Add open/active/owner/zero-bid conditions | phase 29 `jobs_delete_own` | Marketplace-write Node test |
| Bid creation/acceptance trusted caller state and acceptance was split | Auth-derived create and locked atomic acceptance | `create_bid`, `accept_bid`; `lib/bids.ts` | Marketplace-write Node test |
| Review insertion trusted caller identity | Derive reviewer and validate completed parties/rating | `create_review`; `lib/reviews.ts` | Marketplace-write Node test |
| Chat media was public | Private buckets, party RLS, signed URLs | phase 29 storage policies; `lib/storage.ts::resolveChatMediaUrl` | Chat-media Node test |
| Storage paths were not owned | Bind avatar/posting/chat paths to auth UID and completion path to assignment | phase 29 storage policies; `ChatScreen` upload calls | Storage Node tests |

The profile functions include a narrowly scoped `PGRST202` compatibility
fallback so the current development database remains readable before phase 29
exists. The fallback is used only when PostgREST says the RPC is missing; it
does not bypass a denial or validation error after migration.

## Reliability and correctness

- `hooks/usePushNotifications.ts::usePushNotifications` skips unsupported
  response handling on web.
- `hooks/useChat.ts::useChat` uses unique realtime channel names and lifecycle
  guards for fetch and signed-media work.
- `lib/messages.ts::fetchMessages` and realtime payload handling resolve legacy
  public chat URLs and new `storage://` references to signed URLs.
- `components/VerificationBadge.tsx::VerificationBadge` no longer claims an
  identity check that the product cannot substantiate.
- `screens/HomeScreen.tsx` and `screens/JobDetailScreen.tsx` no longer label
  unfiltered results as nearby.
- Dead `NewJobInput.hireWorkerId` was removed; the existing Hire Again request
  flow in `PostJobScreen` remains unchanged.

## Efficiency

- `lib/jobs.ts` uses `OPEN_JOB_COLUMNS`/`JOB_COLUMNS` instead of broad row
  projections.
- `lib/profiles.ts`, `lib/bids.ts`, `lib/reviews.ts`, and `lib/messages.ts`
  use explicit field lists in the modified fetch paths.
- Job creation/location and job editing/location each become one database
  transaction instead of multiple client requests.
- Bid acceptance becomes one request/transaction instead of two client updates.
- Realtime inserts remain deduplicated by message ID, while unique channel
  topics prevent one hook instance from replacing another instance's channel.

## Tooling

`package.json` adds reproducible `typecheck`, `lint`, `test`, and `export`
scripts. No dependency versions or package lock entries were changed.
