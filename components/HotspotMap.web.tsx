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
import { useThemeColors } from '../hooks/useThemeColors';
import { JOB_CATEGORY_LABELS } from '../lib/jobs';
import {
  summarizeCategories,
  tierForCount,
  type HotspotMapProps,
} from '../lib/hotspots';
import { radius, spacing } from '../lib/theme';

/**
 * Web fallback for the hotspot map — react-native-maps has no web support, so
 * the browser gets the same tier colors and counts as a scrollable list of
 * zone cards. Metro resolves this file automatically on the web target.
 */
export function HotspotMap({ cells, loading, onSelectCell }: HotspotMapProps) {
  const { palette } = useThemeColors();

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: palette.background }]}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  if (cells.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: palette.background }]}>
        <View style={[styles.emptyIcon, { backgroundColor: palette.primarySoft }]}>
          <Ionicons name="map-outline" size={32} color={palette.primary} />
        </View>
        <Text style={[styles.emptyTitle, { color: palette.text }]}>No hotspots yet</Text>
        <Text style={[styles.emptyText, { color: palette.textMuted }]}>
          Hotspots appear here as more jobs are posted nearby.
        </Text>
      </View>
    );
  }

  const sorted = [...cells].sort((a, b) => b.job_count - a.job_count);

  return (
    <ScrollView
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.webNote}>
        <Ionicons name="information-circle-outline" size={16} color={palette.textMuted} />
        <Text style={[styles.webNoteText, { color: palette.textMuted }]}>
          The interactive map runs on the phone (Expo Go). Here are the active
          zones.
        </Text>
      </View>

      {sorted.map((cell) => {
        const tier = tierForCount(cell.job_count);
        return (
          <Card
            key={`${cell.ilat}:${cell.ilng}`}
            onPress={() => onSelectCell(cell)}
            palette={palette}
          >
            <View style={styles.row}>
              <View
                style={[styles.swatch, { backgroundColor: tier?.stroke ?? palette.border }]}
              />
              <View style={styles.rowText}>
                <Text style={[styles.count, { color: palette.text }]}>
                  {cell.job_count} open jobs
                </Text>
                <Text
                  style={[styles.categories, { color: palette.textMuted }]}
                  numberOfLines={1}
                >
                  {summarizeCategories(cell.categories, JOB_CATEGORY_LABELS)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.textSubtle} />
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
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 14,
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
  },
  categories: {
    fontSize: 13,
  },
});
