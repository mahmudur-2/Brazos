import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import { BrazosMonogram } from '../components/BrazosMonogram';
import { AvatarPressable } from '../components/AvatarPressable';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { CategoryAccordion } from '../components/CategoryAccordion';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PastWork } from '../components/PastWork';
import { PhotoViewer } from '../components/PhotoViewer';
import { PortfolioPicker } from '../components/PortfolioPicker';
import { ScreenHeader } from '../components/ScreenHeader';
import { SegmentedControl } from '../components/SegmentedControl';
import { TextField } from '../components/TextField';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { permissionOutcome, trackIntent } from '../lib/observability/analytics';
import { fetchPortfolio, fetchWorkerJobStats, type CategoryStat } from '../lib/portfolio';
import {
  profileCompleteness,
  type CompletenessStepKey,
} from '../lib/profileCompleteness';
import { fetchWorkerServices } from '../lib/services';
import { updateProfile } from '../lib/profiles';
import { useMode } from '../modes/ModeProvider';
import { uploadAvatar } from '../lib/storage';
import { isValidPhone } from '../lib/validation';
import type {
  ProfileStackNavigation,
  ProfileStackParamList,
} from '../lib/navigation';
import { useDialNumber } from '../lib/designOverrides';
import {
  emeraldRadius,
  fonts,
  radius,
  spacing,
  starColors,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';

const LANGUAGE_OPTIONS = [
  { label: 'English', value: 'en' },
  { label: 'Español', value: 'es' },
];

// A bio renders as a short block on this same screen and on WorkerProfileScreen
// — this is enough room for a few sentences without letting it grow into a
// full paragraph that dominates either layout.
const MAX_BIO_LENGTH = 200;

/** Master 45's five settings rows, in the order it draws them. */
const HUB_SETTINGS: {
  route: 'NotificationSettings' | 'Notifications' | 'Earnings' | 'ServicesPricing' | 'SavedWorkers';
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub: string;
}[] = [
  {
    route: 'NotificationSettings',
    icon: 'notifications-outline',
    label: 'Notifications',
    sub: 'Choose which events can alert you.',
  },
  {
    route: 'Notifications',
    icon: 'mail-unread-outline',
    label: 'Notification feed',
    sub: 'Job, offer and payment updates.',
  },
  {
    route: 'Earnings',
    icon: 'wallet-outline',
    label: 'Earnings',
    sub: 'Available, pending and transferred.',
  },
  {
    route: 'ServicesPricing',
    icon: 'pricetag-outline',
    label: 'Services & availability',
    sub: 'Pricing, categories and schedule.',
  },
  {
    route: 'SavedWorkers',
    icon: 'bookmark-outline',
    label: 'Saved & past workers',
    sub: 'Rehire people you trust.',
  },
];


export function ProfileScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // RUN T2 (C5) — PROFILE'S OWN DIALS. Each falls back to the value this file
  // drew before the dial existed, spelled here and nowhere else. The three
  // that answer to a token take the `theme.*` scale, because this file imports
  // spacing/radius from lib/theme — `emeraldRadius` is the one name here that
  // reaches the other scale, and nothing below is dialled through it.
  const settingsRowHeight = useDialNumber('profile.settingsRow.height') ?? 64;
  const settingsGlyphSize = useDialNumber('profile.settingsGlyph.size') ?? 44;
  const hubCardRadius = useDialNumber('profile.hubCard.radius') ?? radius.xl;
  const hubCardPadding = useDialNumber('profile.hubCard.padding') ?? spacing.lg;
  const contentGap = useDialNumber('profile.content.gap') ?? spacing.lg;
  const navigation = useNavigation<ProfileStackNavigation>();
  const { params } = useRoute<RouteProp<ProfileStackParamList, 'ProfileMain'>>();
  const { user } = useAuth();
  const { profile, loading, setProfile } = useProfile();
  const { mode } = useMode();

  const [isEditing, setIsEditing] = useState(false);
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
  // §6.4 — published-services and portfolio counts behind the completeness
  // meter. Null = not yet known, and an UNKNOWN count renders no meter at
  // all rather than a guessed one.
  const [meterCounts, setMeterCounts] = useState<{
    services: number;
    portfolio: number;
  } | null>(null);

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
    if (wantsEdit) setIsEditing(true);
  }, [wantsEdit]);

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
    avatarUrl: profile?.avatar_url ?? null,
    bio: profile?.bio ?? null,
    publishedServiceCount: meterCounts?.services ?? 0,
    portfolioCount: meterCounts?.portfolio ?? 0,
  });

  /** Each unmet meter step routes to the surface that fixes it. */
  function meterAction(key: CompletenessStepKey) {
    if (key === 'avatar' || key === 'bio') {
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
      await alertAsync(
        'Camera access needed',
        'Enable camera access for Brazos in your device Settings to take a new photo.'
      );
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

  async function handleCancel() {
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
      if (!ok) return;
    }

    loadDraftFromProfile();
    setIsEditing(false);
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
    setIsEditing(false);
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
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric',
      })
    : null;
  const summaryParts: string[] = [];
  // The star leads the line when there is a rating, and is rendered as its own
  // span below so it can carry the one gold star treatment instead of the
  // meta line's grey.
  const summaryLeadsWithStar = Boolean(profile?.rating_count);
  if (profile?.rating_count) {
    summaryParts.push(`${(profile.rating_avg ?? 0).toFixed(1)} (${profile.rating_count})`);
  }
  if (totalCompletedJobs > 0) {
    summaryParts.push(`${totalCompletedJobs} job${totalCompletedJobs === 1 ? '' : 's'} completed`);
  }
  if (memberSince) {
    summaryParts.push(`Member since ${memberSince}`);
  }
  const profileSummary =
    summaryParts.length > 0 ? summaryParts.join(' · ') : 'You can post jobs and find work.';

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
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Master 45's header: the title centred with the pencil squircle at
          its right, opening the details page (decision 10). */}
      <ScreenHeader
        title="Profile"
        right={
          !loading && !isEditing ? (
            <Pressable
              onPress={() => navigation.navigate('ProfileDetails')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Profile details"
              style={[styles.squircle, isDark && styles.squircleDark]}
            >
              <Ionicons name="pencil" size={18} color={isDark ? colors.gold : colors.primary} />
            </Pressable>
          ) : undefined
        }
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { gap: contentGap }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Master 45's hub card. Only in the hub state: while editing, the
              screen IS the edit surface (masters 29/30) and the identity
              block below is what is being edited. */}
          {!isEditing ? (
            <View
              style={[
                styles.hubCard,
                { padding: hubCardPadding, borderRadius: hubCardRadius },
                isDark && styles.hubCardDark,
              ]}
            >
              {isDark ? <BrazosMonogram size={150} style={styles.hubMark} /> : null}
              <View style={styles.hubTopRow}>
                <Text style={styles.hubEyebrow}>YOUR WORK</Text>
                <Pressable
                  onPress={() => setIsEditing(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Edit your profile"
                  style={({ pressed }) => [styles.hubChip, pressed && styles.hubChipPressed]}
                >
                  <Text style={styles.hubChipText}>Edit</Text>
                </Pressable>
              </View>
              <Text style={styles.hubTitle}>Past work &amp; settings</Text>
              <Text style={styles.hubBody}>
                One profile supports both hiring help and finding work.
              </Text>
              <View style={styles.hubFlourish} />
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
                about me?" is answerable from your own profile too. */}
            {!!profile?.rating_count && user && (
              <Pressable
                onPress={() =>
                  navigation.navigate('ProfileReviews', {
                    userId: user.id,
                    name: profile.full_name ?? undefined,
                  })
                }
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`See all ${profile.rating_count} reviews about you`}
                style={({ pressed }) => [styles.reviewsLink, pressed && styles.reviewsLinkPressed]}
              >
                <Text style={styles.reviewsLinkText}>
                  See {profile.rating_count === 1 ? 'your review' : 'all your reviews'}
                </Text>
                <Ionicons name="chevron-forward" size={13} color={colors.primary} />
              </Pressable>
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
                <TextField
                  label="Phone number"
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
                <Pressable
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
                </Pressable>
              ))}
            </Card>
          ) : null}

          {user && (
            <PastWork
              workerId={user.id}
              editable
              onManage={() => setPickerOpen(true)}
              refreshToken={portfolioVersion}
            />
          )}

          {/* Master 45's settings card: five rows and an "Account" chip into
              the account & safety page (decision 10). Payment, the two legal
              documents, Appearance, the moderator entry, the dev catalog,
              Log out and Delete all moved there — every route still exists
              and every one is still reachable in BOTH modes, because this
              stack is the shared one both trees mount. */}
          <Card>
            <View style={styles.settingsHead}>
              <Text style={styles.settingsTitle}>Settings</Text>
              <Pressable
                onPress={() => navigation.navigate('AccountSafety')}
                accessibilityRole="button"
                accessibilityLabel="Account and safety"
                style={({ pressed }) => [styles.hubChip, pressed && styles.hubChipPressed]}
              >
                <Text style={styles.hubChipText}>Account</Text>
              </Pressable>
            </View>

            {HUB_SETTINGS.map((row, index) => (
              <Pressable
                key={row.route}
                style={[
                  styles.settingsRow,
                  { minHeight: settingsRowHeight },
                  index > 0 && styles.settingsRowDivider,
                ]}
                onPress={() => navigation.navigate(row.route)}
                accessibilityRole="button"
                accessibilityLabel={row.label}
              >
                <View
                  style={[
                    styles.settingsGlyph,
                    { width: settingsGlyphSize, height: settingsGlyphSize },
                    isDark && styles.settingsGlyphDark,
                  ]}
                >
                  <Ionicons
                    name={row.icon}
                    size={20}
                    color={isDark ? colors.gold : colors.textMuted}
                  />
                </View>
                <View style={styles.settingsCopy}>
                  <Text style={styles.settingsLabel}>{row.label}</Text>
                  <Text style={styles.settingsSub}>{row.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
              </Pressable>
            ))}
          </Card>
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  fieldLabelDark: { color: colors.gold },
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
  // Master 45's hub card and its chips.
  hubCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  hubCardDark: { borderColor: colors.border },
  hubMark: { position: 'absolute', right: -16, top: -20 },
  hubTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  hubEyebrow: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: colors.gold,
  },
  hubTitle: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    color: colors.ink,
  },
  hubBody: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.textMuted,
  },
  // The short gold rule master 45 sets under the hub copy.
  hubFlourish: {
    width: 48,
    height: 0,
    marginTop: spacing.xs,
    borderTopWidth: 2,
    borderTopColor: colors.gold,
  },
  hubChip: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  hubChipPressed: { opacity: 0.82 },
  hubChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gold,
  },
  squircle: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  squircleDark: {
    borderColor: colors.gold,
  },
  settingsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  settingsTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '700',
    color: colors.ink,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  settingsRowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  settingsGlyph: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.border,
  },
  settingsGlyphDark: {
    backgroundColor: 'transparent',
    borderColor: colors.gold,
  },
  settingsCopy: { flex: 1, gap: 2 },
  settingsLabel: {
    fontFamily: fonts.display,
    fontSize: 19,
    fontWeight: '700',
    color: colors.ink,
  },
  settingsSub: {
    fontSize: 13,
    color: colors.textMuted,
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
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
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
