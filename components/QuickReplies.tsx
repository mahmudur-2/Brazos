import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { chatTemplatesForMode } from '../lib/messages';
import { useMode } from '../modes';
import { radius, spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

// No gradient library in this project (expo-linear-gradient isn't
// installed, and adding a native module tonight would need a rebuild) — a
// handful of stacked, increasingly-opaque strips approximates the same fade
// with plain Views. Opacity climbs left-to-right so the row's own surface
// color visually swallows the trailing chip instead of hard-cutting it.
const FADE_WIDTH = 28;
const FADE_STEPS = 6;

type QuickRepliesProps = {
  onSelect: (template: string) => void;
  disabled?: boolean;
};

/**
 * One-tap canned replies above the composer.
 *
 * Extracted from ChatScreen so this row can be rendered and inspected on its
 * own — it kept getting vertically clipped when the keyboard opened, and
 * reproducing that needs the row in a deliberately height-starved container.
 *
 * The height is fixed rather than negotiated. As a flex child in the
 * composer column, an intrinsically-sized row is at the mercy of whatever
 * space is left once the keyboard takes its share; pinning the height (and
 * refusing to shrink) makes the row's size independent of that entirely.
 */
export function QuickReplies({ onSelect, disabled = false }: QuickRepliesProps) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  // Mode decides the set (Phase 7): the same chat thread offers "On my way"
  // to the worker side and "Any update?" to the customer side. Perspective
  // comes from ModeContext, never a hand-passed prop (repo rule).
  const { mode } = useMode();
  const templates = chatTemplatesForMode(mode);

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.row}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {templates.map((template) => (
          <Pressable
            key={template}
            style={styles.chip}
            onPress={() => onSelect(template)}
            disabled={disabled}
          >
            <Text style={styles.chipText}>{template}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Hints that the row scrolls — without it the last chip just looks
          cut off at the screen edge with nothing signaling more is there. */}
      <View style={styles.fade} pointerEvents="none">
        {Array.from({ length: FADE_STEPS }).map((_, i) => (
          <View key={i} style={[styles.fadeStrip, { opacity: (i + 1) / FADE_STEPS }]} />
        ))}
      </View>
    </View>
  );
}

/** Chip box height: text line + vertical padding + both borders. */
const CHIP_TEXT_LINE = 18;
const CHIP_PAD_V = 7;
const CHIP_HEIGHT = CHIP_TEXT_LINE + CHIP_PAD_V * 2 + 2;
/** Row height: the chip plus even breathing room above and below. */
const QUICK_REPLIES_HEIGHT = CHIP_HEIGHT + spacing.sm * 2;

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  wrap: {
    height: QUICK_REPLIES_HEIGHT,
    // Both are required. flexGrow:0 stops it expanding into spare space;
    // flexShrink:0 stops the keyboard's arrival compressing it, which is what
    // sliced the chips in half.
    flexGrow: 0,
    flexShrink: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    position: 'relative',
  },
  row: {
    flex: 1,
  },
  fade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: FADE_WIDTH,
    flexDirection: 'row',
  },
  fadeStrip: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    paddingHorizontal: spacing.lg,
    // Centred within the fixed height instead of padded into it, so the chips
    // stay optically centred even if the text metric shifts by a pixel.
    alignItems: 'center',
    gap: spacing.sm,
  },
  chip: {
    height: CHIP_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  chipText: {
    fontSize: 13,
    lineHeight: CHIP_TEXT_LINE,
    fontWeight: '600',
    color: colors.primary,
  },
  }),
);
