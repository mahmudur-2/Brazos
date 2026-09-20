import { useEffect, useRef, type ComponentType } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { canSwipe, canWorklet, motionCapability, resolveMotion120 } from '../lib/motion120';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { metricStyles } from '../lib/theme';
import {
  PeekSheetFrame,
  PeekSheetPane,
  SHEET_SPRING,
  usePeekMetrics,
  type PeekSheetProps,
} from './PeekSheet.shared';

export type { PeekSheetProps } from './PeekSheet.shared';

/**
 * The map's floating jobs pane — on whichever driver this binary has.
 *
 * THE FALLBACK IS THE SAME PANE, MINUS THE DRAG. Without gesture-handler
 * there is nothing to recognise a pull, so the head is a button: a tap on the
 * handle, the count or "View ›" opens the list, and the same tap closes it.
 * The travel is the same `translateY` the fast path drives, run here by core
 * `Animated.spring` on the native driver — a transform, never a layout — so
 * both binaries move the same pane the same distance at the same tempo, and
 * neither shows an affordance the other cannot honour. (See the shared module
 * for why the pane slides rather than grows.)
 *
 * THE FAST PATH NEEDS BOTH NATIVES, for the swipe row's reason: a recogniser
 * without worklets could drag, and would drag through a JS round trip per
 * frame under the map's own load — worse than not offering it. Either false
 * takes this fallback.
 */
function PeekSheetFallback<T>(props: PeekSheetProps<T>) {
  const { expandedHeight, open, radius, inset } = props;
  const metrics = usePeekMetrics(expandedHeight);
  const y = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);

  useEffect(() => {
    if (!metrics.ready) return;
    const target = open ? 0 : metrics.closedOffset;
    // The first placement is a jump, not a slide: the pane has not been seen
    // yet (the frame is transparent until measured), so there is nothing to
    // animate from.
    if (!placed.current) {
      placed.current = true;
      y.setValue(target);
      return;
    }
    Animated.spring(y, {
      toValue: target,
      useNativeDriver: USE_NATIVE_DRIVER,
      ...SHEET_SPRING,
    }).start();
  }, [metrics.ready, metrics.closedOffset, open, y]);

  return (
    <PeekSheetFrame expandedHeight={expandedHeight} radius={radius} inset={inset} ready={metrics.ready}>
      <Animated.View style={[stylesFor().mover, { transform: [{ translateY: y }] }]}>
        <PeekSheetPane
          {...props}
          onHeadLayout={metrics.onHeadLayout}
          onFirstLayout={metrics.onFirstLayout}
        />
      </Animated.View>
    </PeekSheetFrame>
  );
}

const stylesFor = metricStyles(() => StyleSheet.create({ mover: { flex: 1 } }));

/**
 * Chosen ONCE, at module load — a capability cannot change while the app
 * runs — with the literal `require` Metro needs to resolve the sibling at
 * bundle time.
 */
const Impl = resolveMotion120<ComponentType<PeekSheetProps<unknown>>>(
  // The AND of the boundary's two questions, as SwipeableRow asks them: a
  // pull needs a recogniser AND worklets. `keyboard` passes through from the
  // real capability — a sheet has no opinion on a vendor it does not use.
  { ...motionCapability, gestures: canSwipe() && canWorklet(), reanimated: canWorklet() },
  'gestures',
  () => require('./PeekSheet.motion120').PeekSheet as ComponentType<PeekSheetProps<unknown>>,
  PeekSheetFallback as ComponentType<PeekSheetProps<unknown>>
);

export function PeekSheet<T>(props: PeekSheetProps<T>) {
  // The chooser is typed on `unknown` because a module-level constant cannot
  // carry the caller's T; the props are handed through unchanged.
  return <Impl {...(props as unknown as PeekSheetProps<unknown>)} />;
}
