import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  StackActions,
  useNavigation,
  usePreventRemove,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { OfferAmountField, validateOfferAmount } from '../components/OfferComposer';
import { PhotoViewer } from '../components/PhotoViewer';
import { ScreenHeader } from '../components/ScreenHeader';
import { TextField } from '../components/TextField';
import { useAuth } from '../hooks/useAuth';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  arrivalWindowLabel,
  budgetRangeLabel,
  categoryAccent,
  createJob,
  dollarsToCents,
  fetchJobById,
  fetchJobLocation,
  formatBudget,
  JOB_CATEGORIES,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  updateJob,
  type Job,
  type JobCategory,
} from '../lib/jobs';
import {
  clearPostJobDraft,
  loadPostJobDraft,
  savePostJobDraft,
} from '../lib/postJobDraft';
import { priceGuidanceLines } from '../lib/priceGuidance';
import { descriptionCharsNeeded } from '../lib/validation';
import { createDirectOffer } from '../lib/offers';
import { alertAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { maybePromptForPush } from '../lib/pushNotifications';
import { resolveCurrentPlace } from '../lib/geolocation';
import {
  deleteJobPhoto,
  rejectionForPickedVideo,
  uploadJobAttachment,
  uploadJobVideo,
} from '../lib/storage';
import type { PostJobRouteParamList } from '../lib/navigation';
import { goBackOrHome, navigateAcrossTabs } from '../lib/navigationRef';
import {
  emeraldColorsFor,
  radius,
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';
import { MediaUploader } from '../ui/primitives';
import { SuccessScreen } from '../ui/templates/SuccessScreen';

const USE_NATIVE_DRIVER = Platform.OS !== 'web';
// Ten per the screen-13 spec; phase49 raised create_job's server cap to match.
const MAX_PHOTOS = 10;
// Screen 13 asks for ONE video ≤60s. The server still tolerates the old cap
// of two (so an already-installed build keeps working); this UI offers one.
const MAX_VIDEOS = 1;
// A minute is long enough to walk through a job and short enough to upload on
// a phone connection without the poster giving up on it.
const MAX_VIDEO_DURATION_MS = 60_000;
// Roughly a minute of phone video at default quality, with headroom. Past
// this the upload is the worst part of posting a job.
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
// Titles show as a single line (sometimes two) on job cards throughout the
// app — 80 chars is generous room for a real title while still fitting
// there without wrapping into an unreadable wall of text.
const MAX_TITLE_LENGTH = 80;
// Descriptions render full-length on the job detail screen, not truncated
// anywhere, so this only needs to block an unreasonable paste rather than
// fit a specific layout.
const MAX_DESCRIPTION_LENGTH = 500;

// Draft persistence lives in lib/postJobDraft.ts (one canonical
// implementation — My Jobs' resume-draft card reads the same record).

/**
 * The arrival windows screen 14 offers. Stored as local wall-clock hours on
 * the public jobs row — a time window doesn't identify a household the way
 * the exact address (job_private_details) does.
 */
const ARRIVAL_WINDOWS = [
  { label: 'Morning · 8–11 AM', start: 8, end: 11 },
  { label: 'Midday · 11 AM–2 PM', start: 11, end: 14 },
  { label: 'Afternoon · 2–5 PM', start: 14, end: 17 },
  { label: 'Evening · 5–8 PM', start: 17, end: 20 },
] as const;

/** How many upcoming days the date picker row offers (Today first). */
const SCHEDULE_DAYS = 14;

function toLocalIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function upcomingDates(): { iso: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: SCHEDULE_DAYS }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const label =
      i === 0
        ? 'Today'
        : i === 1
          ? 'Tomorrow'
          : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return { iso: toLocalIsoDate(d), label };
  });
}

const POST_STEPS = [
  {
    label: 'Describe',
    title: 'What needs doing?',
    subtitle: 'A clear title and a few useful details help workers decide quickly.',
  },
  {
    label: 'Media',
    title: 'Show the task',
    subtitle: 'Photos and short clips are optional, but they can make the task clearer.',
  },
  {
    label: 'Location',
    title: 'Where and when?',
    subtitle:
      'Workers browsing see only the area. The exact address stays private until you hire someone.',
  },
  {
    label: 'Review',
    title: 'Review and publish',
    subtitle: 'Check the details below. You can still go back without losing your work.',
  },
] as const;

export function PostJobScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const emeraldColors = emeraldColorsFor(colors);
  // Registered in four stacks (Home, MyJobs, Messages, Map) for posting, edit,
  // and Hire Again entry points, so its types are standalone rather than tied
  // to one stack.
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<PostJobRouteParamList, 'PostJob'>>();
  const { user } = useAuth();
  // The draft store is keyed per account (AUD-P1-07); stable for the life of
  // this screen — the authed tree unmounts before the user can change.
  const draftUserId = user?.id ?? null;

  // "Hire Again" mode — sends a private request into the conversation these
  // two already share. It does NOT create a job; the worker can accept,
  // decline or counter first (phase18).
  const hireWorkerId = params?.hireWorkerId ?? null;
  const hireWorkerName = params?.hireWorkerName ?? 'this worker';
  const isHiring = !!hireWorkerId;

  // Edit mode — reopens this same form pre-filled with an existing job's
  // details instead of creating a new one. Only ever launched from
  // ClientJobDetailScreen, which itself only shows the entry point while the
  // job has zero bids.
  const editJobId = params?.editJobId ?? null;
  const isEditing = !!editJobId;
  const [loadingJob, setLoadingJob] = useState(isEditing);

  // The only mode a local draft applies to — editing reloads from the saved
  // job, and a hire request is a single quick action with nothing worth
  // resuming.
  const isFreshPost = !isEditing && !isHiring;
  // Gates the autosave effect until the one-time restore-or-skip check below
  // finishes, so autosave can never race ahead of it and overwrite a
  // not-yet-read draft with the screen's still-blank initial state.
  const [draftReady, setDraftReady] = useState(false);

  // Home's "Post a job" CTA, search field, and category chips all funnel into
  // this one screen rather than each having their own draft flow — these seed
  // a fresh post with whatever the customer already entered there. Ignored by
  // edit mode, which overwrites them from the saved job right below.
  const [title, setTitle] = useState(params?.initialTitle ?? '');
  const [description, setDescription] = useState(params?.initialDescription ?? '');
  const [category, setCategory] = useState<JobCategory | null>(
    params?.initialCategory ?? null
  );
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  // The hire flow's single offer amount. Fresh posts and edits use the
  // MIN/MAX range below instead (screen 15). "Book at listed price" (§6.2)
  // seeds it with the service's stored cents; the field stays fully editable
  // and the send still passes the composer validation + ceiling mirror.
  const [budget, setBudget] = useState(
    params?.hireWorkerId && params?.initialAmountCents != null
      ? String(params.initialAmountCents / 100)
      : ''
  );
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  // Exact service address — job_private_details on publish, never public.
  const [address, setAddress] = useState('');
  const [scheduledDate, setScheduledDate] = useState<string | null>(null);
  const [arrivalStartHour, setArrivalStartHour] = useState<number | null>(null);
  const [arrivalEndHour, setArrivalEndHour] = useState<number | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [videos, setVideos] = useState<string[]>([]);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  // The row `createJob` actually saved, so the success state can show real
  // published details instead of restating the form. Fresh posts only —
  // edit/hire-again success doesn't reference a newly created job.
  const [publishedJob, setPublishedJob] = useState<Job | null>(null);
  const [step, setStep] = useState(0);
  // §3.4 photo nudge — dismissal is part of the draft, never a global setting.
  const [photoNudgeDismissed, setPhotoNudgeDismissed] = useState(false);
  // Focus state for the two budget fields, so the typical-range guidance can
  // step aside while an amount is actually being typed (§3.2).
  const [budgetFocused, setBudgetFocused] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  // The amount an offer is about to be sent at, held while the confirmation
  // is open. Null means nothing is pending.
  const [confirmOfferCents, setConfirmOfferCents] = useState<number | null>(null);

  const successScale = useRef(new Animated.Value(0.4)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  // Render-state disabling is useful feedback, but the ref is the actual
  // guard against two fast taps entering an async write before React paints.
  const submittingRef = useRef(false);
  // Uploads begin before the job is saved. Track only files added during this
  // visit so backing out can clean them up without touching edit-mode media.
  const sessionUploadsRef = useRef<Set<string>>(new Set());
  const uploadsCommittedRef = useRef(false);
  const screenMountedRef = useRef(true);

  function cleanupSessionUploads() {
    for (const url of sessionUploadsRef.current) {
      deleteJobPhoto(url).then(({ error }) => {
        if (error) console.error('[PostJobScreen] orphan media cleanup failed', error);
      });
    }
  }

  useEffect(() => {
    screenMountedRef.current = true;
    return () => {
      screenMountedRef.current = false;
      // Never race a still-running RPC by deleting files it may successfully
      // commit. The async write paths clean these up after a failed result if
      // the screen was removed while the request was in flight.
      if (!uploadsCommittedRef.current && !submittingRef.current) {
        cleanupSessionUploads();
        // A graceful unmount (Back out of the wizard) is a deliberate
        // abandonment, same as it always was — and now that a draft can
        // persist, the abandoned draft must go with it, or a later "Post a
        // job" would restore text pointing at photos this just deleted. An
        // app KILL never reaches this line at all (the process is gone
        // before any unmount effect runs), which is exactly what leaves the
        // persisted draft in place for the Phase 4 DoD.
        if (isFreshPost && draftUserId) void clearPostJobDraft(draftUserId);
      }
      successScale.stopAnimation();
      successOpacity.stopAnimation();
    };
    // isFreshPost is derived once from route params and never changes across
    // this screen's life, so it is safe to read without being a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successOpacity, successScale]);

  // Restore an in-progress fresh-post draft so it survives an app kill
  // (Phase 4 DoD). Skipped for edit (its source of truth is the saved job)
  // and hire (nothing worth resuming). Also skipped when the route already
  // seeded specific fields — Home's search box / category chips are an
  // explicit fresh start and should win over a stale draft, not be silently
  // overridden by it.
  useEffect(() => {
    if (!isFreshPost) {
      setDraftReady(true);
      return;
    }
    const hasRouteSeed = !!(
      params?.initialTitle ||
      params?.initialDescription ||
      params?.initialCategory
    );
    if (hasRouteSeed) {
      setDraftReady(true);
      return;
    }

    if (!draftUserId) {
      // No authenticated user means no per-account slot to read. Unreachable
      // inside the authed tree, but the honest answer is "no draft", never a
      // guessed one.
      setDraftReady(true);
      return;
    }

    let active = true;
    (async () => {
      const draft = await loadPostJobDraft(draftUserId);
      if (!active) return;
      if (draft) {
        setTitle(draft.title);
        setDescription(draft.description);
        setCategory(draft.category);
        setLocation(draft.location);
        setCoords(draft.coords);
        setBudgetMin(draft.budgetMin);
        setBudgetMax(draft.budgetMax);
        setAddress(draft.address);
        // A date that slipped into the past while the draft sat idle is
        // dropped rather than restored — publishing yesterday is never right.
        // ISO date strings compare lexicographically.
        setScheduledDate(
          draft.scheduledDate && draft.scheduledDate >= toLocalIsoDate(new Date())
            ? draft.scheduledDate
            : null
        );
        setArrivalStartHour(draft.arrivalStartHour);
        setArrivalEndHour(draft.arrivalEndHour);
        setPhotos(draft.photos);
        setVideos(draft.videos);
        setStep(Math.min(draft.step, POST_STEPS.length - 1));
        setPhotoNudgeDismissed(draft.photoNudgeDismissed);
        // A restored draft's media belongs to no saved job (the job does not
        // exist yet), so it follows the same rule as a photo added this
        // session: removing it — or abandoning the draft again — deletes it
        // from storage instead of leaking it forever.
        for (const url of draft.photos) sessionUploadsRef.current.add(url);
        for (const url of draft.videos) sessionUploadsRef.current.add(url);
      }
      if (active) setDraftReady(true);
    })();

    return () => {
      active = false;
    };
    // Runs once on mount only — this is a one-time restore, not a sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave, once the restore-or-skip check above has finished. Fresh-post
  // only; edit/hire never read or write this key.
  useEffect(() => {
    if (!isFreshPost || !draftReady || !draftUserId) return;
    void savePostJobDraft(draftUserId, {
      title,
      description,
      category,
      location,
      coords,
      budgetMin,
      budgetMax,
      address,
      scheduledDate,
      arrivalStartHour,
      arrivalEndHour,
      photos,
      videos,
      step,
      photoNudgeDismissed,
    });
  }, [isFreshPost, draftReady, draftUserId, title, description, category, location, coords, budgetMin, budgetMax, address, scheduledDate, arrivalStartHour, arrivalEndHour, photos, videos, step, photoNudgeDismissed]);

  // Header Back, Android Back, and the iOS edge gesture all mean the same
  // thing inside the wizard: move back one step. A write in flight cannot be
  // removed from the stack, which also protects its referenced uploads.
  usePreventRemove(submitting || (step > 0 && !showSuccess), () => {
    if (!submitting) setStep((current) => Math.max(0, current - 1));
  });

  // Photo URLs this job already had saved when editing started. Removing one
  // of these from the picker is a draft change — the underlying file must
  // stay in storage until (and unless) the edit is actually saved, since the
  // still-live job row keeps referencing it until then. A photo NOT in this
  // set was added during the current session and was never saved anywhere,
  // so it's safe to delete from storage the moment it's removed. Stays empty
  // for a brand-new (non-editing) post, where nothing is pre-existing.
  const originalPhotosRef = useRef<Set<string>>(new Set());
  /** Same rule as originalPhotosRef, for the posting's videos. */
  const originalVideosRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!editJobId) return;
    let active = true;

    (async () => {
      const [{ data: job, error }, { data: loc, error: locationError }] = await Promise.all([
        fetchJobById(editJobId),
        fetchJobLocation(editJobId),
      ]);
      if (!active) return;

      if (error || !job) {
        await alertAsync(
          'Could not load job',
          userMessage(error, 'This job may have been deleted.')
        );
        goBackOrHome();
        return;
      }

      // Saving null coordinates intentionally removes a job_locations row.
      // If this read failed, stop instead of turning a transient fetch problem
      // into silent deletion of the poster's existing map pin.
      if (locationError) {
        await alertAsync(
          'Could not load job location',
          'Please try editing again so the existing map location stays intact.'
        );
        goBackOrHome();
        return;
      }

      setTitle(job.title);
      setDescription(job.description);
      setCategory(job.category);
      setLocation(job.location ?? '');
      setBudgetMin(job.budget_min_cents != null ? String(job.budget_min_cents / 100) : '');
      // A pre-range job's single budget re-opens in the MAX slot — the same
      // slot the server mirrors a range's ceiling into.
      setBudgetMax(
        job.budget_max_cents != null
          ? String(job.budget_max_cents / 100)
          : job.budget_cents != null
            ? String(job.budget_cents / 100)
            : ''
      );
      setScheduledDate(job.scheduled_date);
      setArrivalStartHour(job.arrival_start_hour);
      setArrivalEndHour(job.arrival_end_hour);
      setPhotos(job.photos);
      originalPhotosRef.current = new Set(job.photos);
      setVideos(job.videos);
      originalVideosRef.current = new Set(job.videos);
      if (loc) {
        if (loc.lat != null && loc.lng != null) setCoords({ lat: loc.lat, lng: loc.lng });
        setAddress(loc.address_line ?? '');
      }
      setLoadingJob(false);
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editJobId]);

  function playSuccess() {
    successScale.setValue(reducedMotion ? 1 : 0.4);
    successOpacity.setValue(reducedMotion ? 1 : 0);
    setShowSuccess(true);
    if (reducedMotion) return;
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
  }

  function leaveAfterSuccess(viewMyJobs: boolean) {
    setShowSuccess(false);
    if (isEditing) {
      // Edit can be launched from Home, My Jobs, or Map. Returning to the
      // originating detail route works in every stack, and its focus hook
      // immediately reloads the canonical saved row.
      goBackOrHome();
      return;
    }
    if (isHiring) {
      goBackOrHome();
      return;
    }

    // Unwind the source stack too. Otherwise a post launched from discovery
    // remains hidden at the top of Home and reappears when the tab is revisited.
    navigation.dispatch(StackActions.popToTop());
    // `HomeMain` is the CUSTOMER tree's Home root. PostJob is registered in the
    // shared MyJobs/Messages/Map/Profile stacks too, so a worker-mode account
    // genuinely reaches this line — and in worker mode the Home stack is
    // WorkerHome/WorkerResults/JobDetail/..., which cannot apply 'HomeMain'.
    // The fallback lands on the Home tab's own root, i.e. Worker Home there and
    // Customer Home here. `pop: true` keeps React Navigation 7 from appending
    // another copy of the root route, so device Back cannot reveal the
    // completed posting wizard or the stale discovery screen behind it.
    navigateAcrossTabs(
      viewMyJobs ? 'MyJobs' : 'Home',
      viewMyJobs ? 'MyJobsHub' : 'HomeMain',
      undefined,
      { pop: true, fallbackToTabRoot: true }
    );
  }

  /**
   * Screen 16's "View job and bids": straight to the published job's own
   * detail screen (ClientJobDetail, registered in the shared MyJobs stack),
   * which shows its real — currently zero — bids. Same stack unwinding as
   * leaveAfterSuccess so device Back can't resurface the finished wizard.
   */
  function leaveToPublishedJob() {
    if (!publishedJob) {
      leaveAfterSuccess(true);
      return;
    }
    setShowSuccess(false);
    navigation.dispatch(StackActions.popToTop());
    // MyJobs is a shared tab and registers ClientJobDetail in both trees, so
    // this one was never mode-fragile — it goes through the same helper anyway
    // so there is exactly one way to cross tabs and no second pattern for the
    // next caller to copy.
    navigateAcrossTabs('MyJobs', 'ClientJobDetail', { job: publishedJob }, { pop: true });
  }

  async function handleUseCurrentLocation() {
    setLocating(true);
    const result = await resolveCurrentPlace();
    if (!screenMountedRef.current) return;
    setLocating(false);

    if (!result.ok) {
      await alertAsync('Location unavailable', result.message);
      return;
    }
    setCoords({ lat: result.place.lat, lng: result.place.lng });
    // The label is empty when both geocode tiers failed (never raw
    // coordinates — lib/geolocation.ts). Keep whatever the user typed and
    // ask for an area name rather than blanking the field.
    if (result.place.label) {
      setLocation(result.place.label);
    } else {
      await alertAsync(
        'Area name needed',
        "We saved your map location, but couldn't turn it into an area name. Type the neighborhood or area in yourself."
      );
    }
  }

  /**
   * The MediaUploader upload callbacks. The primitive owns the pick and the
   * append-only-on-success rule (§N risk 9); these own what is specific to
   * this screen — which bucket, the session-uploads bookkeeping that lets
   * backing out clean up, and the unmounted-mid-upload race (delete the file
   * rather than strand it, since unmount cleanup already ran without it).
   */
  async function handleUploadPhoto(asset: ImagePickerAsset) {
    if (!user) return { url: null, error: new Error('Sign in to add media') };
    setUploadingPhoto(true);
    const { url, error } = await uploadJobAttachment(user.id, asset);
    setUploadingPhoto(false);
    if (!screenMountedRef.current) {
      if (url) void deleteJobPhoto(url);
      return { url: null, error: null };
    }
    if (url) sessionUploadsRef.current.add(url);
    return { url: url ?? null, error: (error as Error | null) ?? null };
  }

  async function handleUploadVideo(asset: ImagePickerAsset) {
    if (!user) return { url: null, error: new Error('Sign in to add media') };
    setUploadingVideo(true);
    const { url, error } = await uploadJobVideo(user.id, asset);
    setUploadingVideo(false);
    if (!screenMountedRef.current) {
      if (url) void deleteJobPhoto(url);
      return { url: null, error: null };
    }
    if (url) sessionUploadsRef.current.add(url);
    return { url: url ?? null, error: (error as Error | null) ?? null };
  }

  /**
   * Removal cleanup, photos and videos alike (one storage path). Only ever
   * called for media MediaUploader was told is removable — the
   * shouldDeleteOnRemove props below encode the ownership rule: everything
   * in a fresh post or restored draft (saved on no job row yet), and only
   * this session's additions in edit mode (the live row still references
   * its original media until the edit saves).
   */
  async function handleDeleteMedia(url: string) {
    const { error } = await deleteJobPhoto(url);
    if (error) console.error('[PostJobScreen] deleteJobPhoto failed', error);
    else sessionUploadsRef.current.delete(url);
    return { error };
  }

  /**
   * The confirmed half of sending a direct offer. Creates NO job: it posts a
   * private offer into whichever conversation these two have — a shared job's
   * thread, or (phase36) the pair's direct thread, created on the spot if they
   * have never spoken. A job only exists if the worker accepts, or they settle
   * on a counter.
   */
  async function sendOffer(amountCents: number) {
    // handleSubmit validated all of these before opening the confirmation;
    // re-checking keeps this callable on its own terms rather than depending
    // on that having happened.
    if (!user || !hireWorkerId || !category || submittingRef.current) return;

    submittingRef.current = true;
    setSubmitting(true);
    const { error: requestError } = await createDirectOffer({
      workerId: hireWorkerId,
      title: title.trim(),
      description: description.trim(),
      category,
      location: location.trim(),
      amountCents,
      photos,
      videos,
      coords,
      threadJobId: params?.threadJobId ?? null,
    });
    submittingRef.current = false;

    if (requestError) {
      if (!screenMountedRef.current) {
        cleanupSessionUploads();
        return;
      }
      setSubmitting(false);
      setConfirmOfferCents(null);
      await alertAsync('Could not send offer', userMessage(requestError));
      return;
    }
    uploadsCommittedRef.current = true;
    if (!screenMountedRef.current) return;
    setSubmitting(false);
    setConfirmOfferCents(null);
    maybePromptForPush(
      'Get told the moment they accept, decline, or counter your offer.'
    );
    playSuccess();
  }

  async function handleSubmit() {
    if (!user || submittingRef.current) return;

    if (!title.trim() || !description.trim() || !category || !location.trim()) {
      await alertAsync(
        'Missing details',
        'Title, description, category, and location are all required.'
      );
      return;
    }

    // Hire mode negotiates a single amount; fresh posts and edits carry the
    // MIN/MAX range (screen 15).
    const budgetMinCents = dollarsToCents(budgetMin);
    const budgetMaxCents = dollarsToCents(budgetMax);
    let budgetCents: number | null = dollarsToCents(budget);
    if (isHiring) {
      // Shared with every other offer form (OfferComposer): a hire request
      // opens with a proposed price, so a blank or non-positive amount is
      // refused with the same rule bids and counters apply.
      const { amountCents, problem } = validateOfferAmount(budget);
      if (problem || amountCents == null) {
        await alertAsync(
          'Check your offer',
          problem === 'Enter an amount.'
            ? `Enter the amount you'd like to offer ${hireWorkerName}. They can accept or counter.`
            : problem ?? 'Enter an amount.'
        );
        return;
      }
      budgetCents = amountCents;
    } else {
      if (Number.isNaN(budgetMinCents) || Number.isNaN(budgetMaxCents)) {
        await alertAsync('Invalid budget', 'Budget amounts must be positive dollar amounts.');
        return;
      }
      if (budgetMinCents != null && budgetMaxCents != null && budgetMinCents > budgetMaxCents) {
        await alertAsync('Check your budget range', 'The minimum cannot be more than the maximum.');
        return;
      }
    }

    // Sending an offer puts a real, priced commitment in front of a specific
    // person, so it gets a confirmation naming the amount and the recipient
    // before it goes. sendOffer() below is the confirmed half.
    if (isHiring && !isEditing) {
      setConfirmOfferCents(budgetCents!);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    // The server mirrors the range's ceiling into the legacy single
    // budget_cents, so nothing is passed for it here — one writer, one rule.
    const jobInput = {
      title: title.trim(),
      description: description.trim(),
      category,
      location: location.trim(),
      budgetCents: null,
      budgetMinCents,
      budgetMaxCents,
      scheduledDate,
      arrivalStartHour,
      arrivalEndHour,
      addressLine: address.trim() || null,
      photos,
      videos,
      coords,
    };
    const { data: savedJob, error, locationError } = isEditing
      ? await updateJob(editJobId!, jobInput)
      : await createJob(user.id, jobInput);
    submittingRef.current = false;

    if (error) {
      if (!screenMountedRef.current) {
        cleanupSessionUploads();
        return;
      }
      setSubmitting(false);
      await alertAsync(
        isEditing ? 'Could not save changes' : 'Could not post job',
        userMessage(error)
      );
      return;
    }
    uploadsCommittedRef.current = true;
    if (!screenMountedRef.current) return;
    setSubmitting(false);
    if (locationError) {
      // The job saved fine; only the map pin is missing. Include the real
      // reason (already logged in createJob/updateJob) so it's actually
      // diagnosable instead of just "something went wrong".
      await alertAsync(
        'Saved, but without a map pin',
        `${isEditing ? 'Your changes were saved' : 'Your job is live'}, but we couldn't save its location for the map: ${userMessage(locationError)}`
      );
    }

    // Now that the save actually succeeded, any original photo the user
    // removed during this edit is genuinely orphaned (the job row no longer
    // references it) rather than just provisionally dropped — clean those up
    // too, the same way a freshly-added-then-removed photo already was.
    if (isEditing) {
      for (const url of originalPhotosRef.current) {
        if (photos.includes(url)) continue;
        deleteJobPhoto(url).then(({ error }) => {
          if (error) console.error('[PostJobScreen] deleteJobPhoto failed', error);
        });
      }
      for (const url of originalVideosRef.current) {
        if (videos.includes(url)) continue;
        deleteJobPhoto(url).then(({ error }) => {
          if (error) console.error('[PostJobScreen] deleteJobPhoto (video) failed', error);
        });
      }
    }

    // First good moment to ask: they've just posted work and have a concrete
    // reason to want alerts. Only on a genuinely new post — editing an
    // existing job isn't the same moment. Deliberately not awaited so the
    // success animation isn't held up behind a dialog.
    if (!isEditing) {
      maybePromptForPush('Get told the moment a worker bids on your job.');
      if (savedJob) setPublishedJob(savedJob);
      // Published — nothing left to resume. Uploads are already marked
      // committed above, so this only removes the now-stale draft record.
      if (draftUserId) void clearPostJobDraft(draftUserId);
    }

    playSuccess();
  }

  async function handleContinue() {
    if (step === 0 && (!title.trim() || !description.trim() || !category)) {
      await alertAsync(
        'Complete this step',
        'Add a title, description, and category before continuing.'
      );
      return;
    }
    if (step === 2 && !location.trim()) {
      await alertAsync('Add an area', 'Enter the area or neighborhood where the job is located.');
      return;
    }
    setStep((current) => Math.min(current + 1, POST_STEPS.length - 1));
  }

  function handleBack() {
    if (submittingRef.current) return;
    if (step > 0) {
      setStep((current) => Math.max(0, current - 1));
      return;
    }
    goBackOrHome();
  }

  const currentStep = POST_STEPS[step];
  const currentStepTitle =
    step === POST_STEPS.length - 1
      ? isEditing
        ? 'Review your changes'
        : isHiring
          ? 'Review and send'
          : currentStep.title
      : currentStep.title;
  const currentStepSubtitle =
    step === 1 && isHiring
      ? 'Photos and short clips are optional, but they can make your request clearer.'
      : step === POST_STEPS.length - 1 && (isEditing || isHiring)
        ? 'Check the details below. You can still go back without losing your work.'
        : currentStep.subtitle;
  const reviewBudgetCents = dollarsToCents(budget);
  const reviewMinCents = dollarsToCents(budgetMin);
  const reviewMaxCents = dollarsToCents(budgetMax);
  const validMin =
    reviewMinCents != null && !Number.isNaN(reviewMinCents) ? reviewMinCents : null;
  const validMax =
    reviewMaxCents != null && !Number.isNaN(reviewMaxCents) ? reviewMaxCents : null;
  const reviewBudget = isHiring
    ? reviewBudgetCents != null && !Number.isNaN(reviewBudgetCents)
      ? formatBudget(reviewBudgetCents)
      : 'Required before sending'
    : validMin != null || validMax != null
      ? budgetRangeLabel({
          budget_cents: null,
          budget_min_cents: validMin,
          budget_max_cents: validMax,
        })
      : 'Open to bids';
  const reviewTiming =
    arrivalWindowLabel({
      scheduled_date: scheduledDate,
      arrival_start_hour: arrivalStartHour,
      arrival_end_hour: arrivalEndHour,
    }) ?? 'Flexible';
  const scheduleDates = upcomingDates();

  // §3 conversion aids — fresh posts only. Edit keeps legacy content legal
  // (no floor retro-applied to an old description) and a hire request is a
  // negotiated single amount, not a budget to be guided.
  const descNeeded = isFreshPost ? descriptionCharsNeeded(description) : 0;
  const guidanceLines = isFreshPost ? priceGuidanceLines(category) : null;
  const bothBudgetsEmpty = !budgetMin.trim() && !budgetMax.trim();
  const showPriceGuidance = !!guidanceLines && (bothBudgetsEmpty || !budgetFocused);
  const showPhotoNudge =
    isFreshPost && step === 1 && photos.length === 0 && !photoNudgeDismissed;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title={isEditing ? 'Edit Job' : isHiring ? 'Send an Offer' : 'Post a Job'}
        onBack={handleBack}
        palette={emeraldColors}
      />

      {loadingJob ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.emerald} />
        </View>
      ) : (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.stepIntro}>
            <Text style={styles.stepEyebrow}>
              STEP {step + 1} OF {POST_STEPS.length}
            </Text>
            <Text style={styles.stepTitle}>{currentStepTitle}</Text>
            <Text style={styles.stepSubtitle}>{currentStepSubtitle}</Text>

            <View
              style={styles.progressRow}
              accessible
              accessibilityLabel={`Step ${step + 1} of ${POST_STEPS.length}: ${currentStep.label}`}
            >
              {POST_STEPS.map((item, index) => (
                <View key={item.label} style={styles.progressItem}>
                  <View
                    style={[
                      styles.progressSegment,
                      index <= step && styles.progressSegmentActive,
                    ]}
                  />
                  <Text
                    style={[
                      styles.progressLabel,
                      index === step && styles.progressLabelActive,
                    ]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {isHiring && (
            <View style={styles.hireBanner}>
              <Ionicons name="person-add-outline" size={18} color={colors.emerald} />
              <Text style={styles.hireBannerText}>
                {hireWorkerName} will get this as a request in your chat. They can accept, decline, or suggest a different price.
              </Text>
            </View>
          )}

          {step === 0 && (
            <View style={styles.stepFields}>
              <TextField
                palette={emeraldColors}
                label="Title"
                value={title}
                onChangeText={setTitle}
                hint={`${title.length}/${MAX_TITLE_LENGTH}`}
                maxLength={MAX_TITLE_LENGTH}
                placeholder="e.g. Walk my dog on weekday mornings"
                autoCapitalize="sentences"
              />

              <TextField
                palette={emeraldColors}
                label="Description"
                value={description}
                onChangeText={setDescription}
                hint={`${description.length}/${MAX_DESCRIPTION_LENGTH}`}
                maxLength={MAX_DESCRIPTION_LENGTH}
                placeholder="Describe what you need done…"
                autoCapitalize="sentences"
                multiline
                numberOfLines={4}
                style={styles.multiline}
              />
              {/* §3.3 — the floor is a disabled Continue plus this written
                  count, never a raw error and never a silently dead button. */}
              {descNeeded > 0 ? (
                <Text style={styles.floorHint}>
                  {descNeeded} more {descNeeded === 1 ? 'character' : 'characters'} needed
                  before you can continue.
                </Text>
              ) : null}
            </View>
          )}

          {step === 1 && (
            <View style={styles.stepFields}>
              <View style={styles.infoCard}>
                <View style={styles.infoIcon}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={colors.emerald} />
                </View>
                <Text style={styles.infoText}>
                  Media appears with your {isHiring ? 'request' : 'job'} so workers can
                  understand the task. Avoid faces, documents, or anything private.
                </Text>
              </View>

              {/* The one canonical MediaUploader primitive (§O never-duplicate
                  list; §N risk 9). It owns the pick + append-only-on-success
                  rule; this screen supplies the bucket calls and the
                  ownership rule for removals. */}
              <MediaUploader
                kind="photo"
                label="Photos (optional)"
                // A hire request goes through create_offer(), whose server
                // cap is still 5 (Phase 5 owns the offer RPCs); only the
                // posting path's create_job() was raised to 10 in phase49.
                maxItems={isHiring ? 5 : MAX_PHOTOS}
                items={photos}
                onItemsChange={setPhotos}
                disabled={submitting || !user}
                onUpload={handleUploadPhoto}
                onDelete={handleDeleteMedia}
                shouldDeleteOnRemove={(url) => !originalPhotosRef.current.has(url)}
                onPressItem={(url) => setViewerUri(url)}
                onUploadError={(message) => void alertAsync('Photo upload failed', message)}
              />

              <View style={styles.field}>
                <MediaUploader
                  kind="video"
                  label="Video (optional)"
                  maxItems={MAX_VIDEOS}
                  items={videos}
                  onItemsChange={setVideos}
                  disabled={submitting || !user}
                  onUpload={handleUploadVideo}
                  onDelete={handleDeleteMedia}
                  shouldDeleteOnRemove={(url) => !originalVideosRef.current.has(url)}
                  validate={(asset) =>
                    rejectionForPickedVideo(asset, {
                      maxDurationMs: MAX_VIDEO_DURATION_MS,
                      maxBytes: MAX_VIDEO_BYTES,
                    })
                  }
                  videoMaxDurationSec={MAX_VIDEO_DURATION_MS / 1000}
                  onUploadError={(message) => void alertAsync('Video upload failed', message)}
                />
                <Text style={styles.fieldHint}>
                  Up to {MAX_VIDEO_DURATION_MS / 1000} seconds. A short clip explains an
                  awkward job faster than a paragraph.
                </Text>
              </View>
            </View>
          )}

          {step === 0 && (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.chips}>
                {/* D2: the saturated per-category palette is retired in dark
                    wherever a category is drawn. Light keeps it. */}
                {JOB_CATEGORIES.map((c) => (
                  <Chip
                    key={c}
                    label={JOB_CATEGORY_LABELS[c]}
                    icon={JOB_CATEGORY_ICONS[c]}
                    accentColor={isDark ? colors.gold : categoryAccent(c).bg}
                    variant="filter"
                    selected={category === c}
                    onPress={() => setCategory(c)}
                  />
                ))}
              </View>
            </View>
          )}

          {step === 2 && (
            <View style={styles.stepFields}>
              <View style={styles.locationRow}>
                <View style={styles.locationField}>
                  <TextField
                    palette={emeraldColors}
                    label="Area or neighborhood"
                    value={location}
                    onChangeText={(text) => {
                      setLocation(text);
                      // Typing over a resolved place invalidates its coordinates.
                      if (coords) setCoords(null);
                    }}
                    placeholder="e.g. Sheepshead Bay, Brooklyn"
                    autoCapitalize="words"
                  />
                </View>
                <Pressable
                  onPress={handleUseCurrentLocation}
                  disabled={locating}
                  style={({ pressed }) => [
                    styles.locationBtn,
                    pressed && styles.locationBtnPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Use my current location"
                >
                  {locating ? (
                    <ActivityIndicator size="small" color={colors.onForest} />
                  ) : (
                    <Ionicons name="location" size={20} color={colors.onForest} />
                  )}
                </Pressable>
              </View>

              <View style={styles.infoCard}>
                <View style={styles.infoIcon}>
                  <Ionicons name="location-outline" size={20} color={colors.emerald} />
                </View>
                <Text style={styles.infoText}>
                  Your listing shows the area you enter. When a map point is available,
                  its precise coordinates stay in protected job-location data.
                </Text>
              </View>

              {/* The exact address and timing are meaningless for a direct
                  offer (the negotiation carries its own terms — Phase 5's
                  surface), so hire mode keeps the plain location step. */}
              {!isHiring && (
                <>
                  <TextField
                    palette={emeraldColors}
                    label="Service address (private, optional)"
                    value={address}
                    onChangeText={setAddress}
                    placeholder="e.g. 2410 Emmons Ave, Apt 3B"
                    autoCapitalize="words"
                    hint="Never shown while workers browse. Only you — and the worker you hire — can see it."
                  />

                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Which day?</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chipRow}
                      keyboardShouldPersistTaps="handled"
                    >
                      <Chip
                        label="Flexible"
                        variant="filter"
                        selected={scheduledDate == null}
                        onPress={() => setScheduledDate(null)}
                      />
                      {scheduleDates.map((d) => (
                        <Chip
                          key={d.iso}
                          label={d.label}
                          variant="filter"
                          selected={scheduledDate === d.iso}
                          onPress={() => setScheduledDate(d.iso)}
                        />
                      ))}
                    </ScrollView>
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Arrival window</Text>
                    <View style={styles.chips}>
                      <Chip
                        label="Flexible"
                        variant="filter"
                        selected={arrivalStartHour == null}
                        onPress={() => {
                          setArrivalStartHour(null);
                          setArrivalEndHour(null);
                        }}
                      />
                      {ARRIVAL_WINDOWS.map((w) => (
                        <Chip
                          key={w.label}
                          label={w.label}
                          variant="filter"
                          selected={arrivalStartHour === w.start && arrivalEndHour === w.end}
                          onPress={() => {
                            setArrivalStartHour(w.start);
                            setArrivalEndHour(w.end);
                          }}
                        />
                      ))}
                    </View>
                  </View>
                </>
              )}
            </View>
          )}

          {step === 3 && (
            <View style={styles.stepFields}>
              {isHiring ? (
                // The direct-offer terms field is OfferComposer's shared one
                // (Phase 5): bids, counters and this hire request present and
                // validate an offer amount identically.
                <OfferAmountField
                  palette={emeraldColors}
                  label="Your offer ($)"
                  value={budget}
                  onChangeText={setBudget}
                  hint={`${hireWorkerName} can accept or suggest a different price.`}
                />
              ) : (
                <View style={styles.field}>
                  {/* §3.2 — static typical range for the chosen category.
                      Steps aside while an amount is being typed; categories
                      with no seeded range render nothing. No locality claim:
                      the table is static and cannot support one. */}
                  {showPriceGuidance && guidanceLines ? (
                    <View style={styles.guidanceCard}>
                      <Text style={styles.guidanceRange}>{guidanceLines[0]}</Text>
                      <Text style={styles.guidanceNote}>{guidanceLines[1]}</Text>
                    </View>
                  ) : null}
                  <View style={styles.budgetRow}>
                    <View style={styles.budgetField}>
                      <TextField
                        palette={emeraldColors}
                        label="Min budget ($)"
                        value={budgetMin}
                        onChangeText={setBudgetMin}
                        placeholder="e.g. 40"
                        keyboardType="numeric"
                        onFocus={() => setBudgetFocused(true)}
                        onBlur={() => setBudgetFocused(false)}
                      />
                    </View>
                    <View style={styles.budgetField}>
                      <TextField
                        palette={emeraldColors}
                        label="Max budget ($)"
                        value={budgetMax}
                        onChangeText={setBudgetMax}
                        placeholder="e.g. 60"
                        keyboardType="numeric"
                        onFocus={() => setBudgetFocused(true)}
                        onBlur={() => setBudgetFocused(false)}
                      />
                    </View>
                  </View>
                  <Text style={styles.fieldHint}>
                    Both optional — leave them blank if you want workers to propose a
                    price. A range helps workers bid inside what you expect.
                  </Text>
                </View>
              )}

              <View style={styles.reviewCard}>
                <Text style={styles.reviewEyebrow}>JOB SUMMARY</Text>
                <Text style={styles.reviewTitle}>{title.trim()}</Text>
                <Text style={styles.reviewDescription} numberOfLines={4}>
                  {description.trim()}
                </Text>

                <View style={styles.reviewDivider} />

                <View style={styles.reviewRow}>
                  <View style={styles.reviewIcon}>
                    <Ionicons name="grid-outline" size={18} color={colors.emerald} />
                  </View>
                  <View style={styles.reviewText}>
                    <Text style={styles.reviewLabel}>Category</Text>
                    <Text style={styles.reviewValue} numberOfLines={1}>
                      {category ? JOB_CATEGORY_LABELS[category] : 'Not selected'}
                    </Text>
                  </View>
                </View>

                <View style={styles.reviewRow}>
                  <View style={styles.reviewIcon}>
                    <Ionicons name="location-outline" size={19} color={colors.emerald} />
                  </View>
                  <View style={styles.reviewText}>
                    <Text style={styles.reviewLabel}>Area</Text>
                    <Text style={styles.reviewValue} numberOfLines={2}>
                      {location.trim()}
                    </Text>
                  </View>
                </View>

                <View style={styles.reviewRow}>
                  <View style={styles.reviewIcon}>
                    <Ionicons name="images-outline" size={18} color={colors.emerald} />
                  </View>
                  <View style={styles.reviewText}>
                    <Text style={styles.reviewLabel}>Media</Text>
                    <Text style={styles.reviewValue}>
                      {photos.length} {photos.length === 1 ? 'photo' : 'photos'} ·{' '}
                      {videos.length} {videos.length === 1 ? 'clip' : 'clips'}
                    </Text>
                  </View>
                </View>

                {!isHiring && (
                  <View style={styles.reviewRow}>
                    <View style={styles.reviewIcon}>
                      <Ionicons name="time-outline" size={18} color={colors.emerald} />
                    </View>
                    <View style={styles.reviewText}>
                      <Text style={styles.reviewLabel}>Timing</Text>
                      <Text style={styles.reviewValue} numberOfLines={2}>
                        {reviewTiming}
                      </Text>
                    </View>
                  </View>
                )}

                {!isHiring && address.trim() ? (
                  <View style={styles.reviewRow}>
                    <View style={styles.reviewIcon}>
                      <Ionicons name="lock-closed-outline" size={18} color={colors.emerald} />
                    </View>
                    <View style={styles.reviewText}>
                      <Text style={styles.reviewLabel}>Address (private)</Text>
                      <Text style={styles.reviewValue} numberOfLines={2}>
                        {address.trim()}
                      </Text>
                    </View>
                  </View>
                ) : null}

                <View style={styles.reviewRow}>
                  <View style={styles.reviewIcon}>
                    <Ionicons name="wallet-outline" size={18} color={colors.emerald} />
                  </View>
                  <View style={styles.reviewText}>
                    <Text style={styles.reviewLabel}>{isHiring ? 'Offer' : 'Budget'}</Text>
                    <Text style={styles.reviewValue}>{reviewBudget}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.publishNotice}>
                <Ionicons name="checkmark-circle-outline" size={20} color={colors.emerald} />
                <Text style={styles.publishNoticeText}>
                  {isHiring
                    ? `Only ${hireWorkerName} receives this request.`
                    : isEditing
                      ? 'Saving updates this existing job for workers browsing BRAZOS.'
                    : 'Publishing makes this job visible to workers browsing BRAZOS.'}
                </Text>
              </View>
            </View>
          )}

        </ScrollView>

        {/* §3.4 — a nudge, not a gate: it never touches the footer button's
            disabled state, and dismissing it is remembered on this draft only. */}
        {showPhotoNudge ? (
          <View style={styles.nudgeRow}>
            <Ionicons name="image-outline" size={18} color={colors.emerald} />
            <Text style={styles.nudgeText}>Jobs with a photo get more bids.</Text>
            <Pressable
              onPress={() => setPhotoNudgeDismissed(true)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Dismiss photo tip"
            >
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : null}

        <View style={styles.footer}>
          {step > 0 && (
            <Button
              title="Back"
              variant="secondary"
              palette={emeraldColors}
              onPress={handleBack}
              disabled={submitting}
              style={styles.footerBack}
            />
          )}
          <Button
            // "Send request", not "Hire": the worker still has to agree.
            title={
              step < POST_STEPS.length - 1
                ? 'Continue'
                : isEditing
                  ? 'Save changes'
                  : isHiring
                    ? 'Send request'
                    : 'Publish job'
            }
            onPress={step < POST_STEPS.length - 1 ? handleContinue : handleSubmit}
            palette={emeraldColors}
            loading={submitting}
            // The description floor (§3.3) disables Continue on the Describe
            // step only, alongside its written count above. The photo nudge
            // deliberately has no place in this expression.
            disabled={uploadingPhoto || uploadingVideo || (step === 0 && descNeeded > 0)}
            style={styles.footerPrimary}
          />
        </View>
      </KeyboardAvoidingView>
      )}

      {showSuccess && (
        <Animated.View
          style={[styles.successOverlay, { opacity: successOpacity }]}
          accessibilityViewIsModal
        >
          {!isEditing && !isHiring ? (
            /* Screen 16 (JobPublished) — the SuccessScreen template, configured
               rather than reimplemented. The body explains what happens next
               without inventing certainty: bidding produces real bids as
               workers respond, and right now there are none. */
            <SuccessScreen
              title="Your job is live."
              body="Workers browsing BRAZOS can now see it. Bids appear on your job as workers respond — there are none yet — and you choose who gets it."
              details={
                publishedJob ? (
                  <View style={styles.reviewCard}>
                    <Text style={styles.reviewEyebrow}>PUBLISHED</Text>
                    <Text style={styles.reviewTitle} numberOfLines={2}>
                      {publishedJob.title}
                    </Text>

                    <View style={styles.reviewDivider} />

                    <View style={styles.reviewRow}>
                      <View style={styles.reviewIcon}>
                        <Ionicons name="grid-outline" size={18} color={colors.emerald} />
                      </View>
                      <View style={styles.reviewText}>
                        <Text style={styles.reviewLabel}>Category</Text>
                        <Text style={styles.reviewValue} numberOfLines={1}>
                          {JOB_CATEGORY_LABELS[publishedJob.category]}
                        </Text>
                      </View>
                    </View>

                    {publishedJob.location ? (
                      <View style={styles.reviewRow}>
                        <View style={styles.reviewIcon}>
                          <Ionicons name="location-outline" size={19} color={colors.emerald} />
                        </View>
                        <View style={styles.reviewText}>
                          <Text style={styles.reviewLabel}>Area</Text>
                          <Text style={styles.reviewValue} numberOfLines={2}>
                            {publishedJob.location}
                          </Text>
                        </View>
                      </View>
                    ) : null}

                    {arrivalWindowLabel(publishedJob) ? (
                      <View style={styles.reviewRow}>
                        <View style={styles.reviewIcon}>
                          <Ionicons name="time-outline" size={18} color={colors.emerald} />
                        </View>
                        <View style={styles.reviewText}>
                          <Text style={styles.reviewLabel}>Timing</Text>
                          <Text style={styles.reviewValue} numberOfLines={2}>
                            {arrivalWindowLabel(publishedJob)}
                          </Text>
                        </View>
                      </View>
                    ) : null}

                    <View style={styles.reviewRow}>
                      <View style={styles.reviewIcon}>
                        <Ionicons name="wallet-outline" size={18} color={colors.emerald} />
                      </View>
                      <View style={styles.reviewText}>
                        <Text style={styles.reviewLabel}>Budget</Text>
                        <Text style={styles.reviewValue}>
                          {publishedJob.budget_cents != null ||
                          publishedJob.budget_min_cents != null
                            ? budgetRangeLabel(publishedJob)
                            : 'Open to bids'}
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : undefined
              }
              actions={[
                { label: 'View job and bids', onPress: leaveToPublishedJob },
                {
                  label: 'Keep browsing',
                  onPress: () => leaveAfterSuccess(false),
                  variant: 'secondary',
                },
              ]}
            />
          ) : (
            <ScrollView
              contentContainerStyle={styles.successScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Animated.View
                style={[styles.successCircle, { transform: [{ scale: successScale }] }]}
              >
                <Ionicons name="checkmark" size={48} color={colors.onForest} />
              </Animated.View>
              <Text style={styles.successEyebrow}>
                {isEditing ? 'CHANGES SAVED' : 'REQUEST SENT'}
              </Text>
              <Text style={styles.successTitle}>
                {isEditing ? 'Your job is updated.' : 'Your request is on its way.'}
              </Text>
              <Text style={styles.successBody}>
                {isEditing
                  ? 'Workers will now see the latest details.'
                  : `${hireWorkerName} can accept, decline, or suggest a different price in chat.`}
              </Text>

              <View style={styles.successActions}>
                <Button
                  title={isEditing ? 'Back to job' : 'Done'}
                  onPress={() => leaveAfterSuccess(true)}
                  palette={emeraldColors}
                  style={styles.successButton}
                />
              </View>
            </ScrollView>
          )}
        </Animated.View>
      )}

      <PhotoViewer
        visible={!!viewerUri}
        uri={viewerUri}
        onClose={() => setViewerUri(null)}
      />

      <ConfirmDialog
        visible={confirmOfferCents != null}
        title={
          confirmOfferCents != null
            ? `Send ${hireWorkerName} a ${formatBudget(confirmOfferCents)} offer?`
            : ''
        }
        message={`Only ${hireWorkerName} sees this. They can accept, decline, or suggest a different price before anything is booked.`}
        confirmText="Send offer"
        cancelText="Cancel"
        loading={submitting}
        palette={emeraldColors}
        onConfirm={() => confirmOfferCents != null && sendOffer(confirmOfferCents)}
        onCancel={() => setConfirmOfferCents(null)}
      />
    </SafeAreaView>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.xl,
  },
  stepIntro: {
    gap: spacing.sm,
  },
  stepEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.emerald,
  },
  stepTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    color: colors.ink,
  },
  stepSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    maxWidth: 420,
  },
  progressRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  progressItem: {
    flex: 1,
    gap: spacing.xs,
  },
  progressSegment: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.mint2,
  },
  progressSegmentActive: {
    backgroundColor: colors.emerald,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSubtle,
  },
  progressLabelActive: {
    color: colors.forest,
    fontWeight: '800',
  },
  stepFields: {
    gap: spacing.lg,
  },
  hireBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.mint,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.mint2,
    padding: spacing.lg,
  },
  hireBannerText: {
    flex: 1,
    fontSize: 13,
    color: colors.forest,
    fontWeight: '600',
    lineHeight: 19,
  },
  multiline: {
    height: 110,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  field: {
    gap: spacing.sm,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  fieldHint: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    marginTop: -spacing.xs,
  },
  floorHint: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
    marginTop: -spacing.sm,
  },
  guidanceCard: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.mint,
  },
  guidanceRange: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.forest,
  },
  guidanceNote: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  },
  nudgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.mint,
  },
  nudgeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.forest,
  },
  budgetRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  budgetField: {
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  locationField: {
    flex: 1,
  },
  locationBtn: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationBtnPressed: {
    opacity: 0.82,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.mint,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.forest,
  },
  reviewCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  reviewEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.emerald,
  },
  reviewTitle: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '800',
    color: colors.ink,
  },
  reviewDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
  reviewDivider: {
    height: 1,
    backgroundColor: colors.mint2,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  reviewIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewText: {
    flex: 1,
    gap: 2,
  },
  reviewLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  reviewValue: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    color: colors.ink,
  },
  publishNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  publishNoticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  footerBack: {
    minWidth: 104,
    borderRadius: radius.lg,
  },
  footerPrimary: {
    flex: 1,
    borderRadius: radius.lg,
  },
  successOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    zIndex: 10,
  },
  successScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  successCircle: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  successEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: colors.emerald,
  },
  successTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
  },
  successBody: {
    maxWidth: 360,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
    textAlign: 'center',
  },
  successActions: {
    width: '100%',
    maxWidth: 360,
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  successButton: {
    width: '100%',
    borderRadius: radius.lg,
  },
  }),
);
