import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/config/env";

type CachedSession = string | null;

const STORAGE_KEY = "supabase.auth.token";

const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<CachedSession> => {
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string) => {
    await AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    await AsyncStorage.removeItem(key);
  },
};

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    storageKey: STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
