import { useEffect, useState } from 'react';
import { Redirect, Stack, useSegments, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { StatusBar, Linking, Platform } from 'react-native';
import * as Font from 'expo-font';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { ErrorBoundary } from '@/lib/errorBoundary';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { AnimatedSplashScreen } from '@/components/AnimatedSplashScreen';
import {
  initializeRevenueCat,
  loginRevenueCat,
  logoutRevenueCat,
} from '@/lib/revenuecat';
import { BiometricLock } from '@/components/BiometricLock';
import { registerAgentWorker } from '@/lib/agent-worker';
import { VoiceProvider, useVoice } from '@/lib/voice-context';
import { FloatingVoiceButton } from '@/components/FloatingVoiceButton';
import { VoiceOverlay } from '@/components/VoiceOverlay';
import { usePremium } from '@/lib/usePremium';
import { PaywallModal } from '@/components/PaywallModal';

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

function VoiceComponents() {
  const { openOverlay, endConversation, state } = useVoice();

  return (
    <>
      <FloatingVoiceButton
        onPress={openOverlay}
        isMinimized={state.isMinimized}
        onEndConversation={endConversation}
      />
      <VoiceOverlay />
    </>
  );
}

function ThemedStack() {
  const { isDark } = useTheme();
  const [showAnimatedSplash, setShowAnimatedSplash] = useState(true);
  const [showPaywall, setShowPaywall] = useState(false);
  const { isPremium } = usePremium();
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
    <VoiceProvider
      isPremium={isPremium}
      onShowPaywall={() => setShowPaywall(true)}
    >
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
      <VoiceComponents />
      {showAnimatedSplash && (
        <AnimatedSplashScreen onComplete={() => setShowAnimatedSplash(false)} />
      )}
      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
      />
    </VoiceProvider>
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
          'DMSans-Light': require('../assets/fonts/DM_Sans/static/DMSans-Light.ttf'),
          'DMSans-Regular': require('../assets/fonts/DM_Sans/static/DMSans-Regular.ttf'),
          'DMSans-Medium': require('../assets/fonts/DM_Sans/static/DMSans-Medium.ttf'),
          'DMSans-SemiBold': require('../assets/fonts/DM_Sans/static/DMSans-SemiBold.ttf'),
          'DMSans-Bold': require('../assets/fonts/DM_Sans/static/DMSans-Bold.ttf'),
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
    return null;
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
