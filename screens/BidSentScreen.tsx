import { StyleSheet, Text, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { SuccessScreen } from '../ui/templates/SuccessScreen';
import { formatBudget } from '../lib/jobs';
import { goBackOrHome, navigateAcrossTabs } from '../lib/navigationRef';
import type { BidSentRouteParamList } from '../lib/navigation';
import { radius, spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

/**
 * Screen 53 — Bid Sent (worker), on the SuccessScreen template.
 *
 * The copy stays inside what is actually true: the bid is with the customer,
 * who decides; it can be withdrawn while pending; it lapses on its own after
 * 7 days. No match odds, no "you're likely to win", no invented urgency.
 */
export function BidSentScreen() {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const { params } = useRoute<RouteProp<BidSentRouteParamList, 'BidSent'>>();

  return (
    <SuccessScreen
      title="Bid sent"
      icon="paper-plane"
      body="The customer can now compare your bid with others and open your profile from it. You’ll hear the moment they respond."
      details={
        <View style={styles.receipt}>
          <Text style={styles.receiptLabel} numberOfLines={2}>
            {params.jobTitle}
          </Text>
          <Text style={styles.receiptAmount}>{formatBudget(params.amountCents)}</Text>
          <Text style={styles.receiptNote}>
            You can withdraw this bid from the job screen any time before it’s
            accepted. If the customer doesn’t respond within 7 days it expires
            on its own.
          </Text>
        </View>
      }
      actions={[
        {
          label: 'View in My Jobs',
          // Through the guarded helper, not a hand-cast getParent() hop —
          // MyJobs is a shared tab, but the helper is the one dispatch path.
          onPress: () => navigateAcrossTabs('MyJobs'),
        },
        {
          label: 'Keep browsing',
          variant: 'secondary',
          // The form replaced itself with this screen, so one pop lands back
          // on the job detail — not on a re-submittable bid form. Guarded:
          // if this screen IS the stack root (cross-tab landing), back goes
          // to the mounted mode's Home instead of dispatching into nothing.
          onPress: goBackOrHome,
        },
      ]}
    />
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  receipt: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  receiptLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textMuted,
  },
  receiptAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
  },
  receiptNote: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  }),
);
