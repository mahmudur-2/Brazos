import { useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { SelectionText, SelectionThumb } from './Selection';
import {
  metricStyles,
  radius,
  spacing,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * 2026-09-28 (LUX-LIST-64 #37) — a segment may carry an icon beside its label,
 * the pair centred in the half: the FILLED glyph while chosen, the OUTLINE
 * otherwise, so the two swap as the choice moves (Post a Job's "Ask for bids"
 * people and "Set a price" tag).
 */
type Option<T extends string> = { label: string; value: T; icon?: { on: IoniconName; off: IoniconName } };

type SegmentedControlProps<T extends string> = {
  options: Option<T>[];
  /** null = nothing selected — a caller whose default state is outside the
   *  options (e.g. ClientJobDetail's stated default bid order) renders every
   *  segment unselected until the user picks one. */
  value: T | null;
  onChange: (value: T) => void;
  palette?: ColorPalette;
  /** The track's outer height; the cells fill it inside the 4pt padding. */
  height?: number;
  /** The track's corner; the cells round to half their own height. */
  radius?: number;
};

/** The Lux `.seg2` at the app's 44pt touch floor: 44pt cells inside a 4pt-padded track — 52 tall. */
export const TRACK_PADDING = 4;
export const TRACK_HEIGHT = 52;
/** The track's hairline (styles.track). */
const TRACK_BORDER = 1;

/**
 * 2026-09-27 (the operator's review — "pills shape and sizes like the
 * reference, anywhere on the app, the highlighted colour #4FC58C") — THE LUX
 * SEGMENT (`.seg2`): a low glass track (the ink at .06 under the rim, 4pt of
 * padding, pill corners) and the chosen cell FILLED with the one mint, its
 * label in the CTA ink; the other cells bare and muted at the same weight.
 * It replaces the gold-lined chosen cell of decision 5 / emerald D6 for
 * segmented tabs only — a chosen CHIP keeps its glass (ruling 11). Dark and
 * light share the geometry; light fills the chosen cell with its own
 * primary green and floats the track on the mint tint.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  palette: paletteProp,
  height = TRACK_HEIGHT,
  radius: trackRadius = radius.pill,
}: SegmentedControlProps<T>) {
  const styles = stylesFor();
  const { palette: colors, isDark } = useThemeColors();
  const palette = paletteProp ?? colors;
  const cellHeight = Math.max(0, height - TRACK_PADDING * 2);
  const cellRadius = Math.round(Math.max(cellHeight, 44) / 2);
  // FIX-RUN F12 — with motion on, the chosen fill is ONE thumb that slides from cell to cell and
  // the labels fade to their colours (components/Selection). It needs the track's width, so
  // until the first layout (and under Reduce Motion, always) each cell paints its own fill.
  const animated = useReducedMotion() === false;
  const [trackWidth, setTrackWidth] = useState(0);
  const cellWidth =
    trackWidth > 0 ? (trackWidth - TRACK_BORDER * 2 - TRACK_PADDING * 2) / Math.max(1, options.length) : 0;
  const thumbed = animated && cellWidth > 0;
  const chosenIndex = options.findIndex((option) => option.value === value);
  return (
    <View
      onLayout={animated ? (event) => setTrackWidth(event.nativeEvent.layout.width) : undefined}
      style={[
        styles.track,
        {
          minHeight: height,
          borderRadius: trackRadius,
          backgroundColor: isDark ? withAlpha(palette.text, 0.06) : palette.mint,
          borderColor: palette.border,
        },
      ]}
      accessibilityRole="tablist"
    >
      {thumbed ? (
        <SelectionThumb
          index={chosenIndex >= 0 ? chosenIndex : null}
          cellWidth={cellWidth}
          inset={TRACK_PADDING}
          radius={cellRadius}
          color={palette.primary}
        />
      ) : null}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.cell,
              // The cell is the touch target: never under the 44pt floor,
              // taller only when the track is dialled taller.
              cellHeight > 44 && { minHeight: cellHeight },
              { borderRadius: cellRadius },
              selected && !thumbed && { backgroundColor: palette.primary },
              pressed && styles.pressed,
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            {option.icon ? (
              <Ionicons
                name={selected ? option.icon.on : option.icon.off}
                size={18}
                color={selected ? palette.onPrimary : palette.textMuted}
              />
            ) : null}
            {animated ? (
              <SelectionText
                on={selected}
                rest={palette.textMuted}
                chosen={palette.onPrimary}
                style={styles.label}
                numberOfLines={1}
              >
                {option.label}
              </SelectionText>
            ) : (
              <Text
                style={[styles.label, { color: selected ? palette.onPrimary : palette.textMuted }]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const stylesFor = metricStyles(() => StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: TRACK_PADDING,
    borderWidth: 1,
  },
  cell: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.78,
  },
}));
