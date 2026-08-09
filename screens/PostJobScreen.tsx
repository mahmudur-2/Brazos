import { useEffect, useRef, useState } from 'react';
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
import {
  StackActions,
  useNavigation,
  usePreventRemove,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PhotoViewer } from '../components/PhotoViewer';
import { ScreenHeader } from '../components/ScreenHeader';
import { TextField } from '../components/TextField';
import { useAuth } from '../hooks/useAuth';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
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
import { createDirectOffer } from '../lib/offers';
import { alertAsync } from '../lib/dialog';
import { maybePromptForPush } from '../lib/pushNotifications';
import { resolveCurrentPlace } from '../lib/geolocation';
import {
  deleteJobPhoto,
  rejectionForPickedVideo,
  uploadJobAttachment,
  uploadJobVideo,
} from '../lib/storage';
import type { PostJobRouteParamList } from '../lib/navigation';
import { colors, emeraldColors, radius, shadows, spacing } from '../lib/theme';

const USE_NATIVE_DRIVER = Platform.OS !== 'web';
const MAX_PHOTOS = 5;
// Two is a demonstration, not a documentary. Matches the cap create_job()
// enforces server-side (phase34).
const MAX_VIDEOS = 2;
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

// A fresh (not editing, not hiring) post's in-progress fields, persisted so
// the wizard survives an app kill (Phase 4 DoD). Deliberately holds only
// plain, already-uploaded-URL data — nothing that references a local file
// handle, which would not survive a process restart anyway. One slot: this
// device only ever has one job draft in flight at a time, matching the
// screen itself (there is exactly one PostJob route, not one per attempt).
const DRAFT_STORAGE_KEY = 'brazos:postJobDraft:v1';

type PostJobDraft = {
  title: string;
  description: string;
  category: JobCategory | null;
  location: string;
  coords: { lat: number; lng: number } | null;
  budget: string;
  photos: string[];
  videos: string[];
  step: number;
};

async function loadPostJobDraft(): Promise<PostJobDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PostJobDraft;
  } catch {
    // A corrupt or unreadable draft is treated as "no draft" rather than a
    // crash — the wizard just starts blank, same as if none existed.
    return null;
  }
}

async function savePostJobDraft(draft: PostJobDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch (e) {
    console.error('[PostJobScreen] failed to persist draft', e);
  }
}

async function clearPostJobDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch (e) {
    console.error('[PostJobScreen] failed to clear draft', e);
  }
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
    title: 'Where is the job?',
    subtitle: 'Share the area or neighborhood workers should use when considering the job.',
  },
  {
    label: 'Review',
    title: 'Review and publish',
    subtitle: 'Check the details below. You can still go back without losing your work.',
  },
] as const;

export function PostJobScreen() {
  // Registered in four stacks (Home, MyJobs, Messages, Map) for posting, edit,
  // and Hire Again entry points, so its types are standalone rather than tied
  // to one stack.
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<PostJobRouteParamList, 'PostJob'>>();
  const { user } = useAuth();

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
  const [budget, setBudget] = useState('');
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
        if (isFreshPost) void clearPostJobDraft();
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

    let active = true;
    (async () => {
      const draft = await loadPostJobDraft();
      if (!active) return;
      if (draft) {
        setTitle(draft.title);
        setDescription(draft.description);
        setCategory(draft.category);
        setLocation(draft.location);
        setCoords(draft.coords);
        setBudget(draft.budget);
        setPhotos(draft.photos);
        setVideos(draft.videos);
        setStep(Math.min(draft.step, POST_STEPS.length - 1));
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
    if (!isFreshPost || !draftReady) return;
    void savePostJobDraft({
      title,
      description,
      category,
      location,
      coords,
      budget,
      photos,
      videos,
      step,
    });
  }, [isFreshPost, draftReady, title, description, category, location, coords, budget, photos, videos, step]);

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
          error?.message ?? 'This job may have been deleted.'
        );
        navigation.goBack();
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
        navigation.goBack();
        return;
      }

      setTitle(job.title);
      setDescription(job.description);
      setCategory(job.category);
      setLocation(job.location ?? '');
      setBudget(job.budget_cents != null ? String(job.budget_cents / 100) : '');
      setPhotos(job.photos);
      originalPhotosRef.current = new Set(job.photos);
      setVideos(job.videos);
      originalVideosRef.current = new Set(job.videos);
      if (loc) setCoords({ lat: loc.lat, lng: loc.lng });
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
      navigation.goBack();
      return;
    }
    if (isHiring) {
      navigation.goBack();
      return;
    }

    const parent = navigation.getParent();
    // Unwind the source stack too. Otherwise a post launched from discovery
    // remains hidden at the top of Home and reappears when the tab is revisited.
    navigation.dispatch(StackActions.popToTop());
    if (!parent) return;
    const navigateTab = parent.navigate as (name: string, params?: object) => void;
    navigateTab(
      viewMyJobs ? 'MyJobs' : 'Home',
      {
        screen: viewMyJobs ? 'MyJobsHub' : 'HomeMain',
        // React Navigation 7 otherwise appends another copy of the root route.
        // Pop to the existing root so device Back cannot reveal the completed
        // posting wizard or the stale discovery screen that launched it.
        pop: true,
      }
    );
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
    setLocation(result.place.label);
    setCoords({ lat: result.place.lat, lng: result.place.lng });
  }

  async function handleAddPhoto() {
    if (photos.length >= MAX_PHOTOS || !user) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!screenMountedRef.current || result.canceled || !result.assets[0]) return;

    setUploadingPhoto(true);
    const { url, error } = await uploadJobAttachment(user.id, result.assets[0]);
    if (!screenMountedRef.current) {
      if (url) void deleteJobPhoto(url);
      return;
    }
    setUploadingPhoto(false);

    if (error || !url) {
      await alertAsync(
        'Photo upload failed',
        'Please try again. If this keeps happening, the job-photos storage bucket may need setting up.'
      );
      return;
    }
    sessionUploadsRef.current.add(url);
    setPhotos((prev) => [...prev, url]);
  }

  async function handleAddVideo() {
    if (videos.length >= MAX_VIDEOS || !user) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      // Caps recording length where the picker offers to record. A video
      // chosen from the library is not covered by it, so the real check is
      // the duration test below — this just stops the obvious case earlier.
      videoMaxDuration: MAX_VIDEO_DURATION_MS / 1000,
    });
    if (!screenMountedRef.current || result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];

    // Format, length and size are all checked before a byte is uploaded, so a
    // rejected file costs nothing and the reason is specific. Shared with the
    // worker's completion clip so both are refused in the same words.
    const rejection = rejectionForPickedVideo(asset, {
      maxDurationMs: MAX_VIDEO_DURATION_MS,
      maxBytes: MAX_VIDEO_BYTES,
    });
    if (rejection) {
      await alertAsync(rejection.title, rejection.message);
      return;
    }

    setUploadingVideo(true);
    const { url, error } = await uploadJobVideo(user.id, asset);
    if (!screenMountedRef.current) {
      if (url) void deleteJobPhoto(url);
      return;
    }
    setUploadingVideo(false);

    // Only a successful upload is added to the list, so the job can never be
    // saved referencing something that is not in storage.
    if (error || !url) {
      await alertAsync(
        'Video upload failed',
        'Please try again. On a slow connection a shorter clip will upload more reliably.'
      );
      return;
    }
    sessionUploadsRef.current.add(url);
    setVideos((prev) => [...prev, url]);
  }

  function removeVideo(url: string) {
    setVideos((prev) => prev.filter((v) => v !== url));

    // Same rule as removePhoto: a video already saved on the job has to stay
    // in storage until the edit is actually saved, because the live job row
    // still references it.
    if (originalVideosRef.current.has(url)) return;
    deleteJobPhoto(url).then(({ error }) => {
      if (error) console.error('[PostJobScreen] deleteJobPhoto (video) failed', error);
      else sessionUploadsRef.current.delete(url);
    });
  }

  function removePhoto(url: string) {
    setPhotos((prev) => prev.filter((p) => p !== url));

    // Only clean up storage for a photo added THIS session — one already
    // saved on the job (edit mode) must stay until the edit is actually
    // saved, since the still-live job row keeps referencing it until then.
    if (originalPhotosRef.current.has(url)) return;
    deleteJobPhoto(url).then(({ error }) => {
      if (error) console.error('[PostJobScreen] deleteJobPhoto failed', error);
      else sessionUploadsRef.current.delete(url);
    });
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
      await alertAsync('Could not send offer', requestError.message);
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

    const budgetCents = dollarsToCents(budget);
    // dollarsToCents() already turns 0 (and negatives) into NaN, but that
    // guarantee is checked explicitly here too, the same way JobDetailScreen's
    // bid flow does — this call site shouldn't depend on staying in sync with
    // that function's internals to keep a $0 job from posting.
    if (Number.isNaN(budgetCents) || (budgetCents != null && budgetCents <= 0)) {
      await alertAsync('Invalid budget', 'Budget must be a positive dollar amount.');
      return;
    }
    // A hire request opens with a proposed price, so an amount is required —
    // it's the starting point for the negotiation, not a final figure. A real
    // 0 can't reach here (caught above), so this is specifically the "left
    // blank" case.
    if (isHiring && budgetCents == null) {
      await alertAsync(
        'Price required',
        `Enter the amount you'd like to offer ${hireWorkerName}. They can accept or counter.`
      );
      return;
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
    const { data: savedJob, error, locationError } = isEditing
      ? await updateJob(editJobId!, {
          title: title.trim(),
          description: description.trim(),
          category,
          location: location.trim(),
          budgetCents,
          photos,
          videos,
          coords,
        })
      : await createJob(user.id, {
          title: title.trim(),
          description: description.trim(),
          category,
          location: location.trim(),
          budgetCents,
          photos,
          videos,
          coords,
        });
    submittingRef.current = false;

    if (error) {
      if (!screenMountedRef.current) {
        cleanupSessionUploads();
        return;
      }
      setSubmitting(false);
      await alertAsync(isEditing ? 'Could not save changes' : 'Could not post job', error.message);
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
        `${isEditing ? 'Your changes were saved' : 'Your job is live'}, but we couldn't save its location for the map: ${locationError.message}`
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
      void clearPostJobDraft();
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
    navigation.goBack();
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
  const reviewBudget =
    reviewBudgetCents != null && !Number.isNaN(reviewBudgetCents)
      ? formatBudget(reviewBudgetCents)
      : isHiring
        ? 'Required before sending'
        : 'Open to bids';

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

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>
                  Photos (optional) · {photos.length}/{MAX_PHOTOS}
                </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoRow}
              keyboardShouldPersistTaps="handled"
            >
              {photos.map((url, index) => (
                <View key={url} style={styles.photoWrap}>
                  <Pressable
                    onPress={() => setViewerUri(url)}
                    accessibilityRole="button"
                    accessibilityLabel={`View photo ${index + 1}`}
                  >
                    <Image source={{ uri: url }} style={styles.photo} />
                  </Pressable>
                  <Pressable
                    style={styles.photoRemove}
                    onPress={() => removePhoto(url)}
                    hitSlop={7}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove photo ${index + 1}`}
                  >
                    <Ionicons name="close" size={14} color={colors.onPrimary} />
                  </Pressable>
                </View>
              ))}

              {photos.length < MAX_PHOTOS && (
                <Pressable
                  style={styles.addTile}
                  onPress={handleAddPhoto}
                  disabled={uploadingPhoto}
                  accessibilityRole="button"
                  accessibilityLabel="Add a job photo"
                >
                  {uploadingPhoto ? (
                    <ActivityIndicator size="small" color={colors.emerald} />
                  ) : (
                    <Ionicons name="add" size={28} color={colors.emerald} />
                  )}
                </Pressable>
              )}
                </ScrollView>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>
                  Video (optional) · {videos.length}/{MAX_VIDEOS}
                </Text>
                <Text style={styles.fieldHint}>
                  Up to {MAX_VIDEO_DURATION_MS / 1000} seconds each. A short clip
                  explains an awkward job faster than a paragraph.
                </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoRow}
              keyboardShouldPersistTaps="handled"
            >
              {/* No thumbnail: extracting one needs a second native module,
                  and a labelled play tile says what it is without pretending
                  to preview a frame that was never generated. */}
              {videos.map((url, index) => (
                <View key={url} style={styles.photoWrap}>
                  <View style={styles.videoTile}>
                    <Ionicons name="play-circle" size={30} color={colors.emerald} />
                    <Text style={styles.videoTileText}>Clip {index + 1}</Text>
                  </View>
                  <Pressable
                    style={styles.photoRemove}
                    onPress={() => removeVideo(url)}
                    hitSlop={7}
                    accessibilityLabel={`Remove clip ${index + 1}`}
                  >
                    <Ionicons name="close" size={14} color={colors.onPrimary} />
                  </Pressable>
                </View>
              ))}

              {videos.length < MAX_VIDEOS && (
                <Pressable
                  style={styles.addTile}
                  onPress={handleAddVideo}
                  disabled={uploadingVideo}
                  accessibilityRole="button"
                  accessibilityLabel="Add a job video"
                >
                  {uploadingVideo ? (
                    <>
                      <ActivityIndicator size="small" color={colors.emerald} />
                      <Text style={styles.uploadingText}>Uploading…</Text>
                    </>
                  ) : (
                    <Ionicons name="videocam-outline" size={26} color={colors.emerald} />
                  )}
                </Pressable>
              )}
                </ScrollView>
              </View>
            </View>
          )}

          {step === 0 && (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.chips}>
                {JOB_CATEGORIES.map((c) => (
                  <Chip
                    key={c}
                    label={JOB_CATEGORY_LABELS[c]}
                    icon={JOB_CATEGORY_ICONS[c]}
                    accentColor={categoryAccent(c).bg}
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
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <Ionicons name="location" size={20} color={colors.onPrimary} />
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
            </View>
          )}

          {step === 3 && (
            <View style={styles.stepFields}>
              <TextField
                palette={emeraldColors}
                label={isHiring ? 'Your offer ($)' : 'Budget ($) (optional)'}
                value={budget}
                onChangeText={setBudget}
                placeholder="e.g. 50"
                keyboardType="numeric"
                hint={
                  isHiring
                    ? `${hireWorkerName} can accept or suggest a different price.`
                    : 'Leave blank if you want workers to propose a price.'
                }
              />

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
            disabled={uploadingPhoto || uploadingVideo}
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
        <ScrollView
          contentContainerStyle={styles.successScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[styles.successCircle, { transform: [{ scale: successScale }] }]}
          >
            <Ionicons name="checkmark" size={48} color={colors.onPrimary} />
          </Animated.View>
          <Text style={styles.successEyebrow}>
            {isEditing ? 'CHANGES SAVED' : isHiring ? 'REQUEST SENT' : 'JOB PUBLISHED'}
          </Text>
          <Text style={styles.successTitle}>
            {isEditing ? 'Your job is updated.' : isHiring ? 'Your request is on its way.' : 'Your job is live.'}
          </Text>
          <Text style={styles.successBody}>
            {isEditing
              ? 'Workers will now see the latest details.'
              : isHiring
                ? `${hireWorkerName} can accept, decline, or suggest a different price in chat.`
                : 'Workers can now review the details and send you bids.'}
          </Text>

          {publishedJob && !isEditing && !isHiring && (
            <View style={[styles.reviewCard, styles.successSummaryCard]}>
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

              <View style={styles.reviewRow}>
                <View style={styles.reviewIcon}>
                  <Ionicons name="wallet-outline" size={18} color={colors.emerald} />
                </View>
                <View style={styles.reviewText}>
                  <Text style={styles.reviewLabel}>Budget</Text>
                  <Text style={styles.reviewValue}>
                    {publishedJob.budget_cents != null
                      ? formatBudget(publishedJob.budget_cents)
                      : 'Open to bids'}
                  </Text>
                </View>
              </View>
            </View>
          )}

          <View style={styles.successActions}>
            <Button
              title={isEditing ? 'Back to job' : isHiring ? 'Done' : 'View my jobs'}
              onPress={() => leaveAfterSuccess(true)}
              palette={emeraldColors}
              style={styles.successButton}
            />
            {!isEditing && !isHiring && (
              <Button
                title="Back to home"
                variant="secondary"
                palette={emeraldColors}
                onPress={() => leaveAfterSuccess(false)}
                style={styles.successButton}
              />
            )}
          </View>
        </ScrollView>
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

const styles = StyleSheet.create({
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
  videoTile: {
    width: 88,
    height: 88,
    borderRadius: radius.lg,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  videoTileText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.forest,
  },
  uploadingText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.emerald,
    marginTop: spacing.xs,
  },
  photoRow: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  photoWrap: {
    position: 'relative',
  },
  photo: {
    width: 88,
    height: 88,
    borderRadius: radius.lg,
    backgroundColor: colors.mint,
  },
  photoRemove: {
    position: 'absolute',
    top: -7,
    right: -7,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  addTile: {
    width: 88,
    height: 88,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.emerald,
    borderStyle: 'dashed',
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
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
  successSummaryCard: {
    width: '100%',
    maxWidth: 360,
    marginTop: spacing.lg,
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
});
