# Feature Inventory

## Status rules

- **COMPLETE** means the audited surface was implemented and its essential runtime path was verified. It does not imply production hardening.
- **PARTIAL** means meaningful frontend/backend work exists but a key path, platform, or reliability requirement remains unverified or incomplete.
- **UI ONLY** and **BACKEND ONLY** identify one-sided implementations.
- **BROKEN** identifies a reproduced failure.
- **PLACEHOLDER** identifies a representation without the claimed real-world system.
- **NOT IMPLEMENTED** means no implementation was found.
- **UNKNOWN** means audit evidence is insufficient.

## Marketplace and account features

| Feature | State | Evidence class | Evidence / limitation |
|---|---|---|---|
| Email/password auth gate | PARTIAL | PARTIALLY VERIFIED | `hooks/useAuth.tsx`, `screens/AuthScreen.tsx`; existing session restored, but no fresh credential mutation was performed. |
| Sign-up with name/phone | PARTIAL | INFERRED | `AuthProvider.signUp` writes auth metadata/profile; trigger exists in `supabase/phase6_auth_profile_trigger.sql`. Confirmation settings and full live flow UNKNOWN. |
| Sign-out | PARTIAL | INFERRED | `AuthProvider.signOut` exists; not invoked to preserve session. |
| Password recovery | NOT IMPLEMENTED | VERIFIED | No forgot/reset UI or handler found. |
| MFA/social auth | NOT IMPLEMENTED | VERIFIED | No provider setup or screens found. |
| Banned-user enforcement | PARTIAL | PARTIALLY VERIFIED | Profile check/sign-out in `hooks/useAuth.tsx`; phone ban and RPCs in moderation SQL. Ban behavior was not executed. |
| Legal acceptance gate | PARTIAL | PARTIALLY VERIFIED | UI, documents, table/RPC, and live schema exist; `hooks/useLegalGate.ts` fails open on lookup errors. |
| Home dashboard | COMPLETE | VERIFIED | Live authenticated home content rendered in the local web app. |
| Post a job | PARTIAL | PARTIALLY VERIFIED | `PostJobScreen` form includes category, title, description, photos, location, budget; submission not executed. |
| Browse open jobs | COMPLETE | VERIFIED | Live open-job list and details rendered; 93 seeded/open jobs were observed. |
| Job search/filter/sort | NOT IMPLEMENTED | VERIFIED | No general search, filters, distance, price, category, or sort controls found on browse. |
| Bid creation | PARTIAL | PARTIALLY VERIFIED | Bid UI and `createBid` data path exist; write not executed. |
| Bid ranking/value score | PARTIAL | INFERRED | Client-side score logic exists in `lib/bids.ts`; no test coverage or server authority. |
| Bid acceptance | PARTIAL | INFERRED | `acceptBid` exists but performs two non-transactional client updates. |
| Client job management | PARTIAL | PARTIALLY VERIFIED | Active/in-progress/completed surfaces render; state mutations not executed. |
| Worker job lifecycle | PARTIAL | PARTIALLY VERIFIED | Worker detail and completed history/review render; start/complete flows not executed. |
| Cancellation | PARTIAL | INFERRED | Status and UI support exist; write path not exercised. |
| Reviews | PARTIAL | PARTIALLY VERIFIED | Existing ratings/comments render and insertion code exists; review creation not executed. |
| Dual client/worker account | COMPLETE | VERIFIED | No role switch or separate role model; the same user can post and work jobs. |
| Profile editing | PARTIAL | PARTIALLY VERIFIED | Edit UI/data update path exists; saving was not executed. |
| Portfolio | PARTIAL | PARTIALLY VERIFIED | Grid, storage/data functions, and empty state exist; upload/delete not executed. |
| Worker public profile | PARTIAL | PARTIALLY VERIFIED | Route/UI/stat queries exist; navigation surface inspected. |
| Identity verification | UI ONLY | VERIFIED | `VerificationBadge.tsx` displays `verification_status`; no provider, upload, review, or proof workflow found. |

## Discovery and communications

| Feature | State | Evidence class | Evidence / limitation |
|---|---|---|---|
| Approximate hotspot discovery | PARTIAL | PARTIALLY VERIFIED | `job_hotspots`/`jobs_in_cell` and web hotspot list work; native map not tested. |
| Exact-location privacy | PARTIAL | VERIFIED in schema/source | `job_locations` and explicit open-job allowlist reduce exposure; RLS behavior was not adversarially tested. |
| Current-location resolution | PARTIAL | INFERRED | `lib/geolocation.ts` and `lib/reverseGeocode.ts` exist; device permissions and provider reliability UNKNOWN. |
| Direct job chat | PARTIAL | PARTIALLY VERIFIED | Existing thread, text, voice UI, replies, quick replies, and unsent placeholder render; sending was not mutated. |
| Photo messages | PARTIAL | INFERRED | Upload/message code and storage bucket exist; end-to-end flow not executed. |
| Voice messages | PARTIAL | PARTIALLY VERIFIED | Existing voice message control rendered; recording/upload/playback not verified. |
| Message reactions | PARTIAL | INFERRED | `lib/reactions.ts`, picker, chips, SQL, and subscriptions exist; mutation not verified. |
| Read receipts/unread counts | PARTIAL | PARTIALLY VERIFIED | Inbox/unread code and schema exist; cross-account behavior not tested. |
| Unsend within 15 minutes | PARTIAL | PARTIALLY VERIFIED | RPC/view and an existing unsent placeholder were observed; unsend mutation not executed. |
| Block/mute/report | PARTIAL | INFERRED | Client/data/UI/schema paths exist; behavioral enforcement was not exercised. |
| Hire Again job requests | PARTIAL | INFERRED | Cards, negotiation handlers, tables, RPCs, and notifications exist; no live write test. |
| Language preference | UI ONLY | VERIFIED | English/Spanish preference is stored/displayed; UI strings are not localized. |
| LLM bid translation | NOT IMPLEMENTED | VERIFIED | Product-spec concept has no model/provider/API implementation. |

## Operations and platform capabilities

| Feature | State | Evidence class | Evidence / limitation |
|---|---|---|---|
| Admin report queue | PARTIAL | PARTIALLY VERIFIED | Admin route and empty queue rendered; dismiss/ban actions were not executed. |
| Push preference storage | PARTIAL | PARTIALLY VERIFIED | UI/table/RPC code exists; toggles not mutated. |
| Push registration | BROKEN | BROKEN | Web logs unavailable-method error; notification screen reports no EAS project linkage. |
| Push outbox/delivery | PARTIAL | UNKNOWN | SQL and Edge Function source exist; deployed function, secret, cron, and device delivery are unverified. |
| Application email | NOT IMPLEMENTED | VERIFIED | No transactional email service, templates, or delivery code. |
| Auth email | UNKNOWN | UNKNOWN | Supabase may send confirmation/reset mail depending remote settings; settings were not inspected. |
| Payments/escrow | NOT IMPLEMENTED | VERIFIED | No Stripe/payment provider, ledger, webhook, payout, refund, or escrow code. |
| In-app budget display | COMPLETE | VERIFIED | Budget/agreed-price text renders; this is not payment processing. |
| Analytics | NOT IMPLEMENTED | VERIFIED | No product analytics SDK/events. |
| Crash/error reporting | NOT IMPLEMENTED | VERIFIED | Local `ErrorBoundary`/console logging only; no Sentry or equivalent. |
| Automated tests | NOT IMPLEMENTED | VERIFIED | No unit/integration/E2E suite or scripts. |
| Production bundle export | COMPLETE | VERIFIED | Web/iOS/Android export completed. |
| Native signed build | UNKNOWN | UNKNOWN | No Xcode/Gradle/EAS native archive was built. |
| Store/hosting deployment | NOT IMPLEMENTED | VERIFIED | No EAS profiles, hosting config, CI, or store metadata workflow. |

## Product-spec features not present

The following concepts appear in `brazos-product-spec.md` or are natural requirements of the intended marketplace but are absent: payment processing, escrow, guarantees/refunds, real identity verification, LLM translation, Express/urgent matching, live worker arrival tracking, disputes, insurance, scheduling/calendar, account deletion, data export, and production operations tooling.

## Mock, fake, and placeholder data

- **VERIFIED:** `supabase/phase22_job_listings_seed.sql`, `supabase/phase23_realistic_seed.sql`, and `supabase/phase24_boost_jobs.sql` insert or generate demo job listings.
- **VERIFIED:** `supabase/phase27_dedupe_seeded_jobs.sql` attempts to repair duplicates, but template repetition remains inherent to the seed approach.
- **VERIFIED at runtime:** the connected project displayed a high volume of repeated realistic listings, and seed ownership can make fabricated jobs appear posted by an existing user.
- **PLACEHOLDER:** `verification_status` and `VerificationBadge` visually imply identity checking without a checked-in verification system.
- **VERIFIED:** no explicit `TODO`, `FIXME`, `HACK`, or `WIP` marker was found in application source. Incompleteness is primarily structural rather than marked.

