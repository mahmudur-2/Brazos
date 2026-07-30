# Test, Build, and Runtime Results

Audit environment: Windows / PowerShell, Node/npm already installed, local date 2026-07-29.

## Result summary

| Check | Result | Classification | What it proves |
|---|---|---|---|
| Git status | PASS | VERIFIED | Working tree state was captured before audit docs. |
| Dependency tree | PASS | VERIFIED | Installed top-level packages resolve. |
| Expo dependency compatibility | PASS | VERIFIED | Current dependency versions match Expo SDK 54 expectations. |
| Configured TypeScript | PASS | VERIFIED | No errors under repository `tsconfig.json`. |
| Stricter unused-symbol TypeScript | FAIL | VERIFIED | Nine unused declarations/imports are present. |
| Lint | NOT AVAILABLE | UNKNOWN | No script/config; nothing was claimed as passed. |
| Unit tests | NOT AVAILABLE | UNKNOWN | No suite/config. |
| Integration tests | NOT AVAILABLE | UNKNOWN | No suite/config. |
| E2E tests | NOT AVAILABLE | UNKNOWN | No suite/config. |
| Live schema verifier | PASS | VERIFIED | Targeted phase 15–25 objects exist in connected Supabase. |
| Local web dev runtime | PASS WITH ERROR | PARTIALLY VERIFIED | App renders live data; push cold-start call errors on web. |
| Production export, all platforms | PASS | VERIFIED | JS/Hermes bundles can be produced. |
| Native binary/archive | NOT RUN | UNKNOWN | No Android/iOS native compilation/signing. |
| Physical-device flows | NOT RUN | UNKNOWN | Permissions, map, camera, audio, push not established. |

## Commands and exact outcomes

### Dependency tree

```powershell
npm.cmd ls --depth=0
```

**PASS.** All declared top-level dependencies resolved in the installed tree.

### Expo compatibility

```powershell
npx.cmd expo install --check
```

The sandboxed attempt could not reach the package service. The identical read-only check was retried with network approval and returned:

```text
Dependencies are up to date
```

This is compatibility validation, not a vulnerability audit.

### Configured TypeScript

```powershell
npx.cmd tsc --noEmit --pretty false
```

**PASS, zero diagnostics.**

### Diagnostic unused-symbol TypeScript

```powershell
npx.cmd tsc --noEmit --noUnusedLocals --noUnusedParameters
```

**FAIL, nine findings:**

- `App.tsx`: `BASE_TAB_ICON_SIZE`
- `App.tsx`: `BASE_TAB_LABEL_FONT_SIZE`
- `App.tsx`: `BASE_TAB_BAR_CONTENT_HEIGHT`
- `components/HotspotMap.native.tsx`: `DARK_MAP_STYLE`
- `components/HotspotMap.web.tsx`: `Pressable`
- `components/PhotoViewer.tsx`: `vx`
- `screens/ChatScreen.tsx`: `ScrollView`
- `screens/ChatScreen.tsx`: `CHAT_TEMPLATES`
- `screens/ChatScreen.tsx`: `isOpenRequest`

The normal check passes because unused-symbol checks are not enabled in `tsconfig.json`.

### Live schema verifier

```powershell
node scripts\verify-schema.mjs
```

The sandboxed attempt was denied network access. The same read-only verifier was retried with approval and **PASSED**. It confirmed its control and later-phase checks, including:

- job photo column control;
- bid count;
- message audio and conversation audio;
- completion photos;
- portfolio items and worker stats;
- job requests and their RPCs;
- portfolio freeform marker;
- push tables/functions;
- legal acceptance objects;
- job enum marker;
- unsent messages/view/RPC.

Not covered: baseline core table creation, exhaustive columns/indexes, all RLS/storage policies, Realtime delivery, Edge Function deployment, cron scheduling, data invariants, or end-to-end behavior.

### Production export

```powershell
npx.cmd expo export --platform all --output-dir <temporary-directory-outside-repository>
```

The initial sandbox run failed because `hermesc.exe` could not execute under sandbox permissions. The identical export was retried with approval and **PASSED** to:

```text
C:\Users\mdmah\AppData\Local\Temp\brazos-audit-export-43dd99b77db34bd198fa15effb680738
```

Observed approximate bundle sizes:

- web JavaScript: 2.11 MB;
- iOS Hermes bytecode: 3.98 MB;
- Android Hermes bytecode: 3.99 MB.

These are exports, not signed native binaries or store artifacts.

## Local app runtime

The app is running at:

```text
http://127.0.0.1:8081/
```

The dev root returned HTTP 200. The development bundle was approximately 6.08 MB across 975 modules. An existing authenticated session restored and live Supabase data rendered.

### Runtime areas observed

- Home dashboard.
- Post-job form.
- Open-job browse and job details/bid form.
- Map web fallback, hotspot counts, and cell job list.
- My Jobs filters, populated lists, and empty state.
- Completed worker job detail and existing review.
- Messages inbox and an existing thread with voice/reply/unsent UI.
- Profile, stats, verification badge, and empty portfolio.
- Notification settings/configuration error.
- Admin report queue empty state.

No write or side-effecting user action was submitted.

### Reproduced console failure

**BROKEN**

`hooks/usePushNotifications.ts` calls Expo Notifications cold-start response retrieval on web:

```text
[push] getLastNotificationResponseAsync failed
UnavailabilityError: ExpoNotifications.getLastNotificationResponse is not available on web
```

The exception is caught/logged and did not stop rendering, but it is a real platform error.

### Runtime warnings

- Expo push-token listeners are not fully supported on web.
- React Native Web warns that `shadow*` style props are deprecated in favor of `boxShadow`.
- React Native Web warns that the `pointerEvents` prop is deprecated in favor of `style.pointerEvents`.

## What remains unverified

- Clean install on a machine without `node_modules`.
- Fresh environment created only from checked-in database source.
- Fresh sign-up/login/email confirmation/password recovery.
- Any mutating marketplace flow.
- Two-account authorization, messaging, Realtime, and read receipts.
- Offline/reconnection behavior.
- Native Android/iOS build, install, permissions, map, media, notification, deep link, or background behavior.
- Edge Function/cron/push delivery.
- Performance, load, accessibility, security, and dependency-vulnerability testing.
- Store submission, OTA updates, and rollback.

