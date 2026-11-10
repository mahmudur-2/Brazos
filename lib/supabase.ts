import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { secureSessionStorage } from './secureSessionStorage';
import { withRequestTimeout } from './fetchTimeout';
import type { Database } from './supabaseTypes';

// The URL and the publishable key come from config/env.ts and nowhere else.
// That module parses the environment once and throws with the failing field
// named, which is why there is no missing-configuration check here any more:
// this file cannot be reached with either value absent or malformed.
//
// F7 (fix run, 2026-10-03): TYPED. Every .from() and .rpc() is checked against
// types/database.ts (regenerated with `npm run db:types`, local only, in the
// same commit as any migration that changes a table, view, enum or function
// signature), through lib/supabaseTypes.ts's one correction — a function
// argument also accepts null.
export const supabase = createClient<Database>(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_KEY, {
  auth: {
    // Persist the session in the device keychain so the user stays logged in
    // (lib/secureSessionStorage.ts; chunked SecureStore, dev-only fallback).
    storage: secureSessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    // React Native has no URL to parse the session from.
    detectSessionInUrl: false,
  },
  // A6: every REST / auth / function call ends after 15 s (storage transfers and the realtime
  // socket are exempt - lib/fetchTimeout.ts).
  global: { fetch: withRequestTimeout(fetch) },
});
