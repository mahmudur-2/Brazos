import { type ComponentType } from 'react';
import { Animated } from 'react-native';
import { useKeyboardOffset } from '../hooks/useKeyboardOffset';
import { canTrackKeyboard, canWorklet, motionCapability, resolveMotion120 } from '../lib/motion120';
import {
  COLUMN_BOTTOM_PADDING,
  type KeyboardRisingColumnProps,
} from './KeyboardRisingColumn.shared';

export type { KeyboardRisingColumnProps } from './KeyboardRisingColumn.shared';

/**
 * The column that rises to sit on the keyboard, on whichever driver this
 * binary has.
 *
 * THE FALLBACK IS AUTHORITATIVE and stays so. `useKeyboardOffset` is the
 * native-driver implementation built last run: it replaced
 * `KeyboardAvoidingView behavior="padding"`, whose per-frame relayout of the
 * whole chat column could not be made smooth, with a `translateY` that runs
 * off the JS thread. Every build shipped so far takes this path, and it is
 * correct on its own terms rather than a placeholder — the fast path is an
 * improvement on something that already works, which is the only kind of fast
 * path worth having behind a capability flag.
 *
 * The padding below the column is COLUMN_BOTTOM_PADDING from the shared module
 * — one value, applied on the same view that rises in both paths, so the two
 * lay out identically. It is NOT `insetBelow`: see that constant's docblock for
 * the double count that was.
 */
function KeyboardRisingColumnFallback({
  insetBelow,
  reserveBelow = 0,
  style,
  children,
}: KeyboardRisingColumnProps) {
  const keyboardRise = useKeyboardOffset(insetBelow + reserveBelow);

  return (
    <Animated.View
      style={[
        style,
        { paddingBottom: COLUMN_BOTTOM_PADDING + reserveBelow },
        { transform: [{ translateY: Animated.multiply(keyboardRise, -1) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Chosen ONCE, at module load. A capability cannot change while the app runs,
 * and the literal `require` is written here rather than passed as a string
 * because Metro resolves requires statically at bundle time.
 *
 * THE FAST PATH NEEDS TWO VENDORS and asks for both, the way SwipeableRow
 * does: `canTrackKeyboard()` is what supplies the keyboard's live frame, and
 * `canWorklet()` is what can run a style off it on the UI thread. Either one
 * missing has to route here, to the fallback — a binary with the keyboard
 * package and no reanimated could not run the sibling's `useAnimatedStyle` at
 * all, and one with reanimated and no keyboard package would mount a hook that
 * reports nothing and leave the composer pinned at zero while the keyboard
 * covers it. The AND is written through the two questions rather than by
 * reading the raw flags, so this line states WHY it needs each half.
 */
const Impl = resolveMotion120<ComponentType<KeyboardRisingColumnProps>>(
  { ...motionCapability, keyboard: canTrackKeyboard() && canWorklet() },
  'keyboard',
  () =>
    require('./KeyboardRisingColumn.motion120')
      .KeyboardRisingColumn as ComponentType<KeyboardRisingColumnProps>,
  KeyboardRisingColumnFallback
);

export function KeyboardRisingColumn(props: KeyboardRisingColumnProps) {
  return <Impl {...props} />;
}
