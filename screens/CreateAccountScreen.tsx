import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AuthButton } from '../components/AuthButton';
import { AuthField } from '../components/AuthField';
import { AuthNotice } from '../components/AuthNotice';
import { AuthScaffold } from '../components/AuthScaffold';
import { PhoneNumberInput } from '../components/PhoneNumberInput';
import { authColors, authRadius, authSpacing, authType } from '../lib/authTheme';
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
 * would be a second credential nobody asked for. The email/password form still
 * exists, one tap away on EmailCreateAccount, and is what actually registers
 * anyone until SMS is switched on.
 *
 * Nothing is written anywhere at this point. The name travels to VerifyPhone as
 * a draft and only becomes a profile once a real session exists — no hosted row
 * is created ahead of authentication, and in mock mode none is created at all.
 */
export function CreateAccountScreen() {
  const navigation = useNavigation<AuthStackNavigation>();
  const phoneRef = useRef<TextInput>(null);

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
    <AuthScaffold title="Create account" onBack={() => navigation.goBack()} backdrop="soft">
      <View style={styles.body}>
        <Text style={styles.eyebrow}>CREATE ACCOUNT</Text>
        <Text style={styles.title} maxFontSizeMultiplier={1.5}>
          One account. Two ways to use it.
        </Text>
        <Text style={styles.subtitle}>
          You can hire help and accept work. Your home screens change with your
          current mode.
        </Text>

        <View style={styles.form}>
          <AuthField
            label="Full name"
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

        <View style={styles.privacy}>
          <Ionicons name="shield-checkmark-outline" size={20} color={authColors.emerald} />
          <Text style={styles.privacyText}>
            Your number stays private until a job is confirmed.
          </Text>
        </View>

        {/* marginTop:'auto' — extra height on a tall device becomes breathing
            room above this, not taller inputs, and the CTA stays clear of the
            bottom safe area that AuthScaffold reserves. */}
        <View style={styles.actions}>
          <AuthButton
            title="Create account"
            onPress={handleCreateAccount}
            loading={loading}
            accessibilityHint="Send a verification code to this phone number"
          />
          <AuthButton
            title="Use Email Instead"
            variant="ghost"
            onPress={() => navigation.navigate('EmailCreateAccount')}
            disabled={loading}
            accessibilityHint="Sign up with an email address and password"
          />
        </View>
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  body: {
    flexGrow: 1,
    paddingBottom: authSpacing.lg,
  },
  eyebrow: {
    ...authType.eyebrow,
    color: authColors.emerald,
    marginTop: authSpacing.xl + authSpacing.xs,
  },
  title: {
    ...authType.title,
    color: authColors.ink,
    marginTop: authSpacing.md - 2,
  },
  subtitle: {
    ...authType.body,
    color: authColors.muted,
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
    backgroundColor: authColors.mint,
  },
  privacyText: {
    ...authType.note,
    flex: 1,
    color: '#526059',
  },
  actions: {
    marginTop: 'auto',
    paddingTop: authSpacing.xxl,
    gap: authSpacing.md,
  },
});
