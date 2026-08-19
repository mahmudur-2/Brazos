import { StyleSheet, Text, View } from 'react-native';
import { formatBudget } from '../../lib/jobs';
import { spacing, type EmeraldPalette, type as typeScale } from '../tokens';
import { themedStyles, useThemeColors } from '../../lib/theme';
import type { PaymentStatus } from './StatusPill';

/**
 * Money, rendered with payment-state-accurate labelling (§I, §H.3).
 *
 * Two hard rules are enforced here rather than trusted to each caller:
 *
 * 1. Money is integer cents and is formatted only through `formatBudget()`
 *    (CLAUDE.md's invariant). This component takes cents and never a
 *    pre-formatted string, so a caller cannot route around that.
 * 2. "Paid" never appears before the payment reaches `released` (§H.3). The
 *    caption comes from a fixed map keyed by state — there is no prop that
 *    lets a screen pass its own wording, because that is exactly how a held
 *    balance ends up mislabelled as paid.
 *
 * Passing no `state` renders a plain amount with no payment claim at all,
 * which is the correct shape for a budget or a bid — neither is a payment.
 */

const CAPTIONS: Record<PaymentStatus, string> = {
  unfunded: 'Not funded',
  authorized: 'Payment authorized — not charged yet',
  held: 'Funds held in protection',
  released: 'Released to worker',
  paid_out: 'Paid out',
  failed: 'Payment failed',
  voided: 'Payment voided',
  refunded: 'Refunded',
  partially_refunded: 'Partially refunded',
};

/** States where the amount is real money that has actually moved or settled. */
const SETTLED: PaymentStatus[] = ['released', 'paid_out'];

type MoneyTextProps = {
  /** Integer cents. Never dollars — see CLAUDE.md's money invariant. */
  cents: number | null;
  /** Omit entirely when the number is not a payment (a budget, a bid amount). */
  state?: PaymentStatus;
  size?: 'md' | 'lg';
  /** Hides the caption while keeping the state-driven colour. For dense rows
   *  where the same caption is already shown once for the whole group. */
  captionHidden?: boolean;
};

export function MoneyText({ cents, state, size = 'md', captionHidden = false }: MoneyTextProps) {
  const { emerald: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // Prestige decision 6: money values are emerald in dark (EST. PAY, prices);
  // light keeps Heritage ink. Unsettled payment states stay muted in both —
  // the state machine's honesty outranks the accent.
  const amountColor =
    state && !SETTLED.includes(state) ? colors.muted : isDark ? colors.emerald : colors.ink;
  const caption = state ? CAPTIONS[state] : null;

  return (
    <View style={styles.wrap}>
      <Text
        style={[size === 'lg' ? styles.amountLg : styles.amount, { color: amountColor }]}
        // Amount and caption are one statement; announcing them separately
        // invites reading "$400" without "not charged yet".
        accessibilityRole="text"
      >
        {formatBudget(cents)}
      </Text>
      {caption && !captionHidden ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const stylesFor = themedStyles((colors: EmeraldPalette) =>
  StyleSheet.create({
  wrap: {
    gap: spacing.xs / 2,
  },
  amount: {
    ...typeScale.title,
  },
  amountLg: {
    ...typeScale.h2,
  },
  caption: {
    ...typeScale.sub,
    color: colors.muted,
  },
  }),
);
