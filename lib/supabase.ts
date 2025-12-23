import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

// Acessar variáveis de ambiente via Constants.expoConfig.extra (funciona em builds release)
const extra = Constants.expoConfig?.extra ?? {};
const supabaseUrl = extra.supabaseUrl || '';
const supabaseAnonKey = extra.supabaseAnonKey || '';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '❌ Supabase credentials not found. Please check app.config.js extra configuration.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
