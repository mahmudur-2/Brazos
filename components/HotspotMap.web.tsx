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
import { MapPinIcon } from './MapPinIcon';
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
 *
 * Hardcoded to the light palette, not useThemeColors() — same reasoning as
 * MapScreen/HotspotMap.native: the rest of the Map tab is fixed light, so a
 * theme-reactive fallback here would be the one thing on this tab that goes
 * dark on a dark-mode device.
 */
export function HotspotMap({ cells, loading, onSelectCell }: HotspotMapProps) {
  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <MapPinIcon size={80} />
        <ActivityIndicator
          size="small"
          color={colors.primary}
          style={styles.loadingSpinner}
        />
      </View>
    );
  }

  if (cells.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <MapPinIcon size={88} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>No hotspots yet</Text>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
          Hotspots appear here as more jobs are posted nearby.
        </Text>
      </View>
    );
  }

  const sorted = [...cells].sort((a, b) => b.job_count - a.job_count);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.webNote}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
        <Text style={[styles.webNoteText, { color: colors.textMuted }]}>
          The interactive map runs on the phone (Expo Go). Here are the active
          zones.
        </Text>
      </View>

      {sorted.map((cell) => {
        const tier = tierForCount(cell.job_count);
        return (
          <Card key={`${cell.ilat}:${cell.ilng}`} onPress={() => onSelectCell(cell)}>
            <View style={styles.row}>
              <View
                style={[styles.swatch, { backgroundColor: tier?.stroke ?? colors.border }]}
              />
              <View style={styles.rowText}>
                <Text style={[styles.count, { color: colors.text }]}>
                  {cell.job_count} open {cell.job_count === 1 ? 'job' : 'jobs'}
                </Text>
                <Text
                  style={[styles.categories, { color: colors.textMuted }]}
                  numberOfLines={1}
                >
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
  loadingSpinner: {
    marginTop: spacing.md,
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
