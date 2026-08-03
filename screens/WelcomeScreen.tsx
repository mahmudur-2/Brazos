import { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AuthButton } from '../components/AuthButton';
import { AuthScaffold } from '../components/AuthScaffold';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { authColors, authRadius, authShadows, authSpacing, authType } from '../lib/authTheme';
import { useLaunchComplete } from '../lib/launchContext';
import type { AuthStackNavigation } from '../lib/navigation';

const USE_NATIVE_DRIVER = Platform.OS !== 'web';

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
 * The welcome artwork ring: the reference's
 * `linear-gradient(145deg, --mint2, #F2E5CB)` rebuilt from four offset discs
 * clipped to a circle, since no gradient package is installed.
 */
const RING_LAYERS = [
  { offset: 0, color: authColors.mint2, opacity: 1 },
  { offset: 0.16, color: '#DEEAD9', opacity: 0.8 },
  { offset: 0.32, color: authColors.sandMint, opacity: 0.8 },
  { offset: 0.48, color: authColors.sand, opacity: 0.9 },
] as const;

type EntranceTransform =
  | { rotate: string }
  | { translateY: Animated.AnimatedInterpolation<number> }
  | { scale: Animated.AnimatedInterpolation<number> };

export function WelcomeScreen() {
  const navigation = useNavigation<AuthStackNavigation>();
  const { height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const launchComplete = useLaunchComplete();

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

  // The reference art block is 300 of an 844pt viewport. Bounded rather than
  // purely proportional so it can't swallow a short screen or balloon on a
  // tall one.
  const artHeight = Math.max(180, Math.min(300, height * 0.34));
  const ringSize = Math.min(220, artHeight * 0.74);

  return (
    <AuthScaffold>
      <View style={[styles.art, { height: artHeight }]}>
        <Animated.View
          style={[
            styles.ring,
            {
              width: ringSize,
              height: ringSize,
              borderRadius: ringSize / 2,
              top: artHeight * 0.12,
            },
            step(STAGGER.art, { lift: 0, scaleFrom: 0.92 }),
          ]}
        >
          {RING_LAYERS.map((layer) => (
            <View
              key={layer.offset}
              style={{
                position: 'absolute',
                width: ringSize,
                height: ringSize,
                borderRadius: ringSize / 2,
                left: ringSize * layer.offset,
                top: ringSize * layer.offset,
                backgroundColor: layer.color,
                opacity: layer.opacity,
              }}
            />
          ))}
        </Animated.View>

        <Animated.View
          style={[
            styles.badge,
            styles.badgeA,
            { top: artHeight * 0.23 },
            step(STAGGER.badgeA, { rotate: '-7deg' }),
          ]}
        >
          <Text style={styles.badgeText}>Verified workers</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.badge,
            styles.badgeB,
            { top: artHeight * 0.47 },
            step(STAGGER.badgeB, { rotate: '8deg' }),
          ]}
        >
          <Text style={styles.badgeText}>Protected payment</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.badge,
            styles.badgeC,
            { top: artHeight * 0.75 },
            step(STAGGER.badgeC),
          ]}
        >
          <Text style={styles.badgeText}>Local jobs</Text>
        </Animated.View>
      </View>

      <Animated.Text style={[styles.eyebrow, step(STAGGER.eyebrow, { lift: 8 })]}>
        EMERALD TRUST MARKETPLACE
      </Animated.Text>
      <Animated.Text
        style={[styles.headline, step(STAGGER.headline)]}
        maxFontSizeMultiplier={1.5}
      >
        {'Get it done.\nWork with\nconfidence.'}
      </Animated.Text>
      <Animated.Text style={[styles.body, step(STAGGER.body)]}>
        Hire trusted local help or find nearby work from one account.
      </Animated.Text>

      {/* marginTop:'auto' inside AuthScaffold's growing content block, so the
          actions sit against the bottom on a tall screen and scroll into
          reach on a short one. The reference's terms/privacy line is gone
          entirely; the space it held has been folded into this padding rather
          than left as a hole. */}
      <Animated.View style={[styles.actions, step(STAGGER.actions)]}>
        <AuthButton
          title="Continue with phone"
          onPress={() => navigation.navigate('CreateAccount')}
          accessibilityHint="Create a BRAZOS account"
        />
        <AuthButton
          title="I already have an account"
          variant="ghost"
          onPress={() => navigation.navigate('SignIn')}
          accessibilityHint="Sign in to an existing account"
        />
      </Animated.View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  art: {
    width: '100%',
    marginTop: authSpacing.xs,
    // The decorative pieces are absolutely positioned, but only ever inside
    // this bounded box — no part of the screen is laid out by coordinates.
    position: 'relative',
    pointerEvents: 'none',
  },
  ring: {
    position: 'absolute',
    left: '18.6%',
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    backgroundColor: authColors.surface,
    borderWidth: 1,
    borderColor: authColors.line,
    borderRadius: authRadius.chip,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...authShadows.card,
  },
  badgeA: {
    left: '4%',
  },
  badgeB: {
    right: '1%',
  },
  badgeC: {
    left: '23%',
  },
  badgeText: {
    ...authType.badge,
    color: authColors.ink,
  },
  eyebrow: {
    ...authType.eyebrow,
    color: authColors.emerald,
    marginTop: authSpacing.lg,
  },
  headline: {
    ...authType.display,
    color: authColors.ink,
    marginTop: authSpacing.sm,
  },
  body: {
    ...authType.body,
    color: authColors.muted,
    marginTop: authSpacing.md,
  },
  actions: {
    marginTop: 'auto',
    paddingTop: authSpacing.xl,
    paddingBottom: authSpacing.lg,
    gap: authSpacing.md,
  },
});
