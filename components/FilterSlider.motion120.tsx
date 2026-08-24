import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useThemeColors } from '../lib/theme';
import { stylesFor } from './FilterSlider';
import {
  fractionForValue,
  valueForFraction,
  type FilterSliderProps,
} from './FilterSlider.shared';

/**
 * THE SLIDER'S FAST PATH — the handle follows the finger rather than jumping
 * between the stepper's positions.
 *
 * One of the file kinds allowed to name a vendor package directly; reached
 * only through `resolveMotion120` from ./FilterSlider.tsx, which requires it
 * solely when a recogniser AND worklets are both present. On a binary without
 * either native module this file is never evaluated.
 *
 * WHY IT NEEDS BOTH. gesture-handler recognises the drag; reanimated is what
 * lets the fill and the handle be a FUNCTION of the finger's position on the
 * UI thread. With a recogniser alone every frame of the drag would be a JS
 * round trip, under exactly the load a modal sheet's first paint produces —
 * so that combination takes the stepper instead.
 *
 * THE VALUE IS SNAPPED ON THE UI THREAD and only then handed back, so `value`
 * updates at the granularity the caller asked for while the handle itself
 * moves continuously. The two are different questions: the handle's position
 * is what the finger is doing, the value is what the filter means.
 *
 * The track is drawn by the SHARED stylesheet the fallback uses, so the two
 * binaries render one slider.
 */
export function FilterSlider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  formatValue,
  accessibilityLabel,
  footnote,
}: FilterSliderProps) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);

  const trackWidth = useSharedValue(0);
  // Initialised on the JS thread, where a 'worklet' function is an ordinary
  // callable — the directive costs this call nothing.
  const fraction = useSharedValue(fractionForValue(value, min, max));

  // The caller owns the value: a change from anywhere else (a preset, a reset,
  // the other slider clamping this one) has to move the handle.
  useEffect(() => {
    fraction.value = fractionForValue(value, min, max);
  }, [value, min, max, fraction]);

  const pan = Gesture.Pan()
    .onBegin((event) => {
      'worklet';
      if (trackWidth.value <= 0) return;
      fraction.value = Math.min(1, Math.max(0, event.x / trackWidth.value));
      runOnJS(onChange)(valueForFraction(fraction.value, min, max, step));
    })
    .onUpdate((event) => {
      'worklet';
      if (trackWidth.value <= 0) return;
      fraction.value = Math.min(1, Math.max(0, event.x / trackWidth.value));
      runOnJS(onChange)(valueForFraction(fraction.value, min, max, step));
    })
    .onFinalize(() => {
      'worklet';
      // Settle the handle onto the value that was actually committed, so a
      // drag that ended between two steps does not leave it off its own mark.
      runOnJS(onChange)(valueForFraction(fraction.value, min, max, step));
    });

  const fillStyle = useAnimatedStyle(() => ({
    width: fraction.value * trackWidth.value,
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: fraction.value * trackWidth.value }],
  }));

  return (
    <View
      style={styles.row}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityValue={{ min, max, now: value, text: formatValue(value) }}
    >
      <View style={styles.head}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value} numberOfLines={1}>
          {formatValue(value)}
        </Text>
      </View>

      <View style={styles.controls}>
        <GestureDetector gesture={pan}>
          <View
            style={styles.track}
            onLayout={(event) => {
              trackWidth.value = event.nativeEvent.layout.width;
            }}
          >
            <Animated.View style={[styles.fill, fillStyle]} />
            <Animated.View style={[styles.thumb, thumbStyle]} />
          </View>
        </GestureDetector>
      </View>

      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </View>
  );
}
