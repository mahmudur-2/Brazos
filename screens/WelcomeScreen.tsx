import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AuthButton } from '../components/AuthButton';
import { AuthScaffold } from '../components/AuthScaffold';
import { RimLight } from '../components/RimLight';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { authRadius, authShadows, authSpacing, authType } from '../lib/authTheme';
import { useLaunchComplete } from '../lib/launchContext';
import type { AuthStackNavigation } from '../lib/navigation';
import {
  authSurface,
  fonts,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { backgroundImageStyle } from '../ui/primitives/LitSurface';

// One driver, 500ms, with each element reading a different slice of it. That
// produces the reference's short stagger without five timers to keep in sync,
// and it finishes fast enough that nothing waits on it — the buttons are
// hit-testable from the first frame regardless of their opacity.
const ENTRANCE_MS = 500;
const REDUCED_ENTRANCE_MS = 160;

/** Trust-badge glyph, sized to sit on the cap height of the 13pt badge label. */
const BADGE_ICON = 15;

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
 * THE ART — the picked Welcome page's (docs/mockups/html/lux/welcome-motion.html,
 * 2026-09-21; version 1 of welcome-ideas.html, polished): three discs stacked
 * down and to the right, each lit along its top-right edge, the front one along
 * its lower-right too, a soft haze behind them, a faint ring round the back one,
 * and the three badges floating over the stack. The corner arcs are the
 * scaffold's backdrop (components/AuthBackdrop.tsx, `full`).
 *
 * Every number is a fraction of the art box, measured on the page's 353 × 330
 * art at 393 wide, so the composition holds on any phone; the discs' sizes hang
 * off the back disc's, which is bounded like the old ring was.
 *
 * HOW A DISC IS LIT WITHOUT A SHADOW. A rim light is a crescent, and a crescent
 * is a ring peeking out from under a disc that sits slightly off it: each disc
 * draws its rim ring first, then its own filled circle shifted by a point or
 * two the other way, so the ring shows along one edge only. Plain bordered
 * circles and one radial fill — nothing a phone cannot draw, in either theme.
 */
const DISCS = [
  // back — the largest, lit mint along its top-right, as the page draws it
  { key: 'back', scale: 1, left: 0.176, top: 0.118, rim: 'mint', lower: false },
  // mid — lit gold along its top-right
  { key: 'mid', scale: 0.926, left: 0.278, top: 0.26, rim: 'gold', lower: false },
  // front — lit gold along its top-right AND its lower-right
  { key: 'front', scale: 0.796, left: 0.36, top: 0.38, rim: 'gold', lower: true },
] as const;

/** The badges over the stack: the page's positions as fractions of the art box. */
const BADGES = {
  a: { left: 0.03, top: 0.24, rotate: '-5deg' },
  b: { right: 0.013, top: 0.48, rotate: '5deg' },
  c: { left: 0.21, top: 0.79, rotate: undefined },
} as const;

/** The ghost ring round the back disc, and the haze's disc, as multiples of the back disc. */
const GHOST_RING = 1.148;
const HALO = 1.85;

type EntranceTransform =
  | { rotate: string }
  | { translateY: Animated.AnimatedInterpolation<number> }
  | { scale: Animated.AnimatedInterpolation<number> };

export function WelcomeScreen() {
  const navigation = useNavigation<AuthStackNavigation>();
  const { height } = useWindowDimensions();
  // The art box's own width, so the composition holds inside the scaffold's
  // capped content column as well as edge to edge on a phone.
  const [artWidth, setArtWidth] = useState(0);
  const reducedMotion = useReducedMotion();
  const launchComplete = useLaunchComplete();
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const surface = authSurface(colors, isDark);

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

  // The page's art block is 330 of an 852pt frame with two actions under it;
  // this screen carries three, so the block is bounded a little lower and
  // the discs keep their size regardless — the back disc is 216 on the page.
  const artHeight = Math.max(180, Math.min(280, height * 0.31));
  const backSize = Math.min(220, artHeight * 0.82);

  // The rims: the page's mint edge on the back disc, gold on the others.
  const rimColor = (rim: 'mint' | 'gold', alpha: number) =>
    withAlpha(rim === 'mint' ? colors.emeraldBright : colors.gold, alpha);
  const discFill = backgroundImageStyle(
    `radial-gradient(circle at 36% 30%, ${colors.heroDiscTop} 0%, ${colors.heroDiscMid} 50%, ${colors.heroDiscBottom} 100%)`
  );
  const haloSize = backSize * HALO;
  const halo = backgroundImageStyle(
    `radial-gradient(circle closest-side at 50% 50%, ${withAlpha(colors.emeraldBright, isDark ? 0.2 : 0.1)} 0%, ${withAlpha(colors.emeraldBright, 0)} 100%)`
  );
  const backLeft = artWidth * DISCS[0].left;
  const backTop = artHeight * DISCS[0].top;
  const ghostSize = backSize * GHOST_RING;

  // The badges: the page's teal glass over the discs in dark (the ground's top
  // stop, nearly opaque), the Heritage white card in light.
  const badgeSurface = {
    borderColor: surface.line,
    backgroundColor: isDark ? withAlpha(colors.authGroundTop, 0.9) : colors.surface,
  };

  const rimLight = <RimLight radius={authRadius.heroButton} />;

  return (
    <AuthScaffold backdrop="full" themed ground>
      <View
        style={[styles.art, { height: artHeight }]}
        onLayout={(event) => setArtWidth(event.nativeEvent.layout.width)}
      >
        <Animated.View
          style={[StyleSheet.absoluteFill, step(STAGGER.art, { lift: 0, scaleFrom: 0.92 })]}
        >
          {/* The haze the stack sits in, centred a little right of the back disc. */}
          <View
            style={[
              styles.halo,
              halo,
              {
                width: haloSize,
                height: haloSize,
                borderRadius: haloSize / 2,
                left: backLeft + backSize * 0.69 - haloSize / 2,
                top: backTop + backSize * 0.5 - haloSize / 2,
              },
            ]}
          />
          {/* The faint ring round the back disc. */}
          <View
            style={[
              styles.ring,
              {
                width: ghostSize,
                height: ghostSize,
                borderRadius: ghostSize / 2,
                left: backLeft - (ghostSize - backSize) / 2,
                top: backTop - (ghostSize - backSize) / 2,
                borderWidth: 1,
                borderColor: withAlpha(colors.gold, 0.1),
              },
            ]}
          />
          {DISCS.map((disc) => {
            const size = backSize * disc.scale;
            const left = artWidth * disc.left;
            const top = artHeight * disc.top;
            const circle = { width: size, height: size, borderRadius: size / 2 };
            return (
              <View key={disc.key} style={[styles.discLayer, { left, top, width: size, height: size }]}>
                {/* The glow under the lit edge: a wide faint ring, shifted up and right. */}
                <View
                  style={[
                    styles.ring,
                    circle,
                    { left: 4, top: -4, borderWidth: 6, borderColor: rimColor(disc.rim, 0.12) },
                  ]}
                />
                {/* The rim light itself, a hair up and right of the disc. */}
                <View
                  style={[
                    styles.ring,
                    circle,
                    { left: 1.5, top: -1.5, borderWidth: 1.5, borderColor: rimColor(disc.rim, disc.key === 'back' ? 0.55 : disc.lower ? 0.72 : 0.62) },
                  ]}
                />
                {disc.lower ? (
                  <View
                    style={[
                      styles.ring,
                      circle,
                      { left: 1, top: 2.5, borderWidth: 1.5, borderColor: rimColor(disc.rim, 0.55) },
                    ]}
                  />
                ) : null}
                {/* The disc, over its rims. */}
                <View
                  style={[
                    styles.disc,
                    circle,
                    discFill,
                    { borderColor: withAlpha(colors.gold, 0.2) },
                    isDark && authShadows.hero,
                  ]}
                />
              </View>
            );
          })}
        </Animated.View>

        <Animated.View
          style={[
            styles.badge,
            badgeSurface,
            { left: artWidth * BADGES.a.left, top: artHeight * BADGES.a.top },
            step(STAGGER.badgeA, { rotate: BADGES.a.rotate }),
          ]}
        >
          <Ionicons name="shield-checkmark" size={BADGE_ICON} color={surface.accent} />
          <Text style={styles.badgeText}>Local workers</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.badge,
            badgeSurface,
            { right: artWidth * BADGES.b.right, top: artHeight * BADGES.b.top },
            step(STAGGER.badgeB, { rotate: BADGES.b.rotate }),
          ]}
        >
          <Ionicons name="lock-closed" size={BADGE_ICON} color={surface.accent} />
          <Text style={styles.badgeText}>Protected payment</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.badge,
            badgeSurface,
            { left: artWidth * BADGES.c.left, top: artHeight * BADGES.c.top },
            step(STAGGER.badgeC),
          ]}
        >
          <Ionicons name="location" size={BADGE_ICON} color={surface.accent} />
          <Text style={styles.badgeText}>Local jobs</Text>
        </Animated.View>
      </View>

      {/* Eyebrow law: a structural section label is gold in dark, and the
          Heritage emerald in light. */}
      <Animated.Text
        style={[styles.eyebrow, { color: surface.accent }, step(STAGGER.eyebrow, { lift: 8 })]}
      >
        BRAZOS MARKETPLACE
      </Animated.Text>
      {/* Two tones, as the page draws it: the first line in the ink, the promise
          in the accent green. One Text, so the lines wrap and scale as one. */}
      <Animated.Text
        style={[styles.headline, step(STAGGER.headline)]}
        maxFontSizeMultiplier={1.5}
      >
        {'Get it done.\n'}
        <Text style={{ color: colors.emeraldBright }}>{'Work with\nconfidence.'}</Text>
      </Animated.Text>
      <Animated.Text style={[styles.body, step(STAGGER.body)]}>
        Hire trusted local help or find nearby work from one account.
      </Animated.Text>

      {/* marginTop:'auto' inside AuthScaffold's growing content block, so the
          actions sit against the bottom on a tall screen and scroll into
          reach on a short one. The reference's terms/privacy line is gone
          entirely; the space it held has been folded into this padding rather
          than left as a hole.

          THE ORDER IS A RULE, not a taste: email leads because phone auth
          resolves to `disabled` on every non-development build
          (lib/phoneAuth/mode.ts; tests/firstSession.test.mjs n5). The lead
          action is the lit one and carries the rim light; phone keeps the
          standard treatment at the same size; sign-in is the ghost. */}
      <Animated.View style={[styles.actions, step(STAGGER.actions)]}>
        <AuthButton
          title="Continue with email"
          themed
          hero
          lit
          icon="mail-outline"
          chevron
          onPress={() => navigation.navigate('EmailCreateAccount')}
          accessibilityHint="Create an account with your email"
          light={rimLight}
        />
        <AuthButton
          title="Continue with phone"
          themed
          hero
          icon="phone-portrait-outline"
          chevron
          onPress={() => navigation.navigate('CreateAccount')}
          accessibilityHint="Create an account with your phone number"
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
    marginTop: authSpacing.xs,
    // The decorative pieces are absolutely positioned, but only ever inside
    // this bounded box — no part of the screen is laid out by coordinates.
    position: 'relative',
    pointerEvents: 'none',
  },
  halo: {
    position: 'absolute',
  },
  ring: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  discLayer: {
    position: 'absolute',
  },
  disc: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderWidth: 1,
    // The flat base under the radial fill — the shadow's shape, and the disc
    // itself wherever a renderer draws no gradient.
    backgroundColor: colors.heroDiscBottom,
  },
  badge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: authRadius.chip,
    paddingLeft: 12,
    paddingRight: 14,
    paddingVertical: 10,
    ...authShadows.card,
  },
  badgeText: {
    ...authType.badge,
    color: colors.ink,
  },
  eyebrow: {
    ...authType.eyebrow,
    marginTop: authSpacing.lg,
  },
  // Master 2 carries the set's largest display.
  headline: {
    ...authType.display,
    fontFamily: fonts.display,
    color: colors.ink,
    marginTop: authSpacing.sm,
  },
  body: {
    ...authType.body,
    color: colors.textMuted,
    marginTop: authSpacing.md,
  },
  actions: {
    marginTop: 'auto',
    paddingTop: authSpacing.lg,
    paddingBottom: authSpacing.sm,
    gap: 10,
  },
  }),
);
