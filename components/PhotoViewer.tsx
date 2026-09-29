import { useModalPresence } from '../hooks/useModalPresence';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { sharePhoto } from '../lib/sharing';
import { alertAsync } from '../lib/dialog';
import { themedStyles, useThemeColors, withAlpha, type ColorPalette } from '../lib/theme';
import { USE_NATIVE_DRIVER } from '../lib/motion';

type PhotoViewerProps = {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
  /**
   * Whether the OS share sheet is offered (button + long-press). Off for
   * profile pictures: saving or forwarding someone else's photo of themselves
   * isn't an affordance this app should hand out, so those get view-only.
   */
  allowShare?: boolean;
};

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const ZOOM_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 280;
const TAP_SLOP = 8;
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.8;
const LONG_PRESS_MS = 500;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function pinchDistance(touches: { pageX: number; pageY: number }[]): number {
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

/**
 * Full-screen, pinch-to-zoom photo viewer — tap a chat photo or a
 * job-completion photo and it opens here instead of sitting at thumbnail
 * size. Dismiss by swiping down, tapping the close button, or (Android)
 * the hardware back button.
 *
 * Built on React Native's core Animated/PanResponder rather than a gesture
 * library — this project has neither react-native-gesture-handler nor
 * react-native-reanimated installed, and pulling either in just for this
 * would be a heavier, riskier change than a self-contained PanResponder
 * implementation.
 */
export function PhotoViewer({
  visible,
  uri,
  onClose,
  allowShare = true,
}: PhotoViewerProps) {
  const { palette: colors } = useThemeColors();
  // #64 (M-31): on screen or not — the one confirm engine never stacks a second modal on iOS.
  useModalPresence(visible);
  const styles = stylesFor(colors);
  const { width, height } = useWindowDimensions();
  const [sharing, setSharing] = useState(false);

  async function handleShare() {
    if (!uri || sharing || !allowShare) return;
    setSharing(true);
    const result = await sharePhoto(uri);
    setSharing(false);
    if (!result.ok) await alertAsync('Could not share', result.message);
  }

  const scale = useRef(new Animated.Value(1)).current;
  const translate = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const backdropOpacity = useRef(new Animated.Value(1)).current;

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
  }).current;

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  // The PanResponder is built once (useRef) and would otherwise capture the
  // first render's handleShare, whose `uri` never updates. Routing through a
  // ref keeps the long-press sharing whatever photo is currently open.
  const shareRef = useRef(handleShare);
  shareRef.current = handleShare;
  // Same reason as shareRef: the PanResponder is built once, so it can't read
  // the current prop directly.
  const allowShareRef = useRef(allowShare);
  allowShareRef.current = allowShare;

  useEffect(() => clearLongPress, []);

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
    if (animated) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.spring(translate, { toValue: { x: 0, y: 0 }, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 150, useNativeDriver: USE_NATIVE_DRIVER }),
      ]).start();
    } else {
      scale.setValue(1);
      translate.setValue({ x: 0, y: 0 });
      backdropOpacity.setValue(1);
    }
  }

  // Fresh state every time a new photo is opened.
  useEffect(() => {
    if (visible) resetTransform(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, uri]);

  function maxPanBounds() {
    return {
      x: Math.max(0, ((g.scale - 1) * width) / 2),
      y: Math.max(0, ((g.scale - 1) * height) / 2),
    };
  }

  function clampAndSpringTranslate() {
    const bounds = maxPanBounds();
    const x = clamp(g.translateX, -bounds.x, bounds.x);
    const y = clamp(g.translateY, -bounds.y, bounds.y);
    g.translateX = x;
    g.translateY = y;
    Animated.spring(translate, { toValue: { x, y }, useNativeDriver: USE_NATIVE_DRIVER }).start();
  }

  function animateDismiss(dy: number) {
    const toY = dy > 0 ? height : -height;
    Animated.parallel([
      Animated.timing(translate, {
        toValue: { x: g.translateX, y: toY },
        duration: 200,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start(() => onClose());
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
        // Long-press anywhere on the photo opens the share sheet. This has to
        // live inside the PanResponder rather than a wrapping Pressable —
        // the responder claims the touch, so a Pressable underneath would
        // never see a press.
        clearLongPress();
        if (touches.length < 2 && allowShareRef.current) {
          longPressTimer.current = setTimeout(() => {
            longPressTimer.current = null;
            g.didLongPress = true;
            shareRef.current();
          }, LONG_PRESS_MS);
        }
      },

      onPanResponderMove: (
        evt: GestureResponderEvent,
        gestureState: PanResponderGestureState
      ) => {
        const touches = evt.nativeEvent.touches;

        // Any real movement means this is a drag/pinch, not a long press.
        if (
          Math.abs(gestureState.dx) > TAP_SLOP ||
          Math.abs(gestureState.dy) > TAP_SLOP ||
          touches.length === 2
        ) {
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
            const next = clamp(
              (dist / g.pinchStartDistance) * g.pinchStartScale,
              MIN_SCALE,
              MAX_SCALE
            );
            setScale(next);
          }
          return;
        }

        if (g.scale > 1.01) {
          setTranslate(g.panStartX + gestureState.dx, g.panStartY + gestureState.dy);
          return;
        }

        // Not zoomed: a one-finger drag previews a dismiss-swipe. Follow the
        // finger with a light horizontal damping and fade the backdrop as it
        // moves away, so the gesture reads as "pulling the photo off screen".
        setTranslate(gestureState.dx * 0.5, gestureState.dy);
        const progress = clamp(1 - Math.abs(gestureState.dy) / 300, 0.35, 1);
        backdropOpacity.setValue(progress);
      },

      onPanResponderRelease: (
        _evt: GestureResponderEvent,
        gestureState: PanResponderGestureState
      ) => {
        clearLongPress();
        const wasPinching = g.isPinching;
        g.isPinching = false;

        // The share sheet already opened on this gesture — don't also treat
        // the lift as a tap (which would otherwise start a double-tap zoom).
        if (g.didLongPress) {
          g.didLongPress = false;
          return;
        }

        if (wasPinching) {
          if (g.scale < 1.02) resetTransform(true);
          else clampAndSpringTranslate();
          return;
        }

        if (g.scale > 1.01) {
          clampAndSpringTranslate();
          return;
        }

        const { dx, dy, vy } = gestureState;
        const moved = Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP;

        if (!moved) {
          const now = Date.now();
          if (now - g.lastTapTime < DOUBLE_TAP_MS) {
            g.lastTapTime = 0;
            g.scale = ZOOM_TAP_SCALE;
            Animated.spring(scale, { toValue: ZOOM_TAP_SCALE, useNativeDriver: USE_NATIVE_DRIVER }).start();
          } else {
            g.lastTapTime = now;
          }
          return;
        }

        if (Math.abs(dy) > DISMISS_DISTANCE || Math.abs(vy) > DISMISS_VELOCITY) {
          animateDismiss(dy);
        } else {
          resetTransform(true);
        }
      },
    })
  ).current;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        {...panResponder.panHandlers}
      >
        {uri ? (
          // RUN MOTION1 (C4) — THE ONE DELIBERATE EXCEPTION to routing remote
          // photos through components/RemoteImage.tsx.
          //
          // This node is an `Animated.Image`: the viewer's pinch, pan and
          // dismiss gestures drive its scale and translate directly, and
          // `Animated.createAnimatedComponent` attaches those values to THIS
          // element. Wrapping it in the shared boundary would put a plain node
          // between the animated values and the picture, so the gestures would
          // stop moving it.
          //
          // It also needs neither half of what the boundary adds: this is a
          // full-screen viewer opened from a thumbnail that has already been
          // fetched, so the bytes are in cache and there is no grey box to
          // cross-fade out of.
          <Animated.Image
            source={{ uri }}
            resizeMode="contain"
            style={[
              { width, height },
              {
                transform: [
                  { translateX: translate.x },
                  { translateY: translate.y },
                  { scale },
                ],
              },
            ]}
          />
        ) : null}

        <Pressable
          onPress={onClose}
          style={[styles.chromeBtn, styles.closeBtn, { top: 48 }]}
          hitSlop={12}
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={26} color={colors.onPrimary} />
        </Pressable>

        {allowShare && (
          <Pressable
            onPress={handleShare}
            disabled={sharing}
            style={[styles.chromeBtn, styles.shareBtn, { top: 48 }]}
            hitSlop={12}
            accessibilityLabel="Share photo"
          >
            {sharing ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <Ionicons
                name={Platform.OS === 'ios' ? 'share-outline' : 'share-social-outline'}
                size={24}
                color={colors.onPrimary}
              />
            )}
          </Pressable>
        )}
      </Animated.View>
    </Modal>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chromeBtn: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withAlpha(colors.black, 0.45),
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    right: 20,
  },
  shareBtn: {
    left: 20,
  },
  }),
);
