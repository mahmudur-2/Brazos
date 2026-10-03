/**
 * FIX-RUN F10 — A ZOOMABLE PHOTO: the chooser and the native-driver fallback. The 120 Hz path
 * (`ZoomableImage.motion120.tsx`) follows the fingers on the UI thread; this fallback is the
 * PanResponder body components/PhotoViewer.tsx always had, moved here whole so MediaViewer's
 * photos zoom too. The rules both follow are in ./ZoomableImage.shared.tsx.
 *
 * The transform sits on a view around the picture rather than on the picture itself, so the host
 * chooses what draws it (PhotoViewer an Image, MediaViewer the RemoteImage boundary).
 */
import { useEffect, useRef, type ComponentType } from 'react';
import {
  Animated,
  PanResponder,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { canSwipe, canWorklet, motionCapability, resolveMotion120 } from '../lib/motion120';
import {
  DISMISS_DISTANCE,
  DISMISS_MS,
  DISMISS_VELOCITY,
  DOUBLE_TAP_MS,
  DRAG_X_DAMPING,
  LONG_PRESS_MS,
  MAX_SCALE,
  MIN_SCALE,
  SNAP_HOME_UNDER,
  TAP_SLOP,
  ZOOMED_AT,
  ZOOM_SPRING,
  ZOOM_TAP_SCALE,
  clampTo,
  dragFade,
  panBound,
  type ZoomableImageProps,
} from './ZoomableImage.shared';

export type { ZoomableImageProps } from './ZoomableImage.shared';

function pinchDistance(touches: { pageX: number; pageY: number }[]): number {
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

function ZoomableImageFallback({
  width,
  height,
  children,
  layerStyle,
  overlay,
  onDismiss,
  onLongPress,
  onZoomedChange,
  resetKey,
}: ZoomableImageProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const translate = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const layerOpacity = useRef(new Animated.Value(1)).current;

  // Mutable gesture bookkeeping — kept outside React state so drag/pinch
  // math never waits on a re-render.
  const g = useRef({
    scale: 1,
    translateX: 0,
    translateY: 0,
    panStartX: 0,
    panStartY: 0,
    pinchStartDistance: 0,
    pinchStartScale: 1,
    isPinching: false,
    lastTapTime: 0,
    didLongPress: false,
    zoomed: false,
  }).current;

  // The responder is built once (useRef), so everything it reads from props goes through a ref.
  const live = useRef({ width, height, onDismiss, onLongPress, onZoomedChange });
  live.current = { width, height, onDismiss, onLongPress, onZoomedChange };

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  useEffect(() => clearLongPress, []);

  function reportZoom(next: boolean) {
    if (g.zoomed === next) return;
    g.zoomed = next;
    live.current.onZoomedChange?.(next);
  }

  function setScale(next: number) {
    g.scale = next;
    scale.setValue(next);
  }

  function setTranslate(x: number, y: number) {
    g.translateX = x;
    g.translateY = y;
    translate.setValue({ x, y });
  }

  function resetTransform(animated: boolean) {
    g.scale = 1;
    g.translateX = 0;
    g.translateY = 0;
    reportZoom(false);
    if (animated) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, ...ZOOM_SPRING, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.spring(translate, { toValue: { x: 0, y: 0 }, ...ZOOM_SPRING, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(layerOpacity, { toValue: 1, duration: 150, useNativeDriver: USE_NATIVE_DRIVER }),
      ]).start();
    } else {
      scale.setValue(1);
      translate.setValue({ x: 0, y: 0 });
      layerOpacity.setValue(1);
    }
  }

  // Fresh state every time a new photo is opened.
  useEffect(() => {
    resetTransform(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  function clampAndSpringTranslate() {
    const boundX = panBound(g.scale, live.current.width);
    const boundY = panBound(g.scale, live.current.height);
    const x = clampTo(g.translateX, -boundX, boundX);
    const y = clampTo(g.translateY, -boundY, boundY);
    g.translateX = x;
    g.translateY = y;
    Animated.spring(translate, { toValue: { x, y }, ...ZOOM_SPRING, useNativeDriver: USE_NATIVE_DRIVER }).start();
  }

  function zoomIn() {
    g.scale = ZOOM_TAP_SCALE;
    reportZoom(true);
    Animated.spring(scale, { toValue: ZOOM_TAP_SCALE, ...ZOOM_SPRING, useNativeDriver: USE_NATIVE_DRIVER }).start();
  }

  function animateDismiss(dy: number) {
    const toY = dy > 0 ? live.current.height : -live.current.height;
    Animated.parallel([
      Animated.timing(translate, {
        toValue: { x: g.translateX, y: toY },
        duration: DISMISS_MS,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(layerOpacity, { toValue: 0, duration: DISMISS_MS, useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start(() => live.current.onDismiss?.());
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt: GestureResponderEvent) => {
        g.panStartX = g.translateX;
        g.panStartY = g.translateY;
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          g.isPinching = true;
          g.pinchStartDistance = pinchDistance(touches);
          g.pinchStartScale = g.scale;
        }
        // Long-press anywhere on the photo is the host's (the share sheet). It lives inside the
        // responder because the responder claims the touch: a Pressable underneath would never
        // see a press.
        clearLongPress();
        if (touches.length < 2 && live.current.onLongPress) {
          longPressTimer.current = setTimeout(() => {
            longPressTimer.current = null;
            g.didLongPress = true;
            live.current.onLongPress?.();
          }, LONG_PRESS_MS);
        }
      },

      onPanResponderMove: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const touches = evt.nativeEvent.touches;

        // Any real movement means this is a drag/pinch, not a long press.
        if (Math.abs(gestureState.dx) > TAP_SLOP || Math.abs(gestureState.dy) > TAP_SLOP || touches.length === 2) {
          clearLongPress();
        }

        if (touches.length === 2) {
          if (!g.isPinching) {
            g.isPinching = true;
            g.pinchStartDistance = pinchDistance(touches);
            g.pinchStartScale = g.scale;
          }
          const dist = pinchDistance(touches);
          if (g.pinchStartDistance > 0) {
            setScale(clampTo((dist / g.pinchStartDistance) * g.pinchStartScale, MIN_SCALE, MAX_SCALE));
          }
          return;
        }

        if (g.scale > ZOOMED_AT) {
          setTranslate(g.panStartX + gestureState.dx, g.panStartY + gestureState.dy);
          return;
        }

        // Not zoomed: where the host lets the photo go, a one-finger drag previews it — the
        // photo follows the finger (sideways damped) and the layer behind fades.
        if (!live.current.onDismiss) return;
        setTranslate(gestureState.dx * DRAG_X_DAMPING, gestureState.dy);
        layerOpacity.setValue(dragFade(gestureState.dy));
      },

      onPanResponderRelease: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        clearLongPress();
        const wasPinching = g.isPinching;
        g.isPinching = false;

        // The long press already acted on this gesture — don't also treat the lift as a tap.
        if (g.didLongPress) {
          g.didLongPress = false;
          return;
        }

        if (wasPinching) {
          if (g.scale < SNAP_HOME_UNDER) resetTransform(true);
          else {
            reportZoom(true);
            clampAndSpringTranslate();
          }
          return;
        }

        const { dx, dy, vy } = gestureState;
        const moved = Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP;

        if (!moved) {
          const now = Date.now();
          if (now - g.lastTapTime < DOUBLE_TAP_MS) {
            g.lastTapTime = 0;
            if (g.scale > ZOOMED_AT) resetTransform(true);
            else zoomIn();
          } else {
            g.lastTapTime = now;
            if (g.scale > ZOOMED_AT) clampAndSpringTranslate();
          }
          return;
        }

        if (g.scale > ZOOMED_AT) {
          clampAndSpringTranslate();
          return;
        }

        if (live.current.onDismiss && (Math.abs(dy) > DISMISS_DISTANCE || Math.abs(vy) > DISMISS_VELOCITY)) {
          animateDismiss(dy);
        } else {
          resetTransform(true);
        }
      },

      // A pager that takes the touch over (MediaViewer's swipe between pages) ends the gesture.
      onPanResponderTerminate: () => {
        clearLongPress();
        g.isPinching = false;
        g.didLongPress = false;
        if (g.scale > ZOOMED_AT) clampAndSpringTranslate();
        else resetTransform(true);
      },
    })
  ).current;

  return (
    <Animated.View style={[layerStyle, { opacity: layerOpacity }]} {...panResponder.panHandlers}>
      <Animated.View
        style={{
          width,
          height,
          transform: [{ translateX: translate.x }, { translateY: translate.y }, { scale }],
        }}
      >
        {children}
      </Animated.View>
      {overlay}
    </Animated.View>
  );
}

/**
 * Chosen ONCE, at module load. A pinch and a pan are recognisers AND worklets, the AND
 * SwipeableRow and PeekSheet ask; either absent takes the PanResponder above.
 */
const Impl = resolveMotion120<ComponentType<ZoomableImageProps>>(
  { ...motionCapability, gestures: canSwipe() && canWorklet(), reanimated: canWorklet() },
  'gestures',
  () => require('./ZoomableImage.motion120').ZoomableImage as ComponentType<ZoomableImageProps>,
  ZoomableImageFallback
);

export function ZoomableImage(props: ZoomableImageProps) {
  return <Impl {...props} />;
}
