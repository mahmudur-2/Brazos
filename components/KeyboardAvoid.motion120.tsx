import { useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { keyboardPadding, type KeyboardAvoidProps } from './KeyboardAvoid.shared';

/**
 * THE KEYBOARD-AVOIDING VIEW ON THE KEYBOARD'S OWN FRAMES — the 120 Hz path.
 *
 * One of the file kinds allowed to name a vendor package directly; reached only through
 * `resolveMotion120` from ./KeyboardAvoid.tsx, when this binary has keyboard-controller's native
 * module and worklets. The padding is a function of the keyboard's height on every frame,
 * computed on the UI thread by the same `keyboardPadding` React Native's view uses, so whatever
 * sits above the padding (a pinned bar, the end of a scroller) moves with the keyboard rather
 * than after it, and follows a finger dragging the keyboard down.
 *
 * Like React Native's view, the padding is applied only for `behavior="padding"`; any other
 * behavior renders the style as given.
 */
export function KeyboardAvoid({
  behavior,
  keyboardVerticalOffset = 0,
  enabled = true,
  style,
  children,
}: KeyboardAvoidProps) {
  const keyboard = useReanimatedKeyboardAnimation();
  const { height: screenHeight } = useWindowDimensions();
  const frameBottom = useSharedValue(0);
  const avoiding = enabled && behavior === 'padding';

  const onLayout = (event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    frameBottom.value = y + height;
  };

  const padding = useAnimatedStyle(
    () => ({
      // The vendor stores the keyboard as a NEGATIVE offset; keyboardPadding speaks in heights.
      paddingBottom: keyboardPadding(frameBottom.value, screenHeight, -keyboard.height.value, keyboardVerticalOffset),
    }),
    [screenHeight, keyboardVerticalOffset]
  );

  return (
    <Animated.View style={[style, avoiding ? padding : undefined]} onLayout={onLayout}>
      {children}
    </Animated.View>
  );
}
