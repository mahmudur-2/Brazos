import { Fragment, createElement, type PropsWithChildren, type ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView, motionCapability } from './vendor';
import type { MotionCapability } from './types';

/**
 * The motion boundary's PUBLIC surface. Everything downstream imports from
 * here and nothing downstream imports ./vendor directly — one seam, so the
 * "which binary am I on" question is asked in exactly one place.
 */

export { motionCapability };
export { MENU_MOTION_MS, MENU_MOTION_OUT_MS, resolveMotion120 } from './types';
export type { MotionCapability } from './types';

/**
 * Wraps the app in gesture-handler's root view when this binary has it, and
 * in a Fragment when it does not.
 *
 * A Fragment, specifically, and not a `<View style={{flex:1}}>`: an extra host
 * view in the tree's root would change layout on the binaries that DO have the
 * package versus the ones that do not, and the whole point of the boundary is
 * that the two render the same thing. The root view itself does need to fill,
 * so it gets `StyleSheet.absoluteFill`'s flex equivalent when it is the one
 * rendering.
 *
 * `createElement` rather than JSX for the vendor component because it is typed
 * as possibly-null and the null branch is the common one today.
 */
export function MotionRoot({ children }: PropsWithChildren): ReactElement {
  if (!GestureHandlerRootView) return createElement(Fragment, null, children);
  return createElement(GestureHandlerRootView, { style: styles.root }, children);
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

/**
 * True when a surface may offer a swipe as its ONLY way to reach an action.
 *
 * It never is today, and the name says why it is a question rather than a
 * synonym for `motionCapability.gestures`: an action reachable only by swipe
 * on a gesture-capable build and unreachable on another is two apps. Surfaces
 * that swipe must keep the same actions reachable by long-press, and this flag
 * chooses the MECHANIC, never the action set.
 */
export function canSwipe(capability: MotionCapability = motionCapability): boolean {
  return capability.gestures;
}

/**
 * True when a surface may drive animation from the UI thread.
 *
 * The fallback is core `Animated` on the native driver, which is smooth for
 * transform and opacity — so a false here costs finger-following fidelity and
 * a 120Hz frame budget, never the animation itself.
 */
export function canWorklet(capability: MotionCapability = motionCapability): boolean {
  return capability.reanimated;
}
