import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AuthButton } from '../components/AuthButton';
import { AuthField } from '../components/AuthField';
import { AuthNotice } from '../components/AuthNotice';
import { AuthScaffold } from '../components/AuthScaffold';
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
 *
 * THEMING (emerald(5)). Converted onto the same `authSurface()` path its
 * already-dark sibling uses — master 4's EmailCreateAccountScreen — because
 * there is no master for the sign-in screens and the dispatch takes their
 * treatment from siblings 3 and 4. That means the `themed` opt-in on every
 * shared auth component, the serif headline, the gold field glyphs in dark,
 * and the form-error wash expressed as the palette's own danger rather than
 * the pale literal it carried. `lib/authTheme.ts` is untouched.
 *
 * NOT taken from sibling 4: its password visibility toggle. That is an
 * interaction, not a treatment, and adding one here would be building a
 * feature under a paint commit. Logged for the operator instead — and offered
 * again as step f of the 2026-09-21 ideas page; the operator chose d.
 *
 * 2026-09-21 — MATCHED TO ITS SHIP PAGE (docs/mockups/html/lux/
 * signin-ship-light.html, the operator's pick from signin-ideas.html: step d
 * with the bar's "Sign in" kept). The B mark is gone; the eyebrow and the
 * headline are the Welcome's (`heroEyebrow`, and the serif `heroTitle` in
 * `fonts.displayHero`); the two actions are the Welcome's controls — Continue
 * lit with the chevron, the phone route outlined with its glyph. The bar, the
 * soft contour, the copy and the fields did not move.
 */
export function EmailSignInScreen() {
  const navigation = useNavigation<AuthStackNavigation>();
  const { login, bannedNotice } = useAuth();
  const passwordRef = useRef<TextInput>(null);
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const surface = authSurface(colors, isDark);

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
    <AuthScaffold title="Sign in" onBack={() => navigation.goBack()} backdrop="soft" themed>
      <View style={styles.body}>
        <Text style={[styles.eyebrow, { color: surface.accent }]}>WELCOME BACK</Text>
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
            themed
            leading={<Ionicons name="mail-outline" size={20} color={surface.accent} />}
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
            leading={<Ionicons name="lock-closed-outline" size={20} color={surface.accent} />}
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

        {/* The ship page's controls: Continue is the lead (lit, the gold
            chevron); the phone route is the outlined second with its glyph —
            `hero` without `lit`, not `ghost`, because a ghost hero is the
            Welcome's text link and the page draws a box. */}
        <View style={styles.actions}>
          <AuthButton
            title="Continue"
            themed
            hero
            lit
            chevron
            onPress={handleContinue}
            loading={loading}
          />
          <AuthButton
            title="Use Phone Number Instead"
            themed
            hero
            icon="phone-portrait-outline"
            chevron
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

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  body: {
    flexGrow: 1,
    paddingTop: authSpacing.sm,
    paddingBottom: authSpacing.xl,
  },
  // Colour comes from surface.accent at render — emerald in light, gold in
  // dark, exactly as master 4's sibling does it. The measure is the Welcome's
  // (13/700 tracked 2 on a 17 line), from the ship page.
  eyebrow: {
    ...authType.heroEyebrow,
    marginTop: authSpacing.xl,
  },
  // The ship page's headline: the Welcome's serif at the form size (34/38),
  // the ONE serif role — the fence in tests/themeTokens.test.mjs names this
  // screen as its third site.
  title: {
    ...authType.heroTitle,
    fontFamily: fonts.displayHero,
    color: colors.ink,
    marginTop: authSpacing.sm,
  },
  subtitle: {
    ...authType.body,
    color: colors.textMuted,
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
    // Was the literal #F5E7E4 — a pale Heritage wash that stayed pale on a
    // near-black ground. Expressed as the palette's own danger at wash
    // strength, the same resolution sibling 4 reached.
    backgroundColor: withAlpha(colors.danger, 0.14),
  },
  formErrorText: {
    ...authType.note,
    color: colors.danger,
  },
  actions: {
    marginTop: 'auto',
    paddingTop: authSpacing.xxl,
    gap: authSpacing.md,
  },
  }),
);
