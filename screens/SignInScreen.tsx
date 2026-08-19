import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AuthButton } from '../components/AuthButton';
import { AuthNotice } from '../components/AuthNotice';
import { AuthScaffold } from '../components/AuthScaffold';
import { BrandLogo } from '../components/BrandLogo';
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
 * The brand mark stays. Masters 3 and 4 draw no logo, but this screen has
 * carried one since it was built and it is not a mockup's job to delete
 * working composition (D11).
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

  return (
    <AuthScaffold title="Sign in" onBack={() => navigation.goBack()} backdrop="soft" themed>
      <View style={styles.body}>
        <BrandLogo size={authSizes.logoAuth} />

        <Text style={[styles.eyebrow, { color: surface.accent }]}>WELCOME BACK</Text>
        <Text style={styles.title} maxFontSizeMultiplier={1.5}>
          Sign in to BRAZOS
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
            returnKeyType="go"
            onSubmitEditing={handleContinue}
          />

          {notice ? <AuthNotice tone="info">{notice}</AuthNotice> : null}
        </View>

        <View style={styles.actions}>
          <AuthButton
            title="Continue"
            themed
            onPress={handleContinue}
            loading={loading}
            accessibilityHint="Send a verification code to this phone number"
          />
          <AuthButton
            title="Use Email Instead"
            variant="ghost"
            themed
            onPress={() => navigation.navigate('EmailSignIn')}
            disabled={loading}
            accessibilityHint="Sign in with your email address and password"
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
  // dark, exactly as master 3's sibling does it.
  eyebrow: {
    ...authType.eyebrow,
    marginTop: authSpacing.xl,
  },
  // Sibling 3's display headline is the serif.
  title: {
    ...authType.title,
    fontFamily: fonts.display,
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
  actions: {
    marginTop: 'auto',
    paddingTop: authSpacing.xxl,
    gap: authSpacing.md,
  },
  }),
);
