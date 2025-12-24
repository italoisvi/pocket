import { useEffect, useState } from 'react';
import { Redirect, Stack, useSegments } from 'expo-router';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import * as Font from 'expo-font';
import { ThemeProvider } from '@/lib/theme';
import { ErrorBoundary } from '@/lib/errorBoundary';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

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

export default Sentry.wrap(function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const segments = useSegments();

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
      .then(({ data: { session } }) => {
        console.log(
          '[RootLayout] Session retrieved:',
          session ? 'logged in' : 'not logged in'
        );
        setSession(session);
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
    } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('[RootLayout] Auth state changed:', _event);
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading || !fontsLoaded) {
    console.log(
      '[RootLayout] Showing loading screen. loading:',
      loading,
      'fontsLoaded:',
      fontsLoaded
    );
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#000" />
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

  // Usar Redirect ao invés de router.replace
  if (!session && !inAuthGroup) {
    console.log(
      '[RootLayout] Redirecting to login (no session, not in auth group)'
    );
    return <Redirect href="/(auth)/login" />;
  }

  if (session && inAuthGroup) {
    console.log(
      '[RootLayout] Redirecting to home (has session, in auth group)'
    );
    return <Redirect href="/(tabs)/home" />;
  }

  console.log('[RootLayout] Rendering Stack');

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            gestureEnabled: true,
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="index" />
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
        </Stack>
      </ThemeProvider>
    </ErrorBoundary>
  );
});

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});