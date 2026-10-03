import { useRef, type ComponentProps, type Ref } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressScale } from './PressScale';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { spacing, themedStyles, useThemeColors, withAlpha, type ColorPalette } from '../lib/theme';
import { usePinnedFooterPadding } from '../ui/primitives';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** refs/bottom-bar.html: both buttons 52 tall, fully round. */
export const POST_BAR_BUTTON = 52;

type Action = {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
};

/**
 * 2026-09-28 (LUX-LIST-64 #41, #42) — THE POSTING BAR, right above the tab bar
 * (refs/bottom-bar.html): no space above or below the buttons, 16 at the sides,
 * 14 between. The quiet left button (flex 3 — "Save draft" on the review step,
 * "Back to Home" on the live page) in its dark fill and green rim, and the
 * commitment on the right (flex 4 — "Publish" with its rocket, which nudges up
 * and right under the finger; "View job and bids" with its arrow): the one flat
 * mint under a faint white rim and its soft glow. A waiting commitment is grey
 * on the deep green (#909594 on #073328). Light takes the light bar and the
 * light primary.
 *
 * `primaryRef` hands the screen the commitment's box, which the Seal transition
 * measures to shrink it where it stands (#42).
 */
export function PostJobBar({
  secondary,
  secondaryIcon,
  primary,
  primaryIcon,
  primaryTrailingIcon,
  primaryDisabled,
  primaryRef,
  hidePrimary,
  hideSecondary,
}: {
  secondary?: Action;
  secondaryIcon?: IoniconName;
  primary: Action;
  primaryIcon?: IoniconName;
  primaryTrailingIcon?: IoniconName;
  primaryDisabled?: boolean;
  primaryRef?: Ref<View>;
  /** The Seal takes the commitment's place while it runs. */
  hidePrimary?: boolean;
  hideSecondary?: boolean;
}) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const reducedMotion = useReducedMotion();
  const nudge = useRef(new Animated.Value(0)).current;

  function press(to: number) {
    Animated.timing(nudge, {
      toValue: to,
      duration: reducedMotion === false ? 250 : 0,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }

  const ink = primaryDisabled ? colors.waitingInk : colors.publishInk;

  // 2026-09-30: the tab bar floats; the bar's ground runs on under the pill and its buttons sit
  // above it, a pinned footer's breathing room clear.
  const footerPad = usePinnedFooterPadding();

  return (
    <View style={[styles.bar, { paddingBottom: footerPad }]}>
      {secondary ? (
        <PressScale
          onPress={secondary.onPress}
          style={[styles.button, styles.secondary, hideSecondary && styles.hidden]}
          accessibilityRole="button"
          accessibilityLabel={secondary.accessibilityLabel ?? secondary.label}
          disabled={hideSecondary}
        >
          {secondaryIcon ? <Ionicons name={secondaryIcon} size={20} color={colors.draftIcon} /> : null}
          <Text style={styles.secondaryText} numberOfLines={1}>
            {secondary.label}
          </Text>
        </PressScale>
      ) : null}
      <View ref={primaryRef} collapsable={false} style={styles.primarySlot}>
        <PressScale
          onPress={primary.onPress}
          onPressIn={() => press(1)}
          onPressOut={() => press(0)}
          disabled={primaryDisabled || hidePrimary}
          style={[
            styles.button,
            styles.primary,
            primaryDisabled ? styles.primaryWaiting : styles.primaryLive,
            hidePrimary && styles.hidden,
          ]}
          accessibilityRole="button"
          accessibilityLabel={primary.accessibilityLabel ?? primary.label}
          accessibilityState={{ disabled: !!primaryDisabled }}
        >
          {primaryIcon ? (
            <Animated.View
              style={{
                transform: [
                  { translateX: nudge.interpolate({ inputRange: [0, 1], outputRange: [0, 2] }) },
                  { translateY: nudge.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
                ],
              }}
            >
              <Ionicons name={primaryIcon} size={23} color={ink} />
            </Animated.View>
          ) : null}
          <Text style={[styles.primaryText, { color: ink }]} numberOfLines={1}>
            {primary.label}
          </Text>
          {primaryTrailingIcon ? <Ionicons name={primaryTrailingIcon} size={18} color={ink} /> : null}
        </PressScale>
      </View>
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.barRim,
      backgroundColor: colors.barGround,
    },
    button: {
      height: POST_BAR_BUTTON,
      borderRadius: POST_BAR_BUTTON / 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondary: {
      flex: 3,
      gap: 12,
      borderWidth: 1.5,
      borderColor: colors.draftRim,
      backgroundColor: colors.draftFill,
    },
    secondaryText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.draftInk,
    },
    primarySlot: {
      flex: 4,
    },
    primary: {
      gap: 10,
    },
    // `0 0 22px rgba(79,197,140,.24)` — the primary's own soft glow, one
    // geometry in both themes; only its colour is the palette's.
    primaryLive: {
      backgroundColor: colors.primary,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.09),
      shadowColor: colors.primary,
      shadowOpacity: 0.24,
      shadowRadius: 11,
      shadowOffset: { width: 0, height: 0 },
    },
    primaryWaiting: {
      backgroundColor: colors.waitingFill,
    },
    primaryText: {
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    hidden: {
      opacity: 0,
    },
  })
);
