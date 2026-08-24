import { type ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { canSwipe, canWorklet, motionCapability, resolveMotion120 } from '../lib/motion120';
import {
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';
import {
  SLIDER_THUMB_SIZE,
  SLIDER_TRACK_HEIGHT,
  fractionForValue,
  valueForFraction,
  type FilterSliderProps,
} from './FilterSlider.shared';

export type { FilterSliderProps } from './FilterSlider.shared';

/**
 * The filter sheet's slider — on whichever driver this binary has.
 *
 * THE FALLBACK IS A REAL CONTROL, not a disabled track. Without
 * gesture-handler there is nothing to recognise a drag, and a rail that looks
 * draggable and is not is worse than no rail: the two step buttons move the
 * value by exactly the granularity the drag snaps to, so both paths reach the
 * same set of values and neither can produce one the other cannot. The track
 * still renders, and still fills — it is the READOUT on this path rather than
 * the input, which is what keeps the two builds looking like one design.
 *
 * The arithmetic is `fractionForValue` / `valueForFraction` from the shared
 * module, so a dragged slider and a stepped one cannot disagree about where a
 * value sits.
 */
function FilterSliderFallback({
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
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const accent = isDark ? colors.gold : colors.primary;
  const fraction = fractionForValue(value, min, max);

  const stepTo = (next: number) => {
    const legal = valueForFraction(fractionForValue(next, min, max), min, max, step);
    if (legal !== value) onChange(legal);
  };

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
        <Pressable
          onPress={() => stepTo(value - step)}
          disabled={value <= min}
          hitSlop={8}
          style={({ pressed }) => [
            styles.stepButton,
            value <= min && styles.stepButtonDisabled,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
        >
          <Ionicons name="remove" size={20} color={accent} />
        </Pressable>

        <View style={styles.track}>
          <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
          <View style={[styles.thumb, { left: `${fraction * 100}%` }]} />
        </View>

        <Pressable
          onPress={() => stepTo(value + step)}
          disabled={value >= max}
          hitSlop={8}
          style={({ pressed }) => [
            styles.stepButton,
            value >= max && styles.stepButtonDisabled,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
        >
          <Ionicons name="add" size={20} color={accent} />
        </Pressable>
      </View>

      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </View>
  );
}

/**
 * Chosen ONCE, at module load, and it needs BOTH vendors — the same shape
 * SwipeableRow uses and for the same reason. `canSwipe()` is what recognises
 * the drag; `canWorklet()` is what can follow it per frame on the UI thread. A
 * build with a recogniser and no worklets would drag through a JS round trip
 * per frame, which is worse than the stepper.
 */
const Impl = resolveMotion120<ComponentType<FilterSliderProps>>(
  { ...motionCapability, gestures: canSwipe() && canWorklet(), reanimated: canWorklet() },
  'gestures',
  () => require('./FilterSlider.motion120').FilterSlider as ComponentType<FilterSliderProps>,
  FilterSliderFallback
);

export function FilterSlider(props: FilterSliderProps) {
  return <Impl {...props} />;
}

export const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    row: {
      gap: spacing.sm,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    label: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textMuted,
    },
    value: {
      flexShrink: 1,
      fontSize: 17,
      fontWeight: '700',
      color: colors.ink,
    },
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    stepButton: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    // A neutral fill rather than an opacity dim on a live colour — the same
    // disabled rule the rest of the app follows.
    stepButtonDisabled: {
      backgroundColor: colors.neutralBg,
      borderColor: colors.neutralBg,
    },
    pressed: { opacity: 0.8 },
    track: {
      flex: 1,
      height: SLIDER_TRACK_HEIGHT,
      borderRadius: radius.pill,
      backgroundColor: colors.neutralBg,
      justifyContent: 'center',
    },
    fill: {
      position: 'absolute',
      left: 0,
      height: SLIDER_TRACK_HEIGHT,
      borderRadius: radius.pill,
      backgroundColor: colors.primary,
    },
    thumb: {
      position: 'absolute',
      width: SLIDER_THUMB_SIZE,
      height: SLIDER_THUMB_SIZE,
      borderRadius: radius.pill,
      // Half the handle, so the centre lands on the value rather than its
      // leading edge.
      marginLeft: -SLIDER_THUMB_SIZE / 2,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    footnote: {
      fontSize: 13,
      color: colors.textMuted,
    },
  })
);
