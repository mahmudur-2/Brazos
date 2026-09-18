import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
 * The square each tile draws its glyph in — docs/mockups/html/home-redesign.html's
 * `.tile-box` (68x68). Exported so the fences can price the row's geometry
 * off the same number the row draws.
 */
export const TILE_SIZE = 68;
/** The glyph inside the square (the mockup's 28). */
const TILE_ICON_SIZE = 28;
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
 * GEOMETRY, from the mockup's `.tiles` / `.tile` / `.tile-box` rules: tile
 * 68x68 at radius.md (14), 16 between tiles, the screen's own padding as the
 * side inset, a 28 glyph in `emerald` on `mint`, a 13/16 label in the muted
 * ink centred under the box, two lines allowed. On a 393pt screen that is
 * four tiles fully visible and the fifth cut in half — 20 + 4 x 84 = 356
 * from the left edge, 37 of its 68 on screen — which is what makes the slide
 * obvious without an affordance. The row snaps a tile at a time: the
 * interval is one tile plus its gap, aligned to the start, so every rest
 * position puts a tile on the screen's column. react-native-web drops the
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
  // One tile's pitch: its box plus the gap after it. Read at render, so the
  // snap follows the live spacing scale the stylesheet draws the gap from.
  const pitch = TILE_SIZE + spacing.lg;

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
        contentContainerStyle={[styles.row, { paddingHorizontal: inset }]}
      >
        {HOME_SERVICE_TILES.map((service) => (
          <Pressable
            // Several entries share a key (see MORE_SERVICES), so the full
            // label is what makes a tile unique — the same rule the sheet uses.
            key={service.label}
            onPress={() => onSelect(service.key)}
            style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
            accessibilityRole="button"
            // The screen reader gets the full name; the tile draws the short one.
            accessibilityLabel={service.label}
            accessibilityHint={hintFor(service.label)}
          >
            <View style={styles.box}>
              <Ionicons name={service.icon} size={TILE_ICON_SIZE} color={colors.emerald} />
            </View>
            <Text style={styles.label} numberOfLines={2}>
              {service.tileLabel}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={onOther}
          style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
          accessibilityRole="button"
          accessibilityLabel="Other services"
          accessibilityHint="Opens the full list of services"
        >
          <View style={styles.box}>
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
    row: { flexDirection: 'row', gap: spacing.lg },
    // A tile is its box and its label, centred; the 6 between them is the
    // mockup's, spelled off the scale the way components/Chip.tsx spells its
    // own 6 (`spacing.xs + 2`). Box plus label clears the 44pt touch floor.
    tile: { width: TILE_SIZE, alignItems: 'center', gap: spacing.xs + 2 },
    tilePressed: { opacity: 0.85 },
    box: {
      width: TILE_SIZE,
      height: TILE_SIZE,
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
