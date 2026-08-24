import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import {
  COLUMN_BOTTOM_PADDING,
  riseFor,
  type KeyboardRisingColumnProps,
} from './KeyboardRisingColumn.shared';

/**
 * KEYBOARD TRACKING'S FAST PATH — the column follows the keyboard itself
 * rather than running its own animation alongside it.
 *
 * One of the file kinds allowed to name react-native-reanimated directly;
 * reached only through `resolveMotion120` from ./KeyboardRisingColumn.tsx,
 * which requires it solely when `motionCapability.reanimated` is true. On a
 * binary without the native module this file is never evaluated.
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
 * `useAnimatedKeyboard` is not an imitation. It exposes the keyboard's live
 * height as a shared value updated on the UI thread, so the column is a
 * FUNCTION of the keyboard's position rather than a second animation aimed at
 * the same destination. There is no curve to match because there is no second
 * animation, and a drag-to-dismiss is followed frame for frame.
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
  const keyboard = useAnimatedKeyboard();

  const rise = useAnimatedStyle(() => ({
    transform: [{ translateY: -riseFor(keyboard.height.value, insetBelow) }],
  }));

  return (
    <Animated.View style={[style, { paddingBottom: COLUMN_BOTTOM_PADDING }, rise]}>
      {children}
    </Animated.View>
  );
}
