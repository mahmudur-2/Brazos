import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '@env';
import { secureSessionStorage } from './secureSessionStorage';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    'Missing Supabase configuration. Create a .env file with SUPABASE_URL and ' +
      'SUPABASE_KEY (see .env.example).'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    // Persist the session in the device keychain so the user stays logged in
    // (lib/secureSessionStorage.ts; chunked SecureStore, dev-only fallback).
    storage: secureSessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    // React Native has no URL to parse the session from.
    detectSessionInUrl: false,
  },
});
