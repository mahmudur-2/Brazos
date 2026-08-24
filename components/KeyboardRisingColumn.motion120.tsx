import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import {
  COLUMN_BOTTOM_PADDING,
  riseFor,
  type KeyboardRisingColumnProps,
} from './KeyboardRisingColumn.shared';

/**
 * KEYBOARD TRACKING'S FAST PATH — the column follows the keyboard itself
 * rather than running its own animation alongside it.
 *
 * One of the file kinds allowed to name a vendor package directly; reached
 * only through `resolveMotion120` from ./KeyboardRisingColumn.tsx, which
 * requires it solely when BOTH `canTrackKeyboard()` and `canWorklet()` are
 * true. It names two vendors and needs both, so either one missing must keep
 * this file unevaluated — a require of it on a binary with neither native
 * module is the crash the whole boundary exists to prevent.
 *
 * WHY THIS IS BETTER THAN A FALLBACK THAT IS ALREADY GOOD. The core `Animated`
 * path listens for `keyboardWillShow`, reads the system's reported duration,
 * and runs a matching timing curve on the native driver. That is smooth, and
 * it is still an IMITATION: two animations started at the same moment with the
 * same nominal duration and a bezier approximating UIKit's private keyboard
 * curve. Anything that delays JS between the event and `.start()`
 * desynchronises them, the approximation drifts with each OS revision, and an
 * INTERACTIVE dismissal — dragging the keyboard down with a finger — emits no
 * event to imitate at all, so the fallback cannot follow it.
 *
 * `useReanimatedKeyboardAnimation` is not an imitation. It exposes the
 * keyboard's live height as a shared value updated on the UI thread, so the
 * column is a FUNCTION of the keyboard's position rather than a second
 * animation aimed at the same destination. There is no curve to match because
 * there is no second animation, and a drag-to-dismiss is followed frame for
 * frame.
 *
 * WHY NOT REANIMATED'S OWN `useAnimatedKeyboard`, which this file used until
 * 2026-08-24. Because on this version it does not deliver the per-frame half
 * of that promise. RUN N2 traced it into the vendor:
 * REAKeyboardEventObserver.mm emits continuous updates only when a walk of
 * private UIKit classes finds the keyboard view mid-animation, and when that
 * walk fails the only signal left is a one-shot snap at
 * keyboardDidShow/keyboardDidHide — which iOS posts AFTER the keyboard has
 * finished moving. The column then jumps to its destination late instead of
 * travelling with the keyboard, which is worse than the fallback it replaced.
 * The Reanimated team also deprecated the hook in 4.2.0. So the keyboard's
 * position now comes from the package that exists to report it, and reanimated
 * keeps the job it is good at: running the style worklet on the UI thread.
 *
 * The rise arithmetic is `riseFor` from the shared module — the same function
 * the fallback drives its `Animated.Value` with, so the two paths cannot stop
 * one at a different height than the other. The padding below the column comes
 * from the same module for the same reason, and it is NOT `insetBelow`: see
 * COLUMN_BOTTOM_PADDING for the double count that was.
 */
export function KeyboardRisingColumn({
  insetBelow,
  style,
  children,
}: KeyboardRisingColumnProps) {
  const keyboard = useReanimatedKeyboardAnimation();

  const rise = useAnimatedStyle(() => {
    // THE SIGN IS UNDONE HERE, once, at the seam. The vendor stores the
    // keyboard as a NEGATIVE offset (`heightSV.value = -event.height` in its
    // animated.tsx) because its own examples feed the value straight into a
    // translateY. `riseFor` speaks in POSITIVE keyboard heights — the same
    // units as the fallback's `event.endCoordinates.height` — and teaching the
    // shared arithmetic two conventions is exactly how the two drivers would
    // start landing the column at different heights.
    const keyboardHeight = -keyboard.height.value;
    return { transform: [{ translateY: -riseFor(keyboardHeight, insetBelow) }] };
  });

  return (
    <Animated.View style={[style, { paddingBottom: COLUMN_BOTTOM_PADDING }, rise]}>
      {children}
    </Animated.View>
  );
}
