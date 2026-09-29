import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { METER_BAR_COUNT } from '../lib/audioMeter';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { radius, themedStyles, useThemeColors, withAlpha, type ColorPalette } from '../lib/theme';

/**
 * The live waveform inside the recording pill.
 *
 * TWO MODES, AND THE DIFFERENCE IS THE WHOLE POINT.
 *
 *   levels: number[]  — REAL amplitude, one normalised sample per bar, newest
 *                       at the right, scrolling left as the take runs. This is
 *                       what expo-audio's `metering` reports, mapped from dBFS
 *                       by hooks/useVoiceRecorder.ts.
 *   levels: null      — metering produced nothing on this binary. The bars sit
 *                       at their resting height and the whole row breathes on
 *                       one slow opacity pulse: an INDETERMINATE indicator,
 *                       visibly not a waveform.
 *
 * NO SYNTHETIC AMPLITUDE, EVER. A pseudo-random or sine-driven "waveform" over
 * a mic that is not being measured is a picture of nothing presented as a
 * picture of your voice — it would tell someone their recording is picking up
 * sound when nobody knows whether it is. The indeterminate pulse says "running"
 * and claims nothing else, which is the only honest thing to draw here.
 *
 * SCALE, NOT HEIGHT. Every bar is laid out once at its full height and drawn
 * with a `scaleY`, so ten updates a second cost ten native transform writes and
 * ZERO Yoga passes. Growth is symmetric about the row's centre line, which is
 * also what makes it read as a waveform rather than as a bar chart.
 */

const BAR_WIDTH = 3;
const BAR_GAP = 3;
const BAR_HEIGHT = 24;
/** Silence still draws something — a flat line reads as "broken", not "quiet". */
const BAR_MIN_SCALE = 0.12;
/** How many of the newest samples take the bright treatment. */
const LEADING_BARS = 4;
const PULSE_MS = 900;

type AudioMeterBarsProps = {
  /** Normalised 0..1 samples, oldest first — or null when this binary reports
   *  no metering at all. */
  levels: number[] | null;
};

export function AudioMeterBars({ levels }: AudioMeterBarsProps) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;
  const indeterminate = levels === null;

  useEffect(() => {
    if (!indeterminate || reducedMotion) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: PULSE_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: PULSE_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [indeterminate, pulse, reducedMotion]);

  const shown = levels ?? new Array(METER_BAR_COUNT).fill(0);

  return (
    <Animated.View
      style={[
        styles.row,
        indeterminate && {
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
        },
      ]}
      accessibilityLabel={indeterminate ? 'Recording' : 'Recording, microphone level'}
    >
      {shown.map((level, index) => (
        <View
          key={index}
          style={[
            styles.bar,
            // The newest samples are the brightest, so the row reads
            // left-to-right as time even when the amplitude is flat.
            index >= shown.length - LEADING_BARS && styles.barLeadingFill,
            { transform: [{ scaleY: Math.max(BAR_MIN_SCALE, Math.min(1, level)) }] },
          ]}
        />
      ))}
    </Animated.View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    row: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: BAR_GAP,
      height: BAR_HEIGHT,
      overflow: 'hidden',
    },
    bar: {
      width: BAR_WIDTH,
      height: BAR_HEIGHT,
      borderRadius: radius.pill,
      backgroundColor: withAlpha(colors.emerald, 0.55),
    },
    // THE ONE GOLD FILL HERE, and it is the shape decision 3's "no gold fills"
    // was never about: the filled part of a MEASUREMENT BAR. Masters 27 and 37
    // both run a gold fill along a deep track, and a level meter is that
    // exactly — how much of something there is, not a control anyone presses.
    // The `…Fill` suffix is how tests/goldOnForest.test.mjs recognises the
    // case by convention rather than by an allowlist entry, so a gold BUTTON
    // fill in this same file would still be an offender.
    barLeadingFill: {
      backgroundColor: colors.mark,
    },
  })
);
