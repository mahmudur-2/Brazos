import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { metricStyles, postTiles } from '../lib/theme';

/**
 * 2026-09-30 (the build run, idea 23) — THE CHOSEN CATEGORY TILE'S CHECK, the body both paths
 * share.
 *
 * A chosen tile on Post a job grows by `postTiles.slot` to make room for a small filled check box
 * at its top-left, before its glyph. The box sits in a slot whose width goes from nothing to the
 * slot: on Reanimated the slot glides open on the UI thread (./TileCheck.motion120.tsx), so the
 * tile widens and the tiles after it make room without the JS thread; on a binary without
 * worklets, and for anyone who has asked for reduced motion, the slot is simply there or not
 * (./TileCheck.tsx). React Native's LayoutAnimation is banned in this tree (tests/motion120).
 */
export type TileCheckProps = {
  shown: boolean;
  /** The box's fill and the check's ink — the palette's CTA pair. */
  fill: string;
  ink: string;
};

/** The check box, drawn at the slot's top-left; the slot clips it while it opens. */
export function TileCheckBox({ fill, ink }: { fill: string; ink: string }) {
  const styles = tileCheckStylesFor();
  return (
    <View style={[styles.box, { backgroundColor: fill }]}>
      <Ionicons name="checkmark" size={postTiles.checkGlyph} color={ink} />
    </View>
  );
}

export const tileCheckStylesFor = metricStyles(() =>
  StyleSheet.create({
    // The slot runs the tile's full height and clips, so a growing slot reveals the box from its left.
    slot: {
      alignSelf: 'stretch',
      overflow: 'hidden',
    },
    box: {
      position: 'absolute',
      left: postTiles.checkInset,
      top: postTiles.checkInset,
      width: postTiles.check,
      height: postTiles.check,
      borderRadius: postTiles.checkRadius,
      alignItems: 'center',
      justifyContent: 'center',
    },
  })
);
