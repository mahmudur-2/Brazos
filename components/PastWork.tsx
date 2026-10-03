import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { RemoteImage } from './RemoteImage';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { Card } from './Card';
import { PhotoViewer } from './PhotoViewer';
import { ReportDialog } from './ReportDialog';
import { useAuth } from '../hooks/useAuth';
import { modalSettleDelay } from '../lib/modalPresence';
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
import {
  radius,
  selectedInDark,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';

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
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [stats, setStats] = useState<CategoryStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>(ALL);
  const [viewerItem, setViewerItem] = useState<PortfolioItem | null>(null);
  const viewerUri = viewerItem?.photo_url ?? null;
  // FIX-RUN B3 (Apple 1.2): a visitor can report a portfolio photo from the
  // viewer. The viewer closes first; the dialog opens once it has settled.
  const { user } = useAuth();
  const canReport = !editable && !!user && user.id !== workerId;
  const [pendingReport, setPendingReport] = useState<PortfolioItem | null>(null);
  const [reportItem, setReportItem] = useState<PortfolioItem | null>(null);
  useEffect(() => {
    if (!pendingReport || viewerItem) return;
    const timer = setTimeout(() => {
      setReportItem(pendingReport);
      setPendingReport(null);
    }, modalSettleDelay());
    return () => clearTimeout(timer);
  }, [pendingReport, viewerItem]);

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
          <Button
            title={items.length > 0 ? 'Manage' : 'Add photos'}
            variant="secondary"
            size="sm"
            icon="images-outline"
            onPress={onManage}
          />
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
            // ONE past-work empty state. The hub drew a bare centred block
            // while the details page drew masters 42/45's dashed block, with
            // the same sentence written two different ways — so the account
            // holder met two empty states for one fact. This is the masters'
            // block, and the editable sentence is now the single string the
            // details page also renders.
            <View style={styles.empty}>
              <Ionicons name="images-outline" size={26} color={colors.textSubtle} />
              <Text style={styles.emptyText}>
                {editable
                  ? 'Feature photos from jobs you’ve finished to show customers your work.'
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
                    <Pressable onPress={() => setViewerItem(item)}>
                      <RemoteImage uri={item.photo_url} style={styles.photo} />
                    </Pressable>

                    {editable && (
                      <Pressable
                        style={styles.removeBtn}
                        onPress={() => handleRemove(item)}
                        // M-34 — 24 + 10 + 10 = the 44pt floor.
                        hitSlop={10}
                        accessibilityRole="button"
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
        onClose={() => setViewerItem(null)}
        onReport={canReport && viewerItem ? () => setPendingReport(viewerItem) : undefined}
      />
      {canReport && user && reportItem ? (
        <ReportDialog
          visible
          reporterId={user.id}
          reportedId={workerId}
          reportedName="this worker"
          jobId={reportItem.source_job_id ?? null}
          subject={{ kind: 'portfolio_item', id: reportItem.id }}
          onClose={() => setReportItem(null)}
        />
      ) : null}
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
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tab, active && (isDark ? styles.tabActiveDark : styles.tabActive)]}
    >
      <Text
        style={[styles.tabText, active && (isDark ? styles.tabTextActiveDark : styles.tabTextActive)]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
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
  // Masters 42 and 45's dashed empty block, byte-for-byte the shape
  // ProfileDetailsScreen's `dashed` already draws.
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  emptyText: {
    flex: 1,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
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
    // The ring's WEIGHT is on the shared style, not on the selected variants:
    // those two are ALTERNATIVES, so a weight held by one of them is a weight
    // the other theme never draws. An unselected tab rings in its own fill and
    // so reads exactly as it did.
    borderWidth: 1,
    borderColor: colors.neutralBg,
    backgroundColor: colors.neutralBg,
  },
  tabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.border,
  },
  // emerald D6: in dark the chosen tab is a gold outline over the bare ground,
  // not a filled pill — one selection treatment app-wide. Light keeps the
  // Heritage filled pill.
  tabActiveDark: {
    backgroundColor: selectedInDark(colors).fill,
    borderColor: selectedInDark(colors).line,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.onPrimary,
  },
  tabTextActiveDark: {
    color: selectedInDark(colors).line,
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
    gap: spacing.xs,
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
    color: colors.eyebrow,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: spacing.xs,
  },
  tileCaption: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 17,
  },
  }),
);
