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
  OPEN_THRESHOLD,
  OVERDRAG,
  PeekSheetFrame,
  PeekSheetPane,
  SHEET_SPRING,
  usePeekMetrics,
  type PeekSheetProps,
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
 * `onOpenChange` runs through `runOnJS` after the spring has already started,
 * so the settle never waits on a render.
 */

const SPRING: WithSpringConfig = { ...SHEET_SPRING, overshootClamping: false };

export function PeekSheet<T>(props: PeekSheetProps<T>) {
  const { expandedHeight, open, onOpenChange, radius, inset } = props;
  const metrics = usePeekMetrics(expandedHeight);
  // 0 is open; `closed` is the rest offset — mirrored into a shared value so
  // the worklets can read it without a hop.
  const y = useSharedValue(0);
  const startY = useSharedValue(0);
  const closed = useSharedValue(0);
  const placed = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;
  // Set when a RELEASE already sprang the pane, so the render that follows
  // its `onOpenChange` does not start the same spring a second time and
  // reset the settle's velocity mid-flight.
  const settledByGesture = useRef(false);

  useEffect(() => {
    closed.value = metrics.closedOffset;
    if (!metrics.ready) return;
    const target = open ? 0 : metrics.closedOffset;
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
  }, [metrics.ready, metrics.closedOffset, open, y, closed]);

  const settle = (shouldOpen: boolean) => {
    if (shouldOpen === openRef.current) return;
    settledByGesture.current = true;
    onOpenChange(shouldOpen);
  };

  const pan = Gesture.Pan()
    // A sideways drag is the map's; a small vertical one is a tap's slop.
    .activeOffsetY([-6, 6])
    .failOffsetX([-12, 12])
    .onBegin(() => {
      startY.value = y.value;
    })
    .onUpdate((event) => {
      const next = startY.value + event.translationY;
      // Between a little rubber past open and exactly the rest position: the
      // pane never drops below its peek.
      y.value = Math.min(closed.value, Math.max(-OVERDRAG, next));
    })
    .onEnd((event) => {
      const fromOpen = startY.value < closed.value / 2;
      const travelled = Math.abs(y.value - startY.value);
      const far = travelled > closed.value * OPEN_THRESHOLD;
      const flungOpen = event.velocityY < -FLING_VELOCITY;
      const flungShut = event.velocityY > FLING_VELOCITY;
      const shouldOpen = flungOpen || (!flungShut && (fromOpen ? !far : far));
      y.value = withSpring(shouldOpen ? 0 : closed.value, SPRING);
      runOnJS(settle)(shouldOpen);
    });

  const moverStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
  }));

  return (
    <PeekSheetFrame expandedHeight={expandedHeight} radius={radius} inset={inset} ready={metrics.ready}>
      <Animated.View style={[stylesFor().mover, moverStyle]}>
        <PeekSheetPane
          {...props}
          onHeadLayout={metrics.onHeadLayout}
          onFirstLayout={metrics.onFirstLayout}
          wrapHead={(head) => <GestureDetector gesture={pan}>{head}</GestureDetector>}
        />
      </Animated.View>
    </PeekSheetFrame>
  );
}

const stylesFor = metricStyles(() => StyleSheet.create({ mover: { flex: 1 } }));
