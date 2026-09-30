/**
 * 2026-09-30 (the build run, the smoothness pass) — A FROSTED POP-UP: the chooser and the
 * native-driver fallback. The dim and its blur show at once; only the card moves, at full opacity
 * (PopModal.shared.tsx says why). The 120 Hz path (`PopModal.motion120.tsx`) runs the move as a
 * Reanimated timing on the UI thread.
 */
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { BlurLayer } from '../lib/blur';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { motionCapability, resolveMotion120 } from '../lib/motion120';
import {
  CLEAR_GROUND,
  POP_CLOSE_MS,
  POP_FROM_SCALE,
  POP_OPEN_MS,
  RISE_FROM,
  type PopModalProps,
} from './PopModal.shared';

export type { PopModalProps, PopMotion } from './PopModal.shared';

function PopModalFallback({
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
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    progress.stopAnimation();
    if (visible) {
      setMounted(true);
      if (reduced) {
        progress.setValue(1);
        return;
      }
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: POP_OPEN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
      return;
    }
    if (reduced) {
      setMounted(false);
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: POP_CLOSE_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [visible, reduced, progress]);

  const moved =
    motion === 'rise'
      ? { transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [RISE_FROM, 0] }) }] }
      : { transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [POP_FROM_SCALE, 1] }) }] };

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

const Impl = resolveMotion120<ComponentType<PopModalProps>>(
  motionCapability,
  'reanimated',
  () => require('./PopModal.motion120').PopModal as ComponentType<PopModalProps>,
  PopModalFallback
);

export function PopModal(props: PopModalProps) {
  return <Impl {...props} />;
}
