import { createNavigationContainerRef } from '@react-navigation/native';

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
