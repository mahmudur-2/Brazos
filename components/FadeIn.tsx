import { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import type { PropsWithChildren } from 'react';
import { USE_NATIVE_DRIVER } from '../lib/motion';

/**
 * A short fade-and-lift for content arriving in place of a loading state.
 *
 * Deliberately applied to a whole list rather than per row: staggering each
 * card means animating during scroll, which is where this kind of motion
 * stops being polish and starts being jank. One 180ms pass, no delay, nothing
 * held back — navigation is never waiting on it.
 *
 * `resetKey` restarts the fade when the content genuinely changes (a new
 * search, a different filter). Left alone, a re-render does not re-animate.
 */
export function FadeIn({
  children,
  style,
  resetKey,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle>; resetKey?: string | number }>) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 180,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [progress, resetKey]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                // 8pt, not 40 — enough to read as "this just arrived",
                // not enough to look like a page transition.
                outputRange: [8, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
