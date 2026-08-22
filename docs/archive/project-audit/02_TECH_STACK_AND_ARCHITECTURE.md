# Tech Stack and Architecture

## Runtime stack

| Layer | Technology | Evidence | Status |
|---|---|---|---|
| Application | Expo managed workflow, SDK `54.0.36` | `package.json`, `app.json` | VERIFIED |
| UI runtime | React Native `0.81.5`, React `19.1.0`, React Native Web | `package.json` | VERIFIED |
| Language | TypeScript with strict mode | `tsconfig.json` | VERIFIED |
| Navigation | React Navigation native stack + bottom tabs | `App.tsx` | VERIFIED |
| Backend-as-a-service | Supabase Auth, PostgREST, RPC, Realtime, Storage | `lib/supabase.ts`, `lib/*.ts`, `supabase/*.sql` | VERIFIED |
| Local persistence | AsyncStorage for Supabase session | `lib/supabase.ts` | VERIFIED |
| Native capabilities | Expo Location, Image Picker, AV/audio, File System, Notifications, Device, Constants | `package.json`, hooks/components | VERIFIED in source; device behavior UNKNOWN |
| Native map | `react-native-maps` | `components/HotspotMap.native.tsx` | INFERRED; not run on a native device |
| Web map | List-based hotspot fallback | `components/HotspotMap.web.tsx` | VERIFIED at runtime |
| External geocoder | OpenStreetMap Nominatim over client-side `fetch` | `lib/reverseGeocode.ts` | PARTIALLY VERIFIED |
| Push delivery | Expo Push Service through a Supabase Edge Function | `supabase/functions/send-push/index.ts` | PARTIAL / deployment UNKNOWN |

`npx expo install --check` reports that installed package versions are compatible with the project's current SDK.

## Expo version note

The repository instruction requests consultation of the Expo SDK 56 documentation. The project itself is still on Expo SDK 54. Official SDK 56 documentation describes a newer React Native/React baseline than this repository. This audit made no upgrade. Any future implementation must decide explicitly whether to stabilize SDK 54 first or upgrade through Expo's supported process; SDK 56 examples must not be pasted into this SDK 54 project without compatibility review.

## Application topology

```text
index.ts
  -> registerRootComponent(App)
App.tsx
  -> ErrorBoundary
  -> AuthProvider
  -> NavigationContainer
     -> AuthScreen when no session
     -> LegalGateScreen when acceptance is required
     -> Main bottom tabs
        -> stack screens
           -> hooks
              -> lib data modules
                 -> Supabase PostgREST / RPC / Realtime / Storage
```

There is no separate application API server. Most client features query Supabase directly, and database authorization is therefore a primary security boundary.

## Navigation architecture

**VERIFIED in `App.tsx`**

- Home stack: `HomeMain`, `PostJob`, `BrowseJobs`, `JobDetail`, `WorkerProfile`.
- Map stack: `MapMain`, `CellJobs`, `JobDetail`, `PostJob`, `WorkerProfile`.
- My Jobs stack: `MyJobsHub`, `ClientJobDetail`, `WorkerJob`, `JobDetail`, `Chat`, `PostJob`, `WorkerProfile`.
- Messages stack: `MessagesInbox`, `Chat`, `PostJob`, `WorkerProfile`.
- Profile stack: `ProfileMain`, `AdminReports`, `NotificationSettings`, `LegalDocument`.

The same route components are registered in several stacks. This keeps tab histories independent but duplicates navigation declarations and encourages `as any` casts for route transitions.

## State and data flow

**VERIFIED**

- `hooks/useAuth.tsx` owns session/profile/auth operations using React context.
- Domain hooks use local `useState`/`useEffect` and call individual functions under `lib/`.
- Realtime listeners are installed for jobs, bids, messages, reactions, job requests, and unread state.
- There is no shared query cache, normalized store, offline mutation queue, or global server-state library.
- Domain modules use Supabase queries and RPCs directly. Several return manually mapped rows; many use `select('*')` and `any`.
- Navigation frequently carries full `Job`/`OpenJob` objects, so destination screens may initially render route snapshots before refetching.

## Platform-specific behavior

| Area | Native | Web | Status |
|---|---|---|---|
| Hotspot map | `react-native-maps` map and pins | Scrollable hotspot list | Web VERIFIED; native UNKNOWN |
| Current location | Expo Location permissions/device location | Browser/Expo location behavior | UNKNOWN on devices; source exists |
| Chat camera/microphone | Media controls available | Camera/mic controls intentionally hidden | Web behavior VERIFIED |
| Push | Native token registration intended | Partially unsupported and currently errors | BROKEN on web; native delivery UNKNOWN |
| Bundles | Hermes bytecode export | JavaScript web bundle | All exported successfully |

## Styling and design system

`lib/theme.ts` contains colors, spacing, type, radius, and shadows. `hooks/useThemeColors.ts` provides theme-derived colors, but adoption is partial. Large screen-local `StyleSheet` blocks and fixed light palette values remain throughout `App.tsx` and screens. `components/HotspotMap.native.tsx` defines an unused `DARK_MAP_STYLE`, and code comments explicitly defer complete theming. State presentation is partly centralized through `LoadingScreen`, `ErrorState`, and `EmptyState`, but screens also duplicate state patterns.

## Architectural strengths

- Platform-specific map files keep native-only map code out of web.
- Domain operations are separated from most screen rendering.
- Sensitive job coordinates are separated from public job rows in later schema phases.
- Realtime and notification systems are modeled explicitly.
- Major business concepts have typed client interfaces.
- An app-level `ErrorBoundary` exists.

## Architectural concerns

- The database is not reproducible from repository source.
- Business transactions are often orchestrated by the client instead of transactional RPCs.
- Generated Supabase types are absent; raw `any`, `string` statuses, and `select('*')` weaken schema guarantees.
- Every hook manages its own fetch/retry/cache lifecycle.
- No environment-tier strategy, automated deployment, observability, or test architecture exists.
- Public storage is an independent attack/cost surface and is not tightly bound to domain ownership.
- The product specification and migration process do not function as a current source of truth.

