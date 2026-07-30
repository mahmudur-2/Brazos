# API and Integrations

## Backend API boundary

**VERIFIED**

There is no custom REST/GraphQL application server. `lib/supabase.ts` creates a browser/native Supabase client, and domain modules under `lib/` call Supabase tables, views, RPCs, Realtime, and Storage directly.

Environment variable names:

- `SUPABASE_URL`
- `SUPABASE_KEY`

No environment value is reproduced here. `babel.config.js` uses `react-native-dotenv` with `allowUndefined: true`; `lib/supabase.ts` throws a user-readable initialization error when configuration is absent.

## Supabase integration inventory

| Integration | Client entry points | State | Verification |
|---|---|---|---|
| Auth | `hooks/useAuth.tsx`, `screens/AuthScreen.tsx` | PARTIAL | Existing session restoration verified; fresh auth writes not run. |
| PostgREST tables/views | `lib/jobs.ts`, `bids.ts`, `messages.ts`, `profiles.ts`, etc. | PARTIAL | Numerous live reads verified; mutations intentionally not executed. |
| RPC | discovery, moderation, stats, requests, legal, unsend, push | PARTIAL | Schema verifier confirms targeted functions; full semantics not tested. |
| Realtime | hooks for jobs/bids/messages/reactions/requests | PARTIAL | Source and publication exist; multi-client delivery UNKNOWN. |
| Storage | job/profile/chat uploads | PARTIAL | Buckets/policies/code exist; upload/delete not exercised. |
| Edge Function | `supabase/functions/send-push/index.ts` | PARTIAL | Source exists; remote deployment and secrets UNKNOWN. |

## OpenStreetMap Nominatim

**PARTIAL / INFERRED**

`lib/reverseGeocode.ts` sends client-side reverse-geocoding requests to Nominatim and parses neighborhood/city/state fields. It includes timeout/error handling, but there is no service proxy, centralized cache, provider key/configuration, usage telemetry, or explicit rate-limit strategy.

Risks:

- Availability and response shape are external dependencies.
- Direct client traffic can violate practical rate expectations at scale.
- The application cannot centrally enforce caching, request identity, or fallback.
- Location strings can vary by provider/locale.

## Native location and maps

- `lib/geolocation.ts` requests current-place information through Expo Location.
- `components/HotspotMap.native.tsx` uses `react-native-maps`.
- `components/HotspotMap.web.tsx` implements a non-map list fallback.
- `MapScreen.tsx` calls aggregate hotspot/cell RPCs rather than showing exact coordinates for all open jobs.

Web discovery was **VERIFIED**. Native permission prompts, denied/restricted states, GPS accuracy, and native map rendering are **UNKNOWN**.

## Expo push notifications

### Client

- `hooks/usePushNotifications.ts` installs response/token listeners and requests setup.
- `lib/pushNotifications.ts` derives the EAS project ID, obtains an Expo token, stores it, and routes notification data through `lib/navigationRef.ts`.
- `screens/NotificationSettingsScreen.tsx` manages notification preferences.

### Server

- `supabase/phase20_push_notifications.sql` defines token/preferences/outbox tables, triggers, and claim/result functions.
- `supabase/functions/send-push/index.ts` claims outbox rows and calls the Expo Push API using a service-role-authenticated request.

### Status

- **BROKEN on web:** `getLastNotificationResponseAsync` is called even though the method is unavailable on web.
- **BROKEN configuration:** the running notification screen reports the app is not linked to an EAS project.
- **UNKNOWN:** Edge Function deployment, environment secrets, scheduled invocation, token registration on a development/production build, receipt processing, retries at scale, and physical-device delivery.
- **NOT IMPLEMENTED:** an operations view for dead-letter rows or delivery health.

## Email

**NOT IMPLEMENTED / UNKNOWN**

No Resend, SendGrid, Postmark, SES, Supabase Edge email function, email template, or application-level mail call was found. Supabase Auth may send verification email depending on remote project configuration, but that configuration was not inspected and is **UNKNOWN**. The sign-up UI's “check your email” message is not evidence of delivery.

## Payments

**NOT IMPLEMENTED**

No payment-provider SDK, server client, checkout, ledger, escrow, payout, webhook, refund, tax, identity/KYC, or reconciliation code was found. Budget and agreed-price fields are informational. `lib/legal/terms.ts` states that users arrange payment directly and Brazos does not process it.

## Media integration

- Expo Image Picker/File System and Supabase Storage support avatars, portfolio items, job photos, and chat photos.
- Audio recording/playback and `chat-audio` storage support voice messages.
- Public URLs are stored with application rows.

**PARTIAL:** source/schema exist and existing media UI rendered, but new media upload, content validation, size enforcement, transcoding, malware scanning, deletion, and retention were not verified.

## Missing service integrations

- Identity verification provider.
- Payment/escrow/payout provider.
- Transactional email provider.
- Product analytics.
- Crash/performance monitoring.
- Customer support/ticketing.
- Abuse/media scanning.
- Feature flags/remote configuration.
- Geocoding proxy/provider management.
- CI/CD and release automation.

## Integration reliability concerns

- Most external calls originate from the client, limiting centralized retry/rate control.
- Push operations depend on remote deployment state absent from repository configuration.
- `select('*')` and non-generated types obscure API contracts.
- No integration tests or contract tests exist.
- Errors are generally surfaced screen-by-screen or logged to console; no correlated request/trace identifiers exist.

