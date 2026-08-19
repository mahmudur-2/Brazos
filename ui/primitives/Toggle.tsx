import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet } from 'react-native';
import { radius, useThemeColors, withAlpha } from '../../lib/theme';

/**
 * The one toggle (Prestige, pre-made decision 7): a cream knob in BOTH
 * states; ON rides the emerald track under a gold hairline rim, OFF the
 * danger red. Light keeps its Heritage arrangement — emerald track, white
 * knob, no rim.
 *
 * DARK STATE COLOUR IS AN OPERATOR CALL (dark device pass, D1). On a real
 * phone the mint ON-track and the near-black OFF-track were the same dark
 * green smudge — the control read as decoration, not as state. ON now takes
 * the emerald the Worker Home potential-earnings figure uses and OFF takes
 * the danger token, the same red master 43 gives its offline dot. This
 * deliberately deviates from the set's "no master uses a red control" note:
 * the toggle is the one control whose OFF state is a fact the user must be
 * able to read at a glance (they are invisible to customers), and the same
 * master pairs that fact with that red two rows below. Light is untouched.
 *
 * Drawn rather than RN's Switch because the masters' rim cannot exist there:
 * iOS ignores any attempt to border the native track, and per-platform
 * track/thumb props were producing three different toggles across the app.
 * The decision resolves conflict B-5 (gold knob on 23 vs cream on 39) — the
 * knob is cream everywhere; only the rim is gold.
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
const TRAVEL = TRACK_WIDTH - KNOB - INSET * 2;

type ToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

export function Toggle({ value, onValueChange, disabled = false, accessibilityLabel }: ToggleProps) {
  const { palette, isDark } = useThemeColors();
  const position = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(position, {
      toValue: value ? 1 : 0,
      duration: 160,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [position, value]);

  // ON is emerald in both palettes (light already was); OFF is the danger red
  // in dark and keeps the Heritage neutral border in light.
  const trackColor = value ? palette.emerald : isDark ? palette.danger : palette.border;
  const rimColor = value && isDark ? withAlpha(palette.gold, 0.6) : 'transparent';
  const knobColor = isDark ? palette.onPrimary : palette.white;

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      style={[
        styles.track,
        { backgroundColor: trackColor, borderColor: rimColor },
        disabled && styles.disabled,
      ]}
    >
      <Animated.View
        style={[
          styles.knob,
          { backgroundColor: knobColor },
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
  );
}

const styles = StyleSheet.create({
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
  },
  disabled: {
    opacity: 0.5,
  },
});
