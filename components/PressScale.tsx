/**
 * FIX-RUN F12 — THE PRESS, AS A COMPONENT: the chooser and the native-driver fallback (the
 * shared hook, hooks/usePressFeedback.ts, as Card and ListRow already wear it). The 120 Hz path
 * (`PressScale.motion120.tsx`) runs the same spring on the UI thread. What both share, and why
 * the wrapper takes the caller's place, is in ./PressScale.shared.tsx.
 */
import type { ComponentType } from 'react';
import { Animated, Pressable } from 'react-native';
import { usePressFeedback } from '../hooks/usePressFeedback';
import { motionCapability, resolveMotion120 } from '../lib/motion120';
import { pressStyles, type PressScaleProps } from './PressScale.shared';

export type { PressScaleProps } from './PressScale.shared';

function PressScaleFallback({ haptic = true, style, onPressIn, onPressOut, onLayout, ...rest }: PressScaleProps) {
  const press = usePressFeedback({ haptic });
  const { outer, inner } = pressStyles(style);
  return (
    <Animated.View style={[outer, press.style]} onLayout={onLayout}>
      <Pressable
        {...rest}
        style={inner}
        onPressIn={(event) => {
          press.onPressIn();
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          press.onPressOut();
          onPressOut?.(event);
        }}
      />
    </Animated.View>
  );
}

/** Chosen ONCE, at module load. Worklets alone — a press needs no recogniser. */
const Impl = resolveMotion120<ComponentType<PressScaleProps>>(
  motionCapability,
  'reanimated',
  () => require('./PressScale.motion120').PressScale as ComponentType<PressScaleProps>,
  PressScaleFallback
);

export function PressScale(props: PressScaleProps) {
  return <Impl {...props} />;
}
