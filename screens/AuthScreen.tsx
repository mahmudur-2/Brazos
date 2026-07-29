import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { useAuth } from '../hooks/useAuth';
import { alertAsync } from '../lib/dialog';
import { isValidEmail, isValidPhone } from '../lib/validation';
import { colors, spacing } from '../lib/theme';

type Mode = 'login' | 'signup';

export function AuthScreen() {
  const { login, signUp, bannedNotice } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const isLogin = mode === 'login';

  function handleEmailChange(next: string) {
    setEmail(next);
    if (emailError) setEmailError(null);
  }

  function handlePhoneChange(next: string) {
    setPhone(next);
    if (phoneError) setPhoneError(null);
  }

  async function handleSubmit() {
    setEmailError(null);
    setPhoneError(null);

    if (!email || !password) {
      await alertAsync('Missing details', 'Please enter your email and password.');
      return;
    }

    if (!isValidEmail(email)) {
      setEmailError('Enter a valid email address.');
      return;
    }

    if (!isLogin) {
      if (!fullName.trim() || !phone.trim()) {
        await alertAsync('Missing details', 'Please enter your full name and phone number.');
        return;
      }
      if (!isValidPhone(phone)) {
        setPhoneError('Enter a valid phone number.');
        return;
      }
    }

    setLoading(true);
    const { error } = isLogin
      ? await login(email, password)
      : await signUp(email, password, fullName.trim(), phone.trim());
    setLoading(false);

    if (error) {
      await alertAsync(isLogin ? 'Login failed' : 'Sign up failed', error.message);
      return;
    }

    if (!isLogin) {
      await alertAsync(
        'Check your email',
        'If email confirmation is enabled, confirm your address to finish signing up.'
      );
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <Text style={styles.title}>brazos</Text>
          <Text style={styles.subtitle}>
            {isLogin ? 'Welcome back' : 'Create your account'}
          </Text>

          {bannedNotice && (
            <Text style={styles.bannedNotice}>
              This account has been suspended for violating the Brazos community
              rules. Contact support if you think this is a mistake.
            </Text>
          )}

          <View style={styles.form}>
            {!isLogin && (
              <>
                <TextField
                  label="Full name"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  autoComplete="name"
                  placeholder="Carlos Reyes"
                />
                <TextField
                  label="Phone number"
                  value={phone}
                  onChangeText={handlePhoneChange}
                  error={phoneError}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  placeholder="(555) 123-4567"
                />
              </>
            )}
            <TextField
              label="Email"
              value={email}
              onChangeText={handleEmailChange}
              error={emailError}
              keyboardType="email-address"
              autoComplete="email"
              placeholder="you@example.com"
            />
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
            />
            <Button
              title={isLogin ? 'Log in' : 'Sign up'}
              onPress={handleSubmit}
              loading={loading}
            />
          </View>

          <Pressable
            onPress={() => setMode(isLogin ? 'signup' : 'login')}
            style={styles.switch}
          >
            <Text style={styles.switchText}>
              {isLogin
                ? "Don't have an account? Sign up"
                : 'Already have an account? Log in'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.xl + spacing.xs,
  },
  bannedNotice: {
    fontSize: 13,
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
    lineHeight: 18,
    textAlign: 'center',
  },
  form: {
    gap: spacing.lg,
  },
  switch: {
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  switchText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
});
