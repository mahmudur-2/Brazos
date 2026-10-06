---
paths:
  - "screens/**"
  - "components/**"
  - "ui/**"
  - "modes/**"
---

# Native UI mechanics

- Every screen is wrapped in `SafeAreaView` from
  `react-native-safe-area-context` with explicit `edges`. Screens inside the
  tab bar do not add bottom padding — MainTabs already owns that inset (there
  is a test asserting this).
- Any screen with a text input needs `KeyboardAvoidingView`
  (`behavior="padding"` on iOS only) around a `ScrollView` with
  `keyboardShouldPersistTaps="handled"`, and the submit control must stay
  reachable with the keyboard open.
- Use `lib/dialog.ts` (`alertAsync` / `confirmAsync`), never `Alert.alert` —
  `Alert` is a no-op on web and breaks control flow.
- Touch targets ≥ 44pt.
- Long titles and locations get `numberOfLines` plus a flex parent so they
  truncate instead of pushing siblings off-screen.
- Recoverable errors preserve user input. Failed uploads never clobber
  existing media.
- Destructive actions confirm; reversible ones get undo.
- Phones stored E.164.

## Design system and navigation (moved from CLAUDE.md, 2026-10-06)

Token source of truth: `ui/tokens.ts`. `lib/theme.ts` wraps it and is the
standard import for screens. `lib/authTheme.ts` is the one sanctioned
exception: the auth/launch flow renders on the emerald/ivory brand palette
rather than the in-app forest/cream one, so it carries auth-surface-only
values — and it takes its seven shared brand hues from `ui/tokens.ts`'s
`brand`, so there is still one definition of "forest". Never create a FOURTH
token surface. Never hardcode hex, radii, or spacing outside those three;
never import `ui/tokens.ts` directly in a new screen. Shared templates
provide loading / empty / error / offline / permission-denied states —
configure them, don't reinvent them.
Dual navigation trees: `navigation/CustomerRoot.tsx` and
`navigation/WorkerRoot.tsx` under `navigation/ModeShell.tsx`; `switchMode()`
and `ModeContext` live in `modes/ModeProvider.tsx`. The trees are separately
typed, so cross-tree navigation must be a compile error. Route param types
live in `lib/navigation.ts`.

Keyboard (supersedes the `KeyboardAvoidingView` line above; the 2026-10 fix run, F22): a
screen with a text input uses react-native-keyboard-controller's `KeyboardAvoidingView`, or the
shared `KeyboardRisingColumn` (`components/KeyboardRisingColumn.tsx`).
