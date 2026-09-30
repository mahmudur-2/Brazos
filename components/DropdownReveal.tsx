/**
 * 2026-09-30 (the build run, the smoothness pass) — A ROW THAT OPENS IN PLACE: its body and its
 * chevron, each a chooser over the native-driver fallback (hooks/useDropdownPresence.ts, as the
 * Profile hub had it) and the 120 Hz path (`DropdownReveal.motion120.tsx`).
 */
import type { ComponentType } from 'react';
import { Animated } from 'react-native';
import { useDropdownPresence } from '../hooks/useDropdownPresence';
import { motionCapability, resolveMotion120 } from '../lib/motion120';
import type { DropdownRevealProps } from './DropdownReveal.shared';

export type { DropdownRevealProps } from './DropdownReveal.shared';

function DropdownBodyFallback({ open, style, children }: DropdownRevealProps) {
  const presence = useDropdownPresence(open);
  return presence.mounted ? <Animated.View style={[style, presence.bodyStyle]}>{children}</Animated.View> : null;
}

function DropdownChevronFallback({ open, style, children }: DropdownRevealProps) {
  const presence = useDropdownPresence(open);
  return <Animated.View style={[style, presence.chevronStyle]}>{children}</Animated.View>;
}

const BodyImpl = resolveMotion120<ComponentType<DropdownRevealProps>>(
  motionCapability,
  'reanimated',
  () => require('./DropdownReveal.motion120').DropdownBody as ComponentType<DropdownRevealProps>,
  DropdownBodyFallback
);

const ChevronImpl = resolveMotion120<ComponentType<DropdownRevealProps>>(
  motionCapability,
  'reanimated',
  () => require('./DropdownReveal.motion120').DropdownChevron as ComponentType<DropdownRevealProps>,
  DropdownChevronFallback
);

/** The rows under an opening row: mounted while open or closing. */
export function DropdownBody(props: DropdownRevealProps) {
  return <BodyImpl {...props} />;
}

/** The opening row's chevron: half a turn with the body. */
export function DropdownChevron(props: DropdownRevealProps) {
  return <ChevronImpl {...props} />;
}
