import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  InteractionManager,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { AuthButton } from '../components/AuthButton';
import { AuthNotice } from '../components/AuthNotice';
import { AuthScaffold } from '../components/AuthScaffold';
import { Card } from '../components/Card';
import { OtpInput, type OtpInputHandle } from '../components/OtpInput';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { authRadius, authSizes, authSpacing, authType } from '../lib/authTheme';
import type { AuthStackNavigation, AuthStackParamList } from '../lib/navigation';
import { OTP_LENGTH, isOtpToken, phoneAuth } from '../lib/phoneAuth';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { authSurface, fonts, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';
import { Announce } from '../hooks/useAnnounce';

/**
 * Verify phone — reference screen 05.
 *
 * Everything on it goes through `phoneAuth`, the provider boundary. The screen
 * has no idea whether a real text message was sent, and deliberately so: that
 * is the single thing that has to change when Twilio is switched on, and it
 * changes in lib/phoneAuth/index.ts rather than here.
 *
 * The one place the mode leaks through is the development banner, which shows
 * the generated code in mock mode. It is driven by `devCode` being non-null,
 * and only the mock provider ever returns one — so it cannot render in a
 * release, in Supabase mode, or if someone forgets a `__DEV__` check.
 *
 * The code is never a route param. It is read back from the live challenge on
 * mount, which also gives the screen its staleness check: a reload drops the
 * in-memory challenge, `inspectChallenge` returns null, and the user is told
 * to start again rather than typing into a field nothing can accept.
 *
 * Fix run D9 (2026-10-03): on the themed auth path like its siblings — the
 * resolved palette through authSurface(), the `themed` opt-in on the scaffold,
 * every AuthButton and the code field. It was the last auth screen on the
 * frozen light constant, so in dark it rendered a cream page one tap from a
 * dark one. Phone sign-in is off outside development (lib/phoneAuth/mode.ts),
 * so a fence, not a shot, proves it.
 */

const ENTER_MS = 320;
const SHAKE_MS = 240;

function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function VerifyPhoneScreen() {
  const navigation = useNavigation<AuthStackNavigation>();
  const { params } = useRoute<RouteProp<AuthStackParamList, 'VerifyPhone'>>();
  const reducedMotion = useReducedMotion();
  const otpRef = useRef<OtpInputHandle>(null);
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const surface = authSurface(colors, isDark);

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState(params.resendAvailableAt);
  const [stale, setStale] = useState(false);
  const [mockVerified, setMockVerified] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Guards every setState that follows an await: the user can leave mid-request
  // (back, or "change phone number") and a late resolve must not write into an
  // unmounted screen.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const settled = stale || mockVerified;

  const focusCode = useCallback(() => otpRef.current?.focus(), []);

  /**
   * Open the keyboard once the screen is actually settled.
   *
   * `autoFocus` is deliberately not used: it fires while the push transition is
   * still running, and on iOS a focus requested mid-transition is silently
   * dropped — the field ends up focused with no keyboard. Waiting for
   * interactions to finish means the request lands on a screen that has
   * stopped moving. useFocusEffect rather than useEffect so coming back from
   * the country picker or a background app re-opens it too.
   */
  useFocusEffect(
    useCallback(() => {
      if (settled) return;

      const task = InteractionManager.runAfterInteractions(focusCode);
      return () => task.cancel();
    }, [focusCode, settled])
  );

  // Read the live challenge rather than trusting the route params: after a
  // reload the params survive in navigation state but the challenge does not.
  useEffect(() => {
    const snapshot = phoneAuth.inspectChallenge(params.challengeId);
    if (!snapshot) {
      setStale(true);
      return;
    }
    setDevCode(snapshot.devCode);
    setResendAvailableAt(snapshot.resendAvailableAt);
  }, [params.challengeId]);

  useEffect(() => {
    if (settled) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [settled]);

  const secondsToResend = Math.max(0, Math.ceil((resendAvailableAt - now) / 1000));
  const busy = submitting || resending;

  // --- motion -------------------------------------------------------------
  const enter = useRef(new Animated.Value(0)).current;
  const shakeX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion === null) return;
    if (reducedMotion) {
      enter.setValue(1);
      return;
    }
    Animated.timing(enter, {
      toValue: 1,
      duration: ENTER_MS,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [enter, reducedMotion]);

  function shake() {
    if (reducedMotion !== false) return;
    // Two short returns, 6pt — a correction cue, not a bounce.
    Animated.sequence([
      Animated.timing(shakeX, { toValue: -6, duration: SHAKE_MS / 4, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(shakeX, { toValue: 6, duration: SHAKE_MS / 4, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(shakeX, { toValue: -3, duration: SHAKE_MS / 4, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(shakeX, { toValue: 0, duration: SHAKE_MS / 4, useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start();
  }

  // --- actions ------------------------------------------------------------
  function leaveChallenge(go: () => void) {
    // Changing the number, or backing out, invalidates the challenge — the old
    // code must not still be live behind a number the user has moved on from.
    phoneAuth.cancelChallenge();
    go();
  }

  async function handleVerify() {
    if (busy || settled) return;

    if (!isOtpToken(code)) {
      setNotice(null);
      setError(`Enter all ${OTP_LENGTH} digits.`);
      shake();
      // An incomplete code is never submitted; the user is put straight back
      // into the field to finish it.
      focusCode();
      return;
    }

    setError(null);
    setNotice(null);
    setSubmitting(true);

    const result = await phoneAuth.verifyOtp({
      phone: params.phone,
      token: code,
      intent: params.intent,
      challengeId: params.challengeId,
    });

    if (!mounted.current) return;

    if (result.status === 'authenticated') {
      // Nothing to navigate to: AuthContext's onAuthStateChange has the
      // session, and RootNavigator swaps this whole stack for the app. The
      // button is left in its loading state so the last frame before the swap
      // isn't an idle screen.
      return;
    }

    setSubmitting(false);

    if (result.status === 'verified-mock') {
      setMockVerified(true);
      return;
    }

    setError(
      result.attemptsRemaining !== undefined && result.attemptsRemaining > 0
        ? `${result.message} ${result.attemptsRemaining} ${
            result.attemptsRemaining === 1 ? 'try' : 'tries'
          } left.`
        : result.message
    );
    if (result.code === 'stale-challenge' || result.code === 'provider-disabled') {
      setStale(true);
      return;
    }
    // A burned or expired challenge keeps the screen, but the digits on it are
    // dead — clearing them says so more clearly than leaving them under an error.
    if (result.code === 'too-many-attempts' || result.code === 'expired-code') {
      setCode('');
    }
    shake();
    // Submitting blurs the field on some platforms; a wrong code has to leave
    // the user able to correct it without hunting for the keyboard again.
    focusCode();
  }

  async function handleResend() {
    if (busy || settled || secondsToResend > 0) return;

    setError(null);
    setNotice(null);
    setResending(true);

    const result = await phoneAuth.resendOtp({
      phone: params.phone,
      intent: params.intent,
      challengeId: params.challengeId,
      profileDraft: params.profileDraft,
    });

    if (!mounted.current) return;
    setResending(false);

    if (result.status === 'challenge-sent') {
      setResendAvailableAt(result.resendAvailableAt);
      setDevCode(result.devCode ?? null);
      setCode('');
      setNotice('A new code is on its way. The previous one no longer works.');
      focusCode();
      return;
    }

    if (result.status === 'provider-disabled') {
      setError(result.message);
      setStale(true);
      return;
    }

    setError(result.message);
    if (result.code === 'stale-challenge') setStale(true);
    if (result.retryAvailableAt) setResendAvailableAt(result.retryAvailableAt);
  }

  // --- render -------------------------------------------------------------
  const animatedStyle = {
    opacity: enter,
    transform: [
      { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
      { translateX: shakeX },
    ],
  };

  const goBack = () => leaveChallenge(() => navigation.goBack());

  // The sign-in family's actions, pinned by the scaffold (see its `footer`): the
  // main one rides the keyboard until it sits flush on it, the quiet one goes
  // under it, and an error line in the card above never moves either.
  const footer = (
    <Animated.View style={[styles.footer, { opacity: enter }]}>
      {mockVerified ? (
        <>
          <AuthButton
            title={params.intent === 'sign-up' ? 'Continue with Email Sign Up' : 'Continue with Email Sign In'}
            themed
            onPress={() =>
              navigation.navigate(
                params.intent === 'sign-up' ? 'EmailCreateAccount' : 'EmailSignIn'
              )
            }
          />
          <AuthButton
            title="Back to Welcome"
            variant="quiet"
            themed
            onPress={() => navigation.popTo('Welcome')}
          />
        </>
      ) : stale ? (
        <>
          <AuthButton title="Back to Phone Number" themed onPress={goBack} />
          <AuthButton
            title="Back to Welcome"
            variant="quiet"
            themed
            onPress={() => leaveChallenge(() => navigation.popTo('Welcome'))}
          />
        </>
      ) : (
        <>
          <AuthButton
            title="Verify and Continue"
            themed
            onPress={handleVerify}
            loading={submitting}
            disabled={resending}
          />
          <AuthButton
            title="Change Phone Number"
            variant="quiet"
            themed
            onPress={goBack}
            disabled={busy}
            accessibilityHint="Go back and enter a different phone number"
          />
        </>
      )}
    </Animated.View>
  );

  return (
    <AuthScaffold
      title="Verify Phone"
      titleVariant="large"
      onBack={goBack}
      backdrop="soft"
      lift={authSpacing.xl}
      footer={footer}
      footerBelowLead={BELOW_LEAD}
      themed
    >
      <Animated.View style={[styles.body, animatedStyle]}>
        {mockVerified ? (
          <MockComplete />
        ) : stale ? (
          <StaleChallenge message={error} />
        ) : (
          <>
            <Text style={[styles.eyebrow, { color: surface.accent }]}>VERIFY YOUR NUMBER</Text>
            <Text style={styles.title} maxFontSizeMultiplier={1.5}>
              Enter the {OTP_LENGTH}-digit code
            </Text>
            <Text style={styles.subtitle} numberOfLines={2}>
              Sent to {params.maskedPhone}
            </Text>

            {devCode ? (
              <View style={styles.devBanner}>
                <Text style={styles.devBannerLabel}>DEVELOPMENT CODE: {devCode}</Text>
                <Text style={styles.devBannerNote}>
                  No text message was sent. This code is generated on this device and
                  never leaves it.
                </Text>
              </View>
            ) : null}

            {/* The sign-in family's one lit card: the code cells, the one red
                line of an error under them, and the resend control. */}
            <Card style={styles.card}>
              <OtpInput
                ref={otpRef}
                value={code}
                onChangeText={(next) => {
                  setCode(next);
                  if (error) setError(null);
                }}
                invalid={Boolean(error)}
                editable={!busy}
                onSubmitEditing={handleVerify}
                themed
              />

              {error ? (
                <Text style={styles.error} accessibilityLiveRegion="assertive">
                  {error}
                  <Announce message={error} />
                </Text>
              ) : null}

              <Pressable
                onPress={handleResend}
                disabled={secondsToResend > 0 || busy}
                hitSlop={10}
                style={styles.resend}
                accessibilityRole="button"
                accessibilityState={{ disabled: secondsToResend > 0 || busy }}
                accessibilityLabel={
                  secondsToResend > 0
                    ? `Resend code in ${formatCountdown(secondsToResend)}`
                    : 'Resend code'
                }
              >
                <Text
                  style={[styles.resendText, secondsToResend > 0 && styles.resendTextWaiting]}
                >
                  {resending
                    ? 'Sending…'
                    : secondsToResend > 0
                      ? `Resend code in ${formatCountdown(secondsToResend)}`
                      : 'Resend code'}
                </Text>
              </Pressable>
            </Card>

            {!error && notice ? (
              <View style={styles.notice}>
                <AuthNotice tone="info">{notice}</AuthNotice>
              </View>
            ) : null}
          </>
        )}
      </Animated.View>
    </AuthScaffold>
  );
}

/**
 * What mock mode is allowed to claim. The flow was exercised; nobody was
 * authenticated. Saying so plainly is the whole point of the mode — the
 * alternative is a screen that looks like it signed someone in. Its two
 * actions are the pinned footer's (above).
 */
function MockComplete() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const surface = authSurface(colors, isDark);
  return (
    <>
      <Text style={[styles.eyebrow, { color: surface.accent }]}>MOCK MODE</Text>
      <Text style={styles.title} maxFontSizeMultiplier={1.5}>
        Verification flow passed
      </Text>
      <Text style={styles.subtitle}>
        Phone verification flow passed in mock mode. Real app access still requires
        email sign in until SMS is activated.
      </Text>
    </>
  );
}

/** The challenge is gone — a reload, a cancel, or a burned attempt limit.
 *  Its two actions are the pinned footer's (above). */
function StaleChallenge({ message }: { message: string | null }) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const surface = authSurface(colors, isDark);
  return (
    <>
      <Text style={[styles.eyebrow, { color: surface.accent }]}>START AGAIN</Text>
      <Text style={styles.title} maxFontSizeMultiplier={1.5}>
        That code request has ended
      </Text>
      <Text style={styles.subtitle}>
        {message ?? 'Request a new code from your phone number to carry on.'}
      </Text>
    </>
  );
}

/** The footer under its lead: the 12 gap and the quiet second — what goes
 *  under the keyboard when the main action lands on it. */
const BELOW_LEAD = authSpacing.md + authSizes.button;

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  // The sign-in family's measure (screens/SignInScreen.tsx): the same top
  // distance, eyebrow, serif headline, subtitle and card rhythm; the bottom
  // padding is the least air above the pinned footer on a short phone.
  body: {
    flexGrow: 1,
    paddingTop: authSpacing.sm,
    paddingBottom: authSpacing.xxl,
  },
  // Colour comes from surface.accent at render — emerald in light, gold in dark.
  eyebrow: {
    ...authType.heroEyebrow,
    marginTop: authSpacing.xl,
  },
  title: {
    ...authType.heroTitle,
    fontFamily: fonts.display,
    color: colors.ink,
    marginTop: authSpacing.sm,
  },
  subtitle: {
    ...authType.body,
    color: colors.textMuted,
    marginTop: authSpacing.sm,
  },
  devBanner: {
    width: '100%',
    marginTop: authSpacing.lg,
    padding: authSpacing.md,
    borderRadius: authRadius.field,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.gold,
    backgroundColor: colors.goldSoft,
    gap: 4,
  },
  devBannerLabel: {
    ...authType.badge,
    letterSpacing: 1,
    color: colors.eyebrowGold,
  },
  devBannerNote: {
    ...authType.note,
    color: colors.eyebrowGold,
  },
  card: {
    marginTop: authSpacing.xl,
    gap: authSpacing.md,
  },
  error: {
    ...authType.note,
    color: colors.danger,
  },
  notice: {
    marginTop: authSpacing.lg,
  },
  footer: {
    gap: authSpacing.md,
  },
  resend: {
    minHeight: 44,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  // Available: the reference's danger token, not the emerald used for every
  // other link on this surface. Resending is the one control here that
  // invalidates something — the code already sent — so it reads as a
  // correction rather than as the next step. The palette's `danger` is its own
  // restrained brick in both themes, not a signal red.
  resendText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.danger,
  },
  // Counting down: no colour at all, because there is nothing to act on yet.
  resendTextWaiting: {
    color: colors.textMuted,
  },
}),
);
