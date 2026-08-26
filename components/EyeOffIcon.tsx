import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../lib/theme';

/**
 * RUN PJ1 (C6) — the universal "not visible" glyph: an eye with a slash.
 *
 * One standalone component so every privacy notice draws the same eye. It
 * renders Ionicons' own `eye-off` glyph — the icon set this repo already
 * ships — rather than a hand-drawn vector, so no dependency was added.
 *
 * PROPS (each optional; the defaults reproduce the media notice's previous
 * icon footprint — a 20pt outline glyph in the palette's emerald):
 *
 *   size    number, default 20. The glyph's height and width in points.
 *   color   string, default: the resolved palette's `emerald` (the colour
 *           the notice's old shield used, correct in both themes).
 *   weight  'regular' | 'bold', default 'regular'. Ionicons is an icon FONT,
 *           not a stroked drawing, so weight cannot vary continuously — it
 *           selects between the set's two cuts: 'regular' is the outline
 *           glyph (`eye-off-outline`), 'bold' the filled one (`eye-off`).
 */
export type EyeOffIconProps = {
  size?: number;
  color?: string;
  weight?: 'regular' | 'bold';
};

export function EyeOffIcon({ size = 20, color, weight = 'regular' }: EyeOffIconProps) {
  const { palette } = useThemeColors();
  return (
    <Ionicons
      name={weight === 'bold' ? 'eye-off' : 'eye-off-outline'}
      size={size}
      color={color ?? palette.emerald}
    />
  );
}
