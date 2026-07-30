# Bugs and Incomplete Work

Priority meanings: P0 blocks reproducible/reliable release; P1 is high-risk correctness/security; P2 is material quality/maintainability; P3 is cleanup.

## Confirmed and high-confidence findings

| Priority | Classification | Finding | Exact evidence |
|---|---|---|---|
| P0 | BROKEN | A blank Supabase project cannot be reconstructed from repository SQL. | Core `profiles`, `jobs`, `bids`, `reviews` creation is absent; `supabase/phase1_rls_and_realtime.sql` and later phases assume them. |
| P0 | BROKEN | Push cold-start response handling invokes an unavailable web API. | `hooks/usePushNotifications.ts`; reproducible `getLastNotificationResponseAsync` `UnavailabilityError`. |
| P0 | PARTIAL | App is not linked to an EAS project, blocking production push token setup. | `app.json` lacks `extra.eas.projectId`; `NotificationSettingsScreen` runtime reported the gap. |
| P1 | PARTIAL | Bid acceptance is non-atomic. | `lib/bids.ts::acceptBid` performs separate job and bid updates and comments on lack of transaction. |
| P1 | PARTIAL | Job/location writes are non-atomic. | `lib/jobs.ts::createJob` and `updateJob` perform separate writes. |
| P1 | PARTIAL | Storage policies are too broadly bucket-scoped. | `supabase/phase3_storage.sql`; authenticated writes are not consistently owner/path/domain bound. |
| P1 | PARTIAL | Broad profile reads may expose private fields. | profile RLS plus `Profile` phone field and `select('*')` usages; deployed grants/view need confirmation. |
| P1 | PARTIAL | Legal acceptance gate fails open on backend/network failure. | `hooks/useLegalGate.ts`. |
| P1 | PARTIAL | Seed jobs are assigned to existing users and can appear authentic/user-owned. | phases 22–24/27 and connected runtime data. |
| P1 | PARTIAL | Push backend deployment is undocumented/unverifiable. | `supabase/phase20_push_notifications.sql`, `supabase/functions/send-push/index.ts`; no EAS/Supabase deployment config. |
| P2 | PARTIAL | Primary actions lack reliable web accessibility semantics. | Runtime accessibility snapshot exposed many Pressables/cards/actions as generic nodes. |
| P2 | PARTIAL | Schema/API typing is weak and drift-prone. | `select('*')`, `any`, broad `string` statuses, no generated Supabase types. |
| P2 | PARTIAL | Profile save can silently degrade to a legacy field subset. | fallback path in `screens/ProfileScreen.tsx`. |
| P2 | PARTIAL | Navigation typing is bypassed and object params can become stale. | `App.tsx`, `lib/navigationRef.ts`, casts in `ChatScreen.tsx`/`JobDetailScreen.tsx`. |
| P2 | BROKEN quality gate | Stricter unused-symbol check fails with nine diagnostics. | See `09_TEST_BUILD_AND_RUNTIME_RESULTS.md`. |
| P2 | PARTIAL | Product documentation is materially stale. | `brazos-product-spec.md` says Phase 1/core work while migrations reach phase 28. |
| P2 | PARTIAL | No automated test, lint, CI, or observability safety net exists. | `package.json` and absent configs/directories. |
| P2 | PARTIAL | Dark theme implementation is inconsistent/incomplete. | hardcoded colors, limited `useThemeColors`, unused `DARK_MAP_STYLE`. |
| P3 | PARTIAL | React Native Web emits deprecation warnings. | `shadow*` and `props.pointerEvents` runtime warnings. |

## Incomplete notification system

The notification stack has client UI, preferences, token/outbox schema, triggers, and Edge Function source, but it is not a complete verified product feature.

Missing or unverified:

- EAS project linkage;
- native development/production build;
- permission denial/retry behavior on devices;
- token registration and rotation;
- deployed Edge Function and service secret;
- scheduled invocation;
- Expo receipt polling and invalid-token cleanup;
- delivery monitoring/dead-letter operations;
- deep-link routing from terminated/background state;
- web platform guard.

State: **BROKEN** on web, **UNKNOWN** end to end on native.

## Incomplete state and error handling

- Several operations use alerts/local spinners without a consistent retry model.
- No offline indicator or queued mutations.
- No global async error tracking.
- No stale-data/reconnect indication for Realtime.
- No optimistic-update rollback standard.
- Empty states exist on major inspected lists, but mutation failure and partial-success states are not comprehensively designed.
- Multi-step writes can leave orphaned domain/storage records.

## Hardcoded, fake, and placeholder behavior

- Seed SQL inserts high-volume realistic mock jobs.
- Job/request category constraints were repeatedly changed in later phases, indicating earlier hardcoded category drift.
- Verification is a displayed status, not an implemented real-world verification process.
- Language preference does not translate the interface or bids.
- Budget/agreed price is display-only and not a payment.
- Static legal documents use draft version identifiers and should not be treated as final counsel-approved production documents.

## Dead, stale, duplicate, and questionable code

### Dead/unused

The diagnostic TypeScript check found unused constants/imports/locals in:

- `App.tsx`
- `components/HotspotMap.native.tsx`
- `components/HotspotMap.web.tsx`
- `components/PhotoViewer.tsx`
- `screens/ChatScreen.tsx`

No clearly unused exported component file was identified by the lightweight reference scan.

### Duplicate/inconsistent

- Repeated navigation registrations across tab stacks.
- Repeated local data-loading/error patterns instead of a shared query layer.
- Mixed shared primitives and screen-local button/card/state implementations.
- Mixed theme-token and hardcoded color usage.
- Repeated broad row mapping and `select('*')`.
- Migration/seed/repair responsibilities mixed in one phase sequence.

### Questionable architecture

- Client orchestrates transactional marketplace state.
- Public storage URLs and broad bucket policies are used for user-generated content.
- Direct public Nominatim calls are made from every client.
- Admin UI access is hidden by profile state while the route remains registered; server checks must remain the authority.
- The product source of truth is split across stale prose, manual phases, live remote schema, and application inference.

## Not found

- No permanently disabled primary button.
- No obviously empty submission handler.
- No explicit `TODO`, `FIXME`, `HACK`, or `WIP` marker.
- No clearly dead route was proven.

These “not found” statements are limited to static inspection and the primary runtime paths audited.

