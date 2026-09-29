import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenHeader } from '../components/ScreenHeader';
import { StatusBadge } from '../components/StatusBadge';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { goBackOrHome } from '../lib/navigationRef';
import {
  banUser,
  dismissReport,
  fetchAdminReports,
  reasonLabel,
  unbanUser,
  type AdminReport,
} from '../lib/moderation';
import { spacing, themedStyles, useThemeColors, type ColorPalette,
  screenGround,
} from '../lib/theme';
import { useScrollClearance } from '../ui/primitives';
import { formatTimeAgo } from '../lib/time';

export function AdminReportsScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // emerald(3): the floating pill's real footprint.
  const navClearance = useScrollClearance();
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  // useFocusEffect below re-fires load() on every focus, independently of
  // onRefresh's pull-to-refresh — with no guard, two overlapping calls could
  // resolve out of order and let a stale response overwrite a fresher one.
  // Each call stamps its own id here; a response only gets applied if it's
  // still the most recently STARTED call by the time it resolves.
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setError(null);
    const { data, error } = await fetchAdminReports();
    if (requestId !== requestIdRef.current) return;
    if (error) setError(userMessage(error));
    else setReports(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleBan(report: AdminReport) {
    const name = report.reported_name ?? 'this user';
    const ok = await confirmAsync({
      title: `Ban ${name}?`,
      message:
        'They will be signed out, blocked from posting, bidding and messaging, ' +
        'their active jobs will be cancelled, and their phone number will be ' +
        'blocked from re-registering.',
      confirmText: 'Ban',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;

    setActioningId(report.id);
    const { error } = await banUser(report.reported_id, report.id);
    setActioningId(null);

    if (error) {
      await alertAsync('Could not ban', userMessage(error));
      return;
    }
    await load();
  }

  async function handleUnban(report: AdminReport) {
    setActioningId(report.id);
    const { error } = await unbanUser(report.reported_id);
    setActioningId(null);
    if (error) {
      await alertAsync('Could not unban', userMessage(error));
      return;
    }
    await load();
  }

  async function handleDismiss(report: AdminReport) {
    setActioningId(report.id);
    const { error } = await dismissReport(report.id);
    setActioningId(null);
    if (error) {
      await alertAsync('Could not dismiss', userMessage(error));
      return;
    }
    await load();
  }

  return (
    <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={['top']}>
      <ScreenHeader
        title="Reports"
        subtitle="Moderation queue"
        onBack={goBackOrHome}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            reports.length === 0 ? styles.emptyContainer : styles.listContent,
            { paddingBottom: navClearance },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const busy = actioningId === item.id;
            const isOpen = item.status === 'open';
            return (
              <Card>
                <View style={styles.headerRow}>
                  <Text style={styles.reported} numberOfLines={1}>
                    {item.reported_name ?? 'Unknown user'}
                  </Text>
                  <StatusBadge status={item.status} />
                </View>

                <Text style={styles.meta}>
                  {reasonLabel(item.reason)} · reported by{' '}
                  {item.reporter_name ?? 'someone'} · {formatTimeAgo(item.created_at)}
                </Text>

                {item.job_title ? (
                  <Text style={styles.job} numberOfLines={1}>
                    Job: {item.job_title}
                  </Text>
                ) : null}

                {item.description ? (
                  <Text style={styles.description}>“{item.description}”</Text>
                ) : null}

                {item.reported_banned && (
                  <View style={styles.bannedRow}>
                    <Ionicons name="ban" size={14} color={colors.danger} />
                    <Text style={styles.bannedText}>This user is banned</Text>
                  </View>
                )}

                <View style={styles.actions}>
                  {item.reported_banned ? (
                    <Button
                      title="Unban user"
                      variant="secondary"
                      onPress={() => handleUnban(item)}
                      loading={busy}
                    />
                  ) : (
                    <Button
                      title="Ban user"
                      onPress={() => handleBan(item)}
                      loading={busy}
                    />
                  )}
                  {isOpen && (
                    <Button
                      title="Dismiss"
                      variant="secondary"
                      onPress={() => handleDismiss(item)}
                      disabled={busy}
                    />
                  )}
                </View>
              </Card>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={32}
                  color={colors.primary}
                />
              </View>
              <Text style={styles.emptyTitle}>Nothing to review</Text>
              <Text style={styles.emptyText}>
                New reports from users will show up here.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  emptyContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 300,
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
    lineHeight: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  reported: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  meta: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  job: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    marginTop: spacing.xs,
  },
  description: {
    fontSize: 14,
    color: colors.text,
    fontStyle: 'italic',
    lineHeight: 20,
    marginTop: spacing.md,
  },
  bannedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  bannedText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.danger,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
  },
  }),
);
