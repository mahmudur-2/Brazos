import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type WithSpringConfig,
} from 'react-native-reanimated';
import { metricStyles } from '../lib/theme';
import {
  FLING_VELOCITY,
  OVERDRAG,
  PeekSheetFrame,
  PeekSheetPane,
  RELEASE_PROJECTION_S,
  SHEET_SPRING,
  usePeekMetrics,
  type PeekSheetProps,
  type PeekStop,
} from './PeekSheet.shared';

/**
 * THE PEEK SHEET'S FAST PATH — the pane follows the finger.
 *
 * One of the file kinds allowed to name react-native-gesture-handler and
 * react-native-reanimated in an import position; reached only through
 * `resolveMotion120` from ./PeekSheet.tsx, which requires it solely when a
 * recogniser AND worklets are both present.
 *
 * WHAT THE PAN IS ON. The head block — the grab handle, the count, the reach
 * line and "View ›" — and not the whole pane: the list under it scrolls
 * natively once open, and a pan over an ancestor of a scroll view fights it
 * for every vertical drag. The head is some ninety points tall and is the
 * thing a thumb reaches for anyway. It stays a button too, so a tap opens
 * and closes exactly as it does on the fallback.
 *
 * THE UPDATE IS A WORKLET: `translateY` tracks the finger on the UI thread,
 * frame for frame, with no JS round trip until the finger lifts. The release
 * decides on the UI thread as well and springs there, THEN tells React —
 * `onStopChange` runs through `runOnJS` after the spring has already started,
 * so the settle never waits on a render.
 *
 * THREE STOPS (2026-09-20, sitting 2): 0 is open, `closed` the peek's rest,
 * `mini` the tucked rest — all three mirrored into shared values so the
 * worklets read them without a hop. A release aims where the finger was
 * heading (the position plus a short projection of its velocity) and settles
 * at the NEAREST stop; a flick past FLING_VELOCITY moves exactly ONE stop in
 * its direction from where the pull began, so a hard downward flick from the
 * open list stops at the peek, never straight to the tuck. The finger may
 * pull as far as the tuck and a little past open, never further.
 */

const SPRING: WithSpringConfig = { ...SHEET_SPRING, overshootClamping: false };

function offsetOf(stop: PeekStop, closed: number, mini: number): number {
  'worklet';
  return stop === 'open' ? 0 : stop === 'peek' ? closed : mini;
}

export function PeekSheet<T>(props: PeekSheetProps<T>) {
  const { maxHeight, stop, onStopChange, radius, inset, insetBottom } = props;
  const metrics = usePeekMetrics(maxHeight, props.data.length, props.footer != null);
  // 0 is open; `closed` is the peek's rest, `mini` the tuck's — mirrored into
  // shared values so the worklets can read them without a hop.
  const y = useSharedValue(0);
  const startY = useSharedValue(0);
  const closed = useSharedValue(0);
  const mini = useSharedValue(0);
  const canOpen = useSharedValue(false);
  const placed = useRef(false);
  const stopRef = useRef(stop);
  stopRef.current = stop;
  // Set when a RELEASE already sprang the pane, so the render that follows
  // its `onStopChange` does not start the same spring a second time and
  // reset the settle's velocity mid-flight.
  const settledByGesture = useRef(false);

  useEffect(() => {
    closed.value = metrics.closedOffset;
    mini.value = metrics.miniOffset;
    canOpen.value = metrics.canOpen;
    if (!metrics.ready) return;
    const target = offsetOf(stop, metrics.closedOffset, metrics.miniOffset);
    if (!placed.current) {
      placed.current = true;
      y.value = target;
      return;
    }
    if (settledByGesture.current) {
      settledByGesture.current = false;
      return;
    }
    y.value = withSpring(target, SPRING);
  }, [metrics.ready, metrics.closedOffset, metrics.miniOffset, metrics.canOpen, stop, y, closed, mini, canOpen]);

  useEffect(() => {
    if (metrics.ready) props.onPeekHeight?.(metrics.peekHeight);
  }, [metrics.ready, metrics.peekHeight, props.onPeekHeight]);

  const settle = (next: PeekStop) => {
    if (next === stopRef.current) return;
    settledByGesture.current = true;
    onStopChange(next);
  };

  const pan = Gesture.Pan()
    // A sideways drag is the map's; a small vertical one is a tap's slop.
    .activeOffsetY([-6, 6])
    .failOffsetX([-12, 12])
    // Somewhere to go: the list beyond the peek, or the tuck below it.
    .enabled(metrics.canOpen || metrics.canMini)
    .onBegin(() => {
      startY.value = y.value;
    })
    .onUpdate((event) => {
      const next = startY.value + event.translationY;
      // Between a little rubber past open and exactly the tuck: the pane
      // never drops below its mini rest.
      y.value = Math.min(mini.value, Math.max(-OVERDRAG, next));
    })
    .onEnd((event) => {
      // The stops this pane has, top to bottom, as offsets.
      const stops: PeekStop[] = canOpen.value ? ['open', 'peek', 'mini'] : ['peek', 'mini'];
      const offsets = stops.map((s) => offsetOf(s, closed.value, mini.value));
      // Where the pull began, as the nearest stop to its start.
      let fromIndex = 0;
      for (let i = 1; i < offsets.length; i++) {
        if (Math.abs(offsets[i] - startY.value) < Math.abs(offsets[fromIndex] - startY.value)) fromIndex = i;
      }
      let toIndex: number;
      if (event.velocityY < -FLING_VELOCITY) {
        toIndex = Math.max(0, fromIndex - 1);
      } else if (event.velocityY > FLING_VELOCITY) {
        toIndex = Math.min(offsets.length - 1, fromIndex + 1);
      } else {
        const aim = y.value + event.velocityY * RELEASE_PROJECTION_S;
        toIndex = 0;
        for (let i = 1; i < offsets.length; i++) {
          if (Math.abs(offsets[i] - aim) < Math.abs(offsets[toIndex] - aim)) toIndex = i;
        }
      }
      const next = stops[toIndex];
      y.value = withSpring(offsets[toIndex], SPRING);
      runOnJS(settle)(next);
    });

  const moverStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
  }));

  return (
    <PeekSheetFrame
      expandedHeight={metrics.expandedHeight}
      radius={radius}
      inset={inset}
      insetBottom={insetBottom}
      ready={metrics.ready}
    >
      <Animated.View style={[stylesFor().mover, moverStyle]}>
        <PeekSheetPane
          {...props}
          expandedHeight={metrics.expandedHeight}
          canOpen={metrics.canOpen}
          onHeadLayout={metrics.onHeadLayout}
          onTitleLayout={metrics.onTitleLayout}
          onFirstLayout={metrics.onFirstLayout}
          onRowLayout={metrics.onRowLayout}
          onFooterLayout={metrics.onFooterLayout}
          wrapHead={(head) => <GestureDetector gesture={pan}>{head}</GestureDetector>}
        />
      </Animated.View>
    </PeekSheetFrame>
  );
}

const stylesFor = metricStyles(() => StyleSheet.create({ mover: { flex: 1 } }));
