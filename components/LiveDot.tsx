import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { metricStyles } from '../lib/theme';

/**
 * 2026-09-28 (LUX-LIST-64 #45, #49, #50, #54, #62) — THE LIVE DOTS, three ways of
 * saying "this is happening", each from its approved page:
 *
 *   sonar    an ALARM or the Home live bar: the dot holds still while a 1.5pt ring
 *            travels out from it and fades — scale 1 → 2.8, .85 → 0, every 2 s on
 *            cubic-bezier(.2,.6,.3,1) (refs/home-tucked-in.html `.sonar`).
 *   pulse    a live job card's status: a soft ring swells from the dot to 9pt out
 *            and fades, every 1.6 s (refs/live-job-cards.html `.livedot`).
 *   breathe  the Inbox job chip's stage: the dot itself swells 1 → 1.35 and
 *            dims to .6 and back, every 2.4 s (refs/inbox-clean-list.html).
 *
 * Every one is a transform and an opacity on the native driver, so it rides the
 * 120 Hz display thread and costs the JS thread nothing. Reduce Motion: the
 * still dot, nothing moving.
 */
export type LiveDotMotion = 'sonar' | 'pulse' | 'breathe' | 'still';

const SONAR_MS = 2000;
const PULSE_MS = 1600;
const BREATHE_MS = 2400;

export function LiveDot({
  color,
  size = 9,
  motion = 'sonar',
}: {
  color: string;
  size?: number;
  motion?: LiveDotMotion;
}) {
  const styles = stylesFor();
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const moving = motion !== 'still' && reducedMotion === false;

  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(0);
    if (!moving) return;
    const loop =
      motion === 'breathe'
        ? Animated.loop(
            Animated.sequence([
              Animated.timing(progress, {
                toValue: 1,
                duration: BREATHE_MS / 2,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: USE_NATIVE_DRIVER,
              }),
              Animated.timing(progress, {
                toValue: 0,
                duration: BREATHE_MS / 2,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: USE_NATIVE_DRIVER,
              }),
            ])
          )
        : Animated.loop(
            Animated.timing(progress, {
              toValue: 1,
              duration: motion === 'pulse' ? PULSE_MS : SONAR_MS,
              easing: motion === 'pulse' ? Easing.out(Easing.ease) : Easing.bezier(0.2, 0.6, 0.3, 1),
              useNativeDriver: USE_NATIVE_DRIVER,
            })
          );
    loop.start();
    return () => loop.stop();
  }, [moving, motion, progress]);

  const dot = { width: size, height: size, borderRadius: size / 2, backgroundColor: color };

  if (motion === 'breathe') {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
        <Animated.View
          style={[
            dot,
            moving
              ? {
                  opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }),
                  transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }],
                }
              : null,
          ]}
        />
      </View>
    );
  }

  // sonar travels to 2.8x; the pulse to 9pt beyond the dot's edge.
  const reach = motion === 'pulse' ? (size + 18) / size : 2.8;
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      {moving ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor: color,
              borderWidth: motion === 'pulse' ? size / 2 : 1.5,
              opacity: progress.interpolate({
                inputRange: [0, 1],
                outputRange: motion === 'pulse' ? [0.6, 0] : [0.85, 0],
              }),
              transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, reach] }) }],
            },
          ]}
        />
      ) : null}
      <View style={dot} />
    </View>
  );
}

const stylesFor = metricStyles(() =>
  StyleSheet.create({
    box: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    ring: {
      position: 'absolute',
    },
  })
);
