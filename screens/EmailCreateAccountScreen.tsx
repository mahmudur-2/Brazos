import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AuthButton } from '../components/AuthButton';
import { AuthField } from '../components/AuthField';
import { AuthScaffold } from '../components/AuthScaffold';
import { PhoneNumberInput } from '../components/PhoneNumberInput';
import { useAuth } from '../hooks/useAuth';
import { authRadius, authSpacing, authType } from '../lib/authTheme';
import {
  authSurface,
  fonts,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';
import { DEFAULT_COUNTRY, type Country } from '../lib/countries';
import { alertAsync } from '../lib/dialog';
import type { AuthStackNavigation, AuthStackParamList } from '../lib/navigation';
import { authMessage } from '../lib/errorMessage';
import { PHONE_ENTRY } from '../lib/phoneAuth';
import { phoneValidationError, toE164 } from '../lib/phoneNumber';
import { isValidEmail } from '../lib/validation';
import { Announce } from '../hooks/useAnnounce';

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
  // M-18 — arriving from the phone form keeps what was typed there.
  const { params } = useRoute<RouteProp<AuthStackParamList, 'EmailCreateAccount'>>();
  const { signUp } = useAuth();
  const phoneRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const surface = authSurface(colors, isDark);
  // Master 4 draws an eye beside the password. Presentation only: it toggles
  // what the field renders, never what it holds or submits.
  const [passwordShown, setPasswordShown] = useState(false);

  const [fullName, setFullName] = useState(params?.fullName ?? '');
  const [country, setCountry] = useState<Country>(params?.country ?? DEFAULT_COUNTRY);
  const [phoneDigits, setPhoneDigits] = useState(params?.phoneDigits ?? '');
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
    const { error, needsConfirmation } = await signUp(trimmedEmail, password, trimmedName, phone);
    setLoading(false);

    // Nothing valid is cleared on failure. B7: a plain sentence, never the
    // auth server's own text.
    if (error) {
      setFormError(authMessage(error));
      return;
    }

    // With email confirmation on there is no session yet, so the user has to be
    // told where the link went. With it off, AuthContext's session listener is
    // already routing them into the app, and nothing is shown.
    if (needsConfirmation) {
      await alertAsync('Check your email', `We sent a link to ${trimmedEmail}. Open it to finish signing up.`);
    }
  }

  return (
    <AuthScaffold
      title="Create Account"
      onBack={() => navigation.goBack()}
      backdrop="soft"
      themed
    >
      {/* 2026-09-28 (LUX-LIST-64 #3, #4): no CREATE ACCOUNT eyebrow (the bar
          already says it) and no privacy pill — the form and both buttons fit
          one screen at rest; the keyboard may still slide the focused field
          into view (native-ui). */}
      <View style={styles.body}>
        <Text style={styles.title} maxFontSizeMultiplier={1.5}>
          Sign up with your email
        </Text>
        <Text style={styles.subtitle}>
          One account. Hire help and accept work.
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
            themed
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
            themed
            leading={<Ionicons name="mail-outline" size={20} color={surface.fieldGlyph} />}
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
            themed
            leading={<Ionicons name="lock-closed-outline" size={20} color={surface.fieldGlyph} />}
            trailing={
              <Pressable
                onPress={() => setPasswordShown((shown) => !shown)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={passwordShown ? 'Hide password' : 'Show password'}
                accessibilityState={{ selected: passwordShown }}
              >
                <Ionicons
                  name={passwordShown ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={surface.fieldGlyph}
                />
              </Pressable>
            }
            value={password}
            onChangeText={(next) => {
              setPassword(next);
              if (passwordError) setPasswordError(null);
              if (formError) setFormError(null);
            }}
            error={passwordError}
            secureTextEntry={!passwordShown}
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
              <Announce message={formError} />
            </View>
          ) : null}
        </View>


        <View style={styles.actions}>
          <AuthButton
            title="Create account"
            themed
            onPress={handleCreateAccount}
            loading={loading}
          />
          {/* Only while phone sign-up is live (B2): with SMS off, the phone
              screen would end on "not switched on yet". */}
          {PHONE_ENTRY.live && (
            <AuthButton
              title="Use Phone Number Instead"
              variant="ghost"
              themed
              // popTo(), not navigate(): React Navigation 7's navigate() pushes
              // when the target isn't current, which would stack a second
              // CreateAccount over the one the user came from and throw away what
              // they had already typed there.
              onPress={() => navigation.popTo('CreateAccount')}
              disabled={loading}
              accessibilityHint="Go back to signing up with your phone number"
            />
          )}
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
  // Master 4's display headline is the serif.
  title: {
    ...authType.title,
    fontFamily: fonts.display,
    color: colors.ink,
    marginTop: authSpacing.md,
  },
  subtitle: {
    ...authType.body,
    color: colors.textMuted,
    marginTop: authSpacing.xs + 2,
  },
  form: {
    marginTop: authSpacing.xl - 4,
    gap: authSpacing.md,
  },
  formError: {
    padding: authSpacing.md,
    borderRadius: authRadius.field,
    // The pale wash this carried as a literal, expressed as the palette's own
    // danger at wash strength so it reads in either theme.
    backgroundColor: withAlpha(colors.danger, 0.14),
  },
  formErrorText: {
    ...authType.note,
    color: colors.danger,
  },
  actions: {
    marginTop: 'auto',
    paddingTop: authSpacing.xl - 4,
    gap: authSpacing.md,
  },
  }),
);
