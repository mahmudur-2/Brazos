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
    <SafeAreaView
      style={styles.safe}
      edges={['top']}
    >
      {/* The map screen intentionally uses the app's fixed cream palette so
          iOS dark mode cannot expose dark gaps around the light map. */}
      <View style={styles.headerWrap}>
        <ScreenHeader
          title="Find Jobs Near You"
          titleSize={26}
          // Same Ionicons family and outline weight as the tab bar's own Map
          // pin, so the two read as the same icon set rather than two styles.
          titleIcon={
            <Ionicons name="location-outline" size={22} color={colors.primary} />
          }
          right={
            <Pressable
              // Cross-tab, same pattern JobDetailScreen already uses to reach
              // MyJobs from a different stack — reuses the existing complete
              // open-jobs list rather than duplicating it inside MapStack.
              onPress={() => {
                // Untyped cast for the same reason useJobOwnerActions' onEdit
                // is: this crosses from MapStackNavigation into a sibling
                // tab's stack, which the two-argument navigate overload can't
                // resolve cleanly.
                const parentNavigate = navigation.getParent()?.navigate as
                  | ((name: string, params?: object) => void)
                  | undefined;
                parentNavigate?.('Home', { screen: 'BrowseJobs' });
              }}
              hitSlop={10}
            >
              <Text style={styles.seeAll}>See All Jobs</Text>
            </Pressable>
          }
        />
      </View>

      {error ? (
        <Text
          style={[
            styles.error,
            { color: colors.danger, backgroundColor: colors.dangerBg },
          ]}
        >
          {error}
        </Text>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.legend, { borderBottomColor: colors.border }]}
        contentContainerStyle={styles.legendContent}
      >
        {HOTSPOT_TIERS.map((t) => (
          <View key={t.key} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: t.stroke }]} />
            <Text style={[styles.legendLabel, { color: colors.textMuted }]}>
              {t.label}
            </Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.mapWrap}>
        <HotspotMap cells={cells} loading={loading} onSelectCell={setSelected} />
      </View>

      {selected && (
        <View style={styles.sheet}>
          {/* Keep the hotspot detail card consistent with the light map UI. */}
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
                <Text style={[styles.sheetTitle, { color: colors.text }]}>
                  {selected.job_count} open {selected.job_count === 1 ? 'job' : 'jobs'}
                </Text>
              </View>
              <Pressable onPress={() => setSelected(null)} hitSlop={8}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            <Text style={[styles.sheetCategories, { color: colors.textMuted }]}>
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
  headerWrap: {
    backgroundColor: colors.background,
  },
  seeAll: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  legend: {
    flexGrow: 0,
    borderBottomWidth: 1,
    // No explicit background before this — it inherited the SafeAreaView's
    // palette.background, which goes near-black in dark mode. That left a
    // black strip between the (already hardcoded-white) header above it and
    // the map below, since nothing here was opaque. Same fix as the header:
    // fixed light, not palette-driven, matching the rest of the app for now.
    backgroundColor: colors.background,
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
  },
  mapWrap: {
    flex: 1,
    backgroundColor: colors.background,
    overflow: 'hidden',
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
  },
  sheetCategories: {
    fontSize: 14,
    marginTop: spacing.sm,
  },
  sheetBtn: {
    marginTop: spacing.lg,
  },
  error: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
  },
});
