import { Animated, StyleSheet, View } from 'react-native';
import { CHECK_LEGS, CHECK_STROKE, legBox, legTransform, MARK_CHECK } from './SuccessMark.shared';
import { metricStyles } from '../lib/theme';

/**
 * 2026-09-28 (LUX-LIST-64 #42) — A CHECK THAT DRAWS ITSELF, at any size: the
 * published mark's own two legs (components/SuccessMark.shared.tsx — the short
 * leg, then the long, each a rounded bar growing from its start point), drawn
 * in their MARK_CHECK box and scaled to the size asked for, so the Seal's tick
 * and the live page's tile tick are the same drawing as the mark's. `progress`
 * (0 → 1) is the caller's, on the native driver; a still check passes 1.
 */
export function DrawnCheck({
  size,
  color,
  progress,
}: {
  size: number;
  color: string;
  progress: Animated.Value | number;
}) {
  const styles = stylesFor();
  const scale = size / MARK_CHECK;
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <View style={[styles.box, { transform: [{ scale }] }]}>
        {CHECK_LEGS.map((leg) => {
          const grow =
            typeof progress === 'number'
              ? Math.max(0, Math.min(1, (progress - leg.from) / (leg.to - leg.from)))
              : progress.interpolate({ inputRange: [leg.from, leg.to], outputRange: [0.001, 1], extrapolate: 'clamp' });
          return (
            <Animated.View
              key={leg.key}
              style={[
                styles.stroke,
                legBox(leg),
                { backgroundColor: color, transform: legTransform(leg, grow as unknown as number) },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const stylesFor = metricStyles(() =>
  StyleSheet.create({
    // The legs' own box, scaled about its centre into the size asked for.
    box: {
      position: 'absolute',
      width: MARK_CHECK,
      height: MARK_CHECK,
      left: '50%',
      top: '50%',
      marginLeft: -MARK_CHECK / 2,
      marginTop: -MARK_CHECK / 2,
    },
    stroke: {
      position: 'absolute',
      borderRadius: CHECK_STROKE / 2,
    },
  })
);
