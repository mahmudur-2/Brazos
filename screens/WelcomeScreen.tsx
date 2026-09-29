import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthButton } from '../components/AuthButton';
import { AuthScaffold } from '../components/AuthScaffold';
import { RimLight } from '../components/RimLight';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { authRadius, authSizes, authSpacing, authType } from '../lib/authTheme';
import { useLaunchComplete } from '../lib/launchContext';
import type { AuthStackNavigation } from '../lib/navigation';
import { fonts, themedStyles, useThemeColors, withAlpha, type ColorPalette } from '../lib/theme';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { backgroundImageStyle } from '../ui/primitives/LitSurface';

// One driver, 500ms, with each element reading a different slice of it. That
// produces the reference's short stagger without five timers to keep in sync,
// and it finishes fast enough that nothing waits on it — the buttons are
// hit-testable from the first frame regardless of their opacity.
const ENTRANCE_MS = 500;
const REDUCED_ENTRANCE_MS = 160;

/** [start, end] within the 0..1 driver, in the order things should arrive. */
const STAGGER = {
  art: [0, 0.5],
  badgeA: [0.1, 0.52],
  badgeB: [0.18, 0.6],
  badgeC: [0.26, 0.68],
  eyebrow: [0.3, 0.72],
  headline: [0.36, 0.8],
  body: [0.42, 0.86],
  actions: [0.48, 0.92],
} as const;

/**
 * THE SHIPPED WELCOME PAGE (docs/mockups/html/lux/welcome-ship.html and
 * welcome-ship-light.html, 2026-09-21 — the operator's pick, the reference
 * composition on the Emerald Lux Glass ground with the rim glint on the lead
 * action; DECISIONS 18). This screen is matched to those pages region by
 * region, and every number below is the page's own, measured on its 393 × 852
 * frame. The app draws the page's art in a 353 × 300 canvas at the top of the
 * content column (the page's 20-pt gutter), scaled down only on a narrower
 * phone; the corner arcs are the scaffold's backdrop; the ground and its
 * light layers are the scaffold's `ground`.
 *
 * HOW A DISC IS LIT. Exactly as the page draws it: one radial fill from the
 * three `heroDisc*` stops, a crisp inset rim light along the top-right edge
 * (the front disc along its lower-right too), a soft inset glow behind it, a
 * deep shadow under the disc, and a faint outer glow — all `boxShadow`, which
 * React Native draws natively on the New Architecture this app runs on.
 */
const ART = {
  width: 353,
  height: 300,
  /** The art's top edge, from the top of the screen — the page's 60. */
  top: 60,
  /**
   * The ring and the discs, OUTER sizes: the page writes each as a content
   * box with a 1-pt border outside it (216 + 2), and React Native's box is
   * the border box — so the page's 216 is 218 here, its 248 is 250, and the
   * badges' 40 is 42. The positions are the outer edges in both.
   */
  ghost: { left: 46, top: 8, size: 250, alpha: { dark: 0.1, light: 0.18 } },
  discs: [
    { key: 'back', left: 62, top: 24, size: 218 },
    { key: 'mid', left: 98, top: 71, size: 202 },
    { key: 'front', left: 127, top: 111, size: 174 },
  ],
  discOutline: { dark: 0.2, light: 0.3 },
  /** The three badges' positions; their labels are written where they render. */
  badges: {
    a: { left: 11, top: 65, rotate: '-5deg' },
    b: { left: 188, top: 143, rotate: '5deg' },
    c: { left: 75, top: 246, rotate: undefined },
  },
  badge: {
    glyph: 16,
    gap: 7,
    paddingLeft: 11,
    paddingRight: 13,
    fill: { dark: 0.86, light: 0.96 },
    hairline: 0.5,
    specular: { dark: 0.16, light: 0.85 },
    shade: { dark: 0.35, light: 0.1 },
  },
} as const;

/**
 * The discs' shadows, per theme, as the pages write them:
 * [offsetX, offsetY, blur, role, alpha, inset?].
 */
type Shadow = readonly [number, number, number, 'accent' | 'gold' | 'shade', number, boolean?];
const DISC_SHADOWS: Record<'back' | 'mid' | 'front', { dark: readonly Shadow[]; light: readonly Shadow[] }> = {
  back: {
    dark: [[-1.5, 1.5, 0, 'accent', 0.55, true], [-4, 4, 14, 'accent', 0.2, true], [0, 26, 50, 'shade', 0.45], [0, 0, 60, 'accent', 0.1]],
    light: [[-1.5, 1.5, 0, 'accent', 0.38, true], [-4, 4, 14, 'accent', 0.14, true], [0, 26, 50, 'shade', 0.18], [0, 0, 60, 'accent', 0.08]],
  },
  mid: {
    dark: [[-1.5, 1.5, 0, 'gold', 0.62, true], [-4, 4, 12, 'gold', 0.2, true], [0, 26, 50, 'shade', 0.45]],
    light: [[-1.5, 1.5, 0, 'gold', 0.7, true], [-4, 4, 12, 'gold', 0.24, true], [0, 26, 50, 'shade', 0.18]],
  },
  front: {
    dark: [[-1.5, 1, 0, 'gold', 0.72, true], [-4, 3, 12, 'gold', 0.22, true], [-1, -2.5, 0, 'gold', 0.55, true], [-3, -6, 12, 'gold', 0.24, true], [0, 26, 50, 'shade', 0.45], [0, 0, 46, 'gold', 0.1]],
    light: [[-1.5, 1, 0, 'gold', 0.8, true], [-4, 3, 12, 'gold', 0.26, true], [-1, -2.5, 0, 'gold', 0.62, true], [-3, -6, 12, 'gold', 0.26, true], [0, 26, 50, 'shade', 0.18], [0, 0, 46, 'gold', 0.14]],
  },
};

/** The copy block and the actions, the page's own distances. */
const LAYOUT = {
  /** The page's copy and actions sit 11 inside the 20-pt gutter (left 31). */
  inset: 11,
  /** The eyebrow's line box begins 14 under the art box (374 on the page; 26 under the last badge). */
  eyebrowGap: 14,
  headlineGap: 9,
  bodyGap: 12,
  /** The actions end 49 above the bottom of the screen. */
  actionsBottom: 49,
  actionsGap: 11,
  /** The headline's shadow, dark only: 0 2 22 at .35. */
  headlineShadow: { alpha: 0.35, offset: 2, radius: 22 },
} as const;

type EntranceTransform =
  | { rotate: string }
  | { translateY: Animated.AnimatedInterpolation<number> }
  | { scale: Animated.AnimatedInterpolation<number> };

export function WelcomeScreen() {
  const navigation = useNavigation<AuthStackNavigation>();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const launchComplete = useLaunchComplete();
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // The art box's own width: the page's canvas is 353 wide, and on a narrower
  // phone the whole canvas scales down from its top-left corner.
  const [artWidth, setArtWidth] = useState<number>(ART.width);
  const artScale = Math.min(1, artWidth / ART.width);

  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Held until the launch layer is gone: running underneath it would spend
    // the entrance where nobody can see it and leave the screen static.
    if (reducedMotion === null || !launchComplete) return;

    const animation = Animated.timing(enter, {
      toValue: 1,
      duration: reducedMotion ? REDUCED_ENTRANCE_MS : ENTRANCE_MS,
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    animation.start();
    return () => animation.stop();
  }, [enter, launchComplete, reducedMotion]);

  const still = reducedMotion === true;

  /**
   * Entrance style for one element. `rotate` and `scale` are folded in here
   * rather than left on a static style, because a `transform` further along a
   * style array replaces the whole array rather than merging with it.
   */
  function step(
    range: readonly [number, number],
    options: { lift?: number; rotate?: string; scaleFrom?: number } = {}
  ) {
    const { lift = 12, rotate, scaleFrom } = options;
    const between = (from: number, to: number) =>
      enter.interpolate({
        inputRange: [range[0], range[1]],
        outputRange: [from, to],
        extrapolate: 'clamp',
      });

    const transform: EntranceTransform[] = [];
    if (rotate) transform.push({ rotate });
    if (!still) {
      if (scaleFrom !== undefined) transform.push({ scale: between(scaleFrom, 1) });
      transform.push({ translateY: between(lift, 0) });
    }

    return { opacity: between(0, 1), transform };
  }

  const theme = isDark ? 'dark' : 'light';
  const role = (name: Shadow[3]) =>
    name === 'accent' ? colors.authAccent : name === 'gold' ? colors.authGold : colors.authShade;
  const shadowsFor = (key: keyof typeof DISC_SHADOWS): ViewStyle => ({
    boxShadow: DISC_SHADOWS[key][theme]
      .map(([x, y, blur, name, alpha, inset]) => `${inset ? 'inset ' : ''}${x}px ${y}px ${blur}px ${withAlpha(role(name), alpha)}`)
      .join(', '),
  });
  const discFill = backgroundImageStyle(
    `radial-gradient(circle at 36% 30%, ${colors.heroDiscTop} 0%, ${colors.heroDiscMid} 50%, ${colors.heroDiscBottom} 100%)`
  );
  const badgeSurface: ViewStyle = {
    backgroundColor: withAlpha(colors.authBadgeFill, ART.badge.fill[theme]),
    borderColor: withAlpha(colors.authGold, ART.badge.hairline),
    boxShadow: `inset 0 1px 0 ${withAlpha(colors.white, ART.badge.specular[theme])}, 0 10px 30px ${withAlpha(colors.authShade, ART.badge.shade[theme])}`,
  };
  // The shadow's geometry is on the shared style; only its colour forks — the
  // page draws it in dark and not in light (alpha 0), a colour translation.
  const headlineShadow = {
    textShadowColor: withAlpha(colors.authShade, isDark ? LAYOUT.headlineShadow.alpha : 0),
  };

  const rimLight = <RimLight radius={authRadius.heroButton} />;

  return (
    <AuthScaffold backdrop="full" themed ground>
      <View
        style={[
          styles.art,
          { marginTop: Math.max(0, ART.top - insets.top), height: ART.height * artScale },
        ]}
        onLayout={(event) => setArtWidth(event.nativeEvent.layout.width)}
      >
        {/* The static scale on its own View: a transform further along a style
            array replaces the whole array, so the entrance below gets one of
            its own inside it. */}
        <View style={[styles.canvas, { transform: [{ scale: artScale }] }]}>
        <Animated.View style={[StyleSheet.absoluteFill, step(STAGGER.art, { lift: 0, scaleFrom: 0.92 })]}>
          <View
            style={[
              styles.ring,
              {
                left: ART.ghost.left,
                top: ART.ghost.top,
                width: ART.ghost.size,
                height: ART.ghost.size,
                borderRadius: ART.ghost.size / 2,
                borderColor: withAlpha(colors.authGold, ART.ghost.alpha[theme]),
              },
            ]}
          />
          {ART.discs.map((disc) => (
            <View
              key={disc.key}
              style={[
                styles.disc,
                discFill,
                {
                  left: disc.left,
                  top: disc.top,
                  width: disc.size,
                  height: disc.size,
                  borderRadius: disc.size / 2,
                  borderColor: withAlpha(colors.authGold, ART.discOutline[theme]),
                },
                shadowsFor(disc.key),
              ]}
            />
          ))}
          <Animated.View
            style={[
              styles.badge,
              badgeSurface,
              { left: ART.badges.a.left, top: ART.badges.a.top },
              step(STAGGER.badgeA, { rotate: ART.badges.a.rotate }),
            ]}
          >
            <Ionicons name="shield-checkmark" size={ART.badge.glyph} color={colors.authGold} />
            <Text style={styles.badgeText}>Local workers</Text>
          </Animated.View>
          <Animated.View
            style={[
              styles.badge,
              badgeSurface,
              { left: ART.badges.b.left, top: ART.badges.b.top },
              step(STAGGER.badgeB, { rotate: ART.badges.b.rotate }),
            ]}
          >
            <Ionicons name="lock-closed" size={ART.badge.glyph} color={colors.authGold} />
            <Text style={styles.badgeText}>Protected payment</Text>
          </Animated.View>
          <Animated.View
            style={[
              styles.badge,
              badgeSurface,
              { left: ART.badges.c.left, top: ART.badges.c.top },
              step(STAGGER.badgeC, { rotate: ART.badges.c.rotate }),
            ]}
          >
            <Ionicons name="location" size={ART.badge.glyph} color={colors.authGold} />
            <Text style={styles.badgeText}>Local jobs</Text>
          </Animated.View>
        </Animated.View>
        </View>
      </View>

      <View style={styles.copy}>
        {/* Eyebrow law: a structural section label is gold in dark, and the
            Heritage emerald in light — the auth accent carries both. */}
        <Animated.Text style={[styles.eyebrow, step(STAGGER.eyebrow, { lift: 8 })]}>
          BRAZOS MARKETPLACE
        </Animated.Text>
        {/* Two tones, as the page draws it: the first line in the ink, the
            promise in the accent. One Text, in the platform serif (the one
            serif role, widened to this headline — DECISIONS 18), so the lines
            wrap and scale as one. */}
        <Animated.Text
          style={[styles.headline, headlineShadow, step(STAGGER.headline)]}
          maxFontSizeMultiplier={1.5}
        >
          {'Get it done.\n'}
          <Text style={{ color: colors.authAccent }}>{'Work with\nconfidence.'}</Text>
        </Animated.Text>
        <Animated.Text style={[styles.body, step(STAGGER.body)]}>
          Hire local help or find nearby work.
        </Animated.Text>
      </View>

      {/* marginTop:'auto' inside AuthScaffold's growing content block, so the
          actions sit against the bottom on a tall screen and scroll into
          reach on a short one; they end 49 above the screen's bottom edge,
          as on the page, whatever the inset.

          THE ORDER IS THE OPERATOR'S (2026-09-21, from the shipped screen:
          "make Continue with phone the top one" — DECISIONS 19,
          tests/firstSession.test.mjs n5): phone leads, lit, carrying the rim
          light; email is the outlined second; sign-in is the page's text
          link. Phone auth resolves to `disabled` on every non-development
          build (lib/phoneAuth/mode.ts), so on the Beta the phone screen shows
          the notice and "Use Email Instead" until SMS is provisioned. */}
      <Animated.View
        style={[
          styles.actions,
          { paddingBottom: Math.max(0, LAYOUT.actionsBottom - insets.bottom) },
          step(STAGGER.actions),
        ]}
      >
        <AuthButton
          title="Continue with phone"
          themed
          hero
          lit
          icon="phone-portrait-outline"
          chevron
          onPress={() => navigation.navigate('CreateAccount')}
          accessibilityHint="Create an account with your phone number"
          light={rimLight}
        />
        <AuthButton
          title="Continue with email"
          themed
          hero
          icon="mail-outline"
          chevron
          onPress={() => navigation.navigate('EmailCreateAccount')}
          accessibilityHint="Create an account with your email"
        />
        <AuthButton
          title="I already have an account"
          variant="ghost"
          themed
          hero
          chevron
          onPress={() => navigation.navigate('SignIn')}
          accessibilityHint="Sign in to an existing account"
        />
      </Animated.View>
    </AuthScaffold>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  art: {
    width: '100%',
    // The decorative pieces are absolutely positioned, but only ever inside
    // this bounded box — no part of the screen is laid out by coordinates.
    position: 'relative',
    pointerEvents: 'none',
  },
  canvas: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: ART.width,
    height: ART.height,
    transformOrigin: 'top left',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
  },
  disc: {
    position: 'absolute',
    borderWidth: 1,
    // The flat base under the radial fill — the shadow's shape, and the disc
    // itself wherever a renderer draws no gradient.
    backgroundColor: colors.heroDiscBottom,
  },
  badge: {
    position: 'absolute',
    height: authSizes.heroBadge,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ART.badge.gap,
    borderWidth: 1,
    borderRadius: authRadius.heroBadge,
    paddingLeft: ART.badge.paddingLeft,
    paddingRight: ART.badge.paddingRight,
  },
  badgeText: {
    ...authType.heroBadge,
    color: colors.authInk,
  },
  copy: {
    paddingHorizontal: LAYOUT.inset,
  },
  // 2026-09-27 (the Lux remake, the operator's Welcome picture): "BRAZOS
  // MARKETPLACE" is GOLD — every eyebrow is (ruling 4). 2026-09-28 (LUX-LIST-64
  // #47, the operator's follow-up on the gold sheet): the MARK — the same gold
  // in dark, the forest green #064C3B in light. The badges, the rings and the
  // lead's glint keep the auth gold.
  eyebrow: {
    ...authType.heroEyebrow,
    marginTop: LAYOUT.eyebrowGap,
    color: colors.mark,
  },
  headline: {
    ...authType.heroDisplay,
    fontFamily: fonts.displayHero,
    fontWeight: '700',
    color: colors.authInk,
    marginTop: LAYOUT.headlineGap,
    textShadowOffset: { width: 0, height: LAYOUT.headlineShadow.offset },
    textShadowRadius: LAYOUT.headlineShadow.radius,
  },
  body: {
    ...authType.heroBody,
    color: colors.authMuted,
    marginTop: LAYOUT.bodyGap,
  },
  actions: {
    marginTop: 'auto',
    paddingHorizontal: LAYOUT.inset,
    paddingTop: authSpacing.md,
    gap: LAYOUT.actionsGap,
  },
  }),
);
