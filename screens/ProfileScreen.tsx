import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ActionSheet, type ActionSheetItem } from '../components/ActionSheet';
import { Avatar } from '../components/Avatar';
import { AvatarPressable } from '../components/AvatarPressable';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { CategoryAccordion } from '../components/CategoryAccordion';
import { Chip } from '../components/Chip';
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
import { formatPhoneDisplay } from '../lib/phone';
import { fetchWorkerJobStats, type CategoryStat } from '../lib/portfolio';
import { skillCategoryIcon, skillCategoryLabel } from '../lib/skillCategories';
import { updateProfile } from '../lib/profiles';
import { uploadAvatar } from '../lib/storage';
import { isValidPhone } from '../lib/validation';
import type { ProfileStackNavigation } from '../lib/navigation';
import { colors, radius, spacing } from '../lib/theme';

const LANGUAGE_OPTIONS = [
  { label: 'English', value: 'en' },
  { label: 'Español', value: 'es' },
];

// A bio renders as a short block on this same screen and on WorkerProfileScreen
// — this is enough room for a few sentences without letting it grow into a
// full paragraph that dominates either layout.
const MAX_BIO_LENGTH = 200;

function languageLabel(value: string) {
  return LANGUAGE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function ProfileScreen() {
  const navigation = useNavigation<ProfileStackNavigation>();
  const { user, logout } = useAuth();
  const { profile, loading, setProfile } = useProfile();

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
  const [loggingOut, setLoggingOut] = useState(false);
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

  async function handleLogout() {
    // One confirmation, not two — logout isn't destructive or unrecoverable
    // the way unsend/ban-user are (you just sign back in), so it doesn't
    // need the same friction. The destructive choice still sits second and
    // styled as destructive, so a stray tap lands on Cancel.
    const ok = await confirmAsync({
      title: 'Log out?',
      message: 'You can sign back in any time.',
      confirmText: 'Log out',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;

    setLoggingOut(true);
    const { error } = await logout();
    setLoggingOut(false);
    if (error) await alertAsync('Logout failed', userMessage(error));
  }

  const selectedCategoryLabels = categories.map((c) => ({
    key: c,
    label: skillCategoryLabel(c),
    icon: skillCategoryIcon(c),
  }));

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
  if (profile?.rating_count) {
    summaryParts.push(`★ ${(profile.rating_avg ?? 0).toFixed(1)} (${profile.rating_count})`);
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
      <ScreenHeader
        title="Profile"
        right={
          !loading && !isEditing ? (
            <Button
              title="Edit"
              variant="secondary"
              size="sm"
              icon="create-outline"
              onPress={() => setIsEditing(true)}
            />
          ) : undefined
        }
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
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
            <Text style={styles.roleNote}>{profileSummary}</Text>
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

          <Card>
            {isEditing ? (
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
                  <Text style={styles.fieldLabel}>Language</Text>
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
                  <Text style={styles.fieldLabel}>Job categories (optional)</Text>
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
            ) : (
              <View style={styles.readOnly}>
                <View style={styles.readField}>
                  <Text style={styles.fieldLabel}>Full name</Text>
                  <Text style={styles.readValue}>{fullName || '—'}</Text>
                </View>
                <View style={styles.readField}>
                  <Text style={styles.fieldLabel}>Phone number</Text>
                  <Text style={styles.readValue}>
                    {phone ? formatPhoneDisplay(phone) : '—'}
                  </Text>
                </View>
                <View style={styles.readField}>
                  <Text style={styles.fieldLabel}>Language</Text>
                  <Text style={styles.readValue}>{languageLabel(language)}</Text>
                </View>
                <View style={styles.readField}>
                  <Text style={styles.fieldLabel}>Bio</Text>
                  <Text style={styles.readValue}>{bio || 'No bio yet'}</Text>
                </View>
                <View style={styles.readField}>
                  <Text style={styles.fieldLabel}>Job categories</Text>
                  {selectedCategoryLabels.length > 0 ? (
                    <View style={styles.chips}>
                      {selectedCategoryLabels.map((c) => (
                        <Chip key={c.key} label={c.label} icon={c.icon} selected />
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.readValue}>No categories selected</Text>
                  )}
                </View>
              </View>
            )}
          </Card>

          {user && (
            <PastWork
              workerId={user.id}
              editable
              onManage={() => setPickerOpen(true)}
              refreshToken={portfolioVersion}
            />
          )}

          <Card>
            <Text style={styles.settingsTitle}>Settings</Text>
            <Pressable
              style={styles.settingsRow}
              onPress={() => navigation.navigate('NotificationSettings')}
            >
              <Ionicons name="notifications-outline" size={20} color={colors.textMuted} />
              <Text style={styles.settingsLabel}>Notifications</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
            </Pressable>

            {/* Phase 12 — the in-app event feed. */}
            <Pressable
              style={[styles.settingsRow, styles.settingsRowDivider]}
              onPress={() => navigation.navigate('Notifications')}
            >
              <Ionicons name="mail-unread-outline" size={20} color={colors.textMuted} />
              <Text style={styles.settingsLabel}>Notification feed</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
            </Pressable>

            {/* Phase 11 — the ledger-derived wallet. */}
            <Pressable
              style={[styles.settingsRow, styles.settingsRowDivider]}
              onPress={() => navigation.navigate('Earnings')}
            >
              <Ionicons name="wallet-outline" size={20} color={colors.textMuted} />
              <Text style={styles.settingsLabel}>Earnings</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
            </Pressable>

            {/* Phase 9 — worker self-service + customer trust surfaces. */}
            <Pressable
              style={[styles.settingsRow, styles.settingsRowDivider]}
              onPress={() => navigation.navigate('ServicesPricing')}
            >
              <Ionicons name="pricetag-outline" size={20} color={colors.textMuted} />
              <Text style={styles.settingsLabel}>Services & availability</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
            </Pressable>

            <Pressable
              style={[styles.settingsRow, styles.settingsRowDivider]}
              onPress={() => navigation.navigate('SavedWorkers')}
            >
              <Ionicons name="bookmark-outline" size={20} color={colors.textMuted} />
              <Text style={styles.settingsLabel}>Saved & past workers</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
            </Pressable>

            <Pressable
              style={[styles.settingsRow, styles.settingsRowDivider]}
              onPress={() => navigation.navigate('PaymentMethods')}
            >
              <Ionicons name="card-outline" size={20} color={colors.textMuted} />
              <Text style={styles.settingsLabel}>Payment methods</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
            </Pressable>

            <Pressable
              style={[styles.settingsRow, styles.settingsRowDivider]}
              onPress={() => navigation.navigate('LegalDocument', { document: 'terms' })}
            >
              <Ionicons name="document-text-outline" size={20} color={colors.textMuted} />
              <Text style={styles.settingsLabel}>Terms of Service</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
            </Pressable>

            <Pressable
              style={[styles.settingsRow, styles.settingsRowDivider]}
              onPress={() => navigation.navigate('LegalDocument', { document: 'privacy' })}
            >
              <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} />
              <Text style={styles.settingsLabel}>Privacy Policy</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
            </Pressable>

            {/* Dev-only entry to the design-system catalog. The route itself is
                only registered under __DEV__ in App.tsx, so this row and its
                destination disappear together in a production build. */}
            {__DEV__ && (
              <Pressable
                style={[styles.settingsRow, styles.settingsRowDivider]}
                onPress={() => navigation.navigate('ComponentCatalog')}
              >
                <Ionicons name="color-palette-outline" size={20} color={colors.textMuted} />
                <Text style={styles.settingsLabel}>Component catalog (dev)</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
              </Pressable>
            )}
          </Card>

          {/* Deliberately NOT a Button like Log out below — same pill shape
              and secondary styling made a moderation action (bans other
              users, cancels their jobs) look like a twin of "sign out of
              your own account", with nothing to stop a mis-tap. Boxed off,
              amber-tinted, and icon-led instead so it reads as a different
              category of action, not a routine one. */}
          {profile?.is_admin && (
            <Pressable
              style={styles.adminCard}
              onPress={() => navigation.navigate('AdminReports')}
            >
              <Text style={styles.adminEyebrow}>Admin</Text>
              <View style={styles.adminRow}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.warning} />
                <Text style={styles.adminLabel}>Review reports</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.warning} />
              </View>
            </Pressable>
          )}

          {/* Destructive styling only — handleLogout, its confirmation, and
              where it lands are all unchanged. */}
          <Button
            title="Log out"
            variant="destructive"
            icon="log-out-outline"
            onPress={handleLogout}
            loading={loggingOut}
          />
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

const styles = StyleSheet.create({
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
    gap: spacing.lg,
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
  email: {
    fontSize: 15,
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
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  multiline: {
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
    backgroundColor: 'rgba(31,46,34,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuSheet: {
    width: 240,
    borderRadius: 14,
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
  settingsTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  settingsRowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  settingsLabel: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
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
});
