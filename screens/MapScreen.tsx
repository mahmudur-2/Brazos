import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { HotspotMap } from '../components/HotspotMap';
import { ScreenHeader } from '../components/ScreenHeader';
import { useHotspots } from '../hooks/useHotspots';
import { JOB_CATEGORY_LABELS } from '../lib/jobs';
import {
  HOTSPOT_TIERS,
  summarizeCategories,
  tierForCount,
  type HotspotCell,
} from '../lib/hotspots';
import type { MapStackNavigation } from '../lib/navigation';
import { colors, radius, shadows, spacing } from '../lib/theme';

export function MapScreen() {
  const navigation = useNavigation<MapStackNavigation>();
  const { cells, loading, error } = useHotspots();
  const [selected, setSelected] = useState<HotspotCell | null>(null);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Work Map" subtitle="Where the work is right now" />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.legend}
        contentContainerStyle={styles.legendContent}
      >
        {HOTSPOT_TIERS.map((t) => (
          <View key={t.key} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: t.stroke }]} />
            <Text style={styles.legendLabel}>{t.label}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.mapWrap}>
        <HotspotMap cells={cells} loading={loading} onSelectCell={setSelected} />
      </View>

      {selected && (
        <View style={styles.sheet}>
          <Card>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleWrap}>
                <View
                  style={[
                    styles.sheetDot,
                    {
                      backgroundColor:
                        tierForCount(selected.job_count)?.stroke ?? colors.border,
                    },
                  ]}
                />
                <Text style={styles.sheetTitle}>{selected.job_count} open jobs</Text>
              </View>
              <Pressable onPress={() => setSelected(null)} hitSlop={8}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            <Text style={styles.sheetCategories}>
              {summarizeCategories(selected.categories, JOB_CATEGORY_LABELS)}
            </Text>

            <Button
              title={`View ${selected.job_count} ${
                selected.job_count === 1 ? 'job' : 'jobs'
              }`}
              onPress={() => {
                navigation.navigate('CellJobs', {
                  ilat: selected.ilat,
                  ilng: selected.ilng,
                  count: selected.job_count,
                });
                setSelected(null);
              }}
              style={styles.sheetBtn}
            />
          </Card>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  legend: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  legendContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
  },
  legendLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  mapWrap: {
    flex: 1,
  },
  sheet: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    ...shadows.raised,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sheetDot: {
    width: 14,
    height: 14,
    borderRadius: radius.pill,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  sheetCategories: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  sheetBtn: {
    marginTop: spacing.lg,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
  },
});
