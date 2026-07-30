# UI Pages and Components

## Route inventory

| Route / screen file | Responsibility | Data dependencies | State / evidence |
|---|---|---|---|
| `screens/AuthScreen.tsx` | Login/sign-up forms | `hooks/useAuth.tsx` | PARTIAL; UI/source inspected, mutation not run |
| `screens/LegalGateScreen.tsx` | Terms/privacy acceptance | `hooks/useLegalGate.ts`, `lib/legal.ts` | PARTIAL; gate/schema exists, fail-open risk |
| `screens/HomeScreen.tsx` | Dashboard and nearby/open work entry points | job/profile hooks | COMPLETE surface; live runtime verified |
| `screens/PostJobScreen.tsx` | Create-job form | `lib/jobs.ts`, storage/location | PARTIAL; full UI verified, submission not run |
| `screens/BrowseJobsScreen.tsx` | Open-job feed | `hooks/useJobs.ts` | COMPLETE surface; live runtime verified |
| `screens/JobDetailScreen.tsx` | Job details and bid form | jobs/bids/profiles | PARTIAL; reads/UI verified, bid not run |
| `screens/MapScreen.tsx` | Hotspot discovery | hotspot RPC/location | PARTIAL; web verified, native unknown |
| `screens/CellJobsScreen.tsx` | Jobs within selected hotspot cell | `jobs_in_cell` | COMPLETE surface; live runtime verified |
| `screens/MyJobsScreen.tsx` | Client/worker job status lists | job hooks | PARTIAL; lists/empty state verified |
| `screens/ClientJobDetailScreen.tsx` | Client bid/job management | jobs/bids/chat | PARTIAL; actions not executed |
| `screens/WorkerJobScreen.tsx` | Worker status/completion/review | jobs/messages/reviews | PARTIAL; completed case rendered |
| `screens/MessagesScreen.tsx` | Conversation inbox | `lib/conversations.ts` | PARTIAL; runtime read verified |
| `screens/ChatScreen.tsx` | Job chat, reactions, requests, moderation | messages/reactions/requests/storage | PARTIAL; read path verified |
| `screens/ProfileScreen.tsx` | Own profile, portfolio, settings/admin/legal links | profiles/portfolio/auth | PARTIAL; runtime read verified |
| `screens/WorkerProfileScreen.tsx` | Public worker profile/stats/reviews | profiles/reviews/portfolio | PARTIAL; source/navigation inspected |
| `screens/AdminReportsScreen.tsx` | Report queue and enforcement | moderation RPCs | PARTIAL; empty queue verified, actions not run |
| `screens/NotificationSettingsScreen.tsx` | Push preferences and setup status | notification prefs/push | BROKEN/PARTIAL; no EAS linkage |
| `LegalDocument` registered in `App.tsx` | Terms/privacy text viewer | `lib/legal/*.ts` | COMPLETE static surface |

## Navigation observations

- **VERIFIED:** auth and legal gates sit above bottom-tab navigation.
- **VERIFIED:** bottom tabs are Home, Map, My Jobs, Messages, and Profile.
- **VERIFIED:** job/profile/chat routes are repeated across stacks.
- **PARTIAL:** route typing exists but `as any` and `navigationRef<any>` bypass it in several places.
- **RISK:** whole job objects are passed as params; a destination can show a stale snapshot until it refetches.
- No route was found that is obviously registered and completely unreachable, but this was not a formal graph proof.

## Component system

### Shared primitives

`Button`, `Card`, `Input`, `FormInput`, `SafeScreen`, `ScreenHeader`, `KeyboardScreen`, `LoadingScreen`, `ErrorState`, `EmptyState`, and `SectionHeader` provide a useful foundation.

**PARTIAL consistency:** many screens use these primitives, while others reproduce loading/error/empty blocks and screen-local interaction styles.

### Job/profile components

`JobCard`, `BidCard`, `BidSheet`, `JobStatusBadge`, `CategoryIcon`, `Avatar`, `ProfileStats`, `RatingStars`, `VerificationBadge`, and `PortfolioGrid` represent domain UI. Runtime inspection confirmed job cards, category/status badges, profile statistics, review rendering, and the verification badge.

### Chat components

`ChatBubble`, `ChatComposer`, `VoiceMessage`, `PhotoViewer`, `ReactionPicker`, `ReactionChips`, `QuickReplyBar`, `ActionSheet`, and `JobRequestCard` provide a comparatively rich messaging surface. Existing voice, reply, quick-reply, and unsent states rendered; interactive mutations remain unverified.

### Map components

`HotspotMap.native.tsx` and `HotspotMap.web.tsx` deliberately diverge. The web version is an accessible content fallback in concept, but it is not a geographic map. `MapPin` and `MapPinLayer` centralize some visual treatment.

## Loading, error, and empty states

**PARTIALLY VERIFIED**

- Reusable `LoadingScreen.tsx`, `ErrorState.tsx`, and `EmptyState.tsx` exist.
- My Jobs displayed an empty-state message for an empty status group.
- Profile displayed an empty portfolio state.
- Admin Reports displayed an empty queue state.
- Data hooks generally expose loading/error, but patterns are not uniform.
- Mutating operations often rely on local alerts and disabled/loading buttons; network/offline recovery was not tested.
- Skeletons, retry policies, stale-data indicators, and offline mutation states are missing.
- No app-wide asynchronous error/reporting boundary exists beyond the render `ErrorBoundary`.

## Disabled and unfinished handlers

- No permanently `disabled={true}` primary action was found.
- No obvious empty production submission handler was found.
- Backdrop handlers such as `onPress={() => {}}` in `ActionSheet.tsx`/`ReactionPicker.tsx` appear to stop event propagation, not represent disabled features.
- Camera/microphone actions are intentionally absent on web.
- Push enablement is effectively blocked by missing EAS project configuration.
- No explicit `TODO`/`FIXME` marker was found; unfinished work is inferred from missing systems and comments.

## Accessibility

**PARTIAL / high-risk**

Browser accessibility snapshots exposed many Pressable/card/action surfaces as generic nodes rather than buttons. Tabs and text inputs had useful semantics, but major card and action interactions often lacked a clear `button` role in React Native Web.

Files requiring focused review:

- `components/Button.tsx`
- `components/Card.tsx`
- `components/JobCard.tsx`
- `components/BidCard.tsx`
- `components/ActionSheet.tsx`
- `components/ReactionPicker.tsx`
- screen-level `Pressable` uses throughout `screens/`

No systematic labels/hints, focus order, keyboard navigation, contrast, dynamic type, reduced motion, or native screen-reader test was performed. Accessibility must remain **PARTIALLY VERIFIED**, not passed.

## Visual/design consistency

- Theme tokens exist in `lib/theme.ts`.
- Theme-aware colors are not consistently used.
- `App.tsx` and numerous screens hardcode a light palette.
- `components/HotspotMap.native.tsx::DARK_MAP_STYLE` is currently unused.
- The browser logged React Native Web deprecation warnings for `shadow*` properties and `props.pointerEvents`.
- Large local style blocks and extensive explanatory comments make visual changes diffuse.

## Static cleanup findings

A stricter diagnostic TypeScript run (`--noUnusedLocals --noUnusedParameters`) reported:

- `App.tsx`: `BASE_TAB_ICON_SIZE`, `BASE_TAB_LABEL_FONT_SIZE`, `BASE_TAB_BAR_CONTENT_HEIGHT`.
- `components/HotspotMap.native.tsx`: `DARK_MAP_STYLE`.
- `components/HotspotMap.web.tsx`: unused `Pressable` import.
- `components/PhotoViewer.tsx`: `vx`.
- `screens/ChatScreen.tsx`: unused `ScrollView`, `CHAT_TEMPLATES`, `isOpenRequest`.

Configured TypeScript still passes because these unused checks are not enabled.

