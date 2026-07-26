import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { CHAT_TEMPLATES } from '../lib/messages';
import { colors, radius, spacing } from '../lib/theme';

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
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.row}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {CHAT_TEMPLATES.map((template) => (
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
  );
}

/** Chip box height: text line + vertical padding + both borders. */
const CHIP_TEXT_LINE = 18;
const CHIP_PAD_V = 7;
const CHIP_HEIGHT = CHIP_TEXT_LINE + CHIP_PAD_V * 2 + 2;
/** Row height: the chip plus even breathing room above and below. */
export const QUICK_REPLIES_HEIGHT = CHIP_HEIGHT + spacing.sm * 2;

const styles = StyleSheet.create({
  row: {
    height: QUICK_REPLIES_HEIGHT,
    // Both are required. flexGrow:0 stops it expanding into spare space;
    // flexShrink:0 stops the keyboard's arrival compressing it, which is what
    // sliced the chips in half.
    flexGrow: 0,
    flexShrink: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
});
