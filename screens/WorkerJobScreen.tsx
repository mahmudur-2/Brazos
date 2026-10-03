import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Linking,
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
import { CategoryGlyph } from '../components/CategoryGlyph';
import * as ImagePicker from 'expo-image-picker';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { LATE_CHOICES, isLateDay } from '../lib/runningLate';
import { HeldPulse, ReleasedTick } from '../components/MoneyMoment';
import { JobProgress } from '../components/JobProgress';
import { JobVideo } from '../components/JobVideo';
import { PhotoViewer } from '../components/PhotoViewer';
import { ReviewSection } from '../components/ReviewSection';
import { ScreenHeader } from '../components/ScreenHeader';
import { StatusBadge } from '../components/StatusBadge';
import { goBackOrHome, navigateAcrossTabs } from '../lib/navigationRef';
import { PayoutNudge } from '../components/PayoutNudge';
import { useAuth } from '../hooks/useAuth';
import { useJob } from '../hooks/useJob';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { RepeatNote } from '../components/RepeatNote';
import { useJobSeries } from '../hooks/useJobSeries';
import { dropSeriesWorker } from '../lib/jobSeries';
import { userMessage } from '../lib/errorMessage';
import { Sentry } from '../lib/observability/sentry';
import {
  arrivalWindowLabel,
  categoryAccent,
  completionPhotosOf,
  completionVideosOf,
  fetchJobLocation,
  formatBudget,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  markWorkerArrival,
  reportRunningLate,
  updateJobStatus,
  type JobPrivateLocation,
} from '../lib/jobs';
import { fetchProfileById, type Profile } from '../lib/profiles';
import { paymentsMode } from '../lib/adapters/payments';
import {
  brazosFeeCents,
  fetchJobPaymentState,
  isHeld,
  isReleased,
  isReleaseRequested,
  PAYOUT_SETUP_NOTICE,
  payoutSetupNotice,
  workerTakeCents,
  type Payment,
  type PayoutsStatus,
} from '../lib/payments';
import { fetchMyPayoutsStatus } from '../lib/payments/stripe';
import { fetchOpenJobDispute } from '../lib/disputes';
import { JOB_LIFECYCLE_LABELS, deriveJobLifecycle, trackStepIndex } from '../lib/jobLifecycle';
import { MoneyText } from '../ui/primitives/MoneyText';
import { usePinnedFooterPadding, useScrollClearance } from '../ui/primitives';
import {
  deleteJobPhoto,
  rejectionForPickedVideo,
  uploadCompletionVideo,
  uploadJobPhoto,
} from '../lib/storage';
import type { MyJobsStackNavigation, MyJobsStackParamList } from '../lib/navigation';
import { useDialNumber } from '../lib/designOverrides';

/** The stepper's crossfade into a done stage (2026-09-27, the Lux remake, ruling 14). */
const STAGE_FILL_MS = 220;
import {
  fonts,
  radius,
  spacing,
  themedStyles,
  litCardStyle,
  useThemeColors,
  withAlpha,
  type ColorPalette,
  screenGround,
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
  const navClearance = useScrollClearance();
  const footerPad = usePinnedFooterPadding();
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
  // Idea 14: a visit of a repeating job this worker gets first — its line, and "Drop future visits".
  // RLS answers with no row once they are not the series' worker, and the note is gone.
  const { series, setSeries } = useJobSeries(job?.series_id);
  const [droppingSeries, setDroppingSeries] = useState(false);
  async function handleDropSeries() {
    if (!series || droppingSeries) return;
    const ok = await confirmAsync({
      title: 'Drop future visits?',
      message: `${clientName} will post the next visits for bids. This visit stays yours.`,
      confirmText: 'Drop future visits',
      cancelText: 'Keep them',
      destructive: true,
    });
    if (!ok) return;
    setDroppingSeries(true);
    const { error: dropError } = await dropSeriesWorker(series.id);
    setDroppingSeries(false);
    if (dropError) {
      await alertAsync('Could not drop the visits', userMessage(dropError));
      return;
    }
    setSeries(null);
  }
  // Idea 5's "Dana was told ✓" — the first name, as a person would say it.
  const clientFirstName = client?.full_name?.trim().split(/\s+/)[0] || 'Your customer';

  // The job's sandbox ledger row: the hired worker is the payee, so RLS
  // grants this read, and the card below shows the honest §H.3 state — held
  // is held, released is released, never "paid" beyond the truth. Read
  // through job_payment_state() (phase51) so the 72h auto-release clock is
  // checked whenever the worker looks. Re-read on focus so the customer's
  // checkout/approval on their side shows up when the worker returns here.
  const [payment, setPayment] = useState<Payment | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  // 2026-09-28 (LUX-LIST-64 #63, audit M-14) — the stored payout state, read on
  // the card path only (no RPC on the sandbox path), so an approved payment
  // that is waiting on the worker's own setup says so. A failed read is null,
  // and null says nothing — the card is then today's.
  const [payouts, setPayouts] = useState<PayoutsStatus | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (paymentsMode !== 'stripe') return;
      fetchMyPayoutsStatus().then(({ data }) => {
        if (active) setPayouts(data);
      });
      return () => {
        active = false;
      };
    }, [])
  );
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

  // M-3 — the exact address (job_locations), so the stage screen can say where
  // the job is and open directions. RLS grants the hired worker this read and
  // nobody else; the screen is the worker's own job surface.
  const [location, setLocation] = useState<JobPrivateLocation | null>(null);
  const [marking, setMarking] = useState<'en_route' | 'arrived' | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!job || (job.status !== 'assigned' && job.status !== 'in_progress')) return;
      fetchJobLocation(job.id).then(({ data, error: locationError }) => {
        if (active && !locationError) setLocation(data);
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

  /**
   * 2026-09-30 (idea 5) — RUNNING LATE, ONE TAP: a chip tells the customer and moves the arrival
   * time (report_running_late()). The latest tap wins; the job comes back with it.
   */
  const [reportingLate, setReportingLate] = useState<number | null>(null);
  async function handleLate(minutes: (typeof LATE_CHOICES)[number]) {
    if (reportingLate != null) return;
    setReportingLate(minutes);
    const { error: lateError } = await reportRunningLate(params.jobId, minutes);
    setReportingLate(null);
    if (lateError) {
      await alertAsync('Could not tell them', userMessage(lateError));
      return;
    }
    await refresh();
  }

  /** The two one-way declarations, the same mark_worker_arrival() calls
   *  Route & arrival makes. Nothing tracks a location. */
  async function handleMark(step: 'en_route' | 'arrived') {
    if (marking) return;
    setMarking(step);
    const { error: markError } = await markWorkerArrival(params.jobId, step);
    setMarking(null);
    if (markError) {
      await alertAsync('Could not update your status', userMessage(markError));
      return;
    }
    await refresh();
  }

  /** Directions in Apple Maps to the exact address — the phone's own app, no
   *  location is read or shared by this screen. */
  async function openDirections(address: string) {
    const query = encodeURIComponent(address);
    const url = Platform.OS === 'ios' ? `maps://?daddr=${query}` : `https://maps.apple.com/?daddr=${query}`;
    try {
      await Linking.openURL(url);
    } catch {
      await alertAsync('Could not open Maps', 'Copy the address and paste it into your maps app instead.');
    }
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

  // M-3 — THE STAGE. Where the worker is on the canonical track (P3-31: the
  // one derivation, read here and nowhere re-decided): 0 hired, 1 on the way,
  // 2 arrived, 3 working, 4 done. While the job is live the screen is one
  // pinned primary that is always the NEXT step — the same one-way calls
  // Route & arrival and the old cards made — instead of two cards of equal
  // weight and a status the worker had to find.
  const lifecycle = job ? deriveJobLifecycle({ job, payment, hasOpenDispute: issueOpen }) : null;
  const track = lifecycle ? trackStepIndex(lifecycle) : -1;
  const live = !!job && isWorker && (job.status === 'assigned' || job.status === 'in_progress');
  // M-27 — hired is not paid. Until the customer's payment is protected the
  // primary is the conversation, not the trip. A8 (2026-10-03): starting is
  // not offered at all until the payment is held — transition_job_status()
  // refuses assigned → in_progress on an unheld row
  // (supabase/migrations/20260925000000_job_completions.sql), so "Start
  // anyway" could only ever fail.
  const awaitingProtection = lifecycle === 'pending_payment';
  const stageAction: { title: string; onPress: () => void; loading: boolean; disabled?: boolean } | null =
    !live || !job
      ? null
      : awaitingProtection
        ? { title: `Message ${clientName}`, onPress: () => navigation.navigate('Chat', { jobId: job.id }), loading: false }
      : job.status === 'in_progress'
        ? { title: 'Mark complete', onPress: handleComplete, loading: working, disabled: uploadingMedia }
        : !job.en_route_at && !job.arrived_at
          ? { title: 'I’m on my way', onPress: () => void handleMark('en_route'), loading: marking === 'en_route', disabled: marking !== null || working }
          : !job.arrived_at
            ? { title: 'I’ve arrived', onPress: () => void handleMark('arrived'), loading: marking === 'arrived', disabled: marking !== null || working }
            : { title: 'Start job', onPress: handleStart, loading: working, disabled: marking !== null };
  // Declaring the trip is optional, never a gate: before arriving, "Start job"
  // stays one tap away under the primary — once the payment is held (A8).
  const canSkipToStart = live && job?.status === 'assigned' && !awaitingProtection && !job?.arrived_at;
  const addressLine = location?.address_line ?? null;
  // Idea 6: arriving from the reminder's Route button, the directions open once the address is known.
  const routedRef = useRef(false);
  useEffect(() => {
    if (params.intent !== 'route' || routedRef.current || !addressLine || job?.id !== params.jobId) return;
    routedRef.current = true;
    void openDirections(addressLine);
    // Once per visit; openDirections is this screen's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.intent, addressLine, job?.id]);
  const windowLabel = job ? arrivalWindowLabel(job) : null;
  const STAGES = ['On my way', 'Arrived', 'Started', 'Finished'];
  // 2026-09-27 (the Lux remake, ruling 14): the stepper's dots and connectors
  // fill with a short native-driver crossfade as the job moves on — one
  // opacity per stage, the done fill drawn over the idle ring; reduced motion
  // jumps to the end state.
  const reducedMotion = useReducedMotion();
  const stageFills = useRef(
    STAGES.map((_, index) => new Animated.Value(track >= index + 1 ? 1 : 0)),
  ).current;
  useEffect(() => {
    stageFills.forEach((fill, index) => {
      const toValue = track >= index + 1 ? 1 : 0;
      if (reducedMotion !== false) {
        fill.setValue(toValue);
        return;
      }
      Animated.timing(fill, {
        toValue,
        duration: STAGE_FILL_MS,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
    });
  }, [stageFills, track, reducedMotion]);

  // #63 — the ONE rule (payoutSetupNotice): the card path, a read status that
  // is not enabled, this held stripe row approved. Null everywhere else.
  const waitingOnSetup = payment ? payoutSetupNotice(payouts, [payment]) !== null : false;

  const paymentCard =
    isWorker && payment && job ? (
      // Idea 10: freshly protected, the card gives one soft haptic and a one-second pulse; freshly
      // released, a tick pops in beside the eyebrow with the success haptic.
      <HeldPulse paymentId={payment.id} heldAt={isHeld(payment) ? payment.held_at : null}>
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <Text style={[styles.paymentEyebrow, isDark && styles.paymentEyebrowDark, isHeld(payment) && !isReleaseRequested(payment) && !isReleased(payment) && styles.eyebrowGold]}>
          {paymentsMode === 'sandbox'
            ? isReleased(payment)
              ? 'PAYMENT RELEASED · TEST MODE'
              : isHeld(payment)
                ? 'PAYMENT PROTECTED · TEST MODE'
                : 'PAYMENT · TEST MODE'
            : isReleased(payment)
              ? 'PAYMENT RELEASED'
              : isReleaseRequested(payment)
                ? waitingOnSetup
                  ? 'APPROVED · SET UP PAYOUTS TO RECEIVE IT'
                  : 'APPROVED · PAYOUT ON ITS WAY'
                : isHeld(payment)
                  ? 'PAYMENT PROTECTED'
                  : 'PAYMENT'}
        </Text>
        {isReleased(payment) ? (
          <ReleasedTick paymentId={payment.id} releasedAt={payment.released_at} color={isDark ? colors.gold : colors.emerald} size={18} />
        ) : null}
        </View>
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
                  ? 'Released automatically after 72 hours with no response from the customer. Test mode — no real money.'
                  : 'Released automatically after 72 hours with no response from the customer.'
                : sandbox
                  ? `${clientName} approved the finished work and the funds were released. Test mode — no real money.`
                  : `${clientName} approved the finished work and the payment was released.`;
            }
            if (lifecycle === 'disputed') {
              return `${clientName} reported an issue, which holds the funds while it’s open. Sort it out together in chat — release resumes when the report is withdrawn or resolved.`;
            }
            if (isReleaseRequested(payment) && waitingOnSetup) {
              return payment.release_reason === 'auto_approved'
                ? `Approved automatically after 72 hours with no response from ${clientName}. ${PAYOUT_SETUP_NOTICE}`
                : `${clientName} approved the finished work. ${PAYOUT_SETUP_NOTICE}`;
            }
            if (isReleaseRequested(payment)) {
              return payment.release_reason === 'auto_approved'
                ? `Approved automatically after 72 hours with no response from ${clientName}. Your payout is on its way and shows as released when the transfer lands.`
                : `${clientName} approved the finished work. Your payout is on its way and shows as released when the transfer lands.`;
            }
            if (lifecycle === 'awaiting_approval') {
              return sandbox
                ? `Waiting on ${clientName} to approve the finished work. If they don’t respond within 72 hours, the funds release automatically. Test mode — no real money.`
                : `Waiting on ${clientName} to approve the finished work. If they don’t respond within 72 hours, the funds release automatically.`;
            }
            if (isHeld(payment)) {
              return sandbox
                ? `${clientName} placed the funds in protection. They’re released only after the finished work is approved — test mode, no real money.`
                : `${clientName} placed the funds in protection. They’re released only after the finished work is approved.`;
            }
            return sandbox
              ? 'Test mode — no real money moves for this job.'
              : 'The customer hasn’t paid yet. Nothing is held for this job.';
          })()}
        </Text>
        {/* #63 (M-14) — one tap to Payouts, where the setup is (it was three). */}
        {waitingOnSetup ? (
          <View style={styles.payoutNudge}>
            <PayoutNudge
              cents={workerTakeCents(payment)}
              onPress={() => navigateAcrossTabs('Profile', 'Payouts', {})}
            />
          </View>
        ) : null}
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
              {/* A2 — held is held: the money is the customer's until it is
                  released, so "paid" is never written on a held row. */}
              <Text style={styles.breakdownLabel}>
                {payment.status === 'held' ? 'Customer’s payment · held' : 'Customer paid'}
              </Text>
              <Text style={styles.breakdownValue}>
                {formatBudget(payment.charge_amount_cents)}
              </Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Protection fee</Text>
              <Text style={styles.breakdownValue}>{formatBudget(brazosFeeCents(payment))}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownStrongLabel}>You get</Text>
              <Text style={styles.breakdownStrongValue}>
                {formatBudget(workerTakeCents(payment))}
              </Text>
            </View>
          </View>
        ) : null}
      </Card>
      </HeldPulse>
    ) : null;

  return (
    // M-3 — the tab bar owns the bottom inset (tests/layout.test.mjs), so the
    // pinned bar sits flush on it rather than above a blank band.
    <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={['top']}>
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
            { padding: contentPadding, gap: contentGap },
            stageAction ? { paddingBottom: contentGap } : { paddingBottom: navClearance },
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
                  // LUX-LIST-2 #6: the lit tile in dark; light keeps the category colour.
                  isDark
                    ? [styles.iconCircleDark, litCardStyle(true, 'tile')]
                    : { backgroundColor: categoryAccent(job.category).bg },
                ]}
              >
                <CategoryGlyph
                  name={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
                  size={22}
                  color={isDark ? colors.gold : categoryAccent(job.category).icon}
                  filled
                  bare
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
            {series ? (
              <View style={styles.repeatWrap}>
                <RepeatNote series={series} perspective="worker" busy={droppingSeries} onEnd={() => void handleDropSeries()} />
              </View>
            ) : null}
          </Card>

          {live ? (
            <>
              {/* M-3 — GETTING THERE, above the fold: where, when, and the
                  person, before anything else. The address opens directions;
                  the timeline behind the two declarations stays one tap away
                  on Route & arrival. */}
              <Card style={styles.thereCard}>
                <View style={styles.thereHead}>
                  <Text style={[styles.stageEyebrow, isDark && styles.stageEyebrowDark]}>GETTING THERE</Text>
                  {/* The client, one compact tap away beside the facts. */}
                  <Pressable
                    onPress={() => navigation.navigate('Chat', { jobId: job.id })}
                    hitSlop={8}
                    style={({ pressed }) => [styles.messagePill, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Message ${clientName}`}
                  >
                    <Ionicons name="chatbubble-outline" size={15} color={colors.emerald} />
                    <Text style={styles.messagePillText}>Message</Text>
                  </Pressable>
                </View>
                {addressLine || job.location ? (
                  <Pressable
                    onPress={addressLine ? () => void openDirections(addressLine) : undefined}
                    disabled={!addressLine}
                    style={({ pressed }) => [styles.thereRow, pressed && styles.pressed]}
                    accessibilityRole={addressLine ? 'button' : undefined}
                    accessibilityLabel={addressLine ? `Directions to ${addressLine}` : undefined}
                  >
                    <Ionicons name="location-outline" size={20} color={colors.emerald} />
                    <View style={styles.thereCopy}>
                      <Text style={styles.thereText} selectable>
                        {addressLine ?? job.location}
                      </Text>
                      <Text style={styles.thereCaption}>
                        {addressLine
                          ? 'Shared: you were hired.'
                          : 'The customer hasn’t added an exact address — ask in chat.'}
                      </Text>
                    </View>
                    {addressLine ? (
                      <View style={styles.directions}>
                        <Ionicons name="navigate-outline" size={16} color={colors.emerald} />
                        <Text style={styles.directionsText}>Directions</Text>
                      </View>
                    ) : null}
                  </Pressable>
                ) : null}
                {windowLabel ? (
                  <View style={styles.thereRow}>
                    <Ionicons name="time-outline" size={20} color={colors.emerald} />
                    <View style={styles.thereCopy}>
                      <Text style={styles.thereText}>{windowLabel}</Text>
                      <Text style={styles.thereCaption}>The arrival window the customer asked for.</Text>
                    </View>
                  </View>
                ) : null}
              </Card>

              {/* M-3 — ONE STAGE BLOCK. The two cards ("Route & arrival /
                  Work checklist" and "Ready to start?") are one stepper whose
                  next step is the pinned button below. */}
              <Card style={styles.stageCard}>
                <Pressable
                  onPress={() => navigation.navigate('RouteArrival', { jobId: job.id })}
                  style={({ pressed }) => [styles.stageHead, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Arrival details"
                >
                  <View style={styles.thereCopy}>
                    <Text style={[styles.stageEyebrow, isDark && styles.stageEyebrowDark, styles.eyebrowGold]}>YOUR PROGRESS</Text>
                    <Text style={styles.stageTitle}>{lifecycle ? JOB_LIFECYCLE_LABELS[lifecycle] : ''}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
                <View style={styles.stepper}>
                  {STAGES.map((label, index) => {
                    const done = track >= index + 1;
                    const current = track === index;
                    return (
                      <View key={label} style={styles.stepperItem}>
                        <View style={styles.stepperTrack}>
                          {/* 2026-09-27 (the Lux remake, ruling 14): the done fill of each
                              connector and dot crossfades in on the native driver
                              (`stageFills`) rather than snapping. */}
                          <View style={[styles.stepperLine, index === 0 && styles.stepperLineHidden]}>
                            <Animated.View style={[styles.stepperLineFill, { opacity: stageFills[index] }]} />
                          </View>
                          <View style={[styles.stepperDot, done && styles.stepperDotDone, current && styles.stepperDotCurrent]}>
                            <Animated.View style={[styles.stepperDotFill, { opacity: stageFills[index] }]} />
                            {done ? <Ionicons name="checkmark" size={12} color={colors.onPrimary} /> : null}
                          </View>
                          <View style={[styles.stepperLine, index === STAGES.length - 1 && styles.stepperLineHidden]}>
                            <Animated.View
                              style={[styles.stepperLineFill, { opacity: stageFills[Math.min(index + 1, STAGES.length - 1)] }]}
                            />
                          </View>
                        </View>
                        <Text style={[styles.stepperLabel, (done || current) && styles.stepperLabelOn]} numberOfLines={1}>
                          {label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                {/* 2026-09-30 (idea 5): before arriving, three chips say how late — one tap tells the
                    customer and moves the arrival time; the words then say they were told. */}
                {job.status === 'assigned' && !job.arrived_at && !awaitingProtection && isLateDay(job.scheduled_date) ? (
                  <View style={styles.lateBlock}>
                    <Text style={[styles.lateLabel, job.late_minutes != null && styles.lateLabelTold]} numberOfLines={1}>
                      {job.late_minutes != null ? `${clientFirstName} was told ✓` : 'Running late?'}
                    </Text>
                    <View style={styles.lateRow}>
                    {LATE_CHOICES.map((minutes) => (
                      <Chip
                        key={minutes}
                        label={`${minutes} min`}
                        variant="filter"
                        // The Fable review: chosen the moment it is tapped (the reply only confirms it),
                        // in the same size as every other one-tap answer in the app.
                        selected={(reportingLate ?? job.late_minutes) === minutes}
                        onPress={() => void handleLate(minutes)}
                        accessibilityLabel={`Running ${minutes} minutes late`}
                        accessibilityHint={`Tells ${clientName} and moves your arrival time`}
                      />
                    ))}
                    </View>
                  </View>
                ) : null}
                <Text style={styles.stageNote}>
                  {awaitingProtection
                    ? `Waiting for ${clientName} to protect the payment. Until it’s held, sort out the details in chat.`
                    : `Each tap tells ${clientName} where things stand — nothing tracks your location.`}
                </Text>
              </Card>

              {/* M-3 — the checklist is one fixed row that never moves,
                  whatever the stage. */}
              <Pressable
                onPress={() => navigation.navigate('WorkChecklist', { jobId: job.id })}
                style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Work checklist"
              >
                <Ionicons name="list-outline" size={20} color={colors.emerald} />
                <Text style={styles.linkRowText}>Work checklist</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>

              {/* A10 (2026-10-03): the nudge at the hire — before any payment row exists — so
                  the payout account is ready by the time the money is, instead of the customer
                  watching "payout on its way" while nothing can land. Card path only; gone once
                  enabled; the held-row PayoutNudge above takes over once there is a figure. */}
              {live && paymentsMode === 'stripe' && payouts !== null && payouts !== 'enabled' && !waitingOnSetup ? (
                <Pressable
                  onPress={() => navigateAcrossTabs('Profile', 'Payouts', {})}
                  style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Set up payouts"
                  accessibilityHint="Opens Payouts so the payment can reach you"
                >
                  <Ionicons name="wallet-outline" size={20} color={colors.emerald} />
                  <Text style={styles.linkRowText}>Set up payouts so the payment can reach you</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              ) : null}

              {job.status === 'in_progress' ? (
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
                </Card>
              ) : null}

              {/* The payment drops below the stage while the job is live. */}
              {paymentCard}
            </>
          ) : (
            <>
              <Card>
                <JobProgress status={job.status} />
              </Card>

              {paymentCard}

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
            </>
          )}
        </ScrollView>

        {/* M-3 — THE ONE PINNED PRIMARY: always the next step, never two
            buttons of equal weight. */}
        {stageAction ? (
          <View style={[styles.actionBar, { paddingBottom: footerPad }]}>
            <Button
              title={stageAction.title}
              onPress={stageAction.onPress}
              loading={stageAction.loading}
              disabled={stageAction.disabled}
            />
            {canSkipToStart ? (
              <Pressable
                onPress={handleStart}
                disabled={working || marking !== null}
                hitSlop={8}
                style={({ pressed }) => [styles.skipLink, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Start job now"
              >
                <Text style={styles.skipLinkText}>Already there? Start the job</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
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
  // M-3 — the stage screen: getting there, your progress, the checklist row,
  // and the one pinned primary.
  thereCard: {
    gap: spacing.md,
  },
  thereHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  messagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messagePillText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.emerald,
  },
  thereRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  thereCopy: {
    flex: 1,
    gap: 2,
  },
  thereText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  thereCaption: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  },
  directions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  directionsText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.emerald,
  },
  stageEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: colors.eyebrow,
  },
  stageEyebrowDark: { color: colors.eyebrow },
  eyebrowGold: { color: colors.eyebrowGold }, // 2026-09-29 (LUX-LIST-2 #4): one of the 25 labels kept antique gold in light.
  stageCard: {
    gap: spacing.md,
  },
  stageHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stageTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  stepper: {
    flexDirection: 'row',
  },
  stepperItem: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  stepperTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  stepperLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.border,
  },
  stepperLineHidden: {
    backgroundColor: 'transparent',
  },
  // The done fill of a connector, crossfaded over the idle line.
  stepperLineFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.primary,
  },
  stepperDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperDotDone: {
    borderColor: colors.primary,
  },
  // The done fill of a dot, crossfaded inside its ring.
  stepperDotFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 9,
    backgroundColor: colors.primary,
  },
  stepperDotCurrent: {
    borderColor: colors.primary,
  },
  stepperLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  stepperLabelOn: {
    fontWeight: '800',
    color: colors.ink,
  },
  stageNote: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  },
  // Idea 5: the words over the three chips, so a longer "<name> was told ✓" and the chosen chip's
  // check never push a chip to a second line (the row wraps only for very large type).
  lateBlock: {
    gap: spacing.sm,
  },
  lateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  lateLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  lateLabelTold: {
    color: colors.emerald,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  linkRowText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  actionBar: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  skipLink: {
    alignSelf: 'center',
    minHeight: 36,
    justifyContent: 'center',
  },
  skipLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  pressed: {
    opacity: 0.7,
  },
  paymentCard: {
    gap: spacing.sm,
  },
  // Eyebrow law: a structural card label is gold small-caps.
  paymentEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.eyebrow,
    letterSpacing: 1.4,
  },
  paymentEyebrowDark: { color: colors.eyebrow },
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
  // #63 — the nudge sits under the note, above the breakdown.
  payoutNudge: {
    marginTop: spacing.sm,
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
    color: colors.money,
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
  // Idea 14: the repeating job's line under the price, behind the same hairline.
  repeatWrap: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  amount: {
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '800',
    color: colors.money,
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
