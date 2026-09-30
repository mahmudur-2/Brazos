import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CategoryGlyph } from './CategoryGlyph';
import { DROPDOWN_SETTLE } from './DropdownReveal.shared';
import { TILE_FLOOR, TILE_ICON_SIZE, tileSizeFor } from './ServiceTileRow';
import { TileCheck } from './TileCheck';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { JOB_CATEGORY_CHIP_LABELS, JOB_CATEGORY_ICONS, JOB_CATEGORY_LABELS, type JobCategory } from '../lib/jobs';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { skillCategoryIcon } from '../lib/skillCategories';
import {
  emeraldRadius,
  litCardStyle,
  postTiles,
  selectedInDark,
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * The name a posting tile draws: the category filter's short name, except Handyman, whose
 * "Handyman / Repairs" breaks across a 73pt tile. The screen reader always gets the full label.
 */
function tileLabel(category: JobCategory): string {
  return category === 'handyman' ? 'Handyman' : JOB_CATEGORY_CHIP_LABELS[category];
}

/** The tile's glyph: Home's own for the category (lib/skillCategories.ts); Other is Home's dots. */
function tileIcon(category: JobCategory): IoniconName {
  if (category === 'other') return 'ellipsis-horizontal';
  return skillCategoryIcon(category) ?? JOB_CATEGORY_ICONS[category];
}

type CategoryTileRowProps = {
  /** The postable categories, in the order the row draws them — the screen owns the list. */
  categories: readonly JobCategory[];
  selected: JobCategory | null;
  /** Whether the chosen tile's questions are open under the row. */
  questionsOpen: boolean;
  /** A tile's tap, handed its category — the screen decides what choosing does. */
  onSelect: (category: JobCategory) => void;
  /** The down-arrow under the chosen tile: opens or closes its questions. */
  onToggleQuestions: () => void;
  /** The screen's own content padding; the row runs edge to edge and keeps its first tile on it. */
  inset: number;
};

/**
 * 2026-09-30 (the build run, idea 23) — POST A JOB'S CATEGORY PICKER: a sliding row of Home's
 * Popular-services tiles (components/ServiceTileRow.tsx — the same measured square, four whole
 * tiles across with the gutter between them, the same corner, glyph and names, both modes), one
 * tile per postable category. The operator's words: "use the same icons / style … as the ones in
 * home customer … add a > pointing down to showcase it opening".
 *
 * The chosen tile lights its rim, grows `postTiles.slot` wider for a check box before its glyph
 * (components/TileCheck.tsx — a slot that glides open on the UI thread), and a small down-arrow
 * drops in half under it: the questions open under the row (components/PostQuestions.tsx), and the
 * arrow opens or closes them. Tapping the chosen tile again clears the category, as the pills did.
 */
export function CategoryTileRow({
  categories,
  selected,
  questionsOpen,
  onSelect,
  onToggleQuestions,
  inset,
}: CategoryTileRowProps) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const reducedMotion = useReducedMotion();
  // The gap IS the gutter, and the tile is four of them across the measured row — Home's geometry.
  const gap = inset;
  const [rowWidth, setRowWidth] = useState<number | null>(null);
  const tile = rowWidth === null ? TILE_FLOOR : tileSizeFor(rowWidth, gap);
  const pitch = tile + gap;
  const rim = isDark ? selectedInDark(colors).line : colors.forest;

  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(0);
  const viewport = useRef(0);
  const selectedIndex = selected ? categories.indexOf(selected) : -1;

  // Each rest position puts a tile's start on the screen's column, the chosen tile's width counted.
  const offsets = categories.map(
    (_, index) => index * pitch + (selectedIndex >= 0 && index > selectedIndex ? postTiles.slot : 0)
  );

  // A tile chosen at the row's edge grows past it; once it has grown, the row brings it whole
  // into view.
  useEffect(() => {
    if (selectedIndex < 0 || viewport.current <= 0) return;
    const left = inset + selectedIndex * pitch;
    const right = left + tile + postTiles.slot;
    const x = scrollX.current;
    const target =
      right > x + viewport.current - inset ? right - viewport.current + inset : left < x + inset ? left - inset : null;
    if (target == null) return;
    const animated = reducedMotion === false;
    const timer = setTimeout(
      () => scrollRef.current?.scrollTo({ x: Math.max(0, target), animated }),
      animated ? postTiles.widenMs : 0
    );
    return () => clearTimeout(timer);
    // Runs when the choice changes; the geometry it reads is the row's at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToOffsets={offsets}
      snapToAlignment="start"
      decelerationRate="fast"
      keyboardShouldPersistTaps="handled"
      // Full bleed inside the screen's padded column, as Home's row: the negative margin takes the
      // row to the screen's edges and the content padding puts the first tile back on the column.
      style={{ marginHorizontal: -inset }}
      onLayout={(event) => {
        viewport.current = event.nativeEvent.layout.width;
        setRowWidth(event.nativeEvent.layout.width - inset * 2);
      }}
      onScroll={(event) => {
        scrollX.current = event.nativeEvent.contentOffset.x;
      }}
      scrollEventThrottle={32}
      contentContainerStyle={[styles.row, { paddingHorizontal: inset, gap }]}
    >
      {categories.map((category) => {
        const chosen = category === selected;
        return (
          <View key={category}>
            <Pressable
              onPress={() => onSelect(category)}
              style={({ pressed }) => pressed && styles.tilePressed}
              accessibilityRole="button"
              accessibilityState={{ selected: chosen }}
              accessibilityLabel={JOB_CATEGORY_LABELS[category]}
              accessibilityHint={chosen ? 'Clears the category' : 'Chooses this category and opens its questions'}
            >
              <View style={[styles.box, litCardStyle(isDark, 'tile'), { height: tile }]}>
                <TileRim shown={chosen} color={rim} still={reducedMotion !== false} />
                <TileCheck shown={chosen} fill={colors.primary} ink={colors.onPrimary} />
                {/* The glyph and the name keep the unchosen tile's column, less its two hairlines. */}
                <View style={[styles.content, { width: tile - 2 }]}>
                  {category === 'other' ? (
                    <Ionicons name="ellipsis-horizontal" size={TILE_ICON_SIZE} color={colors.emerald} />
                  ) : (
                    <CategoryGlyph name={tileIcon(category)} size={TILE_ICON_SIZE} color={colors.emerald} />
                  )}
                  <Text style={styles.label} numberOfLines={2}>
                    {tileLabel(category)}
                  </Text>
                </View>
              </View>
            </Pressable>
            {chosen ? (
              <TileArrow
                open={questionsOpen}
                onPress={onToggleQuestions}
                fill={colors.primary}
                ink={colors.onPrimary}
                still={reducedMotion !== false}
              />
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

/**
 * The Fable review: the chosen tile's rim, over the tile's own hairline, fading in (and out) over the
 * same time the tile widens — it no longer snaps while the width glides. Native-driven opacity.
 */
function TileRim({ shown, color, still }: { shown: boolean; color: string; still: boolean }) {
  const styles = stylesFor(useThemeColors().palette);
  const on = useRef(new Animated.Value(shown ? 1 : 0)).current;
  useEffect(() => {
    if (still) {
      on.setValue(shown ? 1 : 0);
      return;
    }
    const animation = Animated.timing(on, {
      toValue: shown ? 1 : 0,
      duration: postTiles.widenMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    animation.start();
    return () => animation.stop();
  }, [on, shown, still]);
  return <Animated.View pointerEvents="none" style={[styles.rim, { borderColor: color, opacity: on }]} />;
}

/**
 * The down-arrow under the chosen tile: it drops in just after the tile has grown (a short fade and
 * a settle, native-driven), and it is the control that opens or closes the questions.
 */
function TileArrow({
  open,
  onPress,
  fill,
  ink,
  still,
}: {
  open: boolean;
  onPress: () => void;
  fill: string;
  ink: string;
  still: boolean;
}) {
  const styles = stylesFor(useThemeColors().palette);
  const drop = useRef(new Animated.Value(still ? 1 : 0)).current;
  useEffect(() => {
    if (still) {
      drop.setValue(1);
      return;
    }
    const animation = Animated.timing(drop, {
      toValue: 1,
      duration: postTiles.widenMs,
      delay: postTiles.arrowDelayMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    animation.start();
    return () => animation.stop();
  }, [drop, still]);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.arrowWrap,
        {
          opacity: drop,
          transform: [{ translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-DROPDOWN_SETTLE, 0] }) }],
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        hitSlop={{ top: spacing.xs, bottom: spacing.md + 1, left: spacing.md + 1, right: spacing.md + 1 }}
        style={[styles.arrow, { backgroundColor: fill }]}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Hide the questions' : 'Show the questions'}
        accessibilityState={{ expanded: open }}
      >
        <Ionicons name="chevron-down" size={postTiles.arrowGlyph} color={ink} />
      </Pressable>
    </Animated.View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    // Home's row: the room under the tiles keeps their shadow — and the chosen tile's arrow.
    row: { flexDirection: 'row', paddingBottom: spacing.lg },
    tilePressed: { opacity: 0.85 },
    // Home's tile box (components/ServiceTileRow.tsx `box`), laid out as a row so the check's slot
    // can open at its left; its width is its children's.
    box: {
      flexDirection: 'row',
      borderRadius: emeraldRadius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.card,
    },
    // The chosen rim, laid exactly over the box's own hairline.
    rim: {
      position: 'absolute',
      top: -1,
      left: -1,
      right: -1,
      bottom: -1,
      borderRadius: emeraldRadius.lg,
      borderWidth: 1,
    },
    content: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs + 2,
      paddingHorizontal: 2,
    },
    // Home's tile name: 12 / 600 in the ink, two lines at most.
    label: {
      fontSize: 12,
      lineHeight: 14,
      fontWeight: '600',
      textAlign: 'center',
      color: colors.text,
    },
    arrowWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: -postTiles.arrowDrop,
      alignItems: 'center',
    },
    arrow: {
      width: postTiles.arrow,
      height: postTiles.arrow,
      borderRadius: postTiles.arrow / 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
  })
);
