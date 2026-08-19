import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts, useThemeColors, withAlpha } from '../lib/theme';

/**
 * The serif "B" the golden masters place in a card's spare corner.
 *
 * Two drawings, both code and neither an asset (manifest Appendix A: "render
 * as serif Text, low-alpha gold"):
 *
 *   - `ghost` — the low-alpha watermark on masters 39, 40, 41, 43, 44, 45
 *     and 46. Decorative only, so it takes no touches and is hidden from
 *     assistive technology.
 *   - `shield` — the outlined shield with the mark inside it, used where a
 *     card is making a protection claim (master 10's payout card, master 17's
 *     payment card). Same rule: decoration beside copy that already says the
 *     thing in words.
 *
 * Dark-only by intent rather than by branch: `withAlpha(gold, …)` resolves
 * against whichever palette is live, so under light the mark sits on the
 * Heritage gold at the same strength and never becomes a second brand asset.
 */
export function BrazosMonogram({
  variant = 'ghost',
  size = 96,
  style,
}: {
  variant?: 'ghost' | 'shield';
  /** Height of the whole mark. The letter scales with it. */
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useThemeColors();
  const shield = variant === 'shield';
  // The shield outline swallows some of the box, so the letter inside it is
  // proportionally smaller than the bare watermark's.
  const letterSize = Math.round(size * (shield ? 0.42 : 0.92));

  return (
    <View
      style={[styles.root, { width: size, height: size }, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {shield ? (
        <Ionicons name="shield-outline" size={size} color={palette.gold} />
      ) : null}
      <Text
        style={[
          styles.letter,
          {
            fontSize: letterSize,
            lineHeight: Math.round(letterSize * 1.14),
            color: shield ? palette.gold : withAlpha(palette.gold, 0.16),
          },
          shield && styles.letterInShield,
        ]}
      >
        B
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontFamily: fonts.display,
    fontWeight: '700',
  },
  // Centred over the shield glyph rather than laid out beside it. Absolute
  // only INSIDE this bounded decorative box — no screen is positioned by it.
  letterInShield: {
    position: 'absolute',
  },
});
