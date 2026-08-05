# 04 — Design System Plan

## Current styling architecture (verified)

- `lib/theme.ts` — the in-app design tokens (colors, spacing) used by most
  marketplace screens/components.
- `lib/authTheme.ts` — a **second, parallel token set** (`authColors`,
  `authRadius`, `authShadows`, `authSpacing`, `authType`, `authSizes`) used
  exclusively by the auth-surface screens (Welcome, SignIn, CreateAccount,
  VerifyPhone, Setup, LaunchScreen). This is a deliberate two-palette split,
  confirmed from source comments (e.g. `App.tsx`'s tab-bar comment explaining
  why it hardcodes light tokens rather than using `useThemeColors()`), not an
  accidental duplication — the auth surface is ivory/emerald/gold, the in-app
  surface is the existing cream/green palette. This split is exactly the seam
  the Emerald system should formalize, not collapse.
- `hooks/useThemeColors.ts` — a `useColorScheme()`-driven hook, used
  inconsistently (see `App.tsx`'s explicit comment on why the tab bar
  deliberately does *not* use it, to avoid a recompute-on-flip bug and an
  Android `elevation`+`transparent` rendering bug).
- `hooks/useReducedMotion.ts` — respected throughout the new auth-surface
  screens (every entrance/pulse/shake animation branches on it). Not
  confirmed as consistently respected in the older marketplace screens —
  UNKNOWN, requires a targeted grep pass before broad animation work.
- Safe area: every screen wrapped in `SafeAreaView` per CLAUDE.md's existing
  rule; `MainTabs` owns the bottom inset math itself (see the extensive
  comment block in `App.tsx` deriving `TAB_BAR_CONTENT_HEIGHT`) — tab-bar
  children must not add their own bottom padding, matching CLAUDE.md.
- Keyboard avoidance: confirmed present in the auth-surface screens that need
  it; CLAUDE.md's `KeyboardAvoidingView` + `ScrollView` +
  `keyboardShouldPersistTaps="handled"` rule should be spot-checked on
  `PostJobScreen`/`ChatScreen` before heavy edits (not re-verified this pass).
- Icons: `@expo/vector-icons` (Ionicons), used throughout — no separate icon
  library to migrate.
- Fonts: no custom font loaded anywhere (confirmed — `LaunchScreen.tsx`'s
  wordmark explicitly falls back to platform serif "to avoid the font-loading
  flash a custom font would introduce"). Emerald's typography scale should be
  achievable with system fonts + `authType`'s existing scale, unless the atlas
  visually requires a specific typeface — VISUAL DETAIL UNVERIFIED, spot-check
  the PDF/PNGs for a named typeface before assuming system fonts suffice.
- Dark mode: **not supported** — `App.tsx` hardcodes `<StatusBar style="dark">`
  with a comment stating the app is light-only for now. Out of scope unless
  explicitly requested.
- Web-specific styling: frozen per CLAUDE.md (`*.web.tsx`, `public/`,
  `hosting/`, the web map implementation) — do not touch under this workstream.

## Visual comparison spot-check

`design-reference/02_welcome.png` and `06_permissions_mode.png` were compared
directly against the running `WelcomeScreen.tsx`/`SetupScreen.tsx`. Findings:

- Primary button: deep forest green (`authColors.emerald`/similar), pill
  radius, matches the atlas closely.
- Background: warm ivory, matches.
- Card surfaces: white with a soft border/shadow, matches the atlas's
  Setup-screen permission card and mode-choice cards almost exactly, down to
  the selected-card mint-tinted border treatment.
- No visually jarring deviation was found in this spot-check. The **launch**
  screen is the one atlas-acknowledged intentional departure (per the task's
  supplied context) and was not re-litigated here.

Remaining 62 screens: VISUAL DETAIL UNVERIFIED beyond the text/structure
extracted from the PDF and `screen_map.json` (purpose, actions, transitions —
these do not encode exact colors, spacing, or type scale). Before broad
visual migration work, spot-check each screen's PNG in
`design-reference/*.png` against its nearest current implementation, the same
way this pass did for Welcome/Setup.

## Proposed Emerald token categories (not implemented)

Extend `authTheme.ts`'s existing shape rather than inventing a third token
file — it is already the closer match to the Emerald palette:

- **Brand colors** — forest/emerald/gold, already named in `authColors`
  (`emerald`, `forest`, `gold`, `mint`, `mint2`). Exact hex values should be
  read from the atlas PDF/PNGs pixel-by-pixel before being treated as final;
  today's `authColors` values are a close approximation built by the prior
  session, not a verified extraction — treat as **proposed approximations
  requiring visual confirmation**, not ground truth.
- **Semantic colors** — `authColors.danger` exists; success/warning/info are
  not yet named as semantic tokens (some raw hex appears inline, e.g.
  `VerifyPhoneScreen.tsx`'s `#7A5A18` dev-banner text) — worth promoting to
  named tokens during the design-system pass.
- **Neutral scale** — `authColors.ink`/`muted`/`placeholder`/`line` already
  form a neutral scale; extend rather than replace.
- **Typography scale** — `authType.{eyebrow,display,title,body,note,badge,
  wordmark,tagline}` already exists and is used consistently across the new
  auth screens. Extend this scale to cover in-app screens rather than
  maintaining two unrelated scales long-term.
- **Spacing / radius / shadow scales** — `authSpacing`, `authRadius`,
  `authShadows` already exist and are used consistently. `lib/theme.ts`'s
  older equivalents should be reconciled into one scale as screens migrate,
  not kept as two permanently-diverging systems.
- **Icon sizes, control heights, gutters** — implicit today (e.g. `App.tsx`'s
  `TAB_ICON_SIZE = 29` is a hand-derived, commented constant, not a token).
  Worth promoting to named tokens once the tab bar becomes mode-aware (see
  [03](03_NAVIGATION_AND_ROUTE_PLAN.md)) so both mode's tab bars can't drift.
- **Card / form / navigation / status / loading / empty / error / permission-
  denied / offline / destructive-action / undo patterns** — partially present
  today (`ConfirmDialog` covers destructive-action confirmation;
  `useSetupPermissions.ts`'s three-state permission model — granted/denied/
  blocked/unavailable, each with a distinct action — is already a strong
  reusable pattern for every future OS-permission surface in the atlas, e.g.
  Screen 33 Track Worker's location permission, Screen 58's camera
  permission). No formal shared "EmptyState"/"ErrorState" component set was
  found reused system-wide; `project-audit/07_UI_PAGES_AND_COMPONENTS.md`
  flagged this as PARTIAL consistency in 2026-07-29 and it was not
  re-verified as fixed in this pass.

## UI Lab recommendation

Add a development-only route (not linked from any real navigator, reached via
a dev-menu shortcut or a temporary tab swapped in locally) that renders every
shared component in its full state matrix — loading/empty/error/permission-
denied/normal, both auth-surface and in-app palette variants. This gives a
single place to visually confirm token changes propagate correctly before
touching real screens, and is cheap to build once the token consolidation in
this plan has actually happened — build it **after** Phase 1's token work
lands, not before, so it has real tokens to render rather than becoming
another thing to migrate.

## What to build before broad screen migration

In order, each a prerequisite for the next:

1. Consolidate `authTheme.ts` + `lib/theme.ts` into one token set (or keep two
   deliberately-scoped files but make every value trace to the same
   underlying scale, e.g. one spacing unit).
2. Verify/correct the brand color hex values against the atlas source
   (PDF/PNGs), replacing the current approximations.
3. Promote the permission-row pattern (`useSetupPermissions.ts` +
   `SetupRow.tsx`) into a generic reusable component — it will be needed by
   every future OS-permission screen in the atlas.
4. Build the UI Lab route.
5. Only then begin reskinning individual screens toward Emerald, starting
   with whatever the next phase's vertical slice actually needs (see
   [07_PHASED_IMPLEMENTATION_PLAN.md](07_PHASED_IMPLEMENTATION_PLAN.md)).
