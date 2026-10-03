import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { PRESS_SCALE, PRESS_SPRING } from '../hooks/usePressFeedback';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { tap } from '../lib/haptics';
import { pressStyles, type PressScaleProps } from './PressScale.shared';

/**
 * THE PRESS ON THE UI THREAD — the 120 Hz path.
 *
 * One of the file kinds allowed to name a vendor package directly; reached only through
 * `resolveMotion120` from ./PressScale.tsx, when worklets are present. The same spring as the
 * native-driver hook (PRESS_SCALE, PRESS_SPRING), one shared value, so a fast double tap carries
 * its velocity into the reverse on the display's own frames. Under Reduce Motion (and until it
 * is known) no transform is written at all, the hook's contract.
 */
export function PressScale({ haptic = true, style, onPressIn, onPressOut, onLayout, ...rest }: PressScaleProps) {
  const animated = useReducedMotion() === false;
  const scale = useSharedValue(1);
  const motion = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const { outer, inner } = pressStyles(style);
  return (
    <Animated.View style={[outer, animated ? motion : undefined]} onLayout={onLayout}>
      <Pressable
        {...rest}
        style={inner}
        onPressIn={(event) => {
          if (haptic) tap();
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
