import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AuthButton } from '../components/AuthButton';
import { AuthField } from '../components/AuthField';
import { AuthNotice } from '../components/AuthNotice';
import { AuthScaffold } from '../components/AuthScaffold';
import { Card } from '../components/Card';
import { useAuth } from '../hooks/useAuth';
import { authRadius, authSizes, authSpacing, authType } from '../lib/authTheme';
import {
  authSurface,
  fonts,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';
import type { AuthStackNavigation } from '../lib/navigation';
import { PHONE_ENTRY } from '../lib/phoneAuth';
import { isValidEmail } from '../lib/validation';
import { requestPasswordReset } from '../lib/passwordReset';
import { authMessage, userMessage } from '../lib/errorMessage';

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
 *
 * 2026-09-21, from the phone (DECISIONS 21, then 22): "Brazos", not "BRAZOS",
 * in the headline; BOTH controls are the scaffold's FOOTER — Continue on top,
 * the phone route under it — pinned and riding the keyboard frame for frame
 * until Continue sits flush on it (the phone route going under), while the
 * column LIFTS 24 (the air between the bar and the eyebrow) so the button
 * clears the password field on every phone; the back control is the iOS
 * circle with its press.
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
  // 2026-09-26 (the refresh, audit M-21): the eye the create-account form already
  // has, and the recovery this screen never had.
  const [passwordShown, setPasswordShown] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  async function handleForgotPassword() {
    if (resetting) return;
    setFormError(null);
    setResetNotice(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !isValidEmail(trimmedEmail)) {
      setEmailError('Enter your email address first — the reset link goes there.');
      return;
    }
    setResetting(true);
    const { error } = await requestPasswordReset(trimmedEmail);
    setResetting(false);
    if (error) {
      setFormError(userMessage(error));
      return;
    }
    // The server never says whether an account exists for an address, so
    // neither does this.
    setResetNotice(`If an account uses ${trimmedEmail}, a reset link is on its way. Open it on this phone to set a new password.`);
  }

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
    // B7: a plain sentence, never the auth server's own text.
    if (error) setFormError(authMessage(error));
  }

  // The ship page's two controls, pinned by the scaffold (see its `footer`):
  // Continue ON TOP — lit, the gold chevron — and the phone route under it,
  // outlined with its glyph (`hero` without `lit`, not `ghost`, because a
  // ghost hero is the Welcome's text link and the page draws a box). The
  // footer rides the keyboard until Continue sits flush on it; the phone
  // route goes under the keyboard while a field is being typed in.
  const footer = (
    <View style={styles.footer}>
      <AuthButton title="Continue" themed hero lit chevron onPress={handleContinue} loading={loading} />
      {/* Only while phone sign-in is live (B2): with SMS off, the phone
          screen would end on "not switched on yet". */}
      {PHONE_ENTRY.live && (
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
      )}
    </View>
  );

  return (
    <AuthScaffold
      title="Sign In"
      onBack={() => navigation.goBack()}
      backdrop="soft"
      lift={authSpacing.xl}
      footer={footer}
      footerBelowLead={FOOTER_BELOW_LEAD}
      themed
    >
      <View style={styles.body}>
        <Text style={[styles.eyebrow, { color: surface.accent }]}>WELCOME BACK</Text>
        <Text style={styles.title} maxFontSizeMultiplier={1.5}>
          Sign in to Brazos
        </Text>
        <Text style={styles.subtitle}>
          The email and password on your account.
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
          {/* 2026-09-27 (the Lux remake, the operator's pic 3): ONE lifted
              card — Email (the paper-plane glyph), Password (the lock, the
              eye), "Forgot password?" at the right under the fields, inside
              the card. The one card primitive, pop-out. */}
          <Card>
          <View style={styles.fields}>
          <AuthField
            label="Email"
            themed
            leading={<Ionicons name="paper-plane-outline" size={20} color={surface.fieldGlyph} />}
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
            value={password}
            onChangeText={(next) => {
              setPassword(next);
              if (passwordError) setPasswordError(null);
              if (formError) setFormError(null);
            }}
            error={passwordError}
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
            secureTextEntry={!passwordShown}
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            placeholder="••••••••"
            returnKeyType="go"
            onSubmitEditing={handleContinue}
          />

          <Pressable
            onPress={handleForgotPassword}
            disabled={resetting || loading}
            hitSlop={10}
            style={({ pressed }) => [styles.forgot, pressed && styles.forgotPressed]}
            accessibilityRole="button"
            accessibilityLabel="Forgot password?"
            accessibilityHint="Emails you a link to set a new password"
          >
            <Text style={[styles.forgotText, { color: surface.accent }]}>
              {resetting ? 'Sending the link…' : 'Forgot password?'}
            </Text>
          </Pressable>
          </View>
          </Card>

          {resetNotice ? <AuthNotice tone="info">{resetNotice}</AuthNotice> : null}

          {formError ? (
            <View style={styles.formError} accessibilityLiveRegion="polite">
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </AuthScaffold>
  );
}

/** The footer under its lead: the 12 gap and the phone route — what goes
 *  under the keyboard when Continue lands on it. */
const FOOTER_BELOW_LEAD = authSpacing.md + authSizes.heroButton;

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  // The bottom padding is the least air between the form and the pinned
  // footer on a short phone — the 32 the actions block used to bring.
  body: {
    flexGrow: 1,
    paddingTop: authSpacing.sm,
    paddingBottom: authSpacing.xxl,
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
  // The card's column: the two fields and the recovery link.
  fields: {
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
  // 2026-09-26: the recovery link sits under the password, right-aligned, at a
  // 44-point target with its hit slop.
  forgot: {
    alignSelf: 'flex-end',
    paddingVertical: authSpacing.xs,
    marginTop: -authSpacing.sm,
  },
  forgotPressed: {
    opacity: 0.6,
  },
  forgotText: {
    ...authType.note,
    fontWeight: '600',
  },
  // The pinned pair: Continue, 12, the phone route.
  footer: {
    gap: authSpacing.md,
  },
  }),
);
