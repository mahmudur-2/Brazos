import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../lib/theme';

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  // Job statuses
  open: { bg: colors.successBg, text: colors.success },
  assigned: { bg: colors.infoBg, text: colors.info },
  in_progress: { bg: colors.warningBg, text: colors.warning },
  // Completed and cancelled previously shared a near-identical low-contrast
  // tan pill (completed) next to a red one (cancelled) — visually backwards,
  // since red reads as "needs attention" for a job that's just over and
  // done with. Completed now gets the positive-outcome green; cancelled
  // moves to neutral gray, clearly different from completed at a glance
  // without borrowing the danger red used elsewhere for rejected/actioned.
  completed: { bg: colors.successBg, text: colors.success },
  cancelled: { bg: colors.neutralBg, text: colors.neutral },
  // Bid/offer statuses (offer_status vocabulary — phase50 made
  // declined/expired/superseded reachable states, so they get deliberate
  // colours instead of the default fallback)
  pending: { bg: colors.warningBg, text: colors.warning },
  accepted: { bg: colors.successBg, text: colors.success },
  rejected: { bg: colors.dangerBg, text: colors.danger },
  declined: { bg: colors.dangerBg, text: colors.danger },
  withdrawn: { bg: colors.neutralBg, text: colors.neutral },
  expired: { bg: colors.neutralBg, text: colors.neutral },
  superseded: { bg: colors.neutralBg, text: colors.neutral },
  // Report statuses (admin moderation queue). 'open' reuses the job status
  // above, which reads correctly here too.
  actioned: { bg: colors.dangerBg, text: colors.danger },
  dismissed: { bg: colors.neutralBg, text: colors.neutral },
};

const DEFAULT_STYLE = { bg: colors.neutralBg, text: colors.neutral };

function formatStatus(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

type StatusBadgeProps = {
  /** Drives the colour pair. */
  status: string;
  /**
   * Overrides the displayed text while keeping `status`'s colour — used by
   * the job detail screen's evolving stage badge, where the wording
   * ("Bids Pending (3)") differs from the underlying status key. See
   * lib/jobStage.ts.
   */
  label?: string;
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? DEFAULT_STYLE;
  return (
    <View style={[styles.badge, { backgroundColor: style.bg }]}>
      <Text style={[styles.text, { color: style.text }]}>
        {label ?? formatStatus(status)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
});
