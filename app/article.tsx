import { useState, useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { useTheme } from '@/lib/theme';
import { trackNewsReadComplete } from '@/lib/news-tracking';

// Article screen displays a news article inside the app using a WebView.
// It expects two query parameters: `url` (encoded URL of the article) and
// `title` (encoded title to use for the screen header).
export default function ArticleScreen() {
  const params = useLocalSearchParams<{
    url?: string | string[];
    title?: string | string[];
    source?: string | string[];
  }>();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const startTimeRef = useRef<number>(Date.now());
  const hasTrackedRef = useRef<boolean>(false);

  /**
   * Safely decode a potentially encoded URI component.  The Expo Router may
   * supply query params as strings or string arrays.  Invalid or partially
   * encoded values can throw a URIError when passed to decodeURIComponent.
   * This helper will attempt to decode the value and fall back to the
   * original string if decoding fails.  If the input is an array, the first
   * element is used.
   */
  function safeDecode(param?: string | string[]): string | undefined {
    if (!param) return undefined;
    const value = Array.isArray(param) ? param[0] : param;
    if (typeof value !== 'string') return undefined;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  // Extract and decode the URL and title from the query parameters.
  const pageURL = safeDecode(params.url);
  const pageTitle = safeDecode(params.title) || 'Notícia';
  const pageSource = safeDecode(params.source);

  // Track reading time when leaving the screen
  useEffect(() => {
    startTimeRef.current = Date.now();
    hasTrackedRef.current = false;

    return () => {
      // Only track if we have a URL and haven't tracked yet
      if (pageURL && !hasTrackedRef.current) {
        const timeSpentSeconds = Math.round(
          (Date.now() - startTimeRef.current) / 1000
        );
        // Only track if user spent more than 5 seconds (actually reading)
        if (timeSpentSeconds > 5) {
          hasTrackedRef.current = true;
          trackNewsReadComplete(
            pageURL,
            pageTitle,
            pageSource,
            timeSpentSeconds,
            100 // Assume full scroll since we can't easily track WebView scroll
          );
        }
      }
    };
  }, [pageURL, pageTitle, pageSource]);

  return (
    <>
      {/* Set the header title using Expo Router's Stack */}
      <Stack.Screen
        options={{ title: pageTitle, headerTintColor: theme.primary }}
      />
      <SafeAreaView style={styles.safeArea}>
        {/* Render the WebView directly as the first subview so that the sheet can
            detect scrolling and expand when scrolled to the edge. When no URL
            is provided, nothing will be rendered. */}
        {typeof pageURL === 'string' && pageURL.length > 0 && (
          <WebView
            source={{ uri: pageURL }}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            style={styles.webview}
          />
        )}
        {/* Show loading indicator while the page loads */}
        {loading && (
          <ActivityIndicator
            size="large"
            color={theme.primary}
            style={styles.loader}
          />
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  webview: {
    flex: 1,
  },
  loader: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -20,
    marginLeft: -20,
  },
});
