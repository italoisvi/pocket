import { useEffect, useState } from 'react';
import { Redirect, Stack, useSegments, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import {
  View,
  StyleSheet,
  StatusBar,
  useColorScheme,
  Linking,
  Platform,
} from 'react-native';
import * as Font from 'expo-font';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { ErrorBoundary } from '@/lib/errorBoundary';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { AnimatedSplashScreen } from '@/components/AnimatedSplashScreen';
import { LoadingKangaroo } from '@/components/LoadingKangaroo';
import {
  initializeRevenueCat,
  loginRevenueCat,
  logoutRevenueCat,
} from '@/lib/revenuecat';
import { BiometricLock } from '@/components/BiometricLock';
import { registerAgentWorker } from '@/lib/agent-worker';

// Initialize Sentry
const sentryDsn = Constants.expoConfig?.extra?.sentryDsn;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    debug: __DEV__, // Enable debug mode in development
    tracesSampleRate: 1.0, // Capture 100% of transactions for performance monitoring
    enableAutoSessionTracking: true,
    sessionTrackingIntervalMillis: 10000,
    enableNative: true,
    enableNativeCrashHandling: true,
    attachScreenshot: true,
    attachViewHierarchy: true,
  });
  console.log('[Sentry] Initialized successfully');
} else {
  console.warn('[Sentry] DSN not found, Sentry will not be initialized');
}

// Initialize RevenueCat
try {
  initializeRevenueCat();
} catch (error) {
  console.error('[RootLayout] RevenueCat initialization failed:', error);
}

function ThemedStack() {
  const { isDark } = useTheme();
  const [showAnimatedSplash, setShowAnimatedSplash] = useState(true);
  const router = useRouter();

  // Handle deep linking for password reset
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      const url = event.url;
      console.log('[DeepLink] Received URL:', url);

      // Verifica se é um link de reset de senha
      if (url.includes('reset-password')) {
        try {
          // Formato: pocket://reset-password?tokens=access_token=...&refresh_token=...&type=recovery
          const urlObj = new URL(url);
          const tokensParam = urlObj.searchParams.get('tokens');

          if (tokensParam) {
            // Decodificar e parsear os tokens
            const decodedTokens = decodeURIComponent(tokensParam);
            const tokenParams = new URLSearchParams(decodedTokens);

            const accessToken = tokenParams.get('access_token');
            const refreshToken = tokenParams.get('refresh_token');
            const type = tokenParams.get('type');

            console.log(
              '[DeepLink] Access Token:',
              accessToken ? 'presente' : 'ausente'
            );
            console.log(
              '[DeepLink] Refresh Token:',
              refreshToken ? 'presente' : 'ausente'
            );
            console.log('[DeepLink] Type:', type);

            if (accessToken && refreshToken && type === 'recovery') {
              // Definir sessão com os tokens de recuperação
              const { error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });

              if (!error) {
                console.log('[DeepLink] Session set successfully');
                // Aguardar um pouco para garantir que a sessão foi definida
                setTimeout(() => {
                  router.replace('/(auth)/reset-password');
                }, 100);
              } else {
                console.error('[DeepLink] Error setting session:', error);
              }
            }
          }
        } catch (error) {
          console.error('[DeepLink] Error parsing deep link:', error);
        }
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Verificar se o app foi aberto com um deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [router]);

  // Update status bar whenever theme changes
  useEffect(() => {
    StatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content', true);
  }, [isDark]);

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          gestureEnabled: true,
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(auth)" options={{ gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
        <Stack.Screen name="index" options={{ gestureEnabled: false }} />
        <Stack.Screen name="expense/[id]" />
        <Stack.Screen
          name="financial-overview"
          options={{
            gestureEnabled: true,
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="custos-fixos"
          options={{
            gestureEnabled: true,
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="custos-variaveis"
          options={{
            gestureEnabled: true,
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="graficos-tabelas"
          options={{
            gestureEnabled: true,
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="subscription"
          options={{
            gestureEnabled: true,
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="customer-center"
          options={{
            gestureEnabled: true,
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="onboarding-paywall"
          options={{
            gestureEnabled: false,
            animation: 'fade',
          }}
        />
      </Stack>
      {showAnimatedSplash && (
        <AnimatedSplashScreen onComplete={() => setShowAnimatedSplash(false)} />
      )}
    </>
  );
}

function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    async function loadFonts() {
      console.log('[RootLayout] Starting font loading...');
      try {
        await Font.loadAsync({
          'CormorantGaramond-Light': require('../assets/fonts/Cormorant_Garamond/static/CormorantGaramond-Light.ttf'),
          'CormorantGaramond-Regular': require('../assets/fonts/Cormorant_Garamond/static/CormorantGaramond-Regular.ttf'),
          'CormorantGaramond-Medium': require('../assets/fonts/Cormorant_Garamond/static/CormorantGaramond-Medium.ttf'),
          'CormorantGaramond-SemiBold': require('../assets/fonts/Cormorant_Garamond/static/CormorantGaramond-SemiBold.ttf'),
          'CormorantGaramond-Bold': require('../assets/fonts/Cormorant_Garamond/static/CormorantGaramond-Bold.ttf'),
        });
        console.log('[RootLayout] Fonts loaded successfully');
      } catch (error) {
        console.error('[RootLayout] Font loading error:', error);
      } finally {
        setFontsLoaded(true);
        console.log('[RootLayout] fontsLoaded set to true');
      }
    }
    loadFonts();
  }, []);

  useEffect(() => {
    console.log('[RootLayout] Starting auth session check...');
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        console.log(
          '[RootLayout] Session retrieved:',
          session ? 'logged in' : 'not logged in'
        );
        setSession(session);

        // Identificar usuário no RevenueCat se já estiver logado
        if (session?.user?.id) {
          try {
            await loginRevenueCat(session.user.id);
            console.log('[RootLayout] RevenueCat user identified on app start');
          } catch (error) {
            console.error(
              '[RootLayout] Error identifying RevenueCat user on start:',
              error
            );
          }
        }
      })
      .catch((error) => {
        console.error('[RootLayout] Auth session error:', error);
        setSession(null);
      })
      .finally(() => {
        setLoading(false);
        console.log('[RootLayout] loading set to false');
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log('[RootLayout] Auth state changed:', _event);
      setSession(session);

      // Sincronizar com RevenueCat quando estado de auth mudar
      if (_event === 'SIGNED_IN' && session?.user?.id) {
        try {
          await loginRevenueCat(session.user.id);
          console.log('[RootLayout] RevenueCat user identified after login');
        } catch (error) {
          console.error(
            '[RootLayout] Error identifying RevenueCat user:',
            error
          );
        }
      } else if (_event === 'SIGNED_OUT') {
        try {
          await logoutRevenueCat();
          console.log('[RootLayout] RevenueCat user logged out');
        } catch (error) {
          console.error('[RootLayout] Error logging out RevenueCat:', error);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Redirect logic: logged in users should not be in (auth) group
  useEffect(() => {
    if (loading || !fontsLoaded) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (session && inAuthGroup) {
      console.log('[RootLayout] Redirecting logged-in user from auth to home');
      router.replace('/(tabs)/home');
    } else if (!session && !inAuthGroup && segments.length > 0) {
      console.log('[RootLayout] Redirecting logged-out user to login');
      router.replace('/(auth)/login');
    }
  }, [session, segments, loading, fontsLoaded, router]);

  // Register background worker for proactive agent checks
  useEffect(() => {
    if (session && Platform.OS !== 'web') {
      registerAgentWorker().then((success) => {
        console.log(
          '[RootLayout] Agent worker registration:',
          success ? 'success' : 'failed'
        );
      });
    }
  }, [session]);

  if (loading || !fontsLoaded) {
    console.log(
      '[RootLayout] Showing loading screen. loading:',
      loading,
      'fontsLoaded:',
      fontsLoaded
    );
    return (
      <View style={styles.loadingContainer}>
        <LoadingKangaroo size={80} />
      </View>
    );
  }

  const inAuthGroup = segments[0] === '(auth)';
  console.log(
    '[RootLayout] Rendering main layout. session:',
    !!session,
    'inAuthGroup:',
    inAuthGroup,
    'segments:',
    segments
  );

  console.log('[RootLayout] Rendering Stack');

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BiometricLock>
          <ThemedStack />
        </BiometricLock>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default RootLayout;

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
