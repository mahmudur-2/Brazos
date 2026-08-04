import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AuthButton } from '../components/AuthButton';
import { AuthField } from '../components/AuthField';
import { AuthScaffold } from '../components/AuthScaffold';
import { PhoneNumberInput } from '../components/PhoneNumberInput';
import { useAuth } from '../hooks/useAuth';
import { authColors, authRadius, authSpacing, authType } from '../lib/authTheme';
import { DEFAULT_COUNTRY, type Country } from '../lib/countries';
import { alertAsync } from '../lib/dialog';
import type { AuthStackNavigation } from '../lib/navigation';
import { phoneValidationError, toE164 } from '../lib/phoneNumber';
import { isValidEmail } from '../lib/validation';

/**
 * Create an account with email and password — the alternate route off the
 * phone-first CreateAccount screen, and today the only one that actually
 * registers anyone.
 *
 * This is the form that used to *be* CreateAccount, unchanged: the same four
 * values (full name, phone, email, password), the same `AuthContext.signUp()`,
 * the same E.164 normalisation, the same double-submit guard and the same
 * post-signup dialog. It moved rather than changed, so the working path stays
 * working while the phone flow is built out — mirroring how EmailSignIn holds
 * the real sign-in behind the phone-first SignIn screen.
 */
export function EmailCreateAccountScreen() {
  const navigation = useNavigation<AuthStackNavigation>();
  const { signUp } = useAuth();
  const phoneRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [phoneDigits, setPhoneDigits] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCreateAccount() {
    // Guards a double tap landing between the press and the disabled state.
    if (loading) return;

    setFormError(null);
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();

    const nextNameError = trimmedName ? null : 'Enter your full name.';
    const nextPhoneError = phoneValidationError(country, phoneDigits);
    const nextEmailError = !trimmedEmail
      ? 'Enter your email address.'
      : !isValidEmail(trimmedEmail)
        ? 'Enter a valid email address.'
        : null;
    const nextPasswordError = password ? null : 'Choose a password.';

    setNameError(nextNameError);
    setPhoneError(nextPhoneError);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextNameError || nextPhoneError || nextEmailError || nextPasswordError) return;

    const phone = toE164(country, phoneDigits);
    if (!phone) {
      setPhoneError('Enter a valid phone number.');
      return;
    }

    setLoading(true);
    const { error } = await signUp(trimmedEmail, password, trimmedName, phone);
    setLoading(false);

    // Nothing valid is cleared on failure.
    if (error) {
      setFormError(error.message);
      return;
    }

    // With email confirmation on there is no session yet, so the user has to be
    // told where to go next. With it off, AuthContext's session listener has
    // already routed them into the app and this screen is gone before the
    // dialog matters.
    await alertAsync(
      'Check your email',
      'If email confirmation is enabled, confirm your address to finish signing up.'
    );
  }

  return (
    <AuthScaffold title="Create account" onBack={() => navigation.goBack()} backdrop="soft">
      <View style={styles.body}>
        <Text style={styles.eyebrow}>CREATE ACCOUNT</Text>
        <Text style={styles.title} maxFontSizeMultiplier={1.5}>
          Sign up with your email
        </Text>
        <Text style={styles.subtitle}>
          One account. You can hire help and accept work from the same profile.
        </Text>

        <View style={styles.form}>
          <AuthField
            label="Full name"
            value={fullName}
            onChangeText={(next) => {
              setFullName(next);
              if (nameError) setNameError(null);
              if (formError) setFormError(null);
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
              if (formError) setFormError(null);
            }}
            error={phoneError}
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
          />

          <AuthField
            ref={emailRef}
            label="Email"
            value={email}
            onChangeText={(next) => {
              setEmail(next);
              if (emailError) setEmailError(null);
              if (formError) setFormError(null);
            }}
            error={emailError}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            placeholder="you@example.com"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            submitBehavior="submit"
          />

          <AuthField
            ref={passwordRef}
            label="Password"
            value={password}
            onChangeText={(next) => {
              setPassword(next);
              if (passwordError) setPasswordError(null);
              if (formError) setFormError(null);
            }}
            error={passwordError}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            placeholder="••••••••"
            returnKeyType="go"
            onSubmitEditing={handleCreateAccount}
          />

          {formError ? (
            <View style={styles.formError} accessibilityLiveRegion="polite">
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.privacy}>
          <Ionicons name="shield-checkmark-outline" size={20} color={authColors.emerald} />
          <Text style={styles.privacyText}>
            Your number stays private until a job is confirmed.
          </Text>
        </View>

        <View style={styles.actions}>
          <AuthButton title="Create account" onPress={handleCreateAccount} loading={loading} />
          <AuthButton
            title="Use Phone Number Instead"
            variant="ghost"
            // popTo(), not navigate(): React Navigation 7's navigate() pushes
            // when the target isn't current, which would stack a second
            // CreateAccount over the one the user came from and throw away what
            // they had already typed there.
            onPress={() => navigation.popTo('CreateAccount')}
            disabled={loading}
            accessibilityHint="Go back to signing up with your phone number"
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
  formError: {
    padding: authSpacing.md,
    borderRadius: authRadius.field,
    backgroundColor: '#F5E7E4',
  },
  formErrorText: {
    ...authType.note,
    color: authColors.danger,
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
