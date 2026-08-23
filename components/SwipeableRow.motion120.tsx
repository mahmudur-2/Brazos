import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type WithSpringConfig,
} from 'react-native-reanimated';
import {
  SwipeActionTiles,
  actionsWidth,
  stylesFor,
  type SwipeAction,
  type SwipeableRowProps,
} from './SwipeableRow.shared';
import { useThemeColors } from '../lib/theme';

/**
 * SWIPE-LEFT ROW ACTIONS — the fast path, and the only one that swipes.
 *
 * One of the two file kinds allowed to name react-native-gesture-handler and
 * react-native-reanimated in an import position; reached only through
 * `resolveMotion120` from ./SwipeableRow.tsx, which requires it solely when
 * BOTH capabilities are live. On the operator's current build neither is, so
 * this module is never evaluated and the inbox behaves exactly as it did.
 *
 * WHY A PAN AND NOT A FLING. The row has to FOLLOW the finger — that is the
 * whole difference between this and a button that happens to be triggered by a
 * swipe. Following a finger is the one thing core `Animated` genuinely cannot
 * do well: every frame would be a JS round trip, and the row would lag the
 * touch under exactly the load a list scroll produces. The pan's update runs
 * as a worklet on the UI thread, so `translateX` tracks the finger frame for
 * frame at 120Hz.
 *
 * THE ACTIONS ARE NOT THIS FILE'S. They arrive as props, built once by the
 * inbox and handed identically to the long-press ActionSheet. This file
 * decides how they are REVEALED and nothing about what they are — no handler
 * is written twice, and a flag-gated action that does not render in the sheet
 * does not render here either, because it is not in the array.
 */

/**
 * The settle. Springy enough to read as WhatsApp's — the row overshoots very
 * slightly into its open position and comes back — without bouncing so far
 * that a tile is momentarily unreachable.
 */
const ROW_SPRING: WithSpringConfig = {
  damping: 20,
  stiffness: 240,
  mass: 0.6,
  overshootClamping: false,
};

/**
 * How far past the tiles a finger may drag. A little rubber past the stop
 * reads as physical; unlimited travel reads as broken.
 */
const OVERDRAG = 24;

/** Past this share of the tiles' width, releasing OPENS rather than snaps back. */
const OPEN_THRESHOLD = 0.4;

export function SwipeableRow({ children, actions, enabled = true }: SwipeableRowProps) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const revealWidth = actionsWidth(actions);
  // Negative: the row travels LEFT off the tiles pinned to its right edge.
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);

  const close = () => {
    translateX.value = withSpring(0, ROW_SPRING);
  };

  const runAction = (action: SwipeAction) => {
    // Close first, so the row's return overlaps whatever the action opens
    // instead of following it — the same ordering DropMenu uses.
    close();
    action.onPress();
  };

  const pan = Gesture.Pan()
    // Let a vertical drag belong to the list. Without this the row would
    // fight the FlatList for every scroll that starts on a conversation.
    .activeOffsetX([-12, 12])
    .failOffsetY([-8, 8])
    .enabled(enabled && actions.length > 0)
    .onBegin(() => {
      startX.value = translateX.value;
    })
    .onUpdate((event) => {
      const next = startX.value + event.translationX;
      // Left only, and only as far as the tiles plus a little rubber.
      translateX.value = Math.min(0, Math.max(-(revealWidth + OVERDRAG), next));
    })
    .onEnd((event) => {
      const past = -translateX.value > revealWidth * OPEN_THRESHOLD;
      // A fast flick decides on its own, whatever distance it covered.
      const flungOpen = event.velocityX < -500;
      const flungShut = event.velocityX > 500;
      const shouldOpen = flungOpen || (past && !flungShut);
      translateX.value = withSpring(shouldOpen ? -revealWidth : 0, ROW_SPRING);
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  if (!enabled || actions.length === 0) return <>{children}</>;

  return (
    <View style={styles.container}>
      {/* The tiles are ordinary Pressables on the JS thread — no worklet
          hop is needed to run an action, because a tap on a tile is not part
          of the gesture that revealed it. */}
      <SwipeActionTiles actions={actions} onAction={runAction} />
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}
