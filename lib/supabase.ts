import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

// Função auxiliar para validação segura
function getEnvVar(key: string): string {
  const extra = Constants.expoConfig?.extra;

  if (!extra) {
    throw new Error(
      `❌ Constants.expoConfig.extra is undefined. Build configuration may be incorrect.`
    );
  }

  const value = extra[key];

  if (!value || typeof value !== 'string') {
    throw new Error(
      `❌ Environment variable "${key}" not found in app.config.js extra.\n` +
      `Available keys: ${Object.keys(extra).join(', ')}`
    );
  }

  return value;
}

// Validação robusta de credenciais
let supabaseUrl: string;
let supabaseAnonKey: string;

try {
  supabaseUrl = getEnvVar('supabaseUrl');
  supabaseAnonKey = getEnvVar('supabaseAnonKey');
} catch (error) {
  console.error('Supabase initialization error:', error);
  throw error;
}

// Criar cliente Supabase com configuração segura
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
