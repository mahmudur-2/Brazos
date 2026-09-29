import type { ComponentType } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { motionCapability, resolveMotion120 } from '../lib/motion120';
import { chipCheckStylesFor, chipCheckWidth, type ChipCheckProps } from './ChipCheck.shared';

/**
 * 2026-09-28 (LUX-LIST-64 #35) — THE CHECK IN A CHOSEN GLYPH-LESS CHIP. On a
 * binary with worklets its slot glides open (./ChipCheck.motion120.tsx);
 * without them, and for anyone who has asked for reduced motion, it is simply
 * there when chosen and gone when not. The shared body is ./ChipCheck.shared.tsx.
 */
function ChipCheckStill({ shown, size, color }: ChipCheckProps) {
  const styles = chipCheckStylesFor();
  if (!shown) return null;
  return (
    <View style={[styles.slot, { width: chipCheckWidth(size) }]} pointerEvents="none">
      <Ionicons name="checkmark" size={size} color={color} />
    </View>
  );
}

/**
 * Chosen ONCE, at module load. Worklets alone — there is no gesture here, only
 * a timed width. Metro resolves the literal require at bundle time.
 */
const Impl = resolveMotion120<ComponentType<ChipCheckProps>>(
  motionCapability,
  'reanimated',
  () => require('./ChipCheck.motion120').ChipCheck as ComponentType<ChipCheckProps>,
  ChipCheckStill,
);

export function ChipCheck(props: ChipCheckProps) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion !== false) return <ChipCheckStill {...props} />;
  return <Impl {...props} />;
}
