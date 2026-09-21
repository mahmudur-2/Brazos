import { useRef, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authColors, authRadius, authShadows, authSizes, authSpacing, authType } from '../lib/authTheme';
import { authSurface, fonts, useThemeColors } from '../lib/theme';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { litBetween } from '../ui/primitives/LitSurface';

/** The glyph's box and the chevron's, as the picked Welcome page draws them. */
const GLYPH = 22;
const CHEVRON = 18;

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
  /**
   * 2026-09-21 — the picked Welcome page's actions (docs/mockups/html/lux/
   * welcome-motion.html). Every one of these is optional and absent changes
   * nothing, so the other auth screens keep their control exactly.
   *
   * `hero`: the page's shape, 58 tall at radius 22. `lit`: the lead action's
   * fill (`authCtaTop` → `authCtaBottom`, flat forest in light) with the
   * page's depth under it. `icon`: a leading glyph, centred with the label as
   * one group. `chevron`: the trailing chevron at the right edge, in the
   * accent. `light`: a layer drawn UNDER the label — the rim light — which
   * brings its own clip and cover.
   */
  hero?: boolean;
  lit?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  chevron?: boolean;
  light?: ReactNode;
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
  hero = false,
  lit = false,
  icon,
  chevron = false,
  light,
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
  // The hero's fill: the picked page's gradient in dark, the Heritage forest
  // flat in light (both `authCta*` stops ARE forest there, so `litBetween`
  // adds no style key and the base fill below is the one it always had).
  const heroFill = lit
    ? [
        { backgroundColor: isGhost ? 'transparent' : palette.authCtaBottom },
        isGhost ? undefined : litBetween({ top: palette.authCtaTop, bottom: palette.authCtaBottom, flat: !prestige }),
      ]
    : null;
  // The glyph and the chevron: the accent (gold in dark, the emerald in
  // light) on a ghost; on the filled control, gold — decision 3's one
  // permitted gold-on-forest, the master 44 hero card's own content.
  const glyphColor = prestige ? surface.accent : isGhost ? authColors.forest : authColors.gold;

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
          hero && styles.hero,
          lit && !isGhost && (prestige ? authShadows.hero : null),
          heroFill,
          // Dimmed, but still clearly the same control — the reference's
          // hierarchy has to survive the disabled state.
          isDisabled && styles.disabled,
        ]}
      >
        {light ?? null}
        {loading ? (
          <ActivityIndicator color={tint} />
        ) : (
          (() => {
            const label = (
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
            );
            // Only a button WITH a glyph takes the row: the plain label stays
            // the Pressable's direct child, exactly as before.
            return icon ? (
              <View style={styles.group}>
                <Ionicons name={icon} size={GLYPH} color={glyphColor} />
                {label}
              </View>
            ) : (
              label
            );
          })()
        )}
        {chevron ? (
          <Ionicons name="chevron-forward" size={CHEVRON} color={glyphColor} style={styles.chevron} />
        ) : null}
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
  // 2026-09-21 — the picked Welcome page's actions.
  hero: {
    height: authSizes.heroButton,
    borderRadius: authRadius.heroButton,
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: authSpacing.md,
  },
  chevron: {
    position: 'absolute',
    right: authSpacing.lg + 2,
  },
});
