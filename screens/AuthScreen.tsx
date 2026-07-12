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

type Mode = 'login' | 'signup';

export function AuthScreen() {
  const { login, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const isLogin = mode === 'login';

  async function handleSubmit() {
    if (!email || !password) {
      await alertAsync('Missing details', 'Please enter your email and password.');
      return;
    }

    if (!isLogin && (!fullName.trim() || !phone.trim())) {
      await alertAsync('Missing details', 'Please enter your full name and phone number.');
      return;
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
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  placeholder="(555) 123-4567"
                />
              </>
            )}
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
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
    backgroundColor: '#f9fafb',
  },
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 32,
  },
  form: {
    gap: 16,
  },
  switch: {
    marginTop: 24,
    alignItems: 'center',
  },
  switchText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '500',
  },
});
