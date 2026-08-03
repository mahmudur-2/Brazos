import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AuthButton } from '../components/AuthButton';
import { AuthField } from '../components/AuthField';
import { AuthScaffold } from '../components/AuthScaffold';
import { BrandLogo } from '../components/BrandLogo';
import { useAuth } from '../hooks/useAuth';
import { authColors, authRadius, authSizes, authSpacing, authType } from '../lib/authTheme';
import type { AuthStackNavigation } from '../lib/navigation';
import { isValidEmail } from '../lib/validation';

/**
 * Sign in.
 *
 * The credentials here are the ones BRAZOS actually authenticates with:
 * Supabase email + password, via the same AuthContext.login() the previous
 * single-screen AuthScreen called. The reference sheet was drawn against a
 * phone/OTP product BRAZOS does not have — there is no signInWithOtp call, no
 * verify-phone route, and no SMS provider configured — so a phone field on
 * this screen would be a credential that cannot sign anyone in. The phone
 * number keeps its real home on Create account, where it is a stored profile
 * value the existing signUp() already accepts.
 */
export function SignInScreen() {
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
    <AuthScaffold title="Sign in" onBack={() => navigation.goBack()}>
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
            <Ionicons name="alert-circle-outline" size={18} color={authColors.danger} />
            <Text style={styles.noticeText}>
              This account has been suspended for violating the Brazos community
              rules. Contact support if you think this is a mistake.
            </Text>
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
            title="Create an account"
            variant="ghost"
            onPress={() => navigation.navigate('CreateAccount')}
            disabled={loading}
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: authSpacing.sm,
    marginTop: authSpacing.lg,
    padding: authSpacing.md,
    borderRadius: authRadius.field,
    backgroundColor: '#F5E7E4',
  },
  noticeText: {
    ...authType.note,
    flex: 1,
    color: authColors.danger,
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
    marginTop: authSpacing.xxl,
    gap: authSpacing.md,
  },
});
