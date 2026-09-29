import type { ComponentProps } from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { outlineIcon } from './ServiceTileRow';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * 2026-09-28 (LUX-LIST-64 #14) — A SERVICE'S GLYPH, everywhere a category is
 * drawn (the tiles, the all-services list, the glyph on a job card or a job's
 * page). Three glyphs are not Ionicons: Painting is sim.html's paint roller
 * (`i-brush`), Junk Removal its trash can (`i-trash`), and Handyman a DRILL —
 * the hammer is Assembly's (`construct`). No SVG library is installed, so the
 * three are baked once as white line art (assets/glyphs, drawn at an Ionicons
 * outline's weight and extent) and tinted here with `tintColor`; every other
 * name stays the Ionicons outline it was. The data keeps its Ionicons names,
 * so nothing that stores or compares an icon moves.
 *
 * `filled`: the places that draw a category's SOLID Ionicon (a choice chip, a
 * job page's category well, the portfolio picker) get the three as solid
 * glyphs too — the same shapes, closed parts filled — and every other name
 * stays the filled Ionicon it was. `bare`: the glyph keeps the plain Ionicons
 * box its site always laid out (the #12 centring is the tiles' own).
 */
const BAKED: Readonly<Record<string, number>> = {
  'color-palette': require('../assets/glyphs/roller.png'),
  trash: require('../assets/glyphs/trash.png'),
  hammer: require('../assets/glyphs/drill.png'),
};
const BAKED_FILLED: Readonly<Record<string, number>> = {
  'color-palette': require('../assets/glyphs/roller-fill.png'),
  trash: require('../assets/glyphs/trash-fill.png'),
  hammer: require('../assets/glyphs/drill-fill.png'),
};

export function CategoryGlyph({
  name,
  size,
  color,
  style,
  filled = false,
  bare = false,
}: {
  name: IoniconName;
  size: number;
  color: string;
  style?: StyleProp<ImageStyle>;
  filled?: boolean;
  bare?: boolean;
}) {
  const key = String(name).replace(/-(outline|sharp)$/, '');
  const baked = (filled ? BAKED_FILLED : BAKED)[key];
  if (baked) {
    return (
      <Image
        source={baked}
        style={[{ width: size, height: size, tintColor: color }, style]}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    );
  }
  if (bare) {
    return <Ionicons name={filled ? name : outlineIcon(name)} size={size} color={color} style={style as never} />;
  }
  // #12 — dead centre: the glyph's line box is its own em square, so the ink
  // sits in the middle of whatever centres it (the font's default leading put
  // it a point high).
  return (
    <Ionicons
      name={outlineIcon(name)}
      size={size}
      color={color}
      style={[{ width: size, height: size, lineHeight: size, textAlign: 'center' }, style as never]}
    />
  );
}
