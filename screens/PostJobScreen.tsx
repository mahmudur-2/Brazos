import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { Chip } from '../components/Chip';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EditBudgetDialog } from '../components/EditBudgetDialog';
import { EyeOffIcon } from '../components/EyeOffIcon';
import { OfferAmountField, validateOfferAmount } from '../components/OfferComposer';
import { PhotoViewer } from '../components/PhotoViewer';
import { ScreenHeader } from '../components/ScreenHeader';
import { ServicePickerSheet } from '../components/ServicePickerSheet';
import type { SkillCategory } from '../lib/skillCategories';
import { SuccessMark } from '../components/SuccessMark';
import { FieldLabel, TextField } from '../components/TextField';
import { useAuth } from '../hooks/useAuth';
import { useEntrance } from '../hooks/useEntrance';
import { trackIntent } from '../lib/observability/analytics';
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
  LAUNCH_EXCLUDED_CATEGORIES,
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
import { PRICE_GUIDANCE } from '../lib/featureFlags';
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
import { useDialNumber } from '../lib/designOverrides';
import {
  emeraldColorsFor,
  fonts,
  radius,
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';
import {
  LitSurface,
  MediaUploader,
  MoneyText,
  PINNED_FOOTER_BOTTOM_PADDING,
} from '../ui/primitives';
import { SuccessScreen } from '../ui/templates/SuccessScreen';
import { USE_NATIVE_DRIVER } from '../lib/motion';

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

/**
 * D18 — the summary card's MEDIA row.
 *
 * Each side pluralises on its own count, so "1 photo • 2 videos" is as
 * possible as "3 photos • 1 video". A kind with nothing attached is OMITTED
 * rather than written as a zero: "0 videos" is noise on a review screen, and
 * reading it as a fact about the posting takes a beat longer than reading the
 * photos it actually has. Nothing at all reads as "None", which is the
 * accurate answer and not a placeholder.
 *
 * "video", never "clip" — one word for one thing, everywhere in the flow.
 */
function mediaSummary(photoCount: number, videoCount: number): string {
  const parts: string[] = [];
  if (photoCount > 0) parts.push(`${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}`);
  if (videoCount > 0) parts.push(`${videoCount} ${videoCount === 1 ? 'video' : 'videos'}`);
  return parts.length > 0 ? parts.join(' • ') : 'None';
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

/**
 * RUN PUBLISH1 (C1) — the publish surface's cards carry Home's wash.
 *
 * COPIED, NOT CHOSEN: 0.04 is `CARD_LIFT_ALPHA` in screens/HomeScreen.tsx, the
 * value the lit promo card ships with. There is no master for the publish
 * screen, so the design authority is the language already on Home, and a
 * second alpha here would be a second decision about the same wash.
 */
const PUBLISH_CARD_LIFT_ALPHA = 0.04;

/**
 * RUN PJ1 (C3) — THE "OTHER" PILL'S SHEET ROWS.
 *
 * Home's "Other services" sheet (components/ServicePickerSheet.tsx) is reused
 * verbatim — no prop was added and no caller changed. What differs is the
 * list: Home browses WORKERS, so its rows come from lib/skillCategories'
 * search entry points; this screen writes a JOB, whose category must be a
 * value the `job_category` enum accepts — so the rows are JOB_CATEGORIES,
 * the one source create_job() is typed against, each with the label and
 * glyph the pills themselves draw. "Other" is itself a row, so choosing it
 * selects the Other category.
 */
/**
 * Tier A (C7) — THE ONE FILTER SITE of the launch posting allowlist. Every
 * enumeration on this screen (the pills, their measurement pass, the packing,
 * the Other sheet's rows and its pick) reads this list; the shared map is
 * untouched and every other surface keeps reading it whole.
 */
const POSTABLE_CATEGORIES: readonly JobCategory[] = JOB_CATEGORIES.filter(
  (c) => !LAUNCH_EXCLUDED_CATEGORIES.includes(c)
);

const OTHER_SHEET_SERVICES: SkillCategory[] = POSTABLE_CATEGORIES.map((c) => ({
  key: c,
  label: JOB_CATEGORY_LABELS[c],
  icon: JOB_CATEGORY_ICONS[c],
}));

/**
 * RUN PJ1 (C2b) — FIRST-FIT-DECREASING PACKING OF THE CATEGORY PILLS.
 *
 * The pills keep their natural content width and the row keeps its uniform
 * gap; only the RENDER ORDER changes, so flexWrap fills each row as fully as
 * first-fit-decreasing gets it instead of leaving large dead ends. Computed
 * once from real measured widths, deterministic (widths sort descending with
 * the source order as the tiebreak). "Other" never participates — it renders
 * last regardless of fit, because C3 gives it the category sheet.
 *
 * Flattening the packed rows re-wraps identically under flexWrap: every
 * row's prefix fits by construction, and a row's first item was placed there
 * precisely because no earlier row had room for it at the time — and earlier
 * rows only ever grew. The half-point epsilon absorbs sub-pixel layout noise;
 * at worst it wraps one pill a row early, which is still a legal layout.
 */
function packCategoryChips(
  widths: ReadonlyMap<JobCategory, number>,
  rowWidth: number,
  gap: number
): JobCategory[] {
  const packable = POSTABLE_CATEGORIES.filter((c) => c !== 'other');
  const sorted = [...packable].sort(
    (a, b) =>
      (widths.get(b) ?? 0) - (widths.get(a) ?? 0) ||
      packable.indexOf(a) - packable.indexOf(b)
  );
  const rows: { used: number; items: JobCategory[] }[] = [];
  for (const c of sorted) {
    const w = widths.get(c) ?? 0;
    const row = rows.find((r) => r.used + gap + w <= rowWidth - 0.5);
    if (row) {
      row.items.push(c);
      row.used += gap + w;
    } else {
      rows.push({ used: w, items: [c] });
    }
  }
  return [...rows.flatMap((r) => r.items), 'other'];
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
  const entrance = useEntrance(index);
  return <Animated.View style={[style, entrance]}>{children}</Animated.View>;
}

export function PostJobScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // RUN T2 (C3) — POST A JOB'S OWN DIALS. Each falls back to the value this
  // file drew before the dial existed, spelled here and nowhere else. The four
  // that answer to a token take the `theme.*` scale, because this file imports
  // `spacing`/`radius` from lib/theme; ui/tokens' bare `spacing.xl` is 20
  // against theme's 24, so the wrong parent would move the gutter by four
  // points the moment the operator turned it.
  const contentPaddingX = useDialNumber('postJob.content.paddingX') ?? spacing.xl;
  const contentGap = useDialNumber('postJob.content.gap') ?? spacing.xl;
  const progressHeight = useDialNumber('postJob.progress.height') ?? 4;
  const stepFieldsGap = useDialNumber('postJob.stepFields.gap') ?? spacing.lg;
  const descriptionHeight = useDialNumber('postJob.description.height') ?? 110;
  const reviewCardRadius = useDialNumber('postJob.reviewCard.radius') ?? radius.xl;
  // home(7): the Back/Continue footer is PINNED above the pill, not scrolled
  // under it, so it no longer takes useFloatingNavClearance() — that reserved
  // the bar's ~104pt footprint a second time and left a hand's width of empty
  // chrome under the buttons. Its bottom padding is
  // PINNED_FOOTER_BOTTOM_PADDING, shared with the two templates. Nothing on
  // this screen scrolls under the pill (the footer is always rendered), so the
  // hook has no remaining call site here.
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
  // D13 — the budget editor's open state, and the successor to the old
  // per-field focus flag: the typical-range guidance still steps aside while
  // an amount is actually being typed (§3.2), it is just one editor doing the
  // typing now instead of two inline fields.
  const [editingBudget, setEditingBudget] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  // The amount an offer is about to be sent at, held while the confirmation
  // is open. Null means nothing is pending.
  const [confirmOfferCents, setConfirmOfferCents] = useState<number | null>(null);

  // C2b — the category pills' one-time measurement. Widths land from a
  // hidden measurement pass; the visible row stays invisible (a plain style,
  // not an animation) until the packed order exists, so no reorder is ever
  // displayed. The order then persists for the life of the screen — step
  // revisits render it directly with no second measurement.
  const chipWidthsRef = useRef<Map<JobCategory, number>>(new Map());
  const [chipMeasureCount, setChipMeasureCount] = useState(0);
  const [chipsWidth, setChipsWidth] = useState(0);
  const [chipOrder, setChipOrder] = useState<readonly JobCategory[] | null>(null);
  // C3 — the "Other" pill's category sheet. Dismissing changes nothing.
  const [otherSheetOpen, setOtherSheetOpen] = useState(false);

  useEffect(() => {
    if (chipOrder != null || chipsWidth <= 0) return;
    if (POSTABLE_CATEGORIES.some((c) => !chipWidthsRef.current.has(c))) return;
    setChipOrder(packCategoryChips(chipWidthsRef.current, chipsWidth, spacing.sm));
  }, [chipMeasureCount, chipsWidth, chipOrder]);

  const successScale = useRef(new Animated.Value(0.4)).current;
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

    // Hire mode negotiates a single amount; a posting carries a maximum, or
    // nothing at all.
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
      // D16 — THIS SCREEN NO LONGER WRITES A MINIMUM. The field is gone, so
      // there is no minimum to write and null is the honest value. The column
      // stays, every other reader of it stays, and nothing is migrated: this
      // is one writer declining to write, not a schema change.
      budgetMinCents: null,
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
  const reviewMaxCents = dollarsToCents(budgetMax);
  const validMax =
    reviewMaxCents != null && !Number.isNaN(reviewMaxCents) ? reviewMaxCents : null;
  const reviewBudget = isHiring
    ? reviewBudgetCents != null && !Number.isNaN(reviewBudgetCents)
      ? formatBudget(reviewBudgetCents)
      : 'Required before sending'
    : validMax != null
      ? budgetRangeLabel({
          budget_cents: null,
          // D16: this screen writes no minimum, so the label it derives must
          // not claim one either.
          budget_min_cents: null,
          budget_max_cents: validMax,
        })
      : // Master 35 is the poster's own view of an unset-budget job and it
        // reads "No budget set" — the same string `formatBudget` returns.
        'No budget set';
  // D13 — what the display pill shows. The SAME resolved cents the summary
  // row reads, so the pill and the row can never disagree about the amount.
  const maxBudgetDisplay = validMax != null ? formatBudget(validMax) : 'No maximum';
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
  // Tier A (C6): the seeded range renders only behind PRICE_GUIDANCE (off
  // until a source is attributed) — the predicate below is otherwise unchanged.
  const guidanceLines = isFreshPost && PRICE_GUIDANCE ? priceGuidanceLines(category) : null;
  const bothBudgetsEmpty = !budgetMin.trim() && !budgetMax.trim();
  const showPriceGuidance = !!guidanceLines && (bothBudgetsEmpty || !editingBudget);
  const showPhotoNudge =
    isFreshPost && step === 1 && photos.length === 0 && !photoNudgeDismissed;

  // D1-D4 — NAVIGATION LIVES IN THE HEADER NOW, derived from the step list so
  // the two links can never name a step the wizard does not have. Leaving the
  // first step exits the flow, so its left link names where that lands;
  // everywhere else the two links are simply the neighbouring steps. The last
  // step has no right link at all — its forward action is Publish, which is a
  // commitment and belongs on a pinned button, not on a chevron.
  const isLastStep = step === POST_STEPS.length - 1;
  const backLabel = step === 0 ? 'Home' : POST_STEPS[step - 1].label;
  const advanceLabel = isLastStep ? undefined : POST_STEPS[step + 1].label;
  // D3 — THE FLOOR'S RULE, WRITTEN ONCE. This is the expression the Continue
  // button carried before the footers came off steps 1-3: the description
  // floor gates the Describe step only, and an upload in flight gates every
  // step. The header link and the Publish button both read it, so the two
  // controls cannot drift into two rules (P3-31).
  const advanceDisabled =
    uploadingPhoto || uploadingVideo || (step === 0 && descNeeded > 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title={isEditing ? 'Edit Job' : isHiring ? 'Send an Offer' : 'Post a Job'}
        onBack={handleBack}
        backLabel={backLabel}
        rightLabel={advanceLabel}
        onPressRight={handleContinue}
        rightDisabled={advanceDisabled}
        centerTitle
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
          contentContainerStyle={[
            styles.content,
            { paddingHorizontal: contentPaddingX, gap: contentGap },
            isLastStep && styles.contentWithFooter,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.stepIntro}>
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
              <Text style={styles.stepSubtitle}>{currentStepSubtitle}</Text>
            </StepPane>

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
                      { height: progressHeight },
                      index <= step && styles.progressSegmentActive,
                    ]}
                  />
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
                style={[styles.multiline, { height: descriptionHeight }]}
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

          {step === 0 && (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Category</Text>
              <View
                style={[styles.chips, chipOrder == null && styles.chipsMeasuring]}
                onLayout={(event) => setChipsWidth(event.nativeEvent.layout.width)}
              >
                {/* D2: the saturated per-category palette is retired in dark
                    wherever a category is drawn. Light keeps it. */}
                {/* C2a — tapping the selected pill again deselects it, back to
                    the pristine no-category state (Continue then refuses with
                    the same "Complete this step" alert it always used). C2b —
                    the packed order once measured; source order, invisible,
                    for the frame or two before. C3 — the Other pill opens the
                    category sheet instead of toggling; it still shows
                    selected when the sheet (or a row in it) chose 'other'. */}
                {(chipOrder ?? POSTABLE_CATEGORIES).map((c) => (
                  <Chip
                    key={c}
                    label={JOB_CATEGORY_LABELS[c]}
                    icon={JOB_CATEGORY_ICONS[c]}
                    accentColor={isDark ? colors.gold : categoryAccent(c).bg}
                    variant="filter"
                    selected={category === c}
                    onPress={
                      c === 'other'
                        ? () => setOtherSheetOpen(true)
                        : () => setCategory(category === c ? null : c)
                    }
                    accessibilityHint={
                      c === 'other' ? 'Opens the full list of categories' : undefined
                    }
                  />
                ))}
              </View>
              {chipOrder == null && (
                /* C2b — the measurement pass: absolute, invisible, inert, one
                   column of naturally-sized copies. Unmounts the moment the
                   order exists. */
                <View
                  style={styles.chipsMeasure}
                  pointerEvents="none"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  {POSTABLE_CATEGORIES.map((c) => (
                    <View
                      key={c}
                      onLayout={(event) => {
                        chipWidthsRef.current.set(c, event.nativeEvent.layout.width);
                        setChipMeasureCount((count) => count + 1);
                      }}
                    >
                      <Chip
                        label={JOB_CATEGORY_LABELS[c]}
                        icon={JOB_CATEGORY_ICONS[c]}
                        accentColor={isDark ? colors.gold : categoryAccent(c).bg}
                        variant="filter"
                      />
                    </View>
                  ))}
                </View>
              )}
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
              <View style={[styles.infoCard, isDark && styles.infoCardDark]}>
                <View style={styles.infoIcon}>
                  {/* C6 — the "not visible" eye, replacing the shield: this
                      notice is about what must not be SEEN. Defaults match
                      the shield's old footprint. */}
                  <EyeOffIcon />
                </View>
                <Text style={[styles.infoText, isDark && styles.infoTextDark]}>
                  Avoid faces, documents, license plates, addresses, or any other personal information
                </Text>
              </View>

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
                  // PJ1 (C5) — same 20% scale as the photos above it, and the
                  // one clip tile widens to twice its post-scale width
                  // (202pt in a 345pt content column — no overflow, so the
                  // full 2x is achieved).
                  scale={1.2}
                  tileAspect={2}
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
                  A short clip explains an awkward job faster than a paragraph.
                </Text>
              </View>
            </View>
          )}

          {step === 2 && (
            <View style={[styles.stepFields, { gap: stepFieldsGap }]}>
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

              {/* PJ1 (C7) — the approximate-area info card is deleted. The
                  privacy fact still reads twice on this same step: the step
                  subtitle ("Workers browsing see only the area. The exact
                  address stays private until you hire someone.") and the
                  address field's caption ("Never shown until you hire — can
                  see after job is accepted."). */}

              {/* The exact address and timing are meaningless for a direct
                  offer (the negotiation carries its own terms — Phase 5's
                  surface), so hire mode keeps the plain location step. */}
              {!isHiring && (
                <>
                  {/* D12 — THE CAPTION CAME OUT OF THE LABEL ROW. TextField
                      lays a `hint` beside the label, which works for a two-
                      word character count and not for a sentence: this label
                      is the longest in the app and the sentence ran off the
                      right edge on top of it. Below the field it is a plain
                      caption with the whole width, and the label owns its
                      row alone. */}
                  <View style={styles.field}>
                    <TextField
                      palette={emeraldColors}
                      label="Service address (private, optional)"
                      value={address}
                      onChangeText={setAddress}
                      placeholder="e.g. 2410 Emmons Ave, Apt 3B"
                      autoCapitalize="words"
                    />
                    <Text style={styles.fieldHint}>
                      Never shown until you hire — can see after job is accepted.
                    </Text>
                  </View>

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
                      <Text style={[styles.guidanceRange, isDark && styles.guidanceRangeDark]}>
                        {guidanceLines[0]}
                      </Text>
                      <Text style={styles.guidanceNote}>{guidanceLines[1]}</Text>
                    </View>
                  ) : null}
                  {/* D13/D14 — ONE AMOUNT, SHOWN NOT TYPED. The min field is
                      gone; what is left is a DISPLAY of the maximum, in the
                      same left-aligned label treatment Title and Description
                      carry on step 1. The pill itself is inert — it is not a
                      text input and it is not a touch target. The pencil is
                      the only thing here that can be pressed, and it opens
                      the one editor. No slider, no track, no second pill. */}
                  <FieldLabel palette={emeraldColors}>Max budget</FieldLabel>
                  <View style={styles.budgetPill}>
                    <Text style={styles.budgetPillValue} numberOfLines={1}>
                      {maxBudgetDisplay}
                    </Text>
                    <Pressable
                      onPress={() => setEditingBudget(true)}
                      hitSlop={12}
                      style={styles.budgetPencil}
                      accessibilityRole="button"
                      accessibilityLabel="Edit budget"
                    >
                      <Ionicons name="pencil" size={18} color={colors.emerald} />
                    </Pressable>
                  </View>
                  {/* D15a — the sentence about ranges was true of two fields
                      and is false of one, so it is deleted rather than
                      reworded. */}
                  <Text style={styles.fieldHint}>
                    Optional — leave blank if you want workers to propose a price.
                  </Text>
                </View>
              )}

              <View style={[styles.reviewCard, { borderRadius: reviewCardRadius }, isDark && shadows.cardDark]}>
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
                      {mediaSummary(photos.length, videos.length)}
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

                {/* D17 — the row stays whether or not an address was given.
                    On a REVIEW screen a missing private address is a fact
                    worth reading, and a row that appears and disappears
                    reshuffles the card between visits. */}
                {!isHiring && (
                  <View style={styles.reviewRow}>
                    <View style={styles.reviewIcon}>
                      <Ionicons name="lock-closed-outline" size={18} color={colors.emerald} />
                    </View>
                    <View style={styles.reviewText}>
                      <Text style={styles.reviewLabel}>Address (private)</Text>
                      <Text style={styles.reviewValue} numberOfLines={2}>
                        {address.trim() || 'Not added'}
                      </Text>
                    </View>
                  </View>
                )}

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
                      ? 'Saving updates this existing job for workers nearby.'
                    : 'Publishing makes this job visible to workers nearby.'}
                </Text>
              </View>
            </View>
          )}

          </StepPane>

        </ScrollView>

        {/* §3.4 — a nudge, not a gate: it never touches the footer button's
            disabled state, and dismissing it is remembered on this draft only. */}
        {showPhotoNudge ? (
          <View style={styles.nudgeRow}>
            <Ionicons name="image-outline" size={18} color={colors.emerald} />
            <Text style={[styles.nudgeText, isDark && styles.nudgeTextDark]}>
              Add photos so workers can see the work.
            </Text>
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

        {/* D2/D4 — ONE footer, on the last step only. Steps 1-3 carry no
            footer button at all: their Back and Continue are the header's two
            links, so a step that is only navigation has no pinned chrome to
            hold. The last step is not navigation — it commits — and a
            commitment gets a full-width button. */}
        {isLastStep && (
        <View style={styles.footer}>
          <Button
            // "Send request", not "Hire": the worker still has to agree.
            title={isEditing ? 'Save changes' : isHiring ? 'Send request' : 'Publish'}
            onPress={handleSubmit}
            palette={emeraldColors}
            loading={submitting}
            // The same one rule the header's advance link reads — see
            // `advanceDisabled`. On this step the floor term is already
            // false, so what is left is "no upload in flight". The photo
            // nudge deliberately has no place in it.
            disabled={advanceDisabled}
            style={styles.footerPrimary}
          />
        </View>
        )}
      </KeyboardAvoidingView>
      )}

      {showSuccess && (
        /* D0: a plain View. An animated `opacity` here group-composites the
           whole surface over the form — see playSuccess(). */
        <View style={styles.successOverlay} accessibilityViewIsModal>
          {!isEditing && !isHiring ? (
            /* Screen 16 (JobPublished) — the SuccessScreen template, configured
               rather than reimplemented. The body explains what happens next
               without inventing certainty: bidding produces real bids as
               workers respond, and right now there are none. */
            <SuccessScreen
              // PUBLISH1 (C1): this surface is inside `successOverlay`, which
              // is bounded by the tab SCENE — and PostJob is not one of the two
              // routes where the bar floats, so the scene already ends at the
              // pill's top edge. Reserving the pill's footprint a second time
              // inside it is what pushed "Back to Home" off the bottom. The
              // template still owns only the top safe-area edge.
              clearsFloatingNav={false}
              // C1: one row, so both actions land above the pill — see the
              // prop's docblock for the measurement that forced it.
              actionsLayout="row"
              title="Your job is live."
              body="Workers can now see your job. Bids appear as workers respond, and you choose who gets it."
              // D23-D26 — the mark, and the only thing on this surface that
              // moves. It animates once on entry and then holds; a build
              // without worklets, and anyone who has asked for reduced
              // motion, gets the same artwork standing still.
              mark={<SuccessMark accessibilityLabel="Your job is published" />}
              details={
                <View style={styles.publishDetails}>
                {publishedJob ? (
                  // PUBLISH1 (C1) — THE PUBLISH CARD SPEAKS HOME'S LANGUAGE.
                  //
                  // There is no master for this surface, so nothing here is
                  // designed: every part of it is copied from the language
                  // already shipping on customer Home. The card is a LitSurface
                  // with the same diagonal wash the promo card carries, over
                  // the dark shadow token, at Home's own 22pt radius; the row
                  // labels are Home's gold eyebrow; the category reads as one
                  // of Home's sage service chips; and the money is MoneyText,
                  // which is emerald in dark like every other amount in the app.
                  <LitSurface
                    style={[styles.reviewCard, { borderRadius: reviewCardRadius }, isDark && shadows.cardDark]}
                    surface={colors.surface}
                    lift={colors.emerald}
                    liftAlpha={PUBLISH_CARD_LIFT_ALPHA}
                    flat={!isDark}
                  >
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
                        {/* Home's service chip, in Home's `service` variant —
                            the same sage pill, not a second one drawn here. */}
                        <View style={styles.reviewChipRow}>
                          <Chip
                            label={JOB_CATEGORY_LABELS[publishedJob.category]}
                            variant="service"
                            size="sm"
                          />
                        </View>
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
                        {/* D19 — a wallet is where money is kept; this row is
                            an amount. The glyph says amount. */}
                        <Text style={styles.reviewIconGlyph}>$</Text>
                      </View>
                      <View style={styles.reviewText}>
                        <Text style={styles.reviewLabel}>Budget</Text>
                        {/* C1: MoneyText with NO state — this is an amount, not
                            a payment. A state would attach a caption from the
                            payment machine to a job that has not been paid for
                            and is not meant to look as though it has. A RANGE
                            still falls back to the shared label: MoneyText
                            renders one figure, and budgetRangeLabel is the one
                            place that knows how two are written. */}
                        {publishedJob.budget_cents != null ? (
                          <MoneyText cents={publishedJob.budget_cents} />
                        ) : (
                          <Text style={styles.reviewValue}>
                            {publishedJob.budget_min_cents != null
                              ? budgetRangeLabel(publishedJob)
                              : 'No budget set'}
                          </Text>
                        )}
                      </View>
                    </View>
                  </LitSurface>
                ) : null}

                {/* D22 — VERIFIED BEFORE IT WAS WRITTEN. phase20 enqueues
                    'bid_received' to the job's owner from notify_on_bid(), a
                    trigger on `bids`, which phase47's projection writes on
                    every marketplace offer chain's root; and
                    notification_prefs.bids is `not null default true`. Both
                    halves are live, so this card promises something the app
                    actually does. */}
                <LitSurface
                  style={[styles.bidsCard, isDark && styles.bidsCardDark, isDark && shadows.cardDark]}
                  surface={isDark ? colors.surface : colors.mint}
                  lift={colors.emerald}
                  liftAlpha={PUBLISH_CARD_LIFT_ALPHA}
                  flat={!isDark}
                >
                  <Ionicons name="notifications-outline" size={20} color={colors.emerald} />
                  <View style={styles.bidsCardText}>
                    <Text style={[styles.bidsCardTitle, isDark && styles.bidsCardTitleDark]}>
                      Expect the first bids soon
                    </Text>
                    <Text style={styles.bidsCardBody}>
                      You&apos;ll be notified when a worker bids on this job.
                    </Text>
                  </View>
                </LitSurface>
                </View>
              }
              actions={[
                { label: 'View job and bids', onPress: leaveToPublishedJob },
                {
                  // D21 — the label says where it goes; the action is
                  // unchanged.
                  label: 'Back to Home',
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
        </View>
      )}

      <PhotoViewer
        visible={!!viewerUri}
        uri={viewerUri}
        onClose={() => setViewerUri(null)}
      />

      {/* C3 — Home's "Other services" sheet, reused unchanged, listing the
          job categories create_job() actually accepts. Selecting a row
          selects it on step 1 and closes; dismissing changes nothing. */}
      <ServicePickerSheet
        visible={otherSheetOpen}
        title="All categories"
        subtitle="Pick what the job is about"
        services={OTHER_SHEET_SERVICES}
        onSelect={(categoryKey) => {
          setOtherSheetOpen(false);
          const chosen = POSTABLE_CATEGORIES.find((c) => c === categoryKey);
          if (chosen) setCategory(chosen);
        }}
        onClose={() => setOtherSheetOpen(false)}
      />

      {/* D15 — the one budget editor. Cancel discards, Save writes and
          closes, and an empty field saves as "no maximum" rather than
          refusing. The ceiling refuses in writing inside the dialog, before
          anything reaches createJob. */}
      <EditBudgetDialog
        visible={editingBudget}
        value={budgetMax}
        palette={emeraldColors}
        onSave={(next) => {
          setBudgetMax(next);
          setEditingBudget(false);
        }}
        onCancel={() => setEditingBudget(false)}
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  // D5 — THE LAST STEP'S SCROLLER CLEARS ITS OWN FOOTER. Only the last step
  // has one, and the summary card is the tallest thing on the screen: without
  // this the card's final row ends flush against the footer's top edge and
  // reads as clipped. It is `content`'s own bottom padding plus the footer's
  // breathing room — the SAME constant the footer applies, so the gap above
  // the button and the gap below the card are one number, not two.
  contentWithFooter: {
    paddingBottom: spacing.xl + PINNED_FOOTER_BOTTOM_PADDING,
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
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: colors.emerald,
  },
  stepEyebrowDark: { color: colors.gold },
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
  guidanceRangeDark: { color: colors.ink },
  guidanceNote: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  },
  // home(6) — THE SEAM ABOVE THE PINNED FOOTER.
  //
  // This is the only element that sits between the scroller and the pinned
  // footer (step 2, a fresh post with no photos yet), so it is the strip the
  // footer shares its top edge with. It was `mint` — #11241C in dark, six
  // levels off the footer's `surface` #0E1D17, and neither the page's `bg` nor
  // any surface token the rest of that stack uses. The origin was a STRAY
  // TOKEN, not a raw literal and not an alpha composite: every dark value and
  // every alpha step over bg and surface was searched, and `mint` is the only
  // one that lands there.
  //
  // Resolved to `surface`, the token the footer directly below it already
  // uses, so the two agree. The mint2 hairline stays and now matches the
  // footer's own borderTopColor. The mint family it left is the family of
  // cards INSIDE the scroller (infoCard, guidanceCard, hireBanner) — none of
  // those ever shares an edge with the footer.
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
    backgroundColor: colors.surface,
  },
  nudgeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.forest,
  },
  nudgeTextDark: { color: colors.ink },
  // D13/D14 — A DISPLAY, NOT A CONTROL. The pill is a View with a Text in it:
  // no Pressable wraps it, no TextInput sits in it, and there is no slider or
  // track anywhere near it. Its ONE touch target is the pencil, which is why
  // the pencil is the only Pressable in the block.
  budgetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 50,
    paddingLeft: spacing.md + 2,
    paddingRight: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  budgetPillValue: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  // >= 44pt, because it is the only way into the editor (CLAUDE.md).
  budgetPencil: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  // C2b — a plain style, deliberately not an animation: the row is simply not
  // painted until the packed order exists, so no reorder is ever visible.
  chipsMeasuring: {
    opacity: 0,
  },
  chipsMeasure: {
    position: 'absolute',
    left: 0,
    top: 0,
    opacity: 0,
    alignItems: 'flex-start',
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
  infoCardDark: { borderColor: colors.border },
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
  reviewCard: {
    gap: spacing.md,
    padding: spacing.lg,
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
  // D19 — the amount's own sign, sized and weighted to sit where a 18pt glyph
  // sat. A Text, not an Ionicon: there is no dollar glyph in the set that
  // reads as a currency mark rather than a badge.
  reviewIconGlyph: {
    fontSize: 19,
    lineHeight: 22,
    fontWeight: '800',
    color: colors.emerald,
  },
  reviewText: {
    flex: 1,
    gap: 2,
  },
  // PUBLISH1 (C1) — AND THE ONE PLACE HOME'S RHYTHM IS DELIBERATELY NOT TAKEN,
  // measured rather than argued.
  //
  // Home gives every page SECTION 20 (`sectionGap`), and taking that here was
  // tried: it moved the whole stack down 8pt and pushed "Back to Home" from
  // partly clipped to entirely below the fold. These two are not two sections
  // — they are one detail block inside the template's own `spacing.xl` (20)
  // rhythm, which IS Home's number and is already applied between the mark,
  // the copy, this block and the actions. So the block keeps its 12 and the
  // surface keeps the 20 where Home puts it.
  //
  // Everything else here already matched: the card padding is `spacing.lg`
  // (16), which is `heroBody`'s padding on Home's promo card.
  publishDetails: {
    width: '100%',
    gap: spacing.md,
  },
  // D22 — what happens next, and it is a thing the app really does: phase20's
  // `bid_received` fires to the job's owner and `notification_prefs.bids`
  // defaults to true.
  bidsCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.mint,
  },
  bidsCardDark: { borderColor: colors.border },
  bidsCardText: {
    flex: 1,
    gap: 2,
  },
  bidsCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.forest,
  },
  bidsCardTitleDark: { color: colors.ink },
  bidsCardBody: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
  },
  // PUBLISH1 (C1) — the row label IS Home's eyebrow, and now says so in gold.
  // `heroEyebrow` in screens/HomeScreen.tsx is 12/700 at letterSpacing 1.1 in
  // `colors.gold`; this keeps its own 11pt because it labels a row rather than
  // a card, and takes the tracking and the colour, which are what make an
  // eyebrow read as one. `textMuted` was a caption's colour on a label that is
  // structure — the eyebrow law (decision 6): structure is gold, money is
  // emerald.
  reviewLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.gold,
  },
  // The category chip sits on its own line under the eyebrow, left-aligned:
  // a chip stretched to the row's width would read as a button.
  reviewChipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    // home(7): the pinned footer's own breathing room, shared with
    // FormScreen's footer and DetailScreen's action bar — not the scroll
    // clearance, which this footer does not travel under.
    paddingBottom: PINNED_FOOTER_BOTTOM_PADDING,
    borderTopWidth: 1,
    borderTopColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  // D4 — one full-width pill. There is no second footer control any more, so
  // there is no `footerBack` beside it to leave room for.
  footerPrimary: {
    flex: 1,
    borderRadius: radius.pill,
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
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: colors.emerald,
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
