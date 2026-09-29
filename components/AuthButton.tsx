import { useRef, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authColors, authRadius, authSizes, authSpacing, authType } from '../lib/authTheme';
import { authSurface, fonts, useThemeColors, withAlpha } from '../lib/theme';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { litBetween } from '../ui/primitives/LitSurface';

/**
 * 2026-09-21 — THE SHIPPED WELCOME PAGE'S CONTROLS (docs/mockups/html/lux/
 * welcome-ship.html and -light), the page's own numbers: the glyph 22, the
 * chevron 18 at 18 from the right edge, the hairline the gold at .62, the
 * lead's specular edge white at .14 in both themes, and — in DARK ONLY — its
 * depth 12/30 in the shade at .35 plus a 6/26 gold under-glow at .10. Light
 * draws the lead flat, so the two boxed actions read identical in size (the
 * operator, on the phone, 2026-09-21); the text link's chevron 16.
 */
const HERO = {
  glyph: 22,
  chevron: 18,
  chevronInset: 18,
  linkChevron: 16,
  hairlineAlpha: 0.62,
  specularAlpha: 0.14,
  shadeAlpha: 0.35,
  glowAlpha: 0.1,
} as const;

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
   * The shipped Welcome page's dress (HERO above). Every one is optional and
   * absent changes nothing, so the other auth screens keep their control.
   *
   * `hero`: the page's boxed control — 52 tall at radius 22, the gold
   * hairline, the 17/600 label; on a ghost, the page's TEXT LINK instead (44
   * tall, no box, 16/600). `lit`: the lead action's fill between the two
   * `authCta*` stops (flat forest in light) with its specular edge and depth.
   * `icon`: a leading glyph, centred with the label as one group.
   * `chevron`: the trailing chevron. `light`: a layer drawn UNDER the label
   * — the rim light — which brings its own clip and cover.
   */
  hero?: boolean;
  lit?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  chevron?: boolean;
  light?: ReactNode;
  /**
   * 2026-09-28 (LUX-LIST-64 #10) — THE ACCENT CTA: the one mint (the light
   * token's green in light) whenever it can be tapped, and while it cannot, the
   * waiting look — #909594 on #073328 — rather than a faded copy of itself.
   */
  accent?: boolean;
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
  accent = false,
}: AuthButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const { palette, isDark } = useThemeColors();
  const isDisabled = disabled || loading;
  const isGhost = variant === 'ghost';
  const isLink = hero && isGhost;

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

  // THE HERO DRESS, in both themes from the auth roles. The lead (lit): the
  // page's fill, the ink (cream in dark, white in light) and gold glyphs. The
  // outlined second: no fill, the gold hairline, the label gold in dark and
  // forest in light — as are its glyphs. The link: the same ink as the second,
  // no box. Nothing here is read unless `hero` is set.
  const heroInk = lit
    ? isDark
      ? palette.authInk
      : authColors.onDark
    : isDark
      ? palette.authGold
      : authColors.forest;
  const heroGlyph = lit ? palette.authGold : heroInk;
  const heroShape: ViewStyle | null = hero
    ? isLink
      ? styles.heroLink
      : {
          height: authSizes.heroButton,
          borderRadius: authRadius.heroButton,
          borderColor: withAlpha(palette.authGold, HERO.hairlineAlpha),
          backgroundColor: lit ? palette.authCtaBottom : 'transparent',
          paddingHorizontal: 0,
        }
    : null;
  const heroFill = hero && lit ? litBetween({ top: palette.authCtaTop, bottom: palette.authCtaBottom, flat: !isDark }) : undefined;
  const heroDepth: ViewStyle | null =
    hero && lit
      ? {
          boxShadow: isDark
            ? `inset 0 1px 0 ${withAlpha(palette.white, HERO.specularAlpha)}, ` +
              `0 12px 30px ${withAlpha(palette.authShade, HERO.shadeAlpha)}, ` +
              `0 6px 26px ${withAlpha(palette.authGold, HERO.glowAlpha)}`
            : `inset 0 1px 0 ${withAlpha(palette.white, HERO.specularAlpha)}`,
        }
      : null;
  const accentShape: ViewStyle | null = accent
    ? {
        backgroundColor: isDisabled && !loading ? palette.waitingFill : isDark ? palette.primary : palette.emerald,
        borderColor: 'transparent',
      }
    : null;
  const labelTint = accent
    ? isDisabled && !loading
      ? palette.waitingInk
      : isDark
        ? palette.onPrimary
        : palette.white
    : hero
      ? heroInk
      : tint;

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
          heroShape,
          heroFill,
          heroDepth,
          accentShape,
          // Dimmed, but still clearly the same control — the reference's
          // hierarchy has to survive the disabled state. The accent tone waits
          // in its own colours instead (#10).
          isDisabled && !accent && styles.disabled,
        ]}
      >
        {light ?? null}
        {loading ? (
          <ActivityIndicator color={labelTint} />
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
                  hero && (isLink ? styles.linkLabel : styles.heroLabel),
                  { color: labelTint },
                ]}
                numberOfLines={1}
              >
                {title}
              </Text>
            );
            // The link carries its chevron inline; a button with a glyph takes
            // the row; the plain label stays the Pressable's direct child,
            // exactly as before.
            if (isLink) {
              return (
                <View style={styles.linkRow}>
                  {label}
                  {chevron ? <Ionicons name="chevron-forward" size={HERO.linkChevron} color={heroGlyph} /> : null}
                </View>
              );
            }
            return icon ? (
              <View style={styles.group}>
                <Ionicons name={icon} size={HERO.glyph} color={heroGlyph} />
                {label}
              </View>
            ) : (
              label
            );
          })()
        )}
        {chevron && !isLink ? (
          <Ionicons name="chevron-forward" size={HERO.chevron} color={heroGlyph} style={styles.chevron} />
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
  // 2026-09-21 — the shipped Welcome page's controls.
  heroLabel: {
    ...authType.heroButton,
    fontFamily: fonts.display,
  },
  heroLink: {
    height: authSizes.heroLink,
    marginTop: -3,
    borderRadius: 0,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },
  linkLabel: {
    ...authType.heroLink,
    fontFamily: fonts.display,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: authSpacing.md,
  },
  chevron: {
    position: 'absolute',
    right: HERO.chevronInset,
  },
});
