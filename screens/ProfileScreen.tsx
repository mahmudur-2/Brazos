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
import { Avatar } from '../components/Avatar';
import { AvatarPressable } from '../components/AvatarPressable';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { CategoryAccordion } from '../components/CategoryAccordion';
import { Chip } from '../components/Chip';
import { PastWork } from '../components/PastWork';
import { PhotoViewer } from '../components/PhotoViewer';
import { PortfolioPicker } from '../components/PortfolioPicker';
import { ScreenHeader } from '../components/ScreenHeader';
import { SegmentedControl } from '../components/SegmentedControl';
import { TextField } from '../components/TextField';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { formatPhoneDisplay } from '../lib/phone';
import { skillCategoryIcon, skillCategoryLabel } from '../lib/skillCategories';
import { updateProfile } from '../lib/profiles';
import { uploadAvatar } from '../lib/storage';
import { isValidPhone } from '../lib/validation';
import type { ProfileStackNavigation } from '../lib/navigation';
import { colors, spacing } from '../lib/theme';

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
  const [removingAvatar, setRemovingAvatar] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

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

  function toggleCategory(c: string) {
    setCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }

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

  /** Resets the profile picture to the default placeholder avatar. */
  async function handleRemoveAvatar() {
    if (!user) return;
    const ok = await confirmAsync({
      title: 'Remove profile photo?',
      message: 'This resets your profile picture to the default avatar.',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;

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

    if (!profile?.avatar_url) return;

    setRemovingAvatar(true);
    const { data, error } = await updateProfile(user.id, { avatar_url: null });
    setRemovingAvatar(false);

    if (error) {
      await alertAsync('Could not remove photo', error.message);
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
      await alertAsync('Could not save', error.message);
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
    if (error) await alertAsync('Logout failed', error.message);
  }

  const selectedCategoryLabels = categories.map((c) => ({
    key: c,
    label: skillCategoryLabel(c),
    icon: skillCategoryIcon(c),
  }));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="Profile"
        right={
          !loading && !isEditing ? (
            <Pressable onPress={() => setIsEditing(true)} hitSlop={8}>
              <Text style={styles.editLink}>Edit Profile</Text>
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
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.avatarRow}>
            {isEditing ? (
              // onPress (change photo) and onLongPress (open the photo menu)
              // coexist fine on one Pressable — they're different gestures.
              <Pressable
                onPress={pickAvatar}
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
            <Text style={styles.roleNote}>You can post jobs and find work.</Text>
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
          </Card>

          {profile?.is_admin && (
            <Button
              title="Review reports (admin)"
              variant="secondary"
              onPress={() => navigation.navigate('AdminReports')}
            />
          )}

          <Button
            title="Log out"
            variant="secondary"
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
                handleRemoveAvatar();
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
    padding: spacing.lg,
    gap: spacing.lg,
  },
  editLink: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
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
});
