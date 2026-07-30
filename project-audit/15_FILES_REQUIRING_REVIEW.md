# Files Requiring Review

Ordered for a senior engineer's handoff. “Review” does not mean the file is necessarily wrong; it means the file carries significant behavior, risk, or missing context.

## Priority 0 — establish the real system

| Path | Symbols/area | Why review first |
|---|---|---|
| `supabase/phase1_rls_and_realtime.sql` through `supabase/phase28_publication_repair.sql` | complete phase sequence | Reconstruct intended end-state schema, ordering, policies, seeds, and repairs. |
| Missing baseline migration | `profiles`, `jobs`, `bids`, `reviews` | Critical absent source needed to recreate the project. |
| `scripts/verify-schema.mjs` | all checks | Useful but partial; expand into a clean-environment schema/policy verification suite. |
| `lib/supabase.ts` | Supabase client creation/auth persistence | Confirm key semantics, environment handling, and generated database typing. |
| `.env.example` | variable contract | Add environment documentation without adding secrets. |
| `app.json` | Expo identifiers/plugins/permissions | Add EAS project/runtime/update/environment strategy after review. |
| `package.json` | scripts/dependencies | Add explicit typecheck/lint/test/build commands and review SDK upgrade plan. |

## Priority 1 — correctness and security boundaries

| Path | Symbols/area | Review focus |
|---|---|---|
| `lib/bids.ts` | `acceptBid`, bid row mapping/value score | Replace two-step acceptance with an atomic, server-validated transition. |
| `lib/jobs.ts` | `createJob`, `updateJob`, public open-job projection | Make job/location atomic; preserve explicit public field allowlist. |
| `supabase/phase3_storage.sql` | bucket and object policies | Bind paths/actions to ownership/domain membership; validate public-bucket decision. |
| `supabase/phase7_location_privacy.sql` | `job_locations`, hotspot RPCs | Adversarially verify exact-coordinate privacy and SECURITY DEFINER search paths. |
| `lib/profiles.ts` | profile selects/updates | Eliminate broad private-field reads; use public/private shapes. |
| `hooks/useAuth.tsx` | `AuthProvider`, `signUp`, banned-profile check | Resolve trigger/client upsert overlap; add lifecycle/recovery and test bans. |
| `hooks/useLegalGate.ts` | fail-open behavior | Decide whether legal acceptance is server-enforced. |
| `lib/moderation.ts` | blocks/mutes/reports/admin actions | Verify all calls against RLS and add auditability. |
| `supabase/phase4_moderation.sql` | moderation tables/RPCs | Review privilege grants, impersonation paths, audit log, and phone privacy. |
| `lib/messages.ts` | message queries/uploads/unsend | Review party checks, public media, retention, `select('*')`, and concurrency. |
| `lib/conversations.ts` | inbox view/query mapping | Replace `any`/`select('*')`; test unread/read behavior. |
| `lib/reviews.ts` | review reads/writes | Verify party/status uniqueness, visibility, edits/deletes, and abuse controls. |

## Priority 1 — notification release blocker

| Path | Symbols/area | Review focus |
|---|---|---|
| `hooks/usePushNotifications.ts` | cold-start and listener effects | Add platform guards; test lifecycle and listener cleanup. |
| `lib/pushNotifications.ts` | project ID/token registration/routing | Configure EAS, token rotation, route typing, and device cases. |
| `lib/notificationPrefs.ts` | preference reads/writes | Validate defaults, schema drift, and failure UX. |
| `screens/NotificationSettingsScreen.tsx` | configuration and toggles | Make setup state actionable and accessible. |
| `supabase/phase20_push_notifications.sql` | outbox/triggers/claim/retry | Verify idempotency, permissions, cron, poison rows, and scale. |
| `supabase/functions/send-push/index.ts` | Edge Function handler | Verify deployment, authorization, batching, receipts, timeout, and observability. |
| `lib/navigationRef.ts` | notification route dispatch | Remove `any`; define safe allowed destinations and cold-start readiness. |

## Priority 2 — primary product flows

| Path | Symbols/area | Review focus |
|---|---|---|
| `App.tsx` | auth/legal gates and all navigators | Remove unused sizing constants, strengthen route types, reduce duplicate registrations, complete theme decision. |
| `screens/AuthScreen.tsx` | auth forms | Add reset/confirmation lifecycle, accessibility, rate/error handling. |
| `screens/PostJobScreen.tsx` | create-job form | Transactional submit, validation, upload rollback, offline/failure states. |
| `screens/JobDetailScreen.tsx` | detail/bid flow | Remove unsafe casts, refetch by ID, test duplicate/conflicting bids. |
| `screens/ClientJobDetailScreen.tsx` | client state/actions | Define state machine and transactional mutations. |
| `screens/WorkerJobScreen.tsx` | worker state/completion | Validate state transitions and completion-media lifecycle. |
| `screens/MyJobsScreen.tsx` | role/status lists | Pagination, stale state, empty/error consistency. |
| `screens/ChatScreen.tsx` | chat orchestration | Large/high-complexity screen; remove unused symbols and split/test interaction domains. |
| `screens/MessagesScreen.tsx` | inbox | Pagination, unread correctness, Realtime/reconnect behavior. |
| `screens/ProfileScreen.tsx` | edit/fallback/admin links | Remove silent legacy fallback; separate public/private fields and permissions. |
| `screens/WorkerProfileScreen.tsx` | public profile | Ensure only safe public projection is used. |
| `screens/AdminReportsScreen.tsx` | report/ban operations | Add explicit auth failure, audit log, evidence and appeals design. |

## Priority 2 — maps, media, and supporting domains

| Path | Symbols/area | Review focus |
|---|---|---|
| `components/HotspotMap.native.tsx` | native map and `DARK_MAP_STYLE` | Physical-device validation, unused style, permissions, performance. |
| `components/HotspotMap.web.tsx` | web fallback | Remove unused import; accessibility and geographic-product expectations. |
| `lib/geolocation.ts` | permission/location resolution | Denied/restricted/timeout/accuracy cases. |
| `lib/reverseGeocode.ts` | Nominatim request/parser | Provider policy, proxy/cache, rate limits, timeout, fallback. |
| `components/ChatComposer.tsx` | text/media recording | Platform permissions, validation, offline/error/disabled behavior. |
| `components/VoiceMessage.tsx` | playback | Audio lifecycle, accessibility, interruption, unavailable media. |
| `components/PhotoViewer.tsx` | gesture/viewer; unused `vx` | Clean diagnostic issue and test gestures/accessibility. |
| `lib/portfolio.ts` | portfolio storage/data | Ownership, category drift, deletion/orphan cleanup. |
| `lib/jobRequests.ts` | repeat-work negotiation | Transaction/state validation and notification coupling. |

## Priority 3 — system consistency

| Path | Review focus |
|---|---|
| `lib/theme.ts` | Define supported themes and platform tokens. |
| `hooks/useThemeColors.ts` | Complete adoption or simplify to explicit light-only support. |
| `components/Button.tsx` | Establish role/label/focus/disabled/loading accessibility contract. |
| `components/Card.tsx`, `JobCard.tsx`, `BidCard.tsx` | Interactive-card semantics and keyboard behavior. |
| `components/LoadingScreen.tsx`, `ErrorState.tsx`, `EmptyState.tsx` | Standardize retry/offline/stale and announcements. |
| `components/ActionSheet.tsx`, `ReactionPicker.tsx` | Dialog semantics, focus trap, dismissal, backdrop behavior. |
| `lib/errorMessage.ts` | Create consistent error taxonomy without leaking backend detail. |
| `lib/categories.ts` | Establish one category source shared with database constraints. |
| `brazos-product-spec.md` | Rewrite to reflect current scope and explicit product decisions. |
| `lib/legal/terms.ts`, `lib/legal/privacy.ts` | Counsel review, final versions, environment/version release process. |

## SQL phase files with special attention

- `supabase/phase17_portfolio.sql` and `supabase/phase19_portfolio_freeform.sql` — category constraint evolution.
- `supabase/phase18_hire_again.sql` and `supabase/phase23_realistic_seed.sql` — job-request category drift.
- `supabase/phase20_push_notifications.sql` — schema plus operational instructions mixed together.
- `supabase/phase22_job_listings_seed.sql`, `phase23_realistic_seed.sql`, `phase24_boost_jobs.sql`, `phase27_dedupe_seeded_jobs.sql` — fake data, ownership attribution, and repair.
- `supabase/phase26_job_photo_delete_policies.sql` — late-added deletion policy signals storage lifecycle gaps.
- `supabase/phase28_publication_repair.sql` — remote Realtime drift repair.

## Files with verified static cleanup issues

- `App.tsx`
- `components/HotspotMap.native.tsx`
- `components/HotspotMap.web.tsx`
- `components/PhotoViewer.tsx`
- `screens/ChatScreen.tsx`

See `09_TEST_BUILD_AND_RUNTIME_RESULTS.md` for exact unused declarations.

