import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AuthButton } from '../components/AuthButton';
import { AuthNotice } from '../components/AuthNotice';
import { AuthScaffold } from '../components/AuthScaffold';
import { PhoneNumberInput } from '../components/PhoneNumberInput';
import { useAuth } from '../hooks/useAuth';
import { authSizes, authSpacing, authType } from '../lib/authTheme';
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
 * Sign in — phone first.
 *
 * The product's intended credential is a phone number, so this is the screen
 * the flow lands on. `Continue` validates the number, normalises it to E.164
 * and asks the phone-auth provider for a code; only a real challenge routes
 * anyone onward to VerifyPhone.
 *
 * Which provider answers is not this screen's business. In development that is
 * the mock, which generates a code locally and sends no text message; with
 * Twilio provisioned it is Supabase, and nothing here changes. When no
 * provider is configured at all the request comes back `provider-disabled` and
 * the screen says so plainly, pointing at the path that does work — email and
 * password, one tap away on EmailSignIn. Nobody is stranded in any mode.
 *
 * THEMING (emerald(5)). Until this commit the whole auth flow rendered dark
 * except for the two sign-in screens: Welcome and both Create-account screens
 * had been converted for masters 2, 3 and 4, and Sign in was one tap away in
 * Heritage light. Same flow, two design systems.
 *
 * There is no master for this screen, so its treatment is taken from its
 * sibling, master 3's CreateAccountScreen: the same `authSurface()` mapping,
 * the same `themed` opt-in on every shared auth component, the same serif
 * headline, the same gold accent in dark. `lib/authTheme.ts` is NOT involved
 * and did not need a dark branch — it never gained one for the siblings
 * either; it stays the surface-specific Heritage constant it always was, and
 * the theme-aware half lives in lib/theme.ts's authSurface(). That is why
 * converting these two screens cannot move a single light pixel anywhere else,
 * CountryPicker included.
 *
 * The brand mark stayed through emerald(5) — masters 3 and 4 draw no logo, but
 * this screen had carried one since it was built and it was not a mockup's
 * job to delete working composition (D11). It went on 2026-09-21 by the
 * operator's own word, with the email sibling's.
 *
 * 2026-09-21 — MATCHED TO ITS SHIP PAGE (docs/mockups/html/lux/
 * signin-phone-ship-light.html; DECISIONS 21 — "make the changes we talked
 * about to sign in screen for With phone, not just email"): the B gone; the
 * eyebrow and the headline the Welcome's (`heroEyebrow`, the serif
 * `heroTitle` in `fonts.displayHero`), "Brazos" in the headline; BOTH
 * controls the scaffold's pinned FOOTER — Continue on top, the email route
 * outlined under it with its glyph — riding the keyboard until Continue sits
 * flush on it (the email route going under; DECISIONS 22), the column
 * lifting 24 while the keyboard is up; the phone field asks for no return
 * key, so iOS floats no "Go" pill over its number pad; the back control the
 * iOS circle with its press. The bar, the soft contour, the copy and the
 * phone field did not move.
 */
export function SignInScreen() {
  const navigation = useNavigation<AuthStackNavigation>();
  const { bannedNotice } = useAuth();
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const surface = authSurface(colors, isDark);

  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [phoneDigits, setPhoneDigits] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // The request can still be in flight when the user backs out; a late resolve
  // must not write into an unmounted screen.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function handleContinue() {
    // Guards a double tap landing between the press and the disabled state.
    if (loading) return;

    const nextPhoneError = phoneValidationError(country, phoneDigits);
    setPhoneError(nextPhoneError);
    setNotice(null);
    // An incomplete number gets the field error and nothing else, so the two
    // messages can't stack up.
    if (nextPhoneError) return;

    const phone = toE164(country, phoneDigits);
    if (!phone) {
      setPhoneError('Enter a valid phone number.');
      return;
    }

    setLoading(true);
    const result = await phoneAuth.requestOtp({ phone, intent: 'sign-in' });
    if (!mounted.current) return;
    setLoading(false);

    if (result.status === 'challenge-sent') {
      // The code is not passed — only which challenge it belongs to. See
      // VerifyPhoneParams in lib/navigation.ts.
      navigation.navigate('VerifyPhone', {
        phone: result.phone,
        maskedPhone: maskE164(result.phone),
        intent: 'sign-in',
        challengeId: result.challengeId,
        expiresAt: result.expiresAt,
        resendAvailableAt: result.resendAvailableAt,
      });
      return;
    }

    setNotice(result.message);
  }

  // The ship page's two controls, pinned by the scaffold (see its `footer`):
  // Continue ON TOP — lit, the gold chevron — and the email route under it,
  // outlined with its glyph (`hero` without `lit`, not `ghost`, because a
  // ghost hero is the Welcome's text link and the page draws a box). The
  // footer rides the keyboard until Continue sits flush on it; the email
  // route goes under the keyboard while the number is being typed.
  const footer = (
    <View style={styles.footer}>
      <AuthButton
        title="Continue"
        themed
        hero
        lit
        chevron
        onPress={handleContinue}
        loading={loading}
        accessibilityHint="Send a verification code to this phone number"
      />
      <AuthButton
        title="Use Email Instead"
        themed
        hero
        icon="mail-outline"
        chevron
        onPress={() => navigation.navigate('EmailSignIn')}
        disabled={loading}
        accessibilityHint="Sign in with your email address and password"
      />
    </View>
  );

  return (
    <AuthScaffold
      title="Sign in"
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
          Use the phone number connected to your account.
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
          <PhoneNumberInput
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
            // No return key. The number pad has none of its own, and asking
            // for one ("go") made iOS float a "Go" pill over the keyboard —
            // the operator's "get rid of the go" (DECISIONS 22). Continue,
            // pinned on the keyboard, is the way onward.
          />

          {notice ? <AuthNotice tone="info">{notice}</AuthNotice> : null}
        </View>
      </View>
    </AuthScaffold>
  );
}

/** The footer under its lead: the 12 gap and the email route — what goes
 *  under the keyboard when Continue lands on it. */
const FOOTER_BELOW_LEAD = authSpacing.md + authSizes.heroButton;

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  // The bottom padding is the least air between the field and the pinned
  // footer on a short phone — the 32 the actions block used to bring.
  body: {
    flexGrow: 1,
    paddingTop: authSpacing.sm,
    paddingBottom: authSpacing.xxl,
  },
  // Colour comes from surface.accent at render — emerald in light, gold in
  // dark, exactly as master 3's sibling does it. The measure is the Welcome's
  // (13/700 tracked 2 on a 17 line), from the ship page.
  eyebrow: {
    ...authType.heroEyebrow,
    marginTop: authSpacing.xl,
  },
  // The ship page's headline: the Welcome's serif at the form size (34/38),
  // the ONE serif role — the fence in tests/themeTokens.test.mjs names this
  // screen as a site.
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
  // marginTop:'auto' — the extra height on a tall phone becomes space between
  // the field and the CTAs rather than a gap under them.
  // The pinned pair: Continue, 12, the email route.
  footer: {
    gap: authSpacing.md,
  },
  }),
);
