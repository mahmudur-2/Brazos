import { useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CategoryGlyph } from './CategoryGlyph';
import { HOME_SERVICE_TILES } from '../lib/skillCategories';
import { useModePerspective } from '../modes';
import {
  litCardStyle, EYEBROW_TYPE,
  emeraldRadius,
  shadows,
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
/** The glyph inside the square: the Lux tile draws 26; 2026-09-28 (LUX-LIST-64
 *  #12) the operator's 30, dead centre in the tile. */
export const TILE_ICON_SIZE = 30;
/**
 * 2026-09-27 (the Lux remake, ruling 12): the Lux line icons — the Ionicons
 * `-outline` variant of each tile's own glyph, mint. Every name in
 * lib/skillCategories.ts has one (checked against the Ionicons glyph map at
 * the remake), so the derivation is a suffix, never a second table.
 */
type IoniconName = ComponentProps<typeof Ionicons>['name'];
export function outlineIcon(name: IoniconName): IoniconName {
  return (name.endsWith('-outline') || name.endsWith('-sharp') ? name : `${name}-outline`) as IoniconName;
}

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
  /**
   * 2026-09-28 (LUX-LIST-64 #13) — "View all →" at the heading's right, styled
   * like the Home's "See all →"; the screen opens its all-services list.
   */
  onViewAll?: () => void;
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
export function ServiceTileRow({ inset, onSelect, onOther, heading, onViewAll }: ServiceTileRowProps) {
  const { palette: colors, isDark } = useThemeColors();
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
        <View style={styles.headingRow}>
          {/* 2026-09-27 (the Lux remake, ruling 4): the heading is the Lux eyebrow
              — gold in dark, the eyebrow role in light. */}
          <Text style={styles.heading} maxFontSizeMultiplier={1.3}>
            {heading}
          </Text>
          {onViewAll ? (
            <Pressable
              onPress={onViewAll}
              hitSlop={6}
              style={({ pressed }) => [styles.viewAll, pressed && styles.viewAllPressed]}
              accessibilityRole="button"
              accessibilityLabel="View all services"
            >
              <Text style={[styles.viewAllText, { color: isDark ? colors.emerald : colors.forest }]}>View all</Text>
              <Ionicons name="arrow-forward" size={19} color={isDark ? colors.emerald : colors.forest} />
            </Pressable>
          ) : null}
        </View>
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
            <View style={[styles.box, litCardStyle(isDark, 'tile'), { width: tile, height: tile }]}>
              <CategoryGlyph name={service.icon} size={TILE_ICON_SIZE} color={colors.emerald} />
              <Text style={styles.label} numberOfLines={2}>
                {service.tileLabel}
              </Text>
            </View>
          </Pressable>
        ))}
        <Pressable
          onPress={onOther}
          style={({ pressed }) => [styles.tile, { width: tile }, pressed && styles.tilePressed]}
          accessibilityRole="button"
          accessibilityLabel="Other services"
          accessibilityHint="Opens the full list of services"
        >
          <View style={[styles.box, litCardStyle(isDark, 'tile'), { width: tile, height: tile }]}>
            <Ionicons name="ellipsis-horizontal" size={TILE_ICON_SIZE} color={colors.emerald} />
            <Text style={styles.label} numberOfLines={2}>
              Other
            </Text>
          </View>
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
    headingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      // the link's 44pt target sits inside the row's rhythm, not on top of it
      marginVertical: -spacing.md,
    },
    heading: {
      ...EYEBROW_TYPE,
      // 2026-09-29 (LUX-LIST-2 #4): one of the 25 labels kept antique gold in light.
      color: colors.eyebrowGold,
    },
    viewAll: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: 44,
    },
    viewAllPressed: { opacity: 0.78 },
    viewAllText: {
      fontSize: 14,
      fontWeight: '600',
    },
    // The gap is set at render: the gutter itself, which is what makes four
    // whole tiles end exactly at the screen's edge.
    // 2026-09-29 (LUX-LIST-2 #6): a scroller clips what it holds, so the row keeps the tiles' shadow
    // room below them now the names no longer sit there.
    row: { flexDirection: 'row', paddingBottom: spacing.lg },
    // A tile is its box and its label, centred; the 6 between them is the
    // mockup's, spelled off the scale the way components/Chip.tsx spells its
    // own 6 (`spacing.xs + 2`). Box plus label clears the 44pt touch floor.
    // The width is set at render from the row's measurement.
    tile: { alignItems: 'center' },
    tilePressed: { opacity: 0.85 },
    // 2026-09-27 (the Lux remake, rulings 8 and 12): the Lux glass tile — the
    // card fill inside the mint-neutral rim at the tile radius, the line icon
    // in mint — a pop-out under the card shadow in dark; white under the soft
    // card shadow in light.
    // 2026-09-29 (LUX-LIST-2 #6): the name sits inside, under the icon — the sim's `.tile` (gap 6).
    box: {
      borderRadius: emeraldRadius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs + 2,
      paddingHorizontal: 2,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.card,
    },
    // The sim's tile name: 12 / 600 in the ink, two lines at most ("TV mounting" wraps in a 73pt tile).
    label: {
      fontSize: 12,
      lineHeight: 14,
      fontWeight: '600',
      textAlign: 'center',
      color: colors.text,
    },
  })
);
