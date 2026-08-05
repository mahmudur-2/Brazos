# 09 — Setup Implementation Handoff (Emerald Foundation + Screen 06)

**Read this before starting the bounded coding task.** It is a specification,
not an instruction to begin — the next Claude session executes it (see
[10_NEXT_CLAUDE_PROMPT.md](10_NEXT_CLAUDE_PROMPT.md)), this audit does not.

## Starting-point correction

The task context that motivated this audit describes Screen 06 (Setup) as
"the next atlas screen under consideration," implying greenfield work. **That
undersells what exists.** `screens/SetupScreen.tsx` and
`screens/LegalGateScreen.tsx`, on this branch, already implement almost
everything atlas Screen 06 specifies: permission rows (location,
notifications) with a real three/four-state model (`useSetupPermissions.ts`),
a legal-review status row, a "Start in" mode choice with two cards, and a
"Finish setup" CTA — verified structurally and visually near-identical to
`design-reference/06_permissions_mode.png` (see [01](01_CURRENT_APP_INVENTORY.md)
§4 and [04](04_DESIGN_SYSTEM_PLAN.md)'s visual comparison). **This is a
refinement task, not a build-from-scratch task.**

## Existing files likely involved

| File | Role |
|---|---|
| `screens/SetupScreen.tsx` | The screen itself |
| `screens/LegalGateScreen.tsx` | Pushed sub-route, unchanged unless legal copy changes |
| `screens/OnboardingFlow.tsx` | Stack shell wiring Setup → LegalGate |
| `hooks/useSetupStatus.ts` | Gates whether Setup shows at all |
| `hooks/useSetupPermissions.ts` | Location/notification permission state machine |
| `hooks/useLegalGate.ts` | Legal acceptance state |
| `lib/setupState.ts` | Pure record shape + parsing (`LandingPreference`, `SetupRecord`) |
| `lib/setupStorage.ts` | AsyncStorage read/write |
| `lib/setupLanding.ts` | One-shot post-setup navigation hint |
| `components/SetupChoiceCard.tsx`, `components/SetupRow.tsx` | Presentational pieces |
| `lib/authTheme.ts` | Token source for this screen family |
| `App.tsx::RootNavigator` | Consumes `setup.state`/`legal.state` to decide what renders |
| `tests/setupOnboarding.test.mjs` | Existing coverage — read before editing to avoid duplicating assertions |

## Proposed files to create

- None required to ship the visual/token refinement below. Only create a new
  file if the mode-persistence decision (see next section) requires a new
  `lib/` module — do not create speculative files.

## Proposed files to modify

- `screens/SetupScreen.tsx`, `components/SetupChoiceCard.tsx`,
  `components/SetupRow.tsx` — only if the atlas color/spacing spot-check
  turns up a real deviation once hex values are read directly from the atlas
  source (see [04](04_DESIGN_SYSTEM_PLAN.md) — today's `authColors` values are
  **proposed approximations**, not yet verified pixel-exact).
- `lib/setupState.ts` / `lib/setupStorage.ts` — **only** if the mode-
  persistence decision below is made; otherwise leave untouched.

## The one real open decision: does Setup need to write a durable `mode`?

This audit found the gap, does not resolve it — that's a product decision for
the user, not something to decide inside a bounded coding handoff. State it
plainly for the next session:

- **Today:** `landing` (`'hire' | 'work'`) is a one-time navigation hint,
  device-local, consumed once. There is no persistent customer/worker mode
  anywhere, because the dual-mode navigation itself doesn't exist yet
  ([03_NAVIGATION_AND_ROUTE_PLAN.md](03_NAVIGATION_AND_ROUTE_PLAN.md)).
- **If Screen 06 work stays scoped to visual/token refinement only:** no
  schema or storage change is needed. Recommended for the *next* session,
  since the mode split itself is bigger, separate work (Phase 2/3 in
  [07](07_PHASED_IMPLEMENTATION_PLAN.md)) that touches navigation, not just
  this one screen.
- **If the user wants Setup to establish real mode persistence now:** that
  requires either (a) a new `profiles` column via a hand-written
  `supabase/phase41_*.sql` migration (out of scope for a docs-only audit —
  write it, don't run it), or (b) extending `lib/setupState.ts`'s existing
  AsyncStorage record with a `mode` field as an interim device-local step.
  **Recommend (b) first** — it's the smaller, lower-risk change, consistent
  with `setupState.ts`'s own documented rationale for why completion lives on
  the device today (no onboarding column exists, migrations are explicitly
  out of scope for casual changes).

**Default recommendation for the next coding session: keep this handoff
scoped to (1) verifying/correcting the Emerald token values used by
`SetupScreen`/`LegalGateScreen` against the actual atlas source, and (2) not
touching the mode-persistence question at all.** That question belongs to
Phase 2's navigation work, not a token-and-polish pass, and mixing them
would violate this repository's "smallest safe change" rule.

## Existing behavior to preserve (do not regress)

- Permissions are **read, never requested on mount** — `useSetupPermissions`
  burns the OS's one-shot iOS prompt only on explicit tap. Do not add an
  auto-request-on-mount "optimization."
- The legal row reflects `useLegalGate()`'s state and is never a second
  source of truth — `SetupScreen` takes `legalComplete` as a prop from
  `App.tsx`'s single `useLegalGate()` instance, per the existing code comment.
  Do not instantiate a second `useLegalGate()` inside `SetupScreen`.
- `writeSetupRecord` failure must leave the user retryable, not silently
  stuck — the existing error-message/no-navigation-on-failure behavior is
  correct and tested; preserve it.
- Navigation follows persistence, never the reverse (`handleFinish`'s
  ordering) — preserve this ordering in any edit.
- Sign-out remains the only escape from a mandatory step — do not add a skip
  button that isn't there today (the atlas doesn't show one either).
- Reduced-motion handling (`useReducedMotion`) must continue to collapse
  every animation to an instant state, not just a faster one.
- `KeyboardAvoidingView`/safe-area/44pt-touch-target rules from CLAUDE.md
  already hold on this screen — don't regress them while touching styles.

## Setup-screen UI requirements (from the atlas + current implementation)

- Location permission row: title, subtitle, live state-driven control
  (switch/spinner/dash), state-appropriate subtitle text (denied vs blocked
  vs unavailable) — **already implemented**, preserve exactly.
- Notification permission row: same shape — **already implemented**.
- Legal/Terms row: navigates to `LegalGateScreen` pushed as a route, shows a
  completion pulse animation exactly once (not on every mount) —
  **already implemented**.
- Mode choice: two cards, single-select, radiogroup accessibility role —
  **already implemented**.
- Primary CTA disabled until `legalComplete && !saving` — **already
  implemented**.
- Error state: inline message in a fixed-height slot so the layout doesn't
  jump — **already implemented**.
- Loading state: button's own `loading` prop during the storage write —
  **already implemented**.
- Permission-denied / blocked state: distinct subtitle + action that opens
  Settings instead of a dead switch — **already implemented**, this is
  arguably ahead of what the atlas spec describes and should be treated as
  the reference pattern for every other future permission screen (Track
  Worker's location permission, completion upload's camera permission, etc).
- Accessibility: `accessibilityLabel`/`accessibilityHint` present on every
  interactive element, `AccessibilityInfo.announceForAccessibility` on state
  changes — **already implemented**, preserve.
- Small-device behavior: not specifically hardened on this screen the way
  `LegalGateScreen` handles a `compact` breakpoint under 700pt height — worth
  a small-screen check, not confirmed either way this pass.

## Test requirements

- Extend `tests/setupOnboarding.test.mjs` rather than creating a parallel
  file — read it first to see what's already asserted.
- Any token-value change should not require new test coverage (styling is
  not typically unit-tested here) — but if `SetupChoiceCard`/`SetupRow`'s
  prop contracts change, update or add assertions for those.
- Re-run `npm run verify` (lint + test) before considering the task done; the
  only allowed failure is the pre-existing `tests/pwa.test.mjs` one.

## Definition of done

- Emerald color/spacing values used by `SetupScreen`/`LegalGateScreen`
  verified against the actual atlas source (not left as unverified
  approximations), OR explicitly confirmed already correct with the
  comparison method documented (e.g. a pixel color pick from
  `design-reference/06_permissions_mode.png`).
- No behavior regression against the "Existing behavior to preserve" list
  above.
- `npm run verify` clean except the known pre-existing PWA failure.
- No mode-persistence work performed unless the user explicitly expanded
  scope to include it.
- No application code outside the listed files touched.

## Forbidden changes (repeat of standing rules, scoped to this task)

- No `git push`, no branch switch, no deploy.
- No Supabase migration executed against production; a new phase file may be
  *written* only if the mode-persistence expansion was explicitly authorized.
- No edits to `public/`, `hosting/`, `dist/`, `WEB_DEPLOYMENT.md`, the service
  worker, PWA bootstrap, web deployment config, `*.web.tsx` files, or the web
  map implementation.
- No package installs.
- No renaming of existing routes/exports "while in there."

## Proposed commit boundary

One commit: `polish(onboarding): align Setup screen tokens with Emerald atlas`
(or equivalent) — token/visual changes only, scoped to the files listed
above. If the mode-persistence question is separately authorized, that is a
**second, separate commit**, not folded into this one.
