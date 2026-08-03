import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AuthButton } from '../components/AuthButton';
import { AuthField } from '../components/AuthField';
import { AuthNotice } from '../components/AuthNotice';
import { AuthScaffold } from '../components/AuthScaffold';
import { BrandLogo } from '../components/BrandLogo';
import { useAuth } from '../hooks/useAuth';
import { authColors, authRadius, authSizes, authSpacing, authType } from '../lib/authTheme';
import type { AuthStackNavigation } from '../lib/navigation';
import { isValidEmail } from '../lib/validation';

/**
 * Sign in with email — the alternate route off the phone-first SignIn screen,
 * and today the only one that actually authenticates anyone.
 *
 * These are the credentials BRAZOS really uses: Supabase email + password
 * through the same `AuthContext.login()` the original single-screen AuthScreen
 * called. The form, its validation, its error handling and its double-submit
 * guard are unchanged from that screen — only the surrounding navigation moved,
 * so the working path stays working while the phone flow is built out.
 */
export function EmailSignInScreen() {
  const navigation = useNavigation<AuthStackNavigation>();
  const { login, bannedNotice } = useAuth();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleContinue() {
    // Guards a double tap that lands between the press and the disabled state
    // taking effect.
    if (loading) return;

    setFormError(null);
    const trimmedEmail = email.trim();

    const nextEmailError = !trimmedEmail
      ? 'Enter your email address.'
      : !isValidEmail(trimmedEmail)
        ? 'Enter a valid email address.'
        : null;
    const nextPasswordError = password ? null : 'Enter your password.';

    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError) return;

    setLoading(true);
    const { error } = await login(trimmedEmail, password);
    setLoading(false);

    // Nothing typed is cleared on failure — the user fixes one field and
    // retries rather than starting over.
    if (error) setFormError(error.message);
  }

  return (
    <AuthScaffold title="Sign in" onBack={() => navigation.goBack()} backdrop="soft">
      <View style={styles.body}>
        <BrandLogo size={authSizes.logoAuth} />

        <Text style={styles.eyebrow}>WELCOME BACK</Text>
        <Text style={styles.title} maxFontSizeMultiplier={1.5}>
          Sign in to BRAZOS
        </Text>
        <Text style={styles.subtitle}>
          Use the email and password connected to your account.
        </Text>

        {bannedNotice ? (
          <View style={styles.notice}>
            <AuthNotice tone="danger">
              This account has been suspended for violating the Brazos community
              rules. Contact support if you think this is a mistake.
            </AuthNotice>
          </View>
        ) : null}

        <View style={styles.form}>
          <AuthField
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
            autoComplete="current-password"
            textContentType="password"
            placeholder="••••••••"
            returnKeyType="go"
            onSubmitEditing={handleContinue}
          />

          {formError ? (
            <View style={styles.formError} accessibilityLiveRegion="polite">
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.actions}>
          <AuthButton title="Continue" onPress={handleContinue} loading={loading} />
          <AuthButton
            title="Use Phone Number Instead"
            variant="ghost"
            // popTo(), not navigate(): React Navigation 7 changed navigate() to
            // push when the target isn't the current route, which would stack a
            // second SignIn on top of the one the user came from and throw away
            // the number they had already typed. popTo returns to that instance.
            onPress={() => navigation.popTo('SignIn')}
            disabled={loading}
            accessibilityHint="Go back to signing in with your phone number"
          />
        </View>
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  body: {
    flexGrow: 1,
    paddingTop: authSpacing.sm,
    paddingBottom: authSpacing.xl,
  },
  eyebrow: {
    ...authType.eyebrow,
    color: authColors.emerald,
    marginTop: authSpacing.xl,
  },
  title: {
    ...authType.title,
    color: authColors.ink,
    marginTop: authSpacing.sm,
  },
  subtitle: {
    ...authType.body,
    color: authColors.muted,
    marginTop: authSpacing.sm,
  },
  notice: {
    marginTop: authSpacing.lg,
  },
  form: {
    marginTop: authSpacing.xl,
    gap: authSpacing.lg,
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
  actions: {
    marginTop: 'auto',
    paddingTop: authSpacing.xxl,
    gap: authSpacing.md,
  },
});
