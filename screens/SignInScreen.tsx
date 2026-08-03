import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AuthButton } from '../components/AuthButton';
import { AuthNotice } from '../components/AuthNotice';
import { AuthScaffold } from '../components/AuthScaffold';
import { BrandLogo } from '../components/BrandLogo';
import { PhoneNumberInput } from '../components/PhoneNumberInput';
import { useAuth } from '../hooks/useAuth';
import { authSizes, authSpacing, authType, authColors } from '../lib/authTheme';
import { DEFAULT_COUNTRY, type Country } from '../lib/countries';
import type { AuthStackNavigation } from '../lib/navigation';
import { phoneValidationError } from '../lib/phoneNumber';

/**
 * Sign in — phone first.
 *
 * The product's intended credential is a phone number, so this is the screen
 * the flow lands on. BRAZOS does not have the backend for it yet: nothing in
 * the codebase requests a one-time code, there is no verify-phone route to send
 * anyone to, and no SMS provider is configured on the Supabase project. Rather
 * than fake a code screen that could never receive a code, `Continue` validates
 * the number for real and then says plainly that the text-message step is not
 * live, pointing at the path that is — email and password, one tap away on
 * EmailSignIn.
 *
 * That keeps this screen honest and non-blocking: nobody is stranded, and when
 * the SMS phase lands the only change here is what `handleContinue` does with
 * an already-validated number.
 */
export function SignInScreen() {
  const navigation = useNavigation<AuthStackNavigation>();
  const { bannedNotice } = useAuth();

  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [phoneDigits, setPhoneDigits] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [smsPending, setSmsPending] = useState(false);

  function handleContinue() {
    const nextPhoneError = phoneValidationError(country, phoneDigits);
    setPhoneError(nextPhoneError);
    // A real number gets the real answer; an incomplete one gets the field
    // error and nothing else, so the two messages can't stack up.
    setSmsPending(!nextPhoneError);
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
            country={country}
            onChangeCountry={setCountry}
            value={phoneDigits}
            onChangeValue={(digits) => {
              setPhoneDigits(digits);
              if (phoneError) setPhoneError(null);
              if (smsPending) setSmsPending(false);
            }}
            error={phoneError}
            returnKeyType="go"
            onSubmitEditing={handleContinue}
          />

          {smsPending ? (
            <AuthNotice tone="info">
              Sign-in by text message is not switched on yet. Use your email and
              password for now — it is the same account.
            </AuthNotice>
          ) : null}
        </View>

        <View style={styles.actions}>
          <AuthButton
            title="Continue"
            onPress={handleContinue}
            accessibilityHint="Continue with this phone number"
          />
          <AuthButton
            title="Use Email Instead"
            variant="ghost"
            onPress={() => navigation.navigate('EmailSignIn')}
            accessibilityHint="Sign in with your email address and password"
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
  // marginTop:'auto' — the extra height on a tall phone becomes space between
  // the field and the CTAs rather than a gap under them.
  actions: {
    marginTop: 'auto',
    paddingTop: authSpacing.xxl,
    gap: authSpacing.md,
  },
});
