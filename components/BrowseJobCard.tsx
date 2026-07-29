import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { colors, radius, spacing } from '../lib/theme';
import {
  categoryAccent,
  formatBudget,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  type OpenJob,
} from '../lib/jobs';
import { formatTimeAgo } from '../lib/time';

export function BrowseJobCard({ job, onPress }: { job: OpenJob; onPress: () => void }) {
  const accent = categoryAccent(job.category);

  return (
    <Card onPress={onPress}>
      <View style={styles.headerRow}>
        <View style={[styles.iconCircle, { backgroundColor: accent.bg }]}>
          <Ionicons
            name={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
            size={20}
            color={accent.icon}
          />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {job.title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {JOB_CATEGORY_LABELS[job.category] ?? job.category}
            {job.location ? ` · ${job.location}` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.budget}>
          {job.budget_cents != null ? formatBudget(job.budget_cents) : 'Open budget'}
        </Text>
        <Text style={styles.time}>{formatTimeAgo(job.created_at)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    // backgroundColor set per-category inline — see JOB_CATEGORY_COLORS.
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  meta: {
    fontSize: 13,
    color: colors.textMuted,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  budget: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  time: {
    fontSize: 13,
    color: colors.textMuted,
  },
});
