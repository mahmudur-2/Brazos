import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { secureSessionStorage } from './secureSessionStorage';

// The URL and the publishable key come from config/env.ts and nowhere else.
// That module parses the environment once and throws with the failing field
// named, which is why there is no missing-configuration check here any more:
// this file cannot be reached with either value absent or malformed.
export const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_KEY, {
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
