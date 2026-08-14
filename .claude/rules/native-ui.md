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
