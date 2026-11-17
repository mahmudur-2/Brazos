import type { ComponentProps } from 'react';
import { Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { KeyboardAvoid } from '../../components/KeyboardAvoid';
import { pillBottomOffset } from '../../lib/meltBarGeometry';
import { layout, metricStyles, spacing, useThemeColors } from '../../lib/theme';
import { litCard, meltBar, textScale } from '../tokens';
import { PINNED_FOOTER_BOTTOM_PADDING, useHideTabBar } from './BottomNav';

type ButtonVariant = NonNullable<ComponentProps<typeof Button>['variant']>;

export type FloatingActionProps = {
  /** The main action's label and press. */
  title: string;
  onPress: () => void;
  /** Any Button variant; `primary` by default. */
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  /** An optional second action beside the main one, always `quiet`. */
  secondary?: { title: string; onPress: () => void; disabled?: boolean };
  /** An optional one-line hint above the pills: a total, a deadline. */
  hint?: string;
};

/**
 * A2-M3 — THE FLOATING ACTION (UI-DIRECTION §7, the bottom rule): a task screen's action floats at
 * its foot with NO plate behind it — one main Button, an optional quiet second action beside it,
 * an optional one-line hint above. It is depth 2, the float: each pill wears the lit card's lift,
 * the bar's own shadow (a dark main or red button keeps its own glow instead).
 *
 * It takes the bar's place: it hides the bar while its screen is focused (`useHideTabBar`) and
 * sits where the bar's pill sat (the same offset from the screen's edge, so the safe area is
 * kept). It rises with the keyboard by itself (components/KeyboardAvoid, padding): mount it as
 * the LAST child of a full-height column, under the screen's scroller (`flex: 1`), and do not wrap
 * it in a second keyboard view. The scroller ends where it begins, so content never runs under it.
 */
export function FloatingAction({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  secondary,
  hint,
}: FloatingActionProps) {
  useHideTabBar();
  const styles = stylesFor();
  const { palette, isDark } = useThemeColors();
  const insets = useSafeAreaInsets();
  const bottom = pillBottomOffset(insets.bottom, meltBar.bottomTuck, meltBar.bottomMin);
  const lift = floatLift(isDark);
  // A dark main or red button that can be pressed already floats on its own glow (Button).
  const mainGlows = isDark && (variant === 'primary' || variant === 'destructive') && !disabled && !loading;

  return (
    <KeyboardAvoid
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      // Risen, the pills sit the pinned foot's breathing room above the keyboard, not the edge offset.
      keyboardVerticalOffset={PINNED_FOOTER_BOTTOM_PADDING - bottom}
    >
      <View style={[styles.foot, { paddingBottom: bottom }]}>
        {hint ? (
          <Text style={[styles.hint, { color: palette.textMuted }]} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
        <View style={styles.row}>
          {secondary ? (
            <Button
              title={secondary.title}
              onPress={secondary.onPress}
              disabled={secondary.disabled}
              variant="quiet"
              style={[styles.share, lift]}
            />
          ) : null}
          <Button
            title={title}
            onPress={onPress}
            variant={variant}
            loading={loading}
            disabled={disabled}
            style={[styles.share, variant === 'ghost' || mainGlows ? null : lift]}
          />
        </View>
      </View>
    </KeyboardAvoid>
  );
}

/** Depth 2: the lit card's lift (ui/tokens.ts `litCard`), the bar's shadow, as native shadow props. */
function floatLift(isDark: boolean): ViewStyle {
  const shadow = (isDark ? litCard.dark : litCard.light).shadow;
  return {
    shadowColor: shadow.color,
    shadowOpacity: shadow.alpha,
    shadowRadius: shadow.radius,
    shadowOffset: { width: 0, height: shadow.y },
  };
}

const stylesFor = metricStyles(() =>
  StyleSheet.create({
    foot: {
      paddingHorizontal: layout.screenGutter,
      paddingTop: spacing.sm,
      gap: spacing.sm,
    },
    hint: {
      ...textScale.label,
      textAlign: 'center',
    },
    row: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    // Equal shares: the pair keeps one width and one height (Button `fill`).
    share: {
      flex: 1,
    },
  })
);
