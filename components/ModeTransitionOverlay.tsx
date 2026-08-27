import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { Animated, Easing, Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { colors, metricStyles } from '../lib/theme';
import type { ModeDestination } from './modeTransitionAssets';
import { LINE_GEOMETRY, SOURCE_ASPECT_RATIO, TRANSITION_IMAGES } from './modeTransitionAssets';
import { USE_NATIVE_DRIVER } from '../lib/motion';

/**
 * The Customer <-> Worker mode switch, as one animated layer above the whole
 * navigation tree.
 *
 * design-reference/transition-worker.png and transition-customer.png are the
 * final artwork — the whole sheet (emerald background, B+leaf mark,
 * "Switching to ___" label, handle, gold baseline, rounded top corners) is
 * baked into those two images. Nothing here recreates any of that: the panel
 * is just `<Image source={...} />`, sized by the source's own aspect ratio.
 * The ONLY thing built programmatically is a small gold highlight that
 * sweeps across the line already printed in the image (see LINE_GEOMETRY in
 * ./modeTransitionAssets, measured directly from the source pixels).
 *
 * WHY AN OVERLAY AND NOT A ROUTE: the destination Home has to already be
 * mounted and painted before the user sees it, which a pushed "loading" route
 * cannot promise. The real navigation runs while the sheet is at rest —
 * the sheet then retreats off a destination that has had time to settle
 * underneath. Nothing waits on data; the duration is fixed and deterministic.
 *
 * ANIMATION BACKEND: the built-in Animated API, driven natively. Reanimated is
 * not installed in this project and CLAUDE.md forbids adding an animation
 * library, so every animated property here is one the native driver supports
 * (transform + opacity only) — the whole sequence runs on the UI thread.
 */

// --- Choreography ------------------------------------------------------
// 1000ms total. Rise 0-280ms, shimmer sweeps 300-700ms, the real mode switch
// happens at 500ms (sheet at rest, fully covering the switch), fall starts at
// 700ms and takes 300ms.
const RISE_MS = 280;
const PANEL_FADE_DELAY_MS = 120;
const PANEL_FADE_MS = 200;
const SHIMMER_START_MS = 300;
const SHIMMER_MS = 400;
const SWITCH_AT_MS = 500;
const FALL_START_MS = 700;
const FALL_MS = 300;
const TOTAL_MS = FALL_START_MS + FALL_MS; // 1000

// Reduced motion: a short cross-fade in place of any travel or shimmer.
// ~290ms total, inside the requested 250-300ms range.
const REDUCED_IN_MS = 110;
const REDUCED_HOLD_MS = 70;
const REDUCED_OUT_MS = 110;
const REDUCED_SWITCH_AT_MS = REDUCED_IN_MS + REDUCED_HOLD_MS / 2;
const REDUCED_TOTAL_MS = REDUCED_IN_MS + REDUCED_HOLD_MS + REDUCED_OUT_MS;

/** Peak dim over the outgoing screen — substantial, never opaque. */
const DIM_PEAK = 0.52;

/** Width of the animated gold highlight, in the 25-45px range asked for. */
const SHIMMER_WIDTH = 34;
/** Tall enough to read as a soft glow without needing a real blur/gradient. */
const SHIMMER_BAND_HEIGHT = 16;

export type { ModeDestination };

type StartArgs = {
  destination: ModeDestination;
  /**
   * The real navigation, run once while the sheet is at rest covering the
   * screen. Kept as a caller-supplied callback so this component owns no
   * routes and both directions share one implementation.
   */
  onSwitch: () => void;
};

type ModeTransitionValue = {
  start: (args: StartArgs) => void;
  /** True from the tap until cleanup — switch controls disable on it, which is
   *  what makes rapid double-taps a no-op rather than a second transition. */
  busy: boolean;
};

const ModeTransitionContext = createContext<ModeTransitionValue | null>(null);

export function useModeTransition(): ModeTransitionValue {
  const value = useContext(ModeTransitionContext);
  if (!value) {
    throw new Error('useModeTransition must be used inside <ModeTransitionProvider>');
  }
  return value;
}

/**
 * Wraps the navigation tree and renders the overlay above it. Mounted once, in
 * App.tsx — the overlay itself only exists while a switch is running.
 */
export function ModeTransitionProvider({ children }: PropsWithChildren) {
  const styles = stylesFor();
  const [request, setRequest] = useState<StartArgs | null>(null);
  // The ref is the actual double-tap guard: two taps in the same frame both
  // read the old state, but only the first sees a null ref.
  const runningRef = useRef(false);

  const start = useCallback((args: StartArgs) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRequest(args);
  }, []);

  const finish = useCallback(() => {
    runningRef.current = false;
    setRequest(null);
  }, []);

  const value = useMemo<ModeTransitionValue>(
    () => ({ start, busy: request !== null }),
    [start, request]
  );

  return (
    <ModeTransitionContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {request ? (
          <ModeTransitionOverlay
            destination={request.destination}
            onSwitch={request.onSwitch}
            onComplete={finish}
          />
        ) : null}
      </View>
    </ModeTransitionContext.Provider>
  );
}

type OverlayProps = {
  destination: ModeDestination;
  onSwitch: () => void;
  onComplete: () => void;
};

/**
 * One run of the transition. Mounted when a switch starts and unmounted when it
 * ends, so every animated value starts from a known state and nothing survives
 * between runs.
 */
function ModeTransitionOverlay({ destination, onSwitch, onComplete }: OverlayProps) {
  const styles = stylesFor();
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  // The panel is exactly as tall as the image's own aspect ratio makes it at
  // full device width — never a guessed ratio, never stretched.
  const panelHeight = width * SOURCE_ASPECT_RATIO;
  const geometry = LINE_GEOMETRY[destination];

  const panelY = useRef(new Animated.Value(panelHeight)).current;
  const panelOpacity = useRef(new Animated.Value(0.97)).current;
  const dim = useRef(new Animated.Value(0)).current;
  const shimmerT = useRef(new Animated.Value(0)).current;

  // Callbacks change identity on every parent render; the animation must read
  // the latest without being a dependency of the effect that runs it once.
  const onSwitchRef = useRef(onSwitch);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onSwitchRef.current = onSwitch;
    onCompleteRef.current = onComplete;
  });

  useEffect(() => {
    // Held until the accessibility preference has actually been read, so the
    // first frames can't play with motion and then snap (see useReducedMotion).
    if (reducedMotion === null) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    let settled = false;

    /** Runs the navigation exactly once, whatever path gets here. */
    const runSwitch = () => {
      if (settled) return;
      settled = true;
      onSwitchRef.current();
    };

    const at = (ms: number, fn: () => void) => {
      timers.push(setTimeout(fn, ms));
    };

    if (reducedMotion) {
      panelY.setValue(0);
      panelOpacity.setValue(0);

      Animated.parallel([
        Animated.timing(dim, {
          toValue: DIM_PEAK,
          duration: REDUCED_IN_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(panelOpacity, {
          toValue: 1,
          duration: REDUCED_IN_MS,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start();

      at(REDUCED_SWITCH_AT_MS, runSwitch);
      at(REDUCED_IN_MS + REDUCED_HOLD_MS, () => {
        Animated.parallel([
          Animated.timing(dim, {
            toValue: 0,
            duration: REDUCED_OUT_MS,
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
          Animated.timing(panelOpacity, {
            toValue: 0,
            duration: REDUCED_OUT_MS,
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
        ]).start();
      });
    } else {
      // Dim the current Home and raise the sheet. Eased, not sprung — no
      // bounce, controlled deceleration.
      Animated.parallel([
        Animated.timing(dim, {
          toValue: DIM_PEAK,
          duration: RISE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(panelY, {
          toValue: 0,
          duration: RISE_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        // An extremely subtle settle, not a fade-in — the artwork is already
        // fully opaque, this just takes the last 3% off a slightly "soft"
        // starting point.
        Animated.timing(panelOpacity, {
          toValue: 1,
          delay: PANEL_FADE_DELAY_MS,
          duration: PANEL_FADE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        // The one programmatic effect: a gold highlight sweeping once across
        // the line already baked into the artwork. Not a progress bar — no
        // fill, no percentage.
        Animated.timing(shimmerT, {
          toValue: 1,
          delay: SHIMMER_START_MS,
          duration: SHIMMER_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start();

      // The real switch, while the sheet is at rest over the content.
      at(SWITCH_AT_MS, runSwitch);

      // Retreat off the destination, which is already mounted underneath.
      at(FALL_START_MS, () => {
        Animated.parallel([
          Animated.timing(panelY, {
            toValue: panelHeight,
            duration: FALL_MS,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
          Animated.timing(dim, {
            toValue: 0,
            duration: FALL_MS,
            easing: Easing.in(Easing.quad),
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
        ]).start();
      });
    }

    const total = reducedMotion ? REDUCED_TOTAL_MS : TOTAL_MS;
    // A frame of slack past the end of the travel. Unmounting on the exact
    // final frame risks tearing the panel away a frame early under jitter,
    // which would read as a pop; by now the layer is already off-screen.
    at(total + 40, () => onCompleteRef.current());
    // Fail-safe: nothing above may leave the overlay on screen. Even if an
    // animation never calls back (backgrounded mid-run, driver hiccup), this
    // tears the layer down and releases the switch controls.
    at(total + 500, () => {
      runSwitch();
      onCompleteRef.current();
    });

    return () => {
      for (const timer of timers) clearTimeout(timer);
      panelY.stopAnimation();
      panelOpacity.stopAnimation();
      dim.stopAnimation();
      shimmerT.stopAnimation();
    };
    // One run per mount. The overlay is remounted for every transition, so
    // re-running on prop identity changes would restart the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  const label = destination === 'worker' ? 'Switching to Worker' : 'Switching to Customer';

  // The line's measured left/right edges (see LINE_GEOMETRY), in on-screen
  // pixels at this device's width. The highlight travels edge to edge.
  const lineLeftPx = ((geometry.centerPct - geometry.widthPct / 2) / 100) * width;
  const lineRightPx = ((geometry.centerPct + geometry.widthPct / 2) / 100) * width;
  const shimmerLeft = shimmerT.interpolate({
    inputRange: [0, 1],
    outputRange: [lineLeftPx - SHIMMER_WIDTH / 2, lineRightPx - SHIMMER_WIDTH / 2],
  });
  const shimmerOpacity = shimmerT.interpolate({
    inputRange: [0, 0.15, 0.85, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      {/* The outgoing screen stays visible above the sheet — substantial dim,
          never opaque. The real device status bar is left untouched. */}
      <Animated.View style={[styles.dim, { opacity: dim }]} pointerEvents="none" />

      <Animated.View
        style={[
          styles.panel,
          {
            height: panelHeight,
            // Proportional to width (~7.7%, measured from the source PNGs'
            // own corner arcs), not a fixed px radius, so it holds up across
            // device sizes the same way the image's own corners do.
            borderTopLeftRadius: width * 0.077,
            borderTopRightRadius: width * 0.077,
            opacity: panelOpacity,
            transform: [{ translateY: panelY }],
          },
        ]}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
      >
        {/* The final artwork, full stop — background, mark, label, handle,
            and the static gold line are all baked into this one image. */}
        <Image
          source={TRANSITION_IMAGES[destination]}
          style={styles.image}
          resizeMode="cover"
        />

        {!reducedMotion && (
          <View
            style={[
              styles.shimmerBand,
              { top: (geometry.topPct / 100) * panelHeight - SHIMMER_BAND_HEIGHT / 2 },
            ]}
            pointerEvents="none"
          >
            <Animated.View
              style={[
                styles.shimmerGroup,
                { opacity: shimmerOpacity, transform: [{ translateX: shimmerLeft }] },
              ]}
            >
              <View style={styles.shimmerGlowOuter} />
              <View style={styles.shimmerGlowMid} />
              <View style={styles.shimmerGlowCore} />
            </Animated.View>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const stylesFor = metricStyles(() => StyleSheet.create({
  root: {
    flex: 1,
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.black,
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // The source PNGs bake their rounded top corners in as opaque black
    // (not real alpha) — clipping here is what turns that black into the
    // dimmed Home showing through, matching every other corner of the sheet.
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  shimmerBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: SHIMMER_BAND_HEIGHT,
  },
  shimmerGroup: {
    position: 'absolute',
    top: 0,
    width: SHIMMER_WIDTH,
    height: SHIMMER_BAND_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Three stacked, decreasingly-wide translucent bars fake a soft radial
  // glow (brightest core, fading edges) without expo-linear-gradient, which
  // isn't installed — the lightest approach that still reads as a highlight
  // rather than a hard-edged bar.
  shimmerGlowOuter: {
    position: 'absolute',
    width: SHIMMER_WIDTH,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.gold,
    opacity: 0.18,
  },
  shimmerGlowMid: {
    position: 'absolute',
    width: SHIMMER_WIDTH * 0.62,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gold,
    opacity: 0.42,
  },
  shimmerGlowCore: {
    position: 'absolute',
    width: SHIMMER_WIDTH * 0.32,
    height: 2.4,
    borderRadius: 1.2,
    backgroundColor: '#FFF3D6',
    opacity: 0.95,
  },
}));
