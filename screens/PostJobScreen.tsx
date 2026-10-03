import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  type StyleProp,
  type ViewStyle,
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
import { Card } from '../components/Card';
import { CategoryTileRow } from '../components/CategoryTileRow';
import { Chip } from '../components/Chip';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useDictation } from '../components/DictationMic';
import { EyeOffIcon } from '../components/EyeOffIcon';
import { JobLivePage } from '../components/JobLivePage';
import { JobSummaryCard, type SummaryTarget } from '../components/JobSummaryCard';
import { OfferAmountField, validateOfferAmount } from '../components/OfferComposer';
import { PhotoViewer } from '../components/PhotoViewer';
import { PostQuestions } from '../components/PostQuestions';
import { POST_BAR_BUTTON, PostJobBar } from '../components/PostJobBar';
import { PriceDropdown, type PriceDropdownHandle, type PriceViewport } from '../components/PriceDropdown';
import { ScreenHeader } from '../components/ScreenHeader';
import { SealTransition, type SealFrom, type SealPhase } from '../components/SealTransition';
import { FieldLabel, TextField } from '../components/TextField';
import { UndoToast } from '../components/UndoToast';
import { useAuth } from '../hooks/useAuth';
import { EntranceView } from '../components/EntranceView';
import { trackIntent } from '../lib/observability/analytics';
import { invalidateJobs } from '../lib/queryClient';
import { Sentry } from '../lib/observability/sentry';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  arrivalWindowLabel,
  createJob,
  dollarsToCents,
  fetchJobById,
  fetchJobLocation,
  formatBudget,
  JOB_CATEGORIES,
  JOB_CATEGORY_CHIP_ORDER,
  JOB_CATEGORY_LABELS,
  LAUNCH_EXCLUDED_CATEGORIES,
  updateJob,
  type Job,
  type JobCategory,
} from '../lib/jobs';
import {
  clearPostJobDraft,
  draftHasContent,
  loadPostJobDraft,
  savePostJobDraft,
} from '../lib/postJobDraft';
import {
  DEFAULT_PRICING_MODE,
  priceRowLabel,
  pricingModeFrom,
  type PricingMode,
} from '../lib/pricingMode';
import { priceGuidanceLines } from '../lib/priceGuidance';
import { PRICE_GUIDANCE } from '../lib/featureFlags';
import { descriptionCharsNeeded } from '../lib/validation';
import { answerLine, withAnswerLine, type PostAnswers } from '../lib/postQuestions';
import { dictateBeforeLine } from '../lib/dictation';
import { createDirectOffer } from '../lib/offers';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { askOpenSettings } from '../lib/permissionPrompt';
import { DropdownBody, DropdownChevron } from '../components/DropdownReveal';
import { CADENCE_LABELS, SERIES_CADENCES, startJobSeries, type SeriesCadence } from '../lib/jobSeries';
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
import { goBackOrHome, navigateAcrossTabs, originLabel } from '../lib/navigationRef';
import { useDialNumber } from '../lib/designOverrides';
import {
  EYEBROW_TYPE,
  emeraldColorsFor,
  fonts,
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
  screenGround,
} from '../lib/theme';
import { MediaUploader, Toggle, usePinnedFooterPadding, useScrollClearance } from '../ui/primitives';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { Announce } from '../hooks/useAnnounce';
import { SPINNER_STATE, ScreenStateView } from '../ui/templates/ScreenStates';
import { formatDay } from '../lib/time';

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
/** The progress bar's crossfade into its next segment (2026-09-27, ruling 14). */
const PROGRESS_FILL_MS = 220;

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
          : formatDay(d, { now });
    return { iso: toLocalIsoDate(d), label };
  });
}

// D18 — the summary's media count moved with the summary: it is
// components/JobSummaryCard.tsx's `mediaCountText` now (2026-09-28, LUX-LIST-64
// #38), still pluralising each side and omitting an empty one.

const POST_STEPS = [
  {
    label: 'Describe',
    title: 'What needs doing?',
    // 2026-09-27 (the Lux remake, ruling 10): every subtitle on ONE line at
    // 393 wide — nothing on two lines when one line says it.
    subtitle: 'A clear title and a few details help workers decide.',
  },
  {
    label: 'Media',
    title: 'Show the job',
    subtitle: 'Photos and clips are optional, but they help workers.',
  },
  {
    label: 'Location',
    title: 'Where and when?',
    subtitle: 'Workers see only the area until you hire someone.',
  },
  {
    label: 'Review',
    title: 'Review and publish',
    subtitle: 'Check the details. You can still go back.',
  },
] as const;

/**
 * Tier A (C7) — THE ONE FILTER SITE of the launch posting allowlist. Every
 * enumeration on this screen (the pills, their measurement pass and the
 * packing) reads this list; the shared map is untouched and every other
 * surface keeps reading it whole.
 *
 * 2026-09-26 (the refresh, audit M-7) — the "Other" pill no longer opens a
 * sheet. The sheet listed exactly these categories again, so it was a second
 * tap to reach what the pills already offer; "Other" is now an ordinary pill
 * that selects the Other category.
 */
const POSTABLE_CATEGORIES: readonly JobCategory[] = JOB_CATEGORIES.filter(
  (c) => !LAUNCH_EXCLUDED_CATEGORIES.includes(c)
);

/**
 * 2026-09-30 (the build run, idea 23) — THE TILES' ORDER: every postable category, in the order
 * Home's tiles and the job filter's chips use (the six quick services first, Other last). The
 * packing pass the pills needed (C2b) went with them: tiles slide, they do not wrap.
 */
const POSTABLE_TILES: readonly JobCategory[] = [...POSTABLE_CATEGORIES].sort(
  (a, b) => tileRank(a) - tileRank(b)
);
function tileRank(category: JobCategory): number {
  const at = JOB_CATEGORY_CHIP_ORDER.indexOf(category);
  return at < 0 ? JOB_CATEGORY_CHIP_ORDER.length : at;
}

/**
 * RUN PJ1 (C1) — EVERY STEP CHANGE ANIMATES ITS INCOMING CONTENT.
 *
 * The wizard's steps are internal renders keyed off the `step` state, not
 * navigator routes, so the stack transition only ever plays on the way in
 * from Home — moving between steps was an instant cut. This pane plays
 * hooks/useEntrance's entrance (opacity 0→1, translateY 10→0 on the shared
 * spring — the exact arrangement Home's sections use) for the arriving step.
 *
 * useEntrance fires once per MOUNT, so callers key the pane by the step
 * index: a step change remounts it and the entrance fires again, forward and
 * back, while unrelated re-renders (typing, uploads) keep the key and never
 * replay it. Under reduced motion useEntrance returns undefined and this is
 * a plain static View — which is also why the screenshot harness, which
 * renders with prefers-reduced-motion, sees no transform at rest.
 */
function StepPane({
  index = 0,
  style,
  children,
}: {
  index?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <EntranceView index={index} style={style}>
      {children}
    </EntranceView>
  );
}

export function PostJobScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // RUN T2 (C3) — POST A JOB'S OWN DIALS. Each falls back to the value this
  // file draws, spelled here and nowhere else. Whichever still answers to a
  // token takes the `theme.*` scale, because this file imports
  // `spacing`/`radius` from lib/theme; ui/tokens' bare `spacing.xl` is 20
  // against theme's 24, so the wrong parent would move the gutter by four
  // points the moment the operator turned it.
  //
  // RUN N3 (2026-09-08) — FOUR OF THESE ARE NOW LITERALS THAT WERE TOKEN
  // READS, and that is the change rather than a slip. The operator dialled
  // the gutter to 20, the section gap to 21 and the field gap to 20; the
  // gutter and the section gap had been ONE number (`spacing.xl`, 24) and are
  // now two, and 21 is on no scale at all. A dial may not keep a parent it no
  // longer ships at — the registry fences that — so the three left theirs,
  // and the reason 20 is written out rather than taken from ui/tokens'
  // `spacing.xl` (also 20) is the paragraph above: this file reads the theme
  // scale, and a parent off the Emerald one would sit right until it moved.
  // `reviewCardRadius` is the one that still inherits.
  const contentPaddingX = useDialNumber('postJob.content.paddingX') ?? 20;
  const contentGap = useDialNumber('postJob.content.gap') ?? 21;
  const progressHeight = useDialNumber('postJob.progress.height') ?? 6;
  const stepFieldsGap = useDialNumber('postJob.stepFields.gap') ?? 20;
  const descriptionHeight = useDialNumber('postJob.description.height') ?? 120;
  const reviewCardRadius = useDialNumber('postJob.reviewCard.radius') ?? radius.xl;
  // 2026-09-30: the tab bar floats over this screen. Steps 1-3 have no footer (the Lux remake,
  // ruling 13), so their scroller ends above the pill; the last step's bar (PostJobBar) lifts its
  // own buttons over it and the scroller ends on the bar, as before.
  const navClearance = useScrollClearance();
  // The last step's bar lifts its buttons over the pill by this much; its note floats above them.
  const footerPad = usePinnedFooterPadding();
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
  // 2026-09-30 (idea 2) — a fresh post that starts from a past one (the + sheet's "Reuse a past
  // job"). Not an edit: it saves a NEW job; only its opening values come from the old one.
  const reuseJobId = !isEditing && !params?.hireWorkerId ? params?.reuseJobId ?? null : null;
  const [loadingJob, setLoadingJob] = useState(isEditing || !!reuseJobId);
  const [reusedFrom, setReusedFrom] = useState<string | null>(null);

  // The only mode a local draft applies to — editing reloads from the saved
  // job, and a hire request is a single quick action with nothing worth
  // resuming.
  const isFreshPost = !isEditing && !isHiring;
  // 2026-09-30 (idea 2, group 2's review): a REUSED post never touches the draft slot — it neither
  // restores, saves nor clears it, and offers no "Save draft" — so an unfinished draft survives a
  // reuse, untouched, for My Jobs and Home to resume.
  const usesDraft = isFreshPost && !reuseJobId;
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
  // a4 — the posting choice (docs/DECISIONS.md 2026-09-05 entry (2)). Open bids
  // is the default, so a wizard nobody touches posts exactly the job it posted
  // before this run. The ONE typed figure above is the price in posted mode and
  // the maximum in open mode — one field, one dialog, never two amounts.
  const [pricingMode, setPricingMode] = useState<PricingMode>(DEFAULT_PRICING_MODE);
  // 2026-09-30 (idea 12) — "Need it today", off by default, a fresh post's alone: on, nearby workers'
  // alert says so and their cards show a Today pill on the day it is posted. Not kept in the draft —
  // "today" is the day the post goes out, so a resumed draft starts with it off.
  const [neededToday, setNeededToday] = useState(false);
  // The toggle and the day agree (group 2's review): turning it on sets the day to today, and
  // choosing another day turns it off — the alert never says "today" for Saturday's job.
  function setNeedItToday(on: boolean) {
    setNeededToday(on);
    if (on) setScheduledDate(toLocalIsoDate(new Date()));
  }
  // 2026-09-30 (idea 14) — "Repeat this job", a fresh post's alone, off by default: every week, every
  // 2 weeks or every month. The job posts as it always does; the series starts from it once it is
  // live (start_job_series()). Not kept in the draft, as "Need it today" is not.
  const [repeatCadence, setRepeatCadence] = useState<SeriesCadence | null>(null);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const repeatRef = useRef<View>(null);
  /**
   * Idea 14: the series starts from the job just posted — one quiet retry, then, if it still fails, the
   * failure said and a Try again (the job is live either way; a repeat is never silently lost).
   */
  async function startRepeat(jobId: string, cadence: SeriesCadence) {
    let { error: seriesError } = await startJobSeries(jobId, cadence);
    if (seriesError) ({ error: seriesError } = await startJobSeries(jobId, cadence));
    // The dialog lives at the app's root, so it asks even if the screen has already gone — a repeat is
    // never silently lost (the group 4 review).
    while (seriesError) {
      const again = await confirmAsync({
        title: 'The repeat didn’t save',
        message: `Your job is posted. ${userMessage(seriesError)}`,
        confirmText: 'Try again',
        cancelText: 'Not now',
      });
      if (!again) return;
      ({ error: seriesError } = await startJobSeries(jobId, cadence));
    }
    // F13: an own mutation — the cached hub and feed are out of date.
    invalidateJobs();
  }

  // Exact service address — job_private_details on publish, never public.
  const [address, setAddress] = useState('');
  const [scheduledDate, setScheduledDate] = useState<string | null>(null);
  const [arrivalStartHour, setArrivalStartHour] = useState<number | null>(null);
  const [arrivalEndHour, setArrivalEndHour] = useState<number | null>(null);
  // Idea 12 (group 2's review): choosing another day turns "Need it today" off.
  useEffect(() => {
    if (neededToday && scheduledDate && scheduledDate !== toLocalIsoDate(new Date())) setNeededToday(false);
  }, [neededToday, scheduledDate]);
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
  // 2026-09-28 (LUX-LIST-64 #32): the §3.4 photo nudge ("Add photos so workers
  // can see the work.") is gone, with its dismissal state and its draft field.
  // D13 — whether an amount is being typed: since 2026-09-28 (LUX-LIST-64 #36)
  // the price list's own-amount entry being open. The typical-range guidance
  // still steps aside while it is (§3.2).
  const [editingBudget, setEditingBudget] = useState(false);
  // #36 — the price list, opened from the summary's BUDGET cell too. It drops
  // down inside the scroller's band (under the header, above the bar), which
  // it reads from the scroller's frame and the first thing it scrolls.
  const priceRef = useRef<PriceDropdownHandle>(null);
  const scrollRef = useRef<ScrollView>(null);
  const bandRef = useRef<View>(null);
  const introRef = useRef<View>(null);
  const priceViewport: PriceViewport = {
    measure: (done) => {
      bandRef.current?.measureInWindow((_x, top, _width, height) => {
        introRef.current?.measureInWindow((_ix, introTop) => {
          // The intro opens the content, under its top padding.
          done({ top, bottom: top + height, scrollY: Math.max(0, top + spacing.sm - introTop) });
        });
      });
    },
    scrollTo: (y) => scrollRef.current?.scrollTo({ y, animated: reducedMotion === false }),
  };
  // #38 — uploads the summary card has in flight (Publish reads "Uploading…"),
  // and the note it floats ("Photo removed · Undo").
  const [summaryUploading, setSummaryUploading] = useState(false);
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  // #41 — Save draft leaves for Home; the exit guard steps aside for it.
  const [leaving, setLeaving] = useState(false);
  // #42 — the Seal: where Publish stood, and how far the save has got.
  const primarySlotRef = useRef<View>(null);
  const [seal, setSeal] = useState<{ from: SealFrom; phase: SealPhase } | null>(null);
  const liveFade = useRef(new Animated.Value(1)).current;
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  // The amount an offer is about to be sent at, held while the confirmation
  // is open. Null means nothing is pending.
  const [confirmOfferCents, setConfirmOfferCents] = useState<number | null>(null);

  // 2026-09-30 (idea 23) — the chosen category's usual questions: whether they are open under the
  // tiles, which answers are picked, and the line those answers wrote into the description (so the
  // next answer replaces it where it stands). Kept in the draft with everything else.
  const [questionsOpen, setQuestionsOpen] = useState(false);
  // Each opening on purpose — a tile chosen, the arrow tapped — asks once to be brought into view
  // (group 2's review: coming back to this step to edit the title must not scroll away from it).
  const [revealKey, setRevealKey] = useState(0);
  const [answers, setAnswers] = useState<PostAnswers>({});
  const [answersLine, setAnswersLine] = useState('');
  // 2026-09-30 (idea 18) — the two mics: on-device dictation into the title and the description,
  // in place. The description's words go above idea 23's answers line, which stays its last line.
  const titleDictation = useDictation({ value: title, onChangeText: setTitle, maxLength: MAX_TITLE_LENGTH, field: 'title' });
  const descriptionDictation = useDictation({
    value: description,
    onChangeText: setDescription,
    maxLength: MAX_DESCRIPTION_LENGTH,
    field: 'description',
    join: (base, spoken) => dictateBeforeLine(base, answersLine, spoken, MAX_DESCRIPTION_LENGTH),
  });
  const questionsRef = useRef<View>(null);
  // The reveal waits one frame for the opened questions' layout — a frame, never a timer.
  const revealFrameRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (revealFrameRef.current != null) cancelAnimationFrame(revealFrameRef.current);
    },
    []
  );

  const successScale = useRef(new Animated.Value(0.4)).current;
  const reducedMotion = useReducedMotion();
  // 2026-09-27 (the Lux remake, ruling 14): the progress bar fills its next
  // segment with a short native-driver crossfade instead of snapping — one
  // opacity per segment, the fill drawn over the track; reduced motion jumps.
  const segmentFills = useRef(
    POST_STEPS.map((_, index) => new Animated.Value(index <= step ? 1 : 0)),
  ).current;
  useEffect(() => {
    segmentFills.forEach((fill, index) => {
      const toValue = index <= step ? 1 : 0;
      if (reducedMotion !== false) {
        fill.setValue(toValue);
        return;
      }
      Animated.timing(fill, {
        toValue,
        duration: PROGRESS_FILL_MS,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
    });
  }, [segmentFills, step, reducedMotion]);
  // Render-state disabling is useful feedback, but the ref is the actual
  // guard against two fast taps entering an async write before React paints.
  const submittingRef = useRef(false);
  // Uploads begin before the job is saved. Track only files added during this
  // visit so backing out can clean them up without touching edit-mode media.
  const sessionUploadsRef = useRef<Set<string>>(new Set());
  const uploadsCommittedRef = useRef(false);
  const screenMountedRef = useRef(true);
  // M-7 — whether the last autosaved draft had anything in it. The unmount
  // cleanup below closes over the first render's state, so it reads this ref
  // (written beside every autosave) to decide keep-or-discard.
  const draftHasContentRef = useRef(false);

  function cleanupSessionUploads() {
    for (const url of sessionUploadsRef.current) {
      deleteJobPhoto(url).then(({ error }) => {
        if (error) {
          console.error('[PostJobScreen] orphan media cleanup failed', error);
          Sentry?.captureException(error, { extra: { site: 'PostJobScreen.cleanupSessionUploads' } });
        }
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
        // M-7 — BACKING OUT KEEPS A FRESH POST THAT HAS SOMETHING IN IT.
        // It used to delete the draft and its uploads, so one stray Back
        // threw away typed text and uploaded photos. Now the draft and its
        // media stay together — My Jobs shows it as a "Not published yet"
        // card that resumes it, and that card's "Discard draft" is the one
        // explicit delete (screens/MyJobsHubScreen.tsx). An empty
        // form, an edit and a hire request are abandoned exactly as before:
        // their session uploads are deleted, and an empty fresh draft is
        // cleared. An app KILL never reaches this line at all (the process
        // is gone before any unmount effect runs), which leaves the persisted
        // draft in place either way.
        const keepDraft = usesDraft && !!draftUserId && draftHasContentRef.current;
        if (!keepDraft) {
          cleanupSessionUploads();
          if (usesDraft && draftUserId) void clearPostJobDraft(draftUserId);
        }
      }
      successScale.stopAnimation();
    };
    // isFreshPost is derived once from route params and never changes across
    // this screen's life, so it is safe to read without being a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successScale]);

  // R7D — job_post_started / job_post_abandoned.
  //
  // ABANDONMENT FIRES ON UNMOUNT, SO AN APP KILLED MID-FORM NEVER REPORTS IT.
  // The number is a FLOOR, not the truth: read it as "at least this many
  // people opened the form and left without posting", never as the
  // abandonment rate. The same kill that skips this line is precisely what
  // leaves the persisted draft in place for the cleanup effect above, so the
  // two facts have the same cause and neither can be fixed from here.
  //
  // FRESH POSTS ONLY. An edit reopens a job that already exists and a Hire
  // Again request creates no job at all; counting either would put rows that
  // are already in the database at the top of the posting funnel, and would
  // report backing out of an edit as an abandoned post.
  const postStartedAtRef = useRef(Date.now());
  const postSavedRef = useRef(false);
  // Assigned during render, not held in state: the unmount cleanup needs the
  // LAST rendered values, and putting them in state would repaint the whole
  // form on every keystroke to feed one analytics event.
  const draftShapeRef = useRef({ hadTitle: false, hadBudget: false, hadPhoto: false });
  draftShapeRef.current = {
    hadTitle: title.trim().length > 0,
    hadBudget: budgetMax.trim().length > 0,
    hadPhoto: photos.length > 0,
  };

  useEffect(() => {
    if (!isFreshPost) return;
    trackIntent({ name: 'job_post_started' });
    return () => {
      if (postSavedRef.current) return;
      const shape = draftShapeRef.current;
      trackIntent({
        name: 'job_post_abandoned',
        secondsSpent: Math.round((Date.now() - postStartedAtRef.current) / 1000),
        hadTitle: shape.hadTitle,
        hadBudget: shape.hadBudget,
        hadPhoto: shape.hadPhoto,
      });
    };
    // Same reasoning as the cleanup effect above: isFreshPost is derived once
    // from route params and never changes across this screen's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore an in-progress fresh-post draft so it survives an app kill
  // (Phase 4 DoD). Skipped for edit (its source of truth is the saved job)
  // and hire (nothing worth resuming). Also skipped when the route already
  // seeded specific fields — Home's search box / category chips are an
  // explicit fresh start and should win over a stale draft, not be silently
  // overridden by it.
  useEffect(() => {
    if (!usesDraft) {
      setDraftReady(true);
      return;
    }
    const hasRouteSeed = !!(
      params?.initialTitle ||
      params?.initialDescription ||
      params?.initialCategory ||
      reuseJobId
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
        setPricingMode(draft.pricingMode);
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
        setAnswers(draft.answers);
        setAnswersLine(draft.answersLine);
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
    if (!usesDraft || !draftReady || !draftUserId) return;
    const draft = {
      title,
      description,
      category,
      location,
      coords,
      budgetMin,
      budgetMax,
      pricingMode,
      address,
      scheduledDate,
      arrivalStartHour,
      arrivalEndHour,
      photos,
      videos,
      answers,
      answersLine,
      step,
    };
    draftHasContentRef.current = draftHasContent(draft);
    void savePostJobDraft(draftUserId, draft);
  }, [usesDraft, draftReady, draftUserId, title, description, category, location, coords, budgetMin, budgetMax, pricingMode, address, scheduledDate, arrivalStartHour, arrivalEndHour, photos, videos, answers, answersLine, step]);

  /**
   * Idea 23 — choosing a tile. Tapping the chosen tile again clears the category, as the pills did
   * (C2a). The answers belonged to the category being left, so their line leaves the description
   * with them; a newly chosen category opens its questions.
   */
  function chooseCategory(next: JobCategory) {
    const nextCategory = category === next ? null : next;
    if (answersLine) setDescription(withAnswerLine(description, answersLine, '', MAX_DESCRIPTION_LENGTH).text);
    setAnswers({});
    setAnswersLine('');
    setCategory(nextCategory);
    setQuestionsOpen(nextCategory != null);
    if (nextCategory != null) setRevealKey((key) => key + 1);
  }

  // Leaving the Describe step closes the questions; coming back shows the title and description.
  useEffect(() => {
    if (step !== 0) setQuestionsOpen(false);
  }, [step]);

  /** The arrow under the chosen tile: open (and bring into view) or close. */
  function toggleQuestions() {
    if (!questionsOpen) setRevealKey((key) => key + 1);
    setQuestionsOpen(!questionsOpen);
  }

  /**
   * Idea 23 — an answer chip. Tapping the picked answer again unpicks it. The answers make one line
   * at the end of the description, rewritten where it stands; an answer that would push the
   * description past its limit is not taken.
   */
  function answerQuestion(questionId: string, index: number) {
    const next: Record<string, number> = { ...answers };
    if (next[questionId] === index) delete next[questionId];
    else next[questionId] = index;
    const line = answerLine(category, next);
    const written = withAnswerLine(description, answersLine, line, MAX_DESCRIPTION_LENGTH);
    if (written.line !== line) return;
    setAnswers(next);
    setDescription(written.text);
    setAnswersLine(written.line);
  }

  /** Idea 23 — once the questions have opened, the page scrolls itself so all of them show above the tab bar. */
  function revealQuestions() {
    revealInView(questionsRef);
  }

  /** Scrolls just enough that what just opened sits above the posting bar (the questions, the repeat list). */
  function revealInView(target: { current: View | null }) {
    if (revealFrameRef.current != null) cancelAnimationFrame(revealFrameRef.current);
    revealFrameRef.current = requestAnimationFrame(() => {
      revealFrameRef.current = null;
      priceViewport.measure(({ bottom, scrollY }) => {
        target.current?.measureInWindow((_x, top, _width, height) => {
          const overflow = top + height - (bottom - navClearance - spacing.md);
          if (overflow > 0) {
            scrollRef.current?.scrollTo({ y: scrollY + overflow, animated: reducedMotion === false });
          }
        });
      });
    });
  }

  // Header Back, Android Back, and the iOS edge gesture all mean the same
  // thing inside the wizard: move back one step. A write in flight cannot be
  // removed from the stack, which also protects its referenced uploads.
  // 2026-09-28 (LUX-LIST-64 #41): "Save draft" leaves on purpose, so while it
  // does the guard steps aside — the draft is already kept (see the unmount).
  usePreventRemove(!leaving && (submitting || (step > 0 && !showSuccess)), () => {
    if (!submitting) setStep((current) => Math.max(0, current - 1));
  });

  // #41 — Save draft: the autosave above already holds every field, photo and
  // clip, so what is left is to keep it on the way out and land on Home, where
  // the draft is the first card (#17). Uploads in flight hold the button (they
  // would otherwise be lost to the unmount).
  useEffect(() => {
    if (!leaving) return;
    navigation.dispatch(StackActions.popToTop());
    navigateAcrossTabs('Home', 'HomeMain', undefined, { pop: true, fallbackToTabRoot: true });
    // One trip — `leaving` is set once and the screen goes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);


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
      // a4 — an edit reopens on the mode the job was posted in. A row written
      // before migration 20260930000400, or a stale cached one, has no mode at
      // all, and the allow-list reads that as open bids: no special case.
      setPricingMode(pricingModeFrom(job.pricing_mode));
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

  /**
   * 2026-09-30 (idea 2) — REUSE A PAST JOB. Everything a new visit repeats is copied: the words,
   * the category, the area and its pin, the private address, the posting choice and the price —
   * and the form opens on its Review step, one tap from Publish. The schedule is not copied (a past
   * day is never right) and neither are the photos and clips: they belong to that job, and its own
   * clean-ups delete their files. A failed read opens the plain form instead.
   */
  useEffect(() => {
    if (!reuseJobId) return;
    let active = true;
    (async () => {
      const [{ data: job, error }, { data: loc }] = await Promise.all([
        fetchJobById(reuseJobId),
        fetchJobLocation(reuseJobId),
      ]);
      if (!active) return;
      if (error || !job) {
        setLoadingJob(false);
        await alertAsync('Could not open that job', userMessage(error, 'Start a new post instead.'));
        return;
      }
      setTitle(job.title);
      setDescription(job.description);
      setCategory(job.category);
      setLocation(job.location ?? '');
      setBudgetMin(job.budget_min_cents != null ? String(job.budget_min_cents / 100) : '');
      setBudgetMax(
        job.budget_max_cents != null
          ? String(job.budget_max_cents / 100)
          : job.budget_cents != null
            ? String(job.budget_cents / 100)
            : ''
      );
      setPricingMode(pricingModeFrom(job.pricing_mode));
      if (loc) {
        if (loc.lat != null && loc.lng != null) setCoords({ lat: loc.lat, lng: loc.lng });
        setAddress(loc.address_line ?? '');
      }
      setReusedFrom(job.title);
      setStep(POST_STEPS.length - 1);
      setLoadingJob(false);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reuseJobId]);

  /**
   * D0 — THE SUCCESS SURFACE IS NOT FADED IN, AND MUST NOT BE.
   *
   * This used to raise the whole overlay through an animated `opacity`, which
   * is a GROUP opacity: iOS composites the entire subtree offscreen and blends
   * it over the still-mounted form beneath. Every colour on the surface goes
   * through that blend, which is why the publish screen painted a different
   * green from steps 1-3 — including the bottom nav, one component that cannot
   * legitimately resolve two greens. The overlay's own `backgroundColor` was
   * never the fault: it is the opaque `background` token (it WAS
   * `rgba(244,241,232,0.97)` once, and fa88118 already replaced that).
   *
   * So the surface renders at full opacity from its first frame and the
   * entrance motion lives on the MARK instead, where it composites nothing but
   * itself.
   */
  function playSuccess() {
    successScale.setValue(reducedMotion ? 1 : 0.4);
    // #42 — with Reduce Motion there is no Seal: the live page arrives on a
    // short fade (its own content wrapper, never the overlay node — D0).
    if (reducedMotion !== false) {
      liveFade.setValue(0);
      Animated.timing(liveFade, { toValue: 1, duration: 200, useNativeDriver: USE_NATIVE_DRIVER }).start();
    }
    setShowSuccess(true);
    if (reducedMotion) return;
    Animated.spring(successScale, {
      toValue: 1,
      friction: 6,
      tension: 80,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
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
      // B11: a denied permission offers Settings; anything else says what failed.
      if (result.reason === 'denied') await askOpenSettings('location');
      else await alertAsync('Location unavailable', result.message);
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
    if (error) {
      console.error('[PostJobScreen] deleteJobPhoto failed', error);
      Sentry?.captureException(error, { extra: { site: 'PostJobScreen.handleDeleteMedia' } });
    } else {
      sessionUploadsRef.current.delete(url);
    }
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
    // F13: an own mutation — the cached hub and feed are out of date.
    invalidateJobs();
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

  /**
   * `onSaving` runs once the form has passed every check and the write is about
   * to go — the Seal starts there (#42), so a refusal in writing never leaves a
   * half-played transition on the screen.
   */
  async function handleSubmit(onSaving?: () => void) {
    if (!user || submittingRef.current) return;

    if (!title.trim() || !description.trim() || !category || !location.trim()) {
      await alertAsync(
        'Missing details',
        'Title, description, category, and location are all required.'
      );
      return;
    }

    // Hire mode negotiates a single amount; a posting carries a maximum, a
    // posted price, or nothing at all. a4: `posted` is the fresh-post and edit
    // choice only — a direct offer is one negotiated amount and has no mode.
    const posted = pricingMode === 'posted_price';
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
    } else if (Number.isNaN(budgetMaxCents)) {
      await alertAsync('Invalid budget', 'Budget amounts must be positive dollar amounts.');
      return;
    }
    // There is no range to cross-check any more: with one figure, "the
    // minimum cannot be more than the maximum" has nothing to compare.

    // a4 — a posted price IS the amount, so it cannot be left open. Refused
    // here, in the sentence that names the way out, rather than letting the
    // server's own "A posted price needs an amount" arrive as an alert.
    if (!isHiring && posted && (budgetMaxCents == null || Number.isNaN(budgetMaxCents))) {
      // 2026-09-28 (#36): Publish already waits for a price; this is the
      // written backstop, naming the field that takes it.
      await alertAsync(
        'Set your price',
        'A posted price needs an amount. Choose one in Your price, or switch to Ask for bids.'
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
    onSaving?.();
    // The server mirrors the range's ceiling into the legacy single
    // budget_cents, so nothing is passed for it here — one writer, one rule.
    const jobInput = {
      title: title.trim(),
      description: description.trim(),
      category,
      location: location.trim(),
      // a4 — ONE TYPED FIGURE, TWO COLUMNS. The `budgetMax` state is the price
      // in posted mode and the maximum in open mode, so it is written to
      // whichever column that mode means. The server's own CHECK backs this:
      // a posted-price row carries budget_cents and no range.
      budgetCents: posted ? budgetMaxCents : null,
      // D16 — THIS SCREEN NO LONGER WRITES A MINIMUM. The field is gone, so
      // there is no minimum to write and null is the honest value. The column
      // stays, every other reader of it stays, and nothing is migrated: this
      // is one writer declining to write, not a schema change.
      budgetMinCents: null,
      budgetMaxCents: posted ? null : budgetMaxCents,
      pricingMode,
      neededToday: isFreshPost && neededToday,
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
    // F13: an own mutation — the cached hub and feed are out of date.
    invalidateJobs();
    submittingRef.current = false;

    if (error) {
      if (!screenMountedRef.current) {
        cleanupSessionUploads();
        return;
      }
      setSubmitting(false);
      // #42 — the Seal undoes itself: no tick is drawn for a save that failed.
      if (sealActiveRef.current) {
        sealResultRef.current = 'failed';
        setSeal((current) => (current ? { ...current, phase: 'failed' } : current));
      }
      await alertAsync(
        isEditing ? 'Could not save changes' : 'Could not post job',
        userMessage(error)
      );
      return;
    }
    uploadsCommittedRef.current = true;
    // The one thing that makes the unmount below NOT an abandonment. Set from
    // the same success branch that commits the uploads, and read in the
    // cleanup — a ref rather than state so nothing repaints for it.
    postSavedRef.current = true;
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
          if (error) {
            console.error('[PostJobScreen] deleteJobPhoto failed', error);
            Sentry?.captureException(error, {
              extra: { site: 'PostJobScreen.handleSubmit', stage: 'photo' },
            });
          }
        });
      }
      for (const url of originalVideosRef.current) {
        if (videos.includes(url)) continue;
        deleteJobPhoto(url).then(({ error }) => {
          if (error) {
            console.error('[PostJobScreen] deleteJobPhoto (video) failed', error);
            Sentry?.captureException(error, {
              extra: { site: 'PostJobScreen.handleSubmit', stage: 'video' },
            });
          }
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
      // Idea 14: the live job becomes the series' first visit. It is posted whatever happens here.
      if (savedJob && isFreshPost && repeatCadence) void startRepeat(savedJob.id, repeatCadence);
    }

    // #42 — THE SERVER HAS CONFIRMED: only now may the Seal's tick draw; the
    // live page opens from it (SealTransition calls back). Without a Seal (Reduce
    // Motion, an edit, a hire) the surface arrives as it always has.
    if (sealActiveRef.current) {
      sealResultRef.current = 'saved';
      setSeal((current) => (current ? { ...current, phase: 'saved' } : current));
      return;
    }
    playSuccess();
  }

  // Whether this save runs under a Seal, and — for the one frame where the
  // server answers before the pill has been measured — what it answered.
  const sealActiveRef = useRef(false);
  const sealResultRef = useRef<SealPhase | null>(null);

  /**
   * #42 — PUBLISH. A fresh post, with motion allowed, publishes under the Seal:
   * the pill's box is measured where it stands and the transition runs while
   * the job saves. Everything else — an edit, a hire, Reduce Motion — saves as
   * before; with Reduce Motion the live page arrives on a short fade.
   */
  function onPublish() {
    if (isFreshPost && reducedMotion === false) {
      void handleSubmit(() => {
        sealActiveRef.current = true;
        sealResultRef.current = null;
        primarySlotRef.current?.measureInWindow((x, y, width, height) => {
          setSeal({ from: { x, y, width, height }, phase: sealResultRef.current ?? 'saving' });
        });
      });
      return;
    }
    void handleSubmit();
  }

  /** The Seal has covered the screen from its tick: the live page takes it. */
  function onSealOpened() {
    setSeal(null);
    sealActiveRef.current = false;
    playSuccess();
  }

  /** A failed save has undone the Seal: the bar is the user's again. */
  function onSealUndone() {
    setSeal(null);
    sealActiveRef.current = false;
  }

  /** #38 — a summary detail opens the step it came from; BUDGET opens the list. */
  function onSummaryEdit(target: SummaryTarget) {
    if (target === 'describe' || target === 'category') {
      setStep(0);
      return;
    }
    if (target === 'area' || target === 'timing' || target === 'address') {
      setStep(2);
      return;
    }
    // The list brings its field back under the header, then drops down.
    priceRef.current?.open();
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
      ? 'Photos and clips are optional, but they help.'
      : step === POST_STEPS.length - 1 && (isEditing || isHiring)
        ? 'Check the details. You can still go back.'
        : step === POST_STEPS.length - 1 && reusedFrom
          ? 'Change anything, or just Publish.'
          : currentStep.subtitle;
  // Idea 2 (the Fable review): the source on a line of its own, so a long title never eats the instruction.
  const reusedLine = step === POST_STEPS.length - 1 && reusedFrom && !isEditing && !isHiring ? `Copied from “${reusedFrom}”` : null;
  const reviewBudgetCents = dollarsToCents(budget);
  const reviewMaxCents = dollarsToCents(budgetMax);
  const validMax =
    reviewMaxCents != null && !Number.isNaN(reviewMaxCents) ? reviewMaxCents : null;
  const postedPrice = pricingMode === 'posted_price';
  // #38 — THE SUMMARY'S BUDGET CELL, from the SAME resolved cents the price
  // field shows, so the two can never disagree: a direct offer's one amount, a
  // posted price, or an open-bids maximum written "Up to $X" — one figure,
  // never a minimum (D16). An empty posted price is a missing one ("Choose a
  // price"), not an open budget.
  const summaryCents = isHiring
    ? reviewBudgetCents != null && !Number.isNaN(reviewBudgetCents)
      ? reviewBudgetCents
      : null
    : validMax;
  const summaryEmpty = isHiring ? 'Required before sending' : postedPrice ? 'Choose a price' : 'No maximum';
  // #36 — a posted price with no amount cannot publish; Publish waits for one.
  const priceMissing = !isHiring && postedPrice && validMax == null;
  const reviewTiming =
    arrivalWindowLabel({
      scheduled_date: scheduledDate,
      arrival_start_hour: arrivalStartHour,
      arrival_end_hour: arrivalEndHour,
    }) ?? 'Flexible';
  // F18: the fourteen day labels change only when the day turns over, so they
  // are not rebuilt on every keystroke.
  const dayKey = toLocalIsoDate(new Date());
  // eslint-disable-next-line react-hooks/exhaustive-deps -- dayKey is the dependency
  const scheduleDates = useMemo(upcomingDates, [dayKey]);

  // §3 conversion aids — fresh posts only. Edit keeps legacy content legal
  // (no floor retro-applied to an old description) and a hire request is a
  // negotiated single amount, not a budget to be guided.
  const descNeeded = isFreshPost ? descriptionCharsNeeded(description) : 0;
  // Tier A (C6): the seeded range renders only behind PRICE_GUIDANCE (off
  // until a source is attributed) — the predicate below is otherwise unchanged.
  const guidanceLines = isFreshPost && PRICE_GUIDANCE ? priceGuidanceLines(category) : null;
  const bothBudgetsEmpty = !budgetMin.trim() && !budgetMax.trim();
  const showPriceGuidance = !!guidanceLines && (bothBudgetsEmpty || !editingBudget);

  // D1-D4 — NAVIGATION LIVES IN THE HEADER NOW, derived from the step list so
  // the two links can never name a step the wizard does not have. Leaving the
  // first step exits the flow, so its left link names where that lands;
  // everywhere else the two links are simply the neighbouring steps. The last
  // step has no right link at all — its forward action is Publish, which is a
  // commitment and belongs on a pinned button, not on a chevron.
  const isLastStep = step === POST_STEPS.length - 1;
  // M-7 — the first step's back is a plain chevron, like every other pushed
  // screen: the wizard opens from Home, My Jobs, a worker's profile and
  // discovery, and "Home" named only one of those.
  // 2026-09-28 (LUX-LIST-64 #30): step 1 names where the flow was opened from
  // ("‹ Home"); every later step names the step behind it.
  const backLabel = step === 0 ? originLabel(navigation.getState()) : POST_STEPS[step - 1].label;
  const advanceLabel = isLastStep ? undefined : POST_STEPS[step + 1].label;
  // D3 — THE FLOOR'S RULE, WRITTEN ONCE. This is the expression the Continue
  // button carried before the footers came off steps 1-3: the description
  // floor gates the Describe step only, and an upload in flight gates every
  // step. The header link and the Publish button both read it, so the two
  // controls cannot drift into two rules (P3-31).
  const advanceDisabled =
    uploadingPhoto || uploadingVideo || (step === 0 && descNeeded > 0);
  // M-7 — WHAT STANDS BETWEEN THIS STEP AND THE NEXT, SAID BEFORE THE TAP.
  // handleContinue's alerts answered after a tap; the pinned footer now names
  // the one missing thing directly above a disabled Continue, and the header
  // link reads the same answer. Null when the step can advance. The last step
  // has no blocker of its own — Publish keeps its own guards.
  // 2026-09-27 (the Lux remake, the operator's Post-a-job pictures): the
  // reason sits UNDER THE FIELD THAT BLOCKS the step, in as few words as say
  // it ("6 more characters", "Pick a category"); the header's forward link
  // greys out on the same answer. `blockedField` names where it is drawn.
  const blockedField: 'title' | 'description' | 'category' | 'area' | null =
    step === 0
      ? !title.trim()
        ? 'title'
        : !description.trim() || descNeeded > 0
          ? 'description'
          : !category
            ? 'category'
            : null
      : step === 2 && !location.trim()
        ? 'area'
        : null;
  const stepBlocker =
    blockedField === 'title'
      ? 'Add a title'
      : blockedField === 'description'
        ? !description.trim()
          ? 'Add a description'
          : `${descNeeded} more ${descNeeded === 1 ? 'character' : 'characters'}`
        : blockedField === 'category'
          ? 'Pick a category'
          : blockedField === 'area'
            ? 'Add an area'
            : null;
  const reasonUnder = (field: typeof blockedField) =>
    blockedField === field && stepBlocker ? (
      <Text style={styles.fieldReason} accessibilityLiveRegion="polite">
        {stepBlocker}
        <Announce message={stepBlocker} />
      </Text>
    ) : null;
  // 2026-09-28 (LUX-LIST-64 #38, #41): the last step's footer note is gone with
  // the footer — an upload in flight is said on Publish itself ("Uploading…"),
  // the one place it waits, and the blocker lines sit under their fields.
  const uploadingNow = advanceDisabled || summaryUploading;
  const primaryLabel = uploadingNow
    ? 'Uploading…'
    : isEditing
      ? 'Save changes'
      : isHiring
        ? 'Send request'
        : 'Publish';

  return (
    <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={['top']}>
      <ScreenHeader
        title={isEditing ? 'Edit Job' : isHiring ? 'Send an Offer' : 'Post a Job'}
        onBack={handleBack}
        backLabel={backLabel}
        rightLabel={advanceLabel}
        onPressRight={handleContinue}
        rightDisabled={advanceDisabled || stepBlocker != null}
        centerTitle
        palette={emeraldColors}
      />

      {loadingJob ? (
        <ScreenStateView state={SPINNER_STATE} />
      ) : (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View ref={bandRef} collapsable={false} style={styles.flex}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.content,
            { paddingHorizontal: contentPaddingX, gap: contentGap },
            // Only the last step has a footer to clear (no footer padding on
            // steps 1-3 — the operator's "no pinned Continue, no footer padding").
            isLastStep ? styles.contentWithFooter : { paddingBottom: navClearance },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View ref={introRef} collapsable={false} style={styles.stepIntro}>
            {/* C1 — keyed by step, so the heading trio re-enters with the
                step it introduces. The progress row below stays put: it is
                the wizard's persistent chrome, not the step's content. */}
            <StepPane key={`intro-${step}`} style={styles.stepIntroText}>
              {/* Eyebrow law (decision 6): "STEP 2 OF 4" labels STRUCTURE, so
                  it is gold in dark. Light keeps the Heritage emerald. */}
              <Text style={[styles.stepEyebrow, isDark && styles.stepEyebrowDark]}>
                STEP {step + 1} OF {POST_STEPS.length}
              </Text>
              <Text style={styles.stepTitle}>{currentStepTitle}</Text>
              {/* Idea 2: a reused post says where it came from, in the accent, on its own line. */}
              {reusedLine ? (
                <Text style={[styles.stepSubtitle, styles.stepSubtitleReused]} numberOfLines={1}>
                  {reusedLine}
                </Text>
              ) : null}
              <Text style={[styles.stepSubtitle, reusedLine ? styles.stepSubtitleUnder : null]}>{currentStepSubtitle}</Text>
            </StepPane>

            <View
              style={styles.progressRow}
              accessible
              accessibilityLabel={`Step ${step + 1} of ${POST_STEPS.length}: ${currentStep.label}`}
            >
              {POST_STEPS.map((item, index) => (
                <View key={item.label} style={styles.progressItem}>
                  <View style={[styles.progressSegment, { height: progressHeight }]}>
                    <Animated.View
                      style={[styles.progressSegmentActive, { opacity: segmentFills[index] }]}
                    />
                  </View>
                  {/* D6 — the active step must be the BRIGHTEST label in the
                      row. It was `forest`, which under Prestige is a fill
                      colour, so the step you are on read dimmer than the ones
                      you are not. */}
                  <Text
                    style={[
                      styles.progressLabel,
                      index === step && styles.progressLabelActive,
                      index === step && isDark && styles.progressLabelActiveDark,
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
              <Text style={[styles.hireBannerText, isDark && styles.hireBannerTextDark]}>
                {hireWorkerName} will get this as a request in your chat. They can accept, decline, or suggest a different price.
              </Text>
            </View>
          )}

          {/* C1 — one pane per step, keyed by the step index: the arriving
              step's fields enter together, one stagger beat after the
              heading trio above. Layout at rest is unchanged — the pane
              carries the scroller's own gap between its children. */}
          <StepPane key={`fields-${step}`} index={1} style={styles.stepPane}>

          {step === 0 && (
            <View style={[styles.stepFields, { gap: stepFieldsGap }]}>
              {/* 2026-09-27 (the operator's review, the Lux post pages): the
                  title and the description sit in ONE pop-out card, and the
                  category chips under it on the ground — the reference's
                  grouping, nothing else moved. */}
              <Card style={[styles.fieldCard, { gap: stepFieldsGap }]}>
              <TextField
                palette={emeraldColors}
                label="Title"
                value={titleDictation.value}
                onChangeText={setTitle}
                accessory={titleDictation.accessory}
                // M-7 — a required field says so, in the slot its count
                // already sits in.
                hint={`Required · ${title.length}/${MAX_TITLE_LENGTH}`}
                maxLength={MAX_TITLE_LENGTH}
                placeholder="e.g. Walk my dog on weekdays"
                autoCapitalize="sentences"
              />
              {reasonUnder('title')}

              <TextField
                palette={emeraldColors}
                label="Description"
                value={descriptionDictation.value}
                onChangeText={setDescription}
                accessory={descriptionDictation.accessory}
                hint={`Required · ${description.length}/${MAX_DESCRIPTION_LENGTH}`}
                maxLength={MAX_DESCRIPTION_LENGTH}
                placeholder="Describe what you need done…"
                autoCapitalize="sentences"
                multiline
                numberOfLines={4}
                style={[styles.multiline, { height: descriptionHeight }]}
              />
              {/* §3.3 — the floor is a greyed forward link plus its written
                  count, never a raw error and never a silently dead control.
                  2026-09-27: the count sits under the description it counts. */}
              {reasonUnder('description')}
              </Card>
            </View>
          )}

          {step === 0 && (
            <View style={styles.field}>
              {/* M-7 — the shared field label, so Category reads like Title
                  and Description above it, with its Required mark. */}
              <View style={styles.labelRow}>
                <FieldLabel palette={emeraldColors}>Category</FieldLabel>
                <Text style={styles.requiredHint}>Required</Text>
                {/* The Fable review: the row slides past its first four — said as Discover's row says it. */}
                <Text style={styles.swipeHint}>Swipe to explore</Text>
              </View>
              {/* 2026-09-30 (idea 23): Home's tiles, one per postable category, sliding. The
                  chosen tile widens for its check and drops a small arrow; its usual questions open
                  in the page under the row, and the page scrolls itself to show them. C2a stands —
                  tapping the chosen tile again clears the category, and the header then says "Pick a
                  category to continue". M-7 stands — Other is an ordinary tile. */}
              <CategoryTileRow
                categories={POSTABLE_TILES}
                selected={category}
                questionsOpen={questionsOpen}
                onSelect={chooseCategory}
                onToggleQuestions={toggleQuestions}
                inset={contentPaddingX}
              />
              {reasonUnder('category')}
              <View ref={questionsRef} collapsable={false}>
                <PostQuestions
                  category={category}
                  open={questionsOpen}
                  answers={answers}
                  onAnswer={answerQuestion}
                  onSkip={() => setQuestionsOpen(false)}
                  revealKey={revealKey}
                  onShown={revealQuestions}
                />
              </View>
            </View>
          )}

          {step === 1 && (
            <View style={[styles.stepFields, { gap: stepFieldsGap }]}>
              {/* The privacy notice read forest-on-mint: one deep green on
                  another. Its body takes the cream ink in dark. */}
              {/* PJ1 (C4) — one plain sentence, no heading: the heading D7
                  added is deleted outright, and the body is the exact PJ1
                  copy. At 393pt it wraps to two lines at the card's current
                  padding (measured: the text column is ~259pt and the
                  sentence needs ≥246 before it takes a third line), so no
                  padding moved. */}
              {/* 2026-09-28 (LUX-LIST-64 #31): the operator's sentence, two lines
                  at most at 393 wide, and the crossed-out eye in the error red —
                  the one dark red in dark, the light palette's own red in light. */}
              <Card style={styles.infoCard}>
                <View style={styles.infoIcon}>
                  {/* C6 — the "not visible" eye, replacing the shield: this
                      notice is about what must not be SEEN. */}
                  <EyeOffIcon color={colors.danger} />
                </View>
                <Text style={[styles.infoText, isDark && styles.infoTextDark]}>
                  Avoid faces, documents, plates, addresses and personal details. Just show the job.
                </Text>
              </Card>

              {/* The one canonical MediaUploader primitive (§O never-duplicate
                  list; §N risk 9). It owns the pick + append-only-on-success
                  rule; this screen supplies the bucket calls and the
                  ownership rule for removals. */}
              <MediaUploader
                kind="photo"
                label="Photos (optional)"
                // PJ1 (C5) — the whole media section renders 20% up.
                scale={1.2}
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
                  // PJ1 (C5) — same 20% scale as the photos above it. The one
                  // clip tile was twice its post-scale width (202pt); 2026-09-28
                  // (LUX-LIST-64 #33) it narrows to the operator's line, ~164pt
                  // (1.63 × the 101pt tile height), its camera glyph centred.
                  scale={1.2}
                  tileAspect={1.63}
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
                {/* PJ1 (C4) — the badge beside the counter says the minute
                    now, so the caption keeps only the explanation, on ONE
                    line at 393pt. C5's 20% scale is capped by that rule: at
                    14pt the sentence overflows the 345pt column even fully
                    tightened (measured 351), so the caption stops at 13pt
                    with -0.3 tracking (330 of 345). */}
                <Text style={styles.videoHint}>
                  A short clip explains an awkward job fast.
                </Text>
              </View>
            </View>
          )}

          {step === 2 && (
            <View style={[styles.stepFields, { gap: stepFieldsGap }]}>
              {/* 2026-09-27 (the operator's review, the Lux "Where and when"
                  page): the area, the locate disc and the private address in
                  ONE pop-out card; the day and the arrival window under it. */}
              <Card style={[styles.fieldCard, { gap: stepFieldsGap }]}>
              <View style={styles.locationRow}>
                <View style={styles.locationField}>
                  <TextField
                    palette={emeraldColors}
                    label="Area or neighborhood"
                    hint="Required"
                    value={location}
                    onChangeText={(text) => {
                      setLocation(text);
                      // Typing over a resolved place invalidates its coordinates.
                      if (coords) setCoords(null);
                    }}
                    placeholder="e.g. Sheepshead Bay"
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
                  {/* 2026-09-28 (LUX-LIST-64 #34): the pin 25% bigger (20 → 25),
                      centred in its square. */}
                  {locating ? (
                    <ActivityIndicator size="small" color={colors.onForest} />
                  ) : (
                    <Ionicons name="location" size={25} color={colors.onForest} />
                  )}
                </Pressable>
              </View>
              {reasonUnder('area')}

              {/* PJ1 (C7) — the approximate-area info card is deleted. The
                  privacy fact still reads twice on this same step: the step
                  subtitle ("Workers browsing see only the area. The exact
                  address stays private until you hire someone.") and the
                  address field's caption ("Only the worker you hire sees
                  it."). */}

              {/* The exact address and timing are meaningless for a direct
                  offer (the negotiation carries its own terms — Phase 5's
                  surface), so hire mode keeps the plain location step. */}
              {/* D12 — THE CAPTION CAME OUT OF THE LABEL ROW. TextField
                  lays a `hint` beside the label, which works for a two-
                  word character count and not for a sentence: this label
                  is the longest in the app and the sentence ran off the
                  right edge on top of it. Below the field it is a plain
                  caption with the whole width, and the label owns its
                  row alone. */}
              {!isHiring && (
                  <View style={styles.field}>
                    {/* 2026-09-28 (LUX-LIST-64 #34): "SERVICE ADDRESS" stays the
                        gold eyebrow; "(private, optional)" moves beside it in the
                        same quiet grey as "Required", not bold — the label is short
                        enough now for the hint to share its row. */}
                    <TextField
                      palette={emeraldColors}
                      label="Service address"
                      hint="(private, optional)"
                      value={address}
                      onChangeText={setAddress}
                      placeholder="e.g. 2410 Emmons Ave, Apt 3B"
                      autoCapitalize="words"
                    />
                    <Text style={styles.fieldHint}>
                      Only the worker you hire sees it.
                    </Text>
                  </View>
              )}
              </Card>

              {!isHiring && (
                <>
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
            <View style={[styles.stepFields, { gap: stepFieldsGap }]}>
              {/* 2026-09-28 (LUX-LIST-64 #36, #37) — THE PRICE FIRST, right under
                  the step bars and above the summary: "Ask for bids | Set a
                  price" (with its two glyphs) and the one field that opens the
                  price list (components/PriceDropdown.tsx) — the pencil and its
                  budget dialog are gone. A direct offer keeps its own amount. */}
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
                  <PriceDropdown
                    ref={priceRef}
                    mode={pricingMode}
                    amount={budgetMax}
                    onModeChange={setPricingMode}
                    onAmountChange={setBudgetMax}
                    onEditingChange={setEditingBudget}
                    viewport={priceViewport}
                    palette={emeraldColors}
                  />
                  {/* §3.2 — static typical range for the chosen category.
                      Steps aside while an amount is being typed; categories
                      with no seeded range render nothing. No locality claim:
                      the table is static and cannot support one. */}
                  {showPriceGuidance && guidanceLines ? (
                    <View style={styles.guidanceCard}>
                      <Text style={[styles.guidanceRange, isDark && styles.guidanceRangeDark]}>
                        {guidanceLines[0]}
                      </Text>
                      <Text style={styles.guidanceNote}>{guidanceLines[1]}</Text>
                    </View>
                  ) : null}
                </View>
              )}

              {/* 2026-09-30 (idea 12): "Need it today", a fresh post's own — the drawn row: the
                  flash, the words, the switch, off until turned on. */}
              {isFreshPost ? (
                // The Fable review: the whole row answers a tap, as the repeat row below does.
                <Pressable
                  onPress={() => setNeedItToday(!neededToday)}
                  style={({ pressed }) => [styles.todayRow, pressed && styles.repeatPressed]}
                  accessible={false}
                >
                  <Ionicons name="flash-outline" size={18} color={colors.emerald} />
                  <View style={styles.todayCopy}>
                    <Text style={styles.todayTitle}>Need it today</Text>
                    <Text style={styles.todayCaption}>Nearby workers get an instant alert</Text>
                  </View>
                  <Toggle value={neededToday} onValueChange={setNeedItToday} accessibilityLabel="Need it today" />
                </Pressable>
              ) : null}

              {/* 2026-09-30 (idea 14): "Repeat this job · Every 2 weeks" — the drawn row, a fresh post's
                  own: the words and the choice at the right; it opens in place to the four choices. */}
              {isFreshPost ? (
                <View>
                  <Pressable
                    onPress={() => {
                      const opening = !repeatOpen;
                      setRepeatOpen(opening);
                      if (opening) revealInView(repeatRef);
                    }}
                    style={({ pressed }) => [styles.todayRow, pressed && styles.repeatPressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Repeat this job"
                    accessibilityValue={{ text: repeatCadence ? CADENCE_LABELS[repeatCadence] : 'Off' }}
                    accessibilityState={{ expanded: repeatOpen }}
                  >
                    <Ionicons name="repeat-outline" size={18} color={colors.emerald} />
                    <View style={styles.todayCopy}>
                      <Text style={styles.todayTitle}>Repeat this job</Text>
                      <Text style={styles.todayCaption} numberOfLines={1}>
                        Same worker gets first pick
                      </Text>
                    </View>
                    <Text style={[styles.repeatValue, repeatCadence ? styles.repeatValueOn : null]}>
                      {repeatCadence ? CADENCE_LABELS[repeatCadence] : 'Off'}
                    </Text>
                    <DropdownChevron open={repeatOpen}>
                      <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                    </DropdownChevron>
                  </Pressable>
                  <DropdownBody open={repeatOpen}>
                    <View style={styles.repeatList} ref={repeatRef} collapsable={false}>
                      {[null, ...SERIES_CADENCES].map((cadence) => {
                        const chosen = repeatCadence === cadence;
                        const label = cadence ? CADENCE_LABELS[cadence] : 'Off';
                        return (
                          <Pressable
                            key={cadence ?? 'off'}
                            onPress={() => {
                              setRepeatCadence(cadence);
                              setRepeatOpen(false);
                            }}
                            style={({ pressed }) => [styles.repeatOption, pressed && styles.repeatPressed]}
                            accessibilityRole="button"
                            accessibilityLabel={label}
                            accessibilityState={{ selected: chosen }}
                          >
                            <View style={styles.repeatTick}>
                              {chosen ? <Ionicons name="checkmark" size={16} color={colors.emerald} /> : null}
                            </View>
                            <Text style={[styles.repeatOptionText, chosen && styles.repeatValueOn]}>{label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={styles.repeatHint}>
                      Three days before each visit, they get it first at the same price. You confirm and pay each visit.
                    </Text>
                  </DropdownBody>
                </View>
              ) : null}

              {/* #38 — the summary, rebuilt from refs/job-summary.html: every
                  detail opens its own step, the media are managed in place,
                  and BUDGET opens the price list above. */}
              <JobSummaryCard
                title={title.trim()}
                description={description.trim()}
                categoryLabel={category ? JOB_CATEGORY_LABELS[category] : null}
                area={location.trim()}
                timing={reviewTiming}
                address={address.trim()}
                showSchedule={!isHiring}
                budgetLabel={isHiring ? 'Offer' : priceRowLabel(pricingMode)}
                budgetCents={summaryCents}
                budgetUpTo={!isHiring && !postedPrice}
                budgetEmpty={summaryEmpty}
                photos={photos}
                videos={videos}
                setPhotos={setPhotos}
                setVideos={setVideos}
                // A hire request goes through create_offer(), whose server cap
                // is still 5; a posting's create_job() takes 10 (phase49).
                maxPhotos={isHiring ? 5 : MAX_PHOTOS}
                maxVideos={MAX_VIDEOS}
                uploadPhoto={handleUploadPhoto}
                uploadVideo={handleUploadVideo}
                deleteMedia={handleDeleteMedia}
                shouldDeleteOnRemove={(url) => !originalPhotosRef.current.has(url) && !originalVideosRef.current.has(url)}
                validateVideo={(asset) =>
                  rejectionForPickedVideo(asset, {
                    maxDurationMs: MAX_VIDEO_DURATION_MS,
                    maxBytes: MAX_VIDEO_BYTES,
                  })
                }
                videoMaxDurationSec={MAX_VIDEO_DURATION_MS / 1000}
                onUploadingChange={setSummaryUploading}
                onUploadError={(message) => void alertAsync('Upload failed', message)}
                onToast={setToast}
                onEdit={onSummaryEdit}
                disabled={submitting || !user}
                cornerRadius={reviewCardRadius}
              />

              {/* #41 — above the bar, one line: what Publish does. */}
              <View style={styles.publishNotice}>
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.emerald} />
                <Text style={styles.publishNoticeText} numberOfLines={1}>
                  {isHiring
                    ? `Only ${hireWorkerName} receives this request.`
                    : isEditing
                      ? 'Saving updates this existing job for workers nearby.'
                    : 'Publishing makes this job visible to workers nearby.'}
                </Text>
              </View>
            </View>
          )}

          </StepPane>

        </ScrollView>
        </View>

        {/* 2026-09-27 (the Lux remake, ruling 13): NO pinned Continue on steps
            1-3 — the way forward is the header's link. 2026-09-28 (LUX-LIST-64
            #41) — THE LAST STEP'S BAR (components/PostJobBar.tsx), right above
            the tab bar: "Save draft" (a fresh post's) beside the commitment —
            Publish with its rocket, "Save changes", "Send request". Publish
            waits, grey on the deep green, while a file uploads ("Uploading…")
            or a set price is still missing. */}
        {isLastStep && !showSuccess ? (
          <PostJobBar
            secondary={
              usesDraft
                ? { label: 'Save draft', onPress: () => setLeaving(true), accessibilityLabel: 'Save draft and go Home' }
                : undefined
            }
            secondaryIcon="save-outline"
            primary={{ label: primaryLabel, onPress: onPublish }}
            primaryIcon={isFreshPost && !uploadingNow ? 'rocket-outline' : undefined}
            primaryDisabled={uploadingNow || priceMissing || submitting}
            primaryRef={primarySlotRef}
            hidePrimary={seal != null}
            hideSecondary={seal != null || uploadingNow}
          />
        ) : null}
      </KeyboardAvoidingView>
      )}

      {showSuccess && (
        /* D0: a plain View. An animated `opacity` here group-composites the
           whole surface over the form — see playSuccess(). */
        <View style={styles.successOverlay} accessibilityViewIsModal>
          {!isEditing && !isHiring ? (
            /* 2026-09-28 (LUX-LIST-64 #42) — THE LIVE PAGE (components/
               JobLivePage.tsx), which the Seal opens from its tick. It reads
               the SAVED row; if the save returned none, what was sent. With
               Reduce Motion it arrives on a short fade — on its own wrapper,
               never on this overlay node (D0). */
            <Animated.View style={[styles.flex, { opacity: liveFade }]}>
              <JobLivePage
                job={
                  publishedJob ?? {
                    title: title.trim(),
                    category: category ?? 'other',
                    location: location.trim(),
                    pricing_mode: pricingMode,
                    budget_cents: postedPrice ? validMax : null,
                    budget_max_cents: postedPrice ? null : validMax,
                    scheduled_date: scheduledDate,
                    arrival_start_hour: arrivalStartHour,
                    arrival_end_hour: arrivalEndHour,
                  }
                }
                onBackHome={() => leaveAfterSuccess(false)}
                onViewJob={leaveToPublishedJob}
              />
            </Animated.View>
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
        </View>
      )}

      <PhotoViewer
        visible={!!viewerUri}
        uri={viewerUri}
        onClose={() => setViewerUri(null)}
      />

      {/* 2026-09-28 (LUX-LIST-64 #36): the budget dialog behind the pencil is
          gone — the price list on the step is the one way to set the amount. */}

      {/* #38 — the summary's note ("Photo removed · Undo"), above the bar. */}
      {/* It floats over the bar — its button and its 1pt line — with the
          column's own breathing room, read at use time (T1). */}
      <UndoToast
        message={toast?.message ?? null}
        onUndo={toast?.undo}
        onExpire={() => setToast(null)}
        bottom={footerPad + POST_BAR_BUTTON + 1 + spacing.md}
      />

      {/* #42 — the Seal, over everything while it runs. */}
      {seal ? (
        <SealTransition from={seal.from} phase={seal.phase} onOpened={onSealOpened} onUndone={onSealUndone} />
      ) : null}

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
  content: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  // D5 — THE LAST STEP'S SCROLLER ENDS ABOVE ITS BAR. 2026-09-28 (LUX-LIST-64
  // #41): the bar sits in the column under the scroller (it never covers it)
  // with no padding of its own, so the publish line keeps the reference's 16
  // above the bar (refs/bottom-bar.html `.above`).
  contentWithFooter: {
    paddingBottom: spacing.lg,
  },
  stepIntro: {
    gap: spacing.sm,
  },
  // C1 — the two panes restate the gaps their children shared before the
  // wrappers existed (stepIntro's sm between the heading trio; the scroll
  // content's xl between step blocks), so the resting layout cannot move.
  stepIntroText: {
    gap: spacing.sm,
  },
  stepPane: {
    gap: spacing.xl,
  },
  stepEyebrow: {
    ...EYEBROW_TYPE,
    color: colors.eyebrow,
  },
  stepEyebrowDark: { color: colors.eyebrow },
  // Decision 9: a display heading speaks the serif, in both themes — the same
  // treatment every converted screen's hero title already carries.
  stepTitle: {
    fontFamily: fonts.display,
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
  // Idea 2: "Copied from …" — the drawn line, in the accent and a touch heavier.
  stepSubtitleReused: {
    color: colors.emerald,
    fontWeight: '600',
  },
  stepSubtitleUnder: {
    marginTop: 0,
  },
  // Idea 12: the "Need it today" row — the flash, the two lines, the switch.
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    minHeight: 44,
  },
  todayCopy: { flex: 1, gap: 1 },
  todayTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  todayCaption: {
    fontSize: 12,
    color: colors.textMuted,
  },
  // Idea 14: the repeat row's choice at the right, and what opens under it.
  repeatValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  repeatValueOn: {
    color: colors.emerald,
  },
  repeatPressed: {
    opacity: 0.7,
  },
  // The choices, in place under the row: the app's dropdown rows (44pt, the platform hairline over
  // border). The tick sits first, in the row's icon column, as the price list's does; the labels
  // line up under the title.
  repeatList: {
    marginTop: spacing.xs,
  },
  repeatOption: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  repeatTick: {
    width: 18 + spacing.sm + 2,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  repeatOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  repeatHint: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
    paddingTop: spacing.sm,
    paddingLeft: 18 + spacing.sm + 2,
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
    borderRadius: radius.pill,
    backgroundColor: colors.mint2,
  },
  // 2026-09-27 (the Lux remake, ruling 6): the bar keeps today's thickness and
  // today's green (#5FAE81 in dark) through its own role, not the moved mint.
  // The fill, drawn over the track and crossfaded in (see `segmentFills`).
  progressSegmentActive: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.pill,
    backgroundColor: colors.wizardProgress,
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
  progressLabelActiveDark: { color: colors.ink },
  stepFields: {},
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
  // Body copy on a sage card was `forest` — the Heritage brand green on cream.
  // Under Prestige that is a FILL colour, so in dark each of these read as one
  // deep green on another. Cream ink in dark; light untouched.
  hireBannerText: {
    flex: 1,
    fontSize: 13,
    color: colors.forest,
    fontWeight: '600',
    lineHeight: 19,
  },
  hireBannerTextDark: { color: colors.ink },
  multiline: {
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
  // M-7 — a label row that is not a TextField (Category) carries its Required
  // mark where TextField puts a hint: the right end of the label's own row.
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  requiredHint: {
    fontSize: 12,
    color: colors.textMuted,
  },
  swipeHint: {
    marginLeft: 'auto',
    fontSize: 12,
    color: colors.textMuted,
  },
  // 2026-09-27 (the Lux remake): the reason a step cannot advance, under the
  // field that blocks it — the pinned footer that carried it is gone.
  fieldReason: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: -spacing.sm,
  },
  fieldHint: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    marginTop: -spacing.xs,
  },
  // C5 — the media caption's share of the section's 20% scale, capped by
  // C4's one-line rule (see the call site). 13pt, tracked -0.3.
  videoHint: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.3,
    color: colors.textMuted,
    marginTop: -spacing.xs,
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
  guidanceRangeDark: { color: colors.ink },
  guidanceNote: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
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
  // 2026-09-27 (the operator's review): the notice is a pop-out card row
  // (components/Card.tsx) — the material draws the fill, the rim and the
  // shadow; this only lays out the row.
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  // The Lux step cards: the field group in one pop-out, 14pt of padding.
  fieldCard: {
    padding: 14,
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
  infoTextDark: { color: colors.ink },
  // refs/bottom-bar.html `.note`: the tick 11 from its one 13pt line.
  publishNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 3,
  },
  publishNoticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
  },
  // D0 — OPAQUE GROUND, AND NO OPACITY ON THIS NODE. Both halves matter and
  // they fail the same way: the form stays mounted underneath, so a
  // translucent ground OR an animated group opacity lets it into the blend and
  // every colour on the surface shifts off its token. `background` is a
  // 6-digit hex in both palettes; the opacity binding is gone — see
  // playSuccess().
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
    ...EYEBROW_TYPE,
    color: colors.eyebrow,
  },
  successTitle: {
    fontFamily: fonts.display,
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
