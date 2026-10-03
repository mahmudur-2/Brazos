/**
 * F8 (fix run, 2026-10-03) — A BLOCK THAT STEPS ASIDE FOR THE KEYBOARD: the chooser and the
 * native-driver fallback. The 120 Hz path (`KeyboardAway.motion120.tsx`) fades the block as a
 * Reanimated layout animation and glides the block below it on the UI thread; here the block fades on
 * the native driver and leaves the layout when the fade ends, and the block below simply follows.
 */
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Animated, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { motionCapability, resolveMotion120 } from '../lib/motion120';
import type { KeyboardAwayProps, KeyboardShiftProps } from './KeyboardAway.shared';

export type { KeyboardAwayProps, KeyboardShiftProps } from './KeyboardAway.shared';

function KeyboardAwayFallback({ hidden, durationMs, style, children }: KeyboardAwayProps) {
  const reduced = useReducedMotion() !== false;
  const [mounted, setMounted] = useState(!hidden);
  const opacity = useRef(new Animated.Value(hidden ? 0 : 1)).current;
  useEffect(() => {
    if (!hidden) setMounted(true);
    if (reduced) {
      opacity.setValue(hidden ? 0 : 1);
      if (hidden) setMounted(false);
      return;
    }
    const run = Animated.timing(opacity, {
      toValue: hidden ? 0 : 1,
      duration: durationMs,
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    run.start(({ finished }) => {
      if (finished && hidden) setMounted(false);
    });
    return () => run.stop();
    // The fade follows `hidden`; the duration is read when it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden, reduced]);
  if (!mounted) return null;
  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

function KeyboardShiftFallback({ style, children }: KeyboardShiftProps) {
  return <View style={style}>{children}</View>;
}

const AwayImpl = resolveMotion120<ComponentType<KeyboardAwayProps>>(
  motionCapability,
  'reanimated',
  () => require('./KeyboardAway.motion120').KeyboardAway as ComponentType<KeyboardAwayProps>,
  KeyboardAwayFallback
);

const ShiftImpl = resolveMotion120<ComponentType<KeyboardShiftProps>>(
  motionCapability,
  'reanimated',
  () => require('./KeyboardAway.motion120').KeyboardShift as ComponentType<KeyboardShiftProps>,
  KeyboardShiftFallback
);

/** A block that fades out of the page while the keyboard is up, and back when it goes. */
export function KeyboardAway(props: KeyboardAwayProps) {
  return <AwayImpl {...props} />;
}

/** The block below a KeyboardAway: it travels to its new place instead of jumping. */
export function KeyboardShift(props: KeyboardShiftProps) {
  return <ShiftImpl {...props} />;
}
