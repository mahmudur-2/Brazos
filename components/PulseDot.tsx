import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { radius } from '../lib/theme';

/**
 * A static dot with a soft animated halo behind it — the same pattern
 * Customer Home's "Live Nearby" indicator uses (HomeScreen.tsx's
 * liveIndicator/liveDotHalo/liveDot), extracted here rather than guessed at
 * independently so Worker Home's online/offline pulse feels like the same
 * app. Customer Home keeps its own inline copy untouched; this is a fresh
 * component with the same values, not a shared import that could regress it.
 */
export function PulseDot({ color, size = 10 }: { color: string; size?: number }) {
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion === null) return;
    pulse.stopAnimation();
    if (reducedMotion) {
      pulse.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, reducedMotion]);

  const haloStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.72] }),
    transform: [
      { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1.3] }) },
    ],
  };
  const haloSize = size * 1.8;

  return (
    <View style={[styles.wrap, { width: haloSize, height: haloSize }]}>
      <Animated.View
        style={[
          styles.halo,
          { width: haloSize, height: haloSize, borderRadius: haloSize / 2, backgroundColor: color },
          haloStyle,
        ]}
      />
      <View
        style={[
          styles.dot,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', borderRadius: radius.pill },
  dot: { borderRadius: radius.pill },
});
