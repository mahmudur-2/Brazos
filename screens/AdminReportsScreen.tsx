import { useCallback, useRef, useState } from 'react';
import {
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
  reportSubject,
  unbanUser,
  type AdminReport,
} from '../lib/moderation';
import { spacing, textScale, themedStyles, useThemeColors, type ColorPalette,
  screenGround,
} from '../lib/theme';
import { EmptyState, useScrollClearance } from '../ui/primitives';
import { formatTimeAgo } from '../lib/time';
import { SPINNER_STATE, ScreenStateView } from '../ui/templates/ScreenStates';

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
      // T1 (production-36h): each clause as ban_user does it (the access lane, 400200 ban_switch). A
      // suspended account stays signed in and sees the suspended screen (App.tsx AccountGate).
      message:
        'This suspends their account. They can no longer post, bid or message. ' +
        'Their unfinished jobs are cancelled, and their phone number cannot be used for a new account.',
      confirmText: 'Ban',
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
        <ScreenStateView state={SPINNER_STATE} />
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
            const subject = reportSubject(item);
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

                {/* T2: the reported review or message, as the server sent it (200 characters at most). */}
                {subject ? (
                  <>
                    <Text style={styles.job} numberOfLines={1}>
                      {subject.label}
                    </Text>
                    <Card level="well" style={styles.quote}>
                      <Text style={styles.description}>“{subject.text}”</Text>
                    </Card>
                  </>
                ) : null}

                {/* The reporter's own words sit in a well: a quote inside the lit card. */}
                {item.description ? (
                  <Card level="well" style={styles.quote}>
                    <Text style={styles.description}>“{item.description}”</Text>
                  </Card>
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
                      title="Unban User"
                      variant="secondary"
                      onPress={() => handleUnban(item)}
                      loading={busy}
                      style={styles.action}
                    />
                  ) : (
                    <Button
                      title="Ban User"
                      // F1: a button that removes someone is red.
                      variant="destructive"
                      onPress={() => handleBan(item)}
                      loading={busy}
                      style={styles.action}
                    />
                  )}
                  {isOpen && (
                    <Button
                      title="Dismiss"
                      variant="secondary"
                      onPress={() => handleDismiss(item)}
                      disabled={busy}
                      style={styles.action}
                    />
                  )}
                </View>
              </Card>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="shield-checkmark-outline"
              title="Nothing to Review"
              body="New reports from users will show up here."
            />
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
  listContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  reported: {
    flex: 1,
    ...textScale.headline,
    color: colors.text,
  },
  meta: {
    ...textScale.label,
    fontWeight: '400',
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  job: {
    ...textScale.label,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  quote: {
    marginTop: spacing.md,
    padding: spacing.md,
  },
  description: {
    ...textScale.body,
    color: colors.text,
    fontStyle: 'italic',
  },
  bannedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  bannedText: {
    ...textScale.footnote,
    fontWeight: '700',
    color: colors.danger,
  },
  // The two decisions side by side, each half the card.
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  action: {
    flex: 1,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    ...textScale.body,
  },
  }),
);
