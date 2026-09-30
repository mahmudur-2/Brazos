import { useContext } from 'react';
import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import { BottomTabBarHeightContext, type BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { layout, spacing } from '../../lib/theme';
import { tap } from '../../lib/haptics';
import { useNavInset, usePillTop } from '../../hooks/useNavInset';

/**
 * §I's `BottomNav` primitive — the tab bar's CONTRACT, in one place: which tabs each tree draws,
 * the tab-press listener, the options every tab screen takes, and what content keeps clear of the
 * bar.
 *
 * 2026-09-30 (the build run, docs/dispatch/MELT-TAB-BAR.md) — THE BAR ITSELF MOVED OUT. Both trees
 * now pass `tabBar={… <MeltTabBar … />}` (components/MeltTabBar.tsx): a floating pill in the
 * lit-card material whose chosen tab is a flat bubble that melts from tab to tab. React
 * Navigation's own BottomTabBar, and with it everything that configured it here — the tabBarStyle
 * / tabBarIcon / tabBarBackground options, the chrome ground, the centre [ + ] control, the design
 * studio's nav dials and the attached bar's flush arithmetic — is retired; the long record of how
 * that bar got its numbers is in git history (this file before this commit).
 *
 * MODE AWARENESS stays in the two trees (navigation/CustomerRoot.tsx, navigation/WorkerRoot.tsx):
 *
 *   WORKER    Home · Map · My Jobs · Inbox · Profile        (0d, unchanged)
 *   CUSTOMER  Home · Discover · [ + ] · Inbox · Profile     (emerald D1)
 *
 * The [ + ] is an ACTION, not a destination: it opens the creation sheet and never navigates.
 * The customer bar draws no Map or My Jobs item, and both routes stay REGISTERED behind
 * HIDDEN_TAB_ITEM_OPTIONS, because React Navigation 7 resolves an untargeted NAVIGATE against the
 * tab navigator and its ancestors only — the [ + ] sheet's "My jobs" and every notification routed
 * through the MyJobs tab must find their route right there. Removing a route to remove an item
 * would turn working taps into crashes.
 *
 * THE PILL FLOATS over every tab screen, so every scene runs full height and scrolls under it.
 * What keeps content clear is below: `useScrollClearance()` for a scroller's end,
 * `usePinnedFooterPadding()` for a footer pinned at the bottom — both read the pill's one
 * footprint in hooks/useNavInset.ts.
 */

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type BottomNavTabKey = 'Home' | 'Map' | 'MyJobs' | 'Discover' | 'Messages' | 'Profile';

/** Every bar item either tree can render, keyed for the bar. Bar ORDER lives in WORKER_BAR_TABS /
 *  CUSTOMER_BAR_TABS below, per mode. */
export const BOTTOM_NAV_TABS: {
  key: BottomNavTabKey;
  label: string;
  /** [active, inactive] */
  icons: [IoniconName, IoniconName];
}[] = [
  // Home's glyphs are the bar's own chimney-less pair (assets/glyphs/home-flat*.png, drawn by
  // components/MeltTabBar.shared.tsx); these names are what the rest of the app knows it by.
  { key: 'Home', label: 'Home', icons: ['home', 'home-outline'] },
  // A teardrop location-pin marker, not the map-square glyph — this tab is
  // "find work near you", and a pin reads as that more directly than a map.
  { key: 'Map', label: 'Map', icons: ['location', 'location-outline'] },
  { key: 'MyJobs', label: 'My Jobs', icons: ['briefcase', 'briefcase-outline'] },
  // The customer's browse surface (workers and services — never job postings). A MAGNIFIER:
  // searching is what the destination underneath (WorkerSearchScreen) actually does.
  { key: 'Discover', label: 'Discover', icons: ['search', 'search-outline'] },
  // RUN H2 — LABEL and GLYPH only. The KEY stays 'Messages': it is the route name both trees
  // register and every cross-tab jump and notification route resolves against.
  { key: 'Messages', label: 'Inbox', icons: ['chatbubble-ellipses', 'chatbubble-ellipses-outline'] },
  { key: 'Profile', label: 'Profile', icons: ['person', 'person-outline'] },
];

/** The worker bar — the five classic tabs. Its Map is a JOB map and is correct. */
export const WORKER_BAR_TABS: BottomNavTabKey[] = ['Home', 'Map', 'MyJobs', 'Messages', 'Profile'];

/**
 * The customer bar — FOUR destinations plus D4's creation ACTION, drawn as five slots:
 * `Home · Discover · [ + ] · Inbox · Profile`. My Jobs left the customer bar (reached through the
 * [ + ] sheet's "My jobs"; the route stays registered, hidden) and Map became Discover (Map stays
 * registered, hidden). tests/mode.test.mjs asserts both halves.
 */
export const CUSTOMER_BAR_TABS: BottomNavTabKey[] = ['Home', 'Discover', 'Messages', 'Profile'];

/** Where the [ + ] sits among the customer's five slots — dead centre, after Discover. */
export const CUSTOMER_CREATE_SLOT = 2;

/**
 * THE SCREEN OPTIONS every tab screen takes. With the bar drawn by `tabBar`, nothing here styles
 * it: tab screens draw their own headers, and that is all.
 */
export const bottomNavScreenOptions: BottomTabNavigationOptions = {
  headerShown: false,
};

/**
 * Tab presses acknowledge with the light haptic tap. HAPTICS ONLY, pinned to exactly this shape
 * by tests/mode.test.mjs: no navigation, no preventDefault, no mode logic. The Melt bar emits
 * `tabPress` the library's way (components/MeltTabBar.shared.tsx `pressTab`), so this still fires.
 */
export const bottomNavScreenListeners = {
  tabPress: () => {
    tap();
  },
} as const;

/**
 * Registration options for a tab that must stay DISPATCHABLE but must not appear in the bar. The
 * Melt bar draws only its tree's tab list, so this marks the route rather than hiding a slot —
 * kept so the registration reads as deliberate and the fences can find it.
 */
export const HIDDEN_TAB_ITEM_OPTIONS: BottomTabNavigationOptions = {
  tabBarItemStyle: { display: 'none' },
};

/**
 * The height a surface must keep clear of the floating pill — the pill, its offset from the
 * screen's edge, and the breathing room above it (hooks/useNavInset.ts). The chat column's
 * keyboard rise and the design studio's panel read the pill's real box through this.
 */
export function useFloatingNavClearance(): number {
  return useNavInset();
}

/**
 * WHAT A SCROLLING SURFACE PADS ITS END WITH. Inside the tab navigator the pill floats over every
 * screen (2026-09-30), so a scroller's last row has to clear the pill's whole footprint wherever it
 * is — not only on the two homes, as when the attached bar sat in the layout flow everywhere else.
 * Outside a tab navigator — the catalog, a fixture, a screen presented over the tabs — there is no
 * pill, and one ordinary spacing step is the end padding. `BottomTabBarHeightContext` is how a
 * screen knows: React Navigation provides it to every screen under a bottom-tab navigator, nested
 * stacks included, and to nothing else. `spacing.lg` is read at use time, like every metric.
 */
export function useScrollClearance(): number {
  const inTabs = useContext(BottomTabBarHeightContext) !== undefined;
  const inset = useNavInset();
  return inTabs ? inset : spacing.lg;
}

/**
 * What a PINNED footer keeps above the pill — its own breathing room. `floatingNavGap` is defined
 * as exactly this distance: a footer's controls sit as far from the pill's top edge as the pill
 * sits from the screen's.
 */
export const PINNED_FOOTER_BOTTOM_PADDING = layout.floatingNavGap;

/**
 * THE PINNED FOOTER'S BOTTOM PADDING. A footer is laid out at the foot of a full-height scene, so
 * under the tab navigator it lifts its controls over the pill (the pill's top edge) and then keeps
 * PINNED_FOOTER_BOTTOM_PADDING above it; its own background runs on under the pill. Outside the
 * tab navigator there is no pill and the breathing room alone remains.
 */
export function usePinnedFooterPadding(): number {
  return usePillReserve() + PINNED_FOOTER_BOTTOM_PADDING;
}

/**
 * The pill's height above the screen edge under the tab navigator, 0 outside it — what a surface
 * pinned to the scene's foot reserves beneath its content (a footer, the chat column).
 */
export function usePillReserve(): number {
  const inTabs = useContext(BottomTabBarHeightContext) !== undefined;
  const pillTop = usePillTop();
  return inTabs ? pillTop : 0;
}
