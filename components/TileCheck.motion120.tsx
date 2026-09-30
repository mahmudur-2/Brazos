import { useEffect } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { postTiles } from '../lib/theme';
import { TileCheckBox, tileCheckStylesFor, type TileCheckProps } from './TileCheck.shared';

/**
 * THE CHOSEN TILE'S CHECK ON REANIMATED — the 120 Hz path.
 *
 * One of the file kinds allowed to name a vendor package directly; reached only through
 * `resolveMotion120` from ./TileCheck.tsx, when worklets are present and the person has not asked
 * for reduced motion. ONE shared value, 0 → 1: the slot's width and the box's opacity are
 * functions of it, computed on the UI thread, so the tile widens and its neighbours make room
 * without the JS thread.
 */
export function TileCheck({ shown, fill, ink }: TileCheckProps) {
  const styles = tileCheckStylesFor();
  const progress = useSharedValue(shown ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(shown ? 1 : 0, {
      duration: postTiles.widenMs,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, shown]);

  const full = postTiles.slot;
  const slotStyle = useAnimatedStyle(() => ({ width: progress.value * full, opacity: progress.value }), [full]);

  return (
    <Animated.View style={[styles.slot, slotStyle]} pointerEvents="none">
      <TileCheckBox fill={fill} ink={ink} />
    </Animated.View>
  );
}
