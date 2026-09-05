import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { RemoteImage } from '../components/RemoteImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { JobProgress } from '../components/JobProgress';
import { JobVideo } from '../components/JobVideo';
import { PhotoViewer } from '../components/PhotoViewer';
import { ReviewSection } from '../components/ReviewSection';
import { ScreenHeader } from '../components/ScreenHeader';
import { StatusBadge } from '../components/StatusBadge';
import { goBackOrHome } from '../lib/navigationRef';
import { useAuth } from '../hooks/useAuth';
import { useJob } from '../hooks/useJob';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { Sentry } from '../lib/observability/sentry';
import {
  categoryAccent,
  completionPhotosOf,
  completionVideosOf,
  formatBudget,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  updateJobStatus,
} from '../lib/jobs';
import { fetchProfileById, type Profile } from '../lib/profiles';
import { paymentsMode } from '../lib/adapters/payments';
import {
  brazosFeeCents,
  fetchJobPaymentState,
  isHeld,
  isReleased,
  isReleaseRequested,
  workerTakeCents,
  type Payment,
} from '../lib/payments';
import { fetchOpenJobDispute } from '../lib/disputes';
import { JOB_LIFECYCLE_LABELS, deriveJobLifecycle } from '../lib/jobLifecycle';
import { MoneyText } from '../ui/primitives/MoneyText';
import { useFloatingNavClearance } from '../ui/primitives';
import {
  deleteJobPhoto,
  rejectionForPickedVideo,
  uploadCompletionVideo,
  uploadJobPhoto,
} from '../lib/storage';
import type { MyJobsStackNavigation, MyJobsStackParamList } from '../lib/navigation';
import { useDialNumber } from '../lib/designOverrides';
import {
  fonts,
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';

/** Same cap as a job posting's photos, for consistency. */
const MAX_DONE_PHOTOS = 5;
/** One clip is the evidence; a second is a second opinion nobody asked for.
 *  Matches the cap transition_job_status() enforces server-side (phase35). */
const MAX_DONE_VIDEOS = 1;
/** Two minutes — long enough to walk a client through finished work, short
 *  enough to upload from a job site. */
const MAX_DONE_VIDEO_DURATION_MS = 120_000;
/** Roughly two minutes of phone video at default quality, with headroom. Past
 *  this the upload becomes the worst part of finishing a job. */
const MAX_DONE_VIDEO_BYTES = 100 * 1024 * 1024;

/** mm:ss for a picked clip's length, so the worker can see what they attached. */
function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function WorkerJobScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // RUN T2 (C12) — THE WORKER'S ACTIVE JOB, ITS OWN FOUR. Each dial falls back
  // to the value this file drew before it existed, spelled here and nowhere
  // else; the two token-backed ones take the `theme.*` scale this file imports
  // spacing/radius from. `photoHeight` reaches BOTH photo boxes — the one the
  // worker just picked and the ones already sent — because they are the same
  // proof at two moments and drew the same 180.
  const contentPadding = useDialNumber('workerJob.content.padding') ?? spacing.lg;
  const contentGap = useDialNumber('workerJob.content.gap') ?? spacing.lg;
  const iconCircleSize = useDialNumber('workerJob.iconCircle.size') ?? 44;
  const photoHeight = useDialNumber('workerJob.photo.height') ?? 180;
  // emerald(3): the floating pill's real footprint.
  const navClearance = useFloatingNavClearance();
  const navigation = useNavigation<MyJobsStackNavigation>();
  const { params } = useRoute<RouteProp<MyJobsStackParamList, 'WorkerJob'>>();
  const { user } = useAuth();
  const { job, loading, error, refresh } = useJob(params.jobId);

  const [client, setClient] = useState<Profile | null>(null);
  // Uploaded completion photos, held as public URLs so the preview and the
  // final write use exactly the same values (upload happens on pick, not on
  // submit, so a slow upload never blocks marking the job done).
  const [donePhotos, setDonePhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // The single completion clip, held the same way: uploaded on pick, so the
  // job is never marked complete referencing something not yet in storage.
  const [doneVideo, setDoneVideo] = useState<{ url: string; durationMs: number | null } | null>(
    null
  );
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [working, setWorking] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  // Handed to ReviewSection so focusing its comment field can lift the card
  // clear of the keyboard — the review card is the last thing in this list.
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!job?.client_id) return;
    let active = true;
    fetchProfileById(job.client_id).then(({ data }) => {
      if (active) setClient(data);
    });
    return () => {
      active = false;
    };
  }, [job?.client_id]);

  const isWorker = !!user && job?.assigned_worker_id === user.id;
  const clientName = client?.full_name ?? 'the client';

  // The job's sandbox ledger row: the hired worker is the payee, so RLS
  // grants this read, and the card below shows the honest §H.3 state — held
  // is held, released is released, never "paid" beyond the truth. Read
  // through job_payment_state() (phase51) so the 72h auto-release clock is
  // checked whenever the worker looks. Re-read on focus so the customer's
  // checkout/approval on their side shows up when the worker returns here.
  const [payment, setPayment] = useState<Payment | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!job || job.status === 'open') return;
      fetchJobPaymentState(job.id).then(({ data, error: paymentError }) => {
        if (active && !paymentError) setPayment(data);
      });
      fetchOpenJobDispute(job.id).then(({ data, error: disputeError }) => {
        if (active && !disputeError) setIssueOpen(!!data);
      });
      return () => {
        active = false;
      };
    }, [job?.id, job?.status])
  );

  async function handleStart() {
    setWorking(true);
    const { error } = await updateJobStatus(params.jobId, 'in_progress');
    setWorking(false);
    if (error) {
      await alertAsync('Could not start job', userMessage(error));
      return;
    }
    await refresh();
  }

  const photoSlots = MAX_DONE_PHOTOS - donePhotos.length;
  const videoSlots = doneVideo ? 0 : MAX_DONE_VIDEOS;
  const canAddMedia = photoSlots > 0 || videoSlots > 0;
  const uploadingMedia = uploadingPhoto || uploadingVideo;

  /**
   * One "Add photos or video" control rather than two pickers: the worker
   * opens the library once and picks whatever shows the finished job best —
   * photos, a clip, or both. Everything over a limit is refused with a reason,
   * and everything under it is still kept, so a rejected extra never costs the
   * worker the files they actually wanted.
   */
  async function pickCompletionMedia() {
    if (!canAddMedia) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: photoSlots + videoSlots,
      // Caps recording length where the picker offers to record. A clip chosen
      // from the library isn't covered by it, so the real check is
      // rejectionForPickedVideo below — this just stops the obvious case sooner.
      videoMaxDuration: MAX_DONE_VIDEO_DURATION_MS / 1000,
    });
    if (result.canceled || result.assets.length === 0) return;

    const images = result.assets.filter((a) => a.type !== 'video');
    const clips = result.assets.filter((a) => a.type === 'video');
    // Every reason something was left out, collected and reported once at the
    // end — one clear summary beats a sequence of interrupting alerts.
    const skipped: string[] = [];

    const acceptedImages = images.slice(0, photoSlots);
    if (images.length > acceptedImages.length) {
      skipped.push(
        `Only ${MAX_DONE_PHOTOS} photos can be attached, so ${
          images.length - acceptedImages.length
        } weren’t added.`
      );
    }

    if (acceptedImages.length > 0) {
      setUploadingPhoto(true);
      const uploaded: string[] = [];
      let failures = 0;
      for (const asset of acceptedImages) {
        const { url, error: uploadError } = await uploadJobPhoto(params.jobId, asset);
        if (uploadError || !url) failures++;
        else uploaded.push(url);
      }
      setUploadingPhoto(false);

      if (uploaded.length > 0) {
        setDonePhotos((prev) => [...prev, ...uploaded].slice(0, MAX_DONE_PHOTOS));
      }
      if (failures > 0) {
        skipped.push(
          `${failures} ${failures === 1 ? 'photo' : 'photos'} couldn’t be uploaded.`
        );
      }
    }

    if (clips.length > 0) {
      if (videoSlots === 0) {
        skipped.push('Only one video can be attached, so the clip wasn’t added.');
      } else {
        if (clips.length > 1) {
          skipped.push('Only one video can be attached, so the first clip was used.');
        }
        const clip = clips[0];
        const rejection = rejectionForPickedVideo(clip, {
          maxDurationMs: MAX_DONE_VIDEO_DURATION_MS,
          maxBytes: MAX_DONE_VIDEO_BYTES,
        });
        if (rejection) {
          skipped.push(rejection.message);
        } else {
          setUploadingVideo(true);
          const { url, error: uploadError } = await uploadCompletionVideo(
            params.jobId,
            clip
          );
          setUploadingVideo(false);
          // Only a successful upload is kept, so the job can never be completed
          // referencing something that is not in storage.
          if (uploadError || !url) {
            skipped.push(
              'The video couldn’t be uploaded. On a slow connection a shorter clip uploads more reliably.'
            );
          } else {
            setDoneVideo({ url, durationMs: clip.duration ?? null });
          }
        }
      }
    }

    if (skipped.length > 0) {
      await alertAsync('Some files weren’t added', skipped.join('\n\n'));
    }
  }

  function removeDonePhoto(url: string) {
    setDonePhotos((prev) => prev.filter((p) => p !== url));

    // Unlike PostJobScreen's photos, donePhotos never holds anything already
    // saved to the job — it only ever starts empty and fills with fresh
    // uploads from this completion attempt, so every removal here is always
    // safe to clean up from storage immediately.
    deleteJobPhoto(url).then(({ error }) => {
      if (error) {
        console.error('[WorkerJobScreen] deleteJobPhoto failed', error);
        Sentry?.captureException(error, { extra: { site: 'WorkerJobScreen.removeDonePhoto' } });
      }
    });
  }

  /** Same rule as removeDonePhoto: nothing here is referenced by the job row
   *  yet, so the object is safe to remove from storage right away. */
  function removeDoneVideo() {
    const url = doneVideo?.url;
    setDoneVideo(null);
    if (!url) return;
    deleteJobPhoto(url).then(({ error }) => {
      if (error) {
        console.error('[WorkerJobScreen] delete completion video failed', error);
        Sentry?.captureException(error, { extra: { site: 'WorkerJobScreen.removeDoneVideo' } });
      }
    });
  }

  async function handleComplete() {
    // An upload still in flight would be dropped by the write below, so the
    // button is disabled for it — this is the belt to that braces.
    if (uploadingMedia) return;

    // R6c (D-14 / D6): at least one PHOTO is required to mark the job
    // complete — it is what the customer approves against, and
    // transition_job_status refuses without one. So no call is made with an
    // empty gallery: the reason is said, and the same picker is offered. A
    // video alone is not a photo. Should the RPC refuse anyway, its own
    // sentence is shown below, unchanged.
    if (donePhotos.length === 0) {
      const addNow = await confirmAsync({
        title: 'Add a photo of the finished work',
        message:
          'At least one photo of the finished work is required to mark this job complete — it’s what the customer approves against. Add one now?',
        confirmText: 'Add photos',
        cancelText: 'Not yet',
      });
      if (addNow) await pickCompletionMedia();
      return; // Let them review what was picked, then tap Mark complete again.
    }

    setWorking(true);
    const { error } = await updateJobStatus(
      params.jobId,
      'completed',
      donePhotos,
      doneVideo ? [doneVideo.url] : []
    );
    setWorking(false);
    if (error) {
      await alertAsync('Could not complete job', userMessage(error));
      return;
    }
    setDonePhotos([]);
    setDoneVideo(null);
    await refresh();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="Your Job" onBack={goBackOrHome} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading || !job ? (
        <View style={styles.center}>
          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : (
            <Text style={styles.muted}>Job not found.</Text>
          )}
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.content,
            { padding: contentPadding, gap: contentGap, paddingBottom: navClearance },
          ]}
          keyboardShouldPersistTaps="handled"
          // Swiping the list down puts the keyboard away, so it never has to
          // be dismissed by hunting for empty space to tap.
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <Card>
            <View style={styles.jobHeader}>
              {/* Master 6: a sage squircle behind a gold hairline, glyph in
                  gold; light keeps the per-category accent pair. */}
              <View
                style={[
                  styles.iconCircle,
                  { width: iconCircleSize, height: iconCircleSize },
                  isDark
                    ? styles.iconCircleDark
                    : { backgroundColor: categoryAccent(job.category).bg },
                ]}
              >
                <Ionicons
                  name={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
                  size={22}
                  color={isDark ? colors.gold : categoryAccent(job.category).icon}
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
              <StatusBadge status={job.status} />
            </View>
            <View style={styles.jobFooter}>
              <Text style={styles.amount}>
                {formatBudget(job.final_amount_cents ?? job.budget_cents)}
              </Text>
              <Text style={styles.muted}>for {clientName}</Text>
            </View>
          </Card>

          <Card>
            <JobProgress status={job.status} />
          </Card>

          {isWorker && payment ? (
            <Card style={styles.paymentCard}>
              {/* Masters 6 and 7 set a large outlined shield-check here. */}
              <View style={styles.paymentShield} pointerEvents="none">
                <Ionicons
                  name="shield-checkmark-outline"
                  size={54}
                  color={isDark ? colors.gold : colors.emerald}
                />
              </View>
              {/* D16: sandbox keeps its wording verbatim; the card path says
                  the same money fact without the label. D23: a held row the
                  customer approved (release_requested_at set) is approved —
                  the payout is on its way; MoneyText keeps the row's real
                  status, and nothing here says released before it is. */}
              <Text style={[styles.paymentEyebrow, isDark && styles.paymentEyebrowDark]}>
                {paymentsMode === 'sandbox'
                  ? isReleased(payment)
                    ? 'PAYMENT RELEASED · SANDBOX'
                    : isHeld(payment)
                      ? 'PAYMENT PROTECTED · SANDBOX'
                      : 'PAYMENT · SANDBOX'
                  : isReleased(payment)
                    ? 'PAYMENT RELEASED'
                    : isReleaseRequested(payment)
                      ? 'APPROVED · PAYOUT ON ITS WAY'
                      : isHeld(payment)
                        ? 'PAYMENT PROTECTED'
                        : 'PAYMENT'}
              </Text>
              {/* R6c (D7): the figure a worker reads as "yours" is the take —
                  amount_cents − platform_fee_cents through the one helper.
                  Sandbox rows carry a zero fee, so nothing changes there. */}
              <MoneyText cents={workerTakeCents(payment)} state={payment.status} />
              <Text style={styles.paymentNote}>
                {(() => {
                  // A7: the disputed/awaiting fork comes from THE derivation
                  // point; the money predicates stay payment vocabulary.
                  const lifecycle = deriveJobLifecycle({ job, payment, hasOpenDispute: issueOpen });
                  const sandbox = paymentsMode === 'sandbox';
                  if (isReleased(payment)) {
                    return payment.release_reason === 'auto_approved'
                      ? sandbox
                        ? 'Released automatically after 72 hours with no response from the customer. Sandbox build — no real money.'
                        : 'Released automatically after 72 hours with no response from the customer.'
                      : sandbox
                        ? `${clientName} approved the finished work and the funds were released. Sandbox build — no real money.`
                        : `${clientName} approved the finished work and the payment was released.`;
                  }
                  if (lifecycle === 'disputed') {
                    return `${clientName} reported an issue, which holds the funds while it’s open. Sort it out together in chat — release resumes when the report is withdrawn or resolved.`;
                  }
                  if (isReleaseRequested(payment)) {
                    return payment.release_reason === 'auto_approved'
                      ? `Approved automatically after 72 hours with no response from ${clientName}. Your payout is on its way and shows as released when the transfer lands.`
                      : `${clientName} approved the finished work. Your payout is on its way and shows as released when the transfer lands.`;
                  }
                  if (lifecycle === 'awaiting_approval') {
                    return sandbox
                      ? `Waiting on ${clientName} to approve the finished work. If they don’t respond within 72 hours, the funds release automatically. Sandbox build — no real money.`
                      : `Waiting on ${clientName} to approve the finished work. If they don’t respond within 72 hours, the funds release automatically.`;
                  }
                  if (isHeld(payment)) {
                    return sandbox
                      ? `${clientName} placed the funds in protection. They’re released only after the finished work is approved — sandbox build, no real money.`
                      : `${clientName} placed the funds in protection. They’re released only after the finished work is approved.`;
                  }
                  return sandbox
                    ? 'Sandbox build — payment states here are development records, not real money.'
                    : 'The payment isn’t in protection yet — the states here follow the ledger.';
                })()}
              </Text>
              {/* R6c (D7): the three-line breakdown, off the row's own
                  columns, once the customer's charge has actually landed
                  (held or later) — never on an unfunded row. Card path
                  only: the sandbox ledger carries no charge figure. */}
              {paymentsMode === 'stripe' &&
              payment.charge_amount_cents != null &&
              (payment.status === 'held' ||
                payment.status === 'released' ||
                payment.status === 'paid_out') ? (
                <View style={styles.breakdown}>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Customer paid</Text>
                    <Text style={styles.breakdownValue}>
                      {formatBudget(payment.charge_amount_cents)}
                    </Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Brazos Protection</Text>
                    <Text style={styles.breakdownValue}>{formatBudget(brazosFeeCents(payment))}</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownStrongLabel}>You receive</Text>
                    <Text style={styles.breakdownStrongValue}>
                      {formatBudget(workerTakeCents(payment))}
                    </Text>
                  </View>
                </View>
              ) : null}
            </Card>
          ) : null}

          {isWorker && (
            <Button
              title={`Message ${clientName}`}
              icon="chatbubble-outline"
              iconPosition="leading"
              variant="secondary"
              onPress={() => navigation.navigate('Chat', { jobId: job.id })}
            />
          )}

          {!isWorker ? (
            <Card style={styles.noticeCard}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} />
              <Text style={styles.noticeText}>
                You’re not the assigned worker for this job.
              </Text>
            </Card>
          ) : job.status === 'assigned' ? (
            <>
              <Card>
                <Text style={styles.actionTitle}>
                  {JOB_LIFECYCLE_LABELS[deriveJobLifecycle({ job, payment })]}
                </Text>
                <Text style={styles.actionText}>
                  Let {clientName} know you’re on the way and when you arrive —
                  two simple status taps, no location tracking.
                </Text>
                <Button
                  title="Route & arrival"
                  variant="secondary"
                  onPress={() => navigation.navigate('RouteArrival', { jobId: job.id })}
                  style={styles.action}
                />
                <Button
                  title="Work checklist"
                  variant="secondary"
                  onPress={() => navigation.navigate('WorkChecklist', { jobId: job.id })}
                  style={styles.action}
                />
              </Card>
              <Card>
                <Text style={styles.actionTitle}>Ready to start?</Text>
                <Text style={styles.actionText}>
                  Mark the job in progress when you begin the work.
                </Text>
                <Button
                  title="Start job"
                  onPress={handleStart}
                  loading={working}
                  style={styles.action}
                />
              </Card>
            </>
          ) : job.status === 'in_progress' ? (
            <>
            <Button
              title="Work checklist"
              variant="secondary"
              onPress={() => navigation.navigate('WorkChecklist', { jobId: job.id })}
            />
            <Card>
              <Text style={styles.actionTitle}>Finish up</Text>
              <Text style={styles.actionText}>
                Add at least one photo of the finished work — up to {MAX_DONE_PHOTOS},
                plus one short video if you like — then mark it complete.
              </Text>

              {doneVideo && (
                <View style={styles.videoWrap}>
                  <JobVideo uri={doneVideo.url} label="Finished work" />
                  <Pressable
                    style={styles.photoRemove}
                    onPress={removeDoneVideo}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Remove video"
                  >
                    <Ionicons name="close" size={16} color={colors.onPrimary} />
                  </Pressable>
                  <Text style={styles.mediaCount}>
                    Video attached
                    {doneVideo.durationMs != null
                      ? ` · ${formatDuration(doneVideo.durationMs)}`
                      : ''}
                  </Text>
                </View>
              )}

              {donePhotos.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.donePhotoRow}
                  style={styles.donePhotoScroll}
                >
                  {donePhotos.map((url) => (
                    <View key={url} style={styles.photoWrap}>
                      <Pressable onPress={() => setViewerUri(url)}>
                        <RemoteImage uri={url} style={[styles.photo, { height: photoHeight }]} />
                      </Pressable>
                      <Pressable
                        style={styles.photoRemove}
                        onPress={() => removeDonePhoto(url)}
                        hitSlop={6}
                      >
                        <Ionicons name="close" size={16} color={colors.onPrimary} />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              )}

              {canAddMedia && (
                <Pressable
                  style={styles.photoPicker}
                  onPress={pickCompletionMedia}
                  disabled={uploadingMedia}
                  accessibilityRole="button"
                  accessibilityLabel="Add photos or video of the finished work"
                >
                  {uploadingMedia ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="camera-outline" size={22} color={colors.primary} />
                  )}
                  <Text style={styles.photoPickerText}>
                    {uploadingMedia ? 'Uploading…' : 'Add photos or video'}
                  </Text>
                </Pressable>
              )}

              {(donePhotos.length > 0 || doneVideo) && (
                <Text style={styles.mediaCount}>
                  {donePhotos.length}/{MAX_DONE_PHOTOS} photos
                  {doneVideo ? ' · 1 video' : ''}
                </Text>
              )}
              {donePhotos.length === 0 && (
                <Text style={styles.mediaCount}>
                  A photo of the finished work is required to mark it complete.
                </Text>
              )}

              <Button
                title="Mark complete"
                onPress={handleComplete}
                loading={working}
                disabled={uploadingMedia}
                style={styles.action}
              />
            </Card>
            </>
          ) : job.status === 'completed' ? (
            <>
              {completionPhotosOf(job).length > 0 || completionVideosOf(job).length > 0 ? (
                <Card>
                  <Text style={styles.actionTitle}>Finished work</Text>
                  {completionPhotosOf(job).length > 0 && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.donePhotoRow}
                      style={styles.donePhotoScroll}
                    >
                      {completionPhotosOf(job).map((url) => (
                        <Pressable key={url} onPress={() => setViewerUri(url)}>
                          <RemoteImage uri={url} style={[styles.donePhoto, { height: photoHeight }]} />
                        </Pressable>
                      ))}
                    </ScrollView>
                  )}
                  {completionVideosOf(job).length > 0 && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.donePhotoRow}
                      style={styles.donePhotoScroll}
                    >
                      {completionVideosOf(job).map((url) => (
                        <JobVideo key={url} uri={url} label="Finished work" />
                      ))}
                    </ScrollView>
                  )}
                </Card>
              ) : null}

              {user && (
                <ReviewSection
                  key={`${job.id}:${user.id}`}
                  jobId={job.id}
                  reviewerId={user.id}
                  revieweeId={job.client_id}
                  revieweeName={clientName}
                  revieweeRole="customer"
                  prompt={`How was working with ${clientName}?`}
                  scrollRef={scrollRef}
                />
              )}
            </>
          ) : (
            <Card style={styles.noticeCard}>
              <Ionicons name="information-circle-outline" size={20} color={colors.textMuted} />
              <Text style={styles.noticeText}>
                This job is {job.status.replace(/_/g, ' ')}.
              </Text>
            </Card>
          )}
        </ScrollView>
        </KeyboardAvoidingView>
      )}

      <PhotoViewer
        visible={!!viewerUri}
        uri={viewerUri}
        onClose={() => setViewerUri(null)}
      />
    </SafeAreaView>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  paymentCard: {
    gap: spacing.sm,
  },
  // Eyebrow law: a structural card label is gold small-caps.
  paymentEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 1.4,
  },
  paymentEyebrowDark: { color: colors.gold },
  // Masters 6 and 7 set a large outlined shield-check against the payment
  // card's copy — decoration beside a claim the words already make.
  paymentShield: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentNote: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  // R6c (D7): the breakdown rows under the payment note.
  breakdown: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  breakdownLabel: {
    fontSize: 13,
    color: colors.textMuted,
  },
  breakdownValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  breakdownStrongLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
  },
  breakdownStrongValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    // Extra clearance below the last card so that, once the review form has
    // been scrolled to the end with the keyboard open, Submit sits clear of
    // the keyboard's top edge rather than flush against it.
    paddingBottom: spacing.xxl,
  },
  jobHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconCircle: {
    borderRadius: radius.md,
    // backgroundColor set per-category inline — see JOB_CATEGORY_COLORS.
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconCircleDark: {
    backgroundColor: colors.mint,
  },
  jobHeaderText: {
    flex: 1,
    gap: 2,
  },
  // Decision 9: card titles and prices are display type.
  jobTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
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
  amount: {
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '800',
    color: colors.ink,
  },
  muted: {
    fontSize: 13,
    color: colors.textMuted,
  },
  actionTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
  },
  actionText: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  action: {
    marginTop: spacing.lg,
  },
  photoPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    backgroundColor: colors.primarySoft,
  },
  photoPickerText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  photoWrap: {
    marginTop: spacing.lg,
    position: 'relative',
  },
  videoWrap: {
    marginTop: spacing.lg,
    alignSelf: 'flex-start',
    position: 'relative',
  },
  mediaCount: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  photo: {
    // Fixed width, not '100%'. These tiles live inside a HORIZONTAL
    // ScrollView, whose content container has no bounded width for a
    // percentage to resolve against — the just-uploaded completion photos
    // were laying out at zero width because of it. Matches donePhoto below
    // so the preview and the saved gallery are the same size — RUN T2 (C12)
    // keeps that true by pointing BOTH at the one height dial.
    width: 240,
    borderRadius: radius.md,
    backgroundColor: colors.border,
  },
  photoRemove: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: withAlpha(colors.text, 0.6),
    alignItems: 'center',
    justifyContent: 'center',
  },
  donePhoto: {
    width: 240,
    borderRadius: radius.md,
    backgroundColor: colors.border,
  },
  donePhotoScroll: {
    marginTop: spacing.md,
  },
  donePhotoRow: {
    gap: spacing.sm,
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
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
  },
  }),
);
