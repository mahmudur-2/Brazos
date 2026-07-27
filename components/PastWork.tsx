import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { PhotoViewer } from './PhotoViewer';
import { JOB_CATEGORY_LABELS } from '../lib/jobs';
import {
  categoriesInPortfolio,
  fetchPortfolio,
  fetchWorkerJobStats,
  formatCategoryStats,
  removePortfolioItem,
  type CategoryStat,
  type PortfolioItem,
} from '../lib/portfolio';
import { confirmAsync } from '../lib/dialog';
import { colors, radius, spacing } from '../lib/theme';

type PastWorkProps = {
  workerId: string;
  /** True on the worker's own profile — adds the manage/remove affordances. */
  editable?: boolean;
  /** Opens the curation sheet. Only meaningful when editable. */
  onManage?: () => void;
  /** Bumped by the parent after a change, to force a refetch. */
  refreshToken?: number;
};

const ALL = '__all__';

/**
 * "Past Work" — a worker's completed-job stats plus their curated photo
 * gallery. Read-only for visitors, with add/remove affordances on the
 * worker's own profile.
 *
 * Both data sources are readable by anyone: portfolio_items has a permissive
 * SELECT policy, and the stats come from the worker_job_stats() RPC because
 * `jobs` RLS would otherwise hide another user's completed jobs (phase17).
 */
export function PastWork({
  workerId,
  editable = false,
  onManage,
  refreshToken = 0,
}: PastWorkProps) {
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [stats, setStats] = useState<CategoryStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>(ALL);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [portfolio, jobStats] = await Promise.all([
      fetchPortfolio(workerId),
      fetchWorkerJobStats(workerId),
    ]);
    setItems(portfolio.data);
    setStats(jobStats.data);
    setLoading(false);
  }, [workerId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load, refreshToken]);

  const categories = useMemo(() => categoriesInPortfolio(items), [items]);
  const visible = useMemo(
    () => (filter === ALL ? items : items.filter((i) => i.category === filter)),
    [items, filter]
  );

  // A filter tab for a category that's no longer represented would show an
  // empty gallery with no way back, so fall back to All.
  useEffect(() => {
    if (filter !== ALL && !categories.includes(filter)) setFilter(ALL);
  }, [categories, filter]);

  async function handleRemove(item: PortfolioItem) {
    const ok = await confirmAsync({
      title: 'Remove from portfolio?',
      message: 'This only removes it from your profile — the job photo itself is kept.',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;
    await removePortfolioItem(item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  const statLine = formatCategoryStats(stats, JOB_CATEGORY_LABELS);

  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.title}>Past Work</Text>
        {editable && onManage && (
          <Pressable onPress={onManage} hitSlop={8}>
            <Text style={styles.manageLink}>
              {items.length > 0 ? 'Manage' : 'Add photos'}
            </Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : (
        <>
          {statLine ? (
            <Text style={styles.stats}>{statLine}</Text>
          ) : (
            <Text style={styles.statsEmpty}>No completed jobs yet.</Text>
          )}

          {items.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="images-outline" size={26} color={colors.textSubtle} />
              <Text style={styles.emptyText}>
                {editable
                  ? 'Feature photos from jobs you’ve finished to show clients your work.'
                  : 'This worker hasn’t featured any photos yet.'}
              </Text>
            </View>
          ) : (
            <>
              {categories.length > 1 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tabs}
                  style={styles.tabsScroll}
                >
                  <FilterTab
                    label="All"
                    active={filter === ALL}
                    onPress={() => setFilter(ALL)}
                  />
                  {categories.map((c) => (
                    <FilterTab
                      key={c}
                      label={(JOB_CATEGORY_LABELS as Record<string, string>)[c] ?? c}
                      active={filter === c}
                      onPress={() => setFilter(c)}
                    />
                  ))}
                </ScrollView>
              )}

              {/* Deliberately a horizontal rail rather than a dense grid —
                  each piece of work gets room for its caption. */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.gallery}
                style={styles.galleryScroll}
              >
                {visible.map((item) => (
                  <View key={item.id} style={styles.tile}>
                    <Pressable onPress={() => setViewerUri(item.photo_url)}>
                      <Image source={{ uri: item.photo_url }} style={styles.photo} />
                    </Pressable>

                    {editable && (
                      <Pressable
                        style={styles.removeBtn}
                        onPress={() => handleRemove(item)}
                        hitSlop={6}
                        accessibilityLabel="Remove from portfolio"
                      >
                        <Ionicons name="close" size={14} color={colors.onPrimary} />
                      </Pressable>
                    )}

                    <Text style={styles.tileCategory}>
                      {(JOB_CATEGORY_LABELS as Record<string, string>)[item.category] ??
                        item.category}
                    </Text>
                    {item.caption ? (
                      <Text style={styles.tileCaption} numberOfLines={2}>
                        {item.caption}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            </>
          )}
        </>
      )}

      <PhotoViewer
        visible={!!viewerUri}
        uri={viewerUri}
        onClose={() => setViewerUri(null)}
      />
    </Card>
  );
}

function FilterTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  manageLink: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  loader: {
    marginVertical: spacing.lg,
  },
  stats: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  statsEmpty: {
    fontSize: 14,
    color: colors.textSubtle,
    marginTop: spacing.xs,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textSubtle,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 18,
  },
  tabsScroll: {
    flexGrow: 0,
    marginTop: spacing.md,
  },
  tabs: {
    gap: spacing.sm,
  },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.neutralBg,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.onPrimary,
  },
  galleryScroll: {
    marginTop: spacing.md,
  },
  gallery: {
    gap: spacing.md,
    paddingRight: spacing.sm,
  },
  tile: {
    width: 168,
    gap: 4,
  },
  photo: {
    width: 168,
    height: 168,
    borderRadius: radius.md,
    backgroundColor: colors.neutralBg,
  },
  removeBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  tileCategory: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: spacing.xs,
  },
  tileCaption: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 17,
  },
});
