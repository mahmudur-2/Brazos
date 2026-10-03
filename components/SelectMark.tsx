/**
 * FIX-RUN F12 — THE ARRIVING MARK: the chooser and the native-driver fallback. What the pieces
 * are, and why nothing mounts under Reduce Motion, is in ./SelectMark.shared.tsx.
 */
import { useEffect, useRef, type ComponentType } from 'react';
import { Animated, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { motionCapability, resolveMotion120 } from '../lib/motion120';
import {
  MARK_FROM,
  MARK_SPRING,
  OVER,
  POP_DOWN_SPRING,
  POP_PEAK,
  POP_UP_SPRING,
  type MarkPopProps,
  type SelectMarkProps,
} from './SelectMark.shared';

export type { MarkPopProps, SelectMarkProps } from './SelectMark.shared';

function SelectMarkFallback({ on, mark, off }: SelectMarkProps) {
  const progress = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    const spring = Animated.spring(progress, { toValue: on ? 1 : 0, ...MARK_SPRING, useNativeDriver: USE_NATIVE_DRIVER });
    spring.start();
    return () => spring.stop();
  }, [on, progress]);
  const markMotion = {
    opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
    transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [MARK_FROM, 1] }) }],
  };
  if (!off) return <Animated.View style={markMotion}>{mark}</Animated.View>;
  const offMotion = {
    opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: 'clamp' }),
  };
  return (
    <View>
      <Animated.View style={offMotion}>{off}</Animated.View>
      <Animated.View style={[OVER, markMotion]}>{mark}</Animated.View>
    </View>
  );
}

function MarkPopFallback({ popKey, children }: MarkPopProps) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!popKey) return;
    const pop = Animated.sequence([
      Animated.spring(scale, { toValue: POP_PEAK, ...POP_UP_SPRING, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.spring(scale, { toValue: 1, ...POP_DOWN_SPRING, useNativeDriver: USE_NATIVE_DRIVER }),
    ]);
    pop.start();
    return () => pop.stop();
  }, [popKey, scale]);
  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}

type SelectMarkModule = {
  SelectMark: ComponentType<SelectMarkProps>;
  MarkPop: ComponentType<MarkPopProps>;
};

/** Chosen ONCE, at module load. Worklets alone. */
const Impl = resolveMotion120<SelectMarkModule>(
  motionCapability,
  'reanimated',
  () => require('./SelectMark.motion120') as SelectMarkModule,
  { SelectMark: SelectMarkFallback, MarkPop: MarkPopFallback }
);

export function SelectMark(props: SelectMarkProps) {
  const animated = useReducedMotion() === false;
  if (!animated) return <>{props.on ? props.mark : (props.off ?? null)}</>;
  return <Impl.SelectMark {...props} />;
}

export function MarkPop(props: MarkPopProps) {
  const animated = useReducedMotion() === false;
  if (!animated) return <>{props.children}</>;
  return <Impl.MarkPop {...props} />;
}
