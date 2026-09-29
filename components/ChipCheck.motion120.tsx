import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { CHIP_CHECK_MS, chipCheckStylesFor, chipCheckWidth, type ChipCheckProps } from './ChipCheck.shared';

/**
 * THE CHIP'S CHECK ON REANIMATED — the 120 Hz path.
 *
 * One of the file kinds allowed to name a vendor package directly; reached only
 * through `resolveMotion120` from ./ChipCheck.tsx, when worklets are present and
 * the person has not asked for reduced motion. ONE shared value, 0 → 1: the
 * slot's width and the check's opacity are functions of it, computed on the UI
 * thread, so the chip widens and its neighbours make room without the JS thread.
 */
export function ChipCheck({ shown, size, color }: ChipCheckProps) {
  const styles = chipCheckStylesFor();
  const progress = useSharedValue(shown ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(shown ? 1 : 0, { duration: CHIP_CHECK_MS });
  }, [progress, shown]);

  const full = chipCheckWidth(size);
  const slotStyle = useAnimatedStyle(
    () => ({ width: progress.value * full, opacity: progress.value }),
    [full]
  );

  return (
    <Animated.View style={[styles.slot, slotStyle]} pointerEvents="none">
      <Ionicons name="checkmark" size={size} color={color} />
    </Animated.View>
  );
}
