import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Web/SSR-safe storage: AsyncStorage uses `window` and breaks during static export.
const storage =
  typeof window !== 'undefined'
    ? AsyncStorage
    : {
        getItem: async () => null,
        setItem: async () => {},
        removeItem: async () => {},
      };

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export function setSupabaseLocationId(locationId: string | null) {
  if (locationId) {
    supabase.rest.setHeader('x-application-location-id', locationId);
  }
}
