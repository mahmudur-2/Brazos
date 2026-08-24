import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { authColors, authSizes, authType } from '../lib/authTheme';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { BrandLogo } from '../components/BrandLogo';
import { USE_NATIVE_DRIVER } from '../lib/motion';

// The shipped app icon. app.json's expo.icon and this mark are the same file,
// so what iOS draws on the home screen is what the launch layer draws — which
// is the whole reason the source is passed explicitly rather than left to
// BrandLogo's default; see that component's SOURCE comment.
//
// It replaces assets/brand/app-icon-v2.png, whose ~18.7% corner radius was
// baked into an alpha channel. This export has no alpha channel at all, so it
// carries no baked radius and no transparent corners: a full-bleed opaque
// square, which is what Apple requires of an icon and what iOS masks for
// itself. On the home screen iOS applies its own mask; on this layer nothing
// does, so the rounding the old export baked in is applied at render time
// instead — the ratio below, handed to BrandLogo as `radius` — and the asset
// itself stays the operator-settled full-bleed square.
const LAUNCH_MARK = require('../assets/brand/app-icon-b-leaf.png');

// 18.7% of width — app-icon-v2.png's baked alpha radius, the rounding this
// mark rendered with until 2026-08-24, per BrandLogo's SOURCE comment.
const LAUNCH_MARK_RADIUS_RATIO = 0.187;

/**
 * The cold-launch timeline, in milliseconds from mount:
 *
 *   0      deep emerald is already painted — no white or black flash
 *   120    logo fades in, lifts 10pt, overshoots to 1.02 and settles at 1.00
 *   150    wave lines wash in underneath and stay low-contrast
 *   320    gold BRAZOS wordmark rises into place
 *   550    "Any Task, Handled." arrives
 *   1120   earliest the layer may begin handing over
 *   1500   crossfade complete, layer unmounted
 *
 * MIN_VISIBLE is a floor, not a wait: session hydration runs in parallel (see
 * components/LaunchGate.tsx) and the exit starts at whichever comes later —
 * the floor, or the session resolving.
 */
const LOGO_DELAY = 120;
const WAVES_DELAY = 150;
const WORDMARK_DELAY = 320;
const TAGLINE_DELAY = 550;
const MIN_VISIBLE = 1120;
const EXIT_MS = 380;

// The layer covers the entire app, so it must never be able to outlive its own
// crossfade. Animated's JS driver runs on requestAnimationFrame, which a
// browser stops delivering to a backgrounded tab — without this the overlay
// would still be sitting there, fully opaque, when the tab came back. Timers
// keep firing when rAF doesn't, so this is the one thing that can always
// release it.
const EXIT_GRACE_MS = 400;

// Reduced motion: same routing, same structure, no transforms and a shorter
// floor — there is nothing to watch, so there is nothing to wait for.
const REDUCED_FADE_MS = 220;
const REDUCED_MIN_VISIBLE = 700;
const REDUCED_EXIT_MS = 240;

type LaunchScreenProps = {
  /** True once the auth session has resolved and a destination is known. */
  sessionReady: boolean;
  /** Called after the crossfade, when the layer can be unmounted. */
  onFinish: () => void;
};

/**
 * The branded launch layer. Rendered over the whole app rather than as a route,
 * so whatever comes next is already mounted underneath when it fades out: there
 * is no intermediate blank frame, and an authenticated user never catches a
 * glimpse of the Welcome screen on the way to their tabs.
 */
export function LaunchScreen({ sessionReady, onFinish }: LaunchScreenProps) {
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  const logo = useRef(new Animated.Value(0)).current;
  const wordmark = useRef(new Animated.Value(0)).current;
  const tagline = useRef(new Animated.Value(0)).current;
  const waves = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(1)).current;

  const [floorReached, setFloorReached] = useState(false);
  const [exiting, setExiting] = useState(false);
  const exitStarted = useRef(false);

  const still = reducedMotion === true;

  useEffect(() => {
    // Held until the preference is known so the first frames can't play with
    // motion and then snap. Only the transforms wait — the emerald background
    // is painted on the very first frame regardless.
    if (reducedMotion === null) return;

    const fade = (value: Animated.Value, delay: number, duration: number) =>
      Animated.timing(value, {
        toValue: 1,
        delay,
        duration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: USE_NATIVE_DRIVER,
      });

    const animation = reducedMotion
      ? Animated.parallel([
          fade(waves, 0, REDUCED_FADE_MS),
          fade(logo, 0, REDUCED_FADE_MS),
          fade(wordmark, 60, REDUCED_FADE_MS),
          fade(tagline, 120, REDUCED_FADE_MS),
        ])
      : Animated.parallel([
          fade(logo, LOGO_DELAY, 400),
          // Slowest and faintest — decoration that settles in behind the
          // brand rather than competing with it.
          fade(waves, WAVES_DELAY, 900),
          fade(wordmark, WORDMARK_DELAY, 400),
          fade(tagline, TAGLINE_DELAY, 330),
        ]);

    animation.start();
    const timer = setTimeout(
      () => setFloorReached(true),
      reducedMotion ? REDUCED_MIN_VISIBLE : MIN_VISIBLE
    );

    return () => {
      animation.stop();
      clearTimeout(timer);
    };
  }, [reducedMotion, logo, wordmark, tagline, waves]);

  useEffect(() => {
    if (!floorReached || !sessionReady || exitStarted.current) return;
    exitStarted.current = true;
    setExiting(true);

    const duration = still ? REDUCED_EXIT_MS : EXIT_MS;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      onFinish();
    };

    Animated.timing(exit, {
      toValue: 0,
      duration,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start(({ finished }) => {
      if (finished) release();
    });

    const failsafe = setTimeout(release, duration + EXIT_GRACE_MS);
    return () => clearTimeout(failsafe);
  }, [floorReached, sessionReady, still, exit, onFinish]);

  const logoStyle = {
    opacity: logo,
    transform: still
      ? []
      : [
          {
            scale: logo.interpolate({
              inputRange: [0, 0.75, 1],
              outputRange: [0.86, 1.02, 1],
            }),
          },
          {
            translateY: logo.interpolate({
              inputRange: [0, 1],
              outputRange: [10, 0],
            }),
          },
        ],
  };

  const rise = (value: Animated.Value, from: number) => ({
    opacity: value,
    transform: still
      ? []
      : [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }],
  });

  return (
    <Animated.View
      style={[
        styles.root,
        {
          opacity: exit,
          // Swallows taps while it is opaque, so a button that isn't visible
          // yet can't be hit, then stops intercepting the moment the crossfade
          // starts and the destination shows through underneath.
          pointerEvents: exiting ? 'none' : 'auto',
        },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <StatusBar style="light" />

      <RadialGlow width={width} height={height} />
      <WaveLines width={width} height={height} progress={waves} still={still} />

      <View style={styles.center}>
        <Animated.View style={logoStyle}>
          <BrandLogo
            size={authSizes.logoLaunch}
            elevated
            source={LAUNCH_MARK}
            radius={authSizes.logoLaunch * LAUNCH_MARK_RADIUS_RATIO}
          />
        </Animated.View>

        <Animated.Text
          style={[styles.wordmark, rise(wordmark, 12)]}
          // A brand lockup with 6pt of tracking can't absorb unbounded
          // scaling, but it shouldn't ignore the setting either.
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
        >
          BRAZOS
        </Animated.Text>

        <Animated.Text style={[styles.tagline, rise(tagline, 10)]} maxFontSizeMultiplier={1.4}>
          Any Task, Handled.
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

/**
 * The reference's `radial-gradient(circle at 75% 20%, …)`, built from stacked
 * translucent circles. No gradient package is installed, and pulling one in
 * for a single decorative wash wouldn't clear the dependency bar; eight
 * overlapping layers at 7% ramp smoothly enough that no banding shows on a
 * dark field.
 */
function RadialGlow({ width, height }: { width: number; height: number }) {
  const layers = useMemo(() => {
    const cx = width * 0.75;
    const cy = height * 0.2;
    const largest = Math.max(width, height) * 1.5;
    return Array.from({ length: 8 }, (_, index) => {
      const size = largest * (1 - index * 0.11);
      return { key: index, size, left: cx - size / 2, top: cy - size / 2 };
    });
  }, [width, height]);

  return (
    <View style={styles.decoration}>
      {layers.map((layer) => (
        <View
          key={layer.key}
          style={{
            position: 'absolute',
            width: layer.size,
            height: layer.size,
            left: layer.left,
            top: layer.top,
            borderRadius: layer.size / 2,
            backgroundColor: authColors.launchGlow,
            opacity: 0.07,
          }}
        />
      ))}
    </View>
  );
}

/**
 * The premium contour detail: five circles far wider than the screen, so only
 * a shallow arc of each crosses it. The same trick the reference stylesheet
 * uses for its route lines, and the reason this needs no SVG dependency.
 */
function WaveLines({
  width,
  height,
  progress,
  still,
}: {
  width: number;
  height: number;
  progress: Animated.Value;
  still: boolean;
}) {
  const diameter = width * 2.6;
  const rows = useMemo(
    () =>
      [0.18, 0.34, 0.52, 0.72, 0.88].map((position, index) => ({
        key: index,
        top: height * position,
        left: -(diameter - width) / 2 + (index % 2 === 0 ? -18 : 22),
        opacity: 0.09 - index * 0.008,
      })),
    [diameter, height, width]
  );

  return (
    <Animated.View
      style={[
        styles.decoration,
        {
          opacity: progress,
          transform: still
            ? []
            : [
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
              ],
        },
      ]}
    >
      {rows.map((row) => (
        <View
          key={row.key}
          style={{
            position: 'absolute',
            width: diameter,
            height: diameter,
            left: row.left,
            top: row.top,
            borderRadius: diameter / 2,
            borderWidth: 1,
            borderColor: authColors.onDarkMuted,
            opacity: row.opacity,
          }}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: authColors.launchDeep,
    overflow: 'hidden',
  },
  // Both background layers: full-bleed, inert, behind the brand lockup.
  decoration: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  wordmark: {
    ...authType.wordmark,
    color: authColors.gold,
    marginTop: 20,
    // No custom font is loaded anywhere in the app, and adding one for a
    // single word would give the launch screen the font-loading flash it
    // exists to avoid. 2026-08-22: this style used to name the platform
    // serifs (Georgia / `serif`) explicitly; the operator retired the serif
    // app-wide, so the wordmark takes the system sans with everything else
    // and names no family at all. authType.wordmark still supplies the 30pt
    // and the +6 tracking that make it read as a wordmark.
  },
  tagline: {
    ...authType.tagline,
    color: authColors.onDarkMuted,
    marginTop: 8,
  },
});
