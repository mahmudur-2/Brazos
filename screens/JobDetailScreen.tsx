import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { BrowseJobCard } from '../components/BrowseJobCard';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { JobOwnerActions } from '../components/JobOwnerActions';
import { JobVideo } from '../components/JobVideo';
import { PhotoViewer } from '../components/PhotoViewer';
import { ScreenHeader } from '../components/ScreenHeader';
import { StatusBadge } from '../components/StatusBadge';
import { TextField } from '../components/TextField';
import { useAuth } from '../hooks/useAuth';
import { useBidCount } from '../hooks/useBidCount';
import { useOpenJobs } from '../hooks/useOpenJobs';
import { jobStage } from '../lib/jobStage';
import {
  categoryAccent,
  dollarsToCents,
  formatBudget,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  type OpenJob,
} from '../lib/jobs';
import { createBid, fetchMyBidForJob, type Bid } from '../lib/bids';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { maybePromptForPush } from '../lib/pushNotifications';
import { formatTimeAgo } from '../lib/time';
import type { JobDetailRouteParamList } from '../lib/navigation';
import { colors, radius, spacing } from '../lib/theme';

export function JobDetailScreen() {
  // Registered in three different stacks (Home, MyJobs, Map) — like Chat, its
  // nav/route types are standalone rather than tied to one parent stack.
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<JobDetailRouteParamList, 'JobDetail'>>();
  const { job } = params;
  const { user } = useAuth();

  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Separate from `submitting` so the two bid paths disable each other while
  // either is in flight, and repeated taps on the listed-price button cannot
  // stack a second create_bid call behind the first.
  const [takingListedPrice, setTakingListedPrice] = useState(false);
  const [existingBid, setExistingBid] = useState<Bid | null>(null);
  const [checking, setChecking] = useState(true);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const isOwnJob = !!user && job.client_id === user.id;
  const bidCount = useBidCount(job.id);
  const stage = jobStage(job.status, bidCount, isOwnJob);
  const accent = categoryAccent(job.category);

  // Content otherwise stops dead after the two cards below, leaving a blank
  // scroll area down to the tab bar. Reuses the same open-jobs feed Home's
  // preview list is built on — same-category matches first, newest within
  // that, current job excluded, capped at 3.
  const { jobs: openJobs } = useOpenJobs();
  const similarJobs: OpenJob[] = openJobs
    .filter((j) => j.id !== job.id)
    .sort((a, b) => {
      const aMatch = a.category === job.category ? 0 : 1;
      const bMatch = b.category === job.category ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return b.created_at.localeCompare(a.created_at);
    })
    .slice(0, 3);

  useEffect(() => {
    let active = true;
    if (!user || isOwnJob) {
      setChecking(false);
      return;
    }
    fetchMyBidForJob(user.id, job.id).then(({ data }) => {
      if (active) {
        setExistingBid(data);
        setChecking(false);
      }
    });
    return () => {
      active = false;
    };
  }, [user, job.id, isOwnJob]);

  /**
   * Shared tail of both bid paths. Everything that decides whether the bid is
   * allowed — job still open, not your own job, not blocked, no existing bid —
   * lives in create_bid(), so this only has to report what came back.
   */
  async function placeBid(amountCents: number, pitch: string) {
    if (!user) return false;

    const { data, error } = await createBid(user.id, {
      jobId: job.id,
      amountCents,
      message: pitch,
    });

    if (error) {
      const msg =
        error.code === '23505'
          ? 'You already have a bid on this job.'
          : error.message;
      await alertAsync('Could not place bid', msg);
      // A duplicate means someone (this screen, a second tap, another device)
      // already bid — resync so the form is replaced by the real bid rather
      // than inviting another attempt.
      if (error.code === '23505') {
        const { data: mine } = await fetchMyBidForJob(user.id, job.id);
        setExistingBid(mine);
      }
      return false;
    }

    if (data) setExistingBid(data);
    return true;
  }

  /**
   * "I'll do it for $X" — a bid at the poster's own listed budget, so a worker
   * who is simply happy with the advertised price does not have to retype it
   * and invent a pitch.
   *
   * It is an ordinary bid, deliberately: same table, same create_bid()
   * validation, same competing-bid handling, and the same accept_bid() the
   * poster already uses. Pressing it books nothing — the poster still has to
   * choose this worker over the others.
   */
  async function handleTakeListedPrice() {
    if (!user || job.budget_cents == null || takingListedPrice || submitting) return;

    const ok = await confirmAsync({
      title: `Offer to do this for ${formatBudget(job.budget_cents)}?`,
      message:
        'This sends the client a bid at their listed budget. They still choose who gets the job.',
      confirmText: 'Send offer',
      cancelText: 'Cancel',
    });
    if (!ok) return;

    setTakingListedPrice(true);
    const sent = await placeBid(
      job.budget_cents,
      `I can do this for your listed budget of ${formatBudget(job.budget_cents)}.`
    );
    setTakingListedPrice(false);
    if (!sent) return;

    await alertAsync(
      'Offer sent',
      'The client can see your offer and open your profile from it.'
    );
    await maybePromptForPush(
      'Get told the moment this client accepts your offer — and when new jobs like this are posted.'
    );
    navigation.getParent()?.navigate('MyJobs' as never);
  }

  async function handleSubmit() {
    if (!user) return;

    const amountCents = dollarsToCents(amount);
    if (amountCents == null) {
      await alertAsync('Enter a bid', 'Please enter your bid amount.');
      return;
    }
    if (Number.isNaN(amountCents) || amountCents <= 0) {
      await alertAsync('Invalid amount', 'Your bid must be a positive dollar amount.');
      return;
    }
    if (!message.trim()) {
      await alertAsync('Add a pitch', 'Add a short message telling the client why to pick you.');
      return;
    }

    setSubmitting(true);
    const placed = await placeBid(amountCents, message.trim());
    setSubmitting(false);
    if (!placed) return;

    await alertAsync('Bid placed', 'The client can now see your bid.');

    // Second good moment to ask: they have a bid in flight whose outcome they
    // now care about. No-ops if the PostJob path already asked.
    await maybePromptForPush(
      'Get told the moment this client accepts your bid — and when new jobs like this are posted.'
    );

    // Show the worker their pending bid in the My Jobs hub tab.
    navigation.getParent()?.navigate('MyJobs' as never);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="Job details" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* One consolidated card: identity, the evolving stage badge, the
              details, and (for an eligible poster) the manage actions. */}
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
                <Text style={styles.category}>
                  {JOB_CATEGORY_LABELS[job.category] ?? job.category}
                </Text>
                <Text style={styles.time}>{formatTimeAgo(job.created_at)}</Text>
              </View>
              <StatusBadge status={stage.statusKey} label={stage.label} />
            </View>

            <Text style={styles.title}>{job.title}</Text>

            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={16} color={colors.textMuted} />
              <Text style={styles.detailText}>{job.location ?? 'No location set'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="cash-outline" size={16} color={colors.textMuted} />
              <Text style={styles.detailText}>
                {job.budget_cents != null
                  ? `${formatBudget(job.budget_cents)} budget`
                  : 'Open budget'}
              </Text>
            </View>

            {job.description ? (
              <Text style={styles.description}>{job.description}</Text>
            ) : null}

            {job.photos?.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.photoRow}
                style={styles.photoScroll}
              >
                {job.photos.map((url) => (
                  <Pressable key={url} onPress={() => setViewerUri(url)}>
                    <Image source={{ uri: url }} style={styles.photo} />
                  </Pressable>
                ))}
              </ScrollView>
            )}

            {job.videos?.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.photoRow}
                style={styles.photoScroll}
              >
                {job.videos.map((url, index) => (
                  <JobVideo
                    key={url}
                    uri={url}
                    label={job.videos.length > 1 ? `Clip ${index + 1}` : 'Watch clip'}
                  />
                ))}
              </ScrollView>
            )}

            {isOwnJob && (
              <JobOwnerActions
                jobId={job.id}
                posterId={job.client_id}
                status={job.status}
              />
            )}
          </Card>

          {isOwnJob ? (
            <Card style={styles.noticeCard}>
              <Ionicons name="information-circle-outline" size={20} color={colors.textMuted} />
              <Text style={styles.noticeText}>This is your job — you can’t bid on it.</Text>
            </Card>
          ) : checking ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
          ) : existingBid ? (
            <Card>
              <View style={styles.bidHeader}>
                <Text style={styles.sectionTitle}>Your bid</Text>
                <StatusBadge status={existingBid.status} />
              </View>
              <Text style={styles.bidAmount}>{formatBudget(existingBid.amount_cents)}</Text>
              {existingBid.message ? (
                <Text style={styles.bidMessage}>“{existingBid.message}”</Text>
              ) : null}
              <Text style={styles.bidNote}>
                You’ve already bid on this job. Check My Bids for updates.
              </Text>
            </Card>
          ) : (
            <>
              {/* Happy with the advertised price? One tap, no retyping the
                  number and no inventing a pitch. Still an ordinary bid the
                  poster has to accept. */}
              {job.budget_cents != null && (
                <Card>
                  <Text style={styles.sectionTitle}>Take it at the listed price</Text>
                  <Text style={styles.quickBidText}>
                    Send {formatBudget(job.budget_cents)} as your bid, exactly
                    as posted. The client still picks who gets the job.
                  </Text>
                  <Button
                    title={`I’ll do it for ${formatBudget(job.budget_cents)}`}
                    icon="checkmark-circle-outline"
                    onPress={handleTakeListedPrice}
                    loading={takingListedPrice}
                    disabled={submitting}
                    style={styles.quickBidAction}
                  />
                </Card>
              )}

              <Card>
                <Text style={styles.sectionTitle}>
                  {job.budget_cents != null ? 'Or name your own price' : 'Place a bid'}
                </Text>
                <View style={styles.form}>
                  <TextField
                    label="Your bid (USD)"
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="e.g. 45"
                    keyboardType="numeric"
                  />
                  <TextField
                    label="Pitch"
                    value={message}
                    onChangeText={setMessage}
                    placeholder="Why should the client pick you?"
                    autoCapitalize="sentences"
                    multiline
                    numberOfLines={3}
                    style={styles.multiline}
                  />
                  <Button
                    title="Place bid"
                    onPress={handleSubmit}
                    loading={submitting}
                    disabled={takingListedPrice}
                  />
                </View>
              </Card>
            </>
          )}

          {similarJobs.length > 0 && (
            <View style={styles.similarSection}>
              <Text style={styles.similarTitle}>Similar open jobs</Text>
              <View style={styles.similarList}>
                {similarJobs.map((sj) => (
                  <BrowseJobCard
                    key={sj.id}
                    job={sj}
                    onPress={() => (navigation as any).navigate('JobDetail', { job: sj })}
                  />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <PhotoViewer
        visible={!!viewerUri}
        uri={viewerUri}
        onClose={() => setViewerUri(null)}
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
    marginBottom: spacing.md,
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
  category: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  time: {
    fontSize: 13,
    color: colors.textMuted,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs + 2,
  },
  detailText: {
    fontSize: 15,
    color: colors.textMuted,
  },
  description: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
    marginTop: spacing.md,
  },
  photoScroll: {
    marginTop: spacing.md,
  },
  photoRow: {
    gap: spacing.sm,
  },
  photo: {
    width: 120,
    height: 120,
    borderRadius: radius.md,
    backgroundColor: colors.neutralBg,
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
  },
  similarSection: {
    gap: spacing.md,
  },
  similarTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  similarList: {
    gap: spacing.md,
  },
  quickBidText: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  quickBidAction: {
    marginTop: spacing.lg,
  },
  form: {
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  multiline: {
    height: 90,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  bidHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bidAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing.sm,
  },
  bidMessage: {
    fontSize: 14,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  bidNote: {
    fontSize: 13,
    color: colors.textSubtle,
    marginTop: spacing.md,
  },
});
