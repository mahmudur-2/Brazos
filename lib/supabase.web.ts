import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
const LOCAL_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const LOCAL_SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY;

type BrazosRuntimeConfig = {
  SUPABASE_KEY?: string;
  SUPABASE_URL?: string;
};

// Sites serves this object from /config.js. The values are publishable client
// configuration, never a Supabase service-role key.
const runtimeConfig = (
  globalThis as typeof globalThis & { __BRAZOS_CONFIG__?: BrazosRuntimeConfig }
).__BRAZOS_CONFIG__;
const supabaseUrl = runtimeConfig?.SUPABASE_URL || (__DEV__ ? LOCAL_SUPABASE_URL : undefined);
const supabaseKey = runtimeConfig?.SUPABASE_KEY || (__DEV__ ? LOCAL_SUPABASE_KEY : undefined);

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing hosted Supabase configuration for BRAZOS.');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
