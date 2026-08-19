import { useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import { authColors, authRadius, authSizes, authSpacing, authType } from '../lib/authTheme';
import { authSurface, fonts, useThemeColors } from '../lib/theme';

const USE_NATIVE_DRIVER = Platform.OS !== 'web';

// Restrained press feedback: enough to register as a physical control, not
// enough to read as a bounce. 100ms in, 120ms back.
const PRESS_SCALE = 0.985;
const PRESS_IN_MS = 100;
const PRESS_OUT_MS = 120;

type AuthButtonProps = {
  title: string;
  onPress: () => void;
  /** `ghost` is the reference's .btn.ghost — outlined, forest label. */
  variant?: 'primary' | 'ghost';
  /**
   * `semibold` is one step down from the default. The onboarding CTAs use it:
   * they sit under a lot of quiet supporting copy, and at full weight the
   * button was the loudest thing on a screen whose job is to be read.
   */
  weight?: 'bold' | 'semibold';
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  /**
   * Opt in to the Prestige mapping (masters 2/3/4 only). Absent — every other
   * auth screen — the button renders byte-identically to the Heritage ivory
   * control it has always been.
   */
  themed?: boolean;
};

/**
 * The auth flow's CTA. Separate from components/Button.tsx because this
 * surface runs on the emerald brand palette rather than the in-app forest/cream
 * one, and because the reference calls for a press-scale microinteraction the
 * shared button deliberately doesn't have.
 *
 * The label is replaced by a spinner in place while loading — the button keeps
 * its height and width, so a submit never reflows the form under the user's
 * thumb.
 */
export function AuthButton({
  title,
  onPress,
  variant = 'primary',
  weight = 'bold',
  loading = false,
  disabled = false,
  accessibilityHint,
  themed = false,
}: AuthButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const { palette, isDark } = useThemeColors();
  const isDisabled = disabled || loading;
  const isGhost = variant === 'ghost';

  // Decision 3, resolved for this surface. Dark: `primary` is the STANDARD
  // control (surface fill, gold hairline, cream serif label) because no auth
  // master draws a solid conversion fill, and `ghost` is the gold serif text
  // on the same hairline. Light keeps the Heritage forest fill and forest
  // ghost label exactly.
  const surface = authSurface(palette, isDark);
  const prestige = themed && isDark;
  const tint = prestige
    ? isGhost
      ? surface.accent
      : surface.ink
    : isGhost
      ? authColors.forest
      : authColors.onDark;
  const themedShape = prestige
    ? {
        backgroundColor: isGhost ? 'transparent' : palette.surface,
        borderColor: surface.line,
      }
    : null;

  const animate = (to: number, duration: number) =>
    Animated.timing(scale, {
      toValue: to,
      duration,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => !isDisabled && animate(PRESS_SCALE, PRESS_IN_MS)}
        onPressOut={() => animate(1, PRESS_OUT_MS)}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        style={[
          styles.base,
          isGhost ? styles.ghost : styles.primary,
          themedShape,
          // Dimmed, but still clearly the same control — the reference's
          // hierarchy has to survive the disabled state.
          isDisabled && styles.disabled,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={tint} />
        ) : (
          <Text
            style={[
              styles.label,
              weight === 'semibold' && styles.labelSemibold,
              // Decision 9's serif button label, applied only where the
              // conversion reaches: the untouched auth screens keep the sans.
              themed && styles.labelSerif,
              { color: tint },
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    height: authSizes.button,
    borderRadius: authRadius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: authSpacing.lg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  primary: {
    backgroundColor: authColors.forest,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: authColors.line,
  },
  disabled: {
    opacity: 0.55,
  },
  label: {
    ...authType.button,
  },
  labelSemibold: {
    fontWeight: '600',
  },
  labelSerif: {
    fontFamily: fonts.display,
    fontSize: 19,
  },
});
