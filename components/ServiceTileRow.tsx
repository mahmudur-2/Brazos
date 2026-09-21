import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HOME_SERVICE_TILES } from '../lib/skillCategories';
import { useModePerspective } from '../modes';
import {
  emeraldRadius,
  fonts,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';

/**
 * 2026-09-21 — FOUR WHOLE TILES FILL THE ROW AND NOTHING PEEKS (the operator:
 * "make them big enough so all 4 fit perfectly... I shouldn't see half of
 * Plumb.. icon"; docs/mockups/html/home-redesign.html `.tiles`, DECISIONS
 * 2026-09-20 sitting 3, (8)). The tile is MEASURED from the row's own
 * width — `tileSizeFor(rowWidth, gap)` — never a constant: (width − 3 gaps)
 * / 4, with the gap equal to the gutter, so the fifth tile begins exactly at the
 * screen's edge (at a 16 gap a whole-tile row leaves the fifth peeking 4pt,
 * which the operator ruled out). 73.25 on a 393 phone; TILE_FLOOR is only
 * what the row draws at until it has laid out. The rest scroll sideways.
 * Exported so the fences price the row's geometry off the same arithmetic.
 */
export const TILES_ACROSS = 4;
export const TILE_FLOOR = 68;
export function tileSizeFor(rowWidth: number, gap: number): number {
  return (rowWidth - (TILES_ACROSS - 1) * gap) / TILES_ACROSS;
}
/** The glyph inside the square (the mockup's 30 at the bigger tile). */
const TILE_ICON_SIZE = 30;
/**
 * The heading's size — the customer Home's own section-title rung
 * (screens/HomeScreen.tsx `sectionTitle`, serifSize(30) = 20), so "Popular
 * services" sets exactly as "Your jobs" does. tests/workerHome.test.mjs
 * re-derives that rung from the screen's ladder and compares it to this.
 */
const HEADING_FONT_SIZE = 20;

type ServiceTileRowProps = {
  /**
   * The screen's own content padding. The row runs edge to edge — its tiles
   * slide under the screen's edges rather than being cut at the gutter — and
   * keeps its first tile on the screen's column, so it needs the number the
   * screen pads its column with. Each screen passes the one it already reads.
   */
  inset: number;
  /** A tile's tap, handed the category key — exactly what a chip's tap was. */
  onSelect: (categoryKey: string) => void;
  /**
   * The trailing "Other" tile's tap. The screen opens its own
   * components/ServicePickerSheet.tsx from it, as it did from the "Other"
   * chip: the sheet stays the screen's because each Home words its subtitle
   * differently, so the row hands the tap back rather than owning the sheet.
   */
  onOther: () => void;
  /** An optional section title above the row, in the screen's title style. */
  heading?: string;
};

/**
 * The service row both Home screens draw (2026-09-17): every service the app
 * knows, one horizontally sliding row of square tiles — the six shortcuts,
 * then the eighteen the "Other" sheet lists, then "Other" itself. ONE
 * component, because the customer and worker rows must be the same tiles in
 * the same order and the same geometry; tests/workerHome.test.mjs held the
 * two screens' chip rows byte-identical, and a shared component is how they
 * stay identical from here on.
 *
 * The row owns the tiles, the scroll, the labels and the icons. The tile set
 * is lib/skillCategories.ts's HOME_SERVICE_TILES — built from the two shared
 * lists, never retyped — and the short label under each glyph is that file's
 * TILE_LABELS, read by nothing but this row. The screen owns what a tap DOES:
 * a tile calls the screen's existing category search, and "Other" opens the
 * screen's existing sheet, whose rows call the same search.
 *
 * GEOMETRY, from the mockup's `.tiles` / `.tile` / `.tile-box` rules: a
 * square tile at radius.md (14), the gutter's own step between tiles and as
 * the side inset, a 30 glyph in `emerald` on `mint`, a 13/16 label in the
 * muted ink centred under the box, two lines allowed. 2026-09-21: FOUR WHOLE
 * TILES fill the row (see tileSizeFor above) and nothing peeks — the rest
 * scroll. The row snaps a tile at a time: the interval is one tile plus its
 * gap, aligned to the start, so every rest position puts a tile on the
 * screen's column. react-native-web drops the
 * snap props (its ScrollView forwards only the props it knows) and keeps the
 * scroll, so the harness renders the same rest position as native.
 *
 * Values go through lib/theme.ts tokens: the corner is `emeraldRadius.md`,
 * the gaps are `spacing`, the colours are palette roles. The only literals
 * are sizes — the box, the glyph, the type — which no scale carries.
 */
export function ServiceTileRow({ inset, onSelect, onOther, heading }: ServiceTileRowProps) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  // The hint is worded for the perspective the row renders in — "help" for a
  // customer finding workers, "jobs" for a worker finding work — read from
  // the mode context rather than passed, as CLAUDE.md has shared components
  // take their perspective. It is the same wording each screen's chips had.
  const perspective = useModePerspective();
  const hintFor = (label: string) =>
    perspective === 'worker'
      ? `Find ${label.toLowerCase()} jobs`
      : `Find ${label.toLowerCase()} help`;
  // The gap IS the gutter — the screen's own inset, by construction, so the
  // fifth tile begins exactly at the screen's edge; the tile is whatever four
  // of them and three gaps make of the row's measured width.
  const gap = inset;
  const [rowWidth, setRowWidth] = useState<number | null>(null);
  const tile = rowWidth === null ? TILE_FLOOR : tileSizeFor(rowWidth, gap);
  const onRowLayout = (event: LayoutChangeEvent) => setRowWidth(event.nativeEvent.layout.width - inset * 2);
  // One tile's pitch: its box plus the gap after it.
  const pitch = tile + gap;

  return (
    <View style={styles.block}>
      {heading ? (
        <Text style={styles.heading} maxFontSizeMultiplier={1.3}>
          {heading}
        </Text>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={pitch}
        snapToAlignment="start"
        decelerationRate="fast"
        keyboardShouldPersistTaps="handled"
        // Full bleed inside the screen's padded column: the negative margin
        // takes the row to the screen edges and the content padding puts the
        // first tile back on the column. Both are the screen's own number.
        style={{ marginHorizontal: -inset }}
        onLayout={onRowLayout}
        contentContainerStyle={[styles.row, { paddingHorizontal: inset, gap }]}
      >
        {HOME_SERVICE_TILES.map((service) => (
          <Pressable
            // Several entries share a key (see MORE_SERVICES), so the full
            // label is what makes a tile unique — the same rule the sheet uses.
            key={service.label}
            onPress={() => onSelect(service.key)}
            style={({ pressed }) => [styles.tile, { width: tile }, pressed && styles.tilePressed]}
            accessibilityRole="button"
            // The screen reader gets the full name; the tile draws the short one.
            accessibilityLabel={service.label}
            accessibilityHint={hintFor(service.label)}
          >
            <View style={[styles.box, { width: tile, height: tile }]}>
              <Ionicons name={service.icon} size={TILE_ICON_SIZE} color={colors.emerald} />
            </View>
            <Text style={styles.label} numberOfLines={2}>
              {service.tileLabel}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={onOther}
          style={({ pressed }) => [styles.tile, { width: tile }, pressed && styles.tilePressed]}
          accessibilityRole="button"
          accessibilityLabel="Other services"
          accessibilityHint="Opens the full list of services"
        >
          <View style={[styles.box, { width: tile, height: tile }]}>
            <Ionicons name="ellipsis-horizontal" size={TILE_ICON_SIZE} color={colors.emerald} />
          </View>
          <Text style={styles.label} numberOfLines={2}>
            Other
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    // Heading to row: the customer Home's own section rhythm (`section: {
    // gap: 12 }` there), so the title sits over its row as "Your jobs" sits
    // over its cards.
    block: { gap: spacing.md },
    heading: {
      fontFamily: fonts.display,
      fontSize: HEADING_FONT_SIZE,
      fontWeight: '700',
      color: colors.ink,
    },
    // The gap is set at render: the gutter itself, which is what makes four
    // whole tiles end exactly at the screen's edge.
    row: { flexDirection: 'row' },
    // A tile is its box and its label, centred; the 6 between them is the
    // mockup's, spelled off the scale the way components/Chip.tsx spells its
    // own 6 (`spacing.xs + 2`). Box plus label clears the 44pt touch floor.
    // The width is set at render from the row's measurement.
    tile: { alignItems: 'center', gap: spacing.xs + 2 },
    tilePressed: { opacity: 0.85 },
    box: {
      borderRadius: emeraldRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.mint,
    },
    label: {
      fontSize: 13,
      lineHeight: 16,
      textAlign: 'center',
      color: colors.textMuted,
    },
  })
);
