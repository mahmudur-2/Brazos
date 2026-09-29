import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatBudget } from '../lib/jobs';
import { radius, spacing, themedStyles, useThemeColors, withAlpha, type ColorPalette } from '../lib/theme';

/**
 * 2026-09-28 (LUX-LIST-64 #63, audit M-14) — "SET UP PAYOUTS TO RECEIVE $X ›":
 * the one tap from an approved payment that is waiting on the worker's own
 * payout setup to Payouts (it was Profile → Earnings → a bottom button, three).
 * The caller shows it ONLY where payoutSetupNotice() (lib/payments.ts) says so —
 * the card path, a status that was read and is not enabled, a held stripe row
 * whose release was requested — so it never nags an enabled payee, never
 * appears on the sandbox path, and never guesses from an unread status. The
 * figure is the worker's take, through formatBudget. A line in the mark colour
 * (gold in dark, the deep green in light), never a gold fill.
 */
export function PayoutNudge({ cents, onPress }: { cents: number; onPress: () => void }) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const amount = formatBudget(cents);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Set up payouts to receive ${amount}`}
    >
      <Ionicons name="wallet-outline" size={18} color={colors.mark} />
      <Text style={styles.text} numberOfLines={1}>
        Set up payouts to receive <Text style={styles.money}>{amount}</Text>
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.mark} />
    </Pressable>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    row: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: withAlpha(colors.mark, 0.45),
    },
    pressed: { opacity: 0.7 },
    text: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: colors.ink,
    },
    money: {
      fontWeight: '700',
      color: colors.money,
    },
  })
);
