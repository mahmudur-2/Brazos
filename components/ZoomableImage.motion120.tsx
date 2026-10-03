import { useEffect, useRef, useState } from 'react';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
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
  ZOOMED_AT,
  ZOOM_SPRING,
  ZOOM_TAP_SCALE,
  clampTo,
  dragFade,
  panBound,
  type ZoomableImageProps,
} from './ZoomableImage.shared';

/**
 * A ZOOMABLE PHOTO ON THE UI THREAD — the 120 Hz path.
 *
 * One of the file kinds allowed to name a vendor package directly; reached only through
 * `resolveMotion120` from ./ZoomableImage.tsx, when this binary has both gesture-handler and
 * Reanimated. A pinch and a pan run together (the photo pans under a pinch's fingers once it is
 * zoomed), a double tap toggles 1x and 2.5x, a long press is the host's; every frame of all of
 * it is a shared value on the UI thread, and the JS thread hears only "zoomed", "let go" and
 * "long pressed".
 *
 * The pan is OFF at 1x where the host takes no swipe-away (MediaViewer), so its pager keeps the
 * sideways swipe natively; the host locks the pager while a page is zoomed.
 *
 * The recognisers sit in their own root view because the photo lives in a Modal, which iOS
 * presents above the app's root.
 */
export function ZoomableImage({
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
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const fade = useSharedValue(1);
  const boxWidth = useSharedValue(width);
  const boxHeight = useSharedValue(height);
  const [zoomed, setZoomed] = useState(false);
  const dismissable = onDismiss != null;

  // What the worklets hand back to the JS thread, through refs so a hop always reaches the
  // current props.
  const live = useRef({ onDismiss, onLongPress, onZoomedChange });
  live.current = { onDismiss, onLongPress, onZoomedChange };
  const zoomedRef = useRef(false);
  const reportZoom = (next: boolean) => {
    if (zoomedRef.current === next) return;
    zoomedRef.current = next;
    setZoomed(next);
    live.current.onZoomedChange?.(next);
  };
  const letGo = () => live.current.onDismiss?.();
  const longPressed = () => live.current.onLongPress?.();

  useEffect(() => {
    boxWidth.value = width;
    boxHeight.value = height;
  }, [boxHeight, boxWidth, height, width]);

  // Fresh state every time a new photo is opened.
  useEffect(() => {
    scale.value = 1;
    x.value = 0;
    y.value = 0;
    fade.value = 1;
    reportZoom(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const home = () => {
    'worklet';
    scale.value = withSpring(1, ZOOM_SPRING);
    x.value = withSpring(0, ZOOM_SPRING);
    y.value = withSpring(0, ZOOM_SPRING);
    fade.value = withTiming(1, { duration: 150 });
    runOnJS(reportZoom)(false);
  };

  const intoBounds = () => {
    'worklet';
    const boundX = panBound(scale.value, boxWidth.value);
    const boundY = panBound(scale.value, boxHeight.value);
    x.value = withSpring(clampTo(x.value, -boundX, boundX), ZOOM_SPRING);
    y.value = withSpring(clampTo(y.value, -boundY, boundY), ZOOM_SPRING);
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scale.value;
    })
    .onUpdate((event) => {
      scale.value = clampTo(startScale.value * event.scale, MIN_SCALE, MAX_SCALE);
    })
    .onEnd(() => {
      if (scale.value < SNAP_HOME_UNDER) {
        home();
        return;
      }
      intoBounds();
      runOnJS(reportZoom)(true);
    });

  const pan = Gesture.Pan()
    .enabled(zoomed || dismissable)
    .averageTouches(true)
    .onChange((event) => {
      if (scale.value > ZOOMED_AT) {
        // Zoomed: the photo travels with the fingers, one or two.
        x.value += event.changeX;
        y.value += event.changeY;
        return;
      }
      // At 1x a two-finger move is a pinch's; one finger previews letting the photo go.
      if (!dismissable || event.numberOfPointers > 1) return;
      x.value = event.translationX * DRAG_X_DAMPING;
      y.value = event.translationY;
      fade.value = dragFade(event.translationY);
    })
    .onEnd((event) => {
      if (scale.value > ZOOMED_AT) {
        intoBounds();
        return;
      }
      const flicked = Math.abs(event.velocityY) / 1000 > DISMISS_VELOCITY;
      if (dismissable && (Math.abs(event.translationY) > DISMISS_DISTANCE || flicked)) {
        fade.value = withTiming(0, { duration: DISMISS_MS });
        y.value = withTiming(
          event.translationY > 0 ? boxHeight.value : -boxHeight.value,
          { duration: DISMISS_MS },
          (finished) => {
            if (finished) runOnJS(letGo)();
          }
        );
        return;
      }
      home();
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(DOUBLE_TAP_MS)
    .onEnd((_event, success) => {
      if (!success) return;
      if (scale.value > ZOOMED_AT) {
        home();
        return;
      }
      scale.value = withSpring(ZOOM_TAP_SCALE, ZOOM_SPRING);
      runOnJS(reportZoom)(true);
    });

  const longPress = Gesture.LongPress()
    .enabled(onLongPress != null)
    .minDuration(LONG_PRESS_MS)
    .onStart(() => {
      runOnJS(longPressed)();
    });

  const gesture = Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, longPress));

  const layerMotion = useAnimatedStyle(() => ({ opacity: fade.value }));
  const photoMotion = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View style={[layerStyle, layerMotion]}>
      <GestureHandlerRootView style={{ width, height }}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={[{ width, height }, photoMotion]}>{children}</Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
      {overlay}
    </Animated.View>
  );
}
