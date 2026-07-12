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
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { ScreenHeader } from '../components/ScreenHeader';
import { SegmentedControl } from '../components/SegmentedControl';
import { TextField } from '../components/TextField';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { alertAsync } from '../lib/dialog';
import { JOB_CATEGORIES, JOB_CATEGORY_ICONS, JOB_CATEGORY_LABELS } from '../lib/jobs';
import { updateProfile } from '../lib/profiles';
import { uploadAvatar } from '../lib/storage';
import { colors, radius, spacing } from '../lib/theme';

const LANGUAGE_OPTIONS = [
  { label: 'English', value: 'en' },
  { label: 'Español', value: 'es' },
];

export function ProfileScreen() {
  const { user, logout } = useAuth();
  const { profile, loading, setProfile } = useProfile();

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

  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (profile && loadedRef.current !== profile.id) {
      loadedRef.current = profile.id;
      setFullName(profile.full_name ?? '');
      setPhone(profile.phone ?? '');
      setBio(profile.bio ?? '');
      setLanguage(profile.language ?? 'en');
      setCategories(profile.categories ?? []);
      setAvatarUrl(profile.avatar_url ?? null);
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

  async function handleSave() {
    if (!user) return;
    if (!fullName.trim() || !phone.trim()) {
      await alertAsync('Required', 'Full name and phone number are required.');
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
    await alertAsync(
      'Saved',
      partial
        ? 'Saved name, phone and photo. Run the phase7 SQL to enable bio, language and categories.'
        : 'Your profile has been updated.'
    );
  }

  async function handleLogout() {
    setLoggingOut(true);
    const { error } = await logout();
    setLoggingOut(false);
    if (error) await alertAsync('Logout failed', error.message);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Profile" />

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
            <Pressable onPress={pickAvatar} style={styles.avatarPress}>
              <Avatar name={fullName} uri={avatarUrl} size={84} />
              <View style={styles.avatarEdit}>
                <Ionicons name="camera" size={16} color={colors.white} />
              </View>
            </Pressable>
            <Text style={styles.email}>{user?.email}</Text>
            <Text style={styles.roleNote}>You can post jobs and find work.</Text>
          </View>

          <Card>
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
                onChangeText={setPhone}
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
                placeholder="A sentence about the work you do…"
                autoCapitalize="sentences"
                multiline
                numberOfLines={3}
                style={styles.multiline}
              />

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Job categories (optional)</Text>
                <View style={styles.chips}>
                  {JOB_CATEGORIES.map((c) => (
                    <Chip
                      key={c}
                      label={JOB_CATEGORY_LABELS[c]}
                      icon={JOB_CATEGORY_ICONS[c]}
                      selected={categories.includes(c)}
                      onPress={() => toggleCategory(c)}
                    />
                  ))}
                </View>
              </View>

              <Button title="Save changes" onPress={handleSave} loading={saving} />
            </View>
          </Card>

          <Button
            title="Log out"
            variant="secondary"
            onPress={handleLogout}
            loading={loggingOut}
          />
        </ScrollView>
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
  field: {
    gap: spacing.sm,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
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
});
