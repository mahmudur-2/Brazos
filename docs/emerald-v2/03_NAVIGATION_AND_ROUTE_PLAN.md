# 03 — Navigation and Route Plan

## Current architecture (verified from `App.tsx` + `lib/navigation.ts`)

```
App
 └─ AuthProvider
     └─ LaunchGate (branded overlay, not a route — crossfades once per process)
         └─ NavigationContainer
             └─ RootNavigator, chosen by (user, legal, setup) state:
                 ├─ no user               → AuthFlow (stack: Welcome, SignIn, EmailSignIn,
                 │                          CreateAccount, EmailCreateAccount, VerifyPhone)
                 ├─ setup incomplete      → OnboardingFlow (stack: Setup, LegalGate pushed)
                 ├─ legal needs_acceptance→ LegalGateScreen alone (existing user, stale version)
                 └─ else                  → MainTabs (5 bottom tabs, each its own stack):
                                             Home, Map, MyJobs, Messages, Profile
```

Every job/profile/chat destination is re-registered per stack (`JobDetail`,
`PostJob`, `WorkerProfile`, `ProfileReviews`, `Chat` each appear in 3–5 stacks)
so a card can open its target within whatever tab it was tapped from, rather
than jumping tabs. Route param types are centralized in `lib/navigation.ts`
with standalone param-list types for routes registered in multiple stacks —
already the right shape to extend rather than replace.

## Gap vs. the atlas

The atlas's product architecture is **one account, two mode-scoped five-tab
navigators**:

- Customer: Home / Explore / Post / Inbox / Profile
- Worker: Find Jobs / Map / My Work / Inbox / Profile

Today's app has **one** five-tab navigator (Home / Map / My Jobs / Messages /
Profile) shared by everyone, with posting and browsing both folded into the
Home stack and worker-specific screens (WorkerJob, submit-bid) folded into My
Jobs. This is a materially smaller information architecture than the atlas —
not wrong, just pre-mode-split. The current "landing preference" from Setup
(§4 of [01](01_CURRENT_APP_INVENTORY.md)) only jumps within this single tree
once; it does not select between two trees, because there is only one.

## Smallest safe migration path

Recommended sequencing, each step independently shippable and testable:

**Step 1 — introduce a persisted `mode` without changing the tab bar.**
Add `mode: 'customer' | 'worker'` to whatever durable store ends up owning it
(see [05](05_DATA_AND_STATE_MODEL_PLAN.md) for the storage decision). Read it
in `RootNavigator`/`MainTabs` but don't act on it yet — this step is pure
plumbing, verified by a test asserting the value round-trips, with zero
navigation change and zero regression risk.

**Step 2 — split tab config by mode, keep route names where they overlap.**
`MainTabs` picks one of two `Tab.Screen` sets based on `mode`, reusing the
existing per-stack navigators wherever the atlas screen maps onto a route that
already exists (`MapStack` → both Customer "Explore"'s map view and Worker's
"Map" tab can share `MapStackNavigator` initially; `MessagesStack` →
Customer "Inbox" and Worker "Inbox" already are one screen serving both
directions — `MessagesInboxScreen` shows all a user's threads regardless of
which side of the job they're on, so it likely needs zero change here).
Concretely:

| Atlas tab | Existing stack to reuse | New work needed |
|---|---|---|
| Customer Home | `HomeStackNavigator` (drop worker-only routes) | Minimal — already customer-shaped |
| Customer Explore | New, or repurpose `MapStackNavigator` + `WorkerSearchScreen` | Screens 17–21 don't exist yet (see [02](02_SCREEN_CROSSWALK.md)) |
| Customer Post | `PostJobScreen`, already shared | Extract into its own tab entry point instead of a Home sub-route |
| Worker Find Jobs | `BrowseJobsScreen` + `JobDetailScreen`, already shared | Becomes its own tab rather than nested in Home |
| Worker My Work | `WorkerJobScreen` + relevant `MyJobsHubScreen` filter | My Jobs hub already lists both sides; needs a worker-only filtered view |
| Both Inbox | `MessagesStackNavigator` | Likely unchanged |
| Both Profile | `ProfileStackNavigator` | Add a mode-switch entry point (atlas Screen 47) |

**Step 3 — add the mode switch itself** (atlas Screen 47, Settings & Support),
writing to the same store Step 1 introduced.

**Step 4 — retire the one-shot `setupLanding.ts` jump**, once Setup can
select a durable mode directly instead of a single-use landing hint. Until
then, leave it in place — it is small, tested, and not harmful to keep during
the transition.

## Deep linking, back navigation, existing users, and Setup routing

- **Existing users without a mode preference:** must not be forced back
  through onboarding. `useSetupStatus()` already fails toward showing Setup
  only when there is *no* stored record for that user id — a mode default
  (e.g. `customer`) should be assigned silently on first read for accounts
  that predate the mode field, never by re-showing Setup.
- **Deep linking:** no deep-link config currently exists in `App.tsx` beyond
  `navigationRef`'s pending-navigation parking pattern (used today for
  cold-start push-notification taps, see `lib/navigationRef.ts`). Any new deep
  link target must resolve against whichever mode's tab set is active, or
  force a mode switch with an explicit confirmation — silently switching a
  user's mode from a notification tap would violate "switching mode changes
  the dashboard, not the identity" by making it feel identity-like.
- **Back navigation:** each stack already owns its own back behavior via
  native-stack defaults; a mode switch should reset the destination stack
  (`navigationRef.navigate` to the new tab's root) rather than trying to
  splice histories between two navigator trees.
- **Setup routing:** unchanged in shape — Setup still decides only the
  *initial* mode and remains a one-time gate; switching later goes through
  Profile/Settings (atlas Screen 47), not back through Setup.

## Route-name preservation

Recommend preserving all current route names (`HomeMain`, `MyJobsHub`,
`JobDetail`, etc.) rather than renaming to match atlas slugs — the atlas slugs
are product-facing English descriptions, not enforced identifiers
(`screen_map.json`'s `slug` field, e.g. `worker_home`, is documentation, not a
route contract). Renaming working routes is pure regression risk with no
functional benefit; map atlas screens to existing route names in the
crosswalk instead of renaming code to match the atlas.
