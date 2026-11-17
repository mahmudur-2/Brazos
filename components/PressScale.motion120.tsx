import { Pressable } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { PRESS_SCALE, PRESS_SPRING, pressHaptic } from '../hooks/usePressFeedback';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { pressStyles, withPressDim, type PressScaleProps } from './PressScale.shared';

/**
 * THE PRESS ON THE UI THREAD — the 120 Hz path.
 *
 * One of the file kinds allowed to name a vendor package directly; reached only through
 * `resolveMotion120` from ./PressScale.tsx, when worklets are present. The same spring as the
 * native-driver hook (PRESS_SCALE, PRESS_SPRING), one shared value, so a fast double tap carries
 * its velocity into the reverse on the display's own frames. Under Reduce Motion (and until it
 * is known) no transform is written at all, the hook's contract. A2-M2: a `dim` rides the same
 * value — the opacity follows the scale, in the same frame — and under Reduce Motion it is the
 * Pressable's pressed style instead.
 */
export function PressScale({ haptic = true, dim, fill, style, onPressIn, onPressOut, onLayout, hitSlop, ...rest }: PressScaleProps) {
  const animated = useReducedMotion() === false;
  const scale = useSharedValue(1);
  const motion = useAnimatedStyle(() =>
    dim == null
      ? { transform: [{ scale: scale.value }] }
      : {
          transform: [{ scale: scale.value }],
          opacity: interpolate(scale.value, [PRESS_SCALE, 1], [dim, 1], Extrapolation.CLAMP),
        }
  );
  const { outer, inner } = pressStyles(animated ? style : withPressDim(style, dim), fill);
  return (
    <Animated.View style={[outer, animated ? motion : undefined]} onLayout={onLayout} hitSlop={hitSlop}>
      <Pressable
        {...rest}
        hitSlop={hitSlop}
        style={inner}
        onPressIn={(event) => {
          pressHaptic(haptic);
          if (animated) scale.value = withSpring(PRESS_SCALE, PRESS_SPRING);
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          if (animated) scale.value = withSpring(1, PRESS_SPRING);
          onPressOut?.(event);
        }}
      />
    </Animated.View>
  );
}
