import { type ComponentType } from 'react';
import { canSwipe, canWorklet, motionCapability, resolveMotion120 } from '../lib/motion120';
import type { SwipeableRowProps } from './SwipeableRow.shared';

export type { SwipeAction, SwipeableRowProps } from './SwipeableRow.shared';

/**
 * A list row that MAY reveal its actions on a swipe — and, on every build
 * shipped so far, simply does not.
 *
 * THE FALLBACK IS THE ROW ITSELF. Not a disabled swipe, not a row with dead
 * tiles behind it: the children, unwrapped, with no extra host view in the
 * tree. That matters more than it looks. `canSwipe()` in lib/motion120 says a
 * surface may offer a swipe as a MECHANIC, never as the only route to an
 * action, so a build without gesture-handler must reach every one of these
 * actions another way — and it does, through the long-press ActionSheet the
 * inbox has always had. A capability-false device is therefore not degraded
 * and shows no affordance that does nothing, which is the failure this
 * boundary exists to prevent.
 *
 * THE FAST PATH NEEDS BOTH NATIVES, and this is the surface that says so.
 * `canSwipe()` answers "may a swipe surface exist here at all" — a binary
 * without gesture-handler has nothing to recognise the drag. `canWorklet()`
 * answers the second, independent half: the row has to FOLLOW the finger, and
 * following a finger on core `Animated` means a JS round trip per frame, under
 * exactly the load a list scroll produces. A build with a recogniser but no
 * worklets could technically swipe and would swipe BADLY, which is worse than
 * not offering it — so both questions are asked, and either false takes the
 * fallback. (This is the consumer audit finding F3 wanted for `canWorklet`:
 * it was exported and read by nothing, which made it a claim rather than a
 * check.)
 */
function SwipeableRowFallback({ children }: SwipeableRowProps) {
  return <>{children}</>;
}

/**
 * Chosen ONCE, at module load. A capability cannot change while the app runs,
 * and the literal `require` is written here rather than passed as a string
 * because Metro resolves requires statically at bundle time.
 */
const Impl = resolveMotion120<ComponentType<SwipeableRowProps>>(
  // The AND of the boundary's two questions, expressed through them rather
  // than by reading the raw capability flags — so this file states WHY it
  // needs each half instead of restating the flags' names.
  // `keyboard` is nothing to do with a swipe row and is passed through from
  // the real capability rather than invented: `resolveMotion120` reads only
  // the key it is given, and a hardcoded false here would be a claim about a
  // vendor this file has no business having an opinion on.
  { ...motionCapability, gestures: canSwipe() && canWorklet(), reanimated: canWorklet() },
  'gestures',
  () => require('./SwipeableRow.motion120').SwipeableRow as ComponentType<SwipeableRowProps>,
  SwipeableRowFallback
);

export function SwipeableRow(props: SwipeableRowProps) {
  return <Impl {...props} />;
}
