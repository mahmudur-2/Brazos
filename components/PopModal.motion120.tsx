/**
 * 2026-09-30 (the build run, the smoothness pass) — A FROSTED POP-UP, 120 Hz: the same instant dim
 * and the same move as the fallback, the move a Reanimated timing on the UI thread. The close hands
 * back to JS once, when it has finished, to unmount the Modal.
 */
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { BlurLayer } from '../lib/blur';
import { CLEAR_GROUND, POP_CLOSE_MS, POP_OPEN_MS, popMotion, type PopModalProps } from './PopModal.shared';

export function PopModal({
  visible,
  onRequestClose,
  onShow,
  backdropStyle,
  onBackdropPress,
  blur = true,
  motion = 'pop',
  children,
}: PopModalProps) {
  const reduced = useReducedMotion() === true;
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      if (reduced) {
        progress.value = 1;
        return;
      }
      progress.value = 0;
      progress.value = withTiming(1, { duration: POP_OPEN_MS, easing: Easing.out(Easing.cubic) });
      return;
    }
    if (reduced) {
      setMounted(false);
      return;
    }
    progress.value = withTiming(0, { duration: POP_CLOSE_MS, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(setMounted)(false);
    });
  }, [visible, reduced, progress]);

  const moved = useAnimatedStyle(() => popMotion(motion, progress.value), [motion]);

  return (
    <Modal visible={mounted} transparent animationType="none" onShow={onShow} onRequestClose={onRequestClose}>
      <View style={FILL}>
        <View style={[StyleSheet.absoluteFill, backdropStyle]} pointerEvents="none">
          {blur ? <BlurLayer /> : null}
        </View>
        <Animated.View style={[FILL, moved]} pointerEvents="box-none">
          <Pressable style={[FILL, backdropStyle, CLEAR_GROUND]} onPress={onBackdropPress} disabled={!onBackdropPress} accessible={false}>
            {children}
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** The modal's full-screen layers. */
const FILL = { flex: 1 } as const;
