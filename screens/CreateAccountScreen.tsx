import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AuthButton } from '../components/AuthButton';
import { AuthField } from '../components/AuthField';
import { AuthNotice } from '../components/AuthNotice';
import { AuthScaffold } from '../components/AuthScaffold';
import { PhoneNumberInput } from '../components/PhoneNumberInput';
import { authRadius, authSpacing, authType } from '../lib/authTheme';
import {
  authSurface,
  fonts,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';
import { DEFAULT_COUNTRY, type Country } from '../lib/countries';
import type { AuthStackNavigation } from '../lib/navigation';
import { maskE164, phoneValidationError, toE164 } from '../lib/phoneNumber';
import { phoneAuth } from '../lib/phoneAuth';

/**
 * Create account — phone first.
 *
 * Deliberately has no large centred brand mark: the reference option sheet
 * showed one, and it made the screen top-heavy. The back button, the small
 * navigation title, the eyebrow and the headline carry the hierarchy instead.
 *
 * Two values, both of which the account will need anyway: a name and a number.
 * No email, no password — a phone signup that quietly collected a password
 * would be a second credential nobody asked for. This screen opens only while
 * phone sign-in is live, and then it offers no email sign-up (B12): every new
 * account carries a verified phone. Until SMS is switched on, Welcome sends
 * sign-up to the email form instead (PHONE_ENTRY).
 *
 * Nothing is written anywhere at this point. The name travels to VerifyPhone as
 * a draft and only becomes a profile once a real session exists — no hosted row
 * is created ahead of authentication, and in mock mode none is created at all.
 */
export function CreateAccountScreen() {
  const navigation = useNavigation<AuthStackNavigation>();
  const phoneRef = useRef<TextInput>(null);
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const surface = authSurface(colors, isDark);

  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [phoneDigits, setPhoneDigits] = useState('');

  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function handleCreateAccount() {
    // Guards a double tap landing between the press and the disabled state.
    if (loading) return;

    setNotice(null);
    const trimmedName = fullName.trim();

    const nextNameError = trimmedName ? null : 'Enter your full name.';
    const nextPhoneError = phoneValidationError(country, phoneDigits);

    setNameError(nextNameError);
    setPhoneError(nextPhoneError);
    if (nextNameError || nextPhoneError) return;

    const phone = toE164(country, phoneDigits);
    if (!phone) {
      setPhoneError('Enter a valid phone number.');
      return;
    }

    const profileDraft = { fullName: trimmedName };

    setLoading(true);
    const result = await phoneAuth.requestOtp({ phone, intent: 'sign-up', profileDraft });
    if (!mounted.current) return;
    setLoading(false);

    if (result.status === 'challenge-sent') {
      navigation.navigate('VerifyPhone', {
        phone: result.phone,
        maskedPhone: maskE164(result.phone),
        intent: 'sign-up',
        challengeId: result.challengeId,
        expiresAt: result.expiresAt,
        resendAvailableAt: result.resendAvailableAt,
        profileDraft,
      });
      return;
    }

    setNotice(result.message);
  }

  return (
    <AuthScaffold
      title="Create Account"
      onBack={() => navigation.goBack()}
      backdrop="soft"
      themed
    >
      <View style={styles.body}>
        <Text style={styles.title} maxFontSizeMultiplier={1.5}>
          One account. Two ways to use it.
        </Text>
        <Text style={styles.subtitle}>
          Switch modes to hire help or find work.
        </Text>

        <View style={styles.form}>
          <AuthField
            label="Full name"
            themed
            leading={<Ionicons name="person-outline" size={20} color={surface.fieldGlyph} />}
            value={fullName}
            onChangeText={(next) => {
              setFullName(next);
              if (nameError) setNameError(null);
              if (notice) setNotice(null);
            }}
            error={nameError}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            placeholder="Carlos Reyes"
            returnKeyType="next"
            onSubmitEditing={() => phoneRef.current?.focus()}
            submitBehavior="submit"
          />

          <PhoneNumberInput
            ref={phoneRef}
            themed
            country={country}
            onChangeCountry={setCountry}
            value={phoneDigits}
            onChangeValue={(digits) => {
              setPhoneDigits(digits);
              if (phoneError) setPhoneError(null);
              if (notice) setNotice(null);
            }}
            error={phoneError}
            editable={!loading}
            returnKeyType="go"
            onSubmitEditing={handleCreateAccount}
          />

          {notice ? <AuthNotice tone="info">{notice}</AuthNotice> : null}
        </View>

        {/* Master 3 draws this as a hairlined card, not a sage wash. */}
        <View style={[styles.privacy, { borderColor: surface.line }]}>
          <Ionicons name="shield-checkmark-outline" size={20} color={surface.accent} />
          <Text style={styles.privacyText}>
            Private until a job is confirmed.
          </Text>
        </View>

        {/* marginTop:'auto' — extra height on a tall device becomes breathing
            room above this, not taller inputs, and the CTA stays clear of the
            bottom safe area that AuthScaffold reserves. */}
        <View style={styles.actions}>
          <AuthButton
            title="Create account"
            themed
            onPress={handleCreateAccount}
            loading={loading}
            accessibilityHint="Send a verification code to this phone number"
          />
        </View>
      </View>
    </AuthScaffold>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  body: {
    flexGrow: 1,
    paddingBottom: authSpacing.lg,
  },
  // Master 3's display headline is the serif.
  title: {
    ...authType.title,
    fontFamily: fonts.display,
    color: colors.ink,
    marginTop: authSpacing.md,
  },
  subtitle: {
    ...authType.body,
    color: colors.textMuted,
    marginTop: authSpacing.md - 2,
  },
  form: {
    marginTop: authSpacing.xxl,
    gap: authSpacing.xl - 4,
  },
  privacy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: authSpacing.md - 2,
    marginTop: authSpacing.xl,
    padding: authSpacing.lg - 2,
    borderRadius: authRadius.field + 2,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  privacyText: {
    ...authType.note,
    flex: 1,
    color: colors.ink,
  },
  actions: {
    marginTop: 'auto',
    paddingTop: authSpacing.xxl,
    gap: authSpacing.md,
  },
  }),
);
