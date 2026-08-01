import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AvatarPressable } from '../components/AvatarPressable';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { BidWorkerCard } from '../components/BidWorkerCard';
import { JobOwnerActions } from '../components/JobOwnerActions';
import { PhotoViewer } from '../components/PhotoViewer';
import { ReviewSection } from '../components/ReviewSection';
import { ScreenHeader } from '../components/ScreenHeader';
import { SegmentedControl } from '../components/SegmentedControl';
import { StatusBadge } from '../components/StatusBadge';
import { VerificationBadge } from '../components/VerificationBadge';
import { useAuth } from '../hooks/useAuth';
import { useJobBids } from '../hooks/useJobBids';
import { fetchProfileById, type Profile } from '../lib/profiles';
import { alertAsync, confirmAsync } from '../lib/dialog';
import {
  acceptBid,
  bestValueBidId,
  BID_SORT_OPTIONS,
  sortBids,
  type BidSort,
  type BidWithWorker,
} from '../lib/bids';
import { jobStage } from '../lib/jobStage';
import {
  categoryAccent,
  completionPhotosOf,
  fetchRehirableWorkerIds,
  formatBidCount,
  formatBudget,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
} from '../lib/jobs';
import type { MyJobsStackNavigation, MyJobsStackParamList } from '../lib/navigation';
import { colors, radius, spacing } from '../lib/theme';

const USE_NATIVE_DRIVER = Platform.OS !== 'web';

export function ClientJobDetailScreen() {
  const navigation = useNavigation<MyJobsStackNavigation>();
  const { params } = useRoute<RouteProp<MyJobsStackParamList, 'ClientJobDetail'>>();
  const { job } = params;

  const { user } = useAuth();
  const { bids, loading, error, refresh } = useJobBids(job.id);
  const [sort, setSort] = useState<BidSort>('value');
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [acceptedName, setAcceptedName] = useState('');
  const [worker, setWorker] = useState<Profile | null>(null);
  const [rehirable, setRehirable] = useState<Set<string>>(new Set());
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  const successScale = useRef(new Animated.Value(0.4)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  const canAccept = job.status === 'open';
  const workerName = worker?.full_name ?? 'the worker';
  const accent = categoryAccent(job.category);
  // Always the poster's own view of their job, so isPoster is unconditionally
  // true here — this is the one screen that legitimately shows "In Progress".
  const stage = jobStage(job.status, bids.length, true);

  useEffect(() => {
    if (canAccept || !job.assigned_worker_id) return;
    let active = true;
    fetchProfileById(job.assigned_worker_id).then(({ data }) => {
      if (active) setWorker(data);
    });
    return () => {
      active = false;
    };
  }, [canAccept, job.assigned_worker_id]);
  // "Hire Again" is client-scoped by definition: only workers who have already
  // completed a job for *this* client. Workers never see this in reverse.
  useEffect(() => {
    if (!user) return;
    let active = true;
    fetchRehirableWorkerIds(user.id).then(({ data }) => {
      if (active) setRehirable(data);
    });
    return () => {
      active = false;
    };
  }, [user]);

  const sortedBids = useMemo(() => sortBids(bids, sort), [bids, sort]);
  const bestId = useMemo(() => bestValueBidId(bids), [bids]);

  function playSuccessThenLeave(name: string) {
    setAcceptedName(name);
    setShowSuccess(true);
    Animated.parallel([
      Animated.spring(successScale, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(successOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start();

    setTimeout(() => {
      navigation.navigate('MyJobsHub');
    }, 1400);
  }

  async function confirmAccept(bid: BidWithWorker) {
    if (!bid.worker || acceptingId) return;
    const name = bid.worker.full_name ?? 'this worker';
    const ok = await confirmAsync({
      title: 'Accept bid?',
      message: `Assign this job to ${name} for ${formatBudget(
        bid.amount_cents
      )}. This can't be undone here.`,
      confirmText: 'Accept',
      cancelText: 'Cancel',
    });
    if (ok) await doAccept(bid);
  }

  async function doAccept(bid: BidWithWorker) {
    if (!bid.worker) return;
    setAcceptingId(bid.id);
    const { error } = await acceptBid({
      jobId: job.id,
      bidId: bid.id,
    });
    setAcceptingId(null);

    if (error) {
      await alertAsync('Could not accept bid', error.message);
      await refresh();
      return;
    }

    playSuccessThenLeave(bid.worker.full_name ?? 'the worker');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="Job & Bids" onBack={() => navigation.goBack()} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <Card>
          <View style={styles.jobHeader}>
            <View style={[styles.iconCircle, { backgroundColor: accent.bg }]}>
              <Ionicons
                name={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
                size={22}
                color={accent.icon}
              />
            </View>
            <View style={styles.jobHeaderText}>
              <Text style={styles.jobTitle} numberOfLines={2}>
                {job.title}
              </Text>
              <Text style={styles.jobMeta}>
                {JOB_CATEGORY_LABELS[job.category] ?? job.category}
                {job.location ? ` · ${job.location}` : ''}
              </Text>
            </View>
            <StatusBadge status={stage.statusKey} label={stage.label} />
          </View>
          <View style={styles.jobFooter}>
            <Text style={styles.budget}>{formatBudget(job.budget_cents)}</Text>
            <Text style={styles.bidCount}>{formatBidCount(bids.length)}</Text>
          </View>

          <JobOwnerActions jobId={job.id} posterId={job.client_id} status={job.status} />
        </Card>

        {canAccept ? (
          loading ? (
            <ActivityIndicator
              size="large"
              color={colors.primary}
              style={styles.loader}
            />
          ) : bids.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="people-outline" size={32} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No bids yet</Text>
              <Text style={styles.emptyText}>
                When workers bid on this job, they’ll appear here ranked by value.
              </Text>
            </View>
          ) : (
            <>
              {bids.length > 1 && (
                <SegmentedControl
                  options={BID_SORT_OPTIONS}
                  value={sort}
                  onChange={setSort}
                />
              )}

              <View style={styles.bidList}>
                {sortedBids.map((bid) => (
                  <BidWorkerCard
                    key={bid.id}
                    bid={bid}
                    isBestValue={bid.id === bestId && bids.length > 1}
                    canAccept={canAccept}
                    accepting={acceptingId === bid.id}
                    disabled={acceptingId !== null && acceptingId !== bid.id}
                    onAccept={() => confirmAccept(bid)}
                    onViewProfile={
                      bid.worker
                        ? () =>
                            navigation.navigate('WorkerProfile', {
                              workerId: bid.worker!.id,
                              workerName: bid.worker!.full_name ?? undefined,
                            })
                        : undefined
                    }
                    onLongPressAvatar={
                      bid.worker?.avatar_url
                        ? () => setAvatarUri(bid.worker!.avatar_url)
                        : undefined
                    }
                    canRehire={!!bid.worker && rehirable.has(bid.worker.id)}
                    onHireAgain={
                      bid.worker
                        ? () =>
                            navigation.navigate('PostJob', {
                              hireWorkerId: bid.worker!.id,
                              hireWorkerName: bid.worker!.full_name ?? 'this worker',
                            })
                        : undefined
                    }
                  />
                ))}
              </View>
            </>
          )
        ) : (
          <>
            <Card>
              <Text style={styles.sectionTitle}>Assigned worker</Text>
              <Pressable
                style={styles.workerRow}
                onPress={() =>
                  job.assigned_worker_id &&
                  navigation.navigate('WorkerProfile', {
                    workerId: job.assigned_worker_id,
                    workerName: worker?.full_name ?? undefined,
                  })
                }
                disabled={!job.assigned_worker_id}
              >
                <AvatarPressable
                  name={worker?.full_name}
                  uri={worker?.avatar_url}
                  size={44}
                  onLongPress={
                    worker?.avatar_url ? () => setAvatarUri(worker?.avatar_url ?? null) : undefined
                  }
                />
                <View style={styles.workerText}>
                  <View style={styles.workerNameRow}>
                    <Text style={styles.workerName} numberOfLines={1}>
                      {worker?.full_name ?? 'Worker'}
                    </Text>
                    <VerificationBadge status={worker?.verification_status} />
                  </View>
                  <Text style={styles.workerMeta}>
                    {formatBudget(job.final_amount_cents ?? job.budget_cents)} agreed
                  </Text>
                </View>
                {job.assigned_worker_id && (
                  <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
                )}
              </Pressable>
            </Card>

            {job.assigned_worker_id && (
              <Button
                title={`Message ${workerName}`}
                variant="secondary"
                onPress={() =>
                  navigation.navigate('Chat', { jobId: job.id })
                }
              />
            )}

            {/* Before/after: the client's own posting photos next to what the
                worker submitted on completion. Rendered as soon as the worker
                marks the job done, so the client reviews the finished work
                here rather than having to ask for it. */}
            {(job.photos?.length > 0 || completionPhotosOf(job).length > 0) && (
              <Card>
                {job.photos?.length > 0 && (
                  <View style={styles.photoGroup}>
                    <Text style={styles.photoGroupLabel}>Before · your photos</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.photoRow}
                    >
                      {job.photos.map((url) => (
                        <Pressable key={url} onPress={() => setViewerUri(url)}>
                          <Image source={{ uri: url }} style={styles.beforeAfterPhoto} />
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {completionPhotosOf(job).length > 0 && (
                  <View style={styles.photoGroup}>
                    <Text style={styles.photoGroupLabel}>After · finished work</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.photoRow}
                    >
                      {completionPhotosOf(job).map((url) => (
                        <Pressable key={url} onPress={() => setViewerUri(url)}>
                          <Image source={{ uri: url }} style={styles.beforeAfterPhoto} />
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </Card>
            )}

            {job.status === 'completed' ? (
              user && job.assigned_worker_id ? (
                <ReviewSection
                  jobId={job.id}
                  reviewerId={user.id}
                  revieweeId={job.assigned_worker_id}
                  revieweeName={workerName}
                  prompt={`How was ${workerName}’s work?`}
                />
              ) : null
            ) : (
              <Card style={styles.noticeCard}>
                <Ionicons name="time-outline" size={20} color={colors.textMuted} />
                <Text style={styles.noticeText}>
                  Waiting for the worker to finish. You can leave a review once the
                  job is completed.
                </Text>
              </Card>
            )}
          </>
        )}
        </ScrollView>
      </KeyboardAvoidingView>

      {showSuccess && (
        <Animated.View style={[styles.successOverlay, { opacity: successOpacity }]}>
          <Animated.View
            style={[styles.successCircle, { transform: [{ scale: successScale }] }]}
          >
            <Ionicons name="checkmark" size={56} color={colors.onPrimary} />
          </Animated.View>
          <Text style={styles.successTitle}>Bid accepted</Text>
          <Text style={styles.successSubtitle}>
            {acceptedName} is assigned to this job.
          </Text>
        </Animated.View>
      )}

      <PhotoViewer
        visible={!!viewerUri}
        uri={viewerUri}
        onClose={() => setViewerUri(null)}
      />

      <PhotoViewer
        visible={!!avatarUri}
        uri={avatarUri}
        onClose={() => setAvatarUri(null)}
        allowShare={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  jobHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    // backgroundColor set per-category inline — see JOB_CATEGORY_COLORS.
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobHeaderText: {
    flex: 1,
    gap: 2,
  },
  jobTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  jobMeta: {
    fontSize: 13,
    color: colors.textMuted,
  },
  jobFooter: {
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
  bidCount: {
    fontSize: 13,
    color: colors.textMuted,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  noticeText: {
    flex: 1,
    fontSize: 14,
    color: colors.textMuted,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  workerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  workerText: {
    flex: 1,
    gap: 2,
  },
  workerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  workerName: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  workerMeta: {
    fontSize: 13,
    color: colors.textMuted,
  },
  donePhoto: {
    width: '100%',
    height: 200,
    borderRadius: radius.md,
    backgroundColor: colors.border,
  },
  photoGroup: {
    gap: spacing.sm,
  },
  photoGroupLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.md,
  },
  photoRow: {
    gap: spacing.sm,
  },
  beforeAfterPhoto: {
    width: 150,
    height: 150,
    borderRadius: radius.md,
    backgroundColor: colors.neutralBg,
  },
  loader: {
    marginTop: spacing.xl,
  },
  bidList: {
    gap: spacing.md,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
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
    maxWidth: 300,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
  },
  successOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(244,241,232,0.97)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  successCircle: {
    width: 104,
    height: 104,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  successSubtitle: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
