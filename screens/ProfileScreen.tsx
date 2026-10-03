import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useScrollClearance } from '../ui/primitives';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PressScale } from '../components/PressScale';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ActionSheet, type ActionSheetItem } from '../components/ActionSheet';
import { Avatar } from '../components/Avatar';
import { AvatarPressable } from '../components/AvatarPressable';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { CategoryAccordion } from '../components/CategoryAccordion';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PhotoViewer } from '../components/PhotoViewer';
import { PortfolioPicker } from '../components/PortfolioPicker';
import { ScreenHeader } from '../components/ScreenHeader';
import { SegmentedControl } from '../components/SegmentedControl';
import { TextField } from '../components/TextField';
import { useAuth } from '../hooks/useAuth';
import { DropdownBody, DropdownChevron } from '../components/DropdownReveal';
import { useProfile } from '../hooks/useProfile';
import { useUnreadNotificationCount } from '../hooks/useUnreadNotificationCount';
import { paymentsMode } from '../lib/adapters/payments';
import { SUPPORT_EMAIL, supportMailtoUrl } from '../lib/appLinks';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { askOpenSettings } from '../lib/permissionPrompt';
import { designStudioAvailable } from '../lib/designStudioGate';
import { goBackOrHome } from '../lib/navigationRef';
import { userMessage } from '../lib/errorMessage';
import { permissionOutcome, trackIntent } from '../lib/observability/analytics';
import { fetchPortfolio, fetchWorkerJobStats, type CategoryStat } from '../lib/portfolio';
import {
  profileCompleteness,
  type CompletenessStepKey,
} from '../lib/profileCompleteness';
import { fetchBothRoleSummaries, type ReviewSummary } from '../lib/reviews';
import { fetchRehirePeople, type RehirePerson } from '../lib/savedWorkers';
import { fetchWorkerServices } from '../lib/services';
import { updateProfile } from '../lib/profiles';
import { useMode } from '../modes/ModeProvider';
import { ModeSwitchRow } from '../components/ModeSwitchRow';
import { uploadAvatar } from '../lib/storage';
import type { ThemePreference } from '../lib/themePreference';
import { isValidPhone } from '../lib/validation';
import type {
  ProfileStackNavigation,
  ProfileStackParamList,
} from '../lib/navigation';
import { useDialNumber } from '../lib/designOverrides';
import { SPINNER_STATE, ScreenStateView } from '../ui/templates/ScreenStates';
import { formatMonthYear } from '../lib/time';
import {
  EYEBROW_TYPE,
  emeraldRadius,
  fonts,
  litCardGround,
  litCardStyle,
  radius,
  spacing,
  starColors,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
  screenGround,
  textLine,
  touchSlop,
} from '../lib/theme';

const LANGUAGE_OPTIONS = [
  { label: 'English', value: 'en' },
  { label: 'Español', value: 'es' },
];

// A bio renders as a short block on this same screen and on WorkerProfileScreen
// — this is enough room for a few sentences without letting it grow into a
// full paragraph that dominates either layout.
const MAX_BIO_LENGTH = 200;

/**
 * A hub row either opens a route in this stack or opens the support mailto —
 * discriminated, so the one Pressable that draws them cannot dispatch the
 * wrong one and cannot read a `route` that is not there.
 */
type SettingsRow = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub: string;
  /** What sits before the chevron: the people's faces, or the unread count. */
  trail?: 'people' | 'unread';
} & (
  | {
      route:
        | 'Notifications'
        | 'Earnings'
        | 'ServicesPricing'
        | 'SavedWorkers'
        | 'PaymentMethods'
        | 'AccountSafety';
    }
  | { mailto: true }
);

/**
 * 2026-09-29 (LUX-LIST-2 #7) — EVERY ROW THE HUB OPENS, as one table; one
 * renderer draws them all. Payment methods and Account & safety joined it
 * (Payment methods came off Account & safety, which kept only what is about
 * the account itself). The two notification rows became ONE, "Notifications"
 * — the feed, whose own header now carries the gear to Notification settings
 * — so the row and the screen it opens share a name (M-16). Contact support is
 * a1's row (`docs/DECISIONS.md` 2026-09-05 entry (3)), unchanged.
 */
const HUB_SETTINGS: SettingsRow[] = [
  {
    route: 'SavedWorkers',
    icon: 'bookmark-outline',
    label: 'Saved & past workers',
    // Their first names replace this once the list is known ("Sam and Priya").
    sub: 'Rehire people you trust.',
    trail: 'people',
  },
  {
    route: 'ServicesPricing',
    icon: 'pricetag-outline',
    label: 'Services & availability',
    sub: 'Pricing, categories and schedule.',
  },
  {
    route: 'Earnings',
    icon: 'wallet-outline',
    // M-22 — the word "payouts" exists on the hub now.
    label: 'Earnings & payouts',
    sub: 'Balances and where you get paid.',
  },
  {
    route: 'PaymentMethods',
    icon: 'card-outline',
    label: 'Payment methods',
    // D16 (R6a): the sandbox subtitle renders in sandbox mode only.
    // Idea 20: on the card path a card may now be saved — for one-tap hiring, kept by the provider.
    // Sandbox and a build with payments off keep their words.
    sub:
      paymentsMode === 'stripe'
        ? 'Cards and one-tap hiring.'
        : paymentsMode === 'sandbox'
          ? 'Test mode · no stored card.'
          : 'No stored cards · entered at checkout.',
  },
  {
    route: 'Notifications',
    icon: 'notifications-outline',
    label: 'Notifications',
    sub: 'Job, offer and payment updates.',
    trail: 'unread',
  },
  {
    route: 'AccountSafety',
    icon: 'shield-checkmark-outline',
    label: 'Account & safety',
    sub: 'Privacy, and deleting your account.',
  },
  {
    mailto: true,
    icon: 'mail-outline',
    label: 'Contact support',
    // The address is never retyped here — lib/appLinks.ts spells it once.
    sub: `Email ${SUPPORT_EMAIL}`,
  },
];

const HUB_ROW = new Map(HUB_SETTINGS.map((row) => [row.label, row]));

/**
 * The support row's action. `Linking.openURL` is the house shape (see
 * screens/PayoutsScreen.tsx) — expo-web-browser is not installed and this run
 * adds no dependency.
 *
 * `Linking.canOpenURL` is deliberately NOT called: on iOS it needs an
 * `LSApplicationQueriesSchemes` entry in app.config.ts that this app does not
 * carry, so it would answer false on a device that can in fact send mail. The
 * direct call's own rejection is already the answer, and the failure message
 * names the address — so the contact is published even where no mail app is
 * configured.
 */
/**
 * 2026-09-29 (LUX-LIST-2 #7) — WHERE EACH MODE PUTS THE ROWS. The mode's own
 * rows lead (YOUR PROFILE, MONEY — M-22's rule, kept); the other mode's sit
 * behind ONE row that opens in place ("Worker tools" / "Customer tools"), so
 * nothing is deleted and nothing is shown to a mode that does not use it.
 * NOTIFICATIONS and ACCOUNT are the same in both. Every row of HUB_SETTINGS
 * is drawn exactly once in each mode (tests/supportContact.test.mjs).
 */
const HUB_LAYOUT: Record<'customer' | 'worker', { profile: string[]; money: string[]; tools: string[] }> = {
  customer: {
    profile: ['Saved & past workers'],
    money: ['Payment methods'],
    tools: ['Services & availability', 'Earnings & payouts'],
  },
  worker: {
    profile: ['Services & availability'],
    money: ['Earnings & payouts', 'Payment methods'],
    tools: ['Saved & past workers'],
  },
};
const HUB_NOTIFICATIONS = ['Notifications'];
const HUB_ACCOUNT = ['Account & safety', 'Contact support'];

/** Legal opens in place to its two documents (they were two rows on Account & safety). */
const LEGAL_ROWS = [
  { document: 'terms', label: 'Terms of Service', hint: 'Read the current agreement.' },
  { document: 'privacy', label: 'Privacy Policy', hint: 'How your data is protected.' },
] as const;

/** The in-row theme switch: the same three preferences the Appearance screen offers. */
const APPEARANCE_OPTIONS: { label: string; value: ThemePreference }[] = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'Auto', value: 'system' },
];

/** "Sam", "Sam and Priya", "Sam, Priya and 3 more" — first names, as the people wrote them. */
function peopleLine(people: RehirePerson[]): string | null {
  const named = people
    .map((person) => person.full_name?.trim().split(/\s+/)[0] ?? '')
    .filter((name) => name.length > 0)
    .slice(0, 2);
  if (named.length === 0) return null;
  const more = people.length - named.length;
  return more > 0 ? `${named.join(', ')} and ${more} more` : named.join(' and ');
}

async function openSupportMail(): Promise<void> {
  try {
    await Linking.openURL(supportMailtoUrl());
  } catch {
    await alertAsync('Could not open your mail app', `Write to ${SUPPORT_EMAIL}.`);
  }
}


export function ProfileScreen() {
  // 2026-09-30: the tab bar floats over this screen; the list ends above the pill.
  const navClearance = useScrollClearance();
  const { palette: colors, isDark, preference, setPreference } = useThemeColors();
  const styles = stylesFor(colors);
  // RUN T2 (C5) — PROFILE'S OWN DIALS. Each falls back to the value this file
  // drew before the dial existed, spelled here and nowhere else. The two
  // that answer to a token take the `theme.*` scale, because this file imports
  // spacing/radius from lib/theme — `emeraldRadius` is the one name here that
  // reaches the other scale, and nothing below is dialled through it.
  // 2026-09-29 (LUX-LIST-2 #7): the glyph is a plain 22pt icon now (no tile),
  // and the hub card rounds at 22 like every #6 card — so both dials ship
  // at 22, and the card's no longer inherits theme.radius.xl (24).
  const settingsRowHeight = useDialNumber('profile.settingsRow.height') ?? 64;
  const settingsGlyphSize = useDialNumber('profile.settingsGlyph.size') ?? 22;
  const hubCardRadius = useDialNumber('profile.hubCard.radius') ?? 22;
  const hubCardPadding = useDialNumber('profile.hubCard.padding') ?? spacing.lg;
  const contentGap = useDialNumber('profile.content.gap') ?? spacing.lg;
  const navigation = useNavigation<ProfileStackNavigation>();
  const { params } = useRoute<RouteProp<ProfileStackParamList, 'ProfileMain'>>();
  const { user, logout } = useAuth();
  const { profile, loading, setProfile } = useProfile();
  const { mode } = useMode();

  const [isEditing, setIsEditing] = useState(false);
  // 2026-09-28 (LUX-LIST-64 #59, #60): WHERE EDITING WAS OPENED FROM. The hub's
  // own pencil edits in place, so its back names "Profile"; an `edit: true`
  // dispatch (a Home's photo, a profile nudge) came from elsewhere, so its back
  // returns there — and names "Home" when that is where it lands.
  const [editOrigin, setEditOrigin] = useState<'hub' | 'elsewhere'>('hub');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [language, setLanguage] = useState('en');
  const [categories, setCategories] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [pendingAsset, setPendingAsset] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Bumped after the picker adds an item, so PastWork refetches.
  const [portfolioVersion, setPortfolioVersion] = useState(0);
  // Named distinctly from avatarUrl (the editable draft value) — this is just
  // which photo the full-screen viewer is currently showing.
  const [avatarViewerUri, setAvatarViewerUri] = useState<string | null>(null);
  // Long-pressing the user's own avatar opens this small menu instead of
  // jumping straight to the full-screen viewer, so "Remove Photo" has
  // somewhere to live.
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  // Short-tap-while-editing action sheet (library / camera / remove) — kept
  // separate from avatarMenuOpen (the long-press view/change/remove menu,
  // reachable in both editing and non-editing states) so neither gesture's
  // behavior regresses the other.
  const [avatarActionSheetOpen, setAvatarActionSheetOpen] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  // Backs the above-the-fold summary line — same worker_job_stats() RPC
  // PastWork's own stat line further down the page already calls.
  const [jobStats, setJobStats] = useState<CategoryStat[]>([]);
  // R8b-c: the rating comes from the per-role REVEALED summaries, never
  // profiles.rating_avg/rating_count — the legacy aggregate mixes both roles
  // and counts reviews the blind window still holds back. Null is a read
  // that has not answered (or failed): UNKNOWN renders nothing (F-026).
  const [roleSummaries, setRoleSummaries] = useState<{
    worker: ReviewSummary | null;
    customer: ReviewSummary | null;
  } | null>(null);
  // §6.4 — published-services and portfolio counts behind the completeness
  // meter. Null = not yet known, and an UNKNOWN count renders no meter at
  // all rather than a guessed one.
  const [meterCounts, setMeterCounts] = useState<{
    services: number;
    portfolio: number;
  } | null>(null);

  // 2026-09-29 (LUX-LIST-2 #7): the hub's two rows that open in place, the
  // people its Saved & past workers row names, the unread count its
  // Notifications row carries (the bell's own read), and Sign out.
  const [legalOpen, setLegalOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [rehirePeople, setRehirePeople] = useState<RehirePerson[]>([]);
  const [signingOut, setSigningOut] = useState(false);
  const unread = useUnreadNotificationCount();

  // Re-read on focus, so someone saved elsewhere shows here on return. A
  // failed read keeps the row's plain subtitle — never a guessed list.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      fetchRehirePeople(user.id).then(({ people, error }) => {
        if (active) setRehirePeople(error ? [] : people);
      });
      return () => {
        active = false;
      };
    }, [user])
  );

  const loadedRef = useRef<string | null>(null);

  // Loads the persisted profile into the editable draft fields — used both
  // on first load and when Cancel discards any in-progress edits.
  function loadDraftFromProfile() {
    if (!profile) return;
    setFullName(profile.full_name ?? '');
    setPhone(profile.phone ?? '');
    setBio(profile.bio ?? '');
    setLanguage(profile.language ?? 'en');
    setCategories(profile.categories ?? []);
    setAvatarUrl(profile.avatar_url ?? null);
    setPendingAsset(null);
    setPhoneError(null);
  }

  function handlePhoneChange(next: string) {
    setPhone(next);
    if (phoneError) setPhoneError(null);
  }

  useEffect(() => {
    if (profile && loadedRef.current !== profile.id) {
      loadedRef.current = profile.id;
      loadDraftFromProfile();
    }
  }, [profile]);

  // Master 42's pencil and its "Edit profile" chip both dispatch here with
  // `edit: true` — decision 10's "Edit → the edit screens", expressed as a
  // route param because the form and the hub share one avatar/portfolio
  // state and splitting them would fork it.
  const wantsEdit = params?.edit === true;
  useEffect(() => {
    if (wantsEdit) {
      setEditOrigin('elsewhere');
      setIsEditing(true);
    }
  }, [wantsEdit]);

  // Leaving the edit surface spends the dispatch, so the next `edit: true` —
  // another tap on a Home's photo — opens it again instead of changing nothing.
  function leaveEditing() {
    setIsEditing(false);
    if (params?.edit) navigation.setParams({ edit: undefined });
  }

  useEffect(() => {
    if (!user) return;
    let active = true;
    fetchWorkerJobStats(user.id).then(({ data }) => {
      if (active) setJobStats(data);
    });
    return () => {
      active = false;
    };
    // portfolioVersion isn't really about jobs, but a newly-completed job is
    // usually followed by adding it to the portfolio, so re-checking here
    // too keeps this line from going stale without a dedicated subscription.
  }, [user, portfolioVersion]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    fetchBothRoleSummaries(user.id).then(({ worker, customer, error }) => {
      // A failed read stays UNKNOWN — no rating line, no link, never zero.
      if (!active || error) return;
      setRoleSummaries({ worker, customer });
    });
    return () => {
      active = false;
    };
  }, [user]);

  // §6.4 — refreshed on focus so publishing a service or featuring a photo
  // elsewhere moves the meter the moment this screen returns. Worker mode
  // only; a failed read leaves the counts unknown and the meter hidden.
  const loadMeterCounts = useCallback(async () => {
    if (!user || mode !== 'worker') return;
    const [servicesRes, portfolioRes] = await Promise.all([
      fetchWorkerServices(user.id),
      fetchPortfolio(user.id),
    ]);
    if (servicesRes.error || portfolioRes.error) return;
    setMeterCounts({
      services: servicesRes.data.filter((s) => s.published).length,
      portfolio: portfolioRes.data.length,
    });
  }, [user, mode]);

  useFocusEffect(
    useCallback(() => {
      void loadMeterCounts();
      // portfolioVersion: the on-screen picker adds items without a focus
      // change, so it re-runs this the same way it re-runs the stats line.
    }, [loadMeterCounts, portfolioVersion])
  );

  const completeness = profileCompleteness({
    categoryCount: profile?.categories?.length ?? 0,
    avatarUrl: profile?.avatar_url ?? null,
    bio: profile?.bio ?? null,
    publishedServiceCount: meterCounts?.services ?? 0,
    portfolioCount: meterCounts?.portfolio ?? 0,
  });

  /** Each unmet meter step routes to the surface that fixes it. */
  function meterAction(key: CompletenessStepKey) {
    if (key === 'categories' || key === 'avatar' || key === 'bio') {
      setIsEditing(true);
      return;
    }
    if (key === 'services') {
      navigation.navigate('ServicesPricing');
      return;
    }
    setPickerOpen(true);
  }

  function toggleCategory(c: string) {
    setCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }

  /** Library and camera both stage the same pendingAsset/avatarUrl draft —
   *  the actual upload only happens once, in handleSave, so neither path
   *  needs (or has) its own upload logic. */
  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPendingAsset(result.assets[0]);
      setAvatarUrl(result.assets[0].uri);
    }
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    trackIntent({
      name: 'permission_result',
      kind: 'camera',
      outcome: permissionOutcome(permission.status, permission.canAskAgain),
    });
    if (!permission.granted) {
      // B11: the prompt offers Settings instead of only naming it.
      await askOpenSettings('camera');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPendingAsset(result.assets[0]);
      setAvatarUrl(result.assets[0].uri);
    }
  }

  /** Resets the profile picture to the default placeholder avatar. Only the
   *  confirmation itself moved to ConfirmDialog (see removeConfirmOpen) —
   *  this is still the same rollback-on-failure logic as before. */
  async function handleRemoveAvatar() {
    if (!user) return;

    // Captured before clearing, so a failed API call below can restore
    // exactly what was staged — previously pendingAsset was cleared
    // unconditionally up front, so a failed removal would silently lose an
    // in-progress replacement pick with no way to recover it short of
    // re-picking, even though the removal itself never actually went through.
    const previousPendingAsset = pendingAsset;
    const previousAvatarUrl = avatarUrl;

    // Clears the draft immediately — this action isn't staged behind the
    // Save button — but only stays cleared if nothing below fails.
    setPendingAsset(null);
    setAvatarUrl(null);

    if (!profile?.avatar_url) {
      setRemoveConfirmOpen(false);
      return;
    }

    setRemovingAvatar(true);
    const { data, error } = await updateProfile(user.id, { avatar_url: null });
    setRemovingAvatar(false);
    setRemoveConfirmOpen(false);

    if (error) {
      await alertAsync('Could not remove photo', userMessage(error));
      setAvatarUrl(previousAvatarUrl);
      setPendingAsset(previousPendingAsset);
      return;
    }
    if (data) setProfile(data);
  }

  async function handleCancel(): Promise<boolean> {
    const hasChanges =
      fullName !== (profile?.full_name ?? '') ||
      phone !== (profile?.phone ?? '') ||
      bio !== (profile?.bio ?? '') ||
      language !== (profile?.language ?? 'en') ||
      JSON.stringify(categories) !== JSON.stringify(profile?.categories ?? []) ||
      !!pendingAsset;

    if (hasChanges) {
      const ok = await confirmAsync({
        title: 'Discard changes?',
        message: 'Your edits will not be saved.',
        confirmText: 'Discard',
        cancelText: 'Keep editing',
      });
      if (!ok) return false;
    }

    loadDraftFromProfile();
    leaveEditing();
    return true;
  }

  // The edit header's back: the same discard check as Cancel, then — when the
  // edit was opened from elsewhere — back to where it came from.
  async function backFromEdit() {
    const left = await handleCancel();
    if (left && editOrigin === 'elsewhere') goBackOrHome();
  }

  async function handleSave() {
    if (!user) return;
    if (!fullName.trim() || !phone.trim()) {
      await alertAsync('Required', 'Full name and phone number are required.');
      return;
    }
    if (!isValidPhone(phone)) {
      setPhoneError('Enter a valid phone number.');
      return;
    }

    setSaving(true);

    let avatar = profile?.avatar_url ?? null;
    if (pendingAsset) {
      const { url, error } = await uploadAvatar(user.id, pendingAsset);
      if (error) {
        await alertAsync(
          'Photo upload failed',
          'Saving your other details. Set up the "avatars" storage bucket (phase7 SQL) to enable photos.'
        );
      } else {
        avatar = url;
      }
    }

    const patch = {
      full_name: fullName.trim(),
      phone: phone.trim(),
      avatar_url: avatar,
      bio: bio.trim() || null,
      language,
      categories,
    };

    let { data, error } = await updateProfile(user.id, patch);
    let partial = false;
    // If the extended columns aren't migrated yet, save the core fields only.
    if (error && (error as { code?: string }).code === '42703') {
      partial = true;
      ({ data, error } = await updateProfile(user.id, {
        full_name: patch.full_name,
        phone: patch.phone,
        avatar_url: patch.avatar_url,
      }));
    }

    setSaving(false);

    if (error) {
      await alertAsync('Could not save', userMessage(error));
      return;
    }
    if (data) setProfile(data);
    setPendingAsset(null);
    leaveEditing();
    await alertAsync(
      'Saved',
      partial
        ? 'Saved name, phone and photo. Run the phase7 SQL to enable bio, language and categories.'
        : 'Your profile has been updated.'
    );
  }


  // Replaces static, identical-for-every-user copy ("You can post jobs and
  // find work") with something that's actually true of this specific
  // account — same signals PastWork's own stat line further down already
  // shows (job count by category), plus rating and tenure where there's
  // something real to say.
  const totalCompletedJobs = jobStats.reduce((sum, s) => sum + s.count, 0);
  const memberSince = user?.created_at
    ? formatMonthYear(new Date(user.created_at)) || null
    : null;
  const workerSummary = roleSummaries?.worker ?? null;
  const customerSummary = roleSummaries?.customer ?? null;
  const workerReviewTotal = workerSummary?.total ?? 0;
  // The link gate sums both roles — a customer-only account still has
  // reviews worth reading, which is the defect this gate used to have.
  const reviewTotal = workerReviewTotal + (customerSummary?.total ?? 0);
  const summaryParts: string[] = [];
  // The star leads the line when there is a rating, and is rendered as its own
  // span below so it can carry the one gold star treatment instead of the
  // meta line's grey.
  const summaryLeadsWithStar = workerReviewTotal > 0;
  if (workerSummary && workerReviewTotal > 0) {
    // D1: shown_average or the word New — the raw mean never renders.
    summaryParts.push(
      workerSummary.isNew || workerSummary.shownAverage == null
        ? 'New'
        : `${workerSummary.shownAverage.toFixed(1)} (${workerReviewTotal})`
    );
  }
  if (totalCompletedJobs > 0) {
    summaryParts.push(`${totalCompletedJobs} job${totalCompletedJobs === 1 ? '' : 's'} completed`);
  }
  if (memberSince) {
    summaryParts.push(`Member since ${memberSince}`);
  }
  const profileSummary =
    summaryParts.length > 0 ? summaryParts.join(' · ') : 'You can post jobs and find work.';

  // 2026-09-29 (LUX-LIST-2 #7): the card's rating line — the worker rating
  // when there is one, else the customer rating, else "No reviews yet"; it
  // opens every review about you (today's gate: either role's total).
  const customerReviewTotal = customerSummary?.total ?? 0;
  const ratingSummary =
    workerReviewTotal > 0 ? workerSummary : customerReviewTotal > 0 ? customerSummary : null;

  function editFromHub() {
    setEditOrigin('hub');
    setIsEditing(true);
  }

  // SIGN OUT, at the foot of the hub — Account & safety's "Log out" moved
  // whole: the same confirmation and the same landing; the word is the
  // hub's.
  async function handleSignOut() {
    const ok = await confirmAsync({
      title: 'Sign out?',
      message: 'You can sign back in any time.',
      confirmText: 'Sign out',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;

    setSigningOut(true);
    const { error } = await logout();
    setSigningOut(false);
    if (error) await alertAsync('Sign out failed', userMessage(error));
  }

  const layout = HUB_LAYOUT[mode];
  const rowsOf = (labels: readonly string[]): SettingsRow[] =>
    labels.flatMap((label) => {
      const row = HUB_ROW.get(label);
      return row ? [row] : [];
    });
  const toolsTitle = mode === 'worker' ? 'Customer tools' : 'Worker tools';
  const toolsRows = rowsOf(layout.tools);
  // #47's plain icons: the mint in dark, the forest mark in light.
  const iconColour = isDark ? colors.emerald : colors.mark;

  /** An eyebrow over one card of rows. */
  const renderSection = (title: string, body: ReactNode) => (
    <View style={styles.section}>
      <Text style={styles.sectionEyebrow}>{title}</Text>
      <Card style={styles.listCard}>{body}</Card>
    </View>
  );

  /** THE one drawing of a HUB_SETTINGS row, wherever it sits. */
  const renderRow = (row: SettingsRow, divided: boolean) => {
    const people = row.trail === 'people' ? peopleLine(rehirePeople) : null;
    const showUnread = row.trail === 'unread' && unread > 0;
    return (
      <PressScale
        haptic={false}
        key={row.label}
        style={({ pressed }) => [
          styles.row,
          { minHeight: settingsRowHeight },
          divided && styles.rowDivider,
          pressed && styles.rowPressed,
        ]}
        onPress={
          'route' in row
            ? () => navigation.navigate(row.route)
            : () => void openSupportMail()
        }
        accessibilityRole="button"
        accessibilityLabel={showUnread ? `${row.label}, ${unread} unread` : row.label}
      >
        <Ionicons name={row.icon} size={settingsGlyphSize} color={iconColour} />
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle} numberOfLines={1}>{row.label}</Text>
          <Text style={styles.rowSub} numberOfLines={1}>{people ?? row.sub}</Text>
        </View>
        {people ? (
          <View style={styles.faces}>
            {rehirePeople.slice(0, 2).map((person, index) => (
              <View
                key={person.id}
                style={[styles.face, { borderColor: litCardGround(isDark) }, index > 0 && styles.faceOverlap]}
              >
                <Avatar name={person.full_name ?? ''} uri={person.avatar_url ?? null} size={30} initialsSize={10} />
              </View>
            ))}
          </View>
        ) : null}
        {showUnread ? (
          <View style={[styles.badge, isDark && styles.badgeDark]}>
            <Text style={styles.badgeText}>{unread > 9 ? '9+' : String(unread)}</Text>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
      </PressScale>
    );
  };

  const avatarActionSheetItems: ActionSheetItem[] = [
    {
      key: 'library',
      label: 'Choose from library',
      icon: 'image-outline',
      onPress: () => {
        setAvatarActionSheetOpen(false);
        pickAvatar();
      },
    },
    {
      key: 'camera',
      label: 'Take photo',
      icon: 'camera-outline',
      onPress: () => {
        setAvatarActionSheetOpen(false);
        takePhoto();
      },
    },
    ...(avatarUrl
      ? [
          {
            key: 'remove',
            label: 'Remove current photo',
            icon: 'trash-outline' as const,
            destructive: true,
            onPress: () => {
              setAvatarActionSheetOpen(false);
              setRemoveConfirmOpen(true);
            },
          },
        ]
      : []),
  ];

  return (
    <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={['top']}>
      {/* 2026-09-28 (LUX-LIST-64 #59, #60): the edit surface is a back-button
          screen — "Edit Profile" centred, the round back naming where it goes
          ("Profile" from the hub's Edit; "Home" when a Home's photo opened it,
          which the header reads for itself). */}
      {/* 2026-09-29 (LUX-LIST-2 #7): the hub is "Profile", big on the left,
          with nothing at its right — the one way to edit is the Edit pill on
          your own card. */}
      {isEditing ? (
        <ScreenHeader
          title="Edit Profile"
          onBack={() => void backFromEdit()}
          backLabel={editOrigin === 'hub' ? 'Profile' : undefined}
        />
      ) : (
        <ScreenHeader title="Profile" largeTitle />
      )}

      {loading ? (
        <ScreenStateView state={SPINNER_STATE} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { gap: contentGap, paddingBottom: navClearance }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 2026-09-29 (LUX-LIST-2 #7) — YOU FIRST, THEN YOUR MODE. The card
              is who you are here: photo, name, the revealed rating (it opens
              the reviews) or "No reviews yet", and "View profile" — the whole
              card opens Profile details, which carries what left this page
              (jobs completed, member since, and the past work). The Edit pill
              opens the edit surface in place. */}
          {!isEditing ? (
            <View style={styles.topGroup}>
              <PressScale
                onPress={() => navigation.navigate('ProfileDetails')}
                style={({ pressed }) => [
                  styles.identityCard,
                  litCardStyle(isDark),
                  { padding: hubCardPadding, borderRadius: hubCardRadius },
                  pressed && styles.rowPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="View your profile"
              >
                <Avatar name={profile?.full_name ?? ''} uri={profile?.avatar_url ?? null} size={52} />
                <View style={styles.identityCopy}>
                  <Text style={styles.identityName} numberOfLines={1}>
                    {profile?.full_name?.trim() || 'Your profile'}
                  </Text>
                  {/* D1: shown_average or the word New, and an unanswered read
                      renders nothing (F-026) — never zero, never a guess. */}
                  {roleSummaries == null ? null : ratingSummary && user ? (
                    <Pressable
                      onPress={() =>
                        navigation.navigate('ProfileReviews', {
                          userId: user.id,
                          name: profile?.full_name ?? undefined,
                          role: 'both',
                        })
                      }
                      hitSlop={touchSlop(textLine(styles.identityMeta))}
                      accessibilityRole="button"
                      accessibilityLabel={`See all ${reviewTotal} reviews about you`}
                      style={styles.ratingLine}
                    >
                      <Text style={styles.identityMeta} numberOfLines={1}>
                        <Text style={{ color: starColors(colors, isDark).filled }}>★ </Text>
                        {ratingSummary.isNew || ratingSummary.shownAverage == null
                          ? 'New'
                          : `${ratingSummary.shownAverage.toFixed(1)} (${ratingSummary.total})`}
                      </Text>
                    </Pressable>
                  ) : (
                    <View style={styles.ratingLine}>
                      <Ionicons name="star" size={13} color={colors.textMuted} />
                      <Text style={styles.identityMeta}>No reviews yet</Text>
                    </View>
                  )}
                  <View style={styles.identityLinkRow}>
                    <Text style={styles.identityLink}>View profile</Text>
                    <Ionicons name="chevron-forward" size={12} color={colors.emerald} />
                  </View>
                </View>
                <PressScale
                  onPress={editFromHub}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Edit your profile"
                  style={({ pressed }) => [styles.editPill, isDark && styles.editPillDark, pressed && styles.rowPressed]}
                >
                  <Ionicons name="pencil" size={14} color={colors.emerald} />
                  <Text style={styles.editPillText}>Edit</Text>
                </PressScale>
              </PressScale>

              {/* M-8 — THE MODE, AND THE WAY TO CHANGE IT, the same in both
                  modes; switching confirms first, as the [+] sheet's row does. */}
              <ModeSwitchRow />

              {/* §6.4 — the worker profile completeness meter: own profile,
                  worker mode only, and only while a step is unmet — at 4/4 it
                  disappears entirely (a prompt, not a scoreboard). Hidden until
                  the counts are KNOWN, so it never claims incompleteness off an
                  unloaded read. */}
              {user && mode === 'worker' && meterCounts && !completeness.complete && !isEditing ? (
                <Card>
                  <View style={styles.meterHeader}>
                    <Text style={styles.meterTitle}>Complete your worker profile</Text>
                    <Text style={styles.meterCount}>
                      {completeness.done} of {completeness.total}
                    </Text>
                  </View>
                  {completeness.steps.map((step) => (
                    <PressScale
                      haptic={false}
                      key={step.key}
                      style={styles.meterRow}
                      disabled={step.done}
                      onPress={() => meterAction(step.key)}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: step.done }}
                      accessibilityLabel={step.label}
                    >
                      <Ionicons
                        name={step.done ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={step.done ? colors.emerald : colors.textSubtle}
                      />
                      <Text style={[styles.meterLabel, step.done && styles.meterLabelDone]}>
                        {step.label}
                      </Text>
                      {!step.done ? (
                        <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
                      ) : null}
                    </PressScale>
                  ))}
                </Card>
              ) : null}

            </View>
          ) : null}

          {/* Masters 29/30 — the EDIT surface's own identity header. In the
              hub state this whole block belongs to master 42's details page,
              which is where it now lives. */}
          {isEditing ? (
          <View style={styles.avatarRow}>
            {isEditing ? (
              // onPress (the full library/camera/remove action sheet) and
              // onLongPress (the older view/change/remove menu, unchanged)
              // coexist fine on one Pressable — they're different gestures.
              <Pressable
                onPress={() => setAvatarActionSheetOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Change profile photo"
                onLongPress={
                  avatarUrl ? () => setAvatarMenuOpen(true) : undefined
                }
                delayLongPress={350}
                style={styles.avatarPress}
              >
                <Avatar name={fullName} uri={avatarUrl} size={84} />
                <View style={styles.avatarEdit}>
                  <Ionicons name="camera" size={16} color={colors.onPrimary} />
                </View>
              </Pressable>
            ) : (
              <AvatarPressable
                name={fullName}
                uri={avatarUrl}
                size={84}
                onLongPress={
                  avatarUrl ? () => setAvatarMenuOpen(true) : undefined
                }
              />
            )}
            <Text style={styles.email}>{user?.email}</Text>
            <Text style={styles.roleNote}>
              {/* One star treatment, BOTH palettes — see BidDetailScreen. */}
              {summaryLeadsWithStar ? (
                <Text style={{ color: starColors(colors, isDark).filled }}>★ </Text>
              ) : null}
              {profileSummary}
            </Text>
            {/* Same destination the rating row on someone else's profile
                leads to, pointed at this account — so "what have people said
                about me?" is answerable from your own profile too. Gated on
                EITHER role's revealed total: a customer-only account has
                reviews worth reading even with no worker rating to show. */}
            {reviewTotal > 0 && user && (
              <PressScale
                onPress={() =>
                  navigation.navigate('ProfileReviews', {
                    userId: user.id,
                    name: profile?.full_name ?? undefined,
                    role: 'both',
                  })
                }
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`See all ${reviewTotal} reviews about you`}
                style={({ pressed }) => [styles.reviewsLink, pressed && styles.reviewsLinkPressed]}
              >
                <Text style={styles.reviewsLinkText}>
                  See {reviewTotal === 1 ? 'your review' : 'all your reviews'}
                </Text>
                <Ionicons name="chevron-forward" size={13} color={colors.primary} />
              </PressScale>
            )}
          </View>
          ) : null}

          {isEditing ? (
          <Card>
            {(
              <View style={styles.form}>
                <TextField
                  label="Full name"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  placeholder="Carlos Reyes"
                />
                {/* 2026-09-28 (LUX-LIST-64 #2): "Phone number" is the mint everywhere. */}
                <TextField
                  label="Phone number"
                  labelTone="accent"
                  value={phone}
                  onChangeText={handlePhoneChange}
                  error={phoneError}
                  keyboardType="phone-pad"
                  placeholder="(555) 123-4567"
                />

                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, isDark && styles.fieldLabelDark]}>Language</Text>
                  <SegmentedControl
                    options={LANGUAGE_OPTIONS}
                    value={language}
                    onChange={setLanguage}
                  />
                </View>

                <TextField
                  label="Bio (optional)"
                  value={bio}
                  onChangeText={setBio}
                  hint={`${bio.length}/${MAX_BIO_LENGTH}`}
                  maxLength={MAX_BIO_LENGTH}
                  placeholder="A sentence about the work you do…"
                  autoCapitalize="sentences"
                  multiline
                  numberOfLines={3}
                  style={styles.multiline}
                />

                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, isDark && styles.fieldLabelDark]}>Job categories (optional)</Text>
                  <CategoryAccordion
                    selected={categories}
                    onToggle={toggleCategory}
                    onAddCustom={(label) =>
                      setCategories((prev) =>
                        prev.includes(label) ? prev : [...prev, label]
                      )
                    }
                    onRemoveCustom={(key) =>
                      setCategories((prev) => prev.filter((c) => c !== key))
                    }
                  />
                </View>

                <View style={styles.editActions}>
                  <Button title="Save Changes" onPress={handleSave} loading={saving} />
                  <Button
                    title="Cancel"
                    variant="secondary"
                    onPress={handleCancel}
                    disabled={saving}
                  />
                </View>
              </View>
            )}
          </Card>
          ) : null}


          {/* 2026-09-29 (LUX-LIST-2 #7) — THE SECTIONS: each an eyebrow over one
              card of rows. Every row HUB_SETTINGS names is drawn exactly once
              in each mode — the mode's own in YOUR PROFILE and MONEY, the other
              mode's behind the tools row (HUB_LAYOUT). */}
          {!isEditing ? (
            <>
              {renderSection('Your profile', rowsOf(layout.profile).map((row, index) => renderRow(row, index > 0)))}
              {renderSection('Money', rowsOf(layout.money).map((row, index) => renderRow(row, index > 0)))}
              {renderSection('Notifications', rowsOf(HUB_NOTIFICATIONS).map((row, index) => renderRow(row, index > 0)))}
              {renderSection(
                'Account',
                <>
                  {rowsOf(HUB_ACCOUNT.slice(0, 1)).map((row) => renderRow(row, false))}

                  {/* Appearance, decided IN the row: one tap, nothing opens —
                      the same stored preference the Appearance screen writes. */}
                  <View style={[styles.row, { minHeight: settingsRowHeight }, styles.rowDivider]}>
                    <Ionicons name="moon-outline" size={settingsGlyphSize} color={iconColour} />
                    <Text style={[styles.rowTitle, styles.rowFill]} numberOfLines={1}>
                      Appearance
                    </Text>
                    <View
                      style={[styles.switchTrack, isDark && styles.switchTrackDark]}
                      accessibilityRole="radiogroup"
                      accessibilityLabel="Appearance"
                    >
                      {APPEARANCE_OPTIONS.map((option) => {
                        const selected = option.value === preference;
                        return (
                          <Pressable
                            key={option.value}
                            onPress={() => setPreference(option.value)}
                            hitSlop={{ top: 9, bottom: 9 }}
                            accessibilityRole="radio"
                            accessibilityState={{ selected }}
                            accessibilityLabel={option.value === 'system' ? 'Auto — follow the system' : option.label}
                            style={[styles.switchCell, selected && { backgroundColor: colors.primary }]}
                          >
                            <Text style={[styles.switchLabel, { color: selected ? colors.onPrimary : colors.textMuted }]}>
                              {option.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* The dial panel's switch lives on the Appearance screen; it
                      is reachable only where lib/designStudioGate.ts lets the
                      studio exist (internal builds), and never drawn anywhere
                      else. */}
                  {designStudioAvailable ? (
                    <PressScale
                      haptic={false}
                      style={({ pressed }) => [styles.row, { minHeight: settingsRowHeight }, styles.rowDivider, pressed && styles.rowPressed]}
                      onPress={() => navigation.navigate('Appearance')}
                      accessibilityRole="button"
                      accessibilityLabel="Design studio"
                    >
                      <Ionicons name="options-outline" size={settingsGlyphSize} color={iconColour} />
                      <View style={styles.rowCopy}>
                        <Text style={styles.rowTitle} numberOfLines={1}>Design studio</Text>
                        <Text style={styles.rowSub} numberOfLines={1}>Internal builds only.</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
                    </PressScale>
                  ) : null}

                  {/* Legal opens in place to its two documents. */}
                  <PressScale
                    haptic={false}
                    style={({ pressed }) => [styles.row, { minHeight: settingsRowHeight }, styles.rowDivider, pressed && styles.rowPressed]}
                    onPress={() => setLegalOpen((open) => !open)}
                    accessibilityRole="button"
                    accessibilityLabel="Legal"
                    accessibilityState={{ expanded: legalOpen }}
                  >
                    <Ionicons name="document-text-outline" size={settingsGlyphSize} color={iconColour} />
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle} numberOfLines={1}>Legal</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {LEGAL_ROWS.map((doc) => doc.label).join(' · ')}
                      </Text>
                    </View>
                    <DropdownChevron open={legalOpen}>
                      <Ionicons name="chevron-down" size={18} color={colors.textSubtle} />
                    </DropdownChevron>
                  </PressScale>
                  <DropdownBody open={legalOpen}>
                      {LEGAL_ROWS.map((doc) => (
                        <PressScale
                          haptic={false}
                          key={doc.document}
                          style={({ pressed }) => [styles.subRow, styles.rowDivider, pressed && styles.rowPressed]}
                          onPress={() => navigation.navigate('LegalDocument', { document: doc.document })}
                          accessibilityRole="button"
                          accessibilityLabel={doc.label}
                          accessibilityHint={doc.hint}
                        >
                          <Text style={styles.subRowTitle} numberOfLines={1}>{doc.label}</Text>
                          <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
                        </PressScale>
                      ))}
                  </DropdownBody>

                  {rowsOf(HUB_ACCOUNT.slice(1)).map((row) => renderRow(row, true))}

                  {/* The other mode's rows, behind one row that opens in place. */}
                  <PressScale
                    haptic={false}
                    style={({ pressed }) => [styles.row, { minHeight: settingsRowHeight }, styles.rowDivider, pressed && styles.rowPressed]}
                    onPress={() => setToolsOpen((open) => !open)}
                    accessibilityRole="button"
                    accessibilityLabel={toolsTitle}
                    accessibilityState={{ expanded: toolsOpen }}
                  >
                    <Ionicons name="grid-outline" size={settingsGlyphSize} color={iconColour} />
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{toolsTitle}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {toolsRows.map((row) => row.label).join(' · ')}
                      </Text>
                    </View>
                    <DropdownChevron open={toolsOpen}>
                      <Ionicons name="chevron-down" size={18} color={colors.textSubtle} />
                    </DropdownChevron>
                  </PressScale>
                  <DropdownBody open={toolsOpen}>
                      {toolsRows.map((row) => renderRow(row, true))}
                  </DropdownBody>
                </>
              )}

              {/* SIGN OUT — the only place it lives, quiet, and it confirms
                  first (Account & safety's "Log out", moved). */}
              <PressScale
                onPress={() => void handleSignOut()}
                disabled={signingOut}
                style={({ pressed }) => [styles.signOut, isDark && styles.signOutDark, pressed && styles.rowPressed]}
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                accessibilityState={{ disabled: signingOut, busy: signingOut }}
              >
                {signingOut ? (
                  <ActivityIndicator color={colors.danger} />
                ) : (
                  <Text style={styles.signOutLabel}>Sign out</Text>
                )}
              </PressScale>
            </>
          ) : null}
        </ScrollView>
      )}

      {user && (
        <PortfolioPicker
          visible={pickerOpen}
          workerId={user.id}
          onClose={() => setPickerOpen(false)}
          onChanged={() => setPortfolioVersion((v) => v + 1)}
        />
      )}

      <PhotoViewer
        visible={!!avatarViewerUri}
        uri={avatarViewerUri}
        onClose={() => setAvatarViewerUri(null)}
        allowShare={false}
      />

      {/* Plain in-tree overlay, not a nested Modal — see PortfolioPicker for
          why stacking a second native Modal here would be a bug risk. */}
      {avatarMenuOpen && (
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setAvatarMenuOpen(false)}
        >
          <View style={styles.menuSheet}>
            <Pressable
              style={styles.menuRow}
              onPress={() => {
                setAvatarMenuOpen(false);
                if (avatarUrl) setAvatarViewerUri(avatarUrl);
              }}
            >
              <Ionicons name="eye-outline" size={18} color={colors.text} />
              <Text style={styles.menuRowText}>View photo</Text>
            </Pressable>

            {isEditing && (
              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  setAvatarMenuOpen(false);
                  pickAvatar();
                }}
              >
                <Ionicons name="camera-outline" size={18} color={colors.text} />
                <Text style={styles.menuRowText}>Change photo</Text>
              </Pressable>
            )}

            <Pressable
              style={styles.menuRow}
              onPress={() => {
                setAvatarMenuOpen(false);
                setRemoveConfirmOpen(true);
              }}
              disabled={removingAvatar}
            >
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
              <Text style={[styles.menuRowText, styles.menuRowTextDanger]}>
                Remove Photo
              </Text>
            </Pressable>

            <Pressable
              style={styles.menuCancelRow}
              onPress={() => setAvatarMenuOpen(false)}
            >
              <Text style={styles.menuCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      )}

      <ActionSheet
        visible={avatarActionSheetOpen}
        title="Profile photo"
        items={avatarActionSheetItems}
        onClose={() => setAvatarActionSheetOpen(false)}
      />

      <ConfirmDialog
        visible={removeConfirmOpen}
        title="Remove profile photo?"
        message="Your initials will be shown instead."
        confirmText="Remove"
        cancelText="Cancel"
        destructive
        loading={removingAvatar}
        onConfirm={handleRemoveAvatar}
        onCancel={() => setRemoveConfirmOpen(false)}
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
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 0,
  },
  avatarRow: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  avatarPress: {
    position: 'relative',
  },
  avatarEdit: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  // Master 30 sets the email in the serif under the centred avatar.
  email: {
    fontFamily: fonts.display,
    fontSize: 19,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.sm,
  },
  roleNote: {
    fontSize: 13,
    color: colors.textMuted,
  },
  reviewsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: spacing.sm,
  },
  reviewsLinkPressed: {
    opacity: 0.6,
  },
  reviewsLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  form: {
    gap: spacing.lg,
  },
  readOnly: {
    gap: spacing.lg,
  },
  readField: {
    gap: spacing.xs,
  },
  readValue: {
    fontSize: 16,
    color: colors.text,
  },
  field: {
    gap: spacing.sm,
  },
  // Decision 8: a field/section label is a gold small-caps eyebrow.
  // Master 30 draws these gold, master 29 draws its two cream (B-9) - the
  // decision settles it gold. Light keeps the Heritage muted label.
  fieldLabel: {
    ...EYEBROW_TYPE,
    color: colors.eyebrow,
  },
  fieldLabelDark: { color: colors.eyebrow },
  // A textarea is not a pill: the shared field is full-round for a single
  // line, and a taller box overrides that back to the card radius.
  multiline: {
    borderRadius: radius.lg,
    height: 84,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  editActions: {
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: withAlpha(colors.text, 0.45),
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuSheet: {
    width: 240,
    borderRadius: emeraldRadius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    paddingVertical: spacing.xs,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  menuRowText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  menuRowTextDanger: {
    color: colors.danger,
  },
  menuCancelRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  menuCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMuted,
  },
  meterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  meterTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  meterCount: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.emerald,
  },
  meterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  meterLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  meterLabelDone: {
    fontWeight: '400',
    color: colors.textMuted,
  },
  // 2026-09-29 (LUX-LIST-2 #7) — THE HUB, on the confirmed reference
  // (.shots/refresh/profile/): the sim's list sizes — rows 14/16 padded, a
  // 22pt plain icon, a 16/700 title over a 12 subtitle, hairlines between —
  // in #6's lit cards. The card and the pill take their look from
  // litCardStyle and the material; these are geometry and type.
  topGroup: { gap: spacing.md },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  identityCopy: { flex: 1, minWidth: 0 },
  identityName: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: colors.ink,
  },
  ratingLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
    alignSelf: 'flex-start',
  },
  identityMeta: {
    fontSize: 13,
    lineHeight: 17,
    color: colors.textMuted,
  },
  identityLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
  },
  identityLink: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.emerald,
  },
  // "Edit", not "Edit profile", so the 17/700 name keeps its width.
  editPill: {
    height: 40,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  editPillDark: { backgroundColor: withAlpha(colors.text, 0.06) },
  editPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  // The section eyebrow sits 24 under what precedes it (the content gap
  // plus this margin) and 10 over its card.
  section: { gap: spacing.sm + 2, marginTop: spacing.sm },
  sectionEyebrow: {
    ...EYEBROW_TYPE,
    color: colors.eyebrow,
    marginHorizontal: 2,
  },
  listCard: { padding: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowPressed: { opacity: 0.82 },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    color: colors.ink,
  },
  rowFill: { flex: 1 },
  rowSub: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
  },
  // A dropdown's own rows: indented to the parent's title, no icon of their own.
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 44,
    paddingVertical: spacing.md,
    paddingLeft: 52,
    paddingRight: spacing.lg,
  },
  subRowTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  // Two faces, the second overlapping the first by 6 — each ringed in the
  // card's own ground so the overlap reads as a cut, not a smudge.
  faces: { flexDirection: 'row', alignItems: 'center' },
  face: { borderWidth: 2, borderRadius: radius.pill },
  faceOverlap: { marginLeft: -10 },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.emerald, 0.1),
  },
  badgeDark: { backgroundColor: withAlpha(colors.emerald, 0.14) },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.emerald,
  },
  // The in-row theme switch: the Lux segment's track and filled choice
  // (components/SegmentedControl.tsx), at the row's size — each cell reaches
  // the 44pt floor through its hitSlop.
  switchTrack: {
    flexDirection: 'row',
    height: 32,
    borderRadius: radius.pill,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.mint,
  },
  switchTrackDark: { backgroundColor: withAlpha(colors.text, 0.06) },
  switchCell: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  // Quiet: the danger hue as a line and a breath of fill, never a red slab.
  signOut: {
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: withAlpha(colors.danger, 0.3),
    backgroundColor: withAlpha(colors.danger, 0.05),
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  signOutDark: {
    borderColor: withAlpha(colors.danger, 0.35),
    backgroundColor: withAlpha(colors.danger, 0.06),
  },
  signOutLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.danger,
  },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  deleteRowPressed: {
    opacity: 0.7,
  },
  deleteLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.danger,
  },
  adminCard: {
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  adminEyebrow: {
    ...EYEBROW_TYPE,
    color: colors.warning,
  },
  adminRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  adminLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.warning,
  },
  }),
);
