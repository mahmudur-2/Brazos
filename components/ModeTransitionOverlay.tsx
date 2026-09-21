import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type PropsWithChildren,
} from 'react';
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { motionCapability, resolveMotion120 } from '../lib/motion120';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { metricStyles, useThemeColors } from '../lib/theme';
import { Surface } from '../ui/primitives/Surface';
import {
  CAPSULE_HIDDEN_Y,
  CAPSULE_IN_MS,
  CAPSULE_OUT_MS,
  PANE_IN_MS,
  PANE_OUT_MS,
  PANE_OVERHANG,
  PANE_SHADOW_WIDTH,
  REDUCED_IN_MS,
  REDUCED_OUT_MS,
  capsuleLabel,
  leadingEdge,
  paneShadowStyle,
  paneTravel,
  runSequence,
  transitionStylesFor,
  type ModeDestination,
  type ModeTransitionRunProps,
} from './ModeTransitionOverlay.shared';

export type { ModeDestination };

/**
 * The Customer <-> Worker mode switch, as one animated layer above the whole
 * navigation tree.
 *
 * THE MOTION is the glass wipe carrying the capsule — what it is, what it
 * replaces and why it is smooth are the shared module's header
 * (./ModeTransitionOverlay.shared.tsx). This file owns the three things that
 * are not motion: the provider every switch goes through, the paint signal the
 * reveal waits for, and the choice of driver.
 *
 * WHY AN OVERLAY AND NOT A ROUTE: the destination Home has to already be
 * mounted and painted before the user sees it, which a pushed "loading" route
 * cannot promise. The real navigation runs while the pane fully covers the
 * screen — and the pane then retreats off a destination that has REPORTED its
 * first layout underneath (`ModeTreeLayoutSignal`, mounted by
 * navigation/ModeShell.tsx beside the tree), with a fail-safe so nothing
 * waits forever.
 *
 * THREE DRIVERS, ONE CHOREOGRAPHY. Reanimated worklets where the binary has
 * them (./ModeTransitionOverlay.motion120.tsx, through the motion boundary's
 * own resolver), the native-driver `Animated` sibling below everywhere else,
 * and the reduced-motion crossfade below for anyone who has asked for it —
 * all three over `runSequence`, so the swap, the paint-gated reveal and the
 * fail-safes are written once.
 */

type StartArgs = {
  destination: ModeDestination;
  /**
   * The real navigation, run once while the pane covers the screen. Kept as a
   * caller-supplied callback so this component owns no routes and both
   * directions share one implementation.
   */
  onSwitch: () => void;
};

type ModeTransitionValue = {
  start: (args: StartArgs) => void;
  /** True from the tap until the pane has left — switch controls disable on
   *  it, which is what makes rapid double-taps a no-op rather than a second
   *  transition. The capsule's own exit is not part of it. */
  busy: boolean;
  /** The incoming navigation tree has laid out. Called by `ModeTreeLayoutSignal`;
   *  a no-op unless a run is waiting for it. */
  markTreeLaidOut: () => void;
};

const ModeTransitionContext = createContext<ModeTransitionValue | null>(null);

export function useModeTransition(): ModeTransitionValue {
  const value = useContext(ModeTransitionContext);
  if (!value) {
    throw new Error('useModeTransition must be inside <ModeTransitionProvider>');
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
  const [busy, setBusy] = useState(false);
  // The ref is the actual double-tap guard: two taps in the same frame both
  // read the old state, but only the first sees a false ref.
  const runningRef = useRef(false);
  // The paint signal's one waiter. Armed by a run at the moment it swaps the
  // tree, resolved by the tree's own layout event, dropped by the fail-safe.
  const laidOutResolverRef = useRef<(() => void) | null>(null);

  const start = useCallback((args: StartArgs) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    setRequest(args);
  }, []);

  const onRevealed = useCallback(() => {
    runningRef.current = false;
    setBusy(false);
  }, []);

  const onFinished = useCallback(() => {
    laidOutResolverRef.current = null;
    setRequest(null);
  }, []);

  const waitForTreeLaidOut = useCallback(
    () =>
      new Promise<void>((resolve) => {
        laidOutResolverRef.current = resolve;
      }),
    []
  );

  const markTreeLaidOut = useCallback(() => {
    const resolve = laidOutResolverRef.current;
    if (!resolve) return;
    laidOutResolverRef.current = null;
    resolve();
  }, []);

  const value = useMemo<ModeTransitionValue>(
    () => ({ start, busy, markTreeLaidOut }),
    [start, busy, markTreeLaidOut]
  );

  return (
    <ModeTransitionContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {request ? (
          <ModeTransitionRun
            destination={request.destination}
            onSwitch={request.onSwitch}
            waitForTreeLaidOut={waitForTreeLaidOut}
            onRevealed={onRevealed}
            onFinished={onFinished}
          />
        ) : null}
      </View>
    </ModeTransitionContext.Provider>
  );
}

/**
 * The paint signal. navigation/ModeShell.tsx mounts one of these INSIDE the
 * painted tree View, keyed by the tree, so it lays out in the same pass as
 * the incoming tree's first layout and reports that pass to the provider. It
 * draws nothing and takes no touch.
 */
export function ModeTreeLayoutSignal() {
  const styles = stylesFor();
  const { markTreeLaidOut } = useModeTransition();
  return <View style={styles.signal} pointerEvents="none" onLayout={markTreeLaidOut} />;
}

type RunOwnerProps = Omit<ModeTransitionRunProps, 'width' | 'topInset'>;

/**
 * One run of the transition, on whichever driver this binary and this person
 * get. Mounted when a switch starts and unmounted when the capsule has gone,
 * so every animated value starts from a known state and nothing survives
 * between runs.
 *
 * REDUCED MOTION IS DECIDED HERE, above the driver boundary, so the moving
 * sibling is never even mounted for it. `useReducedMotion` returns `null`
 * until the setting has been read, and its contract is that a run must not
 * start on an unknown answer — the first frames would play with motion and
 * then snap — so nothing mounts until it is known.
 */
function ModeTransitionRun(props: RunOwnerProps) {
  const reducedMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  if (reducedMotion === null) return null;
  const runProps: ModeTransitionRunProps = { ...props, width, topInset: insets.top };
  if (reducedMotion) return <ReducedRun {...runProps} />;
  return <Impl {...runProps} />;
}

/**
 * Chosen ONCE, at module load: the Reanimated wipe where the capability probe
 * found worklets, the native-driver wipe below otherwise. The require is a
 * literal so the bundler resolves the file on every binary.
 */
const Impl = resolveMotion120<ComponentType<ModeTransitionRunProps>>(
  motionCapability,
  'reanimated',
  () => require('./ModeTransitionOverlay.motion120').ModeTransitionRun as ComponentType<ModeTransitionRunProps>,
  NativeDriverRun,
);

/**
 * THE WIPE ON THE NATIVE DRIVER — the same two motions as the Reanimated
 * sibling (the pane's translateX, the capsule's translateY), each a native-
 * driven `Animated.timing`, each ending in the sequence's callback. Smooth for
 * transform and opacity on every binary; what it lacks against the worklet
 * path is only the 120 Hz frame budget.
 */
function NativeDriverRun(props: ModeTransitionRunProps) {
  const { destination, width, topInset } = props;
  const { palette: colors, isDark } = useThemeColors();
  const styles = transitionStylesFor(colors);
  const travel = paneTravel(destination, width);
  const edge = leadingEdge(destination);
  const paneX = useRef(new Animated.Value(travel.from)).current;
  const capsuleY = useRef(new Animated.Value(CAPSULE_HIDDEN_Y)).current;

  useEffect(() => {
    const done = (fn: () => void) => ({ finished }: { finished: boolean }) => {
      if (finished) fn();
    };
    const stop = runSequence(props, {
      paneIn: (covered) =>
        Animated.timing(paneX, {
          toValue: travel.cover,
          duration: PANE_IN_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: USE_NATIVE_DRIVER,
        }).start(done(covered)),
      paneOut: (revealed) =>
        Animated.timing(paneX, {
          toValue: travel.to,
          duration: PANE_OUT_MS,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: USE_NATIVE_DRIVER,
        }).start(done(revealed)),
      capsuleIn: () =>
        Animated.timing(capsuleY, {
          toValue: 0,
          duration: CAPSULE_IN_MS,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: USE_NATIVE_DRIVER,
        }).start(),
      capsuleOut: (gone) =>
        Animated.timing(capsuleY, {
          toValue: CAPSULE_HIDDEN_Y,
          duration: CAPSULE_OUT_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: USE_NATIVE_DRIVER,
        }).start(done(gone)),
    });
    return () => {
      stop();
      paneX.stopAnimation();
      capsuleY.stopAnimation();
    };
    // One run per mount: the overlay is remounted for every transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.layer} accessibilityViewIsModal>
      <Animated.View
        style={[styles.pane, { width: width + 2 * PANE_OVERHANG, transform: [{ translateX: paneX }] }]}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Switching to ${capsuleLabel(destination)}`}
      >
        <View style={[styles.rim, edge === 'left' ? { left: 0 } : { right: 0 }]} />
        {isDark ? <View style={[styles.specular, edge === 'left' ? { left: 1 } : { right: 1 }]} /> : null}
        <View
          style={[
            styles.shadow,
            paneShadowStyle(edge, colors),
            edge === 'left' ? { left: -PANE_SHADOW_WIDTH } : { right: -PANE_SHADOW_WIDTH },
          ]}
        />
      </Animated.View>

      <Animated.View
        style={[styles.capsuleWrap, { top: topInset + 8, transform: [{ translateY: capsuleY }] }]}
        pointerEvents="none"
      >
        <Surface material="menu" radius={20} corners="all" style={styles.capsule}>
          <View style={styles.capsuleDot} />
          <Text style={styles.capsuleText}>{capsuleLabel(destination)}</Text>
        </Surface>
      </Animated.View>
    </View>
  );
}

/**
 * REDUCED MOTION — the same sequence with no travel: the ground fades up
 * over the outgoing screen, the tree swaps, the ground fades away once the
 * incoming tree has painted; the capsule fades in and out in place. Two
 * opacities, nothing moves. Both drivers share this one because there is no
 * frame budget to win on a fade.
 */
function ReducedRun(props: ModeTransitionRunProps) {
  const { destination, topInset } = props;
  const { palette: colors } = useThemeColors();
  const styles = transitionStylesFor(colors);
  const ground = useRef(new Animated.Value(0)).current;
  const capsule = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const done = (fn: () => void) => ({ finished }: { finished: boolean }) => {
      if (finished) fn();
    };
    const fade = (value: Animated.Value, toValue: number, duration: number, then?: () => void) =>
      Animated.timing(value, { toValue, duration, useNativeDriver: USE_NATIVE_DRIVER }).start(then ? done(then) : undefined);
    const stop = runSequence(props, {
      paneIn: (covered) => fade(ground, 1, REDUCED_IN_MS, covered),
      paneOut: (revealed) => fade(ground, 0, REDUCED_OUT_MS, revealed),
      capsuleIn: () => fade(capsule, 1, REDUCED_IN_MS),
      capsuleOut: (gone) => fade(capsule, 0, REDUCED_OUT_MS, gone),
    });
    return () => {
      stop();
      ground.stopAnimation();
      capsule.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.layer} accessibilityViewIsModal>
      <Animated.View
        style={[styles.ground, { opacity: ground }]}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Switching to ${capsuleLabel(destination)}`}
      />
      <Animated.View style={[styles.capsuleWrap, { top: topInset + 8, opacity: capsule }]} pointerEvents="none">
        <Surface material="menu" radius={20} corners="all" style={styles.capsule}>
          <View style={styles.capsuleDot} />
          <Text style={styles.capsuleText}>{capsuleLabel(destination)}</Text>
        </Surface>
      </Animated.View>
    </View>
  );
}

const stylesFor = metricStyles(() => StyleSheet.create({
  root: {
    flex: 1,
  },
  signal: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
}));
