import { createNavigationContainerRef } from '@react-navigation/native';

declare const __DEV__: boolean;

/**
 * Navigation handle usable from outside React — specifically the push
 * notification tap handler, which fires from a native event listener that has
 * no component tree to hang a useNavigation() off.
 *
 * Untyped (`any` param list) on purpose: this drives NESTED navigation across
 * five sibling stacks (`navigate('Messages', { screen: 'Chat', ... })`). The
 * per-stack param lists in lib/navigation.ts describe each stack in isolation,
 * and there is no combined tab-level type to check a cross-stack jump against.
 * lib/notificationRoutes.ts is the single place that builds these calls, and
 * it validates the target itself.
 */
export const navigationRef = createNavigationContainerRef<any>();

/** A navigation intent parked until the container reports ready. */
let pendingNavigation: (() => void) | null = null;

/**
 * Runs `action` now if navigation is mounted, otherwise holds the most recent
 * one until flushPendingNavigation() is called.
 *
 * This is the cold-start path: tapping a notification for a closed app starts
 * the process, and the tap is delivered before NavigationContainer has
 * mounted. Dropping it would land the user on Home — exactly the failure the
 * deep-link requirement rules out.
 */
export function navigateWhenReady(action: () => void): void {
  if (navigationRef.isReady()) {
    action();
  } else {
    pendingNavigation = action;
  }
}

/** Called from NavigationContainer's onReady. */
export function flushPendingNavigation(): void {
  const action = pendingNavigation;
  pendingNavigation = null;
  if (action && navigationRef.isReady()) action();
}

/**
 * Whether the CURRENTLY MOUNTED navigator can actually handle this target.
 *
 * Perspective has exactly one source of truth — ModeContext — and the tree it
 * mounted is the observable form of that truth: in customer mode the customer
 * tree is mounted, in worker mode the worker tree is. Asking the live
 * navigator therefore asks ModeContext, without mirroring mode into a second
 * module that could drift from it.
 *
 * This exists because a cold-start intent is parked before the container
 * mounts and flushed the instant it is ready — which can be BEFORE mode
 * resolution settles on a tree. Dispatching blind at that moment throws
 * React Navigation's "The 'state' or 'screen' passed in the params could not
 * be handled", which is what a device hit at cold start in worker mode
 * against the customer Home stack.
 */
export function canNavigateTo(tab: string, screen?: string): boolean {
  if (!navigationRef.isReady()) return false;
  const root = navigationRef.getRootState();
  const tabRoute = root?.routes?.find((r) => r.name === tab);
  if (!tabRoute) return false;
  if (!screen) return true;

  // The tab's stack has only rendered its own state once visited; before that
  // the nested names are not observable, so an unvisited tab is treated as
  // able to handle its target (its param list is registered at build time).
  const nested = tabRoute.state as { routeNames?: string[] } | undefined;
  if (!nested?.routeNames) return true;
  return nested.routeNames.includes(screen);
}

export type CrossTabOptions = {
  /**
   * When the nested target is not in the mounted tree, land on the tab's own
   * root instead of dropping the jump. For a user-initiated tap that is nearly
   * always right — the tab exists in both trees, only the screen inside it is
   * mode-specific, so "go to Home" still has an answer even when "go to Worker
   * Home" does not. Notification routing deliberately does NOT opt in: landing
   * a tapped alert on an unrelated screen is worse than doing nothing.
   */
  fallbackToTabRoot?: boolean;
  /**
   * React Navigation 7's nested-navigate option: pop to the target when it is
   * already on the tab's stack rather than pushing a second copy of it.
   */
  pop?: boolean;
};

/**
 * THE way to dispatch across sibling tabs. Every cross-tab jump in the app
 * goes through here.
 *
 * WHY THIS EXISTS AS ONE FUNCTION
 * `Home` is the mode-defining tab (BRAZOS_MASTER_PLAN.md §F): its stack is
 * `HomeMain/PostJob/WorkerSearch/...` in customer mode and
 * `WorkerHome/WorkerResults/JobDetail/...` in worker mode, and only one of the
 * two trees is ever mounted. The other four tabs are shared. So a nested
 * `navigate('Home', { screen: 'WorkerResults' })` written inside a SHARED
 * screen is correct in one mode and throws React Navigation's "The 'state' or
 * 'screen' passed in the params couldn't be applied to the navigator with the
 * screens: ..." in the other.
 *
 * tsc cannot catch that: a shared screen types its own stack, and the tab-level
 * jump is an untyped cast by construction (there is no combined tab type — see
 * navigationRef above). So the check has to be a runtime one, and it has to be
 * in exactly one place, or the next cross-tab caller reintroduces the bug. It
 * asks the LIVE navigator, which is the observable form of ModeContext's
 * decision, so it can never drift from the mode that is actually mounted.
 */
export function navigateAcrossTabs(
  tab: string,
  screen?: string,
  params?: object,
  options?: CrossTabOptions
): void {
  navigateWhenReady(() => {
    if (canNavigateTo(tab, screen)) {
      if (screen) {
        navigationRef.navigate(tab, {
          screen,
          params,
          // Never let a cross-tab landing become its stack's initial route.
          // Without this, an unvisited tab mounts with the target as its ONLY
          // route: the tab bar's pop-to-top lands on the target forever and
          // the stack's declared root is unreachable for the whole session
          // (AUD-P1-09 — the notification cold-start orphaned Messages inbox).
          initial: false,
          ...(options?.pop ? { pop: true } : null),
        });
      } else {
        navigationRef.navigate(tab);
      }
      return;
    }

    if (options?.fallbackToTabRoot && canNavigateTo(tab)) {
      navigationRef.navigate(tab);
      return;
    }

    if (__DEV__) {
      // Report what the mounted tree ACTUALLY offers, not just that the target
      // missed. A drop means the live navigator and the code that dispatched
      // disagree about which mode is mounted, and naming both sides is the
      // difference between "unreproducible" and a located defect.
      const root = navigationRef.isReady() ? navigationRef.getRootState() : undefined;
      const tabs = root?.routes?.map((r) => r.name).join(',') ?? '(none)';
      const nested = root?.routes?.find((r) => r.name === tab)?.state as
        | { routeNames?: string[] }
        | undefined;
      const offered = nested?.routeNames?.join(',') ?? '(tab not yet rendered)';
      console.warn(
        `[nav] dropped cross-tab target ${tab}/${screen ?? '(tab root)'} — ` +
          'not handled by the navigator this mode mounted' +
          `\n[nav]   tabs mounted: ${tabs}` +
          `\n[nav]   ${tab} stack offers: ${offered}`
      );
    }
  });
}

/**
 * THE way to leave a screen backwards. Every back control in the app calls
 * this (tests/crossTabNavigation.test.mjs fails on a bare goBack outside it).
 *
 * WHY: navigateAcrossTabs() lands on NESTED screens, and React Navigation
 * mounts an unvisited tab's stack with that target as its INITIAL route — the
 * stack's declared first screen is not underneath it. A bare goBack() there
 * dispatches GO_BACK into a navigator with nothing to pop, which is exactly
 * the device error this closes ("The action 'GO_BACK' was not handled by any
 * navigator", on cold start via the parked notification replay and after any
 * cross-tab jump). Root-of-stack is a NORMAL state for our screens, not an
 * edge case, so the check belongs beside the dispatch — same rule as
 * navigateAcrossTabs above.
 *
 * Fallback: the Home tab root of whichever tree is mounted. Exactly one tree
 * is ever mounted and ModeContext decides which (§F), so the mounted tree IS
 * the customer/worker perspective in navigation form — this lands on Customer
 * Home in customer mode and Worker Home in worker mode without mirroring mode
 * state into this module. 'Home' is the one tab name both CustomerParamList
 * and WorkerParamList declare, so the target exists in either tree by type.
 */
export function goBackOrHome(): void {
  navigateWhenReady(() => {
    if (navigationRef.canGoBack()) {
      navigationRef.goBack();
      return;
    }
    navigateAcrossTabs('Home');
  });
}

/** Route names that are a Home root, in either tree. */
const HOME_ROOTS = new Set(['HomeMain', 'WorkerHome']);

type ReadState = {
  type?: string;
  index?: number;
  routes?: { name: string; state?: ReadState }[];
};

/** The first tab navigator's state under the root, depth-first. */
function findTabState(state: ReadState | undefined): ReadState | undefined {
  if (!state) return undefined;
  if (state.type === 'tab') return state;
  for (const route of state.routes ?? []) {
    const found = findTabState(route.state);
    if (found) return found;
  }
  return undefined;
}

/**
 * 2026-09-28 (LUX-LIST-64 #60) — WILL BACK LAND ON A HOME ROOT? A READ, never a
 * dispatch: the header names "Home" beside its back button exactly when this
 * says so. In the screen's own stack, the route underneath is a Home root; at
 * its stack's root in another tab (My Jobs, Discover), goBackOrHome() falls to
 * the tab bar, whose back goes to the first tab — Home — so that tab's own top
 * decides. Unknown (no container yet, a harness) answers false: no label
 * rather than a wrong one.
 */
export function backLandsOnHome(stack: ReadState | undefined): boolean {
  try {
    const index = stack?.index ?? 0;
    if (stack?.routes && index > 0) {
      return HOME_ROOTS.has(stack.routes[index - 1]?.name ?? '');
    }
    const tabs = navigationRef.isReady() ? findTabState(navigationRef.getRootState() as ReadState) : undefined;
    if (!tabs?.routes) return false;
    const current = tabs.routes[tabs.index ?? 0];
    if (!current || current.name === 'Home') return false;
    const home = tabs.routes.find((route) => route.name === 'Home');
    const top = home?.state?.routes?.[home.state.index ?? 0]?.name;
    return top === undefined || HOME_ROOTS.has(top);
  } catch {
    return false;
  }
}

/** What a flow's first back step may name: the screen underneath, by the tab it roots. */
const ORIGIN_LABELS: Record<string, string> = {
  HomeMain: 'Home',
  WorkerHome: 'Home',
  MyJobsHub: 'My Jobs',
  WorkerSearch: 'Discover',
  MessagesInbox: 'Inbox',
  ProfileMain: 'Profile',
  MapMain: 'Map',
};

/**
 * 2026-09-28 (LUX-LIST-64 #30) — WHERE A FLOW WAS OPENED FROM, in the words of
 * the tab it came from: Post a Job's step 1 names it beside its back button
 * ("‹ Home", "‹ My Jobs"). A read of the stack underneath; at a stack's root,
 * whatever backLandsOnHome() says. Unknown answers undefined: the disc alone.
 */
export function originLabel(stack: ReadState | undefined): string | undefined {
  const index = stack?.index ?? 0;
  if (stack?.routes && index > 0) return ORIGIN_LABELS[stack.routes[index - 1]?.name ?? ''];
  return backLandsOnHome(stack) ? 'Home' : undefined;
}
