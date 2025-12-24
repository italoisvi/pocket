import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';

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

console.log('[Supabase] Initializing Supabase client...');
console.log(
  '[Supabase] Constants.expoConfig?.extra:',
  JSON.stringify(Constants.expoConfig?.extra || {}, null, 2)
);

try {
  supabaseUrl = getEnvVar('supabaseUrl');
  supabaseAnonKey = getEnvVar('supabaseAnonKey');
  console.log('[Supabase] Environment variables loaded successfully');
  console.log('[Supabase] URL:', supabaseUrl?.substring(0, 20) + '...');
} catch (error) {
  console.error('[Supabase] Initialization error:', error);
  Sentry.captureException(error, {
    tags: {
      component: 'supabase-init',
    },
  });
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
