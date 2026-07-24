import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { JOB_CATEGORY_LABELS } from '../lib/jobs';
import {
  summarizeCategories,
  tierForCount,
  type HotspotMapProps,
} from '../lib/hotspots';
import { colors, radius, spacing } from '../lib/theme';

/**
 * Web fallback for the hotspot map — react-native-maps has no web support, so
 * the browser gets the same tier colors and counts as a scrollable list of
 * zone cards. Metro resolves this file automatically on the web target.
 */
export function HotspotMap({ cells, loading, onSelectCell }: HotspotMapProps) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (cells.length === 0) {
    return (
      <View style={styles.center}>
        <View style={styles.emptyIcon}>
          <Ionicons name="map-outline" size={32} color={colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>No hotspots yet</Text>
        <Text style={styles.emptyText}>
          Hotspots appear here as more jobs are posted nearby.
        </Text>
      </View>
    );
  }

  const sorted = [...cells].sort((a, b) => b.job_count - a.job_count);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.webNote}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
        <Text style={styles.webNoteText}>
          The interactive map runs on the phone (Expo Go). Here are the active
          zones.
        </Text>
      </View>

      {sorted.map((cell) => {
        const tier = tierForCount(cell.job_count);
        return (
          <Card key={`${cell.ilat}:${cell.ilng}`} onPress={() => onSelectCell(cell)}>
            <View style={styles.row}>
              <View style={[styles.swatch, { backgroundColor: tier?.stroke ?? colors.border }]} />
              <View style={styles.rowText}>
                <Text style={styles.count}>{cell.job_count} open jobs</Text>
                <Text style={styles.categories} numberOfLines={1}>
                  {summarizeCategories(cell.categories, JOB_CATEGORY_LABELS)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  webNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.xs,
  },
  webNoteText: {
    flex: 1,
    fontSize: 12,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  swatch: {
    width: 16,
    height: 16,
    borderRadius: radius.pill,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  count: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  categories: {
    fontSize: 13,
    color: colors.textMuted,
  },
});
