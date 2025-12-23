import { useEffect, useState } from 'react';
import { Redirect, Stack, useSegments } from 'expo-router';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import * as Font from 'expo-font';
import { ThemeProvider } from '@/lib/theme';
import { ErrorBoundary } from '@/lib/errorBoundary';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const segments = useSegments();

  useEffect(() => {
    async function loadFonts() {
      await Font.loadAsync({
        'CormorantGaramond-Light': require('../assets/fonts/Cormorant_Garamond/static/CormorantGaramond-Light.ttf'),
        'CormorantGaramond-Regular': require('../assets/fonts/Cormorant_Garamond/static/CormorantGaramond-Regular.ttf'),
        'CormorantGaramond-Medium': require('../assets/fonts/Cormorant_Garamond/static/CormorantGaramond-Medium.ttf'),
        'CormorantGaramond-SemiBold': require('../assets/fonts/Cormorant_Garamond/static/CormorantGaramond-SemiBold.ttf'),
        'CormorantGaramond-Bold': require('../assets/fonts/Cormorant_Garamond/static/CormorantGaramond-Bold.ttf'),
      });
      setFontsLoaded(true);
    }
    loadFonts();
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading || !fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  const inAuthGroup = segments[0] === '(auth)';

  // Usar Redirect ao invés de router.replace
  if (!session && !inAuthGroup) {
    return <Redirect href="/(auth)/login" />;
  }

  if (session && inAuthGroup) {
    return <Redirect href="/(tabs)/home" />;
  }

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
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
