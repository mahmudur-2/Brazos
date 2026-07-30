# Repository Structure

## Git state at audit start

**VERIFIED**

```text
## master
?? .claude/_claude_bak/
?? .claude/launch.json
?? .claude/settings.local.json
?? .expo-start-error.log
?? .expo-start.log
```

No tracked modification or staged change was reported. The `.claude/*` paths pre-existed this audit. `.expo-start.log` and `.expo-start-error.log` are untracked process logs associated with the locally running app. No files were reset, reverted, overwritten, or deleted.

Git also emitted a permission warning while trying to read the user-level ignore file at `C:\Users\mdmah\.config\git\ignore`; this did not prevent repository status inspection.

## Top-level layout

**VERIFIED**

```text
BRAZOS/
├── App.tsx                     # Navigation root, auth/legal gates, tab/stack setup
├── index.ts                    # Expo root registration
├── app.json                    # Expo application metadata and native permissions
├── package.json                # Runtime dependencies and four Expo scripts
├── package-lock.json           # npm lockfile
├── tsconfig.json               # Strict TypeScript configuration
├── babel.config.js             # Expo preset and react-native-dotenv
├── env.d.ts                    # Environment-module declarations
├── .env.example                # Variable names only
├── brazos-product-spec.md      # Product specification; materially behind the code
├── AGENTS.md                   # Repository-specific Expo documentation instruction
├── assets/                     # Application icons, splash, and static images
├── components/                 # Shared visual and interaction components
├── hooks/                      # Supabase-backed screen state and device hooks
├── lib/                        # Domain queries, Supabase client, theme, utilities
├── screens/                    # Route-level React Native screens
├── scripts/                    # Live Supabase schema verifier
└── supabase/                   # Manually ordered SQL phases and one Edge Function
```

## Source areas

### `screens/`

**VERIFIED** — 17 route-level files were found:

- `screens/AuthScreen.tsx`
- `screens/LegalGateScreen.tsx`
- `screens/HomeScreen.tsx`
- `screens/PostJobScreen.tsx`
- `screens/BrowseJobsScreen.tsx`
- `screens/JobDetailScreen.tsx`
- `screens/MapScreen.tsx`
- `screens/CellJobsScreen.tsx`
- `screens/MyJobsScreen.tsx`
- `screens/ClientJobDetailScreen.tsx`
- `screens/WorkerJobScreen.tsx`
- `screens/MessagesScreen.tsx`
- `screens/ChatScreen.tsx`
- `screens/ProfileScreen.tsx`
- `screens/WorkerProfileScreen.tsx`
- `screens/AdminReportsScreen.tsx`
- `screens/NotificationSettingsScreen.tsx`

`App.tsx` also routes legal documents through a screen/component named `LegalDocument`.

### `components/`

**VERIFIED** — shared primitives and domain components include:

- Foundation: `Button.tsx`, `Card.tsx`, `Input.tsx`, `FormInput.tsx`, `SafeScreen.tsx`, `ScreenHeader.tsx`, `KeyboardScreen.tsx`, `LoadingScreen.tsx`, `ErrorState.tsx`, `EmptyState.tsx`, `SectionHeader.tsx`, `CategoryIcon.tsx`.
- Jobs and marketplace: `JobCard.tsx`, `BidCard.tsx`, `BidSheet.tsx`, `JobStatusBadge.tsx`, `ProfileStats.tsx`, `RatingStars.tsx`, `VerificationBadge.tsx`.
- Maps: `HotspotMap.native.tsx`, `HotspotMap.web.tsx`, `MapPin.tsx`, `MapPinLayer.tsx`.
- Chat and moderation: `ChatBubble.tsx`, `ChatComposer.tsx`, `VoiceMessage.tsx`, `PhotoViewer.tsx`, `ReactionPicker.tsx`, `ReactionChips.tsx`, `ActionSheet.tsx`, `QuickReplyBar.tsx`, `JobRequestCard.tsx`.
- Profiles/settings: `Avatar.tsx`, `PortfolioGrid.tsx`, `NotificationToggleRow.tsx`.
- Miscellaneous: `LocationPermissionCard.tsx`, `ErrorBoundary.tsx`.

A repository-wide reference scan did not identify an obviously unreferenced exported component file. This is a lightweight static check, not a bundler-level dead-code proof.

### `hooks/`

**VERIFIED** — hooks include auth, jobs, bids, messages, profiles, reviews, location, theme, portfolio, requests, unread counts, notification preferences, and push registration. Important files include `hooks/useAuth.tsx`, `hooks/useJobs.ts`, `hooks/useMessages.ts`, `hooks/useProfile.ts`, `hooks/useLegalGate.ts`, and `hooks/usePushNotifications.ts`.

### `lib/`

**VERIFIED** — direct Supabase data-access modules and utilities:

- Core data: `lib/jobs.ts`, `lib/bids.ts`, `lib/messages.ts`, `lib/conversations.ts`, `lib/profiles.ts`, `lib/reviews.ts`, `lib/portfolio.ts`.
- Extensions: `lib/jobRequests.ts`, `lib/moderation.ts`, `lib/reactions.ts`, `lib/notificationPrefs.ts`, `lib/pushNotifications.ts`, `lib/legal.ts`.
- Platform/support: `lib/supabase.ts`, `lib/geolocation.ts`, `lib/reverseGeocode.ts`, `lib/navigationRef.ts`, `lib/theme.ts`, `lib/categories.ts`, `lib/chatTemplates.ts`, `lib/errorMessage.ts`, `lib/messageIds.ts`.
- Legal text: `lib/legal/terms.ts`, `lib/legal/privacy.ts`.

### `supabase/`

**VERIFIED**

- Sequential manually applied files from `phase1_rls_and_realtime.sql` through `phase28_publication_repair.sql`, including feature migrations and seed/repair scripts.
- `supabase/functions/send-push/index.ts` implements a Deno Edge Function for notification-outbox delivery.
- There is no checked-in Supabase CLI project configuration or timestamped `supabase/migrations/` history.

## Configuration and operational files

| Path | Status | Finding |
|---|---|---|
| `package.json` | VERIFIED | Scripts are only `start`, `web`, `ios`, and `android`. |
| `app.json` | VERIFIED | Expo app metadata exists; no EAS project ID or update/runtime policy. |
| `tsconfig.json` | VERIFIED | Extends Expo base and enables `strict`. |
| `babel.config.js` | VERIFIED | Loads `.env` through `react-native-dotenv` with `allowUndefined: true`. |
| `.env.example` | VERIFIED | Documents `SUPABASE_URL` and `SUPABASE_KEY`; no values are reproduced in this audit. |
| `scripts/verify-schema.mjs` | VERIFIED | Performs targeted live-schema checks for later phases. |
| `brazos-product-spec.md` | VERIFIED / stale | Still describes “Phase 1 core loop” while the code includes later messaging, moderation, requests, push, and legal phases. |

## Materially absent structure

**VERIFIED**

- No `eas.json`.
- No `.github/workflows/` or other CI configuration.
- No Docker/development-container configuration.
- No lint configuration or lint script.
- No Jest/Vitest/Detox/Maestro/Playwright test configuration.
- No test/spec source files; the product specification filename is not a test.
- No conventional application server directory.
- No checked-in generated Supabase TypeScript database types.
- No web-hosting configuration.
- No analytics or crash-reporting configuration.

## Generated/local-only directories

- `node_modules/` — installed dependency tree.
- `.expo/` — local Expo state.
- `.claude/` — local tool configuration; untracked entries are outside application behavior.
- `project-audit/` — documentation created by this audit only.

