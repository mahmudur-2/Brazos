import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { glow, metricStyles, radius, useThemeColors, withAlpha } from '../../lib/theme';
import { useOverrideNumber } from '../../lib/designOverrides';
import { USE_NATIVE_DRIVER } from '../../lib/motion';
import { usePressFeedback } from '../../hooks/usePressFeedback';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * The one toggle. In dark: a NEUTRAL track that never changes colour, and a
 * knob that carries the whole state — gold and glowing when ON, the Lux muted
 * grey-green when OFF, sliding left to right as normal. Light keeps its Heritage TRACK
 * (emerald when ON, border when OFF) and, since 2026-08-23, dark's KNOB: the
 * ON knob is the gold ring over the gold tint in both palettes, so the state
 * colour a worker learns in one theme is the state colour in the other. The
 * OFF knob stays each palette's own quiet disc (the Lux muted in dark, white
 * in light), and the halo stays dark-only — a glow is an atmosphere the dark
 * ground has and the cream one does not.
 *
 * emerald D5 REVERSES THE PREVIOUS RUN'S D1 ENTIRELY. That pass had made the
 * dark track emerald when ON and DANGER RED when OFF, arguing that a worker's
 * offline state must be legible at a glance. Masters 23 and 43 agree with each
 * other and neither draws it that way; the emerald/red pairing has no master
 * support at all. Red is retired from this control. "Not taking new work" is a
 * choice, not an error, and colouring it like a failure was the one thing the
 * masters were unanimous about not doing.
 *
 * WHY A NEUTRAL TRACK FIXES A BUG AND NOT JUST A COLOUR. The device pass found
 * Worker Home's "Online" and Services & availability's "Taking new work"
 * disagreeing — the same phase53 `accepting_work` fact, read by two screens,
 * showing two different colours. With the track carrying state, ANY two
 * surfaces that derive a colour from that fact can contradict each other, and
 * the toggle sits beside other derivations of the same boolean (a pulse dot, a
 * status word, a visibility line). With the track constant, there is nothing
 * left for a second derivation to disagree WITH: the knob's colour and the
 * knob's position are the only stateful things here, and both read the same
 * `value` prop through the same `position` animation. tests/mode.test.mjs
 * pins that, and pins that both screens hand this control the identical
 * expression.
 *
 * THE GOLD KNOB IS LINE-WORK, NOT A FILL. Decision 3 forbids gold fills and
 * tests/goldOnForest.test.mjs enforces it tree-wide, so the ON knob is a gold
 * RING around a gold-TINTED face under a gold halo — the compromise emerald
 * D5 names, and the same resolution prestige(4b) and fidelity(6) reached for
 * the timeline connector and the centre [ + ]. It is NOT allowlisted.
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
  const press = usePressFeedback();
  const reduceMotion = useReducedMotion();

  // RUN S2 (C8) — the drawn geometry dials; TRAVEL derives from them so the
  // knob still lands exactly inside the rim at any size. Colours stay D5's.
  const trackWidth = useOverrideNumber('toggle.trackWidth') ?? TRACK_WIDTH;
  const trackHeight = useOverrideNumber('toggle.trackHeight') ?? TRACK_HEIGHT;
  const knobSize = useOverrideNumber('toggle.knobSize') ?? KNOB;
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

  // THE TRACK IS STATE-BLIND IN DARK (D5). Deliberately written without a
  // `value` term so it is not merely the same colour today but structurally
  // incapable of carrying state: a neutral dark surface under the ordinary
  // hairline, identical ON and OFF. Light is untouched and keeps its Heritage
  // emerald-when-on track.
  const trackColor = isDark ? palette.neutralBg : value ? palette.emerald : palette.border;
  const trackBorder = isDark ? palette.border : 'transparent';

  // ...so the KNOB carries the whole state, and every part of it reads the one
  // `value` prop. Gold as line-work: a gold ring around a gold-tinted face,
  // never a gold fill (decision 3 / tests/goldOnForest.test.mjs).
  // `value` branches FIRST, deliberately: the ON face is one colour for the
  // whole app, and only the OFF face is a per-palette read. Written the other
  // way round (isDark first) the two themes could drift apart again.
  // Fix run D6: the dark OFF face is `textMuted` (the Lux `.switch i` muted,
  // lux-notif.html). It was `onPrimary`, which the 09-26 refresh turned
  // near-black — a dark disc on a dark track, so OFF could not be seen.
  const knobColor = value
    ? withAlpha(palette.gold, 0.92)
    : isDark
      ? palette.textMuted
      : palette.white;
  const knobBorder = value ? palette.gold : 'transparent';
  const knobGlow = isDark && value ? glow.halo(withAlpha(palette.gold, 0.55)) : null;

  return (
    // MOTION1 (C1): the shared press spring, on a wrapper so the track's own
    // fixed geometry is untouched and the knob's translate stays independent
    // of it.
    <Animated.View style={press.style}>
    <Pressable
      onPress={() => onValueChange(!value)}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
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
          knobGlow,
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
