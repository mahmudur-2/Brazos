import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../lib/theme';

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  // Job statuses
  open: { bg: colors.successBg, text: colors.success },
  assigned: { bg: colors.infoBg, text: colors.info },
  in_progress: { bg: colors.warningBg, text: colors.warning },
  completed: { bg: colors.neutralBg, text: colors.neutral },
  cancelled: { bg: colors.dangerBg, text: colors.danger },
  // Bid statuses
  pending: { bg: colors.warningBg, text: colors.warning },
  accepted: { bg: colors.successBg, text: colors.success },
  rejected: { bg: colors.dangerBg, text: colors.danger },
  withdrawn: { bg: colors.neutralBg, text: colors.neutral },
  // Report statuses (admin moderation queue). 'open' reuses the job status
  // above, which reads correctly here too.
  actioned: { bg: colors.dangerBg, text: colors.danger },
  dismissed: { bg: colors.neutralBg, text: colors.neutral },
};

const DEFAULT_STYLE = { bg: colors.neutralBg, text: colors.neutral };

function formatStatus(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? DEFAULT_STYLE;
  return (
    <View style={[styles.badge, { backgroundColor: style.bg }]}>
      <Text style={[styles.text, { color: style.text }]}>{formatStatus(status)}</Text>
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
