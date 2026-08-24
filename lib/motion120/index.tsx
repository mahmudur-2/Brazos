import { Fragment, createElement, type PropsWithChildren, type ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView, KeyboardProvider, motionCapability } from './vendor';
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
 * Wraps the app in keyboard-controller's provider when this binary has it, and
 * in a Fragment when it does not.
 *
 * A Fragment for the same reason `MotionRoot` uses one, stated below: the two
 * binaries must lay out identically where the vendor is absent. This provider
 * DOES add a host view of its own where it is present, because it is a native
 * view that listens for keyboard frames — that is the whole feature, and it is
 * a full-screen listener rather than a layout participant.
 *
 * It must sit above everything that can hold a text input, which is why it is
 * mounted inside `MotionRoot` rather than at a screen: the hooks report
 * nothing at all without it, and a provider mounted per-screen would restart
 * its tracking on every navigation.
 */
export function KeyboardTrackingRoot({ children }: PropsWithChildren): ReactElement {
  if (!KeyboardProvider) return createElement(Fragment, null, children);
  return createElement(KeyboardProvider, null, children);
}

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
 *
 * THE KEYBOARD PROVIDER RIDES INSIDE IT, so App.tsx keeps ONE root wrapper and
 * the two vendors' presence is decided in one place instead of two. Nesting
 * order is the packages' own: gesture-handler's root view has to be over
 * EVERYTHING, so keyboard tracking goes under it, and both are over
 * SafeAreaProvider and the navigator.
 */
export function MotionRoot({ children }: PropsWithChildren): ReactElement {
  const tracked = createElement(KeyboardTrackingRoot, null, children);
  if (!GestureHandlerRootView) return createElement(Fragment, null, tracked);
  return createElement(GestureHandlerRootView, { style: styles.root }, tracked);
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

/**
 * True when a surface may be a FUNCTION of the keyboard's position rather than
 * a second animation aimed at the same destination.
 *
 * The distinction is not a frame budget, it is a class of behaviour. The
 * fallback listens for `keyboardWillShow`, reads the system's reported
 * duration, and runs a matching curve: two animations started at the same
 * moment with the same nominal length and a bezier approximating UIKit's
 * private keyboard curve. That is smooth and it is still an imitation — and an
 * INTERACTIVE dismissal, dragging the keyboard down with a finger, emits no
 * event to imitate at all, so the fallback simply cannot follow it.
 *
 * A false here therefore costs drag-to-dismiss tracking, not the animation.
 * Every consumer must still rise and fall correctly without it.
 */
export function canTrackKeyboard(capability: MotionCapability = motionCapability): boolean {
  return capability.keyboard;
}
