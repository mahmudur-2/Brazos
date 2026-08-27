import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useThemeColors } from '../../lib/theme';
import { useDialNumber, useDialString } from '../../lib/designOverrides';
import { DIVIDER_DEFAULTS } from '../tokens';

/**
 * RUN T1 (C4/D8) — THE ONE HAIRLINE.
 *
 * A divider was drawn four different ways across the tree, three of them
 * byte-identical by coincidence rather than by construction:
 * components/DropMenu.shared.tsx's row separator, components/ReportDialog.tsx's
 * block row and screens/AppearanceScreen.tsx's row rule all wrote
 * `borderTopWidth: StyleSheet.hairlineWidth` with `borderTopColor:
 * colors.border`; components/JobOwnerActions.tsx wrote a flat `1` over the
 * same colour. This component is that agreed hairline, given a name and three
 * dials, so the next surface that needs a rule does not invent a fifth.
 *
 * IT DOES NOT CONVERT ANYTHING YET, AND THAT IS DELIBERATE. Repointing those
 * four surfaces at it is a screen change and belongs to the run that owns
 * screens; shipping the primitive and its dials is this run's whole divider
 * job. Nothing in the tree renders it today, so it cannot have moved a pixel.
 *
 * WHY A DRAWN VIEW AND NOT A BORDER. A border belongs to the box it is on, so
 * it cannot be inset, cannot be vertical without a second box, and forces
 * every caller to know which EDGE carries the rule. A view of its own is one
 * shape for all four cases.
 */
export type DividerProps = {
  /** A rule across the flow (default) or a rule down it — a vertical divider
   *  stretches to its row's height, so its parent must give it one. */
  orientation?: 'horizontal' | 'vertical';
  /**
   * Indent from BOTH ends, in points. Overrides the dial for this one
   * divider — for a rule that stops short of a card's padding, say. Omitted,
   * every divider in the app follows the studio's inset dial together.
   */
  inset?: number;
  /** Overrides the palette's `border` for this one divider. */
  color?: string;
  style?: StyleProp<ViewStyle>;
};

export function Divider({ orientation = 'horizontal', inset, color, style }: DividerProps) {
  const { palette } = useThemeColors();
  const thicknessDial = useDialNumber('divider.thickness');
  const insetDial = useDialNumber('divider.inset');
  const colorDial = useDialString('divider.color');

  // 0 is not a thickness, it is "the platform hairline" — see DIVIDER_DEFAULTS.
  const dialled = thicknessDial ?? DIVIDER_DEFAULTS.thickness;
  const thickness = dialled > 0 ? dialled : StyleSheet.hairlineWidth;
  const indent = inset ?? insetDial ?? DIVIDER_DEFAULTS.inset;
  const line = color ?? colorDial ?? palette.border;

  return (
    <View
      // A rule is decoration, never content: a screen reader announcing it
      // would read a separator as an item.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        orientation === 'horizontal'
          ? { height: thickness, alignSelf: 'stretch', marginHorizontal: indent }
          : { width: thickness, alignSelf: 'stretch', marginVertical: indent },
        { backgroundColor: line },
        style,
      ]}
    />
  );
}
