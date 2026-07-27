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
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { JobOwnerActions } from '../components/JobOwnerActions';
import { PhotoViewer } from '../components/PhotoViewer';
import { ScreenHeader } from '../components/ScreenHeader';
import { StatusBadge } from '../components/StatusBadge';
import { TextField } from '../components/TextField';
import { useAuth } from '../hooks/useAuth';
import { useBidCount } from '../hooks/useBidCount';
import { jobStage } from '../lib/jobStage';
import {
  dollarsToCents,
  formatBudget,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
} from '../lib/jobs';
import { createBid, fetchMyBidForJob, type Bid } from '../lib/bids';
import { alertAsync } from '../lib/dialog';
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
  const [existingBid, setExistingBid] = useState<Bid | null>(null);
  const [checking, setChecking] = useState(true);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const isOwnJob = !!user && job.client_id === user.id;
  const bidCount = useBidCount(job.id);
  const stage = jobStage(job.status, bidCount, isOwnJob);

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
    const { error } = await createBid(user.id, {
      jobId: job.id,
      amountCents,
      message: message.trim(),
    });
    setSubmitting(false);

    if (error) {
      const msg =
        error.code === '23505'
          ? 'You already have a bid on this job.'
          : error.message;
      await alertAsync('Could not place bid', msg);
      return;
    }

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
              <View style={styles.iconCircle}>
                <Ionicons
                  name={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
                  size={22}
                  color={colors.primary}
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
            <Card>
              <Text style={styles.sectionTitle}>Place a bid</Text>
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
                <Button title="Place bid" onPress={handleSubmit} loading={submitting} />
              </View>
            </Card>
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
    backgroundColor: colors.primarySoft,
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
