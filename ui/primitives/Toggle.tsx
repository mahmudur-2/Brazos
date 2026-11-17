import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { metricStyles, radius, useThemeColors } from '../../lib/theme';
import { USE_NATIVE_DRIVER } from '../../lib/motion';
import { usePressFeedback } from '../../hooks/usePressFeedback';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * The one toggle. F2 (the owner's pick, 2026-11-16): ON lights the track the app's mint (emerald)
 * in both modes; OFF is the neutral surface in dark and the border in light. The knob is the plain
 * white knob of a standard iPhone switch in both modes and both states, sliding left to right.
 * Red is not used on this control: "Not taking new work" is a choice, not an error. The track's
 * colour and the knob's position both read the one `value` prop, so they cannot disagree.
 *
 * Drawn rather than RN's Switch because the masters' rim cannot exist there:
 * iOS ignores any attempt to border the native track, and per-platform
 * track/thumb props were producing three different toggles across the app.
 *
 * Same call shape as the Switch sites it replaced: value / onValueChange /
 * disabled / accessibilityLabel. The 44pt touch floor is met with hitSlop
 * over the drawn 32pt track (Appendix C's rule: hitSlop over drawn size).
 */

const TRACK_WIDTH = 52;
const TRACK_HEIGHT = 32;
const KNOB = 26;
/** 32pt track + 8 above and below: the 44pt floor (worn by the press wrapper and the Pressable). */
const TOGGLE_SLOP = { top: 8, bottom: 8, left: 6, right: 6 };
/** Border (1) + inner padding (2) on each side. */
const INSET = 3;

type ToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

export function Toggle({ value, onValueChange, disabled = false, accessibilityLabel }: ToggleProps) {
  const styles = stylesFor();
  const { palette, isDark } = useThemeColors();
  const position = useRef(new Animated.Value(value ? 1 : 0)).current;
  // A2-M2: a switch chooses, so the finger gets the selection tick, not the tap.
  const press = usePressFeedback({ haptic: 'select' });
  const reduceMotion = useReducedMotion();

  // RUN S2 (C8) — the drawn geometry dials; TRAVEL derives from them so the
  // knob still lands exactly inside the rim at any size. Colours stay D5's.
  const trackWidth = TRACK_WIDTH;
  const trackHeight = TRACK_HEIGHT;
  const knobSize = KNOB;
  const TRAVEL = trackWidth - knobSize - INSET * 2;

  // Fix run D6: the knob SPRINGS to its side (the press spring's 320 / 26, a
  // hair of overshoot that reads as a physical throw) on the native driver,
  // so the slide never waits on the JS thread. Under Reduce Motion it lands
  // at once — a state change, not an animation.
  useEffect(() => {
    if (reduceMotion !== false) {
      position.setValue(value ? 1 : 0);
      return;
    }
    const spring = Animated.spring(position, {
      toValue: value ? 1 : 0,
      stiffness: 320,
      damping: 26,
      mass: 1,
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    spring.start();
    return () => spring.stop();
  }, [position, value, reduceMotion]);

  // F2 (the owner's pick B, 2026-11-16): an ON switch lights its track the app's mint (emerald) in
  // both modes; OFF is the neutral surface under the ordinary hairline in dark, the border in light.
  const trackColor = value ? palette.emerald : isDark ? palette.neutralBg : palette.border;
  const trackBorder = isDark ? (value ? palette.emerald : palette.border) : 'transparent';

  // ...and the knob is the plain white knob of a standard iPhone switch, in both modes and both states.
  const knobColor = palette.white;
  const knobBorder = 'transparent';

  return (
    // MOTION1 (C1): the shared press spring, on a wrapper so the track's own
    // fixed geometry is untouched and the knob's translate stays independent
    // of it. The wrapper carries the slop too: on the New Architecture a view
    // its child does not overflow hit-tests as clipped (PressScale.shared.tsx).
    <Animated.View style={press.style} hitSlop={TOGGLE_SLOP}>
    <Pressable
      onPress={() => onValueChange(!value)}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled}
      hitSlop={TOGGLE_SLOP}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      style={[
        styles.track,
        { width: trackWidth, height: trackHeight },
        { backgroundColor: trackColor, borderColor: trackBorder },
        disabled && styles.disabled,
      ]}
    >
      <Animated.View
        style={[
          styles.knob,
          { width: knobSize, height: knobSize },
          { backgroundColor: knobColor, borderColor: knobBorder },
          {
            transform: [
              {
                translateX: position.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, TRAVEL],
                }),
              },
            ],
          },
        ]}
      />
    </Pressable>
    </Animated.View>
  );
}

const stylesFor = metricStyles(() => StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: INSET - 1,
    justifyContent: 'center',
  },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: radius.pill,
    // The ring is always drawn so the knob's geometry does not shift by a
    // pixel between states; only its colour changes (transparent when OFF).
    borderWidth: 1,
  },
  disabled: {
    opacity: 0.5,
  },
}));
