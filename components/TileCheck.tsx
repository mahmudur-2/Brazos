import type { ComponentType } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { motionCapability, resolveMotion120 } from '../lib/motion120';
import { postTiles } from '../lib/theme';
import { TileCheckBox, tileCheckStylesFor, type TileCheckProps } from './TileCheck.shared';

/**
 * 2026-09-30 (the build run, idea 23) — THE CHECK IN A CHOSEN CATEGORY TILE. On a binary with
 * worklets its slot glides open (./TileCheck.motion120.tsx); without them, and for anyone who has
 * asked for reduced motion, it is simply there when chosen and gone when not. The shared body is
 * ./TileCheck.shared.tsx.
 */
function TileCheckStill({ shown, fill, ink }: TileCheckProps) {
  const styles = tileCheckStylesFor();
  if (!shown) return null;
  return (
    <View style={[styles.slot, { width: postTiles.slot }]} pointerEvents="none">
      <TileCheckBox fill={fill} ink={ink} />
    </View>
  );
}

/**
 * Chosen ONCE, at module load. Worklets alone — there is no gesture here, only a timed width.
 * Metro resolves the literal require at bundle time.
 */
const Impl = resolveMotion120<ComponentType<TileCheckProps>>(
  motionCapability,
  'reanimated',
  () => require('./TileCheck.motion120').TileCheck as ComponentType<TileCheckProps>,
  TileCheckStill,
);

export function TileCheck(props: TileCheckProps) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion !== false) return <TileCheckStill {...props} />;
  return <Impl {...props} />;
}
