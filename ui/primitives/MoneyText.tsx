import { StyleSheet, Text, View } from 'react-native';
import { formatBudget } from '../../lib/jobs';
import { paymentCaption } from '../../lib/moneyCopy';
import { spacing, type EmeraldPalette, type as typeScale } from '../tokens';
import { themedStyles, useThemeColors } from '../../lib/theme';
import { useModePerspective } from '../../modes';
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
 *    caption comes from a fixed table keyed by state — there is no prop that
 *    lets a screen pass its own wording, because that is exactly how a held
 *    balance ends up mislabelled as paid.
 *
 * Passing no `state` renders a plain amount with no payment claim at all,
 * which is the correct shape for a budget or a bid — neither is a payment.
 *
 * C4 (2026-10-03): THE copy table is lib/moneyCopy.ts's paymentCaption(), by
 * state and viewer. The viewer is the mode from ModeContext (CLAUDE.md: never
 * a hand-passed prop), because the figure depends on it: the customer's
 * MoneyText carries their CHARGE, the worker's their TAKE. What a screen may
 * pass are FACTS the caption depends on — an approval already requested, an
 * open issue, payouts not set up, a tip, the other person's first name —
 * never words.
 */

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
  /** D23: release_requested_at is set on this held row. */
  releaseRequested?: boolean;
  /** An open issue report is holding this payment. */
  issueOpen?: boolean;
  /** #63: approved, and the worker's payout account is not set up yet. */
  waitingOnPayoutSetup?: boolean;
  /** The cancellation shape: a refund queued on this held row (lib/paymentRules.ts isRefundQueued). */
  refundQueued?: boolean;
  /** With refundQueued: a late cancellation kept a fee for the worker (isCancellationFeeKept). */
  feeKept?: boolean;
  /** This row is a tip. */
  tip?: boolean;
  /** The other person's first name, for "on its way to Sam". */
  counterpartFirstName?: string | null;
};

export function MoneyText({
  cents,
  state,
  size = 'md',
  captionHidden = false,
  releaseRequested,
  issueOpen,
  waitingOnPayoutSetup,
  refundQueued,
  feeKept,
  tip,
  counterpartFirstName,
}: MoneyTextProps) {
  const { emerald: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const perspective = useModePerspective();
  // 2026-09-28 (LUX-LIST-64 #40): money is WHITE — the `money` role, the Lux ink
  // in dark and the near-black ink in light; "gold for money" ends. Unsettled
  // payment states stay muted in both — the state machine's honesty outranks
  // the accent.
  const amountColor =
    state && !SETTLED.includes(state) ? colors.muted : colors.money;
  const caption = state
    ? paymentCaption(
        { status: state, releaseRequested, issueOpen, waitingOnPayoutSetup, refundQueued, feeKept, tip, counterpartFirstName },
        perspective
      )
    : null;

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
