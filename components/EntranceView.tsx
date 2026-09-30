/**
 * 2026-09-30 (the build run, the smoothness pass) — A SCREEN SECTION'S ENTRANCE: the chooser and
 * the native-driver fallback (hooks/useEntrance.ts, as every screen had it). The 120 Hz path
 * (`EntranceView.motion120.tsx`) runs the same spring as a Reanimated animation on the UI thread,
 * where a screen's own render — usually heavy on the frame it mounts — cannot hold it back.
 */
import type { ComponentType } from 'react';
import { Animated } from 'react-native';
import { useEntrance } from '../hooks/useEntrance';
import { motionCapability, resolveMotion120 } from '../lib/motion120';
import type { EntranceViewProps } from './EntranceView.shared';

export type { EntranceViewProps } from './EntranceView.shared';

function EntranceViewFallback({ index = 0, style, children }: EntranceViewProps) {
  const entrance = useEntrance(index);
  return <Animated.View style={[style, entrance]}>{children}</Animated.View>;
}

const Impl = resolveMotion120<ComponentType<EntranceViewProps>>(
  motionCapability,
  'reanimated',
  () => require('./EntranceView.motion120').EntranceView as ComponentType<EntranceViewProps>,
  EntranceViewFallback
);

export function EntranceView(props: EntranceViewProps) {
  return <Impl {...props} />;
}
