import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthButton } from '../components/AuthButton';
import { AuthField } from '../components/AuthField';
import { AuthScaffold } from '../components/AuthScaffold';
import { authRadius, authSizes, authSpacing, authType } from '../lib/authTheme';
import {
  authSurface,
  fonts,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';
import { completePasswordReset, MIN_PASSWORD_LENGTH, setRecoveryPending } from '../lib/passwordReset';
import { userMessage } from '../lib/errorMessage';
import { Announce } from '../hooks/useAnnounce';

/**
 * 2026-09-26 (the refresh, audit M-21) — SET A NEW PASSWORD.
 *
 * Where the reset email's link lands (lib/passwordReset.ts): the link has
 * already signed the account in with its own recovery session, so this screen
 * asks for the new password twice and saves it with updateUser(). It is drawn
 * as the email Sign-in's sibling — the same eyebrow, headline and fields, the
 * same pinned lead that rides the keyboard — so the recovery reads as part of
 * signing in, not a detour.
 */
export function ResetPasswordScreen() {
  const confirmRef = useRef<TextInput>(null);
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const surface = authSurface(colors, isDark);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [shown, setShown] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (saving) return;
    setFormError(null);
    const nextPasswordError =
      password.length < MIN_PASSWORD_LENGTH ? `Use at least ${MIN_PASSWORD_LENGTH} characters.` : null;
    const nextConfirmError = !nextPasswordError && confirm !== password ? 'The two passwords don’t match.' : null;
    setPasswordError(nextPasswordError);
    setConfirmError(nextConfirmError);
    if (nextPasswordError || nextConfirmError) return;

    setSaving(true);
    const { error } = await completePasswordReset(password);
    setSaving(false);
    // Nothing typed is cleared on failure: one field is fixed and retried.
    if (error) {
      setFormError(userMessage(error));
      return;
    }
    // Saved: the recovery session is an ordinary session now, so the app opens.
    setRecoveryPending(false);
  }

  const eye = (
    <Pressable
      onPress={() => setShown((value) => !value)}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={shown ? 'Hide password' : 'Show password'}
      accessibilityState={{ selected: shown }}
    >
      <Ionicons name={shown ? 'eye-off-outline' : 'eye-outline'} size={20} color={surface.fieldGlyph} />
    </Pressable>
  );

  const footer = (
    <View style={styles.footer}>
      <AuthButton title="Save new password" themed hero lit chevron onPress={handleSave} loading={saving} />
    </View>
  );

  return (
    <AuthScaffold title="New Password" backdrop="soft" footer={footer} footerBelowLead={0} themed>
      <View style={styles.body}>
        <Text style={[styles.eyebrow, { color: surface.accent }]}>ACCOUNT RECOVERY</Text>
        <Text style={styles.title} maxFontSizeMultiplier={1.5}>
          Set a new password
        </Text>
        <Text style={styles.subtitle}>
          Choose a new password for your account. You’ll use it the next time you sign in.
        </Text>

        <View style={styles.form}>
          <AuthField
            label="New password"
            themed
            leading={<Ionicons name="lock-closed-outline" size={20} color={surface.fieldGlyph} />}
            trailing={eye}
            value={password}
            onChangeText={(next) => {
              setPassword(next);
              if (passwordError) setPasswordError(null);
              if (formError) setFormError(null);
            }}
            error={passwordError}
            secureTextEntry={!shown}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            placeholder="••••••••"
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            submitBehavior="submit"
          />
          <AuthField
            ref={confirmRef}
            label="Confirm new password"
            themed
            leading={<Ionicons name="lock-closed-outline" size={20} color={surface.fieldGlyph} />}
            value={confirm}
            onChangeText={(next) => {
              setConfirm(next);
              if (confirmError) setConfirmError(null);
              if (formError) setFormError(null);
            }}
            error={confirmError}
            secureTextEntry={!shown}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            placeholder="••••••••"
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
          {formError ? (
            <View style={styles.formError} accessibilityLiveRegion="polite">
              <Text style={styles.formErrorText}>{formError}</Text>
              <Announce message={formError} />
            </View>
          ) : null}
        </View>
      </View>
    </AuthScaffold>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    body: {
      flexGrow: 1,
      paddingTop: authSpacing.sm,
      paddingBottom: authSpacing.xxl,
    },
    eyebrow: {
      ...authType.heroEyebrow,
      marginTop: authSpacing.xl,
    },
    title: {
      ...authType.heroTitle,
      fontFamily: fonts.display,
      color: colors.ink,
      marginTop: authSpacing.sm,
    },
    subtitle: {
      ...authType.body,
      color: colors.textMuted,
      marginTop: authSpacing.sm,
    },
    form: {
      marginTop: authSpacing.xl,
      gap: authSpacing.lg,
    },
    formError: {
      padding: authSpacing.md,
      borderRadius: authRadius.field,
      backgroundColor: withAlpha(colors.danger, 0.14),
    },
    formErrorText: {
      ...authType.note,
      color: colors.danger,
    },
    footer: {
      gap: authSpacing.md,
      minHeight: authSizes.heroButton,
    },
  })
);
