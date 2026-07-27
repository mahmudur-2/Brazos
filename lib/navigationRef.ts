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
